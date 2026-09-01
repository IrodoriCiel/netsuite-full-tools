'use strict';

(function () {
    if (window.__nsftCFinder) return;
    window.__nsftCFinder = true;

    var FETCHER_DEST = 'fetcher_cfind';
    var EXTENSION_DEST = 'extension_cfind';
    var PAGINA = 1000;
    var TOPE = 10000;

    var FUENTES = {
        script: {
            tabla: 'script', id: 'id', nombre: 'name',
            cols: 'id, name, scriptid, scripttype',
            busca: ['name', 'scriptid'], orden: 'name',
            url: function (r) { return '/app/common/scripting/script.nl?id=' + enc(r.id); },
            sub: function (r) { return [r.scripttype, r.scriptid].filter(Boolean).join(' · '); }
        },
        wf: {
            tabla: 'workflow', id: 'internalid', nombre: 'name',
            cols: 'internalid, name, scriptid, releasestatus',
            busca: ['name', 'scriptid'], orden: 'name',
            url: function (r) {
                return '/app/common/workflow/setup/nextgen/workflowdesktop.nl?id=' + enc(r.internalid) + '&whence=';
            },
            sub: function (r) { return [r.releasestatus, r.scriptid].filter(Boolean).join(' · '); }
        },
        rec: {
            tabla: 'customrecordtype', id: 'internalid', nombre: 'name',
            cols: 'internalid, name, scriptid',
            busca: ['name', 'scriptid'], orden: 'name',
            url: function (r) { return '/app/common/custom/custrecord.nl?id=' + enc(r.internalid); },
            urlList: function (r) { return '/app/common/custom/custrecordentrylist.nl?rectype=' + enc(r.internalid); },
            sub: function (r) { return r.scriptid || ''; }
        },
        field: {
            tabla: 'customfield', id: 'internalid', nombre: 'name',
            cols: 'internalid, name, scriptid, fieldtype',
            busca: ['name', 'scriptid'], orden: 'name',
            url: function (r) {
                var pagina = paginaCampo(r.fieldtype, r.scriptid);
                return pagina ? '/app/common/custom/' + pagina + '?id=' + enc(r.internalid) : null;
            },
            sub: function (r) { return [tipoCampo(r.fieldtype), r.scriptid].filter(Boolean).join(' · '); }
        },
        ss: {
            tabla: 'savedsearch', id: 'id', nombre: 'name',
            cols: 'id, name, scriptid, searchtype',
            busca: ['name', 'scriptid'], orden: 'name',
            url: function (r) { return '/app/common/search/search.nl?e=T&id=' + enc(r.id); },
            sub: function (r) { return [r.searchtype, r.scriptid].filter(Boolean).join(' · '); }
        },
        pdf: {
            tabla: 'advancedpdftemplate', id: 'id', nombre: 'name',
            cols: 'id, name, scriptid, printtype',
            busca: ['name', 'scriptid'], orden: 'name',
            url: function (r) { return '/app/common/custom/advancedprint/pdftemplate.nl?id=' + enc(r.id); },
            sub: function (r) { return [r.printtype, r.scriptid].filter(Boolean).join(' · '); }
        },
        file: {
            tabla: 'file', id: 'id', nombre: 'name',
            cols: 'id, name, filetype',
            busca: ['name'], orden: '',
            url: function (r) { return '/app/common/media/mediaitem.nl?id=' + enc(r.id); },
            sub: function (r) { return r.filetype || ''; }
        },
        deploy: {
            tabla: 'scriptdeployment', id: 'id', nombre: 'title',
            cols: 'id, title, scriptid, status',
            busca: ['title', 'scriptid'], orden: 'title',
            url: function (r) { return '/app/common/scripting/scriptrecord.nl?id=' + enc(r.id); },
            sub: function (r) { return [r.status, r.scriptid].filter(Boolean).join(' · '); }
        },
        list: {
            tabla: 'customlist', id: 'internalid', nombre: 'name',
            cols: 'internalid, name, scriptid',
            busca: ['name', 'scriptid'], orden: 'name',
            url: function (r) { return '/app/common/custom/custlist.nl?id=' + enc(r.internalid); },
            sub: function (r) { return r.scriptid || ''; }
        }
    };

    var PAGINA_POR_TIPO = {
        BODY: 'bodycustfield.nl',
        COLUMN: 'columncustfield.nl',
        ENTITY: 'entitycustfield.nl',
        ITEM: 'itemcustfield.nl',
        ITEMNUMBER: 'itemnumbercustfield.nl',
        EVENT: 'crmcustfield.nl',
        RECORD: 'othercustfield.nl'
    };
    var SIN_PAGINA = { SCRIPT: 1, WORKFLOW: 1, WFSTATE: 1 };

    function paginaCampo(fieldtype, scriptid) {
        var t = String(fieldtype || '').toUpperCase();
        if (SIN_PAGINA[t]) return null;
        if (PAGINA_POR_TIPO[t]) return PAGINA_POR_TIPO[t];
        var s = String(scriptid || '').toLowerCase();
        if (s.indexOf('custbody') === 0) return 'bodycustfield.nl';
        if (s.indexOf('custcol') === 0) return 'columncustfield.nl';
        if (s.indexOf('custentity') === 0) return 'entitycustfield.nl';
        if (s.indexOf('custitemnumber') === 0) return 'itemnumbercustfield.nl';
        if (s.indexOf('custitem') === 0) return 'itemcustfield.nl';
        if (s.indexOf('custevent') === 0) return 'crmcustfield.nl';
        if (s.indexOf('custrecord') === 0) return 'othercustfield.nl';
        return null;
    }

    function tipoCampo(fieldtype) {
        return String(fieldtype || '').toUpperCase() || '';
    }

    function enc(v) { return encodeURIComponent(String(v == null ? '' : v)); }

    function runSql(spec, cb) {
        if (!window.NSFT_SQL) { cb({ code: 'stale' }, null); return; }
        window.NSFT_SQL.run(spec, cb);
    }

    function lit(v) {
        return window.NSFT_SQL ? window.NSFT_SQL.lit(v) : "'" + String(v).replace(/'/g, "''") + "'";
    }

    function limpiaTermino(t) {
        return String(t || '').replace(/[%_]/g, '').trim();
    }

    window.addEventListener('message', function (event) {
        if (event.source !== window) return;
        var d = event.data;
        if (!d || typeof d !== 'object' || d.dest !== FETCHER_DEST) return;
        if (d.type !== 'find') return;
        var p = d.payload || {};
        buscar(String(p.kind || ''), p.term, p.token);
    });

    function buscar(kind, term, token) {
        var f = FUENTES[kind];
        if (!f) { responde(kind, token, { code: 'kind', message: 'Unknown kind: ' + kind }, null); return; }

        var t = limpiaTermino(term);
        var listable = (kind !== 'file');
        if (!t && !listable) { responde(kind, token, null, []); return; }

        var orden = f.orden ? ' ORDER BY ' + f.orden : '';
        var cola = orden + ' FETCH FIRST ' + TOPE + ' ROWS ONLY';

        function pasada(plegado, cb) {
            var TS = window.NSFT_TextSearch;
            var termino = (plegado && TS) ? TS.sqlTerm(t) : t.toUpperCase();
            var like = '%' + termino + '%';
            var condRest = [];
            var condSql = [];
            var params = [];
            if (t) {
                f.busca.forEach(function (c) {
                    var col = (plegado && TS) ? TS.sqlFold(c) : 'UPPER(' + c + ')';
                    condRest.push(col + ' LIKE ' + lit(like));
                    condSql.push(col + ' LIKE ?');
                    params.push(like);
                });
            }
            var whereRest = condRest.length ? ' WHERE ' + condRest.join(' OR ') : '';
            var whereSql = condSql.length ? ' WHERE ' + condSql.join(' OR ') : '';
            var spec = {
                rest: 'SELECT ' + f.cols + ' FROM ' + f.tabla + whereRest + cola,
                sql: 'SELECT ' + f.cols + ' FROM ' + f.tabla + whereSql + cola,
                params: params
            };

            var todas = [];
            var vistos = Object.create(null);
            function pagina(offset) {
                runSql({
                    rest: spec.rest, sql: spec.sql, params: spec.params,
                    limit: PAGINA, offset: offset
                }, function (err, rows) {
                    if (err) { cb(err, null); return; }
                    rows = rows || [];
                    var nuevas = 0;
                    for (var i = 0; i < rows.length; i++) {
                        var k;
                        try { k = JSON.stringify(rows[i]); } catch (e) { k = 'x' + todas.length + '_' + i; }
                        if (vistos[k]) continue;
                        vistos[k] = 1;
                        todas.push(rows[i]);
                        nuevas++;
                    }
                    if (rows.length >= PAGINA && nuevas > 0 && todas.length < TOPE) {
                        pagina(offset + PAGINA);
                    } else {
                        cb(null, todas);
                    }
                });
            }
            pagina(0);
        }

        pasada(false, function (err, rows) {
            if (err) { responde(kind, token, err, null); return; }
            if ((rows && rows.length) || !t || !window.NSFT_TextSearch) { entrega(rows); return; }
            pasada(true, function (err2, rows2) {
                entrega(err2 ? rows : rows2);
            });
        });

        function entrega(rows) {
            responde(kind, token, null, (rows || []).map(function (raw) {
                var r = {};
                for (var k in raw) { if (Object.prototype.hasOwnProperty.call(raw, k)) r[String(k).toLowerCase()] = raw[k]; }
                var estado = String(r.releasestatus || r.status || '');
                return {
                    id: String(r[f.id] == null ? '' : r[f.id]),
                    label: String(r[f.nombre] == null ? '' : r[f.nombre]) || String(r.scriptid || ''),
                    sid: String(r.scriptid || ''),
                    kindDetail: kindDetalle(kind, r),
                    status: estado,
                    description: f.sub(r) || '',
                    url: f.url(r),
                    urlList: f.urlList ? f.urlList(r) : null
                };
            }).filter(function (x) { return x.label; }));
        }
    }

    function kindDetalle(kind, r) {
        if (kind === 'script') return String(r.scripttype || '');
        if (kind === 'field') return tipoCampo(r.fieldtype);
        if (kind === 'ss') return String(r.searchtype || '');
        if (kind === 'pdf') return String(r.printtype || '');
        if (kind === 'file') return String(r.filetype || '');
        return '';
    }

    function responde(kind, token, err, items) {
        window.postMessage({
            dest: EXTENSION_DEST,
            type: 'results',
            payload: { kind: kind, token: token, error: err || null, items: items || [] }
        }, '*');
    }
})();
