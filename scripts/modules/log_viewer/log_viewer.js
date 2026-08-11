(function () {
    'use strict';

    const STORAGE_KEY = 'enableLogViewer';
    const BAR_CLASS = 'nsft-lv-bar';
    const HIDDEN = 'nsft-lv-hidden';

    let _unsub = null;
    let _q = '';
    let _table = null;
    let _bar = null;

    if (!/\/scripting\/(?:script|scriptrecord|scriptdeploy|scriptnote|scriptnotearchive)\.nl(?:\?|$)/
        .test(location.pathname + location.search)) return;

    chrome.storage.local.get({ [STORAGE_KEY]: true }, (items) => {
        if (items[STORAGE_KEY]) init();
    });

    chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== 'local') return;
        if (!changes[STORAGE_KEY]) return;
        if (changes[STORAGE_KEY].newValue) init();
        else teardown();
    });

    function i18n(key, fallback, subs) {
        try { return chrome.i18n.getMessage(key, subs) || fallback; } catch (e) { return fallback; }
    }

    function init() {
        scan();
        if (window.NSFT_Observer && typeof window.NSFT_Observer.subscribe === 'function') {
            if (!_unsub) _unsub = window.NSFT_Observer.subscribe(scan, { throttle: 400 });
        }
    }

    function teardown() {
        if (_unsub) { try { _unsub(); } catch (e) { } _unsub = null; }
        document.querySelectorAll('.nsft-lv-cell').forEach(c => c.remove());
        document.querySelectorAll('.' + BAR_CLASS).forEach(b => b.remove());
        document.querySelectorAll('.' + HIDDEN).forEach(r => r.classList.remove(HIDDEN));
        unhighlight(document);
        _table = null; _bar = null;
    }

    function logRows(table) {
        return Array.from(table.querySelectorAll('tr')).filter(tr => tr.querySelector('td.uir-list-row-cell'));
    }

    function isVisible(el) {
        return !!(el && (el.offsetWidth || el.offsetHeight || el.getClientRects().length));
    }

    function getTable() {
        const byId = document.getElementById('tbl_refreshscriptnote');
        if (byId && logRows(byId).length) return byId;

        const tables = new Set();
        document.querySelectorAll('td.uir-list-row-cell').forEach(c => {
            const t = c.closest('table');
            if (t) tables.add(t);
        });
        let best = null, bestCount = 0;
        tables.forEach(t => {
            if (!isVisible(t)) return;
            const n = logRows(t).length;
            if (n > bestCount) { bestCount = n; best = t; }
        });
        return bestCount >= 3 ? best : null;
    }

    function headerLabels(table) {
        const headerRow = table.querySelector('tr.uir-list-headerrow, thead tr');
        if (!headerRow) return [];
        return Array.from(headerRow.children).map((c, i) => {
            const label = ((c.getAttribute && c.getAttribute('data-label')) || c.textContent || '')
                .replace(/\s+/g, ' ').trim();
            return label || ('Col ' + (i + 1));
        });
    }

    function rowCells(tr) {
        return Array.from(tr.querySelectorAll('td.uir-list-row-cell'))
            .map(td => (td.textContent || '').replace(/\s+/g, ' ').trim());
    }

    function scan() {
        const table = getTable();
        if (!table) return;
        _table = table;

        let bar = document.querySelector('.' + BAR_CLASS);
        if (!bar) {
            bar = buildBar();
            placeBar(bar, table);
        }
        _bar = bar;
        apply();
    }

    function placeBar(bar, table) {
        const marker = document.getElementById('tbl_refreshscriptnote');
        const execRow = marker ? marker.closest('tr') : null;

        if (execRow) {
            const fullLogsEl = execRow.querySelector('.nsft-full-logs-container');
            const anchorTd = fullLogsEl ? fullLogsEl.closest('td') : null;
            const td = cellFor(bar);
            if (anchorTd) anchorTd.insertAdjacentElement('afterend', td);
            else execRow.appendChild(td);
            return;
        }

        const archiveRow = findArchiveButtonRow();
        if (archiveRow) {
            const printEl = archiveRow.querySelector('.uir-list-print')
                || archiveRow.querySelector('#tbl_print');
            const printTd = printEl ? printEl.closest('td') : null;
            if (printTd) printTd.insertAdjacentElement('afterend', cellFor(bar));
            else archiveRow.appendChild(cellFor(bar));
            return;
        }

        table.parentNode.insertBefore(bar, table);
    }

    function cellFor(bar) {
        const td = document.createElement('td');
        td.className = 'nsft-lv-cell';
        td.appendChild(bar);
        return td;
    }

    function findArchiveButtonRow() {
        const SEL = 'table.uir-list-buttonbar-left > tbody > tr';
        const topBar = document.querySelector('table.uir-list-top-button-bar')
            || document.querySelector('table.uir-list-filter-bar');
        return (topBar && topBar.querySelector(SEL)) || document.querySelector(SEL);
    }

    const DOWNLOAD_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"'
        + ' stroke-linecap="round" aria-hidden="true"><path d="M12 4v11"></path>'
        + '<path d="M8 11l4 4 4-4"></path><path d="M5 19h14"></path></svg>';

    const CLEAR_SVG = '<svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.7"'
        + ' stroke-linecap="round" aria-hidden="true"><path d="M2.5 2.5l7 7M9.5 2.5l-7 7"></path></svg>';

    function buildBar() {
        const bar = document.createElement('div');
        bar.className = 'nsft-tb-group nsft-tb-search ' + BAR_CLASS;

        const icon = document.createElement('span');
        icon.className = 'nsft-lv-icon';
        icon.innerHTML = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"></circle><path d="M20 20l-3.6-3.6"></path></svg>';

        const search = document.createElement('input');
        search.className = 'nsft-lv-search';
        search.placeholder = i18n('lv_search_ph', 'Search logs…');
        search.setAttribute('autocomplete', 'off');
        search.value = _q;

        const clear = document.createElement('button');
        clear.type = 'button';
        clear.className = 'nsft-tb-clear nsft-lv-clear';
        clear.innerHTML = CLEAR_SVG;
        clear.hidden = !_q;
        const clearTitle = i18n('lv_clear_search', 'Borrar la búsqueda');
        clear.title = clearTitle;
        clear.setAttribute('aria-label', clearTitle);
        clear.addEventListener('click', () => {
            search.value = ''; _q = ''; clear.hidden = true;
            apply();
            search.focus();
        });

        search.addEventListener('input', () => { _q = search.value; clear.hidden = !search.value; apply(); });
        search.addEventListener('keydown', (e) => {
            e.stopPropagation();
            if (e.key === 'Escape') { search.value = ''; _q = ''; clear.hidden = true; apply(); }
        });

        const count = document.createElement('span');
        count.className = 'nsft-tb-count nsft-lv-count';

        const divider = document.createElement('span');
        divider.className = 'nsft-tb-divider';

        const exportBtn = (label, titleKey, titleFallback, handler) => {
            const b = document.createElement('button');
            b.type = 'button';
            b.className = 'nsft-tb-ghost nsft-lv-btn';
            b.title = i18n(titleKey, titleFallback);
            b.innerHTML = DOWNLOAD_SVG;
            const span = document.createElement('span');
            span.textContent = label;
            b.appendChild(span);
            b.addEventListener('click', handler);
            return b;
        };
        const csvBtn = exportBtn('CSV', 'lv_export_csv_title', 'Exportar filas filtradas a CSV', exportCsv);
        const jsonBtn = exportBtn('JSON', 'lv_export_json_title', 'Exportar filas filtradas a JSON', exportJson);

        bar.appendChild(icon);
        bar.appendChild(search);
        bar.appendChild(clear);
        bar.appendChild(count);
        bar.appendChild(divider);
        bar.appendChild(csvBtn);
        bar.appendChild(jsonBtn);
        return bar;
    }

    function setCount(text) {
        const count = _bar && _bar.querySelector('.nsft-lv-count');
        if (count) count.textContent = text;
    }

    function apply() {
        if (!_bar || !_table) return;
        const rows = logRows(_table);
        const q = fold(_q.trim());
        let visible = 0;
        rows.forEach(tr => {
            unhighlight(tr);
            const show = !q || fold(tr.textContent || '').indexOf(q) !== -1;
            tr.classList.toggle(HIDDEN, !show);
            if (show) {
                visible++;
                if (q) highlightTexts(tr, q);
            }
        });
        setCount(q ? (visible + ' / ' + rows.length) : String(rows.length));
    }


    function unhighlight(root) {
        root.querySelectorAll('mark.nsft-lv-hl').forEach((mk) => {
            const p = mk.parentNode;
            if (!p) return;
            p.replaceChild(document.createTextNode(mk.textContent), mk);
            p.normalize();
        });
    }

    function highlightTexts(root, needle) {
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
        const hits = [];
        let node;
        while ((node = walker.nextNode())) {
            if (node.nodeValue && fold(node.nodeValue).indexOf(needle) !== -1) hits.push(node);
        }
        hits.forEach((tn) => {
            const t = tn.nodeValue;
            const hay = fold(t);
            const frag = document.createDocumentFragment();
            let from = 0;
            let i = hay.indexOf(needle);
            while (i !== -1) {
                if (i > from) frag.appendChild(document.createTextNode(t.slice(from, i)));
                const mk = document.createElement('mark');
                mk.className = 'nsft-lv-hl';
                mk.textContent = t.slice(i, i + needle.length);
                frag.appendChild(mk);
                from = i + needle.length;
                i = hay.indexOf(needle, from);
            }
            if (from < t.length) frag.appendChild(document.createTextNode(t.slice(from)));
            tn.parentNode.replaceChild(frag, tn);
        });
    }

    const NON_ASCII = /[^\u0000-\u007F]/;
    const COMBINING = /[\u0300-\u036f]/g;

    function fold(text) {
        const s = String(text == null ? '' : text);
        if (!NON_ASCII.test(s)) return s.toLowerCase();
        let out = '';
        for (const ch of s) {
            const f = ch.normalize('NFD').replace(COMBINING, '').toLowerCase();
            out += (f.length === ch.length ? f : ch);
        }
        return out;
    }


    function currentExportData() {
        if (!_table) return null;
        const rows = logRows(_table)
            .filter(tr => !tr.classList.contains(HIDDEN))
            .map(rowCells);
        return { columns: headerLabels(_table), rows };
    }

    function exportFilename(ext) {
        const ts = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 16);
        return 'execution-log_' + ts + '.' + ext;
    }

    function exportCsv() {
        const data = currentExportData();
        if (!data || !data.rows.length) return;
        const esc = (v) => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
        const lines = [data.columns.map(esc).join(',')];
        data.rows.forEach(r => lines.push(r.map(esc).join(',')));
        saveBlob('\uFEFF' + lines.join('\r\n'), 'text/csv;charset=utf-8', exportFilename('csv'));
    }

    function exportJson() {
        const data = currentExportData();
        if (!data || !data.rows.length) return;
        const cols = data.columns;
        const objs = data.rows.map(r => {
            const o = {};
            r.forEach((v, i) => { o[cols[i] || ('col' + (i + 1))] = v; });
            return o;
        });
        saveBlob(JSON.stringify(objs, null, 2), 'application/json', exportFilename('json'));
    }

    function saveBlob(text, mime, filename) {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([text], { type: mime }));
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 10000);
    }
})();
