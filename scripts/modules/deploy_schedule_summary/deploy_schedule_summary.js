(function () {
    'use strict';

    const STORAGE_KEY = 'enableDeployScheduleSummary';
    const CLASE = 'nsft-dss-wrap';
    const OCULTA = 'nsft-dss-hidden';

    if (!/\/app\/common\/scripting\/(?:scriptrecord|scriptdeploy)\.nl$/.test(location.pathname)) return;

    const RB = window.NSFT_RecordButtons;
    if (RB && RB.isExcludedPage && RB.isExcludedPage()) return;

    const limpio = (s) => String(s == null ? '' : s).replace(/ /g, ' ').replace(/\s+/g, ' ').trim();
    const msg = (clave) => chrome.i18n.getMessage(clave) || '';

    function envoltorio(nombre) {
        return document.querySelector('[data-field-name="' + nombre + '"]');
    }

    function etiquetaDe(campo) {
        if (!campo) return '';
        const propia = limpio(campo.getAttribute('data-nsps-label'));
        if (propia) return propia;
        const etiqueta = campo.querySelector('.uir-label');
        return etiqueta ? limpio(etiqueta.textContent) : '';
    }

    function valorDe(campo) {
        const el = campo && campo.querySelector('.uir-field');
        return el ? limpio(el.textContent) : '';
    }

    function detalleDe(codigo, frecuencia) {
        if (!codigo) return '';
        const fila1 = document.getElementById('row1' + codigo + '_vfl');
        const fila2 = document.getElementById('row2' + codigo + '_vfl');
        if (codigo === 'DAY' && frecuencia === 'WEEK') return fila2 ? limpio(fila2.textContent).replace(/^X\s+/, '') : '';
        if (codigo === 'WEEK') {
            const partes = [];
            if (fila1) partes.push(limpio(fila1.textContent));
            if (fila2) {
                const dias = Array.from(fila2.querySelectorAll('.checkbox_read_ck'))
                    .map((c) => (c.nextElementSibling ? limpio(c.nextElementSibling.textContent) : ''))
                    .filter(Boolean);
                if (dias.length) partes.push(dias.join(', '));
            }
            return partes.filter(Boolean).join(' · ');
        }
        const elegida = [fila1, fila2].find((f) => f && /^X\s/.test(limpio(f.textContent)));
        return elegida ? limpio(elegida.textContent).replace(/^X\s+/, '') : '';
    }

    function leerFilas() {
        const tipos = Array.from(document.querySelectorAll('[data-field-name="_frequency"][data-mode="view"]'));
        const elegido = tipos.find((t) => valorDe(t) === 'X');
        if (!elegido) return null;

        const campoFrecuencia = document.querySelector('input[name="frequency"]');
        const frecuencia = campoFrecuencia ? campoFrecuencia.value : '';
        const CODIGOS = ['', 'DAY', 'WEEK', 'MONTH', 'YEAR'];
        const indice = tipos.indexOf(elegido);
        const esUnico = indice === 0;

        const filas = tipos.map((t) => ({
            etiqueta: etiquetaDe(t),
            activo: t === elegido,
            texto: t === elegido ? detalleDe(CODIGOS[indice] || '', frecuencia) : ''
        }));

        const campoTexto = (nombre) => {
            const c = envoltorio(nombre);
            const texto = valorDe(c);
            if (c && texto) filas.push({ etiqueta: etiquetaDe(c), texto: texto });
        };
        campoTexto('startdate');
        campoTexto('starttime');
        campoTexto('recurrenceminutes');
        if (esUnico) return { filas, ancla: elegido };

        campoTexto('endbydate');
        const sinFin = envoltorio('noenddate');
        if (sinFin) filas.push({ etiqueta: etiquetaDe(sinFin), activo: !!sinFin.querySelector('.checkbox_read_ck'), texto: '' });
        return { filas, ancla: elegido };
    }

    function celdaValor(fila) {
        const td = document.createElement('td');
        if (typeof fila.activo === 'boolean') {
            const chapa = document.createElement('span');
            chapa.className = 'nsft-dss-badge nsft-estado ' + (fila.activo ? 'is-on is-ok' : 'is-off');
            chapa.textContent = msg(fila.activo ? 'dss_yes' : 'dss_no');
            td.appendChild(chapa);
        }
        if (fila.texto) td.appendChild(document.createTextNode(fila.texto));
        return td;
    }

    function quitar() {
        document.querySelectorAll('.' + CLASE).forEach((n) => n.remove());
        document.querySelectorAll('.' + OCULTA).forEach((n) => n.classList.remove(OCULTA));
    }

    function pintar() {
        if (document.querySelector('.' + CLASE)) return;
        const datos = leerFilas();
        if (!datos) return;
        const original = datos.ancla.closest('table.uir-tab-fields');
        if (!original || !original.parentNode) return;

        const caja = document.createElement('div');
        caja.className = CLASE;
        caja.setAttribute('data-nsft-ui', '');

        const tabla = document.createElement('table');
        tabla.className = 'nsft-dss-table';
        const cabecera = tabla.createTHead().insertRow();
        ['dss_col_setting', 'dss_col_value'].forEach((clave) => {
            const th = document.createElement('th');
            th.textContent = msg(clave);
            cabecera.appendChild(th);
        });
        const cuerpo = tabla.createTBody();
        datos.filas.forEach((fila) => {
            const tr = cuerpo.insertRow();
            if (fila.activo) tr.className = 'is-active';
            const th = document.createElement('th');
            th.scope = 'row';
            th.textContent = fila.etiqueta;
            tr.appendChild(th);
            tr.appendChild(celdaValor(fila));
        });

        const selector = document.createElement('div');
        selector.className = 'nsft-dss-switch';
        selector.setAttribute('role', 'group');
        const botones = {};
        const mostrar = (vista) => {
            tabla.classList.toggle(OCULTA, vista !== 'table');
            original.classList.toggle(OCULTA, vista === 'table');
            Object.keys(botones).forEach((k) => {
                botones[k].classList.toggle('is-on', k === vista);
                botones[k].setAttribute('aria-pressed', String(k === vista));
            });
        };
        [['table', 'dss_view_table'], ['native', 'dss_view_native']].forEach(([vista, clave]) => {
            const b = document.createElement('button');
            b.type = 'button';
            b.textContent = msg(clave);
            b.addEventListener('click', (ev) => {
                ev.preventDefault();
                mostrar(vista);
            });
            botones[vista] = b;
            selector.appendChild(b);
        });

        caja.appendChild(selector);
        caja.appendChild(tabla);
        original.parentNode.insertBefore(caja, original);
        mostrar('table');
    }

    chrome.storage.local.get({ [STORAGE_KEY]: true }, (items) => {
        if (!items[STORAGE_KEY]) return;
        pintar();
        if (!document.querySelector('.' + CLASE)) window.addEventListener('load', pintar, { once: true });
    });

    chrome.storage.onChanged.addListener((cambios, area) => {
        if (area !== 'local' || !cambios[STORAGE_KEY]) return;
        if (cambios[STORAGE_KEY].newValue === false) quitar();
        else pintar();
    });
})();
