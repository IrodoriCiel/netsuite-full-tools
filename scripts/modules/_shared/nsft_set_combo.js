(function () {
    'use strict';

    if (window.NSFT_SetCombo) return;

    const CHEVRON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" '
        + 'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"></path></svg>';

    let abierta = null;

    function cierra(elegido) {
        if (!abierta) return;
        const a = abierta;
        abierta = null;
        a.lista.remove();
        a.boton.classList.remove('is-open');
        a.boton.setAttribute('aria-expanded', 'false');
        document.removeEventListener('mousedown', a.fuera, true);
        document.removeEventListener('keydown', a.tecla, true);
        if (!elegido && a.op.fin) a.op.fin();
    }

    function abre(select, boton, op, pinta) {
        cierra();
        const host = boton.closest('.nsft-set-raiz');
        if (!host) return;
        const lista = document.createElement('div');
        lista.className = 'nsft-set-lista';
        lista.setAttribute('role', 'listbox');

        Array.from(select.options).forEach((o) => {
            const b = document.createElement('button');
            b.type = 'button';
            b.className = 'nsft-set-lista-i';
            b.setAttribute('role', 'option');
            const puesto = o.value === select.value;
            b.setAttribute('aria-selected', String(puesto));
            const tic = document.createElement('span');
            tic.className = 'nsft-set-lista-tic';
            tic.setAttribute('aria-hidden', 'true');
            tic.textContent = puesto ? '✓' : '';
            const et = document.createElement('span');
            et.textContent = o.textContent;
            b.append(tic, et);
            if (op.previa) {
                b.addEventListener('mouseenter', () => op.previa(o.value));
                b.addEventListener('focus', () => op.previa(o.value));
            }
            b.addEventListener('click', (ev) => {
                ev.stopPropagation();
                if (op.confirma) op.confirma(o.value);
                select.value = o.value;
                pinta();
                cierra(true);
                select.dispatchEvent(new Event('change', { bubbles: true }));
            });
            lista.appendChild(b);
        });
        if (op.fin) lista.addEventListener('mouseleave', () => op.fin());

        host.appendChild(lista);
        const rHost = host.getBoundingClientRect();
        const rBoton = boton.getBoundingClientRect();
        lista.style.left = (rBoton.left - rHost.left) + 'px';
        lista.style.minWidth = rBoton.width + 'px';
        const arriba = rBoton.bottom - rHost.top + 2;
        lista.style.top = Math.max(8, Math.min(arriba, host.clientHeight - lista.offsetHeight - 8)) + 'px';

        const fuera = (ev) => {
            if (lista.contains(ev.target) || boton.contains(ev.target)) return;
            ev.stopPropagation();
            cierra();
        };
        const tecla = (ev) => {
            if (ev.key !== 'Escape') return;
            ev.stopPropagation();
            ev.preventDefault();
            cierra();
        };
        document.addEventListener('mousedown', fuera, true);
        document.addEventListener('keydown', tecla, true);
        abierta = { boton, lista, op, fuera, tecla };
        boton.classList.add('is-open');
        boton.setAttribute('aria-expanded', 'true');
    }

    function convierte(select, opciones) {
        if (!select || select.dataset.nsftCombo) return;
        select.dataset.nsftCombo = '1';
        const op = opciones || {};
        const boton = document.createElement('button');
        boton.type = 'button';
        boton.className = 'nsft-set-combo';
        boton.setAttribute('aria-haspopup', 'listbox');
        boton.setAttribute('aria-expanded', 'false');
        const texto = document.createElement('span');
        texto.className = 'nsft-set-combo-t';
        boton.appendChild(texto);
        boton.insertAdjacentHTML('beforeend', CHEVRON);
        select.hidden = true;
        select.after(boton);

        const pinta = () => {
            const o = select.options[select.selectedIndex];
            texto.textContent = o ? o.textContent : '';
        };
        boton.nsftPinta = pinta;
        pinta();
        boton.addEventListener('click', (ev) => {
            ev.stopPropagation();
            if (abierta && abierta.boton === boton) { cierra(); return; }
            abre(select, boton, op, pinta);
        });
    }

    function refresca(raiz) {
        if (!raiz) return;
        raiz.querySelectorAll('.nsft-set-combo').forEach((b) => { if (b.nsftPinta) b.nsftPinta(); });
    }

    window.NSFT_SetCombo = { convierte, refresca };
})();
