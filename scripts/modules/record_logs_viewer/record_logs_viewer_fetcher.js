'use strict';

(function () {
    if (window.__nsftRlvFetcher) return;
    window.__nsftRlvFetcher = true;

    function reply(type, payload) {
        window.postMessage({ dest: 'extension_rlv', type: type, payload: payload || {} }, '*');
    }

    window.addEventListener('message', function (event) {
        if (event.source !== window) return;
        var data = event.data;
        if (!data || data.dest !== 'fetcher_rlv') return;
        if (data.type === 'context') sendContext(data.payload || {});
        else if (data.type === 'recordtypes') sendRecordTypes();
        else if (data.type === 'scripts_for') sendScriptsFor(data.payload || {});
        else if (data.type === 'deploys_for') sendDeploysFor(data.payload || {});
        else if (data.type === 'logs') runLogs(data.payload || {});
        else if (data.type === 'logs_export') runExport(data.payload || {});
    });


    function scriptsForRecordType(query, recordType) {
        return query.runSuiteQL({
            query: 'SELECT DISTINCT s.id AS id, s.name AS name, s.scripttype AS stype ' +
                'FROM ScriptDeployment sd INNER JOIN Script s ON sd.script = s.id ' +
                'WHERE sd.recordtype = ?',
            params: [String(recordType).toUpperCase()]
        }).asMappedResults();
    }
    function customRecordTypeName(query, recordType) {
        var rt = String(recordType || '');
        if (rt.toLowerCase().indexOf('customrecord') !== 0) return null;
        try {
            var rows = query.runSuiteQL({
                query: 'SELECT name AS nm FROM customrecordtype WHERE UPPER(scriptid) = ?',
                params: [rt.toUpperCase()]
            }).asMappedResults();
            return (rows && rows.length && rows[0].nm) ? String(rows[0].nm) : null;
        } catch (e) { return null; }
    }

    var SCRIPT_PAGE_RE = /\/scripting\/(?:script|scriptrecord|scriptdeploy)\.nl/i;

    function urlId() {
        try {
            var m = /[?&]id=(\d+)/.exec(String(location.search || ''));
            var n = m ? parseInt(m[1], 10) : 0;
            return (n && n > 0) ? n : 0;
        } catch (e) { return 0; }
    }

    function scriptById(query, id) {
        try {
            var rows = query.runSuiteQL({
                query: 'SELECT s.id AS id, s.name AS name, s.scripttype AS stype ' +
                    'FROM Script s WHERE s.id = ?',
                params: [id]
            }).asMappedResults();
            return (rows && rows.length) ? rows[0] : null;
        } catch (e) { return null; }
    }

    function scriptOfDeployment(query, id) {
        try {
            var rows = query.runSuiteQL({
                query: 'SELECT sd.script AS sid FROM ScriptDeployment sd WHERE sd.primarykey = ?',
                params: [id]
            }).asMappedResults();
            var sid = (rows && rows.length) ? parseInt(rows[0].sid, 10) : 0;
            return (sid && !isNaN(sid)) ? sid : 0;
        } catch (e) { return 0; }
    }

    function scriptScope(query, recordType, recordId, hint) {
        var rt = String(recordType || '').toLowerCase();
        var path = String(location.pathname || '');
        var esFicha = SCRIPT_PAGE_RE.test(path);
        if (rt !== 'script' && rt !== 'scriptdeployment' && !esFicha) return null;

        var pista = parseInt(hint, 10);
        if (pista && pista > 0) {
            var directo = scriptById(query, pista);
            if (directo) return directo;
        }

        var id = urlId() || parseInt(recordId, 10);
        if (!id || isNaN(id) || id <= 0) return null;

        if (rt === 'scriptdeployment' || /scriptdeploy\.nl/i.test(path)) {
            var padre = scriptOfDeployment(query, id);
            return scriptById(query, padre || id);
        }

        var propio = scriptById(query, id);
        if (propio) return propio;
        var padre2 = scriptOfDeployment(query, id);
        return padre2 ? scriptById(query, padre2) : null;
    }

    function sendContext(hint) {
        var recordType = null;
        var recordId = null;
        try {
            if (typeof nlapiGetRecordType === 'function') recordType = nlapiGetRecordType();
            if (typeof nlapiGetRecordId === 'function') recordId = nlapiGetRecordId();
        } catch (e) { }

        if (typeof require !== 'function') {
            reply('context', { recordType: recordType, recordId: recordId, recordTypeName: null, scriptScope: null, scripts: [], allScripts: [], errorCode: 'no_require' });
            return;
        }

        require(['N/query'], function (query) {
            var scripts = [];
            var allScripts = [];
            var scope = scriptScope(query, recordType, recordId, hint && hint.scriptId);
            var typeName = (!scope && recordType) ? customRecordTypeName(query, recordType) : null;

            if (scope) {
                scripts = [scope];
            } else if (recordType) {
                try { scripts = scriptsForRecordType(query, recordType); }
                catch (e) { }
            }

            try {
                allScripts = query.runSuiteQL({
                    query: 'SELECT s.id AS id, s.name AS name, s.scripttype AS stype ' +
                        'FROM Script s ORDER BY s.name'
                }).asMappedResults();
            } catch (e2) { }

            reply('context', { recordType: recordType, recordId: recordId, recordTypeName: typeName, scriptScope: scope, scripts: scripts, allScripts: allScripts });
        }, function () {
            reply('context', { recordType: recordType, recordId: recordId, recordTypeName: null, scriptScope: null, scripts: [], allScripts: [], errorCode: 'query_load' });
        });
    }


    function sendRecordTypes() {
        if (typeof require !== 'function') {
            reply('recordtypes', { types: [], errorCode: 'no_require' });
            return;
        }
        require(['N/query'], function (query) {
            var types = [];
            try {
                types = query.runSuiteQL({
                    query: 'SELECT sd.recordtype AS rt, COUNT(DISTINCT sd.script) AS n ' +
                        'FROM ScriptDeployment sd WHERE sd.recordtype IS NOT NULL ' +
                        'GROUP BY sd.recordtype ORDER BY sd.recordtype'
                }).asMappedResults();
            } catch (e) { }

            var names = {};
            try {
                query.runSuiteQL({
                    query: 'SELECT scriptid AS sid, name AS nm FROM customrecordtype'
                }).asMappedResults().forEach(function (r) {
                    if (r.sid && r.nm) names[String(r.sid).toUpperCase()] = String(r.nm);
                });
            } catch (eN) { }

            types.forEach(function (t) {
                var key = String(t.rt || '').toUpperCase();
                if (names[key]) t.name = names[key];
            });

            reply('recordtypes', { types: types });
        }, function () {
            reply('recordtypes', { types: [], errorCode: 'query_load' });
        });
    }

    function sendScriptsFor(payload) {
        var rt = payload.recordType ? String(payload.recordType) : '';
        if (!rt || typeof require !== 'function') {
            reply('scripts_for', { recordType: rt, scripts: [] });
            return;
        }
        require(['N/query'], function (query) {
            var scripts = [];
            try { scripts = scriptsForRecordType(query, rt); }
            catch (e) { }
            reply('scripts_for', { recordType: rt, scripts: scripts });
        }, function () {
            reply('scripts_for', { recordType: rt, scripts: [] });
        });
    }

    function sendDeploysFor(payload) {
        var sid = payload.scriptId != null ? String(payload.scriptId) : '';
        if (!sid || typeof require !== 'function') {
            reply('deploys_for', { scriptId: sid, deploys: [], fileId: null });
            return;
        }
        require(['N/query'], function (query) {
            var deploys = [];
            var fileId = null;
            try {
                deploys = query.runSuiteQL({
                    query: 'SELECT sd.primarykey AS id, sd.scriptid AS did FROM ScriptDeployment sd WHERE sd.script = ? ORDER BY sd.primarykey',
                    params: [sid]
                }).asMappedResults().map(function (r) { return { id: r.id, did: r.did }; });
            } catch (e) { }
            try {
                var frows = query.runSuiteQL({
                    query: 'SELECT scriptfile AS fid FROM script WHERE id = ?',
                    params: [sid]
                }).asMappedResults();
                if (frows && frows.length && frows[0].fid != null) fileId = frows[0].fid;
            } catch (e) { }
            reply('deploys_for', { scriptId: sid, deploys: deploys, fileId: fileId });
        }, function () {
            reply('deploys_for', { scriptId: sid, deploys: [], fileId: null });
        });
    }

    var FROM_CLAUSE = 'FROM scriptNote LEFT JOIN script ON scriptNote.scripttype = script.id';

    function lit(v) {
        return "'" + String(v).replace(/'/g, "''") + "'";
    }

    var DATE_RE = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/;

    function buildWhere(f, skip, inline, plegado) {
        skip = skip || {};
        var where = [];
        var params = [];

        function val(v) {
            if (inline) return lit(v);
            params.push(String(v));
            return '?';
        }
        function valList(list) {
            return list.map(function (v) { return val(v); }).join(', ');
        }

        if (!skip.levels && f.levels && f.levels.length) {
            where.push('scriptNote.type IN (' + valList(f.levels) + ')');
        }

        if (!skip.scripts && f.scriptIds && f.scriptIds.length) {
            var ids = f.scriptIds
                .map(function (n) { return parseInt(n, 10); })
                .filter(function (n) { return !isNaN(n) && n > 0; });
            if (ids.length) where.push('script.id IN (' + ids.join(', ') + ')');
        }

        if (!skip.scriptTypes && f.scriptTypes && f.scriptTypes.length) {
            where.push('script.scripttype IN (' + valList(f.scriptTypes) + ')');
        }

        if (f.q) {
            var TS = plegado ? window.NSFT_TextSearch : null;
            var colTitulo = TS ? TS.sqlFold('scriptNote.title') : 'UPPER(scriptNote.title)';
            var needle = '%' + (TS ? TS.sqlTerm(f.q) : String(f.q).toUpperCase()) + '%';
            if (TS) {
                where.push(colTitulo + ' LIKE ' + val(needle));
            } else {
                where.push('(UPPER(scriptNote.title) LIKE ' + val(needle) +
                    ' OR UPPER(scriptNote.detail) LIKE ' + val(needle) + ')');
            }
        }

        if (f.from && DATE_RE.test(String(f.from))) {
            where.push("scriptNote.date >= TO_DATE(" + val(f.from) + ", 'YYYY-MM-DD HH24:MI:SS')");
        }
        if (f.to && DATE_RE.test(String(f.to))) {
            where.push("scriptNote.date <= TO_DATE(" + val(f.to) + ", 'YYYY-MM-DD HH24:MI:SS')");
        }

        return {
            where: where.length ? ' WHERE ' + where.join(' AND ') : '',
            params: params
        };
    }


    function puedePlegar(job) {
        return !job.reintentado && !!(job.f && job.f.q) && !!window.NSFT_TextSearch;
    }

    function tocaReintento(job, rows, total) {
        return puedePlegar(job) && !(rows && rows.length) && !total;
    }

    function pliegaYRepite(job, correr) {
        job.plegado = true;
        job.reintentado = true;
        correr(job);
    }

    function rebotaSinPliegue(job, correr) {
        if (!job.plegado) return false;
        job.plegado = false;
        correr(job);
        return true;
    }

    function sqlRows(w) {
        return 'SELECT scriptNote.internalid AS id, ' +
            "TO_CHAR(scriptNote.date, 'YYYY-MM-DD HH24:MI:SS') AS logdate, " +
            'scriptNote.type AS loglevel, scriptNote.title AS title, scriptNote.detail AS detail, ' +
            'script.name AS scriptname, script.id AS scriptid, script.scripttype AS stype ' +
            FROM_CLAUSE + w.where +
            ' ORDER BY scriptNote.internalid DESC';
    }

    function sqlLevelCounts(w) {
        return 'SELECT scriptNote.type AS k, COUNT(*) AS n ' + FROM_CLAUSE + w.where +
            ' GROUP BY scriptNote.type';
    }

    function sqlScriptCounts(w) {
        return 'SELECT scriptNote.scripttype AS k, COUNT(*) AS n ' + FROM_CLAUSE + w.where +
            ' GROUP BY scriptNote.scripttype';
    }

    function collectLevels(rows, out) {
        rows.forEach(function (r) {
            if (r && r.k) out[String(r.k).toUpperCase()] = Number(r.n) || 0;
        });
    }

    function collectScripts(rows, out) {
        rows.forEach(function (r) {
            if (r && r.k != null) out[String(r.k)] = Number(r.n) || 0;
        });
    }

    var REST_URL = '/services/rest/query/v1/suiteql';

    function restQuery(sql, limit, offset) {
        return fetch(REST_URL + '?limit=' + limit + '&offset=' + offset, {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json', 'Prefer': 'transient' },
            body: JSON.stringify({ q: sql })
        }).then(function (res) {
            if (!res.ok) return { ok: false, status: res.status };
            return res.json().then(function (j) {
                var items = Array.isArray(j.items) ? j.items : [];
                return {
                    ok: true,
                    rows: items.map(function (it) {
                        var row = {};
                        Object.keys(it).forEach(function (k) { if (k !== 'links') row[k] = it[k]; });
                        return row;
                    }),
                    total: (typeof j.totalResults === 'number') ? j.totalResults : 0,
                    hasMore: !!j.hasMore
                };
            });
        }).catch(function () {
            return { ok: false, status: 0 };
        });
    }

    var restAnnouncedOn = false;

    function logsViaRest(job) {
        var w = buildWhere(job.f, null, true, job.plegado);
        restQuery(sqlRows(w), job.pageSize, job.pageIndex * job.pageSize).then(function (r) {
            if (!r.ok) {
                restAnnouncedOn = false;
                reply('rest_state', { on: false, status: r.status });
                logsViaQuery(job);
                return;
            }
            if (!restAnnouncedOn) {
                restAnnouncedOn = true;
                reply('rest_state', { on: true });
            }

            var total = r.total;
            if (!total && r.rows.length) {
                total = job.pageIndex * job.pageSize + r.rows.length + (r.hasMore ? 1 : 0);
            }

            if (tocaReintento(job, r.rows, total)) { pliegaYRepite(job, logsViaRest); return; }

            reply('logs', {
                reqId: job.reqId,
                rows: r.rows,
                total: total,
                page: job.pageIndex,
                pageSize: job.pageSize,
                ms: Date.now() - job.t0,
                via: 'rest'
            });
            if (job.pageIndex === 0) restCounts(job);
        });
    }

    function restCounts(job) {
        var wl = buildWhere(job.f, { levels: true }, true, job.plegado);
        var ws = buildWhere(job.f, { scripts: true, scriptTypes: true }, true, job.plegado);
        Promise.all([
            restQuery(sqlLevelCounts(wl), 1000, 0),
            restQuery(sqlScriptCounts(ws), 1000, 0)
        ]).then(function (res) {
            var counts = { levels: {}, scripts: {} };
            if (res[0].ok) collectLevels(res[0].rows, counts.levels);
            if (res[1].ok) collectScripts(res[1].rows, counts.scripts);
            reply('logs_counts', { reqId: job.reqId, counts: counts });
        });
    }


    function mapResults(rs) {
        if (!rs) return [];
        if (rs.asMappedResults && typeof rs.asMappedResults.promise === 'function') {
            return rs.asMappedResults.promise();
        }
        return rs.asMappedResults();
    }

    function pRunSuiteQL(query, sql, params) {
        var cfg = { query: sql, params: params };
        try {
            if (query.runSuiteQL && typeof query.runSuiteQL.promise === 'function') {
                return query.runSuiteQL.promise(cfg).then(mapResults);
            }
            return Promise.resolve(mapResults(query.runSuiteQL(cfg)));
        } catch (e) { return Promise.reject(e); }
    }

    function pRunPaged(query, sql, params, pageSize) {
        var cfg = { query: sql, params: params, pageSize: pageSize };
        try {
            if (query.runSuiteQLPaged && typeof query.runSuiteQLPaged.promise === 'function') {
                return query.runSuiteQLPaged.promise(cfg);
            }
            return Promise.resolve(query.runSuiteQLPaged(cfg));
        } catch (e) { return Promise.reject(e); }
    }

    function pFetchPage(paged, index) {
        if (paged.fetch && typeof paged.fetch.promise === 'function') {
            return paged.fetch.promise({ index: index }).catch(function () {
                return paged.fetch(index);
            });
        }
        try { return Promise.resolve(paged.fetch({ index: index })); }
        catch (e) { return Promise.resolve(paged.fetch(index)); }
    }

    function logsViaQuery(job) {
        if (typeof require !== 'function') {
            if (rebotaSinPliegue(job, logsViaQuery)) return;
            reply('logs_error', { reqId: job.reqId, errorCode: 'no_require' });
            return;
        }
        require(['N/query'], function (query) {
            var w = buildWhere(job.f, null, false, job.plegado);
            pRunPaged(query, sqlRows(w), w.params, job.pageSize).then(function (paged) {
                var total = paged.count || 0;
                if (!total || !paged.pageRanges || job.pageIndex >= paged.pageRanges.length) {
                    return { rows: [], total: total };
                }
                return pFetchPage(paged, job.pageIndex).then(function (page) {
                    var data = page && page.data;
                    if (!data || typeof data.asMappedResults !== 'function') {
                        return { rows: [], total: total };
                    }
                    return Promise.resolve(mapResults(data)).then(function (rows) {
                        return { rows: rows || [], total: total };
                    });
                });
            }).then(function (r) {
                if (tocaReintento(job, r.rows, r.total)) { pliegaYRepite(job, logsViaQuery); return; }
                reply('logs', {
                    reqId: job.reqId,
                    rows: r.rows,
                    total: r.total,
                    page: job.pageIndex,
                    pageSize: job.pageSize,
                    ms: Date.now() - job.t0,
                    via: 'nquery'
                });
                if (job.pageIndex === 0) queryCounts(query, job);
            }).catch(function (e) {
                if (rebotaSinPliegue(job, logsViaQuery)) return;
                reply('logs_error', {
                    reqId: job.reqId,
                    errorCode: 'query_failed',
                    message: (e && e.message) ? String(e.message) : String(e)
                });
            });
        }, function () {
            if (rebotaSinPliegue(job, logsViaQuery)) return;
            reply('logs_error', { reqId: job.reqId, errorCode: 'query_load' });
        });
    }

    function queryCounts(query, job) {
        var wl = buildWhere(job.f, { levels: true }, false, job.plegado);
        var ws = buildWhere(job.f, { scripts: true, scriptTypes: true }, false, job.plegado);
        var counts = { levels: {}, scripts: {} };
        Promise.all([
            pRunSuiteQL(query, sqlLevelCounts(wl), wl.params)
                .then(function (rows) { collectLevels(rows || [], counts.levels); })
                .catch(function () { }),
            pRunSuiteQL(query, sqlScriptCounts(ws), ws.params)
                .then(function (rows) { collectScripts(rows || [], counts.scripts); })
                .catch(function () { })
        ]).then(function () {
            reply('logs_counts', { reqId: job.reqId, counts: counts });
        });
    }

    var EXPORT_CHUNK = 1000;
    var EXPORT_MAX = 10000;

    function exportJob(f) {
        return {
            f: f,
            t0: Date.now(),
            reqId: f.reqId,
            max: Math.max(1, Math.min(EXPORT_MAX, parseInt(f.max, 10) || EXPORT_MAX)),
            chunk: EXPORT_CHUNK,
            plegado: false,
            reintentado: false
        };
    }

    function finishExport(job, rows, total) {
        reply('logs_export', {
            reqId: job.reqId,
            rows: rows,
            total: total || rows.length,
            truncated: rows.length >= job.max && (!total || total > rows.length),
            ms: Date.now() - job.t0
        });
    }

    function exportViaRest(job) {
        var w = buildWhere(job.f, null, true, job.plegado);
        var sql = sqlRows(w);
        var rows = [];
        var total = 0;

        function step(offset) {
            var want = Math.min(job.chunk, job.max - rows.length);
            return restQuery(sql, want, offset).then(function (r) {
                if (!r.ok) return { fail: r.status };
                if (r.total) total = r.total;
                rows = rows.concat(r.rows);
                reply('logs_export_progress', {
                    reqId: job.reqId,
                    loaded: rows.length,
                    total: total || rows.length
                });
                if (rows.length >= job.max || r.rows.length < want) return { done: true };
                if (total && rows.length >= total) return { done: true };
                return step(offset + r.rows.length);
            });
        }

        step(0).then(function (out) {
            if (out && out.fail !== undefined) {
                restAnnouncedOn = false;
                reply('rest_state', { on: false, status: out.fail });
                exportViaQuery(job);
                return;
            }
            if (!restAnnouncedOn) {
                restAnnouncedOn = true;
                reply('rest_state', { on: true });
            }
            if (tocaReintento(job, rows, total)) { pliegaYRepite(job, exportViaRest); return; }
            finishExport(job, rows, total);
        });
    }

    function exportViaQuery(job) {
        if (typeof require !== 'function') {
            if (rebotaSinPliegue(job, exportViaQuery)) return;
            reply('logs_export_error', { reqId: job.reqId, errorCode: 'no_require' });
            return;
        }
        require(['N/query'], function (query) {
            var w = buildWhere(job.f, null, false, job.plegado);
            pRunPaged(query, sqlRows(w), w.params, job.chunk).then(function (paged) {
                var total = paged.count || 0;
                var ranges = paged.pageRanges || [];
                var rows = [];

                function step(i) {
                    if (i >= ranges.length || rows.length >= job.max) return Promise.resolve();
                    return pFetchPage(paged, i).then(function (page) {
                        var data = page && page.data;
                        if (!data || typeof data.asMappedResults !== 'function') return null;
                        return Promise.resolve(mapResults(data)).then(function (part) {
                            rows = rows.concat(part || []);
                            if (rows.length > job.max) rows = rows.slice(0, job.max);
                            reply('logs_export_progress', {
                                reqId: job.reqId,
                                loaded: rows.length,
                                total: total || rows.length
                            });
                            return step(i + 1);
                        });
                    });
                }

                return step(0).then(function () {
                    if (tocaReintento(job, rows, total)) { pliegaYRepite(job, exportViaQuery); return; }
                    finishExport(job, rows, total);
                });
            }).catch(function (e) {
                if (rebotaSinPliegue(job, exportViaQuery)) return;
                reply('logs_export_error', {
                    reqId: job.reqId,
                    errorCode: 'query_failed',
                    message: (e && e.message) ? String(e.message) : String(e)
                });
            });
        }, function () {
            if (rebotaSinPliegue(job, exportViaQuery)) return;
            reply('logs_export_error', { reqId: job.reqId, errorCode: 'query_load' });
        });
    }

    function runExport(f) {
        var job = exportJob(f);
        if (f.restOff || typeof fetch !== 'function') { exportViaQuery(job); return; }
        exportViaRest(job);
    }

    function runLogs(f) {
        var job = {
            f: f,
            t0: Date.now(),
            reqId: f.reqId,
            pageSize: Math.max(10, Math.min(500, parseInt(f.pageSize, 10) || 100)),
            pageIndex: Math.max(0, parseInt(f.page, 10) || 0),
            plegado: false,
            reintentado: false
        };
        if (f.restOff || typeof fetch !== 'function') { logsViaQuery(job); return; }
        logsViaRest(job);
    }
})();
