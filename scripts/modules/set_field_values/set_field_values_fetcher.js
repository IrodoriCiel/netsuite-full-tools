
(function () {
    'use strict';

    function sfvDiagOn() {
        try {
            return !!(document.documentElement && document.documentElement.dataset.nsftSfvDiag);
        } catch (e) {
            return false;
        }
    }

    function sfvDiag() {
        if (!sfvDiagOn()) return;
        try { console.log.apply(console, arguments); } catch (e) { }
    }

    function sfvDiagWarn() {
        if (!sfvDiagOn()) return;
        try { console.warn.apply(console, arguments); } catch (e) { }
    }

    if (window.nsftSetFieldValuesInjected) return;
    window.nsftSetFieldValuesInjected = true;

    let translations = {};
    let auditEnabled = true;
    let noIconMode = true;
    let moduleEnabled = true;

    function escapeHtml(v) {
        if (v === null || v === undefined) return '';
        return String(v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    }
    function escapeJsString(v) {
        if (v === null || v === undefined) return '';
        return String(v).replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '\\"').replace(/</g, '\\u003c');
    }

    let isInit = false;

    const NSFT = {
        MODAL: "nsft-sfv-modal",
        HEADER: "nsft-sfv-header",
        TITLE: "nsft-sfv-title-text",
        CONTENT: "nsft-sfv-content",
        CLOSE_BTN: "nsft-sfv-close",
        MAX_BTN: "nsft-sfv-maximise",
        CFG_BTN: "nsft-sfv-settings",
        GLOBAL_STYLES: "nsft-global-styles",
        EDIT_ROW: "nsft-edit-custom-field-row",
        EDIT_BTN: "nsft-edit-custom-field-btn",
        CUSTOM_FIELDS_CONTAINER: "nsft-div-custom-fields",
        AUDIT_LIST: "nsft-field-audit-list",
        HELP_SLOT: "nsft-sfv-help-slot",
        TABS: "nsft-sfv-tabs",
        LIST_SLOT: "nsft-sfv-list-slot",
        LIST_SEARCH: "nsft-sfv-list-search",
        LIST_BODY: "nsft-sfv-list-body",
        LIST_FOOT: "nsft-sfv-list-foot",
        LIST_COUNT: "nsft-sfv-list-count",
        LIST_BAR: "nsft-sfv-list-bar",
        LIST_CLEAR: "nsft-sfv-list-clear",
        LIST_GO: "nsft-sfv-list-go",
        VALUE_SLOT: "nsft-sfv-value-slot",
        TEXT_ROW: "nsft-sfv-text-row",
        TEXT_SLOT: "nsft-sfv-text-slot",
        TYPE_SLOT: "nsft-sfv-type-slot",
        SOURCE_ROW: "nsft-sfv-source-row",
        SOURCE_SLOT: "nsft-sfv-source-slot",
        DISPLAY_SLOT: "nsft-sfv-display-slot"
    };

    let NSFT_THEME = 'light';

    let helpCollapsed = false;

    let metaCollapsed = true;

    let activeTab = 'valor';

    let histAutoPedido = null;

    let altoDeValor = 0;

    const ALTO_MINIMO = 540;

    let secciones = {};
    function ver(clave) { return secciones[clave] !== false; }

    let bypassLabelClick = false;

    let _lastHelpTrigger = null;

    window.addEventListener('message', function (event) {
        if (event.source !== window || !event.data) return;
        if (event.data.type === 'nsft-set-field-values-init' && event.data.translations) {
            translations = { ...translations, ...event.data.translations };
            if (event.data.theme) NSFT_THEME = event.data.theme;
            if (typeof event.data.auditEnabled === 'boolean') auditEnabled = event.data.auditEnabled;
            if (typeof event.data.noIcon === 'boolean') noIconMode = event.data.noIcon;
            if (typeof event.data.helpCollapsed === 'boolean') helpCollapsed = event.data.helpCollapsed;
            if (typeof event.data.metaCollapsed === 'boolean') metaCollapsed = event.data.metaCollapsed;
            if (event.data.secciones) secciones = event.data.secciones;
            if (event.data.helpTemplates && typeof event.data.helpTemplates === 'object') {
                Object.assign(helpTemplates, event.data.helpTemplates);
            }
            applyThemeToOpenModal();
            if (!isInit) init();
        } else if (event.data.type === 'nsft-set-field-values-theme') {
            NSFT_THEME = event.data.theme || 'light';
            applyThemeToOpenModal();
        } else if (event.data.type === 'nsft-set-field-values-enabled') {
            applyEnabledChange(event.data.enabled !== false);
        } else if (event.data.type === 'nsft-set-field-values-noicon') {
            applyNoIconChange(event.data.noIcon !== false);
        } else if (event.data.type === 'nsft-set-field-values-helpcollapsed') {
            helpCollapsed = event.data.collapsed === true;
            const box = document.querySelector('.nsft-sfv-help');
            if (box) box.dataset.collapsed = helpCollapsed ? '1' : '0';
        } else if (event.data.type === 'nsft-set-field-values-sections') {
            secciones = event.data.secciones || {};
            if (window.NSFT_SetFieldValues && window.NSFT_SetFieldValues.refreshAfterAuditToggle) {
                window.NSFT_SetFieldValues.refreshAfterAuditToggle();
            }
        } else if (event.data.type === 'nsft-set-field-values-metacollapsed') {
            metaCollapsed = event.data.collapsed !== false;
            const meta = document.querySelector('.nsft-sfv-meta');
            if (meta) meta.dataset.collapsed = metaCollapsed ? '1' : '0';
        } else if (event.data.type === 'nsft-set-field-values-audit') {
            auditEnabled = event.data.auditEnabled !== false;
            if (window.NSFT_SetFieldValues && window.NSFT_SetFieldValues.refreshAfterAuditToggle) {
                window.NSFT_SetFieldValues.refreshAfterAuditToggle();
            }
        }
    });

    function applyThemeToOpenModal() {
        const m = document.getElementById('nsft-sfv-modal');
        if (m) m.setAttribute('data-theme', NSFT_THEME);
    }



    function init() {
        if (isInit) return;
        isInit = true;

        try {
            startButtonInjection();
        } catch (err) {
            console.error("NSFT SetFieldValues Init Error: ", err);
        }

        try {
            document.addEventListener('click', function (e) {
                const el = (e.target && e.target.closest) ? e.target.closest('[onclick*="nlFieldHelp"]') : null;
                if (el) watchForHelpUrl();
            }, true);
        } catch (e) { }
    }

    function startButtonInjection() {
        runAll();
        observeDomChanges();
    }

    function runAll() {
        if (!moduleEnabled) return;
        document.querySelectorAll('.uir-field-wrapper').forEach(wrapper => {
            if (wrapper.dataset.nsftInfoAdded) return;

            let fieldId = wrapper.dataset.fieldName;
            const label = wrapper.querySelector('.uir-label-span');

            if (label) {
                if (!fieldId) {
                    if (label.id && label.id.endsWith('_lbl')) {
                        fieldId = label.id.replace(/(?:_fs)?_lbl$/, '');
                    }
                }

                if (isValidFieldId(fieldId)) {
                    injectButton(label, fieldId);
                    wrapper.dataset.nsftInfoAdded = 'true';
                    label.dataset.nsftInfoAdded = 'true';
                }
            }
        });

        document.querySelectorAll('.uir-machine-focused-cell').forEach(cell => {
            ensureCellContentPadded(cell);

            const existing = cell.querySelectorAll('.nsft-sfv-line-widget');
            if (existing.length > 0) {
                for (let i = 1; i < existing.length; i++) existing[i].remove();
                return;
            }

            const fsSpan = cell.querySelector('[id$="_fs"]');
            if (!fsSpan) return;

            const sublistId = resolveSublistIdFromCell(cell);
            if (!sublistId) return;

            let fieldId = fsSpan.id || '';
            if (fieldId.startsWith(sublistId + '_')) fieldId = fieldId.slice(sublistId.length + 1);
            fieldId = fieldId.replace(/_fs$/, '');

            if (isValidFieldId(fieldId)) {
                injectButton(fsSpan, fieldId, sublistId);
                rememberSublistColumn(sublistId, cell, fieldId);
            }
        });

        document.querySelectorAll('tr.uir-machine-row-focused td.uir-disabled, tr.listfocusedrow td.uir-disabled').forEach(cell => {
            ensureCellContentPadded(cell);
            if (cell.querySelector('.nsft-sfv-line-widget')) return;

            const sublistId = resolveSublistIdFromCell(cell);
            if (!sublistId) return;

            const fieldId = resolveSublistCellFieldId(sublistId, cell);
            if (!fieldId || !isValidFieldId(fieldId)) return;

            injectLineItemButtonOnCell(cell, fieldId, sublistId);
        });

        document.querySelectorAll('.uir-label-span:not([data-nsft-info-added="true"])').forEach(label => {
            if (label.closest('.uir-field-wrapper')) return;

            let fieldId = "";

            if (label.id && label.id.endsWith('_lbl')) {
                fieldId = label.id.replace('_fs_lbl', '').replace('_lbl', '');
            }

            if (!fieldId) {
                const anchor = label.querySelector('a');
                if (anchor) {
                    const onclickStr = anchor.getAttribute("onclick") || "";
                    if (onclickStr.includes("nlFieldHelp")) {
                        const parts = onclickStr.split("'");
                        if (parts.length >= 4) fieldId = parts[3];
                    }
                    if (!fieldId && anchor.title && !anchor.title.includes(" ")) fieldId = anchor.title;
                }
            }

            if (!fieldId) {
                const customSpan = label.querySelector(".nsft-copy-fs-id-field");
                if (customSpan && customSpan.title) fieldId = customSpan.title;
            }

            if (isValidFieldId(fieldId)) {
                injectButton(label, fieldId);
                label.dataset.nsftInfoAdded = 'true';
            }
        });
    }

    function isValidFieldId(fieldId) {
        return fieldId && fieldId.match(/^[a-z0-9_]+$/i);
    }

    const sublistColumnCache = {};

    function cellColumnIndex(cell) {
        const row = cell.parentElement;
        if (!row) return -1;
        return Array.prototype.indexOf.call(row.children, cell);
    }

    function rememberSublistColumn(sublistId, cell, fieldId) {
        if (!sublistId || !fieldId) return;
        const idx = cellColumnIndex(cell);
        if (idx < 0) return;
        if (!sublistColumnCache[sublistId]) sublistColumnCache[sublistId] = {};
        sublistColumnCache[sublistId][idx] = fieldId;
    }

    function lookupSublistColumn(sublistId, cell) {
        const map = sublistColumnCache[sublistId];
        if (!map) return null;
        const idx = cellColumnIndex(cell);
        if (idx < 0) return null;
        return map[idx] || null;
    }

    function findSublistCellForField(sublistId, linenum, fieldName) {
        if (!sublistId || !fieldName) return null;

        let row = null;
        if (linenum != null) row = document.getElementById(sublistId + '_row_' + linenum);
        if (!row) {
            row = document.querySelector(`tr.listfocusedrow[id^="${sublistId}_row_"], tr.uir-machine-row-focused[id^="${sublistId}_row_"]`);
        }
        if (!row) return null;

        const map = sublistColumnCache[sublistId];
        if (map) {
            for (const idx in map) {
                if (map[idx] === fieldName) {
                    const td = row.children[idx];
                    if (td) return td;
                }
            }
        }

        const form = document.getElementById(sublistId + '_form');
        let label = '';
        if (form) {
            const candidate = form.querySelector(`[data-field-name="${CSS.escape(fieldName)}"][data-nsps-label]`);
            if (candidate) label = (candidate.getAttribute('data-nsps-label') || '').trim();
        }
        if (label) {
            for (const td of row.children) {
                const t = (td.getAttribute && td.getAttribute('data-ns-tooltip') || '').trim();
                if (t === label) return td;
            }
        }
        return null;
    }

    function readLineItemDisabledFromDom(sublistId, linenum, fieldName) {
        const td = findSublistCellForField(sublistId, linenum, fieldName);
        if (!td) return false;
        if (td.classList.contains('uir-disabled')) return true;
        return !!td.querySelector('.listinlinefocusedrowcellnoedit');
    }

    function syncSublistCellDisabledDom(sublistId, linenum, fieldName, isDisabled) {
        const targetCell = findSublistCellForField(sublistId, linenum, fieldName);
        if (!targetCell) return;

        if (isDisabled) {
            targetCell.classList.add('uir-disabled');
            const inner = targetCell.querySelector('.listinlinefocusedrowcell');
            if (inner) inner.className = 'listinlinefocusedrowcellnoedit';
        } else {
            targetCell.classList.remove('uir-disabled');
            const inner = targetCell.querySelector('.listinlinefocusedrowcellnoedit');
            if (inner) inner.className = 'listinlinefocusedrowcell';
        }
    }

    function resolveSublistIdFromCell(cell) {
        const row = cell.closest('tr[id*="_row_"]');
        if (row) {
            const m = (row.id || '').match(/^(.+)_row_\d+$/);
            if (m) return m[1];
        }
        const table = cell.closest('table[data-nsps-id], table[id$="_splits"]');
        if (table) {
            const nsid = table.getAttribute('data-nsps-id');
            if (nsid) return nsid;
            const idMatch = (table.id || '').match(/^(.+)_splits$/);
            if (idMatch) return idMatch[1];
        }
        return null;
    }

    function resolveSublistCellFieldId(sublistId, cell) {
        const cached = lookupSublistColumn(sublistId, cell);
        if (cached) return cached;

        const label = (cell.getAttribute('data-ns-tooltip') || '').trim();
        if (!label) return null;

        const form = document.getElementById(sublistId + '_form');
        if (form) {
            const candidates = form.querySelectorAll('[data-field-name][data-nsps-label]');
            for (const candidate of candidates) {
                const cLabel = (candidate.getAttribute('data-nsps-label') || '').trim();
                if (cLabel === label) {
                    const fid = candidate.getAttribute('data-field-name');
                    if (fid) {
                        rememberSublistColumn(sublistId, cell, fid);
                        return fid;
                    }
                }
            }
        }

        const wrappers = document.querySelectorAll('.uir-field-wrapper[data-nsps-label]');
        for (const wrapper of wrappers) {
            const wLabel = (wrapper.dataset.nspsLabel || '').trim();
            if (wLabel === label) {
                const fid = wrapper.dataset.fieldName;
                if (fid) {
                    rememberSublistColumn(sublistId, cell, fid);
                    return fid;
                }
            }
        }

        return null;
    }

    function observeDomChanges() {
        const observer = new MutationObserver((mutations) => {
            runAll();
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true
        });
    }

    function injectButton(span, fieldName, sublistId) {
        if (sublistId) {
            injectLineItemButton(span, fieldName, sublistId);
            return;
        }

        attachLabelClick(span, fieldName);
        if (noIconMode) return;

        const btn = document.createElement("span");
        btn.className = "nsft-info-icon";

        btn.style.cursor = "pointer";
        btn.style.display = "inline-flex";
        btn.style.alignItems = "center";
        btn.style.justifyContent = "center";
        btn.style.position = "relative";
        btn.style.marginLeft = "3px";

        btn.innerHTML = `
            <span style="position:absolute; top:-10px; bottom:0px; left:0px; right:-15px; z-index:10; cursor:pointer;" title="Info"></span>
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" style="width:16px;height:16px;"><path stroke-linecap="round" stroke-linejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" /></svg>
        `;

        btn.title = 'Info';
        btn.onclick = function (e) {
            e.preventDefault();
            e.stopPropagation();
            window.NSFT_SetFieldValues.showInfoPopup(fieldName, btn, null);
        };

        span.appendChild(btn);
    }

    function attachLabelClick(label, fieldName) {
        if (!label) return;
        if (label.dataset.nsftLabelClickBound !== '1') {
            label.dataset.nsftLabelClickBound = '1';
            label.addEventListener('click', function (e) {
                if (!moduleEnabled || !noIconMode || bypassLabelClick) return;
                e.preventDefault();
                e.stopPropagation();
                window.NSFT_SetFieldValues.showInfoPopup(fieldName, label, null);
            }, true);
        }
        label.style.cursor = noIconMode ? 'pointer' : '';
    }


    function helpAnchorArgs(anchor) {
        const oc = (anchor && anchor.getAttribute('onclick')) || '';
        return (oc.match(/(['"])(?:\\.|(?!\1)[^\\])*\1/g) || [])
            .map(s => s.slice(1, -1).replace(/\\(['"])/g, '$1').trim());
    }

    function findHelpAnchor(fieldName) {
        if (!fieldName) return null;

        const lbl = document.getElementById(fieldName + '_fs_lbl')
            || document.getElementById(fieldName + '_lbl')
            || document.querySelector(`[id^="${fieldName}_fs_lbl"], [id^="${fieldName}_lbl"]`);
        const direct = lbl && lbl.querySelector('[onclick*="nlFieldHelp"]');
        if (direct) return direct;

        if (_lastHelpTrigger) {
            try {
                if ((_lastHelpTrigger.getAttribute('onclick') || '').indexOf('nlFieldHelp') !== -1) {
                    return _lastHelpTrigger;
                }
                const scope = _lastHelpTrigger.closest('.uir-label, .uir-label-span, td, th')
                    || _lastHelpTrigger.parentElement;
                const near = scope && scope.querySelector('[onclick*="nlFieldHelp"]');
                if (near) return near;
            } catch (e) { }
        }

        const target = String(fieldName).toLowerCase();
        const all = document.querySelectorAll('[onclick*="nlFieldHelp"]');
        for (let i = 0; i < all.length; i++) {
            const args = helpAnchorArgs(all[i]);
            for (let j = 0; j < args.length; j++) {
                if (args[j].toLowerCase() === target) return all[i];
            }
        }
        return null;
    }

    function looksLikeHelp(value, minLen, fieldName) {
        if (typeof value !== 'string') return false;
        const t = value.trim();
        if (t.length < (minLen || 15)) return false;
        if (!/\s/.test(t)) return false;
        if (fieldName && t === fieldName) return false;
        if (/^(javascript:|https?:)/i.test(t)) return false;
        return true;
    }

    function helpFromFieldObject(fld) {
        if (!fld) return '';
        try {
            if (typeof fld.getHelp === 'function') {
                const v = fld.getHelp();
                if (looksLikeHelp(v)) return String(v).trim();
            }
        } catch (e) { }

        const keys = ['help', 'helptext', 'helpText', 'fieldhelp', 'fieldHelp', 'description'];
        for (let i = 0; i < keys.length; i++) {
            try {
                if (looksLikeHelp(fld[keys[i]])) return String(fld[keys[i]]).trim();
            } catch (e) { }
        }
        return '';
    }

    function readFieldHelpText(fieldName, sublistId) {
        if (!fieldName) return '';

        try {
            const fld = (sublistId && typeof nlapiGetLineItemField === 'function')
                ? nlapiGetLineItemField(sublistId, fieldName)
                : (typeof nlapiGetField === 'function' ? nlapiGetField(fieldName) : null);
            const fromField = helpFromFieldObject(fld);
            if (fromField) return fromField;
        } catch (e) { }

        const anchor = findHelpAnchor(fieldName);
        if (anchor) {
            const label = (anchor.innerText || '').trim();
            const args = helpAnchorArgs(anchor);
            for (let i = 0; i < args.length; i++) {
                if (args[i] !== label && looksLikeHelp(args[i], 25, fieldName)) return args[i];
            }
        }

        if (anchor) {
            const label = (anchor.innerText || '').trim();
            const tips = [anchor.getAttribute('title'), anchor.getAttribute('data-ns-tooltip')];
            const holder = anchor.closest('.uir-label, .uir-field-wrapper');
            if (holder) tips.push(holder.getAttribute('title'), holder.getAttribute('data-ns-tooltip'));
            for (let i = 0; i < tips.length; i++) {
                const t = (tips[i] || '').trim();
                if (t !== label && looksLikeHelp(t, 25, fieldName)) return t;
            }
        }

        const ids = [`${fieldName}_help`, `fieldhelp_${fieldName}`, `help_${fieldName}`];
        for (let i = 0; i < ids.length; i++) {
            const node = document.getElementById(ids[i]);
            const txt = node && (node.innerText || node.textContent || '').trim();
            if (looksLikeHelp(txt, 15, fieldName)) return txt;
        }

        return '';
    }



    const helpTemplates = {};
    const HELP_FIELD_PARAMS = ['f', 'fl', 'flk'];

    function helpTemplateKey() {
        return (window.location.pathname || '').toLowerCase();
    }

    function rememberHelpTemplate(url, source) {
        try {
            const qs = String(url).split('?')[1];
            if (!qs) return;
            const params = {};
            qs.split('&').forEach(pair => {
                const i = pair.indexOf('=');
                if (i < 1) return;
                const k = decodeURIComponent(pair.slice(0, i));
                if (HELP_FIELD_PARAMS.indexOf(k) !== -1) return;
                params[k] = decodeURIComponent(pair.slice(i + 1).replace(/\+/g, ' '));
            });
            if (!Object.keys(params).length) return;

            const key = helpTemplateKey();
            helpTemplates[key] = params;
            sfvDiag(`[NSFT SFV] plantilla de ayuda aprendida (${source}) para ${key}`, params);
            window.postMessage({ type: 'nsft-sfv-help-template', key: key, params: params }, '*');
        } catch (e) { }
    }

    function watchForHelpUrl() {
        const started = Date.now();
        const look = function () {
            let found = '';
            try {
                const frames = document.querySelectorAll('iframe[src*="fieldhelp.nl"], frame[src*="fieldhelp.nl"]');
                if (frames.length) found = frames[frames.length - 1].getAttribute('src') || '';
            } catch (e) { }

            if (found) { rememberHelpTemplate(found, 'iframe de NetSuite'); return; }
            if (Date.now() - started < 4000) setTimeout(look, 200);
        };
        setTimeout(look, 100);
    }

    function openNativeFieldHelp(fieldName) {
        const anchor = findHelpAnchor(fieldName);
        if (!anchor) return false;
        try {
            bypassLabelClick = true;
            anchor.click();
            watchForHelpUrl();
            return true;
        } catch (e) {
            console.warn('[NSFT SFV] no se pudo abrir la ayuda nativa', e);
            return false;
        } finally {
            bypassLabelClick = false;
        }
    }

    function applyEnabledChange(newVal) {
        if (newVal === moduleEnabled) return;
        moduleEnabled = newVal;
        if (!moduleEnabled) {
            const modal = document.getElementById('nsft-sfv-modal');
            if (modal) modal.remove();
            document.querySelectorAll('.nsft-info-icon, .nsft-info-icon-line').forEach(el => el.remove());
            document.querySelectorAll('.uir-field-wrapper[data-nsft-info-added="true"], .uir-label-span[data-nsft-info-added="true"]')
                .forEach(el => el.removeAttribute('data-nsft-info-added'));
            document.querySelectorAll('.uir-label-span[data-nsft-label-click-bound="1"]')
                .forEach(l => { l.style.cursor = ''; });
            return;
        }
        runAll();
    }

    function applyNoIconChange(newVal) {
        noIconMode = newVal;
        document.querySelectorAll('.nsft-info-icon').forEach(el => el.remove());
        document.querySelectorAll('.uir-field-wrapper[data-nsft-info-added="true"], .uir-label-span[data-nsft-info-added="true"]')
            .forEach(el => el.removeAttribute('data-nsft-info-added'));
        document.querySelectorAll('.uir-label-span[data-nsft-label-click-bound="1"]')
            .forEach(l => { l.style.cursor = noIconMode ? 'pointer' : ''; });
        runAll();
    }

    function ensureLineItemButtonStyles() {
        if (document.getElementById('nsft-sfv-line-widget-styles')) return;
        const style = document.createElement('style');
        style.id = 'nsft-sfv-line-widget-styles';
        style.textContent = `
            .nsft-sfv-line-widget {
                opacity: 0;
                transition: opacity 0.15s ease;
                pointer-events: none;
            }
            /* Visibility is toggled by JS (ensureRowHoverTracking) instead of
               a plain :hover selector: NetSuite applies pointer-events: none /
               other tweaks to .uir-disabled cells, so td:hover doesn't fire
               reliably for read-only sublist columns. We detect the hovered
               cell from the row's mousemove using getBoundingClientRect. */
            .nsft-sfv-line-widget.nsft-sfv-line-visible {
                opacity: 1;
                pointer-events: auto;
            }
            .nsft-info-icon-line {
                transition: background-color 0.15s ease, border-color 0.15s ease, color 0.15s ease, transform 0.1s ease;
            }
            .nsft-info-icon-line:hover {
                background-color: hsla(var(--h, 216), calc(var(--s-val, 23) * 1%), 45%, 0.12) !important;
                border-color: hsl(var(--h, 216), calc(var(--s-val, 23) * 1%), 38%) !important;
                color: hsl(var(--h, 216), calc(var(--s-val, 23) * 1%), 35%) !important;
            }
            .nsft-info-icon-line:active {
                transform: scale(0.94);
                background-color: hsla(var(--h, 216), calc(var(--s-val, 23) * 1%), 45%, 0.22) !important;
            }
            .nsft-info-icon-line:focus {
                outline: 2px solid hsla(var(--h, 216), calc(var(--s-val, 23) * 1%), 45%, 0.4);
                outline-offset: 1px;
            }
        `;
        (document.head || document.documentElement).appendChild(style);
    }

    function ensureRowHoverTracking(row) {
        if (!row || row.dataset.nsftSfvHoverBound === '1') return;
        row.dataset.nsftSfvHoverBound = '1';

        const hideAll = () => {
            row.querySelectorAll('.nsft-sfv-line-widget.nsft-sfv-line-visible')
                .forEach(w => w.classList.remove('nsft-sfv-line-visible'));
        };

        let rafId = 0;
        let lastX = 0;
        let lastY = 0;

        const process = () => {
            rafId = 0;
            const widgets = row.querySelectorAll('.nsft-sfv-line-widget');
            if (widgets.length === 0) return;

            let activeCell = null;
            const cells = row.querySelectorAll(':scope > td');
            for (const td of cells) {
                const r = td.getBoundingClientRect();
                if (lastX >= r.left && lastX <= r.right &&
                    lastY >= r.top && lastY <= r.bottom) {
                    activeCell = td;
                    break;
                }
            }

            widgets.forEach(w => {
                const insideActive = activeCell && activeCell.contains(w);
                if (insideActive) w.classList.add('nsft-sfv-line-visible');
                else w.classList.remove('nsft-sfv-line-visible');
            });
        };

        const onMove = (e) => {
            lastX = e.clientX;
            lastY = e.clientY;
            if (!rafId) rafId = requestAnimationFrame(process);
        };

        row.addEventListener('mousemove', onMove);
        row.addEventListener('mouseleave', () => {
            if (rafId) { cancelAnimationFrame(rafId); rafId = 0; }
            hideAll();
        });
    }

    function ensureCellContentPadded(cell) {
        if (!cell) return;
        const targets = [
            ...cell.querySelectorAll('.bigouter, .uir-field, .listinlinefocusedrowcellnoedit, .listinlinefocusedrowcell, [id$="_fs"]')
        ].filter((t) => !/^(?:parent_)?actionbuttons_|^hddn_/.test(t.id || ''));
        if (targets.length === 0) targets.push(cell);
        for (const t of targets) {
            if (t.dataset.nsftSfvPadded) continue;
            t.dataset.nsftSfvPadded = '1';
            t.style.paddingRight = '32px';
            t.style.boxSizing = 'border-box';
        }
    }

    function injectLineItemButtonOnCell(cell, fieldName, sublistId) {
        ensureLineItemButtonStyles();

        cell.style.position = 'relative';

        ensureCellContentPadded(cell);

        const wrap = document.createElement('span');
        wrap.className = 'nsft-sfv-line-widget';
        wrap.style.cssText = [
            'position:absolute',
            'top:3px',
            'right:4px',
            'width:25px',
            'height:25px',
            'line-height:1',
            'z-index:9999'
        ].join(';') + ';';
        wrap.appendChild(buildLineItemInfoLink(fieldName, sublistId));
        cell.appendChild(wrap);
        ensureRowHoverTracking(cell.closest('tr'));
    }

    function buildLineItemInfoLink(fieldName, sublistId) {
        const link = document.createElement('a');
        link.href = 'javascript:void(0)';
        link.tabIndex = -1;
        link.title = 'Info';
        link.className = 'nsft-info-icon-line';
        link.dataset.nsftSublistId = sublistId;
        link.style.cssText = [
            'box-sizing:border-box',
            'display:inline-flex',
            'align-items:center',
            'justify-content:center',
            'width:25px',
            'height:25px',
            'min-width:25px',
            'min-height:25px',
            'padding:0',
            'margin:0',
            'border:1px solid hsl(var(--h, 216), calc(var(--s-val, 23) * 1%), 38%)',
            'border-radius:4px',
            'background:#ffffff',
            'line-height:1',
            'text-decoration:none',
            'color:hsl(var(--h, 216), calc(var(--s-val, 23) * 1%), 35%)',
            'cursor:pointer',
            'flex:0 0 25px'
        ].join(';') + ';';
        link.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" style="width:16px;height:16px;display:block;">
                <path fill-rule="evenodd" d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm0-7a1 1 0 0 0-1 1v3a1 1 0 1 0 2 0v-3a1 1 0 0 0-1-1Zm0-4a1 1 0 1 0 0 2 1 1 0 0 0 0-2Z" clip-rule="evenodd"/>
            </svg>
        `;
        link.addEventListener('click', function (e) {
            e.preventDefault();
            e.stopPropagation();
            const row = link.closest('tr[id*="_row_"]');
            const m = row && (row.id || '').match(/_row_(\d+)$/);
            const linenum = m ? parseInt(m[1], 10) : null;
            window.NSFT_SetFieldValues.showInfoPopup(fieldName, link, sublistId, linenum);
        });
        return link;
    }

    function injectLineItemButton(span, fieldName, sublistId) {
        const cell = span.closest('td');
        if (!cell) return;
        injectLineItemButtonOnCell(cell, fieldName, sublistId);
    }

    window.NSFT_SetFieldValues = (function () {
        let lastMaximizedTop = "100px";
        let lastMaximizedLeft = "50%";

        const _auditCache = new Map();
        let _lastRenderCtx = null;

        const showInfoPopup = function (fieldName, triggerEl, sublistId, linenum) {
            if (!sublistId && triggerEl && triggerEl.dataset && triggerEl.dataset.nsftSublistId) {
                sublistId = triggerEl.dataset.nsftSublistId;
            }
            sublistId = sublistId || null;
            if (!linenum && triggerEl) {
                const row = triggerEl.closest && triggerEl.closest('tr[id*="_row_"]');
                const m = row && (row.id || '').match(/_row_(\d+)$/);
                if (m) linenum = parseInt(m[1], 10);
            }
            linenum = linenum || null;
            _lastHelpTrigger = (triggerEl && triggerEl.nodeType === 1) ? triggerEl : null;
            initModal();

            const modal = document.getElementById(NSFT.MODAL);
            const titleEl = document.getElementById(NSFT.TITLE);
            if (titleEl) titleEl.innerText = translations.sfv_title;

            modal.style.display = "flex";
            modal.dataset.state = "maximised";
            modal.style.transform = "none";

            if (triggerEl) {
                const rect = triggerEl.getBoundingClientRect();
                const modalWidth = 500;
                const modalHeight = 400;

                let left = rect.right + 10;
                let top = rect.top;

                if (left + modalWidth > window.innerWidth) {
                    left = rect.left - modalWidth - 10;
                    if (left < 10) left = 10;
                }

                if (top + modalHeight > window.innerHeight) {
                    top = window.innerHeight - modalHeight - 10;
                    if (top < 10) top = 10;
                }

                modal.style.left = `${left}px`;
                modal.style.top = `${top}px`;

                lastMaximizedLeft = `${left}px`;
                lastMaximizedTop = `${top}px`;
            }

            renderFieldData(fieldName, false, sublistId, linenum);
        };

        function initModal() {
            if (document.getElementById(NSFT.MODAL)) return;

            const html = `
                <div id="${NSFT.MODAL}" data-state="maximised" data-theme="${NSFT_THEME}">
                    <div class="${NSFT.HEADER}">
                        <span class="${"nsft-sfv-title"}">
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" style="width:16px; height:16px; margin-right:6px; color:#333;"><path fill-rule="evenodd" d="M12 2.25c-5.385 0-9.75 4.365-9.75 9.75s4.365 9.75 9.75 9.75 9.75-4.365 9.75-9.75S17.385 2.25 12 2.25zm.75 12.75a.75.75 0 01-1.5 0v-6a.75.75 0 011.5 0v6zm-1.5-9a1 1 0 112 0 1 1 0 01-2 0z" clip-rule="evenodd" /></svg>
                            <span id="${NSFT.TITLE}">${translations.sfv_title}</span>
                        </span>
                        <div class="nsft-header-actions">
                            <span id="${NSFT.CFG_BTN}" class="nsft-header-btn" title="${escapeHtml(translations.sfv_open_settings || "")}" role="button">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" style="width:14px;height:14px;vertical-align:-2px;"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1.08-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>
                            </span>
                            <span id="${NSFT.MAX_BTN}" class="nsft-header-btn" title="${translations.maximizeModal || 'Maximize'}">▢</span>
                            <span id="${NSFT.CLOSE_BTN}" class="nsft-header-btn nsft-btn-close" title="${translations.closeModal || 'Close'}">✕</span>
                        </div>
                    </div>
                    <div id="${NSFT.CONTENT}" class="nsft-sfv-content">
                        <div style="text-align:center; padding:20px; color:#999;">${translations.sfv_loading}</div>
                    </div>
                </div>
            `;
            document.body.insertAdjacentHTML("beforeend", html);
            addModalListeners();
            try { window.postMessage({ dest: 'extension_sfv', type: 'coach' }, '*'); } catch (e) { }
            watchModalSize(document.getElementById(NSFT.MODAL));
        }

        function addModalListeners() {
            const modal = document.getElementById(NSFT.MODAL);
            const header = modal.querySelector(`.${NSFT.HEADER}`);

            document.getElementById(NSFT.CLOSE_BTN).onclick = closeHelpWindow;
            const cfgBtn = document.getElementById(NSFT.CFG_BTN);
            if (cfgBtn) cfgBtn.onclick = function () {
                try {
                    window.postMessage({ dest: 'extension_sfv', type: 'openSettings' }, '*');
                } catch (e) { }
            };

            document.getElementById(NSFT.MAX_BTN).onclick = () => {
                modal.dataset.state = "maximised";
                modal.style.top = lastMaximizedTop;
                modal.style.left = lastMaximizedLeft;
                modal.style.transform = (lastMaximizedLeft.includes("%")) ? "translateX(-50%)" : "none";
            };

            let mouseIsDown = false;
            let startX, startY;

            header.addEventListener("mousedown", (e) => {
                if (e.target.closest(".nsft-header-actions")) return;
                mouseIsDown = true;
                modal.classList.add("nsft-dragging");

                const rect = modal.getBoundingClientRect();
                startX = e.clientX - rect.left;
                startY = e.clientY - rect.top;

                modal.style.transform = "none";
                modal.style.left = `${rect.left}px`;
                modal.style.top = `${rect.top}px`;
            });

            let dragPend = null;
            let dragRaf = 0;

            const dragApply = () => {
                dragRaf = 0;
                if (!dragPend) return;
                modal.style.left = `${dragPend.x}px`;
                modal.style.top = `${dragPend.y}px`;
                if (modal.dataset.state === 'maximised') {
                    lastMaximizedLeft = `${dragPend.x}px`;
                    lastMaximizedTop = `${dragPend.y}px`;
                }
                dragPend = null;
            };

            window.addEventListener("mousemove", (e) => {
                if (!mouseIsDown) return;
                e.preventDefault();
                dragPend = { x: e.clientX - startX, y: e.clientY - startY };
                if (!dragRaf) dragRaf = requestAnimationFrame(dragApply);
            });

            window.addEventListener("mouseup", () => {
                if (mouseIsDown) {
                    mouseIsDown = false;
                    if (dragRaf) { cancelAnimationFrame(dragRaf); dragRaf = 0; }
                    dragApply();
                    modal.classList.remove("nsft-dragging");
                    if (modal.dataset.state === "minimised") {
                        snapToEdge(modal);
                    } else {
                        constrainModalToWindow(modal);
                    }
                }
            });

            window.addEventListener("resize", () => fitModalInViewport());

            header.addEventListener("dblclick", () => {
                if (modal.dataset.state === "minimised") document.getElementById(NSFT.MAX_BTN).click();
            });
        }

        function constrainModalToWindow(el) {
            const rect = el.getBoundingClientRect();
            let newLeft = rect.left;
            let newTop = rect.top;

            const winW = window.innerWidth;
            const winH = window.innerHeight;

            if (newLeft < 0) newLeft = 10;
            if (newLeft + rect.width > winW) newLeft = winW - rect.width - 10;
            if (newTop < 0) newTop = 10;
            if (newTop + rect.height > winH) newTop = winH - rect.height - 10;

            el.style.left = `${newLeft}px`;
            el.style.top = `${newTop}px`;
        }

        function fitModalInViewport() {
            const modal = document.getElementById(NSFT.MODAL);
            if (!modal || modal.style.display === 'none') return;
            if (modal.dataset.state === 'minimised') return;
            if (modal.classList.contains('nsft-dragging')) return;

            const MARGIN = 10;
            const rect = modal.getBoundingClientRect();
            if (!rect.height || !rect.width) return;

            let top = rect.top;
            let left = rect.left;

            if (rect.height + MARGIN * 2 >= window.innerHeight) {
                top = MARGIN;
            } else {
                if (top + rect.height > window.innerHeight - MARGIN) {
                    top = window.innerHeight - rect.height - MARGIN;
                }
                if (top < MARGIN) top = MARGIN;
            }

            if (rect.width + MARGIN * 2 >= window.innerWidth) {
                left = MARGIN;
            } else {
                if (left + rect.width > window.innerWidth - MARGIN) {
                    left = window.innerWidth - rect.width - MARGIN;
                }
                if (left < MARGIN) left = MARGIN;
            }

            if (Math.round(top) === Math.round(rect.top) && Math.round(left) === Math.round(rect.left)) return;

            modal.style.transform = 'none';
            modal.style.top = `${top}px`;
            modal.style.left = `${left}px`;
            lastMaximizedTop = `${top}px`;
            lastMaximizedLeft = `${left}px`;
        }

        let _modalResizeObserver = null;
        function watchModalSize(modal) {
            if (_modalResizeObserver || typeof ResizeObserver !== 'function') return;
            try {
                _modalResizeObserver = new ResizeObserver(() => fitModalInViewport());
                _modalResizeObserver.observe(modal);
            } catch (e) { }
        }

        function snapToEdge(el) {
            const rect = el.getBoundingClientRect();
            const winW = window.innerWidth;
            const center = rect.left + (rect.width / 2);

            if (center < winW / 2) el.style.left = "20px";
            else el.style.left = `${winW - rect.width - 20}px`;
        }

        function closeHelpWindow() {
            const modal = document.getElementById(NSFT.MODAL);
            if (modal) modal.style.display = "none";
        }

        function renderFieldData(fieldName, isUpdate = false, sublistId = null, linenum = null) {
            _lastRenderCtx = { fieldName, sublistId, linenum };
            histAutoPedido = null;

            if (!isUpdate) activeTab = 'valor';

            if (!isUpdate) {
                altoDeValor = 0;
                const caja = document.querySelector("#" + NSFT.MODAL + " .nsft-sfv-content");
                if (caja) caja.style.maxHeight = "";
            }
            let optionsJson, linkUrl, domOpts = null, html = "";
            let tabValor = "";
            let tabDef = "";
            let tabDefFin = "";
            let tabDefBoton = "";
            let tabHist = "";
            let metaHtml = "";

            const api = sublistId ? {
                getValue: () => (typeof nlapiGetCurrentLineItemValue === 'function')
                    ? nlapiGetCurrentLineItemValue(sublistId, fieldName) : null,
                getValues: () => (typeof nlapiGetCurrentLineItemValues === 'function')
                    ? nlapiGetCurrentLineItemValues(sublistId, fieldName) : null,
                getText: () => (typeof nlapiGetCurrentLineItemText === 'function')
                    ? nlapiGetCurrentLineItemText(sublistId, fieldName) : null,
                getTexts: () => null,
                getField: () => (typeof nlapiGetLineItemField === 'function')
                    ? nlapiGetLineItemField(sublistId, fieldName) : null
            } : {
                getValue: () => nlapiGetFieldValue(fieldName),
                getValues: () => (typeof nlapiGetFieldValues === 'function') ? nlapiGetFieldValues(fieldName) : null,
                getText: () => nlapiGetFieldText(fieldName),
                getTexts: () => (typeof nlapiGetFieldTexts === 'function') ? nlapiGetFieldTexts(fieldName) : null,
                getField: () => (typeof nlapiGetField === 'function') ? nlapiGetField(fieldName) : null
            };

            const dropdown = jQuery(`.ns-dropdown[data-name="${fieldName}"]`);
            if (dropdown.length) optionsJson = dropdown.attr("data-options");

            let fieldValue = "";
            let fieldText = "";



            try {
                const val = api.getValue();
                if (val) {
                    const vals = api.getValues();
                    fieldValue = (vals) ? vals.join() : val;
                }

                const txt = api.getText();
                if (txt) {
                    fieldText = txt;
                } else {
                    const txts = api.getTexts();
                    if (txts) fieldText = txts.join();
                }
            } catch (e) { }

            const listKind = readListKind(fieldName);
            if (optionsJson || listKind) {
                linkUrl = extractLinkFromSync(fieldName) || viewLinkUrl(fieldName);
                if (!linkUrl) {
                    try {
                        const popup = window.document.getElementById(fieldName + '_popup_link');
                        if (popup) {
                            const onclickStr = popup.getAttribute('onclick') || '';
                            const match = onclickStr.match(/nlOpenWindow\('([^']+)'/);
                            if (match && match[1]) {
                                linkUrl = match[1];
                            }
                        }
                    } catch (e) { }
                }
                if (!linkUrl && listKind === "file") {
                    linkUrl = "/app/common/media/mediaitem.nl?";
                }
                if (!linkUrl) {
                    const fallbackMap = {
                        'entity': '/app/common/entity/entity.nl?',
                        'customer': '/app/common/entity/customer.nl?',
                        'vendor': '/app/common/entity/vendor.nl?',
                        'employee': '/app/common/entity/employee.nl?',
                        'contact': '/app/common/entity/contact.nl?',
                        'partner': '/app/common/entity/partner.nl?',
                        'item': '/app/common/item/item.nl?',
                        'location': '/app/common/other/location.nl?',
                        'department': '/app/common/other/department.nl?',
                        'class': '/app/common/other/class.nl?',
                        'account': '/app/common/account/account.nl?',
                        'subsidiary': '/app/common/other/subsidiary.nl?',
                        'terms': '/app/common/other/terms.nl?',
                        'taxcode': '/app/common/custom/taxcode.nl?',
                        'customform': '/app/common/custom/customform.nl?'
                    };
                    if (fallbackMap[fieldName]) {
                        linkUrl = fallbackMap[fieldName];
                    }
                }
            }

            const animStyle = isUpdate ? 'animation: none;' : '';
            html += `<div class="nsft-sfv-container" style="${animStyle}">`;

            const isCustomInfo = fieldName.startsWith('cust');
            const typeText = isCustomInfo
                ? (translations.sfv_custom_field || "Custom Field")
                : (translations.sfv_standard_field || "Standard Field");
            const botonAyuda = !ver("setFieldValuesShowHelp") ? '' : `<button type="button" class="nsft-sfv-helpbtn"
                         aria-expanded="${helpCollapsed ? "false" : "true"}"
                         title="${escapeHtml(translations.sfv_help_toggle || '')}"
                         onclick="window.parent.NSFT_SetFieldValues.toggleFieldHelp('${escapeJsString(fieldName)}')">
                       <span class="nsft-sfv-helpbtn-caret" aria-hidden="true">▾</span>
                       <span class="nsft-sfv-helpbtn-lbl">${escapeHtml(helpCollapsed ? (translations.sfv_help_show || "") : (translations.sfv_help_hide || ""))}</span>
                   </button>`;

            const botonNativa = findHelpAnchor(fieldName)
                ? `<button type="button" class="nsft-sfv-nativebtn"
                           title="${escapeHtml(translations.sfv_help_open_tooltip || '')}"
                           aria-label="${escapeHtml(translations.sfv_help_open_tooltip || '')}"
                           onclick="window.parent.NSFT_SetFieldValues.openNativeHelp('${escapeJsString(fieldName)}')">
                       <svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0ZM8.94 6.94a.75.75 0 1 1-1.061-1.061 3 3 0 1 1 2.871 5.026v.345a.75.75 0 0 1-1.5 0v-.5c0-.72.57-1.172 1.081-1.287A1.5 1.5 0 1 0 8.94 6.94ZM10 15a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z" clip-rule="evenodd"/></svg>
                   </button>`
                : '';

            html += `<div id="${NSFT.CUSTOM_FIELDS_CONTAINER}" class="nsft-sfv-origin">
                        <div class="nsft-sfv-ribbon">
                            <span class="nsft-sfv-chip${isCustomInfo ? "" : " is-native"}">${escapeHtml(typeText)}</span>
                            <span class="nsft-sfv-ribbon-spacer"></span>
                            ${botonAyuda}
                            ${botonNativa}
                        </div>
                        <div id="nsft-custom-field-details"></div>
                     </div>`;

            const helpText = ver("setFieldValuesShowHelp") ? readFieldHelpText(fieldName, sublistId) : "";
            if (!ver("setFieldValuesShowHelp")) {
            } else if (helpText) {
                html += helpBlockHtml(helpText);
            } else if (findHelpAnchor(fieldName)) {
                html += helpBlockHtml('', { id: NSFT.HELP_SLOT, loading: true });
            } else {
                sfvDiag(`[NSFT SFV] ayuda "${fieldName}": no se encontró la ayuda nativa de la etiqueta`);
            }

            if (ver("setFieldValuesShowId")) metaHtml = `<div class="nsft-sfv-row">
                        <span class="nsft-sfv-label">${translations.sfv_internal_id}:</span>
                        <span class="nsft-sfv-value nsft-sfv-value-id">${escapeHtml(fieldName)}</span>
                        ${makeCopyBadge(fieldName)}
                     </div>`;

            if (ver("setFieldValuesShowEdit")) tabDefBoton += `<div id="${NSFT.EDIT_ROW}" class="nsft-sfv-editrow" style="display:none;">
                            <span id="${NSFT.EDIT_BTN}" class="nsft-sfv-ghostbtn" style="cursor:pointer;" title="${translations.sfv_edit_tooltip}">
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" style="width:12px;height:12px;margin-right:2px;vertical-align:text-top;"><path d="M5.433 13.917l1.262-3.155A4 4 0 017.58 9.42l6.92-6.918a2.121 2.121 0 013 3l-6.92 6.918c-.383.383-.84.685-1.343.886l-3.154 1.262a.5.5 0 01-.65-.65z" /><path d="M3.5 5.75c0-.69.56-1.25 1.25-1.25H10A.75.75 0 0010 3H4.75A2.75 2.75 0 002 5.75v9.5A2.75 2.75 0 004.75 18h9.5A2.75 2.75 0 0017 15.25V10a.75.75 0 00-1.5 0v5.25c0 .69-.56 1.25-1.25 1.25h-9.5c-.69 0-1.25-.56-1.25-1.25v-9.5z" /></svg>
                                ${translations.sfv_edit_field_btn}
                                <span aria-hidden="true">↗</span>
                            </span>
                     </div>`;

            if (auditEnabled && !sublistId && typeof nlapiGetRecordId === 'function') {
                try {
                    const rId = nlapiGetRecordId();
                    if (rId) {
                        tabHist += `<div id="${NSFT.AUDIT_LIST}" class="nsft-fav-list"></div>`;
                    }
                } catch (_) { }
            }

            const fldObj = api.getField();

            const urlParams = new URLSearchParams(window.location.search);
            const hasE = urlParams.get("e") === "T";
            const hasId = urlParams.has("id");

            const isEditMode = (hasE || !hasId);

            const vc = (!isEditMode && !sublistId) ? viewCtx(fieldName) : null;

            if ((isEditMode && fldObj) || vc) {
                const TRUNCATE_AT = 280;
                let valDisplay;
                if (!fieldValue) {
                    valDisplay = '<em>(null)</em>';
                } else if (linkUrl) {
                    valDisplay = `<a href="${escapeHtml(linkUrl)}&id=${encodeURIComponent(fieldValue)}" target="_blank">${escapeHtml(fieldValue)}</a>`;
                } else if (fieldValue.length > TRUNCATE_AT) {
                    const extra = fieldValue.length - TRUNCATE_AT;
                    const moreLabel = (translations.sfv_value_more || '+{n} caracteres').replace('{n}', extra);
                    const lessLabel = translations.sfv_value_less || 'Ver menos';
                    valDisplay =
                        `<span class="nsft-sfv-val-short">${escapeHtml(fieldValue.slice(0, TRUNCATE_AT))}…</span>` +
                        `<span class="nsft-sfv-val-full" style="display:none">${escapeHtml(fieldValue)}</span>` +
                        `<span class="nsft-badge nsft-sfv-expand-btn" style="cursor:pointer; margin-left:6px;" data-more="${escapeHtml(moreLabel)}" data-less="${escapeHtml(lessLabel)}" onclick="window.parent.NSFT_SetFieldValues.toggleValueExpand(this)">${escapeHtml(moreLabel)}</span>`;
                } else {
                    valDisplay = escapeHtml(fieldValue);
                }
                const copyValueBadge = makeCopyBadge(fieldValue);
                const valScrollCls = (fieldValue && fieldValue.length > TRUNCATE_AT) ? ' nsft-sfv-value-scroll' : '';
                const abreFichaValor = ver("setFieldValuesShowValue") || ver("setFieldValuesShowText");
                if (abreFichaValor) tabValor += `<div class="nsft-sfv-cardwrap"><div class="nsft-sfv-card">`;
                const textScrollCls = (fieldText && fieldText.length > TRUNCATE_AT) ? ' nsft-sfv-value-scroll' : '';
                if (ver("setFieldValuesShowText")) tabValor += `<div id="${NSFT.TEXT_ROW}" class="nsft-sfv-row"${fieldText ? '' : ' hidden'}>
                        <span class="nsft-sfv-label">${translations.sfv_field_text}:</span>
                        <span id="${NSFT.TEXT_SLOT}" class="nsft-sfv-value nsft-sfv-value-long${textScrollCls}">${fieldText ? escapeHtml(fieldText) : ''}</span>
                        ${fieldText ? makeCopyBadge(fieldText) : ''}
                     </div>`;
                if (ver("setFieldValuesShowValue")) tabValor += `<div class="nsft-sfv-row">
                        <span class="nsft-sfv-label">${translations.sfv_field_value}:</span>
                        <span id="${NSFT.VALUE_SLOT}" class="nsft-sfv-value nsft-sfv-value-long${valScrollCls}">${valDisplay}</span>
                        ${copyValueBadge}
                     </div>`;

                if (abreFichaValor) tabValor += `</div></div>`;

                const tipoCampo = ver("setFieldValuesShowType") ? nombreDelTipo(readFieldType(fieldName)) : "";
                if (tipoCampo) {
                    metaHtml += `<div class="nsft-sfv-row">
                            <span class="nsft-sfv-label">${translations.sfv_field_type}:</span>
                            <span id="${NSFT.TYPE_SLOT}" class="nsft-sfv-value">${escapeHtml(tipoCampo)}</span>
                         </div>`;
                }
                if (ver("setFieldValuesShowType") && readListKind(fieldName)) {
                    metaHtml += `<div id="${NSFT.SOURCE_ROW}" class="nsft-sfv-row" style="display:none;">
                            <span class="nsft-sfv-label">${translations.sfv_source_list}:</span>
                            <span id="${NSFT.SOURCE_SLOT}" class="nsft-sfv-value"></span>
                            ${listOpenIconHtml(linkUrl)}
                         </div>`;
                }
                const visual = ver("setFieldValuesShowType") ? readDisplayType(fieldName) : "";
                if (visual) {
                    const rotulo = translations["sfv_display_" + visual] || visual;
                    metaHtml += `<div class="nsft-sfv-row">
                            <span class="nsft-sfv-label">${translations.sfv_display_type}:</span>
                            <span id="${NSFT.DISPLAY_SLOT}" class="nsft-sfv-value">${escapeHtml(rotulo)}</span>
                         </div>`;
                }

                if (sublistId) {
                    if (ver("setFieldValuesShowFlags")) tabDefFin += getLineItemAttributesHtml(fieldName, sublistId, linenum);
                } else {
                    if (ver("setFieldValuesShowFlags")) tabDefFin += getFieldAttributesHtml(fieldName);
                }



                const sidArg = sublistId ? `'${escapeJsString(sublistId)}'` : 'null';
                const lineArg = (linenum != null) ? String(linenum) : 'null';
                if (ver("setFieldValuesShowSetter")) tabValor += `<div class="nsft-sfv-setter">
                        <label class="nsft-sfv-setter-label" for="nsft-txt-new-value-${escapeHtml(fieldName)}">${translations.sfv_enter_new_value}:</label>
                        <div class="nsft-sfv-input-group" style="margin-top:0;">
                            <div class="nsft-sfv-bar">
                                <input type="text" id="nsft-txt-new-value-${escapeHtml(fieldName)}" class="nsft-sfv-field nsft-sfv-input" placeholder="${translations.sfv_enter_new_value}..." autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false">
                            </div>
                            <button class="nsft-sfv-btn" onclick="javascript:window.parent.NSFT_SetFieldValues.setNewValue('${escapeJsString(fieldName)}', window.document.getElementById('nsft-txt-new-value-${escapeJsString(fieldName)}').value, ${sidArg}, ${lineArg});">
                                ${translations.sfv_set}
                            </button>
                        </div>
                     </div>`;

                if (optionsJson) {
                    let opts = [];
                    try { opts = JSON.parse(optionsJson); } catch (e) { }

                    if (opts.length === 0) {
                        try {
                            const inputEl = window.document.getElementsByName("inpt_" + fieldName)[0];
                            if (inputEl && typeof getDropdown === 'function') {
                                const dropdownObj = getDropdown(inputEl);
                                if (dropdownObj && dropdownObj.valueArray) {
                                    for (let i = 0; i < dropdownObj.valueArray.length; i++) {
                                        if (dropdownObj.valueArray[i]) {
                                            opts.push({ value: dropdownObj.valueArray[i], text: dropdownObj.textArray[i] });
                                        }
                                    }
                                }
                            }
                        } catch (err) { console.warn('NSFT getDropdown error', err); }
                    }

                    if (opts.length > 0) {
                        domOpts = opts;
                        if (ver("setFieldValuesShowOptions")) tabValor += listSlotHtml(linkUrl);
                        else domOpts = null;
                    }
                } else if (listKind && resolveListTarget(linkUrl)) {
                    if (ver("setFieldValuesShowOptions")) tabValor += listSlotHtml(linkUrl);
                }
            } else if (isEditMode && !fldObj) {

            }

            if (metaHtml) tabDef += `<div class="nsft-sfv-card">${metaHtml}</div>`;
            tabDef += tabDefFin + tabDefBoton;

            const panes = [
                { id: "valor", label: translations.sfv_tab_value, body: tabValor },
                { id: "def", label: translations.sfv_tab_definition, body: tabDef },
                { id: "hist", label: translations.sfv_tab_history, body: tabHist }
            ].filter(function (p) { return p.body && p.body.trim(); });

            if (panes.length > 1) {
                const activa = panes.some(function (p) { return p.id === activeTab; })
                    ? activeTab : panes[0].id;
                html += `<div id="${NSFT.TABS}" class="nsft-sfv-tabs" role="tablist">` +
                    panes.map(function (p) {
                        return `<button type="button" role="tab" class="nsft-sfv-tab"
                                        aria-selected="${p.id === activa}"
                                        data-tab="${p.id}"
                                        onclick="window.parent.NSFT_SetFieldValues.showTab('${p.id}')">` +
                               escapeHtml(p.label || p.id) + `</button>`;
                    }).join("") + `</div>`;
                html += panes.map(function (p) {
                    return `<div class="nsft-sfv-pane" data-tab="${p.id}"
                                 ${p.id === activa ? "" : "hidden"}>${p.body}</div>`;
                }).join("");
            } else if (panes.length === 1) {
                html += panes[0].body;
            }

            html += `</div>`;

            const body = document.getElementById(NSFT.CONTENT);
            if (body) {
                body.innerHTML = html;

                try {
                    detectCustomField(fieldName);
                } catch (e) {
                    console.warn(e);
                }

                if (activeTab === "hist") pedirHistorialSiHaceFalta();
                else setTimeout(pedirHistorialSiHaceFalta, 250);

                fillSourceSlot(fieldName);

                fillHelpSlot(fieldName);
                pintarBotonAyuda();

                fillListSlot(fieldName, fieldValue, linkUrl, sublistId, linenum, domOpts);

                if (vc) fillViewValue(vc, fieldName);

                requestAnimationFrame(fitModalInViewport);
            }
        }

        function helpBodyHtml(text, topic) {
            let html = escapeHtml(text);
            if (topic) {
                html += `<a class="nsft-sfv-help-topic" href="${escapeHtml(topic)}"
                            target="_blank" rel="noopener noreferrer"
                         >${escapeHtml(translations.sfv_help_topic || 'Open this page\'s help topic')} →</a>`;
            }
            return html;
        }

        function makeCopyBadge(raw) {
            return raw
                ? `<span class="nsft-badge" title="${translations.sfv_copy_tooltip}" data-nsft-copy-value="${escapeHtml(raw)}" style="cursor:pointer; margin-left:6px;"
                        onclick="
                        const el = this;
                        const originalHtml = el.innerHTML;
                        navigator.clipboard.writeText(el.getAttribute('data-nsft-copy-value') || '');
                        el.style.backgroundColor='var(--nsft-sfv-ok-soft)'; el.style.color='var(--nsft-sfv-ok)';
                        el.innerHTML = '${translations.sfv_copied}';
                        setTimeout(() => {
                            el.style.backgroundColor=''; el.style.color='';
                            el.innerHTML = originalHtml;
                        }, 1000);
                          "><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" style="width:12px;height:12px;vertical-align:text-top;"><path d="M7 3.5A1.5 1.5 0 018.5 2h3.879a1.5 1.5 0 011.06.44l3.122 3.12A1.5 1.5 0 0117 6.622V12.5a1.5 1.5 0 01-1.5 1.5h-1v-3.379a3 3 0 00-.879-2.121L10.5 5.379A3 3 0 008.379 4.5H7v-1z" /><path d="M4.5 6A1.5 1.5 0 003 7.5v9A1.5 1.5 0 004.5 18h7a1.5 1.5 0 001.5-1.5v-5.879a1.5 1.5 0 00-.44-1.06L9.44 6.439A1.5 1.5 0 008.378 6H4.5z" /></svg></span>`
                : '';
        }

        function helpBlockHtml(text, opts) {
            const o = opts || {};
            const idAttr = o.id ? ` id="${o.id}"` : '';
            const body = o.loading
                ? '<span class="nsft-sfv-help-skeleton"></span>'
                : helpBodyHtml(text, o.topic);
            return `<div${idAttr} class="nsft-sfv-help" data-collapsed="${helpCollapsed ? '1' : '0'}">
                        <div class="nsft-sfv-help-text">${body}</div>
                    </div>`;
        }

        const _listaFuente = {};

        function fillSourceSlot(fieldName) {
            const fila = document.getElementById(NSFT.SOURCE_ROW);
            if (!fila) return;

            if (!/^cust/i.test(String(fieldName || ""))) return;

            const clave = String(fieldName).toUpperCase();
            if (Object.prototype.hasOwnProperty.call(_listaFuente, clave)) {
                pintarListaFuente(fieldName, _listaFuente[clave]);
                return;
            }

            const T = window.NSFT_SQL;
            if (!T) return;

            const where = `FROM customfield WHERE UPPER(scriptid) = UPPER(${T.lit(fieldName)})`;
            const rica = `SELECT fieldvaluetyperecord, BUILTIN.DF(fieldvaluetyperecord) AS nombre ${where}`;
            const simple = `SELECT fieldvaluetyperecord ${where}`;

            T.run({
                rest: rica, sql: rica, limit: 5,
                fallback: { rest: simple, sql: simple, limit: 5 }
            }, function (err, rows) {
                if (err) return;
                const r = (rows && rows[0]) || null;
                const valor = r ? (r.nombre || r.fieldvaluetyperecord || null) : null;
                _listaFuente[clave] = valor;
                pintarListaFuente(fieldName, valor);
            });
        }

        function pintarListaFuente(fieldName, valor) {
            if (!_lastRenderCtx || _lastRenderCtx.fieldName !== fieldName) return;
            const fila = document.getElementById(NSFT.SOURCE_ROW);
            const hueco = document.getElementById(NSFT.SOURCE_SLOT);
            if (!fila || !hueco || !valor) return;
            hueco.textContent = String(valor);
            fila.style.display = "";
            try { requestAnimationFrame(fitModalInViewport); } catch (e) { }
        }

        function fillHelpSlot(fieldName) {
            if (!document.getElementById(NSFT.HELP_SLOT)) return;

            fetchFieldHelpPage(fieldName, function (fromPage, url, generic, topic) {
                let how = 'sin ayuda';
                if (fromPage) how = topic ? 'fieldhelp.nl (invitación al tema)' : 'fieldhelp.nl';
                else if (generic) how = 'sin ayuda (respuesta genérica)';
                else if (!url) how = 'sin ayuda (no se pudo armar la URL)';
                paintHelp(fieldName, fromPage, how + (url ? ` → ${url}` : ''), topic);
            });
        }

        function paintHelp(fieldName, text, source, topic) {
            const el = document.getElementById(NSFT.HELP_SLOT);
            if (!el || !_lastRenderCtx || _lastRenderCtx.fieldName !== fieldName) return;

            if (!text) sfvDiag(`[NSFT SFV] ayuda "${fieldName}": ${source || '?'}`);

            const body = el.querySelector('.nsft-sfv-help-text');

            if (!text) {
                collapseAndRemoveHelp(el);
                return;
            }

            if (!body) { el.outerHTML = helpBlockHtml(text, { topic: topic }); return; }
            swapHelpText(body, text, topic);
        }

        const HELP_ANIM_MS = 220;

        function swapHelpText(body, text, topic) {
            const from = body.getBoundingClientRect().height;

            body.innerHTML = helpBodyHtml(text, topic);
            const to = body.getBoundingClientRect().height;

            if (!from || Math.abs(to - from) < 2) return;

            body.style.height = `${from}px`;
            body.style.opacity = '0';
            body.classList.add('nsft-sfv-anim');

            requestAnimationFrame(function () {
                requestAnimationFrame(function () {
                    body.style.height = `${to}px`;
                    body.style.opacity = '1';
                });
            });

            const done = function () {
                body.removeEventListener('transitionend', done);
                body.classList.remove('nsft-sfv-anim');
                body.style.height = '';
                body.style.opacity = '';
            };
            body.addEventListener('transitionend', done);
            setTimeout(done, HELP_ANIM_MS + 180);
        }

        function collapseAndRemoveHelp(box) {
            const from = box.getBoundingClientRect().height;
            const remove = function () {
                if (box.parentNode) box.parentNode.removeChild(box);
                pintarBotonAyuda();
            };
            if (!from) { remove(); return; }

            box.style.height = `${from}px`;
            box.classList.add('nsft-sfv-anim');
            requestAnimationFrame(function () {
                requestAnimationFrame(function () {
                    box.style.height = '0px';
                    box.style.opacity = '0';
                    box.style.marginBottom = '0px';
                    box.style.paddingTop = '0px';
                    box.style.paddingBottom = '0px';
                });
            });

            box.addEventListener('transitionend', remove);
            setTimeout(remove, HELP_ANIM_MS + 180);
        }

        function stripTags(v) {
            if (typeof v !== 'string') return '';
            return v.replace(/<br\s*\/?>/gi, '\n')
                .replace(/<[^>]*>/g, '')
                .replace(/&nbsp;/gi, ' ')
                .replace(/&amp;/gi, '&')
                .replace(/&lt;/gi, '<')
                .replace(/&gt;/gi, '>')
                .trim();
        }

        const _fieldHelpCache = {};

        function helpParam(v) {
            return encodeURIComponent(v).replace(/%3A/gi, ':');
        }

        function pageNameCandidates() {
            const out = [];
            const add = (v) => {
                const s = String(v || '').trim().toLowerCase();
                if (s && out.indexOf(s) === -1) out.push(s);
            };

            try {
                if (typeof nlapiGetRecordType === 'function') add(nlapiGetRecordType());
            } catch (e) { }

            try {
                const hidden = document.querySelector('input[name="type"], input[name="rectype"], input[id="type"]');
                if (hidden && hidden.value) add(hidden.value);
            } catch (e) { }

            const m = (window.location.pathname || '').match(/\/([a-z0-9_]+)\.nl$/i);
            if (m) add(m[1]);

            return out;
        }

        function isTransactionParam() {
            return /\/accounting\/transactions\//i.test(window.location.pathname || '') ? 'T' : 'F';
        }

        function formIdParam() {
            if (isTransactionParam() !== 'T') return '-1';
            try {
                if (typeof nlapiGetFieldValue === 'function') {
                    const v = nlapiGetFieldValue('customform');
                    if (v) return String(v);
                }
            } catch (e) { }
            return '-1';
        }

        function accountParam() {
            try {
                if (typeof nlapiGetContext === 'function') {
                    const c = nlapiGetContext().getCompany();
                    if (c) return String(c);
                }
            } catch (e) { }
            const el = document.querySelector('[href*="/core/help/"][href*="c="], [src*="/core/help/"][src*="c="]');
            const s = el ? (el.getAttribute('href') || el.getAttribute('src') || '') : '';
            const m = s.match(/[?&]c=([^&"']+)/);
            return m ? decodeURIComponent(m[1]) : '';
        }

        function nsVerParam() {
            const el = document.querySelector('script[src*="NS_VER="], link[href*="NS_VER="]');
            const s = el ? (el.getAttribute('src') || el.getAttribute('href') || '') : '';
            const m = s.match(/NS_VER=([0-9.]+)/);
            return m ? m[1] : '';
        }

        function recordTitleParam() {
            const h1 = document.querySelector('h1.uir-record-type, .uir-record-type, .uir-page-title h1, #pagetitle h1');
            const t = h1 ? (h1.innerText || h1.textContent || '').trim() : '';
            return t.replace(/\s+/g, ' ').trim();
        }

        function fieldLabelParam(anchor) {
            const t = anchor ? (anchor.innerText || anchor.textContent || '') : '';
            return t.replace(/\s+/g, ' ').replace(/[\s*:]+$/, '').trim();
        }

        function pageHelpTopic() {
            const el = document.querySelector('[href*="topic="], [onclick*="topic="]');
            const s = el ? (el.getAttribute('href') || el.getAttribute('onclick') || '') : '';
            const m = s.match(/topic=([A-Za-z0-9_]+)/);
            return m ? m[1] : '';
        }

        function bareFieldHelpUrl(fieldName) {
            if (!fieldName) return '';
            const ver = nsVerParam();
            let qs = 'f=' + helpParam(fieldName);
            if (ver) qs += '&NS_VER=' + helpParam(ver);
            return '/core/help/fieldhelp.nl?' + qs + '&ifrmcntnr=T';
        }

        const HELP_ARG_PARAMS = ['', 'f', 'p', 'l', 'v', 'flhtp', 'topic', 'c', 'pt', 'tr', 'ftk', 'ft', 'flk', 'fl'];

        function nativeFieldHelpUrl(fieldName) {
            if (!fieldName) return '';
            const anchor = findHelpAnchor(fieldName);
            if (!anchor) return '';

            const args = helpAnchorArgs(anchor);
            if (args.length < 2) return '';
            if (String(args[1]).toLowerCase() !== String(fieldName).toLowerCase()) return '';

            const partes = [];
            for (let i = 1; i < args.length && i < HELP_ARG_PARAMS.length; i++) {
                const clave = HELP_ARG_PARAMS[i];
                const valor = args[i];
                if (!clave || valor === '' || valor == null) continue;
                partes.push(clave + '=' + (/[\s&#?]/.test(valor) ? helpParam(valor) : valor));
            }
            if (!partes.length) return '';

            const ver = nsVerParam();
            if (ver) partes.push('NS_VER=' + helpParam(ver));
            partes.push('ifrmcntnr=T');
            return '/core/help/fieldhelp.nl?' + partes.join('&');
        }

        function buildFieldHelpUrls(fieldName) {
            if (!fieldName) return [];

            const urls = [];
            const nativa = nativeFieldHelpUrl(fieldName);
            if (nativa) urls.push(nativa);
            urls.push(bareFieldHelpUrl(fieldName));

            const anchor = findHelpAnchor(fieldName);
            if (!anchor) return urls;

            const args = helpAnchorArgs(anchor);

            const appKeys = args.filter(a => /^APP:/i.test(a));
            const flk = appKeys.filter(a => /^APP:FORMLABEL:/i.test(a))[0] || '';
            const ftk = appKeys.filter(a => /^APP:HEADING:/i.test(a))[0]
                || appKeys.filter(a => a !== flk)[0] || '';
            const topicArg = args.filter(a => !/^APP:/i.test(a) && /^[A-Z][A-Z0-9_]{3,}$/.test(a))[0];

            const fl = flk ? '' : fieldLabelParam(anchor);
            if (!flk && !fl) {
                sfvDiag(`[NSFT SFV] "${fieldName}": ni clave ni etiqueta; queda la url desnuda`, args);
                return urls;
            }

            const params = {
                f: fieldName,
                p: '',
                l: 'NA',
                flhtp: 'UI',
                topic: topicArg || pageHelpTopic(),
                c: accountParam(),
                pt: 'RECORD',
                v: formIdParam(),
                tr: isTransactionParam(),
                ft: ftk ? '' : recordTitleParam(),
                ftk: ftk,
                fl: fl,
                flk: flk,
                NS_VER: nsVerParam(),
                ifrmcntnr: 'T'
            };

            const DEDUCED = ['v', 'tr', 'c', 'NS_VER'];
            const build = (p, skip) => {
                const qs = Object.keys(params)
                    .filter(k => skip.indexOf(k) === -1)
                    .map(k => [k, k === 'p' ? p : params[k]])
                    .filter(pair => pair[1] !== '' && pair[1] != null)
                    .map(pair => `${pair[0]}=${helpParam(pair[1])}`)
                    .join('&');
                return `/core/help/fieldhelp.nl?${qs}`;
            };

            const pages = pageNameCandidates();
            if (!pages.length) pages.push('');

            const learned = helpTemplates[helpTemplateKey()];
            if (learned) {
                const t = Object.assign({}, learned);
                t.f = fieldName;
                delete t.fl; delete t.flk;
                if (flk) t.flk = flk; else if (fl) t.fl = fl;
                const qs = Object.keys(t)
                    .filter(k => t[k] !== '' && t[k] != null)
                    .map(k => `${k}=${helpParam(t[k])}`)
                    .join('&');
                urls.push(`/core/help/fieldhelp.nl?${qs}`);
            }

            pages.forEach(p => {
                urls.push(build(p, []));
                urls.push(build(p, DEDUCED));
            });
            urls.push(build(pages[0], DEDUCED.concat(['topic', 'ft', 'ftk'])));

            return urls.filter((u, i) => urls.indexOf(u) === i);
        }

        function parseHelpDoc(html) {
            try { return new DOMParser().parseFromString(String(html), 'text/html'); }
            catch (e) { return null; }
        }

        const HELP_CONTAINERS = ['.field-help-popup-text', 'td.text', '.fieldhelp'];

        function lineaDelId(fieldName) {
            const id = String(fieldName || '').toLowerCase();
            return function (line) {
                if (!id) return false;
                const s = String(line || '');
                const at = s.toLowerCase().indexOf(id);
                if (at === -1) return false;
                const resto = (s.slice(0, at) + s.slice(at + id.length)).replace(/[\s:·|–—-]+/g, '');
                return resto.length <= 20;
            };
        }

        function helpTextFromContainers(doc, fieldName) {
            if (!doc) return '';
            const esDelId = lineaDelId(fieldName);
            for (let i = 0; i < HELP_CONTAINERS.length; i++) {
                const nodes = doc.querySelectorAll(HELP_CONTAINERS[i]);
                for (let j = 0; j < nodes.length; j++) {
                    if (nodes[j].querySelector('[href*="helpcenter.nl"], [onclick*="helpcenter.nl"]')) continue;
                    const t = (nodes[j].textContent || '').replace(/\s+/g, ' ').trim();
                    if (esDelId(t)) continue;
                    if (looksLikeHelp(t, 15)) return t;
                }
            }
            return '';
        }

        function helpInviteFromDoc(doc) {
            if (!doc) return null;
            for (let i = 0; i < HELP_CONTAINERS.length; i++) {
                const nodes = doc.querySelectorAll(HELP_CONTAINERS[i]);
                for (let j = 0; j < nodes.length; j++) {
                    const a = nodes[j].querySelector('[href*="helpcenter.nl"]');
                    if (!a) continue;
                    const t = (nodes[j].textContent || '').replace(/\s+/g, ' ').trim();
                    if (!looksLikeHelp(t, 15)) continue;
                    return { text: t, url: helpTopicUrl(a.getAttribute('href')) };
                }
            }
            return null;
        }

        function helpTopicUrl(href) {
            const h = String(href || '').trim();
            return /^\/app\/help\/helpcenter\.nl(\?|$)/i.test(h) ? h : '';
        }

        function respuestaMenciona(html, fieldName, hints) {
            const lower = String(html || '').toLowerCase();
            const senas = [String(fieldName)].concat(hints || [])
                .filter(s => s && String(s).trim().length > 3);
            return senas.some(s => lower.indexOf(String(s).toLowerCase()) !== -1);
        }

        function normalizaAyuda(t) {
            return String(t || '').replace(/\s+/g, ' ').trim().toLowerCase();
        }

        const _fillerCache = {};
        const _fillerPending = {};

        function helpFillerFor(fieldName, cb) {
            const fam = /^cust/i.test(String(fieldName)) ? 'cust' : 'std';
            if (Object.prototype.hasOwnProperty.call(_fillerCache, fam)) { cb(_fillerCache[fam]); return; }
            if (_fillerPending[fam]) { _fillerPending[fam].push(cb); return; }
            _fillerPending[fam] = [cb];

            const resolver = function (valor) {
                _fillerCache[fam] = valor;
                const cbs = _fillerPending[fam] || [];
                delete _fillerPending[fam];
                cbs.forEach(function (f) { try { f(valor); } catch (e) { } });
            };

            const sonda = fam === 'cust' ? 'custrecord_nsft_sonda_0' : 'nsftsonda0';
            const url = bareFieldHelpUrl(sonda);
            if (!url || typeof fetch !== 'function') { resolver(null); return; }
            fetch(url, { credentials: 'same-origin' })
                .then(function (r) { return r.ok ? r.text() : ''; })
                .then(function (html) { resolver(helpTextFromContainers(parseHelpDoc(html), sonda) || null); })
                .catch(function () { resolver(null); });
        }

        function extractHelpFromHtml(html, fieldName, hints) {
            if (!html) return '';

            if (!respuestaMenciona(html, fieldName, hints)) return '';

            let plain = '';
            try {
                const doc = new DOMParser().parseFromString(String(html), 'text/html');
                doc.querySelectorAll('script, style').forEach(n => n.remove());
                doc.querySelectorAll('[href*="helpcenter.nl"], [onclick*="helpcenter.nl"]').forEach(a => {
                    const holder = (a.closest && a.closest('p, div, td, li, span')) || a;
                    if (holder && holder.remove) holder.remove();
                });
                doc.querySelectorAll('br').forEach(br => br.replaceWith(doc.createTextNode('\n')));
                doc.querySelectorAll('p, div, tr, li, h1, h2, h3, h4, h5, h6, table')
                    .forEach(el => el.appendChild(doc.createTextNode('\n')));
                plain = doc.body ? (doc.body.textContent || '') : '';
            } catch (e) {
                plain = stripTags(String(html)
                    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
                    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
                    .replace(/<\/(p|div|tr|li|h[1-6])>/gi, '\n')
                    .replace(/<br\s*\/?>/gi, '\n'));
            }

            const esLineaDelId = lineaDelId(fieldName);

            return plain
                .split('\n')
                .map(s => s.replace(/[ \t ]+/g, ' ').trim())
                .filter(Boolean)
                .filter(l => !esLineaDelId(l))
                .filter(l => looksLikeHelp(l, 20, fieldName))
                .join('\n')
                .trim();
        }

        function helpHints(fieldName) {
            const anchor = findHelpAnchor(fieldName);
            const label = anchor ? (anchor.innerText || anchor.textContent || '').trim() : '';
            return label ? [label] : [];
        }

        function fetchFieldHelpPage(fieldName, cb) {
            if (Object.prototype.hasOwnProperty.call(_fieldHelpCache, fieldName)) {
                const c = _fieldHelpCache[fieldName];
                cb(c.text, c.url, c.generic, c.topic);
                return;
            }

            const urls = buildFieldHelpUrls(fieldName);
            if (!urls.length || typeof fetch !== 'function') { cb('', '', false, ''); return; }

            const done = function (text, url, generic, topic) {
                _fieldHelpCache[fieldName] = {
                    text: text || '', url: url || '', generic: !!generic, topic: topic || ''
                };
                const c = _fieldHelpCache[fieldName];
                cb(c.text, c.url, c.generic, c.topic);
            };

            const nativa = nativeFieldHelpUrl(fieldName);
            const esLaNativa = (i) => i === 0 && !!nativa && urls[0] === nativa;

            const siguiente = function (i, url) {
                if (esLaNativa(i)) {
                    sfvDiag(`[NSFT SFV] ayuda "${fieldName}": la url de NetSuite no trae texto; el campo no tiene ayuda`, url);
                    done('', url, false);
                    return;
                }
                attempt(i + 1, url);
            };

            const attempt = function (i, lastUrl) {
                if (i >= urls.length) {
                    sfvDiag(`[NSFT SFV] ayuda "${fieldName}": ninguna de estas urls trajo texto`, urls);
                    done('', lastUrl, true);
                    return;
                }
                const url = urls[i];

                fetch(url, { credentials: 'same-origin' })
                    .then(function (r) { return r.ok ? r.text() : null; })
                    .then(function (html) {
                        if (html === null) { attempt(i + 1, url); return; }

                        const hints = helpHints(fieldName);
                        const doc = parseHelpDoc(html);
                        const directo = helpTextFromContainers(doc, fieldName);
                        const invita = helpInviteFromDoc(doc);

                        if (esLaNativa(i)) {
                            if (directo) { done(directo, url, false); return; }
                            if (invita) { done(invita.text, url, false, invita.url); return; }
                            done(extractHelpFromHtml(html, fieldName, hints) || '', url, false);
                            return;
                        }

                        if (directo && respuestaMenciona(html, fieldName, hints)) {
                            done(directo, url, false);
                            return;
                        }

                        const heuristica = function () {
                            const text = extractHelpFromHtml(html, fieldName, hints);
                            if (text) { done(text, url, false); return; }
                            siguiente(i, url);
                        };

                        if (!directo) {
                            if (invita) { done(invita.text, url, false, invita.url); return; }
                            heuristica();
                            return;
                        }

                        helpFillerFor(fieldName, function (relleno) {
                            if (relleno === null) { heuristica(); return; }
                            if (normalizaAyuda(relleno) === normalizaAyuda(directo)) {
                                sfvDiag(`[NSFT SFV] ayuda "${fieldName}": la respuesta es el relleno de «sin ayuda»`, url);
                                siguiente(i, url);
                                return;
                            }
                            done(directo, url, false);
                        });
                    })
                    .catch(function (e) {
                        sfvDiagWarn('[NSFT SFV] fieldhelp.nl falló', e);
                        attempt(i + 1, url);
                    });
            };

            attempt(0, '');
        }

        function loadFieldHistory(fieldName) {
            const list = document.getElementById(NSFT.AUDIT_LIST);
            if (!list) return;

            list.innerHTML = `<div class="nsft-fav-loading">${escapeHtml(translations.fav_loading || 'Cargando historial…')}</div>`;

            let recordType = '';
            let recordId = '';
            try {
                if (typeof nlapiGetRecordType === 'function') recordType = String(nlapiGetRecordType() || '');
                if (typeof nlapiGetRecordId === 'function') recordId = String(nlapiGetRecordId() || '');
            } catch (_) { }

            if (!recordType || !recordId) {
                list.innerHTML = `<div class="nsft-fav-empty">${escapeHtml(translations.fav_no_history || 'Sin cambios registrados')}</div>`;
                return;
            }

            if (typeof require !== 'function') {
                list.innerHTML = `<div class="nsft-fav-error">${escapeHtml(translations.fav_error || 'No se pudo cargar el historial')}</div>`;
                return;
            }

            const cacheKey = recordId + '::' + fieldName;
            if (_auditCache.has(cacheKey)) {
                renderFieldHistory(_auditCache.get(cacheKey));
                return;
            }

            const fieldLabel = readFieldLabel(fieldName);

            const T = window.NSFT_SQL;
            if (!T) {
                list.innerHTML = `<div class="nsft-fav-error">${escapeHtml(translations.fav_error || 'No se pudo cargar el historial')}</div>`;
                return;
            }

            const fidUpper = String(fieldName || '').toUpperCase();
            const isCustom = /^cust/i.test(fieldName || '');
            let rectypeParam = null;
            try {
                const rt = new URLSearchParams(window.location.search).get('rectype');
                if (rt && /^\d+$/.test(rt)) rectypeParam = Number(rt);
            } catch (_) { }

            const build = function (inline) {
                const params = [];
                const P = function (v) {
                    if (inline) return (typeof v === 'number') ? String(v) : T.lit(v);
                    params.push(v);
                    return '?';
                };
                const recCond = 'recordid = ' + P(Number(recordId));
                let fieldCond;
                if (isCustom) {
                    fieldCond = 'UPPER(field) = ' + P(fidUpper);
                } else {
                    fieldCond = '(LOWER(BUILTIN.DF(field)) = ' + P(String(fieldLabel || '').toLowerCase()) +
                        ' OR UPPER(field) LIKE ' + P('%.S' + fidUpper) +
                        ' OR UPPER(field) LIKE ' + P('%.' + fidUpper) + ')';
                }
                const typeCond = (rectypeParam !== null) ? (' AND recordtypeid = ' + P(rectypeParam)) : '';
                const sql = `
                    SELECT
                        BUILTIN.DF(name)  AS changedby,
                        TO_CHAR(date, 'YYYY-MM-DD HH24:MI') AS changedate,
                        oldvalue,
                        newvalue,
                        type,
                        field               AS fieldid,
                        BUILTIN.DF(field)   AS fieldname,
                        BUILTIN.DF(context) AS changecontext
                    FROM systemnote
                    WHERE ${recCond} AND ${fieldCond}${typeCond}
                    ORDER BY date DESC
                `;
                return { sql: sql, params: params };
            };

            const bound = build(false);
            const inlined = build(true);

            const onFail = function (e) {
                console.warn('NSFT field audit SuiteQL error', e);
                const msg = (e && e.message) ? e.message : String(e);
                const isPerm = /permission|insufficient/i.test(msg);
                const base = isPerm
                    ? (translations.fav_error_permission || 'Tu rol no tiene acceso al historial de cambios')
                    : (translations.fav_error || 'No se pudo cargar el historial');
                list.innerHTML = `<div class="nsft-fav-error">${escapeHtml(base)}${isPerm ? '' : '<br><small>' + escapeHtml(msg) + '</small>'}</div>`;
            };

            T.run({
                rest: inlined.sql,
                sql: bound.sql,
                params: bound.params,
                limit: 1000
            }, function (err, rows) {
                if (err) { onFail(err); return; }
                const filtered = filterRowsByField(rows || [], fieldName, fieldLabel);
                _auditCache.set(cacheKey, filtered);
                renderFieldHistory(filtered);
            });
        }

        function filterRowsByField(rows, fieldName, fieldLabel) {
            const fid = String(fieldName || '').toLowerCase();
            const fidUpper = fid.toUpperCase();
            const labelLower = String(fieldLabel || '').toLowerCase();

            return rows.filter((r) => {
                const fname = String(r.fieldname == null ? '' : r.fieldname).toLowerCase();
                const fidRaw = String(r.fieldid == null ? '' : r.fieldid).toUpperCase();

                if (fidRaw === fidUpper) return true;

                if (labelLower && fname === labelLower) return true;

                if (fidRaw.includes('.')) {
                    const suffix = fidRaw.split('.').pop();
                    if (suffix === 'S' + fidUpper) return true;
                    if (suffix === fidUpper) return true;
                }

                return false;
            });
        }

        function renderFieldHistory(rows) {
            const list = document.getElementById(NSFT.AUDIT_LIST);
            if (!list) return;
            rows = rows || [];
            if (!rows.length) {
                list.innerHTML = `<div class="nsft-fav-empty">${escapeHtml(translations.fav_no_history || 'Sin cambios registrados')}</div>`;
                return;
            }

            const users = [...new Set(rows.map(r => String(r.changedby || '')).filter(Boolean))].sort();
            const allLbl = translations.fav_filter_all || 'Todos';
            const userOpts = `<option value="">${escapeHtml(allLbl)}</option>` +
                users.map(u => `<option value="${escapeHtml(u)}">${escapeHtml(u)}</option>`).join('');
            const filtersHtml = rows.length ? `
                <div class="nsft-fav-filters">
                    <select class="nsft-fav-filter-user" title="${escapeHtml(translations.fav_filter_user || 'Usuario')}">${userOpts}</select>
                    <input type="date" class="nsft-fav-filter-from" title="${escapeHtml(translations.fav_filter_from || 'Desde')}">
                    <input type="date" class="nsft-fav-filter-to" title="${escapeHtml(translations.fav_filter_to || 'Hasta')}">
                </div>` : '';

            let rowsBox = null;
            animarAlto(function () {
                list.innerHTML = filtersHtml + `<div class="nsft-fav-rows"></div>`;
                rowsBox = list.querySelector('.nsft-fav-rows');
                renderAuditRows(rowsBox, rows);
            });

            const userSel = list.querySelector('.nsft-fav-filter-user');
            const fromInp = list.querySelector('.nsft-fav-filter-from');
            const toInp = list.querySelector('.nsft-fav-filter-to');
            if (userSel || fromInp || toInp) {
                const apply = () => {
                    const u = userSel ? userSel.value : '';
                    const from = fromInp ? fromInp.value : '';
                    const to = toInp ? toInp.value : '';
                    const filtered = rows.filter(r => {
                        if (u && String(r.changedby || '') !== u) return false;
                        const d = String(r.changedate || '').slice(0, 10);
                        if (from && d && d < from) return false;
                        if (to && d && d > to) return false;
                        return true;
                    });
                    renderAuditRows(rowsBox, filtered);
                };
                [userSel, fromInp, toInp].forEach(el => el && el.addEventListener('change', apply));
            }
        }

        function diffHighlight(a, b) {
            a = a || '';
            b = b || '';
            if (a === b) return { oldHtml: escapeHtml(a || '—'), newHtml: escapeHtml(b || '—') };
            let start = 0;
            const minLen = Math.min(a.length, b.length);
            while (start < minLen && a[start] === b[start]) start++;
            let endA = a.length, endB = b.length;
            while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) { endA--; endB--; }
            const wrap = (full, s, e, cls) => {
                const mid = escapeHtml(full.slice(s, e));
                return escapeHtml(full.slice(0, s)) + (mid ? `<span class="${cls}">${mid}</span>` : '') + escapeHtml(full.slice(e));
            };
            return {
                oldHtml: a ? wrap(a, start, endA, 'nsft-fav-diff-del') : escapeHtml('—'),
                newHtml: b ? wrap(b, start, endB, 'nsft-fav-diff-add') : escapeHtml('—')
            };
        }

        const FAV_COPY_ICON = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" style="width:12px;height:12px;"><path d="M7 3.5A1.5 1.5 0 018.5 2h3.879a1.5 1.5 0 011.06.44l3.122 3.12A1.5 1.5 0 0117 6.622V12.5a1.5 1.5 0 01-1.5 1.5h-1v-3.379a3 3 0 00-.879-2.121L10.5 5.379A3 3 0 008.379 4.5H7v-1z" /><path d="M4.5 6A1.5 1.5 0 003 7.5v9A1.5 1.5 0 004.5 18h7a1.5 1.5 0 001.5-1.5v-5.879a1.5 1.5 0 00-.44-1.06L9.44 6.439A1.5 1.5 0 008.378 6H4.5z" /></svg>';

        function renderAuditRows(box, rows) {
            if (!box) return;
            if (!rows.length) {
                box.innerHTML = `<div class="nsft-fav-empty">${escapeHtml(translations.fav_no_history || 'Sin cambios registrados')}</div>`;
                return;
            }
            const oldLbl = translations.fav_old_value || 'Antes';
            const newLbl = translations.fav_new_value || 'Despu\u00e9s';
            const copyTip = translations.fav_copy_change || 'Copiar cambio';
            box.innerHTML = rows.map((r) => {
                const oldRaw = (r.oldvalue == null || r.oldvalue === '') ? '' : String(r.oldvalue);
                const newRaw = (r.newvalue == null || r.newvalue === '') ? '' : String(r.newvalue);
                const diff = diffHighlight(oldRaw, newRaw);
                const ctx = (r.changecontext == null || r.changecontext === '') ? '' : String(r.changecontext);
                const copyText = `${r.changedate || ''} \u00b7 ${r.changedby || ''}${ctx ? ' \u00b7 ' + ctx : ''}\n${oldRaw || '\u2014'} \u2192 ${newRaw || '\u2014'}`;
                return `
                <div class="nsft-fav-row">
                    <div class="nsft-fav-meta">
                        <span class="nsft-fav-when">${escapeHtml(r.changedate || '')}</span>
                        <span class="nsft-fav-who" ${ctx ? `title="${escapeHtml(ctx)}"` : ''}>${escapeHtml(r.changedby || '')}${ctx ? ` <span class="nsft-fav-ctx">· ${escapeHtml(ctx)}</span>` : ''}</span>
                        <span class="nsft-fav-copy" role="button" tabindex="0" title="${escapeHtml(copyTip)}" data-copy="${escapeHtml(copyText)}">${FAV_COPY_ICON}</span>
                    </div>
                    <div class="nsft-fav-line nsft-fav-line-old">
                        <span class="nsft-fav-tag">${escapeHtml(oldLbl)}</span>
                        <span class="nsft-fav-val">${diff.oldHtml}</span>
                    </div>
                    <div class="nsft-fav-line nsft-fav-line-new">
                        <span class="nsft-fav-tag">${escapeHtml(newLbl)}</span>
                        <span class="nsft-fav-val">${diff.newHtml}</span>
                    </div>
                </div>`;
            }).join('');

            box.querySelectorAll('.nsft-fav-copy').forEach(el => {
                el.addEventListener('click', () => {
                    const text = el.dataset.copy || '';
                    try {
                        if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text);
                    } catch (_) { }
                    el.classList.add('nsft-fav-copied');
                    setTimeout(() => el.classList.remove('nsft-fav-copied'), 900);
                });
            });
        }


        function extractLinkFromSync(fieldName) {
            try {
                const syncFn = window.eval("Sync" + fieldName);
                if (!syncFn) return "";
                const str = syncFn.toString();
                const idx = str.indexOf("nlOpenWindow(");
                if (idx > 0) {
                    const b = str.indexOf("nlOpenWindow(");
                    if (b > 0) {
                        const c = str.indexOf("'", b + 15);
                        const e = str.substring(b + 14, c);
                        return e.replace("target", "target_");
                    }
                }
            } catch (e) { }
            return "";
        }


        const LIST_PAGE = 200;

        const LIST_TARGETS = {
            item: { table: "item" },
            custjob: { table: "customer" },
            customer: { table: "customer" },
            vendor: { table: "vendor" },
            contact: { table: "contact" },
            partner: { table: "partner" },
            entity: { table: "entity" },
            employee: { table: "employee", text: "entityid" },
            task: { table: "task", text: "title" },
            event: { table: "calendarevent", text: "title" },
            calendarevent: { table: "calendarevent", text: "title" },
            call: { table: "phonecall", text: "title" },
            phonecall: { table: "phonecall", text: "title" },
            campaign: { table: "campaign", text: "title" },
            account: { table: "account" },
            currency: { table: "currency", text: "name" },
            subsidiary: { table: "subsidiary" },
            subsidiarytype: { table: "subsidiary" },
            department: { table: "department" },
            departmenttype: { table: "department" },
            location: { table: "location" },
            locationtype: { table: "location" },
            class: { table: "classification" },
            classtype: { table: "classification" },
            transaction: { table: "transaction", text: "trandisplayname", heavy: true, noFold: true },
            mediaitem: { table: "file", text: "name", heavy: true, noFold: false },
            media: { table: "file", text: "name", heavy: true, noFold: false },
            mediaitemfolder: { table: "mediaitemfolder", text: "name" }
        };

        const TRANSACTION_PATH_RE = /\/accounting\/transactions\//i;

        const LENTA_MS = 2500;
        const _pesadas = Object.create(null);

        const LIST_TEXT_COLS = ["fullname", "name", "entityid", "title", "trandisplayname"];

        const IDENT_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

        const FAMILIA_TIPO = {
            checkbox: "checkbox",
            date: "date",
            datetime: "datetime", datetimetz: "datetime",
            timeofday: "timeofday", time: "timeofday",
            select: "select", list: "select",
            multiselect: "multiselect",
            text: "text", freeformtext: "text",
            textarea: "textarea",
            longtext: "longtext", clobtext: "longtext",
            richtext: "richtext",
            inlinehtml: "html", html: "html",
            percent: "percent",
            currency: "currency",
            float: "float", decimalnumber: "float", decimal: "float",
            integer: "integer", integernumber: "integer",
            email: "email", emailaddress: "email",
            phone: "phone", phonenumber: "phone",
            url: "url", hyperlink: "url",
            image: "image",
            file: "file", document: "file",
            password: "password",
            radio: "radio"
        };

        function nombreDelTipo(bruto) {
            const crudo = String(bruto == null ? "" : bruto);
            if (!crudo) return "";
            const norm = crudo.toLowerCase().replace(/[^a-z0-9]/g, "");
            const familia = FAMILIA_TIPO[norm];
            const textos = translations.sfv_ftypes || {};
            return (familia && textos[familia]) || crudo;
        }

        function readFieldType(fieldName) {
            const enVista = esVista(fieldName);
            if (enVista) {
                try {
                    const w = window.document.querySelector(
                        '[data-field-name="' + fieldName + '"][data-field-type]');
                    const tp = w && w.getAttribute("data-field-type");
                    if (tp) return String(tp);
                } catch (e) { }
            }
            try {
                if (typeof nlapiGetField === "function") {
                    const fld = nlapiGetField(fieldName);
                    const tp = fld && (fld.type || (typeof fld.getType === "function" ? fld.getType() : ""));
                    if (tp) return String(tp);
                }
            } catch (e) { }
            try {
                const w = window.document.querySelector(
                    '[data-field-name="' + fieldName + '"][data-field-type]');
                const tp = w && w.getAttribute("data-field-type");
                if (tp) return String(tp);
            } catch (e) { }
            return "";
        }

        function readDisplayType(fieldName) {
            try {
                if (esVista(fieldName)) return "";
                const w = window.document.querySelector(
                    '[data-field-name="' + fieldName + '"]');
                if (!w) return "hidden";
                if (typeof nlapiGetField === "function") {
                    const fld = nlapiGetField(fieldName);
                    if (fld && fld.disabled) return "disabled";
                }
                const fs_ = window.document.getElementById(fieldName + "_fs");
                if (!fs_) return "inline";
                const campo = w.querySelector(".uir-field");
                if (campo && /(^|\s)inputreadonly(\s|$)/.test(campo.className || "")) return "inline";
                return "normal";
            } catch (e) { }
            return "";
        }

        function readFieldLabel(fieldName) {
            try {
                if (typeof nlapiGetField === "function") {
                    const fld = nlapiGetField(fieldName);
                    if (fld && typeof fld.getLabel === "function") {
                        const l = String(fld.getLabel() || "");
                        if (l) return l;
                    }
                }
            } catch (e) { }
            try {
                const w = window.document.querySelector(
                    '[data-field-name="' + fieldName + '"][data-nsps-label]');
                const l = w && w.getAttribute("data-nsps-label");
                if (l) return String(l);
            } catch (e) { }
            try {
                const lbl = window.document.getElementById(fieldName + "_fs_lbl");
                if (lbl) return String(lbl.textContent || "").trim();
            } catch (e) { }
            return "";
        }

        function readListKind(fieldName) {
            const vale = function (k) {
                return (k === "select" || k === "popupselect" || k === "multiselect" || k === "file") ? k : "";
            };
            try {
                const fs_ = window.document.getElementById(fieldName + "_fs");
                const k = vale(fs_ && fs_.getAttribute("data-fieldtype"));
                if (k) return k;
                const w = window.document.querySelector(
                    '[data-field-name="' + fieldName + '"][data-field-type]');
                return vale(w && w.getAttribute("data-field-type"));
            } catch (e) { }
            return "";
        }

        function desescaparUrl(s) {
            return String(s || "")
                .replace(/\\x([0-9a-fA-F]{2})/g, function (_, hex) {
                    return String.fromCharCode(parseInt(hex, 16));
                })
                .replace(/\\(.)/g, "$1");
        }

        function urlDentroDeJavascript(h) {
            const m = String(h || "").match(/['"]([^'"]*\.nl[^'"]*)['"]/i);
            return m ? desescaparUrl(m[1]) : "";
        }

        function viewLinkUrl(fieldName) {
            try {
                const w = window.document.querySelector(
                    '[data-field-name="' + fieldName + '"]');
                if (!w) return "";
                const enlaces = w.querySelectorAll("a[href]");
                for (let i = 0; i < enlaces.length; i++) {
                    let h = enlaces[i].getAttribute("href") || "";
                    if (/^javascript:/i.test(h)) {
                        h = urlDentroDeJavascript(h);
                        if (!h) continue;
                    }
                    if (/[.]nl/i.test(h) && /[?&]id=/i.test(h)) {
                        let base = h.split("?")[0];
                        base = base.replace(/\/core\/media\/media[.]nl$/i,
                                            "/app/common/media/mediaitem.nl");

                        const rt = h.match(/[?&](rectype=[0-9]+)/i);
                        return base + "?" + (rt ? rt[1] : "");
                    }
                }
            } catch (e) { }
            return "";
        }

        function resolveListTarget(linkUrl) {
            const u = String(linkUrl || "");
            if (!u) return null;
            if (TRANSACTION_PATH_RE.test(u)) {
                const tr = LIST_TARGETS.transaction;
                return { table: tr.table, text: tr.text, heavy: true, noFold: true };
            }
            const m = u.match(/([A-Za-z0-9_]+)[.]nl/);
            if (!m) return null;
            const page = m[1].toLowerCase();
            if (page === "custrecordentry") {
                const r = u.match(/rectype=([0-9]+)/);
                return r ? { rectype: r[1] } : null;
            }
            const hit = LIST_TARGETS[page];
            const tabla = hit ? hit.table : page;
            if (!IDENT_RE.test(tabla)) return null;
            const pesada = !!(hit && hit.heavy) || !!_pesadas[tabla];
            const noFold = (hit && hit.noFold != null) ? !!hit.noFold : pesada;
            return { table: tabla, text: (hit && hit.text) || LIST_TEXT_COLS[0], heavy: pesada, noFold: noFold };
        }

        function optionTextHtml(text, term) {
            const s = String(text == null ? "" : text);
            const TS = window.NSFT_TextSearch;
            if (term && TS && TS.markHtml) {
                try { return TS.markHtml(s, term, "nsft-sfv-list-hl"); } catch (e) { }
            }
            return escapeHtml(s);
        }

        function optionRowsHtml(opts, fieldValue, linkUrl, fieldName, sidArg, lineArg, term) {
            let html = "";
            for (let i = 0; i < opts.length; i++) {
                if (!opts[i] || !opts[i].value) continue;
                const isSelected = (opts[i].value == fieldValue);

                const partes = String(opts[i].text == null ? "" : opts[i].text).split(" : ");
                const hoja = partes[partes.length - 1];
                const camino = partes.length > 1 ? partes.slice(0, -1).join(" › ") : "";

                let recordLinkHtml = "";
                if (linkUrl) {
                    const sep = linkUrl.includes("?") ? "&" : "?";
                    let hrefVal = linkUrl + sep + "id=" + opts[i].value;
                    if (linkUrl.includes("id=")) {
                        hrefVal = linkUrl.replace(/id=[0-9]*/, "id=" + opts[i].value);
                    }
                    recordLinkHtml = `<a class="nsft-sfv-opt-ext" href="${escapeHtml(hrefVal)}" target="_blank"
                                         title="${escapeHtml(translations.sfv_open_record || "")}"
                                         aria-label="${escapeHtml(translations.sfv_open_record || "")}">
                                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
                                            <path stroke-linecap="round" stroke-linejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                                        </svg>
                                    </a>`;
                }

                html += `<div class="nsft-sfv-opt" role="option" aria-selected="${isSelected}">
                            <span class="nsft-sfv-opt-id">${escapeHtml(String(opts[i].value))}</span>
                            <span class="nsft-sfv-opt-txt">${camino ? `<span class="nsft-sfv-opt-path">${optionTextHtml(camino, term)}</span>` : ""}<span class="nsft-sfv-opt-leaf">${optionTextHtml(hoja, term)}</span>
                            </span>
                            <span class="nsft-sfv-opt-act">
                                ${recordLinkHtml}
                                <a class="nsft-sfv-opt-set" href="javascript:void(0)"
                                   onclick="javascript:window.parent.NSFT_SetFieldValues.setValueFromList('${escapeJsString(fieldName)}', '${escapeJsString(String(opts[i].value))}', '${escapeJsString(String(opts[i].text == null ? "" : opts[i].text))}', ${sidArg}, ${lineArg})">
                                   ${translations.sfv_set}
                                </a>
                            </span>
                         </div>`;
            }
            return html;
        }
        function listSlotHtml(linkUrl) {
            return `<div id="${NSFT.LIST_SLOT}" class="nsft-sfv-list-slot">
                        <div class="nsft-sfv-list-head">
                            <span class="nsft-sfv-list-title">${escapeHtml(translations.sfv_list || "List")}:</span>
                            <span id="${NSFT.LIST_COUNT}" class="nsft-sfv-list-count"></span>
                            <span class="nsft-sfv-list-spacer"></span>
                            ${listOpenLinkHtml(linkUrl)}
                        </div>
                        <div class="nsft-sfv-list-barwrap">
                        <div id="${NSFT.LIST_BAR}" class="nsft-sfv-bar nsft-sfv-list-bar">
                            <input type="text" id="${NSFT.LIST_SEARCH}" class="nsft-sfv-field nsft-sfv-list-search"
                                   placeholder="${escapeHtml(translations.sfv_list_search || "")}" autocomplete="off">
                            <button type="button" id="${NSFT.LIST_CLEAR}" class="nsft-sfv-list-clear"
                                    title="${escapeHtml(translations.sfv_find_clear || "")}"
                                    aria-label="${escapeHtml(translations.sfv_find_clear || "")}">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>
                            </button>
                            <button type="button" id="${NSFT.LIST_GO}" class="nsft-sfv-list-go"
                                    title="${escapeHtml(translations.sfv_list_search || "")}"
                                    aria-label="${escapeHtml(translations.sfv_list_search || "")}">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>
                            </button>
                        </div>
                        </div>
                        
                        <div class="nsft-sfv-list-scroll">
                            <div id="${NSFT.LIST_BODY}" class="nsft-sfv-optlist" role="listbox"></div>
                        </div>
                        <div id="${NSFT.LIST_FOOT}" class="nsft-sfv-list-foot">${escapeHtml(translations.sfv_list_loading || "")}</div>
                     </div>`;
        }

        function listOpenUrl(linkUrl) {
            if (!linkUrl) return "";
            const urlParts = String(linkUrl).split("?");
            let listBase = urlParts[0].replace(/[.]nl$/, "list.nl");
            const NATIVE_TYPELIST_RE = /(department|class|location|subsidiary)typelist[.]nl$/;
            const isNativeTypelist = NATIVE_TYPELIST_RE.test(listBase);
            if (isNativeTypelist) listBase = listBase.replace(NATIVE_TYPELIST_RE, "$1list.nl");
            if (isNativeTypelist) return listBase;
            let resolved = listBase + "?";
            if (urlParts.length > 1) {
                const cleaned = urlParts[1].split("&").filter(p => !p.startsWith("id=")).join("&");
                if (cleaned) resolved += cleaned;
            }
            return resolved;
        }

        function listOpenIconHtml(linkUrl) {
            const url = listOpenUrl(linkUrl);
            if (!url) return "";
            return `<a href="${escapeHtml(url)}" target="_blank" class="nsft-badge nsft-sfv-goto"
                       title="${escapeHtml(translations.sfv_go_to_source_list || "")}"
                       aria-label="${escapeHtml(translations.sfv_go_to_source_list || "")}">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.6" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                        </svg>
                    </a>`;
        }

        function listOpenLinkHtml(linkUrl) {
            const resolved = listOpenUrl(linkUrl);
            if (!resolved) return "";
            return `<a href="${escapeHtml(resolved)}" target="_blank" class="nsft-sfv-list-open"
                       title="${escapeHtml(translations.sfv_go_to_source_list || "")}">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" d="M8.25 6.75h12M8.25 12h12m-12 5.25h12M3.75 6.75h.007v.008H3.75V6.75zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zM3.75 12h.007v.008H3.75V12zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm-.375 5.25h.007v.008H3.75v-.008zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
                        </svg>
                        ${escapeHtml(translations.sfv_go_to_source_list || "")}
                    </a>`;
        }

        let _listCtx = null;

        let _listMemo = null;

        function fillListSlot(fieldName, fieldValue, linkUrl, sublistId, linenum, domOpts) {
            const slot = document.getElementById(NSFT.LIST_SLOT);
            if (!slot) { _listCtx = null; return; }
            const target = domOpts ? null : resolveListTarget(linkUrl);
            if (!domOpts && !target) { _listCtx = null; return; }

            _listCtx = {
                fieldName: fieldName,
                fieldValue: fieldValue,
                linkUrl: linkUrl,
                sidArg: sublistId ? ("'" + escapeJsString(sublistId) + "'") : "null",
                lineArg: (linenum != null) ? String(linenum) : "null",
                target: target,
                domOpts: domOpts || null,
                seq: 0
            };

            const box = document.getElementById(NSFT.LIST_SEARCH);
            const bar = document.getElementById(NSFT.LIST_BAR);
            const marcarBar = function () {
                if (bar) bar.classList.toggle("has-query", !!(box && box.value));
            };
            if (box) {
                const buscar = function () { runListQuery(box.value); };
                const limpiar = function () {
                    box.value = "";
                    marcarBar();
                    box.focus();
                    runListQuery("");
                };
                box.addEventListener("input", marcarBar);
                box.addEventListener("keydown", function (e) {
                    if (e.key === "Enter") { e.preventDefault(); buscar(); }
                    if (e.key === "Escape" && box.value) { e.preventDefault(); e.stopPropagation(); limpiar(); }
                });
                const clr = document.getElementById(NSFT.LIST_CLEAR);
                if (clr) clr.addEventListener("click", limpiar);
                const go = document.getElementById(NSFT.LIST_GO);
                if (go) go.addEventListener("click", buscar);
            }

            if (domOpts) { runListQuery(box ? box.value : ""); return; }

            if (_listMemo && _listMemo.fieldName === fieldName) {
                if (box) { box.value = _listMemo.term || ""; marcarBar(); }
                _listCtx.target = _listMemo.target || _listCtx.target;
                paintListRows(_listMemo.rows || [], _listMemo.term || "");
                return;
            }
            _listMemo = null;

            if (target.rectype) {
                const T = window.NSFT_SQL;
                if (!T) { setListFoot(translations.sfv_list_error, true); return; }
                const q = "SELECT scriptid FROM customrecordtype WHERE internalid = " + T.lit(String(target.rectype));
                T.run({ rest: q, sql: q + " FETCH FIRST 2 ROWS ONLY", limit: 2 }, function (err, res) {
                    if (err || !res || !res.length || !res[0].scriptid) {
                        setListFoot(translations.sfv_list_error, true);
                        return;
                    }
                    target.table = String(res[0].scriptid).toLowerCase();
                    target.text = LIST_TEXT_COLS[0];
                    delete target.rectype;
                    runListQuery("");
                });
                return;
            }
            runListQuery("");
        }

        function refreshValueInPlace(fieldName, value, text) {
            const ctx = _listCtx;

            const vs = document.getElementById(NSFT.VALUE_SLOT);
            if (vs) {
                const link = ctx && ctx.linkUrl;
                const val = String(value == null ? "" : value);
                vs.innerHTML = "<b>" + (val
                    ? (link
                        ? '<a href="' + escapeHtml(link) + "&id=" + encodeURIComponent(val) + '" target="_blank">' + escapeHtml(val) + "</a>"
                        : escapeHtml(val))
                    : "<em>(null)</em>") + "</b>";
            }

            const tr = document.getElementById(NSFT.TEXT_ROW);
            const ts = document.getElementById(NSFT.TEXT_SLOT);
            if (tr && ts) {
                const txt = String(text == null ? "" : text);
                if (txt) { ts.innerHTML = escapeHtml(txt); tr.hidden = false; }
                else { ts.innerHTML = ""; tr.hidden = true; }
            }

            const body = document.getElementById(NSFT.LIST_BODY);
            if (body && ctx) {
                ctx.fieldValue = value;
                const marca = "background-color: var(--nsft-sfv-accent-selected); font-weight:bold;";
                const filas = body.getElementsByTagName("tr");
                for (let i = 0; i < filas.length; i++) {
                    const celda = filas[i].cells && filas[i].cells[0];
                    const esta = celda && String(celda.textContent).trim() == String(value);
                    filas[i].setAttribute("style", esta ? marca : "");
                }
            }
        }

        function marcarGuardando(on) {
            try {
                const body = document.getElementById(NSFT.CONTENT);
                if (body) body.style.opacity = on ? "0.55" : "";
                const foot = document.getElementById(NSFT.LIST_FOOT);
                if (foot && on) foot.textContent = translations.sfv_view_saving || "";
            } catch (e) { }
        }

        function fillViewValue(vc, fieldName) {
            requestAnimationFrame(function () {
                setTimeout(function () {
                    if (!_lastRenderCtx || _lastRenderCtx.fieldName !== fieldName) return;
                    const v = lookupViewValue(vc, fieldName);
                    if (!v) return;
                    const txt = lookupViewText(vc, fieldName);
                    if (!_lastRenderCtx || _lastRenderCtx.fieldName !== fieldName) return;
                    try { refreshValueInPlace(fieldName, v, txt); }
                    catch (e) { }
                }, 0);
            });
        }

        let animAlto = null;

        function animarAltoModal(modal, cambiar) {
            if (!modal || modal.dataset.state === "minimised") { cambiar(); return; }

            if (animAlto) animAlto();

            let antes = 0;
            try { antes = modal.getBoundingClientRect().height; } catch (e) { }
            cambiar();
            if (!antes) return;

            let despues = 0;
            try { despues = modal.getBoundingClientRect().height; } catch (e) { }
            if (!despues || Math.abs(despues - antes) < 2) return;

            modal.style.height = antes + "px";
            void modal.offsetHeight;
            modal.classList.add("nsft-sfv-h-anim");
            modal.style.height = despues + "px";

            let hecho = false;
            let reloj = 0;
            const fin = function () {
                if (hecho) return;
                hecho = true;
                if (reloj) clearTimeout(reloj);
                if (animAlto === fin) animAlto = null;
                modal.classList.remove("nsft-sfv-h-anim");
                modal.style.height = "";
                modal.removeEventListener("transitionend", alTerminar);
                try { fitModalInViewport(); } catch (e) { }
            };
            const alTerminar = function (e) {
                if (!e || e.propertyName === "height") fin();
            };
            modal.addEventListener("transitionend", alTerminar);
            reloj = setTimeout(fin, 400);
            animAlto = fin;
        }

        function animarAlto(cambiar) {
            animarAltoModal(document.getElementById(NSFT.MODAL), cambiar);
        }

        function refrescarVisualizacion(fieldName) {
            const slot = document.getElementById(NSFT.DISPLAY_SLOT);
            if (!slot) return;
            const visual = readDisplayType(fieldName);
            slot.textContent = visual ? (translations["sfv_display_" + visual] || visual) : "";
        }

        function pintarBotonAyuda() {
            const btn = document.querySelector("#" + NSFT.MODAL + " .nsft-sfv-helpbtn");
            if (!btn) return;
            const hay = !!document.querySelector("#" + NSFT.MODAL + " .nsft-sfv-help");
            btn.hidden = !hay;
            if (!hay) return;
            btn.setAttribute("aria-expanded", String(!helpCollapsed));
            const lbl = btn.querySelector(".nsft-sfv-helpbtn-lbl");
            if (lbl) lbl.textContent = helpCollapsed
                ? (translations.sfv_help_show || "")
                : (translations.sfv_help_hide || "");
        }

        function recordarAltoDeValor() {
            if (activeTab !== "valor") return;
            const caja = document.querySelector("#" + NSFT.MODAL + " .nsft-sfv-content");
            if (!caja) return;
            let alto = 0;
            try { alto = caja.getBoundingClientRect().height; } catch (e) { }
            if (alto) altoDeValor = alto;
        }

        function aplicarTopeDeAlto() {
            const caja = document.querySelector("#" + NSFT.MODAL + " .nsft-sfv-content");
            if (!caja) return;
            if (activeTab !== "hist" || !altoDeValor) {
                caja.style.maxHeight = "";
                return;
            }
            caja.style.maxHeight = Math.max(altoDeValor, ALTO_MINIMO) + "px";
        }

        function pedirHistorialSiHaceFalta() {
            try {
                if (!document.getElementById(NSFT.AUDIT_LIST)) return;
                const campo = _lastRenderCtx && _lastRenderCtx.fieldName;
                if (!campo || histAutoPedido === campo) return;
                histAutoPedido = campo;
                loadFieldHistory(campo);
            } catch (e) { }
        }

        function setListFoot(text, isError) {
            const foot = document.getElementById(NSFT.LIST_FOOT);
            if (!foot) return;
            foot.textContent = text || "";
            foot.classList.toggle("is-error", !!isError);
        }

        function runListQuery(term) {
            const ctx = _listCtx;
            if (!ctx) return;

            if (ctx.domOpts) {
                const q = String(term || "").trim();
                const TS = window.NSFT_TextSearch;
                const filas = ctx.domOpts.filter(function (o) {
                    if (!o || !o.value) return false;
                    if (!q) return true;
                    const txt = String(o.text == null ? "" : o.text);
                    if (TS && TS.match) return TS.match(txt, q) || TS.match(String(o.value), q);
                    return (txt + " " + o.value).toUpperCase().indexOf(q.toUpperCase()) >= 0;
                }).map(function (o) { return { id: o.value, txt: o.text }; });
                paintListRows(filas, q);
                return;
            }

            const T = window.NSFT_SQL;
            if (!T) { setListFoot(translations.sfv_list_error, true); return; }

            const seq = ++ctx.seq;
            setListFoot(translations.sfv_list_loading, false);

            const q = String(term || "").trim();
            const cols = LIST_TEXT_COLS.slice(LIST_TEXT_COLS.indexOf(ctx.target.text));
            const usable = cols.length ? cols : LIST_TEXT_COLS;

            const intentar = function (i) {
                if (i >= usable.length) { setListFoot(translations.sfv_list_error, true); return; }
                const col = usable[i];
                if (!IDENT_RE.test(ctx.target.table) || !IDENT_RE.test(col)) {
                    setListFoot(translations.sfv_list_error, true);
                    return;
                }
                let where = "";
                if (q) {
                    const TS = window.NSFT_TextSearch;
                    if (!ctx.target.noFold && TS && TS.sqlFold && TS.sqlTerm) {
                        where = " WHERE " + TS.sqlFold(col) + " LIKE " + T.lit("%" + TS.sqlTerm(q) + "%");
                    } else {
                        where = " WHERE UPPER(" + col + ") LIKE " + T.lit("%" + q.toUpperCase() + "%");
                    }
                }
                const orden = ctx.target.heavy ? " ORDER BY id DESC" : (" ORDER BY " + col);
                const base = "SELECT id, " + col + " AS txt FROM " + ctx.target.table + where + orden;
                const t0 = Date.now();
                T.run({
                    rest: base,
                    sql: base + " FETCH FIRST " + LIST_PAGE + " ROWS ONLY",
                    limit: LIST_PAGE
                }, function (err, res) {
                    if (!err && (Date.now() - t0) > LENTA_MS && !ctx.target.heavy) {
                        _pesadas[ctx.target.table] = true;
                        ctx.target.heavy = true;
                        ctx.target.noFold = true;
                    }
                    if (seq !== ctx.seq) return;
                    if (err) {
                        intentar(i + 1);
                        return;
                    }
                    const rows = res || [];
                    ctx.target.text = col;
                    paintListRows(rows, q);
                });
            };
            intentar(0);
        }

        function paintListRows(rows, term) {
            const ctx = _listCtx;
            const body = document.getElementById(NSFT.LIST_BODY);
            if (!ctx || !body) return;
            const opts = rows.map(function (r) { return { value: r.id, text: r.txt }; });
            if (!ctx.domOpts) {
                _listMemo = { fieldName: ctx.fieldName, term: term || "", rows: rows, target: ctx.target };
            }
            animarAlto(function () {
                body.innerHTML = optionRowsHtml(opts, ctx.fieldValue, ctx.linkUrl, ctx.fieldName, ctx.sidArg, ctx.lineArg, term);
                pintarPieDeLista(opts, ctx, term);
            });
            recordarAltoDeValor();
        }

        function pintarPieDeLista(opts, ctx, term) {
            setListCount(opts.length);
            if (!opts.length) {
                setListFoot(term ? translations.sfv_list_none : translations.sfv_list_empty, false);
                return;
            }
            setListFoot((opts.length >= LIST_PAGE && !ctx.domOpts)
                ? String(translations.sfv_list_more || "").replace("{n}", String(LIST_PAGE))
                : "",
                false);
        }

        function setListCount(n) {
            const el = document.getElementById(NSFT.LIST_COUNT);
            if (!el) return;
            el.textContent = String(translations.sfv_list_count || "").replace("{n}", String(n));
        }

        function esVista(fieldName) {
            try {
                const w = window.document.querySelector(
                    '[data-field-name="' + fieldName + '"][data-mode]');
                const modo = w && w.getAttribute("data-mode");
                if (modo) return modo === "view";
                if (window.document.getElementById(fieldName + "_fs")) return false;
                const p = new URLSearchParams(window.location.search);
                return !(p.get("e") === "T" || !p.has("id"));
            } catch (e) { return false; }
        }

        function viewCtx(fieldName) {
            try {
                const p = new URLSearchParams(window.location.search);
                if (p.get("e") === "T" || !p.has("id")) return null;
                if (!esVista(fieldName)) return null;
                if (typeof nlapiSubmitField !== "function") return null;
                if (typeof nlapiGetRecordType !== "function") return null;
                if (typeof nlapiGetRecordId !== "function") return null;
                const tipo = String(nlapiGetRecordType() || "");
                const id = String(nlapiGetRecordId() || "");
                return (tipo && id) ? { tipo: tipo, id: id } : null;
            } catch (e) { return null; }
        }

        function lookupViewValue(vc, fieldName) {
            try {
                if (!vc || typeof nlapiLookupField !== "function") return "";
                const v = nlapiLookupField(vc.tipo, vc.id, fieldName);
                return (v == null) ? "" : String(v);
            } catch (e) { return ""; }
        }

        function lookupViewText(vc, fieldName) {
            try {
                if (!vc || typeof nlapiLookupField !== "function") return "";
                const v = nlapiLookupField(vc.tipo, vc.id, fieldName, true);
                return (v == null) ? "" : String(v);
            } catch (e) { return ""; }
        }

        function getFieldAttributesHtml(fieldName) {
            let html = "";
            fieldName = fieldName ? fieldName.trim() : "";
            try {
                const fld = nlapiGetField(fieldName);
                if (fld) {
                    html += `<div class="nsft-sfv-row">
                                <div style="display:flex; align-items:center;">
                                    <span class="nsft-sfv-label" style="margin-right:5px;">${translations.sfv_mandatory}:</span>
                                    <label class="nsft-switch" style="transform:scale(0.8); margin-left:0;">
                                        <input type="checkbox" ${fld.required ? 'checked' : ''} 
                                            onclick="window.parent.NSFT_SetFieldValues.setFieldRequired('${escapeJsString(fieldName)}', this.checked)">
                                        <span class="nsft-slider"></span>
                                    </label>
                                </div>

                                <div style="display:flex; align-items:center;">
                                    <span class="nsft-sfv-label" style="margin-right:5px;">${translations.sfv_disabled}:</span>
                                    <label class="nsft-switch" style="transform:scale(0.8); margin-left:0;">
                                        <input type="checkbox" ${fld.disabled ? 'checked' : ''} 
                                            onclick="window.parent.NSFT_SetFieldValues.setFieldDisabled('${escapeJsString(fieldName)}', this.checked)">
                                        <span class="nsft-slider"></span>
                                    </label>
                                </div>
                             </div>`;
                }
            } catch (e) { console.warn('Error attrs', e); }
            return html;
        }

        function getLineItemAttributesHtml(fieldName, sublistId, linenum) {
            let html = "";
            fieldName = fieldName ? fieldName.trim() : "";
            try {
                const isDisabled = readLineItemDisabled(sublistId, fieldName, linenum);
                const lineArg = (linenum != null) ? String(linenum) : 'null';
                html += `<div class="nsft-sfv-row">
                            <div style="display:flex; align-items:center;">
                                <span class="nsft-sfv-label" style="margin-right:5px;">${translations.sfv_disabled}:</span>
                                <label class="nsft-switch" style="transform:scale(0.8); margin-left:0;">
                                    <input type="checkbox" ${isDisabled ? 'checked' : ''}
                                        onclick="window.parent.NSFT_SetFieldValues.setLineItemDisabled('${escapeJsString(sublistId)}', '${escapeJsString(fieldName)}', this.checked, ${lineArg})">
                                    <span class="nsft-slider"></span>
                                </label>
                            </div>
                         </div>`;
            } catch (e) { console.warn('Error line attrs', e); }
            return html;
        }

        const lineItemDisabledCache = {};
        function lineItemDisabledKey(sublistId, fieldName) {
            return (sublistId || '') + '::' + (fieldName || '');
        }
        function readLineItemDisabled(sublistId, fieldName, linenum) {
            const key = lineItemDisabledKey(sublistId, fieldName);
            if (lineItemDisabledCache[key] !== undefined) return lineItemDisabledCache[key];
            if (typeof nlapiIsLineItemDisabled === 'function') {
                try {
                    const v = nlapiIsLineItemDisabled(sublistId, fieldName);
                    if (v) return true;
                } catch (_) { }
            }
            return readLineItemDisabledFromDom(sublistId, linenum, fieldName);
        }
        function writeLineItemDisabled(sublistId, fieldName, value) {
            lineItemDisabledCache[lineItemDisabledKey(sublistId, fieldName)] = !!value;
        }

        function detectCustomField(fieldName) {
            const prefix = fieldName.substring(0, 8);

            const urlParams = new URLSearchParams(window.location.search);
            const rectypeParam = urlParams.get("rectype");
            if (fieldName.startsWith("custrecord")) {
                if (rectypeParam) {
                    fetchCustomRecordFieldInfo(fieldName, rectypeParam);
                } else {
                    fetchCustomRecordFieldInfoByScriptId(fieldName);
                }
                return;
            }

            if (fieldName.startsWith("custcol")) {
                fetchColumnCustomFieldInfo(fieldName);
                return;
            }

            let recType = "";
            let fieldType = "";
            let editPath = "";
            if (prefix === "custbody") recType = "bodycustfields";
            else if (fieldName.substring(0, 10) === "custentity") recType = "entitycustfields";
            else if (prefix === "custitem") recType = "itemcustfields";

            if (prefix === "custbody") {
                fieldType = "BODY";
                editPath = "/app/common/custom/bodycustfield.nl";
            } else if (fieldName.substring(0, 10) === "custentity") {
                fieldType = "ENTITY";
                editPath = "/app/common/custom/entitycustfield.nl";
            } else if (prefix === "custitem") {
                fieldType = "ITEM";
                editPath = "/app/common/custom/itemcustfield.nl";
            }

            if (recType) {
                fetchTransactionCustomFieldInfo(fieldName, fieldType, editPath, recType);
            } else {
                updateEditButtonState("none", translations.sfv_na, translations.sfv_std_desc);
            }
        }

        function fetchCustomRecordFieldInfoByScriptId(fieldName) {
            if (fieldInfoCache[fieldName]) {
                const c = fieldInfoCache[fieldName];
                updateEditButtonState(c.display, c.text, c.title, c.url);
                return;
            }

            const btn = document.getElementById(NSFT.EDIT_BTN);
            if (btn) {
                btn.innerText = translations.sfv_searching;
                btn.style.opacity = "0.5";
            }

            const T = window.NSFT_SQL;
            if (!T) {
                cacheAndShow(fieldName, "none", translations.sfv_not_found);
                return;
            }
            try {
                const sql = `SELECT id AS fieldid, recordType AS rectype FROM CustomField WHERE scriptid = ${T.lit(fieldName.toUpperCase())}`;
                T.run({ rest: sql, sql: sql, limit: 5 }, function (err, res) {
                    if (err) {
                        console.warn("NSFT SuiteQL Error (custrecord no rectype)", err);
                        cacheAndShow(fieldName, "none", translations.sfv_not_found);
                        return;
                    }
                    if (res && res.length > 0 && res[0].fieldid && res[0].rectype) {
                        const editUrl = `/app/common/custom/custreccustfield.nl?rectype=${res[0].rectype}&e=T&id=${res[0].fieldid}`;
                        cacheAndShow(fieldName, "flex", translations.sfv_edit_field_btn, translations.sfv_edit_tooltip, editUrl);
                    } else {
                        cacheAndShow(fieldName, "none", translations.sfv_not_found);
                    }
                });
            } catch (e) {
                cacheAndShow(fieldName, "none", translations.sfv_not_found);
            }
        }

        function fetchColumnCustomFieldInfo(fieldName) {
            if (fieldInfoCache[fieldName]) {
                const c = fieldInfoCache[fieldName];
                updateEditButtonState(c.display, c.text, c.title, c.url);
                return;
            }

            const btn = document.getElementById(NSFT.EDIT_BTN);
            if (btn) {
                btn.innerText = translations.sfv_searching;
                btn.style.opacity = "0.5";
            }

            const T = window.NSFT_SQL;
            if (!T) {
                cacheAndShow(fieldName, "none", translations.sfv_not_found);
                return;
            }
            try {
                const sql = `SELECT id AS fieldid FROM CustomField WHERE scriptid = ${T.lit(fieldName.toUpperCase())}`;
                T.run({ rest: sql, sql: sql, limit: 5 }, function (err, res) {
                    if (err) {
                        console.warn("NSFT SuiteQL Error (custcol)", err);
                        cacheAndShow(fieldName, "none", translations.sfv_not_found);
                        return;
                    }
                    if (res && res.length > 0 && res[0].fieldid) {
                        const editUrl = `/app/common/custom/columncustfield.nl?id=${res[0].fieldid}&e=T`;
                        cacheAndShow(fieldName, "flex", translations.sfv_edit_field_btn, translations.sfv_edit_tooltip, editUrl);
                    } else {
                        cacheAndShow(fieldName, "none", translations.sfv_not_found);
                    }
                });
            } catch (e) {
                cacheAndShow(fieldName, "none", translations.sfv_not_found);
            }
        }

        const fieldInfoCache = {};

        function fetchCustomRecordFieldInfo(fieldName, rectypeId) {
            if (fieldInfoCache[fieldName]) {
                const c = fieldInfoCache[fieldName];
                updateEditButtonState(c.display, c.text, c.title, c.url);
                return;
            }

            const btn = document.getElementById(NSFT.EDIT_BTN);
            if (btn) {
                btn.innerText = translations.sfv_searching;
                btn.style.opacity = "0.5";
            }

            const T = window.NSFT_SQL;
            if (T) {
                try {
                    const sql = `SELECT id AS fieldid, recordType AS rectype FROM CustomField WHERE scriptid = ${T.lit(fieldName.toUpperCase())}`;
                    T.run({ rest: sql, sql: sql, limit: 5 }, function (err, res) {
                        if (err) {
                            console.warn("NSFT SuiteQL Error", err);
                            scrapeCustomRecordFieldInfo(fieldName, rectypeId);
                            return;
                        }
                        if (res && res.length > 0 && res[0].fieldid) {
                            const fieldId = res[0].fieldid;
                            const resolvedRectype = res[0].rectype || rectypeId;
                            const editUrl = `/app/common/custom/custreccustfield.nl?rectype=${resolvedRectype}&e=T&id=${fieldId}`;
                            cacheAndShow(fieldName, "flex", translations.sfv_edit_field_btn, translations.sfv_edit_tooltip, editUrl);
                        } else {
                            scrapeCustomRecordFieldInfo(fieldName, rectypeId);
                        }
                    });
                    return;
                } catch (e) { }
            }

            scrapeCustomRecordFieldInfo(fieldName, rectypeId);
        }

        function scrapeCustomRecordFieldInfo(fieldName, rectypeId) {
            const url = `/app/common/custom/custrecord.nl?id=${rectypeId}`;

            ajaxGet(url, function (response) {
                if (!response) {
                    cacheAndShow(fieldName, "none", translations.sfv_not_found);
                    return;
                }

                const lowerResponse = response.toLowerCase();
                const searchStr = fieldName.toLowerCase();

                const rows = response.split("</tr>");
                let foundId = null;

                for (let i = 0; i < rows.length; i++) {
                    const rowLower = rows[i].toLowerCase();
                    if (rowLower.includes(">" + searchStr + "<")) {
                        const linkMatch = rows[i].match(/custreccustfield\.nl\?.*id=(\d+)/);
                        if (linkMatch && linkMatch[1]) {
                            foundId = linkMatch[1];
                            break;
                        }
                    }
                }

                if (foundId) {
                    const editUrl = `/app/common/custom/custreccustfield.nl?rectype=${rectypeId}&e=T&id=${foundId}`;
                    cacheAndShow(fieldName, "flex", translations.sfv_edit_field_btn, translations.sfv_edit_tooltip, editUrl);
                } else {
                    cacheAndShow(fieldName, "none", translations.sfv_not_found);
                }
            });
        }

        function cacheAndShow(fieldName, display, text, title, url) {
            fieldInfoCache[fieldName] = { display, text, title, url };
            updateEditButtonState(display, text, title, url);
        }

        function fetchTransactionCustomFieldInfo(fieldName, fieldType, editPath, recType) {
            if (fieldInfoCache[fieldName]) {
                const c = fieldInfoCache[fieldName];
                updateEditButtonState(c.display, c.text, c.title, c.url);
                return;
            }

            const btn = document.getElementById(NSFT.EDIT_BTN);
            if (btn) {
                btn.innerText = translations.sfv_searching;
                btn.style.opacity = "0.5";
            }

            const T = window.NSFT_SQL;
            if (T) {
                try {
                    const sql = `SELECT cf.id AS fieldid FROM CustomField cf WHERE cf.fieldType = ${T.lit(fieldType)} AND cf.scriptid = ${T.lit(fieldName.toUpperCase())}`;
                    T.run({ rest: sql, sql: sql, limit: 5 }, function (err, res) {
                        if (err) {
                            console.warn("NSFT SuiteQL Error", err);
                            fetchCustomFieldInfo(fieldName, recType, editPath);
                            return;
                        }
                        if (res && res.length > 0 && res[0].fieldid) {
                            const editUrl = `${editPath}?id=${res[0].fieldid}&e=T`;
                            cacheAndShow(fieldName, "flex", translations.sfv_edit_field_btn, translations.sfv_edit_tooltip, editUrl);
                        } else {
                            fetchCustomFieldInfo(fieldName, recType, editPath);
                        }
                    });
                    return;
                } catch (e) { }
            }

            fetchCustomFieldInfo(fieldName, recType, editPath);
        }



        function fetchCustomFieldInfo(fieldName, recType, editPath = "") {
            ajaxGet(`/app/common/custom/${recType}.nl?frame=B&segment=1%01000%01%021000`, function (response) {
                if (!response) return;

                let d = response.indexOf(">" + fieldName + "<");
                if (d > 0) {
                    const rowStart = response.lastIndexOf("<tr", d);
                    const rowEnd = response.indexOf("</tr>", d);
                    if (rowStart > -1 && rowEnd > rowStart) {
                        const rowHtml = response.substring(rowStart, rowEnd);
                        const idMatch = rowHtml.match(/id=(\d+)/i);
                        if (idMatch && idMatch[1] && editPath) {
                            const editUrl = `${editPath}?id=${idMatch[1]}&e=T`;
                            cacheAndShow(fieldName, "flex", translations.sfv_edit_field_btn, translations.sfv_edit_tooltip, editUrl);
                        }
                    }
                }

                if (d > 0) {
                    const params = extractParams(response, d);
                    renderCustomFieldParams(params);
                } else if (!fieldInfoCache[fieldName]) {
                    updateEditButtonState("none", translations.sfv_not_found, translations.sfv_std_desc);
                }
            });
        }

        function updateEditButtonState(display, text, title, url = null) {
            const row = document.getElementById(NSFT.EDIT_ROW);
            const btn = document.getElementById(NSFT.EDIT_BTN);

            if (row) row.style.display = (display === "none") ? "none" : "flex";

            if (btn && display !== "none") {
                const icon = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" style="width:12px;height:12px;margin-right:2px;vertical-align:text-top;"><path d="M5.433 13.917l1.262-3.155A4 4 0 017.58 9.42l6.92-6.918a2.121 2.121 0 013 3l-6.92 6.918c-.383.383-.84.685-1.343.886l-3.154 1.262a.5.5 0 01-.65-.65z" /><path d="M3.5 5.75c0-.69.56-1.25 1.25-1.25H10A.75.75 0 0010 3H4.75A2.75 2.75 0 002 5.75v9.5A2.75 2.75 0 004.75 18h9.5A2.75 2.75 0 0017 15.25V10a.75.75 0 00-1.5 0v5.25c0 .69-.56 1.25-1.25 1.25h-9.5c-.69 0-1.25-.56-1.25-1.25v-9.5z" /></svg>';
                btn.innerHTML = icon + " " + text;

                if (title) btn.title = title;
                btn.style.opacity = "1";
                btn.style.cursor = "pointer";

                if (url) {
                    btn.onclick = function (e) {
                        e.stopPropagation();
                        window.open(url, "_blank");
                    };
                }
            }

            enlazarChapa(display !== "none" ? url : null, title);
        }

        function enlazarChapa(url, title) {
            const chip = document.querySelector("#" + NSFT.MODAL + " .nsft-sfv-chip");
            if (!chip) return;

            const vale = !!url && ver("setFieldValuesShowEdit");
            chip.classList.toggle("is-link", vale);

            if (!vale) {
                chip.removeAttribute("role");
                chip.removeAttribute("tabindex");
                chip.removeAttribute("title");
                chip.onclick = null;
                chip.onkeydown = null;
                return;
            }

            const abrir = function (e) {
                if (e) e.stopPropagation();
                window.open(url, "_blank");
            };
            chip.setAttribute("role", "link");
            chip.setAttribute("tabindex", "0");
            chip.title = title || translations.sfv_edit_tooltip || "";
            chip.onclick = abrir;
            chip.onkeydown = function (e) {
                if (e.key !== "Enter" && e.key !== " ") return;
                e.preventDefault();
                abrir(e);
            };
        }

        function extractParams(response, d) {
            let params = {};
            let a = response.lastIndexOf("id=", d);
            let b = response.indexOf("\"", a);
            if (a > 0 && b > 0) params.id = response.substring(a + 3, b);

            a = response.indexOf("</td>", d);
            b = response.indexOf("<td>", a);
            let c = response.indexOf("</td>", b);
            if (b > 0 && c > 0) params.type = response.substring(b + 4, c).trim();

            return params;
        }

        function renderCustomFieldParams(params) {
            const detailsSlot = document.getElementById("nsft-custom-field-details");
            if (!detailsSlot) return;

            if (params.type) {
                const slot = document.getElementById(NSFT.TYPE_SLOT);
                if (slot) { slot.textContent = params.type; return; }
                detailsSlot.innerHTML = `<div class="nsft-sfv-row" style="margin-top:4px; border-top:1px solid rgba(0,0,0,0.05); padding-top:4px;">
                            <span class="nsft-sfv-label">${translations.sfv_field_type}:</span>
                            <span class="nsft-sfv-value">${params.type}</span>
                          </div>`;
            }
        }

        function ajaxGet(url, callback) {
            const xhr = new XMLHttpRequest();
            xhr.onreadystatechange = function () {
                if (xhr.readyState == 4 && xhr.status == 200) {
                    callback(xhr.responseText);
                } else if (xhr.readyState == 4) {
                    callback(null);
                }
            };
            xhr.open("GET", url, true);
            xhr.send(null);
        }

        return {
            showInfoPopup: showInfoPopup,
            refreshAfterAuditToggle: function () {
                const modal = document.getElementById(NSFT.MODAL);
                if (!modal || modal.style.display === 'none') return;
                if (_lastRenderCtx) {
                    renderFieldData(_lastRenderCtx.fieldName, true, _lastRenderCtx.sublistId, _lastRenderCtx.linenum);
                }
            },
            setFieldRequired: function (name, required) {
                nlapiSetFieldMandatory(name, required);
                refrescarVisualizacion(name);
            },
            setFieldDisabled: function (name, disabled) {
                nlapiSetFieldDisabled(name, disabled);
                refrescarVisualizacion(name);
            },
            _submitInView: function (vc, name, value, text) {
                const cuerpo = String(translations.sfv_view_confirm_body || "")
                    .replace("{campo}", name)
                    .replace("{valor}", (text ? (value + " — " + text) : String(value)));

                const preguntar = function (texto) {
                    const dlg = window.NSFT_Dialog;
                    if (dlg && dlg.confirm) {
                        return dlg.confirm({
                            title: translations.sfv_view_confirm_title,
                            body: texto,
                            danger: true,
                            ok: translations.sfv_view_confirm_ok,
                            cancel: translations.sfv_view_confirm_cancel
                        });
                    }
                    return Promise.resolve(window.confirm(texto));
                };

                const D = window.NSFT_Dialog;
                const seguir = preguntar(cuerpo);
                return Promise.resolve(seguir).then(function (ok) {
                    if (!ok) return false;
                    marcarGuardando(true);
                    return new Promise(function (resolver) {
                        requestAnimationFrame(function () {
                            setTimeout(function () { resolver(escribirYa()); }, 0);
                        });
                    });
                }).then(function (r) { return r; });

                function escribirYa() {
                    try {
                        nlapiSubmitField(vc.tipo, vc.id, name, value);
                        window.location.reload();
                        return true;
                    } catch (e) {
                        marcarGuardando(false);
                        console.error("[NSFT SFV] nlapiSubmitField", e);
                        if (D && D.alert) {
                            D.alert({
                                title: translations.sfv_view_confirm_title,
                                body: String(translations.sfv_view_failed || "")
                                    + " " + String((e && e.message) || e || "")
                            });
                        }
                        return false;
                    }
                }
            },
            setNewValue: function (name, value, sublistId, linenum) {
                const vc = (!sublistId) ? viewCtx(name) : null;
                if (vc) {
                    const api = window.NSFT_SetFieldValues;
                    api._submitInView(vc, name, value, "").then(function (ok) {
                        if (ok) renderFieldData(name, true, null, null);
                    });
                    return;
                }
                _auditCache.clear();
                try {
                    if (sublistId) {
                        if (linenum && typeof nlapiSelectLineItem === 'function') {
                            try { nlapiSelectLineItem(sublistId, linenum); } catch (selErr) { console.warn('[NSFT SFV] nlapiSelectLineItem failed', selErr); }
                        }
                        if (typeof nlapiSetCurrentLineItemValue === 'function') {
                            nlapiSetCurrentLineItemValue(sublistId, name, value);
                        }
                    } else {
                        nlapiSetFieldValue(name, value);
                    }
                } catch (e) {
                    console.error('[NSFT SFV] setNewValue error', e);
                }
                renderFieldData(name, true, sublistId || null, linenum || null);
            },
            setValueFromList: function (name, value, text, sublistId, linenum) {
                const vc = (!sublistId) ? viewCtx(name) : null;
                if (vc) {
                    const api = window.NSFT_SetFieldValues;
                    api._submitInView(vc, name, value, text).then(function (ok) {
                        if (ok) { try { refreshValueInPlace(name, value, text); } catch (e) { } }
                    });
                    return;
                }
                try {
                    if (sublistId) {
                        if (linenum && typeof nlapiSelectLineItem === "function") {
                            try { nlapiSelectLineItem(sublistId, linenum); } catch (e) { }
                        }
                        if (typeof nlapiSetCurrentLineItemValue === "function") {
                            nlapiSetCurrentLineItemValue(sublistId, name, value);
                        }
                    } else {
                        nlapiSetFieldValue(name, value);
                    }
                } catch (e) {
                    console.error("[NSFT SFV] setValueFromList error", e);
                }
                try { refreshValueInPlace(name, value, text); }
                catch (e) { }
            },
            setLineItemDisabled: function (sublistId, name, disabled, linenum) {
                try {
                    if (linenum && typeof nlapiSelectLineItem === 'function') {
                        try { nlapiSelectLineItem(sublistId, linenum); } catch (selErr) { console.warn('[NSFT SFV] nlapiSelectLineItem failed', selErr); }
                    }
                    if (typeof nlapiDisableLineItemField === 'function') {
                        nlapiDisableLineItemField(sublistId, name, !!disabled);
                    } else {
                        console.warn('[NSFT SFV] nlapiDisableLineItemField not available');
                    }
                } catch (e) {
                    console.error('[NSFT SFV] nlapiDisableLineItemField threw', e);
                }

                writeLineItemDisabled(sublistId, name, disabled);

                syncSublistCellDisabledDom(sublistId, linenum, name, !!disabled);

                renderFieldData(name, true, sublistId, linenum || null);
            },
            toggleValueExpand: function (btn) {
                const wrap = btn.closest('.nsft-sfv-value');
                if (!wrap) return;
                const short = wrap.querySelector('.nsft-sfv-val-short');
                const full = wrap.querySelector('.nsft-sfv-val-full');
                if (!short || !full) return;
                const expanded = full.style.display !== 'none';
                full.style.display = expanded ? 'none' : 'inline';
                short.style.display = expanded ? 'inline' : 'none';
                btn.textContent = expanded ? (btn.dataset.more || '') : (btn.dataset.less || '');
            },
            openNativeHelp: function (fieldName) {
                openNativeFieldHelp(fieldName);
            },
            showTab: function (id) {
                const modal = document.getElementById(NSFT.MODAL);
                if (!modal) return;
                recordarAltoDeValor();
                activeTab = id;
                animarAltoModal(modal, function () {
                    modal.querySelectorAll(".nsft-sfv-pane").forEach(function (p) {
                        p.hidden = p.getAttribute("data-tab") !== id;
                    });
                    modal.querySelectorAll(".nsft-sfv-tab").forEach(function (b) {
                        b.setAttribute("aria-selected", String(b.getAttribute("data-tab") === id));
                    });
                    aplicarTopeDeAlto();
                });
                if (id === "hist") pedirHistorialSiHaceFalta();
                try { requestAnimationFrame(fitModalInViewport); } catch (e) { }
            },
            toggleMeta: function (headEl) {
                const box = headEl && headEl.closest(".nsft-sfv-meta");
                if (!box) return;
                metaCollapsed = box.dataset.collapsed !== "1";
                box.dataset.collapsed = metaCollapsed ? "1" : "0";
                try {
                    window.postMessage({ type: "nsft-sfv-meta-collapsed", collapsed: metaCollapsed }, "*");
                } catch (e) { }
            },
            toggleFieldHelp: function (fieldName) {
                const box = document.querySelector("#" + NSFT.MODAL + " .nsft-sfv-help");
                if (!box) {
                    try { this.openNativeHelp(fieldName); } catch (e) { }
                    return;
                }
                helpCollapsed = box.dataset.collapsed !== "1";
                box.dataset.collapsed = helpCollapsed ? "1" : "0";
                pintarBotonAyuda();
                try {
                    window.postMessage({ type: "nsft-sfv-help-collapsed", collapsed: helpCollapsed }, "*");
                } catch (e) { }
                try { requestAnimationFrame(fitModalInViewport); } catch (e) { }
            },
            diagnoseList: function (fieldName) {
                if (!fieldName) fieldName = (_lastRenderCtx && _lastRenderCtx.fieldName) || "";
                if (!fieldName) {
                    console.log("NSFT: abre el panel de un campo y vuelve a ejecutarlo, o pasa su id: diagnoseList('custrecord_...')");
                    return null;
                }
                const w = window.document.querySelector(
                    '[data-field-name="' + fieldName + '"]');
                const fs_ = window.document.getElementById(fieldName + "_fs");
                const kind = readListKind(fieldName);
                const sync = extractLinkFromSync(fieldName);
                const vista = viewLinkUrl(fieldName);
                const url = sync || vista;
                const info = {
                    campo: fieldName,
                    esVista: esVista(fieldName),
                    'data-mode': w ? w.getAttribute("data-mode") : '(sin contenedor)',
                    'wrapper data-field-type': w ? w.getAttribute("data-field-type") : '(sin contenedor)',
                    '_fs data-fieldtype': fs_ ? fs_.getAttribute("data-fieldtype") : '(no hay _fs)',
                    'readListKind': kind || '(no lo reconoce como lista)',
                    'enlace desde Sync': sync || '(nada)',
                    'enlace del valor (vista)': vista || '(nada)',
                    'destino resuelto': JSON.stringify(resolveListTarget(url)) 
                };
                let hrefs = [];
                try {
                    hrefs = Array.prototype.slice.call(w ? w.querySelectorAll("a[href]") : [])
                        .map(function (a) { return a.getAttribute("href"); });
                } catch (e) { }
                info['enlaces dentro del campo'] = hrefs.length ? hrefs : '(ninguno)';
                console.table ? console.table(info) : console.log(info);
                return info;
            },

            diagnoseHelp: function (fieldName) {
                const anchor = findHelpAnchor(fieldName);
                console.log('%c[NSFT SFV] diagnóstico de ayuda: ' + fieldName, 'font-weight:bold');
                console.log('  etiqueta encontrada:', !!anchor);
                if (anchor) {
                    console.log('  onclick:', anchor.getAttribute('onclick') || '(sin onclick)');
                    console.log('  argumentos:', helpAnchorArgs(anchor));
                }
                console.log('  lectura directa:', readFieldHelpText(fieldName, null) || '(nada)');
                console.log('  plantilla aprendida:', helpTemplates[helpTemplateKey()] || '(ninguna)');
                console.log('  url transcrita de la etiqueta:', nativeFieldHelpUrl(fieldName) || '(no se pudo transcribir)');
                console.log('  url desnuda:', bareFieldHelpUrl(fieldName));
                helpFillerFor(fieldName, function (relleno) {
                    console.log('  relleno de «sin ayuda» de esta cuenta:',
                        relleno ? '"' + relleno.slice(0, 160) + '"' : '(no se pudo sondear)');
                });

                const urls = buildFieldHelpUrls(fieldName);
                console.log('  urls a probar:', urls);
                urls.forEach(function (url, i) {
                    fetch(url, { credentials: 'same-origin' })
                        .then(function (r) { return r.text().then(function (t) { return { s: r.status, t: t }; }); })
                        .then(function (res) {
                            const directo = helpTextFromContainers(parseHelpDoc(res.t), fieldName);
                            const text = extractHelpFromHtml(res.t, fieldName, helpHints(fieldName));
                            console.log(`  [${i + 1}/${urls.length}] status=${res.s} bytes=${res.t.length}`
                                + ` contenedor=${directo ? '"' + directo.slice(0, 160) + '"' : '(vacío)'}`
                                + ` filtro=${text ? '"' + text.slice(0, 160) + '"' : '(vacío)'}`);
                            if (i === 0) console.log('  html de la 1ª (600 primeros):', res.t.slice(0, 600));
                        })
                        .catch(function (e) { console.log(`  [${i + 1}/${urls.length}] ERROR`, e); });
                });
                return 'ver consola';
            },
            closeHelpWindow: closeHelpWindow
        };

    })();

})();
