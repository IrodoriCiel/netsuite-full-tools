(function () {
    'use strict';

    if (window.NSFT_Dialog) return;

    const BACKDROP_CLASS = 'nsft-dlg-backdrop';

    function texto(dado, clave, respaldo) {
        if (dado) return dado;
        try {
            if (typeof chrome !== 'undefined' && chrome.i18n && chrome.i18n.getMessage) {
                const m = chrome.i18n.getMessage(clave);
                if (m) return m;
            }
        } catch (e) { }
        return respaldo;
    }

    function tema() {
        try {
            return document.documentElement.getAttribute('data-nsft-theme') === 'dark' ? 'dark' : 'light';
        } catch (e) { return 'light'; }
    }

    const ICONOS = {
        prompt: '<path d="M4 20h4L19 9l-4-4L4 16z"></path><path d="M13 7l4 4"></path>',
        confirm: '<circle cx="12" cy="12" r="9"></circle><path d="M9.5 9.5a2.5 2.5 0 0 1 4.9.7c0 1.7-2.4 2.2-2.4 3.8M12 17.2v.1"></path>',
        alert: '<circle cx="12" cy="12" r="9"></circle><path d="M12 11v6M12 7.8v.1"></path>',
        rename: '<path d="M4 20h4L19 9l-4-4L4 16z"></path><path d="M13 7l4 4"></path>',
        folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>',
        file: '<path d="M6 3h8l4 4v14H6zM14 3v4h4"></path>',
        upload: '<path d="M12 20V9M7 14l5-5 5 5M5 4h14"></path>',
        download: '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"></path>',
        save: '<path d="M5 4h11l3 3v13H5zM8 4v5h7V4M8 20v-6h8v6"></path>',
        link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"></path>'
    };
    function icono(clave) {
        const c = ICONOS[clave];
        if (!c) return null;
        const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        s.setAttribute('viewBox', '0 0 24 24');
        s.setAttribute('width', '16');
        s.setAttribute('height', '16');
        s.setAttribute('aria-hidden', 'true');
        s.setAttribute('fill', 'none');
        s.setAttribute('stroke', 'currentColor');
        s.setAttribute('stroke-width', '1.8');
        s.setAttribute('stroke-linecap', 'round');
        s.setAttribute('stroke-linejoin', 'round');
        s.innerHTML = c;
        return s;
    }

    function el(tag, clase, txt) {
        const n = document.createElement(tag);
        if (clase) n.className = clase;
        if (txt != null) n.textContent = txt;
        return n;
    }

    function cuerpo(texto_) {
        const box = el('div', 'nsft-dlg-body');
        String(texto_ == null ? '' : texto_).split(/\n{2,}/).forEach((parrafo) => {
            const p = el('p', 'nsft-dlg-p');
            parrafo.split('\n').forEach((linea, i) => {
                if (i) p.appendChild(document.createElement('br'));
                p.appendChild(document.createTextNode(linea));
            });
            box.appendChild(p);
        });
        return box;
    }

    function abrir(o, tipo) {
        return new Promise((resolve) => {
            const op = o || {};
            const th = op.theme || tema();

            const telon = el('div', 'nsft-modal-backdrop ' + BACKDROP_CLASS);
            telon.setAttribute('data-theme', th);

            const caja = el('div', 'nsft-modal nsft-modal--dialog nsft-dlg');
            caja.setAttribute('data-theme', th);
            caja.setAttribute('role', tipo === 'alert' ? 'alertdialog' : 'dialog');
            caja.setAttribute('aria-modal', 'true');

            const cab = el('div', 'nsft-modal-header nsft-dlg-head');
            const titulo = el('span', 'nsft-modal-title',
                texto(op.title, 'dlg_title_' + tipo,
                    tipo === 'alert' ? 'Notice' : (tipo === 'prompt' ? 'Enter a value' : 'Confirm')));
            if (op.danger) titulo.classList.add('is-danger');
            else {
                const ico = icono(op.icon) || icono(tipo);
                if (ico) titulo.insertBefore(ico, titulo.firstChild);
            }
            cab.appendChild(titulo);
            const acciones = el('span', 'nsft-header-actions');
            const equis = el('button', 'nsft-modal-btn-close');
            equis.type = 'button';
            equis.title = texto(null, 'sqlai_close', 'Close');
            equis.setAttribute('aria-label', equis.title);
            acciones.appendChild(equis);
            cab.appendChild(acciones);
            caja.appendChild(cab);

            const cuerpoEl = cuerpo(op.body);

            let campo = null;
            const palabra = (tipo === 'confirm' && op.word) ? String(op.word) : '';
            if (tipo === 'prompt' || palabra) {
                campo = el('input', 'nsft-dlg-input');
                campo.type = 'text';
                campo.value = (tipo === 'prompt' && op.value != null) ? String(op.value) : '';
                if (op.placeholder) campo.placeholder = op.placeholder;
                campo.spellcheck = false;
                campo.autocomplete = 'off';
                cuerpoEl.appendChild(campo);
            }
            caja.appendChild(cuerpoEl);

            const pie = el('div', 'nsft-dlg-foot');
            let cancelar = null;
            if (tipo !== 'alert') {
                cancelar = el('button', 'nsft-dlg-btn nsft-dlg-btn-cancel',
                    texto(op.cancel, 'dlg_cancel', 'Cancel'));
                cancelar.type = 'button';
                pie.appendChild(cancelar);
            }
            const aceptar = el('button',
                'nsft-dlg-btn nsft-dlg-btn-ok' + (op.danger ? ' nsft-dlg-btn-danger' : ''),
                texto(op.ok, tipo === 'alert' ? 'dlg_ok' : 'dlg_accept', tipo === 'alert' ? 'OK' : 'Accept'));
            aceptar.type = 'button';
            pie.appendChild(aceptar);
            caja.appendChild(pie);

            const vale = () => !palabra || campo.value.trim().toUpperCase() === palabra.toUpperCase();
            if (palabra) {
                aceptar.disabled = true;
                campo.addEventListener('input', () => { aceptar.disabled = !vale(); });
            }

            telon.appendChild(caja);
            document.body.appendChild(telon);

            try {
                if (window.NSFT_ModalStack && window.NSFT_ModalStack.bringToFront) {
                    window.NSFT_ModalStack.bringToFront(caja);
                }
            } catch (e) { }

            setTimeout(() => {
                try { (campo || aceptar).focus(); if (campo) campo.select(); } catch (e) { }
            }, 30);

            let cerrado = false;
            const cerrar = (valor) => {
                if (cerrado) return;
                cerrado = true;
                document.removeEventListener('keydown', teclas, true);
                telon.remove();
                resolve(valor);
            };
            const vetar = () => cerrar(tipo === 'confirm' ? false : (tipo === 'prompt' ? null : undefined));
            const pasar = () => {
                if (!vale()) return;
                cerrar(tipo === 'confirm' ? true : (tipo === 'prompt' ? campo.value : undefined));
            };

            const teclas = (e) => {
                if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); vetar(); return; }
                if (e.key === 'Enter' && (e.target === campo || e.target === aceptar || e.target === cancelar)) {
                    if (e.target === cancelar) return;
                    e.preventDefault();
                    pasar();
                }
            };
            document.addEventListener('keydown', teclas, true);

            aceptar.addEventListener('click', pasar);
            equis.addEventListener('click', vetar);
            if (cancelar) cancelar.addEventListener('click', vetar);
            telon.addEventListener('mousedown', (e) => { if (e.target === telon) vetar(); });
        });
    }

    window.NSFT_Dialog = {
        alert: (o) => abrir(o, 'alert'),
        confirm: (o) => abrir(o, 'confirm'),
        prompt: (o) => abrir(o, 'prompt'),
        disponible: true
    };
})();
