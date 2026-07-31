(function () {
    'use strict';

    if (typeof require !== 'undefined') {
        require(['N/query'], function () { });
    }

    window.addEventListener('message', function (event) {
        if (event.source !== window) return;
        const data = event.data;
        if (!data || data.dest !== 'fetcher_gtr') return;
        if (data.type === 'lookupTranid') {
            lookupTranid((data.payload && data.payload.tranid) || '');
        } else if (data.type === 'lookupCustomRecord') {
            lookupCustomRecord(
                (data.payload && data.payload.alias) || '',
                (data.payload && data.payload.id) || ''
            );
        } else if (data.type === 'suggestCustomRecords') {
            suggestCustomRecords(
                (data.payload && data.payload.query) || '',
                (data.payload && data.payload.token) || 0,
                !!(data.payload && data.payload.fuzzy)
            );
        } else if (data.type === 'suggestCustomRecordInstances') {
            const p = data.payload || {};
            suggestCustomRecordInstances(
                p.scriptid || '',
                p.filter || '',
                p.token || 0,
                p.rectypeId || '',
                p.typeName || ''
            );
        }
    });

    function lookupTranid(tranid) {
        tranid = String(tranid || '').trim();
        if (!tranid) {
            reply('tranidError', { message: 'Empty tranid' });
            return;
        }
        if (typeof require === 'undefined') {
            reply('tranidError', { message: "'require' is not defined — open NSFT on a NetSuite page." });
            return;
        }
        try {
            require(['N/query'], function (q) {
                try {
                    const sql = `SELECT id, TYPE AS type, tranid, trandate FROM transaction WHERE UPPER(tranid) = ? FETCH FIRST 10 ROWS ONLY`;
                    const rs = q.runSuiteQL({ query: sql, params: [tranid.toUpperCase()] });
                    const rows = rs.asMappedResults().map(r => ({
                        id: r.id,
                        type: r.type,
                        tranid: r.tranid,
                        trandate: r.trandate
                    }));
                    reply('tranidResult', { found: rows.length > 0, rows });
                } catch (err) {
                    reply('tranidError', { message: (err && err.message) || String(err) });
                }
            });
        } catch (err) {
            reply('tranidError', { message: (err && err.message) || String(err) });
        }
    }

    function lookupCustomRecord(alias, recordId) {
        alias = String(alias || '').trim();
        recordId = String(recordId || '').trim();
        if (!alias || !recordId) {
            reply('customRecordError', { message: 'Empty alias or id' });
            return;
        }
        if (typeof require === 'undefined') {
            reply('customRecordError', { message: "'require' is not defined — open NSFT on a NetSuite page." });
            return;
        }
        try {
            require(['N/query'], function (q) {
                try {
                    const aliasUpper = alias.toUpperCase();
                    let sql, params;
                    if (/^customrecord[a-z0-9_]*$/i.test(alias)) {
                        sql = `SELECT ct.internalid, ct.scriptid, ct.name FROM customrecordtype ct WHERE UPPER(ct.scriptid) = ? FETCH FIRST 5 ROWS ONLY`;
                        params = [aliasUpper];
                    } else {
                        const underscoredUpper = `CUSTOMRECORD_${alias.replace(/\s+/g, '_').toUpperCase()}`;
                        sql = `
                            SELECT ct.internalid, ct.scriptid, ct.name
                            FROM customrecordtype ct
                            WHERE UPPER(ct.name) = ?
                               OR UPPER(ct.scriptid) = ?
                               OR UPPER(ct.scriptid) = ?
                            FETCH FIRST 5 ROWS ONLY
                        `;
                        params = [aliasUpper, aliasUpper, underscoredUpper];
                    }
                    const rs = q.runSuiteQL({ query: sql, params });
                    const rows = rs.asMappedResults().map(r => ({
                        rectypeId: r.internalid,
                        scriptid: r.scriptid,
                        name: r.name
                    }));
                    reply('customRecordResult', {
                        found: rows.length > 0,
                        rows,
                        recordId,
                        alias
                    });
                } catch (err) {
                    reply('customRecordError', { message: (err && err.message) || String(err) });
                }
            });
        } catch (err) {
            reply('customRecordError', { message: (err && err.message) || String(err) });
        }
    }

    function suggestCustomRecords(query, token, fuzzy) {
        query = String(query || '').trim();
        if (query.length < 2) {
            reply('customRecordSuggestions', { rows: [], query, token });
            return;
        }
        if (typeof require === 'undefined') {
            reply('customRecordSuggestions', { rows: [], query, token });
            return;
        }
        try {
            require(['N/query'], function (q) {
                try {
                    let where, params;
                    if (fuzzy) {
                        const tokens = query.split(/\s+/).filter(Boolean).slice(0, 6);
                        const conds = tokens.map(() => '(UPPER(ct.name) LIKE ? OR UPPER(ct.scriptid) LIKE ?)').join(' AND ');
                        params = [];
                        tokens.forEach((t) => { const like = `%${t.toUpperCase()}%`; params.push(like, like); });
                        where = conds || '1=1';
                    } else {
                        const likeUpper = `%${query.toUpperCase()}%`;
                        where = 'UPPER(ct.name) LIKE ? OR UPPER(ct.scriptid) LIKE ?';
                        params = [likeUpper, likeUpper];
                    }
                    const sql = `
                        SELECT ct.internalid, ct.scriptid, ct.name
                        FROM customrecordtype ct
                        WHERE ${where}
                        ORDER BY ct.name
                        FETCH FIRST 15 ROWS ONLY
                    `;
                    const rs = q.runSuiteQL({ query: sql, params });
                    const rows = rs.asMappedResults().map(r => ({
                        rectypeId: r.internalid,
                        scriptid: r.scriptid,
                        name: r.name
                    }));
                    reply('customRecordSuggestions', { rows, query, token });
                } catch (err) {
                    reply('customRecordSuggestions', {
                        rows: [],
                        query,
                        token,
                        error: (err && err.message) || String(err)
                    });
                }
            });
        } catch (err) {
            reply('customRecordSuggestions', {
                rows: [],
                query,
                token,
                error: (err && err.message) || String(err)
            });
        }
    }

    function suggestCustomRecordInstances(scriptid, filter, token, rectypeId, typeName) {
        scriptid = String(scriptid || '').trim();
        filter = String(filter || '').trim();
        if (!/^[a-zA-Z0-9_]+$/.test(scriptid)) {
            reply('customRecordInstanceSuggestions', {
                rows: [], filter, token, scriptid, rectypeId, typeName,
                error: 'Invalid scriptid'
            });
            return;
        }
        if (typeof require === 'undefined') {
            reply('customRecordInstanceSuggestions', {
                rows: [], filter, token, scriptid, rectypeId, typeName
            });
            return;
        }
        try {
            require(['N/query'], function (q) {
                try {
                    let where = '';
                    let params = [];
                    if (filter) {
                        if (/^\d+$/.test(filter)) {
                            where = `WHERE id = ? OR UPPER(name) LIKE ?`;
                            params = [filter, `%${filter.toUpperCase()}%`];
                        } else {
                            where = `WHERE UPPER(name) LIKE ?`;
                            params = [`%${filter.toUpperCase()}%`];
                        }
                    }
                    const sql = `SELECT id, name FROM ${scriptid} ${where} ORDER BY id DESC FETCH FIRST 15 ROWS ONLY`;
                    const rs = q.runSuiteQL({ query: sql, params });
                    const rows = rs.asMappedResults().map(r => ({ id: r.id, name: r.name }));
                    reply('customRecordInstanceSuggestions', { rows, filter, token, scriptid, rectypeId, typeName });
                } catch (err) {
                    reply('customRecordInstanceSuggestions', {
                        rows: [], filter, token, scriptid, rectypeId, typeName,
                        error: (err && err.message) || String(err)
                    });
                }
            });
        } catch (err) {
            reply('customRecordInstanceSuggestions', {
                rows: [], filter, token, scriptid, rectypeId, typeName,
                error: (err && err.message) || String(err)
            });
        }
    }

    function reply(type, payload) {
        window.postMessage({ dest: 'extension_gtr', type, payload }, '*');
    }
})();
