(function () {
    'use strict';

    if (window.NSFT_CodeEditor) return;

    const FETCHER_DEST = 'fetcher_ssc';
    const EXTENSION_DEST = 'extension_ssc';

    const CANDIDATOS = [
        { alias: 'record', path: 'N/record' }, { alias: 'search', path: 'N/search' },
        { alias: 'query', path: 'N/query' }, { alias: 'runtime', path: 'N/runtime' },
        { alias: 'currentRecord', path: 'N/currentRecord' }, { alias: 'url', path: 'N/url' },
        { alias: 'format', path: 'N/format' }, { alias: 'log', path: 'N/log' },
        { alias: 'error', path: 'N/error' }, { alias: 'https', path: 'N/https' },
        { alias: 'http', path: 'N/http' }, { alias: 'util', path: 'N/util' },
        { alias: 'xml', path: 'N/xml' }, { alias: 'action', path: 'N/action' },
        { alias: 'dataset', path: 'N/dataset' }, { alias: 'workbook', path: 'N/workbook' },
        { alias: 'transaction', path: 'N/transaction' }, { alias: 'email', path: 'N/email' },
        { alias: 'translation', path: 'N/translation' }, { alias: 'recordContext', path: 'N/recordContext' },
        { alias: 'dialog', path: 'N/ui/dialog' }, { alias: 'message', path: 'N/ui/message' }
    ];

    function i18n(k, f, subs) {
        let out = '';
        try { out = chrome.i18n.getMessage(k, subs) || ''; } catch (e) { out = ''; }
        if (!out) {
            out = f;
            (subs || []).forEach((v, i) => { out = out.split('$' + (i + 1)).join(String(v)); });
        }
        return out;
    }

    function tsFold(s) {
        const TS = window.NSFT_TextSearch;
        return TS ? TS.fold(s) : String(s == null ? '' : s).toLowerCase();
    }

    let _bridge = false;
    let _bridgeListo = false;
    const _bridgeCola = [];

    function ensureBridge() {
        if (_bridge) return;
        _bridge = true;
        try {
            const s = document.createElement('script');
            s.id = 'nsft-ssc-fetcher';
            s.async = false;
            s.src = chrome.runtime.getURL('scripts/modules/suitescript_console/suitescript_console_fetcher.js');
            s.onload = function () {
                this.remove();
                _bridgeListo = true;
                while (_bridgeCola.length) window.postMessage(_bridgeCola.shift(), '*');
            };
            s.onerror = function () { this.remove(); };
            (document.head || document.documentElement).appendChild(s);
        } catch (e) { }
    }

    function post(msg) {
        ensureBridge();
        if (_bridgeListo) window.postMessage(msg, '*');
        else _bridgeCola.push(msg);
    }

    let _members = Object.create(null);
    let _subMembers = Object.create(null);
    let _tipos = Object.create(null);
    let _retornos = Object.create(null);
    let _nlapi = [];
    let _nlapiArgs = Object.create(null);


    const JS_CON_ESTATICOS = ['console', 'JSON', 'Math', 'Object', 'Array', 'Number',
        'String', 'Promise', 'Date', 'Symbol', 'Intl', 'Reflect', 'localStorage',
        'sessionStorage'];

    const JS_CON_INSTANCIA = ['String', 'Array', 'Date', 'Number', 'Map', 'Set',
        'Promise', 'RegExp', 'Error'];

    const JS_METODOS = {
        'Date.toISOString': 'js:String', 'Date.toJSON': 'js:String', 'Date.toString': 'js:String',
        'Date.toDateString': 'js:String', 'Date.toTimeString': 'js:String', 'Date.toUTCString': 'js:String',
        'Date.toLocaleDateString': 'js:String', 'Date.toLocaleTimeString': 'js:String',
        'Date.toLocaleString': 'js:String',

        'String.slice': 'js:String', 'String.substring': 'js:String', 'String.substr': 'js:String',
        'String.trim': 'js:String', 'String.trimStart': 'js:String', 'String.trimEnd': 'js:String',
        'String.toUpperCase': 'js:String', 'String.toLowerCase': 'js:String',
        'String.replace': 'js:String', 'String.replaceAll': 'js:String', 'String.concat': 'js:String',
        'String.padStart': 'js:String', 'String.padEnd': 'js:String', 'String.repeat': 'js:String',
        'String.charAt': 'js:String', 'String.normalize': 'js:String', 'String.at': 'js:String',
        'String.split': 'js:Array', 'String.match': 'js:Array',
        'String.indexOf': 'js:Number', 'String.lastIndexOf': 'js:Number', 'String.search': 'js:Number',
        'String.charCodeAt': 'js:Number', 'String.localeCompare': 'js:Number',
        'String.includes': 'js:Boolean', 'String.startsWith': 'js:Boolean', 'String.endsWith': 'js:Boolean',

        'Array.map': 'js:Array', 'Array.filter': 'js:Array', 'Array.slice': 'js:Array',
        'Array.concat': 'js:Array', 'Array.splice': 'js:Array', 'Array.sort': 'js:Array',
        'Array.reverse': 'js:Array', 'Array.flat': 'js:Array', 'Array.flatMap': 'js:Array',
        'Array.fill': 'js:Array',
        'Array.join': 'js:String', 'Array.toString': 'js:String',
        'Array.indexOf': 'js:Number', 'Array.lastIndexOf': 'js:Number', 'Array.push': 'js:Number',
        'Array.findIndex': 'js:Number',
        'Array.includes': 'js:Boolean', 'Array.some': 'js:Boolean', 'Array.every': 'js:Boolean',

        'Number.toFixed': 'js:String', 'Number.toString': 'js:String', 'Number.toPrecision': 'js:String',
        'Number.valueOf': 'js:Number',

        'Map.get': null, 'Map.has': 'js:Boolean', 'Map.set': 'js:Map',
        'Set.has': 'js:Boolean', 'Set.add': 'js:Set',

        'RegExp.test': 'js:Boolean', 'RegExp.exec': 'js:Array',
        'Promise.then': 'js:Promise', 'Promise.catch': 'js:Promise', 'Promise.finally': 'js:Promise'
    };

    const JS_FIRMAS = {
        'JSON.stringify': { p: [{ n: 'value', t: 'any' }, { n: 'replacer', t: 'Function|Array', o: 1 }, { n: 'space', t: 'string|number', o: 1 }], r: 'js:String' },
        'JSON.parse': { p: [{ n: 'text', t: 'string' }, { n: 'reviver', t: 'Function', o: 1 }], r: 'js:Object' },
        'Object.keys': { p: [{ n: 'obj', t: 'Object' }], r: 'js:Array' },
        'Object.values': { p: [{ n: 'obj', t: 'Object' }], r: 'js:Array' },
        'Object.entries': { p: [{ n: 'obj', t: 'Object' }], r: 'js:Array' },
        'Object.assign': { p: [{ n: 'target', t: 'Object' }, { n: 'source', t: 'Object' }], r: 'js:Object' },
        'Array.isArray': { p: [{ n: 'value', t: 'any' }], r: 'js:Boolean' },
        'Array.from': { p: [{ n: 'iterable', t: 'Object' }, { n: 'mapFn', t: 'Function', o: 1 }], r: 'js:Array' },

        'String.split': { p: [{ n: 'separator', t: 'string|RegExp' }, { n: 'limit', t: 'number', o: 1 }], r: 'js:Array' },
        'String.replace': { p: [{ n: 'pattern', t: 'string|RegExp' }, { n: 'replacement', t: 'string|Function' }], r: 'js:String' },
        'String.replaceAll': { p: [{ n: 'pattern', t: 'string|RegExp' }, { n: 'replacement', t: 'string|Function' }], r: 'js:String' },
        'String.slice': { p: [{ n: 'start', t: 'number' }, { n: 'end', t: 'number', o: 1 }], r: 'js:String' },
        'String.substring': { p: [{ n: 'start', t: 'number' }, { n: 'end', t: 'number', o: 1 }], r: 'js:String' },
        'String.indexOf': { p: [{ n: 'searchString', t: 'string' }, { n: 'position', t: 'number', o: 1 }], r: 'js:Number' },
        'String.includes': { p: [{ n: 'searchString', t: 'string' }], r: 'js:Boolean' },
        'String.padStart': { p: [{ n: 'targetLength', t: 'number' }, { n: 'padString', t: 'string', o: 1 }], r: 'js:String' },
        'String.padEnd': { p: [{ n: 'targetLength', t: 'number' }, { n: 'padString', t: 'string', o: 1 }], r: 'js:String' },

        'Array.map': { p: [{ n: 'callback', t: 'Function' }], r: 'js:Array' },
        'Array.filter': { p: [{ n: 'callback', t: 'Function' }], r: 'js:Array' },
        'Array.forEach': { p: [{ n: 'callback', t: 'Function' }] },
        'Array.find': { p: [{ n: 'callback', t: 'Function' }] },
        'Array.findIndex': { p: [{ n: 'callback', t: 'Function' }], r: 'js:Number' },
        'Array.some': { p: [{ n: 'callback', t: 'Function' }], r: 'js:Boolean' },
        'Array.every': { p: [{ n: 'callback', t: 'Function' }], r: 'js:Boolean' },
        'Array.reduce': { p: [{ n: 'callback', t: 'Function' }, { n: 'initialValue', t: 'any', o: 1 }] },
        'Array.join': { p: [{ n: 'separator', t: 'string', o: 1 }], r: 'js:String' },
        'Array.push': { p: [{ n: 'element', t: 'any' }], r: 'js:Number' },
        'Array.slice': { p: [{ n: 'start', t: 'number', o: 1 }, { n: 'end', t: 'number', o: 1 }], r: 'js:Array' },
        'Array.includes': { p: [{ n: 'value', t: 'any' }], r: 'js:Boolean' },
        'Array.concat': { p: [{ n: 'items', t: 'Array|any' }], r: 'js:Array' },

        'Number.toFixed': { p: [{ n: 'digits', t: 'number', o: 1 }], r: 'js:String' },
        'Map.get': { p: [{ n: 'key', t: 'any' }] },
        'Map.set': { p: [{ n: 'key', t: 'any' }, { n: 'value', t: 'any' }], r: 'js:Map' },
        'Map.has': { p: [{ n: 'key', t: 'any' }], r: 'js:Boolean' },
        'Set.add': { p: [{ n: 'value', t: 'any' }], r: 'js:Set' },
        'Set.has': { p: [{ n: 'value', t: 'any' }], r: 'js:Boolean' },
        'RegExp.test': { p: [{ n: 'string', t: 'string' }], r: 'js:Boolean' }
    };

    function tipoJsDelRetorno(t) {
        if (!t || typeof t !== 'string' || t.indexOf('js:') === 0) return t;
        const limpio = t.trim();
        if (limpio.indexOf('|') >= 0) return t;
        if (/^[A-Za-z]+\s*\[\s*\]$/.test(limpio)) return 'js:Array';
        const nombre = limpio.charAt(0).toUpperCase() + limpio.slice(1).toLowerCase();
        if (nombre === 'Integer' || nombre === 'Float') return 'js:Number';
        if (JS_CON_INSTANCIA.indexOf(nombre) >= 0) return 'js:' + nombre;
        return t;
    }

    function retornoNativo(tipo, metodo) {
        if (!tipo || tipo.indexOf('js:') !== 0) return null;
        const t = tipo.slice(3);
        const fijo = JS_METODOS[t + '.' + metodo];
        if (fijo) return fijo;
        if (t === 'Date' && /^get/.test(metodo)) return 'js:Number';
        if (t === 'Array' && metodo === 'length') return 'js:Number';
        return null;
    }

    const JS_FOSILES = ['anchor', 'big', 'blink', 'bold', 'fixed', 'fontcolor',
        'fontsize', 'italics', 'link', 'small', 'strike', 'sub', 'sup'];

    function enumera(obj) {
        const out = [];
        if (!obj) return out;
        const esFuncion = (typeof obj === 'function');
        let nombres = [];
        try { nombres = Object.getOwnPropertyNames(obj); } catch (e) { return out; }
        for (let i = 0; i < nombres.length; i++) {
            const n = nombres[i];
            if (n === 'constructor' || n === 'prototype' || n === 'caller' || n === 'arguments') continue;
            if (esFuncion && (n === 'length' || n === 'name')) continue;
            if (JS_FOSILES.indexOf(n) >= 0) continue;
            if (n.charAt(0) === '_') continue;
            let t = 'p';
            try {
                const d = Object.getOwnPropertyDescriptor(obj, n);
                if (d && !d.get && typeof d.value === 'function') t = 'f';
            } catch (e) { }
            out.push({ n: n, t: t });
        }
        return out.sort((a, b) => a.n.localeCompare(b.n));
    }

    const _jsCache = Object.create(null);

    function jsEstaticosDe(nombre) {
        if (JS_CON_ESTATICOS.indexOf(nombre) < 0) return null;
        const k = 'e:' + nombre;
        if (!_jsCache[k]) {
            let obj = null;
            try { obj = window[nombre]; } catch (e) { obj = null; }
            _jsCache[k] = enumera(obj);
        }
        return _jsCache[k].length ? _jsCache[k] : null;
    }

    function jsMiembrosDe(nombre) {
        if (JS_CON_INSTANCIA.indexOf(nombre) < 0) return null;
        const k = 'i:' + nombre;
        if (!_jsCache[k]) {
            let proto = null;
            try { proto = window[nombre] && window[nombre].prototype; } catch (e) { proto = null; }
            const lista = enumera(proto);
            if (nombre === 'String' || nombre === 'Array') lista.unshift({ n: 'length', t: 'p' });
            _jsCache[k] = lista;
        }
        return _jsCache[k].length ? _jsCache[k] : null;
    }

    const JS_GLOBALES = [
        { text: 'console', kind: 'mod' }, { text: 'JSON', kind: 'mod' },
        { text: 'Math', kind: 'mod' }, { text: 'Object', kind: 'mod' },
        { text: 'Array', kind: 'mod' }, { text: 'String', kind: 'mod' },
        { text: 'Number', kind: 'mod' }, { text: 'Boolean', kind: 'mod' },
        { text: 'Date', kind: 'mod' }, { text: 'RegExp', kind: 'mod' },
        { text: 'Promise', kind: 'mod' }, { text: 'Map', kind: 'mod' },
        { text: 'Set', kind: 'mod' }, { text: 'WeakMap', kind: 'mod' },
        { text: 'Error', kind: 'mod' }, { text: 'TypeError', kind: 'mod' },
        { text: 'Symbol', kind: 'mod' }, { text: 'BigInt', kind: 'mod' },
        { text: 'Intl', kind: 'mod' }, { text: 'Reflect', kind: 'mod' },
        { text: 'parseInt', kind: 'fn' }, { text: 'parseFloat', kind: 'fn' },
        { text: 'isNaN', kind: 'fn' }, { text: 'isFinite', kind: 'fn' },
        { text: 'encodeURIComponent', kind: 'fn' }, { text: 'decodeURIComponent', kind: 'fn' },
        { text: 'encodeURI', kind: 'fn' }, { text: 'decodeURI', kind: 'fn' },
        { text: 'setTimeout', kind: 'fn' }, { text: 'clearTimeout', kind: 'fn' },
        { text: 'structuredClone', kind: 'fn' }, { text: 'fetch', kind: 'fn' },
        { text: 'localStorage', kind: 'mod' }, { text: 'sessionStorage', kind: 'mod' }
    ].map((g) => ({ text: g.text, kind: g.kind, tag: 'js' }));

    const JS_PALABRAS = [
        'const', 'let', 'var', 'function', 'return', 'await', 'async',
        'if', 'else', 'for', 'while', 'switch', 'case', 'break', 'continue',
        'try', 'catch', 'finally', 'throw', 'new', 'typeof', 'instanceof',
        'class', 'extends', 'this', 'null', 'undefined', 'true', 'false'
    ].map((k) => ({ text: k, kind: 'const', tag: 'js' }));

    const JS_RETORNOS = {
        'JSON.stringify': 'js:String', 'Object.keys': 'js:Array', 'Object.values': 'js:Array',
        'Object.entries': 'js:Array', 'Array.from': 'js:Array', 'Array.of': 'js:Array',
        'Promise.all': 'js:Promise', 'Promise.allSettled': 'js:Promise',
        'Promise.resolve': 'js:Promise', 'Promise.race': 'js:Promise',
        'String.fromCharCode': 'js:String', 'Date.now': 'js:Number'
    };
    let _disponibles = null;
    let _modsOk = [];
    let _modsNo = [];
    let _token = 0;

    const _dataCbs = [];
    function onData(cb) { if (typeof cb === 'function') _dataCbs.push(cb); }
    function emitData() {
        _dataCbs.forEach((cb) => { try { cb(estado()); } catch (e) { } });
    }

    function estado() {
        return {
            ok: _modsOk.slice(), no: _modsNo.slice(),
            members: _members, subs: _subMembers,
            tipos: _tipos, retornos: _retornos,
            nlapi: _nlapi.slice(), disponibles: _disponibles
        };
    }

    const TIPOS_KEY = 'nsftSscTipos';
    const TIPOS_TTL = 30 * 24 * 3600 * 1000;

    function tiposVersion() {
        try { return chrome.runtime.getManifest().version || '0'; } catch (e) { return '0'; }
    }

    function tiposDesdeCache(cb) {
        try {
            chrome.storage.local.get([TIPOS_KEY], (it) => {
                const c = it && it[TIPOS_KEY];
                const vale = !!(c && c.ver === tiposVersion()
                    && (Date.now() - (c.t || 0)) < TIPOS_TTL
                    && c.tipos && Object.keys(c.tipos).length);
                if (vale) {
                    _tipos = c.tipos;
                    _retornos = c.retornos || Object.create(null);
                    emitData();
                }
                cb(vale);
            });
        } catch (e) { cb(false); }
    }

    const MODS_KEY = 'nsftSscModulos';
    const MODS_TTL = 30 * 24 * 3600 * 1000;

    function modsDesdeCache(cb) {
        try {
            chrome.storage.local.get([MODS_KEY], (it) => {
                const c = it && it[MODS_KEY];
                const vale = !!(c && c.ver === tiposVersion()
                    && (Date.now() - (c.t || 0)) < MODS_TTL
                    && Array.isArray(c.ok) && c.ok.length);
                if (vale) {
                    _modsOk = c.ok;
                    _modsNo = c.no || [];
                    _disponibles = c.ok;
                    _members = c.members || Object.create(null);
                    _subMembers = c.subs || Object.create(null);
                    emitData();
                }
                cb(vale);
            });
        } catch (e) { cb(false); }
    }

    function guardaMods() {
        try {
            chrome.storage.local.set({
                [MODS_KEY]: {
                    ver: tiposVersion(), t: Date.now(),
                    ok: _modsOk, no: _modsNo, members: _members, subs: _subMembers
                }
            });
        } catch (e) { }
    }

    function guardaTipos() {
        try {
            chrome.storage.local.set({
                [TIPOS_KEY]: { ver: tiposVersion(), t: Date.now(), tipos: _tipos, retornos: _retornos }
            });
        } catch (e) { }
    }

    function sondearModulos() {
        post({ dest: FETCHER_DEST, type: 'modules', payload: { list: CANDIDATOS.map((c) => c.path), token: ++_token } });
    }

    let _modsSoloSs1 = false;

    function sondearSoloSs1() {
        _modsSoloSs1 = true;
        post({ dest: FETCHER_DEST, type: 'modules', payload: { list: [], token: ++_token } });
    }

    function sondearTipos() {
        post({ dest: FETCHER_DEST, type: 'types', payload: { token: ++_token } });
    }

    let _tiposEsperando = null;
    let _modsEsperando = null;
    let _preparado = false;
    let _catalogoListo = false;
    let _enCola = [];

    function avisaListos() {
        _catalogoListo = true;
        const cbs = _enCola;
        _enCola = [];
        cbs.forEach((f) => { try { f(estado()); } catch (e) { } });
    }

    function prepare(cb) {
        if (typeof cb === 'function') {
            if (_catalogoListo) cb(estado());
            else _enCola.push(cb);
        }
        if (_preparado) return;
        _preparado = true;
        ensureBridge();

        let faltan = 2;
        const menos = () => { if (--faltan <= 0) avisaListos(); };

        _modsEsperando = menos;
        modsDesdeCache((hayCache) => {
            if (hayCache) sondearSoloSs1();
            else sondearModulos();
        });
        setTimeout(() => { if (_modsEsperando) { _modsEsperando = null; menos(); } }, 8000);

        tiposDesdeCache((hayCache) => {
            if (hayCache) { menos(); return; }
            _tiposEsperando = menos;
            sondearTipos();
            setTimeout(() => { if (_tiposEsperando) { _tiposEsperando = null; menos(); } }, 8000);
        });
    }

    window.addEventListener('message', function (e) {
        if (e.source !== window) return;
        const d = e.data;
        if (!d || typeof d !== 'object' || d.dest !== EXTENSION_DEST) return;
        const p = d.payload || {};

        if (d.type === 'modules') {
            if (_modsSoloSs1) {
                _modsSoloSs1 = false;
                _nlapi = p.ss1 || [];
            _nlapiArgs = p.ss1args || Object.create(null);
                emitData();
                if (_modsEsperando) { const f = _modsEsperando; _modsEsperando = null; f(); }
                return;
            }

            _disponibles = p.ok || [];
            _members = Object.create(null);
            _subMembers = Object.create(null);
            CANDIDATOS.forEach((c) => {
                if (p.members && p.members[c.path]) _members[c.alias] = p.members[c.path];
                if (p.subs && p.subs[c.path]) _subMembers[c.alias] = p.subs[c.path];
            });
            _modsOk = p.ok || [];
            _modsNo = p.no || [];
            _nlapi = p.ss1 || [];
            _nlapiArgs = p.ss1args || Object.create(null);
            guardaMods();
            emitData();
            if (_modsEsperando) { const f = _modsEsperando; _modsEsperando = null; f(); }
            return;
        }

        if (d.type === 'types') {
            _tipos = p.tipos || Object.create(null);
            _retornos = p.retornos || Object.create(null);
            guardaTipos();
            emitData();
            if (_tiposEsperando) { const f = _tiposEsperando; _tiposEsperando = null; f(); }
            return;
        }

        if (d.type === 'checked') {
            const dueño = _lintPend[p.token];
            if (!dueño) return;
            delete _lintPend[p.token];
            dueño(p);
            return;
        }
    });


    let _hintsTagObserver = null;

    function tagHintsPopup() {
        document.querySelectorAll('.CodeMirror-hints:not(.nsft-ssc-hints)')
            .forEach(el => el.classList.add('nsft-ssc-hints'));
    }

    function watchHintsPopup() {
        tagHintsPopup();
        if (_hintsTagObserver || typeof MutationObserver === 'undefined') return;
        _hintsTagObserver = new MutationObserver(tagHintsPopup);
        _hintsTagObserver.observe(document.body, { childList: true });
    }

    function hintRank(id, needleLc) {
        if (!needleLc) return 0;
        const idx = tsFold(id).indexOf(tsFold(needleLc));
        return idx < 0 ? -1 : (idx === 0 ? 0 : 1);
    }

    function appendHighlighted(parent, text, needleLc) {
        const str = String(text == null ? '' : text);
        if (!needleLc || !str) { parent.appendChild(document.createTextNode(str)); return; }

        const TS = window.NSFT_TextSearch;
        let tramos;
        if (TS) {
            tramos = TS.ranges(str, needleLc);
        } else {
            const i = str.toLowerCase().indexOf(String(needleLc).toLowerCase());
            tramos = i < 0 ? [] : [{ start: i, end: i + needleLc.length }];
        }
        if (!tramos.length) { parent.appendChild(document.createTextNode(str)); return; }

        let desde = 0;
        tramos.forEach((r) => {
            if (r.start > desde) parent.appendChild(document.createTextNode(str.slice(desde, r.start)));
            const mark = document.createElement('span');
            mark.className = 'nsft-ssc-hint-mark';
            mark.textContent = str.slice(r.start, r.end);
            parent.appendChild(mark);
            desde = r.end;
        });
        if (desde < str.length) parent.appendChild(document.createTextNode(str.slice(desde)));
    }

    const API_RUTAS = ['assets/api/ss2.json', 'assets/api/ss1.json'];
    let _api2 = null;
    let _api1 = null;
    let _apiPedido = false;

    const ALIAS_A_RUTA = Object.create(null);
    CANDIDATOS.forEach((c) => { ALIAS_A_RUTA[c.alias] = c.path; });

    let _repintePedido = false;

    function repintaResaltado() {
        if (_repintePedido) return;
        _repintePedido = true;
        const raf = window.requestAnimationFrame || ((cb) => setTimeout(cb, 16));
        raf(() => {
            _repintePedido = false;
            _editores.forEach((x) => {
                try { x.cm.setOption('mode', x.cm.getOption('mode')); } catch (e) { }
            });
        });
    }

    function olvidaDeducciones() {
        _editores.forEach((x) => {
            try {
                x.cm._nsftLocales = null;
                x.cm._nsftAlias = null;
                x.cm._nsftDocFirmas = null;
                x.cm._nsftInlayVp = null;
                programaInlay(x.cm);
            } catch (e) { }
        });
    }

    function cargaCatalogoApis() {
        if (_apiPedido) return;
        _apiPedido = true;
        const raf = window.requestAnimationFrame || ((cb) => setTimeout(cb, 16));
        raf(() => setTimeout(() => {
            API_RUTAS.forEach((rel, i) => {
                try {
                    fetch(chrome.runtime.getURL(rel))
                        .then((r) => (r.ok ? r.json() : null))
                        .then((d) => {
                            if (!d) return;
                            if (i === 0) _api2 = d; else _api1 = d;
                            olvidaDeducciones();
                            emitData();
                        })
                        .catch(() => { });
                } catch (e) { }
            });
        }, 0));
    }

    const RE_DECL = /(?:\/\*\*((?:(?!\*\/)[\s\S])*)\*\/)?[ \t\r\n]*\bfunction\s+([A-Za-z_$][\w$]*)\s*\(([^)]*)\)/g;
    const RE_FLECHA = /(?:\/\*\*((?:(?!\*\/)[\s\S])*)\*\/)?[ \t\r\n]*\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s+)?\(?([^)=;]*?)\)?\s*=>/g;

    const TIPO_VAGO = /^(?:Object|object|any|\*|void|undefined)$/;

    function nombreDevuelto(lineas, desde) {
        const tope = Math.min(lineas.length, desde + 80);
        for (let i = desde; i < tope; i++) {
            const m = lineas[i].match(/^\s*return\s+([A-Za-z_$][\w$]*)\s*;?\s*$/);
            if (m) return m[1];
        }
        return null;
    }

    function firmasDelDocumento(cm) {
        let gen = -1;
        try { gen = cm.changeGeneration(); } catch (e) { gen = -1; }
        const hit = cacheLee(cm, '_nsftDocFirmas', gen);
        if (hit) return hit;

        const out = Object.create(null);
        try {
            const doc = cm.getValue();

            const lineas = doc.split(/\r?\n/);
            const saltos = [];
            for (let i = doc.indexOf('\n'); i >= 0; i = doc.indexOf('\n', i + 1)) saltos.push(i);
            const lineaDe = (idx) => {
                let a = 0, b = saltos.length;
                while (a < b) {
                    const m = (a + b) >> 1;
                    if (saltos[m] < idx) a = m + 1; else b = m;
                }
                return a;
            };

            [RE_DECL, RE_FLECHA].forEach((re) => {
                re.lastIndex = 0;
                let m;
                while ((m = re.exec(doc))) {
                    const jsdoc = m[1] || '';
                    const nombre = m[2];
                    const args = (m[3] || '').split(',')
                        .map((x) => x.trim().replace(/^\.\.\./, '').split('=')[0].trim())
                        .filter((x) => /^[A-Za-z_$][\w$]*$/.test(x));
                    if (!nombre || out[nombre]) continue;

                    const tipos = Object.create(null);
                    let d = null;
                    const reP = /@param[ \t]+\{([^}]*)\}[ \t]+(\[?[\w$.]+\]?)/g;
                    let q;
                    while ((q = reP.exec(jsdoc))) {
                        tipos[q[2].replace(/^\[|\]$/g, '').split('=')[0]] = q[1].trim();
                    }
                    const r = jsdoc.match(/@returns?[ \t]+\{((?:[^{}]|\{[^{}]*\})*)\}/);
                    const desc = descripcionJsdoc(jsdoc);
                    if (desc) d = desc;

                    if (!args.length && !r && !d) continue;
                    const e = {};
                    if (d) e.d = d;
                    if (args.length) e.p = args.map((n) => ({ n: n, t: tipoLimpio(tipos[n]) || 'any' }));
                    if (r) e.r = tipoLimpio(r[1]);
                    if (!e.r || TIPO_VAGO.test(e.r)) {
                        const dev = nombreDevuelto(lineas, lineaDe(m.index + m[0].lastIndexOf(nombre)) + 1);
                        if (dev) e.rv = dev;
                    }
                    e.propia = true;
                    e.ln = lineaDe(m.index + m[0].lastIndexOf(nombre));
                    out[nombre] = e;
                }
            });
        } catch (e) { }

        return cacheEscribe(cm, '_nsftDocFirmas', gen, out);
    }

    function tipoLimpio(t) {
        if (!t) return '';
        const v = String(t).replace(/\s*\n\s*\*?\s*/g, ' ').replace(/\s+/g, ' ').trim();
        return v.length > 40 ? v.slice(0, 39) + '…' : v;
    }

    function descripcionJsdoc(doc) {
        const out = [];
        for (const linea of String(doc).split(/\r?\n/)) {
            const t = linea.replace(/^\s*\*?\s?/, '').trim();
            if (t.charAt(0) === '@') break;
            if (t) out.push(t);
        }
        return out.join(' ').trim();
    }

    const RE_DEFINE = /\bdefine\s*\(\s*\[([^\]]*)\]\s*,\s*(?:\/\*(?:(?!\*\/)[\s\S])*\*\/\s*)?(?:async\s+)?(?:function\s*)?\(([^)]*)\)/;

    const ANALISIS_MS = 600;

    function cacheVale(c, gen, doc) {
        if (!c) return false;
        if (doc && c.d && c.d !== doc) return false;
        if (gen !== -1 && c.gen === gen) return true;
        return (Date.now() - c.t) < ANALISIS_MS;
    }

    function docDe(cm) {
        try { return cm.getDoc(); } catch (e) { return null; }
    }

    function cacheLee(cm, clave, gen) {
        const c = cm[clave];
        return cacheVale(c, gen, docDe(cm)) ? c.v : null;
    }

    function cacheEscribe(cm, clave, gen, v) {
        cm[clave] = { gen: gen, t: Date.now(), v: v, d: docDe(cm) };
        return v;
    }


    const RE_APIVERSION = /@NApiVersion\s*[:=]?\s*([12])/;
    const RE_DEFINE_N = /(?:define|require)\s*\(\s*(?:\[[^\]]*)?['"]N\//g;
    const RE_NLAPI = /\bnl(?:api|obj)[A-Z]\w*/g;
    const CABEZA = 4000;

    const cuantas = (doc, re) => { const m = doc.match(re); return m ? m.length : 0; };

    function versionApi(cm) {
        let gen = -1;
        try { gen = cm.changeGeneration(); } catch (e) { gen = -1; }
        const hit = cacheLee(cm, '_nsftApiVer', gen);
        if (hit) return hit === 'nada' ? null : hit;

        let v = null;
        try {
            const doc = cm.getValue();

            const uno = cuantas(doc, RE_NLAPI);
            const dos = cuantas(doc, RE_DEFINE_N);

            const m = doc.slice(0, CABEZA).match(RE_APIVERSION);
            const cabeceraMiente = m && m[1] === '2' && uno >= 3 && dos === 0;
            if (m && !cabeceraMiente) {
                v = m[1];
            } else if (cabeceraMiente) {
                v = '1';
            } else {
                if (uno && uno >= dos * 2) v = '1';
                else if (dos && dos >= uno * 2) v = '2';
            }
        } catch (e) { v = null; }

        cacheEscribe(cm, '_nsftApiVer', gen, v || 'nada');
        return v;
    }

    function apiDelEditor(cm) {
        if (!cm || !cm._nsftApiAuto) return null;
        return versionApi(cm);
    }

    function aliasDelDocumento(cm) {
        let gen = -1;
        try { gen = cm.changeGeneration(); } catch (e) { gen = -1; }
        const hit = cacheLee(cm, '_nsftAlias', gen);
        if (hit) return hit;

        const out = Object.create(null);
        try {
            const m = cm.getValue().match(RE_DEFINE);
            if (m) {
                const rutas = m[1].split(',')
                    .map((x) => x.trim().replace(/^['"`]|['"`]$/g, ''))
                    .filter(Boolean);
                const nombres = m[2].split(',').map((x) => x.trim());
                rutas.forEach((r, i) => {
                    const n = nombres[i];
                    if (n && /^[A-Za-z_$][\w$]*$/.test(n)) out[n] = r;
                });
            }
        } catch (e) { }

        try {
            const set = window.CodeMirror && CodeMirror.nsftPrecargados;
            if (set && set.add) {
                let nuevos = 0;
                Object.keys(out).forEach((n) => { if (!set.has(n)) { set.add(n); nuevos++; } });
                if (nuevos) repintaResaltado();
            }
        } catch (e) { }

        return cacheEscribe(cm, '_nsftAlias', gen, out);
    }

    function firmaApi(base, miembro, cm) {
        const soloApi = apiDelEditor(cm);
        if (_api2 && soloApi !== '1') {
            const ruta = (cm && aliasDelDocumento(cm)[base]) || ALIAS_A_RUTA[base];
            if (ruta && _api2.mods[ruta] && _api2.mods[ruta][miembro]) return _api2.mods[ruta][miembro];
            if (_api2.tipos[base] && _api2.tipos[base][miembro]) return _api2.tipos[base][miembro];
        }
        if (_api1 && soloApi !== '2' && _api1.tipos[base] && _api1.tipos[base][miembro]) {
            return _api1.tipos[base][miembro];
        }
        if (String(base).indexOf('|') >= 0) {
            const ramas = ramasDeTipo(base);
            for (let i = 0; i < ramas.length; i++) {
                const t = tipoDelCatalogo(ramas[i]);
                if (t && t[miembro]) return t[miembro];
            }
        }
        const nat = JS_FIRMAS[(base.indexOf('js:') === 0 ? base.slice(3) : base) + '.' + miembro];
        return nat || null;
    }

    function firmaGlobal(nombre, cm) {
        if (apiDelEditor(cm) === '2') return null;
        return (_api1 && _api1.fns && _api1.fns[nombre]) || null;
    }

    function ramasDeTipo(tipo) {
        return String(tipo || '').replace(/[()]/g, '').split('|')
            .map((x) => x.trim()).filter(Boolean);
    }

    function tipoDelCatalogo(tipo) {
        return (_api2 && _api2.tipos[tipo]) || (_api1 && _api1.tipos && _api1.tipos[tipo]) || null;
    }

    function miembrosDelCatalogo(tipo) {
        const ramas = ramasDeTipo(tipo);
        if (!ramas.length) return null;
        if (ramas.length === 1) {
            const t = tipoDelCatalogo(ramas[0]);
            if (!t) return null;
            return Object.keys(t).map((n) => ({ n: n, t: t[n].prop ? 'v' : 'f' }));
        }

        const vistos = Object.create(null);
        const out = [];
        ramas.forEach((r) => {
            const t = tipoDelCatalogo(r);
            if (!t) return;
            Object.keys(t).forEach((n) => {
                if (vistos[n]) { vistos[n].ramas++; return; }
                const e = { n: n, t: t[n].prop ? 'v' : 'f', rama: r, ramas: 1 };
                vistos[n] = e;
                out.push(e);
            });
        });
        if (!out.length) return null;
        out.sort((a, b) => (b.ramas - a.ramas) || a.n.localeCompare(b.n));
        return out;
    }

    function textoFirma(f) {
        if (!f || !f.p || !f.p.length) return '';
        const t = f.p.map((x) => x.n + (x.o ? '?' : '') + ': ' + x.t).join(', ');
        return '(' + (t.length > 46 ? t.slice(0, 45) + '…' : t) + ')';
    }

    const HINT_ICONO = { mod: 'M', fn: 'ƒ', enum: 'E', prop: 'P', const: 'C' };

    function etiquetaMiembro(base, x, f) {
        if (f && f.prop) return f.r ? f.r : (x.t === 'o' ? 'enum' : '');
        if (x.t !== 'f') return x.t === 'o' ? 'enum' : '';
        const dev = _retornos[base + '.' + x.n] || JS_RETORNOS[base + '.' + x.n] || (f && f.r);
        if (!dev) return 'fn';
        return '→ ' + (dev.indexOf('js:') === 0 ? dev.slice(3) : dev);
    }

    function hintRow(el, item, needleLc) {
        el.classList.add('nsft-ssc-hint-entry');
        const kind = item.kind || 'prop';
        const ico = document.createElement('span');
        ico.className = 'nsft-ssc-hint-icon nsft-ssc-hint-icon-' + kind;
        ico.textContent = HINT_ICONO[kind] || '·';
        ico.setAttribute('aria-hidden', 'true');
        el.appendChild(ico);

        const name = document.createElement('span');
        name.className = 'nsft-ssc-hint-id';
        appendHighlighted(name, item.text, needleLc);
        el.appendChild(name);

        if (item.sig) {
            const sig = document.createElement('span');
            sig.className = 'nsft-ssc-hint-sig';
            sig.textContent = item.sig;
            el.appendChild(sig);
        }

        if (item.tag) {
            const tag = document.createElement('span');
            tag.className = 'nsft-ssc-hint-type';
            tag.textContent = item.tag;
            el.appendChild(tag);
        }
    }

    let _panelDoc = null;
    let _cierreDoc = null;

    function cierraPanelDoc() {
        clearTimeout(_cierreDoc);
        _cierreDoc = null;
        if (_panelDoc && _panelDoc.parentNode) _panelDoc.parentNode.removeChild(_panelDoc);
        _panelDoc = null;
    }

    const ANCHO_CERO = String.fromCharCode(0x200b);

    function parteTipo(t) {
        return String(t || '').replace(/\|/g, '|' + ANCHO_CERO);
    }

    function construyeDoc(nombre, f) {
        const caja = document.createElement('div');
        caja.className = 'nsft-ssc-doc';
        caja.setAttribute('data-nsft-ui', '');

        const firma = document.createElement('div');
        firma.className = 'nsft-ssc-doc-firma';
        const pon = (txt, clase) => {
            const e = document.createElement('span');
            if (clase) e.className = clase;
            e.textContent = txt;
            firma.appendChild(e);
        };
        if (f.prop) {
            pon(nombre, 'nsft-ssc-t-par');
            if (f.r) { pon(': '); pon(parteTipo(f.r), 'nsft-ssc-t-tipo'); }
            if (f.ro) {
                const ro = document.createElement('span');
                ro.className = 'nsft-ssc-doc-chip is-opt';
                ro.textContent = i18n('cai_doc_ro', 'read-only');
                firma.appendChild(document.createTextNode(' '));
                firma.appendChild(ro);
            }
            caja.appendChild(firma);
        } else {
        pon(nombre, 'nsft-ssc-t-fn');
        pon('(');
        (f.p || []).forEach((x, i) => {
            if (i) pon(', ');
            pon(x.n + (x.o ? '?' : ''), 'nsft-ssc-t-par');
            pon(': ');
            pon(parteTipo(x.t), 'nsft-ssc-t-tipo');
        });
        pon(')');
        if (f.r) { pon(': '); pon(parteTipo(f.r), 'nsft-ssc-t-ret'); }
        caja.appendChild(firma);
        }

        if (f.d) {
            const d = document.createElement('div');
            d.className = 'nsft-ssc-doc-desc';
            d.textContent = f.d;
            caja.appendChild(d);
        }

        if (f.p && f.p.length) {
            caja.appendChild(titulo(i18n('cai_doc_params', 'Parameters')));
            f.p.forEach((x) => {
                const fila = document.createElement('div');
                fila.className = 'nsft-ssc-doc-par';

                const cab = document.createElement('div');
                cab.className = 'nsft-ssc-doc-par-cab';

                const n = document.createElement('span');
                n.className = 'nsft-ssc-t-par';
                n.textContent = x.n;
                cab.appendChild(n);

                const t = document.createElement('span');
                t.className = 'nsft-ssc-doc-chip is-tipo';
                t.textContent = parteTipo(x.t);
                cab.appendChild(t);

                if (x.o) {
                    const o = document.createElement('span');
                    o.className = 'nsft-ssc-doc-chip is-opt';
                    o.textContent = i18n('cai_doc_opt', 'optional')
                        + (x.v ? ' · ' + x.v : '');
                    cab.appendChild(o);
                }
                fila.appendChild(cab);

                if (x.d) {
                    const d = document.createElement('div');
                    d.className = 'nsft-ssc-doc-par-desc';
                    d.textContent = x.d;
                    fila.appendChild(d);
                }
                caja.appendChild(fila);
            });
        }

        if (f.r && !f.prop) {
            caja.appendChild(titulo(i18n('cai_doc_returns', 'Returns')));
            const fila = document.createElement('div');
            fila.className = 'nsft-ssc-doc-par';
            const cab = document.createElement('div');
            cab.className = 'nsft-ssc-doc-par-cab';
            const t = document.createElement('span');
            t.className = 'nsft-ssc-doc-chip is-ret';
            t.textContent = parteTipo(f.r);
            cab.appendChild(t);
            fila.appendChild(cab);
            if (f.rd) {
                const d = document.createElement('div');
                d.className = 'nsft-ssc-doc-par-desc';
                d.textContent = f.rd;
                fila.appendChild(d);
            }
            caja.appendChild(fila);
        }

        if (f.g) {
            caja.appendChild(titulo(i18n('cai_doc_gov', 'Governance')));
            const g = document.createElement('div');
            g.className = 'nsft-ssc-doc-gov';
            g.textContent = f.g;
            caja.appendChild(g);
        }

        const pie = document.createElement('div');
        pie.className = 'nsft-ssc-doc-pie';
        const marca = document.createElement('span');
        marca.className = 'nsft-ssc-doc-origen' + (f.propia ? ' is-propia' : '');
        marca.textContent = f.propia
            ? i18n('cai_doc_propia', 'Defined in this file')
            : i18n('cai_doc_ns', 'SuiteScript API');
        pie.appendChild(marca);
        caja.appendChild(pie);

        return caja;
    }

    function titulo(txt) {
        const t = document.createElement('div');
        t.className = 'nsft-ssc-doc-tit';
        t.textContent = txt;
        return t;
    }

    function avisaSiNoCabe(caja) {
        try {
            if (caja.scrollHeight <= caja.clientHeight + 4) return;
            const pie = caja.querySelector('.nsft-ssc-doc-pie');
            if (!pie) return;
            const t = document.createElement('span');
            t.className = 'nsft-ssc-doc-atajo';
            t.textContent = i18n('cai_doc_scroll', 'Alt+↑↓ to scroll');
            pie.appendChild(t);
        } catch (e) { }
    }

    function pintaPanelDoc(item, node) {
        cierraPanelDoc();
        const f = item && item.nsftDoc;
        if (!f || !node || !node.parentNode) return;

        const caja = construyeDoc(item.nsftNombre, f);
        caja.dataset.nsftOrigen = 'lista';
        document.body.appendChild(caja);
        _panelDoc = caja;
        avisaSiNoCabe(caja);

        try {
            const lista = node.parentNode.getBoundingClientRect();
            const ancho = caja.offsetWidth;
            const hueco = window.innerWidth - lista.right - 8;
            const izq = (hueco >= ancho) ? lista.right + 6 : Math.max(4, lista.left - ancho - 6);
            caja.style.left = Math.round(izq) + 'px';
            caja.style.top = Math.round(Math.min(lista.top, window.innerHeight - caja.offsetHeight - 8)) + 'px';
        } catch (e) { cierraPanelDoc(); }
    }

    let _inlay = true;

    let _ligeroLineas = 800;

    function esLigero(cm) {
        if (!_ligeroLineas) return false;
        try { return cm.lineCount() > _ligeroLineas; } catch (e) { return false; }
    }

    function trozoInlay(txt, clase, alClic) {
        const e = document.createElement('span');
        e.className = 'nsft-ssc-inlay' + (clase ? ' ' + clase : '')
            + (alClic ? ' is-plegable' : '');
        e.textContent = txt;
        e.setAttribute('aria-hidden', 'true');
        if (alClic) {
            e.addEventListener('mousedown', (ev) => { ev.preventDefault(); ev.stopPropagation(); });
            e.addEventListener('click', (ev) => { ev.preventDefault(); ev.stopPropagation(); alClic(); });
        }
        return e;
    }

    const INLAY_TIPO_MAX = 30;
    const _inlayAbiertos = new Set();

    function tipoInlay(t) {
        const v = String(t || '').replace(/\s*\|\s*/g, ' | ');
        return { largo: v.length > INLAY_TIPO_MAX, txt: v };
    }

    function marcasDeLinea(cm) {
        const lista = cm._nsftInlay || (cm._nsftInlay = []);
        const mapa = new Map();
        const vivas = [];
        for (let i = 0; i < lista.length; i++) {
            const m = lista[i];
            let p = null;
            try { p = m.find(); } catch (e) { p = null; }
            if (!p) continue;
            vivas.push(m);
            const n = (p.line != null) ? p.line : (p.from ? p.from.line : null);
            if (n == null) continue;
            const arr = mapa.get(n);
            if (arr) arr.push(m); else mapa.set(n, [m]);
        }
        cm._nsftInlay = vivas;
        return mapa;
    }

    function marcaSucioInlay(cm, cambios) {
        if (!cambios || !cambios.length) return;

        const previo = cm._nsftInlaySucio;
        let desde = previo ? previo.desde : Infinity;
        let hasta = previo ? previo.hasta : -Infinity;

        for (let i = 0; i < cambios.length; i++) {
            const c = cambios[i];
            if (!c || !c.from) { cm._nsftInlayTodo = true; return; }
            const metidas = (c.text ? c.text.length : 1) - 1;
            if (c.from.line < desde) desde = c.from.line;
            const fin = c.from.line + metidas;
            if (fin > hasta) hasta = fin;
        }
        if (desde > hasta) return;
        cm._nsftInlaySucio = { desde: Math.max(0, desde - 1), hasta: hasta + 1 };
    }

    function huboBorrado(cambios) {
        if (!cambios) return false;
        for (let i = 0; i < cambios.length; i++) {
            const c = cambios[i];
            if (!c || !c.from || !c.to) return true;
            if (c.to.line !== c.from.line || c.to.ch !== c.from.ch) return true;
        }
        return false;
    }

    function tiraInlayCaducado(cm) {
        if (!cm._nsftInlay || !cm._nsftInlay.length) return;
        if (cm._nsftInlayTodo) { cm.operation(() => limpiaInlay(cm)); return; }
        const s = cm._nsftInlaySucio;
        if (!s) return;
        cm.operation(() => {
            const mapa = marcasDeLinea(cm);
            for (let n = s.desde; n <= s.hasta; n++) borraLinea(cm, n, mapa);
        });
    }

    function borraLinea(cm, n, mapa) {
        const ms = mapa && mapa.get(n);
        if (!ms) return;
        ms.forEach((b) => { try { b.clear(); } catch (e) { } });
        mapa.delete(n);
    }

    function limpiaInlay(cm) {
        const lista = cm._nsftInlay || [];
        lista.forEach((b) => { try { b.clear(); } catch (e) { } });
        cm._nsftInlay = [];
    }

    const INLAY_LINEAS_LLAMADA = 40;

    const INLAY_MARGEN = 25;

    let _perfHook = null;
    function setPerfHook(fn) { _perfHook = (typeof fn === 'function') ? fn : null; }

    const PALABRAS_CON_PARENTESIS = /^(?:if|for|while|switch|catch|return|typeof|function|class|do|else|try|new|await|in|of)$/;

    function esCodigo(cm, line, ch) {
        try {
            const clase = cm.getTokenTypeAt({ line: line, ch: ch }) || '';
            return !/comment|string/.test(clase);
        } catch (e) { return true; }
    }

    function sinComentarioDeLinea(linea) {
        let cadena = null;
        for (let i = 0; i < linea.length; i++) {
            const c = linea.charAt(i);
            if (cadena) {
                if (c === '\\') { i++; continue; }
                if (c === cadena) cadena = null;
                continue;
            }
            if (c === '"' || c === "'" || c === '`') { cadena = c; continue; }
            if (c === '/' && linea.charAt(i + 1) === '/') return linea.slice(0, i);
        }
        return linea;
    }

    function argumentosDeLlamada(cm, line, ch) {
        const out = [];
        const tope = Math.min(cm.lineCount(), line + INLAY_LINEAS_LLAMADA);
        let hondo = 0, cadena = null, ini = null, enBloque = false;

        for (let n = line; n < tope; n++) {
            const linea = cm.getLine(n) || '';
            const desde = (n === line) ? ch : 0;
            for (let i = desde; i < linea.length; i++) {
                const c = linea.charAt(i), sig = linea.charAt(i + 1);

                if (enBloque) { if (c === '*' && sig === '/') { enBloque = false; i++; } continue; }
                if (cadena) {
                    if (c === '\\') { i++; continue; }
                    if (c === cadena) cadena = null;
                    continue;
                }
                if (c === '/' && sig === '/') break;
                if (c === '/' && sig === '*') { enBloque = true; i++; continue; }
                if (c === '"' || c === "'" || c === '`') {
                    if (hondo === 0 && !ini) ini = { line: n, ch: i };
                    cadena = c;
                    continue;
                }
                if ('([{'.indexOf(c) >= 0) {
                    if (hondo === 0 && !ini) ini = { line: n, ch: i };
                    hondo++;
                    continue;
                }
                if (')]}'.indexOf(c) >= 0) {
                    if (hondo === 0) {
                        if (c !== ')') return null;
                        if (ini) out.push(ini);
                        return out;
                    }
                    hondo--;
                    continue;
                }
                if (c === ',' && hondo === 0) { if (ini) out.push(ini); ini = null; continue; }
                if (!ini && !/\s/.test(c)) ini = { line: n, ch: i };
            }
        }
        return null;
    }

    function pintaInlay(cm) {
        if (!_inlay || esLigero(cm) || !cm.getWrapperElement().offsetParent) {
            limpiaInlay(cm);
            cm._nsftInlayVp = null;
            return;
        }

        const vp = cm.getViewport();
        let gen = -1;
        try { gen = cm.changeGeneration(); } catch (e) { gen = -1; }

        const antes = cm._nsftInlayVp;
        if (gen !== -1 && antes && antes.gen === gen
            && vp.from >= antes.from && vp.to <= antes.to) return;

        const desde = Math.max(0, vp.from - INLAY_MARGEN);
        const hasta = Math.min(cm.lineCount(), vp.to + INLAY_MARGEN);

        const mismoTexto = gen !== -1 && antes && antes.gen === gen;
        const sucio = cm._nsftInlaySucio;
        const todo = cm._nsftInlayTodo;
        cm._nsftInlaySucio = null;
        cm._nsftInlayTodo = false;
        let lineasRehechas = 0;

        cm.operation(() => {

        const tBorrar = _perfHook ? performance.now() : 0;
        let comoBorro = '';
        let mapa = marcasDeLinea(cm);
        if (!mismoTexto) {
            if (!todo && sucio && antes) {
                comoBorro = 'solo el tramo tocado';
                for (let n = sucio.desde; n <= sucio.hasta; n++) borraLinea(cm, n, mapa);
            } else {
                comoBorro = todo ? 'todo (no se sabia que cambio)' : 'todo (primera vez)';
                limpiaInlay(cm);
                mapa = new Map();
            }
        }
        if (_perfHook && comoBorro) _perfHook('inlay · borrar marcas: ' + comoBorro, performance.now() - tBorrar);
        cm._nsftInlayVp = { from: desde, to: hasta, gen: gen };

        const t0 = _perfHook ? performance.now() : 0;
        const tipos = locales(cm);
        const t1 = _perfHook ? performance.now() : 0;
        const propias = firmasDelDocumento(cm);
        const t2 = _perfHook ? performance.now() : 0;
        if (_perfHook) {
            _perfHook('inlay · deducir tipos (locales)', t1 - t0);
            _perfHook('inlay · firmas del documento', t2 - t1);
        }

        Array.from(mapa.keys()).forEach((n) => {
            if (n < desde || n >= hasta) borraLinea(cm, n, mapa);
        });

        for (let n = desde; n < hasta; n++) {
            if (mapa.has(n)) continue;
            const linea = cm.getLine(n);
            if (!linea) continue;
            lineasRehechas++;
            const marcas = [];
            mapa.set(n, marcas);
            const anota = (pos, opciones) => {
                try {
                    const b = cm.setBookmark(pos, opciones);
                    marcas.push(b);
                    cm._nsftInlay.push(b);
                } catch (e) { }
            };

            const dec = linea.match(/\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)/);
            if (dec && esCodigo(cm, n, dec.index)) {
                const t = tipos[dec[1]];
                if (t) {
                    const ch = dec.index + dec[0].length;
                    const crudo = t.indexOf('js:') === 0 ? t.slice(3) : t;
                    const info = tipoInlay(crudo);
                    const abierto = _inlayAbiertos.has(dec[1]);
                    const txt = ': ' + ((info.largo && !abierto) ? '…' : info.txt);
                    const plegar = info.largo ? (() => {
                        if (abierto) _inlayAbiertos.delete(dec[1]);
                        else _inlayAbiertos.add(dec[1]);
                        cm._nsftInlayVp = null;
                        pintaInlay(cm);
                    }) : null;
                    anota({ line: n, ch: ch }, {
                        widget: trozoInlay(txt, null, plegar),
                        insertLeft: true
                    });
                }
            }

            const codigoDeLinea = sinComentarioDeLinea(linea);
            const lla = /([A-Za-z_$][\w$]*)\s*(?:\.\s*([A-Za-z_$][\w$]*)\s*)?\(/g;
            let m;
            while ((m = lla.exec(codigoDeLinea))) {
                const base = m[2] ? m[1] : null;
                const nombre = m[2] || m[1];

                if (!esCodigo(cm, n, m.index)) continue;
                const previo = linea.slice(0, m.index).replace(/\s+$/, '');
                if (/\b(?:function|class)$/.test(previo)) continue;
                if (PALABRAS_CON_PARENTESIS.test(nombre)) continue;
                const f = base ? (firmaApi(base, nombre, cm)
                    || ((tipos[base] && tipos[base].indexOf('js:') !== 0) ? firmaApi(tipos[base], nombre, cm) : null))
                    : (firmaGlobal(nombre, cm) || propias[nombre]);
                if (!f || !f.p || !f.p.length) continue;

                const pos = argumentosDeLlamada(cm, n, m.index + m[0].length);
                if (!pos || !pos.length) continue;

                if (f.obj) {
                    const uno = pos.length === 1 ? pos[0] : null;
                    const abre = uno && (cm.getLine(uno.line) || '').charAt(uno.ch) === '{';
                    if (!abre) continue;
                    anota(uno, {
                        widget: trozoInlay(f.obj + ':', 'is-arg'),
                        insertLeft: true
                    });
                    continue;
                }

                pos.forEach((sitio, i) => {
                    if (i >= f.p.length) return;
                    anota(sitio, {
                        widget: trozoInlay(f.p[i].n + ':', 'is-arg'),
                        insertLeft: true
                    });
                });
            }
        }

        if (_perfHook) {
            _perfHook('inlay · pintar ' + lineasRehechas + ' lineas', performance.now() - t2);
        }
        });
    }

    function programaInlay(cm, prisa) {
        if (cm._nsftVolando) return;
        clearTimeout(cm._nsftInlayTimer);
        cancelaCuadro(cm);

        const trabajo = () => { try { pintaInlay(cm); } catch (e) { limpiaInlay(cm); } };

        if (prisa) {
            let genAhora = -1;
            try { genAhora = cm.changeGeneration(); } catch (e) { genAhora = -1; }
            const yaPintado = cm._nsftInlayVp;
            const soloSeMovio = genAhora !== -1 && yaPintado && yaPintado.gen === genAhora;
            if (soloSeMovio) {
                const raf = window.requestAnimationFrame || ((cb) => setTimeout(cb, 16));
                cm._nsftInlayCuadro = raf(() => { cm._nsftInlayCuadro = null; trabajo(); });
                return;
            }
        }
        cm._nsftInlayTimer = setTimeout(trabajo, 250);
    }

    function cancelaCuadro(cm) {
        if (!cm._nsftInlayCuadro) return;
        try { (window.cancelAnimationFrame || clearTimeout)(cm._nsftInlayCuadro); } catch (e) { }
        cm._nsftInlayCuadro = null;
    }

    function repintaInlayTodos() {
        _editores.forEach((x) => {
            try { x.cm._nsftInlayVp = null; programaInlay(x.cm); } catch (e) { }
        });
    }

    const SIG_LINEAS = 40;

    function pilaAbierta(txt) {
        const pila = [];
        let cadena = null, enLinea = false, enBloque = false;
        for (let i = 0; i < txt.length; i++) {
            const c = txt.charAt(i), sig = txt.charAt(i + 1);
            if (enLinea) { if (c === '\n') enLinea = false; continue; }
            if (enBloque) { if (c === '*' && sig === '/') { enBloque = false; i++; } continue; }
            if (cadena) {
                if (c === '\\') { i++; continue; }
                if (c === cadena) cadena = null;
                continue;
            }
            if (c === '/' && sig === '/') { enLinea = true; i++; continue; }
            if (c === '/' && sig === '*') { enBloque = true; i++; continue; }
            if (c === '"' || c === "'" || c === '`') { cadena = c; continue; }
            if ('([{'.indexOf(c) >= 0) { pila.push({ c: c, i: i }); continue; }
            if (')]}'.indexOf(c) >= 0) pila.pop();
        }
        return pila;
    }

    function pareceListaDeArgumentos(dentro) {
        let prof = 0, cadena = null, enLinea = false, enBloque = false;
        for (let i = 0; i < dentro.length; i++) {
            const c = dentro.charAt(i), sig = dentro.charAt(i + 1);
            if (enLinea) { if (c === '\n') enLinea = false; continue; }
            if (enBloque) { if (c === '*' && sig === '/') { enBloque = false; i++; } continue; }
            if (cadena) {
                if (c === '\\') { i++; continue; }
                if (c === cadena) cadena = null;
                continue;
            }
            if (c === '/' && sig === '/') { enLinea = true; i++; continue; }
            if (c === '/' && sig === '*') { enBloque = true; i++; continue; }
            if (c === '"' || c === "'" || c === '`') { cadena = c; continue; }
            if ('([{'.indexOf(c) >= 0) { prof++; continue; }
            if (')]}'.indexOf(c) >= 0) {
                if (prof === 0) return false;
                prof--;
                continue;
            }
            if (c === ';' && prof === 0) return false;
        }
        return true;
    }

    function llamadaEnCurso(cm) {
        const cur = cm.getCursor();
        if (!esCodigo(cm, cur.line, Math.max(0, cur.ch - 1))) return null;
        const desde = { line: Math.max(0, cur.line - SIG_LINEAS), ch: 0 };
        const txt = cm.getRange(desde, cur);
        const pila = pilaAbierta(txt);

        let par = null;
        for (let i = pila.length - 1; i >= 0; i--) { if (pila[i].c === '(') { par = pila[i]; break; } }
        if (!par) return null;

        const antes = txt.slice(0, par.i);
        const m = antes.match(/([A-Za-z_$][\w$]*)[ \t]*\.[ \t]*([A-Za-z_$][\w$]*)[ \t]*$/)
            || antes.match(/([A-Za-z_$][\w$]*)[ \t]*$/);
        if (!m) return null;

        const dentro = txt.slice(par.i + 1);
        if (!pareceListaDeArgumentos(dentro)) return null;

        const mal = cm._nsftLintMal;
        if (mal && typeof mal.line === 'number') {
            const lineaDelPar = desde.line + (txt.slice(0, par.i).split('\n').length - 1);
            if (mal.line !== lineaDelPar) return null;
        }

        return {
            base: m.length > 2 ? m[1] : null,
            nombre: m.length > 2 ? m[2] : m[1],
            dentro: dentro,
            llave: pila.some((x) => x.c === '{' && x.i > par.i)
        };
    }

    function firmaDeLlamada(cm, ll) {
        if (!ll.base) return firmaGlobal(ll.nombre, cm) || firmasDelDocumento(cm)[ll.nombre] || null;
        const directa = firmaApi(ll.base, ll.nombre, cm);
        if (directa) return directa;
        const tipo = locales(cm)[ll.base];
        return (tipo && tipo.indexOf('js:') !== 0) ? firmaApi(tipo, ll.nombre, cm) : null;
    }

    function parametroActivo(f, ll) {
        if (!f || !f.p || !f.p.length) return -1;
        if (ll.llave) {
            const trozo = ll.dentro.slice(ll.dentro.lastIndexOf('{') + 1);
            const ult = trozo.split(',').pop();
            const k = ult.match(/([A-Za-z_$][\w$]*)\s*:?[^,]*$/);

            if (!k) return /^\s*$/.test(ult) ? 0 : -1;

            if (ult.indexOf(':') >= 0) return f.p.findIndex((x) => x.n === k[1]);
            const pre = k[1].toLowerCase();
            return f.p.findIndex((x) => x.n.toLowerCase().indexOf(pre) === 0);
        }
        let hondo = 0, n = 0;
        let cadena = null;
        for (let i = 0; i < ll.dentro.length; i++) {
            const c = ll.dentro.charAt(i);
            if (cadena) { if (c === '\\') i++; else if (c === cadena) cadena = null; continue; }
            if (c === '"' || c === "'" || c === '`') { cadena = c; continue; }
            if ('([{'.indexOf(c) >= 0) hondo++;
            else if (')]}'.indexOf(c) >= 0) hondo--;
            else if (c === ',' && hondo === 0) n++;
        }
        return n < f.p.length ? n : -1;
    }

    let _panelSig = null;

    function cierraSig() {
        if (_panelSig && _panelSig.parentNode) _panelSig.parentNode.removeChild(_panelSig);
        _panelSig = null;
    }

    function enElValor(ll) {
        const dentro = String(ll.dentro || '');
        const trozo = dentro.slice(Math.max(dentro.lastIndexOf('{'), dentro.lastIndexOf(',')) + 1);
        const sinCadenas = trozo.replace(/(['"`])(?:\\.|(?!\1)[\s\S])*\1?/g, '');
        return sinCadenas.indexOf(':') >= 0;
    }

    function calladaPorEsc(cm, ll) {
        const c = cm._nsftSigCallado;
        if (!c) return false;
        if (c.nombre !== (ll.base ? ll.base + '.' : '') + ll.nombre) {
            cm._nsftSigCallado = null;
            return false;
        }
        return true;
    }

    function callaSig(cm) {
        let ll = null;
        try { ll = llamadaEnCurso(cm); } catch (e) { ll = null; }
        cm._nsftSigCallado = ll ? { nombre: (ll.base ? ll.base + '.' : '') + ll.nombre } : null;
        cierraSig();
    }

    function pintaSig(cm) {
        cierraSig();
        if (!cm.hasFocus() || (cm.state && cm.state.completionActive)) return;

        let ll = null;
        try { ll = llamadaEnCurso(cm); } catch (e) { return; }
        if (!ll) return;

        if (ll.llave && enElValor(ll)) return;

        if (calladaPorEsc(cm, ll)) return;
        const f = firmaDeLlamada(cm, ll);
        if (!f || !f.p || !f.p.length) return;
        const act = parametroActivo(f, ll);

        const caja = document.createElement('div');
        caja.className = 'nsft-ssc-doc nsft-ssc-sig';
        caja.setAttribute('data-nsft-ui', '');

        const firma = document.createElement('div');
        firma.className = 'nsft-ssc-doc-firma';
        const pon = (padre, txt, clase) => {
            const e = document.createElement('span');
            if (clase) e.className = clase;
            e.textContent = txt;
            padre.appendChild(e);
        };
        pon(firma, ll.nombre, 'nsft-ssc-t-fn');
        pon(firma, '(');
        f.p.forEach((x, i) => {
            if (i) pon(firma, ', ');
            let destino = firma;
            if (i === act) {
                destino = document.createElement('span');
                destino.className = 'nsft-ssc-sig-act';
                firma.appendChild(destino);
            }
            pon(destino, x.n + (x.o ? '?' : ''), 'nsft-ssc-t-par');
            pon(destino, ': ');
            pon(destino, parteTipo(x.t), 'nsft-ssc-t-tipo');
        });
        pon(firma, ')');
        if (f.r) { pon(firma, ': '); pon(firma, parteTipo(f.r), 'nsft-ssc-t-ret'); }
        caja.appendChild(firma);

        if (act >= 0 && f.p[act] && f.p[act].d) {
            const d = document.createElement('div');
            d.className = 'nsft-ssc-doc-desc';
            d.textContent = f.p[act].d;
            caja.appendChild(d);
        }
        if (f.g) {
            const g = document.createElement('div');
            g.className = 'nsft-ssc-doc-gov';
            g.textContent = f.g;
            caja.appendChild(g);
        }

        document.body.appendChild(caja);
        _panelSig = caja;

        try {
            const co = cm.cursorCoords(true, 'window');
            const alto = caja.offsetHeight;
            const arriba = (co.top - alto - 6 >= 4) ? co.top - alto - 6 : co.bottom + 6;
            caja.style.top = Math.round(arriba) + 'px';
            caja.style.left = Math.round(Math.min(co.left, window.innerWidth - caja.offsetWidth - 8)) + 'px';
        } catch (e) { cierraSig(); }
    }

    function programaSig(cm) {
        clearTimeout(cm._nsftSigTimer);
        cm._nsftSigTimer = setTimeout(() => { try { pintaSig(cm); } catch (e) { cierraSig(); } }, 90);
    }

    const RE_VAR = /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)/g;

    function declaracionesDelDocumento(cm) {
        let gen = -1;
        try { gen = cm.changeGeneration(); } catch (e) { gen = -1; }
        const hit = cacheLee(cm, '_nsftDecl', gen);
        if (hit) return hit;

        const out = Object.create(null);
        try {
            const lineas = cm.getValue().split(/\r?\n/);
            for (let i = 0; i < lineas.length; i++) {
                const l = lineas[i];
                const t = l.replace(/^\s+/, '');
                if (t.indexOf('//') === 0 || t.charAt(0) === '*' || t.indexOf('/*') === 0) continue;
                RE_VAR.lastIndex = 0;
                let m;
                while ((m = RE_VAR.exec(l))) {
                    if (out[m[1]] === undefined) out[m[1]] = i;
                }
            }
        } catch (e) { }

        try {
            const fns = firmasDelDocumento(cm);
            Object.keys(fns).forEach((n) => {
                const f = fns[n];
                if (typeof f.ln !== 'number') return;
                (f.p || []).forEach((x) => {
                    if (out[x.n] === undefined) out[x.n] = f.ln;
                });
            });
        } catch (e) { }

        return cacheEscribe(cm, '_nsftDecl', gen, out);
    }

    function parametrosAqui(cm, linea) {
        const fns = firmasDelDocumento(cm);
        let mejor = null;
        Object.keys(fns).forEach((n) => {
            const f = fns[n];
            if (typeof f.ln !== 'number' || f.ln > linea) return;
            if (!mejor || f.ln > mejor.ln) mejor = f;
        });
        return (mejor && mejor.p) ? mejor.p : [];
    }

    function lineaDeclarada(cm, nombre) {
        const f = firmasDelDocumento(cm)[nombre];
        if (f && typeof f.ln === 'number') return f.ln;
        const d = declaracionesDelDocumento(cm)[nombre];
        return (typeof d === 'number') ? d : null;
    }

    const SALTO_MIN_LINEAS = 8;
    const SALTO_MS = 220;

    function desplazaSuave(cm, ln, col, salto) {
        const destino = { line: ln, ch: col };
        const medio = cm.getScrollInfo().clientHeight / 2;
        const cerca = salto < SALTO_MIN_LINEAS;
        let quieto = false;
        try {
            quieto = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
        } catch (e) { quieto = false; }

        if (cerca || quieto) { cm.scrollIntoView(destino, medio); return; }

        const y = cm.charCoords(destino, 'local').top;
        const hasta = Math.max(0, y - medio);

        const tope = cm.getScrollInfo().clientHeight * 2;
        let desde = cm.getScrollInfo().top;
        if (Math.abs(hasta - desde) > tope) {
            desde = hasta + (hasta > desde ? -tope : tope);
            try { cm.scrollTo(null, Math.max(0, desde)); } catch (e) { }
        }

        cm._nsftVolando = true;
        clearTimeout(cm._nsftVueloTimer);
        cm._nsftVueloTimer = setTimeout(() => {
            if (!cm._nsftVolando) return;
            cm._nsftVolando = false;
            programaInlay(cm);
        }, SALTO_MS + 600);
        const reloj = (window.performance && window.performance.now)
            ? () => window.performance.now()
            : () => Date.now();
        const t0 = reloj();
        const raf = window.requestAnimationFrame || ((cb) => setTimeout(() => cb(Date.now()), 16));

        const paso = (ahora) => {
            const t = Math.max(0, Math.min(1, (ahora - t0) / SALTO_MS));
            const e = 1 - Math.pow(1 - t, 3);
            try { cm.scrollTo(null, desde + (hasta - desde) * e); } catch (err) { cm._nsftVolando = false; return; }
            if (t < 1) { raf(paso); return; }
            cm._nsftVolando = false;
            clearTimeout(cm._nsftVueloTimer);
            programaInlay(cm);
        };
        raf(paso);
    }

    function vaADefinicion(cm, q) {
        if (!q) return false;
        const ln = lineaDeclarada(cm, q.nombre);
        if (ln === null) return false;
        if (typeof q.line === 'number' && q.line === ln) return false;
        try {
            cierraPanelDoc();
            quitaEnlace(cm);
            const linea = cm.getLine(ln) || '';
            const col = Math.max(0, linea.indexOf(q.nombre));

            cm.focus();
            const salto = Math.abs(cm.getCursor().line - ln);
            cm.setCursor({ line: ln, ch: col }, null, { scroll: false });
            desplazaSuave(cm, ln, col, salto);
            const marca = cm.markText(
                { line: ln, ch: col },
                { line: ln, ch: col + q.nombre.length },
                { className: 'nsft-ssc-salto' }
            );
            setTimeout(() => { try { marca.clear(); } catch (e) { } }, 900);
        } catch (e) { return false; }
        return true;
    }

    function puedeSaltar(cm, q) {
        if (!q) return false;
        const ln = lineaDeclarada(cm, q.nombre);
        return ln !== null && !(typeof q.line === 'number' && q.line === ln);
    }

    function quitaEnlace(cm) {
        if (cm._nsftEnlace) {
            try { cm._nsftEnlace.clear(); } catch (e) { }
            cm._nsftEnlace = null;
        }
        cm._nsftEnlaceKey = null;
        try { cm.getWrapperElement().classList.remove('nsft-ssc-con-enlace'); } catch (e) { }
    }

    function marcaEnlace(cm, ev) {
        const mac = /Mac|iPod|iPhone|iPad/.test(navigator.platform || '');
        if (!ev || !(mac ? ev.metaKey : ev.ctrlKey) || ev.altKey) { quitaEnlace(cm); return; }

        let q = null;
        try {
            q = nombreEn(cm, cm.coordsChar({ left: ev.clientX, top: ev.clientY }, 'window'), false);
        } catch (e) { quitaEnlace(cm); return; }
        if (!puedeSaltar(cm, q)) { quitaEnlace(cm); return; }

        const clave = q.line + ':' + q.a + ':' + q.b;
        if (cm._nsftEnlaceKey === clave) return;
        quitaEnlace(cm);
        try {
            cm._nsftEnlace = cm.markText(
                { line: q.line, ch: q.a },
                { line: q.line, ch: q.b },
                { className: 'nsft-ssc-enlace' }
            );
            cm._nsftEnlaceKey = clave;
            cm.getWrapperElement().classList.add('nsft-ssc-con-enlace');
        } catch (e) { quitaEnlace(cm); }
    }

    function nombreEnCursor(cm) {
        try { return nombreEn(cm, cm.getCursor(), false); } catch (e) { return null; }
    }

    const TECLAS_TARJETA = {
        'Alt-Up': () => desplazaTarjeta(-1),
        'Alt-Down': () => desplazaTarjeta(1),
        'Alt-PageUp': () => desplazaTarjeta(-4),
        'Alt-PageDown': () => desplazaTarjeta(4)
    };

    function desplazaTarjeta(pasos) {
        if (!_panelDoc) return;
        const salto = Math.max(40, Math.round(_panelDoc.clientHeight / 3));
        _panelDoc.scrollTop += pasos * salto;
    }

    const HOVER_ESPERA = 350;

    function nombreEn(cm, pos, soloLlamadas) {
        const linea = cm.getLine(pos.line) || '';
        if (!/[\w$]/.test(linea.charAt(pos.ch))) return null;
        if (!esCodigo(cm, pos.line, pos.ch)) return null;

        let a = pos.ch, b = pos.ch;
        while (a > 0 && /[\w$]/.test(linea.charAt(a - 1))) a--;
        while (b < linea.length && /[\w$]/.test(linea.charAt(b))) b++;
        const nombre = linea.slice(a, b);
        if (!nombre || !/^[A-Za-z_$]/.test(nombre)) return null;

        const esLlamada = /^\s*\(/.test(linea.slice(b));
        if (soloLlamadas && !esLlamada) return null;

        const antes = linea.slice(0, a).match(/([A-Za-z_$][\w$]*)[ \t]*\.[ \t]*$/);
        return { base: antes ? antes[1] : null, nombre: nombre, llamada: esLlamada, line: pos.line, a: a, b: b };
    }

    function pintaHoverDoc(cm, ev) {
        if (_panelDoc && _panelDoc.dataset.nsftOrigen === 'lista') return;
        cierraPanelDoc();
        if (cm.state && cm.state.completionActive) return;

        const pos = cm.coordsChar({ left: ev.clientX, top: ev.clientY }, 'window');
        try {
            const tipo = cm.getTokenTypeAt(pos);
            if (tipo && /\b(comment|string)\b/.test(String(tipo))) return;
        } catch (e) { }
        const q = nombreEn(cm, pos, true);
        if (!q) return;

        const f = firmaDeLlamada(cm, { base: q.base, nombre: q.nombre });
        if (!f) return;

        const caja = construyeDoc(q.nombre, f);
        caja.addEventListener('mouseenter', () => { clearTimeout(_cierreDoc); });
        caja.addEventListener('mouseleave', () => {
            clearTimeout(_cierreDoc);
            _cierreDoc = setTimeout(cierraPanelDoc, 160);
        });

        document.body.appendChild(caja);
        _panelDoc = caja;

        try {
            const alto = caja.offsetHeight, ancho = caja.offsetWidth;
            const abajo = ev.clientY + 18;
            caja.style.top = Math.round(abajo + alto + 8 <= window.innerHeight
                ? abajo : Math.max(4, ev.clientY - alto - 12)) + 'px';
            caja.style.left = Math.round(Math.min(ev.clientX + 8, window.innerWidth - ancho - 8)) + 'px';
        } catch (e) { cierraPanelDoc(); }
    }

    function montaHover(cm) {
        const el = cm.getWrapperElement();
        let t = null;
        let ultimo = null;

        el.addEventListener('mousemove', (ev) => {
            clearTimeout(t);
            const clave = ev.clientX + ',' + ev.clientY;
            if (clave === ultimo) return;
            ultimo = clave;
            if (_panelDoc && _panelDoc.dataset.nsftOrigen !== 'lista') {
                clearTimeout(_cierreDoc);
                _cierreDoc = setTimeout(cierraPanelDoc, 260);
            }
            cm._nsftUltimoRaton = ev;
            marcaEnlace(cm, ev);
            t = setTimeout(() => { try { pintaHoverDoc(cm, ev); } catch (e) { cierraPanelDoc(); } }, HOVER_ESPERA);
        });

        el.addEventListener('mouseleave', () => {
            clearTimeout(t);
            quitaEnlace(cm);
            cm._nsftUltimoRaton = null;
            if (_panelDoc && _panelDoc.dataset.nsftOrigen === 'lista') return;
            clearTimeout(_cierreDoc);
            _cierreDoc = setTimeout(cierraPanelDoc, 260);
        });

        const alTeclado = () => { try { marcaEnlace(cm, cm._nsftUltimoRaton); } catch (e) { quitaEnlace(cm); } };
        const alSalir = () => quitaEnlace(cm);
        document.addEventListener('keydown', alTeclado, true);
        document.addEventListener('keyup', alTeclado, true);
        window.addEventListener('blur', alSalir);
        cm._nsftSueltaEnlace = () => {
            document.removeEventListener('keydown', alTeclado, true);
            document.removeEventListener('keyup', alTeclado, true);
            window.removeEventListener('blur', alSalir);
        };

        el.addEventListener('mousedown', (ev) => {
            const mac = /Mac|iPod|iPhone|iPad/.test(navigator.platform || '');
            if (!(mac ? ev.metaKey : ev.ctrlKey) || ev.altKey || ev.button !== 0) return;
            let q = null;
            try {
                q = nombreEn(cm, cm.coordsChar({ left: ev.clientX, top: ev.clientY }, 'window'), false);
            } catch (e) { return; }
            if (!q) return;
            if (vaADefinicion(cm, q)) { ev.preventDefault(); ev.stopPropagation(); }
        }, true);
        cm.on('changes', () => { cierraPanelDoc(); quitaEnlace(cm); });
        cm.on('scroll', () => { cierraPanelDoc(); quitaEnlace(cm); });
    }

    function hintList(items, typedLc, from, to) {
        const list = items
            .map(it => ({ it, rank: hintRank(it.text, typedLc) }))
            .filter(x => x.rank !== -1)
            .sort((a, b) => a.rank - b.rank
                || ((b.it.propio ? 1 : 0) - (a.it.propio ? 1 : 0))
                || String(a.it.text).localeCompare(String(b.it.text)))
            .map(x => ({
                text: x.it.text,
                nsftDoc: x.it.doc || null,
                nsftNombre: x.it.text,
                nsftKind: x.it.kind || 'prop',
                nsftIcono: HINT_ICONO[x.it.kind] || '·',
                nsftSig: x.it.sig || '',
                nsftTag: x.it.tag || '',
                render: (el) => hintRow(el, x.it, typedLc)
            }));
        if (!list.length) return null;

        const data = { list: list, from: from, to: to };
        try {
            CodeMirror.on(data, 'select', (item, node) => pintaPanelDoc(item, node));
            CodeMirror.on(data, 'close', cierraPanelDoc);
        } catch (e) { }
        return data;
    }


    function saltaNoCodigo(txt, i) {
        const c = txt[i];
        if (c === '"' || c === "'" || c === '`') {
            for (let j = i + 1; j < txt.length; j++) {
                if (txt[j] === '\\') { j++; continue; }
                if (txt[j] === c) return j + 1;
            }
            return txt.length;
        }
        if (c === '/' && txt[i + 1] === '/') {
            const n = txt.indexOf('\n', i);
            return n === -1 ? txt.length : n + 1;
        }
        if (c === '/' && txt[i + 1] === '*') {
            const n = txt.indexOf('*/', i + 2);
            return n === -1 ? txt.length : n + 2;
        }
        return i;
    }

    function cuerpoLiteral(txt, abre) {
        let prof = 0;
        for (let i = abre; i < txt.length;) {
            const salto = saltaNoCodigo(txt, i);
            if (salto !== i) { i = salto; continue; }
            const c = txt[i];
            if (c === '{' || c === '[') prof++;
            else if (c === '}' || c === ']') {
                prof--;
                if (prof === 0) {
                    if (i - abre > 20000) return null;
                    return { cuerpo: txt.slice(abre + 1, i), fin: i + 1 };
                }
            }
            i++;
        }
        return null;
    }

    function tipoDeValor(v) {
        const t = v.replace(/^[\s]+/, '');
        if (!t) return '';
        const c = t[0];
        if (c === '{') return 'js:Object';
        if (c === '[') return 'js:Array';
        if (c === '"' || c === "'" || c === '`') return 'js:String';
        if (/^(?:true|false)\b/.test(t)) return 'js:Boolean';
        if (/^-?\d/.test(t)) return 'js:Number';
        if (/^new\s+Date\b/.test(t)) return 'js:Date';
        return '';
    }

    function clavesDelCuerpo(cuerpo, hondura) {
        const out = [];
        if (hondura > 4) return out;
        let prof = 0;
        let ini = 0;
        const trozos = [];
        for (let i = 0; i < cuerpo.length;) {
            const salto = saltaNoCodigo(cuerpo, i);
            if (salto !== i) { i = salto; continue; }
            const c = cuerpo[i];
            if (c === '{' || c === '[' || c === '(') prof++;
            else if (c === '}' || c === ']' || c === ')') prof--;
            else if (c === ',' && prof === 0) { trozos.push(cuerpo.slice(ini, i)); ini = i + 1; }
            i++;
        }
        trozos.push(cuerpo.slice(ini));

        trozos.forEach((tr) => {
            let limpio = tr;
            for (;;) {
                const antes = limpio;
                limpio = limpio.replace(/^\s*\/\*[\s\S]*?\*\//, '').replace(/^\s*\/\/[^\n]*/, '');
                if (limpio === antes) break;
            }
            const m = limpio.match(/^\s*(?:([A-Za-z_$][\w$]*)|['"]([^'"]+)['"])\s*:/);
            if (!m) return;
            const nombre = m[1] || m[2];
            const valor = limpio.slice(m[0].length);
            const tipo = tipoDeValor(valor);
            const e = { n: nombre, t: tipo };
            if (tipo === 'js:Object') {
                const abre = valor.indexOf('{');
                const cur = abre >= 0 ? cuerpoLiteral(valor, abre) : null;
                if (cur) e.hijos = clavesDelCuerpo(cur.cuerpo, hondura + 1);
            }
            out.push(e);
        });
        return out;
    }

    function clavesDeLiterales(doc) {
        const mapa = Object.create(null);
        const re = /([A-Za-z_$][\w$]*)\s*=\s*\{/g;
        let m;
        while ((m = re.exec(doc))) {
            const abre = m.index + m[0].length - 1;
            const cur = cuerpoLiteral(doc, abre);
            if (!cur) continue;
            const claves = clavesDelCuerpo(cur.cuerpo, 0);
            if (claves.length) mapa[m[1]] = claves;
            re.lastIndex = cur.fin;
        }
        return mapa;
    }

    function clavesDeRuta(tipos, previo) {
        const mapa = tipos && tipos[CLAVES_PROP];
        if (!mapa) return null;
        const m = String(previo).match(/([A-Za-z_$][\w$]*(?:\s*\.\s*[A-Za-z_$][\w$]*)*)\s*$/);
        if (!m) return null;
        const partes = m[1].split('.').map((x) => x.trim()).filter(Boolean);
        let nivel = mapa[partes[0]];
        if (!nivel) return null;
        for (let i = 1; i < partes.length; i++) {
            const hit = nivel.find((e) => e.n === partes[i]);
            if (!hit || !hit.hijos) return null;
            nivel = hit.hijos;
        }
        return nivel.length ? nivel : null;
    }

    const CLAVES_PROP = '__nsftClaves';

    function locales(cm) {
        let gen = -1;
        try { gen = cm.changeGeneration(); } catch (e) { gen = -1; }
        const hit = cacheLee(cm, '_nsftLocales', gen);
        if (hit) return hit;

        const out = Object.create(null);
        try {
            const doc = cm.getValue();

            try {
                Object.defineProperty(out, CLAVES_PROP, {
                    value: clavesDeLiterales(doc), enumerable: false, configurable: true
                });
            } catch (e) { }

            const reNew = /([A-Za-z_$][\w$]*)\s*=\s*(?:await\s+)?new\s+([A-Za-z_$][\w$]*)\s*\(/g;
            let m;
            while ((m = reNew.exec(doc))) {
                if (JS_CON_INSTANCIA.indexOf(m[2]) >= 0) out[m[1]] = 'js:' + m[2];
            }

            const reLit = /([A-Za-z_$][\w$]*)\s*=\s*(['"`\[{]|\d|true\b|false\b)/g;
            while ((m = reLit.exec(doc))) {
                if (out[m[1]]) continue;
                const c = m[2];
                out[m[1]] = (c === '[') ? 'js:Array'
                    : (c === '{') ? 'js:Object'
                    : (c === 'true' || c === 'false') ? 'js:Boolean'
                    : /\d/.test(c) ? 'js:Number'
                    : 'js:String';
            }

            const reLlam = /([A-Za-z_$][\w$]*)\s*=\s*(?:await\s+)?([A-Za-z_$][\w$]*)\s*\.\s*([A-Za-z_$][\w$]*)\s*\(/g;

            const reSuelta = /([A-Za-z_$][\w$]*)\s*=\s*(?:await\s+)?([A-Za-z_$][\w$]*)\s*\(/g;
            const propias = firmasDelDocumento(cm);

            const puntos = (_api2 && _api2.puntos) || {};
            Object.keys(propias).forEach((n) => {
                const ctx = puntos[n];
                const f = propias[n];
                if (!ctx || !f.p || !f.p.length) return;
                if (!out[f.p[0].n]) out[f.p[0].n] = ctx;
            });

            Object.keys(propias).forEach((n) => {
                (propias[n].p || []).forEach((par) => {
                    if (par.t && !TIPO_VAGO.test(par.t) && !out[par.n]) out[par.n] = par.t;
                });
            });

            const reArgs = /([A-Za-z_$][\w$]*)\s*\(([^)]*)\)/g;

            const reDestruct = /\b(?:const|let|var)\s*\{([^}]*)\}\s*=\s*([A-Za-z_$][\w$]*)/g;

            const reProp = /([A-Za-z_$][\w$]*)\s*=\s*([A-Za-z_$][\w$]*)\s*\.\s*([A-Za-z_$][\w$]*)(?![ \t]*[\w$.(])/g;

            for (let vuelta = 0; vuelta < 3; vuelta++) {
                let nuevos = 0;

                reDestruct.lastIndex = 0;
                while ((m = reDestruct.exec(doc))) {
                    const tipoBase = out[m[2]];
                    if (!tipoBase) continue;
                    m[1].split(',').forEach((trozo) => {
                        const partes = trozo.split(':');
                        const clave = partes[0].replace(/[^\w$]/g, '');
                        const local = (partes[1] || partes[0]).split('=')[0].replace(/[^\w$]/g, '');
                        if (!clave || !local || out[local]) return;
                        const g = firmaApi(tipoBase, clave, cm);
                        if (g && g.r) { out[local] = g.r; nuevos++; }
                    });
                }

                reProp.lastIndex = 0;
                while ((m = reProp.exec(doc))) {
                    if (out[m[1]]) continue;
                    if (doc.charAt(m.index - 1) === '.') continue;
                    const porDoc = out[m[2] + '.' + m[3]];
                    if (porDoc) { out[m[1]] = porDoc; nuevos++; continue; }
                    const baseProp = out[m[2]];
                    if (!baseProp || baseProp.indexOf('js:') === 0) continue;
                    const gp = firmaApi(baseProp, m[3], cm);
                    if (gp && gp.r) { out[m[1]] = gp.r; nuevos++; }
                }

                reArgs.lastIndex = 0;
                while ((m = reArgs.exec(doc))) {
                    const f = propias[m[1]];
                    if (!f || !f.p || !f.p.length) continue;
                    const args = m[2].split(',');
                    f.p.forEach((par, i) => {
                        if (out[par.n]) return;
                        if (par.t && !TIPO_VAGO.test(par.t)) return;
                        const a = (args[i] || '').trim();
                        if (!a) return;
                        let t = tipoDeExpresion(a, out);
                        if (!t) {
                            const mm = a.match(/^([A-Za-z_$][\w$]*)\s*\.\s*([A-Za-z_$][\w$]*)$/);
                            if (mm && out[mm[1]]) {
                                const g = firmaApi(out[mm[1]], mm[2], cm);
                                if (g && g.r) t = g.r;
                            }
                        }
                        if (t) { out[par.n] = t; nuevos++; }
                    });
                }

                reSuelta.lastIndex = 0;
                while ((m = reSuelta.exec(doc))) {
                    if (out[m[1]]) continue;
                    const f = firmaGlobal(m[2], cm) || propias[m[2]];
                    if (!f) continue;
                    let t = (f.r && !TIPO_VAGO.test(f.r)) ? f.r : null;
                    if (!t && f.rv && out[f.rv]) t = out[f.rv];
                    if (t) { out[m[1]] = t; nuevos++; }
                }

                reLlam.lastIndex = 0;
                while ((m = reLlam.exec(doc))) {
                    const destino = m[1], base = m[2], metodo = m[3];
                    if (out[destino]) continue;

                    const t = _retornos[base + '.' + metodo]
                        || JS_RETORNOS[base + '.' + metodo]
                        || (firmaApi(base, metodo, cm) || {}).r
                        || ((out[base] && firmaApi(out[base], metodo, cm)) || {}).r
                        || retornoNativo(out[base], metodo);
                    if (t) { out[destino] = tipoJsDelRetorno(t); nuevos++; }
                }
                if (!nuevos) break;
            }

            reSuelta.lastIndex = 0;
            while ((m = reSuelta.exec(doc))) {
                if (out[m[1]]) continue;
                const f = firmaGlobal(m[2], cm) || propias[m[2]];
                if (f && f.r) out[m[1]] = tipoJsDelRetorno(f.r);
            }
        } catch (e) { }

        return cacheEscribe(cm, '_nsftLocales', gen, out);
    }

    function tipoDeExpresion(texto, locs) {
        const t = String(texto || '').replace(/\s+$/, '');
        if (!t) return null;

        const fin = t.charAt(t.length - 1);
        if (fin === "'" || fin === '"' || fin === '`') return 'js:String';
        if (fin === ']') return 'js:Array';
        if (fin === '/' && /[^\s(=]\/$/.test(t)) return 'js:RegExp';

        if (t.charAt(t.length - 1) === ')') {
            let prof = 0, i = t.length - 1;
            for (; i >= 0; i--) {
                const ch = t.charAt(i);
                if (ch === ')') prof++;
                else if (ch === '(') { prof--; if (prof === 0) break; }
            }
            if (i < 0) return null;
            const antes = t.slice(0, i).replace(/\s+$/, '');

            const nuevo = antes.match(/\bnew\s+([A-Za-z_$][\w$]*)$/);
            if (nuevo && JS_CON_INSTANCIA.indexOf(nuevo[1]) >= 0) return 'js:' + nuevo[1];

            const m = antes.match(/([A-Za-z_$][\w$]*)\s*\.\s*([A-Za-z_$][\w$]*)$/);
            if (!m) return null;
            return tipoJsDelRetorno(_retornos[m[1] + '.' + m[2]] || JS_RETORNOS[m[1] + '.' + m[2]] || null);
        }

        const conPunto = t.match(/([A-Za-z_$][\w$]*)\s*\.\s*([A-Za-z_$][\w$]*)$/);
        if (conPunto && locs[conPunto[1] + '.' + conPunto[2]]) return locs[conPunto[1] + '.' + conPunto[2]];

        const v = t.match(/([A-Za-z_$][\w$]*)$/);
        return v ? (locs[v[1]] || null) : null;
    }

    function hint(cm) {
        const cur = cm.getCursor();
        if (!esCodigo(cm, cur.line, Math.max(0, cur.ch - 1))) return null;
        const lineText = cm.getLine(cur.line).slice(0, cur.ch);
        const soloApi = apiDelEditor(cm);

        const chain = lineText.match(/([A-Za-z_$][\w$]*)(?:\s*\.\s*([A-Za-z_$][\w$]*))?\s*\.\s*([\w$]*)$/);
        if (chain) {
            const typed = chain[3] || '';
            const from = { line: cur.line, ch: cur.ch - typed.length };
            const to = { line: cur.line, ch: cur.ch };
            const typedLc = typed.toLowerCase();

            if (chain[2] && soloApi !== '1') {
                const subs = (_subMembers[chain[1]] || {})[chain[2]];
                if (subs && subs.length) {
                    const got = hintList(subs.map(n => ({ text: n, kind: 'const' })), typedLc, from, to);
                    if (got) return got;
                }
            }
            const base = chain[2] || chain[1];

            const mods = (soloApi === '1') ? null : _members[base];
            const jsm = mods ? null : jsEstaticosDe(base);
            if (jsm && jsm.length) {
                const got = hintList(jsm.map((x) => ({
                    text: x.n, kind: x.t === 'f' ? 'fn' : 'prop', tag: 'js'
                })), typedLc, from, to);
                if (got) return got;
            }

            const members = mods;
            if (members && members.length) {
                const items = members.map(x => {
                    const f = firmaApi(base, x.n, cm);
                    return {
                        text: x.n,
                        kind: x.t === 'f' ? 'fn' : (x.t === 'o' ? 'enum' : 'prop'),
                        sig: x.t === 'f' ? textoFirma(f) : '',
                        tag: etiquetaMiembro(base, x, f),
                        doc: f
                    };
                });
                const got = hintList(items, typedLc, from, to);
                if (got) return got;
            }
        }

        const punto = lineText.match(/\.\s*([\w$]*)$/);
        if (punto) {
            const typed = punto[1] || '';
            const from = { line: cur.line, ch: cur.ch - typed.length };
            const to = { line: cur.line, ch: cur.ch };
            const desde = { line: Math.max(0, cur.line - 40), ch: 0 };
            const previo = cm.getRange(desde, { line: cur.line, ch: cur.ch - punto[0].length });
            const tipo = tipoJsDelRetorno(tipoDeExpresion(previo, locales(cm)));
            const esJs = tipo && tipo.indexOf('js:') === 0;
            const miembros = tipo && (esJs ? jsMiembrosDe(tipo.slice(3))
                : (_tipos[tipo] && _tipos[tipo].length ? _tipos[tipo] : miembrosDelCatalogo(tipo)));
            const clavesTuyas = clavesDeRuta(locales(cm), previo) || [];
            const itemsClaves = clavesTuyas.map((k) => ({
                text: k.n,
                kind: 'prop',
                sig: '',
                tag: k.t ? (k.t.indexOf('js:') === 0 ? k.t.slice(3) : k.t) : 'clave',
                doc: null,
                propio: true
            }));

            {
                const etiqueta = esJs && tipo ? tipo.slice(3) : tipo;
                const items = (miembros || []).map(x => {
                    const f = esJs ? null : firmaApi(tipo, x.n, cm);
                    const etq = x.rama || tipo;
                    return {
                        text: x.n,
                        kind: x.t === 'f' ? 'fn' : (x.t === 'o' ? 'enum' : 'prop'),
                        sig: (!esJs && x.t === 'f') ? textoFirma(f) : '',
                        tag: esJs ? etiqueta : (x.t === 'f' ? (etiquetaMiembro(etq, x, f) || 'fn') : (x.t === 'o' ? 'enum' : etq)),
                        doc: f
                    };
                });
                const todos = itemsClaves.concat(items);
                if (todos.length) {
                    const got = hintList(todos, typed.toLowerCase(), from, to);
                    if (got) return got;
                }
            }
        }
        if (chain) return null;

        const w = lineText.match(/([A-Za-z_$][\w$]*)$/);
        const typed = w ? w[1] : '';
        if (!typed) return null;
        const from = { line: cur.line, ch: cur.ch - typed.length };
        const to = { line: cur.line, ch: cur.ch };
        const propias = firmasDelDocumento(cm);
        const suyos = locales(cm);
        const mios = [];
        Object.keys(propias).forEach((n) => {
            const f = propias[n];
            mios.push({ text: n, kind: 'fn', sig: textoFirma(f), tag: f.r ? '→ ' + f.r : 'fn', doc: f, propio: true });
        });
        parametrosAqui(cm, cur.line).forEach((x) => {
            if (propias[x.n] || suyos[x.n]) return;
            mios.push({ text: x.n, kind: 'prop', tag: x.t && x.t !== 'any' ? x.t : 'param', propio: true });
        });

        Object.keys(suyos).forEach((n) => {
            if (propias[n]) return;
            const t = suyos[n];
            mios.push({ text: n, kind: 'prop', tag: t.indexOf('js:') === 0 ? t.slice(3) : t, propio: true });
        });

        const alias = aliasDelDocumento(cm);
        Object.keys(alias).forEach((n) => {
            if (propias[n] || suyos[n]) return;
            mios.push({ text: n, kind: 'mod', tag: alias[n], propio: true });
        });

        const modulos = (soloApi === '1') ? [] : CANDIDATOS
            .filter(c => !_disponibles || _disponibles.indexOf(c.path) >= 0)
            .map(c => ({ text: c.alias, kind: 'mod', tag: c.path }));
        const globales1 = (soloApi === '2') ? [] : _nlapi;

        const items = mios.concat(modulos)
            .concat(globales1.map(n => {
                const f = firmaGlobal(n, cm);
                const sig = textoFirma(f) || (_nlapiArgs[n] ? '(' + _nlapiArgs[n] + ')' : '');
                return { text: n, kind: 'fn', sig: sig, tag: f && f.r ? '→ ' + f.r : '1.0', doc: f };
            }))
            .concat(JS_GLOBALES)
            .concat(JS_PALABRAS);
        return hintList(items, typed.toLowerCase(), from, to);
    }

    const PAREJA = { ')': '(', ']': '[', '}': '{' };
    const _lintPend = Object.create(null);

    function localizaDesparejado(codigo) {
        const s = String(codigo || '');
        const pila = [];
        let i = 0, ln = 0, ch = 0;
        const avanza = (n) => {
            for (let k = 0; k < n && i < s.length; k++, i++) {
                if (s.charAt(i) === '\n') { ln++; ch = 0; } else ch++;
            }
        };
        while (i < s.length) {
            const c = s.charAt(i), d = s.charAt(i + 1);
            if (c === '/' && d === '/') { const j = s.indexOf('\n', i); avanza((j < 0 ? s.length : j) - i); continue; }
            if (c === '/' && d === '*') { const j = s.indexOf('*/', i + 2); avanza((j < 0 ? s.length : j + 2) - i); continue; }
            if (c === '"' || c === '\'' || c === '`') {
                let k = i + 1;
                while (k < s.length) {
                    if (s.charAt(k) === '\\') { k += 2; continue; }
                    if (s.charAt(k) === c) { k++; break; }
                    k++;
                }
                avanza(k - i); continue;
            }
            if (c === '(' || c === '[' || c === '{') { pila.push({ c, ln, ch }); avanza(1); continue; }
            if (c === ')' || c === ']' || c === '}') {
                const arriba = pila.pop();
                if (!arriba) {
                    return { line: ln, msg: i18n('ssc_lint_sobra', 'There is a “$1” with nothing open to close', [c]) };
                }
                if (arriba.c !== PAREJA[c]) {
                    return {
                        line: arriba.ln,
                        msg: i18n('ssc_lint_cruzado', '“$1” opened here is closed with “$2”', [arriba.c, c])
                    };
                }
                avanza(1); continue;
            }
            avanza(1);
        }
        if (pila.length) {
            const t = pila[pila.length - 1];
            return { line: t.ln, msg: i18n('ssc_lint_falta', '“$1” is never closed', [t.c]) };
        }
        return null;
    }

    function lineaDelMensaje(codigo, mensaje) {
        const m = String(mensaje || '').match(/[\u2018\u2019\'"`]([^\u2018\u2019\'"`]{1,60})[\u2018\u2019\'"`]/);
        if (!m) return null;
        const trozo = m[1].trim();
        if (!trozo) return null;
        const lineas = String(codigo).split(/\r?\n/);
        for (let i = 0; i < lineas.length; i++) {
            if (lineas[i].indexOf(trozo) >= 0) return i;
        }
        return null;
    }

    function checkSyntax(codigo, cb) {
        const tk = ++_token;
        _lintPend[tk] = (p) => {
            if (p.ok) { cb({ ok: true }); return; }
            const donde = localizaDesparejado(codigo);
            if (donde) { cb({ ok: false, msg: donde.msg, line: donde.line }); return; }
            const msg = p.message || '';
            cb({ ok: false, msg: msg, line: lineaDelMensaje(codigo, msg) });
        };
        post({ dest: FETCHER_DEST, type: 'check', payload: { code: codigo, token: tk } });
        return tk;
    }

    let _ghostOn = true;
    let _ghostMaster = true;
    let _ghostScopeSsc = true;
    let _ghostScopeAdv = true;
    let _ghostSeq = 0;
    const _ghostPend = Object.create(null);
    const _ghostInst = [];

    try {
        chrome.storage.local.get({
            suitescriptConsoleAiComplete: true, enableAiAssistant: true,
            aiAssistantConsole: true, aiAssistantAdv: true
        }, (it) => {
            _ghostOn = it.suitescriptConsoleAiComplete !== false;
            _ghostMaster = it.enableAiAssistant !== false;
            _ghostScopeSsc = it.aiAssistantConsole !== false;
            _ghostScopeAdv = it.aiAssistantAdv !== false;
            _ghostInst.forEach((g) => g.pintaBoton());
        });
        chrome.storage.onChanged.addListener((ch, area) => {
            if (area !== 'local') return;
            if (!ch.suitescriptConsoleAiComplete && !ch.enableAiAssistant
                && !ch.aiAssistantConsole && !ch.aiAssistantAdv) return;
            if (ch.suitescriptConsoleAiComplete) {
                _ghostOn = ch.suitescriptConsoleAiComplete.newValue !== false;
                if (!_ghostOn) _ghostInst.forEach((g) => g.limpia());
            }
            if (ch.enableAiAssistant) _ghostMaster = ch.enableAiAssistant.newValue !== false;
            if (ch.aiAssistantConsole) _ghostScopeSsc = ch.aiAssistantConsole.newValue !== false;
            if (ch.aiAssistantAdv) _ghostScopeAdv = ch.aiAssistantAdv.newValue !== false;
            _ghostInst.forEach((g) => { if (!g.activo()) g.limpia(); g.pintaBoton(); });
        });
    } catch (e) { }

    function ghostDebug() {
        try { console.debug.apply(console, ['[NSFT] ghost:'].concat([].slice.call(arguments))); } catch (e) { }
    }

    window.addEventListener('nsft-ssc-ai-complete-result', (ev) => {
        const d = ev && ev.detail;
        if (!d) return;
        const g = _ghostPend[d.id];
        if (!g) { ghostDebug(d.id, 'respuesta huérfana (el pedido ya no espera)'); return; }
        delete _ghostPend[d.id];
        g.recibe(d);
    });

    function crearGhost(cm, opts) {
        const g = {
            timer: null,
            pedido: null,
            visible: null
        };

        g.enSuCasa = () => (opts.ambitoIa === 'adv' ? _ghostScopeAdv : _ghostScopeSsc);

        g.activo = () => _ghostOn && _ghostMaster && g.enSuCasa();

        g.pintaBoton = () => {
            const btn = opts.ghostButton;
            if (!btn) return;
            btn.hidden = !(_ghostMaster && g.enSuCasa());
            btn.classList.toggle('is-off', !_ghostOn);
            btn.classList.toggle('is-on', _ghostOn);
            btn.classList.toggle('is-busy', !!g.pedido);
        };

        g.limpia = () => {
            clearTimeout(g.timer);
            if (g.pedido) { delete _ghostPend[g.pedido.id]; g.pedido = null; }
            if (g.visible) {
                try { g.visible.mark.clear(); } catch (e) { }
                if (g.visible.widget) { try { g.visible.widget.clear(); } catch (e) { } }
                g.visible = null;
            }
            g.pintaBoton();
        };

        g.acepta = () => {
            if (!g.visible) return false;
            const texto = g.visible.text;
            const cur = cm.getCursor();
            g.limpia();
            const resto = cm.getLine(cur.line).slice(cur.ch);
            let k = 0;
            while (k < resto.length && k < 4
                && ')]}\'"`'.indexOf(resto.charAt(k)) >= 0
                && texto.indexOf(resto.charAt(k)) >= 0) k++;
            cm.replaceRange(texto, cur, { line: cur.line, ch: cur.ch + k }, '+nsftGhost');
            clearTimeout(g.timer);
            g.timer = setTimeout(g.pide, 250);
            return true;
        };

        g.muestra = (texto) => {
            g.limpia();
            const lineas = String(texto).split('\n');
            const cur = cm.getCursor();
            const span = document.createElement('span');
            span.className = 'nsft-ssc-ghost';
            span.textContent = lineas[0];
            const mark = cm.setBookmark(cur, { widget: span, insertLeft: false });
            let widget = null;
            let alto = 0;
            if (lineas.length > 1) {
                const block = document.createElement('pre');
                block.className = 'nsft-ssc-ghost nsft-ssc-ghost-block';
                block.textContent = lineas.slice(1).join('\n');
                widget = cm.addLineWidget(cur.line, block);
                alto = block.offsetHeight || 0;
            }
            g.visible = { mark, widget, text: texto };
            try { cm.scrollIntoView({ line: cur.line, ch: cur.ch }, alto + 24); } catch (e) { }
        };

        g.pide = () => {
            if (!g.activo()) { ghostDebug('el asistente está apagado en el popup'); return; }
            if (!cm.hasFocus() || cm.somethingSelected()) { ghostDebug('sin foco o con selección'); return; }
            if (cm.state.completionActive) { ghostDebug('desplegable abierto'); return; }
            const cur = cm.getCursor();
            const prefix = cm.getRange({ line: 0, ch: 0 }, cur);
            if (!prefix.trim()) { ghostDebug('documento vacío'); return; }
            const finDoc = { line: cm.lastLine(), ch: cm.getLine(cm.lastLine()).length };
            const suffix = cm.getRange(cur, finDoc);
            const id = 'g' + (++_ghostSeq);
            g.pedido = { id, gen: cm.changeGeneration(), line: cur.line, ch: cur.ch };
            _ghostPend[id] = g;
            window.dispatchEvent(new CustomEvent('nsft-ssc-ai-complete', {
                detail: {
                    id,
                    prefix: prefix.slice(-3000),
                    suffix: suffix.slice(0, 800),
                    line: cm.getLine(cur.line).slice(0, cur.ch)
                }
            }));
            ghostDebug('pedido', id);
            g.pintaBoton();
            setTimeout(() => {
                if (g.pedido && g.pedido.id === id) {
                    delete _ghostPend[id];
                    g.pedido = null;
                    ghostDebug(id, 'caducó sin respuesta (15 s) — ¿el agente no está escuchando?');
                    g.pintaBoton();
                }
            }, 15000);
        };

        g.recibe = (d) => {
            const p = g.pedido;
            g.pedido = null;
            g.pintaBoton();
            if (!p) return;
            if (!d.ok || !d.text) { ghostDebug(d.id, 'el agente contestó sin sugerencia'); return; }
            const cur = cm.getCursor();
            if (cm.changeGeneration() !== p.gen || cur.line !== p.line || cur.ch !== p.ch) {
                ghostDebug(d.id, 'descartada: el texto o el cursor se movieron mientras viajaba');
                return;
            }
            if (!cm.hasFocus()) { ghostDebug(d.id, 'descartada: el editor perdió el foco'); return; }
            ghostDebug(d.id, 'mostrada (' + d.text.length + ' chars)');
            g.muestra(String(d.text));
        };

        g.programa = () => {
            clearTimeout(g.timer);
            if (!g.activo()) return;
            g.timer = setTimeout(g.pide, 800);
        };

        g.toggle = () => {
            try { chrome.storage.local.set({ suitescriptConsoleAiComplete: !_ghostOn }); } catch (e) { }
        };

        _ghostInst.push(g);
        return g;
    }



    let _keymap = 'vscode';
    const _editores = [];

    function remapea() {
        _editores.forEach((x) => {
            try { x.cm.setOption('extraKeys', mezclaTeclas(x.propios)); }
            catch (err) { }
        });
    }

    function registraEditor(cm, propios) {
        if (!cm) return function () { };
        const vivo = { cm: cm, propios: propios || {} };
        _editores.push(vivo);
        try { cm.setOption('extraKeys', mezclaTeclas(vivo.propios)); }
        catch (err) { }
        return function () {
            const i = _editores.indexOf(vivo);
            if (i >= 0) _editores.splice(i, 1);
        };
    }

    try {
        chrome.storage.local.get({
            codeEditorKeymap: 'vscode', codeEditorInlayHints: true, codeEditorLightLines: 800
        }, (it) => {
            _keymap = (it.codeEditorKeymap === 'webstorm') ? 'webstorm' : 'vscode';
            _inlay = it.codeEditorInlayHints !== false;
            _ligeroLineas = Number(it.codeEditorLightLines) || 0;
            remapea();
            repintaInlayTodos();
        });
        chrome.storage.onChanged.addListener((ch, area) => {
            if (area !== 'local') return;
            if (ch.codeEditorLightLines) {
                _ligeroLineas = Number(ch.codeEditorLightLines.newValue) || 0;
                repintaInlayTodos();
            }
            if (ch.codeEditorInlayHints) {
                _inlay = ch.codeEditorInlayHints.newValue !== false;
                repintaInlayTodos();
            }
            if (!ch.codeEditorKeymap) return;
            _keymap = (ch.codeEditorKeymap.newValue === 'webstorm') ? 'webstorm' : 'vscode';
            remapea();
        });
    } catch (err) { }

    function atajosEdicion() {
        return (_keymap === 'webstorm') ? atajosWebStorm() : atajosVsCode();
    }

    function mezclaTeclas(propios) {
        const mapa = Object.assign({}, atajosEdicion(), propios || {});
        try { return CodeMirror.normalizeKeyMap(mapa); } catch (err) { return mapa; }
    }

    function atajosVsCode() {
        return {
            'Ctrl-/': (c) => c.toggleComment({ indent: true }),
            'Cmd-/': (c) => c.toggleComment({ indent: true }),
            'Alt-Up': (c) => mueveLineas(c, -1),
            'Alt-Down': (c) => mueveLineas(c, 1),
            'Shift-Alt-Up': (c) => duplicaLineas(c),
            'Shift-Alt-Down': (c) => duplicaLineas(c),
            'Shift-Ctrl-K': 'deleteLine',
            'Shift-Cmd-K': 'deleteLine',
            'Ctrl-D': (c) => seleccionaSiguiente(c),
            'Cmd-D': (c) => seleccionaSiguiente(c),
            'Shift-Ctrl-L': (c) => seleccionaTodas(c),
            'Shift-Cmd-L': (c) => seleccionaTodas(c),
            'Ctrl-Alt-Up': (c) => cursorEnLineaVecina(c, -1),
            'Ctrl-Alt-Down': (c) => cursorEnLineaVecina(c, 1)
        };
    }

    function atajosWebStorm() {
        return {
            'Ctrl-/': (c) => c.toggleComment({ indent: true }),
            'Cmd-/': (c) => c.toggleComment({ indent: true }),
            'Shift-Alt-Up': (c) => mueveLineas(c, -1),
            'Shift-Alt-Down': (c) => mueveLineas(c, 1),
            'Ctrl-D': (c) => duplicaLineas(c),
            'Cmd-D': (c) => duplicaLineas(c),
            'Ctrl-Y': 'deleteLine',
            'Cmd-Backspace': 'deleteLine',
            'Alt-J': (c) => seleccionaSiguiente(c),
            'Shift-Ctrl-Alt-J': (c) => seleccionaTodas(c),
            'Ctrl-Alt-Up': (c) => cursorEnLineaVecina(c, -1),
            'Ctrl-Alt-Down': (c) => cursorEnLineaVecina(c, 1)
        };
    }

    function ratonMultiCursor(cm, repeat, ev) {
        const mac = /Mac|iPod|iPhone|iPad/.test(navigator.platform || '');
        return { addNew: ev.altKey || (mac ? ev.metaKey : ev.ctrlKey) };
    }


    function extremos(r) {
        const a = r.anchor, h = r.head;
        return (CodeMirror.cmpPos(a, h) <= 0) ? { de: a, a: h } : { de: h, a: a };
    }

    function seleccionaSiguiente(cm) {
        if (!cm.somethingSelected()) {
            const w = cm.findWordAt(cm.getCursor());
            if (w) cm.setSelection(w.anchor, w.head);
            return;
        }
        const sels = cm.listSelections();
        const ult = extremos(sels[sels.length - 1]);
        const term = cm.getRange(ult.de, ult.a);
        if (!term) return;

        const texto = cm.getValue();
        let i = texto.indexOf(term, cm.indexFromPos(ult.a));
        if (i < 0) i = texto.indexOf(term);
        if (i < 0) return;

        const de = cm.posFromIndex(i);
        const a = cm.posFromIndex(i + term.length);
        for (let k = 0; k < sels.length; k++) {
            const s = extremos(sels[k]);
            if (CodeMirror.cmpPos(s.de, de) === 0 && CodeMirror.cmpPos(s.a, a) === 0) return;
        }
        cm.addSelection(de, a);
    }

    function seleccionaTodas(cm) {
        if (!cm.somethingSelected()) {
            const w = cm.findWordAt(cm.getCursor());
            if (w) cm.setSelection(w.anchor, w.head);
            if (!cm.somethingSelected()) return;
        }
        const r = extremos(cm.listSelections()[0]);
        const term = cm.getRange(r.de, r.a);
        if (!term) return;

        const texto = cm.getValue();
        const rangos = [];
        let i = texto.indexOf(term);
        while (i >= 0 && rangos.length < 500) {
            rangos.push({ anchor: cm.posFromIndex(i), head: cm.posFromIndex(i + term.length) });
            i = texto.indexOf(term, i + term.length);
        }
        if (rangos.length) cm.setSelections(rangos, rangos.length - 1);
    }

    function cursorEnLineaVecina(cm, dir) {
        const sels = cm.listSelections();
        const ref = (dir < 0) ? sels[0] : sels[sels.length - 1];
        const linea = ref.head.line + dir;
        if (linea < cm.firstLine() || linea > cm.lastLine()) return;
        const ch = Math.min(ref.head.ch, cm.getLine(linea).length);
        cm.addSelection({ line: linea, ch: ch }, { line: linea, ch: ch });
    }

    function tramoDeLineas(cm) {
        const r = cm.listSelections()[0];
        if (!r) return null;
        return {
            de: Math.min(r.anchor.line, r.head.line),
            a: Math.max(r.anchor.line, r.head.line),
            sel: r
        };
    }

    function mueveLineas(cm, dir) {
        if (cm.getOption('readOnly')) return CodeMirror.Pass;
        const t = tramoDeLineas(cm);
        if (!t) return CodeMirror.Pass;
        if (dir < 0 && t.de === cm.firstLine()) return;
        if (dir > 0 && t.a === cm.lastLine()) return;

        cm.operation(() => {
            let ini, fin;
            if (dir < 0) {
                ini = { line: t.de - 1, ch: 0 };
                fin = { line: t.a, ch: cm.getLine(t.a).length };
            } else {
                ini = { line: t.de, ch: 0 };
                fin = { line: t.a + 1, ch: cm.getLine(t.a + 1).length };
            }
            const partes = cm.getRange(ini, fin).split('\n');
            if (dir < 0) partes.push(partes.shift());
            else partes.unshift(partes.pop());
            cm.replaceRange(partes.join('\n'), ini, fin);

            cm.setSelection(
                { line: t.sel.anchor.line + dir, ch: t.sel.anchor.ch },
                { line: t.sel.head.line + dir, ch: t.sel.head.ch }
            );
        });
    }

    function duplicaLineas(cm) {
        if (cm.getOption('readOnly')) return CodeMirror.Pass;
        const t = tramoDeLineas(cm);
        if (!t) return CodeMirror.Pass;
        const n = t.a - t.de + 1;
        cm.operation(() => {
            const fin = { line: t.a, ch: cm.getLine(t.a).length };
            const bloque = cm.getRange({ line: t.de, ch: 0 }, fin);
            cm.replaceRange('\n' + bloque, fin);
            cm.setSelection(
                { line: t.sel.anchor.line + n, ch: t.sel.anchor.ch },
                { line: t.sel.head.line + n, ch: t.sel.head.ch }
            );
        });
    }


    const GUIA_MAX_HUECO = 60;

    function sangriaDe(cm, n) {
        const t = cm.getLine(n);
        if (t == null) return -1;
        if (!t.trim()) return -1;
        return CodeMirror.countColumn(t, null, cm.getOption('tabSize'));
    }

    function columnasGuia(cm, n) {
        const propia = sangriaDe(cm, n);
        if (propia >= 0) return propia;

        let arriba = -1;
        for (let i = n - 1; i >= 0 && n - i <= GUIA_MAX_HUECO; i--) {
            arriba = sangriaDe(cm, i);
            if (arriba >= 0) break;
        }
        let abajo = -1;
        const ultima = cm.lastLine();
        for (let i = n + 1; i <= ultima && i - n <= GUIA_MAX_HUECO; i++) {
            abajo = sangriaDe(cm, i);
            if (abajo >= 0) break;
        }
        if (arriba < 0 || abajo < 0) return 0;
        return Math.min(arriba, abajo);
    }


    const CLASE_OCURRENCIA = 'nsft-ocurrencia';

    const ESPERA_OCURRENCIAS = 250;

    function montaResaltePalabra(cm) {
        let capa = null;
        let ultima = '';
        let reloj = null;

        const quita = () => {
            if (capa) { try { cm.removeOverlay(capa); } catch (e) { } capa = null; }
            ultima = '';
        };

        const capaDe = (palabra) => ({
            token: (stream) => {
                if (stream.match(palabra)
                    && (stream.eol() || !/[\w$]/.test(stream.peek()))
                    && (stream.start === 0 || !/[\w$]/.test(stream.string.charAt(stream.start - 1)))) {
                    return CLASE_OCURRENCIA;
                }
                stream.next();
                if (!stream.skipTo(palabra.charAt(0))) stream.skipToEnd();
            }
        });

        const pon = (palabra) => {
            if (palabra === ultima) return;
            quita();
            ultima = palabra;
            capa = capaDe(palabra);
            try { cm.addOverlay(capa); } catch (e) { capa = null; ultima = ''; }
        };

        const vale = (s) => !!s && s.length > 1 && /^[A-Za-z_$][\w$]*$/.test(s);

        const revisa = () => {
            if (esLigero(cm)) { quita(); return; }
            let s;
            if (cm.somethingSelected()) {
                s = cm.getSelection();
            } else {
                const w = cm.findWordAt(cm.getCursor());
                s = cm.getRange(w.anchor, w.head);
            }
            if (!vale(s)) { quita(); return; }
            pon(s);
        };

        const programa = () => {
            clearTimeout(reloj);
            reloj = setTimeout(revisa, ESPERA_OCURRENCIAS);
        };

        cm.on('cursorActivity', programa);

        cm.on('changes', () => {
            if (capa) quita();
            programa();
        });
        programa();
    }

    function montaGuias(cm) {
        cm.on('renderLine', (ed, linea, el) => {
            let cols;
            try { cols = columnasGuia(ed, ed.getLineNumber(linea)); }
            catch (e) { return; }

            const unidad = ed.getOption('indentUnit') || 4;
            if (!cols || cols < unidad * 2) { el.style.backgroundImage = ''; return; }

            const paso = ed.defaultCharWidth() * unidad;
            if (!(paso > 0)) return;
            el.style.backgroundImage =
                'repeating-linear-gradient(to right,'
                + ' var(--nsft-guia, rgba(127, 127, 127, 0.16)) 0,'
                + ' var(--nsft-guia, rgba(127, 127, 127, 0.16)) 1px,'
                + ' transparent 1px, transparent ' + paso + 'px)';
            el.style.backgroundSize = ((cols - unidad) * ed.defaultCharWidth() + 1) + 'px 100%';
            el.style.backgroundRepeat = 'no-repeat';
            el.style.backgroundOrigin = 'content-box';
            el.style.backgroundClip = 'content-box';
        });

        const rehacer = () => { try { cm.refresh(); } catch (e) { } };
        cm.on('optionChange', (ed, op) => {
            if (op === 'indentUnit' || op === 'tabSize') rehacer();
        });
    }

    function attach(textarea, opts) {
        const o = opts || {};
        if (!textarea || typeof CodeMirror === 'undefined') return null;

        const pideCm6 = (o.engine === 'cm6' && !!window.NSFT_CM6_Adapter);
        let propios = null;

        const conf = {
            mode: (o.mode !== undefined ? o.mode : 'nsft-javascript'),
            theme: o.theme || (document.documentElement.getAttribute('data-nsft-theme') === 'dark'
                ? 'material-darker' : 'default'),
            lineNumbers: o.lineNumbers !== false,
            cursorScrollMargin: (o.cursorScrollMargin != null ? o.cursorScrollMargin : 80),
            configureMouse: ratonMultiCursor,
            matchBrackets: true,
            autoCloseBrackets: true,
            readOnly: !!o.readOnly,
            extraKeys: mezclaTeclas(propios = Object.assign({
                'Ctrl-Space': 'autocomplete',
                'F12': (c) => { if (!vaADefinicion(c, nombreEnCursor(c))) return CodeMirror.Pass; },
                'Tab': () => { if (!ghost.acepta()) return CodeMirror.Pass; },
                'Esc': (c) => {
                    if (ghost.visible) { ghost.limpia(); return; }
                    if (_panelSig) { callaSig(c); return; }
                    return CodeMirror.Pass;
                }
            }, o.extraKeys || {})),
            hintOptions: { hint: hint, completeSingle: false }
        };
        if (o.viewportMargin !== undefined) conf.viewportMargin = o.viewportMargin;

        if (o.folding && CodeMirror.fold && CodeMirror.fold.brace) {
            conf.foldGutter = true;
            conf.gutters = (conf.lineNumbers === false)
                ? ['CodeMirror-foldgutter']
                : ['CodeMirror-linenumbers', 'CodeMirror-foldgutter'];
            conf.extraKeys['Ctrl-Q'] = (c) => c.foldCode(c.getCursor());
        }

        let cm = null;
        if (pideCm6) {
            cm = window.NSFT_CM6_Adapter.crear(textarea, Object.assign({}, conf, {
                themeDark: !!o.themeDark,
                themeName: conf.theme || null,
                lineWrapping: !!o.lineWrapping,
                folding: !!o.folding,
                indentGuides: !!o.indentGuides,
                highlightWord: !!o.highlightWord
            }));
        }
        if (!cm) cm = CodeMirror.fromTextArea(textarea, conf);
        const esCm6 = (cm.nsftEngine === 'cm6');

        cm._nsftApiAuto = !!o.apiSegunArchivo;

        if (o.activeLine && !esCm6) {
            let lineaAct = null;
            const marca = () => {
                const l = cm.getCursor().line;
                if (l === lineaAct) return;
                if (lineaAct != null) {
                    try { cm.removeLineClass(lineaAct, 'background', 'nsft-ssc-active-line'); } catch (e) { }
                }
                try { cm.addLineClass(l, 'background', 'nsft-ssc-active-line'); lineaAct = l; }
                catch (e) { lineaAct = null; }
            };
            cm.on('cursorActivity', marca);
            marca();
        }

        if (o.indentGuides && !esCm6) montaGuias(cm);
        if (o.highlightWord && !esCm6) montaResaltePalabra(cm);

        const ghost = crearGhost(cm, o);
        watchHintsPopup();

        let lintTimer = null;
        const lintRevisa = () => {
            if (!o.onLint) return;
            const codigo = cm.getValue();
            if (!codigo.trim()) { o.onLint(null); return; }
            checkSyntax(codigo, (r) => {
                const mal = r.ok ? null : { msg: r.msg, line: r.line };
                cm._nsftLintMal = mal;
                o.onLint(mal);
            });
        };
        const lintPrograma = () => {
            clearTimeout(lintTimer);
            lintTimer = setTimeout(lintRevisa, 600);
        };
        if (o.onLint) cm.on('change', lintPrograma);

        cm.on('inputRead', ghost.programa);
        cm.on('endCompletion', ghost.programa);
        cm.on('change', (c, ch) => { if (ch.origin !== '+nsftGhost') ghost.limpia(); });
        cm.on('cursorActivity', () => { if (ghost.visible) ghost.limpia(); });
        cm.on('blur', ghost.limpia);

        cm.on('cursorActivity', () => programaSig(cm));
        cm.on('blur', () => { clearTimeout(cm._nsftSigTimer); cierraSig(); });
        cm.on('endCompletion', () => programaSig(cm));

        cm.on('changes', (c, cambios) => {
            marcaSucioInlay(c, cambios);
            if (huboBorrado(cambios)) tiraInlayCaducado(c);
            programaInlay(c);
        });
        cm.on('viewportChange', () => programaInlay(cm, true));
        montaHover(cm);
        programaInlay(cm);

        const trasPintar = (c) => {
            const raf = window.requestAnimationFrame || ((cb) => setTimeout(cb, 16));
            raf(() => setTimeout(() => {
                if (!c.hasFocus()) return;
                c.showHint({ completeSingle: false, extraKeys: TECLAS_TARJETA });
            }, 0));
        };

        if (!esCm6) cm.on('inputRead', (c, change) => {
            const typedCh = change.text[0];
            if (typedCh === '.') { trasPintar(c); return; }
            if (!/[\w$]/.test(typedCh || '')) return;
            if (c.state && c.state.completionActive) return;
            const tok = c.getTokenAt(c.getCursor());
            const word = tok && tok.string ? tok.string : '';
            if (word.length < 2 || !/^[a-z_$][\w$]*$/i.test(word)) return;
            trasPintar(c);
        });

        cm.on('swapDoc', () => {
            clearTimeout(cm._nsftSigTimer);
            cierraSig();
            cierraPanelDoc();
            quitaEnlace(cm);
            limpiaInlay(cm);
            cm._nsftInlayVp = null;
            cm._nsftInlaySucio = null;
            cm._nsftInlayTodo = false;
            programaInlay(cm, true);
        });

        if (typeof o.onChange === 'function') cm.on('change', o.onChange);

        const vivo = { cm: cm, propios: propios || {} };
        _editores.push(vivo);

        try {
            const campo = cm.getInputField();
            if (campo) {
                campo.setAttribute('spellcheck', 'false');
                campo.setAttribute('autocorrect', 'off');
                campo.setAttribute('autocapitalize', 'off');
                campo.setAttribute('autocomplete', 'off');
            }
            cm.getWrapperElement().setAttribute('spellcheck', 'false');
        } catch (e) { }

        prepare(o.onReady);
        cargaCatalogoApis();

        return {
            cm,
            ghost,
            refresh: () => { try { cm.refresh(); } catch (e) { } },
            destroy: () => {
                ghost.limpia();
                clearTimeout(cm._nsftSigTimer);
                clearTimeout(cm._nsftInlayTimer);
                cierraSig();
                cierraPanelDoc();
                quitaEnlace(cm);
                limpiaInlay(cm);
                if (typeof cm._nsftSueltaEnlace === 'function') cm._nsftSueltaEnlace();
                clearTimeout(lintTimer);
                const i = _ghostInst.indexOf(ghost);
                if (i >= 0) _ghostInst.splice(i, 1);
                const v = _editores.indexOf(vivo);
                if (v >= 0) _editores.splice(v, 1);
                try { cm.toTextArea(); } catch (e) { }
            }
        };
    }

    window.NSFT_CodeEditor = Object.freeze({
        CANDIDATOS,
        atajosEdicion,
        registraEditor,
        ratonMultiCursor,
        attach,
        prepare,
        onData,
        estado,
        hint,
        watchHintsPopup,
        checkSyntax,
        localizaDesparejado,
        appendHighlighted,
        hintRank,
        firmasDelDocumento,
        fichaDoc: (nombre, f) => {
            if (!f) return null;
            const caja = construyeDoc(nombre, f);
            caja.dataset.nsftOrigen = 'cm6';
            try { requestAnimationFrame(() => avisaSiNoCabe(caja)); } catch (e) { }
            return caja;
        },
        setPerfHook,
        versionApi
    });
})();
