(function () {
    'use strict';

    function ensureSqlTransport() {
        if (window.NSFT_SuiteQLRest && window.NSFT_SuiteQLRest.ensureTransport) {
            window.NSFT_SuiteQLRest.ensureTransport();
        }
    }

    const STORAGE_KEY = 'enableScriptAutoName';

    if (!/\/scripting\/script\.nl/i.test(location.pathname)) return;

    const SCRIPTTYPE_URL_ABBREV = {
        CLIENT: 'CL',
        USEREVENT: 'UE',
        SCHEDULED: 'SS',
        SCRIPTLET: 'ST',
        RESTLET: 'RL',
        PORTLET: 'PT',
        MASSUPDATE: 'MU',
        ACTION: 'WA',
        BUNDLEINSTALLATION: 'BS',
        MAPREDUCE: 'MR',
        WORKFLOW: 'WA'
    };

    const TYPE_ABBREV = {
        cl: 'CL', ue: 'UE', mr: 'MR', st: 'ST', mu: 'MU', ss: 'SS', pt: 'PT',
        cs: 'CL', sl: 'ST', pl: 'PT', rl: 'RL', wa: 'WA', bs: 'BS'
    };

    function getScriptTypeFromUrl() {
        try {
            const params = new URLSearchParams(location.search);
            const type = (params.get('scripttype') || '').toUpperCase();
            return SCRIPTTYPE_URL_ABBREV[type] || null;
        } catch (e) { return null; }
    }

    const I18N = {
        regenerate: chrome.i18n.getMessage('scriptAutoNameRegenerate') || 'Regenerar',
        regenerateTitle: chrome.i18n.getMessage('scriptAutoNameRegenerateTitle') || 'Vuelve a generar el Name y Script ID desde el nombre del archivo',
        duplicateWarn: chrome.i18n.getMessage('scriptAutoNameDuplicateWarn') || 'Ya existe un script con este ID. NetSuite rechazará el guardado.'
    };

    let unsubscribeObserver = null;
    let storageListener = null;
    let cachedInputs = null;
    let regenerateBtn = null;
    let duplicateBanner = null;
    let fetcherInjected = false;
    let lastCheckedScriptId = '';
    let messageListener = null;
    let scriptIdInputListener = null;
    let editDebounceTimer = null;

    chrome.storage.local.get({ [STORAGE_KEY]: true }, (items) => {
        attachStorageListener();
        if (!items[STORAGE_KEY]) return;
        start();
    });

    function start() {
        if (unsubscribeObserver) return;
        injectFetcher();
        attachMessageListener();
        if (window.NSFT_Observer && typeof window.NSFT_Observer.subscribe === 'function') {
            unsubscribeObserver = window.NSFT_Observer.subscribe(onTick, {
                throttle: 300,
                immediate: true
            });
        } else {
            onTick();
        }
    }

    function stop() {
        if (unsubscribeObserver) {
            try { unsubscribeObserver(); } catch (e) { }
            unsubscribeObserver = null;
        }
        if (messageListener) {
            window.removeEventListener('message', messageListener);
            messageListener = null;
        }
        if (regenerateBtn) {
            regenerateBtn.remove();
            regenerateBtn = null;
        }
        if (duplicateBanner) {
            duplicateBanner.remove();
            duplicateBanner = null;
        }
        if (editDebounceTimer) {
            clearTimeout(editDebounceTimer);
            editDebounceTimer = null;
        }
        if (scriptIdInputListener && scriptIdInputListener.isConnected) {
            scriptIdInputListener.removeEventListener('input', onScriptIdEdit);
            delete scriptIdInputListener.dataset.nsftSanEditListener;
        }
        scriptIdInputListener = null;
        cachedInputs = null;
        lastCheckedScriptId = '';
    }

    function attachStorageListener() {
        if (storageListener) return;
        storageListener = (changes, area) => {
            if (area !== 'local') return;
            if (!changes[STORAGE_KEY]) return;
            const enabled = changes[STORAGE_KEY].newValue !== false;
            if (!enabled) stop();
            else start();
        };
        chrome.storage.onChanged.addListener(storageListener);
    }

    function injectFetcher() {
        if (fetcherInjected) return;
        ensureSqlTransport();
        const s = document.createElement('script');
        s.async = false;
        s.src = chrome.runtime.getURL('scripts/modules/script_auto_name/script_auto_name_fetcher.js');
        s.onload = function () { this.remove(); };
        (document.head || document.documentElement).appendChild(s);
        fetcherInjected = true;
    }

    function attachMessageListener() {
        if (messageListener) return;
        messageListener = (event) => {
            if (event.source !== window) return;
            const data = event.data;
            if (!data || data.dest !== 'extension_san') return;
            if (data.type === 'unique_result') handleUniqueResult(data.payload);
        };
        window.addEventListener('message', messageListener);
    }

    function q(selectors) {
        if (window.NSFT_DOM && window.NSFT_DOM.q) {
            return window.NSFT_DOM.q(selectors, { module: 'script_auto_name', purpose: 'field-lookup' });
        }
        const list = Array.isArray(selectors) ? selectors : [selectors];
        for (const s of list) {
            try {
                const el = document.querySelector(s);
                if (el) return el;
            } catch (e) { }
        }
        return null;
    }

    function getInputs() {
        if (
            cachedInputs &&
            cachedInputs.fileInput && cachedInputs.fileInput.isConnected &&
            cachedInputs.nameInput && cachedInputs.nameInput.isConnected &&
            cachedInputs.scriptIdInput && cachedInputs.scriptIdInput.isConnected
        ) {
            return cachedInputs;
        }
        const fileInput = q(['#scriptfile_display', 'input[name="scriptfile_display"]']);
        const nameInput = q(['#name', 'input[name="name"]']);
        const scriptIdInput = q(['[name="scriptid"]', '#scriptid', '#inpt_scriptid']);
        if (!fileInput || !nameInput || !scriptIdInput) return null;
        cachedInputs = { fileInput, nameInput, scriptIdInput };
        if (!scriptIdInput.dataset.nsftSanEditListener) {
            scriptIdInput.addEventListener('input', onScriptIdEdit);
            scriptIdInput.dataset.nsftSanEditListener = '1';
            scriptIdInputListener = scriptIdInput;
        }
        return cachedInputs;
    }

    function onScriptIdEdit(e) {
        if (duplicateBanner) {
            duplicateBanner.remove();
            duplicateBanner = null;
        }
        if (editDebounceTimer) clearTimeout(editDebounceTimer);
        const target = e.target;
        editDebounceTimer = setTimeout(() => {
            editDebounceTimer = null;
            const v = String((target && target.value) || '').trim();
            if (!v) return;
            lastCheckedScriptId = '';
            queueUniqueCheck(v);
        }, 600);
    }

    function onTick() {
        const inputs = getInputs();
        if (!inputs) return;
        ensureRegenerateButton(inputs);
        applyAutofill(inputs);
    }

    function applyAutofill(inputs) {
        const { fileInput, nameInput, scriptIdInput } = inputs;

        if (!fileInput.value) return;
        if (nameInput.value && scriptIdInput.value) return;

        const fileName = fileInput.value.trim();
        if (!/\.js$/i.test(fileName)) return;

        const base = fileName.replace(/\.js$/i, '');
        const parts = base.split('_');

        const urlAbbrev = getScriptTypeFromUrl();
        const filenameAbbrev = parts.length >= 2
            ? TYPE_ABBREV[parts[0].toLowerCase()]
            : null;

        let name;
        let idSegments;
        if (urlAbbrev && filenameAbbrev) {
            const rest = parts.slice(1);
            if (rest.length >= 2) {
                name = urlAbbrev + ' - ' + rest[0] + ' - ' + rest.slice(1).map(capitalize).join(' ');
            } else if (rest.length === 1 && rest[0]) {
                name = urlAbbrev + ' - ' + rest[0];
            } else {
                name = urlAbbrev;
            }
            idSegments = [urlAbbrev].concat(rest);
        } else if (urlAbbrev) {
            const clientPrefix = parts[0];
            const secondIsType = parts.length >= 2 && !!TYPE_ABBREV[parts[1].toLowerCase()];
            const restStartIdx = secondIsType ? 2 : 1;
            const rest = parts.slice(restStartIdx);
            const description = rest.map(capitalize).join(' ');
            if (description) {
                name = clientPrefix + ' - ' + urlAbbrev + ' - ' + description;
            } else {
                name = clientPrefix + ' - ' + urlAbbrev;
            }
            idSegments = [clientPrefix, urlAbbrev].concat(rest);
        } else if (filenameAbbrev && parts.length >= 3) {
            const description = parts.slice(2).map(capitalize).join(' ');
            name = filenameAbbrev + ' - ' + parts[1] + ' - ' + description;
            idSegments = parts;
        } else if (parts.length >= 3) {
            const description = parts.slice(2).map(capitalize).join(' ');
            name = parts[0].toUpperCase() + ' - ' + parts[1] + ' - ' + description;
            idSegments = parts;
        } else if (parts.length === 2) {
            name = parts[0].toUpperCase() + ' - ' + capitalize(parts[1]);
            idSegments = parts;
        } else {
            name = base;
            idSegments = parts;
        }

        const scriptid = sanitizeScriptId('_' + idSegments.join('_'));

        if (!nameInput.value) {
            nameInput.value = name;
            fireFieldEvents(nameInput);
        }
        if (!scriptIdInput.value) {
            scriptIdInput.value = scriptid;
            fireFieldEvents(scriptIdInput);
            queueUniqueCheck(scriptid);
        }
    }

    function ensureRegenerateButton(inputs) {
        if (regenerateBtn && regenerateBtn.isConnected) return;
        const { scriptIdInput } = inputs;
        const wrapper = scriptIdInput.closest('.uir-field-wrapper') || scriptIdInput.parentNode;
        if (!wrapper) return;

        regenerateBtn = document.createElement('button');
        regenerateBtn.type = 'button';
        regenerateBtn.className = 'nsft-san-regenerate-btn';
        regenerateBtn.setAttribute('aria-label', I18N.regenerate);
        regenerateBtn.title = I18N.regenerate + ' — ' + I18N.regenerateTitle;
        regenerateBtn.addEventListener('click', onRegenerateClick);

        if (scriptIdInput.parentNode) {
            scriptIdInput.parentNode.insertBefore(regenerateBtn, scriptIdInput.nextSibling);
        } else {
            wrapper.appendChild(regenerateBtn);
        }
    }

    function onRegenerateClick(e) {
        e.preventDefault();
        const inputs = getInputs();
        if (!inputs) return;
        const { fileInput, nameInput, scriptIdInput } = inputs;
        if (!fileInput.value) return;
        nameInput.value = '';
        scriptIdInput.value = '';
        fireFieldEvents(nameInput);
        fireFieldEvents(scriptIdInput);
        if (duplicateBanner) duplicateBanner.remove();
        duplicateBanner = null;
        lastCheckedScriptId = '';
        applyAutofill(inputs);
    }

    function queueUniqueCheck(scriptid) {
        if (!scriptid || scriptid === lastCheckedScriptId) return;
        lastCheckedScriptId = scriptid;
        setTimeout(() => {
            window.postMessage({
                dest: 'fetcher_san',
                type: 'check_unique',
                payload: { scriptid: scriptid }
            }, '*');
        }, 50);
    }

    function handleUniqueResult(payload) {
        if (!payload) return;
        const inputs = getInputs();
        if (!inputs) return;
        const currentValue = String(inputs.scriptIdInput.value || '').toLowerCase().trim();
        const checkedValue = String(payload.scriptid || '').toLowerCase().trim();
        if (currentValue !== checkedValue) {
            if (duplicateBanner) duplicateBanner.remove();
            duplicateBanner = null;
            return;
        }

        if (window.NSFT_DOM && window.NSFT_DOM.isDiagEnabled && window.NSFT_DOM.isDiagEnabled()) {
            console.info('[NSFT:script_auto_name] unique check result:', payload);
        }

        if (payload.exists === true) {
            showDuplicateBanner(inputs, payload.matched);
        } else {
            if (duplicateBanner) duplicateBanner.remove();
            duplicateBanner = null;
        }
    }

    function showDuplicateBanner(inputs, matched) {
        if (duplicateBanner && duplicateBanner.isConnected) {
            duplicateBanner.setAttribute('data-tooltip', buildDuplicateText(matched));
            return;
        }
        const { scriptIdInput } = inputs;
        duplicateBanner = document.createElement('span');
        duplicateBanner.className = 'nsft-san-duplicate-icon';
        duplicateBanner.setAttribute('data-tooltip', buildDuplicateText(matched));
        duplicateBanner.setAttribute('role', 'alert');
        duplicateBanner.setAttribute('aria-label', buildDuplicateText(matched));
        duplicateBanner.tabIndex = 0;
        const shape = document.createElement('span');
        shape.className = 'nsft-san-duplicate-icon-shape';
        shape.setAttribute('aria-hidden', 'true');
        duplicateBanner.appendChild(shape);

        const refNode = (regenerateBtn && regenerateBtn.isConnected) ? regenerateBtn : scriptIdInput;
        if (refNode.parentNode) {
            refNode.parentNode.insertBefore(duplicateBanner, refNode.nextSibling);
        }
    }

    function buildDuplicateText(matched) {
        let text = I18N.duplicateWarn;
        if (matched && matched.length) {
            text += ' (' + matched.slice(0, 2).join(', ') + ')';
        }
        return text;
    }

    function sanitizeScriptId(id) {
        return String(id || '').toLowerCase().replace(/[^a-z0-9_]/g, '_');
    }

    function capitalize(str) {
        return str.charAt(0).toUpperCase() + str.slice(1);
    }

    function fireFieldEvents(element) {
        try { element.dispatchEvent(new Event('input', { bubbles: true })); } catch (e) { }
        try { element.dispatchEvent(new Event('change', { bubbles: true })); } catch (e) { }
        try { element.dispatchEvent(new Event('blur', { bubbles: true })); } catch (e) { }
    }

})();
