'use strict';

(function () {
    if (window.__nsftLnmFetcher) return;
    window.__nsftLnmFetcher = true;

    const SUBMODULES = [
        'record', 'search', 'currentRecord', 'format', 'runtime', 'log',
        'https', 'url', 'error', 'util', 'format/i18n', 'ui/dialog', 'ui/message'
    ];

    const I18N_FALLBACK = {
        lnm_loaded: 'Módulo N cargado. Variables disponibles en la consola.',
        lnm_toast_short: 'Módulo N + $1 submódulos cargados',
        lnm_toast_fail_require: 'SuiteScript no disponible en esta página',
        lnm_toast_fail_error: 'Error al cargar el módulo N: $1',
        lnm_console_tag: '[NSFT]',
        lnm_console_loaded: 'Módulo N cargado.',
        lnm_vars_label: 'Variables Disponibles:',
        lnm_fail_require: 'No se pudo cargar el módulo N. Debes estar en una página con SuiteScript disponible.',
        lnm_fail_error: 'Error al cargar el módulo N: $1',
        lnm_modal_title: 'Cargar módulo N',
        lnm_btn_ok: 'Aceptar',
        lnm_auto_close: 'Cierre automático en {1}s…'
    };

    let MSG = I18N_FALLBACK;
    let currentTheme = 'light';
    let activeModal = null;
    let activeInterval = null;
    let alreadyLoaded = false;

    window.addEventListener('message', (event) => {
        if (event.source !== window) return;
        const data = event.data;
        if (!data || data.dest !== 'fetcher_lnm') return;

        if (data.type === 'init') {
            const payload = data.payload || {};
            if (payload.i18n) MSG = Object.assign({}, I18N_FALLBACK, payload.i18n);
            if (payload.theme) currentTheme = payload.theme;
            triggerLoad();
        } else if (data.type === 'theme_changed') {
            const newTheme = data.payload && data.payload.theme;
            if (newTheme) {
                currentTheme = newTheme;
                if (activeModal) activeModal.setAttribute('data-theme', newTheme);
            }
        } else if (data.type === 'teardown') {
            closeActiveModal();
        }
    });

    function triggerLoad() {
        if (alreadyLoaded) {
            const reloaded = ['N'].concat(SUBMODULES.filter((p) => {
                const v = p.split('/').pop();
                return typeof window[v] !== 'undefined';
            }).map((p) => p.split('/').pop()));
            notifySuccess(buildSuccessText(reloaded));
            return;
        }
        alreadyLoaded = true;

        if (typeof require === 'undefined' || !require) {
            notifyError(MSG.lnm_toast_fail_require);
            return;
        }
        loadModules().catch(handleError);
    }

    async function loadModules() {
        const N = await requireOne('N');
        if (!N) {
            notifyError(MSG.lnm_toast_fail_require);
            return;
        }
        window.N = N;
        const exposed = ['N'];

        const results = await Promise.all(SUBMODULES.map((path) => requireOne('N/' + path)));
        results.forEach((mod, idx) => {
            if (!mod) return;
            const varName = SUBMODULES[idx].split('/').pop();
            window[varName] = mod;
            exposed.push(varName);
        });

        logToConsole(exposed);
        notifySuccess(buildSuccessText(exposed));
    }

    function buildSuccessText(vars) {
        const count = Math.max(0, vars.length - 1);
        const tpl = MSG.lnm_toast_short || 'Módulo N + $1 submódulos cargados';
        return tpl.replace('$1', String(count));
    }

    function notifySuccess(text) {
        window.postMessage({ dest: 'extension_lnm', type: 'success', text: text }, '*');
    }

    function notifyError(text) {
        window.postMessage({ dest: 'extension_lnm', type: 'error', text: text }, '*');
    }

    function requireOne(path) {
        return new Promise((resolve) => {
            let settled = false;
            const finish = (val) => { if (!settled) { settled = true; resolve(val); } };
            try {
                require([path], (mod) => finish(mod || null), () => finish(null));
            } catch (e) { finish(null); }
            setTimeout(() => finish(null), 1500);
        });
    }

    function logToConsole(vars) {
        const tag = MSG.lnm_console_tag;
        const loadedText = MSG.lnm_console_loaded;
        const varsLabel = MSG.lnm_vars_label;

        const spec = vars.map(() => '%c%s%c').join(', ');
        const styles = [];
        vars.forEach((name) => {
            styles.push('color:#2ecc71; font-weight:bold;');
            styles.push(name);
            styles.push('color:inherit;');
        });

        console.log(
            '%c' + tag + '%c ' + loadedText + '\n' + varsLabel + '\n' + spec,
            'color:#ff9f43; font-weight:bold;',
            'color:inherit;',
            ...styles
        );
    }

    function handleError(e) {
        const tpl = MSG.lnm_toast_fail_error || 'Error: $1';
        notifyError(tpl.replace('$1', (e && e.message) || String(e)));
    }

    function closeActiveModal() {
        if (activeInterval) {
            clearInterval(activeInterval);
            activeInterval = null;
        }
        if (activeModal && activeModal.parentNode) {
            activeModal.parentNode.removeChild(activeModal);
        }
        activeModal = null;
    }

    function showModal(message) {
        closeActiveModal();
        let countdown = 3;

        const overlay = el('div', {
            class: 'nsft-lrc-modal-overlay',
            'data-theme': currentTheme
        });
        const content = el('div', { class: 'nsft-lrc-modal-content' });
        const header = el('div', { class: 'nsft-lrc-modal-header' });
        const title = el('span', { class: 'nsft-lrc-modal-title', text: MSG.lnm_modal_title });
        const closeBtn = el('button', { class: 'nsft-lrc-close-btn', text: '✕', type: 'button' });
        header.append(title, closeBtn);

        const body = el('div', { class: 'nsft-lrc-modal-body', text: String(message || '') });

        const footer = el('div', { class: 'nsft-lrc-modal-footer' });
        const timer = el('span', { class: 'nsft-lrc-timer' });
        const okBtn = el('button', { class: 'nsft-lrc-btn nsft-lrc-btn-primary', text: MSG.lnm_btn_ok, type: 'button' });
        footer.append(timer, okBtn);

        content.append(header, body, footer);
        overlay.append(content);
        document.body.appendChild(overlay);
        activeModal = overlay;

        const close = () => closeActiveModal();

        const tick = () => {
            timer.textContent = MSG.lnm_auto_close ? MSG.lnm_auto_close.replace('{1}', String(countdown)) : '';
            if (countdown <= 0) close();
            countdown--;
        };
        tick();
        activeInterval = setInterval(tick, 1000);

        okBtn.addEventListener('click', close);
        closeBtn.addEventListener('click', close);
        overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
    }

    function el(tag, attrs) {
        const node = document.createElement(tag);
        if (attrs) {
            Object.keys(attrs).forEach((k) => {
                if (k === 'class') node.className = attrs[k];
                else if (k === 'text') node.textContent = attrs[k];
                else node.setAttribute(k, attrs[k]);
            });
        }
        return node;
    }
})();
