(function () {
    'use strict';

    const DEST_IN = 'fetcher_msc';
    const DEST_OUT = 'extension_msc';

    const SIN_INACTIVOS = { transaction: true, employee: false };

    const TABLAS = {
        customer: 'customer',
        contact: 'contact',
        vendor: 'vendor',
        partner: 'partner',
        employee: 'employee',
        item: 'item',
        transaction: 'transaction'
    };

    const IDENT = /^[A-Za-z][A-Za-z0-9_]*$/;

    function responder(payload) {
        try { window.postMessage({ dest: DEST_OUT, type: 'countOptions', payload: payload }, '*'); }
        catch (e) { }
    }

    function tablaDe(fieldName) {
        try {
            const gen = window['PopupSearch' + fieldName];
            if (typeof gen !== 'function') return null;
            const m = String(gen).match(/searchtype=([A-Za-z0-9_]+)/);
            if (!m || !m[1]) return null;
            const clave = m[1].toLowerCase();
            const tabla = TABLAS[clave] || clave;
            return IDENT.test(tabla) ? tabla : null;
        } catch (e) { return null; }
    }

    function conTransporte(cb, intentos) {
        const T = window.NSFT_SQL;
        if (T && typeof T.run === 'function') { cb(T); return; }
        if ((intentos || 0) >= 40) { cb(null); return; }
        setTimeout(function () { conTransporte(cb, (intentos || 0) + 1); }, 150);
    }

    function contar(fieldName) {
        conTransporte(function (T) {
            if (!T) { responder({ fieldName: fieldName, error: 'sin-transporte' }); return; }
            contarCon(T, fieldName);
        });
    }

    function contarCon(T, fieldName) {
        const tabla = tablaDe(fieldName);
        if (!tabla) {
            responder({ fieldName: fieldName, error: 'sin-origen' });
            return;
        }

        const conFiltro = 'SELECT COUNT(*) AS n FROM ' + tabla +
            " WHERE (isinactive = 'F' OR isinactive IS NULL)";
        const pelado = 'SELECT COUNT(*) AS n FROM ' + tabla;
        const primera = SIN_INACTIVOS[tabla] ? pelado : conFiltro;

        const leer = function (rows) {
            const f = rows && rows[0];
            if (!f) return null;
            const v = (f.n != null) ? f.n : f.N;
            const n = parseInt(v, 10);
            return isNaN(n) ? null : n;
        };

        T.run({ rest: primera, sql: primera, limit: 1 }, function (err, rows) {
            if (!err) {
                const n = leer(rows);
                responder(n == null ? { fieldName: fieldName, error: 'sin-cuenta' }
                                    : { fieldName: fieldName, total: n });
                return;
            }
            if (primera === pelado) { responder({ fieldName: fieldName, error: 'consulta' }); return; }
            T.run({ rest: pelado, sql: pelado, limit: 1 }, function (err2, rows2) {
                if (err2) { responder({ fieldName: fieldName, error: 'consulta' }); return; }
                const n = leer(rows2);
                responder(n == null ? { fieldName: fieldName, error: 'sin-cuenta' }
                                    : { fieldName: fieldName, total: n, sinFiltroDeActivos: true });
            });
        });
    }

    window.addEventListener('message', function (ev) {
        if (ev.source !== window) return;
        const d = ev.data;
        if (!d || d.dest !== DEST_IN || d.type !== 'countOptions') return;
        const nombre = d.payload && d.payload.fieldName;
        if (!nombre || !/^[A-Za-z0-9_]+$/.test(nombre)) return;
        contar(nombre);
    });
})();
