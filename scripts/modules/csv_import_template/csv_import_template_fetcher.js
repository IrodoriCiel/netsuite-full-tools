(function () {
    'use strict';
    if (window.__nsftCsvtFetcher) return;
    window.__nsftCsvtFetcher = true;

    var handled = {};

    window.addEventListener('message', function (event) {
        if (event.source !== window) return;
        var d = event.data;
        if (!d || d.dest !== 'fetcher_csvt' || d.type !== 'cols') return;
        if (!d.reqId || handled[d.reqId]) return;
        handled[d.reqId] = true;
        var p = d.payload || {};
        var out = [];
        try {
            var sub = String(p.sub || '');
            var m = /^[a-z][a-z0-9_]*$/i.test(sub) ? window[sub + '_machine'] : null;
            if (m && m.form_elems && typeof window.nlapiGetLineItemField === 'function') {
                var vistas = {};
                var hdr = document.querySelectorAll('#' + sub + '_headerrow [data-label]');
                for (var i = 0; i < hdr.length; i++) vistas[String(hdr[i].getAttribute('data-label')).trim().toLowerCase()] = true;
                var usados = {};
                for (var j = 0; j < m.form_elems.length; j++) {
                    var id = String(m.form_elems[j] || '');
                    if (!id || /_display$/i.test(id) || usados[id]) continue;
                    var f = null;
                    try { f = window.nlapiGetLineItemField(sub, id); } catch (e) { f = null; }
                    var lab = f && f.getLabel ? String(f.getLabel() || '').trim() : '';
                    if (!lab || !vistas[lab.toLowerCase()]) continue;
                    usados[id] = true;
                    out.push({ id: id.toLowerCase(), label: lab, req: !!(f.isMandatory && f.isMandatory()) });
                }
            }
        } catch (e) { out = []; }
        window.postMessage({ dest: 'extension_csvt', type: 'cols', reqId: d.reqId, payload: { cols: out } }, '*');
    });
})();
