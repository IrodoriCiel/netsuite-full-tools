(function () {
    'use strict';

    if (window.__nsftSublistPagesFetcher) return;
    window.__nsftSublistPagesFetcher = true;

    const PAGE_DEST = 'fetcher_sublistpages';
    const REPLY_DEST = 'extension_sublistpages';
    const MAX_PAGINAS = 40;
    const PARALELO = 3;

    window.addEventListener('message', function (event) {
        if (event.source !== window) return;
        const d = event.data;
        if (!d || d.dest !== PAGE_DEST || typeof d.reqId !== 'string') return;
        const machine = String((d.payload && d.payload.machine) || '').replace(/[^A-Za-z0-9_]/g, '');
        carga(machine, d.reqId).catch(function (err) {
            reply({ type: 'error', reqId: d.reqId, error: (err && err.message) || String(err) });
        });
    });

    function reply(msg) {
        msg.dest = REPLY_DEST;
        window.postMessage(msg, '*');
    }

    async function carga(machine, reqId) {
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
        const otras = paginas(dd, input.value, actual).filter(function (p) { return p.number - 1 !== actual; });
        const capped = otras.length > MAX_PAGINAS;
        const lista = otras.slice(0, MAX_PAGINAS);

        const urlDe = function (value) {
            return slavingUtil.getURL(meta, {
                queryFieldName: machine + 'range',
                queryFieldValue: value,
                sublistName: machine,
                fieldspec: 'T'
            }, null) + '&' + Date.now();
        };

        const salida = new Array(lista.length);
        let siguiente = 0;
        let hechas = 0;
        const trabajador = async function () {
            while (siguiente < lista.length) {
                const i = siguiente++;
                const p = lista[i];
                const res = await fetch(urlDe(p.value), { credentials: 'same-origin' });
                if (!res.ok) throw new Error('http ' + res.status);
                const doc = new DOMParser().parseFromString(await res.text(), 'text/html');
                salida[i] = { number: p.number, label: p.label, html: filasDe(doc, machine) };
                hechas++;
                reply({ type: 'progress', reqId: reqId, done: hechas, total: lista.length });
            }
        };
        const trabajadores = [];
        for (let k = 0; k < Math.min(PARALELO, lista.length); k++) trabajadores.push(trabajador());
        await Promise.all(trabajadores);

        reply({ type: 'done', reqId: reqId, pages: salida, capped: capped, totalPages: otras.length + 1 });
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

    function filasDe(doc, machine) {
        let tabla = doc.getElementById(machine + '__tab');
        if (!tabla) {
            const una = doc.querySelector('tr.uir-list-row-tr');
            tabla = una && una.closest('table');
        }
        if (!tabla) return '';
        return Array.prototype.map.call(tabla.querySelectorAll('tr.uir-list-row-tr'), function (tr) {
            return tr.outerHTML;
        }).join('');
    }
})();
