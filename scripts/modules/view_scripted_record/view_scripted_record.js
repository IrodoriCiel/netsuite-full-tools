(function () {
    'use strict';
    const STORAGE_KEY = 'enableViewScriptedRecord';
    const NSFT_THEME_KEY = 'nsftTheme';
    let lastMaximizedLeft = null;
    let lastMaximizedTop = null;
    let _nsftTheme = 'light';

    const escapeHtml = (window.NSFT_DOM && window.NSFT_DOM.escapeHtml) || function (v) {
        if (v === null || v === undefined) return '';
        return String(v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    };

    function _nsftResolveTheme() {
        return _nsftTheme === 'dark' ? 'dark' : 'light';
    }
    function _nsftApplyThemeToModal() {
        const m = document.getElementById('nsft-scripted-rec-modal');
        if (m) m.setAttribute('data-theme', _nsftResolveTheme());
    }
    chrome.storage.local.get({ [NSFT_THEME_KEY]: 'light' }, (items) => {
        _nsftTheme = items[NSFT_THEME_KEY] || 'light';
        _nsftApplyThemeToModal();
    });
    chrome.storage.onChanged.addListener((changes, area) => {
        if (area === 'local' && changes[NSFT_THEME_KEY]) {
            _nsftTheme = changes[NSFT_THEME_KEY].newValue || 'light';
            _nsftApplyThemeToModal();
        }
    });

    const STATE = {
        loaded: false,
        minimized: false,
        url: null,
        currentLang: 'es'
    };

    const _srCounts = { user: null, client: null, workflow: null };

    function _srSetTabLabel(id, baseKey, count) {
        const el = document.getElementById(id);
        if (!el) return;
        const base = chrome.i18n.getMessage(baseKey) || baseKey;
        el.textContent = (count == null) ? base : `${base} (${count})`;
    }

    const _RB = window.NSFT_RecordButtons;
    if (_RB && _RB.isExcludedPage && _RB.isExcludedPage()) return;

    let _teardownFns = [];
    let _enabled = false;

    function addCleanup(fn) {
        if (typeof fn === 'function') _teardownFns.push(fn);
    }
    function runTeardown() {
        _teardownFns.forEach(fn => { try { fn(); } catch (e) { } });
        _teardownFns = [];
    }

    chrome.storage.local.get({
        [STORAGE_KEY]: true
    }, (items) => {
        if (!items[STORAGE_KEY]) return;
        _enabled = true;
        init(items);
    });

    chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== 'local' || !changes[STORAGE_KEY]) return;
        const next = !!changes[STORAGE_KEY].newValue;
        if (next === _enabled) return;
        _enabled = next;
        if (_enabled) {
            init({});
        } else {
            runTeardown();
            const modal = document.getElementById('nsft-scripted-rec-modal');
            if (modal) modal.remove();
        }
    });

    function init(items) {
        setupListeners();
        initModal(true);
    }

    function setupListeners() {
        const onShow = function (evt) {
            if (window.NSFT_ShortcutCoach) window.NSFT_ShortcutCoach.hint('view_scripted_record');
            const modal = document.getElementById('nsft-scripted-rec-modal');
            if (!modal) {
                initModal(false);
            } else {
                updateInterface();
                modal.style.display = 'flex';
                modal.dataset.state = 'maximised';
                if (lastMaximizedTop !== null) modal.style.top = lastMaximizedTop;
                else { modal.style.top = ''; modal.style.bottom = ''; }
                if (lastMaximizedLeft !== null) modal.style.left = lastMaximizedLeft;
                else { modal.style.left = ''; modal.style.right = ''; }
                updateTitleState();
                bringToFront();
            }
        };
        window.addEventListener('nsft-show-scripted-record', onShow);
        if (window.NSFT_Shortcuts && window.NSFT_Shortcuts.bind) {
            window.NSFT_Shortcuts.bind('view_scripted_record', {
                label: chrome.i18n.getMessage('enableScriptedRecordsLabel') || 'Scripted Records',
                defaultCombo: { ctrlKey: false, shiftKey: true, altKey: true, code: 'KeyS' },
                storageKey: 'viewScriptedRecordShortcut',
                event: 'nsft-show-scripted-record',
                group: chrome.i18n.getMessage('cheatsheet_group_global') || 'Global',
                order: 41
            });
        }

        addCleanup(() => window.removeEventListener('nsft-show-scripted-record', onShow));

        const onMessage = function (event) {
            if (event.source !== window) return;
            const d = event.data;
            if (!d || typeof d !== 'object') return;
            if (d.dest === 'extension_sr') {
                handleExtensionMessage(d);
            }
        };
        window.addEventListener('message', onMessage);
        addCleanup(() => window.removeEventListener('message', onMessage));

        const onLayout = function () { updateCapsuleLayout(); };
        window.addEventListener('nsft-layout-update', onLayout);
        addCleanup(() => window.removeEventListener('nsft-layout-update', onLayout));
    }

    function initModal(isPreload = false) {
        if (document.getElementById('nsft-scripted-rec-modal')) {
            if (!isPreload) {
                const modal = document.getElementById('nsft-scripted-rec-modal');
                modal.style.display = 'flex';
                bringToFront();
            }
            return;
        }

        document.body.insertAdjacentHTML('beforeend', getHtmlTemplate());
        const modal = document.getElementById('nsft-scripted-rec-modal');
        _nsftApplyThemeToModal();
        initUIFunctionality();
        addModalListeners();
        constrainModalToWindow(modal);

        loadRecordData();
        if (!isPreload) {
            modal.style.display = 'flex';
            bringToFront();
        }
    }

    function addModalListeners() {
        const modal = document.getElementById('nsft-scripted-rec-modal');
        const clickHandler = (id, fn) => {
            const el = document.getElementById(id);
            if (el) el.addEventListener('click', fn);
        };

        clickHandler('nsft-sr-minimise', () => {
            modal.dataset.state = 'minimised';
            updateTitleState();
            dispatchLayoutUpdate();
        });

        clickHandler('nsft-sr-maximise', () => {
            modal.dataset.state = 'maximised';
            if (lastMaximizedTop !== null) modal.style.top = lastMaximizedTop;
            else { modal.style.top = ''; modal.style.bottom = ''; }
            if (lastMaximizedLeft !== null) modal.style.left = lastMaximizedLeft;
            else { modal.style.left = ''; modal.style.right = ''; }
            updateTitleState();
            dispatchLayoutUpdate();
        });

        clickHandler('nsft-sr-close', () => {
            modal.style.display = 'none';
            dispatchLayoutUpdate();
        });

        clickHandler('nsft-sr-reload', () => {
            loadRecordData();
            const globalLoading = document.getElementById('nsft-scripted-rec-global-loading');
            if (globalLoading) globalLoading.style.display = 'flex';
        });

        const header = document.querySelector('.nsft-sr-header');
        if (header) {
            header.addEventListener('dblclick', (e) => {
                if (e.target.closest('.nsft-header-actions')) return;
                const state = modal.dataset.state;
                if (state === 'minimised') {
                    modal.dataset.state = 'maximised';
                    if (lastMaximizedTop !== null) modal.style.top = lastMaximizedTop;
                    else { modal.style.top = ''; modal.style.bottom = ''; }
                    if (lastMaximizedLeft !== null) modal.style.left = lastMaximizedLeft;
                    else { modal.style.left = ''; modal.style.right = ''; }
                } else {
                    modal.dataset.state = 'minimised';
                }
                updateTitleState();
                dispatchLayoutUpdate();
            });

            let mouseIsDown = false;
            let offsetX = 0;
            let offsetY = 0;

            const handleMouseMove = (event) => {
                if (mouseIsDown) {
                    event.preventDefault();
                    const newLeft = (event.clientX - offsetX) + 'px';
                    const newTop = (event.clientY - offsetY) + 'px';
                    modal.style.left = newLeft;
                    modal.style.top = newTop;

                    if (modal.dataset.state === 'maximised') {
                        lastMaximizedLeft = newLeft;
                        lastMaximizedTop = newTop;
                    }
                }
            };

            header.addEventListener('mousedown', (event) => {
                if (document.activeElement) document.activeElement.blur();
                if (event.target.closest('.nsft-header-actions')) return;

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

        const tooltip = document.getElementById('nsft-sr-global-tooltip');

        const positionTooltipAtCursor = (clientX, clientY) => {
            const OFFSET_X = 14;
            const OFFSET_Y = 12;
            const MARGIN = 8;
            let top = clientY - tooltip.offsetHeight - OFFSET_Y;
            let left = clientX + OFFSET_X;
            if (top < MARGIN) top = clientY + OFFSET_Y + 6;
            if (left + tooltip.offsetWidth > window.innerWidth - MARGIN) {
                left = clientX - tooltip.offsetWidth - OFFSET_X;
            }
            if (left < MARGIN) left = MARGIN;
            tooltip.style.top = top + 'px';
            tooltip.style.left = left + 'px';
        };

        document.body.addEventListener('mouseover', (e) => {
            const target = e.target.closest('[data-tooltip]');
            if (target && tooltip) {
                const text = target.getAttribute('data-tooltip');
                if (text) {
                    tooltip.textContent = text;
                    tooltip.classList.add('visible');
                    positionTooltipAtCursor(e.clientX, e.clientY);
                }
            }
        });

        document.body.addEventListener('mousemove', (e) => {
            if (!tooltip || !tooltip.classList.contains('visible')) return;
            const target = e.target.closest('[data-tooltip]');
            if (target) {
                positionTooltipAtCursor(e.clientX, e.clientY);
            } else {
                tooltip.classList.remove('visible');
            }
        });

        document.body.addEventListener('mouseout', (e) => {
            const target = e.target.closest('[data-tooltip]');
            if (target && tooltip) {
                tooltip.classList.remove('visible');
            }
        });

        const searchInput = document.getElementById('nsft-scripted-rec-search-input');
        const searchClear = document.getElementById('nsft-scripted-rec-search-clear');
        if (searchInput) searchInput.addEventListener('input', (e) => filterScripts(e.target.value));
        if (searchClear) searchClear.addEventListener('click', () => {
            if (searchInput) {
                searchInput.value = '';
                filterScripts('');
                searchInput.focus();
            }
        });

        const filterModal = document.getElementById('nsft-scripted-rec-modal');
        filterModal?.querySelectorAll('select[data-sr-filter-field]').forEach((sel) => {
            sel.addEventListener('change', () => {
                const tabIdx = parseInt(sel.getAttribute('data-sr-filter-tab'), 10);
                applyContextualFilter(tabIdx);
            });
        });
        filterModal?.querySelectorAll('[data-sr-reset-filters]').forEach((btn) => {
            btn.addEventListener('click', () => {
                const tabIdx = parseInt(btn.getAttribute('data-sr-filter-tab'), 10);
                resetFilters(tabIdx);
            });
        });

        if (modal) {
            const onModalClick = (e) => {
                const logsBtn = e.target.closest('[data-sr-action="view-logs"]');
                if (logsBtn) {
                    e.preventDefault();
                    const scriptId = logsBtn.getAttribute('data-sr-script-id');
                    const scriptName = logsBtn.getAttribute('data-sr-script-name') || '';
                    const scriptUrl = logsBtn.getAttribute('data-sr-script-url') || '';
                    const scriptFile = logsBtn.getAttribute('data-sr-script-file') || '';
                    openLogsPanel(scriptId, scriptName, { scriptUrl, scriptFile });
                    return;
                }
                if (e.target.closest('#nsft-sr-logs-back')) {
                    closeLogsPanel();
                    return;
                }
                if (e.target.closest('#nsft-sr-bulk-enable')) {
                    submitBulkChange('T');
                    return;
                }
                if (e.target.closest('#nsft-sr-bulk-disable')) {
                    submitBulkChange('F');
                    return;
                }
                if (e.target.closest('#nsft-sr-bulk-clear')) {
                    clearBulkSelection();
                    return;
                }
                if (e.target.closest('#nsft-sr-banner-close')) {
                    hideBanner();
                    return;
                }
                if (e.target.closest('#nsft-sr-logs-refresh')) {
                    requestLogs(true);
                    return;
                }
                if (e.target.closest('#nsft-sr-logs-live')) {
                    toggleLogsLive();
                    return;
                }
                if (e.target.closest('#nsft-sr-cols-toggle')) {
                    const menu = document.getElementById('nsft-sr-cols-menu');
                    const btn = document.getElementById('nsft-sr-cols-toggle');
                    if (menu) {
                        const open = menu.style.display !== 'none';
                        menu.style.display = open ? 'none' : 'flex';
                        if (btn) btn.setAttribute('aria-expanded', String(!open));
                    }
                    return;
                }
                const menuOpen = document.getElementById('nsft-sr-cols-menu');
                if (menuOpen && menuOpen.style.display !== 'none'
                    && !e.target.closest('#nsft-sr-cols-menu')
                    && !e.target.closest('#nsft-sr-cols-toggle')) {
                    menuOpen.style.display = 'none';
                    const btn = document.getElementById('nsft-sr-cols-toggle');
                    if (btn) btn.setAttribute('aria-expanded', 'false');
                }
            };
            modal.addEventListener('click', onModalClick);
            addCleanup(() => modal.removeEventListener('click', onModalClick));

            const onModalChange = (e) => {
                const cb = e.target;
                if (cb && cb.matches && cb.matches('#nsft-sr-cols-menu input[data-sr-col]')) {
                    toggleLogsCol(cb.getAttribute('data-sr-col'), cb.checked);
                    return;
                }
                if (cb && cb.matches && cb.matches('input[type="checkbox"].nsft-sr-bulk-row')) {
                    updateBulkToolbarState();
                } else if (cb && cb.matches && cb.matches('input[type="checkbox"].nsft-sr-bulk-master')) {
                    const groupId = cb.getAttribute('data-sr-bulk-master');
                    const table = cb.closest('table');
                    if (table) {
                        table.querySelectorAll('input.nsft-sr-bulk-row').forEach((rowCb) => {
                            rowCb.checked = cb.checked;
                        });
                    }
                    updateBulkToolbarState();
                }
            };
            modal.addEventListener('change', onModalChange);
            addCleanup(() => modal.removeEventListener('change', onModalChange));
            addCleanup(stopLogsLive);
        }
    }

    let _logsRequestSeq = 0;
    const _logsRequests = new Map();
    let _currentLogsContext = null;

    const LOGS_COLS_KEY = 'nsftSrLogsHiddenCols';
    const ALL_LOG_COLS = ['num', 'ts', 'type', 'title', 'detail'];
    let _logsHiddenCols = new Set();
    let _logsColsLoaded = false;
    chrome.storage.local.get({ [LOGS_COLS_KEY]: [] }, (items) => {
        const arr = Array.isArray(items[LOGS_COLS_KEY]) ? items[LOGS_COLS_KEY] : [];
        _logsHiddenCols = new Set(arr.filter(c => ALL_LOG_COLS.includes(c)));
        _logsColsLoaded = true;
        applyLogsColsToPanel();
        applyLogsColsToCheckboxes();
    });
    function persistLogsCols() {
        chrome.storage.local.set({ [LOGS_COLS_KEY]: Array.from(_logsHiddenCols) });
    }
    function applyLogsColsToPanel() {
        const panel = document.getElementById('nsft-sr-logs-panel');
        if (!panel) return;
        panel.setAttribute('data-hide-cols', Array.from(_logsHiddenCols).join(' '));
    }
    function applyLogsColsToCheckboxes() {
        const menu = document.getElementById('nsft-sr-cols-menu');
        if (!menu) return;
        menu.querySelectorAll('input[data-sr-col]').forEach(cb => {
            const col = cb.getAttribute('data-sr-col');
            cb.checked = !_logsHiddenCols.has(col);
        });
    }
    function toggleLogsCol(col, visible) {
        if (!ALL_LOG_COLS.includes(col)) return;
        if (visible) _logsHiddenCols.delete(col);
        else _logsHiddenCols.add(col);
        if (_logsHiddenCols.size >= ALL_LOG_COLS.length) {
            _logsHiddenCols.delete(col);
            applyLogsColsToCheckboxes();
            return;
        }
        applyLogsColsToPanel();
        persistLogsCols();
    }

    function buildScriptArchiveUrl(scriptId) {
        if (!scriptId) return null;
        const target = new URL('/app/common/scripting/scriptnotearchive.nl', window.location.origin);
        target.searchParams.set('daterange', 'ALL');
        target.searchParams.set('date', 'ALL');
        target.searchParams.set('sortcol', 'timestamp');
        target.searchParams.set('sortdir', 'DESC');
        target.searchParams.set('loglevel', '');
        target.searchParams.set('scriptId', String(scriptId));
        target.searchParams.set('scriptRecordId', '1');
        return target.toString();
    }

    function openLogsPanel(scriptId, scriptName, extras) {
        const panel = document.getElementById('nsft-sr-logs-panel');
        const title = document.getElementById('nsft-sr-logs-title');
        const body = document.getElementById('nsft-sr-logs-body');
        const fullLink = document.getElementById('nsft-sr-logs-full');
        const openScriptLink = document.getElementById('nsft-sr-logs-open-script');
        const editFileLink = document.getElementById('nsft-sr-logs-edit-file');
        if (!panel || !body) return;
        _currentLogsContext = {
            scriptId,
            scriptName,
            scriptUrl: (extras && extras.scriptUrl) || '',
            scriptFile: (extras && extras.scriptFile) || ''
        };
        if (title) title.textContent = scriptName || (chrome.i18n.getMessage('sr_logs_title') || 'Logs de ejecución');
        if (fullLink) {
            const url = buildScriptArchiveUrl(scriptId);
            fullLink.href = url || '#';
            fullLink.style.display = url ? '' : 'none';
        }
        const scriptUrl = (extras && extras.scriptUrl) || '';
        const scriptFile = (extras && extras.scriptFile) || '';
        if (openScriptLink) {
            openScriptLink.href = scriptUrl || '#';
            openScriptLink.style.display = scriptUrl ? '' : 'none';
        }
        if (editFileLink) {
            editFileLink.href = scriptFile || '#';
            editFileLink.style.display = scriptFile ? '' : 'none';
        }
        body.innerHTML = `<div class="nsft-sr-logs-loading">${escapeHtml(chrome.i18n.getMessage('sr_logs_loading') || 'Cargando logs...')}</div>`;
        panel.style.display = 'flex';
        if (window.NSFT_LogFormat) {
            chrome.storage.local.get({ logPrettierTheme: 'auto' }, (it) => {
                window.NSFT_LogFormat.ensureTheme(it.logPrettierTheme);
            });
        }
        applyLogsColsToPanel();
        applyLogsColsToCheckboxes();

        requestLogs(false);
    }

    function requestLogs(showLoading) {
        if (!_currentLogsContext) return;
        if (showLoading) {
            const body = document.getElementById('nsft-sr-logs-body');
            if (body) body.innerHTML = `<div class="nsft-sr-logs-loading">${escapeHtml(chrome.i18n.getMessage('sr_logs_loading') || 'Cargando logs...')}</div>`;
        }
        const { scriptId, scriptName } = _currentLogsContext;
        const requestId = ++_logsRequestSeq;
        _logsRequests.set(requestId, { scriptId, scriptName });
        window.postMessage({ dest: 'fetcher_sr', type: 'getLogs_SR', scriptId, requestId }, '*');
    }

    let _logsLiveTimer = null;
    function startLogsLive() {
        stopLogsLive();
        const btn = document.getElementById('nsft-sr-logs-live');
        if (btn) {
            btn.classList.add('active');
            btn.setAttribute('aria-pressed', 'true');
        }
        chrome.storage.local.get({ liveModeInterval: 3 }, (it) => {
            if (!document.getElementById('nsft-sr-logs-live') ||
                !document.getElementById('nsft-sr-logs-live').classList.contains('active')) return;
            const secs = Math.max(1, parseInt(it.liveModeInterval, 10) || 3);
            _logsLiveTimer = setInterval(() => requestLogs(false), secs * 1000);
            requestLogs(false);
        });
    }
    function stopLogsLive() {
        if (_logsLiveTimer) {
            clearInterval(_logsLiveTimer);
            _logsLiveTimer = null;
        }
        const btn = document.getElementById('nsft-sr-logs-live');
        if (btn) {
            btn.classList.remove('active');
            btn.setAttribute('aria-pressed', 'false');
        }
    }
    function toggleLogsLive() {
        const btn = document.getElementById('nsft-sr-logs-live');
        const active = btn && btn.classList.contains('active');
        if (active) stopLogsLive();
        else startLogsLive();
    }

    function closeLogsPanel() {
        stopLogsLive();
        const panel = document.getElementById('nsft-sr-logs-panel');
        if (panel) panel.style.display = 'none';
        const menu = document.getElementById('nsft-sr-cols-menu');
        const btn = document.getElementById('nsft-sr-cols-toggle');
        if (menu) menu.style.display = 'none';
        if (btn) btn.setAttribute('aria-expanded', 'false');
        _currentLogsContext = null;
    }

    function renderLogsResult(requestId, data, errText) {
        const expected = _logsRequests.get(requestId);
        if (!expected) return;
        _logsRequests.delete(requestId);
        const body = document.getElementById('nsft-sr-logs-body');
        if (!body) return;

        if (errText) {
            body.innerHTML = `<div class="nsft-sr-logs-error">${escapeHtml(chrome.i18n.getMessage('sr_logs_error') || 'Error al cargar logs')}: ${escapeHtml(errText)}</div>`;
            return;
        }
        if (!data || data.length === 0) {
            body.innerHTML = `<div class="nsft-sr-logs-empty">${escapeHtml(chrome.i18n.getMessage('sr_logs_empty') || 'No hay logs recientes')}</div>`;
            return;
        }

        const tStatus = (typ) => {
            const t = String(typ || '').toUpperCase();
            if (t === 'ERROR' || t === 'EMERGENCY' || t === 'SYSTEM ERROR') return 'nsft-sr-log-error';
            if (t === 'AUDIT') return 'nsft-sr-log-audit';
            if (t === 'DEBUG') return 'nsft-sr-log-debug';
            return 'nsft-sr-log-other';
        };

        const rows = data.map((r, i) => `
            <tr class="${tStatus(r.type)}">
              <td class="nsft-sr-log-num">${i + 1}</td>
              <td class="nsft-sr-log-ts">${escapeHtml(r.ts || '')}</td>
              <td class="nsft-sr-log-type"><span class="nsft-scripted-rec-badge">${escapeHtml(r.type || '')}</span></td>
              <td class="nsft-sr-log-title">${escapeHtml(r.title || '')}</td>
              <td class="nsft-sr-log-detail"><pre>${escapeHtml(r.detail || '')}</pre></td>
            </tr>
        `).join('');

        body.innerHTML = `
            <table class="nsft-sr-logs-table">
              <thead>
                <tr>
                  <th class="nsft-sr-log-num">${escapeHtml(chrome.i18n.getMessage('sr_logs_col_num') || '#')}</th>
                  <th class="nsft-sr-log-ts">${escapeHtml(chrome.i18n.getMessage('sr_logs_col_date') || 'Fecha')}</th>
                  <th class="nsft-sr-log-type">${escapeHtml(chrome.i18n.getMessage('sr_logs_col_type') || 'Tipo')}</th>
                  <th class="nsft-sr-log-title">${escapeHtml(chrome.i18n.getMessage('sr_logs_col_title') || 'Título')}</th>
                  <th class="nsft-sr-log-detail">${escapeHtml(chrome.i18n.getMessage('sr_logs_col_detail') || 'Detalle')}</th>
                </tr>
              </thead>
              <tbody>${rows}</tbody>
            </table>`;

        const LF = window.NSFT_LogFormat;
        if (LF) {
            const detailCells = body.querySelectorAll('td.nsft-sr-log-detail');
            const ctx = _currentLogsContext || {};
            data.forEach((r, i) => {
                const cell = detailCells[i];
                if (!cell) return;
                LF.renderInto(cell, r.detail, {
                    nameParts: [
                        ctx.scriptName || (ctx.scriptId ? 'script-' + ctx.scriptId : ''),
                        String(r.type || '').toLowerCase(),
                        r.title || '',
                        LF.stampPart ? LF.stampPart(r.ts) : ''
                    ]
                });
            });
        }
    }

    let _bulkRequestSeq = 0;
    let _bulkPending = null;
    let _lastBulkValue = null;
    let _bannerTimer = null;

    function getSelectedDeployments() {
        const modal = document.getElementById('nsft-scripted-rec-modal');
        if (!modal) return [];
        return Array.from(modal.querySelectorAll('input.nsft-sr-bulk-row:checked'))
            .map(cb => cb.getAttribute('data-sr-deployment-id'))
            .filter(Boolean);
    }

    function updateBulkToolbarState() {
        const ids = getSelectedDeployments();
        const toolbar = document.getElementById('nsft-sr-bulk-toolbar');
        const countEl = document.getElementById('nsft-sr-bulk-count');
        if (!toolbar) return;
        toolbar.style.display = ids.length ? 'flex' : 'none';
        if (countEl) {
            const tpl = chrome.i18n.getMessage('sr_bulk_count', [String(ids.length)])
                || `${ids.length} seleccionados`;
            countEl.textContent = tpl.replace('$1', String(ids.length));
        }
    }

    function clearBulkSelection(onlyIds) {
        const modal = document.getElementById('nsft-scripted-rec-modal');
        if (!modal) return;
        const filter = Array.isArray(onlyIds) ? new Set(onlyIds.map(String)) : null;
        modal.querySelectorAll('input.nsft-sr-bulk-row').forEach(cb => {
            if (!filter || filter.has(cb.getAttribute('data-sr-deployment-id'))) {
                cb.checked = false;
            }
        });
        modal.querySelectorAll('input.nsft-sr-bulk-master').forEach(master => {
            const table = master.closest('table');
            if (!table) return;
            const anyChecked = table.querySelector('input.nsft-sr-bulk-row:checked');
            master.checked = !!anyChecked;
        });
        updateBulkToolbarState();
    }

    function showBanner(kind, text) {
        const banner = document.getElementById('nsft-sr-banner');
        const textEl = document.getElementById('nsft-sr-banner-text');
        if (!banner || !textEl) return;
        banner.setAttribute('data-kind', kind);
        textEl.textContent = text;
        banner.style.display = 'flex';
        if (_bannerTimer) clearTimeout(_bannerTimer);
        if (kind === 'success') {
            _bannerTimer = setTimeout(hideBanner, 4500);
        }
    }
    function hideBanner() {
        const banner = document.getElementById('nsft-sr-banner');
        if (banner) banner.style.display = 'none';
        if (_bannerTimer) { clearTimeout(_bannerTimer); _bannerTimer = null; }
    }

    function applyDeployedToRow(row, isDeployedBool) {
        if (!row) return;
        row.setAttribute('data-sr-deployed', isDeployedBool ? 'deployed' : 'notdeployed');

        const badge = row.querySelector('td:nth-child(3) .nsft-scripted-rec-badge');
        if (badge) {
            badge.classList.toggle('nsft-scripted-rec-badge-blue', isDeployedBool);
            badge.classList.toggle('nsft-scripted-rec-badge-red', !isDeployedBool);
            badge.textContent = isDeployedBool
                ? (chrome.i18n.getMessage('sr_yes') || 'Sí')
                : (chrome.i18n.getMessage('sr_no') || 'No');
        }

        const scriptInactive = row.getAttribute('data-sr-script-inactive') === 'T';
        const inactive = !isDeployedBool || scriptInactive;
        row.classList.toggle('nsft-scripted-rec-row-inactive', inactive);
        row.setAttribute('data-sr-active', inactive ? 'inactive' : 'active');
    }

    function flashRowFailure(row) {
        if (!row) return;
        row.classList.remove('nsft-sr-bulk-failed-flash');
        void row.offsetWidth;
        row.classList.add('nsft-sr-bulk-failed-flash');
        setTimeout(() => row.classList.remove('nsft-sr-bulk-failed-flash'), 1500);
    }

    function submitBulkChange(isdeployedValue) {
        const ids = getSelectedDeployments();
        if (!ids.length || _bulkPending) return;

        hideBanner();
        const status = document.getElementById('nsft-sr-bulk-status');
        if (status) status.textContent = chrome.i18n.getMessage('sr_bulk_running') || 'Aplicando...';

        const requestId = ++_bulkRequestSeq;
        _bulkPending = requestId;
        _lastBulkValue = isdeployedValue;
        const changes = ids.map(id => ({ deploymentId: id, isdeployed: isdeployedValue }));
        window.postMessage({ dest: 'fetcher_sr', type: 'updateDeployments_SR', changes, requestId }, '*');
    }

    function renderBulkResult(requestId, results, errText) {
        if (_bulkPending !== requestId) return;
        _bulkPending = null;
        const status = document.getElementById('nsft-sr-bulk-status');
        if (status) status.textContent = '';

        if (errText) {
            showBanner('error', `${chrome.i18n.getMessage('sr_bulk_error') || 'Error'}: ${errText}`);
            return;
        }

        const modal = document.getElementById('nsft-scripted-rec-modal');
        const isDeployedBool = /^t(rue)?$/i.test(String(_lastBulkValue));
        const okList = (results || []).filter(r => r.ok);
        const failList = (results || []).filter(r => !r.ok);

        if (modal) {
            okList.forEach(r => {
                const row = modal.querySelector(`tr[data-sr-deployment-id="${CSS.escape(String(r.deploymentId))}"]`);
                applyDeployedToRow(row, isDeployedBool);
            });
            failList.forEach(r => {
                const row = modal.querySelector(`tr[data-sr-deployment-id="${CSS.escape(String(r.deploymentId))}"]`);
                flashRowFailure(row);
            });
        }

        clearBulkSelection(okList.map(r => r.deploymentId));

        const action = isDeployedBool
            ? (chrome.i18n.getMessage('sr_bulk_enable') || 'Activar')
            : (chrome.i18n.getMessage('sr_bulk_disable') || 'Desactivar');
        if (failList.length === 0) {
            const tpl = chrome.i18n.getMessage('sr_bulk_done', [String(okList.length)])
                || `${action}: ${okList.length} aplicados`;
            showBanner('success', tpl.replace('$1', String(okList.length)));
        } else {
            const firstErr = failList[0];
            const errMsg = (firstErr && firstErr.error) || 'unknown';
            const tpl = chrome.i18n.getMessage('sr_bulk_partial', [String(okList.length), String(failList.length)])
                || `${action}: ${okList.length} OK · ${failList.length} fallaron`;
            const head = tpl.replace('$1', String(okList.length)).replace('$2', String(failList.length));
            const extra = failList.length > 1 ? ` (+${failList.length - 1} más)` : '';
            showBanner(okList.length > 0 ? 'partial' : 'error', `${head} — ${errMsg}${extra}`);
            console.warn('NSFT view_scripted_record bulk errors:', failList);
        }
    }


    function _srContainerId(index) {
        return ['nsft-scripted-rec-content-user',
                'nsft-scripted-rec-content-client',
                'nsft-scripted-rec-content-workflow'][index];
    }

    function _srFilterValue(tabIndex, field) {
        const sel = document.querySelector(`select[data-sr-filter-field="${field}"][data-sr-filter-tab="${tabIndex}"]`);
        return sel?.value || '__all__';
    }

    const _cssAttrEscape = (v) => String(v).replace(/[\\"]/g, '\\$&');

    function applyContextualFilter(tabIndex) {
        const containerId = _srContainerId(tabIndex);
        if (!document.getElementById(containerId)) return;

        const styleId = `nsft-sr-filter-style-${tabIndex}`;
        let style = document.getElementById(styleId);
        if (!style) {
            style = document.createElement('style');
            style.id = styleId;
            document.head.appendChild(style);
            addCleanup(() => style.remove());
        }

        const rules = [];
        const pushRuleIf = (attrName, value) => {
            if (value === '__all__' || value == null) return;
            const safe = _cssAttrEscape(value);
            rules.push(`#${containerId} tr[${attrName}]:not([${attrName}="${safe}"]) { display: none; }`);
        };

        if (tabIndex === 2) {
            pushRuleIf('data-sr-wf-release', _srFilterValue(tabIndex, 'wf-release'));
        } else {
            pushRuleIf('data-sr-active', _srFilterValue(tabIndex, 'active'));
            pushRuleIf('data-sr-deployed', _srFilterValue(tabIndex, 'deployed'));
            pushRuleIf('data-sr-release', _srFilterValue(tabIndex, 'release'));
            pushRuleIf('data-sr-api', _srFilterValue(tabIndex, 'api'));
        }

        style.textContent = rules.join('\n');
    }

    function resetFilters(tabIndex) {
        const modal = document.getElementById('nsft-scripted-rec-modal');
        modal?.querySelectorAll(`select[data-sr-filter-tab="${tabIndex}"]`).forEach((sel) => {
            sel.value = '__all__';
        });
        applyContextualFilter(tabIndex);
    }

    function updateFilterBar(index) {
        const modal = document.getElementById('nsft-scripted-rec-modal');
        if (!modal) return;
        modal.querySelectorAll('.nsft-sr-filter-row').forEach((row) => {
            const rowIdx = parseInt(row.getAttribute('data-sr-tab-filter'), 10);
            row.style.display = rowIdx === index ? 'flex' : 'none';
        });
        applyContextualFilter(index);
    }

    function initUIFunctionality() {
        const tabs = document.querySelectorAll('#nsft-scripted-rec-modal .nsft-scripted-rec-tab');
        const slider = document.getElementById('nsft-scripted-rec-slider');

        tabs.forEach(tab => {
            tab.addEventListener('click', function () {
                const index = parseInt(this.dataset.index);
                tabs.forEach(t => {
                    t.classList.remove('active');
                    t.style.color = '#6b7280';
                    t.style.borderBottomColor = 'transparent';
                    t.style.fontWeight = '500';
                });
                this.classList.add('active');
                this.style.color = '#0070f3';
                this.style.borderBottomColor = '#0070f3';
                this.style.fontWeight = '600';

                if (slider) slider.style.transform = `translateX(-${index * 33.333}%)`;
                animateTabContent(index);
                updateFilterBar(index);
            });
        });
    }

    function animateTabContent(index) {
        const ids = ['nsft-scripted-rec-content-user', 'nsft-scripted-rec-content-client', 'nsft-scripted-rec-content-workflow'];
        const container = document.getElementById(ids[index]);
        if (!container || container.dataset.animated === 'true') return;

        const cards = container.querySelectorAll('.nsft-scripted-rec-card');
        cards.forEach((card, i) => {
            card.style.animationDelay = (i * 80) + 'ms';
            card.classList.add('animate-in');
        });
        container.dataset.animated = 'true';
    }

    function updateInterface() {
        const el = id => document.getElementById(id);
        const modal = el('nsft-scripted-rec-modal');
        if (!modal) return;

        if (modal.dataset.state !== 'minimised') {
            const titleEl = el('nsft-sr-title');
            if (titleEl) titleEl.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#000000" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 6px; vertical-align: middle;"><polyline points="16 18 22 12 16 6"></polyline><polyline points="8 6 2 12 8 18"></polyline></svg>${chrome.i18n.getMessage('sr_title')}`;
        }

        const setAttr = (id, attr, msgKey) => {
            const e = el(id);
            if (e) e.setAttribute(attr, chrome.i18n.getMessage(msgKey));
        };

        setAttr('nsft-sr-reload', 'title', 'sr_reload');
        setAttr('nsft-sr-minimise', 'title', 'sr_minimise');
        setAttr('nsft-sr-maximise', 'title', 'sr_maximise');
        setAttr('nsft-sr-close', 'title', 'sr_close');
        setAttr('nsft-scripted-rec-search-input', 'placeholder', 'sr_search_placeholder');
        setAttr('nsft-scripted-rec-search-clear', 'title', 'sr_clear_search');

        _srSetTabLabel('nsft-scripted-rec-tab-user', 'sr_tab_user', _srCounts.user);
        _srSetTabLabel('nsft-scripted-rec-tab-client', 'sr_tab_client', _srCounts.client);
        _srSetTabLabel('nsft-scripted-rec-tab-workflow', 'sr_tab_workflow', _srCounts.workflow);
    }

    function updateTitleState() {
        const el = document.getElementById('nsft-scripted-rec-modal');
        const titleEl = document.getElementById('nsft-sr-title');
        if (!el || !titleEl) return;

        if (el.dataset.state === 'minimised') {
            titleEl.innerHTML = `<span class="nsft-sr-title-minimised">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#000000" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 4px; vertical-align: middle;"><polyline points="16 18 22 12 16 6"></polyline><polyline points="8 6 2 12 8 18"></polyline></svg>
                ${chrome.i18n.getMessage('sr_title_minimised')}
            </span>`;
            setTimeout(() => snapToEdge(el), 10);
        } else {
            titleEl.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#000000" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 6px; vertical-align: middle;"><polyline points="16 18 22 12 16 6"></polyline><polyline points="8 6 2 12 8 18"></polyline></svg>${chrome.i18n.getMessage('sr_title')}`;
            constrainModalToWindow(el);
        }
        dispatchLayoutUpdate();
    }

    function dispatchLayoutUpdate() {
        window.dispatchEvent(new CustomEvent('nsft-layout-update'));
    }

    function updateCapsuleLayout() {
        const srModal = document.getElementById('nsft-scripted-rec-modal');
        const roModal = document.getElementById('nsft-rec-obj-modal');
        const isVisible = (el) => el && el.style.display !== 'none' && document.body.contains(el);

        const srMin = isVisible(srModal) && srModal.dataset.state === 'minimised';
        const roMin = isVisible(roModal) && roModal.dataset.state === 'minimised';

        if (srMin && roMin) {
            if (roModal) roModal.classList.remove('nsft-shifted');
            if (srModal) srModal.classList.add('nsft-shifted');
        } else {
            if (srModal) srModal.classList.remove('nsft-shifted');
            if (roModal) roModal.classList.remove('nsft-shifted');
        }
    }


    function bringToFront() {
        const srModal = document.getElementById('nsft-scripted-rec-modal');
        if (!srModal) return;
        const stack = window.NSFT_ModalStack;
        if (stack && stack.bringToFront) {
            stack.bringToFront(srModal);
        } else {
            srModal.style.zIndex = '10002';
        }
    }

    function constrainModalToWindow(el) {
        if (!el || (!el.style.left && !el.style.top)) return;
        const TARGET_WIDTH = el.offsetWidth || 600;
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;
        const rect = el.getBoundingClientRect();

        let currentLeft = parseInt(el.style.left) || rect.left;
        let currentTop = parseInt(el.style.top) || rect.top;
        let newLeft = currentLeft;
        let newTop = currentTop;

        if (currentLeft + TARGET_WIDTH > viewportWidth) newLeft = viewportWidth - TARGET_WIDTH - 15;
        if (newLeft < 15) newLeft = 15;
        if (currentTop < 15) newTop = 15;
        if (currentTop > viewportHeight - 50) newTop = viewportHeight - 100;

        if (newLeft !== currentLeft || newTop !== currentTop) {
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

    function loadRecordData() {
        injectFetcher();
    }

    let _fetcherTranslationsSent = false;

    function injectFetcher() {
        const scriptId = 'nsft-scripted-record-fetcher';

        let payload;
        if (_fetcherTranslationsSent) {
            payload = { type: 'getRecord_SR', dest: 'fetcher_sr' };
        } else {
            payload = {
                type: 'getRecord_SR',
                dest: 'fetcher_sr',
                translations: {
                    sr_error_not_scriptable_page: chrome.i18n.getMessage("sr_error_not_scriptable_page"),
                    sr_error_no_record_type: chrome.i18n.getMessage("sr_error_no_record_type"),
                    sr_error_require_not_found: chrome.i18n.getMessage("sr_error_require_not_found"),
                    sr_label_unknown_script: chrome.i18n.getMessage("sr_label_unknown_script"),
                    sr_data_retrieved: chrome.i18n.getMessage("sr_data_retrieved"),
                    sr_custom_list_retrieved: chrome.i18n.getMessage("sr_custom_list_retrieved"),
                    sr_error_logic: chrome.i18n.getMessage("sr_error_logic"),
                    sr_error_global: chrome.i18n.getMessage("sr_error_global"),
                    sr_script_type_user_event: chrome.i18n.getMessage("sr_script_type_user_event"),
                    sr_script_type_workflow_action: chrome.i18n.getMessage("sr_script_type_workflow_action")
                }
            };
            _fetcherTranslationsSent = true;
        }

        if (window.__nsftSrFetcherLoaded || document.getElementById(scriptId)) {
            window.postMessage(payload, '*');
            return;
        }

        const script = document.createElement('script');
        script.id = scriptId;
        script.src = chrome.runtime.getURL('scripts/modules/view_scripted_record/scripted_record_fetcher.js');
        script.onload = function () {
            window.postMessage(payload, '*');
            this.remove();
        };
        (document.head || document.documentElement).appendChild(script);
    }

    function handleExtensionMessage(message) {
        const globalLoading = document.getElementById('nsft-scripted-rec-global-loading');

        if (message.type === 'logs_success') {
            renderLogsResult(message.requestId, message.data, null);
            return;
        }
        if (message.type === 'logs_error') {
            renderLogsResult(message.requestId, null, message.text || 'unknown');
            return;
        }
        if (message.type === 'bulk_success') {
            renderBulkResult(message.requestId, message.data, null);
            return;
        }
        if (message.type === 'bulk_error') {
            renderBulkResult(message.requestId, null, message.text || 'unknown');
            return;
        }

        if (message.type === 'error') {
            if (globalLoading) globalLoading.style.display = 'none';
            displayErrorInUI(message.text);
        } else if (message.type === 'success') {
            if (globalLoading) globalLoading.style.display = 'none';
            updateUIWithData(message.data);
        }
    }

    function displayErrorInUI(errorMessage) {
        let friendlyMessage = errorMessage;
        if (errorMessage && errorMessage.includes && errorMessage.includes("Search error occurred") && errorMessage.includes("not found")) {
            friendlyMessage = chrome.i18n.getMessage('sr_error_permission');
        }

        const activeContainerId = 'nsft-scripted-rec-content-user';
        const scriptsContainer = document.getElementById(activeContainerId);
        if (scriptsContainer) {
            scriptsContainer.innerHTML = `
              <div class="nsft-scripted-rec-card">
                  <div class="nsft-scripted-rec-card-content">
                      <div style="padding: 20px; color: #ff3b30; display: flex; align-items: center;">
                          <span>${escapeHtml(friendlyMessage)}</span>
                      </div>
                  </div>
              </div>
          `;
        }
    }

    function updateUIWithData(data) {
        const contentUser = document.getElementById('nsft-scripted-rec-content-user');
        const contentClient = document.getElementById('nsft-scripted-rec-content-client');
        const contentWorkflow = document.getElementById('nsft-scripted-rec-content-workflow');
        if (!contentUser) return;

        contentUser.innerHTML = '';
        contentClient.innerHTML = '';
        contentWorkflow.innerHTML = '';

        contentUser.dataset.animated = 'false';
        contentClient.dataset.animated = 'false';
        contentWorkflow.dataset.animated = 'false';

        const tStatus = (val) => {
            if (!val) return val;
            const s = val.toUpperCase().trim();
            if (s === 'RELEASED') return chrome.i18n.getMessage('sr_status_released');
            if (s === 'TESTING') return chrome.i18n.getMessage('sr_status_testing');
            if (s === 'NOTSCHEDULED') return chrome.i18n.getMessage('sr_status_not_scheduled');
            if (s === 'SUSPENDED') return chrome.i18n.getMessage('sr_status_suspended');
            if (s === 'T' || s === 'YES' || s === 'T (YES)') return chrome.i18n.getMessage('sr_yes');
            if (s === 'F' || s === 'NO' || s === 'F (NO)') return chrome.i18n.getMessage('sr_no');
            return val;
        };

        const createCard = (content) => {
            return `<div class="nsft-scripted-rec-card"><div class="nsft-scripted-rec-card-content" style="display: block;">${content}</div></div>`;
        };

        if (data.isCustomList && data.customListFields) {
            const table = `<table class="nsft-scripted-rec-table"><thead><tr><th>Field Name/ID</th><th>Type</th></tr></thead><tbody>${data.customListFields.map(f => `<tr><td><span style="color:#0070f3;">${escapeHtml(f.name)}</span><br><span style="color:#9ca3af; font-size:10px;">${escapeHtml(f.fieldid)}</span></td><td>${escapeHtml(f.fieldvaluetype || '-')}</td></tr>`).join('')}</tbody></table>`;
            contentUser.innerHTML = createCard(table);
        } else {
            let userScriptsHtml = '', clientScriptsHtml = '', userCount = 0, clientCount = 0;

            if (data.scriptDeployments) {
                Object.entries(data.scriptDeployments).forEach(([type, scripts]) => {
                    const table = `<table class="nsft-scripted-rec-table">
                  <thead>
                    <tr>
                        <th class="nsft-sr-th-bulk" style="text-align:center; width:24px;"><input type="checkbox" class="nsft-sr-bulk-master" data-sr-bulk-master="${escapeHtml(type)}" title="${escapeHtml(chrome.i18n.getMessage('sr_bulk_select_all') || 'Seleccionar todos')}"></th>
                        <th>${chrome.i18n.getMessage('sr_owner')}</th>
                        <th>${chrome.i18n.getMessage('sr_deployed')}</th>
                        <th>${chrome.i18n.getMessage('sr_status')}</th>
                        <th>${chrome.i18n.getMessage('sr_api')}</th>
                        <th style="text-align:center;">${chrome.i18n.getMessage('sr_logs_short') || 'Logs'}</th>
                        <th style="text-align:center;">&lt;/&gt;</th>
                    </tr>
                  </thead>
                  <tbody>${scripts.map(s => {
                        let apiC = s.apiVersion === '2.1' ? 'nsft-scripted-rec-badge-teal' : (s.apiVersion === '2.0' ? 'nsft-scripted-rec-badge-purple' : 'nsft-scripted-rec-badge-yellow');
                        let st = (s.status || '').toUpperCase();
                        let stC = (st === 'RELEASED' || st === 'ACTIVE') ? 'nsft-scripted-rec-badge-released' : 'nsft-scripted-rec-badge-yellow';

                        let fnH = s.functions && s.functions.length > 0
                            ? `<div class="nsft-scripted-rec-functions-list">${s.functions.map(f => `<div class="nsft-scripted-rec-function-item"><span class="nsft-scripted-rec-function-type">${escapeHtml(f.type)}: </span><span style="font-weight:bolder;">${escapeHtml(f.name)}</span></div>`).join('')}</div>`
                            : '';

                        const isNotDeployedOrInactive = s.isDeployed !== 'T' || s.isInactive === 'T';
                        const rowInactiveClass = isNotDeployedOrInactive ? 'nsft-scripted-rec-row-inactive' : '';
                        const activeAttr = isNotDeployedOrInactive ? 'inactive' : 'active';
                        const deployedAttr = s.isDeployed === 'T' ? 'deployed' : 'notdeployed';
                        const releaseAttr = (s.status || '').toUpperCase().trim() || 'UNKNOWN';
                        const apiAttr = s.apiVersion || '-';

                        const fnNames = (s.functions || []).map(f => f.name).filter(Boolean).join(' ');
                        const searchHaystack = [s.name, s.owner, s.scriptTextId, s.deploymentTextId, fnNames]
                            .filter(Boolean).join(' ').toLowerCase();

                        return `<tr class="${rowInactiveClass}" data-sr-active="${escapeHtml(activeAttr)}" data-sr-release="${escapeHtml(releaseAttr)}" data-sr-api="${escapeHtml(apiAttr)}" data-sr-deployed="${escapeHtml(deployedAttr)}" data-sr-script-inactive="${s.isInactive === 'T' ? 'T' : 'F'}" data-sr-deployment-id="${escapeHtml(s.deploymentId || '')}" data-sr-script-id="${escapeHtml(s.scriptId || '')}" data-sr-search="${escapeHtml(searchHaystack)}">
                          <td class="nsft-sr-td-bulk" style="text-align:center;"><input type="checkbox" class="nsft-sr-bulk-row" data-sr-bulk-row data-sr-deployment-id="${escapeHtml(s.deploymentId || '')}"></td>
                          <td data-tooltip="${escapeHtml(s.description || chrome.i18n.getMessage('sr_no_description'))}">
                            <div class="nsft-sr-name-row">
                                <a href="${escapeHtml(s.url)}" target="_blank" class="nsft-sr-name-link">${escapeHtml(s.name)}</a>
                            </div>
                            <div class="nsft-scripted-rec-owner-inline">${chrome.i18n.getMessage('sr_propietario')}: ${escapeHtml(s.owner || '-')}</div>
                            ${fnH}
                          </td>
                          <td><span class="nsft-scripted-rec-badge ${s.isDeployed === 'T' ? 'nsft-scripted-rec-badge-blue' : 'nsft-scripted-rec-badge-red'}">${escapeHtml(tStatus(s.isDeployed))}</span></td>
                          <td><span class="nsft-scripted-rec-badge ${stC}">${escapeHtml(tStatus(s.status))}</span></td>
                          <td><span class="nsft-scripted-rec-badge ${apiC}" style="font-family:monospace;">${escapeHtml(s.apiVersion || '-')}</span></td>
                          <td style="text-align:center;">
                            <button type="button" class="nsft-sr-logs-btn nsft-scripted-rec-info-container" data-sr-action="view-logs" data-sr-script-id="${escapeHtml(s.scriptId || '')}" data-sr-script-name="${escapeHtml(s.name || '')}" data-sr-script-url="${escapeHtml(s.url || '')}" data-sr-script-file="${escapeHtml(s.scriptFile || '')}" data-tooltip="${escapeHtml(chrome.i18n.getMessage('sr_logs_view_tooltip') || 'Ver últimas 100 entradas de log')}" style="background:none; border:0; padding:2px; cursor:pointer; color:#6b7280; display:inline-flex;">
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
                            </button>
                          </td>
                          <td style="text-align:center;">
                            ${s.scriptFile ? `<a href="${escapeHtml(s.scriptFile)}" target="_blank" class="nsft-scripted-rec-info-container" data-tooltip="${escapeHtml(chrome.i18n.getMessage('sr_view_code'))}" style="color: #6b7280; display: inline-flex; cursor: pointer;"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg></a>` : '-'}
                          </td>
                      </tr>`;
                    }).join('')}</tbody></table>`;

                    const rawType = String(type || '').toUpperCase();
                    if (rawType === 'USEREVENT') {
                        userScriptsHtml += createCard(table);
                        userCount += scripts.length;
                    } else if (rawType === 'CLIENT') {
                        clientScriptsHtml += createCard(table);
                        clientCount += scripts.length;
                    }
                });
            }

            contentUser.innerHTML = userScriptsHtml || `<div style="padding:20px; text-align:center; color:#9ca3af;">${chrome.i18n.getMessage('sr_no_scripts_found')}</div>`;
            contentClient.innerHTML = clientScriptsHtml || `<div style="padding:20px; text-align:center; color:#9ca3af;">${chrome.i18n.getMessage('sr_no_scripts_found')}</div>`;

            _srCounts.user = userCount;
            _srCounts.client = clientCount;
            _srSetTabLabel('nsft-scripted-rec-tab-user', 'sr_tab_user', userCount);
            _srSetTabLabel('nsft-scripted-rec-tab-client', 'sr_tab_client', clientCount);

            let wfCount = 0;
            if (data.workflows && data.workflows.length > 0) {
                wfCount = data.workflows.length;
                const table = `<table class="nsft-scripted-rec-table"><thead><tr><th>${chrome.i18n.getMessage('sr_workflow')}</th><th>${chrome.i18n.getMessage('sr_status')}</th></tr></thead><tbody>${data.workflows.map(w => {
                    let rSt = (w.releasestatus || '').toUpperCase();
                    let rC = (rSt === 'RELEASED') ? 'nsft-scripted-rec-badge-released' : (rSt === 'TESTING' ? 'nsft-scripted-rec-badge-yellow' : 'nsft-scripted-rec-badge-gray');
                    const wfInactive = (rSt === 'SUSPENDED' || rSt === 'NOTINITIATING') ? 'nsft-scripted-rec-row-inactive' : '';
                    return `<tr class="${wfInactive}" data-sr-wf-release="${escapeHtml(rSt || 'UNKNOWN')}"><td><div style="margin-bottom: 2px;"><a href="${escapeHtml(w.url)}" target="_blank" style="color:#0070f3; text-decoration:none; font-weight:600;">${escapeHtml(w.name)}</a></div><div class="nsft-scripted-rec-owner-inline">${chrome.i18n.getMessage('sr_propietario')}: ${escapeHtml(w.owner || '-')}</div>${w.currentState ? `<div style="font-size:9px; color:#4b5563; margin-top:2px;">${chrome.i18n.getMessage('sr_current_state')}: <span style="font-weight:600;">${escapeHtml(w.currentState)}</span></div>` : ''}</td><td><span class="nsft-scripted-rec-badge ${rC}">${escapeHtml(tStatus(w.releasestatus))}</span></td></tr>`;
                }).join('')}</tbody></table>`;
                contentWorkflow.innerHTML = createCard(table);
            } else {
                contentWorkflow.innerHTML = `<div style="padding:20px; text-align:center; color:#9ca3af;">${chrome.i18n.getMessage('sr_no_workflows_found')}</div>`;
            }

            _srCounts.workflow = wfCount;
            _srSetTabLabel('nsft-scripted-rec-tab-workflow', 'sr_tab_workflow', wfCount);
        }

        let activeIndex = 0;
        const activeTab = document.querySelector('#nsft-scripted-rec-modal .nsft-scripted-rec-tab.active');
        if (activeTab && activeTab.dataset.index != null) {
            activeIndex = parseInt(activeTab.dataset.index, 10);
        }
        animateTabContent(activeIndex);
    }

    function filterScripts(q) {
        q = (q || '').toLowerCase().trim();
        const clearBtn = document.getElementById('nsft-scripted-rec-search-clear');
        if (clearBtn) clearBtn.style.display = q ? 'block' : 'none';

        const styleId = 'nsft-sr-global-search-style';
        let style = document.getElementById(styleId);
        if (!style) {
            style = document.createElement('style');
            style.id = styleId;
            document.head.appendChild(style);
            addCleanup(() => style.remove());
        }
        if (!q) {
            style.textContent = '';
            return;
        }
        const safe = _cssAttrEscape(q);
        style.textContent = `#nsft-scripted-rec-modal .nsft-scripted-rec-table tr[data-sr-search]:not([data-sr-search*="${safe}"]) { display: none; }`;
    }

    const getLoadingHtml = (text) => {
        if (!text) text = chrome.i18n.getMessage('sr_loading_data');
        const spans = text.split('').map(char => `<span${char === ' ' ? ' style="width: 4px;"' : ''}>${char}</span>`).join('');
        return `<div class="nsft-loading-text">${spans}</div>`;
    };

    const buildScriptFiltersHtml = (tabIndex) => {
        const t = (k, f) => chrome.i18n.getMessage(k) || f;
        return `
            <div class="nsft-sr-filter-row" data-sr-tab-filter="${tabIndex}" style="display:${tabIndex === 0 ? 'flex' : 'none'};">
                <label class="nsft-sr-filter-group">
                    <span>${t('sr_filter_active', 'Activo')}</span>
                    <select data-sr-filter-field="active" data-sr-filter-tab="${tabIndex}">
                        <option value="__all__">${t('sr_opt_all', 'Todos')}</option>
                        <option value="active">${t('sr_opt_active', 'Activo')}</option>
                        <option value="inactive">${t('sr_opt_inactive', 'Inactivo')}</option>
                    </select>
                </label>
                <label class="nsft-sr-filter-group">
                    <span>${t('sr_filter_deployed', 'Desplegado')}</span>
                    <select data-sr-filter-field="deployed" data-sr-filter-tab="${tabIndex}">
                        <option value="__all__">${t('sr_opt_all', 'Todos')}</option>
                        <option value="deployed">${t('sr_opt_yes', 'Sí')}</option>
                        <option value="notdeployed">${t('sr_opt_no', 'No')}</option>
                    </select>
                </label>
                <label class="nsft-sr-filter-group">
                    <span>${t('sr_filter_release', 'Estado')}</span>
                    <select data-sr-filter-field="release" data-sr-filter-tab="${tabIndex}">
                        <option value="__all__">${t('sr_opt_all', 'Todos')}</option>
                        <option value="RELEASED">${t('sr_opt_released', 'Liberado')}</option>
                        <option value="TESTING">${t('sr_opt_testing', 'En pruebas')}</option>
                        <option value="NOTSCHEDULED">${t('sr_opt_not_scheduled', 'No programado')}</option>
                        <option value="SUSPENDED">${t('sr_opt_suspended', 'Suspendido')}</option>
                    </select>
                </label>
                <label class="nsft-sr-filter-group">
                    <span>${t('sr_filter_api', 'API')}</span>
                    <select data-sr-filter-field="api" data-sr-filter-tab="${tabIndex}">
                        <option value="__all__">${t('sr_opt_all', 'Todos')}</option>
                        <option value="1.0">1.0</option>
                        <option value="2.0">2.0</option>
                        <option value="2.1">2.1</option>
                    </select>
                </label>
                <button type="button" class="nsft-sr-filter-reset" data-sr-reset-filters data-sr-filter-tab="${tabIndex}" title="${t('sr_filter_reset', 'Restablecer filtros')}" aria-label="${t('sr_filter_reset', 'Restablecer filtros')}">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path><path d="M10 11v6"></path><path d="M14 11v6"></path><path d="M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"></path></svg>
                </button>
            </div>`;
    };

    const buildWorkflowFiltersHtml = (tabIndex) => {
        const t = (k, f) => chrome.i18n.getMessage(k) || f;
        return `
            <div class="nsft-sr-filter-row" data-sr-tab-filter="${tabIndex}" style="display:none;">
                <label class="nsft-sr-filter-group">
                    <span>${t('sr_filter_release', 'Estado')}</span>
                    <select data-sr-filter-field="wf-release" data-sr-filter-tab="${tabIndex}">
                        <option value="__all__">${t('sr_opt_all', 'Todos')}</option>
                        <option value="RELEASED">${t('sr_opt_released', 'Liberado')}</option>
                        <option value="TESTING">${t('sr_opt_testing', 'En pruebas')}</option>
                        <option value="SUSPENDED">${t('sr_opt_suspended', 'Suspendido')}</option>
                        <option value="NOTINITIATING">${t('sr_opt_not_initiating', 'No inicia')}</option>
                    </select>
                </label>
                <button type="button" class="nsft-sr-filter-reset" data-sr-reset-filters data-sr-filter-tab="${tabIndex}" title="${t('sr_filter_reset', 'Restablecer filtros')}" aria-label="${t('sr_filter_reset', 'Restablecer filtros')}">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path><path d="M10 11v6"></path><path d="M14 11v6"></path><path d="M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"></path></svg>
                </button>
            </div>`;
    };

    const getHtmlTemplate = () => `
       <div class="nsft-scripted-rec-modal" id="nsft-scripted-rec-modal" data-state="maximised" style="display: none;">
         <div class="nsft-sr-header">
             <span id="nsft-sr-title"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#000000" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 6px; vertical-align: middle;"><polyline points="16 18 22 12 16 6"></polyline><polyline points="8 6 2 12 8 18"></polyline></svg>${chrome.i18n.getMessage('sr_title')}</span>
             <span class="nsft-header-actions">
               <span id="nsft-sr-reload" title="${chrome.i18n.getMessage('sr_reload')}">
                 <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="nsft-no-events"><path d="M23 4v6h-6"></path><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path></svg>
               </span>
               <span id="nsft-sr-minimise" title="${chrome.i18n.getMessage('sr_minimise')}"></span>
               <span id="nsft-sr-maximise" title="${chrome.i18n.getMessage('sr_maximise')}"></span>
               <span id="nsft-sr-close" title="${chrome.i18n.getMessage('sr_close')}">✕</span>
             </span>
             <div class="nsft-sr-header-line"></div>
         </div>
         <div class="nsft-sr-content">
             
             <!-- TABS -->
             <div class="nsft-sr-tabs-wrap" style="display: flex; border-bottom: 1px solid #e5e7eb; background-color: #fff; z-index: 2;">
                <div class="nsft-scripted-rec-tab active" id="nsft-scripted-rec-tab-user" data-index="0" style="flex: 1; text-align: center; padding: 10px 0; cursor: pointer; font-size: 12px; font-weight: 600; color: #0070f3; border-bottom: 2px solid #0070f3;">${chrome.i18n.getMessage('sr_tab_user')}</div>
                <div class="nsft-scripted-rec-tab" id="nsft-scripted-rec-tab-client" data-index="1" style="flex: 1; text-align: center; padding: 10px 0; cursor: pointer; font-size: 12px; font-weight: 500; color: #6b7280; border-bottom: 2px solid transparent;">${chrome.i18n.getMessage('sr_tab_client')}</div>
                <div class="nsft-scripted-rec-tab" id="nsft-scripted-rec-tab-workflow" data-index="2" style="flex: 1; text-align: center; padding: 10px 0; cursor: pointer; font-size: 12px; font-weight: 500; color: #6b7280; border-bottom: 2px solid transparent;">${chrome.i18n.getMessage('sr_tab_workflow')}</div>
             </div>
             
             <!-- SEARCH + FILTROS INDEPENDIENTES POR TAB -->
             <div class="nsft-scripted-rec-search-container">
                  <div class="nsft-sr-search-wrap">
                    <input id="nsft-scripted-rec-search-input" placeholder="${chrome.i18n.getMessage('sr_search_placeholder')}" autocomplete="off">
                    <span id="nsft-scripted-rec-search-clear" title="${chrome.i18n.getMessage('sr_clear_search')}" class="nsft-clear-search">✕</span>
                  </div>

                  ${buildScriptFiltersHtml(0)}
                  ${buildScriptFiltersHtml(1)}
                  ${buildWorkflowFiltersHtml(2)}
             </div>

             <!-- LOADING -->
             <div id="nsft-scripted-rec-global-loading" style="position: absolute; inset: 0; background: rgba(255,255,255,0.9); z-index: 10; display: flex; flex-direction: column; align-items: center; justify-content: center; top: 88px;">
                 ${getLoadingHtml()}
             </div>

             <!-- BULK ACTION TOOLBAR (visible cuando hay rows checkeados) -->
             <div id="nsft-sr-bulk-toolbar" class="nsft-sr-bulk-toolbar" style="display: none;">
                <span id="nsft-sr-bulk-count">${chrome.i18n.getMessage('sr_bulk_count_zero') || '0 seleccionados'}</span>
                <button type="button" id="nsft-sr-bulk-enable" class="nsft-sr-bulk-action nsft-sr-bulk-enable">${chrome.i18n.getMessage('sr_bulk_enable') || 'Activar'}</button>
                <button type="button" id="nsft-sr-bulk-disable" class="nsft-sr-bulk-action nsft-sr-bulk-disable">${chrome.i18n.getMessage('sr_bulk_disable') || 'Desactivar'}</button>
                <button type="button" id="nsft-sr-bulk-clear" class="nsft-sr-bulk-clear">${chrome.i18n.getMessage('sr_bulk_clear') || 'Limpiar'}</button>
                <span id="nsft-sr-bulk-status" class="nsft-sr-bulk-status"></span>
             </div>

             <!-- BANNER persistente para resultados/errores de bulk (sobrevive
                  al clearBulkSelection que oculta el toolbar). Cerrable. -->
             <div id="nsft-sr-banner" class="nsft-sr-banner" style="display: none;" role="status" aria-live="polite">
                <span id="nsft-sr-banner-text" class="nsft-sr-banner-text"></span>
                <button type="button" id="nsft-sr-banner-close" class="nsft-sr-banner-close" aria-label="Cerrar">✕</button>
             </div>

             <!-- SLIDER CONTENT -->
             <div id="nsft-scripted-rec-container" style="flex: 1; overflow: hidden; position: relative;">
                  <div id="nsft-scripted-rec-slider" style="display: flex; width: 300%; height: 100%; transition: transform 0.4s cubic-bezier(0.25, 1, 0.5, 1);">
                      <div id="nsft-scripted-rec-content-user" class="nsft-scripted-rec-tab-content" style="flex: 0 0 33.333%; padding: 12px 12px 2px 12px; box-sizing: border-box;"></div>
                      <div id="nsft-scripted-rec-content-client" class="nsft-scripted-rec-tab-content" style="flex: 0 0 33.333%; padding: 12px 12px 2px 12px; box-sizing: border-box;"></div>
                      <div id="nsft-scripted-rec-content-workflow" class="nsft-scripted-rec-tab-content" style="flex: 0 0 33.333%; padding: 12px 12px 2px 12px; box-sizing: border-box;"></div>
                  </div>

                  <!-- LOGS PANEL: overlay sobre el slider cuando el usuario clickea el icono de logs.
                       Su contenido se renderiza dinámicamente y "Volver" lo oculta. -->
                  <div id="nsft-sr-logs-panel" class="nsft-sr-logs-panel" style="display: none;">
                      <div class="nsft-sr-logs-header">
                          <button type="button" id="nsft-sr-logs-back" class="nsft-sr-logs-back">
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>
                              <span>${chrome.i18n.getMessage('sr_logs_back') || 'Volver'}</span>
                          </button>
                          <span id="nsft-sr-logs-title" class="nsft-sr-logs-title"></span>
                          <div class="nsft-sr-logs-header-actions">
                              <!-- Modo en vivo: re-ejecuta el SQL en intervalo. Inicia desactivado. -->
                              <button type="button" id="nsft-sr-logs-live" class="nsft-sr-logs-action nsft-sr-icon-only nsft-sr-logs-live" data-tooltip="${escapeHtml(chrome.i18n.getMessage('liveMode') || 'Modo en vivo')}" aria-label="${escapeHtml(chrome.i18n.getMessage('liveMode') || 'Modo en vivo')}" aria-pressed="false">
                                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline></svg>
                              </button>
                              <!-- Refresh: re-ejecuta el SQL contra ScriptNote para ver logs nuevos. -->
                              <button type="button" id="nsft-sr-logs-refresh" class="nsft-sr-logs-action nsft-sr-icon-only" data-tooltip="${escapeHtml(chrome.i18n.getMessage('sr_logs_refresh') || 'Refrescar logs')}" aria-label="${escapeHtml(chrome.i18n.getMessage('sr_logs_refresh') || 'Refrescar logs')}">
                                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"></polyline><polyline points="1 20 1 14 7 14"></polyline><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10"></path><path d="M20.49 15a9 9 0 0 1-14.85 3.36L1 14"></path></svg>
                              </button>
                              <!-- Dropdown "Columnas" para mostrar/ocultar columnas del table -->
                              <div class="nsft-sr-cols-wrap">
                                  <button type="button" id="nsft-sr-cols-toggle" class="nsft-sr-logs-action nsft-sr-icon-only" data-tooltip="${escapeHtml(chrome.i18n.getMessage('sr_logs_cols') || 'Columnas')}" aria-label="${escapeHtml(chrome.i18n.getMessage('sr_logs_cols') || 'Columnas')}" aria-haspopup="true" aria-expanded="false">
                                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="8" y1="6" x2="21" y2="6"></line><line x1="8" y1="12" x2="21" y2="12"></line><line x1="8" y1="18" x2="21" y2="18"></line><line x1="3" y1="6" x2="3.01" y2="6"></line><line x1="3" y1="12" x2="3.01" y2="12"></line><line x1="3" y1="18" x2="3.01" y2="18"></line></svg>
                                  </button>
                                  <div id="nsft-sr-cols-menu" class="nsft-sr-cols-menu" style="display: none;" role="menu">
                                      <label><input type="checkbox" data-sr-col="num">${chrome.i18n.getMessage('sr_logs_col_num') || '#'}</label>
                                      <label><input type="checkbox" data-sr-col="ts">${chrome.i18n.getMessage('sr_logs_col_date') || 'Fecha'}</label>
                                      <label><input type="checkbox" data-sr-col="type">${chrome.i18n.getMessage('sr_logs_col_type') || 'Tipo'}</label>
                                      <label><input type="checkbox" data-sr-col="title">${chrome.i18n.getMessage('sr_logs_col_title') || 'Título'}</label>
                                      <label><input type="checkbox" data-sr-col="detail">${chrome.i18n.getMessage('sr_logs_col_detail') || 'Detalle'}</label>
                                  </div>
                              </div>
                              <!-- Abre el script record en una pestaña nueva. -->
                              <a id="nsft-sr-logs-open-script" class="nsft-sr-logs-action nsft-sr-icon-only" target="_blank" rel="noopener noreferrer" href="#" data-tooltip="${escapeHtml(chrome.i18n.getMessage('sr_logs_open_script') || 'Abrir script record')}" aria-label="${escapeHtml(chrome.i18n.getMessage('sr_logs_open_script') || 'Abrir script record')}">
                                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>
                              </a>
                              <!-- Editar el file del script (archivo .js en el File Cabinet). -->
                              <a id="nsft-sr-logs-edit-file" class="nsft-sr-logs-action nsft-sr-icon-only" target="_blank" rel="noopener noreferrer" href="#" data-tooltip="${escapeHtml(chrome.i18n.getMessage('sr_logs_edit_file') || 'Editar archivo del script')}" aria-label="${escapeHtml(chrome.i18n.getMessage('sr_logs_edit_file') || 'Editar archivo del script')}">
                                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                              </a>
                              <!-- Abre el archivo completo de logs (scriptnotearchive.nl) en una pestaña nueva. -->
                              <a id="nsft-sr-logs-full" class="nsft-sr-logs-action nsft-sr-icon-only nsft-sr-logs-full" target="_blank" rel="noopener noreferrer" href="#" data-tooltip="${escapeHtml(chrome.i18n.getMessage('sr_logs_full') || 'Logs completos')}" aria-label="${escapeHtml(chrome.i18n.getMessage('sr_logs_full') || 'Logs completos')}">
                                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>
                              </a>
                          </div>
                      </div>
                      <div id="nsft-sr-logs-body" class="nsft-sr-logs-body"></div>
                  </div>
             </div>
         </div>
         <div class="nsft-sr-footer">
             <!-- Footer content -->
         </div>
       </div>
       <div id="nsft-sr-global-tooltip" class="nsft-sr-global-tooltip"></div>`;

})();
