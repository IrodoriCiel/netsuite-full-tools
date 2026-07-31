(function () {
    'use strict';


    window.addEventListener('message', function (event) {
        if (event.data.dest === 'fetcher_sql' && event.data.type === 'execute_SQL') {
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

            require(['N/query'], function (query) {
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
                    const pagesToFetch = Math.min(actualPages, maxPagesToFetch);

                    for (let i = 0; i < pagesToFetch; i++) {
                        const page = resultSet.fetch(i);
                        if (!columns) columns = columnNames(page.data);
                        allData = allData.concat(page.data.asMappedResults());
                    }

                    const executionTime = Date.now() - startTime;
                    sendResults(allData, totalCount, executionTime, queryData.query, reqId, columns);

                }
                catch (e) {
                    sendError(e.name + ": " + e.message, reqId);
                }
            });
        }
        catch (e) {
            sendError(e.name + ": " + e.message, reqId);
        }
    }

    function sendResults(data, count, time, query, reqId, columns) {
        window.postMessage({
            dest: reqId ? 'extension_sql_ai' : 'extension_sql',
            type: 'results',
            reqId: reqId,
            payload: {
                data: data,
                count: count,
                executionTime: time,
                query: query,
                columns: columns || null
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
