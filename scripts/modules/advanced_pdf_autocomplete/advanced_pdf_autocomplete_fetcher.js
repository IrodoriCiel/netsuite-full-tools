(function () {
    'use strict';

    const _diag = !!(document.documentElement && document.documentElement.dataset.nsftApdfacDiag);
    function diag(msg) { if (_diag) console.warn('NSFT advanced pdf autocomplete:', msg); }

    let _originalHint = null;
    let _overridden = false;

    window.addEventListener('message', (ev) => {
        const data = ev.data;
        if (!data || data.dest !== 'fetcher_apdfac' || data.type !== 'teardown') return;
        if (_overridden && typeof CodeMirror !== 'undefined' && CodeMirror.hint) {
            CodeMirror.hint.html = _originalHint;
            _overridden = false;
        }
    });

    function initialiseAutocomplete() {
        const container = document.getElementById('pdfeditor-new-element-dialog');
        if (!container) return;

        const headerEls = container.querySelectorAll('.newelement-div-header');
        let autocompleteStart = new Set();
        let autocompleteFull = new Set();

        for (const headerEl of headerEls) {
            const id = headerEl.id.split('_')[1];
            autocompleteStart.add(id);

            const fieldIds = document.querySelectorAll(
                `#pdfeditor-new-element-dialog ul#id_${id}_header li .newelement-item-id`
            );
            for (const field of fieldIds) {
                autocompleteFull.add(`${id}.${field?.innerText?.trim()}`);
            }
        }

        if (!autocompleteFull.size) return;

        let pdfVariablesAdded = false;

        function getPdfVariables(editor) {
            if (pdfVariablesAdded) return;
            pdfVariablesAdded = true;

            const text = editor.getTextArea().value;
            const pdfVars = text.match(/\#assign ([A-z_]+)/gm);

            if (pdfVars) {
                for (const pdfVar of pdfVars) {
                    const cleaned = pdfVar.replace('#assign ', '');
                    autocompleteFull.add(cleaned);
                    autocompleteStart.add(cleaned);
                }
            }

            autocompleteFull = [...autocompleteFull];
            autocompleteStart = [...autocompleteStart];

            const fixedValues = [
                'nsformat_date( date|string )',
                'nsformat_datetime( date|string )',
                'nsformat_time( date|string )',
                'nsformat_currency( currencyValue, optionalCurrencyCode)',
                'nsformat_rate( value, optionalCurrencyCode)',
                'nsformat_number( value, optionalLocaleSting )',
                'nsformat_boolean( boolean|string|number )',
                'nsformat_percent( number|string )',
                'nsformat_password( string )',
                'nsformat_email( string )',
                'nsformat_url( string )'
            ];

            autocompleteFull = autocompleteFull.concat(fixedValues);
            autocompleteStart = autocompleteStart.concat(fixedValues);
        }

        _originalHint = CodeMirror.hint.html;
        _overridden = true;
        CodeMirror.hint.html = function (editor) {
            getPdfVariables(editor);

            const cursor = editor.getCursor();
            const currentLine = editor.getLine(cursor.line);
            let start = cursor.ch;
            let end = start;
            const rex = /[\w.]/;

            while (end < currentLine.length && rex.test(currentLine.charAt(end))) ++end;
            while (start && rex.test(currentLine.charAt(start - 1))) --start;

            const curWord = start !== end && currentLine.slice(start, end);
            const result = { list: [] };
            result.to = CodeMirror.Pos(cursor.line, end);
            result.from = CodeMirror.Pos(cursor.line, start);

            autocompleteFull.forEach(hint => {
                if (hint.startsWith(curWord) && hint.includes('.')) {
                    result.list.push(hint);
                }
            });

            if (!curWord && !result.list.length) result.list = [...autocompleteStart];
            result.list.sort();
            return result;
        };
    }

    let attempts = 0;
    const MAX_ATTEMPTS = 40;
    const interval = setInterval(() => {
        if (typeof CodeMirror === 'undefined' || typeof CodeMirror.hint === 'undefined' || typeof CodeMirror.hint.html === 'undefined') {
            if (++attempts >= MAX_ATTEMPTS) {
                clearInterval(interval);
                diag('CodeMirror no se cargó tras ' + MAX_ATTEMPTS + ' intentos — autocompletado no inyectado');
            }
            return;
        }
        clearInterval(interval);
        initialiseAutocomplete();
    }, 500);
})();
