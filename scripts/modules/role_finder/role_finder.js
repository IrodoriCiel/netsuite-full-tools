(function () {
    'use strict';

    const STORAGE_KEY = 'enableRoleFinder';
    const MAX_TICKS = 5;
    const RETRY_MS = 1000;
    const PROBE_MS = 100;

    const IDS = {
        SEARCH: 'nsft-role-search',
        DATALIST: 'nsft-roles-list'
    };

    const SELECTORS = {
        refreshed: {
            navbarAccount: [
                'div[role="menuitem"][data-header-section="role-menu"][data-automation-id="RoleMenuItem"]',
                'div[role="button"][data-header-section="role-menu"][data-automation-id="RoleMenuItem"]',
                'button[data-header-section="quick-link-menu"][data-automation-id="RoleMenuItem"]'
            ],
            roleSearchBoxInsertPoint: [
                'div[data-role="popover"][role="dialog"][data-widget="Popover"] div[role="menu"] > div[data-widget="MenuGroup"]:nth-child(3) > div:first-child',
                'div[data-role="contextmenu"][role="dialog"][data-widget="Popover"] div[role="menu"] > div[data-widget="MenuGroup"]:nth-child(3) > div:first-child'
            ],
            roleLinks: [
                'div[data-role="popover"][role="dialog"][data-widget="Popover"] a[href^="/app/login/secure/changerole.nl"]',
                'div[data-role="contextmenu"][role="dialog"][data-widget="Popover"] a[href^="/app/login/secure/changerole.nl"]'
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
            roleSearchBoxInsertPoint: [
                'div[data-role="contextmenu"][data-state="floating"][role="dialog"][data-widget="Popover"] div[role="menu"] div[role="group"]:nth-child(3) > div:first-child'
            ],
            roleLinks: [
                'div[data-role="contextmenu"][data-state="floating"][role="dialog"][data-widget="Popover"] a[href^="/app/login/secure/changerole.nl"]'
            ],
            accountLinks: [
                'div[data-role="contextmenu"][data-state="floating"][role="dialog"][data-widget="Popover"] a[href^="/app/login/secure/changeaccount.nl"]'
            ]
        }
    };

    let _outerInterval = null;
    let _observer = null;
    let _innerIntervals = [];

    function isApplicablePage() {
        try {
            if (window.NSFT_RecordButtons && NSFT_RecordButtons.isHeaderlessPage && NSFT_RecordButtons.isHeaderlessPage()) return false;
        } catch (e) { }
        return true;
    }

    chrome.storage.local.get({ [STORAGE_KEY]: true, enableDiscreetMode: false }, (settings) => {
        if (!settings[STORAGE_KEY] || settings.enableDiscreetMode || !isApplicablePage()) return;
        init();
    });

    chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== 'local' || !changes[STORAGE_KEY]) return;
        if (changes[STORAGE_KEY].newValue) {
            if (!_outerInterval && !_observer) init();
        } else {
            teardown();
        }
    });

    function teardown() {
        if (_outerInterval) { clearInterval(_outerInterval); _outerInterval = null; }
        if (_observer) { _observer.disconnect(); _observer = null; }
        _innerIntervals.forEach(i => clearInterval(i));
        _innerIntervals = [];
        const search = document.getElementById(IDS.SEARCH);
        if (search) { const c = search.closest('.nsft-role-search-container'); (c || search).remove(); }
        document.querySelectorAll('[data-nsft-role-finder-init]').forEach(el => { delete el.dataset.nsftRoleFinderInit; });
    }

    function init() {
        const theme = document.body.dataset.header || 'refreshed';
        if (!SELECTORS[theme]) return;
        let count = 0;

        _outerInterval = setInterval(() => {
            if (count > MAX_TICKS) {
                clearInterval(_outerInterval);
                _outerInterval = null;
                return;
            }
            count++;
            const el = findElement(theme, 'navbarAccount');
            if (el && !el.dataset.nsftRoleFinderInit) {
                el.dataset.nsftRoleFinderInit = 'true';
                observeAccountMenu(theme, el);
            }
        }, RETRY_MS);
    }

    function observeAccountMenu(theme, accountEl) {
        _observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (mutation.type !== 'attributes') return;

                const menuOption = findAllElements(theme, 'roleSearchBoxInsertPoint')?.[0];
                const searchEl = document.getElementById(IDS.SEARCH);

                if (!menuOption) {
                    _innerIntervals.forEach(i => clearInterval(i));
                    _innerIntervals.length = 0;
                    return;
                }
                if (searchEl || _innerIntervals.length) return;

                _innerIntervals.push(setInterval(() => {
                    const roleLinks = findAllElements(theme, 'roleLinks');
                    const accountLinks = findAllElements(theme, 'accountLinks');
                    if ((!roleLinks?.length) && (!accountLinks?.length)) return;

                    const entries = buildRoleEntries(roleLinks, accountLinks);

                    menuOption.parentNode.insertBefore(buildSearchEl(), menuOption);
                    attachSearchHandler(entries);

                    _innerIntervals.forEach(i => clearInterval(i));
                    _innerIntervals.length = 0;
                }, PROBE_MS));
            });
        });

        _observer.observe(accountEl, { attributes: true });
    }

    function buildRoleEntries(roleLinks, accountLinks) {
        const entries = [];
        (roleLinks || []).forEach((link) => {
            const linkText = (link.innerText || '').trim();
            entries.push({ key: linkText.toUpperCase(), linkText, container: link.parentElement, link });
        });
        (accountLinks || []).forEach((link) => {
            const linkText = (link.innerText || '').trim();
            const company = (link.href.split('company=')[1] || '').split('&')[0];
            entries.push({ key: `${linkText.toUpperCase()} - (${company})`, linkText, container: link.parentElement, link });
        });
        return entries;
    }

    function buildSearchEl() {
        const container = document.createElement('div');
        container.className = 'nsft-role-search-container';

        const input = document.createElement('input');
        input.type = 'text';
        input.name = IDS.SEARCH;
        input.id = IDS.SEARCH;
        input.placeholder = chrome.i18n.getMessage('rolefPlaceholder') || 'Search Role...';

        const datalist = document.createElement('datalist');
        datalist.id = IDS.DATALIST;

        container.appendChild(input);
        container.appendChild(datalist);
        return container;
    }

    function attachSearchHandler(entries) {
        const input = document.getElementById(IDS.SEARCH);
        if (!input) return;
        let raf = 0;
        let visible = [];
        let selIdx = -1;

        function fuzzyIndices(text, q) {
            const t = text.toUpperCase();
            const ql = q.toUpperCase();
            const idx = [];
            let j = 0;
            for (let i = 0; i < t.length && j < ql.length; i++) {
                if (t[i] === ql[j]) { idx.push(i); j++; }
            }
            return j === ql.length ? idx : null;
        }

        function clearHighlight(link) {
            const spans = link.querySelectorAll('span.nsft-rf-hl');
            spans.forEach(span => span.replaceWith(document.createTextNode(span.textContent)));
            if (spans.length) link.normalize();
        }

        function applyHighlight(entry, q) {
            clearHighlight(entry.link);
            if (!q) return;
            const walker = document.createTreeWalker(entry.link, NodeFilter.SHOW_TEXT, null);
            const textNodes = [];
            let node;
            while ((node = walker.nextNode())) textNodes.push(node);

            for (const tn of textNodes) {
                const text = tn.nodeValue;
                if (!text || !text.trim()) continue;
                const idx = fuzzyIndices(text, q);
                if (!idx || !idx.length) continue;
                const set = new Set(idx);
                const frag = document.createDocumentFragment();
                let buffer = '';
                for (let i = 0; i < text.length; i++) {
                    if (set.has(i)) {
                        if (buffer) { frag.appendChild(document.createTextNode(buffer)); buffer = ''; }
                        const span = document.createElement('span');
                        span.className = 'nsft-rf-hl';
                        span.textContent = text[i];
                        frag.appendChild(span);
                    } else {
                        buffer += text[i];
                    }
                }
                if (buffer) frag.appendChild(document.createTextNode(buffer));
                tn.parentNode.replaceChild(frag, tn);
            }
        }

        function setSelected(i) {
            selIdx = i;
            entries.forEach(e => e.container && e.container.classList.remove('nsft-rf-sel'));
            const sel = selIdx >= 0 ? visible[selIdx] : null;
            if (sel && sel.container) {
                sel.container.classList.add('nsft-rf-sel');
                if (sel.container.scrollIntoView) sel.container.scrollIntoView({ block: 'nearest' });
            }
        }

        function runFilter() {
            const q = input.value ? input.value.trim() : '';
            visible = [];
            for (const e of entries) {
                const match = !q || fuzzyIndices(e.key, q) !== null;
                if (e.container) e.container.style.display = match ? '' : 'none';
                applyHighlight(e, q);
                if (match) visible.push(e);
            }
            setSelected(visible.length ? 0 : -1);
        }

        input.addEventListener('keyup', (evt) => {
            if (evt.key === 'ArrowDown' || evt.key === 'ArrowUp' || evt.key === 'Enter') return;
            if (raf) cancelAnimationFrame(raf);
            raf = requestAnimationFrame(() => { raf = 0; runFilter(); });
        });

        input.addEventListener('keydown', (evt) => {
            if (evt.key === 'ArrowDown') {
                evt.preventDefault();
                if (visible.length) setSelected((selIdx + 1) % visible.length);
            } else if (evt.key === 'ArrowUp') {
                evt.preventDefault();
                if (visible.length) setSelected((selIdx - 1 + visible.length) % visible.length);
            } else if (evt.key === 'Enter') {
                evt.preventDefault();
                const target = visible[selIdx] || visible[0];
                if (target && target.link) target.link.click();
            }
        });
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
