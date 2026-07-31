
(function () {
    const STORAGE_KEY = 'enableAutogenerateIds';
    const PREFIX_KEY = 'autogenerateIdsPrefix';
    const CHECKBOX_ID = 'nsft-autogenerate-ids';

    let idPrefix = '';

    const PAGE_CONFIGS = {
        "/app/center/enhanced/kpireportsetup.nl": { label: 'name', id: 'scriptid' },

        "/app/common/custom/advancedprint/pdftemplate.nl": { label: 'templatesetup-title', id: 'templatesetup-scriptid' },

        "/app/common/custom/bodycustfield.nl": { label: 'label', id: 'scriptid' },

        "/app/common/custom/centerlink.nl": {
            customSelector: true,
            label: 'div[data-walkthrough="Field:Label"] input:not([type="hidden"])',
            id: 'div[data-walkthrough="Field:Script ID"] input:not([type="hidden"])'
        },

        "/app/common/custom/columncustfield.nl": { label: 'label', id: 'scriptid' },

        "/app/common/custom/custaddressentryform.nl": { label: 'formname', id: 'scriptid' },

        "/app/common/custom/custcategory.nl": { label: 'label', id: 'scriptid' },

        "/app/common/custom/custcenter.nl": { label: 'label', id: 'scriptid' },

        "/app/common/custom/custentryform.nl": { label: 'formname', id: 'scriptid' },

        "/app/common/custom/custform.nl": { label: 'formname', id: 'scriptid' },

        "/app/common/custom/custlist.nl": { label: 'name', id: 'scriptid' },

        "/app/common/custom/custreccustfield.nl": { label: 'label', id: 'scriptid' },

        "/app/common/custom/custrecord.nl": { label: 'recordname', id: 'scriptid' },

        "/app/common/custom/custsection.nl": { label: 'label', id: 'scriptid' },

        "/app/common/custom/entitycustfield.nl": { label: 'label', id: 'scriptid' },

        "/app/common/custom/eventcustfield.nl": { label: 'label', id: 'scriptid' },

        "/app/common/custom/itemcustfield.nl": { label: 'label', id: 'scriptid' },

        "/app/common/custom/itemnumbercustfield.nl": { label: 'label', id: 'scriptid' },

        "/app/common/custom/itemoption.nl": { label: 'label', id: 'scriptid' },

        "/app/common/custom/othercustfield.nl": { label: 'label', id: 'scriptid' },

        "/app/common/custom/scriptcustfield.nl": { label: 'label', id: 'scriptid' },

        "/app/common/custom/segments/segment.nl": { label: 'label', id: 'scriptid' },

        "/app/common/custom/sublist.nl": { label: 'label', id: 'scriptid' },

        "/app/common/custom/subtab.nl": { label: 'title', id: 'scriptid' },

        "/app/common/scripting/plugin.nl": { label: 'name', id: 'scriptid' },

        "/app/common/scripting/plugintype.nl": { label: 'name', id: 'scriptid' },

        "/app/common/scripting/script.nl": { label: 'name', id: 'scriptid' },

        "/app/common/scripting/scriptrecord.nl": { label: 'title', id: 'scriptid', scriptDeployment: true },

        "/app/common/search/search.nl": { label: 'searchtitle', id: 'scriptid' },

        "/app/common/workflow/setup/workflow.nl": { label: 'name', id: 'scriptid' },

        "/app/common/workflow/setup/workflowwizard.nl": { label: 'name', id: 'scriptid' },

        "/app/crm/common/merge/emailtemplate.nl": { label: 'name', id: 'scriptid' },

        "/app/setup/assistants/nsimport/importassistant.nl": { label: 'mapname', id: 'scriptid' },

        "/app/setup/role.nl": { label: 'name', id: 'scriptid' }
    };

    if (!PAGE_CONFIGS[location.pathname]) return;

    let _active = false;
    let _ac = null;
    let _wrapper = null;
    let _debounceTimer = 0;

    chrome.storage.local.get({
        [STORAGE_KEY]: true,
        [PREFIX_KEY]: ''
    }, (items) => {
        idPrefix = sanitizePrefix(items[PREFIX_KEY]);
        if (items[STORAGE_KEY]) init();
    });

    chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== 'local') return;
        if (changes[PREFIX_KEY]) idPrefix = sanitizePrefix(changes[PREFIX_KEY].newValue);
        if (changes[STORAGE_KEY]) {
            if (changes[STORAGE_KEY].newValue) init();
            else teardown();
        }
    });

    function teardown() {
        _active = false;
        clearTimeout(_debounceTimer);
        if (_ac) { _ac.abort(); _ac = null; }
        if (_wrapper) { _wrapper.remove(); _wrapper = null; }
    }

    function sanitizePrefix(raw) {
        return String(raw || '')
            .toLowerCase()
            .replace(/[^a-z0-9_]/g, '')
            .replace(/^_+|_+$/g, '');
    }

    function init() {
        if (_active) return;
        const params = new URLSearchParams(window.location.search);
        const hasId = params.has('id');
        const isEdit = params.get('e') === 'T';

        if (hasId && !isEdit) return;

        const details = PAGE_CONFIGS[location.pathname];
        if (!details) return;

        const { labelEl, idEl } = getDomElements(details);

        if ((!labelEl || !idEl) && !details.scriptDeployment) return;

        if (!labelEl && idEl && details.scriptDeployment) {
            handleScriptDeployment(idEl);
            return;
        }

        if (!idEl || !idEl.parentElement) return;
        const idContainerEl = idEl.parentElement;

        injectToggleAndListeners(idContainerEl, labelEl, idEl, CHECKBOX_ID);
    }

    function getDomElements(details) {
        const DOM = window.NSFT_DOM;
        let labelEl, idEl;

        if (details.customSelector) {
            labelEl = DOM
                ? DOM.q([`body ${details.label}`, details.label], { module: 'autogenerate_ids', purpose: 'label (custom)' })
                : document.querySelector(`body ${details.label}`);
            idEl = DOM
                ? DOM.q([`body ${details.id}`, details.id], { module: 'autogenerate_ids', purpose: 'id (custom)' })
                : document.querySelector(`body ${details.id}`);
        } else {
            labelEl = DOM
                ? DOM.q([
                    `body input#${details.label}:not([type="hidden"])`,
                    `input#${details.label}:not([type="hidden"])`,
                    `[name="${details.label}"]:not([type="hidden"])`
                ], { module: 'autogenerate_ids', purpose: 'label input' })
                : document.querySelector(`body input#${details.label}:not([type="hidden"])`);
            idEl = DOM
                ? DOM.q([
                    `body input#${details.id}:not([type="hidden"])`,
                    `input#${details.id}:not([type="hidden"])`,
                    `[name="${details.id}"]:not([type="hidden"])`
                ], { module: 'autogenerate_ids', purpose: 'id input' })
                : document.querySelector(`body input#${details.id}:not([type="hidden"])`);
        }

        return { labelEl, idEl };
    }

    function handleScriptDeployment(idEl) {
        const scriptType = new URL(window.location).searchParams.get('scripttype');
        if (!scriptType) return;
        _active = true;

        fetch(`/app/common/scripting/script.nl?xml=T&id=${scriptType}`)
            .then(response => response.text())
            .then(xmlString => {
                const match = xmlString?.match(/<scriptid>([a-z_]+)<\/scriptid>/);
                const scriptStringId = match ? match[1] : null;

                if (scriptStringId) {
                    idEl.value = scriptStringId.replace('customscript', '');
                }
            })
            .catch(() => { });
    }

    function injectToggleAndListeners(container, labelEl, idEl, checkboxId) {
        const generateLabel = chrome.i18n.getMessage("autogenerateIdsGenerateIdLabel");

        const html = `
            <div class="nsft-autogenerate-wrapper">
                <label class="nsft-autogenerate-switch">
                    <input id="${checkboxId}" type="checkbox" checked="checked">
                    <span class="nsft-autogenerate-slider"></span>
                </label>
                <label for="${checkboxId}" class="nsft-autogenerate-label">${generateLabel}</label>
            </div>
        `;

        container.insertAdjacentHTML('afterend', html);
        _wrapper = container.nextElementSibling;
        _ac = new AbortController();
        _active = true;

        const checkbox = document.getElementById(checkboxId);

        labelEl.addEventListener('keyup', () => {
            clearTimeout(_debounceTimer);
            _debounceTimer = setTimeout(() => generateIdLogic(labelEl, idEl, checkbox), 120);
        }, { signal: _ac.signal });

        idEl.addEventListener('keyup', () => {
            if (checkbox) checkbox.checked = false;
        }, { signal: _ac.signal });

        if (labelEl.value && !idEl.value) {
            generateIdLogic(labelEl, idEl, checkbox);
        }
    }

    function generateIdLogic(labelEl, idEl, checkbox) {
        if (!checkbox || !checkbox.checked) return;

        const rawLabel = labelEl.value;
        const cleanedId = rawLabel
            .trim()
            .replace(/[^a-zA-Z0-9 ]/g, "")
            .replace(/ +(?= )/g, '')
            .replace(/ /g, '_')
            .toLowerCase();

        let finalId;
        if (idPrefix && cleanedId.startsWith(`${idPrefix}_`)) {
            finalId = `_${cleanedId}`;
        } else {
            finalId = idPrefix ? `_${idPrefix}_${cleanedId}` : `_${cleanedId}`;
        }

        const maxLength = idEl.getAttribute('maxlength');
        if (maxLength) {
            finalId = finalId.substring(0, maxLength);
        }

        idEl.value = finalId;
    }

})();
