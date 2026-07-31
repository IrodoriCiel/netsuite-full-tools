(function () {
    'use strict';

    const STORAGE_KEY = 'enableFormatCodeFields';

    const WRAPPER_CLASS = 'nsft-format-code-fields-wrapper';
    const BTN_CLASS = 'nsft-format-code-fields-btn';
    const STATUS_CLASS = 'nsft-format-code-fields-status';

    if (!window.location.search.match(/[?&]e=[Tt]/)) return;
    if (window.location.pathname.includes('/app/common/record/edittextmediaitem.nl')) return;

    let _ac = null;
    let _unsub = null;
    let _processed = new WeakSet();
    let _started = false;
    let _formatOnBlur = false;

    chrome.storage.local.get({
        [STORAGE_KEY]: true,
        enableDiscreetMode: false,
        formatCodeFieldsOnBlur: false
    }, (items) => {
        _formatOnBlur = !!items.formatCodeFieldsOnBlur;
        if (!items[STORAGE_KEY] || items.enableDiscreetMode) return;
        start();
    });

    chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== 'local') return;
        if (changes.formatCodeFieldsOnBlur) _formatOnBlur = !!changes.formatCodeFieldsOnBlur.newValue;
        if (changes[STORAGE_KEY]) {
            if (changes[STORAGE_KEY].newValue) {
                chrome.storage.local.get({ enableDiscreetMode: false }, (s) => { if (!s.enableDiscreetMode) start(); });
            } else {
                teardown();
            }
        }
    });

    function start() {
        if (_started) return;
        _started = true;
        _ac = new AbortController();
        scan();
        observeDomChanges();
    }

    function teardown() {
        _started = false;
        if (_ac) { _ac.abort(); _ac = null; }
        if (_unsub) { _unsub(); _unsub = null; }
        _processed = new WeakSet();
        document.querySelectorAll(`.${WRAPPER_CLASS}`).forEach(el => el.remove());
    }

    const isJSON = (text) => {
        if (!text || text.trim().length < 2) return false;
        const s = text.trim();
        if ((s.startsWith('{') && s.endsWith('}')) || (s.startsWith('[') && s.endsWith(']'))) {
            try {
                JSON.parse(s);
                return true;
            } catch (e) { return false; }
        }
        return false;
    };

    const looksLikeSQL = (text) => {
        if (!text || text.length < 10) return false;
        return /^\s*(select|with|insert|update|delete|create|alter|drop|merge|explain|call|truncate|grant|revoke|begin|declare)\b/i.test(text.trim());
    };

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

    const looksLikeXml = (text) => {
        const t = (text || '').trim();
        if (t.length < 5) return false;
        if (/^<\?xml\b/i.test(t)) return true;
        if (/\bxmlns\s*(?::\w+)?\s*=/.test(t)) return true;
        if (/<\w+:\w+/.test(t)) return true;
        try {
            const doc = new DOMParser().parseFromString(t, 'application/xml');
            if (doc.getElementsByTagName('parsererror').length > 0) return false;
            const rootName = (doc.documentElement && doc.documentElement.nodeName || '').toLowerCase();
            if (!rootName) return false;
            return !HTML_ROOTS.has(rootName);
        } catch (e) {
            return false;
        }
    };

    const looksLikeHtml = (text) => {
        const t = text || '';
        if (t.length < 5) return false;
        if (!/<[a-zA-Z][^>]*>[\s\S]*?<\/[a-zA-Z][^>]*>|<[a-zA-Z][^>]*\/?>/.test(t)) return false;
        const tmp = document.createElement('div');
        tmp.innerHTML = t;
        return tmp.children.length > 0;
    };

    const formatMarkup = (source, opts) => {
        const useVoidElements = !!(opts && opts.voidElements);
        const normalized = (source || '').trim().replace(/>\s+</g, '><');
        const parts = normalized.split(/(<[^>]+>)/).filter(p => p.length && p.trim());
        const tab = '  ';
        const isClose = (s) => /^<\/[^>]+>/.test(s);
        const isSelfClose = (s) => /^<[^/?!][^>]*\/>$/.test(s);
        const tagName = (s) => {
            const m = s.match(/^<\/?([a-zA-Z][a-zA-Z0-9-]*)/);
            return m ? m[1].toLowerCase() : '';
        };
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
    };

    const formatXml = (text) => formatMarkup(text, { voidElements: false });
    const formatHtml = (text) => formatMarkup(text, { voidElements: true });

    const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    const protectPlaceholders = (sql) => {
        const map = [];
        let idx = 0;
        sql = sql.replace(/\$\{([^\s)]+?)\}?/g, function (m) {
            const key = `__PH_${idx}__`;
            map.push({ key, original: m, forcedNewline: true });
            idx++;
            return key;
        });
        sql = sql.replace(/@[_A-Za-z0-9]+/g, function (m) {
            const key = `__PH_${idx}__`;
            map.push({ key, original: m, forcedNewline: false });
            idx++;
            return key;
        });
        return { text: sql, map };
    };

    const restorePlaceholders = (text, map) => {
        if (!map || !map.length) return text;
        map.forEach(entry => {
            const keyEsc = escapeRegex(entry.key);
            if (entry.forcedNewline) {
                const re = new RegExp('\\s*' + keyEsc, 'g');
                text = text.replace(re, '\n' + entry.original);
            } else {
                text = text.split(entry.key).join(entry.original);
            }
        });
        text = text.replace(/\n{3,}/g, '\n\n');
        text = text.replace(/^[ \t]+$/gm, '');
        return text;
    };

    const formatSQLWithLib = (raw) => {
        if (!window.sqlFormatter || typeof window.sqlFormatter.format !== 'function') return raw;
        try {
            return window.sqlFormatter.format(raw, {
                language: 'sql',
                keywordCase: 'upper',
                indent: '    '
            });
        } catch (e) {
            return raw;
        }
    };

    const simpleSQLFallback = (raw) => {
        try {
            let s = raw.replace(/\r\n/g, '\n').replace(/\t/g, ' ');
            s = s.split('\n').map(l => l.replace(/\s+/g, ' ').trim()).join('\n');
            s = s.replace(/\s*,\s*/g, ',\n  ');
            const keywords = ['SELECT', 'FROM', 'WHERE', 'GROUP BY', 'ORDER BY', 'HAVING', 'JOIN', 'LEFT JOIN', 'RIGHT JOIN', 'INNER JOIN', 'OUTER JOIN', 'ON', 'AND', 'OR', 'UNION', 'LIMIT', 'INSERT', 'VALUES', 'UPDATE', 'SET', 'DELETE', 'CREATE', 'ALTER', 'DROP'];
            keywords.forEach(k => {
                const re = new RegExp('\\b' + k.split(' ').join('\\s+') + '\\b', 'ig');
                s = s.replace(re, (m) => '\n' + m.toUpperCase());
            });
            s = s.replace(/^\s+/, '').replace(/\n{2,}/g, '\n\n');
            return s.trim();
        } catch (e) {
            return raw;
        }
    };

    const formatTextAsSQL = (raw) => {
        const prot = protectPlaceholders(raw);
        let formatted;
        if (window.sqlFormatter && typeof window.sqlFormatter.format === 'function') {
            formatted = formatSQLWithLib(prot.text);
        } else {
            formatted = simpleSQLFallback(prot.text);
        }
        return restorePlaceholders(formatted, prot.map);
    };


    const createFormatButton = (textarea) => {
        if (!textarea || _processed.has(textarea)) return;
        _processed.add(textarea);

        const wrapper = document.createElement('div');
        wrapper.className = WRAPPER_CLASS;

        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = BTN_CLASS;
        btn.innerHTML = `
            <svg class="nsft-format-code-fields-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M15 4V2"/>
                <path d="M15 16v-2"/>
                <path d="M8 9h2"/>
                <path d="M20 9h2"/>
                <path d="M17.8 11.8 19 13"/>
                <path d="M17.8 6.2 19 5"/>
                <path d="m3 21 9-9"/>
                <path d="M12.2 6.2 11 5"/>
            </svg>
            <span class="nsft-format-code-fields-label">${chrome.i18n.getMessage("format") || 'Format'}</span>
        `;

        const status = document.createElement('span');
        status.className = STATUS_CLASS;

        const setStatus = (msgKey, ms = 1400, prefix = '') => {
            const text = chrome.i18n.getMessage(msgKey) || msgKey;
            status.textContent = prefix + text;
            status.style.opacity = '1';
            if (ms > 0) setTimeout(() => { status.style.opacity = '0'; }, ms);
        };

        const checkVisibility = () => {
            const val = textarea.value || '';
            if (isJSON(val) || looksLikeSQL(val) || looksLikeXml(val) || looksLikeHtml(val)) {
                btn.style.display = 'inline-flex';
            } else {
                btn.style.display = 'none';
            }
        };

        textarea.addEventListener('input', checkVisibility, { signal: _ac.signal });
        textarea.addEventListener('focus', checkVisibility, { signal: _ac.signal });
        checkVisibility();

        const applyFormat = () => {
            const original = textarea.value || '';
            setStatus('formatting', 0);

            if (isJSON(original)) {
                try {
                    const obj = JSON.parse(original);
                    const fmt = JSON.stringify(obj, null, 4);
                    if (fmt !== original) {
                        textarea.value = fmt;
                        textarea.dispatchEvent(new Event('input', { bubbles: true }));
                        textarea.dispatchEvent(new Event('change', { bubbles: true }));
                        setStatus('formatted', 1200, "JSON ");
                    } else {
                        setStatus('noChanges', 1200);
                    }
                } catch (err) {
                    setStatus('badJson', 1500);
                }
                return;
            }

            if (looksLikeSQL(original)) {
                const fmt = formatTextAsSQL(original);
                if (fmt !== original) {
                    textarea.value = fmt;
                    textarea.dispatchEvent(new Event('input', { bubbles: true }));
                    textarea.dispatchEvent(new Event('change', { bubbles: true }));
                    setStatus('formatted', 1200, "SQL ");
                } else {
                    setStatus('noChanges', 1200);
                }
                return;
            }

            if (looksLikeXml(original)) {
                const fmt = formatXml(original);
                if (fmt !== original) {
                    textarea.value = fmt;
                    textarea.dispatchEvent(new Event('input', { bubbles: true }));
                    textarea.dispatchEvent(new Event('change', { bubbles: true }));
                    setStatus('formatted', 1200, "XML ");
                } else {
                    setStatus('noChanges', 1200);
                }
                return;
            }

            if (looksLikeHtml(original)) {
                const fmt = formatHtml(original);
                if (fmt !== original) {
                    textarea.value = fmt;
                    textarea.dispatchEvent(new Event('input', { bubbles: true }));
                    textarea.dispatchEvent(new Event('change', { bubbles: true }));
                    setStatus('formatted', 1200, "HTML ");
                } else {
                    setStatus('noChanges', 1200);
                }
                return;
            }

            setStatus('notMatch', 1200);
        };

        btn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            applyFormat();
        }, { signal: _ac.signal });

        textarea.addEventListener('blur', () => {
            if (!_formatOnBlur) return;
            const v = textarea.value || '';
            if (isJSON(v) || looksLikeSQL(v) || looksLikeXml(v) || looksLikeHtml(v)) applyFormat();
        }, { signal: _ac.signal });

        wrapper.appendChild(btn);
        wrapper.appendChild(status);

        if (textarea.parentNode) {
            textarea.parentNode.insertBefore(wrapper, textarea);
        }
    };

    const scan = () => {
        document.querySelectorAll('textarea.uir-input-text-area').forEach(createFormatButton);
    };

    function observeDomChanges() {
        const handler = (mutations) => {
            let shouldScan = false;
            mutations.forEach(m => { if (m.addedNodes && m.addedNodes.length > 0) shouldScan = true; });
            if (shouldScan) scan();
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
