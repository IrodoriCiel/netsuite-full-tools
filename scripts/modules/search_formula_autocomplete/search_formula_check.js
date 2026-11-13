(function () {
    'use strict';

    const STORAGE_KEY = 'enableSearchFormulaAutocomplete';
    if (!/\/app\/common\/search\/search\.nl/i.test(window.location.pathname)) return;
    if (!/[?&]formula=/i.test(window.location.search)) return;

    const KEYWORDS = new Set(['CASE', 'WHEN', 'THEN', 'ELSE', 'END', 'AND', 'OR', 'NOT', 'NULL', 'IS',
        'IN', 'LIKE', 'BETWEEN', 'EXISTS', 'DISTINCT', 'AS']);
    const t = (k, fb, subs) => (chrome.i18n.getMessage(k, subs) || fb.replace(/\$(\d)/g, (_m, n) => (subs || [])[n - 1] || ''));

    let estado = null;

    chrome.storage.local.get({ [STORAGE_KEY]: true }, (it) => { if (it[STORAGE_KEY]) arranca(); });
    chrome.storage.onChanged.addListener((ch, area) => {
        if (area !== 'local' || !ch[STORAGE_KEY]) return;
        if (ch[STORAGE_KEY].newValue !== false) arranca(); else para();
    });

    function opciones(nombre) {
        const el = document.querySelector('.ns-dropdown[data-name="' + nombre + '"]');
        if (!el) return [];
        try { return JSON.parse(el.dataset.options) || []; } catch (e) { return []; }
    }

    function arranca() {
        if (estado) return;
        const ta = document.getElementById('formula');
        if (!ta || ta.tagName !== 'TEXTAREA') return;

        const funciones = new Set(opciones('function')
            .map((o) => (String(o.value || o.text || '').toUpperCase().match(/^[A-Z_][A-Z0-9_]*/) || [''])[0])
            .filter(Boolean));
        const campos = new Set(opciones('field').map((o) => String(o.value || '').toLowerCase())
            .filter((v) => v && v[0] !== '_'));

        const caja = document.createElement('div');
        caja.className = 'nsft-sfc-avisos';
        caja.setAttribute('data-nsft-ui', '');
        let ancla = ta.closest('.uir-text-area-wrapper') || ta;
        for (let i = 0; i < 6 && ancla.parentElement; i++) {
            const cs = getComputedStyle(ancla.parentElement);
            if (!(cs.display.indexOf('flex') >= 0 && cs.flexDirection.indexOf('row') === 0)) break;
            ancla = ancla.parentElement;
        }
        ancla.insertAdjacentElement('afterend', caja);

        estado = { ta, caja, funciones, campos, espejo: null, ultimo: null, timer: null, fallos: 0, obs: null };
        montaEspejo();
        const revisa = () => pinta(false);
        ['input', 'keyup', 'change'].forEach((ev) => ta.addEventListener(ev, revisa));
        ta.addEventListener('scroll', sincroniza);
        estado.timer = setInterval(() => pinta(false), 400);
        pinta(true);
    }

    function para() {
        if (!estado) return;
        clearInterval(estado.timer);
        if (estado.obs) estado.obs.disconnect();
        quitaEspejo();
        estado.caja.remove();
        estado = null;
    }

    function tokens(s) {
        const out = [];
        let i = 0;
        const n = s.length;
        while (i < n) {
            const c = s[i];
            if (c === '-' && s[i + 1] === '-') {
                let j = s.indexOf('\n', i); if (j < 0) j = n;
                out.push({ k: 'com', v: s.slice(i, j), i }); i = j; continue;
            }
            if (c === '/' && s[i + 1] === '*') {
                let j = s.indexOf('*/', i + 2); const cerrado = j >= 0; j = cerrado ? j + 2 : n;
                out.push({ k: 'com', v: s.slice(i, j), i }); i = j; continue;
            }
            if (c === "'") {
                let j = i + 1;
                while (j < n) { if (s[j] === "'" && s[j + 1] === "'") { j += 2; continue; } if (s[j] === "'") break; j++; }
                const cerrada = j < n;
                out.push({ k: 'str', v: s.slice(i, cerrada ? j + 1 : n), i, abierta: !cerrada }); i = cerrada ? j + 1 : n; continue;
            }
            if (c === '{') {
                const j = s.indexOf('}', i);
                const sigLlave = s.indexOf('{', i + 1);
                if (j < 0 || (sigLlave >= 0 && sigLlave < j)) { out.push({ k: 'llave', v: c, i, abierta: true }); i++; continue; }
                out.push({ k: 'campo', v: s.slice(i, j + 1), i }); i = j + 1; continue;
            }
            if (c === '}') { out.push({ k: 'llave', v: c, i, sobra: true }); i++; continue; }
            if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(s[i + 1] || ''))) {
                let j = i + 1; while (j < n && /[0-9.]/.test(s[j])) j++;
                out.push({ k: 'num', v: s.slice(i, j), i }); i = j; continue;
            }
            if (/[A-Za-z_]/.test(c)) {
                let j = i + 1; while (j < n && /[A-Za-z0-9_$#]/.test(s[j])) j++;
                const v = s.slice(i, j);
                let k = 0; while (/\s/.test(s[j + k] || '')) k++;
                const fn = s[j + k] === '(';
                out.push({ k: KEYWORDS.has(v.toUpperCase()) ? 'kw' : (fn ? 'fn' : 'id'), v, i }); i = j; continue;
            }
            if (c === '(' || c === ')') { out.push({ k: c, v: c, i }); i++; continue; }
            if (/\s/.test(c)) { let j = i + 1; while (j < n && /\s/.test(s[j])) j++; out.push({ k: 'ws', v: s.slice(i, j), i }); i = j; continue; }
            out.push({ k: 'op', v: c, i }); i++;
        }
        return out;
    }

    function valida(s, toks) {
        const err = [], avi = [];
        const ant = (idx) => { for (let j = idx - 1; j >= 0; j--) if (toks[j].k !== 'ws' && toks[j].k !== 'com') return toks[j]; return null; };

        let prof = 0, sobranP = 0, cases = 0, ends = 0, whens = 0, thens = 0;
        toks.forEach((tk, idx) => {
            if (tk.k === '(') prof++;
            else if (tk.k === ')') { if (prof === 0) sobranP++; else prof--; }
            else if (tk.k === 'kw') {
                const u = tk.v.toUpperCase();
                if (u === 'CASE') cases++; else if (u === 'END') ends++;
                else if (u === 'WHEN') whens++; else if (u === 'THEN') thens++;
                else if (u === 'NULL') {
                    const a = ant(idx), aa = a ? ant(toks.indexOf(a)) : null;
                    const op = a && a.k === 'op' ? (aa && aa.k === 'op' && aa.i === a.i - 1 ? aa.v + a.v : a.v) : '';
                    if (/^(=|!=|<>)$/.test(op)) err.push(t('sfc_eq_null', '“= NULL” is never true: use “IS NULL”'));
                }
            } else if (tk.k === 'fn') {
                if (estado.funciones.size && !estado.funciones.has(tk.v.toUpperCase())) {
                    avi.push(t('sfc_fn_unknown', 'NetSuite doesn’t know the function “$1”', [tk.v]));
                }
            } else if (tk.k === 'campo') {
                const id = tk.v.slice(1, -1).trim().toLowerCase();
                if (id && id.indexOf('.') < 0 && estado.campos.size && !estado.campos.has(id)) {
                    avi.push(t('sfc_field_unknown', '{$1} isn’t among this search’s fields', [id]));
                }
                const a = ant(idx);
                if (a && a.k === 'op' && a.v === '/') avi.push(t('sfc_div', 'Dividing by {$1} fails when it is 0: use NULLIF({$1}, 0)', [id]));
            } else if (tk.k === 'str') {
                const m = tk.v.match(/\{([^{}']+)\}/);
                if (m) avi.push(t('sfc_field_in_string', '{$1} is inside quotes: NetSuite won’t replace it', [m[1]]));
                if (tk.abierta) err.push(t('sfc_string', 'A string (single quote) is not closed'));
            } else if (tk.k === 'llave') {
                err.push(tk.abierta ? t('sfc_brace_open', 'A “{” is not closed') : t('sfc_brace_close', 'There is an extra “}”'));
            } else if (tk.k === 'com' && tk.v.indexOf('--') === 0) {
                avi.push(t('sfc_comment', 'A “--” comment can swallow the rest if NetSuite joins the formula into one line: use /* … */'));
            }
        });
        if (sobranP) err.push(t('sfc_paren_close', 'There is an extra “)”'));
        if (prof) err.push(t('sfc_paren_open', '$1 “(” not closed', [String(prof)]));
        if (cases > ends) err.push(t('sfc_case_end', 'A CASE has no END'));
        if (whens > thens) err.push(t('sfc_when_then', 'A WHEN has no THEN'));
        const uniq = (a) => a.filter((x, k) => a.indexOf(x) === k);
        return { err: uniq(err), avi: uniq(avi) };
    }

    function esc(s) { return String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c])); }

    function pinta(forzar) {
        if (!estado) return;
        const s = estado.ta.value;
        if (!forzar && s === estado.ultimo) return;
        estado.ultimo = s;
        const toks = tokens(s);

        const { err, avi } = valida(s, toks);
        const caja = estado.caja;
        caja.innerHTML = '';
        if (!s.trim()) { caja.hidden = true; } else {
            caja.hidden = false;
            if (!err.length && !avi.length) {
                const ok = document.createElement('span');
                ok.className = 'nsft-estado is-ok';
                ok.textContent = t('sfc_ok', 'No syntax errors');
                caja.appendChild(ok);
            }
            const fila = (txt, cls, chapa) => {
                const d = document.createElement('div');
                d.className = 'nsft-sfc-aviso';
                const b = document.createElement('span');
                b.className = cls;
                b.textContent = chapa;
                const p = document.createElement('span');
                p.textContent = txt;
                d.appendChild(b); d.appendChild(p);
                caja.appendChild(d);
            };
            err.forEach((x) => fila(x, 'nsft-alerta', t('sfc_err', 'Error')));
            avi.forEach((x) => fila(x, 'nsft-alerta is-aviso', t('sfc_warn', 'Warning')));
        }

        if (estado.espejo) {
            let prof = 0;
            const html = toks.map((tk) => {
                if (tk.k === 'ws') return esc(tk.v);
                if (tk.k === '(') { const d = prof++ % 4; return '<span class="nsft-sfc-p' + d + '">(</span>'; }
                if (tk.k === ')') { prof = Math.max(0, prof - 1); return '<span class="nsft-sfc-p' + (prof % 4) + '">)</span>'; }
                if (tk.k === 'campo') {
                    const dentro = tk.v.slice(1, -1);
                    const pto = dentro.lastIndexOf('.');
                    return '<span class="nsft-sfc-campo">{' + (pto >= 0
                        ? '<span class="nsft-sfc-join">' + esc(dentro.slice(0, pto + 1)) + '</span>' + esc(dentro.slice(pto + 1))
                        : esc(dentro)) + '}</span>';
                }
                const cls = { kw: 'kw', fn: 'fn', str: 'str', num: 'num', com: 'com', llave: 'mal', op: 'op' }[tk.k];
                return cls ? '<span class="nsft-sfc-' + cls + '">' + esc(tk.v) + '</span>' : esc(tk.v);
            }).join('');
            estado.espejo.innerHTML = html + (s.endsWith('\n') ? ' ' : '');
            sincroniza();
            compruebaEspejo();
        }
    }

    const COPIA = ['fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'letterSpacing', 'lineHeight', 'textTransform',
        'wordSpacing', 'tabSize', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft', 'textAlign'];

    function montaEspejo() {
        const ta = estado.ta;
        const padre = ta.parentElement;
        if (!padre) return;
        if (getComputedStyle(padre).position === 'static') padre.style.position = 'relative';
        const cs = getComputedStyle(ta);
        const mir = document.createElement('div');
        mir.className = 'nsft-sfc-espejo';
        mir.setAttribute('aria-hidden', 'true');
        COPIA.forEach((p) => { mir.style[p] = cs[p]; });
        mir.style.background = cs.backgroundColor;
        mir.style.color = cs.color;
        padre.insertBefore(mir, ta);
        estado.espejo = mir;
        estado.colorTa = { color: ta.style.color, bg: ta.style.backgroundColor, caret: ta.style.caretColor, pos: ta.style.position, z: ta.style.zIndex };
        ta.classList.add('nsft-sfc-on');
        estado.colorTa.spell = ta.spellcheck;
        ta.spellcheck = false;
        ta.style.caretColor = cs.color;
        ta.style.position = 'relative';
        ta.style.zIndex = '1';
        coloca();
        if (window.ResizeObserver) { estado.obs = new ResizeObserver(coloca); estado.obs.observe(ta); }
    }

    function coloca() {
        if (!estado || !estado.espejo) return;
        const ta = estado.ta, mir = estado.espejo, cs = getComputedStyle(ta);
        mir.style.left = (ta.offsetLeft + parseFloat(cs.borderLeftWidth)) + 'px';
        mir.style.top = (ta.offsetTop + parseFloat(cs.borderTopWidth)) + 'px';
        mir.style.width = ta.clientWidth + 'px';
        mir.style.height = ta.clientHeight + 'px';
        sincroniza();
    }

    function sincroniza() {
        if (!estado || !estado.espejo) return;
        estado.espejo.scrollTop = estado.ta.scrollTop;
        estado.espejo.scrollLeft = estado.ta.scrollLeft;
    }

    function compruebaEspejo() {
        const ta = estado.ta, mir = estado.espejo;
        const lh = parseFloat(getComputedStyle(ta).lineHeight) || 16;
        if (Math.abs(mir.scrollHeight - ta.scrollHeight) > lh) estado.fallos++;
        else estado.fallos = 0;
        if (estado.fallos >= 3) quitaEspejo();
    }

    function quitaEspejo() {
        if (!estado || !estado.espejo) return;
        const ta = estado.ta, o = estado.colorTa || {};
        ta.classList.remove('nsft-sfc-on');
        ta.spellcheck = o.spell !== false;
        ta.style.caretColor = o.caret || '';
        ta.style.position = o.pos || '';
        ta.style.zIndex = o.z || '';
        estado.espejo.remove();
        estado.espejo = null;
    }
})();
