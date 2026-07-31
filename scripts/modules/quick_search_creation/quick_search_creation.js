(function () {
    'use strict';

    const STORAGE_KEY = 'enableQuickSearchCreation';
    const QUICK_LINKS_KEY = 'quickSearchCreationLinks';
    const RECENT_KEY = 'nsftQscRecent';
    const TIMEOUT_KEY = 'quickSearchCreationTimeoutMs';
    const DISCREET_KEY = 'enableDiscreetMode';
    const NSFT_THEME_KEY = 'nsftTheme';
    const DEFAULT_QUICK_LINKS = ['Customer', 'Item', 'Time', 'Transaction'];
    const RECENT_STORE_MAX = 12;
    const RECENT_SHOW_MAX = 3;

    const DEFAULT_TIMEOUT_MS = 12000;
    const TIMEOUT_MIN = 2000;
    const TIMEOUT_MAX = 60000;
    const OBSERVER_THROTTLE_MS = 250;

    const IDS = {
        PANEL: 'nsft-qsc-panel',
        LINKS: 'nsft-quick-search-links',
        RECENTS: 'nsft-qsc-recents',
        RECENTS_SECTION: 'nsft-qsc-recents-section',
        FIND: 'nsft-find-search',
        SUGGESTIONS: 'nsft-qsc-suggestions',
        CLEAR: 'nsft-qsc-clear'
    };

    const CLASSES = {
        STAR: 'nsft-quick-search-star',
        LINK: 'nsft-quick-search-link',
        RECENT: 'nsft-qsc-recent'
    };

    const CLOCK_SVG = '<svg class="nsft-qsc-icon" focusable="false" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"></circle><polyline points="12 7 12 12 15.5 14"></polyline></svg>';

    const STAR_FULL_SVG = '<svg class="nsft-qsc-icon" focusable="false" aria-hidden="true" viewBox="0 0 24 24"><path d="M12 17.27 18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/></svg>';
    const STAR_EMPTY_SVG = '<svg class="nsft-qsc-icon" focusable="false" aria-hidden="true" viewBox="0 0 24 24"><path d="m22 9.24-7.19-.62L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21 12 17.27 18.18 21l-1.63-7.03L22 9.24zM12 15.4l-3.76 2.27 1-4.28-3.32-2.88 4.38-.38L12 6.1l1.71 4.04 4.38.38-3.32 2.88 1 4.28L12 15.4z"/></svg>';

    const TAB_SELECTORS = [
        '#__tab a',
        'table#__tab a',
        'div#__tab a',
        '.uir-tab-list a'
    ];

    let quickLinks = null;
    let enabled = false;
    let discreet = false;
    let timeoutMs = DEFAULT_TIMEOUT_MS;
    let unsubscribeObserver = null;
    let observerTimeoutHandle = null;
    let storageAttached = false;
    let searchTypes = {};
    let dragName = null;
    let recents = [];
    let _theme = 'light';

    chrome.storage.local.get(
        {
            [STORAGE_KEY]: true,
            [DISCREET_KEY]: false,
            [QUICK_LINKS_KEY]: null,
            [RECENT_KEY]: null,
            [TIMEOUT_KEY]: DEFAULT_TIMEOUT_MS,
            [NSFT_THEME_KEY]: 'light'
        },
        (settings) => {
            enabled = settings[STORAGE_KEY] !== false;
            discreet = !!settings[DISCREET_KEY];
            timeoutMs = clampTimeout(settings[TIMEOUT_KEY]);
            _theme = settings[NSFT_THEME_KEY] || 'light';
            quickLinks = (Array.isArray(settings[QUICK_LINKS_KEY]) && settings[QUICK_LINKS_KEY].length)
                ? settings[QUICK_LINKS_KEY].slice()
                : [...DEFAULT_QUICK_LINKS];
            recents = Array.isArray(settings[RECENT_KEY]) ? settings[RECENT_KEY].slice() : [];

            attachStorageListener();
            evaluate();
        }
    );

    function clampTimeout(v) {
        const n = Number(v);
        if (!Number.isFinite(n)) return DEFAULT_TIMEOUT_MS;
        return Math.min(TIMEOUT_MAX, Math.max(TIMEOUT_MIN, Math.round(n)));
    }

    function resolveTheme() {
        return _theme === 'dark' ? 'dark' : 'light';
    }

    function evaluate() {
        const shouldShow = enabled && !discreet && isInitialCreationScreen();
        if (shouldShow) {
            if (!document.getElementById(IDS.PANEL)) waitForTabs();
        } else {
            teardown();
        }
    }

    function attachStorageListener() {
        if (storageAttached) return;
        storageAttached = true;
        chrome.storage.onChanged.addListener((changes, area) => {
            if (area !== 'local') return;
            let needsEval = false;

            if (changes[STORAGE_KEY]) {
                enabled = changes[STORAGE_KEY].newValue !== false;
                needsEval = true;
            }
            if (changes[DISCREET_KEY]) {
                discreet = !!changes[DISCREET_KEY].newValue;
                needsEval = true;
            }
            if (changes[TIMEOUT_KEY]) {
                timeoutMs = clampTimeout(changes[TIMEOUT_KEY].newValue);
            }
            if (changes[NSFT_THEME_KEY]) {
                _theme = changes[NSFT_THEME_KEY].newValue || 'light';
                const panel = document.getElementById(IDS.PANEL);
                if (panel) panel.setAttribute('data-theme', resolveTheme());
            }
            if (changes[QUICK_LINKS_KEY]) {
                const v = changes[QUICK_LINKS_KEY].newValue;
                const next = Array.isArray(v) ? v : [...DEFAULT_QUICK_LINKS];
                if (JSON.stringify(next) !== JSON.stringify(quickLinks)) {
                    quickLinks = next.slice();
                    if (document.getElementById(IDS.PANEL)) {
                        teardown();
                        needsEval = true;
                    }
                }
            }
            if (changes[RECENT_KEY]) {
                const v = changes[RECENT_KEY].newValue;
                recents = Array.isArray(v) ? v.slice() : [];
                renderRecents();
            }

            if (needsEval) evaluate();
        });
    }

    function isInitialCreationScreen() {
        try {
            const p = new URLSearchParams(window.location.search);
            if (p.has('searchtype')) return false;
            if (p.has('rectype')) return false;
            if (p.has('id')) return false;
            if (p.has('searchid')) return false;
            if ((p.get('e') || '').toUpperCase() === 'T') return false;
            return true;
        } catch (e) {
            return true;
        }
    }

    function waitForTabs() {
        if (tryInit()) return;

        if (window.NSFT_Observer && typeof window.NSFT_Observer.subscribe === 'function') {
            unsubscribeObserver = window.NSFT_Observer.subscribe(() => {
                if (tryInit()) stopObserver();
            }, { throttle: OBSERVER_THROTTLE_MS });
            observerTimeoutHandle = setTimeout(stopObserver, timeoutMs);
            return;
        }

        const observer = new MutationObserver(() => {
            if (tryInit()) stopObserver();
        });
        observer.observe(document.documentElement, { childList: true, subtree: true });
        unsubscribeObserver = () => observer.disconnect();

        observerTimeoutHandle = setTimeout(stopObserver, timeoutMs);
    }

    function stopObserver() {
        if (unsubscribeObserver) {
            try { unsubscribeObserver(); } catch (e) { }
            unsubscribeObserver = null;
        }
        if (observerTimeoutHandle) {
            clearTimeout(observerTimeoutHandle);
            observerTimeoutHandle = null;
        }
    }

    function tryInit() {
        if (document.getElementById(IDS.PANEL)) return true;
        const tabs = findTabs();
        if (!tabs?.length) return false;

        const tabsAnchor = findTabsAnchor(tabs[0]);
        if (!tabsAnchor) return false;

        init(tabs, tabsAnchor);
        return true;
    }

    function findTabsAnchor(tab) {
        const idParent = tab.closest('#__tab');
        if (idParent) return idParent;
        return tab.closest('table, .uir-tab-list, div[id*="tab"]');
    }

    function findTabs() {
        if (window.NSFT_DOM && typeof window.NSFT_DOM.qAll === 'function') {
            const nodes = window.NSFT_DOM.qAll(TAB_SELECTORS, { module: 'quick_search_creation', purpose: 'record-type-tabs' });
            return (nodes && nodes.length) ? nodes : null;
        }
        return findElements(TAB_SELECTORS);
    }

    function findElements(selectors) {
        for (const sel of selectors) {
            const els = document.querySelectorAll(sel);
            if (els.length) return els;
        }
        return null;
    }

    function init(els, tabsAnchor) {

        searchTypes = {};
        let quickLinksHtml = '';
        const starTitle = chrome.i18n.getMessage('qscToggleLink') || 'Toggle Quick Links';

        for (const el of els) {
            const name = el.innerText;
            searchTypes[name] = el;
            el.addEventListener('mousedown', () => recordUse(name));

            const isSelected = quickLinks.includes(name);
            const svg = isSelected ? STAR_FULL_SVG : STAR_EMPTY_SVG;
            el.insertAdjacentHTML(
                'afterend',
                `<div class="${CLASSES.STAR}" data-name="${escapeAttr(name)}" data-star-selected="${isSelected}" title="${starTitle}"> &nbsp;${svg}</div>`
            );

            if (isSelected) quickLinksHtml += renderTile(name, el.href);
        }

        const placeholder = chrome.i18n.getMessage('qscRecordType') || 'Buscar tipo de registro…';
        const favoritesLabel = chrome.i18n.getMessage('qscFavorites') || 'Accesos rápidos';
        const recentLabel = chrome.i18n.getMessage('qscRecent') || 'Recientes';
        const emptyHint = chrome.i18n.getMessage('qscEmptyHint') || 'Marca con ★ los tipos que uses más para que aparezcan aquí.';

        const html = `
            <div id="${IDS.PANEL}">
                <div class="nsft-qsc-combo">
                    <svg class="nsft-qsc-search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
                    <input type="text" id="${IDS.FIND}" name="${IDS.FIND}" placeholder="${placeholder}" autocomplete="off" spellcheck="false" role="combobox" aria-autocomplete="list" aria-expanded="false">
                    <button type="button" id="${IDS.CLEAR}" class="nsft-qsc-clear" tabindex="-1" aria-label="Clear">✕</button>
                    <div id="${IDS.SUGGESTIONS}" class="nsft-qsc-suggestions" role="listbox" hidden></div>
                </div>
                <div id="${IDS.RECENTS_SECTION}" class="nsft-qsc-tiles-section nsft-qsc-recents-wrap" hidden>
                    <div class="nsft-qsc-section-title">${CLOCK_SVG}<span>${recentLabel}</span></div>
                    <div id="${IDS.RECENTS}"></div>
                </div>
                <div class="nsft-qsc-tiles-section">
                    <div class="nsft-qsc-section-title">${STAR_FULL_SVG}<span>${favoritesLabel}</span></div>
                    <div id="${IDS.LINKS}">${quickLinksHtml}</div>
                    <div class="nsft-qsc-empty-hint">${emptyHint}</div>
                </div>
            </div>`;

        tabsAnchor.insertAdjacentHTML('beforebegin', html);

        const panelRoot = document.getElementById(IDS.PANEL);
        if (panelRoot) panelRoot.setAttribute('data-theme', resolveTheme());

        document.querySelectorAll(`.${CLASSES.STAR}`).forEach((starEl) => {
            starEl.addEventListener('click', toggleQuickLink);
        });

        wireFavorites();
        wireRecents();
        renderRecents();
        wireCombobox(searchTypes);
    }


    function recordUse(name) {
        if (!name) return;
        const next = [name, ...recents.filter((n) => n !== name)].slice(0, RECENT_STORE_MAX);
        if (JSON.stringify(next) === JSON.stringify(recents)) return;
        recents = next;
        try { chrome.storage.local.set({ [RECENT_KEY]: recents }); } catch (e) { }
        renderRecents();
    }

    function renderRecents() {
        const section = document.getElementById(IDS.RECENTS_SECTION);
        const container = document.getElementById(IDS.RECENTS);
        if (!section || !container) return;

        const show = recents
            .filter((n) => searchTypes[n] && !quickLinks.includes(n))
            .slice(0, RECENT_SHOW_MAX);

        if (!show.length) {
            section.hidden = true;
            container.innerHTML = '';
            return;
        }
        container.innerHTML = show.map((name) => renderRecentTile(name, searchTypes[name].href)).join('');
        section.hidden = false;
    }

    function renderRecentTile(name, url) {
        const pin = addFavTitle();
        return `<a href="${url}" class="${CLASSES.RECENT}" data-recent-name="${escapeAttr(name)}" title="${escapeAttr(name)}">`
            + `<span class="nsft-qsc-link-label">${escapeHtml(name)}</span>`
            + `<span class="nsft-qsc-recent-pin" data-name="${escapeAttr(name)}" role="button" tabindex="-1" aria-label="${pin}" title="${pin}">${STAR_EMPTY_SVG}</span>`
            + `</a>`;
    }

    function wireRecents() {
        const container = document.getElementById(IDS.RECENTS);
        if (!container || container.dataset.qscWired === '1') return;
        container.dataset.qscWired = '1';
        container.addEventListener('click', (e) => {
            const pin = e.target.closest('.nsft-qsc-recent-pin');
            if (pin) {
                e.preventDefault();
                e.stopPropagation();
                setFavorite(pin.dataset.name, true);
                return;
            }
            const tile = e.target.closest(`.${CLASSES.RECENT}`);
            if (tile) recordUse(tile.dataset.recentName);
        });
    }

    function wireFavorites() {
        const container = document.getElementById(IDS.LINKS);
        if (!container || container.dataset.qscWired === '1') return;
        container.dataset.qscWired = '1';

        container.addEventListener('click', (e) => {
            const rm = e.target.closest('.nsft-qsc-link-remove');
            if (rm) {
                e.preventDefault();
                e.stopPropagation();
                setFavorite(rm.dataset.name, false);
                return;
            }
            const tile = e.target.closest(`.${CLASSES.LINK}`);
            if (tile) recordUse(tile.dataset.quickLinkName);
        });

        container.addEventListener('dragstart', (e) => {
            const tile = e.target.closest(`.${CLASSES.LINK}`);
            if (!tile) return;
            dragName = tile.dataset.quickLinkName;
            tile.classList.add('nsft-qsc-dragging');
            if (e.dataTransfer) {
                e.dataTransfer.effectAllowed = 'move';
                try { e.dataTransfer.setData('text/plain', dragName); } catch (err) { }
            }
        });

        container.addEventListener('dragover', (e) => {
            if (dragName == null) return;
            e.preventDefault();
            if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
            const dragging = container.querySelector('.nsft-qsc-dragging');
            if (!dragging) return;
            const after = getDragAfterElement(container, e.clientX, e.clientY);
            if (after == null) container.appendChild(dragging);
            else container.insertBefore(dragging, after);
        });

        container.addEventListener('drop', (e) => {
            e.preventDefault();
            commitOrderFromDom();
        });

        container.addEventListener('dragend', () => {
            const dragging = container.querySelector('.nsft-qsc-dragging');
            if (dragging) dragging.classList.remove('nsft-qsc-dragging');
            dragName = null;
            commitOrderFromDom();
        });
    }

    function getDragAfterElement(container, x, y) {
        const tiles = [...container.querySelectorAll(`.${CLASSES.LINK}:not(.nsft-qsc-dragging)`)];
        let closest = { dist: Infinity, el: null };
        for (const tile of tiles) {
            const box = tile.getBoundingClientRect();
            const cx = box.left + box.width / 2;
            const cy = box.top + box.height / 2;
            if (x <= cx || y < box.top) {
                const dist = Math.hypot(cx - x, cy - y);
                if (dist < closest.dist) closest = { dist, el: tile };
            }
        }
        return closest.el;
    }

    function commitOrderFromDom() {
        const container = document.getElementById(IDS.LINKS);
        if (!container) return;
        const order = [...container.querySelectorAll(`.${CLASSES.LINK}`)].map((t) => t.dataset.quickLinkName);
        const seen = new Set(order);
        const next = [...order, ...quickLinks.filter((n) => !seen.has(n))];
        if (JSON.stringify(next) === JSON.stringify(quickLinks)) return;
        quickLinks = next;
        persistQuickLinks();
    }

    function wireCombobox(searchTypes) {
        const combo = document.querySelector('.nsft-qsc-combo');
        const input = document.getElementById(IDS.FIND);
        const list = document.getElementById(IDS.SUGGESTIONS);
        const clearBtn = document.getElementById(IDS.CLEAR);
        const names = Object.keys(searchTypes);
        let focusedIdx = -1;

        const openList = () => {
            list.hidden = false;
            input.setAttribute('aria-expanded', 'true');
        };
        const closeList = () => {
            list.hidden = true;
            focusedIdx = -1;
            input.setAttribute('aria-expanded', 'false');
        };

        const render = (query) => {
            if (!query) { closeList(); list.innerHTML = ''; return; }
            const q = normalize(query);
            if (!q) { closeList(); list.innerHTML = ''; return; }

            const exact = [];
            const starts = [];
            const contains = [];
            for (const n of names) {
                const nn = normalize(n);
                if (nn === q) exact.push(n);
                else if (nn.startsWith(q)) starts.push(n);
                else if (nn.includes(q)) contains.push(n);
            }
            const matches = [...exact, ...starts, ...contains].slice(0, 80);
            if (!matches.length) {
                const emptyMsg = chrome.i18n.getMessage('qscNoMatches') || 'Sin coincidencias';
                list.innerHTML = `<div class="nsft-qsc-empty-row">${emptyMsg}</div>`;
                openList();
                return;
            }
            list.innerHTML = matches.map((name, i) => {
                const fav = quickLinks.includes(name);
                const t = fav ? removeFavTitle() : addFavTitle();
                return `<div class="nsft-qsc-suggestion" role="option" data-idx="${i}" data-name="${escapeAttr(name)}">`
                    + `<span class="nsft-qsc-suggestion-label">${highlightMatch(name, q)}</span>`
                    + `<button type="button" class="nsft-qsc-suggestion-star" data-name="${escapeAttr(name)}" data-fav="${fav}" title="${t}" aria-label="${t}" tabindex="-1">${fav ? STAR_FULL_SVG : STAR_EMPTY_SVG}</button>`
                    + `</div>`;
            }).join('');
            focusedIdx = -1;
            openList();
        };

        const selectByName = (name) => {
            const anchor = searchTypes[name];
            if (!anchor) return;
            input.value = name;
            combo.classList.add('has-value');
            closeList();
            recordUse(name);
            anchor.click();
        };

        input.addEventListener('input', () => {
            combo.classList.toggle('has-value', input.value.length > 0);
            render(input.value);
        });

        input.addEventListener('keydown', (e) => {
            if (list.hidden) return;
            const items = list.querySelectorAll('.nsft-qsc-suggestion');
            if (!items.length) return;

            if (e.key === 'ArrowDown') {
                e.preventDefault();
                focusedIdx = (focusedIdx + 1) % items.length;
                applyFocus(items, focusedIdx);
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                focusedIdx = (focusedIdx - 1 + items.length) % items.length;
                applyFocus(items, focusedIdx);
            } else if (e.key === 'Enter') {
                e.preventDefault();
                const target = focusedIdx >= 0 ? items[focusedIdx] : items[0];
                selectByName(target.dataset.name);
            } else if (e.key === 'Escape') {
                closeList();
            }
        });

        input.addEventListener('focus', () => {
            if (input.value) render(input.value);
        });

        input.addEventListener('blur', () => {
            setTimeout(closeList, 150);
        });

        list.addEventListener('mousedown', (e) => {
            const starBtn = e.target.closest('.nsft-qsc-suggestion-star');
            if (starBtn) {
                e.preventDefault();
                e.stopPropagation();
                setFavorite(starBtn.dataset.name, starBtn.dataset.fav !== 'true');
                return;
            }
            const item = e.target.closest('.nsft-qsc-suggestion');
            if (!item) return;
            e.preventDefault();
            selectByName(item.dataset.name);
        });

        clearBtn.addEventListener('click', () => {
            input.value = '';
            combo.classList.remove('has-value');
            closeList();
            input.focus();
        });
    }

    function applyFocus(items, idx) {
        items.forEach(it => it.classList.remove('is-focused'));
        const target = items[idx];
        if (target) {
            target.classList.add('is-focused');
            target.scrollIntoView({ block: 'nearest' });
        }
    }

    function highlightMatch(name, query) {
        const i = normalize(name).indexOf(query);
        if (i < 0) return escapeHtml(name);
        return `${escapeHtml(name.slice(0, i))}<mark>${escapeHtml(name.slice(i, i + query.length))}</mark>${escapeHtml(name.slice(i + query.length))}`;
    }

    function normalize(s) {
        return String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    }

    function escapeHtml(s) {
        return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    }

    function escapeAttr(s) {
        return escapeHtml(s);
    }

    function renderTile(name, url) {
        const rm = removeFavTitle();
        return `<a href="${url}" class="${CLASSES.LINK}" data-quick-link-name="${escapeAttr(name)}" title="${escapeAttr(name)}" draggable="true">`
            + `<span class="nsft-qsc-link-pin">${STAR_FULL_SVG}</span>`
            + `<span class="nsft-qsc-link-label">${escapeHtml(name)}</span>`
            + `<span class="nsft-qsc-link-remove" data-name="${escapeAttr(name)}" role="button" tabindex="-1" aria-label="${rm}" title="${rm}">✕</span>`
            + `</a>`;
    }

    function toggleQuickLink(evt) {
        const star = evt.target.closest(`.${CLASSES.STAR}`);
        if (!star) return;
        setFavorite(star.dataset.name, star.dataset.starSelected !== 'true');
    }

    function setFavorite(name, makeFav) {
        if (!name) return;
        const idx = quickLinks.indexOf(name);
        if (makeFav && idx === -1) quickLinks.push(name);
        else if (!makeFav && idx !== -1) quickLinks.splice(idx, 1);
        else return;

        const svg = makeFav ? STAR_FULL_SVG : STAR_EMPTY_SVG;

        const nativeStar = byDataName(`.${CLASSES.STAR}`, name);
        if (nativeStar) {
            nativeStar.dataset.starSelected = makeFav ? 'true' : 'false';
            nativeStar.innerHTML = svg;
        }

        const sugStar = byDataName('.nsft-qsc-suggestion-star', name);
        if (sugStar) {
            sugStar.dataset.fav = makeFav ? 'true' : 'false';
            const t = makeFav ? removeFavTitle() : addFavTitle();
            sugStar.title = t;
            sugStar.setAttribute('aria-label', t);
            sugStar.innerHTML = svg;
        }

        const linksContainer = document.getElementById(IDS.LINKS);
        if (linksContainer) {
            const existing = byDataName(`.${CLASSES.LINK}`, name, 'quickLinkName');
            if (makeFav && !existing) {
                const url = searchTypes[name] ? searchTypes[name].href : '#';
                linksContainer.insertAdjacentHTML('beforeend', renderTile(name, url));
            } else if (!makeFav && existing) {
                existing.remove();
            }
        }

        persistQuickLinks();
        renderRecents();
    }

    function byDataName(selector, value, prop) {
        const key = prop || 'name';
        return Array.from(document.querySelectorAll(selector)).find((el) => el.dataset[key] === value) || null;
    }

    function addFavTitle() { return chrome.i18n.getMessage('qscAddFav') || 'Agregar a accesos rápidos'; }
    function removeFavTitle() { return chrome.i18n.getMessage('qscRemoveFav') || 'Quitar de accesos rápidos'; }

    function persistQuickLinks() {
        chrome.storage.local.set({ [QUICK_LINKS_KEY]: quickLinks });
        try {
            chrome.storage.sync.set({ [QUICK_LINKS_KEY]: quickLinks });
        } catch (e) { }
    }

    function teardown() {
        stopObserver();
        const panel = document.getElementById(IDS.PANEL);
        if (panel) panel.remove();
        document.querySelectorAll(`.${CLASSES.STAR}`).forEach((el) => el.remove());
    }
})();
