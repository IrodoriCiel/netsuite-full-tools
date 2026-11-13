(function () {
    'use strict';
    if (window.NSFT_AiExplain) return;

    const PENDING_KEY = 'nsftAiPendingAsk';
    const BTN_CLASS = 'nsft-aiexp-btn';
    const MAX_DETAIL = 6000;
    const ICON = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" '
        + 'stroke-linejoin="round" aria-hidden="true"><path d="M8 1.8l1.4 3.3 3.3 1.4-3.3 1.4L8 11.2 6.6 7.9 3.3 6.5l3.3-1.4z"/>'
        + '<path d="M12.6 10.6l.6 1.4 1.4.6-1.4.6-.6 1.4-.6-1.4-1.4-.6 1.4-.6z"/></svg>';

    let _on = false;

    function i18n(key, fallback, subs) {
        let out = '';
        try { out = chrome.i18n.getMessage(key, subs) || ''; } catch (e) { out = ''; }
        if (!out) {
            out = fallback;
            (subs || []).forEach((v, idx) => { out = out.split('$' + (idx + 1)).join(String(v)); });
        }
        return out;
    }

    function refresca() {
        document.querySelectorAll('.' + BTN_CLASS).forEach((b) => { b.hidden = !_on; });
    }

    const CLAVES = {
        enableAiAssistant: true, aiAssistantLogs: true, aiAssistantPick: true,
        nsft_ai_configs: null, nsft_ai_active: '', nsft_ai_apikey: ''
    };
    let _pickOn = false;
    let _changesOn = false;
    function hayProveedor(it) {
        const configs = (it.nsft_ai_configs && typeof it.nsft_ai_configs === 'object') ? it.nsft_ai_configs : null;
        if (!configs) return !!it.nsft_ai_apikey;
        let pk = it.nsft_ai_active;
        if (!pk || !configs[pk]) pk = Object.keys(configs)[0];
        const c = pk && configs[pk];
        if (!c || c.disabled) return false;
        const conClave = !!c.apiKey || pk === 'ollama';
        const conModelo = !!c.model || (Array.isArray(c.models) && c.models.length > 0);
        return conClave && conModelo;
    }
    function lee() {
        chrome.storage.local.get(CLAVES, (it) => {
            const ia = it.enableAiAssistant !== false && hayProveedor(it);
            _on = ia && it.aiAssistantLogs !== false;
            _pickOn = ia && it.aiAssistantPick !== false;
            _changesOn = ia;
            if (!_pickOn) terminaSelector();
            refresca();
        });
    }
    try {
        lee();
        chrome.storage.onChanged.addListener((ch, area) => {
            if (area !== 'local' || !Object.keys(CLAVES).some((k) => ch[k])) return;
            lee();
        });
    } catch (e) { _on = false; }

    function esError(nivel) {
        return /^\s*(error|emergenc)/i.test(String(nivel || ''));
    }

    const RX_PARECE_ERROR = new RegExp([
        'error\\.SuiteScriptError',
        '\\bSSS_[A-Z_]{3,}',
        '"(?:name|code)"\\s*:\\s*"[A-Z][A-Z0-9]*_[A-Z0-9_]+"',
        '\\bat\\s+[\\w$.<>]+\\s+\\([^)]*\\.js:\\d+',
        '^\\s*(?:Error|TypeError|ReferenceError|SyntaxError|RangeError)\\b'
    ].join('|'));
    function pareceError(detalle) {
        const s = String(detalle || '');
        return !!s && RX_PARECE_ERROR.test(s.slice(0, 20000));
    }
    function cuentaComoError(o) {
        return !!o && (esError(o.level) || pareceError(o.detail));
    }

    function pregunta(o) {
        let det = String(o.detail || '').trim();
        if (det.length > MAX_DETAIL) det = det.slice(0, MAX_DETAIL) + '\n…';
        const subs = [o.script || '—', o.title || '—', det || '—'];
        if (cuentaComoError(o)) {
            return i18n('aiexp_prompt',
                'Explain this error from a NetSuite script: what causes it and how to fix it. Be brief and concrete.\n\nScript: $1\nTitle: $2\n\nError:\n$3',
                subs);
        }
        return i18n('aiexp_prompt_log',
            'Explain this log entry from a NetSuite script: what it means and whether it points to a problem. Be brief and concrete.\n\nScript: $1\nLevel: $4\nTitle: $2\n\nDetail:\n$3',
            subs.concat([o.level || '—']));
    }

    function pide(o) {
        const quien = String(o.title || o.script || '').trim().slice(0, 80);
        const display = cuentaComoError(o)
            ? i18n('aiexp_show_error', 'Explain this error · $1', [quien || '—'])
            : i18n('aiexp_show_log', 'Explain this log · $1', [quien || '—']);
        enviaPregunta(pregunta(o), display);
    }

    function enviaPregunta(text, display) {
        try {
            chrome.storage.local.set({ [PENDING_KEY]: { text, display: display || '', ts: Date.now() } });
        } catch (e) { }
        try {
            chrome.runtime.sendMessage({ nsftPanel: 'open', panel: 'ai' }, (resp) => {
                void chrome.runtime.lastError;
                if (!(resp && resp.ok) && window.NSFT_Clipboard && window.NSFT_Clipboard.showToast) {
                    window.NSFT_Clipboard.showToast(
                        i18n('aiexp_no_panel', 'The AI side panel could not be opened.'), { type: 'error' });
                }
            });
        } catch (e) { }
    }

    function button(o) {
        if (!o || !String(o.detail || '').trim()) return null;
        const error = cuentaComoError(o);
        const b = document.createElement('button');
        b.type = 'button';
        b.className = BTN_CLASS;
        b.hidden = !_on;
        b.title = error
            ? i18n('aiexp_title', 'Ask the AI Assistant what causes this error and how to fix it')
            : i18n('aiexp_title_log', 'Ask the AI Assistant what this log means');
        b.innerHTML = ICON;
        const t = document.createElement('span');
        t.textContent = i18n('aiexp_btn', 'Explain');
        b.appendChild(t);
        b.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            pide(o);
        });
        return b;
    }

    const SOLO_ARRIBA = window.top === window;
    const PICK_EVENT = 'nsft-ai-pick-element';
    const MAX_PICK = 4000;
    let _sel = null;

    function limpio(s, max) {
        let t = String(s == null ? '' : s).replace(/ /g, ' ').replace(/[ \t]+/g, ' ')
            .replace(/ *\n */g, '\n').replace(/\n{3,}/g, '\n\n').trim();
        if (max && t.length > max) t = t.slice(0, max) + '\n…';
        return t;
    }

    function textoDe(el) {
        if (!el) return '';
        if (el.matches && el.matches('input, textarea')) return el.type === 'password' ? '' : (el.value || '');
        if (el.matches && el.matches('select')) return Array.from(el.selectedOptions || []).map((o) => o.text).join(', ');
        return el.innerText || el.textContent || '';
    }

    function descriptor(el) {
        if (!el || !el.tagName) return '';
        let d = el.tagName.toLowerCase();
        if (el.id) d += '#' + el.id;
        const cls = (typeof el.className === 'string' ? el.className : '').trim().split(/\s+/)
            .filter((c) => c && !/^nsft-aipick/.test(c)).slice(0, 2);
        if (cls.length) d += '.' + cls.join('.');
        return d.length > 70 ? d.slice(0, 70) + '…' : d;
    }

    function campoDe(el) {
        const w = el.closest && el.closest('.uir-field-wrapper, [data-field-name]');
        if (!w) return null;
        const lbl = w.querySelector('.uir-label, .smallgraytextnolink, label');
        let id = w.getAttribute('data-field-name') || '';
        if (!id) {
            const pieza = w.querySelector('[id$="_fs_lbl"], [id$="_fs"], [id$="_display"]');
            if (pieza) id = pieza.id.replace(/(_fs_lbl|_fs|_display)$/, '');
        }
        const val = w.querySelector('.uir-field, .inputreadonly, input, select, textarea');
        return {
            label: limpio(lbl ? textoDe(lbl) : '', 120),
            id: id,
            value: limpio(val ? textoDe(val) : '', 500)
        };
    }

    function celdaDe(el) {
        const td = el.closest && el.closest('td, th');
        const tr = td && td.closest('tr');
        const table = tr && tr.closest('table');
        if (!td || !tr || !table) return null;
        const idx = Array.from(tr.children).indexOf(td);
        const cab = table.querySelector('thead tr, tr.uir-machine-headerrow, tr.uir-list-headerrow, tr:has(> th)');
        const col = cab && cab !== tr && cab.children[idx] ? limpio(textoDe(cab.children[idx]), 120) : '';
        const fila = Array.from(tr.children).map((c) => limpio(textoDe(c), 160)).filter(Boolean).join(' | ');
        return { col: col, fila: limpio(fila, 700) };
    }

    function tituloPagina() {
        return limpio(String(document.title || '').replace(/\s+-\s+NetSuite.*$/i, ''), 160);
    }

    function paginaDe() {
        const titulo = tituloPagina();
        let ruta = location.pathname;
        try {
            const id = new URLSearchParams(location.search).get('id');
            if (id) ruta += '?id=' + id;
        } catch (e) { }
        return titulo + ' — ' + ruta;
    }

    function preguntaElemento(el) {
        const ctx = [];
        const f = campoDe(el);
        if (f && (f.label || f.id)) {
            ctx.push(i18n('aipick_ctx_field', 'Field: $1 ($2) = $3',
                [f.label || '—', f.id || '—', f.value || '—']));
        }
        const c = celdaDe(el);
        if (c) {
            if (c.col) ctx.push(i18n('aipick_ctx_col', 'Column: $1', [c.col]));
            if (c.fila) ctx.push(i18n('aipick_ctx_row', 'Row: $1', [c.fila]));
        }
        return i18n('aipick_prompt',
            'Explain this element from a NetSuite page: what it is, what the value it shows means and whether there is anything to check. Be brief and concrete.\n\nPage: $1\nElement: $2\n$3\n\nContent:\n$4',
            [paginaDe(), descriptor(el), ctx.join('\n') || '—', limpio(textoDe(el), MAX_PICK) || '—']);
    }

    function crea(tag, cls) {
        const n = document.createElement(tag);
        n.className = cls;
        return n;
    }

    function pinta() {
        if (!_sel) return;
        const el = _sel.el;
        if (!el || !el.isConnected) { _sel.box.hidden = true; _sel.tip.hidden = true; return; }
        const r = el.getBoundingClientRect();
        Object.assign(_sel.box.style, {
            left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', height: r.height + 'px'
        });
        _sel.box.hidden = false;
        const f = campoDe(el);
        const c = f ? null : celdaDe(el);
        const extra = f && f.label ? f.label : (c && c.col ? c.col : '');
        _sel.tipName.textContent = descriptor(el);
        _sel.tipSize.textContent = Math.round(r.width) + ' × ' + Math.round(r.height);
        _sel.tipCtx.textContent = extra;
        _sel.tipCtx.hidden = !extra;
        _sel.tip.hidden = false;
        const th = _sel.tip.offsetHeight || 40;
        const tw = _sel.tip.offsetWidth || 200;
        let top = r.top - th - 8;
        if (top < 4) top = Math.min(window.innerHeight - th - 4, r.bottom + 8);
        const left = Math.max(4, Math.min(window.innerWidth - tw - 4, r.left));
        _sel.tip.style.top = top + 'px';
        _sel.tip.style.left = left + 'px';
    }

    function esNuestro(n) {
        return !!(n && n.closest && n.closest('.nsft-aipick-bar'));
    }

    function apunta(el) {
        if (!_sel || !el || el === document.documentElement || el === document.body || esNuestro(el)) return;
        if (_sel.el !== el) { _sel.el = el; _sel.hijos = []; }
        pinta();
    }

    function elige() {
        if (!_sel || !_sel.el) return;
        const el = _sel.el;
        const texto = preguntaElemento(el);
        const f = campoDe(el);
        const c = f ? null : celdaDe(el);
        const nombre = (f && f.label) || (c && c.col) || descriptor(el);
        terminaSelector();
        enviaPregunta(texto, i18n('aipick_show', 'Explain this element · $1', [nombre]));
    }

    function iniciaSelector() {
        if (!SOLO_ARRIBA || _sel) return;
        if (!_pickOn) {
            if (window.NSFT_Clipboard && window.NSFT_Clipboard.showToast) {
                window.NSFT_Clipboard.showToast(i18n('aipick_off',
                    'Turn on the AI Assistant and set up a provider to explain elements.'), { type: 'error' });
            }
            return;
        }
        const box = crea('div', 'nsft-aipick-box');
        const tip = crea('div', 'nsft-aipick-tip');
        const tipHead = crea('div', 'nsft-aipick-tip-head');
        const tipName = crea('span', 'nsft-aipick-tip-name');
        const tipSize = crea('span', 'nsft-aipick-tip-size');
        const tipCtx = crea('div', 'nsft-aipick-tip-ctx');
        tipHead.append(tipName, tipSize);
        tip.append(tipHead, tipCtx);
        const bar = crea('div', 'nsft-aipick-bar');
        bar.setAttribute('role', 'status');
        const spark = crea('span', 'nsft-aipick-spark');
        spark.innerHTML = ICON;
        const msg = crea('span', 'nsft-aipick-msg');
        msg.textContent = i18n('aipick_bar', 'Click an element to explain it with AI');
        const keys = crea('span', 'nsft-aipick-keys');
        keys.textContent = i18n('aipick_keys', '↑ ↓ container · Enter choose · Esc cancel');
        const cancel = crea('button', 'nsft-aipick-cancel');
        cancel.type = 'button';
        cancel.textContent = i18n('aipick_cancel', 'Cancel');
        cancel.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); terminaSelector(); });
        bar.append(spark, msg, keys, cancel);
        box.hidden = true;
        tip.hidden = true;
        document.documentElement.append(box, tip, bar);

        const bloquea = (e) => {
            if (esNuestro(e.target)) return;
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();
        };
        const onMove = (e) => {
            const t = document.elementFromPoint(e.clientX, e.clientY);
            if (esNuestro(t)) return;
            apunta(t);
        };
        const onClick = (e) => {
            if (esNuestro(e.target)) return;
            bloquea(e);
            if (_sel && !_sel.el) apunta(document.elementFromPoint(e.clientX, e.clientY));
            elige();
        };
        const onKey = (e) => {
            if (!_sel) return;
            if (e.key === 'Escape') { bloquea(e); terminaSelector(); return; }
            if (e.key === 'Enter') { bloquea(e); elige(); return; }
            if (e.key === 'ArrowUp' && _sel.el && _sel.el.parentElement
                && _sel.el.parentElement !== document.body && _sel.el.parentElement !== document.documentElement) {
                bloquea(e);
                _sel.hijos.push(_sel.el);
                _sel.el = _sel.el.parentElement;
                pinta();
                return;
            }
            if (e.key === 'ArrowDown' && _sel.hijos.length) {
                bloquea(e);
                _sel.el = _sel.hijos.pop();
                pinta();
            }
        };
        const onScroll = () => pinta();

        _sel = { el: null, hijos: [], box, tip, tipName, tipSize, tipCtx, bar };
        _sel.quita = () => {
            window.removeEventListener('mousemove', onMove, true);
            window.removeEventListener('click', onClick, true);
            ['mousedown', 'mouseup', 'pointerdown', 'pointerup', 'dblclick', 'contextmenu'].forEach((t) => window.removeEventListener(t, bloquea, true));
            window.removeEventListener('keydown', onKey, true);
            window.removeEventListener('scroll', onScroll, true);
            window.removeEventListener('resize', onScroll, true);
            box.remove(); tip.remove(); bar.remove();
            document.documentElement.classList.remove('nsft-aipick-on');
        };
        window.addEventListener('mousemove', onMove, true);
        window.addEventListener('click', onClick, true);
        ['mousedown', 'mouseup', 'pointerdown', 'pointerup', 'dblclick', 'contextmenu'].forEach((t) => window.addEventListener(t, bloquea, true));
        window.addEventListener('keydown', onKey, true);
        window.addEventListener('scroll', onScroll, true);
        window.addEventListener('resize', onScroll, true);
        document.documentElement.classList.add('nsft-aipick-on');
    }

    function terminaSelector() {
        if (!_sel) return;
        const s = _sel;
        _sel = null;
        try { s.quita(); } catch (e) { }
    }

    const CHANGES_EVENT = 'nsft-ai-record-changes';

    function tipoRegistro() {
        const p = location.pathname;
        let q = null;
        try { q = new URLSearchParams(location.search); } catch (e) { }
        if (/\/accounting\/transactions\//i.test(p)) return -30;
        if (/custrecordentry\.nl$/i.test(p)) {
            const r = q && q.get('rectype');
            return r && /^\d+$/.test(r) ? Number(r) : null;
        }
        if (/\/common\/entity\//i.test(p)) return -9;
        if (/\/common\/item\//i.test(p)) return -10;
        return null;
    }

    function preguntaCambios() {
        let id = '';
        try { id = new URLSearchParams(location.search).get('id') || ''; } catch (e) { }
        if (!/^\d+$/.test(id)) return '';
        const t = tipoRegistro();
        const sql = 'SELECT TO_CHAR(sn.date, \'YYYY-MM-DD HH24:MI\') AS cuando, BUILTIN.DF(sn.name) AS usuario, '
            + 'BUILTIN.DF(sn.role) AS rol, sn.context, sn.type, sn.field, sn.oldvalue, sn.newvalue, sn.lineid'
            + (t == null ? ', sn.recordtypeid' : '')
            + ' FROM systemnote sn WHERE sn.recordid = ' + id
            + (t == null ? '' : ' AND sn.recordtypeid = ' + t)
            + ' ORDER BY sn.date DESC, sn.id DESC';
        return i18n('aichg_prompt',
            'Summarise in plain language what changed in this NetSuite record and who changed it.\n\nRecord: $1\n\nRun THIS query as is with maxRows 150 (do not write others unless it fails):\n$2\n\n$3',
            [paginaDe(), sql, t == null ? i18n('aichg_hint_type', 'The record type id is unknown: if notes from several recordtypeid come back, keep the ones that belong to this record.') : '']);
    }

    function pideCambios() {
        if (!_changesOn) {
            if (window.NSFT_Clipboard && window.NSFT_Clipboard.showToast) {
                window.NSFT_Clipboard.showToast(i18n('aichg_off',
                    'Turn on the AI Assistant and set up a provider to summarise the changes.'), { type: 'error' });
            }
            return;
        }
        const texto = preguntaCambios();
        if (!texto) return;
        enviaPregunta(texto, i18n('aichg_show', 'What changed in this record? · $1', [tituloPagina() || '—']));
    }

    if (SOLO_ARRIBA) {
        window.addEventListener(CHANGES_EVENT, pideCambios);
    }

    if (SOLO_ARRIBA) {
        window.addEventListener(PICK_EVENT, () => {
            if (_sel) terminaSelector(); else iniciaSelector();
        });
        if (window.NSFT_Shortcuts && window.NSFT_Shortcuts.bind) {
            window.NSFT_Shortcuts.bind('ai_pick', {
                label: i18n('aipick_shortcut', 'Explain an element with AI'),
                defaultCombo: { ctrlKey: false, shiftKey: true, altKey: true, code: 'KeyX' },
                storageKey: 'aiPickShortcut',
                event: PICK_EVENT,
                group: i18n('cheatsheet_group_global', 'Global'),
                order: 49,
                isEnabled: () => _pickOn
            });
        }
    }

    window.NSFT_AiExplain = Object.freeze({
        button, esError, pareceError, cuentaComoError, PENDING_KEY,
        startPicker: iniciaSelector
    });
})();
