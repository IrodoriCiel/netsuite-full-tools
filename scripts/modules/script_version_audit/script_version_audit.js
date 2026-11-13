(function () {
    'use strict';
    if (window.NSFT_Herramientas) window.NSFT_Herramientas.vigila('#nsft-sva-modal', 'sva');

    const MODAL_ID = 'nsft-sva-modal';
    const BANNER_SEL = '.uir-alert-box.deprecatedScriptBanner';
    const LINK_CLASS = 'nsft-sva-bannerlink';
    const BRIDGE_URL = '/app/common/scripting/PlatformClientScriptHandler.nl';

    const CONSULTA = 'SELECT s.id, s.name, s.scriptid, s.scripttype, BUILTIN.DF(s.scripttype) AS tipo, '
        + 's.apiversion, s.isinactive, s.frombundle, s.scriptfile, f.name AS archivo, '
        + "s.owner AS ownerid, BUILTIN.DF(s.owner) AS ownerdf, TRIM(e.firstname || ' ' || e.lastname) AS ownername, e.isinactive AS ownerinactive, "
        + "(SELECT COUNT(*) FROM scriptdeployment d WHERE d.script = s.id AND d.isdeployed = 'T') AS desplegados "
        + 'FROM script s LEFT JOIN file f ON f.id = s.scriptfile LEFT JOIN employee e ON e.id = s.owner '
        + "WHERE s.apiversion IN ('1.0', '2.0') ORDER BY s.name";

    let _modal = null;
    let _backdrop = null;
    let _token = 0;
    let _filas = [];
    let _cargando = false;
    let _error = '';
    let _origin = 'own';
    let _ver = 'all';
    let _soloMios = true;
    const _yo = idUsuario();
    let _term = '';
    let _sort = 'risk';
    let _dir = 1;
    let _sel = null;
    let _toastTimer = null;

    function idUsuario() {
        try {
            const m = /(?:^|;\s*)lastUser=([^;]*)/.exec(document.cookie || '');
            const p = m ? decodeURIComponent(m[1]).split('_') : [];
            const id = p.length >= 4 ? p[p.length - 2] : '';
            return /^-?\d+$/.test(id) ? id : '';
        } catch (e) { return ''; }
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


    const banner = document.querySelector(BANNER_SEL);
    if (banner) ponEnlace(banner);
    else if (window.NSFT_Observer && window.NSFT_Observer.subscribe) {
        let fuera = null;
        const corta = () => { if (fuera) { fuera(); fuera = null; } };
        fuera = window.NSFT_Observer.subscribe(() => {
            const b = document.querySelector(BANNER_SEL);
            if (b) { corta(); ponEnlace(b); }
        }, { throttle: 300 });
        const plazo = () => setTimeout(corta, 5000);
        if (document.readyState === 'complete') plazo();
        else window.addEventListener('load', plazo, { once: true });
    }

    function ponEnlace(b) {
        if (b.querySelector('.' + LINK_CLASS)) return;
        const destino = b.querySelector('.uir-alert-box-description, .descr')
            || b.querySelector('.uir-alert-box-content, .content') || b;
        const a = document.createElement('a');
        a.href = '#';
        a.className = LINK_CLASS;
        a.setAttribute('role', 'button');
        const logo = document.createElement('img');
        logo.className = 'nsft-sva-bannerlogo';
        logo.src = chrome.runtime.getURL('assets/img/logomini.png');
        logo.alt = '';
        logo.title = 'NetSuite Full Tools';
        a.append(logo, document.createTextNode(i18n('sva_banner_link', 'View scripts')));
        a.addEventListener('click', (e) => {
            e.preventDefault();
            if (_modal) cerrar(); else abrir();
        });
        destino.appendChild(document.createTextNode(' '));
        destino.appendChild(a);
    }

    chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== 'local' || !changes.nsftTheme) return;
        const modo = changes.nsftTheme.newValue === 'dark' ? 'dark' : 'light';
        const fondo = document.getElementById(MODAL_ID);
        if (fondo) {
            fondo.setAttribute('data-theme', modo);
            const dentro = fondo.querySelector('.nsft-modal');
            if (dentro) dentro.setAttribute('data-theme', modo);
        }
    });


    function resolveTheme() {
        try {
            return document.documentElement.getAttribute('data-nsft-theme') === 'dark' ? 'dark' : 'light';
        } catch (e) { return 'light'; }
    }

    function svg(d, sw) {
        return '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="' + (sw || 1.6) + '" '
            + 'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="' + d + '"/></svg>';
    }

    const IC = {
        code: 'M5 4L1.5 8 5 12M11 4l3.5 4-3.5 4M9.5 2.5l-3 11',
        search: 'M7 2.5a4.5 4.5 0 1 0 0 9 4.5 4.5 0 0 0 0-9zM10.5 10.5L14 14',
        x: 'M3.5 3.5l9 9M12.5 3.5l-9 9',
        export: 'M8 2v8M4.5 6.5L8 10l3.5-3.5M3 13.5h10',
        copy: 'M5.5 5.5h8v8h-8zM10.5 5.5V3.5a1 1 0 0 0-1-1h-6a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2',
        open: 'M6.5 3.5h-3v9h9v-3M9 2.5h4.5V7M13.5 2.5L7.5 8.5'
    };

    function kbd(t) { return '<span class="nsft-sva-kbd">' + esc(t) + '</span>'; }

    function abrir() {
        const titulo = '' + i18n('sva_title', 'Scripts to upgrade to SuiteScript 2.1');
        const th = (k, l, extra) => k
            ? `<button type="button" class="nsft-sva-sort${extra || ''}" data-sort="${k}">${esc(l)} <i></i></button>`
            : `<span class="nsft-sva-thlabel">${esc(l)}</span>`;

        const wrap = document.createElement('div');
        wrap.innerHTML = `
        <div id="${MODAL_ID}" class="nsft-modal-backdrop" data-theme="${resolveTheme()}">
        <div class="nsft-modal nsft-modal--dialog nsft-sva" data-nsft-ui data-theme="${resolveTheme()}"
             tabindex="-1" role="dialog" aria-modal="true" aria-label="${esc(titulo)}">
            <div class="nsft-modal-header">
                <span class="nsft-modal-title">${svg(IC.code)}<span>${esc(titulo)}</span></span>
                <div class="nsft-modal-tools nsft-modal-hide-min">
                    <button type="button" class="nsft-modal-tool nsft-modal-tool--baja nsft-modal-tool--exportar" id="nsft-sva-export"><span class="nsft-modal-tc nsft-c1">${svg(IC.export)}</span><span>${esc(i18n('sva_export', 'Export'))}</span></button>
                </div>
                <span class="nsft-header-actions">
                    <button type="button" id="nsft-sva-close" class="nsft-modal-btn-close" title="${esc(i18n('sql_close', 'Close'))}">✕</button>
                </span>
                <div class="nsft-modal-header-line"></div>
            </div>

            <div class="nsft-sva-tiles">
                <button type="button" class="nsft-sva-tile" data-origin="all">
                    <span class="nsft-sva-tile-label">${esc(i18n('sva_tile_total', 'Total to upgrade'))}</span>
                    <span class="nsft-sva-tile-num is-total" data-n="all"></span>
                    <span class="nsft-sva-tile-sub">${esc(i18n('sva_tile_total_sub', 'Using SuiteScript 1.0, 2.0 or 2.x'))}</span>
                </button>
                <button type="button" class="nsft-sva-tile" data-origin="own">
                    <span class="nsft-sva-tile-top">
                        <span class="nsft-sva-tile-label">${esc(i18n('sva_tile_own', 'Yours · up to you'))}</span>
                        <span class="nsft-sva-tag nsft-alerta">${esc(i18n('sva_tag_action', 'Action'))}</span>
                    </span>
                    <span class="nsft-sva-tile-num is-own" data-n="own"></span>
                    <span class="nsft-sva-bar"><span class="is-v1" data-bar="v1"></span><span class="is-v2" data-bar="v2"></span></span>
                    <span class="nsft-sva-legend">
                        <span><i class="nsft-sva-sw is-v1"></i><b data-n="own-v1"></b> ${esc(i18n('sva_leg_v1', 'rewrite (1.0)'))}</span>
                        <span><i class="nsft-sva-sw is-v2"></i><b data-n="own-v2"></b> ${esc(i18n('sva_leg_v2', 'change @NApiVersion'))}</span>
                    </span>
                </button>
                <button type="button" class="nsft-sva-tile" data-origin="ns">
                    <span class="nsft-sva-tile-label">${esc(i18n('sva_chip_ns', 'NetSuite SuiteApps'))}</span>
                    <span class="nsft-sva-tile-num" data-n="ns"></span>
                    <span class="nsft-sva-tile-sub">${esc(i18n('sva_todo_ns', 'Updated by Oracle'))}</span>
                </button>
                <button type="button" class="nsft-sva-tile" data-origin="vendor">
                    <span class="nsft-sva-tile-label">${esc(i18n('sva_chip_vendor', 'Third-party bundles'))}</span>
                    <span class="nsft-sva-tile-num" data-n="vendor"></span>
                    <span class="nsft-sva-tile-sub">${esc(i18n('sva_todo_vendor', 'Ask the vendor'))}</span>
                </button>
            </div>

            <div class="nsft-sva-toolbar">
                <div class="nsft-sva-search" id="nsft-sva-searchbar">
                    <span class="nsft-sva-searchicon">${svg(IC.search)}</span>
                    <input type="text" id="nsft-sva-q" spellcheck="false" autocomplete="off">
                    <span class="nsft-sva-slash">${kbd('/')}</span>
                    <button type="button" class="nsft-sva-clearbtn" id="nsft-sva-clear" title="${esc(i18n('sql_find_clear', 'Clear search'))}" aria-label="${esc(i18n('sql_find_clear', 'Clear search'))}">${svg(IC.x, 1.9)}</button>
                </div>
                <div class="nsft-sva-segwrap">${esc(i18n('sva_col_owner', 'Owner'))}
                    <div class="nsft-sva-seg" data-seg="owner" role="group">
                        <button type="button" data-own="mine">${esc(i18n('sva_owner_mine', 'Mine'))} <span class="nsft-sva-count" data-c="mine"></span></button>
                        <button type="button" data-own="all">${esc(i18n('sva_owner_all', 'All'))} <span class="nsft-sva-count" data-c="owners"></span></button>
                    </div>
                </div>
                <div class="nsft-sva-segwrap">${esc(i18n('sva_col_version', 'Version'))}
                    <div class="nsft-sva-seg" data-seg="ver" role="group">
                        <button type="button" data-ver="all">${esc(i18n('sva_ver_all', 'All'))} <span class="nsft-sva-count" data-c="all"></span></button>
                        <button type="button" data-ver="v1">${esc(i18n('sva_ver_v1', 'SuiteScript 1.0'))} <span class="nsft-sva-count" data-c="v1"></span></button>
                        <button type="button" data-ver="v2">${esc(i18n('sva_ver_v2', 'SuiteScript 2.0 / 2.x'))} <span class="nsft-sva-count" data-c="v2"></span></button>
                    </div>
                </div>
            </div>

            <div class="nsft-sva-grid nsft-sva-thead">
                ${th('risk', i18n('sva_col_risk', 'Risk'))}
                ${th('name', i18n('sva_col_name', 'Name'))}
                ${th('', i18n('sva_col_type', 'Type'))}
                ${th('version', i18n('sva_col_version', 'Version'))}
                ${th('', i18n('sva_col_todo', 'What to do'))}
                ${th('', i18n('sva_col_origin', 'Origin'))}
                ${th('owner', i18n('sva_col_owner', 'Owner'))}
                ${th('deployed', i18n('sva_col_deploy', 'Deployments'), ' is-right')}
                <span></span>
            </div>
            <div class="nsft-sva-list" id="nsft-sva-results" role="listbox"></div>

            <div class="nsft-sva-footer">
                <span id="nsft-sva-statusline"></span>
                <span class="nsft-sva-keys">
                    <span>${kbd('↑↓')}${esc(i18n('sva_key_nav', 'navigate'))}</span>
                    <span>${kbd('↵')}${esc(i18n('sva_key_open', 'open'))}</span>
                    <span>${kbd('Ctrl C')}${esc(i18n('sva_key_copy', 'copy ID'))}</span>
                    <span>${kbd('Esc')}${esc(i18n('sva_key_close', 'close'))}</span>
                </span>
            </div>
        </div>
        </div>`;
        _backdrop = wrap.firstElementChild;
        _modal = _backdrop.firstElementChild;
        document.body.appendChild(_backdrop);

        const q = _modal.querySelector('#nsft-sva-q');
        q.placeholder = i18n('sva_search_ph', 'Filter by name, ID, file or bundle…');
        if (_term) {
            q.value = _term;
            _modal.querySelector('#nsft-sva-searchbar').classList.add('has-query');
        }
        wire();
        cargar();
        q.focus();
    }

    function cerrar() {
        if (_backdrop && _backdrop.parentNode) _backdrop.parentNode.removeChild(_backdrop);
        _backdrop = null;
        _modal = null;
        _sel = null;
        _token++;
    }

    function wire() {
        const q = _modal.querySelector('#nsft-sva-q');
        const bar = _modal.querySelector('#nsft-sva-searchbar');
        const list = _modal.querySelector('#nsft-sva-results');

        _modal.querySelector('#nsft-sva-close').addEventListener('click', cerrar);
        _backdrop.addEventListener('click', (e) => { if (e.target === _backdrop) cerrar(); });

        _modal.querySelector('.nsft-sva-tiles').addEventListener('click', (e) => {
            const t = e.target.closest('.nsft-sva-tile');
            if (!t) return;
            _origin = t.dataset.origin;
            reinicia();
        });
        _modal.querySelector('.nsft-sva-seg[data-seg="owner"]').addEventListener('click', (e) => {
            const b = e.target.closest('button[data-own]');
            if (!b) return;
            _soloMios = b.dataset.own === 'mine';
            pintarTarjetas();
            reinicia();
        });
        _modal.querySelector('.nsft-sva-seg[data-seg="ver"]').addEventListener('click', (e) => {
            const b = e.target.closest('button[data-ver]');
            if (!b) return;
            _ver = b.dataset.ver;
            reinicia();
        });
        _modal.querySelector('.nsft-sva-thead').addEventListener('click', (e) => {
            const b = e.target.closest('.nsft-sva-sort');
            if (!b) return;
            const k = b.dataset.sort;
            _dir = _sort === k ? -_dir : 1;
            _sort = k;
            pintar();
        });

        q.addEventListener('input', () => {
            _term = q.value;
            bar.classList.toggle('has-query', !!q.value);
            reinicia();
        });
        _modal.querySelector('#nsft-sva-clear').addEventListener('click', () => {
            q.value = '';
            _term = '';
            bar.classList.remove('has-query');
            q.focus();
            reinicia();
        });

        _modal.querySelector('#nsft-sva-export').addEventListener('click', () => exportarCsv(visibles()));

        list.addEventListener('click', (e) => {
            const copy = e.target.closest('[data-copy]');
            if (copy) { copiar(copy.dataset.copy); return; }
            if (e.target.closest('a[href]')) return;
            const row = e.target.closest('.nsft-sva-row');
            if (row) { _sel = row.dataset.id; marcaSel(false); }
        });

        _modal.addEventListener('keydown', (e) => {
            const mod = e.ctrlKey || e.metaKey;
            const enCampo = document.activeElement === q;
            if (e.key === '/' && !enCampo) { e.preventDefault(); q.focus(); q.select(); return; }
            if (e.key === 'Escape') {
                e.preventDefault();
                if (q.value) { q.value = ''; _term = ''; bar.classList.remove('has-query'); reinicia(); return; }
                cerrar();
                return;
            }
            const lista = visibles();
            if (!lista.length) return;
            const idx = lista.findIndex((it) => it.id === _sel);
            if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                e.preventDefault();
                const next = Math.max(0, Math.min(lista.length - 1, (idx < 0 ? -1 : idx) + (e.key === 'ArrowDown' ? 1 : -1)));
                _sel = lista[next].id;
                marcaSel(true);
                return;
            }
            if (e.key === 'Enter' && idx > -1) { window.location.href = urlScript(lista[idx]); return; }
            if (mod && e.key.toLowerCase() === 'c' && idx > -1 && !String(window.getSelection()).length) {
                e.preventDefault();
                copiar(lista[idx].scriptid || lista[idx].id);
            }
        });
    }

    function reinicia() {
        _sel = null;
        const list = _modal && _modal.querySelector('#nsft-sva-results');
        if (list) list.scrollTop = 0;
        pintar();
    }

    function toast(txt) {
        const t = _modal && _modal.querySelector('#nsft-sva-statusline');
        if (!t) return;
        t.textContent = txt;
        clearTimeout(_toastTimer);
        _toastTimer = setTimeout(() => { _toastTimer = null; estado(); }, 2000);
    }


    function puente(objeto, metodo, args) {
        return fetch(BRIDGE_URL, {
            method: 'POST',
            credentials: 'include',
            headers: {
                'accept': '*/*',
                'content-type': 'application/json',
                'nsxmlhttprequest': 'NSXMLHttpRequest',
                'cache-control': 'no-cache'
            },
            body: JSON.stringify({ method: 'remoteObject.bridgeCall', params: [objeto, metodo, args] })
        }).then((r) => {
            if (!r.ok) throw new Error('http ' + r.status);
            return r.json();
        }).then((data) => {
            if (!data || data.result === 'error') throw new Error('bridge');
            return data;
        });
    }

    function leeScripts() {
        return puente('queryApiBridge', 'runSuiteQL', JSON.stringify([CONSULTA, '[]', 'SUITE_QL', '']))
            .then((data) => {
                const r = data.result && data.result.result;
                if (!r || !Array.isArray(r.aliases)) throw new Error('forma');
                const al = r.aliases.map((a) => String(a).toLowerCase());
                const out = [];
                for (let i = 0; i < (r.count || 0); i++) {
                    const v = r['v' + i];
                    if (!Array.isArray(v)) continue;
                    const o = {};
                    al.forEach((a, j) => { o[a] = v[j]; });
                    out.push({
                        id: String(o.id == null ? '' : o.id),
                        name: String(o.name || o.scriptid || ''),
                        scriptid: String(o.scriptid || ''),
                        type: String(o.scripttype || ''),
                        typeLabel: String(o.tipo || o.scripttype || ''),
                        version: String(o.apiversion || ''),
                        inactive: o.isinactive === 'T' || o.isinactive === true,
                        bundle: o.frombundle == null || o.frombundle === '' ? '' : String(o.frombundle),
                        fileId: o.scriptfile == null ? '' : String(o.scriptfile),
                        fileName: String(o.archivo || ''),
                        owner: String(o.ownername || o.ownerdf || ''),
                        ownerInactive: o.ownerinactive === 'T' || o.ownerinactive === true,
                        ownerId: o.ownerid == null ? '' : String(o.ownerid),
                        deployed: o.desplegados == null || o.desplegados === '' ? null : Number(o.desplegados)
                    });
                }
                return out;
            });
    }

    function leeBundles() {
        return puente('suiteAppInfoBridge', 'listInstalledBundles', '[null]').then((data) => {
            const r = data.result;
            const l = Array.isArray(data) ? data : Array.isArray(r) ? r
                : (r && Array.isArray(r.result)) ? r.result
                    : (r && r.result && Array.isArray(r.result.result)) ? r.result.result : [];
            const mapa = {};
            l.forEach((b) => {
                if (!b || b.id == null) return;
                const pub = b.publisher && typeof b.publisher === 'object' ? b.publisher.name : b.publisher;
                mapa[String(b.id)] = { name: String(b.name || ''), version: String(b.version || ''), publisher: String(pub || '') };
            });
            return mapa;
        }).catch(() => ({}));
    }

    function cargar() {
        _token++;
        const token = _token;
        _cargando = true;
        _error = '';
        pintar();
        Promise.all([leeScripts(), leeBundles()]).then(([rows, bundles]) => {
            if (token !== _token || !_modal) return;
            _cargando = false;
            _filas = clasifica(rows, bundles);
            _filas.forEach((it) => { it.mine = !!_yo && it.ownerId === _yo; });
            if (_soloMios && !_filas.some((it) => it.mine)) _soloMios = false;
            pintarTarjetas();
            pintar();
        }).catch(() => {
            if (token !== _token || !_modal) return;
            _cargando = false;
            _filas = [];
            _error = i18n('sva_error', 'The account could not be queried.');
            pintarTarjetas();
            pintar();
        });
    }

    function clasifica(rows, bundles) {
        return rows.map((r) => {
            let origin = 'own';
            let originLabel = i18n('sva_origin_own', 'Yours');
            if (r.bundle) {
                const b = bundles[r.bundle];
                const esNs = !!(b && /netsuite|oracle/i.test(b.publisher || ''));
                origin = esNs ? 'ns' : 'vendor';
                originLabel = b && b.name
                    ? b.name + (b.version ? ' ' + b.version : '')
                    : i18n('sva_bundle_n', 'Bundle $1', [r.bundle]);
            }
            const esV1 = r.version === '1.0';
            return Object.assign({}, r, {
                origin,
                originLabel,
                vkey: esV1 ? 'v1' : 'v2',
                rank: gravedad(origin, esV1)
            });
        });
    }

    function gravedad(origin, esV1) {
        if (origin === 'own') return esV1 ? 0 : 1;
        if (origin === 'vendor') return esV1 ? 2 : 3;
        return esV1 ? 4 : 5;
    }

    const RIESGOS = [
        { k: 'crit', msg: 'sva_risk_crit', fb: 'Critical' },
        { k: 'high', msg: 'sva_risk_high', fb: 'High' },
        { k: 'mid', msg: 'sva_risk_mid', fb: 'Medium' },
        { k: 'mid', msg: 'sva_risk_mid', fb: 'Medium' },
        { k: 'info', msg: 'sva_risk_info', fb: 'Info' },
        { k: 'info', msg: 'sva_risk_info', fb: 'Info' }
    ];
    function riesgo(it) {
        const r = RIESGOS[it.rank] || RIESGOS[5];
        return { k: r.k, txt: i18n(r.msg, r.fb) };
    }

    function queHacer(it) {
        if (it.origin === 'own') {
            return it.vkey === 'v1'
                ? { txt: i18n('sva_todo_v1', 'Rewrite in 2.1'), cls: 'is-v1' }
                : { txt: i18n('sva_todo_v2', 'Change version'), cls: 'is-v2' };
        }
        return it.origin === 'ns'
            ? { txt: i18n('sva_todo_ns', 'Updated by Oracle'), cls: 'is-na' }
            : { txt: i18n('sva_todo_vendor', 'Ask the vendor'), cls: 'is-na' };
    }


    function pajar(it) {
        return [it.name, it.scriptid, it.typeLabel, it.fileName, it.originLabel, it.owner].join(' \u0001 ');
    }

    function casaTermino(it) {
        const t = String(_term || '').trim();
        if (!t) return true;
        const TS = window.NSFT_TextSearch;
        if (TS && TS.match) return TS.match(pajar(it), t);
        return pajar(it).toLowerCase().indexOf(t.toLowerCase()) > -1;
    }

    function alcance() {
        return _soloMios ? _filas.filter((it) => it.mine) : _filas;
    }

    function porOrigen() {
        return alcance().filter((it) => (_origin === 'all' || it.origin === _origin) && casaTermino(it));
    }

    function visibles() {
        const porNombre = (a, b) => String(a.name || '').localeCompare(String(b.name || ''));
        return porOrigen().filter((it) => _ver === 'all' || it.vkey === _ver).sort((a, b) => {
            if (!_soloMios && a.mine !== b.mine) return a.mine ? -1 : 1;
            let c = 0;
            if (_sort === 'risk') c = (a.rank - b.rank) * _dir;
            else if (_sort === 'version') c = ((a.vkey === 'v1' ? 0 : 1) - (b.vkey === 'v1' ? 0 : 1)) * _dir || (a.rank - b.rank);
            else if (_sort === 'deployed') c = ((a.deployed || 0) - (b.deployed || 0)) * _dir;
            else if (_sort === 'name') c = porNombre(a, b) * _dir;
            else if (_sort === 'owner') c = String(a.owner || '').localeCompare(String(b.owner || '')) * _dir;
            return c || porNombre(a, b);
        });
    }

    function pintarTarjetas() {
        if (!_modal) return;
        const base = alcance();
        const c = { all: base.length, own: 0, ns: 0, vendor: 0, 'own-v1': 0, 'own-v2': 0 };
        base.forEach((it) => {
            c[it.origin]++;
            if (it.origin === 'own') c['own-' + it.vkey]++;
        });
        Object.keys(c).forEach((k) => {
            const el = _modal.querySelector('[data-n="' + k + '"]');
            if (el) el.textContent = _filas.length ? String(c[k]) : '—';
        });
        const pct = (n) => (c.own ? (n / c.own * 100) : 0) + '%';
        const b1 = _modal.querySelector('[data-bar="v1"]');
        const b2 = _modal.querySelector('[data-bar="v2"]');
        if (b1) b1.style.width = pct(c['own-v1']);
        if (b2) b2.style.width = pct(c['own-v2']);
    }

    function pintar() {
        if (!_modal) return;
        _modal.querySelectorAll('.nsft-sva-tile').forEach((t) => {
            const on = t.dataset.origin === _origin;
            t.classList.toggle('is-active', on);
            t.setAttribute('aria-pressed', String(on));
        });
        const base = porOrigen();
        const v1 = base.filter((it) => it.vkey === 'v1').length;
        const cv = { all: base.length, v1, v2: base.length - v1 };
        _modal.querySelectorAll('.nsft-sva-seg[data-seg="owner"] button').forEach((b) => {
            b.classList.toggle('is-active', (b.dataset.own === 'mine') === _soloMios);
            const n = b.querySelector('[data-c]');
            if (n) n.textContent = _filas.length
                ? String(b.dataset.own === 'mine' ? _filas.filter((it) => it.mine).length : _filas.length) : '';
        });
        _modal.querySelectorAll('.nsft-sva-seg[data-seg="ver"] button').forEach((b) => {
            b.classList.toggle('is-active', b.dataset.ver === _ver);
            const n = b.querySelector('[data-c]');
            if (n) n.textContent = _filas.length ? String(cv[b.dataset.ver]) : '';
        });
        _modal.querySelectorAll('.nsft-sva-sort').forEach((b) => {
            b.querySelector('i').textContent = b.dataset.sort === _sort ? (_dir === 1 ? '↑' : '↓') : '';
        });

        const res = _modal.querySelector('#nsft-sva-results');
        res.innerHTML = '';
        if (_cargando || _error) {
            const box = document.createElement('div');
            box.className = 'nsft-sva-empty' + (_error ? ' is-error' : '');
            box.textContent = _error || i18n('sva_loading', 'Checking the account’s scripts…');
            res.appendChild(box);
            estado();
            return;
        }
        const list = visibles();
        if (!list.length) {
            const box = document.createElement('div');
            box.className = 'nsft-sva-empty';
            const vacioTxt = _filas.length
                ? i18n('sva_none_filter', 'Nothing matches the filter.')
                : i18n('sva_none', 'No script to upgrade: everything is on SuiteScript 2.1.');
            if (window.NSFT_Herramientas) {
                box.innerHTML = window.NSFT_Herramientas.vacio(_filas.length
                    ? 'buscar'
                    : '<circle cx="12" cy="12" r="9"/><polyline points="8 12.5 11 15.5 16 9.5"/>', vacioTxt);
            } else {
                box.textContent = vacioTxt;
            }
            res.appendChild(box);
            estado();
            return;
        }

        const TS = window.NSFT_TextSearch;
        const term = String(_term || '').trim();
        const hl = (txt) => (TS && TS.markHtml && term) ? TS.markHtml(txt, term, 'nsft-sva-hl') : esc(txt);

        const frag = document.createDocumentFragment();
        list.forEach((it) => {
            const row = document.createElement('div');
            row.className = 'nsft-sva-grid nsft-sva-row'
                + (_sel === it.id ? ' is-sel' : '')
                + (it.origin === 'ns' ? ' is-info' : '')
                + (it.inactive ? ' is-inactive' : '');
            row.dataset.id = it.id;
            row.setAttribute('role', 'option');

            const que = queHacer(it);
            const rg = riesgo(it);
            const ver = it.vkey === 'v1'
                ? '<span class="nsft-sva-ver is-v1 nsft-alerta" title="' + esc(i18n('sva_v1_tip', 'Rewrite it with the SuiteScript 2.1 N/ modules')) + '">1.0</span>'
                : '<span class="nsft-sva-ver is-v2 nsft-alerta is-aviso" title="' + esc(i18n('sva_v2_tip', 'Change @NApiVersion to 2.1 and test it')) + '">2.x</span>';
            const sinDesplegar = it.deployed === 0;
            const desp = it.deployed == null ? '—'
                : sinDesplegar ? i18n('sva_deploy_none', 'Not deployed')
                    : it.deployed === 1 ? i18n('sva_deploy_1', '1 active')
                        : i18n('sva_deploy_n', '$1 active', [String(it.deployed)]);

            row.innerHTML =
                '<span><span class="nsft-sva-risk is-' + rg.k + ' ' + (rg.k === 'crit' ? 'nsft-alerta' : rg.k === 'info' ? 'nsft-tipo' : 'nsft-alerta is-aviso') + '">' + esc(rg.txt) + '</span></span>'
                + '<a class="nsft-sva-namecell" href="' + esc(urlScript(it)) + '">'
                + '<span class="nsft-sva-name">' + hl(it.name) + '</span>'
                + '<span class="nsft-sva-sid">' + hl(it.scriptid)
                + (it.inactive ? ' · ' + esc(i18n('sva_inactive', 'Inactive')) : '') + '</span></a>'
                + '<span class="nsft-sva-cell">' + hl(it.typeLabel) + '</span>'
                + '<span>' + ver + '</span>'
                + '<span class="nsft-sva-cell nsft-sva-todo ' + que.cls + '">' + esc(que.txt) + '</span>'
                + '<span class="nsft-sva-cell nsft-sva-origin">' + hl(it.originLabel) + '</span>'
                + '<span class="nsft-sva-cell nsft-sva-owner">' + (it.owner ? hl(it.owner) : '—')
                + (it.mine ? ' <span class="nsft-sva-owner-you">(' + esc(i18n('sva_owner_you', 'you')) + ')</span>' : '')
                + (it.ownerInactive ? ' <span class="nsft-sva-owner-off">· ' + esc(i18n('sva_owner_inactive', 'inactive')) + '</span>' : '') + '</span>'
                + '<span class="nsft-sva-cell nsft-sva-dep' + (sinDesplegar ? ' is-idle' : '') + '">' + esc(desp) + '</span>'
                + '<span class="nsft-sva-actions">'
                + '<button type="button" class="nsft-sva-iconbtn" data-copy="' + esc(it.scriptid || it.id) + '" title="'
                + esc(i18n('sva_copy_id', 'Copy ID')) + '">' + svg(IC.copy, 1.5) + '</button>'
                + (it.fileId
                    ? '<a class="nsft-sva-iconbtn" href="/app/common/media/mediaitem.nl?id=' + encodeURIComponent(it.fileId)
                        + '" title="' + esc(i18n('sva_open_file', 'Open file') + (it.fileName ? ': ' + it.fileName : '')) + '">' + svg(IC.open, 1.5) + '</a>'
                    : '')
                + '</span>';
            frag.appendChild(row);
        });
        res.appendChild(frag);
        estado();
    }

    function marcaSel(revela) {
        const res = _modal && _modal.querySelector('#nsft-sva-results');
        if (!res) return;
        res.querySelectorAll('.nsft-sva-row.is-sel').forEach((r) => r.classList.remove('is-sel'));
        const row = _sel ? res.querySelector('.nsft-sva-row[data-id="' + cssEsc(_sel) + '"]') : null;
        if (!row) return;
        row.classList.add('is-sel');
        if (!revela) return;
        const top = row.offsetTop, bottom = top + row.offsetHeight;
        if (top < res.scrollTop) res.scrollTop = top;
        else if (bottom > res.scrollTop + res.clientHeight) res.scrollTop = bottom - res.clientHeight;
    }

    function estado() {
        const line = _modal && _modal.querySelector('#nsft-sva-statusline');
        if (!line || _toastTimer) return;
        line.textContent = _cargando || _error ? ''
            : i18n('sva_results_n', '$1 of $2 scripts', [String(visibles().length), String(alcance().length)]);
    }

    function urlScript(it) { return '/app/common/scripting/script.nl?id=' + encodeURIComponent(it.id); }


    function copiar(texto) {
        const done = () => toast(i18n('sva_copied', 'ID copied: $1', [texto]));
        if (window.NSFT_Clipboard && window.NSFT_Clipboard.copy) {
            window.NSFT_Clipboard.copy(texto, { onSuccess: done });
        } else {
            try { navigator.clipboard.writeText(texto).then(done); } catch (e) { }
        }
    }

    function exportarCsv(lista) {
        if (!lista.length) { toast(i18n('sva_none_filter', 'Nothing matches the filter.')); return; }
        const head = [
            i18n('sva_col_risk', 'Risk'), i18n('sva_col_name', 'Name'), 'Script ID', i18n('sva_col_type', 'Type'),
            i18n('sva_col_version', 'Version'), i18n('sva_col_todo', 'What to do'),
            i18n('sva_col_origin', 'Origin'), i18n('sva_col_owner', 'Owner'), i18n('sva_col_deploy', 'Deployments'), 'URL'
        ];
        const cell = (v) => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
        const lines = [head.map(cell).join(',')];
        lista.forEach((it) => {
            lines.push([riesgo(it).txt, it.name, it.scriptid, it.typeLabel, it.vkey === 'v1' ? '1.0' : '2.0 / 2.x',
                queHacer(it).txt, it.originLabel,
                it.owner + (it.ownerInactive ? ' (' + i18n('sva_owner_inactive', 'inactive') + ')' : ''),
                it.deployed == null ? '' : it.deployed,
                location.origin + urlScript(it)].map(cell).join(','));
        });
        const blob = new Blob(['\uFEFF' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'nsft-scripts-a-2.1-' + new Date().toISOString().slice(0, 10) + '.csv';
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 100);
        toast(i18n('sva_exported', '$1 rows exported', [String(lista.length)]));
    }

    function cssEsc(s) {
        return (window.CSS && CSS.escape) ? CSS.escape(s) : String(s).replace(/["\\]/g, '\\$&');
    }

    function esc(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }
})();
