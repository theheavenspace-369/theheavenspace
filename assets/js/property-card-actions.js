(function () {
    let layout = null;
    let properties = [];

    const styles = document.createElement('style');
    styles.textContent = '.construction-plot-card{position:relative}.construction-plot-card .property-card-icon-actions{display:flex;justify-content:flex-end;gap:.45rem;margin-bottom:.9rem}.property-icon-btn{display:inline-flex;align-items:center;justify-content:center;gap:.3rem;min-width:2.45rem;height:2.45rem;padding:0 .65rem;border:1px solid #dbeafe;border-radius:.75rem;background:#eff6ff;color:#1d4ed8;font-weight:800;transition:.2s}.property-icon-btn:hover{transform:translateY(-2px);background:#1d4ed8;color:#fff;box-shadow:0 7px 16px #1d4ed833}.property-icon-btn i{font-size:1rem}.property-icon-btn .property-action-count{align-items:center;background:#dc2626;border:2px solid #fff;border-radius:999px;color:#fff;display:inline-flex;font-size:.65rem;font-weight:900;justify-content:center;min-height:19px;min-width:19px;padding:0 4px}';
    document.head.appendChild(styles);

    const iconButtons = (property) => `
        <div class="property-card-icon-actions" data-property-actions="${property.id}">
            <button type="button" class="property-icon-btn" data-shared-interest title="Interested customers">
                <i class="bi bi-people-fill"></i><span>${Number(property.interested_count || property.total_members || 0)}</span>
            </button>
            <button type="button" class="property-icon-btn" data-shared-reviews title="Customer reviews">
                <i class="bi bi-eye-fill"></i><span>${Number(property.review_count || 0)}</span>
            </button>
            <button type="button" class="property-icon-btn" data-shared-add-review title="Add review">
                <i class="bi bi-star-fill"></i><span class="visually-hidden">Add review</span>
            </button>
        </div>`;

    function refreshFromPage(event) {
        layout = event.detail?.layout || null;
        properties = Array.isArray(event.detail?.properties) ? event.detail.properties : [];
        decorate();
    }

    function decorate() {
        document.querySelectorAll('.construction-plot-card[data-property-id]').forEach((card) => {
            const property = properties.find((item) => String(item.id) === String(card.dataset.propertyId));
            if (!property || card.querySelector('.property-card-icon-actions')) return;
            card.insertAdjacentHTML('afterbegin', iconButtons(property));
        });

        const villa = document.querySelector('.experience-detail');
        if (villa) {
            const property = properties[0] || null;
            villa.querySelector('.villa-corner-actions')?.remove();
            if (property && !villa.querySelector('.property-card-icon-actions')) {
                villa.insertAdjacentHTML('afterbegin', iconButtons(property));
            }
        }
    }

    document.addEventListener('click', (event) => {
        const action = event.target.closest('[data-property-actions]');
        if (!action) return;
        const property = properties.find((item) => String(item.id) === String(action.dataset.propertyActions));
        if (!property || !window.SharedPropertyUI) return;
        const label = property.plot_number || property.title || property.name || 'Property';

        if (event.target.closest('[data-shared-interest]')) {
            SharedPropertyUI.interests(property, label);
        } else if (event.target.closest('[data-shared-reviews]')) {
            SharedPropertyUI.reviews(property, layout, label);
        } else if (event.target.closest('[data-shared-add-review]')) {
            SharedPropertyUI.addReview(property, layout, label, () => document.dispatchEvent(new Event('property-inventory-refresh-requested')));
        }
    });

    new MutationObserver(decorate).observe(document.body, { childList: true, subtree: true });
    document.addEventListener('property-inventory-loaded', refreshFromPage);
})();
