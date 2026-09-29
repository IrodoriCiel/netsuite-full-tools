'use strict';

(function () {
    if (window.__nsftSx) return;
    window.__nsftSx = true;

    var FETCHER_DEST = 'fetcher_sx';
    var EXTENSION_DEST = 'extension_sx';
    var PAGINA = 1000;
    var TOPE = 5000;

    var EN_MARCHA = { PENDING: 1, PROCESSING: 1, RESTART: 1, RETRY: 1 };
    var ETAPAS = ['GET_INPUT', 'MAP', 'SHUFFLE', 'REDUCE', 'SUMMARIZE'];

    var OCULTO = 'position:fixed;left:-10000px;top:-10000px;width:1px;height:1px;border:0;visibility:hidden;';

    window.addEventListener('message', function (event) {
        if (event.source !== window) return;
        var d = event.data;
        if (!d || typeof d !== 'object' || d.dest !== FETCHER_DEST) return;
        var p = d.payload || {};
        var contestado = false;
        function reply(err, data) {
            if (contestado) return;
            contestado = true;
            window.postMessage({
                dest: EXTENSION_DEST, type: 'reply', id: d.id,
                error: err || null, data: data == null ? null : data
            }, '*');
        }
        try {
            if (d.type === 'list') return listar(reply);
            if (d.type === 'script') return deUnScript(num(p.sid), reply);
            if (d.type === 'precheck') return comprobar(num(p.did), reply);
            if (d.type === 'execute') return ejecutar(num(p.did), num(p.sid), reply);
            if (d.type === 'track') return seguir(p, reply);
            reply({ code: 'type', message: String(d.type) });
        } catch (e) {
            reply({ code: 'internal', message: msg(e) });
        }
    });

    function num(v) { var n = parseInt(v, 10); return n > 0 ? n : 0; }
    function msg(e) { return String((e && (e.message || e.name)) || e || ''); }


    function conSql(cb) {
        var t0 = Date.now();
        (function mira() {
            if (window.NSFT_SQL) return cb(window.NSFT_SQL);
            if (Date.now() - t0 > 5000) return cb(null);
            setTimeout(mira, 100);
        })();
    }

    function minus(raw) {
        var r = {};
        for (var k in raw) {
            if (Object.prototype.hasOwnProperty.call(raw, k)) r[String(k).toLowerCase()] = raw[k];
        }
        return r;
    }

    function lit(v) {
        return window.NSFT_SQL ? window.NSFT_SQL.lit(v) : "'" + String(v).replace(/'/g, "''") + "'";
    }

    function consulta(rest, sql, params, cb) {
        conSql(function (S) {
            if (!S) return cb({ code: 'stale' }, null);
            var todas = [];
            var vistos = Object.create(null);
            (function pagina(offset) {
                S.run({ rest: rest, sql: sql, params: params || [], limit: PAGINA, offset: offset }, function (err, rows) {
                    if (err) return cb({ code: err.code || 'sql', message: err.message || '' }, null);
                    rows = rows || [];
                    var nuevas = 0;
                    for (var i = 0; i < rows.length; i++) {
                        var r = minus(rows[i]);
                        var k;
                        try { k = JSON.stringify(r); } catch (e) { k = 'x' + todas.length + '_' + i; }
                        if (vistos[k]) continue;
                        vistos[k] = 1;
                        todas.push(r);
                        nuevas++;
                    }
                    if (rows.length >= PAGINA && nuevas > 0 && todas.length < TOPE) pagina(offset + PAGINA);
                    else cb(null, todas);
                });
            })(0);
        });
    }

    var COLS = 's.id AS sid, s.name AS sname, s.scriptid AS sscriptid, s.scripttype AS stype, '
        + 's.isinactive AS inactive, d.primarykey AS did, d.title AS dtitle, d.scriptid AS dscriptid, '
        + 'd.status AS dstatus, d.isdeployed AS deployed';
    var DESDE = ' FROM script s INNER JOIN scriptdeployment d ON d.script = s.id';
    var TIPOS = " s.scripttype IN ('MAPREDUCE', 'SCHEDULED')";

    function fila(r) {
        return {
            sid: String(r.sid == null ? '' : r.sid),
            sname: String(r.sname || ''),
            sscriptid: String(r.sscriptid || ''),
            stype: String(r.stype || '').toUpperCase(),
            inactive: String(r.inactive || '').toUpperCase() === 'T',
            did: String(r.did == null ? '' : r.did),
            dtitle: String(r.dtitle || ''),
            dscriptid: String(r.dscriptid || ''),
            dstatus: String(r.dstatus || '').toUpperCase(),
            deployed: String(r.deployed || '').toUpperCase() === 'T'
        };
    }

    function listar(reply) {
        var q = 'SELECT ' + COLS + DESDE + ' WHERE' + TIPOS
            + " AND s.isinactive = 'F' AND d.isdeployed = 'T' ORDER BY s.name, d.primarykey";
        consulta(q, q, [], function (err, rows) {
            if (err) return reply(err);
            reply(null, { rows: rows.map(fila) });
        });
    }

    function deUnScript(sid, reply) {
        if (!sid) return reply({ code: 'args' });
        var base = 'SELECT ' + COLS + DESDE + ' WHERE s.id = ';
        consulta(base + lit(sid) + ' ORDER BY d.primarykey', base + '? ORDER BY d.primarykey', [sid], function (err, rows) {
            if (err) return reply(err);
            reply(null, { rows: rows.map(fila) });
        });
    }

    function comprobar(did, reply) {
        if (!did) return reply({ code: 'args' });
        var base = 'SELECT ' + COLS + DESDE + ' WHERE d.primarykey = ';
        consulta(base + lit(did), base + '?', [did], function (err, rows) {
            if (err) return reply(err);
            if (!rows.length) return reply({ code: 'notfound' });
            var dep = fila(rows[0]);
            var b2 = 'SELECT ' + COLS + DESDE + " WHERE d.isdeployed = 'T' AND s.id = ";
            consulta(b2 + lit(dep.sid) + ' ORDER BY d.primarykey', b2 + '? ORDER BY d.primarykey', [num(dep.sid)], function (e2, sibs) {
                var hermanos = e2 ? [] : sibs.map(fila);
                var ids = [did];
                hermanos.forEach(function (h) { if (num(h.did) && ids.indexOf(num(h.did)) < 0) ids.push(num(h.did)); });
                instancias(ids, 100, num(dep.sid), function (e3, filas) {
                    var busy = {};
                    if (!e3) {
                        filas.forEach(function (f) {
                            if (EN_MARCHA[f.status] && f.did && !busy[f.did]) busy[f.did] = { status: f.status, since: f.created };
                        });
                    }
                    reply(null, {
                        dep: dep,
                        siblings: hermanos,
                        busy: busy,
                        searchOk: !e3,
                        searchError: e3 ? (e3.code || 'search') : null
                    });
                });
            });
        });
    }


    var _search = null;

    function cargarSearch(w, cb) {
        if (!w || typeof w.require !== 'function') return cb({ code: 'norequire' });
        var hecho = false;
        var t = setTimeout(function () { if (!hecho) { hecho = true; cb({ code: 'timeout' }); } }, 8000);
        try {
            w.require(['N/search'], function (s) {
                if (hecho) return;
                hecho = true;
                clearTimeout(t);
                if (s && typeof s.create === 'function') cb(null, s);
                else cb({ code: 'nosearch' });
            }, function (e) {
                if (hecho) return;
                hecho = true;
                clearTimeout(t);
                cb({ code: 'nosearch', message: msg(e) });
            });
        } catch (e) {
            if (hecho) return;
            hecho = true;
            clearTimeout(t);
            cb({ code: 'nosearch', message: msg(e) });
        }
    }

    var _ayu = null;
    var AYU_OCIOSO = 5 * 60 * 1000;

    function ayudante(sid, cb) {
        if (_ayu && _ayu.search) { tocarAyu(); return cb(null, _ayu.search); }
        if (_ayu) { _ayu.cbs.push(cb); return; }
        if (!sid) return cb({ code: 'norequire' });
        _ayu = { frame: null, search: null, cbs: [cb], ocio: 0 };
        var f = document.createElement('iframe');
        f.setAttribute('aria-hidden', 'true');
        f.tabIndex = -1;
        f.style.cssText = OCULTO;
        _ayu.frame = f;
        var listo = false;
        function acaba(err, s) {
            if (listo) return;
            listo = true;
            clearTimeout(plazo);
            var cbs = _ayu ? _ayu.cbs.splice(0) : [];
            if (err) { quitarAyu(); } else { _ayu.search = s; tocarAyu(); }
            cbs.forEach(function (fn) { fn(err || null, s); });
        }
        var plazo = setTimeout(function () { acaba({ code: 'timeout' }); }, 30000);
        f.addEventListener('load', function () {
            var w = null;
            try { w = f.contentWindow; } catch (e) { return acaba({ code: 'access' }); }
            cargarSearch(w, acaba);
        });
        f.src = '/app/common/scripting/script.nl?id=' + encodeURIComponent(sid);
        (document.body || document.documentElement).appendChild(f);
    }

    function tocarAyu() {
        if (!_ayu) return;
        clearTimeout(_ayu.ocio);
        _ayu.ocio = setTimeout(quitarAyu, AYU_OCIOSO);
    }

    function quitarAyu() {
        if (!_ayu) return;
        clearTimeout(_ayu.ocio);
        try { if (_ayu.frame) _ayu.frame.remove(); } catch (e) { }
        _ayu = null;
    }

    function conSearch(sid, cb) {
        if (_search) return cb(null, _search);
        cargarSearch(window, function (err, s) {
            if (!err) { _search = s; return cb(null, s); }
            ayudante(sid, cb);
        });
    }

    function instancias(dids, max, sid, cb) {
        conSearch(sid, function (err, search) {
            if (err) return cb(err);
            var filtros;
            try {
                filtros = [search.createFilter({
                    name: 'internalid', join: 'scriptdeployment',
                    operator: search.Operator.ANYOF, values: dids.map(String)
                })];
            } catch (e) { return cb({ code: 'search', message: msg(e) }); }
            var orden = function () { return search.createColumn({ name: 'datecreated', sort: search.Sort.DESC }); };
            var dep = function () { return search.createColumn({ name: 'internalid', join: 'scriptdeployment' }); };
            correr(search, filtros, [orden(), dep(), 'status', 'taskid', 'mapreducestage', 'percentcomplete'], max, function (e1, filas) {
                if (!e1) return cb(null, filas);
                correr(search, filtros, [orden(), dep(), 'status'], max, cb);
            });
        });
    }

    function correr(search, filtros, columnas, max, cb) {
        var rs;
        try {
            rs = search.create({ type: 'scheduledscriptinstance', filters: filtros, columns: columnas }).run();
        } catch (e) { return cb({ code: 'search', message: msg(e) }); }
        var hecho = false;
        var plazo = setTimeout(function () { if (!hecho) { hecho = true; cb({ code: 'search', message: 'timeout' }); } }, 20000);
        function fin(res) {
            if (hecho) return;
            hecho = true;
            clearTimeout(plazo);
            cb(null, (res || []).map(instancia));
        }
        function falla(e) {
            if (hecho) return;
            hecho = true;
            clearTimeout(plazo);
            cb({ code: 'search', message: msg(e) });
        }
        try {
            if (rs.getRange && typeof rs.getRange.promise === 'function') {
                rs.getRange.promise({ start: 0, end: max }).then(fin, falla);
            } else {
                fin(rs.getRange({ start: 0, end: max }));
            }
        } catch (e) { falla(e); }
    }

    function instancia(r) {
        function v(n, j) {
            try { return j ? r.getValue({ name: n, join: j }) : r.getValue(n); } catch (e) { return ''; }
        }
        return {
            id: String(r.id || ''),
            did: String(v('internalid', 'scriptdeployment') || ''),
            status: String(v('status') || '').toUpperCase(),
            task: String(v('taskid') || ''),
            stage: String(v('mapreducestage') || '').toUpperCase(),
            percent: porcentaje(v('percentcomplete')),
            created: String(v('datecreated') || '')
        };
    }

    function porcentaje(v) {
        var s = String(v == null ? '' : v).trim();
        if (!s) return null;
        var n = parseFloat(s.replace('%', '').replace(',', '.'));
        if (isNaN(n)) return null;
        if (s.indexOf('%') < 0 && n <= 1) n = n * 100;
        return Math.max(0, Math.min(100, Math.round(n)));
    }


    var SEL_ERROR = [
        '.uir-error-page-message',
        '.uir-alert-box.error .descr',
        '#div__alert .error .descr',
        'td.errortextheading',
        '.errortext'
    ];

    function textoError(d) {
        for (var i = 0; i < SEL_ERROR.length; i++) {
            var el = null;
            try { el = d.querySelector(SEL_ERROR[i]); } catch (e) { el = null; }
            var t = el ? String(el.textContent || '').replace(/\s+/g, ' ').trim() : '';
            if (t) return t.slice(0, 300);
        }
        return '';
    }

    function marcarCambiado(w) {
        try { w.ischanged = true; } catch (e) { }
        try {
            if (w.NS && w.NS.form && typeof w.NS.form.setChanged === 'function') w.NS.form.setChanged(true);
        } catch (e) { }
    }

    function ruta(w) {
        try { return String(w.location.pathname + w.location.search); } catch (e) { return ''; }
    }

    function enviar(did, cb) {
        var f = document.createElement('iframe');
        f.setAttribute('aria-hidden', 'true');
        f.tabIndex = -1;
        f.style.cssText = OCULTO;
        var fase = 'carga';
        var acabado = false;
        var plazo = setTimeout(function () { fin({ code: 'timeout', stage: fase }); }, 40000);

        function fin(err, llegada) {
            if (acabado) return;
            acabado = true;
            clearTimeout(plazo);
            setTimeout(function () { try { f.remove(); } catch (e) { } }, 0);
            cb(err || null, llegada || '');
        }

        f.addEventListener('load', function () {
            if (acabado) return;
            var w, d;
            try { w = f.contentWindow; d = w.document; } catch (e) { return fin({ code: 'access', message: msg(e) }); }
            var donde = ruta(w);
            if (/\/app\/login\//i.test(donde)) return fin({ code: 'session' });

            if (fase === 'carga') {
                var btn = d.getElementById('submitexecute');
                if (!btn) return fin({ code: 'nobutton', message: textoError(d) });
                try { w.alert = function (m) { fin({ code: 'netsuite', message: String(m || '') }); }; } catch (e) { }
                marcarCambiado(w);
                fase = 'envio';
                clearTimeout(plazo);
                plazo = setTimeout(function () { fin({ code: 'timeout', stage: fase }); }, 60000);
                try {
                    btn.click();
                } catch (e) {
                    try { w.NLMultiButton_doAction('multibutton_submitter', 'submitexecute'); }
                    catch (e2) { fin({ code: 'submit', message: msg(e2) }); }
                }
                return;
            }

            var err = textoError(d);
            if (err) return fin({ code: 'netsuite', message: err });
            fin(null, donde);
        });

        f.src = '/app/common/scripting/scriptrecord.nl?id=' + encodeURIComponent(did) + '&e=T';
        (document.body || document.documentElement).appendChild(f);
    }

    function ejecutar(did, sid, reply) {
        if (!did) return reply({ code: 'args' });
        instancias([did], 50, sid, function (e0, previas) {
            var antes = null;
            if (!e0) {
                antes = {};
                previas.forEach(function (f) { antes[f.id] = 1; });
            }
            enviar(did, function (err, llegada) {
                if (err) return reply(err);
                if (!antes) return reply(null, { found: false, searchOk: false, landing: llegada });
                var known = Object.keys(antes);
                var t0 = Date.now();
                (function busca() {
                    instancias([did], 50, sid, function (e1, filas) {
                        var nuevas = e1 ? [] : filas.filter(function (f) { return !antes[f.id]; });
                        if (nuevas.length) {
                            return reply(null, { found: true, searchOk: true, landing: llegada, known: known, task: nuevas[0].task || '' });
                        }
                        if (Date.now() - t0 > 20000) {
                            return reply(null, { found: false, searchOk: !e1, landing: llegada, known: known });
                        }
                        setTimeout(busca, 2000);
                    });
                })();
            });
        });
    }


    function seguir(p, reply) {
        var did = num(p.did);
        if (!did) return reply({ code: 'args' });
        instancias([did], 50, num(p.sid), function (err, filas) {
            if (err) return reply(err);
            var conocidas = {};
            (p.known || []).forEach(function (k) { conocidas[String(k)] = 1; });
            var nuevas = filas.filter(function (f) { return !conocidas[f.id]; });
            if (p.task) nuevas = nuevas.filter(function (f) { return !f.task || f.task === p.task; });
            reply(null, resumen(nuevas, String(p.stype || '').toUpperCase()));
        });
    }

    function orden(stage) { var i = ETAPAS.indexOf(stage); return i < 0 ? 99 : i; }

    function resumen(filas, stype) {
        if (!filas.length) return { state: 'PENDING', stage: '', percent: null };
        var por = filas.slice().sort(function (a, b) { return orden(a.stage) - orden(b.stage); });
        var con = function (st) { return por.filter(function (f) { return f.status === st; }); };

        var fallo = con('FAILED');
        if (fallo.length) return { state: 'FAILED', stage: fallo[0].stage, percent: null };
        var cancel = con('CANCELED').concat(con('CANCELLED'));
        if (cancel.length) return { state: 'CANCELED', stage: cancel[0].stage, percent: null };

        var activa = por.filter(function (f) { return f.status === 'PROCESSING' || f.status === 'RESTART' || f.status === 'RETRY'; })[0];
        if (activa) return { state: 'PROCESSING', stage: activa.stage, percent: activa.percent };

        var hechas = con('COMPLETE');
        if (hechas.length === por.length) {
            if (stype !== 'MAPREDUCE') return { state: 'COMPLETE', stage: '', percent: 100 };
            if (hechas.some(function (f) { return f.stage === 'SUMMARIZE'; })) return { state: 'COMPLETE', stage: '', percent: 100 };
            var ultima = hechas[hechas.length - 1].stage;
            var sig = ETAPAS[Math.min(ETAPAS.length - 1, orden(ultima) + 1)] || '';
            return { state: 'PROCESSING', stage: sig, percent: null };
        }
        if (hechas.length) {
            var pend = por.filter(function (f) { return f.status !== 'COMPLETE'; })[0];
            return { state: 'PROCESSING', stage: pend ? pend.stage : '', percent: null };
        }
        return { state: 'PENDING', stage: '', percent: null };
    }
})();
