(function () {
    'use strict';

    const STORAGE_KEY = 'enableLiveMode';
    const KEY_INTERVAL = 'liveModeInterval';
    const KEY_STATUS = 'liveModeStatusAutoStart';
    const KEY_SUBLISTS = 'liveModeSublists';
    const KEY_AUTOSTART = 'liveModeAutoStart';
    const MIN_INTERVAL = 1;
    const MAX_INTERVAL = 300;
    const INTERVALO_FABRICA = 3;
    const DESTELLO_MS = 1200;
    const MAX_FALLOS = 3;

    const RUTA = location.pathname.replace(/\/{2,}/g, '/');
    if (!/^\/app\//.test(RUTA)) return;
    const FUERA = [
        '/app/bundler/previewbundleupdate.nl',
        '/app/reporting/quickreports.nl'
    ];
    if (FUERA.indexOf(RUTA) >= 0) return;
    try {
        if (window.NSFT_RecordButtons && NSFT_RecordButtons.isExcludedPage && NSFT_RecordButtons.isExcludedPage()) return;
    } catch (e) { }

    const ESTADO = [
        '/app/common/scripting/scriptstatus.nl',
        '/app/common/scripting/mapreducescriptstatus.nl',
        '/app/site/ignite/igniteindexerstatus.nl',
        '/app/external/xml/upload/uploadlog.nl',
        '/app/common/entity/duplicatemanagement/dupejob.nl',
        '/app/common/search/backend/searchresultsarchive.nl'
    ];

    const FETCHER_SUBLISTA = 'fetcher_refreshsublist';
    const RESPUESTA_SUBLISTA = 'extension_refreshsublist';

    const SPINNER_SVG = '<svg class="nsft-tb-spinner" width="14" height="14" viewBox="0 0 16 16"'
        + ' fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true">'
        + '<circle cx="8" cy="8" r="6" stroke-dasharray="28 12"></circle></svg>';
    const PAUSE_SVG = '<svg class="nsft-tb-pause" width="14" height="14" viewBox="0 0 16 16"'
        + ' fill="currentColor" aria-hidden="true">'
        + '<rect x="4.6" y="3.8" width="2.4" height="8.4" rx="1.1"></rect>'
        + '<rect x="9" y="3.8" width="2.4" height="8.4" rx="1.1"></rect></svg>';

    const t = (k, f, sus) => {
        try { return chrome.i18n.getMessage(k, sus) || f; } catch (e) { return f; }
    };

    let _intervalo = INTERVALO_FABRICA;
    let _sublistas = true;
    let _autoStart = false;
    let _activo = false;
    let _unsub = null;
    let _seq = 0;
    const _vivos = [];
    const _porMaquina = new Map();
    const _peticiones = new Map();

    chrome.storage.local.get({
        [STORAGE_KEY]: true, [KEY_INTERVAL]: INTERVALO_FABRICA, [KEY_STATUS]: true,
        [KEY_SUBLISTS]: true, [KEY_AUTOSTART]: false
    }, (it) => {
        if (!it[STORAGE_KEY]) return;
        _intervalo = acota(it[KEY_INTERVAL]);
        _sublistas = !!it[KEY_SUBLISTS];
        _autoStart = !!it[KEY_AUTOSTART];
        activa(_autoStart || (esDeEstado() && !!it[KEY_STATUS]));
    });

    function esDeEstado() {
        if (ESTADO.indexOf(RUTA) >= 0) return true;
        return RUTA === '/app/bundler/bundlelist.nl'
            && !!document.querySelector('.uir-list-row-cell > .smalltextred:not(:has(img))');
    }

    chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== 'local') return;
        if (changes[STORAGE_KEY]) {
            if (changes[STORAGE_KEY].newValue === false) desactiva();
            else if (changes[STORAGE_KEY].newValue === true && !_activo) activa(false);
        }
        if (changes[KEY_INTERVAL]) {
            _intervalo = acota(changes[KEY_INTERVAL].newValue);
            _vivos.forEach((v) => {
                v.restante = _intervalo;
                ponTitulo(v);
                pintaCampo(v);
            });
        }
        if (changes[KEY_AUTOSTART]) _autoStart = changes[KEY_AUTOSTART].newValue === true;
        if (changes[KEY_SUBLISTS]) {
            _sublistas = changes[KEY_SUBLISTS].newValue !== false;
            if (!_sublistas) quitaSublistas();
            else if (_activo) buscaSublistas();
        }
    });

    window.addEventListener('pagehide', () => _vivos.forEach(para));
    window.addEventListener('message', onRespuestaSublista);

    function acota(v) {
        return Math.min(MAX_INTERVAL, Math.max(MIN_INTERVAL, parseInt(v, 10) || INTERVALO_FABRICA));
    }

    function activa(encenderPagina) {
        _activo = true;
        aseguraFetcher();
        montaPagina(encenderPagina);
        const busca = () => { buscaLog(); if (_sublistas) buscaSublistas(); };
        if (window.NSFT_Observer && typeof window.NSFT_Observer.subscribe === 'function') {
            _unsub = window.NSFT_Observer.subscribe(busca, { throttle: 300, immediate: true });
        } else {
            busca();
        }
    }

    function desactiva() {
        _activo = false;
        if (_unsub) { _unsub(); _unsub = null; }
        _vivos.slice().forEach(quita);
        _porMaquina.clear();
        _log = null;
    }

    function pastilla() {
        const grupo = document.createElement('div');
        grupo.className = 'nsft-tb-group nsft-llm';

        const sw = document.createElement('label');
        sw.className = 'nsft-tb-switch';
        const chk = document.createElement('input');
        chk.type = 'checkbox';
        const slider = document.createElement('span');
        slider.className = 'nsft-tb-slider';
        sw.append(chk, slider);

        const label = document.createElement('span');
        label.className = 'nsft-tb-label';
        label.textContent = t('liveMode', 'Live');

        const divisor = document.createElement('span');
        divisor.className = 'nsft-tb-divider';

        const campo = document.createElement('span');
        campo.style.display = 'inline-flex';
        campo.style.alignItems = 'center';
        campo.style.gap = '5px';
        const input = document.createElement('input');
        input.type = 'number';
        input.className = 'nsft-tb-num nsft-llm-input';
        input.min = String(MIN_INTERVAL);
        input.max = String(MAX_INTERVAL);
        input.step = '1';
        input.value = String(_intervalo);
        const unidad = document.createElement('span');
        unidad.className = 'nsft-tb-unit';
        unidad.textContent = t('secondsAbbr', 's');
        campo.append(input, unidad);

        const slot = document.createElement('span');
        slot.className = 'nsft-tb-spinslot';
        slot.innerHTML = SPINNER_SVG + PAUSE_SVG;

        grupo.append(sw, label, divisor, campo, slot);

        const v = {
            grupo, chk, input, slot, raiz: null, reloj: null, restante: _intervalo,
            corriendo: false, refrescando: false, fallos: 0, alcance: null, refresca: null,
            suelta: null
        };
        chk.addEventListener('change', () => (chk.checked ? arranca(v) : para(v)));
        input.addEventListener('change', () => {
            const n = acota(input.value);
            input.value = String(n);
            _intervalo = n;
            chrome.storage.local.set({ [KEY_INTERVAL]: n });
        });
        input.addEventListener('focus', () => { if (v.corriendo) input.value = String(_intervalo); });
        input.addEventListener('blur', () => pintaCampo(v));
        _vivos.push(v);
        return v;
    }

    function pintaCampo(v) {
        if (document.activeElement === v.input) return;
        v.input.value = String(v.corriendo ? Math.max(0, v.restante) : _intervalo);
        v.input.classList.toggle('is-counting', v.corriendo);
    }

    function ponTitulo(v, error) {
        v.grupo.title = error
            ? t('llm_error', 'The list could not be updated; live mode has stopped.')
            : t('llm_title', 'Updates the list every $1 s without reloading the page', [String(_intervalo)]);
        v.grupo.classList.toggle('is-error', !!error);
    }

    function quita(v) {
        para(v);
        if (v.raiz) v.raiz.remove();
        const i = _vivos.indexOf(v);
        if (i >= 0) _vivos.splice(i, 1);
    }

    function arranca(v) {
        v.corriendo = true;
        v.fallos = 0;
        v.chk.checked = true;
        ponTitulo(v);
        v.slot.classList.add('is-live');
        if (v.reloj) clearInterval(v.reloj);
        v.reloj = setInterval(() => tic(v), 1000);
        v.restante = 0;
        intento(v);
    }

    function para(v) {
        v.corriendo = false;
        if (v.reloj) { clearInterval(v.reloj); v.reloj = null; }
        if (v.suelta) { v.suelta(); v.suelta = null; }
        v.slot.classList.remove('is-live');
        v.grupo.classList.remove('is-paused', 'is-refreshing');
        v.restante = _intervalo;
        pintaCampo(v);
    }

    function tic(v) {
        if (!v.corriendo || v.refrescando) return;
        if (v.restante > 0) {
            v.restante -= 1;
            pintaCampo(v);
        }
        if (v.restante <= 0) intento(v);
    }

    function falla(v) {
        if (++v.fallos < MAX_FALLOS) return false;
        para(v);
        v.chk.checked = false;
        ponTitulo(v, true);
        return true;
    }

    function hayQueEsperar(zona) {
        if (document.hidden) return 'llm_paused_hidden';
        const foco = document.activeElement;
        if (foco && foco.classList && foco.classList.contains('nsft-llm-input')) return 'llm_paused_typing';
        if (zona) {
            const tocada = Array.prototype.some.call(
                zona.querySelectorAll('input[type="checkbox"]'),
                (c) => c.checked !== c.defaultChecked && !c.closest('.nsft-tb-switch')
            );
            if (tocada) return 'llm_paused_checks';
            if (foco && zona.contains(foco) && esEditable(foco)) return 'llm_paused_editing';
            const sel = window.getSelection && window.getSelection();
            if (sel && !sel.isCollapsed && sel.rangeCount
                && zona.contains(sel.getRangeAt(0).commonAncestorContainer)) return 'llm_paused_selection';
        }
        const ventana = Array.prototype.some.call(
            document.querySelectorAll('.nsft-modal[data-nsft-ui]'),
            (m) => {
                const cs = getComputedStyle(m);
                return cs.display !== 'none' && cs.visibility !== 'hidden'
                    && parseFloat(cs.opacity) > 0 && m.getClientRects().length > 0;
            }
        );
        return ventana ? 'llm_paused_window' : '';
    }

    function esEditable(el) {
        if (el.isContentEditable) return true;
        const tag = (el.tagName || '').toLowerCase();
        if (tag === 'textarea' || tag === 'select') return true;
        if (tag !== 'input') return false;
        return !/^(button|submit|reset|checkbox|radio|image|hidden)$/i.test(el.type || '');
    }

    function intento(v) {
        if (!v.corriendo || v.refrescando) return;
        if (!v.raiz || !document.contains(v.raiz)) return;
        const motivo = hayQueEsperar(v.alcance());
        if (motivo) {
            v.grupo.classList.add('is-paused');
            v.grupo.title = t(motivo, 'Paused');
            return;
        }
        if (v.grupo.classList.contains('is-paused')) {
            v.grupo.classList.remove('is-paused');
            ponTitulo(v);
        }
        refresca(v);
    }

    async function refresca(v) {
        v.refrescando = true;
        v.grupo.classList.add('is-refreshing');
        const inicio = Date.now();
        const capa = v.refresca === refrescaSublista ? v.alcance() : null;
        if (v.suelta) v.suelta();
        v.suelta = capa ? congela(capa) : null;
        try {
            await v.refresca(v);
            if (v.corriendo) { v.fallos = 0; ponTitulo(v); }
        } catch (e) {
            falla(v);
        }
        const falta = DESTELLO_MS - (Date.now() - inicio);
        if (falta > 0) await new Promise((r) => setTimeout(r, falta));
        v.refrescando = false;
        v.grupo.classList.remove('is-refreshing');
        v.restante = _intervalo;
        pintaCampo(v);
    }

    const QUIETA_MS = 400;
    const TOPE_MS = 4000;
    function congela(capa) {
        const antes = capa.style.minHeight;
        capa.style.minHeight = capa.offsetHeight + 'px';
        let hecha = false;
        let quieta = null;
        const suelta = () => {
            if (hecha) return;
            hecha = true;
            obs.disconnect();
            clearTimeout(quieta);
            clearTimeout(tope);
            capa.style.minHeight = antes;
        };
        const obs = new MutationObserver(() => {
            clearTimeout(quieta);
            quieta = setTimeout(suelta, QUIETA_MS);
        });
        obs.observe(capa, { childList: true, subtree: true, characterData: true });
        quieta = setTimeout(suelta, QUIETA_MS * 3);
        const tope = setTimeout(suelta, TOPE_MS);
        return suelta;
    }

    function listaDePagina() {
        const form = document.querySelector('#body > #footer_actions_form, '
            + '#footer_actions_form[action^="/app/setup/upload/csv/csvstatus.nl"]');
        const barra = form && form.querySelector('.uir-control-bar');
        const tabla = document.querySelector('table#div__body');
        return (barra && tabla) ? { barra: barra, tabla: tabla } : null;
    }

    function montaPagina(encender) {
        const l = listaDePagina();
        if (!l || document.querySelector('.nsft-llm-item')) return;
        const v = pastilla();
        const item = document.createElement('span');
        item.className = 'uir-control-bar-item nsft-llm-item';
        item.appendChild(v.grupo);
        if (l.barra.childElementCount) {
            const sep = document.createElement('span');
            sep.className = 'uir-control-bar-separator nsft-llm-sep';
            l.barra.appendChild(sep);
        }
        l.barra.appendChild(item);
        v.raiz = item;
        v.alcance = () => document.querySelector('table#div__body');
        v.refresca = refrescaPagina;
        ponTitulo(v);
        if (encender) arranca(v);
    }

    async function refrescaPagina(v) {
        const url = new URL(location.href);
        url.searchParams.set('ifrmcntnr', 'T');
        url.searchParams.set('_', String(Date.now()));
        const res = await fetch(url.href, { credentials: 'same-origin' });
        if (!res.ok) throw new Error('http ' + res.status);
        const doc = new DOMParser().parseFromString(await res.text(), 'text/html');
        const nueva = doc.querySelector('table#div__body');
        if (!nueva) throw new Error('sin tabla');
        const tabla = document.querySelector('table#div__body');
        if (!v.corriendo || !tabla) return;
        if (hayQueEsperar(tabla)) return;
        tabla.innerHTML = nueva.innerHTML.split('&amp;ifrmcntnr=T').join('');
        const total = document.querySelector('#uir-total-count');
        const totalNuevo = doc.querySelector('#uir-total-count');
        if (total && totalNuevo) total.textContent = totalNuevo.textContent;
    }

    function buscaSublistas() {
        document.querySelectorAll('.uir-list-control-bar').forEach(montaSublista);
    }

    function quitaSublistas() {
        _porMaquina.forEach((v) => quita(v));
        _porMaquina.clear();
    }

    function montaSublista(barra) {
        if (barra.querySelector('#tbl_refreshscriptnote')) return;
        if (barra.querySelector('.nsft-llm')) return;
        const capa = barra.closest('[data-nsps-layer]');
        const maquina = capa && capa.dataset.nspsLayer;
        const fila = barra.querySelector(':scope > table > tbody > tr > td > table > tbody > tr');
        if (!capa || !maquina || !fila) return;

        const nativo = barra.querySelector('[onclick^="refreshmachine("]');
        const nuestro = barra.querySelector('.nsft-refresh-sublist-btn');
        if (!nativo && !nuestro) return;

        let v = _porMaquina.get(maquina);
        const nueva = !v;
        if (!v) {
            v = pastilla();
            v.raiz = document.createElement('td');
            v.raiz.className = 'nsft-llm-td';
            v.raiz.style.paddingLeft = '8px';
            v.raiz.style.verticalAlign = 'middle';
            v.raiz.appendChild(v.grupo);
            v.maquina = maquina;
            _porMaquina.set(maquina, v);
            ponTitulo(v);
        }
        v.alcance = () => document.querySelector('[data-nsps-layer="' + cssEsc(maquina) + '"]');
        v.refresca = refrescaSublista;
        fila.appendChild(v.raiz);
        if (nueva && _autoStart) arranca(v);
    }

    let _log = null;
    let _logPendiente = false;

    function buscaLog() {
        const tabla = document.querySelector('#tbl_refreshscriptnote');
        const tr = tabla && tabla.closest('tr');
        if (!tr) return;
        if (_log && tr.contains(_log.raiz)) return;
        const nueva = !_log;
        if (!_log) {
            const v = pastilla();
            v.grupo.classList.add('nsft-log-live-mode-container');
            v.raiz = document.createElement('td');
            v.raiz.className = 'nsft-llm-td';
            v.raiz.style.paddingLeft = '15px';
            v.raiz.style.verticalAlign = 'middle';
            v.raiz.appendChild(v.grupo);
            v.esLog = true;
            v.refresca = refrescaSublista;
            ponTitulo(v);
            _log = v;
        }
        const capa = tr.closest('[data-nsps-layer]');
        _log.maquina = capa ? capa.dataset.nspsLayer : '';
        _log.alcance = () => {
            const t2 = document.querySelector('#tbl_refreshscriptnote');
            if (!t2) return null;
            const barra = t2.closest('.uir-list-control-bar');
            return t2.closest('[data-nsps-layer]') || (barra && barra.parentElement) || null;
        };
        tr.appendChild(_log.raiz);
        if (nueva && (_autoStart || _logPendiente)) arranca(_log);
        _logPendiente = false;
    }

    window.addEventListener('nsft-live-mode-start', () => {
        if (!_activo) return;
        if (!_log) { _logPendiente = true; return; }
        if (!_log.corriendo) arranca(_log);
    });

    function maquinaDeBoton(boton) {
        const oc = boton && boton.getAttribute && boton.getAttribute('onclick');
        const m = oc && /refreshmachine\(\s*['"]([A-Za-z0-9_]+)['"]/.exec(oc);
        return m ? m[1] : '';
    }

    function refrescaSublista(v) {
        let nativo;
        if (v.esLog) {
            nativo = document.querySelector('#refreshscriptnote');
        } else {
            const capa = v.alcance();
            const barra = capa && capa.querySelector('.uir-list-control-bar');
            nativo = barra && barra.querySelector('[onclick^="refreshmachine("]');
            if (!nativo && !(barra && barra.querySelector('.nsft-refresh-sublist-btn'))) {
                return Promise.reject(new Error('sin botón'));
            }
        }
        let maquina = maquinaDeBoton(nativo) || (nativo ? '' : v.maquina);
        if (!maquina && v.esLog && !v.porClic) {
            maquina = v.maquina || ((nativo && /^refresh(\w+)$/.exec(nativo.id || '')) || [])[1] || '';
        }
        if (maquina) {
            const reqId = 'llm-' + (++_seq);
            _peticiones.set(reqId, v);
            setTimeout(() => _peticiones.delete(reqId), 15000);
            window.postMessage({ dest: FETCHER_SUBLISTA, reqId: reqId, payload: { machine: maquina } }, '*');
            return Promise.resolve();
        }
        if (nativo) { nativo.click(); return Promise.resolve(); }
        return Promise.reject(new Error('sin botón'));
    }

    function aseguraFetcher() {
        if (document.getElementById('nsft-live-mode-fetcher')) return;
        const s = document.createElement('script');
        s.id = 'nsft-live-mode-fetcher';
        s.src = chrome.runtime.getURL('scripts/modules/refresh_sublist/refresh_sublist_fetcher.js');
        (document.head || document.documentElement).appendChild(s);
    }

    function onRespuestaSublista(ev) {
        if (ev.source !== window) return;
        const d = ev.data;
        if (!d || d.dest !== RESPUESTA_SUBLISTA || typeof d.reqId !== 'string' || d.reqId.indexOf('llm-') !== 0) return;
        const v = _peticiones.get(d.reqId);
        _peticiones.delete(d.reqId);
        if (!v || d.type !== 'error') return;
        if (v.esLog && !v.porClic) { v.porClic = true; return; }
        falla(v);
    }

    function cssEsc(s) {
        return (window.CSS && CSS.escape) ? CSS.escape(s) : String(s).replace(/["\\]/g, '\\$&');
    }
})();
