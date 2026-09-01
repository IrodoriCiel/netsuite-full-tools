(function () {
    'use strict';
    const STORAGE_KEY = 'enableSuiteQLRunner';
    const NSFT_THEME_KEY = 'nsftTheme';
    const SHORTCUT_KEY = 'suiteqlRunnerShortcut';
    const DEFAULT_SHORTCUT = { ctrlKey: false, shiftKey: true, altKey: true, code: 'KeyQ' };
    const TABS_STORAGE_KEY = 'nsftSqlTabs';
    const HISTORY_STORAGE_KEY = 'nsftSqlHistory';
    const SAVED_QUERIES_KEY = 'nsftSavedQueries';
    const VARIABLES_STORAGE_KEY = 'nsftSqlVariables';
    let sqlVariables = [];
    const SNIPPETS_STORAGE_KEY = 'nsftSqlSnippets';
    let HISTORY_MAX = 30;
    let MAX_RECORDS_FETCH = 5000;
    const FETCH_ALL_CEILING = 100000;
    const DEFAULT_QUERY = [
        'SELECT',
        '  TOP 100 *',
        'FROM',
        '  transaction t',
        'ORDER BY',
        '  t.id DESC'
    ].join('\n');

    function _clampInt(v, min, max, fallback) {
        const n = parseInt(v, 10);
        if (!Number.isFinite(n)) return fallback;
        return Math.max(min, Math.min(max, n));
    }

    (function migrateSavedQueriesKey() {
        try {
            const oldRaw = localStorage.getItem('nsft_saved_queries');
            if (oldRaw !== null && localStorage.getItem(SAVED_QUERIES_KEY) === null) {
                localStorage.setItem(SAVED_QUERIES_KEY, oldRaw);
                localStorage.removeItem('nsft_saved_queries');
            }
        } catch (e) { }
    })();
    let lastMaximizedLeft = '2.5vw';
    let lastMaximizedTop = '2.5vh';
    let currentTheme = 'atom-one-light';
    let currentFileName = null;
    let _nsftTheme = 'light';
    let cachedSidebarSide = 'left';
    let cachedViewState = 'both';
    let cachedSidebarOpen = true;
    let cachedSidebarWidth = 0;

    let tabs = [];
    let activeTabId = null;
    let _suppressEditorChange = false;
    let _tabsPersistTimer = null;
    let chartInstance = null;

    function genTabId() {
        return 't_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    }

    function getActiveTab() {
        return tabs.find(t => t.id === activeTabId) || null;
    }

    function makeDefaultTab(i) {
        return {
            id: genTabId(),
            title: (chrome.i18n.getMessage('sql_tab_default_title') || 'Query') + ' ' + (i || (tabs.length + 1)),
            query: DEFAULT_QUERY,
            fileName: null,
            dirty: false,
            renamed: false
        };
    }

    function loadTabsFromStorage(cb) {
        chrome.storage.local.get({ [TABS_STORAGE_KEY]: null }, (items) => {
            const stored = items[TABS_STORAGE_KEY];
            if (stored && Array.isArray(stored.tabs) && stored.tabs.length > 0) {
                tabs = stored.tabs.map(t => ({
                    id: t.id || genTabId(),
                    title: t.title || 'Query',
                    query: typeof t.query === 'string' ? t.query : '',
                    fileName: t.fileName || null,
                    dirty: !!t.dirty,
                    renamed: !!t.renamed
                }));
                activeTabId = stored.activeTabId && tabs.find(t => t.id === stored.activeTabId)
                    ? stored.activeTabId
                    : tabs[0].id;
            } else {
                tabs = [makeDefaultTab(1)];
                activeTabId = tabs[0].id;
            }
            cb && cb();
        });
    }

    function _writeTabsNow() {
        _tabsPersistTimer = null;
        chrome.storage.local.set({
            [TABS_STORAGE_KEY]: {
                tabs: tabs.map(t => ({
                    id: t.id, title: t.title, query: t.query,
                    fileName: t.fileName, dirty: t.dirty, renamed: t.renamed
                })),
                activeTabId
            }
        });
    }

    function persistTabs() {
        if (_tabsPersistTimer) clearTimeout(_tabsPersistTimer);
        _tabsPersistTimer = setTimeout(_writeTabsNow, 1000);
    }

    function flushPersistTabs() {
        if (_tabsPersistTimer) {
            clearTimeout(_tabsPersistTimer);
            _writeTabsNow();
        }
    }

    function captureActiveTabFromEditor() {
        const t = getActiveTab();
        if (t && editor) {
            t.query = editor.getValue();
        }
    }

    function activateTab(id) {
        const t = tabs.find(x => x.id === id);
        if (!t) return;
        captureActiveTabFromEditor();
        activeTabId = id;
        currentFileName = t.fileName;
        if (editor) {
            _suppressEditorChange = true;
            editor.setValue(t.query || '');
            _suppressEditorChange = false;
            editor.refresh();
        }
        renderTabsBar();
        updateTitleState();
        persistTabs();
    }

    function createTab(opts) {
        captureActiveTabFromEditor();
        const t = {
            id: genTabId(),
            title: (opts && opts.title) || ((chrome.i18n.getMessage('sql_tab_default_title') || 'Query') + ' ' + (tabs.length + 1)),
            query: (opts && typeof opts.query === 'string') ? opts.query : DEFAULT_QUERY,
            fileName: (opts && opts.fileName) || null,
            dirty: false,
            renamed: false
        };
        tabs.push(t);
        activateTab(t.id);
        if (editor) {
            editor.focus();
            if (t.query === DEFAULT_QUERY) {
                const ult = editor.lastLine();
                editor.setSelection(
                    { line: ult, ch: editor.getLine(ult).length },
                    { line: 0, ch: 0 }
                );
            }
        }
    }

    function closeTab(id) {
        const idx = tabs.findIndex(t => t.id === id);
        if (idx === -1) return;
        if (_renamingTabId === id) _renamingTabId = null;
        tabs.splice(idx, 1);
        if (tabs.length === 0) {
            tabs = [makeDefaultTab(1)];
            activateTab(tabs[0].id);
        } else if (activeTabId === id) {
            const next = tabs[Math.max(0, idx - 1)] || tabs[0];
            activateTab(next.id);
        } else {
            renderTabsBar();
            persistTabs();
        }
    }

    function setActiveTabFileName(name) {
        const t = getActiveTab();
        if (!t) return;
        t.fileName = name;
        if (!t.renamed) t.title = name || t.title;
        t.dirty = false;
        currentFileName = name;
        renderTabsBar();
        persistTabs();
    }

    function markActiveTabDirty() {
        const t = getActiveTab();
        if (!t) return;
        if (!t.dirty) {
            t.dirty = true;
            renderTabsBar();
        }
        persistTabs();
    }

    let _savedQueriesCache = null;
    function readSavedQueriesSync() {
        if (_savedQueriesCache) return _savedQueriesCache;
        try {
            _savedQueriesCache = JSON.parse(localStorage.getItem(SAVED_QUERIES_KEY) || '{}');
        } catch (e) {
            _savedQueriesCache = {};
        }
        return _savedQueriesCache;
    }
    window.addEventListener('storage', (e) => {
        if (e.key === SAVED_QUERIES_KEY) _savedQueriesCache = null;
    });

    function _tabInnerHtml(t, savedMap) {
        const dot = t.dirty ? '<span class="nsft-sql-tab-dirty" title="Unsaved">●</span>' : '';
        const label = escapeHtml(t.title);
        let starHtml = '';
        if (t.fileName && savedMap[t.fileName]) {
            const isFav = savedMap[t.fileName].favorite === true;
            const starTitle = isFav
                ? (chrome.i18n.getMessage('sql_fav_unstar') || 'Remove from favorites')
                : (chrome.i18n.getMessage('sql_fav_star') || 'Mark as favorite');
            starHtml = `<span class="nsft-sql-tab-fav${isFav ? ' is-on' : ''}" data-tab-fav="${t.id}" title="${escapeHtml(starTitle)}">${isFav ? '★' : '☆'}</span>`;
        }
        const closeTitle = escapeHtml(chrome.i18n.getMessage('sql_tab_close') || 'Close');
        return `${dot}${starHtml}<span class="nsft-sql-tab-label">${label}</span>`
            + `<span class="nsft-sql-tab-close" data-tab-close="${t.id}" title="${closeTitle}">×</span>`;
    }

    let _renamingTabId = null;

    function renameSavedQuery(previo, nuevo) {
        let saved = {};
        try {
            saved = JSON.parse(localStorage.getItem(SAVED_QUERIES_KEY) || '{}');
        } catch (e) {
            saved = {};
        }
        if (!saved[previo]) return 'missing';
        if (Object.prototype.hasOwnProperty.call(saved, nuevo)) return 'taken';

        saved[nuevo] = saved[previo];
        delete saved[previo];
        writeSavedQueries(saved);

        tabs.forEach((t) => {
            if (t.fileName !== previo) return;
            t.fileName = nuevo;
            if (!t.renamed) t.title = nuevo;
        });
        if (currentFileName === previo) currentFileName = nuevo;
        return 'ok';
    }

    function startTabRename(id) {
        if (_renamingTabId) return;
        const tab = tabs.find(t => t.id === id);
        const el = document.querySelector('.nsft-sql-tab[data-tab-id="' + (window.CSS && CSS.escape ? CSS.escape(id) : id) + '"]');
        if (!tab || !el) return;
        const labelEl = el.querySelector('.nsft-sql-tab-label');
        if (!labelEl) return;

        _renamingTabId = id;
        const previo = tab.title;

        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'nsft-sql-tab-rename';
        input.value = previo;
        input.setAttribute('aria-label', chrome.i18n.getMessage('sql_tab_rename') || 'Rename tab');
        labelEl.replaceWith(input);
        input.focus();
        input.select();

        let cerrado = false;
        const cerrar = (guardar) => {
            if (cerrado) return;
            cerrado = true;
            _renamingTabId = null;

            const nuevo = guardar ? input.value.trim() : '';
            if (nuevo && nuevo !== previo) {
                const res = tab.fileName ? renameSavedQuery(tab.fileName, nuevo) : 'unsaved';
                if (res === 'taken') {
                    logToToolbar(chrome.i18n.getMessage('sql_tab_rename_taken', [nuevo])
                        || ('Ya hay una consulta guardada con el nombre «' + nuevo + '».'), 'warning');
                } else {
                    tab.title = nuevo;
                    tab.renamed = res !== 'ok';
                    persistTabs();
                    if (res === 'ok') updateTitleState();
                }
            }
            el.removeAttribute('data-render-key');
            renderTabsBar();
        };

        input.addEventListener('keydown', (e) => {
            e.stopPropagation();
            if (e.key === 'Enter') { e.preventDefault(); cerrar(true); }
            else if (e.key === 'Escape') { e.preventDefault(); cerrar(false); }
        });
        input.addEventListener('blur', () => cerrar(true));
        input.addEventListener('click', (e) => e.stopPropagation());
        input.addEventListener('dblclick', (e) => e.stopPropagation());
    }

    async function closeTabsBulk(id, modo) {
        const idx = tabs.findIndex(t => t.id === id);
        if (idx === -1) return;

        const victimas = tabs.filter((t, i) => {
            if (t.id === id) return false;
            if (modo === 'right') return i > idx;
            if (modo === 'left') return i < idx;
            return true;
        });
        if (!victimas.length) return;

        const res = await showRunnerConfirm({
            title: chrome.i18n.getMessage('sql_tab_close_bulk_title') || 'Close tabs?',
            body: chrome.i18n.getMessage('sql_tab_close_bulk_body', [String(victimas.length)])
                || ('This closes ' + victimas.length + ' tabs. Their queries are not saved.'),
            confirmLabel: chrome.i18n.getMessage('sql_tab_close_bulk_ok') || 'Close',
            danger: true
        });
        if (!(res && typeof res === 'object' ? res.ok : res)) return;

        const fuera = new Set(victimas.map(t => t.id));
        if (_renamingTabId && fuera.has(_renamingTabId)) _renamingTabId = null;
        tabs = tabs.filter(t => !fuera.has(t.id));

        if (fuera.has(activeTabId)) activateTab(id);
        else { renderTabsBar(); persistTabs(); }
    }

    function showTabContextMenu(evt, id) {
        removeTabContextMenu();
        if (!tabs.find(t => t.id === id)) return;

        const ctx = document.createElement('div');
        ctx.className = 'nsft-sql-schema-ctx';
        ctx.id = 'nsft-sql-tab-ctx';
        ctx.style.left = evt.clientX + 'px';
        ctx.style.top = evt.clientY + 'px';

        const mkItem = (label, handler, opts) => {
            const o = opts || {};
            const item = document.createElement('div');
            item.className = 'nsft-sql-schema-ctx-item'
                + (o.danger ? ' is-danger' : '')
                + (o.disabled ? ' is-disabled' : '');
            item.textContent = label;
            if (o.disabled) {
                item.setAttribute('aria-disabled', 'true');
                return item;
            }
            item.addEventListener('click', (e) => {
                e.stopPropagation();
                removeTabContextMenu();
                handler();
            });
            return item;
        };

        const idx = tabs.findIndex(t => t.id === id);
        const sep = () => {
            const s = document.createElement('div');
            s.className = 'nsft-sql-schema-ctx-sep';
            return s;
        };

        ctx.appendChild(mkItem(
            chrome.i18n.getMessage('sql_tab_rename') || 'Rename',
            () => startTabRename(id)
        ));
        ctx.appendChild(sep());
        ctx.appendChild(mkItem(
            chrome.i18n.getMessage('sql_tab_close') || 'Close',
            () => closeTab(id),
            { danger: true }
        ));
        ctx.appendChild(mkItem(
            chrome.i18n.getMessage('sql_tab_close_right') || 'Close tabs to the right',
            () => closeTabsBulk(id, 'right'),
            { danger: true, disabled: idx >= tabs.length - 1 }
        ));
        ctx.appendChild(mkItem(
            chrome.i18n.getMessage('sql_tab_close_left') || 'Close tabs to the left',
            () => closeTabsBulk(id, 'left'),
            { danger: true, disabled: idx <= 0 }
        ));
        ctx.appendChild(mkItem(
            chrome.i18n.getMessage('sql_tab_close_others') || 'Close other tabs',
            () => closeTabsBulk(id, 'others'),
            { danger: true, disabled: tabs.length < 2 }
        ));

        document.body.appendChild(ctx);
        clampMenuToViewport(ctx, evt.clientX, evt.clientY);
        setTimeout(() => {
            document.addEventListener('click', removeTabContextMenu, { once: true });
        }, 0);
    }

    function removeTabContextMenu() {
        const el = document.getElementById('nsft-sql-tab-ctx');
        if (el) el.remove();
    }

    let _dragTabId = null;
    let _dragMoved = false;
    let _dragStartX = 0;
    let _dragGrabOffset = 0;

    const TAB_DRAG_THRESHOLD = 4;

    function syncTabsOrderFromDom(bar) {
        const pos = new Map();
        bar.querySelectorAll('.nsft-sql-tab').forEach((el, i) => {
            pos.set(el.getAttribute('data-tab-id'), i);
        });
        tabs.sort((a, b) => (pos.get(a.id) ?? 0) - (pos.get(b.id) ?? 0));
    }

    function autoScrollTabsBar(bar, clientX) {
        const r = bar.getBoundingClientRect();
        const zona = 28;
        if (clientX < r.left + zona) bar.scrollLeft -= 12;
        else if (clientX > r.right - zona) bar.scrollLeft += 12;
    }

    function onTabPointerDown(e) {
        if (e.button !== 0 || _renamingTabId) return;
        if (e.target.closest('[data-tab-close]') || e.target.closest('[data-tab-fav]')) return;
        if (e.target.closest('#nsft-sql-tab-add')) return;
        const tabEl = e.target.closest('.nsft-sql-tab');
        if (!tabEl) return;

        _dragTabId = tabEl.getAttribute('data-tab-id');
        _dragMoved = false;
        _dragStartX = e.clientX;
        _dragGrabOffset = e.clientX - tabEl.getBoundingClientRect().left;
    }

    function onTabPointerMove(e) {
        if (!_dragTabId) return;
        const bar = e.currentTarget;
        const dragEl = bar.querySelector('.nsft-sql-tab[data-tab-id="' + (window.CSS && CSS.escape ? CSS.escape(_dragTabId) : _dragTabId) + '"]');
        if (!dragEl) return;

        if (!_dragMoved) {
            if (Math.abs(e.clientX - _dragStartX) < TAB_DRAG_THRESHOLD) return;
            _dragMoved = true;
            dragEl.classList.add('is-dragging');
            bar.classList.add('is-reordering');
            try { bar.setPointerCapture(e.pointerId); } catch (err) { }
        }
        e.preventDefault();
        autoScrollTabsBar(bar, e.clientX);

        const otras = Array.from(bar.querySelectorAll('.nsft-sql-tab')).filter(el => el !== dragEl);
        for (const el of otras) {
            const r = el.getBoundingClientRect();
            if (e.clientX < r.left || e.clientX > r.right) continue;
            const medio = r.left + r.width / 2;
            const antes = el.compareDocumentPosition(dragEl) & Node.DOCUMENT_POSITION_FOLLOWING;
            if (antes && e.clientX < medio) bar.insertBefore(dragEl, el);
            else if (!antes && e.clientX > medio) el.after(dragEl);
            else break;
            syncTabsOrderFromDom(bar);
            break;
        }

        dragEl.style.transform = '';
        const natural = dragEl.getBoundingClientRect().left;
        const barRect = bar.getBoundingClientRect();
        const minX = barRect.left - natural;
        const maxX = barRect.right - dragEl.offsetWidth - natural;
        const dx = Math.max(minX, Math.min(maxX, e.clientX - _dragGrabOffset - natural));
        dragEl.style.transform = 'translateX(' + dx + 'px)';
    }

    function onTabPointerUp(e) {
        if (!_dragTabId) return;
        const bar = e.currentTarget;
        const dragEl = bar.querySelector('.nsft-sql-tab.is-dragging');
        if (dragEl) {
            dragEl.classList.remove('is-dragging');
            dragEl.style.transform = '';
        }
        bar.classList.remove('is-reordering');
        try { bar.releasePointerCapture(e.pointerId); } catch (err) { }

        if (_dragMoved) {
            syncTabsOrderFromDom(bar);
            persistTabs();
        }
        _dragTabId = null;
        _dragMoved = false;
    }

    function _tabRenderKey(t, savedMap) {
        const entry = t.fileName ? savedMap[t.fileName] : null;
        return [t.title, t.dirty ? 1 : 0, entry ? 1 : 0, (entry && entry.favorite === true) ? 1 : 0].join('');
    }

    function syncTabsNav() {
        const bar = document.getElementById('nsft-sql-tabs-bar');
        const prev = document.getElementById('nsft-sql-tabs-prev');
        const next = document.getElementById('nsft-sql-tabs-next');
        if (!bar || !prev || !next) return;

        const desborda = bar.scrollWidth > bar.clientWidth + 1;
        prev.hidden = !desborda;
        next.hidden = !desborda;
        if (!desborda) return;

        const max = bar.scrollWidth - bar.clientWidth;
        prev.disabled = bar.scrollLeft <= 1;
        next.disabled = bar.scrollLeft >= max - 1;
    }

    function scrollTabsBy(dir) {
        const bar = document.getElementById('nsft-sql-tabs-bar');
        if (!bar) return;
        const paso = Math.max(120, Math.round(bar.clientWidth * 0.5));
        bar.scrollBy({ left: dir * paso, behavior: 'smooth' });
    }

    let _lastScrolledTabId = null;
    function scrollActiveTabIntoView() {
        if (activeTabId === _lastScrolledTabId) return;
        _lastScrolledTabId = activeTabId;
        const bar = document.getElementById('nsft-sql-tabs-bar');
        if (!bar || bar.scrollWidth <= bar.clientWidth + 1) return;
        const el = bar.querySelector('.nsft-sql-tab.active');
        if (el && el.scrollIntoView) {
            el.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
        }
    }

    function renderTabsBar() {
        const bar = document.getElementById('nsft-sql-tabs-bar');
        if (!bar) return;
        const savedMap = readSavedQueriesSync();

        if (!bar.dataset.nsftWired) {
            bar.dataset.nsftWired = '1';
            bar.addEventListener('click', (e) => {
                const closeEl = e.target.closest('[data-tab-close]');
                if (closeEl) { closeTab(closeEl.getAttribute('data-tab-close')); return; }
                const favEl = e.target.closest('[data-tab-fav]');
                if (favEl) {
                    e.stopPropagation();
                    const tab = tabs.find(tt => tt.id === favEl.getAttribute('data-tab-fav'));
                    if (tab && tab.fileName) toggleFavorite(tab.fileName, () => renderTabsBar());
                    return;
                }
                if (e.target.closest('#nsft-sql-tab-add')) { createTab(); return; }
                const tabEl = e.target.closest('.nsft-sql-tab');
                if (tabEl) {
                    const id = tabEl.getAttribute('data-tab-id');
                    if (id && id !== activeTabId) activateTab(id);
                }
            });

            bar.addEventListener('dblclick', (e) => {
                if (e.target.closest('[data-tab-close]') || e.target.closest('[data-tab-fav]')) return;
                const tabEl = e.target.closest('.nsft-sql-tab');
                if (!tabEl) return;
                e.preventDefault();
                startTabRename(tabEl.getAttribute('data-tab-id'));
            });

            bar.addEventListener('contextmenu', (e) => {
                const tabEl = e.target.closest('.nsft-sql-tab');
                if (!tabEl) return;
                e.preventDefault();
                showTabContextMenu(e, tabEl.getAttribute('data-tab-id'));
            });

            bar.addEventListener('pointerdown', onTabPointerDown);
            bar.addEventListener('pointermove', onTabPointerMove);
            bar.addEventListener('pointerup', onTabPointerUp);
            bar.addEventListener('pointercancel', onTabPointerUp);

            bar.addEventListener('scroll', syncTabsNav, { passive: true });
            const prevBtn = document.getElementById('nsft-sql-tabs-prev');
            const nextBtn = document.getElementById('nsft-sql-tabs-next');
            if (prevBtn) prevBtn.addEventListener('click', (e) => { e.stopPropagation(); scrollTabsBy(-1); });
            if (nextBtn) nextBtn.addEventListener('click', (e) => { e.stopPropagation(); scrollTabsBy(1); });
            if (typeof ResizeObserver !== 'undefined') {
                try { new ResizeObserver(syncTabsNav).observe(bar); } catch (err) { }
            }
        }

        let addBtnEl = bar.querySelector('#nsft-sql-tab-add');
        if (!addBtnEl) {
            addBtnEl = document.createElement('button');
            addBtnEl.className = 'nsft-sql-tab-add';
            addBtnEl.id = 'nsft-sql-tab-add';
            addBtnEl.textContent = '+';
            addBtnEl.title = chrome.i18n.getMessage('sql_tab_new') || 'New query tab';
            bar.appendChild(addBtnEl);
        }

        const existing = {};
        bar.querySelectorAll('.nsft-sql-tab').forEach(el => { existing[el.getAttribute('data-tab-id')] = el; });

        const present = {};
        tabs.forEach(t => {
            present[t.id] = true;
            let el = existing[t.id];
            const key = _tabRenderKey(t, savedMap);
            const renaming = t.id === _renamingTabId;
            if (!el) {
                el = document.createElement('div');
                el.className = 'nsft-sql-tab';
                el.setAttribute('data-tab-id', t.id);
                el.innerHTML = _tabInnerHtml(t, savedMap);
                el.setAttribute('data-render-key', key);
            } else if (!renaming && el.getAttribute('data-render-key') !== key) {
                el.innerHTML = _tabInnerHtml(t, savedMap);
                el.setAttribute('data-render-key', key);
            }
            el.title = t.fileName || t.title;
            el.classList.toggle('active', t.id === activeTabId);
            bar.insertBefore(el, addBtnEl);
        });

        Object.keys(existing).forEach(id => {
            if (!present[id]) existing[id].remove();
        });

        syncTabsNav();
        scrollActiveTabIntoView();
    }

    let _resultsSearchTerm = '';

    const SEARCH_SVG = '<svg class="nsft-sql-search-ico" viewBox="0 0 24 24" fill="none" '
        + 'stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true">'
        + '<circle cx="10.5" cy="10.5" r="6.8"></circle><path d="m20.5 20.5-5.2-5.2"></path></svg>';

    function wireFindClear(inputId) {
        const input = document.getElementById(inputId);
        const wrap = input && input.closest('.nsft-sql-find');
        if (!input || !wrap || wrap.dataset.nsftFindWired) return;
        wrap.dataset.nsftFindWired = '1';

        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'nsft-sql-find-clear';
        btn.hidden = true;
        const label = chrome.i18n.getMessage('sql_find_clear') || 'Clear search';
        btn.title = label;
        btn.setAttribute('aria-label', label);
        btn.textContent = '×';
        wrap.appendChild(btn);

        const sync = () => { btn.hidden = !input.value; };

        const limpiar = () => {
            if (!input.value) return;
            input.value = '';
            input.dispatchEvent(new Event('input', { bubbles: true }));
            sync();
            input.focus();
        };

        input.addEventListener('input', sync);
        btn.addEventListener('mousedown', (e) => {
            e.preventDefault();
        });
        btn.addEventListener('click', (e) => { e.stopPropagation(); limpiar(); });
        input.addEventListener('keydown', (e) => {
            if (e.key !== 'Escape' || !input.value) return;
            e.preventDefault();
            e.stopPropagation();
            limpiar();
        });
        sync();
    }

    function markMatches(text, termLc) {
        const s = (text === null || text === undefined) ? '' : String(text);
        if (!termLc || !s) return escapeHtml(s);

        const TS = window.NSFT_TextSearch;
        if (TS) return TS.markHtml(s, termLc, 'nsft-sql-hl');

        const low = s.toLowerCase();
        let i = low.indexOf(termLc);
        if (i === -1) return escapeHtml(s);
        let out = '', from = 0;
        while (i !== -1) {
            out += escapeHtml(s.slice(from, i)) +
                '<mark class="nsft-sql-hl">' + escapeHtml(s.slice(i, i + termLc.length)) + '</mark>';
            from = i + termLc.length;
            i = low.indexOf(termLc, from);
        }
        return out + escapeHtml(s.slice(from));
    }

    function highlightCellFormatter(cell) {
        return markMatches(cell.getValue(), _resultsSearchTerm);
    }

    function escapeHtml(str) {
        if (window.NSFT_DOM && typeof window.NSFT_DOM.escapeHtml === 'function') {
            return window.NSFT_DOM.escapeHtml(str);
        }
        return String(str == null ? '' : str).replace(/[&<>"']/g, c => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        }[c]));
    }

    function tsFold(s) {
        const TS = window.NSFT_TextSearch;
        return TS ? TS.fold(s) : String(s == null ? '' : s).toLowerCase();
    }

    function _nsftResolveTheme() {
        return _nsftTheme === 'dark' ? 'dark' : 'light';
    }
    function _nsftApplyThemeToModal() {
        const theme = _nsftResolveTheme();
        const m = document.getElementById('nsft-sql-modal');
        if (m) m.setAttribute('data-theme', theme);
        if (document.body) document.body.setAttribute('data-nsft-sql-theme', theme);
    }
    chrome.storage.local.get({ [NSFT_THEME_KEY]: 'light' }, (items) => {
        _nsftTheme = items[NSFT_THEME_KEY] || 'light';
        _nsftApplyThemeToModal();
        _syncCodeThemeFromNsftTheme();
    });
    chrome.storage.onChanged.addListener((changes, area) => {
        if (area === 'local' && changes[NSFT_THEME_KEY]) {
            _nsftTheme = changes[NSFT_THEME_KEY].newValue || 'light';
            _nsftApplyThemeToModal();
            _syncCodeThemeFromNsftTheme();
        }
    });

    function _syncCodeThemeFromNsftTheme() {
        chrome.storage.local.get({ suiteqlThemeOverridden: false }, (items) => {
            if (items.suiteqlThemeOverridden) return;
            const target = _nsftResolveTheme() === 'dark' ? 'atom-one-dark' : 'atom-one-light';
            if (currentTheme === target) return;
            updateTheme(target);
        });
    }

    const RUNNER_EXTRA_EXCLUDED = ['/app/bundler/previewbundleupdate.nl'];
    const RUNNER_FALLBACK_EXCLUDED = [
        '/app/setup/assistants/bundlebuilder.nl',
        '/app/bundler/installbundle.nl',
        '/app/bundler/bundledetails.nl',
        '/app/bundler/previewbundleupdate.nl'
    ];

    function esTomaDelEditor() {
        return /[?&]nsft-advanced-editor=T/i.test(window.location.search);
    }
    function isRunnerExcludedPage() {
        if (esTomaDelEditor()) return false;
        const href = window.location.href;
        if (RUNNER_EXTRA_EXCLUDED.some(p => href.includes(p))) return true;
        if (window.NSFT_RecordButtons && typeof window.NSFT_RecordButtons.isExcludedPage === 'function') {
            return window.NSFT_RecordButtons.isExcludedPage();
        }
        return RUNNER_FALLBACK_EXCLUDED.some(p => href.includes(p));
    }

    chrome.storage.local.get({
        [STORAGE_KEY]: true,
        suiteqlTheme: 'atom-one-light',
        suiteqlThemeOverridden: false,
        suiteqlHistoryMax: 30,
        suiteqlMaxRecords: 5000,
        suiteqlFetchAllRows: true,
        suiteqlFetchMethod: 'auto',
        suiteqlManyRowsAction: 'ask',
        suiteqlManyRowsThreshold: 20000,
        suiteqlRestConcurrency: 4,
        suiteqlRestFillColumns: false,
        suiteqlAutoSchema: true,
        nsft_sql_sidebar_side: 'left',
        nsft_sql_sidebar_open: true,
        nsft_sql_sidebar_width: 0,
        nsft_sql_view_state: 'both',
        [SHORTCUT_KEY]: null,
        [VARIABLES_STORAGE_KEY]: []
    }, (items) => {
        if (!items[STORAGE_KEY]) return;

        let _arranco = false;
        const arranca = () => {
            if (_arranco) return;
            _arranco = true;
            bindRunnerShortcut();
            cachedSidebarSide = items.nsft_sql_sidebar_side === 'right' ? 'right' : 'left';
            cachedSidebarOpen = items.nsft_sql_sidebar_open !== false;
            cachedSidebarWidth = Number(items.nsft_sql_sidebar_width) || 0;
            cachedViewState = items.nsft_sql_view_state || 'both';
            sqlVariables = normalizeVariables(items[VARIABLES_STORAGE_KEY]);
            init(items);
        };

        if (!isRunnerExcludedPage()) { arranca(); return; }
        window.addEventListener('nsft-adv-ready', () => {
            if (!isRunnerExcludedPage()) arranca();
        });
    });

    function bindRunnerShortcut() {
        if (!window.NSFT_Shortcuts || !window.NSFT_Shortcuts.bind) return;
        window.NSFT_Shortcuts.bind('suiteql_runner', {
            label: chrome.i18n.getMessage('cheatsheet_item_open_runner') || 'Open SuiteQL Runner',
            defaultCombo: DEFAULT_SHORTCUT,
            storageKey: SHORTCUT_KEY,
            event: 'nsft-show-suiteql-runner',
            group: chrome.i18n.getMessage('cheatsheet_group_global') || 'Global',
            order: 30
        });
    }

    const VAR_TYPES = ['fixed', 'runtime', 'both'];

    function normalizeVariables(raw) {
        if (!Array.isArray(raw)) return [];
        return raw
            .filter(v => v && typeof v.name === 'string' && v.name.trim())
            .map(v => ({
                name: v.name.trim(),
                value: v.value != null ? String(v.value) : '',
                type: VAR_TYPES.indexOf(v.type) !== -1 ? v.type : 'fixed'
            }));
    }

    function isRuntimeVar(v) {
        return v && (v.type === 'runtime' || v.type === 'both');
    }

    const _runtimeVarMemory = Object.create(null);

    function init(items) {
        HISTORY_MAX = _clampInt(items.suiteqlHistoryMax, 1, 1000, 30);
        MAX_RECORDS_FETCH = items.suiteqlFetchAllRows
            ? FETCH_ALL_CEILING
            : _clampInt(items.suiteqlMaxRecords, 1000, 100000, 5000);
        ROWS_CONFIRM_THRESHOLD = _clampInt(items.suiteqlManyRowsThreshold, 1000, 100000, 20000);
        MANY_ROWS_ACTION = ['ask', 'continue', 'stop'].includes(items.suiteqlManyRowsAction)
            ? items.suiteqlManyRowsAction : 'ask';
        FETCH_METHOD = ['auto', 'rest', 'nquery'].includes(items.suiteqlFetchMethod)
            ? items.suiteqlFetchMethod : 'auto';
        REST_CONCURRENCY = _clampInt(items.suiteqlRestConcurrency, 1, 8, 4);
        REST_FILL_COLUMNS = !!items.suiteqlRestFillColumns;
        AUTO_SCHEMA = items.suiteqlAutoSchema !== false;
        if (items.suiteqlThemeOverridden) {
            currentTheme = items.suiteqlTheme || 'atom-one-light';
        } else {
            currentTheme = _nsftResolveTheme() === 'dark' ? 'atom-one-dark' : 'atom-one-light';
        }
        setupListeners();
    }

    chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== 'local') return;

        if (changes.suiteqlFetchMethod) {
            const v = changes.suiteqlFetchMethod.newValue;
            FETCH_METHOD = ['auto', 'rest', 'nquery'].includes(v) ? v : 'auto';
            _runnerRestBroken = false;
        }
        if (changes.suiteqlManyRowsAction) {
            const v = changes.suiteqlManyRowsAction.newValue;
            MANY_ROWS_ACTION = ['ask', 'continue', 'stop'].includes(v) ? v : 'ask';
        }
        if (changes.suiteqlManyRowsThreshold) {
            ROWS_CONFIRM_THRESHOLD = _clampInt(changes.suiteqlManyRowsThreshold.newValue, 1000, 100000, 20000);
        }
        if (changes.suiteqlRestFillColumns) {
            REST_FILL_COLUMNS = !!changes.suiteqlRestFillColumns.newValue;
        }
        if (changes.suiteqlRestConcurrency) {
            REST_CONCURRENCY = _clampInt(changes.suiteqlRestConcurrency.newValue, 1, 8, 4);
        }
        if (changes.suiteqlAutoSchema) {
            AUTO_SCHEMA = changes.suiteqlAutoSchema.newValue !== false;
            paintAutoSchemaBtn();
            renderSchemaTree();
        }
        if (changes.suiteqlFetchAllRows || changes.suiteqlMaxRecords) {
            chrome.storage.local.get({ suiteqlFetchAllRows: true, suiteqlMaxRecords: 5000 }, (it) => {
                MAX_RECORDS_FETCH = it.suiteqlFetchAllRows
                    ? FETCH_ALL_CEILING
                    : _clampInt(it.suiteqlMaxRecords, 1000, 100000, 5000);
            });
        }
    });

    chrome.storage.onChanged.addListener((changes, area) => {
        if (area === 'local') {
            if (changes.suiteqlTheme) {
                updateTheme(changes.suiteqlTheme.newValue || 'atom-one-light');
            }
            if (changes.nsft_sql_sidebar_side) {
                cachedSidebarSide = changes.nsft_sql_sidebar_side.newValue === 'right' ? 'right' : 'left';
            }
            if (changes.nsft_sql_view_state) {
                cachedViewState = changes.nsft_sql_view_state.newValue || 'both';
            }
            if (changes.nsft_sql_sidebar_open) {
                cachedSidebarOpen = changes.nsft_sql_sidebar_open.newValue !== false;
            }
            if (changes.nsft_sql_sidebar_width) {
                cachedSidebarWidth = Number(changes.nsft_sql_sidebar_width.newValue) || 0;
            }
        }
    });

    function updateTheme(themeName) {
        currentTheme = themeName;
        loadThemeCss(themeName);
        if (editor) {
            editor.setOption("theme", themeName);
        }
    }

    function setupListeners() {

        window.addEventListener('pagehide', flushPersistTabs);
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'hidden') flushPersistTabs();
        });

        window.addEventListener('nsft-show-suiteql-runner', function (e) {
            const pf = e && e.detail && e.detail.prefillRecord;
            const sql = e && e.detail && e.detail.prefillSql;
            const applyPrefill = () => {
                if (pf && pf.rectype && pf.id) {
                    resolveAndPrefillRecord(pf.rectype, pf.id);
                }
                if (sql && editor) {
                    editor.setValue(String(sql));
                    editor.focus();
                }
            };

            if (window.NSFT_ShortcutCoach) window.NSFT_ShortcutCoach.hint('suiteql_runner');

            const modal = document.getElementById('nsft-sql-modal');
            if (!modal || _sqlBooting) {
                if (!modal && !_sqlBooting) {
                    showBootOverlay();
                    initModal();
                }
                _sqlBootQueue.push(applyPrefill);
                return;
            }

            modal.style.display = 'flex';
            if (modal.dataset.state !== 'fullscreen') {
                modal.dataset.state = 'maximised';
                modal.style.top = lastMaximizedTop;
                modal.style.left = lastMaximizedLeft;
                modal.style.right = 'auto';
                modal.style.bottom = 'auto';
            }
            bringToFront();
            applyPrefill();
            focusEditorOnOpen();
        });

        window.addEventListener('nsft-layout-update', () => {
            const modal = document.getElementById('nsft-sql-modal');
            if (modal && modal.dataset.state === 'minimised') {
            }
        });

        window.addEventListener('message', function (event) {
            if (event.source !== window || !event.data) return;
            if (event.data.dest === 'extension_sql') {
                handleExtensionMessage(event.data);
            }
        });
    }

    const LOG_MAX = 200;
    let _sqlLogs = [];
    let _logSeq = 0;
    let _selectedLogId = null;
    let _lastDetailId = null;
    let _unseenErrors = 0;
    let _activePanelTab = 'results';
    let _lastRunQuery = '';
    let _runTimer = null;
    let _runStartedAt = 0;
    let _runFetched = 0;
    let _runTotal = 0;
    let _runPhase = 'idle';
    let _runWatchdog = null;
    const RUN_WATCHDOG_MS = 180000;

    let _stopRequested = false;
    let _restAbort = null;
    let _runVia = null;

    let _govLeft = null;
    let _govMax = 0;

    function reportGovernance(units) {
        const n = Number(units);
        if (!Number.isFinite(n) || n < 0) return;
        _govLeft = n;
        if (n > _govMax) _govMax = n;
        paintGovernance();
    }

    function paintGovernance() {
        const box = document.getElementById('nsft-sql-gov');
        if (!box) return;
        if (_govLeft === null || !_govMax) { box.hidden = true; return; }
        box.hidden = false;

        const ratio = Math.max(0, Math.min(1, _govLeft / _govMax));
        const fill = box.querySelector('.nsft-sql-gov-fill');
        if (fill) fill.style.width = (ratio * 100).toFixed(1) + '%';
        const num = box.querySelector('.nsft-sql-gov-num');
        if (num) num.textContent = fmtNum(_govLeft);

        box.classList.toggle('is-low', ratio <= 0.15);
        box.classList.toggle('is-mid', ratio > 0.15 && ratio <= 0.4);

        box.title = chrome.i18n.getMessage('sql_gov_title', [fmtNum(_govLeft), fmtNum(_govMax)])
            || (_govLeft + ' / ' + _govMax);
    }
    let _logsSeeded = false;
    let _logFilter = 'all';
    let _logQuery = '';
    let _pendingFix = null;
    let _fixSeq = 0;
    let _lastRevealedLogId = null;
    let _aiAvailWired = false;

    const AI_SPARK_SVG = '<svg class="nsft-sql-ai-ico" viewBox="0 0 16 16" fill="none" stroke="currentColor" '
        + 'stroke-width="1.4" stroke-linejoin="round" aria-hidden="true">'
        + '<path d="M6.2 2 7.3 5 10.3 6.1 7.3 7.2 6.2 10.2 5.1 7.2 2.1 6.1 5.1 5z"></path>'
        + '<path d="M11.6 9.4l.6 1.6 1.6.6-1.6.6-.6 1.6-.6-1.6-1.6-.6 1.6-.6z"></path></svg>';

    const ARROW_SVG = '<svg class="nsft-sql-act-ico" viewBox="0 0 16 16" fill="none" stroke="currentColor" '
        + 'stroke-width="1.6" stroke-linecap="round" aria-hidden="true">'
        + '<path d="M2.5 8h11M9.5 4l4 4-4 4"></path></svg>';

    const TRASH_SVG = '<svg class="nsft-sql-act-ico" viewBox="0 0 16 16" fill="none" stroke="currentColor" '
        + 'stroke-width="1.4" aria-hidden="true">'
        + '<path d="M3 5h10M6.5 5V3.5h3V5M4.5 5l.6 8h5.8l.6-8"></path></svg>';

    const RERUN_SVG = '<svg class="nsft-sql-act-ico" viewBox="0 0 16 16" fill="none" stroke="currentColor" '
        + 'stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
        + '<path d="M13.2 8a5.2 5.2 0 1 1-1.5-3.7"></path>'
        + '<path d="M13.4 2.4V5.2H10.6"></path></svg>';

    const CLOSE_SVG = '<svg class="nsft-sql-close-ico" viewBox="0 0 16 16" fill="none" stroke="currentColor" '
        + 'stroke-width="1.5" stroke-linecap="round" aria-hidden="true">'
        + '<path d="M4.5 4.5l7 7M11.5 4.5l-7 7"></path></svg>';

    const HINT_SVG = '<svg class="nsft-sql-hint-ico" viewBox="0 0 16 16" fill="none" stroke="currentColor" '
        + 'stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
        + '<path d="M8 1.8a4 4 0 0 0-2.4 7.2c.4.3.6.8.6 1.3h3.6c0-.5.2-1 .6-1.3A4 4 0 0 0 8 1.8z"></path>'
        + '<path d="M6.2 12.4h3.6M6.9 14.2h2.2"></path></svg>';

    const COPY_SVG = '<svg class="nsft-sql-act-ico" viewBox="0 0 16 16" fill="none" stroke="currentColor" '
        + 'stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
        + '<rect x="5.6" y="5.6" width="7.8" height="7.8" rx="1.5"></rect>'
        + '<path d="M10.4 5.6V4.1A1.5 1.5 0 0 0 8.9 2.6H4.1A1.5 1.5 0 0 0 2.6 4.1v4.8a1.5 1.5 0 0 0 1.5 1.5h1.5"></path></svg>';

    function setRunState(state, info) {
        const el = document.getElementById('nsft-sql-status-text');
        const panel = document.querySelector('.nsft-sql-results-panel');
        if (panel) panel.setAttribute('data-run-state', state);

        const modal = document.getElementById('nsft-sql-modal');
        if (modal) modal.setAttribute('data-run-state', state);

        const pill = document.getElementById('nsft-sql-run-pill');
        if (pill) pill.hidden = state !== 'running';

        paintRunButton(state === 'running');
        paintClearResultsBtn(state === 'running');

        const errBox = document.getElementById('nsft-sql-results-error');
        if (errBox) errBox.hidden = state !== 'error';

        clearInterval(_runTimer);
        _runTimer = null;
        clearTimeout(_runWatchdog);
        _runWatchdog = null;
        if (state !== 'running') _runPhase = 'idle';

        if (state === 'running') armRunWatchdog();

        if (!el) return;

        if (state === 'running') {
            _runStartedAt = Date.now();
            _runFetched = 0;
            _runTotal = 0;
            _runPhase = 'running';
            el.textContent = '';
            paintRunStatus();
            _runTimer = setInterval(paintRunStatus, 1000);
        } else if (state === 'ok' && info) {
            const incompleto = Number(info.total) > Number(info.rows);
            paintStatus('<span class="nsft-sql-status-glyph is-ok" aria-hidden="true">✓</span>',
                (incompleto
                    ? chrome.i18n.getMessage('sql_results_meta_partial', [fmtNum(info.rows), fmtNum(info.total), String(info.ms)])
                    : chrome.i18n.getMessage('sql_results_meta', [fmtNum(info.rows), String(info.ms)]))
                || `${fmtNum(info.rows)} rows · ${info.ms} ms`,
                viaBadgeHtml(_runVia));
        } else if (state === 'error') {
            paintStatus('<span class="nsft-sql-status-glyph is-error" aria-hidden="true">✕</span>',
                chrome.i18n.getMessage('sql_status_error') || 'Error',
                viaBadgeHtml(_runVia));
        } else {
            el.textContent = '';
        }
    }

    function paintRunButton(busy) {
        const btn = document.getElementById('nsft-sql-tool-run');
        if (!btn) return;
        if (!btn.dataset.runTitle) btn.dataset.runTitle = btn.title || '';

        const stopping = busy && _stopRequested;
        btn.classList.toggle('is-stop', busy && !stopping);
        btn.classList.toggle('is-busy', stopping);
        btn.disabled = stopping;
        btn.setAttribute('aria-busy', busy ? 'true' : 'false');

        const glyph = btn.querySelector('.nsft-sql-run-glyph');
        if (glyph) glyph.textContent = stopping ? '' : (busy ? '■' : '▶');

        const label = btn.querySelector('.nsft-sql-run-label');
        if (label) {
            label.textContent = stopping
                ? (chrome.i18n.getMessage('sql_stopping_btn') || 'Stopping…')
                : busy
                    ? (chrome.i18n.getMessage('sql_stop_btn') || 'Stop')
                    : (chrome.i18n.getMessage('sql_submenu_run') || 'Run');
        }

        const kbd = btn.querySelector('.nsft-sql-kbd');
        if (kbd) kbd.hidden = busy;

        btn.title = busy
            ? (chrome.i18n.getMessage('sql_stop_title') || 'Stop and keep the rows fetched so far')
            : btn.dataset.runTitle;
    }

    function requestStopRun() {
        if (_runPhase === 'idle' || _stopRequested) return;
        _stopRequested = true;

        if (_restAbort) {
            try { _restAbort.abort(); } catch (e) { }
        }
        try { window.postMessage({ type: 'stop_SQL', dest: 'fetcher_sql' }, '*'); } catch (e) { }

        paintRunButton(true);
        paintRunStatus();
        armRunWatchdog();
    }

    function paintStatus(glyphHtml, text, extraHtml) {
        const el = document.getElementById('nsft-sql-status-text');
        if (el) el.innerHTML = glyphHtml + '<span>' + escapeHtml(text) + '</span>' + (extraHtml || '');
    }

    function viaBadgeHtml(via) {
        if (via !== 'rest' && via !== 'nquery') return '';
        const label = via === 'rest' ? 'REST' : 'N/query';
        const title = chrome.i18n.getMessage(via === 'rest' ? 'sql_via_rest_title' : 'sql_via_nquery_title') || label;
        return '<span class="nsft-sql-via is-' + via + '" title="' + escapeHtml(title) + '">' + label + '</span>';
    }

    function paintRunStatus() {
        const secs = Math.floor((Date.now() - _runStartedAt) / 1000);
        const tail = secs >= 1 ? ' · ' + secs + ' s' : '';
        let text;

        if (_stopRequested && _runPhase === 'running') {
            text = _runVia === 'nquery'
                ? (chrome.i18n.getMessage('sql_status_stopping_page') || 'Stopping… finishing the page in progress')
                : (chrome.i18n.getMessage('sql_status_stopping') || 'Stopping…');
        } else if (_runPhase === 'rendering') {
            text = chrome.i18n.getMessage('sql_status_rendering', [fmtNum(_runFetched)])
                || `Preparing ${fmtNum(_runFetched)} rows…`;
        } else if (_runFetched > 0) {
            text = _runTotal > _runFetched
                ? (chrome.i18n.getMessage('sql_status_fetching_of', [fmtNum(_runFetched), fmtNum(_runTotal)])
                    || `Fetching ${fmtNum(_runFetched)} of ${fmtNum(_runTotal)} rows…`)
                : (chrome.i18n.getMessage('sql_status_fetching', [fmtNum(_runFetched)])
                    || `Fetching ${fmtNum(_runFetched)} rows…`);
        } else {
            text = chrome.i18n.getMessage('sql_status_running') || 'Executing…';
        }
        const chip = document.getElementById('nsft-sql-run-pill-text');
        if (chip) chip.textContent = (text + tail).replace('…', '');
    }

    function armRunWatchdog() {
        clearTimeout(_runWatchdog);
        _runWatchdog = setTimeout(() => {
            if (_runPhase === 'idle') return;
            logToToolbar(chrome.i18n.getMessage('sql_run_timeout')
                || 'La consulta no ha respondido; puedes volver a intentarlo.', 'warning');
            setRunState('idle');
        }, RUN_WATCHDOG_MS);
    }

    function reportRunProgress(fetched, total) {
        _runFetched = fetched;
        _runTotal = total || 0;
        if (_runPhase === 'running') { paintRunStatus(); armRunWatchdog(); }
    }

    const SQL_ERROR_KINDS = [
        {
            id: 'memory',
            test: /SSS_MEMORY_LIMIT_EXCEEDED|memory limit exceeded/i,
            title: 'sql_err_memory_title', hint: 'sql_err_memory_hint'
        },
        {
            id: 'governance',
            test: /SSS_USAGE_LIMIT_EXCEEDED|usage limit exceeded|governance/i,
            title: 'sql_err_governance_title', hint: 'sql_err_governance_hint'
        },
        {
            id: 'timelimit',
            test: /SSS_TIME_LIMIT_EXCEEDED|execution time limit|time limit exceeded/i,
            title: 'sql_err_timelimit_title', hint: 'sql_err_timelimit_hint'
        },

        {
            id: 'notqueryable',
            test: /is not queryable|not supported for queries/i,
            title: 'sql_err_notqueryable_title', hint: 'sql_err_notqueryable_hint', token: true
        },
        {
            id: 'permission',
            test: /INSUFFICIENT_PERMISSION|insufficient permission|permission denied|not authorized|SSS_INSUFFICIENT/i,
            title: 'sql_err_permission_title', hint: 'sql_err_permission_hint'
        },

        {
            id: 'alias',
            test: /duplicate alias|alias duplicado|QUERY_DUPLICATE_ALIAS|SSS_DUPLICATE_ALIAS/i,
            title: 'sql_err_alias_title', hint: 'sql_err_alias_hint', token: true
        },
        {
            id: 'ambiguous',
            test: /ambiguous column|columna ambigua|ambiguously defined/i,
            title: 'sql_err_ambiguous_title', hint: 'sql_err_ambiguous_hint', token: true
        },
        {
            id: 'groupby',
            test: /not a GROUP BY expression|not a single-group group function|must appear in the GROUP BY/i,
            title: 'sql_err_groupby_title', hint: 'sql_err_groupby_hint'
        },
        {
            id: 'join',
            test: /QUERY_INVALID_JOIN|invalid join/i,
            title: 'sql_err_join_title', hint: 'sql_err_join_hint'
        },
        {
            id: 'identifier',
            test: /unknown identifier|invalid identifier|unknown column|invalid column|QUERY_INVALID_COLUMN|not a valid/i,
            title: 'sql_err_identifier_title', hint: 'sql_err_identifier_hint', token: true
        },
        {
            id: 'table',
            test: /\btables?\b[^.]{0,40}\bdoes not exist\b|invalid table|no such table|invalid search type|tipo de b[uú]squeda no v[aá]lida/i,
            title: 'sql_err_table_title', hint: 'sql_err_table_hint', token: true
        },

        {
            id: 'ora',
            test: /\bORA-\d{4,5}\b/i,
            title: 'sql_err_ora_title', hint: 'sql_err_ora_hint'
        },

        {
            id: 'pagesize',
            test: /QUERY_ARGUMENT_OUT_OF_RANGE/i,
            title: 'sql_err_pagesize_title', hint: 'sql_err_pagesize_hint'
        },
        {
            id: 'params',
            test: /SSS_INVALID_QUERY_ARGUMENT/i,
            title: 'sql_err_params_title', hint: 'sql_err_params_hint'
        },
        {
            id: 'typearg',
            test: /SSS_INVALID_TYPE_ARGUMENT|invalid type argument/i,
            title: 'sql_err_typearg_title', hint: 'sql_err_typearg_hint'
        },
        {
            id: 'queryarg',
            test: /QUERY_BUILDER_UNSUPPORTED_OPERATOR|QUERY_EQUAL_COLUMNS_NOT_ALLOWED/i,
            title: 'sql_err_queryarg_title', hint: 'sql_err_queryarg_hint'
        },
        {
            id: 'paging',
            test: /QUERY_PAGING_ERROR|QUERY_INVALID_PAGING_PARAM/i,
            title: 'sql_err_paging_title', hint: 'sql_err_paging_hint'
        },

        {
            id: 'syntax',
            test: /syntax error|failed to parse sql/i,
            title: 'sql_err_syntax_title', hint: 'sql_err_syntax_hint'
        },
        {
            id: 'parsefail',
            test: /invalid search query/i,
            title: 'sql_err_parsefail_title', hint: 'sql_err_parsefail_hint'
        },
        {
            id: 'unexpected',
            test: /unexpected error occurred|error inesperado|\bError\s*ID\s*:\s*[A-Za-z0-9_-]{6,}/i,
            title: 'sql_err_unexpected_title', hint: 'sql_err_unexpected_hint'
        },
        {
            id: 'searchengine',
            test: /SSS_SEARCH_ERROR_OCCURRED/i,
            title: 'sql_err_engine_title', hint: 'sql_err_engine_hint'
        }
    ];

    function describeSqlError(raw) {
        const text = String(raw || '');
        const out = {
            raw: text,
            title: chrome.i18n.getMessage('sql_err_generic_title') || 'La consulta falló',
            explain: '',
            code: '',
            state: '',
            line: null,
            column: null,
            hint: '',
            kind: 'unknown'
        };

        const errName = text.match(/\b(SSS_[A-Z_]+|INVALID_[A-Z_]+|USER_ERROR)\b/);
        if (errName) out.name = errName[1];

        const st = text.match(/state\s*:?\s*(\d+)\s*\((\d+)\)/i);
        if (st) { out.state = st[1]; out.code = st[2]; }

        const near = text.match(/near:\s*(\S+?)\((\d+)\s*,\s*(\d+)/i);
        if (near) {
            out.token = near[1];
            out.line = parseInt(near[2], 10);
            out.column = parseInt(near[3], 10);
        }

        const hit = SQL_ERROR_KINDS.find((k) => k.test.test(text));
        if (hit) {
            out.kind = hit.id;
            out.title = chrome.i18n.getMessage(hit.title) || out.title;
            if (hit.token) {
                const q = text.match(/["'`]([A-Za-z0-9_.]+)["'`]/);
                out.badToken = q ? q[1] : (out.token || '');
            }
            if (hit.id === 'ora') {
                const ora = text.match(/\bORA-\d{4,5}\b/i);
                if (ora) out.badToken = ora[0].toUpperCase();
            }
            if (hit.id === 'unexpected') {
                const eid = text.match(/\bError\s*ID\s*:\s*([A-Za-z0-9_-]{6,})/i);
                if (eid) out.badToken = eid[1];
            }
            out.hint = out.badToken
                ? (chrome.i18n.getMessage(hit.hint, [out.badToken]) || chrome.i18n.getMessage(hit.hint) || '')
                : (chrome.i18n.getMessage(hit.hint) || '');
        }

        const human = humanizeRawError(text);
        if (human) out.explain = human;


        return out;
    }

    function humanizeRawError(raw) {
        let s = String(raw || '').trim();
        s = s.replace(/^\s*[A-Z][A-Z0-9_]{3,}\s*:\s*/, '');
        s = s.replace(/^Invalid search query\.\s*Detailed unprocessed description follows\.\s*/i, '');
        s = s.replace(/\s*Available identifiers are\s*:[\s\S]*$/i, '');
        s = s.replace(/\s*Node class\s*:[\s\S]*$/i, '');
        s = s.replace(/\s*,?\s*state\s*:\s*\d+\s*\([\s\S]*$/i, '');
        s = s.trim();
        return s.replace(/\s{2,}/g, ' ');
    }

    function suggestSqlFix(query, info) {
        const q = String(query || '');
        if (!q.trim() || !info || info.kind !== 'syntax') return null;

        const emptySelect = q.match(/(\bSELECT\b)(\s+)(\bFROM\b)/i);
        if (emptySelect) {
            const fromLine = (q.match(/\bFROM\b[^\n]*/i) || [''])[0].trim();
            return {
                key: 'empty-select',
                explain: chrome.i18n.getMessage('sql_fix_empty_select') || '',
                before: emptySelect[1],
                after: emptySelect[1] + ' *',
                context: fromLine,
                fixed: q.replace(/(\bSELECT\b)(\s+)(\bFROM\b)/i, '$1 *$2$3')
            };
        }

        const trailingComma = q.match(/,(\s*)\bFROM\b/i);
        if (trailingComma) {
            return {
                key: 'trailing-comma',
                explain: chrome.i18n.getMessage('sql_fix_trailing_comma') || '',
                before: ', FROM',
                after: ' FROM',
                fixed: q.replace(/,(\s*)\bFROM\b/i, '$1FROM')
            };
        }

        if (/\bSELECT\b/i.test(q) && !/\bFROM\b/i.test(q)) {
            return {
                key: 'no-from',
                explain: chrome.i18n.getMessage('sql_fix_no_from') || '',
                before: '', after: '', fixed: null
            };
        }

        return null;
    }

    function addRunLog(entry, opts) {
        pushLog(Object.assign({ kind: 'run', at: Date.now() }, entry), opts);
    }

    function pushLog(entry, opts) {
        entry.id = 'log' + (++_logSeq);
        _sqlLogs.unshift(entry);
        if (_sqlLogs.length > LOG_MAX) _sqlLogs.length = LOG_MAX;

        if (entry.status === 'error' && _activePanelTab !== 'logs') _unseenErrors++;
        renderLogsBadge();
        renderLogsList();

        if (opts && opts.reveal) {
            _selectedLogId = entry.id;
            switchPanelTab('logs');
            renderLogsList();
            renderLogDetail();
        }
    }

    function seedLogsFromHistory() {
        if (_logsSeeded) return;
        _logsSeeded = true;
        loadHistory((hist) => {
            const seeded = (hist || [])
                .filter((e) => e && (e.status === 'ok' || e.status === 'error'))
                .map((e) => ({
                    id: 'log' + (++_logSeq),
                    kind: 'run',
                    seeded: true,
                    at: e.executedAt ? Date.parse(e.executedAt) || 0 : 0,
                    histAt: e.executedAt || '',
                    status: e.status,
                    query: e.query || '',
                    rows: e.rows,
                    durationMs: e.durationMs,
                    errorMsg: e.errorMsg || '',
                    via: e.via || null
                }));
            if (!seeded.length) return;
            _sqlLogs = _sqlLogs.concat(seeded).slice(0, LOG_MAX);
            renderLogsList();
        });
    }

    function switchPanelTab(tab) {
        if (tab === _activePanelTab && document.querySelector('.nsft-sql-results-panel[data-panel-tab]')) return;
        _activePanelTab = tab;
        const isLogs = tab === 'logs';

        document.querySelectorAll('.nsft-sql-panel-tab').forEach((btn) => {
            const on = btn.getAttribute('data-panel-tab') === tab;
            btn.classList.toggle('is-active', on);
            btn.setAttribute('aria-selected', on ? 'true' : 'false');
        });

        const logsView = document.getElementById('nsft-sql-logs-view');
        const table = document.getElementById('nsft-sql-results-table');
        const chart = document.getElementById('nsft-sql-chart-view');
        const panelEl = document.querySelector('.nsft-sql-results-panel');

        if (panelEl) panelEl.setAttribute('data-panel-tab', tab);

        if (logsView) logsView.hidden = !isLogs;
        const chartToggle = document.getElementById('nsft-sql-chart-toggle');
        const chartActive = !!chartToggle && chartToggle.dataset.mode === 'chart';
        if (table) table.hidden = isLogs ? true : chartActive;
        if (chart) chart.hidden = isLogs ? true : !chartActive;

        if (isLogs) {
            _unseenErrors = 0;
            renderLogsBadge();
            renderLogDetail();
        } else if (resultTable && !chartActive) {
            try { resultTable.redraw(true); } catch (e) { }
        }
    }

    function renderLogsBadge() {
        const badge = document.getElementById('nsft-sql-logs-badge');
        if (!badge) return;
        badge.hidden = _unseenErrors === 0;
        badge.textContent = String(_unseenErrors);
    }

    function logTimeLabel(ts, long) {
        if (!ts) return '';
        try {
            return new Date(ts).toLocaleTimeString(chrome.i18n.getUILanguage(),
                long
                    ? { hour: '2-digit', minute: '2-digit', second: '2-digit' }
                    : { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
        } catch (e) { return ''; }
    }

    function dayGroupLabel(ts) {
        if (!ts) return '';
        const d = new Date(ts);
        const now = new Date();
        const sameDay = (a, b) => a.toDateString() === b.toDateString();
        const yesterday = new Date(now.getTime() - 86400000);
        if (sameDay(d, now)) return (chrome.i18n.getMessage('sql_logs_today') || 'TODAY').toUpperCase();
        if (sameDay(d, yesterday)) return (chrome.i18n.getMessage('sql_logs_yesterday') || 'YESTERDAY').toUpperCase();
        try {
            return d.toLocaleDateString(chrome.i18n.getUILanguage(),
                { day: 'numeric', month: 'long' }).toUpperCase();
        } catch (e) {
            return '';
        }
    }

    function logGlyph(e) {
        if (e.status === 'error') return { cls: 'error', ch: '✕' };
        if (e.status === 'ok' || e.status === 'success') return { cls: 'ok', ch: '✓' };
        return { cls: 'info', ch: 'i' };
    }

    function logMatchesFilter(e) {
        if (_logFilter !== 'all' && e.status !== _logFilter) return false;
        const q = tsFold((_logQuery || '').trim());
        if (!q) return true;
        const info = e.status === 'error' ? describeSqlError(e.errorMsg) : null;
        return [e.query, e.errorMsg, info && info.code, info && info.title]
            .filter(Boolean).some((s) => tsFold(s).includes(q));
    }

    function renderLogsList() {
        const list = document.getElementById('nsft-sql-logs-list');
        if (!list) return;

        const visible = _sqlLogs.filter(logMatchesFilter);

        const nErr = _sqlLogs.filter((e) => e.status === 'error').length;
        const nOk = _sqlLogs.filter((e) => e.status === 'ok').length;
        const countEl = document.getElementById('nsft-sql-logs-count');
        if (countEl) {
            countEl.textContent = visible.length === _sqlLogs.length
                ? String(_sqlLogs.length)
                : (chrome.i18n.getMessage('sql_logs_count_of', [String(visible.length), String(_sqlLogs.length)])
                    || `${visible.length} of ${_sqlLogs.length}`);
        }
        document.querySelectorAll('.nsft-sql-logs-chip').forEach((chip) => {
            const f = chip.getAttribute('data-log-filter');
            chip.classList.toggle('is-active', f === _logFilter);
            const b = chip.querySelector('b');
            if (b) b.textContent = f === 'error' ? String(nErr) : (f === 'ok' ? String(nOk) : '');
        });

        if (!visible.length) {
            list.innerHTML = `<div class="nsft-sql-logs-empty">${escapeHtml(
                _sqlLogs.length
                    ? (chrome.i18n.getMessage('sql_logs_no_match') || 'Nothing matches that filter.')
                    : (chrome.i18n.getMessage('sql_logs_empty') || 'No activity yet.'))}</div>`;
            return;
        }

        let lastGroup = '';
        list.innerHTML = visible.map((e) => {
            const group = dayGroupLabel(e.at);
            const head = group && group !== lastGroup
                ? `<div class="nsft-sql-logs-group">${escapeHtml(group)}</div>` : '';
            lastGroup = group || lastGroup;

            const g = logGlyph(e);

            const qLog = tsFold((_logQuery || '').trim());
            const top = oneLine(e.query);
            let bottom;
            if (e.status === 'error') {
                const info = describeSqlError(e.errorMsg);
                bottom = `<span class="nsft-sql-log-what">${markMatches(info.title, qLog)}</span>` +
                    (info.code ? `<span class="nsft-sql-log-code">${markMatches(info.code, qLog)}</span>` : '');
            } else {
                bottom = `<span class="nsft-sql-log-what">${escapeHtml(
                    chrome.i18n.getMessage('sql_results_meta', [String(e.rows), String(e.durationMs)])
                    || `${e.rows} rows · ${e.durationMs} ms`)}</span>`;
            }

            return head + `<div class="nsft-sql-log-row${e.id === _selectedLogId ? ' is-selected' : ''}"
                        data-log-id="${e.id}" role="listitem" tabindex="0">
                        <span class="nsft-sql-log-glyph is-${g.cls}">${g.ch}</span>
                        <span class="nsft-sql-log-body">
                            <span class="nsft-sql-log-label is-sql">${markMatches(top, qLog)}</span>
                            ${bottom ? `<span class="nsft-sql-log-sub">${bottom}</span>` : ''}
                        </span>
                        <span class="nsft-sql-log-time">${escapeHtml(logTimeLabel(e.at))}</span>
                    </div>`;
        }).join('');

        list.querySelectorAll('.nsft-sql-log-row').forEach((row) => {
            const pick = () => {
                _selectedLogId = row.getAttribute('data-log-id');
                renderLogsList();
                renderLogDetail();
            };
            row.addEventListener('click', pick);
            row.addEventListener('keydown', (ev) => {
                if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); pick(); }
            });
        });

        revealSelectedLogRow();
    }

    function revealSelectedLogRow() {
        if (!_selectedLogId || _selectedLogId === _lastRevealedLogId) return;
        const list = document.getElementById('nsft-sql-logs-list');
        const row = list && list.querySelector('[data-log-id="' + _selectedLogId + '"]');
        if (!list || !row) return;

        const lr = list.getBoundingClientRect();
        const rr = row.getBoundingClientRect();
        if (!lr.height || !rr.height) return;

        _lastRevealedLogId = _selectedLogId;
        if (rr.top < lr.top) list.scrollTop -= (lr.top - rr.top);
        else if (rr.bottom > lr.bottom) list.scrollTop += (rr.bottom - lr.bottom);
    }

    function oneLine(text) {
        const s = String(text || '').replace(/\s+/g, ' ').trim();
        return s.length > 120 ? s.slice(0, 120) + '…' : s;
    }

    function renderLogDetail() {
        const box = document.getElementById('nsft-sql-logs-detail');
        if (!box) return;

        const changed = _selectedLogId !== _lastDetailId;
        _lastDetailId = _selectedLogId;

        const entry = _sqlLogs.find((e) => e.id === _selectedLogId);
        if (!entry) {
            box.innerHTML = `<div class="nsft-sql-logs-empty">${escapeHtml(
                chrome.i18n.getMessage('sql_logs_pick') || 'Pick an entry to see the detail.')}</div>`;
            box.scrollTop = 0;
            return;
        }

        const isError = entry.status === 'error';
        const info = isError ? describeSqlError(entry.errorMsg) : null;

        const title = isError
            ? info.title
            : (chrome.i18n.getMessage('sql_logs_succeeded') || 'Query executed');

        const subtitle = isError
            ? (info.explain || '')
            : (chrome.i18n.getMessage('sql_results_meta', [String(entry.rows), String(entry.durationMs)])
                || `${entry.rows} rows · ${entry.durationMs} ms`);

        const metaTail = [
            relativeTimeLabel(entry.at),
            entry.seeded ? (chrome.i18n.getMessage('sql_logs_from_history') || 'from history') : ''
        ].filter(Boolean).join(' · ');

        const body = isError ? (entry.errorMsg || '') : '';
        const hint = entry.hint || (info && info.hint) || '';
        _pendingFix = null;

        const g = logGlyph(entry);
        const lineCount = entry.query ? entry.query.split('\n').length : 0;

        box.innerHTML = `
            <div class="nsft-sql-logs-dhead">
                <div class="nsft-sql-logs-dtop">
                    <div class="nsft-sql-logs-dident">
                        <span class="nsft-sql-logs-dicon is-${g.cls}">${g.ch}</span>
                        <div class="nsft-sql-logs-dtitles">
                            
                            <div class="nsft-sql-logs-dtitle">${escapeHtml(title)}${viaBadgeHtml(entry.via)}</div>
                            
                            ${subtitle ? `<div class="nsft-sql-logs-dsub" id="nsft-sql-logs-dsub">${escapeHtml(subtitle)}</div>
                            <button type="button" class="nsft-sql-logs-dsub-more" id="nsft-sql-logs-dsub-more" hidden
                                title="${escapeHtml(chrome.i18n.getMessage('sql_logs_sub_more') || 'Ver mensaje completo')}"
                                aria-expanded="false">…</button>` : ''}
                        </div>
                    </div>
                    <div class="nsft-sql-logs-dmeta">
                        <div class="nsft-sql-logs-dtimes">
                            <div class="nsft-sql-logs-dtime">${escapeHtml(logTimeLabel(entry.at, true))}</div>
                            <div class="nsft-sql-logs-drel">${escapeHtml(metaTail)}</div>
                        </div>
                        <button type="button" class="nsft-sql-logs-icon-btn" data-log-act="delete"
                            title="${escapeHtml(chrome.i18n.getMessage('sql_logs_delete') || 'Delete')}"
                            aria-label="${escapeHtml(chrome.i18n.getMessage('sql_logs_delete') || 'Delete')}">${TRASH_SVG}</button>
                    </div>
                </div>
                
                <div class="nsft-sql-logs-actions">
                    ${entry.query ? `<button type="button" class="is-primary" data-log-act="to-editor">${ARROW_SVG}${escapeHtml(chrome.i18n.getMessage('sql_logs_to_editor') || 'Load in editor')}</button>` : ''}
                    ${isError && entry.query && aiAvailable() ? `<button type="button" class="is-ai" data-log-act="ai-fix">${AI_SPARK_SVG}${escapeHtml(chrome.i18n.getMessage('sql_logs_ai_fix') || 'Fix with AI')}</button>` : ''}
                    ${entry.query ? `<button type="button" data-log-act="rerun">${RERUN_SVG}${escapeHtml(chrome.i18n.getMessage('sql_logs_rerun') || 'Run again')}</button>` : ''}
                    ${entry.query || body ? `<span class="nsft-sql-logs-actsep" aria-hidden="true"></span>` : ''}
                    ${entry.query ? `<button type="button" data-log-act="copy-sql">${COPY_SVG}${escapeHtml(chrome.i18n.getMessage('sql_logs_copy_query') || 'Copy query')}</button>` : ''}
                    ${body ? `<button type="button" data-log-act="copy-msg">${COPY_SVG}${escapeHtml(chrome.i18n.getMessage('sql_logs_copy_error') || 'Copy error')}</button>` : ''}
                </div>
            </div>

            <div class="nsft-sql-logs-dbody">
                
                ${hint ? `<details class="nsft-sql-logs-hint">
                    <summary>${HINT_SVG}<span>${escapeHtml(chrome.i18n.getMessage('sql_logs_hint_summary') || 'Posible causa del error')}</span></summary>
                    <div class="nsft-sql-logs-hint-body">${escapeHtml(hint)}</div>
                </details>` : ''}

                
                <div id="nsft-sql-fix-slot"></div>

                ${entry.query ? `
                <div class="nsft-sql-logs-block">
                    <div class="nsft-sql-logs-section">
                        <span>${escapeHtml(chrome.i18n.getMessage('sql_logs_query_sent') || 'Query sent')}</span>
                        <span class="nsft-sql-logs-lines">${escapeHtml(
                            chrome.i18n.getMessage('sql_logs_line_count', [String(lineCount)])
                            || (lineCount + ' lines'))}</span>
                    </div>
                    ${renderNumberedSql(entry.query, info)}
                </div>` : ''}

                ${body ? `
                <details class="nsft-sql-logs-tech">
                    <summary>
                        <span>${escapeHtml(chrome.i18n.getMessage('sql_logs_tech') || 'Technical detail')}</span>
                        ${info && info.name ? `<code>${escapeHtml(info.name)}${info.state ? ' · state ' + escapeHtml(info.state) + (info.code ? ' (' + escapeHtml(info.code) + ')' : '') : ''}</code>` : ''}
                    </summary>
                    <pre class="nsft-sql-logs-msg">${escapeHtml(body)}</pre>
                </details>` : ''}
            </div>`;

        if (changed) box.scrollTop = 0;

        const sub = box.querySelector('#nsft-sql-logs-dsub');
        const subMore = box.querySelector('#nsft-sql-logs-dsub-more');
        if (sub && subMore) {
            if (sub.scrollHeight > sub.clientHeight + 1) {
                subMore.hidden = false;
                subMore.addEventListener('click', () => {
                    const open = sub.classList.toggle('is-open');
                    subMore.setAttribute('aria-expanded', String(open));
                    subMore.textContent = open ? '⌃' : '…';
                    subMore.title = open
                        ? (chrome.i18n.getMessage('sql_logs_sub_less') || 'Ver menos')
                        : (chrome.i18n.getMessage('sql_logs_sub_more') || 'Ver mensaje completo');
                });
            }
        }

        box.querySelectorAll('[data-log-act]').forEach((btn) => {
            btn.addEventListener('click', () => {
                const act = btn.getAttribute('data-log-act');
                if (act === 'copy-msg') copyText(body);
                else if (act === 'copy-sql') copyText(entry.query);
                else if (act === 'delete') deleteLogEntry(entry);
                else if (act === 'ai-fix') askAiToFix(entry, info);
                else if (act === 'rerun' && editor) {
                    editor.setValue(entry.query);
                    executeCurrentQuery();
                } else if (act === 'to-editor' && editor) {
                    editor.setValue(entry.query);
                    editor.focus();
                    logToToolbar(chrome.i18n.getMessage('sql_logs_loaded') || 'Query loaded in the editor', 'info');
                }
            });
        });
    }

    const SQL_KEYWORDS = /^(SELECT|FROM|WHERE|JOIN|LEFT|RIGHT|INNER|OUTER|FULL|CROSS|ON|AND|OR|NOT|IN|IS|NULL|AS|ORDER|GROUP|BY|HAVING|LIMIT|OFFSET|FETCH|NEXT|ROWS|ONLY|UNION|INTERSECT|MINUS|ALL|DISTINCT|CASE|WHEN|THEN|ELSE|END|LIKE|BETWEEN|EXISTS|ASC|DESC|WITH|COUNT|SUM|AVG|MIN|MAX|CAST|COALESCE|NVL|DECODE|TRUNC|TO_CHAR|TO_DATE|TO_NUMBER|SUBSTR|UPPER|LOWER|BUILTIN|ROWNUM|SYSDATE)$/i;

    function highlightSql(text) {
        const re = /(--[^\n]*|\/\*[\s\S]*?\*\/)|('(?:[^']|'')*')|(\b\d+(?:\.\d+)?\b)|([A-Za-z_][A-Za-z0-9_$]*)|(\s+)|([\s\S])/g;
        const tok = (cls, s) => `<span class="nsft-sql-tok-${cls}">${escapeHtml(s)}</span>`;
        let out = '', m;
        while ((m = re.exec(text)) !== null) {
            if (m[1]) out += tok('com', m[1]);
            else if (m[2]) out += tok('str', m[2]);
            else if (m[3]) out += tok('num', m[3]);
            else if (m[4]) out += tok(SQL_KEYWORDS.test(m[4]) ? 'kw' : 'id', m[4]);
            else if (m[5]) out += escapeHtml(m[5]);
            else out += tok('punc', m[6]);
        }
        return out;
    }

    function sqlErrorMark(query, info) {
        if (!info || !info.line) return null;
        return {
            line: info.line,
            text: info.token
                ? (chrome.i18n.getMessage('sql_logs_mark_unexpected',
                    [String(info.line), String(info.column), info.token]) || '')
                : (chrome.i18n.getMessage('sql_logs_at_line',
                    [String(info.line), String(info.column)]) || '')
        };
    }

    function renderNumberedSql(query, info) {
        const lines = String(query || '').split('\n');
        const mark = sqlErrorMark(query, info);
        const badLine = mark ? mark.line : null;
        const rows = lines.map((ln, i) => {
            const n = i + 1;
            const isBad = n === badLine;
            const marker = isBad
                ? `<div class="nsft-sql-sql-marker"><span>⚠ ${escapeHtml(mark.text)}</span></div>`
                : '';
            return `<div class="nsft-sql-sql-line${isBad ? ' is-bad' : ''}">
                        <span class="nsft-sql-sql-num">${n}</span>
                        <span class="nsft-sql-sql-code">${highlightSql(ln)}</span>
                    </div>` + marker;
        }).join('');
        return `<div class="nsft-sql-logs-sql-block">${rows}</div>`;
    }

    function relativeTimeLabel(ts) {
        if (!ts) return '';
        const mins = Math.round((Date.now() - ts) / 60000);
        if (mins < 1) return chrome.i18n.getMessage('sql_logs_just_now') || 'just now';
        if (mins < 60) return chrome.i18n.getMessage('sql_logs_mins_ago', [String(mins)]) || `${mins} min ago`;
        const hours = Math.round(mins / 60);
        if (hours < 24) return chrome.i18n.getMessage('sql_logs_hours_ago', [String(hours)]) || `${hours} h ago`;
        return chrome.i18n.getMessage('sql_logs_days_ago', [String(Math.round(hours / 24))]) || `${Math.round(hours / 24)} d ago`;
    }

    function aiAvailable() {
        return !!document.getElementById('nsft-sql-tool-ai');
    }

    function askAiToFix(entry, info) {
        if (!aiAvailable()) {
            logToToolbar(chrome.i18n.getMessage('sql_ai_fix_unavailable')
                || 'El asistente de IA está desactivado.', 'warning');
            return;
        }
        const slot = document.getElementById('nsft-sql-fix-slot');
        if (!slot) return;

        slot.innerHTML = `
            <div class="nsft-sql-fix-card is-loading">
                <div class="nsft-sql-fix-title">${AI_SPARK_SVG}${escapeHtml(
                    chrome.i18n.getMessage('sql_logs_fix_title') || 'Suggested fix')}</div>
                <div class="nsft-sql-fix-loading">
                    <span class="nsft-sql-fix-spark">${AI_SPARK_SVG}</span>
                    <span class="nsft-sql-fix-shimmer">${escapeHtml(
                        chrome.i18n.getMessage('sql_logs_fix_working') || 'Working on a fix…')}</span>
                </div>
            </div>`;

        scrollFixCardIntoView();

        const parts = [
            chrome.i18n.getMessage('sql_ai_fix_prompt') || 'This SuiteQL query failed. Explain why in one line and give me the corrected query.',
            '',
            '```sql',
            entry.query || '',
            '```',
            '',
            (chrome.i18n.getMessage('sql_ai_fix_error_label') || 'NetSuite error:') + ' ' + (entry.errorMsg || '')
        ];
        if (info && info.line) {
            parts.push((chrome.i18n.getMessage('sql_ai_fix_pos_label') || 'Reported position:')
                + ' ' + (chrome.i18n.getMessage('sql_logs_at_line', [String(info.line), String(info.column)]) || ''));
        }

        const token = ++_fixSeq;
        const onResult = (ev) => {
            window.removeEventListener('nsft-ai-fix-sql-result', onResult);
            if (token !== _fixSeq) return;
            if (_selectedLogId !== entry.id) return;
            renderFixResult(entry, info, ev.detail || {});
        };
        window.addEventListener('nsft-ai-fix-sql-result', onResult);

        window.dispatchEvent(new CustomEvent('nsft-ai-fix-sql', {
            detail: { prompt: parts.join('\n') }
        }));
    }

    function renderFixResult(entry, info, res) {
        const slot = document.getElementById('nsft-sql-fix-slot');
        if (!slot) return;

        let sql = (res && res.sql) || '';
        let explain = '';

        if (res && res.ok) {
            explain = String(res.text || '')
                .replace(/<sql>[\s\S]*?<\/sql>/i, '')
                .replace(/```sql[\s\S]*?```/i, '')
                .trim();
            if (!sql) {
                const fenced = String(res.text || '').match(/```sql\s*([\s\S]*?)```/i);
                if (fenced) sql = fenced[1].trim();
            }
        }

        if (!sql) {
            const local = suggestSqlFix(entry.query, info);
            if (local && local.fixed) {
                sql = local.fixed;
                explain = explain || local.explain;
            }
        }

        if (!sql) {
            slot.innerHTML = `
                <div class="nsft-sql-fix-card is-error">
                    <div class="nsft-sql-fix-title">${AI_SPARK_SVG}${escapeHtml(
                        chrome.i18n.getMessage('sql_logs_fix_title') || 'Suggested fix')}</div>
                    <p class="nsft-sql-fix-explain">${escapeHtml(
                        (res && res.error) || explain
                        || chrome.i18n.getMessage('sql_logs_fix_none') || 'No fix could be produced.')}</p>
                    <div class="nsft-sql-fix-actions">
                        <button type="button" data-log-act="dismiss-fix">${escapeHtml(
                            chrome.i18n.getMessage('sql_logs_fix_dismiss') || 'Dismiss')}</button>
                    </div>
                </div>`;
            wireFixActions(slot, entry);
            return;
        }

        _pendingFix = { id: entry.id, fixed: normalizeForDiff(sql) };
        setTimeout(scrollFixCardIntoView, 0);
        slot.innerHTML = `
            <div class="nsft-sql-fix-card">
                <div class="nsft-sql-fix-title">${AI_SPARK_SVG}${escapeHtml(
                    chrome.i18n.getMessage('sql_logs_fix_title') || 'Suggested fix')}</div>
                ${explain ? `<p class="nsft-sql-fix-explain">${escapeHtml(explain)}</p>` : ''}
                
                <div class="nsft-sql-fix-diff">
                    <div class="nsft-sql-fix-actions">
                        <button type="button" class="is-primary" data-log-act="apply-fix">${escapeHtml(
                            chrome.i18n.getMessage('sql_logs_fix_apply') || 'Apply and run')}</button>
                        <button type="button" data-log-act="dismiss-fix">${escapeHtml(
                            chrome.i18n.getMessage('sql_logs_fix_dismiss') || 'Dismiss')}</button>
                    </div>
                    <div class="nsft-sql-fix-diff-body">${renderSqlDiff(entry.query || '', sql)}</div>
                </div>
            </div>`;
        wireFixActions(slot, entry);
    }

    function scrollFixCardIntoView() {
        const body = document.querySelector('.nsft-sql-logs-detail');
        const slot = document.getElementById('nsft-sql-fix-slot');
        if (!body || !slot) return;

        body.scrollTop = 0;

        const br = body.getBoundingClientRect();
        const sr = slot.getBoundingClientRect();
        if (!br.height || !sr.height) return;
        if (sr.top > br.bottom - 40) body.scrollTop += (sr.top - br.top) - 8;
    }

    function showRunnerConfirm(opts) {
        const o = opts || {};
        return new Promise((resolve) => {
            const host = document.getElementById('nsft-sql-modal');
            if (!host) { resolve(window.confirm(o.body || '')); return; }

            const prev = document.getElementById('nsft-sql-confirm-dialog');
            if (prev) prev.remove();

            const overlay = document.createElement('div');
            overlay.id = 'nsft-sql-confirm-dialog';
            overlay.className = 'nsft-sql-dialog nsft-sql-confirm';

            const box = document.createElement('div');
            box.className = 'nsft-sql-confirm-box';

            const h = document.createElement('h3');
            h.textContent = o.title || '';
            const p = document.createElement('p');
            p.className = 'nsft-sql-confirm-body';
            p.textContent = o.body || '';

            const acts = document.createElement('div');
            acts.className = 'nsft-sql-confirm-actions';
            const cancel = document.createElement('button');
            cancel.type = 'button';
            cancel.textContent = o.cancelLabel || chrome.i18n.getMessage('sql_confirm_cancel') || 'Cancelar';
            const ok = document.createElement('button');
            ok.type = 'button';
            ok.className = 'is-primary' + (o.danger ? ' is-danger' : '');
            ok.textContent = o.confirmLabel || 'OK';

            acts.appendChild(cancel);
            acts.appendChild(ok);
            box.appendChild(h);
            if (o.body) box.appendChild(p);

            let rememberBox = null;
            if (o.rememberLabel) {
                const rl = document.createElement('label');
                rl.className = 'nsft-sql-confirm-remember';
                rememberBox = document.createElement('input');
                rememberBox.type = 'checkbox';
                const rt = document.createElement('span');
                rt.textContent = o.rememberLabel;
                rl.appendChild(rememberBox);
                rl.appendChild(rt);
                box.appendChild(rl);
            }

            box.appendChild(acts);
            overlay.appendChild(box);
            host.appendChild(overlay);

            let done = false;
            const close = (val) => {
                if (done) return;
                done = true;
                document.removeEventListener('keydown', onKey, true);
                const remember = !!(rememberBox && rememberBox.checked);
                overlay.remove();
                resolve(o.rememberLabel ? { ok: val, remember } : val);
            };
            const onKey = (ev) => {
                if (ev.key !== 'Escape') return;
                ev.preventDefault();
                ev.stopPropagation();
                close(false);
            };
            overlay.addEventListener('click', (ev) => { if (ev.target === overlay) close(false); });
            cancel.addEventListener('click', () => close(false));
            ok.addEventListener('click', () => close(true));
            document.addEventListener('keydown', onKey, true);

            setTimeout(() => { try { cancel.focus(); } catch (e) { } }, 20);
        });
    }

    function wireFixActions(slot, entry) {
        slot.querySelectorAll('[data-log-act]').forEach((btn) => {
            btn.addEventListener('click', () => {
                const act = btn.getAttribute('data-log-act');
                if (act === 'dismiss-fix') { slot.innerHTML = ''; _pendingFix = null; }
                else if (act === 'apply-fix' && _pendingFix && editor) {
                    editor.setValue(_pendingFix.fixed);
                    executeCurrentQuery();
                }
            });
        });
    }

    function normalizeForDiff(sql) {
        const s = String(sql || '');
        try {
            if (window.sqlFormatter && typeof window.sqlFormatter.format === 'function') {
                return window.sqlFormatter.format(s, { language: 'sql', keywordCase: 'upper', indent: '  ' });
            }
        } catch (e) { }
        return s;
    }

    function renderSqlDiff(oldSql, newSql) {
        const a = normalizeForDiff(oldSql).split('\n');
        const b = normalizeForDiff(newSql).split('\n');
        const n = a.length, m = b.length;

        const L = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
        for (let i = n - 1; i >= 0; i--) {
            for (let j = m - 1; j >= 0; j--) {
                L[i][j] = a[i].trim() === b[j].trim()
                    ? L[i + 1][j + 1] + 1
                    : Math.max(L[i + 1][j], L[i][j + 1]);
            }
        }

        const rows = [];
        let i = 0, j = 0;
        while (i < n && j < m) {
            if (a[i].trim() === b[j].trim()) { rows.push(['ctx', a[i]]); i++; j++; }
            else if (L[i + 1][j] >= L[i][j + 1]) { rows.push(['del', a[i]]); i++; }
            else { rows.push(['add', b[j]]); j++; }
        }
        while (i < n) { rows.push(['del', a[i++]]); }
        while (j < m) { rows.push(['add', b[j++]]); }

        return rows
            .filter((r) => r[1].trim() || r[0] !== 'ctx')
            .map(([kind, text]) => `<div class="nsft-sql-fix-${kind}">${highlightSql(text)}</div>`)
            .join('');
    }

    function deleteLogEntry(entry) {
        _sqlLogs = _sqlLogs.filter((e) => e.id !== entry.id);
        if (_selectedLogId === entry.id) _selectedLogId = null;

        if (entry.seeded && entry.histAt) {
            loadHistory((hist) => {
                saveHistory((hist || []).filter(
                    (h) => !(h && h.executedAt === entry.histAt && h.query === entry.query)));
            });
        }
        renderLogsList();
        renderLogDetail();
    }

    function clearAllLogs() {
        showRunnerConfirm({
            title: chrome.i18n.getMessage('sql_logs_clear') || 'Borrar todo',
            body: chrome.i18n.getMessage('sql_logs_clear_confirm') || '',
            confirmLabel: chrome.i18n.getMessage('sql_logs_clear') || 'Borrar todo',
            danger: true
        }).then((ok) => {
            if (!ok) return;
            _sqlLogs = [];
            _selectedLogId = null;
            _unseenErrors = 0;
            clearHistory(() => {
                renderLogsBadge();
                renderLogsList();
                renderLogDetail();
            });
        });
    }

    function copyText(text) {
        if (window.NSFT_Clipboard && NSFT_Clipboard.copy) {
            NSFT_Clipboard.copy(text, { toast: true });
        } else if (navigator.clipboard) {
            navigator.clipboard.writeText(text);
        }
    }

    function initPanelTabs() {
        document.querySelectorAll('.nsft-sql-panel-tab').forEach((btn) => {
            if (btn.dataset.wired) return;
            btn.dataset.wired = '1';
            btn.addEventListener('click', () => switchPanelTab(btn.getAttribute('data-panel-tab')));
        });

        const clearBtn = document.getElementById('nsft-sql-logs-clear');
        if (clearBtn && !clearBtn.dataset.wired) {
            clearBtn.dataset.wired = '1';
            clearBtn.addEventListener('click', clearAllLogs);
        }

        const errCta = document.getElementById('nsft-sql-results-error-cta');
        if (errCta && !errCta.dataset.wired) {
            errCta.dataset.wired = '1';
            errCta.addEventListener('click', () => switchPanelTab('logs'));
        }

        const filterInput = document.getElementById('nsft-sql-logs-filter');
        if (filterInput && !filterInput.dataset.wired) {
            filterInput.dataset.wired = '1';
            filterInput.addEventListener('input', () => {
                _logQuery = filterInput.value || '';
                renderLogsList();
            });
        }

        document.querySelectorAll('.nsft-sql-logs-chip').forEach((chip) => {
            if (chip.dataset.wired) return;
            chip.dataset.wired = '1';
            chip.addEventListener('click', () => {
                _logFilter = chip.getAttribute('data-log-filter') || 'all';
                renderLogsList();
            });
        });

        if (!_aiAvailWired) {
            _aiAvailWired = true;
            window.addEventListener('nsft-ai-availability', () => {
                if (_selectedLogId) renderLogDetail();
            });
        }
        initLogsResizer();
        renderLogsList();
        renderLogDetail();
        seedLogsFromHistory();
    }

    const LOGS_SPLIT_KEY = 'nsft_sql_logs_split_pct';

    function initLogsResizer() {
        const resizer = document.getElementById('nsft-sql-logs-resizer');
        const side = document.querySelector('.nsft-sql-logs-side');
        const view = document.getElementById('nsft-sql-logs-view');
        if (!resizer || !side || !view || resizer.dataset.wired) return;
        resizer.dataset.wired = '1';

        const MIN_PCT = 20, MAX_PCT = 70;
        const applyPct = (pct) => {
            side.style.flex = '0 0 ' + pct + '%';
            side.style.maxWidth = 'none';
        };

        try {
            chrome.storage.local.get([LOGS_SPLIT_KEY], (it) => {
                const pct = Number(it && it[LOGS_SPLIT_KEY]);
                if (pct >= MIN_PCT && pct <= MAX_PCT) applyPct(pct);
            });
        } catch (e) { }

        let dragging = false;

        const onMove = (e) => {
            if (!dragging) return;
            const r = view.getBoundingClientRect();
            if (!r.width) return;
            let pct = ((e.clientX - r.left) / r.width) * 100;
            pct = Math.max(MIN_PCT, Math.min(MAX_PCT, pct));
            applyPct(pct);
        };

        const onUp = () => {
            if (!dragging) return;
            dragging = false;
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
            resizer.classList.remove('is-dragging');
            try {
                const r = view.getBoundingClientRect();
                const w = side.getBoundingClientRect().width;
                if (r.width > 0 && w > 0) {
                    const pct = Math.max(MIN_PCT, Math.min(MAX_PCT, Math.round((w / r.width) * 100)));
                    chrome.storage.local.set({ [LOGS_SPLIT_KEY]: pct });
                }
            } catch (e) { }
        };

        resizer.addEventListener('mousedown', (e) => {
            dragging = true;
            document.body.style.cursor = 'col-resize';
            document.body.style.userSelect = 'none';
            resizer.classList.add('is-dragging');
            e.preventDefault();
        });
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);

        resizer.addEventListener('keydown', (e) => {
            const step = e.shiftKey ? 5 : 2;
            if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
            e.preventDefault();
            const r = view.getBoundingClientRect();
            const cur = (side.getBoundingClientRect().width / r.width) * 100;
            const pct = Math.max(MIN_PCT, Math.min(MAX_PCT, cur + (e.key === 'ArrowRight' ? step : -step)));
            applyPct(pct);
            try { chrome.storage.local.set({ [LOGS_SPLIT_KEY]: Math.round(pct) }); } catch (err) { }
        });
    }

    function logToToolbar(msg, type = 'info') {
        const container = document.getElementById('nsft-sql-logs-container');
        if (!container) return;

        const icons = {
            info: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>',
            warning: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>',
            error: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>',
            success: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>'
        };

        const iconSvg = icons[type] || icons.info;

        const newItem = document.createElement('div');
        newItem.classList.add('nsft-sql-log-item');
        newItem.classList.add(type);

        newItem.innerHTML = `${iconSvg}<div class="nsft-sql-log-content"><span>${escapeHtml(msg)}</span></div>`;
        newItem.title = msg;

        container.appendChild(newItem);

        const activeItem = container.querySelector('.nsft-sql-log-item.active');
        if (activeItem) {
            activeItem.classList.remove('active');
            activeItem.classList.add('exit');
            setTimeout(() => {
                if (activeItem.parentNode === container) {
                    container.removeChild(activeItem);
                }
            }, 300);
        }

        void newItem.offsetWidth;

        newItem.classList.add('active');

        setTimeout(() => {
            const contentWrapper = newItem.querySelector('.nsft-sql-log-content');
            const span = contentWrapper.querySelector('span');
            const containerWidth = contentWrapper.offsetWidth;
            const textWidth = span.offsetWidth;

            if (textWidth > containerWidth) {
                const distance = containerWidth - textWidth - 5;
                const duration = Math.abs(distance) / 30;

                newItem.style.setProperty('--marquee-distance', `${distance}px`);
                newItem.style.setProperty('--marquee-duration', `${Math.max(3, duration)}s`);
                newItem.classList.add('marquee-active');
            }
        }, 50);
    }


    let _rounds = null;
    let _askedThisRun = false;

    async function handleRoundResults(p) {
        if (!_rounds) _rounds = { rows: [], asked: false, started: Date.now(), count: 0 };
        _rounds.rows = _rounds.rows.concat(p.data || []);
        if (!_rounds.columns && p.columns) _rounds.columns = p.columns;
        if (Number(p.count) > 0) _rounds.count = Number(p.count);

        const total = Math.min(_rounds.count || 0, MAX_RECORDS_FETCH);
        reportRunProgress(_rounds.rows.length, total);

        const finish = (stopReason) => {
            const acc = _rounds;
            _rounds = null;
            handleExtensionMessage({
                type: 'results',
                payload: {
                    data: acc.rows, count: acc.count || p.count || acc.rows.length,
                    executionTime: Date.now() - acc.started,
                    query: p.query, columns: acc.columns || p.columns || null,
                    stopReason
                }
            });
        };

        if (_stopRequested) { finish('user'); return; }

        if (!_rounds.asked && _rounds.rows.length >= ROWS_CONFIRM_THRESHOLD) {
            _rounds.asked = true;
            const seguir = await askKeepFetching(_rounds.rows.length, total);
            if (!seguir) { finish('user'); return; }
        }

        if (_stopRequested) { finish('user'); return; }

        window.postMessage({
            type: 'execute_SQL', dest: 'fetcher_sql',
            payload: {
                query: p.query,
                maxRecords: MAX_RECORDS_FETCH,
                fromPage: p.nextPage,
                pageSize: p.pageSize || undefined,
                rowsSoFar: _rounds ? _rounds.rows.length : 0
            }
        }, '*');
    }

    function handleExtensionMessage(message) {
        if (message.type === 'notice') {
            const permitidas = ['sql_slow_no_order'];
            const key = message.payload && message.payload.key;
            if (permitidas.indexOf(key) !== -1) {
                logToToolbar(chrome.i18n.getMessage(key) || key, 'warning');
            }
            return;
        }
        if (message.type === 'progress') {
            reportGovernance(message.payload && message.payload.units);
            const n = Number(message.payload && message.payload.fetched);
            if (Number.isFinite(n)) {
                reportRunProgress(n, _runTotal);
                if (!_askedThisRun && n >= ROWS_CONFIRM_THRESHOLD) {
                    _askedThisRun = true;
                    askKeepFetching(n, _runTotal || 0).then((seguir) => {
                        if (seguir) return;
                        window.postMessage({ type: 'stop_SQL', dest: 'fetcher_sql' }, '*');
                    });
                }
            }
            return;
        }
        if (message.type === 'results') {
            const p = message.payload;
            if (p && p.nextPage !== null && p.nextPage !== undefined) { handleRoundResults(p); return; }
            if (_rounds) {
                p.data = _rounds.rows.concat(p.data || []);
                p.columns = p.columns || _rounds.columns || null;
                p.executionTime = Date.now() - _rounds.started;
                if (!(Number(p.count) > 0)) p.count = _rounds.count || p.data.length;
                _rounds = null;
            }
        }
        if (message.type === 'results') {
            const { data, count, executionTime, query, columns, stopReason } = message.payload;
            const logMsg = chrome.i18n.getMessage('sql_results_log', [fmtNum(data.length), fmtNum(count), String(executionTime)]) || `Results: ${fmtNum(data.length)} rows (Total: ${fmtNum(count)}) - ${executionTime}ms`;
            logToToolbar(logMsg, 'success');

            if (typeof count === 'number' && count > data.length) {
                const key = stopReason === 'max' ? 'sql_rows_capped_max'
                    : stopReason === 'user' ? 'sql_rows_capped_user'
                        : stopReason === 'governance' ? 'sql_rows_capped_gov'
                            : stopReason === 'limit' ? 'sql_rows_capped_limit'
                                : 'sql_rows_capped_guard';
                const ref = stopReason === 'max' ? count : fetchDenominator(count, data.length);
                logToToolbar(
                    chrome.i18n.getMessage(key, [fmtNum(data.length), fmtNum(ref)])
                    || (data.length + ' / ' + ref),
                    stopReason === 'user' ? 'info' : 'warning'
                );
            } else if (stopReason && stopReason !== 'complete') {
                const key = stopReason === 'user' ? 'sql_rows_capped_user_unknown' : 'sql_rows_capped_unknown';
                logToToolbar(
                    chrome.i18n.getMessage(key, [fmtNum(data.length)])
                    || (data.length + ' rows, more available'),
                    stopReason === 'user' ? 'info' : 'warning'
                );
            }

            _runPhase = 'rendering';
            _runFetched = data.length;
            paintRunStatus();

            afterPaint().then(() => {
                updateResultTable(data, count, executionTime, columns, query || _lastRunQuery, stopReason);
                _runPhase = 'idle';
                updateLastHistoryEntry({ status: 'ok', rows: data.length, durationMs: executionTime, errorMsg: null, via: _runVia });
                setRunState('ok', {
                    rows: data.length,
                    total: fetchDenominator(count, data.length),
                    ms: executionTime
                });
                addRunLog({
                    status: 'ok',
                    query: query || _lastRunQuery,
                    rows: data.length,
                    durationMs: executionTime,
                    via: _runVia
                });
            });
        } else if (message.type === 'error') {
            const rawText = message.text || '';
            const info = describeSqlError(rawText);
            const detail = info.explain || rawText;
            logToToolbar(chrome.i18n.getMessage('sql_error_log', [detail]) || `Error: ${detail}`, 'error');
            updateLastHistoryEntry({ status: 'error', errorMsg: rawText });

            if (resultTable) {
                try { resultTable.clearData(); } catch (e) { }
                try { resultTable.setColumns([]); } catch (e) { }
            }
            const truncBanner = document.getElementById('nsft-sql-trunc-banner');
            if (truncBanner) { truncBanner.hidden = true; truncBanner.textContent = ''; }
            setRunState('error');
            addRunLog({
                status: 'error',
                query: _lastRunQuery,
                errorMsg: rawText,
                hint: info.hint,
                via: _runVia
            }, { reveal: true });
        } else if (message.type === 'resolved_scriptid') {
            const p = message.payload || {};
            const scriptid = (p.scriptid && /^[a-z0-9_]+$/i.test(p.scriptid)) ? p.scriptid : null;
            const recordId = (p.recordId != null && /^\d+$/.test(String(p.recordId))) ? String(p.recordId) : null;
            if (scriptid && recordId) {
                createTab({
                    title: chrome.i18n.getMessage('sql_tab_record_title') || 'Record',
                    query: `SELECT * FROM ${scriptid} WHERE id = ${recordId}`
                });
            } else {
                logToToolbar(chrome.i18n.getMessage('sql_resolve_scriptid_fail') || 'Could not resolve the record type scriptid', 'error');
            }
        }
    }

    function resolveAndPrefillRecord(rectype, id) {
        const fetcherScriptId = 'nsft-suiteql-fetcher-script';
        const send = () => window.postMessage({
            type: 'resolve_scriptid', dest: 'fetcher_sql', payload: { rectype, id }
        }, '*');
        if (document.getElementById(fetcherScriptId)) {
            send();
            return;
        }
        const script = document.createElement('script');
        script.id = fetcherScriptId;
        script.src = chrome.runtime.getURL('scripts/modules/suiteql_runner/suiteql_fetcher.js');
        script.onload = () => setTimeout(send, 200);
        (document.head || document.documentElement).appendChild(script);
    }

    let editor;
    let resultTable;
    let sqlHintTables = {};
    let failedTables = new Set();
    let userRemovedTables = new Set();
    let sqlTableMeta = {};

    function normalizeTableName(t) {
        return t ? String(t).toLowerCase() : '';
    }

    function addSqlTable(tableName, fields) {
        tableName = normalizeTableName(tableName);
        if (!tableName || !Array.isArray(fields)) return;

        if (!sqlHintTables[tableName]) {
            sqlHintTables[tableName] = [];
        }

        const cols = sqlHintTables[tableName];

        cols.length = 0;
        const isObjectList = fields.length > 0 && typeof fields[0] === 'object';
        const list = isObjectList ? fields : fields.slice().sort();
        list.forEach(f => cols.push(f));
    }

    function getDataTypeIcon(t) {
        if (!t) return '?';
        switch (t) {
            case 'DATE': case 'DATETIME': case 'TIMEOFDAY': return 'D';
            case 'BOOLEAN': case 'CHECKBOX': return '✓';
            case 'INTEGER': case 'FLOAT': case 'NUMBER': return '#';
            case 'CURRENCY': return '$';
            case 'PERCENT': return '%';
            case 'STRING': case 'TEXT': return 'A';
            case 'SELECT': case 'MULTISELECT': return '▾';
            default: return '·';
        }
    }

    let _hintsTagObserver = null;

    function tagHintsPopup() {
        document.querySelectorAll('.CodeMirror-hints:not(.nsft-sql-hints)')
            .forEach(el => el.classList.add('nsft-sql-hints'));
    }

    function watchHintsPopup() {
        tagHintsPopup();
        if (_hintsTagObserver || typeof MutationObserver === 'undefined') return;
        _hintsTagObserver = new MutationObserver(tagHintsPopup);
        _hintsTagObserver.observe(document.body, { childList: true });
    }

    function buildJoinHintRenderer(join, needleLc) {
        return function (element) {
            element.classList.add('nsft-sql-hint-row', 'nsft-sql-hint-join-row');

            const icon = document.createElement('span');
            icon.className = 'nsft-sql-hint-icon nsft-sql-hint-icon-JOIN';
            icon.textContent = '→';
            element.appendChild(icon);

            const id = document.createElement('span');
            id.className = 'nsft-sql-hint-id';
            appendHighlighted(id, join.id, needleLc);
            element.appendChild(id);

            if (join.targetLabel && join.targetLabel !== join.id) {
                const label = document.createElement('span');
                label.className = 'nsft-sql-hint-label';
                label.textContent = ' → ' + join.targetLabel;
                element.appendChild(label);
            }

            const type = document.createElement('span');
            type.className = 'nsft-sql-hint-type';
            type.textContent = join.cardinality || 'JOIN';
            element.appendChild(type);
        };
    }

    const HINT_MAX = 60;

    function hintRank(id, needleLc) {
        if (!needleLc) return 0;
        const idx = tsFold(id).indexOf(tsFold(needleLc));
        return idx < 0 ? -1 : (idx === 0 ? 0 : 1);
    }

    function matchByRelevance(items, needleLc) {
        return items
            .map(it => ({ it, rank: hintRank(it.id, needleLc) }))
            .filter(x => x.rank !== -1)
            .sort((a, b) => a.rank - b.rank || String(a.it.id).localeCompare(String(b.it.id)))
            .map(x => x.it);
    }

    function appendHighlighted(parent, text, needleLc) {
        const str = String(text == null ? '' : text);
        if (!needleLc || !str) { parent.appendChild(document.createTextNode(str)); return; }

        const TS = window.NSFT_TextSearch;
        let tramos;
        if (TS) {
            tramos = TS.ranges(str, needleLc);
        } else {
            const i = str.toLowerCase().indexOf(String(needleLc).toLowerCase());
            tramos = i < 0 ? [] : [{ start: i, end: i + needleLc.length }];
        }
        if (!tramos.length) { parent.appendChild(document.createTextNode(str)); return; }

        let desde = 0;
        tramos.forEach((r) => {
            if (r.start > desde) parent.appendChild(document.createTextNode(str.slice(desde, r.start)));
            const mark = document.createElement('span');
            mark.className = 'nsft-sql-hint-mark';
            mark.textContent = str.slice(r.start, r.end);
            parent.appendChild(mark);
            desde = r.end;
        });
        if (desde < str.length) parent.appendChild(document.createTextNode(str.slice(desde)));
    }

    function buildHintRenderer(field, needleLc) {
        return function (element) {
            element.classList.add('nsft-sql-hint-row');

            const icon = document.createElement('span');
            icon.className = `nsft-sql-hint-icon nsft-sql-hint-icon-${field.dataType || 'UNKNOWN'}`;
            icon.textContent = getDataTypeIcon(field.dataType);
            element.appendChild(icon);

            const id = document.createElement('span');
            id.className = 'nsft-sql-hint-id';
            appendHighlighted(id, field.id, needleLc);
            element.appendChild(id);

            const hasUsefulLabel = field.label
                && field.label !== field.id
                && !/^\[Missing Label:/i.test(field.label);
            if (hasUsefulLabel) {
                const label = document.createElement('span');
                label.className = 'nsft-sql-hint-label';
                label.textContent = ' — ' + field.label;
                element.appendChild(label);
            }

            if (field.dataType) {
                const type = document.createElement('span');
                type.className = 'nsft-sql-hint-type';
                type.textContent = field.dataType;
                element.appendChild(type);
            }
        };
    }

    const SCHEMA_INDEX_KEY = 'nsft_sql_schema_index';
    const SCHEMA_ENTRY_PREFIX = 'nsft_sql_schema__';
    const SCHEMA_LEGACY_KEY = 'nsft_sql_schema_cache';
    const SCHEMA_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

    function schemaEntryKey(accountId, tableName) {
        return SCHEMA_ENTRY_PREFIX + accountId + '__' + tableName;
    }

    function parseSchemaEntryKey(key) {
        if (key.indexOf(SCHEMA_ENTRY_PREFIX) !== 0) return null;
        const rest = key.slice(SCHEMA_ENTRY_PREFIX.length);
        const sep = rest.indexOf('__');
        if (sep <= 0) return null;
        const table = rest.slice(sep + 2);
        if (!table) return null;
        return { account: rest.slice(0, sep), table: table };
    }

    function getNsAccountId() {
        const m = location.hostname.match(/^([a-z0-9]+(?:[-_][a-z0-9]+)*)\./i);
        return m ? m[1].toLowerCase() : location.hostname.toLowerCase();
    }

    let _skipCacheSave = 0;

    let _cacheWriteChain = Promise.resolve();

    let _schemaStoreReady = null;
    function readySchemaStore() {
        if (_schemaStoreReady) return _schemaStoreReady;
        _schemaStoreReady = new Promise((resolve) => {
            chrome.storage.local.get([SCHEMA_LEGACY_KEY, SCHEMA_INDEX_KEY], (items) => {
                const legacy = items[SCHEMA_LEGACY_KEY];
                if (!legacy || typeof legacy !== 'object') { resolve(); return; }
                const write = {};
                const index = items[SCHEMA_INDEX_KEY] || {};
                Object.keys(legacy).forEach((acct) => {
                    const tables = legacy[acct] || {};
                    Object.keys(tables).forEach((t) => {
                        const e = tables[t];
                        if (!e || !e.rawData || !e.ts) return;
                        write[schemaEntryKey(acct, t)] = { rawData: e.rawData, ts: e.ts };
                        if (!index[acct]) index[acct] = {};
                        if (!index[acct][t]) {
                            index[acct][t] = { ts: e.ts, label: (e.rawData && e.rawData.label) || '' };
                        }
                    });
                });
                write[SCHEMA_INDEX_KEY] = index;
                chrome.storage.local.set(write, () => {
                    chrome.storage.local.remove([SCHEMA_LEGACY_KEY], resolve);
                });
            });
        });
        return _schemaStoreReady;
    }

    function trimSchemaForCache(data) {
        if (!data || typeof data !== 'object') return data;
        const arr = (v) => (Array.isArray(v) && v.length ? v : undefined);
        const tipo = (st) => (st ? { id: st.id, label: st.label } : undefined);
        return {
            id: data.id,
            label: data.label,
            recordClass: data.recordClass,
            fields: Array.isArray(data.fields) ? data.fields.map((f) => ({
                id: f.id,
                label: f.label,
                dataType: f.dataType,
                fieldType: f.fieldType,
                isAvailable: f.isAvailable === false ? false : undefined,
                removed: f.removed === true ? true : undefined,
                isColumn: f.isColumn === false ? false : undefined,
                availabilityDetails: arr(f.availabilityDetails),
                features: arr(f.features),
                permissions: arr(f.permissions),
                joins: arr((f.joins || []).map((j) => ({
                    id: j.id,
                    fieldId: j.fieldId,
                    cardinality: j.cardinality,
                    sourceTargetType: tipo(j.sourceTargetType)
                })))
            })) : [],
            joins: arr((data.joins || []).map((j) => ({
                id: j.id,
                fieldId: j.fieldId,
                cardinality: j.cardinality,
                joinType: j.joinType,
                isAvailable: j.isAvailable === false ? false : undefined,
                sourceTargetType: j.sourceTargetType ? {
                    id: j.sourceTargetType.id,
                    label: j.sourceTargetType.label,
                    joinPairs: arr((j.sourceTargetType.joinPairs || []).map((p) => ({ label: p.label })))
                } : undefined
            })))
        };
    }

    function saveSchemaToCache(tableName, rawData) {
        if (_skipCacheSave) return;
        tableName = normalizeTableName(tableName);
        if (!tableName) return;
        const accountId = getNsAccountId();
        const stored = trimSchemaForCache(rawData);
        const ts = Date.now();
        _cacheWriteChain = _cacheWriteChain.then(readySchemaStore).then(() => new Promise((resolve) => {
            chrome.storage.local.get([SCHEMA_INDEX_KEY], (items) => {
                const index = items[SCHEMA_INDEX_KEY] || {};
                if (!index[accountId]) index[accountId] = {};
                index[accountId][tableName] = { ts: ts, label: (stored && stored.label) || '' };
                chrome.storage.local.set({
                    [schemaEntryKey(accountId, tableName)]: { rawData: stored, ts: ts },
                    [SCHEMA_INDEX_KEY]: index
                }, () => {
                    const err = chrome.runtime.lastError;
                    if (err) {
                        console.warn('NSFT: no se pudo guardar el esquema de ' + tableName, err.message || err);
                        logToToolbar(
                            chrome.i18n.getMessage('sql_cache_save_failed', [tableName])
                            || ('No se pudo guardar en caché el esquema de ' + tableName),
                            'warning'
                        );
                    }
                    resolve();
                });
            });
        }));
    }

    function saveSchemaBatch(list) {
        if (!list || !list.length) return Promise.resolve();
        const accountId = getNsAccountId();
        const ts = Date.now();
        const write = {};
        const meta = [];
        list.forEach((it) => {
            const t = normalizeTableName(it.tableName);
            if (!t || !it.rawData) return;
            const stored = trimSchemaForCache(it.rawData);
            write[schemaEntryKey(accountId, t)] = { rawData: stored, ts: ts };
            meta.push({ t: t, label: (stored && stored.label) || '' });
        });
        if (!meta.length) return Promise.resolve();
        _cacheWriteChain = _cacheWriteChain.then(readySchemaStore).then(() => new Promise((resolve) => {
            chrome.storage.local.get([SCHEMA_INDEX_KEY], (items) => {
                const index = items[SCHEMA_INDEX_KEY] || {};
                if (!index[accountId]) index[accountId] = {};
                meta.forEach((m) => { index[accountId][m.t] = { ts: ts, label: m.label }; });
                write[SCHEMA_INDEX_KEY] = index;
                chrome.storage.local.set(write, () => {
                    const err = chrome.runtime.lastError;
                    if (err) console.warn('NSFT: fallo guardando un bloque de esquemas', err.message || err);
                    resolve();
                });
            });
        }));
        return _cacheWriteChain;
    }

    function loadSchemaIndex(cb) {
        const accountId = getNsAccountId();
        readySchemaStore().then(() => {
            chrome.storage.local.get([SCHEMA_INDEX_KEY], (items) => {
                cb((items[SCHEMA_INDEX_KEY] || {})[accountId] || {}, accountId);
            });
        });
    }

    function loadSchemaFromCache(cb, only) {
        loadSchemaIndex((index, accountId) => {
            const names = (only ? only.map(normalizeTableName) : Object.keys(index))
                .filter((t) => t && index[t]);
            if (!names.length) { cb({}, [], {}); return; }
            const keys = names.map((t) => schemaEntryKey(accountId, t));
            chrome.storage.local.get(keys, (entries) => {
                const now = Date.now();
                const fresh = {};
                const stale = [];
                const stamps = {};
                names.forEach((tableName) => {
                    const entry = entries[schemaEntryKey(accountId, tableName)];
                    if (!entry || !entry.ts || !entry.rawData) return;
                    fresh[tableName] = entry.rawData;
                    stamps[tableName] = entry.ts;
                    if ((now - entry.ts) >= SCHEMA_CACHE_TTL_MS) stale.push(tableName);
                });
                cb(fresh, stale, stamps);
            });
        });
    }

    let _schemaIndexMem = {};

    function refreshSchemaIndexMem(cb) {
        loadSchemaIndex((index) => {
            _schemaIndexMem = index || {};
            if (typeof paintBulkButton === 'function') paintBulkButton();
            if (cb) cb();
        });
    }

    function ensureTableInMemory(tableName) {
        tableName = normalizeTableName(tableName);
        if (!tableName || sqlTableMeta[tableName]) return Promise.resolve(false);
        if (!_schemaIndexMem[tableName]) return Promise.resolve(false);
        return new Promise((resolve) => {
            loadSchemaFromCache((cached, stale, stamps) => {
                const raw = cached[tableName];
                if (!raw) { resolve(false); return; }
                _skipCacheSave++;
                try {
                    ingestSchemaResponse(tableName, raw, { deferUi: true });
                    if (stamps[tableName]) _schemaIngestTs[tableName] = stamps[tableName];
                } finally {
                    _skipCacheSave--;
                }
                resolve(true);
            }, [tableName]);
        });
    }

    function clearSchemaCache(tableName) {
        tableName = tableName ? normalizeTableName(tableName) : null;
        const accountId = getNsAccountId();
        _cacheWriteChain = _cacheWriteChain.then(readySchemaStore).then(() => new Promise((resolve) => {
            chrome.storage.local.get([SCHEMA_INDEX_KEY], (items) => {
                const index = items[SCHEMA_INDEX_KEY] || {};
                const acct = index[accountId];
                if (!acct) { resolve(); return; }
                const names = tableName ? [tableName] : Object.keys(acct);
                names.forEach((t) => { delete acct[t]; });
                if (!Object.keys(acct).length) delete index[accountId];
                chrome.storage.local.set({ [SCHEMA_INDEX_KEY]: index }, () => {
                    chrome.storage.local.remove(names.map((t) => schemaEntryKey(accountId, t)), resolve);
                });
            });
        }));
    }

    function walkFromClauses(content, cb) {
        const s = String(content || '');
        const re = /\bFROM\b/gi;
        const KW_FIN = /^(WHERE|GROUP|HAVING|ORDER|LIMIT|UNION|FETCH|MINUS|INTERSECT|EXCEPT|SELECT)$/;
        const KW_JOIN_PRE = /^(INNER|LEFT|RIGHT|OUTER|CROSS|FULL)$/;
        let m;
        while ((m = re.exec(s))) {
            let i = re.lastIndex;
            let depth = 0;
            let esperaTabla = true;
            let tabla = null;
            let trasAs = false;
            const cierra = () => { if (tabla) { cb(tabla.tok, null); tabla = null; } };
            while (i < s.length) {
                const c = s.charAt(i);
                if (/\s/.test(c)) { i++; continue; }
                if (c === '(') { depth++; i++; esperaTabla = false; continue; }
                if (c === ')') {
                    if (depth === 0) break;
                    depth--; i++; continue;
                }
                if (depth > 0) { i++; continue; }
                if (c === ',') { cierra(); esperaTabla = true; i++; continue; }
                const w = (s.slice(i).match(/^[A-Za-z0-9_."$]+/) || [''])[0];
                if (!w) { i++; continue; }
                const W = w.toUpperCase();
                if (KW_FIN.test(W)) break;
                if (KW_JOIN_PRE.test(W)) { i += w.length; continue; }
                if (W === 'JOIN') { cierra(); esperaTabla = true; i += w.length; continue; }
                if (W === 'ON' || W === 'USING') { cierra(); i += w.length; continue; }
                if (W === 'AS') { trasAs = true; i += w.length; continue; }
                if (esperaTabla) {
                    tabla = { tok: w };
                    esperaTabla = false;
                } else if (tabla) {
                    cb(tabla.tok, w);
                    tabla = null;
                    trasAs = false;
                }
                i += w.length;
            }
            cierra();
        }
    }

    function parseTablesFromQuery(content) {
        const tables = [];
        walkFromClauses(content, (tok) => {
            const tableName = String(tok || '').replace(/^"|"$/g, '');
            if (tableName && tableName.length > 1 && /^[a-z0-9_.]+$/i.test(tableName)) {
                tables.push(normalizeTableName(tableName));
            }
        });
        return tables;
    }

    function parseAliasMap(content) {
        const map = {};
        walkFromClauses(content, (tok, aliasTok) => {
            const table = normalizeTableName(String(tok || '').replace(/^"|"$/g, ''));
            if (!table || !/^[a-z0-9_.]+$/i.test(table)) return;
            const alias = String(aliasTok || '').replace(/[^a-z0-9_]/gi, '').toLowerCase();
            if (alias) map[alias] = table;
            map[table] = table;
        });
        return map;
    }

    function collectUsedAliases(content) {
        const map = parseAliasMap(content);
        const set = new Set(Object.keys(map));
        Object.values(map).forEach(t => set.add(t));
        return set;
    }

    function resolveChainedHint(editor) {
        if (typeof CodeMirror === 'undefined') return null;
        const cursor = editor.getCursor();
        const line = editor.getLine(cursor.line) || '';
        const upToCursor = line.slice(0, cursor.ch);

        const chainMatch = upToCursor.match(/([a-z_][a-z0-9_]*(?:\.[a-z_][a-z0-9_]*)*\.)([a-z_][a-z0-9_]*)?$/i);
        if (!chainMatch) return null;

        const chainWithTrailingDot = chainMatch[1];
        const typedPrefix = chainMatch[2] || '';
        const segments = chainWithTrailingDot.split('.').filter(Boolean);
        if (!segments.length) return null;

        const aliasMap = parseAliasMap(editor.getValue());
        const rootAlias = segments[0].toLowerCase();
        const rootTable = aliasMap[rootAlias] || normalizeTableName(rootAlias);
        if (!rootTable || !sqlTableMeta[rootTable]) return null;

        let currentTable = rootTable;
        for (let i = 1; i < segments.length; i++) {
            const joinName = segments[i];
            const meta = sqlTableMeta[currentTable];
            if (!meta) return null;
            let join = meta.joins[joinName];
            if (!join) {
                const lcName = joinName.toLowerCase();
                const found = Object.keys(meta.joins).find(k => k.toLowerCase() === lcName);
                join = found ? meta.joins[found] : null;
            }
            if (!join || !join.targetTable) return null;
            currentTable = join.targetTable;
            if (!sqlTableMeta[currentTable]) {
                if (AUTO_SCHEMA) fetchTableSchema(currentTable, { auto: true });
                return null;
            }
        }

        const meta = sqlTableMeta[currentTable];
        if (!meta) return null;

        const prefixLc = typedPrefix.toLowerCase();
        const list = [];
        const cap = prefixLc ? HINT_MAX : Infinity;

        matchByRelevance(
            Object.values(meta.fields).filter(f => f.isAvailable && !f.removed),
            prefixLc
        ).slice(0, cap).forEach(f => list.push({
            text: f.id,
            displayText: f.id,
            className: 'nsft-sql-hint-entry',
            render: buildHintRenderer(f, prefixLc)
        }));

        matchByRelevance(
            Object.values(meta.joins).filter(j => j.isAvailable),
            prefixLc
        ).slice(0, cap).forEach(j => list.push({
            text: j.id,
            displayText: j.id,
            className: 'nsft-sql-hint-entry nsft-sql-hint-join',
            render: buildJoinHintRenderer(j, prefixLc)
        }));

        if (!list.length) return null;

        const startCh = cursor.ch - typedPrefix.length;
        return {
            list,
            from: CodeMirror.Pos(cursor.line, startCh),
            to: CodeMirror.Pos(cursor.line, cursor.ch)
        };
    }

    const SUITEQL_BUILTINS = [
        { id: 'CF',               signature: '(field, recordType)',                 desc: 'Custom field value from a record type' },
        { id: 'CONSOLIDATE',      signature: '(field, consolidatedSub)',            desc: 'Consolidate balances into the target subsidiary currency' },
        { id: 'CURRENCY',         signature: '(field)',                             desc: 'Currency name / ISO code from a currency id' },
        { id: 'CURRENCY_CONVERT', signature: '(amount, fromCurrency, toCurrency, asOfDate)', desc: 'Convert an amount between two currencies on a given date' },
        { id: 'DF',               signature: '(field)',                             desc: 'Display value of a select / list field (the text, not the id)' },
        { id: 'HIERARCHY',        signature: '(field)',                             desc: 'Hierarchy path of a record (class, department, location, …)' },
        { id: 'MNFILTER',         signature: '(mainlineLevel)',                     desc: 'Legacy mainline filter expression' },
        { id: 'NAMED_GROUP',      signature: '(name)',                              desc: 'Reference a named row group defined elsewhere' },
        { id: 'PERIOD',           signature: '(field, type)',                       desc: 'Accounting period info (name, start / end date, etc.)' },
        { id: 'RELATIVE_RANGES',  signature: '(rangeName)',                         desc: 'Named date ranges (LAST_MONTH, YTD, THIS_YEAR, …)' }
    ];

    function buildBuiltinHintRenderer(fn) {
        return function (element) {
            element.classList.add('nsft-sql-hint-row', 'nsft-sql-hint-builtin-row');

            const icon = document.createElement('span');
            icon.className = 'nsft-sql-hint-icon nsft-sql-hint-icon-BUILTIN';
            icon.textContent = 'ƒ';
            element.appendChild(icon);

            const id = document.createElement('span');
            id.className = 'nsft-sql-hint-id';
            id.textContent = 'BUILTIN.' + fn.id;
            element.appendChild(id);

            const localizedDesc = chrome.i18n.getMessage('sql_builtin_' + fn.id + '_desc') || fn.desc;
            if (localizedDesc) {
                const label = document.createElement('span');
                label.className = 'nsft-sql-hint-label';
                label.textContent = ' — ' + localizedDesc;
                element.appendChild(label);
            }

            const type = document.createElement('span');
            type.className = 'nsft-sql-hint-type';
            type.textContent = 'FN';
            element.appendChild(type);
        };
    }

    function resolveBuiltinHint(editor) {
        if (typeof CodeMirror === 'undefined') return null;
        const cursor = editor.getCursor();
        const line = editor.getLine(cursor.line) || '';
        const upToCursor = line.slice(0, cursor.ch);

        const m = upToCursor.match(/\bBUILTIN\.([A-Z_]*)$/i);
        if (!m) return null;

        const typedPrefix = m[1].toUpperCase();
        const list = matchByRelevance(SUITEQL_BUILTINS, typedPrefix.toLowerCase())
            .map(fn => ({
                text: fn.id + fn.signature,
                displayText: 'BUILTIN.' + fn.id,
                className: 'nsft-sql-hint-entry nsft-sql-hint-builtin',
                render: buildBuiltinHintRenderer(fn)
            }));

        if (!list.length) return null;

        const startCh = cursor.ch - typedPrefix.length;
        return {
            list,
            from: CodeMirror.Pos(cursor.line, startCh),
            to: CodeMirror.Pos(cursor.line, cursor.ch)
        };
    }

    function augmentWithBuiltins(result, ed) {
        if (!result || !Array.isArray(result.list)) return result;
        const cursor = ed.getCursor();
        const token = ed.getTokenAt(cursor);
        const prefix = String(token.string || '').toUpperCase();

        SUITEQL_BUILTINS.forEach(fn => {
            const fullId = 'BUILTIN.' + fn.id;
            const match =
                !prefix
                || fn.id.includes(prefix)
                || fullId.includes(prefix)
                || 'BUILTIN'.includes(prefix);
            if (!match) return;
            result.list.push({
                text: fullId + fn.signature,
                displayText: fullId,
                className: 'nsft-sql-hint-entry nsft-sql-hint-builtin',
                render: buildBuiltinHintRenderer(fn)
            });
        });
        return result;
    }

    const SQL_CLAUSE_RE = /\b(SELECT|FROM|WHERE|JOIN|ON|GROUP|ORDER|HAVING|SET|INTO|VALUES|AND|OR)\b/gi;

    function lastClauseBefore(text) {
        let m, last = '';
        SQL_CLAUSE_RE.lastIndex = 0;
        while ((m = SQL_CLAUSE_RE.exec(text)) !== null) last = m[1].toUpperCase();
        return last;
    }

    function resolveSingleTableHint(editor) {
        if (typeof CodeMirror === 'undefined') return null;
        const cursor = editor.getCursor();
        const line = editor.getLine(cursor.line) || '';
        const upToCursor = line.slice(0, cursor.ch);

        const m = upToCursor.match(/(?:^|[^\w.$])([a-z_][a-z0-9_]*)?$/i);
        if (!m) return null;
        const typed = m[1] || '';

        const before = editor.getRange({ line: 0, ch: 0 }, cursor);
        const clause = lastClauseBefore(before);
        if (clause === 'FROM' || clause === 'JOIN' || !clause) return null;

        const tables = Array.from(new Set(parseTablesFromQuery(editor.getValue())));
        if (tables.length !== 1) return null;
        const meta = sqlTableMeta[tables[0]];
        if (!meta) return null;

        const needle = typed.toLowerCase();
        const cap = needle ? HINT_MAX : Infinity;
        const list = [];

        matchByRelevance(
            Object.values(meta.fields).filter(f => f.isAvailable && !f.removed && f.isColumn !== false),
            needle
        ).slice(0, cap).forEach(f => list.push({
            text: f.id,
            displayText: f.id,
            className: 'nsft-sql-hint-entry',
            render: buildHintRenderer(f, needle)
        }));

        if (!list.length) return null;

        const startCh = cursor.ch - typed.length;
        return {
            list,
            from: CodeMirror.Pos(cursor.line, startCh),
            to: CodeMirror.Pos(cursor.line, cursor.ch)
        };
    }

    function sqlHintWithChain(editor, options) {
        const builtin = resolveBuiltinHint(editor);
        if (builtin) return builtin;
        const chained = resolveChainedHint(editor);
        if (chained) return chained;
        const single = resolveSingleTableHint(editor);
        if (single) return single;
        let result = null;
        if (CodeMirror && CodeMirror.hint && CodeMirror.hint.sql) {
            result = CodeMirror.hint.sql(editor, options);
        }
        if (result) augmentWithBuiltins(result, editor);
        return result;
    }

    const _schemaIngestTs = {};
    chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== 'local') return;
        const accountId = getNsAccountId();
        let dirty = false;

        const idx = changes[SCHEMA_INDEX_KEY];
        if (idx) {
            _schemaIndexMem = (idx.newValue || {})[accountId] || {};
            paintBulkButton();
        }

        if (idx && idx.oldValue && idx.oldValue[accountId]
            && !(idx.newValue && idx.newValue[accountId])) {
            Object.keys(sqlTableMeta).forEach((t) => {
                delete sqlTableMeta[t];
                delete sqlHintTables[t];
                delete _schemaIngestTs[t];
                schemaExpanded.delete('T:' + t);
            });
            userRemovedTables.clear();
            failedTables.clear();
            renderSchemaTree();
            if (typeof runLint === 'function' && lintEnabled) runLint();
            return;
        }

        _skipCacheSave++;
        try {
            Object.keys(changes).forEach((key) => {
                const parsed = parseSchemaEntryKey(key);
                if (!parsed || parsed.account !== accountId) return;
                const t = parsed.table;
                const entry = changes[key].newValue;

                if (!entry || !entry.rawData) {
                    if (!sqlTableMeta[t] && !sqlHintTables[t]) return;
                    delete sqlTableMeta[t];
                    delete sqlHintTables[t];
                    delete _schemaIngestTs[t];
                    schemaExpanded.delete('T:' + t);
                    userRemovedTables.add(t);
                    dirty = true;
                    return;
                }

                if (userRemovedTables.has(t)) return;

                if (!sqlTableMeta[t]) return;
                if ((_schemaIngestTs[t] || 0) >= (entry.ts || 0)) return;
                _schemaIngestTs[t] = entry.ts || Date.now();
                ingestSchemaResponse(t, entry.rawData, { deferUi: true });
                dirty = true;
            });
        } finally {
            _skipCacheSave--;
        }
        if (dirty) {
            renderSchemaTree();
            if (typeof runLint === 'function' && lintEnabled) runLint();
        }
    });

    const CATALOG_CACHE_KEY = 'nsft_sql_catalog_cache';
    let catalogTables = null;
    let catalogLoading = false;

    function ensureCatalogLoaded() {
        if (catalogTables || catalogLoading) return;
        catalogLoading = true;
        chrome.storage.local.get([CATALOG_CACHE_KEY], (items) => {
            const c = items[CATALOG_CACHE_KEY];
            if (c && c.ts && (Date.now() - c.ts) < SCHEMA_CACHE_TTL_MS && Array.isArray(c.tables)) {
                catalogTables = c.tables;
                catalogLoading = false;
                renderCatalogResults();
                return;
            }
            const url = '/app/recordscatalog/rcendpoint.nl?action=getRecordTypes&data=' +
                encodeURIComponent(JSON.stringify({ structureType: 'FLAT' }));
            fetch(url)
                .then(res => { if (!res.ok) throw new Error('HTTP ' + res.status); return res.json(); })
                .then(json => {
                    const arr = (json && json.status === 'ok' && Array.isArray(json.data)) ? json.data : [];
                    catalogTables = arr
                        .map(t => ({ id: normalizeTableName(t.id), label: t.label || '' }))
                        .filter(t => t.id);
                    chrome.storage.local.set({ [CATALOG_CACHE_KEY]: { ts: Date.now(), tables: catalogTables } });
                })
                .catch(() => { catalogTables = []; })
                .finally(() => { catalogLoading = false; renderCatalogResults(); });
        });
    }

    let catalogQuery = '';
    let catalogIndex = 0;

    function catalogRowEls() {
        const box = document.getElementById('nsft-sql-schema-catalog-results');
        return box ? Array.from(box.querySelectorAll('.nsft-sql-schema-leaf-catalog')) : [];
    }

    function paintCatalogSelection(scroll) {
        const rows = catalogRowEls();
        if (!rows.length) return;
        if (catalogIndex < 0) catalogIndex = rows.length - 1;
        if (catalogIndex >= rows.length) catalogIndex = 0;
        rows.forEach((r, i) => r.classList.toggle('is-active', i === catalogIndex));
        if (scroll) rows[catalogIndex].scrollIntoView({ block: 'nearest' });
    }

    function moveCatalogSelection(delta) {
        const rows = catalogRowEls();
        if (!rows.length) return;
        catalogIndex += delta;
        paintCatalogSelection(true);
    }

    function activateCatalogSelection() {
        const rows = catalogRowEls();
        const row = rows[catalogIndex];
        if (row) row.click();
    }

    function toggleCatalogPop(show) {
        const pop = document.getElementById('nsft-sql-schema-catalog-pop');
        if (!pop) return;
        const willShow = (typeof show === 'boolean') ? show : pop.hidden;
        pop.hidden = !willShow;
        if (willShow) {
            document.querySelectorAll('#nsft-sql-modal .nsft-sql-favorites-menu.open')
                .forEach((m) => m.classList.remove('open'));
            const sidebar = document.getElementById('nsft-sql-schema-sidebar');
            const addBtn = document.getElementById('nsft-sql-schema-add');
            if (sidebar && addBtn) {
                const sr = sidebar.getBoundingClientRect();
                const br = addBtn.getBoundingClientRect();
                pop.style.top = br.top + 'px';
                pop.style.left = (sr.right + 6) + 'px';
            }
            ensureCatalogLoaded();
            renderCatalogResults();
            const input = document.getElementById('nsft-sql-schema-catalog-input');
            if (input) { input.value = catalogQuery; input.focus(); input.select(); }
        }
    }

    function catalogNorm(s) {
        return tsFold(s);
    }

    function openErdView() {
        const old = document.getElementById('nsft-sql-erd-overlay');
        if (old) {
            if (old._erdCleanup) { try { old._erdCleanup(); } catch (e) { } }
            old.remove();
            return;
        }
        const enSql = Object.values(parseAliasMap(editor ? editor.getValue() : ''))
            .filter((t, i, arr) => arr.indexOf(t) === i);
        const disponibles = Array.from(new Set(
            getLoadedTableNames().concat(Object.keys(_schemaIndexMem))
        )).sort();
        const tables = enSql.filter(t => sqlTableMeta[t]);

        const ctx = {
            all: disponibles,
            pos: {},
            view: { k: 1, tx: 0, ty: 0 },
            legendOpen: !tables.length,
            legendFilter: ''
        };

        const overlay = document.createElement('div');
        overlay.id = 'nsft-sql-erd-overlay';
        overlay.className = 'nsft-sql-erd-overlay';
        const head = document.createElement('div');
        head.className = 'nsft-sql-erd-head';
        head.innerHTML = '<span>' + escapeHtml(chrome.i18n.getMessage('sql_erd_title') || 'Diagrama de relaciones (tablas en caché)') + '</span>';
        const close = document.createElement('button');
        close.type = 'button';
        close.className = 'nsft-sql-schema-add';
        close.textContent = '✕';
        close.addEventListener('click', () => {
            if (overlay._erdCleanup) { try { overlay._erdCleanup(); } catch (e) { } }
            overlay.remove();
        });
        head.appendChild(close);
        overlay.appendChild(head);

        let visibles = tables.slice();
        ctx.render = () => {
            const prev = overlay.querySelector('.nsft-sql-erd-canvas, .nsft-sql-schema-empty');
            const nuevo = disponibles.length
                ? buildErdCanvas(visibles, ctx)
                : (() => {
                    const empty = document.createElement('div');
                    empty.className = 'nsft-sql-schema-empty';
                    empty.textContent = chrome.i18n.getMessage('sql_erd_empty')
                        || 'Agrega al menos una tabla a la caché para ver el diagrama.';
                    return empty;
                })();
            if (prev) prev.replaceWith(nuevo); else overlay.appendChild(nuevo);
        };

        ctx.toggle = (name, on) => {
            if (!on) {
                visibles = visibles.filter(t => t !== name);
                ctx.render();
                return;
            }
            if (visibles.indexOf(name) !== -1) return;
            const añadir = () => {
                if (!sqlTableMeta[name]) return;
                visibles = visibles.concat(name);
                ctx.render();
            };
            if (sqlTableMeta[name]) { añadir(); return; }
            ensureTableInMemory(name).then(añadir);
        };

        ctx.render();
        const host = document.getElementById('nsft-sql-modal') || document.body;
        host.appendChild(overlay);
    }

    function buildErdCanvas(tables, ctx) {
        ctx = ctx || { all: tables, pos: {}, view: { k: 1, tx: 0, ty: 0 }, legendOpen: false, legendFilter: '' };
        const WW = 4000, WH = 3000, CW = 230;
        const NS = 'http://www.w3.org/2000/svg';
        const wrap = document.createElement('div');
        wrap.className = 'nsft-sql-erd-canvas';
        const world = document.createElement('div');
        world.className = 'nsft-sql-erd-world';
        const svg = document.createElementNS(NS, 'svg');
        svg.setAttribute('width', WW); svg.setAttribute('height', WH);
        svg.classList.add('nsft-sql-erd-edges');
        world.appendChild(svg);
        wrap.appendChild(world);

        if (!tables.length) {
            const hint = document.createElement('div');
            hint.className = 'nsft-sql-schema-empty nsft-sql-erd-hint';
            hint.textContent = chrome.i18n.getMessage('sql_erd_empty_sql')
                || 'El diagrama muestra las tablas del FROM y los JOIN. Marca en la acotación las que quieras añadir.';
            wrap.appendChild(hint);
        }

        const hiddenT = new Set();
        const hiddenE = new Set();
        let restoreBtn = null;
        const legendChecks = [];
        const applyHidden = () => {
            legendChecks.forEach(c => {
                c.cb.checked = c.kind === 't' ? !hiddenT.has(c.ref) : !hiddenE.has(c.ref);
            });
            tables.forEach(tt => { if (cardEls[tt]) cardEls[tt].style.display = hiddenT.has(tt) ? 'none' : ''; });
            edges.forEach(e2 => {
                const vis = !hiddenE.has(e2) && !hiddenT.has(e2.a) && !hiddenT.has(e2.b);
                [e2.el, e2.lbl, e2.ca, e2.cb, e2.ma, e2.mb].forEach(n => { if (n) n.style.display = vis ? '' : 'none'; });
            });
            const nHid = hiddenT.size + hiddenE.size;
            if (restoreBtn) {
                restoreBtn.style.display = nHid ? 'inline-flex' : 'none';
                restoreBtn.textContent = (chrome.i18n.getMessage('sql_erd_show_hidden') || 'Mostrar ocultos') + ' (' + nHid + ')';
            }
            scheduleSync();
        };

        const toWorld = (ev) => {
            const r = wrap.getBoundingClientRect();
            return { x: (ev.clientX - r.left - view.tx) / view.k, y: (ev.clientY - r.top - view.ty) / view.k };
        };
        const dragOn = (el, move) => el.addEventListener('mousedown', (e0) => {
            e0.preventDefault(); e0.stopPropagation();
            const mv = (ev) => { move(toWorld(ev)); scheduleSync(); };
            const up = () => { document.removeEventListener('mousemove', mv); document.removeEventListener('mouseup', up); };
            document.addEventListener('mousemove', mv);
            document.addEventListener('mouseup', up);
        });

        {
            const placed = [];
            const rest = new Set(tables);
            while (rest.size) {
                let pick = null, best = -1;
                rest.forEach(tt => {
                    let score = 0;
                    Object.values(sqlTableMeta[tt].joins || {}).forEach(j => {
                        if (j.targetTable && placed.indexOf(j.targetTable) !== -1) score += 2;
                        if (j.targetTable && rest.has(j.targetTable)) score += 0.1;
                    });
                    if (score > best) { best = score; pick = tt; }
                });
                placed.push(pick);
                rest.delete(pick);
            }
            tables = placed;
        }

        const pos = ctx.pos;
        const cardEls = {};
        let slot = 0;
        const ocupado = (x, y) => Object.keys(pos).some(k => pos[k].x === x && pos[k].y === y);
        tables.forEach((t) => {
            if (pos[t]) return;
            let x, y;
            do {
                x = 80 + (slot % 3) * (CW + 150);
                y = 80 + Math.floor(slot / 3) * 380;
                slot++;
            } while (ocupado(x, y) && slot < 600);
            pos[t] = { x: x, y: y };
        });

        const loaded = new Set(tables), seen = new Set(), edges = [];
        tables.forEach(t => Object.values(sqlTableMeta[t].joins || {}).forEach(j => {
            if (!j.targetTable || !loaded.has(j.targetTable) || j.targetTable === t) return;
            const key = [t, j.targetTable].sort().join('|');
            if (seen.has(key)) return;
            seen.add(key);
            const path = document.createElementNS(NS, 'path');
            path.classList.add('nsft-sql-erd-edge');
            const ti = document.createElementNS(NS, 'title');
            ti.textContent = t + ' ↔ ' + j.targetTable + (j.cardinality ? ' (' + j.cardinality + ')' : '');
            path.appendChild(ti);
            const lbl = document.createElementNS(NS, 'text');
            lbl.classList.add('nsft-sql-erd-elbl');
            lbl.textContent = j.cardinality || '';
            const ca = document.createElementNS(NS, 'circle');
            const cb = document.createElementNS(NS, 'circle');
            [ca, cb].forEach(c => { c.setAttribute('r', '3.5'); c.classList.add('nsft-sql-erd-dot'); });
            const EDGE_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4', '#ef4444', '#84cc16', '#f97316', '#6366f1'];
            const ec = EDGE_COLORS[edges.length % EDGE_COLORS.length];
            path.style.stroke = ec;
            lbl.style.fill = ec;
            ca.style.fill = ec;
            cb.style.fill = ec;
            const ma = document.createElementNS(NS, 'path');
            const mb = document.createElementNS(NS, 'path');
            [ma, mb].forEach(m => { m.classList.add('nsft-sql-erd-mark'); m.style.stroke = ec; });
            const cparts = String(j.cardinality || '').toUpperCase().split(':');
            const vh = document.createElementNS(NS, 'line');
            vh.classList.add('nsft-sql-erd-vhandle');
            const hh1 = document.createElementNS(NS, 'line');
            const hh2 = document.createElementNS(NS, 'line');
            [hh1, hh2].forEach(h => h.classList.add('nsft-sql-erd-hhandle'));
            const ch1 = document.createElementNS(NS, 'circle');
            const ch2 = document.createElementNS(NS, 'circle');
            [ch1, ch2].forEach(c => { c.setAttribute('r', '7'); c.classList.add('nsft-sql-erd-chandle'); });
            const eo = {
                a: t, b: j.targetTable, el: path, lbl, ca, cb, ma, mb, vh, hh1, hh2, ch1, ch2,
                cardA: cparts[0] || '', cardB: cparts[cparts.length - 1] || '',
                ov: { ay: null, by: null, mx: null, aSide: null, bSide: null }
            };
            edges.push(eo);
            path.addEventListener('dblclick', (ev) => {
                ev.stopPropagation();
                hiddenE.add(eo);
                applyHidden();
            });
            const perim = (tbl, o, keyS, keyO) => (w) => {
                const p = pos[tbl];
                const rx = Math.max(0, Math.min(CW, w.x - p.x));
                const ry = Math.max(0, Math.min(260, w.y - p.y));
                const m = Math.min(rx, CW - rx, ry, 260 - ry);
                if (m === ry) { o[keyS] = 'T'; o[keyO] = Math.max(12, Math.min(CW - 12, rx)); }
                else if (m === 260 - ry) { o[keyS] = 'B'; o[keyO] = Math.max(12, Math.min(CW - 12, rx)); }
                else if (m === rx) { o[keyS] = 'L'; o[keyO] = Math.max(16, Math.min(244, ry)); }
                else { o[keyS] = 'R'; o[keyO] = Math.max(16, Math.min(244, ry)); }
            };
            const edgeYDrag = (tbl, keyS, keyO) => (w) => {
                const p = pos[tbl];
                const hcur = (cardEls[tbl] && cardEls[tbl].offsetHeight) || 260;
                const ry = w.y - p.y;
                if (ry < 6 || ry > hcur - 6) {
                    const P = eo._g ? (keyS === 'aSide' ? eo._g.A : eo._g.B) : null;
                    eo.ov[keyS] = ry < 6 ? 'T' : 'B';
                    eo.ov[keyO] = Math.max(14, Math.min(CW - 14, (P ? P.x : p.x + CW / 2) - p.x));
                } else if (eo.ov[keyS] !== 'T' && eo.ov[keyS] !== 'B') {
                    eo.ov[keyO] = Math.max(16, Math.min(hcur - 16, ry));
                }
            };
            const setAy = edgeYDrag(t, 'aSide', 'ay');
            const setBy = edgeYDrag(j.targetTable, 'bSide', 'by');
            dragOn(ca, perim(t, eo.ov, 'aSide', 'ay'));
            dragOn(cb, perim(j.targetTable, eo.ov, 'bSide', 'by'));
            dragOn(vh, (w) => { eo.ov.mx = w.x; });
            dragOn(hh1, setAy);
            dragOn(hh2, setBy);
            dragOn(ch1, (w) => { eo.ov.mx = w.x; setAy(w); });
            dragOn(ch2, (w) => { eo.ov.mx = w.x; setBy(w); });
            ca.addEventListener('dblclick', () => { eo.ov.ay = null; eo.ov.aSide = null; scheduleSync(); });
            cb.addEventListener('dblclick', () => { eo.ov.by = null; eo.ov.bSide = null; scheduleSync(); });
            [vh, hh1, hh2, ch1, ch2].forEach(h => h.addEventListener('dblclick', () => {
                eo.ov.mx = null; eo.ov.ay = null; eo.ov.by = null; scheduleSync();
            }));
            svg.appendChild(path);
            svg.appendChild(lbl);
            svg.appendChild(ma);
            svg.appendChild(mb);
            svg.appendChild(vh);
            svg.appendChild(hh1);
            svg.appendChild(hh2);
            svg.appendChild(ch1);
            svg.appendChild(ch2);
            svg.appendChild(ca);
            svg.appendChild(cb);
        }));
        const cardCenter = (t) => {
            const el = pos[t];
            return { x: el.x + CW / 2, y: el.y + 110 };
        };
        const hSeg = (x1, x2, y, verts, selfIdx, skipTables) => {
            const dir = x2 >= x1 ? 1 : -1;
            const lo = Math.min(x1, x2), hi = Math.max(x1, x2);
            const evs = [];
            verts.filter(v => v.i !== selfIdx && v.x > lo + 14 && v.x < hi - 14 &&
                y > Math.min(v.y1, v.y2) + 2 && y < Math.max(v.y1, v.y2) - 2)
                .forEach(v => evs.push({ x: v.x, hop: true }));
            tables.forEach(tt => {
                if (skipTables && skipTables.has(tt)) return;
                const p = pos[tt];
                if (p.x + CW > lo + 4 && p.x < hi - 4 && y > p.y - 6 && y < p.y + CH(tt) + 6) {
                    const sepY = 14 + (selfIdx % 4) * 12;
                    const sepX = 10 + (selfIdx % 4) * 9;
                    const dy = (y - p.y < CH(tt) / 2) ? p.y - sepY : p.y + CH(tt) + sepY;
                    evs.push({ x: p.x + CW / 2, card: { x1: p.x - sepX, x2: p.x + CW + sepX, dy } });
                }
            });
            evs.sort((a, b) => dir * (a.x - b.x));
            let d = '';
            evs.forEach(ev => {
                if (ev.hop) {
                    d += ' L ' + (ev.x - 8 * dir) + ' ' + y +
                         ' A 8 8 0 0 ' + (dir === 1 ? 1 : 0) + ' ' + (ev.x + 8 * dir) + ' ' + y;
                } else {
                    const c = ev.card;
                    const ex = dir === 1 ? c.x1 : c.x2, xx = dir === 1 ? c.x2 : c.x1;
                    d += ' L ' + ex + ' ' + y + ' V ' + c.dy + ' H ' + xx + ' V ' + y;
                }
            });
            return d + ' L ' + x2 + ' ' + y;
        };

        const CARD_H = 260;
        const CH = (tt) => (cardEls[tt] && cardEls[tt].offsetHeight) || CARD_H;
        const hitsCard = (x, y1, y2) => tables.some(tt => {
            const p = pos[tt];
            return x > p.x - 8 && x < p.x + CW + 8 &&
                Math.max(y1, y2) > p.y - 8 && Math.min(y1, y2) < p.y + CH(tt) + 8;
        });
        const hCross = (x1, x2, y, skip) => {
            let n = 0;
            tables.forEach(tt => {
                if (skip && skip.has(tt)) return;
                const p = pos[tt];
                if (p.x + CW > Math.min(x1, x2) + 4 && p.x < Math.max(x1, x2) - 4 &&
                    y > p.y - 6 && y < p.y + CH(tt) + 6) n++;
            });
            return n;
        };
        const bestMx = (mx0, g, skip, lanes) => {
            const laneCross = (x1, x2, y) => (lanes || []).filter(L =>
                L.x > Math.min(x1, x2) + 8 && L.x < Math.max(x1, x2) - 8 &&
                y > L.y1 + 4 && y < L.y2 - 4).length;
            let best = mx0, bestScore = Infinity;
            for (let k = 0; k < 13; k++) {
                const off = (k % 2 ? -1 : 1) * Math.ceil(k / 2) * 50;
                const mx = mx0 + off;
                const score = (hitsCard(mx, g.a.y, g.b.y) ? 10 : 0) +
                    hCross(g.a.x, mx, g.a.y, skip) * 1.8 +
                    hCross(mx, g.b.x, g.b.y, skip) * 1.8 +
                    (laneCross(g.a.x, mx, g.a.y) + laneCross(mx, g.b.x, g.b.y)) * 1.2 +
                    (Math.abs(g.a.x - mx) + Math.abs(mx - g.b.x)) / 180 +
                    Math.abs(off) / 1000;
                if (score < bestScore) { bestScore = score; best = mx; if (score === 0) break; }
            }
            return best;
        };

        const edgeOrd = (() => {
            const cnt = {};
            const ords = edges.map(e => {
                cnt[e.a] = (cnt[e.a] || 0) + 1;
                cnt[e.b] = (cnt[e.b] || 0) + 1;
                return { ao: cnt[e.a] - 1, bo: cnt[e.b] - 1 };
            });
            ords.total = cnt;
            return ords;
        })();

        const syncEdges = () => {
            const G = 20;
            const TURN_COST = 3 * G;
            const USED_COST = 4 * G;
            const visT = tables.filter(tt => !hiddenT.has(tt));
            if (!visT.length) return;

            let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
            visT.forEach(tt => {
                const p = pos[tt];
                minX = Math.min(minX, p.x); minY = Math.min(minY, p.y);
                maxX = Math.max(maxX, p.x + CW); maxY = Math.max(maxY, p.y + CH(tt));
            });
            minX -= 140; minY -= 140; maxX += 140; maxY += 140;
            const gx0 = Math.floor(minX / G), gy0 = Math.floor(minY / G);
            const gw = Math.ceil((maxX - minX) / G) + 1;
            const gh = Math.ceil((maxY - minY) / G) + 1;
            const NCELL = gw * gh;

            const blocked = new Uint8Array(NCELL);
            visT.forEach(tt => {
                const p = pos[tt];
                const x1 = Math.max(0, Math.floor((p.x - 6) / G) - gx0);
                const x2 = Math.min(gw - 1, Math.ceil((p.x + CW + 6) / G) - gx0);
                const y1 = Math.max(0, Math.floor((p.y - 6) / G) - gy0);
                const y2 = Math.min(gh - 1, Math.ceil((p.y + CH(tt) + 6) / G) - gy0);
                for (let yy = y1; yy <= y2; yy++)
                    for (let xx = x1; xx <= x2; xx++) blocked[yy * gw + xx] = 1;
            });
            const usedCells = new Uint8Array(NCELL);

            const toGX = (x) => Math.round(x / G) - gx0;
            const toGY = (y) => Math.round(y / G) - gy0;
            const toWX = (cx) => (cx + gx0) * G;
            const toWY = (cy) => (cy + gy0) * G;

            const DX = [1, -1, 0, 0], DY = [0, 0, 1, -1];
            const aStar = (sx, sy, sdir, ex, ey) => {
                const NSTATE = NCELL * 4;
                const gCost = new Float64Array(NSTATE).fill(Infinity);
                const cameFrom = new Int32Array(NSTATE).fill(-1);
                const heap = [];
                const hpush = (f, s) => {
                    heap.push([f, s]);
                    let i = heap.length - 1;
                    while (i > 0) {
                        const par = (i - 1) >> 1;
                        if (heap[par][0] <= heap[i][0]) break;
                        const tmp = heap[par]; heap[par] = heap[i]; heap[i] = tmp; i = par;
                    }
                };
                const hpop = () => {
                    const top = heap[0];
                    const last = heap.pop();
                    if (heap.length) {
                        heap[0] = last;
                        let i = 0;
                        for (;;) {
                            const l = i * 2 + 1, r = l + 1;
                            let m = i;
                            if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
                            if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
                            if (m === i) break;
                            const tmp = heap[m]; heap[m] = heap[i]; heap[i] = tmp; i = m;
                        }
                    }
                    return top;
                };
                const hf = (cx, cy) => Math.abs(cx - ex) + Math.abs(cy - ey);
                const s0 = (sy * gw + sx) * 4 + sdir;
                gCost[s0] = 0;
                hpush(hf(sx, sy) * G, s0);
                let goal = -1, iter = 0;
                while (heap.length && iter++ < 60000) {
                    const [, st] = hpop();
                    const cell = st >> 2, dir = st & 3;
                    const cx = cell % gw, cy = (cell / gw) | 0;
                    if (cx === ex && cy === ey) { goal = st; break; }
                    const base = gCost[st];
                    for (let nd = 0; nd < 4; nd++) {
                        if ((nd === 0 && dir === 1) || (nd === 1 && dir === 0) ||
                            (nd === 2 && dir === 3) || (nd === 3 && dir === 2)) continue;
                        const nx = cx + DX[nd], ny = cy + DY[nd];
                        if (nx < 0 || ny < 0 || nx >= gw || ny >= gh) continue;
                        const ncell = ny * gw + nx;
                        if (blocked[ncell] && !(nx === ex && ny === ey)) continue;
                        let cost = base + G;
                        if (nd !== dir) cost += TURN_COST;
                        if (usedCells[ncell]) cost += USED_COST;
                        const ns = ncell * 4 + nd;
                        if (cost < gCost[ns]) {
                            gCost[ns] = cost;
                            cameFrom[ns] = st;
                            hpush(cost + hf(nx, ny) * G, ns);
                        }
                    }
                }
                if (goal < 0) return null;
                const cells = [];
                for (let st = goal; st >= 0; st = cameFrom[st]) {
                    const cell = st >> 2;
                    cells.push([cell % gw, (cell / gw) | 0]);
                    if (cameFrom[st] === st) break;
                }
                cells.reverse();
                return cells;
            };

            const SIDE_DIR = { R: 0, L: 1, B: 2, T: 3 };
            const geo = edges.map((e, i) => {
                const pa = pos[e.a], pb = pos[e.b];
                const ha = CH(e.a), hb = CH(e.b);
                const acx = pa.x + CW / 2, bcx = pb.x + CW / 2;
                const dxc = bcx - acx;
                const dyc = (pb.y + hb / 2) - (pa.y + ha / 2);
                let sa, sb;
                if (Math.abs(dxc) >= CW + 40) { sa = dxc > 0 ? 'R' : 'L'; sb = dxc > 0 ? 'L' : 'R'; }
                else if (Math.abs(dyc) >= Math.min(ha, hb) - 40) { sa = dyc > 0 ? 'B' : 'T'; sb = dyc > 0 ? 'T' : 'B'; }
                else { sa = 'L'; sb = 'L'; }
                sa = e.ov.aSide || sa;
                sb = e.ov.bSide || sb;
                const defOff = (s, ord, tbl, h) => {
                    const n = (edgeOrd.total && edgeOrd.total[tbl]) || 1;
                    if (s === 'T' || s === 'B') return Math.max(14, Math.min(CW - 14, CW * (ord + 1) / (n + 1)));
                    return Math.max(28, Math.min(h - 24, h * (ord + 1) / (n + 1)));
                };
                const offA = e.ov.ay != null ? e.ov.ay : defOff(sa, edgeOrd[i].ao, e.a, ha);
                const offB = e.ov.by != null ? e.ov.by : defOff(sb, edgeOrd[i].bo, e.b, hb);
                const pt = (p, s, off, h) =>
                    s === 'L' ? { x: p.x, y: p.y + Math.min(off, h - 16) } :
                    s === 'R' ? { x: p.x + CW, y: p.y + Math.min(off, h - 16) } :
                    s === 'T' ? { x: p.x + off, y: p.y } :
                                { x: p.x + off, y: p.y + h };
                const A = pt(pa, sa, offA, ha), B = pt(pb, sb, offB, hb);
                return { A, B, sa, sb };
            });

            const OUT = { R: [1, 0], L: [-1, 0], B: [0, 1], T: [0, -1] };
            const routes = geo.map((g, i) => {
                if (hiddenE.has(edges[i]) || hiddenT.has(edges[i].a) || hiddenT.has(edges[i].b)) return null;
                const oa = OUT[g.sa], ob = OUT[g.sb];
                const S = { x: g.A.x + oa[0] * G * 1.5, y: g.A.y + oa[1] * G * 1.5 };
                const E = { x: g.B.x + ob[0] * G * 1.5, y: g.B.y + ob[1] * G * 1.5 };
                const cells = aStar(
                    Math.max(0, Math.min(gw - 1, toGX(S.x))),
                    Math.max(0, Math.min(gh - 1, toGY(S.y))),
                    SIDE_DIR[g.sa],
                    Math.max(0, Math.min(gw - 1, toGX(E.x))),
                    Math.max(0, Math.min(gh - 1, toGY(E.y)))
                );
                let pts;
                if (cells && cells.length) {
                    pts = cells.map(c => ({ x: toWX(c[0]), y: toWY(c[1]) }));
                } else {
                    pts = [S, { x: S.x, y: E.y }, E];
                }
                const first = pts[0], last = pts[pts.length - 1];
                const headJ = (g.sa === 'L' || g.sa === 'R')
                    ? [{ x: first.x, y: g.A.y }]
                    : [{ x: g.A.x, y: first.y }];
                const tailJ = (g.sb === 'L' || g.sb === 'R')
                    ? [{ x: last.x, y: g.B.y }]
                    : [{ x: g.B.x, y: last.y }];
                const full = [g.A].concat(headJ, pts, tailJ, [g.B]);
                const simp = [full[0]];
                for (let k = 1; k < full.length - 1; k++) {
                    const p0 = simp[simp.length - 1], p1 = full[k], p2 = full[k + 1];
                    if (p1.x === p0.x && p1.y === p0.y) continue;
                    if ((p0.x === p1.x && p1.x === p2.x) || (p0.y === p1.y && p1.y === p2.y)) continue;
                    simp.push(p1);
                }
                simp.push(full[full.length - 1]);
                for (let k = 0; k < simp.length - 1; k++) {
                    const q1 = simp[k], q2 = simp[k + 1];
                    const steps = Math.max(1, Math.round((Math.abs(q2.x - q1.x) + Math.abs(q2.y - q1.y)) / G));
                    for (let s2 = 0; s2 <= steps; s2++) {
                        const xx = toGX(q1.x + (q2.x - q1.x) * s2 / steps);
                        const yy = toGY(q1.y + (q2.y - q1.y) * s2 / steps);
                        if (xx >= 0 && yy >= 0 && xx < gw && yy < gh) usedCells[yy * gw + xx] = 1;
                    }
                }
                return simp;
            });

            const allVerts = [];
            routes.forEach((pts, gi) => {
                if (!pts) return;
                for (let k = 0; k < pts.length - 1; k++) {
                    if (pts[k].x === pts[k + 1].x && pts[k].y !== pts[k + 1].y) {
                        allVerts.push({ gi, x: pts[k].x, y1: pts[k].y, y2: pts[k + 1].y });
                    }
                }
            });

            edges.forEach((e, i) => {
                const g = geo[i];
                const pts = routes[i];
                if (!pts) return;
                e._g = g;
                let d = 'M ' + pts[0].x + ' ' + pts[0].y;
                for (let k = 0; k < pts.length - 1; k++) {
                    const p1 = pts[k], p2 = pts[k + 1];
                    if (p1.y === p2.y && p1.x !== p2.x) {
                        const dir = p2.x > p1.x ? 1 : -1;
                        const lo = Math.min(p1.x, p2.x), hi = Math.max(p1.x, p2.x);
                        const xs = allVerts
                            .filter(v => v.gi !== i && v.x > lo + 14 && v.x < hi - 14 &&
                                p1.y > Math.min(v.y1, v.y2) + 2 && p1.y < Math.max(v.y1, v.y2) - 2)
                            .map(v => v.x)
                            .sort((a2, b2) => dir * (a2 - b2));
                        let last = -Infinity;
                        xs.forEach(cx => {
                            if (Math.abs(cx - last) < 18) return;
                            last = cx;
                            d += ' L ' + (cx - 8 * dir) + ' ' + p1.y +
                                 ' A 8 8 0 0 ' + (dir === 1 ? 1 : 0) + ' ' + (cx + 8 * dir) + ' ' + p1.y;
                        });
                        d += ' L ' + p2.x + ' ' + p2.y;
                    } else {
                        d += ' L ' + p2.x + ' ' + p2.y;
                    }
                }
                e.el.setAttribute('d', d);

                let total = 0;
                for (let k = 0; k < pts.length - 1; k++) total += Math.abs(pts[k + 1].x - pts[k].x) + Math.abs(pts[k + 1].y - pts[k].y);
                let half = total / 2, li = 0;
                while (li < pts.length - 2) {
                    const seg = Math.abs(pts[li + 1].x - pts[li].x) + Math.abs(pts[li + 1].y - pts[li].y);
                    if (half <= seg) break;
                    half -= seg; li++;
                }
                const lp1 = pts[li], lp2 = pts[li + 1];
                const segLen = Math.abs(lp2.x - lp1.x) + Math.abs(lp2.y - lp1.y) || 1;
                const fr = half / segLen;
                e.lbl.setAttribute('x', lp1.x + (lp2.x - lp1.x) * fr);
                e.lbl.setAttribute('y', lp1.y + (lp2.y - lp1.y) * fr - 5);

                e.ca.setAttribute('cx', g.A.x); e.ca.setAttribute('cy', g.A.y);
                e.cb.setAttribute('cx', g.B.x); e.cb.setAttribute('cy', g.B.y);

                const markAt = (P, side, kind) => {
                    const k2 = String(kind || '');
                    const many = /[NM*]/.test(k2), one = /1/.test(k2), zero = /0/.test(k2);
                    const horiz = (side === 'L' || side === 'R');
                    const dir = (side === 'R' || side === 'B') ? 1 : -1;
                    let md = '', off = 0;
                    const seg = (t2) => horiz
                        ? { x: P.x + t2 * dir, y: P.y }
                        : { x: P.x, y: P.y + t2 * dir };
                    if (many) {
                        const tip = seg(11);
                        const w1 = horiz ? { x: P.x, y: P.y - 5 } : { x: P.x - 5, y: P.y };
                        const w2 = horiz ? { x: P.x, y: P.y + 5 } : { x: P.x + 5, y: P.y };
                        md += 'M ' + tip.x + ' ' + tip.y + ' L ' + w1.x + ' ' + w1.y +
                              ' M ' + tip.x + ' ' + tip.y + ' L ' + P.x + ' ' + P.y +
                              ' M ' + tip.x + ' ' + tip.y + ' L ' + w2.x + ' ' + w2.y;
                        off = 15;
                    }
                    if (one || (!many && !zero)) {
                        const c2 = seg(off || 8);
                        md += horiz
                            ? ' M ' + c2.x + ' ' + (c2.y - 5) + ' L ' + c2.x + ' ' + (c2.y + 5)
                            : ' M ' + (c2.x - 5) + ' ' + c2.y + ' L ' + (c2.x + 5) + ' ' + c2.y;
                        off = (off || 8) + 7;
                    }
                    if (zero) {
                        const c3 = seg((off || 8) + 4);
                        md += ' M ' + (c3.x - 3) + ' ' + c3.y +
                              ' A 3 3 0 1 0 ' + (c3.x + 3) + ' ' + c3.y +
                              ' A 3 3 0 1 0 ' + (c3.x - 3) + ' ' + c3.y;
                    }
                    return md;
                };
                e.ma.setAttribute('d', markAt(g.A, g.sa, e.cardA));
                e.mb.setAttribute('d', markAt(g.B, g.sb, e.cardB));

                if (e.vh) { e.vh.setAttribute('x1', -9999); e.vh.setAttribute('x2', -9999); e.vh.setAttribute('y1', -9999); e.vh.setAttribute('y2', -9999); }
                if (e.hh1) { e.hh1.setAttribute('x1', -9999); e.hh1.setAttribute('x2', -9999); e.hh1.setAttribute('y1', -9999); e.hh1.setAttribute('y2', -9999); }
                if (e.hh2) { e.hh2.setAttribute('x1', -9999); e.hh2.setAttribute('x2', -9999); e.hh2.setAttribute('y1', -9999); e.hh2.setAttribute('y2', -9999); }
                if (e.ch1) { e.ch1.setAttribute('cx', -9999); e.ch1.setAttribute('cy', -9999); }
                if (e.ch2) { e.ch2.setAttribute('cx', -9999); e.ch2.setAttribute('cy', -9999); }
            });
        };

        let _erdRaf = false;
        const _pendingCards = new Map();
        const scheduleSync = (cardEl, tName) => {
            if (cardEl) _pendingCards.set(cardEl, tName);
            if (_erdRaf) return;
            _erdRaf = true;
            requestAnimationFrame(() => {
                _erdRaf = false;
                _pendingCards.forEach((tn, el) => {
                    el.style.left = pos[tn].x + 'px';
                    el.style.top = pos[tn].y + 'px';
                });
                _pendingCards.clear();
                syncEdges();
            });
        };

        const DOTS = ['#8b5cf6', '#22c55e', '#f59e0b', '#3b82f6', '#ec4899', '#10b981', '#ef4444', '#0ea5e9'];
        tables.forEach((t, idx) => {
            const meta = sqlTableMeta[t];
            const card = document.createElement('div');
            card.className = 'nsft-sql-erdn';
            card.style.left = pos[t].x + 'px';
            card.style.top = pos[t].y + 'px';
            card.style.width = CW + 'px';
            cardEls[t] = card;

            const nFields = Object.values(meta.fields).filter(f => f.isAvailable && !f.removed).length;
            const head = document.createElement('div');
            head.className = 'nsft-sql-erdn-head';
            head.innerHTML = '<div class="nsft-sql-erdn-trow">' +
                '<span class="nsft-sql-erdn-dot" style="background:' + DOTS[idx % DOTS.length] + '"></span>' +
                '<span class="nsft-sql-erdn-title">' + escapeHtml(meta.label || t) + '</span>' +
                '<span class="nsft-sql-erdn-cnt">' + nFields + '</span>' +
                '<span class="nsft-sql-erdn-hide" title="' + escapeHtml(chrome.i18n.getMessage('sql_erd_hide') || 'Ocultar tabla') + '">✕</span></div>' +
                '<div class="nsft-sql-erdn-id">' + escapeHtml(t) + '</div>';
            card.appendChild(head);
            const hideBtn = head.querySelector('.nsft-sql-erdn-hide');
            if (hideBtn) {
                hideBtn.addEventListener('mousedown', (ev) => ev.stopPropagation());
                hideBtn.addEventListener('click', (ev) => {
                    ev.stopPropagation();
                    hiddenT.add(t);
                    applyHidden();
                });
            }

            const find = document.createElement('input');
            find.type = 'text';
            find.className = 'nsft-sql-erdn-find';
            find.placeholder = chrome.i18n.getMessage('sql_erd_find') || 'Buscar columna…';
            find.setAttribute('autocomplete', 'off');
            card.appendChild(find);

            const list = document.createElement('div');
            list.className = 'nsft-sql-erdn-list';
            const fields = Object.values(meta.fields).filter(f => f.isAvailable && !f.removed).sort((a, b) => a.id.localeCompare(b.id));
            const renderList = (q) => {
                list.textContent = '';
                fields.filter(f => !q || tsFold(f.id).includes(q) || tsFold(f.label).includes(q))
                    .slice(0, 200).forEach(f => {
                    const row = document.createElement('div');
                    row.className = 'nsft-sql-erdn-row';
                    const isPk = f.id === 'id';
                    const isFk = (f.joins || []).length > 0;
                    const badge = isPk ? '<span class="nsft-sql-erdn-b nsft-sql-erdn-pk">PK</span>'
                        : isFk ? '<span class="nsft-sql-erdn-b nsft-sql-erdn-fk">FK</span>'
                        : '<span class="nsft-sql-erdn-b"></span>';
                    const dt = String(f.dataType || '').toLowerCase();
                    const abbr = /int|num|float|curren|percent/.test(dt) ? 'num'
                        : (isFk || /select|join|ref/.test(dt)) ? 'ref'
                        : /date|time/.test(dt) ? 'date'
                        : /bool|check/.test(dt) ? 'bool'
                        : dt ? 'str' : '';
                    row.innerHTML = badge + '<span>' + markMatches(f.id, q) + '</span>' +
                        '<span class="nsft-sql-erdn-t">' + abbr + '</span>';
                    row.title = (f.label || f.id) + (f.dataType ? ' · ' + f.dataType : '');
                    list.appendChild(row);
                });
            };
            renderList('');
            find.addEventListener('input', () => renderList(tsFold(find.value.trim())));
            find.addEventListener('mousedown', (e) => e.stopPropagation());
            card.appendChild(list);

            head.addEventListener('mousedown', (e) => {
                e.preventDefault(); e.stopPropagation();
                const s = { mx: e.clientX, my: e.clientY, x: pos[t].x, y: pos[t].y };
                const mv = (ev) => {
                    pos[t].x = s.x + (ev.clientX - s.mx) / view.k;
                    pos[t].y = s.y + (ev.clientY - s.my) / view.k;
                    scheduleSync(card, t);
                };
                const up = () => { document.removeEventListener('mousemove', mv); document.removeEventListener('mouseup', up); };
                document.addEventListener('mousemove', mv);
                document.addEventListener('mouseup', up);
            });
            card.addEventListener('mouseenter', () => edges.forEach(e => {
                const rel = (e.a === t || e.b === t);
                [e.el, e.lbl, e.ca, e.cb, e.ma, e.mb].forEach(n => {
                    n.classList.toggle('nsft-sql-erd-on', rel);
                    n.classList.toggle('nsft-sql-erd-dim', !rel);
                });
            }));
            card.addEventListener('mouseleave', () => edges.forEach(e =>
                [e.el, e.lbl, e.ca, e.cb, e.ma, e.mb].forEach(n => n.classList.remove('nsft-sql-erd-on', 'nsft-sql-erd-dim'))
            ));
            world.appendChild(card);
        });
        syncEdges();

        const view = ctx.view;
        const apply = () => { world.style.transform = 'translate(' + view.tx + 'px,' + view.ty + 'px) scale(' + view.k + ')'; };
        const fit = () => {
            if (!tables.length) return;
            const xs = tables.map(t => pos[t].x), ys = tables.map(t => pos[t].y);
            const minX = Math.min(...xs) - 40, minY = Math.min(...ys) - 40;
            const maxX = Math.max(...xs) + CW + 40, maxY = Math.max(...ys) + 260;
            const r = wrap.getBoundingClientRect();
            view.k = Math.min(1.5, Math.max(0.2, Math.min(r.width / (maxX - minX), r.height / (maxY - minY))));
            view.tx = -minX * view.k + (r.width - (maxX - minX) * view.k) / 2;
            view.ty = -minY * view.k + (r.height - (maxY - minY) * view.k) / 2;
            apply();
        };
        wrap.addEventListener('wheel', (e) => {
            e.preventDefault();
            view.k = Math.min(3, Math.max(0.2, view.k * (e.deltaY < 0 ? 1.1 : 0.9)));
            apply();
        }, { passive: false });
        wrap.addEventListener('mousedown', (e) => {
            if (e.target.closest('.nsft-sql-erdn')) return;
            const s = { mx: e.clientX, my: e.clientY, tx: view.tx, ty: view.ty };
            const mv = (ev) => { view.tx = s.tx + ev.clientX - s.mx; view.ty = s.ty + ev.clientY - s.my; apply(); };
            const up = () => { document.removeEventListener('mousemove', mv); document.removeEventListener('mouseup', up); };
            document.addEventListener('mousemove', mv);
            document.addEventListener('mouseup', up);
        });

        const ctr = document.createElement('div');
        ctr.className = 'nsft-sql-erd-controls';
        [['+', () => { view.k = Math.min(3, view.k * 1.2); apply(); }],
         ['−', () => { view.k = Math.max(0.2, view.k / 1.2); apply(); }],
         ['⛶', fit]].forEach(([txt, fn]) => {
            const b = document.createElement('button');
            b.type = 'button'; b.textContent = txt;
            b.addEventListener('click', fn);
            ctr.appendChild(b);
        });
        wrap.appendChild(ctr);

        restoreBtn = document.createElement('button');
        restoreBtn.type = 'button';
        restoreBtn.className = 'nsft-sql-erd-restore';
        restoreBtn.style.display = 'none';
        restoreBtn.addEventListener('click', () => {
            hiddenT.clear();
            hiddenE.clear();
            applyHidden();
        });
        wrap.appendChild(restoreBtn);

        const legend = document.createElement('div');
        legend.className = 'nsft-sql-erd-legend';
        const legHead = document.createElement('div');
        legHead.className = 'nsft-sql-erd-legend-head';
        legHead.innerHTML = '<span class="nsft-sql-erd-legend-caret">▸</span><span>' +
            escapeHtml(chrome.i18n.getMessage('sql_erd_legend') || 'Acotación') + '</span>';
        const legBody = document.createElement('div');
        legBody.className = 'nsft-sql-erd-legend-body';
        legBody.style.display = ctx.legendOpen ? '' : 'none';
        legHead.querySelector('.nsft-sql-erd-legend-caret').textContent = ctx.legendOpen ? '▾' : '▸';
        legHead.addEventListener('click', () => {
            const closed = legBody.style.display === 'none';
            legBody.style.display = closed ? '' : 'none';
            ctx.legendOpen = closed;
            legHead.querySelector('.nsft-sql-erd-legend-caret').textContent = closed ? '▾' : '▸';
        });
        legend.appendChild(legHead);
        legend.appendChild(legBody);
        wrap.appendChild(legend);

        const legRow = (color, label, kind, ref, enDiagrama, host) => {
            const row = document.createElement('label');
            row.className = 'nsft-sql-erd-legrow';
            const cb = document.createElement('input');
            cb.type = 'checkbox';
            const externa = kind === 't' && enDiagrama === false;
            cb.checked = externa ? false
                : (kind === 't' ? !hiddenT.has(ref) : !hiddenE.has(ref));
            cb.addEventListener('change', () => {
                if (externa || (kind === 't' && !cb.checked && ctx.toggle)) {
                    if (ctx.toggle) { ctx.toggle(ref, cb.checked); return; }
                }
                const set = kind === 't' ? hiddenT : hiddenE;
                if (cb.checked) set.delete(ref); else set.add(ref);
                applyHidden();
            });
            if (!externa) legendChecks.push({ cb, kind, ref });
            row.appendChild(cb);
            const sw = document.createElement('span');
            sw.className = 'nsft-sql-erd-legsw';
            sw.style.background = color;
            row.appendChild(sw);
            const tx = document.createElement('span');
            tx.className = 'nsft-sql-erd-legtx';
            const TS = window.NSFT_TextSearch;
            const qLeg = tsFold((ctx.legendFilter || '').trim());
            if (TS && qLeg) TS.mark(tx, label, qLeg, 'nsft-sql-hl');
            else tx.textContent = label;
            row.appendChild(tx);
            (host || legBody).appendChild(row);
        };
        const legGroup = (title, host) => {
            const h = document.createElement('div');
            h.className = 'nsft-sql-erd-leggroup';
            h.textContent = title;
            (host || legBody).appendChild(h);
        };
        legGroup(chrome.i18n.getMessage('sql_erd_leg_tables') || 'Tablas');
        const legActs = document.createElement('div');
        legActs.className = 'nsft-sql-erd-legacts';
        const mkAct = (label, fn) => {
            const b2 = document.createElement('button');
            b2.type = 'button';
            b2.textContent = label;
            b2.addEventListener('click', fn);
            legActs.appendChild(b2);
        };
        mkAct(chrome.i18n.getMessage('sql_erd_show_all') || 'Mostrar todas', () => {
            hiddenT.clear();
            applyHidden();
        });
        mkAct(chrome.i18n.getMessage('sql_erd_hide_all') || 'Ocultar todas', () => {
            tables.forEach(t3 => hiddenT.add(t3));
            applyHidden();
        });
        legBody.appendChild(legActs);

        const visto = new Set(tables);
        const findWrap = document.createElement('div');
        findWrap.className = 'nsft-sql-find nsft-sql-erd-legfind';
        const find = document.createElement('input');
        find.type = 'text';
        find.id = 'nsft-sql-erd-legfilter';
        find.className = 'nsft-sql-erd-legfilter';
        find.placeholder = chrome.i18n.getMessage('sql_erd_leg_filter') || 'Buscar tabla…';
        find.value = ctx.legendFilter || '';
        findWrap.appendChild(find);
        legBody.appendChild(findWrap);

        const legList = document.createElement('div');
        legList.className = 'nsft-sql-erd-leglist';
        legBody.appendChild(legList);

        const LEG_MAX = 200;
        const pintarLista = () => {
            legList.innerHTML = '';
            legendChecks.length = 0;
            const q = tsFold((ctx.legendFilter || '').trim());
            const rank = (t) => {
                if (!q) return 0;
                const tf = tsFold(t);
                if (tf === q) return 0;
                if (tf.startsWith(q)) return 1;
                if (tf.includes(q)) return 2;
                return 3;
            };
            const candidatas = (ctx.all || tables)
                .filter(t => !q || tsFold(t).includes(q)
                    || tsFold((_schemaIndexMem[t] || {}).label).includes(q))
                .sort((a, b) => (rank(a) - rank(b)) || a.localeCompare(b));

            const recorte = candidatas.slice(0, LEG_MAX);
            recorte.forEach((t2, i2) => {
                const label = (sqlTableMeta[t2] && sqlTableMeta[t2].label)
                    || String((_schemaIndexMem[t2] || {}).label || '') || t2;
                legRow(DOTS[i2 % DOTS.length], label === t2 ? t2 : (t2 + ' — ' + label), 't', t2,
                    visto.has(t2), legList);
            });
            if (candidatas.length > recorte.length) {
                const restan = candidatas.length - recorte.length;
                const mas = document.createElement('div');
                mas.className = 'nsft-sql-erd-legmore';
                mas.textContent = chrome.i18n.getMessage('sql_erd_leg_more', [String(restan)])
                    || ('… y ' + restan + ' más — afina la búsqueda');
                legList.appendChild(mas);
            }

            const edgesVis = edges.filter(e2 => !q || tsFold(e2.a + ' ' + e2.b).includes(q));
            if (edgesVis.length) {
                legGroup(chrome.i18n.getMessage('sql_erd_leg_links') || 'Uniones', legList);
                edgesVis.forEach(e2 => {
                    legRow(e2.el.style.stroke || '#94a3b8', e2.a + ' ↔ ' + e2.b, 'e', e2,
                        undefined, legList);
                });
            }
        };

        let findTimer = 0;
        find.addEventListener('input', () => {
            ctx.legendFilter = find.value;
            clearTimeout(findTimer);
            findTimer = setTimeout(pintarLista, 120);
        });
        ['click', 'mousedown', 'pointerdown', 'wheel'].forEach(ev =>
            findWrap.addEventListener(ev, (e) => e.stopPropagation()));
        pintarLista();
        wireFindClear('nsft-sql-erd-legfilter');
        setTimeout(() => {
            if (!ctx.fitted) { ctx.fitted = true; fit(); } else { apply(); }
            syncEdges();
        }, 0);
        return wrap;
    }

    function buildErdSvg(tables) {
        const NS = 'http://www.w3.org/2000/svg';
        const W = 1200, H = 800, NW = 170, NH = 34;
        const cx = W / 2, cy = H / 2, r = Math.min(W, H) / 2 - 120;
        const pos = {};
        tables.forEach((t, i) => {
            const a = (2 * Math.PI * i) / tables.length - Math.PI / 2;
            pos[t] = { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
        });
        const svg = document.createElementNS(NS, 'svg');
        svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
        svg.classList.add('nsft-sql-erd-svg');
        const root = document.createElementNS(NS, 'g');
        svg.appendChild(root);
        const edgesG = document.createElementNS(NS, 'g');
        const nodesG = document.createElementNS(NS, 'g');
        root.appendChild(edgesG);
        root.appendChild(nodesG);

        const loaded = new Set(tables);
        const seen = new Set();
        const edges = [];
        tables.forEach(t => {
            Object.values(sqlTableMeta[t].joins || {}).forEach(j => {
                if (!j.targetTable || !loaded.has(j.targetTable) || j.targetTable === t) return;
                const key = [t, j.targetTable].sort().join('|');
                if (seen.has(key)) return;
                seen.add(key);
                const line = document.createElementNS(NS, 'line');
                line.classList.add('nsft-sql-erd-edge');
                const title = document.createElementNS(NS, 'title');
                title.textContent = t + ' ↔ ' + j.targetTable + (j.cardinality ? ' (' + j.cardinality + ')' : '');
                line.appendChild(title);
                edges.push({ a: t, b: j.targetTable, el: line });
                edgesG.appendChild(line);
            });
        });
        const syncEdges = () => edges.forEach(e => {
            e.el.setAttribute('x1', pos[e.a].x); e.el.setAttribute('y1', pos[e.a].y);
            e.el.setAttribute('x2', pos[e.b].x); e.el.setAttribute('y2', pos[e.b].y);
        });

        tables.forEach(t => {
            const g = document.createElementNS(NS, 'g');
            g.classList.add('nsft-sql-erd-node');
            const rect = document.createElementNS(NS, 'rect');
            rect.setAttribute('width', NW); rect.setAttribute('height', NH);
            rect.setAttribute('rx', 8);
            const label = document.createElementNS(NS, 'text');
            label.setAttribute('x', NW / 2); label.setAttribute('y', NH / 2 + 4);
            label.setAttribute('text-anchor', 'middle');
            label.textContent = t.length > 22 ? t.slice(0, 21) + '…' : t;
            const title = document.createElementNS(NS, 'title');
            title.textContent = t + ' — ' + (sqlTableMeta[t].label || '');
            g.appendChild(rect); g.appendChild(label); g.appendChild(title);
            const sync = () => g.setAttribute('transform', 'translate(' + (pos[t].x - NW / 2) + ',' + (pos[t].y - NH / 2) + ')');
            sync();
            g.addEventListener('mousedown', (e) => {
                e.preventDefault(); e.stopPropagation();
                const start = { mx: e.clientX, my: e.clientY, x: pos[t].x, y: pos[t].y };
                const scale = W / svg.getBoundingClientRect().width / view.k;
                const mv = (ev) => {
                    pos[t].x = start.x + (ev.clientX - start.mx) * scale;
                    pos[t].y = start.y + (ev.clientY - start.my) * scale;
                    sync(); syncEdges();
                };
                const up = () => { document.removeEventListener('mousemove', mv); document.removeEventListener('mouseup', up); };
                document.addEventListener('mousemove', mv);
                document.addEventListener('mouseup', up);
            });
            nodesG.appendChild(g);
        });
        syncEdges();

        const view = { k: 1, tx: 0, ty: 0 };
        const apply = () => root.setAttribute('transform', 'translate(' + view.tx + ',' + view.ty + ') scale(' + view.k + ')');
        svg.addEventListener('wheel', (e) => {
            e.preventDefault();
            view.k = Math.min(3, Math.max(0.3, view.k * (e.deltaY < 0 ? 1.1 : 0.9)));
            apply();
        }, { passive: false });
        svg.addEventListener('mousedown', (e) => {
            if (e.target !== svg) return;
            const s = { mx: e.clientX, my: e.clientY, tx: view.tx, ty: view.ty };
            const scale = W / svg.getBoundingClientRect().width;
            const mv = (ev) => { view.tx = s.tx + (ev.clientX - s.mx) * scale; view.ty = s.ty + (ev.clientY - s.my) * scale; apply(); };
            const up = () => { document.removeEventListener('mousemove', mv); document.removeEventListener('mouseup', up); };
            document.addEventListener('mousemove', mv);
            document.addEventListener('mouseup', up);
        });
        return svg;
    }

    function openInRecordsCatalog(tableName) {
        const url = location.origin + '/app/recordscatalog/rcbrowser.nl?whence=#/record_ss/' +
            encodeURIComponent(String(tableName || '').toLowerCase());
        window.open(url, '_blank', 'noopener');
    }

    function schemaDetailUrl(tableName) {
        const payload = JSON.stringify({ scriptId: String(tableName || ''), path: '' });
        return '/app/recordscatalog/rcendpoint.nl?action=getRecordTypeDetail&data='
            + encodeURIComponent(payload);
    }

    function openSchemaDefinition(tableName) {
        window.open(location.origin + schemaDetailUrl(tableName), '_blank', 'noopener');
    }

    function rcCurrentTable() {
        const m = (location.hash || '').match(/#\/record(?:_[a-z]+)?\/([A-Za-z0-9_]+)/i);
        return m ? m[1].toLowerCase() : null;
    }

    function initCatalogCacheButton() {
        const addLabel = chrome.i18n.getMessage('sql_rcadd_label') || 'Agregar a caché de SuiteQL';
        const cachedLabel = chrome.i18n.getMessage('sql_rcadd_cached') || 'En caché · Quitar';
        const RC_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><ellipse cx="12" cy="5" rx="9" ry="3"></ellipse><path d="M3 5v6c0 1.66 4.03 3 9 3s9-1.34 9-3V5"></path><path d="M3 11v6c0 1.66 4.03 3 9 3s9-1.34 9-3v-6"></path></svg>';
        const RC_ICON_OK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><ellipse cx="12" cy="5" rx="9" ry="3"></ellipse><path d="M3 5v6c0 1.66 4.03 3 9 3 .67 0 1.33-.02 1.96-.07"></path><path d="M3 11v6c0 1.66 4.03 3 9 3 .34 0 .67 0 1-.02"></path><path d="m15 17 2.5 2.5L22 15"></path></svg>';

        const rcCached = new Set();

        function refreshRcCached(cb) {
            loadSchemaIndex((index) => {
                rcCached.clear();
                Object.keys(index).forEach((t) => rcCached.add(t));
                if (cb) cb();
            });
        }

        chrome.storage.onChanged.addListener((changes, area) => {
            if (area !== 'local' || !changes[SCHEMA_INDEX_KEY]) return;
            refreshRcCached(ensureRcAdd);
        });

        function rcFetchAndSave(btn, t, doneMsg) {
            btn.disabled = true;
            return fetch(schemaDetailUrl(t))
                .then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
                .then(json => {
                    if (!(json && json.status === 'ok' && json.data && json.data.fields)) throw new Error('not found');
                    saveSchemaToCache(t, json.data);
                    rcCached.add(normalizeTableName(t));
                    flashRcAdd(btn, '✓ ' + doneMsg);
                })
                .catch(() => {
                    flashRcAdd(btn, '⚠ ' + (chrome.i18n.getMessage('sql_rcadd_error') || 'No se pudo agregar'));
                })
                .finally(() => { btn.disabled = false; });
        }

        function onRcClick(e) {
            const btn = e.currentTarget;
            const t = rcCurrentTable();
            if (!t) return;
            const key = normalizeTableName(t);

            if (rcCached.has(key)) {
                clearSchemaCache(t);
                rcCached.delete(key);
                flashRcAdd(btn, '✓ ' + (chrome.i18n.getMessage('sql_rcadd_removed') || 'Quitada de la caché de SuiteQL'));
                return;
            }
            rcFetchAndSave(btn, t, chrome.i18n.getMessage('sql_rcadd_done') || 'Agregada a la caché de SuiteQL');
        }

        function onRcRefreshClick(e) {
            e.stopPropagation();
            const t = rcCurrentTable();
            if (!t) return;
            rcFetchAndSave(e.currentTarget, t,
                chrome.i18n.getMessage('sql_rcadd_refreshed') || 'Actualizada desde la cuenta');
        }

        function onRcOpenRunnerClick(e) {
            e.stopPropagation();
            const t = rcCurrentTable();
            if (!t) return;
            window.dispatchEvent(new CustomEvent('nsft-show-suiteql-runner', {
                detail: { prefillSql: 'SELECT * FROM ' + t }
            }));
        }

        function flashRcAdd(btn, text) {
            if (btn.dataset.busy === '1') return;
            btn.dataset.busy = '1';
            const prevHtml = btn.innerHTML;
            btn.textContent = text;
            setTimeout(() => {
                btn.dataset.busy = '0';
                btn.innerHTML = prevHtml;
                if (btn.id === 'nsft-sql-rcadd') delete btn.dataset.table;
                ensureRcAdd();
            }, 2000);
        }

        function paintRcAdd(btn, t) {
            if (btn.dataset.busy === '1') return;
            const cached = rcCached.has(normalizeTableName(t));
            const label = cached ? cachedLabel : addLabel;
            if (btn.dataset.table === t && btn.dataset.cached === (cached ? '1' : '0')) return;
            btn.dataset.table = t;
            btn.dataset.cached = cached ? '1' : '0';
            btn.title = label;
            btn.innerHTML = (cached ? RC_ICON_OK : RC_ICON) +
                '<span>' + escapeHtml(label) + '</span>' +
                '<span class="nsft-sql-rcadd-tbl">' + escapeHtml(t) + '</span>';
        }

        function ensureRcAdd() {
            const header = document.querySelector('[data-automation-id="RecordTypeHeader"]');
            const t = rcCurrentTable();
            let wrap = document.getElementById('nsft-sql-rcwrap');
            if (!header || !t) { if (wrap) wrap.remove(); return; }
            if (wrap && !header.contains(wrap)) { wrap.remove(); wrap = null; }

            if (!wrap) {
                wrap = document.createElement('div');
                wrap.id = 'nsft-sql-rcwrap';
                wrap.className = 'nsft-sql-rcwrap';

                const btn = document.createElement('button');
                btn.type = 'button';
                btn.id = 'nsft-sql-rcadd';
                btn.className = 'nsft-sql-rcadd';
                btn.addEventListener('click', onRcClick);
                wrap.appendChild(btn);

                const refreshLabel = chrome.i18n.getMessage('sql_rcadd_refresh') || 'Actualizar caché';
                const refresh = document.createElement('button');
                refresh.type = 'button';
                refresh.id = 'nsft-sql-rcrefresh';
                refresh.className = 'nsft-sql-rcadd';
                refresh.title = refreshLabel;
                refresh.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 2v6h-6"></path><path d="M3 12a9 9 0 0 1 15-6.7L21 8"></path><path d="M3 22v-6h6"></path><path d="M21 12a9 9 0 0 1-15 6.7L3 16"></path></svg>' +
                    '<span>' + escapeHtml(refreshLabel) + '</span>' +
                    '<span class="nsft-sql-rcadd-tbl"></span>';
                refresh.addEventListener('click', onRcRefreshClick);
                wrap.appendChild(refresh);

                const openLabel = chrome.i18n.getMessage('sql_rcadd_open_runner') || 'Abrir SQL Runner';
                const open = document.createElement('button');
                open.type = 'button';
                open.id = 'nsft-sql-rcopen';
                open.className = 'nsft-sql-rcadd';
                open.title = openLabel;
                open.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="5 4 13 12 5 20"></polyline><line x1="17" y1="5" x2="17" y2="19"></line></svg>' +
                    '<span>' + escapeHtml(openLabel) + '</span>';
                open.addEventListener('click', onRcOpenRunnerClick);
                wrap.appendChild(open);

                header.appendChild(wrap);
            }

            paintRcAdd(wrap.querySelector('#nsft-sql-rcadd'), t);
            const refreshBtn = wrap.querySelector('#nsft-sql-rcrefresh');
            if (refreshBtn) {
                refreshBtn.hidden = !rcCached.has(normalizeTableName(t));
                const chip = refreshBtn.querySelector('.nsft-sql-rcadd-tbl');
                if (chip && chip.textContent !== t) chip.textContent = t;
            }
        }

        refreshRcCached(() => {
            if (window.NSFT_Observer && typeof window.NSFT_Observer.subscribe === 'function') {
                window.NSFT_Observer.subscribe(ensureRcAdd, { throttle: 300, immediate: true });
            } else {
                const mo = new MutationObserver(ensureRcAdd);
                mo.observe(document.body || document.documentElement, { childList: true, subtree: true });
                ensureRcAdd();
            }
            window.addEventListener('hashchange', () => setTimeout(ensureRcAdd, 50));
        });
    }

    if (/\/app\/recordscatalog\/rcbrowser\.nl/i.test(location.pathname)) {
        chrome.storage.local.get({ enableSuiteQLRunner: true }, (it) => {
            if (it.enableSuiteQLRunner) initCatalogCacheButton();
        });
    }

    function renderCatalogResults() {
        const box = document.getElementById('nsft-sql-schema-catalog-results');
        if (!box) return;
        paintBulkButton();
        const q = catalogNorm(catalogQuery.trim());
        box.innerHTML = '';

        if (catalogLoading) {
            box.innerHTML = `<div class="nsft-sql-schema-empty">…</div>`;
            return;
        }
        if (!q) {
            box.innerHTML = `<div class="nsft-sql-schema-empty">${escapeHtml(chrome.i18n.getMessage('sql_schema_catalog_ph') || 'Buscar tabla en la cuenta…')}</div>`;
            return;
        }
        const catalogRank = (t) => {
            const id = catalogNorm(t.id);
            const label = catalogNorm(t.label);
            if (id === q) return 0;
            if (id.startsWith(q)) return 1;
            if (label === q) return 2;
            if (label.startsWith(q)) return 3;
            if (id.includes(q)) return 4;
            return 5;
        };
        const loaded = new Set(getLoadedTableNames());
        const matches = (catalogTables || [])
            .filter(t => !loaded.has(t.id) && (catalogNorm(t.id).includes(q) || catalogNorm(t.label).includes(q)))
            .map(t => ({ t, rank: catalogRank(t) }))
            .sort((a, b) => a.rank - b.rank
                || String(a.t.id).length - String(b.t.id).length
                || String(a.t.id).localeCompare(String(b.t.id)))
            .slice(0, 50)
            .map(x => x.t);
        if (!matches.length) {
            box.innerHTML = `<div class="nsft-sql-schema-empty">${escapeHtml(chrome.i18n.getMessage('sql_schema_catalog_none') || 'Sin coincidencias en el catálogo')}</div>`;
            return;
        }
        matches.forEach(t => {
            const row = document.createElement('div');
            row.className = 'nsft-sql-schema-leaf nsft-sql-schema-leaf-catalog';
            const rowIcon = document.createElement('span');
            rowIcon.className = 'nsft-sql-schema-icon nsft-sql-hint-icon nsft-sql-hint-icon-JOIN';
            rowIcon.textContent = '+';
            const rowId = document.createElement('span');
            rowId.className = 'nsft-sql-schema-id';
            appendHighlighted(rowId, t.id, q);
            const rowLbl = document.createElement('span');
            rowLbl.className = 'nsft-sql-schema-lbl';
            appendHighlighted(rowLbl, (t.label && t.label !== t.id) ? t.label : '', q);
            row.appendChild(rowIcon);
            row.appendChild(rowId);
            row.appendChild(rowLbl);
            row.addEventListener('mouseenter', () => {
                catalogIndex = catalogRowEls().indexOf(row);
                paintCatalogSelection(false);
            });
            row.title = chrome.i18n.getMessage('sql_schema_catalog_load') || 'Cargar el esquema de esta tabla';
            row.addEventListener('click', () => {
                schemaExpanded.add('T:' + t.id);
                fetchTableSchema(t.id);
                toggleCatalogPop(false);
            });
            const openBtn = document.createElement('span');
            openBtn.className = 'nsft-sql-schema-open-cat';
            openBtn.textContent = '↗';
            openBtn.title = chrome.i18n.getMessage('sql_schema_ctx_open_catalog') || 'Abrir en el Catálogo de Registros';
            openBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                openInRecordsCatalog(t.id);
            });
            row.appendChild(openBtn);
            box.appendChild(row);
        });
        catalogIndex = 0;
        paintCatalogSelection(false);
    }

    async function fetchTableSchema(tableName, opts) {
        tableName = normalizeTableName(tableName);
        opts = opts || {};
        if (!tableName) return;
        if (!opts.force && (sqlHintTables[tableName] || failedTables.has(tableName))) {
            return;
        }

        if (!opts.force && await ensureTableInMemory(tableName)) {
            renderSchemaTree();
            if (typeof runLint === 'function' && lintEnabled) runLint();
            return;
        }

        const url = schemaDetailUrl(tableName);

        if (opts.auto) setAutoPulse(true);
        logToToolbar(chrome.i18n.getMessage('sql_fetching_details', [tableName]) || `Fetching details for ${tableName}...`);
        return fetch(url)
            .then(res => {
                if (!res.ok) throw new Error("HTTP " + res.status);
                return res.json();
            })
            .then(json => {
                if (json.status === "ok" && json.data && json.data.fields) {
                    const loadedCount = ingestSchemaResponse(tableName, json.data);
                    logToToolbar(chrome.i18n.getMessage('sql_loaded_fields', [String(loadedCount), tableName]) || `Loaded ${loadedCount} fields for ${tableName}`, 'success');
                } else {
                    failedTables.add(tableName);
                    logToToolbar(chrome.i18n.getMessage('sql_not_found_table', [tableName]) || `Not found ${tableName} table`, 'warning');
                }
            })
            .catch(() => {
                failedTables.add(tableName);
                logToToolbar(chrome.i18n.getMessage('sql_not_found_table', [tableName]) || `Not found ${tableName} table`, 'warning');
            })
            .finally(() => {
                if (opts.auto) setAutoPulse(false);
            });
    }

    function ingestSchemaResponse(tableName, data, opts) {
        const o = opts || {};
        tableName = normalizeTableName(tableName);
        if (!tableName || !data || !Array.isArray(data.fields)) return 0;
        userRemovedTables.delete(tableName);

        const fieldsMap = {};
        for (const f of data.fields) {
            fieldsMap[f.id] = {
                id: f.id,
                label: f.label || '',
                dataType: f.dataType || '',
                fieldType: f.fieldType || '',
                isAvailable: f.isAvailable !== false,
                removed: f.removed === true,
                availabilityDetails: Array.isArray(f.availabilityDetails) ? f.availabilityDetails : [],
                features: Array.isArray(f.features) ? f.features : [],
                featureNames: Array.isArray(f.featureNames) ? f.featureNames : [],
                permissions: Array.isArray(f.permissions) ? f.permissions : [],
                permissionCodes: Array.isArray(f.permissionCodes) ? f.permissionCodes : [],
                isColumn: f.isColumn !== false,
                joins: Array.isArray(f.joins) ? f.joins.map(j => ({
                    id: j.id,
                    fieldId: j.fieldId || f.id,
                    targetTable: j.sourceTargetType ? normalizeTableName(j.sourceTargetType.id) : null,
                    targetLabel: j.sourceTargetType ? j.sourceTargetType.label : null,
                    cardinality: j.cardinality || null
                })) : []
            };
        }

        const joinsMap = {};
        if (Array.isArray(data.joins)) {
            for (const j of data.joins) {
                const pairs = j.sourceTargetType && Array.isArray(j.sourceTargetType.joinPairs)
                    ? j.sourceTargetType.joinPairs : [];
                const onClause = pairs.length
                    ? pairs.map(p => p.label).filter(Boolean).join(' AND ')
                    : null;
                joinsMap[j.id] = {
                    id: j.id,
                    fieldId: j.fieldId || null,
                    targetTable: j.sourceTargetType ? normalizeTableName(j.sourceTargetType.id) : null,
                    targetTableRaw: j.sourceTargetType ? j.sourceTargetType.id : null,
                    targetLabel: j.sourceTargetType ? j.sourceTargetType.label : null,
                    cardinality: j.cardinality || null,
                    joinType: j.joinType || null,
                    isAvailable: j.isAvailable !== false,
                    onClause: onClause
                };
            }
        }

        sqlTableMeta[tableName] = {
            id: data.id || tableName,
            label: data.label || tableName,
            recordClass: data.recordClass || null,
            permissionCodes: Array.isArray(data.permissionCodes) ? data.permissionCodes : [],
            featureNames: Array.isArray(data.featureNames) ? data.featureNames : [],
            fields: fieldsMap,
            joins: joinsMap
        };

        saveSchemaToCache(tableName, data);

        const hintEntries = Object.values(fieldsMap)
            .filter(f => f.isAvailable && !f.removed)
            .sort((a, b) => a.id.localeCompare(b.id))
            .map(f => ({
                text: f.id,
                displayText: f.id,
                className: 'nsft-sql-hint-entry',
                render: buildHintRenderer(f)
            }));

        addSqlTable(tableName, hintEntries);

        if (!o.deferUi) {
            const sidebar = document.getElementById('nsft-sql-schema-sidebar');
            if (sidebar && !sidebar.classList.contains('collapsed')) renderSchemaTree();

            if (typeof runLint === 'function' && lintEnabled) runLint();
        }

        return hintEntries.length;
    }

    let _sqlBooting = false;
    let _bootWatchdog = null;
    let _staleOnBoot = [];
    const _sqlBootQueue = [];
    const BOOT_STEPS = 5;
    const BOOT_MAX_MS = 20000;

    function afterPaint() {
        return new Promise((resolve) => {
            const raf = window.requestAnimationFrame || ((cb) => setTimeout(cb, 16));
            raf(() => setTimeout(resolve, 0));
        });
    }

    function showBootOverlay() {
        if (document.getElementById('nsft-sql-boot')) return;
        const el = document.createElement('div');
        el.id = 'nsft-sql-boot';
        el.className = 'nsft-sql-boot';
        el.setAttribute('data-nsft-ui', '');
        el.setAttribute('role', 'status');
        el.setAttribute('aria-live', 'polite');
        el.innerHTML =
            '<div class="nsft-sql-boot-card">' +
                '<div class="nsft-sql-boot-top">' +
                    '<span class="nsft-ui-spinner nsft-sql-boot-spin"></span>' +
                    '<span class="nsft-sql-boot-title"></span>' +
                '</div>' +
                '<div class="nsft-sql-boot-step"></div>' +
                '<div class="nsft-sql-boot-bar"><span></span></div>' +
            '</div>';
        el.querySelector('.nsft-sql-boot-title').textContent =
            chrome.i18n.getMessage('sql_boot_title') || 'SuiteQL Runner';
        document.body.appendChild(el);
        setBootStep('sql_boot_step_shell', 'Preparando el runner…', 1);
        clearTimeout(_bootWatchdog);
        _bootWatchdog = setTimeout(finishBoot, BOOT_MAX_MS);
    }

    function setBootStep(key, fallback, step, subs) {
        const el = document.getElementById('nsft-sql-boot');
        if (!el) return;
        const txt = el.querySelector('.nsft-sql-boot-step');
        const bar = el.querySelector('.nsft-sql-boot-bar span');
        if (txt) txt.textContent = chrome.i18n.getMessage(key, subs) || fallback;
        if (bar) bar.style.width = Math.min(100, Math.round((step / BOOT_STEPS) * 100)) + '%';
    }

    function hideBootOverlay() {
        const el = document.getElementById('nsft-sql-boot');
        if (!el) return;
        el.classList.add('is-done');
        setTimeout(() => el.remove(), 220);
    }

    function focusEditorOnOpen() {
        if (!editor) return;
        requestAnimationFrame(() => {
            const modal = document.getElementById('nsft-sql-modal');
            if (!modal || modal.style.display === 'none') return;
            if (modal.dataset.state === 'minimised') return;
            const act = document.activeElement;
            if (act && act !== document.body && modal.contains(act) &&
                /^(INPUT|SELECT)$/.test(act.tagName)) return;
            try {
                editor.focus();
                if (!editor.somethingSelected()) {
                    const cur = editor.getCursor();
                    if (cur.line === 0 && cur.ch === 0) {
                        const ultima = editor.lastLine();
                        editor.setCursor({ line: ultima, ch: editor.getLine(ultima).length });
                    }
                }
            } catch (e) { }
        });
    }

    function finishBoot() {
        _sqlBooting = false;
        clearTimeout(_bootWatchdog);
        _bootWatchdog = null;
        hideBootOverlay();
        const pending = _sqlBootQueue.splice(0);
        pending.forEach((fn) => { try { fn(); } catch (err) { } });
        focusEditorOnOpen();
    }

    async function initModal() {
        if (document.getElementById('nsft-sql-modal')) return;
        _sqlBooting = true;

        try {
            await afterPaint();

            document.body.insertAdjacentHTML('beforeend', getHtmlTemplate());
            _nsftApplyThemeToModal();
            addModalListeners();

            loadThemeCss(currentTheme);

            await afterPaint();
            setBootStep('sql_boot_step_editor', 'Cargando el editor SQL…', 2);


            let _sqlTeclas = {};
            const textArea = document.getElementById("nsft-sql-query-input");
            if (textArea && typeof CodeMirror !== 'undefined') {
                editor = CodeMirror.fromTextArea(textArea, {
                    mode: "text/x-sql",
                    theme: currentTheme,
                    lineNumbers: true,
                    matchBrackets: true,
                    autoCloseBrackets: true,

                    cursorScrollMargin: 80,

                    configureMouse: (window.NSFT_CodeEditor && window.NSFT_CodeEditor.ratonMultiCursor)
                        || ((cm, repeat, ev) => ({ addNew: ev.altKey || ev.ctrlKey || ev.metaKey })),

                    extraKeys: Object.assign(
                        (window.NSFT_CodeEditor && window.NSFT_CodeEditor.atajosEdicion)
                            ? window.NSFT_CodeEditor.atajosEdicion() : {},
                        (_sqlTeclas = {
                        'Ctrl-F': () => { handleEditFind(); },
                        'Cmd-F': () => { handleEditFind(); },
                        'Ctrl-Space': 'autocomplete',
                        'Tab': (cm) => { if (!sqlGhostAcepta()) return CodeMirror.Pass; },
                        'Esc': () => { if (_sqlGhost) sqlGhostLimpia(); else return CodeMirror.Pass; }
                    })),

                    hintOptions: {
                        hint: sqlHintWithChain,
                        tables: sqlHintTables,
                        keywords: false,
                        functions: false,
                        completeSingle: false
                    }
                });

                if (window.NSFT_CodeEditor && window.NSFT_CodeEditor.registraEditor) {
                    window.NSFT_CodeEditor.registraEditor(editor, _sqlTeclas);
                }

                watchHintsPopup();

                editor.on('inputRead', sqlGhostProgramar);
                editor.on('endCompletion', sqlGhostProgramar);
                editor.on('change', (cm, ch) => {
                    if (ch.origin !== '+nsftGhost') sqlGhostLimpia();
                });
                editor.on('cursorActivity', () => { if (_sqlGhost) sqlGhostLimpia(); });
                editor.on('blur', sqlGhostLimpia);

                const hintTrasPintar = (cm) => {
                    const raf = window.requestAnimationFrame || ((cb) => setTimeout(cb, 16));
                    raf(() => setTimeout(() => {
                        if (!editor || !cm.hasFocus()) return;
                        cm.showHint({ completeSingle: false });
                    }, 0));
                };

                editor.on("inputRead", (cm, change) => {
                    const typedCh = change.text[0];
                    if (typedCh === ".") {
                        hintTrasPintar(cm);
                        return;
                    }
                    if (!/[\w$]/.test(typedCh || '')) return;
                    const tok = cm.getTokenAt(cm.getCursor());
                    const word = tok && tok.string ? tok.string : '';
                    if (word.length < 3 || !/^[a-z_][a-z0-9_]*$/i.test(word)) return;
                    if (resolveSingleTableHint(cm)) hintTrasPintar(cm);
                });

                editor.setSize("100%", "100%");

                initHoverTooltip();
                initLinter();



                const updateStats = (force = false) => {
                    const doc = editor.getDoc();
                    const cursor = doc.getCursor();
                    const ln = cursor.line + 1;
                    const col = cursor.ch + 1;
                    const totalLines = doc.lineCount();
                    const charCount = editor.getValue().length;
                    const pos = doc.indexFromPos(cursor);

                    const statsEl = document.getElementById('nsft-sql-editor-stats');
                    if (statsEl) {
                        if (!force && statsEl.querySelector('input')) return;

                        statsEl.innerHTML = `
                            <span class="nsft-sql-stat-item">Len: ${charCount}</span>
                            <span class="nsft-sql-stat-item">Lines: ${totalLines}</span>
                            <span class="nsft-sql-stat-item nsft-sql-stat-editable" id="nsft-sql-stat-coords" title="Click to go to line:col">${ln}:${col}</span>
                            <span class="nsft-sql-stat-item">Pos: ${pos}</span>
                        `;

                        document.getElementById('nsft-sql-stat-coords').onclick = function (e) {
                            if (this.querySelector('input')) return;

                            const currentCoords = this.textContent;
                            this.classList.add('editing');
                            this.innerHTML = `<input type="text" value="${escapeHtml(currentCoords)}" class="nsft-sql-stat-input">`;
                            const input = this.querySelector('input');
                            input.focus();
                            input.select();

                            input.onclick = (ev) => ev.stopPropagation();

                            const moveAndFinish = () => {
                                const val = input.value;
                                const parts = val.split(':');
                                const targetLn = parseInt(parts[0]);
                                const targetCol = parseInt(parts[1] || 1);

                                if (!isNaN(targetLn)) {
                                    editor.setCursor({
                                        line: Math.max(1, targetLn) - 1,
                                        ch: Math.max(1, targetCol) - 1
                                    });
                                    editor.focus();
                                }
                                updateStats(true);
                            };

                            input.onkeydown = (e) => {
                                if (e.key === 'Enter') {
                                    e.preventDefault();
                                    input.onblur = null;
                                    moveAndFinish();
                                }
                                if (e.key === 'Escape') {
                                    e.preventDefault();
                                    input.onblur = null;
                                    updateStats(true);
                                }
                            };
                            input.onblur = () => {
                                setTimeout(() => updateStats(true), 150);
                            };
                        };
                    }
                };

                let tableFetchTimeout;

                const checkTableDetail = (instance) => {
                    const content = instance.getValue();

                    const cursor = instance.getCursor();
                    const token = instance.getTokenAt(cursor);
                    const currentTokenString = token ? token.string : null;

                    if (!AUTO_SCHEMA) return;

                    const tables = parseTablesFromQuery(content);
                    const tablesToFetch = tables.filter(tableName =>
                        !sqlHintTables[tableName]
                        && !failedTables.has(tableName)
                        && !userRemovedTables.has(tableName)
                        && currentTokenString !== tableName
                    );

                    if (tablesToFetch.length > 0) {
                        clearTimeout(tableFetchTimeout);
                        tableFetchTimeout = setTimeout(() => {
                            tablesToFetch.forEach(t => fetchTableSchema(t, { auto: true }));
                        }, 1000);
                    }
                };

                editor.on("cursorActivity", updateStats);
                editor.on("change", (instance) => {
                    updateStats();
                    checkTableDetail(instance);
                    if (!_suppressEditorChange) {
                        captureActiveTabFromEditor();
                        markActiveTabDirty();
                    }
                });
                setTimeout(() => updateStats(), 100);
            }

            await afterPaint();
            setBootStep('sql_boot_step_results', 'Preparando la tabla de resultados…', 3);

            initResultTable();

            const modal = document.getElementById('nsft-sql-modal');
            constrainModalToWindow(modal);
            bringToFront();

            modal.addEventListener('mousedown', bringToFront);

            injectFetcher(null);

            await afterPaint();
            setBootStep('sql_boot_step_tools', 'Ajustando paneles y herramientas…', 4);

            initPanelTabs();
            initFavoritesUI();
            initSnippetsUI();
            initVariablesUI();
            initToolbarMenuExclusivity();

            const joinBtn = document.getElementById('nsft-sql-tool-join');
            const joinMenu = document.getElementById('nsft-sql-join-menu');
            if (joinBtn && joinMenu) {
                document.addEventListener('click', (e) => {
                    if (!joinMenu.contains(e.target) && e.target !== joinBtn && !joinBtn.contains(e.target)) {
                        joinMenu.classList.remove('open');
                    }
                });
            }

            applySidebarState();
            applyViewState();
            initSchemaResizer();
            const schemaAddBtn = document.getElementById('nsft-sql-schema-add');
            if (schemaAddBtn) schemaAddBtn.addEventListener('click', (e) => { e.stopPropagation(); toggleCatalogPop(); });
            const schemaErdBtn = document.getElementById('nsft-sql-schema-erd');
            if (schemaErdBtn) schemaErdBtn.addEventListener('click', (e) => { e.stopPropagation(); openErdView(); });
            const schemaWipeBtn = document.getElementById('nsft-sql-schema-wipe');
            if (schemaWipeBtn) schemaWipeBtn.addEventListener('click', (e) => { e.stopPropagation(); handleWipeSchemaCache(); });
            const schemaAutoBtn = document.getElementById('nsft-sql-schema-auto');
            if (schemaAutoBtn) {
                paintAutoSchemaBtn();
                schemaAutoBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    chrome.storage.local.set({ suiteqlAutoSchema: !AUTO_SCHEMA });
                });
            }
            const schemaAllBtn = document.getElementById('nsft-sql-schema-all');
            if (schemaAllBtn) {
                schemaAllBtn.addEventListener('click', (e) => { e.stopPropagation(); handleBulkSchemaDownload(); });
            }
            const schemaRefreshBtn = document.getElementById('nsft-sql-schema-refresh');
            if (schemaRefreshBtn) {
                schemaRefreshBtn.addEventListener('click', (e) => { e.stopPropagation(); handleRefreshSchema(); });
            }
            paintBulkButton();
            const catalogInputEl = document.getElementById('nsft-sql-schema-catalog-input');
            if (catalogInputEl) {
                catalogInputEl.addEventListener('input', (e) => { catalogQuery = e.target.value || ''; renderCatalogResults(); });
                catalogInputEl.addEventListener('keydown', (e) => {
                    e.stopPropagation();
                    if (e.key === 'Escape') { toggleCatalogPop(false); return; }
                    if (e.key === 'ArrowDown') { e.preventDefault(); moveCatalogSelection(1); return; }
                    if (e.key === 'ArrowUp') { e.preventDefault(); moveCatalogSelection(-1); return; }
                    if (e.key === 'Home') { e.preventDefault(); catalogIndex = 0; paintCatalogSelection(true); return; }
                    if (e.key === 'End') { e.preventDefault(); catalogIndex = catalogRowEls().length - 1; paintCatalogSelection(true); return; }
                    if (e.key === 'Enter') { e.preventDefault(); activateCatalogSelection(); }
                });
            }
            document.addEventListener('mousedown', (e) => {
                const pop = document.getElementById('nsft-sql-schema-catalog-pop');
                if (!pop || pop.hidden) return;
                if (pop.contains(e.target)) return;
                if (e.target.closest && e.target.closest('#nsft-sql-schema-add')) return;
                toggleCatalogPop(false);
            }, true);
            const schemaFilterEl = document.getElementById('nsft-sql-schema-filter');
            if (schemaFilterEl) {
                schemaFilterEl.addEventListener('input', (e) => {
                    schemaFilter = e.target.value || '';
                    _schemaFilterCollapsed.clear();
                    renderSchemaTree();
                });
            }
            wireFindClear('nsft-sql-schema-filter');
            wireFindClear('nsft-sql-results-search');
            wireFindClear('nsft-sql-logs-filter');
            wireFindClear('nsft-sql-schema-catalog-input');
            const treeEl = document.getElementById('nsft-sql-schema-tree');
            if (treeEl) treeEl.addEventListener('scroll', () => renderSchemaTree(), { passive: true });

            await afterPaint();
            setBootStep('sql_boot_step_schema', 'Cargando tablas en caché…', 5);

            await new Promise((resolve) => refreshSchemaIndexMem(resolve));

            await new Promise((resolve) => {
                loadTabsFromStorage(() => {
                    renderTabsBar();
                    const active = getActiveTab();
                    if (active && editor) {
                        _suppressEditorChange = true;
                        editor.setValue(active.query || '');
                        _suppressEditorChange = false;
                        editor.refresh();
                        currentFileName = active.fileName;
                        updateTitleState();
                    }
                    resolve();
                });
            });

            const enUso = editor ? parseTablesFromQuery(editor.getValue()) : [];
            const porCargar = enUso.filter((t) => _schemaIndexMem[t]);
            if (porCargar.length) {
                setBootStep('sql_boot_step_tables', 'Cargando tablas en caché…', 5,
                    [String(porCargar.length), String(porCargar.length)]);
                await Promise.all(porCargar.map(ensureTableInMemory));
                const ahora = Date.now();
                _staleOnBoot = porCargar.filter((t) => {
                    const e = _schemaIndexMem[t];
                    return e && e.ts && (ahora - e.ts) >= SCHEMA_CACHE_TTL_MS;
                });
            }

            flushSchemaTreeRender();
            if (typeof runLint === 'function' && lintEnabled) runLint();
            if (editor) editor.refresh();
            if (resultTable && typeof resultTable.redraw === 'function') {
                try { resultTable.redraw(true); } catch (err) { }
            }
            await afterPaint();
        } catch (err) {
            console.error('NSFT: SuiteQL Runner boot failed', err);
        } finally {
            finishBoot();
            scheduleStaleRefresh();
        }
    }

    function scheduleStaleRefresh() {
        const pending = _staleOnBoot.splice(0);
        if (!pending.length) return;
        setTimeout(() => {
            pending.forEach((t, i) => setTimeout(() => fetchTableSchema(t, { force: true }), i * 300));
        }, 1200);
    }

    function initResultTable() {
        const tableContainer = document.getElementById("nsft-sql-results-table");
        if (!tableContainer || typeof Tabulator === 'undefined') return;

        resultTable = new Tabulator("#nsft-sql-results-table", {
            height: "100%",
            layout: "fitData",
            pagination: true,
            paginationMode: "local",
            paginationSize: 20,
            paginationSizeSelector: [10, 20, 50, 100],
            paginationCounter: "rows",
            headerSortClickElement: "icon",
            selectableText: true,
            clipboard: true,
            data: [],
            placeholder: `<div class="nsft-sql-placeholder">${chrome.i18n.getMessage('sql_tabulator_placeholder') || 'No data to display'}</div>`,
            locale: "default",
            langs: {
                "default": {
                    "pagination": {
                        "page_size": chrome.i18n.getMessage('tbl_page_size') || "Rows per page",
                        "page_title": chrome.i18n.getMessage('tbl_page_title') || "Show page",
                        "first": chrome.i18n.getMessage('tbl_first') || "First",
                        "first_title": chrome.i18n.getMessage('tbl_first_title') || "First page",
                        "last": chrome.i18n.getMessage('tbl_last') || "Last",
                        "last_title": chrome.i18n.getMessage('tbl_last_title') || "Last page",
                        "prev": chrome.i18n.getMessage('tbl_prev') || "Prev",
                        "prev_title": chrome.i18n.getMessage('tbl_prev_title') || "Previous page",
                        "next": chrome.i18n.getMessage('tbl_next') || "Next",
                        "next_title": chrome.i18n.getMessage('tbl_next_title') || "Next page",
                        "all": chrome.i18n.getMessage('tbl_all') || "All"
                    },
                    "headerFilters": {
                        "default": chrome.i18n.getMessage('tbl_filter_col') || "filter column..."
                    },
                    "groups": {
                        "item": chrome.i18n.getMessage('tbl_item') || "item",
                        "items": chrome.i18n.getMessage('tbl_items') || "items"
                    },
                    "data": {
                        "loading": chrome.i18n.getMessage('tbl_loading') || "Loading...",
                        "error": chrome.i18n.getMessage('tbl_error') || "Error loading"
                    }
                }
            }
        });

        const buscador = document.getElementById('nsft-sql-results-search');
        if (buscador) {
            let searchTimer = 0;
            buscador.addEventListener('input', (e) => {
                const val = tsFold(e.target.value);
                clearTimeout(searchTimer);
                searchTimer = setTimeout(() => {
                    _resultsSearchTerm = val;
                    if (!resultTable) return;
                    const TS = window.NSFT_TextSearch;
                    resultTable.setFilter((row) => {
                        return Object.values(row).some(v => (TS ? TS.fold(v) : String(v).toLowerCase()).includes(val));
                    });
                    try { resultTable.redraw(true); } catch (err) { }
                }, 160);
            });
        }

        setupChartUI();
    }

    function setupChartUI() {
        const toggle = document.getElementById('nsft-sql-chart-toggle');
        if (!toggle || toggle.dataset.wired) return;
        toggle.dataset.wired = '1';
        toggle.addEventListener('click', () => {
            const showChart = toggle.dataset.mode !== 'chart';
            toggleChartView(showChart);
            toggle.blur();
        });
        const popout = document.getElementById('nsft-sql-chart-popout');
        if (popout && !popout.dataset.wired) {
            popout.dataset.wired = '1';
            popout.addEventListener('click', openChartInTab);
        }

        ['nsft-sql-chart-type', 'nsft-sql-chart-x', 'nsft-sql-chart-y', 'nsft-sql-chart-agg'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.addEventListener('change', renderChart);
        });
    }

    function toggleChartView(showChart) {
        const toggle = document.getElementById('nsft-sql-chart-toggle');
        const tableEl = document.getElementById('nsft-sql-results-table');
        const chartEl = document.getElementById('nsft-sql-chart-view');
        const search = document.getElementById('nsft-sql-results-search');
        if (!toggle || !tableEl || !chartEl) return;
        toggle.dataset.mode = showChart ? 'chart' : 'table';
        const labelSpan = toggle.querySelector('.nsft-sql-chart-label');
        if (labelSpan) {
            labelSpan.textContent = showChart
                ? (chrome.i18n.getMessage('sql_chart_table') || 'Table')
                : (chrome.i18n.getMessage('sql_chart_btn') || 'Chart');
        }
        const glyphSpan = toggle.querySelector('.nsft-sql-chart-glyph');
        if (glyphSpan) glyphSpan.textContent = showChart ? '▦' : '▥';
        tableEl.hidden = showChart;
        chartEl.hidden = !showChart;
        const searchWrap = search && search.closest('.nsft-sql-results-search-wrap');
        const searchHost = searchWrap || search;
        if (searchHost) searchHost.style.visibility = showChart ? 'hidden' : '';

        const copyBtn = document.getElementById('nsft-sql-copy-btn');
        if (copyBtn) copyBtn.hidden = !!showChart;

        const popoutBtn = document.getElementById('nsft-sql-chart-popout');
        if (popoutBtn) popoutBtn.hidden = !showChart;

        const exportBtn = document.getElementById('nsft-sql-export-btn');
        if (exportBtn) {
            const label = exportBtn.querySelector('span:not(.nsft-sql-btn-glyph)');
            if (label) {
                label.textContent = showChart
                    ? (chrome.i18n.getMessage('sql_chart_export_btn') || 'PNG')
                    : (chrome.i18n.getMessage('sql_submenu_export') || 'Export');
            }
            exportBtn.title = showChart
                ? (chrome.i18n.getMessage('sql_chart_export_title') || 'Descargar la gráfica como imagen')
                : `${chrome.i18n.getMessage('sql_submenu_export') || 'Export'} (${KBD_MOD}${KBD_SHIFT}E)`;
        }

        if (showChart) {
            populateChartControls();
            renderChart();
        }
    }

    function openChartInTab() {
        const data = (resultTable && resultTable.getData()) || [];
        if (!data.length) {
            logToToolbar(chrome.i18n.getMessage('tbl_empty') || 'No data available', 'warning');
            return;
        }

        const ySel = document.getElementById('nsft-sql-chart-y');
        const payload = {
            data,
            columns: resultsColumns(resultTable),
            type: (document.getElementById('nsft-sql-chart-type') || {}).value || 'bar',
            x: (document.getElementById('nsft-sql-chart-x') || {}).value || '',
            y: ySel ? Array.from(ySel.selectedOptions).map(o => o.value) : [],
            agg: (document.getElementById('nsft-sql-chart-agg') || {}).value || 'none',
            title: (getActiveTab() && getActiveTab().title) || 'SuiteQL'
        };

        const KEY = (window.NSFT_ChartCore && window.NSFT_ChartCore.HANDOFF_KEY) || 'nsftSqlChartHandoff';
        chrome.storage.local.set({ [KEY]: payload }, () => {
            if (chrome.runtime.lastError) {
                logToToolbar(chrome.i18n.getMessage('sql_chart_popout_fail') || 'Could not open the chart in a tab', 'error');
                return;
            }
            window.open(chrome.runtime.getURL('scripts/modules/suiteql_runner/chart/chart_view.html'), '_blank', 'noopener');
        });
    }

    function populateChartControls() {
        if (!resultTable) return;
        const data = resultTable.getData() || [];
        const cols = data.length ? resultsColumns(resultTable) : [];
        const numericCols = cols.filter(c => isNumericColumn(data, c));

        const xSel = document.getElementById('nsft-sql-chart-x');
        const ySel = document.getElementById('nsft-sql-chart-y');
        if (!xSel || !ySel) return;

        const prevX = xSel.value;
        const prevY = Array.from(ySel.selectedOptions).map(o => o.value);

        xSel.innerHTML = cols.map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('');
        ySel.innerHTML = numericCols.map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('');

        if (cols.includes(prevX)) {
            xSel.value = prevX;
        } else {
            const firstNonNumeric = cols.find(c => !numericCols.includes(c));
            xSel.value = firstNonNumeric || cols[0] || '';
        }
        const keepY = prevY.filter(c => numericCols.includes(c));
        if (keepY.length) {
            Array.from(ySel.options).forEach(o => { o.selected = keepY.includes(o.value); });
        } else if (numericCols.length) {
            ySel.options[0].selected = true;
        }
    }

    function isNumericColumn(data, col) {
        const rowCap = Math.min(data.length, 500);
        let seen = 0;
        for (let i = 0; i < rowCap && seen < 50; i++) {
            const v = data[i][col];
            if (v === null || v === undefined || v === '') continue;
            seen++;
            if (typeof v !== 'number' && !(typeof v === 'string' && v.trim() !== '' && isFinite(Number(v)))) return false;
        }
        return seen > 0;
    }

    function _chartMsg(text) {
        const msg = document.getElementById('nsft-sql-chart-msg');
        const wrap = document.querySelector('.nsft-sql-chart-canvas-wrap');
        if (msg) {
            msg.textContent = text || '';
            msg.hidden = !text;
        }
        if (wrap) wrap.style.display = text ? 'none' : '';
    }

    function renderChart() {
        const canvas = document.getElementById('nsft-sql-chart-canvas');
        if (!canvas || typeof window.Chart === 'undefined') return;
        if (chartInstance) { chartInstance.destroy(); chartInstance = null; }

        const data = (resultTable && resultTable.getData()) || [];
        if (!data.length) { _chartMsg(chrome.i18n.getMessage('tbl_empty') || 'No data available'); return; }

        const type = (document.getElementById('nsft-sql-chart-type') || {}).value || 'bar';
        const xField = (document.getElementById('nsft-sql-chart-x') || {}).value;
        const ySel = document.getElementById('nsft-sql-chart-y');
        let yFields = ySel ? Array.from(ySel.selectedOptions).map(o => o.value) : [];
        const agg = (document.getElementById('nsft-sql-chart-agg') || {}).value || 'none';

        if (!yFields.length && agg !== 'count') {
            _chartMsg(chrome.i18n.getMessage('sql_chart_no_numeric') || 'Select at least one numeric column for the Y axis (or use Count).');
            return;
        }
        if (type === 'pie') yFields = yFields.slice(0, 1);

        const { labels, series } = buildChartSeries(data, xField, yFields, agg);
        if (!labels.length) { _chartMsg(chrome.i18n.getMessage('tbl_empty') || 'No data available'); return; }
        _chartMsg('');

        chartInstance = new window.Chart(canvas.getContext('2d'), window.NSFT_ChartCore.buildConfig({
            type,
            labels,
            series,
            theme: _nsftResolveTheme(),
            title: (getActiveTab() && getActiveTab().title) || 'SuiteQL'
        }));
    }

    function buildChartSeries(data, xField, yFields, agg) {
        return window.NSFT_ChartCore.buildSeries(data, xField, yFields, agg);
    }


    function unionColumnKeys(data) {
        const order = [];
        const known = new Set();
        for (let r = 0; r < data.length; r++) {
            const keys = Object.keys(data[r]);
            let hasNew = false;
            for (let i = 0; i < keys.length; i++) {
                if (!known.has(keys[i])) { hasNew = true; break; }
            }
            if (!hasNew) continue;
            let insertAt = order.length;
            for (let i = keys.length - 1; i >= 0; i--) {
                const at = order.indexOf(keys[i]);
                if (at !== -1) { insertAt = at; continue; }
                order.splice(insertAt, 0, keys[i]);
                known.add(keys[i]);
            }
        }
        return order;
    }

    function selectListColumns(sql) {
        const text = String(sql || '');
        if (!text) return null;

        const m = /\bselect\b/i.exec(text);
        if (!m) return null;

        let depth = 0, quote = null, from = -1;
        const start = m.index + m[0].length;
        for (let i = start; i < text.length; i++) {
            const c = text[i];
            if (quote) { if (c === quote) quote = null; continue; }
            if (c === "'" || c === '"') { quote = c; continue; }
            if (c === '(') { depth++; continue; }
            if (c === ')') { depth--; continue; }
            if (depth === 0 && /\s/.test(c) && /^from\s/i.test(text.slice(i + 1, i + 6))) { from = i + 1; break; }
        }
        if (from === -1) return null;

        const list = text.slice(start, from);

        const parts = [];
        let buf = '';
        depth = 0; quote = null;
        for (const c of list) {
            if (quote) { buf += c; if (c === quote) quote = null; continue; }
            if (c === "'" || c === '"') { quote = c; buf += c; continue; }
            if (c === '*' && depth === 0) return null;
            if (c === '(') depth++;
            if (c === ')') depth--;
            if (c === ',' && depth === 0) { parts.push(buf); buf = ''; continue; }
            buf += c;
        }
        parts.push(buf);

        const out = [];
        for (let raw of parts) {
            let item = raw.replace(/\s+/g, ' ').trim();
            if (!item) return null;
            item = item.replace(/^distinct\s+/i, '').trim();
            item = item.replace(/^top\s+\d+\s+/i, '').trim();
            item = item.replace(/^distinct\s+/i, '').trim();
            if (!item) return null;

            let name = null;
            const simple = /^(?:[A-Za-z_][A-Za-z0-9_]*\.)?([A-Za-z_][A-Za-z0-9_]*)$/.exec(item);
            const asAlias = /\sas\s+(?:"([^"]+)"|([A-Za-z_][A-Za-z0-9_]*))$/i.exec(item);
            const dosToken = /^(?:[A-Za-z_][A-Za-z0-9_]*\.)?[A-Za-z_][A-Za-z0-9_]*\s+(?:"([^"]+)"|([A-Za-z_][A-Za-z0-9_]*))$/.exec(item);
            if (simple) name = simple[1];
            else if (asAlias) name = asAlias[1] || asAlias[2];
            else if (dosToken) name = dosToken[1] || dosToken[2];
            if (!name) return null;
            if (/^(?:from|where|as|end|null|else|then|when|case|desc|asc|and|or|not|is|in|like|between|distinct)$/i.test(name)) return null;
            out.push(name);
        }
        return out.length ? out : null;
    }

    function starColumnsFromSchema(sql) {
        if (!REST_FILL_COLUMNS) return null;
        if (_runVia !== 'rest') return null;

        const texto = String(sql || '');
        const m = /\bselect\b/i.exec(texto);
        if (!m) return null;
        let d = 0, q = null, hayStar = false;
        for (let i = m.index + m[0].length; i < texto.length; i++) {
            const c = texto[i];
            if (q) { if (c === q) q = null; continue; }
            if (c === "'" || c === '"') { q = c; continue; }
            if (c === '(') { d++; continue; }
            if (c === ')') { d--; continue; }
            if (d === 0 && c === '*') { hayStar = true; continue; }
            if (d === 0 && /\s/.test(c) && /^from\s/i.test(texto.slice(i + 1, i + 6))) break;
        }
        if (!hayStar) return null;

        const mapa = parseAliasMap(texto);
        const tablas = Array.from(new Set(Object.values(mapa)));
        if (tablas.length !== 1) return null;
        const meta = sqlTableMeta[tablas[0]];
        if (!meta || !meta.fields) return null;
        const campos = Object.values(meta.fields)
            .filter(f => f && f.isAvailable && !f.removed && f.isColumn)
            .map(f => f.id)
            .sort((a, b) => a.localeCompare(b));
        return campos.length ? campos : null;
    }

    function deriveColumnKeys(data, metaColumns, sql) {
        const fromData = unionColumnKeys(data);
        if (!Array.isArray(metaColumns) || !metaColumns.length) {
            const fromSql = selectListColumns(sql) || starColumnsFromSchema(sql);
            if (!fromSql) return fromData;
            metaColumns = fromSql;
        }

        const byLower = new Map();
        fromData.forEach(k => {
            const lc = String(k).toLowerCase();
            if (!byLower.has(lc)) byLower.set(lc, k);
        });

        const out = [];
        const used = new Set();
        metaColumns.forEach(name => {
            if (!name) return;
            const key = byLower.get(String(name).toLowerCase()) || String(name);
            if (used.has(key)) return;
            used.add(key);
            out.push(key);
        });
        fromData.forEach(k => { if (!used.has(k)) { used.add(k); out.push(k); } });
        return out;
    }

    function fetchDenominator(count, fetched) {
        const objetivo = Math.min(Number(count) || 0, MAX_RECORDS_FETCH);
        return objetivo > fetched ? objetivo : count;
    }

    function clearResults() {
        if (resultTable) {
            try { resultTable.clearFilter(true); } catch (e) { }
            try { resultTable.clearData(); } catch (e) { }
            try { resultTable.setColumns([]); } catch (e) { }
        }

        _resultsSearchTerm = '';
        const buscador = document.getElementById('nsft-sql-results-search');
        if (buscador) buscador.value = '';

        const chartToggle = document.getElementById('nsft-sql-chart-toggle');
        if (chartToggle && chartToggle.dataset.mode === 'chart') toggleChartView(false);

        const banner = document.getElementById('nsft-sql-trunc-banner');
        if (banner) { banner.hidden = true; banner.textContent = ''; }

        setRunState('idle');
        paintClearResultsBtn();
    }

    function paintClearResultsBtn(running) {
        const btn = document.getElementById('nsft-sql-clear-btn');
        if (!btn) return;
        const corriendo = (running === undefined) ? (_runPhase === 'running') : !!running;
        let hay = false;
        try { hay = !!(resultTable && resultTable.getDataCount() > 0); } catch (e) { hay = false; }
        btn.disabled = !hay || corriendo;
    }

    function normalizeRows(data, columnas) {
        if (!Array.isArray(data) || !data.length) return data;
        return data.map((row) => {
            const out = {};
            columnas.forEach((k) => {
                const v = row[k];
                out[k] = Array.isArray(v) ? v.join(', ') : (v === undefined ? null : v);
            });
            Object.keys(row).forEach((k) => {
                if (Object.prototype.hasOwnProperty.call(out, k)) return;
                const v = row[k];
                out[k] = Array.isArray(v) ? v.join(', ') : v;
            });
            return out;
        });
    }

    function updateResultTable(data, count, time, metaColumns, sql, stopReason) {
        if (!resultTable) return;


        const banner = document.getElementById('nsft-sql-trunc-banner');
        if (banner) {
            let texto = '';
            const ref = fetchDenominator(count, data.length);
            if (stopReason === 'user') {
                texto = count > data.length
                    ? (chrome.i18n.getMessage('sql_rows_capped_user', [fmtNum(data.length), fmtNum(ref)])
                        || `Fetched ${fmtNum(data.length)} of ${fmtNum(ref)} rows: the execution was stopped before finishing, so the results are incomplete.`)
                    : (chrome.i18n.getMessage('sql_rows_capped_user_unknown', [fmtNum(data.length)])
                        || `Fetched ${fmtNum(data.length)} rows and the results are incomplete: the execution was stopped before finishing.`);
            } else if (data.length < count) {
                const args = [fmtNum(data.length), fmtNum(ref)];
                if (stopReason === 'governance') {
                    texto = chrome.i18n.getMessage('sql_truncated_gov', args)
                        || `Showing ${args[0]} of ${args[1]} rows. The run used up the NetSuite execution budget, which is not a setting.`;
                } else if (stopReason === 'limit') {
                    texto = chrome.i18n.getMessage('sql_truncated_limit', args)
                        || `Showing ${args[0]} of ${args[1]} rows. NetSuite stopped the download at its execution limit.`;
                } else if (stopReason === 'guard') {
                    texto = chrome.i18n.getMessage('sql_truncated_guard', args)
                        || `Showing ${args[0]} of ${args[1]} rows. The download stopped as a safeguard before finishing.`;
                } else if (data.length >= FETCH_ALL_CEILING) {
                    texto = chrome.i18n.getMessage('sql_truncated_ceiling', [fmtNum(data.length), fmtNum(count)])
                        || `Showing ${fmtNum(data.length)} of ${fmtNum(count)} rows: that is the most that can be fetched, by any method.`;
                } else {
                    texto = chrome.i18n.getMessage('sql_truncated_banner', [fmtNum(data.length), fmtNum(count), fmtNum(FETCH_ALL_CEILING)])
                        || `Showing ${fmtNum(data.length)} of ${fmtNum(count)} rows: that is the maximum you set, up to a ceiling of ${fmtNum(FETCH_ALL_CEILING)} rows.`;
                }
            }
            banner.textContent = texto;
            banner.hidden = !texto;
        }

        if (data.length > 0) {
            const claves = deriveColumnKeys(data, metaColumns, sql);
            data = normalizeRows(data, claves);
            const columns = claves.map(key => {
                let maxLen = key.length;
                const rowCap = Math.min(data.length, 500);
                let seen = 0;

                for (let i = 0; i < rowCap && seen < 50; i++) {
                    const val = data[i][key];
                    if (val !== null && val !== undefined) {
                        seen++;
                        const strLen = String(val).length;
                        if (strLen > maxLen) maxLen = strLen;
                    }
                }

                let calcWidth = (maxLen * 9) + 24;
                if (calcWidth > 600) calcWidth = 600;
                if (calcWidth < 50) calcWidth = 50;

                return {
                    title: key,
                    field: key,
                    sorter: detectType(data, key),
                    width: Math.ceil(calcWidth),
                    formatter: highlightCellFormatter
                };
            });

            resultTable.setColumns(columns);
            resultTable.setData(data);

            setTimeout(() => resultTable.redraw(), 100);
        } else {
            resultTable.setData([]);
            try { resultTable.setColumns([]); } catch (e) { }
        }

        paintClearResultsBtn();

        const chartToggle = document.getElementById('nsft-sql-chart-toggle');
        if (chartToggle && chartToggle.dataset.mode === 'chart') {
            populateChartControls();
            renderChart();
        }
    }

    function detectType(data, field) {
        for (const row of data) {
            const v = row[field];
            if (v === null || v === undefined) continue;
            if (typeof v === "number") return "number";
            if (typeof v === "boolean") return "boolean";
            if (typeof v === "string" && !isNaN(Date.parse(v)) && v.length > 8) return "date";
            return "string";
        }
        return "string";
    }

    let _sqlGhostOn = true;
    let _sqlGhostTimer = null;
    let _sqlGhostSeq = 0;
    let _sqlGhostPedido = null;
    let _sqlGhost = null;

    let _sqlGhostMaster = true;
    let _sqlGhostScope = true;

    chrome.storage.local.get({
        suiteqlAiComplete: true,
        enableAiAssistant: true,
        aiAssistantSuiteql: true
    }, (it) => {
        _sqlGhostOn = it.suiteqlAiComplete !== false;
        _sqlGhostMaster = it.enableAiAssistant !== false;
        _sqlGhostScope = it.aiAssistantSuiteql !== false;
        sqlGhostPintaBoton();
    });
    chrome.storage.onChanged.addListener((ch, area) => {
        if (area !== 'local') return;
        if (!ch.suiteqlAiComplete && !ch.enableAiAssistant && !ch.aiAssistantSuiteql) return;
        if (ch.suiteqlAiComplete) {
            _sqlGhostOn = ch.suiteqlAiComplete.newValue !== false;
            if (!_sqlGhostOn) sqlGhostLimpia();
        }
        if (ch.enableAiAssistant) _sqlGhostMaster = ch.enableAiAssistant.newValue !== false;
        if (ch.aiAssistantSuiteql) _sqlGhostScope = ch.aiAssistantSuiteql.newValue !== false;
        sqlGhostPintaBoton();
    });

    function sqlGhostPintaBoton() {
        const btn = document.getElementById('nsft-sql-tool-ghost');
        if (!btn) return;
        btn.hidden = !(_sqlGhostMaster && _sqlGhostScope);
        btn.classList.toggle('is-on', _sqlGhostOn);
        btn.classList.toggle('is-busy', !!_sqlGhostPedido);
    }

    function sqlGhostMenuCierra() {
        const m = document.getElementById('nsft-sql-ghost-menu');
        if (m) m.remove();
    }

    function sqlGhostMenuAbre(btn) {
        sqlGhostMenuCierra();
        chrome.storage.local.get({ nsft_ai_configs: {}, suiteqlAiModel: '' }, (st) => {
            const cfgs = st.nsft_ai_configs || {};
            const actual = String(st.suiteqlAiModel || '');
            const FAST = window.NSFT_AI_FAST || { nombres: {}, rapidos: {} };

            const menu = document.createElement('div');
            menu.id = 'nsft-sql-ghost-menu';
            menu.className = 'nsft-sql-ghost-menu';

            const titulo = document.createElement('div');
            titulo.className = 'nsft-sql-ghost-menu-title';
            titulo.textContent = chrome.i18n.getMessage('sscAiModelLabel') || 'Modelo para sugerencias:';
            menu.appendChild(titulo);

            const nota = document.createElement('div');
            nota.className = 'nsft-sql-ghost-menu-note';
            nota.textContent = chrome.i18n.getMessage('sscAiModelOnlyFast')
                || 'Sólo los modelos rápidos, aptos para completar mientras escribes.';
            menu.appendChild(nota);

            const item = (valor, texto) => {
                const el = document.createElement('button');
                el.type = 'button';
                el.className = 'nsft-sql-ghost-menu-item' + (valor === actual ? ' is-current' : '');
                el.textContent = texto;
                el.addEventListener('click', () => {
                    try { chrome.storage.local.set({ suiteqlAiModel: valor }); } catch (e) { }
                    sqlGhostMenuCierra();
                });
                menu.appendChild(el);
            };

            item('', chrome.i18n.getMessage('sscAiModelSameChat') || 'El mismo del chat');

            Object.keys(cfgs).forEach((pk) => {
                const c = cfgs[pk];
                if (!c || c.disabled) return;
                const visibles = (c.models || []).filter((m) => (c.hidden || []).indexOf(m) === -1);
                if (!visibles.length) return;
                const re = new RegExp(FAST.rapidos[pk] || FAST.generico || 'haiku|flash|nano|mini|lite|fast', 'i');
                const lista = visibles.filter((m) => re.test(String(m)));
                if (!lista.length) return;
                const grupo = document.createElement('div');
                grupo.className = 'nsft-sql-ghost-menu-group';
                grupo.textContent = (FAST.nombres || {})[pk] || pk;
                menu.appendChild(grupo);
                lista.forEach((m) => item(pk + '::' + m, m));
            });

            const modal = document.getElementById('nsft-sql-modal');
            (modal || document.body).appendChild(menu);

            const r = btn.getBoundingClientRect();
            menu.style.top = (r.bottom + 6) + 'px';
            menu.style.left = Math.max(8, Math.min(r.left, window.innerWidth - menu.offsetWidth - 8)) + 'px';

            const fuera = (e) => {
                if (menu.contains(e.target)) return;
                sqlGhostMenuCierra();
                document.removeEventListener('mousedown', fuera, true);
                document.removeEventListener('keydown', tecla, true);
            };
            const tecla = (e) => {
                if (e.key !== 'Escape') return;
                e.preventDefault();
                e.stopPropagation();
                sqlGhostMenuCierra();
                document.removeEventListener('mousedown', fuera, true);
                document.removeEventListener('keydown', tecla, true);
            };
            document.addEventListener('mousedown', fuera, true);
            document.addEventListener('keydown', tecla, true);
        });
    }

    function sqlGhostToggle() {
        try { chrome.storage.local.set({ suiteqlAiComplete: !_sqlGhostOn }); } catch (e) { }
    }

    function sqlGhostLimpia() {
        clearTimeout(_sqlGhostTimer);
        _sqlGhostPedido = null;
        if (_sqlGhost) {
            try { _sqlGhost.mark.clear(); } catch (e) { }
            if (_sqlGhost.widget) { try { _sqlGhost.widget.clear(); } catch (e) { } }
            _sqlGhost = null;
        }
        sqlGhostPintaBoton();
    }

    function sqlGhostAcepta() {
        if (!_sqlGhost || !editor) return false;
        const texto = _sqlGhost.text;
        const cur = editor.getCursor();
        sqlGhostLimpia();
        const resto = editor.getLine(cur.line).slice(cur.ch);
        let k = 0;
        while (k < resto.length && k < 4
            && ')]}\'"`'.indexOf(resto.charAt(k)) >= 0
            && texto.indexOf(resto.charAt(k)) >= 0) k++;
        editor.replaceRange(texto, cur, { line: cur.line, ch: cur.ch + k }, '+nsftGhost');
        clearTimeout(_sqlGhostTimer);
        _sqlGhostTimer = setTimeout(sqlGhostPedir, 250);
        return true;
    }

    function sqlGhostMuestra(texto) {
        if (!editor) return;
        sqlGhostLimpia();
        const lineas = String(texto).split('\n');
        const cur = editor.getCursor();
        const span = document.createElement('span');
        span.className = 'nsft-sql-ghost';
        span.textContent = lineas[0];
        const mark = editor.setBookmark(cur, { widget: span, insertLeft: false });
        let widget = null;
        let alto = 0;
        if (lineas.length > 1) {
            const block = document.createElement('pre');
            block.className = 'nsft-sql-ghost nsft-sql-ghost-block';
            block.textContent = lineas.slice(1).join('\n');
            widget = editor.addLineWidget(cur.line, block);
            alto = block.offsetHeight || 0;
        }
        _sqlGhost = { mark, widget, text: texto };
        try { editor.scrollIntoView({ line: cur.line, ch: cur.ch }, alto + 24); } catch (e) { }
    }

    function sqlGhostDebug() {
        try { console.debug.apply(console, ['[NSFT] ghost:'].concat([].slice.call(arguments))); } catch (e) { }
    }

    function sqlGhostPedir() {
        if (!(_sqlGhostMaster && _sqlGhostScope)) { sqlGhostDebug('el asistente está apagado en el popup'); return; }
        if (!_sqlGhostOn || !editor) { sqlGhostDebug('apagado o sin editor'); return; }
        if (!editor.hasFocus() || editor.somethingSelected()) { sqlGhostDebug('sin foco o con selección'); return; }
        if (editor.state.completionActive) { sqlGhostDebug('desplegable abierto'); return; }
        const cur = editor.getCursor();
        const prefix = editor.getRange({ line: 0, ch: 0 }, cur);
        if (!prefix.trim()) { sqlGhostDebug('documento vacío'); return; }
        const finDoc = { line: editor.lastLine(), ch: editor.getLine(editor.lastLine()).length };
        const suffix = editor.getRange(cur, finDoc);
        const id = 'g' + (++_sqlGhostSeq);
        _sqlGhostPedido = { id, gen: editor.changeGeneration(), line: cur.line, ch: cur.ch };
        window.dispatchEvent(new CustomEvent('nsft-sql-ai-complete', {
            detail: {
                id,
                prefix: prefix.slice(-3000),
                suffix: suffix.slice(0, 800),
                line: editor.getLine(cur.line).slice(0, cur.ch)
            }
        }));
        sqlGhostDebug('pedido', id);
        sqlGhostPintaBoton();
        setTimeout(() => {
            if (_sqlGhostPedido && _sqlGhostPedido.id === id) {
                _sqlGhostPedido = null;
                sqlGhostDebug(id, 'caducó sin respuesta (15 s) — ¿el agente no está escuchando?');
                sqlGhostPintaBoton();
            }
        }, 15000);
    }

    window.addEventListener('nsft-sql-ai-complete-result', (ev) => {
        const d = ev && ev.detail;
        if (!d) return;
        if (!_sqlGhostPedido || d.id !== _sqlGhostPedido.id) { sqlGhostDebug(d.id, 'respuesta huérfana (el pedido ya no espera)'); return; }
        const p = _sqlGhostPedido;
        _sqlGhostPedido = null;
        sqlGhostPintaBoton();
        if (!d.ok || !d.text || !editor) { sqlGhostDebug(d.id, 'el agente contestó sin sugerencia'); return; }
        const cur = editor.getCursor();
        if (editor.changeGeneration() !== p.gen || cur.line !== p.line || cur.ch !== p.ch) {
            sqlGhostDebug(d.id, 'descartada: el texto o el cursor se movieron mientras viajaba');
            return;
        }
        if (!editor.hasFocus()) { sqlGhostDebug(d.id, 'descartada: el editor perdió el foco'); return; }
        sqlGhostDebug(d.id, 'mostrada (' + d.text.length + ' chars)');
        sqlGhostMuestra(String(d.text));
    });

    function sqlGhostProgramar() {
        clearTimeout(_sqlGhostTimer);
        if (!_sqlGhostOn) return;
        _sqlGhostTimer = setTimeout(sqlGhostPedir, 800);
    }

    function getSqlHintTables() {
        return sqlHintTables;
    }

    function getSqlTableMeta(tableName) {
        if (tableName) return sqlTableMeta[normalizeTableName(tableName)] || null;
        return sqlTableMeta;
    }

    function loadThemeCss(themeName) {
        if (!themeName || themeName === 'default') return;

        let fileName = themeName;
        if (themeName.startsWith('solarized')) {
            fileName = 'solarized';
        }

        const linkId = 'nsft-codemirror-theme';
        let link = document.getElementById(linkId);

        if (!link) {
            link = document.createElement('link');
            link.id = linkId;
            link.rel = 'stylesheet';
            document.head.appendChild(link);
        }

        link.href = chrome.runtime.getURL(`scripts/libs/codemirror/theme/${fileName}.min.css`);
    }

    function updateTitleState() {
        const modal = document.getElementById('nsft-sql-modal');
        if (!modal) return;

        const titleEl = document.getElementById('nsft-sql-title');
        if (!titleEl) return;

        const baseTitle = chrome.i18n.getMessage('sql_title') || 'SuiteQL Runner';
        const displayTitle = currentFileName ? `${baseTitle} - ${currentFileName}` : baseTitle;

        if (modal.dataset.state === 'minimised') {
            titleEl.innerHTML = `<span class="nsft-sql-title-minimised">
                 <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#000000" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 4px; vertical-align: middle;"><ellipse cx="12" cy="5" rx="9" ry="3"></ellipse><path d="M3 5V19A9 3 0 0 0 21 19V5"></path><path d="M3 12A9 3 0 0 0 21 12"></path></svg>
                 ${chrome.i18n.getMessage('sql_title_minimised') || 'SuiteQL'}
             </span>`;
            setTimeout(() => snapToEdge(modal), 10);
        } else {
            titleEl.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#000000" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 6px; vertical-align: middle;"><ellipse cx="12" cy="5" rx="9" ry="3"></ellipse><path d="M3 5V19A9 3 0 0 0 21 19V5"></path><path d="M3 12A9 3 0 0 0 21 12"></path></svg>${escapeHtml(displayTitle)}`;
            constrainModalAfterTransition(modal);
        }
    }

    let _modalKeysBound = false;

    let _sqlEditorPct = 0;

    const MODAL_COMMANDS = [
        ['Mod+Enter', () => executeCurrentQuery()],
        ['Mod+S', () => handleFileSave()],
        ['Mod+Shift+S', () => handleFileSaveAs()],
        ['Mod+O', () => handleFileOpen()],
        ['Mod+Shift+F', () => handleEditFormat()],
        ['Mod+Shift+D', () => handleFileExport()],
        ['Mod+Shift+E', () => handleRunExport()],
        ['Mod+Shift+C', () => handleRunCopy()],
        ['Mod+B', () => toggleSchemaSidebar()],
        ['Mod+Shift+K', () => handleRefreshSchema()],
        ['Mod+Shift+G', () => importSavedQueriesFromFile()],
        ['Mod+Shift+Y', () => exportSavedQueriesToFile()],
        ['Mod+Shift+X', () => handleModalExit()],
        ['Mod+Shift+1', () => handleViewEditor()],
        ['Mod+Shift+2', () => handleViewTable()]
    ];

    function onModalKeydown(e) {
        const S = window.NSFT_Shortcuts;
        if (!S || typeof S.matches !== 'function') return;
        const modal = document.getElementById('nsft-sql-modal');
        const MS = window.NSFT_ModalStack;
        if (!modal || !MS || typeof MS.isActive !== 'function' || !MS.isActive(modal)) return;
        if (e.target && e.target.closest
            && e.target.closest('.nsft-sql-dialog, .nsft-sql-erd-overlay')) return;
        for (const [combo, run] of MODAL_COMMANDS) {
            if (!S.matches(e, combo)) continue;
            e.preventDefault();
            e.stopPropagation();
            run();
            return;
        }
    }

    function addModalListeners() {
        const modal = document.getElementById('nsft-sql-modal');
        if (!_modalKeysBound) {
            document.addEventListener('keydown', onModalKeydown, true);
            _modalKeysBound = true;
        }

        const resizer = document.getElementById('nsft-sql-resizer');
        const mainPanel = document.querySelector('.nsft-sql-main-panel');
        const resultsPanel = document.querySelector('.nsft-sql-results-panel');
        const runnerContent = document.querySelector('.nsft-sql-center') || document.querySelector('.suiteql-runner-content');

        if (resizer && mainPanel && resultsPanel && runnerContent) {
            let isResizing = false;

            try {
                chrome.storage.local.get(['nsft_sql_editor_height_pct'], (it) => {
                    const pct = Number(it && it.nsft_sql_editor_height_pct);
                    if (pct >= 15 && pct <= 80) {
                        _sqlEditorPct = pct;
                        mainPanel.style.flex = 'none';
                        mainPanel.style.height = pct + '%';
                        resultsPanel.style.flex = '1';
                        resultsPanel.style.height = 'auto';
                        if (editor) editor.refresh();
                        if (resultTable) {
                            if (resultTable.initialized) {
                                resultTable.redraw();
                            } else {
                                resultTable.on('tableBuilt', () => {
                                    try { resultTable.redraw(); } catch (e) { }
                                });
                            }
                        }
                    }
                });
            } catch (e) { }

            resizer.addEventListener('mousedown', (e) => {
                isResizing = true;
                mainPanel.classList.add('nsft-sql-noanim');
                resultsPanel.classList.add('nsft-sql-noanim');
                document.body.style.cursor = 'row-resize';
                e.preventDefault();
            });

            document.addEventListener('mousemove', (e) => {
                if (!isResizing) return;

                const containerRect = runnerContent.getBoundingClientRect();
                let newHeight = e.clientY - containerRect.top;

                const minHeight = 120;
                const totalHeight = containerRect.height;
                if (newHeight < minHeight) newHeight = minHeight;
                if (newHeight > totalHeight - minHeight) newHeight = totalHeight - minHeight;

                mainPanel.style.flex = 'none';
                mainPanel.style.height = `${newHeight}px`;

                resultsPanel.style.flex = '1';
                resultsPanel.style.height = 'auto';

                if (editor) editor.refresh();
                if (resultTable) resultTable.redraw();
            });

            document.addEventListener('mouseup', () => {
                if (isResizing) {
                    isResizing = false;
                    mainPanel.classList.remove('nsft-sql-noanim');
                    resultsPanel.classList.remove('nsft-sql-noanim');
                    document.body.style.cursor = 'default';
                    try {
                        const total = runnerContent.getBoundingClientRect().height;
                        const h = mainPanel.getBoundingClientRect().height;
                        if (total > 0 && h > 0) {
                            const pct = Math.max(15, Math.min(80, Math.round((h / total) * 100)));
                            _sqlEditorPct = pct;
                            chrome.storage.local.set({ nsft_sql_editor_height_pct: pct });
                        }
                    } catch (e) { }
                }
            });
        }

        const menuItems = modal.querySelectorAll('.nsft-sql-menu-item');
        let isMenuOpen = false;

        const closeAllMenus = () => {
            menuItems.forEach(item => item.classList.remove('active'));
            isMenuOpen = false;
        };

        menuItems.forEach(item => {
            item.addEventListener('click', (e) => {
                e.stopPropagation();


                const wasActive = item.classList.contains('active');
                closeAllMenus();


                if (!wasActive) {
                    item.classList.add('active');
                    isMenuOpen = true;
                }
            });

            item.addEventListener('mouseenter', () => {
                if (isMenuOpen) {
                    closeAllMenus();
                    item.classList.add('active');
                    isMenuOpen = true;
                }
            });
        });

        const docClickListener = () => {
            if (!document.getElementById('nsft-sql-modal')) {
                document.removeEventListener('click', docClickListener);
                return;
            }
            closeAllMenus();
        };
        setTimeout(() => document.addEventListener('click', docClickListener), 0);

        const clickHandler = (id, fn) => {
            const el = document.getElementById(id);
            if (el) el.addEventListener('click', fn);
        };

        const syncFullscreenBtn = () => {
            const btn = document.getElementById('nsft-sql-fullscreen');
            if (!btn) return;
            btn.title = chrome.i18n.getMessage(modal.dataset.state === 'fullscreen'
                ? 'sql_fullscreen_exit' : 'sql_fullscreen_enter') || '';
        };

        clickHandler('nsft-sql-minimise', () => {
            modal.dataset.state = 'minimised';
            updateTitleState();
            syncFullscreenBtn();
            dispatchLayoutUpdate();
        });

        clickHandler('nsft-sql-maximise', () => {
            modal.dataset.state = 'maximised';
            modal.style.top = lastMaximizedTop;
            modal.style.left = lastMaximizedLeft;
            updateTitleState();
            syncFullscreenBtn();
            dispatchLayoutUpdate();
        });

        clickHandler('nsft-sql-fullscreen', () => {
            if (modal.dataset.state === 'fullscreen') {
                modal.dataset.state = 'maximised';
                modal.style.top = lastMaximizedTop;
                modal.style.left = lastMaximizedLeft;
            } else {
                modal.dataset.state = 'fullscreen';
            }
            updateTitleState();
            syncFullscreenBtn();
            dispatchLayoutUpdate();
        });

        clickHandler('nsft-sql-close', () => {
            modal.remove();
            dispatchLayoutUpdate();
        });

        const header = modal.querySelector('.suiteql-runner-header');
        if (header) {
            header.addEventListener('dblclick', () => {
                const state = modal.dataset.state;
                if (state === 'minimised' || state === 'fullscreen') {
                    modal.dataset.state = 'maximised';
                    modal.style.top = lastMaximizedTop;
                    modal.style.left = lastMaximizedLeft;
                } else {
                    modal.dataset.state = 'minimised';
                }
                updateTitleState();
                syncFullscreenBtn();
                dispatchLayoutUpdate();
            });

            let mouseIsDown = false;
            let offsetX = 0;
            let offsetY = 0;

            const handleMouseMove = (event) => {
                if (mouseIsDown) {
                    event.preventDefault();
                    const newLeft = (event.clientX - offsetX) + 'px';
                    const newTop = Math.max(0, event.clientY - offsetY) + 'px';
                    modal.style.left = newLeft;
                    modal.style.top = newTop;
                    modal.style.right = 'auto';
                    modal.style.bottom = 'auto';

                    if (modal.dataset.state === 'maximised') {
                        lastMaximizedLeft = newLeft;
                        lastMaximizedTop = newTop;
                    }
                }
            };

            header.addEventListener('mousedown', (event) => {
                if (document.activeElement) document.activeElement.blur();
                if (event.target.closest('.nsft-header-actions')) return;
                if (modal.dataset.state === 'fullscreen') return;

                mouseIsDown = true;
                modal.classList.add('nsft-dragging');
                offsetX = event.clientX - modal.offsetLeft;
                offsetY = event.clientY - modal.offsetTop;
                window.addEventListener('mousemove', handleMouseMove);
            });

            window.addEventListener('mouseup', () => {
                if (mouseIsDown) {
                    modal.classList.remove('nsft-dragging');
                    if (modal.dataset.state === 'minimised') {
                        requestAnimationFrame(() => snapToEdge(modal));
                    }
                }
                mouseIsDown = false;
                window.removeEventListener('mousemove', handleMouseMove);
            });
        }

        setupMenuListeners();
    }

    function setupMenuListeners() {
        const registerAction = (id, handler) => {
            const el = document.getElementById(id);
            if (el) {
                el.addEventListener('click', (e) => {
                    e.stopPropagation();
                    handler();
                });
            }
        };

        registerAction('nsft-sql-action-open', handleFileOpen);
        registerAction('nsft-sql-action-save', handleFileSave);
        registerAction('nsft-sql-action-save-as', handleFileSaveAs);
        registerAction('nsft-sql-action-export', handleFileExport);
        registerAction('nsft-sql-export-btn', handleRunExport);
        registerAction('nsft-sql-copy-btn', handleRunCopy);
        registerAction('nsft-sql-clear-btn', clearResults);
        registerAction('nsft-sql-action-import-json', () => importSavedQueriesFromFile());
        registerAction('nsft-sql-action-export-json', exportSavedQueriesToFile);
        registerAction('nsft-sql-action-exit', handleModalExit);

        registerAction('nsft-sql-action-format', handleEditFormat);
        registerAction('nsft-sql-action-find', handleEditFind);
        registerAction('nsft-sql-action-autocomplete', () => {
            if (editor) editor.showHint({ completeSingle: false });
        });
        registerAction('nsft-sql-action-refresh-schema', handleRefreshSchema);
        registerAction('nsft-sql-action-variables', showVariablesDialog);

        registerAction('nsft-sql-action-run', handleRunRun);
        registerAction('nsft-sql-action-export-res', handleRunExport);

        registerAction('nsft-sql-action-view-table', handleViewTable);
        registerAction('nsft-sql-action-view-editor', handleViewEditor);
        registerAction('nsft-sql-action-schema-toggle', toggleSchemaSidebar);
        registerAction('nsft-sql-action-sidebar-left', () => setSidebarSide('left'));
        registerAction('nsft-sql-action-sidebar-right', () => setSidebarSide('right'));

        registerAction('nsft-sql-action-catalog', handleHelpCatalog);
        registerAction('nsft-sql-action-builtin-fn', () => window.open('https://docs.oracle.com/en/cloud/saas/netsuite/ns-online-help/article_161950565221.html', '_blank'));

        registerAction('nsft-sql-tool-open', handleFileOpen);
        registerAction('nsft-sql-tool-save', handleFileSave);
        registerAction('nsft-sql-tool-save-as', handleFileSaveAs);
        registerAction('nsft-sql-tool-format', handleToolbarFormat);
        registerAction('nsft-sql-tool-run', handleToolbarRun);
        registerAction('nsft-sql-tool-join', handleInsertJoin);
        registerAction('nsft-sql-tool-schema-toggle', toggleSchemaSidebar);
        registerAction('nsft-sql-tool-results-toggle', handleViewTable);
        registerAction('nsft-sql-tool-ghost', sqlGhostToggle);
        sqlGhostPintaBoton();
        const ghostBtn = document.getElementById('nsft-sql-tool-ghost');
        if (ghostBtn && !ghostBtn.dataset.menuWired) {
            ghostBtn.dataset.menuWired = '1';
            ghostBtn.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                e.stopPropagation();
                sqlGhostMenuAbre(ghostBtn);
            });
        }
        registerAction('nsft-sql-edge-schema', toggleSchemaSidebar);
        registerAction('nsft-sql-edge-results', handleViewTable);
        registerAction('nsft-sql-edge-ai', () => {
            const btn = document.getElementById('nsft-sql-tool-ai');
            if (btn) btn.click();
        });
        registerAction('nsft-sql-tool-lint', handleToggleLint);
        registerAction('nsft-sql-schema-close', toggleSchemaSidebar);
        registerAction('nsft-sql-results-close', handleViewTable);
    }

    function handleFileSave() {
        if (!editor) return;
        const query = editor.getValue();
        if (!query.trim()) {
            logToToolbar(chrome.i18n.getMessage('sql_empty_query') || 'Editor is empty', 'warning');
            return;
        }

        if (currentFileName) {
            saveQueryDirectly(currentFileName, query);
            return;
        }

        showSaveQueryDialog((name) => {
            saveQueryDirectly(name, query);
        });
    }

    function handleFileSaveAs() {
        if (!editor) return;
        const query = editor.getValue();
        if (!query.trim()) {
            logToToolbar(chrome.i18n.getMessage('sql_empty_query') || 'Editor is empty', 'warning');
            return;
        }

        showSaveQueryDialog((name) => {
            saveQueryDirectly(name, query);
        });
    }

    function saveQueryDirectly(name, query, opts) {
        opts = opts || {};
        let saved = {};
        try {
            saved = JSON.parse(localStorage.getItem(SAVED_QUERIES_KEY) || '{}');
        } catch (e) {
            saved = {};
        }

        const priorFavorite = (saved[name] && saved[name].favorite) === true;
        const favorite = opts.favorite !== undefined ? !!opts.favorite : priorFavorite;

        saved[name] = {
            query: query,
            date: new Date().toISOString(),
            favorite: favorite
        };

        localStorage.setItem(SAVED_QUERIES_KEY, JSON.stringify(saved));
        _savedQueriesCache = saved;
        setActiveTabFileName(name);
        logToToolbar(`${chrome.i18n.getMessage('sql_saved') || 'Saved'}: ${name}`, 'success');

        updateTitleState();
    }

    function handleFileOpen() {
        let saved = {};
        try {
            saved = JSON.parse(localStorage.getItem(SAVED_QUERIES_KEY) || '{}');
        } catch (e) {
            saved = {};
        }

        showSavedQueriesDialog(saved, (selectedQueryData, name) => {
            if (!selectedQueryData) return;
            const sql = typeof selectedQueryData === 'string' ? selectedQueryData : selectedQueryData.query;
            createTab({ title: name, query: sql, fileName: name });
            logToToolbar(chrome.i18n.getMessage('sql_loaded') || 'Query loaded', 'info');
        });
    }

    function loadSavedQueries(cb) {
        let saved = {};
        try {
            saved = JSON.parse(localStorage.getItem(SAVED_QUERIES_KEY) || '{}');
        } catch (e) {
            saved = {};
        }
        cb(saved);
    }

    function writeSavedQueries(map, cb) {
        try {
            localStorage.setItem(SAVED_QUERIES_KEY, JSON.stringify(map));
            _savedQueriesCache = map;
        } catch (e) {
        }
        if (cb) cb();
    }

    function loadFavorites(cb) {
        loadSavedQueries((all) => {
            const favs = {};
            Object.entries(all).forEach(([name, entry]) => {
                if (entry && entry.favorite === true) favs[name] = entry;
            });
            cb(favs);
        });
    }

    function toggleFavorite(name, cb) {
        loadSavedQueries((all) => {
            if (!all[name]) { if (cb) cb(null); return; }
            all[name] = {
                ...all[name],
                favorite: !all[name].favorite
            };
            writeSavedQueries(all, () => { if (cb) cb(all[name].favorite); });
        });
    }

    function loadHistory(cb) {
        chrome.storage.local.get({ [HISTORY_STORAGE_KEY]: [] }, (items) => {
            const hist = Array.isArray(items[HISTORY_STORAGE_KEY]) ? items[HISTORY_STORAGE_KEY] : [];
            cb(hist);
        });
    }

    function saveHistory(hist, cb) {
        chrome.storage.local.set({ [HISTORY_STORAGE_KEY]: hist }, () => { if (cb) cb(); });
    }

    function addToHistory(query) {
        const q = (query || '').trim();
        if (!q) return;
        loadHistory((hist) => {
            const filtered = hist.filter(e => e && e.query !== q);
            filtered.unshift({
                query: q,
                executedAt: new Date().toISOString(),
                status: 'running',
                rows: null,
                durationMs: null,
                errorMsg: null
            });
            if (filtered.length > HISTORY_MAX) filtered.length = HISTORY_MAX;
            saveHistory(filtered);
        });
    }

    function updateLastHistoryEntry(patch) {
        loadHistory((hist) => {
            if (!hist.length) return;
            hist[0] = Object.assign({}, hist[0], patch);
            saveHistory(hist);
        });
    }

    function clearHistory(cb) {
        saveHistory([], cb);
    }

    function initFavoritesUI() {
        const btn = document.getElementById('nsft-sql-tool-favorites');
        const menu = document.getElementById('nsft-sql-favorites-menu');
        if (!btn || !menu) return;

        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (menu.classList.contains('open')) {
                menu.classList.remove('open');
                return;
            }
            renderFavoritesMenu(menu);
            menu.classList.add('open');
        });

        document.addEventListener('click', (e) => {
            if (!menu.contains(e.target) && e.target !== btn) {
                menu.classList.remove('open');
            }
        });
    }

    function renderFavoritesMenu(menu) {
        menu.innerHTML = `<div class="nsft-sql-fav-loading">${escapeHtml(chrome.i18n.getMessage('sql_loading') || 'Loading...')}</div>`;
        loadFavorites((favs) => {
            loadHistory((history) => {
                const names = Object.keys(favs).sort();
                const saveLabel = escapeHtml(chrome.i18n.getMessage('sql_fav_save_current') || 'Save current query as...');
                const favEmptyLabel = escapeHtml(chrome.i18n.getMessage('sql_fav_empty') || 'No favorites yet');
                const favHeader = escapeHtml(chrome.i18n.getMessage('sql_fav_header') || 'Favorites');
                const histHeader = escapeHtml(chrome.i18n.getMessage('sql_history_header') || 'Recent');
                const histEmpty = escapeHtml(chrome.i18n.getMessage('sql_history_empty') || 'No executed queries yet');
                const histClear = escapeHtml(chrome.i18n.getMessage('sql_history_clear') || 'Clear history');

                let html = `<div class="nsft-sql-fav-action" id="nsft-sql-fav-add">
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                                <span>${saveLabel}</span>
                            </div>`;

                html += `<div class="nsft-sql-fav-section-header">${favHeader}</div>`;
                if (names.length === 0) {
                    html += `<div class="nsft-sql-fav-empty">${favEmptyLabel}</div>`;
                } else {
                    html += names.map(n => {
                        const safeName = escapeHtml(n);
                        return `<div class="nsft-sql-fav-item" data-fav-name="${safeName}" title="${safeName}">
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>
                                    <span class="nsft-sql-fav-name">${safeName}</span>
                                    <span class="nsft-sql-fav-delete" data-fav-delete="${safeName}" title="${escapeHtml(chrome.i18n.getMessage('sql_fav_unstar') || 'Remove from favorites')}">×</span>
                                </div>`;
                    }).join('');
                }

                html += `<div class="nsft-sql-fav-section-header nsft-sql-fav-section-history">
                            <span>${histHeader}</span>
                            ${history.length > 0 ? `<button class="nsft-sql-history-clear" id="nsft-sql-history-clear" title="${histClear}">${histClear}</button>` : ''}
                         </div>`;
                if (history.length === 0) {
                    html += `<div class="nsft-sql-fav-empty">${histEmpty}</div>`;
                } else {
                    html += history.map((entry, idx) => {
                        const q = entry.query || '';
                        const preview = q.replace(/\s+/g, ' ').slice(0, 80);
                        const safePreview = escapeHtml(preview);
                        const timeAgo = entry.executedAt ? formatTimeAgo(entry.executedAt) : '';

                        const status = entry.status || 'ok';
                        const statusClass = `nsft-sql-hist-dot nsft-sql-hist-dot-${status}`;

                        const chipParts = [];
                        if (typeof entry.rows === 'number') {
                            chipParts.push(entry.rows + ' ' + (entry.rows === 1 ? 'row' : 'rows'));
                        }
                        if (typeof entry.durationMs === 'number') {
                            chipParts.push(entry.durationMs + ' ms');
                        }
                        const chip = chipParts.length
                            ? `<span class="nsft-sql-hist-chip">${escapeHtml(chipParts.join(' · '))}</span>`
                            : '';

                        const tipLines = [q];
                        if (status === 'error' && entry.errorMsg) tipLines.push('⚠ ' + entry.errorMsg);
                        const tooltip = escapeHtml(tipLines.join('\n'));

                        return `<div class="nsft-sql-hist-item" data-hist-idx="${idx}" title="${tooltip}">
                                    <span class="${statusClass}" aria-hidden="true"></span>
                                    <span class="nsft-sql-hist-preview">${safePreview}</span>
                                    ${chip}
                                    <span class="nsft-sql-hist-time">${escapeHtml(timeAgo)}</span>
                                </div>`;
                    }).join('');
                }

                menu.innerHTML = html;

                const addBtn = document.getElementById('nsft-sql-fav-add');
                if (addBtn) addBtn.addEventListener('click', () => {
                    menu.classList.remove('open');
                    handleFavoriteAdd();
                });
                menu.querySelectorAll('.nsft-sql-fav-item').forEach(el => {
                    el.addEventListener('click', (ev) => {
                        if (ev.target && ev.target.hasAttribute('data-fav-delete')) {
                            const n = ev.target.getAttribute('data-fav-delete');
                            handleFavoriteDelete(n, menu);
                            return;
                        }
                        const name = el.getAttribute('data-fav-name');
                        if (name && favs[name]) {
                            menu.classList.remove('open');
                            handleFavoriteLoad(name, favs[name]);
                        }
                    });
                });
                menu.querySelectorAll('.nsft-sql-hist-item').forEach(el => {
                    el.addEventListener('click', () => {
                        const i = parseInt(el.getAttribute('data-hist-idx'), 10);
                        const entry = history[i];
                        if (!entry) return;
                        menu.classList.remove('open');
                        createTab({
                            title: (chrome.i18n.getMessage('sql_tab_default_title') || 'Query') + ' ' + (tabs.length + 1),
                            query: entry.query,
                            fileName: null
                        });
                    });
                });
                const clearBtn = document.getElementById('nsft-sql-history-clear');
                if (clearBtn) clearBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    clearHistory(() => {
                        renderFavoritesMenu(menu);
                    });
                });
            });
        });
    }

    function formatTimeAgo(iso) {
        try {
            const then = new Date(iso).getTime();
            const diff = Date.now() - then;
            const m = Math.floor(diff / 60000);
            if (m < 1) return chrome.i18n.getMessage('sql_time_now') || 'now';
            if (m < 60) return m + 'm';
            const h = Math.floor(m / 60);
            if (h < 24) return h + 'h';
            const d = Math.floor(h / 24);
            return d + 'd';
        } catch (e) {
            return '';
        }
    }

    function handleFavoriteAdd() {
        if (!editor) return;
        const query = editor.getValue();
        if (!query.trim()) {
            logToToolbar(chrome.i18n.getMessage('sql_empty_query') || 'Editor is empty', 'warning');
            return;
        }
        showSaveQueryDialog((name) => {
            saveQueryDirectly(name, query, { favorite: true });
            logToToolbar(`${chrome.i18n.getMessage('sql_fav_saved') || 'Added to favorites'}: ${name}`, 'success');
        });
    }

    function handleFavoriteLoad(name, fav) {
        const query = (fav && typeof fav.query === 'string') ? fav.query : '';
        createTab({ title: name, query, fileName: name });
        logToToolbar(`${chrome.i18n.getMessage('sql_fav_loaded') || 'Favorite loaded'}: ${name}`, 'info');
    }

    function handleFavoriteDelete(name, menu) {
        loadSavedQueries((all) => {
            if (!all[name]) { renderFavoritesMenu(menu); return; }
            all[name] = { ...all[name], favorite: false };
            writeSavedQueries(all, () => {
                renderFavoritesMenu(menu);
                logToToolbar(`${chrome.i18n.getMessage('sql_fav_unstarred') || 'Removed from favorites'}: ${name}`, 'info');
            });
        });
    }

    let snippetsCache = [];

    function loadSnippets(cb) {
        chrome.storage.local.get({ [SNIPPETS_STORAGE_KEY]: [] }, (items) => {
            const raw = Array.isArray(items[SNIPPETS_STORAGE_KEY]) ? items[SNIPPETS_STORAGE_KEY] : [];
            snippetsCache = raw
                .filter(s => s && typeof s.name === 'string' && s.name.trim() && typeof s.code === 'string')
                .map(s => ({ name: s.name.trim(), code: s.code }));
            cb(snippetsCache);
        });
    }

    function saveSnippets(list, cb) {
        snippetsCache = (Array.isArray(list) ? list : [])
            .filter(s => s && s.name && typeof s.code === 'string');
        chrome.storage.local.set({ [SNIPPETS_STORAGE_KEY]: snippetsCache }, () => { if (cb) cb(); });
    }

    function initToolbarMenuExclusivity() {
        const toolbar = document.querySelector('#nsft-sql-modal .nsft-sql-toolbar');
        if (!toolbar) return;
        toolbar.addEventListener('click', (e) => {
            const btn = e.target.closest('.nsft-sql-toolbar-button');
            if (!btn) return;
            const ownWrap = btn.closest('.nsft-sql-favorites-wrap');
            toolbar.querySelectorAll('.nsft-sql-favorites-menu.open').forEach((m) => {
                if (ownWrap && ownWrap.contains(m)) return;
                m.classList.remove('open');
            });
            toggleCatalogPop(false);
        }, true);
    }

    function initVariablesUI() {
        const btn = document.getElementById('nsft-sql-tool-variables');
        const menu = document.getElementById('nsft-sql-variables-menu');
        if (!btn || !menu) return;

        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (menu.classList.contains('open')) { menu.classList.remove('open'); return; }
            renderVariablesMenu(menu);
            menu.classList.add('open');
        });

        document.addEventListener('click', (e) => {
            if (!menu.contains(e.target) && e.target !== btn && !btn.contains(e.target)) {
                menu.classList.remove('open');
            }
        });
    }

    function varTypeLabel(type) {
        if (type === 'runtime') return chrome.i18n.getMessage('sql_vars_type_runtime') || 'Ask on run';
        if (type === 'both') return chrome.i18n.getMessage('sql_vars_type_both') || 'Default + ask';
        return chrome.i18n.getMessage('sql_vars_type_fixed') || 'Fixed';
    }

    function renderVariablesMenu(menu) {
        const manageLabel = escapeHtml(chrome.i18n.getMessage('sql_vars_manage') || 'Manage variables…');
        const header = escapeHtml(chrome.i18n.getMessage('sql_vars_title') || 'Variables');
        const emptyLabel = escapeHtml(chrome.i18n.getMessage('sql_vars_empty') || 'No variables yet.');
        const vars = Array.isArray(sqlVariables) ? sqlVariables : [];

        let html = `<div class="nsft-sql-fav-section-header">${header}</div>`;
        if (!vars.length) {
            html += `<div class="nsft-sql-fav-empty">${emptyLabel}</div>`;
        } else {
            html += vars.map((v, idx) => {
                const safeName = escapeHtml(v.name);
                const type = escapeHtml(varTypeLabel(v.type));
                const preview = v.value ? escapeHtml(String(v.value).slice(0, 60)) : '';
                return `<div class="nsft-sql-fav-item nsft-sql-var-item" data-var-idx="${idx}" title="${preview}">
                            <span class="nsft-sql-fav-name">{{${safeName}}}</span>
                            <span class="nsft-sql-var-type">${type}</span>
                        </div>`;
            }).join('');
        }
        html += `<div class="nsft-sql-fav-action" id="nsft-sql-vars-manage">
                     <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9v.09a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>
                     <span>${manageLabel}</span>
                 </div>`;
        menu.innerHTML = html;

        menu.querySelectorAll('.nsft-sql-var-item').forEach((el) => {
            el.addEventListener('click', (e) => {
                e.stopPropagation();
                const v = vars[Number(el.getAttribute('data-var-idx'))];
                if (v) insertVariableAtCursor(v.name);
                menu.classList.remove('open');
            });
        });

        const manage = menu.querySelector('#nsft-sql-vars-manage');
        if (manage) manage.addEventListener('click', (e) => {
            e.stopPropagation();
            menu.classList.remove('open');
            showVariablesDialog();
        });
    }

    function insertVariableAtCursor(name) {
        if (!editor || !name) return;
        editor.replaceSelection('{{' + name + '}}');
        editor.focus();
    }

    function initSnippetsUI() {
        const btn = document.getElementById('nsft-sql-tool-snippets');
        const menu = document.getElementById('nsft-sql-snippets-menu');
        if (!btn || !menu) return;

        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (menu.classList.contains('open')) { menu.classList.remove('open'); return; }
            renderSnippetsMenu(menu);
            menu.classList.add('open');
        });

        document.addEventListener('click', (e) => {
            if (!menu.contains(e.target) && e.target !== btn) menu.classList.remove('open');
        });
    }

    function renderSnippetsMenu(menu) {
        menu.innerHTML = `<div class="nsft-sql-fav-loading">${escapeHtml(chrome.i18n.getMessage('sql_loading') || 'Loading...')}</div>`;
        loadSnippets((snips) => {
            const saveLabel = escapeHtml(chrome.i18n.getMessage('sql_snip_save_current') || 'Save selection as snippet…');
            const header = escapeHtml(chrome.i18n.getMessage('sql_snip_header') || 'Snippets');
            const emptyLabel = escapeHtml(chrome.i18n.getMessage('sql_snip_empty') || 'No snippets yet');

            let html = `<div class="nsft-sql-fav-action" id="nsft-sql-snip-add">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                            <span>${saveLabel}</span>
                        </div>`;
            html += `<div class="nsft-sql-fav-section-header">${header}</div>`;
            if (!snips.length) {
                html += `<div class="nsft-sql-fav-empty">${emptyLabel}</div>`;
            } else {
                html += snips.map((s, idx) => {
                    const safeName = escapeHtml(s.name);
                    const preview = escapeHtml((s.code || '').replace(/\s+/g, ' ').slice(0, 90));
                    return `<div class="nsft-sql-fav-item nsft-sql-snip-item" data-snip-idx="${idx}" title="${preview}">
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"></polyline><polyline points="8 6 2 12 8 18"></polyline></svg>
                                <span class="nsft-sql-fav-name">${safeName}</span>
                                <span class="nsft-sql-fav-delete" data-snip-delete="${idx}" title="${escapeHtml(chrome.i18n.getMessage('sql_snip_remove') || 'Delete snippet')}">×</span>
                            </div>`;
                }).join('');
            }
            menu.innerHTML = html;

            const addEl = menu.querySelector('#nsft-sql-snip-add');
            if (addEl) addEl.addEventListener('click', (e) => {
                e.stopPropagation();
                menu.classList.remove('open');
                handleSnippetSave();
            });

            menu.querySelectorAll('.nsft-sql-snip-item').forEach((item) => {
                item.addEventListener('click', (e) => {
                    const delEl = e.target.closest('[data-snip-delete]');
                    if (delEl) {
                        e.stopPropagation();
                        handleSnippetDelete(parseInt(delEl.getAttribute('data-snip-delete'), 10), menu);
                        return;
                    }
                    const idx = parseInt(item.getAttribute('data-snip-idx'), 10);
                    const snip = snippetsCache[idx];
                    if (snip) handleSnippetInsert(snip.code);
                    menu.classList.remove('open');
                });
            });
        });
    }

    function handleSnippetInsert(code) {
        if (!editor || typeof code !== 'string') return;
        editor.replaceSelection(code);
        editor.focus();
        logToToolbar(chrome.i18n.getMessage('sql_snip_inserted') || 'Snippet inserted', 'success');
    }

    function handleSnippetSave() {
        if (!editor) return;
        const sel = editor.getSelection();
        const code = (sel && sel.trim()) ? sel : editor.getValue();
        if (!code.trim()) {
            logToToolbar(chrome.i18n.getMessage('sql_empty_query') || 'Editor is empty', 'warning');
            return;
        }
        showSaveQueryDialog((name) => {
            loadSnippets((snips) => {
                const others = snips.filter(s => s.name !== name);
                others.push({ name, code });
                saveSnippets(others, () => {
                    logToToolbar(`${chrome.i18n.getMessage('sql_snip_saved') || 'Snippet saved'}: ${name}`, 'success');
                });
            });
        });
    }

    function handleSnippetDelete(idx, menu) {
        const target = snippetsCache[idx];
        if (!target) { renderSnippetsMenu(menu); return; }
        saveSnippets(snippetsCache.filter((_, i) => i !== idx), () => {
            renderSnippetsMenu(menu);
            logToToolbar(`${chrome.i18n.getMessage('sql_snip_deleted') || 'Snippet deleted'}: ${target.name}`, 'info');
        });
    }

    function saveVariables(list) {
        sqlVariables = normalizeVariables(list);
        chrome.storage.local.set({ [VARIABLES_STORAGE_KEY]: sqlVariables });
    }

    function showVariablesDialog() {
        if (document.getElementById('nsft-sql-vars-dialog')) return;

        const overlay = document.createElement('div');
        overlay.id = 'nsft-sql-vars-dialog';
        overlay.className = 'nsft-sql-dialog';

        const panel = document.createElement('div');
        panel.className = 'nsft-sql-vars-panel';

        const title = document.createElement('h3');
        title.className = 'nsft-sql-vars-title';
        title.textContent = chrome.i18n.getMessage('sql_vars_title') || 'SuiteQL Variables';

        const hint = document.createElement('p');
        hint.className = 'nsft-sql-vars-hint';
        hint.textContent = chrome.i18n.getMessage('sql_vars_hint')
            || 'Reference a variable in your query as {{name}} — it is replaced with its value when you run.';

        const list = document.createElement('div');
        list.className = 'nsft-sql-vars-list';

        const empty = document.createElement('div');
        empty.className = 'nsft-sql-vars-empty';
        empty.textContent = chrome.i18n.getMessage('sql_vars_empty') || 'No variables yet.';

        function refreshEmpty() {
            empty.style.display = list.querySelector('.nsft-sql-vars-row') ? 'none' : 'block';
        }

        function addRow(name, value, type) {
            const row = document.createElement('div');
            row.className = 'nsft-sql-vars-row';

            const nameInput = document.createElement('input');
            nameInput.type = 'text';
            nameInput.className = 'nsft-sql-vars-name';
            nameInput.placeholder = chrome.i18n.getMessage('sql_vars_name_ph') || 'name';
            nameInput.value = name || '';

            const typeSel = document.createElement('select');
            typeSel.className = 'nsft-sql-vars-type';
            [
                ['fixed', chrome.i18n.getMessage('sql_vars_type_fixed') || 'Fixed'],
                ['runtime', chrome.i18n.getMessage('sql_vars_type_runtime') || 'Ask on run'],
                ['both', chrome.i18n.getMessage('sql_vars_type_both') || 'Default + ask']
            ].forEach(([val, label]) => {
                const opt = document.createElement('option');
                opt.value = val;
                opt.textContent = label;
                typeSel.appendChild(opt);
            });
            typeSel.value = VAR_TYPES.indexOf(type) !== -1 ? type : 'fixed';

            const valueInput = document.createElement('input');
            valueInput.type = 'text';
            valueInput.className = 'nsft-sql-vars-value';
            valueInput.value = value != null ? value : '';

            const syncValueState = () => {
                const t = typeSel.value;
                valueInput.disabled = (t === 'runtime');
                valueInput.placeholder = t === 'runtime'
                    ? (chrome.i18n.getMessage('sql_vars_value_runtime_ph') || 'asked on each run')
                    : t === 'both'
                        ? (chrome.i18n.getMessage('sql_vars_value_default_ph') || 'default value')
                        : (chrome.i18n.getMessage('sql_vars_value_ph') || 'value');
            };
            typeSel.addEventListener('change', syncValueState);
            syncValueState();

            const del = document.createElement('button');
            del.type = 'button';
            del.className = 'nsft-sql-vars-del';
            del.textContent = '×';
            del.title = chrome.i18n.getMessage('sql_vars_remove') || 'Remove';
            del.onclick = () => { row.remove(); refreshEmpty(); };

            row.appendChild(nameInput);
            row.appendChild(typeSel);
            row.appendChild(valueInput);
            row.appendChild(del);
            list.appendChild(row);
            refreshEmpty();
            return nameInput;
        }

        (Array.isArray(sqlVariables) ? sqlVariables : []).forEach(v => addRow(v.name, v.value, v.type));
        refreshEmpty();

        const addBtn = document.createElement('button');
        addBtn.type = 'button';
        addBtn.className = 'nsft-sql-vars-add';
        addBtn.textContent = '+ ' + (chrome.i18n.getMessage('sql_vars_add') || 'Add variable');
        addBtn.onclick = () => { const el = addRow('', ''); if (el) el.focus(); };

        const footer = document.createElement('div');
        footer.className = 'nsft-sql-vars-footer';

        const btnCancel = document.createElement('button');
        btnCancel.type = 'button';
        btnCancel.className = 'nsft-sql-vars-btn nsft-sql-vars-cancel';
        btnCancel.textContent = chrome.i18n.getMessage('btn_cancel') || 'Cancel';
        btnCancel.onclick = () => overlay.remove();

        const btnSave = document.createElement('button');
        btnSave.type = 'button';
        btnSave.className = 'nsft-sql-vars-btn nsft-sql-vars-save';
        btnSave.textContent = chrome.i18n.getMessage('sql_submenu_save') || 'Save';
        btnSave.onclick = () => {
            const collected = Array.from(list.querySelectorAll('.nsft-sql-vars-row')).map(r => {
                const type = r.querySelector('.nsft-sql-vars-type').value;
                return {
                    name: (r.querySelector('.nsft-sql-vars-name').value || '').trim(),
                    value: type === 'runtime' ? '' : (r.querySelector('.nsft-sql-vars-value').value || ''),
                    type
                };
            }).filter(v => v.name);
            const byName = {};
            collected.forEach(v => { byName[v.name] = v; });
            saveVariables(Object.values(byName));
            overlay.remove();
            logToToolbar(chrome.i18n.getMessage('sql_vars_saved') || 'Variables saved', 'success');
        };

        footer.appendChild(btnCancel);
        footer.appendChild(btnSave);

        panel.appendChild(title);
        panel.appendChild(hint);
        panel.appendChild(list);
        panel.appendChild(empty);
        panel.appendChild(addBtn);
        panel.appendChild(footer);
        overlay.appendChild(panel);

        overlay.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') { e.stopPropagation(); overlay.remove(); }
        });

        const modalContainer = document.getElementById('nsft-sql-modal');
        if (modalContainer) modalContainer.appendChild(overlay);
    }

    function showSaveQueryDialog(onConfirm) {
        if (document.getElementById('nsft-save-dialog')) return;

        const overlay = document.createElement('div');
        overlay.id = 'nsft-save-dialog';
        overlay.className = 'nsft-sql-dialog';
        overlay.style.cssText = `
            position: absolute;
            top: 0; left: 0; right: 0; bottom: 0;
            background: rgba(0,0,0,0.4);
            z-index: 1000;
            display: flex;
            align-items: center;
            justify-content: center;
        `;

        const dialog = document.createElement('div');
        dialog.style.cssText = `
            background: white;
            padding: 20px;
            border-radius: 8px;
            box-shadow: 0 4px 6px rgba(0,0,0,0.1);
            min-width: 300px;
            display: flex;
            flex-direction: column;
            gap: 15px;
        `;

        const title = document.createElement('h3');
        title.textContent = chrome.i18n.getMessage('sql_save_prompt') || 'Query Name';
        title.style.margin = '0';
        title.style.fontSize = '16px';
        title.style.color = '#111827';

        const input = document.createElement('input');
        input.type = 'text';
        input.style.cssText = `
            padding: 8px;
            border: 1px solid #d1d5db;
            border-radius: 4px;
            font-size: 14px;
            width: 100%;
            box-sizing: border-box;
        `;
        input.placeholder = chrome.i18n.getMessage('sql_save_placeholder') || 'My Query...';

        setTimeout(() => input.focus(), 100);

        const btnContainer = document.createElement('div');
        btnContainer.style.cssText = 'display: flex; justify-content: flex-end; gap: 10px;';

        const btnCancel = document.createElement('button');
        btnCancel.textContent = chrome.i18n.getMessage('btn_cancel') || 'Cancel';
        btnCancel.style.cssText = `
            padding: 8px 16px;
            background: #f3f4f6;
            color: #374151;
            border: 1px solid #e5e7eb;
            border-radius: 4px;
            cursor: pointer;
        `;
        btnCancel.onclick = () => overlay.remove();

        const btnSave = document.createElement('button');
        btnSave.textContent = chrome.i18n.getMessage('sql_submenu_save') || 'Save';
        btnSave.style.cssText = `
            padding: 8px 16px;
            background: #10b981;
            color: white;
            border: none;
            border-radius: 4px;
            cursor: pointer;
        `;
        btnSave.onclick = () => {
            const val = input.value.trim();
            if (val) {
                onConfirm(val);
                const dialogEl = document.getElementById('nsft-save-dialog');
                if (dialogEl) dialogEl.remove();
            }
        };

        input.onkeydown = (e) => {
            if (e.key === 'Enter') btnSave.click();
            if (e.key === 'Escape') btnCancel.click();
        };

        btnContainer.appendChild(btnCancel);
        btnContainer.appendChild(btnSave);
        dialog.appendChild(title);
        dialog.appendChild(input);
        dialog.appendChild(btnContainer);
        overlay.appendChild(dialog);

        const modalContainer = document.getElementById('nsft-sql-modal');
        if (modalContainer) modalContainer.appendChild(overlay);
    }
    function handleFileExport() {
        if (!editor) return;
        const sqlContent = editor.getValue();
        if (!sqlContent.trim()) {
            logToToolbar(chrome.i18n.getMessage('sql_tabulator_placeholder') || 'No data to display', 'warning');
            return;
        }
        showExportFormatDialog((format) => {
            const extension = format === 'txt' ? 'txt' : 'sql';
            const mimeType = format === 'txt' ? 'text/plain' : 'text/sql';
            const blob = new Blob([sqlContent], { type: mimeType });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `query_${new Date().toISOString().slice(0, 10)}.${extension}`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        });
    }

    function showExportFormatDialog(onConfirm) {
        if (document.getElementById('nsft-export-dialog')) return;

        const overlay = document.createElement('div');
        overlay.id = 'nsft-export-dialog';
        overlay.className = 'nsft-sql-dialog';
        overlay.style.cssText = `
            position: absolute;
            top: 0; left: 0; right: 0; bottom: 0;
            background: rgba(0,0,0,0.4);
            z-index: 1000;
            display: flex;
            align-items: center;
            justify-content: center;
        `;

        const dialog = document.createElement('div');
        dialog.style.cssText = `
            background: white;
            padding: 20px;
            border-radius: 8px;
            box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
            text-align: center;
            min-width: 250px;
            font-family: 'Inter', system-ui, sans-serif;
        `;

        const title = document.createElement('h3');
        title.textContent = 'Select Format';
        title.style.cssText = 'margin: 0 0 16px 0; font-size: 16px; color: #111827;';

        const btnContainer = document.createElement('div');
        btnContainer.style.cssText = 'display: flex; gap: 10px; justify-content: center;';

        const btnSQL = document.createElement('button');
        btnSQL.textContent = 'SQL (.sql)';
        btnSQL.style.cssText = `
            padding: 8px 16px;
            background: #3b82f6;
            color: white;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-weight: 500;
        `;
        btnSQL.onclick = () => { close(); onConfirm('sql'); };

        const btnTXT = document.createElement('button');
        btnTXT.textContent = 'Text (.txt)';
        btnTXT.style.cssText = `
            padding: 8px 16px;
            background: #6b7280;
            color: white;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-weight: 500;
        `;
        btnTXT.onclick = () => { close(); onConfirm('txt'); };

        const close = () => {
            if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
        };

        overlay.onclick = (e) => {
            if (e.target === overlay) close();
        };

        btnContainer.appendChild(btnSQL);
        btnContainer.appendChild(btnTXT);
        dialog.appendChild(title);
        dialog.appendChild(btnContainer);
        overlay.appendChild(dialog);

        const modalContainer = document.getElementById('nsft-sql-modal');
        if (modalContainer) {
            modalContainer.appendChild(overlay);
        }
    }

    function exportSavedQueriesToFile() {
        loadSavedQueries((all) => {
            const count = Object.keys(all).length;
            if (!count) {
                logToToolbar(chrome.i18n.getMessage('sql_export_empty') || 'No saved queries to export', 'warning');
                return;
            }
            const payload = {
                kind: 'nsft-suiteql-queries',
                version: 1,
                exportedAt: new Date().toISOString(),
                queries: all
            };
            const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `nsft-suiteql-queries-${new Date().toISOString().slice(0, 10)}.json`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            setTimeout(() => URL.revokeObjectURL(url), 100);
            logToToolbar(chrome.i18n.getMessage('sql_export_ok', [String(count)]) || `Exported ${count} queries`, 'success');
        });
    }

    function importSavedQueriesFromFile(afterImport) {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json,application/json';
        input.style.display = 'none';
        document.body.appendChild(input);
        input.addEventListener('change', () => {
            const file = input.files && input.files[0];
            input.remove();
            if (!file) return;
            const reader = new FileReader();
            reader.onload = () => {
                try {
                    const data = JSON.parse(reader.result);
                    const incoming = data && typeof data === 'object'
                        ? (data.queries && typeof data.queries === 'object' ? data.queries : data)
                        : null;
                    if (!incoming || typeof incoming !== 'object') throw new Error('bad format');

                    loadSavedQueries((current) => {
                        let added = 0, renamed = 0, skipped = 0;
                        Object.entries(incoming).forEach(([origName, entry]) => {
                            if (!entry || typeof entry !== 'object') { skipped++; return; }
                            const q = typeof entry.query === 'string' ? entry.query : null;
                            if (!q) { skipped++; return; }
                            let target = origName;
                            if (current[target]) {
                                let n = 2;
                                while (current[`${origName} (${n})`]) n++;
                                target = `${origName} (${n})`;
                                renamed++;
                            }
                            current[target] = {
                                query: q,
                                date: entry.date || new Date().toISOString(),
                                favorite: entry.favorite === true
                            };
                            added++;
                        });
                        writeSavedQueries(current, () => {
                            logToToolbar(
                                chrome.i18n.getMessage('sql_import_ok', [String(added), String(renamed)])
                                || `Imported ${added} queries (${renamed} renamed)`,
                                'success'
                            );
                            if (afterImport) afterImport(current);
                        });
                    });
                } catch (e) {
                    logToToolbar(chrome.i18n.getMessage('sql_import_fail') || 'Import failed: invalid JSON file', 'warning');
                }
            };
            reader.readAsText(file);
        });
        input.click();
    }

    function showSavedQueriesDialog(queries, onSelect) {
        if (document.getElementById('nsft-open-dialog')) return;

        const overlay = document.createElement('div');
        overlay.id = 'nsft-open-dialog';
        overlay.className = 'nsft-sql-dialog';
        overlay.style.cssText = `
            position: absolute;
            top: 0; left: 0; right: 0; bottom: 0;
            background: rgba(0,0,0,0.5);
            z-index: 1000;
            display: flex;
            align-items: center;
            justify-content: center;
            backdrop-filter: blur(2px);
        `;

        const dialog = document.createElement('div');
        dialog.style.cssText = `
            background: white;
            padding: 24px;
            border-radius: 12px;
            box-shadow: 0 10px 25px rgba(0,0,0,0.15);
            width: 500px;
            max-width: 90%;
            max-height: 85%;
            display: flex;
            flex-direction: column;
            font-family: 'Inter', system-ui, -apple-system, sans-serif;
        `;

        const title = document.createElement('h3');
        title.textContent = chrome.i18n.getMessage('sql_open_dialog_title') || 'Saved Queries';
        title.style.cssText = `
            margin: 0 0 20px 0;
            font-size: 18px;
            font-weight: 600;
            color: #111827;
        `;

        const listContainer = document.createElement('div');
        listContainer.style.cssText = `
            flex: 1;
            overflow-y: auto;
            border: 1px solid #e5e7eb;
            border-radius: 8px;
            margin-bottom: 20px;
            max-height: 400px;
        `;

        let currentSort = { field: 'name', dir: 'asc' };

        function renderList() {
            listContainer.innerHTML = '';

            const entries = Object.entries(queries);
            if (entries.length === 0) {
                listContainer.innerHTML = `<div style="padding:24px; text-align:center; color:#6b7280; font-size:14px;">${chrome.i18n.getMessage('msg_no_saved_queries') || 'No saved queries found.'}</div>`;
                return;
            }

            entries.sort((a, b) => {
                const nameA = a[0].toLowerCase();
                const nameB = b[0].toLowerCase();

                const getObj = (x) => typeof x === 'object' && x !== null ? x : { date: 0 };
                const dateA = new Date(getObj(a[1]).date || 0).getTime();
                const dateB = new Date(getObj(b[1]).date || 0).getTime();

                let res = 0;
                if (currentSort.field === 'name') {
                    res = nameA.localeCompare(nameB);
                } else if (currentSort.field === 'date') {
                    res = dateA - dateB;
                }

                return currentSort.dir === 'asc' ? res : -res;
            });

            const table = document.createElement('table');
            table.style.cssText = `
                width: 100%;
                border-collapse: collapse;
                font-size: 13px;
                color: #374151;
            `;

            const createHeader = (text, field, width) => {
                const th = document.createElement('th');
                th.style.cssText = `
                    padding: 10px 12px;
                    font-weight: 600;
                    text-align: left;
                    background: #f9fafb;
                    position: sticky;
                    top: 0;
                    z-index: 10;
                    border-bottom: 1px solid #e5e7eb;
                    cursor: pointer;
                    user-select: none;
                    width: ${width};
                    color: #4b5563;
                `;

                let icon = '';
                if (currentSort.field === field) {
                    icon = currentSort.dir === 'asc' ? ' ↑' : ' ↓';
                }
                th.textContent = text + icon;

                th.onclick = () => {
                    if (currentSort.field === field) {
                        currentSort.dir = currentSort.dir === 'asc' ? 'desc' : 'asc';
                    } else {
                        currentSort.field = field;
                        currentSort.dir = 'asc';
                    }
                    renderList();
                };
                return th;
            };

            const thead = document.createElement('thead');
            const trHead = document.createElement('tr');

            const thFav = document.createElement('th');
            thFav.style.cssText = 'padding: 10px 8px; width: 36px; background: #f9fafb; border-bottom: 1px solid #e5e7eb; position: sticky; top: 0; text-align: center;';
            thFav.title = chrome.i18n.getMessage('col_favorite') || 'Favorite';
            thFav.textContent = '★';
            thFav.style.color = '#9ca3af';
            trHead.appendChild(thFav);

            trHead.appendChild(createHeader(chrome.i18n.getMessage('col_name') || 'Name', 'name', '45%'));
            trHead.appendChild(createHeader(chrome.i18n.getMessage('col_date') || 'Date', 'date', '40%'));

            const thAction = document.createElement('th');
            thAction.style.cssText = 'padding: 10px 12px; width: 40px; background: #f9fafb; border-bottom: 1px solid #e5e7eb; position: sticky; top: 0;';
            trHead.appendChild(thAction);

            thead.appendChild(trHead);
            table.appendChild(thead);

            const tbody = document.createElement('tbody');
            entries.forEach(([key, queryData]) => {
                const isObject = typeof queryData === 'object' && queryData !== null;
                const dateObj = isObject && queryData.date ? new Date(queryData.date) : null;
                const dateStr = dateObj ? dateObj.toLocaleString(undefined, {
                    year: 'numeric', month: 'short', day: 'numeric',
                    hour: '2-digit', minute: '2-digit'
                }) : '';

                const tr = document.createElement('tr');
                tr.className = 'nsft-sql-dialog-row';
                tr.style.cssText = `
                    border-bottom: 1px solid #f3f4f6;
                    cursor: pointer;
                    transition: background-color 0.15s ease;
                `;

                const isFav = isObject && queryData.favorite === true;
                tr.innerHTML = `
                    <td class="nsft-sql-dialog-cell-fav" style="padding: 10px 0; text-align: center; width: 36px;"></td>
                    <td class="nsft-sql-dialog-cell-name" style="padding: 10px 12px; font-weight: 500; color: #1f2937;">${escapeHtml(key)}</td>
                    <td class="nsft-sql-dialog-cell-date" style="padding: 10px 12px; color: #6b7280; font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 150px;">${dateStr}</td>
                    <td style="padding: 10px 12px; text-align: right; width: 40px;"></td>
                `;

                const starBtn = document.createElement('button');
                starBtn.type = 'button';
                starBtn.className = 'nsft-sql-dialog-star' + (isFav ? ' is-on' : '');
                starBtn.innerHTML = isFav ? '★' : '☆';
                starBtn.title = isFav
                    ? (chrome.i18n.getMessage('sql_fav_unstar') || 'Remove from favorites')
                    : (chrome.i18n.getMessage('sql_fav_star') || 'Mark as favorite');
                starBtn.style.cssText = `
                    border: none;
                    background: none;
                    color: ${isFav ? '#f59e0b' : '#d1d5db'};
                    cursor: pointer;
                    font-size: 18px;
                    line-height: 1;
                    padding: 2px 6px;
                    transition: color 0.15s;
                `;
                starBtn.onclick = (e) => {
                    e.stopPropagation();
                    toggleFavorite(key, () => {
                        loadSavedQueries((updated) => {
                            Object.keys(queries).forEach(k => delete queries[k]);
                            Object.assign(queries, updated);
                            renderList();
                        });
                    });
                };
                tr.cells[0].appendChild(starBtn);

                tr.onclick = (e) => {
                    if (e.target.closest('button')) return;
                    onSelect(queries[key], key);
                    overlay.remove();
                };

                const btnCell = tr.cells[3];
                const btnDel = document.createElement('button');
                btnDel.innerHTML = `
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <polyline points="3 6 5 6 21 6"></polyline>
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                    </svg>
                `;
                btnDel.style.cssText = `
                    border: none;
                    background: none;
                    color: #9ca3af;
                    cursor: pointer;
                    padding: 4px;
                    border-radius: 4px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    transition: all 0.2s;
                `;
                btnDel.title = chrome.i18n.getMessage('btn_delete') || 'Delete';


                btnDel.onclick = (e) => {
                    e.stopPropagation();
                    showRunnerConfirm({
                        title: chrome.i18n.getMessage('btn_delete') || 'Delete',
                        body: chrome.i18n.getMessage('confirm_delete', [key]) || `Delete query "${key}"?`,
                        confirmLabel: chrome.i18n.getMessage('btn_delete') || 'Delete',
                        danger: true
                    }).then((ok) => {
                        if (!ok) return;
                        delete queries[key];
                        localStorage.setItem(SAVED_QUERIES_KEY, JSON.stringify(queries));
                        _savedQueriesCache = queries;
                        renderList();
                    });
                };

                btnCell.appendChild(btnDel);
                tbody.appendChild(tr);
            });
            table.appendChild(tbody);
            listContainer.appendChild(table);
        }

        renderList();

        const btnCancel = document.createElement('button');
        btnCancel.textContent = chrome.i18n.getMessage('btn_cancel') || 'Close';
        btnCancel.style.cssText = `
            padding: 8px 16px;
            background: white;
            color: #374151;
            border: 1px solid #d1d5db;
            border-radius: 6px;
            cursor: pointer;
            width: 100%;
            font-size: 14px;
            font-weight: 500;
            transition: all 0.2s;
        `;
        btnCancel.onclick = () => overlay.remove();

        dialog.appendChild(title);
        dialog.appendChild(listContainer);
        dialog.appendChild(btnCancel);
        overlay.appendChild(dialog);

        const modalContainer = document.getElementById('nsft-sql-modal');
        if (modalContainer) {
            modalContainer.appendChild(overlay);
        }
    }
    function handleEditFormat() { formatSqlContent(); }

    function handleEditFind() {
        if (!editor) return;

        let widget = document.getElementById('nsft-sql-search-widget');
        if (widget) {
            widget.style.display = 'flex';
            const input = widget.querySelector('input');
            if (input) {
                input.focus();
                input.select();
            }
            return;
        }

        const editorWrapper = editor.getWrapperElement();

        widget = document.createElement('div');
        widget.id = 'nsft-sql-search-widget';
        widget.className = 'nsft-sql-findbar';

        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'nsft-sql-findbar-input';
        input.placeholder = chrome.i18n.getMessage('sql_findbar_ph') || 'Find in editor…';

        const btnNext = document.createElement('button');
        btnNext.type = 'button';
        btnNext.className = 'nsft-sql-findbar-btn';
        btnNext.innerHTML = '&#9660;';
        btnNext.title = chrome.i18n.getMessage('sql_findbar_next') || 'Next (Enter)';
        btnNext.setAttribute('aria-label', btnNext.title);

        const btnPrev = document.createElement('button');
        btnPrev.type = 'button';
        btnPrev.className = 'nsft-sql-findbar-btn';
        btnPrev.innerHTML = '&#9650;';
        btnPrev.title = chrome.i18n.getMessage('sql_findbar_prev') || 'Previous (Shift+Enter)';
        btnPrev.setAttribute('aria-label', btnPrev.title);

        const btnClose = document.createElement('button');
        btnClose.type = 'button';
        btnClose.className = 'nsft-sql-findbar-btn nsft-sql-findbar-close';
        btnClose.innerHTML = '&times;';
        btnClose.title = chrome.i18n.getMessage('sql_findbar_close') || 'Close (Esc)';
        btnClose.setAttribute('aria-label', btnClose.title);
        btnClose.onclick = () => { widget.style.display = 'none'; editor.focus(); };

        widget.appendChild(input);
        widget.appendChild(btnPrev);
        widget.appendChild(btnNext);
        widget.appendChild(btnClose);

        editorWrapper.appendChild(widget);

        let currentMarker = null;

        const find = (rev = false, incremental = false) => {
            const query = input.value;
            if (!query) {
                if (currentMarker) { currentMarker.clear(); currentMarker = null; }
                return;
            }

            if (currentMarker) {
                currentMarker.clear();
                currentMarker = null;
            }

            const content = editor.getValue();
            const TS = window.NSFT_TextSearch;
            const alinea = (s) => (TS ? TS.foldAligned(s) : String(s).toLowerCase());
            const lowerContent = alinea(content);
            const lowerQuery = alinea(query);


            let searchStart;
            if (incremental) {
                searchStart = editor.indexFromPos(editor.getCursor("start"));
            } else {
                searchStart = rev ? editor.indexFromPos(editor.getCursor("start")) : editor.indexFromPos(editor.getCursor("end"));
            }

            let idx = -1;

            if (!rev) {
                idx = lowerContent.indexOf(lowerQuery, searchStart);
                if (idx === -1) idx = lowerContent.indexOf(lowerQuery);
            } else {
                idx = lowerContent.lastIndexOf(lowerQuery, Math.max(0, searchStart - 1));
                if (idx === -1) idx = lowerContent.lastIndexOf(lowerQuery);
            }

            if (idx !== -1) {
                const start = editor.posFromIndex(idx);
                const end = editor.posFromIndex(idx + query.length);

                editor.setSelection(start, end);
                editor.scrollIntoView(start, 20);

                currentMarker = editor.markText(start, end, {
                    css: "background-color: #fef08a !important; color: black !important;"
                });
            } else {
                editor.setSelection(editor.getCursor('start'), editor.getCursor('start'));
                input.style.borderColor = '#ef4444';
                setTimeout(() => { input.style.borderColor = ''; }, 500);
            }
        };

        btnNext.onclick = () => find(false);
        btnPrev.onclick = () => find(true);

        input.addEventListener('input', () => {
            find(false, true);
        });

        input.onkeydown = (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                find(e.shiftKey);
            }
            if (e.key === 'Escape') {
                e.preventDefault();
                btnClose.click();
            }
        };

        input.focus();
    }
    function handleRunRun() { executeCurrentQuery(); }

    function isChartMode() {
        const t = document.getElementById('nsft-sql-chart-toggle');
        return !!(t && t.dataset.mode === 'chart');
    }

    function exportChartAsImage() {
        const canvas = document.getElementById('nsft-sql-chart-canvas');
        if (!canvas || !chartInstance) {
            logToToolbar(chrome.i18n.getMessage('sql_chart_export_empty') || 'There is no chart to export', 'warning');
            return;
        }

        const SCALE = 2;
        const out = document.createElement('canvas');
        out.width = canvas.width * SCALE;
        out.height = canvas.height * SCALE;
        const ctx = out.getContext('2d');

        const modal = document.getElementById('nsft-sql-modal');
        const isDark = modal && modal.getAttribute('data-theme') === 'dark';
        ctx.fillStyle = isDark ? '#141519' : '#ffffff';
        ctx.fillRect(0, 0, out.width, out.height);
        ctx.drawImage(canvas, 0, 0, out.width, out.height);

        out.toBlob((blob) => {
            if (!blob) {
                logToToolbar(chrome.i18n.getMessage('sql_chart_export_fail') || 'Could not generate the image', 'error');
                return;
            }
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `chart_${new Date().toISOString().slice(0, 10)}.png`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            logToToolbar(chrome.i18n.getMessage('sql_chart_export_ok') || 'Chart exported as PNG', 'success');
        }, 'image/png');
    }

    function handleRunExport() {
        if (isChartMode()) { exportChartAsImage(); return; }

        if (!resultTable) {
            logToToolbar('No table initialized', 'error');
            return;
        }
        const data = resultTable.getData();
        if (!data || data.length === 0) {
            logToToolbar(chrome.i18n.getMessage('tbl_empty') || 'No data available', 'warning');
            return;
        }

        showResultsExportDialog((format) => {
            const stamp = new Date().toISOString().slice(0, 10);
            if (format === 'excel') {
                exportResultsAsExcel(resultTable, `results_${stamp}.xls`);
                logToToolbar(chrome.i18n.getMessage('sql_export_results_ok', ['EXCEL']) || 'Results exported as EXCEL', 'success');
                return;
            }
            const filename = `results_${stamp}.${format}`;
            resultTable.download(format, filename);
            logToToolbar(chrome.i18n.getMessage('sql_export_results_ok', [format.toUpperCase()]) || `Results exported as ${format.toUpperCase()}`, 'success');
        });
    }

    function resultsColumns(table) {
        return table.getColumns().map(c => c.getField()).filter(Boolean);
    }

    function resultsToCsv(table) {
        const cols = resultsColumns(table);
        const esc = (v) => {
            const s = v == null ? '' : String(v);
            return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
        };
        return [cols.join(',')]
            .concat(table.getData().map(row => cols.map(c => esc(row[c])).join(',')))
            .join('\r\n');
    }

    function resultsToTsv(table) {
        const cols = resultsColumns(table);
        const esc = (v) => (v == null ? '' : String(v)).replace(/[\t\r\n]+/g, ' ');
        return [cols.join('\t')]
            .concat(table.getData().map(row => cols.map(c => esc(row[c])).join('\t')))
            .join('\r\n');
    }

    function resultsToJson(table) {
        const cols = resultsColumns(table);
        return JSON.stringify(table.getData().map(row => {
            const out = {};
            cols.forEach(c => { out[c] = row[c]; });
            return out;
        }), null, 2);
    }

    function handleRunCopy() {
        if (isChartMode()) {
            logToToolbar(chrome.i18n.getMessage('sql_chart_copy_na') || 'There are no rows to copy in the chart view', 'warning');
            return;
        }
        if (!resultTable) {
            logToToolbar('No table initialized', 'error');
            return;
        }
        const data = resultTable.getData();
        if (!data || data.length === 0) {
            logToToolbar(chrome.i18n.getMessage('tbl_empty') || 'No data available', 'warning');
            return;
        }

        showResultsExportDialog((format) => {
            let text = '';
            if (format === 'tsv') text = resultsToTsv(resultTable);
            else if (format === 'json') text = resultsToJson(resultTable);
            else text = resultsToCsv(resultTable);

            const label = format === 'tsv' ? 'TSV' : format.toUpperCase();
            const done = () => logToToolbar(
                chrome.i18n.getMessage('sql_copy_results_ok', [label]) || ('Results copied as ' + label),
                'success'
            );
            if (window.NSFT_Clipboard && window.NSFT_Clipboard.copy) {
                window.NSFT_Clipboard.copy(text, { toast: true, onSuccess: done });
            } else {
                navigator.clipboard.writeText(text).then(done).catch(() => {
                    logToToolbar(chrome.i18n.getMessage('sql_copy_failed') || 'Could not copy', 'error');
                });
            }
        }, {
            title: chrome.i18n.getMessage('sql_copy_results_title') || 'Copy results as…',
            formats: [
                { label: 'CSV', fmt: 'csv' },
                { label: chrome.i18n.getMessage('sql_copy_fmt_tsv') || 'Excel (TSV)', fmt: 'tsv' },
                { label: 'JSON', fmt: 'json' }
            ]
        });
    }

    function exportResultsAsExcel(table, filename) {
        const cols = table.getColumns().map(c => c.getField()).filter(Boolean);
        const data = table.getData();
        const xmlEsc = (s) => String(s).replace(/[&<>"']/g, c => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;'
        }[c]));
        const cellXml = (v) => {
            if (v === null || v === undefined || v === '') return '<Cell><Data ss:Type="String"></Data></Cell>';
            if (typeof v === 'number' && isFinite(v)) return `<Cell><Data ss:Type="Number">${v}</Data></Cell>`;
            return `<Cell><Data ss:Type="String">${xmlEsc(v)}</Data></Cell>`;
        };
        const rowXml = (cells) => `<Row>${cells}</Row>`;
        const header = rowXml(cols.map(c => `<Cell><Data ss:Type="String">${xmlEsc(c)}</Data></Cell>`).join(''));
        const body = data.map(r => rowXml(cols.map(c => cellXml(r[c])).join(''))).join('');
        const xml = `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
<Worksheet ss:Name="Results"><Table>${header}${body}</Table></Worksheet>
</Workbook>`;
        const blob = new Blob([xml], { type: 'application/vnd.ms-excel' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    function showResultsExportDialog(onConfirm, opts) {
        const o = opts || {};
        if (document.getElementById('nsft-results-export-dialog')) return;

        const overlay = document.createElement('div');
        overlay.id = 'nsft-results-export-dialog';
        overlay.className = 'nsft-sql-dialog';
        overlay.style.cssText = `
            position: absolute;
            top: 0; left: 0; right: 0; bottom: 0;
            background: rgba(0,0,0,0.4);
            z-index: 1000;
            display: flex;
            align-items: center;
            justify-content: center;
        `;

        const dialog = document.createElement('div');
        dialog.style.cssText = `
            background: white;
            padding: 20px;
            border-radius: 8px;
            box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
            text-align: center;
            min-width: 280px;
            font-family: 'Inter', system-ui, sans-serif;
        `;

        const title = document.createElement('h3');
        title.textContent = o.title || chrome.i18n.getMessage('sql_export_results_title') || 'Export results as…';
        title.style.cssText = 'margin: 0 0 16px 0; font-size: 15px; font-weight: 600; color: #111827;';

        const btnContainer = document.createElement('div');
        btnContainer.style.cssText = 'display: flex; gap: 8px; justify-content: center; flex-wrap: wrap;';

        const mkBtn = (label, fmt, primary) => {
            const b = document.createElement('button');
            b.textContent = label;
            b.style.cssText = `
                padding: 8px 16px;
                ${primary ? 'background: #3b82f6; color: #fff; border: none;' : 'background: #fff; color: #374151; border: 1px solid #d1d5db;'}
                border-radius: 6px;
                cursor: pointer;
                font-size: 13px;
                font-weight: 500;
            `;
            b.onclick = () => { overlay.remove(); onConfirm(fmt); };
            return b;
        };

        const formats = o.formats || [
            { label: 'CSV', fmt: 'csv' },
            { label: 'Excel', fmt: 'excel' },
            { label: 'JSON', fmt: 'json' },
            { label: 'HTML', fmt: 'html' }
        ];
        formats.forEach((f, i) => btnContainer.appendChild(mkBtn(f.label, f.fmt, i === 0)));

        const btnCancel = document.createElement('button');
        btnCancel.textContent = chrome.i18n.getMessage('btn_cancel') || 'Cancel';
        btnCancel.style.cssText = `
            margin-top: 14px;
            padding: 6px 14px;
            background: transparent;
            color: #6b7280;
            border: none;
            cursor: pointer;
            font-size: 12px;
        `;
        btnCancel.onclick = () => overlay.remove();

        dialog.appendChild(title);
        dialog.appendChild(btnContainer);
        dialog.appendChild(btnCancel);
        overlay.appendChild(dialog);

        const modalContainer = document.getElementById('nsft-sql-modal');
        if (modalContainer) modalContainer.appendChild(overlay);

        const escHandler = (e) => {
            if (e.key === 'Escape') { overlay.remove(); document.removeEventListener('keydown', escHandler); }
        };
        document.addEventListener('keydown', escHandler);
    }
    const VIEW_STATE_KEY = 'nsft_sql_view_state';

    function currentViewState() {
        const mainPanel = document.querySelector('.nsft-sql-main-panel');
        const resultsPanel = document.querySelector('.nsft-sql-results-panel');
        if (!mainPanel || !resultsPanel) return 'both';
        if (mainPanel.classList.contains('nsft-sql-panel-collapsed')) return 'no-editor';
        if (resultsPanel.classList.contains('nsft-sql-panel-collapsed')) return 'no-table';
        return 'both';
    }

    function persistViewState() {
        cachedViewState = currentViewState();
        try { chrome.storage.local.set({ [VIEW_STATE_KEY]: cachedViewState }); } catch (e) { }
    }

    function applyViewState() {
        const want = cachedViewState;
        if (want === currentViewState()) return;
        if (want === 'no-editor') handleViewEditor();
        else if (want === 'no-table') handleViewTable();
    }

    function handleViewTable() {
        const mainPanel = document.querySelector('.nsft-sql-main-panel');
        const resultsPanel = document.querySelector('.nsft-sql-results-panel');
        const resizer = document.getElementById('nsft-sql-resizer');
        const editorMenuItem = document.getElementById('nsft-sql-action-view-editor');
        const tableMenuItem = document.getElementById('nsft-sql-action-view-table');

        if (!mainPanel || !resultsPanel || !resizer) return;

        if (resultsPanel.classList.contains('nsft-sql-panel-collapsed')) {
            resultsPanel.classList.remove('nsft-sql-panel-collapsed');
            resultsPanel.style.display = 'flex';
            resizer.classList.remove('nsft-sql-resizer-hidden');

            mainPanel.classList.remove('nsft-sql-panel-collapsed');
            mainPanel.style.display = 'flex';
            mainPanel.style.flex = 'none';
            mainPanel.style.height = (_sqlEditorPct >= 15 && _sqlEditorPct <= 80) ? _sqlEditorPct + '%' : '300px';

            if (tableMenuItem) tableMenuItem.textContent = chrome.i18n.getMessage('sql_menu_hide_table') || 'Hide Results Table';
            if (editorMenuItem) editorMenuItem.textContent = chrome.i18n.getMessage('sql_menu_hide_editor') || 'Hide Editor';
        } else {
            resultsPanel.classList.add('nsft-sql-panel-collapsed');
            resizer.classList.add('nsft-sql-resizer-hidden');

            mainPanel.classList.remove('nsft-sql-panel-collapsed');
            mainPanel.style.display = 'flex';
            mainPanel.style.flex = 'none';
            mainPanel.style.height = '100%';

            if (tableMenuItem) tableMenuItem.textContent = chrome.i18n.getMessage('sql_menu_show_table') || 'Show Results Table';
            if (editorMenuItem) editorMenuItem.textContent = chrome.i18n.getMessage('sql_menu_hide_editor') || 'Hide Editor';
        }
        persistViewState();
        if (editor) editor.refresh();
        if (resultTable) resultTable.redraw();
        setTimeout(() => {
            if (editor) editor.refresh();
            if (resultTable && resultTable.initialized) resultTable.redraw();
        }, 180);
        updateResultsToggleUI();
    }

    function handleViewEditor() {
        const mainPanel = document.querySelector('.nsft-sql-main-panel');
        const resultsPanel = document.querySelector('.nsft-sql-results-panel');
        const resizer = document.getElementById('nsft-sql-resizer');
        const editorMenuItem = document.getElementById('nsft-sql-action-view-editor');
        const tableMenuItem = document.getElementById('nsft-sql-action-view-table');

        if (!mainPanel || !resultsPanel || !resizer) return;

        if (mainPanel.classList.contains('nsft-sql-panel-collapsed')) {
            mainPanel.classList.remove('nsft-sql-panel-collapsed');
            mainPanel.style.display = 'flex';
            mainPanel.style.flex = 'none';
            mainPanel.style.height = (_sqlEditorPct >= 15 && _sqlEditorPct <= 80) ? _sqlEditorPct + '%' : '300px';

            resizer.classList.remove('nsft-sql-resizer-hidden');
            resultsPanel.classList.remove('nsft-sql-panel-collapsed');
            resultsPanel.style.display = 'flex';
            resultsPanel.style.flex = '1';

            if (editorMenuItem) editorMenuItem.textContent = chrome.i18n.getMessage('sql_menu_hide_editor') || 'Hide Editor';
            if (tableMenuItem) tableMenuItem.textContent = chrome.i18n.getMessage('sql_menu_hide_table') || 'Hide Results Table';
        } else {
            mainPanel.classList.add('nsft-sql-panel-collapsed');
            resizer.classList.add('nsft-sql-resizer-hidden');

            resultsPanel.classList.remove('nsft-sql-panel-collapsed');
            resultsPanel.style.display = 'flex';
            resultsPanel.style.flex = '1';

            if (editorMenuItem) editorMenuItem.textContent = chrome.i18n.getMessage('sql_menu_show_editor') || 'Show Editor';
            if (tableMenuItem) tableMenuItem.textContent = chrome.i18n.getMessage('sql_menu_hide_table') || 'Hide Results Table';
        }
        persistViewState();
        if (editor) editor.refresh();
        if (resultTable) resultTable.redraw();
        setTimeout(() => {
            if (editor) editor.refresh();
            if (resultTable && resultTable.initialized) resultTable.redraw();
        }, 180);
        updateResultsToggleUI();
    }
    function handleHelpCatalog() {
        window.open('/app/recordscatalog/rcbrowser.nl?whence=', '_blank');
    }

    function formatSqlContent() {
        if (!editor) return;
        try {
            const formatted = sqlFormatter.format(editor.getValue(), {
                language: "sql",
                keywordCase: "upper",
                indent: "  "
            });

            editor.operation(() => {
                editor.replaceRange(
                    formatted,
                    { line: 0, ch: 0 },
                    { line: editor.lineCount(), ch: 0 }
                );
            });
        } catch (err) {
            logToToolbar(chrome.i18n.getMessage('sql_format_error') || 'Error formatting SQL', 'warning');
        }
    }

    function handleToolbarFormat() {
        formatSqlContent();
    }

    function handleModalExit() {
        const modal = document.getElementById('nsft-sql-modal');
        if (modal) {
            modal.remove();
            dispatchLayoutUpdate();
        }
    }

    function handleRefreshSchema() {
        const listadas = Array.from(new Set(
            getLoadedTableNames().concat(Object.keys(_schemaIndexMem))
        )).sort();
        if (!listadas.length) {
            logToToolbar(chrome.i18n.getMessage('sql_refresh_no_tables')
                || 'No hay tablas en el panel que actualizar.', 'warning');
            return;
        }
        return runBulkSchema(listadas, true);
    }

    function buildSampleQuery(tableName) {
        const meta = sqlTableMeta[tableName];
        if (!meta) return null;

        const preferred = new Set(['STRING', 'TEXT', 'DATE', 'DATETIME', 'INTEGER', 'FLOAT', 'NUMBER', 'CURRENCY']);
        const fields = Object.values(meta.fields)
            .filter(f => f.isAvailable && !f.removed && f.isColumn);

        const topFields = fields
            .filter(f => preferred.has(f.dataType))
            .sort((a, b) => a.id.localeCompare(b.id))
            .slice(0, 5);

        const picked = topFields.length
            ? topFields.map(f => f.id)
            : fields.slice(0, 5).map(f => f.id);

        const selectList = (picked.length ? picked : ['id']).map(id => `  ${id}`).join(',\n');
        return `SELECT\n${selectList}\nFROM ${tableName}\nFETCH FIRST 100 ROWS ONLY`;
    }

    function openSampleQueryTab(tableName) {
        const sql = buildSampleQuery(tableName);
        if (!sql) {
            logToToolbar(chrome.i18n.getMessage('sql_sample_no_tables')
                || 'Load the table schema first', 'warning');
            return;
        }
        createTab({ title: tableName, query: sql });
        logToToolbar(chrome.i18n.getMessage('sql_sample_inserted', [tableName])
            || `Sample query for ${tableName} inserted`, 'success');
    }

    const SIDEBAR_OPEN_KEY = 'nsft_sql_sidebar_open';
    const SIDEBAR_WIDTH_KEY = 'nsft_sql_sidebar_width';
    const SIDEBAR_SIDE_KEY = 'nsft_sql_sidebar_side';
    const SIDEBAR_MIN_WIDTH = 180;
    const SIDEBAR_MAX_WIDTH = 500;
    const SIDEBAR_DEFAULT_WIDTH = 260;
    const schemaExpanded = new Set();
    let schemaFilter = '';

    const _schemaFilterCollapsed = new Set();

    function schemaIsOpen(key, autoOpen) {
        if (_schemaFilterCollapsed.has(key)) return false;
        return autoOpen || schemaExpanded.has(key);
    }

    function schemaToggle(key, autoOpen) {
        if (schemaIsOpen(key, autoOpen)) {
            if (autoOpen) _schemaFilterCollapsed.add(key);
            schemaExpanded.delete(key);
        } else {
            _schemaFilterCollapsed.delete(key);
            schemaExpanded.add(key);
        }
        renderSchemaTree();
    }

    function schemaMatchesIn(meta, filterLc) {
        if (!filterLc || !meta) return { fields: false, joins: false };
        const fields = Object.values(meta.fields || {}).some((f) =>
            f && f.isAvailable && !f.removed && (
                tsFold(f.id).includes(filterLc) ||
                tsFold(f.label).includes(filterLc)));
        const joins = Object.values(meta.joins || {}).some((j) =>
            j && j.isAvailable &&
            tsFold(String(j.id || '') + ' ' + String(j.targetTable || '') + ' ' + String(j.targetLabel || ''))
                .includes(filterLc));
        return { fields: fields, joins: joins };
    }

    function getLoadedTableNames() {
        return Object.keys(sqlTableMeta).sort();
    }

    function applySidebarSide(side) {
        const zone = document.querySelector('#nsft-sql-modal .nsft-sql-workzone');
        if (!zone) return;
        if (side === 'right') zone.classList.add('sidebar-right');
        else zone.classList.remove('sidebar-right');
        updateSidebarSideChecks(side);
    }

    function updateSidebarSideChecks(side) {
        const left = document.getElementById('nsft-sql-action-sidebar-left');
        const right = document.getElementById('nsft-sql-action-sidebar-right');
        if (left) left.classList.toggle('is-checked', side !== 'right');
        if (right) right.classList.toggle('is-checked', side === 'right');
    }

    function setSidebarSide(side) {
        side = side === 'left' ? 'left' : 'right';
        cachedSidebarSide = side;
        applySidebarSide(side);
        chrome.storage.local.set({ [SIDEBAR_SIDE_KEY]: side });
    }

    function updateSchemaToggleUI(open) {
        const btn = document.getElementById('nsft-sql-tool-schema-toggle');
        if (btn) btn.classList.toggle('is-active', !!open);
    }

    function updateResultsToggleUI() {
        const btn = document.getElementById('nsft-sql-tool-results-toggle');
        const rp = document.querySelector('.nsft-sql-results-panel');
        if (btn && rp) btn.classList.toggle('is-active', !rp.classList.contains('nsft-sql-panel-collapsed'));
    }

    function applySidebarState() {
        const sidebar = document.getElementById('nsft-sql-schema-sidebar');
        const resizer = document.getElementById('nsft-sql-schema-resizer');
        if (!sidebar || !resizer) return;

        const open = cachedSidebarOpen;
        const width = Math.max(SIDEBAR_MIN_WIDTH, Math.min(SIDEBAR_MAX_WIDTH, cachedSidebarWidth || SIDEBAR_DEFAULT_WIDTH));
        sidebar.style.width = width + 'px';
        sidebar.classList.toggle('collapsed', !open);
        resizer.classList.toggle('hidden', !open);
        applySidebarSide(cachedSidebarSide);
        updateSchemaToggleUI(open);
        if (open) renderSchemaTree();
    }

    function toggleSchemaSidebar() {
        const sidebar = document.getElementById('nsft-sql-schema-sidebar');
        const resizer = document.getElementById('nsft-sql-schema-resizer');
        if (!sidebar || !resizer) return;
        const nowCollapsed = !sidebar.classList.contains('collapsed');
        sidebar.classList.toggle('collapsed', nowCollapsed);
        resizer.classList.toggle('hidden', nowCollapsed);
        chrome.storage.local.set({ [SIDEBAR_OPEN_KEY]: !nowCollapsed });
        updateSchemaToggleUI(!nowCollapsed);
        if (!nowCollapsed) renderSchemaTree();
    }

    function groupFieldsByDataType(fields) {
        const groups = {};
        Object.values(fields)
            .filter(f => f.isAvailable && !f.removed)
            .forEach(f => {
                const dt = f.dataType || 'OTHER';
                if (!groups[dt]) groups[dt] = [];
                groups[dt].push(f);
            });
        Object.values(groups).forEach(arr => arr.sort((a, b) => a.id.localeCompare(b.id)));
        return groups;
    }

    let _schemaRenderPending = false;
    let _schemaRenderRaf = null;
    let _schemaRenderRafIsTimer = false;
    function scheduleSchemaTreeRender() {
        if (_schemaRenderPending) return;
        _schemaRenderPending = true;
        _schemaRenderRafIsTimer = !window.requestAnimationFrame;
        const raf = window.requestAnimationFrame
            ? window.requestAnimationFrame.bind(window)
            : ((cb) => setTimeout(cb, 16));
        _schemaRenderRaf = raf(() => {
            _schemaRenderPending = false;
            _schemaRenderRaf = null;
            renderSchemaTreeNow();
        });
    }

    function flushSchemaTreeRender() {
        if (_schemaRenderRaf !== null) {
            if (_schemaRenderRafIsTimer) clearTimeout(_schemaRenderRaf);
            else if (window.cancelAnimationFrame) window.cancelAnimationFrame(_schemaRenderRaf);
            _schemaRenderRaf = null;
        }
        _schemaRenderPending = false;
        const sidebar = document.getElementById('nsft-sql-schema-sidebar');
        if (!sidebar || sidebar.classList.contains('collapsed')) return;
        renderSchemaTreeNow();
    }

    function renderSchemaTree() {
        scheduleSchemaTreeRender();
    }

    const SCHEMA_OVERSCAN = 6;
    const _schemaRowH = Object.create(null);
    let _schemaMeasuring = false;
    let _schemaRowEst = 34;

    function schemaRowHeight(name) {
        return _schemaRowH[name] || _schemaRowEst;
    }

    function schemaSpacer(h) {
        const d = document.createElement('div');
        d.className = 'nsft-sql-schema-spacer';
        d.style.height = h + 'px';
        return d;
    }

    function renderSchemaTreeNow() {
        const tree = document.getElementById('nsft-sql-schema-tree');
        if (!tree) return;

        const filterLc = tsFold(schemaFilter.trim());

        const cargadas = getLoadedTableNames();
        const coincide = (t) => !filterLc || tsFold(t).includes(filterLc)
            || tsFold((_schemaIndexMem[t] || {}).label).includes(filterLc);

        const casaPorDentro = (t) => {
            const m = schemaMatchesIn(sqlTableMeta[t], filterLc);
            return m.fields || m.joins;
        };
        const cargadasVisibles = !filterLc
            ? cargadas
            : cargadas.filter((t) => coincide(t) || casaPorDentro(t));

        const rank = (t) => {
            if (!filterLc) return 0;
            const tf = tsFold(t);
            if (tf === filterLc) return 0;
            if (tf.startsWith(filterLc)) return 1;
            if (tf.includes(filterLc)) return 2;
            return 3;
        };
        const todas = Array.from(new Set(
            cargadasVisibles.concat(Object.keys(_schemaIndexMem).filter(coincide))
        )).sort((a, b) => (rank(a) - rank(b)) || a.localeCompare(b));

        if (!todas.length) {
            const vacio = AUTO_SCHEMA
                ? (chrome.i18n.getMessage('sql_schema_empty')
                    || 'Escribe una tabla en el FROM y su esquema se carga solo. También puedes agregarlas una a una con + o descargar el esquema completo de la cuenta.')
                : (chrome.i18n.getMessage('sql_schema_empty_manual')
                    || 'La descarga automática está apagada: agrega con + las tablas que quieras, o descarga el esquema completo de la cuenta.');
            tree.innerHTML = `<div class="nsft-sql-schema-empty">${escapeHtml(vacio)}</div>`;
            return;
        }

        const scroll = tree.scrollTop;
        const alto = tree.clientHeight || 400;
        let acc = 0;
        let primera = 0;
        while (primera < todas.length && acc + schemaRowHeight(todas[primera]) <= scroll) {
            acc += schemaRowHeight(todas[primera]);
            primera++;
        }
        for (let n = 0; n < SCHEMA_OVERSCAN && primera > 0; n++) {
            primera--;
            acc -= schemaRowHeight(todas[primera]);
        }
        const arriba = acc;

        let usado = arriba;
        let ultima = primera;
        const limite = scroll + alto;
        while (ultima < todas.length && usado < limite) {
            usado += schemaRowHeight(todas[ultima]);
            ultima++;
        }
        ultima = Math.min(todas.length, ultima + SCHEMA_OVERSCAN);

        let abajo = 0;
        for (let k = ultima; k < todas.length; k++) abajo += schemaRowHeight(todas[k]);

        const frag = document.createDocumentFragment();
        if (arriba > 0) frag.appendChild(schemaSpacer(arriba));
        for (let k = primera; k < ultima; k++) {
            const tableName = todas[k];
            const meta = sqlTableMeta[tableName];
            const el = meta ? renderSchemaTable(tableName, meta, filterLc) : renderSchemaStub(tableName, filterLc);
            if (!el) continue;
            el.dataset.nsftTable = tableName;
            frag.appendChild(el);
        }
        frag.appendChild(schemaSpacer(abajo));

        tree.innerHTML = '';
        tree.appendChild(frag);
        tree.scrollTop = scroll;

        medirFilasEsquema(tree);
    }

    function medirFilasEsquema(tree) {
        if (_schemaMeasuring) return;
        const filas = Array.from(tree.children);
        let cambio = false;
        for (let i = 0; i < filas.length; i++) {
            const el = filas[i];
            const name = el.dataset && el.dataset.nsftTable;
            if (!name) continue;
            const sig = filas[i + 1];
            const h = sig ? (sig.offsetTop - el.offsetTop) : el.offsetHeight;
            if (h <= 0) continue;
            if (Math.abs(h - schemaRowHeight(name)) > 1) {
                _schemaRowH[name] = h;
                cambio = true;
            }
            if (el.dataset.nsftOpen !== '1' && Math.abs(h - _schemaRowEst) > 1) {
                _schemaRowEst = h;
                cambio = true;
            }
        }
        if (!cambio) return;
        _schemaMeasuring = true;
        try {
            renderSchemaTreeNow();
        } finally {
            _schemaMeasuring = false;
        }
    }

    function renderSchemaStub(tableName, filterLc) {
        const wrap = document.createElement('div');
        wrap.className = 'nsft-sql-schema-table';
        wrap.dataset.nsftOpen = '0';
        const header = document.createElement('div');
        header.className = 'nsft-sql-schema-node nsft-sql-schema-node-table';
        const label = String((_schemaIndexMem[tableName] || {}).label || '');
        const actionsTitle = chrome.i18n.getMessage('sql_schema_actions_title') || 'Acciones de la tabla';
        header.innerHTML = `
            <span class="nsft-sql-schema-caret">▸</span>
            <span class="nsft-sql-schema-label">${markMatches(tableName, filterLc)}</span>
            <span class="nsft-sql-schema-sub">${markMatches(label && label !== tableName ? label : '', filterLc)}</span>
            <button class="nsft-sql-schema-actions-btn" type="button" title="${escapeHtml(actionsTitle)}" aria-label="${escapeHtml(actionsTitle)}" aria-haspopup="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                    <circle cx="12" cy="12" r="9"/>
                    <line x1="12" y1="11" x2="12" y2="16"/>
                    <line x1="12" y1="8" x2="12.01" y2="8"/>
                </svg>
            </button>`;

        const cargar = () => ensureTableInMemory(tableName).then(() => {
            renderSchemaTree();
            if (typeof runLint === 'function' && lintEnabled) runLint();
        });

        header.addEventListener('click', (e) => {
            if (e.target.closest('.nsft-sql-schema-actions-btn')) return;
            schemaExpanded.add('T:' + tableName);
            cargar();
        });
        const actionsBtn = header.querySelector('.nsft-sql-schema-actions-btn');
        if (actionsBtn) {
            actionsBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                const r = actionsBtn.getBoundingClientRect();
                cargar().then(() => {
                    const meta = sqlTableMeta[tableName];
                    if (meta) showSchemaTableContextMenu({ clientX: r.left, clientY: r.bottom + 4 }, tableName, meta);
                });
            });
        }
        header.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            cargar().then(() => {
                const meta = sqlTableMeta[tableName];
                if (meta) showSchemaTableContextMenu(e, tableName, meta);
            });
        });
        wrap.appendChild(header);
        return wrap;
    }

    function renderSchemaTable(tableName, meta, filterLc) {
        const wrap = document.createElement('div');
        wrap.className = 'nsft-sql-schema-table';

        const hits = schemaMatchesIn(meta, filterLc);
        const autoTable = !!(hits.fields || hits.joins);
        const expanded = schemaIsOpen('T:' + tableName, autoTable);
        wrap.dataset.nsftOpen = expanded ? '1' : '0';
        const header = document.createElement('div');
        header.className = 'nsft-sql-schema-node nsft-sql-schema-node-table';
        const actionsTitle = chrome.i18n.getMessage('sql_schema_actions_title') || 'Acciones de la tabla';
        header.innerHTML = `
            <span class="nsft-sql-schema-caret">${expanded ? '▾' : '▸'}</span>
            <span class="nsft-sql-schema-label">${markMatches(tableName, filterLc)}</span>
            <span class="nsft-sql-schema-sub">${markMatches(meta.label && meta.label !== tableName ? meta.label : '', filterLc)}</span>
            <button class="nsft-sql-schema-actions-btn" type="button" title="${escapeHtml(actionsTitle)}" aria-label="${escapeHtml(actionsTitle)}" aria-haspopup="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                    <circle cx="12" cy="12" r="9"/>
                    <line x1="12" y1="11" x2="12" y2="16"/>
                    <line x1="12" y1="8" x2="12.01" y2="8"/>
                </svg>
            </button>`;
        header.addEventListener('click', (e) => {
            if (e.target.closest('.nsft-sql-schema-actions-btn')) return;
            schemaToggle('T:' + tableName, autoTable);
        });
        header.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            showSchemaTableContextMenu(e, tableName, meta);
        });
        const actionsBtn = header.querySelector('.nsft-sql-schema-actions-btn');
        if (actionsBtn) {
            actionsBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                const r = actionsBtn.getBoundingClientRect();
                showSchemaTableContextMenu({ clientX: r.left, clientY: r.bottom + 4 }, tableName, meta);
            });
        }
        wrap.appendChild(header);

        if (!expanded) return wrap;

        const fieldsSection = document.createElement('div');
        fieldsSection.className = 'nsft-sql-schema-section';
        const fieldsKey = 'F:' + tableName;
        const fieldsOpen = schemaIsOpen(fieldsKey, hits.fields);
        const fieldsCount = Object.values(meta.fields).filter(f => f.isAvailable && !f.removed).length;
        const fieldsHead = document.createElement('div');
        fieldsHead.className = 'nsft-sql-schema-node nsft-sql-schema-node-section';
        fieldsHead.innerHTML = `<span class="nsft-sql-schema-caret">${fieldsOpen ? '▾' : '▸'}</span><span class="nsft-sql-schema-label">Fields</span><span class="nsft-sql-schema-count">${fieldsCount}</span>`;
        fieldsHead.addEventListener('click', () => schemaToggle(fieldsKey, hits.fields));
        fieldsSection.appendChild(fieldsHead);

        if (fieldsOpen) {
            const groups = groupFieldsByDataType(meta.fields);
            const dataTypes = Object.keys(groups).sort();
            dataTypes.forEach(dt => {
                const groupKey = 'G:' + tableName + ':' + dt;
                const groupFiltered = filterLc
                    ? groups[dt].filter(f => tsFold(f.id).includes(filterLc) || tsFold(f.label).includes(filterLc))
                    : groups[dt];
                if (filterLc && !groupFiltered.length) return;
                const groupOpen = schemaIsOpen(groupKey, !!filterLc && !!groupFiltered.length);

                const groupHead = document.createElement('div');
                groupHead.className = 'nsft-sql-schema-node nsft-sql-schema-node-group';
                groupHead.innerHTML = `<span class="nsft-sql-schema-caret">${groupOpen ? '▾' : '▸'}</span><span class="nsft-sql-schema-icon nsft-sql-hint-icon nsft-sql-hint-icon-${dt}">${getDataTypeIcon(dt)}</span><span class="nsft-sql-schema-label">${escapeHtml(dt)}</span><span class="nsft-sql-schema-count">${groupFiltered.length}</span>`;
                groupHead.addEventListener('click', () => {
                    schemaToggle(groupKey, !!filterLc && !!groupFiltered.length);
                });
                fieldsSection.appendChild(groupHead);

                if (groupOpen) {
                    groupFiltered.forEach(f => {
                        fieldsSection.appendChild(renderSchemaField(tableName, f, filterLc));
                    });
                }
            });
        }
        wrap.appendChild(fieldsSection);

        const joinsAvailable = Object.values(meta.joins).filter(j => j.isAvailable);
        if (joinsAvailable.length) {
            const joinsSection = document.createElement('div');
            joinsSection.className = 'nsft-sql-schema-section';
            const joinsKey = 'J:' + tableName;
            const joinsOpen = schemaIsOpen(joinsKey, hits.joins);
            const joinsFiltered = joinsAvailable
                .filter(j => !filterLc || tsFold(j.id + ' ' + (j.targetTable || '') + ' ' + (j.targetLabel || '')).includes(filterLc))
                .sort((a, b) => a.id.localeCompare(b.id));
            const joinsHead = document.createElement('div');
            joinsHead.className = 'nsft-sql-schema-node nsft-sql-schema-node-section';
            joinsHead.innerHTML = `<span class="nsft-sql-schema-caret">${joinsOpen ? '▾' : '▸'}</span><span class="nsft-sql-schema-label">Joins</span><span class="nsft-sql-schema-count">${filterLc ? joinsFiltered.length : joinsAvailable.length}</span>`;
            joinsHead.addEventListener('click', () => schemaToggle(joinsKey, hits.joins));
            joinsSection.appendChild(joinsHead);

            if (joinsOpen) {
                joinsFiltered.forEach(j => joinsSection.appendChild(renderSchemaJoin(tableName, j, filterLc)));
            }
            wrap.appendChild(joinsSection);
        }

        return wrap;
    }

    function renderSchemaField(tableName, field, filterLc) {
        const row = document.createElement('div');
        row.className = 'nsft-sql-schema-leaf nsft-sql-schema-leaf-field';
        row.innerHTML = `
            <span class="nsft-sql-schema-icon nsft-sql-hint-icon nsft-sql-hint-icon-${field.dataType || 'UNKNOWN'}">${getDataTypeIcon(field.dataType)}</span>
            <span class="nsft-sql-schema-id">${markMatches(field.id, filterLc)}</span>
            <span class="nsft-sql-schema-lbl">${markMatches(field.label && field.label !== field.id && !/^\[Missing Label:/i.test(field.label) ? field.label : '', filterLc)}</span>`;
        row.addEventListener('click', () => insertAliasedAtCursor(tableName, field.id));
        row.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            showSchemaContextMenu(e, tableName, field);
        });
        return row;
    }

    function renderSchemaJoin(tableName, join, filterLc) {
        const row = document.createElement('div');
        row.className = 'nsft-sql-schema-leaf nsft-sql-schema-leaf-join';
        row.innerHTML = `
            <span class="nsft-sql-schema-icon nsft-sql-hint-icon nsft-sql-hint-icon-JOIN">→</span>
            <span class="nsft-sql-schema-id">${markMatches(join.targetTable || join.id, filterLc)}</span>
            <span class="nsft-sql-schema-lbl">${markMatches(join.targetLabel && join.targetLabel !== join.targetTable ? join.targetLabel : '', filterLc)}</span>
            <span class="nsft-sql-schema-card">${escapeHtml(join.cardinality || '')}</span>`;
        row.title = chrome.i18n.getMessage('sql_schema_join_tooltip') || 'Click to open JOIN wizard with this join preselected';
        row.addEventListener('click', (e) => {
            e.stopPropagation();
            openJoinWizardForJoin(tableName, join);
        });
        return row;
    }

    function insertAliasedAtCursor(tableName, fieldId) {
        if (!editor) return;
        const aliasMap = parseAliasMap(editor.getValue());
        const alias = Object.keys(aliasMap).find(a => aliasMap[a] === tableName && a !== tableName) || tableName;
        editor.replaceSelection(`${alias}.${fieldId}`);
        editor.focus();
    }

    function openJoinWizardForJoin(tableName, join) {
        const menu = document.getElementById('nsft-sql-join-menu');
        if (!menu) return;
        renderJoinWizard(menu, [{ rootTable: tableName, join }]);
        menu.classList.add('open');
    }

    function showSchemaContextMenu(evt, tableName, field) {
        removeSchemaContextMenu();
        const aliasMap = parseAliasMap(editor ? editor.getValue() : '');
        const alias = Object.keys(aliasMap).find(a => aliasMap[a] === tableName && a !== tableName) || tableName;

        const ctx = document.createElement('div');
        ctx.className = 'nsft-sql-schema-ctx';
        ctx.id = 'nsft-sql-schema-ctx';
        ctx.style.left = evt.clientX + 'px';
        ctx.style.top = evt.clientY + 'px';

        const mkItem = (label, handler) => {
            const el = document.createElement('div');
            el.className = 'nsft-sql-schema-ctx-item';
            el.textContent = label;
            el.addEventListener('click', (e) => {
                e.stopPropagation();
                handler();
                removeSchemaContextMenu();
            });
            return el;
        };

        ctx.appendChild(mkItem(
            chrome.i18n.getMessage('sql_schema_ctx_select') || 'Copy as SELECT',
            () => insertInClause('SELECT', alias, field.id)
        ));
        ctx.appendChild(mkItem(
            chrome.i18n.getMessage('sql_schema_ctx_where') || 'Copy as WHERE',
            () => insertInClause('WHERE', alias, field.id)
        ));
        ctx.appendChild(mkItem(
            chrome.i18n.getMessage('sql_schema_ctx_details') || 'Show details',
            () => showFieldDetails(tableName, field)
        ));

        document.body.appendChild(ctx);
        clampMenuToViewport(ctx, evt.clientX, evt.clientY);
        setTimeout(() => {
            document.addEventListener('click', removeSchemaContextMenu, { once: true });
        }, 0);
    }

    function removeSchemaContextMenu() {
        const el = document.getElementById('nsft-sql-schema-ctx');
        if (el) el.remove();
        const det = document.getElementById('nsft-sql-schema-details');
        if (det) det.remove();
    }

    function showSchemaTableContextMenu(evt, tableName, meta) {
        removeSchemaContextMenu();
        const ctx = document.createElement('div');
        ctx.className = 'nsft-sql-schema-ctx';
        ctx.id = 'nsft-sql-schema-ctx';
        ctx.style.left = evt.clientX + 'px';
        ctx.style.top = evt.clientY + 'px';

        const I = {
            refresh: '<path d="M21 2v6h-6"/><path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M3 22v-6h6"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/>',
            trash: '<polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"/>',
            external: '<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>',
            download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>',
            newDoc: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h9"/><polyline points="14 2 14 8 20 8"/><path d="M19 14v6"/><path d="M16 17h6"/>'
        };

        const mkItem = (label, handler, icon, danger) => {
            const el = document.createElement('div');
            el.className = 'nsft-sql-schema-ctx-item' + (danger ? ' is-danger' : '');
            el.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
                (icon || '') + '</svg><span>' + escapeHtml(label) + '</span>';
            el.addEventListener('click', (e) => {
                e.stopPropagation();
                handler();
                removeSchemaContextMenu();
            });
            return el;
        };
        const mkSep = () => {
            const s = document.createElement('div');
            s.className = 'nsft-sql-schema-ctx-sep';
            return s;
        };

        const head = document.createElement('div');
        head.className = 'nsft-sql-schema-ctx-head';
        head.textContent = tableName;
        ctx.appendChild(head);

        ctx.appendChild(mkItem(
            chrome.i18n.getMessage('sql_schema_ctx_sample') || 'Crear plantilla de esta tabla',
            () => openSampleQueryTab(tableName), I.newDoc
        ));
        ctx.appendChild(mkSep());

        ctx.appendChild(mkItem(
            chrome.i18n.getMessage('sql_schema_ctx_refresh_table') || 'Actualizar tabla',
            () => refreshSingleTable(tableName), I.refresh
        ));
        ctx.appendChild(mkItem(
            chrome.i18n.getMessage('sql_schema_ctx_remove_table') || 'Quitar de la caché',
            () => removeSingleTable(tableName), I.trash, true
        ));

        ctx.appendChild(mkSep());
        ctx.appendChild(mkItem(
            chrome.i18n.getMessage('sql_schema_ctx_open_catalog') || 'Abrir en el Catálogo de Registros',
            () => openInRecordsCatalog(tableName), I.external
        ));
        ctx.appendChild(mkItem(
            chrome.i18n.getMessage('sql_schema_ctx_open_definition') || 'Abrir la definición completa (JSON)',
            () => openSchemaDefinition(tableName), I.external
        ));

        ctx.appendChild(mkSep());
        ctx.appendChild(mkItem(
            chrome.i18n.getMessage('sql_schema_ctx_export_full') || 'Exportar tabla a JSON (fields + joins)',
            () => exportTableJson(tableName, meta, 'full'), I.download
        ));
        ctx.appendChild(mkItem(
            chrome.i18n.getMessage('sql_schema_ctx_export_fields') || 'Exportar solo fields a JSON',
            () => exportTableJson(tableName, meta, 'fields'), I.download
        ));
        ctx.appendChild(mkItem(
            chrome.i18n.getMessage('sql_schema_ctx_export_joins') || 'Exportar solo joins a JSON',
            () => exportTableJson(tableName, meta, 'joins'), I.download
        ));

        document.body.appendChild(ctx);
        clampMenuToViewport(ctx, evt.clientX, evt.clientY);
        setTimeout(() => {
            document.addEventListener('click', removeSchemaContextMenu, { once: true });
        }, 0);
    }

    function refreshSingleTable(tableName) {
        tableName = normalizeTableName(tableName);
        if (!tableName) return;
        failedTables.delete(tableName);
        userRemovedTables.delete(tableName);
        fetchTableSchema(tableName, { force: true }).then(renderSchemaTree);
    }

    const BULK_CONCURRENCY = 6;
    const BULK_FLUSH = 60;
    const BULK_AVG_KB = 10;
    let _bulkCancel = false;
    let _bulkRunning = false;

    function paintBulkBar(done, total) {
        const bar = document.getElementById('nsft-sql-schema-bulk');
        if (!bar) return;
        const txt = bar.querySelector('.nsft-sql-schema-bulk-text');
        const fill = bar.querySelector('.nsft-sql-schema-bulk-fill');
        if (txt) {
            txt.textContent = chrome.i18n.getMessage('sql_schema_bulk_progress',
                [fmtNum(done), fmtNum(total)]) || `Descargando esquemas… ${fmtNum(done)}/${fmtNum(total)}`;
        }
        if (fill) fill.style.width = total ? Math.round((done / total) * 100) + '%' : '0%';
    }

    function showBulkBar(total) {
        const host = document.getElementById('nsft-sql-schema-sidebar');
        if (!host || document.getElementById('nsft-sql-schema-bulk')) return;
        const bar = document.createElement('div');
        bar.id = 'nsft-sql-schema-bulk';
        bar.className = 'nsft-sql-schema-bulk';
        const txt = document.createElement('div');
        txt.className = 'nsft-sql-schema-bulk-text';
        const track = document.createElement('div');
        track.className = 'nsft-sql-schema-bulk-track';
        const fill = document.createElement('div');
        fill.className = 'nsft-sql-schema-bulk-fill';
        track.appendChild(fill);
        const stop = document.createElement('button');
        stop.type = 'button';
        stop.className = 'nsft-sql-schema-bulk-stop';
        stop.textContent = chrome.i18n.getMessage('sql_schema_bulk_stop') || 'Cancelar';
        stop.addEventListener('click', () => { _bulkCancel = true; });
        bar.appendChild(txt);
        bar.appendChild(track);
        bar.appendChild(stop);
        const header = host.querySelector('.nsft-sql-schema-header');
        if (header && header.nextSibling) host.insertBefore(bar, header.nextSibling);
        else host.appendChild(bar);
        paintBulkBar(0, total);
    }

    function hideBulkBar() {
        const bar = document.getElementById('nsft-sql-schema-bulk');
        if (bar) bar.remove();
    }

    function bulkFetchOne(tableName) {
        return fetch(schemaDetailUrl(tableName))
            .then((r) => (r.ok ? r.json() : null))
            .then((json) => {
                if (!(json && json.status === 'ok' && json.data && json.data.fields)) return null;
                return { tableName: tableName, rawData: json.data };
            })
            .catch(() => null);
    }

    async function handleBulkSchemaDownload() {
        if (_bulkRunning) return;
        const btn = document.getElementById('nsft-sql-schema-all');

        if (!catalogTables) {
            ensureCatalogLoaded();
            if (btn) btn.textContent = chrome.i18n.getMessage('sql_schema_bulk_wait') || 'Cargando el catálogo…';
            let esperas = 0;
            while (!catalogTables && esperas++ < 60) {
                await new Promise((r) => setTimeout(r, 250));
            }
            paintBulkButton();
        }
        const pendientes = (catalogTables || [])
            .map((t) => t.id)
            .filter((t) => t && !_schemaIndexMem[t]);
        if (!pendientes.length) {
            logToToolbar(chrome.i18n.getMessage('sql_schema_bulk_none')
                || 'Ya está en caché el esquema de todas las tablas.', 'info');
            return;
        }
        return runBulkSchema(pendientes, false);
    }

    async function runBulkSchema(pendientes, refrescar) {
        if (_bulkRunning || !pendientes || !pendientes.length) return;

        const mb = Math.max(1, Math.round((pendientes.length * BULK_AVG_KB) / 1024));
        const ok = await showRunnerConfirm({
            title: refrescar
                ? (chrome.i18n.getMessage('sql_schema_refreshall_title') || 'Actualizar el esquema')
                : (chrome.i18n.getMessage('sql_schema_bulk_title') || 'Descargar el esquema completo'),
            body: refrescar
                ? (chrome.i18n.getMessage('sql_schema_refreshall_body', [fmtNum(pendientes.length)])
                    || `Se volverá a pedir a la cuenta el esquema de las ${fmtNum(pendientes.length)} tablas del panel.`)
                : (chrome.i18n.getMessage('sql_schema_bulk_body', [fmtNum(pendientes.length), String(mb)])
                    || `Se descargará el esquema de ${fmtNum(pendientes.length)} tablas (unos ${mb} MB). Puedes cancelar a medias y se queda lo bajado.`),
            confirmLabel: refrescar
                ? (chrome.i18n.getMessage('sql_schema_refreshall_confirm') || 'Actualizar')
                : (chrome.i18n.getMessage('sql_schema_bulk_confirm') || 'Descargar')
        });
        if (!ok) return;

        _bulkRunning = true;
        _bulkCancel = false;
        toggleCatalogPop(false);
        showBulkBar(pendientes.length);
        let hechas = 0;
        let fallos = 0;
        let porGuardar = [];
        try {
            for (let i = 0; i < pendientes.length && !_bulkCancel; i += BULK_CONCURRENCY) {
                const tanda = pendientes.slice(i, i + BULK_CONCURRENCY);
                const res = await Promise.all(tanda.map(bulkFetchOne));
                res.forEach((r) => {
                    if (r) { hechas++; porGuardar.push(r); } else { fallos++; }
                });
                if (porGuardar.length >= BULK_FLUSH) {
                    saveSchemaBatch(porGuardar);
                    porGuardar = [];
                }
                paintBulkBar(hechas + fallos, pendientes.length);
                await new Promise((r) => setTimeout(r, 0));
            }
            if (porGuardar.length) saveSchemaBatch(porGuardar);
            await _cacheWriteChain;
            await new Promise((resolve) => refreshSchemaIndexMem(resolve));
            renderSchemaTree();
            const key = _bulkCancel ? 'sql_schema_bulk_stopped' : 'sql_schema_bulk_done';
            logToToolbar(chrome.i18n.getMessage(key, [fmtNum(hechas), fmtNum(fallos)])
                || `${fmtNum(hechas)} tablas en caché (${fmtNum(fallos)} sin datos).`,
                _bulkCancel ? 'info' : 'success');
        } finally {
            _bulkRunning = false;
            _bulkCancel = false;
            hideBulkBar();
            paintBulkButton();
        }
    }

    function paintBulkButton() {
        const total = (catalogTables || []).length;
        const faltan = total
            ? (catalogTables || []).filter((t) => t.id && !_schemaIndexMem[t.id]).length
            : 0;

        const btn = document.getElementById('nsft-sql-schema-all');
        if (btn) {
            btn.textContent = total
                ? (chrome.i18n.getMessage('sql_schema_bulk_btn_n', [fmtNum(faltan)])
                    || `⬇ Descargar el esquema de las ${fmtNum(faltan)} tablas que faltan`)
                : (chrome.i18n.getMessage('sql_schema_bulk_btn') || '⬇ Descargar el esquema de todas las tablas');
            btn.disabled = _bulkRunning || (!!total && !faltan);
        }

        const ref = document.getElementById('nsft-sql-schema-refresh');
        if (ref) {
            const listadas = new Set(getLoadedTableNames().concat(Object.keys(_schemaIndexMem)));
            const t = chrome.i18n.getMessage('sql_refresh_schema_title', [fmtNum(listadas.size)])
                || `Actualizar el esquema de las ${fmtNum(listadas.size)} tablas del panel`;
            ref.title = t + ' (' + KBD_MOD + KBD_SHIFT + 'K)';
            ref.setAttribute('aria-label', t);
            ref.disabled = _bulkRunning || !listadas.size;
            ref.classList.toggle('is-spinning', _bulkRunning);
        }
    }

    const AUTO_ICO = '<g transform="translate(0.9 0.6)"><path d="M9.5 3.5v7.5"/><path d="M5.8 7.8l3.7 3.9 3.7-3.9"/><path d="M3 15.5v3a1.6 1.6 0 0 0 1.6 1.6h9.8a1.6 1.6 0 0 0 1.6-1.6v-3"/><path d="M19.2 2.6 15.4 8.4h3.2l-3.6 5.4" fill="currentColor" stroke-width="1.2" stroke-linejoin="miter"/></g>';
    const AUTO_SVG_OPEN = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">';
    const AUTO_ON_SVG = AUTO_SVG_OPEN + AUTO_ICO + '</svg>';
    const AUTO_OFF_SVG = AUTO_SVG_OPEN + AUTO_ICO + '<path d="M3 3l18 18"/></svg>';

    function paintAutoSchemaBtn() {
        const btn = document.getElementById('nsft-sql-schema-auto');
        if (!btn) return;
        const title = AUTO_SCHEMA
            ? (chrome.i18n.getMessage('sql_schema_auto_on') || 'Descarga automática del esquema activada · Clic para desactivarla')
            : (chrome.i18n.getMessage('sql_schema_auto_off') || 'Descarga automática del esquema desactivada · Clic para activarla');
        btn.innerHTML = AUTO_SCHEMA ? AUTO_ON_SVG : AUTO_OFF_SVG;
        btn.classList.toggle('is-off', !AUTO_SCHEMA);
        btn.classList.toggle('is-fetching', AUTO_SCHEMA && _autoFetchInFlight > 0);
        btn.setAttribute('aria-pressed', AUTO_SCHEMA ? 'true' : 'false');
        btn.title = title;
        btn.setAttribute('aria-label', title);
    }

    let _autoFetchInFlight = 0;

    function setAutoPulse(activa) {
        _autoFetchInFlight = Math.max(0, _autoFetchInFlight + (activa ? 1 : -1));
        const btn = document.getElementById('nsft-sql-schema-auto');
        if (btn) btn.classList.toggle('is-fetching', AUTO_SCHEMA && _autoFetchInFlight > 0);
    }

    function handleWipeSchemaCache() {
        loadSchemaIndex(async (index) => {
            const total = Object.keys(index).length;
            if (!total) {
                logToToolbar(chrome.i18n.getMessage('sql_schema_wipe_empty')
                    || 'La caché de esquemas ya está vacía.', 'info');
                return;
            }
            const ok = await showRunnerConfirm({
                title: chrome.i18n.getMessage('sql_schema_wipe_title') || 'Vaciar la caché de esquemas',
                body: chrome.i18n.getMessage('sql_schema_wipe_body', [fmtNum(total)])
                    || `Se borrarán los esquemas de ${fmtNum(total)} tabla(s) de esta cuenta.`,
                confirmLabel: chrome.i18n.getMessage('sql_schema_wipe_confirm') || 'Vaciar',
                danger: true
            });
            if (!ok) return;

            Object.keys(sqlTableMeta).forEach((t) => {
                delete sqlTableMeta[t];
                delete sqlHintTables[t];
                delete _schemaIngestTs[t];
                schemaExpanded.delete('T:' + t);
            });
            failedTables.clear();
            userRemovedTables.clear();
            clearSchemaCache();
            renderSchemaTree();
            if (typeof runLint === 'function' && lintEnabled) runLint();
            logToToolbar(chrome.i18n.getMessage('sql_schema_wipe_done', [fmtNum(total)])
                || `Caché vaciada (${fmtNum(total)} tablas).`, 'success');
        });
    }

    function removeSingleTable(tableName) {
        tableName = normalizeTableName(tableName);
        if (!tableName) return;
        delete sqlHintTables[tableName];
        delete sqlTableMeta[tableName];
        failedTables.delete(tableName);
        schemaExpanded.delete('T:' + tableName);
        userRemovedTables.add(tableName);
        clearSchemaCache(tableName);
        renderSchemaTree();
        logToToolbar(chrome.i18n.getMessage('sql_schema_removed', [tableName]) || `${tableName} quitada de la caché`, 'info');
    }

    function clampMenuToViewport(menuEl, x, y) {
        const margin = 6;
        const rect = menuEl.getBoundingClientRect();
        let nx = x;
        let ny = y;
        if (rect.right > window.innerWidth - margin) {
            nx = Math.max(margin, x - rect.width);
        }
        if (rect.bottom > window.innerHeight - margin) {
            ny = Math.max(margin, y - rect.height);
        }
        menuEl.style.left = nx + 'px';
        menuEl.style.top = ny + 'px';
    }

    function exportTableJson(tableName, meta, mode) {
        const base = {
            table: tableName,
            label: (meta && meta.label && meta.label !== tableName) ? meta.label : null,
            exportedAt: new Date().toISOString()
        };
        let payload;
        let suffix;
        if (mode === 'fields') {
            payload = { ...base, fields: serializeFields(meta.fields) };
            suffix = '-fields';
        } else if (mode === 'joins') {
            payload = { ...base, joins: serializeJoins(meta.joins) };
            suffix = '-joins';
        } else {
            payload = {
                ...base,
                fields: serializeFields(meta.fields),
                joins: serializeJoins(meta.joins)
            };
            suffix = '-schema';
        }
        downloadJson(payload, `${tableName}${suffix}.json`);
    }

    function serializeFields(fieldsMap) {
        if (!fieldsMap) return [];
        return Object.values(fieldsMap)
            .filter(f => f && f.isAvailable && !f.removed)
            .sort((a, b) => String(a.id).localeCompare(String(b.id)))
            .map(f => ({
                id: f.id,
                label: f.label || null,
                dataType: f.dataType || null,
                fieldType: f.fieldType || null,
                isColumn: !!f.isColumn,
                joins: Array.isArray(f.joins) ? f.joins.slice() : []
            }));
    }

    function serializeJoins(joinsMap) {
        if (!joinsMap) return [];
        return Object.values(joinsMap)
            .filter(j => j && j.isAvailable)
            .sort((a, b) => String(a.id).localeCompare(String(b.id)))
            .map(j => ({
                id: j.id,
                fieldId: j.fieldId || null,
                targetTable: j.targetTable || null,
                targetLabel: (j.targetLabel && j.targetLabel !== j.targetTable) ? j.targetLabel : null,
                cardinality: j.cardinality || null,
                joinType: j.joinType || null,
                onClause: j.onClause || null
            }));
    }

    function downloadJson(payload, filename) {
        try {
            const text = JSON.stringify(payload, null, 2);
            const blob = new Blob([text], { type: 'application/json;charset=utf-8' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            a.remove();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
        } catch (e) {
            console.warn('NSFT SuiteQL schema export failed', e);
        }
    }

    function insertInClause(clause, alias, fieldId) {
        if (!editor) return;
        const token = `${alias}.${fieldId}`;
        const content = editor.getValue();
        const re = clause === 'SELECT'
            ? /\bSELECT\b/i
            : /\bWHERE\b/i;
        const match = content.match(re);
        if (!match) {
            if (clause === 'WHERE') {
                editor.replaceRange(`\nWHERE ${token} = ?`, { line: editor.lastLine(), ch: editor.getLine(editor.lastLine()).length });
            } else {
                editor.replaceRange(`SELECT ${token}, `, { line: 0, ch: 0 });
            }
            editor.focus();
            return;
        }
        const kwPos = editor.posFromIndex(match.index + match[0].length);
        if (clause === 'SELECT') {
            editor.replaceRange(` ${token},`, kwPos);
        } else {
            editor.replaceRange(` ${token} = ? AND`, kwPos);
        }
        editor.focus();
    }

    function showFieldDetails(tableName, field) {
        removeSchemaContextMenu();
        const el = document.createElement('div');
        el.className = 'nsft-sql-schema-details';
        el.id = 'nsft-sql-schema-details';
        el.innerHTML = `
            <div class="nsft-sql-schema-details-head">
                <span class="nsft-sql-schema-icon nsft-sql-hint-icon nsft-sql-hint-icon-${field.dataType || 'UNKNOWN'}">${getDataTypeIcon(field.dataType)}</span>
                <strong>${escapeHtml(field.id)}</strong>
                <button class="nsft-sql-schema-details-close" type="button">✕</button>
            </div>
            <div class="nsft-sql-schema-details-body">
                ${field.label ? `<div><b>${escapeHtml(chrome.i18n.getMessage('sql_field_label') || 'Label')}:</b> ${escapeHtml(field.label)}</div>` : ''}
                <div><b>${escapeHtml(chrome.i18n.getMessage('sql_field_table') || 'Table')}:</b> ${escapeHtml(tableName)}</div>
                <div><b>${escapeHtml(chrome.i18n.getMessage('sql_field_datatype') || 'Data type')}:</b> ${escapeHtml(field.dataType || '—')}</div>
                <div><b>${escapeHtml(chrome.i18n.getMessage('sql_field_fieldtype') || 'Field type')}:</b> ${escapeHtml(field.fieldType || '—')}</div>
                <div><b>${escapeHtml(chrome.i18n.getMessage('sql_field_available') || 'Available')}:</b> ${field.isAvailable ? '✓' : '✗'}${field.removed ? ' (removed)' : ''}</div>
                ${field.availabilityDetails && field.availabilityDetails.length ? `<div><b>${escapeHtml(chrome.i18n.getMessage('sql_field_note') || 'Note')}:</b> ${escapeHtml(field.availabilityDetails[0])}</div>` : ''}
                ${field.features && field.features.length ? `<div><b>${escapeHtml(chrome.i18n.getMessage('sql_field_features') || 'Features')}:</b> ${escapeHtml(field.features.join(', '))}</div>` : ''}
                ${field.permissions && field.permissions.length ? `<div><b>${escapeHtml(chrome.i18n.getMessage('sql_field_permissions') || 'Permissions')}:</b> ${escapeHtml(field.permissions.join(', '))}</div>` : ''}
            </div>`;
        document.body.appendChild(el);
        el.querySelector('.nsft-sql-schema-details-close').addEventListener('click', removeSchemaContextMenu);
        setTimeout(() => {
            document.addEventListener('click', (e) => {
                if (!el.contains(e.target)) removeSchemaContextMenu();
            }, { once: true });
        }, 0);
    }

    function initSchemaResizer() {
        const resizer = document.getElementById('nsft-sql-schema-resizer');
        const sidebar = document.getElementById('nsft-sql-schema-sidebar');
        if (!resizer || !sidebar) return;

        let dragging = false;
        let startX = 0;
        let startW = 0;
        let direction = 1;

        resizer.addEventListener('mousedown', (e) => {
            dragging = true;
            startX = e.clientX;
            startW = sidebar.getBoundingClientRect().width;
            const zone = document.querySelector('#nsft-sql-modal .nsft-sql-workzone');
            direction = zone && zone.classList.contains('sidebar-right') ? -1 : 1;
            sidebar.classList.add('is-resizing');
            document.body.style.cursor = 'col-resize';
            e.preventDefault();
        });

        document.addEventListener('mousemove', (e) => {
            if (!dragging) return;
            const delta = (e.clientX - startX) * direction;
            const w = Math.max(SIDEBAR_MIN_WIDTH, Math.min(SIDEBAR_MAX_WIDTH, startW + delta));
            sidebar.style.width = w + 'px';
        });

        document.addEventListener('mouseup', () => {
            if (!dragging) return;
            dragging = false;
            document.body.style.cursor = '';
            sidebar.classList.remove('is-resizing');
            const w = sidebar.getBoundingClientRect().width;
            chrome.storage.local.set({ [SIDEBAR_WIDTH_KEY]: Math.round(w) });
        });
    }

    const LINT_ENABLED_KEY = 'nsft_sql_lint_enabled';
    const SQL_RESERVED_WORDS = new Set([
        'SELECT', 'FROM', 'WHERE', 'JOIN', 'ON', 'AND', 'OR', 'AS', 'LEFT', 'RIGHT',
        'INNER', 'OUTER', 'CROSS', 'FULL', 'GROUP', 'ORDER', 'BY', 'HAVING', 'LIMIT',
        'FETCH', 'FIRST', 'NEXT', 'ROWS', 'ONLY', 'NOT', 'NULL', 'IS', 'IN', 'LIKE',
        'BETWEEN', 'CASE', 'WHEN', 'THEN', 'ELSE', 'END', 'UNION', 'ALL', 'DISTINCT',
        'EXISTS', 'WITH'
    ]);

    function resolveFieldContextAt(ed, pos) {
        if (!ed) return null;
        const line = ed.getLine(pos.line) || '';

        let ws = pos.ch;
        while (ws > 0 && /[a-z0-9_]/i.test(line[ws - 1])) ws--;
        let we = pos.ch;
        while (we < line.length && /[a-z0-9_]/i.test(line[we])) we++;
        const hoveredWord = line.slice(ws, we);
        if (!hoveredWord) return null;
        if (SQL_RESERVED_WORDS.has(hoveredWord.toUpperCase())) return null;

        const segments = [hoveredWord];
        let idx = ws - 1;
        while (idx >= 0 && line[idx] === '.') {
            idx--;
            let wStart = idx;
            while (wStart >= 0 && /[a-z0-9_]/i.test(line[wStart])) wStart--;
            const seg = line.slice(wStart + 1, idx + 1);
            if (!seg) break;
            segments.unshift(seg);
            idx = wStart;
        }
        if (segments.length < 2) return null;

        const aliasMap = parseAliasMap(ed.getValue());
        const rootAlias = segments[0].toLowerCase();
        const rootTable = aliasMap[rootAlias] || normalizeTableName(rootAlias);
        if (!rootTable || !sqlTableMeta[rootTable]) return null;

        let currentTable = rootTable;
        for (let i = 1; i < segments.length - 1; i++) {
            const meta = sqlTableMeta[currentTable];
            if (!meta) return null;
            const joinName = segments[i];
            let join = meta.joins[joinName];
            if (!join) {
                const lcName = joinName.toLowerCase();
                const k = Object.keys(meta.joins).find(kk => kk.toLowerCase() === lcName);
                join = k ? meta.joins[k] : null;
            }
            if (!join || !join.targetTable) return null;
            if (!sqlTableMeta[join.targetTable]) {
                requestJoinSchemaThenRelint(join.targetTable);
                return null;
            }
            currentTable = join.targetTable;
        }

        const finalMeta = sqlTableMeta[currentTable];
        const fieldId = segments[segments.length - 1];
        const fieldKey = Object.keys(finalMeta.fields).find(k => k.toLowerCase() === fieldId.toLowerCase());
        if (!fieldKey) return { tableName: currentTable, unknownFieldId: fieldId };
        return { tableName: currentTable, field: finalMeta.fields[fieldKey] };
    }

    let hoverTimer = null;
    let hoverTooltipEl = null;
    let hoverAnchor = null;

    function initHoverTooltip() {
        if (!editor) return;
        const wrapper = editor.getWrapperElement();
        if (!wrapper) return;

        wrapper.addEventListener('mousemove', (e) => {
            const x = e.clientX, y = e.clientY;

            if (hoverTooltipEl && hoverAnchor) {
                const M = 2;
                if (x < hoverAnchor.left - M || x > hoverAnchor.right + M
                    || y < hoverAnchor.top - M || y > hoverAnchor.bottom + M) {
                    hideHoverTooltip();
                }
            }

            clearTimeout(hoverTimer);
            hoverTimer = setTimeout(() => {
                const pos = editor.coordsChar({ left: x, top: y }, 'window');
                if (!pos) { hideHoverTooltip(); return; }
                const ctx = resolveFieldContextAt(editor, pos);
                if (!ctx) { hideHoverTooltip(); return; }

                let anchor = null;
                try {
                    const tok = editor.getTokenAt(pos);
                    if (tok) {
                        const a = editor.charCoords({ line: pos.line, ch: tok.start }, 'window');
                        const b = editor.charCoords({ line: pos.line, ch: tok.end }, 'window');
                        anchor = {
                            left: Math.min(a.left, b.left),
                            right: Math.max(a.right, b.right),
                            top: Math.min(a.top, b.top),
                            bottom: Math.max(a.bottom, b.bottom)
                        };
                    }
                } catch (err) { anchor = null; }

                if (anchor && (x < anchor.left - 1 || x > anchor.right + 1
                    || y < anchor.top || y > anchor.bottom)) {
                    hideHoverTooltip();
                    return;
                }

                if (ctx.unknownFieldId) {
                    showUnknownTooltip(x, y, ctx.tableName, ctx.unknownFieldId);
                } else {
                    showHoverTooltip(x, y, ctx.tableName, ctx.field);
                }

                hoverAnchor = anchor;
            }, 300);
        });

        wrapper.addEventListener('mouseleave', () => {
            clearTimeout(hoverTimer);
            hideHoverTooltip();
        });

        wrapper.querySelector('.CodeMirror-scroll')?.addEventListener('scroll', hideHoverTooltip);
    }

    function hideHoverTooltip() {
        if (hoverTooltipEl) {
            hoverTooltipEl.remove();
            hoverTooltipEl = null;
        }
        hoverAnchor = null;
    }

    function showHoverTooltip(x, y, tableName, field) {
        hideHoverTooltip();

        const unavailable = !field.isAvailable || field.removed;
        const label = field.label && field.label !== field.id && !/^\[Missing Label:/i.test(field.label)
            ? field.label : '';

        const parts = [];
        parts.push(`
            <div class="nsft-sql-hover-head">
                <span class="nsft-sql-hint-icon nsft-sql-hint-icon-${field.dataType || 'UNKNOWN'}">${getDataTypeIcon(field.dataType)}</span>
                <strong>${escapeHtml(field.id)}</strong>
                <span class="nsft-sql-hover-table">${escapeHtml(tableName)}</span>
            </div>`);
        if (label) parts.push(`<div class="nsft-sql-hover-label">${escapeHtml(label)}</div>`);

        const typeBits = [];
        if (field.dataType) typeBits.push(`<span class="nsft-sql-hover-tpill">${escapeHtml(field.dataType)}</span>`);
        if (field.fieldType && field.fieldType !== field.dataType) {
            typeBits.push(`<span class="nsft-sql-hover-tpill nsft-sql-hover-tpill-alt">${escapeHtml(field.fieldType)}</span>`);
        }
        if (typeBits.length) parts.push(`<div class="nsft-sql-hover-types">${typeBits.join(' ')}</div>`);

        if (unavailable && field.availabilityDetails && field.availabilityDetails.length) {
            parts.push(`<div class="nsft-sql-hover-warn">⚠ ${escapeHtml(field.availabilityDetails[0])}</div>`);
        }
        if (field.features && field.features.length) {
            parts.push(`<div class="nsft-sql-hover-meta"><b>${escapeHtml(chrome.i18n.getMessage('sql_field_features') || 'Features')}:</b> ${escapeHtml(field.features.join(', '))}</div>`);
        }
        if (field.permissions && field.permissions.length) {
            parts.push(`<div class="nsft-sql-hover-meta"><b>${escapeHtml(chrome.i18n.getMessage('sql_field_permissions') || 'Permissions')}:</b> ${escapeHtml(field.permissions.join(', '))}</div>`);
        }

        const el = document.createElement('div');
        el.className = 'nsft-sql-hover-tt';
        el.innerHTML = parts.join('');
        placeHoverTooltip(el, x, y);
    }

    function showUnknownTooltip(x, y, tableName, fieldId) {
        hideHoverTooltip();
        const msg = chrome.i18n.getMessage('sql_lint_unknown') || 'Unknown field on table';
        const el = document.createElement('div');
        el.className = 'nsft-sql-hover-tt nsft-sql-hover-tt-unknown';
        el.innerHTML = `
            <div class="nsft-sql-hover-head">
                <span class="nsft-sql-hint-icon nsft-sql-hint-icon-UNKNOWN">?</span>
                <strong>${escapeHtml(fieldId)}</strong>
                <span class="nsft-sql-hover-table">${escapeHtml(tableName)}</span>
            </div>
            <div class="nsft-sql-hover-warn">⚠ ${escapeHtml(msg)} <b>${escapeHtml(tableName)}</b></div>`;
        placeHoverTooltip(el, x, y);
    }

    function placeHoverTooltip(el, x, y) {
        el.style.left = '-9999px';
        el.style.top = '-9999px';
        document.body.appendChild(el);
        hoverTooltipEl = el;

        const rect = el.getBoundingClientRect();
        let left = x + 12;
        let top = y + 18;
        if (left + rect.width > window.innerWidth - 8) left = window.innerWidth - rect.width - 8;
        if (top + rect.height > window.innerHeight - 8) top = y - rect.height - 12;
        el.style.left = Math.max(8, left) + 'px';
        el.style.top = Math.max(8, top) + 'px';
    }

    let lintMarkers = [];
    let lintTimer = null;
    let lintEnabled = true;

    const _pendingJoinSchemaFetches = new Set();
    function requestJoinSchemaThenRelint(tableName) {
        if (!tableName) return;
        if (_pendingJoinSchemaFetches.has(tableName)) return;
        if (sqlTableMeta[tableName]) return;
        if (failedTables.has(tableName)) return;
        _pendingJoinSchemaFetches.add(tableName);
        fetchTableSchema(tableName).finally(() => {
            _pendingJoinSchemaFetches.delete(tableName);
            if (lintEnabled) runLint();
        });
    }

    function initLinter() {
        chrome.storage.local.get([LINT_ENABLED_KEY], (items) => {
            lintEnabled = items[LINT_ENABLED_KEY] !== false;
            updateLintToggleUI();
            if (editor && lintEnabled) runLint();
        });
        if (!editor) return;
        editor.on('change', () => {
            if (!lintEnabled) return;
            clearTimeout(lintTimer);
            lintTimer = setTimeout(runLint, 500);
        });
    }

    function clearLintMarkers() {
        lintMarkers.forEach(m => m.clear && m.clear());
        lintMarkers = [];
    }

    function runLint() {
        if (!editor) return;
        clearLintMarkers();
        if (!lintEnabled) return;

        const content = editor.getValue();
        const aliasMap = parseAliasMap(content);

        const re = /\b([a-z_][a-z0-9_]*(?:\.[a-z_][a-z0-9_]*)+)\b/gi;
        let m;
        while ((m = re.exec(content)) !== null) {
            const parts = m[1].split('.');
            if (parts.length < 2) continue;

            const rootAlias = parts[0].toLowerCase();
            const rootTable = aliasMap[rootAlias] || normalizeTableName(rootAlias);
            if (!rootTable || !sqlTableMeta[rootTable]) continue;

            let currentTable = rootTable;
            let resolved = true;
            for (let i = 1; i < parts.length - 1; i++) {
                const meta = sqlTableMeta[currentTable];
                if (!meta) { resolved = false; break; }
                const joinName = parts[i];
                let join = meta.joins[joinName];
                if (!join) {
                    const lcName = joinName.toLowerCase();
                    const k = Object.keys(meta.joins).find(kk => kk.toLowerCase() === lcName);
                    join = k ? meta.joins[k] : null;
                }
                if (!join || !join.targetTable) { resolved = false; break; }
                if (!sqlTableMeta[join.targetTable]) {
                    requestJoinSchemaThenRelint(join.targetTable);
                    resolved = false;
                    break;
                }
                currentTable = join.targetTable;
            }
            if (!resolved) continue;

            const finalMeta = sqlTableMeta[currentTable];
            const fieldId = parts[parts.length - 1];
            const fieldKey = Object.keys(finalMeta.fields).find(k => k.toLowerCase() === fieldId.toLowerCase());

            const fieldStart = m.index + m[1].length - fieldId.length;
            const fieldEnd = m.index + m[1].length;
            const fromPos = editor.posFromIndex(fieldStart);
            const toPos = editor.posFromIndex(fieldEnd);

            if (!fieldKey) {
                const marker = editor.markText(fromPos, toPos, {
                    className: 'nsft-sql-lint-unknown'
                });
                lintMarkers.push(marker);
                continue;
            }

            const field = finalMeta.fields[fieldKey];
            if (field.isAvailable && !field.removed) continue;

            const marker = editor.markText(fromPos, toPos, {
                className: 'nsft-sql-lint-unavailable'
            });
            lintMarkers.push(marker);
        }
    }

    function handleToggleLint() {
        lintEnabled = !lintEnabled;
        chrome.storage.local.set({ [LINT_ENABLED_KEY]: lintEnabled });
        updateLintToggleUI();
        if (lintEnabled) runLint();
        else clearLintMarkers();
        logToToolbar(
            (lintEnabled
                ? (chrome.i18n.getMessage('sql_lint_on') || 'Lint enabled')
                : (chrome.i18n.getMessage('sql_lint_off') || 'Lint disabled')),
            'info'
        );
    }

    function updateLintToggleUI() {
        const btn = document.getElementById('nsft-sql-tool-lint');
        if (!btn) return;
        btn.classList.toggle('is-active', lintEnabled);
    }

    function escapeRegExpLocal(s) {
        return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    function suggestJoinAlias(targetTable, used) {
        const stripped = (targetTable || '').replace(/^customrecord(type)?_/i, '');
        const firstLetter = (stripped.match(/[a-z]/i) || ['x'])[0].toLowerCase();
        let n = 1;
        while (used.has(firstLetter + n)) n++;
        const alias = firstLetter + n;
        used.add(alias);
        return alias;
    }

    function handleInsertJoin() {
        if (!editor) return;

        const menu = document.getElementById('nsft-sql-join-menu');
        if (!menu) return;

        if (menu.classList.contains('open')) {
            menu.classList.remove('open');
            return;
        }

        const fromTables = parseTablesFromQuery(editor.getValue());
        if (!fromTables.length) {
            logToToolbar(chrome.i18n.getMessage('sql_join_no_from') || 'Add a table to the FROM clause first', 'warning');
            return;
        }

        const entries = [];
        fromTables.forEach(rootTable => {
            const meta = sqlTableMeta[rootTable];
            if (!meta) return;
            Object.values(meta.joins).forEach(j => {
                if (!j.isAvailable || !j.targetTable) return;
                entries.push({ rootTable, join: j });
            });
        });

        if (!entries.length) {
            logToToolbar(chrome.i18n.getMessage('sql_join_no_schema') || 'Schema not loaded yet — wait a second', 'warning');
            return;
        }

        entries.sort((a, b) => {
            if (a.rootTable !== b.rootTable) return a.rootTable.localeCompare(b.rootTable);
            return (a.join.targetLabel || a.join.targetTable || '').localeCompare(b.join.targetLabel || b.join.targetTable || '');
        });

        renderJoinWizard(menu, entries);
        menu.classList.add('open');
    }

    const JOIN_TYPE_KEY = 'nsft_sql_join_type';
    const JOIN_TYPES = ['LEFT', 'INNER', 'RIGHT'];
    let currentJoinType = 'LEFT';

    chrome.storage.local.get([JOIN_TYPE_KEY], (items) => {
        const v = items[JOIN_TYPE_KEY];
        if (JOIN_TYPES.indexOf(v) !== -1) currentJoinType = v;
    });

    function renderJoinWizard(menu, entries) {
        menu.innerHTML = '';

        const header = document.createElement('div');
        header.className = 'nsft-sql-join-toolbar';

        const findWrap = document.createElement('div');
        findWrap.className = 'nsft-sql-find nsft-sql-find-join';

        const filter = document.createElement('input');
        filter.type = 'text';
        filter.id = 'nsft-sql-join-filter';
        filter.className = 'nsft-sql-join-filter';
        filter.placeholder = chrome.i18n.getMessage('sql_join_filter_placeholder') || 'Filter by name or target…';
        filter.addEventListener('click', (e) => e.stopPropagation());
        findWrap.appendChild(filter);
        header.appendChild(findWrap);

        const typeSelect = document.createElement('select');
        typeSelect.className = 'nsft-sql-join-type';
        typeSelect.title = chrome.i18n.getMessage('sql_join_type_title') || 'JOIN type';
        JOIN_TYPES.forEach(t => {
            const opt = document.createElement('option');
            opt.value = t;
            opt.textContent = t;
            if (t === currentJoinType) opt.selected = true;
            typeSelect.appendChild(opt);
        });
        typeSelect.addEventListener('click', (e) => e.stopPropagation());
        typeSelect.addEventListener('change', (e) => {
            currentJoinType = e.target.value;
            chrome.storage.local.set({ [JOIN_TYPE_KEY]: currentJoinType });
        });
        header.appendChild(typeSelect);

        menu.appendChild(header);
        wireFindClear('nsft-sql-join-filter');

        const listEl = document.createElement('div');
        listEl.className = 'nsft-sql-join-list';
        menu.appendChild(listEl);

        const draw = (q) => {
            listEl.innerHTML = '';
            const needle = tsFold((q || '').trim());
            let lastRoot = '';
            let count = 0;
            entries.forEach(({ rootTable, join }) => {
                const haystack = tsFold(`${join.id} ${join.targetTable || ''} ${join.targetLabel || ''}`);
                if (needle && !haystack.includes(needle)) return;

                if (rootTable !== lastRoot) {
                    const header = document.createElement('div');
                    header.className = 'nsft-sql-join-header';
                    header.textContent = rootTable;
                    listEl.appendChild(header);
                    lastRoot = rootTable;
                }

                const row = document.createElement('div');
                row.className = 'nsft-sql-join-item';

                const iconEl = document.createElement('span');
                iconEl.className = 'nsft-sql-join-icon';
                iconEl.textContent = '→';
                row.appendChild(iconEl);

                const marca = (el, texto) => {
                    const TS = window.NSFT_TextSearch;
                    if (TS && needle) TS.mark(el, texto, needle, 'nsft-sql-hl');
                    else el.textContent = texto;
                };

                const target = document.createElement('span');
                target.className = 'nsft-sql-join-target';
                marca(target, join.targetTable || '?');
                row.appendChild(target);

                if (join.targetLabel && join.targetLabel !== join.targetTable) {
                    const label = document.createElement('span');
                    label.className = 'nsft-sql-join-label';
                    marca(label, ' — ' + join.targetLabel);
                    row.appendChild(label);
                }

                const card = document.createElement('span');
                card.className = 'nsft-sql-join-card';
                card.textContent = join.cardinality || '';
                row.appendChild(card);

                row.addEventListener('click', (e) => {
                    e.stopPropagation();
                    insertJoinAtCursor(rootTable, join);
                    menu.classList.remove('open');
                });

                listEl.appendChild(row);
                count++;
            });

            if (!count) {
                const empty = document.createElement('div');
                empty.className = 'nsft-sql-join-empty';
                empty.textContent = chrome.i18n.getMessage('sql_join_empty') || 'No joins match';
                listEl.appendChild(empty);
            }
        };

        filter.addEventListener('input', (e) => draw(e.target.value));
        draw('');
        setTimeout(() => filter.focus(), 40);
    }

    function insertJoinAtCursor(rootTable, join) {
        const content = editor.getValue();
        const aliasMap = parseAliasMap(content);
        const used = collectUsedAliases(content);

        const rootAlias = Object.keys(aliasMap).find(a => aliasMap[a] === rootTable && a !== rootTable)
            || rootTable;

        const targetTable = join.targetTable;
        const targetAlias = suggestJoinAlias(targetTable, used);

        let onClause = join.onClause || `${rootAlias}.${join.fieldId || '?'} = ${targetAlias}.id`;

        const rootPattern = new RegExp('\\b' + escapeRegExpLocal(rootTable) + '\\.', 'gi');
        onClause = onClause.replace(rootPattern, rootAlias + '.');

        if (join.targetTableRaw) {
            const targetRawPattern = new RegExp('\\b' + escapeRegExpLocal(join.targetTableRaw) + '\\.', 'gi');
            onClause = onClause.replace(targetRawPattern, targetAlias + '.');
        }
        const targetLcPattern = new RegExp('\\b' + escapeRegExpLocal(targetTable) + '\\.', 'gi');
        onClause = onClause.replace(targetLcPattern, targetAlias + '.');

        const joinKeyword = (JOIN_TYPES.indexOf(currentJoinType) !== -1 ? currentJoinType : 'LEFT') + ' JOIN';
        const snippet = `\n${joinKeyword} ${targetTable} ${targetAlias} ON ${onClause}`;
        editor.replaceSelection(snippet);
        editor.focus();

        if (!sqlTableMeta[targetTable] && !failedTables.has(targetTable)) {
            fetchTableSchema(targetTable);
        }

        logToToolbar(
            chrome.i18n.getMessage('sql_join_inserted', [targetTable, targetAlias])
            || `JOIN to ${targetTable} (${targetAlias}) inserted`,
            'success'
        );
    }

    const runQuery = (ctx) => {
        if (!ctx.query_data) throw "Query data not found";
        if (FETCH_METHOD === 'nquery') { _runVia = 'nquery'; injectFetcher(ctx.query_data); return; }
        _runVia = 'rest';
        runQueryRest(ctx.query_data).then((ok) => {
            if (ok) return;
            if (_stopRequested) { setRunState('idle'); return; }
            if (FETCH_METHOD === 'rest') {
                setRunState('idle');
                logToToolbar(chrome.i18n.getMessage('sql_rest_unavailable')
                    || 'This account cannot use the REST endpoint; pick another method in preferences.', 'warning');
                return;
            }
            _runVia = 'nquery';
            injectFetcher(ctx.query_data);
        });
    };

    let ROWS_CONFIRM_THRESHOLD = 20000;
    let MANY_ROWS_ACTION = 'ask';
    let FETCH_METHOD = 'auto';
    let REST_CONCURRENCY = 4;
    let REST_FILL_COLUMNS = false;
    let AUTO_SCHEMA = true;

    async function askKeepFetching(fetched, total) {
        if (MANY_ROWS_ACTION === 'continue') return true;
        if (MANY_ROWS_ACTION === 'stop') return false;

        const conocido = total > fetched;
        const res = await showRunnerConfirm({
            title: chrome.i18n.getMessage('sql_rows_confirm_title') || 'Keep fetching rows?',
            body: (conocido
                ? chrome.i18n.getMessage('sql_rows_confirm_body', [fmtNum(fetched), fmtNum(total)])
                : chrome.i18n.getMessage('sql_rows_confirm_body_unknown', [fmtNum(fetched)])) || '',
            confirmLabel: chrome.i18n.getMessage('sql_rows_confirm_go') || 'Keep fetching',
            cancelLabel: chrome.i18n.getMessage('sql_rows_confirm_stop') || 'Stop here',
            rememberLabel: chrome.i18n.getMessage('sql_rows_confirm_remember') || 'Remember my answer'
        });
        const ok = !!(res && typeof res === 'object' ? res.ok : res);
        if (res && res.remember) {
            MANY_ROWS_ACTION = ok ? 'continue' : 'stop';
            chrome.storage.local.set({ suiteqlManyRowsAction: MANY_ROWS_ACTION });
        }
        return ok;
    }

    function fmtNum(n) {
        try { return Number(n).toLocaleString(); } catch (e) { return String(n); }
    }

    function offsetDeLinks(links, rel) {
        if (!Array.isArray(links)) return null;
        const l = links.find((x) => x && x.rel === rel);
        if (!l || !l.href) return null;
        const m = /[?&]offset=(\d+)/.exec(l.href);
        return m ? parseInt(m[1], 10) : null;
    }

    let _runnerRestBroken = false;
    async function runQueryRest(queryData) {
        if (_runnerRestBroken) return false;
        const query = queryData && queryData.query;
        if (!query) return false;
        if (window.NSFT_SuiteQLRest && await window.NSFT_SuiteQLRest.isKnownOff()) {
            const vivo = window.NSFT_SuiteQLRest.probe
                ? await window.NSFT_SuiteQLRest.probe()
                : false;
            if (!vivo) {
                _runnerRestBroken = true;
                return false;
            }
        }
        const startTime = Date.now();
        const maxRecords = (queryData && queryData.maxRecords) || 5000;
        const MIN_LIMIT = 50;

        const ctrl = (typeof AbortController !== 'undefined') ? new AbortController() : null;
        _restAbort = ctrl;

        const pedirPagina = async (offset, limit) => {
            try {
                const url = new URL('/services/rest/query/v1/suiteql?limit=' + limit + '&offset=' + offset, location.origin);
                const res = await fetch(url.href, {
                    method: 'POST',
                    credentials: 'same-origin',
                    headers: { 'Content-Type': 'application/json', 'Prefer': 'transient' },
                    body: JSON.stringify({ q: query }),
                    signal: ctrl ? ctrl.signal : undefined
                });
                if (!res.ok) {
                    let detail = '';
                    try {
                        const j = await res.json();
                        detail = (j['o:errorDetails'] && j['o:errorDetails'][0] && j['o:errorDetails'][0].detail) || j.title || '';
                    } catch (e) { }
                    return { offset: offset, ok: false, status: res.status, detail: detail };
                }
                const j = await res.json();
                const items = Array.isArray(j.items) ? j.items : [];
                const filas = items.map((it) => {
                    const row = {};
                    Object.keys(it).forEach((k) => { if (k !== 'links') row[k] = it[k]; });
                    return row;
                });
                return {
                    offset: offset, ok: true, rows: filas,
                    total: (typeof j.totalResults === 'number') ? j.totalResults : 0,
                    hasMore: !!j.hasMore,
                    lastOffset: offsetDeLinks(j.links, 'last'),
                    nextOffset: offsetDeLinks(j.links, 'next')
                };
            } catch (e) {
                if (e && e.name === 'AbortError') {
                    return { offset: offset, ok: false, status: -1, aborted: true, detail: '' };
                }
                return { offset: offset, ok: false, status: 0, detail: (e && e.message) || '' };
            }
        };

        try {
            let limit = 1000;
            let stopReason = 'complete';
            let asked = false;

            let primera = await pedirPagina(0, Math.min(limit, maxRecords));
            if (!primera.ok) {
                const st = primera.status;
                if (primera.aborted) {
                    handleExtensionMessage({
                        type: 'results',
                        payload: { data: [], count: 0, executionTime: Date.now() - startTime, query, stopReason: 'user' }
                    });
                    return true;
                }
                if (st === 401 || st === 403 || st === 404) {
                    _runnerRestBroken = true;
                    if (window.NSFT_SuiteQLRest && (st === 403 || st === 404)) {
                        window.NSFT_SuiteQLRest.markOff();
                    }
                    return false;
                }
                const porTamano = st === 0 || st === 408 || st === 429 || st >= 500;
                if (!porTamano) {
                    handleExtensionMessage({ type: 'error', text: primera.detail || ('HTTP ' + st) });
                    return true;
                }
                while (!primera.ok && !primera.aborted && limit > MIN_LIMIT) {
                    limit = Math.max(MIN_LIMIT, Math.floor(limit / 5));
                    primera = await pedirPagina(0, Math.min(limit, maxRecords));
                }
                if (primera.aborted || _stopRequested) {
                    handleExtensionMessage({
                        type: 'results',
                        payload: { data: [], count: 0, executionTime: Date.now() - startTime, query, stopReason: 'user' }
                    });
                    return true;
                }
                if (!primera.ok) return false;
            }

            let rows = primera.rows;
            let total = primera.total || rows.length;
            reportRunProgress(rows.length, Math.min(total, maxRecords));

            const finPorEnlace = primera.lastOffset ? primera.lastOffset + limit : 0;
            const techo = total
                ? Math.min(maxRecords, total)
                : (finPorEnlace ? Math.min(maxRecords, finPorEnlace) : maxRecords);

            const offsetEsperado = rows.length;
            const desacuerdo = primera.nextOffset != null && primera.nextOffset !== offsetEsperado;
            const aCiegas = !total && !finPorEnlace;
            const guiadoPorNext = desacuerdo || aCiegas;

            let siguiente = guiadoPorNext && primera.nextOffset != null
                ? primera.nextOffset
                : offsetEsperado;
            let hayMas = primera.hasMore && rows.length > 0;
            let concurrencia = guiadoPorNext ? 1 : Math.max(1, Math.min(8, REST_CONCURRENCY));
            let guard = 0;

            while (hayMas && siguiente < techo) {
                if (_stopRequested) { stopReason = 'user'; break; }

                if (++guard > Math.ceil(techo / MIN_LIMIT) + 8) { stopReason = 'guard'; break; }

                if (!asked && rows.length >= ROWS_CONFIRM_THRESHOLD) {
                    asked = true;
                    const seguir = await askKeepFetching(rows.length, Math.min(total || techo, techo));
                    if (!seguir) { stopReason = 'user'; break; }
                }

                const tanda = [];
                let cursor = siguiente;
                for (let i = 0; i < concurrencia && cursor < techo; i++) {
                    tanda.push({ offset: cursor, limit: limit });
                    cursor += limit;
                }
                if (!tanda.length) break;

                const respuestas = await Promise.all(tanda.map((p) => pedirPagina(p.offset, p.limit)));

                let fallo = null;
                for (let i = 0; i < respuestas.length; i++) {
                    const r = respuestas[i];
                    if (!r.ok) { fallo = r; break; }
                    if (r.total) total = r.total;
                    if (r.rows.length) rows = rows.concat(r.rows);
                    siguiente = (guiadoPorNext && r.nextOffset != null)
                        ? r.nextOffset
                        : r.offset + r.rows.length;
                    if (!r.hasMore || r.rows.length < tanda[i].limit) { hayMas = false; break; }
                }

                if (fallo) {
                    const st = fallo.status;
                    if (fallo.aborted) { stopReason = 'user'; break; }
                    if (st === 401 || st === 403 || st === 404) {
                        stopReason = 'limit';
                        break;
                    }
                    const porTamano = st === 0 || st === 408 || st === 429 || st >= 500;
                    if (!porTamano) {
                        handleExtensionMessage({ type: 'error', text: fallo.detail || ('HTTP ' + st) });
                        return true;
                    }
                    if (concurrencia > 1) {
                        concurrencia = Math.max(1, Math.floor(concurrencia / 2));
                    } else if (limit > MIN_LIMIT) {
                        limit = Math.max(MIN_LIMIT, Math.floor(limit / 5));
                    } else {
                        stopReason = 'limit';
                        break;
                    }
                }

                reportRunProgress(rows.length, Math.min(total || techo, techo));

                await new Promise((r) => setTimeout(r, 0));
            }

            if (rows.length > techo) rows = rows.slice(0, techo);

            if (stopReason === 'complete' && rows.length >= maxRecords && (hayMas || total > maxRecords)) {
                stopReason = 'max';
            }

            handleExtensionMessage({
                type: 'results',
                payload: { data: rows, count: total, executionTime: Date.now() - startTime, query, stopReason }
            });
            return true;
        } catch (e) {
            return false;
        } finally {
            if (_restAbort === ctrl) _restAbort = null;
        }
    }

    function injectFetcher(queryData = null) {
        const scriptId = 'nsft-suiteql-fetcher-script';
        const existing = document.getElementById(scriptId);

        if (existing) {
            if (queryData) {
                window.postMessage({ type: 'execute_SQL', dest: 'fetcher_sql', payload: queryData }, '*');
            }
            return;
        }

        const script = document.createElement('script');
        script.id = scriptId;
        script.src = chrome.runtime.getURL('scripts/modules/suiteql_runner/suiteql_fetcher.js');
        script.onload = function () {
            if (queryData) {
                setTimeout(() => {
                    window.postMessage({ type: 'execute_SQL', dest: 'fetcher_sql', payload: queryData }, '*');
                }, 200);
            }
        };
        (document.head || document.documentElement).appendChild(script);
    }

    function applyVariables(query, overrides) {
        if (!Array.isArray(sqlVariables) || !sqlVariables.length) return query;
        const ov = overrides || {};
        let out = query;
        sqlVariables.forEach((v) => {
            if (!v || !v.name) return;
            const re = new RegExp('\\{\\{\\s*' + escapeRegExpLocal(v.name) + '\\s*\\}\\}', 'g');
            const val = Object.prototype.hasOwnProperty.call(ov, v.name)
                ? ov[v.name]
                : (v.value != null ? String(v.value) : '');
            out = out.replace(re, val != null ? String(val) : '');
        });
        return out;
    }

    function stripSqlComments(sql) {
        let out = '';
        let i = 0;
        let inStr = false;
        while (i < sql.length) {
            const c = sql[i];
            const next = sql[i + 1];
            if (inStr) {
                out += c;
                if (c === "'") {
                    if (next === "'") { out += next; i += 2; continue; }
                    inStr = false;
                }
                i++;
                continue;
            }
            if (c === "'") { inStr = true; out += c; i++; continue; }
            if (c === '-' && next === '-') {
                while (i < sql.length && sql[i] !== '\n') i++;
                continue;
            }
            if (c === '/' && next === '*') {
                i += 2;
                while (i < sql.length && !(sql[i] === '*' && sql[i + 1] === '/')) i++;
                i += 2;
                continue;
            }
            out += c;
            i++;
        }
        return out;
    }

    function undeclaredVarsInQuery(query) {
        const effective = stripSqlComments(String(query || ''));
        const found = effective.match(/\{\{\s*[^}\s][^}]*\}\}/g) || [];
        const seen = Object.create(null);
        const out = [];
        found.forEach((m) => {
            const name = m.replace(/^\{\{\s*|\s*\}\}$/g, '').trim();
            if (!name || seen[name]) return;
            seen[name] = true;
            out.push(name);
        });
        return out;
    }

    function runtimeVarsInQuery(query) {
        if (!Array.isArray(sqlVariables) || !sqlVariables.length) return [];
        const effective = stripSqlComments(query);
        return sqlVariables.filter((v) => {
            if (!isRuntimeVar(v) || !v.name) return false;
            const re = new RegExp('\\{\\{\\s*' + escapeRegExpLocal(v.name) + '\\s*\\}\\}');
            return re.test(effective);
        });
    }

    function showRuntimeVarsDialog(vars, onConfirm) {
        if (document.getElementById('nsft-sql-runvars-dialog')) return;

        const overlay = document.createElement('div');
        overlay.id = 'nsft-sql-runvars-dialog';
        overlay.className = 'nsft-sql-dialog';

        const panel = document.createElement('div');
        panel.className = 'nsft-sql-vars-panel';

        const title = document.createElement('h3');
        title.className = 'nsft-sql-vars-title';
        title.textContent = chrome.i18n.getMessage('sql_runvars_title') || 'Values for this run';

        const hint = document.createElement('p');
        hint.className = 'nsft-sql-vars-hint';
        hint.textContent = chrome.i18n.getMessage('sql_runvars_hint')
            || 'These variables are asked for on every run. The values are not saved.';

        const list = document.createElement('div');
        list.className = 'nsft-sql-vars-list';

        const inputs = [];
        vars.forEach((v) => {
            const row = document.createElement('div');
            row.className = 'nsft-sql-vars-row';

            const label = document.createElement('label');
            label.className = 'nsft-sql-vars-name nsft-sql-runvars-label';
            label.textContent = '{{' + v.name + '}}';

            const input = document.createElement('input');
            input.type = 'text';
            input.className = 'nsft-sql-vars-value';
            input.placeholder = chrome.i18n.getMessage('sql_vars_value_ph') || 'value';
            const remembered = _runtimeVarMemory[v.name];
            input.value = remembered != null ? remembered
                : (v.type === 'both' && v.value != null ? String(v.value) : '');
            input.setAttribute('data-var', v.name);

            row.appendChild(label);
            row.appendChild(input);
            list.appendChild(row);
            inputs.push(input);
        });

        const footer = document.createElement('div');
        footer.className = 'nsft-sql-vars-footer';

        const btnCancel = document.createElement('button');
        btnCancel.type = 'button';
        btnCancel.className = 'nsft-sql-vars-btn nsft-sql-vars-cancel';
        btnCancel.textContent = chrome.i18n.getMessage('btn_cancel') || 'Cancel';
        btnCancel.onclick = () => overlay.remove();

        const btnRun = document.createElement('button');
        btnRun.type = 'button';
        btnRun.className = 'nsft-sql-vars-btn nsft-sql-vars-save';
        btnRun.textContent = chrome.i18n.getMessage('sql_runvars_run') || 'Run';
        btnRun.onclick = () => {
            const values = {};
            inputs.forEach((inp) => {
                const name = inp.getAttribute('data-var');
                values[name] = inp.value;
                _runtimeVarMemory[name] = inp.value;
            });
            overlay.remove();
            onConfirm(values);
        };

        footer.appendChild(btnCancel);
        footer.appendChild(btnRun);

        panel.appendChild(title);
        panel.appendChild(hint);
        panel.appendChild(list);
        panel.appendChild(footer);
        overlay.appendChild(panel);

        overlay.addEventListener('keydown', (e) => {
            e.stopPropagation();
            if (e.key === 'Escape') { overlay.remove(); return; }
            if (e.key === 'Enter') { e.preventDefault(); btnRun.click(); }
        });

        const modalContainer = document.getElementById('nsft-sql-modal');
        if (modalContainer) modalContainer.appendChild(overlay);
        if (inputs.length) setTimeout(() => { inputs[0].focus(); inputs[0].select(); }, 30);
    }

    function executeCurrentQuery() {
        if (!editor) return;

        if (_runPhase !== 'idle') {
            logToToolbar(chrome.i18n.getMessage('sql_already_running')
                || 'Ya hay una consulta en marcha.', 'warning');
            return;
        }

        const rawQuery = editor.getValue();
        if (!rawQuery.trim()) return;

        const pending = runtimeVarsInQuery(rawQuery);
        if (pending.length) {
            showRuntimeVarsDialog(pending, (values) => runResolvedQuery(rawQuery, values));
            return;
        }
        runResolvedQuery(rawQuery, null);
    }

    function runResolvedQuery(rawQuery, overrides) {
        logToToolbar(chrome.i18n.getMessage('sql_executing_query') || 'Executing query', 'info');

        const query = applyVariables(rawQuery, overrides);

        const undeclared = undeclaredVarsInQuery(query);
        if (undeclared.length) {
            logToToolbar(chrome.i18n.getMessage('sql_vars_undeclared', [undeclared.join(', ')])
                || ('Variables sin definir: ' + undeclared.join(', ')), 'error');
            return;
        }

        _lastRunQuery = query;

        _rounds = null;
        _askedThisRun = false;
        _stopRequested = false;
        _restAbort = null;
        _runVia = null;

        switchPanelTab('results');
        setRunState('running');

        addToHistory(rawQuery);

        const ctx = {
            query_data: {
                query: query,
                maxRecords: MAX_RECORDS_FETCH
            }
        };
        runQuery(ctx);
    }


    function handleToolbarRun() {
        if (_runPhase !== 'idle') { requestStopRun(); return; }
        executeCurrentQuery();
    }

    window.addEventListener('nsft-ai-run-sql', function (e) {
        const sql = e && e.detail && e.detail.sql;
        if (!sql || !String(sql).trim()) return;
        if (_runPhase !== 'idle') {
            logToToolbar(chrome.i18n.getMessage('sql_already_running')
                || 'Ya hay una consulta en marcha.', 'warning');
            return;
        }
        const raw = String(sql);
        const pending = runtimeVarsInQuery(raw);
        if (pending.length) {
            showRuntimeVarsDialog(pending, (values) => runResolvedQuery(raw, values));
            return;
        }
        runResolvedQuery(raw, null);
    });

    function dispatchLayoutUpdate() {
        window.dispatchEvent(new CustomEvent('nsft-layout-update'));
    }

    function bringToFront() {
        const modal = document.getElementById('nsft-sql-modal');
        if (!modal) return;
        const stack = window.NSFT_ModalStack;
        if (stack && stack.bringToFront) {
            stack.bringToFront(modal);
        } else {
            const others = document.querySelectorAll('.nsft-rec-obj-modal, .nsft-scripted-rec-modal, .suiteql-runner-modal');
            let maxZ = 10001;
            others.forEach(m => {
                const z = parseInt(window.getComputedStyle(m).zIndex) || 10001;
                if (z > maxZ) maxZ = z;
            });
            modal.style.zIndex = maxZ + 1;
        }
    }

    let _constrainTimer = null;
    let _constrainOnEnd = null;

    function constrainModalAfterTransition(el) {
        if (!el) return;
        if (_constrainOnEnd) el.removeEventListener('transitionend', _constrainOnEnd);
        clearTimeout(_constrainTimer);

        const done = () => {
            clearTimeout(_constrainTimer);
            _constrainTimer = null;
            if (_constrainOnEnd) {
                el.removeEventListener('transitionend', _constrainOnEnd);
                _constrainOnEnd = null;
            }
            constrainModalToWindow(el);
        };
        _constrainOnEnd = (ev) => {
            if (ev.target !== el) return;
            if (['width', 'height', 'top', 'left'].indexOf(ev.propertyName) === -1) return;
            done();
        };
        el.addEventListener('transitionend', _constrainOnEnd);
        _constrainTimer = setTimeout(done, 900);
    }

    function constrainModalToWindow(el) {
        if (!el || (!el.style.left && !el.style.top)) return;
        if (el.dataset.state === 'fullscreen') return;
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;
        const rect = el.getBoundingClientRect();

        let newLeft = rect.left;
        let newTop = rect.top;

        if (newLeft + rect.width > viewportWidth) newLeft = viewportWidth - rect.width - 15;
        if (newLeft < 15) newLeft = 15;
        if (newTop + rect.height > viewportHeight) newTop = viewportHeight - rect.height - 15;
        if (newTop < 15) newTop = 15;

        if (Math.abs(newLeft - rect.left) > 0.5 || Math.abs(newTop - rect.top) > 0.5) {
            el.style.left = newLeft + 'px';
            el.style.top = newTop + 'px';
        }
    }

    function snapToEdge(el) {
        if (!el) return;
        el.style.right = 'auto';
        el.style.bottom = 'auto';

        const isMin = el.dataset.state === 'minimised';
        const rect = el.getBoundingClientRect();
        const viewportWidth = window.innerWidth;
        const targetWidth = isMin ? 165 : rect.width;
        const centerX = rect.left + (rect.width / 2);

        const p = 15;

        if (centerX < (viewportWidth / 2)) {
            el.style.left = p + 'px';
        } else {
            el.style.left = (viewportWidth - targetWidth - p) + 'px';
        }
        constrainModalToWindow(el);
    }

    const NSFT_KEYS = window.NSFT_MacKeys
        || { isMac: /Mac|iPhone|iPad/i.test(navigator.platform || navigator.userAgent || ''), mod: 'Ctrl', shift: 'Shift' };
    const IS_MAC = NSFT_KEYS.isMac;
    const KBD_MOD = NSFT_KEYS.mod + '+';
    const KBD_SHIFT = NSFT_KEYS.shift + '+';
    const KBD_ENTER = 'Enter';
    const kbd = (combo) => `<span class="nsft-sql-kbd">${combo}</span>`;

    const getHtmlTemplate = () => `
        <div class="suiteql-runner-modal" id="nsft-sql-modal" data-state="maximised">
            <div class="suiteql-runner-header">
                <span id="nsft-sql-title"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#000000" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 6px; vertical-align: middle;"><ellipse cx="12" cy="5" rx="9" ry="3"></ellipse><path d="M3 5V19A9 3 0 0 0 21 19V5"></path><path d="M3 12A9 3 0 0 0 21 12"></path></svg>${chrome.i18n.getMessage('sql_title') || 'SuiteQL Runner'}</span>
                <span class="nsft-header-actions">
                    <span id="nsft-sql-minimise"></span>
                    <span id="nsft-sql-fullscreen" title="${chrome.i18n.getMessage('sql_fullscreen_enter') || 'Full screen'}"></span>
                    <span id="nsft-sql-maximise"></span>
                    <span id="nsft-sql-close">✕</span>
                </span>
                <div class="suiteql-runner-header-line"></div>
            </div>
            <div class="suiteql-runner-content">
                <div class="nsft-sql-menubar">
                    <div class="nsft-sql-menu-item" id="nsft-sql-menu-file">
                        ${chrome.i18n.getMessage('sql_menu_file') || 'File'}
                        <div class="nsft-sql-submenu">
                            <div class="nsft-sql-submenu-item" id="nsft-sql-action-open"><span>${chrome.i18n.getMessage('sql_submenu_open') || 'Open'}</span>${kbd(KBD_MOD + 'O')}</div>
                            <div class="nsft-sql-submenu-item" id="nsft-sql-action-save"><span>${chrome.i18n.getMessage('sql_submenu_save') || 'Save'}</span>${kbd(KBD_MOD + 'S')}</div>
                            <div class="nsft-sql-submenu-item" id="nsft-sql-action-save-as"><span>${chrome.i18n.getMessage('sql_submenu_save_as') || 'Save As...'}</span>${kbd(KBD_MOD + KBD_SHIFT + 'S')}</div>
                            <div class="nsft-sql-submenu-item" id="nsft-sql-action-export"><span>${chrome.i18n.getMessage('sql_submenu_export') || 'Export'}</span>${kbd(KBD_MOD + KBD_SHIFT + 'D')}</div>
                            <div class="nsft-sql-submenu-separator"></div>
                            <div class="nsft-sql-submenu-item" id="nsft-sql-action-import-json"><span>${chrome.i18n.getMessage('sql_import_btn') || 'Import JSON'}</span>${kbd(KBD_MOD + KBD_SHIFT + 'G')}</div>
                            <div class="nsft-sql-submenu-item" id="nsft-sql-action-export-json"><span>${chrome.i18n.getMessage('sql_export_btn') || 'Export JSON'}</span>${kbd(KBD_MOD + KBD_SHIFT + 'Y')}</div>
                            <div class="nsft-sql-submenu-separator"></div>
                            <div class="nsft-sql-submenu-item" id="nsft-sql-action-exit"><span>${chrome.i18n.getMessage('sql_submenu_exit') || 'Exit'}</span>${kbd(KBD_MOD + KBD_SHIFT + 'X')}</div>
                        </div>
                    </div>
                    <div class="nsft-sql-menu-item" id="nsft-sql-menu-edit">
                        ${chrome.i18n.getMessage('sql_menu_edit') || 'Edit'}
                        <div class="nsft-sql-submenu">
                            <div class="nsft-sql-submenu-item" id="nsft-sql-action-format"><span>${chrome.i18n.getMessage('sql_submenu_format') || 'Format'}</span>${kbd(KBD_MOD + KBD_SHIFT + 'F')}</div>
                            <div class="nsft-sql-submenu-item" id="nsft-sql-action-find"><span>${chrome.i18n.getMessage('sql_submenu_find') || 'Find'}</span>${kbd(KBD_MOD + 'F')}</div>
                            <div class="nsft-sql-submenu-item" id="nsft-sql-action-autocomplete"><span>${chrome.i18n.getMessage('sql_submenu_autocomplete') || 'Show suggestions'}</span>${kbd(KBD_MOD + 'Space')}</div>
                            <div class="nsft-sql-submenu-separator"></div>
                            <div class="nsft-sql-submenu-item" id="nsft-sql-action-variables"><span>${chrome.i18n.getMessage('sql_menu_variables') || 'Variables…'}</span></div>
                            <div class="nsft-sql-submenu-item" id="nsft-sql-action-refresh-schema"><span>${chrome.i18n.getMessage('sql_menu_refresh_schema') || 'Refresh schema'}</span>${kbd(KBD_MOD + KBD_SHIFT + 'K')}</div>
                        </div>
                    </div>
                    <div class="nsft-sql-menu-item" id="nsft-sql-menu-run">
                        ${chrome.i18n.getMessage('sql_menu_run') || 'Run'}
                        <div class="nsft-sql-submenu">
                            <div class="nsft-sql-submenu-item" id="nsft-sql-action-run"><span>${chrome.i18n.getMessage('sql_submenu_run') || 'Run'}</span>${kbd(KBD_MOD + KBD_ENTER)}</div>
                            <div class="nsft-sql-submenu-item" id="nsft-sql-action-export-res"><span>${chrome.i18n.getMessage('sql_submenu_export_results') || 'Export Results'}</span>${kbd(KBD_MOD + KBD_SHIFT + 'E')}</div>
                        </div>
                    </div>
                    <div class="nsft-sql-menu-item" id="nsft-sql-menu-view">
                        ${chrome.i18n.getMessage('sql_menu_view') || 'View'}
                        <div class="nsft-sql-submenu">
                            <div class="nsft-sql-submenu-item" id="nsft-sql-action-view-editor"><span>${chrome.i18n.getMessage('sql_menu_hide_editor') || 'Hide Editor'}</span>${kbd(KBD_MOD + KBD_SHIFT + '1')}</div>
                            <div class="nsft-sql-submenu-item" id="nsft-sql-action-view-table"><span>${chrome.i18n.getMessage('sql_menu_hide_table') || 'Hide Results Table'}</span>${kbd(KBD_MOD + KBD_SHIFT + '2')}</div>
                            <div class="nsft-sql-submenu-item" id="nsft-sql-action-schema-toggle"><span>${chrome.i18n.getMessage('sql_menu_toggle_schema') || 'Toggle Schema explorer'}</span>${kbd(KBD_MOD + 'B')}</div>
                            <div class="nsft-sql-submenu-separator"></div>
                            <div class="nsft-sql-submenu-item" id="nsft-sql-action-sidebar-left"><span>${chrome.i18n.getMessage('sql_menu_sidebar_left') || 'Schema explorer: Left'}</span></div>
                            <div class="nsft-sql-submenu-item" id="nsft-sql-action-sidebar-right"><span>${chrome.i18n.getMessage('sql_menu_sidebar_right') || 'Schema explorer: Right'}</span></div>
                        </div>
                    </div>
                    <div class="nsft-sql-menu-item" id="nsft-sql-menu-help">
                        ${chrome.i18n.getMessage('sql_menu_help') || 'Help'}
                        <div class="nsft-sql-submenu">
                            <div class="nsft-sql-submenu-item" id="nsft-sql-action-catalog">${chrome.i18n.getMessage('sql_submenu_catalog') || 'View Records Catalog'}</div>
                            <div class="nsft-sql-submenu-item" id="nsft-sql-action-builtin-fn">${chrome.i18n.getMessage('sql_submenu_builtin_fn') || 'Built-in Functions'}</div>
                        </div>
                    </div>
                    <div id="nsft-sql-logs-container" class="nsft-sql-logs-container"></div>
                </div>

                <div class="nsft-sql-toolbar">
                    <div class="nsft-sql-toolbar-group">
                        <button class="nsft-sql-toolbar-button nsft-sql-iconbtn" id="nsft-sql-tool-open" title="${chrome.i18n.getMessage('sql_submenu_open') || 'Open'} (${KBD_MOD}O)">
                            <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"><path d="M1.5 4.5v8h11l2-5.5H4L2.5 11.5"></path><path d="M1.5 4.5v-1.5h4.5l1.5 1.5h5v1.5"></path></svg>
                        </button>
                        <button class="nsft-sql-toolbar-button nsft-sql-iconbtn" id="nsft-sql-tool-save" title="${chrome.i18n.getMessage('sql_submenu_save') || 'Save'} (${KBD_MOD}S)">
                            <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"><path d="M2 2h9.5L14 4.5V14H2z"></path><path d="M4.5 2v3.5h6V2"></path><path d="M4.5 14v-5h7v5"></path></svg>
                        </button>
                        <button class="nsft-sql-toolbar-button nsft-sql-iconbtn nsft-sql-iconbtn-wide" id="nsft-sql-tool-save-as" title="${chrome.i18n.getMessage('sql_submenu_save_as') || 'Save As...'} (${KBD_MOD}${KBD_SHIFT}S)">
                            <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"><path d="M2 2h9.5L14 4.5V14H2z"></path><path d="M4.5 2v3.5h6V2"></path><path d="M4.5 14v-5h7v5"></path></svg><span class="nsft-sql-iconbtn-plus">+</span>
                        </button>
                    </div>
                    <div class="nsft-sql-toolbar-sep"></div>

                    <button class="nsft-sql-toolbar-button" id="nsft-sql-tool-run" title="${chrome.i18n.getMessage('sql_submenu_run') || 'Run'} (${KBD_MOD}${KBD_ENTER})" style="background-color: var(--nsft-ns-accent, #3b82f6); color: white; border-color: var(--nsft-ns-accent-bd, #2563eb);">
                        <span class="nsft-sql-btn-glyph nsft-sql-run-glyph">▶</span><span class="nsft-sql-run-label">${chrome.i18n.getMessage('sql_submenu_run') || 'Run'}</span><span class="nsft-sql-kbd">${IS_MAC ? '⌘↵' : 'Ctrl+↵'}</span>
                    </button>
                    <div class="nsft-sql-toolbar-sep"></div>

                    <div class="nsft-sql-toolbar-group">
                        <button class="nsft-sql-toolbar-button" id="nsft-sql-tool-format" title="${chrome.i18n.getMessage('sql_submenu_format') || 'Format'} (${KBD_MOD}${KBD_SHIFT}F)">
                            <span class="nsft-sql-btn-glyph">≡</span>${chrome.i18n.getMessage('sql_submenu_format') || 'Format'}
                        </button>
                        <div class="nsft-sql-favorites-wrap">
                            <button class="nsft-sql-toolbar-button" id="nsft-sql-tool-join" title="${chrome.i18n.getMessage('sql_join_title') || 'Insert JOIN'}">
                                <span class="nsft-sql-btn-glyph">⋈</span>${chrome.i18n.getMessage('sql_join_btn') || 'JOIN'}
                            </button>
                            <div class="nsft-sql-favorites-menu nsft-sql-join-menu" id="nsft-sql-join-menu"></div>
                        </div>
                        <div class="nsft-sql-favorites-wrap">
                            <button class="nsft-sql-toolbar-button" id="nsft-sql-tool-variables" title="${chrome.i18n.getMessage('sql_vars_title') || 'Variables'}">
                                <span class="nsft-sql-btn-glyph">{{}}</span>${chrome.i18n.getMessage('sql_vars_btn') || 'Variables'}
                            </button>
                            <div class="nsft-sql-favorites-menu" id="nsft-sql-variables-menu"></div>
                        </div>
                        <div class="nsft-sql-favorites-wrap">
                            <button class="nsft-sql-toolbar-button" id="nsft-sql-tool-snippets" title="${chrome.i18n.getMessage('sql_snippets') || 'Snippets'}">
                                <span class="nsft-sql-btn-glyph">&lt;/&gt;</span>${chrome.i18n.getMessage('sql_snippets') || 'Snippets'}
                            </button>
                            <div class="nsft-sql-favorites-menu" id="nsft-sql-snippets-menu"></div>
                        </div>
                        <div class="nsft-sql-favorites-wrap">
                            <button class="nsft-sql-toolbar-button" id="nsft-sql-tool-favorites" title="${chrome.i18n.getMessage('sql_favorites') || 'Favorites'}">
                                <span class="nsft-sql-btn-glyph">☆</span>${chrome.i18n.getMessage('sql_favorites') || 'Favorites'}
                            </button>
                            <div class="nsft-sql-favorites-menu" id="nsft-sql-favorites-menu"></div>
                        </div>
                    </div>
                    <div class="nsft-sql-toolbar-spacer"></div>

                    
                    <button class="nsft-sql-toolbar-button nsft-sql-iconbtn" id="nsft-sql-tool-ghost" hidden
                        title="${escapeHtml(chrome.i18n.getMessage('sql_ghost_btn_title') || 'AI SQL suggestions — Tab accepts (click to toggle)')}"
                        aria-label="${escapeHtml(chrome.i18n.getMessage('sql_ghost_btn_title') || 'AI SQL suggestions')}">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l1.8 4.6 4.7 1.8-4.7 1.8L12 16l-1.8-4.8-4.7-1.8 4.7-1.8z"></path><path d="M4 21h10"></path></svg>
                        <span class="nsft-sql-ghost-spin" aria-hidden="true"></span>
                    </button>
                    <button class="nsft-sql-toolbar-button nsft-sql-iconbtn" id="nsft-sql-tool-schema-toggle" title="${chrome.i18n.getMessage('sql_schema_toggle_title') || 'Toggle Schema explorer'} (${KBD_MOD}B)">
                        <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"><rect x="1.5" y="2.5" width="13" height="11" rx="1.5"></rect><path d="M6 2.5v11"></path></svg>
                    </button>
                    <button class="nsft-sql-toolbar-button nsft-sql-iconbtn is-active" id="nsft-sql-tool-results-toggle" title="${chrome.i18n.getMessage('sql_results_toggle_title') || 'Show/hide results'}">
                        <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"><rect x="1.5" y="2.5" width="13" height="11" rx="1.5"></rect><path d="M1.5 9.5h13"></path></svg>
                    </button>
                    <button class="nsft-sql-toolbar-button nsft-sql-iconbtn" id="nsft-sql-tool-lint" title="${chrome.i18n.getMessage('sql_lint_toggle_title') || 'Toggle field availability lint'}">
                        <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M2.5 8.5l3.5 3.5 7.5-8"></path></svg>
                    </button>
                </div>
                
                <div class="nsft-sql-tabs-row">
                    <button type="button" class="nsft-sql-tabs-nav" id="nsft-sql-tabs-prev" hidden
                        title="${escapeHtml(chrome.i18n.getMessage('sql_tabs_scroll_prev') || 'Pestañas anteriores')}"
                        aria-label="${escapeHtml(chrome.i18n.getMessage('sql_tabs_scroll_prev') || 'Pestañas anteriores')}">‹</button>
                    <div class="nsft-sql-tabs-bar" id="nsft-sql-tabs-bar"></div>
                    <button type="button" class="nsft-sql-tabs-nav" id="nsft-sql-tabs-next" hidden
                        title="${escapeHtml(chrome.i18n.getMessage('sql_tabs_scroll_next') || 'Pestañas siguientes')}"
                        aria-label="${escapeHtml(chrome.i18n.getMessage('sql_tabs_scroll_next') || 'Pestañas siguientes')}">›</button>
                </div>
                <div class="nsft-sql-workzone${cachedSidebarSide === 'right' ? ' sidebar-right' : ''}">
                    
                    <button type="button" class="nsft-sql-edge-tab nsft-sql-edge-tab-schema" id="nsft-sql-edge-schema"
                        title="${chrome.i18n.getMessage('sql_schema_toggle_title') || 'Toggle Schema explorer'} (${KBD_MOD}B)">${chrome.i18n.getMessage('sql_schema_title') || 'Esquema'}</button>
                    <button type="button" class="nsft-sql-edge-tab nsft-sql-edge-tab-ai" id="nsft-sql-edge-ai"
                        title="${escapeHtml(chrome.i18n.getMessage('sqlai_toggle_title') || 'AI')}">${chrome.i18n.getMessage('sql_edge_ai') || 'IA'}</button>
                <aside class="nsft-sql-schema-sidebar" id="nsft-sql-schema-sidebar">
                    <div class="nsft-sql-schema-header">
                        <div class="nsft-sql-schema-header-row">
                            <span class="nsft-sql-schema-title" data-i18n="sql_schema_title">${chrome.i18n.getMessage('sql_schema_title') || 'Schema'}</span>
                            
                            <button type="button" class="nsft-sql-panel-close" id="nsft-sql-schema-close"
                                title="${escapeHtml(chrome.i18n.getMessage('sql_panel_close') || 'Cerrar panel')}"
                                aria-label="${escapeHtml(chrome.i18n.getMessage('sql_panel_close') || 'Cerrar panel')}">${CLOSE_SVG}</button>
                        </div>
                        
                        <div class="nsft-sql-schema-actions">
                            
                            <button type="button" class="nsft-sql-schema-add nsft-sql-schema-iconbtn" id="nsft-sql-schema-add" title="${escapeHtml(chrome.i18n.getMessage('sql_schema_catalog_ph') || 'Buscar tabla en la cuenta…')}" aria-label="${escapeHtml(chrome.i18n.getMessage('sql_schema_catalog_ph') || 'Buscar tabla en la cuenta…')}"><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3.5 5.5h13v9.5"/><path d="M3.5 5.5v10.5h7"/><path d="M3.5 9.2h13M8.6 5.5V16"/><circle cx="16.6" cy="16.6" r="4.1"/><path d="M19.6 19.6 22 22"/></svg></button>
                            
                            <button type="button" class="nsft-sql-schema-add nsft-sql-schema-iconbtn" id="nsft-sql-schema-refresh" title="${escapeHtml(chrome.i18n.getMessage('sql_menu_refresh_schema') || 'Actualizar esquema')}"><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20.5 12a8.5 8.5 0 0 1-14.6 5.9"/><path d="M3.5 12a8.5 8.5 0 0 1 14.6-5.9"/><path d="M18.1 2.6v3.8h-3.8M5.9 21.4v-3.8h3.8"/></svg></button>
                            
                            <button type="button" class="nsft-sql-schema-add nsft-sql-schema-iconbtn nsft-sql-schema-auto" id="nsft-sql-schema-auto" aria-pressed="true"></button>
                            <span class="nsft-sql-schema-actions-sep" aria-hidden="true"></span>
                            
                            <button type="button" class="nsft-sql-schema-add nsft-sql-schema-iconbtn is-danger" id="nsft-sql-schema-wipe" title="${escapeHtml(chrome.i18n.getMessage('sql_schema_wipe_title') || 'Vaciar la caché de esquemas de esta cuenta')}" aria-label="${escapeHtml(chrome.i18n.getMessage('sql_schema_wipe_title') || 'Vaciar la caché de esquemas de esta cuenta')}"><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 6.6h16"/><path d="M9.4 6.6V4.5h5.2v2.1"/><path d="M6.2 6.6l.9 12.2a1.6 1.6 0 0 0 1.6 1.5h6.6a1.6 1.6 0 0 0 1.6-1.5l.9-12.2"/><path d="M10 10.6v6M14 10.6v6" opacity=".6"/></svg></button>
                            <span class="nsft-sql-schema-actions-sep" aria-hidden="true"></span>
                            <button type="button" class="nsft-sql-schema-add nsft-sql-schema-iconbtn" id="nsft-sql-schema-erd" title="${escapeHtml(chrome.i18n.getMessage('sql_erd_title') || 'Diagrama de relaciones (tablas en caché)')}" aria-label="${escapeHtml(chrome.i18n.getMessage('sql_erd_title') || 'Diagrama de relaciones (tablas en caché)')}"><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="8.6" y="2.8" width="6.8" height="5" rx="1.4"/><rect x="2.4" y="16.2" width="6.8" height="5" rx="1.4"/><rect x="14.8" y="16.2" width="6.8" height="5" rx="1.4"/><path d="M12 7.8v3.6M12 11.4H5.8v4.8M12 11.4h6.2v4.8"/></svg></button>
                        </div>
                        
                        <div class="nsft-sql-find nsft-sql-find-schema">
                            <input type="text" class="nsft-sql-schema-filter" id="nsft-sql-schema-filter" placeholder="${chrome.i18n.getMessage('sql_schema_filter_placeholder') || 'Filter fields…'}">
                        </div>
                        <div class="nsft-sql-schema-catalog-pop" id="nsft-sql-schema-catalog-pop" hidden>
                            
                            <div class="nsft-sql-find nsft-sql-find-catalog">
                            <input type="text" class="nsft-sql-schema-catalog-input" id="nsft-sql-schema-catalog-input" autocomplete="off" spellcheck="false" placeholder="${chrome.i18n.getMessage('sql_schema_catalog_ph') || 'Buscar tabla en la cuenta…'}">
                            </div>
                            <div class="nsft-sql-schema-catalog-results" id="nsft-sql-schema-catalog-results"></div>
                            
                            <button type="button" class="nsft-sql-schema-catalog-all" id="nsft-sql-schema-all"></button>
                        </div>
                    </div>
                    <div class="nsft-sql-schema-tree" id="nsft-sql-schema-tree"></div>
                </aside>
                <div class="nsft-sql-schema-resizer" id="nsft-sql-schema-resizer" title="${chrome.i18n.getMessage('sql_schema_resizer_title') || 'Drag to resize'}"></div>
                <div class="nsft-sql-center">
                    
                    <button type="button" class="nsft-sql-edge-tab nsft-sql-edge-tab-results" id="nsft-sql-edge-results"
                        title="${chrome.i18n.getMessage('sql_results_toggle_title') || 'Show/hide results'}">${chrome.i18n.getMessage('sql_tab_results') || 'Resultados'}</button>
                <div class="nsft-sql-main-panel">
                    <div class="nsft-sql-editor-container">
                        
                        <textarea id="nsft-sql-query-input" class="nsft-sql-textarea" spellcheck="false">${escapeHtml(DEFAULT_QUERY)}</textarea>
                    </div>
                </div>
                <div class="nsft-sql-resizer" id="nsft-sql-resizer" title="Drag to resize">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="9" r="1"></circle><circle cx="12" cy="15" r="1"></circle><circle cx="5" cy="9" r="1"></circle><circle cx="5" cy="15" r="1"></circle><circle cx="19" cy="9" r="1"></circle><circle cx="19" cy="15" r="1"></circle></svg>
                </div>
                <div class="nsft-sql-results-panel">
                    
                    <div class="nsft-sql-panel-tabs" role="tablist">
                        <button type="button" class="nsft-sql-panel-tab is-active" data-panel-tab="results"
                            role="tab" aria-selected="true">${chrome.i18n.getMessage('sql_tab_results') || 'Results'}</button>
                        <button type="button" class="nsft-sql-panel-tab" data-panel-tab="logs"
                            role="tab" aria-selected="false">
                            <span>${chrome.i18n.getMessage('sql_tab_logs') || 'Logs'}</span>
                            <span class="nsft-sql-logs-badge" id="nsft-sql-logs-badge" hidden>0</span>
                        </button>
                        <span class="nsft-sql-panel-tabs-spacer"></span>
                        
                        <button type="button" class="nsft-sql-logs-clear" id="nsft-sql-logs-clear"
                            >${chrome.i18n.getMessage('sql_logs_clear') || 'Clear all'}</button>
                        
                        <button type="button" class="nsft-sql-panel-close" id="nsft-sql-results-close"
                            title="${escapeHtml(chrome.i18n.getMessage('sql_panel_close') || 'Cerrar panel')}"
                            aria-label="${escapeHtml(chrome.i18n.getMessage('sql_panel_close') || 'Cerrar panel')}">${CLOSE_SVG}</button>
                    </div>
                    <div class="nsft-sql-results-toolbar">
                        <div class="nsft-sql-results-search-wrap nsft-sql-find">
                            <span class="nsft-sql-search-glyph" aria-hidden="true">${SEARCH_SVG}</span>
                            <input id="nsft-sql-results-search" placeholder="${chrome.i18n.getMessage('sql_search_placeholder') || 'Search results...'}">
                        </div>
                        
                        <button type="button" id="nsft-sql-clear-btn" class="nsft-sql-chart-toggle nsft-sql-clear-btn" disabled
                            title="${escapeHtml(chrome.i18n.getMessage('sql_clear_results_title') || 'Clear the results table')}"
                            aria-label="${escapeHtml(chrome.i18n.getMessage('sql_clear_results_title') || 'Clear the results table')}">
                            <svg class="nsft-sql-btn-ico" viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m7 21-4.3-4.3a2.4 2.4 0 0 1 0-3.4l9.6-9.6a2.4 2.4 0 0 1 3.4 0l5.6 5.6a2.4 2.4 0 0 1 0 3.4L13 21"/><path d="M22 21H7"/><path d="m5 11 9 9"/></svg><span>${chrome.i18n.getMessage('sql_clear_results_btn') || 'Clear results'}</span>
                        </button>
                        <div class="nsft-sql-toolbar-spacer"></div>
                        <span id="nsft-sql-status-text"></span>
                        <button type="button" id="nsft-sql-chart-toggle" class="nsft-sql-chart-toggle" data-mode="table" title="${chrome.i18n.getMessage('sql_chart_btn') || 'Chart'}">
                            <span class="nsft-sql-btn-glyph nsft-sql-chart-glyph">▥</span><span class="nsft-sql-chart-label">${chrome.i18n.getMessage('sql_chart_btn') || 'Chart'}</span>
                        </button>
                        <button type="button" id="nsft-sql-copy-btn" class="nsft-sql-chart-toggle" title="${chrome.i18n.getMessage('sql_copy_results_btn') || 'Copy'} (${KBD_MOD}${KBD_SHIFT}C)">
                            <span class="nsft-sql-btn-glyph">⧉</span><span>${chrome.i18n.getMessage('sql_copy_results_btn') || 'Copy'}</span>
                        </button>
                        <button type="button" id="nsft-sql-export-btn" class="nsft-sql-chart-toggle" title="${chrome.i18n.getMessage('sql_submenu_export') || 'Export'} (${KBD_MOD}${KBD_SHIFT}E)">
                            <span class="nsft-sql-btn-glyph">⇩</span><span>${chrome.i18n.getMessage('sql_submenu_export') || 'Export'}</span>
                        </button>
                        
                        <button type="button" id="nsft-sql-chart-popout" class="nsft-sql-chart-toggle" hidden
                            title="${escapeHtml(chrome.i18n.getMessage('sql_chart_popout_title') || 'Abrir la gráfica en una pestaña')}">
                            <span class="nsft-sql-btn-glyph">⧉</span><span>${escapeHtml(chrome.i18n.getMessage('sql_chart_popout') || 'Abrir en pestaña')}</span>
                        </button>
                    </div>
                    
                    <div id="nsft-sql-run-pill" class="nsft-sql-run-pill" hidden>
                        <span class="nsft-ui-spinner nsft-sql-run-pill-spin" aria-hidden="true"></span>
                        <span id="nsft-sql-run-pill-text"></span>
                    </div>
                    <div id="nsft-sql-trunc-banner" class="nsft-sql-trunc-banner" hidden></div>
                    
                    <div id="nsft-sql-results-error" class="nsft-sql-results-error" hidden>
                        <span>${chrome.i18n.getMessage('sql_results_failed') || 'The last query failed, so there are no results to show.'}</span>
                        <button type="button" id="nsft-sql-results-error-cta"
                            >${chrome.i18n.getMessage('sql_results_failed_cta') || 'See the error'}</button>
                    </div>
                    <div id="nsft-sql-results-table"></div>
                    <div id="nsft-sql-chart-view" class="nsft-sql-chart-view" hidden>
                        <div class="nsft-sql-chart-config">
                            <label>${chrome.i18n.getMessage('sql_chart_type') || 'Type'}
                                <select id="nsft-sql-chart-type">
                                    <option value="bar">${chrome.i18n.getMessage('sql_chart_type_bar') || 'Bars'}</option>
                                    <option value="line">${chrome.i18n.getMessage('sql_chart_type_line') || 'Lines'}</option>
                                    <option value="pie">${chrome.i18n.getMessage('sql_chart_type_pie') || 'Pie'}</option>
                                </select>
                            </label>
                            <label>${chrome.i18n.getMessage('sql_chart_x') || 'X axis (labels)'}
                                <select id="nsft-sql-chart-x"></select>
                            </label>
                            <label>${chrome.i18n.getMessage('sql_chart_y') || 'Y axis (values)'}
                                <select id="nsft-sql-chart-y" multiple size="3"></select>
                            </label>
                            <label>${chrome.i18n.getMessage('sql_chart_agg') || 'Aggregation'}
                                <select id="nsft-sql-chart-agg">
                                    <option value="none">${chrome.i18n.getMessage('sql_chart_agg_none') || 'None'}</option>
                                    <option value="sum">${chrome.i18n.getMessage('sql_chart_agg_sum') || 'Sum'}</option>
                                    <option value="avg">${chrome.i18n.getMessage('sql_chart_agg_avg') || 'Average'}</option>
                                    <option value="count">${chrome.i18n.getMessage('sql_chart_agg_count') || 'Count'}</option>
                                </select>
                            </label>
                        </div>
                        <div id="nsft-sql-chart-msg" class="nsft-sql-chart-msg" hidden></div>
                        <div class="nsft-sql-chart-canvas-wrap"><canvas id="nsft-sql-chart-canvas"></canvas></div>
                    </div>
                    
                    <div id="nsft-sql-logs-view" class="nsft-sql-logs-view" hidden>
                        <div class="nsft-sql-logs-side">
                            
                            <div class="nsft-sql-logs-side-head">
                                <div class="nsft-sql-logs-side-titlerow">
                                    <span class="nsft-sql-logs-side-title">${chrome.i18n.getMessage('sql_logs_side_title') || 'History'}</span>
                                    <div class="nsft-sql-logs-chips" id="nsft-sql-logs-chips">
                                        <button type="button" class="nsft-sql-logs-chip is-active" data-log-filter="all">${chrome.i18n.getMessage('sql_logs_chip_all') || 'All'}</button>
                                        <button type="button" class="nsft-sql-logs-chip" data-log-filter="error">${chrome.i18n.getMessage('sql_logs_chip_errors') || 'Errors'} <b></b></button>
                                        <button type="button" class="nsft-sql-logs-chip" data-log-filter="ok">${chrome.i18n.getMessage('sql_logs_chip_ok') || 'Successful'} <b></b></button>
                                    </div>
                                    <span class="nsft-sql-logs-count" id="nsft-sql-logs-count"></span>
                                </div>
                                <div class="nsft-sql-logs-filter-wrap nsft-sql-find">
                                    <span class="nsft-sql-search-glyph" aria-hidden="true">${SEARCH_SVG}</span>
                                    <input id="nsft-sql-logs-filter" class="nsft-sql-logs-filter"
                                        placeholder="${chrome.i18n.getMessage('sql_logs_filter_ph') || 'Filter by table, text or error code'}">
                                </div>
                            </div>
                            <div class="nsft-sql-logs-list" id="nsft-sql-logs-list" role="list"></div>
                        </div>
                        <div class="nsft-sql-logs-resizer" id="nsft-sql-logs-resizer"
                            role="separator" aria-orientation="vertical" tabindex="0"
                            title="${chrome.i18n.getMessage('sql_logs_resize') || 'Drag to resize'}"></div>
                        <div class="nsft-sql-logs-detail" id="nsft-sql-logs-detail"></div>
                    </div>
                </div>
                </div>
                </div>
            <div class="suiteql-runner-footer">
                <span class="nsft-sql-footer-left">
                    <span id="nsft-sql-conn-status" class="nsft-sql-footer-status">● ${chrome.i18n.getMessage('sql_footer_connected') || 'Connected'}</span>
                    
                    <span id="nsft-sql-gov" class="nsft-sql-gov" hidden>
                        <span class="nsft-sql-gov-label">${chrome.i18n.getMessage('sql_gov_label') || 'Governance'}</span>
                        <span class="nsft-sql-gov-bar"><span class="nsft-sql-gov-fill"></span></span>
                        <span class="nsft-sql-gov-num"></span>
                    </span>
                </span>
                <div id="nsft-sql-editor-stats" class="nsft-sql-footer-stats">
                    <span class="nsft-sql-stat-item">Ln 1, Col 1</span>
                    <span class="nsft-sql-stat-item">Ch 0</span>
                </div>
            </div>
        </div>`;

})();
