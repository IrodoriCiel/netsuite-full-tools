(function () {
    'use strict';

    var esteScript = document.currentScript;
    var VERSION = (esteScript && esteScript.dataset && esteScript.dataset.version) || '';
    var LANG = (esteScript && esteScript.dataset && esteScript.dataset.lang) === 'es' ? 'es' : 'en';
    var L = function (es, en) { return LANG === 'es' ? es : en; };

    if (window.__nsftConsoleUtils) return;
    window.__nsftConsoleUtils = true;

    function hayRequire() { return typeof require === 'function'; }
    function haySs1() { return typeof nlapiGetRecordType === 'function'; }

    function N() {
        var mods = Array.prototype.slice.call(arguments);
        return new Promise(function (ok, ko) {
            if (!hayRequire()) {
                ko(new Error(L('Esta p\u00e1gina no tiene SuiteScript 2.1 (require).', 'This page has no SuiteScript 2.1 (require).')));
                return;
            }
            var rutas = mods.map(function (m) { m = String(m); return m.indexOf('N/') === 0 ? m : 'N/' + m; });
            require(rutas, function () {
                var r = Array.prototype.slice.call(arguments);
                ok(r.length === 1 ? r[0] : r);
            }, ko);
        });
    }

    function ss() {
        var r = rec();
        return { ss2: hayRequire(), ss1: haySs1(), record: !!(r.type || r.id) };
    }

    function rec() {
        var p = new URLSearchParams(location.search);
        var type = '', id = '';
        try {
            if (haySs1()) { type = nlapiGetRecordType() || ''; id = nlapiGetRecordId() || ''; }
        } catch (e) { }
        if (!type) {
            var b = document.querySelector('input[name="baserecordtype"]');
            var tp = document.querySelector('input[name="type"]');
            type = (b && b.value) || (p.get('rectype') ? 'rectype ' + p.get('rectype') : '')
                || ((tp && /^[a-z_]+$/.test(tp.value)) ? tp.value : '');
        }
        if (!id) id = p.get('id') || '';
        var edita = !!document.querySelector('#btn_multibutton_submitter, #submitter, input[name="submitter"]');
        return { type: type, id: id, mode: !id ? (edita ? 'create' : '') : (edita ? 'edit' : 'view') };
    }

    function conRegistro(fn1, fn2) {
        if (haySs1()) return fn1();
        return N('currentRecord').then(function (cr) { return fn2(cr.get()); });
    }
    function get(f) { return conRegistro(function () { return nlapiGetFieldValue(f); }, function (r) { return r.getValue({ fieldId: f }); }); }
    function text(f) { return conRegistro(function () { return nlapiGetFieldText(f); }, function (r) { return r.getText({ fieldId: f }); }); }
    function set(f, v) {
        return conRegistro(function () { nlapiSetFieldValue(f, v); return nlapiGetFieldValue(f); },
            function (r) { r.setValue({ fieldId: f, value: v }); return r.getValue({ fieldId: f }); });
    }

    function field(f) {
        if (!haySs1()) return null;
        var x = null;
        try { x = nlapiGetField(f); } catch (e) { x = null; }
        if (!x) return null;
        return {
            id: f,
            label: x.getLabel ? x.getLabel() : '',
            type: x.getType ? x.getType() : '',
            disabled: !!x.disabled,
            value: nlapiGetFieldValue(f),
            text: (function () { try { return nlapiGetFieldText(f); } catch (e) { return ''; } })()
        };
    }

    function line(sub, f, n) {
        if (!haySs1()) return undefined;
        return n == null ? nlapiGetCurrentLineItemValue(sub, f) : nlapiGetLineItemValue(sub, f, n);
    }
    function lines(sub) { return haySs1() ? nlapiGetLineItemCount(sub) : undefined; }

    function load(type, id) {
        var r = rec();
        return N('record').then(function (m) { return m.load({ type: type || r.type, id: id || r.id }); });
    }

    function sql(q, params) {
        return N('query').then(function (query) {
            return query.runSuiteQL({ query: String(q), params: params || [] }).asMappedResults();
        });
    }
    function table(q, params) {
        return sql(q, params).then(function (filas) { console.table(filas); return filas.length; });
    }

    function toast(msg, ms) {
        var d = document.createElement('div');
        d.textContent = String(msg);
        d.setAttribute('role', 'status');
        d.style.cssText = 'position:fixed;left:50%;bottom:28px;transform:translateX(-50%);z-index:2147483647;'
            + 'max-width:min(560px,90vw);padding:9px 14px;border-radius:9px;font:13px/1.4 system-ui,sans-serif;'
            + 'background:var(--nsft-text-1,#0f172a);color:var(--nsft-surface-0,#fff);box-shadow:0 10px 28px rgba(0,0,0,.3);'
            + 'white-space:pre-wrap;opacity:0;transition:opacity .15s';
        document.body.appendChild(d);
        requestAnimationFrame(function () { d.style.opacity = '1'; });
        setTimeout(function () { d.style.opacity = '0'; setTimeout(function () { d.remove(); }, 200); }, ms || 2600);
        return String(msg);
    }

    function copy(t) {
        var s = typeof t === 'string' ? t : JSON.stringify(t, null, 2);
        if (navigator.clipboard && navigator.clipboard.writeText) {
            return navigator.clipboard.writeText(s).then(function () { return true; }, function () { return copiaVieja(s); });
        }
        return Promise.resolve(copiaVieja(s));
    }
    function copiaVieja(s) {
        var ta = document.createElement('textarea');
        ta.value = s;
        ta.style.cssText = 'position:fixed;left:-9999px';
        document.body.appendChild(ta);
        ta.select();
        var ok = false;
        try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
        ta.remove();
        return ok;
    }


    function pliega(s) { return String(s == null ? '' : s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase(); }

    function idsDelCuerpo() {
        var vistos = {};
        var out = [];
        document.querySelectorAll('[data-field-name]').forEach(function (w) {
            var n = w.getAttribute('data-field-name');
            if (!n || vistos[n]) return;
            vistos[n] = true;
            var f = w.closest('form');
            var fid = f ? (f.getAttribute('id') || f.getAttribute('name') || '') : '';
            if (fid && fid !== 'main_form' && /_form$/.test(fid)) return;
            out.push(n);
        });
        return out;
    }

    function etiquetaDe(n) {
        var w = document.querySelector('[data-field-name="' + n + '"][data-nsps-label]');
        if (w) return w.getAttribute('data-nsps-label') || '';
        var l = document.getElementById(n + '_fs_lbl');
        return l ? String(l.textContent || '').replace(/\s+/g, ' ').trim() : '';
    }

    function fields(filtro) {
        var q = pliega(filtro || '');
        var filas = idsDelCuerpo().map(function (n) {
            var x = null;
            try { x = haySs1() ? nlapiGetField(n) : null; } catch (e) { x = null; }
            var fila = { id: n, label: etiquetaDe(n) || (x && x.getLabel ? x.getLabel() : ''), type: x && x.getType ? x.getType() : '' };
            try { fila.value = haySs1() ? nlapiGetFieldValue(n) : undefined; } catch (e) { fila.value = undefined; }
            try { fila.text = haySs1() ? nlapiGetFieldText(n) : undefined; } catch (e) { fila.text = undefined; }
            return fila;
        }).filter(function (f) { return !q || pliega(f.id).indexOf(q) >= 0 || pliega(f.label).indexOf(q) >= 0; });
        console.table(filas);
        return filas;
    }

    function sublist(sub, columnas) {
        var cols = Array.isArray(columnas) && columnas.length ? columnas : [];
        if (!cols.length) {
            var vistos = {};
            document.querySelectorAll('form[id="' + sub + '_form"] [data-field-name]').forEach(function (c) {
                var n = c.getAttribute('data-field-name');
                if (n && !vistos[n]) { vistos[n] = true; cols.push(n); }
            });
        }
        if (haySs1()) {
            var total = nlapiGetLineItemCount(sub);
            var filas = [];
            for (var i = 1; i <= total; i++) {
                var o = { line: i };
                cols.forEach(function (c) { try { o[c] = nlapiGetLineItemValue(sub, c, i); } catch (e) { o[c] = undefined; } });
                filas.push(o);
            }
            console.table(filas);
            return filas;
        }
        return N('currentRecord').then(function (cr) {
            var r = cr.get();
            var n = r.getLineCount({ sublistId: sub });
            var filas = [];
            for (var i = 0; i < n; i++) {
                var o = { line: i };
                cols.forEach(function (c) { try { o[c] = r.getSublistValue({ sublistId: sub, fieldId: c, line: i }); } catch (e) { o[c] = undefined; } });
                filas.push(o);
            }
            console.table(filas);
            return filas;
        });
    }

    function find(texto) {
        var q = pliega(texto);
        var hits = idsDelCuerpo().filter(function (n) { return pliega(n).indexOf(q) >= 0 || pliega(etiquetaDe(n)).indexOf(q) >= 0; })
            .map(function (n) { return { id: n, label: etiquetaDe(n) }; });
        if (!hits.length) { console.log('[NSFT] ' + L('Ning\u00fan campo con \u00ab', 'No field with \u201c') + texto + L('\u00bb en esta p\u00e1gina.', '\u201d on this page.')); return hits; }
        var w = document.querySelector('[data-field-name="' + hits[0].id + '"]');
        if (w) {
            var pest = w.closest('[data-nsps-type="subtab"], .formtabcontent, [id$="_div"]');
            try { if (pest && pest.style.display === 'none' && typeof ShowTab === 'function') ShowTab(pest.id.replace(/_div$/, ''), false); } catch (e) { }
            w.scrollIntoView({ block: 'center', behavior: 'smooth' });
            var antes = w.style.outline;
            w.style.outline = '3px solid #f59e0b';
            w.style.outlineOffset = '2px';
            setTimeout(function () { w.style.outline = antes; }, 2500);
        }
        console.table(hits);
        return hits;
    }


    function lookup(type, id, campos) {
        return N('search').then(function (search) {
            return search.lookupFields({ type: type, id: id, columns: Array.isArray(campos) ? campos : [campos] });
        });
    }

    function search(id, max) {
        return N('search').then(function (search) {
            var s = search.load({ id: id });
            var cols = s.columns;
            var nombre = function (c) { return c.label || (c.join ? c.join + '.' : '') + c.name; };
            var filas = s.run().getRange({ start: 0, end: Math.min(max || 1000, 1000) }).map(function (r) {
                var o = { id: r.id };
                cols.forEach(function (c) {
                    var v = r.getValue(c);
                    var t = r.getText(c);
                    o[nombre(c)] = (t && t !== v) ? t : v;
                });
                return o;
            });
            console.table(filas);
            return filas;
        });
    }


    function me() {
        var prefs = ['DATEFORMAT', 'TIMEFORMAT', 'NUMBERFORMAT', 'NEGATIVE_NUMBER_FORMAT', 'LANGUAGE', 'TIMEZONE'];
        if (hayRequire()) {
            return N('runtime').then(function (rt) {
                var u = rt.getCurrentUser();
                var o = { id: u.id, name: u.name, email: u.email, role: u.role, roleId: u.roleId, roleCenter: u.roleCenter, subsidiary: u.subsidiary, department: u.department, location: u.location };
                prefs.forEach(function (p) { try { o[p] = u.getPreference({ name: p }); } catch (e) { } });
                return o;
            });
        }
        if (typeof nlapiGetContext === 'function') {
            var c = nlapiGetContext();
            var o = { id: c.getUser(), name: c.getName(), email: c.getEmail(), role: c.getRole(), roleId: c.getRoleId(), subsidiary: c.getSubsidiary() };
            prefs.forEach(function (p) { try { o[p] = c.getPreference(p); } catch (e) { } });
            return Promise.resolve(o);
        }
        return Promise.reject(new Error(L('Esta p\u00e1gina no tiene SuiteScript.', 'This page has no SuiteScript.')));
    }

    function account() {
        var host = location.hostname;
        var m = /^([a-z0-9_-]+)\.app\.netsuite\.com$/i.exec(host);
        var cuentaUrl = m ? m[1].toUpperCase().replace(/-/g, '_') : '';
        var base = { host: host, nsft: VERSION, ss2: hayRequire(), ss1: haySs1() };
        if (!hayRequire()) {
            base.accountId = cuentaUrl;
            base.envType = /_SB\d*$|_RP$/.test(cuentaUrl) ? 'SANDBOX' : 'PRODUCTION';
            return Promise.resolve(base);
        }
        return N('runtime').then(function (rt) {
            base.accountId = rt.accountId;
            base.envType = rt.envType;
            base.suitescriptVersion = rt.version;
            return base;
        });
    }


    var _vigilados = {};
    var _setOriginal = null;
    function watch(f) {
        if (!f || _vigilados[f]) return L('Ya se vigila.', 'Already watched.');
        var valor = function () { try { return haySs1() ? nlapiGetFieldValue(f) : undefined; } catch (e) { return undefined; } };
        var ultimo = valor();
        var t = setInterval(function () {
            var v = valor();
            if (v !== ultimo) {
                console.log('%c[NSFT] ' + f + '%c ' + JSON.stringify(ultimo) + ' \u2192 ' + JSON.stringify(v) + '  ' + new Date().toLocaleTimeString(), 'color:#d97706;font-weight:bold', '');
                ultimo = v;
            }
        }, 250);
        _vigilados[f] = t;
        if (haySs1() && !_setOriginal && typeof window.nlapiSetFieldValue === 'function') {
            _setOriginal = window.nlapiSetFieldValue;
            window.nlapiSetFieldValue = function (campo) {
                if (_vigilados[campo]) console.trace('[NSFT] nlapiSetFieldValue(\'' + campo + '\')');
                return _setOriginal.apply(this, arguments);
            };
        }
        console.log('[NSFT] ' + L('Vigilando ', 'Watching ') + f + ' = ' + JSON.stringify(ultimo) + L('. NSFT.unwatch() para parar.', '. NSFT.unwatch() to stop.'));
        return f;
    }
    function unwatch(f) {
        Object.keys(_vigilados).forEach(function (k) {
            if (f && k !== f) return;
            clearInterval(_vigilados[k]);
            delete _vigilados[k];
        });
        if (!Object.keys(_vigilados).length && _setOriginal) { window.nlapiSetFieldValue = _setOriginal; _setOriginal = null; }
        return Object.keys(_vigilados);
    }


    function url(type, id, edit) {
        return N('url').then(function (u) {
            return u.resolveRecord({ recordType: type, recordId: id, isEditMode: !!edit });
        });
    }
    function open(type, id, edit) {
        return url(type, id, edit).then(function (dir) { window.open(dir, '_blank', 'noopener'); return dir; });
    }


    function csv(filas, nombre) {
        filas = Array.isArray(filas) ? filas : [filas];
        var cols = [];
        filas.forEach(function (r) { Object.keys(r || {}).forEach(function (k) { if (cols.indexOf(k) < 0) cols.push(k); }); });
        var celda = function (v) {
            var s = v == null ? '' : (typeof v === 'object' ? JSON.stringify(v) : String(v));
            if (/^[=+@\t\r]/.test(s) || /^-(?![\d.])/.test(s)) s = '\'' + s;
            return '"' + s.replace(/"/g, '""') + '"';
        };
        var lineas = [cols.map(celda).join(',')].concat(filas.map(function (r) { return cols.map(function (c) { return celda(r && r[c]); }).join(','); }));
        var blob = new Blob([String.fromCharCode(0xFEFF) + lineas.join('\r\n')], { type: 'text/csv;charset=utf-8' });
        var a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = (nombre || 'nsft') + (/\.csv$/i.test(nombre || '') ? '' : '.csv');
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(function () { URL.revokeObjectURL(a.href); }, 10000);
        return filas.length;
    }

    var AYUDA = [
        ['NSFT.help()', L('Esta lista.', 'This list.')],
        ['NSFT.ss()', L('Qu\u00e9 SuiteScript admite la p\u00e1gina: { ss2, ss1, record }.', 'Which SuiteScript the page supports: { ss2, ss1, record }.')],
        ['NSFT.rec()', L('El registro de la p\u00e1gina: { type, id, mode }.', 'The page\u2019s record: { type, id, mode }.')],
        ['NSFT.get(id) / NSFT.text(id)', L('Valor / texto de un campo.', 'A field\u2019s value / text.')],
        ['NSFT.set(id, valor)', L('Cambia un campo (en edici\u00f3n).', 'Changes a field (in edit mode).')],
        ['NSFT.field(id)', L('Etiqueta, tipo, valor y si est\u00e1 deshabilitado.', 'Label, type, value and whether it is disabled.')],
        ['NSFT.line(sub, id, n?) / NSFT.lines(sub)', L('Valor de una l\u00ednea de sublista / cu\u00e1ntas hay.', 'A sublist line value / how many lines.')],
        ['NSFT.fields(filtro?)', L('Todos los campos del registro como tabla (id, etiqueta, tipo, valor).', 'Every field of the record as a table (id, label, type, value).')],
        ['NSFT.sublist(sub)', L('Todas las l\u00edneas de una sublista como tabla.', 'Every line of a sublist as a table.')],
        ['NSFT.find(texto)', L('Busca un campo por id o etiqueta, lo resalta y te lleva a \u00e9l.', 'Finds a field by id or label, highlights it and scrolls to it.')],
        ['await NSFT.lookup(tipo, id, campos)', L('search.lookupFields en una l\u00ednea.', 'search.lookupFields in one line.')],
        ['await NSFT.search(id)', L('Una b\u00fasqueda guardada: sus filas como tabla.', 'A saved search: its rows as a table.')],
        ['await NSFT.me() / NSFT.account()', L('Tu usuario (rol, subsidiaria, formatos) / la cuenta y el entorno.', 'Your user (role, subsidiary, formats) / the account and environment.')],
        ['NSFT.watch(id) / NSFT.unwatch()', L('Vigila un campo: cada cambio, en la consola (y qui\u00e9n lo hace).', 'Watches a field: every change in the console (and who makes it).')],
        ['await NSFT.url(tipo, id) / NSFT.open(tipo, id)', L('La URL de un registro / abrirlo en otra pesta\u00f1a.', 'A record\u2019s URL / open it in another tab.')],
        ['NSFT.csv(filas, nombre?)', L('Descarga filas como CSV que Excel abre bien.', 'Downloads rows as a CSV that Excel opens correctly.')],
        ['await NSFT.N(\'record\', \u2026)', L('M\u00f3dulos N de SuiteScript 2.1.', 'SuiteScript 2.1 N modules.')],
        ['await NSFT.load(tipo?, id?)', L('record.load del registro abierto (o del que digas).', 'record.load of the open record (or the one you name).')],
        ['await NSFT.sql(consulta) / NSFT.table(consulta)', L('SuiteQL: las filas / pintadas con console.table.', 'SuiteQL: the rows / printed with console.table.')],
        ['NSFT.toast(texto)', L('Un aviso abajo en la p\u00e1gina.', 'A notice at the bottom of the page.')],
        ['NSFT.copy(valor)', L('Copia al portapapeles (texto u objeto como JSON).', 'Copies to the clipboard (text, or an object as JSON).')]
    ];
    function help() {
        console.log('%cNetSuite Full Tools ' + VERSION + ' \u2014 NSFT.*', 'font-weight:bold;color:#2C6E4E');
        console.table(AYUDA.map(function (a) { return { [L('uso', 'usage')]: a[0], [L('qu\u00e9 hace', 'what it does')]: a[1] }; }));
    }

    var API = {
        __nsft: true, version: VERSION,
        help: help, ss: ss, rec: rec, get: get, text: text, set: set, field: field,
        line: line, lines: lines, N: N, load: load, sql: sql, table: table, toast: toast, copy: copy,
        fields: fields, sublist: sublist, find: find, lookup: lookup, search: search, me: me, account: account,
        watch: watch, unwatch: unwatch, url: url, open: open, csv: csv
    };

    function expone() { if (!window.NSFT || window.NSFT.__nsft) window.NSFT = API; }
    function retira() { if (window.NSFT && window.NSFT.__nsft) { try { delete window.NSFT; } catch (e) { window.NSFT = undefined; } } }
    expone();

    window.addEventListener('message', function (ev) {
        if (ev.source !== window) return;
        var d = ev.data;
        if (!d || d.dest !== 'fetcher_nsftutils') return;
        if (d.type === 'off') { retira(); return; }
        if (d.type === 'on') { expone(); return; }
        if (d.type === 'ss') {
            var r = ss();
            window.postMessage({ dest: 'extension_nsftutils', type: 'ss', reqId: d.reqId, ss2: r.ss2, ss1: r.ss1, record: r.record }, '*');
        }
    });
})();
