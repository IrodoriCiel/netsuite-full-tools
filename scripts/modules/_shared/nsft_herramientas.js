(function () {
    'use strict';
    if (window.NSFT_Herramientas) return;

    const CUERPOS = {
        tools: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
        suitescript_console: '<rect x="3" y="4" width="18" height="16" rx="2"/><polyline points="7 9 10 12 7 15"/><line x1="13" y1="15" x2="17" y2="15"/>',
        customization_finder: '<circle cx="11" cy="11" r="6"/><line x1="15.5" y1="15.5" x2="20" y2="20"/><line x1="9" y1="9" x2="13" y2="9"/><line x1="9" y1="12" x2="13" y2="12"/>',
        script_execute: '<circle cx="12" cy="12" r="9"/><polygon points="10 8 16 12 10 16 10 8"/>',
        record_changes: '<path d="M3 12a9 9 0 1 0 3-6.7"/><polyline points="3 4 3 9 8 9"/><polyline points="12 7 12 12 15.5 14"/>',
        deleted_records: '<polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/>',
        advanced_editor: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><polyline points="10 12 8 14.5 10 17"/><polyline points="14 12 16 14.5 14 17"/>',
        view_record: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="9" y1="13" x2="15" y2="13"/><line x1="9" y1="17" x2="15" y2="17"/>',
        scripted: '<polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>',
        record_logs: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/>',
        suiteql: '<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v6c0 1.66 4.03 3 9 3s9-1.34 9-3V5"/><path d="M3 11v6c0 1.66 4.03 3 9 3s9-1.34 9-3v-6"/>',
        export_search: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>',
        fragments: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><polygon points="10 11 15 14 10 17 10 11"/>',
        terminal: '<polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/>',
        unlock: '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/>',
        package: '<line x1="16.5" y1="9.4" x2="7.5" y2="4.21"/><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/>',
        find_field: '<circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>',
        goto_record: '<line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>',
        command_palette: '<path d="M18 3a3 3 0 0 0-3 3v12a3 3 0 0 0 3 3 3 3 0 0 0 3-3 3 3 0 0 0-3-3H6a3 3 0 0 0-3 3 3 3 0 0 0 3 3 3 3 0 0 0 3-3V6a3 3 0 0 0-3-3 3 3 0 0 0-3 3 3 3 0 0 0 3 3h12a3 3 0 0 0 3-3 3 3 0 0 0-3-3z"/>',
        open_in_env: '<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>',
        page_perf: '<polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>',
        shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><polyline points="9 12 11 14 15 10"/>',
        timeline: '<line x1="6" y1="3" x2="6" y2="21"/><circle cx="6" cy="6" r="2"/><circle cx="6" cy="12" r="2"/><circle cx="6" cy="18" r="2"/><line x1="11" y1="6" x2="20" y2="6"/><line x1="11" y1="12" x2="18" y2="12"/><line x1="11" y1="18" x2="20" y2="18"/>',
        csv_template: '<rect x="3" y="3" width="13" height="18" rx="2"/><line x1="3" y1="9" x2="16" y2="9"/><line x1="3" y1="15" x2="16" y2="15"/><line x1="9.5" y1="3" x2="9.5" y2="21"/><polyline points="19 9 22 12 19 15"/><line x1="16" y1="12" x2="22" y2="12"/>',
        paperclip: '<path d="M21.4 11.1l-9.2 9.2a6 6 0 0 1-8.5-8.5l9.2-9.2a4 4 0 0 1 5.7 5.7l-9.2 9.2a2 2 0 0 1-2.8-2.8l8.5-8.5"/>',
        cheatsheet: '<rect x="2" y="6" width="20" height="12" rx="2"/><line x1="6" y1="10" x2="6.01" y2="10"/><line x1="10" y1="10" x2="10.01" y2="10"/><line x1="14" y1="10" x2="14.01" y2="10"/><line x1="18" y1="10" x2="18.01" y2="10"/><line x1="7" y1="14" x2="17" y2="14"/>',
        settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h0a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v0a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
        plus_circle: '<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/>',
        columns: '<path d="M12 3h7a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-7m0-18H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h7m0-18v18"/>',
        dependents: '<circle cx="6" cy="3" r="2"/><circle cx="6" cy="21" r="2"/><circle cx="18" cy="12" r="2"/><path d="M6 5v6a3 3 0 0 0 3 3h7"/><path d="M6 19v-6a3 3 0 0 1 3-3h7"/>',
        pdf: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><path d="M8 17v-4h1.5a1.25 1.25 0 0 1 0 2.5H8"/><path d="M12.5 13v4h1a2 2 0 0 0 0-4z"/><path d="M17.5 13H16v4M16 15h1.3"/>',
        xml: '<polyline points="14 2 14 8 20 8"/><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="10 13 8 15 10 17"/><polyline points="14 13 16 15 14 17"/>',
        link: '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
        globe: '<circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>',
        menu_path: '<line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><polyline points="3 5 4.5 6 3 7"/><polyline points="3 11 4.5 12 3 13"/><polyline points="3 17 4.5 18 3 19"/>',
        save: '<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/>',
        edit: '<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>',
        trash: '<polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/>',
        trail: '<circle cx="5" cy="19" r="2"/><circle cx="19" cy="5" r="2"/><path d="M5 17v-2a4 4 0 0 1 4-4h6a4 4 0 0 0 4-4V7"/>',
        info: '<circle cx="12" cy="12" r="9"/><line x1="12" y1="11" x2="12" y2="16"/><line x1="12" y1="8" x2="12.01" y2="8"/>',
        table: '<rect x="3" y="4" width="18" height="16" rx="2"/><line x1="3" y1="10" x2="21" y2="10"/><line x1="9" y1="4" x2="9" y2="20"/>',
        buscar: '<circle cx="11" cy="11" r="7"/><line x1="16.5" y1="16.5" x2="21" y2="21"/>',
        bandeja: '<polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>',
        carpeta: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
        grafica: '<line x1="4" y1="20" x2="20" y2="20"/><rect x="6" y="11" width="3" height="6" rx="0.5"/><rect x="11" y="7" width="3" height="10" rx="0.5"/><rect x="16" y="13" width="3" height="4" rx="0.5"/>',
        aviso: '<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>',
        reloj: '<circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15 14"/>'
    };
    const IA = '<path d="M12 3l1.8 4.6L18.5 9.4l-4.7 1.8L12 16l-1.8-4.8L5.5 9.4l4.7-1.8z"/><path d="M19 14l.6 1.6 1.6.6-1.6.6L19 19l-.6-1.6-1.6-.6 1.6-.6z"/>';
    const GITHUB = '<path fill="currentColor" d="M12 .5C5.73.5.5 5.73.5 12c0 5.08 3.29 9.39 7.86 10.91.58.11.79-.25.79-.56 0-.28-.01-1.02-.02-2-3.2.7-3.88-1.54-3.88-1.54-.52-1.33-1.28-1.68-1.28-1.68-1.05-.72.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.73-1.55-2.55-.29-5.24-1.28-5.24-5.68 0-1.25.45-2.28 1.19-3.08-.12-.29-.51-1.46.11-3.05 0 0 .97-.31 3.18 1.18a11.1 11.1 0 0 1 5.8 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.24 2.76.12 3.05.74.8 1.18 1.83 1.18 3.08 0 4.41-2.69 5.38-5.25 5.67.41.36.78 1.06.78 2.14 0 1.55-.01 2.8-.01 3.18 0 .31.21.68.8.56A11.51 11.51 0 0 0 23.5 12C23.5 5.73 18.27.5 12 .5z"/>';

    function icono(clave, tam, extra) {
        const t = tam || 16;
        const base = 'xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="' + t + '" height="' + t + '" aria-hidden="true"' + (extra ? ' ' + extra : '');
        if (clave === 'github_backup') return '<svg ' + base + '>' + GITHUB + '</svg>';
        if (clave === 'ai_assistant') return '<svg ' + base + ' fill="none" stroke="#7c3aed" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' + IA + '</svg>';
        const c = CUERPOS[clave];
        if (!c) return '';
        return '<svg ' + base + ' fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' + c + '</svg>';
    }

    const LISTA = [
        { id: 'suiteql', tono: 'azul', cat: 'dev', item: 'link_SuiteQLRunner', nombre: 'openSuiteQLRunnerLabel', icono: 'suiteql' },
        { id: 'ssc', tono: 'indigo', cat: 'dev', item: 'link_SuiteScriptConsole', nombre: 'enableSuiteScriptConsoleLabel', icono: 'suitescript_console' },
        { id: 'adv', tono: 'cielo', cat: 'dev', item: 'link_AdvancedEditor', nombre: 'adv_menu_open', icono: 'advanced_editor' },
        { id: 'frag', tono: 'turquesa', cat: 'dev', item: 'link_Fragmentos', nombre: 'ssc_frag_menu_tools', icono: 'fragments' },
        { id: 'lnm', tono: 'oliva', cat: 'dev', item: 'link_LoadNModule', nombre: 'lnm_menu_label', icono: 'package' },
        { id: 'sx', tono: 'naranja', cat: 'dev', item: 'link_ScriptExecute', nombre: 'enableScriptExecuteLabel', icono: 'script_execute' },
        { id: 'github', tono: 'pizarra', cat: 'dev', item: 'link_GithubBackup', nombre: 'enableGithubBackupLabel', icono: 'github_backup' },
        { id: 'vro', tono: 'verde', cat: 'record', item: 'link_VerObjectRecord', nombre: 'enableRecordObjectLabel', icono: 'view_record', registro: true },
        { id: 'scripted', tono: 'turquesa', cat: 'record', item: 'link_VerScriptedRecord', nombre: 'enableScriptedRecordsLabel', icono: 'scripted', registro: true },
        { id: 'logs', tono: 'ambar', cat: 'record', item: 'link_RecordLogsViewer', nombre: 'enableRecordLogsViewerLabel', icono: 'record_logs', registro: true },
        { id: 'history', tono: 'azul', cat: 'record', item: 'link_RecordHistory', nombre: 'enableRecordHistoryLabel', icono: 'timeline', registro: true },
        { id: 'csvt', tono: 'oliva', cat: 'record', item: 'link_CsvImportTemplate', nombre: 'enableCsvImportTemplateLabel', icono: 'csv_template', registro: true },
        { id: 'attach', tono: 'rojo', cat: 'record', item: 'link_RecordAttachments', nombre: 'enableRecordAttachmentsLabel', icono: 'paperclip', registro: true },
        { id: 'findfield', tono: 'violeta', cat: 'record', item: 'link_FindFieldById', nombre: 'enableFindFieldByIdLabel', icono: 'find_field', registro: true },
        { id: 'enableall', tono: 'naranja', cat: 'record', item: 'link_EnableAllFields', nombre: 'sfv_all_menu', icono: 'unlock', registro: true },
        { id: 'ss1', tono: 'pizarra', cat: 'record', item: 'link_LoadRecordSS1', nombre: 'lrc_menu_ss1', icono: 'terminal', registro: true },
        { id: 'ss2', tono: 'indigo', cat: 'record', item: 'link_LoadRecordSS2', nombre: 'lrc_menu_ss2', icono: 'terminal', registro: true },
        { id: 'trail', tono: 'rosa', cat: 'record', nombre: 'rt_title', icono: 'trail', registro: true },
        { id: 'sfv', tono: 'cielo', cat: 'record', nombre: 'sfv_title', icono: 'info', registro: true },
        { id: 'goto', tono: 'cielo', cat: 'find', item: 'link_GoToRecord', nombre: 'enableGoToRecordLabel', icono: 'goto_record' },
        { id: 'palette', tono: 'violeta', cat: 'find', item: 'link_CommandPalette', nombre: 'enableCommandPaletteLabel', icono: 'command_palette' },
        { id: 'cfind', tono: 'indigo', cat: 'find', item: 'link_CustomizationFinder', nombre: 'enableCustomizationFinderLabel', icono: 'customization_finder' },
        { id: 'delrec', tono: 'rojo', cat: 'find', item: 'link_DeletedRecords', nombre: 'enableDeletedRecordsLabel', icono: 'deleted_records' },
        { id: 'exportsearch', tono: 'verde', cat: 'find', item: 'link_ExportSearch', nombre: 'enableExportSearchLabel', icono: 'export_search' },
        { id: 'perf', tono: 'naranja', cat: 'more', item: 'link_PagePerformance', nombre: 'pp_title', icono: 'page_perf' },
        { id: 'perms', tono: 'indigo', cat: 'more', item: 'link_RolePermissions', nombre: 'enableRolePermissionsLabel', icono: 'shield' },
        { id: 'env', tono: 'turquesa', cat: 'more', item: 'link_OpenInEnv_group', nombre: 'tmm_d_env', icono: 'open_in_env' },
        { id: 'cheatsheet', tono: 'ambar', cat: 'more', item: 'link_ShortcutsCheatsheet', nombre: 'enableShortcutsCheatsheetLabel', icono: 'cheatsheet' },
        { id: 'sva', tono: 'oliva', cat: 'more', nombre: 'sva_title', icono: 'scripted' },
        { id: 'csvviewer', tono: 'verde', cat: 'more', nombre: 'enableCsvResponseViewerLabel', icono: 'table' },
        { id: 'tools', tono: 'pizarra', cat: 'more', nombre: 'menuTools', icono: 'tools' }
    ];
    const POR_ID = {};
    LISTA.forEach((h) => { POR_ID[h.id] = h; });

    function texto(clave, respaldo, sust) {
        try { return chrome.i18n.getMessage(clave, sust) || respaldo || ''; } catch (e) { return respaldo || ''; }
    }

    function esc(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    }

    function entorno() {
        try {
            const E = globalThis.NSFT_ENV;
            return E && E.envFromUrl ? E.envFromUrl(location.href) : null;
        } catch (e) { return null; }
    }

    function registro() {
        let id = '';
        try { id = new URLSearchParams(location.search).get('id') || ''; } catch (e) { }
        const m = /\(([^()]+)\)\s*$/.exec(document.title || '');
        return { tipo: m ? m[1].trim() : '', id: /^\d+$/.test(id) ? id : '' };
    }

    function chapaEntorno() {
        const e = entorno();
        if (!e || !e.code) return '';
        return '<span class="nsft-cab-env" style="--nsft-env:' + esc(e.color || '#6b7280') + '" title="' + esc(e.name || e.code) + '">' + esc(e.code) + '</span>';
    }

    function cabecera(titulo, id, o) {
        const h = POR_ID[id];
        if (!titulo || !h) return;
        o = o || {};
        const nombre = texto(h.nombre, titulo.textContent.trim());
        titulo.classList.add('nsft-cab');
        titulo.innerHTML = '<span class="nsft-cab-herr" data-cat="' + h.cat + '" data-tono="' + (h.tono || '') + '">'
            + '<span class="nsft-cab-ico">' + icono(h.icono, 16) + '</span>'
            + '<span class="nsft-cab-nombre">' + esc(nombre) + '</span>'
            + '</span>';
        const cab = titulo.closest('.nsft-modal-header');
        if (cab) cab.querySelectorAll('.nsft-modal-tool').forEach((b) => {
            if (!b.title) b.title = b.textContent.trim();
        });

        if (o.contexto === false) return;
        const propio = o.contextoEl && cab ? cab.querySelector(o.contextoEl) : null;
        let ctx = '';
        if (!propio) {
            if (typeof o.contexto === 'string' && o.contexto) ctx = '<span class="nsft-cab-txt">' + esc(o.contexto) + '</span>';
            else if (o.contexto && typeof o.contexto === 'object' && (o.contexto.txt || o.contexto.id)) {
                if (o.contexto.txt) ctx += '<span class="nsft-cab-txt">' + esc(o.contexto.txt) + '</span>';
                if (o.contexto.id) ctx += '<span class="nsft-cab-id">' + esc(o.contexto.id) + '</span>';
            }
            else if (h.registro && o.registro !== false) {
                const r = registro();
                if (r.tipo) ctx += '<span class="nsft-cab-txt">' + esc(r.tipo) + '</span>';
                if (r.id) ctx += '<span class="nsft-cab-id">#' + esc(r.id) + '</span>';
            }
        }
        ctx += chapaEntorno();
        if (!ctx && !propio) return;
        const padre = titulo.parentNode;
        const viejo = padre && padre.querySelector(':scope > .nsft-cab-ctx');
        if (viejo) viejo.remove();
        const sep = padre && padre.querySelector(':scope > .nsft-cab-sep');
        if (sep) sep.remove();
        titulo.insertAdjacentHTML('afterend', '<span class="nsft-cab-sep" aria-hidden="true"></span><span class="nsft-cab-ctx">' + ctx + '</span>');
        if (propio) titulo.nextElementSibling.nextElementSibling.prepend(propio);
    }

    const VIGILADAS = [];
    let _suscrito = false;
    function kbd(t) { return '<kbd>' + t + '</kbd>'; }
    function teclas(lista) {
        return '<span class="nsft-paleta-teclas">'
            + (lista || []).map(([k, txt]) => [].concat(k).map(kbd).join('') + ' ' + esc(txt)).join(' ')
            + '</span>';
    }
    function paleta(raiz, v) {
        const h = POR_ID[v.id];
        raiz.dataset.cat = h.cat;
        if (h.tono) raiz.dataset.tono = h.tono;
        const barra = raiz.querySelector('.nsft-paleta-barra');
        if (barra && !barra.querySelector(':scope > .nsft-paleta-ico')) {
            barra.insertAdjacentHTML('afterbegin', '<span class="nsft-paleta-ico">' + icono(h.icono, 16) + '</span>');
            barra.insertAdjacentHTML('beforeend', '<span class="nsft-paleta-chip">' + esc(texto(h.nombre, '')) + '</span>');
        }
        let pie = raiz.querySelector(':scope > .nsft-paleta-pie');
        if (!pie) {
            raiz.insertAdjacentHTML('beforeend', '<div class="nsft-paleta-pie"><span class="nsft-paleta-cuenta"></span>'
                + teclas(v.o.teclas || [['↑↓', texto('tmm_k_nav', 'navigate')], ['↵', texto('tmm_k_open', 'open')], ['Esc', texto('tmm_k_close', 'close')]])
                + '</div>');
            pie = raiz.querySelector(':scope > .nsft-paleta-pie');
        }
        if (v.o.filas) {
            const n = raiz.querySelectorAll(v.o.filas).length;
            const txt = n ? texto('pal_resultados', String(n), [String(n)]) || (n + '') : '';
            const c = pie.querySelector('.nsft-paleta-cuenta');
            if (c && c.textContent !== txt) c.textContent = txt;
        }
    }

    function repasa() {
        for (const v of VIGILADAS) {
            const raices = document.querySelectorAll(v.sel);
            for (const raiz of raices) {
                if (raiz.classList.contains('nsft-paleta')) { paleta(raiz, v); continue; }
                const t = raiz.querySelector('.nsft-modal-header .nsft-modal-title');
                if (!t || t.querySelector('.nsft-cab-herr')) continue;
                const o = Object.assign({}, v.o);
                if (typeof o.contexto === 'function') {
                    try { o.contexto = o.contexto(raiz); } catch (e) { o.contexto = ''; }
                }
                cabecera(t, v.id, o);
            }
        }
    }
    function vigila(sel, id, o) {
        if (!sel || !POR_ID[id]) return;
        if (!VIGILADAS.some((v) => v.sel === sel && v.id === id)) VIGILADAS.push({ sel, id, o: o || {} });
        repasa();
        if (_suscrito || typeof MutationObserver === 'undefined') return;
        _suscrito = true;
        const RAIZ = '.nsft-modal, .nsft-paleta, .nsft-modal-header, .nsft-modal-title, .nsft-paleta-barra';
        const toca = (m) => {
            const t = m.target;
            if (t && t.nodeType === 1 && t.closest && t.closest('.nsft-modal-title, .nsft-paleta')) return true;
            for (const n of m.addedNodes) {
                if (n.nodeType !== 1) continue;
                if (n.matches(RAIZ) || n.querySelector('.nsft-modal-title, .nsft-paleta-barra')) return true;
            }
            return false;
        };
        new MutationObserver((muts) => {
            for (const m of muts) if (toca(m)) { repasa(); return; }
        }).observe(document.documentElement, { childList: true, subtree: true });
    }

    function vacio(ico, titulo, frase, accion, op) {
        let t = String(titulo || '').trim();
        let f = frase ? String(frase).trim() : '';
        let p = t.indexOf('. ');
        if (p < 0) p = t.indexOf(': ');
        if (!f && p > 0) {
            f = t.slice(p + 2).trim();
            f = f.charAt(0).toUpperCase() + f.slice(1);
            t = t.slice(0, p);
        }
        t = t.replace(/\.$/, '');
        const dibujo = /^\s*</.test(ico || '') ? ico : (CUERPOS[ico] || CUERPOS.info);
        const linea = !!(op && op.linea);
        const lado = linea ? 15 : 20;
        return '<div class="nsft-vacio' + (linea ? ' is-linea' : '') + '">'
            + '<svg class="nsft-vacio-ico" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="' + lado + '" height="' + lado + '" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + dibujo + '</svg>'
            + '<span class="nsft-vacio-tit">' + esc(t) + '</span>'
            + (f ? '<span class="nsft-vacio-txt">' + esc(f) + '</span>' : '')
            + (accion || '')
            + '</div>';
    }

    const ESTADOS = {
        RELEASED: ['sr_status_released', 'Released', 'is-ok'],
        ACTIVE: ['sr_status_released', 'Released', 'is-ok'],
        TESTING: ['sr_status_testing', 'Testing', 'is-warn'],
        NOTSCHEDULED: ['sr_status_not_scheduled', 'Not scheduled', ''],
        SCHEDULED: ['est_scheduled', 'Scheduled', 'is-ok'],
        INPROGRESS: ['est_inprogress', 'In progress', 'is-warn'],
        INQUEUE: ['est_inqueue', 'Queued', 'is-warn'],
        PENDING: ['est_inqueue', 'Queued', 'is-warn'],
        COMPLETE: ['est_complete', 'Complete', 'is-ok'],
        COMPLETED: ['est_complete', 'Complete', 'is-ok'],
        FAILED: ['est_failed', 'Failed', 'is-mal']
    };
    function estadoNS(crudo) {
        crudo = String(crudo == null ? '' : crudo);
        const dos = crudo.lastIndexOf(' : ');
        if (dos > 0) crudo = crudo.slice(dos + 3);
        const k = crudo.replace(/[\s_-]/g, '').toUpperCase();
        const e = ESTADOS[k];
        if (e) return { texto: texto(e[0], e[1]), clase: ('nsft-estado ' + e[2]).trim() };
        const s = String(crudo == null ? '' : crudo).trim().toLowerCase();
        return { texto: s.charAt(0).toUpperCase() + s.slice(1), clase: 'nsft-estado' };
    }

    const DIALOGO = {
        guardar: '<path d="M5 4h11l3 3v13H5zM8 4v5h7V4M8 20v-6h8v6"></path>',
        abrir: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>',
        exportar: '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"></path>'
    };
    function tituloDialogo(clave, txt, tono) {
        const c = DIALOGO[clave] || CUERPOS[clave] || '';
        const svg = c ? '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' + c + '</svg>' : '';
        return '<span class="nsft-cab-herr nsft-dlg-tit" data-tono="' + esc(tono || '') + '">'
            + (svg ? '<span class="nsft-cab-ico">' + svg + '</span>' : '')
            + '<span class="nsft-cab-nombre">' + esc(txt) + '</span></span>';
    }

    function precargaLetra() {
        try {
            if (!document.fonts || !document.fonts.load) return;
            ['400', '500', '600'].forEach((peso) => {
                document.fonts.load(peso + ' 13px "NSFT IBM Plex Sans"').catch(() => { });
            });
        } catch (e) { }
    }
    const ocioso = (fn) => (window.requestIdleCallback ? window.requestIdleCallback(fn, { timeout: 3000 }) : setTimeout(fn, 1500));
    if (document.readyState === 'complete') ocioso(precargaLetra);
    else window.addEventListener('load', () => ocioso(precargaLetra), { once: true });

    window.NSFT_Herramientas = {
        teclas,
        tituloDialogo,
        estadoNS,
        vacio,
        vigila,
        LISTA,
        de: (id) => POR_ID[id] || null,
        porItem: (item) => LISTA.find((h) => h.item === item) || null,
        icono,
        nombre: (id) => (POR_ID[id] ? texto(POR_ID[id].nombre, '') : ''),
        cabecera,
        entorno,
        registro
    };
})();
