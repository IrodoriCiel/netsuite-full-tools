(function () {
    'use strict';

    function runSql(spec, cb) {
        if (!window.NSFT_SQL) { cb({ code: 'stale' }, null); return; }
        window.NSFT_SQL.run(spec, cb);
    }

    function lit(v) {
        return window.NSFT_SQL ? window.NSFT_SQL.lit(v) : "'" + String(v).replace(/'/g, "''") + "'";
    }

    function responde(payload) {
        window.postMessage({ dest: 'extension_fcdd', type: 'existingNames', payload: payload }, '*');
    }


    const MAX_LECTURA = 1024 * 1024;

    const SELECTORES_ENLACE = [
        'a[target="fldUrlWindow"]',
        'a[href*="/core/media/media.nl"][download]',
        'a[href*="/core/media/media.nl"]',
        'a.dottedlink[href*="media.nl?"][href*="id="]'
    ];

    async function leerArchivoActual(fileId) {
        if (!/^\d+$/.test(String(fileId || ''))) return { state: 'none', content: '' };
        const ficha = await fetch('/app/common/media/mediaitem.nl?id=' + encodeURIComponent(fileId), { credentials: 'same-origin' });
        if (!ficha.ok) return { state: 'failed', content: '' };
        const doc = new DOMParser().parseFromString(await ficha.text(), 'text/html');
        let enlace = null;
        for (let i = 0; i < SELECTORES_ENLACE.length; i++) {
            enlace = doc.querySelector(SELECTORES_ENLACE[i]);
            if (enlace) break;
        }
        const href = enlace && enlace.getAttribute('href');
        if (!href) return { state: 'failed', content: '' };
        let url;
        try { url = new URL(href, location.origin).toString(); } catch (e) { return { state: 'failed', content: '' }; }
        const res = await fetch(url, { credentials: 'same-origin' });
        if (!res.ok) return { state: 'failed', content: '' };
        const len = parseInt(res.headers.get('Content-Length') || '0', 10);
        if (len && len > MAX_LECTURA) return { state: 'failed', content: '' };
        const txt = await res.text();
        if (txt.length > MAX_LECTURA) return { state: 'failed', content: '' };
        return { state: 'ok', content: txt };
    }

    async function enseñarDiferencias(p) {
        const cerrar = () => window.postMessage(
            { dest: 'extension_fcdd', type: 'diffClosed', payload: { token: p.token } }, '*');
        if (!window.NSFT_Diff) { cerrar(); return; }
        let actual = { state: 'failed', content: '' };
        try { actual = await leerArchivoActual(p.fileId); } catch (e) { }
        try {
            await window.NSFT_Diff.show({
                current: actual,
                newContent: p.newContent || '',
                fileName: p.fileName || '',
                theme: p.theme,
                labels: p.labels || {},
                viewOnly: true
            });
        } catch (e) { }
        cerrar();
    }

    window.addEventListener('message', function (event) {
        if (event.source !== window) return;
        const data = event.data;
        if (!data || data.dest !== 'fetcher_fcdd') return;
        if (data.type === 'showDiff') { enseñarDiferencias(data.payload || {}); return; }
        if (data.type !== 'existingNames') return;

        const p = data.payload || {};
        const token = p.token;
        const folderId = String(p.folderId == null ? '' : p.folderId).trim();
        const nombres = Array.isArray(p.names) ? p.names : [];

        if (!/^-?\d+$/.test(folderId) || !nombres.length) {
            responde({ token: token, error: 'BAD_PARAMS' });
            return;
        }

        const base = 'SELECT id, name FROM file WHERE folder = ' + folderId + ' AND name IN (';
        const rest = base + nombres.map(lit).join(',') + ')';
        const sql = base + nombres.map(function () { return '?'; }).join(',') + ')';

        runSql({ rest: rest, sql: sql, params: nombres, limit: 1000 }, function (err, rows) {
            if (err) {
                responde({ token: token, error: err.code || 'QUERY_ERROR' });
                return;
            }
            const out = [];
            (rows || []).forEach(function (r) {
                const n = r && (r.name != null ? r.name : r.NAME);
                const id = r && (r.id != null ? r.id : r.ID);
                if (n != null && String(n) !== '') out.push({ name: String(n), id: id == null ? null : String(id) });
            });
            responde({ token: token, names: out });
        });
    });

    window.postMessage({ dest: 'extension_fcdd', type: 'ready' }, '*');
})();
