(function () {
    'use strict';

    const STORAGE_KEY = 'enableDiscreetMode';
    const MAX_TICKS = 5;
    const RETRY_MS = 1000;
    const PROBE_MS = 100;

    const SELECTORS = {
        refreshed: {
            navbarAccount: [
                'div[role="menuitem"][data-header-section="role-menu"][data-automation-id="RoleMenuItem"]',
                'div[role="button"][data-header-section="role-menu"][data-automation-id="RoleMenuItem"]',
                'button[data-header-section="quick-link-menu"][data-automation-id="RoleMenuItem"]'
            ],
            accountLinks: [
                'div[data-role="popover"][role="dialog"][data-widget="Popover"] a[href^="/app/login/secure/changeaccount.nl"]',
                'div[data-role="contextmenu"][role="dialog"][data-widget="Popover"] a[href^="/app/login/secure/changeaccount.nl"]'
            ]
        },
        redwood: {
            navbarAccount: [
                'div[role="button"][data-header-section="quick-link-menu"][data-automation-id="RoleMenuItem"]',
                'button[data-header-section="quick-link-menu"][data-automation-id="RoleMenuItem"]'
            ],
            accountLinks: [
                'div[data-role="contextmenu"][data-state="floating"][role="dialog"][data-widget="Popover"] a[href^="/app/login/secure/changeaccount.nl"]'
            ]
        }
    };

    chrome.storage.local.get({ [STORAGE_KEY]: false }, (settings) => {
        if (!settings[STORAGE_KEY]) return;
        init();
    });

    function init() {
        const theme = document.body.dataset.header;
        let count = 0;

        const interval = setInterval(() => {
            if (count > MAX_TICKS) {
                clearInterval(interval);
                return;
            }
            count++;
            const el = findElement(theme, 'navbarAccount');
            if (el && !el.dataset.nsftDiscreetInit) {
                el.dataset.nsftDiscreetInit = 'true';
                observeAccountMenu(theme, el);
            }
        }, RETRY_MS);
    }

    function observeAccountMenu(theme, accountEl) {
        const intervals = [];
        const accountNumbers = buildAccountNumbers();
        if (!accountNumbers.length) return;

        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (mutation.type !== 'attributes') return;
                if (intervals.length) return;

                intervals.push(setInterval(() => {
                    const accountLinks = findAllElements(theme, 'accountLinks');
                    if (!accountLinks?.length) return;

                    for (const link of accountLinks) {
                        const optionAccountNumber = link.href.split('company=')[1];
                        if (!accountNumbers.includes(optionAccountNumber)) {
                            link.style.display = 'none';
                        }
                    }

                    intervals.forEach(i => clearInterval(i));
                    intervals.length = 0;
                }, PROBE_MS));
            });
        });

        observer.observe(accountEl, { attributes: true });
    }

    function buildAccountNumbers() {
        let accountNumber = location?.href?.replace('https://', '')?.split('.')?.[0];
        if (!accountNumber) return [];
        if (accountNumber.includes('-')) accountNumber = accountNumber.split('-')[0];

        const numbers = [accountNumber, `${accountNumber}_RP`, `${accountNumber}_SB`];
        for (let i = 1; i < 11; i++) {
            numbers.push(`${accountNumber}_SB${i}`);
            numbers.push(`${accountNumber}_RP${i}`);
        }
        return numbers;
    }

    function findElement(theme, key) {
        const candidates = SELECTORS[theme]?.[key];
        if (!candidates) return null;
        for (const selector of candidates) {
            const el = document.querySelector(selector);
            if (el) return el;
        }
        return null;
    }

    function findAllElements(theme, key) {
        const candidates = SELECTORS[theme]?.[key];
        if (!candidates) return null;
        for (const selector of candidates) {
            const els = document.querySelectorAll(selector);
            if (els.length) return els;
        }
        return null;
    }
})();
