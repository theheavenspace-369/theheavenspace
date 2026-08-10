// This is a static export with no backend. Every /api/... call the page code
// makes gets intercepted here.
//
// Reads for categories, layouts-by-category, plots-by-layout, and the global
// review list are answered from pre-generated snapshots (../snapshot/...) as
// of the last export, then overlaid with anything a visitor has done in
// *this browser* (see below).
//
// Writes (reserve a plot, submit a review) can't reach a real server, so
// instead they're kept in this browser's localStorage and folded back into
// the reads above - a booking marks the plot Reserved, bumps its interest
// count, and shows up in "who's interested" for as long as this browser's
// storage isn't cleared. It's a local simulation, not a real reservation:
// nothing here is visible to anyone else or to the business.
(function () {
    var SNAPSHOT_BASE = '../snapshot';
    var STORAGE_ENQUIRIES = 'staticShim.enquiries';
    var STORAGE_REVIEWS = 'staticShim.reviews';
    var originalFetch = window.fetch ? window.fetch.bind(window) : null;

    function jsonResponse(body, status) {
        return new Response(JSON.stringify(body), {
            status: status || 200,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    function emptyList() {
        return jsonResponse({ data: [], error: null, meta: { total: 0 } });
    }

    function uid() {
        if (window.crypto && window.crypto.randomUUID) return window.crypto.randomUUID();
        return 'local-' + Date.now().toString(16) + '-' + Math.random().toString(16).slice(2);
    }

    function nowIso() {
        return new Date().toISOString().slice(0, 19).replace('T', ' ');
    }

    function loadLocal(key) {
        try {
            var raw = window.localStorage.getItem(key);
            var parsed = raw ? JSON.parse(raw) : [];
            return Array.isArray(parsed) ? parsed : [];
        } catch (e) {
            return [];
        }
    }

    function saveLocal(key, rows) {
        try {
            window.localStorage.setItem(key, JSON.stringify(rows));
        } catch (e) {
            // Storage unavailable (private browsing, quota) - the booking
            // still "succeeds" for this page view, it just won't persist.
        }
    }

    function parseApiRequest(url) {
        var parsed;
        try {
            parsed = new URL(url, window.location.href);
        } catch (e) {
            return null;
        }
        var match = parsed.pathname.match(/\/api\/([a-zA-Z-]+)\/?$/);
        if (!match) return null;
        return { endpoint: match[1], params: parsed.searchParams };
    }

    function readBody(init) {
        if (!init || !init.body) return {};
        try {
            return JSON.parse(init.body);
        } catch (e) {
            return {};
        }
    }

    function fetchSnapshotPlots(layoutId) {
        return originalFetch(SNAPSHOT_BASE + '/plots/' + encodeURIComponent(layoutId) + '.json')
            .then(function (res) { return res.ok ? res.json() : { data: [] }; })
            .then(function (body) { return body.data || []; })
            .catch(function () { return []; });
    }

    // --- writes -------------------------------------------------------

    function handleCreateEnquiry(body) {
        var required = ['plot_number', 'full_name', 'mobile', 'email', 'city'];
        for (var i = 0; i < required.length; i++) {
            if (!body[required[i]]) {
                return Promise.resolve(jsonResponse({ data: null, error: 'Missing field: ' + required[i] }, 400));
            }
        }
        var plotId = String(body.plot_id || '');
        var layoutId = String(body.project_layout_id || '');
        var shouldReserve = !('reserve_inventory' in body) || !!body.reserve_inventory;

        return fetchSnapshotPlots(layoutId).then(function (plots) {
            var plot = plots.filter(function (p) { return String(p.id) === plotId; })[0];
            if (plot && String(plot.status).toLowerCase() === 'sold') {
                return jsonResponse({ data: null, error: 'This plot has already been sold and cannot accept registrations.' }, 409);
            }

            var enquiries = loadLocal(STORAGE_ENQUIRIES);
            var id = uid();
            enquiries.push({
                id: id,
                plot_id: plotId || null,
                project_layout_id: layoutId || null,
                plot_number: body.plot_number,
                full_name: body.full_name,
                mobile: body.mobile,
                email: body.email,
                city: body.city,
                budget_range: body.budget_range || null,
                message: body.note || body.message || null,
                source: body.source || null,
                reserved: shouldReserve && plot && String(plot.status).toLowerCase() !== 'sold',
                created_at: nowIso()
            });
            saveLocal(STORAGE_ENQUIRIES, enquiries);

            var totalMembers = ((plot && Number(plot.total_members)) || 0) +
                enquiries.filter(function (e) { return e.plot_id === plotId; }).length;

            return jsonResponse({ data: { id: id, total_members: totalMembers }, error: null }, 201);
        });
    }

    function handleCreateReview(body) {
        var name = String(body.customer_name || '').trim();
        var rating = Number(body.rating);
        var comments = String(body.comments || '').trim();
        if (name.length < 2) return Promise.resolve(jsonResponse({ data: null, error: 'Please enter a valid name.' }, 422));
        if (!(rating >= 1 && rating <= 5)) return Promise.resolve(jsonResponse({ data: null, error: 'Please choose a star rating.' }, 422));
        if (comments.length < 3) return Promise.resolve(jsonResponse({ data: null, error: 'Comments must be at least 3 characters.' }, 422));

        var enquiryId = body.enquiry_id ? String(body.enquiry_id) : null;
        var reviews = loadLocal(STORAGE_REVIEWS);
        if (enquiryId && reviews.some(function (r) { return r.enquiry_id === enquiryId; })) {
            return Promise.resolve(jsonResponse({ data: null, error: 'A review has already been submitted for this reservation.' }, 409));
        }

        var id = uid();
        reviews.push({
            id: id,
            enquiry_id: enquiryId,
            plot_id: body.plot_id ? String(body.plot_id) : null,
            project_layout_id: body.project_layout_id ? String(body.project_layout_id) : null,
            customer_name: name,
            rating: rating,
            comments: comments,
            created_at: nowIso()
        });
        saveLocal(STORAGE_REVIEWS, reviews);
        return Promise.resolve(jsonResponse({ data: { id: id }, error: null }, 201));
    }

    // --- reads (snapshot + local overlay) ------------------------------

    function handleGetPlots(layoutId) {
        var enquiries = loadLocal(STORAGE_ENQUIRIES).filter(function (e) { return e.project_layout_id === layoutId; });
        var reviews = loadLocal(STORAGE_REVIEWS).filter(function (r) { return r.project_layout_id === layoutId; });
        return fetchSnapshotPlots(layoutId).then(function (plots) {
            var mapped = plots.map(function (plot) {
                var plotId = String(plot.id);
                var localForPlot = enquiries.filter(function (e) { return e.plot_id === plotId; });
                var reserved = localForPlot.some(function (e) { return e.reserved; });
                var out = Object.assign({}, plot);
                if (reserved && String(plot.status).toLowerCase() !== 'sold') out.status = 'Reserved';
                out.total_members = (Number(plot.total_members) || 0) + localForPlot.length;
                out.review_count = (Number(plot.review_count) || 0) +
                    reviews.filter(function (r) { return r.plot_id === plotId; }).length;
                return out;
            });
            return jsonResponse({ data: mapped, error: null });
        });
    }

    function handleGetEnquiriesInterests(plotId) {
        var reviews = loadLocal(STORAGE_REVIEWS);
        var rows = loadLocal(STORAGE_ENQUIRIES)
            .filter(function (e) { return e.plot_id === plotId; })
            .sort(function (a, b) { return b.created_at < a.created_at ? -1 : 1; })
            .map(function (e) {
                var review = reviews.filter(function (r) { return r.enquiry_id === e.id; })[0];
                return { name: e.full_name, rating: review ? review.rating : null, comments: review ? review.comments : null };
            });
        return Promise.resolve(jsonResponse({ data: rows, error: null }));
    }

    function handleGetPlotInterests(plotId) {
        var reviews = loadLocal(STORAGE_REVIEWS);
        var rows = loadLocal(STORAGE_ENQUIRIES)
            .filter(function (e) { return e.plot_id === plotId; })
            .sort(function (a, b) { return b.created_at < a.created_at ? -1 : 1; })
            .map(function (e) {
                var review = reviews.filter(function (r) { return r.enquiry_id === e.id; })[0];
                return { customer_name: e.full_name, rating: review ? review.rating : null, comments: review ? review.comments : null };
            });
        return Promise.resolve(jsonResponse({ data: rows, error: null }));
    }

    function handleGetReviews(params) {
        var plotId = params.get('plot_id');
        var layoutId = params.get('project_layout_id');
        var local = loadLocal(STORAGE_REVIEWS).map(function (r) {
            return { id: r.id, customer_name: r.customer_name, rating: r.rating, comments: r.comments, created_at: r.created_at, plot_id: r.plot_id, project_layout_id: r.project_layout_id };
        });

        if (plotId || layoutId) {
            var filtered = local.filter(function (r) {
                return plotId ? r.plot_id === plotId : r.project_layout_id === layoutId;
            });
            return Promise.resolve(jsonResponse({ data: filtered, error: null, meta: { total: filtered.length } }));
        }

        return originalFetch(SNAPSHOT_BASE + '/reviews.json')
            .then(function (res) { return res.ok ? res.json() : { data: [], meta: { total: 0 } }; })
            .catch(function () { return { data: [], meta: { total: 0 } }; })
            .then(function (snapshot) {
                var combined = (snapshot.data || []).concat(local).sort(function (a, b) {
                    return String(b.created_at) < String(a.created_at) ? -1 : 1;
                }).slice(0, 500);
                return jsonResponse({ data: combined, error: null, meta: { total: (snapshot.meta && snapshot.meta.total || 0) + local.length } });
            });
    }

    // --- dispatch -------------------------------------------------------

    window.fetch = function (input, init) {
        init = init || {};
        var url = typeof input === 'string' ? input : (input && input.url) || '';
        var api = parseApiRequest(url);
        if (!api) return originalFetch ? originalFetch(input, init) : Promise.reject(new Error('fetch unavailable'));

        var method = (init.method || 'GET').toUpperCase();

        if (method !== 'GET') {
            var body = readBody(init);
            if (api.endpoint === 'enquiries') return handleCreateEnquiry(body);
            if (api.endpoint === 'reviews') return handleCreateReview(body);
            return Promise.resolve(jsonResponse({
                data: null,
                error: 'This is a static preview - that action is not available here. Please contact us directly.'
            }, 422));
        }

        if (api.endpoint === 'categories') {
            return originalFetch(SNAPSHOT_BASE + '/categories.json').catch(emptyList);
        }
        if (api.endpoint === 'layouts') {
            var categoryId = api.params.get('project_category');
            if (categoryId) {
                return originalFetch(SNAPSHOT_BASE + '/layouts/' + encodeURIComponent(categoryId) + '.json')
                    .then(function (res) { return res.ok ? res : emptyList(); })
                    .catch(emptyList);
            }
            return Promise.resolve(emptyList());
        }
        if (api.endpoint === 'plots') {
            var layoutId = api.params.get('project_layout_id');
            if (layoutId) return handleGetPlots(layoutId);
            return Promise.resolve(emptyList());
        }
        if (api.endpoint === 'reviews') {
            return handleGetReviews(api.params);
        }
        if (api.endpoint === 'enquiries') {
            var plotIdForInterests = api.params.get('plot_id');
            if (plotIdForInterests) return handleGetEnquiriesInterests(plotIdForInterests);
            return Promise.resolve(emptyList());
        }
        if (api.endpoint === 'plot-interests') {
            var plotIdForPI = api.params.get('plot_id');
            if (plotIdForPI) return handleGetPlotInterests(plotIdForPI);
            return Promise.resolve(emptyList());
        }

        return Promise.resolve(emptyList());
    };
})();
