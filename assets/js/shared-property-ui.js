(function () {
    let reservationContext = null;
    let reservationId = null;
    let reviewContext = null;
    let wired = false;

    const byId = (id) => document.getElementById(id);
    const apiEndpoint = (path) => {
        if (typeof window.apiUrl === 'function') return window.apiUrl(path);
        if (typeof API_URL === 'function') return API_URL(path);
        const base = String(window.BASE_URL || '').replace(/\/$/, '');
        return `${base}/api${path}`;
    };
    const escapeHtml = (value) => String(value ?? '').replace(/[&<>'"]/g, (character) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#039;', '"': '&quot;'
    })[character]);

    async function request(url, options = {}) {
        const response = await fetch(url, options);
        const data = await response.json().catch(() => ({}));
        if (!response.ok || data.success === false) {
            throw new Error(data.message || 'Unable to complete the request.');
        }
        return data;
    }

    const POPUP_MODAL_IDS = ['sharedPropertyBookingModal', 'propertyInterestedModal', 'propertyReviewsModal', 'propertyAddReviewModal'];

    function showModal(id) {
        const element = byId(id);
        if (!element) return null;
        // Only one shared-property popup should ever be visible at a time,
        // otherwise rapid clicks across the hover action icons stack modals.
        POPUP_MODAL_IDS.forEach((otherId) => {
            if (otherId === id) return;
            const other = byId(otherId);
            if (other) bootstrap.Modal.getInstance(other)?.hide();
        });
        const modal = bootstrap.Modal.getOrCreateInstance(element);
        modal.show();
        return modal;
    }

    function resetReservation() {
        const form = byId('sharedPropertyBookingForm');
        form?.reset();
        reservationId = null;
        byId('sharedBookingStage')?.classList.remove('d-none');
        byId('sharedReviewStage')?.classList.add('d-none');
        const submit = byId('sharedBookingSubmit');
        if (submit) submit.innerHTML = '<i class="bi bi-check-lg"></i> Reserve';
        document.querySelectorAll('input[name="review_rating"]').forEach((input) => { input.checked = false; input.required = false; });
        const comments = form?.elements.review_comments;
        if (comments) comments.required = false;
    }

    function ensureWired() {
        if (wired) return;
        wired = true;

        byId('sharedPropertyBookingForm')?.addEventListener('submit', submitReservation);
        document.querySelector('#sharedPropertyBookingForm [name="mobile"]')?.addEventListener('input', (event) => {
            event.target.value = event.target.value.replace(/\D/g, '').slice(0, 10);
        });
        byId('propertyStandaloneReviewForm')?.addEventListener('submit', submitStandaloneReview);
    }

    async function submitReservation(event) {
        event.preventDefault();
        if (!reservationContext) return;
        const form = event.currentTarget;

        const inReviewStage = !byId('sharedReviewStage')?.classList.contains('d-none');

        try {
            if (!inReviewStage) {
                const formData = new FormData(form);
                const data = await request(apiEndpoint('/enquiries'), {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        project_layout_id: reservationContext.layout.id,
                        plot_id: reservationContext.property.id,
                        plot_number: reservationContext.property.plot_number,
                        full_name: formData.get('full_name'),
                        mobile: formData.get('mobile'),
                        email: formData.get('email'),
                        city: formData.get('city'),
                        budget_range: formData.get('budget_range'),
                        appointment_datetime: formData.get('appointment_datetime'),
                        message: formData.get('note'),
                        source: `${reservationContext.type}_reservation`,
                        reserve_inventory: true,
                        referral_code: new URLSearchParams(window.location.search).get('ref') || ''
                    })
                });
                reservationId = data.data?.id || data.id || null;
                byId('sharedBookingStage')?.classList.add('d-none');
                byId('sharedReviewStage')?.classList.remove('d-none');
                form.elements.review_comments.required = true;
                document.querySelectorAll('input[name="review_rating"]').forEach((input) => { input.required = true; });
                byId('sharedBookingSubmit').innerHTML = '<i class="bi bi-send-check"></i> Submit Review';
                // The plot is already reserved server-side at this point. Refresh
                // the page's plot/inventory data now rather than waiting for the
                // optional review step below, so a customer who registers a lead
                // and closes the modal without reviewing still leaves the plot
                // list showing the up-to-date status and interest count.
                reservationContext.onComplete?.();
                return;
            }

            const formData = new FormData(form);
            await request(apiEndpoint('/reviews'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    enquiry_id: reservationId,
                    project_layout_id: reservationContext.layout.id,
                    plot_id: reservationContext.property.id,
                    customer_name: formData.get('full_name'),
                    rating: Number(formData.get('review_rating')),
                    comments: formData.get('review_comments')
                })
            });

            bootstrap.Modal.getInstance(byId('sharedPropertyBookingModal'))?.hide();
            window.AppPopup?.success('Reservation and review submitted successfully.');
            reservationContext.onComplete?.();
            resetReservation();
        } catch (error) {
            window.AppPopup?.error(error.message);
        }
    }

    async function submitStandaloneReview(event) {
        event.preventDefault();
        if (!reviewContext) return;
        const form = event.currentTarget;
        const formData = new FormData(form);
        try {
            await request(apiEndpoint('/reviews'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    project_layout_id: reviewContext.layout?.id || null,
                    plot_id: reviewContext.property?.id || null,
                    customer_name: formData.get('customer_name'),
                    rating: Number(formData.get('rating')),
                    comments: formData.get('comments')
                })
            });
            bootstrap.Modal.getInstance(byId('propertyAddReviewModal'))?.hide();
            form.reset();
            window.AppPopup?.success('Thank you. Your review was added.');
            reviewContext.onComplete?.();
        } catch (error) {
            window.AppPopup?.error(error.message);
        }
    }

    function open({ property, layout, type = 'property', onComplete = null }) {
        ensureWired();
        reservationContext = { property, layout, type, onComplete };
        resetReservation();
        byId('sharedBookingTitle').textContent = `Reserve ${property.plot_number || property.title || property.name || 'Property'}`;
        byId('sharedBookingSubtitle').textContent = layout?.title || layout?.name || layout?.location_name || '';
        const form = byId('sharedPropertyBookingForm');
        if (form) {
            form.elements.plot_id.value = property.id || '';
            form.elements.plot_number.value = property.plot_number || property.title || '';
        }
        showModal('sharedPropertyBookingModal');
    }

    async function interests(property, label = 'Property') {
        ensureWired();
        const interestedCount = Number(property?.total_members) || 0;
        if (interestedCount <= 0) {
            window.AppPopup?.show('No customers have registered interest in this property yet.', 'No interested buyers');
            return;
        }
        const list = byId('propertyInterestedList');
        if (!list) return;
        byId('propertyInterestedTitle').textContent = `${label} — Interested Customers`;
        list.innerHTML = '<div class="text-center py-4"><div class="spinner-border text-primary"></div></div>';
        showModal('propertyInterestedModal');
        try {
            const data = await request(`${apiEndpoint('/enquiries')}?plot_id=${encodeURIComponent(property.id)}`);
            const rows = data.data || [];
            list.innerHTML = rows.length ? rows.map((person) => `
                <div class="interested-person border rounded-3 p-3 mb-2">
                    <div class="fw-semibold"><i class="bi bi-person-circle me-2 text-primary"></i>${escapeHtml(person.name || 'Customer')}</div>
                    ${person.rating ? `<div class="small text-warning mt-1">${'★'.repeat(Number(person.rating) || 0)}${'☆'.repeat(5 - (Number(person.rating) || 0))}</div>` : ''}
                    ${person.comments ? `<div class="small text-muted mt-1">${escapeHtml(person.comments)}</div>` : ''}
                </div>`).join('') : '<div class="text-center text-muted py-4">No interested customers yet.</div>';
        } catch (error) {
            list.innerHTML = `<div class="alert alert-danger">${escapeHtml(error.message)}</div>`;
        }
    }

    async function reviews(property = null, layout = null, label = 'Property') {
        ensureWired();
        const list = byId('propertyReviewsList');
        if (!list) return;
        byId('propertyReviewsTitle').textContent = `${label} — Customer Reviews`;
        list.innerHTML = '<div class="text-center py-4"><div class="spinner-border text-primary"></div></div>';
        showModal('propertyReviewsModal');
        try {
            const query = property?.id
                ? `plot_id=${encodeURIComponent(property.id)}`
                : `project_layout_id=${encodeURIComponent(layout?.id || '')}`;
            const data = await request(`${apiEndpoint('/reviews')}?${query}`);
            const rows = data.data || [];
            list.innerHTML = rows.length ? rows.map((review) => `
                <div class="border rounded-3 p-3 mb-3">
                    <div class="d-flex justify-content-between gap-3">
                        <strong>${escapeHtml(review.customer_name || 'Customer')}</strong>
                        <span class="text-warning text-nowrap">${'★'.repeat(Number(review.rating) || 0)}${'☆'.repeat(5 - (Number(review.rating) || 0))}</span>
                    </div>
                    <div class="text-muted mt-2">${escapeHtml(review.comments || '')}</div>
                </div>`).join('') : '<div class="text-center text-muted py-4">No customer reviews yet.</div>';
        } catch (error) {
            list.innerHTML = `<div class="alert alert-danger">${escapeHtml(error.message)}</div>`;
        }
    }

    function addReview(property = null, layout = null, label = 'Property', onComplete = null) {
        ensureWired();
        reviewContext = { property, layout, onComplete };
        byId('propertyStandaloneReviewForm')?.reset();
        byId('propertyAddReviewTitle').textContent = `Review ${label}`;
        showModal('propertyAddReviewModal');
    }

    // Full-image lightbox for gallery/event thumbnails. Built on demand so
    // pages that never open it (e.g. no gallery images yet) pay no cost, and
    // shared across every page that loads this script rather than each page
    // reimplementing its own popup.
    let lightbox = null;

    function ensureLightbox() {
        if (lightbox) return lightbox;
        const overlay = document.createElement('div');
        overlay.className = 'shared-image-lightbox';
        overlay.innerHTML = `
            <button type="button" class="shared-image-lightbox-close" aria-label="Close image"><i class="bi bi-x-lg"></i></button>
            <figure class="shared-image-lightbox-figure">
                <img class="shared-image-lightbox-img" alt="">
                <figcaption class="shared-image-lightbox-caption"></figcaption>
            </figure>`;
        overlay.addEventListener('click', (event) => {
            if (event.target === overlay) closeImage();
        });
        overlay.querySelector('.shared-image-lightbox-close').addEventListener('click', closeImage);
        document.body.appendChild(overlay);
        lightbox = overlay;
        return overlay;
    }

    function onLightboxKeydown(event) {
        if (event.key === 'Escape') closeImage();
    }

    function image(src, caption = '') {
        if (!src) return;
        const overlay = ensureLightbox();
        overlay.querySelector('.shared-image-lightbox-img').src = src;
        overlay.querySelector('.shared-image-lightbox-img').alt = caption;
        overlay.querySelector('.shared-image-lightbox-caption').textContent = caption;
        overlay.classList.add('is-visible');
        document.body.classList.add('shared-lightbox-open');
        document.addEventListener('keydown', onLightboxKeydown);
    }

    function closeImage() {
        if (!lightbox) return;
        lightbox.classList.remove('is-visible');
        document.body.classList.remove('shared-lightbox-open');
        document.removeEventListener('keydown', onLightboxKeydown);
    }

    // Delegated so any current or future thumbnail just needs
    // data-lightbox-src (and optionally data-lightbox-caption) to be
    // clickable - no per-page wiring required.
    document.addEventListener('click', (event) => {
        const trigger = event.target.closest('[data-lightbox-src]');
        if (!trigger) return;
        image(trigger.dataset.lightboxSrc, trigger.dataset.lightboxCaption || trigger.alt || '');
    });

    window.SharedPropertyUI = { open, interests, reviews, addReview, image };
})();
