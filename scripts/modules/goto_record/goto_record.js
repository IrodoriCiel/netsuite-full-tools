(function () {
    'use strict';

    const STORAGE_KEY = 'enableGoToRecord';
    const SHORTCUT_KEY = 'gotoRecordShortcut';
    const OVERRIDE_KEY = 'gotoRecordOverrideNative';
    const FUZZY_KEY = 'gotoRecordFuzzy';
    const MODAL_ID = 'nsft-gtr-modal';
    const NSFT_THEME_KEY = 'nsftTheme';
    const SUGGEST_DEBOUNCE_MS = 220;
    const SUGGEST_MIN_CHARS = 2;
    const DEFAULT_SHORTCUT = { ctrlKey: false, shiftKey: true, altKey: true, code: 'KeyG' };
    const RECENT_KEY = 'nsftGotoRecent';
    const BOOKMARKS_KEY = 'nsftGotoBookmarks';
    const RECENT_MAX = 15;

    const RB = window.NSFT_RecordButtons;

    let _theme = 'light';
    let _shortcut = DEFAULT_SHORTCUT;
    let _moduleEnabled = false;
    let _overrideNative = true;
    let _fuzzy = false;
    let _onKeydown = null;
    let _onMessage = null;
    let _onShowGoto = null;
    let _lastLookup = '';
    let _searchTimer = null;
    const SEARCH_TIMEOUT_MS = 20000;
    let _suggestToken = 0;
    let _suggBuckets = { token: -1, tx: [], types: [] };
    let _suggestTimer = null;
    let _suggestRows = [];
    let _suggestSelectedIdx = -1;
    let _selectedType = null;

    chrome.storage.local.get({
        [STORAGE_KEY]: true,
        [SHORTCUT_KEY]: null,
        [OVERRIDE_KEY]: true,
        [FUZZY_KEY]: false,
        [NSFT_THEME_KEY]: 'light'
    }, (items) => {
        if (!items[STORAGE_KEY]) return;
        if (RB && RB.isExcludedPage && RB.isExcludedPage()) return;
        _shortcut = (items[SHORTCUT_KEY] && typeof items[SHORTCUT_KEY] === 'object')
            ? items[SHORTCUT_KEY] : DEFAULT_SHORTCUT;
        _overrideNative = items[OVERRIDE_KEY] !== false;
        _fuzzy = !!items[FUZZY_KEY];
        _theme = items[NSFT_THEME_KEY] || 'light';
        enable();
    });

    function enable() {
        if (_moduleEnabled) return;
        _moduleEnabled = true;
        registerShortcut();
        publishShortcutToRegistry();
        _onShowGoto = () => {
            if (document.getElementById(MODAL_ID)) return;
            openModal();
            if (window.NSFT_ShortcutCoach) window.NSFT_ShortcutCoach.hint('goto_record');
        };
        window.addEventListener('nsft-show-goto-record', _onShowGoto);
        _onMessage = handleFetcherMessage;
        window.addEventListener('message', _onMessage);
        recordRecentVisit();
    }

    function cleanUrl(href) {
        try {
            const u = new URL(href);
            ['cl', 'whence', 'twhence'].forEach((p) => u.searchParams.delete(p));
            return u.toString();
        } catch (e) { return href; }
    }

    function recordRecentVisit() {
        try {
            const params = new URLSearchParams(window.location.search);
            const id = params.get('id');
            if (!id || !/^\d+$/.test(id)) return;
            const path = window.location.pathname;
            if (!/\.nl$/.test(path)) return;
            if (/(list|search|dashboard|card)\.nl$/i.test(path)) return;
            const url = cleanUrl(window.location.href);
            const title = (document.title || '').trim() || url;
            chrome.storage.local.get({ [RECENT_KEY]: [] }, (it) => {
                let arr = Array.isArray(it[RECENT_KEY]) ? it[RECENT_KEY] : [];
                arr = arr.filter((e) => e && e.url !== url);
                arr.unshift({ url, title, ts: Date.now() });
                if (arr.length > RECENT_MAX) arr = arr.slice(0, RECENT_MAX);
                chrome.storage.local.set({ [RECENT_KEY]: arr });
            });
        } catch (e) { }
    }

    function showRecentSuggestions() {
        chrome.storage.local.get({ [RECENT_KEY]: [] }, (it) => {
            const input = document.querySelector(`#${MODAL_ID} .nsft-gtr-input`);
            if (!input || (input.value || '').trim() !== '') return;
            const arr = Array.isArray(it[RECENT_KEY]) ? it[RECENT_KEY] : [];
            const cur = cleanUrl(window.location.href);
            const rows = arr
                .filter((e) => e && e.url && e.url !== cur)
                .map((e) => ({ kind: 'recent', url: e.url, title: e.title }));
            if (rows.length) renderSuggestions(rows);
        });
    }

    function loadBookmarks(cb) {
        chrome.storage.local.get({ [BOOKMARKS_KEY]: {} }, (it) => {
            const obj = (it[BOOKMARKS_KEY] && typeof it[BOOKMARKS_KEY] === 'object') ? it[BOOKMARKS_KEY] : {};
            cb(obj);
        });
    }

    function showBookmarkSuggestions(filter) {
        loadBookmarks((obj) => {
            const input = document.querySelector(`#${MODAL_ID} .nsft-gtr-input`);
            if (!input || !/^fav[:\s]/i.test(input.value || '')) return;
            const f = (filter || '').toLowerCase();
            const rows = Object.keys(obj)
                .filter((alias) => !f || alias.toLowerCase().includes(f))
                .sort()
                .map((alias) => ({ kind: 'bookmark', alias, url: obj[alias].url, title: obj[alias].title }));
            renderSuggestions(rows);
        });
    }

    function saveBookmark(alias) {
        alias = (alias || '').trim();
        if (!alias) { showError(i18n('gtr_fav_need_alias', 'Add an alias, e.g. "fav:add my-customer".')); return; }
        const url = cleanUrl(window.location.href);
        const title = (document.title || '').trim() || url;
        loadBookmarks((obj) => {
            obj[alias] = { url, title };
            chrome.storage.local.set({ [BOOKMARKS_KEY]: obj }, () => {
                showStatus(i18n('gtr_fav_saved', 'Bookmark saved.'));
            });
        });
    }

    function deleteBookmark(alias) {
        alias = (alias || '').trim();
        if (!alias) return;
        loadBookmarks((obj) => {
            if (obj[alias]) {
                delete obj[alias];
                chrome.storage.local.set({ [BOOKMARKS_KEY]: obj }, () => {
                    showStatus(i18n('gtr_fav_deleted', 'Bookmark deleted.'));
                    showBookmarkSuggestions('');
                });
            } else {
                showError(i18n('gtr_fav_not_found', 'Bookmark not found.'));
            }
        });
    }

    function gotoBookmark(alias) {
        alias = (alias || '').trim();
        loadBookmarks((obj) => {
            const b = obj[alias];
            if (b && b.url) window.location.href = b.url;
            else showError(i18n('gtr_fav_not_found', 'Bookmark not found.'));
        });
    }

    function disable() {
        if (!_moduleEnabled) return;
        _moduleEnabled = false;
        if (_onKeydown) { document.removeEventListener('keydown', _onKeydown, true); _onKeydown = null; }
        if (_onShowGoto) { window.removeEventListener('nsft-show-goto-record', _onShowGoto); _onShowGoto = null; }
        if (_onMessage) { window.removeEventListener('message', _onMessage); _onMessage = null; }
        closeModal();
        if (window.NSFT_Shortcuts) window.NSFT_Shortcuts.unregisterModule('goto_record');
    }

    chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== 'local') return;
        if (changes[STORAGE_KEY]) {
            const next = !!changes[STORAGE_KEY].newValue;
            if (next && !_moduleEnabled) {
                if (!(RB && RB.isExcludedPage && RB.isExcludedPage())) enable();
            } else if (!next && _moduleEnabled) {
                disable();
            }
        }
        if (changes[NSFT_THEME_KEY]) {
            _theme = changes[NSFT_THEME_KEY].newValue || 'light';
            const modal = document.getElementById(MODAL_ID);
            if (modal) modal.setAttribute('data-theme', resolveTheme());
        }
        if (changes[OVERRIDE_KEY]) {
            _overrideNative = changes[OVERRIDE_KEY].newValue !== false;
        }
        if (changes[FUZZY_KEY]) {
            _fuzzy = !!changes[FUZZY_KEY].newValue;
        }
        if (changes[SHORTCUT_KEY]) {
            _shortcut = (changes[SHORTCUT_KEY].newValue && typeof changes[SHORTCUT_KEY].newValue === 'object')
                ? changes[SHORTCUT_KEY].newValue : DEFAULT_SHORTCUT;
            publishShortcutToRegistry();
        }
    });

    function publishShortcutToRegistry() {
        if (!window.NSFT_Shortcuts) return;
        window.NSFT_Shortcuts.unregisterModule('goto_record');
        window.NSFT_Shortcuts.register(
            'goto_record',
            chrome.i18n.getMessage('cheatsheet_item_gotorecord') || 'Go to record by tranid/id',
            _shortcut,
            {
                group: chrome.i18n.getMessage('cheatsheet_group_global') || 'Global',
                configurable: true,
                storageKey: SHORTCUT_KEY,
                action: 'nsft-show-goto-record',
                order: 30
            }
        );
    }

    function resolveTheme() {
        return _theme === 'dark' ? 'dark' : 'light';
    }

    let _fetcherInjected = false;
    function ensureFetcher() {
        if (_fetcherInjected) return;
        _fetcherInjected = true;
        if (window.NSFT_SuiteQLRest && window.NSFT_SuiteQLRest.ensureTransport) {
            window.NSFT_SuiteQLRest.ensureTransport();
        }
        const s = document.createElement('script');
        s.async = false;
        s.src = chrome.runtime.getURL('scripts/modules/goto_record/goto_record_fetcher.js');
        s.onload = function () { this.remove(); };
        (document.head || document.documentElement).appendChild(s);
    }

    function postToFetcher(type, payload) {
        window.postMessage({ dest: 'fetcher_gtr', type, payload }, '*');
    }

    function fetcherErrorText(payload) {
        const code = (payload && payload.code) || 'query';
        if (code === 'stale') {
            return i18n('gtr_err_stale', 'The extension was updated. Reload the page to search from here again.');
        }
        if (code === 'unavailable') {
            return i18n('gtr_err_unavailable', "Couldn't search from this page. To search from anywhere, the account needs REST web services enabled; without them it only works on pages that load SuiteScript, such as a transaction or a custom record.");
        }
        return i18n('gtr_err_query', 'The search failed. Try again.');
    }

    function handleFetcherMessage(event) {
        if (event.source !== window) return;
        const data = event.data;
        if (!data || data.dest !== 'extension_gtr') return;

        if (data.type === 'tranidResult') {
            handleTranidResult(data.payload);
        } else if (data.type === 'tranidError') {
            showError(fetcherErrorText(data.payload));
        } else if (data.type === 'customRecordResult') {
            handleCustomRecordResult(data.payload);
        } else if (data.type === 'customRecordError') {
            showError(fetcherErrorText(data.payload));
        } else if (data.type === 'transactionSuggestions') {
            handleTransactionSuggestions(data.payload);
        } else if (data.type === 'customRecordSuggestions') {
            handleCustomRecordSuggestions(data.payload);
        } else if (data.type === 'customRecordInstanceSuggestions') {
            handleCustomRecordInstanceSuggestions(data.payload);
        }
    }

    function tranidUrl(type, id) {
        return `/app/accounting/transactions/${String(type).toLowerCase()}.nl?id=${id}`;
    }

    function handleTranidResult(payload) {
        clearSearchTimer();
        const { found, rows } = payload || {};
        if (!found || !rows || !rows.length) {
            showError(i18n('gtr_not_found', 'No matching tranid found.'));
            return;
        }
        const valid = rows.filter(r => r.id && r.type);
        if (!valid.length) {
            showError(i18n('gtr_not_found', 'No matching tranid found.'));
            return;
        }
        if (valid.length === 1) {
            window.location.href = tranidUrl(valid[0].type, valid[0].id);
            return;
        }
        const sugg = valid.map(r => ({
            kind: 'tranid', id: r.id, type: r.type, tranid: r.tranid, trandate: r.trandate
        }));
        renderSuggestions(sugg);
        const status = document.querySelector(`#${MODAL_ID} .nsft-gtr-status`);
        if (status) {
            status.textContent = i18n('gtr_multiple', 'Multiple matches — pick one.');
            status.classList.remove('nsft-gtr-status-error');
        }
    }

    function handleCustomRecordResult(payload) {
        clearSearchTimer();
        const { found, rows, recordId } = payload || {};
        if (!found || !rows || !rows.length) {
            showError(i18n('gtr_custom_not_found', 'Custom record type not found.'));
            return;
        }
        const { rectypeId } = rows[0];
        if (!rectypeId) {
            showError(i18n('gtr_custom_not_found', 'Custom record type not found.'));
            return;
        }
        if (recordId) {
            window.location.href = `/app/common/custom/custrecordentry.nl?rectype=${rectypeId}&id=${recordId}`;
        } else {
            window.location.href = `/app/common/custom/custrecord.nl?id=${rectypeId}&e=T`;
        }
    }

    const RECORD_TYPES = {
        'salesorder':      'app/accounting/transactions/salesord.nl?id=',
        'so':              'app/accounting/transactions/salesord.nl?id=',
        'purchaseorder':   'app/accounting/transactions/purchord.nl?id=',
        'po':              'app/accounting/transactions/purchord.nl?id=',
        'invoice':         'app/accounting/transactions/custinvc.nl?id=',
        'inv':             'app/accounting/transactions/custinvc.nl?id=',
        'vendorbill':      'app/accounting/transactions/vendbill.nl?id=',
        'bill':            'app/accounting/transactions/vendbill.nl?id=',
        'journal':         'app/accounting/transactions/journal.nl?id=',
        'je':              'app/accounting/transactions/journal.nl?id=',
        'customerpayment': 'app/accounting/transactions/custpymt.nl?id=',
        'payment':         'app/accounting/transactions/custpymt.nl?id=',
        'cashsale':        'app/accounting/transactions/cashsale.nl?id=',
        'creditmemo':      'app/accounting/transactions/custcred.nl?id=',
        'itemreceipt':     'app/accounting/transactions/itemrcpt.nl?id=',
        'itemfulfillment': 'app/accounting/transactions/itemship.nl?id=',
        'estimate':        'app/accounting/transactions/estimate.nl?id=',
        'quote':           'app/accounting/transactions/estimate.nl?id=',
        'workorder':       'app/accounting/transactions/workord.nl?id=',
        'wo':              'app/accounting/transactions/workord.nl?id=',
        'transferorder':   'app/accounting/transactions/trnfrord.nl?id=',
        'to':              'app/accounting/transactions/trnfrord.nl?id=',
        'returnauthorization': 'app/accounting/transactions/rtnauth.nl?id=',
        'rma':             'app/accounting/transactions/rtnauth.nl?id=',
        'vendorreturnauthorization': 'app/accounting/transactions/vendauth.nl?id=',
        'vendorcredit':    'app/accounting/transactions/vendcred.nl?id=',
        'vendorpayment':   'app/accounting/transactions/vendpymt.nl?id=',
        'check':           'app/accounting/transactions/check.nl?id=',
        'deposit':         'app/accounting/transactions/deposit.nl?id=',
        'inventoryadjustment': 'app/accounting/transactions/invadjst.nl?id=',
        'inventorytransfer':   'app/accounting/transactions/trnfr.nl?id=',
        'opportunity':     'app/accounting/transactions/opprtnty.nl?id=',
        'opp':             'app/accounting/transactions/opprtnty.nl?id=',
        'expensereport':   'app/accounting/transactions/exprept.nl?id=',
        'creditcard':      'app/accounting/transactions/cardchrg.nl?id=',

        'customer': 'app/common/entity/custjob.nl?id=',
        'cust':     'app/common/entity/custjob.nl?id=',
        'lead':     'app/common/entity/custjob.nl?id=',
        'prospect': 'app/common/entity/custjob.nl?id=',
        'job':      'app/common/entity/job.nl?id=',
        'project':  'app/common/entity/job.nl?id=',
        'vendor':   'app/common/entity/vendor.nl?id=',
        'employee': 'app/common/entity/employee.nl?id=',
        'emp':      'app/common/entity/employee.nl?id=',
        'contact':  'app/common/entity/contact.nl?id=',
        'partner':  'app/common/entity/partner.nl?id=',
        'supportcase': 'app/crm/support/supportcase.nl?id=',
        'case':     'app/crm/support/supportcase.nl?id=',
        'task':     'app/crm/calendar/task.nl?id=',
        'event':    'app/crm/calendar/event.nl?id=',
        'phonecall':'app/crm/calendar/call.nl?id=',
        'call':     'app/crm/calendar/call.nl?id=',
        'campaign': 'app/crm/marketing/campaign.nl?id=',

        'item': 'app/common/item/item.nl?id=',

        'script':       'app/common/scripting/script.nl?id=',
        'deployment':   'app/common/scripting/scriptrecord.nl?id=',
        'scriptdeploy': 'app/common/scripting/scriptrecord.nl?id=',

        'workflow':    'app/common/workflow/setup/workflow.nl?id=',
        'savedsearch': 'app/common/search/search.nl?id=',
        'search':      'app/common/search/search.nl?id='
    };

    function registerShortcut() {
        if (_onKeydown) return;
        _onKeydown = (e) => {
            if (!_moduleEnabled) return;
            if (window.NSFT_Shortcuts && window.NSFT_Shortcuts.matches(e, _shortcut)) {
                if (!_overrideNative) return;
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();
                if (window.NSFT_ShortcutCoach) window.NSFT_ShortcutCoach.noteUsed('goto_record');
                toggleModal();
                return;
            }
            if (e.key === 'Escape' && document.getElementById(MODAL_ID)) {
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();
                if (_suggestRows.length) {
                    renderSuggestions([]);
                } else {
                    closeModal();
                }
            }
        };
        document.addEventListener('keydown', _onKeydown, true);
    }

    function toggleModal() {
        if (document.getElementById(MODAL_ID)) closeModal();
        else openModal();
    }

    function closeModal() {
        clearSearchTimer();
        const el = document.getElementById(MODAL_ID);
        if (el) el.remove();
        _selectedType = null;
        _suggestRows = [];
        _suggestSelectedIdx = -1;
        if (_suggestTimer) { clearTimeout(_suggestTimer); _suggestTimer = null; }
    }

    function openModal() {
        ensureFetcher();
        const overlay = document.createElement('div');
        overlay.id = MODAL_ID;
        overlay.className = 'nsft-gtr-overlay';
        overlay.setAttribute('data-theme', resolveTheme());
        overlay.innerHTML = `
            <div class="nsft-gtr-card" role="dialog" aria-modal="true" aria-labelledby="nsft-gtr-title">
                <header class="nsft-gtr-header">
                    <h2 id="nsft-gtr-title">${escapeHtml(i18n('gtr_title', 'Go to record'))}</h2>
                    <button type="button" class="nsft-gtr-close" aria-label="${escapeHtml(i18n('gtr_close_aria', 'Close'))}">×</button>
                </header>
                <div class="nsft-gtr-body">
                    <input type="text" class="nsft-gtr-input"
                           placeholder="${escapeHtml(i18n('gtr_placeholder', 'e.g. INV-00123  ·  customer 942  ·  invoice 12847'))}"
                           autocomplete="off" spellcheck="false"
                           role="combobox" aria-autocomplete="list" aria-expanded="false"
                           aria-controls="nsft-gtr-suggestions" />
                    <ul id="nsft-gtr-suggestions" class="nsft-gtr-suggestions" role="listbox" hidden></ul>
                    <p class="nsft-gtr-hint">${escapeHtml(i18n('gtr_hint', 'Search by document or transaction number, "type id", or a custom record name (id is optional). Enter to go · Esc to close.'))}</p>
                    <p class="nsft-gtr-status" aria-live="polite"></p>
                </div>
            </div>
        `;
        overlay.addEventListener('click', (ev) => {
            if (ev.target === overlay) closeModal();
        });

        document.body.appendChild(overlay);

        const input = overlay.querySelector('.nsft-gtr-input');
        const closeBtn = overlay.querySelector('.nsft-gtr-close');
        if (closeBtn) closeBtn.addEventListener('click', closeModal);
        if (input) {
            input.focus();
            showRecentSuggestions();
            input.addEventListener('keydown', (e) => {
                if (e.key === 'ArrowDown') {
                    if (_suggestRows.length) {
                        e.preventDefault();
                        moveSuggestSelection(1);
                    }
                    return;
                }
                if (e.key === 'ArrowUp') {
                    if (_suggestRows.length) {
                        e.preventDefault();
                        moveSuggestSelection(-1);
                    }
                    return;
                }
                if (e.key === 'Enter') {
                    e.preventDefault();
                    if (_suggestSelectedIdx >= 0 && _suggestRows[_suggestSelectedIdx]) {
                        applySuggestion(_suggestRows[_suggestSelectedIdx]);
                    } else {
                        submit(input.value);
                    }
                }
            });
            input.addEventListener('input', onInputChange);
        }
    }

    function onInputChange() {
        const input = document.querySelector(`#${MODAL_ID} .nsft-gtr-input`);
        if (!input) return;
        const value = input.value || '';
        if (_suggestTimer) clearTimeout(_suggestTimer);

        if (!_selectedType && value.trim() === '') {
            showRecentSuggestions();
            return;
        }

        const favMatch = /^fav[:\s]\s*(.*)$/i.exec(value);
        if (!_selectedType && favMatch) {
            showBookmarkSuggestions(favMatch[1].trim());
            return;
        }

        if (_selectedType) {
            const nameLower = _selectedType.name.toLowerCase();
            const valueLower = value.toLowerCase();
            const valueTrimLower = valueLower.trim();
            let filter = null;

            if (valueTrimLower === nameLower) {
                filter = '';
            } else if (valueLower.startsWith(nameLower + ' ')) {
                filter = value.substring(_selectedType.name.length + 1).trim();
            } else if (valueTrimLower === '') {
                filter = '';
            }

            if (filter !== null) {
                requestInstanceSuggestions(filter);
                return;
            }
            _selectedType = null;
        }

        const queryAlias = extractSuggestQuery(value);
        if (!queryAlias || queryAlias.length < SUGGEST_MIN_CHARS) {
            renderSuggestions([]);
            return;
        }
        const token = ++_suggestToken;
        _suggBuckets = { token, tx: [], types: [] };
        _suggestTimer = setTimeout(() => {
            postToFetcher('suggestCustomRecords', { query: queryAlias, token, fuzzy: _fuzzy });
            if (looksLikeDocNumber(queryAlias)) {
                _lastLookup = queryAlias.toUpperCase();
                postToFetcher('suggestTransactions', { prefix: queryAlias, token });
            }
        }, SUGGEST_DEBOUNCE_MS);
    }

    function requestInstanceSuggestions(filter) {
        if (!_selectedType) return;
        if (_suggestTimer) clearTimeout(_suggestTimer);
        const token = ++_suggestToken;
        _suggestTimer = setTimeout(() => {
            postToFetcher('suggestCustomRecordInstances', {
                scriptid: _selectedType.scriptid,
                rectypeId: _selectedType.rectypeId,
                typeName: _selectedType.name,
                filter,
                token
            });
        }, SUGGEST_DEBOUNCE_MS);
    }

    function extractSuggestQuery(value) {
        const trimmed = (value || '').trim();
        if (!trimmed) return '';
        const tokens = trimmed.split(/\s+/);
        const last = tokens[tokens.length - 1];
        if (tokens.length >= 2 && /^\d+$/.test(last)) return '';
        return trimmed;
    }

    function looksLikeDocNumber(v) {
        v = String(v || '').trim();
        if (v.length < 4 || /\s/.test(v)) return false;
        if (/^customrecord/i.test(v)) return false;
        return /\d/.test(v);
    }

    function mergeSuggestions(token, key, rows) {
        if (token !== _suggestToken) return;
        if (_suggBuckets.token !== token) _suggBuckets = { token, tx: [], types: [] };
        _suggBuckets[key] = rows || [];
        const prev = _suggestSelectedIdx;
        const prevRow = (prev >= 0) ? _suggestRows[prev] : null;
        renderSuggestions(_suggBuckets.tx.concat(_suggBuckets.types));
        if (prevRow) {
            const idx = _suggestRows.findIndex((r) => r.kind === prevRow.kind
                && String(r.id || r.rectypeId || '') === String(prevRow.id || prevRow.rectypeId || ''));
            if (idx >= 0) setSuggestSelection(idx);
        }
    }

    function handleTransactionSuggestions(payload) {
        if (!payload) return;
        if (payload.token !== _suggestToken) return;
        noteSuggestError(payload);
        mergeSuggestions(payload.token, 'tx', (payload.rows || []).map((r) => ({
            kind: 'tranid',
            id: r.id,
            type: r.type,
            tranid: r.tranid,
            transactionnumber: r.transactionnumber,
            trandate: r.trandate
        })));
    }

    function handleCustomRecordSuggestions(payload) {
        if (!payload) return;
        if (payload.token !== _suggestToken) return;
        noteSuggestError(payload);
        mergeSuggestions(payload.token, 'types', (payload.rows || []).map((r) => ({
            kind: 'type',
            rectypeId: r.rectypeId,
            scriptid: r.scriptid,
            name: r.name
        })));
    }

    function handleCustomRecordInstanceSuggestions(payload) {
        if (!payload) return;
        if (payload.token !== _suggestToken) return;
        noteSuggestError(payload);
        const rows = [];
        if (payload.rectypeId) {
            rows.push({
                kind: 'definition',
                rectypeId: payload.rectypeId,
                scriptid: payload.scriptid || '',
                name: payload.typeName || ''
            });
        }
        for (const r of (payload.rows || [])) {
            rows.push({
                kind: 'instance',
                rectypeId: payload.rectypeId,
                scriptid: payload.scriptid || '',
                recordId: r.id,
                name: r.name || ''
            });
        }
        renderSuggestions(rows);
    }

    function renderSuggestions(rows) {
        _suggestRows = rows || [];
        _suggestSelectedIdx = -1;
        const list = document.getElementById('nsft-gtr-suggestions');
        const input = document.querySelector(`#${MODAL_ID} .nsft-gtr-input`);
        if (!list) return;
        if (!_suggestRows.length) {
            list.hidden = true;
            list.innerHTML = '';
            if (input) input.setAttribute('aria-expanded', 'false');
            return;
        }
        list.hidden = false;
        if (input) input.setAttribute('aria-expanded', 'true');
        list.textContent = '';
        _suggestRows.forEach((r, i) => list.appendChild(renderSuggestionRow(r, i)));
        list.querySelectorAll('.nsft-gtr-suggest-item').forEach((el) => {
            el.addEventListener('mousedown', (ev) => {
                ev.preventDefault();
                const idx = parseInt(el.getAttribute('data-idx'), 10);
                if (!isNaN(idx) && _suggestRows[idx]) applySuggestion(_suggestRows[idx]);
            });
            el.addEventListener('mouseenter', () => {
                const idx = parseInt(el.getAttribute('data-idx'), 10);
                if (!isNaN(idx)) setSuggestSelection(idx);
            });
        });
    }

    function makeSuggestItem(i, nameText, subText, extraClass) {
        const li = document.createElement('li');
        li.className = 'nsft-gtr-suggest-item' + (extraClass ? ' ' + extraClass : '');
        li.setAttribute('role', 'option');
        li.setAttribute('data-idx', String(i));
        li.setAttribute('aria-selected', 'false');
        const name = document.createElement('span');
        name.className = 'nsft-gtr-suggest-name';
        name.textContent = nameText;
        li.appendChild(name);
        const sub = document.createElement('span');
        sub.className = 'nsft-gtr-suggest-scriptid';
        sub.textContent = subText || '';
        li.appendChild(sub);
        return li;
    }

    function renderSuggestionRow(r, i) {
        if (r.kind === 'definition') {
            const label = i18n('gtr_open_definition', 'Open custom record');
            return makeSuggestItem(i, `${label} — ${r.name || ''}`, r.scriptid || '', 'nsft-gtr-suggest-defn');
        }
        if (r.kind === 'instance') {
            return makeSuggestItem(i, r.name || `#${r.recordId}`, `#${r.recordId || ''}`);
        }
        if (r.kind === 'tranid') {
            const dateStr = r.trandate ? String(r.trandate) : `#${r.id}`;
            const tn = String(r.transactionnumber || '').toUpperCase();
            const ti = String(r.tranid || '').toUpperCase();
            const byTxnNumber = tn && _lastLookup
                && tn.indexOf(_lastLookup) === 0
                && ti.indexOf(_lastLookup) !== 0;
            const title = byTxnNumber
                ? `${r.transactionnumber} · ${r.tranid || ('#' + r.id)} · ${r.type}`
                : `${r.tranid || ('#' + r.id)} · ${r.type}`;
            return makeSuggestItem(i, title, dateStr);
        }
        if (r.kind === 'recent') {
            return makeSuggestItem(i, r.title || r.url, i18n('gtr_recent_tag', 'Recent'), 'nsft-gtr-suggest-recent');
        }
        if (r.kind === 'bookmark') {
            return makeSuggestItem(i, `★ ${r.alias}`, r.title || r.url, 'nsft-gtr-suggest-bookmark');
        }
        return makeSuggestItem(i, r.name || '', r.scriptid || '');
    }

    function moveSuggestSelection(delta) {
        if (!_suggestRows.length) return;
        let next = _suggestSelectedIdx + delta;
        if (next < 0) next = _suggestRows.length - 1;
        if (next >= _suggestRows.length) next = 0;
        setSuggestSelection(next);
    }

    function setSuggestSelection(idx) {
        _suggestSelectedIdx = idx;
        const items = document.querySelectorAll(`#${MODAL_ID} .nsft-gtr-suggest-item`);
        items.forEach((el, i) => {
            const sel = i === idx;
            el.classList.toggle('nsft-gtr-suggest-selected', sel);
            el.setAttribute('aria-selected', sel ? 'true' : 'false');
            if (sel && el.scrollIntoView) el.scrollIntoView({ block: 'nearest' });
        });
    }

    function applySuggestion(row) {
        const input = document.querySelector(`#${MODAL_ID} .nsft-gtr-input`);
        if (!input || !row) return;

        if (row.kind === 'definition') {
            window.location.href = `/app/common/custom/custrecord.nl?id=${row.rectypeId}&e=T`;
            return;
        }
        if (row.kind === 'instance') {
            window.location.href = `/app/common/custom/custrecordentry.nl?rectype=${row.rectypeId}&id=${row.recordId}`;
            return;
        }
        if (row.kind === 'tranid') {
            window.location.href = tranidUrl(row.type, row.id);
            return;
        }
        if (row.kind === 'recent' || row.kind === 'bookmark') {
            if (row.url) window.location.href = row.url;
            return;
        }

        _selectedType = { rectypeId: row.rectypeId, scriptid: row.scriptid, name: row.name };
        input.value = `${row.name} `;
        input.focus();
        requestInstanceSuggestions('');
    }

    function showError(msg) {
        clearSearchTimer();
        showStatusError(msg);
    }

    function showStatusError(msg) {
        const status = document.querySelector(`#${MODAL_ID} .nsft-gtr-status`);
        if (status) {
            status.textContent = msg;
            status.classList.add('nsft-gtr-status-error');
        }
    }

    function noteSuggestError(payload) {
        if (_searchTimer) return;
        if (payload && payload.error) {
            showStatusError(fetcherErrorText({ code: payload.code }));
            return;
        }
        const status = document.querySelector(`#${MODAL_ID} .nsft-gtr-status`);
        if (status && status.classList.contains('nsft-gtr-status-error')) {
            status.textContent = '';
            status.classList.remove('nsft-gtr-status-error');
        }
    }

    function clearSearchTimer() {
        if (_searchTimer) { clearTimeout(_searchTimer); _searchTimer = null; }
    }

    function showSearching() {
        clearSearchTimer();
        _searchTimer = setTimeout(() => {
            _searchTimer = null;
            showError(i18n('gtr_err_query', 'The search failed. Try again.'));
        }, SEARCH_TIMEOUT_MS);
        showStatus(i18n('gtr_searching', 'Looking up…'));
    }

    function showStatus(msg) {
        const status = document.querySelector(`#${MODAL_ID} .nsft-gtr-status`);
        if (status) {
            status.textContent = msg;
            status.classList.remove('nsft-gtr-status-error');
        }
    }

    function submit(rawValue) {
        const value = (rawValue || '').trim();
        if (!value) return;

        const favCmd = /^fav[:\s]\s*(.*)$/i.exec(value);
        if (favCmd) {
            const rest = favCmd[1].trim();
            const addM = /^add\s+(.+)$/i.exec(rest);
            const delM = /^del\s+(.+)$/i.exec(rest);
            if (addM) { saveBookmark(addM[1]); return; }
            if (delM) { deleteBookmark(delM[1]); return; }
            if (rest) { gotoBookmark(rest); return; }
            return;
        }

        if (_selectedType) {
            const nameLower = _selectedType.name.toLowerCase();
            const valueLower = value.toLowerCase();
            if (valueLower === nameLower) {
                window.location.href = `/app/common/custom/custrecord.nl?id=${_selectedType.rectypeId}&e=T`;
                return;
            }
            if (valueLower.startsWith(nameLower + ' ')) {
                const rest = value.substring(_selectedType.name.length + 1).trim();
                if (/^\d+$/.test(rest)) {
                    window.location.href = `/app/common/custom/custrecordentry.nl?rectype=${_selectedType.rectypeId}&id=${rest}`;
                    return;
                }
                if (!rest) {
                    window.location.href = `/app/common/custom/custrecord.nl?id=${_selectedType.rectypeId}&e=T`;
                    return;
                }
                window.location.href = `/app/common/custom/custrecord.nl?id=${_selectedType.rectypeId}&e=T`;
                return;
            }
            _selectedType = null;
        }

        const tokens = value.split(/\s+/);
        const lastToken = tokens[tokens.length - 1];

        if (tokens.length >= 2 && /^\d+$/.test(lastToken)) {
            const idToken = lastToken;
            const aliasTokens = tokens.slice(0, -1);

            if (aliasTokens.length === 1) {
                const alias = aliasTokens[0].toLowerCase();
                const urlSeg = RECORD_TYPES[alias];
                if (urlSeg) {
                    window.location.href = `/${urlSeg}${idToken}`;
                    return;
                }
            }

            showSearching();
            postToFetcher('lookupCustomRecord', { alias: aliasTokens.join(' '), id: idToken });
            return;
        }

        if (tokens.length >= 2) {
            showSearching();
            postToFetcher('lookupCustomRecord', { alias: value, id: '' });
            return;
        }

        if (/^customrecord[a-z0-9_]*$/i.test(value)) {
            showSearching();
            postToFetcher('lookupCustomRecord', { alias: value, id: '' });
            return;
        }

        if (/^[A-Za-z]/.test(value) || value.includes('-')) {
            showSearching();
            _lastLookup = value.toUpperCase();
            postToFetcher('lookupTranid', { tranid: value });
            return;
        }

        if (/^\d+$/.test(value)) {
            showError(i18n('gtr_need_type', 'Add a type before the id (e.g. "invoice 12847").'));
            return;
        }

        showError(i18n('gtr_bad_input', 'Unrecognized input.'));
    }

    function i18n(key, fallback) {
        const msg = chrome.i18n.getMessage(key);
        return msg || fallback || key;
    }

    const escapeHtml = (window.NSFT_DOM && window.NSFT_DOM.escapeHtml)
        ? window.NSFT_DOM.escapeHtml
        : (s) => String(s == null ? '' : s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
})();
