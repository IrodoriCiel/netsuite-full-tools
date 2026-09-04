(function () {
    'use strict';

    function ensureTextSearch() {
        if (document.getElementById("nsft-text-search-mw")) return;
        const s = document.createElement("script");
        s.id = "nsft-text-search-mw";
        s.src = chrome.runtime.getURL("scripts/modules/_shared/nsft_text_search.js");
        s.async = false;
        s.onload = function () { this.remove(); };
        (document.head || document.documentElement).appendChild(s);
    }

    function ensureSqlTransport() {
        if (window.NSFT_SuiteQLRest && window.NSFT_SuiteQLRest.ensureTransport) {
            window.NSFT_SuiteQLRest.ensureTransport();
        }
        ensureTextSearch();
        ensureDialog();
    }

    function ensureDialog() {
        if (document.getElementById("nsft-dialog-mw")) return;
        const s = document.createElement("script");
        s.id = "nsft-dialog-mw";
        s.src = chrome.runtime.getURL("scripts/modules/_shared/nsft_dialog.js");
        s.async = false;
        s.onload = function () { this.remove(); };
        (document.head || document.documentElement).appendChild(s);
    }

    const STORAGE_KEY = 'enableSetFieldValues';
    let _arrancado = false;
    const AUDIT_KEY = 'enableFieldAuditQuickView';

    const SECCIONES = ['setFieldValuesShowHelp', 'setFieldValuesShowId',
        'setFieldValuesShowValue', 'setFieldValuesShowText', 'setFieldValuesShowType',
        'setFieldValuesShowFlags', 'setFieldValuesShowSetter', 'setFieldValuesShowOptions',
        'setFieldValuesShowEdit'];
    const _secciones = {};
    const NO_ICON_KEY = 'setFieldValuesNoIcon';
    const NSFT_THEME_KEY = 'nsftTheme';
    const HELP_COLLAPSED_KEY = 'nsftSfvHelpCollapsed';
    const META_COLLAPSED_KEY = 'nsftSfvMetaCollapsed';
    const HELP_TEMPLATES_KEY = 'nsftSfvHelpTemplates';
    const HELP_TEMPLATES_MAX = 40;
    const DIAG_KEY = 'nsftSelectorDiagnostics';
    const DIAG_FLAG = 'nsftSfvDiag';

    function _stampDiag(on) {
        try {
            if (on) document.documentElement.dataset[DIAG_FLAG] = '1';
            else delete document.documentElement.dataset[DIAG_FLAG];
        } catch (e) { }
    }
    let _nsftTheme = 'light';
    let _auditEnabled = true;
    let _noIcon = true;
    let _helpCollapsed = false;
    let _metaCollapsed = true;
    let _helpTemplates = {};

    function _resolveTheme() {
        return _nsftTheme === 'dark' ? 'dark' : 'light';
    }

    const ARRANQUE_DEFECTOS = {
        [STORAGE_KEY]: true,
        [AUDIT_KEY]: true,
        [NO_ICON_KEY]: true,
        [HELP_COLLAPSED_KEY]: false,
        ...Object.fromEntries(SECCIONES.map((k) => [k, true])),
        [META_COLLAPSED_KEY]: true,
        [HELP_TEMPLATES_KEY]: {},
        [NSFT_THEME_KEY]: 'light',
        [DIAG_KEY]: false
    };

    chrome.storage.local.get(ARRANQUE_DEFECTOS, (items) => {
        if (!items[STORAGE_KEY]) return;
        arrancar(items);
    });

    function arrancar(items) {
        if (_arrancado) return;
        _arrancado = true;
        _stampDiag(items[DIAG_KEY] === true);
        _nsftTheme = items[NSFT_THEME_KEY] || 'light';
        _auditEnabled = items[AUDIT_KEY] !== false;
        _noIcon = items[NO_ICON_KEY] !== false;
        _helpCollapsed = items[HELP_COLLAPSED_KEY] === true;
        SECCIONES.forEach((k) => { _secciones[k] = items[k] !== false; });
        _metaCollapsed = items[META_COLLAPSED_KEY] !== false;
        _helpTemplates = (items[HELP_TEMPLATES_KEY] && typeof items[HELP_TEMPLATES_KEY] === 'object')
            ? items[HELP_TEMPLATES_KEY] : {};
        init(items);
    }

    window.addEventListener('message', (event) => {
        if (event.source !== window || !event.data) return;

        if (event.data.type === 'nsft-sfv-help-collapsed') {
            _helpCollapsed = event.data.collapsed === true;
            chrome.storage.local.set({ [HELP_COLLAPSED_KEY]: _helpCollapsed });
            return;
        }
        if (event.data.type === 'nsft-sfv-meta-collapsed') {
            _metaCollapsed = event.data.collapsed === true;
            chrome.storage.local.set({ [META_COLLAPSED_KEY]: _metaCollapsed });
            return;
        }

        if (event.data.type === 'nsft-sfv-help-template') {
            const key = String(event.data.key || '');
            const params = event.data.params;
            if (!key || !params || typeof params !== 'object') return;

            _helpTemplates[key] = params;
            const keys = Object.keys(_helpTemplates);
            if (keys.length > HELP_TEMPLATES_MAX) {
                keys.slice(0, keys.length - HELP_TEMPLATES_MAX)
                    .forEach(k => { delete _helpTemplates[k]; });
            }
            chrome.storage.local.set({ [HELP_TEMPLATES_KEY]: _helpTemplates });
        }
    });

    chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== 'local') return;
        if (changes[STORAGE_KEY]) {
            const encendido = changes[STORAGE_KEY].newValue !== false;
            if (encendido && !_arrancado) {
                chrome.storage.local.get(ARRANQUE_DEFECTOS, (todo) => {
                    if (window.NSFT_RecordButtons && window.NSFT_RecordButtons.isExcludedPage
                        && window.NSFT_RecordButtons.isExcludedPage()) return;
                    arrancar(todo);
                });
            } else if (_arrancado) {
                window.postMessage({ type: 'nsft-set-field-values-enabled', enabled: encendido }, '*');
            }
        }
        if (changes[DIAG_KEY]) _stampDiag(changes[DIAG_KEY].newValue === true);
        if (changes[NSFT_THEME_KEY]) {
            _nsftTheme = changes[NSFT_THEME_KEY].newValue || 'light';
            window.postMessage({ type: 'nsft-set-field-values-theme', theme: _resolveTheme() }, '*');
        }
        if (changes[NO_ICON_KEY]) {
            _noIcon = changes[NO_ICON_KEY].newValue !== false;
            window.postMessage({ type: 'nsft-set-field-values-noicon', noIcon: _noIcon }, '*');
        }
        if (changes[AUDIT_KEY]) {
            _auditEnabled = changes[AUDIT_KEY].newValue !== false;
            window.postMessage({ type: 'nsft-set-field-values-audit', auditEnabled: _auditEnabled }, '*');
        }
        if (changes[HELP_COLLAPSED_KEY]) {
            _helpCollapsed = changes[HELP_COLLAPSED_KEY].newValue === true;
            window.postMessage({ type: 'nsft-set-field-values-helpcollapsed', collapsed: _helpCollapsed }, '*');
        }
        const tocadas = SECCIONES.filter((k) => changes[k]);
        if (tocadas.length) {
            tocadas.forEach((k) => { _secciones[k] = changes[k].newValue !== false; });
            window.postMessage({ type: 'nsft-set-field-values-sections', secciones: _secciones }, '*');
        }
        if (changes[META_COLLAPSED_KEY]) {
            _metaCollapsed = changes[META_COLLAPSED_KEY].newValue !== false;
            window.postMessage({ type: 'nsft-set-field-values-metacollapsed', collapsed: _metaCollapsed }, '*');
        }
    });


    function init(items) {
        injectScript();
    }

    function injectScript() {
        ensureSqlTransport();
        const script = document.createElement('script');
        script.async = false;
        script.src = chrome.runtime.getURL('scripts/modules/set_field_values/set_field_values_fetcher.js');
        script.onload = function () {
            this.remove();

            const TIPOS_CAMPO = ["checkbox", "date", "datetime", "timeofday", "select",
                "multiselect", "text", "textarea", "longtext", "richtext", "html",
                "percent", "currency", "float", "integer", "email", "phone", "url",
                "image", "file", "password", "radio"];
            const textosTipos = {};
            TIPOS_CAMPO.forEach(function (t) {
                textosTipos[t] = chrome.i18n.getMessage("fip_ftype_" + t);
            });

            const translations = {
                sfv_ftypes: textosTipos,
                sfv_field_value: chrome.i18n.getMessage("sfv_field_value"),
                sfv_value_more: chrome.i18n.getMessage("sfv_value_more"),
                sfv_value_less: chrome.i18n.getMessage("sfv_value_less"),
                sfv_field_text: chrome.i18n.getMessage("sfv_field_text"),
                sfv_enter_new_value: chrome.i18n.getMessage("sfv_enter_new_value"),
                sfv_set: chrome.i18n.getMessage("sfv_set"),
                sfv_internal_id: chrome.i18n.getMessage("sfv_internal_id"),
                sfv_text: chrome.i18n.getMessage("sfv_text"),
                sfv_copy_field_id: chrome.i18n.getMessage("sfv_copy_field_id"),
                sfv_copied: chrome.i18n.getMessage("sfv_copied"),
                sfv_custom_field: chrome.i18n.getMessage("sfv_custom_field"),
                sfv_standard_field: chrome.i18n.getMessage("sfv_standard_field"),
                sfv_help_label: chrome.i18n.getMessage("sfv_help_label"),
                sfv_help_show: chrome.i18n.getMessage("sfv_help_show"),
                sfv_help_hide: chrome.i18n.getMessage("sfv_help_hide"),
                sfv_help_toggle: chrome.i18n.getMessage("sfv_help_toggle"),
                sfv_help_open_tooltip: chrome.i18n.getMessage("sfv_help_open_tooltip"),
                sfv_help_topic: chrome.i18n.getMessage("sfv_help_topic"),
                sfv_open_settings: chrome.i18n.getMessage("sfv_open_settings"),
                sfv_tab_value: chrome.i18n.getMessage("sfv_tab_value"),
                sfv_tab_definition: chrome.i18n.getMessage("sfv_tab_definition"),
                sfv_tab_history: chrome.i18n.getMessage("sfv_tab_history"),
                sfv_field_type: chrome.i18n.getMessage("sfv_field_type"),
                sfv_display_type: chrome.i18n.getMessage("sfv_display_type"),
                sfv_display_normal: chrome.i18n.getMessage("sfv_display_normal"),
                sfv_display_inline: chrome.i18n.getMessage("sfv_display_inline"),
                sfv_display_disabled: chrome.i18n.getMessage("sfv_display_disabled"),
                sfv_display_hidden: chrome.i18n.getMessage("sfv_display_hidden"),
                sfv_list: chrome.i18n.getMessage("sfv_list"),
                sfv_list_search: chrome.i18n.getMessage("sfv_list_search"),
                sfv_list_loading: chrome.i18n.getMessage("sfv_list_loading"),
                sfv_list_count: chrome.i18n.getMessage("sfv_list_count"),
                sfv_open_record: chrome.i18n.getMessage("sfv_open_record"),
                sfv_list_more: chrome.i18n.getMessage("sfv_list_more"),
                sfv_list_none: chrome.i18n.getMessage("sfv_list_none"),
                sfv_list_empty: chrome.i18n.getMessage("sfv_list_empty"),
                sfv_list_error: chrome.i18n.getMessage("sfv_list_error"),
                sfv_find_clear: chrome.i18n.getMessage("sql_find_clear"),
                sfv_view_confirm_title: chrome.i18n.getMessage("sfv_view_confirm_title"),
                sfv_view_confirm_body: chrome.i18n.getMessage("sfv_view_confirm_body"),
                sfv_view_confirm_ok: chrome.i18n.getMessage("sfv_view_confirm_ok"),
                sfv_view_confirm_cancel: chrome.i18n.getMessage("sfv_view_confirm_cancel"),
                sfv_view_saving: chrome.i18n.getMessage("sfv_view_saving"),
                sfv_view_done: chrome.i18n.getMessage("sfv_view_done"),
                sfv_view_failed: chrome.i18n.getMessage("sfv_view_failed"),
                sfv_source_list: chrome.i18n.getMessage("sfv_source_list"),
                sfv_go_to_source_list: chrome.i18n.getMessage("sfv_go_to_source_list"),
                sfv_formula: chrome.i18n.getMessage("sfv_formula"),
                sfv_mandatory: chrome.i18n.getMessage("sfv_mandatory"),
                sfv_disabled: chrome.i18n.getMessage("sfv_disabled"),
                sfv_yes: chrome.i18n.getMessage("sfv_yes"),
                sfv_no: chrome.i18n.getMessage("sfv_no"),
                sfv_set_mandatory: chrome.i18n.getMessage("sfv_set_mandatory"),
                sfv_set_non_mandatory: chrome.i18n.getMessage("sfv_set_non_mandatory"),
                sfv_set_disabled: chrome.i18n.getMessage("sfv_set_disabled"),
                sfv_set_non_disabled: chrome.i18n.getMessage("sfv_set_non_disabled"),
                sfv_loading: chrome.i18n.getMessage("sfv_loading"),
                sfv_title: chrome.i18n.getMessage("sfv_title"),
                sfv_edit_field_label: chrome.i18n.getMessage("sfv_edit_field_label"),
                sfv_edit_field_btn: chrome.i18n.getMessage("sfv_edit_field_btn"),
                sfv_edit_tooltip: chrome.i18n.getMessage("sfv_edit_tooltip"),
                sfv_copy_tooltip: chrome.i18n.getMessage("sfv_copy_tooltip"),
                sfv_waiting: chrome.i18n.getMessage("sfv_waiting"),
                sfv_searching: chrome.i18n.getMessage("sfv_searching"),
                sfv_not_found: chrome.i18n.getMessage("sfv_not_found"),
                sfv_std_unknown: chrome.i18n.getMessage("sfv_std_unknown"),
                sfv_na: chrome.i18n.getMessage("sfv_na"),
                sfv_std_desc: chrome.i18n.getMessage("sfv_std_desc"),
                sfv_null_error: chrome.i18n.getMessage("sfv_null_error"),
                sfv_copied: chrome.i18n.getMessage("sfv_copied"),
                maximizeModal: chrome.i18n.getMessage("maximizeModal"),
                closeModal: chrome.i18n.getMessage("closeModal"),
                fav_loading: chrome.i18n.getMessage("fav_loading"),
                fav_no_history: chrome.i18n.getMessage("fav_no_history"),
                fav_error: chrome.i18n.getMessage("fav_error"),
                fav_old_value: chrome.i18n.getMessage("fav_old_value"),
                fav_new_value: chrome.i18n.getMessage("fav_new_value"),
                fav_error_permission: chrome.i18n.getMessage("fav_error_permission"),
                fav_filter_all: chrome.i18n.getMessage("fav_filter_all"),
                fav_filter_user: chrome.i18n.getMessage("fav_filter_user"),
                fav_filter_from: chrome.i18n.getMessage("fav_filter_from"),
                fav_filter_to: chrome.i18n.getMessage("fav_filter_to"),
                fav_copy_change: chrome.i18n.getMessage("fav_copy_change")
            };

            window.postMessage({
                type: 'nsft-set-field-values-init',
                translations: translations,
                theme: _resolveTheme(),
                auditEnabled: _auditEnabled,
                noIcon: _noIcon,
                helpCollapsed: _helpCollapsed,
                secciones: _secciones,
                metaCollapsed: _metaCollapsed,
                helpTemplates: _helpTemplates
            }, '*');
        };
        (document.head || document.documentElement).appendChild(script);
    }

})();

