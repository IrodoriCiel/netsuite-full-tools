(function () {
    'use strict';
    const STORAGE_KEY = 'enableFileCabinetFavorites';
    const LAYOUT_KEY = 'fileCabinetFavoritesLayout';
    const LAYOUTS = ['section', 'tabs', 'chips'];
    const FAV_KEY = 'nsftFcFav:' + location.host;
    const OPEN_KEY = 'nsftFcFavOpen';
    const TAB_KEY = 'nsftFcFavTab';
    const MAX_FAVS = 30;
    const VISIBLES = 5;
    const BAR_ID = 'nsft-fcfav-bar';
    const LABEL_ID = 'nsft-fcfav-label';
    const CHIPS_ID = 'nsft-fcfav-chips';
    const MENU_ID = 'nsft-fcfav-menu';
    const STAR_CLASS = 'nsft-fcfav-star';
    const BRIDGE_URL = '/app/common/scripting/PlatformClientScriptHandler.nl';

    let enabled = false;
    let favs = [];
    let layout = 'section';
    let _open = true;
    let _more = false;
    let _tab = 'fav';
    let _term = '';
    let _unsub = null;
    let _rutasPedidas = false;

    function isApplicablePage() {
        try {
            if (window.NSFT_RecordButtons && NSFT_RecordButtons.isExcludedPage && NSFT_RecordButtons.isExcludedPage()) return false;
        } catch (e) { }
        return /mediaitemfolders?\.nl/i.test(location.pathname);
    }
    if (!isApplicablePage()) return;

    const t = (k, fb) => (chrome.i18n && chrome.i18n.getMessage(k)) || fb;

    chrome.storage.local.get({ [STORAGE_KEY]: true, [LAYOUT_KEY]: 'section', [OPEN_KEY]: true, [TAB_KEY]: 'fav' }, (items) => {
        enabled = !!items[STORAGE_KEY];
        layout = LAYOUTS.includes(items[LAYOUT_KEY]) ? items[LAYOUT_KEY] : 'section';
        _open = items[OPEN_KEY] !== false;
        _tab = items[TAB_KEY] === 'tree' ? 'tree' : 'fav';
        if (!enabled) return;
        loadFavs(init);
    });

    chrome.storage.onChanged.addListener((changes, area) => {
        if (area === 'local' && changes[STORAGE_KEY]) {
            enabled = !!changes[STORAGE_KEY].newValue;
            if (enabled) loadFavs(init); else teardown();
        }
        if (area === 'local' && changes[LAYOUT_KEY]) {
            const v = changes[LAYOUT_KEY].newValue;
            layout = LAYOUTS.includes(v) ? v : 'section';
            if (enabled) render(true);
        }
        if (area === 'sync' && changes[FAV_KEY]) {
            favs = sane(changes[FAV_KEY].newValue);
            if (enabled) render(true);
        }
    });

    function loadFavs(cb) {
        try {
            chrome.storage.sync.get({ [FAV_KEY]: [] }, (st) => {
                favs = sane(st && st[FAV_KEY]);
                cb();
            });
        } catch (e) { favs = []; cb(); }
    }

    function sane(v) {
        if (!Array.isArray(v)) return [];
        const vistos = new Set();
        return v.filter((f) => f && /^-?\d+$/.test(String(f.id)) && !vistos.has(String(f.id)) && vistos.add(String(f.id)))
            .slice(0, MAX_FAVS)
            .map((f) => ({
                id: String(f.id),
                name: String(f.name || '').trim() || ('#' + f.id),
                path: typeof f.path === 'string' ? f.path : null
            }));
    }

    function save() {
        try { chrome.storage.sync.set({ [FAV_KEY]: favs }); } catch (e) { }
    }

    function isFav(id) { return favs.some((f) => f.id === String(id)); }

    function toggle(id, name) {
        id = String(id);
        if (isFav(id)) {
            favs = favs.filter((f) => f.id !== id);
        } else {
            if (favs.length >= MAX_FAVS) return;
            favs = favs.concat({ id, name: String(name || '').trim() || ('#' + id), path: null });
            _rutasPedidas = false;
        }
        save();
        render(true);
    }

    function init() {
        enganchaBuscador();
        if (_unsub) { render(true); return; }
        if (window.NSFT_Observer && typeof window.NSFT_Observer.subscribe === 'function') {
            _unsub = window.NSFT_Observer.subscribe(() => render(false), { throttle: 300, immediate: true });
        } else {
            const mo = new MutationObserver(() => render(false));
            mo.observe(document.body, { childList: true, subtree: true });
            _unsub = () => mo.disconnect();
            render(true);
        }
        window.addEventListener('resize', ajustaAltoTabs);
    }

    function teardown() {
        if (_unsub) { _unsub(); _unsub = null; }
        document.querySelectorAll('.' + STAR_CLASS).forEach((s) => s.remove());
        quitaPaneles();
        cierraMenu();
    }

    function quitaPaneles() {
        [BAR_ID, LABEL_ID, CHIPS_ID].forEach((id) => { const e = document.getElementById(id); if (e) e.remove(); });
        const cont = document.getElementById('div__psps_1');
        if (cont) cont.classList.remove('nsft-fcfav-hidetree');
    }


    function enganchaBuscador() {
        const inp = document.getElementById('mediasrch_t');
        if (!inp || inp.dataset.nsftFcfav) return;
        inp.dataset.nsftFcfav = '1';
        _term = inp.value || '';
        inp.addEventListener('input', () => { _term = inp.value || ''; aplicaFiltro(); });
    }

    function casa(f) {
        const term = _term.trim();
        if (!term) return true;
        const TS = window.NSFT_TextSearch;
        const hay = f.name + ' ' + (f.path || '');
        return TS ? TS.match(hay, term) : hay.toLowerCase().includes(term.toLowerCase());
    }

    function marca(el, texto) {
        const term = _term.trim();
        const TS = window.NSFT_TextSearch;
        if (term && TS && TS.markHtml) el.innerHTML = TS.markHtml(texto, term, 'nsft-fcfav-hl');
        else el.textContent = texto;
    }

    function aplicaFiltro() {
        const raiz = document.getElementById(layout === 'chips' ? CHIPS_ID : BAR_ID);
        if (!raiz) return;
        const filtrando = !!_term.trim();
        let vistas = 0;
        raiz.querySelectorAll('[data-fav-id]').forEach((row, i) => {
            const f = favs.find((x) => x.id === row.dataset.favId);
            if (!f) return;
            const ok = casa(f);
            const tope = layout === 'section' && !_more && !filtrando && i >= VISIBLES;
            row.hidden = !ok || tope;
            if (ok) vistas++;
            const n = row.querySelector('.nsft-fcfav-n');
            const p = row.querySelector('.nsft-fcfav-path');
            if (n) marca(n, f.name);
            if (p) marca(p, rutaVisible(f));
        });
        const mas = raiz.querySelector('.nsft-fcfav-more');
        if (mas) mas.hidden = filtrando || favs.length <= VISIBLES;
        const vacio = raiz.querySelector('.nsft-fcfav-empty');
        if (vacio) vacio.hidden = !filtrando || vistas > 0;
    }


    function rutaVisible(f) {
        if (f.path === null || f.path === undefined) return '…';
        return f.path || t('fcfav_root', 'Root');
    }

    function pideRutas() {
        if (_rutasPedidas || !favs.length) return;
        _rutasPedidas = true;
        const ids = favs.map((f) => parseInt(f.id, 10)).filter((n) => !isNaN(n));
        const query = 'SELECT id, appfolder FROM mediaitemfolder WHERE id IN (' + ids.join(', ') + ')';
        fetch(BRIDGE_URL, {
            method: 'POST',
            credentials: 'include',
            headers: { 'accept': '*/*', 'content-type': 'application/json', 'nsxmlhttprequest': 'NSXMLHttpRequest' },
            body: JSON.stringify({ method: 'remoteObject.bridgeCall', params: ['queryApiBridge', 'runSuiteQL', JSON.stringify([query, '[]', 'SUITE_QL', ''])] })
        })
            .then((r) => (r.ok ? r.json() : null))
            .then((data) => {
                const r = data && data.result && data.result.result;
                if (!r || !r.count) return;
                let cambio = false;
                for (let i = 0; i < r.count; i++) {
                    const fila = r['v' + i];
                    if (!Array.isArray(fila) || fila.length < 2) continue;
                    const f = favs.find((x) => x.id === String(fila[0]));
                    if (!f) continue;
                    const partes = String(fila[1] || '').split(':').map((s) => s.trim()).filter(Boolean);
                    const ruta = partes.slice(0, -1).join(' › ');
                    if (f.path !== ruta) { f.path = ruta; cambio = true; }
                }
                if (cambio) { save(); render(true); }
            })
            .catch(() => { });
    }


    function treeNodes() {
        const tree = document.getElementById('div__nav_tree');
        if (!tree) return [];
        const out = [];
        tree.querySelectorAll('span.uir-tree-node').forEach((span) => {
            const m = /^(-?\d+)_tnidtitle$/.exec(span.id || '');
            if (!m) return;
            out.push({ span, id: m[1], name: (span.getAttribute('alttext') || span.textContent || '').trim() });
        });
        return out;
    }

    function listRows() {
        const out = [];
        document.querySelectorAll('tr.uir-list-row-tr').forEach((row) => {
            let id = '';
            row.querySelectorAll('a[href*="mediaitemfolder.nl"]').forEach((a) => {
                if (id) return;
                try {
                    const u = new URL(a.getAttribute('href') || '', location.origin);
                    if (/\/mediaitemfolder\.nl$/i.test(u.pathname)) id = u.searchParams.get('id') || '';
                } catch (e) { }
            });
            if (!/^-?\d+$/.test(id)) return;
            const anchor = [...row.querySelectorAll('a')].find((a) => {
                const href = a.getAttribute('href') || '';
                return (a.textContent || '').trim()
                    && !/mediaitemfolder\.nl|downloadfolder\.nl/i.test(href)
                    && new RegExp('[?&]folder=' + id.replace('-', '\\-') + '(?:&|$)').test(href)
                    && !String(a.className).includes('nsft-');
            });
            if (anchor) out.push({ anchor, id, name: (anchor.textContent || '').trim() });
        });
        return out;
    }

    function currentFolderId() {
        const input = document.getElementById('folder');
        if (input && input.value) return String(input.value);
        try {
            const f = new URLSearchParams(location.search).get('folder');
            if (f && /^-?\d+$/.test(f)) return f;
        } catch (e) { }
        return '';
    }

    function render(forzar) {
        if (!enabled) return;
        enganchaBuscador();
        const nodes = treeNodes();

        let renombrada = false;
        nodes.forEach((n) => {
            const f = favs.find((x) => x.id === n.id);
            if (f && n.name && f.name !== n.name) { f.name = n.name; renombrada = true; }
        });
        if (renombrada) save();

        nodes.forEach((n) => syncStar(n.span, n.id, n.name, 'afterend'));
        listRows().forEach((r) => syncStar(r.anchor, r.id, r.name, 'afterend'));
        headerStar(nodes);
        pintaPanel(forzar || renombrada);
        pideRutas();
    }

    function syncStar(ancla, id, name, donde) {
        let star = ancla.parentElement && ancla.parentElement.querySelector(':scope > .' + STAR_CLASS + '[data-id="' + cssId(id) + '"]');
        if (donde === 'beforeend') star = ancla.querySelector('.' + STAR_CLASS);
        if (!star) {
            star = document.createElement('span');
            star.className = STAR_CLASS;
            star.setAttribute('role', 'button');
            star.tabIndex = 0;
            star.dataset.id = id;
            star.innerHTML = svgStar();
            const actua = (e) => {
                e.preventDefault();
                e.stopPropagation();
                toggle(star.dataset.id, star.dataset.name);
            };
            star.addEventListener('click', actua);
            star.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') actua(e); });
            star.addEventListener('mousedown', (e) => e.stopPropagation());
            ancla.insertAdjacentElement(donde, star);
        } else if (donde === 'afterend' && ancla.nextElementSibling !== star) {
            ancla.insertAdjacentElement('afterend', star);
        }
        star.dataset.id = id;
        star.dataset.name = name || '';
        const on = isFav(id);
        star.classList.toggle('is-on', on);
        star.setAttribute('aria-pressed', on ? 'true' : 'false');
        const tip = on ? t('fcfav_remove', 'Remove from favorite folders') : t('fcfav_add', 'Add to favorite folders');
        if (star.title !== tip) { star.title = tip; star.setAttribute('aria-label', tip); }
    }

    function headerStar(nodes) {
        const header = document.getElementById('medialisthdr_t');
        const id = currentFolderId();
        if (!header || !id) return;
        const nodo = nodes.find((n) => n.id === id);
        let name = nodo ? nodo.name : '';
        if (!name) {
            const clon = header.cloneNode(true);
            clon.querySelectorAll('[class*="nsft-"]').forEach((e) => e.remove());
            name = (clon.textContent || '').trim().split(/\s*>\s*/).pop().trim();
        }
        syncStar(header, id, name, 'beforeend');
    }

    function pintaPanel(forzar) {
        const actual = currentFolderId();
        const firma = [layout, _open, _more, _tab, actual].join('|') + '|' + favs.map((f) => f.id + ':' + f.name + ':' + f.path).join('|');
        const raizId = layout === 'chips' ? CHIPS_ID : BAR_ID;
        const raiz = document.getElementById(raizId);
        if (!favs.length) { quitaPaneles(); return; }
        if (raiz && raiz.dataset.firma === firma && !forzar) {
            if (layout === 'tabs') ajustaAltoTabs();
            return;
        }
        quitaPaneles();
        if (layout === 'chips') pintaChips(actual);
        else if (layout === 'tabs') pintaTabs(actual);
        else pintaSeccion(actual);
        const nueva = document.getElementById(raizId);
        if (nueva) nueva.dataset.firma = firma;
        aplicaFiltro();
    }

    function filaFav(f, actual, conAsa, conEstrella) {
        const row = document.createElement('a');
        row.className = 'nsft-fcfav-item' + (f.id === actual ? ' is-active' : '');
        row.href = '/app/common/media/mediaitemfolders.nl?folder=' + encodeURIComponent(f.id);
        row.dataset.favId = f.id;
        row.title = (f.path ? f.path + ' › ' : '') + f.name;
        if (conAsa) {
            const asa = document.createElement('span');
            asa.className = 'nsft-fcfav-grip';
            asa.setAttribute('aria-hidden', 'true');
            asa.textContent = '⋮⋮';
            row.appendChild(asa);
        }
        const txt = document.createElement('span');
        txt.className = 'nsft-fcfav-txt';
        const n = document.createElement('span');
        n.className = 'nsft-fcfav-n';
        n.textContent = f.name;
        const p = document.createElement('span');
        p.className = 'nsft-fcfav-path';
        p.textContent = rutaVisible(f);
        txt.append(n, p);
        row.appendChild(txt);
        if (conEstrella) row.appendChild(estrellaQuitar(f));
        return row;
    }

    function estrellaQuitar(f) {
        const quitar = t('fcfav_remove', 'Remove from favorite folders');
        const s = document.createElement('button');
        s.type = 'button';
        s.className = 'nsft-fcfav-unstar';
        s.title = quitar;
        s.setAttribute('aria-label', quitar + ': ' + f.name);
        s.innerHTML = svgStar();
        s.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); toggle(f.id, f.name); });
        return s;
    }

    function vacioFiltro() {
        const v = document.createElement('div');
        v.className = 'nsft-fcfav-empty';
        const txt = t('fcfav_none', 'No folder matches');
        if (window.NSFT_Herramientas) v.innerHTML = window.NSFT_Herramientas.vacio('buscar', txt, '', '', { linea: true });
        else v.textContent = txt;
        v.hidden = true;
        return v;
    }

    function pintaSeccion(actual) {
        const cont = document.getElementById('div__psps_1');
        const tree = document.getElementById('div__nav_tree');
        if (!cont || !tree) return;
        const bar = document.createElement('div');
        bar.id = BAR_ID;
        bar.className = 'is-section' + (_open ? ' is-open' : '');
        bar.setAttribute('role', 'navigation');
        bar.setAttribute('aria-label', t('fcfav_bar', 'Favorite folders'));

        const head = document.createElement('div');
        head.className = 'nsft-fcfav-head';
        const plegar = document.createElement('button');
        plegar.type = 'button';
        plegar.className = 'nsft-fcfav-fold';
        plegar.setAttribute('aria-expanded', _open ? 'true' : 'false');
        plegar.innerHTML = svgStar() + '<span class="nsft-fcfav-title"></span><span class="nsft-fcfav-count"></span>' + svgChevron();
        plegar.querySelector('.nsft-fcfav-title').textContent = t('fcfav_bar', 'Favorite folders');
        plegar.querySelector('.nsft-fcfav-count').textContent = String(favs.length);
        plegar.addEventListener('click', (e) => {
            e.preventDefault();
            _open = !_open;
            try { chrome.storage.local.set({ [OPEN_KEY]: _open }); } catch (err) { }
            render(true);
        });
        head.append(plegar, botonEngrane());
        bar.appendChild(head);

        if (_open) {
            const lista = document.createElement('div');
            lista.className = 'nsft-fcfav-list';
            favs.forEach((f) => lista.appendChild(filaFav(f, actual, false, true)));
            bar.appendChild(lista);
            bar.appendChild(vacioFiltro());
            if (favs.length > VISIBLES) {
                const mas = document.createElement('button');
                mas.type = 'button';
                mas.className = 'nsft-fcfav-more';
                mas.textContent = _more
                    ? t('fcfav_less', 'Show less')
                    : t('fcfav_more', 'Show {n} more').replace('{n}', String(favs.length - VISIBLES));
                mas.addEventListener('click', (e) => { e.preventDefault(); _more = !_more; render(true); });
                bar.appendChild(mas);
            }
        }
        cont.insertBefore(bar, cont.firstChild);

        const label = document.createElement('div');
        label.id = LABEL_ID;
        label.textContent = t('fcfav_folders', 'Folders');
        tree.parentNode.insertBefore(label, tree);
    }

    function pintaTabs(actual) {
        const cont = document.getElementById('div__psps_1');
        const tree = document.getElementById('div__nav_tree');
        if (!cont || !tree) return;
        const bar = document.createElement('div');
        bar.id = BAR_ID;
        bar.className = 'is-tabs';
        bar.setAttribute('role', 'navigation');
        bar.setAttribute('aria-label', t('fcfav_bar', 'Favorite folders'));

        const tabs = document.createElement('div');
        tabs.className = 'nsft-fcfav-tabs';
        tabs.setAttribute('role', 'tablist');
        const pestana = (cual, html) => {
            const b = document.createElement('button');
            b.type = 'button';
            b.className = 'nsft-fcfav-tab' + (_tab === cual ? ' is-on' : '');
            b.setAttribute('role', 'tab');
            b.setAttribute('aria-selected', _tab === cual ? 'true' : 'false');
            b.innerHTML = html;
            b.addEventListener('click', (e) => {
                e.preventDefault();
                _tab = cual;
                try { chrome.storage.local.set({ [TAB_KEY]: _tab }); } catch (err) { }
                render(true);
            });
            return b;
        };
        const tCarp = pestana('tree', '<span></span>');
        tCarp.querySelector('span').textContent = t('fcfav_folders', 'Folders');
        const tFav = pestana('fav', svgStar() + '<span></span>');
        tFav.querySelector('span').textContent = t('fcfav_tab', 'Favorites ({n})').replace('{n}', String(favs.length));
        tabs.append(tCarp, tFav, botonEngrane());
        bar.appendChild(tabs);

        if (_tab === 'fav') {
            const lista = document.createElement('div');
            lista.className = 'nsft-fcfav-list';
            favs.forEach((f) => lista.appendChild(filaFav(f, actual, true, true)));
            lista.appendChild(vacioFiltro());
            cableaArrastre(lista);
            bar.appendChild(lista);
            cont.classList.add('nsft-fcfav-hidetree');
        }
        cont.insertBefore(bar, cont.firstChild);
        ajustaAltoTabs();
    }

    function ajustaAltoTabs() {
        if (layout !== 'tabs' || _tab !== 'fav') return;
        const cont = document.getElementById('div__psps_1');
        const lista = document.querySelector('#' + BAR_ID + ' .nsft-fcfav-list');
        if (!cont || !lista) return;
        const alto = Math.floor(cont.getBoundingClientRect().bottom - lista.getBoundingClientRect().top);
        if (alto > 80) lista.style.maxHeight = alto + 'px';
    }

    function cableaArrastre(lista) {
        let origen = null;
        lista.querySelectorAll('.nsft-fcfav-item').forEach((row) => {
            row.draggable = true;
            row.addEventListener('dragstart', (e) => {
                origen = row.dataset.favId;
                row.classList.add('is-dragging');
                try { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', origen); } catch (err) { }
            });
            row.addEventListener('dragend', () => { row.classList.remove('is-dragging'); origen = null; });
            row.addEventListener('dragover', (e) => { if (origen) { e.preventDefault(); row.classList.add('is-over'); } });
            row.addEventListener('dragleave', () => row.classList.remove('is-over'));
            row.addEventListener('drop', (e) => {
                e.preventDefault();
                row.classList.remove('is-over');
                const destino = row.dataset.favId;
                if (!origen || origen === destino) return;
                const i = favs.findIndex((f) => f.id === origen);
                const j = favs.findIndex((f) => f.id === destino);
                if (i < 0 || j < 0) return;
                const [movida] = favs.splice(i, 1);
                favs.splice(j, 0, movida);
                save();
                render(true);
            });
        });
    }

    function pintaChips(actual) {
        const hdr = document.getElementById('div__medialisthdr');
        if (!hdr || !hdr.parentNode) return;
        const bar = document.createElement('div');
        bar.id = CHIPS_ID;
        bar.setAttribute('role', 'navigation');
        bar.setAttribute('aria-label', t('fcfav_bar', 'Favorite folders'));
        const ico = document.createElement('span');
        ico.className = 'nsft-fcfav-chipsico';
        ico.innerHTML = svgStar();
        bar.appendChild(ico);
        const fila = document.createElement('div');
        fila.className = 'nsft-fcfav-chiprow';
        favs.forEach((f) => {
            const a = document.createElement('a');
            a.className = 'nsft-fcfav-chip' + (f.id === actual ? ' is-active' : '');
            a.href = '/app/common/media/mediaitemfolders.nl?folder=' + encodeURIComponent(f.id);
            a.dataset.favId = f.id;
            a.title = (f.path ? f.path + ' › ' : '') + f.name;
            const n = document.createElement('span');
            n.className = 'nsft-fcfav-n';
            n.textContent = f.name;
            a.appendChild(n);
            fila.appendChild(a);
        });
        bar.append(fila, botonEngrane());
        hdr.parentNode.insertBefore(bar, hdr);
    }


    function botonEngrane() {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'nsft-fcfav-gear';
        const tip = t('fcfav_layout', 'Favorites view');
        b.title = tip;
        b.setAttribute('aria-label', tip);
        b.setAttribute('aria-haspopup', 'dialog');
        b.innerHTML = svgGear();
        b.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (abreAjustes()) return;
            if (document.getElementById(MENU_ID)) cierraMenu(); else abreMenu(b);
        });
        return b;
    }

    function abreAjustes() {
        const A = window.NSFT_Ajustes;
        if (!A || !A.abre) return false;
        const vista = '<rect x="3" y="4" width="18" height="16" rx="2"></rect><path d="M3 10h18M9 10v10"></path>';
        A.abre({
            modulo: t('enableFileCabinetFavoritesLabel', 'Favorite folders'),
            icono: '<path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z"></path>',
            categorias: [{
                id: 'vista', titulo: t('fcfav_layout', 'Favorites view'), icono: vista,
                secciones: [{
                    titulo: t('fcfav_layout', 'Favorites view'),
                    filas: [{ tipo: 'select', clave: LAYOUT_KEY, titulo: t('fcfav_layout', 'Favorites view'), defecto: 'section',
                        opciones: LAYOUTS.map((v) => [v, t('fcfav_layout_' + v, v)]) }]
                }]
            }]
        });
        return true;
    }

    function abreMenu(boton) {
        cierraMenu();
        const menu = document.createElement('div');
        menu.id = MENU_ID;
        menu.setAttribute('role', 'menu');
        const titulo = document.createElement('div');
        titulo.className = 'nsft-fcfav-menutitle';
        titulo.textContent = t('fcfav_layout', 'Favorites view');
        menu.appendChild(titulo);
        const nombres = {
            section: t('fcfav_layout_section', 'Compact section'),
            tabs: t('fcfav_layout_tabs', 'Folders / Favorites tabs'),
            chips: t('fcfav_layout_chips', 'Chips above the content')
        };
        LAYOUTS.forEach((v) => {
            const it = document.createElement('button');
            it.type = 'button';
            it.className = 'nsft-fcfav-menuitem' + (v === layout ? ' is-on' : '');
            it.setAttribute('role', 'menuitemradio');
            it.setAttribute('aria-checked', v === layout ? 'true' : 'false');
            it.textContent = nombres[v];
            it.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                cierraMenu();
                if (v === layout) return;
                layout = v;
                try { chrome.storage.local.set({ [LAYOUT_KEY]: v }); } catch (err) { }
                render(true);
            });
            menu.appendChild(it);
        });
        document.body.appendChild(menu);
        const r = boton.getBoundingClientRect();
        const ancho = menu.offsetWidth;
        let x = r.right - ancho;
        if (x < 8) x = Math.min(r.left, window.innerWidth - ancho - 8);
        menu.style.left = Math.max(8, x) + 'px';
        menu.style.top = (r.bottom + 4) + 'px';
        setTimeout(() => {
            document.addEventListener('mousedown', fueraDelMenu, true);
            document.addEventListener('keydown', escMenu, true);
        }, 0);
    }

    function fueraDelMenu(e) {
        const menu = document.getElementById(MENU_ID);
        if (menu && !menu.contains(e.target) && !(e.target.closest && e.target.closest('.nsft-fcfav-gear'))) cierraMenu();
    }

    function escMenu(e) {
        if (e.key === 'Escape') { e.stopPropagation(); cierraMenu(); }
    }

    function cierraMenu() {
        const menu = document.getElementById(MENU_ID);
        if (menu) menu.remove();
        document.removeEventListener('mousedown', fueraDelMenu, true);
        document.removeEventListener('keydown', escMenu, true);
    }


    function cssId(id) { return String(id).replace(/[^-0-9]/g, ''); }

    function svgChevron() {
        return '<svg class="nsft-fcfav-chev" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>';
    }

    function svgGear() {
        return '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>';
    }

    function svgStar() {
        return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.2l2.6 5.5 6 .8-4.4 4.2 1.1 6-5.3-2.9-5.3 2.9 1.1-6L3.4 9.5l6-.8z"/></svg>';
    }
})();
