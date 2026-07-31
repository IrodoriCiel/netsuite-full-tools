(function () {
    'use strict';

    const STORAGE_KEY = 'enableSavedSearchSplit';
    const NSFT_THEME_KEY = 'nsftTheme';
    const PANEL_ID = 'nsft-sss-panel';
    const MIN_W = 320;

    let dragging = false;
    let _theme = 'light';

    chrome.storage.local.get({ [STORAGE_KEY]: true, [NSFT_THEME_KEY]: 'light' }, (items) => {
        _theme = items[NSFT_THEME_KEY] || 'light';
        if (items[STORAGE_KEY]) activate();
    });

    chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== 'local') return;
        if (changes[NSFT_THEME_KEY]) {
            _theme = changes[NSFT_THEME_KEY].newValue || 'light';
            const p = document.getElementById(PANEL_ID);
            if (p) p.setAttribute('data-theme', resolveTheme());
        }
        if (!changes[STORAGE_KEY]) return;
        if (changes[STORAGE_KEY].newValue) activate();
        else { deactivate(); }
    });

    function resolveTheme() {
        return _theme === 'dark' ? 'dark' : 'light';
    }

    function activate() {
        window.NSFT_SavedSearchSplit = { open: open };
        window.addEventListener('nsft-show-saved-search-split', open);
    }

    function deactivate() {
        window.removeEventListener('nsft-show-saved-search-split', open);
        try { delete window.NSFT_SavedSearchSplit; } catch (e) { window.NSFT_SavedSearchSplit = undefined; }
        close();
    }

    function i18n(key, fallback) {
        try { return chrome.i18n.getMessage(key) || fallback; } catch (e) { return fallback; }
    }

    function toResultsUrl(value) {
        const v = (value || '').trim();
        if (!v) return null;
        if (/^\d+$/.test(v)) return '/app/common/search/searchresults.nl?searchid=' + v;
        if (/^https?:\/\//i.test(v)) {
            try {
                const u = new URL(v);
                if (u.hostname.endsWith('.netsuite.com')) return u.pathname + u.search;
            } catch (e) { }
            return null;
        }
        if (v.charAt(0) === '/') return v;
        return null;
    }

    function currentSearchId() {
        try {
            const p = new URLSearchParams(location.search);
            if (p.get('searchid')) return p.get('searchid');
            if (/\/search\//.test(location.pathname) && /^\d+$/.test(p.get('id') || '')) return p.get('id');
            return '';
        } catch (e) { return ''; }
    }

    function open() {
        if (document.getElementById(PANEL_ID)) {
            const inp = document.querySelector('#' + PANEL_ID + ' .nsft-sss-input');
            if (inp) inp.focus();
            return;
        }

        const panel = document.createElement('div');
        panel.id = PANEL_ID;
        panel.className = 'nsft-sss-panel';
        panel.setAttribute('data-nsft-ui', '');
        panel.setAttribute('data-theme', resolveTheme());

        const handle = document.createElement('div');
        handle.className = 'nsft-sss-handle';
        handle.title = i18n('sss_resize', 'Drag to resize');

        const head = document.createElement('div');
        head.className = 'nsft-sss-head';

        const title = document.createElement('span');
        title.className = 'nsft-sss-title';
        title.textContent = i18n('sss_title', 'Saved search');

        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'nsft-sss-input';
        input.placeholder = i18n('sss_placeholder', 'Saved search ID or URL…');
        input.value = currentSearchId();
        input.setAttribute('autocomplete', 'off');

        const go = document.createElement('button');
        go.type = 'button';
        go.className = 'nsft-sss-go';
        go.textContent = i18n('sss_open', 'Open');

        const closeBtn = document.createElement('button');
        closeBtn.type = 'button';
        closeBtn.className = 'nsft-sss-close';
        closeBtn.textContent = '×';
        closeBtn.title = i18n('sss_close', 'Close');

        const iframe = document.createElement('iframe');
        iframe.className = 'nsft-sss-iframe';
        iframe.setAttribute('title', i18n('sss_title', 'Saved search'));

        const load = () => {
            const url = toResultsUrl(input.value);
            if (!url) { input.focus(); input.select(); return; }
            iframe.src = url;
        };
        go.addEventListener('click', load);
        input.addEventListener('keydown', (e) => {
            e.stopPropagation();
            if (e.key === 'Enter') load();
            if (e.key === 'Escape') close();
        });
        closeBtn.addEventListener('click', close);
        handle.addEventListener('mousedown', onDragStart);

        head.appendChild(title);
        head.appendChild(input);
        head.appendChild(go);
        head.appendChild(closeBtn);
        panel.appendChild(handle);
        panel.appendChild(head);
        panel.appendChild(iframe);
        document.body.appendChild(panel);

        input.focus();
        if (input.value) load();
    }

    function close() {
        const p = document.getElementById(PANEL_ID);
        if (p) p.remove();
    }

    function onDragStart(e) {
        e.preventDefault();
        dragging = true;
        document.addEventListener('mousemove', onDragMove);
        document.addEventListener('mouseup', onDragEnd);
        document.body.style.userSelect = 'none';
        const p = document.getElementById(PANEL_ID);
        if (p) p.classList.add('nsft-sss-dragging');
    }

    function onDragMove(e) {
        if (!dragging) return;
        const p = document.getElementById(PANEL_ID);
        if (!p) return;
        const w = Math.max(MIN_W, Math.min(window.innerWidth - 100, window.innerWidth - e.clientX));
        p.style.width = w + 'px';
    }

    function onDragEnd() {
        dragging = false;
        document.removeEventListener('mousemove', onDragMove);
        document.removeEventListener('mouseup', onDragEnd);
        document.body.style.userSelect = '';
        const p = document.getElementById(PANEL_ID);
        if (p) p.classList.remove('nsft-sss-dragging');
    }
})();
