(function () {
    'use strict';

    window.addEventListener('message', function (event) {
        if (event.source !== window) return;
        const data = event.data;
        if (!data || data.dest !== 'fetcher_gtr') return;
        const payload = data.payload || {};
        if (data.type === 'lookupTranid') {
            lookupTranid(payload.tranid || '');
        } else if (data.type === 'lookupCustomRecord') {
            lookupCustomRecord(payload.alias || '', payload.id || '');
        } else if (data.type === 'suggestTransactions') {
            suggestTransactions(payload.prefix || '', payload.token || 0);
        } else if (data.type === 'suggestCustomRecords') {
            suggestCustomRecords(payload.query || '', payload.token || 0, !!payload.fuzzy);
        } else if (data.type === 'suggestCustomRecordInstances') {
            suggestCustomRecordInstances(
                payload.scriptid || '',
                payload.filter || '',
                payload.token || 0,
                payload.rectypeId || '',
                payload.typeName || ''
            );
        }
    });

    function runSql(spec, cb) {
        if (!window.NSFT_SQL) { cb({ code: 'stale' }, null); return; }
        window.NSFT_SQL.run(spec, cb);
    }

    function lit(v) {
        return window.NSFT_SQL ? window.NSFT_SQL.lit(v) : "'" + String(v).replace(/'/g, "''") + "'";
    }

    function lookupTranid(tranid) {
        tranid = String(tranid || '').trim();
        if (!tranid) {
            reply('tranidError', { code: 'empty', message: 'Empty tranid' });
            return;
        }
        var upper = tranid.toUpperCase();
        var cols = 'id, TYPE AS type, tranid, transactionnumber, trandate';
        var colsViejo = 'id, TYPE AS type, tranid, trandate';
        var vals = (upper === tranid) ? [tranid] : [tranid, upper];
        var inLits = vals.map(function (v) { return lit(v); }).join(', ');
        var inMarks = vals.map(function () { return '?'; }).join(', ');

        var rapida = {
            rest: 'SELECT ' + cols + ' FROM transaction WHERE tranid IN (' + inLits + ')' +
                  ' OR transactionnumber IN (' + inLits + ')',
            sql: 'SELECT ' + cols + ' FROM transaction WHERE tranid IN (' + inMarks + ')' +
                 ' OR transactionnumber IN (' + inMarks + ') FETCH FIRST 10 ROWS ONLY',
            params: vals.concat(vals),
            limit: 10,
            fallback: {
                rest: 'SELECT ' + colsViejo + ' FROM transaction WHERE tranid IN (' + inLits + ')',
                sql: 'SELECT ' + colsViejo + ' FROM transaction WHERE tranid IN (' + inMarks + ') FETCH FIRST 10 ROWS ONLY',
                params: vals,
                limit: 10
            }
        };
        var lenta = {
            rest: 'SELECT ' + cols + ' FROM transaction WHERE UPPER(tranid) = ' + lit(upper) +
                  ' OR UPPER(transactionnumber) = ' + lit(upper),
            sql: 'SELECT ' + cols + ' FROM transaction WHERE UPPER(tranid) = ?' +
                 ' OR UPPER(transactionnumber) = ? FETCH FIRST 10 ROWS ONLY',
            params: [upper, upper],
            limit: 10,
            fallback: {
                rest: 'SELECT ' + colsViejo + ' FROM transaction WHERE UPPER(tranid) = ' + lit(upper),
                sql: 'SELECT ' + colsViejo + ' FROM transaction WHERE UPPER(tranid) = ? FETCH FIRST 10 ROWS ONLY',
                params: [upper],
                limit: 10
            }
        };

        var entregar = function (rows) {
            reply('tranidResult', {
                found: (rows || []).length > 0,
                rows: (rows || []).map(function (r) {
                    return {
                        id: r.id,
                        type: r.type,
                        tranid: r.tranid,
                        transactionnumber: r.transactionnumber,
                        trandate: r.trandate
                    };
                })
            });
        };

        runSql(rapida, function (err, rows) {
            if (err) {
                reply('tranidError', { code: err.code || 'query', message: err.message || '' });
                return;
            }
            if (rows && rows.length) { entregar(rows); return; }
            runSql(lenta, function (err2, rows2) {
                if (err2) {
                    reply('tranidError', { code: err2.code || 'query', message: err2.message || '' });
                    return;
                }
                entregar(rows2);
            });
        });
    }

    function suggestTransactions(prefix, token) {
        prefix = String(prefix || '').trim();
        if (!looksLikeDocNumber(prefix)) {
            reply('transactionSuggestions', { rows: [], prefix: prefix, token: token });
            return;
        }
        var upper = prefix.toUpperCase();
        var vals = (upper === prefix) ? [prefix] : [prefix, upper];
        var cols = 'id, TYPE AS type, tranid, transactionnumber, trandate';
        var condsRest = [];
        var condsSql = [];
        var params = [];
        vals.forEach(function (v) {
            var like = escapeLike(v) + '%';
            params.push(like, like);
            condsRest.push("tranid LIKE " + lit(like) + " ESCAPE '\\'");
            condsRest.push("transactionnumber LIKE " + lit(like) + " ESCAPE '\\'");
            condsSql.push("tranid LIKE ? ESCAPE '\\'");
            condsSql.push("transactionnumber LIKE ? ESCAPE '\\'");
        });
        var head = 'SELECT ' + cols + ' FROM transaction WHERE ';
        var tail = ' ORDER BY id DESC';
        runSql({
            rest: head + condsRest.join(' OR ') + tail,
            sql: head + condsSql.join(' OR ') + tail + ' FETCH FIRST 8 ROWS ONLY',
            params: params,
            limit: 8,
            fallback: {
                rest: head + condsRest.filter(function (c) { return c.indexOf('tranid ') === 0; }).join(' OR ') + tail,
                sql: head + condsSql.filter(function (c) { return c.indexOf('tranid ') === 0; }).join(' OR ') + tail + ' FETCH FIRST 8 ROWS ONLY',
                params: params.filter(function (_, i) { return i % 2 === 0; }),
                limit: 8
            }
        }, function (err, rows) {
            if (err) {
                reply('transactionSuggestions', { rows: [], prefix: prefix, token: token, code: err.code || '', error: err.message || err.code || '' });
                return;
            }
            reply('transactionSuggestions', {
                rows: (rows || []).map(function (r) {
                    return {
                        id: r.id,
                        type: r.type,
                        tranid: r.tranid,
                        transactionnumber: r.transactionnumber,
                        trandate: r.trandate
                    };
                }),
                prefix: prefix,
                token: token
            });
        });
    }

    function escapeLike(v) {
        return String(v).replace(/([%_\\])/g, '\\$1');
    }

    function looksLikeDocNumber(v) {
        v = String(v || '').trim();
        if (v.length < 4 || /\s/.test(v)) return false;
        if (/^customrecord/i.test(v)) return false;
        return /\d/.test(v);
    }

    function lookupCustomRecord(alias, recordId) {
        alias = String(alias || '').trim();
        recordId = String(recordId || '').trim();
        if (!alias || !recordId) {
            reply('customRecordError', { code: 'empty', message: 'Empty alias or id' });
            return;
        }
        var aliasUpper = alias.toUpperCase();
        var head = 'SELECT ct.internalid, ct.scriptid, ct.name FROM customrecordtype ct WHERE ';
        var spec;
        if (/^customrecord[a-z0-9_]*$/i.test(alias)) {
            spec = {
                rest: head + 'UPPER(ct.scriptid) = ' + lit(aliasUpper),
                sql: head + 'UPPER(ct.scriptid) = ? FETCH FIRST 5 ROWS ONLY',
                params: [aliasUpper],
                limit: 5
            };
        } else {
            var underscoredUpper = 'CUSTOMRECORD_' + alias.replace(/\s+/g, '_').toUpperCase();
            spec = {
                rest: head + 'UPPER(ct.name) = ' + lit(aliasUpper) +
                      ' OR UPPER(ct.scriptid) = ' + lit(aliasUpper) +
                      ' OR UPPER(ct.scriptid) = ' + lit(underscoredUpper),
                sql: head + 'UPPER(ct.name) = ? OR UPPER(ct.scriptid) = ? OR UPPER(ct.scriptid) = ?' +
                     ' FETCH FIRST 5 ROWS ONLY',
                params: [aliasUpper, aliasUpper, underscoredUpper],
                limit: 5
            };
        }
        runSql(spec, function (err, rows) {
            if (err) {
                reply('customRecordError', { code: err.code || 'query', message: err.message || '' });
                return;
            }
            var out = (rows || []).map(function (r) {
                return { rectypeId: r.internalid, scriptid: r.scriptid, name: r.name };
            });
            reply('customRecordResult', {
                found: out.length > 0,
                rows: out,
                recordId: recordId,
                alias: alias
            });
        });
    }

    function suggestCustomRecords(query, token, fuzzy) {
        query = String(query || '').trim();
        if (query.length < 2) {
            reply('customRecordSuggestions', { rows: [], query: query, token: token });
            return;
        }
        var whereRest, whereSql, params;
        if (fuzzy) {
            var tokens = query.split(/\s+/).filter(Boolean).slice(0, 6);
            var condsRest = [];
            var condsSql = [];
            params = [];
            tokens.forEach(function (t) {
                var like = '%' + t.toUpperCase() + '%';
                params.push(like, like);
                condsRest.push('(UPPER(ct.name) LIKE ' + lit(like) + ' OR UPPER(ct.scriptid) LIKE ' + lit(like) + ')');
                condsSql.push('(UPPER(ct.name) LIKE ? OR UPPER(ct.scriptid) LIKE ?)');
            });
            whereRest = condsRest.join(' AND ') || '1=1';
            whereSql = condsSql.join(' AND ') || '1=1';
        } else {
            var likeUpper = '%' + query.toUpperCase() + '%';
            whereRest = 'UPPER(ct.name) LIKE ' + lit(likeUpper) + ' OR UPPER(ct.scriptid) LIKE ' + lit(likeUpper);
            whereSql = 'UPPER(ct.name) LIKE ? OR UPPER(ct.scriptid) LIKE ?';
            params = [likeUpper, likeUpper];
        }
        var head = 'SELECT ct.internalid, ct.scriptid, ct.name FROM customrecordtype ct WHERE ';
        runSql({
            rest: head + whereRest + ' ORDER BY ct.name',
            sql: head + whereSql + ' ORDER BY ct.name FETCH FIRST 15 ROWS ONLY',
            params: params,
            limit: 15
        }, function (err, rows) {
            if (err) {
                reply('customRecordSuggestions', {
                    rows: [], query: query, token: token, code: err.code || '', error: err.message || err.code || ''
                });
                return;
            }
            reply('customRecordSuggestions', {
                rows: (rows || []).map(function (r) {
                    return { rectypeId: r.internalid, scriptid: r.scriptid, name: r.name };
                }),
                query: query,
                token: token
            });
        });
    }

    function suggestCustomRecordInstances(scriptid, filter, token, rectypeId, typeName) {
        scriptid = String(scriptid || '').trim();
        filter = String(filter || '').trim();
        if (!/^[a-zA-Z0-9_]+$/.test(scriptid)) {
            reply('customRecordInstanceSuggestions', {
                rows: [], filter: filter, token: token, scriptid: scriptid, rectypeId: rectypeId,
                typeName: typeName, error: 'Invalid scriptid'
            });
            return;
        }
        var whereRest = '';
        var whereSql = '';
        var params = [];
        if (filter) {
            var likeUpper = '%' + filter.toUpperCase() + '%';
            if (/^\d+$/.test(filter)) {
                whereRest = 'WHERE id = ' + lit(filter) + ' OR UPPER(name) LIKE ' + lit(likeUpper);
                whereSql = 'WHERE id = ? OR UPPER(name) LIKE ?';
                params = [filter, likeUpper];
            } else {
                whereRest = 'WHERE UPPER(name) LIKE ' + lit(likeUpper);
                whereSql = 'WHERE UPPER(name) LIKE ?';
                params = [likeUpper];
            }
        }
        runSql({
            rest: 'SELECT id, name FROM ' + scriptid + ' ' + whereRest + ' ORDER BY id DESC',
            sql: 'SELECT id, name FROM ' + scriptid + ' ' + whereSql + ' ORDER BY id DESC FETCH FIRST 15 ROWS ONLY',
            params: params,
            limit: 15
        }, function (err, rows) {
            if (err) {
                reply('customRecordInstanceSuggestions', {
                    rows: [], filter: filter, token: token, scriptid: scriptid, rectypeId: rectypeId,
                    typeName: typeName, code: err.code || '', error: err.message || err.code || ''
                });
                return;
            }
            reply('customRecordInstanceSuggestions', {
                rows: (rows || []).map(function (r) { return { id: r.id, name: r.name }; }),
                filter: filter,
                token: token,
                scriptid: scriptid,
                rectypeId: rectypeId,
                typeName: typeName
            });
        });
    }

    function reply(type, payload) {
        window.postMessage({ dest: 'extension_gtr', type: type, payload: payload }, '*');
    }
})();
