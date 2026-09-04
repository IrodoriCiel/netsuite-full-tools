(function () {
    'use strict';

    const STORAGE_KEY = 'enableSearchFiltersBatch';

    const PAGINAS = /\/app\/common\/search\/(savedsearchresults|adhocsearchresults)\.nl$/i;

    if (!PAGINAS.test(window.location.pathname)) return;

    const BTN_ID = 'nsft-sfb-aplicar';
    const ON_ATTR = 'data-nsft-sfb-on';
    const GO_ATTR = 'data-nsft-sfb-go';
    const HELD_ATTR = 'data-nsft-sfb-held';

    const RE_ARGS = /appendFormDataToURL\s*\(([^)]*)\)/;

    const i18n = (k, f) => (chrome.i18n.getMessage(k) || f);

    let _permitido = null;
    let _args = '';
    let _oido = null;
    let _unsub = null;

    document.documentElement.setAttribute(ON_ATTR, '1');

    chrome.storage.local.get({ [STORAGE_KEY]: true }, (items) => {
        if (items[STORAGE_KEY] === false) {
            _permitido = false;
            desarma();
            return;
        }
        _permitido = true;
        monta();
    });

    const TEMA_RE = /^(colorTheme|enableColorThemes|enableDarkMode|nsftTheme)/;

    chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== 'local' && area !== 'sync') return;
        if (changes[STORAGE_KEY] && area === 'local') {
            if (changes[STORAGE_KEY].newValue !== false) {
                _permitido = true;
                document.documentElement.setAttribute(ON_ATTR, '1');
                monta();
            } else {
                _permitido = false;
                desarma();
            }
            return;
        }
        if (Object.keys(changes).some((k) => TEMA_RE.test(k))) reviste();
    });

    let _revisteTimer = null;
    function reviste() {
        clearTimeout(_revisteTimer);
        _revisteTimer = setTimeout(() => {
            const btn = document.getElementById(BTN_ID);
            if (!btn) return;
            _vestido = false;
            btn.style.background = '';
            btn.style.color = '';
            btn.style.border = '';
            btn.style.borderRadius = '';
            visteComoNativo(btn);
        }, 150);
    }

    function desarma() {
        document.documentElement.removeAttribute(ON_ATTR);
        document.documentElement.removeAttribute(HELD_ATTR);
        const fila = document.querySelector('.nsft-sfb-fila');
        if (fila && fila.parentNode) fila.parentNode.removeChild(fila);
        if (_oido) { try { _oido.disconnect(); } catch (e) { } _oido = null; }
        if (_unsub) { try { _unsub(); } catch (e) { } _unsub = null; }
    }


    function monta() {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', pintaBoton, { once: true });
        } else {
            pintaBoton();
        }
        if (window.NSFT_Observer && !_unsub) {
            _unsub = window.NSFT_Observer.subscribe(pintaBoton, { throttle: 400 });
        }
        vigilaRetenciones();
    }

    function pintaBoton() {
        if (_permitido === false) return;
        const ya = document.getElementById(BTN_ID);
        if (ya) {
            if (!_vestido) visteComoNativo(ya);
            return;
        }
        const panel = document.querySelector('.uir-filters');
        const cuerpo = panel && panel.querySelector('.uir-filters-body');
        if (!cuerpo) return;

        if (!_args) {
            const conNav = cuerpo.querySelector('[onchange*="appendFormDataToURL"], [onclick*="appendFormDataToURL"]');
            if (!conNav) return;
            const attr = (conNav.getAttribute('onchange') || '') + (conNav.getAttribute('onclick') || '');
            const m = attr.match(RE_ARGS);
            if (!m) return;
            _args = m[1];
        }

        const fila = document.createElement('div');
        fila.className = 'nsft-sfb-fila uir-field-wrapper';
        const btn = document.createElement('button');
        btn.id = BTN_ID;
        btn.type = 'button';
        btn.className = 'nsft-sfb-boton';
        btn.setAttribute('data-nsft-ui', '');
        btn.textContent = i18n('sfb_apply', 'Aplicar filtros');
        btn.title = i18n('sfb_apply_title', 'Los filtros ya no recargan al cambiar: ponlos todos y aplícalos aquí de una vez');
        btn.setAttribute('onclick',
            "document.documentElement.setAttribute('" + GO_ATTR + "','1');"
            + 'document.location.replace(appendFormDataToURL(' + _args + '));');
        btn.classList.add('is-sin-traje');
        fila.appendChild(btn);
        cuerpo.appendChild(fila);
        vistePronto(btn);
    }

    function vistePronto(btn) {
        let vueltas = 0;
        const raf = window.requestAnimationFrame || ((cb) => setTimeout(cb, 16));
        const intenta = () => {
            if (visteComoNativo(btn) || ++vueltas > 90) {
                btn.classList.remove('is-sin-traje');
                return;
            }
            raf(intenta);
        };
        intenta();
    }

    let _vestido = false;

    function visteComoNativo(btn) {
        if (_vestido) return true;

        const copia = (cs) => {
            try {
                btn.style.background = cs.background;
                btn.style.color = cs.color;
                btn.style.border = cs.borderTopWidth + ' ' + cs.borderTopStyle + ' ' + cs.borderTopColor;
                btn.style.borderRadius = cs.borderRadius;
                _vestido = true;
                return true;
            } catch (e) { return false; }
        };

        const lista = document.querySelectorAll(
            'input.rndbuttoninpt, .uir-button input, input[type="button"], input[type="submit"], button, a[role="button"]');
        for (let i = 0; i < lista.length && i < 40; i++) {
            const el = lista[i];
            if (el.id === BTN_ID) continue;
            if (!el.offsetParent) continue;
            let cs;
            try { cs = getComputedStyle(el); } catch (e) { continue; }
            const m = String(cs.backgroundColor || '').match(/rgba?\((\d+)\D+(\d+)\D+(\d+)/);
            if (!m) continue;
            const r = +m[1], g = +m[2], b = +m[3];
            if (Math.max(r, g, b) - Math.min(r, g, b) < 16) continue;
            if (copia(cs)) return true;
        }

        const candidatos = ['#secondarysubmitter input', '#submitter', 'input.rndbuttoninpt', '.uir-button input'];
        for (let i = 0; i < candidatos.length; i++) {
            const nativo = document.querySelector(candidatos[i]);
            if (!nativo) continue;
            let cs;
            try { cs = getComputedStyle(nativo); } catch (e) { continue; }
            const conColor = cs.backgroundColor && cs.backgroundColor !== 'rgba(0, 0, 0, 0)' && cs.backgroundColor !== 'transparent';
            const conImagen = cs.backgroundImage && cs.backgroundImage !== 'none';
            if (!conColor && !conImagen) continue;
            if (copia(cs)) return true;
        }
        return false;
    }

    function vigilaRetenciones() {
        if (_oido || typeof MutationObserver === 'undefined') return;
        _oido = new MutationObserver(() => {
            if (!document.documentElement.hasAttribute(HELD_ATTR)) return;
            const btn = document.getElementById(BTN_ID);
            if (btn) btn.classList.add('is-pendiente');
        });
        _oido.observe(document.documentElement, { attributes: true, attributeFilter: [HELD_ATTR] });
    }
})();
