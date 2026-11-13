(function () {
    'use strict';
    if (window.NSFT_Herramientas) window.NSFT_Herramientas.vigila('#nsft-scripted-rec-modal', 'scripted');

    function ensureSqlTransport() {
        if (window.NSFT_SuiteQLRest && window.NSFT_SuiteQLRest.ensureTransport) {
            window.NSFT_SuiteQLRest.ensureTransport();
        }
    }
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
        el.innerHTML = escapeHtml(base) + (count == null ? '' : '<span class="nsft-sr-cnt">' + escapeHtml(String(count)) + '</span>');
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
    }

    function setupListeners() {
        const onShow = function (evt) {
            if (window.NSFT_ShortcutCoach) window.NSFT_ShortcutCoach.hint('view_scripted_record');
            const modal = document.getElementById('nsft-scripted-rec-modal');
            if (!modal) {
                initModal(false);
            } else {
                if (!_srLoaded) loadRecordData();
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

        if (!isPreload) loadRecordData();
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

        if (modal) {
            const onKey = (e) => {
                if (e.key !== 'Escape') return;
                if (_sr.abierto) { e.stopPropagation(); _sr.abierto = null; srPintaFiltros(); return; }
                if (searchInput && e.target === searchInput && searchInput.value) {
                    e.stopPropagation();
                    searchInput.value = '';
                    filterScripts('');
                }
            };
            document.addEventListener('keydown', onKey, true);
            addCleanup(() => document.removeEventListener('keydown', onKey, true));
        }

        if (modal) {
            const onModalClick = (e) => {
                const chip = e.target.closest('[data-sr-chip]');
                if (chip) {
                    const k = chip.getAttribute('data-sr-chip');
                    _sr.abierto = _sr.abierto === k ? null : k;
                    srPintaFiltros();
                    return;
                }
                const opt = e.target.closest('[data-sr-opt]');
                if (opt) {
                    _sr.filtros[srTabActiva()][opt.getAttribute('data-sr-opt')] = opt.getAttribute('data-sr-val');
                    _sr.abierto = null;
                    srPinta();
                    return;
                }
                if (e.target.closest('[data-sr-limpiar]')) {
                    _sr.filtros[srTabActiva()] = {};
                    _sr.abierto = null;
                    srPinta();
                    return;
                }
                if (_sr.abierto && !e.target.closest('.nsft-sr-dd')) {
                    _sr.abierto = null;
                    srPintaFiltros();
                }
                if (e.target.closest('#nsft-sr-bulk-all')) {
                    srSeleccionaVisibles();
                    return;
                }
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
                    const id = cb.getAttribute('data-sr-deployment-id');
                    if (id) { if (cb.checked) _sr.sel.add(id); else _sr.sel.delete(id); }
                    const fila = cb.closest('.nsft-sr-fila');
                    if (fila) fila.classList.toggle('is-sel', cb.checked);
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
    const codeUrl = (u) => (window.NSFT_CodeLink ? window.NSFT_CodeLink.convierte(u) : u);

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
            editFileLink.href = codeUrl(scriptFile) || '#';
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
        const tNivel = (typ) => {
            const t = String(typ || '').toUpperCase().trim();
            const k = t === 'EMERGENCY' ? 'emergency' : /^SYSTEM/.test(t) ? 'system'
                : t === 'ERROR' ? 'error' : t === 'AUDIT' ? 'audit' : t === 'DEBUG' ? 'debug' : '';
            return k ? ' nsft-sr-lvl-' + k : '';
        };
        const tNivelTxt = (typ) => {
            const s = String(typ || '').trim().toLowerCase();
            return s.charAt(0).toUpperCase() + s.slice(1);
        };

        const rows = data.map((r, i) => `
            <tr class="${tStatus(r.type)}">
              <td class="nsft-sr-log-num">${i + 1}</td>
              <td class="nsft-sr-log-ts">${escapeHtml(r.ts || '')}</td>
              <td class="nsft-sr-log-type"><span class="nsft-scripted-rec-badge nsft-estado${tNivel(r.type)}">${escapeHtml(tNivelTxt(r.type))}</span></td>
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
        return Array.from(_sr.sel);
    }

    function srSeleccionaVisibles() {
        const tab = srTabActiva();
        if (tab === 2) return;
        srVisibles(tab).forEach((s) => { if (s.deploymentId) _sr.sel.add(String(s.deploymentId)); });
        srPinta();
        updateBulkToolbarState();
    }

    function updateBulkToolbarState() {
        const ids = getSelectedDeployments();
        const toolbar = document.getElementById('nsft-sr-bulk-toolbar');
        const countEl = document.getElementById('nsft-sr-bulk-count');
        if (!toolbar) return;
        toolbar.style.display = ids.length ? 'flex' : 'none';
        const modalSel = document.getElementById('nsft-scripted-rec-modal');
        if (modalSel) modalSel.classList.toggle('is-marcando', ids.length > 0);
        if (countEl) {
            const tpl = ids.length === 1
                ? (chrome.i18n.getMessage('sr_bulk_count_one') || '1 selected')
                : (chrome.i18n.getMessage('sr_bulk_count', [String(ids.length)]) || `${ids.length} selected`);
            countEl.textContent = tpl.replace('$1', String(ids.length));
        }
    }

    function clearBulkSelection(onlyIds) {
        if (Array.isArray(onlyIds)) onlyIds.forEach((id) => _sr.sel.delete(String(id)));
        else _sr.sel.clear();
        srPinta();
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

        const okIds = new Set(okList.map(r => String(r.deploymentId)));
        srTodos().forEach((s) => {
            if (!okIds.has(String(s.deploymentId))) return;
            s.isDeployed = isDeployedBool ? 'T' : 'F';
            if (_srRunsMap) delete _srRunsMap[String(s.deploymentId)];
        });
        clearBulkSelection(okList.map(r => r.deploymentId));

        if (modal) {
            failList.forEach(r => {
                const row = modal.querySelector(`.nsft-sr-fila[data-sr-deployment-id="${CSS.escape(String(r.deploymentId))}"]`);
                flashRowFailure(row);
            });
        }
        if (okList.length) loadRecordData();

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


    const _sr = {
        datos: null,
        filtros: [{}, {}, {}],
        abierto: null,
        q: '',
        sel: new Set(),
        yo: ''
    };

    const srT = (k, fb, subs) => chrome.i18n.getMessage(k, subs) || fb;
    const srUp = (v) => String(v || '').toUpperCase().trim();

    function srTabActiva() {
        const t = document.querySelector('#nsft-scripted-rec-modal .nsft-scripted-rec-tab.active');
        const n = t ? parseInt(t.dataset.index, 10) : 0;
        return isNaN(n) ? 0 : n;
    }

    function srTodos() {
        return _sr.datos ? [].concat(_sr.datos[0] || [], _sr.datos[1] || []) : [];
    }

    const SR_EVENTOS = {
        beforeload: 'beforeLoad', beforesubmit: 'beforeSubmit', aftersubmit: 'afterSubmit',
        pageinit: 'pageInit', saverecord: 'saveRecord', validatefield: 'validateField',
        fieldchanged: 'fieldChanged', postsourcing: 'postSourcing', lineinit: 'lineInit',
        validateline: 'validateLine', validateinsert: 'validateInsert', validatedelete: 'validateDelete',
        recalc: 'sublistChanged', localizationcontextenter: 'localizationContextEnter',
        localizationcontextexit: 'localizationContextExit'
    };
    const srEvento = (t) => SR_EVENTOS[String(t || '').toLowerCase()] || t;

    const SR_FILTROS_SCRIPT = [
        { k: 'active', l: ['sr_filter_active', 'Active'], v: (s) => (s.isInactive === 'T' ? 'inactive' : 'active'),
          o: [['active', 'sr_opt_active', 'Active'], ['inactive', 'sr_opt_inactive', 'Inactive']] },
        { k: 'deployed', l: ['sr_filter_deployed', 'Deployed'], v: (s) => (s.isDeployed === 'T' ? 'deployed' : 'notdeployed'),
          o: [['deployed', 'sr_opt_yes', 'Yes'], ['notdeployed', 'sr_opt_no', 'No']] },
        { k: 'release', l: ['sr_filter_release', 'Status'], v: (s) => srUp(s.status),
          o: [['RELEASED', 'sr_opt_released', 'Released'], ['TESTING', 'sr_opt_testing', 'Testing'],
              ['NOTSCHEDULED', 'sr_opt_not_scheduled', 'Not scheduled'], ['SUSPENDED', 'sr_opt_suspended', 'Suspended']] },
        { k: 'api', l: ['sr_filter_api', 'API'], v: (s) => s.apiVersion || '-',
          o: [['1.0', '', '1.0'], ['2.0', '', '2.0'], ['2.1', '', '2.1']] }
    ];
    const SR_FILTROS_WF = [
        { k: 'release', l: ['sr_filter_release', 'Status'], v: (w) => srUp(w.releasestatus),
          o: [['RELEASED', 'sr_opt_released', 'Released'], ['TESTING', 'sr_opt_testing', 'Testing'],
              ['SUSPENDED', 'sr_opt_suspended', 'Suspended'], ['NOTINITIATING', 'sr_opt_not_initiating', 'Not initiating']] }
    ];
    const srFiltrosDe = (tab) => (tab === 2 ? SR_FILTROS_WF : SR_FILTROS_SCRIPT);
    const srEstadoTxt = (v) => {
        const s = srUp(v);
        const f = SR_FILTROS_SCRIPT[2].o.concat(SR_FILTROS_WF[0].o).find((o) => o[0] === s);
        return f ? srT(f[1], f[2]) : (v || '—');
    };

    function srPajar(tab, s) {
        if (tab === 2) return srFold([s.name, s.owner, s.currentState, srEstadoTxt(s.releasestatus)].filter(Boolean).join(' '));
        const fns = (s.functions || []).map((f) => srEvento(f.type) + ' ' + (f.name || '')).join(' ');
        return srFold([s.name, s.owner, s.scriptTextId, s.deploymentTextId, fns].filter(Boolean).join(' '));
    }

    function srPasa(tab, s, salvo) {
        if (_sr.q && srPajar(tab, s).indexOf(_sr.q) === -1) return false;
        const f = _sr.filtros[tab];
        return srFiltrosDe(tab).every((d) => d.k === salvo || !f[d.k] || d.v(s) === f[d.k]);
    }
    const srVisibles = (tab) => ((_sr.datos && _sr.datos[tab]) || []).filter((s) => srPasa(tab, s));

    function srVeredictos(tab) {
        const lista = (_sr.datos && _sr.datos[tab]) || [];
        const out = new Map();
        if (tab === 2) {
            lista.forEach((w) => {
                const st = srUp(w.releasestatus);
                if (st === 'RELEASED') out.set(w, { corre: true, tono: 'ok' });
                else if (st === 'TESTING') {
                    const mio = _sr.yo && String(w.owner || '').trim().toLowerCase() === _sr.yo.trim().toLowerCase();
                    out.set(w, mio
                        ? { corre: true, tono: 'warn', mt: 'warn', por: srT('sr_runs_r_testing_mine', 'Testing · you are the owner') }
                        : { corre: false, mt: 'warn', por: srT('sr_runs_r_testing', 'In testing: only runs for its owner ($1)', [w.owner || '—']) });
                } else if (st === 'SUSPENDED' || st === 'NOTINITIATING') {
                    out.set(w, { corre: false, mt: 'off', por: srEstadoTxt(st) });
                } else out.set(w, { corre: null, por: '' });
            });
            return out;
        }
        let clientes = 0;
        lista.forEach((s) => {
            const est = srUp(s.status);
            if (est === 'NOTSCHEDULED') { out.set(s, { corre: false, mt: 'off', por: srEstadoTxt(est) }); return; }
            if (_srRunsMap === undefined) { out.set(s, { corre: null, espera: true }); return; }
            let code = _srRunsMap ? (_srRunsMap[String(s.deploymentId)] || '') : '';
            if (code === 'RUNS' && tab === 1 && ++clientes > 10) code = 'MAXED';
            if (!code) { out.set(s, { corre: null, mt: 'info', por: srT('sr_runs_unknown', 'Could not be checked') }); return; }
            if (code === 'RUNS') {
                out.set(s, srUp(s.status) === 'TESTING'
                    ? { corre: true, tono: 'warn', mt: 'warn', por: srT('sr_runs_r_testing_mine', 'Testing · you are the owner') }
                    : { corre: true, tono: 'ok' });
                return;
            }
            if (code === 'GROUP') { out.set(s, { corre: null, tono: 'warn', mt: 'warn', por: srT('sr_runs_r_group', 'Only through a group: could not be checked') }); return; }
            out.set(s, {
                corre: false,
                mt: (code === 'TESTING' || code === 'MAXED') ? 'warn' : (code === 'INACTIVE' || code === 'UNDEPLOYED') ? 'off' : 'info',
                por: code === 'INACTIVE' ? srT('sr_runs_r_inactive', 'The script is inactive')
                    : code === 'UNDEPLOYED' ? srT('sr_runs_r_undeployed', 'Not deployed')
                    : code === 'TESTING' ? srT('sr_runs_r_testing', 'In testing: only runs for its owner ($1)', [s.owner || '—'])
                    : code === 'MAXED' ? srT('sr_runs_r_maxed', 'Over the limit of 10 client scripts per record type')
                    : srT('sr_runs_r_audience', 'You are not in its audience')
            });
        });
        return out;
    }

    const SR_ICO_INFO = '<svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><circle cx="8" cy="8" r="6.2"/><path d="M8 7.4v3.6M8 5.2v.01"/></svg>';
    const SR_ICO_LOG = '<svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 2h5.5L12 4.5V14H4z"/><path d="M6 7.5h4M6 10h4"/></svg>';
    const SR_ICO_CODE = '<svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5.5 4.5 2 8l3.5 3.5M10.5 4.5 14 8l-3.5 3.5"/></svg>';
    const SR_ICO_WF = '<svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="4" cy="4" r="1.8"/><circle cx="12" cy="12" r="1.8"/><path d="M4 6v2.5a2 2 0 0 0 2 2h4"/></svg>';
    const SR_ICO_BAJA = '<svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 6l4 4 4-4"/></svg>';

    function srMarcaTxt(txt) {
        const TS = window.NSFT_TextSearch;
        return _sr.q && TS && TS.markHtml ? TS.markHtml(String(txt == null ? '' : txt), _sr.q, 'nsft-sr-hl') : escapeHtml(txt);
    }

    function srFila(tab, s, v) {
        const esWf = tab === 2;
        const corre = v.corre === true;
        const tono = corre ? (v.tono || 'ok') : (v.corre === null && v.tono ? v.tono : 'off');
        const veredicto = v.espera
            ? srT('sr_runs_checking', 'Checking…')
            : corre ? srT('sr_runs_yes_you', 'Runs for you')
            : v.corre === false ? srT('sr_runs_no_you', 'Not for you')
            : srT('sr_runs_maybe', 'Depends');
        const st = srUp(esWf ? s.releasestatus : s.status);
        const stTono = st === 'RELEASED' ? 'ok' : st === 'TESTING' ? 'warn' : 'off';
        const sep = '<span class="nsft-sr-sep">·</span>';
        const id = String(s.deploymentId || '');
        const marcado = !esWf && id && _sr.sel.has(id);

        let meta = '<span>' + escapeHtml(srT('sr_propietario', 'Owner')) + ': ' + srMarcaTxt(s.owner || '-') + '</span>';
        if (!esWf) {
            const dep = s.isDeployed === 'T';
            meta += sep + '<span class="nsft-sr-f is-' + (dep ? 'ok' : 'off') + (dep ? '' : ' is-fuerte') + '"><i></i>'
                + escapeHtml(dep ? srT('sr_deployed', 'Deployed') : srT('sr_not_deployed', 'Not deployed')) + '</span>';
        }
        meta += sep + '<span class="nsft-sr-f is-' + stTono + (st === 'RELEASED' ? '' : ' is-fuerte') + '"><i></i>' + srMarcaTxt(srEstadoTxt(st)) + '</span>';
        if (!esWf && s.isInactive === 'T') meta += sep + '<span class="nsft-sr-malo">' + escapeHtml(srT('sr_opt_inactive', 'Inactive')) + '</span>';
        if (esWf && s.currentState) meta += sep + '<span>' + escapeHtml(srT('sr_current_state', 'Current state')) + ': <b>' + srMarcaTxt(s.currentState) + '</b></span>';

        const ents = !esWf && s.functions && s.functions.length
            ? '<div class="nsft-sr-ents">' + s.functions.map((f) => {
                const ev = srEvento(f.type);
                const fn = f.name || ev;
                return '<span class="nsft-sr-ent"><i></i><span class="nsft-sr-ev">' + srMarcaTxt(ev) + '</span><span class="nsft-sr-fn" title="' + escapeHtml(fn) + '">' + srMarcaTxt(fn) + '</span></span>';
            }).join('') + '</div>'
            : '';

        const apiV = String(s.apiVersion || '');
        const apiCls = apiV === '2.1' ? ' is-21' : /^2\./.test(apiV) ? ' is-2x' : /^1\./.test(apiV) ? ' is-vieja' : '';
        const api = esWf ? '' : '<span class="nsft-sr-api' + apiCls + '" title="' + escapeHtml(srT('sr_api_tip', 'SuiteScript version')) + '">' + escapeHtml(s.apiVersion || '—') + '</span>';
        const acciones = esWf
            ? '<a class="nsft-sr-act" href="' + escapeHtml(s.url || '#') + '" target="_blank" rel="noopener" data-tooltip="' + escapeHtml(srT('sr_open_workflow', 'Open workflow')) + '">' + SR_ICO_WF + '</a>'
            : '<button type="button" class="nsft-sr-act" data-sr-action="view-logs" data-sr-script-id="' + escapeHtml(s.scriptId || '') + '" data-sr-script-name="' + escapeHtml(s.name || '') + '" data-sr-script-url="' + escapeHtml(s.url || '') + '" data-sr-script-file="' + escapeHtml(s.scriptFile || '') + '" data-tooltip="' + escapeHtml(srT('sr_logs_view_tooltip', 'View the latest 100 log entries')) + '">' + SR_ICO_LOG + '</button>'
              + (s.scriptFile ? '<a class="nsft-sr-act" href="' + escapeHtml(codeUrl(s.scriptFile)) + '" target="_blank" rel="noopener" data-tooltip="' + escapeHtml(srT('sr_view_code', 'View code')) + '">' + SR_ICO_CODE + '</a>' : '');

        const marca = '<span class="nsft-sr-marca"><span class="nsft-sr-punto is-' + tono + '"></span>'
            + (esWf || !id ? '' : '<input type="checkbox" class="nsft-sr-bulk-row" data-sr-deployment-id="' + escapeHtml(id) + '"' + (marcado ? ' checked' : '') + ' aria-label="' + escapeHtml(s.name || '') + '">')
            + '</span>';

        return '<div class="nsft-sr-fila' + (corre ? ' is-corre' : '') + (esWf ? ' is-wf' : '') + (marcado ? ' is-sel' : '') + '"' + (id ? ' data-sr-deployment-id="' + escapeHtml(id) + '"' : '') + '>'
            + marca
            + '<a class="nsft-sr-nombre" href="' + escapeHtml(s.url || '#') + '" target="_blank" rel="noopener" data-tooltip="' + escapeHtml(s.description || srT('sr_no_description', 'No description')) + '">' + srMarcaTxt(s.name) + '</a>'
            + '<span class="nsft-sr-veredicto"><b>' + escapeHtml(veredicto) + '</b>' + (v.por ? '<span class="nsft-sr-motivo is-' + (v.mt || 'info') + '" title="' + escapeHtml(v.por) + '">' + SR_ICO_INFO + '<span>' + escapeHtml(v.por) + '</span></span>' : '') + '</span>'
            + api
            + '<span class="nsft-sr-acts">' + acciones + '</span>'
            + '<div class="nsft-sr-meta">' + meta + '</div>'
            + ents
            + '</div>';
    }

    function srPintaLista(tab) {
        const cont = document.getElementById(_srContainerId(tab));
        if (!cont || !_sr.datos) return;
        const todos = _sr.datos[tab] || [];
        const H = window.NSFT_Herramientas;
        if (!todos.length) {
            const txt = tab === 2 ? srT('sr_no_workflows_found', 'No workflows found.') : srT('sr_no_scripts_found', 'No scripts found.');
            cont.innerHTML = H ? H.vacio(tab === 2 ? 'trail' : 'scripted', txt) : '<div class="nsft-sr-vacio">' + escapeHtml(txt) + '</div>';
            return;
        }
        const lista = srVisibles(tab);
        if (!lista.length) {
            cont.innerHTML = H
                ? H.vacio('buscar', srT('sr_empty_filtered', 'No results. Change the search or clear the filters.'))
                : '<div class="nsft-sr-vacio">' + escapeHtml(srT('sr_empty_filtered', 'No results. Change the search or clear the filters.')) + '</div>';
            return;
        }
        const ver = srVeredictos(tab);
        const si = lista.filter((s) => ver.get(s).corre === true);
        const duda = lista.filter((s) => ver.get(s).corre === null);
        const no = lista.filter((s) => ver.get(s).corre === false);
        let html = si.concat(duda).map((s) => srFila(tab, s, ver.get(s))).join('');
        if (no.length) {
            if (si.length || duda.length) {
                html += '<div class="nsft-sr-grupo"><span>' + escapeHtml(srT('sr_group_not_for_you', 'Not running for you · $1', [String(no.length)])) + '</span><i></i></div>';
            }
            html += no.map((s) => srFila(tab, s, ver.get(s))).join('');
        }
        cont.innerHTML = '<div class="nsft-sr-lista">' + html + '</div>';
    }

    function srPintaFiltros() {
        if (!_sr.datos) return;
        [0, 1, 2].forEach((tab) => {
            const fila = document.querySelector('#nsft-scripted-rec-modal .nsft-sr-filter-row[data-sr-tab-filter="' + tab + '"]');
            if (!fila) return;
            const todos = _sr.datos[tab] || [];
            const f = _sr.filtros[tab];
            const activa = srTabActiva() === tab;
            let html = srFiltrosDe(tab).map((d) => {
                const base = todos.filter((s) => srPasa(tab, s, d.k));
                const val = f[d.k];
                const elegida = d.o.find((o) => o[0] === val);
                const valTxt = elegida ? (elegida[1] ? srT(elegida[1], elegida[2]) : elegida[2]) : srT('sr_opt_all', 'All');
                const opciones = [['', 'sr_opt_all', 'All']].concat(d.o);
                const menu = activa && _sr.abierto === d.k
                    ? '<div class="nsft-sr-menu" role="menu">' + opciones.map((o) => {
                        const on = (o[0] || '') === (val || '');
                        const n = o[0] ? base.filter((s) => d.v(s) === o[0]).length : base.length;
                        return '<button type="button" role="menuitemradio" aria-checked="' + on + '" class="nsft-sr-opt' + (on ? ' is-on' : '') + '" data-sr-opt="' + d.k + '" data-sr-val="' + escapeHtml(o[0]) + '">'
                            + '<span class="nsft-sr-ck">' + (on ? '✓' : '') + '</span>'
                            + '<span class="nsft-sr-ot">' + escapeHtml(o[1] ? srT(o[1], o[2]) : o[2]) + '</span>'
                            + '<span class="nsft-sr-on">' + n + '</span></button>';
                    }).join('') + '</div>'
                    : '';
                return '<div class="nsft-sr-dd"><button type="button" class="nsft-sr-chip' + (val ? ' is-on' : '') + '" data-sr-chip="' + d.k + '" aria-haspopup="menu" aria-expanded="' + (!!menu) + '">'
                    + '<span class="nsft-sr-chip-l">' + escapeHtml(srT(d.l[0], d.l[1])) + ':</span><span class="nsft-sr-chip-v">' + escapeHtml(valTxt) + '</span>' + SR_ICO_BAJA + '</button>' + menu + '</div>';
            }).join('');
            if (Object.keys(f).some((k) => f[k])) {
                html += '<button type="button" class="nsft-sr-limpiar" data-sr-limpiar>' + escapeHtml(srT('sr_filter_clear', 'Clear filters')) + '</button>';
            }
            fila.innerHTML = html;
        });
    }

    function srPintaContadores() {
        if (!_sr.datos) return;
        const ids = ['nsft-scripted-rec-tab-user', 'nsft-scripted-rec-tab-client', 'nsft-scripted-rec-tab-workflow'];
        const claves = ['sr_tab_user', 'sr_tab_client', 'sr_tab_workflow'];
        const nombres = ['user', 'client', 'workflow'];
        [0, 1, 2].forEach((tab) => {
            const todos = _sr.datos[tab] || [];
            const sabe = tab === 2 || _srRunsMap !== undefined;
            let txt = String(todos.length);
            if (sabe && todos.length) {
                const ver = srVeredictos(tab);
                txt = todos.filter((s) => ver.get(s).corre === true).length + '/' + todos.length;
            }
            _srCounts[nombres[tab]] = txt;
            _srSetTabLabel(ids[tab], claves[tab], txt);
        });
    }

    function srPintaPie() {
        const pie = document.querySelector('#nsft-scripted-rec-modal .nsft-sr-footer');
        if (!pie) return;
        if (!_sr.datos) { pie.innerHTML = ''; return; }
        const tab = srTabActiva();
        const total = (_sr.datos[tab] || []).length;
        const n = srVisibles(tab).length;
        pie.innerHTML = (_sr.yo ? '<span>' + escapeHtml(srT('sr_viewing_as', 'Viewing as')) + ' <b>' + escapeHtml(_sr.yo) + '</b></span>' : '')
            + '<span class="nsft-sr-pie-hueco"></span>'
            + '<span class="nsft-sr-pie-cuenta">' + escapeHtml(srT('sr_count_of', '$1 of $2', [String(n), String(total)])) + '</span>';
    }

    function srPinta() {
        if (!_sr.datos) return;
        [0, 1, 2].forEach(srPintaLista);
        srPintaFiltros();
        srPintaContadores();
        srPintaPie();
    }

    function _srContainerId(index) {
        return ['nsft-scripted-rec-content-user',
                'nsft-scripted-rec-content-client',
                'nsft-scripted-rec-content-workflow'][index];
    }

    function updateFilterBar(index) {
        const modal = document.getElementById('nsft-scripted-rec-modal');
        if (!modal) return;
        modal.querySelectorAll('.nsft-sr-filter-row').forEach((row) => {
            const rowIdx = parseInt(row.getAttribute('data-sr-tab-filter'), 10);
            row.style.display = rowIdx === index ? 'flex' : 'none';
        });
        _sr.abierto = null;
        srPintaFiltros();
        srPintaPie();
    }

    function initUIFunctionality() {
        const tabs = document.querySelectorAll('#nsft-scripted-rec-modal .nsft-scripted-rec-tab');
        const slider = document.getElementById('nsft-scripted-rec-slider');

        tabs.forEach(tab => {
            tab.addEventListener('click', function () {
                const index = parseInt(this.dataset.index);
                tabs.forEach(t => t.classList.remove('active'));
                this.classList.add('active');

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
        const rect = el.getBoundingClientRect();

        el.style.right = 'auto';
        el.style.bottom = 'auto';

        const isMin = el.dataset.state === 'minimised';
        const viewportWidth = window.innerWidth;

        const targetWidth = isMin ? 44 : rect.width;
        const centerX = rect.left + (rect.width / 2);

        const p = 15;

        if (centerX < (viewportWidth / 2)) {
            el.style.left = p + 'px';
        } else {
            el.style.left = (viewportWidth - targetWidth - p) + 'px';
        }

        constrainModalToWindow(el);
    }

    let _srLoaded = false;

    function loadRecordData() {
        _srLoaded = true;
        _srRunsMap = undefined;
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

        ensureSqlTransport();
        const script = document.createElement('script');
        script.id = scriptId;
        script.async = false;
        script.src = chrome.runtime.getURL('scripts/modules/view_scripted_record/scripted_record_fetcher.js');
        script.onload = function () {
            window.postMessage(payload, '*');
            this.remove();
        };
        (window.NSFT_AfterLoad ? window.NSFT_AfterLoad.append(script) : (document.head || document.documentElement).appendChild(script));
    }

    let _srRunsMap;

    function renderRunsForMe(map, yo) {
        _srRunsMap = map;
        if (yo) _sr.yo = String(yo).replace(/\s+/g, ' ').trim();
        srPinta();
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
        if (message.type === 'runs_success') {
            renderRunsForMe(message.data || {}, message.me || '');
            return;
        }
        if (message.type === 'runs_error') {
            renderRunsForMe(null);
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
            const table = `<table class="nsft-scripted-rec-table"><thead><tr><th>Field Name/ID</th><th>Type</th></tr></thead><tbody>${data.customListFields.map(f => `<tr><td><span style="color:var(--nsft-ns-accent, #0070f3);">${escapeHtml(f.name)}</span><br><span style="color:#9ca3af;">${escapeHtml(f.fieldid)}</span></td><td>${escapeHtml(f.fieldvaluetype || '-')}</td></tr>`).join('')}</tbody></table>`;
            contentUser.innerHTML = createCard(table);
            _sr.datos = null;
            const pie = document.querySelector('#nsft-scripted-rec-modal .nsft-sr-footer');
            if (pie) pie.innerHTML = '';
        } else {
            const dep = data.scriptDeployments || {};
            const deTipo = (tipo) => Object.keys(dep).filter((k) => String(k).toUpperCase() === tipo)
                .reduce((acc, k) => acc.concat(dep[k] || []), []);
            _sr.datos = { 0: deTipo('USEREVENT'), 1: deTipo('CLIENT'), 2: data.workflows || [] };
            const vivos = new Set(srTodos().map((s) => String(s.deploymentId)));
            Array.from(_sr.sel).forEach((id) => { if (!vivos.has(id)) _sr.sel.delete(id); });
            srPinta();
            updateBulkToolbarState();
        }

        let activeIndex = 0;
        const activeTab = document.querySelector('#nsft-scripted-rec-modal .nsft-scripted-rec-tab.active');
        if (activeTab && activeTab.dataset.index != null) {
            activeIndex = parseInt(activeTab.dataset.index, 10);
        }
        animateTabContent(activeIndex);
    }

    function srFold(s) {
        const TS = window.NSFT_TextSearch;
        return TS ? TS.fold(s) : String(s == null ? '' : s).toLowerCase();
    }

    function filterScripts(q) {
        _sr.q = srFold((q || '').trim());
        const clearBtn = document.getElementById('nsft-scripted-rec-search-clear');
        if (clearBtn) clearBtn.style.display = _sr.q ? 'block' : 'none';
        srPinta();
    }

    const getLoadingHtml = (text) => {
        if (!text) text = chrome.i18n.getMessage('sr_loading_data');
        const spans = text.split('').map(char => `<span${char === ' ' ? ' style="width: 4px;"' : ''}>${char}</span>`).join('');
        return `<div class="nsft-loading-text">${spans}</div>`;
    };

    const buildFilterRowHtml = (tabIndex) =>
        `<div class="nsft-sr-filter-row" data-sr-tab-filter="${tabIndex}" style="display:${tabIndex === 0 ? 'flex' : 'none'};"></div>`;

    const getHtmlTemplate = () => `
       <div class="nsft-modal nsft-modal--panel nsft-scripted-rec-modal" id="nsft-scripted-rec-modal" data-state="maximised" style="display: none;">
         <div class="nsft-modal-header nsft-sr-header">
             <span id="nsft-sr-title" class="nsft-modal-title"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#000000" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 6px; vertical-align: middle;"><polyline points="16 18 22 12 16 6"></polyline><polyline points="8 6 2 12 8 18"></polyline></svg>${chrome.i18n.getMessage('sr_title')}</span>
             <div class="nsft-modal-tools nsft-modal-hide-min">
              <span id="nsft-sr-reload" class="nsft-modal-tool" title="${chrome.i18n.getMessage('sr_reload')}"><span class="nsft-modal-tc nsft-c2"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="nsft-no-events"><path d="M23 4v6h-6"></path><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path></svg></span><span>${chrome.i18n.getMessage('ro_tool_reload') || 'Reload'}</span></span>
            </div>
            <span class="nsft-header-actions">
               <span id="nsft-sr-minimise" class="nsft-modal-btn-minimise" title="${chrome.i18n.getMessage('sr_minimise')}"></span>
               <span id="nsft-sr-maximise" class="nsft-modal-btn-maximise" title="${chrome.i18n.getMessage('sr_maximise')}"></span>
               <span id="nsft-sr-close" class="nsft-modal-btn-close" title="${chrome.i18n.getMessage('sr_close')}">✕</span>
             </span>
             <div class="nsft-modal-header-line nsft-sr-header-line"></div>
         </div>
         <div class="nsft-sr-content">
             
             
             <div class="nsft-sr-tabs-wrap">
                <div class="nsft-scripted-rec-tab active" id="nsft-scripted-rec-tab-user" data-index="0">${chrome.i18n.getMessage('sr_tab_user')}</div>
                <div class="nsft-scripted-rec-tab" id="nsft-scripted-rec-tab-client" data-index="1">${chrome.i18n.getMessage('sr_tab_client')}</div>
                <div class="nsft-scripted-rec-tab" id="nsft-scripted-rec-tab-workflow" data-index="2">${chrome.i18n.getMessage('sr_tab_workflow')}</div>
             </div>
             
             
             <div class="nsft-scripted-rec-search-container">
                  <div class="nsft-sr-search-wrap">
                    <input id="nsft-scripted-rec-search-input" placeholder="${chrome.i18n.getMessage('sr_search_placeholder')}" autocomplete="off">
                    <span id="nsft-scripted-rec-search-clear" title="${chrome.i18n.getMessage('sr_clear_search')}" class="nsft-clear-search">✕</span>
                  </div>

                  ${buildFilterRowHtml(0)}
                  ${buildFilterRowHtml(1)}
                  ${buildFilterRowHtml(2)}
             </div>

             
             <div id="nsft-scripted-rec-global-loading" style="position: absolute; inset: 0; background: rgba(255,255,255,0.9); z-index: 10; display: flex; flex-direction: column; align-items: center; justify-content: center; top: 88px;">
                 ${getLoadingHtml()}
             </div>

             
             <div id="nsft-sr-bulk-toolbar" class="nsft-sr-bulk-toolbar" style="display: none;">
                <span id="nsft-sr-bulk-count">${chrome.i18n.getMessage('sr_bulk_count_zero') || '0 seleccionados'}</span>
                <button type="button" id="nsft-sr-bulk-all" class="nsft-sr-bulk-clear">${chrome.i18n.getMessage('sr_bulk_all_visible') || 'Select visible'}</button>
                <button type="button" id="nsft-sr-bulk-enable" class="nsft-sr-bulk-action nsft-sr-bulk-enable">${chrome.i18n.getMessage('sr_bulk_enable') || 'Activar'}</button>
                <button type="button" id="nsft-sr-bulk-disable" class="nsft-sr-bulk-action nsft-sr-bulk-disable">${chrome.i18n.getMessage('sr_bulk_disable') || 'Desactivar'}</button>
                <button type="button" id="nsft-sr-bulk-clear" class="nsft-sr-bulk-clear" title="${escapeHtml(chrome.i18n.getMessage('sr_bulk_clear') || 'Clear')}" aria-label="${escapeHtml(chrome.i18n.getMessage('sr_bulk_clear') || 'Clear')}"><svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8"/></svg></button>
                <span id="nsft-sr-bulk-status" class="nsft-sr-bulk-status nsft-estado is-warn"></span>
             </div>

             
             <div id="nsft-sr-banner" class="nsft-sr-banner" style="display: none;" role="status" aria-live="polite">
                <span id="nsft-sr-banner-text" class="nsft-sr-banner-text"></span>
                <button type="button" id="nsft-sr-banner-close" class="nsft-sr-banner-close" aria-label="Cerrar">✕</button>
             </div>

             
             <div id="nsft-scripted-rec-container" style="flex: 1; overflow: hidden; position: relative;">
                  <div id="nsft-scripted-rec-slider" style="display: flex; width: 300%; height: 100%; transition: transform 0.4s cubic-bezier(0.25, 1, 0.5, 1);">
                      <div id="nsft-scripted-rec-content-user" class="nsft-scripted-rec-tab-content" style="flex: 0 0 33.333%; box-sizing: border-box;"></div>
                      <div id="nsft-scripted-rec-content-client" class="nsft-scripted-rec-tab-content" style="flex: 0 0 33.333%; box-sizing: border-box;"></div>
                      <div id="nsft-scripted-rec-content-workflow" class="nsft-scripted-rec-tab-content" style="flex: 0 0 33.333%; box-sizing: border-box;"></div>
                  </div>

                  
                  <div id="nsft-sr-logs-panel" class="nsft-sr-logs-panel" style="display: none;">
                      <div class="nsft-sr-logs-header">
                          <button type="button" id="nsft-sr-logs-back" class="nsft-sr-logs-back">
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>
                              <span>${chrome.i18n.getMessage('sr_logs_back') || 'Volver'}</span>
                          </button>
                          <span id="nsft-sr-logs-title" class="nsft-sr-logs-title"></span>
                          <div class="nsft-sr-logs-header-actions">
                              
                              <button type="button" id="nsft-sr-logs-live" class="nsft-sr-logs-action nsft-sr-icon-only nsft-sr-logs-live" data-tooltip="${escapeHtml(chrome.i18n.getMessage('liveMode') || 'Modo en vivo')}" aria-label="${escapeHtml(chrome.i18n.getMessage('liveMode') || 'Modo en vivo')}" aria-pressed="false">
                                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline></svg>
                              </button>
                              
                              <button type="button" id="nsft-sr-logs-refresh" class="nsft-sr-logs-action nsft-sr-icon-only" data-tooltip="${escapeHtml(chrome.i18n.getMessage('sr_logs_refresh') || 'Refrescar logs')}" aria-label="${escapeHtml(chrome.i18n.getMessage('sr_logs_refresh') || 'Refrescar logs')}">
                                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"></polyline><polyline points="1 20 1 14 7 14"></polyline><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10"></path><path d="M20.49 15a9 9 0 0 1-14.85 3.36L1 14"></path></svg>
                              </button>
                              
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
                              
                              <a id="nsft-sr-logs-open-script" class="nsft-sr-logs-action nsft-sr-icon-only" target="_blank" rel="noopener noreferrer" href="#" data-tooltip="${escapeHtml(chrome.i18n.getMessage('sr_logs_open_script') || 'Abrir script record')}" aria-label="${escapeHtml(chrome.i18n.getMessage('sr_logs_open_script') || 'Abrir script record')}">
                                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>
                              </a>
                              
                              <a id="nsft-sr-logs-edit-file" class="nsft-sr-logs-action nsft-sr-icon-only" target="_blank" rel="noopener noreferrer" href="#" data-tooltip="${escapeHtml(chrome.i18n.getMessage('sr_logs_edit_file') || 'Editar archivo del script')}" aria-label="${escapeHtml(chrome.i18n.getMessage('sr_logs_edit_file') || 'Editar archivo del script')}">
                                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                              </a>
                              
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
             
         </div>
       </div>
       <div id="nsft-sr-global-tooltip" class="nsft-sr-global-tooltip"></div>`;

})();
