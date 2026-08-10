let plots = [];
let originalPlots = [];

let selectedPlot = null;

let currentScale = 1;

let mapLayer = null;

let projectLayouts = [];
let selectedLayout = null;
let pendingInterestPlot = null;
let selectedLayoutType = '';
let selectedPropertyType = 'Open Plot';
let propertyCategoryById = new Map();
let reviewContext = { mandatory: false, enquiryId: null };
let pendingReviewNavigation = null;
let activePlotActionGroup = null;
let plotActionOverlay = null;
let overlayPlot = null;
let overlayPlotElement = null;
let searchPlotDebounceTimer = null;
let searchHighlightTimer = null;

function getLayoutDisplayName(layout, fallbackIndex = 0) {
    const title = String(layout?.title || layout?.layout_name || layout?.location_name || layout?.name || '').trim();
    return title || layout?.layout_key || layout?.slug || `Layout ${fallbackIndex + 1}`;
}

function collapsePlotActions() {
    activePlotActionGroup?.classList.remove('is-visible');
    activePlotActionGroup = null;
}

function ensurePlotActionOverlay() {
    if (plotActionOverlay) return plotActionOverlay;
    plotActionOverlay = document.createElement('div');
    plotActionOverlay.className = 'open-plot-action-overlay';
    plotActionOverlay.setAttribute('aria-label', 'Plot actions');
    plotActionOverlay.addEventListener('click', event => {
        const button = event.target.closest('[data-open-plot-action]');
        if (!button) return;
        const currentPlot = overlayPlot || selectedPlot;
        if (!currentPlot || !window.SharedPropertyUI) return;
        event.preventDefault();
        event.stopPropagation();
        hidePlotActionOverlay();
        const label = `Plot ${currentPlot.plot_number}`;
        const action = button.dataset.openPlotAction;
        if (action === 'interest') window.SharedPropertyUI.interests(currentPlot, label);
        if (action === 'reviews') window.SharedPropertyUI.reviews(currentPlot, selectedLayout, label);
        if (action === 'add-review') window.SharedPropertyUI.addReview(currentPlot, selectedLayout, label, loadPlots);
    });
    plotActionOverlay.addEventListener('mouseleave', event => {
        if (event.relatedTarget === overlayPlotElement) return;
        hidePlotActionOverlay();
    });
    document.body.appendChild(plotActionOverlay);
    return plotActionOverlay;
}

function hidePlotActionOverlay() {
    plotActionOverlay?.classList.remove('is-visible');
    overlayPlot = null;
    overlayPlotElement = null;
}

function addPlotHtmlActions(plot, svgPlot) {
    svgPlot.addEventListener('mouseenter', () => {
        const overlay = ensurePlotActionOverlay();
        const rect = svgPlot.getBoundingClientRect();
        const scale = Math.max(.62, Math.min(1, rect.width / 72, rect.height / 72));
        overlayPlot = plot;
        overlayPlotElement = svgPlot;
        overlay.innerHTML = `<button type="button" data-open-plot-action="reviews" title="View reviews"><i class="bi bi-eye-fill"></i><span>${Number(plot.review_count) || 0}</span></button><button type="button" data-open-plot-action="add-review" title="Add review"><i class="bi bi-star-fill"></i></button><button type="button" data-open-plot-action="interest" title="Interested customers"><i class="bi bi-people-fill"></i><span>${Number(plot.total_members) || 0}</span></button>`;
        overlay.style.left = `${Math.max(2, rect.right - 68 * scale)}px`;
        overlay.style.top = `${Math.max(2, rect.top + 2)}px`;
        overlay.style.transform = `scale(${scale})`;
        overlay.classList.add('is-visible');
    });
    svgPlot.addEventListener('mouseleave', event => {
        if (plotActionOverlay?.contains(event.relatedTarget)) return;
        hidePlotActionOverlay();
    });
}

document.addEventListener(
    'DOMContentLoaded',
    async () => {
        console.log('DOMContentLoaded - BASE_URL:', BASE_URL);
        console.log('API_URL(/plots):', API_URL('/plots'));
        console.log('ASSET_URL(/assets/images/kubera_layout.svg):', ASSET_URL('/assets/images/kubera_layout.svg'));
        
        await loadCategories();
        await loadLayouts();
        await loadPlots();
        initializeEvents();
    }
);

function initializeEvents() {

    document.addEventListener('pointerover', event => {
        const target = event.target;
        if (!(target instanceof Element) || !target.closest('.plot, .plot-compact-actions, .open-plot-action-overlay')) {
            collapsePlotActions();
            hidePlotActionOverlay();
        }
    });

    document
        .getElementById('layoutSelect')
        ?.addEventListener('change', changeLayout);

    document.getElementById('propertyTypeTabs')?.addEventListener('click', event => {
        const button = event.target.closest('[data-layout-type]');
        if (!button) return;
        const type = propertyCategoryById.get(String(button.dataset.layoutType)) || '';
        if (type.toLowerCase() === 'villa') { window.location.assign(`${BASE_URL}/villas`); return; }
        if (type.toLowerCase() === 'construction') { window.location.assign(`${BASE_URL}/construction-plots`); return; }
        window.location.assign(`${BASE_URL}/layout-map?type=open-plot`);
    });

    document
        .querySelectorAll('.filter-btn')
        .forEach(btn =>
            btn.addEventListener(
                'click',
                filterPlots
            )
        );

    // document
    //     .getElementById('searchPlot')
    //     ?.addEventListener(
    //         'keydown',
    //         event => {
    //             if (event.key === 'Enter') {
    //                 event.preventDefault();
    //                 window.clearTimeout(searchPlotDebounceTimer);
    //                 searchPlot(event);
    //             }
    //         }
    //     );

    // document
    //     .getElementById('searchPlot')
    //     ?.addEventListener(
    //         'input',
    //         event => {
    //             // Search live as the customer types instead of waiting for
    //             // Enter or the search button, with a short debounce so we
    //             // are not searching on every single keystroke.
    //             window.clearTimeout(searchPlotDebounceTimer);
    //             const value = event.target.value.trim();
    //             if (!value) {
    //                 clearPlotSelection();
    //                 showSearchFeedback('Enter a plot number to search the layout.', 'info');
    //                 return;
    //             }
    //             searchPlotDebounceTimer = window.setTimeout(() => searchPlot(event), 250);
    //         }
    //     );

    document
        .getElementById('searchPlotButton')
        ?.addEventListener(
            'click',
            searchPlot
        );

    // Zoom controls are currently disabled in the layout template.
    // document.getElementById('zoomIn')?.addEventListener('click', zoomIn);
    // document.getElementById('zoomOut')?.addEventListener('click', zoomOut);

    document
        .getElementById('bookingForm')
        ?.addEventListener(
            'submit',
            submitBooking
        );

    const mobileInput = document.querySelector('#bookingForm [name="mobile"]');
    mobileInput?.addEventListener('input', () => {
        mobileInput.value = mobileInput.value.replace(/\D/g, '').slice(0, 10);
    });

    const budgetInput = document.querySelector('#bookingForm [name="budget_range"]');
    budgetInput?.addEventListener('input', () => {
        budgetInput.value = budgetInput.value
            .replace(/[^\d.KLkl]/g, '')
            .toUpperCase();
    });

    const appointmentInput = document.querySelector('#bookingForm [name="appointment_datetime"]');
    if (appointmentInput) {
        const minimumDate = new Date(Date.now() + 60 * 1000);
        minimumDate.setMinutes(
            minimumDate.getMinutes() - minimumDate.getTimezoneOffset()
        );
        appointmentInput.min = minimumDate
            .toISOString()
            .slice(0, 16);
    }

    document
        .getElementById('confirmInterestButton')
        ?.addEventListener('click', registerInterestFromConfirmation);

    document.getElementById('layoutMapLink')?.addEventListener('click', showProjectLocation);
    document.getElementById('layoutVideoLink')?.addEventListener('click', showProjectVideo);
    document.getElementById('projectLocationModal')?.addEventListener('hidden.bs.modal', () => {
        document.getElementById('projectLocationMap')?.replaceChildren();
    });
    document.getElementById('projectVideoModal')?.addEventListener('hidden.bs.modal', () => {
        document.getElementById('projectVideoPlayer')?.replaceChildren();
    });

    document.addEventListener('click', event => {
        const prevButton = event.target.closest('[data-carousel-prev]');
        const nextButton = event.target.closest('[data-carousel-next]');
        if (prevButton) moveHighlightCarousel(prevButton.closest('.highlight-carousel'), -1);
        if (nextButton) moveHighlightCarousel(nextButton.closest('.highlight-carousel'), 1);
    });
}

function openReviewForm({ mandatory = false, enquiryId = null, customerName = '' } = {}) {
    const modalElement = document.getElementById('reviewModal');
    const form = document.getElementById('reviewForm');
    if (!modalElement || !form) return;
    reviewContext = { mandatory, enquiryId };
    form.reset();
    form.classList.remove('was-validated');
    form.elements.customer_name.value = customerName;
    document.getElementById('reviewPrompt').textContent = mandatory
        ? 'Your reservation is complete. Please submit this required review to continue.'
        : 'Your feedback helps other customers make a confident choice.';
    modalElement.querySelectorAll('.review-close').forEach(button => button.classList.toggle('d-none', mandatory));
    bootstrap.Modal.getInstance(modalElement)?.dispose();
    new bootstrap.Modal(modalElement, {
        backdrop: mandatory ? 'static' : true,
        keyboard: !mandatory
    }).show();
}

