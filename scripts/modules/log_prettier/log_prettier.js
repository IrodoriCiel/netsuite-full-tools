(function () {
    'use strict';

    const STORAGE_KEY = 'enableLogPrettier';
    const SELECTOR = 'td.listtext.uir-list-row-cell[data-list-cell-type="string"]';
    const FORMATTED_ATTR = 'nsftFormatted';

    if (!/\/scripting\/(?:script|scriptrecord|scriptdeploy|scriptnote|scriptnotearchive)\.nl(?:\?|$)/.test(
        window.location.pathname + window.location.search
    )) return;

    let unsubscribeObserver = null;
    let storageListener = null;
    const ACTIVE_CLASS = 'nsft-log-prettier-active';

    chrome.storage.local.get({
        [STORAGE_KEY]: true,
        logPrettierTheme: 'auto'
    }, (items) => {
        attachStorageListener();
        if (!items[STORAGE_KEY]) return;
        init(items);
    });

    function init(items) {
        const LF = window.NSFT_LogFormat;
        if (!LF) {
            if (window.NSFT_DOM && window.NSFT_DOM.isDiagEnabled && window.NSFT_DOM.isDiagEnabled()) {
                console.warn('[NSFT:log_prettier] NSFT_LogFormat no disponible.');
            }
            return;
        }

        LF.ensureTheme(items.logPrettierTheme);

        document.documentElement.classList.add(ACTIVE_CLASS);

        scan(document);
        observeDomChanges();
    }

    function attachStorageListener() {
        if (storageListener) return;
        storageListener = (changes, area) => {
            if (area !== 'local') return;
            if (changes.logPrettierTheme && window.NSFT_LogFormat) {
                window.NSFT_LogFormat.ensureTheme(changes.logPrettierTheme.newValue || 'auto');
            }
            if (changes[STORAGE_KEY]) {
                const enabled = changes[STORAGE_KEY].newValue !== false;
                if (!enabled) teardown();
                else chrome.storage.local.get({ logPrettierTheme: 'auto' }, init);
            }
        };
        chrome.storage.onChanged.addListener(storageListener);
    }

    const norm = (s) => String(s || '')
        .normalize('NFD').replace(/[̀-ͯ]/g, '')
        .toUpperCase().replace(/\s+/g, ' ').trim();

    const COL_TITLE = ['TITULO', 'TITLE'];
    const COL_TYPE = ['TIPO', 'TYPE'];
    const COL_DATE = ['FECHA', 'DATE'];
    const COL_TIME = ['HORA', 'TIME'];

    const mapOf = (row) => {
        const map = {};
        Array.from(row.children).forEach((c, i) => {
            const t = norm(c.innerText || c.textContent);
            if (t && map[t] == null) map[t] = i;
        });
        return map;
    };

    const knowsColumns = (map) => COL_TITLE.concat(COL_TYPE).some((n) => map[n] != null);

    function headerMap(td) {
        const table = td.closest && td.closest('table');
        const row = td.closest && td.closest('tr');
        if (!table || !row) return null;

        const candidates = [];
        const push = (el) => { if (el && el !== row && candidates.indexOf(el) === -1) candidates.push(el); };

        push(table.querySelector('tr.uir-list-headerrow'));
        push(table.querySelector('thead tr'));
        const th = table.querySelector('th');
        if (th && th.closest) push(th.closest('tr'));
        const hc = table.querySelector('[class*="listheader"], [class*="uir-list-header"]');
        if (hc && hc.closest) push(hc.closest('tr'));
        Array.from(table.querySelectorAll('tr')).forEach((r) => {
            if (r !== row && r.children.length === row.children.length) push(r);
        });

        for (const c of candidates) {
            const map = mapOf(c);
            if (knowsColumns(map)) return map;
        }
        return null;
    }

    function guessByCellType(cells, td) {
        const typeOf = (c) => (c.getAttribute && c.getAttribute('data-list-cell-type')) || '';
        const dateIdx = cells.findIndex((c) => typeOf(c) === 'date');
        const timeIdx = cells.findIndex((c) => typeOf(c) === 'timeofday');
        const detailIdx = cells.indexOf(td);
        const limit = dateIdx >= 0 ? dateIdx : (detailIdx >= 0 ? detailIdx : cells.length);
        const text = (c) => (c ? (c.innerText || c.textContent || '').trim() : '');
        const plain = [];
        for (let i = 0; i < limit; i++) {
            const c = cells[i];
            if (!c || typeOf(c) !== 'string') continue;
            if (c.querySelector && c.querySelector('a')) continue;
            plain.push(i);
        }
        return {
            type: text(cells[plain[plain.length - 2]]),
            title: text(cells[plain[plain.length - 1]]),
            date: text(cells[dateIdx]),
            time: text(cells[timeIdx])
        };
    }

    function scriptIdFromUrl() {
        try {
            const p = new URLSearchParams(location.search);
            return p.get('scriptId') || (/script\.nl$/i.test(location.pathname) ? (p.get('id') || '') : '');
        } catch (e) { return ''; }
    }

    function rowNameParts(td) {
        const LF = window.NSFT_LogFormat;
        const row = td.closest && td.closest('tr');
        const cells = row ? Array.from(row.children) : [];
        const cellText = (i) => {
            const c = (i != null && i >= 0) ? cells[i] : null;
            return c ? (c.innerText || c.textContent || '').trim() : '';
        };

        const map = headerMap(td);
        let type = '';
        let title = '';
        let date = '';
        let time = '';
        if (map) {
            const pick = (names) => {
                for (const n of names) if (map[n] != null) return cellText(map[n]);
                return '';
            };
            type = pick(COL_TYPE);
            title = pick(COL_TITLE);
            date = pick(COL_DATE);
            time = pick(COL_TIME);
        }
        if (!title || !date) {
            const g = guessByCellType(cells, td);
            type = type || g.type;
            title = title || g.title;
            date = date || g.date;
            time = time || g.time;
        }
        const stamp = (date + ' ' + time).trim();

        const scriptId = scriptIdFromUrl();
        return [
            scriptId ? 'script-' + scriptId : '',
            type.toLowerCase(),
            title,
            LF && LF.stampPart ? LF.stampPart(stamp) : ''
        ];
    }

    const formatTD = (td) => {
        if (!td || td.dataset[FORMATTED_ATTR]) return;
        const lang = window.NSFT_LogFormat.renderInto(td, null, { nameParts: rowNameParts(td) });
        if (lang) td.dataset[FORMATTED_ATTR] = lang;
    };

    const scan = (root) => {
        if (root && root.querySelectorAll) {
            Array.from(root.querySelectorAll(SELECTOR)).forEach(formatTD);
        }
    };

    function observeDomChanges() {
        const handler = (mutations) => {
            mutations.forEach(m => {
                m.addedNodes.forEach(node => {
                    if (node.nodeType !== Node.ELEMENT_NODE) return;
                    if (node.matches && node.matches('td.listtext.uir-list-row-cell')) formatTD(node);
                    scan(node);
                });
            });
        };
        if (window.NSFT_Observer && typeof window.NSFT_Observer.subscribe === 'function') {
            unsubscribeObserver = window.NSFT_Observer.subscribe(handler, { throttle: 100 });
            return;
        }
        const observer = new MutationObserver(handler);
        observer.observe(document.body, { childList: true, subtree: true });
        unsubscribeObserver = () => observer.disconnect();
    }

    function teardown() {
        if (unsubscribeObserver) {
            try { unsubscribeObserver(); } catch (e) { }
            unsubscribeObserver = null;
        }
        document.documentElement.classList.remove(ACTIVE_CLASS);
        document.querySelectorAll(`${SELECTOR}[data-nsft-formatted]`).forEach((td) => {
            const wrapper = td.querySelector('.nsft-logfmt-wrapper');
            const raw = wrapper ? extractRawText(wrapper) : td.textContent;
            td.textContent = raw;
            delete td.dataset[FORMATTED_ATTR];
        });
    }

    function extractRawText(wrapper) {
        const code = wrapper.querySelector('code');
        if (code) return code.textContent || '';
        return wrapper.textContent || '';
    }

})();
