(function () {
    'use strict';
    if (window.__nsftRecordAttachmentsFetcher) return;
    window.__nsftRecordAttachmentsFetcher = true;

    var MAX = 200;
    var handled = {};

    window.addEventListener('message', function (event) {
        if (event.source !== window) return;
        var d = event.data;
        if (!d || d.dest !== 'fetcher_rattach' || d.type !== 'files') return;
        if (!d.reqId || handled[d.reqId]) return;
        handled[d.reqId] = true;
        archivos(d);
    });

    function reply(d, payload) {
        window.postMessage({ dest: 'extension_rattach', type: d.type, reqId: d.reqId, payload: payload }, '*');
    }

    function tipoDeBusqueda() {
        if (/\/accounting\/transactions\//i.test(window.location.pathname)) return 'transaction';
        var t = '';
        try { if (typeof window.nlapiGetRecordType === 'function') t = String(window.nlapiGetRecordType() || ''); } catch (e) { t = ''; }
        return t.toLowerCase();
    }

    function archivos(d) {
        var p = d.payload || {};
        var recId = parseInt(p.recId, 10);
        if (!recId || recId <= 0) { reply(d, { error: 'bad' }); return; }
        if (typeof window.require !== 'function') { reply(d, { error: 'norequire' }); return; }
        var tipo = tipoDeBusqueda();
        if (!tipo) { reply(d, { error: 'notype' }); return; }

        var respondido = false;
        function fin(payload) {
            if (respondido) return;
            respondido = true;
            reply(d, payload);
        }
        function falla(e) {
            fin({ error: 'nojoin', detail: String((e && (e.message || e.name)) || e || '') });
        }

        try {
            window.require(['N/search'], function (search) {
                try {
                    var cols = ['internalid', 'name', 'filetype', 'documentsize', 'modified', 'url'].map(function (n) {
                        return search.createColumn({ name: n, join: 'file' });
                    });
                    var filtros = [['internalid', 'anyof', String(recId)]];
                    if (tipo === 'transaction') filtros.push('AND', ['mainline', 'is', 'T']);
                    var opciones = { type: tipo, filters: filtros, columns: cols };

                    var vistos = {};
                    var files = [];
                    var tope = false;
                    var cadaUno = function (r) {
                        var v = function (i) {
                            try { return String(r.getValue(cols[i]) == null ? '' : r.getValue(cols[i])); } catch (e) { return ''; }
                        };
                        var id = v(0);
                        if (id && !vistos[id]) {
                            vistos[id] = true;
                            var tipoTxt = '';
                            try { tipoTxt = String(r.getText(cols[2]) || ''); } catch (e) { tipoTxt = ''; }
                            files.push({
                                id: id,
                                name: v(1),
                                filetype: v(2),
                                filetypeText: tipoTxt,
                                sizeKb: v(3),
                                modified: v(4),
                                url: v(5)
                            });
                        }
                        if (files.length >= MAX) { tope = true; return false; }
                        return true;
                    };
                    var listo = function () { fin({ files: files, tope: tope }); };

                    var correr = function (s) {
                        var rs = s.run();
                        if (rs.each && typeof rs.each.promise === 'function') {
                            rs.each.promise(cadaUno).then(listo, falla);
                        } else {
                            rs.each(cadaUno);
                            listo();
                        }
                    };

                    if (search.create && typeof search.create.promise === 'function') {
                        search.create.promise(opciones).then(function (s) {
                            try { correr(s); } catch (e) { falla(e); }
                        }, falla);
                    } else {
                        correr(search.create(opciones));
                    }
                } catch (e) { falla(e); }
            }, function (e) {
                fin({ error: 'norequire', detail: String((e && e.message) || e || '') });
            });
        } catch (e) {
            fin({ error: 'norequire', detail: String((e && e.message) || e || '') });
        }
    }
})();
