(function () {
    'use strict';

    if (typeof require !== 'undefined') {
        require(['N/query'], function () { });
    }

    window.addEventListener('message', function (event) {
        if (event.source !== window) return;
        const data = event.data;
        if (!data || data.dest !== 'fetcher_fip') return;
        if (data.type === 'getFieldInfo') {
            const scriptid = (data.payload && data.payload.scriptid) || '';
            lookup(scriptid);
        } else if (data.type === 'getRecordContext') {
            returnRecordContext();
        } else if (data.type === 'getFieldType') {
            returnFieldType(data.payload || {});
        }
    });

    function returnFieldType(payload) {
        const scriptid = String(payload.scriptid || '').trim();
        const context = payload.context || 'body';
        const sublistId = String(payload.sublistId || '');
        let type = null;
        try {
            let fld = null;
            if (context === 'sublistcol' && sublistId && typeof nlapiGetLineItemField === 'function') {
                try { fld = nlapiGetLineItemField(sublistId, scriptid); } catch (_) { fld = null; }
            }
            if (!fld && typeof nlapiGetField === 'function') {
                fld = nlapiGetField(scriptid);
            }
            if (fld) {
                if (typeof fld.getType === 'function') type = fld.getType();
                else if (fld.type) type = fld.type;
            }
        } catch (_) { }
        window.postMessage({
            dest: 'extension_fip',
            type: 'fieldTypeResult',
            payload: { scriptid: scriptid.toLowerCase(), context, sublistId, type: type || null }
        }, '*');
    }

    function returnRecordContext() {
        let recordType = null;
        let recordId = null;
        try {
            if (typeof nlapiGetRecordType === 'function') recordType = nlapiGetRecordType();
        } catch (_) { }
        try {
            if (typeof nlapiGetRecordId === 'function') recordId = nlapiGetRecordId();
        } catch (_) { }
        window.postMessage({
            dest: 'extension_fip',
            type: 'recordContextResult',
            payload: { recordType, recordId }
        }, '*');
    }

    function lookup(scriptid) {
        scriptid = String(scriptid || '').trim();
        if (!scriptid) {
            reply('', [], 'Empty scriptid');
            return;
        }
        const T = window.NSFT_SQL;
        if (!T) {
            reply(scriptid, [], 'SuiteQL transport unavailable');
            return;
        }

        const where = `WHERE UPPER(scriptid) = UPPER(${T.lit(scriptid)})`;
        const baseCols = 'scriptid, name, fieldvaluetype, fieldvaluetyperecord, recordType';
        const richQuery = `SELECT ${baseCols}, BUILTIN.DF(fieldvaluetyperecord) AS fieldvaluetyperecordname FROM customfield ${where}`;
        const baseQuery = `SELECT ${baseCols} FROM customfield ${where}`;

        T.run({
            rest: richQuery,
            sql: richQuery,
            limit: 5,
            fallback: { rest: baseQuery, sql: baseQuery, limit: 5 }
        }, function (err, rows) {
            if (err) {
                reply(scriptid, [], err.message || err.code || 'query');
                return;
            }
            reply(scriptid, (rows || []).map(function (r) {
                return {
                    scriptid: r.scriptid,
                    name: r.name,
                    fieldvaluetype: r.fieldvaluetype,
                    fieldvaluetyperecord: r.fieldvaluetyperecord,
                    fieldvaluetyperecordname: r.fieldvaluetyperecordname || null,
                    recordtype: r.recordtype
                };
            }), null);
        });
    }

    function reply(scriptid, rows, error) {
        window.postMessage({
            dest: 'extension_fip',
            type: 'fieldInfoResult',
            payload: { scriptid, rows, error }
        }, '*');
    }
})();
