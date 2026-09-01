(function () {
    'use strict';

    function ensureSqlTransport() {
        if (window.NSFT_SuiteQLRest && window.NSFT_SuiteQLRest.ensureTransport) {
            window.NSFT_SuiteQLRest.ensureTransport();
        }
    }
    const STORAGE_KEY = 'enableCopyFieldAndSublistIds';
    const OPEN_REC_KEY = 'enableOpenCustomRecordBtn';
    const NO_BUTTON_KEY = 'copyIdsNoButton';
    const MODE_KEY = 'copyIdsMode';

    function resolveMode(items) {
        const m = items[MODE_KEY];
        if (m === 'icons' || m === 'shift' || m === 'always') return m;
        return items[NO_BUTTON_KEY] === false ? 'icons' : 'shift';
    }

    const FIELD_BTN_CLASS = 'nsft-copy-fs-id-field';
    const SUBLIST_BTN_CLASS = 'nsft-copy-fs-id-sublist';
    const OPEN_REC_BTN_CLASS = 'nsft-open-custrec-btn';
    const REC_TYPE_BTN_CLASS = 'nsft-copy-record-type';
    const ROW_ID_BTN_CLASS = 'nsft-copy-row-id';
    const ADD_FIELD_BTN_CLASS = 'nsft-add-custfield-btn';
    const MENU_CLASS = 'nsft-sublist-menu';
    const MENU_TRIGGER_CLASS = 'nsft-sublist-menu-trigger';
    const MENU_DROPDOWN_CLASS = 'nsft-sublist-menu-dropdown';
    const MENU_ITEM_CLASS = 'nsft-sublist-menu-item';
    const MENU_OPEN_CLASS = 'nsft-sublist-menu-open';
    const COPIED_CLASS = 'nsft-copy-fs-id-copied';
    const HEADER_SELECTOR = 'td[class*="listheader"] .listheader';
    const FIELD_SELECTOR = '[data-field-name]';
    const RESET_DELAY = 900;
    const RECMACH_PREFIX = 'recmach';
    const CUSTRECORD_LOOKUP_TIMEOUT = 4000;
    const ID_TAG_CLASS = 'nsft-copy-fs-idtag';
    const ID_TAG_TXT_CLASS = 'nsft-copy-fs-idtag-t';
    const PADRE_TAG_CLASS = 'nsft-copy-fs-conid';
    const ALL_BTN_SELECTOR = '.' + [FIELD_BTN_CLASS, SUBLIST_BTN_CLASS, OPEN_REC_BTN_CLASS, ADD_FIELD_BTN_CLASS, REC_TYPE_BTN_CLASS, ROW_ID_BTN_CLASS, ID_TAG_CLASS].join(', .');
    const esc = (window.NSFT_DOM && window.NSFT_DOM.escapeHtml)
        ? window.NSFT_DOM.escapeHtml
        : (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const _customRecordCache = new Map();
    const ID_COLUMN_LABELS = new Set([
        'id', 'script id', 'id de script', 'identificador',
        'id du script', 'identifiant',
        'skript-id', 'kennung',
        'id script', 'identificativo',
        'id do script', 'identificação'
    ]);

    let openCustomRecordEnabled = true;
    let _modo = 'shift';
    let _enabled = false;
    let _unsubObserver = null;
    let _delegatedBound = false;
    let _fetcherInjected = false;
    let _runScheduled = false;

    const RB = window.NSFT_RecordButtons;

    chrome.storage.local.get({
        [STORAGE_KEY]: true,
        [OPEN_REC_KEY]: true,
        [NO_BUTTON_KEY]: true,
        [MODE_KEY]: null
    }, (items) => {
        if (!items[STORAGE_KEY]) return;
        if (RB && RB.isExcludedPage && RB.isExcludedPage()) return;
        openCustomRecordEnabled = items[OPEN_REC_KEY] !== false;
        _modo = resolveMode(items);
        init();
    });

    chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== 'local') return;
        if (changes[STORAGE_KEY]) {
            const next = changes[STORAGE_KEY].newValue !== false;
            if (next && !_enabled) {
                if (!(RB && RB.isExcludedPage && RB.isExcludedPage())) init();
            } else if (!next && _enabled) {
                teardown();
            }
        }
        if (changes[OPEN_REC_KEY]) {
            openCustomRecordEnabled = changes[OPEN_REC_KEY].newValue !== false;
            document.querySelectorAll('.' + MENU_CLASS).forEach(el => el.remove());
            if (_enabled && openCustomRecordEnabled) runAll();
        }
        if (changes[MODE_KEY] || changes[NO_BUTTON_KEY]) {
            chrome.storage.local.get({ [NO_BUTTON_KEY]: true, [MODE_KEY]: null }, (it) => {
                const next = resolveMode(it);
                if (next === _modo) return;
                _modo = next;
                if (_enabled) { removeAllButtons(); runAll(); }
            });
        }
    });

    function init() {
        if (_enabled) return;
        _enabled = true;

        window.addEventListener('message', onFetcherMessage);

        if (!_delegatedBound) {
            document.addEventListener('click', onDelegatedClick, true);
            document.addEventListener('mouseover', onDelegatedHover, true);
            _delegatedBound = true;
        }

        if (!window.nsftRecordType && !_fetcherInjected) {
            _fetcherInjected = true;
            ensureSqlTransport();
            const script = document.createElement('script');
            script.async = false;
            script.src = chrome.runtime.getURL('scripts/modules/copy_field_sublist_id/copy_field_sublist_id_fetcher.js');
            script.onload = function () { this.remove(); };
            (document.head || document.documentElement).appendChild(script);
        }

        runAll();
        observeDomChanges();
    }

    function teardown() {
        _enabled = false;
        if (_unsubObserver) { try { _unsubObserver(); } catch (e) { } _unsubObserver = null; }
        window.removeEventListener('message', onFetcherMessage);
        if (_delegatedBound) { document.removeEventListener('click', onDelegatedClick, true); document.removeEventListener('mouseover', onDelegatedHover, true); _delegatedBound = false; }
        removeAllButtons();
    }

    function removeAllButtons() {
        document.querySelectorAll(ALL_BTN_SELECTOR).forEach(el => el.remove());
        document.querySelectorAll('.' + MENU_CLASS).forEach(el => el.remove());
        document.querySelectorAll('[data-copy-added]').forEach(w => { delete w.dataset.copyAdded; });
    }

    function onFetcherMessage(event) {
        if (event.source !== window) return;
        if (event.data && event.data.type === 'nsft-record-type-value') {
            window.nsftRecordType = event.data.recordType;
            runAll();
        }
        if (event.data && event.data.type === 'nsft-custom-record-id-result') {
            resolveCustomRecordLookup(event.data);
        }
    }

    const pendingCustomRecordLookups = new Map();

    function requestCustomRecordId(fieldScriptId) {
        const cached = _customRecordCache.get(fieldScriptId);
        if (cached) return Promise.resolve(cached);
        return new Promise((resolve, reject) => {
            const requestId = 'cr_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
            const timeoutId = setTimeout(() => {
                if (pendingCustomRecordLookups.has(requestId)) {
                    pendingCustomRecordLookups.delete(requestId);
                    reject(new Error('TIMEOUT'));
                }
            }, CUSTRECORD_LOOKUP_TIMEOUT);

            pendingCustomRecordLookups.set(requestId, { resolve, reject, timeoutId, fieldScriptId });
            window.postMessage({ type: 'nsft-request-custom-record-id', fieldScriptId, requestId }, '*');
        });
    }

    function resolveCustomRecordLookup(data) {
        const pending = pendingCustomRecordLookups.get(data.requestId);
        if (!pending) return;
        pendingCustomRecordLookups.delete(data.requestId);
        clearTimeout(pending.timeoutId);
        if (data.error) { pending.reject(new Error(data.error)); return; }
        const result = { recordType: data.recordType, recordName: data.recordName || '' };
        if (pending.fieldScriptId) _customRecordCache.set(pending.fieldScriptId, result);
        pending.resolve(result);
    }

    let _labelMap = null;

    function runAll() {
        _labelMap = null;
        addFieldButtons();
        addSublistButtons();
        addRecordTypeButton();
        addRowIdButtons();
    }

    function getLabelMap() {
        if (_labelMap) return _labelMap;
        _labelMap = new Map();
        document.querySelectorAll('.uir-field-wrapper').forEach((w) => {
            const lbl = (w.dataset.nspsLabel || '').trim();
            if (lbl && !_labelMap.has(lbl) && w.dataset.fieldName) _labelMap.set(lbl, w.dataset.fieldName);
        });
        return _labelMap;
    }

    const COPY_ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="feather feather-copy"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>`;
    const CHECK_ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="feather feather-check"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
    const EXTERNAL_ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>`;
    const PLUS_ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>`;
    const MENU_ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="21" x2="4" y2="14"></line><line x1="4" y1="10" x2="4" y2="3"></line><line x1="12" y1="21" x2="12" y2="12"></line><line x1="12" y1="8" x2="12" y2="3"></line><line x1="20" y1="21" x2="20" y2="16"></line><line x1="20" y1="12" x2="20" y2="3"></line><line x1="1" y1="14" x2="7" y2="14"></line><line x1="9" y1="8" x2="15" y2="8"></line><line x1="17" y1="16" x2="23" y2="16"></line></svg>`;
    const CHEVRON_ICON_SVG = `<svg class="nsft-sublist-chevron" xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>`;
    const SPINNER_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-6.219-8.56"><animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur="0.8s" repeatCount="indefinite"/></path></svg>`;

    function tooltipHint(fieldId) {
        const click = chrome.i18n.getMessage('cfsi_hint_click') || 'Click: copy ID';
        return `${fieldId}\n\n${click}`;
    }

    function addRowIdButtons() {
        document.querySelectorAll('table[id$="_splits"]').forEach(table => {
            const headerRow = table.querySelector('tr.uir-machine-headerrow');
            if (!headerRow) return;

            const headerCells = [...headerRow.children];
            const idColIdx = headerCells.findIndex(td => {
                const label = (td.getAttribute('data-label') || '').trim().toLowerCase();
                return ID_COLUMN_LABELS.has(label);
            });
            if (idColIdx === -1) return;

            table.querySelectorAll('tbody tr.uir-list-row-tr').forEach(row => {
                const cell = row.children[idColIdx];
                if (!cell || cell.querySelector(`.${ROW_ID_BTN_CLASS}`)) return;
                const scriptId = cell.textContent.trim();
                if (!scriptId) return;
                const btn = createButton({
                    className: `${FIELD_BTN_CLASS} ${ROW_ID_BTN_CLASS}`,
                    html: COPY_ICON_SVG,
                    title: tooltipHint(scriptId),
                    cfg: { kind: 'copy', value: scriptId, baseHtml: COPY_ICON_SVG, copiedHtml: CHECK_ICON_SVG }
                });
                cell.appendChild(btn);
            });
        });
    }

    function addRecordTypeButton() {
        if (!window.nsftRecordType) return;

        const DOM = window.NSFT_DOM;
        const h1 = DOM
            ? DOM.q(['h1.uir-record-type', 'h1[class*="record-type"]', '#pagetitle h1', 'div.uir-page-title h1'], { module: 'copy_field_sublist_id', purpose: 'record-type h1' })
            : document.querySelector('h1.uir-record-type');
        if (!h1) return;
        if (h1.nextElementSibling?.classList?.contains(REC_TYPE_BTN_CLASS)) return;

        const recType = window.nsftRecordType;
        const btn = createButton({
            className: REC_TYPE_BTN_CLASS,
            html: COPY_ICON_SVG,
            title: tooltipHint(recType),
            cfg: { kind: 'copy', value: recType, baseHtml: COPY_ICON_SVG, copiedHtml: CHECK_ICON_SVG }
        });

        if (h1.nextSibling) h1.parentNode.insertBefore(btn, h1.nextSibling);
        else h1.parentNode.appendChild(btn);
    }

    function addFieldButtons() {
        const DOM = window.NSFT_DOM;
        const headers = DOM
            ? DOM.qAll([HEADER_SELECTOR, 'td[class*="listheader"] > div', '.listheader'], { module: 'copy_field_sublist_id', purpose: 'list headers' })
            : document.querySelectorAll(HEADER_SELECTOR);
        headers.forEach(header => {
            if (header.querySelector(`.${FIELD_BTN_CLASS}`)) return;
            if (header.querySelector('.' + ID_TAG_CLASS)) return;
            const fieldId = findFieldNameByHeader(header);
            if (!fieldId) return;
            if (_modo === 'always') {
                const tag = tagId(fieldId, 'is-col');
                marcaPadre(header);
                header.appendChild(tag);
                return;
            }
            const btn = createButton({
                className: FIELD_BTN_CLASS,
                html: COPY_ICON_SVG,
                title: tooltipHint(fieldId),
                cfg: { kind: 'copy', value: fieldId, baseHtml: COPY_ICON_SVG, copiedHtml: CHECK_ICON_SVG }
            });
            header.insertBefore(btn, header.firstChild);
        });

        const wrappers = DOM
            ? DOM.qAll(['.uir-field-wrapper', '[data-field-name][data-nsps-label]'], { module: 'copy_field_sublist_id', purpose: 'field wrappers' })
            : document.querySelectorAll('.uir-field-wrapper');
        const pendientes = [];
        wrappers.forEach(wrapper => {
            if (wrapper.dataset.copyAdded) return;
            const enSublista = !!wrapper.closest('[data-nsps-layer^="recmach"]');
            if (_modo !== 'icons' && !enSublista) {
                if (_modo === 'shift') return;
                const fid = wrapper.dataset.fieldName;
                const lbl = wrapper.querySelector('.uir-label-span');
                if (!fid || !lbl || wrapper.querySelector('.' + ID_TAG_CLASS)) return;
                const cajaLbl = lbl.closest('.uir-label') || lbl.parentElement || lbl;
                pendientes.push({ wrapper, fid, cajaLbl });
                return;
            }
            const fieldId = wrapper.dataset.fieldName;
            const label = wrapper.querySelector('.uir-label-span');
            if (!fieldId || !label) return;
            const btn = createButton({
                className: FIELD_BTN_CLASS,
                html: COPY_ICON_SVG,
                title: tooltipHint(fieldId),
                cfg: { kind: 'copy', value: fieldId, baseHtml: COPY_ICON_SVG, copiedHtml: CHECK_ICON_SVG }
            });
            label.appendChild(btn);
            wrapper.dataset.copyAdded = 'true';
        });

        if (pendientes.length) colocaEtiquetas(pendientes);
    }

    function colocaEtiquetas(lista) {
        lista.forEach((p) => { p.enFila = filaDeDosColumnas(p.wrapper, p.cajaLbl); });

        lista.forEach((p) => {
            const tag = tagId(p.fid, p.enFila ? 'is-fila' : '');
            if (p.enFila) {
                marcaPadre(p.cajaLbl);
                p.cajaLbl.appendChild(tag);
            } else {
                marcaPadre(p.cajaLbl.parentElement);
                p.cajaLbl.insertAdjacentElement('afterend', tag);
            }
            p.wrapper.dataset.copyAdded = 'true';
        });
    }

    function filaDeDosColumnas(wrapper, cajaLbl) {
        const valor = wrapper.lastElementChild;
        if (!valor || valor === cajaLbl || cajaLbl.contains(valor)) return false;
        const a = cajaLbl.getBoundingClientRect();
        const b = valor.getBoundingClientRect();
        if (!a.height || !b.height) return false;
        const comun = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
        return comun > a.height / 2;
    }

    function addSublistButtons() {
        document.querySelectorAll('div[id$="_layer"][data-nsps-layer]').forEach(div => {
            const layer = div.dataset.nspsLayer;
            if (!layer) return;

            if (!div.querySelector(`.${SUBLIST_BTN_CLASS}[data-layer="${layer}"]`)) {
                const baseText = chrome.i18n.getMessage("copySublistId");
                const baseHtml = COPY_ICON_SVG + '<span>' + baseText + '</span>';
                const copiedHtml = CHECK_ICON_SVG + '<span>' + chrome.i18n.getMessage("copiedSublist") + '</span>';
                const btn = createButton({
                    className: SUBLIST_BTN_CLASS,
                    html: baseHtml,
                    title: tooltipHint(layer),
                    cfg: { kind: 'copy', value: layer, baseHtml, copiedHtml }
                });
                btn.dataset.layer = layer;
                div.insertBefore(btn, div.firstChild);
            }

            if (openCustomRecordEnabled && layer.toLowerCase().startsWith(RECMACH_PREFIX)) {
                if (!div.querySelector(`.${MENU_CLASS}[data-layer="${layer}"]`)) {
                    const fieldScriptId = layer.slice(RECMACH_PREFIX.length);
                    const copyBtn = div.querySelector(`.${SUBLIST_BTN_CLASS}[data-layer="${layer}"]`);
                    const menu = buildSublistMenu(layer, fieldScriptId);
                    insertAfter(div, menu, copyBtn);
                }
            }
        });
    }

    function buildSublistMenu(layer, fieldScriptId) {
        const menu = document.createElement('span');
        menu.className = MENU_CLASS;
        menu.dataset.layer = layer;

        const menuTitle = chrome.i18n.getMessage('recordOptionsTitle') || 'Opciones';
        const trigger = createButton({
            className: MENU_TRIGGER_CLASS,
            html: MENU_ICON_SVG + '<span>' + menuTitle + '</span>' + CHEVRON_ICON_SVG,
            title: menuTitle + '\n\n' + fieldScriptId,
            cfg: { kind: 'menu', fieldScriptId }
        });

        const dropdown = document.createElement('div');
        dropdown.className = MENU_DROPDOWN_CLASS;

        const openLabel = chrome.i18n.getMessage('openCustomRecordBtn') || 'Abrir Registro';
        const openTitle = chrome.i18n.getMessage('openCustomRecordTooltip') || 'Abrir definicion del Registro Personalizado';
        const openItem = createButton({
            className: OPEN_REC_BTN_CLASS + ' ' + MENU_ITEM_CLASS,
            html: EXTERNAL_ICON_SVG + '<span>' + openLabel + '</span>',
            title: openTitle + '\n\n' + fieldScriptId,
            cfg: { kind: 'open', fieldScriptId, label: openLabel }
        });
        openItem.dataset.layer = layer;

        const addLabel = chrome.i18n.getMessage('addCustomFieldBtn') || 'Agregar campo';
        const addTitle = chrome.i18n.getMessage('addCustomFieldTooltip') || 'Agregar un campo al Registro Personalizado';
        const addItem = createButton({
            className: ADD_FIELD_BTN_CLASS + ' ' + MENU_ITEM_CLASS,
            html: PLUS_ICON_SVG + '<span>' + addLabel + '</span>',
            title: addTitle + '\n\n' + fieldScriptId,
            cfg: { kind: 'addfield', fieldScriptId, label: addLabel }
        });
        addItem.dataset.layer = layer;

        dropdown.appendChild(openItem);
        dropdown.appendChild(addItem);
        menu.appendChild(trigger);
        menu.appendChild(dropdown);
        return menu;
    }

    function closeAllMenus() {
        document.querySelectorAll('.' + MENU_CLASS + '.' + MENU_OPEN_CLASS)
            .forEach(m => m.classList.remove(MENU_OPEN_CLASS));
    }

    function insertAfter(div, node, ref) {
        if (ref && ref.nextSibling) ref.parentNode.insertBefore(node, ref.nextSibling);
        else if (ref) ref.parentNode.appendChild(node);
        else div.insertBefore(node, div.firstChild);
    }

    function mapCustomRecordError(err) {
        const code = err && err.message;
        if (code === 'NOT_FOUND') return chrome.i18n.getMessage('openCustomRecordNotFound') || 'No encontrado';
        if (code === 'PERMISSION') return chrome.i18n.getMessage('openCustomRecordPermission') || 'Sin permiso';
        if (code === 'TIMEOUT') return chrome.i18n.getMessage('openCustomRecordTimeout') || 'Tardó demasiado';
        return chrome.i18n.getMessage('openCustomRecordError') || 'Error';
    }

    function runCustomRecordAction(btn, fieldScriptId, iconSvg, pristineLabel, urlFor) {
        const pristine = iconSvg + '<span>' + pristineLabel + '</span>';
        btn.innerHTML = SPINNER_SVG + '<span>' + (chrome.i18n.getMessage('openCustomRecordLoading') || 'Abriendo…') + '</span>';
        btn.classList.add(COPIED_CLASS);

        requestCustomRecordId(fieldScriptId)
            .then((result) => {
                window.open(urlFor(result.recordType), '_blank', 'noopener');
                btn.innerHTML = pristine;
                btn.classList.remove(COPIED_CLASS);
            })
            .catch((err) => {
                const retry = chrome.i18n.getMessage('openCustomRecordRetry') || 'Reintentar';
                btn.classList.remove(COPIED_CLASS);
                btn.innerHTML = iconSvg + '<span>' + mapCustomRecordError(err) + ' · ' + retry + '</span>';
                console.warn('NSFT: custom record action failed', err);
            });
    }

    function handleOpenCustomRecord(btn, fieldScriptId, originalLabel) {
        runCustomRecordAction(btn, fieldScriptId, EXTERNAL_ICON_SVG, originalLabel,
            (recordType) => '/app/common/custom/custrecord.nl?id=' + encodeURIComponent(recordType) + '&e=T');
    }

    function handleAddCustomField(btn, fieldScriptId, originalLabel) {
        runCustomRecordAction(btn, fieldScriptId, PLUS_ICON_SVG, originalLabel,
            (recordType) => '/app/common/custom/custreccustfield.nl?rectype=' + encodeURIComponent(recordType));
    }

    function onDelegatedHover(e) {
        const btn = e.target.closest && e.target.closest('.' + OPEN_REC_BTN_CLASS + ', .' + ADD_FIELD_BTN_CLASS + ', .' + MENU_TRIGGER_CLASS);
        if (!btn || btn.dataset.nsftPrefetched === '1') return;
        const cfg = _btnCfg.get(btn);
        if (!cfg || !cfg.fieldScriptId) return;
        btn.dataset.nsftPrefetched = '1';
        requestCustomRecordId(cfg.fieldScriptId)
            .then((result) => {
                if (cfg.kind === 'open' && result && result.recordName) {
                    const named = chrome.i18n.getMessage('openCustomRecordOpenName', [result.recordName]) || ('Abrir: ' + result.recordName);
                    btn.title = named + '\n\n' + cfg.fieldScriptId;
                }
            })
            .catch(() => { btn.dataset.nsftPrefetched = ''; });
    }

    const _btnCfg = new WeakMap();

    function tagId(fieldId, extra) {
        const copiado = chrome.i18n.getMessage('cfsi_copied') || 'Copiado';
        const caja = (t) => '<span class="' + ID_TAG_TXT_CLASS + '">' + esc(t) + '</span>';
        return createButton({
            className: ID_TAG_CLASS + (extra ? ' ' + extra : ''),
            html: caja(fieldId),
            title: tooltipHint(fieldId),
            cfg: { kind: 'copy', value: fieldId, baseHtml: caja(fieldId), copiedHtml: caja(copiado) }
        });
    }

    function marcaPadre(el) {
        if (el) el.classList.add(PADRE_TAG_CLASS);
    }

    function createButton({ className, html, title, cfg }) {
        const btn = document.createElement('span');
        btn.className = className;
        if (html) btn.innerHTML = html;
        btn.title = title;
        if (cfg) _btnCfg.set(btn, cfg);
        return btn;
    }

    function onDelegatedClick(e) {
        const closest = (sel) => (e.target.closest ? e.target.closest(sel) : null);

        const trigger = closest('.' + MENU_TRIGGER_CLASS);
        if (trigger) {
            e.stopPropagation();
            e.preventDefault();
            const menu = trigger.closest('.' + MENU_CLASS);
            const willOpen = menu && !menu.classList.contains(MENU_OPEN_CLASS);
            closeAllMenus();
            if (willOpen) menu.classList.add(MENU_OPEN_CLASS);
            return;
        }

        if (!closest('.' + MENU_CLASS)) closeAllMenus();

        const btn = closest(ALL_BTN_SELECTOR);
        if (!btn) return;
        const cfg = _btnCfg.get(btn);
        if (!cfg) return;
        if ((e.ctrlKey || e.metaKey || e.altKey)
            && (btn.classList.contains(FIELD_BTN_CLASS)
                || btn.classList.contains(SUBLIST_BTN_CLASS)
                || btn.classList.contains(REC_TYPE_BTN_CLASS))) return;
        e.stopPropagation();
        e.preventDefault();
        if (cfg.kind === 'open') handleOpenCustomRecord(btn, cfg.fieldScriptId, cfg.label);
        else if (cfg.kind === 'addfield') handleAddCustomField(btn, cfg.fieldScriptId, cfg.label);
        else handleCopy(btn, cfg.value, cfg.baseHtml, cfg.copiedHtml);
    }

    function handleCopy(btn, value, baseHtml, copiedHtml) {
        if (window.NSFT_Clipboard) window.NSFT_Clipboard.copy(value);
        else if (navigator.clipboard?.writeText) navigator.clipboard.writeText(value);

        btn.innerHTML = copiedHtml || CHECK_ICON_SVG;
        btn.classList.add(COPIED_CLASS);
        setTimeout(() => {
            btn.innerHTML = baseHtml || COPY_ICON_SVG;
            btn.classList.remove(COPIED_CLASS);
        }, RESET_DELAY);
    }

    function findFieldNameByHeader(header) {
        const td = header.closest('td[data-nsps-label], td[data-label]');
        const labelText = ((td && (td.getAttribute('data-nsps-label') || td.getAttribute('data-label'))) || header.textContent || '').trim();
        if (!labelText) return null;

        const splitsTable = header.closest('table[id$="_splits"]');
        if (splitsTable) {
            const form = document.getElementById(splitsTable.id.replace(/_splits$/, '_form'));
            const field = form && [...form.querySelectorAll(FIELD_SELECTOR)]
                .find(f => (f.getAttribute('data-nsps-label') || '').trim() === labelText);
            if (field) return field.getAttribute('data-field-name');
        }

        return getLabelMap().get(labelText) || null;
    }

    function observeDomChanges() {
        if (_unsubObserver) return;
        if (window.NSFT_Observer && typeof window.NSFT_Observer.subscribe === 'function') {
            _unsubObserver = window.NSFT_Observer.subscribe(() => { runAll(); }, { throttle: 200 });
        } else {
            const observer = new MutationObserver(() => {
                if (_runScheduled) return;
                _runScheduled = true;
                setTimeout(() => { _runScheduled = false; runAll(); }, 200);
            });
            observer.observe(document.body, { childList: true, subtree: true });
            _unsubObserver = () => observer.disconnect();
        }
    }
})();
