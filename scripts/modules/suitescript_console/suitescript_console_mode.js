(function () {
    'use strict';

    if (typeof CodeMirror === 'undefined' || !CodeMirror.defineMode) return;
    if (CodeMirror.modes && CodeMirror.modes['nsft-javascript']) return;

    const CLAVE = new Set([
        'break', 'case', 'catch', 'class', 'const', 'continue', 'debugger', 'default',
        'delete', 'do', 'else', 'export', 'extends', 'finally', 'for', 'function', 'if',
        'import', 'in', 'instanceof', 'let', 'new', 'of', 'return', 'super', 'switch',
        'this', 'throw', 'try', 'typeof', 'var', 'void', 'while', 'with', 'yield',
        'async', 'await', 'static', 'get', 'set'
    ]);

    const LITERAL = new Set(['true', 'false', 'null', 'undefined', 'NaN', 'Infinity']);

    const PRECARGADOS = new Set([
        'record', 'search', 'query', 'runtime', 'currentRecord', 'url', 'format',
        'log', 'error', 'https', 'http', 'util', 'xml', 'action', 'dataset',
        'workbook', 'transaction', 'email', 'translation', 'recordContext',
        'dialog', 'message', 'require', 'console'
    ]);

    CodeMirror.nsftPrecargados = PRECARGADOS;

    const INICIO_ID = /[A-Za-z_$]/;

    const RESTO_ID = /[A-Za-z0-9_$]/;

    const RE_OPERADOR = new RegExp(
        '^(?:' + [
            '>>>=', '<<=', '>>=', '>>>', '===', '!==', '\\*\\*=', '&&=', '\\|\\|=', '\\?\\?=',
            '==', '!=', '<=', '>=', '&&', '\\|\\|', '\\?\\?', '\\?\\.', '=>', '\\+\\+', '--',
            '\\+=', '-=', '\\*=', '%=', '&=', '\\|=', '\\^=', '\\*\\*', '<<', '>>'
        ].join('|') + ')'
    );


    const ETIQUETA_DOC = /^@[A-Za-z][A-Za-z0-9_$]*/;
    const ABRE_ETIQUETA = /[\s*]/;

    function trozoComentario(stream, state) {
        if (stream.peek() === '@' && stream.match(ETIQUETA_DOC)) return 'comment nsft-doc-tag';

        if (stream.peek() === '{') {
            let hondo = 0;
            while (!stream.eol()) {
                const c = stream.next();
                if (c === '{') hondo++;
                else if (c === '}') { hondo--; if (hondo <= 0) break; }
                else if (c === '*' && stream.peek() === '/') { stream.backUp(1); break; }
            }
            return 'comment nsft-doc-type';
        }

        while (!stream.eol()) {
            const c = stream.next();
            if (c === '*' && stream.peek() === '/') { stream.next(); state.enComentario = false; break; }
            const sig = stream.peek();
            if (sig === '{' || (sig === '@' && ABRE_ETIQUETA.test(c))) break;
        }
        return 'comment';
    }

    CodeMirror.defineMode('nsft-javascript', function (config) {
        return {
            startState: function () {
                return { enCadena: null, enComentario: false, trasPunto: false, prof: 0 };
            },

            token: function (stream, state) {
                if (state.enComentario) {
                    return trozoComentario(stream, state);
                }

                if (state.enCadena) {
                    const cierre = state.enCadena;
                    while (!stream.eol()) {
                        const c = stream.next();
                        if (c === '\\') { stream.next(); continue; }
                        if (c === cierre) { state.enCadena = null; break; }
                    }
                    return 'string';
                }

                if (stream.eatSpace()) return null;

                const ch = stream.peek();

                if (ch === '/') {
                    stream.next();
                    if (stream.peek() === '/') { stream.skipToEnd(); return 'comment'; }
                    if (stream.peek() === '*') {
                        stream.next();
                        state.enComentario = true;
                        return trozoComentario(stream, state);
                    }
                    state.trasPunto = false;
                    return 'operator';
                }

                if (ch === '"' || ch === "'" || ch === '`') {
                    stream.next();
                    let cerrada = false;
                    while (!stream.eol()) {
                        const c = stream.next();
                        if (c === '\\') { stream.next(); continue; }
                        if (c === ch) { cerrada = true; break; }
                    }
                    state.enCadena = (!cerrada && ch === '`') ? ch : null;
                    state.trasPunto = false;
                    return 'string';
                }

                if (/[0-9]/.test(ch)) {
                    stream.eatWhile(/[0-9a-fA-FxXoObBeE._+-]/);
                    state.trasPunto = false;
                    return 'number';
                }

                if (INICIO_ID.test(ch)) {
                    const tras = state.trasPunto;
                    state.trasPunto = false;
                    stream.next();
                    stream.eatWhile(RESTO_ID);
                    const palabra = stream.current();

                    const resto = stream.string.slice(stream.pos);
                    const llamada = /^\s*\(/.test(resto);

                    const claveObjeto = !tras && /^\s*:/.test(resto);

                    if (tras) return llamada ? 'def' : 'property';
                    if (CLAVE.has(palabra)) return 'keyword';
                    if (LITERAL.has(palabra)) return 'atom';
                    if (claveObjeto) return 'objectkey';
                    if (PRECARGADOS.has(palabra)) return 'variable-2';
                    if (llamada) return 'def';
                    if (/^[A-Z]/.test(palabra)) return 'variable-3';
                    return 'variable';
                }

                const op = stream.match(RE_OPERADOR);
                if (op) {
                    state.trasPunto = (op[0].charAt(op[0].length - 1) === '.');
                    return 'operator';
                }

                stream.next();
                state.trasPunto = (ch === '.');
                if ('{(['.indexOf(ch) >= 0) state.prof++;
                else if ('})]'.indexOf(ch) >= 0) state.prof = Math.max(0, state.prof - 1);
                if ('{}()[];,'.indexOf(ch) >= 0) return 'bracket';
                if ('+-*%=<>!&|^~?:'.indexOf(ch) >= 0) return 'operator';
                return null;
            },

            indent: function (state, textAfter) {
                const unidad = (config && config.indentUnit) || 2;
                let nivel = (state.prof || 0) * unidad;
                if (/^\s*[})\]]/.test(textAfter)) nivel -= unidad;
                return Math.max(0, nivel);
            },

            electricChars: '{}()[]',
            lineComment: '//',
            blockCommentStart: '/*',
            blockCommentEnd: '*/'
        };
    });

    CodeMirror.defineMIME('text/nsft-javascript', 'nsft-javascript');
})();
