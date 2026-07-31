(function () {
    'use strict';

    const STORAGE_KEY = 'enableSublistLineIds';
    const BADGE_CLASS = 'nsft-sli-badge';

    let _unsub = null;
    let _fetcherInjected = false;
    let _reqSeq = 0;
    const _pending = new Map();
    let _state = new WeakMap();
    let _reqByContainer = new WeakMap();

    function isApplicablePage() {
        try {
            if (window.NSFT_RecordButtons && NSFT_RecordButtons.isExcludedPage && NSFT_RecordButtons.isExcludedPage()) return false;
        } catch (e) { }
        return /\.nl$/.test(window.location.pathname);
    }

    if (!isApplicablePage()) return;

    chrome.storage.local.get({ [STORAGE_KEY]: true }, (items) => {
        if (items[STORAGE_KEY]) init();
    });

    chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== 'local' || !changes[STORAGE_KEY]) return;
        if (changes[STORAGE_KEY].newValue) init();
        else teardown();
    });

    function init() {
        injectFetcher();
        window.addEventListener('message', onFetcherMessage);
        scan();
        if (window.NSFT_Observer && typeof window.NSFT_Observer.subscribe === 'function') {
            if (!_unsub) _unsub = window.NSFT_Observer.subscribe(scan, { throttle: 500 });
        }
    }

    function teardown() {
        if (_unsub) { try { _unsub(); } catch (e) { } _unsub = null; }
        window.removeEventListener('message', onFetcherMessage);
        _pending.clear();
        _state = new WeakMap();
        _reqByContainer = new WeakMap();
        document.querySelectorAll('.' + BADGE_CLASS).forEach(b => b.remove());
    }

    function injectFetcher() {
        if (_fetcherInjected) return;
        _fetcherInjected = true;
        const s = document.createElement('script');
        s.src = chrome.runtime.getURL('scripts/modules/sublist_line_ids/sublist_line_ids_fetcher.js');
        s.onload = function () { this.remove(); };
        (document.head || document.documentElement).appendChild(s);
    }

    function dataRows(container) {
        const rows = container.querySelectorAll(':is(.uir-machine-table, .listtable) > tbody > tr');
        return Array.from(rows).filter(tr =>
            !tr.classList.contains('uir-machine-headerrow') &&
            !tr.classList.contains('uir-nodata-row') &&
            !tr.classList.contains('uir-loading-row')
        );
    }

    function scan() {
        document.querySelectorAll('.uir-machine-table-container').forEach((container) => {
            if (!container.querySelector('.uir-machine-headerrow:not(.uir-loading-row)')) return;

            const table = container.querySelector('table[id$="_splits"]');
            if (!table) return;
            const sublistId = table.id.replace(/_splits$/, '');
            if (!sublistId) return;

            const rows = dataRows(container);
            if (!rows.length) return;

            const st = _state.get(container);
            if (st && st.count === rows.length &&
                st.badgeRows.every(i => rows[i] && rows[i].querySelector('.' + BADGE_CLASS))) {
                return;
            }

            if (_reqByContainer.has(container)) return;
            const reqId = ++_reqSeq;
            _pending.set(reqId, container);
            _reqByContainer.set(container, reqId);
            window.postMessage({
                dest: 'fetcher_sli',
                type: 'get_line_ids',
                payload: { sublistId: sublistId, reqId: reqId }
            }, '*');
        });
    }

    function onFetcherMessage(e) {
        const d = e.data;
        if (!d || d.dest !== 'extension_sli' || d.type !== 'line_ids' || !d.payload) return;
        const container = _pending.get(d.payload.reqId);
        _pending.delete(d.payload.reqId);
        if (!container) return;
        if (_reqByContainer.get(container) === d.payload.reqId) _reqByContainer.delete(container);
        if (!document.contains(container)) return;
        renderBadges(container, d.payload.values);
    }

    function renderBadges(container, values) {
        const rows = dataRows(container);
        const badgeRows = [];

        if (Array.isArray(values) && values.length) {
            const tip = chrome.i18n.getMessage('sublistLineIdsTitle') || 'Line unique key';
            const n = Math.min(rows.length, values.length);
            for (let i = 0; i < n; i++) {
                const val = values[i];
                if (val == null || val === '') continue;
                const cell = rows[i].querySelector('td');
                if (!cell) continue;

                let badge = cell.querySelector(':scope > .' + BADGE_CLASS);
                if (!badge) {
                    badge = document.createElement('span');
                    badge.className = BADGE_CLASS;
                    badge.title = tip;
                    cell.insertBefore(badge, cell.firstChild);
                }
                if (badge.textContent !== String(val)) badge.textContent = String(val);
                badgeRows.push(i);
            }
        }

        _state.set(container, { count: rows.length, badgeRows: badgeRows });
    }
})();
