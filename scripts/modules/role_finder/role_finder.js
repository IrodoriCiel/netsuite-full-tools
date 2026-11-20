(function () {
    'use strict';

    const STORAGE_KEY = 'enableRoleFinder';
    const MAX_TICKS = 5;
    const RETRY_MS = 1000;
    const PROBE_MS = 100;

    const IDS = {
        SEARCH: 'nsft-role-search',
        CLEAR: 'nsft-role-clear',
        DATALIST: 'nsft-roles-list'
    };

    const TS = window.NSFT_TextSearch;

    const SELECTORS = {
        refreshed: {
            navbarAccount: [
                'div[role="menuitem"][data-header-section="role-menu"][data-automation-id="RoleMenuItem"]',
                'div[role="button"][data-header-section="role-menu"][data-automation-id="RoleMenuItem"]',
                'button[data-header-section="quick-link-menu"][data-automation-id="RoleMenuItem"]'
            ],
            roleSearchBoxInsertPoint: [
                'div[data-role="popover"][role="dialog"][data-widget="Popover"] div[role="menu"] > div[data-widget="MenuGroup"]:nth-child(3) > div:first-child',
                'div[data-role="contextmenu"][role="dialog"][data-widget="Popover"] div[role="menu"] > div[data-widget="MenuGroup"]:nth-child(3) > div:first-child'
            ],
            roleLinks: [
                'div[data-role="popover"][role="dialog"][data-widget="Popover"] a[href^="/app/login/secure/changerole.nl"]',
                'div[data-role="contextmenu"][role="dialog"][data-widget="Popover"] a[href^="/app/login/secure/changerole.nl"]'
            ],
            accountLinks: [
                'div[data-role="popover"][role="dialog"][data-widget="Popover"] a[href^="/app/login/secure/changeaccount.nl"]',
                'div[data-role="contextmenu"][role="dialog"][data-widget="Popover"] a[href^="/app/login/secure/changeaccount.nl"]'
            ]
        },
        redwood: {
            navbarAccount: [
                'div[role="button"][data-header-section="quick-link-menu"][data-automation-id="RoleMenuItem"]',
                'button[data-header-section="quick-link-menu"][data-automation-id="RoleMenuItem"]'
            ],
            roleSearchBoxInsertPoint: [
                'div[data-role="contextmenu"][data-state="floating"][role="dialog"][data-widget="Popover"] div[role="menu"] div[role="group"]:nth-child(3) > div:first-child'
            ],
            roleLinks: [
                'div[data-role="contextmenu"][data-state="floating"][role="dialog"][data-widget="Popover"] a[href^="/app/login/secure/changerole.nl"]'
            ],
            accountLinks: [
                'div[data-role="contextmenu"][data-state="floating"][role="dialog"][data-widget="Popover"] a[href^="/app/login/secure/changeaccount.nl"]'
            ]
        }
    };

    let _outerInterval = null;
    let _observer = null;
    let _innerIntervals = [];

    function isApplicablePage() {
        try {
            if (window.NSFT_RecordButtons && NSFT_RecordButtons.isHeaderlessPage && NSFT_RecordButtons.isHeaderlessPage()) return false;
        } catch (e) { }
        return true;
    }

    chrome.storage.local.get({ [STORAGE_KEY]: true }, (settings) => {
        if (!settings[STORAGE_KEY] || !isApplicablePage()) return;
        init();
    });

    chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== 'local' || !changes[STORAGE_KEY]) return;
        if (changes[STORAGE_KEY].newValue) {
            if (!_outerInterval && !_observer) init();
        } else {
            teardown();
        }
    });

    function teardown() {
        if (_outerInterval) { clearInterval(_outerInterval); _outerInterval = null; }
        if (_observer) { _observer.disconnect(); _observer = null; }
        _innerIntervals.forEach(i => clearInterval(i));
        _innerIntervals = [];
        const search = document.getElementById(IDS.SEARCH);
        if (search) { const c = search.closest('.nsft-role-search-container'); (c || search).remove(); }
        document.querySelectorAll('[data-nsft-role-finder-init]').forEach(el => { delete el.dataset.nsftRoleFinderInit; });
        document.querySelectorAll('.nsft-role-ent').forEach(el => el.remove());
    }

    function init() {
        const theme = document.body.dataset.header || 'refreshed';
        if (!SELECTORS[theme]) return;
        let count = 0;

        _outerInterval = setInterval(() => {
            if (count > MAX_TICKS) {
                clearInterval(_outerInterval);
                _outerInterval = null;
                return;
            }
            count++;
            const el = findElement(theme, 'navbarAccount');
            if (el && !el.dataset.nsftRoleFinderInit) {
                el.dataset.nsftRoleFinderInit = 'true';
                observeAccountMenu(theme, el);
            }
        }, RETRY_MS);
    }

    function observeAccountMenu(theme, accountEl) {
        _observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (mutation.type !== 'attributes') return;

                const menuOption = findAllElements(theme, 'roleSearchBoxInsertPoint')?.[0];
                const searchEl = document.getElementById(IDS.SEARCH);

                if (!menuOption) {
                    _innerIntervals.forEach(i => clearInterval(i));
                    _innerIntervals.length = 0;
                    return;
                }
                if (searchEl || _innerIntervals.length) return;

                _innerIntervals.push(setInterval(() => {
                    const roleLinks = findAllElements(theme, 'roleLinks');
                    const accountLinks = findAllElements(theme, 'accountLinks');
                    if ((!roleLinks?.length) && (!accountLinks?.length)) return;

                    const entries = buildRoleEntries(roleLinks, accountLinks);

                    menuOption.parentNode.insertBefore(buildSearchEl(), menuOption);
                    attachSearchHandler(entries);
                    ponNombresDeEmpleado(entries);

                    _innerIntervals.forEach(i => clearInterval(i));
                    _innerIntervals.length = 0;
                }, PROBE_MS));
            });
        });

        _observer.observe(accountEl, { attributes: true });
    }

    function buildRoleEntries(roleLinks, accountLinks) {
        const entries = [];
        (roleLinks || []).forEach((link) => {
            const linkText = (link.innerText || '').trim();
            entries.push({ key: linkText.toUpperCase(), linkText, container: link.parentElement, link });
        });
        (accountLinks || []).forEach((link) => {
            const linkText = (link.innerText || '').trim();
            const company = (link.href.split('company=')[1] || '').split('&')[0];
            entries.push({ key: `${linkText.toUpperCase()} - (${company})`, linkText, container: link.parentElement, link });
        });
        return entries;
    }

    function buildSearchEl() {
        const container = document.createElement('div');
        container.className = 'nsft-role-search-container';

        const title = document.createElement('div');
        title.className = 'nsft-role-search-title';
        title.textContent = chrome.i18n.getMessage('rolefTitle') || 'SEARCH ROLE';
        container.appendChild(title);

        const input = document.createElement('input');
        input.type = 'text';
        input.name = IDS.SEARCH;
        input.id = IDS.SEARCH;
        input.placeholder = chrome.i18n.getMessage('rolefPlaceholder') || 'Search Role...';

        const datalist = document.createElement('datalist');
        datalist.id = IDS.DATALIST;

        const wrap = document.createElement('div');
        wrap.className = 'nsft-role-search-wrap';

        const clear = document.createElement('button');
        clear.type = 'button';
        clear.id = IDS.CLEAR;
        clear.className = 'nsft-role-clear';
        clear.hidden = true;
        const clearLabel = chrome.i18n.getMessage('ro_clear_search') || 'Limpiar búsqueda';
        clear.title = clearLabel;
        clear.setAttribute('aria-label', clearLabel);
        clear.textContent = '✕';

        wrap.appendChild(input);
        wrap.appendChild(clear);

        container.appendChild(wrap);
        container.appendChild(datalist);
        return container;
    }

    function foldAligned(text) {
        if (!TS) return text.toUpperCase();
        let out = '';
        for (let i = 0; i < text.length; i++) {
            const ch = text.charAt(i);
            const f = TS.fold(ch);
            out += f.length === 1 ? f : (f ? f.charAt(0) : ch);
        }
        return out;
    }

    function isCombining(ch) {
        return !!TS && TS.fold(ch) === '';
    }

    function attachSearchHandler(entries) {
        const input = document.getElementById(IDS.SEARCH);
        if (!input) return;
        const clearBtn = document.getElementById(IDS.CLEAR);
        let raf = 0;
        let visible = [];
        let selIdx = -1;

        function fuzzyIndices(text, q) {
            const t = foldAligned(text);
            const ql = TS ? TS.fold(q) : q.toUpperCase();
            const idx = [];
            let j = 0;
            for (let i = 0; i < t.length && j < ql.length; i++) {
                if (t[i] === ql[j]) { idx.push(i); j++; }
            }
            return j === ql.length ? idx : null;
        }

        function clearHighlight(link) {
            const spans = link.querySelectorAll('span.nsft-rf-hl');
            spans.forEach(span => span.replaceWith(document.createTextNode(span.textContent)));
            if (spans.length) link.normalize();
        }

        function applyHighlight(entry, q) {
            clearHighlight(entry.link);
            if (!q) return;
            const walker = document.createTreeWalker(entry.link, NodeFilter.SHOW_TEXT, null);
            const textNodes = [];
            let node;
            while ((node = walker.nextNode())) textNodes.push(node);

            for (const tn of textNodes) {
                const text = tn.nodeValue;
                if (!text || !text.trim()) continue;
                const idx = fuzzyIndices(text, q);
                if (!idx || !idx.length) continue;
                const set = new Set(idx);
                const frag = document.createDocumentFragment();
                let buffer = '';
                for (let i = 0; i < text.length; i++) {
                    if (set.has(i)) {
                        if (buffer) { frag.appendChild(document.createTextNode(buffer)); buffer = ''; }
                        let piece = text[i];
                        while (i + 1 < text.length && !set.has(i + 1) && isCombining(text[i + 1])) piece += text[++i];
                        const span = document.createElement('span');
                        span.className = 'nsft-rf-hl';
                        span.textContent = piece;
                        frag.appendChild(span);
                    } else {
                        buffer += text[i];
                    }
                }
                if (buffer) frag.appendChild(document.createTextNode(buffer));
                tn.parentNode.replaceChild(frag, tn);
            }
        }

        function setSelected(i) {
            selIdx = i;
            entries.forEach(e => e.container && e.container.classList.remove('nsft-rf-sel'));
            const sel = selIdx >= 0 ? visible[selIdx] : null;
            if (sel && sel.container) {
                sel.container.classList.add('nsft-rf-sel');
                if (sel.container.scrollIntoView) sel.container.scrollIntoView({ block: 'nearest' });
            }
        }

        function syncClear() {
            const hasText = !!(input.value && input.value.length);
            if (clearBtn) clearBtn.hidden = !hasText;
            input.classList.toggle('has-text', hasText);
        }

        function runFilter() {
            syncClear();
            const q = input.value ? input.value.trim() : '';
            visible = [];
            for (const e of entries) {
                if (e.link && e.link.dataset && e.link.dataset.nsftDiscreetHidden === '1') {
                    applyHighlight(e, '');
                    continue;
                }
                const match = !q || fuzzyIndices(e.key, q) !== null;
                if (e.container) e.container.style.display = match ? '' : 'none';
                applyHighlight(e, q);
                if (match) visible.push(e);
            }
            let elegida = visible.length ? 0 : -1;
            if (q && visible.length > 1) {
                const fq = TS ? TS.fold(q) : q.toUpperCase();
                const i = visible.findIndex(e => (TS ? TS.fold(e.key) : e.key).includes(fq));
                if (i > 0) elegida = i;
            }
            setSelected(elegida);
        }

        input.addEventListener('keyup', (evt) => {
            if (evt.key === 'ArrowDown' || evt.key === 'ArrowUp' || evt.key === 'Enter') return;
            if (raf) cancelAnimationFrame(raf);
            raf = requestAnimationFrame(() => { raf = 0; runFilter(); });
        });

        input.addEventListener('keydown', (evt) => {
            if (evt.key === 'ArrowDown') {
                evt.preventDefault();
                if (visible.length) setSelected((selIdx + 1) % visible.length);
            } else if (evt.key === 'ArrowUp') {
                evt.preventDefault();
                if (visible.length) setSelected((selIdx - 1 + visible.length) % visible.length);
            } else if (evt.key === 'Enter') {
                evt.preventDefault();
                const target = visible[selIdx] || visible[0];
                if (target && target.link) target.link.click();
            }
        });

        if (clearBtn) {
            clearBtn.addEventListener('mousedown', (evt) => evt.preventDefault());
            clearBtn.addEventListener('click', (evt) => {
                evt.preventDefault();
                evt.stopPropagation();
                input.value = '';
                runFilter();
                input.focus();
            });
            clearBtn.addEventListener('keydown', (evt) => {
                if (evt.key === 'Enter' || evt.key === ' ') evt.stopPropagation();
            });
        }

        input.addEventListener('input', syncClear);
        syncClear();
    }

    const ENT_KEY = 'nsftRoleEntNames';
    const MODO_KEY = 'roleFinderEmployeeNames';
    let _modoNombres = 'always';
    chrome.storage.local.get({ [MODO_KEY]: 'always' }, (st) => { _modoNombres = st[MODO_KEY] || 'always'; });
    chrome.storage.onChanged.addListener((changes, area) => {
        if (area === 'local' && changes[MODO_KEY]) _modoNombres = changes[MODO_KEY].newValue || 'always';
    });
    const ENT_TIMEOUT_MS = 5000;
    let _entPuente = false;
    let _entListo = false;
    const _entCola = [];
    const _entPendientes = new Map();
    let _entToken = 0;

    function cuentaActual() {
        return (location.hostname.split('.')[0] || '').replace(/-/g, '_').toUpperCase();
    }

    function partesDelEnlace(link) {
        const m = /[?&]id=([^&]+)/.exec(link.getAttribute('href') || '');
        if (!m) return null;
        let id;
        try { id = decodeURIComponent(m[1]); } catch (e) { id = m[1]; }
        const seg = id.split('~');
        if (seg.length < 3 || !/^\d+$/.test(seg[1])) return null;
        return { cuenta: seg[0].toUpperCase(), empleado: seg[1] };
    }

    function ponNombresDeEmpleado(entries) {
        const actual = cuentaActual();
        const filas = [];
        entries.forEach((e) => {
            if (!e.link || !/changerole\.nl/.test(e.link.getAttribute('href') || '')) return;
            const p = partesDelEnlace(e.link);
            if (p && p.cuenta === actual) filas.push({ entry: e, id: p.empleado });
        });
        const ids = [...new Set(filas.map(f => f.id))];        if (!ids.length) return;
        if (ids.length < 2 && _modoNombres !== 'always') return;

        const propio = nombrePropio(filas);
        chrome.storage.local.get({ [ENT_KEY]: {} }, (st) => {
            const todas = st[ENT_KEY] || {};
            const deEsta = Object.assign({}, todas[actual] || {});
            pinta(filas, Object.assign({}, propio, deEsta));
            pideNombres(ids, (err, nombres) => {
                if (err || !nombres) {
                    const respaldo = {};
                    ids.forEach((id) => { respaldo[id] = '#' + id; });
                    pinta(filas, Object.assign(respaldo, propio, deEsta));
                    return;
                }
                Object.assign(deEsta, nombres);
                pinta(filas, Object.assign({}, propio, deEsta));
                todas[actual] = deEsta;
                chrome.storage.local.set({ [ENT_KEY]: todas });
            });
        });
    }

    function nombrePropio(filas) {
        try {
            const actual = filas.find(({ entry }) => entry.link.parentElement && entry.link.parentElement.querySelector('svg'));
            if (!actual) return {};
            const theme = document.body.dataset.header || 'refreshed';
            const btn = findElement(theme, 'navbarAccount');
            const linea = btn ? (btn.innerText || '').split('\n').map(s => s.trim()).filter(Boolean)[0] : '';
            return linea ? { [actual.id]: linea } : {};
        } catch (e) {
            return {};
        }
    }

    function pinta(filas, nombres) {
        filas.forEach(({ entry, id }) => {
            const nombre = nombres[id];
            if (!nombre || !entry.link.isConnected) return;
            let span = entry.link.querySelector('.nsft-role-ent');
            if (!span) {
                const walker = document.createTreeWalker(entry.link, NodeFilter.SHOW_TEXT, null);
                let mejor = null, n;
                while ((n = walker.nextNode())) {
                    if (n.nodeValue.trim().length > (mejor ? mejor.nodeValue.trim().length : 0)) mejor = n;
                }
                if (!mejor) return;
                span = document.createElement('span');
                span.className = 'nsft-role-ent';
                mejor.parentNode.insertBefore(span, mejor.nextSibling);
            }
            span.textContent = ' · ' + nombre;
            entry.key = (entry.linkText + ' ' + nombre).toUpperCase();
        });
    }

    function pideNombres(ids, cb) {
        if (!_entPuente) {
            _entPuente = true;
            if (window.NSFT_SuiteQLRest && window.NSFT_SuiteQLRest.ensureTransport) {
                window.NSFT_SuiteQLRest.ensureTransport();
            }
            const s = document.createElement('script');
            s.id = 'nsft-rolef-fetcher';
            s.async = false;
            s.src = chrome.runtime.getURL('scripts/modules/role_finder/role_finder_fetcher.js');
            s.onload = function () { this.remove(); };
            (window.NSFT_AfterLoad ? window.NSFT_AfterLoad.append(s) : (document.head || document.documentElement).appendChild(s));
        }
        const token = ++_entToken;
        const timer = setTimeout(() => {
            if (_entPendientes.delete(token)) cb({ code: 'timeout' }, null);
        }, ENT_TIMEOUT_MS);
        _entPendientes.set(token, (err, nombres) => { clearTimeout(timer); cb(err, nombres); });
        const enviar = () => window.postMessage({ dest: 'fetcher_rolef', type: 'entityNames', payload: { token, ids } }, '*');
        if (_entListo) enviar(); else _entCola.push(enviar);
    }

    window.addEventListener('message', (event) => {
        if (event.source !== window) return;
        const d = event.data;
        if (!d || d.dest !== 'extension_rolef') return;
        if (d.type === 'ready') {
            _entListo = true;
            while (_entCola.length) _entCola.shift()();
            return;
        }
        if (d.type !== 'entityNames') return;
        const p = d.payload || {};
        const cb = _entPendientes.get(p.token);
        if (!cb) return;
        _entPendientes.delete(p.token);
        if (p.error) cb({ code: p.error }, null);
        else cb(null, p.names || {});
    });

    function findElement(theme, key) {
        const candidates = SELECTORS[theme]?.[key];
        if (!candidates) return null;
        for (const selector of candidates) {
            const el = document.querySelector(selector);
            if (el) return el;
        }
        return null;
    }

    function findAllElements(theme, key) {
        const candidates = SELECTORS[theme]?.[key];
        if (!candidates) return null;
        for (const selector of candidates) {
            const els = document.querySelectorAll(selector);
            if (els.length) return els;
        }
        return null;
    }
})();
