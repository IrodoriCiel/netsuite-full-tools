(function () {
    'use strict';


    let _stopRequested = false;

    function dbg() {
        try {
            if (!window.NSFT_SQL_DEBUG) return;
            const args = ['[NSFT SQL]'].concat(Array.prototype.slice.call(arguments));
            console.log.apply(console, args);
        } catch (e) { }
    }

    window.addEventListener('message', function (event) {
        if (event.data.dest === 'fetcher_sql' && event.data.type === 'stop_SQL') {
            _stopRequested = true;
            return;
        }
        if (event.data.dest === 'fetcher_sql' && event.data.type === 'execute_SQL') {
            _stopRequested = false;
            executeSuiteQL(event.data.payload, event.data.reqId);
        } else if (event.data.dest === 'fetcher_sql' && event.data.type === 'resolve_scriptid') {
            resolveScriptId(event.data.payload);
        } else if (event.data.dest === 'fetcher_sql' && event.data.type === 'update_record') {
            updateRecord(event.data.payload, event.data.reqId);
        }
    });

    function updateRecord(payload, reqId) {
        try {
            if (typeof require === 'undefined') {
                sendError("'require' is not defined. Ensure you are on a NetSuite page.", reqId);
                return;
            }
            require(['N/record'], function (record) {
                try {
                    const id = record.submitFields({
                        recordType: payload.recordType,
                        id: payload.recordId,
                        values: payload.values || {},
                        options: { enableSourcing: true, ignoreMandatoryFields: false }
                    });
                    sendResults({ updated: true, recordType: payload.recordType, id: id }, 1, 0, null, reqId);
                } catch (e) {
                    sendError(e.name + ': ' + e.message, reqId);
                }
            });
        } catch (e) {
            sendError(e.name + ': ' + e.message, reqId);
        }
    }

    function resolveScriptId(payload) {
        const recordId = payload && payload.id;
        try {
            if (typeof require === 'undefined') { sendResolvedScriptId(null, recordId); return; }
            require(['N/query'], function (query) {
                try {
                    const rs = query.runSuiteQL({
                        query: 'SELECT scriptid FROM customrecordtype WHERE internalid = ?',
                        params: [payload.rectype]
                    });
                    const rows = rs.asMappedResults();
                    const row = rows && rows[0];
                    const scriptid = row ? (row.scriptid || row.SCRIPTID || null) : null;
                    sendResolvedScriptId(scriptid, recordId);
                } catch (e) {
                    sendResolvedScriptId(null, recordId);
                }
            });
        } catch (e) {
            sendResolvedScriptId(null, recordId);
        }
    }

    function sendResolvedScriptId(scriptid, recordId) {
        window.postMessage({
            dest: 'extension_sql',
            type: 'resolved_scriptid',
            payload: { scriptid: scriptid, recordId: recordId }
        }, '*');
    }

    function columnNames(resultSet) {
        try {
            const cols = resultSet && resultSet.columns;
            if (!Array.isArray(cols) || !cols.length) return null;
            const names = cols.map(function (c) {
                return (c && (c.alias || c.fieldId || c.label)) || null;
            }).filter(Boolean);
            return names.length ? names : null;
        } catch (e) {
            return null;
        }
    }

    function executeSuiteQL(queryData, reqId) {
        try {
            if (typeof require === 'undefined') {
                sendError("'require' is not defined. Ensure you are on a NetSuite page.", reqId);
                return;
            }

            const arrancar = function (query, runtime) {
                try {
                    const startTime = Date.now();

                    if (reqId) {
                        const onRows = function (rows, cols) {
                            sendResults(rows, rows.length, Date.now() - startTime, queryData.query, reqId, cols);
                        };
                        const onFail = function (e) {
                            sendError(((e && e.name) || 'Error') + ': ' + ((e && e.message) || e), reqId);
                        };
                        if (query.runSuiteQL.promise) {
                            query.runSuiteQL.promise({ query: queryData.query })
                                .then(function (rs) {
                                    const cols = columnNames(rs);
                                    const mapped = rs.asMappedResults.promise ? rs.asMappedResults.promise() : rs.asMappedResults();
                                    return Promise.resolve(mapped).then(function (rows) { onRows(rows, cols); });
                                })
                                .catch(onFail);
                            return;
                        }
                        const rs = query.runSuiteQL({ query: queryData.query });
                        onRows(rs.asMappedResults(), columnNames(rs));
                        return;
                    }

                    if (!reqId) {
                        fetchPagedAsync(query, runtime, queryData, startTime, reqId);
                        return;
                    }

                    const resultSet = query.runSuiteQLPaged({
                        query: queryData.query,
                        pageSize: 1000
                    });

                    const totalCount = resultSet.count;
                    if (totalCount === 0) {
                        sendResults([], 0, Date.now() - startTime, queryData.query, reqId);
                        return;
                    }

                    let allData = [];
                    let columns = null;
                    const maxRecords = (queryData && queryData.maxRecords) || 5000;
                    const maxPagesToFetch = Math.max(1, Math.ceil(maxRecords / 1000));
                    const actualPages = resultSet.pageRanges.length;
                    const PAGES_PER_RUN = 5;
                    const fromPage = Math.max(0, Number(queryData && queryData.fromPage) || 0);
                    const lastPage = Math.min(actualPages, maxPagesToFetch);
                    const perRun = reqId ? maxPagesToFetch : PAGES_PER_RUN;
                    const untilPage = Math.min(lastPage, fromPage + perRun);

                    let limitHit = null;
                    for (let i = fromPage; i < untilPage; i++) {
                        try {
                            const page = resultSet.fetch(i);
                            if (!columns) columns = columnNames(page.data);
                            allData = allData.concat(page.data.asMappedResults());
                        } catch (pageErr) {
                            limitHit = pageErr;
                            break;
                        }
                    }
                    if (limitHit && allData.length === 0 && fromPage === 0) throw limitHit;

                    const executionTime = Date.now() - startTime;
                    const done = limitHit || untilPage >= lastPage;
                    const stopReason = limitHit ? 'limit'
                        : (done && lastPage < actualPages ? 'max' : 'complete');
                    const nextPage = done ? null : untilPage;
                    sendResults(allData, totalCount, executionTime, queryData.query, reqId, columns, stopReason, nextPage);

                }
                catch (e) {
                    const seguia = Number(queryData && queryData.fromPage) > 0;
                    if (seguia) {
                        sendResults([], 0, 0, queryData.query, reqId, null, 'limit', null);
                    } else {
                        sendError(e.name + ": " + e.message, reqId);
                    }
                }
            };

            dbg('pidiendo N/query + N/runtime');
            require(['N/query', 'N/runtime'],
                function (query, runtime) { dbg('modulos cargados'); arrancar(query, runtime); },
                function () {
                    require(['N/query'], function (query) { arrancar(query, null); });
                });
        }
        catch (e) {
            sendError(e.name + ": " + e.message, reqId);
        }
    }

    async function fetchPagedAsync(query, runtime, queryData, startTime, reqId) {
        const MIN_PAGE = 50;
        const MIN_UNITS = 30;
        const BREATH_MS = 150;
        const maxRecords = (queryData && queryData.maxRecords) || 5000;
        const pageSize = Math.min(1000, Math.max(MIN_PAGE, Number(queryData && queryData.pageSize) || 1000));

        let rows = [];
        let columns = null;
        let stopReason = 'complete';
        let totalCount = 0;
        let avisadoOrden = false;

        const scriptObj = (runtime && runtime.getCurrentScript) ? runtime.getCurrentScript() : null;
        const puntos = function () {
            try {
                return (scriptObj && scriptObj.getRemainingUsage) ? scriptObj.getRemainingUsage() : Infinity;
            } catch (e) { return Infinity; }
        };

        try {
            dbg('arrancando; pageSize =', pageSize, '| maxRecords =', maxRecords);
            sendProgress(0, puntos());
            await new Promise(function (r) { setTimeout(r, 0); });

            const paged = query.runSuiteQLPaged({ query: queryData.query, pageSize: pageSize });
            totalCount = paged.count;
            dbg('paginada montada; count =', totalCount, '| paginas =', paged.pageRanges.length);
            if (!totalCount) {
                sendResults([], 0, Date.now() - startTime, queryData.query, reqId, null, 'complete', null, pageSize);
                return;
            }

            const maxPages = Math.max(1, Math.ceil(maxRecords / pageSize));
            const totalPages = paged.pageRanges.length;
            const lastPage = Math.min(totalPages, maxPages);

            for (let i = 0; i < lastPage; i++) {
                if (_stopRequested) { stopReason = 'user'; break; }
                const restantes = puntos();
                if (restantes < MIN_UNITS) { stopReason = 'governance'; break; }

                dbg('leyendo pagina', i, '| puntos', restantes);
                const t0 = Date.now();
                const page = paged.fetch(i);
                if (!columns) columns = columnNames(page.data);
                rows = rows.concat(page.data.asMappedResults());
                const msPagina = Date.now() - t0;
                dbg('pagina', i, 'lista en', msPagina, 'ms |', rows.length, 'filas');
                if (!avisadoOrden && msPagina > 20000 && !/\border\s+by\b/i.test(String(queryData.query || ''))) {
                    avisadoOrden = true;
                    sendNotice('sql_slow_no_order');
                }
                sendProgress(rows.length, restantes);
                await new Promise(function (r) { setTimeout(r, BREATH_MS); });
            }
            if (stopReason === 'complete' && lastPage < totalPages) stopReason = 'max';

            dbg('fin:', rows.length, 'filas |', stopReason);
            sendResults(rows, totalCount, Date.now() - startTime, queryData.query, reqId,
                columns, stopReason, null, pageSize);
        } catch (e) {
            dbg('excepcion:', (e && e.name), (e && e.message));
            const msg = ((e && e.message) || '') + '';
            const porGobernanza = /USAGE_LIMIT|governance/i.test(msg);
            if (!rows.length && !porGobernanza && pageSize > MIN_PAGE) {
                sendProgress(0, puntos());
                const copia = {};
                Object.keys(queryData || {}).forEach(function (k) { copia[k] = queryData[k]; });
                copia.pageSize = Math.max(MIN_PAGE, Math.floor(pageSize / 4));
                fetchPagedAsync(query, runtime, copia, startTime, reqId);
                return;
            }
            if (!rows.length) {
                sendError(((e && e.name) || 'Error') + ': ' + ((e && e.message) || e), reqId);
                return;
            }
            sendResults(rows, totalCount, Date.now() - startTime, queryData.query, reqId,
                columns, porGobernanza ? 'governance' : 'limit', null, pageSize);
        }
    }
    function sendNotice(key) {
        window.postMessage({
            dest: 'extension_sql', type: 'notice', payload: { key: key }
        }, '*');
    }

    function sendProgress(fetched, units) {
        window.postMessage({
            dest: 'extension_sql', type: 'progress',
            payload: { fetched: fetched, units: Number.isFinite(units) ? units : null }
        }, '*');
    }

    function sendResults(data, count, time, query, reqId, columns, stopReason, nextPage, pageSize) {
        window.postMessage({
            dest: reqId ? 'extension_sql_ai' : 'extension_sql',
            type: 'results',
            reqId: reqId,
            payload: {
                data: data,
                count: count,
                executionTime: time,
                query: query,
                columns: columns || null,
                stopReason: stopReason || 'complete',
                nextPage: (typeof nextPage === 'number') ? nextPage : null,
                pageSize: (typeof pageSize === 'number') ? pageSize : null
            }
        }, '*');
    }

    function sendError(text, reqId) {
        window.postMessage({
            dest: reqId ? 'extension_sql_ai' : 'extension_sql',
            type: 'error',
            reqId: reqId,
            text: text
        }, '*');
    }
})();
