(function () {
    'use strict';

    const STORAGE_KEY = 'enablePagePerformance';
    const PANEL_ID = 'nsft-pp-panel';
    const OVERLAY_ID = 'nsft-pp-overlay';
    const NSFT_THEME_KEY = 'nsftTheme';

    let _theme = 'light';

    chrome.storage.local.get({ [STORAGE_KEY]: true, [NSFT_THEME_KEY]: 'light' }, (items) => {
        _theme = items[NSFT_THEME_KEY] || 'light';
        if (items[STORAGE_KEY]) activate();
    });

    chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== 'local') return;
        if (changes[STORAGE_KEY]) {
            if (changes[STORAGE_KEY].newValue) activate();
            else deactivate();
        }
        if (changes[NSFT_THEME_KEY]) {
            _theme = changes[NSFT_THEME_KEY].newValue || 'light';
            const o = document.getElementById(OVERLAY_ID);
            if (o) o.setAttribute('data-theme', resolveTheme());
        }
    });

    function resolveTheme() {
        return _theme === 'dark' ? 'dark' : 'light';
    }

    function activate() {
        if (window.NSFT_Shortcuts && window.NSFT_Shortcuts.bind) {
            window.NSFT_Shortcuts.bind('page_performance', {
                label: chrome.i18n.getMessage('pp_title') || 'Page performance',
                defaultCombo: { ctrlKey: false, shiftKey: true, altKey: true, code: 'KeyP' },
                storageKey: 'pagePerformanceShortcut',
                event: 'nsft-show-page-performance',
                group: chrome.i18n.getMessage('cheatsheet_group_global') || 'Global',
                order: 43
            });
        }

        window.NSFT_PagePerf = { open: open };
        window.addEventListener('nsft-show-page-performance', () => {
            open();
            if (window.NSFT_ShortcutCoach) window.NSFT_ShortcutCoach.hint('page_performance');
        });
    }

    function deactivate() {
        window.removeEventListener('nsft-show-page-performance', open);
        try { delete window.NSFT_PagePerf; } catch (e) { window.NSFT_PagePerf = undefined; }
        close();
    }


    function getNav() {
        try {
            const e = performance.getEntriesByType && performance.getEntriesByType('navigation');
            if (e && e[0]) return e[0];
        } catch (err) { }
        const t = performance.timing;
        if (!t || !t.navigationStart) return null;
        const s = t.navigationStart;
        const rel = (v) => (v ? v - s : 0);
        return {
            startTime: 0,
            redirectStart: rel(t.redirectStart), redirectEnd: rel(t.redirectEnd),
            domainLookupStart: rel(t.domainLookupStart), domainLookupEnd: rel(t.domainLookupEnd),
            connectStart: rel(t.connectStart), connectEnd: rel(t.connectEnd),
            requestStart: rel(t.requestStart), responseStart: rel(t.responseStart),
            responseEnd: rel(t.responseEnd), domInteractive: rel(t.domInteractive),
            domContentLoadedEventEnd: rel(t.domContentLoadedEventEnd),
            domComplete: rel(t.domComplete),
            loadEventStart: rel(t.loadEventStart), loadEventEnd: rel(t.loadEventEnd)
        };
    }

    function computeMetrics() {
        const n = getNav();
        if (!n) return null;
        const ms = (v) => Math.max(0, Math.round(v || 0));

        const phases = [
            { key: 'dns', label: i18n('pp_dns', 'DNS lookup'), value: ms(n.domainLookupEnd - n.domainLookupStart) },
            { key: 'tcp', label: i18n('pp_tcp', 'Connect'), value: ms(n.connectEnd - n.connectStart) },
            { key: 'ttfb', label: i18n('pp_ttfb', 'Server response (TTFB)'), value: ms(n.responseStart - n.requestStart) },
            { key: 'download', label: i18n('pp_download', 'Content download'), value: ms(n.responseEnd - n.responseStart) },
            { key: 'dom', label: i18n('pp_dom', 'DOM processing'), value: ms(n.domComplete - n.responseEnd) }
        ];

        const loaded = n.loadEventEnd > 0 ? n.loadEventEnd : performance.now();
        const total = ms(loaded - n.startTime);
        const dcl = ms(n.domContentLoadedEventEnd - n.startTime);

        let count = 0, bytes = 0;
        try {
            const res = performance.getEntriesByType('resource') || [];
            count = res.length;
            bytes = res.reduce((sum, r) => sum + (r.transferSize || 0), 0);
        } catch (err) { }

        return { phases: phases, total: total, dcl: dcl, resources: { count: count, bytes: bytes }, stillLoading: n.loadEventEnd === 0 };
    }


    function i18n(key, fallback) {
        try { return chrome.i18n.getMessage(key) || fallback; } catch (e) { return fallback; }
    }

    function fmtMs(v) {
        return v >= 1000 ? (v / 1000).toFixed(2) + ' s' : v + ' ms';
    }

    function fmtBytes(b) {
        if (b >= 1048576) return (b / 1048576).toFixed(1) + ' MB';
        if (b >= 1024) return Math.round(b / 1024) + ' KB';
        return b + ' B';
    }

    function open() {
        close();
        const m = computeMetrics();

        const overlay = document.createElement('div');
        overlay.id = OVERLAY_ID;
        overlay.className = 'nsft-pp-overlay';
        overlay.setAttribute('data-theme', resolveTheme());
        overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

        const panel = document.createElement('div');
        panel.id = PANEL_ID;
        panel.className = 'nsft-pp-panel';

        if (!m) {
            panel.innerHTML = '<div class="nsft-pp-head"><span class="nsft-pp-title">'
                + esc(i18n('pp_title', 'Page performance')) + '</span></div>'
                + '<div class="nsft-pp-empty">' + esc(i18n('pp_unavailable', 'Timing data is not available on this page.')) + '</div>';
            overlay.appendChild(panel);
            mount(overlay);
            return;
        }

        const maxPhase = Math.max(1, ...m.phases.map(p => p.value));

        const phaseRows = m.phases.map(p => {
            const pct = Math.round((p.value / maxPhase) * 100);
            return '<div class="nsft-pp-row">'
                + '<span class="nsft-pp-plabel">' + esc(p.label) + '</span>'
                + '<span class="nsft-pp-bar"><span class="nsft-pp-bar-fill" style="width:' + pct + '%"></span></span>'
                + '<span class="nsft-pp-pval">' + esc(fmtMs(p.value)) + '</span>'
                + '</div>';
        }).join('');

        panel.innerHTML =
            '<div class="nsft-pp-head">'
            + '<span class="nsft-pp-title">' + esc(i18n('pp_title', 'Page performance')) + '</span>'
            + '<button type="button" class="nsft-pp-x" aria-label="Close">×</button>'
            + '</div>'
            + '<div class="nsft-pp-hero">'
            + '<div class="nsft-pp-hero-item"><div class="nsft-pp-big">' + esc(fmtMs(m.total)) + (m.stillLoading ? ' <span class="nsft-pp-loading">…</span>' : '') + '</div><div class="nsft-pp-cap">' + esc(i18n('pp_total', 'Fully loaded')) + '</div></div>'
            + '<div class="nsft-pp-hero-item"><div class="nsft-pp-big2">' + esc(fmtMs(m.dcl)) + '</div><div class="nsft-pp-cap">' + esc(i18n('pp_dcl', 'DOMContentLoaded')) + '</div></div>'
            + '</div>'
            + '<div class="nsft-pp-rows">' + phaseRows + '</div>'
            + '<div class="nsft-pp-res">' + esc(i18n('pp_requests', 'Requests')) + ': <b>' + m.resources.count + '</b> · ' + esc(fmtBytes(m.resources.bytes)) + '</div>'
            + '<div class="nsft-pp-foot"><button type="button" class="nsft-pp-copy">' + esc(i18n('pp_copy', 'Copy summary')) + '</button></div>';

        panel.querySelector('.nsft-pp-x').addEventListener('click', close);
        panel.querySelector('.nsft-pp-copy').addEventListener('click', () => copySummary(m));

        overlay.appendChild(panel);
        mount(overlay);
    }

    function mount(overlay) {
        (document.body || document.documentElement).appendChild(overlay);
        document.addEventListener('keydown', onKey, true);
    }

    function onKey(e) {
        if (e.key === 'Escape') { e.stopPropagation(); close(); }
    }

    function close() {
        const o = document.getElementById(OVERLAY_ID);
        if (o) o.remove();
        document.removeEventListener('keydown', onKey, true);
    }

    function copySummary(m) {
        const lines = [
            i18n('pp_title', 'Page performance') + ' — ' + location.pathname,
            i18n('pp_total', 'Fully loaded') + ': ' + fmtMs(m.total),
            i18n('pp_dcl', 'DOMContentLoaded') + ': ' + fmtMs(m.dcl)
        ];
        m.phases.forEach(p => lines.push('  - ' + p.label + ': ' + fmtMs(p.value)));
        lines.push(i18n('pp_requests', 'Requests') + ': ' + m.resources.count + ' (' + fmtBytes(m.resources.bytes) + ')');
        const text = lines.join('\n');

        if (window.NSFT_Clipboard && typeof window.NSFT_Clipboard.copy === 'function') {
            window.NSFT_Clipboard.copy(text, { toast: i18n('pp_copied', 'Performance summary copied') });
        } else {
            try { navigator.clipboard.writeText(text); } catch (e) { }
        }
    }

    function esc(s) {
        return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    }
})();
