(function () {
    'use strict';

    if (window.NSFT_LogFormat) return;

    const WRAPPER_OWN_CLASS = 'nsft-logfmt-wrapper';
    const WRAPPER_CLASS = `nsft-codecard ${WRAPPER_OWN_CLASS}`;
    const BTN_GROUP_CLASS = 'nsft-codecard-bar nsft-logfmt-btn-group';
    const COPY_BTN_CLASS = 'nsft-codecard-btn nsft-logfmt-copy-btn';
    const HTML_CONTENT_CLASS = 'nsft-logfmt-html-content';
    const THEME_LINK_ID = 'nsft-logfmt-theme-link';
    const THEME_SCOPE = `.${WRAPPER_OWN_CLASS}`;

    const isDiagEnabled = () => !!(window.NSFT_DOM && window.NSFT_DOM.isDiagEnabled && window.NSFT_DOM.isDiagEnabled());

    let _loadedTheme = null;
    let _requestedTheme = null;

    function resolveTheme(name) {
        if (name !== 'auto') return name;
        const dark = document.documentElement.getAttribute('data-nsft-theme') === 'dark';
        return dark ? 'atom-one-dark' : 'atom-one-light';
    }

    try {
        chrome.storage.onChanged.addListener((changes, area) => {
            if (area !== 'local' || !changes.nsftTheme) return;
            if (_requestedTheme !== 'auto') return;
            setTimeout(() => ensureTheme('auto'), 60);
        });
    } catch (e) { }

    async function ensureTheme(themeName) {
        _requestedTheme = themeName || 'atom-one-dark';
        const name = resolveTheme(_requestedTheme);
        if (_loadedTheme === name && document.getElementById(THEME_LINK_ID)) return;
        const themeUrl = chrome.runtime.getURL(`scripts/libs/highlight/themes/${name}.css`);
        try {
            const response = await fetch(themeUrl);
            const cssText = await response.text();
            const scopedCss = await scopeCss(cssText, THEME_SCOPE);
            let style = document.getElementById(THEME_LINK_ID);
            if (!style) {
                style = document.createElement('style');
                style.id = THEME_LINK_ID;
                document.head.appendChild(style);
            }
            style.textContent = scopedCss;
            _loadedTheme = name;
        } catch (e) {
            if (isDiagEnabled()) console.warn('[NSFT:log_format] Error loading log theme:', e);
        }
    }

    async function scopeCss(cssText, scope) {
        const stripped = cssText.replace(/\/\*[\s\S]*?\*\//g, '');
        try {
            if (typeof CSSStyleSheet !== 'undefined' && CSSStyleSheet.prototype.replace) {
                const sheet = new CSSStyleSheet();
                await sheet.replace(stripped);
                return serializeScoped(sheet, scope);
            }
        } catch (e) { }
        return stripped.replace(/((?:^|[},])\s*)([.#a-z])/gi, `$1${scope} $2`);
    }

    function serializeScoped(sheet, scope) {
        const lines = [];
        const rules = sheet.cssRules || [];
        for (let i = 0; i < rules.length; i++) walkRule(rules[i], scope, lines);
        return lines.join('\n');
    }

    function walkRule(rule, scope, out) {
        if (rule.type === 1 || rule.style) {
            const scopedSelector = rule.selectorText.split(',').map(s => {
                const t = s.trim();
                return t ? `${scope} ${t}` : t;
            }).join(', ');
            out.push(`${scopedSelector} { ${rule.style.cssText} }`);
            return;
        }
        if (rule.cssRules) {
            const inner = [];
            for (let i = 0; i < rule.cssRules.length; i++) walkRule(rule.cssRules[i], scope, inner);
            const prelude = rule.conditionText
                ? `@${rule.type === 4 ? 'media' : 'supports'} ${rule.conditionText}`
                : (rule.cssText.split('{')[0] || '').trim();
            out.push(`${prelude} { ${inner.join('\n')} }`);
            return;
        }
        out.push(rule.cssText);
    }

    const tryJSON = (text) => {
        let cleanText = text.trim();
        let prefix = '';

        if (cleanText.startsWith('Error:')) {
            prefix = 'Error: ';
            cleanText = cleanText.substring(6).trim();
        }

        try {
            if (!(cleanText.startsWith('{') || cleanText.startsWith('['))) return null;
            return { data: JSON.parse(cleanText), isRepaired: false, prefix, rawOriginal: cleanText };
        } catch {
            try {
                const repaired = repairJSON(cleanText);
                if (repaired) return { data: JSON.parse(repaired), isRepaired: true, prefix, rawOriginal: cleanText };
            } catch (e) { }
            return null;
        }
    };

    const repairJSON = (jsonStr) => {
        let str = jsonStr.trim();
        if (!str) return null;

        const stack = [];
        let inString = false;
        let escaped = false;
        let lastChar = null;

        for (let i = 0; i < str.length; i++) {
            const char = str[i];

            if (escaped) { escaped = false; continue; }
            if (char === '\\') { escaped = true; continue; }
            if (char === '"') { inString = !inString; continue; }

            if (!inString) {
                if (char === '{' || char === '[') {
                    stack.push(char);
                } else if (char === '}') {
                    if (stack.length && stack[stack.length - 1] === '{') stack.pop();
                } else if (char === ']') {
                    if (stack.length && stack[stack.length - 1] === '[') stack.pop();
                }
                if (char.trim()) lastChar = char;
            }
        }

        if (!inString && stack.length === 0 && !/[,:]\s*$/.test(str)) return null;

        if (inString) {
            str += '"';
            if (stack.length > 0 && stack[stack.length - 1] === '{') {
                if (lastChar === '{' || lastChar === ',') str += ': null';
            }
        } else {
            if (/,\s*$/.test(str)) {
                str = str.replace(/,\s*$/, '');
            } else if (/:\s*$/.test(str)) {
                str += ' null';
            } else if (
                stack.length > 0 &&
                stack[stack.length - 1] === '{' &&
                /(?:[{,])\s*"(?:[^"\\]|\\.)*"\s*$/.test(str)
            ) {
                str += ': null';
            }
        }

        while (stack.length > 0) {
            const open = stack.pop();
            if (open === '{') str += '}';
            else if (open === '[') str += ']';
        }

        return str;
    };

    const HTML_ROOTS = new Set([
        'html', 'body', 'head', 'div', 'p', 'span', 'a', 'table', 'tbody', 'thead', 'tfoot',
        'tr', 'td', 'th', 'ul', 'ol', 'li', 'form', 'input', 'button', 'select', 'option',
        'textarea', 'label', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'br', 'hr', 'img',
        'strong', 'em', 'b', 'i', 'u', 's', 'pre', 'code', 'blockquote', 'figure', 'figcaption',
        'section', 'article', 'header', 'footer', 'nav', 'main', 'aside', 'small', 'mark',
        'dl', 'dt', 'dd', 'fieldset', 'legend', 'details', 'summary'
    ]);

    const looksLikeXml = (text) => {
        const t = (text || '').replace(/^[﻿​]+/, '').trim();
        if (t.length < 5) return false;
        if (!t.startsWith('<')) return false;
        if (/^<\?xml\b/i.test(t)) return true;
        if (/\bxmlns\s*(?::\w+)?\s*=/.test(t)) return true;
        if (/<\w+:\w+/.test(t)) return true;
        const stripped = t.replace(/^(?:<\?[^>]*\?>|<!--[\s\S]*?-->|<!DOCTYPE[^>]*>)\s*/gi, '').trim();
        const m = stripped.match(/^<([a-zA-Z][a-zA-Z0-9._-]*)/);
        if (!m) return false;
        if (HTML_ROOTS.has(m[1].toLowerCase())) return false;
        return /<\/[a-zA-Z]/.test(stripped);
    };

    const looksLikeHtml = (text) => {
        const t = (text || '').replace(/^[﻿​]+/, '').trim();
        if (t.length < 5) return false;
        if (!t.startsWith('<')) return false;
        if (!/<[a-zA-Z][^>]*>[\s\S]*?<\/[a-zA-Z][^>]*>|<[a-zA-Z][^>]*\/>/.test(t)) return false;
        try {
            const doc = new DOMParser().parseFromString(t, 'text/html');
            return !!(doc && doc.body && doc.body.children.length > 0);
        } catch (e) { return false; }
    };

    const HTML_VOID_ELEMENTS = new Set([
        'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr'
    ]);

    const RX_WHITESPACE_BETWEEN_TAGS = />\s+</g;
    const RX_PARTS_SPLIT = /(<[^>]+>)/;
    const RX_CLOSE_TAG = /^<\/[^>]+>/;
    const RX_SELF_CLOSE = /^<[^/?!][^>]*\/>$/;
    const RX_TAG_NAME = /^<\/?([a-zA-Z][a-zA-Z0-9-]*)/;
    const RX_OPEN_TAG = /^<[^/?!]/;
    const RX_STARTS_TAG = /^</;

    const formatMarkup = (source, opts) => {
        const useVoidElements = !!(opts && opts.voidElements);
        const normalized = (source || '').trim().replace(RX_WHITESPACE_BETWEEN_TAGS, '><');
        const parts = normalized.split(RX_PARTS_SPLIT).filter(p => p.length && p.trim());
        const tab = '  ';
        const isClose = (s) => RX_CLOSE_TAG.test(s);
        const isSelfClose = (s) => RX_SELF_CLOSE.test(s);
        const tagName = (s) => { const m = s.match(RX_TAG_NAME); return m ? m[1].toLowerCase() : ''; };
        const isVoid = (s) => useVoidElements && HTML_VOID_ELEMENTS.has(tagName(s));
        const isOpen = (s) => RX_OPEN_TAG.test(s) && !isSelfClose(s);
        const isText = (s) => !RX_STARTS_TAG.test(s);

        let indent = 0;
        let out = '';
        let i = 0;
        while (i < parts.length) {
            const part = parts[i];
            const next = parts[i + 1];
            const nextNext = parts[i + 2];

            if (isClose(part)) {
                indent = Math.max(0, indent - 1);
                out += tab.repeat(indent) + part + '\n';
                i++;
            } else if (isSelfClose(part) || (isOpen(part) && isVoid(part))) {
                out += tab.repeat(indent) + part + '\n';
                i++;
            } else if (isOpen(part)) {
                if (next && nextNext && isText(next) && isClose(nextNext)) {
                    out += tab.repeat(indent) + part + next + nextNext + '\n';
                    i += 3;
                } else if (next && isClose(next)) {
                    out += tab.repeat(indent) + part + next + '\n';
                    i += 2;
                } else {
                    out += tab.repeat(indent) + part + '\n';
                    indent++;
                    i++;
                }
            } else {
                out += tab.repeat(indent) + part + '\n';
                i++;
            }
        }
        return out.trimEnd();
    };

    const formatXml = (xml) => formatMarkup(xml, { voidElements: false });
    const formatHtml = (html) => formatMarkup(html, { voidElements: true });

    const RX_DANGEROUS_CSS = /(?:javascript\s*:|expression\s*\(|behavior\s*:|@import)/i;

    const extractStylesAndBody = (html) => {
        const doc = new DOMParser().parseFromString(html, 'text/html');
        doc.querySelectorAll('script, iframe, object, embed, link, meta').forEach(el => el.remove());
        doc.querySelectorAll('*').forEach(el => {
            Array.from(el.attributes).forEach(attr => {
                const name = attr.name.toLowerCase();
                if (name.startsWith('on')) {
                    el.removeAttribute(attr.name);
                    return;
                }
                if ((name === 'href' || name === 'src') && /^\s*javascript:/i.test(attr.value)) {
                    el.removeAttribute(attr.name);
                    return;
                }
                if (name === 'style' && RX_DANGEROUS_CSS.test(attr.value)) {
                    el.removeAttribute(attr.name);
                }
            });
        });
        const styles = [];
        doc.querySelectorAll('style').forEach(s => {
            styles.push(s.textContent || '');
            s.remove();
        });
        return { styles, body: doc.body.innerHTML };
    };

    const remapBodySelector = (css) => css.replace(/\bbody\b(?![-_\w])/g, '.nsft-html-body');

    const i18n = (key, fallback) => (chrome.i18n.getMessage(key) || fallback);

    const ICON_COPY = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="5.5" y="5.5" width="8" height="8" rx="1.8"/><path d="M10.5 3.2A1.7 1.7 0 0 0 8.8 2H3.7A1.7 1.7 0 0 0 2 3.7v5.1c0 .8.6 1.5 1.4 1.7"/></svg>';
    const ICON_DOWNLOAD = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M8 2.5v7.5"/><path d="M5 7.4 8 10.4l3-3"/><path d="M2.8 12.2v.4a1.4 1.4 0 0 0 1.4 1.4h7.6a1.4 1.4 0 0 0 1.4-1.4v-.4"/></svg>';

    const makeBarButton = (label, iconSvg) => {
        const btn = document.createElement('button');
        btn.className = COPY_BTN_CLASS;
        btn.type = 'button';
        btn.title = label;
        if (iconSvg) btn.innerHTML = iconSvg;
        const span = document.createElement('span');
        span.textContent = label;
        btn.appendChild(span);
        return btn;
    };

    const btnLabelEl = (btn) => btn.querySelector('span') || btn;

    const SLUG_MAX = 40;

    function slugPart(v) {
        return String(v == null ? '' : v)
            .normalize('NFD').replace(/[̀-ͯ]/g, '')
            .replace(/[^\w.\- ]+/g, ' ')
            .trim()
            .replace(/[\s-]+/g, '-')
            .slice(0, SLUG_MAX)
            .replace(/^[-.]+|[-.]+$/g, '');
    }

    function buildFileName(parts, ext) {
        const slug = (Array.isArray(parts) ? parts : [parts])
            .map(slugPart)
            .filter(Boolean)
            .join('_');
        return (slug || 'log') + '.' + (ext || 'txt');
    }

    function stampPart(value) {
        const s = String(value == null ? '' : value).trim();
        const m = /(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/.exec(s);
        if (m) return m[1] + m[2] + m[3] + '-' + m[4] + m[5] + (m[6] || '');
        if (s) return s;
        const d = new Date();
        const p = (n) => String(n).padStart(2, '0');
        return '' + d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate())
            + '-' + p(d.getHours()) + p(d.getMinutes());
    }

    const createButtonGroup = (text, lang, nameParts) => {
        const group = document.createElement('div');
        group.className = BTN_GROUP_CLASS;

        const copyLabel = i18n('copy', 'Copy');
        const copiedLabel = i18n('copied', 'Copied');
        const downloadLabel = i18n('download', 'Descargar');

        const copyBtn = makeBarButton(copyLabel, ICON_COPY);
        copyBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (!navigator.clipboard) return;
            navigator.clipboard.writeText(text).then(() => {
                btnLabelEl(copyBtn).textContent = copiedLabel + '!';
                copyBtn.classList.add('copied');
                setTimeout(() => {
                    btnLabelEl(copyBtn).textContent = copyLabel;
                    copyBtn.classList.remove('copied');
                }, 2000);
            });
        });

        const downloadBtn = makeBarButton(downloadLabel, ICON_DOWNLOAD);
        downloadBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const mime = lang === 'json' ? 'application/json'
                : lang === 'html' ? 'text/html'
                    : 'text/plain';
            const ext = lang === 'json' ? 'json'
                : lang === 'html' ? 'html'
                    : lang === 'sql' ? 'sql'
                        : 'txt';
            const blob = new Blob([text], { type: mime });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = (nameParts && nameParts.length)
                ? buildFileName(nameParts, ext)
                : `log.${ext}`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        });

        group.appendChild(copyBtn);
        group.appendChild(downloadBtn);
        return group;
    };

    const renderCode = (el, text, lang, isRepaired = false, prefix = '', rawOriginal = '', nameParts = null) => {
        const wrapper = document.createElement('div');
        wrapper.className = WRAPPER_CLASS;

        const btnGroup = createButtonGroup(text, lang, nameParts);

        let toggleBtn = null;
        let originalPre = null;
        if (isRepaired && rawOriginal && rawOriginal !== text) {
            const viewOriginalLabel = i18n('log_view_original', 'View original');
            const viewRepairedLabel = i18n('log_view_repaired', 'View repaired');
            toggleBtn = makeBarButton(viewOriginalLabel, '');
            toggleBtn.dataset.viewOriginalLabel = viewOriginalLabel;
            toggleBtn.dataset.viewRepairedLabel = viewRepairedLabel;
            btnGroup.appendChild(toggleBtn);
        }

        wrapper.appendChild(btnGroup);

        const pre = document.createElement('pre');
        const code = document.createElement('code');
        code.className = `${lang} hljs`;
        code.textContent = text;
        pre.appendChild(code);
        wrapper.appendChild(pre);

        if (toggleBtn) {
            originalPre = document.createElement('pre');
            const originalCode = document.createElement('code');
            originalCode.className = 'plaintext hljs';
            originalCode.textContent = rawOriginal;
            originalPre.appendChild(originalCode);
            originalPre.style.display = 'none';
            wrapper.appendChild(originalPre);

            let showingOriginal = false;
            toggleBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                showingOriginal = !showingOriginal;
                pre.style.display = showingOriginal ? 'none' : '';
                originalPre.style.display = showingOriginal ? '' : 'none';
                const next = showingOriginal
                    ? toggleBtn.dataset.viewRepairedLabel
                    : toggleBtn.dataset.viewOriginalLabel;
                btnLabelEl(toggleBtn).textContent = next;
                toggleBtn.title = next;
            });
        }

        if (isRepaired) {
            const warning = document.createElement('div');
            warning.className = 'nsft-codecard-warning nsft-logfmt-warning';
            warning.textContent = '⚠️ ' + i18n('json_incomplete_warning', 'Log truncated. JSON auto-repaired.');
            wrapper.appendChild(warning);
        }

        el.innerHTML = '';
        if (prefix) el.appendChild(document.createTextNode(prefix));
        el.appendChild(wrapper);

        if (window.hljs) {
            try { window.hljs.highlightElement(code); } catch (e) { }
        }
    };

    const renderHtml = (el, text, nameParts = null) => {
        const wrapper = document.createElement('div');
        wrapper.className = `${WRAPPER_CLASS} nsft-logfmt-html`;

        const btnGroup = createButtonGroup(text, 'html', nameParts);

        const previewLabel = i18n('log_html_preview', 'Vista');
        const codeLabel = i18n('log_html_code', 'Código');
        const toggleBtn = makeBarButton(codeLabel, '');
        btnGroup.appendChild(toggleBtn);

        wrapper.appendChild(btnGroup);

        const host = document.createElement('div');
        host.className = HTML_CONTENT_CLASS;
        const shadow = host.attachShadow({ mode: 'open' });

        const { styles, body } = extractStylesAndBody(text);
        const styleBlock = styles.length
            ? `<style>${styles.map(remapBodySelector).join('\n')}</style>`
            : '';
        const hostStyle = `<style>
            :host { display: block; }
            .nsft-html-body { padding: 14px 16px; min-height: 20px; }
        </style>`;
        shadow.innerHTML = hostStyle + styleBlock + `<div class="nsft-html-body">${body}</div>`;
        wrapper.appendChild(host);

        const codePre = document.createElement('pre');
        const codeEl = document.createElement('code');
        codeEl.className = 'xml hljs';
        codeEl.textContent = formatHtml(text);
        codePre.appendChild(codeEl);
        codePre.style.display = 'none';
        wrapper.appendChild(codePre);

        let showingCode = false;
        let highlighted = false;
        toggleBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            showingCode = !showingCode;
            host.style.display = showingCode ? 'none' : '';
            codePre.style.display = showingCode ? '' : 'none';
            const next = showingCode ? previewLabel : codeLabel;
            btnLabelEl(toggleBtn).textContent = next;
            toggleBtn.title = next;
            if (showingCode && !highlighted && window.hljs) {
                try { window.hljs.highlightElement(codeEl); highlighted = true; } catch (err) { }
            }
        });

        el.innerHTML = '';
        el.appendChild(wrapper);
    };

    const renderInto = (el, rawText, opts) => {
        if (!el) return null;
        const raw = (rawText != null ? String(rawText) : (el.textContent || '')).trim();
        if (!raw) return null;
        const nameParts = (opts && opts.nameParts) || null;

        if (window.sqlFormatter && /^select\b/i.test(raw)) {
            let formatted = raw;
            try {
                formatted = window.sqlFormatter.format(raw, {
                    language: 'sql',
                    keywordCase: 'upper',
                    indent: '    '
                });
            } catch (e) { }
            renderCode(el, formatted, 'sql', false, '', '', nameParts);
            return 'sql';
        }

        const parsedResult = tryJSON(raw);
        if (parsedResult) {
            renderCode(
                el,
                JSON.stringify(parsedResult.data, null, 2),
                'json',
                parsedResult.isRepaired,
                parsedResult.prefix,
                parsedResult.rawOriginal,
                nameParts
            );
            return 'json';
        }

        if (looksLikeXml(raw)) {
            renderCode(el, formatXml(raw), 'xml', false, '', '', nameParts);
            return 'xml';
        }

        if (looksLikeHtml(raw)) {
            renderHtml(el, raw, nameParts);
            return 'html';
        }

        return null;
    };

    window.NSFT_LogFormat = {
        renderInto,
        ensureTheme,
        makeBarButton,
        btnLabelEl,
        ICONS: { copy: ICON_COPY, download: ICON_DOWNLOAD },
        buildFileName,
        stampPart,
        looksLikeXml,
        looksLikeHtml,
        tryJSON
    };
})();
