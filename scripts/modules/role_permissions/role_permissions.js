(function () {
    'use strict';
    if (!/^\/app\//.test(window.location.pathname)) return;
    if (window.NSFT_Herramientas) window.NSFT_Herramientas.vigila('.nsft-rperm-panel', 'perms');

    const STORAGE_KEY = 'enableRolePermissions';
    const PANEL_ID = 'nsft-rperm-panel';
    const OVERLAY_ID = 'nsft-rperm-overlay';
    const NSFT_THEME_KEY = 'nsftTheme';
    const FETCHER_PATH = 'scripts/modules/role_permissions/role_permissions_fetcher.js';
    const EVENTO = 'nsft-show-role-permissions';
    const CLAVE_FALSA = 'NSFT_NOT_A_PERMISSION_ZZ';

    const PERMISOS = {
        REPO_ANALYTICS: { nombre: ['rperm_p_analytics', 'SuiteAnalytics Workbook'] },
        ADMI_RESTWEBSERVICES: { nombre: ['rperm_p_rest', 'REST Web Services'] },
        ADMI_CUSTOMSCRIPT: { nombre: ['rperm_p_customscript', 'SuiteScript'] },
        ADMI_DELETEDRECORD: { nombre: ['rperm_p_deletedrecord', 'Deleted Records'] },
        LIST_FILECABINET: { nombre: ['rperm_p_filecabinet', 'Documents and Files'] },
        LIST_FIND: { nombre: ['rperm_p_find', 'Perform Search'] }
    };
    const PESTANAS = {
        ADMI: ['rperm_tab_setup', 'Setup'],
        LIST: ['rperm_tab_lists', 'Lists'],
        REPO: ['rperm_tab_reports', 'Reports'],
        TRAN: ['rperm_tab_transactions', 'Transactions']
    };
    const NIVELES = [
        ['rperm_lv_0', 'None'],
        ['rperm_lv_1', 'View'],
        ['rperm_lv_2', 'Create'],
        ['rperm_lv_3', 'Edit'],
        ['rperm_lv_4', 'Full']
    ];

    const HERRAMIENTAS = [
        { nombre: ['rperm_t_suiteql', 'SuiteQL Runner'], perm: 'REPO_ANALYTICS', min: 1 },
        { nombre: ['rperm_t_cfind', 'Customization Finder'], perm: 'REPO_ANALYTICS', min: 1 },
        { nombre: ['rperm_t_vro', 'View Record Object (extra data)'], perm: 'REPO_ANALYTICS', min: 1 },
        { nombre: ['rperm_t_rest', 'SuiteQL over REST'], nota: ['rperm_t_rest_note', 'Faster queries; without it, N/query is used'], perm: 'ADMI_RESTWEBSERVICES', min: 1, opcional: true },
        { nombre: ['rperm_t_scripted', 'Record scripts'], perm: 'ADMI_CUSTOMSCRIPT', min: 1 },
        { nombre: ['rperm_t_ssc', 'SuiteScript Console'], perm: 'ADMI_CUSTOMSCRIPT', min: 1 },
        { nombre: ['rperm_t_sx', 'Run script'], perm: 'ADMI_CUSTOMSCRIPT', min: 1 },
        { nombre: ['rperm_t_logs', 'Record logs'], perm: 'ADMI_CUSTOMSCRIPT', min: 1 },
        { nombre: ['rperm_t_sva', 'Scripts to upgrade to SuiteScript 2.1'], perm: 'ADMI_CUSTOMSCRIPT', min: 1 },
        { nombre: ['rperm_t_delrec', 'Deleted Records'], perm: 'ADMI_DELETEDRECORD', min: 1 },
        { nombre: ['rperm_t_fc', 'File Cabinet tools'], perm: 'LIST_FILECABINET', min: 1 },
        { nombre: ['rperm_t_adv', 'Advanced Editor (save files)'], perm: 'LIST_FILECABINET', min: 3 },
        { nombre: ['rperm_t_search', 'Export Search and search review'], perm: 'LIST_FIND', min: 1 }
    ];

    let _theme = 'light';

    chrome.storage.local.get({ [STORAGE_KEY]: true, [NSFT_THEME_KEY]: 'light' }, (items) => {
        _theme = items[NSFT_THEME_KEY] || 'light';
        if (items[STORAGE_KEY]) activate();
    });

    chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== 'local') return;
        if (changes[STORAGE_KEY]) {
            if (changes[STORAGE_KEY].newValue) activate();
            else deactivate();
        }
        if (changes[NSFT_THEME_KEY]) {
            _theme = changes[NSFT_THEME_KEY].newValue || 'light';
            [OVERLAY_ID, PANEL_ID].forEach((id) => {
                const el = document.getElementById(id);
                if (el) el.setAttribute('data-theme', resolveTheme());
            });
        }
    });

    function resolveTheme() {
        return _theme === 'dark' ? 'dark' : 'light';
    }

    function onOpenEvent() { open(); }

    function activate() {
        window.NSFT_RolePerms = { open: open };
        window.removeEventListener(EVENTO, onOpenEvent);
        window.addEventListener(EVENTO, onOpenEvent);
    }

    function deactivate() {
        window.removeEventListener(EVENTO, onOpenEvent);
        try { delete window.NSFT_RolePerms; } catch (e) { window.NSFT_RolePerms = undefined; }
        close();
    }


    function i18n(key, fallback, subs) {
        let out = '';
        try { out = chrome.i18n.getMessage(key, subs) || ''; } catch (e) { out = ''; }
        if (!out) {
            out = fallback;
            (subs || []).forEach((v, idx) => { out = out.split('$' + (idx + 1)).join(String(v)); });
        }
        return out;
    }

    function tx(par) { return i18n(par[0], par[1]); }

    function esc(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    }

    function textoNivel(n) {
        return (n != null && NIVELES[n]) ? tx(NIVELES[n]) : '—';
    }

    function pestanaDe(clave) {
        const p = PESTANAS[String(clave).split('_')[0]];
        return p ? tx(p) : '';
    }

    let _fetcher = 'none';
    const _cola = [];
    const _espera = {};
    let _seq = 0;

    window.addEventListener('message', (e) => {
        if (e.source !== window) return;
        const d = e.data;
        if (!d || d.dest !== 'extension_rperm' || !d.reqId) return;
        const cb = _espera[d.reqId];
        if (cb) { delete _espera[d.reqId]; cb(d.payload); }
    });

    function cargaFetcher() {
        if (_fetcher !== 'none') return;
        _fetcher = 'loading';
        if (window.NSFT_SuiteQLRest && window.NSFT_SuiteQLRest.ensureTransport) {
            window.NSFT_SuiteQLRest.ensureTransport();
        }
        const s = document.createElement('script');
        s.async = false;
        s.src = chrome.runtime.getURL(FETCHER_PATH);
        s.onload = function () {
            this.remove();
            _fetcher = 'ready';
            _cola.splice(0).forEach((fn) => fn());
        };
        s.onerror = function () {
            this.remove();
            _fetcher = 'error';
            _cola.splice(0).forEach((fn) => fn());
        };
        if (window.NSFT_AfterLoad && window.NSFT_AfterLoad.flush) window.NSFT_AfterLoad.flush();
        (window.NSFT_AfterLoad ? window.NSFT_AfterLoad.append(s) : (document.head || document.documentElement).appendChild(s));
    }

    function pide(type, payload, plazo) {
        return new Promise((resolve) => {
            const enviar = () => {
                if (_fetcher !== 'ready') { resolve(null); return; }
                const reqId = 'rperm' + (++_seq) + '_' + Date.now();
                const t = setTimeout(() => { delete _espera[reqId]; resolve(null); }, plazo || 20000);
                _espera[reqId] = (p) => { clearTimeout(t); resolve(p); };
                window.postMessage({ dest: 'fetcher_rperm', type, reqId, payload: payload || {} }, '*');
            };
            if (_fetcher === 'ready' || _fetcher === 'error') enviar();
            else {
                _cola.push(enviar);
                cargaFetcher();
                setTimeout(() => {
                    const i = _cola.indexOf(enviar);
                    if (i !== -1) { _cola.splice(i, 1); resolve(null); }
                }, 10000);
            }
        });
    }


    let _ultimo = null;

    function analiza(p) {
        const nombres = (p && p.names) || {};
        const nombrePerm = (k) => nombres[k] || tx(PERMISOS[k].nombre);
        const niveles = (p && p.levels) || {};
        const filas = HERRAMIENTAS.map((h) => {
            const nivel = niveles[h.perm] != null ? Number(niveles[h.perm]) : null;
            let estado = 'ok';
            if (nivel == null) estado = 'desconocido';
            else if (nivel < h.min) estado = h.opcional ? 'opcional' : 'falta';
            return { h, nivel, estado, permiso: nombrePerm(h.perm), pestana: pestanaDe(h.perm) };
        });

        const faltaAnalytics = filas.some((f) => f.h.perm === 'REPO_ANALYTICS' && f.estado === 'falta');
        const porPerm = {};
        filas.forEach((f) => {
            const cuenta = f.estado === 'falta' || (f.estado === 'opcional' && faltaAnalytics);
            if (!cuenta) return;
            const k = f.h.perm;
            if (!porPerm[k]) porPerm[k] = { clave: k, permiso: f.permiso, pestana: f.pestana, nivel: f.nivel, min: 0, herramientas: [], opcional: !!f.h.opcional };
            porPerm[k].min = Math.max(porPerm[k].min, f.h.min);
            porPerm[k].herramientas.push(tx(f.h.nombre));
        });
        const faltan = Object.keys(porPerm).map((k) => porPerm[k]);
        return { filas, faltan };
    }


    const ICONO_ESCUDO = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>';

    function vacio(icono, txt) {
        if (window.NSFT_Herramientas) return window.NSFT_Herramientas.vacio(icono, txt);
        return '<div class="nsft-rperm-muted">' + esc(txt) + '</div>';
    }

    function open() {
        close();
        const overlay = document.createElement('div');
        overlay.id = OVERLAY_ID;
        overlay.className = 'nsft-rperm-overlay nsft-modal-backdrop';
        overlay.setAttribute('data-theme', resolveTheme());
        overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

        const panel = document.createElement('div');
        panel.id = PANEL_ID;
        panel.className = 'nsft-rperm-panel nsft-modal nsft-modal--dialog';
        panel.setAttribute('data-theme', resolveTheme());
        panel.setAttribute('role', 'dialog');
        panel.setAttribute('aria-modal', 'true');

        panel.innerHTML = '<div class="nsft-modal-header">'
            + '<span class="nsft-modal-title">' + ICONO_ESCUDO + esc(i18n('enableRolePermissionsLabel', 'Your role permissions')) + '</span>'
            + '<div class="nsft-header-actions">'
            + '<button type="button" class="nsft-rperm-x nsft-modal-btn-close" aria-label="' + esc(i18n('rperm_close', 'Close')) + '">✕</button>'
            + '</div>'
            + '</div>'
            + '<div class="nsft-rperm-body"><div class="nsft-rperm-muted nsft-rperm-loading">' + esc(i18n('rperm_loading', 'Checking your role…')) + '</div></div>'
            + '<div class="nsft-dlg-foot nsft-rperm-foot">'
            + '<button type="button" class="nsft-dlg-btn nsft-dlg-btn-ok nsft-rperm-copy" disabled>' + esc(i18n('rperm_copy', 'Copy request for the administrator')) + '</button>'
            + '</div>';

        panel.querySelector('.nsft-rperm-x').addEventListener('click', close);
        panel.querySelector('.nsft-rperm-copy').addEventListener('click', copiaPeticion);

        overlay.appendChild(panel);
        mount(overlay);

        pide('check', { keys: Object.keys(PERMISOS), fake: CLAVE_FALSA }, 20000).then((p) => {
            if (!panel.isConnected) return;
            pinta(panel, p);
        });
    }

    function pinta(panel, p) {
        const cuerpo = panel.querySelector('.nsft-rperm-body');
        const boton = panel.querySelector('.nsft-rperm-copy');
        _ultimo = null;
        boton.disabled = true;

        if (!p || p.error) {
            cuerpo.innerHTML = vacio('aviso', i18n('rperm_error', 'Your role could not be read on this page. Open the tool from a record or a NetSuite list.'));
            return;
        }

        const rol = p.roleName || p.roleId || '';
        const t = panel.querySelector('.nsft-modal-header .nsft-modal-title');
        if (t && window.NSFT_Herramientas && rol) window.NSFT_Herramientas.cabecera(t, 'perms', { contexto: rol });

        if (Number(p.control) !== 0) {
            cuerpo.innerHTML = vacio('shield', i18n('rperm_full', 'Your role ($1) has full access: there are no permissions to request.', [rol]));
            boton.title = i18n('rperm_copy_none', 'Nothing to request');
            return;
        }

        const a = analiza(p);
        _ultimo = { rol, faltan: a.faltan };

        const nFaltan = a.filas.filter((f) => f.estado === 'falta').length;
        const resumen = nFaltan
            ? '<div class="nsft-rperm-sum is-falta">' + esc(i18n('rperm_sum_missing', '$1 tools need a permission your role does not have.', [String(nFaltan)])) + '</div>'
            : '<div class="nsft-rperm-sum is-ok">' + esc(i18n('rperm_sum_ok', 'Your role has every permission the tools need.')) + '</div>';

        const filas = a.filas.map((f) => {
            let badge;
            if (f.estado === 'ok') badge = '<span class="nsft-estado is-ok">' + esc(i18n('rperm_st_ok', 'Enough')) + '</span>';
            else if (f.estado === 'opcional') badge = '<span class="nsft-tipo">' + esc(i18n('rperm_st_optional', 'Optional')) + '</span>';
            else if (f.estado === 'falta') badge = '<span class="nsft-alerta">' + esc(i18n('rperm_st_missing', 'Missing')) + '</span>';
            else badge = '<span class="nsft-estado">' + esc(i18n('rperm_st_unknown', 'Unknown')) + '</span>';
            const nota = f.h.nota ? '<span class="nsft-rperm-sub">' + esc(tx(f.h.nota)) + '</span>' : '';
            return '<div class="nsft-rperm-row' + (f.estado === 'falta' ? ' is-falta' : '') + '">'
                + '<span class="nsft-rperm-tool"><span class="nsft-rperm-main">' + esc(tx(f.h.nombre)) + '</span>' + nota + '</span>'
                + '<span class="nsft-rperm-perm"><span class="nsft-rperm-main" title="' + esc(f.h.perm) + '">' + esc(f.permiso) + '</span>'
                + '<span class="nsft-rperm-sub">' + esc(f.pestana) + '</span></span>'
                + '<span class="nsft-rperm-lv">' + esc(textoNivel(f.h.min)) + '</span>'
                + '<span class="nsft-rperm-lv' + (f.estado === 'falta' ? ' is-falta' : '') + '">' + esc(textoNivel(f.nivel)) + '</span>'
                + '<span class="nsft-rperm-st">' + badge + '</span>'
                + '</div>';
        }).join('');

        cuerpo.innerHTML = resumen
            + '<div class="nsft-rperm-table">'
            + '<div class="nsft-rperm-row nsft-rperm-head">'
            + '<span>' + esc(i18n('rperm_col_tool', 'Tool')) + '</span>'
            + '<span>' + esc(i18n('rperm_col_perm', 'Permission')) + '</span>'
            + '<span>' + esc(i18n('rperm_col_needs', 'Needs')) + '</span>'
            + '<span>' + esc(i18n('rperm_col_has', 'You have')) + '</span>'
            + '<span>' + esc(i18n('rperm_col_status', 'Status')) + '</span>'
            + '</div>' + filas + '</div>';

        if (a.faltan.length) boton.disabled = false;
        else boton.title = i18n('rperm_copy_none', 'Nothing to request');
    }

    function textoPeticion(u) {
        const L = [i18n('rperm_admin_intro', 'Hi. To use NetSuite Full Tools with the role "$1" I need these permissions added to it:', [u.rol]), ''];
        u.faltan.forEach((f) => {
            L.push(i18n('rperm_admin_item', '• $1 — level $2 (now: $3). Used by: $4.',
                [f.permiso, textoNivel(f.min), textoNivel(f.nivel), f.herramientas.join(', ')])
                + (f.opcional ? ' ' + i18n('rperm_admin_optional', '(Optional: makes queries faster.)') : ''));
            L.push('  ' + i18n('rperm_admin_path', 'Setup > Users/Roles > Manage Roles > $1 > Permissions > $2', [u.rol, f.pestana]));
        });
        L.push('', i18n('rperm_admin_thanks', 'Thank you.'));
        return L.join('\n');
    }

    function copiaPeticion() {
        const u = _ultimo;
        if (!u || !u.faltan.length) return;
        const text = textoPeticion(u);
        if (window.NSFT_Clipboard && typeof window.NSFT_Clipboard.copy === 'function') {
            window.NSFT_Clipboard.copy(text, { toast: { message: i18n('rperm_copied', 'Request copied: paste it in an email to your administrator'), preview: false } });
        } else {
            try { navigator.clipboard.writeText(text); } catch (e) { }
        }
    }

    function mount(overlay) {
        (document.body || document.documentElement).appendChild(overlay);
        document.addEventListener('keydown', onKey, true);
    }

    function onKey(e) {
        if (e.key === 'Escape') { e.stopPropagation(); close(); }
    }

    function close() {
        const o = document.getElementById(OVERLAY_ID);
        if (o) o.remove();
        document.removeEventListener('keydown', onKey, true);
    }
})();
