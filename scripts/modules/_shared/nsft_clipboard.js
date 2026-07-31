(function () {
    'use strict';

    if (window.NSFT_Clipboard) return;

    const TOAST_CONTAINER_ID = 'nsft-clipboard-toasts';
    const NSFT_THEME_KEY = 'nsftTheme';
    const DEFAULT_DURATION = 1600;
    const DEFAULT_SUCCESS_MSG = 'Copied';

    let _theme = 'light';
    try {
        chrome.storage.local.get({ [NSFT_THEME_KEY]: 'light' }, (items) => {
            _theme = items[NSFT_THEME_KEY] || 'light';
            applyThemeToContainer(document.getElementById(TOAST_CONTAINER_ID));
        });
        chrome.storage.onChanged.addListener((changes, area) => {
            if (area !== 'local' || !changes[NSFT_THEME_KEY]) return;
            _theme = changes[NSFT_THEME_KEY].newValue || 'light';
            applyThemeToContainer(document.getElementById(TOAST_CONTAINER_ID));
        });
    } catch (_) { }

    function applyThemeToContainer(c) {
        if (!c) return;
        if (_theme === 'light' || _theme === 'dark') c.setAttribute('data-theme', _theme);
        else c.removeAttribute('data-theme');
    }

    function copy(text, options) {
        options = options || {};
        const str = String(text == null ? '' : text);

        const showFeedback = options.toast !== false;
        const toastOpts = (typeof options.toast === 'object' && options.toast) || {};
        const successMsg = toastOpts.message || chrome.i18n.getMessage('nsft_clipboard_copied') || DEFAULT_SUCCESS_MSG;
        const errorMsg = toastOpts.errorMessage || chrome.i18n.getMessage('nsft_clipboard_fail') || 'Copy failed';

        return tryCopyModern(str)
            .catch(() => tryCopyLegacy(str))
            .then((ok) => {
                if (ok) {
                    if (showFeedback) showToast(successMsg, {
                        duration: toastOpts.duration,
                        type: 'success',
                        preview: toastOpts.preview !== false ? str : ''
                    });
                    if (typeof options.onSuccess === 'function') options.onSuccess(str);
                } else {
                    if (showFeedback) showToast(errorMsg, { duration: toastOpts.duration, type: 'error' });
                    if (typeof options.onError === 'function') options.onError();
                }
                return ok;
            });
    }

    function tryCopyModern(text) {
        if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
            return navigator.clipboard.writeText(text).then(() => true);
        }
        return Promise.reject(new Error('Clipboard API unavailable'));
    }

    function tryCopyLegacy(text) {
        return new Promise((resolve) => {
            try {
                const ta = document.createElement('textarea');
                ta.value = text;
                ta.setAttribute('readonly', '');
                ta.style.position = 'fixed';
                ta.style.top = '-1000px';
                ta.style.left = '-1000px';
                ta.style.opacity = '0';
                document.body.appendChild(ta);
                ta.focus();
                ta.select();
                const ok = document.execCommand('copy');
                document.body.removeChild(ta);
                resolve(!!ok);
            } catch (e) {
                resolve(false);
            }
        });
    }

    function showToast(message, options) {
        options = options || {};
        const duration = options.duration || DEFAULT_DURATION;
        const type = options.type || 'success';
        const preview = typeof options.preview === 'string' ? options.preview : '';

        const container = ensureContainer();
        const toast = document.createElement('div');
        toast.className = 'nsft-clipboard-toast nsft-clipboard-toast-' + type;

        const iconHtml = type === 'error'
            ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>`
            : type === 'info'
                ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>`
                : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`;

        const previewHtml = preview
            ? `<div class="nsft-clipboard-toast-preview" title="${escapeAttr(preview)}">${escapeHtml(truncate(preview, 48))}</div>`
            : '';

        toast.innerHTML = `
            <span class="nsft-clipboard-toast-icon">${iconHtml}</span>
            <div class="nsft-clipboard-toast-body">
                <div class="nsft-clipboard-toast-title">${escapeHtml(message)}</div>
                ${previewHtml}
            </div>`;

        container.appendChild(toast);

        requestAnimationFrame(() => toast.classList.add('is-visible'));

        setTimeout(() => {
            toast.classList.remove('is-visible');
            toast.addEventListener('transitionend', () => toast.remove(), { once: true });
            setTimeout(() => { if (toast.parentNode) toast.remove(); }, 500);
        }, duration);
    }

    function truncate(s, max) {
        if (!s) return '';
        const flat = s.replace(/\s+/g, ' ').trim();
        return flat.length > max ? flat.slice(0, max - 1) + '…' : flat;
    }

    function escapeHtml(s) {
        return String(s).replace(/[&<>"']/g, c => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        }[c]));
    }

    function escapeAttr(s) {
        return escapeHtml(s);
    }

    function ensureContainer() {
        let c = document.getElementById(TOAST_CONTAINER_ID);
        if (c) return c;
        c = document.createElement('div');
        c.id = TOAST_CONTAINER_ID;
        c.className = 'nsft-clipboard-toast-container';
        applyThemeToContainer(c);
        document.body.appendChild(c);
        return c;
    }

    window.NSFT_Clipboard = { copy, showToast };
})();
