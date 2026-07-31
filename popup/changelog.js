document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        const msg = chrome.i18n.getMessage(key);
        if (msg) {
            el.textContent = msg;
        }
    });

    document.querySelectorAll('[data-i18n-alt]').forEach(el => {
        const key = el.getAttribute('data-i18n-alt');
        const msg = chrome.i18n.getMessage(key);
        if (msg) {
            el.setAttribute('alt', msg);
        }
    });

    const titleMsg = chrome.i18n.getMessage('changelog_title');
    if (titleMsg) {
        document.title = titleMsg;
    }
});
