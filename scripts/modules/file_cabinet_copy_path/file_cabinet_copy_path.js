(function () {
    'use strict';
    const STORAGE_KEY = 'enableFileCabinetCopyPathBeta';
    const APPLIED_ATTR = 'data-nsft-fcp-applied';
    const BTN_CLASS = 'nsft-fcp-btn';
    const COPIED_CLASS = 'nsft-fcp-copied';
    const BRIDGE_URL = '/app/common/scripting/PlatformClientScriptHandler.nl';

    let enabled = false;
    let folderPath = null;
    let folderId = null;
    const _rutas = new Map();
    const _enVuelo = new Set();
    const RAIZ = '@raiz';
    let _unsub = null;
    let _diag = false;
    let _applied = new WeakSet();

    const ID_CARPETA = /^-?[0-9]+$/;

    function isApplicablePage() {
        try {
            if (window.NSFT_RecordButtons && NSFT_RecordButtons.isExcludedPage && NSFT_RecordButtons.isExcludedPage()) return false;
        } catch (e) { }
        return /mediaitemfolders|media/i.test(location.pathname);
    }

    chrome.storage.local.get({ [STORAGE_KEY]: false, nsftSelectorDiagnostics: false }, (items) => {
        enabled = !!items[STORAGE_KEY];
        _diag = !!items.nsftSelectorDiagnostics;
        if (enabled && isApplicablePage()) init();
    });

    chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== 'local') return;
        if (changes.nsftSelectorDiagnostics) _diag = !!changes.nsftSelectorDiagnostics.newValue;
        if (!changes[STORAGE_KEY]) return;
        enabled = !!changes[STORAGE_KEY].newValue;
        if (enabled) {
            if (isApplicablePage()) init();
        } else {
            teardown();
        }
    });

    function teardown() {
        if (_unsub) { _unsub(); _unsub = null; }
        _applied = new WeakSet();
        folderId = null;
        folderPath = null;
        _rutas.clear();
        _enVuelo.clear();
        document.querySelectorAll('.' + BTN_CLASS).forEach(b => b.remove());
    }

    function init() {
        runOnce();
        if (window.NSFT_Observer && typeof window.NSFT_Observer.subscribe === 'function') {
            _unsub = window.NSFT_Observer.subscribe(runOnce, { throttle: 300 });
        } else {
            const mo = new MutationObserver(runOnce);
            mo.observe(document.body, { childList: true, subtree: true });
            _unsub = () => mo.disconnect();
        }
    }

    function getCurrentFolderId() {
        const input = document.getElementById('folder');
        const v = input && input.value != null ? String(input.value) : '';
        if (v !== '' && ID_CARPETA.test(v)) return v;
        try {
            const q = new URLSearchParams(location.search);
            const f = q.get('folder');
            if (f && ID_CARPETA.test(f)) return f;
        } catch (e) { }
        return null;
    }

    function pedirRutas(ids) {
        const faltan = ids.filter((id) => !_rutas.has(id) && !_enVuelo.has(id));
        if (!faltan.length) return;
        faltan.forEach((id) => _enVuelo.add(id));
        fetchAppfolders(faltan).then((mapa) => {
            faltan.forEach((id) => {
                _enVuelo.delete(id);
                _rutas.set(id, mapa[id] || null);
            });
            if (folderId && folderId !== RAIZ) folderPath = _rutas.get(folderId) || null;
            runOnce();
        });
    }

    function rutaDeAppfolder(appfolder) {
        const partes = String(appfolder || '').split(':').map((t) => t.trim()).filter(Boolean);
        return partes.length ? '/' + partes.join('/') : '';
    }

    async function fetchAppfolders(ids) {
        const enteros = ids.map((i) => parseInt(i, 10)).filter((n) => !isNaN(n));
        if (!enteros.length) return {};
        try {
            const query = `SELECT id, appfolder FROM mediaitemfolder WHERE id IN (${enteros.join(', ')})`;
            const innerParams = JSON.stringify([query, "[]", "SUITE_QL", ""]);
            const body = {
                method: 'remoteObject.bridgeCall',
                params: ['queryApiBridge', 'runSuiteQL', innerParams]
            };
            const res = await fetch(BRIDGE_URL, {
                method: 'POST',
                credentials: 'include',
                headers: {
                    'accept': '*/*',
                    'content-type': 'application/json',
                    'nsxmlhttprequest': 'NSXMLHttpRequest',
                    'cache-control': 'no-cache',
                    'pragma': 'no-cache'
                },
                body: JSON.stringify(body)
            });
            if (!res.ok) return {};
            const data = await res.json();
            if (data && data.result === 'error') return {};
            const r = data && data.result && data.result.result;
            if (!r || !r.count || !r.aliases) return {};
            const mapa = {};
            for (let i = 0; i < r.count; i++) {
                const fila = r['v' + i];
                if (!Array.isArray(fila) || fila.length < 2) continue;
                const ruta = rutaDeAppfolder(fila[1]);
                if (ruta) mapa[String(fila[0])] = ruta;
            }
            return mapa;
        } catch (e) {
            if (_diag) console.warn('NSFT file cabinet copy path:', e);
            return {};
        }
    }

    function runOnce() {
        if (!enabled) return;

        const actual = getCurrentFolderId() || RAIZ;
        if (actual !== folderId) {
            folderId = actual;
            folderPath = actual === RAIZ ? null : (_rutas.get(actual) || null);
            _applied = new WeakSet();
            document.querySelectorAll('.' + BTN_CLASS).forEach(b => b.remove());
        }

        if (actual === RAIZ) { pintarRaiz(); return; }

        if (!folderPath) { pedirRutas([actual]); return; }
        pintarFilas((row) => {
            const nameLink = findNameLink(row);
            if (!nameLink) return null;
            const name = extractNameFromLink(nameLink);
            if (!name) return null;
            return { ancla: nameLink, ruta: () => joinPath(folderPath, name) };
        });
    }

    function pintarRaiz() {
        const pendientes = [];
        pintarFilas((row) => {
            const nameLink = findNameLink(row);
            if (!nameLink) return null;
            const propio = idDeEnlace(nameLink);
            if (!propio) return null;
            if (!_rutas.has(propio)) { pendientes.push(propio); return null; }
            const ruta = _rutas.get(propio);
            if (!ruta) return null;
            return { ancla: nameLink, ruta: () => ruta };
        });
        if (pendientes.length) pedirRutas(pendientes);
    }

    function pintarFilas(resolver) {
        document.querySelectorAll('tr.uir-list-row-tr').forEach((row) => {
            if (_applied.has(row)) return;
            const dato = resolver(row);
            if (!dato) return;

            _applied.add(row);
            const btn = createButton(dato.ruta);
            const cell = dato.ancla.closest('td') || dato.ancla.parentElement;
            if (cell) cell.insertBefore(btn, cell.firstChild);
        });
    }

    function idDeEnlace(a) {
        const href = a.getAttribute('href') || '';
        const m = href.match(/[?&]folder=(-?\d+)/);
        return m ? m[1] : null;
    }

    function findNameLink(row) {
        const anchors = row.querySelectorAll('a');
        for (const a of anchors) {
            const href = a.getAttribute('href') || '';
            const text = (a.textContent || '').trim();
            if (!text) continue;
            if (/^Editar$|^Edit$|^Descargar$|^Download$/i.test(text)) continue;
            if (a.classList.contains('nsft-copy-link')) continue;
            if (href === '#' || href.startsWith('javascript:')) continue;
            if (href.includes('mediaitem') || (a.onclick && /showFolderContents/.test(a.onclick.toString()))
                || href.match(/^\d+\?folder=/)) {
                return a;
            }
            return a;
        }
        return null;
    }

    function extractNameFromLink(a) {
        return (a.textContent || '').trim();
    }

    function createButton(ruta) {
        const btn = document.createElement('span');
        btn.className = BTN_CLASS;
        btn.title = chrome.i18n.getMessage('fcp_copy_tooltip') || 'Copy path';
        btn.setAttribute('role', 'button');
        btn.innerHTML = svgCopy();
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const fullPath = typeof ruta === 'function' ? ruta() : String(ruta);
            if (window.NSFT_Clipboard) {
                window.NSFT_Clipboard.copy(fullPath, {
                    toast: { preview: fullPath },
                    onSuccess: () => flash(btn, true),
                    onError: () => flash(btn, false)
                });
            } else if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(fullPath).then(() => flash(btn, true));
            } else {
                const ta = document.createElement('textarea');
                ta.value = fullPath;
                ta.style.position = 'fixed';
                ta.style.opacity = '0';
                document.body.appendChild(ta);
                ta.select();
                try { document.execCommand('copy'); flash(btn, true); }
                catch (err) { flash(btn, false); }
                ta.remove();
            }
        });
        return btn;
    }

    function joinPath(base, name) {
        const b = String(base || '').replace(/\/+$/, '');
        const n = String(name || '').replace(/^\/+/, '');
        return b + '/' + n;
    }

    function flash(btn, ok) {
        btn.classList.add(COPIED_CLASS);
        const prev = btn.innerHTML;
        btn.innerHTML = ok ? svgCheck() : svgCopy();
        setTimeout(() => {
            btn.classList.remove(COPIED_CLASS);
            btn.innerHTML = prev;
        }, 1100);
    }

    function svgCopy() {
        return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>';
    }

    function svgCheck() {
        return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"></polyline></svg>';
    }
})();
