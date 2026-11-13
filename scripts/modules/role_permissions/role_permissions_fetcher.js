(function () {
    'use strict';

    if (window.__nsftRolePermsFetcher) return;
    window.__nsftRolePermsFetcher = true;

    const RX_CLAVE = /^[A-Z][A-Z0-9_]{2,60}$/;

    window.addEventListener('message', function (event) {
        if (event.source !== window) return;
        const d = event.data;
        if (!d || d.dest !== 'fetcher_rperm') return;
        if (d.type === 'check') check(d);
    });

    function reply(d, payload) {
        window.postMessage({ dest: 'extension_rperm', type: d.type, reqId: d.reqId, payload: payload }, '*');
    }

    function conTransporte(fn) {
        let n = 0;
        (function mira() {
            if (window.NSFT_SQL || n >= 30) { fn(window.NSFT_SQL || null); return; }
            n++;
            setTimeout(mira, 100);
        })();
    }

    function sql(T, spec) {
        return new Promise(function (resolve) {
            if (!T) { resolve({ error: 'SuiteQL transport unavailable', rows: [] }); return; }
            try {
                T.run(spec, function (err, rows) {
                    resolve(err ? { error: (err && (err.message || err.code)) || 'query', rows: [] } : { rows: rows || [] });
                });
            } catch (e) {
                resolve({ error: String(e && e.message || e), rows: [] });
            }
        });
    }

    function nivel(u, clave) {
        try {
            const v = u.getPermission({ name: clave });
            const n = Number(v);
            return isFinite(n) ? n : null;
        } catch (e) {
            return null;
        }
    }

    function check(d) {
        const p = d.payload || {};
        const claves = (Array.isArray(p.keys) ? p.keys : []).map(String).filter(function (k) { return RX_CLAVE.test(k); }).slice(0, 30);
        const falsa = RX_CLAVE.test(String(p.fake || '')) ? String(p.fake) : 'NSFT_NOT_A_PERMISSION_ZZ';

        if (typeof require === 'undefined') { reply(d, { error: 'norequire' }); return; }
        try {
            require(['N/runtime'], function (runtime) {
                let u = null;
                try { u = runtime.getCurrentUser(); } catch (e) { u = null; }
                if (!u) { reply(d, { error: 'nouser' }); return; }

                const niveles = {};
                claves.forEach(function (k) { niveles[k] = nivel(u, k); });
                const control = nivel(u, falsa);
                let roleId = '';
                let role = null;
                try { roleId = String(u.roleId || ''); } catch (e) { roleId = ''; }
                try { role = u.role; } catch (e) { role = null; }

                conTransporte(function (T) {
                    const lit = T ? T.lit : function (v) { return "'" + String(v).replace(/'/g, "''") + "'"; };

                    const qNombres = claves.length
                        ? sql(T, {
                            rest: 'SELECT DISTINCT permkey, BUILTIN.DF(permkey) AS nombre FROM rolepermissions WHERE permkey IN ('
                                + claves.map(lit).join(',') + ')',
                            sql: 'SELECT DISTINCT permkey, BUILTIN.DF(permkey) AS nombre FROM rolepermissions WHERE permkey IN ('
                                + claves.map(function () { return '?'; }).join(',') + ')',
                            params: claves,
                            limit: 100
                        })
                        : Promise.resolve({ rows: [] });

                    const idRol = /^-?\d+$/.test(String(role)) ? Number(role) : null;
                    const qRol = idRol != null
                        ? sql(T, {
                            rest: 'SELECT name FROM role WHERE id = ' + idRol,
                            sql: 'SELECT name FROM role WHERE id = ?',
                            params: [idRol],
                            limit: 1
                        })
                        : Promise.resolve({ rows: [] });

                    Promise.all([qNombres, qRol]).then(function (r) {
                        const nombres = {};
                        (r[0].rows || []).forEach(function (row) {
                            const k = String(row.permkey || '').toUpperCase();
                            if (k && row.nombre) nombres[k] = String(row.nombre);
                        });
                        const filaRol = (r[1].rows || [])[0];
                        reply(d, {
                            levels: niveles,
                            control: control,
                            roleId: roleId,
                            roleName: filaRol && filaRol.name ? String(filaRol.name) : '',
                            names: nombres
                        });
                    });
                });
            }, function () {
                reply(d, { error: 'noruntime' });
            });
        } catch (e) {
            reply(d, { error: 'noruntime' });
        }
    }
})();
