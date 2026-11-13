(function () {
    'use strict';

    if (window.NSFT_Ajustes) return;

    const ID = 'nsft-ajustes-dialog';

    function t(k, f) {
        try { return chrome.i18n.getMessage(k) || f || ''; } catch (e) { return f || ''; }
    }

    function esc(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
    }

    const sinDosPuntos = (s) => String(s || '').replace(/\s*:\s*$/, '');

    const ico = (d) => '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" '
        + 'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + d + '</svg>';

    const TEMAS_HLJS = [
        ['atom-one-dark', 'Atom One Dark'], ['atom-one-light', 'Atom One Light'], ['default', 'Default'],
        ['github', 'GitHub Light'], ['github-dark', 'GitHub Dark'], ['monokai', 'Monokai'], ['obsidian', 'Obsidian'],
        ['shades-of-purple', 'Shades of Purple'], ['synthwave-84', "Synthwave '84"], ['vs', 'Visual Studio'],
        ['vs2015', 'VS2015'], ['stackoverflow-light', 'StackOverflow Light'], ['stackoverflow-dark', 'StackOverflow Dark']
    ];

    function ladoActual(raiz) {
        const conTema = raiz && raiz.closest ? raiz.closest('[data-theme]') : null;
        if (conTema) return conTema.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
        return document.documentElement.getAttribute('data-nsft-theme') === 'dark' ? 'dark' : 'light';
    }

    function filas(def) {
        const todas = [];
        def.categorias.forEach((c) => c.secciones.forEach((s) => s.filas.forEach((f) => todas.push(f))));
        return todas;
    }

    function control(f) {
        if (f.tipo === 'select') {
            return '<select data-clave="' + esc(f.clave) + '">'
                + f.opciones.map(([v, et]) => '<option value="' + esc(v) + '">' + esc(et) + '</option>').join('')
                + '</select>';
        }
        if (f.tipo === 'seg') {
            return '<div class="nsft-set-seg" data-clave="' + esc(f.clave) + '">'
                + f.opciones.map(([v, et]) => '<button type="button" data-v="' + esc(String(v)) + '">' + esc(et) + '</button>').join('')
                + '</div>';
        }
        return '<button type="button" class="nsft-set-switch" role="switch" data-clave="' + esc(f.clave) + '" aria-label="'
            + esc(f.titulo) + '"><span></span></button>';
    }

    function fila(f) {
        const ayuda = f.ayuda ? '<span class="nsft-set-h">' + esc(f.ayuda) + '</span>' : '';
        const auto = f.tipo === 'select' ? '' : ' is-auto';
        return '<div class="nsft-set-row' + auto + '"><div class="nsft-set-lbl"><span class="nsft-set-t">'
            + esc(sinDosPuntos(f.titulo)) + '</span>' + ayuda + '</div>' + control(f) + '</div>';
    }

    function abre(def) {
        const previo = document.getElementById(ID);
        if (previo) { previo.remove(); return; }
        const lado = ladoActual(def.raiz || null);
        const cabe = def.raiz && def.raiz.clientWidth >= 760 && def.raiz.clientHeight >= 500;
        const raiz = cabe ? def.raiz : null;
        const host = raiz || document.body;
        if (!host) return;

        const overlay = document.createElement('div');
        overlay.id = ID;
        overlay.className = 'nsft-set-raiz nsft-w';
        overlay.setAttribute('data-nsft-ui', '');
        overlay.setAttribute('data-theme', lado);
        if (def.tono) { overlay.classList.add('nsft-tono'); overlay.dataset.tono = def.tono; }
        if (!raiz) overlay.style.cssText = 'position: fixed; z-index: 2147483000;';

        const cats = def.categorias;
        overlay.innerHTML = '<div class="nsft-set-dlg" role="dialog" aria-modal="true" aria-label="' + esc(t('sql_set_nav_title', 'Settings')) + '">'
            + '<nav class="nsft-set-nav" role="tablist" aria-orientation="vertical">'
                + '<div class="nsft-set-navtitle">' + esc(t('sql_set_nav_title', 'Settings')) + '</div>'
                + '<div class="nsft-set-navsub">' + ico(def.icono || '<circle cx="12" cy="12" r="3"></circle>') + '<span>' + esc(def.modulo || '') + '</span></div>'
                + cats.map((c) => '<button type="button" class="nsft-set-tab" role="tab" data-tab="' + esc(c.id) + '">'
                    + '<span class="nsft-set-tabico">' + ico(c.icono || '<circle cx="12" cy="12" r="3"></circle>') + '</span>'
                    + '<span class="nsft-set-tabtxt"><span class="nsft-set-tabl">' + esc(c.titulo) + '</span>'
                    + (c.sub ? '<span class="nsft-set-tabs">' + esc(c.sub) + '</span>' : '') + '</span></button>').join('')
                + '<button type="button" class="nsft-set-reset">' + ico('<path d="M4 12a8 8 0 1 0 2.3-5.7M4 4v4h4"></path>')
                + '<span>' + esc(t('sql_set_reset', 'Reset')) + '</span></button>'
            + '</nav>'
            + '<div class="nsft-set-main">'
                + '<div class="nsft-set-head"><h3><span data-role="titulo"></span>'
                + '<span class="nsft-set-saved" data-role="guardado" hidden>' + esc(t('sql_set_saved', 'Saved')) + '</span></h3>'
                + '<button type="button" class="nsft-set-close" title="' + esc(t('sql_settings_close', 'Close')) + '" aria-label="'
                + esc(t('sql_settings_close', 'Close')) + '">' + ico('<path d="M6 6l12 12M18 6L6 18"></path>') + '</button></div>'
                + '<div class="nsft-set-body">'
                + cats.map((c) => '<section data-panel="' + esc(c.id) + '" hidden>'
                    + c.secciones.map((s, i) => (i ? '<div class="nsft-set-sep"></div>' : '')
                        + (s.titulo ? '<div class="nsft-set-sec">' + esc(s.titulo) + '</div>' : '')
                        + s.filas.map(fila).join('')).join('')
                    + '</section>').join('')
                + '</div>'
            + '</div>'
            + '</div>';

        const dlg = overlay.firstElementChild;
        const todas = filas(def);
        const valores = {};
        const porDefecto = {};
        const D = window.NSFT_DEFAULTS || {};
        todas.forEach((f) => {
            porDefecto[f.clave] = (f.clave in D) ? D[f.clave] : f.defecto;
            if (f.tema) porDefecto[f.tema.bandera] = false;
        });

        let timer = null;
        const avisa = () => {
            const a = dlg.querySelector('[data-role="guardado"]');
            a.hidden = false;
            clearTimeout(timer);
            timer = setTimeout(() => { a.hidden = true; }, 1600);
        };
        const guarda = (cambios) => {
            try { chrome.storage.local.set(cambios); } catch (e) { }
            Object.assign(valores, cambios);
            pinta();
            avisa();
        };
        const autoTema = (f) => (document.documentElement.getAttribute('data-nsft-theme') === 'dark' ? f.tema.oscuro : f.tema.claro);

        function pinta() {
            todas.forEach((f) => {
                const el = dlg.querySelector('[data-clave="' + f.clave + '"]');
                if (!el) return;
                const v = valores[f.clave];
                if (f.tipo === 'select') {
                    el.value = (f.tema && !valores[f.tema.bandera]) ? 'auto' : String(v);
                } else if (f.tipo === 'seg') {
                    el.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === String(v))));
                } else {
                    el.setAttribute('aria-checked', String(!!v));
                }
            });
            if (window.NSFT_SetCombo) window.NSFT_SetCombo.refresca(dlg);
        }

        const elige = (id) => {
            const c = cats.find((x) => x.id === id) || cats[0];
            dlg.querySelectorAll('.nsft-set-tab').forEach((b) => {
                const on = b.dataset.tab === c.id;
                b.setAttribute('aria-selected', String(on));
                b.tabIndex = on ? 0 : -1;
            });
            dlg.querySelectorAll('section[data-panel]').forEach((s) => { s.hidden = s.dataset.panel !== c.id; });
            dlg.querySelector('[data-role="titulo"]').textContent = c.titulo;
        };

        dlg.addEventListener('click', (ev) => {
            const tab = ev.target.closest('.nsft-set-tab');
            if (tab) { elige(tab.dataset.tab); return; }
            const seg = ev.target.closest('.nsft-set-seg button');
            if (seg) {
                const clave = seg.parentElement.dataset.clave;
                const f = todas.find((x) => x.clave === clave);
                const op = f.opciones.find(([v]) => String(v) === seg.dataset.v);
                if (op) guarda({ [clave]: op[0] });
                return;
            }
            const sw = ev.target.closest('.nsft-set-switch');
            if (sw) { guarda({ [sw.dataset.clave]: !valores[sw.dataset.clave] }); return; }
            if (ev.target.closest('.nsft-set-reset')) {
                const r = Object.assign({}, porDefecto);
                todas.forEach((f) => { if (f.tema) r[f.clave] = autoTema(f); });
                guarda(r);
            }
        });
        dlg.addEventListener('change', (ev) => {
            const sel = ev.target.closest('select[data-clave]');
            if (!sel) return;
            const f = todas.find((x) => x.clave === sel.dataset.clave);
            if (f.tema) {
                guarda(sel.value === 'auto'
                    ? { [f.clave]: autoTema(f), [f.tema.bandera]: false }
                    : { [f.clave]: sel.value, [f.tema.bandera]: true });
            } else {
                const op = f.opciones.find(([v]) => String(v) === sel.value);
                guarda({ [f.clave]: op ? op[0] : sel.value });
            }
        });

        const alCambiar = (cambios, area) => {
            if (area !== 'local' || !Object.keys(porDefecto).some((k) => cambios[k])) return;
            Object.keys(cambios).forEach((k) => { if (k in porDefecto) valores[k] = cambios[k].newValue; });
            pinta();
        };
        const cerrar = () => {
            try { chrome.storage.onChanged.removeListener(alCambiar); } catch (e) { }
            document.removeEventListener('keydown', tecla, true);
            clearTimeout(timer);
            overlay.remove();
        };
        const tecla = (ev) => {
            if (ev.key !== 'Escape' || !overlay.isConnected) return;
            if (overlay.querySelector('.nsft-set-lista')) return;
            ev.stopPropagation();
            ev.preventDefault();
            cerrar();
        };
        dlg.querySelector('.nsft-set-close').addEventListener('click', cerrar);
        overlay.addEventListener('mousedown', (ev) => { if (ev.target === overlay) cerrar(); });
        document.addEventListener('keydown', tecla, true);

        host.appendChild(overlay);
        if (window.NSFT_SetCombo) {
            dlg.querySelectorAll('select[data-clave]').forEach((s) => window.NSFT_SetCombo.convierte(s));
        }
        elige(cats[0].id);
        try {
            chrome.storage.local.get(porDefecto, (it) => { Object.assign(valores, it); pinta(); });
            chrome.storage.onChanged.addListener(alCambiar);
        } catch (e) { }
        const primera = dlg.querySelector('.nsft-set-tab');
        if (primera) primera.focus();
    }

    window.NSFT_Ajustes = { abre, TEMAS_HLJS };
})();
