
(function () {
    'use strict';
    const STORAGE_KEY = 'enableEditorOpenInNewTab';
    const LINK_CLASS = 'nsft-new-tab-btn';

    let cachedLinkText = 'Open in new tab';
    let observerRef = null;
    let unsubscribeShared = null;

    chrome.storage.local.get({
        [STORAGE_KEY]: true
    }, (items) => {
        if (!items[STORAGE_KEY]) return;
        init();
    });

    function init() {
        try {
            cachedLinkText = chrome.i18n.getMessage('openInNewTab') || cachedLinkText;
        } catch (e) { }

        addButtons();

        if (window.NSFT_Observer && typeof window.NSFT_Observer.subscribe === 'function') {
            unsubscribeShared = window.NSFT_Observer.subscribe(addButtons);
        } else {
            observerRef = new MutationObserver(addButtons);
            observerRef.observe(document.body, { childList: true, subtree: true });
        }
    }

    function isExtensionContextValid() {
        try {
            return Boolean(chrome.runtime && chrome.runtime.id);
        } catch (e) {
            return false;
        }
    }

    function addButtons() {
        if (!isExtensionContextValid()) {
            if (observerRef) {
                observerRef.disconnect();
                observerRef = null;
            }
            if (unsubscribeShared) {
                unsubscribeShared();
                unsubscribeShared = null;
            }
            return;
        }

        const editLinks = document.querySelectorAll('a[onclick*="edittextmediaitem.nl"]');

        editLinks.forEach((link) => {
            if (link.nextElementSibling && link.nextElementSibling.classList.contains(LINK_CLASS)) return;

            const url = extractUrl(link.getAttribute('onclick'));
            if (!url) return;

            const newLink = document.createElement('a');
            newLink.href = url;
            newLink.target = '_blank';
            newLink.className = `${link.className || ''} ${LINK_CLASS}`;
            newLink.textContent = cachedLinkText;

            if (link.parentNode) {
                link.parentNode.insertBefore(newLink, link.nextSibling);
            }
        });
    }

    function extractUrl(onclickContent) {
        if (!onclickContent) return null;
        const match = onclickContent.match(/nlOpenWindow\s*\(\s*'([^']+)'/);
        return match ? match[1] : null;
    }
})();
