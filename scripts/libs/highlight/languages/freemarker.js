/* GRAMÁTICA DE FREEMARKER PARA HIGHLIGHT.JS — ESCRITA AQUÍ, NO VENDIDA.
 *
 * highlight.js no publica lenguaje para FreeMarker (ni en el paquete común ni
 * como grammar oficial), y NetSuite lo usa en todas partes: plantillas PDF
 * avanzadas, plantillas de correo y los formatos de archivo de pago de
 * Electronic Bank Payments. Sin esto, esos campos salían en gris.
 *
 * Qué colorea:
 *   · `<#-- comentarios -->`
 *   · directivas `<#if>`, `<#list>`, `<#assign>`… y sus cierres `</#…>`
 *   · directivas de usuario `<@macro>` / `</@macro>`
 *   · interpolaciones `${…}` y las antiguas `#{…}`
 *   · la sintaxis de corchetes `[#ftl]` / `[@macro]`, que NetSuite acepta
 *   · dentro de todas ellas: cadenas, números, palabras clave y los
 *     «builtins» con `?` (`?upper_case`, `?string`, `?c`…)
 *
 * El resto del texto se pasa a la gramática `xml`, que es lo que hacen las
 * demás plantillas de highlight.js (django, twig…): así una plantilla PDF
 * —FreeMarker embebido en marcado— se ve bien por los dos lados, y un archivo
 * de FreeMarker puro simplemente no encuentra marcado que colorear.
 *
 * Se registra con el nombre `freemarker` y el alias `ftl`.
 */
(function () {
    'use strict';

    if (typeof hljs === 'undefined' || !hljs.registerLanguage) return;

    hljs.registerLanguage('freemarker', function (hl) {
        /* Lo que puede aparecer DENTRO de una directiva o de una
           interpolación. Se comparte para no escribirlo cuatro veces. */
        const DENTRO = [
            hl.QUOTE_STRING_MODE,
            hl.APOS_STRING_MODE,
            hl.C_NUMBER_MODE,
            {
                /* Los «builtins» son la marca de la casa: `?upper_case`,
                   `?string("yyyy-MM-dd")`, `?c`, `?replace(…)`. */
                className: 'built_in',
                begin: /\?[a-zA-Z_][a-zA-Z0-9_]*/
            },
            {
                className: 'keyword',
                begin: /\b(?:as|in|using|true|false|gt|gte|lt|lte)\b/
            }
        ];

        const COMENTARIO = {
            className: 'comment',
            variants: [
                { begin: /<#--/, end: /-->/ },
                { begin: /\[#--/, end: /--\]/ }
            ]
        };

        /* `<#nombre …>` y `</#nombre>`.
           El `begin` se traga el NOMBRE ENTERO a propósito. Si sólo llegara a
           la primera letra —lo justo para saber que hay nombre—, esa letra
           quedaría fuera del resto y la directiva saldría partida en dos:
           `<#f` + `unction`. La directiva entera se lee como una sola cosa, y
           dentro se colorean los parámetros: cadenas, números, palabras clave y
           builtins. */
        const DIRECTIVA = {
            className: 'template-tag',
            variants: [
                { begin: /<\/?#[a-zA-Z][a-zA-Z0-9_]*/, end: /\/?>/ },
                { begin: /\[\/?#[a-zA-Z][a-zA-Z0-9_]*/, end: /\/?\]/ }
            ],
            contains: DENTRO
        };

        // Directivas de usuario: macros invocadas con `<@…>`.
        const MACRO = {
            className: 'template-tag',
            variants: [
                { begin: /<\/?@[a-zA-Z][a-zA-Z0-9_.]*/, end: /\/?>/ },
                { begin: /\[\/?@[a-zA-Z][a-zA-Z0-9_.]*/, end: /\/?\]/ }
            ],
            contains: DENTRO
        };

        const INTERPOLACION = {
            className: 'template-variable',
            variants: [
                { begin: /\$\{/, end: /\}/ },
                { begin: /#\{/, end: /\}/ }   // la forma numérica, ya en desuso
            ],
            contains: DENTRO
        };

        return {
            name: 'FreeMarker',
            aliases: ['ftl'],
            case_insensitive: false,
            /* El texto que no es FreeMarker se colorea como marcado. En una
               plantilla PDF eso es justo lo que hace falta; en un FreeMarker
               puro no hay marcado y no pinta nada. */
            subLanguage: 'xml',
            /* El comentario va PRIMERO: `<#--` empieza igual que una directiva
               y, si se mirara la directiva antes, se comería el comentario. */
            contains: [COMENTARIO, DIRECTIVA, MACRO, INTERPOLACION]
        };
    });
})();
