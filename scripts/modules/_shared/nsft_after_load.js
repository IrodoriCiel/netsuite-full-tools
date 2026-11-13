(function () {
    'use strict';
    if (window.NSFT_AfterLoad) return;

    const PLAZO_MS = 3000;
    const cola = [];
    const enCola = new Map();
    let libre = document.readyState === 'complete';

    const padre = () => document.head || document.documentElement;
    const clave = (el) => (el.id ? '#' + el.id : '');

    function flush() {
        if (libre) return;
        libre = true;
        enCola.clear();
        cola.splice(0).forEach((el) => {
            try { padre().appendChild(el); } catch (e) { }
        });
    }

    function append(el) {
        if (libre || !el) { padre().appendChild(el); return el; }
        const k = clave(el);
        const previo = k && enCola.get(k);
        if (previo) {
            ['load', 'error'].forEach((tipo) => previo.addEventListener(tipo, () => {
                try { el.dispatchEvent(new Event(tipo)); } catch (e) { }
            }, { once: true }));
            return el;
        }
        if (k) enCola.set(k, el);
        cola.push(el);
        return el;
    }

    if (!libre) {
        window.addEventListener('load', () => setTimeout(flush, 0), { once: true });
        const conPlazo = () => setTimeout(flush, PLAZO_MS);
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', conPlazo, { once: true });
        } else {
            conPlazo();
        }
    }

    window.NSFT_AfterLoad = Object.freeze({
        append,
        flush,
        get pending() { return cola.length; }
    });
})();
