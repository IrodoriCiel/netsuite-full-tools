(function () {
    'use strict';

    const STORAGE_KEY = 'enableRecordOptionsMenu';
    const MENU_ID = 'nsft-record-options-menu';
    const ID_RE = /^\d+$/;

    const DOM = window.NSFT_DOM;
    const RB = window.NSFT_RecordButtons;

    const esc = (DOM && DOM.escapeHtml)
        ? DOM.escapeHtml
        : (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

    const jsEsc = (v) => String(v == null ? '' : v).replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/[\r\n]/g, '');
    const attrEsc = (v) => String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    let _enabled = false;
    let _unsubscribe = null;
    let _menuCell = null;
    let _cachedUrl = null;
    let _envEnabled = false;
    let _sqlEnabled = false;
    let _copyHandler = null;
    let _sscEnabled = false;
    let _delEnabled = false, _delMode = 'button';
    let _easEnabled = false, _easMode = 'button';
    let _saeEnabled = false, _saeMode = 'button';
    let _rtrailEnabled = false;

    chrome.storage.local.get({
        [STORAGE_KEY]: true,
        enableOpenInOtherEnv: true,
        enableSuiteQLRunner: true,
        enableSuiteScriptConsole: true,
        enableDeleteRecordButton: true,
        enableEditAndSaveButton: true,
        enableSaveAndEditButton: true,
        enableRecordTrail: true,
        deleteRecordButtonMode: 'menu',
        editAndSaveButtonMode: 'menu',
        saveAndEditButtonMode: 'menu'
    }, (setting) => {
        if (!setting[STORAGE_KEY]) return;
        _envEnabled = !!setting.enableOpenInOtherEnv;
        _sqlEnabled = !!setting.enableSuiteQLRunner;
        _sscEnabled = !!setting.enableSuiteScriptConsole;
        _delEnabled = !!setting.enableDeleteRecordButton;
        _easEnabled = !!setting.enableEditAndSaveButton;
        _saeEnabled = !!setting.enableSaveAndEditButton;
        _rtrailEnabled = !!setting.enableRecordTrail;
        _delMode = setting.deleteRecordButtonMode;
        _easMode = setting.editAndSaveButtonMode;
        _saeMode = setting.saveAndEditButtonMode;
        start();
    });

    const ACTION_KEYS = [
        'enableDeleteRecordButton', 'enableEditAndSaveButton', 'enableSaveAndEditButton',
        'deleteRecordButtonMode', 'editAndSaveButtonMode', 'saveAndEditButtonMode',
        'enableRecordTrail'
    ];

    chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== 'local') return;
        if (changes[STORAGE_KEY]) {
            const next = !!changes[STORAGE_KEY].newValue;
            if (next !== _enabled) {
                if (next) start();
                else teardown();
            }
            return;
        }
        if (ACTION_KEYS.some((k) => changes[k])) {
            if (changes.enableDeleteRecordButton) _delEnabled = !!changes.enableDeleteRecordButton.newValue;
            if (changes.enableEditAndSaveButton) _easEnabled = !!changes.enableEditAndSaveButton.newValue;
            if (changes.enableSaveAndEditButton) _saeEnabled = !!changes.enableSaveAndEditButton.newValue;
            if (changes.deleteRecordButtonMode) _delMode = changes.deleteRecordButtonMode.newValue;
            if (changes.editAndSaveButtonMode) _easMode = changes.editAndSaveButtonMode.newValue;
            if (changes.saveAndEditButtonMode) _saeMode = changes.saveAndEditButtonMode.newValue;
            if (changes.enableRecordTrail) _rtrailEnabled = !!changes.enableRecordTrail.newValue;
            if (_enabled) rerenderMenu();
        }
    });

    function rerenderMenu() {
        const existing = document.getElementById(MENU_ID);
        if (existing) existing.remove();
        _menuCell = null;
        _cachedUrl = null;
        addMenu();
    }

    function start() {
        if (!RB || typeof RB.isExcludedPage !== 'function') {
            console.warn('[NSFT] record_options_menu: NSFT_RecordButtons no disponible (¿_shared no cargó?). Menú no inyectado.');
            return;
        }
        if (RB.isExcludedPage()) return;

        const path = window.location.pathname;
        if (/\/app\/center\//.test(path) || /\/(dashboard|card)\.nl(\?|$)/.test(path)) return;

        _enabled = true;
        injectIconStyles();

        if (!_copyHandler) {
            _copyHandler = function () {
                const cleanUrl = buildCleanUrl();
                if (window.NSFT_Clipboard && window.NSFT_Clipboard.copy) {
                    window.NSFT_Clipboard.copy(cleanUrl, { toast: { message: chrome.i18n.getMessage('recordOptionCopyCleanUrl') } });
                } else if (navigator.clipboard) {
                    navigator.clipboard.writeText(cleanUrl);
                }
            };
            window.addEventListener('nsft-roptions-copy-url', _copyHandler);
        }

        addMenu();
        observeDomChanges();
    }

    function teardown() {
        _enabled = false;
        if (_unsubscribe) { try { _unsubscribe(); } catch (e) { } _unsubscribe = null; }
        if (_copyHandler) { window.removeEventListener('nsft-roptions-copy-url', _copyHandler); _copyHandler = null; }
        const existing = document.getElementById(MENU_ID);
        if (existing) existing.remove();
        _menuCell = null;
        _cachedUrl = null;
    }

    function injectIconStyles() {
        if (document.getElementById('nsft-record-options-icon-css')) return;
        const style = document.createElement('style');
        style.id = 'nsft-record-options-icon-css';
        style.textContent = `
            #${MENU_ID} .ns-menuitem-link .nsft-tools-icon {
                display: inline-flex !important;
                align-items: center !important;
                justify-content: center !important;
                width: 16px !important;
                height: 16px !important;
                flex: 0 0 16px !important;
            }
            #${MENU_ID} .ns-menuitem-link .nsft-tools-icon svg {
                width: 14px !important;
                height: 14px !important;
                display: block !important;
                visibility: visible !important;
                opacity: 1 !important;
            }
        `;
        document.head.appendChild(style);
    }

    function getButtonsRow() {
        if (DOM) {
            return DOM.q([
                '.uir-buttons-top .uir-buttons',
                '.uir-header-buttons .uir-buttons',
                'tr.uir-buttons',
                '[class*="buttons-top"] [class*="buttons"]'
            ], { module: 'record_options_menu', purpose: 'buttons row' });
        }
        return document.querySelector('.uir-buttons-top .uir-buttons')
            || document.querySelector('.uir-header-buttons .uir-buttons')
            || document.querySelector('tr.uir-buttons');
    }

    function addMenu() {
        if (document.getElementById(MENU_ID)) return;

        const buttonsRow = getButtonsRow();
        if (!buttonsRow) return;

        if (_menuCell && _cachedUrl === window.location.href) {
            buttonsRow.appendChild(_menuCell);
            return;
        }

        const context = getPageContext();
        _menuCell = createMenuElement(context);
        _cachedUrl = window.location.href;
        buttonsRow.appendChild(_menuCell);
    }

    function getPageContext() {
        const url = window.location.href.toLowerCase();
        const params = new URLSearchParams(window.location.search);
        const cleanId = (v) => (v && ID_RE.test(v)) ? v : null;
        const isTransaction = url.includes('/transactions/') && !url.includes('scriptlet.nl');

        let customtype = cleanId(params.get('customtype'));
        if (!customtype && isTransaction) {
            const input = document.querySelector('input[name="customtype"]');
            if (input && ID_RE.test(input.value)) customtype = input.value;
        }
        const isCustomTransaction = isTransaction && !!customtype;

        return {
            isCustomRecord: url.includes('custrecordentry.nl'),
            isCustomTransaction: isCustomTransaction,
            isStandardTransaction: isTransaction && !isCustomTransaction,
            isEntity: url.includes('/app/common/entity/'),
            isItem: url.includes('/app/common/item/'),
            rectype: cleanId(params.get('rectype')),
            id: cleanId(params.get('id')),
            customtype: customtype,
            searchString: window.location.search.substring(1)
        };
    }

    function createMenuElement(context) {
        const td = document.createElement('td');
        td.className = 'uir-button-menu nsft-record-options-menu-cell';
        td.id = MENU_ID;
        td.setAttribute('data-automation-id', 'nsft-record-options-menu');

        const label = esc(chrome.i18n.getMessage('recordOptionsTitle'));
        const innerOptions = generateOptionsHtml(context);

        td.innerHTML = `
            <ul class="ns-menu">
                <li class="ns-menuitem" onpointerover="if(window.NS&&NS.UI&&NS.UI.Helpers&&NS.UI.Helpers.Menu)NS.UI.Helpers.Menu.initializeMenu(this);" data-group="">
                    <a href="javascript:void(0)" class="ns-menuitem-link" style="font-weight:600; display:flex; align-items:center; gap:5px;">
                        <img src="${chrome.runtime.getURL('assets/img/logomini.png')}" style="width:16px; height:16px; object-fit:contain; vertical-align:text-top;">
                        ${label}
                    </a>
                    <ul class="ns-menu">
                        ${innerOptions}
                    </ul>
                </li>
            </ul>
        `;
        return td;
    }

    const ICON_ATTRS = 'xmlns="http://www.w3.org/2000/svg" width="14" height="14" style="width:14px!important;height:14px!important;display:block!important;flex:0 0 14px;" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"';
    const ICONS = {
        settings: `<svg viewBox="0 0 24 24" ${ICON_ATTRS}><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h0a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v0a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>`,
        plus_circle: `<svg viewBox="0 0 24 24" ${ICON_ATTRS}><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>`,
        columns: `<svg viewBox="0 0 24 24" ${ICON_ATTRS}><path d="M12 3h7a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-7m0-18H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h7m0-18v18"/></svg>`,
        dependents: `<svg viewBox="0 0 24 24" ${ICON_ATTRS}><circle cx="6" cy="3" r="2"/><circle cx="6" cy="21" r="2"/><circle cx="18" cy="12" r="2"/><path d="M6 5v6a3 3 0 0 0 3 3h7"/><path d="M6 19v-6a3 3 0 0 1 3-3h7"/></svg>`,
        trail: `<svg viewBox="0 0 24 24" ${ICON_ATTRS}><circle cx="5" cy="19" r="2"/><circle cx="19" cy="5" r="2"/><path d="M5 17v-2a4 4 0 0 1 4-4h6a4 4 0 0 0 4-4V7"/></svg>`,
        xml: `<svg viewBox="0 0 24 24" ${ICON_ATTRS}><polyline points="14 2 14 8 20 8"/><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="10 13 8 15 10 17"/><polyline points="14 13 16 15 14 17"/></svg>`,
        suiteql: `<svg viewBox="0 0 24 24" ${ICON_ATTRS}><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v6c0 1.66 4.03 3 9 3s9-1.34 9-3V5"/><path d="M3 11v6c0 1.66 4.03 3 9 3s9-1.34 9-3v-6"/></svg>`,
        suitescript_console: `<svg viewBox="0 0 24 24" ${ICON_ATTRS}><rect x="3" y="4" width="18" height="16" rx="2"/><polyline points="7 9 10 12 7 15"/><line x1="13" y1="15" x2="17" y2="15"/></svg>`,
        open_in_env: `<svg viewBox="0 0 24 24" ${ICON_ATTRS}><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>`,
        link: `<svg viewBox="0 0 24 24" ${ICON_ATTRS}><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>`,
        save: `<svg viewBox="0 0 24 24" ${ICON_ATTRS}><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>`,
        edit: `<svg viewBox="0 0 24 24" ${ICON_ATTRS}><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`,
        trash: `<svg viewBox="0 0 24 24" ${ICON_ATTRS}><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>`
    };

    function buildRecordActions() {
        const actions = [];
        const hasId = RB && typeof RB.hasRecordId === 'function' ? RB.hasRecordId() : true;
        if (!hasId) return actions;
        const editMode = RB && typeof RB.isEditMode === 'function' ? RB.isEditMode() : false;

        if (_saeEnabled && _saeMode === 'menu' && editMode) {
            actions.push(createActionMenuItem(chrome.i18n.getMessage('saveAndEdit'), 'save',
                `if(typeof nsft_saveAndEdit=='function'){nsft_saveAndEdit();}return false;`));
        }
        if (_easEnabled && _easMode === 'menu' && !editMode) {
            actions.push(createActionMenuItem(chrome.i18n.getMessage('ro_edit_save'), 'edit',
                `if(typeof nsft_maoEditAndSave=='function'){nsft_maoEditAndSave();}return false;`));
        }
        if (_delEnabled && _delMode === 'menu') {
            actions.push(createActionMenuItem(chrome.i18n.getMessage('btn_delete'), 'trash',
                `if(typeof nsft_deleteRecord=='function'){nsft_deleteRecord();}return false;`));
        }

        if (_sscEnabled) {
            const codigo = [
                '// ' + (chrome.i18n.getMessage('ssc_load_tpl_1') || 'The record open on this page'),
                'const cr = currentRecord.get();',
                '',
                '// ' + (chrome.i18n.getMessage('ssc_load_tpl_2') || 'Loaded again from the server, whole'),
                'const r = record.load({',
                '    type: cr.type,',
                '    id: cr.id',
                '});',
                '',
                'r'
            ].join('\n');
            const titulo = chrome.i18n.getMessage('ssc_load_tab_title') || 'Record';
            const onclick = '(function(){'
                + 'var t=null,i=null;'
                + "try{if(typeof nlapiGetRecordType==='function')t=nlapiGetRecordType();}catch(e){}"
                + "try{if(typeof nlapiGetRecordId==='function')i=nlapiGetRecordId();}catch(e){}"
                + 'window.dispatchEvent(new CustomEvent(\'nsft-show-suitescript-console\',{detail:{'
                + 'prefillRecord:{type:t,id:i},'
                + 'prefillCode:' + JSON.stringify(codigo) + ','
                + 'prefillTitle:' + JSON.stringify(titulo)
                + '}}));})();return false;';
            actions.push(createActionMenuItem(
                chrome.i18n.getMessage('recordOptionLoadInConsole') || 'Load in SuiteScript Console',
                'suitescript_console', onclick));
        }
        return actions;
    }

    function generateOptionsHtml(context) {
        const items = [];

        const recordActions = buildRecordActions();
        let _actionsInserted = false;
        const insertActions = () => {
            if (_actionsInserted || !recordActions.length) return;
            _actionsInserted = true;
            recordActions.forEach((a) => items.push(a));
        };

        if (context.isCustomRecord) {
            if (context.rectype) {
                items.push(createMenuItem(chrome.i18n.getMessage('recordOptionOpenCustomRecord'),
                    `/app/common/custom/custrecord.nl?id=${context.rectype}&e=T`, 'settings'));
                items.push(createMenuItem(chrome.i18n.getMessage('recordOptionAddField'),
                    `/app/common/custom/custreccustfield.nl?rectype=${context.rectype}`, 'plus_circle'));
                if (context.id && _sqlEnabled) {
                    insertActions();
                    const onclick = `window.dispatchEvent(new CustomEvent('nsft-show-suiteql-runner', { detail: { prefillRecord: { rectype: '${jsEsc(context.rectype)}', id: '${jsEsc(context.id)}' } } })); return false;`;
                    items.push(createActionMenuItem(chrome.i18n.getMessage('recordOptionRunSuiteQL'), 'suiteql', onclick));
                }
            }
            if (context.id && context.rectype) {
                items.push(createMenuItem(chrome.i18n.getMessage('recordOptionViewDependentRecords'),
                    `/core/pages/childrecords.nl?id=${context.id}&t=CustomRecordEntry&rectype=${context.rectype}`, 'dependents'));
            }
        }

        if (context.isCustomTransaction) {
            const cType = context.customtype;
            if (cType) {
                items.push(createMenuItem(chrome.i18n.getMessage('recordOptionOpenCustomTransaction'),
                    `/app/common/custom/customtransaction.nl?id=${cType}&e=T`, 'settings'));
                items.push(createMenuItem(chrome.i18n.getMessage('recordOptionAddField'),
                    `/app/common/custom/bodycustfield.nl?customtype=${cType}`, 'plus_circle'));
                insertActions();
                items.push(createMenuItem(chrome.i18n.getMessage('recordOptionAddColumn'),
                    `/app/common/custom/columncustfield.nl?customtype=${cType}`, 'columns'));
            }
        }

        if (context.isStandardTransaction) {
            items.push(createMenuItem(chrome.i18n.getMessage('recordOptionAddField'),
                `/app/common/custom/bodycustfield.nl`, 'plus_circle'));
            insertActions();
            items.push(createMenuItem(chrome.i18n.getMessage('recordOptionAddColumn'),
                `/app/common/custom/columncustfield.nl`, 'columns'));
        }

        if (context.isEntity) {
            items.push(createMenuItem(chrome.i18n.getMessage('recordOptionAddField'),
                `/app/common/custom/entitycustfield.nl`, 'plus_circle'));
        }

        if (context.isItem) {
            items.push(createMenuItem(chrome.i18n.getMessage('recordOptionAddField'),
                `/app/common/custom/itemcustfield.nl`, 'plus_circle'));
        }

        if (_rtrailEnabled && context.id && (context.isStandardTransaction || context.isCustomTransaction)) {
            items.push(createActionMenuItem(chrome.i18n.getMessage('rt_button'), 'trail',
                `window.dispatchEvent(new CustomEvent('nsft-show-record-trail')); return false;`));
        }

        items.push(createActionMenuItem(chrome.i18n.getMessage('recordOptionCopyCleanUrl'), 'link',
            `window.dispatchEvent(new CustomEvent('nsft-roptions-copy-url')); return false;`));

        if (_envEnabled) {
            items.push(createActionMenuItem(chrome.i18n.getMessage('recordOptionOpenInEnv'), 'open_in_env',
                `window.dispatchEvent(new CustomEvent('nsft-show-env-picker', { detail: { x: event.clientX, y: event.clientY } })); return false;`));
        }

        const xmlUrl = window.location.href + (window.location.search ? '&' : '?') + 'xml=t';
        items.push(createMenuItem(chrome.i18n.getMessage('recordOptionViewXml'), xmlUrl, 'xml'));

        if (!_actionsInserted && recordActions.length) {
            items.unshift(...recordActions);
        }

        return items.join('');
    }

    function buildCleanUrl() {
        try {
            const url = new URL(window.location.href);
            ['cl', 'whence', 'twhence'].forEach((p) => url.searchParams.delete(p));
            return url.toString();
        } catch (e) {
            return window.location.href;
        }
    }

    function createMenuItem(label, url, iconKey = '') {
        const icon = iconKey && ICONS[iconKey] ? ICONS[iconKey] : '';
        const onclick = `window.open('${jsEsc(url)}','_blank',''); return false;`;
        return `
            <li class="ns-menuitem">
                <a href="javascript:void(0)" onclick="${attrEsc(onclick)}" class="ns-menuitem-link" style="display:flex; align-items:center; gap:8px;">
                    <span class="nsft-tools-icon" style="display:inline-flex; align-items:center; justify-content:center; width:16px; height:16px; flex:0 0 16px;">${icon}</span>
                    <span>${esc(label)}</span>
                </a>
            </li>
        `;
    }

    function createActionMenuItem(label, iconKey, onclickJs) {
        const icon = iconKey && ICONS[iconKey] ? ICONS[iconKey] : '';
        return `
            <li class="ns-menuitem">
                <a href="javascript:void(0)" onclick="${attrEsc(onclickJs)}" class="ns-menuitem-link" style="display:flex; align-items:center; gap:8px;">
                    <span class="nsft-tools-icon" style="display:inline-flex; align-items:center; justify-content:center; width:16px; height:16px; flex:0 0 16px;">${icon}</span>
                    <span>${esc(label)}</span>
                </a>
            </li>
        `;
    }

    function observeDomChanges() {
        if (_unsubscribe) return;
        const reinject = () => {
            if (!document.getElementById(MENU_ID)) addMenu();
        };
        if (window.NSFT_Observer && typeof window.NSFT_Observer.subscribe === 'function') {
            _unsubscribe = window.NSFT_Observer.subscribe(reinject, { throttle: 200 });
            return;
        }
        const observer = new MutationObserver(reinject);
        const target = (DOM && DOM.q(['.uir-buttons-top', '.uir-header-buttons', 'body'], { module: 'record_options_menu', purpose: 'observe target' }))
            || document.querySelector('.uir-buttons-top')
            || document.body;
        observer.observe(target, { childList: true, subtree: true });
        _unsubscribe = () => observer.disconnect();
    }
})();
