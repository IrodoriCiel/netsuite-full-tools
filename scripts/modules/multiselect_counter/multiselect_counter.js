(function () {
    'use strict';
    const STORAGE_KEY = 'enableMultiselectCounterBeta';
    const APPLIED_ATTR = 'data-nsft-msc-applied';
    const WIRED_ATTR = 'data-nsft-msc-wired';
    const ASK_ATTR = 'data-nsft-msc-ask';
    const COUNTER_CLASS = 'nsft-msc-counter';

    const TOTAL_DESCONOCIDO = '—';
    const PENSANDO = '…';

    const _totales = new Map();

    const SEL_CLASICO = 'span.uir-multiselect[data-fieldtype="multiselect"]';
    const SEL_BAJO_DEMANDA = 'span[data-fieldtype="popupselectmulti"]';

    const SEPARADOR_IDS = new RegExp('[' + String.fromCharCode(5, 10, 13) + ']+');

    let enabled = false;
    let _inited = false;
    let _unsub = null;
    const _observers = [];
    const _listeners = [];
    const _totalCache = new WeakMap();

    function esBajoDemanda(wrapper) {
        return wrapper.getAttribute('data-fieldtype') === 'popupselectmulti';
    }

    function msg(key, subs) {
        try { return chrome.i18n.getMessage(key, subs) || ''; } catch (e) { return ''; }
    }

    function miles(n) {
        try { return Number(n).toLocaleString(); } catch (e) { return String(n); }
    }

    function nombreDeCampo(wrapper) {
        const id = wrapper.id || '';
        return id.endsWith('_fs') ? id.slice(0, -3) : '';
    }

    let _puente = false;
    let _puenteListo = false;
    const _cola = [];

    function ensurePuente() {
        if (_puente) return;
        _puente = true;
        try {
            if (window.NSFT_SuiteQLRest && window.NSFT_SuiteQLRest.ensureTransport) {
                window.NSFT_SuiteQLRest.ensureTransport();
            }
            const s = document.createElement('script');
            s.id = 'nsft-msc-fetcher';
            s.src = chrome.runtime.getURL('scripts/modules/multiselect_counter/multiselect_counter_fetcher.js');
            s.async = false;
            s.onload = function () { this.remove(); _puenteListo = true; vaciarCola(); };
            s.onerror = function () { this.remove(); fallarTodo(); };
            (document.head || document.documentElement).appendChild(s);
        } catch (e) { _puente = false; fallarTodo(); }
    }

    function vaciarCola() {
        while (_cola.length) enviar(_cola.shift());
    }

    function fallarTodo() {
        const pendientes = _cola.splice(0);
        _totales.forEach(function (v, k) { if (v === null) pendientes.push(k); });
        pendientes.forEach(marcarFallo);
    }

    function marcarFallo(nombre) {
        if (_totales.get(nombre) !== null && _totales.has(nombre)) return;
        _totales.set(nombre, false);
        const span = document.getElementById(nombre + '_fs');
        if (span) updateCounter(span);
    }

    function enviar(nombre) {
        try {
            window.postMessage({ dest: 'fetcher_msc', type: 'countOptions', payload: { fieldName: nombre } }, '*');
        } catch (e) { marcarFallo(nombre); return; }
        setTimeout(function () { if (_totales.get(nombre) === null) marcarFallo(nombre); }, 20000);
    }

    window.addEventListener('message', function (ev) {
        if (ev.source !== window) return;
        const d = ev.data;
        if (!d || d.dest !== 'extension_msc' || d.type !== 'countOptions') return;
        const p = d.payload || {};
        if (!p.fieldName) return;
        _totales.set(p.fieldName, (typeof p.total === 'number') ? p.total : false);
        const span = document.getElementById(p.fieldName + '_fs');
        if (span) updateCounter(span);
    });

    function pedirTotal(wrapper) {
        const nombre = nombreDeCampo(wrapper);
        if (!nombre || _totales.has(nombre)) return;
        _totales.set(nombre, null);
        updateCounter(wrapper);
        if (_puenteListo) { enviar(nombre); return; }
        _cola.push(nombre);
        ensurePuente();
    }

    function isApplicablePage() {
        try {
            if (window.NSFT_RecordButtons && NSFT_RecordButtons.isExcludedPage && NSFT_RecordButtons.isExcludedPage()) return false;
        } catch (e) { }
        return true;
    }

    chrome.storage.local.get({ [STORAGE_KEY]: true }, (items) => {
        enabled = !!items[STORAGE_KEY];
        if (enabled) init();
    });

    chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== 'local' || !changes[STORAGE_KEY]) return;
        enabled = !!changes[STORAGE_KEY].newValue;
        if (enabled) init();
        else teardown();
    });

    function init() {
        if (!isApplicablePage()) return;
        if (_inited) { runOnce(); return; }
        _inited = true;
        runOnce();
        if (window.NSFT_Observer && typeof window.NSFT_Observer.subscribe === 'function') {
            _unsub = window.NSFT_Observer.subscribe(runOnce, { throttle: 300 });
        } else {
            const mo = new MutationObserver(runOnce);
            mo.observe(document.body, { childList: true, subtree: true });
            _unsub = () => mo.disconnect();
        }
    }

    function teardown() {
        if (_unsub) { _unsub(); _unsub = null; }
        _inited = false;
        _observers.forEach(mo => mo.disconnect());
        _observers.length = 0;
        _listeners.forEach(l => l.el.removeEventListener('change', l.fn, true));
        _listeners.length = 0;
        document.querySelectorAll(`.${COUNTER_CLASS}`).forEach(el => el.remove());
        document.querySelectorAll(`[${APPLIED_ATTR}]`).forEach(el => el.removeAttribute(APPLIED_ATTR));
        document.querySelectorAll(`[${WIRED_ATTR}]`).forEach(el => el.removeAttribute(WIRED_ATTR));
    }

    function runOnce() {
        if (!enabled) return;
        document.querySelectorAll(SEL_CLASICO).forEach(hookMultiselect);
        document.querySelectorAll(SEL_BAJO_DEMANDA).forEach(hookMultiselect);
    }

    function hookMultiselect(wrapper) {
        if (wrapper.getAttribute(APPLIED_ATTR) === 'true') {
            updateCounter(wrapper);
            return;
        }

        const labelSpan = findLabelSpan(wrapper);
        if (!labelSpan) return;

        if (!labelSpan.querySelector(`.${COUNTER_CLASS}`)) {
            const counter = document.createElement('span');
            counter.className = COUNTER_CLASS;
            insertAfterLabelText(labelSpan, counter);
        }

        wrapper.setAttribute(APPLIED_ATTR, 'true');
        conectarVigilancia(wrapper);
        updateCounter(wrapper);
    }

    function conectarVigilancia(wrapper) {
        if (esBajoDemanda(wrapper)) {
            const raiz = wrapper.closest('.uir-field-wrapper') || wrapper;
            if (raiz.getAttribute(WIRED_ATTR) === 'true') return;
            raiz.setAttribute(WIRED_ATTR, 'true');
            const fn = () => updateCounter(wrapper);
            raiz.addEventListener('change', fn, true);
            _listeners.push({ el: raiz, fn });

            pedirTotal(wrapper);
            return;
        }

        const listbox = wrapper.querySelector('.dropdownDiv');
        if (!listbox || listbox.getAttribute(WIRED_ATTR) === 'true') return;
        listbox.setAttribute(WIRED_ATTR, 'true');
        const mo = new MutationObserver(() => updateCounter(wrapper));
        mo.observe(listbox, {
            subtree: true,
            attributes: true,
            attributeFilter: ['class', 'aria-selected']
        });
        _observers.push(mo);
    }

    function updateCounter(wrapper) {
        const labelSpan = findLabelSpan(wrapper);
        const counter = labelSpan && labelSpan.querySelector(`.${COUNTER_CLASS}`);
        if (!counter) return;

        if (esBajoDemanda(wrapper)) {
            const n = getSelectedOnDemand(wrapper);
            const nombre = nombreDeCampo(wrapper);
            const guardado = _totales.get(nombre);

            let cola, titulo;
            if (typeof guardado === 'number') {
                cola = miles(guardado);
                titulo = msg('msc_counted_title');
            } else if (guardado === false) {
                cola = TOTAL_DESCONOCIDO;
                titulo = msg('msc_count_failed');
            } else {
                cola = PENSANDO;
                titulo = msg('msc_counting');
            }

            escribir(counter, `${n} / ${cola}`);
            counter.title = titulo;
            counter.classList.toggle('has-selection', n > 0);

            const sePuedePedir = guardado === false;
            counter.classList.toggle('is-askable', sePuedePedir);

            if (sePuedePedir) counter.setAttribute('data-nsft-own-click', '1');
            else counter.removeAttribute('data-nsft-own-click');
            if (sePuedePedir && !counter.getAttribute(ASK_ATTR)) {
                counter.setAttribute(ASK_ATTR, 'true');
                counter.addEventListener('click', function (ev) {
                    ev.preventDefault();
                    ev.stopPropagation();
                    _totales.delete(nombre);
                    pedirTotal(wrapper);
                });
            }
            return;
        }

        const total = getTotal(wrapper);
        const selected = getSelectedCount(wrapper);

        if (total === 0) {
            escribir(counter, '');
            counter.classList.remove('has-selection');
            return;
        }

        escribir(counter, `${selected} / ${total}`);
        counter.classList.toggle('has-selection', selected > 0);
    }

    function escribir(counter, texto) {
        if (counter.textContent !== texto) counter.textContent = texto;
    }

    function getTotal(wrapper) {
        const filas = wrapper.querySelectorAll('.dropdownDiv td.dropdownSelected, .dropdownDiv td.dropdownNotSelected').length;
        if (filas > 0) return filas;

        const dropdown = wrapper.querySelector('.ns-multi-dropdown[data-options]');
        if (dropdown) {
            const raw = dropdown.getAttribute('data-options') || '[]';
            const cached = _totalCache.get(wrapper);
            if (cached && cached.raw === raw) return cached.total;
            try {
                const parsed = JSON.parse(raw);
                if (Array.isArray(parsed)) {
                    _totalCache.set(wrapper, { raw, total: parsed.length });
                    return parsed.length;
                }
            } catch (e) { }
        }
        return 0;
    }

    function getSelectedCount(wrapper) {
        return wrapper.querySelectorAll('.dropdownDiv td.dropdownSelected').length;
    }

    function getSelectedOnDemand(wrapper) {
        let oculto = wrapper.id ? document.getElementById('hddn_' + wrapper.id) : null;
        if (!oculto) {
            const fieldWrapper = wrapper.closest('.uir-field-wrapper');
            oculto = fieldWrapper ? fieldWrapper.querySelector('input[type="hidden"][id^="hddn_"]') : null;
        }
        if (!oculto) return 0;
        const raw = (oculto.value || '').trim();
        if (!raw) return 0;
        return raw.split(SEPARADOR_IDS).filter(Boolean).length;
    }

    function findLabelSpan(wrapper) {
        const fieldWrapper = wrapper.closest('.uir-field-wrapper');
        if (!fieldWrapper) return null;
        return fieldWrapper.querySelector('.uir-label-span');
    }

    function insertAfterLabelText(labelSpan, counter) {
        const anchor = labelSpan.querySelector(':scope > a');
        if (anchor && anchor.parentNode === labelSpan) {
            anchor.insertAdjacentElement('afterend', counter);
            return;
        }
        labelSpan.insertBefore(counter, labelSpan.firstChild);
    }
})();
