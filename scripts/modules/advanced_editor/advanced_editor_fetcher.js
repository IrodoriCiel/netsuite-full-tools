'use strict';

(function () {
    if (window.__nsftAdvEditor) return;
    window.__nsftAdvEditor = true;

    var FETCHER_DEST = 'fetcher_adv';
    var EXTENSION_DEST = 'extension_adv';

    var TOPE_SUBS = 300;
    var TOPE_FILES = 1000;
    var TOPE_NIVELES = 12;

    function runSql(spec, cb) {
        if (!window.NSFT_SQL) { cb({ code: 'stale' }, null); return; }
        window.NSFT_SQL.run(spec, cb);
    }

    function lit(v) {
        return window.NSFT_SQL ? window.NSFT_SQL.lit(v) : "'" + String(v).replace(/'/g, "''") + "'";
    }

    function num(v) {
        var n = parseInt(v, 10);
        return isFinite(n) ? n : null;
    }

    function responde(type, token, err, data) {
        window.postMessage({
            dest: EXTENSION_DEST,
            type: type,
            payload: { token: token, error: err || null, data: data || null }
        }, '*');
    }

    window.addEventListener('message', function (event) {
        if (event.source !== window) return;
        var d = event.data;
        if (!d || typeof d !== 'object' || d.dest !== FETCHER_DEST) return;
        var p = d.payload || {};
        if (d.type === 'tree') { pideCarpeta(num(p.folder), p.token); return; }
        if (d.type === 'children') {
            pideHijos(p.folder == null || p.folder === '' ? null : num(p.folder), p.token);
            return;
        }
        if (d.type === 'sello') { pideSello(num(p.id), p.token); return; }
        if (d.type === 'nombres') { buscaNombres(String(p.term || ''), p.token); return; }
        if (d.type === 'carpetas') { buscaCarpetas(String(p.term || ''), p.token); return; }
        if (d.type === 'cambiado') { marcaCambiado(!!p.marco, p.token); return; }
    });

    function marcaCambiado(enMarco, token) {
        var hecho = false;
        try {
            var win = window;
            if (enMarco) {
                var f = document.querySelector('iframe.nsft-adv-marco');
                if (f && f.contentWindow) win = f.contentWindow;
            }
            var fns = ['setWindowChanged', 'NLWindowChanged', 'nlapiSetWindowChanged'];
            for (var i = 0; i < fns.length; i++) {
                if (typeof win[fns[i]] === 'function') { win[fns[i]](win, true); hecho = true; break; }
            }
            if (!hecho && win.document && win.document.forms[0]) {
                var m = win.document.getElementById('nsformchanged');
                if (m) { m.value = 'T'; hecho = true; }
            }
        } catch (e) { }
        responde('cambiado', token, null, { hecho: hecho });
    }


    function buscaCarpetas(term, token) {
        var t = term.replace(/^\s+|\s+$/g, '');
        if (t.length < MIN_NOMBRE) { responde('carpetas', token, null, { folders: [] }); return; }
        var patron = '%' + t.toUpperCase() + '%';
        var orden = ' ORDER BY CASE WHEN UPPER(name) LIKE ' + lit(t.toUpperCase() + '%')
            + ' THEN 0 ELSE 1 END, name';

        runSql({
            rest: 'SELECT id, name, parent FROM mediaitemfolder WHERE UPPER(name) LIKE ' + lit(patron) + orden,
            sql: 'SELECT id, name, parent FROM mediaitemfolder WHERE UPPER(name) LIKE ?' + orden,
            params: [patron],
            limit: TOPE_NOMBRES
        }, function (err, rows) {
            if (err) { responde('carpetas', token, { code: 'sql' }, null); return; }
            responde('carpetas', token, null, {
                folders: (rows || []).map(function (r) {
                    var c = carpeta(r);
                    c.parent = (r.parent == null || r.parent === '') ? '' : String(r.parent);
                    return c;
                })
            });
        });
    }


    var TOPE_NOMBRES = 60;
    var MIN_NOMBRE = 2;

    function buscaNombres(term, token) {
        var t = term.replace(/^\s+|\s+$/g, '');
        if (t.length < MIN_NOMBRE) { responde('nombres', token, null, { files: [] }); return; }
        var patron = '%' + t.toUpperCase() + '%';

        var orden = ' ORDER BY CASE WHEN UPPER(name) LIKE ' + lit(t.toUpperCase() + '%')
            + ' THEN 0 ELSE 1 END, name';

        runSql({
            rest: 'SELECT id, name, folder, url, filetype FROM file WHERE UPPER(name) LIKE '
                + lit(patron) + orden,
            sql: 'SELECT id, name, folder, url, filetype FROM file WHERE UPPER(name) LIKE ?'
                + orden,
            params: [patron],
            limit: TOPE_NOMBRES,
            fallback: {
                rest: 'SELECT id, name, folder FROM file WHERE UPPER(name) LIKE ' + lit(patron) + orden,
                sql: 'SELECT id, name, folder FROM file WHERE UPPER(name) LIKE ?' + orden,
                params: [patron],
                limit: TOPE_NOMBRES
            }
        }, function (err, rows) {
            if (err) { responde('nombres', token, { code: 'sql' }, null); return; }
            responde('nombres', token, null, { files: (rows || []).map(hallado) });
        });
    }

    function hallado(r) {
        var f = archivo(r);
        f.folder = (r.folder == null || r.folder === '') ? '' : String(r.folder);
        return f;
    }

    function pideSello(id, token) {
        if (id == null) { responde('sello', token, null, { sello: '' }); return; }
        runSql({
            rest: 'SELECT lastmodifieddate FROM file WHERE id = ' + lit(id),
            sql: 'SELECT lastmodifieddate FROM file WHERE id = ?',
            params: [id],
            limit: 1
        }, function (err, rows) {
            var r = (!err && rows && rows[0]) || null;
            var sello = r ? String(r.lastmodifieddate || r.LASTMODIFIEDDATE || '') : '';
            responde('sello', token, null, { sello: sello });
        });
    }

    function pideHijos(folder, token) {
        var esRaiz = (folder == null);
        var out = { folder: folder, subs: [], files: [] };
        var fallos = 0;
        var total = esRaiz ? 1 : 2;
        var pendientes = total;

        function parcial(err) {
            if (err) fallos++;
            if (--pendientes > 0) return;
            if (fallos === total) { responde('children', token, { code: 'sql' }, null); return; }
            responde('children', token, null, out);
        }

        runSql(consultaSubcarpetas(folder), function (err, rows) {
            if (!err && rows) out.subs = rows.map(carpeta);
            parcial(err);
        });

        if (esRaiz) return;

        runSql(consultaArchivos(folder), function (err, rows) {
            if (!err && rows) out.files = rows.map(archivo);
            parcial(err);
        });
    }

    function pideCarpeta(folder, token) {
        if (folder == null) { responde('tree', token, { code: 'folder' }, null); return; }

        var out = { folder: folder, path: [], subs: [], files: [] };
        var fallos = 0;
        var pendientes = 3;

        function parcial(err) {
            if (err) fallos++;
            if (--pendientes > 0) return;
            if (fallos === 3) { responde('tree', token, { code: 'sql' }, null); return; }
            responde('tree', token, null, out);
        }

        migas(folder, function (err, ruta) {
            out.path = ruta || [];
            parcial(err);
        });

        runSql(consultaSubcarpetas(folder), function (err, rows) {
            if (!err && rows) out.subs = rows.map(carpeta);
            parcial(err);
        });

        runSql(consultaArchivos(folder), function (err, rows) {
            if (!err && rows) out.files = rows.map(archivo);
            parcial(err);
        });
    }

    function consultaSubcarpetas(folder) {
        if (folder == null) {
            return {
                rest: 'SELECT id, name FROM mediaitemfolder WHERE parent IS NULL ORDER BY name',
                sql: 'SELECT id, name FROM mediaitemfolder WHERE parent IS NULL ORDER BY name',
                params: [],
                limit: TOPE_SUBS
            };
        }
        return {
            rest: 'SELECT id, name FROM mediaitemfolder WHERE parent = ' + lit(folder) + ' ORDER BY name',
            sql: 'SELECT id, name FROM mediaitemfolder WHERE parent = ? ORDER BY name',
            params: [folder],
            limit: TOPE_SUBS
        };
    }

    function consultaArchivos(folder) {
        return {
            rest: 'SELECT id, name, url, filetype FROM file WHERE folder = ' + lit(folder) + ' ORDER BY name',
            sql: 'SELECT id, name, url, filetype FROM file WHERE folder = ? ORDER BY name',
            params: [folder],
            limit: TOPE_FILES,
            fallback: {
                rest: 'SELECT id, name FROM file WHERE folder = ' + lit(folder) + ' ORDER BY name',
                sql: 'SELECT id, name FROM file WHERE folder = ? ORDER BY name',
                params: [folder],
                limit: TOPE_FILES
            }
        };
    }

    function carpeta(r) {
        return { id: String(r.id), name: String(r.name || '') };
    }

    function archivo(r) {
        return {
            id: String(r.id),
            name: String(r.name || ''),
            url: String(r.url || ''),
            filetype: String(r.filetype || '')
        };
    }

    function migas(folder, cb) {
        var ruta = [];
        var visto = {};

        function sube(id, nivel) {
            if (id == null || nivel > TOPE_NIVELES || visto[id]) { cb(null, ruta.reverse()); return; }
            visto[id] = true;
            runSql({
                rest: 'SELECT id, name, parent FROM mediaitemfolder WHERE id = ' + lit(id),
                sql: 'SELECT id, name, parent FROM mediaitemfolder WHERE id = ?',
                params: [id],
                limit: 1
            }, function (err, rows) {
                if (err) { cb(ruta.length ? null : err, ruta.reverse()); return; }
                var r = (rows && rows[0]) || null;
                if (!r) { cb(null, ruta.reverse()); return; }
                ruta.push({ id: String(r.id), name: String(r.name || '') });
                sube(num(r.parent), nivel + 1);
            });
        }

        sube(folder, 1);
    }
})();
