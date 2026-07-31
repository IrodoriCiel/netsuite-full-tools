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
                if (event.data.code.includes('window.mySearchResults')) {
                    varName = 'mySearchResults';
                } else {
                    const match = event.data.code.match(/var\s+(\w+)\s*=/);
                    if (match) varName = match[1];
                }

                console.log(
                    "%c[NSFT]%c " + translations.consoleSuccess + "%c" + varName,
                    "color: #ff9f43; font-weight: bold;",
                    "color: inherit;",
                    "font-weight: bold; color: #2ecc71;"
                );
            } catch (e) {
                console.error(translations.execError, e);
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

    function generateAndSendCode(search, hideLabels = false) {
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

            const ss1Columns = columns.map(c => {
                const formula = c.formula ? c.formula.replace(/\"/g, '&#92;"') : null;

                let col = `   new nlobjSearchColumn("${c.name}",`;
                col += c.join ? `"${c.join}",` : "null,";
                col += c.summary ? `"${c.summary}"` : "null";

                if (formula) {
                    col += `).setFormula("${formula}")`;
                }

                if (c.sortdir) {
                    if (!formula) col += `)`;
                    col += `.setSort(${c.sortdir === 'DESC'})`;
                }

                if (!formula && !c.sortdir) {
                    col += `)`;
                }

                return col.replace(',null,null)', ')').replace(', null, null)', ')');
            }).join(', \n');

            let searchCode1 = `var ${searchType}Search = nlapiSearchRecord("${searchType}",null,\n`;
            searchCode1 += `${filterExpr}\n], \n`;
            searchCode1 += `[\n${ss1Columns}\n]);`;



            const ss2Columns = columns.map(c => {
                const formula = c.formula ? c.formula.replace(/\"/g, '&#92;"') : null;

                if (!formula && !c.join && !c.summary && !c.sortdir) {
                    return `      "${c.name}"`;
                }

                const props = [];
                props.push(`         name: "${c.name}"`);
                if (c.join) props.push(`         join: "${c.join}"`);
                if (c.summary) props.push(`         summary: "${c.summary}"`);
                if (formula) props.push(`         formula: "${formula}"`);
                if (c.sortdir) props.push(`         sort: search.Sort.${c.sortdir}`);
                if (!hideLabels && c.label) props.push(`         label: "${c.label}"`);

                return `      search.createColumn({\n${props.join(',\n')}\n      })`;
            }).join(',\n');

            let ss2ColumnsStr = `[\n${ss2Columns}`;
            if (ss2Columns.length > 0) ss2ColumnsStr += '\n   ]';
            else ss2ColumnsStr += '   ]';


            let ss2FilterExpr = filterExpr.replace(/   /g, "      ");
            if (ss2FilterExpr === '[' || ss2FilterExpr.length === 0) ss2FilterExpr = "[";
            ss2FilterExpr += "\n   ],";

            let settingsStr = '';
            if (search.settings && search.settings.length > 0) {
                settingsStr = `   settings:${JSON.stringify(search.settings)},\n`;
            }

            const resultBody = columns.map(c => {
                const keySource = (c.name && !c.formula) ? c.name : (c.label || c.name);
                const key = (keySource || 'column').toLowerCase().replace(/[^a-z0-9_]/g, '_');

                let method = "getValue";
                if (COMMON_LIST_FIELDS.includes(c.name) && !c.summary && !c.formula) {
                    method = "getText";
                }

                const formula = c.formula ? c.formula.replace(/\"/g, '&#92;"') : null;

                const args = [`name: '${c.name}'`];
                if (c.join) args.push(`join: '${c.join}'`);
                if (c.summary) args.push(`summary: '${c.summary}'`);
                if (formula) args.push(`formula: '${formula}'`);

                const arg = `{ ${args.join(', ')} }`;

                return `    const ${key} = result.${method}(${arg});`;
            }).join('\n');


            const searchCode2 = `const ${searchType}SearchObj = search.create({
   type: "${searchType}",
${settingsStr}   filters:
   ${ss2FilterExpr}
   columns:
   ${ss2ColumnsStr}
});

${searchType}SearchObj.run().each(function(result){
${resultBody}
    return true;
});`;

            const searchCode2Console = `require(['N/search'], function(search) {
    try {
        var mySearch = search.load({ id: "${search.id}" });
        var pagedData = mySearch.runPaged({ pageSize: 1000 });
        var mySearchResults = [];

        pagedData.pageRanges.forEach(function(pageRange) {
            var page = pagedData.fetch({ index: pageRange.index });
            mySearchResults = mySearchResults.concat(page.data);
        });
        
        console.log("${translations.totalResults}", mySearchResults.length);
        console.log(mySearchResults);
        window.mySearchResults = mySearchResults;
    } catch(e) {
        console.error(e.message);
    }
});`;

            window.postMessage({
                type: 'nsft-export-search-success',
                payload: {
                    ss1: searchCode1.replace(/&#92;/g, '\\'),
                    ss2: searchCode2.replace(/&#92;/g, '\\'),
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
