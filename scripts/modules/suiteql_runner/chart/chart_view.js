(function () {
    'use strict';

    const core = window.NSFT_ChartCore;
    const $ = (id) => document.getElementById(id);

    let rows = [];
    let chart = null;


    function applyI18n() {
        document.querySelectorAll('[data-i18n]').forEach((el) => {
            const msg = chrome.i18n.getMessage(el.getAttribute('data-i18n'));
            if (msg) el.textContent = msg;
        });
        document.querySelectorAll('[data-i18n-title]').forEach((el) => {
            const msg = chrome.i18n.getMessage(el.getAttribute('data-i18n-title'));
            if (msg) el.title = msg;
        });
    }

    function applyTheme(theme) {
        document.documentElement.setAttribute('data-nsft-theme', theme === 'dark' ? 'dark' : 'light');
    }

    function currentTheme() {
        return document.documentElement.getAttribute('data-nsft-theme') === 'dark' ? 'dark' : 'light';
    }


    function msg(text) {
        const el = $('cv-msg');
        const wrap = $('cv-canvas-wrap');
        if (el) { el.textContent = text || ''; el.hidden = !text; }
        if (wrap) wrap.style.visibility = text ? 'hidden' : '';
    }


    function fillControls(payload) {
        const cols = payload.columns || [];
        const numeric = cols.filter((c) => core.isNumericColumn(rows, c));

        const xSel = $('cv-x');
        const ySel = $('cv-y');
        xSel.innerHTML = cols.map((c) => `<option value="${escapeAttr(c)}">${escapeText(c)}</option>`).join('');
        ySel.innerHTML = numeric.map((c) => `<option value="${escapeAttr(c)}">${escapeText(c)}</option>`).join('');

        if (payload.x && cols.includes(payload.x)) xSel.value = payload.x;
        const wantY = payload.y || [];
        Array.from(ySel.options).forEach((o) => { o.selected = wantY.includes(o.value); });
        if (!Array.from(ySel.selectedOptions).length && ySel.options.length) ySel.options[0].selected = true;

        if (payload.type) $('cv-type').value = payload.type;
        if (payload.agg) $('cv-agg').value = payload.agg;
    }

    function escapeText(s) {
        const d = document.createElement('div');
        d.textContent = String(s == null ? '' : s);
        return d.innerHTML;
    }
    function escapeAttr(s) { return escapeText(s).replace(/"/g, '&quot;'); }


    function render(title) {
        const canvas = $('cv-canvas');
        if (!canvas || typeof window.Chart === 'undefined') return;
        if (chart) { chart.destroy(); chart = null; }

        if (!rows.length) { msg(chrome.i18n.getMessage('tbl_empty') || 'No data available'); return; }

        const type = $('cv-type').value || 'bar';
        const xField = $('cv-x').value;
        let yFields = Array.from($('cv-y').selectedOptions).map((o) => o.value);
        const agg = $('cv-agg').value || 'none';

        if (!yFields.length && agg !== 'count') {
            msg(chrome.i18n.getMessage('sql_chart_no_numeric')
                || 'Select at least one numeric column for the Y axis (or use Count).');
            return;
        }
        if (type === 'pie') yFields = yFields.slice(0, 1);

        const { labels, series } = core.buildSeries(rows, xField, yFields, agg);
        if (!labels.length) { msg(chrome.i18n.getMessage('tbl_empty') || 'No data available'); return; }

        msg('');
        chart = new window.Chart(
            canvas.getContext('2d'),
            core.buildConfig({ type, labels, series, theme: currentTheme(), title })
        );
    }


    async function downloadPng() {
        const canvas = $('cv-canvas');
        if (!chart || !canvas) return;
        const bg = currentTheme() === 'dark' ? '#141519' : '#ffffff';
        const blob = await core.canvasToPngBlob(canvas, bg, 2);
        if (!blob) return;
        core.downloadBlob(blob, `chart_${new Date().toISOString().slice(0, 10)}.png`);
    }


    function start() {
        applyI18n();

        chrome.storage.local.get([core.HANDOFF_KEY, 'nsftTheme'], (items) => {
            applyTheme(items.nsftTheme);

            const payload = items[core.HANDOFF_KEY];
            if (!payload || !Array.isArray(payload.data)) {
                msg(chrome.i18n.getMessage('sql_chart_view_expired')
                    || 'No data to chart. Open the chart again from the SuiteQL Runner.');
                return;
            }

            chrome.storage.local.remove(core.HANDOFF_KEY);

            rows = payload.data;
            const title = payload.title || 'SuiteQL';
            document.title = 'NSFT — ' + title;
            const titleEl = $('cv-title');
            if (titleEl) titleEl.textContent = title;
            const rowsEl = $('cv-rows');
            if (rowsEl) {
                rowsEl.textContent = chrome.i18n.getMessage('sql_chart_view_rows', [String(rows.length)])
                    || (rows.length + ' rows');
            }

            fillControls(payload);
            render(title);

            ['cv-type', 'cv-x', 'cv-y', 'cv-agg'].forEach((id) => {
                const el = $(id);
                if (el) el.addEventListener('change', () => render(title));
            });
            const png = $('cv-png');
            if (png) png.addEventListener('click', downloadPng);
        });

        chrome.storage.onChanged.addListener((changes, area) => {
            if (area !== 'local' || !changes.nsftTheme) return;
            applyTheme(changes.nsftTheme.newValue);
            const titleEl = $('cv-title');
            render(titleEl ? titleEl.textContent : 'SuiteQL');
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', start);
    } else {
        start();
    }
})();
