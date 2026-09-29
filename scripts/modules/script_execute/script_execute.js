(function () {
    'use strict';

    const STORAGE_KEY = 'enableScriptExecute';
    const CONFIRM_KEY = 'scriptExecuteConfirmSandbox';
    const MODE_KEY = 'scriptExecuteMode';
    const FETCHER_DEST = 'fetcher_sx';
    const EXTENSION_DEST = 'extension_sx';
    const EVENT_OPEN = 'nsft-show-script-execute';
    const MODAL_ID = 'nsft-sx-modal';
    const BTN_ID = 'nsft-sx-run';

    try {
        if (window.NSFT_RecordButtons && NSFT_RecordButtons.isHeaderlessPage
            && NSFT_RecordButtons.isHeaderlessPage()) return;
    } catch (e) { }

    let _on = true;
    let _confirmSandbox = true;
    let _modo = 'menu';

    function T(key, fallback, subs) {
        let out = '';
        try { out = chrome.i18n.getMessage(key, subs) || ''; } catch (e) { out = ''; }
        if (!out) {
            out = fallback;
            (subs || []).forEach((v, i) => { out = out.split('$' + (i + 1)).join(String(v)); });
        }
        return out;
    }

    chrome.storage.local.get({ [STORAGE_KEY]: true, [CONFIRM_KEY]: true, [MODE_KEY]: 'menu' }, (it) => {
        _on = !!it[STORAGE_KEY];
        _confirmSandbox = it[CONFIRM_KEY] !== false;
        _modo = it[MODE_KEY] === 'button' ? 'button' : 'menu';
        if (_on) initPagina();
    });

    chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== 'local') return;
        if (changes[CONFIRM_KEY]) _confirmSandbox = changes[CONFIRM_KEY].newValue !== false;
        if (changes.nsftTheme && _backdrop) {
            const modo = changes.nsftTheme.newValue === 'dark' ? 'dark' : 'light';
            _backdrop.setAttribute('data-theme', modo);
            if (_modal) _modal.setAttribute('data-theme', modo);
        }
        if (changes[MODE_KEY]) {
            _modo = changes[MODE_KEY].newValue === 'button' ? 'button' : 'menu';
            if (_modo === 'menu') quitarBoton();
            else if (_on) initPagina();
        }
        if (!changes[STORAGE_KEY]) return;
        _on = changes[STORAGE_KEY].newValue !== false;
        if (_on) initPagina();
        else { cerrar(); quitarBoton(); }
    });

    window.addEventListener('nsft-script-execute-run', () => {
        if (!_on) return;
        lanzarDesdeFicha(null);
    });

    window.NSFT_ScriptExecute = {
        modo: () => (_on ? _modo : 'off'),
        esFichaEjecutable: () => {
            if (!_on) return false;
            if (!PAGINA_RE.test(location.pathname)) return false;
            const RB = window.NSFT_RecordButtons;
            if (!RB || RB.isEditMode() || !RB.hasRecordId()) return false;
            const ctx = contextoPagina();
            return !!(ctx && esEjecutable(ctx));
        }
    };

    window.addEventListener(EVENT_OPEN, () => {
        if (!_on) return;
        if (_modal) { cerrar(); return; }
        abrir({});
    });


    let _puente = 'no';
    const _cola = [];
    const _pend = new Map();
    let _seq = 0;

    function asegurarPuente() {
        if (_puente !== 'no') return;
        _puente = 'cargando';
        try {
            if (window.NSFT_SuiteQLRest && NSFT_SuiteQLRest.ensureTransport) NSFT_SuiteQLRest.ensureTransport();
            const s = document.createElement('script');
            s.async = false;
            s.src = chrome.runtime.getURL('scripts/modules/script_execute/script_execute_fetcher.js');
            s.onload = function () {
                this.remove();
                _puente = 'listo';
                while (_cola.length) window.postMessage(_cola.shift(), '*');
            };
            s.onerror = function () { this.remove(); romperPuente(); };
            (document.head || document.documentElement).appendChild(s);
        } catch (e) { romperPuente(); }
    }

    function romperPuente() {
        _puente = 'roto';
        _cola.splice(0).forEach((env) => contestar(env.id, { code: 'stale' }, null));
    }

    function contestar(id, error, data) {
        const p = _pend.get(id);
        if (!p) return;
        _pend.delete(id);
        clearTimeout(p.timer);
        p.resolve({ error: error || null, data: data == null ? null : data });
    }

    function pedir(type, payload, plazoMs) {
        return new Promise((resolve) => {
            const id = 'sx' + (++_seq) + '_' + Date.now();
            const env = { dest: FETCHER_DEST, type: type, id: id, payload: payload || {} };
            const timer = setTimeout(() => contestar(id, { code: 'timeout' }, null), plazoMs || 30000);
            _pend.set(id, { resolve: resolve, timer: timer });
            if (_puente === 'listo') window.postMessage(env, '*');
            else if (_puente === 'roto') contestar(id, { code: 'stale' }, null);
            else { _cola.push(env); asegurarPuente(); }
        });
    }

    window.addEventListener('message', (e) => {
        if (e.source !== window) return;
        const d = e.data;
        if (!d || typeof d !== 'object' || d.dest !== EXTENSION_DEST || d.type !== 'reply') return;
        contestar(d.id, d.error, d.data);
    });


    const PAGINA_RE = /\/app\/common\/scripting\/(?:script|scriptrecord|scriptdeploy)\.nl$/i;
    let _unsub = null;
    let _plazoBoton = 0;

    function idDeLaUrl() {
        try { return parseInt(new URLSearchParams(location.search).get('id'), 10) || 0; } catch (e) { return 0; }
    }

    function contextoPagina() {
        const SP = window.NSFT_ScriptPage;
        const id = idDeLaUrl();
        if (!id) return null;
        const esDespliegue = (SP && SP.isDeploymentPage)
            ? SP.isDeploymentPage()
            : /scriptdeploy\.nl/i.test(location.pathname);
        return esDespliegue
            ? { did: id, sid: (SP && SP.scriptId) ? SP.scriptId() : 0 }
            : { sid: id, did: 0 };
    }

    function esEjecutable(ctx) {
        if (!ctx.did) {
            const tipo = document.getElementById('scripttype');
            const v = tipo ? String(tipo.value || '').toUpperCase() : '';
            return v === 'MAPREDUCE' || v === 'SCHEDULED';
        }
        return !!document.getElementById('instancestatuspage_fs_lbl');
    }

    let _hookPuesto = false;
    function prepararMenu() {
        if (_hookPuesto) return;
        const ctx = contextoPagina();
        if (!ctx || !esEjecutable(ctx)) return;
        _hookPuesto = true;
        try {
            const s = document.createElement('script');
            s.async = false;
            s.src = chrome.runtime.getURL('scripts/modules/script_execute/script_execute_hook.js');
            s.onload = function () { this.remove(); };
            (document.head || document.documentElement).appendChild(s);
        } catch (e) { _hookPuesto = false; }
    }

    function initPagina() {
        if (!PAGINA_RE.test(location.pathname)) return;
        const RB = window.NSFT_RecordButtons;
        if (!RB || RB.isEditMode() || !RB.hasRecordId()) return;
        if (_modo === 'menu') { prepararMenu(); return; }
        if (_unsub || document.getElementById(BTN_ID)) return;
        const intenta = () => {
            if (!_on || ponerBoton()) parar();
        };
        const parar = () => {
            if (_unsub) { _unsub(); _unsub = null; }
            clearTimeout(_plazoBoton);
        };
        if (window.NSFT_Observer && NSFT_Observer.subscribe) {
            _unsub = NSFT_Observer.subscribe(intenta, { throttle: 300, immediate: true });
            _plazoBoton = setTimeout(parar, 15000);
        } else {
            intenta();
        }
    }

    function ponerBoton() {
        if (document.getElementById(BTN_ID)) return true;
        const RB = window.NSFT_RecordButtons;
        const anchor = RB && RB.findEditBtn();
        if (!anchor) return false;
        if (document.getElementById('submitexecute')) return true;
        const ctx = contextoPagina();
        if (!ctx || !esEjecutable(ctx)) return true;

        const built = RB.createButtonTable({
            tableId: 'tbl_' + BTN_ID,
            btnId: BTN_ID,
            label: T('sx_btn_run', 'Execute'),
            isSecondary: false
        });
        built.btn.title = T('sx_btn_run_title', 'Run this script now without leaving the page');
        built.btn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            lanzarDesdeFicha(built.btn);
        });
        RB.injectAfter(anchor, built.table);
        return true;
    }

    function quitarBoton() {
        const b = document.getElementById(BTN_ID);
        if (!b) return;
        const td = b.closest('td.uir-button-wrapper') || (b.closest('table') && b.closest('table').parentNode);
        if (td && td.tagName === 'TD') td.remove();
        else b.remove();
    }

    function rotuloBoton(btn, texto) {
        if (btn.tagName === 'INPUT') { btn.value = texto; return; }
        const span = btn.querySelector('.uir-button-label');
        if (span) span.textContent = texto; else btn.textContent = texto;
    }

    async function lanzarDesdeFicha(btn) {
        if (btn && btn.disabled) return;
        const ctx = contextoPagina();
        if (!ctx) return;
        if (btn) {
            btn.disabled = true;
            rotuloBoton(btn, T('sx_checking_short', 'Checking…'));
        }
        try {
            if (ctx.did) { await lanzar({ did: ctx.did }); return; }
            const r = await pedir('script', { sid: ctx.sid }, 45000);
            if (r.error) { await avisarError(r.error); return; }
            const filas = (r.data && r.data.rows) || [];
            if (!filas.length) { await alerta(T('sx_err_nodeploy', 'This script has no deployments.')); return; }
            if (filas[0].inactive) { await alerta(T('sx_err_inactive', 'This script is inactive, so NetSuite will not run it.')); return; }
            const desplegados = filas.filter((f) => f.deployed);
            if (!desplegados.length) { await alerta(T('sx_err_undeployed_all', 'None of this script\'s deployments is deployed.')); return; }
            if (desplegados.length === 1) { await lanzar({ did: desplegados[0].did }); return; }
            abrir({ rows: desplegados, soloScript: filas[0].sname });
        } finally {
            if (btn) {
                btn.disabled = false;
                rotuloBoton(btn, T('sx_btn_run', 'Execute'));
            }
        }
    }


    let _backdrop = null;
    let _modal = null;
    let _filas = [];
    let _vis = [];
    let _sel = '';
    let _term = '';
    let _estado = 'cargando';
    let _error = '';
    let _ocupado = false;
    let _gen = 0;

    function tema() {
        try { return document.documentElement.getAttribute('data-nsft-theme') === 'dark' ? 'dark' : 'light'; }
        catch (e) { return 'light'; }
    }

    function svg(d, sw) {
        return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="' + (sw || 1.8) + '" '
            + 'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="' + d + '"/></svg>';
    }

    const ICONO_RUN = 'M7 5l12 7-12 7z';
    const ICONO_LUPA = 'M11 5a6 6 0 1 0 0 12 6 6 0 0 0 0-12zM15.5 15.5L20 20';

    function abrir(opts) {
        cerrar();
        const titulo = 'NetSuite Full Tools - ' + T('sx_title', 'Run script');
        const clear = T('sql_find_clear', 'Clear search');
        const wrap = document.createElement('div');
        wrap.innerHTML = `
        <div id="${MODAL_ID}" class="nsft-modal-backdrop" data-theme="${tema()}">
        <div class="nsft-modal nsft-modal--dialog nsft-sx" data-nsft-ui data-theme="${tema()}"
             tabindex="-1" role="dialog" aria-modal="true" aria-label="${esc(titulo)}">
            <div class="nsft-modal-header">
                <span class="nsft-modal-title">${svg(ICONO_RUN)}<span>${esc(titulo)}</span></span>
                <span class="nsft-header-actions">
                    <button type="button" class="nsft-modal-btn-close nsft-sx-close" title="${esc(T('sql_close', 'Close'))}">✕</button>
                </span>
                <div class="nsft-modal-header-line"></div>
            </div>
            <div class="nsft-sx-top">
                <div class="nsft-sx-searchbar">
                    <span class="nsft-sx-searchicon">${svg(ICONO_LUPA, 2)}</span>
                    <input type="text" class="nsft-sx-q" spellcheck="false" autocomplete="off">
                    <button type="button" class="nsft-sx-clearbtn" title="${esc(clear)}" aria-label="${esc(clear)}">${svg('M6 6l12 12M18 6L6 18', 2.4)}</button>
                </div>
            </div>
            <div class="nsft-sx-scope" hidden></div>
            <div class="nsft-sx-results" role="listbox"></div>
            <div class="nsft-sx-statusbar">
                <span class="nsft-sx-statusline"></span>
                <span class="nsft-sx-spacer"></span>
                <span class="nsft-sx-hints">${esc(T('sx_hints', '↑↓ · ↵ run · Esc close'))}</span>
            </div>
        </div>
        </div>`;
        _backdrop = wrap.firstElementChild;
        _modal = _backdrop.firstElementChild;
        document.body.appendChild(_backdrop);

        const q = _modal.querySelector('.nsft-sx-q');
        q.placeholder = T('sx_ph', 'Search by script or deployment name or ID…');
        conectar();

        if (opts.rows) {
            const scope = _modal.querySelector('.nsft-sx-scope');
            scope.textContent = T('sx_scope', 'Deployments of $1', [opts.soloScript || '']);
            scope.hidden = false;
            _filas = opts.rows.slice();
            _estado = 'listo';
            filtrar();
        } else {
            _estado = 'cargando';
            pintar();
            const gen = _gen;
            pedir('list', {}, 60000).then((r) => {
                if (!_modal || gen !== _gen) return;
                if (r.error) {
                    _estado = 'error';
                    _error = textoError(r.error);
                } else {
                    _filas = (r.data && r.data.rows) || [];
                    _estado = 'listo';
                }
                filtrar();
            });
        }
        q.focus();
    }

    function cerrar() {
        _gen++;
        if (_backdrop && _backdrop.parentNode) _backdrop.parentNode.removeChild(_backdrop);
        _backdrop = null;
        _modal = null;
        _filas = [];
        _vis = [];
        _sel = '';
        _term = '';
        _ocupado = false;
    }

    function conectar() {
        const q = _modal.querySelector('.nsft-sx-q');
        const barra = _modal.querySelector('.nsft-sx-searchbar');

        _modal.querySelector('.nsft-sx-close').addEventListener('click', cerrar);
        _backdrop.addEventListener('click', (e) => { if (e.target === _backdrop) cerrar(); });

        q.addEventListener('input', () => {
            barra.classList.toggle('has-query', !!q.value);
            _term = q.value.trim();
            _sel = '';
            filtrar();
        });
        _modal.querySelector('.nsft-sx-clearbtn').addEventListener('click', () => {
            q.value = '';
            barra.classList.remove('has-query');
            _term = '';
            _sel = '';
            filtrar();
            q.focus();
        });

        _modal.querySelector('.nsft-sx-results').addEventListener('click', (e) => {
            const row = e.target.closest('.nsft-sx-row');
            if (!row) return;
            _sel = row.dataset.did;
            pintar();
            lanzarDesdeSelector(_sel);
        });

        _modal.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                e.preventDefault();
                e.stopPropagation();
                if (q.value) {
                    q.value = '';
                    barra.classList.remove('has-query');
                    _term = '';
                    _sel = '';
                    filtrar();
                    q.focus();
                } else {
                    cerrar();
                }
                return;
            }
            if (!_vis.length) return;
            const idx = _vis.findIndex((f) => f.did === _sel);
            if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                e.preventDefault();
                const next = idx < 0
                    ? (e.key === 'ArrowDown' ? 0 : _vis.length - 1)
                    : Math.max(0, Math.min(_vis.length - 1, idx + (e.key === 'ArrowDown' ? 1 : -1)));
                _sel = _vis[next].did;
                pintar();
                revelar();
                return;
            }
            if (e.key === 'Enter') {
                e.preventDefault();
                if (idx < 0) { _sel = _vis[0].did; pintar(); revelar(); return; }
                lanzarDesdeSelector(_sel);
            }
        });
    }

    function pajar(f) {
        return [f.sname, f.sscriptid, f.dtitle, f.dscriptid, f.sid, f.did].join(' ');
    }

    function filtrar() {
        const TS = window.NSFT_TextSearch;
        const t = _term;
        _vis = !t ? _filas.slice() : _filas.filter((f) => TS
            ? TS.match(pajar(f), t)
            : pajar(f).toLowerCase().indexOf(t.toLowerCase()) !== -1);
        if (_sel && !_vis.some((f) => f.did === _sel)) _sel = '';
        pintar();
    }

    function tipoCorto(stype) {
        return stype === 'MAPREDUCE' ? T('sx_type_mr', 'Map/Reduce') : T('sx_type_sch', 'Scheduled');
    }

    const TONO = { SCHEDULED: 'ok', TESTING: 'warn', NOTSCHEDULED: 'off' };

    function pintar() {
        if (!_modal) return;
        const res = _modal.querySelector('.nsft-sx-results');
        const line = _modal.querySelector('.nsft-sx-statusline');
        const TS = window.NSFT_TextSearch;
        const hl = (txt) => (TS && _term) ? TS.markHtml(txt, _term, 'nsft-sx-hl') : esc(txt);

        if (_estado === 'cargando') {
            res.innerHTML = '<div class="nsft-sx-empty">' + esc(T('sx_loading', 'Loading the account\'s scripts…')) + '</div>';
            line.textContent = '';
            return;
        }
        if (_estado === 'error') {
            res.innerHTML = '<div class="nsft-sx-empty is-error">' + esc(_error) + '</div>';
            line.textContent = '';
            return;
        }
        if (!_vis.length) {
            res.innerHTML = '<div class="nsft-sx-empty">' + esc(_filas.length
                ? T('sx_none', 'No deployment matches the search.')
                : T('sx_empty', 'This account has no deployed Map/Reduce or Scheduled scripts.')) + '</div>';
            line.textContent = '';
            return;
        }

        const html = _vis.map((f, i) => {
            const activa = f.did === _sel;
            const tono = TONO[f.dstatus] || '';
            return '<div class="nsft-sx-row' + (activa ? ' is-active' : (i % 2 ? ' is-zebra' : '')) + '"'
                + ' role="option" aria-selected="' + activa + '" data-did="' + esc(f.did) + '">'
                + '<span class="nsft-sx-type is-' + (f.stype === 'MAPREDUCE' ? 'mr' : 'sch') + '">' + esc(tipoCorto(f.stype)) + '</span>'
                + '<span class="nsft-sx-main">'
                +   '<span class="nsft-sx-name">' + hl(f.sname || f.sscriptid) + '</span>'
                +   '<span class="nsft-sx-sub">' + hl(f.dtitle) + ' · <span class="nsft-sx-id">' + hl(f.dscriptid) + '</span></span>'
                + '</span>'
                + '<span class="nsft-sx-badge' + (tono ? ' is-' + tono : '') + '">' + esc(f.dstatus) + '</span>'
                + '<button type="button" class="nsft-sx-go" tabindex="-1">' + svg(ICONO_RUN, 2) + '<span>' + esc(T('sx_btn_run', 'Execute')) + '</span></button>'
                + '</div>';
        }).join('');
        res.innerHTML = html;
        line.textContent = _ocupado
            ? T('sx_checking', 'Checking the deployment…')
            : T('sx_count', '$1 deployments', [String(_vis.length)]) + (_term ? ' · “' + _term + '”' : '');
    }

    function revelar() {
        const res = _modal && _modal.querySelector('.nsft-sx-results');
        const row = res && res.querySelector('.nsft-sx-row.is-active');
        if (!row) return;
        const top = row.offsetTop;
        const bottom = top + row.offsetHeight;
        if (top < res.scrollTop) res.scrollTop = top;
        else if (bottom > res.scrollTop + res.clientHeight) res.scrollTop = bottom - res.clientHeight;
    }

    async function lanzarDesdeSelector(did) {
        if (_ocupado || !did) return;
        _ocupado = true;
        pintar();
        try {
            await lanzar({ did: did });
        } finally {
            _ocupado = false;
            if (_modal) { pintar(); const q = _modal.querySelector('.nsft-sx-q'); if (q) q.focus(); }
        }
    }


    function esProduccion() {
        try {
            const env = window.NSFT_ENV && NSFT_ENV.envFromUrl(location.href);
            return !!env && env.code === 'PRD';
        } catch (e) { return false; }
    }

    function nombreEntorno() {
        try {
            const env = window.NSFT_ENV && NSFT_ENV.envFromUrl(location.href);
            return env ? (env.code === 'PRD' ? T('sx_env_prd', 'PRODUCTION') : env.name) : '';
        } catch (e) { return ''; }
    }

    function estadoCola(status) {
        return status === 'PENDING' ? T('sx_busy_pending', 'queued') : T('sx_busy_processing', 'running');
    }

    function alerta(texto) {
        const D = window.NSFT_Dialog;
        if (!D) return Promise.resolve();
        return D.alert({ title: T('sx_title', 'Run script'), body: texto });
    }

    function textoError(err) {
        const c = (err && err.code) || '';
        if (c === 'stale') return T('sx_err_stale', 'Reload the tab and try again.');
        if (c === 'session') return T('sx_err_session', 'Your NetSuite session expired. Log in again and retry.');
        if (c === 'timeout') return T('sx_err_timeout', 'NetSuite did not answer in time.');
        if (c === 'notfound') return T('sx_err_notfound', 'That deployment no longer exists.');
        if (c === 'nobutton') {
            return T('sx_err_nobutton', 'NetSuite does not offer «Save & Execute» for this deployment: your role may not be allowed to run it, or its status does not allow it.')
                + (err.message ? '\n\n' + err.message : '');
        }
        if (c === 'netsuite' && err.message) return T('sx_err_netsuite', 'NetSuite answered: $1', [err.message]);
        return T('sx_err_generic', 'The script could not be run.') + (err && err.message ? '\n\n' + err.message : '');
    }

    function avisarError(err) { return alerta(textoError(err)); }

    async function lanzar(sel) {
        const D = window.NSFT_Dialog;
        const pc = await pedir('precheck', { did: sel.did }, 60000);
        if (pc.error) { await avisarError(pc.error); return; }
        let dep = pc.data.dep;
        const siblings = pc.data.siblings || [];
        const busy = pc.data.busy || {};

        if (dep.inactive) { await alerta(T('sx_err_inactive', 'This script is inactive, so NetSuite will not run it.')); return; }
        if (!dep.deployed) { await alerta(T('sx_err_undeployed', 'This deployment is not deployed.')); return; }

        const b = busy[dep.did];
        if (b) {
            const dice = T('sx_err_busy', 'This deployment already has a run $1 since $2.', [estadoCola(b.status), b.since || '?']);
            const libre = siblings.filter((s) => s.did !== dep.did && !busy[s.did])[0];
            if (!libre || !D) { await alerta(dice); return; }
            const ok = await D.confirm({
                title: T('sx_busy_title', 'Deployment busy'),
                body: dice + '\n\n' + T('sx_busy_alt', 'Run the free deployment «$1» ($2) instead?', [libre.dtitle, libre.dscriptid]),
                ok: T('sx_busy_alt_ok', 'Run that one')
            });
            if (!ok) return;
            dep = libre;
        }

        const prod = esProduccion();
        if ((prod || _confirmSandbox) && D) {
            const cuerpo = [
                dep.sname,
                T('sx_confirm_dep', 'Deployment: $1 ($2)', [dep.dtitle, dep.dscriptid]),
                T('sx_confirm_env', 'Account: $1', [nombreEntorno()])
            ].join('\n');
            const ok = await D.confirm({
                title: prod ? T('sx_confirm_title_prd', 'Run it in PRODUCTION?') : T('sx_confirm_title', 'Run it now?'),
                body: cuerpo,
                ok: T('sx_confirm_ok', 'Run'),
                danger: prod
            });
            if (!ok) return;
        }

        cerrar();
        const card = tarjeta(dep);
        const r = await pedir('execute', { did: dep.did, sid: dep.sid }, 240000);
        if (r.error) {
            if (r.error.code === 'timeout' && r.error.stage !== 'carga') {
                card.enviado(false, T('sx_card_unsure', 'NetSuite did not confirm it in time; check the status page before running it again.'));
                return;
            }
            card.error(textoError(r.error));
            return;
        }
        const x = r.data || {};
        if (x.found) {
            card.estado({ state: 'PENDING' });
            seguir(card, dep, x);
            encenderLogsEnVivo(dep);
        } else {
            card.enviado(x.searchOk === false);
        }
    }

    function encenderLogsEnVivo(dep) {
        if (!PAGINA_RE.test(location.pathname)) return;
        const ctx = contextoPagina();
        if (!ctx) return;
        if (String(ctx.did) === String(dep.did) || String(ctx.sid) === String(dep.sid)) {
            window.dispatchEvent(new CustomEvent('nsft-live-mode-start'));
        }
    }

    const FINALES = { COMPLETE: 1, FAILED: 1, CANCELED: 1 };

    function seguir(card, dep, x) {
        let fallos = 0;
        const tick = async () => {
            if (!card.vivo()) return;
            if (document.hidden) { setTimeout(tick, 5000); return; }
            const r = await pedir('track', {
                did: dep.did, sid: dep.sid, stype: dep.stype, known: x.known || [], task: x.task || ''
            }, 45000);
            if (!card.vivo()) return;
            if (r.error) {
                if (++fallos >= 4) { card.perdido(); return; }
                setTimeout(tick, 10000);
                return;
            }
            fallos = 0;
            card.estado(r.data || {});
            if (!FINALES[(r.data || {}).state]) setTimeout(tick, 5000);
        };
        setTimeout(tick, 3000);
    }


    const ETAPA = { GET_INPUT: 'getInputData', MAP: 'map', SHUFFLE: 'shuffle', REDUCE: 'reduce', SUMMARIZE: 'summarize' };

    function urlEstado(dep) {
        const pagina = dep.stype === 'MAPREDUCE' ? 'mapreducescriptstatus.nl' : 'scriptstatus.nl';
        return '/app/common/scripting/' + pagina + '?sortcol=dcreated&sortdir=DESC&date=TODAY&scripttype='
            + encodeURIComponent(dep.sid) + '&primarykey=';
    }

    function urlLogs(dep) {
        return '/app/common/scripting/scriptnotearchive.nl?daterange=ALL&date=ALL&sortcol=timestamp&sortdir=DESC&loglevel='
            + '&scriptId=' + encodeURIComponent(dep.sid) + '&scriptRecordId=' + encodeURIComponent(dep.did);
    }

    function el(tag, cls, txt) {
        const n = document.createElement(tag);
        if (cls) n.className = cls;
        if (txt != null) n.textContent = txt;
        return n;
    }

    function tarjeta(dep) {
        const card = el('div', 'nsft-sx-card is-sending');
        card.setAttribute('data-nsft-ui', '');
        card.setAttribute('role', 'status');
        card.setAttribute('aria-live', 'polite');

        const head = el('div', 'nsft-sx-card-head');
        const dot = el('span', 'nsft-sx-card-dot');
        const state = el('span', 'nsft-sx-card-state', T('sx_card_sending', 'Sending to the queue…'));
        const close = el('button', 'nsft-sx-card-close', '✕');
        close.type = 'button';
        close.title = T('sql_close', 'Close');
        close.setAttribute('aria-label', close.title);
        head.append(dot, state, close);

        const name = el('div', 'nsft-sx-card-name', dep.sname || dep.sscriptid);
        const sub = el('div', 'nsft-sx-card-sub', (dep.dtitle || '') + ' · ' + (dep.dscriptid || ''));
        const detail = el('div', 'nsft-sx-card-detail');
        detail.hidden = true;
        const bar = el('div', 'nsft-sx-bar');
        const fill = el('span');
        bar.appendChild(fill);
        bar.hidden = true;

        const links = el('div', 'nsft-sx-card-links');
        const aEstado = el('a', '', T('sx_card_status_link', 'Status page'));
        aEstado.href = urlEstado(dep);
        aEstado.target = '_blank';
        aEstado.rel = 'noopener';
        const aLogs = el('a', '', T('sx_card_logs_link', 'Execution logs'));
        aLogs.href = urlLogs(dep);
        aLogs.target = '_blank';
        aLogs.rel = 'noopener';
        links.append(aEstado, aLogs);

        card.append(head, name, sub, detail, bar, links);
        const montada = window.NSFT_Notices && NSFT_Notices.mount(card);
        if (!montada) {
            card.classList.add('is-loose');
            document.body.appendChild(card);
        }

        let vivo = true;
        let adios = 0;
        const quitar = () => {
            vivo = false;
            clearTimeout(adios);
            if (window.NSFT_Notices) NSFT_Notices.unmount(card); else card.remove();
        };
        close.addEventListener('click', quitar);

        const tono = (t) => {
            card.className = 'nsft-sx-card is-' + t + (card.classList.contains('is-loose') ? ' is-loose' : '');
        };
        const texto = (t) => { state.textContent = t; };
        const detalle = (t) => { detail.textContent = t || ''; detail.hidden = !t; };

        return {
            vivo: () => vivo && card.isConnected,
            estado(s) {
                const st = s.state || 'PENDING';
                bar.hidden = true;
                if (st === 'PENDING') {
                    tono('pending'); texto(T('sx_card_pending', 'Queued')); detalle('');
                } else if (st === 'PROCESSING') {
                    tono('processing'); texto(T('sx_card_processing', 'Running'));
                    const partes = [];
                    if (s.stage && ETAPA[s.stage]) partes.push(T('sx_card_stage', 'Stage: $1', [ETAPA[s.stage]]));
                    if (s.percent != null) partes.push(s.percent + '%');
                    detalle(partes.join(' · '));
                    if (s.percent != null) { bar.hidden = false; fill.style.width = s.percent + '%'; }
                } else if (st === 'COMPLETE') {
                    tono('done'); texto(T('sx_card_done', 'Finished')); detalle('');
                    adios = setTimeout(quitar, 20000);
                } else if (st === 'FAILED') {
                    tono('failed'); texto(T('sx_card_failed', 'Failed'));
                    detalle(s.stage && ETAPA[s.stage] ? T('sx_card_stage', 'Stage: $1', [ETAPA[s.stage]]) : T('sx_card_failed_desc', 'Check the execution logs.'));
                } else if (st === 'CANCELED') {
                    tono('canceled'); texto(T('sx_card_canceled', 'Canceled')); detalle('');
                }
            },
            enviado(sinCola, dudoso) {
                tono('sent');
                texto(T('sx_card_sent', 'Sent to the queue'));
                detalle(dudoso || (sinCola
                    ? T('sx_card_sent_nosearch', 'Its progress cannot be followed from this page; check the status page.')
                    : T('sx_card_sent_desc', 'NetSuite does not show it in the queue yet; check the status page.')));
            },
            perdido() {
                tono('sent');
                detalle(T('sx_card_lost', 'Its progress can no longer be followed from here; check the status page.'));
            },
            error(msg) {
                tono('failed');
                texto(T('sx_card_error', 'Not run'));
                detalle(msg);
            }
        };
    }

    function esc(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }
})();
