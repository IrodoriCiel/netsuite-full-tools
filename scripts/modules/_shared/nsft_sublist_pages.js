(function () {
    'use strict';

    if (window.NSFT_SublistPages) return;

    const FETCHER_DEST = 'fetcher_sublistpages';
    const REPLY_DEST = 'extension_sublistpages';
    const EXTRA = 'nsft-pg-extra';
    const SEP = 'nsft-pg-sep';
    const VIGENCIA_MS = 60000;
    const PLAZO_MS = 45000;

    const _cache = new Map();
    const _enCurso = new Map();
    const _errores = new Map();
    const _peticiones = new Map();
    let _seq = 0;
    let _listo = null;

    const t = (k, f, sus) => {
        try { return chrome.i18n.getMessage(k, sus) || f; } catch (e) { return f; }
    };

    window.addEventListener('message', onRespuesta);


    function sublista(capa) {
        if (!capa || !capa.querySelectorAll) return '';
        const propia = capa.dataset && capa.dataset.nspsLayer;
        let otra = '';
        const inputs = capa.querySelectorAll('input[name^="inpt_"][name$="range"]');
        for (let i = 0; i < inputs.length; i++) {
            const m = /^inpt_(\w+)range$/.exec(inputs[i].name);
            if (!m || !document.querySelector('input[name="' + m[1] + 'range"]')) continue;
            if (m[1] === propia) return m[1];
            if (!otra) otra = m[1];
        }
        return otra;
    }

    function rango(m) {
        const input = document.querySelector('input[name="inpt_' + m + 'range"]');
        const n = input && String(input.value || '').match(/\d[\d.,\s]*/g);
        if (!n || n.length < 3) return null;
        const num = (s) => parseInt(s.replace(/[.,\s]/g, ''), 10);
        const r = { start: num(n[0]), end: num(n[1]), total: num(n[2]), texto: input.value };
        return (r.start > 0 && r.end >= r.start && r.total >= r.end) ? r : null;
    }

    function tablaDe(m) {
        const t1 = document.getElementById(m + '__tab');
        if (t1) return t1;
        const capa = document.querySelector('[data-nsps-layer="' + m + '"]');
        return capa ? capa.querySelector('table.listtable') : null;
    }

    function firma(m, r) {
        let s = r.texto;
        const tabla = tablaDe(m);
        if (tabla) {
            tabla.querySelectorAll('tr.uir-list-row-tr').forEach((tr) => {
                if (tr.classList.contains(EXTRA)) return;
                const c = tr.cells;
                s += '\n' + (c[0] ? c[0].textContent : '') + '\t' + (c[1] ? c[1].textContent : '');
            });
        }
        return s;
    }

    function hash(s) {
        let h = 0;
        for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
        return (h >>> 0).toString(36);
    }


    function pide(capa, alCambiar) {
        const m = sublista(capa);
        const r = m && rango(m);
        if (!r || r.total <= r.end - r.start + 1) return null;
        const f = firma(m, r);
        const fh = hash(f);

        const c = _cache.get(m);
        if (c && c.firma === f && Date.now() - c.at < VIGENCIA_MS) {
            return { clave: fh + ':ok', paginas: c.paginas, capped: c.capped, totalPaginas: c.totalPaginas, total: r.total };
        }
        const e = _errores.get(m);
        if (e && e.firma === f && Date.now() - e.at < VIGENCIA_MS) {
            return { clave: fh + ':error', error: true, total: r.total };
        }

        let viaje = _enCurso.get(m);
        if (!viaje || viaje.firma !== f) {
            viaje = { firma: f, hechas: 0, total: 0, avisos: new Set() };
            _enCurso.set(m, viaje);
            lanza(m, viaje);
        }
        if (typeof alCambiar === 'function') viaje.avisos.add(alCambiar);
        return { clave: fh + ':c' + viaje.hechas + '/' + viaje.total, cargando: true, hechas: viaje.hechas, porHacer: viaje.total, total: r.total };
    }

    function fetcherListo() {
        if (_listo) return _listo;
        _listo = new Promise((resolver, rechazar) => {
            const s = document.createElement('script');
            s.id = 'nsft-sublist-pages-fetcher';
            s.src = chrome.runtime.getURL('scripts/modules/_shared/nsft_sublist_pages_fetcher.js');
            s.async = false;
            s.onload = () => resolver();
            s.onerror = () => { _listo = null; rechazar(new Error('fetcher')); };
            (document.head || document.documentElement).appendChild(s);
        });
        return _listo;
    }

    function lanza(m, viaje) {
        const reqId = 'pg-' + (++_seq);
        _peticiones.set(reqId, m);
        viaje.reqId = reqId;
        fetcherListo().then(() => {
            if (_enCurso.get(m) !== viaje) return;
            window.postMessage({ dest: FETCHER_DEST, reqId: reqId, payload: { machine: m } }, '*');
        }, () => falla(m, viaje));
        viaje.plazo = setTimeout(() => falla(m, viaje), PLAZO_MS);
    }

    function falla(m, viaje) {
        if (_enCurso.get(m) !== viaje) return;
        clearTimeout(viaje.plazo);
        _enCurso.delete(m);
        _peticiones.delete(viaje.reqId);
        _errores.set(m, { firma: viaje.firma, at: Date.now() });
        avisa(viaje);
    }

    function avisa(viaje) {
        viaje.avisos.forEach((f) => { try { f(); } catch (e) { } });
    }

    function onRespuesta(ev) {
        if (ev.source !== window) return;
        const d = ev.data;
        if (!d || d.dest !== REPLY_DEST || typeof d.reqId !== 'string') return;
        const m = _peticiones.get(d.reqId);
        const viaje = m && _enCurso.get(m);
        if (!viaje || viaje.reqId !== d.reqId) return;

        if (d.type === 'progress') {
            viaje.hechas = d.done;
            viaje.total = d.total;
            avisa(viaje);
            return;
        }
        if (d.type === 'error') { falla(m, viaje); return; }
        if (d.type !== 'done') return;

        clearTimeout(viaje.plazo);
        _enCurso.delete(m);
        _peticiones.delete(d.reqId);
        _cache.set(m, {
            firma: viaje.firma,
            at: Date.now(),
            paginas: (d.pages || []).map((p) => ({ numero: p.number, etiqueta: p.label, filas: parsea(p.html) })),
            capped: !!d.capped,
            totalPaginas: d.totalPages || 0
        });
        avisa(viaje);
    }

    function parsea(html) {
        const tpl = document.createElement('template');
        tpl.innerHTML = '<table><tbody>' + (html || '') + '</tbody></table>';
        return Array.from(tpl.content.querySelectorAll('tr'));
    }


    function limpia(raiz, dueno) {
        if (!raiz) return;
        const sel = '.' + EXTRA + ', .' + SEP;
        raiz.querySelectorAll(sel).forEach((tr) => {
            if (!dueno || tr.dataset.nsftPg === dueno) tr.remove();
        });
    }

    function pintadas(raiz, dueno) {
        return !!(raiz && raiz.querySelector('.' + SEP + '[data-nsft-pg="' + dueno + '"]'));
    }

    function esExtra(tr) {
        return !!(tr && tr.classList && (tr.classList.contains(EXTRA) || tr.classList.contains(SEP)));
    }

    function pinta(tabla, est, grupos, dueno) {
        limpia(tabla, dueno);
        if (!tabla || !est) return [];
        const propias = Array.from(tabla.querySelectorAll('tr.uir-list-row-tr')).filter((tr) => !esExtra(tr));
        const ancla = propias[propias.length - 1];
        const cuerpo = ancla ? ancla.parentNode : (tabla.tBodies && tabla.tBodies[0]);
        if (!cuerpo) return [];
        const columnas = ancla
            ? Array.from(ancla.cells).reduce((n, c) => n + (c.colSpan || 1), 0)
            : 1;

        const frag = document.createDocumentFragment();
        const pintadasAhora = [];
        const separador = (texto, clase) => {
            const tr = document.createElement('tr');
            tr.className = SEP + (clase ? ' ' + clase : '');
            tr.dataset.nsftPg = dueno;
            const td = document.createElement('td');
            td.colSpan = columnas;
            td.textContent = texto;
            tr.appendChild(td);
            frag.appendChild(tr);
        };

        if (est.cargando) {
            separador(t('sublistPagesLoading', 'Buscando en las demás páginas… $1/$2',
                [String(est.hechas || 0), String(est.porHacer || '…')]), 'is-note');
        } else if (est.error) {
            separador(t('sublistPagesError', 'No se pudieron buscar las demás páginas'), 'is-note');
        } else {
            let alguna = false;
            (grupos || []).forEach((g) => {
                if (!g.filas || !g.filas.length) return;
                alguna = true;
                separador(t('sublistPagesPage', 'Página $1 · $2', [String(g.numero), g.etiqueta || '']));
                g.filas.forEach((original) => {
                    const tr = original.cloneNode(true);
                    tr.classList.add(EXTRA);
                    tr.dataset.nsftPg = dueno;
                    tr.removeAttribute('id');
                    tr.querySelectorAll('[id]').forEach((el) => el.removeAttribute('id'));
                    frag.appendChild(tr);
                    pintadasAhora.push(tr);
                });
            });
            if (!alguna) separador(t('sublistPagesNone', 'No hay coincidencias en las demás páginas'), 'is-note');
            if (est.capped) {
                separador(t('sublistPagesCapped', 'Sólo se buscó en las primeras $1 de $2 páginas',
                    [String((est.paginas || []).length + 1), String(est.totalPaginas || '')]), 'is-note');
            }
        }

        cuerpo.insertBefore(frag, ancla ? ancla.nextSibling : null);
        return pintadasAhora;
    }

    window.NSFT_SublistPages = { pide, pinta, limpia, pintadas, esExtra, EXTRA, SEP };
})();
