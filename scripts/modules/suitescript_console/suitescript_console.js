(function () {
    'use strict';
    const STORAGE_KEY = 'enableSuiteScriptConsole';
    const NSFT_THEME_KEY = 'nsftTheme';
    const SHORTCUT_KEY = 'suitescriptConsoleShortcut';
    const DEFAULT_SHORTCUT = { ctrlKey: false, shiftKey: true, altKey: true, code: 'KeyJ' };
    const TABS_STORAGE_KEY = 'nsftSscTabs';
    const HISTORY_STORAGE_KEY = 'nsftSscHistory';
    const SAVED_QUERIES_KEY = 'nsftSscSaved';
    const SNIPPETS_STORAGE_KEY = 'nsftSscSnippets';
    let HISTORY_MAX = 30;
    const DEFAULT_QUERY = [
        '// ' + (chrome.i18n.getMessage('ssc_tpl_1')
            || 'The N/* modules are ready: record, search, query, runtime…'),
        '',
        '({',
        '  hello: \'world\',',
        '  account: runtime.accountId,',
        '  env: runtime.envType,',
        '  user: runtime.getCurrentUser().name,',
        '  role: runtime.getCurrentUser().role',
        '})'
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
    let cachedViewState = 'both';

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
            title: (chrome.i18n.getMessage('ssc_tab_default_title') || 'Query') + ' ' + (i || (tabs.length + 1)),
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
            title: (opts && opts.title) || ((chrome.i18n.getMessage('ssc_tab_default_title') || 'Query') + ' ' + (tabs.length + 1)),
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
        const dot = t.dirty ? '<span class="nsft-ssc-tab-dirty" title="Unsaved">●</span>' : '';
        const label = escapeHtml(t.title);
        let starHtml = '';
        if (t.fileName && savedMap[t.fileName]) {
            const isFav = savedMap[t.fileName].favorite === true;
            const starTitle = isFav
                ? (chrome.i18n.getMessage('sql_fav_unstar') || 'Remove from favorites')
                : (chrome.i18n.getMessage('sql_fav_star') || 'Mark as favorite');
            starHtml = `<span class="nsft-ssc-tab-fav${isFav ? ' is-on' : ''}" data-tab-fav="${t.id}" title="${escapeHtml(starTitle)}">${isFav ? '★' : '☆'}</span>`;
        }
        const closeTitle = escapeHtml(chrome.i18n.getMessage('sql_tab_close') || 'Close');
        return `${dot}${starHtml}<span class="nsft-ssc-tab-label">${label}</span>`
            + `<span class="nsft-ssc-tab-close" data-tab-close="${t.id}" title="${closeTitle}">×</span>`;
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
        const el = document.querySelector('.nsft-ssc-tab[data-tab-id="' + (window.CSS && CSS.escape ? CSS.escape(id) : id) + '"]');
        if (!tab || !el) return;
        const labelEl = el.querySelector('.nsft-ssc-tab-label');
        if (!labelEl) return;

        _renamingTabId = id;
        const previo = tab.title;

        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'nsft-ssc-tab-rename';
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
                    logToToolbar(chrome.i18n.getMessage('ssc_tab_rename_taken', [nuevo])
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
            body: chrome.i18n.getMessage('ssc_tab_close_bulk_body', [String(victimas.length)])
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
        ctx.className = 'nsft-ssc-ctx';
        ctx.id = 'nsft-ssc-tab-ctx';
        ctx.style.left = evt.clientX + 'px';
        ctx.style.top = evt.clientY + 'px';

        const mkItem = (label, handler, opts) => {
            const o = opts || {};
            const item = document.createElement('div');
            item.className = 'nsft-ssc-ctx-item'
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
            s.className = 'nsft-ssc-ctx-sep';
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
        const el = document.getElementById('nsft-ssc-tab-ctx');
        if (el) el.remove();
    }

    let _dragTabId = null;
    let _dragMoved = false;
    let _dragStartX = 0;
    let _dragGrabOffset = 0;

    const TAB_DRAG_THRESHOLD = 4;

    function syncTabsOrderFromDom(bar) {
        const pos = new Map();
        bar.querySelectorAll('.nsft-ssc-tab').forEach((el, i) => {
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
        if (e.target.closest('#nsft-ssc-tab-add')) return;
        const tabEl = e.target.closest('.nsft-ssc-tab');
        if (!tabEl) return;

        _dragTabId = tabEl.getAttribute('data-tab-id');
        _dragMoved = false;
        _dragStartX = e.clientX;
        _dragGrabOffset = e.clientX - tabEl.getBoundingClientRect().left;
    }

    function onTabPointerMove(e) {
        if (!_dragTabId) return;
        const bar = e.currentTarget;
        const dragEl = bar.querySelector('.nsft-ssc-tab[data-tab-id="' + (window.CSS && CSS.escape ? CSS.escape(_dragTabId) : _dragTabId) + '"]');
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

        const otras = Array.from(bar.querySelectorAll('.nsft-ssc-tab')).filter(el => el !== dragEl);
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
        const dragEl = bar.querySelector('.nsft-ssc-tab.is-dragging');
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
        const bar = document.getElementById('nsft-ssc-tabs-bar');
        const prev = document.getElementById('nsft-ssc-tabs-prev');
        const next = document.getElementById('nsft-ssc-tabs-next');
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
        const bar = document.getElementById('nsft-ssc-tabs-bar');
        if (!bar) return;
        const paso = Math.max(120, Math.round(bar.clientWidth * 0.5));
        bar.scrollBy({ left: dir * paso, behavior: 'smooth' });
    }

    let _lastScrolledTabId = null;
    function scrollActiveTabIntoView() {
        if (activeTabId === _lastScrolledTabId) return;
        _lastScrolledTabId = activeTabId;
        const bar = document.getElementById('nsft-ssc-tabs-bar');
        if (!bar || bar.scrollWidth <= bar.clientWidth + 1) return;
        const el = bar.querySelector('.nsft-ssc-tab.active');
        if (el && el.scrollIntoView) {
            el.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
        }
    }

    function renderTabsBar() {
        const bar = document.getElementById('nsft-ssc-tabs-bar');
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
                if (e.target.closest('#nsft-ssc-tab-add')) { createTab(); return; }
                const tabEl = e.target.closest('.nsft-ssc-tab');
                if (tabEl) {
                    const id = tabEl.getAttribute('data-tab-id');
                    if (id && id !== activeTabId) activateTab(id);
                }
            });

            bar.addEventListener('dblclick', (e) => {
                if (e.target.closest('[data-tab-close]') || e.target.closest('[data-tab-fav]')) return;
                const tabEl = e.target.closest('.nsft-ssc-tab');
                if (!tabEl) return;
                e.preventDefault();
                startTabRename(tabEl.getAttribute('data-tab-id'));
            });

            bar.addEventListener('contextmenu', (e) => {
                const tabEl = e.target.closest('.nsft-ssc-tab');
                if (!tabEl) return;
                e.preventDefault();
                showTabContextMenu(e, tabEl.getAttribute('data-tab-id'));
            });

            bar.addEventListener('pointerdown', onTabPointerDown);
            bar.addEventListener('pointermove', onTabPointerMove);
            bar.addEventListener('pointerup', onTabPointerUp);
            bar.addEventListener('pointercancel', onTabPointerUp);

            bar.addEventListener('scroll', syncTabsNav, { passive: true });
            const prevBtn = document.getElementById('nsft-ssc-tabs-prev');
            const nextBtn = document.getElementById('nsft-ssc-tabs-next');
            if (prevBtn) prevBtn.addEventListener('click', (e) => { e.stopPropagation(); scrollTabsBy(-1); });
            if (nextBtn) nextBtn.addEventListener('click', (e) => { e.stopPropagation(); scrollTabsBy(1); });
            if (typeof ResizeObserver !== 'undefined') {
                try { new ResizeObserver(syncTabsNav).observe(bar); } catch (err) { }
            }
        }

        let addBtnEl = bar.querySelector('#nsft-ssc-tab-add');
        if (!addBtnEl) {
            addBtnEl = document.createElement('button');
            addBtnEl.className = 'nsft-ssc-tab-add';
            addBtnEl.id = 'nsft-ssc-tab-add';
            addBtnEl.textContent = '+';
            addBtnEl.title = chrome.i18n.getMessage('ssc_tab_new') || 'New query tab';
            bar.appendChild(addBtnEl);
        }

        const existing = {};
        bar.querySelectorAll('.nsft-ssc-tab').forEach(el => { existing[el.getAttribute('data-tab-id')] = el; });

        const present = {};
        tabs.forEach(t => {
            present[t.id] = true;
            let el = existing[t.id];
            const key = _tabRenderKey(t, savedMap);
            const renaming = t.id === _renamingTabId;
            if (!el) {
                el = document.createElement('div');
                el.className = 'nsft-ssc-tab';
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


    const SEARCH_SVG = '<svg class="nsft-ssc-search-ico" viewBox="0 0 24 24" fill="none" '
        + 'stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true">'
        + '<circle cx="10.5" cy="10.5" r="6.8"></circle><path d="m20.5 20.5-5.2-5.2"></path></svg>';

    function wireFindClear(inputId) {
        const input = document.getElementById(inputId);
        const wrap = input && input.closest('.nsft-ssc-find');
        if (!input || !wrap || wrap.dataset.nsftFindWired) return;
        wrap.dataset.nsftFindWired = '1';

        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'nsft-ssc-find-clear';
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

    function markMatches(text, termLc) {
        const s = (text === null || text === undefined) ? '' : String(text);
        if (!termLc || !s) return escapeHtml(s);
        const TS = window.NSFT_TextSearch;
        if (TS) return TS.markHtml(s, termLc, 'nsft-ssc-hl');

        const low = s.toLowerCase();
        let i = low.indexOf(termLc);
        if (i === -1) return escapeHtml(s);
        let out = '', from = 0;
        while (i !== -1) {
            out += escapeHtml(s.slice(from, i)) +
                '<mark class="nsft-ssc-hl">' + escapeHtml(s.slice(i, i + termLc.length)) + '</mark>';
            from = i + termLc.length;
            i = low.indexOf(termLc, from);
        }
        return out + escapeHtml(s.slice(from));
    }

    function _nsftResolveTheme() {
        return _nsftTheme === 'dark' ? 'dark' : 'light';
    }
    function _nsftApplyThemeToModal() {
        const theme = _nsftResolveTheme();
        const m = document.getElementById('nsft-ssc-modal');
        if (m) m.setAttribute('data-theme', theme);
        if (document.body) document.body.setAttribute('data-nsft-ssc-theme', theme);
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
        chrome.storage.local.get({ suitescriptConsoleThemeOverridden: false }, (items) => {
            if (items.suitescriptConsoleThemeOverridden) return;
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
        suitescriptConsoleTheme: 'atom-one-light',
        suitescriptConsoleThemeOverridden: false,
        suitescriptConsoleHistoryMax: 30,
        nsft_ssc_view_state: 'both',
        [SHORTCUT_KEY]: null
    }, (items) => {
        if (!items[STORAGE_KEY]) return;

        let _arranco = false;
        const arranca = () => {
            if (_arranco) return;
            _arranco = true;
            bindRunnerShortcut();
            cachedViewState = items.nsft_ssc_view_state || 'both';
            init(items);
        };

        if (!isRunnerExcludedPage()) { arranca(); return; }
        window.addEventListener('nsft-adv-ready', () => {
            if (!isRunnerExcludedPage()) arranca();
        });
    });

    function bindRunnerShortcut() {
        if (!window.NSFT_Shortcuts || !window.NSFT_Shortcuts.bind) return;
        window.NSFT_Shortcuts.bind('suitescript_console', {
            label: chrome.i18n.getMessage('cheatsheet_item_open_ssc') || 'Open SuiteScript Console',
            defaultCombo: DEFAULT_SHORTCUT,
            storageKey: SHORTCUT_KEY,
            event: 'nsft-show-suitescript-console',
            group: chrome.i18n.getMessage('cheatsheet_group_global') || 'Global',
            order: 30
        });
    }

    function init(items) {
        HISTORY_MAX = _clampInt(items.suitescriptConsoleHistoryMax, 1, 1000, 30);
        if (items.suitescriptConsoleThemeOverridden) {
            currentTheme = items.suitescriptConsoleTheme || 'atom-one-light';
        } else {
            currentTheme = _nsftResolveTheme() === 'dark' ? 'atom-one-dark' : 'atom-one-light';
        }
        setupListeners();
    }

    chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== 'local') return;
        if (changes.suitescriptConsoleHistoryMax) {
            HISTORY_MAX = _clampInt(changes.suitescriptConsoleHistoryMax.newValue, 1, 1000, 30);
        }
        if (changes.suitescriptConsoleTheme) {
            updateTheme(changes.suitescriptConsoleTheme.newValue || 'atom-one-light');
        }
        if (changes.nsft_ssc_view_state) {
            cachedViewState = changes.nsft_ssc_view_state.newValue || 'both';
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

        window.addEventListener('nsft-show-suitescript-console', function (e) {
            const pf = e && e.detail && e.detail.prefillRecord;
            let code = e && e.detail && e.detail.prefillCode;
            let titulo = e && e.detail && e.detail.prefillTitle;
            if (pf && pf.type && pf.id) {
                const tipo = String(pf.type).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
                const idNum = /^\d+$/.test(String(pf.id)) ? String(pf.id) : JSON.stringify(String(pf.id));
                code = [
                    '// ' + (chrome.i18n.getMessage('ssc_load_tpl_2') || 'Loaded again from the server, whole'),
                    'const r = record.load({',
                    "    type: '" + tipo + "',",
                    '    id: ' + idNum,
                    '});',
                    '',
                    'r'
                ].join('\n');
                titulo = pf.type + ' ' + pf.id;
            }
            const applyPrefill = () => {
                if (!code || !editor) return;
                createTab({ title: titulo || undefined, query: String(code) });
                editor.focus();
            };

            if (window.NSFT_ShortcutCoach) window.NSFT_ShortcutCoach.hint('suitescript_console');

            const modal = document.getElementById('nsft-ssc-modal');
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
            const modal = document.getElementById('nsft-ssc-modal');
            if (modal && modal.dataset.state === 'minimised') {
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
    let _runPhase = 'idle';
    let _runWatchdog = null;
    const RUN_WATCHDOG_MS = 180000;

    let _logsSeeded = false;
    let _logFilter = 'all';
    let _logQuery = '';
    let _pendingFix = null;
    let _fixSeq = 0;
    let _lastRevealedLogId = null;
    let _aiAvailWired = false;

    const AI_SPARK_SVG = '<svg class="nsft-ssc-ai-ico" viewBox="0 0 16 16" fill="none" stroke="currentColor" '
        + 'stroke-width="1.4" stroke-linejoin="round" aria-hidden="true">'
        + '<path d="M6.2 2 7.3 5 10.3 6.1 7.3 7.2 6.2 10.2 5.1 7.2 2.1 6.1 5.1 5z"></path>'
        + '<path d="M11.6 9.4l.6 1.6 1.6.6-1.6.6-.6 1.6-.6-1.6-1.6-.6 1.6-.6z"></path></svg>';

    const ARROW_SVG = '<svg class="nsft-ssc-act-ico" viewBox="0 0 16 16" fill="none" stroke="currentColor" '
        + 'stroke-width="1.6" stroke-linecap="round" aria-hidden="true">'
        + '<path d="M2.5 8h11M9.5 4l4 4-4 4"></path></svg>';

    const TRASH_SVG = '<svg class="nsft-ssc-act-ico" viewBox="0 0 16 16" fill="none" stroke="currentColor" '
        + 'stroke-width="1.4" aria-hidden="true">'
        + '<path d="M3 5h10M6.5 5V3.5h3V5M4.5 5l.6 8h5.8l.6-8"></path></svg>';

    const RERUN_SVG = '<svg class="nsft-ssc-act-ico" viewBox="0 0 16 16" fill="none" stroke="currentColor" '
        + 'stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
        + '<path d="M13.2 8a5.2 5.2 0 1 1-1.5-3.7"></path>'
        + '<path d="M13.4 2.4V5.2H10.6"></path></svg>';

    const CLOSE_SVG = '<svg class="nsft-ssc-close-ico" viewBox="0 0 16 16" fill="none" stroke="currentColor" '
        + 'stroke-width="1.5" stroke-linecap="round" aria-hidden="true">'
        + '<path d="M4.5 4.5l7 7M11.5 4.5l-7 7"></path></svg>';

    const HINT_SVG = '<svg class="nsft-ssc-hint-ico" viewBox="0 0 16 16" fill="none" stroke="currentColor" '
        + 'stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
        + '<path d="M8 1.8a4 4 0 0 0-2.4 7.2c.4.3.6.8.6 1.3h3.6c0-.5.2-1 .6-1.3A4 4 0 0 0 8 1.8z"></path>'
        + '<path d="M6.2 12.4h3.6M6.9 14.2h2.2"></path></svg>';

    const COPY_SVG = '<svg class="nsft-ssc-act-ico" viewBox="0 0 16 16" fill="none" stroke="currentColor" '
        + 'stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
        + '<rect x="5.6" y="5.6" width="7.8" height="7.8" rx="1.5"></rect>'
        + '<path d="M10.4 5.6V4.1A1.5 1.5 0 0 0 8.9 2.6H4.1A1.5 1.5 0 0 0 2.6 4.1v4.8a1.5 1.5 0 0 0 1.5 1.5h1.5"></path></svg>';

    function setRunState(state, info) {
        const el = document.getElementById('nsft-ssc-status-text');
        const panel = document.querySelector('.nsft-ssc-results-panel');
        if (panel) panel.setAttribute('data-run-state', state);

        const modal = document.getElementById('nsft-ssc-modal');
        if (modal) modal.setAttribute('data-run-state', state);

        const pill = document.getElementById('nsft-ssc-run-pill');
        if (pill) pill.hidden = state !== 'running';

        paintRunButton(state === 'running');
        paintClearResultsBtn(state === 'running');


        clearInterval(_runTimer);
        _runTimer = null;
        clearTimeout(_runWatchdog);
        _runWatchdog = null;
        if (state !== 'running') _runPhase = 'idle';

        if (state === 'running') armRunWatchdog();

        if (!el) return;

        if (state === 'running') {
            _runStartedAt = Date.now();
            _runPhase = 'running';
            el.textContent = '';
            paintRunStatus();
            _runTimer = setInterval(paintRunStatus, 1000);
        } else if (state === 'ok' && info) {
            paintStatus('<span class="nsft-ssc-status-glyph is-ok" aria-hidden="true">✓</span>',
                chrome.i18n.getMessage('ssc_status_ok', [String(info.ms)])
                || `Done · ${info.ms} ms`);
        } else if (state === 'error') {
            paintStatus('<span class="nsft-ssc-status-glyph is-error" aria-hidden="true">✕</span>',
                chrome.i18n.getMessage('sql_status_error') || 'Error');
        } else {
            el.textContent = '';
        }
    }

    function paintRunButton(busy) {
        const btn = document.getElementById('nsft-ssc-tool-run');
        if (!btn) return;
        if (!btn.dataset.runTitle) btn.dataset.runTitle = btn.title || '';

        btn.classList.toggle('is-busy', busy);
        btn.disabled = busy;
        btn.setAttribute('aria-busy', busy ? 'true' : 'false');

        const glyph = btn.querySelector('.nsft-ssc-run-glyph');
        if (glyph) glyph.textContent = busy ? '' : '▶';

        const label = btn.querySelector('.nsft-ssc-run-label');
        if (label) {
            label.textContent = busy
                ? (chrome.i18n.getMessage('ssc_running_btn') || 'Running…')
                : (chrome.i18n.getMessage('sql_submenu_run') || 'Run');
        }

        const kbd = btn.querySelector('.nsft-ssc-kbd');
        if (kbd) kbd.hidden = busy;

        btn.title = busy
            ? (chrome.i18n.getMessage('ssc_running') || 'Running…')
            : btn.dataset.runTitle;
    }

    function paintStatus(glyphHtml, text, extraHtml) {
        const el = document.getElementById('nsft-ssc-status-text');
        if (el) el.innerHTML = glyphHtml + '<span>' + escapeHtml(text) + '</span>' + (extraHtml || '');
    }

    function paintRunStatus() {
        const secs = Math.floor((Date.now() - _runStartedAt) / 1000);
        const tail = secs >= 1 ? ' · ' + secs + ' s' : '';
        const text = chrome.i18n.getMessage('sql_status_running') || 'Executing…';
        const chip = document.getElementById('nsft-ssc-run-pill-text');
        if (chip) chip.textContent = (text + tail).replace('…', '');
    }

    function armRunWatchdog() {
        clearTimeout(_runWatchdog);
        _runWatchdog = setTimeout(() => {
            if (_runPhase === 'idle') return;
            logToToolbar(chrome.i18n.getMessage('ssc_run_timeout')
                || 'La consulta no ha respondido; puedes volver a intentarlo.', 'warning');
            setRunState('idle');
        }, RUN_WATCHDOG_MS);
    }



    const SSC_SERVER_ONLY = [
        'file', 'task', 'workflow', 'render', 'sftp', 'cache', 'crypto',
        'encode', 'compress', 'auth', 'config', 'plugin', 'portlet',
        'redirect', 'keyControl', 'certificateControl', 'piremoval', 'llm'
    ];
    const SSC_ERROR_KINDS = [
        {
            id: 'servermodule',
            test: new RegExp('\\b(' + SSC_SERVER_ONLY.join('|') + ')\\b is not defined'),
            title: 'ssc_err_server_title', hint: 'ssc_err_server_hint', token: true
        },

        {
            id: 'governance',
            test: /SSS_USAGE_LIMIT_EXCEEDED|usage limit exceeded|governance/i,
            title: 'ssc_err_governance_title', hint: 'ssc_err_governance_hint'
        },
        {
            id: 'permission',
            test: /INSUFFICIENT_PERMISSION|insufficient permission|permission denied|not authorized|SSS_INSUFFICIENT/i,
            title: 'ssc_err_permission_title', hint: 'ssc_err_permission_hint'
        },

        {
            id: 'missingarg',
            test: /SSS_MISSING_REQD_ARGUMENT/i,
            title: 'ssc_err_missingarg_title', hint: 'ssc_err_missingarg_hint', token: true
        },
        {
            id: 'invalidrectype',
            test: /SSS_INVALID_RECORD_TYPE|INVALID_RCRD_TYPE|invalid record type/i,
            title: 'ssc_err_rectype_title', hint: 'ssc_err_rectype_hint', token: true
        },
        {
            id: 'norecord',
            test: /RCRD_DSNT_EXIST|That record does not exist/i,
            title: 'ssc_err_norecord_title', hint: 'ssc_err_norecord_hint'
        },
        {
            id: 'searcharg',
            test: /SSS_INVALID_SRCH_|SSS_INVALID_SEARCH/i,
            title: 'ssc_err_search_title', hint: 'ssc_err_search_hint', token: true
        },
        {
            id: 'fieldvalue',
            test: /INVALID_FLD_VALUE|SSS_INVALID_API_USAGE|You have entered an Invalid Field Value/i,
            title: 'ssc_err_fieldvalue_title', hint: 'ssc_err_fieldvalue_hint', token: true
        },
        {
            id: 'sqlquery',
            test: /SSS_SEARCH_ERROR_OCCURRED|Failed to parse SQL|invalid search query/i,
            title: 'ssc_err_sql_title', hint: 'ssc_err_sql_hint'
        },

        {
            id: 'notafunction',
            test: /TypeError:.*is not a function/i,
            title: 'ssc_err_notafunction_title', hint: 'ssc_err_notafunction_hint', token: true
        },
        {
            id: 'refundef',
            test: /ReferenceError|is not defined/i,
            title: 'ssc_err_ref_title', hint: 'ssc_err_ref_hint', token: true
        },
        {
            id: 'typeerr',
            test: /TypeError/i,
            title: 'ssc_err_type_title', hint: 'ssc_err_type_hint'
        },
        {
            id: 'syntax',
            test: /SyntaxError/i,
            title: 'ssc_err_syntax_title', hint: 'ssc_err_syntax_hint'
        },

        {
            id: 'unexpected',
            test: /UNEXPECTED_ERROR|unexpected error occurred|error inesperado/i,
            title: 'ssc_err_unexpected_title', hint: 'ssc_err_unexpected_hint'
        }
    ];

    function describeScriptError(raw) {
        const text = String(raw || '');
        const out = {
            raw: text,
            title: chrome.i18n.getMessage('ssc_err_generic_title') || 'The script failed',
            explain: '',
            code: '',
            line: null,
            column: null,
            hint: '',
            kind: 'unknown'
        };

        const errName = text.match(/\b(SSS_[A-Z_]+|INVALID_[A-Z_]+|RCRD_[A-Z_]+|UNEXPECTED_ERROR|USER_ERROR|TypeError|ReferenceError|SyntaxError|RangeError)\b/);
        if (errName) out.name = errName[1];

        const hit = SSC_ERROR_KINDS.find((k) => k.test.test(text));
        if (hit) {
            out.kind = hit.id;
            out.title = chrome.i18n.getMessage(hit.title) || out.title;
            if (hit.token) {
                const q = text.match(/["'`]([A-Za-z0-9_.]+)["'`]/)
                    || text.match(/\b([A-Za-z_$][\w$.]*) is not (?:defined|a function)/)
                    || text.match(/argument\s*:\s*([A-Za-z_][\w]*)/i);
                out.badToken = q ? q[1] : '';
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
        s = s.replace(/^(TypeError|ReferenceError|SyntaxError|RangeError|Error)\s*:\s*/, '');
        s = s.trim();
        return s.replace(/\s{2,}/g, ' ');
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
        if (tab === _activePanelTab && document.querySelector('.nsft-ssc-results-panel[data-panel-tab]')) return;
        _activePanelTab = tab;
        const isLogs = tab === 'logs';

        document.querySelectorAll('.nsft-ssc-panel-tab').forEach((btn) => {
            const on = btn.getAttribute('data-panel-tab') === tab;
            btn.classList.toggle('is-active', on);
            btn.setAttribute('aria-selected', on ? 'true' : 'false');
        });

        const logsView = document.getElementById('nsft-ssc-logs-view');
        const output = document.getElementById('nsft-ssc-output');
        const panelEl = document.querySelector('.nsft-ssc-results-panel');

        if (panelEl) panelEl.setAttribute('data-panel-tab', tab);

        if (logsView) logsView.hidden = !isLogs;
        if (output) output.hidden = isLogs;

        if (isLogs) {
            _unseenErrors = 0;
            renderLogsBadge();
            renderLogDetail();
        }
    }

    function renderLogsBadge() {
        const badge = document.getElementById('nsft-ssc-logs-badge');
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
        const info = e.status === 'error' ? describeScriptError(e.errorMsg) : null;
        return [e.query, e.errorMsg, info && info.code, info && info.title]
            .filter(Boolean).some((s) => tsFold(s).includes(q));
    }

    function renderLogsList() {
        const list = document.getElementById('nsft-ssc-logs-list');
        if (!list) return;

        const visible = _sqlLogs.filter(logMatchesFilter);

        const nErr = _sqlLogs.filter((e) => e.status === 'error').length;
        const nOk = _sqlLogs.filter((e) => e.status === 'ok').length;
        const countEl = document.getElementById('nsft-ssc-logs-count');
        if (countEl) {
            countEl.textContent = visible.length === _sqlLogs.length
                ? String(_sqlLogs.length)
                : (chrome.i18n.getMessage('sql_logs_count_of', [String(visible.length), String(_sqlLogs.length)])
                    || `${visible.length} of ${_sqlLogs.length}`);
        }
        document.querySelectorAll('.nsft-ssc-logs-chip').forEach((chip) => {
            const f = chip.getAttribute('data-log-filter');
            chip.classList.toggle('is-active', f === _logFilter);
            const b = chip.querySelector('b');
            if (b) b.textContent = f === 'error' ? String(nErr) : (f === 'ok' ? String(nOk) : '');
        });

        if (!visible.length) {
            list.innerHTML = `<div class="nsft-ssc-logs-empty">${escapeHtml(
                _sqlLogs.length
                    ? (chrome.i18n.getMessage('sql_logs_no_match') || 'Nothing matches that filter.')
                    : (chrome.i18n.getMessage('sql_logs_empty') || 'No activity yet.'))}</div>`;
            return;
        }

        let lastGroup = '';
        list.innerHTML = visible.map((e) => {
            const group = dayGroupLabel(e.at);
            const head = group && group !== lastGroup
                ? `<div class="nsft-ssc-logs-group">${escapeHtml(group)}</div>` : '';
            lastGroup = group || lastGroup;

            const g = logGlyph(e);

            const qLog = tsFold((_logQuery || '').trim());
            const top = oneLine(e.query);
            let bottom;
            if (e.status === 'error') {
                const info = describeScriptError(e.errorMsg);
                bottom = `<span class="nsft-ssc-log-what">${markMatches(info.title, qLog)}</span>` +
                    (info.code ? `<span class="nsft-ssc-log-code">${markMatches(info.code, qLog)}</span>` : '');
            } else {
                bottom = `<span class="nsft-ssc-log-what">${escapeHtml(
                    chrome.i18n.getMessage('ssc_status_ok', [String(e.durationMs)])
                    || `Done · ${e.durationMs} ms`)}</span>`;
            }

            return head + `<div class="nsft-ssc-log-row${e.id === _selectedLogId ? ' is-selected' : ''}"
                        data-log-id="${e.id}" role="listitem" tabindex="0">
                        <span class="nsft-ssc-log-glyph is-${g.cls}">${g.ch}</span>
                        <span class="nsft-ssc-log-body">
                            <span class="nsft-ssc-log-label is-sql">${markMatches(top, qLog)}</span>
                            ${bottom ? `<span class="nsft-ssc-log-sub">${bottom}</span>` : ''}
                        </span>
                        <span class="nsft-ssc-log-time">${escapeHtml(logTimeLabel(e.at))}</span>
                    </div>`;
        }).join('');

        list.querySelectorAll('.nsft-ssc-log-row').forEach((row) => {
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
        const list = document.getElementById('nsft-ssc-logs-list');
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
        const box = document.getElementById('nsft-ssc-logs-detail');
        if (!box) return;

        const changed = _selectedLogId !== _lastDetailId;
        _lastDetailId = _selectedLogId;

        const entry = _sqlLogs.find((e) => e.id === _selectedLogId);
        if (!entry) {
            box.innerHTML = `<div class="nsft-ssc-logs-empty">${escapeHtml(
                chrome.i18n.getMessage('sql_logs_pick') || 'Pick an entry to see the detail.')}</div>`;
            box.scrollTop = 0;
            return;
        }

        const isError = entry.status === 'error';
        const info = isError ? describeScriptError(entry.errorMsg) : null;

        const title = isError
            ? info.title
            : (chrome.i18n.getMessage('ssc_logs_ok') || 'Script executed');

        const subtitle = isError
            ? (info.explain || '')
            : (chrome.i18n.getMessage('ssc_status_ok', [String(entry.durationMs)])
                || `Done · ${entry.durationMs} ms`);

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
            <div class="nsft-ssc-logs-dhead">
                <div class="nsft-ssc-logs-dtop">
                    <div class="nsft-ssc-logs-dident">
                        <span class="nsft-ssc-logs-dicon is-${g.cls}">${g.ch}</span>
                        <div class="nsft-ssc-logs-dtitles">
                            
                            <div class="nsft-ssc-logs-dtitle">${escapeHtml(title)}</div>
                            
                            ${subtitle ? `<div class="nsft-ssc-logs-dsub" id="nsft-ssc-logs-dsub">${escapeHtml(subtitle)}</div>
                            <button type="button" class="nsft-ssc-logs-dsub-more" id="nsft-ssc-logs-dsub-more" hidden
                                title="${escapeHtml(chrome.i18n.getMessage('sql_logs_sub_more') || 'Ver mensaje completo')}"
                                aria-expanded="false">…</button>` : ''}
                        </div>
                    </div>
                    <div class="nsft-ssc-logs-dmeta">
                        <div class="nsft-ssc-logs-dtimes">
                            <div class="nsft-ssc-logs-dtime">${escapeHtml(logTimeLabel(entry.at, true))}</div>
                            <div class="nsft-ssc-logs-drel">${escapeHtml(metaTail)}</div>
                        </div>
                        <button type="button" class="nsft-ssc-logs-icon-btn" data-log-act="delete"
                            title="${escapeHtml(chrome.i18n.getMessage('sql_logs_delete') || 'Delete')}"
                            aria-label="${escapeHtml(chrome.i18n.getMessage('sql_logs_delete') || 'Delete')}">${TRASH_SVG}</button>
                    </div>
                </div>
                
                <div class="nsft-ssc-logs-actions">
                    ${entry.query ? `<button type="button" class="is-primary" data-log-act="to-editor">${ARROW_SVG}${escapeHtml(chrome.i18n.getMessage('sql_logs_to_editor') || 'Load in editor')}</button>` : ''}
                    ${isError && entry.query && aiAvailable() ? `<button type="button" class="is-ai" data-log-act="ai-fix">${AI_SPARK_SVG}${escapeHtml(chrome.i18n.getMessage('sql_logs_ai_fix') || 'Fix with AI')}</button>` : ''}
                    ${entry.query ? `<button type="button" data-log-act="rerun">${RERUN_SVG}${escapeHtml(chrome.i18n.getMessage('sql_logs_rerun') || 'Run again')}</button>` : ''}
                    ${entry.query || body ? `<span class="nsft-ssc-logs-actsep" aria-hidden="true"></span>` : ''}
                    ${entry.query ? `<button type="button" data-log-act="copy-sql">${COPY_SVG}${escapeHtml(chrome.i18n.getMessage('ssc_logs_copy_code') || 'Copy script')}</button>` : ''}
                    ${body ? `<button type="button" data-log-act="copy-msg">${COPY_SVG}${escapeHtml(chrome.i18n.getMessage('sql_logs_copy_error') || 'Copy error')}</button>` : ''}
                </div>
            </div>

            <div class="nsft-ssc-logs-dbody">
                
                ${hint ? `<details class="nsft-ssc-logs-hint">
                    <summary>${HINT_SVG}<span>${escapeHtml(chrome.i18n.getMessage('sql_logs_hint_summary') || 'Posible causa del error')}</span></summary>
                    <div class="nsft-ssc-logs-hint-body">${escapeHtml(hint)}</div>
                </details>` : ''}

                
                <div id="nsft-ssc-fix-slot"></div>

                ${entry.query ? `
                <div class="nsft-ssc-logs-block">
                    <div class="nsft-ssc-logs-section">
                        <span>${escapeHtml(chrome.i18n.getMessage('ssc_logs_code_sent') || 'Script sent')}</span>
                        <span class="nsft-ssc-logs-lines">${escapeHtml(
                            chrome.i18n.getMessage('sql_logs_line_count', [String(lineCount)])
                            || (lineCount + ' lines'))}</span>
                    </div>
                    ${renderNumberedSql(entry.query, info, entry.errorDetail, entry.errorLine)}
                </div>` : ''}

                ${body ? `
                <details class="nsft-ssc-logs-tech">
                    <summary>
                        <span>${escapeHtml(chrome.i18n.getMessage('sql_logs_tech') || 'Technical detail')}</span>
                        ${info && info.name ? `<code>${escapeHtml(info.name)}</code>` : ''}
                    </summary>
                    <pre class="nsft-ssc-logs-msg">${escapeHtml(body)}</pre>
                </details>` : ''}
            </div>`;

        if (changed) box.scrollTop = 0;

        const sub = box.querySelector('#nsft-ssc-logs-dsub');
        const subMore = box.querySelector('#nsft-ssc-logs-dsub-more');
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
                    logToToolbar(chrome.i18n.getMessage('ssc_logs_loaded') || 'Script loaded in the editor', 'info');
                }
            });
        });
    }

    const JS_KEYWORDS = /^(var|let|const|function|return|if|else|for|while|do|switch|case|default|break|continue|try|catch|finally|throw|new|delete|typeof|instanceof|in|of|this|class|extends|super|import|export|async|await|yield|void|true|false|null|undefined)$/;

    function highlightJs(text) {
        const re = /(\/\/[^\n]*|\/\*[\s\S]*?\*\/)|('(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"|`(?:\\.|[^`\\])*`)|(\b\d+(?:\.\d+)?\b)|([A-Za-z_$][\w$]*)|(\s+)|([\s\S])/g;
        const tok = (cls, s) => `<span class="nsft-ssc-tok-${cls}">${escapeHtml(s)}</span>`;
        let out = '', m;
        while ((m = re.exec(text)) !== null) {
            if (m[1]) out += tok('com', m[1]);
            else if (m[2]) out += tok('str', m[2]);
            else if (m[3]) out += tok('num', m[3]);
            else if (m[4]) out += tok(JS_KEYWORDS.test(m[4]) ? 'kw' : 'id', m[4]);
            else if (m[5]) out += escapeHtml(m[5]);
            else out += tok('punc', m[6]);
        }
        return out;
    }

    const SSC_WRAPPER_LINES = 4;

    function scriptErrorMark(query, info, detail, linea) {
        const st = String(detail || '').match(/<anonymous>:(\d+):(\d+)/);
        if (!st) return null;
        const line = (linea != null) ? linea : (parseInt(st[1], 10) - SSC_WRAPPER_LINES);
        const column = parseInt(st[2], 10);
        const total = String(query || '').split('\n').length;
        if (!(line >= 1 && line <= total)) return null;
        return {
            line,
            text: chrome.i18n.getMessage('sql_logs_at_line', [String(line), String(column)]) || ''
        };
    }

    function renderNumberedSql(query, info, detail, linea) {
        const lines = String(query || '').split('\n');
        const mark = scriptErrorMark(query, info, detail, linea);
        const badLine = mark ? mark.line : null;
        const rows = lines.map((ln, i) => {
            const n = i + 1;
            const isBad = n === badLine;
            const marker = isBad
                ? `<div class="nsft-ssc-sql-marker"><span>⚠ ${escapeHtml(mark.text)}</span></div>`
                : '';
            return `<div class="nsft-ssc-sql-line${isBad ? ' is-bad' : ''}">
                        <span class="nsft-ssc-sql-num">${n}</span>
                        <span class="nsft-ssc-sql-code">${highlightJs(ln)}</span>
                    </div>` + marker;
        }).join('');
        return `<div class="nsft-ssc-logs-sql-block">${rows}</div>`;
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
        return !!document.getElementById('nsft-ssc-tool-ai');
    }

    function askAiToFix(entry, info) {
        if (!aiAvailable()) {
            logToToolbar(chrome.i18n.getMessage('sql_ai_fix_unavailable')
                || 'El asistente de IA está desactivado.', 'warning');
            return;
        }
        const slot = document.getElementById('nsft-ssc-fix-slot');
        if (!slot) return;

        slot.innerHTML = `
            <div class="nsft-ssc-fix-card is-loading">
                <div class="nsft-ssc-fix-title">${AI_SPARK_SVG}${escapeHtml(
                    chrome.i18n.getMessage('sql_logs_fix_title') || 'Suggested fix')}</div>
                <div class="nsft-ssc-fix-loading">
                    <span class="nsft-ssc-fix-spark">${AI_SPARK_SVG}</span>
                    <span class="nsft-ssc-fix-shimmer">${escapeHtml(
                        chrome.i18n.getMessage('sql_logs_fix_working') || 'Working on a fix…')}</span>
                </div>
            </div>`;

        scrollFixCardIntoView();

        const parts = [
            chrome.i18n.getMessage('ssc_ai_fix_prompt') || 'This client-side SuiteScript snippet failed. Explain why in one line and give me the corrected code.',
            '',
            '```js',
            entry.query || '',
            '```',
            '',
            (chrome.i18n.getMessage('sql_ai_fix_error_label') || 'NetSuite error:') + ' ' + (entry.errorMsg || '')
        ];
        const mark = scriptErrorMark(entry.query, info, entry.errorDetail, entry.errorLine);
        if (mark) {
            parts.push((chrome.i18n.getMessage('sql_ai_fix_pos_label') || 'Reported position:') + ' ' + mark.text);
        }

        const token = ++_fixSeq;
        const onResult = (ev) => {
            window.removeEventListener('nsft-ssc-ai-fix-result', onResult);
            if (token !== _fixSeq) return;
            if (_selectedLogId !== entry.id) return;
            renderFixResult(entry, info, ev.detail || {});
        };
        window.addEventListener('nsft-ssc-ai-fix-result', onResult);

        window.dispatchEvent(new CustomEvent('nsft-ssc-ai-fix', {
            detail: { prompt: parts.join('\n') }
        }));
    }

    function renderFixResult(entry, info, res) {
        const slot = document.getElementById('nsft-ssc-fix-slot');
        if (!slot) return;

        let sql = (res && res.code) || '';
        let explain = '';

        if (res && res.ok) {
            explain = String(res.text || '')
                .replace(/<code>[\s\S]*?<\/code>/i, '')
                .replace(/```(?:js|javascript)?[\s\S]*?```/i, '')
                .trim();
            if (!sql) {
                const fenced = String(res.text || '').match(/```(?:js|javascript)?\s*([\s\S]*?)```/i);
                if (fenced) sql = fenced[1].trim();
            }
        }

        if (!sql) {
            slot.innerHTML = `
                <div class="nsft-ssc-fix-card is-error">
                    <div class="nsft-ssc-fix-title">${AI_SPARK_SVG}${escapeHtml(
                        chrome.i18n.getMessage('sql_logs_fix_title') || 'Suggested fix')}</div>
                    <p class="nsft-ssc-fix-explain">${escapeHtml(
                        (res && res.error) || explain
                        || chrome.i18n.getMessage('sql_logs_fix_none') || 'No fix could be produced.')}</p>
                    <div class="nsft-ssc-fix-actions">
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
            <div class="nsft-ssc-fix-card">
                <div class="nsft-ssc-fix-title">${AI_SPARK_SVG}${escapeHtml(
                    chrome.i18n.getMessage('sql_logs_fix_title') || 'Suggested fix')}</div>
                ${explain ? `<p class="nsft-ssc-fix-explain">${escapeHtml(explain)}</p>` : ''}
                
                <div class="nsft-ssc-fix-diff">
                    <div class="nsft-ssc-fix-actions">
                        <button type="button" class="is-primary" data-log-act="apply-fix">${escapeHtml(
                            chrome.i18n.getMessage('sql_logs_fix_apply') || 'Apply and run')}</button>
                        <button type="button" data-log-act="dismiss-fix">${escapeHtml(
                            chrome.i18n.getMessage('sql_logs_fix_dismiss') || 'Dismiss')}</button>
                    </div>
                    <div class="nsft-ssc-fix-diff-body">${renderSqlDiff(entry.query || '', sql)}</div>
                </div>
            </div>`;
        wireFixActions(slot, entry);
    }

    function scrollFixCardIntoView() {
        const body = document.querySelector('.nsft-ssc-logs-detail');
        const slot = document.getElementById('nsft-ssc-fix-slot');
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
            const host = document.getElementById('nsft-ssc-modal');
            if (!host) { resolve(window.confirm(o.body || '')); return; }

            const prev = document.getElementById('nsft-ssc-confirm-dialog');
            if (prev) prev.remove();

            const overlay = document.createElement('div');
            overlay.id = 'nsft-ssc-confirm-dialog';
            overlay.className = 'nsft-ssc-dialog nsft-ssc-confirm';

            const box = document.createElement('div');
            box.className = 'nsft-ssc-confirm-box';

            const h = document.createElement('h3');
            h.textContent = o.title || '';
            const p = document.createElement('p');
            p.className = 'nsft-ssc-confirm-body';
            p.textContent = o.body || '';

            const acts = document.createElement('div');
            acts.className = 'nsft-ssc-confirm-actions';
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
                rl.className = 'nsft-ssc-confirm-remember';
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

    function normalizeForDiff(code) {
        return String(code || '').replace(/\r\n/g, '\n').replace(/[ \t]+$/gm, '');
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
            .map(([kind, text]) => `<div class="nsft-ssc-fix-${kind}">${highlightJs(text)}</div>`)
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
            body: chrome.i18n.getMessage('ssc_logs_clear_confirm') || '',
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
        document.querySelectorAll('.nsft-ssc-panel-tab').forEach((btn) => {
            if (btn.dataset.wired) return;
            btn.dataset.wired = '1';
            btn.addEventListener('click', () => switchPanelTab(btn.getAttribute('data-panel-tab')));
        });

        const clearBtn = document.getElementById('nsft-ssc-logs-clear');
        if (clearBtn && !clearBtn.dataset.wired) {
            clearBtn.dataset.wired = '1';
            clearBtn.addEventListener('click', clearAllLogs);
        }


        const filterInput = document.getElementById('nsft-ssc-logs-filter');
        if (filterInput && !filterInput.dataset.wired) {
            filterInput.dataset.wired = '1';
            filterInput.addEventListener('input', () => {
                _logQuery = filterInput.value || '';
                renderLogsList();
            });
        }

        document.querySelectorAll('.nsft-ssc-logs-chip').forEach((chip) => {
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

    const LOGS_SPLIT_KEY = 'nsft_ssc_logs_split_pct';

    function initLogsResizer() {
        const resizer = document.getElementById('nsft-ssc-logs-resizer');
        const side = document.querySelector('.nsft-ssc-logs-side');
        const view = document.getElementById('nsft-ssc-logs-view');
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
        const container = document.getElementById('nsft-ssc-logs-container');
        if (!container) return;

        const icons = {
            info: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>',
            warning: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>',
            error: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>',
            success: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>'
        };

        const iconSvg = icons[type] || icons.info;

        const newItem = document.createElement('div');
        newItem.classList.add('nsft-ssc-log-item');
        newItem.classList.add(type);

        newItem.innerHTML = `${iconSvg}<div class="nsft-ssc-log-content"><span>${escapeHtml(msg)}</span></div>`;
        newItem.title = msg;

        container.appendChild(newItem);

        const activeItem = container.querySelector('.nsft-ssc-log-item.active');
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
            const contentWrapper = newItem.querySelector('.nsft-ssc-log-content');
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


    let editor;
    let _sscEd = null;

    const SSC_ED = window.NSFT_CodeEditor || null;

    let _sscTipos = Object.create(null);
    let _sscNlapi = [];
    let _sscModsOk = [];
    let _sscModsNo = [];

    if (SSC_ED) {
        SSC_ED.onData((d) => {
            _sscModsOk = d.ok;
            _sscModsNo = d.no;
            _sscTipos = d.tipos;
            _sscNlapi = d.nlapi;
            _sscDisponibles = d.ok;
            sscPintaModulos(_sscModsOk, _sscModsNo);
            sscPublicaContextoAi();
        });
    }

    let _sqlBooting = false;
    let _bootWatchdog = null;
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
        if (document.getElementById('nsft-ssc-boot')) return;
        const el = document.createElement('div');
        el.id = 'nsft-ssc-boot';
        el.className = 'nsft-ssc-boot';
        el.setAttribute('data-nsft-ui', '');
        el.setAttribute('role', 'status');
        el.setAttribute('aria-live', 'polite');
        el.innerHTML =
            '<div class="nsft-ssc-boot-card">' +
                '<div class="nsft-ssc-boot-top">' +
                    '<span class="nsft-ui-spinner nsft-ssc-boot-spin"></span>' +
                    '<span class="nsft-ssc-boot-title"></span>' +
                '</div>' +
                '<div class="nsft-ssc-boot-step"></div>' +
                '<div class="nsft-ssc-boot-bar"><span></span></div>' +
            '</div>';
        el.querySelector('.nsft-ssc-boot-title').textContent =
            chrome.i18n.getMessage('ssc_title') || 'SuiteScript Console';
        document.body.appendChild(el);
        setBootStep('ssc_boot_step_shell', 'Preparando la consola…', 1);
        clearTimeout(_bootWatchdog);
        _bootWatchdog = setTimeout(finishBoot, BOOT_MAX_MS);
    }

    function setBootStep(key, fallback, step, subs) {
        const el = document.getElementById('nsft-ssc-boot');
        if (!el) return;
        const txt = el.querySelector('.nsft-ssc-boot-step');
        const bar = el.querySelector('.nsft-ssc-boot-bar span');
        if (txt) txt.textContent = chrome.i18n.getMessage(key, subs) || fallback;
        if (bar) bar.style.width = Math.min(100, Math.round((step / BOOT_STEPS) * 100)) + '%';
    }

    function hideBootOverlay() {
        const el = document.getElementById('nsft-ssc-boot');
        if (!el) return;
        el.classList.add('is-done');
        setTimeout(() => el.remove(), 220);
    }

    function focusEditorOnOpen() {
        if (!editor) return;
        requestAnimationFrame(() => {
            const modal = document.getElementById('nsft-ssc-modal');
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
        const modalListo = document.getElementById('nsft-ssc-modal');
        if (modalListo) modalListo.classList.remove('nsft-ssc-booting');
        hideBootOverlay();
        const pending = _sqlBootQueue.splice(0);
        pending.forEach((fn) => { try { fn(); } catch (err) { } });
        focusEditorOnOpen();
    }

    async function initModal() {
        if (document.getElementById('nsft-ssc-modal')) return;
        _sqlBooting = true;

        try {
            await afterPaint();

            document.body.insertAdjacentHTML('beforeend', getHtmlTemplate());
            const _modalEnMontaje = document.getElementById('nsft-ssc-modal');
            if (_modalEnMontaje) _modalEnMontaje.classList.add('nsft-ssc-booting');
            try { window.dispatchEvent(new CustomEvent('nsft-ssc-modal-ready')); } catch (e) { }
            _nsftApplyThemeToModal();
            addModalListeners();

            loadThemeCss(currentTheme);

            await afterPaint();
            setBootStep('ssc_boot_step_editor', 'Cargando el editor…', 2);


            const textArea = document.getElementById("nsft-ssc-query-input");
            if (textArea && typeof CodeMirror !== 'undefined' && SSC_ED) {
                _sscEd = SSC_ED.attach(textArea, {
                    theme: currentTheme,
                    ghostButton: document.getElementById('nsft-ssc-tool-ghost'),
                    onLint: (r) => {
                        if (!r) { sscLintLimpia(); return; }
                        sscLintPinta(r.msg, r.line);
                    },
                    extraKeys: {
                        'Ctrl-F': () => { handleEditFind(); },
                        'Cmd-F': () => { handleEditFind(); }
                    }
                });
                editor = _sscEd && _sscEd.cm;
                if (_sscEd) _sscEd.ghost.pintaBoton();
            }
            if (editor) {

                editor.setSize("100%", "100%");

                const updateStats = (force = false) => {
                    const doc = editor.getDoc();
                    const cursor = doc.getCursor();
                    const ln = cursor.line + 1;
                    const col = cursor.ch + 1;
                    const totalLines = doc.lineCount();
                    const charCount = editor.getValue().length;
                    const pos = doc.indexFromPos(cursor);

                    const statsEl = document.getElementById('nsft-ssc-editor-stats');
                    if (statsEl) {
                        if (!force && statsEl.querySelector('input')) return;

                        statsEl.innerHTML = `
                            <span class="nsft-ssc-stat-item">Len: ${charCount}</span>
                            <span class="nsft-ssc-stat-item">Lines: ${totalLines}</span>
                            <span class="nsft-ssc-stat-item nsft-ssc-stat-editable" id="nsft-ssc-stat-coords" title="Click to go to line:col">${ln}:${col}</span>
                            <span class="nsft-ssc-stat-item">Pos: ${pos}</span>
                        `;

                        document.getElementById('nsft-ssc-stat-coords').onclick = function (e) {
                            if (this.querySelector('input')) return;

                            const currentCoords = this.textContent;
                            this.classList.add('editing');
                            this.innerHTML = `<input type="text" value="${escapeHtml(currentCoords)}" class="nsft-ssc-stat-input">`;
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

                editor.on("cursorActivity", updateStats);
                editor.on("change", () => {
                    updateStats();
                    if (!_suppressEditorChange) {
                        captureActiveTabFromEditor();
                        markActiveTabDirty();
                    }
                });
                setTimeout(() => updateStats(), 100);
            }

            await afterPaint();
            setBootStep('ssc_boot_step_modules', 'Sondeando los módulos N/*…', 3);

            if (SSC_ED) SSC_ED.prepare();
            sscFiltraSalida();

            const modal = document.getElementById('nsft-ssc-modal');
            constrainModalToWindow(modal);
            bringToFront();

            modal.addEventListener('mousedown', bringToFront);

            await afterPaint();
            setBootStep('ssc_boot_step_tools', 'Ajustando paneles y herramientas…', 4);

            initPanelTabs();
            initFavoritesUI();
            initSnippetsUI();
            initToolbarMenuExclusivity();

            applyViewState();

            wireFindClear('nsft-ssc-logs-filter');
            sscWireFiltroSalida();

            const lintBar = document.getElementById('nsft-ssc-lint');
            if (lintBar && !lintBar.dataset.wired) {
                lintBar.dataset.wired = '1';
                lintBar.addEventListener('click', () => {
                    const ln = parseInt(lintBar.dataset.line, 10);
                    if (!editor || isNaN(ln)) return;
                    editor.setCursor({ line: ln, ch: 0 });
                    editor.focus();
                });
            }

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

            if (editor) editor.refresh();

            setBootStep('ssc_boot_step_modules', 'Sondeando los módulos N/*…', 5);
            await new Promise((ok) => { if (SSC_ED) SSC_ED.prepare(ok); else ok(); });

            await afterPaint();
        } catch (err) {
            console.error('NSFT: SuiteScript Console boot failed', err);
        } finally {
            finishBoot();
        }
    }







    function clearResults() {
        sscPintaMensaje(chrome.i18n.getMessage('ssc_out_empty') || 'Run the script to see its result here.');

        setRunState('idle');
        paintClearResultsBtn();
    }

    function paintClearResultsBtn(running) {
        const btn = document.getElementById('nsft-ssc-clear-btn');
        if (!btn) return;
        const corriendo = (running === undefined) ? (_runPhase === 'running') : !!running;
        const out = document.getElementById('nsft-ssc-output');
        const hay = !!(out && out.childElementCount && !out.querySelector('.nsft-ssc-out-empty'));
        btn.disabled = !hay || corriendo;
    }

    function loadThemeCss(themeName) {
        if (!themeName || themeName === 'default') return;

        let fileName = themeName;
        if (themeName.startsWith('solarized')) {
            fileName = 'solarized';
        }

        const linkId = 'nsft-ssc-codemirror-theme';
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
        const modal = document.getElementById('nsft-ssc-modal');
        if (!modal) return;

        const titleEl = document.getElementById('nsft-ssc-title');
        if (!titleEl) return;

        const baseTitle = chrome.i18n.getMessage('ssc_title') || 'SuiteScript Console';
        const displayTitle = currentFileName ? `${baseTitle} - ${currentFileName}` : baseTitle;

        if (modal.dataset.state === 'minimised') {
            titleEl.innerHTML = `<span class="nsft-ssc-title-minimised">
                 <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#000000" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 4px; vertical-align: middle;"><rect x="3" y="4" width="18" height="16" rx="2"></rect><polyline points="7 9 10 12 7 15"></polyline><line x1="13" y1="15" x2="17" y2="15"></line></svg>
                 ${chrome.i18n.getMessage('ssc_title_minimised') || 'SuiteScript'}
             </span>`;
            setTimeout(() => snapToEdge(modal), 10);
        } else {
            titleEl.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#000000" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 6px; vertical-align: middle;"><rect x="3" y="4" width="18" height="16" rx="2"></rect><polyline points="7 9 10 12 7 15"></polyline><line x1="13" y1="15" x2="17" y2="15"></line></svg>${escapeHtml(displayTitle)}`;
            constrainModalAfterTransition(modal);
        }
    }

    let _modalKeysBound = false;

    let _sscEditorPct = 0;

    const MODAL_COMMANDS = [
        ['Mod+Enter', () => executeCurrentQuery()],
        ['Mod+S', () => handleFileSave()],
        ['Mod+Shift+S', () => handleFileSaveAs()],
        ['Mod+O', () => handleFileOpen()],
        ['Mod+Shift+F', () => handleEditFormat()],
        ['Mod+Shift+D', () => handleFileExport()],
        ['Mod+Shift+C', () => handleRunCopy()],
        ['Mod+Shift+G', () => importSavedQueriesFromFile()],
        ['Mod+Shift+Y', () => exportSavedQueriesToFile()],
        ['Mod+Shift+X', () => handleModalExit()],
        ['Mod+Shift+1', () => handleViewEditor()],
        ['Mod+Shift+2', () => handleViewTable()]
    ];

    function onModalKeydown(e) {
        const S = window.NSFT_Shortcuts;
        if (!S || typeof S.matches !== 'function') return;
        const modal = document.getElementById('nsft-ssc-modal');
        const MS = window.NSFT_ModalStack;
        if (!modal || !MS || typeof MS.isActive !== 'function' || !MS.isActive(modal)) return;
        if (e.target && e.target.closest
            && e.target.closest('.nsft-ssc-dialog, .nsft-ssc-erd-overlay')) return;
        for (const [combo, run] of MODAL_COMMANDS) {
            if (!S.matches(e, combo)) continue;
            e.preventDefault();
            e.stopPropagation();
            run();
            return;
        }
    }

    function addModalListeners() {
        const modal = document.getElementById('nsft-ssc-modal');
        if (!_modalKeysBound) {
            document.addEventListener('keydown', onModalKeydown, true);
            _modalKeysBound = true;
        }

        const resizer = document.getElementById('nsft-ssc-resizer');
        const mainPanel = document.querySelector('.nsft-ssc-main-panel');
        const resultsPanel = document.querySelector('.nsft-ssc-results-panel');
        const runnerContent = document.querySelector('.nsft-ssc-center') || document.querySelector('.suitescript-console-content');

        if (resizer && mainPanel && resultsPanel && runnerContent) {
            let isResizing = false;

            try {
                chrome.storage.local.get(['nsft_ssc_editor_height_pct'], (it) => {
                    const pct = Number(it && it.nsft_ssc_editor_height_pct);
                    if (pct >= 15 && pct <= 80) {
                        _sscEditorPct = pct;
                        mainPanel.style.flex = 'none';
                        mainPanel.style.height = pct + '%';
                        resultsPanel.style.flex = '1';
                        resultsPanel.style.height = 'auto';
                        if (editor) editor.refresh();
                    }
                });
            } catch (e) { }

            resizer.addEventListener('mousedown', (e) => {
                isResizing = true;
                mainPanel.classList.add('nsft-ssc-noanim');
                resultsPanel.classList.add('nsft-ssc-noanim');
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
            });

            document.addEventListener('mouseup', () => {
                if (isResizing) {
                    isResizing = false;
                    mainPanel.classList.remove('nsft-ssc-noanim');
                    resultsPanel.classList.remove('nsft-ssc-noanim');
                    document.body.style.cursor = 'default';
                    try {
                        const total = runnerContent.getBoundingClientRect().height;
                        const h = mainPanel.getBoundingClientRect().height;
                        if (total > 0 && h > 0) {
                            const pct = Math.max(15, Math.min(80, Math.round((h / total) * 100)));
                            _sscEditorPct = pct;
                            chrome.storage.local.set({ nsft_ssc_editor_height_pct: pct });
                        }
                    } catch (e) { }
                }
            });
        }

        const menuItems = modal.querySelectorAll('.nsft-ssc-menu-item');
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
            if (!document.getElementById('nsft-ssc-modal')) {
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
            const btn = document.getElementById('nsft-ssc-fullscreen');
            if (!btn) return;
            btn.title = chrome.i18n.getMessage(modal.dataset.state === 'fullscreen'
                ? 'sql_fullscreen_exit' : 'sql_fullscreen_enter') || '';
        };

        clickHandler('nsft-ssc-minimise', () => {
            modal.dataset.state = 'minimised';
            updateTitleState();
            syncFullscreenBtn();
            dispatchLayoutUpdate();
        });

        clickHandler('nsft-ssc-maximise', () => {
            modal.dataset.state = 'maximised';
            modal.style.top = lastMaximizedTop;
            modal.style.left = lastMaximizedLeft;
            updateTitleState();
            syncFullscreenBtn();
            dispatchLayoutUpdate();
        });

        clickHandler('nsft-ssc-fullscreen', () => {
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

        clickHandler('nsft-ssc-close', () => {
            modal.remove();
            dispatchLayoutUpdate();
        });

        const header = modal.querySelector('.suitescript-console-header');
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

        registerAction('nsft-ssc-action-open', handleFileOpen);
        registerAction('nsft-ssc-action-save', handleFileSave);
        registerAction('nsft-ssc-action-save-as', handleFileSaveAs);
        registerAction('nsft-ssc-action-export', handleFileExport);
        registerAction('nsft-ssc-copy-btn', handleRunCopy);
        registerAction('nsft-ssc-clear-btn', clearResults);
        registerAction('nsft-ssc-action-import-json', () => importSavedQueriesFromFile());
        registerAction('nsft-ssc-action-export-json', exportSavedQueriesToFile);
        registerAction('nsft-ssc-action-exit', handleModalExit);

        registerAction('nsft-ssc-action-format', handleEditFormat);
        registerAction('nsft-ssc-action-find', handleEditFind);
        registerAction('nsft-ssc-action-autocomplete', () => {
            if (editor) editor.showHint({ completeSingle: false });
        });

        registerAction('nsft-ssc-action-run', handleRunRun);

        registerAction('nsft-ssc-action-view-table', handleViewTable);
        registerAction('nsft-ssc-action-view-editor', handleViewEditor);

        registerAction('nsft-ssc-action-api-docs', () => window.open('https://docs.oracle.com/en/cloud/saas/netsuite/ns-online-help/chapter_4220488571.html', '_blank'));

        registerAction('nsft-ssc-tool-open', handleFileOpen);
        registerAction('nsft-ssc-tool-save', handleFileSave);
        registerAction('nsft-ssc-tool-save-as', handleFileSaveAs);
        registerAction('nsft-ssc-tool-format', handleToolbarFormat);
        registerAction('nsft-ssc-tool-run', handleToolbarRun);
        registerAction('nsft-ssc-tool-results-toggle', handleViewTable);
        registerAction('nsft-ssc-tool-ghost', () => { if (_sscEd) _sscEd.ghost.toggle(); });
        if (_sscEd) _sscEd.ghost.pintaBoton();
        const ghostBtn = document.getElementById('nsft-ssc-tool-ghost');
        if (ghostBtn && !ghostBtn.dataset.menuWired) {
            ghostBtn.dataset.menuWired = '1';
            ghostBtn.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                e.stopPropagation();
                sscGhostMenuAbre(ghostBtn);
            });
        }
        registerAction('nsft-ssc-edge-results', handleViewTable);
        registerAction('nsft-ssc-edge-ai', () => {
            const btn = document.getElementById('nsft-ssc-tool-ai');
            if (btn) btn.click();
        });
        registerAction('nsft-ssc-results-close', handleViewTable);
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
            logToToolbar(chrome.i18n.getMessage('ssc_loaded') || 'Script loaded', 'info');
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
        const btn = document.getElementById('nsft-ssc-tool-favorites');
        const menu = document.getElementById('nsft-ssc-favorites-menu');
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
        menu.innerHTML = `<div class="nsft-ssc-fav-loading">${escapeHtml(chrome.i18n.getMessage('sql_loading') || 'Loading...')}</div>`;
        loadFavorites((favs) => {
            loadHistory((history) => {
                const names = Object.keys(favs).sort();
                const saveLabel = escapeHtml(chrome.i18n.getMessage('ssc_fav_save_current') || 'Save current query as...');
                const favEmptyLabel = escapeHtml(chrome.i18n.getMessage('sql_fav_empty') || 'No favorites yet');
                const favHeader = escapeHtml(chrome.i18n.getMessage('sql_fav_header') || 'Favorites');
                const histHeader = escapeHtml(chrome.i18n.getMessage('sql_history_header') || 'Recent');
                const histEmpty = escapeHtml(chrome.i18n.getMessage('ssc_history_empty') || 'No executed scripts yet');
                const histClear = escapeHtml(chrome.i18n.getMessage('sql_history_clear') || 'Clear history');

                let html = `<div class="nsft-ssc-fav-action" id="nsft-ssc-fav-add">
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                                <span>${saveLabel}</span>
                            </div>`;

                html += `<div class="nsft-ssc-fav-section-header">${favHeader}</div>`;
                if (names.length === 0) {
                    html += `<div class="nsft-ssc-fav-empty">${favEmptyLabel}</div>`;
                } else {
                    html += names.map(n => {
                        const safeName = escapeHtml(n);
                        return `<div class="nsft-ssc-fav-item" data-fav-name="${safeName}" title="${safeName}">
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>
                                    <span class="nsft-ssc-fav-name">${safeName}</span>
                                    <span class="nsft-ssc-fav-delete" data-fav-delete="${safeName}" title="${escapeHtml(chrome.i18n.getMessage('sql_fav_unstar') || 'Remove from favorites')}">×</span>
                                </div>`;
                    }).join('');
                }

                html += `<div class="nsft-ssc-fav-section-header nsft-ssc-fav-section-history">
                            <span>${histHeader}</span>
                            ${history.length > 0 ? `<button class="nsft-ssc-history-clear" id="nsft-ssc-history-clear" title="${histClear}">${histClear}</button>` : ''}
                         </div>`;
                if (history.length === 0) {
                    html += `<div class="nsft-ssc-fav-empty">${histEmpty}</div>`;
                } else {
                    html += history.map((entry, idx) => {
                        const q = entry.query || '';
                        const preview = q.replace(/\s+/g, ' ').slice(0, 80);
                        const safePreview = escapeHtml(preview);
                        const timeAgo = entry.executedAt ? formatTimeAgo(entry.executedAt) : '';

                        const status = entry.status || 'ok';
                        const statusClass = `nsft-ssc-hist-dot nsft-ssc-hist-dot-${status}`;

                        const chipParts = [];
                        if (typeof entry.rows === 'number') {
                            chipParts.push(entry.rows + ' ' + (entry.rows === 1 ? 'row' : 'rows'));
                        }
                        if (typeof entry.durationMs === 'number') {
                            chipParts.push(entry.durationMs + ' ms');
                        }
                        const chip = chipParts.length
                            ? `<span class="nsft-ssc-hist-chip">${escapeHtml(chipParts.join(' · '))}</span>`
                            : '';

                        const tipLines = [q];
                        if (status === 'error' && entry.errorMsg) tipLines.push('⚠ ' + entry.errorMsg);
                        const tooltip = escapeHtml(tipLines.join('\n'));

                        return `<div class="nsft-ssc-hist-item" data-hist-idx="${idx}" title="${tooltip}">
                                    <span class="${statusClass}" aria-hidden="true"></span>
                                    <span class="nsft-ssc-hist-preview">${safePreview}</span>
                                    ${chip}
                                    <span class="nsft-ssc-hist-time">${escapeHtml(timeAgo)}</span>
                                </div>`;
                    }).join('');
                }

                menu.innerHTML = html;

                const addBtn = document.getElementById('nsft-ssc-fav-add');
                if (addBtn) addBtn.addEventListener('click', () => {
                    menu.classList.remove('open');
                    handleFavoriteAdd();
                });
                menu.querySelectorAll('.nsft-ssc-fav-item').forEach(el => {
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
                menu.querySelectorAll('.nsft-ssc-hist-item').forEach(el => {
                    el.addEventListener('click', () => {
                        const i = parseInt(el.getAttribute('data-hist-idx'), 10);
                        const entry = history[i];
                        if (!entry) return;
                        menu.classList.remove('open');
                        createTab({
                            title: (chrome.i18n.getMessage('ssc_tab_default_title') || 'Query') + ' ' + (tabs.length + 1),
                            query: entry.query,
                            fileName: null
                        });
                    });
                });
                const clearBtn = document.getElementById('nsft-ssc-history-clear');
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
        const toolbar = document.querySelector('#nsft-ssc-modal .nsft-ssc-toolbar');
        if (!toolbar) return;
        toolbar.addEventListener('click', (e) => {
            const btn = e.target.closest('.nsft-ssc-toolbar-button');
            if (!btn) return;
            const ownWrap = btn.closest('.nsft-ssc-favorites-wrap');
            toolbar.querySelectorAll('.nsft-ssc-favorites-menu.open').forEach((m) => {
                if (ownWrap && ownWrap.contains(m)) return;
                m.classList.remove('open');
            });
        }, true);
    }



    function initSnippetsUI() {
        const btn = document.getElementById('nsft-ssc-tool-snippets');
        const menu = document.getElementById('nsft-ssc-snippets-menu');
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
        menu.innerHTML = `<div class="nsft-ssc-fav-loading">${escapeHtml(chrome.i18n.getMessage('sql_loading') || 'Loading...')}</div>`;
        loadSnippets((snips) => {
            const saveLabel = escapeHtml(chrome.i18n.getMessage('sql_snip_save_current') || 'Save selection as snippet…');
            const header = escapeHtml(chrome.i18n.getMessage('sql_snip_header') || 'Snippets');
            const emptyLabel = escapeHtml(chrome.i18n.getMessage('sql_snip_empty') || 'No snippets yet');

            let html = `<div class="nsft-ssc-fav-action" id="nsft-ssc-snip-add">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                            <span>${saveLabel}</span>
                        </div>`;
            html += `<div class="nsft-ssc-fav-section-header">${header}</div>`;
            if (!snips.length) {
                html += `<div class="nsft-ssc-fav-empty">${emptyLabel}</div>`;
            } else {
                html += snips.map((s, idx) => {
                    const safeName = escapeHtml(s.name);
                    const preview = escapeHtml((s.code || '').replace(/\s+/g, ' ').slice(0, 90));
                    return `<div class="nsft-ssc-fav-item nsft-ssc-snip-item" data-snip-idx="${idx}" title="${preview}">
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"></polyline><polyline points="8 6 2 12 8 18"></polyline></svg>
                                <span class="nsft-ssc-fav-name">${safeName}</span>
                                <span class="nsft-ssc-fav-delete" data-snip-delete="${idx}" title="${escapeHtml(chrome.i18n.getMessage('sql_snip_remove') || 'Delete snippet')}">×</span>
                            </div>`;
                }).join('');
            }
            menu.innerHTML = html;

            const addEl = menu.querySelector('#nsft-ssc-snip-add');
            if (addEl) addEl.addEventListener('click', (e) => {
                e.stopPropagation();
                menu.classList.remove('open');
                handleSnippetSave();
            });

            menu.querySelectorAll('.nsft-ssc-snip-item').forEach((item) => {
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


    function showSaveQueryDialog(onConfirm) {
        if (document.getElementById('nsft-save-dialog')) return;

        const overlay = document.createElement('div');
        overlay.id = 'nsft-save-dialog';
        overlay.className = 'nsft-ssc-dialog';
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
        title.textContent = chrome.i18n.getMessage('ssc_save_prompt') || 'Query Name';
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
        input.placeholder = chrome.i18n.getMessage('ssc_save_placeholder') || 'My Script...';

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

        const modalContainer = document.getElementById('nsft-ssc-modal');
        if (modalContainer) modalContainer.appendChild(overlay);
    }
    function handleFileExport() {
        if (!editor) return;
        const sqlContent = editor.getValue();
        if (!sqlContent.trim()) {
            logToToolbar(chrome.i18n.getMessage('sql_empty_query') || 'Editor is empty', 'warning');
            return;
        }
        showExportFormatDialog((format) => {
            const extension = format === 'txt' ? 'txt' : 'js';
            const mimeType = format === 'txt' ? 'text/plain' : 'text/javascript';
            const blob = new Blob([sqlContent], { type: mimeType });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `script_${new Date().toISOString().slice(0, 10)}.${extension}`;
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
        overlay.className = 'nsft-ssc-dialog';
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

        const modalContainer = document.getElementById('nsft-ssc-modal');
        if (modalContainer) {
            modalContainer.appendChild(overlay);
        }
    }

    function exportSavedQueriesToFile() {
        loadSavedQueries((all) => {
            const count = Object.keys(all).length;
            if (!count) {
                logToToolbar(chrome.i18n.getMessage('ssc_export_empty') || 'No saved scripts to export', 'warning');
                return;
            }
            const payload = {
                kind: 'nsft-suitescript-scripts',
                version: 1,
                exportedAt: new Date().toISOString(),
                queries: all
            };
            const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `nsft-suitescript-scripts-${new Date().toISOString().slice(0, 10)}.json`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            setTimeout(() => URL.revokeObjectURL(url), 100);
            logToToolbar(chrome.i18n.getMessage('ssc_export_ok', [String(count)]) || `Exported ${count} queries`, 'success');
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
                                chrome.i18n.getMessage('ssc_import_ok', [String(added), String(renamed)])
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
        overlay.className = 'nsft-ssc-dialog';
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
        title.textContent = chrome.i18n.getMessage('ssc_open_dialog_title') || 'Saved Scripts';
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
                listContainer.innerHTML = `<div style="padding:24px; text-align:center; color:#6b7280; font-size:14px;">${chrome.i18n.getMessage('ssc_no_saved_scripts') || 'No saved scripts found.'}</div>`;
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
                tr.className = 'nsft-ssc-dialog-row';
                tr.style.cssText = `
                    border-bottom: 1px solid #f3f4f6;
                    cursor: pointer;
                    transition: background-color 0.15s ease;
                `;

                const isFav = isObject && queryData.favorite === true;
                tr.innerHTML = `
                    <td class="nsft-ssc-dialog-cell-fav" style="padding: 10px 0; text-align: center; width: 36px;"></td>
                    <td class="nsft-ssc-dialog-cell-name" style="padding: 10px 12px; font-weight: 500; color: #1f2937;">${escapeHtml(key)}</td>
                    <td class="nsft-ssc-dialog-cell-date" style="padding: 10px 12px; color: #6b7280; font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 150px;">${dateStr}</td>
                    <td style="padding: 10px 12px; text-align: right; width: 40px;"></td>
                `;

                const starBtn = document.createElement('button');
                starBtn.type = 'button';
                starBtn.className = 'nsft-ssc-dialog-star' + (isFav ? ' is-on' : '');
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
                        body: chrome.i18n.getMessage('ssc_confirm_delete', [key]) || `Delete query "${key}"?`,
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

        const modalContainer = document.getElementById('nsft-ssc-modal');
        if (modalContainer) {
            modalContainer.appendChild(overlay);
        }
    }
    function handleEditFormat() { formatScriptContent(); }

    function handleEditFind() {
        if (!editor) return;

        let widget = document.getElementById('nsft-ssc-search-widget');
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
        widget.id = 'nsft-ssc-search-widget';
        widget.className = 'nsft-ssc-findbar';

        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'nsft-ssc-findbar-input';
        input.placeholder = chrome.i18n.getMessage('sql_findbar_ph') || 'Find in editor…';

        const btnNext = document.createElement('button');
        btnNext.type = 'button';
        btnNext.className = 'nsft-ssc-findbar-btn';
        btnNext.innerHTML = '&#9660;';
        btnNext.title = chrome.i18n.getMessage('sql_findbar_next') || 'Next (Enter)';
        btnNext.setAttribute('aria-label', btnNext.title);

        const btnPrev = document.createElement('button');
        btnPrev.type = 'button';
        btnPrev.className = 'nsft-ssc-findbar-btn';
        btnPrev.innerHTML = '&#9650;';
        btnPrev.title = chrome.i18n.getMessage('sql_findbar_prev') || 'Previous (Shift+Enter)';
        btnPrev.setAttribute('aria-label', btnPrev.title);

        const btnClose = document.createElement('button');
        btnClose.type = 'button';
        btnClose.className = 'nsft-ssc-findbar-btn nsft-ssc-findbar-close';
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





    function handleRunCopy() {
        const out = document.getElementById('nsft-ssc-output');
        const text = out ? (out.innerText || '').trim() : '';
        if (!text || out.querySelector('.nsft-ssc-out-empty')) {
            logToToolbar(chrome.i18n.getMessage('ssc_copy_empty') || 'There is no output to copy yet', 'warning');
            return;
        }
        const done = () => logToToolbar(
            chrome.i18n.getMessage('ssc_copy_ok') || 'Output copied',
            'success'
        );
        if (window.NSFT_Clipboard && window.NSFT_Clipboard.copy) {
            window.NSFT_Clipboard.copy(text, { toast: true, onSuccess: done });
        } else {
            navigator.clipboard.writeText(text).then(done).catch(() => {
                logToToolbar(chrome.i18n.getMessage('sql_copy_failed') || 'Could not copy', 'error');
            });
        }
    }

    const VIEW_STATE_KEY = 'nsft_ssc_view_state';

    function currentViewState() {
        const mainPanel = document.querySelector('.nsft-ssc-main-panel');
        const resultsPanel = document.querySelector('.nsft-ssc-results-panel');
        if (!mainPanel || !resultsPanel) return 'both';
        if (mainPanel.classList.contains('nsft-ssc-panel-collapsed')) return 'no-editor';
        if (resultsPanel.classList.contains('nsft-ssc-panel-collapsed')) return 'no-table';
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
        const mainPanel = document.querySelector('.nsft-ssc-main-panel');
        const resultsPanel = document.querySelector('.nsft-ssc-results-panel');
        const resizer = document.getElementById('nsft-ssc-resizer');
        const editorMenuItem = document.getElementById('nsft-ssc-action-view-editor');
        const tableMenuItem = document.getElementById('nsft-ssc-action-view-table');

        if (!mainPanel || !resultsPanel || !resizer) return;

        if (resultsPanel.classList.contains('nsft-ssc-panel-collapsed')) {
            resultsPanel.classList.remove('nsft-ssc-panel-collapsed');
            resultsPanel.style.display = 'flex';
            resizer.classList.remove('nsft-ssc-resizer-hidden');

            mainPanel.classList.remove('nsft-ssc-panel-collapsed');
            mainPanel.style.display = 'flex';
            mainPanel.style.flex = 'none';
            mainPanel.style.height = (_sscEditorPct >= 15 && _sscEditorPct <= 80) ? _sscEditorPct + '%' : '300px';

            if (tableMenuItem) tableMenuItem.textContent = chrome.i18n.getMessage('ssc_menu_hide_output') || 'Hide Output';
            if (editorMenuItem) editorMenuItem.textContent = chrome.i18n.getMessage('sql_menu_hide_editor') || 'Hide Editor';
        } else {
            resultsPanel.classList.add('nsft-ssc-panel-collapsed');
            resizer.classList.add('nsft-ssc-resizer-hidden');

            mainPanel.classList.remove('nsft-ssc-panel-collapsed');
            mainPanel.style.display = 'flex';
            mainPanel.style.flex = 'none';
            mainPanel.style.height = '100%';

            if (tableMenuItem) tableMenuItem.textContent = chrome.i18n.getMessage('ssc_menu_show_output') || 'Show Output';
            if (editorMenuItem) editorMenuItem.textContent = chrome.i18n.getMessage('sql_menu_hide_editor') || 'Hide Editor';
        }
        persistViewState();
        if (editor) editor.refresh();
        setTimeout(() => {
            if (editor) editor.refresh();
        }, 180);
        updateResultsToggleUI();
    }

    function handleViewEditor() {
        const mainPanel = document.querySelector('.nsft-ssc-main-panel');
        const resultsPanel = document.querySelector('.nsft-ssc-results-panel');
        const resizer = document.getElementById('nsft-ssc-resizer');
        const editorMenuItem = document.getElementById('nsft-ssc-action-view-editor');
        const tableMenuItem = document.getElementById('nsft-ssc-action-view-table');

        if (!mainPanel || !resultsPanel || !resizer) return;

        if (mainPanel.classList.contains('nsft-ssc-panel-collapsed')) {
            mainPanel.classList.remove('nsft-ssc-panel-collapsed');
            mainPanel.style.display = 'flex';
            mainPanel.style.flex = 'none';
            mainPanel.style.height = (_sscEditorPct >= 15 && _sscEditorPct <= 80) ? _sscEditorPct + '%' : '300px';

            resizer.classList.remove('nsft-ssc-resizer-hidden');
            resultsPanel.classList.remove('nsft-ssc-panel-collapsed');
            resultsPanel.style.display = 'flex';
            resultsPanel.style.flex = '1';

            if (editorMenuItem) editorMenuItem.textContent = chrome.i18n.getMessage('sql_menu_hide_editor') || 'Hide Editor';
            if (tableMenuItem) tableMenuItem.textContent = chrome.i18n.getMessage('ssc_menu_hide_output') || 'Hide Output';
        } else {
            mainPanel.classList.add('nsft-ssc-panel-collapsed');
            resizer.classList.add('nsft-ssc-resizer-hidden');

            resultsPanel.classList.remove('nsft-ssc-panel-collapsed');
            resultsPanel.style.display = 'flex';
            resultsPanel.style.flex = '1';

            if (editorMenuItem) editorMenuItem.textContent = chrome.i18n.getMessage('sql_menu_show_editor') || 'Show Editor';
            if (tableMenuItem) tableMenuItem.textContent = chrome.i18n.getMessage('ssc_menu_hide_output') || 'Hide Output';
        }
        persistViewState();
        if (editor) editor.refresh();
        setTimeout(() => {
            if (editor) editor.refresh();
        }, 180);
        updateResultsToggleUI();
    }

    function sscMascaraCodigo(src) {
        const a = src.split('');
        const n = a.length;
        const tapa = (desde, hasta) => {
            for (let k = desde; k < hasta && k < n; k++) if (a[k] !== '\n') a[k] = ' ';
        };
        let i = 0;
        while (i < n) {
            const c = src[i], d = src[i + 1];
            if (c === '/' && d === '/') {
                let j = src.indexOf('\n', i); if (j < 0) j = n;
                tapa(i, j); i = j; continue;
            }
            if (c === '/' && d === '*') {
                let j = src.indexOf('*/', i + 2); j = (j < 0) ? n : j + 2;
                tapa(i, j); i = j; continue;
            }
            if (c === '"' || c === '\'' || c === '`') {
                let k = i + 1;
                while (k < n) {
                    if (src[k] === '\\') { k += 2; continue; }
                    if (src[k] === c) { k++; break; }
                    if (c !== '`' && src[k] === '\n') break;
                    k++;
                }
                tapa(i, k); i = k; continue;
            }
            i++;
        }
        return a.join('');
    }

    function sscDesdoblaLineas(src) {
        const s = String(src || '');
        const m = sscMascaraCodigo(s);

        const info = {};
        {
            const pila = [];
            let prevCh = '';
            let prevWord = '';
            let palabra = '';
            const sigTras = (j, cuantos) => {
                let r = '';
                for (let k = j + 1; k < m.length && r.length < cuantos; k++) {
                    if (!/\s/.test(m[k])) r += m[k];
                }
                return r;
            };
            for (let i = 0; i < m.length; i++) {
                const mc = m[i];
                if (mc === '(' || mc === '[') pila.push({ ch: mc });
                else if (mc === '{') {
                    const bloque = prevCh === ')' || prevCh === '>' || prevCh === '{'
                        || prevCh === '}' || prevCh === ';' || prevCh === ''
                        || /^(else|try|finally|do)$/.test(prevWord);
                    pila.push({ ch: '{', i, bloque, comas: 0 });
                } else if (mc === ')' || mc === ']') pila.pop();
                else if (mc === '}') {
                    const abre = pila.pop();
                    if (abre && abre.ch === '{') {
                        let tipo = abre.bloque ? 'b' : 'o';
                        if (tipo === 'o' && abre.comas >= 1) {
                            const tras = sigTras(i, 3);
                            const destructuring = tras.charAt(0) === '='
                                && tras.charAt(1) !== '=';
                            const parametros = tras.charAt(0) === ')'
                                && (tras.slice(1, 3) === '=>' || tras.charAt(1) === '{');
                            if (!destructuring && !parametros) tipo = 'O';
                        }
                        info[abre.i] = tipo;
                    }
                } else if (mc === ',') {
                    const top = pila[pila.length - 1];
                    if (top && top.ch === '{') top.comas++;
                }
                if (/[A-Za-z_$0-9]/.test(mc)) palabra += mc;
                else if (palabra) { prevWord = palabra; palabra = ''; }
                if (!/\s/.test(mc)) prevCh = mc;
            }
        }

        let out = '';
        let paren = 0;
        const pila = [];

        const salta = () => { if (!/(^|\n)[ \t]*$/.test(out)) out += '\n'; };
        const restoLinea = (i) => {
            let j = i + 1, r = '';
            while (j < m.length && m[j] !== '\n') { r += m[j]; j++; }
            return r;
        };

        for (let i = 0; i < s.length; i++) {
            const c = s[i];
            const mc = m[i];

            if (mc === '{') {
                const tipo = info[i] || 'o';
                pila.push(tipo);
                out += c;
                if ((tipo === 'b' || tipo === 'O') && restoLinea(i).trim()) salta();
            } else if (mc === '}') {
                const tipo = pila.pop() || 'o';
                if (tipo === 'b' || tipo === 'O') salta();
                out += c;
                if (tipo === 'b') {
                    const resto = restoLinea(i);
                    if (resto.trim() && !/^\s*(else|catch|finally|while)\b/.test(resto) && !/^\s*[)\],;.]/.test(resto)) salta();
                }
            } else if (mc === ',') {
                out += c;
                if (pila[pila.length - 1] === 'O' && restoLinea(i).trim()) salta();
            } else {
                if (mc === '(' || mc === '[') paren++;
                else if (mc === ')' || mc === ']') paren = Math.max(0, paren - 1);
                out += c;
                if (mc === ';' && paren === 0 && pila.indexOf('o') === -1 && pila.indexOf('O') === -1 && restoLinea(i).trim()) salta();
            }
        }
        return out;
    }

    function formatScriptContent() {
        if (!editor) return;
        const src = sscDesdoblaLineas(editor.getValue());
        const lines = src.split('\n');
        const out = [];
        let depth = 0;
        let inBlockComment = false;
        let inTemplate = false;

        for (let li = 0; li < lines.length; li++) {
            const raw = lines[li];
            const trimmed = raw.trim();

            if (inTemplate) {
                out.push(raw);
                inTemplate = !templateCloses(raw);
                continue;
            }
            if (inBlockComment) {
                out.push('  '.repeat(depth) + (trimmed.startsWith('*') ? ' ' + trimmed : trimmed));
                if (/\*\//.test(trimmed)) inBlockComment = false;
                continue;
            }

            const code = stripLineForBalance(trimmed);
            const opens = (code.match(/[({[]/g) || []).length;
            const closes = (code.match(/[)}\]]/g) || []).length;
            const leading = /^[)}\]]/.test(code) ? 1 : 0;
            const level = Math.max(0, depth - leading);

            out.push(trimmed ? '  '.repeat(level) + trimmed : '');
            const neto = opens - closes;
            depth = Math.max(0, depth + (neto > 0 ? 1 : (neto < 0 ? -1 : 0)));

            if (/\/\*(?!.*\*\/)/.test(trimmed)) inBlockComment = true;
            if (templateOpens(code)) inTemplate = true;
        }

        const formatted = out.join('\n');
        if (formatted === src) return;
        editor.operation(() => {
            editor.replaceRange(
                formatted,
                { line: 0, ch: 0 },
                { line: editor.lineCount(), ch: 0 }
            );
        });
    }

    function stripLineForBalance(s) {
        return String(s || '')
            .replace(/'(?:\\.|[^'\\])*'/g, "''")
            .replace(/"(?:\\.|[^"\\])*"/g, '""')
            .replace(/`(?:\\.|[^`\\])*`/g, '``')
            .replace(/\/\*[\s\S]*?\*\//g, ' ')
            .replace(/\/\/.*$/, '');
    }

    function templateOpens(code) {
        const ticks = (String(code || '').replace(/\\`/g, '').match(/`/g) || []).length;
        return ticks % 2 === 1;
    }

    function templateCloses(rawLine) {
        const ticks = (String(rawLine || '').replace(/\\`/g, '').match(/`/g) || []).length;
        return ticks % 2 === 1;
    }

    function handleToolbarFormat() {
        formatScriptContent();
    }

    function handleModalExit() {
        const modal = document.getElementById('nsft-ssc-modal');
        if (modal) {
            modal.remove();
            dispatchLayoutUpdate();
        }
    }

    function updateResultsToggleUI() {
        const btn = document.getElementById('nsft-ssc-tool-results-toggle');
        const rp = document.querySelector('.nsft-ssc-results-panel');
        if (btn && rp) btn.classList.toggle('is-active', !rp.classList.contains('nsft-ssc-panel-collapsed'));
    }










    const BULK_CONCURRENCY = 6;
    const BULK_FLUSH = 60;
    const BULK_AVG_KB = 10;
    let _bulkCancel = false;
    let _bulkRunning = false;








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



    const SSC_FETCHER_DEST = 'fetcher_ssc';
    const SSC_EXTENSION_DEST = 'extension_ssc';

    const SSC_CANDIDATOS = [
        { alias: 'record', path: 'N/record' }, { alias: 'search', path: 'N/search' },
        { alias: 'query', path: 'N/query' }, { alias: 'runtime', path: 'N/runtime' },
        { alias: 'currentRecord', path: 'N/currentRecord' }, { alias: 'url', path: 'N/url' },
        { alias: 'format', path: 'N/format' }, { alias: 'log', path: 'N/log' },
        { alias: 'error', path: 'N/error' }, { alias: 'https', path: 'N/https' },
        { alias: 'http', path: 'N/http' }, { alias: 'util', path: 'N/util' },
        { alias: 'xml', path: 'N/xml' }, { alias: 'action', path: 'N/action' },
        { alias: 'dataset', path: 'N/dataset' }, { alias: 'workbook', path: 'N/workbook' },
        { alias: 'transaction', path: 'N/transaction' }, { alias: 'email', path: 'N/email' },
        { alias: 'translation', path: 'N/translation' }, { alias: 'recordContext', path: 'N/recordContext' },
        { alias: 'dialog', path: 'N/ui/dialog' }, { alias: 'message', path: 'N/ui/message' }
    ];

    const SSC_ESCRITURAS = [
        { re: /\.save\s*\(/, que: 'record.save' },
        { re: /\.submitFields\s*\(/, que: 'record.submitFields' },
        { re: /record\s*\.\s*delete\s*\(/, que: 'record.delete' },
        { re: /record\s*\.\s*(attach|detach)\s*\(/, que: 'record.attach' },
        { re: /transaction\s*\.\s*void\s*\(/, que: 'transaction.void' },
        { re: /email\s*\.\s*send(Bulk)?\s*\(/, que: 'email.send' },
        { re: /\.execute(Bulk)?\s*\(/, que: 'action.execute' }
    ];

    let _sscToken = 0;
    let _sscBridge = false;
    let _sscBridgeListo = false;
    const _sscBridgeCola = [];
    let _sscDisponibles = null;
    let _sscT0 = 0;

    function sscI18n(k, f, subs) {
        let out = '';
        try { out = chrome.i18n.getMessage(k, subs) || ''; } catch (e) { out = ''; }
        if (!out) {
            out = f;
            (subs || []).forEach((v, i) => { out = out.split('$' + (i + 1)).join(String(v)); });
        }
        return out;
    }

    function sscEnsureBridge() {
        if (_sscBridge) return;
        _sscBridge = true;
        try {
            const s = document.createElement('script');
            s.id = 'nsft-ssc-fetcher';
            s.async = false;
            s.src = chrome.runtime.getURL('scripts/modules/suitescript_console/suitescript_console_fetcher.js');
            s.onload = function () {
                this.remove();
                _sscBridgeListo = true;
                while (_sscBridgeCola.length) window.postMessage(_sscBridgeCola.shift(), '*');
            };
            s.onerror = function () { this.remove(); };
            (document.head || document.documentElement).appendChild(s);
        } catch (e) {
            sscPinta({ error: { name: 'Inject', message: sscI18n('ssc_err_bridge', 'The bridge could not be injected.'), stack: '' }, logs: [], ms: 0 });
        }
    }

    function sscPost(msg) {
        sscEnsureBridge();
        if (_sscBridgeListo) window.postMessage(msg, '*');
        else _sscBridgeCola.push(msg);
    }

    let _sscLintLinea = null;

    function sscLintLimpia() {
        if (_sscLintLinea != null && editor) {
            try { editor.removeLineClass(_sscLintLinea, 'background', 'nsft-ssc-line-error'); } catch (e) { }
        }
        _sscLintLinea = null;
        const bar = document.getElementById('nsft-ssc-lint');
        if (bar && !bar.hidden) {
            bar.hidden = true;
            if (editor) editor.refresh();
        }
    }

    function sscLintPinta(mensaje, linea) {
        sscLintLimpia();
        const bar = document.getElementById('nsft-ssc-lint');
        if (!bar) return;
        const txt = bar.querySelector('.nsft-ssc-lint-msg');
        if (txt) {
            txt.textContent = (linea != null)
                ? sscI18n('ssc_lint_en_linea', 'Line $1: $2', [String(linea + 1), mensaje])
                : mensaje;
        }
        const estabaOculta = bar.hidden;
        bar.hidden = false;
        if (estabaOculta && editor) editor.refresh();
        bar.dataset.line = (linea != null) ? String(linea) : '';
        if (linea != null && editor) {
            try {
                editor.addLineClass(linea, 'background', 'nsft-ssc-line-error');
                _sscLintLinea = linea;
            } catch (e) { }
        }
    }


    function sscGhostMenuCierra() {
        const m = document.getElementById('nsft-ssc-ghost-menu');
        if (m) m.remove();
    }

    window.NSFT_GhostMenu = {
        abre: (btn) => sscGhostMenuAbre(btn),
        cierra: () => sscGhostMenuCierra()
    };

    function sscGhostMenuAbre(btn) {
        sscGhostMenuCierra();
        chrome.storage.local.get({ nsft_ai_configs: {}, suitescriptConsoleAiModel: '' }, (st) => {
            const cfgs = st.nsft_ai_configs || {};
            const actual = String(st.suitescriptConsoleAiModel || '');
            const FAST = window.NSFT_AI_FAST || { nombres: {}, rapidos: {} };

            const menu = document.createElement('div');
            menu.id = 'nsft-ssc-ghost-menu';
            menu.className = 'nsft-ssc-ghost-menu';

            const titulo = document.createElement('div');
            titulo.className = 'nsft-ssc-ghost-menu-title';
            titulo.textContent = chrome.i18n.getMessage('sscAiModelLabel') || 'Modelo para sugerencias:';
            menu.appendChild(titulo);

            const nota = document.createElement('div');
            nota.className = 'nsft-ssc-ghost-menu-note';
            nota.textContent = chrome.i18n.getMessage('sscAiModelOnlyFast')
                || 'Sólo los modelos rápidos, aptos para completar mientras escribes.';
            menu.appendChild(nota);

            const item = (valor, texto) => {
                const el = document.createElement('button');
                el.type = 'button';
                el.className = 'nsft-ssc-ghost-menu-item' + (valor === actual ? ' is-current' : '');
                el.textContent = texto;
                el.addEventListener('click', () => {
                    try { chrome.storage.local.set({ suitescriptConsoleAiModel: valor }); } catch (e) { }
                    sscGhostMenuCierra();
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
                grupo.className = 'nsft-ssc-ghost-menu-group';
                grupo.textContent = (FAST.nombres || {})[pk] || pk;
                menu.appendChild(grupo);
                lista.forEach((m) => item(pk + '::' + m, m));
            });

            const modal = document.getElementById('nsft-ssc-modal');
            (modal || document.body).appendChild(menu);

            const r = btn.getBoundingClientRect();
            menu.style.top = (r.bottom + 6) + 'px';
            menu.style.left = Math.max(8, Math.min(r.left, window.innerWidth - menu.offsetWidth - 8)) + 'px';

            const fuera = (e) => {
                if (menu.contains(e.target)) return;
                sscGhostMenuCierra();
                document.removeEventListener('mousedown', fuera, true);
                document.removeEventListener('keydown', tecla, true);
            };
            const tecla = (e) => {
                if (e.key !== 'Escape') return;
                e.preventDefault();
                e.stopPropagation();
                sscGhostMenuCierra();
                document.removeEventListener('mousedown', fuera, true);
                document.removeEventListener('keydown', tecla, true);
            };
            document.addEventListener('mousedown', fuera, true);
            document.addEventListener('keydown', tecla, true);
        });
    }


    function sscDetectaEscrituras(codigo) {
        const limpio = String(codigo || '')
            .replace(/\/\*[\s\S]*?\*\//g, ' ')
            .replace(/\/\/.*$/gm, ' ')
            .replace(/'(?:\\.|[^'\\])*'/g, "''")
            .replace(/"(?:\\.|[^"\\])*"/g, '""')
            .replace(/`(?:\\.|[^`\\])*`/g, '``');
        const out = [];
        SSC_ESCRITURAS.forEach((w) => { if (w.re.test(limpio) && out.indexOf(w.que) < 0) out.push(w.que); });
        return out;
    }

    function sscEjecutar() {
        if (!editor) return;
        if (_runPhase !== 'idle') {
            logToToolbar(sscI18n('ssc_already_running', 'Ya hay algo en marcha.'), 'warning');
            return;
        }
        if (sscAiVivo()) {
            if (_sscAiReq.running) {
                logToToolbar(sscI18n('ssc_already_running', 'Ya hay algo en marcha.'), 'warning');
                return;
            }
            const id = _sscAiReq.id;
            _sscAiReq = null;
            sscAiResultado({ id, ok: false, cancelled: true, text: sscI18n('ssc_cancelled', 'Cancelado.') });
        }
        const codigo = editor.getValue();
        if (!codigo.trim()) return;

        const riesgos = sscDetectaEscrituras(codigo);
        if (riesgos.length) { sscConfirmar(riesgos, codigo); return; }
        sscLanzar(codigo);
    }

    function sscLanzar(codigo) {
        _sscT0 = Date.now();
        _lastRunQuery = codigo;
        switchPanelTab('results');
        setRunState('running');
        addToHistory(codigo);
        logToToolbar(sscI18n('ssc_running', 'Ejecutando…'), 'info');
        sscPintaMensaje(sscI18n('ssc_running', 'Ejecutando…'));
        const previos = SSC_CANDIDATOS.filter((c) => !_sscDisponibles || _sscDisponibles.indexOf(c.path) >= 0);
        sscPost({
            dest: SSC_FETCHER_DEST, type: 'run',
            payload: { code: codigo, token: ++_sscToken, preload: previos }
        });
    }

    window.addEventListener('message', function (e) {
        if (e.source !== window) return;
        const d = e.data;
        if (!d || typeof d !== 'object' || d.dest !== SSC_EXTENSION_DEST) return;
        const p = d.payload || {};
        if (d.type !== 'result') return;
        if (_sscAiReq && _sscAiReq.running && p.token === _sscAiReq.token) {
            sscResuelveAi(p, (p.ms != null) ? p.ms : (Date.now() - _sscAiReq.t0));
            return;
        }
        if (p.token !== _sscToken) return;
        const ms = (p.ms != null) ? p.ms : (Date.now() - _sscT0);
        setRunState(p.error ? 'error' : 'ok', { ms });
        sscPinta(p);
    });

    let _sscAiReq = null;

    function sscAiVivo() {
        if (!_sscAiReq) return false;
        if (_sscAiReq.running && (Date.now() - (_sscAiReq.t0 || 0)) > 305000) {
            _sscAiReq = null;
            return false;
        }
        return true;
    }

    function sscLanzarSilencioso(codigo) {
        if (!_sscAiReq) return;
        _sscAiReq.running = true;
        _sscAiReq.t0 = Date.now();
        _sscAiReq.token = ++_sscToken;
        const previos = SSC_CANDIDATOS.filter((c) => !_sscDisponibles || _sscDisponibles.indexOf(c.path) >= 0);
        sscPost({
            dest: SSC_FETCHER_DEST, type: 'run',
            payload: { code: codigo, token: _sscAiReq.token, preload: previos }
        });
    }

    function sscPublicaContextoAi() {
        try {
            const cat = SSC_ED ? SSC_ED.estado() : { members: {}, subs: {}, retornos: {} };
            window.NSFT_SSC_AI_CTX = {
                available: SSC_CANDIDATOS
                    .filter((c) => !_sscDisponibles || _sscDisponibles.indexOf(c.path) >= 0)
                    .map((c) => ({ alias: c.alias, path: c.path })),
                members: cat.members,
                subs: cat.subs,
                tipos: _sscTipos,
                retornos: cat.retornos,
                ss1: _sscNlapi.length
            };
            window.dispatchEvent(new CustomEvent('nsft-ssc-ai-ctx-ready'));
        } catch (e) { }
    }

    function sscAiResultado(detail) {
        try {
            window.dispatchEvent(new CustomEvent('nsft-ssc-ai-exec-result', { detail }));
        } catch (e) { }
    }

    function sscResuelveAi(p, ms) {
        if (!_sscAiReq) return;
        const id = _sscAiReq.id;
        _sscAiReq = null;
        const parts = [];
        (p.logs || []).forEach((l) => {
            parts.push('[' + (l.level || 'log') + '] ' + (l.parts || []).map(sscFormatea).join(' '));
        });
        if (p.error) {
            parts.push((p.error.name || 'Error') + ': ' + (p.error.message || ''));
            if (p.error.stack) parts.push(String(p.error.stack).slice(0, 1500));
        } else {
            parts.push(sscFormatea(p.value));
        }
        sscAiResultado({
            id,
            ok: !p.error,
            ms,
            text: parts.join('\n').slice(0, 12000)
        });
    }

    window.addEventListener('nsft-ssc-ai-exec', function (e) {
        const d = e && e.detail;
        if (!d || !d.id || !d.code || !String(d.code).trim()) return;
        if (_runPhase !== 'idle' || sscAiVivo()) {
            sscAiResultado({ id: d.id, ok: false, busy: true, text: sscI18n('ssc_already_running', 'Something is already running.') });
            return;
        }
        _sscAiReq = { id: d.id };
        const raw = String(d.code);
        const riesgos = sscDetectaEscrituras(raw);
        if (riesgos.length) { sscConfirmar(riesgos, raw); return; }
        sscLanzarSilencioso(raw);
    });


    function sscOut() { return document.getElementById('nsft-ssc-output'); }

    function sscPintaMensaje(txt) {
        const o = sscOut();
        if (!o) return;
        o.innerHTML = '';
        const d = document.createElement('div');
        d.className = 'nsft-ssc-out-empty';
        d.textContent = txt;
        o.appendChild(d);
        paintClearResultsBtn();
        sscFiltraSalida();
    }

    function sscPintaModulos(ok, no) {
        const el = document.getElementById('nsft-ssc-mods');
        if (!el) return;
        el.textContent = sscI18n('ssc_mods', '$1 modules', [String(ok.length)]);
        const nombres = SSC_CANDIDATOS.filter((c) => ok.indexOf(c.path) >= 0).map((c) => c.alias);
        const tipos = Object.keys(_sscTipos || {})
            .map((t) => t + ' (' + (_sscTipos[t] || []).length + ')');
        el.title = nombres.join(', ')
            + (no.length ? '\n\n' + sscI18n('ssc_mods_no', 'Not available here:') + ' ' + no.join(', ') : '')
            + (tipos.length ? '\n\n' + sscI18n('ssc_types_measured', 'Measured types:') + ' ' + tipos.join(', ') : '');
    }

    function sscHora(ms) {
        const d = new Date(ms);
        const dos = (n) => String(n).padStart(2, '0');
        return dos(d.getHours()) + ':' + dos(d.getMinutes()) + ':' + dos(d.getSeconds())
            + '.' + String(Math.floor(d.getMilliseconds() / 100));
    }

    function sscValorNodo(n, crudo) {
        const span = document.createElement('span');
        if (!n || typeof n !== 'object') {
            span.className = 'nsft-ssc-v-void';
            span.textContent = String(n);
            return span;
        }
        if (n.t === 'string') {
            const s = String(n.v);
            const multi = s.indexOf('\n') >= 0;
            span.className = crudo ? 'nsft-ssc-v-raw'
                : (multi ? 'nsft-ssc-v-str nsft-ssc-v-multi' : 'nsft-ssc-v-str');
            span.textContent = (crudo || multi) ? s : sscFormatea(n);
            return span;
        }
        if (n.t === 'number' || n.t === 'boolean') { span.className = 'nsft-ssc-v-num'; span.textContent = sscFormatea(n); return span; }
        if (n.t === 'null' || n.t === 'undefined' || n.t === 'corte') {
            span.className = 'nsft-ssc-v-void'; span.textContent = sscFormatea(n); return span;
        }
        if (n.t !== 'object' && n.t !== 'array') { span.className = 'nsft-ssc-v-meta'; span.textContent = sscFormatea(n); return span; }

        const claves = (n.t === 'array')
            ? (n.v || []).map((_, i) => String(i))
            : Object.keys(n.v || {});
        const caja = document.createElement('span');
        caja.className = 'nsft-ssc-obj';

        const cab = document.createElement('button');
        cab.type = 'button';
        cab.className = 'nsft-ssc-disc';
        cab.setAttribute('aria-expanded', 'true');
        const car = document.createElement('span');
        car.className = 'nsft-ssc-caret';
        car.textContent = '▾';
        const nom = document.createElement('span');
        nom.className = 'nsft-ssc-v-meta';
        nom.textContent = (n.t === 'array')
            ? 'Array(' + (n.len != null ? n.len : claves.length) + ')'
            : ((n.ctor && n.ctor !== 'Object') ? n.ctor : 'Object');
        const cuenta = document.createElement('span');
        cuenta.className = 'nsft-ssc-v-faint';
        cuenta.textContent = (n.t === 'array')
            ? sscI18n('ssc_out_items', '$1 items', [String(claves.length)])
            : sscI18n('ssc_out_keys', '$1 keys', [String(claves.length)]);
        cab.appendChild(car); cab.appendChild(nom); cab.appendChild(cuenta);
        caja.appendChild(cab);

        if (!claves.length) return caja;

        const tabla = document.createElement('div');
        tabla.className = 'nsft-ssc-kv';
        claves.forEach((k) => {
            const ck = document.createElement('span');
            ck.className = 'nsft-ssc-k';
            ck.textContent = k;
            const bruto = (n.t === 'array') ? (n.v || [])[Number(k)] : (n.v || {})[k];
            let cv;
            if (bruto && typeof bruto === 'object' && (bruto.t === 'object' || bruto.t === 'array')) {
                cv = document.createElement('span');
                cv.className = 'nsft-ssc-v-meta';
                cv.textContent = sscFormatea(bruto);
            } else {
                cv = sscValorNodo(bruto);
            }
            tabla.appendChild(ck);
            tabla.appendChild(cv);
        });
        caja.appendChild(tabla);
        cab.addEventListener('click', () => {
            const abierto = cab.getAttribute('aria-expanded') === 'true';
            cab.setAttribute('aria-expanded', abierto ? 'false' : 'true');
        });
        if (n.cortado) {
            const mas = document.createElement('span');
            mas.className = 'nsft-ssc-v-faint';
            mas.textContent = '…';
            tabla.appendChild(document.createElement('span'));
            tabla.appendChild(mas);
        }
        return caja;
    }

    function sscFila(kind, ms) {
        const row = document.createElement('div');
        row.className = 'nsft-ssc-oline is-' + kind;
        row.dataset.kind = kind;
        const t = document.createElement('span');
        t.className = 'nsft-ssc-oline-t';
        t.textContent = (ms != null) ? sscHora(ms) : '';
        const c = document.createElement('div');
        c.className = 'nsft-ssc-oline-c';
        row.appendChild(t);
        row.appendChild(c);
        return { row, c };
    }

    function sscChipLinea(c, linea) {
        if (linea == null) return;
        const chip = document.createElement('span');
        chip.className = 'nsft-ssc-ochip';
        chip.textContent = sscI18n('ssc_out_at_line', 'line $1', [String(linea)]);
        const cab = c.querySelector('.nsft-ssc-disc');
        (cab || c).appendChild(chip);
    }

    function sscPinta(p) {
        const o = sscOut();
        if (!o) return;
        o.innerHTML = '';

        const cons = document.createElement('div');
        cons.className = 'nsft-ssc-console';
        o.appendChild(cons);

        const finMs = (p.ms != null) ? (_sscT0 + p.ms) : Date.now();

        (p.logs || []).forEach((l) => {
            const nivel = (l.level === 'error' || l.level === 'warn') ? l.level : 'log';
            const { row, c } = sscFila(nivel, l.t);
            const partes = l.parts || [];
            const soloObjeto = partes.length === 1 && partes[0] && typeof partes[0] === 'object'
                && (partes[0].t === 'object' || partes[0].t === 'array');
            if (soloObjeto) row.classList.add('is-obj');
            partes.forEach((n) => c.appendChild(sscValorNodo(n, true)));
            sscChipLinea(c, l.line);
            cons.appendChild(row);
        });

        if (p.error) {
            const { row, c } = sscFila('error', finMs);
            row.classList.add('is-obj');
            const box = document.createElement('div');
            box.className = 'nsft-ssc-err';
            const t = document.createElement('div');
            t.className = 'nsft-ssc-err-title';
            t.textContent = (p.error.name || 'Error') + ': ' + (p.error.message || '');
            box.appendChild(t);
            if (p.error.line != null) {
                const dl = document.createElement('div');
                dl.className = 'nsft-ssc-err-line';
                dl.textContent = sscI18n('ssc_out_at_line', 'line $1', [String(p.error.line)]);
                box.appendChild(dl);
            }
            if (p.error.stack) {
                const st = document.createElement('div');
                let formateada = false;
                const LF = window.NSFT_LogFormat;
                if (LF && typeof LF.renderInto === 'function') {
                    try {
                        if (typeof LF.ensureTheme === 'function') {
                            LF.ensureTheme(_nsftResolveTheme() === 'dark' ? 'atom-one-dark' : 'atom-one-light');
                        }
                        formateada = !!LF.renderInto(st, p.error.stack);
                    } catch (err) { formateada = false; }
                }
                if (!formateada) {
                    st.className = 'nsft-ssc-err-stack';
                    st.textContent = p.error.stack;
                }
                box.appendChild(st);
            }
            c.appendChild(box);
            cons.appendChild(row);
            logToToolbar((p.error.name || 'Error') + ': ' + (p.error.message || ''), 'error');
            updateLastHistoryEntry({
                status: 'error',
                durationMs: (p.ms != null) ? p.ms : (Date.now() - _sscT0),
                errorMsg: (p.error.name || 'Error') + ': ' + (p.error.message || '')
            });
            addRunLog({
                status: 'error',
                query: _lastRunQuery,
                durationMs: (p.ms != null) ? p.ms : (Date.now() - _sscT0),
                errorMsg: (p.error.name || 'Error') + ': ' + (p.error.message || ''),
                errorDetail: p.error.stack || '',
                errorLine: (p.error.line != null) ? p.error.line : null
            }, { reveal: true });
        } else {
            const vacio = !p.value || p.value.t === 'undefined' || p.value.t === 'null';
            const { row, c } = sscFila('return', finMs);
            const objeto = p.value && (p.value.t === 'object' || p.value.t === 'array'
                || (p.value.t === 'string' && String(p.value.v).indexOf('\n') >= 0));
            if (objeto) row.classList.add('is-obj');
            c.appendChild(sscValorNodo(p.value));
            const nota = document.createElement('span');
            nota.className = 'nsft-ssc-onote';
            nota.textContent = vacio
                ? sscI18n('ssc_out_ret_void', 'the script returned nothing')
                : sscI18n('ssc_out_ret', 'script return value');
            c.appendChild(nota);
            cons.appendChild(row);
            logToToolbar(sscI18n('ssc_logs_ok', 'Script ejecutado'), 'success');
            updateLastHistoryEntry({
                status: 'ok',
                durationMs: (p.ms != null) ? p.ms : (Date.now() - _sscT0),
                errorMsg: null
            });
            addRunLog({
                status: 'ok',
                query: _lastRunQuery,
                durationMs: (p.ms != null) ? p.ms : (Date.now() - _sscT0)
            });
        }

        const pie = document.createElement('div');
        pie.className = 'nsft-ssc-out-foot';
        const ms = (p.ms != null) ? p.ms : (Date.now() - _sscT0);
        pie.textContent = sscI18n('ssc_took', 'Took $1 ms', [String(ms)]);
        if (p.missing && p.missing.length) {
            pie.textContent += ' · ' + sscI18n('ssc_mods_missing', 'Could not load: $1', [p.missing.join(', ')]);
        }
        o.appendChild(pie);
        paintClearResultsBtn();
        sscFiltraSalida();
    }

    let _sscOutFilter = 'all';

    function sscDesmarca(root) {
        root.querySelectorAll('mark.nsft-ssc-hl').forEach((mk) => {
            const p = mk.parentNode;
            if (!p) return;
            p.replaceChild(document.createTextNode(mk.textContent), mk);
            p.normalize();
        });
    }

    function sscMarcaEn(root, term) {
        const TS = window.NSFT_TextSearch;
        if (!TS) return;
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
        const hits = [];
        let node;
        while ((node = walker.nextNode())) {
            if (node.nodeValue && TS.ranges(node.nodeValue, term).length) hits.push(node);
        }
        hits.forEach((tn) => {
            const t = tn.nodeValue;
            const tramos = TS.ranges(t, term);
            if (!tramos.length || !tn.parentNode) return;
            const frag = document.createDocumentFragment();
            let from = 0;
            tramos.forEach((r) => {
                if (r.start > from) frag.appendChild(document.createTextNode(t.slice(from, r.start)));
                const mk = document.createElement('mark');
                mk.className = 'nsft-ssc-hl';
                mk.textContent = t.slice(r.start, r.end);
                frag.appendChild(mk);
                from = r.end;
            });
            if (from < t.length) frag.appendChild(document.createTextNode(t.slice(from)));
            tn.parentNode.replaceChild(frag, tn);
        });
    }

    function sscFiltraSalida() {
        const o = sscOut();
        if (!o) return;
        const q = (document.getElementById('nsft-ssc-out-filter') || {}).value || '';
        const term = tsFold(q.trim());
        const filas = o.querySelectorAll('.nsft-ssc-oline');
        let visibles = 0;
        const cuenta = { all: 0, log: 0, error: 0 };

        filas.forEach((f) => {
            const kind = f.dataset.kind || 'log';
            cuenta.all++;
            if (kind === 'log' || kind === 'warn') cuenta.log++;
            if (kind === 'error') cuenta.error++;

            const porTipo = (_sscOutFilter === 'all')
                || (_sscOutFilter === 'log' && (kind === 'log' || kind === 'warn'))
                || (_sscOutFilter === 'error' && kind === 'error');
            const porTexto = !term || tsFold(f.textContent).includes(term);
            const ver = porTipo && porTexto;
            f.hidden = !ver;
            if (ver) visibles++;

            sscDesmarca(f);
            if (ver && term) sscMarcaEn(f, term);
        });

        const seg = document.getElementById('nsft-ssc-out-seg');
        if (seg) {
            seg.querySelectorAll('.nsft-ssc-out-segbtn').forEach((b) => {
                const k = b.dataset.outFilter;
                const n = b.querySelector('b');
                if (n) n.textContent = String(cuenta[k] != null ? cuenta[k] : 0);
                const act = (k === _sscOutFilter);
                b.classList.toggle('is-active', act);
                b.setAttribute('aria-pressed', act ? 'true' : 'false');
            });
        }

        let aviso = o.querySelector('.nsft-ssc-out-nomatch');
        if (filas.length && !visibles) {
            if (!aviso) {
                aviso = document.createElement('div');
                aviso.className = 'nsft-ssc-out-empty nsft-ssc-out-nomatch';
                aviso.textContent = sscI18n('ssc_out_nomatch', 'Nothing matches the filter.');
                const cons = o.querySelector('.nsft-ssc-console');
                (cons || o).appendChild(aviso);
            }
        } else if (aviso) {
            aviso.remove();
        }
    }

    function sscWireFiltroSalida() {
        const seg = document.getElementById('nsft-ssc-out-seg');
        if (seg && !seg.dataset.wired) {
            seg.dataset.wired = '1';
            seg.addEventListener('click', (e) => {
                const b = e.target.closest('.nsft-ssc-out-segbtn');
                if (!b) return;
                _sscOutFilter = b.dataset.outFilter || 'all';
                sscFiltraSalida();
            });
        }
        const inp = document.getElementById('nsft-ssc-out-filter');
        if (inp && !inp.dataset.wired) {
            inp.dataset.wired = '1';
            inp.addEventListener('input', sscFiltraSalida);
        }
        wireFindClear('nsft-ssc-out-filter');
    }

    function sscFormatea(n, prof) {
        prof = prof || 0;
        if (!n || typeof n !== 'object') return String(n);
        const sangria = '  '.repeat(prof + 1);
        const cierre = '  '.repeat(prof);
        switch (n.t) {
        case 'null': return 'null';
        case 'undefined': return 'undefined';
        case 'string': return JSON.stringify(n.v);
        case 'number': case 'boolean': return n.v;
        case 'function': return '[Function ' + n.v + ']';
        case 'date': return n.v;
        case 'error': return '[' + n.v + ']';
        case 'corte': return '…';
        case 'array': {
            if (!n.v.length) return '[]';
            const filas = n.v.map((x) => sangria + sscFormatea(x, prof + 1));
            if (n.cortado) {
                filas.push(sangria + '… '
                    + sscI18n('ssc_cut_rows', '$1 of $2 shown', [String(n.v.length), String(n.len)]));
            }
            return '[\n' + filas.join(',\n') + '\n' + cierre + ']';
        }
        case 'object': {
            const claves = Object.keys(n.v || {});
            const cab = (n.ctor && n.ctor !== 'Object') ? n.ctor + ' ' : '';
            if (!claves.length) return cab + '{}';
            const filas = claves.map((k) => sangria + k + ': ' + sscFormatea(n.v[k], prof + 1));
            if (n.cortado) filas.push(sangria + '…');
            return cab + '{\n' + filas.join(',\n') + '\n' + cierre + '}';
        }
        default: return String(n.v == null ? '' : n.v);
        }
    }

    function sscConfirmar(riesgos, codigo) {
        switchPanelTab('results');
        const o = sscOut();
        const lanza = () => {
            if (_sscAiReq) {
                sscPintaMensaje(sscI18n('ssc_ai_ran', 'Run from the assistant: the result is in the chat.'));
                sscLanzarSilencioso(codigo);
            } else {
                sscLanzar(codigo);
            }
        };
        if (!o) { lanza(); return; }
        const env = (window.NSFT_ENV && NSFT_ENV.envFromUrl) ? NSFT_ENV.envFromUrl(location.href) : null;
        const esPrd = !!(env && env.code === 'PRD');
        const palabra = sscI18n('ssc_confirm_word', 'RUN');

        o.innerHTML = '';
        const box = document.createElement('div');
        box.className = 'nsft-ssc-confirm' + (esPrd ? ' is-prd' : '');

        const t = document.createElement('div');
        t.className = 'nsft-ssc-confirm-title';
        t.textContent = esPrd
            ? sscI18n('ssc_confirm_prd', 'This writes to PRODUCTION')
            : sscI18n('ssc_confirm', 'This code writes to the account');
        box.appendChild(t);

        const q = document.createElement('div');
        q.className = 'nsft-ssc-confirm-what';
        q.textContent = riesgos.join(' · ');
        box.appendChild(q);

        let input = null;
        if (esPrd) {
            input = document.createElement('input');
            input.type = 'text';
            input.className = 'nsft-ssc-confirm-input';
            input.spellcheck = false;
            input.placeholder = sscI18n('ssc_confirm_type', 'Type $1 to continue', [palabra]);
            box.appendChild(input);
        }

        const fila = document.createElement('div');
        fila.className = 'nsft-ssc-confirm-row';
        const si = document.createElement('button');
        si.type = 'button';
        si.className = 'nsft-ssc-confirm-go';
        si.textContent = sscI18n('ssc_confirm_go', 'Run anyway');
        const no = document.createElement('button');
        no.type = 'button';
        no.className = 'nsft-ssc-confirm-cancel';
        no.textContent = sscI18n('ssc_confirm_cancel', 'Cancel');
        fila.appendChild(si);
        fila.appendChild(no);
        box.appendChild(fila);
        o.appendChild(box);

        const listo = () => !esPrd || (input && input.value.trim().toUpperCase() === palabra.toUpperCase());
        const refresca = () => { si.disabled = !listo(); };
        refresca();
        if (input) {
            input.addEventListener('input', refresca);
            input.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' && listo()) lanza(); });
            setTimeout(() => input.focus(), 30);
        }
        si.addEventListener('click', () => { if (listo()) lanza(); });
        no.addEventListener('click', () => {
            sscPintaMensaje(sscI18n('ssc_cancelled', 'Cancelado.'));
            if (_sscAiReq) {
                const id = _sscAiReq.id;
                _sscAiReq = null;
                sscAiResultado({ id, ok: false, cancelled: true, text: sscI18n('ssc_cancelled', 'Cancelado.') });
            }
        });
    }

    function executeCurrentQuery() {
        sscEjecutar();
    }

    function handleToolbarRun() {
        if (_runPhase !== 'idle') {
            logToToolbar(sscI18n('ssc_already_running', 'Ya hay algo en marcha.'), 'warning');
            return;
        }
        executeCurrentQuery();
    }

    window.addEventListener('nsft-ssc-ai-run', function (e) {
        const code = e && e.detail && e.detail.code;
        if (!code || !String(code).trim()) return;
        if (_runPhase !== 'idle' || (sscAiVivo() && _sscAiReq.running)) {
            logToToolbar(sscI18n('ssc_already_running', 'Ya hay algo en marcha.'), 'warning');
            return;
        }
        const raw = String(code);
        const riesgos = sscDetectaEscrituras(raw);
        if (riesgos.length) { sscConfirmar(riesgos, raw); return; }
        sscLanzar(raw);
    });

    function dispatchLayoutUpdate() {
        window.dispatchEvent(new CustomEvent('nsft-layout-update'));
    }

    function bringToFront() {
        const modal = document.getElementById('nsft-ssc-modal');
        if (!modal) return;
        const stack = window.NSFT_ModalStack;
        if (stack && stack.bringToFront) {
            stack.bringToFront(modal);
        } else {
            const others = document.querySelectorAll('.nsft-rec-obj-modal, .nsft-scripted-rec-modal, .suitescript-console-modal');
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
    const kbd = (combo) => `<span class="nsft-ssc-kbd">${combo}</span>`;

    const getHtmlTemplate = () => `
        <div class="suitescript-console-modal" id="nsft-ssc-modal" data-state="maximised">
            <div class="suitescript-console-header">
                <span id="nsft-ssc-title"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#000000" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 6px; vertical-align: middle;"><rect x="3" y="4" width="18" height="16" rx="2"></rect><polyline points="7 9 10 12 7 15"></polyline><line x1="13" y1="15" x2="17" y2="15"></line></svg>${chrome.i18n.getMessage('ssc_title') || 'SuiteScript Console'}</span>
                <span class="nsft-header-actions">
                    <span id="nsft-ssc-minimise"></span>
                    <span id="nsft-ssc-fullscreen" title="${chrome.i18n.getMessage('sql_fullscreen_enter') || 'Full screen'}"></span>
                    <span id="nsft-ssc-maximise"></span>
                    <span id="nsft-ssc-close">✕</span>
                </span>
                <div class="suitescript-console-header-line"></div>
            </div>
            <div class="suitescript-console-content">
                <div class="nsft-ssc-menubar">
                    <div class="nsft-ssc-menu-item" id="nsft-ssc-menu-file">
                        ${chrome.i18n.getMessage('sql_menu_file') || 'File'}
                        <div class="nsft-ssc-submenu">
                            <div class="nsft-ssc-submenu-item" id="nsft-ssc-action-open"><span>${chrome.i18n.getMessage('sql_submenu_open') || 'Open'}</span>${kbd(KBD_MOD + 'O')}</div>
                            <div class="nsft-ssc-submenu-item" id="nsft-ssc-action-save"><span>${chrome.i18n.getMessage('sql_submenu_save') || 'Save'}</span>${kbd(KBD_MOD + 'S')}</div>
                            <div class="nsft-ssc-submenu-item" id="nsft-ssc-action-save-as"><span>${chrome.i18n.getMessage('sql_submenu_save_as') || 'Save As...'}</span>${kbd(KBD_MOD + KBD_SHIFT + 'S')}</div>
                            <div class="nsft-ssc-submenu-item" id="nsft-ssc-action-export"><span>${chrome.i18n.getMessage('sql_submenu_export') || 'Export'}</span>${kbd(KBD_MOD + KBD_SHIFT + 'D')}</div>
                            <div class="nsft-ssc-submenu-separator"></div>
                            <div class="nsft-ssc-submenu-item" id="nsft-ssc-action-import-json"><span>${chrome.i18n.getMessage('ssc_import_btn') || 'Import JSON'}</span>${kbd(KBD_MOD + KBD_SHIFT + 'G')}</div>
                            <div class="nsft-ssc-submenu-item" id="nsft-ssc-action-export-json"><span>${chrome.i18n.getMessage('ssc_export_btn') || 'Export JSON'}</span>${kbd(KBD_MOD + KBD_SHIFT + 'Y')}</div>
                            <div class="nsft-ssc-submenu-separator"></div>
                            <div class="nsft-ssc-submenu-item" id="nsft-ssc-action-exit"><span>${chrome.i18n.getMessage('sql_submenu_exit') || 'Exit'}</span>${kbd(KBD_MOD + KBD_SHIFT + 'X')}</div>
                        </div>
                    </div>
                    <div class="nsft-ssc-menu-item" id="nsft-ssc-menu-edit">
                        ${chrome.i18n.getMessage('sql_menu_edit') || 'Edit'}
                        <div class="nsft-ssc-submenu">
                            <div class="nsft-ssc-submenu-item" id="nsft-ssc-action-format"><span>${chrome.i18n.getMessage('sql_submenu_format') || 'Format'}</span>${kbd(KBD_MOD + KBD_SHIFT + 'F')}</div>
                            <div class="nsft-ssc-submenu-item" id="nsft-ssc-action-find"><span>${chrome.i18n.getMessage('sql_submenu_find') || 'Find'}</span>${kbd(KBD_MOD + 'F')}</div>
                            <div class="nsft-ssc-submenu-item" id="nsft-ssc-action-autocomplete"><span>${chrome.i18n.getMessage('sql_submenu_autocomplete') || 'Show suggestions'}</span>${kbd(KBD_MOD + 'Space')}</div>
                        </div>
                    </div>
                    <div class="nsft-ssc-menu-item" id="nsft-ssc-menu-run">
                        ${chrome.i18n.getMessage('sql_menu_run') || 'Run'}
                        <div class="nsft-ssc-submenu">
                            <div class="nsft-ssc-submenu-item" id="nsft-ssc-action-run"><span>${chrome.i18n.getMessage('sql_submenu_run') || 'Run'}</span>${kbd(KBD_MOD + KBD_ENTER)}</div>
                        </div>
                    </div>
                    <div class="nsft-ssc-menu-item" id="nsft-ssc-menu-view">
                        ${chrome.i18n.getMessage('sql_menu_view') || 'View'}
                        <div class="nsft-ssc-submenu">
                            <div class="nsft-ssc-submenu-item" id="nsft-ssc-action-view-editor"><span>${chrome.i18n.getMessage('sql_menu_hide_editor') || 'Hide Editor'}</span>${kbd(KBD_MOD + KBD_SHIFT + '1')}</div>
                            <div class="nsft-ssc-submenu-item" id="nsft-ssc-action-view-table"><span>${chrome.i18n.getMessage('ssc_menu_hide_output') || 'Hide Output'}</span>${kbd(KBD_MOD + KBD_SHIFT + '2')}</div>
                        </div>
                    </div>
                    <div class="nsft-ssc-menu-item" id="nsft-ssc-menu-help">
                        ${chrome.i18n.getMessage('sql_menu_help') || 'Help'}
                        <div class="nsft-ssc-submenu">
                            <div class="nsft-ssc-submenu-item" id="nsft-ssc-action-api-docs">${chrome.i18n.getMessage('ssc_submenu_api_docs') || 'SuiteScript API Reference'}</div>
                        </div>
                    </div>
                    <div id="nsft-ssc-logs-container" class="nsft-ssc-logs-container"></div>
                </div>

                <div class="nsft-ssc-toolbar">
                    <div class="nsft-ssc-toolbar-group">
                        <button class="nsft-ssc-toolbar-button nsft-ssc-iconbtn" id="nsft-ssc-tool-open" title="${chrome.i18n.getMessage('sql_submenu_open') || 'Open'} (${KBD_MOD}O)">
                            <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"><path d="M1.5 4.5v8h11l2-5.5H4L2.5 11.5"></path><path d="M1.5 4.5v-1.5h4.5l1.5 1.5h5v1.5"></path></svg>
                        </button>
                        <button class="nsft-ssc-toolbar-button nsft-ssc-iconbtn" id="nsft-ssc-tool-save" title="${chrome.i18n.getMessage('sql_submenu_save') || 'Save'} (${KBD_MOD}S)">
                            <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"><path d="M2 2h9.5L14 4.5V14H2z"></path><path d="M4.5 2v3.5h6V2"></path><path d="M4.5 14v-5h7v5"></path></svg>
                        </button>
                        <button class="nsft-ssc-toolbar-button nsft-ssc-iconbtn nsft-ssc-iconbtn-wide" id="nsft-ssc-tool-save-as" title="${chrome.i18n.getMessage('sql_submenu_save_as') || 'Save As...'} (${KBD_MOD}${KBD_SHIFT}S)">
                            <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"><path d="M2 2h9.5L14 4.5V14H2z"></path><path d="M4.5 2v3.5h6V2"></path><path d="M4.5 14v-5h7v5"></path></svg><span class="nsft-ssc-iconbtn-plus">+</span>
                        </button>
                    </div>
                    <div class="nsft-ssc-toolbar-sep"></div>

                    <button class="nsft-ssc-toolbar-button" id="nsft-ssc-tool-run" title="${chrome.i18n.getMessage('sql_submenu_run') || 'Run'} (${KBD_MOD}${KBD_ENTER})" style="background-color: var(--nsft-ns-accent, #3b82f6); color: white; border-color: var(--nsft-ns-accent-bd, #2563eb);">
                        <span class="nsft-ssc-btn-glyph nsft-ssc-run-glyph">▶</span><span class="nsft-ssc-run-label">${chrome.i18n.getMessage('sql_submenu_run') || 'Run'}</span><span class="nsft-ssc-kbd">${IS_MAC ? '⌘↵' : 'Ctrl+↵'}</span>
                    </button>
                    <div class="nsft-ssc-toolbar-sep"></div>

                    <div class="nsft-ssc-toolbar-group">
                        <button class="nsft-ssc-toolbar-button" id="nsft-ssc-tool-format" title="${chrome.i18n.getMessage('sql_submenu_format') || 'Format'} (${KBD_MOD}${KBD_SHIFT}F)">
                            <span class="nsft-ssc-btn-glyph">≡</span>${chrome.i18n.getMessage('sql_submenu_format') || 'Format'}
                        </button>
                        <div class="nsft-ssc-favorites-wrap">
                            <button class="nsft-ssc-toolbar-button" id="nsft-ssc-tool-snippets" title="${chrome.i18n.getMessage('sql_snippets') || 'Snippets'}">
                                <span class="nsft-ssc-btn-glyph">&lt;/&gt;</span>${chrome.i18n.getMessage('sql_snippets') || 'Snippets'}
                            </button>
                            <div class="nsft-ssc-favorites-menu" id="nsft-ssc-snippets-menu"></div>
                        </div>
                        <div class="nsft-ssc-favorites-wrap">
                            <button class="nsft-ssc-toolbar-button" id="nsft-ssc-tool-favorites" title="${chrome.i18n.getMessage('sql_favorites') || 'Favorites'}">
                                <span class="nsft-ssc-btn-glyph">☆</span>${chrome.i18n.getMessage('sql_favorites') || 'Favorites'}
                            </button>
                            <div class="nsft-ssc-favorites-menu" id="nsft-ssc-favorites-menu"></div>
                        </div>
                    </div>
                    <div class="nsft-ssc-toolbar-spacer"></div>

                    
                    <button class="nsft-ssc-toolbar-button nsft-ssc-iconbtn" id="nsft-ssc-tool-ghost" hidden
                        title="${escapeHtml(chrome.i18n.getMessage('ssc_ghost_btn_title') || 'AI code suggestions — Tab accepts (click to toggle)')}"
                        aria-label="${escapeHtml(chrome.i18n.getMessage('ssc_ghost_btn_title') || 'AI code suggestions')}">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l1.8 4.6 4.7 1.8-4.7 1.8L12 16l-1.8-4.8-4.7-1.8 4.7-1.8z"></path><path d="M4 21h10"></path></svg>
                        <span class="nsft-ssc-ghost-spin" aria-hidden="true"></span>
                    </button>
                    <button class="nsft-ssc-toolbar-button nsft-ssc-iconbtn is-active" id="nsft-ssc-tool-results-toggle" title="${chrome.i18n.getMessage('ssc_results_toggle_title') || 'Show/hide output'}">
                        <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"><rect x="1.5" y="2.5" width="13" height="11" rx="1.5"></rect><path d="M1.5 9.5h13"></path></svg>
                    </button>
                </div>
                
                <div class="nsft-ssc-tabs-row">
                    <button type="button" class="nsft-ssc-tabs-nav" id="nsft-ssc-tabs-prev" hidden
                        title="${escapeHtml(chrome.i18n.getMessage('sql_tabs_scroll_prev') || 'Pestañas anteriores')}"
                        aria-label="${escapeHtml(chrome.i18n.getMessage('sql_tabs_scroll_prev') || 'Pestañas anteriores')}">‹</button>
                    <div class="nsft-ssc-tabs-bar" id="nsft-ssc-tabs-bar"></div>
                    <button type="button" class="nsft-ssc-tabs-nav" id="nsft-ssc-tabs-next" hidden
                        title="${escapeHtml(chrome.i18n.getMessage('sql_tabs_scroll_next') || 'Pestañas siguientes')}"
                        aria-label="${escapeHtml(chrome.i18n.getMessage('sql_tabs_scroll_next') || 'Pestañas siguientes')}">›</button>
                </div>
                <div class="nsft-ssc-workzone">
                    
                    <button type="button" class="nsft-ssc-edge-tab nsft-ssc-edge-tab-ai" id="nsft-ssc-edge-ai"
                        title="${escapeHtml(chrome.i18n.getMessage('ssc_ai_toggle_title') || 'AI')}">${chrome.i18n.getMessage('sql_edge_ai') || 'IA'}</button>
                <div class="nsft-ssc-center">
                    
                    <button type="button" class="nsft-ssc-edge-tab nsft-ssc-edge-tab-results" id="nsft-ssc-edge-results"
                        title="${chrome.i18n.getMessage('ssc_results_toggle_title') || 'Show/hide output'}">${chrome.i18n.getMessage('ssc_tab_output') || 'Salida'}</button>
                <div class="nsft-ssc-main-panel">
                    <div class="nsft-ssc-editor-container">
                        
                        <textarea id="nsft-ssc-query-input" class="nsft-ssc-textarea" spellcheck="false">${escapeHtml(DEFAULT_QUERY)}</textarea>
                        
                        <button type="button" class="nsft-ssc-lint" id="nsft-ssc-lint" hidden>
                            <span class="nsft-ssc-lint-ico" aria-hidden="true">!</span>
                            <span class="nsft-ssc-lint-msg"></span>
                        </button>
                    </div>
                </div>
                <div class="nsft-ssc-resizer" id="nsft-ssc-resizer" title="Drag to resize">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="9" r="1"></circle><circle cx="12" cy="15" r="1"></circle><circle cx="5" cy="9" r="1"></circle><circle cx="5" cy="15" r="1"></circle><circle cx="19" cy="9" r="1"></circle><circle cx="19" cy="15" r="1"></circle></svg>
                </div>
                <div class="nsft-ssc-results-panel">
                    
                    <div class="nsft-ssc-panel-tabs" role="tablist">
                        <button type="button" class="nsft-ssc-panel-tab is-active" data-panel-tab="results"
                            role="tab" aria-selected="true">${chrome.i18n.getMessage('ssc_tab_output') || 'Output'}</button>
                        <button type="button" class="nsft-ssc-panel-tab" data-panel-tab="logs"
                            role="tab" aria-selected="false">
                            <span>${chrome.i18n.getMessage('sql_tab_logs') || 'Logs'}</span>
                            <span class="nsft-ssc-logs-badge" id="nsft-ssc-logs-badge" hidden>0</span>
                        </button>
                        <span class="nsft-ssc-panel-tabs-spacer"></span>
                        
                        <button type="button" class="nsft-ssc-logs-clear" id="nsft-ssc-logs-clear"
                            >${chrome.i18n.getMessage('sql_logs_clear') || 'Clear all'}</button>
                        
                        <button type="button" class="nsft-ssc-panel-close" id="nsft-ssc-results-close"
                            title="${escapeHtml(chrome.i18n.getMessage('sql_panel_close') || 'Cerrar panel')}"
                            aria-label="${escapeHtml(chrome.i18n.getMessage('sql_panel_close') || 'Cerrar panel')}">${CLOSE_SVG}</button>
                    </div>
                    <div class="nsft-ssc-results-toolbar">
                        
                        <div class="nsft-ssc-out-seg" id="nsft-ssc-out-seg" role="group"
                            aria-label="${escapeHtml(chrome.i18n.getMessage('ssc_out_filter_group') || 'Filter output')}">
                            <button type="button" class="nsft-ssc-out-segbtn is-active" data-out-filter="all" aria-pressed="true"
                                >${escapeHtml(chrome.i18n.getMessage('ssc_out_f_all') || 'All')} <b>0</b></button>
                            <button type="button" class="nsft-ssc-out-segbtn" data-out-filter="log" aria-pressed="false"
                                >${escapeHtml(chrome.i18n.getMessage('ssc_out_f_logs') || 'Logs')} <b>0</b></button>
                            <button type="button" class="nsft-ssc-out-segbtn" data-out-filter="error" aria-pressed="false"
                                >${escapeHtml(chrome.i18n.getMessage('ssc_out_f_errors') || 'Errors')} <b>0</b></button>
                        </div>
                        <div class="nsft-ssc-out-find nsft-ssc-find">
                            <span class="nsft-ssc-search-glyph" aria-hidden="true">${SEARCH_SVG}</span>
                            <input id="nsft-ssc-out-filter" class="nsft-ssc-out-filter"
                                placeholder="${escapeHtml(chrome.i18n.getMessage('ssc_out_filter_ph') || 'Filter output…')}"
                                aria-label="${escapeHtml(chrome.i18n.getMessage('ssc_out_filter_ph') || 'Filter output…')}">
                        </div>
                        <div class="nsft-ssc-toolbar-spacer"></div>
                        <span id="nsft-ssc-status-text"></span>
                        <button type="button" id="nsft-ssc-copy-btn" class="nsft-ssc-outbtn" title="${chrome.i18n.getMessage('sql_copy_results_btn') || 'Copy'} (${KBD_MOD}${KBD_SHIFT}C)">
                            <span class="nsft-ssc-btn-glyph">⧉</span><span>${chrome.i18n.getMessage('sql_copy_results_btn') || 'Copy'}</span>
                        </button>
                        
                        <button type="button" id="nsft-ssc-clear-btn" class="nsft-ssc-outbtn nsft-ssc-clear-btn" disabled
                            title="${escapeHtml(chrome.i18n.getMessage('ssc_clear_results_title') || 'Clear the output')}"
                            aria-label="${escapeHtml(chrome.i18n.getMessage('ssc_clear_results_title') || 'Clear the output')}">
                            <svg class="nsft-ssc-btn-ico" viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m7 21-4.3-4.3a2.4 2.4 0 0 1 0-3.4l9.6-9.6a2.4 2.4 0 0 1 3.4 0l5.6 5.6a2.4 2.4 0 0 1 0 3.4L13 21"/><path d="M22 21H7"/><path d="m5 11 9 9"/></svg><span>${chrome.i18n.getMessage('sql_clear_results_btn') || 'Clear results'}</span>
                        </button>
                    </div>
                    
                    <div id="nsft-ssc-run-pill" class="nsft-ssc-run-pill" hidden>
                        <span class="nsft-ui-spinner nsft-ssc-run-pill-spin" aria-hidden="true"></span>
                        <span id="nsft-ssc-run-pill-text"></span>
                    </div>
                    
                    <div id="nsft-ssc-output" class="nsft-ssc-output"></div>
                    
                    <div id="nsft-ssc-logs-view" class="nsft-ssc-logs-view" hidden>
                        <div class="nsft-ssc-logs-side">
                            
                            <div class="nsft-ssc-logs-side-head">
                                <div class="nsft-ssc-logs-side-titlerow">
                                    <span class="nsft-ssc-logs-side-title">${chrome.i18n.getMessage('sql_logs_side_title') || 'History'}</span>
                                    <div class="nsft-ssc-logs-chips" id="nsft-ssc-logs-chips">
                                        <button type="button" class="nsft-ssc-logs-chip is-active" data-log-filter="all">${chrome.i18n.getMessage('sql_logs_chip_all') || 'All'}</button>
                                        <button type="button" class="nsft-ssc-logs-chip" data-log-filter="error">${chrome.i18n.getMessage('sql_logs_chip_errors') || 'Errors'} <b></b></button>
                                        <button type="button" class="nsft-ssc-logs-chip" data-log-filter="ok">${chrome.i18n.getMessage('sql_logs_chip_ok') || 'Successful'} <b></b></button>
                                    </div>
                                    <span class="nsft-ssc-logs-count" id="nsft-ssc-logs-count"></span>
                                </div>
                                <div class="nsft-ssc-logs-filter-wrap nsft-ssc-find">
                                    <span class="nsft-ssc-search-glyph" aria-hidden="true">${SEARCH_SVG}</span>
                                    <input id="nsft-ssc-logs-filter" class="nsft-ssc-logs-filter"
                                        placeholder="${chrome.i18n.getMessage('ssc_logs_filter_ph') || 'Filter by text or error code'}">
                                </div>
                            </div>
                            <div class="nsft-ssc-logs-list" id="nsft-ssc-logs-list" role="list"></div>
                        </div>
                        <div class="nsft-ssc-logs-resizer" id="nsft-ssc-logs-resizer"
                            role="separator" aria-orientation="vertical" tabindex="0"
                            title="${chrome.i18n.getMessage('sql_logs_resize') || 'Drag to resize'}"></div>
                        <div class="nsft-ssc-logs-detail" id="nsft-ssc-logs-detail"></div>
                    </div>
                </div>
                </div>
                </div>
            <div class="suitescript-console-footer">
                <span class="nsft-ssc-footer-left">
                    <span id="nsft-ssc-conn-status" class="nsft-ssc-footer-status">● ${chrome.i18n.getMessage('sql_footer_connected') || 'Connected'}</span>
                    
                    <span id="nsft-ssc-mods" class="nsft-ssc-mods"></span>
                </span>
                <div id="nsft-ssc-editor-stats" class="nsft-ssc-footer-stats">
                    <span class="nsft-ssc-stat-item">Ln 1, Col 1</span>
                    <span class="nsft-ssc-stat-item">Ch 0</span>
                </div>
            </div>
        </div>`;

})();
