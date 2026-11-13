(function () {
    'use strict';

    if (window.top !== window || window.NSFT_Bubble) return;

    const DIAMETRO = 44;
    const MARGEN = 15;
    const MENU_ID = 'nsft-bubble-menu';

    const minimizada = (n) => (n && n.closest ? n.closest('.nsft-modal[data-state="minimised"]') : null);
    const boton = (raiz, tipo) => raiz.querySelector('.nsft-modal-btn-' + tipo);
    const msg = (clave, respaldo) => {
        try { return chrome.i18n.getMessage(clave) || respaldo; } catch (e) { return respaldo; }
    };

    const HUECO = 8;
    function otrasBurbujas(raiz, lado) {
        return Array.prototype.slice.call(document.querySelectorAll(
            '.nsft-modal[data-state="minimised"], #nsft-sql-modal[data-state="minimised"], #nsft-ssc-modal[data-state="minimised"]'))
            .filter((b) => b !== raiz && b.dataset.snap === lado && b.getClientRects().length > 0)
            .map((b) => b.getBoundingClientRect().top)
            .sort((a, b) => a - b);
    }
    function separar(raiz) {
        if (!raiz) return;
        const lado = raiz.dataset.snap;
        let top = raiz.getBoundingClientRect().top;
        const ocupadas = otrasBurbujas(raiz, lado);
        for (let i = 0; i <= ocupadas.length; i++) {
            const choca = ocupadas.find((o) => Math.abs(o - top) < DIAMETRO + HUECO);
            if (choca === undefined) break;
            top = choca + DIAMETRO + HUECO;
        }
        if (top > window.innerHeight - DIAMETRO - MARGEN) {
            top = window.innerHeight - DIAMETRO - MARGEN;
            for (let i = 0; i <= ocupadas.length; i++) {
                const choca = ocupadas.find((o) => Math.abs(o - top) < DIAMETRO + HUECO);
                if (choca === undefined) break;
                top = choca - DIAMETRO - HUECO;
            }
        }
        raiz.style.top = Math.max(MARGEN, top) + 'px';
    }

    const PAPELERA_ID = 'nsft-bubble-papelera';
    const RADIO_PAPELERA = 70;
    const papelera = {
        muestra() {
            let p = document.getElementById(PAPELERA_ID);
            if (!p) {
                p = document.createElement('div');
                p.id = PAPELERA_ID;
                p.className = 'nsft-bubble-papelera';
                p.setAttribute('aria-hidden', 'true');
                p.innerHTML = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>';
                document.body.appendChild(p);
            }
            requestAnimationFrame(() => p.classList.add('is-visible'));
            return p;
        },
        centro() {
            const p = document.getElementById(PAPELERA_ID);
            if (!p) return null;
            const r = p.getBoundingClientRect();
            return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
        },
        cerca(x, y) {
            const c = this.centro();
            const p = document.getElementById(PAPELERA_ID);
            const si = !!c && Math.hypot(x - c.x, y - c.y) <= RADIO_PAPELERA;
            if (p) p.classList.toggle('is-encima', si);
            return si;
        },
        oculta() {
            const p = document.getElementById(PAPELERA_ID);
            if (!p) return;
            p.classList.remove('is-visible', 'is-encima');
            setTimeout(() => { if (p.parentNode && !p.classList.contains('is-visible')) p.remove(); }, 250);
        },
        tragar(raiz, cerrar) {
            const c = this.centro();
            this.oculta();
            if (!c || window.matchMedia('(prefers-reduced-motion: reduce)').matches) { cerrar(); return; }
            raiz.style.transition = 'left 0.18s ease-in, top 0.18s ease-in, transform 0.18s ease-in, opacity 0.18s ease-in';
            raiz.style.left = (c.x - DIAMETRO / 2) + 'px';
            raiz.style.top = (c.y - DIAMETRO / 2) + 'px';
            raiz.style.transform = 'scale(0.4)';
            raiz.style.opacity = '0';
            setTimeout(() => {
                raiz.style.transition = '';
                raiz.style.transform = '';
                raiz.style.opacity = '';
                cerrar();
            }, 190);
        }
    };

    function pegarAlBorde(raiz) {
        const r = raiz.getBoundingClientRect();
        const izquierda = r.left + r.width / 2 < window.innerWidth / 2;
        raiz.style.right = 'auto';
        raiz.style.bottom = 'auto';
        raiz.style.left = (izquierda ? MARGEN : window.innerWidth - DIAMETRO - MARGEN) + 'px';
        raiz.style.top = Math.max(MARGEN, Math.min(window.innerHeight - DIAMETRO - MARGEN, r.top)) + 'px';
        raiz.dataset.snap = izquierda ? 'left' : 'right';
        separar(raiz);
    }

    function prepararMinimizada(raiz) {
        setTimeout(() => {
            if (raiz.dataset.state !== 'minimised') return;
            pegarAlBorde(raiz);
            if (raiz.dataset.nsftBubble) return;
            raiz.dataset.nsftBubble = '1';
        }, 60);
    }

    let restauradaEn = 0;

    function restaurar(raiz) {
        const b = boton(raiz, 'maximise');
        if (!b) return;
        restauradaEn = Date.now();
        raiz.title = '';
        b.click();
    }

    function iniciarArrastre(e, raiz) {
        const inicioX = e.clientX;
        const inicioY = e.clientY;
        let arrastra = false;
        let rastro = [];

        const mover = (ev) => {
            ev.preventDefault();
            if (!arrastra) {
                if (Math.abs(ev.clientX - inicioX) < 4 && Math.abs(ev.clientY - inicioY) < 4) return;
                arrastra = true;
                raiz.classList.add('nsft-dragging');
                papelera.muestra();
            }
            const ahora = performance.now();
            rastro.push({ t: ahora, x: ev.clientX, y: ev.clientY });
            rastro = rastro.filter((p) => ahora - p.t <= 100);
            raiz.classList.toggle('nsft-bubble-cierra', papelera.cerca(ev.clientX, ev.clientY));
            raiz.style.left = (ev.clientX - DIAMETRO / 2) + 'px';
            raiz.style.top = (ev.clientY - DIAMETRO / 2) + 'px';
            raiz.style.right = 'auto';
            raiz.style.bottom = 'auto';
        };

        const soltar = (ev) => {
            window.removeEventListener('mousemove', mover);
            window.removeEventListener('mouseup', soltar);
            raiz.classList.remove('nsft-dragging', 'nsft-bubble-cierra');
            if (!arrastra) { papelera.oculta(); restaurar(raiz); return; }
            if (papelera.cerca(ev.clientX, ev.clientY)) {
                papelera.tragar(raiz, () => { const b = boton(raiz, 'close'); if (b) b.click(); });
            } else {
                papelera.oculta();
                requestAnimationFrame(() => pegarAlBorde(raiz));
            }
        };

        window.addEventListener('mousemove', mover);
        window.addEventListener('mouseup', soltar);
    }

    function quitarMenu() {
        const m = document.getElementById(MENU_ID);
        if (m) m.remove();
    }

    function mostrarMenu(e, raiz) {
        quitarMenu();
        const menu = document.createElement('div');
        menu.id = MENU_ID;
        menu.className = 'nsft-w nsft-bubble-menu';
        if (raiz.getAttribute('data-theme')) menu.setAttribute('data-theme', raiz.getAttribute('data-theme'));
        const fila = (icono, texto, clase, accion) => {
            const f = document.createElement('div');
            f.className = 'nsft-bubble-menu-item' + clase;
            f.innerHTML = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icono}</svg>`;
            const s = document.createElement('span');
            s.textContent = texto;
            f.appendChild(s);
            f.addEventListener('click', (ev) => {
                ev.stopPropagation();
                quitarMenu();
                accion();
            });
            return f;
        };
        menu.appendChild(fila('<rect x="5" y="5" width="14" height="14" rx="2"></rect>',
            msg('sql_bubble_restore', 'Restore'), '', () => restaurar(raiz)));
        menu.appendChild(fila('<path d="M6 6l12 12M18 6L6 18"></path>',
            msg('sql_tab_close', 'Close'), ' is-danger', () => { const b = boton(raiz, 'close'); if (b) b.click(); }));
        document.body.appendChild(menu);
        const caja = menu.getBoundingClientRect();
        menu.style.left = Math.max(8, Math.min(window.innerWidth - caja.width - 8, e.clientX)) + 'px';
        menu.style.top = Math.max(8, Math.min(window.innerHeight - caja.height - 8, e.clientY)) + 'px';
        setTimeout(() => document.addEventListener('click', quitarMenu, { once: true }), 0);
    }

    document.addEventListener('mousedown', (e) => {
        const raiz = minimizada(e.target);
        if (!raiz) return;
        e.stopImmediatePropagation();
        if (e.button === 0) iniciarArrastre(e, raiz);
    }, true);

    document.addEventListener('contextmenu', (e) => {
        const raiz = minimizada(e.target);
        if (!raiz) return;
        e.preventDefault();
        e.stopImmediatePropagation();
        mostrarMenu(e, raiz);
    }, true);

    document.addEventListener('dblclick', (e) => {
        if (minimizada(e.target) || Date.now() - restauradaEn < 500) {
            if (e.target.closest && e.target.closest('.nsft-modal')) e.stopImmediatePropagation();
            return;
        }
        const raiz = e.target.closest && e.target.closest('.nsft-modal');
        if (raiz && e.target.closest('.nsft-modal-header')) prepararMinimizada(raiz);
    }, true);

    document.addEventListener('click', (e) => {
        const b = e.target.closest && e.target.closest('.nsft-modal-btn-minimise');
        if (!b) return;
        const raiz = b.closest('.nsft-modal');
        if (raiz) prepararMinimizada(raiz);
    }, true);

    window.NSFT_Bubble = { disponible: true, separar, papelera };
})();
