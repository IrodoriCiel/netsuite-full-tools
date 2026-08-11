(function () {
    'use strict';

    const STORAGE_KEY = 'enableRecordLogsViewer';
    const THEME_KEY = 'nsftTheme';
    const PRETTIER_THEME_KEY = 'logPrettierTheme';
    const PREFS_KEY = 'nsftRlvPrefs';
    const FETCHER_SCRIPT = 'scripts/modules/record_logs_viewer/record_logs_viewer_fetcher.js';
    const CUSTOM_EVENT = 'nsft-show-record-logs';
    const MODAL_ID = 'nsft-rlv-modal';
    const PAGE_SIZE = 250;
    const Q_DEBOUNCE_MS = 350;
    const MORE_MARGIN_PX = 400;
    const AUTO_DEFAULT_SECS = 10;
    const AUTO_MIN_SECS = 2;
    const AUTO_MAX_SECS = 3600;
    const SKELETON_ROWS = 10;
    const EXPORT_MAX = 10000;
    const EXPORT_NOTE_MS = 8000;
    const BURST_GAP_MS = 5000;
    const LEVELS = ['DEBUG', 'AUDIT', 'ERROR', 'EMERGENCY', 'SYSTEM'];

    const RECORD_TYPE_NAMES = {
        SALESORDER: 'Sales Order', INVOICE: 'Invoice', ESTIMATE: 'Estimate',
        OPPORTUNITY: 'Opportunity', CASHSALE: 'Cash Sale', CASHREFUND: 'Cash Refund',
        CREDITMEMO: 'Credit Memo', CUSTOMERPAYMENT: 'Customer Payment',
        CUSTOMERDEPOSIT: 'Customer Deposit', CUSTOMERREFUND: 'Customer Refund',
        RETURNAUTHORIZATION: 'Return Authorization', DEPOSITAPPLICATION: 'Deposit Application',
        PURCHASEORDER: 'Purchase Order', VENDORBILL: 'Vendor Bill',
        VENDORPAYMENT: 'Vendor Payment', VENDORCREDIT: 'Vendor Credit',
        VENDORRETURNAUTHORIZATION: 'Vendor Return Authorization',
        PURCHASEREQUISITION: 'Purchase Requisition', BLANKETPURCHASEORDER: 'Blanket Purchase Order',
        ITEMRECEIPT: 'Item Receipt', ITEMFULFILLMENT: 'Item Fulfillment',
        INVENTORYADJUSTMENT: 'Inventory Adjustment', INVENTORYTRANSFER: 'Inventory Transfer',
        TRANSFERORDER: 'Transfer Order', WORKORDER: 'Work Order',
        ASSEMBLYBUILD: 'Assembly Build', ASSEMBLYUNBUILD: 'Assembly Unbuild',
        BINTRANSFER: 'Bin Transfer', BINWORKSHEET: 'Bin Putaway Worksheet',
        INVENTORYCOUNT: 'Inventory Count', ITEMSUPPLYPLAN: 'Item Supply Plan',
        WORKORDERISSUE: 'Work Order Issue', WORKORDERCOMPLETION: 'Work Order Completion',
        JOURNALENTRY: 'Journal Entry', INTERCOMPANYJOURNALENTRY: 'Intercompany Journal Entry',
        ADVINTERCOMPANYJOURNALENTRY: 'Advanced Intercompany Journal Entry',
        CHECK: 'Check', DEPOSIT: 'Deposit', EXPENSEREPORT: 'Expense Report',
        PAYCHECK: 'Paycheck', PAYCHECKJOURNAL: 'Paycheck Journal',
        REVENUEARRANGEMENT: 'Revenue Arrangement', REVENUECOMMITMENT: 'Revenue Commitment',
        STATEMENTCHARGE: 'Statement Charge', TIMEBILL: 'Time Tracking',
        CUSTOMER: 'Customer', VENDOR: 'Vendor', EMPLOYEE: 'Employee', CONTACT: 'Contact',
        PARTNER: 'Partner', LEAD: 'Lead', PROSPECT: 'Prospect', JOB: 'Project',
        ENTITYGROUP: 'Group', SUBSIDIARY: 'Subsidiary', CUSTOMERSTATUS: 'Customer Status',
        INVENTORYITEM: 'Inventory Item', NONINVENTORYITEM: 'Non-Inventory Item',
        SERVICEITEM: 'Service Item', OTHERCHARGEITEM: 'Other Charge Item',
        ASSEMBLYITEM: 'Assembly / Bill of Materials', KITITEM: 'Kit / Package',
        DISCOUNTITEM: 'Discount Item', MARKUPITEM: 'Markup Item', PAYMENTITEM: 'Payment Item',
        SUBTOTALITEM: 'Subtotal Item', DESCRIPTIONITEM: 'Description Item',
        GIFTCERTIFICATEITEM: 'Gift Certificate Item', DOWNLOADITEM: 'Download Item',
        ITEMGROUP: 'Item Group', LOTNUMBEREDINVENTORYITEM: 'Lot Numbered Inventory Item',
        SERIALIZEDINVENTORYITEM: 'Serialized Inventory Item',
        LOTNUMBEREDASSEMBLYITEM: 'Lot Numbered Assembly Item',
        SERIALIZEDASSEMBLYITEM: 'Serialized Assembly Item',
        SUPPORTCASE: 'Support Case', TASK: 'Task', CALL: 'Phone Call', EVENT: 'Event',
        CAMPAIGN: 'Campaign', SOLUTION: 'Solution', ISSUE: 'Issue',
        PROJECTTASK: 'Project Task', TIMEENTRY: 'Time Entry',
        ACCOUNT: 'Account', CLASSIFICATION: 'Class', DEPARTMENT: 'Department',
        LOCATION: 'Location', CURRENCY: 'Currency', PRICELEVEL: 'Price Level',
        ACCOUNTINGPERIOD: 'Accounting Period', BIN: 'Bin', UNITSTYPE: 'Units Type',
        FOLDER: 'Folder', FILE: 'File', NOTE: 'Note', MESSAGE: 'Message',
        CUSTOMLIST: 'Custom List', CUSTOMRECORD: 'Custom Record',
        BUDGET: 'Budget', BUDGETIMPORT: 'Budget Import', TERM: 'Term',
        PROMOTIONCODE: 'Promotion Code', PRICINGGROUP: 'Pricing Group'
    };

    const PANEL_MODE = location.protocol === 'chrome-extension:';

    if (!PANEL_MODE && !/\.app\.netsuite\.com$/.test(location.hostname)) return;

    let _enabled = false;
    let _theme = 'light';
    let _prettierTheme = 'auto';
    let _fetcherInjected = false;
    let _eventListener = null;
    let _shortcutBound = false;
    let _messageListener = null;
    let _autoTimer = null;
    let _resizeObs = null;
    let _autoLeft = 0;

    const S = {
        context: null,
        scopeType: null,
        homeType: null,
        homeScript: null,
        scopeScript: null,
        scopeLoading: false,
        recordTypes: null,
        recordNames: {},
        rtLoading: false,
        selected: new Set(),
        levels: new Set(),
        stypes: new Set(),
        q: '',
        range: 'all',
        from: '',
        to: '',
        page: 0,
        total: 0,
        noMore: false,
        rows: [],
        counts: { levels: {}, scripts: {} },
        loading: false,
        reqId: 0,
        exporting: null,
        expId: 0,
        expLoaded: 0,
        expTotal: 0,
        selIdx: -1,
        detailOpen: false,
        group: true,
        auto: false,
        autoSecs: AUTO_DEFAULT_SECS,
        showAllTypes: false,
        lastMs: null,
        lastAt: null
    };

    function contextAlive() {
        try { return !!(chrome && chrome.runtime && chrome.runtime.id); } catch (e) { return false; }
    }

    function i18n(key, fallback, subs) {
        if (!contextAlive()) { clearTimers(); return fallback || ''; }
        try {
            const msg = chrome.i18n.getMessage(key, subs);
            return msg || fallback || '';
        } catch (e) { return fallback || ''; }
    }

    let _openMode = 'modal';

    chrome.storage.local.get({
        [STORAGE_KEY]: true,
        [THEME_KEY]: 'light',
        [PRETTIER_THEME_KEY]: 'auto',
        [PREFS_KEY]: null,
        recordLogsViewerOpenMode: 'modal'
    }, (items) => {
        _theme = items[THEME_KEY] || 'light';
        _prettierTheme = items[PRETTIER_THEME_KEY] || 'auto';
        _openMode = items.recordLogsViewerOpenMode || 'modal';
        const p = items[PREFS_KEY];
        if (p && typeof p === 'object') {
            if (typeof p.group === 'boolean') S.group = p.group;
            if (typeof p.auto === 'boolean') S.auto = p.auto;
            if (p.autoSecs != null) S.autoSecs = sanitizeSecs(p.autoSecs);
        }
        attachStorageListener();
        if (!items[STORAGE_KEY]) return;
        start();
    });

    function savePrefs() {
        try {
            chrome.storage.local.set({
                [PREFS_KEY]: { group: S.group, auto: S.auto, autoSecs: S.autoSecs }
            });
        } catch (e) { }
    }

    function sanitizeSecs(v) {
        const n = parseInt(v, 10);
        if (!n || n < AUTO_MIN_SECS) return AUTO_MIN_SECS;
        return Math.min(n, AUTO_MAX_SECS);
    }

    function attachStorageListener() {
        chrome.storage.onChanged.addListener((changes, area) => {
            if (area !== 'local') return;
            if (changes[STORAGE_KEY]) {
                const on = changes[STORAGE_KEY].newValue !== false;
                if (on) start();
                else stop();
            }
            if (changes.recordLogsViewerOpenMode) {
                _openMode = changes.recordLogsViewerOpenMode.newValue || 'modal';
            }
            if (changes[THEME_KEY]) {
                _theme = changes[THEME_KEY].newValue || 'light';
                const modal = document.getElementById(MODAL_ID);
                if (modal) modal.setAttribute('data-theme', resolveTheme());
            }
            if (changes[PRETTIER_THEME_KEY]) {
                _prettierTheme = changes[PRETTIER_THEME_KEY].newValue || 'auto';
            }
        });
    }

    function resolveTheme() {
        return _theme === 'dark' ? 'dark' : 'light';
    }

    function start() {
        if (_enabled) return;
        _enabled = true;
        _eventListener = openViewer;
        window.addEventListener(CUSTOM_EVENT, _eventListener);
        _messageListener = onFetcherMessage;
        window.addEventListener('message', _messageListener);
        bindShortcut();
        if (PANEL_MODE) {
            chrome.runtime.onMessage.addListener((m) => {
                if (!m || m.nsftRlv !== 'envelope' || !m.data) return;
                onFetcherMessage({ source: window, data: m.data });
            });
            seguirPestana();
            openViewer();
        } else {
            startPageRelay();
        }
    }

    const RELAY_TTL_MS = 90000;
    let _relayUntil = 0;

    function startPageRelay() {
        if (!chrome.runtime || !chrome.runtime.onMessage) return;
        chrome.runtime.onMessage.addListener((m, sender, sendResponse) => {
            if (!m) return;
            if (m.nsftRlv === 'ping') {
                sendResponse({ ok: true });
                return;
            }
            if (m.nsftRlv === 'openInPage') {
                window.dispatchEvent(new CustomEvent(CUSTOM_EVENT, { detail: { fromPanel: true } }));
                sendResponse({ ok: true });
                return;
            }
            if (m.nsftRlv !== 'toFetcher' || !m.msg) return;
            _relayUntil = Date.now() + RELAY_TTL_MS;
            injectFetcher(() => { window.postMessage(m.msg, '*'); });
            sendResponse({ ok: true });
        });
        window.addEventListener('message', (e) => {
            if (e.source !== window) return;
            const d = e.data;
            if (!d || d.dest !== 'extension_rlv') return;
            if (Date.now() > _relayUntil) return;
            try {
                chrome.runtime.sendMessage({ nsftRlv: 'envelope', data: d }, () => {
                    void chrome.runtime.lastError;
                });
            } catch (err) { }
        });
    }

    function sendEnvelope(msg) {
        if (!PANEL_MODE) { window.postMessage(msg, '*'); return; }
        chrome.tabs.query({ active: true, lastFocusedWindow: true }, (tabs) => {
            const tab = tabs && tabs[0];
            const esNs = tab && tab.url && /^https:\/\/[^/]*\.app\.netsuite\.com\//.test(tab.url);
            if (!tab || tab.id == null || !esNs) { panelNoTab(msg); return; }
            chrome.tabs.sendMessage(tab.id, { nsftRlv: 'toFetcher', msg }, () => {
                if (chrome.runtime.lastError) panelNoTab(msg);
            });
        });
    }

    function panelNoTab(msg) {
        if (!msg || (msg.type !== 'logs' && msg.type !== 'context')) return;
        onFetcherMessage({
            source: window,
            data: {
                dest: 'extension_rlv',
                type: 'logs_error',
                payload: { reqId: msg.payload && msg.payload.reqId, errorCode: 'no_netsuite_tab' }
            }
        });
    }

    function bindShortcut() {
        if (_shortcutBound) return;
        if (!window.NSFT_Shortcuts || !window.NSFT_Shortcuts.bind) return;
        _shortcutBound = true;
        window.NSFT_Shortcuts.bind('record_logs_viewer', {
            label: i18n('enableRecordLogsViewerLabel', 'Record Logs Viewer'),
            defaultCombo: { ctrlKey: false, shiftKey: true, altKey: true, code: 'KeyL' },
            storageKey: 'recordLogsViewerShortcut',
            event: CUSTOM_EVENT,
            group: i18n('cheatsheet_group_global', 'Global'),
            isEnabled: () => _enabled,
            order: 41.5
        });
    }

    function stop() {
        if (!_enabled) return;
        _enabled = false;
        if (_eventListener) { window.removeEventListener(CUSTOM_EVENT, _eventListener); _eventListener = null; }
        if (_messageListener) { window.removeEventListener('message', _messageListener); _messageListener = null; }
        closeScopePicker();
        clearTimers();
        if (_resizeObs) { _resizeObs.disconnect(); _resizeObs = null; }
        const modal = document.getElementById(MODAL_ID);
        if (modal) modal.remove();
    }

    function clearTimers() {
        if (_autoTimer) { clearInterval(_autoTimer); _autoTimer = null; }
    }

    function injectFetcher(onReady) {
        if (PANEL_MODE) { onReady(); return; }
        if (_fetcherInjected) { onReady(); return; }
        const s = document.createElement('script');
        s.src = chrome.runtime.getURL(FETCHER_SCRIPT);
        s.onload = function () {
            this.remove();
            _fetcherInjected = true;
            onReady();
        };
        (document.head || document.documentElement).appendChild(s);
    }

    let _tabWatchBound = false;
    function seguirPestana() {
        if (_tabWatchBound || !PANEL_MODE) return;
        if (typeof chrome === 'undefined' || !chrome.tabs) return;
        _tabWatchBound = true;
        let timer = null;
        let seq = 0;
        let lastUrl = null;
        const esNs = (url) => !!url && /^https:\/\/[^/]*\.app\.netsuite\.com\//.test(url);

        const esperarRelevo = (mySeq, tabId, url, intento) => {
            if (mySeq !== seq) return;
            try {
                chrome.tabs.sendMessage(tabId, { nsftRlv: 'ping' }, (resp) => {
                    void chrome.runtime.lastError;
                    if (mySeq !== seq) return;
                    if (resp && resp.ok) { lastUrl = url; askContext(); return; }
                    if (intento < 10) { setTimeout(() => esperarRelevo(mySeq, tabId, url, intento + 1), 400); return; }
                    lastUrl = url;
                    askContext();
                });
            } catch (e) { }
        };

        const revalidar = () => {
            clearTimeout(timer);
            timer = setTimeout(() => {
                if (!document.getElementById(MODAL_ID)) return;
                const mySeq = ++seq;
                chrome.tabs.query({ active: true, lastFocusedWindow: true }, (tabs) => {
                    if (mySeq !== seq) return;
                    const tab = tabs && tabs[0];
                    const url = tab && tab.url ? tab.url : null;
                    if (!esNs(url)) {
                        if (lastUrl === null) return;
                        lastUrl = null;
                        askContext();
                        return;
                    }
                    if (url === lastUrl) return;
                    esperarRelevo(mySeq, tab.id, url, 0);
                });
            }, 250);
        };
        try {
            chrome.tabs.onActivated.addListener(revalidar);
            chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
                if (changeInfo.url || changeInfo.status === 'complete') revalidar();
            });
            if (chrome.windows && chrome.windows.onFocusChanged) {
                chrome.windows.onFocusChanged.addListener(revalidar);
            }
            chrome.tabs.query({ active: true, lastFocusedWindow: true }, (tabs) => {
                lastUrl = tabs && tabs[0] && tabs[0].url ? tabs[0].url : null;
            });
        } catch (e) { }
    }

    function askContext() {
        const SP = window.NSFT_ScriptPage;
        const scriptId = (SP && typeof SP.scriptId === 'function') ? SP.scriptId() : 0;
        sendEnvelope({
            dest: 'fetcher_rlv',
            type: 'context',
            payload: { scriptId: scriptId || 0 }
        });
    }

    function toSqlDate(v) {
        if (!v) return '';
        return v.replace('T', ' ') + (v.length === 16 ? ':00' : '');
    }

    function fmtSql(d) {
        const p = (n) => String(n).padStart(2, '0');
        return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate())
            + ' ' + p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds());
    }

    function effectiveRange() {
        if (S.range === 'custom') return { from: S.from, to: S.to };
        if (S.range === 'all') return { from: '', to: '' };
        const hours = { '1h': 1, '24h': 24, '7d': 168 }[S.range] || 0;
        if (!hours) return { from: '', to: '' };
        return { from: fmtSql(new Date(Date.now() - hours * 3600000)), to: '' };
    }

    function filterPayload() {
        const r = effectiveRange();
        return {
            levels: Array.from(S.levels),
            scriptIds: Array.from(S.selected),
            scriptTypes: Array.from(S.stypes),
            q: S.q,
            from: r.from,
            to: r.to
        };
    }

    function postToFetcher(type, payload) {
        const known = (window.NSFT_SuiteQLRest && window.NSFT_SuiteQLRest.isKnownOff)
            ? window.NSFT_SuiteQLRest.isKnownOff()
            : false;
        Promise.resolve(known).catch(() => false).then((off) => {
            payload.restOff = !!off;
            sendEnvelope({ dest: 'fetcher_rlv', type, payload });
        });
    }

    function askLogs() {
        S.loading = true;
        S.reqId += 1;
        renderStatus();
        renderResultsBar();
        const payload = filterPayload();
        payload.reqId = S.reqId;
        payload.page = S.page;
        payload.pageSize = PAGE_SIZE;
        postToFetcher('logs', payload);
    }

    function refresh() {
        S.page = 0;
        S.noMore = false;
        S.selIdx = -1;
        closeDetail();
        const list = qs('#nsft-rlv-list');
        if (list) list.scrollTop = 0;
        askLogs();
    }

    function onFetcherMessage(e) {
        if (e.source !== window) return;
        const d = e.data;
        if (!d || typeof d !== 'object' || d.dest !== 'extension_rlv') return;

        if (!PANEL_MODE) {
            const propio = document.getElementById(MODAL_ID);
            if (!propio || propio.style.display === 'none') return;
        }

        if (d.type === 'context') {
            S.context = d.payload || {};
            onContextReady();
        } else if (d.type === 'recordtypes') {
            S.rtLoading = false;
            S.recordTypes = (d.payload && d.payload.types) || [];
            S.recordTypes.forEach((t) => {
                if (t && t.rt && t.name) S.recordNames[String(t.rt).toUpperCase()] = String(t.name);
            });
            refreshHeaderCtx();
            renderScriptList();
            renderTypeList();
            renderScopeList();
        } else if (d.type === 'scripts_for') {
            const p = d.payload || {};
            if (String(p.recordType || '').toUpperCase() !== String(S.scopeType || '')) return;
            S.scopeLoading = false;
            if (!S.context) S.context = {};
            S.context.scripts = p.scripts || [];
            S.selected = new Set(S.context.scripts.map((s) => s.id));
            S.stypes = new Set(typesOf(S.context.scripts));
            refreshHeaderCtx();
            renderTypeList();
            renderScriptList();
            refresh();
        } else if (d.type === 'logs') {
            const p = d.payload || {};
            if (isStale(p)) return;
            S.loading = false;
            S.total = p.total || 0;
            let desde = 0;
            if (p.page > 0) {
                desde = S.rows.length;
                S.rows = S.rows.concat(p.rows || []);
                if (!p.rows || !p.rows.length) S.noMore = true;
            } else {
                S.rows = p.rows || [];
                S.counts = { levels: {}, scripts: {} };
            }
            S.lastMs = (typeof p.ms === 'number') ? p.ms : null;
            S.lastAt = Date.now();
            if (S.auto) { resetAutoCountdown(); flashAuto(); }
            renderRows(desde);
            renderResultsBar();
            renderLevelChips();
            renderScriptList();
            renderFiltersButton();
            renderStatus();
        } else if (d.type === 'logs_counts') {
            const p = d.payload || {};
            if (isStale(p)) return;
            S.counts = p.counts || { levels: {}, scripts: {} };
            renderLevelChips();
            renderScriptList();
        } else if (d.type === 'logs_export_progress') {
            const p = d.payload || {};
            if (isStaleExport(p)) return;
            S.expLoaded = p.loaded || 0;
            S.expTotal = p.total || 0;
            renderExportState();
        } else if (d.type === 'logs_export') {
            const p = d.payload || {};
            if (isStaleExport(p)) return;
            const fmt = S.exporting;
            S.exporting = null;
            renderExportState();
            writeExport(fmt, p.rows || [], !!p.truncated);
        } else if (d.type === 'logs_export_error') {
            const p = d.payload || {};
            if (isStaleExport(p)) return;
            S.exporting = null;
            renderExportState();
            const code = p.errorCode || '';
            noteExport((code === 'no_require' || code === 'query_load')
                ? i18n('rlv_err_no_suitescript', 'SuiteScript no está disponible en esta página.')
                : i18n('rlv_export_failed', 'No se pudo descargar el resultado completo.'), true);
        } else if (d.type === 'logs_error') {
            const p = d.payload || {};
            if (isStale(p)) return;
            S.loading = false;
            renderStatus(p);
        } else if (d.type === 'rest_state') {
            const p = d.payload || {};
            const rest = window.NSFT_SuiteQLRest;
            if (!rest) return;
            if (p.on) rest.markOn();
            else if (p.status === 403 || p.status === 404) rest.markOff();
        }
    }

    function isStale(payload) {
        return !!(payload && payload.reqId != null && payload.reqId !== S.reqId);
    }

    function isStaleExport(payload) {
        return !S.exporting || !payload || payload.reqId !== S.expId;
    }

    function openViewer(evt) {
        if (window.NSFT_ShortcutCoach) window.NSFT_ShortcutCoach.hint('record_logs_viewer');

        if (!PANEL_MODE && _openMode === 'panel' && !(evt && evt.detail && evt.detail.fromPanel)) {
            try {
                chrome.runtime.sendMessage({ nsftRlv: 'openPanel' }, (resp) => {
                    void chrome.runtime.lastError;
                    if (!(resp && resp.ok)) openViewer({ detail: { fromPanel: true } });
                });
                return;
            } catch (e) { }
        }

        let modal = document.getElementById(MODAL_ID);
        if (modal) {
            modal.style.display = 'flex';
            modal.dataset.state = 'maximised';
            modal.style.top = lastMaxTop;
            modal.style.left = lastMaxLeft;
            updateTitleState();
            bringToFront(modal);
            applyResponsive();
            modal.focus();
            armTimers();
            if (S.loading) refresh();
            return;
        }
        S.loading = true;
        buildModal();
        if (window.NSFT_LogFormat && window.NSFT_LogFormat.ensureTheme) {
            window.NSFT_LogFormat.ensureTheme(_prettierTheme);
        }
        injectFetcher(() => askContext());
        armTimers();
    }

    function onContextReady() {
        const ctx = S.context || {};
        const sc = (ctx.scriptScope && ctx.scriptScope.id != null) ? ctx.scriptScope : null;

        if (sc) {
            S.homeScript = sc;
            S.scopeScript = sc;
            S.homeType = null;
            S.scopeType = null;
        } else {
            S.homeScript = null;
            S.scopeScript = null;
            S.homeType = ctx.recordType ? String(ctx.recordType).toUpperCase() : null;
            S.scopeType = S.homeType;
            if (S.homeType && ctx.recordTypeName) S.recordNames[S.homeType] = String(ctx.recordTypeName);
        }
        S.selected = new Set((ctx.scripts || []).map((s) => s.id));
        S.stypes = new Set(typesOf(ctx.scripts));
        refreshHeaderCtx();
        renderTypeList();
        renderScriptList();
        S.page = 0;
        askLogs();
    }

    function armTimers() {
        clearTimers();
        _autoTimer = setInterval(autoTick, 1000);
    }

    function autoTick() {
        const modal = document.getElementById(MODAL_ID);
        if (!S.auto || !modal || modal.style.display === 'none') return;
        if (document.hidden || S.loading) return;
        _autoLeft -= 1;
        if (_autoLeft > 0) { renderAutoField(); return; }
        _autoLeft = 0;
        renderAutoField();
        refresh();
    }

    function resetAutoCountdown() {
        _autoLeft = S.autoSecs;
        renderAutoField();
    }

    const TITLE_ICON = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/><path d="M9 13h6M9 17h4"/></svg>';

    const SEARCH_ICON = '<svg class="nsft-rlv-searchicon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>';
    const CLEAR_ICON = '<svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><path d="M2.5 2.5l7 7M9.5 2.5l-7 7"/></svg>';

    const DOWNLOAD_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"'
        + ' stroke-linecap="round" aria-hidden="true"><path d="M12 4v11"></path>'
        + '<path d="M8 11l4 4 4-4"></path><path d="M5 19h14"></path></svg>';

    const DOCK_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"'
        + ' stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
        + '<rect width="18" height="18" x="3" y="3" rx="2"></rect><path d="M15 3v18"></path></svg>';

    const UNDOCK_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"'
        + ' stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
        + '<rect width="18" height="18" x="3" y="3" rx="2"></rect><path d="M15 3v18"></path>'
        + '<path d="M11 9l-3 3 3 3"></path></svg>';

    const SPINNER_SVG = '<svg class="nsft-rlv-spin" width="14" height="14" viewBox="0 0 16 16"'
        + ' fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true">'
        + '<circle cx="8" cy="8" r="6" stroke-dasharray="28 12"></circle></svg>';
    const PAUSE_SVG = '<svg class="nsft-rlv-pause" width="14" height="14" viewBox="0 0 16 16"'
        + ' fill="currentColor" aria-hidden="true">'
        + '<rect x="4.6" y="3.8" width="2.4" height="8.4" rx="1.1"></rect>'
        + '<rect x="9" y="3.8" width="2.4" height="8.4" rx="1.1"></rect></svg>';

    const AUTO_PILL_HTML = (T) => `
        <div class="nsft-rlv-autopill" id="nsft-rlv-auto">
            <label class="nsft-rlv-switch" title="${T.auto}">
                <input type="checkbox" id="nsft-rlv-autochk"${S.auto ? ' checked' : ''} aria-label="${T.auto}">
                <span class="nsft-rlv-slider"></span>
            </label>
            <span class="nsft-rlv-autolabel">${T.auto}</span>
            <span class="nsft-rlv-autosep"></span>
            <input id="nsft-rlv-autosecs" class="nsft-rlv-autonum" inputmode="numeric"
                   value="${S.autoSecs}" title="${T.autoEvery}" aria-label="${T.autoEvery}">
            <span class="nsft-rlv-autounit">${T.autoUnit}</span>
            <span class="nsft-rlv-autostate" id="nsft-rlv-autostate">${SPINNER_SVG}${PAUSE_SVG}</span>
        </div>`;

    const CTX_HTML = '<button type="button" class="nsft-rlv-ctx" aria-haspopup="listbox" aria-expanded="false">'
        + '<span class="nsft-rlv-ctxlabel"></span>'
        + '<span class="nsft-rlv-ctxcode"></span>'
        + '<svg class="nsft-rlv-ctxcaret" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M3 4.5L6 7.5L9 4.5"/></svg>'
        + '</button>';

    let lastMaxTop = '2.5vh';
    let lastMaxLeft = '2.5vw';

    function qs(sel) {
        const modal = document.getElementById(MODAL_ID);
        return modal ? modal.querySelector(sel) : null;
    }

    function bringToFront(modal) {
        if (window.NSFT_ModalStack && window.NSFT_ModalStack.bringToFront) {
            window.NSFT_ModalStack.bringToFront(modal);
        }
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
        const targetWidth = isMin ? 165 : rect.width;
        const centerX = rect.left + (rect.width / 2);
        const p = 15;
        el.style.left = (centerX < (window.innerWidth / 2))
            ? p + 'px'
            : (window.innerWidth - targetWidth - p) + 'px';
        constrainModalToWindow(el);
    }

    function recordTypeName(rt) {
        const key = String(rt || '').toUpperCase();
        if (!key) return null;
        return S.recordNames[key] || RECORD_TYPE_NAMES[key] || null;
    }

    function scopeLabel() {
        if (S.scopeScript) return scriptScopeName(S.scopeScript);
        if (!S.scopeType) return i18n('rlv_all_scripts', 'Todos los scripts');
        return recordTypeName(S.scopeType) || String(S.scopeType).toLowerCase();
    }

    function scriptScopeName(sc) {
        return (sc && sc.name) ? String(sc.name) : String((sc && sc.id) || '');
    }

    function scopeGroupLabel() {
        if (S.scopeScript) return i18n('rlv_scripts_script', 'De este script');
        return S.scopeType === S.homeType
            ? i18n('rlv_scripts_record', 'De este registro')
            : i18n('rlv_scripts_of', 'De $1', [scopeLabel()]);
    }

    function refreshHeaderCtx() {
        const btn = qs('.nsft-rlv-ctx');
        if (!btn) return;
        const label = btn.querySelector('.nsft-rlv-ctxlabel');
        const code = btn.querySelector('.nsft-rlv-ctxcode');
        const name = S.scopeScript
            ? (S.scopeScript.name ? String(S.scopeScript.name) : null)
            : (S.scopeType ? recordTypeName(S.scopeType) : null);
        const raw = S.scopeScript
            ? String(S.scopeScript.id)
            : (S.scopeType ? String(S.scopeType).toLowerCase() : '');

        if (label) {
            label.textContent = name || raw || i18n('rlv_all_scripts', 'Todos los scripts');
            label.classList.toggle('is-id', !name && !!raw);
        }
        if (code) {
            code.textContent = (name && raw) ? raw : '';
            code.hidden = !(name && raw);
        }
        btn.title = raw
            ? (raw + ' — ' + i18n('rlv_scope_pick', 'Cambiar el tipo de registro'))
            : i18n('rlv_scope_pick', 'Cambiar el tipo de registro');
    }

    function updateTitleState() {
        const modal = document.getElementById(MODAL_ID);
        const title = qs('#nsft-rlv-title');
        if (!modal || !title) return;
        const min = modal.dataset.state === 'minimised';
        title.innerHTML = TITLE_ICON + '<span>'
            + (min ? i18n('rlv_title_min', 'Logs') : i18n('enableRecordLogsViewerLabel', 'Ver Logs del Registro'))
            + '</span>'
            + (min ? '' : CTX_HTML);
        if (min) setTimeout(() => snapToEdge(modal), 10);
        else refreshHeaderCtx();
    }

    function buildModal() {
        const T = {
            title: i18n('enableRecordLogsViewerLabel', 'Ver Logs del Registro'),
            search: i18n('rlv_search', 'Buscar en título y detalle…'),
            auto: i18n('rlv_auto', 'Auto'),
            autoEvery: i18n('rlv_auto_every', 'Actualizar cada tantos segundos'),
            autoUnit: i18n('rlv_auto_unit', 'segs'),
            refreshTxt: i18n('rlv_refresh', 'Actualizar'),
            scripts: i18n('rlv_scripts', 'Scripts'),
            searchScript: i18n('rlv_search_script', 'Buscar script…'),
            scopeSearch: i18n('rlv_scope_search', 'Buscar tipo de registro…'),
            stypes: i18n('rlv_stypes', 'Tipo de script'),
            range: i18n('rlv_range', 'Rango'),
            from: i18n('rlv_from', 'Desde'),
            to: i18n('rlv_to', 'Hasta'),
            apply: i18n('rlv_apply', 'Aplicar'),
            clear: i18n('rlv_clear', 'Limpiar'),
            colDate: i18n('rlv_col_date', 'Hora'),
            colLevel: i18n('rlv_col_level', 'Nivel'),
            colScript: i18n('rlv_col_script', 'Script'),
            colTitle: i18n('rlv_col_title', 'Título'),
            colDetail: i18n('rlv_col_detail', 'Detalle'),
            group: i18n('rlv_group', 'Agrupar por ejecución'),
            exportCsv: i18n('rlv_export_csv', 'CSV'),
            exportJson: i18n('rlv_export_json', 'JSON'),
            dock: i18n('rlv_dock_btn', 'Acoplar al panel lateral del navegador'),
            undock: i18n('rlv_undock_btn', 'Desacoplar: volver a la página'),
            exportCsvTitle: i18n('rlv_export_csv_title', 'Descargar los resultados en CSV'),
            exportJsonTitle: i18n('rlv_export_json_title', 'Descargar los resultados en JSON'),
            hintNav: i18n('rlv_hint_nav', '↑ ↓ navegar'),
            hintOpen: i18n('rlv_hint_open', 'Enter abre el detalle'),
            hintSearch: i18n('rlv_hint_search', 'Ctrl+K buscar'),
            clearField: i18n('rlv_clear_search', 'Borrar la búsqueda')
        };


        const rangeBtns = [
            ['1h', i18n('rlv_range_1h', '1 h')],
            ['24h', i18n('rlv_range_24h', '24 h')],
            ['7d', i18n('rlv_range_7d', '7 días')],
            ['all', i18n('rlv_range_all', 'Todo')]
        ].map(([v, label]) =>
            `<button type="button" class="nsft-rlv-rangebtn${S.range === v ? ' is-on' : ''}" data-range="${v}">${label}</button>`
        ).join('');

        const html = `
        <div id="${MODAL_ID}" class="nsft-modal nsft-modal--window" ${PANEL_MODE ? 'data-panelmode="1"' : ''} data-theme="${resolveTheme()}" data-state="maximised" tabindex="-1" role="dialog" aria-modal="true" aria-label="${T.title}">
            <div class="nsft-rlv-header nsft-modal-header">
                <span id="nsft-rlv-title">${TITLE_ICON}<span>${T.title}</span>${CTX_HTML}</span>
                <span class="nsft-header-actions">
                    ${PANEL_MODE
        ? `<span id="nsft-rlv-undock" class="nsft-rlv-dock" title="${T.undock}">${UNDOCK_ICON}</span>`
        : `<span id="nsft-rlv-dock" class="nsft-rlv-dock" title="${T.dock}">${DOCK_ICON}</span>`}
                    <span id="nsft-rlv-minimise" class="nsft-modal-btn-minimise"></span>
                    <span id="nsft-rlv-fullscreen" class="nsft-modal-btn-fullscreen" title="${i18n('sql_fullscreen_enter', 'Pantalla completa')}"></span>
                    <span id="nsft-rlv-maximise" class="nsft-modal-btn-maximise"></span>
                    <span id="nsft-rlv-close" class="nsft-modal-btn-close">✕</span>
                </span>
                <div class="nsft-modal-header-line"></div>
            </div>

            <div class="nsft-rlv-ctxpop" id="nsft-rlv-ctxpop" hidden>
                <div class="nsft-rlv-searchwrap is-sm is-flush">
                    ${SEARCH_ICON}
                    <input type="text" id="nsft-rlv-ctxsearch" spellcheck="false" autocomplete="off" placeholder="${T.scopeSearch}">
                    <button type="button" class="nsft-rlv-clearbtn" id="nsft-rlv-ctxclear" hidden title="${T.clearField}" aria-label="${T.clearField}">${CLEAR_ICON}</button>
                </div>
                <div class="nsft-rlv-ctxlist" id="nsft-rlv-ctxlist" role="listbox"></div>
            </div>

            <div class="nsft-rlv-toolbar">
                <div class="nsft-rlv-searchwrap">
                    ${SEARCH_ICON}
                    <input type="text" id="nsft-rlv-q" spellcheck="false" autocomplete="off" placeholder="${T.search}">
                    <button type="button" class="nsft-rlv-clearbtn" id="nsft-rlv-qclear" hidden title="${T.clearField}" aria-label="${T.clearField}">${CLEAR_ICON}</button>
                </div>
                <div class="nsft-rlv-vsep"></div>
                <div class="nsft-rlv-levelchips" id="nsft-rlv-levels"></div>
                <div class="nsft-rlv-spacer"></div>
                <button type="button" id="nsft-rlv-filtersbtn">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 6h16M7 12h10M10 18h4"/></svg><span></span>
                </button>
                <div class="nsft-rlv-ranges" id="nsft-rlv-ranges">${rangeBtns}</div>
                ${AUTO_PILL_HTML(T)}
                <button type="button" id="nsft-rlv-refresh" class="nsft-rlv-primary">${T.refreshTxt}</button>
            </div>

            <div class="nsft-rlv-body">
                <div class="nsft-rlv-backdrop" id="nsft-rlv-backdrop" hidden></div>
                <aside class="nsft-rlv-filters">
                    <div class="nsft-rlv-fscroll">
                        <div id="nsft-rlv-drawerextras" hidden>
                            <div class="nsft-rlv-flabel">${T.colLevel}</div>
                            <div class="nsft-rlv-slot" id="nsft-rlv-slotlevels"></div>
                            <div class="nsft-rlv-flabel">${T.range}</div>
                            <div class="nsft-rlv-slot" id="nsft-rlv-slotranges"></div>
                        </div>

                        <div class="nsft-rlv-flabel">${T.scripts}</div>
                        <div class="nsft-rlv-searchwrap is-sm">
                            ${SEARCH_ICON}
                            <input type="text" id="nsft-rlv-scriptsearch" spellcheck="false" autocomplete="off" placeholder="${T.searchScript}">
                            <button type="button" class="nsft-rlv-clearbtn" id="nsft-rlv-scriptclear" hidden title="${T.clearField}" aria-label="${T.clearField}">${CLEAR_ICON}</button>
                        </div>
                        <div class="nsft-rlv-scriptcard" id="nsft-rlv-scriptlist"></div>

                        <div class="nsft-rlv-flabel nsft-rlv-flabelrow">
                            <span>${T.stypes}</span>
                            <button type="button" id="nsft-rlv-typestoggle" hidden></button>
                        </div>
                        <div class="nsft-rlv-scriptcard" id="nsft-rlv-stypes"></div>

                        <div class="nsft-rlv-flabel">${T.range}</div>
                        <label class="nsft-rlv-datelabel">${T.from}<input type="datetime-local" id="nsft-rlv-from"></label>
                        <label class="nsft-rlv-datelabel">${T.to}<input type="datetime-local" id="nsft-rlv-to"></label>
                    </div>
                    <div class="nsft-rlv-fbtns">
                        <button type="button" id="nsft-rlv-clear">${T.clear}</button>
                        <button type="button" id="nsft-rlv-apply" class="nsft-rlv-primary">${T.apply}</button>
                    </div>
                </aside>

                <main class="nsft-rlv-results">
                    <div class="nsft-rlv-bar">
                        <span id="nsft-rlv-count"></span>
                        <span id="nsft-rlv-ms"></span>
                        <span id="nsft-rlv-exportnote" hidden></span>
                        <div class="nsft-rlv-spacer"></div>
                        <button type="button" id="nsft-rlv-group" class="${S.group ? 'is-on' : ''}">${T.group}</button>
                        <button type="button" id="nsft-rlv-export" class="nsft-rlv-dl" title="${T.exportCsvTitle}">${DOWNLOAD_ICON}<span>${T.exportCsv}</span></button>
                        <button type="button" id="nsft-rlv-exportjson" class="nsft-rlv-dl" title="${T.exportJsonTitle}">${DOWNLOAD_ICON}<span>${T.exportJson}</span></button>
                    </div>
                    <div class="nsft-rlv-cols">
                        <div>${T.colDate}</div><div>${T.colLevel}</div><div class="nsft-rlv-colscript">${T.colScript}</div><div class="nsft-rlv-coltitle">${T.colTitle}</div><div>${T.colDetail}</div>
                    </div>
                    <div class="nsft-rlv-list" id="nsft-rlv-list">
                        <div id="nsft-rlv-status"></div>
                        <div class="nsft-rlv-morewrap"><div id="nsft-rlv-more" hidden></div></div>
                    </div>
                </main>
            </div>

            <div class="nsft-rlv-foot">
                <span>${T.hintNav}</span>
                <span>${T.hintOpen}</span>
                <span>${T.hintSearch}</span>
                <div class="nsft-rlv-spacer"></div>
            </div>
        </div>`;

        document.body.insertAdjacentHTML('beforeend', html);
        const modal = document.getElementById(MODAL_ID);
        bringToFront(modal);
        wireShell(modal);
        wireContent(modal);
        observeWidth(modal);
        renderLevelChips();
        renderStatus();
        resetAutoCountdown();
        renderAutoState();
        modal.focus();
    }

    const BP_COMPACT = 1080;
    const BP_NOSCRIPT = 900;
    const BP_TINY = 720;

    function observeWidth(modal) {
        if (_resizeObs) { _resizeObs.disconnect(); _resizeObs = null; }
        if (typeof ResizeObserver !== 'undefined') {
            _resizeObs = new ResizeObserver(() => applyResponsive());
            _resizeObs.observe(modal);
        }
        applyResponsive();
    }

    function setFlag(el, name, on) {
        if (on) el.setAttribute(name, '');
        else el.removeAttribute(name);
    }

    function applyResponsive() {
        const modal = document.getElementById(MODAL_ID);
        if (!modal) return;
        if (modal.dataset.state === 'minimised') return;
        const w = modal.getBoundingClientRect().width;
        if (!w) return;
        const compact = w < BP_COMPACT;
        setFlag(modal, 'data-compact', compact);
        setFlag(modal, 'data-hidescript', w < BP_NOSCRIPT);
        setFlag(modal, 'data-tiny', w < BP_TINY);
        moveDrawerExtras(compact);
        if (!compact) modal.classList.remove('is-filters-open');
        syncBackdrop();
        renderFiltersButton();
    }

    function moveDrawerExtras(toDrawer) {
        const levels = qs('#nsft-rlv-levels');
        const ranges = qs('#nsft-rlv-ranges');
        const extras = qs('#nsft-rlv-drawerextras');
        const toolbar = qs('.nsft-rlv-toolbar');
        const slotL = qs('#nsft-rlv-slotlevels');
        const slotR = qs('#nsft-rlv-slotranges');
        if (!levels || !ranges || !extras || !toolbar || !slotL || !slotR) return;
        if (toDrawer) {
            if (levels.parentElement !== slotL) slotL.appendChild(levels);
            if (ranges.parentElement !== slotR) slotR.appendChild(ranges);
            extras.hidden = false;
        } else {
            if (levels.parentElement === slotL) {
                toolbar.insertBefore(levels, qs('.nsft-rlv-toolbar .nsft-rlv-spacer'));
            }
            if (ranges.parentElement === slotR) {
                toolbar.insertBefore(ranges, qs('#nsft-rlv-auto'));
            }
            extras.hidden = true;
        }
    }

    function syncClearBtn(input, btnSel) {
        const btn = qs(btnSel);
        if (btn) btn.hidden = !(input && input.value);
    }

    function highlightInto(el, text, needle) {
        el.textContent = '';
        const t = String(text == null ? '' : text);
        const n = String(needle || '').trim();
        if (!n) { el.textContent = t; return; }
        const hay = t.toLowerCase();
        const pin = n.toLowerCase();
        let from = 0;
        let i = hay.indexOf(pin);
        while (i !== -1) {
            if (i > from) el.appendChild(document.createTextNode(t.slice(from, i)));
            const mk = document.createElement('mark');
            mk.className = 'nsft-rlv-hl';
            mk.textContent = t.slice(i, i + pin.length);
            el.appendChild(mk);
            from = i + pin.length;
            i = hay.indexOf(pin, from);
        }
        if (from < t.length) el.appendChild(document.createTextNode(t.slice(from)));
    }

    function renderFiltersButton() {
        const btn = qs('#nsft-rlv-filtersbtn');
        if (!btn) return;
        const n = activeFilterCount();
        const label = btn.querySelector('span');
        if (label) {
            label.textContent = n
                ? i18n('rlv_filters_n', 'Filtros · $1', [String(n)])
                : i18n('rlv_filters', 'Filtros');
        }
        btn.classList.toggle('is-on', n > 0);
    }

    function wireShell(modal) {
        modal.addEventListener('mousedown', () => bringToFront(modal));

        function syncFullscreenTitle() {
            const btn = qs('#nsft-rlv-fullscreen');
            if (!btn) return;
            btn.title = i18n(modal.dataset.state === 'fullscreen'
                ? 'sql_fullscreen_exit' : 'sql_fullscreen_enter',
                modal.dataset.state === 'fullscreen' ? 'Salir de pantalla completa' : 'Pantalla completa');
        }

        function setState(st) {
            closeScopePicker();
            modal.dataset.state = st;
            if (st === 'maximised') {
                modal.style.top = lastMaxTop;
                modal.style.left = lastMaxLeft;
            }
            updateTitleState();
            syncFullscreenTitle();
            applyResponsive();
        }

        qs('#nsft-rlv-minimise').addEventListener('click', () => setState('minimised'));
        qs('#nsft-rlv-maximise').addEventListener('click', () => setState('maximised'));
        qs('#nsft-rlv-fullscreen').addEventListener('click', () => {
            setState(modal.dataset.state === 'fullscreen' ? 'maximised' : 'fullscreen');
        });
        qs('#nsft-rlv-close').addEventListener('click', () => {
            closeScopePicker();
            if (PANEL_MODE) { window.close(); return; }
            modal.style.display = 'none';
        });

        const undockBtn = qs('#nsft-rlv-undock');
        if (undockBtn) {
            undockBtn.addEventListener('click', () => {
                chrome.tabs.query({ active: true, lastFocusedWindow: true }, (tabs) => {
                    const tab = tabs && tabs[0];
                    const esNs = tab && tab.url && /^https:\/\/[^/]*\.app\.netsuite\.com\//.test(tab.url);
                    if (!tab || tab.id == null || !esNs) {
                        console.warn('NSFT: no hay pestaña de NetSuite donde desacoplar el visor');
                        return;
                    }
                    chrome.tabs.sendMessage(tab.id, { nsftRlv: 'openInPage' }, () => {
                        if (chrome.runtime.lastError) {
                            console.warn('NSFT: la pestaña no respondió al desacoplar —', chrome.runtime.lastError.message);
                            return;
                        }
                        window.close();
                    });
                });
            });
        }

        const dockBtn = qs('#nsft-rlv-dock');
        if (dockBtn) {
            dockBtn.addEventListener('click', () => {
                try {
                    chrome.runtime.sendMessage({ nsftRlv: 'openPanel' }, (resp) => {
                        void chrome.runtime.lastError;
                        if (resp && resp.ok) {
                            closeScopePicker();
                            modal.style.display = 'none';
                            return;
                        }
                        console.warn('NSFT: no se pudo abrir el panel lateral —',
                            (resp && resp.reason) || 'sin respuesta del service worker');
                    });
                } catch (e) { }
            });
        }

        const header = qs('.nsft-rlv-header');

        header.addEventListener('dblclick', (e) => {
            if (PANEL_MODE) return;
            if (e.target.closest('.nsft-rlv-ctx')) return;
            setState(modal.dataset.state === 'maximised' ? 'minimised' : 'maximised');
        });

        let dragging = false, offX = 0, offY = 0;

        header.addEventListener('mousedown', (e) => {
            if (PANEL_MODE) return;
            if (e.target.closest('.nsft-header-actions')) return;
            if (e.target.closest('.nsft-rlv-ctx')) return;
            if (modal.dataset.state === 'fullscreen') return;
            if (document.activeElement) document.activeElement.blur();
            dragging = true;
            modal.classList.add('nsft-dragging');
            offX = e.clientX - modal.offsetLeft;
            offY = e.clientY - modal.offsetTop;
            e.preventDefault();
        });
        window.addEventListener('mousemove', (e) => {
            if (!dragging) return;
            e.preventDefault();
            const newLeft = (e.clientX - offX) + 'px';
            const newTop = Math.max(0, e.clientY - offY) + 'px';
            modal.style.left = newLeft;
            modal.style.top = newTop;
            modal.style.right = 'auto';
            modal.style.bottom = 'auto';
            if (modal.dataset.state === 'maximised') {
                lastMaxLeft = newLeft;
                lastMaxTop = newTop;
            }
        });
        window.addEventListener('mouseup', () => {
            if (!dragging) return;
            dragging = false;
            modal.classList.remove('nsft-dragging');
            if (modal.dataset.state === 'minimised') {
                requestAnimationFrame(() => snapToEdge(modal));
            }
        });

        modal.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                const pop = qs('#nsft-rlv-ctxpop');
                if (pop && !pop.hidden) { closeScopePicker(); return; }
                if (modal.classList.contains('is-filters-open')) { closeFilterDrawer(); return; }
                if (isDetailOpen()) { closeDetail(); return; }
                if (PANEL_MODE) { window.close(); return; }
                modal.style.display = 'none';
                return;
            }
            if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) {
                e.preventDefault();
                const q = qs('#nsft-rlv-q');
                if (q) q.focus();
                return;
            }
            const tag = e.target && e.target.tagName;
            if (tag === 'INPUT' || tag === 'TEXTAREA') return;
            if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                e.preventDefault();
                if (!S.rows.length) return;
                const delta = e.key === 'ArrowDown' ? 1 : -1;
                S.selIdx = Math.max(0, Math.min(S.rows.length - 1, S.selIdx + delta));
                markSelectedRow(true);
                if (S.detailOpen) renderDetail();
            } else if (e.key === 'Enter') {
                if (S.selIdx < 0) return;
                if (S.detailOpen) closeDetail();
                else openDetail(S.selIdx);
            }
        });
    }

    function wireContent(modal) {
        qs('#nsft-rlv-title').addEventListener('click', (e) => {
            if (!e.target.closest('.nsft-rlv-ctx')) return;
            const pop = qs('#nsft-rlv-ctxpop');
            if (pop && !pop.hidden) closeScopePicker();
            else openScopePicker();
        });

        const scopeSearch = qs('#nsft-rlv-ctxsearch');
        scopeSearch.addEventListener('input', (e) => {
            syncClearBtn(scopeSearch, '#nsft-rlv-ctxclear');
            renderScopeList(e.target.value);
        });
        qs('#nsft-rlv-ctxclear').addEventListener('click', () => {
            scopeSearch.value = '';
            syncClearBtn(scopeSearch, '#nsft-rlv-ctxclear');
            scopeSearch.focus();
            renderScopeList('');
        });
        scopeSearch.addEventListener('keydown', (e) => {
            if (e.key !== 'Enter') return;
            const first = qs('#nsft-rlv-ctxlist .nsft-rlv-ctxitem');
            if (first) first.click();
        });

        const qInput = qs('#nsft-rlv-q');
        let qTimer = null;

        function commitQuery() {
            if (qTimer) { clearTimeout(qTimer); qTimer = null; }
            const v = qInput.value.trim();
            if (v === S.q) return false;
            S.q = v;
            refresh();
            return true;
        }

        qInput.addEventListener('keydown', (e) => {
            if (e.key !== 'Enter') return;
            if (!commitQuery()) refresh();
        });
        qInput.addEventListener('input', () => {
            syncClearBtn(qInput, '#nsft-rlv-qclear');
            if (qTimer) clearTimeout(qTimer);
            qTimer = setTimeout(() => { qTimer = null; commitQuery(); }, Q_DEBOUNCE_MS);
        });
        qs('#nsft-rlv-qclear').addEventListener('click', () => {
            qInput.value = '';
            syncClearBtn(qInput, '#nsft-rlv-qclear');
            qInput.focus();
            commitQuery();
        });

        qs('#nsft-rlv-ranges').addEventListener('click', (e) => {
            const b = e.target.closest('.nsft-rlv-rangebtn');
            if (!b) return;
            S.range = b.dataset.range;
            modal.querySelectorAll('.nsft-rlv-rangebtn').forEach((x) =>
                x.classList.toggle('is-on', x === b));
            refresh();
        });

        const autoChk = qs('#nsft-rlv-autochk');
        autoChk.addEventListener('change', () => {
            S.auto = !!autoChk.checked;
            savePrefs();
            resetAutoCountdown();
            renderAutoState();
        });

        const autoSecs = qs('#nsft-rlv-autosecs');
        autoSecs.addEventListener('focus', () => {
            autoSecs.value = String(S.autoSecs);
            autoSecs.classList.remove('is-counting');
        });
        autoSecs.addEventListener('change', commitAutoSecs);
        autoSecs.addEventListener('blur', commitAutoSecs);
        autoSecs.addEventListener('keydown', (e) => {
            e.stopPropagation();
            if (e.key === 'Enter') { commitAutoSecs(); autoSecs.blur(); }
        });

        function commitAutoSecs() {
            const antes = S.autoSecs;
            S.autoSecs = sanitizeSecs(autoSecs.value);
            if (S.autoSecs !== antes) savePrefs();
            resetAutoCountdown();
        }

        qs('#nsft-rlv-refresh').addEventListener('click', () => {
            if (!commitQuery()) refresh();
        });

        const scriptInput = qs('#nsft-rlv-scriptsearch');
        scriptInput.addEventListener('input', (e) => {
            syncClearBtn(scriptInput, '#nsft-rlv-scriptclear');
            renderScriptList(e.target.value);
        });
        qs('#nsft-rlv-scriptclear').addEventListener('click', () => {
            scriptInput.value = '';
            syncClearBtn(scriptInput, '#nsft-rlv-scriptclear');
            scriptInput.focus();
            renderScriptList('');
        });

        qs('#nsft-rlv-apply').addEventListener('click', applySidebar);
        qs('#nsft-rlv-clear').addEventListener('click', clearFilters);

        qs('#nsft-rlv-typestoggle').addEventListener('click', () => {
            S.showAllTypes = !S.showAllTypes;
            renderTypeList();
        });

        qs('#nsft-rlv-group').addEventListener('click', (e) => {
            S.group = !S.group;
            e.currentTarget.classList.toggle('is-on', S.group);
            savePrefs();
            renderRows();
        });

        qs('#nsft-rlv-export').addEventListener('click', exportCsv);
        qs('#nsft-rlv-exportjson').addEventListener('click', exportJson);
        armInfiniteScroll();

        qs('#nsft-rlv-filtersbtn').addEventListener('click', () => {
            modal.classList.toggle('is-filters-open');
            syncBackdrop();
        });
        qs('#nsft-rlv-backdrop').addEventListener('click', closeFilterDrawer);
    }

    function closeFilterDrawer() {
        const modal = document.getElementById(MODAL_ID);
        if (!modal) return;
        modal.classList.remove('is-filters-open');
        syncBackdrop();
    }

    function syncBackdrop() {
        const modal = document.getElementById(MODAL_ID);
        const back = qs('#nsft-rlv-backdrop');
        if (!modal || !back) return;
        back.hidden = !(modal.hasAttribute('data-compact') && modal.classList.contains('is-filters-open'));
    }

    function applySidebar() {
        S.from = toSqlDate(qs('#nsft-rlv-from').value);
        S.to = toSqlDate(qs('#nsft-rlv-to').value);
        if (S.from || S.to) {
            S.range = 'custom';
            document.querySelectorAll('.nsft-rlv-rangebtn').forEach((x) => x.classList.remove('is-on'));
        }
        closeFilterDrawer();
        refresh();
    }

    function clearFilters() {
        S.levels.clear();
        S.q = '';
        S.from = ''; S.to = '';
        S.range = 'all';
        S.showAllTypes = false;
        const ofScope = (S.context && S.context.scripts) || [];
        S.selected = new Set(ofScope.map((s) => s.id));
        S.stypes = new Set(typesOf(ofScope));
        const qi = qs('#nsft-rlv-q'); if (qi) qi.value = '';
        const f = qs('#nsft-rlv-from'); if (f) f.value = '';
        const t = qs('#nsft-rlv-to'); if (t) t.value = '';
        const ss = qs('#nsft-rlv-scriptsearch'); if (ss) ss.value = '';
        syncClearBtn(qi, '#nsft-rlv-qclear');
        syncClearBtn(ss, '#nsft-rlv-scriptclear');
        document.querySelectorAll('.nsft-rlv-rangebtn').forEach((x) =>
            x.classList.toggle('is-on', x.dataset.range === 'all'));
        renderLevelChips();
        renderTypeList();
        renderScriptList();
        refresh();
    }

    let _scopeOutside = null;

    function openScopePicker() {
        const pop = qs('#nsft-rlv-ctxpop');
        const btn = qs('.nsft-rlv-ctx');
        const modal = document.getElementById(MODAL_ID);
        if (!pop || !btn || !modal) return;

        const b = btn.getBoundingClientRect();
        const m = modal.getBoundingClientRect();
        pop.style.left = Math.max(8, b.left - m.left) + 'px';
        pop.style.top = (b.bottom - m.top + 6) + 'px';
        pop.hidden = false;
        btn.setAttribute('aria-expanded', 'true');

        const search = qs('#nsft-rlv-ctxsearch');
        if (search) {
            search.value = '';
            syncClearBtn(search, '#nsft-rlv-ctxclear');
            search.focus();
        }

        if (S.recordTypes === null && !S.rtLoading) {
            S.rtLoading = true;
            sendEnvelope({ dest: 'fetcher_rlv', type: 'recordtypes' });
        }
        renderScopeList();

        _scopeOutside = (ev) => {
            const t = ev.target;
            if (t && t.closest && (t.closest('#nsft-rlv-ctxpop') || t.closest('.nsft-rlv-ctx'))) return;
            closeScopePicker();
        };
        document.addEventListener('mousedown', _scopeOutside, true);
    }

    function closeScopePicker() {
        if (_scopeOutside) {
            document.removeEventListener('mousedown', _scopeOutside, true);
            _scopeOutside = null;
        }
        const pop = qs('#nsft-rlv-ctxpop');
        if (pop) pop.hidden = true;
        const btn = qs('.nsft-rlv-ctx');
        if (btn) btn.setAttribute('aria-expanded', 'false');
    }

    function scopeCatalogue() {
        const list = (S.recordTypes || [])
            .map((t) => ({
                rt: String(t.rt || '').toUpperCase(),
                n: (typeof t.n === 'number') ? t.n : null
            }))
            .filter((t) => t.rt);
        if (S.homeType && !list.some((t) => t.rt === S.homeType)) list.push({ rt: S.homeType, n: 0 });
        list.forEach((t) => { t.name = recordTypeName(t.rt); });
        list.sort((a, b) => {
            if (a.rt === S.homeType) return -1;
            if (b.rt === S.homeType) return 1;
            return (a.name || a.rt).localeCompare(b.name || b.rt);
        });
        return list;
    }

    function renderScopeList(filterText) {
        const host = qs('#nsft-rlv-ctxlist');
        if (!host) return;
        const search = qs('#nsft-rlv-ctxsearch');
        const q = String(filterText != null ? filterText : (search ? search.value : '')).toLowerCase();

        host.textContent = '';

        if (S.homeScript) {
            const nm = scriptScopeName(S.homeScript);
            const rid = String(S.homeScript.id);
            if (!q || nm.toLowerCase().includes(q) || rid.includes(q)) {
                host.appendChild(scopeRow(null, S.homeScript.name || null, rid, null, q, { script: true }));
            }
        }

        const allLabel = i18n('rlv_all_scripts', 'Todos los scripts');
        if (!q || allLabel.toLowerCase().includes(q)) {
            host.appendChild(scopeRow(null, allLabel, null, null, q));
        }

        if (S.rtLoading) {
            host.appendChild(scopeNote(i18n('rlv_scope_loading', 'Cargando tipos de registro…')));
            return;
        }

        const list = scopeCatalogue().filter((t) => !q
            || t.rt.toLowerCase().includes(q)
            || (t.name && t.name.toLowerCase().includes(q)));
        if (!list.length) {
            host.appendChild(scopeNote(i18n('rlv_scope_empty', 'Ningún tipo de registro coincide.')));
            return;
        }
        list.forEach((t) => host.appendChild(scopeRow(t.rt, t.name, t.rt.toLowerCase(), t.n, q)));
    }

    function scopeNote(text) {
        const el = document.createElement('div');
        el.className = 'nsft-rlv-ctxempty';
        el.textContent = text;
        return el;
    }

    function scopeRow(type, name, rawId, count, needle, opts) {
        const esScript = !!(opts && opts.script);
        const activo = esScript
            ? !!S.scopeScript
            : (!S.scopeScript && (type || null) === S.scopeType);

        const row = document.createElement('div');
        row.className = 'nsft-rlv-ctxitem' + (activo ? ' is-on' : '');
        row.setAttribute('role', 'option');
        row.setAttribute('aria-selected', String(activo));

        const text = document.createElement('div');
        text.className = 'nsft-rlv-ctxtext';

        const primary = document.createElement('span');
        primary.className = 'nsft-rlv-ctxname' + (name ? '' : ' is-id');
        highlightInto(primary, name || rawId || '', needle);
        text.appendChild(primary);

        if (name && rawId) {
            const id = document.createElement('span');
            id.className = 'nsft-rlv-ctxid';
            highlightInto(id, rawId, needle);
            text.appendChild(id);
        }

        row.title = (name && rawId) ? (name + ' · ' + rawId) : (name || rawId || '');
        row.appendChild(text);

        if (esScript || (type && type === S.homeType)) {
            const tag = document.createElement('span');
            tag.className = 'nsft-rlv-ctxtag';
            tag.textContent = i18n('rlv_scope_current', 'actual');
            row.appendChild(tag);
        }
        if (count != null) {
            const c = document.createElement('span');
            c.className = 'nsft-rlv-scriptcount';
            c.textContent = fmtCount(count);
            row.appendChild(c);
        }

        row.addEventListener('click', () => (esScript ? setScriptScope() : setScope(type)));
        return row;
    }

    function setScope(type) {
        closeScopePicker();
        const next = type ? String(type).toUpperCase() : null;
        if (next === S.scopeType && !S.scopeScript) return;

        if (!S.context) S.context = {};
        S.scopeScript = null;
        S.scopeType = next;
        S.stypes.clear();
        S.showAllTypes = false;
        refreshHeaderCtx();

        if (!next) {
            S.context.scripts = [];
            S.selected.clear();
            S.scopeLoading = false;
            renderTypeList();
            renderScriptList();
            refresh();
            return;
        }

        S.scopeLoading = true;
        renderScriptList();
        sendEnvelope({
            dest: 'fetcher_rlv',
            type: 'scripts_for',
            payload: { recordType: next }
        });
    }

    function setScriptScope() {
        closeScopePicker();
        if (!S.homeScript || S.scopeScript) return;

        if (!S.context) S.context = {};
        S.scopeScript = S.homeScript;
        S.scopeType = null;
        S.scopeLoading = false;
        S.showAllTypes = false;
        S.context.scripts = [S.homeScript];
        S.selected = new Set([S.homeScript.id]);
        S.stypes = new Set(typesOf(S.context.scripts));
        refreshHeaderCtx();
        renderTypeList();
        renderScriptList();
        refresh();
    }

    const LEVEL_LABEL ={ DEBUG: 'Debug', AUDIT: 'Audit', ERROR: 'Error', EMERGENCY: 'Emergency', SYSTEM: 'System' };

    function fmtCount(n) {
        if (n == null) return '';
        if (n >= 10000) return Math.round(n / 1000) + 'k';
        return String(n);
    }

    function renderLevelChips() {
        const host = qs('#nsft-rlv-levels');
        if (!host) return;
        host.textContent = '';
        LEVELS.forEach((lv) => {
            const b = document.createElement('button');
            b.type = 'button';
            b.className = 'nsft-rlv-lvlchip nsft-rlv-lvl-' + lv.toLowerCase() + (S.levels.has(lv) ? ' is-on' : '');
            const dot = document.createElement('span');
            dot.className = 'nsft-rlv-lvldot';
            const label = document.createElement('span');
            label.textContent = LEVEL_LABEL[lv] || lv;
            const count = document.createElement('span');
            count.className = 'nsft-rlv-lvlcount';
            count.textContent = fmtCount(S.counts.levels[lv]);
            b.append(dot, label, count);
            b.addEventListener('click', () => {
                if (S.levels.has(lv)) S.levels.delete(lv); else S.levels.add(lv);
                renderLevelChips();
                refresh();
            });
            host.appendChild(b);
        });
    }

    const STYPE_LABELS = {
        USEREVENT: ['rlv_stype_userevent', 'User Event'],
        CLIENT: ['rlv_stype_client', 'Client'],
        SCRIPTLET: ['rlv_stype_suitelet', 'Suitelet'],
        SUITELET: ['rlv_stype_suitelet', 'Suitelet'],
        RESTLET: ['rlv_stype_restlet', 'RESTlet'],
        SCHEDULED: ['rlv_stype_scheduled', 'Scheduled'],
        MAPREDUCE: ['rlv_stype_mapreduce', 'Map/Reduce'],
        PORTLET: ['rlv_stype_portlet', 'Portlet'],
        MASSUPDATE: ['rlv_stype_massupdate', 'Mass Update'],
        BUNDLEINSTALLATION: ['rlv_stype_bundleinstallation', 'Bundle Installation'],
        ACTION: ['rlv_stype_action', 'Workflow Action'],
        WORKFLOWACTION: ['rlv_stype_action', 'Workflow Action'],
        BANKCONNECTIVITY: ['rlv_stype_bankconnectivity', 'Bank Connectivity'],
        CUSTOMGLLINES: ['rlv_stype_customgllines', 'Custom GL Lines'],
        CUSTOMTOOL: ['rlv_stype_customtool', 'Custom Tool'],
        EMAILCAPTURE: ['rlv_stype_emailcapture', 'Email Capture'],
        PLUGINTYPE: ['rlv_stype_plugintype', 'Plug-in Type'],
        PLUGINTYPEIMPL: ['rlv_stype_plugintypeimpl', 'Plug-in Implementation'],
        SDFINSTALLATION: ['rlv_stype_sdfinstallation', 'SDF Installation'],
        SPASERVERSCRIPT: ['rlv_stype_spaserverscript', 'SPA Server Script']
    };

    function stypeLabel(raw) {
        const key = String(raw || '').toUpperCase();
        const entry = STYPE_LABELS[key];
        return entry ? i18n(entry[0], entry[1]) : key;
    }

    function typesOf(list) {
        return [...new Set((list || [])
            .map((s) => String(s.stype || '').toUpperCase())
            .filter(Boolean))].sort();
    }

    function renderTypeList() {
        const host = qs('#nsft-rlv-stypes');
        const toggle = qs('#nsft-rlv-typestoggle');
        if (!host) return;
        const ctx = S.context || {};
        const scoped = typesOf(ctx.scripts);
        const rest = typesOf(ctx.allScripts).filter((t) => !scoped.includes(t));
        const canCollapse = scoped.length > 0 && rest.length > 0;

        host.textContent = '';

        const addGroup = (label, list) => {
            if (!list.length) return;
            const h = document.createElement('div');
            h.className = 'nsft-rlv-scriptgroup';
            h.textContent = label;
            host.appendChild(h);
            list.forEach((tp) => host.appendChild(typeRow(tp)));
        };

        addGroup(scopeGroupLabel(), scoped);
        if (!canCollapse || S.showAllTypes) {
            addGroup(scoped.length
                ? i18n('rlv_scripts_rest', 'Todos los demás')
                : i18n('rlv_all_scripts', 'Todos los scripts'), rest);
        }

        if (toggle) {
            toggle.hidden = !canCollapse;
            toggle.textContent = S.showAllTypes
                ? i18n('rlv_types_less', 'Ver menos')
                : i18n('rlv_types_more', 'Ver más ($1)', [String(rest.length)]);
        }
    }

    function typeRow(tp) {
        const row = document.createElement('div');
        row.className = 'nsft-rlv-scriptitem' + (S.stypes.has(tp) ? ' is-on' : '');
        const box = document.createElement('span');
        box.className = 'nsft-rlv-scriptbox';
        box.innerHTML = CHECK_SVG;
        const name = document.createElement('span');
        name.className = 'nsft-rlv-scriptname';
        name.textContent = stypeLabel(tp);
        name.title = stypeLabel(tp);
        row.append(box, name);
        row.addEventListener('click', () => {
            if (S.stypes.has(tp)) S.stypes.delete(tp); else S.stypes.add(tp);
            row.classList.toggle('is-on', S.stypes.has(tp));
        });
        return row;
    }

    function renderScriptList(filterText) {
        const host = qs('#nsft-rlv-scriptlist');
        if (!host) return;
        const ctx = S.context || {};
        const ofRecord = ctx.scripts || [];
        const ofRecordIds = new Set(ofRecord.map((s) => s.id));
        const rest = (ctx.allScripts || []).filter((s) => !ofRecordIds.has(s.id));
        const search = qs('#nsft-rlv-scriptsearch');
        const q = String(filterText != null ? filterText : (search ? search.value : '')).toLowerCase();

        host.textContent = '';

        if (S.scopeLoading) {
            const wait = document.createElement('div');
            wait.className = 'nsft-rlv-ctxempty';
            wait.textContent = i18n('rlv_loading', 'Cargando…');
            host.appendChild(wait);
            return;
        }

        const addGroup = (label, list) => {
            const visible = list.filter((s) => !q || String(s.name || '').toLowerCase().includes(q));
            if (!visible.length) return;
            const h = document.createElement('div');
            h.className = 'nsft-rlv-scriptgroup';
            h.textContent = label;
            host.appendChild(h);
            visible.forEach((s) => host.appendChild(scriptRow(s, q)));
        };

        addGroup(scopeGroupLabel(), ofRecord);
        addGroup(ofRecord.length
            ? i18n('rlv_scripts_rest', 'Todos los demás')
            : i18n('rlv_all_scripts', 'Todos los scripts'), rest);
    }

    const CHECK_SVG = '<svg viewBox="0 0 12 12" stroke="#fff" stroke-width="2" fill="none" stroke-linecap="round"><path d="M2 6.4l2.6 2.6L10 3.4"/></svg>';

    function scriptRow(s, needle) {
        const row = document.createElement('div');
        row.className = 'nsft-rlv-scriptitem' + (S.selected.has(s.id) ? ' is-on' : '');
        const box = document.createElement('span');
        box.className = 'nsft-rlv-scriptbox';
        box.innerHTML = CHECK_SVG;
        const name = document.createElement('span');
        name.className = 'nsft-rlv-scriptname';
        highlightInto(name, s.name || ('#' + s.id), needle);
        name.title = (s.name || '') + ' · ' + stypeLabel(s.stype);
        const count = document.createElement('span');
        count.className = 'nsft-rlv-scriptcount';
        count.textContent = fmtCount(S.counts.scripts[String(s.id)]);
        row.append(box, name, count);
        row.addEventListener('click', () => {
            if (S.selected.has(s.id)) S.selected.delete(s.id); else S.selected.add(s.id);
            row.classList.toggle('is-on', S.selected.has(s.id));
        });
        return row;
    }

    function activeFilterCount() {
        let n = 0;
        if (S.q) n += 1;
        n += S.levels.size;
        const byDefault = new Set(typesOf((S.context || {}).scripts));
        const untouched = S.stypes.size === byDefault.size
            && [...S.stypes].every((tp) => byDefault.has(tp));
        if (!untouched) n += S.stypes.size;
        if (S.range !== 'all') n += 1;
        return n;
    }

    function renderResultsBar() {
        const count = qs('#nsft-rlv-count');
        const ms = qs('#nsft-rlv-ms');
        if (count) {
            count.innerHTML = '';
            const b = document.createElement('b');
            b.textContent = String(S.rows.length);
            count.appendChild(b);
            count.appendChild(document.createTextNode(' ' + i18n('rlv_of_events', 'de $1 eventos', [String(S.total)])));
        }
        if (ms) ms.textContent = (S.lastMs != null) ? (S.lastMs + ' ms') : '';
    }

    function renderAutoField() {
        const el = qs('#nsft-rlv-autosecs');
        if (!el || document.activeElement === el) return;
        el.value = String(S.auto ? Math.max(0, _autoLeft) : S.autoSecs);
        el.classList.toggle('is-counting', S.auto);
    }

    function renderAutoState() {
        const el = qs('#nsft-rlv-autostate');
        if (el) el.classList.toggle('is-live', !!S.auto);
        const chk = qs('#nsft-rlv-autochk');
        if (chk && chk.checked !== !!S.auto) chk.checked = !!S.auto;
        renderAutoField();
    }

    function flashAuto() {
        const pill = qs('#nsft-rlv-auto');
        if (!pill) return;
        pill.classList.add('is-refreshing');
        setTimeout(() => pill.classList.remove('is-refreshing'), 900);
    }

    function renderSkeleton(on) {
        const list = qs('#nsft-rlv-list');
        if (!list) return;
        list.querySelectorAll('.nsft-rlv-skel').forEach((n) => n.remove());
        if (!on) return;
        list.querySelectorAll('.nsft-rlv-row, .nsft-rlv-grouphead').forEach((n) => n.remove());
        const CELL_CLASS = ['', '', ' nsft-rlv-cscript', ' nsft-rlv-ctitle', ''];
        const frag = document.createDocumentFragment();
        for (let i = 0; i < SKELETON_ROWS; i++) {
            const row = document.createElement('div');
            row.className = 'nsft-rlv-skel';
            for (let c = 0; c < 5; c++) {
                const cell = document.createElement('span');
                cell.className = 'nsft-rlv-skelcell' + CELL_CLASS[c];
                row.appendChild(cell);
            }
            frag.appendChild(row);
        }
        list.insertBefore(frag, qs('#nsft-rlv-status'));
    }

    let _moreObserver = null;

    function armInfiniteScroll() {
        const list = qs('#nsft-rlv-list');
        const sentinel = qs('#nsft-rlv-more');
        if (!list || !sentinel || _moreObserver) return;
        if (typeof IntersectionObserver !== 'function') return;
        _moreObserver = new IntersectionObserver((entries) => {
            if (entries.some((en) => en.isIntersecting)) loadNextPage();
        }, { root: list, rootMargin: MORE_MARGIN_PX + 'px 0px' });
        _moreObserver.observe(sentinel);
    }

    function loadNextPage() {
        if (S.loading || S.noMore || !S.rows.length) return;
        if (!S.total || S.rows.length >= S.total) return;
        S.page += 1;
        askLogs();
    }

    function renderStatus(err) {
        const box = qs('#nsft-rlv-status');
        const more = qs('#nsft-rlv-more');
        if (!box) return;
        box.textContent = '';
        box.className = '';

        const firstPage = S.loading && !S.page;
        renderSkeleton(firstPage);

        if (S.loading) {
            box.className = 'is-loading';
        } else if (err) {
            box.className = 'is-error';
            const code = err.errorCode || '';
            box.textContent = (code === 'no_netsuite_tab')
                ? i18n('rlv_panel_no_tab', 'Abre una pestaña de NetSuite para consultar sus logs.')
                : (code === 'no_require' || code === 'query_load')
                    ? i18n('rlv_err_no_suitescript', 'SuiteScript no está disponible en esta página.')
                    : i18n('rlv_err_generic', 'No se pudieron cargar los logs.') + (err.message ? ' — ' + err.message : '');
        } else if (!S.rows.length) {
            box.className = 'is-empty';
            box.textContent = i18n('rlv_empty', 'Sin logs que coincidan con los filtros.');
        }

        if (more) {
            more.hidden = firstPage || !!err || S.noMore || !S.rows.length
                || S.rows.length >= S.total;
            more.textContent = more.hidden ? '' : i18n('rlv_loading_more', 'Cargando más…');
        }
    }

    function parseMs(logdate) {
        if (!logdate) return NaN;
        const t = Date.parse(String(logdate).replace(' ', 'T'));
        return isNaN(t) ? NaN : t;
    }

    function sameBurst(a, b) {
        return !!a && !!b && a.scriptid === b.scriptid
            && Math.abs(parseMs(a.logdate) - parseMs(b.logdate)) <= BURST_GAP_MS;
    }

    function renderRows(from) {
        const list = qs('#nsft-rlv-list');
        if (!list) return;

        let start = 0;
        if (typeof from === 'number' && from > 0 && from <= S.rows.length) {
            start = from;
            if (S.group) {
                while (start > 0 && sameBurst(S.rows[start - 1], S.rows[start])) start--;
            }
        }

        list.querySelectorAll('.nsft-rlv-skel').forEach((n) => n.remove());
        list.querySelectorAll('.nsft-rlv-row, .nsft-rlv-grouphead').forEach((n) => {
            if (!start || Number(n.dataset.idx) >= start) n.remove();
        });

        const status = qs('#nsft-rlv-status');
        const frag = document.createDocumentFragment();

        if (S.group) {
            let i = start;
            while (i < S.rows.length) {
                let j = i;
                while (j + 1 < S.rows.length && sameBurst(S.rows[j], S.rows[j + 1])) j++;
                if (j > i) frag.appendChild(buildGroupHead(S.rows[i], j - i + 1, S.rows[j], i));
                for (let k = i; k <= j; k++) frag.appendChild(buildRow(S.rows[k], k));
                i = j + 1;
            }
        } else {
            for (let k = start; k < S.rows.length; k++) frag.appendChild(buildRow(S.rows[k], k));
        }

        list.insertBefore(frag, status);
        markSelectedRow(false);
        renderDetail();
    }

    function buildGroupHead(first, count, last, idx) {
        const h = document.createElement('div');
        h.className = 'nsft-rlv-grouphead';
        h.dataset.idx = String(idx);
        const stamp = document.createElement('span');
        stamp.className = 'nsft-rlv-gstamp';
        stamp.textContent = first.logdate || '';
        const meta = document.createElement('span');
        meta.className = 'nsft-rlv-gmeta';
        meta.textContent = (first.scriptname || '') + ' · ' + i18n('rlv_group_entries', '$1 entradas', [String(count)]);
        const line = document.createElement('span');
        line.className = 'nsft-rlv-gline';
        const dur = document.createElement('span');
        dur.className = 'nsft-rlv-gmeta';
        const secs = Math.abs(parseMs(first.logdate) - parseMs(last.logdate)) / 1000;
        dur.textContent = isNaN(secs) ? '' : (secs.toFixed(1) + ' s');
        h.append(stamp, meta, line, dur);
        return h;
    }

    function buildRow(r, idx) {
        const row = document.createElement('div');
        row.className = 'nsft-rlv-row';
        row.dataset.idx = String(idx);

        const time = document.createElement('div');
        time.className = 'nsft-rlv-ctime';
        time.textContent = (r.logdate || '').slice(11) || (r.logdate || '');
        time.title = r.logdate || '';

        const level = document.createElement('div');
        const pill = document.createElement('span');
        const lvl = String(r.loglevel || '').toUpperCase();
        pill.className = 'nsft-rlv-pill nsft-rlv-lvl-' + lvl.toLowerCase();
        pill.textContent = lvl;
        level.appendChild(pill);

        const script = document.createElement('div');
        script.className = 'nsft-rlv-cscript';
        script.textContent = r.scriptname || (r.scriptid ? ('#' + r.scriptid) : '—');
        script.title = stypeLabel(r.stype);

        const title = document.createElement('div');
        title.className = 'nsft-rlv-ctitle';
        highlightInto(title, r.title, S.q);
        title.title = r.title || '';

        const detail = document.createElement('div');
        detail.className = 'nsft-rlv-cdetail';
        highlightInto(detail, r.detail, S.q);

        row.append(time, level, script, title, detail);
        row.addEventListener('click', () => {
            if (S.detailOpen && S.selIdx === idx) closeDetail();
            else openDetail(idx);
        });
        return row;
    }

    function markSelectedRow(scroll) {
        const list = qs('#nsft-rlv-list');
        if (!list) return;
        list.querySelectorAll('.nsft-rlv-row').forEach((n) => {
            const on = Number(n.dataset.idx) === S.selIdx;
            n.classList.toggle('is-selected', on);
            if (on && scroll) n.scrollIntoView({ block: 'nearest' });
        });
    }

    function openDetail(idx) {
        const r = S.rows[idx];
        if (!r) return;
        S.selIdx = idx;
        S.detailOpen = true;
        markSelectedRow(false);
        renderDetail();
    }

    function closeDetail() {
        S.detailOpen = false;
        const old = qs('.nsft-rlv-detail');
        if (old) old.remove();
        markSelectedRow(false);
    }

    function isDetailOpen() {
        return !!qs('.nsft-rlv-detail');
    }

    function renderDetail() {
        const list = qs('#nsft-rlv-list');
        if (!list) return;
        const old = list.querySelector('.nsft-rlv-detail');
        if (old) old.remove();
        list.querySelectorAll('.nsft-rlv-row.is-open').forEach((n) => n.classList.remove('is-open'));
        if (!S.detailOpen) return;
        const r = S.rows[S.selIdx];
        const row = list.querySelector('.nsft-rlv-row[data-idx="' + S.selIdx + '"]');
        if (!r || !row) return;
        row.classList.add('is-open');
        row.insertAdjacentElement('afterend', buildDetail(r));
    }

    function buildDetail(r) {
        const box = document.createElement('div');
        box.className = 'nsft-rlv-detail';
        const card = document.createElement('div');
        card.className = 'nsft-rlv-dcard';

        const head = document.createElement('div');
        head.className = 'nsft-rlv-dhead';
        const lvl = String(r.loglevel || '').toUpperCase();
        const pill = document.createElement('span');
        pill.className = 'nsft-rlv-pill nsft-rlv-lvl-' + lvl.toLowerCase();
        pill.textContent = lvl;
        const title = document.createElement('b');
        title.className = 'nsft-rlv-dtitle';
        title.textContent = r.title || '';
        const stamp = document.createElement('span');
        stamp.className = 'nsft-rlv-dstamp';
        stamp.textContent = r.logdate || '';
        const spacer = document.createElement('div');
        spacer.className = 'nsft-rlv-spacer';
        const copy = document.createElement('button');
        copy.type = 'button';
        copy.className = 'nsft-rlv-dcopybtn';
        copy.textContent = i18n('rlv_copy', 'Copiar');
        copy.addEventListener('click', () => copyDetail(r, copy));
        const close = document.createElement('button');
        close.type = 'button';
        close.className = 'nsft-rlv-dclosebtn';
        close.setAttribute('aria-label', i18n('rlv_close', 'Cerrar'));
        close.textContent = '✕';
        close.addEventListener('click', closeDetail);
        head.append(pill, title, stamp, spacer, copy, close);

        const msg = document.createElement('div');
        msg.className = 'nsft-rlv-dmsg';
        const mlabel = document.createElement('div');
        mlabel.className = 'nsft-rlv-dlabel';
        const mtext = document.createElement('span');
        mtext.textContent = i18n('rlv_message', 'Mensaje');
        const kind = document.createElement('span');
        kind.className = 'nsft-rlv-dkind';
        kind.textContent = i18n('rlv_col_detail', 'Detalle').toUpperCase();
        mlabel.append(mtext, kind);

        const pre = document.createElement('div');
        pre.className = 'nsft-rlv-dpre';
        pre.textContent = r.detail || '';
        const LF = window.NSFT_LogFormat;
        if (LF && LF.renderInto && r.detail) {
            const host = document.createElement('div');
            const lang = LF.renderInto(host, r.detail, {
                nameParts: [
                    scopeLabel(),
                    r.scriptname || (r.scriptid ? 'script-' + r.scriptid : ''),
                    String(r.loglevel || '').toLowerCase(),
                    r.title || '',
                    LF.stampPart ? LF.stampPart(r.logdate) : '',
                    r.id != null ? 'note-' + r.id : ''
                ]
            });
            if (lang) {
                pre.textContent = '';
                pre.appendChild(host);
                pre.classList.add('is-formatted');
                kind.textContent = String(lang).toUpperCase();
            }
        }
        msg.append(mlabel, pre);

        const extLink = (href, text, titleTxt) => {
            const a = document.createElement('a');
            a.href = href;
            a.target = '_blank';
            a.rel = 'noopener';
            a.title = titleTxt;
            const t = document.createElement('span');
            t.textContent = text;
            const arrow = document.createElement('span');
            arrow.className = 'nsft-rlv-extarrow';
            arrow.textContent = '↗';
            a.append(t, arrow);
            return a;
        };

        const ctx = document.createElement('aside');
        ctx.className = 'nsft-rlv-dctx';
        const clabel = document.createElement('div');
        clabel.className = 'nsft-rlv-dlabel';
        clabel.textContent = i18n('rlv_context', 'Contexto');
        const meta = document.createElement('div');
        meta.className = 'nsft-rlv-dmeta';
        [
            [i18n('rlv_col_script', 'Script'), r.scriptname || '',
                r.scriptid ? ['/app/common/scripting/script.nl?id=' + encodeURIComponent(r.scriptid), i18n('rlv_open_script', 'Abrir script')] : null],
            [i18n('rlv_stypes', 'Tipo de script'), stypeLabel(r.stype), null],
            [i18n('rlv_ctx_script_id', 'ID de script'), r.scriptid != null ? String(r.scriptid) : '', null],
            [i18n('rlv_ctx_note_id', 'ID de anotación'), r.id != null ? String(r.id) : '',
                r.id != null ? ['/app/common/scripting/scriptnote.nl?id=' + encodeURIComponent(r.id), i18n('rlv_open_note', 'Anotación de script')] : null]
        ].forEach(([k, v, link]) => {
            if (!v) return;
            const row = document.createElement('div');
            row.className = 'nsft-rlv-dmetarow';
            const kk = document.createElement('span'); kk.textContent = k;
            const vv = document.createElement('b');
            if (link) vv.appendChild(extLink(link[0], v, link[1]));
            else vv.textContent = v;
            row.append(kk, vv);
            meta.appendChild(row);
        });
        ctx.append(clabel, meta);

        if (r.scriptid) {
            const btns = document.createElement('div');
            btns.className = 'nsft-rlv-dbtns';
            const ns = extLink(
                '/app/common/scripting/scriptnotearchive.nl?daterange=ALL&date=ALL&sortcol=timestamp&sortdir=DESC&loglevel=&scriptId=' + encodeURIComponent(r.scriptid),
                i18n('rlv_open_ns', 'Ver logs completos'),
                i18n('rlv_open_ns', 'Ver logs completos'));
            ns.id = 'nsft-rlv-dns';
            btns.appendChild(ns);
            ctx.appendChild(btns);
        }

        const cols = document.createElement('div');
        cols.className = 'nsft-rlv-dcols';
        cols.append(msg, ctx);
        card.append(head, cols);
        box.appendChild(card);

        return box;
    }

    function copyDetail(r, btn) {
        const text = (r.logdate || '') + ' ' + (r.loglevel || '') + ' ' + (r.title || '') + '\n' + (r.detail || '');
        const done = () => {
            const orig = btn.textContent;
            btn.textContent = i18n('rlv_copied', 'Copiado');
            setTimeout(() => { btn.textContent = orig; }, 1200);
        };
        if (window.NSFT_Clipboard && window.NSFT_Clipboard.copy) {
            window.NSFT_Clipboard.copy(text, { toast: false, onSuccess: done });
        } else if (navigator.clipboard) {
            navigator.clipboard.writeText(text).then(done);
        }
    }

    const EXPORT_COLS = ['logdate', 'loglevel', 'scriptname', 'title', 'detail'];

    function exportCsv() { startExport('csv'); }
    function exportJson() { startExport('json'); }

    function startExport(fmt) {
        if (S.exporting) return;
        if (!S.rows.length) return;

        if (S.total && S.rows.length >= S.total) {
            writeExport(fmt, S.rows, false);
            return;
        }

        S.exporting = fmt;
        S.expId += 1;
        S.expLoaded = 0;
        S.expTotal = S.total || 0;
        noteExport('');
        renderExportState();

        const payload = filterPayload();
        payload.reqId = S.expId;
        payload.max = EXPORT_MAX;
        postToFetcher('logs_export', payload);
    }

    function writeExport(fmt, rows, truncated) {
        if (!rows || !rows.length) return;
        if (fmt === 'json') {
            const objs = rows.map((r) => ({
                date: r.logdate, level: r.loglevel, script: r.scriptname,
                title: r.title, detail: r.detail
            }));
            saveExport(JSON.stringify(objs, null, 2), 'application/json', 'json');
        } else {
            const esc = (v) => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
            const lines = [['date', 'level', 'script', 'title', 'detail'].join(',')]
                .concat(rows.map((r) => EXPORT_COLS.map((c) => esc(r[c])).join(',')));
            saveExport('﻿' + lines.join('\r\n'), 'text/csv;charset=utf-8', 'csv');
        }
        if (truncated) {
            noteExport(i18n('rlv_export_capped',
                'El fichero lleva las primeras $1 filas; la consulta tiene más.',
                [fmtInt(rows.length)]));
        }
    }

    function fmtInt(n) {
        const v = Number(n) || 0;
        try { return v.toLocaleString(); } catch (e) { return String(v); }
    }

    function renderExportState() {
        [['csv', '#nsft-rlv-export', 'rlv_export_csv', 'CSV'],
        ['json', '#nsft-rlv-exportjson', 'rlv_export_json', 'JSON']].forEach((d) => {
            const btn = qs(d[1]);
            if (!btn) return;
            const busy = S.exporting === d[0];
            btn.disabled = !!S.exporting;
            btn.classList.toggle('is-busy', busy);
            const label = btn.querySelector('span');
            if (!label) return;
            if (!busy) { label.textContent = i18n(d[2], d[3]); return; }
            label.textContent = S.expTotal
                ? fmtInt(S.expLoaded) + ' / ' + fmtInt(S.expTotal)
                : fmtInt(S.expLoaded);
        });
    }

    let _noteTimer = null;

    function noteExport(text, isError) {
        const el = qs('#nsft-rlv-exportnote');
        if (!el) return;
        if (_noteTimer) { clearTimeout(_noteTimer); _noteTimer = null; }
        el.textContent = text || '';
        el.classList.toggle('is-error', !!isError);
        el.hidden = !text;
        if (text) _noteTimer = setTimeout(() => noteExport(''), EXPORT_NOTE_MS);
    }

    function exportFileName(ext) {
        const LF = window.NSFT_LogFormat;
        const partes = ['record-logs'];
        if (S.scopeScript) {
            partes.push(scriptScopeName(S.scopeScript));
        } else {
            const tipo = S.scopeType ? (recordTypeName(S.scopeType) || String(S.scopeType)) : '';
            if (tipo) partes.push(tipo);
            if (S.context && S.context.recordId) partes.push(String(S.context.recordId));
        }

        if (LF && typeof LF.buildFileName === 'function') {
            return LF.buildFileName(partes, ext);
        }
        const sello = new Date().toISOString().slice(0, 19).replace(/[:T-]/g, '');
        const limpio = partes
            .map((p) => String(p).normalize('NFD').replace(/[\u0300-\u036f]/g, '')
                .replace(/[\\/:*?"<>|]/g, '').replace(/[\s-]+/g, '-'))
            .filter(Boolean).join('_');
        return limpio + '_' + sello + '.' + ext;
    }

    function saveExport(text, mime, ext) {
        const url = URL.createObjectURL(new Blob([text], { type: mime }));
        const a = document.createElement('a');
        a.href = url;
        a.download = exportFileName(ext);
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
})();
