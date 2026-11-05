(function () {
    'use strict';

    if (window.__nsftSublistPagesFetcher) return;
    window.__nsftSublistPagesFetcher = true;

    const PAGE_DEST = 'fetcher_sublistpages';
    const REPLY_DEST = 'extension_sublistpages';
    const MAX_PAGINAS = 40;
    const PARALELO = 3;

    const _cancelar = new Set();

    window.addEventListener('message', function (event) {
        if (event.source !== window) return;
        const d = event.data;
        if (!d || d.dest !== PAGE_DEST || typeof d.reqId !== 'string') return;
        if (d.cancel) { _cancelar.add(d.reqId); return; }
        const p = d.payload || {};
        if (p.modo === 'horas') {
            const filas = Array.isArray(p.filas) ? p.filas : [];
            reply({ type: 'horas', reqId: d.reqId, ms: filas.map(horaDeTextos) });
            return;
        }
        const machine = String(p.machine || '').replace(/[^A-Za-z0-9_]/g, '');
        const trabajo = p.modo === 'export'
            ? (p.fechas
                ? exportaFechas(machine, d.reqId, p.fechas)
                : exporta(machine, d.reqId, Number(p.desde) || 1, Number(p.hasta) || 0))
            : carga(machine, d.reqId);
        trabajo.catch(function (err) {
            _cancelar.delete(d.reqId);
            if (err === CANCELADA) { reply({ type: 'cancelled', reqId: d.reqId, done: 0, total: 0 }); return; }
            reply({ type: 'error', reqId: d.reqId, error: (err && err.message) || String(err) });
        });
    });

    function reply(msg) {
        msg.dest = REPLY_DEST;
        window.postMessage(msg, '*');
    }

    function prepara(machine) {
        if (!machine) throw new Error('Empty machine');
        if (typeof getDropdown !== 'function' || !window.slavingUtil || typeof slavingUtil.getURL !== 'function') {
            throw new Error('Sin paginación de NetSuite en esta página');
        }
        const sync = window['Sync' + machine + 'range'];
        if (typeof sync !== 'function') throw new Error('Sin Sync' + machine + 'range');
        const m = /var slavingMetaData\s*=\s*(\{[\s\S]*?\});\s*var masterInfo/.exec(sync.toString());
        if (!m) throw new Error('Sin slavingMetaData');
        const meta = JSON.parse(m[1]);

        const input = document.querySelector('input[name="inpt_' + machine + 'range"]');
        let dd = null;
        try { dd = input && getDropdown(input); } catch (e) { dd = null; }
        if (!dd) throw new Error('Sin desplegable de páginas');

        let actual = 0;
        try { actual = Number(dd.getIndex()) || 0; } catch (e) { actual = 0; }
        return {
            actual: actual,
            todas: paginas(dd, input.value, actual),
            urlDe: function (value) {
                return slavingUtil.getURL(meta, {
                    queryFieldName: machine + 'range',
                    queryFieldValue: value,
                    sublistName: machine,
                    fieldspec: 'T'
                }, null) + '&' + Date.now();
            }
        };
    }

    async function carga(machine, reqId) {
        const pr = prepara(machine);
        const actual = pr.actual;
        const urlDe = pr.urlDe;
        const otras = pr.todas.filter(function (p) { return p.number - 1 !== actual; });
        const capped = otras.length > MAX_PAGINAS;
        const lista = otras.slice(0, MAX_PAGINAS);

        const salida = new Array(lista.length);
        let siguiente = 0;
        let hechas = 0;
        const trabajador = async function () {
            while (siguiente < lista.length) {
                const i = siguiente++;
                const p = lista[i];
                const res = await fetch(urlDe(p.value), { credentials: 'same-origin' });
                if (!res.ok) throw new Error('http ' + res.status);
                salida[i] = { number: p.number, label: p.label, html: filasDe(await res.text(), machine) };
                hechas++;
                reply({ type: 'progress', reqId: reqId, done: hechas, total: lista.length });
            }
        };
        const trabajadores = [];
        for (let k = 0; k < Math.min(PARALELO, lista.length); k++) trabajadores.push(trabajador());
        await Promise.all(trabajadores);

        reply({ type: 'done', reqId: reqId, pages: salida, capped: capped, totalPages: otras.length + 1 });
    }

    async function exporta(machine, reqId, desde, hasta) {
        const pr = prepara(machine);
        const total = pr.todas.length;
        const a = Math.max(1, Math.min(desde, total));
        const b = hasta > 0 ? Math.max(a, Math.min(hasta, total)) : total;
        const lista = pr.todas.filter(function (p) { return p.number >= a && p.number <= b; });
        const cabeza = total > 1 ? huella(await pide(pr, machine, pr.todas[0])) : null;

        let siguiente = 0;
        let hechas = 0;
        let cancelada = false;
        const trabajador = async function () {
            while (siguiente < lista.length) {
                if (_cancelar.has(reqId)) { cancelada = true; return; }
                const p = lista[siguiente++];
                const html = await pide(pr, machine, p);
                if (p.number === 1 && cabeza !== null && huella(html) !== cabeza) throw new Error('cambio');
                hechas++;
                reply({ type: 'page', reqId: reqId, number: p.number, label: p.label, html: html, done: hechas, total: lista.length });
            }
        };
        try {
            const trabajadores = [];
            for (let k = 0; k < Math.min(PARALELO, lista.length); k++) trabajadores.push(trabajador());
            await Promise.all(trabajadores);
            if (!cancelada && cabeza !== null && huella(await pide(pr, machine, pr.todas[0])) !== cabeza) {
                throw new Error('cambio');
            }
        } finally {
            _cancelar.delete(reqId);
        }
        reply(cancelada
            ? { type: 'cancelled', reqId: reqId, done: hechas, total: lista.length }
            : { type: 'done', reqId: reqId, totalPages: total, desde: a, hasta: b });
    }

    async function pide(pr, machine, p) {
        const res = await fetch(pr.urlDe(p.value), { credentials: 'same-origin' });
        if (!res.ok) throw new Error('http ' + res.status);
        const html = filasDe(await res.text(), machine);
        if (!html) throw new Error('Página ' + p.number + ' vacía');
        return html;
    }

    function huella(filas) {
        const trs = typeof filas === 'string' ? filasDeHtml(filas) : filas;
        return trs.map(function (tr) { return (tr.textContent || '').replace(/\s+/g, ' ').trim(); }).join('\n');
    }

    const CANCELADA = {};

    function aMs(s) {
        const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(String(s || ''));
        if (!m) return NaN;
        return new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]).getTime();
    }

    function lee(s) {
        if (typeof nlapiStringToDate !== 'function') return NaN;
        try {
            const d = nlapiStringToDate(s, 'datetime') || nlapiStringToDate(s);
            const t = d && d.getTime ? d.getTime() : NaN;
            return isFinite(t) ? t : NaN;
        } catch (e) { return NaN; }
    }

    const FECHA_RE = /\d{1,4}[\/.\-]\d{1,2}[\/.\-]\d{1,4}/;
    const HORA_RE = /\d{1,2}:\d{2}/;

    function horaDe(tr) {
        return horaDeTextos(Array.prototype.map.call(tr.querySelectorAll('td.uir-list-row-cell'), function (td) {
            return (td.textContent || '').replace(/\s+/g, ' ').trim();
        }));
    }

    function horaDeTextos(celdas) {
        celdas = (celdas || []).map(function (s) { return String(s == null ? '' : s); });
        for (let i = 0; i < celdas.length; i++) {
            const s = celdas[i];
            if (!FECHA_RE.test(s)) continue;
            if (HORA_RE.test(s)) return lee(s);
            const sig = celdas[i + 1] || '';
            return HORA_RE.test(sig) ? lee(s + ' ' + sig) : lee(s);
        }
        return NaN;
    }

    function filasDeHtml(html) {
        const tpl = document.createElement('template');
        tpl.innerHTML = '<table><tbody>' + html + '</tbody></table>';
        return Array.prototype.slice.call(tpl.content.querySelectorAll('tr.uir-list-row-tr'));
    }

    async function exportaFechas(machine, reqId, fechas) {
        const D = aMs(fechas && fechas.desde);
        const H = aMs(fechas && fechas.hasta) + 59999;
        if (!isFinite(D) || !isFinite(H) || H < D) throw new Error('fechas');
        const pr = prepara(machine);
        const P = pr.todas.length;
        const cache = new Map();
        let consultas = 0;
        let sube = null;

        const corta = function () { if (_cancelar.has(reqId)) throw CANCELADA; };

        const pagina = async function (n) {
            if (cache.has(n)) return cache.get(n);
            corta();
            const p = pr.todas[n - 1];
            const res = await fetch(pr.urlDe(p.value), { credentials: 'same-origin' });
            if (!res.ok) throw new Error('http ' + res.status);
            const html = filasDe(await res.text(), machine);
            if (!html) throw new Error('Página ' + n + ' vacía');
            const filas = filasDeHtml(html).map(function (tr) { return { tr: tr, t: horaDe(tr) }; });
            if (!filas.length || filas.some(function (x) { return !isFinite(x.t); })) {
                throw new Error('No se pudo leer la fecha en la página ' + n);
            }
            let arriba = false, abajo = false;
            for (let i = 1; i < filas.length; i++) {
                if (filas[i].t > filas[i - 1].t) arriba = true;
                if (filas[i].t < filas[i - 1].t) abajo = true;
            }
            if (arriba && abajo) throw new Error('orden');
            const pg = { n: n, label: p.label, filas: filas, primera: filas[0].t, ultima: filas[filas.length - 1].t, arriba: arriba, abajo: abajo };
            cache.set(n, pg);
            consultas++;
            reply({ type: 'buscando', reqId: reqId, consultas: consultas });
            return pg;
        };

        const p1 = await pagina(1);
        const pP = await pagina(P);
        sube = p1.primera <= pP.ultima;
        cache.forEach(function (pg) { if ((sube && pg.abajo) || (!sube && pg.arriba)) throw new Error('orden'); });
        const comprueba = function (pg) {
            if ((sube && pg.abajo) || (!sube && pg.arriba)) throw new Error('orden');
            return pg;
        };

        const primera = async function (cumple) {
            let lo = 1, hi = P, r = P + 1;
            while (lo <= hi) {
                const mid = (lo + hi) >> 1;
                if (cumple(comprueba(await pagina(mid)))) { r = mid; hi = mid - 1; } else lo = mid + 1;
            }
            return r;
        };
        const ultima = async function (cumple) {
            let lo = 1, hi = P, r = 0;
            while (lo <= hi) {
                const mid = (lo + hi) >> 1;
                if (cumple(comprueba(await pagina(mid)))) { r = mid; lo = mid + 1; } else hi = mid - 1;
            }
            return r;
        };

        let a, b;
        if (sube) {
            a = await primera(function (pg) { return pg.ultima >= D; });
            b = await ultima(function (pg) { return pg.primera <= H; });
        } else {
            a = await primera(function (pg) { return pg.ultima <= H; });
            b = await ultima(function (pg) { return pg.primera >= D; });
        }

        const total = b >= a ? b - a + 1 : 0;
        let hechas = 0;
        for (let n = a; n <= b; n++) {
            const pg = comprueba(await pagina(n));
            const dentro = pg.filas.filter(function (x) { return x.t >= D && x.t <= H; });
            hechas++;
            reply({
                type: 'page', reqId: reqId, number: n, label: pg.label,
                html: dentro.map(function (x) { return x.tr.outerHTML; }).join(''),
                done: hechas, total: total
            });
        }
        if (P > 1) {
            corta();
            const ahora = huella(await pide(pr, machine, pr.todas[0]));
            if (ahora !== huella(p1.filas.map(function (x) { return x.tr; }))) throw new Error('cambio');
        }
        _cancelar.delete(reqId);
        reply({ type: 'done', reqId: reqId, totalPages: P, desde: a, hasta: b });
    }

    function paginas(dd, texto, actual) {
        let vals = [];
        let txts = [];
        try { vals = dd.getValues() || []; } catch (e) { vals = []; }
        try { txts = (dd.getTexts && dd.getTexts()) || []; } catch (e) { txts = []; }
        const r = rango(texto);
        if (r) {
            const tam = actual > 0 ? (r.start - 1) / actual : (r.end - r.start + 1);
            const esperadas = tam > 0 ? Math.ceil(r.total / tam) : vals.length;
            if (esperadas > vals.length) {
                vals = [];
                txts = [];
                for (let i = 0; i < esperadas; i++) {
                    vals.push(String(i));
                    txts.push((i * tam + 1) + ' – ' + Math.min((i + 1) * tam, r.total));
                }
            }
        }
        return vals.map(function (v, i) { return { number: i + 1, value: v, label: txts[i] || '' }; });
    }

    function rango(texto) {
        const n = String(texto || '').match(/\d[\d.,\s]*/g);
        if (!n || n.length < 3) return null;
        const num = function (s) { return parseInt(s.replace(/[.,\s]/g, ''), 10); };
        const start = num(n[0]);
        const end = num(n[1]);
        const total = num(n[2]);
        return (start > 0 && end >= start && total >= end) ? { start: start, end: end, total: total } : null;
    }

    function filasDe(texto, machine) {
        const doc = new DOMParser().parseFromString(texto, 'text/html');
        let tabla = doc.getElementById(machine + '__tab');
        if (!tabla) {
            const una = doc.querySelector('tr.uir-list-row-tr');
            tabla = una && una.closest('table');
        }
        let filas = tabla ? tabla.querySelectorAll('tr.uir-list-row-tr') : [];
        if (!filas.length) {
            const ini = texto.search(/<machine\b/i);
            const fin = texto.search(/<\/machine>/i);
            if (ini >= 0 && fin > ini) {
                const tpl = document.createElement('template');
                tpl.innerHTML = '<table><tbody>' + texto.slice(texto.indexOf('>', ini) + 1, fin) + '</tbody></table>';
                filas = tpl.content.querySelectorAll('tr.uir-list-row-tr');
            }
        }
        return Array.prototype.map.call(filas, function (tr) { return tr.outerHTML; }).join('');
    }
})();
