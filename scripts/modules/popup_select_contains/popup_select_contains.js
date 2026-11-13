(function () {
    'use strict';

    const STORAGE_KEY = 'enablePopupSelectContains';
    if (!/^\/app\//.test(window.location.pathname)) return;
    if (window.NSFT_RecordButtons && window.NSFT_RecordButtons.isExcludedPage && window.NSFT_RecordButtons.isExcludedPage()) return;

    let activo = false;
    const ORIG = 'nsftPctOrig';

    const esCampo = (el) => el instanceof HTMLInputElement
        && /_display$/.test(el.id || '')
        && !!el.closest('.uir-select-input-container');

    function campoDe(el) {
        const caja = el.closest('.uir-field-wrapper, .uir-field, td');
        const inp = caja && caja.querySelector('.uir-select-input-container input[id$="_display"]');
        return esCampo(inp) ? inp : null;
    }

    function antepone(inp) {
        const v = inp.value || '';
        const s = v.trim();
        if (!s || s[0] === '%') return;
        if (inp.dataset[ORIG] !== undefined && v === inp.dataset[ORIG]) return;
        inp.value = '%' + s;
    }

    function alEntrar(e) {
        const inp = e.target;
        if (!activo || !esCampo(inp)) return;
        inp.dataset[ORIG] = inp.value || '';
        if (!(inp.value || '').trim()) {
            inp.value = '%';
            try { inp.setSelectionRange(1, 1); } catch (er) { }
        }
    }

    function alTeclear(e) {
        if (!activo || (e.key !== 'Enter' && e.key !== 'Tab')) return;
        if (esCampo(e.target)) antepone(e.target);
    }

    function alPulsar(e) {
        if (!activo) return;
        const t = e.target.closest && e.target.closest('.uir-field-popup-arrow-image, .fwpopupsel, [onclick*="PopupSearch"], [onclick*="List"]');
        if (!t) return;
        const inp = campoDe(t);
        if (inp) antepone(inp);
    }

    function alSalir(e) {
        const inp = e.target;
        if (!esCampo(inp)) return;
        if (activo && (inp.value || '').trim() === '%') inp.value = '';
        delete inp.dataset[ORIG];
    }

    function enciende(on) {
        if (on === activo) return;
        activo = on;
        const m = on ? 'addEventListener' : 'removeEventListener';
        document[m]('focusin', alEntrar, true);
        document[m]('keydown', alTeclear, true);
        document[m]('mousedown', alPulsar, true);
        document[m]('focusout', alSalir, true);
        if (!on && esCampo(document.activeElement) && document.activeElement.value === '%') document.activeElement.value = '';
    }

    chrome.storage.local.get({ [STORAGE_KEY]: true }, (it) => enciende(!!it[STORAGE_KEY]));
    chrome.storage.onChanged.addListener((ch, area) => {
        if (area === 'local' && ch[STORAGE_KEY]) enciende(!!ch[STORAGE_KEY].newValue);
    });
})();
