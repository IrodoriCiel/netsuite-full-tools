(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.NSFT_EditorThemeTransform = factory();
    }
}(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    const CLASS_MAP = [
        ['comment', '.ͼm'],
        ['keyword', '.ͼb'],
        ['string', '.ͼe'],
        ['number', '.ͼd'],
        ['literal', '.ͼc'],
        ['property', '.ͼl'],
        ['attr', '.ͼl'],
        ['attribute', '.ͼl'],
        ['variable', '.ͼg'],
        ['function', '.ͼg'],
        ['type', '.ͼj'],
        ['class', '.ͼj'],
        ['strong', '.cm-strong'],
        ['emphasis', '.cm-em']
    ].map(function (pair) {
        return { re: new RegExp('\\.hljs-' + pair[0] + '\\b', 'g'), cm: pair[1] };
    });

    const RE_HLJS_BG = /\.hljs(?![-\w])[^{}]*\{\s*(?:[^{}]*;)?\s*background(?:-color)?\s*:\s*([^;}]+)/i;
    const RE_HLJS_FG = /\.hljs(?![-\w])[^{}]*\{\s*(?:[^{}]*;)?\s*color\s*:\s*([^;}]+)/i;
    const RE_HLJS_COMMENT = /\.hljs-comment(?![-\w])[^{}]*\{[^}]*color\s*:\s*([^;}]+)/i;
    const RE_SELECTION = /::selection\s*\{[^}]*background(?:-color)?\s*:\s*([^;}]+)/i;

    function isLightTheme(themeName) {
        return /light|github(?!-dark)/i.test(themeName);
    }

    function extractColors(cssText, isLight) {
        const palette = {
            sbBg: isLight ? '#ffffff' : '#282c34',
            sbThumb: isLight ? '#ccc' : '#5c6370',
            fgColor: isLight ? '#24292e' : '#abb2bf',
            selBg: 'rgba(128, 128, 128, 0.3)'
        };
        const grab = function (re) {
            const m = cssText.match(re);
            return m ? m[1].trim() : null;
        };
        const bg = grab(RE_HLJS_BG); if (bg) palette.sbBg = bg;
        const fg = grab(RE_HLJS_FG); if (fg) palette.fgColor = fg;
        const cm = grab(RE_HLJS_COMMENT); if (cm) palette.sbThumb = cm;
        const sel = grab(RE_SELECTION); if (sel) palette.selBg = sel;
        return palette;
    }

    const FONT_STACKS = {
        'JetBrains Mono': "'JetBrains Mono', 'Fira Code', Consolas, monospace",
        'Fira Code': "'Fira Code', 'JetBrains Mono', Consolas, monospace",
        'Cascadia Code': "'Cascadia Code', 'JetBrains Mono', Consolas, monospace",
        'Source Code Pro': "'Source Code Pro', 'JetBrains Mono', Consolas, monospace",
        'Consolas': "Consolas, 'JetBrains Mono', monospace",
        'System Monospace': "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace"
    };

    function resolveFontStack(name) {
        return FONT_STACKS[name] || FONT_STACKS['JetBrains Mono'];
    }

    function clampFontSize(px) {
        const n = parseInt(px, 10);
        if (isNaN(n)) return 14;
        return Math.max(11, Math.min(22, n));
    }

    function buildOverrides(palette, themeName, opts) {
        const sbBg = palette.sbBg;
        const sbThumb = palette.sbThumb;
        const fgColor = palette.fgColor;
        const selBg = palette.selBg;
        const fontFamily = resolveFontStack(opts && opts.fontFamily);
        const fontSize = clampFontSize(opts && opts.fontSize);
        let overrides = `
            /* --- THEME OVERRIDES --- */
            body, .cm-editor, .cm-scroller, .cm-gutters {
                background-color: ${sbBg} !important;
                color: ${fgColor} !important;
            }
            .cm-content { background-color: transparent !important; color: inherit !important; }
            /* La fuente/tamaño debe ganar tambien sobre las lineas de codigo Y
               sobre los spans de resaltado de sintaxis (.cm-line *): CM6/NetSuite
               fijan tamaño en esos spans, asi que heredar desde .cm-content/.cm-line
               no basta (antes solo crecian el gutter y el texto plano, no los
               tokens coloreados como comentarios/strings/keywords). */
            .cm-scroller, .cm-content, .cm-line, .cm-line *, .cm-gutterElement, .cm-gutterElement * {
                font-family: ${fontFamily} !important;
                font-size: ${fontSize}px !important;
            }
            .cm-line { color: inherit !important; }
            .cm-gutters {
                display: flex !important;
                white-space: normal !important;
                border-right: 1px solid rgba(128,128,128,0.2) !important;
                z-index: 2 !important;
            }
            .cm-activeLineGutter { background-color: transparent !important; }
            .cm-activeLine {
                    background-color: transparent !important;
                    outline: 1px solid rgba(128,128,128,0.2) !important;
            }
            .cm-cursor, .cm-dropCursor { border-left-color: ${fgColor} !important; }
            .cm-selectionBackground, .cm-content ::selection { background-color: ${selBg} !important; }
            .cm-content .ͼe { text-decoration: none !important; }

            /* AUTOCOMPLETE / TOOLTIPS (hints) — el popup de sugerencias de CM6
               conserva el fondo claro nativo (#f5f5f5); con un tema oscuro el
               texto se vuelve claro y quedaba blanco-sobre-blanco e ilegible.
               Lo pintamos con el fondo/tinta del propio tema. */
            .cm-tooltip,
            .cm-tooltip.cm-tooltip-autocomplete,
            .cm-tooltip-autocomplete,
            .cm-tooltip.cm-completionInfo {
                background-color: ${sbBg} !important;
                color: ${fgColor} !important;
                border: 1px solid rgba(128,128,128,0.4) !important;
            }
            .cm-tooltip-autocomplete > ul > li,
            .cm-tooltip-autocomplete > ul > li > * {
                color: ${fgColor} !important;
            }
            .cm-tooltip-autocomplete > ul > li[aria-selected] {
                background-color: ${selBg} !important;
                color: ${fgColor} !important;
            }
            .cm-completionLabel, .cm-completionDetail, .cm-completionIcon {
                color: ${fgColor} !important;
            }
            .cm-completionMatchedText {
                color: ${fgColor} !important;
                text-decoration: underline !important;
            }

            /* --- LAYOUT OVERRIDES (Full Width + No White Bars) --- */
            div[data-widget="Code"] {
                width: 100% !important;
                min-width: 100% !important;
                max-width: 100% !important;
                height: 85vh !important;
                box-sizing: border-box !important;
                margin: 0 !important;
                background-color: ${sbBg} !important;
            }
            .cm-editor,
            .cm-scroller {
                width: 100% !important;
                min-width: 0 !important;
                max-width: 100% !important;
                box-sizing: border-box !important;
            }
            .cm-editor { height: 100% !important; }
            .cm-content {
                min-width: 0 !important;
            }
            .uir-field-wrapper:has(div[data-widget="Code"]),
            .uir-field-input:has(div[data-widget="Code"]),
            .uir-field:has(div[data-widget="Code"]),
            td:has(div[data-widget="Code"]) {
                width: 100% !important;
                max-width: 100% !important;
                min-width: 0 !important;
                box-sizing: border-box !important;
                background-color: ${sbBg} !important;
            }
            .uir-text-area-wrapper,
            #mCharData_fs,
            .uir-table-fields-wrapper {
                width: 100% !important;
                max-width: 100% !important;
                min-width: 0 !important;
                margin: 0 !important;
                padding: 0 !important;
                background-color: ${sbBg} !important;
            }
            table.uir-tab-fields,
            table.table_fields {
                width: 100% !important;
                table-layout: fixed !important;
            }
            /* HIDE UNNECESSARY ELEMENTS */
            .uir-record-type, #mCharData_fs_lbl_uir_label, .uir-buttons-bottom,
            table.uir-button-bar:last-of-type { display: none !important; }

            #main_form, #div__body { padding-bottom: 0 !important; margin-bottom: 0 !important; }

            /* IMPROVED FLOATING HEADER */
            .uir-form-header {
                display: flex !important; flex-direction: row !important;
                justify-content: space-between !important; align-items: center !important;
                flex-wrap: nowrap !important;
            }
            .uir-buttons-top { margin-left: auto !important; white-space: nowrap !important; }
            .uir-page-title { width: auto !important; margin-right: 20px !important; }

            body {
                margin: 0 !important; padding: 0 !important; width: 100% !important;
                height: 100vh !important; overflow-y: hidden !important; overflow-x: auto !important;
            }
            #outerwrapper, #innerwrapper, #div__body, .uir-form-header, .uir-page-title, table {
                background: ${sbBg} !important;
            }
            h1.uir-record-type, .uir-record-name { color: inherit !important; font-size: 18px !important; }

            /* MODERN SCROLLBARS */
            ::-webkit-scrollbar { width: 14px; height: 14px; }
            ::-webkit-scrollbar-track { background: ${sbBg} !important; }
            ::-webkit-scrollbar-corner { background: ${sbBg} !important; }
            ::-webkit-scrollbar-thumb {
                background-color: ${sbThumb} !important;
                border: 3px solid ${sbBg} !important;
                border-radius: 7px;
            }
            ::-webkit-scrollbar-thumb:hover { opacity: 0.8; }
            body, .cm-scroller { scrollbar-width: thin !important; scrollbar-color: ${sbThumb} ${sbBg} !important; }

            /* FOCUS CLEANUP */
            .cm-editor, .cm-editor.cm-focused, div[data-widget="Code"], .uir-field-wrapper {
                box-shadow: none !important; border: none !important; outline: none !important;
            }

            /* REDWOOD BUTTONS — el boton Cancelar (data-button-type="default")
               asume el fondo claro nativo de Redwood y queda invisible sobre
               los temas oscuros del editor. Usamos fgColor del propio tema
               para garantizar contraste contra cualquier sbBg. */
            button.uir-button[data-button-type="default"] {
                color: ${fgColor} !important;
                border: 1px solid ${fgColor} !important;
                background-color: transparent !important;
            }
            button.uir-button[data-button-type="default"]:hover {
                background-color: rgba(128,128,128,0.15) !important;
            }
        `;
        if (themeName.toLowerCase().indexOf('purple') !== -1) {
            overrides += ' .cm-content .ͼg { color: inherit !important; } ';
        }
        return overrides;
    }

    function applyClassMapping(cssText) {
        for (let i = 0; i < CLASS_MAP.length; i++) {
            cssText = cssText.replace(CLASS_MAP[i].re, '.cm-content ' + CLASS_MAP[i].cm);
        }
        return cssText.replace(/\.hljs(?![-\w])/g, '.cm-content');
    }

    function applyImportance(cssText) {
        return cssText.replace(
            /(background(?:-color)?|color)\s*:\s*([^;}]+?)(?=\s*[;}])/gi,
            '$1: $2 !important'
        );
    }

    function buildCustomThemeCss(t, opts) {
        const palette = {
            sbBg: t.bg, sbThumb: t.comment,
            fgColor: t.fg, selBg: 'rgba(128, 128, 128, 0.3)'
        };
        const tokenCss = `
            .cm-content { color: ${t.fg} !important; background: ${t.bg} !important; }
            .cm-content .ͼb { color: ${t.keyword} !important; }
            .cm-content .ͼc { color: ${t.literal} !important; }
            .cm-content .ͼd { color: ${t.number} !important; }
            .cm-content .ͼe { color: ${t.string} !important; }
            .cm-content .ͼg { color: ${t.variable} !important; }
            .cm-content .ͼl { color: ${t.property} !important; }
            .cm-content .ͼm { color: ${t.comment} !important; }
        `;
        if (opts && opts.tokensOnly) return tokenCss;
        return tokenCss + buildOverrides(palette, 'custom', opts);
    }

    function transform(themeName, hljsCss, opts) {
        const light = isLightTheme(themeName);
        const palette = extractColors(hljsCss, light);
        let cssText = applyClassMapping(hljsCss);
        cssText = applyImportance(cssText);
        const overrides = buildOverrides(palette, themeName, opts);
        return cssText + overrides;
    }

    return {
        transform: transform,
        isLightTheme: isLightTheme,
        applyClassMapping: applyClassMapping,
        applyImportance: applyImportance,
        extractColors: extractColors,
        CLASS_MAP: CLASS_MAP,
        FONT_STACKS: FONT_STACKS,
        resolveFontStack: resolveFontStack,
        clampFontSize: clampFontSize,
        buildCustomThemeCss: buildCustomThemeCss
    };
}));
