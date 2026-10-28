(function () {
    'use strict';
    if (window.NSFT_CodeSearch) return;

    var A_LA_VEZ = 6;
    var TOPE = 4000;
    var LISTA_TOPE = 10000;
    var MAX_BYTES = 2000000;
    var POR_ARCHIVO = 20;
    var LISTA_TTL = 5 * 60 * 1000;

    var TIPOS = {
        scripts: ['JAVASCRIPT'],
        codigo: ['JAVASCRIPT', 'JSON', 'HTMLDOC', 'STYLESHEET', 'FREEMARKER']
    };

    var BUNDLES = "(fo.appfolder LIKE 'SuiteBundles%' OR fo.appfolder LIKE 'SuiteApps%')";

    var _listas = {};
    var _textos = new Map();

    function minusculas(r) {
        var o = {};
        Object.keys(r || {}).forEach(function (k) { o[k.toLowerCase()] = r[k]; });
        return o;
    }

    function escapa(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    function listar(T, opts) {
        var o = opts || {};
        var tipos = TIPOS[o.tipos] ? o.tipos : 'scripts';
        var todo = !!o.todo;
        var clave = tipos + (todo ? '|todo' : '|propio');
        var memo = _listas[clave];
        if (memo && Date.now() - memo.ts < LISTA_TTL) return Promise.resolve(memo.filas);
        if (!T) return Promise.reject(new Error('stale'));

        var enTipos = TIPOS[tipos].map(function (t) { return "'" + t + "'"; }).join(', ');
        var base = "SELECT f.id, f.name, f.url, f.filesize, TO_CHAR(f.lastmodifieddate, 'YYYY-MM-DD HH24:MI:SS') AS modif, fo.appfolder AS ruta"
            + ' FROM file f JOIN mediaitemfolder fo ON fo.id = f.folder'
            + ' WHERE f.filetype IN (' + enTipos + ')'
            + (todo ? '' : ' AND NOT ' + BUNDLES)
            + ' ORDER BY ' + (todo ? 'CASE WHEN ' + BUNDLES + ' THEN 1 ELSE 0 END, ' : '')
            + 'fo.appfolder, f.name';
        var filas = [];
        return new Promise(function (resolver, rechazar) {
            function terminar() {
                _listas[clave] = { ts: Date.now(), filas: filas };
                resolver(filas);
            }
            function pagina(offset) {
                T.run({ rest: base, sql: base + ' FETCH FIRST ' + LISTA_TOPE + ' ROWS ONLY', params: [], limit: 1000, offset: offset },
                    function (err, rows, meta) {
                        if (err) { if (filas.length) { terminar(); return; } rechazar(err); return; }
                        (rows || []).forEach(function (r) { filas.push(minusculas(r)); });
                        var sigue = meta && meta.via === 'rest' && meta.hasMore && filas.length < LISTA_TOPE;
                        if (sigue) pagina(offset + 1000); else terminar();
                    });
            }
            pagina(0);
        });
    }

    function rutaDeCarpeta(T, id) {
        var n = parseInt(id, 10);
        if (!T || !isFinite(n)) return Promise.resolve(null);
        return new Promise(function (resolver) {
            T.run({
                rest: 'SELECT appfolder FROM mediaitemfolder WHERE id = ' + T.lit(n),
                sql: 'SELECT appfolder FROM mediaitemfolder WHERE id = ?',
                params: [n],
                limit: 1
            }, function (err, rows) {
                var r = (!err && rows && rows[0]) ? minusculas(rows[0]) : null;
                resolver(r && r.appfolder ? String(r.appfolder) : null);
            });
        });
    }

    function enCarpeta(ruta, prefijo) {
        var r = String(ruta || '');
        return r === prefijo || r.indexOf(prefijo + ' : ') === 0;
    }

    function scripts(T, ids) {
        var limpios = (ids || []).map(Number).filter(function (n) { return isFinite(n) && n > 0; });
        if (!T || !limpios.length) return Promise.resolve({});
        var trozos = [];
        for (var i = 0; i < limpios.length; i += 500) trozos.push(limpios.slice(i, i + 500));
        return Promise.all(trozos.map(function (tr) {
            var sql = 'SELECT s.id, s.name, s.scripttype, s.scriptfile FROM script s WHERE s.scriptfile IN (' + tr.join(',') + ')';
            return new Promise(function (r) {
                T.run({ rest: sql, sql: sql, params: [], limit: 1000 }, function (err, rows) { r(err ? [] : (rows || [])); });
            });
        })).then(function (partes) {
            var mapa = {};
            partes.forEach(function (rows) {
                rows.forEach(function (r0) {
                    var o = minusculas(r0);
                    var f = String(o.scriptfile);
                    (mapa[f] = mapa[f] || []).push({ id: String(o.id), name: String(o.name || ''), type: String(o.scripttype || '') });
                });
            });
            return mapa;
        });
    }

    function regla(term, regex, opciones) {
        if (!regex && opciones && opciones.comillas) {
            var esc = String(term).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            var fuente = '(["\'`])' + esc + '\\1';
            var rc = new RegExp(fuente, 'i');
            return {
                prueba: function (l) { return rc.test(l); },
                tramos: function (l) {
                    var out = [];
                    var g = new RegExp(fuente, 'gi');
                    var m;
                    while ((m = g.exec(l)) && out.length < 50) out.push([m.index + 1, m.index + m[0].length - 1]);
                    return out;
                }
            };
        }
        if (regex) {
            var re;
            try { re = new RegExp(term, 'i'); } catch (e) { return { error: e.message || String(e) }; }
            return {
                prueba: function (l) { return re.test(l); },
                tramos: function (l) {
                    var out = [];
                    var g;
                    try { g = new RegExp(term, 'gi'); } catch (e) { return out; }
                    var m;
                    while ((m = g.exec(l)) && out.length < 50) {
                        if (!m[0]) { g.lastIndex++; continue; }
                        out.push([m.index, m.index + m[0].length]);
                    }
                    return out;
                }
            };
        }
        var TS = window.NSFT_TextSearch;
        var fold = function (s) { return TS && TS.fold ? TS.fold(s) : String(s).toLowerCase(); };
        var t = fold(term);
        return {
            prueba: function (l) { return fold(l).indexOf(t) >= 0; },
            tramos: function (l) {
                if (TS && TS.ranges) return (TS.ranges(l, term) || []).map(function (r) { return [r.start, r.end]; });
                var out = [];
                var low = l.toLowerCase(), q = String(term).toLowerCase();
                var i = low.indexOf(q);
                while (i >= 0 && q && out.length < 50) { out.push([i, i + q.length]); i = low.indexOf(q, i + q.length); }
                return out;
            }
        };
    }

    var ESCRIBE = /\b(setValue|setText|setSublistValue|setSublistText|setCurrentSublistValue|setCurrentSublistText|setMatrixSublistValue|submitFields|setFieldValue|setFieldText|setLineItemValue|setCurrentLineItemValue|nlapiSubmitField|nlapiSetFieldValue|nlapiSetFieldText|nlapiSetLineItemValue|nlapiSetCurrentLineItemValue)\s*\(/;
    var LEE = /\b(getValue|getText|getSublistValue|getSublistText|getCurrentSublistValue|getCurrentSublistText|lookupFields|getFieldValue|getFieldText|getLineItemValue|getCurrentLineItemValue|nlapiLookupField|nlapiGetFieldValue|nlapiGetFieldText|nlapiGetLineItemValue|nlapiGetCurrentLineItemValue)\s*\(/;

    function lineas(texto, r, max) {
        var tope = max || POR_ARCHIVO;
        var out = [];
        var ls = String(texto).split(/\r?\n/);
        for (var i = 0; i < ls.length && out.length < tope; i++) {
            var l = ls[i];
            if (!r.prueba(l)) continue;
            out.push({ n: i + 1, l: l, tipo: ESCRIBE.test(l) ? 'w' : (LEE.test(l) ? 'r' : '') });
        }
        return out;
    }

    function buscar(o) {
        var archivos = o.archivos || [];
        var r = o.regla;
        var max = o.porArchivo || POR_ARCHIVO;
        var debeParar = o.debeParar || function () { return false; };
        var alPaso = o.alPaso || function () {};
        var cuenta = { hechos: 0, total: archivos.length, saltados: 0, ilegibles: 0, hallados: 0 };
        var hallados = [];
        var siguiente = 0;

        function lee(f) {
            var memo = _textos.get(String(f.id));
            if (memo && memo.modif === f.modif) return Promise.resolve(memo.texto);
            var url = String(f.url || '');
            if (url.charAt(0) !== '/' || url.charAt(1) === '/') return Promise.resolve(null);
            return fetch(url, { credentials: 'same-origin' }).then(function (res) {
                var tipo = res.headers.get('content-type') || '';
                if (!res.ok || tipo.indexOf('text/html') >= 0 && !/\.html?$/i.test(String(f.name || ''))) return null;
                return res.text().then(function (texto) {
                    _textos.set(String(f.id), { modif: f.modif, texto: texto });
                    return texto;
                });
            }).catch(function () { return null; });
        }

        function obrero() {
            if (siguiente >= archivos.length || debeParar()) return Promise.resolve();
            var f = archivos[siguiente++];
            if ((Number(f.filesize) || 0) > MAX_BYTES) {
                cuenta.saltados++; cuenta.hechos++; alPaso(cuenta);
                return obrero();
            }
            return lee(f).then(function (texto) {
                if (texto == null) cuenta.ilegibles++;
                else {
                    var ls = lineas(texto, r, max);
                    if (ls.length) { hallados.push({ f: f, lineas: ls }); cuenta.hallados++; }
                }
                cuenta.hechos++;
                alPaso(cuenta);
                return obrero();
            });
        }

        var obreros = [];
        for (var i = 0; i < Math.min(A_LA_VEZ, archivos.length); i++) obreros.push(obrero());
        return Promise.all(obreros).then(function () {
            return {
                hallados: hallados, hechos: cuenta.hechos, total: cuenta.total,
                saltados: cuenta.saltados, ilegibles: cuenta.ilegibles
            };
        });
    }

    function ordenar(hallados) {
        var escribe = function (h) { return h.lineas.some(function (x) { return x.tipo === 'w'; }) ? 0 : 1; };
        return hallados.sort(function (a, b) {
            return (escribe(a) - escribe(b))
                || String(a.f.ruta || '').localeCompare(String(b.f.ruta || ''))
                || String(a.f.name || '').localeCompare(String(b.f.name || ''));
        });
    }

    function trozoHtml(linea, r, clase) {
        var tramos = r.tramos(linea) || [];
        var ini = 0;
        var fin = linea.length;
        if (fin > 220) {
            var primero = tramos.length ? tramos[0][0] : 0;
            ini = Math.max(0, primero - 70);
            fin = Math.min(linea.length, ini + 220);
        }
        while (ini < fin && /\s/.test(linea.charAt(ini))) ini++;
        var html = ini > 0 ? '&hellip;' : '';
        var p = ini;
        tramos.forEach(function (t) {
            var a = Math.max(t[0], ini), b = Math.min(t[1], fin);
            if (b <= a || a < p) return;
            html += escapa(linea.slice(p, a)) + '<mark class="' + escapa(clase) + '">' + escapa(linea.slice(a, b)) + '</mark>';
            p = b;
        });
        html += escapa(linea.slice(p, fin));
        if (fin < linea.length) html += '&hellip;';
        return html;
    }

    window.NSFT_CodeSearch = {
        A_LA_VEZ: A_LA_VEZ,
        TOPE: TOPE,
        MAX_BYTES: MAX_BYTES,
        POR_ARCHIVO: POR_ARCHIVO,
        listar: listar,
        rutaDeCarpeta: rutaDeCarpeta,
        enCarpeta: enCarpeta,
        scripts: scripts,
        regla: regla,
        lineas: lineas,
        buscar: buscar,
        ordenar: ordenar,
        trozoHtml: trozoHtml
    };
})();
