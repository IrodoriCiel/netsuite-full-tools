(function () {
    'use strict';

    const STORAGE_KEY = 'enableLogViewer';
    const NSFT_THEME_KEY = 'nsftTheme';
    const BAR_CLASS = 'nsft-lv-bar';
    const HIDDEN = 'nsft-lv-hidden';
    const PANEL_CLASS = 'nsft-lv-panel';
    const MAX_LOGS = 5000;
    const MAX_RENDER = 500;
    const FETCH_CONCURRENCY = 2;
    const LOG_LEVELS = { DEBUG: 'debug', AUDIT: 'audit', ERROR: 'error', EMERGENCY: 'emergency', SYSTEM: 'system' };

    let _theme = 'light';
    let _unsub = null;
    let _q = '';
    let _table = null;
    let _bar = null;
    let _panel = null;
    let _dataset = null;
    let _allMode = false;
    let _loading = false;
    let _abort = null;
    let _renderTimer = null;

    if (!/\/scripting\/(?:script|scriptrecord|scriptdeploy|scriptnote|scriptnotearchive)\.nl(?:\?|$)/
        .test(location.pathname + location.search)) return;

    chrome.storage.local.get({ [STORAGE_KEY]: true, [NSFT_THEME_KEY]: 'light' }, (items) => {
        _theme = items[NSFT_THEME_KEY] || 'light';
        if (items[STORAGE_KEY]) init();
    });

    chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== 'local') return;
        if (changes[NSFT_THEME_KEY]) {
            _theme = changes[NSFT_THEME_KEY].newValue || 'light';
            if (_panel) _panel.setAttribute('data-theme', resolveTheme());
        }
        if (!changes[STORAGE_KEY]) return;
        if (changes[STORAGE_KEY].newValue) init();
        else teardown();
    });

    function i18n(key, fallback, subs) {
        try { return chrome.i18n.getMessage(key, subs) || fallback; } catch (e) { return fallback; }
    }

    function resolveTheme() {
        return _theme === 'dark' ? 'dark' : 'light';
    }

    function init() {
        scan();
        if (window.NSFT_Observer && typeof window.NSFT_Observer.subscribe === 'function') {
            if (!_unsub) _unsub = window.NSFT_Observer.subscribe(scan, { throttle: 400 });
        }
    }

    function teardown() {
        if (_unsub) { try { _unsub(); } catch (e) { } _unsub = null; }
        if (_abort) { _abort.abort(); _abort = null; }
        document.querySelectorAll('.nsft-lv-cell').forEach(c => c.remove());
        document.querySelectorAll('.' + BAR_CLASS).forEach(b => b.remove());
        document.querySelectorAll('.' + PANEL_CLASS).forEach(p => p.remove());
        document.querySelectorAll('.' + HIDDEN).forEach(r => r.classList.remove(HIDDEN));
        _table = null; _bar = null; _panel = null;
        _dataset = null; _allMode = false; _loading = false;
    }

    function logRows(table) {
        return Array.from(table.querySelectorAll('tr')).filter(tr => tr.querySelector('td.uir-list-row-cell'));
    }

    function isVisible(el) {
        return !!(el && (el.offsetWidth || el.offsetHeight || el.getClientRects().length));
    }

    function getTableIn(root, requireVisible) {
        const byId = root.getElementById ? root.getElementById('tbl_refreshscriptnote') : null;
        if (byId && logRows(byId).length) return byId;

        const cells = root.querySelectorAll('td.uir-list-row-cell');
        const tables = new Set();
        cells.forEach(c => { const t = c.closest('table'); if (t) tables.add(t); });
        let best = null, bestCount = 0;
        tables.forEach(t => {
            if (requireVisible && !isVisible(t)) return;
            const n = logRows(t).length;
            if (n > bestCount) { bestCount = n; best = t; }
        });
        return bestCount >= 3 ? best : null;
    }

    function getTable() { return getTableIn(document, true); }

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
            const marker = document.getElementById('tbl_refreshscriptnote');
            const toolbarRow = marker ? marker.closest('tr') : null;
            if (toolbarRow) {
                const td = document.createElement('td');
                td.className = 'nsft-lv-cell';
                td.appendChild(bar);
                const fullLogsTd = toolbarRow.querySelector('.nsft-full-logs-container');
                if (fullLogsTd) fullLogsTd.insertAdjacentElement('afterend', td);
                else toolbarRow.appendChild(td);
            } else {
                table.parentNode.insertBefore(bar, table);
            }
        }
        _bar = bar;
        apply();
    }

    function buildBar() {
        const bar = document.createElement('div');
        bar.className = BAR_CLASS;

        const icon = document.createElement('span');
        icon.className = 'nsft-lv-icon';
        icon.innerHTML = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>';

        const search = document.createElement('input');
        search.type = 'text';
        search.className = 'nsft-lv-search';
        search.placeholder = i18n('lv_search_ph', 'Search logs…');
        search.setAttribute('autocomplete', 'off');
        search.value = _q;
        search.addEventListener('input', () => { _q = search.value; apply(); });
        search.addEventListener('keydown', (e) => {
            e.stopPropagation();
            if (e.key === 'Escape') { search.value = ''; _q = ''; apply(); }
        });

        const count = document.createElement('span');
        count.className = 'nsft-lv-count';

        const allBtn = document.createElement('button');
        allBtn.type = 'button';
        allBtn.className = 'nsft-lv-btn nsft-lv-all';
        allBtn.textContent = i18n('lv_all_btn', 'Todos');
        allBtn.title = i18n('lv_all_title', 'Buscar en todos los logs del script');
        allBtn.addEventListener('click', onAllClick);

        const csvBtn = document.createElement('button');
        csvBtn.type = 'button';
        csvBtn.className = 'nsft-lv-btn';
        csvBtn.textContent = 'CSV';
        csvBtn.title = i18n('lv_export_csv_title', 'Exportar filas filtradas a CSV');
        csvBtn.addEventListener('click', exportCsv);

        const jsonBtn = document.createElement('button');
        jsonBtn.type = 'button';
        jsonBtn.className = 'nsft-lv-btn';
        jsonBtn.textContent = 'JSON';
        jsonBtn.title = i18n('lv_export_json_title', 'Exportar filas filtradas a JSON');
        jsonBtn.addEventListener('click', exportJson);

        bar.appendChild(icon);
        bar.appendChild(search);
        bar.appendChild(count);
        bar.appendChild(allBtn);
        bar.appendChild(csvBtn);
        bar.appendChild(jsonBtn);
        return bar;
    }

    function setCount(text) {
        const count = _bar && _bar.querySelector('.nsft-lv-count');
        if (count) count.textContent = text;
    }

    function setAllBtnState() {
        const btn = _bar && _bar.querySelector('.nsft-lv-all');
        if (!btn) return;
        btn.classList.toggle('nsft-lv-btn-active', _allMode);
        btn.classList.toggle('nsft-lv-btn-loading', _loading);
        btn.textContent = _loading ? '✕' : i18n('lv_all_btn', 'Todos');
        btn.title = _loading
            ? i18n('lv_cancel_title', 'Cancelar la carga')
            : i18n('lv_all_title', 'Buscar en todos los logs del script');
    }

    function apply() {
        if (!_bar) return;
        if (_allMode && _dataset) { applyAll(); return; }
        if (!_table) return;
        const rows = logRows(_table);
        const q = _q.trim().toLowerCase();
        let visible = 0;
        rows.forEach(tr => {
            const show = !q || (tr.textContent || '').toLowerCase().indexOf(q) !== -1;
            tr.classList.toggle(HIDDEN, !show);
            if (show) visible++;
        });
        setCount(q ? (visible + ' / ' + rows.length) : String(rows.length));
    }


    function isArchivePage() {
        return /\/scripting\/(?:scriptnote|scriptnotearchive)\.nl/.test(location.pathname);
    }

    function buildArchiveUrl() {
        if (isArchivePage()) return location.href;
        const pageId = new URL(location.href).searchParams.get('id');
        if (!pageId) return null;
        const scriptId = resolveScriptId(pageId);
        if (!scriptId) return null;
        const u = new URL('/app/common/scripting/scriptnotearchive.nl', location.origin);
        u.searchParams.set('daterange', 'ALL');
        u.searchParams.set('date', 'ALL');
        u.searchParams.set('sortcol', 'timestamp');
        u.searchParams.set('sortdir', 'DESC');
        u.searchParams.set('loglevel', '');
        u.searchParams.set('scriptId', scriptId);
        const deployId = resolveScriptRecordId();
        if (deployId) u.searchParams.set('scriptRecordId', deployId);
        return u.href;
    }

    function resolveScriptId(pageId) {
        if (/\/scripting\/script\.nl/i.test(location.pathname)) return pageId;
        if (document.querySelector('tr.uir-list-row-tr a[href*="scriptdeploy.nl"]')) return pageId;
        const links = document.querySelectorAll('a[href*="script.nl?id="]');
        for (const a of links) {
            try {
                const sid = new URL(a.getAttribute('href'), location.origin).searchParams.get('id');
                if (sid && sid !== pageId) return sid;
            } catch (e) { }
        }
        return pageId;
    }

    function resolveScriptRecordId() {
        const existing = document.querySelector('a[href*="scriptnotearchive.nl"]:not(.nsft-full-logs-btn)');
        if (existing && existing.href) {
            try {
                const sr = new URL(existing.href, location.origin).searchParams.get('scriptRecordId');
                if (sr) return sr;
            } catch (e) { }
        }
        const deployLink = document.querySelector('tr.uir-list-row-tr a[href*="scriptdeploy.nl"]');
        if (deployLink && deployLink.href) {
            try {
                const deployId = new URL(deployLink.href, location.origin).searchParams.get('id');
                if (deployId) return deployId;
            } catch (e) { }
        }
        return null;
    }

    async function fetchDoc(url, signal) {
        const res = await fetch(url, { signal, credentials: 'same-origin' });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return new DOMParser().parseFromString(await res.text(), 'text/html');
    }

    function parseLogDoc(doc) {
        const table = getTableIn(doc, false);
        const out = { columns: [], rows: [], segments: [] };
        if (table) {
            out.columns = headerLabels(table);
            out.rows = logRows(table).map(rowCells);
        }
        doc.querySelectorAll('#segment_sel_fs li[data-pagination-value]').forEach(li => {
            const v = li.getAttribute('data-pagination-value');
            if (v && !li.classList.contains('selected')) out.segments.push(v);
        });
        if (!out.segments.length) {
            const sel = doc.querySelector('select[name="segment"], select#segment');
            if (sel) Array.from(sel.options).forEach(o => { if (!o.selected && o.value) out.segments.push(o.value); });
        }
        return out;
    }

    async function fetchAllLogs(onProgress, signal) {
        const base = buildArchiveUrl();
        if (!base) throw new Error(i18n('lv_all_error', 'No se pudieron cargar los logs.'));
        const first = parseLogDoc(await fetchDoc(base, signal));
        const columns = first.columns;
        let rows = first.rows;
        let truncated = false;
        onProgress(rows.length);

        for (let i = 0; i < first.segments.length && rows.length < MAX_LOGS; i += FETCH_CONCURRENCY) {
            const batch = first.segments.slice(i, i + FETCH_CONCURRENCY);
            const docs = await Promise.all(batch.map(s => {
                const u = new URL(base);
                u.searchParams.set('segment', s);
                u.searchParams.delete('segment_sel');
                return fetchDoc(u.href, signal).catch(e => {
                    if (signal.aborted) throw e;
                    return null;
                });
            }));
            docs.forEach(d => { if (d) rows = rows.concat(parseLogDoc(d).rows); });
            onProgress(Math.min(rows.length, MAX_LOGS));
        }
        if (rows.length > MAX_LOGS) { rows = rows.slice(0, MAX_LOGS); truncated = true; }
        return { columns, rows, truncated };
    }

    async function onAllClick() {
        if (_loading) { if (_abort) _abort.abort(); return; }
        if (_allMode) { exitAllMode(); return; }
        if (_dataset) { enterAllMode(); return; }
        _loading = true;
        _abort = new AbortController();
        setAllBtnState();
        try {
            _dataset = await fetchAllLogs((n) => setCount('⏳ ' + n), _abort.signal);
            enterAllMode();
        } catch (e) {
            if (!(e && e.name === 'AbortError')) {
                console.warn('NSFT log_viewer: fetch-all failed', e);
                setCount('⚠');
                const btn = _bar && _bar.querySelector('.nsft-lv-all');
                if (btn) btn.title = i18n('lv_all_error', 'No se pudieron cargar los logs.');
            } else {
                apply();
            }
        } finally {
            _loading = false;
            _abort = null;
            setAllBtnState();
        }
    }

    function enterAllMode() {
        _allMode = true;
        ensurePanel();
        setAllBtnState();
        apply();
    }

    function exitAllMode() {
        _allMode = false;
        if (_panel) { _panel.remove(); _panel = null; }
        setAllBtnState();
        apply();
    }

    function ensurePanel() {
        if (_panel && document.body.contains(_panel)) return;
        const panel = document.createElement('div');
        panel.className = PANEL_CLASS;
        panel.setAttribute('data-theme', resolveTheme());

        const head = document.createElement('div');
        head.className = 'nsft-lv-panel-head';

        const title = document.createElement('span');
        title.className = 'nsft-lv-panel-title';
        title.textContent = i18n('lv_panel_title', 'Todos los logs');

        const note = document.createElement('span');
        note.className = 'nsft-lv-panel-note';

        const refresh = document.createElement('button');
        refresh.type = 'button';
        refresh.className = 'nsft-lv-btn';
        refresh.textContent = '↻';
        refresh.title = i18n('lv_panel_refresh', 'Recargar los logs');
        refresh.addEventListener('click', () => {
            _dataset = null;
            exitAllMode();
            onAllClick();
        });

        const close = document.createElement('button');
        close.type = 'button';
        close.className = 'nsft-lv-btn';
        close.textContent = '✕';
        close.title = i18n('lv_panel_close', 'Cerrar y volver a las filas de la página');
        close.addEventListener('click', exitAllMode);

        head.appendChild(title);
        head.appendChild(note);
        head.appendChild(refresh);
        head.appendChild(close);

        const body = document.createElement('div');
        body.className = 'nsft-lv-panel-body';

        panel.appendChild(head);
        panel.appendChild(body);

        if (_table && _table.parentNode) _table.parentNode.insertBefore(panel, _table);
        else if (_bar && _bar.parentNode) _bar.parentNode.appendChild(panel);
        _panel = panel;
    }

    function filterDataset() {
        const q = _q.trim().toLowerCase();
        if (!q) return _dataset.rows;
        return _dataset.rows.filter(r => r.join(' ').toLowerCase().indexOf(q) !== -1);
    }

    function applyAll() {
        const filtered = filterDataset();
        setCount(filtered.length + ' / ' + _dataset.rows.length);
        clearTimeout(_renderTimer);
        _renderTimer = setTimeout(() => renderPanel(filtered), 120);
    }

    function renderPanel(filtered) {
        if (!_panel) return;
        const body = _panel.querySelector('.nsft-lv-panel-body');
        const note = _panel.querySelector('.nsft-lv-panel-note');
        body.textContent = '';

        const table = document.createElement('table');
        table.className = 'nsft-lv-table';

        const thead = document.createElement('thead');
        const hr = document.createElement('tr');
        _dataset.columns.forEach(c => {
            const th = document.createElement('th');
            th.textContent = c;
            hr.appendChild(th);
        });
        thead.appendChild(hr);
        table.appendChild(thead);

        const tbody = document.createElement('tbody');
        filtered.slice(0, MAX_RENDER).forEach(r => {
            const tr = document.createElement('tr');
            r.forEach(v => {
                const td = document.createElement('td');
                const lvl = LOG_LEVELS[String(v).trim().toUpperCase()];
                if (lvl) {
                    const badge = document.createElement('span');
                    badge.className = 'nsft-lv-level nsft-lv-level-' + lvl;
                    badge.textContent = v;
                    td.appendChild(badge);
                } else {
                    td.textContent = v;
                }
                tr.appendChild(td);
            });
            tbody.appendChild(tr);
        });
        table.appendChild(tbody);
        body.appendChild(table);

        const bits = [];
        if (filtered.length > MAX_RENDER) {
            bits.push(i18n('lv_showing', 'Mostrando ' + MAX_RENDER + ' de ' + filtered.length, [String(MAX_RENDER), String(filtered.length)]));
        }
        if (_dataset.truncated) {
            bits.push(i18n('lv_loaded_cap', 'Se cargaron los primeros ' + MAX_LOGS + ' registros.', [String(MAX_LOGS)]));
        }
        note.textContent = bits.join(' · ');
    }


    function currentExportData() {
        if (_allMode && _dataset) {
            return { columns: _dataset.columns, rows: filterDataset() };
        }
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
