(function () {
    'use strict';
    const STORAGE_KEY = ['enableViewRecordObject', 'enableViewScriptedRecord', 'enableRecordLogsViewer', 'enableSuiteQLRunner', 'enableExportSearch', 'enableLoadRecordConsole', 'enableLoadNModule', 'enableGoToRecord', 'enableCommandPalette', 'enableCustomizationFinder', 'enableSuiteScriptConsole', 'enableAdvancedEditor', 'enableShortcutsCheatsheet', 'enableFindFieldById', 'enableOpenInOtherEnv', 'openInOtherEnvSandboxes', 'enableAiAssistant', 'aiAssistantPage', 'enableGithubBackup', 'enablePagePerformance'];

    const TOOLS_MENU_ID = 'nsft-tools-menu';
    const VIEW_RECORD_ITEM_ID = 'link_VerObjectRecord';
    const VIEW_SCRIPTED_RECORD_ITEM_ID = 'link_VerScriptedRecord';
    const RECORD_LOGS_ITEM_ID = 'link_RecordLogsViewer';
    const SUITEQL_RUNNER_ITEM_ID = 'link_SuiteQLRunner';
    const EXPORT_SEARCH_ITEM_ID = 'link_ExportSearch';
    const LOAD_RECORD_SS1_ITEM_ID = 'link_LoadRecordSS1';
    const LOAD_RECORD_SS2_ITEM_ID = 'link_LoadRecordSS2';
    const LOAD_N_MODULE_ITEM_ID = 'link_LoadNModule';
    const GOTO_RECORD_ITEM_ID = 'link_GoToRecord';
    const COMMAND_PALETTE_ITEM_ID = 'link_CommandPalette';
    const CFIND_ITEM_ID = 'link_CustomizationFinder';
    const SSC_ITEM_ID = 'link_SuiteScriptConsole';
    const ADV_ITEM_ID = 'link_AdvancedEditor';
    const ADV_NUEVO_URL = '/app/common/record/edittextmediaitem.nl?nsft-advanced-editor=T';
    const CHEATSHEET_ITEM_ID = 'link_ShortcutsCheatsheet';
    const FIND_FIELD_ITEM_ID = 'link_FindFieldById';
    const AI_TOP_ITEM_ID = 'nsft-ai-top-menuitem';
    const GITHUB_BACKUP_ITEM_ID = 'link_GithubBackup';
    const PAGE_PERF_ITEM_ID = 'link_PagePerformance';


    chrome.storage.local.get(STORAGE_KEY, (items) => {
        window.__nsftAdvActivo = !!items.enableAdvancedEditor;
        bindEditorAvanzado();
        if (Object.values(items).some(item => item === true)) init(items);
    });

    function init(items) {
        const RB = window.NSFT_RecordButtons;
        if (RB && RB.isExcludedPage && RB.isExcludedPage()) return;
        injectMenuIconStyles();
        addToolsMenu(items);
        observeDomChanges();
        observeRedwoodMenuPopover();
        interceptAdvancedEditorClick();
    }

    function interceptAdvancedEditorClick() {
        if (window.__nsftAdvNewTab) return;
        window.__nsftAdvNewTab = true;
        document.addEventListener('click', (ev) => {
            if (ev.ctrlKey || ev.metaKey || ev.shiftKey || ev.button === 1) return;
            const t = ev.target;
            const el = t && t.nodeType === 1 ? t : (t && t.parentElement);
            if (!el || !el.closest) return;
            const link = el.closest('[data-widget="Link"][aria-label]')
                || (el.closest('[data-widget="MenuItem"]')
                    && el.closest('[data-widget="MenuItem"]').querySelector('[data-widget="Link"][aria-label]'));
            if (!link) return;
            const label = chrome.i18n.getMessage('adv_menu_open') || 'Open Advanced Editor';
            if ((link.getAttribute('aria-label') || '') !== label) return;
            ev.preventDefault();
            ev.stopPropagation();
            if (typeof ev.stopImmediatePropagation === 'function') ev.stopImmediatePropagation();
            abreEditorAvanzado();
        }, true);
    }

    function abreEditorAvanzado() {
        try { window.open(ADV_NUEVO_URL, '_blank', 'noopener'); } catch (e) { }
    }

    function bindEditorAvanzado() {
        if (window.__nsftAdvAtajo) return;
        if (!window.NSFT_Shortcuts || !window.NSFT_Shortcuts.bind) return;
        window.__nsftAdvAtajo = true;
        window.NSFT_Shortcuts.bind('advanced_editor', {
            label: chrome.i18n.getMessage('adv_menu_open') || 'Open Advanced Editor',
            defaultCombo: { ctrlKey: false, shiftKey: true, altKey: true, code: 'KeyD' },
            storageKey: 'advancedEditorShortcut',
            group: chrome.i18n.getMessage('cheatsheet_group_global') || 'Global',
            order: 46,
            isEnabled: () => !!window.__nsftAdvActivo,
            onFire: abreEditorAvanzado
        });
    }

    function injectMenuIconStyles() {
        if (document.getElementById('nsft-tools-icon-css')) return;
        const style = document.createElement('style');
        style.id = 'nsft-tools-icon-css';
        style.textContent = `
            #nsft-tools-menu .ns-menuitem-link .nsft-tools-icon,
            #${AI_TOP_ITEM_ID} .ns-menuitem-link .nsft-tools-icon {
                display: inline-flex !important;
                align-items: center !important;
                justify-content: center !important;
                width: 16px !important;
                height: 16px !important;
                flex: 0 0 16px !important;
                margin: 0 !important;
                padding: 0 !important;
            }
            #nsft-tools-menu .ns-menuitem-link .nsft-tools-icon svg,
            #${AI_TOP_ITEM_ID} .ns-menuitem-link .nsft-tools-icon svg {
                width: 14px !important;
                height: 14px !important;
                display: block !important;
                visibility: visible !important;
                opacity: 1 !important;
            }
            /* El asistente de IA conserva su morado (no hereda currentColor). */
            #${AI_TOP_ITEM_ID} .nsft-tools-icon svg {
                stroke: #7c3aed !important;
            }

            /* Popover de Redwood: dejar que el ancho crezca al contenido. NS lo
               fija a 206px inline y los Text spans usan ellipsis; cuando el
               decorator marca el popover como nuestro, sobreescribimos ambos. */
            div[data-widget="Popover"][data-role="contextmenu"][data-nsft-icons-done] {
                width: auto !important;
                min-width: 220px !important;
                max-width: 420px !important;
            }
            div[data-widget="Popover"][data-role="contextmenu"][data-nsft-icons-done] [data-widget="Text"],
            div[data-widget="Popover"][data-role="contextmenu"][data-nsft-icons-done] [data-widget="MenuItemContent"],
            div[data-widget="Popover"][data-role="contextmenu"][data-nsft-icons-done] [data-widget="MenuItemButton"],
            div[data-widget="Popover"][data-role="contextmenu"][data-nsft-icons-done] [data-widget="Link"] {
                max-width: none !important;
                width: auto !important;
                overflow: visible !important;
                text-overflow: clip !important;
                white-space: nowrap !important;
            }
        `;
        document.head.appendChild(style);
    }


    function addToolsMenu(items) {
        const headerMenu = document.querySelector('div.page-title-menu.noprint.page-title-menu-context ul.ns-menu')
            || Array.from(document.querySelectorAll('ul.ns-menu')).find(ul => !ul.closest('.uir-button-menu'));
        const isDashboard = window.location.pathname.includes('dash.nl') || window.location.pathname.includes('card.nl') || window.location.pathname.includes('list.nl');

        if (!headerMenu || isDashboard) return;

        const menuItemsToAppend = [];

        if (!document.getElementById(VIEW_RECORD_ITEM_ID) && items.enableViewRecordObject && !isSearchAreaPage()) {
            menuItemsToAppend.push(createViewRecordItem());
        }

        if (!document.getElementById(VIEW_SCRIPTED_RECORD_ITEM_ID) && items.enableViewScriptedRecord) {
            menuItemsToAppend.push(createViewScriptedRecordItem());
        }

        if (!document.getElementById(SUITEQL_RUNNER_ITEM_ID) && items.enableSuiteQLRunner) {
            menuItemsToAppend.push(createSuiteQLRunnerItem());
        }

        if (!document.getElementById(RECORD_LOGS_ITEM_ID) && items.enableRecordLogsViewer) {
            menuItemsToAppend.push(createRecordLogsItem());
        }

        if (!document.getElementById(SSC_ITEM_ID) && items.enableSuiteScriptConsole) {
            menuItemsToAppend.push(createSuiteScriptConsoleItem());
        }

        if (!document.getElementById(ADV_ITEM_ID) && items.enableAdvancedEditor) {
            menuItemsToAppend.push(createAdvancedEditorItem());
        }

        if (!document.getElementById(EXPORT_SEARCH_ITEM_ID) && items.enableExportSearch && isSearchPage()) {
            menuItemsToAppend.push(createExportSearchItem());
        }

        if (!document.getElementById(LOAD_RECORD_SS1_ITEM_ID) && items.enableLoadRecordConsole) {
            menuItemsToAppend.push(createLoadRecordSS1Item());
        }

        if (!document.getElementById(LOAD_RECORD_SS2_ITEM_ID) && items.enableLoadRecordConsole) {
            menuItemsToAppend.push(createLoadRecordSS2Item());
        }

        if (!document.getElementById(LOAD_N_MODULE_ITEM_ID) && items.enableLoadNModule) {
            menuItemsToAppend.push(createLoadNModuleItem());
        }

        if (!document.getElementById(FIND_FIELD_ITEM_ID) && items.enableFindFieldById) {
            menuItemsToAppend.push(createFindFieldItem());
        }

        if (!document.getElementById(GOTO_RECORD_ITEM_ID) && items.enableGoToRecord) {
            menuItemsToAppend.push(createGoToRecordItem());
        }

        if (!document.getElementById(CFIND_ITEM_ID) && items.enableCustomizationFinder) {
            menuItemsToAppend.push(createCustomizationFinderItem());
        }

        if (!document.getElementById(COMMAND_PALETTE_ITEM_ID) && items.enableCommandPalette) {
            menuItemsToAppend.push(createCommandPaletteItem());
        }


        if (!document.getElementById(GITHUB_BACKUP_ITEM_ID) && items.enableGithubBackup) {
            menuItemsToAppend.push(createGithubBackupItem());
        }

        if (!document.getElementById(PAGE_PERF_ITEM_ID) && items.enablePagePerformance) {
            menuItemsToAppend.push(createPagePerformanceItem());
        }

        if (items.enableOpenInOtherEnv) {
            const groupItem = createOpenInEnvSubmenu(items.openInOtherEnvSandboxes || '1,2');
            if (groupItem && !document.getElementById(groupItem.id)) {
                menuItemsToAppend.push(groupItem);
            }
        }

        if (!document.getElementById(CHEATSHEET_ITEM_ID) && items.enableShortcutsCheatsheet) {
            menuItemsToAppend.push(createCheatsheetItem());
        }

        if (menuItemsToAppend.length === 0) {
            const existingMenu = document.getElementById(TOOLS_MENU_ID);
            if (existingMenu) {
                const existingSubMenu = existingMenu.querySelector('ul.ns-menu');
                if (!existingSubMenu || existingSubMenu.children.length === 0) {
                    existingMenu.remove();
                }
            }
            return;
        }

        let toolsMenuItem = document.getElementById(TOOLS_MENU_ID);

        if (!toolsMenuItem) {
            toolsMenuItem = createMainToolsMenu();
            const menuItems = Array.from(headerMenu.querySelectorAll('li.ns-menuitem'));
            const listaItem = menuItems.find(li => ['lista', 'list', 'listas', 'lists'].includes(li.textContent.trim().toLowerCase()));
            if (listaItem) headerMenu.insertBefore(toolsMenuItem, listaItem);
            else headerMenu.appendChild(toolsMenuItem);
        }

        if (toolsMenuItem) {
            const toolsSubMenu = toolsMenuItem.querySelector('ul.ns-menu');
            menuItemsToAppend.forEach(item => {
                if (!document.getElementById(item.id)) {
                    toolsSubMenu.appendChild(item);
                }
            });
        }

        if (items.enableAiAssistant && items.aiAssistantPage !== false && !document.getElementById(AI_TOP_ITEM_ID)) {
            const aiTop = createAiTopLevelItem();
            if (toolsMenuItem && toolsMenuItem.parentNode) toolsMenuItem.insertAdjacentElement('afterend', aiTop);
            else headerMenu.appendChild(aiTop);
        }
    }

    function isSearchPage() {
        const path = window.location.pathname;
        const params = new URLSearchParams(window.location.search);
        return path === '/app/common/search/search.nl' && params.has('id');
    }

    function isSearchAreaPage() {
        return window.location.pathname.startsWith('/app/common/search/');
    }

    function removeToolsMenu() {
        const existing = document.getElementById(TOOLS_MENU_ID);
        if (existing) existing.remove();
        const aiTop = document.getElementById(AI_TOP_ITEM_ID);
        if (aiTop) aiTop.remove();
    }

    chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== 'local') return;
        if (changes.enableAdvancedEditor) {
            window.__nsftAdvActivo = changes.enableAdvancedEditor.newValue !== false;
        }
        if (!changes.enableAiAssistant && !changes.aiAssistantPage) return;
        chrome.storage.local.get(STORAGE_KEY, (items) => {
            const on = items.enableAiAssistant && items.aiAssistantPage !== false;
            const el = document.getElementById(AI_TOP_ITEM_ID);
            if (!on && el) el.remove();
            else if (on && !el) addToolsMenu(items);
        });
    });


    const ICON_ATTRS = 'xmlns="http://www.w3.org/2000/svg" width="14" height="14" style="width:14px!important;height:14px!important;display:block!important;flex:0 0 14px;" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"';
    const TOOL_ICONS = {
        suitescript_console: `<svg viewBox="0 0 24 24" ${ICON_ATTRS}><rect x="3" y="4" width="18" height="16" rx="2"/><polyline points="7 9 10 12 7 15"/><line x1="13" y1="15" x2="17" y2="15"/></svg>`,
        customization_finder: `<svg viewBox="0 0 24 24" ${ICON_ATTRS}><circle cx="11" cy="11" r="6"/><line x1="15.5" y1="15.5" x2="20" y2="20"/><line x1="9" y1="9" x2="13" y2="9"/><line x1="9" y1="12" x2="13" y2="12"/></svg>`,
        advanced_editor: `<svg viewBox="0 0 24 24" ${ICON_ATTRS}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><polyline points="10 12 8 14.5 10 17"/><polyline points="14 12 16 14.5 14 17"/></svg>`,
        view_record: `<svg viewBox="0 0 24 24" ${ICON_ATTRS}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="9" y1="13" x2="15" y2="13"/><line x1="9" y1="17" x2="15" y2="17"/></svg>`,
        scripted: `<svg viewBox="0 0 24 24" ${ICON_ATTRS}><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>`,
        record_logs: `<svg viewBox="0 0 24 24" ${ICON_ATTRS}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>`,
        suiteql: `<svg viewBox="0 0 24 24" ${ICON_ATTRS}><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v6c0 1.66 4.03 3 9 3s9-1.34 9-3V5"/><path d="M3 11v6c0 1.66 4.03 3 9 3s9-1.34 9-3v-6"/></svg>`,
        export_search: `<svg viewBox="0 0 24 24" ${ICON_ATTRS}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>`,
        terminal: `<svg viewBox="0 0 24 24" ${ICON_ATTRS}><polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/></svg>`,
        package: `<svg viewBox="0 0 24 24" ${ICON_ATTRS}><line x1="16.5" y1="9.4" x2="7.5" y2="4.21"/><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>`,
        find_field: `<svg viewBox="0 0 24 24" ${ICON_ATTRS}><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>`,
        goto_record: `<svg viewBox="0 0 24 24" ${ICON_ATTRS}><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>`,
        command_palette: `<svg viewBox="0 0 24 24" ${ICON_ATTRS}><path d="M18 3a3 3 0 0 0-3 3v12a3 3 0 0 0 3 3 3 3 0 0 0 3-3 3 3 0 0 0-3-3H6a3 3 0 0 0-3 3 3 3 0 0 0 3 3 3 3 0 0 0 3-3V6a3 3 0 0 0-3-3 3 3 0 0 0-3 3 3 3 0 0 0 3 3h12a3 3 0 0 0 3-3 3 3 0 0 0-3-3z"/></svg>`,
        ai_assistant: `<svg viewBox="0 0 24 24" fill="none" stroke="#7c3aed" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l1.8 4.6L18.5 9.4l-4.7 1.8L12 16l-1.8-4.8L5.5 9.4l4.7-1.8z"/><path d="M19 14l.6 1.6 1.6.6-1.6.6L19 19l-.6-1.6-1.6-.6 1.6-.6z"/></svg>`,
        github_backup: `<svg viewBox="0 0 24 24" width="14" height="14" style="width:14px!important;height:14px!important;display:block!important;flex:0 0 14px;" aria-hidden="true"><path fill="currentColor" d="M12 .5C5.73.5.5 5.73.5 12c0 5.08 3.29 9.39 7.86 10.91.58.11.79-.25.79-.56 0-.28-.01-1.02-.02-2-3.2.7-3.88-1.54-3.88-1.54-.52-1.33-1.28-1.68-1.28-1.68-1.05-.72.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.73-1.55-2.55-.29-5.24-1.28-5.24-5.68 0-1.25.45-2.28 1.19-3.08-.12-.29-.51-1.46.11-3.05 0 0 .97-.31 3.18 1.18a11.1 11.1 0 0 1 5.8 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.24 2.76.12 3.05.74.8 1.18 1.83 1.18 3.08 0 4.41-2.69 5.38-5.25 5.67.41.36.78 1.06.78 2.14 0 1.55-.01 2.8-.01 3.18 0 .31.21.68.8.56A11.51 11.51 0 0 0 23.5 12C23.5 5.73 18.27.5 12 .5z"/></svg>`,
        open_in_env: `<svg viewBox="0 0 24 24" ${ICON_ATTRS}><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>`,
        page_perf: `<svg viewBox="0 0 24 24" ${ICON_ATTRS}><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>`,
        cheatsheet: `<svg viewBox="0 0 24 24" ${ICON_ATTRS}><rect x="2" y="6" width="20" height="12" rx="2"/><line x1="6" y1="10" x2="6.01" y2="10"/><line x1="10" y1="10" x2="10.01" y2="10"/><line x1="14" y1="10" x2="14.01" y2="10"/><line x1="18" y1="10" x2="18.01" y2="10"/><line x1="7" y1="14" x2="17" y2="14"/></svg>`,
        settings: `<svg viewBox="0 0 24 24" ${ICON_ATTRS}><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h0a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v0a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>`,
        plus_circle: `<svg viewBox="0 0 24 24" ${ICON_ATTRS}><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>`,
        columns: `<svg viewBox="0 0 24 24" ${ICON_ATTRS}><path d="M12 3h7a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-7m0-18H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h7m0-18v18"/></svg>`,
        dependents: `<svg viewBox="0 0 24 24" ${ICON_ATTRS}><circle cx="6" cy="3" r="2"/><circle cx="6" cy="21" r="2"/><circle cx="18" cy="12" r="2"/><path d="M6 5v6a3 3 0 0 0 3 3h7"/><path d="M6 19v-6a3 3 0 0 1 3-3h7"/></svg>`,
        xml: `<svg viewBox="0 0 24 24" ${ICON_ATTRS}><polyline points="14 2 14 8 20 8"/><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="10 13 8 15 10 17"/><polyline points="14 13 16 15 14 17"/></svg>`,
        link: `<svg viewBox="0 0 24 24" ${ICON_ATTRS}><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>`,
        save: `<svg viewBox="0 0 24 24" ${ICON_ATTRS}><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>`,
        edit: `<svg viewBox="0 0 24 24" ${ICON_ATTRS}><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`,
        trash: `<svg viewBox="0 0 24 24" ${ICON_ATTRS}><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>`,
        trail: `<svg viewBox="0 0 24 24" ${ICON_ATTRS}><circle cx="5" cy="19" r="2"/><circle cx="19" cy="5" r="2"/><path d="M5 17v-2a4 4 0 0 1 4-4h6a4 4 0 0 0 4-4V7"/></svg>`
    };

    function buildMenuLinkHtml(label, iconKey, eventName) {
        const safeLabel = escapeMenuHtml(label);
        const icon = TOOL_ICONS[iconKey] || '';
        return `<a href="javascript:void(0)" class="ns-menuitem-link"
                   style="cursor:pointer; display:flex; align-items:center; gap:8px;"
                   onclick="window.dispatchEvent(new CustomEvent('${eventName}')); return false;">
                    <span class="nsft-tools-icon" style="display:inline-flex; align-items:center; justify-content:center; width:16px; height:16px; flex:0 0 16px;">${icon}</span>
                    <span>${safeLabel}</span>
                </a>`;
    }

    function buildMenuHrefHtml(label, iconKey, href) {
        const safeLabel = escapeMenuHtml(label);
        const icon = TOOL_ICONS[iconKey] || '';
        return `<a href="${escapeMenuHtml(href)}" target="_blank" rel="noopener"
                   class="ns-menuitem-link"
                   style="cursor:pointer; display:flex; align-items:center; gap:8px;">
                    <span class="nsft-tools-icon" style="display:inline-flex; align-items:center; justify-content:center; width:16px; height:16px; flex:0 0 16px;">${icon}</span>
                    <span>${safeLabel}</span>
                </a>`;
    }

    function escapeMenuHtml(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    function createMainToolsMenu() {
        const toolsMenuItem = document.createElement('li');
        toolsMenuItem.id = TOOLS_MENU_ID;
        toolsMenuItem.className = 'ns-menuitem';
        toolsMenuItem.setAttribute('onpointerover', 'NS.UI.Helpers.Menu.initializeMenu(this);');

        const iconUrl = chrome.runtime.getURL('assets/img/logomini.png');
        const labelTools = chrome.i18n.getMessage("menuTools");

        toolsMenuItem.innerHTML = `
            <a href="javascript:void(0)" class="ns-menuitem-link" style="display:flex; align-items:center; gap:8px;">
                <img src="${iconUrl}" style="width:16px; height:16px; object-fit:contain;">
                <span>${labelTools}</span>
            </a>
            <ul class="ns-menu"></ul>
        `;
        return toolsMenuItem;
    }

    function createViewRecordItem() {
        const label = chrome.i18n.getMessage("enableRecordObjectLabel");
        const li = document.createElement('li');
        li.id = VIEW_RECORD_ITEM_ID;
        li.className = 'ns-menuitem';
        li.setAttribute('data-nsps-type', 'menu_item');
        li.setAttribute('data-nsps-label', label);
        li.innerHTML = buildMenuLinkHtml(label, 'view_record', 'nsft-show-record-object');
        return li;
    }

    function createViewScriptedRecordItem() {
        const label = chrome.i18n.getMessage("enableScriptedRecordsLabel");
        const li = document.createElement('li');
        li.id = VIEW_SCRIPTED_RECORD_ITEM_ID;
        li.className = 'ns-menuitem';
        li.setAttribute('data-nsps-type', 'menu_item');
        li.setAttribute('data-nsps-label', label);
        li.innerHTML = buildMenuLinkHtml(label, 'scripted', 'nsft-show-scripted-record');
        return li;
    }

    function createRecordLogsItem() {
        const label = chrome.i18n.getMessage("enableRecordLogsViewerLabel");
        const li = document.createElement('li');
        li.id = RECORD_LOGS_ITEM_ID;
        li.className = 'ns-menuitem';
        li.setAttribute('data-nsps-type', 'menu_item');
        li.setAttribute('data-nsps-label', label);
        li.innerHTML = buildMenuLinkHtml(label, 'record_logs', 'nsft-show-record-logs');
        return li;
    }

    function createSuiteQLRunnerItem() {
        const label = chrome.i18n.getMessage("openSuiteQLRunnerLabel");
        const li = document.createElement('li');
        li.id = SUITEQL_RUNNER_ITEM_ID;
        li.className = 'ns-menuitem';
        li.setAttribute('data-nsps-type', 'menu_item');
        li.setAttribute('data-nsps-label', label);
        li.innerHTML = buildMenuLinkHtml(label, 'suiteql', 'nsft-show-suiteql-runner');
        return li;
    }

    function createExportSearchItem() {
        const label = chrome.i18n.getMessage("enableExportSearchLabel");
        const li = document.createElement('li');
        li.id = EXPORT_SEARCH_ITEM_ID;
        li.className = 'ns-menuitem';
        li.setAttribute('data-nsps-type', 'menu_item');
        li.setAttribute('data-nsps-label', label);
        li.innerHTML = buildMenuLinkHtml(label, 'export_search', 'nsft-show-export-search');
        return li;
    }

    function createLoadRecordSS1Item() {
        const label = chrome.i18n.getMessage("lrc_menu_ss1");
        const li = document.createElement('li');
        li.id = LOAD_RECORD_SS1_ITEM_ID;
        li.className = 'ns-menuitem';
        li.setAttribute('data-nsps-type', 'menu_item');
        li.setAttribute('data-nsps-label', label);
        li.innerHTML = buildMenuLinkHtml(label, 'terminal', 'nsft-load-record-ss1');
        return li;
    }

    function createLoadRecordSS2Item() {
        const label = chrome.i18n.getMessage("lrc_menu_ss2");
        const li = document.createElement('li');
        li.id = LOAD_RECORD_SS2_ITEM_ID;
        li.className = 'ns-menuitem';
        li.setAttribute('data-nsps-type', 'menu_item');
        li.setAttribute('data-nsps-label', label);
        li.innerHTML = buildMenuLinkHtml(label, 'terminal', 'nsft-load-record-ss2');
        return li;
    }

    function createLoadNModuleItem() {
        const label = chrome.i18n.getMessage("lnm_menu_label") || 'Cargar módulo N';
        const li = document.createElement('li');
        li.id = LOAD_N_MODULE_ITEM_ID;
        li.className = 'ns-menuitem';
        li.setAttribute('data-nsps-type', 'menu_item');
        li.setAttribute('data-nsps-label', label);
        li.innerHTML = buildMenuLinkHtml(label, 'package', 'nsft-load-n-module');
        return li;
    }

    function createGoToRecordItem() {
        const label = chrome.i18n.getMessage("enableGoToRecordLabel");
        const li = document.createElement('li');
        li.id = GOTO_RECORD_ITEM_ID;
        li.className = 'ns-menuitem';
        li.setAttribute('data-nsps-type', 'menu_item');
        li.setAttribute('data-nsps-label', label);
        li.innerHTML = buildMenuLinkHtml(label, 'goto_record', 'nsft-show-goto-record');
        return li;
    }

    function createCommandPaletteItem() {
        const label = chrome.i18n.getMessage("enableCommandPaletteLabel");
        const li = document.createElement('li');
        li.id = COMMAND_PALETTE_ITEM_ID;
        li.className = 'ns-menuitem';
        li.setAttribute('data-nsps-type', 'menu_item');
        li.setAttribute('data-nsps-label', label);
        li.innerHTML = buildMenuLinkHtml(label, 'command_palette', 'nsft-show-command-palette');
        return li;
    }

    function createCustomizationFinderItem() {
        const label = chrome.i18n.getMessage('enableCustomizationFinderLabel');
        const li = document.createElement('li');
        li.id = CFIND_ITEM_ID;
        li.className = 'ns-menuitem';
        li.setAttribute('data-nsps-type', 'menu_item');
        li.setAttribute('data-nsps-label', label);
        li.innerHTML = buildMenuLinkHtml(label, 'customization_finder', 'nsft-show-customization-finder');
        return li;
    }

    function createSuiteScriptConsoleItem() {
        const label = chrome.i18n.getMessage('enableSuiteScriptConsoleLabel');
        const li = document.createElement('li');
        li.id = SSC_ITEM_ID;
        li.className = 'ns-menuitem';
        li.setAttribute('data-nsps-type', 'menu_item');
        li.setAttribute('data-nsps-label', label);
        li.innerHTML = buildMenuLinkHtml(label, 'suitescript_console', 'nsft-show-suitescript-console');
        return li;
    }

    function createAdvancedEditorItem() {
        const label = chrome.i18n.getMessage('adv_menu_open') || 'Open Advanced Editor';
        const li = document.createElement('li');
        li.id = ADV_ITEM_ID;
        li.className = 'ns-menuitem';
        li.setAttribute('data-nsps-type', 'menu_item');
        li.setAttribute('data-nsps-label', label);
        li.innerHTML = buildMenuHrefHtml(label, 'advanced_editor', ADV_NUEVO_URL);

        const a = li.querySelector('a');
        if (a) {
            a.setAttribute('data-nsft-href', ADV_NUEVO_URL);
            a.addEventListener('click', (ev) => {
                if (ev.ctrlKey || ev.metaKey || ev.shiftKey) return;
                ev.preventDefault();
                ev.stopPropagation();
                if (typeof ev.stopImmediatePropagation === 'function') ev.stopImmediatePropagation();
                try { window.open(ADV_NUEVO_URL, '_blank', 'noopener'); } catch (e) { }
            }, true);
        }
        return li;
    }

    function createCheatsheetItem() {
        const label = chrome.i18n.getMessage("enableShortcutsCheatsheetLabel");
        const li = document.createElement('li');
        li.id = CHEATSHEET_ITEM_ID;
        li.className = 'ns-menuitem';
        li.setAttribute('data-nsps-type', 'menu_item');
        li.setAttribute('data-nsps-label', label);
        li.innerHTML = buildMenuLinkHtml(label, 'cheatsheet', 'nsft-show-cheatsheet');
        return li;
    }

    function createAiTopLevelItem() {
        const label = chrome.i18n.getMessage('enableAiAssistantLabel') || 'Asistente de IA';
        const li = document.createElement('li');
        li.id = AI_TOP_ITEM_ID;
        li.className = 'ns-menuitem';
        li.setAttribute('data-nsps-type', 'menu_item');
        li.setAttribute('data-nsps-label', label);
        li.innerHTML = buildMenuLinkHtml(label, 'ai_assistant', 'nsft-ai-ask-record');
        return li;
    }

    function createGithubBackupItem() {
        const label = chrome.i18n.getMessage('enableGithubBackupLabel') || 'Respaldar a GitHub';
        const li = document.createElement('li');
        li.id = GITHUB_BACKUP_ITEM_ID;
        li.className = 'ns-menuitem';
        li.setAttribute('data-nsps-type', 'menu_item');
        li.setAttribute('data-nsps-label', label);
        li.innerHTML = buildMenuLinkHtml(label, 'github_backup', 'nsft-show-github-backup');
        return li;
    }

    function createPagePerformanceItem() {
        const label = chrome.i18n.getMessage('pp_title') || 'Rendimiento de la página';
        const li = document.createElement('li');
        li.id = PAGE_PERF_ITEM_ID;
        li.className = 'ns-menuitem';
        li.setAttribute('data-nsps-type', 'menu_item');
        li.setAttribute('data-nsps-label', label);
        li.innerHTML = buildMenuLinkHtml(label, 'page_perf', 'nsft-show-page-performance');
        return li;
    }

    function createFindFieldItem() {
        const label = chrome.i18n.getMessage("enableFindFieldByIdLabel");
        const li = document.createElement('li');
        li.id = FIND_FIELD_ITEM_ID;
        li.className = 'ns-menuitem';
        li.setAttribute('data-nsps-type', 'menu_item');
        li.setAttribute('data-nsps-label', label);
        li.innerHTML = buildMenuLinkHtml(label, 'find_field', 'nsft-show-find-field-by-id');
        return li;
    }



    function createOpenInEnvSubmenu(sandboxList) {
        const OIE = window.NSFT_OpenInEnv;
        if (!OIE || typeof OIE.detectCurrentEnv !== 'function') return null;
        const env = OIE.detectCurrentEnv();
        if (!env) return null;
        const targets = OIE.buildEnvTargets(env, sandboxList);
        if (!targets.length) return null;

        const groupLabel = chrome.i18n.getMessage('openInEnv_group') || 'Abrir en otro entorno';
        const li = document.createElement('li');
        li.id = 'link_OpenInEnv_group';
        li.className = 'ns-menuitem';
        li.setAttribute('data-nsps-type', 'menu_item');
        li.setAttribute('data-nsps-label', groupLabel);

        const safeGroup = escapeMenuHtml(groupLabel);
        const safeSandboxes = escapeMenuHtml(String(sandboxList || '1,2'));
        const icon = TOOL_ICONS.open_in_env || '';
        li.innerHTML = `<a href="javascript:void(0)" class="ns-menuitem-link"
                           style="cursor:pointer; display:flex; align-items:center; gap:8px;"
                           onclick="window.dispatchEvent(new CustomEvent('nsft-show-env-picker', { detail: { x: event.clientX, y: event.clientY, sandboxes: '${safeSandboxes}' } })); return false;">
                            <span class="nsft-tools-icon" style="display:inline-flex; align-items:center; justify-content:center; width:16px; height:16px; flex:0 0 16px;">${icon}</span>
                            <span>${safeGroup}</span>
                        </a>`;

        return li;
    }

    function observeDomChanges() {
        const checkAndReinject = () => {
            if (!document.getElementById(TOOLS_MENU_ID)) {
                chrome.storage.local.get(STORAGE_KEY, (items) => {
                    addToolsMenu(items);
                });
            }
        };
        if (window.NSFT_Observer && typeof window.NSFT_Observer.subscribe === 'function') {
            window.NSFT_Observer.subscribe(checkAndReinject);
            return;
        }
        const observer = new MutationObserver(checkAndReinject);
        observer.observe(document.body, { childList: true, subtree: true });
    }

    let _labelIconCache = null;

    function getLabelIconMap() {
        if (_labelIconCache) return _labelIconCache;
        const map = {};
        const set = (i18nKey, iconKey, fallback) => {
            const label = chrome.i18n.getMessage(i18nKey) || fallback || '';
            if (label) map[label] = iconKey;
        };
        set('enableRecordObjectLabel', 'view_record');
        set('enableScriptedRecordsLabel', 'scripted');
        set('enableRecordLogsViewerLabel', 'record_logs');
        set('openSuiteQLRunnerLabel', 'suiteql');
        set('enableExportSearchLabel', 'export_search');
        set('lrc_menu_ss1', 'terminal');
        set('lrc_menu_ss2', 'terminal');
        set('lnm_menu_label', 'package', 'Cargar módulo N');
        set('enableGoToRecordLabel', 'goto_record');
        set('enableCommandPaletteLabel', 'command_palette');
        set('enableCustomizationFinderLabel', 'customization_finder');
        set('enableSuiteScriptConsoleLabel', 'suitescript_console');
        set('adv_menu_open', 'advanced_editor');
        set('enableAiAssistantLabel', 'ai_assistant', 'Asistente de IA');
        set('enableGithubBackupLabel', 'github_backup', 'Respaldar a GitHub');
        set('pp_title', 'page_perf', 'Rendimiento de la página');
        set('enableShortcutsCheatsheetLabel', 'cheatsheet');
        set('enableFindFieldByIdLabel', 'find_field');
        set('openInEnv_group', 'open_in_env', 'Abrir en otro entorno');
        set('recordOptionOpenCustomRecord', 'settings');
        set('recordOptionOpenCustomTransaction', 'settings');
        set('recordOptionAddField', 'plus_circle');
        set('recordOptionAddColumn', 'columns');
        set('recordOptionViewDependentRecords', 'dependents');
        set('recordOptionViewXml', 'xml', 'Ver XML');
        set('recordOptionRunSuiteQL', 'suiteql');
        set('recordOptionLoadInConsole', 'suitescript_console');
        set('recordOptionCopyCleanUrl', 'link');
        set('recordOptionOpenInEnv', 'open_in_env');
        set('rt_button', 'trail', 'Record Trail');
        set('saveAndEdit', 'save');
        set('ro_edit_save', 'edit');
        set('btn_delete', 'trash');
        _labelIconCache = map;
        return map;
    }

    let _ambiguousCache = null;
    function getAmbiguousLabels() {
        if (_ambiguousCache) return _ambiguousCache;
        const set = new Set();
        ['saveAndEdit', 'ro_edit_save', 'btn_delete'].forEach((k) => {
            const label = chrome.i18n.getMessage(k);
            if (label) set.add(label);
        });
        _ambiguousCache = set;
        return set;
    }

    function observeRedwoodMenuPopover() {
        if (window.__nsftToolsIconObserver) return;
        window.__nsftToolsIconObserver = true;
        const scan = () => {
            document.querySelectorAll(
                'div[data-widget="Popover"][data-role="contextmenu"]:not([data-nsft-icons-done])'
            ).forEach(decorateRedwoodPopover);
        };
        let scheduled = false;
        const onMutations = () => {
            if (scheduled) return;
            scheduled = true;
            requestAnimationFrame(() => { scheduled = false; scan(); });
        };
        const obs = new MutationObserver(onMutations);
        obs.observe(document.body, { childList: true, subtree: true });
        scan();
    }

    function decorateRedwoodPopover(popover) {
        const items = popover.querySelectorAll('[data-widget="MenuItem"]');
        if (!items.length) return;
        const labelMap = getLabelIconMap();
        const ambiguous = getAmbiguousLabels();

        let hasUniqueAnchor = false;
        const matches = [];
        items.forEach((item) => {
            if (item.dataset.nsftIconAdded) return;
            const btn = item.querySelector('[data-widget="MenuItemButton"][aria-label], [data-widget="Link"][aria-label]');
            if (!btn) return;
            const label = btn.getAttribute('aria-label') || '';
            const iconKey = labelMap[label];
            if (!iconKey) return;
            if (!ambiguous.has(label)) hasUniqueAnchor = true;
            matches.push({ item, iconKey });
        });
        if (!hasUniqueAnchor || !matches.length) return;

        let touched = 0;
        matches.forEach(({ item, iconKey }) => {
            const content = item.querySelector('[data-widget="MenuItemContent"]');
            if (!content) return;
            const wrap = document.createElement('span');
            wrap.className = 'nsft-tools-icon';
            wrap.style.cssText = 'display:inline-flex;align-items:center;justify-content:center;width:16px;height:16px;margin-right:8px;flex:0 0 16px;vertical-align:middle;';
            wrap.innerHTML = TOOL_ICONS[iconKey] || '';
            content.insertBefore(wrap, content.firstChild);
            item.dataset.nsftIconAdded = '1';
            touched++;
        });
        if (touched > 0) popover.setAttribute('data-nsft-icons-done', '1');
    }
})();
