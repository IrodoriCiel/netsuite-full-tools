(function () {
    'use strict';

    const STORAGE_KEY = 'enableJsonFormatter';
    const THEME_KEY = 'jsonFormatterTheme';
    const DEFAULT_THEME = 'auto';
    let maxAutoExpandDepth = 2;
    let maxChildrenPreview = 60;

    const WINDOW_THRESHOLD = 500;
    const CHUNK_SIZE = 100;

    const SEARCH_SELECTOR = '.nsft-jf-key, .nsft-jf-string, .nsft-jf-number, .nsft-jf-boolean, .nsft-jf-null';

    const containerMeta = new WeakMap();

    const ric = (cb) => (typeof window.requestIdleCallback === 'function'
        ? window.requestIdleCallback(cb, { timeout: 500 })
        : setTimeout(cb, 16));

    const ICON_EXPAND = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg>';
    const ICON_COLLAPSE = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 14 10 14 10 20"/><polyline points="20 10 14 10 14 4"/><line x1="14" y1="10" x2="21" y2="3"/><line x1="3" y1="21" x2="10" y2="14"/></svg>';
    const ICON_COPY = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';
    const ICON_DOWNLOAD = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>';
    const ICON_PRETTY = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>';
    const ICON_RAW = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/></svg>';

    const I18N = {
        searchPlaceholder: chrome.i18n.getMessage('jfSearchPlaceholder') || 'Buscar clave o valor…',
        prevTitle: chrome.i18n.getMessage('jfPrevTitle') || 'Anterior (Shift+Enter)',
        nextTitle: chrome.i18n.getMessage('jfNextTitle') || 'Siguiente (Enter)',
        expandAllTitle: chrome.i18n.getMessage('jfExpandAllTitle') || 'Expandir todo',
        collapseAllTitle: chrome.i18n.getMessage('jfCollapseAllTitle') || 'Colapsar todo',
        copyTitle: chrome.i18n.getMessage('jfCopyTitle') || 'Copiar JSON formateado',
        downloadTitle: chrome.i18n.getMessage('jfDownloadTitle') || 'Descargar archivo .json',
        rawTitle: chrome.i18n.getMessage('jfRawTitle') || 'Alternar entre Pretty y Raw',
        expand: chrome.i18n.getMessage('jfExpand') || 'Expandir',
        collapse: chrome.i18n.getMessage('jfCollapse') || 'Colapsar',
        copy: chrome.i18n.getMessage('jfCopy') || 'Copiar',
        download: chrome.i18n.getMessage('jfDownload') || 'Descargar',
        raw: chrome.i18n.getMessage('jfRaw') || 'Raw',
        pretty: chrome.i18n.getMessage('jfPretty') || 'Pretty',
        copied: chrome.i18n.getMessage('jfCopied') || '✓ Copiado',
        downloaded: chrome.i18n.getMessage('jfDownloaded') || '✓ Descargado',
        items: chrome.i18n.getMessage('jfItems') || 'items',
        keys: chrome.i18n.getMessage('jfKeys') || 'keys',
        b64Decode: chrome.i18n.getMessage('jfB64Decode') || 'Decodificar',
        b64Hide: chrome.i18n.getMessage('jfB64Hide') || 'Ocultar',
        b64Invalid: chrome.i18n.getMessage('jfB64Invalid') || 'base64 inválido',
        loadMore: chrome.i18n.getMessage('jfLoadMore') || 'desplázate para ver más'
    };

    let activeTheme = DEFAULT_THEME;
    let formatted = false;

    chrome.storage.local.get({
        [STORAGE_KEY]: true,
        [THEME_KEY]: DEFAULT_THEME,
        jsonFormatterMaxAutoExpandDepth: 2,
        jsonFormatterMaxChildrenPreview: 60
    }, (settings) => {
        if (!settings[STORAGE_KEY]) return;
        activeTheme = settings[THEME_KEY] || DEFAULT_THEME;
        maxAutoExpandDepth = clampInt(settings.jsonFormatterMaxAutoExpandDepth, 0, 20, 2);
        maxChildrenPreview = clampInt(settings.jsonFormatterMaxChildrenPreview, 1, 100000, 60);
        scheduleFormat();
    });

    function clampInt(v, min, max, fallback) {
        const n = parseInt(v, 10);
        if (!Number.isFinite(n)) return fallback;
        return Math.max(min, Math.min(max, n));
    }

    chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== 'local' || !changes[THEME_KEY]) return;
        activeTheme = changes[THEME_KEY].newValue || DEFAULT_THEME;
        applyTheme();
    });

    function applyTheme() {
        if (!document.body || !document.body.classList.contains('nsft-jf-body')) return;
        const themeClasses = [
            'nsft-jf-theme-auto',
            'nsft-jf-theme-light',
            'nsft-jf-theme-dark',
            'nsft-jf-theme-monokai',
            'nsft-jf-theme-dracula',
            'nsft-jf-theme-solarized-light',
            'nsft-jf-theme-solarized-dark',
            'nsft-jf-theme-nord',
            'nsft-jf-theme-github'
        ];
        themeClasses.forEach((c) => document.body.classList.remove(c));
        document.body.classList.add(`nsft-jf-theme-${activeTheme}`);
    }

    function scheduleFormat() {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', tryFormat, { once: true });
            window.addEventListener('load', tryFormat, { once: true });
        } else {
            tryFormat();
            if (document.readyState !== 'complete') {
                window.addEventListener('load', tryFormat, { once: true });
            }
        }
    }

    function tryFormat() {
        if (formatted) return;
        if (!document.body) return;
        if (document.getElementById('nsft-jf-root')) return;

        const found = extractJson();
        if (!found) return;

        formatted = true;
        renderFormatted(found.data, found.text);
    }

    function extractJson() {
        const body = document.body;
        if (!body) return null;

        const ct = (document.contentType || '').toLowerCase();

        if (ct.includes('json')) {
            const text = (body.textContent || '').trim();
            const parsed = parseFlexible(text, ct);
            if (parsed.ok) return { data: parsed.data, text };
        }

        if (!ct.includes('html') && isBodyJustPre(body)) {
            const pre = body.querySelector('pre');
            if (pre && !pre.closest('#nsft-jf-root')) {
                const text = (pre.textContent || '').trim();
                if (isJsonStart(text)) {
                    const parsed = parseFlexible(text, ct);
                    if (parsed.ok) return { data: parsed.data, text };
                }
            }
        }

        if (isApiUrl(location.pathname)) {
            const text = (body.textContent || '').trim();
            const parsed = parseFlexible(text, ct);
            if (parsed.ok) return { data: parsed.data, text };
        }

        return null;
    }

    function parseFlexible(text, ct) {
        if (!text) return { ok: false };

        try { return { ok: true, data: JSON.parse(text) }; } catch (e) { }

        if ((ct || '').includes('ndjson') || looksLikeNdjson(text)) {
            const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
            if (lines.length >= 2) {
                const arr = [];
                for (const line of lines) {
                    try { arr.push(JSON.parse(line)); } catch (e) { return { ok: false }; }
                }
                return { ok: true, data: arr };
            }
        }

        return { ok: false };
    }

    function looksLikeNdjson(text) {
        const nl = text.indexOf('\n');
        if (nl === -1) return false;
        const first = text.slice(0, nl).trim();
        return first.startsWith('{') || first.startsWith('[');
    }

    function isBodyJustPre(body) {
        const IGNORED = new Set(['SCRIPT', 'STYLE', 'LINK', 'NOSCRIPT', 'TEMPLATE', 'META']);
        let pres = 0;
        for (const child of body.children) {
            const tag = child.tagName;
            if (tag === 'PRE') { pres++; continue; }
            if (IGNORED.has(tag)) continue;
            return false;
        }
        return pres === 1;
    }

    function isJsonStart(text) {
        if (!text) return false;
        const c = text[0];
        return c === '{' || c === '[';
    }

    function isApiUrl(pathname) {
        return /\/app\/site\/hosting\/(?:scriptlet|restlet)\.nl/i.test(pathname)
            || /\/services\/rest\//i.test(pathname);
    }

    function renderFormatted(data, rawText) {
        document.documentElement.classList.add('nsft-jf-html');
        document.body.classList.add('nsft-jf-body');
        applyTheme();
        const prevScroll = window.scrollY;
        document.body.innerHTML = '';

        const root = document.createElement('div');
        root.id = 'nsft-jf-root';

        const header = buildHeader(data, rawText);
        const tree = document.createElement('div');
        tree.className = 'nsft-jf-tree';
        tree.appendChild(buildNode(data, null, 0));

        const raw = document.createElement('pre');
        raw.className = 'nsft-jf-raw';
        raw.textContent = rawText;
        raw.hidden = true;

        root.appendChild(header);
        root.appendChild(tree);
        root.appendChild(raw);
        document.body.appendChild(root);

        wireToolbar(header, tree, raw, data);
        wireSearch(header, tree, data);

        if (prevScroll) window.scrollTo({ top: prevScroll });
    }

    function buildHeader(data, rawText) {
        const header = document.createElement('div');
        header.className = 'nsft-jf-header';

        const sizeLabel = formatBytes(rawText.length);
        let typeLabel;
        if (Array.isArray(data)) typeLabel = `array · ${data.length}`;
        else if (data !== null && typeof data === 'object') typeLabel = `object · ${Object.keys(data).length}`;
        else typeLabel = data === null ? 'null' : typeof data;
        const logoUrl = chrome.runtime.getURL('assets/icons/icon48.png');

        header.innerHTML = `
            <div class="nsft-jf-brand">
                <img src="${logoUrl}" alt="" class="nsft-jf-logo">
                <span class="nsft-jf-brand-text">
                    <span class="nsft-jf-brand-name">NetSuite Full Tools</span>
                    <span class="nsft-jf-brand-sub">JSON Formatter · ${typeLabel} · ${sizeLabel}</span>
                </span>
            </div>
            <div class="nsft-jf-search">
                <svg class="nsft-jf-search-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                <input type="search" class="nsft-jf-search-input" placeholder="${I18N.searchPlaceholder}" autocomplete="off" spellcheck="false">
                <span class="nsft-jf-search-count" hidden></span>
                <button type="button" class="nsft-jf-search-nav" data-nav="prev" title="${I18N.prevTitle}" hidden>↑</button>
                <button type="button" class="nsft-jf-search-nav" data-nav="next" title="${I18N.nextTitle}" hidden>↓</button>
            </div>
            <div class="nsft-jf-actions">
                <button type="button" data-action="expand-all" title="${I18N.expandAllTitle}">${ICON_EXPAND}<span>${I18N.expand}</span></button>
                <button type="button" data-action="collapse-all" title="${I18N.collapseAllTitle}">${ICON_COLLAPSE}<span>${I18N.collapse}</span></button>
                <button type="button" data-action="copy" title="${I18N.copyTitle}">${ICON_COPY}<span>${I18N.copy}</span></button>
                <button type="button" data-action="download" title="${I18N.downloadTitle}">${ICON_DOWNLOAD}<span>${I18N.download}</span></button>
                <button type="button" data-action="toggle-raw" title="${I18N.rawTitle}" data-toggle-state="pretty">${ICON_RAW}<span>${I18N.raw}</span></button>
            </div>`;
        return header;
    }

    function wireToolbar(header, tree, raw, data) {
        header.addEventListener('click', (e) => {
            const btn = e.target.closest('button[data-action]');
            if (!btn) return;
            const action = btn.dataset.action;

            if (action === 'expand-all') {
                expandAll(tree);
            } else if (action === 'collapse-all') {
                collapseAll(tree);
            } else if (action === 'copy') {
                const label = btn.querySelector('span');
                if (!label) return;
                navigator.clipboard.writeText(JSON.stringify(data, null, 2)).then(() => {
                    const original = label.textContent;
                    label.textContent = I18N.copied;
                    setTimeout(() => { label.textContent = original; }, 1400);
                });
            } else if (action === 'download') {
                downloadJson(data);
                const label = btn.querySelector('span');
                if (label) {
                    const original = label.textContent;
                    label.textContent = I18N.downloaded;
                    setTimeout(() => { label.textContent = original; }, 1400);
                }
            } else if (action === 'toggle-raw') {
                const showRaw = raw.hidden;
                raw.hidden = !showRaw;
                tree.hidden = showRaw;
                btn.innerHTML = showRaw
                    ? `${ICON_PRETTY}<span>${I18N.pretty}</span>`
                    : `${ICON_RAW}<span>${I18N.raw}</span>`;
                btn.dataset.toggleState = showRaw ? 'raw' : 'pretty';
            }
        });
    }

    function buildNode(value, key, depth) {
        const node = document.createElement('div');
        node.className = 'nsft-jf-node';

        if (key !== null) {
            const keyEl = document.createElement('span');
            keyEl.className = 'nsft-jf-key';
            const isArrayIdx = typeof key === 'number';
            keyEl.textContent = isArrayIdx ? `${key}: ` : `"${key}": `;
            if (isArrayIdx) keyEl.classList.add('is-index');
            node.appendChild(keyEl);
        }

        if (value === null) {
            node.appendChild(makeLeaf('null', 'null'));
        } else if (typeof value === 'string') {
            node.appendChild(makeStringLeaf(value));
        } else if (typeof value === 'number') {
            node.appendChild(makeLeaf(String(value), 'number'));
        } else if (typeof value === 'boolean') {
            node.appendChild(makeLeaf(String(value), 'boolean'));
        } else if (Array.isArray(value)) {
            node.appendChild(buildContainer(value, '[', ']', depth, true));
        } else if (typeof value === 'object') {
            node.appendChild(buildContainer(value, '{', '}', depth, false));
        }

        return node;
    }

    function buildContainer(value, openCh, closeCh, depth, isArray) {
        const wrap = document.createElement('span');
        wrap.className = 'nsft-jf-collapsible';

        const keys = isArray ? value.map((_, i) => i) : Object.keys(value);
        const empty = keys.length === 0;

        const toggle = document.createElement('span');
        toggle.className = 'nsft-jf-toggle';
        toggle.setAttribute('role', 'button');
        toggle.setAttribute('aria-label', 'toggle');

        const open = document.createElement('span');
        open.className = 'nsft-jf-bracket';
        open.textContent = openCh;

        const summary = document.createElement('span');
        summary.className = 'nsft-jf-summary';
        const summaryClose = document.createElement('span');
        summaryClose.className = 'nsft-jf-bracket';
        summaryClose.textContent = closeCh;
        if (empty) {
            summary.appendChild(summaryClose);
        } else {
            summary.append(
                document.createTextNode(' … '),
                summaryClose,
                document.createTextNode(`  ${keys.length} ${isArray ? I18N.items : I18N.keys}`)
            );
        }

        const children = document.createElement('div');
        children.className = 'nsft-jf-children';

        const close = document.createElement('span');
        close.className = 'nsft-jf-bracket nsft-jf-close';
        close.textContent = closeCh;

        wrap.append(toggle, open, summary, children, close);

        const windowed = keys.length > WINDOW_THRESHOLD;
        let built = false;
        let rendered = 0;
        let sentinel = null;
        let io = null;

        const updateSentinel = () => {
            if (sentinel) sentinel.textContent = `… ${rendered} / ${keys.length} — ${I18N.loadMore}`;
        };

        const renderChunk = () => {
            const end = Math.min(rendered + CHUNK_SIZE, keys.length);
            const frag = document.createDocumentFragment();
            for (let i = rendered; i < end; i++) {
                frag.appendChild(buildNode(value[keys[i]], keys[i], depth + 1));
            }
            if (sentinel) children.insertBefore(frag, sentinel);
            else children.appendChild(frag);
            rendered = end;
            if (rendered >= keys.length && sentinel) {
                sentinel.remove();
                sentinel = null;
                if (io) { io.disconnect(); io = null; }
            }
            updateSentinel();
        };

        const ensureBuilt = () => {
            if (built) return;
            built = true;
            if (!windowed) {
                const frag = document.createDocumentFragment();
                for (const k of keys) frag.appendChild(buildNode(value[k], k, depth + 1));
                children.appendChild(frag);
                rendered = keys.length;
                return;
            }
            sentinel = document.createElement('div');
            sentinel.className = 'nsft-jf-sentinel';
            children.appendChild(sentinel);
            io = new IntersectionObserver((entries) => {
                if (entries.some((e) => e.isIntersecting)) ric(renderChunk);
            }, { rootMargin: '600px' });
            io.observe(sentinel);
            renderChunk();
        };

        const renderUntil = (idx) => {
            ensureBuilt();
            while (sentinel && rendered <= idx) renderChunk();
        };

        const renderAll = () => {
            ensureBuilt();
            while (sentinel) renderChunk();
        };

        containerMeta.set(wrap, { isArray, keys, childrenEl: children, ensureBuilt, renderUntil, renderAll });

        const setCollapsed = (state) => {
            if (!state) ensureBuilt();
            wrap.classList.toggle('is-collapsed', state);
        };
        toggle.addEventListener('click', () => setCollapsed(!wrap.classList.contains('is-collapsed')));
        open.addEventListener('click', () => setCollapsed(!wrap.classList.contains('is-collapsed')));
        summary.addEventListener('click', () => setCollapsed(false));

        const startCollapsed = empty
            || depth >= maxAutoExpandDepth
            || keys.length > maxChildrenPreview;
        if (startCollapsed) wrap.classList.add('is-collapsed');
        else ensureBuilt();

        return wrap;
    }

    function expandWrap(wrap) {
        wrap.classList.remove('is-collapsed');
        const meta = containerMeta.get(wrap);
        if (!meta) return;
        meta.ensureBuilt();
        meta.renderAll();
        meta.childrenEl
            .querySelectorAll(':scope > .nsft-jf-node > .nsft-jf-collapsible')
            .forEach(expandWrap);
    }

    function expandAll(tree) {
        tree.querySelectorAll(':scope > .nsft-jf-node > .nsft-jf-collapsible').forEach(expandWrap);
    }

    function collapseAll(tree) {
        tree.querySelectorAll('.nsft-jf-collapsible').forEach((el) => el.classList.add('is-collapsed'));
        tree.querySelector('.nsft-jf-collapsible')?.classList.remove('is-collapsed');
    }

    function makeLeaf(text, type) {
        const span = document.createElement('span');
        span.className = `nsft-jf-${type}`;
        span.textContent = text;
        return span;
    }

    function makeStringLeaf(value) {
        const span = makeLeaf(JSON.stringify(value), 'string');
        if (!isLikelyBase64(value)) return span;

        const wrap = document.createElement('span');
        wrap.className = 'nsft-jf-b64-wrap';
        wrap.appendChild(span);

        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'nsft-jf-b64-btn';
        btn.textContent = I18N.b64Decode;

        const decoded = document.createElement('span');
        decoded.className = 'nsft-jf-b64-decoded';
        decoded.hidden = true;

        let filled = false;
        btn.addEventListener('click', () => {
            if (!filled) { decoded.textContent = decodeBase64(value); filled = true; }
            const show = decoded.hidden;
            decoded.hidden = !show;
            btn.textContent = show ? I18N.b64Hide : I18N.b64Decode;
        });

        wrap.append(btn, decoded);
        return wrap;
    }

    function isLikelyBase64(s) {
        if (typeof s !== 'string' || s.length < 20 || s.length % 4 !== 0) return false;
        if (!/^[A-Za-z0-9+/]+={0,2}$/.test(s)) return false;
        return /[0-9+/=]/.test(s);
    }

    function decodeBase64(s) {
        try {
            const bin = atob(s);
            try { return decodeURIComponent(escape(bin)); } catch (e) { return bin; }
        } catch (e) {
            return '⚠ ' + I18N.b64Invalid;
        }
    }

    function formatBytes(n) {
        if (n < 1024) return `${n} B`;
        if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
        return `${(n / (1024 * 1024)).toFixed(2)} MB`;
    }

    function downloadJson(data) {
        const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `nsft-response-${ts}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    function wireSearch(header, tree, data) {
        const input = header.querySelector('.nsft-jf-search-input');
        const count = header.querySelector('.nsft-jf-search-count');
        const navPrev = header.querySelector('[data-nav="prev"]');
        const navNext = header.querySelector('[data-nav="next"]');

        let matches = [];
        let cursor = -1;
        let query = '';

        const clearMarks = () => {
            tree.querySelectorAll('.nsft-jf-match').forEach((el) => el.classList.remove('nsft-jf-match'));
            tree.querySelectorAll('.nsft-jf-match-active').forEach((el) => el.classList.remove('nsft-jf-match-active'));
            tree.classList.remove('nsft-jf-searching');
        };

        const updateCount = () => {
            if (matches.length === 0) {
                count.hidden = true;
                navPrev.hidden = true;
                navNext.hidden = true;
                return;
            }
            count.hidden = false;
            navPrev.hidden = false;
            navNext.hidden = false;
            count.textContent = `${cursor + 1} / ${matches.length}`;
        };

        const markVisible = () => {
            tree.querySelectorAll('.nsft-jf-match').forEach((el) => el.classList.remove('nsft-jf-match'));
            if (!query) return;
            tree.querySelectorAll(SEARCH_SELECTOR).forEach((el) => {
                if ((el.textContent || '').toLowerCase().includes(query)) el.classList.add('nsft-jf-match');
            });
        };

        const focusMatch = (idx, smooth) => {
            tree.querySelectorAll('.nsft-jf-match-active').forEach((el) => el.classList.remove('nsft-jf-match-active'));
            const m = matches[idx];
            if (!m) return;
            const nodeEl = revealPath(tree, m.path);
            if (!nodeEl) return;
            const target = matchTarget(nodeEl, m.where) || nodeEl;
            markVisible();
            target.classList.add('nsft-jf-match-active');
            target.scrollIntoView({ block: 'center', behavior: smooth ? 'smooth' : 'auto' });
        };

        const runSearch = (queryRaw, smooth) => {
            query = (queryRaw || '').trim().toLowerCase();
            clearMarks();
            matches = [];
            cursor = -1;

            if (!query) { updateCount(); return; }

            tree.classList.add('nsft-jf-searching');
            matches = collectMatches(data, query);

            if (matches.length) {
                cursor = 0;
                focusMatch(cursor, smooth !== false);
            }
            updateCount();
        };

        let typingTimer;
        input.addEventListener('input', () => {
            clearTimeout(typingTimer);
            typingTimer = setTimeout(() => runSearch(input.value, true), 120);
        });

        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                if (matches.length === 0) return;
                cursor = e.shiftKey
                    ? (cursor - 1 + matches.length) % matches.length
                    : (cursor + 1) % matches.length;
                focusMatch(cursor, false);
                updateCount();
            } else if (e.key === 'Escape') {
                input.value = '';
                runSearch('', false);
            }
        });

        navPrev.addEventListener('click', () => {
            if (matches.length === 0) return;
            cursor = (cursor - 1 + matches.length) % matches.length;
            focusMatch(cursor, false);
            updateCount();
        });

        navNext.addEventListener('click', () => {
            if (matches.length === 0) return;
            cursor = (cursor + 1) % matches.length;
            focusMatch(cursor, false);
            updateCount();
        });
    }

    function collectMatches(data, q) {
        const out = [];
        const MAX = 50000;
        const walk = (value, path) => {
            if (out.length >= MAX) return;
            if (value !== null && typeof value === 'object') {
                const isArr = Array.isArray(value);
                const keys = isArr ? value.map((_, i) => i) : Object.keys(value);
                for (const k of keys) {
                    if (out.length >= MAX) return;
                    const childPath = path.concat(k);
                    if (!isArr && String(k).toLowerCase().includes(q)) out.push({ path: childPath, where: 'key' });
                    walk(value[k], childPath);
                }
            } else {
                const text = value === null ? 'null' : String(value);
                if (text.toLowerCase().includes(q)) out.push({ path, where: 'value' });
            }
        };
        walk(data, []);
        return out;
    }

    function revealPath(tree, path) {
        let nodeEl = tree.querySelector(':scope > .nsft-jf-node');
        if (!nodeEl) return null;
        for (let d = 0; d < path.length; d++) {
            const wrap = nodeEl.querySelector(':scope > .nsft-jf-collapsible');
            if (!wrap) return null;
            const meta = containerMeta.get(wrap);
            if (!meta) return null;
            wrap.classList.remove('is-collapsed');
            const key = path[d];
            const ordinal = meta.isArray ? key : meta.keys.indexOf(key);
            if (ordinal < 0) return null;
            meta.renderUntil(ordinal);
            const childNodes = meta.childrenEl.querySelectorAll(':scope > .nsft-jf-node');
            nodeEl = childNodes[ordinal];
            if (!nodeEl) return null;
        }
        return nodeEl;
    }

    function matchTarget(nodeEl, where) {
        if (where === 'key') return nodeEl.querySelector(':scope > .nsft-jf-key');
        return nodeEl.querySelector('.nsft-jf-string, .nsft-jf-number, .nsft-jf-boolean, .nsft-jf-null');
    }
})();
