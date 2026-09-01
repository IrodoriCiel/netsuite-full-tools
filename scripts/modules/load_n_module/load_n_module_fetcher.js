'use strict';

(function () {
    if (window.__nsftLnmFetcher) return;
    window.__nsftLnmFetcher = true;

    const DEFAULT_ALIASES = [
        'record', 'search', 'currentRecord', 'format', 'runtime', 'log',
        'https', 'url', 'error', 'util', 'ui'
    ];

    const ICON_TERMINAL = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" '
        + 'stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
        + '<polyline points="4 17 10 11 4 5"></polyline>'
        + '<line x1="12" y1="19" x2="20" y2="19"></line></svg>';

    let savedAliases = null;
    let DESCRIPTIONS = {};

    function lnmFold(s) {
        const TS = window.NSFT_TextSearch;
        return TS ? TS.fold(s) : String(s == null ? '' : s).toLowerCase();
    }

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
        lnm_auto_close: 'Cierre automático en {1}s…',
        lnm_pick_intro: 'N está siempre disponible. Elige los módulos que quieres cargar además, sin el prefijo «N.», para usarlos directamente en la consola.',
        lnm_pick_all: 'Todos',
        lnm_pick_none: 'Ninguno',
        lnm_pick_recommended: 'Recomendados',
        lnm_pick_taken: 'Ya existe en esta página: marcarlo lo sobrescribe',
        lnm_pick_badge: 'Ya cargado',
        lnm_pick_count: '$1 de $2 seleccionados',
        lnm_pick_search: 'Buscar módulo… p. ej. record, https',
        ro_clear_search: 'Limpiar búsqueda',
        lnm_pick_foot: 'Los módulos elegidos quedan disponibles en la consola sin el prefijo «N.».',
        lnm_btn_load: 'Cargar ($1)',
        lnm_btn_cancel: 'Cancelar'
    };

    let MSG = I18N_FALLBACK;
    let currentTheme = 'light';
    let activeModal = null;
    let activeInterval = null;
    let loadedN = null;

    window.addEventListener('message', (event) => {
        if (event.source !== window) return;
        const data = event.data;
        if (!data || data.dest !== 'fetcher_lnm') return;

        if (data.type === 'init') {
            const payload = data.payload || {};
            if (payload.i18n) MSG = Object.assign({}, I18N_FALLBACK, payload.i18n);
            if (payload.theme) currentTheme = payload.theme;
            if (Array.isArray(payload.aliases)) savedAliases = payload.aliases;
            if (payload.descriptions) DESCRIPTIONS = payload.descriptions;
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
        if (typeof require === 'undefined' || !require) {
            notifyError(MSG.lnm_toast_fail_require);
            return;
        }
        loadModules().catch(handleError);
    }

    async function loadModules() {
        const N = loadedN || await requireOne('N');
        if (!N) {
            notifyError(MSG.lnm_toast_fail_require);
            return;
        }
        loadedN = N;

        window.N = N;

        const available = Object.keys(N).filter((k) => {
            try { return N[k] != null; } catch (e) { return false; }
        }).sort();

        showAliasPicker(N, available);
    }

    function applyAliases(N, chosen) {
        const exposed = ['N'];
        chosen.forEach((name) => {
            try {
                window[name] = N[name];
                exposed.push(name);
            } catch (e) { }
        });

        logToConsole(exposed);
        notifySuccess(buildSuccessText(exposed));
        window.postMessage({
            dest: 'extension_lnm', type: 'aliases', payload: { aliases: chosen }
        }, '*');
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

    function showAliasPicker(N, available) {
        closeActiveModal();

        const preset = Array.isArray(savedAliases) ? savedAliases : DEFAULT_ALIASES;
        const chosen = new Set(preset.filter((name) => available.indexOf(name) !== -1));

        const overlay = el('div', { class: 'nsft-lrc-modal-overlay', 'data-theme': currentTheme });
        const content = el('div', { class: 'nsft-lrc-modal-content nsft-lnm-picker' });

        const header = el('div', { class: 'nsft-lrc-modal-header' });
        const titleEl = el('span', { class: 'nsft-lrc-modal-title' });
        titleEl.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 17 10 11 4 5"></polyline><line x1="12" y1="19" x2="20" y2="19"></line></svg>';
        titleEl.append('NetSuite Full Tools - ' + MSG.lnm_modal_title);
        header.append(
            titleEl,
            el('button', { class: 'nsft-lrc-close-btn', text: '✕', type: 'button' })
        );
        const closeBtn = header.querySelector('.nsft-lrc-close-btn');

        const body = el('div', { class: 'nsft-lrc-modal-body' });
        body.append(el('p', { class: 'nsft-lnm-intro', text: MSG.lnm_pick_intro }));

        const searchRow = el('div', { class: 'nsft-lnm-search' });
        const searchInput = el('input', {
            class: 'nsft-lnm-input', type: 'text', spellcheck: 'false',
            placeholder: MSG.lnm_pick_search
        });
        const clearBtn = el('button', {
            class: 'nsft-lnm-clear', type: 'button', text: '✕',
            title: MSG.ro_clear_search || 'Limpiar búsqueda',
            'aria-label': MSG.ro_clear_search || 'Limpiar búsqueda'
        });
        clearBtn.hidden = true;
        searchRow.append(searchInput, clearBtn);
        body.append(searchRow);

        const tools = el('div', { class: 'nsft-lnm-tools' });
        const allBtn = el('button', { class: 'nsft-lnm-link', text: MSG.lnm_pick_all, type: 'button' });
        const noneBtn = el('button', { class: 'nsft-lnm-link', text: MSG.lnm_pick_none, type: 'button' });
        const recBtn = el('button', { class: 'nsft-lnm-link', text: MSG.lnm_pick_recommended, type: 'button' });
        const count = el('span', { class: 'nsft-lnm-count' });
        tools.append(allBtn, sep(), noneBtn, sep(), recBtn, count);
        body.append(tools);

        const list = el('div', { class: 'nsft-lnm-list' });
        const rows = [];

        available.forEach((name) => {
            const taken = Object.prototype.hasOwnProperty.call(window, name);
            const desc = (DESCRIPTIONS && DESCRIPTIONS[name]) || '';

            const label = el('label', {
                class: 'nsft-lnm-item' + (taken ? ' is-taken' : ''),
                title: taken ? MSG.lnm_pick_taken : ''
            });
            const box = el('input', { type: 'checkbox' });
            box.checked = chosen.has(name);
            box.value = name;

            const head = el('div', { class: 'nsft-lnm-head' });
            head.append(
                el('span', { class: 'nsft-lnm-name', text: name }),
                el('span', { class: 'nsft-lnm-path', text: 'N/' + name })
            );
            if (taken) head.append(el('span', { class: 'nsft-lnm-badge', text: MSG.lnm_pick_badge }));

            const col = el('div', { class: 'nsft-lnm-body' });
            col.append(head);
            if (desc) col.append(el('small', { class: 'nsft-lnm-desc', text: desc }));

            label.append(box, col);

            const row = { name: name, box: box, label: label, hay: lnmFold(name + ' ' + desc) };
            rows.push(row);

            box.addEventListener('change', () => {
                if (box.checked) chosen.add(name); else chosen.delete(name);
                refresh();
            });

            list.append(label);
        });

        body.append(list);

        const footer = el('div', { class: 'nsft-lrc-modal-footer' });
        const hint = el('small', { class: 'nsft-lnm-foot', text: MSG.lnm_pick_foot });
        const cancelBtn = el('button', { class: 'nsft-lrc-btn', text: MSG.lnm_btn_cancel, type: 'button' });

        const okBtn = el('button', { class: 'nsft-lrc-btn nsft-lrc-btn-primary', type: 'button' });
        okBtn.innerHTML = ICON_TERMINAL;
        const okLabel = el('span', {});
        okBtn.append(okLabel);

        footer.append(hint, cancelBtn, okBtn);

        content.append(header, body, footer);
        overlay.append(content);
        document.body.appendChild(overlay);
        activeModal = overlay;

        function refresh() {
            const tpl = MSG.lnm_pick_count || '$1 / $2';
            count.textContent = tpl
                .replace('$1', String(chosen.size))
                .replace('$2', String(available.length));

            const btnTpl = MSG.lnm_btn_load || 'Load ($1)';
            okLabel.textContent = btnTpl.replace('$1', String(chosen.size));

            rows.forEach((r) => r.label.classList.toggle('is-on', r.box.checked));
            applyFilter();
        }

        function markNode(node, needle) {
            const TS = window.NSFT_TextSearch;
            if (!node || !TS || !TS.mark) return;
            if (node.dataset.nsftOrig == null) node.dataset.nsftOrig = node.textContent;
            TS.mark(node, node.dataset.nsftOrig, needle, 'nsft-lnm-hl');
        }

        function applyFilter() {
            clearBtn.hidden = !searchInput.value;
            const raw = searchInput.value.trim();
            const q = lnmFold(raw);
            let visible = 0;
            rows.forEach((r) => {
                const show = !q || r.hay.indexOf(q) !== -1;
                r.label.style.display = show ? '' : 'none';
                if (show) visible++;
                markNode(r.label.querySelector('.nsft-lnm-name'), show ? raw : '');
                markNode(r.label.querySelector('.nsft-lnm-desc'), show ? raw : '');
            });
            list.classList.toggle('is-empty', visible === 0);
        }

        const setMany = (names) => {
            chosen.clear();
            names.forEach((n) => chosen.add(n));
            rows.forEach((r) => { r.box.checked = chosen.has(r.name); });
            refresh();
        };

        allBtn.addEventListener('click', () => setMany(available));
        noneBtn.addEventListener('click', () => setMany([]));
        recBtn.addEventListener('click', () => setMany(
            DEFAULT_ALIASES.filter((n) => available.indexOf(n) !== -1)
        ));

        searchInput.addEventListener('input', applyFilter);

        clearBtn.addEventListener('mousedown', (e) => e.preventDefault());
        clearBtn.addEventListener('click', (e) => {
            e.preventDefault();
            searchInput.value = '';
            applyFilter();
            searchInput.focus();
        });

        const close = () => closeActiveModal();
        cancelBtn.addEventListener('click', close);
        closeBtn.addEventListener('click', close);
        overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

        okBtn.addEventListener('click', () => {
            const picked = available.filter((name) => chosen.has(name));
            close();
            applyAliases(N, picked);
        });

        refresh();
        searchInput.focus();
    }

    function sep() {
        return el('span', { class: 'nsft-lnm-sep', text: '|' });
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
