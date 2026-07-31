(function () {
    'use strict';

    let _recordTypeSent = false;
    function sendCurrentRecordType() {
        if (_recordTypeSent) return;
        try {
            if (typeof nlapiGetRecordType === 'function') {
                const recordType = nlapiGetRecordType();
                if (recordType) {
                    _recordTypeSent = true;
                    window.postMessage({
                        type: 'nsft-record-type-value',
                        recordType: recordType
                    }, '*');
                }
            }
        } catch (e) {
            console.warn('NSFT: Error getting record type', e);
        }
    }

    window.addEventListener('load', sendCurrentRecordType);
    sendCurrentRecordType();

    const _recordTypeCache = new Map();

    window.addEventListener('message', (event) => {
        if (event.source !== window) return;
        const data = event.data;
        if (!data || data.type !== 'nsft-request-custom-record-id') return;

        const fieldScriptId = String(data.fieldScriptId || '').trim();
        const requestId = data.requestId;

        if (!fieldScriptId) {
            window.postMessage({
                type: 'nsft-custom-record-id-result',
                error: 'EMPTY_SCRIPT_ID',
                requestId: requestId
            }, '*');
            return;
        }

        const cacheKey = fieldScriptId.toUpperCase();
        if (_recordTypeCache.has(cacheKey)) {
            const hit = _recordTypeCache.get(cacheKey);
            window.postMessage({
                type: 'nsft-custom-record-id-result',
                recordType: hit.recordType,
                recordName: hit.recordName,
                requestId: requestId
            }, '*');
            return;
        }

        if (typeof require !== 'function') {
            window.postMessage({
                type: 'nsft-custom-record-id-result',
                error: 'NO_REQUIRE',
                requestId: requestId
            }, '*');
            return;
        }

        try {
            require(['N/query'], function (query) {
                try {
                    const sql =
                        "SELECT customfield.recordType AS recordtype, " +
                        "BUILTIN.DF(customfield.recordType) AS recordname " +
                        "FROM customfield " +
                        "WHERE UPPER(customfield.scriptid) = ?";
                    const res = query.runSuiteQL({ query: sql, params: [cacheKey] }).asMappedResults();
                    if (res && res.length > 0 && res[0].recordtype) {
                        const recordName = res[0].recordname || '';
                        _recordTypeCache.set(cacheKey, { recordType: res[0].recordtype, recordName: recordName });
                        window.postMessage({
                            type: 'nsft-custom-record-id-result',
                            recordType: res[0].recordtype,
                            recordName: recordName,
                            requestId: requestId
                        }, '*');
                    } else {
                        window.postMessage({
                            type: 'nsft-custom-record-id-result',
                            error: 'NOT_FOUND',
                            requestId: requestId
                        }, '*');
                    }
                } catch (e) {
                    const m = (e && e.message) ? e.message : '';
                    const isPerm = /permission|insufficient|not\s+authorized|SSS_/i.test(m);
                    window.postMessage({
                        type: 'nsft-custom-record-id-result',
                        error: isPerm ? 'PERMISSION' : (m || 'SUITEQL_ERROR'),
                        requestId: requestId
                    }, '*');
                }
            }, function (err) {
                window.postMessage({
                    type: 'nsft-custom-record-id-result',
                    error: (err && err.message) || 'REQUIRE_FAILED',
                    requestId: requestId
                }, '*');
            });
        } catch (e) {
            window.postMessage({
                type: 'nsft-custom-record-id-result',
                error: (e && e.message) || 'UNEXPECTED',
                requestId: requestId
            }, '*');
        }
    });
})();
