(function () {
    'use strict';

    chrome.storage.local.get({
        enableBetterPageTitles: true,
        enableFixedSublistColumn: true,
        enableFixedSublistHeaders: true,
        enableFixedTabs: true,
        enableSmallerDropdownOptions: true,
        dropdownPixelHeight: 0,
        enableSmallerNavigationOptions: true,
        navigationPixelHeight: 30,
        enableSmallerMainMenu: true,
        mainMenuFontSize: 13,
        enableSmallerSublistHeaders: true,
        enableProfileButton: true
    }, (items) => {
        if (items.enableBetterPageTitles) startBetterPageTitles();
        if (items.enableFixedSublistColumn) runFixedSublistColumn();
        if (items.enableFixedSublistHeaders) runFixedSublistHeaders();
        if (items.enableFixedTabs) runFixedTabs();
        if (items.enableSmallerDropdownOptions) runSmallerDropdownOptions(items.dropdownPixelHeight);
        if (items.enableSmallerNavigationOptions) runSmallerNavigationOptions(items.navigationPixelHeight);
        if (items.enableSmallerMainMenu) runSmallerMainMenu(items.mainMenuFontSize);
        if (items.enableSmallerSublistHeaders) runSmallerSublistHeaders();
        if (items.enableProfileButton) startProfileButton();
    });

    chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== 'local') return;
        if (changes.enableBetterPageTitles) {
            if (changes.enableBetterPageTitles.newValue !== false) startBetterPageTitles();
            else stopBetterPageTitles();
        }
        if (changes.enableProfileButton) {
            if (changes.enableProfileButton.newValue !== false) startProfileButton();
            else stopProfileButton();
        }
        if (changes.enableFixedTabs) {
            if (changes.enableFixedTabs.newValue !== false) runFixedTabs();
            else stopFixedTabs();
        }
        if (changes.enableFixedSublistColumn) {
            if (changes.enableFixedSublistColumn.newValue !== false) runFixedSublistColumn();
            else stopFixedSublistColumn();
        }
        if (changes.enableFixedSublistHeaders) {
            if (changes.enableFixedSublistHeaders.newValue !== false) runFixedSublistHeaders();
            else stopFixedSublistHeaders();
        }
        if (changes.enableSmallerSublistHeaders) {
            if (changes.enableSmallerSublistHeaders.newValue !== false) runSmallerSublistHeaders();
            else stopSmallerSublistHeaders();
        }
        if (changes.enableSmallerDropdownOptions || changes.dropdownPixelHeight) {
            chrome.storage.local.get({ enableSmallerDropdownOptions: true, dropdownPixelHeight: 0 }, (it) => {
                if (it.enableSmallerDropdownOptions) runSmallerDropdownOptions(it.dropdownPixelHeight);
                else stopSmallerDropdownOptions();
            });
        }
        if (changes.enableSmallerNavigationOptions || changes.navigationPixelHeight) {
            chrome.storage.local.get({ enableSmallerNavigationOptions: true, navigationPixelHeight: 30 }, (it) => {
                if (it.enableSmallerNavigationOptions) runSmallerNavigationOptions(it.navigationPixelHeight);
                else stopSmallerNavigationOptions();
            });
        }
        if (changes.enableSmallerMainMenu || changes.mainMenuFontSize) {
            chrome.storage.local.get({ enableSmallerMainMenu: true, mainMenuFontSize: 13 }, (it) => {
                if (it.enableSmallerMainMenu) runSmallerMainMenu(it.mainMenuFontSize);
                else stopSmallerMainMenu();
            });
        }
    });

    const PAGE_TITLE_DEFINITIONS = [
        { selectors: ['.nshelp_title'], pattern: 'Help: {0}' },
        {
            selectors: ['#name_fs_lbl_uir_label + .uir-field', '#scripttype_lbl_uir_label + span.uir-field.inputreadonly'],
            pattern: '{0} ({1})'
        },
        {
            selectors: ['#name_fs_lbl_uir_label + .uir-field input', '#scripttype_lbl_uir_label + span.uir-field.inputreadonly'],
            pattern: '{0} ({1})'
        },
        {
            selectors: ['.uir-record-id', ['.uir-record-type', '.uir-field-input']],
            pattern: '{0} ({1})'
        },
        {
            selectors: ['.uir-record-name', ['.uir-record-type', '.uir-field-input']],
            pattern: '{0} ({1})'
        }
    ];

    let _betterTitlesActive = false;
    let _betterTitlesUnsub = null;

    function resolveTitleSlot(slot) {
        const list = Array.isArray(slot) ? slot : [slot];
        const DOM = window.NSFT_DOM;
        if (DOM && DOM.q) {
            return DOM.q(list, { module: 'fix_improve_ui_ux', purpose: 'better page titles' });
        }
        for (const sel of list) {
            const el = document.querySelector(sel);
            if (el) return el;
        }
        return null;
    }

    function runBetterPageTitles() {
        for (const titleDef of PAGE_TITLE_DEFINITIONS) {
            const titleData = [];

            for (const slot of titleDef.selectors) {
                const el = resolveTitleSlot(slot);
                if (!el) continue;
                if (el.tagName === 'INPUT') {
                    if (el.value) titleData.push(el.value);
                } else {
                    const text = el.textContent ? el.textContent.trim() : '';
                    if (text) titleData.push(text);
                }
            }

            if (titleData.length === titleDef.selectors.length) {
                const pattern = titleDef.pattern || '{0}';
                let newTitle = pattern;
                titleData.forEach((data, index) => {
                    newTitle = newTitle.replace(`{${index}}`, data);
                });

                const titleEl = document.querySelector('head title');
                if (titleEl && titleEl.textContent !== newTitle) titleEl.textContent = newTitle;
                return;
            }
        }
    }

    function startBetterPageTitles() {
        if (_betterTitlesActive) return;
        try {
            if (window.NSFT_RecordButtons && NSFT_RecordButtons.isHeaderlessPage && NSFT_RecordButtons.isHeaderlessPage()) return;
        } catch (e) { }

        _betterTitlesActive = true;
        runBetterPageTitles();
        if (window.NSFT_Observer) {
            _betterTitlesUnsub = NSFT_Observer.subscribe(runBetterPageTitles, { throttle: 500 });
        }
    }

    function stopBetterPageTitles() {
        if (!_betterTitlesActive) return;
        _betterTitlesActive = false;
        if (_betterTitlesUnsub) { _betterTitlesUnsub(); _betterTitlesUnsub = null; }
    }

    const FSC_CLASS = 'nsft-fsc-on';
    const FSH_CLASS = 'nsft-fsh-on';
    const FSC_STYLE_ID = 'nsft-fsc-style';
    const FSH_STYLE_ID = 'nsft-fsh-style';
    const SUBLIST_SHARED_STYLE_ID = 'nsft-sublist-shared-style';
    const SUBLIST_CHROME_PX = 299;

    function ensureSublistSharedStyle() {
        if (document.getElementById(SUBLIST_SHARED_STYLE_ID)) return;
        const style = document.createElement('style');
        style.id = SUBLIST_SHARED_STYLE_ID;
        style.textContent = `
            html.${FSC_CLASS} .uir-machine-table-container,
            html.${FSH_CLASS} .uir-machine-table-container {
                max-height: calc(100vh - ${SUBLIST_CHROME_PX}px);
                contain: layout;
            }
            html.${FSC_CLASS} .uir-machine-table-container > div:last-child,
            html.${FSH_CLASS} .uir-machine-table-container > div:last-child {
                visibility: hidden;
            }
        `;
        (document.head || document.documentElement).appendChild(style);
    }

    function ensureFscStyle() {
        if (document.getElementById(FSC_STYLE_ID)) return;
        const style = document.createElement('style');
        style.id = FSC_STYLE_ID;
        style.textContent = `
            /* Borde de la columna fija como variable (antes #e3e3e2 hardcoded). Mismo gris
               claro por defecto: la UI nativa de NetSuite no se oscurece sola, así que
               NO se condiciona este borde al tema (pintaría un borde negro sobre la
               sublista clara). La coordinación con un tema oscuro real queda para el
               cross-link con enableColorThemes, que expone su propia señal de tema. */
            html.${FSC_CLASS} { --nsft-sublist-col-border: #e3e3e2; }
            /* La 1ª celda de la 1ª fila es la ESQUINA donde se cruzan la columna sticky
               (left, z2) y la cabecera sticky (top, z1); necesita z-index mayor (3) para
               quedar por encima de ambos ejes en la intersección. */
            html.${FSC_CLASS} .uir-machine-table-container > table:not(.openList) .listtable>tbody>tr:first-child:not(.uir-machine-row-last):not(.uir-machine-row-focused)>td:first-child,
            html.${FSC_CLASS} .uir-machine-table-container > table:not(.openList) tbody>tr:first-child>td:first-child {
                z-index: 3;
            }
            html.${FSC_CLASS} .uir-machine-table-container > table:not(.openList) .listtable>tbody>tr:not(.uir-machine-row-last):not(.uir-machine-row-focused)>td:first-child,
            html.${FSC_CLASS} .uir-machine-table-container > table:not(.openList) tbody>tr>td:first-child {
                position: sticky;
                left: 0;
                z-index: 2;
                border-right: 1px solid var(--nsft-sublist-col-border, #e3e3e2) !important;
            }

            /* UN CARRIL PARA CADA UNA cuando también están los números de línea.
               'Números de línea de sublista' pinta su celda "#" como un tr::before
               con position:sticky; left:0, y esta feature fija el primer <td> en
               left:0 igualmente. Pero 'left' se mide contra el borde del área de
               scroll, NO contra la celda vecina: con las dos activas se anclarían
               en el mismo punto y el <td> (z-index 2) taparía al "#" (z-index 1).
               Con la columna "#" delante, el primer <td> arranca donde ella acaba.

               Se apoya en 'html.nsft-sln-on' y en --nsft-sln-width, que ese módulo
               ya publica en <html>: así el ancho de las dos piezas sale del MISMO
               sitio y no hay número mágico que se descuadre. El selector lleva las
               dos clases, o sea más especificidad que la regla de arriba, y sólo
               actúa cuando ambas features están encendidas. */
            html.nsft-sln-on.${FSC_CLASS} .uir-machine-table-container > table:not(.openList) .listtable>tbody>tr:not(.uir-machine-row-last):not(.uir-machine-row-focused)>td:first-child,
            html.nsft-sln-on.${FSC_CLASS} .uir-machine-table-container > table:not(.openList) tbody>tr>td:first-child {
                left: var(--nsft-sln-width, 26px);
            }
        `;
        (document.head || document.documentElement).appendChild(style);
    }

    function ensureFshStyle() {
        if (document.getElementById(FSH_STYLE_ID)) return;
        const style = document.createElement('style');
        style.id = FSH_STYLE_ID;
        style.textContent = `
            html.${FSH_CLASS} .uir-machine-table-container > table tr.uir-list-headerrow > td,
            html.${FSH_CLASS} .uir-machine-table-container > table tr.uir-machine-headerrow > td {
                position: sticky;
                top: 0;
                z-index: 1;
            }
        `;
        (document.head || document.documentElement).appendChild(style);
    }

    function runFixedSublistColumn() {
        try {
            if (window.NSFT_RecordButtons && NSFT_RecordButtons.isHeaderlessPage && NSFT_RecordButtons.isHeaderlessPage()) return;
        } catch (e) { }
        ensureSublistSharedStyle();
        ensureFscStyle();
        document.documentElement.classList.add(FSC_CLASS);
    }
    function stopFixedSublistColumn() {
        document.documentElement.classList.remove(FSC_CLASS);
    }

    function runFixedSublistHeaders() {
        try {
            if (window.NSFT_RecordButtons && NSFT_RecordButtons.isHeaderlessPage && NSFT_RecordButtons.isHeaderlessPage()) return;
        } catch (e) { }
        ensureSublistSharedStyle();
        ensureFshStyle();
        document.documentElement.classList.add(FSH_CLASS);
    }
    function stopFixedSublistHeaders() {
        document.documentElement.classList.remove(FSH_CLASS);
    }

    const FIXED_TABS_STYLE_ID = 'nsft-fixed-tabs-style';

    function runFixedTabs() {
        const params = new URLSearchParams(window.location.search);
        if (params.get('l') === 'T') return;
        if (!/\.nl$/.test(window.location.pathname)) return;
        try {
            if (window.NSFT_RecordButtons && NSFT_RecordButtons.isHeaderlessPage && NSFT_RecordButtons.isHeaderlessPage()) return;
        } catch (e) { }

        if (document.getElementById(FIXED_TABS_STYLE_ID)) return;

        const style = document.createElement('style');
        style.id = FIXED_TABS_STYLE_ID;
        style.textContent = `
            /* Offsets de las barras sticky como variables CSS, para poder coordinarlos
               con otros módulos (p. ej. Field Groups flotantes) sin reescribir selectores.
               z-index intencional, no arbitrario: por encima de las sticky de sublista
               (z 2/3) y de los títulos de field group (z 3), por debajo de los modales NSFT. */
            :root {
                --nsft-fixed-tabs-top-level1: 2px;
                --nsft-fixed-tabs-top-level2: 32px;
                --nsft-fixed-tabs-z: 9;
            }
            /* Nota: sin will-change/contain. El target es un <tr> (display:table-row);
               promoverlo a su propia capa de compositing lo "levanta" del flujo de la
               tabla y deja un hueco fantasma. El sticky de Chrome ya se compone solo. */
            #div__body > table.uir-table-block.uir_form_tab_container > tbody > tr:nth-child(1) {
                position: sticky;
                top: var(--nsft-fixed-tabs-top-level1, 2px);
                z-index: var(--nsft-fixed-tabs-z, 9);
            }
            #results_tab_div > div > table > tbody > tr:nth-child(1), /* Para la mayoría de otras páginas */
            .nltabcontent > .uir-table-block > tbody > tr:nth-child(1) /* Para página de formulario */
            {
                position: sticky;
                top: var(--nsft-fixed-tabs-top-level2, 32px);
                z-index: var(--nsft-fixed-tabs-z, 9);
            }
            /* Los popovers nativos (dropdown de fecha "Filtros rápidos", listas
               desplegables) que se abren hacia arriba quedaban cortados por la barra
               de pestañas fija (z 9): el popup nativo no trae z-index propio. Lo
               elevamos por encima de la pila sticky para que quede completo y clicable.
               El !important cubre el caso de que NetSuite fije un z-index inline bajo. */
            .dropdownDiv {
                z-index: calc(var(--nsft-fixed-tabs-z, 9) + 1) !important;
            }`;
        (document.head || document.documentElement).appendChild(style);
    }

    function stopFixedTabs() {
        document.getElementById(FIXED_TABS_STYLE_ID)?.remove();
    }

    const SDO_CLASS = 'nsft-sdo-on';
    const SDO_STYLE_ID = 'nsft-sdo-style';
    const SDO_PAD_VAR = '--nsft-sdo-pad';
    const SDO_LH_VAR = '--nsft-sdo-lh';

    function ensureDropdownStyle() {
        if (document.getElementById(SDO_STYLE_ID)) return;
        const style = document.createElement('style');
        style.id = SDO_STYLE_ID;
        style.textContent = `
            /* Padding vertical configurable. El selector base ya matchea TAMBIÉN los
               items Redwood (que viven dentro de .uir-tooltip-content), así que el padding
               se declara UNA sola vez (antes estaba duplicado en un bloque aparte). */
            html.${SDO_CLASS} .dropdownDiv .dropdownNotSelected,
            html.${SDO_CLASS} .dropdownDiv .dropdownSelected {
                padding: var(${SDO_PAD_VAR}, 0px) 3px !important;
            }
            /* Redwood-only: sus items reciben min-height/height/line-height propios que
               mantienen las filas altas aunque el padding sea 0; los neutralizamos. */
            html.${SDO_CLASS} .uir-tooltip-content .dropdownDiv .dropdownNotSelected,
            html.${SDO_CLASS} .uir-tooltip-content .dropdownDiv .dropdownSelected {
                min-height: 0 !important;
                height: auto !important;
                line-height: var(${SDO_LH_VAR}, 16px) !important;
            }
        `;
        (document.head || document.documentElement).appendChild(style);
    }

    function runSmallerDropdownOptions(height) {
        try {
            if (window.NSFT_RecordButtons && NSFT_RecordButtons.isHeaderlessPage && NSFT_RecordButtons.isHeaderlessPage()) return;
        } catch (e) { }

        ensureDropdownStyle();
        const pad = Math.max(0, Number(height) || 0);
        const lineHeight = 16 + pad * 2;
        document.documentElement.style.setProperty(SDO_PAD_VAR, `${pad}px`);
        document.documentElement.style.setProperty(SDO_LH_VAR, `${lineHeight}px`);
        document.documentElement.classList.add(SDO_CLASS);
    }

    function stopSmallerDropdownOptions() {
        document.documentElement.classList.remove(SDO_CLASS);
    }

    const NAV_CLASS = 'nsft-compact-nav';
    const NAV_STYLE_ID = 'nsft-compact-nav-style';
    const NAV_HEIGHT_VAR = '--nsft-nav-item-h';

    function ensureNavStyle() {
        if (document.getElementById(NAV_STYLE_ID)) return;
        const style = document.createElement('style');
        style.id = NAV_STYLE_ID;
        const popover = `html.${NAV_CLASS} body > div[data-widget="Popover"][data-role="popover"][role="dialog"]`;
        const menuItem = `${popover} div[role="menuitem"][data-widget="MenuItem"]`;
        style.textContent = `
            ${popover} { height: initial !important; max-height: 600px !important; }
            ${menuItem} { height: var(${NAV_HEIGHT_VAR}, 30px); }
            ${menuItem} div[data-widget="MenuItemContent"] {
                height: var(${NAV_HEIGHT_VAR}, 30px);
                min-height: var(${NAV_HEIGHT_VAR}, 30px);
            }
        `;
        (document.head || document.documentElement).appendChild(style);
    }

    function runSmallerNavigationOptions(height) {
        try {
            if (window.NSFT_RecordButtons && NSFT_RecordButtons.isHeaderlessPage && NSFT_RecordButtons.isHeaderlessPage()) return;
        } catch (e) { }

        ensureNavStyle();
        const pxHeight = height || 30;
        document.documentElement.style.setProperty(NAV_HEIGHT_VAR, `${pxHeight}px`);
        document.documentElement.classList.add(NAV_CLASS);
    }

    function stopSmallerNavigationOptions() {
        document.documentElement.classList.remove(NAV_CLASS);
    }

    const MAINMENU_CLASS = 'nsft-smaller-mainmenu';
    const MAINMENU_STYLE_ID = 'nsft-smaller-mainmenu-style';
    const MAINMENU_ZOOM_VAR = '--nsft-mainmenu-zoom';
    const MAINMENU_BASE_FS = 14;

    function ensureMainMenuStyle() {
        if (document.getElementById(MAINMENU_STYLE_ID)) return;
        const style = document.createElement('style');
        style.id = MAINMENU_STYLE_ID;
        const nav = `html.${MAINMENU_CLASS} div[data-header-section="navigation"]`;
        style.textContent = `
            ${nav} {
                zoom: var(${MAINMENU_ZOOM_VAR}, 1);
            }
            /* El zoom encoge TODO por igual (texto, iconos, padding, alto), lo que deja la
               letra demasiado pequeña. Contra-escalamos solo el texto para que encoja mucho
               más despacio que el contenedor: el alto sigue bajando (lo manda el padding y
               los iconos), pero las letras se mantienen legibles.
               Como el texto vive dentro del bloque con zoom, su tamaño en pantalla es
               (font-size · zoom). Con font-size = 7px/zoom + 7px el tamaño visible queda en
               7·(1 + zoom): 14px al 100%, ~13px al 86% (preset Compacto), nunca diminuto. */
            ${nav} [data-widget="MenuItem"] [data-widget="Text"] {
                font-size: calc(7px / var(${MAINMENU_ZOOM_VAR}, 1) + 7px) !important;
            }
        `;
        (document.head || document.documentElement).appendChild(style);
    }

    function runSmallerMainMenu(fontSize) {
        try {
            if (window.NSFT_RecordButtons && NSFT_RecordButtons.isHeaderlessPage && NSFT_RecordButtons.isHeaderlessPage()) return;
        } catch (e) { }

        ensureMainMenuStyle();
        const fs = fontSize || MAINMENU_BASE_FS;
        const zoom = fs / MAINMENU_BASE_FS;
        document.documentElement.style.setProperty(MAINMENU_ZOOM_VAR, `${zoom}`);
        document.documentElement.classList.add(MAINMENU_CLASS);
    }

    function stopSmallerMainMenu() {
        document.documentElement.classList.remove(MAINMENU_CLASS);
    }

    const SSH_CLASS = 'nsft-ssh-on';
    const SSH_STYLE_ID = 'nsft-ssh-style';

    function ensureSshStyle() {
        if (document.getElementById(SSH_STYLE_ID)) return;
        const style = document.createElement('style');
        style.id = SSH_STYLE_ID;
        style.textContent = `
            html.${SSH_CLASS} tr.uir-machine-headerrow,
            html.${SSH_CLASS} tr.uir-list-headerrow {
                white-space: nowrap !important;
            }
        `;
        (document.head || document.documentElement).appendChild(style);
    }

    function runSmallerSublistHeaders() {
        try {
            if (window.NSFT_RecordButtons && NSFT_RecordButtons.isHeaderlessPage && NSFT_RecordButtons.isHeaderlessPage()) return;
        } catch (e) { }
        ensureSshStyle();
        document.documentElement.classList.add(SSH_CLASS);
    }
    function stopSmallerSublistHeaders() {
        document.documentElement.classList.remove(SSH_CLASS);
    }

    const PROFILE_BTN_ID = 'nsft-profile-button';
    const PROFILE_EDIT_MENU_ID = 'nsft-profile-edit-menu';
    const PROFILE_STYLE_ID = 'nsft-profile-style';
    const PROFILE_ICON_PATH = 'M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z';
    const SVG_NS = 'http://www.w3.org/2000/svg';

    let _profileActive = false;
    let _profileUserId = null;
    let _profileUnsub = null;
    let _profileMsgHandler = null;
    let _profileHideTimer = null;

    function startProfileButton() {
        if (_profileActive) return;
        try {
            if (window.NSFT_RecordButtons && NSFT_RecordButtons.isHeaderlessPage && NSFT_RecordButtons.isHeaderlessPage()) return;
        } catch (e) { }

        _profileActive = true;

        if (_profileUserId) { ensureProfileButton(); return; }

        _profileMsgHandler = (event) => {
            if (event.source !== window || event.origin !== window.location.origin) return;
            const data = event.data;
            if (!data || data.dest !== 'extension_profile' || !data.userId) return;
            window.removeEventListener('message', _profileMsgHandler);
            _profileMsgHandler = null;
            _profileUserId = String(data.userId);
            if (_profileActive) ensureProfileButton();
        };
        window.addEventListener('message', _profileMsgHandler);

        try {
            const script = document.createElement('script');
            script.src = chrome.runtime.getURL('scripts/modules/fix_improve_ui_ux/get_user_id.js');
            script.onload = function () { this.remove(); };
            script.onerror = function () { this.remove(); };
            (document.head || document.documentElement).appendChild(script);
        } catch (e) { }
    }

    function ensureProfileButton() {
        if (renderProfileButton()) return;
        if (window.NSFT_Observer && !_profileUnsub) {
            _profileUnsub = NSFT_Observer.subscribe(() => {
                if (renderProfileButton() && _profileUnsub) { _profileUnsub(); _profileUnsub = null; }
            }, { throttle: 300 });
        }
    }

    function stopProfileButton() {
        if (!_profileActive) return;
        _profileActive = false;
        if (_profileUnsub) { _profileUnsub(); _profileUnsub = null; }
        if (_profileMsgHandler) { window.removeEventListener('message', _profileMsgHandler); _profileMsgHandler = null; }
        clearTimeout(_profileHideTimer);
        document.getElementById(PROFILE_BTN_ID)?.remove();
        document.getElementById(PROFILE_EDIT_MENU_ID)?.remove();
        document.getElementById(PROFILE_STYLE_ID)?.remove();
    }

    function renderProfileButton() {
        if (document.getElementById(PROFILE_BTN_ID)) return true;
        if (!_profileUserId) return false;

        const DOM = window.NSFT_DOM;
        const feedbackButton = DOM
            ? DOM.q(['[data-automation-id="FeedbackMenuItem"]', '[aria-label*="Feedback"]'], { module: 'fix_improve_ui_ux', purpose: 'feedback menu item' })
            : document.querySelector('[data-automation-id="FeedbackMenuItem"]');
        const roleButton = DOM
            ? DOM.q(['[data-automation-id="RoleMenuItem"]', '[aria-label*="Role"]'], { module: 'fix_improve_ui_ux', purpose: 'role menu item' })
            : document.querySelector('[data-automation-id="RoleMenuItem"]');

        if (!feedbackButton && !roleButton) return false;

        const label = chrome.i18n.getMessage('profileButtonLabel') || 'Profile';
        const sourceButton = feedbackButton || roleButton;
        const profileButton = sourceButton.cloneNode(true);

        profileButton.id = PROFILE_BTN_ID;
        profileButton.setAttribute('data-automation-id', 'ProfileMenuItem');
        profileButton.setAttribute('aria-label', label);
        profileButton.title = label;
        profileButton.removeAttribute('data-header-section');
        profileButton.querySelectorAll('[id]').forEach((el) => el.removeAttribute('id'));

        profileButton.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (e.ctrlKey || e.metaKey || e.shiftKey) window.open(profileUrl(false), '_blank');
            else window.location.href = profileUrl(false);
        };
        profileButton.addEventListener('mousedown', (e) => {
            if (e.button === 1) e.preventDefault();
        });
        profileButton.addEventListener('auxclick', (e) => {
            if (e.button !== 1) return;
            e.preventDefault();
            e.stopPropagation();
            window.open(profileUrl(false), '_blank');
        });

        profileButton.addEventListener('mouseenter', () => {
            clearTimeout(_profileHideTimer);
            showEditMenu();
        });
        profileButton.addEventListener('mouseleave', scheduleHideEditMenu);

        const labelEl = profileButton.querySelector('label');
        if (labelEl) labelEl.textContent = label;

        const svg = profileButton.querySelector('svg');
        if (svg) {
            while (svg.firstChild) svg.removeChild(svg.firstChild);
            svg.setAttribute('viewBox', '0 0 24 24');
            const path = document.createElementNS(SVG_NS, 'path');
            path.setAttribute('d', PROFILE_ICON_PATH);
            svg.appendChild(path);
        }

        if (feedbackButton) feedbackButton.insertAdjacentElement('afterend', profileButton);
        else roleButton.insertAdjacentElement('beforebegin', profileButton);
        return true;
    }

    function ensureProfileStyle() {
        if (document.getElementById(PROFILE_STYLE_ID)) return;
        const style = document.createElement('style');
        style.id = PROFILE_STYLE_ID;
        style.textContent = `
            #${PROFILE_EDIT_MENU_ID} {
                position: fixed;
                z-index: 1100;
                min-width: 200px;
                background: #ffffff;
                border: 1px solid #dfe3e8;
                border-radius: 0;
                box-shadow: rgba(0, 0, 0, 0.5) 0px 1px 4px 0px;
                padding: 0;
                display: none;
                /* Tipografía de NetSuite (Redwood): Oracle Sans, en negrita,
                   igual que los items nativos del menú de usuario. */
                font-family: "Oracle Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
                font-weight: 600;
                font-size: 14px;
                color: #2e3338;
                box-sizing: border-box;
                overflow: hidden;
            }
            #${PROFILE_EDIT_MENU_ID}.nsft-open { display: block; }
            #${PROFILE_EDIT_MENU_ID} .nsft-profile-edit-item {
                display: flex;
                align-items: center;
                padding: 10px 20px;
                line-height: 1.4;
                cursor: pointer;
                white-space: nowrap;
                color: inherit;
                text-decoration: none;
                outline: none;
            }
            #${PROFILE_EDIT_MENU_ID} .nsft-profile-edit-item:hover,
            #${PROFILE_EDIT_MENU_ID} .nsft-profile-edit-item:focus {
                background: #eceef0;
            }
            #${PROFILE_EDIT_MENU_ID} .nsft-profile-edit-label { flex-grow: 1; }

            /* --- Modo oscuro (NSFT Dark Mode) --- variante gris (por defecto) */
            html.nsft-dark-on #${PROFILE_EDIT_MENU_ID} {
                background: #2c2c2e;
                border-color: #3a3a3d;
                color: #e6e6e6;
                box-shadow: rgba(0, 0, 0, 0.6) 0px 2px 8px 0px;
            }
            html.nsft-dark-on #${PROFILE_EDIT_MENU_ID} .nsft-profile-edit-item:hover,
            html.nsft-dark-on #${PROFILE_EDIT_MENU_ID} .nsft-profile-edit-item:focus {
                background: #3a3a3d;
            }
            /* Variante NEGRO. */
            html.nsft-dark-on.nsft-dark-black #${PROFILE_EDIT_MENU_ID} {
                background: #1a1a1a;
                border-color: #333333;
            }
            html.nsft-dark-on.nsft-dark-black #${PROFILE_EDIT_MENU_ID} .nsft-profile-edit-item:hover,
            html.nsft-dark-on.nsft-dark-black #${PROFILE_EDIT_MENU_ID} .nsft-profile-edit-item:focus {
                background: #2a2a2a;
            }
        `;
        (document.head || document.documentElement).appendChild(style);
    }

    function buildEditMenu() {
        let menu = document.getElementById(PROFILE_EDIT_MENU_ID);
        if (menu) return menu;

        menu = document.createElement('div');
        menu.id = PROFILE_EDIT_MENU_ID;
        menu.setAttribute('role', 'menu');
        menu.setAttribute('aria-orientation', 'vertical');
        menu.setAttribute('data-nsft-ui', '');

        const group = document.createElement('div');
        group.setAttribute('role', 'group');

        const item = document.createElement('a');
        item.className = 'nsft-profile-edit-item';
        item.setAttribute('role', 'menuitem');
        item.href = profileUrl(true);
        item.tabIndex = 0;
        const label = document.createElement('span');
        label.className = 'nsft-profile-edit-label';
        label.textContent = chrome.i18n.getMessage('profileEditLabel') || 'Edit profile';
        item.appendChild(label);
        item.addEventListener('keydown', (e) => {
            if (e.key === ' ') { e.preventDefault(); goEditProfile(); }
        });

        group.appendChild(item);
        menu.appendChild(group);

        menu.addEventListener('mouseenter', () => clearTimeout(_profileHideTimer));
        menu.addEventListener('mouseleave', scheduleHideEditMenu);

        document.body.appendChild(menu);
        return menu;
    }

    function showEditMenu() {
        if (!_profileUserId) return;
        const btn = document.getElementById(PROFILE_BTN_ID);
        if (!btn) return;

        ensureProfileStyle();
        const menu = buildEditMenu();
        menu.classList.add('nsft-open');

        const rect = btn.getBoundingClientRect();
        const menuRect = menu.getBoundingClientRect();
        let left = rect.left;
        if (left + menuRect.width > window.innerWidth - 8) left = window.innerWidth - menuRect.width - 8;
        if (left < 8) left = 8;
        menu.style.left = `${left}px`;
        menu.style.top = `${rect.bottom}px`;
    }

    function scheduleHideEditMenu() {
        clearTimeout(_profileHideTimer);
        _profileHideTimer = setTimeout(hideEditMenu, 200);
    }

    function hideEditMenu() {
        document.getElementById(PROFILE_EDIT_MENU_ID)?.classList.remove('nsft-open');
    }

    function profileUrl(edit) {
        return `/app/common/entity/employee.nl?id=${encodeURIComponent(_profileUserId)}${edit ? '&e=T' : ''}`;
    }

    function goEditProfile() {
        if (!_profileUserId) return;
        window.location.href = profileUrl(true);
    }

})();
