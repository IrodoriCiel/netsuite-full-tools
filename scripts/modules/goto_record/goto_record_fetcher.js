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


    function colCmp(col, plegado) {
        var TS = plegado ? window.NSFT_TextSearch : null;
        return TS ? TS.sqlFold(col) : 'UPPER(' + col + ')';
    }

    function valCmp(v, plegado) {
        var TS = plegado ? window.NSFT_TextSearch : null;
        return TS ? TS.sqlTerm(v) : String(v).toUpperCase();
    }

    function runDosPasadas(hazSpec, termino, cb) {
        runSql(hazSpec(false), function (err, rows) {
            if (err) { cb(err, rows); return; }
            var vale = !!window.NSFT_TextSearch && !!String(termino || '').trim();
            if ((rows && rows.length) || !vale) { cb(null, rows); return; }
            runSql(hazSpec(true), function (err2, rows2) {
                cb(null, err2 ? rows : rows2);
            });
        });
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
        var head = 'SELECT ct.internalid, ct.scriptid, ct.name FROM customrecordtype ct WHERE ';
        var esScriptid = /^customrecord[a-z0-9_]*$/i.test(alias);

        function spec(plegado) {
            var val = valCmp(alias, plegado);
            var colSid = colCmp('ct.scriptid', plegado);
            if (esScriptid) {
                return {
                    rest: head + colSid + ' = ' + lit(val),
                    sql: head + colSid + ' = ? FETCH FIRST 5 ROWS ONLY',
                    params: [val],
                    limit: 5
                };
            }
            var colName = colCmp('ct.name', plegado);
            var underscored = valCmp('CUSTOMRECORD_' + alias.replace(/\s+/g, '_'), plegado);
            return {
                rest: head + colName + ' = ' + lit(val) +
                      ' OR ' + colSid + ' = ' + lit(val) +
                      ' OR ' + colSid + ' = ' + lit(underscored),
                sql: head + colName + ' = ? OR ' + colSid + ' = ? OR ' + colSid + ' = ?' +
                     ' FETCH FIRST 5 ROWS ONLY',
                params: [val, val, underscored],
                limit: 5
            };
        }

        runDosPasadas(spec, esScriptid ? '' : alias, function (err, rows) {
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
        var head = 'SELECT ct.internalid, ct.scriptid, ct.name FROM customrecordtype ct WHERE ';

        function spec(plegado) {
            var colName = colCmp('ct.name', plegado);
            var colSid = colCmp('ct.scriptid', plegado);
            var whereRest, whereSql;
            var params = [];
            if (fuzzy) {
                var tokens = query.split(/\s+/).filter(Boolean).slice(0, 6);
                var condsRest = [];
                var condsSql = [];
                tokens.forEach(function (t) {
                    var like = '%' + valCmp(t, plegado) + '%';
                    params.push(like, like);
                    condsRest.push('(' + colName + ' LIKE ' + lit(like) + ' OR ' + colSid + ' LIKE ' + lit(like) + ')');
                    condsSql.push('(' + colName + ' LIKE ? OR ' + colSid + ' LIKE ?)');
                });
                whereRest = condsRest.join(' AND ') || '1=1';
                whereSql = condsSql.join(' AND ') || '1=1';
            } else {
                var likeUpper = '%' + valCmp(query, plegado) + '%';
                whereRest = colName + ' LIKE ' + lit(likeUpper) + ' OR ' + colSid + ' LIKE ' + lit(likeUpper);
                whereSql = colName + ' LIKE ? OR ' + colSid + ' LIKE ?';
                params = [likeUpper, likeUpper];
            }
            return {
                rest: head + whereRest + ' ORDER BY ct.name',
                sql: head + whereSql + ' ORDER BY ct.name FETCH FIRST 15 ROWS ONLY',
                params: params,
                limit: 15
            };
        }

        runDosPasadas(spec, query, function (err, rows) {
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
        function spec(plegado) {
            var whereRest = '';
            var whereSql = '';
            var params = [];
            if (filter) {
                var colName = colCmp('name', plegado);
                var likeUpper = '%' + valCmp(filter, plegado) + '%';
                if (/^\d+$/.test(filter)) {
                    whereRest = 'WHERE id = ' + lit(filter) + ' OR ' + colName + ' LIKE ' + lit(likeUpper);
                    whereSql = 'WHERE id = ? OR ' + colName + ' LIKE ?';
                    params = [filter, likeUpper];
                } else {
                    whereRest = 'WHERE ' + colName + ' LIKE ' + lit(likeUpper);
                    whereSql = 'WHERE ' + colName + ' LIKE ?';
                    params = [likeUpper];
                }
            }
            return {
                rest: 'SELECT id, name FROM ' + scriptid + ' ' + whereRest + ' ORDER BY id DESC',
                sql: 'SELECT id, name FROM ' + scriptid + ' ' + whereSql + ' ORDER BY id DESC FETCH FIRST 15 ROWS ONLY',
                params: params,
                limit: 15
            };
        }

        runDosPasadas(spec, filter, function (err, rows) {
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
