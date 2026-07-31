(function () {
    'use strict';

    const STORAGE_KEY = 'enableRecentRecords';
    const TTL_KEY = 'recentRecordsCacheTtl';
    const PINNED_KEY = 'nsftRrPinned';
    const HISTORY_KEY = 'nsftRrHistory';
    const SNAPSHOT_KEY = 'nsftRrSnapshot';
    const HISTORY_MAX = 50;
    const SNAPSHOT_MAX = 300;
    const HOSTS_MAX = 8;
    const VISIT_DELAY_MS = 3000;
    const VISIT_STRIP_PARAMS = ['e', 'whence', 'cp'];
    const SOURCE_URL = '/app/common/otherlists/recentrecords.nl';
    const DEFAULT_TTL_MS = 60 * 1000;
    const TRIGGER_SEL = '[data-automation-id="recentRecords"]';
    const POPOVER_SEL = 'div[data-widget="Popover"]';
    const ALL_RECENTS_HREF_MATCH = '/app/common/otherlists/recentrecords.nl';
    const INJECTED_FLAG = 'nsftRrInjected';

    let _cache = null;
    let _fetching = null;
    let _observer = null;
    let _unsubObserver = null;
    let _observerTimeout = null;
    let _inited = false;
    let _cacheTtlMs = DEFAULT_TTL_MS;
    let _lastHoverTs = 0;
    let _pinned = [];
    let _kbIndex = -1;
    let _history = {};

    chrome.storage.local.get({
        [STORAGE_KEY]: true,
        [TTL_KEY]: 60,
        [PINNED_KEY]: [],
        [HISTORY_KEY]: {},
        [SNAPSHOT_KEY]: {}
    }, (items) => {
        _cacheTtlMs = Math.max(0, (parseInt(items[TTL_KEY], 10) || 0)) * 1000;
        _pinned = Array.isArray(items[PINNED_KEY]) ? items[PINNED_KEY] : [];
        _history = (items[HISTORY_KEY] && typeof items[HISTORY_KEY] === 'object') ? items[HISTORY_KEY] : {};
        const snap = items[SNAPSHOT_KEY] && items[SNAPSHOT_KEY][location.host];
        if (snap && Array.isArray(snap.items)) {
            _cache = { ts: snap.ts || 0, items: snap.items, error: null };
        }
        if (!items[STORAGE_KEY]) return;
        init();
    });

    chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== 'local') return;
        if (changes[TTL_KEY]) _cacheTtlMs = Math.max(0, (parseInt(changes[TTL_KEY].newValue, 10) || 0)) * 1000;
        if (changes[PINNED_KEY]) _pinned = Array.isArray(changes[PINNED_KEY].newValue) ? changes[PINNED_KEY].newValue : [];
        if (changes[HISTORY_KEY]) {
            const h = changes[HISTORY_KEY].newValue;
            _history = (h && typeof h === 'object') ? h : {};
        }
        if (changes[SNAPSHOT_KEY]) {
            const snap = (changes[SNAPSHOT_KEY].newValue || {})[location.host];
            if (snap && Array.isArray(snap.items) && (!_cache || (snap.ts || 0) > (_cache.ts || 0))) {
                _cache = { ts: snap.ts || 0, items: snap.items, error: null };
            }
        }
        if (changes[STORAGE_KEY]) {
            if (changes[STORAGE_KEY].newValue) init();
            else teardown();
        }
    });

    function init() {
        if (_inited) return;
        _inited = true;
        document.documentElement.classList.add('nsft-rr-arm');
        document.addEventListener('mouseover', onMouseOver, true);
        document.addEventListener('focusin', onMouseOver, true);
        document.addEventListener('visibilitychange', onVisibilityChange);

        setTimeout(captureVisit, VISIT_DELAY_MS);
    }

    function teardown() {
        _inited = false;
        document.documentElement.classList.remove('nsft-rr-arm');
        document.removeEventListener('mouseover', onMouseOver, true);
        document.removeEventListener('focusin', onMouseOver, true);
        document.removeEventListener('visibilitychange', onVisibilityChange);
        disarmObserver();
    }

    function onVisibilityChange() {
        if (document.visibilityState === 'visible' && _cache) _cache.ts = 0;
    }

    function onMouseOver(e) {
        const trigger = e.target.closest && e.target.closest(TRIGGER_SEL);
        if (!trigger) return;
        const now = Date.now();
        if (now - _lastHoverTs < 200) return;
        _lastHoverTs = now;
        prefetch();
        armPopoverObserver();
    }

    function prefetch() {
        if (_cache && _cacheTtlMs > 0 && (Date.now() - _cache.ts) < _cacheTtlMs) return;
        if (_fetching) return;
        _fetching = fetchAndParse()
            .then((items) => {
                _cache = { ts: Date.now(), items, error: null };
                _fetching = null;
                persistSnapshot(items);
                tryHijack();
                refreshOpenPanel();
            })
            .catch((err) => {
                _fetching = null;
                if (!_cache || !(_cache.items || []).length) {
                    _cache = { ts: Date.now(), items: [], error: err && err.message ? err.message : String(err) };
                }
                console.warn('NSFT recent_records fetch failed', err);
                tryHijack();
                refreshOpenPanel();
            });
    }

    function persistSnapshot(items) {
        try {
            chrome.storage.local.get({ [SNAPSHOT_KEY]: {} }, (st) => {
                const all = (st[SNAPSHOT_KEY] && typeof st[SNAPSHOT_KEY] === 'object') ? st[SNAPSHOT_KEY] : {};
                all[location.host] = { ts: Date.now(), items: items.slice(0, SNAPSHOT_MAX) };
                pruneHosts(all, (v) => (v && v.ts) || 0);
                chrome.storage.local.set({ [SNAPSHOT_KEY]: all });
            });
        } catch (e) { }
    }

    function pruneHosts(map, tsOf) {
        const hosts = Object.keys(map);
        if (hosts.length <= HOSTS_MAX) return;
        hosts.sort((a, b) => tsOf(map[b]) - tsOf(map[a])).slice(HOSTS_MAX).forEach((h) => { delete map[h]; });
    }

    function fetchAndParse() {
        return fetch(SOURCE_URL, { credentials: 'include', headers: { 'Accept': 'text/html' } })
            .then((res) => {
                if (!res.ok) throw new Error('HTTP ' + res.status);
                return res.text();
            })
            .then((html) => {
                const doc = new DOMParser().parseFromString(html, 'text/html');
                const rows = doc.querySelectorAll('tr.uir-list-row-tr');
                const items = [];
                rows.forEach((row) => {
                    const cells = row.querySelectorAll('td');
                    if (cells.length < 4) return;
                    const links = cells[0].querySelectorAll('a.dottedlink');
                    if (!links.length) return;
                    const editUrl = links[0] ? links[0].getAttribute('href') : null;
                    const viewUrl = links[1] ? links[1].getAttribute('href') : editUrl;
                    const name = textOf(cells[1]);
                    const secondary = textOf(cells[2]);
                    const date = textOf(cells[3]);
                    if (!name || !viewUrl) return;
                    items.push({
                        name,
                        secondary,
                        date,
                        viewUrl,
                        editUrl,
                        kind: kindForUrl(viewUrl || editUrl)
                    });
                });
                return items;
            });
    }

    function textOf(cell) {
        return (cell.textContent || '').replace(/[\s\u00a0]+/g, ' ').trim();
    }

    function armPopoverObserver() {
        if (_observer || _unsubObserver) {
            if (_observerTimeout) clearTimeout(_observerTimeout);
            _observerTimeout = setTimeout(disarmObserver, 5000);
            tryHijack();
            return;
        }
        if (window.NSFT_Observer && typeof window.NSFT_Observer.subscribe === 'function') {
            _unsubObserver = window.NSFT_Observer.subscribe(tryHijack, { throttle: 100 });
        } else {
            _observer = new MutationObserver(tryHijack);
            _observer.observe(document.body, { childList: true, subtree: true });
        }
        _observerTimeout = setTimeout(disarmObserver, 5000);
        tryHijack();
    }

    function disarmObserver() {
        if (_unsubObserver) { try { _unsubObserver(); } catch (e) { } _unsubObserver = null; }
        if (_observer) { _observer.disconnect(); _observer = null; }
        if (_observerTimeout) { clearTimeout(_observerTimeout); _observerTimeout = null; }
        revealStalePopover();
    }

    function revealStalePopover() {
        const pop = findRrPopover();
        if (!pop || pop.dataset[INJECTED_FLAG]) return;
        pop.dataset.nsftRrBail = '1';
        pop.style.visibility = '';
        pop.dataset.nsftRrHidden = '';
    }

    function tryHijack() {
        const popover = findRrPopover();
        if (!popover) return;
        if (popover.dataset[INJECTED_FLAG]) return;
        renderInto(popover);
        popover.style.visibility = '';
        popover.dataset.nsftRrHidden = '';
    }

    function refreshOpenPanel() {
        const popover = findRrPopover();
        if (!popover || !popover.dataset[INJECTED_FLAG]) return;
        const panel = popover.querySelector('.nsft-rr-panel');
        if (!panel) return;
        applyRows(panel);
        const input = panel.querySelector('.nsft-rr-search');
        if (input && input.value) filterRows(panel, input.value);
    }

    function findRrPopover() {
        const candidates = document.querySelectorAll(POPOVER_SEL + ' a[href*="' + ALL_RECENTS_HREF_MATCH + '"]');
        for (const a of candidates) {
            const pop = a.closest(POPOVER_SEL);
            if (pop) return pop;
        }
        return null;
    }

    function renderInto(popover) {
        popover.dataset[INJECTED_FLAG] = '1';
        const target = popover.querySelector('div[data-widget="WindowBody"]')
            || popover.querySelector('div[data-widget="ScrollPanel"]')
            || popover.querySelector('[class*="WindowBody"]')
            || popover.querySelector('[class*="ScrollPanel"]')
            || popover.querySelector(':scope > div > div')
            || popover.querySelector(':scope > div')
            || popover;

        const allLink = popover.querySelector('a[href*="' + ALL_RECENTS_HREF_MATCH + '"]');
        const allHref = allLink ? allLink.getAttribute('href') : SOURCE_URL;
        const allLabel = allLink ? (allLink.getAttribute('aria-label') || allLink.textContent.trim()) : i18n('rr_view_all', 'Todos los registros recientes');

        const panel = document.createElement('div');
        panel.className = 'nsft-rr-panel';
        panel.setAttribute('data-theme', resolveTheme(popover));
        panel.innerHTML = panelShellHtml(allHref, allLabel);

        target.innerHTML = '';
        target.appendChild(panel);

        zeroOutWrapperInsets(popover, target);

        wireSearch(panel);
        applyRows(panel);
        wireRowClose(panel, popover);
    }

    function wireRowClose(panel, popover) {
        const list = panel.querySelector('[data-role="list"]');
        if (!list) return;
        list.addEventListener('mousedown', (e) => {
            if (e.target.closest && e.target.closest('.nsft-rr-action-pin')) {
                e.preventDefault();
            }
        });
        list.addEventListener('click', (e) => {
            const pinBtn = e.target.closest && e.target.closest('.nsft-rr-action-pin');
            if (pinBtn) {
                e.preventDefault();
                e.stopPropagation();
                const row = pinBtn.closest('.nsft-rr-row');
                if (row) togglePin(row);
                return;
            }
            if (e.target.closest && e.target.closest('a')) {
                popover.style.display = 'none';
            }
        });
    }

    function zeroOutWrapperInsets(popover, target) {
        const wrappers = new Set();
        let cur = target;
        while (cur && cur !== popover && cur.parentElement) {
            wrappers.add(cur);
            cur = cur.parentElement;
        }
        wrappers.forEach((el) => {
            el.style.padding = '0';
            el.style.margin = '0';
        });
        if (target) {
            target.style.padding = '0';
            target.style.margin = '0';
            target.style.overflow = 'hidden';
        }
    }

    function panelShellHtml(allHref, allLabel) {
        return `
            <div class="nsft-rr-header">
                <div class="nsft-rr-title">${escapeHtml(i18n('rr_title', 'Registros recientes'))}</div>
                <div class="nsft-rr-search-wrap">
                    <svg class="nsft-rr-search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                        <circle cx="11" cy="11" r="7"></circle>
                        <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                    </svg>
                    <input type="text" class="nsft-rr-search" placeholder="${escapeHtml(i18n('rr_search_placeholder', 'Buscar...'))}" autocomplete="off" spellcheck="false">
                    <span class="nsft-rr-count" data-role="count"></span>
                </div>
            </div>
            <div class="nsft-rr-allbar">
                <a class="nsft-rr-allbtn" href="${escapeHtml(allHref)}" target="_self">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                        <line x1="8" y1="6" x2="21" y2="6"></line>
                        <line x1="8" y1="12" x2="21" y2="12"></line>
                        <line x1="8" y1="18" x2="21" y2="18"></line>
                        <line x1="3" y1="6" x2="3.01" y2="6"></line>
                        <line x1="3" y1="12" x2="3.01" y2="12"></line>
                        <line x1="3" y1="18" x2="3.01" y2="18"></line>
                    </svg>
                    <span>${escapeHtml(allLabel)}</span>
                </a>
            </div>
            <div class="nsft-rr-list" role="list" data-role="list">
                <div class="nsft-rr-loading">${escapeHtml(i18n('rr_loading', 'Cargando registros recientes…'))}</div>
            </div>
        `;
    }

    function wireSearch(panel) {
        const input = panel.querySelector('.nsft-rr-search');
        if (!input) return;
        input.addEventListener('input', () => filterRows(panel, input.value || ''));
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                if (input.value) { input.value = ''; filterRows(panel, ''); e.preventDefault(); e.stopPropagation(); }
                return;
            }
            if (e.key === 'ArrowDown') { e.preventDefault(); moveKbSelection(panel, 1); return; }
            if (e.key === 'ArrowUp') { e.preventDefault(); moveKbSelection(panel, -1); return; }
            if (e.key === 'Enter') {
                const row = activeKbRow(panel);
                if (row) {
                    const a = row.querySelector('a.nsft-rr-rowmain');
                    const href = a && a.getAttribute('href');
                    if (href && href !== '#') { e.preventDefault(); window.location.href = href; }
                }
                return;
            }
        });
        setTimeout(() => { try { input.focus(); } catch (_) { } }, 60);
    }

    function applyRows(panel) {
        const list = panel.querySelector('[data-role="list"]');
        if (!list) return;

        const items = buildMergedItems();
        const pinnedUrls = new Set(_pinned.map((p) => p && p.url).filter(Boolean));

        if (!items.length && !_pinned.length) {
            if (_fetching || !_cache) {
                list.innerHTML = `<div class="nsft-rr-loading">${escapeHtml(i18n('rr_loading', 'Cargando registros recientes…'))}</div>`;
                updateCount(panel, 0, 0);
                return;
            }
            if (_cache.error) {
                list.innerHTML = `<div class="nsft-rr-error">${escapeHtml(i18n('rr_error', 'No se pudo cargar la lista.'))}<br><small>${escapeHtml(_cache.error)}</small></div>`;
                updateCount(panel, 0, 0);
                return;
            }
        }

        let html = '';
        if (_pinned.length) {
            html += sectionHeaderHtml(i18n('rr_pinned', 'Fijados'), { pinned: true });
            html += _pinned.map((it) => rowHtml(it, true)).join('');
        }

        const serverItems = items.filter((it) => !pinnedUrls.has(it.viewUrl || it.editUrl || ''));
        const groups = groupByDate(serverItems);
        GROUP_ORDER.forEach((g) => {
            const arr = groups[g.key];
            if (!arr || !arr.length) return;
            html += sectionHeaderHtml(i18n(g.i18n, g.fallback));
            html += arr.map((it) => rowHtml(it, false)).join('');
        });

        if (!html) {
            list.innerHTML = `<div class="nsft-rr-empty">${escapeHtml(i18n('rr_empty', 'No hay registros recientes.'))}</div>`;
            updateCount(panel, 0, 0);
            return;
        }

        list.innerHTML = html;
        const total = list.querySelectorAll('.nsft-rr-row').length;
        updateCount(panel, total, total);
    }

    const GROUP_ORDER = [
        { key: 'today', i18n: 'rr_group_today', fallback: 'Hoy' },
        { key: 'yesterday', i18n: 'rr_group_yesterday', fallback: 'Ayer' },
        { key: 'week', i18n: 'rr_group_week', fallback: 'Esta semana' },
        { key: 'older', i18n: 'rr_group_older', fallback: 'Más antiguo' }
    ];

    function groupByDate(items) {
        const g = { today: [], yesterday: [], week: [], older: [] };
        items.forEach((it) => {
            const bucket = it.ts ? bucketForDate(new Date(it.ts)) : dateBucket(it.date);
            g[bucket].push(it);
        });
        return g;
    }

    function urlKey(u) {
        if (!u) return '';
        try {
            const url = new URL(u, location.origin);
            return url.pathname.toLowerCase()
                + '|id=' + (url.searchParams.get('id') || '')
                + '|rectype=' + (url.searchParams.get('rectype') || '');
        } catch (e) {
            return String(u);
        }
    }

    function isTrackableUrl(href) {
        try {
            const url = new URL(href, location.origin);
            const p = url.pathname.toLowerCase();
            if (!p.startsWith('/app/') || !p.endsWith('.nl')) return false;
            if (!url.searchParams.get('id')) return false;
            if (p.indexOf('/app/common/otherlists/') !== -1) return false;
            return true;
        } catch (e) {
            return false;
        }
    }

    function cleanTitle(t) {
        return String(t || '').replace(/\s*-\s*NetSuite\b.*$/i, '').replace(/[\s\u00a0]+/g, ' ').trim();
    }

    function fmtVisitTs(ts) {
        const d = new Date(ts);
        try {
            return startOfDay(d) === startOfDay(new Date())
                ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                : d.toLocaleDateString();
        } catch (e) {
            return '';
        }
    }

    function captureVisit() {
        try {
            if (!_inited) return;
            if (!isTrackableUrl(location.href)) return;
            const url = new URL(location.href);
            VISIT_STRIP_PARAMS.forEach((p) => url.searchParams.delete(p));
            url.hash = '';
            const viewUrl = url.pathname + url.search;
            const name = cleanTitle(document.title);
            if (!name) return;
            const visit = {
                url: viewUrl,
                editUrl: viewUrl + (viewUrl.indexOf('?') >= 0 ? '&' : '?') + 'e=T',
                name,
                kind: kindForUrl(viewUrl),
                ts: Date.now()
            };
            const key = urlKey(viewUrl);
            const arr = (_history[location.host] || []).filter((v) => v && urlKey(v.url) !== key);
            arr.unshift(visit);
            _history[location.host] = arr.slice(0, HISTORY_MAX);
            pruneHosts(_history, (a) => (a && a[0] && a[0].ts) || 0);
            chrome.storage.local.set({ [HISTORY_KEY]: _history });
        } catch (e) { }
    }

    function buildMergedItems() {
        const serverItems = (_cache && _cache.items) || [];
        const visits = _history[location.host] || [];
        const byKey = new Map();
        serverItems.forEach((it) => {
            const k = urlKey(it.viewUrl || it.editUrl);
            if (k && !byKey.has(k)) byKey.set(k, it);
        });
        const used = new Set();
        const merged = [];
        visits.forEach((v) => {
            const k = urlKey(v.url);
            if (!k || used.has(k)) return;
            used.add(k);
            const s = byKey.get(k);
            merged.push({
                name: (s && s.name) || v.name,
                secondary: (s && s.secondary) || '',
                date: fmtVisitTs(v.ts),
                ts: v.ts,
                viewUrl: v.url,
                editUrl: v.editUrl || (s && s.editUrl) || '',
                kind: (s && s.kind) || v.kind || 'file'
            });
        });
        serverItems.forEach((it) => {
            const k = urlKey(it.viewUrl || it.editUrl);
            if (k && used.has(k)) return;
            merged.push(it);
        });

        return merged
            .map((it, i) => ({ it, i, t: itemTime(it) }))
            .sort((a, b) => (b.t - a.t) || (a.i - b.i))
            .map((x) => x.it);
    }

    function itemTime(it) {
        if (it && typeof it.ts === 'number' && it.ts > 0) return it.ts;
        const d = parseNsDate(it && it.date);
        return d ? d.getTime() : 0;
    }

    const DAY_MS = 86400000;

    function startOfDay(d) {
        return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    }

    function bucketForDate(d) {
        if (!d || isNaN(d.getTime())) return 'older';
        const now = new Date();
        if (d.getTime() > now.getTime() + DAY_MS) return 'older';
        const diff = Math.round((startOfDay(now) - startOfDay(d)) / DAY_MS);
        if (diff <= 0) return 'today';
        if (diff === 1) return 'yesterday';
        if (diff <= 7) return 'week';
        return 'older';
    }

    function parseNsDate(dateStr) {
        if (!dateStr) return null;
        const s = String(dateStr).trim();

        const hm = s.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)?$/i);
        if (hm) {
            let h = parseInt(hm[1], 10);
            const mer = (hm[4] || '').toLowerCase();
            if (mer.startsWith('p') && h < 12) h += 12;
            if (mer.startsWith('a') && h === 12) h = 0;
            const now = new Date();
            return new Date(now.getFullYear(), now.getMonth(), now.getDate(),
                h, parseInt(hm[2], 10), parseInt(hm[3] || '0', 10));
        }

        const md = s.match(/(\d{1,4})[\/.\-](\d{1,4})[\/.\-](\d{1,4})/);
        if (md) {
            const nums = [parseInt(md[1], 10), parseInt(md[2], 10), parseInt(md[3], 10)];
            let yi = nums.findIndex((n) => n > 31);
            if (yi === -1) yi = 2;
            let year = nums[yi];
            if (year < 100) year += 2000;
            const rest = nums.filter((_, i) => i !== yi);
            const a = rest[0], b = rest[1];
            if (a > 12 && b <= 12) return new Date(year, b - 1, a);
            if (b > 12 && a <= 12) return new Date(year, a - 1, b);
            const now = Date.now();
            const c1 = new Date(year, a - 1, b);
            const c2 = new Date(year, b - 1, a);
            const ok1 = c1.getTime() <= now + DAY_MS;
            const ok2 = c2.getTime() <= now + DAY_MS;
            if (ok1 && ok2) return c1.getTime() >= c2.getTime() ? c1 : c2;
            return ok1 ? c1 : c2;
        }

        const t = Date.parse(s.replace(/\b(am|pm)\b/i, (m) => m.toUpperCase()));
        return isNaN(t) ? null : new Date(t);
    }

    function dateBucket(dateStr) {
        return bucketForDate(parseNsDate(dateStr));
    }

    const RR_STAR_SVG = '<svg class="nsft-rr-section-star" viewBox="0 0 24 24" aria-hidden="true"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>';

    function sectionHeaderHtml(label, opts) {
        if (opts && opts.pinned) {
            return `<div class="nsft-rr-section nsft-rr-section--pinned" role="presentation">${RR_STAR_SVG}${escapeHtml(label)}</div>`;
        }
        return `<div class="nsft-rr-section" role="presentation">${escapeHtml(label)}</div>`;
    }

    function rowHtml(item, isPinned) {
        const url = item.url || item.viewUrl || item.editUrl || '#';
        const secondary = item.secondary && item.secondary !== ' ' ? item.secondary : '';
        const viewUrl = item.viewUrl || url;
        let editUrl = item.editUrl || '';
        if (!editUrl && isPinned && url !== '#' && /\.nl(\?|$)/i.test(url) && !/[?&]e=T/i.test(url)) {
            editUrl = url + (url.indexOf('?') >= 0 ? '&' : '?') + 'e=T';
        }
        const kind = item.kind || 'file';
        const date = isPinned ? '' : (item.date || '');
        const viewTitle = i18n('rr_action_open', 'Abrir');
        const editTitle = i18n('rr_action_edit', 'Editar');
        const pinTitle = isPinned ? i18n('rr_unpin', 'Quitar de fijados') : i18n('rr_pin', 'Fijar');
        return `
            <div class="nsft-rr-row" role="listitem"
                 data-href="${escapeHtml(url)}"
                 data-url="${escapeHtml(url)}"
                 data-viewurl="${escapeHtml(viewUrl)}"
                 data-editurl="${escapeHtml(editUrl)}"
                 data-name="${escapeHtml(item.name || '')}"
                 data-kind="${escapeHtml(kind)}"
                 data-secondary="${escapeHtml(secondary)}"
                 data-haystack="${escapeHtml(((item.name || '') + ' ' + secondary).toLowerCase())}">
                <a class="nsft-rr-rowmain" href="${escapeHtml(url)}">
                    <span class="nsft-rr-icon nsft-rr-icon-${escapeHtml(kind)}">${iconSvg(kind)}</span>
                    <span class="nsft-rr-body">
                        <span class="nsft-rr-name">${escapeHtml(item.name || '')}</span>
                        ${secondary ? `<span class="nsft-rr-secondary">${escapeHtml(secondary)}</span>` : ''}
                    </span>
                </a>
                ${date ? `<span class="nsft-rr-date">${escapeHtml(date)}</span>` : ''}
                <span class="nsft-rr-actions">
                    <a class="nsft-rr-action nsft-rr-action-view" href="${escapeHtml(viewUrl)}" target="_blank" rel="noopener" title="${escapeHtml(viewTitle)}" aria-label="${escapeHtml(viewTitle)}">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                            <polyline points="15 3 21 3 21 9"></polyline>
                            <line x1="10" y1="14" x2="21" y2="3"></line>
                        </svg>
                    </a>
                    ${editUrl ? `
                    <a class="nsft-rr-action nsft-rr-action-edit" href="${escapeHtml(editUrl)}" title="${escapeHtml(editTitle)}" aria-label="${escapeHtml(editTitle)}">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                            <path d="M12 20h9"></path>
                            <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path>
                        </svg>
                    </a>` : ''}
                    <button type="button" class="nsft-rr-action nsft-rr-action-pin${isPinned ? ' is-pinned' : ''}" title="${escapeHtml(pinTitle)}" aria-label="${escapeHtml(pinTitle)}" aria-pressed="${isPinned ? 'true' : 'false'}">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
                        </svg>
                    </button>
                </span>
            </div>
        `;
    }

    function togglePin(row) {
        const url = row.getAttribute('data-url');
        if (!url || url === '#') return;
        const idx = _pinned.findIndex((p) => p && p.url === url);
        if (idx >= 0) {
            _pinned.splice(idx, 1);
        } else {
            _pinned.unshift({
                url,
                viewUrl: row.getAttribute('data-viewurl') || url,
                editUrl: row.getAttribute('data-editurl') || '',
                name: row.getAttribute('data-name') || url,
                secondary: row.getAttribute('data-secondary') || '',
                kind: row.getAttribute('data-kind') || 'file'
            });
        }
        chrome.storage.local.set({ [PINNED_KEY]: _pinned });
        const panel = row.closest('.nsft-rr-panel');
        if (panel) {
            const input = panel.querySelector('.nsft-rr-search');
            if (input) { try { input.focus(); } catch (e) { } }
            applyRows(panel);
            if (input && input.value) filterRows(panel, input.value);
        }
    }

    function visibleRows(panel) {
        const list = panel.querySelector('[data-role="list"]');
        if (!list) return [];
        return Array.from(list.querySelectorAll('.nsft-rr-row')).filter((r) => r.style.display !== 'none');
    }

    function moveKbSelection(panel, delta) {
        const rows = visibleRows(panel);
        if (!rows.length) return;
        _kbIndex += delta;
        if (_kbIndex < 0) _kbIndex = rows.length - 1;
        if (_kbIndex >= rows.length) _kbIndex = 0;
        rows.forEach((r, i) => r.classList.toggle('nsft-rr-row--active', i === _kbIndex));
        const act = rows[_kbIndex];
        if (act && act.scrollIntoView) act.scrollIntoView({ block: 'nearest' });
    }

    function activeKbRow(panel) {
        const rows = visibleRows(panel);
        if (_kbIndex >= 0 && _kbIndex < rows.length) return rows[_kbIndex];
        return rows[0] || null;
    }

    function filterRows(panel, query) {
        const list = panel.querySelector('[data-role="list"]');
        if (!list) return;
        const q = query.trim().toLowerCase();
        _kbIndex = -1;
        const rows = list.querySelectorAll('.nsft-rr-row');
        let shown = 0;
        rows.forEach((r) => {
            r.classList.remove('nsft-rr-row--active');
            let haystack = r._nsftHaystack;
            if (haystack === undefined) {
                haystack = r.getAttribute('data-haystack') || '';
                r._nsftHaystack = haystack;
            }
            const match = !q || haystack.indexOf(q) !== -1;
            r.style.display = match ? '' : 'none';
            if (match) shown++;
        });
        let header = null, headerHasVisible = false;
        Array.from(list.children).forEach((ch) => {
            if (ch.classList.contains('nsft-rr-section')) {
                if (header) header.style.display = headerHasVisible ? '' : 'none';
                header = ch; headerHasVisible = false;
            } else if (ch.classList.contains('nsft-rr-row') && ch.style.display !== 'none') {
                headerHasVisible = true;
            }
        });
        if (header) header.style.display = headerHasVisible ? '' : 'none';
        updateCount(panel, shown, rows.length);

        let emptyMsg = list.querySelector('.nsft-rr-no-match');
        if (q && shown === 0) {
            if (!emptyMsg) {
                emptyMsg = document.createElement('div');
                emptyMsg.className = 'nsft-rr-no-match';
                emptyMsg.textContent = i18n('rr_no_match', 'Ningún registro coincide con la búsqueda.');
                list.appendChild(emptyMsg);
            }
        } else if (emptyMsg) {
            emptyMsg.remove();
        }
    }

    function updateCount(panel, shown, total) {
        const el = panel.querySelector('[data-role="count"]');
        if (!el) return;
        if (shown === total) {
            el.textContent = total ? String(total) : '';
        } else {
            el.textContent = shown + ' / ' + total;
        }
    }

    function kindForUrl(url) {
        if (!url) return 'file';
        const u = url.toLowerCase();
        if (u.includes('/app/common/entity/employee')) return 'employee';
        if (u.includes('/app/common/entity/customer')) return 'customer';
        if (u.includes('/app/common/entity/vendor')) return 'vendor';
        if (u.includes('/app/common/entity/contact')) return 'contact';
        if (u.includes('/app/common/entity/partner')) return 'partner';
        if (u.includes('/app/common/entity/')) return 'entity';
        if (u.includes('/app/common/item/')) return 'item';
        if (u.includes('/app/common/media/mediaitem')) return 'media';
        if (u.includes('/app/accounting/transactions/')) return 'transaction';
        if (u.includes('/app/common/custom/custrecord.nl')) return 'customrecord_type';
        if (u.includes('/app/common/custom/custrecordentry')) return 'customrecord';
        if (u.includes('/app/common/custom/custreccustfield')) return 'customfield';
        if (u.includes('/app/common/custom/bodycustfield')) return 'customfield';
        if (u.includes('/app/common/custom/entitycustfield')) return 'customfield';
        if (u.includes('/app/common/custom/itemcustfield')) return 'customfield';
        if (u.includes('/app/common/custom/columncustfield')) return 'customfield';
        if (u.includes('/app/common/custom/custform')) return 'form';
        if (u.includes('/app/setup/role.nl')) return 'role';
        if (u.includes('/app/common/scripting/')) return 'script';
        if (u.includes('/app/common/workflow/')) return 'workflow';
        if (u.includes('/app/common/search/')) return 'search';
        if (u.includes('/app/crm/')) return 'crm';
        if (u.includes('/app/webservices/')) return 'config';
        return 'file';
    }

    const RR_ICON_ENTITY = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>';
    const RR_ICON_CUSTOMREC = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"/><line x1="3" y1="10" x2="21" y2="10"/><line x1="9" y1="4" x2="9" y2="20"/></svg>';
    const RR_ICON_FILE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>';
    const RR_ICONS = {
        employee: RR_ICON_ENTITY, customer: RR_ICON_ENTITY, vendor: RR_ICON_ENTITY,
        contact: RR_ICON_ENTITY, partner: RR_ICON_ENTITY, entity: RR_ICON_ENTITY,
        item: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>',
        transaction: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg>',
        media: RR_ICON_FILE,
        customrecord: RR_ICON_CUSTOMREC, customrecord_type: RR_ICON_CUSTOMREC,
        customfield: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h0a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v0a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>',
        form: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><line x1="9" y1="13" x2="15" y2="13"/><line x1="9" y1="17" x2="15" y2="17"/></svg>',
        role: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 1l9 4v6c0 5.55-3.84 10.74-9 12-5.16-1.26-9-6.45-9-12V5l9-4z"/></svg>',
        script: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>',
        workflow: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="6" cy="6" r="3"/><circle cx="18" cy="18" r="3"/><path d="M9 6h6a3 3 0 0 1 3 3v6"/></svg>',
        search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>',
        crm: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>',
        config: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M12 1v6m0 10v6M4.22 4.22l4.24 4.24m7.08 7.08l4.24 4.24M1 12h6m10 0h6M4.22 19.78l4.24-4.24m7.08-7.08l4.24-4.24"/></svg>'
    };
    function iconSvg(kind) {
        return RR_ICONS[kind] || RR_ICON_FILE;
    }

    function resolveTheme(popover) {
        if (popover && popover.closest('[data-color-mode="dark"]')) return 'dark';
        return 'light';
    }

    function i18n(key, fallback) {
        try {
            const msg = chrome.i18n.getMessage(key);
            return msg || fallback;
        } catch (_) {
            return fallback;
        }
    }

    const escapeHtml = (window.NSFT_DOM && window.NSFT_DOM.escapeHtml)
        ? window.NSFT_DOM.escapeHtml
        : (s) => String(s == null ? '' : s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
})();
