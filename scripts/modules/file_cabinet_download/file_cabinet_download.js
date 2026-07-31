(function () {
    'use strict';
    const STORAGE_KEY = 'enableFileCabinetDownload';
    const NSFT_THEME_KEY = 'nsftTheme';
    const BTN_CLASS = 'nsft-fcdl-btn';
    const PANEL_CLASS = 'nsft-fcdl-panel';
    const LIST_URL = '/app/common/media/mediaitemfolders.nl';
    const CONCURRENCY = 4;
    const LIST_CONCURRENCY = 3;
    const MAX_FILES = 2000;
    const MAX_DEPTH = 20;

    let enabled = false;
    let _unsub = null;
    let _panel = null;
    let _running = false;
    let _abort = null;
    let _theme = 'light';

    function isApplicablePage() {
        try {
            if (window.NSFT_RecordButtons && NSFT_RecordButtons.isExcludedPage && NSFT_RecordButtons.isExcludedPage()) return false;
        } catch (e) { }
        return /mediaitemfolders/i.test(location.pathname);
    }

    chrome.storage.local.get({ [STORAGE_KEY]: true, [NSFT_THEME_KEY]: 'light' }, (items) => {
        enabled = !!items[STORAGE_KEY];
        _theme = items[NSFT_THEME_KEY] || 'light';
        if (enabled && isApplicablePage()) init();
    });

    chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== 'local') return;
        if (changes[NSFT_THEME_KEY]) {
            _theme = changes[NSFT_THEME_KEY].newValue || 'light';
            if (_panel) _panel.setAttribute('data-theme', resolveTheme());
        }
        if (!changes[STORAGE_KEY]) return;
        enabled = !!changes[STORAGE_KEY].newValue;
        if (enabled) {
            if (isApplicablePage()) init();
        } else {
            teardown();
        }
    });

    function resolveTheme() {
        return _theme === 'dark' ? 'dark' : 'light';
    }

    function teardown() {
        if (_unsub) { _unsub(); _unsub = null; }
        if (_abort) { _abort.abort(); _abort = null; }
        _running = false;
        closePanel();
        document.querySelectorAll('.' + BTN_CLASS).forEach(b => b.remove());
    }

    function init() {
        if (_unsub) return;
        if (window.NSFT_Observer && typeof window.NSFT_Observer.subscribe === 'function') {
            _unsub = window.NSFT_Observer.subscribe(runOnce, { throttle: 300, immediate: true });
        } else {
            const mo = new MutationObserver(runOnce);
            mo.observe(document.body, { childList: true, subtree: true });
            _unsub = () => mo.disconnect();
            runOnce();
        }
    }

    function runOnce() {
        if (!enabled) return false;
        const header = document.getElementById('medialisthdr_t');
        if (!header) return false;
        if (header.querySelector('.' + BTN_CLASS)) return true;

        const folderId = getCurrentFolderId();
        if (!folderId) return false;

        header.appendChild(createButton(folderId));
        return true;
    }

    function getCurrentFolderId() {
        const input = document.getElementById('folder');
        if (input && input.value != null && /^\d+$/.test(String(input.value))) return String(input.value);
        try {
            const q = new URLSearchParams(location.search);
            const f = q.get('folder');
            if (f && /^\d+$/.test(f)) return f;
        } catch (e) { }
        return '';
    }

    function msg(key, subs, fallback) {
        try {
            const m = chrome.i18n.getMessage(key, subs);
            if (m) return m;
        } catch (e) { }
        return fallback;
    }

    function createButton(folderId) {
        const label = msg('fcdl_button_label', null, 'Descargar ZIP');
        const btn = document.createElement('a');
        btn.className = BTN_CLASS;
        btn.href = '#';
        btn.title = msg('fcdl_button_tooltip', null, 'Descargar esta carpeta como ZIP');
        btn.setAttribute('role', 'button');
        btn.innerHTML = svgDownload() + '<span class="nsft-fcdl-label">' + label + '</span>';
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (_panel) { if (!_running) closePanel(); return; }
            openPanel(btn, folderId);
        });
        return btn;
    }


    function openPanel(anchor, folderId) {
        const panel = document.createElement('div');
        panel.className = PANEL_CLASS;
        panel.setAttribute('data-theme', resolveTheme());
        panel.innerHTML =
            '<div class="nsft-fcdl-title">' + escapeHtml(msg('fcdl_title', null, 'Descargar carpeta')) + '</div>' +
            '<label class="nsft-fcdl-check"><input type="checkbox" checked>' +
            '<span>' + escapeHtml(msg('fcdl_include_subfolders', null, 'Incluir subcarpetas')) + '</span></label>' +
            '<div class="nsft-fcdl-status" hidden></div>' +
            '<div class="nsft-fcdl-bar" hidden><div class="nsft-fcdl-bar-fill"></div></div>' +
            '<div class="nsft-fcdl-actions">' +
            '<button type="button" class="nsft-fcdl-go">' + escapeHtml(msg('fcdl_start', null, 'Descargar')) + '</button>' +
            '<button type="button" class="nsft-fcdl-cancel">' + escapeHtml(msg('fcdl_cancel', null, 'Cancelar')) + '</button>' +
            '</div>';

        const rect = anchor.getBoundingClientRect();
        panel.style.top = (rect.bottom + window.scrollY + 6) + 'px';
        panel.style.left = Math.max(8, rect.left + window.scrollX - 40) + 'px';
        document.body.appendChild(panel);
        _panel = panel;

        panel.querySelector('.nsft-fcdl-go').addEventListener('click', () => {
            if (_running) return;
            const includeSub = panel.querySelector('.nsft-fcdl-check input').checked;
            startDownload(folderId, includeSub);
        });
        panel.querySelector('.nsft-fcdl-cancel').addEventListener('click', () => {
            if (_running && _abort) { _abort.abort(); return; }
            closePanel();
        });

        setTimeout(() => {
            document.addEventListener('mousedown', onDocMouseDown, true);
            document.addEventListener('keydown', onDocKeyDown, true);
        }, 0);
    }

    function onDocMouseDown(e) {
        if (_running || !_panel) return;
        if (_panel.contains(e.target) || (e.target.closest && e.target.closest('.' + BTN_CLASS))) return;
        closePanel();
    }

    function onDocKeyDown(e) {
        if (e.key === 'Escape' && !_running) closePanel();
    }

    function closePanel() {
        document.removeEventListener('mousedown', onDocMouseDown, true);
        document.removeEventListener('keydown', onDocKeyDown, true);
        if (_panel) { _panel.remove(); _panel = null; }
    }

    function setStatus(text) {
        if (!_panel) return;
        const el = _panel.querySelector('.nsft-fcdl-status');
        el.hidden = false;
        el.textContent = text;
    }

    function setProgress(done, total) {
        if (!_panel) return;
        const bar = _panel.querySelector('.nsft-fcdl-bar');
        bar.hidden = false;
        bar.firstElementChild.style.width = total ? Math.round((done / total) * 100) + '%' : '0%';
    }

    function setRunning(running) {
        _running = running;
        if (!_panel) return;
        _panel.querySelector('.nsft-fcdl-go').disabled = running;
        _panel.querySelector('.nsft-fcdl-check input').disabled = running;
    }


    async function startDownload(folderId, includeSubfolders) {
        setRunning(true);
        _abort = new AbortController();
        const signal = _abort.signal;
        try {
            setStatus(msg('fcdl_listing', null, 'Obteniendo lista de archivos…'));
            const listing = await requestListing(folderId, includeSubfolders, signal);
            if (signal.aborted) throw new DOMException('aborted', 'AbortError');

            if (!listing.files.length) {
                setStatus(msg('fcdl_empty', null, 'La carpeta no tiene archivos para descargar.'));
                return;
            }

            const total = listing.files.length;
            setProgress(0, total);
            const { buffers, skipped } = await downloadAll(listing.files, signal, (done) => {
                setStatus(msg('fcdl_progress', [String(done), String(total)], 'Descargando ' + done + ' de ' + total + '…'));
                setProgress(done, total);
            });

            setStatus(msg('fcdl_zipping', null, 'Generando ZIP…'));
            const entries = buildEntries(listing, buffers);
            if (!entries.some(en => en.data)) {
                setStatus(msg('fcdl_empty', null, 'La carpeta no tiene archivos para descargar.'));
                return;
            }
            const blob = await buildZip(entries, signal);
            if (signal.aborted) throw new DOMException('aborted', 'AbortError');

            saveBlob(blob, sanitizeSegment(listing.rootName || 'file-cabinet') + '.zip');

            const okCount = total - skipped;
            let done = skipped
                ? msg('fcdl_done_skipped', [String(okCount), String(skipped)], 'Listo: ' + okCount + ' archivos (' + skipped + ' omitidos).')
                : msg('fcdl_done', [String(okCount)], 'Listo: ' + okCount + ' archivos.');
            if (listing.truncated) {
                done += ' ' + msg('fcdl_truncated', [String(listing.maxFiles || '')], 'Se alcanzó el límite de archivos; el ZIP incluye solo los primeros.');
            }
            setStatus(done);
        } catch (e) {
            if (e && e.name === 'AbortError') {
                setStatus(msg('fcdl_cancelled', null, 'Descarga cancelada.'));
            } else {
                setStatus(msg('fcdl_error', [String(e && e.message || e)], 'Error: ' + (e && e.message || e)));
            }
        } finally {
            _abort = null;
            setRunning(false);
            setProgress(0, 0);
            if (_panel) _panel.querySelector('.nsft-fcdl-bar').hidden = true;
        }
    }


    function folderPageUrl(folderId, segment) {
        const u = new URL(LIST_URL, location.origin);
        u.searchParams.set('folder', folderId);
        if (segment) u.searchParams.set('segment', segment);
        return u.href;
    }

    async function fetchDoc(url, signal) {
        const res = await fetch(url, { signal, credentials: 'same-origin' });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return new DOMParser().parseFromString(await res.text(), 'text/html');
    }

    function headerIndexMap(doc) {
        const map = new Map();
        doc.querySelectorAll('#div__body thead [data-label]').forEach((el, i) => {
            map.set(String(el.dataset.label || '').trim().toLowerCase(), i);
        });
        return map;
    }

    function pickIdx(map, names) {
        for (const n of names) if (map.has(n)) return map.get(n);
        return -1;
    }

    function parseFolderDoc(doc) {
        const out = { files: [], folders: [], segments: [] };
        const cols = headerIndexMap(doc);
        const nameIdx = pickIdx(cols, ['name', 'nombre']);
        const typeIdx = pickIdx(cols, ['type', 'tipo']);
        const dlIdx = pickIdx(cols, ['download', 'descargar']);
        const idIdx = pickIdx(cols, ['internal id', 'id interno']);

        doc.querySelectorAll('tr.uir-list-row-tr').forEach(tr => {
            const cells = tr.cells ? Array.from(tr.cells) : [];
            const cellText = (i) => (i >= 0 && cells[i])
                ? (cells[i].textContent || '').replace(/\s+/g, ' ').trim()
                : '';

            const toUrl = (a) => {
                try {
                    const u = new URL(a.getAttribute('href'), location.origin);
                    return u.origin === location.origin ? u : null;
                } catch (e) { return null; }
            };

            let folderNav = null;
            let folderEdit = null;
            const mediaLinks = [];
            tr.querySelectorAll('a[href]').forEach(a => {
                const u = toUrl(a);
                if (!u) return;
                if (u.pathname === '/core/media/media.nl') mediaLinks.push({ a, u });
                if (!folderNav && /\/mediaitemfolders\.nl$/.test(u.pathname) && u.searchParams.get('folder')) folderNav = { a, u };
                if (!folderEdit && /\/mediaitemfolder\.nl$/.test(u.pathname) && u.searchParams.get('id')) folderEdit = { a, u };
            });

            const cellName = cellText(nameIdx);
            const type = cellText(typeIdx).toLowerCase();
            const isFolder = !!(folderNav || folderEdit) || type === 'folder' || type === 'carpeta';

            if (isFolder) {
                const idCandidate = (folderNav && folderNav.u.searchParams.get('folder'))
                    || (folderEdit && folderEdit.u.searchParams.get('id'))
                    || cellText(idIdx)
                    || ((tr.querySelector('td[data-list-cell-type="numerickey"]') || {}).textContent || '').trim();
                if (/^\d+$/.test(idCandidate || '')) {
                    out.folders.push({
                        id: String(idCandidate),
                        name: cellName || (folderNav ? (folderNav.a.textContent || '').trim() : '') || String(idCandidate)
                    });
                }
                return;
            }

            let dl = null;
            if (dlIdx >= 0 && cells[dlIdx]) {
                const a = cells[dlIdx].querySelector('a[href]');
                if (a) { const u = toUrl(a); if (u && u.pathname === '/core/media/media.nl') dl = { a, u }; }
            }
            if (!dl && mediaLinks.length) {
                let bestLen = -1;
                mediaLinks.forEach(m => {
                    const len = (m.a.textContent || '').trim().length;
                    if (len > bestLen) { dl = m; bestLen = len; }
                });
            }
            if (!dl) return;

            out.files.push({
                name: cellName || (dl.a.textContent || '').trim() || (dl.u.searchParams.get('id') || 'file'),
                url: dl.u.href
            });
        });

        doc.querySelectorAll('#segment_sel_fs li[data-pagination-value]').forEach(li => {
            const v = li.getAttribute('data-pagination-value');
            if (v && !li.classList.contains('selected')) out.segments.push(v);
        });
        return out;
    }

    async function listFolderPage(folderId, signal) {
        const doc = await fetchDoc(folderPageUrl(folderId), signal);
        const page = parseFolderDoc(doc);
        for (const seg of page.segments) {
            const extra = parseFolderDoc(await fetchDoc(folderPageUrl(folderId, seg), signal));
            page.files.push(...extra.files);
            page.folders.push(...extra.folders);
        }
        page.doc = doc;
        return page;
    }

    function extractFolderName(doc) {
        const el = doc.getElementById('medialisthdr_t');
        if (!el) return '';
        let t = (el.textContent || '').trim();
        const colon = t.lastIndexOf(':');
        if (colon >= 0) t = t.slice(colon + 1).trim();
        return t;
    }

    async function requestListing(folderId, includeSubfolders, signal) {
        const files = [];
        const folders = [];
        const seenFiles = new Set();
        const seenFolders = new Set([folderId]);
        let rootName = '';
        let truncated = false;

        let frontier = [{ id: folderId, segs: [] }];
        for (let depth = 0; depth <= MAX_DEPTH && frontier.length; depth++) {
            const next = [];
            for (let i = 0; i < frontier.length; i += LIST_CONCURRENCY) {
                const batch = frontier.slice(i, i + LIST_CONCURRENCY);
                const pages = await Promise.all(batch.map(f =>
                    listFolderPage(f.id, signal).catch(e => {
                        if (signal.aborted) throw e;
                        return null;
                    })
                ));
                pages.forEach((page, j) => {
                    if (!page) return;
                    const cur = batch[j];
                    if (depth === 0) rootName = extractFolderName(page.doc);
                    page.files.forEach(f => {
                        if (seenFiles.has(f.url)) return;
                        seenFiles.add(f.url);
                        if (files.length >= MAX_FILES) { truncated = true; return; }
                        files.push({ name: f.name, url: f.url, pathSegs: cur.segs });
                    });
                    if (includeSubfolders) {
                        page.folders.forEach(sub => {
                            if (seenFolders.has(sub.id)) return;
                            seenFolders.add(sub.id);
                            const segs = cur.segs.concat([sub.name]);
                            folders.push(segs);
                            next.push({ id: sub.id, segs });
                        });
                    }
                });
                setStatus(msg('fcdl_listing', null, 'Obteniendo lista de archivos…') + ' (' + files.length + ')');
            }
            frontier = next;
        }
        if (frontier.length) truncated = true;

        return { rootName, files, folders, truncated, maxFiles: MAX_FILES };
    }

    async function downloadAll(files, signal, onProgress) {
        const buffers = new Array(files.length).fill(null);
        let next = 0, done = 0, skipped = 0;
        const workers = Array.from({ length: Math.min(CONCURRENCY, files.length) }, async () => {
            for (;;) {
                const i = next++;
                if (i >= files.length || signal.aborted) return;
                const f = files[i];
                if (f.url) {
                    try {
                        const res = await fetch(new URL(f.url, location.origin).href, { signal, credentials: 'same-origin' });
                        if (!res.ok) throw new Error('HTTP ' + res.status);
                        buffers[i] = await res.arrayBuffer();
                    } catch (e) {
                        if (signal.aborted) throw e;
                        skipped++;
                    }
                } else {
                    skipped++;
                }
                done++;
                onProgress(done);
            }
        });
        await Promise.all(workers);
        if (signal.aborted) throw new DOMException('aborted', 'AbortError');
        return { buffers, skipped };
    }


    function sanitizeSegment(s) {
        const clean = String(s || '').replace(/[\x00-\x1f<>:"/\\|?*]/g, '_').replace(/[. ]+$/, '').trim();
        return clean || '_';
    }

    function buildEntries(listing, buffers) {
        const entries = [];
        const used = new Set();
        (listing.folders || []).forEach(segs => {
            const path = segs.map(sanitizeSegment).join('/') + '/';
            if (!used.has(path)) { used.add(path); entries.push({ path, data: null }); }
        });
        listing.files.forEach((f, i) => {
            if (!buffers[i]) return;
            const dir = (f.pathSegs || []).map(sanitizeSegment).join('/');
            const base = (dir ? dir + '/' : '') + sanitizeSegment(f.name);
            entries.push({ path: uniquePath(base, used), data: new Uint8Array(buffers[i]) });
        });
        return entries;
    }

    function uniquePath(path, used) {
        if (!used.has(path)) { used.add(path); return path; }
        const slash = path.lastIndexOf('/');
        const dot = path.lastIndexOf('.');
        const hasExt = dot > slash + 1;
        const base = hasExt ? path.slice(0, dot) : path;
        const ext = hasExt ? path.slice(dot) : '';
        let n = 2;
        while (used.has(base + ' (' + n + ')' + ext)) n++;
        const p = base + ' (' + n + ')' + ext;
        used.add(p);
        return p;
    }


    const CRC_TABLE = (() => {
        const t = new Uint32Array(256);
        for (let n = 0; n < 256; n++) {
            let c = n;
            for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
            t[n] = c >>> 0;
        }
        return t;
    })();

    function crc32(data) {
        let c = 0xFFFFFFFF;
        for (let i = 0; i < data.length; i++) c = CRC_TABLE[(c ^ data[i]) & 0xFF] ^ (c >>> 8);
        return (c ^ 0xFFFFFFFF) >>> 0;
    }

    async function deflateRaw(data) {
        if (typeof CompressionStream === 'undefined') return null;
        try {
            const stream = new Blob([data]).stream().pipeThrough(new CompressionStream('deflate-raw'));
            return new Uint8Array(await new Response(stream).arrayBuffer());
        } catch (e) {
            return null;
        }
    }

    async function buildZip(entries, signal) {
        const encoder = new TextEncoder();
        const now = new Date();
        const dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1);
        const dosDate = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();

        const parts = [];
        const central = [];
        let offset = 0;

        for (const entry of entries) {
            if (signal.aborted) throw new DOMException('aborted', 'AbortError');
            const isDir = !entry.data;
            const nameBytes = encoder.encode(entry.path);
            const raw = isDir ? new Uint8Array(0) : entry.data;
            const crc = isDir ? 0 : crc32(raw);

            let method = 0;
            let payload = raw;
            if (!isDir && raw.length > 0) {
                const deflated = await deflateRaw(raw);
                if (deflated && deflated.length < raw.length) { method = 8; payload = deflated; }
            }

            const local = new DataView(new ArrayBuffer(30));
            local.setUint32(0, 0x04034b50, true);
            local.setUint16(4, 20, true);
            local.setUint16(6, 0x0800, true);
            local.setUint16(8, method, true);
            local.setUint16(10, dosTime, true);
            local.setUint16(12, dosDate, true);
            local.setUint32(14, crc, true);
            local.setUint32(18, payload.length, true);
            local.setUint32(22, raw.length, true);
            local.setUint16(26, nameBytes.length, true);
            local.setUint16(28, 0, true);
            parts.push(new Uint8Array(local.buffer), nameBytes, payload);

            const cd = new DataView(new ArrayBuffer(46));
            cd.setUint32(0, 0x02014b50, true);
            cd.setUint16(4, 20, true);
            cd.setUint16(6, 20, true);
            cd.setUint16(8, 0x0800, true);
            cd.setUint16(10, method, true);
            cd.setUint16(12, dosTime, true);
            cd.setUint16(14, dosDate, true);
            cd.setUint32(16, crc, true);
            cd.setUint32(20, payload.length, true);
            cd.setUint32(24, raw.length, true);
            cd.setUint16(28, nameBytes.length, true);
            cd.setUint16(30, 0, true);
            cd.setUint16(32, 0, true);
            cd.setUint16(34, 0, true);
            cd.setUint16(36, 0, true);
            cd.setUint32(38, isDir ? 0x10 : 0, true);
            cd.setUint32(42, offset, true);
            central.push(new Uint8Array(cd.buffer), nameBytes);

            offset += 30 + nameBytes.length + payload.length;
        }

        let cdSize = 0;
        central.forEach(p => { cdSize += p.length; });
        const count = entries.length;
        const eocd = new DataView(new ArrayBuffer(22));
        eocd.setUint32(0, 0x06054b50, true);
        eocd.setUint16(8, count, true);
        eocd.setUint16(10, count, true);
        eocd.setUint32(12, cdSize, true);
        eocd.setUint32(16, offset, true);

        return new Blob(parts.concat(central, [new Uint8Array(eocd.buffer)]), { type: 'application/zip' });
    }

    function saveBlob(blob, filename) {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 10000);
    }

    const escapeHtml = (window.NSFT_DOM && window.NSFT_DOM.escapeHtml) ||
        ((v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        }[c])));

    function svgDownload() {
        return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>';
    }
})();
