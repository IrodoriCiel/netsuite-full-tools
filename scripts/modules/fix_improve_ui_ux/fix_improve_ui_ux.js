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
            when: () => /\/app\/common\/workflow\//i.test(location.pathname),
            selectors: [
                ['.page-title span.name', 'span.name'],
                () => _betterTitlesOriginalLabel
            ],
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
    let _betterTitlesOriginalLabel = null;
    let _betterTitlesOriginalTitle = null;

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
            if (titleDef.when && !titleDef.when()) continue;
            const titleData = [];

            for (const slot of titleDef.selectors) {
                if (typeof slot === 'function') {
                    const v = slot();
                    if (v) titleData.push(String(v));
                    continue;
                }
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

                const root = document.documentElement;
                root.setAttribute('data-nsft-page-name', titleData[0] || '');
                root.setAttribute('data-nsft-page-type', titleData.length > 1 ? (titleData[1] || '') : '');

                const titleEl = document.querySelector('head title');
                if (titleEl && titleEl.textContent !== newTitle) titleEl.textContent = newTitle;
                return;
            }
        }
        clearTitleStamps();
    }

    function clearTitleStamps() {
        const root = document.documentElement;
        root.removeAttribute('data-nsft-page-name');
        root.removeAttribute('data-nsft-page-type');
    }

    function startBetterPageTitles() {
        if (_betterTitlesActive) return;
        try {
            if (window.NSFT_RecordButtons && NSFT_RecordButtons.isHeaderlessPage && NSFT_RecordButtons.isHeaderlessPage()) return;
        } catch (e) { }

        _betterTitlesActive = true;
        if (_betterTitlesOriginalTitle == null) _betterTitlesOriginalTitle = String(document.title || '');
        if (_betterTitlesOriginalLabel == null) {
            _betterTitlesOriginalLabel = String(document.title || '')
                .replace(/\s*-\s*NetSuite\b.*$/i, '').replace(/[\s ]+/g, ' ').trim();
        }
        runBetterPageTitles();
        if (window.NSFT_Observer) {
            _betterTitlesUnsub = NSFT_Observer.subscribe(runBetterPageTitles, { throttle: 500 });
        }
    }

    function stopBetterPageTitles() {
        if (!_betterTitlesActive) return;
        _betterTitlesActive = false;
        if (_betterTitlesUnsub) { _betterTitlesUnsub(); _betterTitlesUnsub = null; }
        clearTitleStamps();
        const titleEl = document.querySelector('head title');
        if (titleEl && _betterTitlesOriginalTitle != null && titleEl.textContent !== _betterTitlesOriginalTitle) {
            titleEl.textContent = _betterTitlesOriginalTitle;
        }
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
               quedar por encima de ambos ejes en la intersección.

               Las listas que se reordenan arrastrando quedan FUERA en las tres reglas
               (:not de .uir-grippy en filas y .uir-column-grippy en cabecera): su
               primera celda es el agarre, no hay nada útil que fijar, y el carril de
               abajo la desplazaba sobre la columna vecina.

               EL '> tbody' VA COMO HIJO DIRECTO, Y NO ES CAPRICHO. Con el 'tbody'
               como descendiente, la rama genérica se metía DENTRO de las tablas
               anidadas que NetSuite usa para dibujar los botones de la línea
               —Agregar, Cancelar…, cada uno con su tablita de imágenes de
               esquina— y pegaba la primera celda de cada una. Con el repintado
               de fondo encima, esas celdas salían grises: de ahí el canto que
               aparecía encima de Agregar en la clásica. La sublista de verdad es
               hija directa del contenedor, así que la cadena de hijos la coge
               igual y las anidadas no. */
            html.${FSC_CLASS} .uir-machine-table-container > table:not(.openList) .listtable>tbody>tr:first-child:not(.uir-machine-row-last):not(.uir-machine-row-focused)>td:first-child:not(.uir-grippy):not(.uir-column-grippy),
            html.${FSC_CLASS} .uir-machine-table-container > table:not(.openList) > tbody>tr:first-child>td:first-child:not(.uir-grippy):not(.uir-column-grippy) {
                z-index: 3;
            }
            html.${FSC_CLASS} .uir-machine-table-container > table:not(.openList) .listtable>tbody>tr:not(.uir-machine-row-last):not(.uir-machine-row-focused)>td:first-child:not(.uir-grippy):not(.uir-column-grippy),
            html.${FSC_CLASS} .uir-machine-table-container > table:not(.openList) > tbody>tr>td:first-child:not(.uir-grippy):not(.uir-column-grippy) {
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
            html.nsft-sln-on.${FSC_CLASS} .uir-machine-table-container > table:not(.openList) .listtable>tbody>tr:not(.uir-machine-row-last):not(.uir-machine-row-focused)>td:first-child:not(.uir-grippy):not(.uir-column-grippy):not(.uir-machine-focused-cell),
            html.nsft-sln-on.${FSC_CLASS} .uir-machine-table-container > table:not(.openList) > tbody>tr:not(.uir-machine-row-focused)>td:first-child:not(.uir-grippy):not(.uir-column-grippy):not(.uir-machine-focused-cell) {
                left: var(--nsft-sln-width, 26px);
            }

            /* LA LÍNEA EN EDICIÓN TAMBIÉN SE QUEDA.
               La fila enfocada estaba excluida de las reglas de arriba —herencia
               de la extensión de referencia, que además sólo fija la columna
               fuera de Redwood—, así que al ir a la derecha se iba entera
               mientras el resto de la tabla se quedaba. Va aparte y no dentro de
               aquellas por dos motivos:

               · '!important' en el 'position': NetSuite le pone a esa celda un
                 'style="position: relative"' EN LÍNEA, y un estilo en línea gana
                 a cualquier regla nuestra. Sin esto no se pega, se quede o no en
                 el selector.
               · el 'left' se declara aquí mismo. Y eso, de paso, quita la causa
                 del punto 85 (la línea nueva corrida a la derecha): aquel fallo
                 salía de que la celda seguía en 'relative' mientras la regla del
                 carril de números le metía un 'left', que sobre un elemento
                 relativo DESPLAZA. En 'sticky', 'left' sólo dice dónde se pega. */
            html.${FSC_CLASS} .uir-machine-table-container > table:not(.openList) tr.uir-machine-row-focused>td:first-child:not(.uir-grippy):not(.uir-column-grippy) {
                position: sticky !important;
                left: 0;
                z-index: 2;
                border-right: 1px solid var(--nsft-sublist-col-border, #e3e3e2) !important;
            }
            html.nsft-sln-on.${FSC_CLASS} .uir-machine-table-container > table:not(.openList) tr.uir-machine-row-focused>td:first-child:not(.uir-grippy):not(.uir-column-grippy) {
                left: var(--nsft-sln-width, 26px);
            }

            /* Y LOS BOTONES DE LA LÍNEA (Agregar / Cancelar / Copiar anterior…).
               Aquí no vale fijar la celda: la fila de botones es UN solo
               <td colspan="16"> que ocupa la tabla entera, y pegar algo tan ancho
               como lo que se desplaza no pega nada.

               SE PEGA EL <div>, Y EL 'width' NO ES OPCIONAL. Una caja 'sticky'
               sólo puede deslizarse DENTRO de su bloque contenedor: el del <div>
               es el <td> ancho —hay holgura de sobra—, mientras que el de la
               tabla de dentro es el propio <div>, que se va con el contenido.
               Medido en vivo: pegando la tabla, 'position' decía 'sticky' y aun
               así se quedaba en x = -34 con el contenedor en x = 25. Por eso el
               <div> encogido a 'max-content' es el único punto de agarre: a lo
               ancho del <td> no sobresale de ningún sitio y no se pega nunca.

               Hubo una ronda en la que esto pareció romper la clásica —botones
               movidos y un canto encima de Agregar—, pero aquello no salía de
               aquí: era el fondo que se le pintaba por detrás y la rama genérica
               de más arriba, que con el 'tbody' como descendiente se metía en las
               tablitas de los botones. Arregladas las dos, el <div> vuelve a ser
               el sitio correcto, y el árbol es el MISMO en las dos UIs
               (TR > TD > DIV > TABLE), así que no hay un apaño por interfaz.

               Las dos ramas son el mismo sitio con la clase en el <td> o en el
               <div>: NetSuite la pone en los dos y no en todas las páginas
               igual. */
            html.${FSC_CLASS} .uir-machine-table-container > table:not(.openList) tr.uir-machine-button-row>td>div.machineButtonRow,
            html.${FSC_CLASS} .uir-machine-table-container > table:not(.openList) tr.uir-machine-button-row>td.machineButtonRow>div {
                position: sticky;
                left: 0;
                z-index: 2;
                width: max-content;
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

    const FSC_BG_MARK = 'nsftFscBg';
    let _fscUnsub = null;

    const FSC_STICKY_CELLS =
        `html.${FSC_CLASS} .uir-machine-table-container > table:not(.openList) .listtable>tbody>tr:not(.uir-machine-row-last):not(.uir-machine-row-focused)>td:first-child:not(.uir-grippy):not(.uir-column-grippy):not([data-nsft-fsc-bg]),` +
        `html.${FSC_CLASS} .uir-machine-table-container > table:not(.openList) > tbody>tr>td:first-child:not(.uir-grippy):not(.uir-column-grippy):not([data-nsft-fsc-bg]),` +
        `html.${FSC_CLASS} .uir-machine-table-container > table:not(.openList) tr.uir-machine-row-focused>td:first-child:not(.uir-grippy):not(.uir-column-grippy):not([data-nsft-fsc-bg])`;

    function paintFixedColumnBackground() {
        document.querySelectorAll(FSC_STICKY_CELLS).forEach((td) => {
            td.dataset[FSC_BG_MARK] = '1';

            if (!isTransparentColor(getComputedStyle(td).backgroundColor)) return;

            const row = td.parentElement;
            if (row && !isTransparentColor(getComputedStyle(row).backgroundColor)) {
                td.style.backgroundColor = 'inherit';
                return;
            }
            const bg = firstOpaqueBackground(row);
            if (bg) td.style.backgroundColor = bg;
        });
    }

    function clearFixedColumnBackground() {
        document.querySelectorAll('[data-nsft-fsc-bg]').forEach((td) => {
            delete td.dataset[FSC_BG_MARK];
            td.style.removeProperty('background-color');
        });
    }

    const FSC_BTN_MARK = 'nsftFscBtn';
    const FSC_BUTTON_BARS =
        `html.${FSC_CLASS} .uir-machine-table-container > table:not(.openList) tr.uir-machine-button-row>td>div.machineButtonRow:not([data-nsft-fsc-btn]),` +
        `html.${FSC_CLASS} .uir-machine-table-container > table:not(.openList) tr.uir-machine-button-row>td.machineButtonRow>div:not([data-nsft-fsc-btn])`;

    function offsetAbsLeft(el) {
        let x = 0;
        for (let n = el; n; n = n.offsetParent) x += n.offsetLeft;
        return x;
    }

    function alignFixedColumnButtons() {
        document.querySelectorAll(FSC_BUTTON_BARS).forEach((bar) => {
            const cont = bar.closest('.uir-machine-table-container');
            if (!cont || cont.scrollLeft !== 0) return;
            bar.dataset[FSC_BTN_MARK] = '1';
            const inset = Math.round(offsetAbsLeft(bar) - offsetAbsLeft(cont));
            if (inset > 0) bar.style.left = inset + 'px';
        });
    }

    function clearFixedColumnButtons() {
        document.querySelectorAll('[data-nsft-fsc-btn]').forEach((bar) => {
            delete bar.dataset[FSC_BTN_MARK];
            bar.style.removeProperty('left');
        });
    }

    function runFixedSublistColumn() {
        try {
            if (window.NSFT_RecordButtons && NSFT_RecordButtons.isHeaderlessPage && NSFT_RecordButtons.isHeaderlessPage()) return;
        } catch (e) { }
        ensureSublistSharedStyle();
        ensureFscStyle();
        document.documentElement.classList.add(FSC_CLASS);
        paintFixedColumnBackground();
        alignFixedColumnButtons();
        if (window.NSFT_Observer && !_fscUnsub) {
            _fscUnsub = NSFT_Observer.subscribe(() => {
                paintFixedColumnBackground();
                alignFixedColumnButtons();
            }, { throttle: 400 });
        }
    }
    function stopFixedSublistColumn() {
        document.documentElement.classList.remove(FSC_CLASS);
        if (_fscUnsub) { _fscUnsub(); _fscUnsub = null; }
        clearFixedColumnBackground();
        clearFixedColumnButtons();
    }

    const FSH_BG_MARK = 'nsftFshBg';
    let _fshUnsub = null;

    function isTransparentColor(color) {
        if (window.NSFT_DOM && NSFT_DOM.isTransparentColor) return NSFT_DOM.isTransparentColor(color);
        if (!color) return true;
        const c = String(color).replace(/\s+/g, '');
        if (c === 'transparent') return true;
        return /^rgba\(\d+,\d+,\d+,(?:0|0?\.0+)\)$/.test(c);
    }

    function firstOpaqueBackground(el) {
        if (window.NSFT_DOM && NSFT_DOM.firstOpaqueBackground) return NSFT_DOM.firstOpaqueBackground(el);
        for (let node = el; node; node = node.parentElement) {
            const bg = getComputedStyle(node).backgroundColor;
            if (!isTransparentColor(bg)) return bg;
        }
        return '';
    }

    function paintFixedHeaderBackground() {
        const rows = document.querySelectorAll(
            `html.${FSH_CLASS} .uir-machine-table-container > table tr.uir-list-headerrow,` +
            `html.${FSH_CLASS} .uir-machine-table-container > table tr.uir-machine-headerrow`
        );
        rows.forEach((row) => {
            if (row.dataset[FSH_BG_MARK]) return;
            row.dataset[FSH_BG_MARK] = '1';

            const bg = firstOpaqueBackground(row);
            if (!bg) return;
            row.querySelectorAll(':scope > td').forEach((td) => {
                if (!isTransparentColor(getComputedStyle(td).backgroundColor)) return;
                td.style.backgroundColor = bg;
            });
        });
    }

    function clearFixedHeaderBackground() {
        document.querySelectorAll('[data-nsft-fsh-bg]').forEach((row) => {
            delete row.dataset[FSH_BG_MARK];
            row.querySelectorAll(':scope > td').forEach((td) => {
                td.style.removeProperty('background-color');
            });
        });
    }

    function runFixedSublistHeaders() {
        try {
            if (window.NSFT_RecordButtons && NSFT_RecordButtons.isHeaderlessPage && NSFT_RecordButtons.isHeaderlessPage()) return;
        } catch (e) { }
        ensureSublistSharedStyle();
        ensureFshStyle();
        document.documentElement.classList.add(FSH_CLASS);
        paintFixedHeaderBackground();
        if (window.NSFT_Observer && !_fshUnsub) {
            _fshUnsub = NSFT_Observer.subscribe(paintFixedHeaderBackground, { throttle: 400 });
        }
    }
    function stopFixedSublistHeaders() {
        document.documentElement.classList.remove(FSH_CLASS);
        if (_fshUnsub) { _fshUnsub(); _fshUnsub = null; }
        clearFixedHeaderBackground();
    }

    const FIXED_TABS_STYLE_ID = 'nsft-fixed-tabs-style';
    const FIXED_TABS_ROWS =
        '#div__body > table.uir-table-block.uir_form_tab_container > tbody > tr:nth-child(1),' +
        '#results_tab_div > div > table > tbody > tr:nth-child(1),' +
        '.nltabcontent > .uir-table-block > tbody > tr:nth-child(1)';
    const FIXED_TABS_BG_MARK = 'nsftFtBg';
    let _ftUnsub = null;

    const REDWOOD_SUBTAB_BG = 'rgb(251, 249, 248)';

    function subtabBandBackground(row) {
        if (!document.body || document.body.dataset.pageTheme !== 'redwood') return '';
        return row.querySelector('.bgsubtabbar') ? REDWOOD_SUBTAB_BG : '';
    }

    function paintFixedTabsBackground() {
        document.querySelectorAll(FIXED_TABS_ROWS).forEach((row) => {
            if (row.dataset[FIXED_TABS_BG_MARK]) return;
            row.dataset[FIXED_TABS_BG_MARK] = '1';

            const bg = subtabBandBackground(row) || firstOpaqueBackground(row);
            if (!bg) return;
            row.querySelectorAll(':scope > td').forEach((td) => {
                if (!isTransparentColor(getComputedStyle(td).backgroundColor)) return;
                td.style.backgroundColor = bg;
            });
        });
    }

    function clearFixedTabsBackground() {
        document.querySelectorAll('[data-nsft-ft-bg]').forEach((row) => {
            delete row.dataset[FIXED_TABS_BG_MARK];
            row.querySelectorAll(':scope > td').forEach((td) => {
                td.style.removeProperty('background-color');
            });
        });
    }

    function runFixedTabs() {
        const params = new URLSearchParams(window.location.search);
        if (params.get('l') === 'T') return;
        if (!/\.nl$/.test(window.location.pathname)) return;
        try {
            if (window.NSFT_RecordButtons && NSFT_RecordButtons.isHeaderlessPage && NSFT_RecordButtons.isHeaderlessPage()) return;
        } catch (e) { }

        if (document.getElementById(FIXED_TABS_STYLE_ID)) { armFixedTabsBackground(); return; }

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
        armFixedTabsBackground();
    }

    function armFixedTabsBackground() {
        paintFixedTabsBackground();
        if (window.NSFT_Observer && !_ftUnsub) {
            _ftUnsub = NSFT_Observer.subscribe(paintFixedTabsBackground, { throttle: 400 });
        }
    }

    function stopFixedTabs() {
        document.getElementById(FIXED_TABS_STYLE_ID)?.remove();
        if (_ftUnsub) { _ftUnsub(); _ftUnsub = null; }
        clearFixedTabsBackground();
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
