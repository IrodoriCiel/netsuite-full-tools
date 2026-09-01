(function () {
    'use strict';

    const KEY = 'colorThemeAccounts';
    const CACHE_KEY = 'nsftAccountInfoCache';
    const ENVS = [
        { k: 'PRD', i18n: 'envBadgeColorPrdLabel', hint: 'cta_env_prd_hint', def: '#9a606a', sufijo: '' },
        { k: 'SB', i18n: 'envBadgeColorSbLabel', hint: 'cta_env_sb_hint', def: '#609a73', sufijo: '-sb1' },
        { k: 'RP', i18n: 'envBadgeColorRpLabel', hint: 'cta_env_rp_hint', def: '#60779a', sufijo: '-rp' }
    ];
    const DEF_SINGLE = '#60779a';

    const PALETA = ['#9a606a', '#9a7860', '#9a8b60', '#879a60', '#609a73', '#609a90',
        '#608b9a', '#60779a', '#6a609a', '#87609a', '#9a608b'];

    let fichas = {};
    let sel = '';
    let env = 'PRD';
    let filtro = '';
    let addMode = 'one';
    let conocidas = {};

    const $ = (id) => document.getElementById(id);

    function stampTheme(mode) {
        document.documentElement.setAttribute('data-nsft-theme', mode === 'dark' ? 'dark' : 'light');
    }
    chrome.storage.local.get({ nsftTheme: 'light' }, (it) => stampTheme(it.nsftTheme));
    chrome.storage.onChanged.addListener((ch, area) => {
        if (area === 'local' && ch.nsftTheme) stampTheme(ch.nsftTheme.newValue);
    });

    function revisarAlcance() {
        chrome.storage.local.get({ enableColorThemes: false, colorThemeMode: 'global' }, (it) => {
            const aviso = $('ctaOffNotice');
            const texto = $('ctaOffText');
            if (!aviso || !texto) return;
            let msg = '';
            if (!it.enableColorThemes) {
                msg = i18n('cta_off_module', 'Colour Themes is off: these colours are not applied.');
            } else if (it.colorThemeMode !== 'accounts') {
                msg = i18n('cta_off_scope', 'The scope is not "per account": these colours are not applied.');
            }
            texto.textContent = msg;
            aviso.hidden = !msg;
        });
    }
    chrome.storage.onChanged.addListener((ch, area) => {
        if (area === 'local' && (ch.enableColorThemes || ch.colorThemeMode)) revisarAlcance();
    });

    const i18n = (k, f) => (chrome.i18n.getMessage(k) || f || '');

    function applyI18n() {
        document.querySelectorAll('[data-i18n]').forEach((el) => {
            const m = chrome.i18n.getMessage(el.getAttribute('data-i18n'));
            if (m) el.textContent = m;
        });
        document.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
            const m = chrome.i18n.getMessage(el.getAttribute('data-i18n-placeholder'));
            if (m) el.setAttribute('placeholder', m);
        });
        document.querySelectorAll('[data-i18n-title]').forEach((el) => {
            const m = chrome.i18n.getMessage(el.getAttribute('data-i18n-title'));
            if (m) el.setAttribute('title', m);
        });
    }

    function hexToHsl(hex) {
        let h = String(hex || '').replace('#', '');
        if (h.length === 3) h = h.split('').map((c) => c + c).join('');
        const r = parseInt(h.slice(0, 2), 16) / 255;
        const g = parseInt(h.slice(2, 4), 16) / 255;
        const b = parseInt(h.slice(4, 6), 16) / 255;
        if ([r, g, b].some(Number.isNaN)) return { h: 216, s: 23, l: 47 };
        const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
        const l = (mx + mn) / 2;
        let hu = 0, s = 0;
        if (d) {
            s = d / (1 - Math.abs(2 * l - 1));
            if (mx === r) hu = ((g - b) / d) % 6;
            else if (mx === g) hu = (b - r) / d + 2;
            else hu = (r - g) / d + 4;
            hu *= 60;
            if (hu < 0) hu += 360;
        }
        return { h: Math.round(hu), s: Math.round(s * 100), l: Math.round(l * 100) };
    }

    function hslToHex(h, s, l) {
        s /= 100; l /= 100;
        const k = (n) => (n + h / 30) % 12;
        const a = s * Math.min(l, 1 - l);
        const f = (n) => Math.round(255 * (l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)))));
        return '#' + [f(0), f(8), f(4)].map((v) => v.toString(16).padStart(2, '0')).join('');
    }

    function esClaro(hex) { return hexToHsl(hex).l > 62; }
    function esHex(v) { return /^#[0-9a-f]{6}$/i.test(String(v || '').trim()); }

    function analizar(raw) {
        let s = String(raw || '').trim().toLowerCase();
        if (!s) return null;
        const url = /^(?:https?:\/\/)?([a-z0-9_-]+)\.(?:app|extforms)\.netsuite\.com/i.exec(s);
        if (url) s = url[1];
        s = s.replace(/_/g, '-').replace(/[^a-z0-9-]/g, '');
        if (!s) return null;
        const partes = s.split('-');
        const sufijo = partes.length > 1 ? partes[partes.length - 1].toUpperCase() : '';
        const m = /^(SB(\d*)|RP|TD)$/.exec(sufijo);
        if (!m) return { id: s, env: 'PRD', etiqueta: i18n('envBadgeColorPrdLabel', 'Production') };
        const id = partes.slice(0, -1).join('-');
        if (!id) return { id: s, env: 'PRD', etiqueta: i18n('envBadgeColorPrdLabel', 'Production') };
        if (m[1] === 'RP') return { id: id, env: 'RP', etiqueta: i18n('envBadgeColorRpLabel', 'Release Preview') };
        const base = i18n('envBadgeColorSbLabel', 'Sandbox');
        return { id: id, env: 'SB', etiqueta: m[2] ? base + ' ' + m[2] : base };
    }

    function normalizarCuenta(raw) {
        const a = analizar(raw);
        return a ? a.id : '';
    }

    function sinIdCuenta(nombre, id) {
        if (!nombre || !id) return nombre || '';
        const esc = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/[-_]/g, '[-_]');
        const re = new RegExp(esc + '(?:[-_](?:sb\\d*|rp|td))?', 'gi');
        return nombre.replace(re, ' ').replace(/\s+/g, ' ').trim();
    }

    let localT = 0, syncT = 0;

    function escribirLocal() {
        clearTimeout(localT);
        localT = 0;
        chrome.storage.local.set({ [KEY]: fichas });
    }

    function escribirSync() {
        clearTimeout(syncT);
        syncT = 0;
        try { chrome.storage.sync.set({ [KEY]: fichas }, () => void chrome.runtime.lastError); }
        catch (e) { }
    }

    function guardar() {
        clearTimeout(localT);
        localT = setTimeout(escribirLocal, 150);
        clearTimeout(syncT);
        syncT = setTimeout(escribirSync, 1500);
    }

    window.addEventListener('pagehide', () => {
        if (localT) escribirLocal();
        if (syncT) escribirSync();
    });

    let toastT = 0;
    function toast(texto, tipo) {
        const t = $('ctaToast');
        if (!t || !texto) return;
        t.textContent = texto;
        t.classList.remove('toast--error');
        if (tipo === 'error') t.classList.add('toast--error');
        t.classList.add('visible');
        clearTimeout(toastT);
        toastT = setTimeout(() => t.classList.remove('visible'), 2600);
    }

    function ficha() { return sel ? fichas[sel] : null; }

    function terna(f) {
        if (!f) return { PRD: DEF_SINGLE, SB: DEF_SINGLE, RP: DEF_SINGLE };
        if (f.single) {
            const c = f.color || DEF_SINGLE;
            return { PRD: c, SB: c, RP: c };
        }
        return { PRD: f.PRD || ENVS[0].def, SB: f.SB || ENVS[1].def, RP: f.RP || ENVS[2].def };
    }

    function hexActual() {
        const f = ficha();
        if (!f) return DEF_SINGLE;
        return f.single ? (f.color || DEF_SINGLE) : (f[env] || (ENVS.find((e) => e.k === env) || ENVS[0]).def);
    }

    let hslVivo = null;

    function claveCasilla() {
        const f = ficha();
        return sel + '|' + (f && f.single ? 'S' : env);
    }

    function hslActual() {
        if (hslVivo && hslVivo.clave === claveCasilla()) return hslVivo;
        const c = hexToHsl(hexActual());
        return { clave: claveCasilla(), h: c.h, s: c.s, l: c.l };
    }

    function escribirHex(hex, soloEditor, mantenerHsl) {
        const f = ficha();
        if (!f || !esHex(hex)) return;
        if (!mantenerHsl) hslVivo = null;
        const v = hex.toLowerCase();
        if (f.single) f.color = v; else f[env] = v;
        guardar();
        if (soloEditor) refrescarMuestras(); else pintarLista();
        pintarSlots();
        pintarEditor(soloEditor);
        pintarPreview();
    }

    function refrescarMuestras() {
        const f = ficha();
        const lista = $('ctaList');
        const fila = lista && lista.querySelector('.acct.is-on');
        if (!f || !fila) return;
        const r = terna(f);
        fila.querySelectorAll('.swatches i').forEach((i, n) => {
            if (ENVS[n]) i.style.background = r[ENVS[n].k];
        });
    }

    function pintarLista() {
        const lista = $('ctaList');
        const vacio = $('ctaEmpty');
        const sinCoincidencias = $('ctaNoMatch');
        const cuenta = $('ctaCount');
        if (!lista) return;

        const q = filtro.trim().toLowerCase();
        const casa = (id, nombre) => !q
            || id.indexOf(q) >= 0
            || String(nombre || '').toLowerCase().indexOf(q) >= 0;

        const ids = Object.keys(fichas).sort();
        if (cuenta) cuenta.textContent = String(ids.length);

        const detectadas = Object.keys(conocidas).filter((id) => !fichas[id]).sort();
        const propias = ids.filter((id) => casa(id, fichas[id].nombre));
        const nuevas = detectadas.filter((id) => casa(id, conocidas[id]));

        if (vacio) vacio.hidden = ids.length > 0 || detectadas.length > 0;
        if (sinCoincidencias) {
            sinCoincidencias.hidden = !((ids.length || detectadas.length)
                && !propias.length && !nuevas.length);
        }

        lista.textContent = '';
        propias.forEach((id) => lista.appendChild(filaCuenta(id, false)));
        if (nuevas.length) {
            if (propias.length) {
                const sep = document.createElement('span');
                sep.className = 'acct-sep kicker';
                sep.textContent = i18n('cta_detected_title', 'Detected');
                lista.appendChild(sep);
            }
            nuevas.forEach((id) => lista.appendChild(filaCuenta(id, true)));
        }
    }

    function filaCuenta(id, esNueva) {
        const f = fichas[id];
        const r = terna(f);

        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'acct' + (!esNueva && id === sel ? ' is-on' : '') + (esNueva ? ' is-new' : '');
        b.setAttribute('aria-current', !esNueva && id === sel ? 'true' : 'false');

        const sw = document.createElement('span');
        sw.className = 'swatches';
        ENVS.forEach((e) => {
            const i = document.createElement('i');
            i.style.background = esNueva ? '' : r[e.k];
            sw.appendChild(i);
        });
        b.appendChild(sw);

        const txt = document.createElement('span');
        txt.className = 'acct-txt';

        const n = document.createElement('span');
        n.className = 'acct-name';
        n.textContent = esNueva ? (conocidas[id] || id) : (f.nombre || id);
        txt.appendChild(n);

        const s = document.createElement('span');
        s.className = 'acct-sub mono';
        s.textContent = id + ' · ' + (esNueva
            ? i18n('cta_ghost_hint', 'uses the global colour')
            : (f.single
                ? i18n('cta_mode_single_title', 'One colour')
                : i18n('cta_mode_env_title', 'One colour per environment')));
        txt.appendChild(s);

        b.appendChild(txt);
        b.addEventListener('click', () => {
            if (esNueva) { alta(id); return; }
            sel = id;
            env = 'PRD';
            pintarTodo();
        });
        return b;
    }

    function pintarFicha() {
        const f = ficha();
        const caja = $('ctaFicha');
        const nada = $('ctaNoSel');
        const lado = $('ctaSide');
        if (caja) caja.hidden = !f;
        if (nada) nada.hidden = !!f;
        if (lado) lado.hidden = !f;
        if (!f) return;

        const nombre = $('ctaName');
        if (nombre && document.activeElement !== nombre) nombre.value = f.nombre || '';
        if (nombre) nombre.placeholder = sel;

        const idchip = $('ctaFichaId');
        if (idchip) idchip.textContent = sel;

        document.querySelectorAll('#ctaModes .mode').forEach((m) => {
            const on = (m.getAttribute('data-mode') === 'single') === !!f.single;
            m.classList.toggle('is-on', on);
            m.setAttribute('aria-pressed', on ? 'true' : 'false');
        });

        pintarSlots();
    }

    function pintarSlots() {
        const cont = $('ctaSlots');
        const f = ficha();
        if (!cont || !f) return;
        cont.textContent = '';

        const filas = f.single
            ? [{
                key: 'PRD',
                rotulo: i18n('cta_single_color', 'Account colour'),
                pista: i18n('cta_single_hint', 'Applies to all three environments'),
                chapa: i18n('cta_badge_account', 'ACCOUNT'),
                hex: f.color || DEF_SINGLE,
                on: true
            }]
            : ENVS.map((e) => ({
                key: e.k,
                rotulo: i18n(e.i18n, e.k),
                pista: i18n(e.hint, ''),
                chapa: e.k,
                hex: f[e.k] || e.def,
                on: env === e.k
            }));

        filas.forEach((s) => {
            const b = document.createElement('button');
            b.type = 'button';
            b.className = 'slot' + (s.on ? ' is-on' : '');

            const chip = document.createElement('span');
            chip.className = 'slot-chip';
            chip.style.background = s.hex;
            b.appendChild(chip);

            const txt = document.createElement('span');
            txt.className = 'slot-txt';
            const t = document.createElement('span');
            t.className = 'slot-title';
            t.textContent = s.rotulo;
            txt.appendChild(t);
            const h = document.createElement('span');
            h.className = 'slot-hint';
            h.textContent = s.pista;
            txt.appendChild(h);
            b.appendChild(txt);

            const chapa = document.createElement('span');
            chapa.className = 'badge' + (s.on ? ' is-on' : '');
            chapa.textContent = s.chapa;
            b.appendChild(chapa);

            const hx = document.createElement('span');
            hx.className = 'slot-hex mono';
            hx.textContent = s.hex;
            b.appendChild(hx);

            b.addEventListener('click', () => {
                env = s.key;
                pintarSlots();
                pintarEditor();
                pintarPreview();
            });
            cont.appendChild(b);
        });
    }

    function pintarEditor(soloMuestras) {
        const f = ficha();
        if (!f) return;
        const hex = hexActual();
        const hsl = hslActual();

        const swatch = $('ctaBigSwatch');
        if (swatch) {
            swatch.style.background = hex;
            swatch.classList.toggle('is-light', esClaro(hex));
        }
        const bigHex = $('ctaBigHex');
        if (bigHex) bigHex.textContent = hex;
        const picker = $('ctaBigPicker');
        if (picker && document.activeElement !== picker) picker.value = hex;

        const hueVal = $('ctaHueVal'); if (hueVal) hueVal.textContent = hsl.h + '°';
        const satVal = $('ctaSatVal'); if (satVal) satVal.textContent = hsl.s + '%';
        const ligVal = $('ctaLigVal'); if (ligVal) ligVal.textContent = hsl.l + '%';

        const hue = $('ctaHue'), sat = $('ctaSat'), lig = $('ctaLig');
        if (hue && document.activeElement !== hue) hue.value = String(hsl.h);
        if (sat) {
            if (document.activeElement !== sat) sat.value = String(hsl.s);
            sat.style.setProperty('--track',
                `linear-gradient(90deg, ${hslToHex(hsl.h, 0, hsl.l)}, ${hslToHex(hsl.h, 100, hsl.l)})`);
        }
        if (lig) {
            if (document.activeElement !== lig) lig.value = String(hsl.l);
            lig.style.setProperty('--track',
                `linear-gradient(90deg, #000, ${hslToHex(hsl.h, hsl.s, 50)}, #fff)`);
        }

        const campo = $('ctaHex');
        if (campo && document.activeElement !== campo) {
            campo.value = hex;
            campo.classList.remove('is-bad');
        }

        pintarPaleta(hex);

        if (soloMuestras) return;

        const what = $('ctaEditorWhat');
        if (what) {
            const nombre = f.nombre || sel;
            const cual = f.single
                ? i18n('cta_editor_all_envs', 'all environments')
                : i18n((ENVS.find((e) => e.k === env) || ENVS[0]).i18n, env);
            what.textContent = nombre + ' · ' + cual;
        }

        const applyAll = $('ctaApplyAll');
        if (applyAll) {
            applyAll.textContent = f.single
                ? i18n('cta_switch_to_env', 'Switch to per-environment')
                : i18n('cta_apply_all', 'Apply to all 3 environments');
        }
    }

    function pintarPaleta(hex) {
        const cont = $('ctaPalette');
        if (!cont) return;
        cont.textContent = '';
        PALETA.forEach((p) => {
            const b = document.createElement('button');
            b.type = 'button';
            b.className = 'pal' + (p.toLowerCase() === String(hex).toLowerCase() ? ' is-on' : '');
            b.style.background = p;
            b.title = p;
            b.addEventListener('click', () => escribirHex(p));
            cont.appendChild(b);
        });
    }

    function pintarPreview() {
        const f = ficha();
        if (!f) return;
        const r = terna(f);
        const activo = f.single ? 'PRD' : env;
        const nombre = f.nombre || sel;

        const strip = $('ctaTabstrip');
        if (strip) {
            strip.textContent = '';
            ENVS.forEach((e) => {
                const tab = document.createElement('span');
                tab.className = 'nsft-pv-tab' + (e.k === activo ? ' is-here' : '');
                tab.textContent = nombre;
                strip.appendChild(tab);
            });
        }

        const url = $('ctaUrl');
        if (url) {
            const suf = (ENVS.find((e) => e.k === activo) || ENVS[0]).sufijo;
            url.textContent = sel + suf + '.app.netsuite.com';
        }

        const bar = $('ctaNsbar');
        if (bar) bar.style.background = r[activo];
    }

    function pintarTodo() {
        pintarLista();
        pintarFicha();
        pintarEditor();
        pintarPreview();
        pintarDatalist();
    }

    function cargarConocidas(cb) {
        chrome.storage.local.get({ [CACHE_KEY]: {} }, (it) => {
            const cache = it[CACHE_KEY] || {};
            conocidas = {};
            Object.keys(cache).forEach((companyId) => {
                const id = normalizarCuenta(companyId);
                if (!id) return;
                const nombre = sinIdCuenta((cache[companyId] && cache[companyId].companyName) || '', id);
                if (conocidas[id] === undefined || (!conocidas[id] && nombre)) conocidas[id] = nombre;
            });
            cb && cb();
        });
    }

    function pintarDatalist() {
        const datalist = $('ctaKnown');
        if (!datalist) return;
        datalist.textContent = '';
        Object.keys(conocidas).sort().forEach((id) => {
            const opt = document.createElement('option');
            opt.value = id;
            if (conocidas[id]) opt.label = conocidas[id];
            datalist.appendChild(opt);
        });
    }

    function fichaNueva(id, semilla) {
        const base = semilla || DEF_SINGLE;
        return {
            nombre: conocidas[id] || '',
            single: false,
            color: base,
            PRD: ENVS[0].def, SB: ENVS[1].def, RP: ENVS[2].def
        };
    }

    function alta(raw) {
        const a = analizar(raw);
        if (!a) return;
        const existia = !!fichas[a.id];
        if (!existia) {
            fichas[a.id] = fichaNueva(a.id, PALETA[Object.keys(fichas).length * 3 % PALETA.length]);
            guardar();
        }
        sel = a.id;
        env = a.env;
        const campo = $('ctaAccount');
        if (campo) campo.value = '';
        decir(existia
            ? i18n('cta_detect_existing', '').replace('$1', a.etiqueta).replace('$2', a.id)
            : i18n('cta_detect_created', '').replace('$1', a.etiqueta).replace('$2', a.id), true);
        pintarTodo();
    }

    function altaLote() {
        const ta = $('ctaBulk');
        if (!ta) return;
        const partes = ta.value.split(/[\n,;]+/).map((s) => s.trim()).filter(Boolean);
        if (!partes.length) return;
        let nuevas = 0, ultima = sel;
        partes.forEach((p) => {
            const a = analizar(p);
            if (!a || fichas[a.id]) return;
            fichas[a.id] = fichaNueva(a.id, PALETA[(Object.keys(fichas).length * 3) % PALETA.length]);
            ultima = a.id;
            nuevas++;
        });
        ta.value = '';
        actualizarBotonLote();
        if (nuevas) {
            guardar();
            sel = ultima;
            env = 'PRD';
        }
        toast(i18n('cta_bulk_added', '').replace('$1', String(nuevas))
            || `${nuevas} new accounts added.`, nuevas ? '' : 'error');
        pintarTodo();
    }

    function decir(texto, ok) {
        const p = $('ctaDetect');
        if (!p) return;
        if (!texto) {
            p.textContent = i18n('cta_account_hint', '');
            p.classList.remove('is-ok');
            return;
        }
        p.textContent = texto;
        p.classList.toggle('is-ok', !!ok);
    }

    function actualizarBotonLote() {
        const ta = $('ctaBulk');
        const b = $('ctaBulkBtn');
        if (!ta || !b) return;
        const n = ta.value.split(/[\n,;]+/).map((s) => s.trim()).filter(Boolean).length;
        b.textContent = n
            ? (i18n('cta_bulk_btn_n', '').replace('$1', String(n)) || `Add ${n} accounts`)
            : i18n('cta_bulk_btn', 'Add accounts');
    }

    function exportarTexto() {
        return JSON.stringify({ version: 1, accounts: fichas }, null, 2);
    }

    function parsearImport(txt) {
        let c;
        try { c = JSON.parse(String(txt || '')); } catch (e) { return null; }
        if (!c || typeof c !== 'object') return null;
        const envuelto = c.version !== undefined && c.accounts && typeof c.accounts === 'object';
        const crudo = envuelto ? c.accounts : c;
        const limpio = {};
        Object.keys(crudo).forEach((k) => {
            const id = normalizarCuenta(k);
            const v = crudo[k];
            if (!id || !v || typeof v !== 'object') return;
            const f = fichaNueva(id);
            f.nombre = typeof v.nombre === 'string' ? v.nombre : '';
            f.single = !!v.single;
            if (esHex(v.color)) f.color = String(v.color).toLowerCase();
            ENVS.forEach((e) => { if (esHex(v[e.k])) f[e.k] = String(v[e.k]).toLowerCase(); });
            limpio[id] = f;
        });
        return Object.keys(limpio).length ? limpio : null;
    }

    function mensajeDatos(texto, ok) {
        const m = $('ctaDataMsg');
        if (!m) return;
        m.textContent = texto || '';
        m.classList.toggle('is-bad', ok === false);
    }

    function abrirDatos() {
        const modal = $('ctaDataModal');
        if (!modal) return;
        const ex = $('ctaExportText');
        if (ex) ex.value = exportarTexto();
        mensajeDatos('');
        modal.hidden = false;
        document.addEventListener('keydown', escDatos);
    }

    function cerrarDatos() {
        const modal = $('ctaDataModal');
        if (modal) modal.hidden = true;
        document.removeEventListener('keydown', escDatos);
    }

    function escDatos(e) { if (e.key === 'Escape') cerrarDatos(); }

    function importar(fusionar) {
        const ta = $('ctaImportText');
        const nuevo = parsearImport(ta ? ta.value : '');
        if (!nuevo) {
            mensajeDatos(i18n('cta_data_invalid', 'Invalid JSON, or no accounts in it.'), false);
            return;
        }
        let n = 0;
        if (fusionar) {
            Object.keys(nuevo).forEach((id) => {
                if (fichas[id]) return;
                fichas[id] = nuevo[id];
                n++;
            });
            mensajeDatos(i18n('cta_data_merged', '').replace('$1', String(n)) || `${n} new accounts added.`, true);
        } else {
            fichas = nuevo;
            n = Object.keys(fichas).length;
            mensajeDatos(i18n('cta_data_imported', '').replace('$1', String(n)) || `${n} accounts imported.`, true);
        }
        if (ta) ta.value = '';
        const ids = Object.keys(fichas).sort();
        if (!fichas[sel]) sel = ids[0] || '';
        env = 'PRD';
        guardar();
        const ex = $('ctaExportText');
        if (ex) ex.value = exportarTexto();
        pintarTodo();
    }

    document.addEventListener('DOMContentLoaded', () => {
        applyI18n();
        actualizarBotonLote();
        revisarAlcance();

        const btn = $('ctaAddBtn');
        const campo = $('ctaAccount');
        if (btn) btn.addEventListener('click', () => alta(campo && campo.value));
        if (campo) {
            campo.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') { e.preventDefault(); alta(campo.value); }
            });
        }

        const bulk = $('ctaBulk');
        if (bulk) bulk.addEventListener('input', actualizarBotonLote);
        const bulkBtn = $('ctaBulkBtn');
        if (bulkBtn) bulkBtn.addEventListener('click', altaLote);

        const seg = $('ctaAddSeg');
        if (seg) {
            seg.addEventListener('click', (e) => {
                const b = e.target.closest('[data-addmode]');
                if (!b) return;
                addMode = b.getAttribute('data-addmode');
                seg.querySelectorAll('[data-addmode]').forEach((x) => {
                    x.classList.toggle('is-on', x.getAttribute('data-addmode') === addMode);
                });
                const uno = $('ctaAddOne'), varias = $('ctaAddMany');
                if (uno) uno.hidden = addMode !== 'one';
                if (varias) varias.hidden = addMode !== 'many';
            });
        }

        const buscador = $('ctaSearch');
        if (buscador) {
            buscador.addEventListener('input', () => {
                filtro = buscador.value;
                pintarLista();
            });
        }

        const nombre = $('ctaName');
        if (nombre) {
            nombre.addEventListener('input', () => {
                const f = ficha();
                if (!f) return;
                f.nombre = nombre.value;
                guardar();
                pintarLista();
                pintarEditor();
                pintarPreview();
            });
        }

        const modes = $('ctaModes');
        if (modes) {
            modes.addEventListener('click', (e) => {
                const b = e.target.closest('[data-mode]');
                const f = ficha();
                if (!b || !f) return;
                f.single = b.getAttribute('data-mode') === 'single';
                env = 'PRD';
                guardar();
                pintarTodo();
            });
        }

        const del = $('ctaDelete');
        if (del) {
            del.addEventListener('click', () => {
                if (!sel) return;
                delete fichas[sel];
                guardar();
                const ids = Object.keys(fichas).sort();
                sel = ids[0] || '';
                env = 'PRD';
                pintarTodo();
                toast(i18n('cta_removed', 'Account removed.'));
            });
        }

        const picker = $('ctaBigPicker');
        if (picker) picker.addEventListener('input', () => escribirHex(picker.value, true));

        const hue = $('ctaHue'), sat = $('ctaSat'), lig = $('ctaLig');
        const desde = (cual) => {
            const c = hslActual();
            const v = { clave: claveCasilla(), h: c.h, s: c.s, l: c.l };
            if (cual === 'h') v.h = Number(hue.value);
            else if (cual === 's') v.s = Number(sat.value);
            else v.l = Number(lig.value);
            hslVivo = v;
            escribirHex(hslToHex(v.h, v.s, v.l), true, true);
        };
        if (hue) hue.addEventListener('input', () => desde('h'));
        if (sat) sat.addEventListener('input', () => desde('s'));
        if (lig) lig.addEventListener('input', () => desde('l'));

        const hx = $('ctaHex');
        if (hx) {
            hx.addEventListener('input', () => {
                const v = hx.value.trim();
                const con = v[0] === '#' ? v : '#' + v;
                if (!esHex(con)) { hx.classList.add('is-bad'); return; }
                hx.classList.remove('is-bad');
                escribirHex(con, true);
            });
            hx.addEventListener('blur', () => {
                hx.value = hexActual();
                hx.classList.remove('is-bad');
            });
        }

        const applyAll = $('ctaApplyAll');
        if (applyAll) {
            applyAll.addEventListener('click', () => {
                const f = ficha();
                if (!f) return;
                if (f.single) {
                    const c = f.color || DEF_SINGLE;
                    f.single = false;
                    ENVS.forEach((e) => { f[e.k] = c; });
                } else {
                    const c = hexActual();
                    ENVS.forEach((e) => { f[e.k] = c; });
                }
                env = 'PRD';
                guardar();
                pintarTodo();
            });
        }

        const dataBtn = $('ctaDataBtn');
        if (dataBtn) dataBtn.addEventListener('click', abrirDatos);
        const dataClose = $('ctaDataClose');
        if (dataClose) dataClose.addEventListener('click', cerrarDatos);
        const modal = $('ctaDataModal');
        if (modal) modal.addEventListener('click', (e) => { if (e.target === modal) cerrarDatos(); });

        const copyBtn = $('ctaCopyBtn');
        if (copyBtn) {
            copyBtn.addEventListener('click', () => {
                const texto = exportarTexto();
                const listo = () => toast(i18n('cta_data_copied', 'Copied.'));
                try {
                    navigator.clipboard.writeText(texto).then(listo, () => copiarViejo(texto, listo));
                } catch (e) { copiarViejo(texto, listo); }
            });
        }

        const dlBtn = $('ctaDownloadBtn');
        if (dlBtn) {
            dlBtn.addEventListener('click', () => {
                const blob = new Blob([exportarTexto()], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
                const a = document.createElement('a');
                a.href = url;
                a.download = `color_theme_accounts_${stamp}.json`;
                document.body.appendChild(a);
                a.click();
                setTimeout(() => { a.remove(); URL.revokeObjectURL(url); }, 100);
            });
        }

        const fileBtn = $('ctaImportFileBtn');
        const file = $('ctaImportFile');
        if (fileBtn && file) {
            fileBtn.addEventListener('click', () => file.click());
            file.addEventListener('change', (e) => {
                const f = e.target.files && e.target.files[0];
                e.target.value = '';
                if (!f) return;
                const rd = new FileReader();
                rd.onload = (ev) => {
                    const ta = $('ctaImportText');
                    if (ta) ta.value = String(ev.target.result || '');
                    mensajeDatos('');
                };
                rd.onerror = () => mensajeDatos(i18n('cta_data_invalid', 'Invalid JSON, or no accounts in it.'), false);
                rd.readAsText(f);
            });
        }

        const replaceBtn = $('ctaReplaceBtn');
        if (replaceBtn) replaceBtn.addEventListener('click', () => importar(false));
        const mergeBtn = $('ctaMergeBtn');
        if (mergeBtn) mergeBtn.addEventListener('click', () => importar(true));

        chrome.storage.local.get({ [KEY]: {} }, (it) => {
            fichas = it[KEY] || {};
            let saneado = false;
            Object.keys(fichas).forEach((id) => {
                const f = fichas[id];
                if (!f || !f.nombre) return;
                const limpio = sinIdCuenta(f.nombre, id);
                if (limpio !== f.nombre) { f.nombre = limpio; saneado = true; }
            });
            if (saneado) guardar();
            const ids = Object.keys(fichas).sort();
            sel = ids[0] || '';
            cargarConocidas(pintarTodo);
        });
    });

    function copiarViejo(texto, listo) {
        const ta = document.createElement('textarea');
        ta.value = texto;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        try { document.execCommand('copy'); listo(); } catch (e) { }
        ta.remove();
    }

    chrome.storage.onChanged.addListener((ch, area) => {
        if (area !== 'local' || !ch[KEY]) return;
        const nuevo = ch[KEY].newValue || {};
        if (JSON.stringify(nuevo) === JSON.stringify(fichas)) return;
        fichas = nuevo;
        if (!fichas[sel]) sel = Object.keys(fichas).sort()[0] || '';
        pintarTodo();
    });
})();
