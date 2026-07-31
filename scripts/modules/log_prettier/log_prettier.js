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
        logPrettierTheme: 'atom-one-dark'
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
                window.NSFT_LogFormat.ensureTheme(changes.logPrettierTheme.newValue || 'atom-one-dark');
            }
            if (changes[STORAGE_KEY]) {
                const enabled = changes[STORAGE_KEY].newValue !== false;
                if (!enabled) teardown();
                else chrome.storage.local.get({ logPrettierTheme: 'atom-one-dark' }, init);
            }
        };
        chrome.storage.onChanged.addListener(storageListener);
    }

    const formatTD = (td) => {
        if (!td || td.dataset[FORMATTED_ATTR]) return;
        const lang = window.NSFT_LogFormat.renderInto(td);
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
