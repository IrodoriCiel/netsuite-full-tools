(function () {
    'use strict';

    const COMMON_LIST_FIELDS = [
        'entity', 'customer', 'vendor', 'employee', 'subsidiary',
        'department', 'class', 'location', 'currency', 'account',
        'status', 'createdby', 'salesrep', 'partner'
    ];

    let translations = {};

    window.addEventListener('message', (event) => {
        if (event.source !== window || !event.data) return;
        if (event.data.type === 'nsft-export-search-init') {
            if (event.data.translations) {
                translations = event.data.translations;
            }
            runExportSearch();
        } else if (event.data.type === 'nsft-export-search-execute') {
            try {
                const exec = window.eval || eval;
                exec(event.data.code);

                let varName = 'search';
                const exported = event.data.code.match(/window\.(\w+)\s*=/);
                const declared = event.data.code.match(/var\s+(\w+)\s*=/);
                if (exported) varName = exported[1];
                else if (declared) varName = declared[1];

                console.log(
                    "%c[NSFT]%c " + translations.consoleSuccess + "%c" + varName,
                    "color: #ff9f43; font-weight: bold;",
                    "color: inherit;",
                    "font-weight: bold; color: #2ecc71;"
                );

                window.postMessage({
                    type: 'nsft-export-search-executed',
                    payload: { ok: true, varName }
                }, '*');
            } catch (e) {
                console.error(translations.execError, e);
                window.postMessage({
                    type: 'nsft-export-search-executed',
                    payload: { ok: false, details: e && e.message ? e.message : '' }
                }, '*');
            }
        }
    });

    function runExportSearch() {
        const searchParams = new URLSearchParams(window.location.search);
        const recordId = searchParams.get("id");

        if (!recordId) {
            window.postMessage({ type: 'nsft-export-search-error', payload: { error: 'no_id' } }, '*');
            return;
        }

        if (typeof require === 'undefined') {
            window.postMessage({ type: 'nsft-export-search-error', payload: { error: 'require_undefined' } }, '*');
            return;
        }

        require(['N/search'], function (search) {
            let searchObj;
            try {
                searchObj = search.load({ id: recordId });
                generateAndSendCode(searchObj);
            } catch (e) {
                console.error(e.message);
                attemptDiscovery(recordId, search, e);
            }
        });
    }

    function attemptDiscovery(recordId, search, originalError) {
        try {
            const scriptDynamic = document.getElementById('script_dynamic');
            const typeSrc = scriptDynamic ? scriptDynamic.getAttribute('src') : '';

            if (typeSrc) {
                const regex = /.*?searchtype=(\w+)/gm;
                const match = regex.exec(typeSrc);

                if (match && match[1]) {
                    const type = match[1].toLowerCase();
                    const searchObj = search.load({ id: recordId, type });
                    generateAndSendCode(searchObj);
                    return;
                }
            }
            throw originalError;
        } catch (err) {
            window.postMessage({
                type: 'nsft-export-search-error',
                payload: { error: 'load_failed', details: err.message }
            }, '*');
        }
    }

    function generateAndSendCode(search) {
        try {
            const searchType = search.searchType;
            const filters = search.filterExpression || [];

            let filterExpr = "[\n";
            if (filters.length > 0) {
                const filterStrings = filters.map(f => `   ${JSON.stringify(f)}`);
                filterExpr += filterStrings.join(', \n');
            }
            if (filterExpr === "[\n") filterExpr = "[";


            const columns = search.columns;

            const VAR_TOKEN = '__NSFT_SEARCH_VAR__';
            const searchVar = VAR_TOKEN;
            const defaultVarName = `${searchType}Search`;

            function buildSS1Columns(noLabels) {
                return columns.map(c => {
                    const formula = c.formula ? c.formula.replace(/\"/g, '&#92;"') : null;
                    const join = c.join ? `"${c.join}"` : 'null';
                    const summary = c.summary ? `"${c.summary}"` : 'null';

                    let col = (join === 'null' && summary === 'null')
                        ? `   new nlobjSearchColumn("${c.name}")`
                        : `   new nlobjSearchColumn("${c.name}",${join},${summary})`;

                    if (formula) col += `.setFormula("${formula}")`;
                    if (c.sortdir) col += `.setSort(${c.sortdir === 'DESC'})`;
                    if (!noLabels && c.label) col += `.setLabel("${c.label}")`;
                    return col;
                }).join(', \n');
            }



            function buildSS2Columns(noLabels) {
                const body = columns.map(c => {
                    const formula = c.formula ? c.formula.replace(/\"/g, '&#92;"') : null;

                    if (!formula && !c.join && !c.summary && !c.sortdir) {
                        if (noLabels || !c.label) return `      "${c.name}"`;
                        return `      search.createColumn({name: "${c.name}", label: "${c.label}"})`;
                    }

                    const props = [];
                    props.push(`         name: "${c.name}"`);
                    if (c.join) props.push(`         join: "${c.join}"`);
                    if (c.summary) props.push(`         summary: "${c.summary}"`);
                    if (formula) props.push(`         formula: "${formula}"`);
                    if (c.sortdir) props.push(`         sort: search.Sort.${c.sortdir}`);
                    if (!noLabels && c.label) props.push(`         label: "${c.label}"`);

                    return `      search.createColumn({\n${props.join(',\n')}\n      })`;
                }).join(',\n');

                let str = `[\n${body}`;
                if (body.length > 0) str += '\n   ]';
                else str += '   ]';
                return str;
            }


            let ss2FilterExpr = filterExpr.replace(/   /g, "      ");
            if (ss2FilterExpr === '[' || ss2FilterExpr.length === 0) ss2FilterExpr = "[";
            ss2FilterExpr += "\n   ],";

            let settingsStr = '';
            if (search.settings && search.settings.length > 0) {
                settingsStr = `   settings:${JSON.stringify(search.settings)},\n`;
            }

            function columnVars(keyword, objectArgs, indent) {
                return columns.map(c => {
                    const keySource = (c.name && !c.formula) ? c.name : (c.label || c.name);
                    const key = (keySource || 'column').toLowerCase().replace(/[^a-z0-9_]/g, '_');

                    let method = "getValue";
                    if (COMMON_LIST_FIELDS.includes(c.name) && !c.summary && !c.formula) {
                        method = "getText";
                    }

                    const formula = c.formula ? c.formula.replace(/\"/g, '&#92;"') : null;

                    let arg;
                    if (objectArgs) {
                        const args = [`name: "${c.name}"`];
                        if (c.join) args.push(`join: "${c.join}"`);
                        if (c.summary) args.push(`summary: "${c.summary}"`);
                        if (formula) args.push(`formula: "${formula}"`);
                        arg = `{ ${args.join(', ')} }`;
                    } else {
                        const parts = [`"${c.name}"`];
                        if (c.join || c.summary) parts.push(c.join ? `"${c.join}"` : 'null');
                        if (c.summary) parts.push(`"${c.summary}"`);
                        arg = parts.join(', ');
                    }

                    return `${indent}${keyword} ${key} = result.${method}(${arg});`;
                }).join('\n');
            }

            const buildSS2 = (noLabels, includeLoop) => {
                let code = `const ${searchVar} = search.create({
   type: "${searchType}",
${settingsStr}   filters:
   ${ss2FilterExpr}
   columns:
   ${buildSS2Columns(noLabels)}
});`;
                if (includeLoop) {
                    code += `

${searchVar}.run().each(function(result){
${columnVars('const', true, '    ')}
    return true;
});`;
                }
                return code;
            };

            const buildSS1 = (noLabels, includeLoop) => {
                let code = `var ${searchVar} = nlapiSearchRecord("${searchType}",null,\n`;
                code += `${filterExpr}\n], \n`;
                code += `[\n${buildSS1Columns(noLabels)}\n]);`;
                if (includeLoop) {
                    code += `

if (${searchVar}) {
    for (var i = 0; i < ${searchVar}.length; i++) {
        var result = ${searchVar}[i];
${columnVars('var', false, '        ')}
    }
}`;
                }
                return code;
            };

            const variants = {};
            [false, true].forEach((noLabels) => {
                [true, false].forEach((includeLoop) => {
                    const key = `${noLabels ? 'nolabels' : 'labels'}_${includeLoop ? 'loop' : 'noloop'}`;
                    variants[key] = {
                        ss1: buildSS1(noLabels, includeLoop).replace(/&#92;/g, '\\'),
                        ss2: buildSS2(noLabels, includeLoop).replace(/&#92;/g, '\\')
                    };
                });
            });

            const resultsVar = `${searchVar}Results`;
            const searchCode2Console = `require(['N/search'], function(search) {
    try {
        var ${searchVar} = search.load({ id: "${search.id}" });
        var pagedData = ${searchVar}.runPaged({ pageSize: 1000 });
        var ${resultsVar} = [];

        pagedData.pageRanges.forEach(function(pageRange) {
            var page = pagedData.fetch({ index: pageRange.index });
            ${resultsVar} = ${resultsVar}.concat(page.data);
        });

        console.log("${translations.totalResults}", ${resultsVar}.length);
        console.log(${resultsVar});
        window.${resultsVar} = ${resultsVar};
    } catch(e) {
        console.error(e.message);
    }
});`;

            window.postMessage({
                type: 'nsft-export-search-success',
                payload: {
                    variants,
                    info: {
                        varName: defaultVarName,
                        searchType: searchType,
                        columns: columns.length,
                        filters: filters.filter(Array.isArray).length
                    },
                    ss2console: searchCode2Console.replace(/&#92;/g, '\\')
                }
            }, '*');

        } catch (err) {
            window.postMessage({
                type: 'nsft-export-search-error',
                payload: { error: 'gen_failed', details: err.message }
            }, '*');
        }
    }
})();