(function () {
    'use strict';

    const COACH_KEY = 'nsftSfvSectionsCoachSeen';

    window.addEventListener('message', (event) => {
        if (event.source !== window) return;
        const d = event.data;
        if (!d || d.dest !== 'extension_sfv') return;
        if (d.type === 'openSettings') abrirAjustes();
        else if (d.type === 'coach') quizaCoach();
    });

    function abrirAjustes() {
        try {
            chrome.runtime.sendMessage({
                action: 'nsftOpenSettings',
                highlight: 'enableSetFieldValues'
            });
        } catch (e) { }
    }

    function quizaCoach() {
        if (document.getElementById('nsft-sfv-coach')) return;
        chrome.storage.local.get([COACH_KEY], (items) => {
            if (items && items[COACH_KEY]) return;
            pintarCoach();
        });
    }

    function t(clave, porDefecto) {
        try { return chrome.i18n.getMessage(clave) || porDefecto; }
        catch (e) { return porDefecto; }
    }

    function pintarCoach() {
        const wrap = document.createElement('div');
        wrap.id = 'nsft-sfv-coach';
        wrap.className = 'nsft-coach';
        wrap.setAttribute('data-nsft-ui', '');
        wrap.setAttribute('role', 'status');

        const body = document.createElement('div');
        body.className = 'nsft-coach-body';

        const title = document.createElement('div');
        title.className = 'nsft-coach-title';
        title.textContent = t('sfvCoachTitle', 'Ahora eliges qué ves');

        const text = document.createElement('div');
        text.className = 'nsft-coach-text';
        text.textContent = t('sfvCoachBody', '');

        const actions = document.createElement('div');
        actions.className = 'nsft-coach-actions';

        const never = document.createElement('button');
        never.type = 'button';
        never.className = 'nsft-coach-never';
        never.textContent = t('sfvCoachDismiss', 'No volver a mostrar');
        never.addEventListener('click', () => {
            wrap.remove();
            try { chrome.storage.local.set({ [COACH_KEY]: true }); } catch (e) { }
        });

        const cfg = document.createElement('button');
        cfg.type = 'button';
        cfg.className = 'nsft-coach-never';
        cfg.textContent = t('coach_open_settings', 'Abrir configuración');
        cfg.addEventListener('click', () => { abrirAjustes(); wrap.remove(); });

        actions.appendChild(cfg);
        actions.appendChild(never);
        body.appendChild(title);
        body.appendChild(text);
        body.appendChild(actions);

        const close = document.createElement('button');
        close.type = 'button';
        close.className = 'nsft-coach-close';
        close.setAttribute('aria-label', t('coach_close', 'Cerrar'));
        close.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"></path></svg>';
        close.addEventListener('click', () => wrap.remove());

        wrap.appendChild(body);
        wrap.appendChild(close);
        document.body.appendChild(wrap);
    }
})();
