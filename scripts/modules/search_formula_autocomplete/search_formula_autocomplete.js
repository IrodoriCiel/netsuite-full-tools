(function () {
    'use strict';

    const STORAGE_KEY = 'enableSearchFormulaAutocomplete';
    const DEBOUNCE_MS = 500;
    const DEFAULT_LIMIT = 200;
    const FETCH_CONCURRENCY = 5;
    const CACHE_KEY = 'nsftSfaJoinCache';
    const CACHE_TTL_MS = 60 * 60 * 1000;
    const CACHE_MAX_ENTRIES = 12;

    const IDS = {
        SETTINGS: 'nsft-formula-autocomplete-settings',
        SEARCH: 'nsft-autocomplete-search',
        CRITERIA: 'nsft-autocomplete-criteria',
        LIMIT: 'nsft-autocomplete-limit',
        RETRY: 'nsft-autocomplete-retry'
    };

    const CLASSES = {
        CONTAINER: 'nsft-search-autocomplete-container',
        SPINNER: 'nsft-search-autocomplete-spinner',
        HIDE: 'nsft-hide',
        SHOW: 'nsft-show',
        SELECTED: 'nsft-selected',
        NAME: 'nsft-formula-name',
        ID: 'nsft-formula-id'
    };

    const state = {
        built: false,
        formulaInput: null,
        formulaListeners: [],
        autocompleteEvent: null,
        typingTimer: null,
        searchType: null
    };

    function shouldRun(settings) {
        return !!settings[STORAGE_KEY] && !settings.enableDiscreetMode;
    }

    chrome.storage.local.get({ [STORAGE_KEY]: true, enableDiscreetMode: false }, (settings) => {
        if (shouldRun(settings)) start();
    });

    chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== 'local' || (!changes[STORAGE_KEY] && !changes.enableDiscreetMode)) return;
        chrome.storage.local.get({ [STORAGE_KEY]: true, enableDiscreetMode: false }, (settings) => {
            if (shouldRun(settings)) start();
            else stop();
        });
    });

    function start() {
        if (state.built) return;

        const selectEl = document.querySelector('.ns-dropdown[data-name="field"]');
        if (!selectEl) return;

        let options = parseOptions(selectEl.dataset.options);
        if (!options) return;

        const searchType = new URLSearchParams(window.location.search).get('searchtype');
        if (!searchType) return;
        state.searchType = searchType;

        const joins = options.filter(o => o.value[0] === '_').map(o => o.value.split('_')[1]);
        const baseOptions = options
            .filter(o => o.value[0] !== '_')
            .sort(sortOptions)
            .map(o => normalizeBaseOption(o));

        const formulaFieldEl = document.getElementById('formula');
        if (!formulaFieldEl) return;
        state.built = true;
        state.formulaInput = formulaFieldEl;

        loadJoinOptions(joins, searchType, baseOptions, formulaFieldEl);
    }

    function loadJoinOptions(joins, searchType, baseOptions, formulaFieldEl) {
        const formulaFieldRow = formulaFieldEl.closest('tr');
        const loadingText = chrome.i18n.getMessage('sfaLoading') || 'Loading Formula Autocomplete Options...';
        if (formulaFieldRow && !document.getElementById(IDS.SETTINGS)) {
            formulaFieldRow.insertAdjacentHTML(
                'beforebegin',
                `<tr id="${IDS.SETTINGS}"><td>${escapeHtml(loadingText)}</td></tr>`
            );
        }

        if (!joins.length) {
            buildAutocomplete([], baseOptions, formulaFieldEl);
            return;
        }

        getCachedJoins(searchType).then((cached) => {
            if (cached) {
                buildAutocomplete(cached, baseOptions, formulaFieldEl);
                return;
            }
            mapWithLimit(joins, FETCH_CONCURRENCY, (j) =>
                fetch(`/app/common/search/search.nl?formulajoin=${encodeURIComponent(j)}&searchtype=${encodeURIComponent(searchType)}`)
                    .then(r => r.text())
                    .then(parseJoinHtml)
            )
                .then((perJoin) => {
                    const allJoinOptions = perJoin.flat();
                    setCachedJoins(searchType, allJoinOptions);
                    buildAutocomplete(allJoinOptions, baseOptions, formulaFieldEl);
                })
                .catch(() => showLoadError(joins, searchType, baseOptions, formulaFieldEl));
        });
    }

    function showLoadError(joins, searchType, baseOptions, formulaFieldEl) {
        const errorText = chrome.i18n.getMessage('sfaLoadError') || 'Could not load autocomplete options.';
        const retryText = chrome.i18n.getMessage('sfaRetry') || 'Retry';
        const el = document.getElementById(IDS.SETTINGS);
        if (el) {
            el.innerHTML = `<td>${escapeHtml(errorText)} <a href="#" id="${IDS.RETRY}">${escapeHtml(retryText)}</a></td>`;
            const retry = document.getElementById(IDS.RETRY);
            if (retry) {
                retry.addEventListener('click', (e) => {
                    e.preventDefault();
                    el.innerHTML = `<td>${escapeHtml(chrome.i18n.getMessage('sfaLoading') || 'Loading...')}</td>`;
                    loadJoinOptions(joins, searchType, baseOptions, formulaFieldEl);
                }, { once: true });
            }
        }
        if (window.NSFT_Clipboard) NSFT_Clipboard.showToast(errorText, { type: 'error' });
    }

    function parseOptions(str) {
        if (!str) return null;
        try { return JSON.parse(str); } catch (e) { return null; }
    }

    function sortOptions(a, b) {
        if (a.text < b.text) return -1;
        if (a.text > b.text) return 1;
        return 0;
    }

    function normalizeBaseOption(o) {
        return {
            id: o.value,
            displayHtml: escapeHtml(o.text || ''),
            idHtml: escapeHtml(o.value || ''),
            searchText: o.text || '',
            text: o.text
        };
    }

    function parseJoinHtml(html) {
        const dom = new DOMParser().parseFromString(html, 'text/html');
        const selectEl = dom.querySelector('.ns-dropdown[data-name="field"]');
        if (!selectEl) return [];

        const joinOptions = parseOptions(selectEl.dataset.options);
        if (!joinOptions) return [];

        const joinLabel = dom.getElementById('joinlabel')?.value || '';
        const safeLabel = escapeHtml(joinLabel);
        const out = [];
        for (const option of joinOptions) {
            if (!option.value) continue;
            const rawText = option.text || '';
            const split = option.value.split('.');
            out.push({
                id: option.value,
                displayHtml: `<b>${safeLabel}:</b> ${escapeHtml(rawText)}`,
                idHtml: `<b>${escapeHtml(split[0])}.</b>${escapeHtml(split[1] || '')}`,
                searchText: `${joinLabel ? `${joinLabel}: ${rawText}` : rawText} ${rawText}`,
                text: rawText
            });
        }
        return out;
    }

    function buildAutocomplete(allJoinOptions, baseOptions, formulaInput) {
        const joins = allJoinOptions.slice().sort(sortOptions);
        const entries = baseOptions.concat(joins).filter(o => o.id !== '');

        const optionsHtml = entries.map(o => `
            <li data-formula-id="${escapeAttr(o.id)}" data-formula-text="${escapeAttr(o.searchText)}" title="${escapeAttr(o.id)}">
                <span class="${CLASSES.NAME}">${o.displayHtml}</span>
                <span class="${CLASSES.ID}">${o.idHtml}</span>
            </li>`).join('');

        if (!entries.length) return;

        document.body.insertAdjacentHTML('afterbegin', `
            <div class="${CLASSES.CONTAINER} ${CLASSES.HIDE}" data-nsft-ui data-nsft-autocomplete="name">
                <div class="${CLASSES.SPINNER} ${CLASSES.HIDE}">
                    <div class="nsft-ring"><div></div><div></div><div></div><div></div></div>
                </div>
                <ul>${optionsHtml}</ul>
            </div>`);

        attachListeners(formulaInput);
        renderSettings();
        positionContainer(formulaInput);
    }

    function addTrackedListener(target, type, fn, opts) {
        target.addEventListener(type, fn, opts);
        state.formulaListeners.push({ target, type, fn, opts });
    }

    function attachListeners(formulaInput) {
        addTrackedListener(formulaInput, 'keyup', (e) => {
            const container = document.querySelector(`.${CLASSES.CONTAINER}`);
            if (!container) return;
            if (container.classList.contains(CLASSES.SHOW) && ['ArrowDown', 'ArrowUp', 'Enter'].includes(e.key)) {
                e.preventDefault();
                e.stopPropagation();
                return;
            }
            clearTimeout(state.typingTimer);
            state.autocompleteEvent = e;
            if (container.classList.contains(CLASSES.SHOW)) showLoadingSpinner();
            state.typingTimer = setTimeout(handleAutocomplete, DEBOUNCE_MS);
        });

        addTrackedListener(formulaInput, 'keydown', (e) => {
            if (handleArrowAndEnterKeys(e)) return;
            clearTimeout(state.typingTimer);
        });

        addTrackedListener(formulaInput, 'click', (e) => {
            clearTimeout(state.typingTimer);
            state.autocompleteEvent = e;
            const container = document.querySelector(`.${CLASSES.CONTAINER}`);
            if (container && container.classList.contains(CLASSES.SHOW)) showLoadingSpinner();
            state.typingTimer = setTimeout(handleAutocomplete, DEBOUNCE_MS);
        });

        addTrackedListener(formulaInput, 'blur', () => {
            setTimeout(() => {
                document.querySelector(`.${CLASSES.CONTAINER}`)?.classList.remove(CLASSES.SHOW);
            }, 200);
        });

        document.querySelectorAll(`.${CLASSES.CONTAINER} li`).forEach((li) => {
            li.addEventListener('click', insertFormulaId);
            li.addEventListener('mouseover', (e) => {
                document.querySelectorAll(`.${CLASSES.CONTAINER} li.${CLASSES.SELECTED}`)
                    .forEach(el => el.classList.remove(CLASSES.SELECTED));
                e.currentTarget.classList.add(CLASSES.SELECTED);
            });
        });
    }

    function stop() {
        if (!state.built) return;
        clearTimeout(state.typingTimer);
        state.formulaListeners.forEach(({ target, type, fn, opts }) => {
            try { target.removeEventListener(type, fn, opts); } catch (e) { }
        });
        state.formulaListeners = [];
        document.querySelector(`.${CLASSES.CONTAINER}`)?.remove();
        document.getElementById(IDS.SETTINGS)?.remove();
        state.built = false;
        state.formulaInput = null;
        state.autocompleteEvent = null;
    }

    function renderSettings() {
        const titleText = chrome.i18n.getMessage('sfaSettingsTitle') || 'Formula Autocomplete Settings';
        const searchLabel = chrome.i18n.getMessage('sfaSearch') || 'Search:';
        const criteriaLabel = chrome.i18n.getMessage('sfaCriteria') || 'Criteria:';
        const limitLabel = chrome.i18n.getMessage('sfaLimit') || 'Option Limit:';
        const optName = chrome.i18n.getMessage('sfaOptName') || 'Name';
        const optId = chrome.i18n.getMessage('sfaOptId') || 'ID';
        const optStartsWith = chrome.i18n.getMessage('sfaOptStartsWith') || 'Starts With';
        const optContains = chrome.i18n.getMessage('sfaOptContains') || 'Contains';

        const el = document.getElementById(IDS.SETTINGS);
        if (!el) return;
        el.innerHTML = `
            <td>
                <div>${escapeHtml(titleText)}</div>
                <span>${escapeHtml(searchLabel)} </span>
                <select id="${IDS.SEARCH}">
                    <option value="name">${escapeHtml(optName)}</option>
                    <option value="id">${escapeHtml(optId)}</option>
                </select>
                <span>${escapeHtml(criteriaLabel)} </span>
                <select id="${IDS.CRITERIA}">
                    <option value="startswith">${escapeHtml(optStartsWith)}</option>
                    <option value="contains">${escapeHtml(optContains)}</option>
                </select>
                <span>${escapeHtml(limitLabel)} </span>
                <input type="number" id="${IDS.LIMIT}" value="${DEFAULT_LIMIT}">
            </td>`;

        document.getElementById(IDS.SEARCH).addEventListener('change', (e) => {
            const container = document.querySelector(`.${CLASSES.CONTAINER}`);
            if (container) container.dataset.nsftAutocomplete = e.target.value;
        });
    }

    function positionContainer(formulaInput) {
        const position = formulaInput.getBoundingClientRect();
        const container = document.querySelector(`.${CLASSES.CONTAINER}`);
        if (!container) return;
        container.style.top = `${position.top}px`;
        container.style.height = `${position.y}px`;
    }

    function handleAutocomplete() {
        hideLoadingSpinner();
        const e = state.autocompleteEvent;
        const val = e?.target?.value;
        if (!val || !val.includes('{')) return;

        let checking = true;
        const cursorPos = e.target.selectionStart - 1;
        let checkingPos = cursorPos;
        let openBracketIndex = -1;

        while (checking && checkingPos >= 0) {
            if (val[checkingPos] === '{') {
                openBracketIndex = checkingPos;
                checking = false;
            } else if (val[checkingPos] === '}') {
                checking = false;
            }
            checkingPos--;
        }

        const container = document.querySelector(`.${CLASSES.CONTAINER}`);
        if (!container) return;
        const items = container.querySelectorAll('ul li');

        if (openBracketIndex === -1) {
            container.classList.remove(CLASSES.SHOW);
            return;
        }
        container.classList.add(CLASSES.SHOW);

        const searchValue = val.substring(openBracketIndex + 1, cursorPos + 1);
        const limit = Number(document.getElementById(IDS.LIMIT).value) || DEFAULT_LIMIT;
        const searchType = document.getElementById(IDS.SEARCH).value;
        const searchProp = searchType === 'name' ? 'formulaText' : 'formulaId';
        const criteria = document.getElementById(IDS.CRITERIA).value;

        const TS = window.NSFT_TextSearch;
        const plegar = TS
            ? (s) => TS.fold(s)
            : (s) => String(s == null ? '' : s).toLowerCase();
        const needle = plegar(searchValue);

        let showCount = 0;
        items.forEach((item) => {
            const haystack = plegar(item.dataset[searchProp]);
            const validResult = criteria === 'startswith' ? haystack.startsWith(needle) : haystack.includes(needle);

            if (!validResult || showCount >= limit) {
                item.classList.add(CLASSES.HIDE);
            } else {
                item.classList.remove(CLASSES.HIDE);
                showCount++;
            }
        });

        container.classList.toggle(CLASSES.SHOW, showCount > 0);
    }

    function handleArrowAndEnterKeys(e) {
        const container = document.querySelector(`.${CLASSES.CONTAINER}.${CLASSES.SHOW}`);
        if (!container || !['ArrowDown', 'ArrowUp', 'Enter'].includes(e.key)) return false;

        e.preventDefault();
        e.stopPropagation();

        const items = container.querySelectorAll('ul li');
        const selected = container.querySelector(`li.${CLASSES.SELECTED}`);

        if (e.key === 'ArrowDown') moveSelection(selected, items, 'next');
        else if (e.key === 'ArrowUp') moveSelection(selected, items, 'prev');
        else if (e.key === 'Enter' && selected) insertFormulaId();

        return true;
    }

    function moveSelection(selected, items, direction) {
        if (selected) {
            const sibling = direction === 'next' ? 'nextElementSibling' : 'previousElementSibling';
            let target = selected[sibling];
            while (target && target.classList.contains(CLASSES.HIDE)) target = target[sibling];
            if (target) {
                selected.classList.remove(CLASSES.SELECTED);
                target.classList.add(CLASSES.SELECTED);
                target.scrollIntoView({ behavior: 'instant', block: 'center', inline: 'center' });
            }
            return;
        }
        for (const item of items) {
            if (!item.classList.contains(CLASSES.HIDE)) {
                item.classList.add(CLASSES.SELECTED);
                break;
            }
        }
    }

    function insertFormulaId() {
        const el = document.querySelector(`li.${CLASSES.SELECTED}`);
        if (!el) return;
        el.classList.remove(CLASSES.SELECTED);
        const formulaId = el.dataset.formulaId;

        const formulaInput = document.getElementById('formula');
        if (!formulaInput) return;
        const val = formulaInput.value;
        const cursorPos = formulaInput.selectionStart;

        let checking = true;
        let checkingPos = cursorPos - 1;
        let openBracketIndex = -1;
        while (checking && checkingPos >= 0) {
            if (val[checkingPos] === '{') {
                openBracketIndex = checkingPos;
                checking = false;
            } else if (val[checkingPos] === '}') {
                checking = false;
            }
            checkingPos--;
        }

        const startVal = val.substring(0, openBracketIndex + 1);
        const endVal = val.substring(cursorPos);
        let newVal = startVal + formulaId;
        if (endVal[0] !== '}') newVal += '}';
        newVal += endVal;
        formulaInput.value = newVal;

        document.querySelector(`.${CLASSES.CONTAINER}`)?.classList.remove(CLASSES.SHOW);
    }

    function showLoadingSpinner() {
        document.querySelector(`.${CLASSES.CONTAINER} li:first-child`)?.scrollIntoView(true);
        document.querySelector(`.${CLASSES.SPINNER}`)?.classList.add(CLASSES.SHOW);
    }

    function hideLoadingSpinner() {
        document.querySelector(`.${CLASSES.SPINNER}`)?.classList.remove(CLASSES.SHOW);
    }

    function mapWithLimit(items, limit, fn) {
        return new Promise((resolve, reject) => {
            const results = new Array(items.length);
            let idx = 0;
            let done = 0;
            let failed = false;
            if (!items.length) return resolve(results);

            function next() {
                while (!failed && idx < items.length && (idx - done) < limit) {
                    const cur = idx++;
                    Promise.resolve(fn(items[cur], cur)).then((res) => {
                        results[cur] = res;
                        done++;
                        if (done === items.length) resolve(results);
                        else next();
                    }).catch((err) => {
                        if (!failed) { failed = true; reject(err); }
                    });
                }
            }
            next();
        });
    }

    function getCachedJoins(searchType) {
        return new Promise((resolve) => {
            try {
                chrome.storage.local.get({ [CACHE_KEY]: {} }, (items) => {
                    const cache = items[CACHE_KEY] || {};
                    const entry = cache[searchType];
                    if (entry && Array.isArray(entry.data) && (state.now() - entry.ts) < CACHE_TTL_MS) {
                        resolve(entry.data);
                    } else {
                        resolve(null);
                    }
                });
            } catch (e) { resolve(null); }
        });
    }

    function setCachedJoins(searchType, data) {
        try {
            chrome.storage.local.get({ [CACHE_KEY]: {} }, (items) => {
                const cache = items[CACHE_KEY] || {};
                cache[searchType] = { ts: state.now(), data };
                const keys = Object.keys(cache);
                if (keys.length > CACHE_MAX_ENTRIES) {
                    keys.sort((a, b) => (cache[a].ts || 0) - (cache[b].ts || 0));
                    for (let i = 0; i < keys.length - CACHE_MAX_ENTRIES; i++) delete cache[keys[i]];
                }
                chrome.storage.local.set({ [CACHE_KEY]: cache });
            });
        } catch (e) { }
    }

    state.now = () => Date.now();

    function escapeHtml(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        }[c]));
    }

    function escapeAttr(s) {
        return escapeHtml(s);
    }
})();
