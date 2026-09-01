(function () {
    'use strict';

    const P = {};

    const t = (clave, subs) => (chrome.i18n.getMessage(clave, subs) || '');

    const recurso = (ruta) => ((chrome.runtime && chrome.runtime.getURL)
        ? chrome.runtime.getURL(ruta)
        : '');
    const LOGO = recurso('assets/img/logomini.png');
    const ICONO = recurso('assets/icons/icon128.png');

    const HABLA_ES = String((chrome.i18n.getUILanguage && chrome.i18n.getUILanguage()) || 'en')
        .toLowerCase().indexOf('es') === 0;

    const NS = HABLA_ES
        ? { tx: 'Transacciones', li: 'Listas', re: 'Informes', do: 'Documentos', se: 'Configuración',
            edit: 'Editar', back: 'Atrás', name: 'Nombre', id: 'ID', date: 'Fecha', inactive: 'Inactivo',
            startDate: 'Fecha de inicio', endDate: 'Fecha de fin', apply: 'Aplicar', invoice: 'Factura',
            role: 'Administrador', search: 'Buscar', user: 'Demo Usuario', ia: 'IA',
            ask1: 'hola',
            ans1: '¡Hola! ¿En qué te ayudo?',
            ask2: '¿cuántos clientes activos hay?',
            ans2: 'Hay 1 248 clientes activos.',
            ready: 'Listo',
            hint: 'Pregunta sobre esta página o tu cuenta',
            tabNotes: 'Notas', tabFiles: 'Archivos', tabWf: 'Flujo de trabajo',
            userNotes: 'Notas del usuario', sysNotes: 'Notas del sistema',
            view: 'Ver', newNote: 'Nueva nota', custView: 'Personalizar vista',
            author: 'Autor', title: 'Título',
            noRecords: 'No hay registros para mostrar.',
            hue: 'Matiz', sat: 'Saturación', lig: 'Luminosidad',
            estado: 'Estado', dept: 'Departamento', clase: 'Clase',
            ubic: 'Ubicación', subsid: 'Subsidiaria', acct: 'Cuenta',
            tabCampos: 'Campos', tabForms: 'Formularios',
            save: 'Guardar', cancel: 'Cancelar', tipo: 'Tipo', detalle: 'Detalle',
            tabLog: 'Inicio de sesión para ejecución', tabDeploy: 'Despliegues', tabParams: 'Parámetros',
            deleteAll: 'Eliminar todo', refresh: 'Actualizar',
            lvDebug: 'Depurar', lvAudit: 'Auditoría', lvError: 'Error',
            fileName: 'Archivo', script: 'Script', apiVer: 'Versión de API',
            tabCmds: 'Secuencias de comando', scriptFile: 'Archivo de script',
            preview: 'vista previa', download: 'descargar',
            dropHere: 'Soltar script aquí',
            stWf: 'Acción de flujo de trabajo', stClient: 'Cliente', stUe: 'Evento del usuario',
            stLib: 'Librería', stMr: 'Map/Reduce', stPortlet: 'Portlet',
            stSched: 'Programado', stRestlet: 'RESTlet', stSuitelet: 'Suitelet',
            savedSearch: 'Búsqueda guardada', tabCriteria: 'Criterios',
            tabResults: 'Resultados', tabAvail: 'Filtros disponibles',
            summaryType: 'Tipo de resumen',
            field: 'Campo', formula: 'Fórmula', filtro: 'Filtro', descripcion: 'Descripción',
            newSavedSearch: 'Nueva búsqueda guardada', searchType: 'Tipo de búsqueda',
            actividad: 'Actividad', articulo: 'Artículo', cliente: 'Cliente',
            empleado: 'Empleado', trans: 'Transacción',
            filtros: 'Filtros', total: 'Total', masLinks: 'Más',
            tabLines: 'Artículos', lineKey: 'Clave de línea',
            grpMain: 'Información primaria', grpClass: 'Clasificación', grpCost: 'Detalle de artículo/costo',
            prodEnv: 'Entorno de producción', memo: 'Nota',
            home: 'Inicio', help: 'Ayuda', fromBundle: 'Desde paquete',
            errTitle: 'Aviso', errText: 'No hay registros de este tipo.', volver: 'Volver',
            incluirHijos: 'Incluir hijos', scriptList: 'Secuencias de comando',
            newScript: 'Nuevo script', anyOne: 'Cualquiera', none: 'Ninguno',
            showInactive: 'Mostrar inactivos', internalId: 'ID interno',
            autoId: 'Generar ID automáticamente', email: 'Correo electrónico',
            pass: 'Contraseña', login: 'Iniciar sesión', sessionOut: 'Tu sesión ha caducado',
            publicLanding: 'Página pública de NetSuite', bundleStatus: 'Estado de instalación de paquetes',
            installing: 'Instalando…', installed: 'Instalado', pendientes: 'pendientes', format: 'Formatear',
            logout: 'Cerrar sesión', myRoles: 'Ver mis roles', switchAccount: 'Cambiar de cuenta',
            prodTag: 'Producción', remember: 'Recuérdeme', today: 'hoy',
            passkey: 'Inicio de sesión con clave de paso', forgot: '¿Ha olvidado su contraseña?',
            fcTitle: 'Archivador', fcFolderSearch: 'Búsqueda de carpeta', fcApi21: 'API de SuiteScript 2.1',
            fcAddFile: 'Agregar archivo', fcAddAdv: 'Adición avanzada', fcNewFolder: 'Nueva carpeta',
            fcMoveFiles: 'Mover archivos', fcSize: 'Tamaño', fcModified: 'Última modificación',
            fcDownload: 'Descargar', fcFolder: 'Carpeta', fcJs: 'Archivo JavaScript',
            fcFileNameLbl: 'Nombre de archivo', fcFileType: 'Tipo de archivo',
            wfTitle: 'Flujo de trabajo', wfWorkspace: 'Espacio de trabajo', wfSummary: 'Resumen',
            wfRecordType: 'Tipo de registro', wfRelease: 'Estado liberación', wfEvents: 'Eventos',
            pdfKind: 'Plantilla PDF/HTML avanzada', pdfSetup: 'Configuración de plantilla', pdfSource: 'Código fuente',
            says: 'dice', ok: 'Aceptar',
            pvActivo: 'Activo', pvInactivo: 'Inactivo', pvPendiente: 'Pendiente', pvAprobado: 'Aprobado',
            pvRechazado: 'Rechazado', pvRevision: 'Revisión', pvCompletado: 'Completado', pvIsActive: 'es Activo',
            pvIsNum: 'es 18402.55', pvIsRec: 'es Demo Record', pvClic: 'clic', pvInicio: 'Inicio',
            pvVentas: 'Ventas', pvArt: 'Demo · Artículo', pvArts: 'Demo · Artículos',
            pvActRecs: 'Demo · Registros activos', pvEstadoCol: 'Demo · Estado', pvTotalIva: 'Demo · Total con IVA',
            pvTotalPend: 'Demo · Total pendiente', pvTotalOk: 'Demo · Total revisado',
            pvTotalPct: 'Demo · % del total', pvConteo: 'Demo · Conteo', pvCosto: 'Demo · Costo',
            pvPrecio: 'Demo · Precio', pvMargen: 'Demo · Margen', pvUnidad: 'Demo · Unidad',
            pvAlmacen: 'Demo · Almacén', pvLote: 'Demo · Lote', pvStockRev: 'Demo · Revisión de existencias',
            pvImport: 'Demo · Importación de registros', pvInvAdj: 'Demo · Ajustes de inventario',
            pvMonthCount: 'Demo · Conteo mensual de existencias',
            pvStockAdj: 'Demo · Ajuste de existencias del almacén',
            pvMemo: 'Demo · Revisión de existencias del almacén central. Se repasaron las líneas pendientes de la semana y se ajustaron las cantidades que no cuadraban con el físico. Queda pendiente el traspaso al almacén de tránsito.',
            pvWh1: 'Demo · Almacén central de perecederos', pvWh2: 'Demo · Almacén de tránsito norte',
            pvWh3: 'Demo · Almacén de devoluciones', pvWh4: 'Demo · Almacén de cuarentena',
            pvWh5: 'Demo · Almacén de producto terminado', pvWh6: 'Demo · Almacén de materia prima',
            pvNavCounts: 'Demo · Conteos', pvNavAdj: 'Demo · Ajustes', pvNavTransf: 'Demo · Traspasos',
            pvNavWh: 'Demo · Almacenes', pvRolAcct: 'Demo · Contabilidad', pvPortRem: 'Demo · Recordatorios',
            pvPortKpi: 'Demo · Indicadores', pvPortTask: 'Demo · Tareas', pvCats: 'DEMO CATEGORÍAS',
            pvGrupo: 'Demo Grupo', pvTipoN: 'Demo Tipo', pvRolSales: 'Demo · Ventas', pvDeptSales: 'Demo Ventas',
            pvClaseDir: 'Demo Directa', pvUbicCentro: 'Demo Centro', pvAcctInc: 'Demo Ingresos',
            pvCoNorte: 'Demo Norte S.A.', pvCoSur: 'Demo Sur S. de R.L.', pvNorte: 'Demo Norte', pvSur: 'Demo Sur',
            pvCoSa: 'Demo Co. S.A.', pvOtraCo: 'OTRA CO SB1', pvScrCs: 'Demo CS - Formulario',
            pvScrUeDoc: 'Demo UE - Documentos', pvScrUeVal: 'Demo UE - Validar',
            pvScrMrSync: 'Demo MR - Sincronizar', pvScrMrExp: 'Demo MR - Exportar',
            pvScrMrRec: 'Demo MR - Recalcular', pvScrMrDep: 'Demo MR - Depurar', pvScrSl: 'Demo SL - Reporte',
            pvCountRec: 'Demo Registro de Conteo', pvCountRecId: '_demo_registro_de_conteo',
            pvCountQuery: 'Demo Consulta de Conteo', pvProyecto: 'Demo Proyecto', pvFcUpd: 'Demo Actualizacion',
            pvFcTpl: 'Demo Plantillas', pvFcAttach: 'Demo Adjuntos', pvBnUtil: 'Demo Utilidades',
            pvBnConn: 'Demo Conectores', pvSuiteInv: 'Demo Suite · Inventario', pvSuiteBuy: 'Demo Suite · Compras',
            pvSuiteRep: 'Demo Suite · Reportes', pvSuiteInt: 'Demo Suite · Integraciones',
            pvFileStyles: 'demo_estilos.css', pvFileData: 'demo_datos.csv', pvFileReport: 'demo_reporte.pdf',
            pvFileForm: 'demo_cs_formulario.js', pvFileSync: 'demo_mr_sincronizar.js',
            pvFileResp15: 'demo_respuesta_15.csv', pvFileResp: 'demo_respuesta.csv',
            pvMail: 'demo.usuario@demo-co.mx', pvExpApp: 'Demo · Aprobación de gastos',
            pvWfCreate: 'Demo · Creación', pvWfDesc: 'Demo · Revisa el gasto antes de contabilizarlo.',
            pvWfRelease: 'Demo · No iniciado', pvWfSendMail: 'Enviar correo electrónico',
            pvWfSetField: 'Configurar valor de campo', pvWfLock: 'Bloquear registro',
            pvPdfTpl: 'Demo · Plantilla de factura', pvPdfInv: 'Demo · Factura', pvLogNew: 'Nueva línea del demo',
            pvLogOther: 'Otra línea del demo', pvLogSaved: 'Demo Record guardado', pvLogOk: 'Validación correcta',
            pvLogStart: 'Inicio del proceso', pvLogRef: 'No se pudo resolver la referencia',
            pvLogTimeout: 'Tiempo de espera agotado', pvLogNoChg: 'Sin cambios que guardar',
            pvLogRows: '1 042 registros procesados', pvCsvErrReq: 'Campo obligatorio vacío',
            pvCsvErrList: 'Valor no válido para la lista', pvTrailPend: 'Revisión pendiente',
            pvTrailNew: 'Alta del registro', pvTrailRev: 'Revisión del demo', pvTrailImp: 'Importado del demo',
            pvFipHelp: 'Estado del registro demo.', pvConstType: 'TIPO', pvConstCap: 'TOPE',
            pvIdEstados: 'customlist_demo_estados', pvIdEstado: 'custrecord_demo_estado',
            pvIdAuth: 'CUSTBODY_DEMO_AUTORIZADO', pvIdMotivo: 'CUSTBODY_DEMO_MOTIVO',
            pvIdTotIva: 'custrecord_total_iva', pvQryEstado: 'estado=3', pvJsonAcct: 'cuenta',
            pvJsonRecs: 'registros', pvJsonName: 'nombre', pvJsonActive: 'activo', pvJsonItem: 'articulo' }
        : { tx: 'Transactions', li: 'Lists', re: 'Reports', do: 'Documents', se: 'Setup',
            edit: 'Edit', back: 'Back', name: 'Name', id: 'ID', date: 'Date', inactive: 'Inactive',
            startDate: 'Start Date', endDate: 'End Date', apply: 'Apply', invoice: 'Invoice',
            role: 'Administrator', search: 'Search', user: 'Demo User', ia: 'AI',
            ask1: 'hi',
            ans1: 'Hi! How can I help?',
            ask2: 'how many active customers?',
            ans2: 'There are 1,248 active customers.',
            ready: 'Ready',
            hint: 'Ask about this page or your account',
            tabNotes: 'Notes', tabFiles: 'Files', tabWf: 'Workflow',
            userNotes: 'User Notes', sysNotes: 'System Notes',
            view: 'View', newNote: 'New Note', custView: 'Customize View',
            author: 'Author', title: 'Title',
            noRecords: 'There are no records to show.',
            hue: 'Hue', sat: 'Saturation', lig: 'Lightness',
            estado: 'Status', dept: 'Department', clase: 'Class',
            ubic: 'Location', subsid: 'Subsidiary', acct: 'Account',
            tabCampos: 'Fields', tabForms: 'Forms',
            save: 'Save', cancel: 'Cancel', tipo: 'Type', detalle: 'Details',
            tabLog: 'Execution Log', tabDeploy: 'Deployments', tabParams: 'Parameters',
            deleteAll: 'Delete All', refresh: 'Refresh',
            lvDebug: 'Debug', lvAudit: 'Audit', lvError: 'Error',
            fileName: 'File', script: 'Script', apiVer: 'API Version',
            tabCmds: 'Scripts', scriptFile: 'Script File',
            preview: 'preview', download: 'download',
            dropHere: 'Drop script here',
            stWf: 'Workflow Action', stClient: 'Client', stUe: 'User Event',
            stLib: 'Library', stMr: 'Map/Reduce', stPortlet: 'Portlet',
            stSched: 'Scheduled', stRestlet: 'RESTlet', stSuitelet: 'Suitelet',
            savedSearch: 'Saved Search', tabCriteria: 'Criteria',
            tabResults: 'Results', tabAvail: 'Available Filters',
            summaryType: 'Summary Type',
            field: 'Field', formula: 'Formula', filtro: 'Filter', descripcion: 'Description',
            newSavedSearch: 'New Saved Search', searchType: 'Search Type',
            actividad: 'Activity', articulo: 'Item', cliente: 'Customer',
            empleado: 'Employee', trans: 'Transaction',
            filtros: 'Filters', total: 'Total', masLinks: 'More',
            tabLines: 'Items', lineKey: 'Line Key',
            grpMain: 'Primary Information', grpClass: 'Classification', grpCost: 'Item/Cost Detail',
            prodEnv: 'Production environment', memo: 'Memo',
            home: 'Home', help: 'Help', fromBundle: 'From Bundle',
            errTitle: 'Notice', errText: 'There are no records of this type.', volver: 'Back',
            incluirHijos: 'Include children', scriptList: 'Scripts',
            newScript: 'New Script', anyOne: 'Any', none: 'None',
            showInactive: 'Show Inactives', internalId: 'Internal ID',
            autoId: 'Auto-generate ID', email: 'Email address',
            pass: 'Password', login: 'Log in', sessionOut: 'Your session has expired',
            publicLanding: 'NetSuite public site', bundleStatus: 'Bundle Installation Status',
            installing: 'Installing…', installed: 'Installed', pendientes: 'pending', format: 'Format',
            logout: 'Log out', myRoles: 'View my roles', switchAccount: 'Switch to another account',
            prodTag: 'Production', remember: 'Remember me', today: 'today',
            passkey: 'Sign in with a passkey', forgot: 'Forgot your password?',
            fcTitle: 'File Cabinet', fcFolderSearch: 'Folder Search', fcApi21: 'SuiteScript 2.1 API',
            fcAddFile: 'Add File', fcAddAdv: 'Advanced Add', fcNewFolder: 'New Folder',
            fcMoveFiles: 'Move Files', fcSize: 'Size', fcModified: 'Last Modified',
            fcDownload: 'Download', fcFolder: 'Folder', fcJs: 'JavaScript File',
            fcFileNameLbl: 'File Name', fcFileType: 'File Type',
            wfTitle: 'Workflow', wfWorkspace: 'Workspace', wfSummary: 'Summary',
            wfRecordType: 'Record Type', wfRelease: 'Release Status', wfEvents: 'Events',
            pdfKind: 'Advanced PDF/HTML Template', pdfSetup: 'Template Setup', pdfSource: 'Source Code',
            says: 'says', ok: 'OK',
            pvActivo: 'Active', pvInactivo: 'Inactive', pvPendiente: 'Pending', pvAprobado: 'Approved',
            pvRechazado: 'Rejected', pvRevision: 'Review', pvCompletado: 'Complete', pvIsActive: 'is Active',
            pvIsNum: 'is 18402.55', pvIsRec: 'is Demo Record', pvClic: 'click', pvInicio: 'Start',
            pvVentas: 'Sales', pvArt: 'Demo · Item', pvArts: 'Demo · Items', pvActRecs: 'Demo · Active records',
            pvEstadoCol: 'Demo · Status', pvTotalIva: 'Demo · Total with tax', pvTotalPend: 'Demo · Total pending',
            pvTotalOk: 'Demo · Total reviewed', pvTotalPct: 'Demo · % of total', pvConteo: 'Demo · Count',
            pvCosto: 'Demo · Cost', pvPrecio: 'Demo · Price', pvMargen: 'Demo · Margin', pvUnidad: 'Demo · Unit',
            pvAlmacen: 'Demo · Warehouse', pvLote: 'Demo · Lot', pvStockRev: 'Demo · Stock review',
            pvImport: 'Demo · Record import', pvInvAdj: 'Demo · Inventory adjustments',
            pvMonthCount: 'Demo · Monthly stock count', pvStockAdj: 'Demo · Warehouse stock adjustment',
            pvMemo: 'Demo · Stock review at the main warehouse. The pending lines of the week were gone over and the quantities that did not match the physical count were adjusted. The transfer to the transit warehouse is still pending.',
            pvWh1: 'Demo · Main perishables warehouse', pvWh2: 'Demo · North transit warehouse',
            pvWh3: 'Demo · Returns warehouse', pvWh4: 'Demo · Quarantine warehouse',
            pvWh5: 'Demo · Finished goods warehouse', pvWh6: 'Demo · Raw materials warehouse',
            pvNavCounts: 'Demo · Counts', pvNavAdj: 'Demo · Adjustments', pvNavTransf: 'Demo · Transfers',
            pvNavWh: 'Demo · Warehouses', pvRolAcct: 'Demo · Accounting', pvPortRem: 'Demo · Reminders',
            pvPortKpi: 'Demo · Key indicators', pvPortTask: 'Demo · Tasks', pvCats: 'DEMO CATEGORIES',
            pvGrupo: 'Demo Group', pvTipoN: 'Demo Type', pvRolSales: 'Demo · Sales', pvDeptSales: 'Demo Sales',
            pvClaseDir: 'Demo Direct', pvUbicCentro: 'Demo Center', pvAcctInc: 'Demo Income',
            pvCoNorte: 'Demo North Inc.', pvCoSur: 'Demo South LLC', pvNorte: 'Demo North', pvSur: 'Demo South',
            pvCoSa: 'Demo Co. Inc.', pvOtraCo: 'OTHER CO SB1', pvScrCs: 'Demo CS - Form',
            pvScrUeDoc: 'Demo UE - Documents', pvScrUeVal: 'Demo UE - Validate', pvScrMrSync: 'Demo MR - Sync',
            pvScrMrExp: 'Demo MR - Export', pvScrMrRec: 'Demo MR - Recalculate', pvScrMrDep: 'Demo MR - Cleanup',
            pvScrSl: 'Demo SL - Report', pvCountRec: 'Demo Count Record', pvCountRecId: '_demo_count_record',
            pvCountQuery: 'Demo Count Query', pvProyecto: 'Demo Project', pvFcUpd: 'Demo Update',
            pvFcTpl: 'Demo Templates', pvFcAttach: 'Demo Attachments', pvBnUtil: 'Demo Utilities',
            pvBnConn: 'Demo Connectors', pvSuiteInv: 'Demo Suite · Inventory',
            pvSuiteBuy: 'Demo Suite · Purchasing', pvSuiteRep: 'Demo Suite · Reports',
            pvSuiteInt: 'Demo Suite · Integrations', pvFileStyles: 'demo_styles.css', pvFileData: 'demo_data.csv',
            pvFileReport: 'demo_report.pdf', pvFileResp15: 'demo_response_15.csv', pvFileResp: 'demo_response.csv',
            pvFileForm: 'demo_cs_form.js', pvFileSync: 'demo_mr_sync.js',
            pvMail: 'demo.user@demo-co.com', pvExpApp: 'Demo · Expense approval', pvWfCreate: 'Demo · Create',
            pvWfDesc: 'Demo · Review the expense before posting it.', pvWfRelease: 'Demo · Not started',
            pvWfSendMail: 'Send Email', pvWfSetField: 'Set Field Value', pvWfLock: 'Lock Record',
            pvPdfTpl: 'Demo · Invoice template', pvPdfInv: 'Demo · Invoice', pvLogNew: 'New demo line',
            pvLogOther: 'Another demo line', pvLogSaved: 'Demo Record saved', pvLogOk: 'Validation passed',
            pvLogStart: 'Process started', pvLogRef: 'Could not resolve the reference',
            pvLogTimeout: 'Request timed out', pvLogNoChg: 'No changes to save',
            pvLogRows: '1,042 records processed', pvCsvErrReq: 'Required field empty',
            pvCsvErrList: 'Invalid value for the list', pvTrailPend: 'Pending review', pvTrailNew: 'Record created',
            pvTrailRev: 'Demo review', pvTrailImp: 'Demo import', pvFipHelp: 'Status of the demo record.',
            pvConstType: 'TYPE', pvConstCap: 'CAP', pvIdEstados: 'customlist_demo_statuses',
            pvIdEstado: 'custrecord_demo_status', pvIdAuth: 'CUSTBODY_DEMO_APPROVED',
            pvIdMotivo: 'CUSTBODY_DEMO_REASON', pvIdTotIva: 'custrecord_total_tax', pvQryEstado: 'status=3',
            pvJsonAcct: 'account', pvJsonRecs: 'records', pvJsonName: 'name', pvJsonActive: 'active',
            pvJsonItem: 'item' };

    const CURSOR_IA = `
                            <span class="nsft-pv-tap" aria-hidden="true"></span>
                            <span class="nsft-pv-cursor" aria-hidden="true">
                                <svg viewBox="0 0 24 24" fill="#fff" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round">
                                    <path d="M5 3l14 8.5-6.2 1.3L10 20z"/>
                                </svg>
                            </span>`;

    const PANEL_IA_LATERAL = `
                <div class="nsft-pv-side">
                  <div class="nsft-pv-side-inner">
                    <div class="nsft-pv-bar">
                        <span class="nsft-pv-mono nsft-pv-tiny">NSFT</span>
                        <span class="nsft-pv-bar-tail">&#128204; &#10005;</span>
                    </div>
                    <div class="nsft-pv-bar">
                        <span class="nsft-pv-ai">&#10022;</span>
                        <span class="nsft-pv-grow nsft-pv-tiny" data-pv-label></span>
                        <span class="nsft-pv-badge is-rp">BETA</span>
                    </div>
                    <div class="nsft-pv-side-body">
                        <span class="nsft-pv-emblem">&#10022;</span>
                        <div class="nsft-pv-skel"><i></i><i class="is-half"></i><i></i></div>
                    </div>
                    <div class="nsft-pv-body nsft-pv-flex">
                        <span class="nsft-pv-input nsft-pv-grow nsft-pv-mono nsft-pv-tiny">|</span>
                        <span class="nsft-pv-send">&#8594;</span>
                    </div>
                    <div class="nsft-pv-foot">
                        <span class="nsft-pv-mono nsft-pv-grow">claude-opus-4-8 &#9662;</span>
                        <span class="nsft-pv-mono">&#9776;</span>
                    </div>
                  </div>
                </div>`;

    const PANEL_IA = `
                <div class="nsft-pv-side">
                  <div class="nsft-pv-side-inner">
                    <div class="nsft-pv-bar">
                        <span class="nsft-pv-ai">&#10022;</span>
                        <span class="nsft-pv-grow nsft-pv-tiny" data-pv-label></span>
                        <span class="nsft-pv-badge is-rp">BETA</span>
                    </div>
                    <div class="nsft-pv-side-body">
                        <span class="nsft-pv-emblem">&#10022;</span>
                        <div class="nsft-pv-skel"><i></i><i class="is-half"></i><i></i></div>
                    </div>
                    <div class="nsft-pv-body nsft-pv-flex">
                        <span class="nsft-pv-input nsft-pv-grow nsft-pv-mono nsft-pv-tiny">|</span>
                        <span class="nsft-pv-send">&#8594;</span>
                    </div>
                    <div class="nsft-pv-foot">
                        <span class="nsft-pv-mono nsft-pv-grow">deepseek-v4-pro &#9662;</span>
                        <span class="nsft-pv-mono">&#9776;</span>
                    </div>
                  </div>
                </div>`;

    const CAMPOS = (extra) => `
                            <span class="nsft-pv-field"><span class="lbl">{{name}}${extra || ''}</span><span class="val">Demo Record</span></span>
                            <span class="nsft-pv-field"><span class="lbl">{{id}}</span><span class="val nsft-pv-mono">1042</span></span>
                            <span class="nsft-pv-field"><span class="lbl">{{date}}</span><span class="val nsft-pv-mono">16/11/2026</span></span>
                            <span class="nsft-pv-check"><i></i>{{inactive}}</span>`;

    const ICONO_INFO = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 11v5.5"/><circle cx="12" cy="7.6" r="1.15" fill="currentColor" stroke="none"/></svg>`;
    const ICONO_COPIAR = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><rect x="9" y="9" width="11.5" height="11.5" rx="2.5"/><path d="M5.5 15H5a2 2 0 0 1-2-2V5.5a2 2 0 0 1 2-2h7.5a2 2 0 0 1 2 2V6"/></svg>`;
    const ICONO_EDITAR = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M14.5 5.5l4 4"/></svg>`;
    const ICONO_PAPELERA = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16"/><path d="M9.5 7V4.5h5V7"/><path d="M6.5 7l1 12.5h9L17.5 7"/></svg>`;
    const ICONO_ACTUALIZAR = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 12a8 8 0 1 1-2.6-5.9"/><path d="M20 4v4h-4"/></svg>`;
    const ICONO_GUARDAR = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"><path d="M4.5 4.5h11L20 9v10.5H4.5z"/><path d="M8 4.5v5h7"/><path d="M8 19.5v-5h8v5"/></svg>`;
    const ICONO_MENU = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M4 7h16M4 12h16M4 17h16"/></svg>`;
    const ICONO_ABRIR = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 4h6v6"/><path d="M20 4l-8.5 8.5"/><path d="M18 14.5V19a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 4 19V8a1.5 1.5 0 0 1 1.5-1.5H10"/></svg>`;
    const ICONO_MAS = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>`;
    const ICONO_BD = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><ellipse cx="12" cy="5" rx="8" ry="2.8"/><path d="M4 5v6c0 1.55 3.58 2.8 8 2.8s8-1.25 8-2.8V5"/><path d="M4 11v6c0 1.55 3.58 2.8 8 2.8s8-1.25 8-2.8v-6"/></svg>`;
    const ICONO_LUPA = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>`;
    const ICONO_BAJAR = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><path d="M12 15V3"/></svg>`;
    const ICONO_CODIGO = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l-5 6 5 6"/><path d="M15 6l5 6-5 6"/></svg>`;
    const ICONO_RAMA = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="7" cy="5.5" r="2.5"/><circle cx="7" cy="18.5" r="2.5"/><circle cx="17" cy="8.5" r="2.5"/><path d="M7 8v8"/><path d="M17 11v1.5a3.5 3.5 0 0 1-3.5 3.5H10"/></svg>`;
    const ICONO_RELOJ = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.6 2.6"/><path d="M9 2.2h6"/></svg>`;
    const ICONO_CANDADO = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><rect x="4" y="10.5" width="16" height="10.5" rx="2.5"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/></svg>`;
    const ICONO_VISTO = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="4.5 12.5 9.5 17.5 19.5 6.5"/></svg>`;

    const PUNTERO = `
                                <svg viewBox="0 0 24 24" fill="#fff" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round">
                                    <path d="M5 3l14 8.5-6.2 1.3L10 20z"/>
                                </svg>`;

    const SUBLISTA = (extra, filas) => `
                    <div class="nsft-pv-subtabs">
                        <span class="is-on">{{tabNotes}}</span>
                        <span>{{tabFiles}}</span>
                        <span>{{tabWf}}</span>
                    </div>
                    <div class="nsft-pv-subhead">
                        <span class="is-on">{{userNotes}}</span>
                        <span>{{sysNotes}}</span>
                    </div>
                    <div class="nsft-pv-subbar">
                        <span>{{view}}</span>
                        <span class="nsft-pv-select">&#9662;</span>
                        <span class="nsft-pv-btn is-ghost">{{newNote}}</span>
                        <span class="nsft-pv-btn is-ghost">{{custView}}</span>
                        ${extra || ''}
                    </div>
                    <table class="nsft-pv-table">
                        <tr><th>{{edit}}</th><th>{{date}}</th><th>{{author}}</th><th>{{title}}</th></tr>
                        ${filas || '<tr><td colspan="4" class="nsft-pv-mute">{{noRecords}}</td></tr>'}
                    </table>`;

    const MODAL = `
            <div class="nsft-pv-modal">
                <div class="nsft-pv-bar">
                    <span class="nsft-pv-mono nsft-pv-tiny">NSFT</span>
                    <span class="nsft-pv-bar-tail">&#10005;</span>
                </div>
                <div class="nsft-pv-modal-body">
                    <div class="nsft-pv-skel"><i></i><i class="is-half"></i><i></i><i class="is-short"></i></div>
                </div>
                <div class="nsft-pv-modal-foot">
                    <span class="nsft-pv-btn is-ghost">{{back}}</span>
                    <span class="nsft-pv-btn">&#10003;</span>
                </div>
            </div>`;

    function cabeceraNS(o) {
        return `
                    <div class="nsft-pv-topbar">
                        <span class="nsft-pv-logo"><i>ORACLE</i>NetSuite</span>
                        ${o.ver || ''}
                        ${o.entorno || ''}
                        <span class="nsft-pv-search">&#9906; {{search}}</span>
                        ${o.perfil || ''}
                        <span class="nsft-pv-user">
                            <span class="u1">{{user}}</span>
                            <span class="u2">{{pvCoSa}} &middot; {{role}}</span>
                        </span>
                    </div>
                    <div class="nsft-pv-nsnav">
                        <span class="nsft-pv-navicon">&#8635;${o.navIcono || ''}</span><span>&#9733;</span><span>&#8962;</span>
                        <span>{{tx}}</span><span>{{li}}</span><span>{{re}}</span><span>{{do}}</span><span>{{se}}</span>
                    </div>`;
    }

    function ventanaNS(o) {
        o = o || {};
        const pagina = o.cuerpo ? `
                <div class="nsft-pv-page">
                    ${o.sinCabecera ? '' : cabeceraNS(o)}
                    ${o.cuerpo}
                </div>` : `
                <div class="nsft-pv-page">
                    ${cabeceraNS(o)}
                    <div class="nsft-pv-body nsft-pv-stack nsft-pv-bqhead">
                        <div class="nsft-pv-title">SO10482</div>
                        <span class="nsft-pv-bqlinks">
                            <span class="lk">&#8592;</span><span class="lk">&#8594;</span>
                            ${o.acciones || ''}
                            <span class="lk">{{li}}</span>
                            <span class="lk">{{search}}</span>
                        </span>
                    </div>
                    <div class="nsft-pv-actions">
                        <span class="nsft-pv-btn">{{edit}}</span>
                        <span class="nsft-pv-btn is-ghost">{{back}}</span>
                        ${o.accionesIzq || ''}
                    </div>
                    <div class="nsft-pv-body">
                        <div class="nsft-pv-fields">
                            ${o.campos || CAMPOS(o.campoExtra)}
                        </div>
                    </div>
                    ${o.sublista ? SUBLISTA(o.sublistaExtra, o.sublistaFilas) : ''}
                </div>`;

        const cuerpo = o.panel
            ? `<div class="nsft-pv-dock is-anim">${pagina}${o.panel}</div>`
            : (o.destino
                ? `<div class="nsft-pv-stackpage">${pagina}<div class="nsft-pv-page is-dest">${o.destinoSinCabecera ? '' : cabeceraNS(o)}${o.destino}</div></div>`
                : pagina);

        const marco = `
                <span class="nsft-pv-dots">
                    <span class="nsft-pv-dot is-red"></span><span class="nsft-pv-dot is-amber"></span><span class="nsft-pv-dot is-green"></span>
                </span>`;

        return `
        <div class="nsft-pv-win ${o.clase || ''}${o.sublistaExtra ? ' has-subextra' : ''}">
            ${o.pestanas ? `<div class="nsft-pv-tabs is-gt">` + marco + o.pestanas + `</div>` : ''}
            <div class="nsft-pv-chrome">
                ${o.pestanas ? '' : marco}
                <span class="nsft-pv-url">${o.url || '1234567.app.netsuite.com/app/common/custom/custrecordentry.nl'}</span>
            </div>
            ${cuerpo}
            ${o.modal ? MODAL : ''}
            ${o.extra || ''}
        </div>`;
    }

    P.aiAssistantPage = ventanaNS({
        sublista: true,
        acciones: `<span class="is-ai nsft-pv-hot">&#10022; <span data-pv-label></span>` + CURSOR_IA + `</span>`,
        panel: PANEL_IA_LATERAL
    });

    P.enableColorThemes = ventanaNS({
        clase: 'nsft-pv-hue',
        sublista: true,
        extra: `
            <div class="nsft-pv-float">
                <span class="nsft-pv-float-title" data-pv-label></span>
                <div class="nsft-pv-hsl">
                    <span>{{hue}}</span>
                    <span class="nsft-pv-slider is-hue"><i></i></span>
                    <span>{{sat}}</span>
                    <span class="nsft-pv-slider is-sat"><i></i></span>
                    <span>{{lig}}</span>
                    <span class="nsft-pv-slider is-lig"><i></i></span>
                </div>
                <span class="nsft-pv-tap is-tc" aria-hidden="true"></span>
                <span class="nsft-pv-cursor is-tc" aria-hidden="true">
                    <svg viewBox="0 0 24 24" fill="#fff" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round">
                        <path d="M5 3l14 8.5-6.2 1.3L10 20z"/>
                    </svg>
                </span>
            </div>`
    });

    P.enableViewRecordObject = ventanaNS({
        clase: 'nsft-pv-vro',
        sublista: true,
        acciones: `
            <span class="nsft-pv-toolsbtn"><img class="nsft-pv-logomark" src="{{logo}}" alt=""> {{@menuTools}} &#9662;
                <span class="nsft-pv-menu">
                    <span class="nsft-pv-menu-item">{ } {{@enableRecordObjectLabel}}</span>
                </span>
                <span class="nsft-pv-tap is-cp" aria-hidden="true"></span>
                <span class="nsft-pv-cursor is-cp" aria-hidden="true">
                    <svg viewBox="0 0 24 24" fill="#fff" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round">
                        <path d="M5 3l14 8.5-6.2 1.3L10 20z"/>
                    </svg>
                </span>
            </span>`,
        extra: `
            <div class="nsft-pv-modal is-viewer">
                <div class="nsft-pv-bar">
                    <span class="nsft-pv-mono">{ }</span>
                    <span class="nsft-pv-grow nsft-pv-tiny" data-pv-label></span>
                    <span class="nsft-pv-bar-tail">&#10515; &#8635; &#10005;</span>
                </div>
                <div class="nsft-pv-modal-body">
                    <span class="nsft-pv-flex">
                        <span class="nsft-pv-input nsft-pv-grow nsft-pv-tiny">&#9906;</span>
                        <span class="nsft-pv-check"><i></i></span>
                    </span>
                    <div class="nsft-pv-code is-light">
                        <div class="m">&#9662; Object</div>
                        <div class="nsft-pv-ind"><span class="f">recordType:</span> <span class="s">"customrecord_demo"</span></div>
                        <div class="nsft-pv-ind"><span class="f">id:</span> <span class="n">1042</span></div>
                        <div class="nsft-pv-ind m">&#9662; <span class="f">bodyFields:</span> Object</div>
                        <div class="nsft-pv-ind2"><span class="f">name:</span> <span class="s">"Demo Record"</span></div>
                        <div class="nsft-pv-ind2"><span class="f">customform:</span> <span class="n">101</span></div>
                        <div class="nsft-pv-ind2"><span class="f">created:</span> <span class="s">"16/11/2026"</span></div>
                        <div class="nsft-pv-ind2"><span class="f">lastmodified:</span> <span class="s">"16/11/2026"</span></div>
                        <div class="nsft-pv-ind2"><span class="f">{{pvIdEstado}}:</span> <span class="n">3</span></div>
                        <div class="nsft-pv-ind2"><span class="f">custrecord_total:</span> <span class="n">18402.55</span></div>
                        <div class="nsft-pv-ind2"><span class="f">isinactive:</span> <span class="s">"F"</span></div>
                        <div class="nsft-pv-ind2"><span class="f">nlsub:</span> <span class="n">4</span></div>
                        <div class="nsft-pv-ind2"><span class="f">nlrole:</span> <span class="n">7</span></div>
                        <div class="nsft-pv-ind m">&#9656; <span class="f">lineFields:</span> Object</div>
                        <div class="nsft-pv-ind m">&#9656; <span class="f">sublists:</span> Object</div>
                    </div>
                </div>
            </div>`
    });

    P.enableViewScriptedRecord = ventanaNS({
        clase: 'nsft-pv-vro',
        sublista: true,
        acciones: `
            <span class="nsft-pv-toolsbtn"><img class="nsft-pv-logomark" src="{{logo}}" alt=""> {{@menuTools}} &#9662;
                <span class="nsft-pv-menu">
                    <span class="nsft-pv-menu-item">&lt;/&gt; {{@enableScriptedRecordsLabel}}</span>
                </span>
                <span class="nsft-pv-tap is-cp" aria-hidden="true"></span>
                <span class="nsft-pv-cursor is-cp" aria-hidden="true">
                    <svg viewBox="0 0 24 24" fill="#fff" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round">
                        <path d="M5 3l14 8.5-6.2 1.3L10 20z"/>
                    </svg>
                </span>
            </span>`,
        extra: `
            <div class="nsft-pv-modal is-viewer is-scripts">
                <div class="nsft-pv-bar">
                    <span class="nsft-pv-mono">&lt;/&gt;</span>
                    <span class="nsft-pv-grow nsft-pv-tiny" data-pv-label></span>
                    <span class="nsft-pv-bar-tail">&#8635; &#10005;</span>
                </div>
                <div class="nsft-pv-restabs">
                    <span class="is-on">{{@sr_tab_user}} (5)</span>
                    <span>{{@sr_tab_client}} (2)</span>
                    <span>{{@sr_tab_workflow}} (1)</span>
                </div>
                <div class="nsft-pv-modal-body">
                    <span class="nsft-pv-input nsft-pv-tiny">&#9906;</span>
                    <div class="nsft-pv-srfilters">
                        <span><i>{{@sr_filter_deployed}}</i><b>{{@sr_filter_all}} &#9662;</b></span>
                        <span><i>{{@sr_filter_release}}</i><b>{{@sr_filter_all}} &#9662;</b></span>
                        <span><i>API</i><b>{{@sr_filter_all}} &#9662;</b></span>
                    </div>
                    <div class="nsft-pv-srhead">
                        <span>Script</span>
                        <span>{{@sr_deployed}}</span>
                        <span>{{@sr_status}}</span>
                        <span>API</span>
                    </div>
                    <div class="nsft-pv-srrow">
                        <span class="nsft-pv-srname">{{pvScrCs}}</span>
                        <span class="nsft-pv-srmeta">beforeLoad &middot; afterSubmit</span>
                        <span class="nsft-pv-srcell">{{@sr_opt_yes}}</span>
                        <span class="nsft-pv-srcell"><span class="nsft-pv-chip is-ok">{{@sr_status_released}}</span></span>
                        <span class="nsft-pv-srcell"><span class="nsft-pv-chip is-api">1.0</span></span>
                    </div>
                    <div class="nsft-pv-srrow">
                        <span class="nsft-pv-srname">{{pvScrUeDoc}}</span>
                        <span class="nsft-pv-srmeta">beforeLoad</span>
                        <span class="nsft-pv-srcell">{{@sr_opt_yes}}</span>
                        <span class="nsft-pv-srcell"><span class="nsft-pv-chip is-ok">{{@sr_status_released}}</span></span>
                        <span class="nsft-pv-srcell"><span class="nsft-pv-chip is-api">2.1</span></span>
                    </div>
                    <div class="nsft-pv-srrow">
                        <span class="nsft-pv-srname">{{pvScrUeVal}}</span>
                        <span class="nsft-pv-srmeta">beforeSubmit &middot; afterSubmit</span>
                        <span class="nsft-pv-srcell">{{@sr_opt_yes}}</span>
                        <span class="nsft-pv-srcell"><span class="nsft-pv-chip is-ok">{{@sr_status_released}}</span></span>
                        <span class="nsft-pv-srcell"><span class="nsft-pv-chip is-api">2.1</span></span>
                    </div>
                    <div class="nsft-pv-srrow">
                        <span class="nsft-pv-srname">{{pvScrMrSync}}</span>
                        <span class="nsft-pv-srmeta">afterSubmit</span>
                        <span class="nsft-pv-srcell">{{@sr_opt_yes}}</span>
                        <span class="nsft-pv-srcell"><span class="nsft-pv-chip is-ok">{{@sr_status_released}}</span></span>
                        <span class="nsft-pv-srcell"><span class="nsft-pv-chip is-api">2.1</span></span>
                    </div>
                    <div class="nsft-pv-srrow">
                        <span class="nsft-pv-srname">{{pvScrSl}}</span>
                        <span class="nsft-pv-srmeta">beforeLoad</span>
                        <span class="nsft-pv-srcell">{{@sr_opt_yes}}</span>
                        <span class="nsft-pv-srcell"><span class="nsft-pv-chip is-ok">{{@sr_status_released}}</span></span>
                        <span class="nsft-pv-srcell"><span class="nsft-pv-chip is-api">2.1</span></span>
                    </div>
                </div>
            </div>`
    });

    const VENTANA_LOGS = `
                <div class="nsft-pv-bar">

                    <span class="nsft-pv-mono">&#9776;</span>

                    <span class="nsft-pv-tiny" data-pv-label></span>

                    <span class="nsft-pv-rlvctx">{{@rlv_scripts_record}} &#9662;</span>

                    <span class="nsft-pv-bar-tail">&#8690; &#10005;</span>

                </div>

                <div class="nsft-pv-rlvtools">

                    <span class="nsft-pv-input nsft-pv-grow nsft-pv-tiny">&#9906;</span>

                    <span class="nsft-pv-rlvlevels">

                        <span class="nsft-pv-lvl is-debug">DEBUG</span>

                        <span class="nsft-pv-lvl is-audit">AUDIT</span>

                        <span class="nsft-pv-lvl is-error">ERROR</span>

                    </span>

                    <span class="nsft-pv-rlvranges">

                        <span>{{@rlv_range_1h}}</span><span class="is-on">{{@rlv_range_24h}}</span><span>{{@rlv_range_7d}}</span>

                    </span>

                    <span class="nsft-pv-chip is-run">{{@rlv_refresh}}</span>

                </div>

                <div class="nsft-pv-rlvbody">

                    <div class="nsft-pv-rlvside">

                        <div class="nsft-pv-flabel">{{@rlv_scripts}}</div>

                        <span class="nsft-pv-input nsft-pv-tiny">&#9906;</span>

                        <span class="nsft-pv-check"><i class="is-on"></i>{{pvScrUeDoc}}</span>

                        <span class="nsft-pv-check"><i class="is-on"></i>{{pvScrCs}}</span>

                        <span class="nsft-pv-check"><i class="is-on"></i>{{pvScrUeVal}}</span>

                        <span class="nsft-pv-check"><i></i>{{pvScrMrSync}}</span>

                        <span class="nsft-pv-check"><i></i>{{pvScrSl}}</span>

                        <div class="nsft-pv-flabel">{{@rlv_stypes}}</div>

                        <span class="nsft-pv-check"><i class="is-on"></i>userevent</span>

                        <span class="nsft-pv-check"><i></i>client</span>

                        <span class="nsft-pv-check"><i></i>mapreduce</span>

                        <div class="nsft-pv-flabel">{{@rlv_range}}</div>

                        <span class="nsft-pv-rlvdate"><i>{{@rlv_from}}</i><b>16/11/2026 09:00</b></span>

                        <span class="nsft-pv-rlvdate"><i>{{@rlv_to}}</i><b>16/11/2026 18:00</b></span>

                        <span class="nsft-pv-rlvfbtns">

                            <span class="nsft-pv-chip">{{@rlv_clear}}</span>

                            <span class="nsft-pv-chip is-run">{{@rlv_apply}}</span>

                        </span>

                    </div>

                    <div class="nsft-pv-rlvres">

                        <div class="nsft-pv-rlvhead">

                            <span>{{@rlv_col_date}}</span><span>{{@rlv_col_level}}</span><span>{{@rlv_col_script}}</span><span>{{@rlv_col_title}}</span><span>{{@rlv_col_detail}}</span>

                        </div>

                        <div class="nsft-pv-rlvrow">

                            <span class="nsft-pv-mono">10:42:07</span>

                            <span><span class="nsft-pv-lvl is-audit">AUDIT</span></span>

                            <span class="nsft-pv-mono">{{pvScrUeDoc}}</span>

                            <span class="nsft-pv-mono">beforeLoad</span>

                            <span class="nsft-pv-mono nsft-pv-mute">id=1042</span>

                        </div>

                        <div class="nsft-pv-rlvrow">

                            <span class="nsft-pv-mono">10:42:08</span>

                            <span><span class="nsft-pv-lvl is-debug">DEBUG</span></span>

                            <span class="nsft-pv-mono">{{pvScrUeDoc}}</span>

                            <span class="nsft-pv-mono">total</span>

                            <span class="nsft-pv-mono nsft-pv-mute">18402.55</span>

                        </div>

                        <div class="nsft-pv-rlvrow">

                            <span class="nsft-pv-mono">10:42:09</span>

                            <span><span class="nsft-pv-lvl is-error">ERROR</span></span>

                            <span class="nsft-pv-mono">{{pvScrCs}}</span>

                            <span class="nsft-pv-mono">afterSubmit</span>

                            <span class="nsft-pv-mono nsft-pv-mute">customrecord_demo</span>

                        </div>

                        <div class="nsft-pv-rlvrow">

                            <span class="nsft-pv-mono">10:43:15</span>

                            <span><span class="nsft-pv-lvl is-audit">AUDIT</span></span>

                            <span class="nsft-pv-mono">{{pvScrCs}}</span>

                            <span class="nsft-pv-mono">beforeSubmit</span>

                            <span class="nsft-pv-mono nsft-pv-mute">nlsub=4</span>

                        </div>

                        <div class="nsft-pv-rlvrow">

                            <span class="nsft-pv-mono">10:43:16</span>

                            <span><span class="nsft-pv-lvl is-debug">DEBUG</span></span>

                            <span class="nsft-pv-mono">{{pvScrCs}}</span>

                            <span class="nsft-pv-mono">values</span>

                            <span class="nsft-pv-mono nsft-pv-mute">qty=3</span>

                        </div>

                        <div class="nsft-pv-rlvrow">

                            <span class="nsft-pv-mono">10:44:02</span>

                            <span><span class="nsft-pv-lvl is-debug">DEBUG</span></span>

                            <span class="nsft-pv-mono">{{pvScrUeDoc}}</span>

                            <span class="nsft-pv-mono">render</span>

                            <span class="nsft-pv-mono nsft-pv-mute">custtmpl_demo</span>

                        </div>

                        <div class="nsft-pv-rlvrow">

                            <span class="nsft-pv-mono">10:45:22</span>

                            <span><span class="nsft-pv-lvl is-debug">DEBUG</span></span>

                            <span class="nsft-pv-mono">{{pvScrUeDoc}}</span>

                            <span class="nsft-pv-mono">lines</span>

                            <span class="nsft-pv-mono nsft-pv-mute">3</span>

                        </div>

                        <div class="nsft-pv-rlvrow">

                            <span class="nsft-pv-mono">10:45:24</span>

                            <span><span class="nsft-pv-lvl is-audit">AUDIT</span></span>

                            <span class="nsft-pv-mono">{{pvScrUeVal}}</span>

                            <span class="nsft-pv-mono">beforeSubmit</span>

                            <span class="nsft-pv-mono nsft-pv-mute">{{pvQryEstado}}</span>

                        </div>

                        <div class="nsft-pv-rlvrow">

                            <span class="nsft-pv-mono">10:46:01</span>

                            <span><span class="nsft-pv-lvl is-debug">DEBUG</span></span>

                            <span class="nsft-pv-mono">{{pvScrUeVal}}</span>

                            <span class="nsft-pv-mono">values</span>

                            <span class="nsft-pv-mono nsft-pv-mute">nlloc=9</span>

                        </div>

                        <div class="nsft-pv-rlvrow">

                            <span class="nsft-pv-mono">10:46:03</span>

                            <span><span class="nsft-pv-lvl is-audit">AUDIT</span></span>

                            <span class="nsft-pv-mono">{{pvScrCs}}</span>

                            <span class="nsft-pv-mono">submit</span>

                            <span class="nsft-pv-mono nsft-pv-mute">id=1042</span>

                        </div>

                        <div class="nsft-pv-rlvrow">

                            <span class="nsft-pv-mono">10:46:07</span>

                            <span><span class="nsft-pv-lvl is-debug">DEBUG</span></span>

                            <span class="nsft-pv-mono">{{pvScrUeDoc}}</span>

                            <span class="nsft-pv-mono">file</span>

                            <span class="nsft-pv-mono nsft-pv-mute">id=8103</span>

                        </div>

                        <div class="nsft-pv-rlvrow">

                            <span class="nsft-pv-mono">10:47:11</span>

                            <span><span class="nsft-pv-lvl is-audit">AUDIT</span></span>

                            <span class="nsft-pv-mono">{{pvScrUeVal}}</span>

                            <span class="nsft-pv-mono">afterSubmit</span>

                            <span class="nsft-pv-mono nsft-pv-mute">ok</span>

                        </div>

                        <div class="nsft-pv-rlvrow">

                            <span class="nsft-pv-mono">10:44:03</span>

                            <span><span class="nsft-pv-lvl is-audit">AUDIT</span></span>

                            <span class="nsft-pv-mono">{{pvScrUeDoc}}</span>

                            <span class="nsft-pv-mono">file</span>

                            <span class="nsft-pv-mono nsft-pv-mute">id=8102</span>

                        </div>

                        <div class="nsft-pv-rlvrow">

                            <span class="nsft-pv-mono">10:44:05</span>

                            <span><span class="nsft-pv-lvl is-debug">DEBUG</span></span>

                            <span class="nsft-pv-mono">{{pvScrUeDoc}}</span>

                            <span class="nsft-pv-mono">done</span>

                            <span class="nsft-pv-mono nsft-pv-mute">ms=182</span>

                        </div>

                        <div class="nsft-pv-rlvrow">

                            <span class="nsft-pv-mono">10:44:09</span>

                            <span><span class="nsft-pv-lvl is-error">ERROR</span></span>

                            <span class="nsft-pv-mono">{{pvScrCs}}</span>

                            <span class="nsft-pv-mono">afterSubmit</span>

                            <span class="nsft-pv-mono nsft-pv-mute">nlrole=7</span>

                        </div>

                        <div class="nsft-pv-rlvrow">

                            <span class="nsft-pv-mono">10:45:21</span>

                            <span><span class="nsft-pv-lvl is-audit">AUDIT</span></span>

                            <span class="nsft-pv-mono">{{pvScrUeDoc}}</span>

                            <span class="nsft-pv-mono">beforeLoad</span>

                            <span class="nsft-pv-mono nsft-pv-mute">id=1042</span>

                        </div>

                    </div>

                </div>`;

    P.enableRecordLogsViewer = ventanaNS({
        clase: 'nsft-pv-menuflow nsft-pv-rlv',
        sublista: true,
        acciones: `
            <span class="nsft-pv-toolsbtn"><img class="nsft-pv-logomark" src="{{logo}}" alt=""> {{@menuTools}} &#9662;
                <span class="nsft-pv-menu">
                    <span class="nsft-pv-menu-item">&#9776; {{@enableRecordLogsViewerLabel}}</span>
                </span>
                <span class="nsft-pv-tap is-cp" aria-hidden="true"></span>
                <span class="nsft-pv-cursor is-cp" aria-hidden="true">
                    <svg viewBox="0 0 24 24" fill="#fff" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round">
                        <path d="M5 3l14 8.5-6.2 1.3L10 20z"/>
                    </svg>
                </span>
            </span>`,
        extra: `
            <div class="nsft-pv-modal is-logs">${VENTANA_LOGS}            </div>`
    });

    function apertura(icono, cuerpo, ventana) {
        const cabecera = `
                    <span class="nsft-pv-mono">${icono}</span>
                    <span class="nsft-pv-grow nsft-pv-tiny" data-pv-label></span>
                    <span class="nsft-pv-bar-tail">&#8690; &#10005;</span>`;

        const flotanteChica = `
                <div class="nsft-pv-modal is-open">
                    <div class="nsft-pv-bar">${cabecera}</div>
                    <div class="nsft-pv-ombody">${cuerpo}</div>
                </div>`;

        return ventanaNS({
            clase: 'nsft-pv-om',
            sublista: true,
            panel: `
                <div class="nsft-pv-side">
                    <div class="nsft-pv-side-inner">
                        <div class="nsft-pv-omhead">
                            <img class="nsft-pv-logomark" src="{{logo}}" alt="">
                            <span class="nsft-pv-grow nsft-pv-tiny">NetSuite Full Tools</span>
                            <span class="nsft-pv-bar-tail">&#9776; &#10005;</span>
                        </div>
                        <div class="nsft-pv-bar">${cabecera}</div>
                        <div class="nsft-pv-ombody">${cuerpo}</div>
                    </div>
                </div>`,
            extra: `
                ${ventana || flotanteChica}
                <div class="nsft-pv-float is-om">
                    <span class="nsft-pv-float-title">{{@openModeLabel}}</span>
                    <div class="nsft-pv-float-row">
                        <span class="nsft-pv-select nsft-pv-grow is-opts">
                            <span class="nsft-pv-optwrap">
                                <span class="nsft-pv-opt o1">{{@openModeOptionModal}}</span>
                                <span class="nsft-pv-opt o2">{{@openModeOptionPanel}}</span>
                            </span>
                            &#9662;
                            <span class="nsft-pv-tap is-sc" aria-hidden="true"></span>
                            <span class="nsft-pv-cursor is-sc" aria-hidden="true">
                                <svg viewBox="0 0 24 24" fill="#fff" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round">
                                    <path d="M5 3l14 8.5-6.2 1.3L10 20z"/>
                                </svg>
                            </span>
                        </span>
                    </div>
                </div>`
        });
    }

    P.viewRecordObjectOpenMode = apertura('{ }', `
                        <span class="nsft-pv-input nsft-pv-tiny">&#9906;</span>
                        <div class="nsft-pv-code is-light">
                            <div class="m">&#9662; Object</div>
                            <div class="nsft-pv-ind"><span class="f">recordType:</span> <span class="s">"customrecord_demo"</span></div>
                            <div class="nsft-pv-ind"><span class="f">id:</span> <span class="n">1042</span></div>
                            <div class="nsft-pv-ind m">&#9662; <span class="f">bodyFields:</span> Object</div>
                            <div class="nsft-pv-ind2"><span class="f">name:</span> <span class="s">"Demo Record"</span></div>
                            <div class="nsft-pv-ind2"><span class="f">created:</span> <span class="s">"16/11/2026"</span></div>
                            <div class="nsft-pv-ind2"><span class="f">custrecord_total:</span> <span class="n">18402.55</span></div>
                            <div class="nsft-pv-ind m">&#9656; <span class="f">sublists:</span> Object</div>
                        </div>`);

    P.recordLogsViewerOpenMode = apertura('&#9776;', `
                        <span class="nsft-pv-rlvlevels">
                            <span class="nsft-pv-lvl is-debug">DEBUG</span>
                            <span class="nsft-pv-lvl is-audit">AUDIT</span>
                            <span class="nsft-pv-lvl is-error">ERROR</span>
                        </span>
                        <div class="nsft-pv-omlog">
                            <div class="nsft-pv-omevent">
                                <span class="nsft-pv-mono">10:42:07</span>
                                <span class="nsft-pv-lvl is-audit">AUDIT</span>
                                <span class="nsft-pv-mono nsft-pv-mute">beforeLoad</span>
                            </div>
                            <div class="nsft-pv-omevent">
                                <span class="nsft-pv-mono">10:42:08</span>
                                <span class="nsft-pv-lvl is-debug">DEBUG</span>
                                <span class="nsft-pv-mono nsft-pv-mute">18402.55</span>
                            </div>
                            <div class="nsft-pv-omevent">
                                <span class="nsft-pv-mono">10:42:09</span>
                                <span class="nsft-pv-lvl is-error">ERROR</span>
                                <span class="nsft-pv-mono nsft-pv-mute">afterSubmit</span>
                            </div>
                            <div class="nsft-pv-omevent">
                                <span class="nsft-pv-mono">10:43:15</span>
                                <span class="nsft-pv-lvl is-audit">AUDIT</span>
                                <span class="nsft-pv-mono nsft-pv-mute">nlsub=4</span>
                            </div>
                            <div class="nsft-pv-omevent">
                                <span class="nsft-pv-mono">10:44:02</span>
                                <span class="nsft-pv-lvl is-debug">DEBUG</span>
                                <span class="nsft-pv-mono nsft-pv-mute">custtmpl_demo</span>
                            </div>
                        </div>`, `<div class="nsft-pv-modal is-logs">${VENTANA_LOGS}            </div>`);

    P.enableRecordOptionsMenu = ventanaNS({
        clase: 'nsft-pv-rom',
        sublista: true,
        accionesIzq: `
            <span class="nsft-pv-toolsbtn is-left"><img class="nsft-pv-logomark" src="{{logo}}" alt=""> {{@recordOptionsTitle}} &#9662;
                <span class="nsft-pv-menu is-tall">
                    <span class="nsft-pv-menu-item">&#8853; {{@recordOptionAddField}}</span>
                    <span class="nsft-pv-menu-item">&#9707; {{@recordOptionAddColumn}}</span>
                    <span class="nsft-pv-menu-item">&#8730; {{@recordOptionViewDependentRecords}}</span>
                    <span class="nsft-pv-menu-item">&#8734; {{@recordOptionCopyCleanUrl}}</span>
                    <span class="nsft-pv-menu-item">&lt;/&gt; {{@recordOptionViewXml}}</span>
                </span>
                <span class="nsft-pv-tap is-rom" aria-hidden="true"></span>
                <span class="nsft-pv-cursor is-rom" aria-hidden="true">
                    <svg viewBox="0 0 24 24" fill="#fff" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round">
                        <path d="M5 3l14 8.5-6.2 1.3L10 20z"/>
                    </svg>
                </span>
            </span>`
    });

    P.enableRecordTrail = ventanaNS({
        clase: 'nsft-pv-menuflow nsft-pv-rt',
        sublista: true,
        accionesIzq: `
            <span class="nsft-pv-toolsbtn is-left"><img class="nsft-pv-logomark" src="{{logo}}" alt=""> {{@recordOptionsTitle}} &#9662;
                <span class="nsft-pv-menu">
                    <span class="nsft-pv-menu-item">&#8734; {{@rt_button}}</span>
                </span>
                <span class="nsft-pv-tap is-cp" aria-hidden="true"></span>
                <span class="nsft-pv-cursor is-cp" aria-hidden="true">
                    <svg viewBox="0 0 24 24" fill="#fff" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round">
                        <path d="M5 3l14 8.5-6.2 1.3L10 20z"/>
                    </svg>
                </span>
            </span>`,
        extra: `
            <div class="nsft-pv-modal is-trail">
                <div class="nsft-pv-bar">
                    <span class="nsft-pv-mono">&#8734;</span>
                    <span class="nsft-pv-grow nsft-pv-rttitles">
                        <span class="nsft-pv-tiny">{{@rt_title}}</span>
                        <span class="nsft-pv-rtsub">{{@rt_subtitle}}</span>
                    </span>
                    <span class="nsft-pv-bar-tail">&#8635; &#10005;</span>
                </div>
                <div class="nsft-pv-modal-body">
                    <div class="nsft-pv-rtcols">
                        <div class="nsft-pv-rtcol">
                            <div class="nsft-pv-rtctitle">{{@rt_sources}} <b>1</b></div>
                            <div class="nsft-pv-rtnode">
                                <span class="nsft-pv-rttype">Estimate</span>
                                <span class="nsft-pv-rttran">EST10233</span>
                                <span class="nsft-pv-rtmeta">16/11/2026</span>
                                <span class="nsft-pv-rtfoot"><span class="nsft-pv-mono">#1039</span><span>{{@rt_open_lbl}} &#8599;</span></span>
                            </div>
                        </div>
                        <span class="nsft-pv-rtarrow">&#8594;</span>
                        <div class="nsft-pv-rtcol is-here">
                            <div class="nsft-pv-rthere">{{@rt_here}}</div>
                            <div class="nsft-pv-rtnode is-current">
                                <span class="nsft-pv-rttype">Sales Order</span>
                                <span class="nsft-pv-rttran">SO10482</span>
                                <span class="nsft-pv-rtmeta">16/11/2026</span>
                                <span class="nsft-pv-rtfoot"><span class="nsft-pv-mono">#1042</span></span>
                            </div>
                        </div>
                        <span class="nsft-pv-rtarrow">&#8594;</span>
                        <div class="nsft-pv-rtcol">
                            <div class="nsft-pv-rtctitle">{{@rt_targets}} <b>2</b></div>
                            <div class="nsft-pv-rtnode">
                                <span class="nsft-pv-rttype">Item Fulfillment</span>
                                <span class="nsft-pv-rttran">IF10501</span>
                                <span class="nsft-pv-rtmeta">17/11/2026</span>
                                <span class="nsft-pv-rtfoot"><span class="nsft-pv-mono">#1051</span><span>{{@rt_open_lbl}} &#8599;</span></span>
                            </div>
                            <div class="nsft-pv-rtnode">
                                <span class="nsft-pv-rttype">Invoice</span>
                                <span class="nsft-pv-rttran">INV20455</span>
                                <span class="nsft-pv-rtmeta">18/11/2026</span>
                                <span class="nsft-pv-rtfoot"><span class="nsft-pv-mono">#1055</span><span>{{@rt_open_lbl}} &#8599;</span></span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>`
    });

    P.enableLoadRecordConsole = ventanaNS({
        clase: 'nsft-pv-menuflow nsft-pv-lrc',
        sublista: true,
        acciones: `
            <span class="nsft-pv-toolsbtn"><img class="nsft-pv-logomark" src="{{logo}}" alt=""> {{@menuTools}} &#9662;
                <span class="nsft-pv-menu">
                    <span class="nsft-pv-menu-item">&gt;_ {{@lrc_menu_ss2}}</span>
                </span>
                <span class="nsft-pv-tap is-cp" aria-hidden="true"></span>
                <span class="nsft-pv-cursor is-cp" aria-hidden="true">
                    <svg viewBox="0 0 24 24" fill="#fff" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round">
                        <path d="M5 3l14 8.5-6.2 1.3L10 20z"/>
                    </svg>
                </span>
            </span>`,
        extra: `
            <div class="nsft-pv-toast">
                <span class="nsft-pv-toast-icon">&#10003;</span>
                <span class="nsft-pv-toast-text">{{@lrc_loaded}}</span>
            </div>
            <div class="nsft-pv-console">
                <div class="nsft-pv-console-bar">
                    <span class="is-on">Console</span><span>Network</span><span>Sources</span>
                    <span class="nsft-pv-grow"></span>
                    <span>&#10005;</span>
                </div>
                <div class="nsft-pv-code">
                    <div><span class="k">[NSFT]</span> <span class="m">{{@lrc_vars_label}}</span> <span class="f">recordType</span><span class="m">,</span> <span class="f">recordId</span><span class="m">,</span> <span class="f">objRecord</span></div>
                    <div><span class="m">&#8250;</span> objRecord.<span class="f">getValue</span>(<span class="s">'entity'</span>)</div>
                    <div><span class="m">&#8249;</span> <span class="s">"{{pvCoSa}}"</span></div>
                </div>
            </div>`
    });

    P.enableGoToRecord = ventanaNS({
        clase: 'nsft-pv-gtr nsft-pv-menuflow',
        sublista: true,
        acciones: `
            <span class="nsft-pv-toolsbtn"><img class="nsft-pv-logomark" src="{{logo}}" alt=""> {{@menuTools}} &#9662;
                <span class="nsft-pv-menu">
                    <span class="nsft-pv-menu-item">&#8594; {{@enableGoToRecordLabel}}</span>
                </span>
                <span class="nsft-pv-tap is-cp" aria-hidden="true"></span>
                <span class="nsft-pv-cursor is-cp" aria-hidden="true">
                    <svg viewBox="0 0 24 24" fill="#fff" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round">
                        <path d="M5 3l14 8.5-6.2 1.3L10 20z"/>
                    </svg>
                </span>
            </span>`,
        extra: `
            <div class="nsft-pv-modal is-gtr">
                <div class="nsft-pv-bar">
                    <span class="nsft-pv-grow nsft-pv-tiny">{{@gtr_title}}</span>
                    <span class="nsft-pv-keys">
                        <span class="nsft-pv-key">Alt</span><span class="nsft-pv-key">&#8679;</span><span class="nsft-pv-key">G</span>
                    </span>
                </div>
                <div class="nsft-pv-modal-body">
                    <span class="nsft-pv-input nsft-pv-mono nsft-pv-tiny">
                        <span class="nsft-pv-type t6">SO104</span><span class="nsft-pv-caret"></span>
                    </span>
                    <span class="nsft-pv-gtrlist">
                        <span class="nsft-pv-gtrrow is-on">
                            <span class="nsft-pv-grow">SO10482</span>
                            <span class="nsft-pv-chip is-tag">{{@gtr_recent_tag}}</span>
                        </span>
                        <span class="nsft-pv-gtrrow">
                            <span class="nsft-pv-grow">SO10419</span>
                            <span class="nsft-pv-mono nsft-pv-mute">salesorder</span>
                        </span>
                        <span class="nsft-pv-gtrrow">
                            <span class="nsft-pv-grow">{{@gtr_open_definition}}</span>
                            <span class="nsft-pv-mono nsft-pv-mute">customrecord_demo</span>
                        </span>
                    </span>
                </div>
            </div>`
    });

    P.enableRecentRecords = ventanaNS({
        clase: 'nsft-pv-rr',
        sublista: true,
        navIcono: `
            <span class="nsft-pv-tap is-rr" aria-hidden="true"></span>
            <span class="nsft-pv-cursor is-rr" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="#fff" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round">
                    <path d="M5 3l14 8.5-6.2 1.3L10 20z"/>
                </svg>
            </span>
            <span class="nsft-pv-rrpop">
                <span class="nsft-pv-rrhead">
                    <span class="nsft-pv-rrtitle">{{@rr_title}}</span>
                    <span class="nsft-pv-rrsearch">&#9906; {{@rr_search_placeholder}}<span class="nsft-pv-rrcount">18</span></span>
                </span>
                <span class="nsft-pv-rrall">&#9707; {{@rr_view_all}}</span>
                <span class="nsft-pv-rrlist">
                    <span class="nsft-pv-rrsec is-pin">&#9733; {{@rr_pinned}}</span>
                    <span class="nsft-pv-rrrow">
                        <span class="nsft-pv-rricon is-c">C</span>
                        <span class="nsft-pv-rrbody"><b>{{pvCoSa}}</b><i>customer</i></span>
                        <span class="nsft-pv-rrdate">09:14</span>
                    </span>
                    <span class="nsft-pv-rrsec">{{@rr_group_today}}</span>
                    <span class="nsft-pv-rrrow is-on">
                        <span class="nsft-pv-rricon is-t">T</span>
                        <span class="nsft-pv-rrbody"><b>SO10482</b><i>salesorder</i></span>
                        <span class="nsft-pv-rrdate">11:38</span>
                    </span>
                    <span class="nsft-pv-rrrow">
                        <span class="nsft-pv-rricon is-r">R</span>
                        <span class="nsft-pv-rrbody"><b>Demo Record</b><i>customrecord_demo</i></span>
                        <span class="nsft-pv-rrdate">10:02</span>
                    </span>
                    <span class="nsft-pv-rrrow">
                        <span class="nsft-pv-rricon is-s">S</span>
                        <span class="nsft-pv-rrbody"><b>{{pvScrUeDoc}}</b><i>script</i></span>
                        <span class="nsft-pv-rrdate">09:47</span>
                    </span>
                    <span class="nsft-pv-rrsec">{{@rr_group_yesterday}}</span>
                    <span class="nsft-pv-rrrow">
                        <span class="nsft-pv-rricon is-t">T</span>
                        <span class="nsft-pv-rrbody"><b>EST10233</b><i>estimate</i></span>
                        <span class="nsft-pv-rrdate">17:21</span>
                    </span>
                    <span class="nsft-pv-rrrow">
                        <span class="nsft-pv-rricon is-t">T</span>
                        <span class="nsft-pv-rrbody"><b>INV20455</b><i>invoice</i></span>
                        <span class="nsft-pv-rrdate">16:05</span>
                    </span>
                    <span class="nsft-pv-rrrow">
                        <span class="nsft-pv-rricon is-c">C</span>
                        <span class="nsft-pv-rrbody"><b>{{user}}</b><i>employee</i></span>
                        <span class="nsft-pv-rrdate">15:40</span>
                    </span>
                </span>
            </span>`
    });

    P.enableOpenInOtherEnv = ventanaNS({
        clase: 'nsft-pv-oe',
        sublista: true,
        acciones: `
            <span class="nsft-pv-toolsbtn"><img class="nsft-pv-logomark" src="{{logo}}" alt=""> {{@menuTools}} &#9662;
                <span class="nsft-pv-menu">
                    <span class="nsft-pv-menu-item">&#8599; {{@openInEnv_group}}<span class="nsft-pv-grow"></span>&#9666;
                        <span class="nsft-pv-oepop">
                            <span class="nsft-pv-oecur">{{@openInEnv_prd_short}} {{@openInEnv_current}}</span>
                            <span class="nsft-pv-oeitem">Sandbox 1</span>
                            <span class="nsft-pv-oeitem">Sandbox 2</span>
                            <span class="nsft-pv-oeitem">{{@openInEnv_rp_short}}</span>
                        </span>
                    </span>
                </span>
                <span class="nsft-pv-tap is-cp" aria-hidden="true"></span>
                <span class="nsft-pv-cursor is-cp" aria-hidden="true">
                    <svg viewBox="0 0 24 24" fill="#fff" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round">
                        <path d="M5 3l14 8.5-6.2 1.3L10 20z"/>
                    </svg>
                </span>
            </span>`
    });

    P.enableSandboxNumberBadge = ventanaNS({
        clase: 'nsft-pv-snb',
        sublista: true,
        url: '7654321<span class="nsft-pv-snbsb">-sb2</span>.app.netsuite.com/app/common/custom/custrecordentry.nl',
        entorno: `<span class="nsft-pv-env-text">SANDBOX<span class="nsft-pv-snbnum nsft-pv-destello">2</span></span>`,
        extra: `
            <div class="nsft-pv-float is-snbsw">
                <span class="nsft-pv-float-title" data-pv-label></span>
                <div class="nsft-pv-float-row">
                    <span class="nsft-pv-grow nsft-pv-tiny">&#9673;</span>
                    <span class="nsft-pv-toggle"><i></i>
                        <span class="nsft-pv-tap is-snbsw" aria-hidden="true"></span>
                        <span class="nsft-pv-cursor is-snbsw" aria-hidden="true">${PUNTERO}</span>
                    </span>
                </div>
            </div>`
    });

    function copiarIds(modo) {
        const iconos = modo !== 'shift';
        const icono = (c) => iconos ? `<span class="nsft-pv-cidicon ${c || ''}">${ICONO_COPIAR}</span>` : '';

        return ventanaNS({
            clase: 'nsft-pv-cid is-' + modo,
            sublista: true,
            campos: `
                            <span class="nsft-pv-field"><span class="lbl">{{name}}${iconos ? `<span class="nsft-pv-cidswap">
                                    <span class="c1">${ICONO_COPIAR}</span><span class="c2">${ICONO_VISTO}</span>
                                </span>` : ''}</span><span class="val">Demo Record</span></span>
                            <span class="nsft-pv-field"><span class="lbl">{{id}}${icono()}</span><span class="val nsft-pv-mono">1042</span></span>
                            <span class="nsft-pv-field"><span class="lbl">{{estado}}${icono()}</span><span class="val">{{pvActivo}}</span></span>
                            <span class="nsft-pv-field"><span class="lbl">{{date}}${icono()}</span><span class="val nsft-pv-mono">16/11/2026</span></span>
                            <span class="nsft-pv-cidkey"><span class="nsft-pv-key">&#8679;</span> + <span class="nsft-pv-key">{{pvClic}}</span></span>
                            <span class="nsft-pv-cidok">${ICONO_VISTO} name</span>
                            <span class="nsft-pv-tap is-cid" aria-hidden="true"></span>
                            <span class="nsft-pv-cursor is-cid" aria-hidden="true">${PUNTERO}</span>`,
        });
    }

    P.enableCopyFieldAndSublistIds = copiarIds('shift');
    P.copyIdsModeShift = copiarIds('shift');
    P.copyIdsModeIcons = copiarIds('iconos');

    function fichaCampo(opts) {
        const o = opts || {};
        const porIcono = o.asidero === 'icono';

        const ancla = `
                                    <span class="nsft-pv-tap is-sfv" aria-hidden="true"></span>
                                    <span class="nsft-pv-cursor is-sfv" aria-hidden="true">${PUNTERO}</span>`;
        const asidero = porIcono
            ? `<span class="nsft-pv-acicon is-hit">${ICONO_INFO}${ancla}</span>`
            : `<span class="nsft-pv-lblhit">${ancla}</span>`;
        const suelto = porIcono ? `<span class="nsft-pv-acicon">${ICONO_INFO}</span>` : '';

        const historial = o.historial ? `
                    <span class="nsft-pv-sfvrow is-sep">
                        <span class="k">{{@fav_section_title}}</span>
                        <span class="nsft-pv-favbtn">${ICONO_RELOJ}<span class="nsft-pv-favswap">
                                <span class="f1">{{@fav_load_btn}}</span><span class="f2">{{@fav_hide_btn}}</span>
                            </span>
                            <span class="nsft-pv-tap is-fav" aria-hidden="true"></span>
                            <span class="nsft-pv-cursor is-fav" aria-hidden="true">${PUNTERO}</span>
                        </span>
                    </span>
                    <span class="nsft-pv-favlist">
                        <span class="nsft-pv-favfilters">
                            <span class="nsft-pv-select is-mini">{{@fav_filter_all}}</span>
                            <span class="nsft-pv-select is-mini">{{@fav_filter_from}}</span>
                            <span class="nsft-pv-select is-mini">{{@fav_filter_to}}</span>
                        </span>
                        <span class="nsft-pv-favrow">
                            <span class="who">{{user}}<i>16/11/2026 11:38</i></span>
                            <span class="chg"><b>{{@fav_old_value}}</b> Demo Co. &#8594; <b>{{@fav_new_value}}</b> Demo Record</span>
                        </span>
                        <span class="nsft-pv-favrow">
                            <span class="who">{{user}}<i>02/11/2026 09:14</i></span>
                            <span class="chg"><b>{{@fav_old_value}}</b> &#8212; &#8594; <b>{{@fav_new_value}}</b> Demo Co.</span>
                        </span>
                        <span class="nsft-pv-favrow">
                            <span class="who">Demo Admin<i>28/10/2026 16:05</i></span>
                            <span class="chg"><b>{{@fav_old_value}}</b> Demo S.A. &#8594; <b>{{@fav_new_value}}</b> &#8212;</span>
                        </span>
                    </span>` : '';

        return ventanaNS({
            clase: 'nsft-pv-sfv' + (porIcono ? ' is-icon' : ' is-label') + (o.historial ? ' nsft-pv-fav' : ''),
            sublista: true,
            campos: `
                            <span class="nsft-pv-field"><span class="lbl">{{name}}${asidero}</span><span class="val">Demo Record</span></span>
                            <span class="nsft-pv-field"><span class="lbl">{{id}}${suelto}</span><span class="val nsft-pv-mono">1042</span></span>
                            <span class="nsft-pv-field"><span class="lbl">{{estado}}${suelto}</span><span class="val">{{pvActivo}}</span></span>
                            <span class="nsft-pv-field"><span class="lbl">{{date}}${suelto}</span><span class="val nsft-pv-mono">16/11/2026</span></span>`,
            extra: `
            <div class="nsft-pv-modal is-sfv">
                <div class="nsft-pv-bar">
                    <img class="nsft-pv-logomark" src="{{logo}}" alt="">
                    <span class="nsft-pv-grow nsft-pv-tiny">{{@enableSetFieldValuesLabel}}</span>
                    <span class="nsft-pv-bar-tail">&#10005;</span>
                </div>
                <div class="nsft-pv-modal-body">
                    <span class="nsft-pv-sfvrow"><span class="k">{{@sfv_internal_id}}</span><span class="v nsft-pv-mono">name</span></span>
                    <span class="nsft-pv-sfvrow"><span class="k">{{@sfv_field_type}}</span><span class="v">{{@sfv_text}}</span></span>
                    <span class="nsft-pv-sfvrow"><span class="k">{{@sfv_field_value}}</span><span class="v">Demo Record</span></span>
                    <span class="nsft-pv-sfvrow"><span class="k">{{@sfv_mandatory}}</span><span class="v">{{@sfv_yes}}</span></span>
                    <span class="nsft-pv-sfvrow is-sep"><span class="k">{{@sfv_edit_field_label}}</span><span class="nsft-pv-btn is-ghost">{{@sfv_edit_field_btn}}</span></span>
                    <span class="nsft-pv-sfvset">
                        <span class="nsft-pv-input nsft-pv-grow nsft-pv-tiny">{{@sfv_enter_new_value}}</span>
                        <span class="nsft-pv-btn">{{@sfv_set}}</span>
                    </span>${historial}
                </div>
            </div>`
        });
    }

    P.enableSetFieldValues = fichaCampo();
    P.enableFieldAuditQuickView = fichaCampo({ historial: true });
    P.setFieldValuesModeLabel = fichaCampo({ asidero: 'etiqueta' });
    P.setFieldValuesModeIcon = fichaCampo({ asidero: 'icono' });

    P.enableFindFieldById = ventanaNS({
        clase: 'nsft-pv-ffi nsft-pv-menuflow',
        sublista: true,
        campos: `
                            <span class="nsft-pv-field"><span class="lbl">{{name}}</span><span class="val">Demo Record</span></span>
                            <span class="nsft-pv-field"><span class="lbl">{{id}}</span><span class="val nsft-pv-mono">1042</span></span>
                            <span class="nsft-pv-field is-hit"><span class="lbl">{{estado}}</span><span class="val">{{pvActivo}}</span></span>
                            <span class="nsft-pv-field"><span class="lbl">{{date}}</span><span class="val nsft-pv-mono">16/11/2026</span></span>`,
        acciones: `
            <span class="nsft-pv-toolsbtn"><img class="nsft-pv-logomark" src="{{logo}}" alt=""> {{@menuTools}} &#9662;
                <span class="nsft-pv-menu">
                    <span class="nsft-pv-menu-item">&#9906; {{@enableFindFieldByIdLabel}}</span>
                </span>
                <span class="nsft-pv-tap is-cp" aria-hidden="true"></span>
                <span class="nsft-pv-cursor is-cp" aria-hidden="true">
                    <svg viewBox="0 0 24 24" fill="#fff" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round">
                        <path d="M5 3l14 8.5-6.2 1.3L10 20z"/>
                    </svg>
                </span>
            </span>`,
        extra: `
            <div class="nsft-pv-modal is-ffi">
                <div class="nsft-pv-bar">
                    <span class="nsft-pv-grow nsft-pv-tiny">{{@ffi_prompt_generic}}</span>
                    <span class="nsft-pv-keys">
                        <span class="nsft-pv-key">Ctrl</span><span class="nsft-pv-key">&#8679;</span><span class="nsft-pv-key">F</span>
                    </span>
                </div>
                <div class="nsft-pv-modal-body">
                    <span class="nsft-pv-input nsft-pv-mono nsft-pv-tiny">
                        <span class="nsft-pv-type t7">{{pvIdEstado}}</span><span class="nsft-pv-caret"></span>
                    </span>
                    <span class="nsft-pv-ffifoot">
                        <span class="nsft-pv-btn is-ghost">{{@ffi_btn_cancel}}</span>
                        <span class="nsft-pv-btn">{{@ffi_btn_search}}</span>
                    </span>
                </div>
            </div>`
    });

    P.enableOpenCustomRecordBtn = ventanaNS({
        clase: 'nsft-pv-ocr',
        sublista: true,
        pestanas: `
                <span class="nsft-pv-tab is-ocr1">SO10482</span>
                <span class="nsft-pv-tab is-ocr2">Demo Record</span>`,
        url: `<span class="nsft-pv-swap is-ocr">
                    <span class="u1">1234567.app.netsuite.com/app/common/custom/custrecordentry.nl</span>
                    <span class="u2">1234567.app.netsuite.com/app/common/custom/custrecord.nl?id=482</span>
                </span>`,
        sublistaExtra: `
                        <span class="nsft-pv-ocrbtn">${ICONO_MENU} {{@recordOptionsTitle}} &#9662;
                            <span class="nsft-pv-ocrmenu">
                                <span class="nsft-pv-ocritem is-pick">${ICONO_ABRIR} {{@openCustomRecordBtn}}</span>
                                <span class="nsft-pv-ocritem">${ICONO_MAS} {{@addCustomFieldBtn}}</span>
                            </span>
                            <span class="nsft-pv-tap is-ocr" aria-hidden="true"></span>
                            <span class="nsft-pv-cursor is-ocr" aria-hidden="true">${PUNTERO}</span>
                        </span>`,
        destino: `
                <div class="nsft-pv-body nsft-pv-stack">
                    <div class="nsft-pv-title">Demo Record</div>
                </div>
                <div class="nsft-pv-actions">
                    <span class="nsft-pv-btn">{{edit}}</span>
                    <span class="nsft-pv-btn is-ghost">{{back}}</span>
                </div>
                <div class="nsft-pv-body">
                    <div class="nsft-pv-fields">
                        <span class="nsft-pv-field"><span class="lbl">{{name}}</span><span class="val">Demo Record</span></span>
                        <span class="nsft-pv-field"><span class="lbl">{{id}}</span><span class="val nsft-pv-mono">customrecord_demo</span></span>
                    </div>
                </div>
                <div class="nsft-pv-subtabs">
                    <span class="is-on">{{tabCampos}}</span>
                    <span>{{tabForms}}</span>
                </div>
                <table class="nsft-pv-table">
                    <tr><th>{{id}}</th><th>{{name}}</th><th>{{@fip_type}}</th></tr>
                    <tr><td class="nsft-pv-mono">{{pvIdEstado}}</td><td>{{estado}}</td><td>{{@fip_ftype_select}}</td></tr>
                    <tr><td class="nsft-pv-mono">custrecord_total</td><td>Total</td><td>{{@fip_ftype_currency}}</td></tr>
                    <tr><td class="nsft-pv-mono">custrecord_demo_ref</td><td>Ref.</td><td>{{@fip_ftype_text}}</td></tr>
                </table>`
    });

    P.enableFieldInlinePreview = ventanaNS({
        clase: 'nsft-pv-fip',
        sublista: true,
        campos: `
                            <span class="nsft-pv-field"><span class="lbl">{{name}}</span><span class="val">Demo Record</span></span>
                            <span class="nsft-pv-field"><span class="lbl">{{id}}</span><span class="val nsft-pv-mono">1042</span></span>
                            <span class="nsft-pv-field">
                                <span class="lbl">{{estado}}<span class="nsft-pv-fiphook">
                                    <span class="nsft-pv-cursor is-fip" aria-hidden="true">
                                        <svg viewBox="0 0 24 24" fill="#fff" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round">
                                            <path d="M5 3l14 8.5-6.2 1.3L10 20z"/>
                                        </svg>
                                    </span>
                                    <span class="nsft-pv-fiptip">
                                        <span class="nsft-pv-fiphead nsft-pv-mono">{{pvIdEstado}}</span>
                                        <span class="nsft-pv-fipbody">
                                            <span class="nsft-pv-fippair"><i>{{@fip_type}}</i><b>{{@fip_ftype_select}}</b></span>
                                            <span class="nsft-pv-fippair"><i>{{@fip_sourcelist}}</i><b>{{pvIdEstados}}</b></span>
                                            <span class="nsft-pv-fippair"><i>{{@sfv_mandatory}}</i><b>{{@sfv_no}}</b></span>
                                            <span class="nsft-pv-fippair"><i>{{@fip_help}}</i><b class="is-help">{{pvFipHelp}}</b></span>
                                            <span class="nsft-pv-fiphint">
                                                <span class="nsft-pv-key">Ctrl</span> {{@fip_copy_hint_ss2}}
                                                <span class="nsft-pv-key">&#8679;</span> {{@fip_copy_hint_id}}
                                            </span>
                                        </span>
                                    </span>
                                </span></span>
                                <span class="val">{{pvActivo}}</span>
                            </span>
                            <span class="nsft-pv-field"><span class="lbl">{{date}}</span><span class="val nsft-pv-mono">16/11/2026</span></span>`
    });

    P.enableRelatedNativeLinks = ventanaNS({
        clase: 'nsft-pv-rnl',
        sublista: true,
        campos: `
                            <span class="nsft-pv-field"><span class="lbl">{{subsid}}</span><span class="val">{{pvCoSa}}<span class="nsft-pv-rnlink">&#8599;</span></span></span>
                            <span class="nsft-pv-field"><span class="lbl">{{dept}}</span><span class="val">{{pvDeptSales}}<span class="nsft-pv-rnlink">&#8599;</span></span></span>
                            <span class="nsft-pv-field"><span class="lbl">{{clase}}</span><span class="val">{{pvClaseDir}}<span class="nsft-pv-rnlink">&#8599;</span></span></span>
                            <span class="nsft-pv-field"><span class="lbl">{{ubic}}</span><span class="val">{{pvUbicCentro}}<span class="nsft-pv-rnlink">&#8599;</span></span></span>
                            <span class="nsft-pv-field is-wide"><span class="lbl">{{acct}}</span><span class="val nsft-pv-mono">4000 {{pvAcctInc}}<span class="nsft-pv-rnlink is-text">{{@rnl_account_record_link_text}}</span></span></span>`,
        extra: `
            <div class="nsft-pv-float">
                <span class="nsft-pv-float-title" data-pv-label></span>
                <div class="nsft-pv-float-row">
                    <span class="nsft-pv-grow">${ICONO_ABRIR}</span>
                    <span class="nsft-pv-toggle"><i></i>
                        <span class="nsft-pv-tap is-rnl" aria-hidden="true"></span>
                        <span class="nsft-pv-cursor is-rnl" aria-hidden="true">${PUNTERO}</span>
                    </span>
                </div>
            </div>`
    });

    function accionRegistro(c) {
        const enMenu = c.modo === 'menu';
        return ventanaNS({
            clase: 'nsft-pv-ra nsft-pv-' + c.mod + ' is-' + c.modo + (enMenu ? ' nsft-pv-menuflow' : ''),
            sublista: true,
            accionesIzq: enMenu
                ? `
            <span class="nsft-pv-toolsbtn is-left"><img class="nsft-pv-logomark" src="{{logo}}" alt=""> {{@recordOptionsTitle}} &#9662;
                <span class="nsft-pv-menu">
                    <span class="nsft-pv-menu-item">${c.icono}${c.rotulo}</span>
                </span>
                <span class="nsft-pv-tap is-cp" aria-hidden="true"></span>
                <span class="nsft-pv-cursor is-cp" aria-hidden="true">${PUNTERO}</span>
            </span>`
                : `
            <span class="nsft-pv-btn nsft-pv-rabtn${c.peligro ? ' is-danger' : ''}">
                <span class="nsft-pv-raswap">
                    <span class="s1">${c.rotulo}</span><span class="s2">${c.trabajando}</span>
                </span>
                <span class="nsft-pv-tap is-ra" aria-hidden="true"></span>
                <span class="nsft-pv-cursor is-ra" aria-hidden="true">${PUNTERO}</span>
            </span>`,
            extra: c.extra || ''
        });
    }

    const SAE = { mod: 'sae', rotulo: '{{@saveAndEdit}}', trabajando: '{{@ro_btn_saving}}' };
    const EAS = { mod: 'eas', rotulo: '{{@ro_edit_save}}', trabajando: '{{@ro_btn_saving}}' };

    P.enableSaveAndEditButton = accionRegistro({ ...SAE, modo: 'menu', icono: ICONO_GUARDAR });
    P.saveAndEditModeMenu = accionRegistro({ ...SAE, modo: 'menu', icono: ICONO_GUARDAR });
    P.saveAndEditModeButton = accionRegistro({ ...SAE, modo: 'button' });

    P.enableEditAndSaveButton = accionRegistro({ ...EAS, modo: 'menu', icono: ICONO_EDITAR });
    P.editAndSaveModeMenu = accionRegistro({ ...EAS, modo: 'menu', icono: ICONO_EDITAR });
    P.editAndSaveModeButton = accionRegistro({ ...EAS, modo: 'button' });

    const FICHA_BORRADO = `
            <div class="nsft-pv-modal is-del">
                <div class="nsft-pv-bar">
                    <span class="nsft-pv-delicon">${ICONO_PAPELERA}</span>
                    <span class="nsft-pv-grow nsft-pv-tiny">{{@del_confirm_title}}</span>
                </div>
                <div class="nsft-pv-modal-body">
                    <span class="nsft-pv-sfvrow"><span class="k">{{@del_label_record_type}}</span><span class="v nsft-pv-mono">customrecord_demo</span></span>
                    <span class="nsft-pv-sfvrow"><span class="k">{{@del_label_record_id}}</span><span class="v nsft-pv-mono">1042</span></span>
                    <span class="nsft-pv-sfvrow"><span class="k">{{@del_label_record_name}}</span><span class="v">Demo Record</span></span>
                </div>
                <div class="nsft-pv-modal-foot">
                    <span class="nsft-pv-btn is-ghost">{{@del_confirm_cancel}}</span>
                    <span class="nsft-pv-btn is-danger">{{@del_confirm_delete_btn}}</span>
                </div>
            </div>`;

    const DEL = { mod: 'del', rotulo: '{{@btn_delete}}', trabajando: '{{@ro_btn_deleting}}', peligro: true, extra: FICHA_BORRADO };

    P.enableDeleteRecordButton = accionRegistro({ ...DEL, modo: 'menu', icono: ICONO_PAPELERA });
    P.deleteRecordModeMenu = accionRegistro({ ...DEL, modo: 'menu', icono: ICONO_PAPELERA });
    P.deleteRecordModeButton = accionRegistro({ ...DEL, modo: 'button' });

    P.enableCancelOverride = ventanaNS({
        clase: 'nsft-pv-co2',
        sublista: true,
        accionesIzq: `
            <span class="nsft-pv-btn is-ghost nsft-pv-cobtn">{{@del_confirm_cancel}}
                <span class="nsft-pv-tap is-co2" aria-hidden="true"></span>
                <span class="nsft-pv-cursor is-co2" aria-hidden="true">${PUNTERO}</span>
            </span>`
    });

    P.enableRefreshSublist = ventanaNS({
        clase: 'nsft-pv-rs',
        sublista: true,
        sublistaExtra: `
                        <span class="nsft-pv-rsbtn">${ICONO_ACTUALIZAR} {{@refreshSublistBtn}}
                            <span class="nsft-pv-tap is-rs" aria-hidden="true"></span>
                            <span class="nsft-pv-cursor is-rs" aria-hidden="true">${PUNTERO}</span>
                        </span>`,
        sublistaFilas: `
                        <tr class="nsft-pv-rsnew"><td>{{edit}}</td><td class="nsft-pv-mono">16/11/2026</td><td>{{user}}</td><td>{{pvTrailPend}}</td></tr>
                        <tr><td>{{edit}}</td><td class="nsft-pv-mono">02/11/2026</td><td>{{user}}</td><td>{{pvTrailNew}}</td></tr>
                        <tr><td>{{edit}}</td><td class="nsft-pv-mono">28/10/2026</td><td>Demo Admin</td><td>{{pvTrailImp}}</td></tr>`,
        extra: `<span class="nsft-pv-rsveil"></span>`
    });


    const CODIGO_JS = `
                <div class="nsft-pv-edcode">
                    <span class="g">1</span><span class="l"><i class="c">/** @NApiVersion 2.1 */</i></span>
                    <span class="g">2</span><span class="l"><i class="k">define</i>([<i class="s">'N/record'</i>], (<i class="v">record</i>) =&gt; {</span>
                    <span class="g">3</span><span class="l is-ind"><i class="k">const</i> <i class="v">{{pvConstType}}</i> = <i class="s">'customrecord_demo'</i>;</span>
                    <span class="g">4</span><span class="l is-ind"><i class="k">const</i> <i class="v">{{pvConstCap}}</i> = <i class="n">18402.55</i>;</span>
                    <span class="g">5</span><span class="l"></span>
                    <span class="g">6</span><span class="l is-ind"><i class="k">function</i> <i class="f">beforeSubmit</i>(<i class="v">ctx</i>) {</span>
                    <span class="g">7</span><span class="l is-ind2"><i class="k">const</i> <i class="v">total</i> = <i class="v">ctx</i>.<i class="p">newRecord</i>.<i class="f">getValue</i>(<i class="s">'custrecord_total'</i>);</span>
                    <span class="g">8</span><span class="l is-ind2"><i class="k">return</i> <i class="v">total</i> &lt;= <i class="v">{{pvConstCap}}</i>;</span>
                    <span class="g">9</span><span class="l is-ind">}</span>
                    <span class="g">10</span><span class="l"></span>
                    <span class="g">11</span><span class="l is-ind"><i class="k">return</i> { <i class="p">beforeSubmit</i> };</span>
                    <span class="g">12</span><span class="l">});</span>
                </div>`;

    function editorNS(seGuarda, nombre) {
        return `
                    <div class="nsft-pv-edhead">
                        <span class="nsft-pv-edname">${nombre || 'demo_ue_documentos.js'}</span>
                        <span class="nsft-pv-grow"></span>
                        <span class="nsft-pv-btn nsft-pv-edsave">{{save}}${seGuarda ? `
                            <span class="nsft-pv-tap is-ed" aria-hidden="true"></span>
                            <span class="nsft-pv-cursor is-ed" aria-hidden="true">${PUNTERO}</span>` : ''}
                        </span>
                        <span class="nsft-pv-btn is-ghost">{{cancel}}</span>
                    </div>
${CODIGO_JS}`;
    }

    function editorAvanzadoNS() {
        return `
                    <div class="nsft-pv-advbar">
                        <img class="nsft-pv-logomark" src="{{logo}}" alt="">
                        <span class="nsft-pv-advenv">SB1</span>
                        <span class="nsft-pv-advmenus">
                            <span>{{@adv_menu_file}}</span>
                            <span>{{@adv_menu_edit}}</span>
                            <span>{{@adv_menu_view}}</span>
                            <span>{{@adv_menu_go}}</span>
                        </span>
                        <span class="nsft-pv-grow"></span>
                        <span class="nsft-pv-advicos">
                            <span>${ICONO_LUPA}</span>
                            <span>${ICONO_RAMA}</span>
                            <span>${ICONO_CODIGO}</span>
                        </span>
                        <span class="nsft-pv-btn nsft-pv-edsave">{{save}}</span>
                    </div>
                    <div class="nsft-pv-advfile">
                        <span class="nsft-pv-advname nsft-pv-mono">demo_ue_documentos.js</span>
                    </div>
                    <div class="nsft-pv-advmain">
                        <div class="nsft-pv-advtree">
                            <span class="nsft-pv-advtreet">{{@adv_tree_title}}</span>
                            <span class="nsft-pv-mono">{{pvFileForm}}</span>
                            <span class="nsft-pv-mono is-on">demo_ue_documentos.js</span>
                            <span class="nsft-pv-mono">{{pvFileSync}}</span>
                            <span class="nsft-pv-mono">demo_gateway.js</span>
                        </div>
                        ${CODIGO_JS}
                    </div>
                    <div class="nsft-pv-advstatus">
                        <span class="nsft-pv-mono">8:24</span>
                        <span class="nsft-pv-grow"></span>
                        <span class="nsft-pv-mono">JavaScript</span>
                        <span class="nsft-pv-mono">UTF-8</span>
                    </div>`;
    }

    function scriptNS(conEnlace, zona, autoId) {
        return `
                    <div class="nsft-pv-body nsft-pv-stack">
                        <div class="nsft-pv-title">{{script}}</div>
                    </div>
                    <div class="nsft-pv-actions">
                        <span class="nsft-pv-btn">{{edit}}</span>
                        <span class="nsft-pv-btn is-ghost">{{back}}</span>
                    </div>
                    <div class="nsft-pv-body">
                        <div class="nsft-pv-fields">
                            <span class="nsft-pv-field"><span class="lbl">{{tipo}}</span><span class="val">User Event</span></span>
                            <span class="nsft-pv-field"><span class="lbl">{{name}}</span><span class="val${autoId ? ' nsft-pv-sanval' : ''}">{{pvScrUeDoc}}</span></span>
                            <span class="nsft-pv-field"><span class="lbl">{{id}}</span><span class="val nsft-pv-mono${autoId ? ' nsft-pv-sanval' : ''}">customscript_demo_ue</span></span>
                            <span class="nsft-pv-field"><span class="lbl">{{apiVer}}</span><span class="val nsft-pv-mono">2.1</span></span>
                        </div>
                    </div>
                    <div class="nsft-pv-subtabs">
                        <span class="is-on">{{tabCmds}}</span>
                        <span>{{tabParams}}</span>
                        <span>{{tabDeploy}}</span>
                    </div>
                    <div class="nsft-pv-body">
                        <span class="nsft-pv-flabel">{{scriptFile}}</span>
                        <span class="nsft-pv-filerow">
                            <span class="lk">{{preview}}</span>
                            <span class="nsft-pv-mono">demo_ue_documentos.js</span>
                            <span class="lk">{{download}}</span>
                            <span class="lk">{{edit}}</span>${conEnlace ? `
                            <span class="lk nsft-pv-onlink nsft-pv-destello">{{@openInNewTab}}</span>` : ''}
                        </span>${zona ? `
                        <span class="nsft-pv-dropzone">&#10515; {{dropHere}}
                            <span class="nsft-pv-cursor is-su" aria-hidden="true">${PUNTERO}</span>
                            <span class="nsft-pv-dropfile nsft-pv-mono">demo_ue_documentos.js</span>
                        </span>` : ''}
                    </div>`;
    }

    P.enableEditorTheme = ventanaNS({
        clase: 'nsft-pv-ed is-tema',
        sinCabecera: true,
        url: '1234567.app.netsuite.com/app/common/record/edittextmediaitem.nl?id=482&e=T',
        cuerpo: editorNS(false),
        extra: `
            <div class="nsft-pv-float is-edsw">
                <span class="nsft-pv-float-title" data-pv-label></span>
                <div class="nsft-pv-float-row">
                    <span class="nsft-pv-grow nsft-pv-mono nsft-pv-tiny">{ }</span>
                    <span class="nsft-pv-toggle"><i></i>
                        <span class="nsft-pv-tap is-edsw" aria-hidden="true"></span>
                        <span class="nsft-pv-cursor is-edsw" aria-hidden="true">${PUNTERO}</span>
                    </span>
                </div>
            </div>`
    });

    P.editorTheme = ventanaNS({
        clase: 'nsft-pv-ed is-cambia',
        sinCabecera: true,
        url: '1234567.app.netsuite.com/app/common/record/edittextmediaitem.nl?id=482&e=T',
        cuerpo: editorNS(false),
        extra: `
            <div class="nsft-pv-float is-ed">
                <div class="nsft-pv-float-title" data-pv-label></div>
                <div class="nsft-pv-float-row">
                    <span class="nsft-pv-optwrap">
                        <span class="nsft-pv-opt o1">GitHub Dark</span>
                        <span class="nsft-pv-opt o2">GitHub Light</span>
                    </span>
                    <span class="nsft-pv-select">&#9662;</span>
                </div>
            </div>`
    });

    P.enableEditorCloseAfterSave = ventanaNS({
        clase: 'nsft-pv-ed is-cierra',
        cuerpo: scriptNS(false),
        extra: `
            <div class="nsft-pv-edwin">
                <div class="nsft-pv-chrome">
                    <span class="nsft-pv-dots">
                        <span class="nsft-pv-dot is-red"></span><span class="nsft-pv-dot is-amber"></span><span class="nsft-pv-dot is-green"></span>
                    </span>
                    <span class="nsft-pv-url">1234567.app.netsuite.com/app/common/record/edittextmediaitem.nl?id=482&amp;e=T</span>
                </div>
                ${editorNS(true)}
            </div>`
    });

    P.enableEditorOpenInNewTab = ventanaNS({
        clase: 'nsft-pv-onl',
        url: '1234567.app.netsuite.com/app/common/scripting/script.nl?id=482',
        cuerpo: scriptNS(true),
        extra: `
            <div class="nsft-pv-float is-onlsw">
                <span class="nsft-pv-float-title" data-pv-label></span>
                <div class="nsft-pv-float-row">
                    <span class="nsft-pv-grow nsft-pv-tiny">&#8599;</span>
                    <span class="nsft-pv-toggle"><i></i>
                        <span class="nsft-pv-tap is-onlsw" aria-hidden="true"></span>
                        <span class="nsft-pv-cursor is-onlsw" aria-hidden="true">${PUNTERO}</span>
                    </span>
                </div>
            </div>`
    });

    function logNS(suyo, filas, extraFila) {
        const m = (cual, html) => cual === suyo ? `<span class="nsft-pv-lgpart is-suyo">${html}</span><span class="nsft-pv-lgsep"></span>` : '';
        return `
                    <div class="nsft-pv-body nsft-pv-stack">
                        <div class="nsft-pv-title">{{script}}</div>
                    </div>
                    <div class="nsft-pv-subtabs">
                        <span>{{tabCmds}}</span>
                        <span>{{tabParams}}</span>
                        <span class="is-on">{{tabLog}}</span>
                        <span>{{tabDeploy}}</span>
                    </div>
                    <div class="nsft-pv-logbar">
                        <span class="nsft-pv-btn is-ghost">{{custView}}</span>
                        <span class="nsft-pv-btn is-ghost">{{deleteAll}}</span>
                        <span class="nsft-pv-btn">{{refresh}}</span>
                        <span class="nsft-pv-lgsep"></span>
                        ${m('vivo', `<span class="nsft-pv-toggle is-sm"><i></i>${suyo === 'vivo' ? `
                                <span class="nsft-pv-tap is-lm" aria-hidden="true"></span>
                                <span class="nsft-pv-cursor is-lm" aria-hidden="true">${PUNTERO}</span>` : ''}
                            </span>
                            <span class="nsft-pv-tblabel">{{@liveMode}}</span>
                            <span class="nsft-pv-tbnum">3</span>
                            <span class="nsft-pv-tbunit">{{@secondsAbbr}}</span>`)}
                        ${m('full', `<span class="nsft-pv-tblink">{{@logFullArchive}} ${ICONO_ABRIR}${suyo === 'full' ? `
                                <span class="nsft-pv-tap is-fl" aria-hidden="true"></span>
                                <span class="nsft-pv-cursor is-fl" aria-hidden="true">${PUNTERO}</span>` : ''}
                            </span>`)}
                        ${m('buscar', `<span class="nsft-pv-lgsearch">&#9906;
                                <span class="nsft-pv-mono nsft-pv-lgq">${suyo === 'buscar' ? '<span class="nsft-pv-type t8">beforeSubmit</span><span class="nsft-pv-caret"></span>' : '{{@lv_search_ph}}'}</span>
                                <span class="nsft-pv-lgcount">${suyo === 'buscar' ? '<span class="nsft-pv-lgswap"><span class="q1">25</span><span class="q2">3</span></span>' : '25'}</span>${suyo === 'buscar' ? `
                                <span class="nsft-pv-cursor is-lv" aria-hidden="true">${PUNTERO}</span>` : ''}
                            </span>
                            <span class="nsft-pv-tbexp">&#10515; CSV</span>
                            <span class="nsft-pv-tbexp">&#10515; JSON</span>`)}
                    </div>
                    <table class="nsft-pv-table nsft-pv-logtable">
                        <tr><th>#</th><th>{{tipo}}</th><th>{{title}}</th><th>{{date}}</th><th>{{detalle}}</th></tr>
                        ${filas}
                    </table>${extraFila || ''}`;
    }

    const FILA_LOG = (num, nivel, titulo, hora, detalle, clase) =>
        `<tr class="${clase || ''}"><td class="nsft-pv-mono">${num}</td><td><span class="nsft-pv-lvl is-${nivel}">${nivel === 'error' ? '{{lvError}}' : nivel === 'audit' ? '{{lvAudit}}' : '{{lvDebug}}'}</span></td><td class="nsft-pv-mono">${titulo}</td><td class="nsft-pv-mono">${hora}</td><td>${detalle}</td></tr>`;

    const FILAS_BASE =
        FILA_LOG('5', 'debug', 'beforeSubmit', '11:38:31', 'total = 18402.55') +
        FILA_LOG('4', 'audit', 'afterSubmit', '11:38:29', '{{pvLogSaved}}', 'nsft-pv-lgoff') +
        FILA_LOG('3', 'debug', 'beforeSubmit', '11:38:27', 'customrecord_demo · 1042') +
        FILA_LOG('2', 'error', 'beforeLoad', '11:38:24', '{{pvLogRef}}', 'nsft-pv-lgoff') +
        FILA_LOG('1', 'audit', 'beforeLoad', '11:38:22', '{{pvLogStart}}', 'nsft-pv-lgoff');

    P.enableLiveMode = ventanaNS({
        clase: 'nsft-pv-lg is-lm',
        url: '1234567.app.netsuite.com/app/common/scripting/script.nl?id=482',
        cuerpo: logNS('vivo',
            FILA_LOG('7', 'debug', 'beforeSubmit', '11:38:41', '{{pvLogNew}}', 'nsft-pv-lmnew is-n2') +
            FILA_LOG('6', 'audit', 'afterSubmit', '11:38:36', '{{pvLogOther}}', 'nsft-pv-lmnew is-n1') +
            FILAS_BASE)
    });

    P.enableFullLogsButton = ventanaNS({
        clase: 'nsft-pv-lg is-fl',
        url: `<span class="nsft-pv-swap is-fl">
                    <span class="u1">1234567.app.netsuite.com/app/common/scripting/script.nl?id=482</span>
                    <span class="u2">1234567.app.netsuite.com/app/common/scripting/scriptnotearchive.nl</span>
                </span>`,
        pestanas: `
                <span class="nsft-pv-tab is-flt1">{{pvScrUeDoc}}</span>
                <span class="nsft-pv-tab is-flt2">{{@logFullArchive}}</span>`,
        cuerpo: logNS('full', FILAS_BASE),
        destino: `
                    <div class="nsft-pv-body nsft-pv-stack">
                        <div class="nsft-pv-title">{{@logFullArchive}}</div>
                    </div>
                    <table class="nsft-pv-table nsft-pv-logtable">
                        <tr><th>{{date}}</th><th>{{script}}</th><th>{{tipo}}</th><th>{{detalle}}</th></tr>
                        <tr><td class="nsft-pv-mono">16/11/2026</td><td>{{pvScrUeDoc}}</td><td><span class="nsft-pv-lvl is-debug">{{lvDebug}}</span></td><td>total = 18402.55</td></tr>
                        <tr><td class="nsft-pv-mono">15/11/2026</td><td>{{pvScrMrSync}}</td><td><span class="nsft-pv-lvl is-audit">{{lvAudit}}</span></td><td>{{pvLogRows}}</td></tr>
                        <tr><td class="nsft-pv-mono">14/11/2026</td><td>{{pvScrSl}}</td><td><span class="nsft-pv-lvl is-error">{{lvError}}</span></td><td>{{pvLogTimeout}}</td></tr>
                        <tr><td class="nsft-pv-mono">12/11/2026</td><td>{{pvScrCs}}</td><td><span class="nsft-pv-lvl is-debug">{{lvDebug}}</span></td><td>{{pvLogOk}}</td></tr>
                        <tr><td class="nsft-pv-mono">09/11/2026</td><td>{{pvScrUeVal}}</td><td><span class="nsft-pv-lvl is-audit">{{lvAudit}}</span></td><td>{{pvLogNoChg}}</td></tr>
                    </table>`
    });

    P.enableLogViewer = ventanaNS({
        clase: 'nsft-pv-lg is-lv',
        url: '1234567.app.netsuite.com/app/common/scripting/script.nl?id=482',
        cuerpo: logNS('buscar', FILAS_BASE)
    });

    P.enableLogPrettier = ventanaNS({
        clase: 'nsft-pv-lg is-lp',
        url: '1234567.app.netsuite.com/app/common/scripting/script.nl?id=482',
        cuerpo: logNS(null,
            FILA_LOG('5', 'debug', 'beforeSubmit', '11:38:31', 'total = 18402.55') +
            `<tr><td class="nsft-pv-mono">4</td><td><span class="nsft-pv-lvl is-debug">{{lvDebug}}</span></td><td class="nsft-pv-mono">demoLines</td><td class="nsft-pv-mono">11:38:29</td><td>
                        <span class="nsft-pv-lpswap">
                            <span class="raw nsft-pv-mono">[{"itemId":"1042","item":"Demo Item A","bin":"DEMO-A-01","lot":"N/A","qty":1}]</span>
                            <span class="pretty">
                                <span class="nsft-pv-lphead">${ICONO_COPIAR} {{@copy}} &nbsp; &#10515; {{@download}}</span>
                                <span class="nsft-pv-code is-mini">
                                    <span class="ln">[</span>
                                    <span class="ln nsft-pv-ind">{</span>
                                    <span class="ln nsft-pv-ind2"><i class="f">"itemId"</i>: <i class="s">"1042"</i>,</span>
                                    <span class="ln nsft-pv-ind2"><i class="f">"{{pvJsonItem}}"</i>: <i class="s">"Demo Item A"</i>,</span>
                                    <span class="ln nsft-pv-ind2"><i class="f">"bin"</i>: <i class="s">"DEMO-A-01"</i>,</span>
                                    <span class="ln nsft-pv-ind2"><i class="f">"qty"</i>: <i class="n">1</i></span>
                                    <span class="ln nsft-pv-ind">}</span>
                                    <span class="ln">]</span>
                                </span>
                            </span>
                        </span>
                    </td></tr>` +
            FILA_LOG('3', 'debug', 'beforeSubmit', '11:38:27', 'customrecord_demo · 1042') +
            FILA_LOG('2', 'audit', 'beforeLoad', '11:38:22', '{{pvLogStart}}')),
        extra: `
            <div class="nsft-pv-float is-lpsw">
                <span class="nsft-pv-float-title" data-pv-label></span>
                <div class="nsft-pv-float-row">
                    <span class="nsft-pv-grow nsft-pv-mono nsft-pv-tiny">{ }</span>
                    <span class="nsft-pv-toggle"><i></i>
                        <span class="nsft-pv-tap is-lpsw" aria-hidden="true"></span>
                        <span class="nsft-pv-cursor is-lpsw" aria-hidden="true">${PUNTERO}</span>
                    </span>
                </div>
            </div>`
    });

    P.enableScriptUpload = ventanaNS({
        clase: 'nsft-pv-su',
        url: '1234567.app.netsuite.com/app/common/scripting/script.nl?id=482',
        cuerpo: scriptNS(false, 'zona')
    });

    P.enableScriptAutoName = ventanaNS({
        clase: 'nsft-pv-san',
        url: '1234567.app.netsuite.com/app/common/scripting/script.nl?id=482',
        cuerpo: scriptNS(false, null, true),
        extra: `
            <div class="nsft-pv-float is-sansw">
                <span class="nsft-pv-float-title" data-pv-label></span>
                <div class="nsft-pv-float-row">
                    <span class="nsft-pv-grow nsft-pv-mono nsft-pv-tiny">ID</span>
                    <span class="nsft-pv-toggle"><i></i>
                        <span class="nsft-pv-tap is-sansw" aria-hidden="true"></span>
                        <span class="nsft-pv-cursor is-sansw" aria-hidden="true">${PUNTERO}</span>
                    </span>
                </div>
            </div>`
    });

    P.enableSuiteletTools = ventanaNS({
        clase: 'nsft-pv-st',
        sinCabecera: true,
        url: '1234567.app.netsuite.com/app/site/hosting/scriptlet.nl?script=482&deploy=1',
        cuerpo: `
                    <div class="nsft-pv-body nsft-pv-stack">
                        <div class="nsft-pv-title">{{pvScrSl}}</div>
                    </div>
                    <div class="nsft-pv-body">
                        <div class="nsft-pv-fields">
                            <span class="nsft-pv-field"><span class="lbl">{{subsid}}</span><span class="val">{{pvCoSa}}</span></span>
                            <span class="nsft-pv-field"><span class="lbl">{{date}}</span><span class="val nsft-pv-mono">16/11/2026</span></span>
                        </div>
                    </div>
                    <table class="nsft-pv-table">
                        <tr><th>{{id}}</th><th>{{name}}</th><th>{{estado}}</th></tr>
                        <tr><td class="nsft-pv-mono">1042</td><td>Demo Record</td><td>{{pvActivo}}</td></tr>
                        <tr><td class="nsft-pv-mono">1043</td><td>Demo Record B</td><td>{{pvActivo}}</td></tr>
                        <tr><td class="nsft-pv-mono">1044</td><td>Demo Record C</td><td>{{pvInactivo}}</td></tr>
                    </table>`,
        extra: `
            <div class="nsft-pv-fab">
                <span class="nsft-pv-fabmenu">
                    <span class="nsft-pv-fabtitle">{{@st_suitelet_actions}}</span>
                    <span class="nsft-pv-fabitem">${ICONO_ABRIR} {{@st_open_script_record}}</span>
                    <span class="nsft-pv-fabitem">${ICONO_ABRIR} {{@st_open_deploy_record}}</span>
                    <span class="nsft-pv-fabitem">${ICONO_EDITAR} {{@st_edit_script_file}}</span>
                    <span class="nsft-pv-fabitem">${ICONO_RELOJ} {{@st_view_suitelet_logs}}</span>
                </span>
                <span class="nsft-pv-fabbtn"><img class="nsft-pv-logomark" src="{{logo}}" alt="">
                    <span class="nsft-pv-tap is-st" aria-hidden="true"></span>
                    <span class="nsft-pv-cursor is-st" aria-hidden="true">${PUNTERO}</span>
                </span>
            </div>`
    });

    P.enableLoadNModule = ventanaNS({
        clase: 'nsft-pv-lnm nsft-pv-menuflow',
        sublista: true,
        acciones: `
            <span class="nsft-pv-toolsbtn"><img class="nsft-pv-logomark" src="{{logo}}" alt=""> {{@menuTools}} &#9662;
                <span class="nsft-pv-menu">
                    <span class="nsft-pv-menu-item">&#8853; {{@lnm_menu_label}}</span>
                </span>
                <span class="nsft-pv-tap is-cp" aria-hidden="true"></span>
                <span class="nsft-pv-cursor is-cp" aria-hidden="true">${PUNTERO}</span>
            </span>`,
        extra: `
            <div class="nsft-pv-modal is-lnm">
                <div class="nsft-pv-bar">
                    <span class="nsft-pv-grow nsft-pv-tiny">{{@lnm_modal_title}}</span>
                    <span class="nsft-pv-bar-tail">&#10005;</span>
                </div>
                <div class="nsft-pv-modal-body">
                    <span class="nsft-pv-lnmintro">{{@lnm_pick_intro}}</span>
                    <span class="nsft-pv-input nsft-pv-ghbfield nsft-pv-mute">&#9906; {{@lnm_pick_search}}</span>
                    <span class="nsft-pv-lnmtools">
                        <span class="lk">{{@lnm_pick_all}}</span><em>|</em>
                        <span class="lk">{{@lnm_pick_none}}</span><em>|</em>
                        <span class="lk">{{@lnm_pick_recommended}}</span>
                        <span class="nsft-pv-grow"></span>
                        <span class="nsft-pv-mute">{{@lnm_pick_count|3|27}}</span>
                    </span>
                    <span class="nsft-pv-lnmgrid">
                        <span class="nsft-pv-lnmcard"><i></i><b>action</b><em>N/action</em><u>{{@lnm_mod_action}}</u></span>
                        <span class="nsft-pv-lnmcard"><i></i><b>bignumber</b><em>N/bignumber</em><u>{{@lnm_mod_bignumber}}</u></span>
                        <span class="nsft-pv-lnmcard is-on"><i></i><b>currentRecord</b><em>N/currentRecord</em><u>{{@lnm_mod_currentrecord}}</u></span>
                        <span class="nsft-pv-lnmcard"><i></i><b>currency</b><em>N/currency</em><u>{{@lnm_mod_currency}}</u></span>
                        <span class="nsft-pv-lnmcard is-on"><i></i><b>record</b><em>N/record</em><u>{{@lnm_mod_record}}</u></span>
                        <span class="nsft-pv-lnmcard is-on"><i></i><b>search</b><em>N/search</em><u>{{@lnm_mod_search}}</u></span>
                    </span>
                </div>
                <div class="nsft-pv-modal-foot">
                    <span class="nsft-pv-lnmfoot">{{@lnm_pick_foot}}</span>
                    <span class="nsft-pv-btn is-ghost">{{@lnm_btn_cancel}}</span>
                    <span class="nsft-pv-btn nsft-pv-lnmgo">{{@lnm_btn_load|3}}
                        <span class="nsft-pv-tap is-lnm" aria-hidden="true"></span>
                        <span class="nsft-pv-cursor is-lnm" aria-hidden="true">${PUNTERO}</span>
                    </span>
                </div>
            </div>
            <div class="nsft-pv-console is-lnm">
                <div class="nsft-pv-console-bar"><span class="nsft-pv-mono nsft-pv-tiny">Console</span></div>
                <div class="nsft-pv-code">
                    <div><span class="m">&gt;</span> <span class="f">{{@lnm_console_tag}}</span> <span class="s">{{@lnm_console_loaded}}</span></div>
                    <div><span class="m">&gt;</span> <span class="f">{{@lnm_console_tag}}</span> <span class="m">{{@lnm_vars_label}}</span> <span class="v">N</span>, <span class="v">record</span>, <span class="v">search</span>, <span class="v">currentRecord</span></div>
                    <div><span class="m">&gt;</span> <span class="v">search</span>.<span class="f">create</span>({ <span class="f">type</span>: <span class="s">'customrecord_demo'</span> }).<span class="f">run</span>()</div>
                    <div class="nsft-pv-ind m">&#9666; (3) [Result, Result, Result]</div>
                </div>
            </div>`
    });

    P.enableJsonFormatter = ventanaNS({
        clase: 'nsft-pv-jf',
        sinCabecera: true,
        url: '1234567.app.netsuite.com/app/site/hosting/restlet.nl?script=482&deploy=1',
        cuerpo: `
                    <div class="nsft-pv-jfswap">
                        <span class="raw nsft-pv-mono">{"{{pvJsonAcct}}":"1234567","total":18402.55,"{{pvJsonRecs}}":[{"id":1042,"{{pvJsonName}}":"Demo Record","{{pvJsonActive}}":true},{"id":1043,"{{pvJsonName}}":"Demo Record B","{{pvJsonActive}}":false}]}</span>
                        <span class="pretty">
                            <span class="nsft-pv-jfbar">
                                <span class="nsft-pv-jfsearch">&#9906; {{@jfSearchPlaceholder}}</span>
                                <span class="nsft-pv-grow"></span>
                                <span class="nsft-pv-jfact">{{@jfExpand}}</span>
                                <span class="nsft-pv-jfact">{{@jfCollapse}}</span>
                                <span class="nsft-pv-jfact">${ICONO_COPIAR} {{@jfCopy}}</span>
                                <span class="nsft-pv-jfact">&#10515; {{@jfDownload}}</span>
                            </span>
                            <span class="nsft-pv-code is-tree">
                                <span class="ln"><i class="m">&#9662;</i> {</span>
                                <span class="ln nsft-pv-ind"><i class="f">"{{pvJsonAcct}}"</i>: <i class="s">"1234567"</i>,</span>
                                <span class="ln nsft-pv-ind"><i class="f">"total"</i>: <i class="n">18402.55</i>,</span>
                                <span class="ln nsft-pv-ind"><i class="m">&#9662;</i> <i class="f">"{{pvJsonRecs}}"</i>: [<i class="m">2</i>]</span>
                                <span class="ln nsft-pv-ind2"><i class="m">&#9662;</i> <i class="f">0</i>: {</span>
                                <span class="ln nsft-pv-ind3"><i class="f">"id"</i>: <i class="n">1042</i>,</span>
                                <span class="ln nsft-pv-ind3"><i class="f">"{{pvJsonName}}"</i>: <i class="s">"Demo Record"</i>,</span>
                                <span class="ln nsft-pv-ind3"><i class="f">"{{pvJsonActive}}"</i>: <i class="k">true</i></span>
                                <span class="ln nsft-pv-ind2">}</span>
                                <span class="ln nsft-pv-ind2"><i class="m">&#9656;</i> <i class="f">1</i>: { … }</span>
                                <span class="ln">}</span>
                            </span>
                        </span>
                    </div>`,
        extra: `
            <div class="nsft-pv-float is-jfsw">
                <span class="nsft-pv-float-title" data-pv-label></span>
                <div class="nsft-pv-float-row">
                    <span class="nsft-pv-grow nsft-pv-mono nsft-pv-tiny">{ }</span>
                    <span class="nsft-pv-toggle"><i></i>
                        <span class="nsft-pv-tap is-jfsw" aria-hidden="true"></span>
                        <span class="nsft-pv-cursor is-jfsw" aria-hidden="true">${PUNTERO}</span>
                    </span>
                </div>
            </div>`
    });

    P.enablePagePerformance = ventanaNS({
        clase: 'nsft-pv-pp nsft-pv-menuflow',
        sublista: true,
        acciones: `
            <span class="nsft-pv-toolsbtn"><img class="nsft-pv-logomark" src="{{logo}}" alt=""> {{@menuTools}} &#9662;
                <span class="nsft-pv-menu">
                    <span class="nsft-pv-menu-item">${ICONO_RELOJ} {{@pp_title}}</span>
                </span>
                <span class="nsft-pv-tap is-cp" aria-hidden="true"></span>
                <span class="nsft-pv-cursor is-cp" aria-hidden="true">${PUNTERO}</span>
            </span>`,
        extra: `
            <div class="nsft-pv-modal is-pp">
                <div class="nsft-pv-bar">
                    <img class="nsft-pv-logomark" src="{{logo}}" alt="">
                    <span class="nsft-pv-grow nsft-pv-tiny">{{@pp_title}}</span>
                    <span class="nsft-pv-bar-tail">&#10005;</span>
                </div>
                <div class="nsft-pv-modal-body">
                    <span class="nsft-pv-pptotal">2,84 s<i>{{@pp_total}}</i></span>
                    <span class="nsft-pv-pprow"><i>{{@pp_dns}}</i><b style="width:6%"></b><u>0,04 s</u></span>
                    <span class="nsft-pv-pprow"><i>{{@pp_tcp}}</i><b style="width:11%"></b><u>0,09 s</u></span>
                    <span class="nsft-pv-pprow is-max"><i>{{@pp_ttfb}}</i><b style="width:62%"></b><u>1,76 s</u></span>
                    <span class="nsft-pv-pprow"><i>{{@pp_download}}</i><b style="width:14%"></b><u>0,21 s</u></span>
                    <span class="nsft-pv-pprow"><i>{{@pp_dom}}</i><b style="width:26%"></b><u>0,74 s</u></span>
                    <span class="nsft-pv-sfvrow is-sep"><span class="k">{{@pp_requests}}</span><span class="v nsft-pv-mono">143</span></span>
                </div>
            </div>`
    });

    P.enableGithubBackup = ventanaNS({
        clase: 'nsft-pv-ghb nsft-pv-menuflow',
        sublista: true,
        acciones: `
            <span class="nsft-pv-toolsbtn"><img class="nsft-pv-logomark" src="{{logo}}" alt=""> {{@menuTools}} &#9662;
                <span class="nsft-pv-menu">
                    <span class="nsft-pv-menu-item">${ICONO_RAMA} {{@enableGithubBackupLabel}}</span>
                </span>
                <span class="nsft-pv-tap is-cp" aria-hidden="true"></span>
                <span class="nsft-pv-cursor is-cp" aria-hidden="true">${PUNTERO}</span>
            </span>`,
        extra: `
            <div class="nsft-pv-modal is-ghb">
                <div class="nsft-pv-ghbhead">
                    <span class="nsft-pv-ghbmark">${ICONO_RAMA}</span>
                    <span class="nsft-pv-grow">
                        <b>{{@ghb_title}}</b>
                        <i>{{@ghb_sub}}</i>
                    </span>
                    <span class="nsft-pv-bar-tail">&#10005;</span>
                </div>
                <div class="nsft-pv-ghbcols">
                    <div class="nsft-pv-ghbside">
                        <span class="nsft-pv-ghbguide">
                            <span class="h">&#9432; {{@ghb_guide_title}}<em>{{@ghb_guide_once}}</em></span>
                            <span class="s"><i>1</i>{{@ghb_step1}}</span>
                            <span class="s"><i>2</i>{{@ghb_step2}}</span>
                            <span class="s"><i>3</i>{{@ghb_step3}}</span>
                            <span class="s"><i>4</i>{{@ghb_step4}}</span>
                        </span>
                        <span class="nsft-pv-flabel">{{@ghb_f_token}}</span>
                        <span class="nsft-pv-input nsft-pv-ghbfield">
                            <span class="nsft-pv-mono nsft-pv-grow">github_pat_&#8230;</span>
                            <span class="nsft-pv-mute">&#9003; &#9673;</span>
                        </span>
                        <span class="nsft-pv-ghbhelp">{{@ghb_token_help}}</span>
                        <span class="nsft-pv-flabel">{{@ghb_f_repo}}</span>
                        <span class="nsft-pv-input nsft-pv-ghbfield nsft-pv-mono nsft-pv-mute">owner/repo</span>
                        <span class="nsft-pv-ghbtwo">
                            <span>
                                <span class="nsft-pv-flabel">{{@ghb_f_branch}}</span>
                                <span class="nsft-pv-input nsft-pv-ghbfield nsft-pv-mono">main</span>
                            </span>
                            <span>
                                <span class="nsft-pv-flabel">{{@ghb_f_prefix}}</span>
                                <span class="nsft-pv-input nsft-pv-ghbfield">Demo Co SB1</span>
                            </span>
                        </span>
                        <span class="nsft-pv-ghbhelp">{{@ghb_need_cfg}}</span>
                    </div>
                    <div class="nsft-pv-ghbmain">
                        <span class="nsft-pv-ghbrhead">
                            <b>{{@ghb_scripts}}</b>
                            <span class="nsft-pv-ghbchip">83</span>
                            <span class="nsft-pv-grow"></span>
                            <span class="nsft-pv-ghbseg is-on">{{@ghb_by_type}}</span>
                            <span class="nsft-pv-ghbseg">{{@ghb_by_folder}}</span>
                            <span class="nsft-pv-ghblk">{{@ghb_all}} &middot; {{@ghb_none_sel}}</span>
                        </span>
                        <span class="nsft-pv-ghblist">
                            <span class="nsft-pv-ghbrow"><i></i><b>{{stWf}}</b><u>3</u></span>
                            <span class="nsft-pv-ghbrow"><i></i><b>{{stClient}}</b><u>18</u></span>
                            <span class="nsft-pv-ghbrow"><i></i><b>{{stUe}}</b><u>24</u></span>
                            <span class="nsft-pv-ghbrow"><i></i><b>{{stLib}}</b><u>9</u></span>
                            <span class="nsft-pv-ghbrow"><i></i><b>{{stMr}}</b><u>5</u></span>
                            <span class="nsft-pv-ghbrow"><i></i><b>{{stPortlet}}</b><u>2</u></span>
                            <span class="nsft-pv-ghbrow"><i></i><b>{{stSched}}</b><u>4</u></span>
                            <span class="nsft-pv-ghbrow"><i></i><b>{{stRestlet}}</b><u>6</u></span>
                            <span class="nsft-pv-ghbrow"><i></i><b>{{stSuitelet}}</b><u>12</u></span>
                        </span>
                        <span class="nsft-pv-ghbfoot">{{@ghb_foot|83|83}}</span>
                    </div>
                </div>
                <div class="nsft-pv-modal-foot">
                    <span class="nsft-pv-btn is-ghost">{{@ghb_close}}</span>
                    <span class="nsft-pv-btn">&#10515; {{@ghb_run}}</span>
                </div>
            </div>`
    });

    function busquedaNS(o) {
        return `
                    <div class="nsft-pv-body nsft-pv-stack nsft-pv-bqhead">
                        <div class="nsft-pv-title">{{savedSearch}}: {{pvActRecs}}</div>
                        <span class="nsft-pv-bqlinks">${o.acciones || ''}
                            <span class="lk">{{li}}</span>
                            <span class="lk">{{search}}</span>
                            <span class="lk">{{masLinks}}</span>
                        </span>
                    </div>
                    <div class="nsft-pv-actions">
                        <span class="nsft-pv-btn">{{save}}</span>
                        <span class="nsft-pv-btn is-ghost">{{cancel}}</span>
                    </div>
                    <div class="nsft-pv-body">
                        <div class="nsft-pv-fields">
                            <span class="nsft-pv-field"><span class="lbl">{{name}}</span><span class="val">{{pvActRecs}}</span></span>
                            <span class="nsft-pv-field"><span class="lbl">{{tipo}}</span><span class="val nsft-pv-mono">customrecord_demo</span></span>
                        </div>
                    </div>
                    <div class="nsft-pv-subtabs">
                        <span${o.pestana === 'resultados' ? '' : ' class="is-on"'}>{{tabCriteria}}</span>
                        <span${o.pestana === 'resultados' ? ' class="is-on"' : ''}>{{tabResults}}</span>
                        <span>{{tabAvail}}</span>
                    </div>
                    ${o.cuerpo || ''}`;
    }

    P.enableExportSearch = ventanaNS({
        clase: 'nsft-pv-es nsft-pv-menuflow',
        url: '1234567.app.netsuite.com/app/common/search/search.nl?e=T&id=482',
        cuerpo: busquedaNS({
            acciones: `
                        <span class="nsft-pv-toolsbtn is-link"><img class="nsft-pv-logomark" src="{{logo}}" alt=""> {{@menuTools}}
                            <span class="nsft-pv-menu is-left">
                                <span class="nsft-pv-menu-item">${ICONO_BAJAR} {{@enableExportSearchLabel}}</span>
                            </span>
                            <span class="nsft-pv-tap is-cp" aria-hidden="true"></span>
                            <span class="nsft-pv-cursor is-cp" aria-hidden="true">${PUNTERO}</span>
                        </span>`,
            cuerpo: `
                    <div class="nsft-pv-body">
                        <div class="nsft-pv-skel nsft-pv-cols"><i></i><i></i><i class="is-half"></i><i class="is-short"></i></div>
                    </div>`
        }),
        extra: `
            <div class="nsft-pv-espanel">
                <div class="nsft-pv-eshead">
                    <span class="nsft-pv-esmark">${ICONO_LUPA}</span>
                    <span class="nsft-pv-grow nsft-pv-tiny">{{@es_title}}</span>
                    <span class="nsft-pv-bar-tail">&#9472; &#10005;</span>
                </div>
                <div class="nsft-pv-esbody">
                    <span class="nsft-pv-esrow">
                        <span class="nsft-pv-input nsft-pv-ghbfield nsft-pv-mono nsft-pv-grow">demoRecordSearch</span>
                        <span class="nsft-pv-esseg is-on">SuiteScript 2.1</span>
                        <span class="nsft-pv-esseg">SuiteScript 1.0</span>
                    </span>
                    <span class="nsft-pv-eschips">
                        <span>{{@es_info_type|customrecord_demo}}</span>
                        <span>{{@es_info_columns|2}}</span>
                        <span>{{@es_info_filters|2}}</span>
                    </span>
                    <span class="nsft-pv-esrow">
                        <span class="nsft-pv-escheck"><i></i>{{@es_with_labels}}</span>
                        <span class="nsft-pv-escheck"><i></i>{{@es_with_loop}}</span>
                        <span class="nsft-pv-grow"></span>
                        <span class="nsft-pv-mute">{{@es_meta_lines|13}}</span>
                        <span class="nsft-pv-mute">UTF-8</span>
                    </span>
                    <div class="nsft-pv-edcode is-claro">
                        <span class="g">1</span><span class="l"><i class="k">const</i> <i class="v">demoRecordSearch</i> = <i class="v">search</i>.<i class="f">create</i>({</span>
                        <span class="g">2</span><span class="l is-ind"><i class="f">type</i>: <i class="s">"customrecord_demo"</i>,</span>
                        <span class="g">3</span><span class="l is-ind"><i class="f">filters</i>:</span>
                        <span class="g">4</span><span class="l is-ind">[</span>
                        <span class="g">5</span><span class="l is-ind2">[<i class="s">"isinactive"</i>,<i class="s">"is"</i>,<i class="s">"F"</i>],</span>
                        <span class="g">6</span><span class="l is-ind2"><i class="s">"AND"</i>,</span>
                        <span class="g">7</span><span class="l is-ind2">[<i class="s">"custrecord_total"</i>,<i class="s">"greaterthan"</i>,<i class="s">"1042"</i>]</span>
                        <span class="g">8</span><span class="l is-ind">],</span>
                        <span class="g">9</span><span class="l is-ind"><i class="f">columns</i>:</span>
                        <span class="g">10</span><span class="l is-ind">[</span>
                        <span class="g">11</span><span class="l is-ind2"><i class="s">"internalid"</i>,</span>
                        <span class="g">12</span><span class="l is-ind2"><i class="s">"custrecord_total"</i></span>
                        <span class="g">13</span><span class="l is-ind">]</span>
                    </div>
                </div>
                <div class="nsft-pv-esfoot">
                    <span class="nsft-pv-btn is-ghost">${ICONO_COPIAR} {{@es_btn_copy}}</span>
                    <span class="nsft-pv-btn is-dark">&gt;_ {{@es_btn_run}}</span>
                </div>
            </div>`
    });

    P.enableSearchFieldsFinder = ventanaNS({
        clase: 'nsft-pv-sff',
        url: '1234567.app.netsuite.com/app/common/search/search.nl?e=T&id=482',
        cuerpo: busquedaNS({
            cuerpo: `
                    <div class="nsft-pv-sffzone">
                        <table class="nsft-pv-table nsft-pv-sfftable">
                            <tr><th>#</th><th>{{filtro}}</th><th>{{descripcion}}</th><th>{{formula}}</th></tr>
                            <tr><td class="nsft-pv-mono">1</td><td>{{tipo}}</td><td>{{pvIsRec}}</td><td></td></tr>
                            <tr><td class="nsft-pv-mono">2</td><td>{{pvEstadoCol}}</td><td>{{pvIsActive}}</td><td></td></tr>
                            <tr><td class="nsft-pv-mono">3</td><td>Demo &middot; Total</td><td>{{pvIsNum}}</td><td></td></tr>
                            <tr class="nsft-pv-sffnew"><td class="nsft-pv-mono">4</td><td>
                                <span class="nsft-pv-input nsft-pv-ghbfield nsft-pv-mute"><span class="nsft-pv-grow"></span>&#9662;</span>
                            </td><td></td><td></td></tr>
                        </table>
                        <span class="nsft-pv-sffpop">
                            <span class="nsft-pv-input nsft-pv-ghbfield nsft-pv-mono is-focus"><span class="nsft-pv-type t9">total</span><span class="nsft-pv-caret"></span></span>
                            <span class="nsft-pv-sffbtns">
                                <span class="nsft-pv-sfftab">{{@ff_btn_standard}}</span>
                                <span class="nsft-pv-sfftab is-on">{{@ff_btn_custom}}</span>
                                <span class="nsft-pv-sfftab">{{@ff_btn_formula}}</span>
                                <span class="nsft-pv-sfftab">{{@ff_btn_empty_type}}</span>
                                <span class="nsft-pv-sfftab">{{@ff_type_all}} &#9662;</span>
                            </span>
                            <span class="nsft-pv-sfflist">
                                <span class="nsft-pv-sffrow"><b>Demo &middot; Total</b><em>custrecord_total</em><u>CURRENCY</u></span>
                                <span class="nsft-pv-sffrow"><b>{{pvTotalIva}}</b><em>{{pvIdTotIva}}</em><u>CURRENCY</u></span>
                                <span class="nsft-pv-sffrow"><b>{{pvTotalPend}}</b><em>custrecord_total_pend</em><u>CURRENCY</u></span>
                                <span class="nsft-pv-sffrow"><b>{{pvTotalPct}}</b><em>custrecord_total_pct</em><u>PERCENT</u></span>
                                <span class="nsft-pv-sffrow"><b>{{pvTotalOk}}</b><em>custrecord_total_ok</em><u>CHECKBOX</u></span>
                            </span>
                            <span class="nsft-pv-sfffoot">{{@ff_showing_prefix}}5{{@ff_showing_middle}}47{{@ff_showing_suffix}}</span>
                        </span>
                    </div>`
        })
    });

    P.enableSearchFormulaAutocomplete = ventanaNS({
        clase: 'nsft-pv-sfa',
        url: '1234567.app.netsuite.com/app/common/search/search.nl?e=T&id=482',
        cuerpo: busquedaNS({
            cuerpo: `
                    <div class="nsft-pv-body">
                        <span class="nsft-pv-flabel">{{formula}}</span>
                        <span class="nsft-pv-sfawrap">
                            <span class="nsft-pv-input nsft-pv-ghbfield nsft-pv-mono">
                                <span>CASE WHEN {</span><span class="nsft-pv-type t10">custrecord_tot</span><span class="nsft-pv-caret"></span>
                            </span>
                            <span class="nsft-pv-sfapop">
                                <span class="nsft-pv-sffrow is-on"><b>custrecord_total</b><em>Demo · Total</em></span>
                                <span class="nsft-pv-sffrow"><b>{{pvIdTotIva}}</b><em>{{pvTotalIva}}</em></span>
                                <span class="nsft-pv-sffrow"><b>custrecord_total_pend</b><em>{{pvTotalPend}}</em></span>
                            </span>
                        </span>
                    </div>`
        })
    });

    P.enableInSearchPreview = ventanaNS({
        clase: 'nsft-pv-isp',
        url: '1234567.app.netsuite.com/app/common/search/search.nl?e=T&id=482',
        cuerpo: busquedaNS({
            cuerpo: `
                    <div class="nsft-pv-ispzone">
                        <span class="nsft-pv-ispcap">
                            <span class="nsft-pv-ispcol">&#9662; {{@ispCollapse}}</span>
                            <span class="nsft-pv-btn">&#8635; {{@ispRefresh}}</span>
                        </span>
                        <span class="nsft-pv-ispgrip"></span>
                        <span class="nsft-pv-ispfilters">&#65291; {{filtros}}</span>
                        <span class="nsft-pv-isptotal">{{total}}: 3</span>
                        <table class="nsft-pv-table nsft-pv-logtable">
                            <tr><th>{{id}}</th><th>{{name}}</th><th>{{estado}}</th><th>Demo &middot; Total</th></tr>
                            <tr><td class="nsft-pv-mono">1042</td><td>Demo Record</td><td>{{pvActivo}}</td><td class="nsft-pv-mono">18402.55</td></tr>
                            <tr><td class="nsft-pv-mono">1043</td><td>Demo Record B</td><td>{{pvActivo}}</td><td class="nsft-pv-mono">9210.00</td></tr>
                            <tr><td class="nsft-pv-mono">1044</td><td>Demo Record C</td><td>{{pvActivo}}</td><td class="nsft-pv-mono">4105.80</td></tr>
                        </table>
                    </div>`
        }),
        extra: `
            <div class="nsft-pv-float is-ispsw">
                <span class="nsft-pv-float-title" data-pv-label></span>
                <div class="nsft-pv-float-row">
                    <span class="nsft-pv-grow">&#9636;</span>
                    <span class="nsft-pv-toggle"><i></i>
                        <span class="nsft-pv-tap is-ispsw" aria-hidden="true"></span>
                        <span class="nsft-pv-cursor is-ispsw" aria-hidden="true">${PUNTERO}</span>
                    </span>
                </div>
            </div>`
    });

    P.enableQuickSearchCreation = ventanaNS({
        clase: 'nsft-pv-qsc',
        url: '1234567.app.netsuite.com/app/common/search/searchtype.nl',
        cuerpo: `
                    <div class="nsft-pv-body nsft-pv-stack">
                        <div class="nsft-pv-title">{{newSavedSearch}}</div>
                    </div>
                    <div class="nsft-pv-body">
                        <span class="nsft-pv-qscadd">
                            <span class="nsft-pv-qscsearch">&#9906; {{@qscRecordType}}</span>
                            <span class="nsft-pv-qscsec">&#9733; {{@qscFavorites}}</span>
                            <span class="nsft-pv-qscfavs">
                                <span class="nsft-pv-qscfav">{{pvStockRev}}</span>
                                <span class="nsft-pv-qscfav">{{pvArts}}</span>
                                <span class="nsft-pv-qscfav">{{trans}}</span>
                            </span>
                        </span>
                    </div>
                    <table class="nsft-pv-table nsft-pv-qsctable">
                        <tr><th>{{searchType}}</th></tr>
                        <tr><td>{{pvInvAdj}}</td></tr>
                        <tr><td>{{pvArts}}</td></tr>
                        <tr><td>{{pvStockRev}}</td></tr>
                        <tr><td>{{actividad}}</td></tr>
                        <tr><td>{{articulo}}</td></tr>
                        <tr><td>{{cliente}}</td></tr>
                        <tr><td>{{empleado}}</td></tr>
                        <tr><td>{{trans}}</td></tr>
                    </table>`,
        extra: `
            <div class="nsft-pv-float is-qscsw">
                <span class="nsft-pv-float-title" data-pv-label></span>
                <div class="nsft-pv-float-row">
                    <span class="nsft-pv-grow">&#9733;</span>
                    <span class="nsft-pv-toggle"><i></i>
                        <span class="nsft-pv-tap is-qscsw" aria-hidden="true"></span>
                        <span class="nsft-pv-cursor is-qscsw" aria-hidden="true">${PUNTERO}</span>
                    </span>
                </div>
            </div>`
    });

    P.enableCsvResponseViewer = ventanaNS({
        clase: 'nsft-pv-csv nsft-pv-menuflow',
        url: '1234567.app.netsuite.com/app/setup/upload/csvstatus.nl',
        cuerpo: `
                    <div class="nsft-pv-body nsft-pv-stack">
                        <div class="nsft-pv-title">{{pvImport}}</div>
                    </div>
                    <table class="nsft-pv-table">
                        <tr><th>{{date}}</th><th>{{name}}</th><th>{{estado}}</th><th>{{fileName}}</th></tr>
                        <tr><td class="nsft-pv-mono">16/11/2026</td><td>{{pvCoSa}}</td><td>{{pvCompletado}}</td>
                            <td><span class="nsft-pv-csvfile">{{pvFileResp}}
                                <span class="nsft-pv-csvver">{{@csvRvView}}
                                    <span class="nsft-pv-tap is-csv" aria-hidden="true"></span>
                                    <span class="nsft-pv-cursor is-csv" aria-hidden="true">${PUNTERO}</span>
                                </span>
                            </span></td></tr>
                        <tr><td class="nsft-pv-mono">15/11/2026</td><td>{{pvCoSa}}</td><td>{{pvCompletado}}</td><td class="nsft-pv-mono">{{pvFileResp15}}</td></tr>
                    </table>`,
        extra: `
            <div class="nsft-pv-modal is-csv">
                <div class="nsft-pv-bar">
                    <img class="nsft-pv-logomark" src="{{logo}}" alt="">
                    <span class="nsft-pv-grow nsft-pv-tiny">{{@csvRvTitle}}</span>
                    <span class="nsft-pv-bar-tail">&#10005;</span>
                </div>
                <div class="nsft-pv-modal-body">
                    <table class="nsft-pv-table nsft-pv-logtable">
                        <tr><th>#</th><th>{{name}}</th><th>Demo · Total</th><th>{{detalle}}</th></tr>
                        <tr><td class="nsft-pv-mono">1</td><td>Demo Record</td><td class="nsft-pv-mono">18402.55</td><td class="nsft-pv-mute">OK</td></tr>
                        <tr class="nsft-pv-csverr"><td class="nsft-pv-mono">2</td><td>Demo Record B</td><td class="nsft-pv-mono">—</td><td>{{pvCsvErrReq}}</td></tr>
                        <tr><td class="nsft-pv-mono">3</td><td>Demo Record C</td><td class="nsft-pv-mono">4105.80</td><td class="nsft-pv-mute">OK</td></tr>
                        <tr class="nsft-pv-csverr"><td class="nsft-pv-mono">4</td><td>Demo Record D</td><td class="nsft-pv-mono">—</td><td>{{pvCsvErrList}}</td></tr>
                    </table>
                </div>
                <div class="nsft-pv-modal-foot">
                    <span class="nsft-pv-btn is-ghost">{{@csvRvReset}}</span>
                    <span class="nsft-pv-btn">&#10515; {{@csvRvDownload}}</span>
                </div>
            </div>`
    });

    P.enableSavedSearchSplit = ventanaNS({
        clase: 'nsft-pv-sss',
        sublista: true,
        panel: `
                <div class="nsft-pv-side">
                    <div class="nsft-pv-side-inner">
                        <div class="nsft-pv-omhead">
                            <img class="nsft-pv-logomark" src="{{logo}}" alt="">
                            <span class="nsft-pv-grow nsft-pv-tiny">{{@sss_title}}</span>
                            <span class="nsft-pv-bar-tail">&#10005;</span>
                        </div>
                        <div class="nsft-pv-side-body">
                            <span class="nsft-pv-sssbar">
                                <span class="nsft-pv-input nsft-pv-ghbfield nsft-pv-mono nsft-pv-grow">482</span>
                                <span class="nsft-pv-btn">{{@sss_open}}</span>
                            </span>
                            <table class="nsft-pv-table nsft-pv-logtable">
                                <tr><th>{{id}}</th><th>{{name}}</th><th>Demo · Total</th></tr>
                                <tr><td class="nsft-pv-mono">1042</td><td>Demo Record</td><td class="nsft-pv-mono">18402.55</td></tr>
                                <tr><td class="nsft-pv-mono">1043</td><td>Demo Record B</td><td class="nsft-pv-mono">9210.00</td></tr>
                                <tr><td class="nsft-pv-mono">1044</td><td>Demo Record C</td><td class="nsft-pv-mono">4105.80</td></tr>
                                <tr><td class="nsft-pv-mono">1045</td><td>Demo Record D</td><td class="nsft-pv-mono">2380.10</td></tr>
                            </table>
                        </div>
                    </div>
                </div>`
    });

    P.enableSearchSummaryBulk = ventanaNS({
        clase: 'nsft-pv-ssb',
        url: '1234567.app.netsuite.com/app/common/search/search.nl?e=T&id=482',
        cuerpo: busquedaNS({
            pestana: 'resultados',
            cuerpo: `
                    <div class="nsft-pv-body">
                        <div class="nsft-pv-ssbbar">
                            <span class="nsft-pv-ssblbl">{{@ssb_title}}</span>
                            <span class="nsft-pv-ssbsel">{{@ssb_group}} &#9662;</span>
                            <span class="nsft-pv-ssbbtn">{{@ssb_apply}}
                                <span class="nsft-pv-tap is-ssb" aria-hidden="true"></span>
                                <span class="nsft-pv-cursor is-ssb" aria-hidden="true">${PUNTERO}</span>
                            </span>
                            <span class="nsft-pv-ssbbtn is-ghost">{{@ssb_clear}}</span>
                        </div>
                        <table class="nsft-pv-table nsft-pv-ssbtable">
                            <tr><th>{{field}}</th><th>{{summaryType}}</th><th>{{formula}}</th></tr>
                            <tr><td>{{name}}</td><td><span class="nsft-pv-ssbval">{{@ssb_group}}</span></td><td></td></tr>
                            <tr><td>{{pvEstadoCol}}</td><td><span class="nsft-pv-ssbval">{{@ssb_group}}</span></td><td></td></tr>
                            <tr><td>Demo &middot; Total</td><td><span class="nsft-pv-ssbval">{{@ssb_group}}</span></td><td></td></tr>
                            <tr><td>{{date}}</td><td><span class="nsft-pv-ssbval">{{@ssb_group}}</span></td><td></td></tr>
                        </table>
                    </div>`
        })
    });

    function sublistaLayout(o) {
        const datos = [
            ['1', '10042', '{{user}}', '{{pvArt}} A', '{{pvActivo}}', '18402.55'],
            ['2', '10043', '{{user}}', '{{pvArt}} B', '{{pvActivo}}', '9210.00'],
            ['3', '10044', 'Demo Admin', '{{pvArt}} C', '{{pvPendiente}}', '4105.80'],
            ['4', '10045', 'Demo Admin', '{{pvArt}} D', '{{pvActivo}}', '2380.10'],
            ['5', '10046', '{{user}}', '{{pvArt}} E', '{{pvPendiente}}', '1042.00']
        ];
        const filas = datos.map((f) => `<tr>
                            ${o.colfija ? `<td class="nsft-pv-slwide">${f[3]}</td>` : ''}
                            ${o.numeros ? `<td class="nsft-pv-slnum">${f[0]}</td>` : ''}
                            <td class="lk">{{edit}}</td>
                            ${o.ids ? `<td><span class="nsft-pv-slid">${f[1]}</span></td>` : ''}
                            <td>${f[2]}</td>
                            ${o.colfija ? '' : `<td class="nsft-pv-slwide">${f[3]}</td>`}
                            <td>${f[4]}</td>
                            <td class="nsft-pv-mono">${f[5]}</td>
                        </tr>`).join('');

        return ventanaNS({
            clase: 'nsft-pv-sl ' + o.clase,
            cuerpo: `
                    <div class="nsft-pv-body nsft-pv-stack">
                        <div class="nsft-pv-title">SO10482</div>
                    </div>
                    <div class="nsft-pv-subtabs">
                        <span class="is-on">{{tabLines}}</span>
                        <span>{{tabNotes}}</span>
                        <span>{{tabFiles}}</span>
                    </div>
                    <div class="nsft-pv-subbar">
                        <span class="nsft-pv-btn is-ghost">{{newNote}}</span>
                        <span class="nsft-pv-btn is-ghost">{{custView}}</span>
                        <span class="nsft-pv-btn is-ghost">{{refresh}}</span>
                        ${o.paginado ? `<span class="nsft-pv-grow"></span>
                        <span class="nsft-pv-slpage">
                            <span class="b">&#171;</span><span class="b">&#8249;</span>
                            <span class="p">1 / 4</span>
                            <span class="b">&#8250;</span><span class="b">&#187;</span>
                        </span>` : ''}
                    </div>
                    ${o.filtro ? `
                    <div class="nsft-pv-slfilterbar">
                        <span class="nsft-pv-slfilter">&#9906; {{@sublistFilterPlaceholder}}</span>
                        <span class="nsft-pv-slcount">5 / 5 {{@sublistFilterRowsLabel}}</span>
                    </div>` : ''}
                    <div class="nsft-pv-slscroll">
                        ${o.colfija ? `<table class="nsft-pv-table nsft-pv-sltable nsft-pv-slcolfija">
                            <tr><th class="nsft-pv-slwide">{{articulo}}</th></tr>
                            ${datos.map((f) => `<tr><td class="nsft-pv-slwide">${f[3]}</td></tr>`).join('')}
                        </table>` : ''}
                        <table class="nsft-pv-table nsft-pv-sltable">
                            <tr>
                                ${o.colfija ? '<th class="nsft-pv-slwide">{{articulo}}</th>' : ''}
                                ${o.numeros ? '<th class="nsft-pv-slnum">#</th>' : ''}
                                <th>{{edit}}</th>
                                ${o.ids ? '<th>{{lineKey}}</th>' : ''}
                                <th>{{author}}</th>
                                ${o.colfija ? '' : '<th class="nsft-pv-slwide">{{articulo}}</th>'}
                                <th>{{estado}}</th>
                                <th>Demo &middot; Total</th>
                            </tr>
                            ${filas}
                        </table>
                    </div>`,
            extra: `
            <div class="nsft-pv-float is-slsw">
                <span class="nsft-pv-float-title" data-pv-label></span>
                <div class="nsft-pv-float-row">
                    <span class="nsft-pv-grow">${o.icono}</span>
                    <span class="nsft-pv-toggle"><i></i>
                        <span class="nsft-pv-tap is-slsw" aria-hidden="true"></span>
                        <span class="nsft-pv-cursor is-slsw" aria-hidden="true">${PUNTERO}</span>
                    </span>
                </div>
            </div>`
        });
    }

    P.enableSublistFilter = sublistaLayout({ clase: 'is-filtro', filtro: true, icono: '&#9906;' });

    P.enableSublistLineNumbersBeta = sublistaLayout({ clase: 'is-numeros', numeros: true, icono: '#' });

    P.enableSublistLineIds = sublistaLayout({ clase: 'is-ids', ids: true, icono: '&#9782;' });

    P.enableFixedSublistHeaders = sublistaLayout({ clase: 'is-fijas', icono: '&#8942;' });

    P.enableFixedSublistColumn = sublistaLayout({ clase: 'is-colfija', colfija: true, icono: '&#8596;' });

    P.enableSmallerSublistHeaders = sublistaLayout({ clase: 'is-cabeceras', icono: '&#8596;' });

    P.enableSublistPagingBeta = sublistaLayout({ clase: 'is-paginado', paginado: true, icono: '&#8250;' });

    function floatLay(glifo) {
        return `
            <div class="nsft-pv-float is-laysw">
                <span class="nsft-pv-float-title" data-pv-label></span>
                <div class="nsft-pv-float-row">
                    <span class="nsft-pv-grow">${glifo}</span>
                    <span class="nsft-pv-toggle"><i></i>
                        <span class="nsft-pv-tap is-laysw" aria-hidden="true"></span>
                        <span class="nsft-pv-cursor is-laysw" aria-hidden="true">${PUNTERO}</span>
                    </span>
                </div>
            </div>`;
    }

    function formularioLay(conPestanas) {
        const grupo = (titulo, campos, fijo) => `
                    <div class="nsft-pv-grupo${fijo ? ' is-pin' : ''}">${titulo}</div>
                    <div class="nsft-pv-body">
                        <div class="nsft-pv-fields is-tres">${campos}</div>
                    </div>`;
        const campo = (l, v) => `<span class="nsft-pv-field"><span class="lbl">${l}</span><span class="val">${v}</span></span>`;
        return `
                    <div class="nsft-pv-body nsft-pv-stack">
                        <div class="nsft-pv-title">Demo Record</div>
                    </div>
                    <div class="nsft-pv-layscroll">
                        <div class="nsft-pv-laypage">
                            ${grupo('&#9662; {{grpMain}}',
                                campo('{{id}}', '1042') + campo('{{name}}', 'Demo Record') + campo('{{date}}', '16/11/2026') +
                                campo('{{tipo}}', '{{pvConteo}}') + campo('{{estado}}', '{{pvActivo}}') + campo('{{author}}', '{{user}}'), true)}
                            ${conPestanas ? `<div class="nsft-pv-subtabs is-lay">
                                <span class="is-on">{{tabLines}}</span><span>{{tabNotes}}</span><span>{{tabFiles}}</span><span>{{tabWf}}</span>
                            </div>` : ''}
                            ${grupo('&#9662; {{grpClass}}',
                                campo('{{subsid}}', '{{pvCoSa}}') + campo('{{dept}}', '{{pvDeptSales}}') + campo('{{ubic}}', '{{pvUbicCentro}}') +
                                campo('{{clase}}', '{{pvClaseDir}}') + campo('{{acct}}', '4000') + campo('Demo &middot; Total', '18402.55'))}

                            ${grupo('&#9662; {{grpCost}}',
                                campo('{{pvCosto}}', '131.64') + campo('{{pvPrecio}}', '130.00') + campo('{{pvMargen}}', '1.64') +
                                campo('{{pvUnidad}}', 'KG') + campo('{{pvAlmacen}}', '{{pvUbicCentro}}') + campo('{{pvLote}}', 'N/A'))}
                        </div>
                    </div>`;
    }

    function dropdownLay(ancho) {
        return `<span class="nsft-pv-ddwrap">
                                    <span class="nsft-pv-ddlist${ancho ? ' is-corta' : ''}">
                                        <span class="nsft-pv-dditem is-on">{{pvWh1}}</span>
                                        <span class="nsft-pv-dditem">{{pvWh2}}</span>
                                        <span class="nsft-pv-dditem">{{pvWh3}}</span>
                                        <span class="nsft-pv-dditem">{{pvWh4}}</span>
                                        <span class="nsft-pv-dditem">{{pvWh5}}</span>
                                        <span class="nsft-pv-dditem">{{pvWh6}}</span>
                                    </span>
                                </span>`;
    }


    P.enableNetSuiteVersionBadgeBeta = ventanaNS({
        clase: 'nsft-pv-lay is-ver',
        sublista: true,
        ver: `<span class="nsft-pv-ver nsft-pv-destello">v 2026.1</span>`,
        extra: floatLay('v')
    });

    P.enableTurboMode = ventanaNS({
        clase: 'nsft-pv-lay is-turbo',
        sublista: true,
        navIcono: `<span class="nsft-pv-turbomenu">
                            <span class="nsft-pv-turboitem">{{tx}}</span>
                            <span class="nsft-pv-turboitem">{{li}}</span>
                            <span class="nsft-pv-turboitem">{{re}}</span>
                        </span>`,
        extra: floatLay('&#9889;')
    });

    P.enableBetterPageTitles = ventanaNS({
        clase: 'nsft-pv-lay is-titulos',
        sublista: true,
        pestanas: `
                <span class="nsft-pv-tab is-bpt">
                    <span class="nsft-pv-swap is-bpt">
                        <span class="e1">NetSuite</span>
                        <span class="e2">SO10482 &middot; Demo Record</span>
                    </span>
                </span>
                <span class="nsft-pv-tab">NetSuite</span>`,
        extra: floatLay('&#9636;')
    });

    P.enableProfileButton = ventanaNS({
        clase: 'nsft-pv-lay is-perfil',
        sublista: true,
        perfil: `<span class="nsft-pv-hlink nsft-pv-destello">&#9787; {{@profileButtonLabel}}</span>`,
        extra: floatLay('&#9787;')
    });

    P.enableSmallerNavigationOptions = ventanaNS({
        clase: 'nsft-pv-lay is-navchica',
        sublista: true,
        navIcono: `<span class="nsft-pv-navmenu">
                            <span class="nsft-pv-navitem">{{pvNavCounts}}</span>
                            <span class="nsft-pv-navitem">{{pvNavAdj}}</span>
                            <span class="nsft-pv-navitem">{{pvNavTransf}}</span>
                            <span class="nsft-pv-navitem">{{pvArts}}</span>
                            <span class="nsft-pv-navitem">{{pvNavWh}}</span>
                        </span>`,
        extra: floatLay('&#8597;')
    });

    P.enableSmallerMainMenu = ventanaNS({
        clase: 'nsft-pv-lay is-menuchico',
        sublista: true,
        extra: floatLay('A')
    });


    P.enableFloatingFieldGroupsBeta = ventanaNS({
        clase: 'nsft-pv-lay is-grupos',
        cuerpo: formularioLay(),
        extra: floatLay('&#8942;')
    });

    P.enableFixedTabs = ventanaNS({
        clase: 'nsft-pv-lay is-pestanas',
        cuerpo: formularioLay(true),
        extra: floatLay('&#8942;')
    });


    P.enableSmallerDropdownOptions = ventanaNS({
        clase: 'nsft-pv-lay is-ddchico',
        sublista: true,
        campoExtra: dropdownLay(),
        extra: floatLay('&#8597;')
    });

    P.enableDropdownSizeBeta = ventanaNS({
        clase: 'nsft-pv-lay is-ddancho',
        sublista: true,
        campoExtra: dropdownLay(true),
        extra: floatLay('&#8596;')
    });


    P.enableErrorPagePolishBeta = ventanaNS({
        clase: 'nsft-pv-lay is-error',
        sinCabecera: true,
        url: '1234567.app.netsuite.com/app/common/custom/custrecordentry.nl',
        cuerpo: `
                    <div class="nsft-pv-errpage">
                        <span class="nsft-pv-errlogo"><i>ORACLE</i>NetSuite</span>
                        <span class="nsft-pv-errtitle">{{errTitle}}</span>
                        <span class="nsft-pv-errtext">{{errText}}</span>
                        <span class="nsft-pv-errbtns">
                            <span class="nsft-pv-btn">{{volver}}</span>
                        </span>
                    </div>`,
        extra: floatLay('&#9888;')
    });

    P.enableMultiselectHierarchyBeta = ventanaNS({
        clase: 'nsft-pv-lay is-jerarquia',
        sublista: true,
        campos: `
                            <span class="nsft-pv-field is-wide">
                                <span class="lbl">{{clase}}</span>
                                <span class="nsft-pv-mslist">
                                    <span class="nsft-pv-msrow is-sel"><b>{{pvCats}}</b><em>{{pvCats}}</em></span>
                                    <span class="nsft-pv-msrow is-n1"><b>{{pvGrupo}} A</b><em>{{pvCats}} : {{pvGrupo}} A</em></span>
                                    <span class="nsft-pv-msrow is-n2"><b>{{pvTipoN}} A1</b><em>{{pvCats}} : {{pvGrupo}} A : {{pvTipoN}} A1</em></span>
                                    <span class="nsft-pv-msrow is-n2"><b>{{pvTipoN}} A2</b><em>{{pvCats}} : {{pvGrupo}} A : {{pvTipoN}} A2</em></span>
                                    <span class="nsft-pv-msrow is-n1"><b>{{pvGrupo}} B</b><em>{{pvCats}} : {{pvGrupo}} B</em></span>
                                    <span class="nsft-pv-msrow is-n2"><b>{{pvTipoN}} B1</b><em>{{pvCats}} : {{pvGrupo}} B : {{pvTipoN}} B1</em></span>
                                </span>
                            </span>
                            <span class="nsft-pv-field"><span class="lbl">{{id}}</span><span class="val nsft-pv-mono">1042</span></span>
                            <span class="nsft-pv-field"><span class="lbl">{{estado}}</span><span class="val">{{pvActivo}}</span></span>`,
        extra: floatLay('&#9776;')
    });

    P.enableMultiselectCounterBeta = ventanaNS({
        clase: 'nsft-pv-lay is-mscount',
        sublista: true,
        campos: `
                            <span class="nsft-pv-field is-wide">
                                <span class="lbl">{{subsid}}<span class="nsft-pv-mscount nsft-pv-destello">1 / 3</span></span>
                                <span class="nsft-pv-mslist">
                                    <span class="nsft-pv-msrow is-sel"><b>{{pvCoSa}}</b></span>
                                    <span class="nsft-pv-msrow is-n1"><b>{{pvNorte}}</b></span>
                                    <span class="nsft-pv-msrow is-n1"><b>{{pvSur}}</b></span>
                                </span>
                                <span class="nsft-pv-check"><i class="is-on"></i>{{incluirHijos}}</span>
                            </span>
                            <span class="nsft-pv-field"><span class="lbl">{{id}}</span><span class="val nsft-pv-mono">1042</span></span>
                            <span class="nsft-pv-field"><span class="lbl">{{estado}}</span><span class="val">{{pvActivo}}</span></span>`,
        extra: floatLay('&#8721;')
    });

    P.enableMaxlengthCounterBeta = ventanaNS({
        clase: 'nsft-pv-lay is-maxlen',
        campos: `
                            <span class="nsft-pv-field"><span class="lbl">{{name}}</span>
                                <span class="nsft-pv-mlrow">
                                    <span class="nsft-pv-input nsft-pv-mlfield">Demo Record</span>
                                    <span class="nsft-pv-mlc">11 / 60</span>
                                </span></span>
                            <span class="nsft-pv-field"><span class="lbl">{{descripcion}}</span>
                                <span class="nsft-pv-mlrow">
                                    <span class="nsft-pv-input nsft-pv-mlfield">{{pvMonthCount}}</span>
                                    <span class="nsft-pv-mlc is-cerca">54 / 60</span>
                                </span></span>
                            <span class="nsft-pv-field"><span class="lbl">{{title}}</span>
                                <span class="nsft-pv-mlrow">
                                    <span class="nsft-pv-input nsft-pv-mlfield">{{pvStockAdj}}</span>
                                    <span class="nsft-pv-mlc is-tope">60 / 60</span>
                                </span></span>
                            <span class="nsft-pv-field"><span class="lbl">{{id}}</span>
                                <span class="nsft-pv-mlrow"><span class="nsft-pv-input nsft-pv-mlfield nsft-pv-mono">1042</span></span></span>`,
        sublista: true,
        extra: floatLay('&#8942;')
    });

    P.enableDateFormatHint = ventanaNS({
        clase: 'nsft-pv-lay is-datefmt',
        campos: `
                            <span class="nsft-pv-field"><span class="lbl">{{date}}</span>
                                <span class="nsft-pv-input nsft-pv-mono">16/11/2026</span></span>
                            <span class="nsft-pv-field"><span class="lbl">{{id}}</span>
                                <span class="nsft-pv-input nsft-pv-mono">1042</span></span>
                            <span class="nsft-pv-field"><span class="lbl">{{startDate}}</span>
                                <span class="nsft-pv-input"><span class="nsft-pv-dfhint">DD/MM/YYYY</span></span></span>
                            <span class="nsft-pv-field"><span class="lbl">{{endDate}}</span>
                                <span class="nsft-pv-input"><span class="nsft-pv-dfhint">DD/MM/YYYY</span></span></span>`,
        sublista: true,
        extra: floatLay('&#128197;')
    });

    P.enableShiftRangeSelect = ventanaNS({
        clase: 'nsft-pv-sl is-shiftsel',
        cuerpo: `
                    <div class="nsft-pv-body nsft-pv-stack">
                        <div class="nsft-pv-title">SO10482</div>
                    </div>
                    <div class="nsft-pv-subtabs">
                        <span class="is-on">{{tabLines}}</span>
                        <span>{{tabNotes}}</span>
                        <span>{{tabFiles}}</span>
                    </div>
                    <div class="nsft-pv-subbar">
                        <span class="nsft-pv-btn is-ghost">{{custView}}</span>
                        <span class="nsft-pv-btn is-ghost">{{refresh}}</span>
                    </div>
                    <div class="nsft-pv-slscroll">
                        <table class="nsft-pv-table nsft-pv-sltable nsft-pv-sstable">
                            <tr><th>{{apply}}</th><th>{{invoice}}</th><th>{{date}}</th><th>{{total}}</th></tr>
                            <tr><td><span class="nsft-pv-ssbox is-pre"></span></td>
                                <td>INV20451</td><td class="nsft-pv-mono">02/11/2026</td><td class="nsft-pv-mono">12400.00</td></tr>
                            <tr><td><span class="nsft-pv-ssbox is-a">
                                    <span class="nsft-pv-tap is-ssa" aria-hidden="true"></span>
                                    <span class="nsft-pv-cursor is-ssa" aria-hidden="true">${PUNTERO}</span>
                                </span></td>
                                <td>INV20452</td><td class="nsft-pv-mono">05/11/2026</td><td class="nsft-pv-mono">8900.00</td></tr>
                            <tr><td><span class="nsft-pv-ssbox is-mid"></span></td>
                                <td>INV20453</td><td class="nsft-pv-mono">09/11/2026</td><td class="nsft-pv-mono">4105.80</td></tr>
                            <tr><td><span class="nsft-pv-ssbox is-mid"></span></td>
                                <td>INV20454</td><td class="nsft-pv-mono">13/11/2026</td><td class="nsft-pv-mono">2380.10</td></tr>
                            <tr><td><span class="nsft-pv-ssbox is-b">
                                    <span class="nsft-pv-sskey" aria-hidden="true">&#8679;</span>
                                    <span class="nsft-pv-tap is-ssb" aria-hidden="true"></span>
                                    <span class="nsft-pv-cursor is-ssb" aria-hidden="true">${PUNTERO}</span>
                                </span></td>
                                <td>INV20455</td><td class="nsft-pv-mono">16/11/2026</td><td class="nsft-pv-mono">1042.00</td></tr>
                        </table>
                    </div>`
    });

    P.enableTextareaMinHeightBeta = ventanaNS({
        clase: 'nsft-pv-lay is-textarea',
        sublista: true,
        campos: `
                            <span class="nsft-pv-field is-wide"><span class="lbl">{{memo}}</span>
                                <span class="nsft-pv-ta">{{pvMemo}}</span>
                            </span>
                            <span class="nsft-pv-field"><span class="lbl">{{id}}</span><span class="val nsft-pv-mono">1042</span></span>
                            <span class="nsft-pv-field"><span class="lbl">{{date}}</span><span class="val nsft-pv-mono">16/11/2026</span></span>`,
        extra: floatLay('&#9634;')
    });

    P.enableBundleFilterLabelsBeta = ventanaNS({
        clase: 'nsft-pv-lay is-bundle',
        url: '1234567.app.netsuite.com/app/common/scripting/scriptlist.nl',
        cuerpo: `
                    <div class="nsft-pv-body nsft-pv-stack">
                        <div class="nsft-pv-title">{{scriptList}}</div>
                    </div>
                    <div class="nsft-pv-actions">
                        <span class="nsft-pv-btn">{{newScript}}</span>
                    </div>
                    <div class="nsft-pv-grupo">&#9662; {{filtros}}</div>
                    <div class="nsft-pv-body">
                        <span class="nsft-pv-bfrow2">
                            <span><em>{{tipo}}</em><span class="nsft-pv-input nsft-pv-ghbfield">Map/Reduce &#9662;</span></span>
                            <span><em>{{apiVer}}</em><span class="nsft-pv-input nsft-pv-ghbfield">2.1 &#9662;</span></span>
                            <span class="nsft-pv-bfcell"><em>{{fromBundle}}</em>
                                <span class="nsft-pv-input nsft-pv-ghbfield is-focus">&nbsp;&#9662;</span>
                                <span class="nsft-pv-bflist">
                                    <span class="nsft-pv-bfitem is-fijo">{{anyOne}}</span>
                                    <span class="nsft-pv-bfitem is-fijo">{{none}}</span>
                                    <span class="nsft-pv-bfitem"><b>{{pvSuiteInv}}</b><em>(481001)</em></span>
                                    <span class="nsft-pv-bfitem"><b>{{pvSuiteBuy}}</b><em>(481002)</em></span>
                                    <span class="nsft-pv-bfitem"><b>{{pvSuiteRep}}</b><em>(481003)</em></span>
                                    <span class="nsft-pv-bfitem"><b>{{pvSuiteInt}}</b><em>(481004)</em></span>
                                </span>
                            </span>
                        </span>
                    </div>
                    <div class="nsft-pv-bfbar">
                        <span class="nsft-pv-check"><i></i>{{showInactive}}</span>
                        <span class="nsft-pv-grow"></span>
                        <span class="nsft-pv-isptotal">{{total}}: 24</span>
                    </div>
                    <table class="nsft-pv-table nsft-pv-logtable">
                        <tr><th>{{edit}}</th><th>{{name}}</th><th>{{fromBundle}}</th><th>{{id}}</th><th>{{internalId}}</th></tr>
                        <tr><td class="lk">{{edit}}</td><td>{{pvScrMrSync}}</td><td class="nsft-pv-mono">481001</td><td class="nsft-pv-mono">customscript_demo_mr</td><td class="nsft-pv-mono">2160</td></tr>
                        <tr><td class="lk">{{edit}}</td><td>{{pvScrMrDep}}</td><td class="nsft-pv-mono">481001</td><td class="nsft-pv-mono">customscript_demo_mr_dep</td><td class="nsft-pv-mono">2493</td></tr>
                        <tr><td class="lk">{{edit}}</td><td>{{pvScrMrRec}}</td><td class="nsft-pv-mono">481003</td><td class="nsft-pv-mono">customscript_demo_mr_rec</td><td class="nsft-pv-mono">3430</td></tr>
                        <tr><td class="lk">{{edit}}</td><td>{{pvScrMrExp}}</td><td class="nsft-pv-mono">481004</td><td class="nsft-pv-mono">customscript_demo_mr_exp</td><td class="nsft-pv-mono">3533</td></tr>
                    </table>`,
        extra: floatLay('&#9707;')
    });

    P.enableHideGuidedLearning = ventanaNS({
        clase: 'nsft-pv-lay is-ogl',
        sublista: true,
        extra: `
            <div class="nsft-pv-ogl">
                <span class="nsft-pv-oglq">?</span>
                <span class="nsft-pv-ogldots"><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i></span>
            </div>` + floatLay('&#10005;')
    });


    function menuRolesNS(o) {
        const rol = (n, on, guarda) => `
                    <span class="nsft-pv-rrow${on ? ' is-on' : ''}${o.buscador ? (guarda ? ' nsft-pv-rf is-keep' : ' nsft-pv-rf') : ''}">
                        <span class="nsft-pv-grow">${n}</span>${on ? ICONO_VISTO : ''}</span>`;
        const cuenta = (n, id, prod) => `
                    <span class="nsft-pv-rrow is-acct${o.buscador ? ' nsft-pv-rf' : ''}">
                        <span class="nsft-pv-grow">${n}</span>
                        ${o.ids ? `<span class="nsft-pv-racct nsft-pv-destello">${ICONO_COPIAR}<span>${id}</span></span>` : ''}
                        ${prod
                            ? (o.ids ? `<span class="nsft-pv-renv is-pd nsft-pv-destello">PRD</span>` : '<span class="nsft-pv-renv is-hueco"></span>')
                            : `<span class="nsft-pv-renv${o.ids ? ' is-sb' : ''}">${o.ids
                                ? `<span class="nsft-pv-rswap"><span class="e1">SB</span><span class="e2">${id.slice(-3)}</span></span>`
                                : 'SB'}</span>`}
                    </span>`;
        return `
                <span class="nsft-pv-rmenu">
                    <span class="nsft-pv-rtop"><span class="nsft-pv-grow">{{logout}}</span>${ICONO_CANDADO}</span>
                    <span class="nsft-pv-rtop">{{myRoles}}</span>
                    ${o.buscador ? `
                    <span class="nsft-pv-rfind nsft-pv-destello">
                        <i>{{@rolefTitle}}</i>
                        <span class="fld"><span class="nsft-pv-type t10">{{pvVentas}}</span><span class="nsft-pv-caret"></span></span>
                    </span>` : ''}
                    <span class="nsft-pv-rgroup">{{pvCoSa}} &#8212; {{prodTag}}</span>
                    ${rol('{{role}}', true)}
                    ${rol('{{pvRolAcct}}')}
                    ${rol('{{pvRolSales}}', false, true)}
                    <span class="nsft-pv-rgroup">{{switchAccount}}</span>
                    ${cuenta('{{pvCoNorte}}', '4820157_SB1')}
                    ${cuenta('{{pvCoSur}}', '4820158_SB2')}
                    ${cuenta('{{pvCoSa}}', '1234567', true)}
                </span>`;
    }

    P.enableAutogenerateIds = ventanaNS({
        clase: 'nsft-pv-prod is-autoid',
        sublista: true,
        campos: `
                            <span class="nsft-pv-field"><span class="lbl">{{name}}</span>
                                <span class="nsft-pv-mlrow"><span class="nsft-pv-input nsft-pv-mlfield">{{pvCountRec}}</span></span></span>
                            <span class="nsft-pv-field"><span class="lbl">{{id}}</span>
                                <span class="nsft-pv-mlrow"><span class="nsft-pv-input nsft-pv-mlfield nsft-pv-mono nsft-pv-autoid">{{pvCountRecId}}</span></span></span>
                            <span class="nsft-pv-field is-wide">
                                <span class="nsft-pv-check nsft-pv-destello"><i class="is-on"></i>{{autoId}}</span></span>`,
        extra: floatLay('#')
    });

    P.enableCopyAccountId = ventanaNS({
        clase: 'nsft-pv-prod is-acctid',
        sublista: true,
        sublistaFilas: `
                        <tr><td>{{edit}}</td><td class="nsft-pv-mono">16/11/2026</td><td>{{user}}</td><td>{{pvTrailRev}}</td></tr>
                        <tr><td>{{edit}}</td><td class="nsft-pv-mono">02/11/2026</td><td>{{user}}</td><td>{{pvTrailNew}}</td></tr>
                        <tr><td>{{edit}}</td><td class="nsft-pv-mono">28/10/2026</td><td>Demo Admin</td><td>{{pvTrailImp}}</td></tr>`,
        perfil: menuRolesNS({ ids: true }),
        extra: floatLay(ICONO_COPIAR)
    });

    P.enableRoleFinder = ventanaNS({
        clase: 'nsft-pv-prod is-rolef',
        sublista: true,
        sublistaFilas: `
                        <tr><td>{{edit}}</td><td class="nsft-pv-mono">16/11/2026</td><td>{{user}}</td><td>{{pvTrailRev}}</td></tr>
                        <tr><td>{{edit}}</td><td class="nsft-pv-mono">02/11/2026</td><td>{{user}}</td><td>{{pvTrailNew}}</td></tr>
                        <tr><td>{{edit}}</td><td class="nsft-pv-mono">28/10/2026</td><td>Demo Admin</td><td>{{pvTrailImp}}</td></tr>`,
        perfil: menuRolesNS({ buscador: true }),
        extra: floatLay(ICONO_LUPA)
    });

    function loginNS(o) {
        return `
                    <div class="nsft-pv-login">
                        <span class="nsft-pv-lcard">
                            <span class="nsft-pv-llogos">
                                ${o.marca ? `<span class="nsft-pv-lmark nsft-pv-destello">DC</span>` : ''}
                                <span class="nsft-pv-llogo"><i>ORACLE</i>NetSuite</span>
                                ${o.marca ? `
                                <span class="nsft-pv-lbrand nsft-pv-destello">{{pvCoSa}}</span>
                                <span class="nsft-pv-lvisit nsft-pv-destello">{{@lcb_last_visit_label}} {{today}}</span>` : ''}
                            </span>
                            ${o.banner ? `<span class="nsft-pv-lbanner nsft-pv-destello">{{@lsi_badge_sandbox}} 1</span>` : ''}
                            <span class="nsft-pv-ltitle">{{login}}</span>
                            <span class="nsft-pv-lfield"><i>{{email}}</i><b>{{pvMail}}</b></span>
                            <span class="nsft-pv-lfield is-on"><i>{{pass}}</i><b>&bull;&bull;&bull;&bull;&bull;&bull;&bull;&bull;&bull;&bull;&bull;&bull;</b></span>
                            <span class="nsft-pv-check"><i></i>{{remember}}</span>
                            <span class="nsft-pv-lbtn">${ICONO_CANDADO}{{login}}</span>
                            <span class="nsft-pv-lbtn is-2">${ICONO_CANDADO}{{passkey}}</span>
                            <span class="nsft-pv-llink">{{forgot}}</span>
                        </span>
                    </div>`;
    }

    P.enableLoginCompanyBrandingBeta = ventanaNS({
        clase: 'nsft-pv-prod is-brand',
        sinCabecera: true,
        url: '1234567.app.netsuite.com/app/login/secure/enterpriselogin.nl',
        cuerpo: loginNS({ marca: true }),
        extra: floatLay('&#9679;')
    });

    P.enableLoginSandboxIndicatorBeta = ventanaNS({
        clase: 'nsft-pv-prod is-lsi',
        sinCabecera: true,
        url: '7654321-sb1.app.netsuite.com/app/login/secure/enterpriselogin.nl',
        cuerpo: loginNS({ banner: true }),
        extra: floatLay('&#9888;')
    });

    P.enableLogoutBlocker = ventanaNS({
        clase: 'nsft-pv-prod is-logout',
        sublista: true,
        extra: `<div class="nsft-pv-velo"><span>{{sessionOut}}</span></div>` + floatLay(ICONO_CANDADO)
    });

    P.enableLoggedoutRedirectBeta = ventanaNS({
        clase: 'nsft-pv-prod is-redir',
        sinCabecera: true,
        url: `<span class="nsft-pv-swap is-redir">
                    <span class="u1">www.netsuite.com/portal/home.shtml</span>
                    <span class="u2">1234567.app.netsuite.com/app/center/card.nl</span>
                </span>`,
        cuerpo: `
                    <div class="nsft-pv-redir">
                        <span class="nsft-pv-redir1">
                            <span class="nsft-pv-llogo"><i>ORACLE</i>NetSuite</span>
                            <span class="nsft-pv-redirtxt">{{publicLanding}}</span>
                        </span>
                        <span class="nsft-pv-redir2">
                            ${cabeceraNS({})}
                            <div class="nsft-pv-body">
                                <div class="nsft-pv-skel nsft-pv-cols"><i></i><i></i><i class="is-half"></i><i class="is-short"></i></div>
                            </div>
                        </span>
                    </div>`,
        extra: floatLay('&#8617;')
    });

    P.enableAutoRefresh = ventanaNS({
        clase: 'nsft-pv-prod is-autoref',
        url: '1234567.app.netsuite.com/app/bundler/bundleinstallstatus.nl',
        cuerpo: `
                    <div class="nsft-pv-body nsft-pv-stack">
                        <div class="nsft-pv-title">{{bundleStatus}}</div>
                    </div>
                    <div class="nsft-pv-logbar">
                        <span class="nsft-pv-btn is-ghost">{{refresh}}</span>
                        <span class="nsft-pv-lgsep"></span>
                        <span class="nsft-pv-lgpart is-suyo">
                            <span class="nsft-pv-toggle is-sm"><i></i>
                                <span class="nsft-pv-tap is-ar" aria-hidden="true"></span>
                                <span class="nsft-pv-cursor is-ar" aria-hidden="true">${PUNTERO}</span>
                            </span>
                            <span class="nsft-pv-tblabel">{{@autoRefresh}}</span>
                            <span class="nsft-pv-tbnum">30</span>
                            <span class="nsft-pv-tbunit">{{@secondsAbbr}}</span>
                            <span class="nsft-pv-ardot"></span>
                        </span>
                    </div>
                    <div class="nsft-pv-arwrap">
                        <table class="nsft-pv-table nsft-pv-logtable">
                            <tr><th>{{name}}</th><th>{{id}}</th><th>{{date}}</th><th>{{estado}}</th></tr>
                            <tr><td>{{pvSuiteInv}}</td><td class="nsft-pv-mono">481001</td><td class="nsft-pv-mono">16/11/2026</td>
                                <td><span class="nsft-pv-arswap"><span class="a1">{{installing}}</span><span class="a2">{{installed}}</span></span></td></tr>
                            <tr><td>{{pvSuiteBuy}}</td><td class="nsft-pv-mono">481002</td><td class="nsft-pv-mono">16/11/2026</td>
                                <td><span class="nsft-pv-arswap is-2"><span class="a1">{{installing}}</span><span class="a2">{{installed}}</span></span></td></tr>
                            <tr><td>{{pvSuiteRep}}</td><td class="nsft-pv-mono">481003</td><td class="nsft-pv-mono">15/11/2026</td><td>{{installed}}</td></tr>
                        </table>
                        <span class="nsft-pv-arvelo"></span>
                    </div>`
    });

    P.enablePortletRefresher = ventanaNS({
        clase: 'nsft-pv-prod is-portlet',
        cuerpo: `
                    <div class="nsft-pv-body nsft-pv-stack">
                        <div class="nsft-pv-title">{{home}}</div>
                    </div>
                    <div class="nsft-pv-portlets">
                        <span class="nsft-pv-portlet">
                            <span class="h">{{pvPortRem}}</span>
                            <span class="n"><span class="nsft-pv-arswap"><span class="a1">3</span><span class="a2">5</span></span></span>
                            <span class="s">{{pendientes}}</span>
                            <span class="nsft-pv-pvelo"></span>
                        </span>
                        <span class="nsft-pv-portlet">
                            <span class="h">{{pvPortKpi}}</span>
                            <span class="n"><span class="nsft-pv-arswap"><span class="a1">18 402</span><span class="a2">19 044</span></span></span>
                            <span class="s">Demo &middot; Total</span>
                            <span class="nsft-pv-pvelo is-2"></span>
                        </span>
                        <span class="nsft-pv-portlet">
                            <span class="h">{{pvPortTask}}</span>
                            <span class="n"><span class="nsft-pv-arswap"><span class="a1">7</span><span class="a2">4</span></span></span>
                            <span class="s">{{pendientes}}</span>
                            <span class="nsft-pv-pvelo is-3"></span>
                        </span>
                    </div>`,
        extra: floatLay('&#8635;')
    });

    P.enableCodeFieldPrettier = ventanaNS({
        clase: 'nsft-pv-prod is-cfp',
        campos: `
                            <span class="nsft-pv-field"><span class="lbl">{{name}}</span><span class="val">{{pvCountQuery}}</span></span>
                            <span class="nsft-pv-field"><span class="lbl">{{id}}</span><span class="val nsft-pv-mono">1042</span></span>
                            <span class="nsft-pv-field is-wide"><span class="lbl nsft-pv-mono">custrecord_demo_query</span>
                                <span class="nsft-pv-cfpswap">
                                    <span class="raw nsft-pv-mono">select id, tranid from transaction where type = 'SalesOrd' and trandate &gt;= ?</span>
                                    <span class="pretty">
                                        <span class="nsft-pv-cfpbar">
                                            <span class="nsft-pv-grow nsft-pv-mono">SQL</span>${ICONO_COPIAR}${ICONO_BAJAR}
                                        </span>
                                        <span class="nsft-pv-code is-mini">
                                            <span class="ln"><i class="k">SELECT</i> <i class="f">id</i>, <i class="f">tranid</i></span>
                                            <span class="ln"><i class="k">FROM</i> transaction</span>
                                            <span class="ln"><i class="k">WHERE</i> type = <i class="s">'SalesOrd'</i></span>
                                            <span class="ln nsft-pv-ind"><i class="k">AND</i> trandate &gt;= ?</span>
                                        </span>
                                    </span>
                                </span>
                            </span>`,
        extra: floatLay(ICONO_CODIGO)
    });

    P.enableFormatCodeFields = ventanaNS({
        clase: 'nsft-pv-prod is-fcf',
        sublista: true,
        campos: `
                            <span class="nsft-pv-field is-wide"><span class="lbl">{{memo}}</span>
                                <span class="nsft-pv-fcfwrap">
                                    <span class="nsft-pv-fcfbtn">${ICONO_CODIGO} {{format}}
                                        <span class="nsft-pv-tap is-fcf" aria-hidden="true"></span>
                                        <span class="nsft-pv-cursor is-fcf" aria-hidden="true">${PUNTERO}</span>
                                    </span>
                                    <span class="nsft-pv-fcfswap">
                                        <span class="raw nsft-pv-mono">{"lineId":"1042","item":"Demo Item A","bin":"DEMO-A-01","qty":1,"ok":true}</span>
                                        <span class="pretty nsft-pv-mono nsft-pv-fcfpre">
                                            <span class="ln">{</span>
                                            <span class="ln nsft-pv-ind">"lineId": "1042",</span>
                                            <span class="ln nsft-pv-ind">"item": "Demo Item A",</span>
                                            <span class="ln nsft-pv-ind">"bin": "DEMO-A-01",</span>
                                            <span class="ln nsft-pv-ind">"qty": 1,</span>
                                            <span class="ln nsft-pv-ind">"ok": true</span>
                                            <span class="ln">}</span>
                                        </span>
                                    </span>
                                </span>
                            </span>
                            <span class="nsft-pv-field"><span class="lbl">{{id}}</span><span class="val nsft-pv-mono">1042</span></span>`
    });

    P.enableCustomizationFinder = ventanaNS({
        clase: 'nsft-pv-menuflow is-cfind',
        acciones: `
            <span class="nsft-pv-toolsbtn"><img class="nsft-pv-logomark" src="{{logo}}" alt=""> {{@menuTools}} &#9662;
                <span class="nsft-pv-menu">
                    <span class="nsft-pv-menu-item">&#9906; {{@enableCustomizationFinderLabel}}</span>
                </span>
                <span class="nsft-pv-tap is-cp" aria-hidden="true"></span>
                <span class="nsft-pv-cursor is-cp" aria-hidden="true">${PUNTERO}</span>
            </span>`,
        extra: `
            <div class="nsft-pv-modal is-cfind">
                <div class="nsft-pv-cfhead">
                    <span>&#9906; {{@enableCustomizationFinderLabel}}</span>
                    <span class="nsft-pv-grow"></span>
                    <span class="nsft-pv-cfx">&#10005;</span>
                </div>
                <div class="nsft-pv-cfbody">
                    <div class="nsft-pv-cfbar">
                        <span class="nsft-pv-cfinput">
                            <span class="nsft-pv-mono">&#9906;</span>
                            <span class="nsft-pv-grow nsft-pv-mono nsft-pv-mute">
                                <span class="nsft-pv-type is-cf">Demo</span><span class="nsft-pv-caret"></span>
                            </span>
                        </span>
                        <span class="nsft-pv-cfgo">{{@cfind_search}}</span>
                        <span class="nsft-pv-cfexp">&#8615; {{@cfind_export}}</span>
                    </div>
                    <div class="nsft-pv-cftypes">
                        <span class="is-on">{{@cfind_t_script}}</span>
                        <span>{{@cfind_t_wf}}</span>
                        <span>{{@cfind_t_rec}}</span>
                        <span>{{@cfind_t_field}}</span>
                        <span>{{@cfind_t_ss}}</span>
                        <span>{{@cfind_t_pdf}}</span>
                        <span>{{@cfind_t_file}}</span>
                        <span>{{@cfind_t_deploy}}</span>
                        <span>{{@cfind_t_list}}</span>
                    </div>
                    <table class="nsft-pv-table nsft-pv-cftable">
                        <tr>
                            <th>{{@cfind_col_name}}</th><th>{{@cfind_col_kind}}</th>
                            <th>{{@cfind_col_sid}}</th><th>{{@cfind_col_status}}</th>
                        </tr>
                        <tr>
                            <td>{{pvScrUeDoc}}</td><td class="nsft-pv-mono">USEREVENT</td>
                            <td class="nsft-pv-mono">customscript_demo_1</td><td>{{pvActivo}}</td>
                        </tr>
                        <tr>
                            <td>{{pvScrMrSync}}</td><td class="nsft-pv-mono">MAPREDUCE</td>
                            <td class="nsft-pv-mono">customscript_demo_2</td><td>{{pvActivo}}</td>
                        </tr>
                        <tr>
                            <td>{{pvScrSl}}</td><td class="nsft-pv-mono">SUITELET</td>
                            <td class="nsft-pv-mono">customscript_demo_3</td><td>{{pvActivo}}</td>
                        </tr>
                    </table>
                    <div class="nsft-pv-cffoot">
                        <span class="nsft-pv-cfdot"></span>
                        <span class="nsft-pv-grow"></span>
                        <span class="nsft-pv-cfhints">{{@cfind_hints}}</span>
                    </div>
                </div>
            </div>`
    });

    function consolaNS(conIA, desdeMenu) {
        const cuerpo = `
                <div class="nsft-pv-page">
                    <div class="nsft-pv-runner is-solo">
                        <div class="nsft-pv-main">
                            <div class="nsft-pv-code is-light">
                                <div><span class="ln">1</span><span class="k">const</span> rec = record.<span class="f">load</span>({</div>
                                <div><span class="ln">2</span>&nbsp;&nbsp;type: <span class="s">'customer'</span>,</div>
                                <div><span class="ln">3</span>&nbsp;&nbsp;id: <span class="n">1042</span></div>
                                <div><span class="ln">4</span>});</div>
                                <div><span class="ln">5</span></div>
                                <div><span class="ln">6</span>rec.<span class="f">getValue</span>(<span class="s">'companyname'</span>)</div>
                            </div>
                            <div>
                                <div class="nsft-pv-restabs">
                                    <span class="is-on">{{@ssc_tab_output}}</span>
                                    <span>{{@sql_tab_logs}}</span>
                                </div>
                                <div class="nsft-pv-toolbar">
                                    <span class="nsft-pv-input nsft-pv-grow nsft-pv-tiny">&#9906;</span>
                                    <span class="nsft-pv-chip">{{@copy}}</span>
                                    <span class="nsft-pv-chip">{{@download}}</span>
                                </div>
                                <div class="nsft-pv-empty nsft-pv-mono">"Demo Co. S.A."</div>
                                <div class="nsft-pv-resfoot">
                                    <span class="nsft-pv-grow nsft-pv-mono">{{@ssc_out_ret}}</span>
                                    <span class="nsft-pv-mono">18 ms</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>`;

        const ventana = `
        <div class="${desdeMenu ? 'nsft-pv-sqlwin' : 'nsft-pv-win'}">
            <div class="nsft-pv-bar">
                <span class="nsft-pv-mono nsft-pv-tiny">JS</span>
                <span class="nsft-pv-grow nsft-pv-tiny">NetSuite Full Tools</span>
                <span class="nsft-pv-bar-tail">&#9472; &#9723; &#10005;</span>
            </div>
            <div class="nsft-pv-menubar">
                <span>{{@sql_menu_file}}</span><span>{{@sql_menu_edit}}</span>
                <span>{{@sql_menu_run}}</span><span>{{@sql_menu_view}}</span><span>{{@sql_menu_help}}</span>
            </div>
            <div class="nsft-pv-toolbar">
                <span class="nsft-pv-chip is-run">&#9654; {{@ssc_run}}${conIA ? '' : `
                    <span class="nsft-pv-tap is-sscrun" aria-hidden="true"></span>
                    <span class="nsft-pv-cursor is-sscrun" aria-hidden="true">${PUNTERO}</span>`}
                </span>
                <span class="nsft-pv-chip">{{@sql_submenu_format}}</span>
                <span class="nsft-pv-chip">{{@ssc_load_tab_title}}</span>
                <span class="nsft-pv-chip is-ai${conIA ? ' nsft-pv-hot' : ''}">&#10022; {{ia}}${conIA ? CURSOR_IA : ''}</span>
                <span class="nsft-pv-grow"></span>
                <span class="nsft-pv-chip">&#9707;</span>
            </div>
            <div class="nsft-pv-qtabs">
                <span class="nsft-pv-qtab">{{@sql_tab_default_title}} 1 &#10005;</span>
                <span class="nsft-pv-qtab is-on">{{@ssc_load_tab_title}} &#10005;</span>
                <span class="nsft-pv-qtab is-plus">+</span>
            </div>
            <div class="${conIA ? 'nsft-pv-dock is-anim' : ''}">${cuerpo}${conIA ? PANEL_IA : ''}</div>
            <div class="nsft-pv-statusbar">
                <span class="is-ok nsft-pv-grow">&#9679;</span>
                <span>6</span><span>1:1</span>
            </div>
        </div>`;

        if (!desdeMenu) return ventana;

        return ventanaNS({
            clase: 'nsft-pv-sqlopen nsft-pv-menuflow',
            sublista: true,
            acciones: `
            <span class="nsft-pv-toolsbtn"><img class="nsft-pv-logomark" src="{{logo}}" alt=""> {{@menuTools}} &#9662;
                <span class="nsft-pv-menu">
                    <span class="nsft-pv-menu-item">&#9002;_ {{@enableSuiteScriptConsoleLabel}}</span>
                </span>
                <span class="nsft-pv-tap is-cp" aria-hidden="true"></span>
                <span class="nsft-pv-cursor is-cp" aria-hidden="true">${PUNTERO}</span>
            </span>`,
            extra: ventana
        });
    }
    P.enableSuiteScriptConsole = consolaNS(false, true);

    P.enableAdvancedEditor = ventanaNS({
        clase: 'nsft-pv-menuflow nsft-pv-adv',
        pestanas: `
                <span class="nsft-pv-tab is-flt1">{{pvActRecs}}</span>
                <span class="nsft-pv-tab is-flt2">demo_ue_documentos.js</span>`,
        url: `<span class="nsft-pv-swap is-adv">
                    <span class="u1">1234567.app.netsuite.com/app/common/custom/custrecordentry.nl</span>
                    <span class="u2">1234567.app.netsuite.com/app/common/record/edittextmediaitem.nl?id=482&amp;e=T</span>
                </span>`,
        acciones: `
            <span class="nsft-pv-toolsbtn"><img class="nsft-pv-logomark" src="{{logo}}" alt=""> {{@menuTools}} &#9662;
                <span class="nsft-pv-menu">
                    <span class="nsft-pv-menu-item">${ICONO_CODIGO} {{@adv_menu_open}}</span>
                </span>
                <span class="nsft-pv-tap is-cp" aria-hidden="true"></span>
                <span class="nsft-pv-cursor is-cp" aria-hidden="true">${PUNTERO}</span>
            </span>`,
        destinoSinCabecera: true,
        destino: editorAvanzadoNS()
    });

    P.enableCommandPalette = ventanaNS({
        clase: 'nsft-pv-cp',
        acciones: `
            <span class="nsft-pv-toolsbtn"><img class="nsft-pv-logomark" src="{{logo}}" alt=""> {{@menuTools}} &#9662;
                <span class="nsft-pv-menu">
                    <span class="nsft-pv-menu-item">&#8984; {{@enableCommandPaletteLabel}}</span>
                </span>
                <span class="nsft-pv-tap is-cp" aria-hidden="true"></span>
                <span class="nsft-pv-cursor is-cp" aria-hidden="true">
                    <svg viewBox="0 0 24 24" fill="#fff" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round">
                        <path d="M5 3l14 8.5-6.2 1.3L10 20z"/>
                    </svg>
                </span>
            </span>`,
        extra: `
            <div class="nsft-pv-modal is-palette">
                <div class="nsft-pv-bar">
                    <span class="nsft-pv-mono">&#9906;</span>
                    <span class="nsft-pv-grow nsft-pv-mono nsft-pv-mute">
                        <span class="nsft-pv-type t5">sales</span><span class="nsft-pv-caret"></span>
                    </span>
                    <span class="nsft-pv-keys">
                        <span class="nsft-pv-key">Ctrl</span><span class="nsft-pv-key">&#8679;</span><span class="nsft-pv-key">Space</span>
                    </span>
                </div>
                <div class="nsft-pv-modal-body">
                    <span class="nsft-pv-palette-row is-on">
                        <span class="nsft-pv-mono nsft-pv-mute">&#9656;</span>
                        <span class="nsft-pv-grow">Sales Order</span>
                        <span class="nsft-pv-key">&#8629;</span>
                    </span>
                    <span class="nsft-pv-palette-row">
                        <span class="nsft-pv-mono nsft-pv-mute">&#9656;</span>
                        <span class="nsft-pv-grow">SuiteQL Runner</span>
                    </span>
                    <span class="nsft-pv-palette-row">
                        <span class="nsft-pv-mono nsft-pv-mute">&#9656;</span>
                        <span class="nsft-pv-grow nsft-pv-mute">customrecord_demo</span>
                    </span>
                </div>
            </div>`
    });

    P.enableShortcutsCheatsheet = ventanaNS({
        clase: 'nsft-pv-cs',
        acciones: `
            <span class="nsft-pv-toolsbtn"><img class="nsft-pv-logomark" src="{{logo}}" alt=""> {{@menuTools}} &#9662;
                <span class="nsft-pv-menu">
                    <span class="nsft-pv-menu-item">&#9000; {{@enableShortcutsCheatsheetLabel}}</span>
                </span>
                <span class="nsft-pv-tap is-cp" aria-hidden="true"></span>
                <span class="nsft-pv-cursor is-cp" aria-hidden="true">
                    <svg viewBox="0 0 24 24" fill="#fff" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round">
                        <path d="M5 3l14 8.5-6.2 1.3L10 20z"/>
                    </svg>
                </span>
            </span>`,
        extra: `
            <div class="nsft-pv-modal is-sheet">
                <div class="nsft-pv-bar">
                    <span class="nsft-pv-grow nsft-pv-tiny">{{@cheatsheet_title}}</span>
                    <span class="nsft-pv-bar-tail">&#8635; &#10005;</span>
                </div>
                <div class="nsft-pv-modal-body">
                    <span class="nsft-pv-input nsft-pv-tiny">&#9906;</span>
                    <span class="nsft-pv-cs-group">{{@cheatsheet_group_global}}</span>
                    <span class="nsft-pv-cs-row">
                        <span class="nsft-pv-grow">{{@enableAiAssistantLabel}}</span>
                        <span class="nsft-pv-keys"><span class="nsft-pv-key">Shift</span><span class="nsft-pv-key">Alt</span><span class="nsft-pv-key">A</span></span>
                    </span>
                    <span class="nsft-pv-cs-row">
                        <span class="nsft-pv-grow">{{@enableRecordObjectLabel}}</span>
                        <span class="nsft-pv-keys"><span class="nsft-pv-key">Shift</span><span class="nsft-pv-key">Alt</span><span class="nsft-pv-key">O</span></span>
                    </span>
                    <span class="nsft-pv-cs-group">{{@cheatsheet_group_sql}}</span>
                    <span class="nsft-pv-cs-row">
                        <span class="nsft-pv-grow">{{@enableSuiteQLRunnerLabel}}</span>
                        <span class="nsft-pv-keys"><span class="nsft-pv-key">Ctrl</span><span class="nsft-pv-key">&#8629;</span></span>
                    </span>
                </div>
            </div>`
    });

    P.enableProductionBanner = ventanaNS({
        clase: 'nsft-pv-pb is-abajo',
        sublista: true,
        extra: `
            <div class="nsft-pv-pbbar is-b">
                <span class="nsft-pv-grow">&#9888; {{@productionBannerText}}</span>
                <span class="nsft-pv-pbx">&#10005;</span>
            </div>`
    });

    P.productionBannerPosition = ventanaNS({
        clase: 'nsft-pv-pb is-tres',
        sublista: true,
        entorno: `<span class="nsft-pv-pbchip">{{@productionBannerChip}}</span>`,
        extra: `
            <div class="nsft-pv-pbbar is-b">
                <span class="nsft-pv-grow">&#9888; {{@productionBannerText}}</span>
                <span class="nsft-pv-pbx">&#10005;</span>
            </div>
            <div class="nsft-pv-pbbar is-t">
                <span class="nsft-pv-grow">&#9888; {{@productionBannerText}}</span>
                <span class="nsft-pv-pbx">&#10005;</span>
            </div>
            <div class="nsft-pv-float is-pbsw">
                <div class="nsft-pv-float-title" data-pv-label></div>
                <div class="nsft-pv-float-row">
                    <span class="nsft-pv-optwrap">
                        <span class="nsft-pv-opt p1">{{@productionBannerPosBottom}}</span>
                        <span class="nsft-pv-opt p2">{{@productionBannerPosTop}}</span>
                        <span class="nsft-pv-opt p3">{{@productionBannerPosHeader}}</span>
                    </span>
                    <span class="nsft-pv-select">&#9662;</span>
                </div>
            </div>`
    });

    P.enableEnvBadge = `
        <div class="nsft-pv-win nsft-pv-eb">
            <div class="nsft-pv-tabs is-gt">
                <span class="nsft-pv-dots">
                    <span class="nsft-pv-dot is-red"></span><span class="nsft-pv-dot is-amber"></span><span class="nsft-pv-dot is-green"></span>
                </span>
                <span class="nsft-pv-tab">NetSuite</span>
            </div>
            <div class="nsft-pv-chrome">
                <span class="nsft-pv-url">
                    <span class="nsft-pv-swap">
                        <span class="e1">1234567.app.netsuite.com/app/center/card.nl</span>
                        <span class="e2">1234567-sb1.app.netsuite.com/app/center/card.nl</span>
                    </span>
                </span>
                <span class="nsft-pv-exts">
                    <span class="nsft-pv-ext">&#9734;</span>
                    <span class="nsft-pv-icon is-sm is-plain">
                        <img class="nsft-pv-appicon" src="{{icono}}" alt="">
                        <span class="nsft-pv-swap nsft-pv-badgeslot">
                            <span class="nsft-pv-badge is-chrome e1">PRD</span>
                            <span class="nsft-pv-badge is-chrome is-sb e2">SB1</span>
                        </span>
                    </span>
                    <span class="nsft-pv-ext">&#10696;</span>
                    <span class="nsft-pv-avatar">M</span>
                </span>
            </div>
            <div class="nsft-pv-body">
                <div class="nsft-pv-skel nsft-pv-cols">
                    <i></i><i></i><i class="is-half"></i><i class="is-short"></i>
                </div>
            </div>
        </div>`;

    P.enableGroupedTabs = `
        <div class="nsft-pv-win">
            <div class="nsft-pv-tabs is-gt">
                <span class="nsft-pv-dots">
                    <span class="nsft-pv-dot is-red"></span><span class="nsft-pv-dot is-amber"></span><span class="nsft-pv-dot is-green"></span>
                </span>
                <span class="nsft-pv-group">
                    <span class="nsft-pv-glabel is-c">1234567 PRD</span>
                    <span class="nsft-pv-tab">SO10482</span>
                </span>
                <span class="nsft-pv-group is-target">
                    <span class="nsft-pv-glabel is-b">7654321 SB1</span>
                    <span class="nsft-pv-tab">Script</span>
                    <span class="nsft-pv-tab is-new">custrecord</span>
                </span>
            </div>
            <div class="nsft-pv-chrome">
                <span class="nsft-pv-url">7654321-sb1.app.netsuite.com/app/common/custom/custrecordentry.nl</span>
            </div>
            <div class="nsft-pv-body">
                <div class="nsft-pv-skel nsft-pv-cols">
                    <i></i><i></i><i class="is-half"></i><i class="is-short"></i><i></i><i class="is-half"></i>
                </div>
            </div>
        </div>`;

    P.groupedTabsAutoCollapse = `
        <div class="nsft-pv-win">
            <div class="nsft-pv-tabs is-gt">
                <span class="nsft-pv-dots">
                    <span class="nsft-pv-dot is-red"></span><span class="nsft-pv-dot is-amber"></span><span class="nsft-pv-dot is-green"></span>
                </span>
                <span class="nsft-pv-group">
                    <span class="nsft-pv-glabel is-c">1234567 PRD</span>
                    <span class="nsft-pv-tab is-fold">SO10482</span>
                    <span class="nsft-pv-tab is-fold">Customer</span>
                </span>
                <span class="nsft-pv-group">
                    <span class="nsft-pv-glabel is-b">7654321 SB1</span>
                    <span class="nsft-pv-tab is-focus">Script
                        <span class="nsft-pv-tap is-fold" aria-hidden="true"></span>
                        <span class="nsft-pv-cursor is-fold" aria-hidden="true">
                            <svg viewBox="0 0 24 24" fill="#fff" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round">
                                <path d="M5 3l14 8.5-6.2 1.3L10 20z"/>
                            </svg>
                        </span>
                    </span>
                    <span class="nsft-pv-tab">Log</span>
                </span>
            </div>
            <div class="nsft-pv-chrome">
                <span class="nsft-pv-url">7654321-sb1.app.netsuite.com/app/common/scripting/script.nl</span>
            </div>
            <div class="nsft-pv-body">
                <div class="nsft-pv-skel nsft-pv-cols">
                    <i></i><i></i><i class="is-half"></i><i class="is-short"></i>
                </div>
            </div>
        </div>`;

    P.groupedTabsAutoUseCompanyName = `
        <div class="nsft-pv-win nsft-pv-co">
            <div class="nsft-pv-tabs is-gt">
                <span class="nsft-pv-dots">
                    <span class="nsft-pv-dot is-red"></span><span class="nsft-pv-dot is-amber"></span><span class="nsft-pv-dot is-green"></span>
                </span>
                <span class="nsft-pv-group">
                    <span class="nsft-pv-gswap">
                        <span class="nsft-pv-glabel is-c n1">1234567 PRD</span>
                        <span class="nsft-pv-glabel is-c n2">DEMO CO PRD</span>
                    </span>
                    <span class="nsft-pv-tab">SO10482</span>
                </span>
                <span class="nsft-pv-group">
                    <span class="nsft-pv-gswap">
                        <span class="nsft-pv-glabel is-b n1">7654321 SB1</span>
                        <span class="nsft-pv-glabel is-b n2">{{pvOtraCo}}</span>
                    </span>
                    <span class="nsft-pv-tab">Script</span>
                </span>
            </div>
            <div class="nsft-pv-chrome">
                <span class="nsft-pv-url">7654321-sb1.app.netsuite.com/app/common/custom/custrecordentry.nl</span>
            </div>
            <div class="nsft-pv-body">
                <div class="nsft-pv-skel nsft-pv-cols">
                    <i></i><i></i><i class="is-half"></i><i class="is-short"></i>
                </div>
            </div>
            <div class="nsft-pv-float">
                <span class="nsft-pv-float-title" data-pv-label></span>
                <div class="nsft-pv-float-row">
                    <span class="nsft-pv-grow nsft-pv-mono nsft-pv-tiny">ID / CO</span>
                    <span class="nsft-pv-toggle"><i></i>
                        <span class="nsft-pv-tap is-co" aria-hidden="true"></span>
                        <span class="nsft-pv-cursor is-co" aria-hidden="true">
                            <svg viewBox="0 0 24 24" fill="#fff" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round">
                                <path d="M5 3l14 8.5-6.2 1.3L10 20z"/>
                            </svg>
                        </span>
                    </span>
                </div>
            </div>
        </div>`;

    P.enableGroupedTabsAutomatic = `
        <div class="nsft-pv-win">
            <div class="nsft-pv-bar">
                <span class="nsft-pv-mono nsft-pv-tiny">NSFT</span>
                <span class="nsft-pv-grow nsft-pv-tiny">{{@gt_config_title}}</span>
                <span class="nsft-pv-bar-tail">&#10005;</span>
            </div>
            <div class="nsft-pv-cfg">
                <div class="nsft-pv-cfg-card">
                    <span class="nsft-pv-cfg-h">{{@gt_add_new_title}}</span>
                    <span class="nsft-pv-cfg-lbl">{{@gt_account_label}}</span>
                    <span class="nsft-pv-input nsft-pv-tiny nsft-pv-mono">
                        <span class="nsft-pv-type t3">7654321_SB1</span><span class="nsft-pv-caret"></span>
                    </span>
                    <span class="nsft-pv-cfg-lbl">{{@gt_visible_label_label}}</span>
                    <span class="nsft-pv-input nsft-pv-tiny">
                        <span class="nsft-pv-type t4">Demo SB1</span><span class="nsft-pv-caret"></span>
                    </span>
                    <span class="nsft-pv-cfg-lbl">{{@gt_color_label}}</span>
                    <span class="nsft-pv-swatch-row">
                        <span class="nsft-pv-swatch-dot c1"></span>
                        <span class="nsft-pv-swatch-dot c2"></span>
                        <span class="nsft-pv-swatch-dot c3 is-pick"></span>
                        <span class="nsft-pv-swatch-dot c4"></span>
                        <span class="nsft-pv-swatch-dot c5"></span>
                        <span class="nsft-pv-swatch-dot c6"></span>
                    </span>
                    <span class="nsft-pv-btn is-wide">+ {{@gt_add_btn}}
                        <span class="nsft-pv-tap is-ga" aria-hidden="true"></span>
                        <span class="nsft-pv-cursor is-ga" aria-hidden="true">
                            <svg viewBox="0 0 24 24" fill="#fff" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round">
                                <path d="M5 3l14 8.5-6.2 1.3L10 20z"/>
                            </svg>
                        </span>
                    </span>
                </div>
                <div class="nsft-pv-cfg-card">
                    <span class="nsft-pv-cfg-h">{{@gt_current_groups_title}}</span>
                    <span class="nsft-pv-cfg-slot">
                        <span class="nsft-pv-cfg-empty nsft-pv-empty">{{@gt_no_groups}}</span>
                        <span class="nsft-pv-cfg-row">
                            <span class="nsft-pv-glabel is-b">7654321 SB1</span>
                            <span class="nsft-pv-mono nsft-pv-tiny nsft-pv-mute nsft-pv-grow">7654321_SB1</span>
                            <span class="nsft-pv-mono nsft-pv-tiny nsft-pv-mute">&#9998; &#10005;</span>
                        </span>
                    </span>
                </div>
            </div>
        </div>`;

    P.enableDarkMode = ventanaNS({
        clase: 'nsft-pv-dm',
        sublista: true,
        extra: `
            <div class="nsft-pv-float">
                <span class="nsft-pv-float-title" data-pv-label></span>
                <div class="nsft-pv-float-row">
                    <span class="nsft-pv-grow">&#9789;</span>
                    <span class="nsft-pv-toggle"><i></i>
                        <span class="nsft-pv-tap is-dm" aria-hidden="true"></span>
                        <span class="nsft-pv-cursor is-dm" aria-hidden="true">
                            <svg viewBox="0 0 24 24" fill="#fff" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round">
                                <path d="M5 3l14 8.5-6.2 1.3L10 20z"/>
                            </svg>
                        </span>
                    </span>
                </div>
            </div>`
    });

    P.darkModeScope = ventanaNS({
        clase: 'nsft-pv-dm-tools',
        sublista: true,
        modal: true,
        extra: `
            <div class="nsft-pv-float is-wide">
                <span class="nsft-pv-float-title" data-pv-label></span>
                <div class="nsft-pv-float-row">
                    <span class="nsft-pv-select nsft-pv-grow is-opts">
                        <span class="nsft-pv-optwrap">
                            <span class="nsft-pv-opt o1">{{@darkModeScopeAll}}</span>
                            <span class="nsft-pv-opt o2">{{@darkModeScopeNsft}}</span>
                        </span>
                        &#9662;
                        <span class="nsft-pv-tap is-sc" aria-hidden="true"></span>
                        <span class="nsft-pv-cursor is-sc" aria-hidden="true">
                            <svg viewBox="0 0 24 24" fill="#fff" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round">
                                <path d="M5 3l14 8.5-6.2 1.3L10 20z"/>
                            </svg>
                        </span>
                    </span>
                </div>
            </div>`
    });

    P.darkModeStyle = ventanaNS({
        clase: 'nsft-pv-dm-tone',
        sublista: true,
        modal: true,
        extra: `
            <div class="nsft-pv-float is-wide">
                <span class="nsft-pv-float-title" data-pv-label></span>
                <div class="nsft-pv-float-row">
                    <span class="nsft-pv-select nsft-pv-grow is-opts">
                        <span class="nsft-pv-optwrap">
                            <span class="nsft-pv-opt o1">{{@darkModeStyleGray}}</span>
                            <span class="nsft-pv-opt o2">{{@darkModeStyleBlack}}</span>
                        </span>
                        &#9662;
                        <span class="nsft-pv-tap is-sc" aria-hidden="true"></span>
                        <span class="nsft-pv-cursor is-sc" aria-hidden="true">
                            <svg viewBox="0 0 24 24" fill="#fff" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round">
                                <path d="M5 3l14 8.5-6.2 1.3L10 20z"/>
                            </svg>
                        </span>
                    </span>
                </div>
            </div>`
    });

    P.enableAiAssistant = `
        <div class="nsft-pv-win is-panel">
            <div class="nsft-pv-bar">
                <span class="nsft-pv-ai">&#10022;</span>
                <span class="nsft-pv-grow nsft-pv-tiny" data-pv-label></span>
                <span class="nsft-pv-badge is-rp">BETA</span>
                <span class="nsft-pv-bar-tail">&#9998; &#9881; ?</span>
            </div>
            <div class="nsft-pv-chat">
                <span class="nsft-pv-msg is-me m1">{{ask1}}</span>
                <span class="nsft-pv-msg is-ai m2">{{ans1}}</span>
                <span class="nsft-pv-ready">&#9679; {{ready}}</span>
                <span class="nsft-pv-msg is-me m3">{{ask2}}</span>
                <span class="nsft-pv-msg is-ai m4">{{ans2}}</span>
            </div>
            <div class="nsft-pv-body nsft-pv-flex">
                <span class="nsft-pv-input nsft-pv-grow nsft-pv-tiny">
                    <span class="nsft-pv-type t1">{{ask1}}</span><span class="nsft-pv-type t2">{{ask2}}</span><span class="nsft-pv-caret"></span>
                </span>
                <span class="nsft-pv-send">&#8594;</span>
            </div>
            <div class="nsft-pv-foot">
                <span class="nsft-pv-mono nsft-pv-grow">claude-opus-4-8 &#9662;</span>
                <span class="nsft-pv-mono">&#9776;</span>
            </div>
        </div>`;

    function traducir(html) {
        html = html.split('{{logo}}').join(LOGO);
        html = html.split('{{icono}}').join(ICONO);
        Object.keys(NS).forEach((token) => {
            html = html.split('{{' + token + '}}').join(NS[token]);
        });
        let corte = html.indexOf('{{@');
        while (corte !== -1) {
            const fin = html.indexOf('}}', corte);
            if (fin === -1) break;
            const crudo = html.slice(corte + 3, fin);
            const partes = crudo.split('|');
            const clave = partes[0];
            const subs = partes.slice(1);
            let texto = t(clave, subs.length ? subs : undefined) || clave;
            subs.forEach((sub) => {
                const valor = sub.charAt(0) === '@' ? (t(sub.slice(1)) || sub.slice(1)) : sub;
                texto = texto.split('{type}').join(valor);
            });
            html = html.slice(0, corte) + texto + html.slice(fin + 2);
            corte = html.indexOf('{{@');
        }
        return html;
    }


    const ICONO_CARPETA = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M3 7.5A1.5 1.5 0 0 1 4.5 6h4l2 2.5h7A1.5 1.5 0 0 1 19 10v7.5A1.5 1.5 0 0 1 17.5 19h-13A1.5 1.5 0 0 1 3 17.5z"/></svg>`;
    const ICONO_ARCHIVO = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M13 3H7a1.5 1.5 0 0 0-1.5 1.5v15A1.5 1.5 0 0 0 7 21h10a1.5 1.5 0 0 0 1.5-1.5V8.5z"/><path d="M13 3v5.5h5.5"/></svg>`;
    const ICONO_ENLACE = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M10.5 13.5a4 4 0 0 0 6 .5l2.5-2.5a4 4 0 0 0-5.7-5.7l-1.4 1.4"/><path d="M13.5 10.5a4 4 0 0 0-6-.5L5 12.5a4 4 0 0 0 5.7 5.7l1.4-1.4"/></svg>`;
    const ICONO_RUTA = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h6l1.5 2H20v8.5A1.5 1.5 0 0 1 18.5 19h-13A1.5 1.5 0 0 1 4 17.5z"/><path d="M8 13h8"/></svg>`;
    const ICONO_ETIQUETA = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"><path d="M4 11.5V5.5A1.5 1.5 0 0 1 5.5 4h6l8.5 8.5-6 6z"/><circle cx="8.5" cy="8.5" r="1.4" fill="currentColor" stroke="none"/></svg>`;

    const filaFC = (f) => `
                            <tr class="${f.clase || ''}">
                                <td class="lk">{{edit}}</td>
                                <td class="nsft-pv-fcid">${f.idExtra || ''}<span class="nsft-pv-mono">${f.id}</span></td>
                                <td class="nsft-pv-fcname">
                                    <span class="nsft-pv-fcnamerow">${f.nombreExtra || ''}<span class="nsft-pv-fcglifo">${f.carpeta ? ICONO_CARPETA : ICONO_ARCHIVO}</span><span class="lk">${f.nombre}</span></span>
                                    ${f.acciones || ''}
                                </td>
                                <td class="nsft-pv-mono">${f.tam}</td>
                                <td class="nsft-pv-mono">16/11/2026 12:56</td>
                                <td>${f.tipo || (f.carpeta ? '{{fcFolder}}' : '{{fcJs}}')}</td>
                                <td class="lk">{{fcDownload}}</td>
                            </tr>`;

    const ARBOL_FC = `
                        <div class="nsft-pv-fctree">
                            <span class="nsft-pv-fcnode">&#8862; SuiteApps</span>
                            <span class="nsft-pv-fcnode">&#8862; SuiteBundles</span>
                            <span class="nsft-pv-fcnode is-open">&#8863; SuiteScripts</span>
                            <span class="nsft-pv-fcnode is-hijo">{{pvFcUpd}}</span>
                            <span class="nsft-pv-fcnode is-hijo is-on">{{pvProyecto}}</span>
                            <span class="nsft-pv-fcnode is-nieto">demo_api</span>
                            <span class="nsft-pv-fcnode is-nieto">demo_core</span>
                            <span class="nsft-pv-fcnode is-hijo">Demo Layouts</span>
                            <span class="nsft-pv-fcnode is-hijo">{{pvFcTpl}}</span>
                            <span class="nsft-pv-fcnode is-hijo">demo_libs</span>
                        </div>`;

    function archivadorNS(o) {
        o = o || {};
        return `
                    <div class="nsft-pv-body nsft-pv-stack nsft-pv-bqhead">
                        <div class="nsft-pv-title">{{fcTitle}}</div>
                        <span class="nsft-pv-bqlinks">
                            <span class="lk">{{search}}</span>
                            <span class="lk">{{fcFolderSearch}}</span>
                            <span class="lk">{{fcApi21}}</span>
                        </span>
                    </div>
                    <div class="nsft-pv-actions">
                        <span class="nsft-pv-check"><i></i>{{showInactive}}</span>
                        <span class="nsft-pv-btn">{{fcAddFile}}</span>
                        <span class="nsft-pv-btn is-ghost">{{fcAddAdv}}</span>
                        <span class="nsft-pv-grow"></span>
                        <span class="nsft-pv-btn is-ghost">{{fcNewFolder}}</span>
                        <span class="nsft-pv-btn is-ghost">{{fcMoveFiles}}</span>
                    </div>
                    <div class="nsft-pv-fc">
                        ${ARBOL_FC}
                        <div class="nsft-pv-fclist">
                            <div class="nsft-pv-fchead">
                                <span class="nsft-pv-fcpath">SuiteScripts &gt; {{pvProyecto}}</span>
                                ${o.tituloExtra || ''}
                                <span class="nsft-pv-grow"></span>
                                <span class="nsft-pv-tiny nsft-pv-mute">{{total}}: 4</span>
                            </div>
                            <table class="nsft-pv-table nsft-pv-fctable">
                                <tr>
                                    <th>{{edit}}</th><th>{{internalId}}</th><th>{{name}} &#9650;</th>
                                    <th>{{fcSize}}</th><th>{{fcModified}}</th><th>{{tipo}}</th><th>{{fcDownload}}</th>
                                </tr>
                                ${o.filas}
                            </table>
                            ${o.velo || ''}
                        </div>
                    </div>`;
    }

    function filasFC(n, extra) {
        const base = [
            { id: '4021', nombre: 'demo_api', tam: '29.3 KB', carpeta: true },
            { id: '4022', nombre: 'demo_core', tam: '13.6 KB', carpeta: true },
            { id: '4031', nombre: 'demo_gateway.js', tam: '3.6 KB' },
            { id: '4032', nombre: '{{pvFileStyles}}', tam: '1.2 KB' }
        ];
        return base.map((f, i) => filaFC(i === n ? Object.assign({ clase: 'is-fila' }, f, extra) : f)).join('');
    }

    const dialogoNav = (o) => `
            <div class="nsft-pv-dlg">
                <div class="nsft-pv-dlg-org">1234567.app.netsuite.com {{says}}</div>
                <div class="nsft-pv-dlg-msg">${o.msg}</div>
                ${o.campo ? `<div class="nsft-pv-dlg-input">${o.campo}</div>` : ''}
                ${o.lista || ''}
                <div class="nsft-pv-dlg-btns">
                    <span class="nsft-pv-btn is-ghost">{{cancel}}</span>
                    <span class="nsft-pv-btn">{{ok}}</span>
                </div>
            </div>`;

    P.enableFileCabinetUtils = ventanaNS({
        clase: 'nsft-pv-fcu',
        url: '1234567.app.netsuite.com/app/common/media/mediaitemfolders.nl?folder=4020',
        cuerpo: archivadorNS({
            filas: filasFC(2, {
                idExtra: `<span class="nsft-pv-fcbtn is-id">${ICONO_COPIAR}
                                    <span class="nsft-pv-tap is-fc" aria-hidden="true"></span>
                                    <span class="nsft-pv-cursor is-fc" aria-hidden="true">${PUNTERO}</span>
                                </span>`
            })
        }),
        extra: `
            <div class="nsft-pv-toast">
                <span class="nsft-pv-toast-icon">&#10003;</span>
                <span class="nsft-pv-toast-text">
                    <span class="nsft-pv-tiny">{{@nsft_clipboard_copied}}</span>
                    <span class="nsft-pv-mono nsft-pv-tiny nsft-pv-mute">4031</span>
                </span>
            </div>`
    });

    P.enableFileCabinetCopyPathBeta = ventanaNS({
        clase: 'nsft-pv-fcp',
        url: '1234567.app.netsuite.com/app/common/media/mediaitemfolders.nl?folder=4020',
        cuerpo: archivadorNS({
            filas: filasFC(2, {
                nombreExtra: `<span class="nsft-pv-fcbtn">${ICONO_RUTA}
                                    <span class="nsft-pv-tap is-fc" aria-hidden="true"></span>
                                    <span class="nsft-pv-cursor is-fc" aria-hidden="true">${PUNTERO}</span>
                                </span>`
            })
        }),
        extra: `
            <div class="nsft-pv-toast is-ancho">
                <span class="nsft-pv-toast-icon">&#10003;</span>
                <span class="nsft-pv-toast-text">
                    <span class="nsft-pv-tiny">{{@nsft_clipboard_copied}}</span>
                    <span class="nsft-pv-mono nsft-pv-tiny nsft-pv-mute">/SuiteScripts/{{pvProyecto}}/demo_gateway.js</span>
                </span>
            </div>`
    });

    P.enableFileCabinetFolderLinkBeta = ventanaNS({
        clase: 'nsft-pv-fcfl',
        url: '1234567.app.netsuite.com/app/common/media/mediaitemfolders.nl?folder=4020',
        cuerpo: archivadorNS({
            tituloExtra: `<span class="nsft-pv-fcpill">${ICONO_ENLACE} {{@fcfl_copy_label}}
                                    <span class="nsft-pv-tap is-fc" aria-hidden="true"></span>
                                    <span class="nsft-pv-cursor is-fc" aria-hidden="true">${PUNTERO}</span>
                                </span>`,
            filas: filasFC(-1)
        }),
        extra: `
            <div class="nsft-pv-toast is-ancho">
                <span class="nsft-pv-toast-icon">&#10003;</span>
                <span class="nsft-pv-toast-text">
                    <span class="nsft-pv-tiny">{{@nsft_clipboard_copied}}</span>
                    <span class="nsft-pv-mono nsft-pv-tiny nsft-pv-mute">…/mediaitemfolders.nl?folder=4020</span>
                </span>
            </div>`
    });

    P.enableFileCabinetRenameBeta = ventanaNS({
        clase: 'nsft-pv-fcr',
        url: '1234567.app.netsuite.com/app/common/media/mediaitemfolders.nl?folder=4020',
        cuerpo: archivadorNS({
            filas: filasFC(2, {
                acciones: `<span class="nsft-pv-fcacts">
                                        <span class="nsft-pv-fcpill">${ICONO_ETIQUETA} {{@fcr_rename_tooltip}}
                                            <span class="nsft-pv-tap is-fc" aria-hidden="true"></span>
                                            <span class="nsft-pv-cursor is-fc" aria-hidden="true">${PUNTERO}</span>
                                        </span>
                                    </span>`
            })
        }),
        extra: dialogoNav({
            msg: '{{@fcr_prompt|@fcr_type_file}}',
            campo: `<span class="nsft-pv-mono">demo_gateway.js</span><span class="nsft-pv-caret"></span>`
        })
    });

    P.enableFileCabinetDeleteBeta = ventanaNS({
        clase: 'nsft-pv-fcd',
        url: '1234567.app.netsuite.com/app/common/media/mediaitemfolders.nl?folder=4020',
        cuerpo: archivadorNS({
            filas: filasFC(0, {
                acciones: `<span class="nsft-pv-fcacts">
                                        <span class="nsft-pv-fcpill is-del">${ICONO_PAPELERA} {{@fcd_delete_tooltip}}
                                            <span class="nsft-pv-tap is-fc" aria-hidden="true"></span>
                                            <span class="nsft-pv-cursor is-fc" aria-hidden="true">${PUNTERO}</span>
                                        </span>
                                    </span>`
            })
        }),
        extra: dialogoNav({
            msg: '{{@fcd_confirm|@fcd_type_folder}}',
            lista: `<div class="nsft-pv-dlg-lista">
                    <span class="h">{{@fcd_contents_header}}</span>
                    <span>{{@fcd_contents_folders}}: 2</span>
                    <span>{{@fcd_contents_files}}: 7</span>
                </div>`
        })
    });

    P.enableFileCabinetEditFileBeta = ventanaNS({
        clase: 'nsft-pv-fce',
        pestanas: `
                <span class="nsft-pv-tab is-flt1">{{fcTitle}}</span>
                <span class="nsft-pv-tab is-flt2">demo_gateway.js</span>`,
        url: `<span class="nsft-pv-swap is-fl">
                    <span class="u1">1234567.app.netsuite.com/app/common/media/mediaitemfolders.nl?folder=4020</span>
                    <span class="u2">1234567.app.netsuite.com/app/common/record/edittextmediaitem.nl?id=4031</span>
                </span>`,
        cuerpo: archivadorNS({
            filas: filasFC(2, {
                acciones: `<span class="nsft-pv-fcacts">
                                        <span class="nsft-pv-fcpill">${ICONO_EDITAR} {{@fcef_edit_btn}}
                                            <span class="nsft-pv-tap is-fl" aria-hidden="true"></span>
                                            <span class="nsft-pv-cursor is-fl" aria-hidden="true">${PUNTERO}</span>
                                        </span>
                                    </span>`
            })
        }),
        destinoSinCabecera: true,
        destino: editorNS(false, 'demo_gateway.js')
    });

    const FILAS_SUBIDAS = 
        filaFC({ id: '4041', nombre: '{{pvFileReport}}', tam: '240 KB', tipo: 'PDF', clase: 'is-subida' }) +
        filaFC({ id: '4042', nombre: '{{pvFileData}}', tam: '18 KB', tipo: 'CSV', clase: 'is-subida' });

    P.enableFileCabinetDragDropBeta = ventanaNS({
        clase: 'nsft-pv-fcdd',
        url: '1234567.app.netsuite.com/app/common/media/mediaitemfolders.nl?folder=4020',
        cuerpo: archivadorNS({
            filas: filasFC(-1) + FILAS_SUBIDAS,
            velo: `
                            <div class="nsft-pv-fcvelo">
                                <span class="nsft-pv-fcvelo-caja">
                                    <span class="nsft-pv-fcvelo-ico">${ICONO_BAJAR}</span>
                                    <span class="nsft-pv-fcvelo-t">{{@fcdd_drop_title}}</span>
                                    <span class="nsft-pv-fcvelo-s">{{@fcdd_drop_into}} <b>{{pvProyecto}}</b></span>
                                </span>
                                <span class="nsft-pv-fcarchivos">
                                    <span class="a1">demo_gateway.js</span>
                                    <span class="a2">{{pvFileStyles}}</span>
                                </span>
                            </div>`
        }),
        extra: `
            <div class="nsft-pv-fcprog">
                <div class="nsft-pv-fcprog-head">
                    <span class="nsft-pv-tiny">{{@fcdd_uploading}}</span>
                    <span class="nsft-pv-grow"></span>
                    <span class="nsft-pv-mono nsft-pv-tiny nsft-pv-mute">2 / 2</span>
                </div>
                <div class="nsft-pv-fcprog-track"><i></i></div>
            </div>
            <div class="nsft-pv-toast is-fcdd">
                <span class="nsft-pv-toast-icon">&#10003;</span>
                <span class="nsft-pv-toast-text">2 {{@fcdd_ok_msg}}</span>
            </div>`
    });

    P.enableFileCabinetDownload = ventanaNS({
        clase: 'nsft-pv-fcdl',
        url: '1234567.app.netsuite.com/app/common/media/mediaitemfolders.nl?folder=4020',
        cuerpo: archivadorNS({
            tituloExtra: `<span class="nsft-pv-fcpill">${ICONO_BAJAR} {{@fcdl_button_label}}
                                    <span class="nsft-pv-tap is-fc" aria-hidden="true"></span>
                                    <span class="nsft-pv-cursor is-fc" aria-hidden="true">${PUNTERO}</span>
                                </span>`,
            filas: filasFC(-1)
        }),
        extra: `
            <div class="nsft-pv-fcpanel">
                <div class="nsft-pv-fcpanel-head">
                    <span class="nsft-pv-tiny">{{@fcdl_title}}</span>
                    <span class="nsft-pv-grow"></span>
                    <span class="nsft-pv-bar-tail">&#10005;</span>
                </div>
                <div class="nsft-pv-fcpanel-body">
                    <span class="nsft-pv-check"><i class="is-on"></i>{{@fcdl_include_subfolders}}</span>
                    <div class="nsft-pv-fcprog-track is-panel"><i></i></div>
                    <span class="nsft-pv-tiny nsft-pv-mute">{{@fcdl_progress|12|18}}</span>
                </div>
                <div class="nsft-pv-fcpanel-foot">
                    <span class="nsft-pv-btn is-ghost">{{@fcdl_cancel}}</span>
                    <span class="nsft-pv-btn">{{@fcdl_start}}</span>
                </div>
            </div>`
    });

    P.enableBundleFolderNamesBeta = ventanaNS({
        clase: 'nsft-pv-fcbn',
        url: '1234567.app.netsuite.com/app/common/media/mediaitemfolders.nl?folder=-8',
        cuerpo: archivadorNS({
            filas: [
                filaFC({ id: '4101', nombre: 'Bundle 402183<span class="nsft-pv-fcbn-add">&nbsp;({{pvBnUtil}})</span>', tam: '2.4 MB', carpeta: true }),
                filaFC({ id: '4102', nombre: 'Bundle 402184<span class="nsft-pv-fcbn-add">&nbsp;(Demo Portal)</span>', tam: '1.1 MB', carpeta: true }),
                filaFC({ id: '4103', nombre: 'Bundle 402185<span class="nsft-pv-fcbn-add">&nbsp;({{pvBnConn}})</span>', tam: '860 KB', carpeta: true }),
                filaFC({ id: '4104', nombre: '{{pvFcAttach}}', tam: '12.9 MB', carpeta: true })
            ].join('')
        }),
        extra: floatLay('&#9878;')
    });

    P.enableFileRecordPreviewBeta = ventanaNS({
        clase: 'nsft-pv-frp-win',
        url: '1234567.app.netsuite.com/app/common/media/mediaitem.nl?id=4031',
        cuerpo: `
                    <div class="nsft-pv-body nsft-pv-stack">
                        <div class="nsft-pv-title">{{fileName}}</div>
                    </div>
                    <div class="nsft-pv-actions">
                        <span class="nsft-pv-btn">{{save}}</span>
                        <span class="nsft-pv-btn is-ghost">{{cancel}}</span>
                    </div>
                    <div class="nsft-pv-body">
                        <div class="nsft-pv-fields">
                            <span class="nsft-pv-field"><span class="lbl">{{fcFileNameLbl}}</span><span class="val nsft-pv-mono">demo_gateway.js</span></span>
                            <span class="nsft-pv-field"><span class="lbl">{{fcFileType}}</span><span class="val">{{fcJs}}</span></span>
                            <span class="nsft-pv-field"><span class="lbl">{{fcSize}}</span><span class="val nsft-pv-mono">3 554</span></span>
                            <span class="nsft-pv-field"><span class="lbl">{{fcFolder}}</span><span class="val">SuiteScripts : {{pvProyecto}}</span></span>
                        </div>
                    </div>
                    <div class="nsft-pv-frp">
                        <div class="nsft-pv-frp-head">
                            <span class="nsft-pv-tiny"><b>{{@frp_title}}:</b> demo_gateway.js</span>
                            <span class="nsft-pv-grow"></span>
                            <span class="nsft-pv-chip is-api">JS</span>
                            <span class="nsft-pv-btn is-ghost">{{@frp_copy}}</span>
                        </div>
                        <div class="nsft-pv-edcode is-frp">
                            <span class="l"><i class="c">/** @NApiVersion 2.1 */</i></span>
                            <span class="l"><i class="k">define</i>([<i class="s">'N/record'</i>], (<i class="v">record</i>) =&gt; {</span>
                            <span class="l is-ind"><i class="k">const</i> <i class="v">{{pvConstType}}</i> = <i class="s">'customrecord_demo'</i>;</span>
                            <span class="l is-ind"><i class="k">function</i> <i class="f">onRequest</i>(<i class="v">ctx</i>) {</span>
                            <span class="l is-ind2"><i class="k">return</i> <i class="v">record</i>.<i class="f">load</i>({ <i class="p">type</i>: <i class="v">{{pvConstType}}</i>, <i class="p">id</i>: <i class="n">1042</i> });</span>
                            <span class="l is-ind">}</span>
                            <span class="l"><i class="k">return</i> { <i class="p">onRequest</i> };</span>
                            <span class="l">});</span>
                        </div>
                    </div>`,
        extra: floatLay(ICONO_CODIGO)
    });

    P.enableSystemFolderSafetyBeta = ventanaNS({
        clase: 'nsft-pv-sfs',
        url: '1234567.app.netsuite.com/app/common/media/mediaitemfolder.nl?id=-15',
        cuerpo: `
                    <div class="nsft-pv-body nsft-pv-stack">
                        <div class="nsft-pv-title">SuiteScripts</div>
                    </div>
                    <div class="nsft-pv-sfsban">
                        <span class="nsft-pv-sfsban-ico">&#9888;</span>
                        <span class="nsft-pv-sfsban-txt">
                            <b>{{@sfs_title}}</b>
                            <span>{{@sfs_warning}}</span>
                        </span>
                    </div>
                    <div class="nsft-pv-actions">
                        <span class="nsft-pv-btn">{{save}}</span>
                        <span class="nsft-pv-btn is-ghost">{{cancel}}</span>
                        <span class="nsft-pv-btn is-ghost nsft-pv-sfsdel">${ICONO_PAPELERA} {{@fcd_delete_tooltip}}</span>
                    </div>
                    <div class="nsft-pv-body">
                        <div class="nsft-pv-fields">
                            <span class="nsft-pv-field"><span class="lbl">{{name}}</span><span class="val">SuiteScripts</span></span>
                            <span class="nsft-pv-field"><span class="lbl">{{internalId}}</span><span class="val nsft-pv-mono">-15</span></span>
                            <span class="nsft-pv-field"><span class="lbl">{{fcFolder}}</span><span class="val nsft-pv-mute">—</span></span>
                        </div>
                    </div>`,
        extra: floatLay('&#9888;')
    });

    function flujoNS(o) {
        o = o || {};
        return `
                    <div class="nsft-pv-body nsft-pv-stack nsft-pv-bqhead">
                        <div class="nsft-pv-title"><span class="nsft-pv-mute">{{wfTitle}}:</span> {{pvExpApp}}</div>
                        <span class="nsft-pv-bqlinks">
                            <span class="nsft-pv-btn">{{edit}}</span>
                            <span class="lk">{{li}}</span>
                            <span class="lk">{{masLinks}}</span>
                        </span>
                    </div>
                    <div class="nsft-pv-wf">
                        <div class="nsft-pv-wfmain">
                            <div class="nsft-pv-wfband">{{wfWorkspace}}</div>
                            <div class="nsft-pv-wfdiag ${o.claseDiag || ''}">
                                <svg class="nsft-pv-wflines" viewBox="0 0 457 100" preserveAspectRatio="none" aria-hidden="true">
                                    <defs>
                                        <marker id="nsftPvWfHead" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
                                            <path d="M0 1 L9 5 L0 9 z" fill="context-stroke"/>
                                        </marker>
                                    </defs>
                                    <path class="t1" d="M86.7 32 V38"/>
                                    <path class="t2" d="M146 49.5 H189"/>
                                    <path class="t3" d="M86.7 58 V64"/>
                                    <path class="t4" d="M251 41 V8 H86.7 V12"/>
                                </svg>
                                <span class="nsft-pv-wfstart">START &#9660;</span>
                                <span class="nsft-pv-wfbox is-b1">{{pvInicio}}</span>
                                <span class="nsft-pv-wfbox is-b2">{{pvRevision}}</span>
                                <span class="nsft-pv-wfbox is-b3">{{pvRechazado}}</span>
                                <span class="nsft-pv-wfbox is-b4">{{pvAprobado}}</span>
                            </div>
                        </div>
                        <div class="nsft-pv-wfside">
                            <div class="nsft-pv-wfside-head">{{wfTitle}}</div>
                            <div class="nsft-pv-wfside-body">
                                <span class="nsft-pv-tiny">{{wfTitle}}: {{pvExpApp}}</span>
                                <span class="nsft-pv-wftabs"><b>{{wfSummary}}</b><span>{{tabCampos}} (2)</span></span>
                                <span class="nsft-pv-wffield"><i>{{wfRecordType}}</i>{{trans}}</span>
                                <span class="nsft-pv-wffield"><i>{{descripcion}}</i>{{pvWfDesc}}</span>
                                <span class="nsft-pv-wffield"><i>{{inactive}}</i>No</span>
                                <span class="nsft-pv-wffield"><i>{{wfRelease}}</i>{{pvWfRelease}}</span>
                                <span class="nsft-pv-wffield"><i>{{wfEvents}}</i>{{pvWfCreate}}</span>
                            </div>
                        </div>
                    </div>
                    ${o.extra || ''}`;
    }

    P.enableWfColoredTransitions = ventanaNS({
        clase: 'nsft-pv-wfc',
        url: '1234567.app.netsuite.com/app/common/workflow/workflow.nl?id=482',
        cuerpo: flujoNS({ claseDiag: 'is-colorea' }),
        extra: floatLay(ICONO_RAMA)
    });

    P.wfColoredTransitionsPalette = ventanaNS({
        clase: 'nsft-pv-wfp',
        url: '1234567.app.netsuite.com/app/common/workflow/workflow.nl?id=482',
        cuerpo: flujoNS({ claseDiag: 'is-paleta' }),
        extra: `
            <div class="nsft-pv-float is-wfsel">
                <span class="nsft-pv-float-title">{{@wfctPaletteLabel}}</span>
                <div class="nsft-pv-float-row">
                    <span class="nsft-pv-select nsft-pv-grow is-opts">
                        <span class="nsft-pv-optwrap">
                            <span class="nsft-pv-opt p1">{{@wfctPaletteVivid}}</span>
                            <span class="nsft-pv-opt p2">{{@wfctPalettePastel}}</span>
                            <span class="nsft-pv-opt p3">{{@wfctPaletteDark}}</span>
                            <span class="nsft-pv-opt p4">{{@wfctPaletteNeon}}</span>
                        </span>
                        &#9662;
                    </span>
                </div>
            </div>`
    });

    P.wfColoredTransitionsLineStyle = ventanaNS({
        clase: 'nsft-pv-wfl',
        url: '1234567.app.netsuite.com/app/common/workflow/workflow.nl?id=482',
        cuerpo: flujoNS({ claseDiag: 'is-trazo' }),
        extra: `
            <div class="nsft-pv-float is-wfsel">
                <span class="nsft-pv-float-title">{{@wfctLineStyleLabel}}</span>
                <div class="nsft-pv-float-row">
                    <span class="nsft-pv-select nsft-pv-grow is-opts">
                        <span class="nsft-pv-optwrap">
                            <span class="nsft-pv-opt l1">{{@wfctLineSolid}}</span>
                            <span class="nsft-pv-opt l2">{{@wfctLineDashed}}</span>
                            <span class="nsft-pv-opt l3">{{@wfctLineDotted}}</span>
                        </span>
                        &#9662;
                    </span>
                </div>
            </div>`
    });

    P.enableWorkflowSearcher = ventanaNS({
        clase: 'nsft-pv-wfs',
        url: '1234567.app.netsuite.com/app/common/workflow/workflow.nl?id=482',
        cuerpo: flujoNS({
            extra: `
                    <span class="nsft-pv-wfschip">
                        <span class="nsft-pv-wfschip-t">{{@wfs_progress_title}}</span>
                        <span class="nsft-pv-wfschip-n">{{@wfs_actions}} <b>18 / 18</b></span>
                        <span class="nsft-pv-tap is-wfs" aria-hidden="true"></span>
                        <span class="nsft-pv-cursor is-wfs" aria-hidden="true">${PUNTERO}</span>
                    </span>
                    <div class="nsft-pv-wfspanel">
                        <div class="nsft-pv-wfspanel-head">
                            <span class="nsft-pv-tiny">${ICONO_LUPA} {{@wfs_title}}</span>
                            <span class="nsft-pv-bar-tail">&#8722; &#10005;</span>
                        </div>
                        <div class="nsft-pv-wfstabs"><b>{{@wfs_actions}}</b><span>{{@wfs_states}}</span><span>{{@wfs_transitions}}</span></div>
                        <div class="nsft-pv-wfsfiltros">
                            <span class="nsft-pv-input nsft-pv-tiny">${ICONO_LUPA} {{@wfs_search_ph}}</span>
                            <span class="nsft-pv-wfsselects">
                                <span class="nsft-pv-select">{{@wfs_all_types}} &#9662;</span>
                                <span class="nsft-pv-select">{{@wfs_all_triggers}} &#9662;</span>
                            </span>
                            <span class="nsft-pv-check"><i class="is-on"></i>{{@wfs_only_active}}</span>
                        </div>
                        <div class="nsft-pv-wfscount">18 {{@wfs_result_many}}</div>
                        <div class="nsft-pv-wfslist">
                            <div class="nsft-pv-wfsitem">
                                <span class="n">{{pvWfSetField}}</span><span class="k">workflowaction30</span>
                                <span class="m">{{@wfs_lbl_state}}: {{pvAprobado}}</span>
                                <span class="m">{{@wfs_lbl_trigger}}: <code>ONENTRY</code></span>
                                <span class="m">{{@wfs_lbl_field}}: <code>{{pvIdAuth}}</code></span>
                            </div>
                            <div class="nsft-pv-wfsitem">
                                <span class="n">{{pvWfLock}}</span><span class="k">workflowaction24</span>
                                <span class="m">{{@wfs_lbl_state}}: {{pvAprobado}}</span>
                                <span class="m">{{@wfs_lbl_trigger}}: <code>BEFORELOAD</code></span>
                                <span class="m">{{@wfs_lbl_formula}}: <code>{userrole.id} != 3</code></span>
                            </div>
                            <div class="nsft-pv-wfsitem">
                                <span class="n">{{pvWfSendMail}}</span><span class="k">workflowaction23</span>
                                <span class="m">{{@wfs_lbl_state}}: {{pvRevision}}</span>
                                <span class="m">{{@wfs_lbl_trigger}}: <code>ONENTRY</code></span>
                            </div>
                            <div class="nsft-pv-wfsitem">
                                <span class="n">{{pvWfSetField}}</span><span class="k">workflowaction22</span>
                                <span class="m">{{@wfs_lbl_state}}: {{pvRechazado}}</span>
                                <span class="m">{{@wfs_lbl_trigger}}: <code>ONENTRY</code></span>
                                <span class="m">{{@wfs_lbl_field}}: <code>{{pvIdMotivo}}</code></span>
                            </div>
                        </div>
                    </div>`
        })
    });

    function pdfNS(o) {
        o = o || {};
        return `
                    <div class="nsft-pv-body nsft-pv-stack">
                        <span class="nsft-pv-tiny nsft-pv-mute">{{pdfKind}}</span>
                        <div class="nsft-pv-title">{{pvPdfTpl}}</div>
                    </div>
                    <div class="nsft-pv-actions">
                        <span class="nsft-pv-btn">{{save}}</span>
                        <span class="nsft-pv-btn is-ghost">{{pdfSetup}}</span>
                        <span class="nsft-pv-btn is-ghost">{{cancel}}</span>
                    </div>
                    <div class="nsft-pv-pdfbar">
                        ${o.barra || ''}
                        <span class="nsft-pv-grow"></span>
                        <span class="nsft-pv-pdftgl">{{pdfSource}} <i class="is-on"></i></span>
                        <span class="nsft-pv-pdflink">{{@apdfPvPreview}}</span>
                    </div>
                    <div class="nsft-pv-pdfsplit">
                        <div class="nsft-pv-edcode is-pdf">
                            <span class="g">1</span><span class="l"><i class="p">&lt;?xml version="1.0"?&gt;</i></span>
                            <span class="g">2</span><span class="l"><i class="k">&lt;pdf&gt;</i></span>
                            <span class="g">3</span><span class="l is-ind"><i class="k">&lt;head&gt;</i></span>
                            <span class="g">4</span><span class="l is-ind2"><i class="c">&lt;style&gt;table { font-size: 9pt; }&lt;/style&gt;</i></span>
                            <span class="g">5</span><span class="l is-ind"><i class="k">&lt;/head&gt;</i></span>
                            <span class="g">6</span><span class="l is-ind"><i class="k">&lt;body</i> <i class="v">size</i>=<i class="s">"Letter"</i><i class="k">&gt;</i></span>
                            <span class="g">7</span><span class="l is-ind2"><i class="k">&lt;table&gt;</i><i class="k">&lt;tr&gt;&lt;td&gt;</i></span>
                            <span class="g">8</span><span class="l is-ind2">${o.linea || '<i class="n">\${companyInformation.companyName}</i>'}</span>
                            <span class="g">9</span><span class="l is-ind2"><i class="k">&lt;/td&gt;&lt;td&gt;</i></span>
                            <span class="g">10</span><span class="l is-ind2"><i class="n">\${record.tranid}</i></span>
                            <span class="g">11</span><span class="l is-ind2"><i class="k">&lt;/td&gt;&lt;/tr&gt;&lt;/table&gt;</i></span>
                            <span class="g">12</span><span class="l is-ind"><i class="k">&lt;/body&gt;</i></span>
                        </div>
                        ${o.lateral || ''}
                    </div>`;
    }

    const HOJA_PDF = `
                        <div class="nsft-pv-pdfview">
                            <div class="nsft-pv-pdfview-bar">
                                <span>${ICONO_MENU}</span>
                                <span class="nsft-pv-tiny">pdftemplate.nl</span>
                                <span class="nsft-pv-grow"></span>
                                <span class="nsft-pv-tiny nsft-pv-mono">1 / 1</span>
                                <span>${ICONO_BAJAR}</span>
                            </div>
                            <div class="nsft-pv-pdfhoja">
                                <span class="h1">{{pvCoSa}}</span>
                                <span class="h2">{{pvPdfInv}}</span>
                                <span class="r"><i>{{id}}</i><b>1042</b></span>
                                <span class="r"><i>{{date}}</i><b>16/11/2026</b></span>
                                <span class="r"><i>{{total}}</i><b>18 402.55</b></span>
                                <span class="sk"></span><span class="sk is-corta"></span>
                            </div>
                        </div>`;

    P.enableAdvancedPdfPreview = ventanaNS({
        clase: 'nsft-pv-apdf',
        url: '1234567.app.netsuite.com/app/common/custom/pdftemplate.nl?id=482',
        cuerpo: pdfNS({
            barra: `<span class="nsft-pv-pdftgl is-hot">{{@apdfPvSide}} <i></i>
                            <span class="nsft-pv-tap is-apdf" aria-hidden="true"></span>
                            <span class="nsft-pv-cursor is-apdf" aria-hidden="true">${PUNTERO}</span>
                        </span>
                        <span class="nsft-pv-pdftgl">{{@apdfPvLive}} <i></i></span>`,
            lateral: HOJA_PDF
        })
    });

    P.enableAdvancedPdfAutocomplete = ventanaNS({
        clase: 'nsft-pv-apac',
        url: '1234567.app.netsuite.com/app/common/custom/pdftemplate.nl?id=482',
        cuerpo: pdfNS({
            barra: `<span class="nsft-pv-tiny nsft-pv-mute">{{@apdfVerTemplate}}</span>`,
            linea: `<i class="n">\${record.<span class="nsft-pv-type is-apac">tra</span></i><span class="nsft-pv-caret"></span>
                                <span class="nsft-pv-aclist">
                                    <span class="is-on">record.tranid</span>
                                    <span>record.trandate</span>
                                    <span>record.total</span>
                                    <span>record.entity</span>
                                </span>`
        })
    });

    P.enableAdvancedPdfVersions = ventanaNS({
        clase: 'nsft-pv-apver',
        url: '1234567.app.netsuite.com/app/common/custom/pdftemplate.nl?id=482',
        cuerpo: pdfNS({
            barra: `<span class="nsft-pv-tiny nsft-pv-mute">{{@apdfVerTemplate}}</span>
                        <span class="nsft-pv-select is-apver">3{{@apdfVerCurrent}} &#9662;
                            <span class="nsft-pv-apverlist">
                                <span class="is-on">3{{@apdfVerCurrent}}</span>
                                <span>2</span>
                                <span>1</span>
                            </span>
                            <span class="nsft-pv-tap is-apver" aria-hidden="true"></span>
                            <span class="nsft-pv-cursor is-apver" aria-hidden="true">${PUNTERO}</span>
                        </span>`
        })
    });

    const CURSOR = `
                            <span class="nsft-pv-tap" aria-hidden="true"></span>
                            <span class="nsft-pv-cursor" aria-hidden="true">
                                <svg viewBox="0 0 24 24" fill="#fff" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round">
                                    <path d="M5 3l14 8.5-6.2 1.3L10 20z"/>
                                </svg>
                            </span>`;


    function runner(conIA, desdeMenu) {
        const cuerpo = `
                <div class="nsft-pv-page">
                    <div class="nsft-pv-runner">
                        <div class="nsft-pv-schema">
                            <span class="nsft-pv-schema-head">{{@sql_schema_title}}</span>
                            <span class="nsft-pv-input nsft-pv-tiny">&#9906;</span>
                            <span class="nsft-pv-schema-row"><span class="nsft-pv-mono">employee</span></span>
                            <span class="nsft-pv-schema-row"><span class="nsft-pv-mono">subsidiary</span></span>
                            <span class="nsft-pv-schema-row"><span class="nsft-pv-mono">transaction</span></span>
                        </div>
                        <div class="nsft-pv-main">
                            <div class="nsft-pv-code is-light">
                                <div><span class="ln">1</span><span class="k">SELECT</span></div>
                                <div><span class="ln">2</span>&nbsp;&nbsp;<span class="f">id</span>,</div>
                                <div><span class="ln">3</span>&nbsp;&nbsp;<span class="f">entityid</span>,</div>
                                <div><span class="ln">4</span>&nbsp;&nbsp;<span class="f">email</span></div>
                                <div><span class="ln">5</span><span class="k">FROM</span></div>
                                <div><span class="ln">6</span>&nbsp;&nbsp;employee</div>
                                <div><span class="ln">7</span><span class="k">FETCH FIRST</span> <span class="n">100</span> <span class="k">ROWS ONLY</span></div>
                            </div>
                            <div>
                                <div class="nsft-pv-restabs">
                                    <span class="is-on">{{@sql_tab_results}}</span>
                                    <span>{{@sql_tab_logs}}</span>
                                </div>
                                <div class="nsft-pv-toolbar">
                                    <span class="nsft-pv-input nsft-pv-grow nsft-pv-tiny">&#9906;</span>
                                    <span class="nsft-pv-chip">{{@sql_chart_btn}}</span>
                                    <span class="nsft-pv-chip">{{@copy}}</span>
                                    <span class="nsft-pv-chip">{{@download}}</span>
                                </div>
                                <div class="nsft-pv-empty">&#9723;</div>
                                <div class="nsft-pv-resfoot">
                                    <span class="nsft-pv-grow nsft-pv-mono">0 / 0</span>
                                    <span class="nsft-pv-mono">20 &#9662;</span>
                                    <span class="nsft-pv-key">1</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>`;

        const ventana = `
        <div class="${desdeMenu ? 'nsft-pv-sqlwin' : 'nsft-pv-win'}">
            <div class="nsft-pv-bar">
                <span class="nsft-pv-mono nsft-pv-tiny">SQL</span>
                <span class="nsft-pv-grow nsft-pv-tiny">NetSuite Full Tools</span>
                <span class="nsft-pv-bar-tail">&#9472; &#9723; &#10005;</span>
            </div>
            <div class="nsft-pv-menubar">
                <span>{{@sql_menu_file}}</span><span>{{@sql_menu_edit}}</span>
                <span>{{@sql_menu_run}}</span><span>{{@sql_menu_view}}</span><span>{{@sql_menu_help}}</span>
            </div>
            <div class="nsft-pv-toolbar">
                <span class="nsft-pv-chip is-run">&#9654; {{@sql_menu_run}}</span>
                <span class="nsft-pv-chip">{{@sql_submenu_format}}</span>
                <span class="nsft-pv-chip">JOIN</span>
                <span class="nsft-pv-chip">{{@sql_vars_btn}}</span>
                <span class="nsft-pv-chip">{{@sql_favorites}}</span>
                <span class="nsft-pv-chip is-ai${conIA ? " nsft-pv-hot" : ""}">&#10022; {{ia}}${conIA ? CURSOR : ""}</span>
                <span class="nsft-pv-grow"></span>
                <span class="nsft-pv-chip">&#9707;</span>
            </div>
            <div class="nsft-pv-qtabs">
                <span class="nsft-pv-qtab">{{@sql_tab_default_title}} 1 &#10005;</span>
                <span class="nsft-pv-qtab is-on">{{@sql_tab_default_title}} 2 &#10005;</span>
                <span class="nsft-pv-qtab is-plus">+</span>
            </div>
            <div class="${conIA ? "nsft-pv-dock is-anim" : ""}">${cuerpo}${conIA ? PANEL_IA : ""}</div>
            <div class="nsft-pv-statusbar">
                <span class="is-ok nsft-pv-grow">&#9679;</span>
                <span>106</span><span>10</span><span>1:1</span>
            </div>
        </div>`;

        if (!desdeMenu) return ventana;

        return ventanaNS({
            clase: 'nsft-pv-sqlopen nsft-pv-menuflow',
            sublista: true,
            acciones: `
            <span class="nsft-pv-toolsbtn"><img class="nsft-pv-logomark" src="{{logo}}" alt=""> {{@menuTools}} &#9662;
                <span class="nsft-pv-menu">
                    <span class="nsft-pv-menu-item">${ICONO_BD} {{@openSuiteQLRunnerLabel}}</span>
                </span>
                <span class="nsft-pv-tap is-cp" aria-hidden="true"></span>
                <span class="nsft-pv-cursor is-cp" aria-hidden="true">${PUNTERO}</span>
            </span>`,
            extra: ventana
        });
    }

    P.enableSuiteQLRunner = runner(false, true);
    P.aiAssistantSuiteql = runner(true);

    P.aiAssistantConsole = consolaNS(true);

    P.aiAssistantAdv = ventanaNS({
        clase: 'nsft-pv-advia',
        sinCabecera: true,
        url: '1234567.app.netsuite.com/app/common/record/edittextmediaitem.nl?id=482&e=T',
        cuerpo: editorAvanzadoNS(),
        panel: PANEL_IA
    });

    const NEEDS = {
        aiAssistantSuiteql: 'enableSuiteQLRunner',
        aiAssistantConsole: 'enableSuiteScriptConsole',
        aiAssistantAdv: 'enableAdvancedEditor',
        enableRecordTrail: 'enableRecordOptionsMenu',
        enableSaveAndEditButton: 'enableRecordOptionsMenu',
        saveAndEditModeMenu: 'enableRecordOptionsMenu',
        enableEditAndSaveButton: 'enableRecordOptionsMenu',
        editAndSaveModeMenu: 'enableRecordOptionsMenu',
        enableDeleteRecordButton: 'enableRecordOptionsMenu',
        deleteRecordModeMenu: 'enableRecordOptionsMenu'
    };

    const NOTAS = { enableColorThemes: 'colorThemesScopeNote' };
    window.NSFT_WIZ_PV_NEEDS = NEEDS;

    function pintar(caja, item, opts) {
        if (!caja || !item) return;
        const o = opts || {};
        const rotulos = o.rotulos || {};

        const desc = document.createElement('p');
        desc.className = 'nsft-pv-desc';
        desc.textContent = item.desc || '';

        const escribirTitulo = (destino) => {
            destino.replaceChildren();
            const esSub = o.respaldo && o.respaldo !== item.key && rotulos[o.respaldo];
            if (esSub) {
                const padre = document.createElement('span');
                padre.className = 'nsft-pv-crumb-parent';
                padre.textContent = rotulos[o.respaldo];
                const sep = document.createElement('span');
                sep.className = 'nsft-pv-crumb-sep';
                sep.textContent = '\u203A';
                destino.append(padre, sep);
            }
            const hoja = document.createElement('span');
            hoja.className = 'nsft-pv-crumb-leaf';
            hoja.textContent = item.label || '';
            destino.appendChild(hoja);
        };

        if (o.titulo) {
            escribirTitulo(o.titulo);
            caja.replaceChildren();
        } else {
            const nombre = document.createElement('p');
            nombre.className = 'nsft-pv-name';
            escribirTitulo(nombre);
            caja.replaceChildren(nombre);
        }
        if (!o.descAbajo) caja.appendChild(desc);

        const clave = P[item.key] ? item.key
            : (o.respaldo && P[o.respaldo] ? o.respaldo : null);

        if (clave) {
            const marco = document.createElement('div');
            marco.innerHTML = P[clave];
            const rotulo = rotulos[o.respaldo || item.key] || item.label || '';
            marco.querySelectorAll('[data-pv-label]').forEach((hueco) => {
                hueco.textContent = rotulo;
            });
            caja.appendChild(marco);
        }

        if (o.descAbajo) {
            desc.classList.add('is-below');
            caja.appendChild(desc);
        }

        const aviso = NOTAS[item.key];
        if (clave && aviso) {
            const nota = document.createElement('div');
            nota.className = 'nsft-pv-needs is-info';
            const icono = document.createElement('span');
            icono.textContent = 'i';
            const texto = document.createElement('span');
            texto.textContent = t(aviso);
            nota.append(icono, texto);
            caja.appendChild(nota);
        }

        const necesita = NEEDS[item.key];
        if (clave && necesita) {
            const nota = document.createElement('div');
            nota.className = 'nsft-pv-needs';
            const icono = document.createElement('span');
            icono.textContent = '!';
            const texto = document.createElement('span');
            texto.textContent = t('welcomeWizRequires', [rotulos[necesita] || necesita]);
            nota.append(icono, texto);
            caja.appendChild(nota);
        }
        return !!clave;
    }

    Object.keys(P).forEach((clave) => { P[clave] = traducir(P[clave]); });

    window.NSFT_PV = { html: P, needs: NEEDS, notas: NOTAS, pintar: pintar };
    window.NSFT_WIZ_PREVIEWS = P;
})();
