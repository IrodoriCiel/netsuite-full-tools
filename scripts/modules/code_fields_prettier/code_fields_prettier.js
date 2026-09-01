(function () {
    'use strict';
    const STORAGE_KEY = 'enableCodeFieldPrettier';

    const WRAPPER_OWN_CLASS = 'nsft-code-fields-prettier-wrapper';
    const WRAPPER_CLASS = `nsft-codecard ${WRAPPER_OWN_CLASS}`;
    const COPY_BTN_CLASS = 'nsft-codecard-btn nsft-code-fields-prettier-copy-btn';
    const THEME_LINK_ID = 'nsft-code-fields-prettier-theme-link';

    if (window.location.search.match(/[?&]e=[Tt]/)) return;
    if (!/\.nl$/.test(location.pathname)) return;
    try {
        if (window.NSFT_RecordButtons && NSFT_RecordButtons.isExcludedPage && NSFT_RecordButtons.isExcludedPage()) return;
    } catch (e) { }

    let _diag = false;
    let _unsub = null;
    let _started = false;
    let _theme = 'auto';
    let _nsftDark = false;

    chrome.storage.local.get({
        [STORAGE_KEY]: true,
        codeFieldPrettierTheme: 'auto',
        enableDiscreetMode: false,
        nsftSelectorDiagnostics: false,
        nsftTheme: 'light'
    }, (items) => {
        _diag = !!items.nsftSelectorDiagnostics;
        _nsftDark = items.nsftTheme === 'dark';
        if (!items[STORAGE_KEY] || items.enableDiscreetMode) return;
        startPrettier(items.codeFieldPrettierTheme);
    });

    chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== 'local') return;
        if (changes.nsftSelectorDiagnostics) _diag = !!changes.nsftSelectorDiagnostics.newValue;
        if (changes.codeFieldPrettierTheme && _started) {
            updateTheme(changes.codeFieldPrettierTheme.newValue || 'auto');
        }
        if (changes.nsftTheme) {
            _nsftDark = changes.nsftTheme.newValue === 'dark';
            if (_started && _theme === 'auto') updateTheme('auto');
        }
        if (changes[STORAGE_KEY]) {
            if (changes[STORAGE_KEY].newValue) {
                chrome.storage.local.get({ codeFieldPrettierTheme: 'auto', enableDiscreetMode: false }, (s) => {
                    if (!s.enableDiscreetMode) startPrettier(s.codeFieldPrettierTheme);
                });
            } else {
                teardown();
            }
        }
    });

    function startPrettier(themeName) {
        if (_started) return;
        _started = true;
        updateTheme(themeName);
        scanSpans();
        observeDomChanges();
    }

    function teardown() {
        _started = false;
        if (_unsub) { _unsub(); _unsub = null; }
        const themeStyle = document.getElementById(THEME_LINK_ID);
        if (themeStyle) themeStyle.remove();
    }

    function resolveTheme(themeName) {
        if (themeName !== 'auto') return themeName;
        return _nsftDark ? 'atom-one-dark' : 'atom-one-light';
    }

    async function updateTheme(themeName) {
        _theme = themeName || 'auto';
        const themeUrl = chrome.runtime.getURL(`scripts/libs/highlight/themes/${resolveTheme(_theme)}.css`);
        try {
            const response = await fetch(themeUrl);
            let cssText = await response.text();

            cssText = cssText.replace(/\/\*[\s\S]*?\*\//g, '');

            const scope = `.${WRAPPER_OWN_CLASS}`;
            const scopedCss = cssText.replace(/((?:^|[},])\s*)([.#a-z])/gi, `$1${scope} $2`);

            let style = document.getElementById(THEME_LINK_ID);
            if (!style) {
                style = document.createElement('style');
                style.id = THEME_LINK_ID;
                document.head.appendChild(style);
            }
            style.textContent = scopedCss;
        } catch (e) {
            if (_diag) console.warn("[NSFT] Error loading code field theme:", e);
        }
    }

    const HTML_ROOTS = new Set([
        'html','body','head','div','p','span','a','table','tbody','thead','tfoot','tr','td','th',
        'ul','ol','li','form','input','button','select','option','textarea','label',
        'h1','h2','h3','h4','h5','h6','br','hr','img','strong','em','b','i','u','s','pre','code',
        'blockquote','figure','figcaption','section','article','header','footer','nav','main',
        'aside','small','mark','dl','dt','dd','fieldset','legend','details','summary'
    ]);

    const HTML_VOID_ELEMENTS = new Set([
        'area','base','br','col','embed','hr','img','input','link','meta','param','source','track','wbr'
    ]);

    function looksLikeXml(text) {
        const t = (text || '').replace(/^[\uFEFF\u200B]+/, '').trim();
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
    }

    function looksLikeHtml(text) {
        const t = (text || '').replace(/^[\uFEFF\u200B]+/, '').trim();
        if (t.length < 5) return false;
        if (!t.startsWith('<')) return false;
        if (!/<[a-zA-Z][^>]*>[\s\S]*?<\/[a-zA-Z][^>]*>|<[a-zA-Z][^>]*\/?>/.test(t)) return false;
        const tmp = document.createElement('div');
        tmp.innerHTML = t;
        return tmp.children.length > 0;
    }

    function formatMarkup(source, opts) {
        const useVoidElements = !!(opts && opts.voidElements);
        const normalized = (source || '').trim().replace(/>\s+</g, '><');
        const parts = normalized.split(/(<[^>]+>)/).filter(p => p.length && p.trim());
        const tab = '  ';
        const isClose = (s) => /^<\/[^>]+>/.test(s);
        const isSelfClose = (s) => /^<[^/?!][^>]*\/>$/.test(s);
        const tagName = (s) => { const m = s.match(/^<\/?([a-zA-Z][a-zA-Z0-9-]*)/); return m ? m[1].toLowerCase() : ''; };
        const isVoid = (s) => useVoidElements && HTML_VOID_ELEMENTS.has(tagName(s));
        const isOpen = (s) => /^<[^/?!]/.test(s) && !isSelfClose(s);
        const isText = (s) => !/^</.test(s);

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
    }

    const formatXml = (text) => formatMarkup(text, { voidElements: false });
    const formatHtml = (text) => formatMarkup(text, { voidElements: true });

    function extractStylesAndBody(html) {
        const doc = new DOMParser().parseFromString(html, 'text/html');
        doc.querySelectorAll('script, iframe, object, embed, link, meta').forEach(el => el.remove());
        doc.querySelectorAll('*').forEach(el => {
            Array.from(el.attributes).forEach(attr => {
                const name = attr.name.toLowerCase();
                if (name.startsWith('on')) { el.removeAttribute(attr.name); return; }
                if ((name === 'href' || name === 'src') && /^\s*javascript:/i.test(attr.value)) {
                    el.removeAttribute(attr.name);
                }
            });
        });
        const styles = [];
        doc.querySelectorAll('style').forEach(s => { styles.push(s.textContent || ''); s.remove(); });
        return { styles, body: doc.body.innerHTML };
    }

    const remapBodySelector = (css) => css.replace(/\bbody\b(?![-_\w])/g, '.nsft-html-body');


    function barButton(label, iconName) {
        const LF = window.NSFT_LogFormat;
        if (LF && LF.makeBarButton) {
            const btn = LF.makeBarButton(label, (LF.ICONS && LF.ICONS[iconName]) || '');
            btn.className = COPY_BTN_CLASS;
            return btn;
        }
        const btn = document.createElement('button');
        btn.className = COPY_BTN_CLASS;
        btn.type = 'button';
        btn.title = label;
        const span = document.createElement('span');
        span.textContent = label;
        btn.appendChild(span);
        return btn;
    }

    function btnLabel(btn) {
        const LF = window.NSFT_LogFormat;
        if (LF && LF.btnLabelEl) return LF.btnLabelEl(btn);
        return btn.querySelector('span') || btn;
    }

    function addRawToggle(wrapper, btnGroup, viewEls, rawText, opts) {
        const LF = window.NSFT_LogFormat;
        if (!LF || !LF.addRawToggle || !rawText) return;
        LF.addRawToggle(wrapper, btnGroup, viewEls, rawText, Object.assign({
            makeBtn: (label) => barButton(label, 'raw'),
            preClass: 'nsft-code-fields-prettier-raw'
        }, opts || {}));
    }

    function fieldNameOf(span) {
        let el = span;
        for (let i = 0; i < 4 && el; i++, el = el.parentElement) {
            const raw = (el.id || (el.dataset && el.dataset.fieldName) || '').trim();
            if (!raw) continue;
            const clean = raw.replace(/_fs_(inpt|lbl)$|_val$|_display$|_lbl$/i, '');
            if (/^[a-z_][\w]*$/i.test(clean)) return clean;
        }
        const wrap = span.closest && span.closest('div.uir-field-wrapper, td.uir-field, tr');
        const lbl = wrap && wrap.querySelector('.uir-label, span.smallgraytextnolink, label');
        const txt = lbl && (lbl.innerText || lbl.textContent || '').trim();
        return (txt || '').replace(/[:*]\s*$/, '');
    }

    function fileNameParts(span) {
        const LF = window.NSFT_LogFormat;
        let recType = '';
        let recId = '';
        try {
            const p = new URLSearchParams(location.search);
            recType = p.get('rectype') || '';
            recId = p.get('id') || '';
        } catch (e) { }
        const form = (location.pathname.split('/').pop() || '').replace(/\.nl$/i, '');
        return [
            form,
            recType ? 'rt' + recType : '',
            recId ? 'id' + recId : '',
            fieldNameOf(span),
            LF && LF.stampPart ? LF.stampPart() : ''
        ];
    }

    function createButtonGroup(content, type, nameParts) {
        const group = document.createElement('div');
        group.className = 'nsft-codecard-bar nsft-code-fields-prettier-btn-group';

        const copyBtn = barButton(copyLabelFor(type), 'copy');
        copyBtn.dataset.nsFormatType = type;
        copyBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const textToCopy = type === 'JSON' ? JSON.stringify(content, null, 2) : content;

            const acuse = () => {
                btnLabel(copyBtn).textContent = chrome.i18n.getMessage('copied') + '!';
                copyBtn.classList.add('copied');
                setTimeout(() => {
                    setButtonText(copyBtn, type);
                    copyBtn.classList.remove('copied');
                }, 1500);
            };

            if (window.NSFT_Clipboard) {
                NSFT_Clipboard.copy(textToCopy, { toast: { preview: false }, onSuccess: acuse });
            } else if (navigator.clipboard) {
                navigator.clipboard.writeText(textToCopy).then(acuse);
            }
        });

        const downloadBtn = barButton(chrome.i18n.getMessage('download') || 'Descargar', 'download');
        downloadBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const textToDownload = type === 'JSON' ? JSON.stringify(content, null, 2) : content;
            const mime = type === 'JSON' ? 'application/json'
                : type === 'HTML' ? 'text/html'
                : type === 'XML' ? 'application/xml'
                : 'text/plain';
            const ext = type === 'JSON' ? 'json'
                : type === 'HTML' ? 'html'
                : type === 'XML' ? 'xml'
                : type === 'SQL' ? 'sql'
                : type === 'FTL' ? 'ftl'
                : 'txt';
            const blob = new Blob([textToDownload], { type: mime });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            const LF = window.NSFT_LogFormat;
            a.download = (LF && LF.buildFileName && nameParts && nameParts.length)
                ? LF.buildFileName(nameParts, ext)
                : `file.${ext}`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        });

        group.appendChild(copyBtn);
        group.appendChild(downloadBtn);
        return group;
    }

    function formatElement(span, type, content, rawSource) {
        const wrapper = document.createElement('div');
        wrapper.className = WRAPPER_CLASS;

        const btnGroup = createButtonGroup(content, type, fileNameParts(span));
        wrapper.appendChild(btnGroup);

        const pre = document.createElement('pre');
        const code = document.createElement('code');
        const langClass = type === 'JSON' ? 'language-json'
            : type === 'SQL' ? 'language-sql'
            : type === 'XML' ? 'language-xml'
            : type === 'FTL' ? 'language-freemarker'
            : 'hljs';
        code.className = `${langClass} hljs`;

        let textContent = '';
        if (type === 'JSON') {
            textContent = JSON.stringify(content, null, 2);
        } else if (type === 'SQL') {
            if (window.sqlFormatter && typeof window.sqlFormatter.format === 'function') {
                try {
                    const PH_RE = /\$\{[^\s}]*\}?|(?<!\w)@\w+/g;
                    const placeholders = [];
                    const sentinelled = content.replace(PH_RE, (match) => {
                        const token = `NSFT_PH_${placeholders.length}_NSFT`;
                        placeholders.push(match);
                        return token;
                    });
                    const formatted = window.sqlFormatter.format(sentinelled, {
                        language: 'sql', keywordCase: 'upper', indent: '  '
                    });
                    textContent = placeholders.length
                        ? formatted.replace(/NSFT_PH_(\d+)_NSFT/g, (_, idx) => placeholders[+idx] ?? '')
                        : formatted;
                } catch (e) {
                    console.warn('[NSFT] SQL Format error:', e);
                    textContent = content;
                }
            } else {
                textContent = content;
            }
        } else if (type === 'XML') {
            textContent = formatXml(content);
        } else {
            textContent = content;
        }

        code.textContent = textContent;
        pre.appendChild(code);
        wrapper.appendChild(pre);

        addRawToggle(wrapper, btnGroup, [pre], rawSource);

        if (window.hljs) {
            try { window.hljs.highlightElement(code); } catch (err) { console.warn('[NSFT] Highlight error:', err); }
        }

        span.replaceWith(wrapper);
    }

    function renderHtmlElement(span, content) {
        const wrapper = document.createElement('div');
        wrapper.className = `${WRAPPER_CLASS} nsft-code-fields-prettier-html`;

        const btnGroup = createButtonGroup(content, 'HTML', fileNameParts(span));

        const previewLabel = chrome.i18n.getMessage('log_html_preview') || 'Vista';
        const codeLabel = chrome.i18n.getMessage('log_html_code') || 'Código';
        const toggleBtn = barButton(codeLabel, '');
        btnGroup.appendChild(toggleBtn);

        wrapper.appendChild(btnGroup);

        const host = document.createElement('div');
        host.className = 'nsft-code-fields-prettier-html-content';
        const shadow = host.attachShadow({ mode: 'open' });
        const { styles, body } = extractStylesAndBody(content);
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
        codeEl.className = 'language-xml hljs';
        codeEl.textContent = formatHtml(content);
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
            btnLabel(toggleBtn).textContent = next;
            toggleBtn.title = next;
            if (showingCode && !highlighted && window.hljs) {
                try { window.hljs.highlightElement(codeEl); highlighted = true; } catch (err) { }
            }
        });

        addRawToggle(wrapper, btnGroup, [host, codePre], content, { alsoDisable: [toggleBtn] });

        span.replaceWith(wrapper);
    }

    function copyLabelFor(type) {
        if (type === 'JSON') return chrome.i18n.getMessage('copyJson');
        if (type === 'SQL') return chrome.i18n.getMessage('copySql');
        if (type === 'XML') return chrome.i18n.getMessage('copyXml') || chrome.i18n.getMessage('copy') + ' XML';
        if (type === 'HTML') return chrome.i18n.getMessage('copyHtml') || chrome.i18n.getMessage('copy') + ' HTML';
        if (type === 'FTL') return chrome.i18n.getMessage('copyFreeMarker') || chrome.i18n.getMessage('copy') + ' FreeMarker';
        return chrome.i18n.getMessage('copy');
    }

    function setButtonText(btn, type) {
        btnLabel(btn).textContent = copyLabelFor(type);
    }

    function updateAllButtonsText() {
        document.querySelectorAll('.nsft-code-fields-prettier-copy-btn').forEach(btn => {
            if (!btn.dataset.nsFormatType) return;
            if (btnLabel(btn).textContent.includes('!')) return;
            setButtonText(btn, btn.dataset.nsFormatType);
        });
    }

    function looksLikeFreeMarker(text) {
        const t = (text || '').replace(/^[\uFEFF\u200B]+/, '');
        if (t.length < 8) return false;
        return /<#[a-zA-Z-]/.test(t)
            || /<\/#[a-zA-Z]/.test(t)
            || /<@[a-zA-Z]/.test(t)
            || /\[#ftl\b/i.test(t);
    }

    const SQL_FORMAS = [
        [/^select\b/i,              /\bfrom\b/i],
        [/^delete\b/i,              /\bfrom\b/i],
        [/^update\b/i,              /\bset\b/i],
        [/^insert\b/i,              /\binto\b/i],
        [/^merge\b/i,               /\b(into|using)\b/i],
        [/^with\b/i,                /\bas\s*\(/i],
        [/^(create|alter|drop)\b/i, /\b(table|view|index|sequence|synonym|procedure|function|trigger|database|schema|materialized)\b/i]
    ];

    function looksLikeSQL(text) {
        if (!text || text.length < 10) return false;
        const t = text.trim();
        return SQL_FORMAS.some(([verbo, companera]) => verbo.test(t) && companera.test(t));
    }

    function decodeHtmlEntities(input) {
        if (!input || typeof input !== 'string') return input;
        const txt = document.createElement('textarea');
        txt.innerHTML = input;
        return txt.value;
    }

    function shouldProcessNode(node) {
        if (!node || node.nodeType !== Node.ELEMENT_NODE) return false;
        return node.matches && (
            node.matches('span.input, span.uir-field-input, div.uir-field-wrapper, td.uir-field') ||
            node.matches('span[data-nsps-type="field_input"]')
        );
    }

    const VALOR_SEL = 'span.input, span.uir-field-input, span[data-nsps-type="field_input"]';
    const ETIQUETA_SEL = '.uir-label, .smallgraytextnolink, label, [id$="_lbl"]';

    function scanSpans(root = document) {
        const selector = 'span.input, span.uir-field-input, div.uir-field-wrapper, td.uir-field, span[data-nsps-type="field_input"]';
        const candidates = Array.from(root.querySelectorAll(selector));

        candidates.forEach(span => {
            if (span.dataset && span.dataset.nsftPrettierDone) return;

            if (span.querySelector(VALOR_SEL)) return;
            if (span.querySelector(ETIQUETA_SEL)) return;
            if (span.matches && span.matches(ETIQUETA_SEL)) return;

            if (span.querySelector('input, textarea, select, button, iframe, img')) return;

            let text = span.innerText;
            if (!text) text = span.textContent;

            if (text && (text.includes('&lt;') || text.includes('&quot;'))) {
                text = decodeHtmlEntities(span.innerHTML);
            }

            text = (text || '').trim();
            if (!text || text.length < 2) return;

            if ((text.startsWith('{') && text.endsWith('}')) || (text.startsWith('[') && text.endsWith(']'))) {
                try {
                    const jsonObj = JSON.parse(text);
                    if (typeof jsonObj === 'object' && jsonObj !== null) {
                        formatElement(span, 'JSON', jsonObj, text);
                        span.dataset.nsftPrettierDone = '1';
                        return;
                    }
                } catch (e) {
                    try {
                        const decoded = decodeHtmlEntities(text);
                        const jsonObj2 = JSON.parse(decoded);
                        if (typeof jsonObj2 === 'object' && jsonObj2 !== null) {
                            formatElement(span, 'JSON', jsonObj2, decoded);
                            span.dataset.nsftPrettierDone = '1';
                            return;
                        }
                    } catch (err2) { }
                }
            }

            if (looksLikeFreeMarker(text)) {
                formatElement(span, 'FTL', text, text);
                span.dataset.nsftPrettierDone = '1';
                return;
            }

            if (looksLikeSQL(text)) {
                formatElement(span, 'SQL', text, text);
                span.dataset.nsftPrettierDone = '1';
                return;
            }

            if (looksLikeXml(text)) {
                formatElement(span, 'XML', text, text);
                span.dataset.nsftPrettierDone = '1';
                return;
            }

            if (looksLikeHtml(text)) {
                renderHtmlElement(span, text);
                span.dataset.nsftPrettierDone = '1';
            }
        });
    }

    function observeDomChanges() {
        if (!document.body) {
            window.addEventListener('DOMContentLoaded', () => {
                scanSpans();
                observeDomChanges();
            });
            return;
        }

        const handler = (mutations) => {
            if (!mutations) return;
            mutations.forEach(m => {
                if (!m.addedNodes) return;
                m.addedNodes.forEach(node => {
                    if (node.nodeType !== Node.ELEMENT_NODE) return;
                    if (shouldProcessNode(node)) scanSpans(node.parentNode || document);
                    else if (node.querySelectorAll) scanSpans(node);
                });
            });
        };

        if (window.NSFT_Observer && typeof window.NSFT_Observer.subscribe === 'function') {
            _unsub = window.NSFT_Observer.subscribe(handler);
            return;
        }

        const observer = new MutationObserver(handler);
        observer.observe(document.body, { childList: true, subtree: true });
        _unsub = () => observer.disconnect();
    }

})();
