(function () {
    'use strict';
    if (window.top !== window) return;
    if (!/^\/app\//.test(window.location.pathname)) return;

    const STORAGE_KEY = 'enableCapturaGuiada';
    let _on = false;
    let _x = -1;
    let _y = -1;

    chrome.storage.local.get({ [STORAGE_KEY]: true }, (items) => { _on = !!items[STORAGE_KEY]; });
    chrome.storage.onChanged.addListener((changes, area) => {
        if (area === 'local' && changes[STORAGE_KEY]) _on = !!changes[STORAGE_KEY].newValue;
    });

    document.addEventListener('mousemove', (e) => { _x = e.clientX; _y = e.clientY; }, { passive: true, capture: true });

    function i18n(key, fallback) {
        let out = '';
        try { out = chrome.i18n.getMessage(key) || ''; } catch (e) { out = ''; }
        return out || fallback;
    }

    function toast(msg, type) {
        if (window.NSFT_Clipboard && window.NSFT_Clipboard.showToast) window.NSFT_Clipboard.showToast(msg, { type: type || 'info' });
    }

    function limpio(s) {
        const t = String(s || '').replace(/\s+/g, ' ').trim();
        return t.length > 60 ? t.slice(0, 59) + '…' : t;
    }

    function caja(el) {
        if (!el) return null;
        const r = el.getBoundingClientRect();
        if (r.width < 2 || r.height < 2) return null;
        return { x: r.left, y: r.top, w: r.width, h: r.height };
    }

    function une(cajas) {
        const v = cajas.filter(Boolean);
        if (!v.length) return null;
        const x1 = Math.min(...v.map((c) => c.x));
        const y1 = Math.min(...v.map((c) => c.y));
        const x2 = Math.max(...v.map((c) => c.x + c.w));
        const y2 = Math.max(...v.map((c) => c.y + c.h));
        return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
    }

    function cajaDe(p) {
        return p.els.length > 1 ? une(p.els.map(caja)) || caja(p.raiz) : caja(p.els[0]);
    }

    function rutaDeMenu(el) {
        let item = el.closest('[data-widget="MenuItem"]');
        if (!item) return null;
        const pasos = [];
        let vueltas = 0;
        while (item && vueltas++ < 10) {
            const link = item.querySelector('[data-widget="Link"]');
            const nombre = limpio((link && link.getAttribute('aria-label')) || item.getAttribute('aria-label') || item.textContent);
            pasos.unshift({ nombre, els: [item], raiz: item });
            const pop = item.closest('[data-widget="Popover"]');
            if (!pop || !pop.id) break;
            item = document.querySelector('[aria-owns="' + CSS.escape(pop.id) + '"]');
        }
        return pasos.length ? { tipo: 'menu', pasos } : null;
    }

    function rutaDeCampo(el) {
        const w = el.closest('.uir-field-wrapper');
        if (!w) return null;
        const etiqueta = w.querySelector('.uir-label');
        const nombre = limpio(w.getAttribute('data-nsps-label') || (etiqueta && etiqueta.textContent) || '');
        if (!nombre) return null;
        const pasos = [];
        let e = w.parentElement;
        while (e && e !== document.body) {
            const m = e.id && /^(.+)_(div|wrapper)$/.exec(e.id);
            if (m) {
                const link = document.getElementById(m[1] + 'txt');
                if (link && caja(link) && !pasos.some((p) => p.raiz === link)) {
                    pasos.unshift({ nombre: limpio(link.getAttribute('data-nsps-label') || link.textContent), els: [link], raiz: link });
                }
            }
            e = e.parentElement;
        }
        const hijos = Array.from(w.children);
        pasos.push({ nombre, els: hijos.length ? hijos : [w], raiz: w });
        return { tipo: 'campo', pasos, id: w.getAttribute('data-field-name') || '' };
    }

    function rutaDeElemento(el) {
        const obj = el.closest('button, a, input, select, textarea, [role="button"], [role="tab"], [data-widget="Button"], td, th, li') || el;
        if (!caja(obj)) return null;
        const nombre = limpio(obj.getAttribute('aria-label') || obj.getAttribute('title') || obj.value || obj.textContent);
        return { tipo: 'elemento', pasos: [{ nombre, els: [obj], raiz: obj }] };
    }

    const GEOMETRIA = /^nsft-(smaller-mainmenu|compact-nav)$/;
    const MARCA_OBJETIVO = 'data-nsft-cg-objetivo';
    let _limpieza = null;

    function limpia(objetivos) {
        restaura();
        const html = document.documentElement;
        const clases = Array.from(html.classList).filter((c) => c.startsWith('nsft-') && !GEOMETRIA.test(c));
        const attrs = Array.from(html.attributes).filter((a) => a.name.startsWith('data-nsft-')).map((a) => [a.name, a.value]);
        const puro = (e) => (e.id || '').startsWith('nsft') || e.hasAttribute('data-nsft-ui')
            || (e.classList.length > 0 && Array.from(e.classList).every((c) => c.startsWith('nsft-')));
        const cands = Array.from(document.querySelectorAll('[id^="nsft"], [class^="nsft-"], [class*=" nsft-"], [data-nsft-ui]'))
            .filter((e) => e !== html && e !== document.body && puro(e) && !objetivos.some((o) => e.contains(o)));
        const set = new Set(cands);
        const ocultos = [];
        cands.forEach((e) => {
            let p = e.parentElement;
            while (p) { if (set.has(p)) return; p = p.parentElement; }
            ocultos.push([e, e.style.getPropertyValue('display'), e.style.getPropertyPriority('display')]);
            e.style.setProperty('display', 'none', 'important');
        });
        objetivos.forEach((o) => o.setAttribute(MARCA_OBJETIVO, ''));
        const regla = document.createElement('style');
        regla.id = 'nsft-cg-limpia';
        regla.textContent = ':is([id^="nsft"], [data-nsft-ui]):not([' + MARCA_OBJETIVO + ']):not(:has([' + MARCA_OBJETIVO + '])) { display: none !important; }';
        (document.head || document.documentElement).appendChild(regla);
        clases.forEach((c) => html.classList.remove(c));
        attrs.forEach(([n]) => html.removeAttribute(n));
        _limpieza = { clases, attrs, ocultos, objetivos, regla, plazo: setTimeout(restaura, 4000) };
    }

    function restaura() {
        if (!_limpieza) return;
        const l = _limpieza;
        _limpieza = null;
        clearTimeout(l.plazo);
        const html = document.documentElement;
        l.clases.forEach((c) => html.classList.add(c));
        l.attrs.forEach(([n, v]) => html.setAttribute(n, v));
        l.regla.remove();
        l.objetivos.forEach((o) => o.removeAttribute(MARCA_OBJETIVO));
        l.ocultos.forEach(([e, v, p]) => {
            if (v) e.style.setProperty('display', v, p);
            else e.style.removeProperty('display');
        });
    }

    function prepara(responder) {
        if (_x < 0) { responder({ ok: false, motivo: 'sinraton' }); return; }
        if (document.querySelector('.nsft-cg-overlay')) { responder({ ok: false, motivo: 'abierta' }); return; }
        const el = document.elementFromPoint(_x, _y);
        if (!el || el.closest('[class*="nsft-cg-"]')) { responder({ ok: false, motivo: 'nada' }); return; }
        const r = rutaDeMenu(el) || rutaDeCampo(el) || rutaDeElemento(el);
        if (!r) { responder({ ok: false, motivo: 'nada' }); return; }
        limpia(r.pasos.map((p) => p.raiz));
        requestAnimationFrame(() => requestAnimationFrame(() => {
            const pasos = r.pasos.map((p) => ({ nombre: p.nombre, caja: cajaDe(p) })).filter((p) => p.caja);
            if (!pasos.length) { restaura(); responder({ ok: false, motivo: 'nada' }); return; }
            responder({ ok: true, tipo: r.tipo, id: r.id || '', pasos, vw: window.innerWidth, vh: window.innerHeight });
        }));
    }

    chrome.runtime.onMessage.addListener((msg, sender, responder) => {
        if (!msg || !msg.nsftCaptura) return undefined;
        if (msg.nsftCaptura === 'prepara') {
            if (!_on) { responder({ ok: false, motivo: 'apagado' }); return undefined; }
            try {
                prepara((r) => {
                    if (!r.ok && r.motivo === 'sinraton') toast(i18n('cg_sin_raton', 'Move the mouse over what you want to show and press the shortcut again.'), 'info');
                    responder(r);
                });
            } catch (e) {
                restaura();
                responder({ ok: false, motivo: 'error' });
            }
            return true;
        }
        if (msg.nsftCaptura === 'abre' && msg.img && msg.datos) {
            restaura();
            if (window.NSFT_CapturaEditor) window.NSFT_CapturaEditor.open(msg.img, msg.datos);
            return undefined;
        }
        if (msg.nsftCaptura === 'error') {
            restaura();
            toast(i18n('cg_error', 'The screen could not be captured. Try again.'), 'error');
        }
        return undefined;
    });

    function registraAtajo(combo) {
        if (!combo || !window.NSFT_Shortcuts || !window.NSFT_Shortcuts.register) return;
        try {
            window.NSFT_Shortcuts.register('captura_guiada', i18n('enableCapturaGuiadaLabel', 'Guided capture'), combo, {
                group: i18n('cheatsheet_group_global', 'Global'),
                context: 'global'
            });
        } catch (e) { }
    }
    try {
        chrome.runtime.sendMessage({ nsftCaptura: 'atajo' }, (r) => {
            void chrome.runtime.lastError;
            registraAtajo((r && r.atajo) || 'Alt+Shift+M');
        });
    } catch (e) { registraAtajo('Alt+Shift+M'); }
})();