async function submitReview(event) {
    event.preventDefault();
    const form = event.currentTarget;
    if (!form.checkValidity()) { form.classList.add('was-validated'); return; }
    const submit = form.querySelector('[type="submit"]');
    submit.disabled = true;
    const data = new FormData(form);
    try {
        const response = await fetch(API_URL('/reviews'), {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                customer_name: data.get('customer_name'), rating: Number(data.get('rating')),
                comments: data.get('comments'), enquiry_id: reviewContext.enquiryId,
                project_layout_id: selectedLayout?.id || null
            })
        });
        const result = await response.json();
        if (!response.ok || result.error) throw new Error(result.error || 'Unable to submit review.');
        await loadReviewCount();
        reviewContext = { mandatory: false, enquiryId: null };
        bootstrap.Modal.getInstance(document.getElementById('reviewModal'))?.hide();
        await AppPopup.success('Thank you for sharing your review.');
        if (pendingReviewNavigation) continueReviewNavigation();
    } catch (error) {
        AppPopup.error(error.message, 'Review not submitted');
    } finally { submit.disabled = false; }
}

function continueReviewNavigation() {
    const target = pendingReviewNavigation;
    pendingReviewNavigation = null;
    if (target) window.location.assign(target);
}

function offerReviewBeforeNavigation(event) {
    const link = event.target.closest('a[href]');
    if (!link || event.defaultPrevented || link.target === '_blank' || link.hasAttribute('download')) return;
    const url = new URL(link.href, window.location.href);
    if (url.origin !== window.location.origin || url.href === window.location.href || url.hash && url.pathname === window.location.pathname) return;
    if (reviewContext.mandatory) { event.preventDefault(); return; }
    event.preventDefault();
    pendingReviewNavigation = url.href;
    openReviewForm();
}

function escapeReviewText(value) {
    const node = document.createElement('div'); node.textContent = String(value ?? ''); return node.innerHTML;
}

