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

            const cab = el('div', 'nsft-modal-header');
            const titulo = el('span', 'nsft-modal-title',
                texto(op.title, 'dlg_title_' + tipo,
                    tipo === 'alert' ? 'Notice' : (tipo === 'prompt' ? 'Enter a value' : 'Confirm')));
            cab.appendChild(titulo);
            caja.appendChild(cab);
            caja.appendChild(el('div', 'nsft-modal-header-line'));

            const cuerpoEl = cuerpo(op.body);

            let campo = null;
            if (tipo === 'prompt') {
                campo = el('input', 'nsft-dlg-input');
                campo.type = 'text';
                campo.value = op.value == null ? '' : String(op.value);
                if (op.placeholder) campo.placeholder = op.placeholder;
                campo.spellcheck = false;
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
            const pasar = () => cerrar(tipo === 'confirm' ? true : (tipo === 'prompt' ? campo.value : undefined));

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
