(function () {
    'use strict';

    const STORAGE_KEY = 'enableClearSort';
    const FETCHER_PATH = 'scripts/modules/clear_sort/clear_sort_fetcher.js';
    const FETCHER_DEST = 'fetcher_clearsort';
    const PAGINA = '_pagina_';

    if (!/^\/app\//.test(location.pathname)) return;
    try {
        if (window.NSFT_RecordButtons && NSFT_RecordButtons.isExcludedPage && NSFT_RecordButtons.isExcludedPage()) return;
    } catch (e) { }

    const t = (k, f, sus) => {
        try { return chrome.i18n.getMessage(k, sus) || f; } catch (e) { return f; }
    };

    const ICONO = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"'
        + ' stroke-linejoin="round" aria-hidden="true"><path d="M3 6h13"/><path d="M3 12h9"/><path d="M3 18h5"/>'
        + '<path d="m16 15 5 5"/><path d="m21 15-5 5"/></svg>';

    let unsub = null;
    let listo = null;

    chrome.storage.local.get({ [STORAGE_KEY]: true }, (it) => {
        if (it[STORAGE_KEY]) arranca();
    });

    chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== 'local' || !changes[STORAGE_KEY]) return;
        if (changes[STORAGE_KEY].newValue === false) para();
        else arranca();
    });

    function arranca() {
        pinta();
        if (!unsub && window.NSFT_Observer && typeof window.NSFT_Observer.subscribe === 'function') {
            unsub = window.NSFT_Observer.subscribe(pinta, { throttle: 400 });
        }
    }

    function para() {
        if (unsub) { unsub(); unsub = null; }
        document.querySelectorAll('[data-csort], .nsft-csort-sep').forEach((el) => el.remove());
    }

    function quita(id) {
        document.querySelectorAll('[data-csort="' + cssEsc(id) + '"]').forEach((el) => {
            const sep = el.previousElementSibling;
            if (sep && sep.classList.contains('nsft-csort-sep')) sep.remove();
            el.remove();
        });
    }

    function tablas() {
        const out = [];

        const form = document.querySelector('#body > #footer_actions_form') || document.getElementById('footer_actions_form');
        const els = form && form.elements;
        const barra = form && form.querySelector('.uir-control-bar');
        if (els && els.sortcol && barra && document.querySelector('td.uir-list-header-td[onclick^="doServerSort"]')) {
            out.push({ id: PAGINA, prefijo: '', donde: barra, raiz: document, col: els.sortcol.value || '', dir: (els.sortdir && els.sortdir.value) || '' });
        }

        document.querySelectorAll('[data-nsps-layer]').forEach((capa) => {
            const m = capa.dataset.nspsLayer;
            const f = m && document.forms[m + '_main_form'];
            const e = f && f.elements;
            if (!e || !e.sortcol) return;
            if (!capa.querySelector('td.uir-list-header-td[onclick^="' + cssEsc(m) + 'doServerSort"]')) return;
            const fila = filaNativa(capa);
            if (!fila) return;
            out.push({ id: m, prefijo: m, donde: fila, raiz: capa, col: e.sortcol.value || '', dir: (e.sortdir && e.sortdir.value) || '' });
        });
        return out;
    }

    function filaNativa(capa) {
        const barra = capa.querySelector('.uir-list-control-bar[data-above="true"]') || capa.querySelector('.uir-list-control-bar');
        return barra ? barra.querySelector(':scope > table > tbody > tr > td > table > tbody > tr') : null;
    }

    function nombreDe(tabla) {
        const cabs = tabla.raiz.querySelectorAll('td.uir-list-header-td[onclick]');
        for (const td of cabs) {
            const m = /^(\w*)doServerSort\s*\(\s*'([^']*)'/.exec(td.getAttribute('onclick') || '');
            if (m && m[1] === tabla.prefijo && m[2] === tabla.col) return td.textContent.replace(/\s+/g, ' ').trim();
        }
        return '';
    }

    function pinta() {
        const vivas = new Set();
        tablas().forEach((tabla) => {
            vivas.add(tabla.id);
            if (!tabla.col || tabla.col === 'null') { quita(tabla.id); return; }
            const clave = tabla.col + '|' + tabla.dir;
            const actual = document.querySelector('[data-csort="' + cssEsc(tabla.id) + '"]');
            if (actual && actual.dataset.orden === clave && tabla.donde.contains(actual)) return;
            quita(tabla.id);
            monta(tabla, clave);
        });
        document.querySelectorAll('[data-csort]').forEach((el) => {
            if (!vivas.has(el.dataset.csort)) quita(el.dataset.csort);
        });
    }

    function monta(tabla, clave) {
        const nombre = nombreDe(tabla) || tabla.col;
        const flecha = /desc/i.test(tabla.dir) ? '▼' : '▲';

        const grupo = document.createElement('div');
        grupo.className = 'nsft-tb-group nsft-csort';
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'nsft-tb-ghost nsft-csort-btn';
        btn.title = t('clearSortTitle', 'Back to the original order: removes the sort by “$1”', [nombre]);
        btn.innerHTML = ICONO;
        const rotulo = document.createElement('span');
        rotulo.textContent = t('clearSortBtn', 'Clear sort');
        const col = document.createElement('span');
        col.className = 'nsft-csort-col';
        col.textContent = nombre + ' ' + flecha;
        btn.append(rotulo, col);
        btn.addEventListener('click', () => quitaOrden(btn, tabla.id));
        grupo.appendChild(btn);

        if (tabla.id === PAGINA) {
            const item = document.createElement('span');
            item.className = 'uir-control-bar-item nsft-csort-item';
            item.dataset.csort = tabla.id;
            item.dataset.orden = clave;
            item.appendChild(grupo);
            if (tabla.donde.childElementCount) {
                const sep = document.createElement('span');
                sep.className = 'uir-control-bar-separator nsft-csort-sep';
                tabla.donde.appendChild(sep);
            }
            tabla.donde.appendChild(item);
        } else {
            const td = document.createElement('td');
            td.className = 'nsft-csort-td';
            td.dataset.csort = tabla.id;
            td.dataset.orden = clave;
            td.appendChild(grupo);
            tabla.donde.appendChild(td);
        }
    }

    function fetcherListo() {
        if (listo) return listo;
        listo = new Promise((resolver, rechazar) => {
            const s = document.createElement('script');
            s.id = 'nsft-clear-sort-fetcher';
            s.src = chrome.runtime.getURL(FETCHER_PATH);
            s.async = false;
            s.onload = () => resolver();
            s.onerror = () => { listo = null; rechazar(new Error('fetcher')); };
            (document.head || document.documentElement).appendChild(s);
        });
        return listo;
    }

    function quitaOrden(btn, id) {
        btn.disabled = true;
        fetcherListo().then(() => {
            window.postMessage({ dest: FETCHER_DEST, machine: id === PAGINA ? '' : id }, '*');
        }, () => { btn.disabled = false; });
    }

    function cssEsc(s) {
        return (window.CSS && CSS.escape) ? CSS.escape(s) : String(s).replace(/["\\]/g, '\\$&');
    }
})();
