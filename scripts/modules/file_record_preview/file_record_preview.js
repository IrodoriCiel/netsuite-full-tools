(function () {
    'use strict';
    const STORAGE_KEY = 'enableFileRecordPreviewBeta';
    const THEME_KEY = 'fileRecordPreviewTheme';
    const DEFAULT_THEME = 'auto';
    const APPLIED_ATTR = 'data-nsft-frp-applied';
    const PREVIEW_ID = 'nsft-frp-preview';
    const THEME_STYLE_ID = 'nsft-frp-theme';
    const MAX_SIZE = 500 * 1024;

    const LANG_MAP = {
        js: 'javascript', mjs: 'javascript', cjs: 'javascript',
        jsx: 'javascript', ts: 'typescript', tsx: 'typescript',
        html: 'html', htm: 'html', xhtml: 'html',
        css: 'css', scss: 'scss', sass: 'scss', less: 'less',
        json: 'json', jsonl: 'json',
        xml: 'xml', xsl: 'xml', xslt: 'xml', xsd: 'xml', ftl: 'xml', svg: 'xml',
        csv: 'plaintext', tsv: 'plaintext',
        txt: 'plaintext', md: 'markdown', markdown: 'markdown',
        log: 'plaintext',
        sql: 'sql',
        yml: 'yaml', yaml: 'yaml',
        toml: 'ini', ini: 'ini', conf: 'ini', cfg: 'ini', env: 'ini', lock: 'yaml',
        proto: 'protobuf', graphql: 'graphql', gql: 'graphql',
        sh: 'bash', bash: 'bash', bat: 'dos', ps1: 'powershell',
        py: 'python', rb: 'ruby', php: 'php', java: 'java',
        go: 'go', cs: 'csharp', c: 'c', h: 'c', cpp: 'cpp', hpp: 'cpp',
        diff: 'diff', patch: 'diff'
    };
    const BINARY_EXT = new Set([
        'zip','tar','gz','rar','7z',
        'exe','dll','bin'
    ]);

    const PDF_EXT = new Set(['pdf']);
    const IMAGE_EXT = new Set(['jpg','jpeg','png','gif','bmp','webp','ico','tiff','tif','svg']);
    const AUDIO_EXT = new Set(['mp3','wav','ogg','m4a','aac','flac']);
    const VIDEO_EXT = new Set(['mp4','webm','mov','avi','mkv']);

    let enabled = false;

    function isApplicablePage() {
        return /\/app\/common\/media\/mediaitem\.nl/.test(location.pathname);
    }
    if (!isApplicablePage()) return;

    chrome.storage.local.get({ [STORAGE_KEY]: false, [THEME_KEY]: DEFAULT_THEME }, (items) => {
        enabled = !!items[STORAGE_KEY];
        if (enabled) {
            loadTheme(items[THEME_KEY] || DEFAULT_THEME);
            init();
        }
    });

    chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== 'local') return;
        if (changes[STORAGE_KEY]) {
            enabled = !!changes[STORAGE_KEY].newValue;
            if (enabled) {
                chrome.storage.local.get({ [THEME_KEY]: DEFAULT_THEME }, (i) => {
                    loadTheme(i[THEME_KEY] || DEFAULT_THEME);
                    init();
                });
            } else {
                const p = document.getElementById(PREVIEW_ID);
                if (p) p.remove();
                const s = document.getElementById(THEME_STYLE_ID);
                if (s) s.remove();
                document.querySelectorAll(`[${APPLIED_ATTR}]`).forEach(el => el.removeAttribute(APPLIED_ATTR));
            }
        }
        if (changes[THEME_KEY]) {
            loadTheme(changes[THEME_KEY].newValue || DEFAULT_THEME);
        }
        if (changes.nsftTheme && _requestedTheme === 'auto') {
            setTimeout(() => loadTheme('auto'), 60);
        }
    });

    let _requestedTheme = null;
    async function loadTheme(themeName) {
        _requestedTheme = themeName;
        if (themeName === 'auto') {
            themeName = document.documentElement.getAttribute('data-nsft-theme') === 'dark'
                ? 'atom-one-dark' : 'atom-one-light';
        }
        let safeName = String(themeName || '').replace(/[^a-z0-9-]/gi, '');
        if (!safeName) safeName = 'atom-one-light';
        try {
            const url = chrome.runtime.getURL('scripts/libs/highlight/themes/' + safeName + '.css');
            let res = await fetch(url);
            if (!res.ok && safeName !== 'atom-one-light') {
                res = await fetch(chrome.runtime.getURL('scripts/libs/highlight/themes/atom-one-light.css'));
            }
            if (!res.ok) return;
            let cssText = await res.text();
            cssText = cssText.replace(/\/\*[\s\S]*?\*\//g, '');
            const scope = '#' + PREVIEW_ID;
            const scopedCss = cssText.replace(/((?:^|[},])\s*)([.#a-z])/gi, '$1' + scope + ' $2');
            let style = document.getElementById(THEME_STYLE_ID);
            if (!style) {
                style = document.createElement('style');
                style.id = THEME_STYLE_ID;
                (document.head || document.documentElement).appendChild(style);
            }
            style.textContent = scopedCss;
        } catch (e) { }
    }

    function init() {
        if (!/\/app\/common\/media\/mediaitem\.nl/.test(location.pathname)) return;
        onReady(tryRender);
    }

    function onReady(cb) {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', cb, { once: true });
        } else {
            cb();
        }
    }

    async function tryRender() {
        if (!enabled) return;
        const root = document.querySelector('#main_form') || document.body;
        if (!root) return;
        if (root.getAttribute(APPLIED_ATTR) === 'true') return;

        const selectors = [
            'a[target="fldUrlWindow"]',
            'a[href*="/core/media/media.nl"][download]',
            'a[href*="/core/media/media.nl"]',
            '#fileUrl a',
            'a.dottedlink[href*="media.nl?"][href*="id="]'
        ];
        let viewLink = null;
        for (const sel of selectors) {
            viewLink = document.querySelector(sel);
            if (viewLink) break;
        }
        if (!viewLink) return;
        const fileUrl = viewLink.getAttribute('href');
        if (!fileUrl) return;

        const filename = getFilename();
        const ext = extractExtension(filename, fileUrl);
        const lang = ext ? LANG_MAP[ext] : null;

        if (ext && BINARY_EXT.has(ext)) return;

        const kind = IMAGE_EXT.has(ext) ? 'image'
                    : PDF_EXT.has(ext) ? 'pdf'
                    : AUDIO_EXT.has(ext) ? 'audio'
                    : VIDEO_EXT.has(ext) ? 'video'
                    : lang ? 'text'
                    : null;
        if (!kind) return;

        root.setAttribute(APPLIED_ATTR, 'true');
        const container = mountContainer(filename, ext);

        try {
            if (kind === 'text') {
                await renderTextFromUrl(container, fileUrl, lang);
            } else if (kind === 'pdf') {
                renderPdf(container, fileUrl);
            } else if (kind === 'image') {
                renderImage(container, fileUrl, filename);
            } else if (kind === 'audio') {
                renderAudio(container, fileUrl);
            } else if (kind === 'video') {
                renderVideo(container, fileUrl);
            }
        } catch (err) {
            showMessage(container,
                (chrome.i18n.getMessage('frp_fetch_err') || 'Could not load preview') + ': ' + err.message);
        }
    }

    async function renderTextFromUrl(container, fileUrl, lang) {
        const res = await fetch(fileUrl, { credentials: 'same-origin' });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const clen = parseInt(res.headers.get('Content-Length') || '0', 10);
        if (clen && clen > MAX_SIZE) {
            showMessage(container,
                (chrome.i18n.getMessage('frp_too_large') || 'File too large for inline preview') +
                ' (' + Math.round(clen / 1024) + ' KB).');
            return;
        }
        const text = await res.text();
        if (text.length > MAX_SIZE) {
            showMessage(container,
                (chrome.i18n.getMessage('frp_too_large') || 'File too large for inline preview') +
                ' (' + Math.round(text.length / 1024) + ' KB).');
            return;
        }
        renderContent(container, text, lang);
    }

    function renderPdf(container, url) {
        const body = container.querySelector('.nsft-frp-body');
        if (!body) return;
        body.classList.add('nsft-frp-body-embed');
        body.innerHTML =
            '<iframe class="nsft-frp-iframe" src="' + escapeAttr(url) + '" ' +
            'title="PDF preview" loading="lazy"></iframe>';
        hideCopyButton(container);
    }

    function renderImage(container, url, filename) {
        const body = container.querySelector('.nsft-frp-body');
        if (!body) return;
        body.classList.add('nsft-frp-body-image');
        body.innerHTML =
            '<img class="nsft-frp-img" src="' + escapeAttr(url) + '" ' +
            'alt="' + escapeAttr(filename || 'image') + '" loading="lazy">';
        hideCopyButton(container);
    }

    function renderAudio(container, url) {
        const body = container.querySelector('.nsft-frp-body');
        if (!body) return;
        body.classList.add('nsft-frp-body-media');
        body.innerHTML =
            '<audio class="nsft-frp-media" controls preload="metadata" src="' + escapeAttr(url) + '"></audio>';
        hideCopyButton(container);
    }

    function renderVideo(container, url) {
        const body = container.querySelector('.nsft-frp-body');
        if (!body) return;
        body.classList.add('nsft-frp-body-media');
        body.innerHTML =
            '<video class="nsft-frp-media" controls preload="metadata" src="' + escapeAttr(url) + '"></video>';
        hideCopyButton(container);
    }

    function hideCopyButton(container) {
        const btn = container.querySelector('.nsft-frp-copy');
        if (btn) btn.style.display = 'none';
    }

    function escapeAttr(s) {
        return String(s || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
    }

    function getFilename() {
        const inp = document.querySelector('input#name, input[name="name"]');
        if (inp && inp.value) return inp.value.trim();
        const span = document.querySelector('#name_fs, [data-field-name="name"] .uir-field');
        if (span) {
            const first = span.firstChild;
            if (first && first.nodeType === 3) {
                return (first.nodeValue || '').trim();
            }
            return (span.textContent || '').replace(/\s*\d+\s*\/\s*\d+\s*$/, '').trim();
        }
        return '';
    }

    function extractExtension(filename, url) {
        try {
            const u = new URL(url, location.origin);
            const xt = u.searchParams.get('_xt');
            if (xt) {
                const m = xt.match(/^\.?([a-z0-9]{1,10})$/i);
                if (m) return m[1].toLowerCase();
            }
        } catch (e) { }
        if (filename) {
            const m = filename.match(/\.([a-z0-9]{1,10})$/i);
            if (m) return m[1].toLowerCase();
        }
        const pathPart = (url || '').split('?')[0];
        const m = pathPart.match(/\.([a-z0-9]{1,10})$/i);
        if (m) return m[1].toLowerCase();
        return '';
    }

    function mountContainer(filename, ext) {
        const container = document.createElement('div');
        container.id = PREVIEW_ID;
        container.innerHTML =
            '<div class="nsft-frp-head">' +
                '<span class="nsft-frp-title">' +
                (chrome.i18n.getMessage('frp_title') || 'Preview') +
                (filename ? ': ' + escapeHtml(filename) : '') + '</span>' +
                (ext ? '<span class="nsft-frp-badge">' + escapeHtml(ext.toUpperCase()) + '</span>' : '') +
                '<button type="button" class="nsft-frp-copy" aria-label="Copy">' +
                    (chrome.i18n.getMessage('frp_copy') || 'Copy') + '</button>' +
            '</div>' +
            '<div class="nsft-frp-body">' +
                '<pre class="nsft-frp-pre"><code class="nsft-frp-code">' +
                (chrome.i18n.getMessage('frp_loading') || 'Loading…') + '</code></pre>' +
            '</div>';

        const host = document.querySelector('#main_form') || document.body;
        host.appendChild(container);
        return container;
    }

    function renderContent(container, text, lang) {
        const code = container.querySelector('.nsft-frp-code');
        if (!code) return;
        code.textContent = text;
        code.className = 'nsft-frp-code language-' + lang;
        if (window.hljs && typeof window.hljs.highlightElement === 'function') {
            try {
                delete code.dataset.highlighted;
                window.hljs.highlightElement(code);
            } catch (e) { }
        }
        const btn = container.querySelector('.nsft-frp-copy');
        if (btn) {
            btn.addEventListener('click', () => {
                const raw = code.textContent || '';
                if (navigator.clipboard && navigator.clipboard.writeText) {
                    navigator.clipboard.writeText(raw).then(() => flashCopy(btn));
                } else {
                    flashCopy(btn);
                }
            });
        }
    }

    function showMessage(container, msg) {
        const body = container.querySelector('.nsft-frp-body');
        if (!body) return;
        body.innerHTML = '<div class="nsft-frp-msg">' + escapeHtml(msg) + '</div>';
    }

    function flashCopy(btn) {
        const prev = btn.textContent;
        btn.textContent = chrome.i18n.getMessage('frp_copied') || 'Copied!';
        btn.classList.add('nsft-frp-copied');
        setTimeout(() => {
            btn.textContent = prev;
            btn.classList.remove('nsft-frp-copied');
        }, 1200);
    }

    function escapeHtml(s) {
        return String(s || '')
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }
})();
