'use strict';

(function () {
    if (window.__nsftSsbFetcher) return;
    window.__nsftSsbFetcher = true;

    var MACHINE = 'returnfields';
    var COL_RESUMEN = 'rfsummary';
    var COL_CAMPO = 'rffield';

    function reply(type, payload) {
        window.postMessage({ dest: 'extension_ssb', type: type, payload: payload || {} }, '*');
    }

    function hayApi() {
        return typeof nlapiGetLineItemCount === 'function'
            && typeof nlapiSetLineItemValue === 'function'
            && typeof nlapiGetLineItemValue === 'function';
    }

    function hayCicloLinea() {
        return typeof nlapiSelectLineItem === 'function'
            && typeof nlapiSetCurrentLineItemValue === 'function'
            && typeof nlapiCommitLineItem === 'function';
    }

    function escribirLinea(linea, valor, ciclo) {
        if (ciclo) {
            nlapiSelectLineItem(MACHINE, linea);
            nlapiSetCurrentLineItemValue(MACHINE, COL_RESUMEN, valor, true);
            nlapiCommitLineItem(MACHINE);
            return;
        }
        nlapiSetLineItemValue(MACHINE, COL_RESUMEN, linea, valor);
    }

    function lineasConCampo() {
        var total = 0;
        try { total = nlapiGetLineItemCount(MACHINE) || 0; } catch (e) { return []; }
        var out = [];
        for (var i = 1; i <= total; i++) {
            var campo = '';
            try { campo = nlapiGetLineItemValue(MACHINE, COL_CAMPO, i) || ''; } catch (e) { campo = ''; }
            if (String(campo).trim()) out.push(i);
        }
        return out;
    }

    function aplicar(valor) {
        if (!hayApi()) { reply('done', { ok: false, motivo: 'sin_api' }); return; }
        var lineas = lineasConCampo();
        if (!lineas.length) { reply('done', { ok: false, motivo: 'sin_columnas' }); return; }

        var ciclo = hayCicloLinea();
        var puestas = 0, fallos = 0;

        for (var k = lineas.length - 1; k >= 0; k--) {
            var i = lineas[k];
            try {
                escribirLinea(i, valor, ciclo);
                puestas++;
            } catch (e) {
                try { nlapiSetLineItemValue(MACHINE, COL_RESUMEN, i, valor); puestas++; }
                catch (e2) { fallos++; }
            }
        }

        try {
            var m = (typeof getMachine === 'function') ? getMachine(MACHINE) : null;
            if (m && typeof m.recalc === 'function') m.recalc();
        } catch (e) { }

        reply('done', {
            ok: puestas > 0, puestas: puestas, fallos: fallos,
            total: lineas.length, via: ciclo ? 'linea' : 'directa'
        });
    }

    window.addEventListener('message', function (event) {
        if (event.source !== window) return;
        var d = event.data;
        if (!d || d.dest !== 'fetcher_ssb') return;
        if (d.type === 'apply') {
            var v = String((d.payload && d.payload.valor) || '');
            if (!/^(|GROUP|COUNT|SUM|AVG|MIN|MAX)$/.test(v)) { reply('done', { ok: false, motivo: 'valor' }); return; }
            aplicar(v);
        } else if (d.type === 'ping') {
            reply('ready', { ok: hayApi(), lineas: hayApi() ? lineasConCampo().length : 0 });
        }
    });

    reply('ready', { ok: hayApi(), lineas: hayApi() ? lineasConCampo().length : 0 });
})();
