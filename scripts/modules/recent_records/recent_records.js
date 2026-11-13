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
        adoptLegacyPins(items[SNAPSHOT_KEY]);
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
        leeFormatoCacheado((ok) => {
            if (ok) return;
            const pide = () => injectFetcher();
            const ya = () => (window.requestIdleCallback ? requestIdleCallback(pide, { timeout: 2000 }) : setTimeout(pide, 0));
            if (document.readyState === 'complete') ya(); else window.addEventListener('load', ya, { once: true });
        });
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
        panel.className = 'nsft-rr-panel nsft-w';
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
            if (e.target.closest && e.target.closest('.nsft-rr-action-pin, .nsft-rr-action-copy')) {
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
            const copyBtn = e.target.closest && e.target.closest('.nsft-rr-action-copy');
            if (copyBtn) {
                e.preventDefault();
                e.stopPropagation();
                const row = copyBtn.closest('.nsft-rr-row');
                const u = row && row.getAttribute('data-url');
                if (u && u !== '#') {
                    const abs = new URL(u, location.origin).href;
                    const toast = i18n('rr_link_copied', 'Enlace copiado');
                    if (window.NSFT_Clipboard) window.NSFT_Clipboard.copy(abs, { toast });
                    else if (navigator.clipboard) navigator.clipboard.writeText(abs).catch(() => {});
                }
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
                <div class="nsft-rr-title nsft-titulo"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"></path><path d="M3 3v5h5"></path><path d="M12 7v5l3 2"></path></svg>${escapeHtml(i18n('rr_title', 'Registros recientes'))}</div>
                <div class="nsft-rr-search-wrap">
                    <svg class="nsft-rr-search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                        <circle cx="11" cy="11" r="7"></circle>
                        <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                    </svg>
                    <input type="text" class="nsft-rr-search" placeholder="${escapeHtml(i18n('rr_search_placeholder', 'Buscar...'))}" autocomplete="off" spellcheck="false">
                    <button type="button" class="nsft-rr-clear" data-role="clear" title="${escapeHtml(i18n('ro_clear_search', 'Limpiar búsqueda'))}" aria-label="${escapeHtml(i18n('ro_clear_search', 'Limpiar búsqueda'))}" hidden>✕</button>
                    <span class="nsft-rr-count" data-role="count"></span>
                </div>
            </div>
            <div class="nsft-rr-list" role="list" data-role="list">
                <div class="nsft-rr-loading">${escapeHtml(i18n('rr_loading', 'Cargando registros recientes…'))}</div>
            </div>
            <div class="nsft-rr-foot">
                <a class="nsft-rr-allbtn" data-role="all" href="${escapeHtml(allHref)}" target="_self" title="${escapeHtml(allLabel)}">${escapeHtml(allLabel)}</a>
                <span class="nsft-rr-keys" aria-hidden="true">
                    <kbd>↵</kbd> ${escapeHtml(i18n('rr_key_open', 'abrir'))}
                    <kbd>Ctrl</kbd><kbd>↵</kbd> ${escapeHtml(i18n('rr_key_newtab', 'otra pestaña'))}
                </span>
            </div>
        `;
    }

    function wireSearch(panel) {
        const input = panel.querySelector('.nsft-rr-search');
        if (!input) return;
        input.addEventListener('input', () => filterRows(panel, input.value || ''));

        const clearBtn = panel.querySelector('[data-role="clear"]');
        if (clearBtn) {
            clearBtn.addEventListener('mousedown', (e) => e.preventDefault());
            clearBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                input.value = '';
                filterRows(panel, '');
                input.focus();
            });
        }

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
                    if (href && href !== '#') {
                        e.preventDefault();
                        if (e.ctrlKey || e.metaKey) window.open(href, '_blank', 'noopener');
                        else window.location.href = href;
                    }
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
        const pins = pinsHere();
        const pinnedUrls = new Set(pins.map((p) => p && p.url).filter(Boolean));

        if (!items.length && !pins.length) {
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
        if (pins.length) {
            html += sectionHeaderHtml(i18n('rr_pinned', 'Fijados'), { pinned: true });
            html += pins.map((it) => rowHtml(it, true)).join('');
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
            const txt = i18n('rr_empty', 'No hay registros recientes.');
            list.innerHTML = `<div class="nsft-rr-empty">${window.NSFT_Herramientas ? window.NSFT_Herramientas.vacio('reloj', txt) : escapeHtml(txt)}</div>`;
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

        const fromPref = dayFirstFromPreference();
        const dayFirst = (fromPref === null) ? inferDayFirst(items) : fromPref;

        items.forEach((it) => {
            const when = it.ts ? new Date(it.ts) : parseNsDate(it.date, dayFirst);
            it.when = (when && !isNaN(when.getTime())) ? when.getTime() : null;
            g[bucketForDate(when)].push(it);
        });

        Object.keys(g).forEach((k) => {
            g[k].sort((a, b) => {
                if (a.when === b.when) return 0;
                if (a.when === null) return 1;
                if (b.when === null) return -1;
                return b.when - a.when;
            });
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

    function esUrlEditorAvanzado(u) {
        if (!u || u === '#') return false;
        return /[?&]nsft-advanced-editor=T(?:&|$)/i.test(u);
    }

    function savedSearchRunUrl(u) {
        try {
            const id = new URL(u, location.origin).searchParams.get('id');
            if (!id || !/^\d+$/.test(id)) return '';
            return '/app/common/search/savedsearchresults.nl?searchid=' + id + '&saverun=T&whence=';
        } catch (e) {
            return '';
        }
    }

    function isSavedSearchUrl(u) {
        if (!u || u === '#') return false;
        try {
            const url = new URL(u, location.origin);
            return /\/app\/common\/search\/search\.nl$/i.test(url.pathname)
                && !!url.searchParams.get('id');
        } catch (e) {
            return false;
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
            const stampName = document.documentElement.getAttribute('data-nsft-page-name') || '';
            const stampType = document.documentElement.getAttribute('data-nsft-page-type') || '';
            const name = stampName || cleanTitle(document.title);
            if (!name) return;
            const visit = {
                url: viewUrl,
                editUrl: viewUrl + (viewUrl.indexOf('?') >= 0 ? '&' : '?') + 'e=T',
                name,
                secondary: stampName ? stampType : '',
                kind: kindForUrl(viewUrl),
                ts: Date.now()
            };
            const key = urlKey(viewUrl);
            const arr = (_history[location.host] || []).filter((v) => v && urlKey(v.url) !== key);
            arr.unshift(visit);
            _history[location.host] = arr.slice(0, HISTORY_MAX);
            pruneHosts(_history, (a) => (a && a[0] && a[0].ts) || 0);
            chrome.storage.local.set({ [HISTORY_KEY]: _history });
            claimLegacyPin(viewUrl, name);
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
                secondary: (s && s.secondary) || v.secondary || '',
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

    let _dateFormat = null;

    function dayFirstFromPreference() {
        if (!_dateFormat) return null;
        const f = String(_dateFormat).toUpperCase();
        const d = f.indexOf('D');
        const m = f.indexOf('M');
        if (d === -1 || m === -1) return null;
        return d < m;
    }

    function injectFetcher() {
        if (document.getElementById('nsft-rr-fetcher')) return;
        try {
            const s = document.createElement('script');
            s.id = 'nsft-rr-fetcher';
            s.src = chrome.runtime.getURL('scripts/modules/recent_records/recent_records_fetcher.js');
            s.onload = function () { this.remove(); };
            (window.NSFT_AfterLoad ? window.NSFT_AfterLoad.append(s) : (document.head || document.documentElement).appendChild(s));
        } catch (e) { }
    }

    const FMT_CACHE_KEY = 'nsftUserDateFormats';
    const FMT_CACHE_TTL = 7 * 24 * 60 * 60 * 1000;
    function claveUsuarioFmt() {
        const m = /(?:^|;\s*)lastUser=([^;]*)/.exec(document.cookie || '');
        return location.host + '|' + (m ? m[1] : '');
    }
    function leeFormatoCacheado(cb) {
        try {
            chrome.storage.local.get({ [FMT_CACHE_KEY]: {} }, (st) => {
                const c = st && st[FMT_CACHE_KEY] && st[FMT_CACHE_KEY][claveUsuarioFmt()];
                if (c && c.date && (Date.now() - (c.ts || 0)) < FMT_CACHE_TTL) { _dateFormat = c.date; cb(true); }
                else cb(false);
            });
        } catch (e) { cb(false); }
    }

    window.addEventListener('message', (e) => {
        if (e.source !== window) return;
        const d = e.data;
        if (!d || typeof d !== 'object' || d.dest !== 'extension_rr') return;
        if (d.type === 'dateformat' && d.payload && d.payload.format) {
            _dateFormat = d.payload.format;
            try {
                chrome.storage.local.get({ [FMT_CACHE_KEY]: {} }, (st) => {
                    const all = (st[FMT_CACHE_KEY] && typeof st[FMT_CACHE_KEY] === 'object') ? st[FMT_CACHE_KEY] : {};
                    const k = claveUsuarioFmt();
                    all[k] = Object.assign({}, all[k], { date: _dateFormat, ts: Date.now() });
                    chrome.storage.local.set({ [FMT_CACHE_KEY]: all });
                });
            } catch (err) { }
        }
    });

    function inferDayFirst(items) {
        for (const it of items || []) {
            const s = String((it && it.date) || '').trim();
            const md = s.match(/(\d{1,4})[\/.\-](\d{1,4})[\/.\-](\d{1,4})/);
            if (!md) continue;
            const a = parseInt(md[1], 10);
            const b = parseInt(md[2], 10);
            if (a > 31 || b > 31) continue;
            if (a > 12 && b <= 12) return true;
            if (b > 12 && a <= 12) return false;
        }
        return null;
    }

    function parseNsDate(dateStr, dayFirst) {
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

            return dayFirst === false
                ? new Date(year, a - 1, b)
                : new Date(year, b - 1, a);
        }

        const t = Date.parse(s.replace(/\b(am|pm)\b/i, (m) => m.toUpperCase()));
        return isNaN(t) ? null : new Date(t);
    }

    function dateBucket(dateStr) {
        return bucketForDate(parseNsDate(dateStr));
    }

    function sectionHeaderHtml(label, opts) {
        if (opts && opts.pinned) {
            return `<div class="nsft-rr-section nsft-rr-section--pinned" role="presentation">${escapeHtml(label)}</div>`;
        }
        return `<div class="nsft-rr-section" role="presentation">${escapeHtml(label)}</div>`;
    }

    const KINDS_CON_ID = new Set(['employee', 'customer', 'vendor', 'contact', 'partner', 'entity', 'customrecord']);
    function repartir(name, secondary, kind, url) {
        let n = String(name || '').trim();
        let s = String(secondary || '').trim();
        const m = kind === 'transaction' ? /^(.+?)\s+#(\S+)$/.exec(n) : null;
        if (m) {
            n = m[2];
            if (s.toLowerCase() !== m[1].toLowerCase()) s = s ? m[1] + ' \u00b7 ' + s : m[1];
        } else if (KINDS_CON_ID.has(kind)) {
            const id = /[?&]id=(\d+)/.exec(url || '');
            if (id) s = s ? s + ' \u00b7 #' + id[1] : '#' + id[1];
        }
        return [n, s];
    }

    function cuandoFue(item) {
        const t = itemTime(item);
        const crudo = String((item && item.date) || '').trim();
        if (!t) return crudo ? { txt: crudo, full: '' } : null;
        const d = new Date(t);
        const conHora = (typeof item.ts === 'number' && item.ts > 0) || /^\d{1,2}:\d{2}/.test(crudo);
        let full = '';
        try { full = conHora ? d.toLocaleString() : d.toLocaleDateString(); } catch (e) { }
        if (conHora) {
            const hoy = startOfDay(new Date());
            if (startOfDay(d) === hoy) {
                const min = Math.max(0, Math.floor((Date.now() - t) / 60000));
                if (min < 1) return { txt: i18n('rr_ago_now', 'ahora'), full };
                if (min < 60) return { txt: i18nSub('rr_ago_min', [String(min)], 'hace ' + min + ' min'), full };
                const h = Math.floor(min / 60);
                return { txt: i18nSub('rr_ago_h', [String(h)], 'hace ' + h + ' h'), full };
            }
            if (startOfDay(d) === hoy - DAY_MS) {
                try { return { txt: d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }), full }; } catch (e) { }
            }
            try { return { txt: d.toLocaleDateString(), full }; } catch (e) { }
        }
        return { txt: crudo, full };
    }

    function rowHtml(item, isPinned) {
        let url = item.url || item.viewUrl || item.editUrl || '#';
        const kindUrl = url !== '#' ? kindForUrl(url) : 'file';
        const kind = kindUrl !== 'file' ? kindUrl : (item.kind || 'file');
        const tx = kind === 'transaction' ? (/\/transactions\/([a-z]+)\.nl/i.exec(url) || [])[1] || '' : '';
        const isSaved = isSavedSearchUrl(url);
        let secondary = item.secondary && item.secondary !== ' ' ? item.secondary : '';
        if (!secondary) {
            const kl = kindLabel(kind);
            if (kl && kl !== String(item.name || '').trim()) secondary = kl;
        }
        let viewUrl = item.viewUrl || url;
        let editUrl = item.editUrl || '';
        const esEditorAvanzado = esUrlEditorAvanzado(url);
        if (esEditorAvanzado) {
            secondary = i18n('enableAdvancedEditorLabel', 'Advanced Editor');
            if (!/[?&]e=T(?:&|$)/i.test(url)) {
                url += (url.indexOf('?') >= 0 ? '&' : '?') + 'e=T';
            }
            viewUrl = url;
        }
        if (!editUrl && (isPinned || isSaved) && url !== '#' && /\.nl(\?|$)/i.test(url) && !/[?&]e=T/i.test(url)) {
            editUrl = url + (url.indexOf('?') >= 0 ? '&' : '?') + 'e=T';
        }
        if (isSaved && editUrl) {
            url = editUrl;
            viewUrl = editUrl;
        }
        const runUrl = isSaved ? savedSearchRunUrl(url) : '';
        const [nombre, sub] = repartir(item.name || '', secondary, kind, url);
        const cuando = isPinned ? null : cuandoFue(item);
        const date = cuando ? cuando.txt : '';
        const viewTitle = i18n('rr_action_open', 'Abrir');
        const editTitle = i18n('rr_action_edit', 'Editar');
        const runTitle = i18n('rr_action_run', 'Ejecutar búsqueda');
        const pinTitle = isPinned ? i18n('rr_unpin', 'Quitar de fijados') : i18n('rr_pin', 'Fijar');
        const copyTitle = i18n('rr_action_copy', 'Copiar enlace');
        return `
            <div class="nsft-rr-row" role="listitem"
                 data-href="${escapeHtml(url)}"
                 data-url="${escapeHtml(url)}"
                 data-viewurl="${escapeHtml(viewUrl)}"
                 data-editurl="${escapeHtml(editUrl)}"
                 data-name="${escapeHtml(item.name || '')}"
                 data-kind="${escapeHtml(kind)}"
                 data-secondary="${escapeHtml(secondary)}"
                 data-haystack="${escapeHtml(rrFold((item.name || '') + ' ' + nombre + ' ' + sub))}">
                <a class="nsft-rr-rowmain" href="${escapeHtml(url)}">
                    <span class="nsft-rr-icon nsft-rr-icon-${escapeHtml(kind)}${tx ? ' nsft-rr-tx-' + escapeHtml(tx.toLowerCase()) : ''}">${iconSvg(kind, tx.toLowerCase())}</span>
                    <span class="nsft-rr-body">
                        <span class="nsft-rr-name">${escapeHtml(nombre)}</span>
                        ${sub ? `<span class="nsft-rr-secondary">${escapeHtml(sub)}</span>` : ''}
                    </span>
                </a>
                ${date ? `<span class="nsft-rr-date"${cuando.full ? ` title="${escapeHtml(cuando.full)}"` : ''}>${escapeHtml(date)}</span>` : ''}
                <span class="nsft-rr-actions">
                    <button type="button" class="nsft-rr-action nsft-rr-action-copy" title="${escapeHtml(copyTitle)}" aria-label="${escapeHtml(copyTitle)}">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                            <rect x="9" y="9" width="12" height="12" rx="2"></rect>
                            <path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1"></path>
                        </svg>
                    </button>
                    <a class="nsft-rr-action nsft-rr-action-view" href="${escapeHtml(viewUrl)}" target="_blank" rel="noopener" title="${escapeHtml(viewTitle)}" aria-label="${escapeHtml(viewTitle)}">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                            <polyline points="15 3 21 3 21 9"></polyline>
                            <line x1="10" y1="14" x2="21" y2="3"></line>
                        </svg>
                    </a>
                    ${editUrl && !isSaved && !esEditorAvanzado ? `
                    <a class="nsft-rr-action nsft-rr-action-edit" href="${escapeHtml(editUrl)}" title="${escapeHtml(editTitle)}" aria-label="${escapeHtml(editTitle)}">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                            <path d="M12 20h9"></path>
                            <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path>
                        </svg>
                    </a>` : ''}
                    ${runUrl ? `
                    <a class="nsft-rr-action nsft-rr-action-run" href="${escapeHtml(runUrl)}" title="${escapeHtml(runTitle)}" aria-label="${escapeHtml(runTitle)}">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                            <polygon points="6 4 20 12 6 20 6 4"></polygon>
                        </svg>
                    </a>` : ''}
                    <button type="button" class="nsft-rr-action nsft-rr-action-pin${isPinned ? ' is-pinned' : ''}" title="${escapeHtml(pinTitle)}" aria-label="${escapeHtml(pinTitle)}" aria-pressed="${isPinned ? 'true' : 'false'}">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                            <path d="M9 4h6l-1 6 3 3v2H7v-2l3-3z"></path>
                            <path d="M12 15v6"></path>
                        </svg>
                    </button>
                </span>
            </div>
        `;
    }

    function pinsHere() {
        return _pinned.filter((p) => p && (!p.host || p.host === location.host));
    }

    function adoptLegacyPins(snapshots) {
        const sueltos = _pinned.filter((p) => p && !p.host && p.url);
        if (!sueltos.length) return;
        const snaps = (snapshots && typeof snapshots === 'object') ? snapshots : {};
        const hosts = new Set(Object.keys(_history).concat(Object.keys(snaps)));
        let cambio = false;
        const nombre = (x) => String((x && x.name) || '').trim().toLowerCase();
        sueltos.forEach((p) => {
            const key = urlKey(p.url);
            const porUrl = [];
            const porNombre = [];
            hosts.forEach((h) => {
                const filas = (_history[h] || []).map((v) => [v, v && v.url])
                    .concat(((snaps[h] && snaps[h].items) || []).map((it) => [it, it && (it.viewUrl || it.editUrl)]))
                    .filter(([x, u]) => x && urlKey(u) === key);
                if (!filas.length) return;
                porUrl.push(h);
                if (filas.some(([x]) => nombre(x) && nombre(x) === nombre(p))) porNombre.push(h);
            });
            const donde = porNombre.length ? porNombre : porUrl;
            if (donde.length === 1) { p.host = donde[0]; cambio = true; }
        });
        if (cambio) chrome.storage.local.set({ [PINNED_KEY]: _pinned });
    }

    function claimLegacyPin(viewUrl, name) {
        const key = urlKey(viewUrl);
        const n = String(name || '').trim().toLowerCase();
        const p = _pinned.find((x) => x && !x.host && urlKey(x.url) === key
            && n && String(x.name || '').trim().toLowerCase() === n);
        if (!p) return;
        p.host = location.host;
        chrome.storage.local.set({ [PINNED_KEY]: _pinned });
    }

    function togglePin(row) {
        const url = row.getAttribute('data-url');
        if (!url || url === '#') return;
        const idx = _pinned.findIndex((p) => p && p.url === url && (!p.host || p.host === location.host));
        if (idx >= 0) {
            _pinned.splice(idx, 1);
        } else {
            _pinned.unshift({
                url,
                viewUrl: row.getAttribute('data-viewurl') || url,
                editUrl: row.getAttribute('data-editurl') || '',
                name: row.getAttribute('data-name') || url,
                secondary: row.getAttribute('data-secondary') || '',
                kind: row.getAttribute('data-kind') || 'file',
                host: location.host
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

    function rrFold(s) {
        const TS = window.NSFT_TextSearch;
        return TS ? TS.fold(s) : String(s == null ? '' : s).toLowerCase();
    }

    function marcaFila(row, term) {
        const TS = window.NSFT_TextSearch;
        ['.nsft-rr-name', '.nsft-rr-secondary'].forEach((sel) => {
            const el = row.querySelector(sel);
            if (!el) return;
            if (el._nsftText === undefined) el._nsftText = el.textContent;
            if (!term || !TS) {
                if (el.firstElementChild) el.textContent = el._nsftText;
                return;
            }
            TS.mark(el, el._nsftText, term, 'nsft-rr-hl');
        });
    }

    function filterRows(panel, query) {
        const list = panel.querySelector('[data-role="list"]');
        if (!list) return;
        const q = rrFold(query.trim());
        const clearBtn = panel.querySelector('[data-role="clear"]');
        if (clearBtn) clearBtn.hidden = !String(query || '').length;
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
            if (match) marcaFila(r, q);
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
                const txt = i18n('rr_no_match', 'Ningún registro coincide con la búsqueda.');
                if (window.NSFT_Herramientas) emptyMsg.innerHTML = window.NSFT_Herramientas.vacio('buscar', txt);
                else emptyMsg.textContent = txt;
                list.appendChild(emptyMsg);
            }
        } else if (emptyMsg) {
            emptyMsg.remove();
        }
    }

    function updateCount(panel, shown, total) {
        const todos = panel.querySelector('[data-role="all"]');
        if (todos) {
            todos.textContent = total
                ? i18nSub('rr_view_all_n', [String(total)], 'Ver los ' + total) + ' \u2192'
                : (todos.getAttribute('title') || '');
        }
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
        if (u.includes('/app/common/entity/custjob')) return 'customer';
        if (u.includes('/app/common/entity/vendor')) return 'vendor';
        if (u.includes('/app/common/entity/contact')) return 'contact';
        if (u.includes('/app/common/entity/partner')) return 'partner';
        if (u.includes('/app/common/entity/')) return 'entity';
        if (u.includes('/app/common/item/')) return 'item';
        if (u.includes('/app/common/media/mediaitem')) return 'media';
        if (u.includes('/app/common/record/edittextmediaitem')) return 'media';
        if (u.includes('/app/common/custom/customtransaction')) return 'customtrantype';
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
        if (u.includes('/app/common/scripting/scriptrecord')) return 'deployment';
        if (u.includes('/app/common/scripting/')) return 'script';
        if (u.includes('/app/common/workflow/')) return 'workflow';
        if (u.includes('/app/common/search/')) return 'search';
        if (u.includes('/app/crm/')) return 'crm';
        if (u.includes('/app/webservices/')) return 'config';
        return 'file';
    }

    const KIND_LABELS = {
        employee: ['rr_kind_employee', 'Empleado'],
        customer: ['rr_kind_customer', 'Cliente'],
        vendor: ['rr_kind_vendor', 'Proveedor'],
        contact: ['rr_kind_contact', 'Contacto'],
        partner: ['rr_kind_partner', 'Socio'],
        entity: ['rr_kind_entity', 'Entidad'],
        item: ['rr_kind_item', 'Artículo'],
        media: ['rr_kind_media', 'Archivo'],
        transaction: ['rr_kind_transaction', 'Transacción'],
        customrecord_type: ['rr_kind_customrecord_type', 'Tipo de registro personalizado'],
        customrecord: ['rr_kind_customrecord', 'Registro personalizado'],
        customfield: ['rr_kind_customfield', 'Campo personalizado'],
        form: ['rr_kind_form', 'Formulario'],
        role: ['rr_kind_role', 'Rol'],
        script: ['rr_kind_script', 'Script'],
        deployment: ['rr_kind_deployment', 'Despliegue de script'],
        customtrantype: ['rr_kind_customtrantype', 'Tipo de transacción personalizada'],
        workflow: ['rr_kind_workflow', 'Flujo de trabajo'],
        search: ['rr_kind_search', 'Búsqueda'],
        crm: ['rr_kind_crm', 'CRM'],
        config: ['rr_kind_config', 'Configuración']
    };

    function kindLabel(kind) {
        const def = KIND_LABELS[kind];
        return def ? i18n(def[0], def[1]) : '';
    }

    const RR_ICON_ENTITY = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>';
    const RR_ICON_CUSTOMREC = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"/><line x1="3" y1="10" x2="21" y2="10"/><line x1="9" y1="4" x2="9" y2="20"/></svg>';
    const RR_ICON_FILE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>';
    const RR_SVG = (d) => '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + d + '</svg>';
    const RR_ICONS = {
        employee: RR_ICON_ENTITY, entity: RR_ICON_ENTITY,
        customer: RR_SVG('<circle cx="9" cy="7" r="4"/><path d="M3 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2"/><path d="M16 11l2 2 4-4"/>'),
        vendor: RR_SVG('<rect x="1.5" y="6" width="13" height="10" rx="1"/><path d="M14.5 9h4l3 3v4h-7"/><circle cx="6" cy="18" r="2"/><circle cx="17.5" cy="18" r="2"/>'),
        contact: RR_SVG('<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="11" r="2.5"/><path d="M5.5 17a3.5 3.5 0 0 1 7 0M15 9h3M15 13h3"/>'),
        partner: RR_SVG('<circle cx="9" cy="8" r="3"/><path d="M3 20a6 6 0 0 1 12 0"/><circle cx="17" cy="9" r="2.5"/><path d="M16 14.5a5 5 0 0 1 5 5"/>'),
        customtrantype: RR_SVG('<path d="M4 8h14l-3-3M20 16H6l3 3"/>'),
        item: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>',
        transaction: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg>',
        media: RR_ICON_FILE,
        customrecord: RR_ICON_CUSTOMREC, customrecord_type: RR_ICON_CUSTOMREC,
        deployment: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><polygon points="10 8 16 12 10 16 10 8"/></svg>',
        customfield: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h0a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v0a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>',
        form: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><line x1="9" y1="13" x2="15" y2="13"/><line x1="9" y1="17" x2="15" y2="17"/></svg>',
        role: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 1l9 4v6c0 5.55-3.84 10.74-9 12-5.16-1.26-9-6.45-9-12V5l9-4z"/></svg>',
        script: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>',
        workflow: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="6" cy="6" r="3"/><circle cx="18" cy="18" r="3"/><path d="M9 6h6a3 3 0 0 1 3 3v6"/></svg>',
        search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>',
        crm: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>',
        config: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M12 1v6m0 10v6M4.22 4.22l4.24 4.24m7.08 7.08l4.24 4.24M1 12h6m10 0h6M4.22 19.78l4.24-4.24m7.08-7.08l4.24-4.24"/></svg>'
    };
    const RR_TX_ICONS = (() => {
        const portapapeles = RR_SVG('<path d="M9 3h6v3H9z"/><path d="M8 5H6a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V6a1 1 0 0 0-1-1h-2M9 12h6M9 16h4"/>');
        const carrito = RR_SVG('<circle cx="9" cy="20" r="1.5"/><circle cx="17" cy="20" r="1.5"/><path d="M3 4h2l2.5 11h11L21 7H6.2"/>');
        const recibo = RR_SVG('<path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6"/>');
        const cobro = RR_SVG('<circle cx="12" cy="12" r="9"/><path d="M15 9.5c-.5-1-1.6-1.5-3-1.5-1.7 0-3 .8-3 2s1.3 1.7 3 2 3 .8 3 2-1.3 2-3 2c-1.4 0-2.5-.5-3-1.5M12 6.5v11"/>');
        const devolucion = RR_SVG('<path d="M9 14l-5-5 5-5"/><path d="M4 9h11a5 5 0 0 1 0 10h-3"/>');
        const caja = RR_SVG('<path d="M21 8l-9-5-9 5v8l9 5 9-5z"/><path d="M3 8l9 5 9-5M12 13v8"/>');
        const libro = RR_SVG('<path d="M4 19V5a2 2 0 0 1 2-2h14v16H6a2 2 0 0 0-2 2zM20 19v2H6"/>');
        return {
            estimate: portapapeles, opprtnty: portapapeles, purchreq: portapapeles,
            salesord: carrito, purchord: carrito,
            custinvc: recibo, cashsale: recibo, cutrsale: recibo, vendbill: recibo, exprept: recibo,
            custpymt: cobro, custdep: cobro, depappl: cobro, vendpymt: cobro,
            custcred: devolucion, rtnauth: devolucion, custrfnd: devolucion, vendcred: devolucion,
            invadjst: caja, invtrnfr: caja, trnfrord: caja, itemship: caja, itemrcpt: caja,
            journal: libro
        };
    })();

    function iconSvg(kind, tx) {
        return (tx && RR_TX_ICONS[tx]) || RR_ICONS[kind] || RR_ICON_FILE;
    }

    function resolveTheme(popover) {
        if (popover && popover.closest('[data-color-mode="dark"]')) return 'dark';
        return 'light';
    }

    function i18nSub(key, subs, fallback) {
        try {
            const msg = chrome.i18n.getMessage(key, subs);
            return msg || fallback;
        } catch (_) {
            return fallback;
        }
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