// escapeReviewText doesn't escape quote characters, which is fine inside
// text nodes but unsafe once the same value is placed inside an HTML
// attribute (a title containing a `"` would otherwise break out of it).
function escapeAttr(value) {
    return String(value ?? '').replace(/[&<>"']/g, character => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[character]);
}

async function loadReviewCount() {
    const count = document.getElementById('reviewCount');
    if (!count) return;
    try {
        const response = await fetch(API_URL('/reviews'));
        const result = await response.json();
        if (!response.ok || result.error) throw new Error(result.error || 'Unable to load review count.');
        count.textContent = String(Number(result.meta?.total ?? result.data?.length ?? 0));
    } catch (error) {
        console.error('Error loading review count:', error);
        count.textContent = '0';
    }
}

async function showAllReviews() {
    const modal = bootstrap.Modal.getOrCreateInstance(document.getElementById('reviewsListModal'));
    const list = document.getElementById('reviewsList');
    list.innerHTML = '<div class="text-center text-muted py-5"><span class="spinner-border spinner-border-sm me-2"></span>Loading reviews...</div>';
    modal.show();
    try {
        const response = await fetch(API_URL('/reviews'));
        const result = await response.json();
        if (!response.ok || result.error) throw new Error(result.error || 'Unable to load reviews.');
        const reviews = result.data || [];
        const count = document.getElementById('reviewCount');
        if (count) count.textContent = String(Number(result.meta?.total ?? reviews.length));
        list.innerHTML = reviews.length ? `<div class="d-grid gap-3">${reviews.map(review => {
            const stars = '<i class="bi bi-star-fill"></i>'.repeat(Number(review.rating)) + '<i class="bi bi-star"></i>'.repeat(5 - Number(review.rating));
            const date = new Date(String(review.created_at).replace(' ', 'T')).toLocaleDateString();
            return `<article class="review-card"><div class="d-flex justify-content-between gap-3"><strong>${escapeReviewText(review.customer_name)}</strong><small class="text-muted">${escapeReviewText(date)}</small></div><div class="review-stars my-2" aria-label="${Number(review.rating)} out of 5 stars">${stars}</div><div class="review-comments">${escapeReviewText(review.comments)}</div></article>`;
        }).join('')}</div>` : '<div class="text-center text-muted py-5"><i class="bi bi-chat-square-heart fs-1 d-block mb-2"></i>No reviews yet. Be the first to add one.</div>';
    } catch (error) { list.innerHTML = `<div class="alert alert-danger">${escapeReviewText(error.message)}</div>`; }
}

async function loadCategories() {
    const response = await fetch(API_URL('/categories'));
    const result = await response.json();
    if (!response.ok || result.error) throw new Error(result.error || 'Unable to load categories');
    const tabs = document.getElementById('propertyTypeTabs');
    tabs?.replaceChildren();
    const configuredCategories = LAYOUT_EXPLORER_CONFIG?.category_buttons || {};
    const categories = (result.data || []).map(category => {
        const configuration = configuredCategories[category.type] || {};
        return { ...category, configuration };
    }).filter(category => category.configuration.enabled !== false)
      .sort((a, b) => Number(a.configuration.position ?? 999) - Number(b.configuration.position ?? 999));
    propertyCategoryById = new Map(categories.map(category => [String(category.id), String(category.type)]));
    const actions = categories.map(category => ({ position: Number(category.configuration.position ?? 999), category }));
    actions.sort((a, b) => a.position - b.position);
    let firstCategory = true;
    actions.forEach(action => {
        const button = document.createElement('button');
        button.type = 'button';
        const configuration = action.category.configuration;
        const icon = /^bi-[a-z0-9-]+$/.test(String(configuration.icon || '')) ? configuration.icon : 'bi-grid';
        const iconNode = document.createElement('i');
        iconNode.className = `bi ${icon} me-2`;
        button.append(iconNode, document.createTextNode(String(configuration.label || action.category.name)));
        button.className = `nav-link${firstCategory ? ' active' : ''}`;
        button.dataset.layoutType = action.category.id;
        firstCategory = false;
        tabs?.appendChild(button);
    });
    selectedLayoutType = categories[0]?.id || '';
    selectedPropertyType = propertyCategoryById.get(String(selectedLayoutType)) || 'Open Plot';
}

async function loadLayouts() {
    const layoutSelect = document.getElementById('layoutSelect');

    try {
        const response = await fetch(`${API_URL('/layouts')}?${new URLSearchParams({ project_category: selectedLayoutType })}`);
        if (!response.ok) {
            throw new Error(`Unable to load layouts (${response.status})`);
        }

        const result = await response.json();
        if (result.error) {
            throw new Error(result.error);
        }

        projectLayouts = result.data || [];
    } catch (error) {
        console.error('Error loading project layouts:', error);
        projectLayouts = [];
    }

    const requiresSvg = selectedPropertyType.toLowerCase() === 'open plot';
    selectedLayout = projectLayouts.find(layout => !requiresSvg || layout.file_available !== false)
        || projectLayouts[0]
        || null;

    if (!layoutSelect) {
        return;
    }

    layoutSelect.replaceChildren();
    if (!projectLayouts.length) {
        layoutSelect.appendChild(new Option('No projects are currently listed', ''));
        layoutSelect.disabled = true;
        updateLayoutDescription();
        clearMap('No projects are available in this category yet.');
        updateStats();
        return;
    }

    layoutSelect.disabled = false;
    projectLayouts.forEach((layout, index) => {
        const option = document.createElement('option');
        option.value = String(layout.id ?? layout.layout_key ?? layout.slug ?? index);
        option.textContent = getLayoutDisplayName(layout, index);
        option.disabled = requiresSvg && layout.file_available === false;
        if (option.disabled) {
            option.textContent += ' (layout file missing)';
        }
        layoutSelect.appendChild(option);
    });

    layoutSelect.value = String(selectedLayout?.id ?? selectedLayout?.layout_key ?? selectedLayout?.slug ?? '');

    updateLayoutDescription();
}

async function changeLayoutType(layoutType) {
    if (!layoutType || layoutType === selectedLayoutType) {
        return;
    }

    selectedLayoutType = layoutType;
    selectedPropertyType = propertyCategoryById.get(String(layoutType)) || 'Open Plot';
    document.querySelectorAll('[data-layout-type]').forEach(button => {
        const active = button.dataset.layoutType === selectedLayoutType;
        button.classList.toggle('active', active);
        button.setAttribute('aria-selected', String(active));
    });

    selectedLayout = null;
    plots = [];
    originalPlots = [];
    await loadLayouts();
    await loadPlots();
}

function changeLayout(event) {
    selectedLayout = projectLayouts.find((layout, index) =>
        String(layout.id ?? layout.layout_key ?? layout.slug ?? index) === event.target.value
    ) || projectLayouts[0] || null;

    updateLayoutDescription();
    loadPlots();
}

function updateLayoutDescription() {
    const description = document.getElementById('layoutDescription');
    const text = selectedLayout?.description || selectedLayout?.layout_description || '';
    if (description) {
        description.textContent = text;
        description.classList.toggle('d-none', !text);
    }

    const mediaActions = document.getElementById('layoutMediaActions');
    const mapLink = document.getElementById('layoutMapLink');
    const videoLink = document.getElementById('layoutVideoLink');
    const setSafeLink = (element, value) => {
        if (!element) return false;
        try {
            const url = new URL(String(value || ''), window.location.origin);
            const visible = /^https?:$/.test(url.protocol) && Boolean(value);
            element.classList.toggle('disabled', !visible);
            element.setAttribute('aria-disabled', String(!visible));
            element.title = visible ? '' : 'This project link has not been added yet.';
            if (visible) {
                element.href = url.href;
            } else {
                element.removeAttribute('href');
            }
            return visible;
        } catch {
            element.classList.add('disabled');
            element.setAttribute('aria-disabled', 'true');
            element.title = 'This project link has not been added yet.';
            element.removeAttribute('href');
            return false;
        }
    };
    const locationName = String(selectedLayout?.location_name || selectedLayout?.layout_name || selectedLayout?.title || '').trim();
    if (mapLink) {
        const locationAvailable = Boolean(locationName);
        mapLink.classList.toggle('disabled', !locationAvailable);
        mapLink.disabled = !locationAvailable;
        mapLink.setAttribute('aria-disabled', String(!locationAvailable));
        mapLink.title = locationAvailable ? `View ${locationName} on the map` : 'This project location has not been added yet.';
    }
    if (videoLink) {
        const videoAvailable = Boolean(getSafeVideoSource(selectedLayout?.video_url));
        videoLink.classList.toggle('disabled', !videoAvailable);
        videoLink.disabled = !videoAvailable;
        videoLink.setAttribute('aria-disabled', String(!videoAvailable));
        videoLink.title = videoAvailable ? 'Play the project video' : 'A supported project video has not been added yet.';
    }
    mediaActions?.classList.remove('d-none');
    renderLayoutHighlights();
}

function normalizeHighlightItems(value) {
    if (Array.isArray(value)) return value.filter(Boolean);
    if (typeof value === 'string') {
        try {
            const parsed = JSON.parse(value);
            return Array.isArray(parsed) ? parsed.filter(Boolean) : [];
        } catch (error) { return []; }
    }
    if (value && typeof value === 'object') return Object.values(value).flatMap(entry => normalizeHighlightItems(entry));
    return [];
}

function getLayoutHighlightItems(key) {
    const values = [selectedLayout?.[key], selectedLayout?.[`${key}_items`]].flatMap(normalizeHighlightItems);
    return values.filter(item => {
        if (typeof item === 'string') return item.trim().length > 0;
        if (item && typeof item === 'object') return Boolean(item.title || item.text || item.label || item.name || item.image);
        return false;
    }).slice(0, 8);
}

function renderHighlightCard(item, kind) {
    const fallbackLabel = kind === 'events' ? 'Upcoming event' : 'Gallery update';
    if (typeof item === 'string') return `<div class="highlight-card"><p>${escapeReviewText(item)}</p></div>`;
    const imageSrc = item.image ? uploadedFileUrl(kind, item.image) : '';
    const caption = escapeAttr(item.title || item.label || item.name || fallbackLabel);
    return `<div class="highlight-card">${imageSrc ? `<img src="${escapeAttr(imageSrc)}" alt="${caption}" loading="lazy" data-lightbox-src="${escapeAttr(imageSrc)}" data-lightbox-caption="${caption}">` : ''}
    <h4>${escapeReviewText(item.title || item.label || item.name || fallbackLabel)}</h4>
    </div>`;
}

function renderHighlightCarousel(sectionId, items, kind, emptyLabel) {
    const slides = items.length
        ? items.map(item => renderHighlightCard(item, kind)).join('')
        : `<div class="highlight-card empty"><p>${escapeReviewText(emptyLabel)}</p></div>`;
    const showNav = items.length > 1;
    const arrows = showNav
        ? `<button type="button" class="highlight-carousel-arrow prev" data-carousel-prev="${sectionId}" aria-label="Previous"><i class="bi bi-chevron-left"></i></button><button type="button" class="highlight-carousel-arrow next" data-carousel-next="${sectionId}" aria-label="Next"><i class="bi bi-chevron-right"></i></button>`
        : '';
    const dots = showNav
        ? `<div class="highlight-carousel-dots">${items.map((item, index) => `<span class="highlight-carousel-dot${index === 0 ? ' active' : ''}"></span>`).join('')}</div>`
        : '';
    return `<div class="highlight-carousel" data-carousel="${sectionId}" data-index="0"><div class="highlight-carousel-track">${slides}</div>${arrows}${dots}</div>`;
}

function moveHighlightCarousel(container, delta) {
    if (!container) return;
    const track = container.querySelector('.highlight-carousel-track');
    const count = track?.children.length || 0;
    if (count < 2) return;
    const index = (((Number(container.dataset.index) || 0) + delta) % count + count) % count;
    container.dataset.index = String(index);
    track.style.transform = `translateX(-${index * 100}%)`;
    container.querySelectorAll('.highlight-carousel-dot').forEach((dot, dotIndex) => dot.classList.toggle('active', dotIndex === index));
}

function renderLayoutHighlights() {
    const container = document.getElementById('layoutHighlightsSection');
    if (!container) return;
    if (!selectedLayout) { container.replaceChildren(); return; }
    const galleryItems = getLayoutHighlightItems('gallery');
    const eventItems = getLayoutHighlightItems('events');
    container.innerHTML = `<section class="property-highlights-section"><div class="property-highlights-grid"><div class="property-highlight-column"><h3 class="h5 mb-3"><i class="bi bi-images me-2"></i>Gallery</h3>${renderHighlightCarousel('layout-gallery', galleryItems, 'gallery', 'No gallery updates available yet.')}</div><div class="property-highlight-column"><h3 class="h5 mb-3"><i class="bi bi-calendar-event me-2"></i>Events</h3>${renderHighlightCarousel('layout-events', eventItems, 'events', 'No events are available yet.')}</div></div></section>`;
}

function showProjectLocation() {
    const locationName = String(selectedLayout?.location_name || selectedLayout?.layout_name || selectedLayout?.title || '').trim();
    const modalElement = document.getElementById('projectLocationModal');
    const map = document.getElementById('projectLocationMap');
    if (!locationName || !modalElement || !map) return;
    const iframe = document.createElement('iframe');
    iframe.src = `https://www.google.com/maps?q=${encodeURIComponent(locationName)}&output=embed`;
    iframe.title = `${locationName} project location`;
    iframe.loading = 'lazy';
    iframe.referrerPolicy = 'no-referrer-when-downgrade';
    iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-popups');
    iframe.setAttribute('aria-label', `Map showing ${locationName}`);
    map.replaceChildren(iframe);
    document.getElementById('projectLocationModalLabel').innerHTML = `<i class="bi bi-geo-alt-fill text-primary"></i> ${escapeReviewText(locationName)}`;
    bootstrap.Modal.getOrCreateInstance(modalElement).show();
}

function getSafeVideoSource(value) {
    if (!value) return null;
    try {
        const url = new URL(String(value), window.location.origin);
        const secure = url.protocol === 'https:' || (url.origin === window.location.origin && url.protocol === window.location.protocol);
        if (!secure || url.username || url.password) return null;
        const host = url.hostname.toLowerCase().replace(/^www\./, '');
        let id = '';
        if (host === 'youtu.be') id = url.pathname.split('/').filter(Boolean)[0] || '';
        if (host === 'youtube.com' || host === 'm.youtube.com') {
            if (url.pathname === '/watch') id = url.searchParams.get('v') || '';
            else if (/^\/(embed|shorts)\//.test(url.pathname)) id = url.pathname.split('/')[2] || '';
        }
        if (id && /^[A-Za-z0-9_-]{6,20}$/.test(id)) {
            return { type: 'iframe', url: `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}?rel=0&modestbranding=1` };
        }
        if (host === 'vimeo.com' || host === 'player.vimeo.com') {
            const vimeoId = url.pathname.split('/').filter(Boolean).find(part => /^\d+$/.test(part));
            if (vimeoId) return { type: 'iframe', url: `https://player.vimeo.com/video/${vimeoId}?dnt=1` };
        }
        if (/\.(mp4|webm|ogg)$/i.test(url.pathname)) return { type: 'video', url: url.href };
    } catch (error) { return null; }
    return null;
}

function showProjectVideo() {
    const source = getSafeVideoSource(selectedLayout?.video_url);
    const player = document.getElementById('projectVideoPlayer');
    const modalElement = document.getElementById('projectVideoModal');
    if (!source || !player || !modalElement) return;
    player.replaceChildren();
    if (source.type === 'iframe') {
        const iframe = document.createElement('iframe');
        iframe.src = source.url;
        iframe.title = `${selectedLayout?.location_name || selectedLayout?.layout_name || selectedLayout?.title || 'Project'} video`;
        iframe.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen';
        iframe.allowFullscreen = true;
        iframe.referrerPolicy = 'strict-origin-when-cross-origin';
        iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-presentation');
        player.appendChild(iframe);
    } else {
        const video = document.createElement('video');
        video.src = source.url;
        video.controls = true;
        video.autoplay = true;
        video.playsInline = true;
        video.preload = 'metadata';
        video.setAttribute('controlsList', 'nodownload noremoteplayback');
        video.setAttribute('disablePictureInPicture', '');
        video.addEventListener('contextmenu', event => event.preventDefault());
        player.appendChild(video);
    }
    document.getElementById('projectVideoModalLabel').innerHTML = `<i class="bi bi-play-circle-fill text-danger"></i> ${escapeReviewText(selectedLayout?.location_name || selectedLayout?.layout_name || selectedLayout?.title || 'Project')} Video`;
    bootstrap.Modal.getOrCreateInstance(modalElement).show();
}

function uploadedFileUrl(kind, filename) {
    const bareName = String(filename || '').trim().replace(/\\/g, '/').split('/').pop();
    if (!bareName) return '';
    return ASSET_URL(`/uploads/${kind}/${encodeURIComponent(bareName)}`);
}

function getSelectedLayoutSvg() {
    const filename = selectedLayout?.svg_filename || selectedLayout?.svg_file || selectedLayout?.layout_file || 'kubera_layout.svg';
    return uploadedFileUrl('layouts', filename);
}

function getExperienceMode() {
    const type = String(selectedPropertyType || selectedLayout?.category_type || '').toLowerCase();
    if (type.includes('villa')) return 'villa';
    if (type.includes('construction')) return 'construction';
    return 'plot';
}

function configureInventoryView() {
    const mode = getExperienceMode();
    const cardMode = mode !== 'plot';
    document.getElementById('svgWrapper')?.classList.toggle('d-none', cardMode);
    document.getElementById('propertyCardsView')?.classList.toggle('d-none', !cardMode);
    const title = document.getElementById('inventoryViewTitle');
    if (title) title.innerHTML = mode === 'villa' ? '<i class="bi bi-house-heart-fill"></i> Premium Villas' : mode === 'construction' ? '<i class="bi bi-building-fill"></i> Construction Opportunities' : '<i class="bi bi-map"></i> Interactive Layout Map';
    const totalLabel = document.getElementById('totalInventoryLabel');
    if (totalLabel) totalLabel.textContent = mode === 'villa' ? 'Total Villas' : mode === 'construction' ? 'Total Options' : 'Total Plots';
    const tip = document.getElementById('mapUsageTip');
    if (tip) tip.innerHTML = mode === 'villa' ? '<i class="bi bi-stars me-2"></i><strong>Villa experience:</strong> Compare premium homes and schedule a private visit.' : mode === 'construction' ? '<i class="bi bi-tools me-2"></i><strong>Construction experience:</strong> Choose an option and request a tailored estimate.' : '<i class="bi bi-info-circle me-2"></i><strong>Tip:</strong> Click a plot for details. A purple dashed border with a <strong>C</strong> badge identifies a corner plot. The blue number badge on a reserved plot shows how many customers are interested.';
}

function databaseImageUrl(value) {
    // Uploaded layout covers and plot images are stored as bare filenames
    // and served from the external uploads store via /uploads/layouts/<file>.
    if (!/\.(?:png|jpe?g|webp)$/i.test(String(value || ''))) return '';
    return uploadedFileUrl('layouts', value);
}

function formatImageUpdatedNote(dateValue) {
    if (!dateValue) return '';
    const parsed = new Date(String(dateValue).replace(' ', 'T'));
    if (Number.isNaN(parsed.getTime())) return '';
    const formatted = parsed.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
    return `<div class="image-updated-note"><i class="bi bi-clock-history"></i> Image updated on ${formatted}</div>`;
}

function propertyFacilities(property) {
    try {
        const values = Array.isArray(property.facilities) ? property.facilities : JSON.parse(property.facilities || '[]');
        return values.filter(value => typeof value === 'string' && value.trim()).slice(0, 8);
    } catch (error) { return []; }
}

function renderPropertyCards(items = originalPlots) {
    configureInventoryView();
    const mode = getExperienceMode();
    const container = document.getElementById('propertyCardsView');
    if (!container) return;
    if (!items.length) {
        container.innerHTML = `<div class="empty-layout-state"><i class="bi ${mode === 'villa' ? 'bi-house-heart' : 'bi-building'}"></i><p>No ${mode === 'villa' ? 'villas' : 'construction options'} are currently listed.</p></div>`;
        return;
    }
    container.replaceChildren();
    if (mode === 'construction') {
        const counts = ['available', 'reserved', 'sold'].reduce((result, status) => ({ ...result, [status]: items.filter(item => String(item.status).toLowerCase() === status).length }), {});
        const coverImage = databaseImageUrl(selectedLayout?.cover_image);
        const imageUpdatedNote = coverImage ? formatImageUpdatedNote(selectedLayout?.cover_image_updated_at || selectedLayout?.updated_at) : '';
        const hero = document.createElement('section');
        hero.className = 'construction-project-hero';
        hero.innerHTML = `<div class="construction-project-media">${imageUpdatedNote}${coverImage ? `<img src="${coverImage}" alt="${escapeReviewText(selectedLayout?.location_name || 'Construction project')}" loading="lazy">` : '<div class="property-image-placeholder"><i class="bi bi-building-fill"></i><span>Project image coming soon</span></div>'}</div><div class="construction-project-content"><span class="badge text-bg-success mb-2">Live inventory</span><h3>${escapeReviewText(selectedLayout?.title || selectedLayout?.location_name || 'Construction Project')}</h3><p>${escapeReviewText(selectedLayout?.description || 'Select an individual plot below to reserve it for construction.')}</p><div class="construction-inventory-summary"><div><strong>${items.length}</strong><span>Total plots</span></div><div class="available"><strong>${counts.available}</strong><span>Available</span></div><div class="reserved"><strong>${counts.reserved}</strong><span>Reserved</span></div><div class="sold"><strong>${counts.sold}</strong><span>Sold</span></div></div></div>`;
        container.appendChild(hero);
    }
    const list = document.createElement('div');
    list.className = mode === 'construction' ? 'construction-plot-grid' : 'villa-listing-grid';
    items.forEach(property => {
        const status = String(property.status || 'available').toLowerCase();
        const label = mode === 'villa' ? `Villa ${property.plot_number}` : `Plot ${property.plot_number}`;
        const propertyImage = databaseImageUrl(property.property_image);
        const facilities = propertyFacilities(property);
        const interestedCount = Math.max(0, Number.parseInt(property.total_members, 10) || 0);
        const card = document.createElement('article');
        card.className = `property-showcase-card ${mode}`;
        const interestBadge = `<button type="button" class="property-interest-badge" aria-label="View ${interestedCount} interested ${interestedCount === 1 ? 'customer' : 'customers'}" title="View interested customers"><i class="bi bi-people-fill"></i><span>${interestedCount > 99 ? '99+' : interestedCount}</span></button>`;
        const visual = mode === 'villa' ? `<div class="property-showcase-visual">${propertyImage ? `<img class="property-showcase-image" src="${propertyImage}" alt="${escapeReviewText(label)}" loading="lazy" decoding="async">` : '<div class="property-image-placeholder"><i class="bi bi-house-heart-fill"></i><span>Villa image coming soon</span></div>'}</div>` : '';
        const villaDetails = mode === 'villa' ? `<div class="villa-spec-grid"><span><i class="bi bi-door-open-fill"></i><strong>${Number(property.bedrooms) || '—'}</strong> Bedrooms</span><span><i class="bi bi-droplet-fill"></i><strong>${Number(property.bathrooms) || '—'}</strong> Bathrooms</span><span><i class="bi bi-car-front-fill"></i><strong>${Number(property.parking_spaces) || '—'}</strong> Parking</span></div>${facilities.length ? `<div class="villa-facilities">${facilities.map(facility => `<span><i class="bi bi-check-circle-fill"></i>${escapeReviewText(facility)}</span>`).join('')}</div>` : '<p class="small text-muted">Facilities will be updated soon.</p>'}` : '';
        card.innerHTML = `${visual}<span class="property-showcase-status text-${status === 'available' ? 'success' : status === 'reserved' ? 'warning' : 'danger'}">${escapeReviewText(status)}</span>${interestBadge}<div class="card-body"><h3 class="h5 fw-bold mb-1">${escapeReviewText(label)}</h3><p class="text-muted small mb-3"><i class="bi bi-geo-alt-fill"></i> ${escapeReviewText(selectedLayout?.location_name || 'Location to be updated')}</p>${villaDetails}<div class="property-feature-grid mb-3"><div class="property-feature"><i class="bi bi-rulers"></i>${escapeReviewText(property.area_sqyds || 0)} Sq.Yds</div><div class="property-feature"><i class="bi bi-arrows-fullscreen"></i>${escapeReviewText(property.area_sqft || 0)} Sq.Ft</div></div><button type="button" class="btn btn-primary w-100 property-primary-action" ${status === 'sold' ? 'disabled' : ''}><i class="bi ${mode === 'villa' ? 'bi-house-check-fill' : 'bi-bookmark-check-fill'} me-1"></i>${status === 'sold' ? 'Sold' : status === 'reserved' ? 'Register Interest' : mode === 'villa' ? 'Reserve Villa' : 'Reserve Plot'}</button></div>`;
        card.querySelector('.property-primary-action')?.addEventListener('click', () => openBooking(property, null));
        card.querySelector('.property-interest-badge')?.addEventListener('click', () => showInterestedCustomers(property));
        list.appendChild(card);
    });
    container.appendChild(list);
}

async function loadPlots() {

    try {

        const layoutId = selectedLayout?.id ?? selectedLayout?.layout_key ?? selectedLayout?.slug;
        if (!layoutId) {
            clearMap('Select a project when one becomes available.');
            updateStats();
            return;
        }
        const url = `${API_URL('/plots')}?${new URLSearchParams({ project_layout_id: String(layoutId) })}`;
        console.log('Fetching plots from:', url);
        
        const response =
            await fetch(url);

        console.log('Response status:', response.status, response.statusText);

        if (!response.ok) {

            throw new Error(
                'HTTP Error : ' +
                response.status + ' ' + response.statusText
            );
        }

        const result =
            await response.json();

        console.log('API Response:', result);

        if (result.error) {

            throw new Error(
                result.error
            );
        }

        plots =
            result.data || [];

        originalPlots =
            [...plots];

        console.log('Plots loaded:', plots.length);

        configureInventoryView();
        if (getExperienceMode() === 'plot') {
            await loadSvg();
        } else {
            renderPropertyCards();
        }

        updateStats();

    } catch (error) {

        console.error('Error loading plots:', error);
        // alert('Failed to load plots: ' + error.message);
    }
}

function clearMap(message) {
    configureInventoryView();
    if (getExperienceMode() !== 'plot') {
        const cards = document.getElementById('propertyCardsView');
        if (cards) cards.innerHTML = `<div class="empty-layout-state"><i class="bi bi-grid"></i><p>${escapeReviewText(message)}</p></div>`;
        return;
    }
    const container = document.getElementById('svgContainer');
    if (container) {
        container.innerHTML = `<div class="empty-layout-state"><i class="bi bi-map"></i><p>${message}</p></div>`;
    }
}

function getColor(status) {

    status =
        String(status)
        .toLowerCase();

    switch (status) {

        case 'available':
            return '#22c55e';

        case 'reserved':
            return '#facc15';

        case 'sold':
            return '#ef4444';

        default:
            return '#94a3b8';
    }
}

function updateStats() {
    const reservedInterestTotal = originalPlots
        .filter(plot => String(plot.status).toLowerCase() === 'reserved')
        .reduce((total, plot) => total + Math.max(0, Number.parseInt(plot.total_members, 10) || 0), 0);
    const reservedInterestBadge = document.getElementById('reservedInterestCount');

    if (reservedInterestBadge) {
        const displayCount = reservedInterestTotal > 99 ? '99+' : String(reservedInterestTotal);
        const customerLabel = `${reservedInterestTotal} interested ${reservedInterestTotal === 1 ? 'customer' : 'customers'}`;
        reservedInterestBadge.textContent = displayCount;
        reservedInterestBadge.setAttribute('aria-label', customerLabel);
        reservedInterestBadge.setAttribute('title', customerLabel);
    }

    document.getElementById(
        'totalPlots'
    ).textContent =
        originalPlots.length;

    document.getElementById(
        'availablePlots'
    ).textContent =
        originalPlots.filter(
            x =>
            x.status.toLowerCase()
            === 'available'
        ).length;

    document.getElementById(
        'reservedPlots'
    ).textContent =
        originalPlots.filter(
            x =>
            x.status.toLowerCase()
            === 'reserved'
        ).length;

    document.getElementById(
        'soldPlots'
    ).textContent =
        originalPlots.filter(
            x =>
            x.status.toLowerCase()
            === 'sold'
        ).length;
}

async function loadSvg(
    filteredPlots = null
) {

    try {
        const svgUrl = getSelectedLayoutSvg();
        console.log('Fetching SVG from:', svgUrl);
        
        const response =
            await fetch(svgUrl);

        console.log('SVG Response status:', response.status, response.statusText);

        if (!response.ok) {
            throw new Error('Failed to fetch SVG: ' + response.status + ' ' + response.statusText);
        }

        const svgText =
            await response.text();

        console.log('SVG Content Length:', svgText.length);

        const svgContainer = document.getElementById('svgContainer');
        if (!svgContainer) {
            console.error('SVG container not found');
            return;
        }

        svgContainer.innerHTML = svgText;

        const svg =
            document.querySelector(
                '#svgContainer svg'
            );

        if (!svg) {

            console.error(
                'SVG Not Found in container'
            );
            svgContainer.innerHTML = '<p class="text-danger">Failed to load SVG layout. Please check the layout file.</p>';
           return;
        }

        console.log('SVG loaded successfully');

        mapLayer =
            svg.querySelector('g');

        if (!mapLayer) {

            mapLayer =
                document.createElementNS(
                    'http://www.w3.org/2000/svg',
                    'g'
                );

            while (
                svg.firstChild
            ) {

                mapLayer.appendChild(
                    svg.firstChild
                );
            }

            svg.appendChild(
                mapLayer
            );
        }

        plots =
            filteredPlots ||
            originalPlots;

        bindPlots();

    } catch (error) {
        console.error('Error loading SVG:', error);
        // alert('Failed to load SVG: ' + error.message);
    }
}

function filterPlots(event) {

    const status =
        event.target.dataset.status;

    if (
        status === 'all'
    ) {

        if (getExperienceMode() !== 'plot') {
            renderPropertyCards(originalPlots);
            return;
        }

        loadSvg(
            originalPlots
        );

        return;
    }

    const filteredPlots =
        originalPlots.filter(
            plot =>
                String(plot.status)
                .toLowerCase() === status
        );

    if (getExperienceMode() !== 'plot') {
        renderPropertyCards(filteredPlots);
        return;
    }

    loadSvg(
        filteredPlots
    );
}

function ensurePlotLabel(plot, svgPlot) {
    if (!svgPlot || !svgPlot.parentNode) {
        return null;
    }

    const existingLabel = svgPlot.parentNode.querySelector(`text[data-plot-number="${plot.plot_number}"]`);
    if (existingLabel) {
        existingLabel.classList.add('plot-label');
        return existingLabel;
    }

    const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    label.setAttribute('data-plot-number', plot.plot_number);
    label.setAttribute('class', 'plot-label');
    label.setAttribute('aria-label', `Plot ${plot.plot_number}`);
    label.setAttribute('text-anchor', 'middle');
    label.setAttribute('dominant-baseline', 'middle');

    let x = plot.label_x;
    let y = plot.label_y;

    if (x === undefined || x === null || y === undefined || y === null) {
        const box = svgPlot.getBBox();
        x = box.x + box.width / 2;
        y = box.y + box.height / 2;
    }

    label.setAttribute('x', x);
    label.setAttribute('y', y);
    label.textContent = plot.plot_number;

    // Appending after the plot shape keeps the number on top of the plot box.
    svgPlot.parentNode.appendChild(label);
    return label;
}

function syncPlotLabelState(svgPlot) {
    if (!svgPlot && getExperienceMode() !== 'plot') {
        if (String(plot.status).toLowerCase() === 'sold') {
            AppPopup.error(`${selectedPropertyType} ${plot.plot_number} is unavailable.`, 'Property unavailable');
        } else {
            openBooking(plot, null);
        }
        return;
    }

    if (!svgPlot) {
        return;
    }

    const label = svgPlot.parentNode?.querySelector(`text[data-plot-number="${svgPlot.dataset.plot}"]`);
    if (!label) {
        return;
    }

    const isSelected = svgPlot.classList.contains('selected');
    const isHovered = svgPlot.dataset.hovered === 'true';

    label.style.opacity = isSelected || isHovered ? '1' : '0.95';
    label.style.fill = isSelected || isHovered ? '#ffffff' : '#111827';
    label.style.fontWeight = isSelected || isHovered ? '900' : '700';
}

function addReservedInterestBadge(plot, svgPlot, bbox) {
    const count = Math.max(0, Number.parseInt(plot.total_members, 10) || 0);
    const namespace = 'http://www.w3.org/2000/svg';
    const radius = Math.max(8, Math.min(14, Math.min(bbox.width, bbox.height) * 0.16));
    const centerX = bbox.x + bbox.width - radius - 2;
    const centerY = bbox.y + radius + 2;
    const badge = document.createElementNS(namespace, 'g');
    const circle = document.createElementNS(namespace, 'circle');
    const countLabel = document.createElementNS(namespace, 'text');
    const title = document.createElementNS(namespace, 'title');

    badge.setAttribute('class', 'plot-interest-badge');
    badge.setAttribute('aria-label', `${count} interested ${count === 1 ? 'customer' : 'customers'}`);
    badge.setAttribute('role', 'img');
    badge.setAttribute('tabindex', '0');
    badge.dataset.plotNumber = plot.plot_number;

    circle.setAttribute('cx', centerX);
    circle.setAttribute('cy', centerY);
    circle.setAttribute('r', radius);

    countLabel.setAttribute('x', centerX);
    countLabel.setAttribute('y', centerY);
    countLabel.setAttribute('text-anchor', 'middle');
    countLabel.setAttribute('dominant-baseline', 'central');
    countLabel.setAttribute('font-size', Math.max(8, radius * 0.9));
    countLabel.textContent = count > 99 ? '99+' : String(count);

    title.textContent = `${count} interested ${count === 1 ? 'customer' : 'customers'} for Plot ${plot.plot_number}`;
    badge.append(circle, countLabel, title);
    svgPlot.parentNode.appendChild(badge);
    const openCustomers = event => {
        event.preventDefault();
        event.stopPropagation();
        showInterestedCustomers(plot);
    };
    badge.addEventListener('click', openCustomers);
    badge.addEventListener('keydown', event => {
        if (event.key === 'Enter' || event.key === ' ') openCustomers(event);
    });
}

function addPlotCompactActions(plot, svgPlot, bbox) {
    const namespace = 'http://www.w3.org/2000/svg';
    const group = document.createElementNS(namespace, 'g');
    const size = Math.max(12, Math.min(22, bbox.width * .28, bbox.height * .28));
    const gap = Math.max(1, size * .12);
    const right = bbox.x + bbox.width - size - 2;
    const top = bbox.y + 2;

    group.setAttribute('class', 'plot-compact-actions');
    group.dataset.plotNumber = plot.plot_number;

    const addAction = (action, x, y, count, titleText) => {
        const actionGroup = document.createElementNS(namespace, 'g');
        const hitArea = document.createElementNS(namespace, 'rect');
        const icon = document.createElementNS(namespace, 'text');
        const countText = document.createElementNS(namespace, 'text');
        const title = document.createElementNS(namespace, 'title');
        actionGroup.dataset.action = action;
        actionGroup.setAttribute('class', `plot-action-item plot-action-${action}`);
        actionGroup.setAttribute('role', 'button');
        actionGroup.setAttribute('tabindex', '0');
        actionGroup.setAttribute('aria-label', `${titleText} for Plot ${plot.plot_number}`);
        hitArea.setAttribute('x', x);
        hitArea.setAttribute('y', y);
        hitArea.setAttribute('width', size);
        hitArea.setAttribute('height', size);
        hitArea.setAttribute('rx', size * .42);
        icon.setAttribute('x', x + size / 2);
        icon.setAttribute('y', y + size * .66);
        icon.setAttribute('class', 'plot-action-symbol');
        icon.setAttribute('text-anchor', 'middle');
        icon.textContent = action === 'interest' ? '♟' : action === 'reviews' ? '◉' : '★';
        if (count !== null) {
            countText.setAttribute('x', x + size - 1);
            countText.setAttribute('y', y + 5);
            countText.setAttribute('class', 'plot-action-count');
            countText.setAttribute('text-anchor', 'middle');
            countText.textContent = Number(count) > 99 ? '99+' : String(Number(count) || 0);
        }
        title.textContent = titleText;
        actionGroup.append(hitArea, icon, countText, title);
        const activate = event => {
            event.preventDefault();
            event.stopPropagation();
            const label = `Plot ${plot.plot_number}`;
            if (!window.SharedPropertyUI) {
                window.AppPopup?.error('Property actions are unavailable. Please refresh the page.');
                return;
            }
            if (action === 'interest') window.SharedPropertyUI.interests(plot, label);
            if (action === 'reviews') window.SharedPropertyUI.reviews(plot, selectedLayout, label);
            if (action === 'add-review') window.SharedPropertyUI.addReview(plot, selectedLayout, label, loadPlots);
        };
        actionGroup.addEventListener('click', activate);
        actionGroup.addEventListener('keydown', event => {
            if (event.key === 'Enter' || event.key === ' ') activate(event);
        });
        group.appendChild(actionGroup);
    };

    // Three independent curved actions remain inside the plot corner.
    addAction('add-review', right, top, null, 'Add customer review');
    addAction('reviews', right - size - gap, top, plot.review_count, 'View customer reviews');
    addAction('interest', right, top + size + gap, plot.total_members, 'Interested customers');
    svgPlot.parentNode.appendChild(group);

    const show = () => {
        if (activePlotActionGroup && activePlotActionGroup !== group) {
            activePlotActionGroup.classList.remove('is-visible');
        }
        svgPlot.parentNode.appendChild(group);
        group.classList.add('is-visible');
        activePlotActionGroup = group;
    };
    const hide = event => {
        const next = event.relatedTarget;
        if (next && (next === svgPlot || group.contains(next))) return;
        group.classList.remove('is-visible');
        if (activePlotActionGroup === group) activePlotActionGroup = null;
    };

    svgPlot.addEventListener('mouseenter', show);
    svgPlot.addEventListener('mouseleave', hide);
    group.addEventListener('mouseenter', show);
    group.addEventListener('mouseleave', hide);
}

async function showInterestedCustomers(plot) {
    if (window.SharedPropertyUI) {
        const mode = getExperienceMode();
        return SharedPropertyUI.interests(plot, mode === 'villa' ? 'Villa' : mode === 'construction' ? 'Construction Plot' : 'Plot');
    }
    if ((Number(plot?.total_members) || 0) <= 0) {
        AppPopup?.show('No customers have registered interest in this property yet.', 'No interested buyers');
        return;
    }
    const modalElement = document.getElementById('interestedCustomersModal');
    const list = document.getElementById('interestedCustomersList');
    const title = document.getElementById('interestedCustomersModalLabel');
    if (!modalElement || !list) return;
    const mode = getExperienceMode();
    const propertyLabel = mode === 'villa' ? 'Villa' : mode === 'construction' ? 'Construction Option' : 'Plot';
    title.innerHTML = `<i class="bi bi-people-fill text-primary"></i> Interested Customers — ${propertyLabel} ${escapeReviewText(plot.plot_number)}`;
    list.innerHTML = '<div class="text-center text-muted py-5"><span class="spinner-border spinner-border-sm me-2"></span>Loading customers...</div>';
    bootstrap.Modal.getOrCreateInstance(modalElement).show();
    try {
        const response = await fetch(`${API_URL('/plot-interests')}?plot_id=${encodeURIComponent(plot.id)}`);
        const result = await response.json();
        if (!response.ok || result.error) throw new Error(result.error || 'Unable to load interested customers.');
        const customers = result.data || [];
        list.innerHTML = customers.length ? `<div class="d-grid gap-3">${customers.map(customer => {
            const rating = Math.max(0, Math.min(5, Number(customer.rating) || 0));
            const stars = rating ? `<div class="review-stars mb-2" aria-label="${rating} out of 5 stars">${'<i class="bi bi-star-fill"></i>'.repeat(rating)}${'<i class="bi bi-star"></i>'.repeat(5 - rating)}</div>` : '';
            const review = customer.comments
                ? `${stars}<div class="review-comments">${escapeReviewText(customer.comments)}</div>`
                : '<div class="text-muted small">No review submitted yet.</div>';
            return `<article class="review-card"><strong><i class="bi bi-person-circle me-2 text-primary"></i>${escapeReviewText(customer.customer_name)}</strong><div class="mt-2">${review}</div></article>`;
        }).join('')}</div>` : '<div class="text-center text-muted py-5">No interested customers found.</div>';
    } catch (error) {
        list.innerHTML = `<div class="alert alert-danger mb-0">${escapeReviewText(error.message)}</div>`;
    }
}

function isCornerPlot(plot) {
    return ['1', 'true', 'yes'].includes(String(plot?.is_corner_plot).toLowerCase());
}

function addCornerPlotBadge(plot, svgPlot, bbox) {
    if (!isCornerPlot(plot)) return;
    const namespace = 'http://www.w3.org/2000/svg';
    const radius = Math.max(8, Math.min(13, Math.min(bbox.width, bbox.height) * 0.15));
    const centerX = bbox.x + radius + 2;
    const centerY = bbox.y + radius + 2;
    const badge = document.createElementNS(namespace, 'g');
    const circle = document.createElementNS(namespace, 'circle');
    const label = document.createElementNS(namespace, 'text');
    const title = document.createElementNS(namespace, 'title');

    badge.setAttribute('class', 'corner-plot-badge');
    badge.setAttribute('role', 'img');
    badge.setAttribute('aria-label', `Plot ${plot.plot_number} is a corner plot`);
    circle.setAttribute('cx', centerX);
    circle.setAttribute('cy', centerY);
    circle.setAttribute('r', radius);
    label.setAttribute('x', centerX);
    label.setAttribute('y', centerY);
    label.setAttribute('text-anchor', 'middle');
    label.setAttribute('dominant-baseline', 'central');
    label.setAttribute('font-size', Math.max(8, radius * 0.9));
    label.textContent = 'C';
    title.textContent = `Corner Plot ${plot.plot_number}`;
    badge.append(circle, label, title);
    svgPlot.parentNode.appendChild(badge);
}

function clearPlotSelection() {
    window.clearTimeout(searchHighlightTimer);
    document.querySelectorAll('.plot.search-highlight').forEach(element => {
        element.classList.remove('search-highlight');
        element.dataset.hovered = 'false';
    });
    document.querySelectorAll('.plot.plot-dimmed').forEach(element => element.classList.remove('plot-dimmed'));
    document.querySelectorAll('.plot-search-outline, .plot-search-halo').forEach(element => element.remove());
}

// Builds a stroke-only overlay shaped exactly like the matched plot. Overlays
// are used instead of styling the plot itself because status classes
// (.plot.sold, .plot.available, ...) and the corner-plot badge both carry
// !important stroke rules that can outrank a highlight applied to the real
// element depending on specificity - an overlay sidesteps that entirely and
// looks identical against every status colour.
function buildPlotOutline(svgPlot, className) {
    const outline = svgPlot.cloneNode(false);
    outline.removeAttribute('id');
    outline.removeAttribute('class');
    outline.removeAttribute('style');
    outline.classList.add(className);
    outline.setAttribute('fill', 'none');
    outline.setAttribute('pointer-events', 'none');
    outline.setAttribute('vector-effect', 'non-scaling-stroke');
    return outline;
}

function flashPlotSelection(svgPlot) {
    if (!svgPlot) return;
    clearPlotSelection();
    svgPlot.classList.add('search-highlight');

    // Dim every other plot on the current layout so the match is obvious at
    // a glance, no matter how busy the map is.
    document.querySelectorAll('#svgContainer .plot').forEach(element => {
        if (element !== svgPlot) element.classList.add('plot-dimmed');
    });

    const halo = buildPlotOutline(svgPlot, 'plot-search-halo');
    const accent = buildPlotOutline(svgPlot, 'plot-search-outline');
    const parent = svgPlot.parentNode;
    if (parent) {
        parent.insertBefore(halo, svgPlot.nextSibling);
        parent.insertBefore(accent, halo.nextSibling);
    }

    // Keep the highlight blinking until the customer actually clicks the
    // plot (each plot's click handler calls clearPlotSelection()) rather
    // than clearing it on an arbitrary timer.
    window.clearTimeout(searchHighlightTimer);
}

function bindPlots() {

    // Remove controls created by a previous inventory bind. The standalone
    // interested-count badge is intentionally retired in favour of the
    // curved interested action inside each plot.
    document.querySelectorAll('.plot-interest-badge, .plot-compact-actions').forEach(element => element.remove());
    collapsePlotActions();
    hidePlotActionOverlay();

    plots.forEach(plot => {

        const svgPlot =
            document.getElementById(
                `plot_${plot.plot_number}`
            );

        if (!svgPlot) {
            return;
        }

        const status =
            String(plot.status)
                .toLowerCase();
        console.log(`Binding plot ${plot.plot_number} with status: ${status}`);
        svgPlot.style.fill =
            getColor(status);
        svgPlot.style.removeProperty("mix-blend-mode"); // reset any previous blend mode
        if(status === 'reserved' || status === 'sold') {
            svgPlot.style.mixBlendMode = 'multiply';
            svgPlot.style.removeProperty("opacity"); // reserved plots will have a blend effect
        }
         // customize opacity based on status if needed

        svgPlot.classList.add('plot');
        svgPlot.classList.add(status);
        svgPlot.dataset.interestedCount = String(Math.max(0, Number.parseInt(plot.total_members, 10) || 0));
        svgPlot.dataset.reviewCount = String(Math.max(0, Number.parseInt(plot.review_count, 10) || 0));
        if (isCornerPlot(plot)) {
            svgPlot.classList.add('corner-plot');
            svgPlot.setAttribute('aria-label', `Plot ${plot.plot_number}, corner plot, ${status}`);
        }

        // svgPlot.dataset.plot =
        //     plot.plot_number;

        const bbox = svgPlot.getBBox();
        addCornerPlotBadge(plot, svgPlot, bbox);
        addPlotHtmlActions(plot, svgPlot);


        // ===== SOLD =====

        if (status === 'sold') {

            svgPlot.classList.add('sold');

            svgPlot.style.cursor =
                'not-allowed';

            svgPlot.addEventListener(
                'mouseenter',
                e => {
                    svgPlot.dataset.hovered = 'true';
                    syncPlotLabelState(svgPlot);
                    showTooltip(
                        e,
                        `
                        <div class="tooltip-title">
                            Plot ${plot.plot_number}
                        </div>

                        <div class="text-danger fw-bold">
                            SOLD
                        </div>

                        ${isCornerPlot(plot) ? '<div class="corner-tooltip"><i class="bi bi-sign-turn-right-fill"></i> CORNER PLOT</div>' : ''}

                        <hr>

                        <div>
                            Area :
                            ${plot.area_sqyds || 0}
                            Sq.Yds
                        </div>

                        <div>
                            Price :
                            ₹${Number(
                                plot.price || 0
                            ).toLocaleString()}
                        </div>
                        `
                    );

                }
            );

            svgPlot.addEventListener(
                'mouseleave',
                () => {
                    svgPlot.dataset.hovered = 'false';
                    syncPlotLabelState(svgPlot);
                    hideTooltip();
                }
            );

            svgPlot.addEventListener(
                'click',
                () => {
                    clearPlotSelection();
                    hideTooltip();
                    const mode = getExperienceMode();
                    const label = mode === 'villa' ? 'Villa' : mode === 'construction' ? 'Construction option' : 'Plot';
                    AppPopup.error(`${label} ${plot.plot_number} has already been sold.`, 'Already sold');
                }
            );

            return;
        }

        // ===== RESERVED =====

        if (status === 'reserved') {

            svgPlot.classList.add(
                'reserved'
            );
            svgPlot.addEventListener(
                'mouseenter',
                e => {
                    svgPlot.dataset.hovered = 'true';
                    syncPlotLabelState(svgPlot);
                    showTooltip(
                        e,
                        `
                        <div class="tooltip-title">
                            Plot ${plot.plot_number}
                        </div>

                        <div class="text-warning fw-bold">
                            RESERVED
                        </div>

                        ${isCornerPlot(plot) ? '<div class="corner-tooltip"><i class="bi bi-sign-turn-right-fill"></i> CORNER PLOT</div>' : ''}

                        <hr>

                        <div>
                            Interested Buyers :
                            ${plot.total_members || 0}
                        </div>

                        <div>
                            Area :
                            ${plot.area_sqyds || 0}
                            Sq.Yds
                        </div>

                        <div>
                            Price :
                            ₹${Number(
                                plot.price || 0
                            ).toLocaleString()}
                        </div>
                        `
                    );

                }
            );

            svgPlot.addEventListener(
                'mouseleave',
                () => {
                    svgPlot.dataset.hovered = 'false';
                    syncPlotLabelState(svgPlot);
                    hideTooltip();
                }
            );

            svgPlot.addEventListener(
                'click',
                () => {
                    clearPlotSelection();
                    if (Number(plot.total_members || 0) > 0) {
                        showInterestConfirmation(plot, svgPlot);
                    } else {
                        openBooking(plot, svgPlot);
                    }
                }
            );

            return;
        }

        // ===== AVAILABLE =====

        svgPlot.classList.add(
            'available'
        );

        svgPlot.addEventListener(
            'mouseenter',
            e => {
                svgPlot.classList.remove('search-highlight');
                svgPlot.dataset.hovered = 'true';
                syncPlotLabelState(svgPlot);
                showTooltip(
                    e,
                    `
                    <div class="tooltip-title">
                        Plot ${plot.plot_number}
                    </div>

                    <div class="text-success fw-bold">
                        AVAILABLE
                    </div>

                    ${isCornerPlot(plot) ? '<div class="corner-tooltip"><i class="bi bi-sign-turn-right-fill"></i> CORNER PLOT</div>' : ''}

                    <hr>

                    <div>
                        Area :
                        ${plot.area_sqyds || 0}
                        Sq.Yds
                    </div>

                    <div>
                        Price :
                        ₹${Number(
                            plot.price || 0
                        ).toLocaleString()}
                    </div>

                    <div>
                        Facing :
                        ${plot.facing || '-'}
                    </div>

                    <div>
                        Road :
                        ${plot.road_width || '-'} Ft
                    </div>
                    `
                );

            }
        );

        svgPlot.addEventListener(
            'mouseleave',
            () => {
                svgPlot.dataset.hovered = 'false';
                syncPlotLabelState(svgPlot);
                hideTooltip();
            }
        );

        svgPlot.addEventListener(
            'click',
            () => {
                clearPlotSelection();
                openBooking(
                    plot,
                    svgPlot
                );
            }
        );
    });
}

function showInterestConfirmation(plot, svgPlot) {
    const modalElement = document.getElementById('interestConfirmModal');
    const confirmationText = document.getElementById('interestConfirmText');
    const memberCount = Number(plot.total_members || 0);

    if (!modalElement || !confirmationText) {
        return;
    }

    pendingInterestPlot = { plot, svgPlot };
    confirmationText.textContent = `Plot ${plot.plot_number} already has ${memberCount} interested ${memberCount === 1 ? 'buyer' : 'buyers'} registered.`;
    bootstrap.Modal.getOrCreateInstance(modalElement).show();
}

function registerInterestFromConfirmation() {
    const modalElement = document.getElementById('interestConfirmModal');
    const pendingPlot = pendingInterestPlot;

    if (!modalElement || !pendingPlot) {
        return;
    }

    modalElement.addEventListener('hidden.bs.modal', () => {
        openBooking(pendingPlot.plot, pendingPlot.svgPlot);
        pendingInterestPlot = null;
    }, { once: true });

    bootstrap.Modal.getOrCreateInstance(modalElement).hide();
}

function searchPlot(event) {
    const input = document.getElementById('searchPlot');
    const value = String(event?.target?.value ?? input?.value ?? '').trim();
    window.clearTimeout(searchPlotDebounceTimer);

    if (!value) {
        clearPlotSelection();
        showSearchFeedback('Enter a plot number to search the layout.', 'info');
        return;
    }

    const normalized = value.toLowerCase();
    const plot = originalPlots.find(p => String(p.plot_number).trim().toLowerCase() === normalized);
    if (!plot) {
        clearPlotSelection();
        showSearchFeedback(`No plot found for number ${value}.`, 'warning');
        return;
    }

    const svgPlot = document.getElementById(`plot_${plot.plot_number}`);
    if (!svgPlot || !svgPlot.classList.contains('plot')) {
        clearPlotSelection();
        showSearchFeedback(`The plot ${value} is not available on the current map view.`, 'warning');
        return;
    }

    flashPlotSelection(svgPlot);
    svgPlot.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
    showSearchFeedback(`Plot ${plot.plot_number} (${plot.status}) is highlighted.`, 'success');
}

function showSearchFeedback(message, type = 'info') {
    const target = document.getElementById('searchPlotFeedback');
    if (!target) return;
    const icon = type === 'warning' ? 'exclamation-triangle-fill' : type === 'success' ? 'check-circle-fill' : 'info-circle-fill';
    target.className = `form-text mt-2 d-block ${type === 'warning' ? 'text-danger' : type === 'success' ? 'text-success' : 'text-muted'}`;
    target.innerHTML = `<i class="bi bi-${icon} me-2"></i>${message}`;
    target.classList.remove('d-none');
}

function zoomIn() {

    if (!mapLayer) {
        return;
    }

    currentScale += 0.1;

    mapLayer.setAttribute(
        'transform',
        `scale(${currentScale})`
    );
}

function zoomOut() {

    if (!mapLayer) {
        return;
    }

    currentScale =
        Math.max(
            0.5,
            currentScale - 0.1
        );

    mapLayer.setAttribute(
        'transform',
        `scale(${currentScale})`
    );
}

function openBooking(
    plot,
    element
) {

    if (window.SharedPropertyUI) {
        selectedPlot = plot;
        SharedPropertyUI.open({ property: plot, layout: selectedLayout, type: 'plot', onComplete: loadPlots });
        return;
    }

    document
        .querySelectorAll('.plot')
        .forEach(p => {
            p.classList.remove('selected');
            // Reset label colors for non-selected plots
            p.querySelectorAll('.plot-label').forEach(label => {
                const pStatus = p.className.includes('available') ? 'available' : 
                               p.className.includes('reserved') ? 'reserved' : 'sold';
                label.style.fill = pStatus === 'available' ? '#1f2937' : 
                                  pStatus === 'reserved' ? '#1f2937' : '#1f2937';
            });
        });

    if (element) {
        element.classList.add('selected');
        element.dataset.hovered = 'true';
        syncPlotLabelState(element);
    }

    selectedPlot = plot;

    const bookingNotice = document.getElementById('bookingNotice');
    const mode = getExperienceMode();
    if (bookingNotice) {
        const memberCount = Number(plot.total_members || 0);
        bookingNotice.className = plot.status.toLowerCase() === 'reserved'
            ? 'alert alert-warning mb-4'
            : 'alert alert-success mb-4';
        bookingNotice.innerHTML = mode === 'villa'
            ? '<i class="bi bi-house-heart-fill"></i> Tell us your villa preferences and choose a private visit time.'
            : mode === 'construction'
                ? '<i class="bi bi-tools"></i> Share your construction requirements to receive a tailored consultation and estimate.'
                : plot.status.toLowerCase() === 'reserved'
            ? `<i class="bi bi-people"></i> ${memberCount} interested ${memberCount === 1 ? 'buyer is' : 'buyers are'} already registered. Add your details to register your interest.`
            : '<i class="bi bi-info-circle"></i> Please fill in your details to reserve this plot';
    }

    document
        .getElementById(
            'plotInfo'
        )
        .innerHTML =
        `<strong>${mode === 'villa' ? 'Villa' : mode === 'construction' ? 'Construction Option' : 'Plot'} ${plot.plot_number}</strong> | ${plot.area_sqyds} Sq.Yds | <span class="badge bg-info">${plot.status.toUpperCase()}</span>${mode === 'plot' && isCornerPlot(plot) ? ' | <span class="badge bg-warning text-dark"><i class="bi bi-sign-turn-right-fill"></i> CORNER PLOT</span>' : ''}`;

    const label =
        document.getElementById(
            'selectedPlotLabel'
        );

    if (label) {

        label.innerHTML =
            `<i class="bi ${mode === 'villa' ? 'bi-house-heart' : mode === 'construction' ? 'bi-building' : 'bi-geo-alt'}"></i> ${mode === 'villa' ? 'Villa' : mode === 'construction' ? 'Option' : 'Plot'} ${plot.plot_number}`;
    }

    const modalTitle = document.getElementById('bookingModalLabel');
    const submitButton = document.getElementById('bookingSubmitButton');
    if (modalTitle) modalTitle.innerHTML = mode === 'villa' ? '<i class="bi bi-house-heart-fill"></i> Schedule a Villa Visit' : mode === 'construction' ? '<i class="bi bi-building-fill"></i> Request Construction Quote' : '<i class="bi bi-bookmark-star"></i> Reserve Your Plot';
    if (submitButton) submitButton.innerHTML = mode === 'villa' ? '<i class="bi bi-calendar2-check"></i> Request Private Visit' : mode === 'construction' ? '<i class="bi bi-calculator"></i> Request Estimate' : '<i class="bi bi-check-lg"></i> Reserve Plot';
    renderPropertySpecificFields(mode);

    const bookingModal = document.getElementById('bookingModal');
    const form = document.getElementById('bookingForm');

    form?.classList.remove('was-validated');
    bookingModal?.querySelector('.modal-body')?.scrollTo({ top: 0 });

    bootstrap.Modal
        .getOrCreateInstance(bookingModal)
        .show();
}

function renderPropertySpecificFields(mode) {
    const fields = document.getElementById('propertySpecificFields');
    if (!fields) return;
    if (mode === 'villa') {
        fields.innerHTML = '<div class="col-md-6"><label class="form-label fw-semibold">Preferred Villa Configuration *</label><select class="form-select form-select-lg" name="villa_configuration" required><option value="">Choose configuration</option><option>2 BHK</option><option>3 BHK</option><option>4 BHK</option><option>Luxury Duplex</option></select></div><div class="col-md-6"><label class="form-label fw-semibold">Purchase Purpose *</label><select class="form-select form-select-lg" name="purchase_purpose" required><option value="">Choose purpose</option><option>Self occupancy</option><option>Investment</option><option>Holiday home</option></select></div>';
    } else if (mode === 'construction') {
        fields.innerHTML = '<div class="col-md-4"><label class="form-label fw-semibold">Construction Type *</label><select class="form-select form-select-lg" name="construction_type" required><option value="">Choose type</option><option>Independent House</option><option>Villa Construction</option><option>Commercial Building</option><option>Renovation</option></select></div><div class="col-md-4"><label class="form-label fw-semibold">Expected Built-up Area *</label><input class="form-control form-control-lg" type="number" name="builtup_area" min="100" max="100000" placeholder="Sq.Ft" required></div><div class="col-md-4"><label class="form-label fw-semibold">Number of Floors *</label><select class="form-select form-select-lg" name="number_of_floors" required><option value="">Choose floors</option><option>Ground only</option><option>G + 1</option><option>G + 2</option><option>G + 3 or more</option></select></div>';
    } else {
        fields.replaceChildren();
    }
}

function removeSelected() {

    document
        .querySelectorAll('.plot')
        .forEach(
            p => {
                p.classList.remove('selected');
                p.dataset.hovered = 'false';
                syncPlotLabelState(p);
            }
        );

    selectedPlot = null;
}

function resetBookingModal() {
    const form = document.getElementById('bookingForm');

    form?.reset();
    form?.classList.remove('was-validated');
    const bookingNotice = document.getElementById('bookingNotice');
    if (bookingNotice) {
        bookingNotice.className = 'alert alert-success mb-4';
        bookingNotice.innerHTML = '<i class="bi bi-info-circle"></i> Please fill in your details to reserve this plot';
    }
    document.getElementById('bookingModal')
        ?.querySelector('.modal-body')
        ?.scrollTo({ top: 0 });
    removeSelected();
}

async function submitBooking(
    e
) {

    e.preventDefault();

    if (!selectedPlot) {
        AppPopup.error('Please select a plot.', 'Selection required');
        return;
    }

    const form = e.target;

    if (!form.checkValidity()) {
        form.classList.add('was-validated');
        return;
    }

    const fd =
        new FormData(
            form
        );
    const experienceMode = getExperienceMode();
    const specificDetails = experienceMode === 'villa'
        ? `Villa configuration: ${fd.get('villa_configuration')}; Purchase purpose: ${fd.get('purchase_purpose')}`
        : experienceMode === 'construction'
            ? `Construction type: ${fd.get('construction_type')}; Built-up area: ${fd.get('builtup_area')} Sq.Ft; Floors: ${fd.get('number_of_floors')}`
            : '';

    const payload = {

        plot_id:
            selectedPlot.id,

        plot_number:
            selectedPlot.plot_number,

        full_name:
            fd.get(
                'full_name'
            ),

        mobile:
            fd.get(
                'mobile'
            ),

        email:
            fd.get(
                'email'
            ),

        city:
            fd.get(
                'city'
            ),

        budget_range:
            fd.get(
                'budget_range'
            ),

        appointment_datetime:
            fd.get(
                'appointment_datetime'
            ),

        note: [specificDetails, fd.get('note')].filter(Boolean).join('\n'),
        source: experienceMode === 'villa' ? 'villa_reservation' : experienceMode === 'construction' ? 'construction_plot_reservation' : 'layout_plot_reservation',
        reserve_inventory: true,
        referral_code: new URLSearchParams(window.location.search).get('ref') || ''
    };

    console.log('Submitting booking:', payload);

    try {
        const response =
            await fetch(
                API_URL('/enquiries'), 
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(payload)
                }
            );

        console.log('Booking response status:', response.status);

        if (!response.ok) {
            throw new Error('Failed to submit booking: ' + response.status);
        }

        const result = await response.json();
        console.log('Booking response:', result);

        if (result.error) {
            throw new Error(result.error);
        }
        
        await loadPlots();
        const bookingModal = document.getElementById('bookingModal');
        bookingModal.addEventListener('hidden.bs.modal', () => {
            openReviewForm({ mandatory: true, enquiryId: result.data?.id || null, customerName: payload.full_name });
        }, { once: true });
        bootstrap.Modal.getOrCreateInstance(bookingModal).hide();
    }
    catch (error) {
        console.error('Error submitting booking:', error);
        AppPopup.error('Failed to submit booking: ' + error.message, 'Booking failed');
    }
}

function showTooltip(
    e,
    html
) {

    const tooltip =
        document.getElementById(
            'plotTooltip'
        );

    tooltip.innerHTML = html;

    tooltip.style.left =
        (e.clientX + 10)
        + 'px';

    tooltip.style.top =
        (e.clientY + 10)
        + 'px';

    tooltip.style.display =
        'block';
}

function hideTooltip() {

    document
        .getElementById(
            'plotTooltip'
        )
        .style.display =
        'none';
}

