(function () {
    'use strict';

    if (window.__nsftSrFetcherLoaded) return;
    window.__nsftSrFetcherLoaded = true;

    let translations = {};

    window.addEventListener('message', function (event) {
        if (event.source !== window) return;
        const d = event.data;
        if (!d || typeof d !== 'object') return;
        if (d.dest === 'fetcher_sr' && d.type === 'getRecord_SR') {
            if (d.translations) {
                translations = d.translations;
            }
            fetchData();
        } else if (d.dest === 'fetcher_sr' && d.type === 'getLogs_SR') {
            fetchLogs(d.scriptId, d.requestId);
        } else if (d.dest === 'fetcher_sr' && d.type === 'updateDeployments_SR') {
            updateDeployments(d.changes, d.requestId);
        }
    });

    function sendMessageToExtension(type, text = null, data = null, extra = {}) {
        window.postMessage(Object.assign({ dest: 'extension_sr', type, text, data }, extra), '*');
    }

    function fetchLogs(scriptId, requestId) {
        const T = window.NSFT_SQL;
        if (!T || !scriptId) {
            sendMessageToExtension('logs_error', 'SuiteQL transport o scriptId faltante', null, { requestId });
            return;
        }
        {
            const sql = `
                SELECT * FROM (
                    SELECT TO_CHAR(n.date, 'YYYY-MM-DD HH24:MI:SS') AS ts,
                           n.type AS type,
                           n.title AS title,
                           n.detail AS detail
                    FROM ScriptNote n
                    WHERE n.scripttype = ?
                    ORDER BY n.date DESC
                ) WHERE ROWNUM <= 100
            `;

            T.run({
                rest: sql.replace('n.scripttype = ?', 'n.scripttype = ' + T.lit(scriptId)),
                sql: sql,
                params: [scriptId],
                limit: 100
            }, function (err, rows) {
                if (err) {
                    sendMessageToExtension('logs_error', err.message || err.code || 'unknown', null, { requestId });
                    return;
                }
                sendMessageToExtension('logs_success', null, rows || [], { requestId });
            });
        }
    }

    function updateDeployments(changes, requestId) {
        if (!Array.isArray(changes) || changes.length === 0) {
            sendMessageToExtension('bulk_error', 'No hay cambios', null, { requestId });
            return;
        }
        if (typeof require !== 'function') {
            sendMessageToExtension('bulk_error', 'RequireJS no encontrado', null, { requestId });
            return;
        }
        require(['N/record'], function (record) {
            const results = [];
            changes.forEach(function (change) {
                try {
                    const boolValue = (change.isdeployed === true) ||
                        (typeof change.isdeployed === 'string' && /^t(rue)?$/i.test(change.isdeployed));
                    record.submitFields({
                        type: record.Type.SCRIPT_DEPLOYMENT,
                        id: change.deploymentId,
                        values: { isdeployed: boolValue }
                    });
                    results.push({ deploymentId: change.deploymentId, ok: true });
                } catch (e) {
                    results.push({
                        deploymentId: change.deploymentId,
                        ok: false,
                        error: (e && e.message) || String(e)
                    });
                }
            });
            sendMessageToExtension('bulk_success', null, results, { requestId });
        });
    }

    function fetchData() {
        try {
            if (typeof nlapiGetRecordType === 'undefined' || typeof nlapiGetRecordId === 'undefined') {
                const currentUrl = window.location.href;
                if (currentUrl.includes('custlist.nl') || currentUrl.includes('custrecord.nl')) {
                    const urlParams = new URLSearchParams(window.location.search);
                    const custListId = urlParams.get('id');
                    if (custListId) {
                        handleCustomList(custListId);
                        return;
                    }
                }
                sendMessageToExtension('error', translations.sr_error_not_scriptable_page || 'Not a recognized scriptable record page.');
                return;
            }

            const recordType = nlapiGetRecordType();
            const recordId = nlapiGetRecordId();
            const context = (typeof nlapiGetContext === 'function') ? nlapiGetContext() : null;
            const company = context ? context.company.replace('_', '-') : '';

            if (!recordType) {
                sendMessageToExtension('error', translations.sr_error_no_record_type || 'Could not determine Record Type.');
                return;
            }

            const T = window.NSFT_SQL;
            if (!T) {
                sendMessageToExtension('error', translations.sr_error_require_not_found || 'RequireJS not found. Cannot load N/query.');
                return;
            }

            {
                try {
                    const functionFields = [
                        'beforesubmitfunction', 'summarizefunction', 'mapfunction', 'getinputdatafunction',
                        'beforeloadfunction', 'aftersubmitfunction', 'reducefunction', 'getfunction',
                        'beforeinstallfunction', 'afterupdatefunction', 'postfunction',
                        'beforeuninstallfunction', 'deletefunction', 'saverecordfunction',
                        'validatelinefunction', 'validateinsertfunction', 'pageinitfunction',
                        'lineinitfunction', 'validatedeletefunction', 'recalcfunction',
                        'validatefieldfunction', 'putfunction', 'afterinstallfunction',
                        'fieldchangedfunction', 'beforeupdatefunction', 'defaultfunction',
                        'postsourcingfunction'
                    ];

                    let sql = `
                        SELECT
                             s.name, s.apiversion, s.id as script_internal_id, s.scriptid as script_text_id, s.scripttype, s.description, s.scriptfile, s.isinactive,
                            sd.primarykey as deployment_id, sd.scriptid as deployment_text_id, sd.status, sd.isdeployed,
                            emp.firstName || ' ' || emp.lastName  AS owner,
                            ${functionFields.map(f => `s.${f}`).join(', ')}
                        FROM
                            ScriptDeployment sd
                        INNER JOIN
                            Script s ON sd.script = s.id
                        INNER JOIN
                            Employee emp ON s.owner = emp.id
                        WHERE
                            sd.recordtype = ?
                    `;

                    T.run({
                        rest: sql.replace('sd.recordtype = ?', 'sd.recordtype = ' + T.lit(String(recordType).toUpperCase())),
                        sql: sql,
                        params: [String(recordType).toUpperCase()],
                        limit: 1000
                    }, function (qErr, results) {
                        if (qErr) {
                            sendMessageToExtension('error', (translations.sr_error_logic || 'SuiteQL/Logic Error: ') + (qErr.message || qErr.code || ''));
                            return;
                        }
                        try {

                        var scriptDeploymentResults = {};
                        results.forEach((row) => {
                            const rawScriptType = row.scripttype || 'UNKNOWN';
                            let scriptType = rawScriptType;
                            if (scriptType === 'USEREVENT') scriptType = translations.sr_script_type_user_event || 'USER EVENT';
                            else if (scriptType === 'ACTION') scriptType = translations.sr_script_type_workflow_action || 'WORKFLOW ACTION';

                            if (!scriptDeploymentResults[rawScriptType]) {
                                scriptDeploymentResults[rawScriptType] = [];
                            }

                            let functions = [];
                            functionFields.forEach(f => {
                                let val = row[f.toLowerCase()];
                                if (val && val !== 'F') functions.push({ type: f.replace('function', ''), name: val });
                            });

                            scriptDeploymentResults[rawScriptType].push({
                                name: row.name,
                                scriptId: row.script_internal_id,
                                scriptTextId: row.script_text_id,
                                deploymentId: row.deployment_id,
                                deploymentTextId: row.deployment_text_id,
                                status: row.status,
                                isDeployed: row.isdeployed,
                                isInactive: row.isinactive,
                                scriptType: scriptType,
                                rawScriptType: rawScriptType,
                                scriptFile: `https://${company}.app.netsuite.com/app/common/record/edittextmediaitem.nl?id=${row.scriptfile}&e=T&l=T&target=filesize&syntaxHighlighting=T`,
                                url: `https://${company}.app.netsuite.com/app/common/scripting/script.nl?id=${row.script_internal_id}`,
                                owner: row.owner,
                                apiVersion: row.apiversion,
                                description: row.description,
                                functions: functions
                            });
                        });

                        var workflowResults = [];
                        try {
                            if (typeof nlapiSearchRecord === 'function') {
                                var workflowSearch = nlapiSearchRecord('workflow', null,
                                    [['subrecordtype', 'anyof', recordType.toUpperCase()]],
                                    [
                                        new nlobjSearchColumn('name'),
                                        new nlobjSearchColumn('releasestatus'),
                                        new nlobjSearchColumn('owner'),
                                    ]
                                );

                                let workflowMap = {};

                                if (workflowSearch) {
                                    workflowSearch.forEach(result => {
                                        let workflowId = result.getId();
                                        let wfObj = {
                                            name: result.getValue('name'),
                                            releasestatus: result.getValue('releasestatus'),
                                            owner: result.getText('owner'),
                                            id: workflowId,
                                            url: `https://${company}.app.netsuite.com/app/common/workflow/setup/nextgen/workflowdesktop.nl?id=${workflowId}&e=T&whence=`,
                                            currentState: ""
                                        };
                                        workflowResults.push(wfObj);
                                        workflowMap[workflowId] = wfObj;
                                    });
                                }

                                if (recordId && workflowResults.length > 0) {
                                    var workflowStateSearch = nlapiSearchRecord(recordType, null,
                                        [
                                            ['internalid', 'anyof', recordId],
                                            'AND',
                                            ['workflow.workflow', 'anyof', Object.keys(workflowMap)],
                                        ],
                                        [
                                            new nlobjSearchColumn('currentstate', 'workflow', null),
                                            new nlobjSearchColumn('workflow', 'workflow', null)
                                        ]
                                    );
                                    if (workflowStateSearch) {
                                        workflowStateSearch.forEach(result => {
                                            let workflowId = result.getValue('workflow', 'workflow');
                                            let currentState = result.getText('currentstate', 'workflow');
                                            if (workflowMap[workflowId]) {
                                                workflowMap[workflowId].currentState = currentState;
                                            }
                                        });
                                    }
                                }
                            }

                        } catch (wfErr) {
                            if (wfErr && wfErr.code !== 'SSS_INVALID_SRCH_COLUMN_JOIN') {
                                console.warn('NSFT: Workflow Search Error', wfErr);
                            }
                        }

                        sendMessageToExtension('success', translations.sr_data_retrieved || 'Data retrieved', {
                            scriptDeployments: scriptDeploymentResults,
                            workflows: workflowResults,
                            isCustomList: false
                        });

                        } catch (e) {
                            sendMessageToExtension('error', (translations.sr_error_logic || 'SuiteQL/Logic Error: ') + e.message);
                        }
                    });
                } catch (e) {
                    sendMessageToExtension('error', (translations.sr_error_logic || 'SuiteQL/Logic Error: ') + e.message);
                }
            }

        } catch (globalE) {
            sendMessageToExtension('error', (translations.sr_error_global || 'Global Fetch Error: ') + globalE.message);
        }
    }

    function handleCustomList(custListId) {
        const T = window.NSFT_SQL;
        if (!T) return;

        const head = 'SELECT name, id, fieldvaluetype, fieldvaluetyperecord, lower(scriptid) fieldid ' +
                     'FROM customfield ' +
                     "WHERE fieldvaluetype = 'List/Record' " +
                     'AND fieldvaluetyperecord = ';
        T.run({
            rest: head + T.lit(custListId),
            sql: head + '?',
            params: [custListId],
            limit: 1000
        }, function (err, results) {
            if (err) {
                sendMessageToExtension('error', err.message || err.code || 'query');
                return;
            }
            sendMessageToExtension('success', translations.sr_custom_list_retrieved || 'Custom List data retrieved', {
                customListId: custListId,
                customListFields: results || [],
                isCustomList: true
            });
        });
    }

})();
