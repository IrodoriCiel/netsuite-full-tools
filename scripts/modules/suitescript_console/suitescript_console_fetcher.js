'use strict';

(function () {
    if (window.__nsftSsConsole) return;
    window.__nsftSsConsole = true;

    var FETCHER_DEST = 'fetcher_ssc';
    var EXTENSION_DEST = 'extension_ssc';

    var MAX_CADENA = 40000;
    var MAX_FILAS = 500;
    var MAX_PROF = 6;

    window.addEventListener('message', function (event) {
        if (event.source !== window) return;
        var d = event.data;
        if (!d || typeof d !== 'object' || d.dest !== FETCHER_DEST) return;
        if (d.type === 'run') ejecutar(d.payload || {});
        else if (d.type === 'modules') sondearModulos(d.payload || {});
        else if (d.type === 'check') revisar(d.payload || {});
        else if (d.type === 'types') {
            var pt = d.payload || {};
            sondearTipos(function (tipos, retornos) {
                responde('types', { tipos: tipos, retornos: retornos, token: pt.token });
            });
        }
    });

    var MAX_MIEMBROS = 300;
    var MAX_SUBCLAVES = 500;
    var MAX_SUBOBJETOS = 60;

    function enumeraMiembros(mod) {
        var m = [], s = {};
        try {
            var claves = Object.keys(mod);
            var subCount = 0;
            for (var i = 0; i < claves.length && i < MAX_MIEMBROS; i++) {
                var k = claves[i];
                var v;
                try { v = mod[k]; } catch (e) { continue; }
                var t = typeof v === 'function' ? 'f' : (v && typeof v === 'object' ? 'o' : 'v');
                m.push({ n: k, t: t });
                if (t === 'o' && subCount < MAX_SUBOBJETOS) {
                    try {
                        var sk = Object.keys(v);
                        if (sk.length && sk.length <= MAX_SUBCLAVES) {
                            s[k] = sk.sort();
                            subCount++;
                        }
                    } catch (e) { }
                }
            }
        } catch (e) { }
        return { m: m, s: s };
    }

    var SSC_MUESTRAS = [
        {
            tipo: 'Record', mod: 'N/record',
            metodos: ['record.create', 'record.load', 'record.copy', 'record.transform'],
            crea: function (m) { return m.create({ type: 'customer' }); }
        },
        {
            tipo: 'CurrentRecord', mod: 'N/currentRecord',
            metodos: ['currentRecord.get'],
            crea: function (m) { return m.get(); }
        },
        {
            tipo: 'Search', mod: 'N/search',
            metodos: ['search.create', 'search.load'],
            crea: function (m) { return m.create({ type: 'customer', filters: [], columns: ['internalid'] }); }
        },
        {
            tipo: 'Filter', mod: 'N/search',
            metodos: ['search.createFilter'],
            crea: function (m) { return m.createFilter({ name: 'internalid', operator: m.Operator.ANYOF, values: ['@NONE@'] }); }
        },
        {
            tipo: 'Column', mod: 'N/search',
            metodos: ['search.createColumn'],
            crea: function (m) { return m.createColumn({ name: 'internalid' }); }
        },
        {
            tipo: 'Query', mod: 'N/query',
            metodos: ['query.create'],
            crea: function (m) { return m.create({ type: 'customer' }); }
        }
    ];

    function enumeraInstancia(obj) {
        var m = [], vistos = {};
        try {
            for (var k in obj) {
                if (vistos[k]) continue;
                vistos[k] = 1;
                if (k.charAt(0) === '_') continue;
                var v;
                try { v = obj[k]; } catch (e) { continue; }
                m.push({ n: k, t: (typeof v === 'function') ? 'f' : ((v && typeof v === 'object') ? 'o' : 'v') });
                if (m.length >= MAX_MIEMBROS) break;
            }
        } catch (e) { }
        return m;
    }

    function sondearTipos(cb) {
        var tipos = {}, retornos = {};
        if (!SSC_MUESTRAS.length || typeof require !== 'function') { cb(tipos, retornos); return; }
        var i = 0;
        function siguiente() {
            if (i >= SSC_MUESTRAS.length) { cb(tipos, retornos); return; }
            var mu = SSC_MUESTRAS[i++];
            var cerrado = false;
            function fin() {
                if (cerrado) return;
                cerrado = true;
                setTimeout(siguiente, 0);
            }
            try {
                require([mu.mod], function (mod) {
                    try {
                        var miembros = enumeraInstancia(mu.crea(mod));
                        if (miembros.length) {
                            tipos[mu.tipo] = miembros;
                            mu.metodos.forEach(function (x) { retornos[x] = mu.tipo; });
                        }
                    } catch (e) {
                    }
                    fin();
                }, function () { fin(); });
                setTimeout(fin, 4000);
            } catch (e) { fin(); }
        }
        siguiente();
    }

    function argumentosDe(fn) {
        try {
            var src = Function.prototype.toString.call(fn);
            if (src.indexOf('[native code]') >= 0) return '';
            var m = src.match(/^[^(]*\(([^)]*)\)/);
            if (!m) return '';
            var a = m[1].replace(/\/\*[\s\S]*?\*\//g, '').replace(/\s+/g, ' ').trim();
            return a.length > 48 ? a.slice(0, 47) + '…' : a;
        } catch (e) { return ''; }
    }

    function sondearSs1() {
        var out = [], args = {};
        try {
            var claves = Object.keys(window);
            for (var i = 0; i < claves.length; i++) {
                var k = claves[i];
                if (!/^(nlapi|nlobj)/.test(k)) continue;
                try {
                    if (typeof window[k] === 'function') {
                        out.push(k);
                        var a = argumentosDe(window[k]);
                        if (a) args[k] = a;
                    }
                } catch (e) { }
                if (out.length >= 400) break;
            }
        } catch (e) { }
        return { nombres: out.sort(), args: args };
    }

    function sondearModulos(p) {
        var lista = Array.isArray(p.list) ? p.list : [];
        var ok = [], no = [], pendientes = lista.length;
        var members = {}, subs = {};
        var ss1 = sondearSs1();
        if (!pendientes) { responde('modules', { ok: [], no: [], members: {}, subs: {}, ss1: ss1.nombres, ss1args: ss1.args, token: p.token }); return; }
        lista.forEach(function (m) {
            var cerrado = false;
            function fin(donde, mod) {
                if (cerrado) return;
                cerrado = true;
                donde.push(m);
                if (mod) {
                    var e = enumeraMiembros(mod);
                    members[m] = e.m;
                    subs[m] = e.s;
                }
                if (--pendientes === 0) {
                    responde('modules', { ok: ok.sort(), no: no.sort(), members: members, subs: subs, ss1: ss1.nombres, ss1args: ss1.args, token: p.token });
                }
            }
            try {
                if (typeof require !== 'function') { fin(no); return; }
                require([m], function (mod) { fin(ok, mod); }, function () { fin(no); });
                setTimeout(function () { fin(no); }, 4000);
            } catch (e) { fin(no); }
        });
    }

    function lineaAnon(stack) {
        var m = String(stack || '').match(/<anonymous>:(\d+):\d+/);
        return m ? parseInt(m[1], 10) : null;
    }

    function lineaUsuario(ctx, stack) {
        if (!ctx || ctx.base == null) return null;
        var L = lineaAnon(stack);
        if (L == null) return null;
        var n = (L - ctx.base + 1) - (ctx.userStart - 1);
        return (n >= 1) ? n : null;
    }

    var MAX_PILAS = 50;

    function enmascara(src) {
        var a = src.split('');
        var n = a.length;
        function tapa(desde, hasta) {
            for (var k = desde; k < hasta && k < n; k++) if (a[k] !== '\n') a[k] = ' ';
        }
        var i = 0;
        while (i < n) {
            var c = src[i], d = src[i + 1];
            if (c === '/' && d === '/') {
                var j = src.indexOf('\n', i); if (j < 0) j = n;
                tapa(i, j); i = j; continue;
            }
            if (c === '/' && d === '*') {
                var j2 = src.indexOf('*/', i + 2); j2 = (j2 < 0) ? n : j2 + 2;
                tapa(i, j2); i = j2; continue;
            }
            if (c === '"' || c === "'" || c === '`') {
                var k2 = i + 1;
                while (k2 < n) {
                    if (src[k2] === '\\') { k2 += 2; continue; }
                    if (src[k2] === c) { k2++; break; }
                    k2++;
                }
                tapa(i, k2); i = k2; continue;
            }
            i++;
        }
        return a.join('');
    }

    var NO_EXPRESION = /^(return|var|let|const|function|class|if|for|while|do|switch|try|catch|finally|throw|break|continue|else|case|default|import|export|debugger|yield)\b/;

    function ultimaExpresion(codigo) {
        var m = enmascara(codigo);
        var fin = m.length;
        while (fin > 0 && /\s/.test(m[fin - 1])) fin--;
        if (fin > 0 && m[fin - 1] === ';') fin--;
        while (fin > 0 && /\s/.test(m[fin - 1])) fin--;
        if (fin === 0) return null;

        var prof = 0, ini = 0;
        for (var i = fin - 1; i >= 0; i--) {
            var c = m[i];
            if (c === ')' || c === ']' || c === '}') prof++;
            else if (c === '(' || c === '[' || c === '{') {
                prof--;
                if (prof < 0) return null;
            } else if (prof === 0 && (c === ';' || c === '\n')) { ini = i + 1; break; }
        }

        var cola = codigo.slice(ini, fin);
        var limpia = cola.replace(/^\s+/, '');
        if (!limpia) return null;
        if (limpia.charAt(0) === '{' || limpia.charAt(0) === '}') return null;
        if (NO_EXPRESION.test(limpia)) return null;
        if (/^async\s+function\b/.test(limpia)) return null;

        return { head: codigo.slice(0, ini), tail: cola, resto: codigo.slice(fin) };
    }

    function revisar(p) {
        var codigo = String(p.code || '');
        var token = p.token;
        if (!codigo.trim()) { responde('checked', { token: token, ok: true }); return; }
        try {
            new Function('return (async function(){\nreturn (\n' + codigo.replace(/[;\s]+$/, '') + '\n);\n});');
            responde('checked', { token: token, ok: true });
            return;
        } catch (eExpr) { }
        try {
            new Function('return (async function(){\n' + codigo + '\n});');
            responde('checked', { token: token, ok: true });
        } catch (e) {
            responde('checked', {
                token: token, ok: false,
                message: (e && e.message) || String(e)
            });
        }
    }

    function ejecutar(p) {
        var codigo = String(p.code || '');
        var token = p.token;
        var previos = Array.isArray(p.preload) ? p.preload : [];

        if (!codigo.trim()) {
            responde('result', { token: token, logs: [], value: undefined, error: null, ms: 0 });
            return;
        }

        cargaPrevios(previos, function (mods, fallidos) {
            var logs = [];
            var ctx = { base: null, userStart: 4, pilas: 0 };
            function marca(err) {
                try { ctx.base = lineaAnon(err && err.stack); } catch (e) { }
            }
            var restaurar = capturaConsola(logs, ctx);
            var t0 = Date.now();

            var nombres = Object.keys(mods);
            var valores = nombres.map(function (n) { return mods[n]; });

            var codigoExpr = codigo.replace(/[;\s]+$/, '');

            var fn = null;
            try {
                fn = new Function(nombres.concat(['__nsft_marca__']),
                    '__nsft_marca__(new Error());\nreturn (async function(){\nreturn (\n' + codigoExpr + '\n);\n}).call(this);');
            } catch (eExpr) {
                ctx.userStart = 3;
                var corte = ultimaExpresion(codigo);
                if (corte) {
                    try {
                        fn = new Function(nombres.concat(['__nsft_marca__']),
                            '__nsft_marca__(new Error());\nreturn (async function(){\n'
                            + corte.head + 'return (' + corte.tail + ')' + corte.resto
                            + '\n}).call(this);');
                    } catch (eUlt) { fn = null; }
                }
                try {
                    if (!fn) {
                        fn = new Function(nombres.concat(['__nsft_marca__']),
                            '__nsft_marca__(new Error());\nreturn (async function(){\n' + codigo + '\n}).call(this);');
                    }
                } catch (e) {
                    restaurar();
                    responde('result', {
                        token: token, logs: logs, value: undefined,
                        error: describeError(e, 'sintaxis', ctx), ms: 0, missing: fallidos
                    });
                    return;
                }
            }

            var p2;
            try {
                p2 = fn.apply(window, valores.concat([marca]));
            } catch (e) {
                restaurar();
                responde('result', {
                    token: token, logs: logs, value: undefined,
                    error: describeError(e, 'ejecucion', ctx), ms: Date.now() - t0, missing: fallidos
                });
                return;
            }

            Promise.resolve(p2).then(function (v) {
                restaurar();
                responde('result', {
                    token: token, logs: logs, value: serializa(v, 0),
                    error: null, ms: Date.now() - t0, missing: fallidos
                });
            }, function (e) {
                restaurar();
                responde('result', {
                    token: token, logs: logs, value: undefined,
                    error: describeError(e, 'ejecucion', ctx), ms: Date.now() - t0, missing: fallidos
                });
            });
        });
    }

    function cargaPrevios(lista, cb) {
        var mods = {}, fallidos = [];
        if (!lista.length || typeof require !== 'function') { cb(mods, fallidos); return; }
        var pendientes = lista.length;
        function fin() { if (--pendientes === 0) cb(mods, fallidos); }
        lista.forEach(function (item) {
            var alias = item.alias, ruta = item.path;
            var cerrado = false;
            function una(f) { if (cerrado) return; cerrado = true; f(); fin(); }
            try {
                require([ruta],
                    function (m) { una(function () { mods[alias] = m; }); },
                    function () { una(function () { fallidos.push(ruta); }); });
                setTimeout(function () { una(function () { fallidos.push(ruta); }); }, 4000);
            } catch (e) { una(function () { fallidos.push(ruta); }); }
        });
    }

    function capturaConsola(logs, ctx) {
        var metodos = ['log', 'info', 'warn', 'error', 'debug'];
        var previos = {};
        metodos.forEach(function (m) {
            previos[m] = console[m];
            console[m] = function () {
                try {
                    var args = Array.prototype.slice.call(arguments);
                    if (logs.length < 400) {
                        var fila = { level: m, parts: args.map(function (a) { return serializa(a, 0); }), t: Date.now() };
                        if (ctx && ctx.pilas < MAX_PILAS) {
                            ctx.pilas++;
                            fila.line = lineaUsuario(ctx, new Error().stack);
                        }
                        logs.push(fila);
                    }
                } catch (e) { }
                if (m === 'warn' || m === 'error') return;
                try { previos[m].apply(console, arguments); } catch (e) { }
            };
        });
        return function () { metodos.forEach(function (m) { console[m] = previos[m]; }); };
    }

    function pilaTexto(e) {
        var s = e && e.stack;
        if (!s) return '';
        if (Array.isArray(s)) s = s.join('\n');
        return String(s).slice(0, 4000);
    }

    function describeError(e, fase, ctx) {
        return {
            fase: fase,
            name: (e && (e.name || e.type)) || 'Error',
            message: (e && (e.message || e.details || String(e))) || String(e),
            stack: pilaTexto(e),
            line: (e && e.stack) ? lineaUsuario(ctx, e.stack) : null
        };
    }

    function serializa(v, prof) {
        try {
            if (v === null) return { t: 'null' };
            if (v === undefined) return { t: 'undefined' };
            var tipo = typeof v;
            if (tipo === 'string') return { t: 'string', v: recorta(v) };
            if (tipo === 'number' || tipo === 'boolean') return { t: tipo, v: String(v) };
            if (tipo === 'bigint') return { t: 'number', v: String(v) };
            if (tipo === 'function') return { t: 'function', v: (v.name || 'anonima') + '()' };
            if (tipo === 'symbol') return { t: 'string', v: String(v) };
            if (v instanceof Date) return { t: 'date', v: v.toISOString() };
            if (v instanceof Error) return { t: 'error', v: (v.name || 'Error') + ': ' + (v.message || '') };

            if (prof >= MAX_PROF) return { t: 'corte', v: '…' };

            if (Array.isArray(v)) {
                var n = Math.min(v.length, MAX_FILAS);
                var arr = [];
                for (var i = 0; i < n; i++) arr.push(serializa(v[i], prof + 1));
                return { t: 'array', len: v.length, v: arr, cortado: v.length > n };
            }

            if (typeof v.toJSON === 'function') {
                try { return serializa(v.toJSON(), prof + 1); } catch (e) { }
            }

            var claves = [];
            try { claves = Object.keys(v); } catch (e) { claves = []; }
            var obj = {};
            var m = Math.min(claves.length, 120);
            for (var k = 0; k < m; k++) {
                var c = claves[k];
                try { obj[c] = serializa(v[c], prof + 1); }
                catch (e) { obj[c] = { t: 'error', v: 'no se pudo leer' }; }
            }
            return {
                t: 'object',
                ctor: (v.constructor && v.constructor.name) || 'Object',
                v: obj,
                cortado: claves.length > m
            };
        } catch (e) {
            return { t: 'error', v: 'no serializable' };
        }
    }

    function recorta(s) {
        s = String(s);
        return s.length > MAX_CADENA ? s.slice(0, MAX_CADENA) + '\n…' : s;
    }

    function responde(type, payload) {
        try {
            window.postMessage({ dest: EXTENSION_DEST, type: type, payload: payload }, '*');
        } catch (e) {
            window.postMessage({
                dest: EXTENSION_DEST, type: type,
                payload: { token: payload && payload.token, logs: [], value: undefined, ms: 0,
                    error: { fase: 'resultado', name: 'TooLarge', message: 'El resultado no cabe.', stack: '' } }
            }, '*');
        }
    }
})();
