(function () {
    'use strict';
    if (window.top !== window) return;
    if (window.NSFT_CapturaEditor) return;

    const OVERLAY_ID = 'nsft-cg-overlay';
    const NSFT_THEME_KEY = 'nsftTheme';
    let _theme = 'light';
    chrome.storage.local.get({ [NSFT_THEME_KEY]: 'light' }, (it) => { _theme = it[NSFT_THEME_KEY] || 'light'; });
    chrome.storage.onChanged.addListener((ch, area) => {
        if (area !== 'local' || !ch[NSFT_THEME_KEY]) return;
        _theme = ch[NSFT_THEME_KEY].newValue || 'light';
        const o = document.getElementById(OVERLAY_ID);
        if (o) o.querySelectorAll('[data-theme]').forEach((el) => el.setAttribute('data-theme', tema()));
    });
    const tema = () => (_theme === 'dark' ? 'dark' : 'light');

    function i18n(key, fallback) {
        let out = '';
        try { out = chrome.i18n.getMessage(key) || ''; } catch (e) { out = ''; }
        return out || fallback;
    }
    function esc(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    }
    function toast(msg, type) {
        if (window.NSFT_Clipboard && window.NSFT_Clipboard.showToast) window.NSFT_Clipboard.showToast(msg, { type: type || 'info' });
    }

    function colorNetSuite() {
        const cs = getComputedStyle(document.documentElement);
        const v = (cs.getPropertyValue('--nsft-ns-primary') || cs.getPropertyValue('--nsft-ns-button') || '').trim();
        return v || '#2563eb';
    }
    const COLORES_FIJOS = ['#e5484d', '#f59e0b', '#16a34a'];

    const ICO = {
        cam: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 7h3l2-3h8l2 3h3v13H3z"/><circle cx="12" cy="13" r="4"/></svg>',
        mover: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 3l14 8-6 2-2 6z"/></svg>',
        marco: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3.5" y="5.5" width="17" height="13" rx="3"/></svg>',
        flecha: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="5" y1="19" x2="19" y2="5"/><polyline points="10 5 19 5 19 14"/></svg>',
        recorte: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 2v16h16"/><path d="M2 6h16v16"/></svg>',
        deshacer: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="9 14 4 9 9 4"/><path d="M4 9h11a5 5 0 0 1 0 10h-3"/></svg>',
        copiar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1"/></svg>',
        bajar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>'
    };

    const SEP = ' › ';
    let S = null;


    function rr(ctx, x, y, w, h, r) {
        const k = Math.max(0, Math.min(r, w / 2, h / 2));
        ctx.beginPath();
        ctx.moveTo(x + k, y);
        ctx.arcTo(x + w, y, x + w, y + h, k);
        ctx.arcTo(x + w, y + h, x, y + h, k);
        ctx.arcTo(x, y + h, x, y, k);
        ctx.arcTo(x, y, x + w, y, k);
        ctx.closePath();
    }

    function conAlfa(hex, a) {
        const m = /^#?([0-9a-f]{6})$/i.exec(String(hex).trim());
        if (m) {
            const n = parseInt(m[1], 16);
            return 'rgba(' + (n >> 16) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
        }
        return 'color-mix(in srgb, ' + hex + ' ' + Math.round(a * 100) + '%, transparent)';
    }

    const FUENTE = '"Segoe UI", -apple-system, BlinkMacSystemFont, Roboto, Helvetica, Arial, sans-serif';

    function cajaMarco(o) {
        const p = 4 * S.k;
        return { x: o.x - p, y: o.y - p, w: o.w + 2 * p, h: o.h + 2 * p };
    }

    function pasosRuta() {
        return String(S.ruta || '').split(/\s*(?:›|>)\s*/).map((t) => t.trim()).filter(Boolean);
    }

    function altoCabecera() {
        return (S.conRuta && pasosRuta().length) ? Math.round(52 * S.k) : 0;
    }

    function dibujaCabecera(ctx, ancho, alto) {
        const k = S.k;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, ancho, alto);
        ctx.fillStyle = '#e5e7eb';
        ctx.fillRect(0, alto - Math.max(1, Math.round(k)), ancho, Math.max(1, Math.round(k)));
        const pasos = pasosRuta();
        const mide = (fs) => {
            ctx.font = '600 ' + fs + 'px ' + FUENTE;
            let w = 0;
            pasos.forEach((t, i) => {
                if (S.numeros) w += fs * 1.55 + fs * 0.45;
                w += ctx.measureText(t).width;
                if (i < pasos.length - 1) w += ctx.measureText(SEP).width + fs * 0.6;
            });
            return w;
        };
        let fs = 15 * k;
        const margen = 18 * k;
        while (fs > 10 * k && mide(fs) > ancho - margen * 2) fs -= 0.5 * k;
        mide(fs);
        let x = margen;
        const cy = alto / 2;
        ctx.textBaseline = 'middle';
        pasos.forEach((t, i) => {
            const ultimo = i === pasos.length - 1;
            if (S.numeros) {
                const r = fs * 0.78;
                ctx.beginPath();
                ctx.arc(x + r, cy, r, 0, Math.PI * 2);
                ctx.fillStyle = S.color;
                ctx.fill();
                ctx.fillStyle = '#ffffff';
                ctx.font = '700 ' + (fs * 0.82) + 'px ' + FUENTE;
                ctx.textAlign = 'center';
                ctx.fillText(String(i + 1), x + r, cy + 0.5 * k);
                ctx.textAlign = 'left';
                x += r * 2 + fs * 0.45;
            }
            ctx.font = (ultimo ? '700 ' : '600 ') + fs + 'px ' + FUENTE;
            ctx.fillStyle = ultimo ? S.color : '#1f2937';
            ctx.fillText(t, x, cy);
            x += ctx.measureText(t).width;
            if (!ultimo) {
                ctx.font = '600 ' + fs + 'px ' + FUENTE;
                ctx.fillStyle = '#9ca3af';
                x += fs * 0.3;
                ctx.fillText(SEP.trim(), x, cy);
                x += ctx.measureText(SEP.trim()).width + fs * 0.3 + ctx.measureText(' ').width;
            }
        });
    }

    function numeroDe(o) {
        const marcos = S.objs.filter((x) => x.tipo === 'marco');
        return marcos.indexOf(o) + 1;
    }

    function dibujaObjetos(ctx) {
        const k = S.k;
        const marcos = S.objs.filter((o) => o.tipo === 'marco');
        if (S.atenuar && marcos.length) {
            ctx.save();
            ctx.beginPath();
            ctx.rect(0, 0, S.W, S.H);
            marcos.forEach((o) => {
                const c = cajaMarco(o);
                const r = 6 * k;
                ctx.moveTo(c.x + r, c.y);
                ctx.arcTo(c.x, c.y, c.x, c.y + c.h, r);
                ctx.arcTo(c.x, c.y + c.h, c.x + c.w, c.y + c.h, r);
                ctx.arcTo(c.x + c.w, c.y + c.h, c.x + c.w, c.y, r);
                ctx.arcTo(c.x + c.w, c.y, c.x, c.y, r);
                ctx.closePath();
            });
            ctx.fillStyle = 'rgba(15, 23, 42, 0.34)';
            ctx.fill('evenodd');
            ctx.restore();
        }
        S.objs.forEach((o) => {
            const sel = o === S.sel;
            if (o.tipo === 'marco') {
                const c = cajaMarco(o);
                ctx.lineJoin = 'round';
                rr(ctx, c.x, c.y, c.w, c.h, 6 * k);
                ctx.strokeStyle = conAlfa(o.color, 0.28);
                ctx.lineWidth = 8 * k;
                ctx.stroke();
                rr(ctx, c.x, c.y, c.w, c.h, 6 * k);
                ctx.strokeStyle = o.color;
                ctx.lineWidth = 3 * k;
                ctx.stroke();
                if (S.numeros && marcos.length > 1) {
                    const r = 11 * k;
                    const cx = c.x;
                    const cy = c.y;
                    ctx.beginPath();
                    ctx.arc(cx, cy, r + 2 * k, 0, Math.PI * 2);
                    ctx.fillStyle = '#ffffff';
                    ctx.fill();
                    ctx.beginPath();
                    ctx.arc(cx, cy, r, 0, Math.PI * 2);
                    ctx.fillStyle = o.color;
                    ctx.fill();
                    ctx.fillStyle = '#ffffff';
                    ctx.font = '700 ' + (13 * k) + 'px ' + FUENTE;
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillText(String(numeroDe(o)), cx, cy + 0.5 * k);
                    ctx.textAlign = 'left';
                }
                if (sel) {
                    ctx.setLineDash([5 * k, 4 * k]);
                    rr(ctx, c.x - 6 * k, c.y - 6 * k, c.w + 12 * k, c.h + 12 * k, 8 * k);
                    ctx.strokeStyle = '#111827';
                    ctx.lineWidth = 1.5 * k;
                    ctx.stroke();
                    ctx.setLineDash([]);
                }
            } else if (o.tipo === 'flecha') {
                const ang = Math.atan2(o.y2 - o.y1, o.x2 - o.x1);
                const cab = 16 * k;
                const traza = (color, ancho) => {
                    ctx.strokeStyle = color;
                    ctx.fillStyle = color;
                    ctx.lineWidth = ancho;
                    ctx.lineCap = 'round';
                    ctx.lineJoin = 'round';
                    ctx.beginPath();
                    ctx.moveTo(o.x1, o.y1);
                    ctx.lineTo(o.x2 - Math.cos(ang) * cab * 0.6, o.y2 - Math.sin(ang) * cab * 0.6);
                    ctx.stroke();
                    ctx.beginPath();
                    ctx.moveTo(o.x2, o.y2);
                    ctx.lineTo(o.x2 - Math.cos(ang - 0.45) * cab, o.y2 - Math.sin(ang - 0.45) * cab);
                    ctx.lineTo(o.x2 - Math.cos(ang + 0.45) * cab, o.y2 - Math.sin(ang + 0.45) * cab);
                    ctx.closePath();
                    ctx.fill();
                    ctx.stroke();
                };
                traza('rgba(255,255,255,0.9)', 8 * k);
                traza(o.color, 4 * k);
                if (sel) {
                    ctx.setLineDash([5 * k, 4 * k]);
                    ctx.strokeStyle = '#111827';
                    ctx.lineWidth = 1.5 * k;
                    const x = Math.min(o.x1, o.x2) - 8 * k;
                    const y = Math.min(o.y1, o.y2) - 8 * k;
                    ctx.strokeRect(x, y, Math.abs(o.x2 - o.x1) + 16 * k, Math.abs(o.y2 - o.y1) + 16 * k);
                    ctx.setLineDash([]);
                }
            }
        });
    }

    function compone(lienzo) {
        const c = S.recorte;
        const hh = altoCabecera();
        lienzo.width = Math.round(c.w);
        lienzo.height = Math.round(c.h + hh);
        const ctx = lienzo.getContext('2d');
        ctx.save();
        ctx.translate(0, hh);
        ctx.beginPath();
        ctx.rect(0, 0, c.w, c.h);
        ctx.clip();
        ctx.translate(-c.x, -c.y);
        ctx.drawImage(S.img, 0, 0);
        dibujaObjetos(ctx);
        ctx.restore();
        if (hh) dibujaCabecera(ctx, lienzo.width, hh);
    }

    function componeRecorte(lienzo) {
        lienzo.width = S.W;
        lienzo.height = S.H;
        const ctx = lienzo.getContext('2d');
        ctx.drawImage(S.img, 0, 0);
        dibujaObjetos(ctx);
        const c = S.arrastre && S.arrastre.modo === 'recorte' ? normal(S.arrastre) : S.recorte;
        ctx.save();
        ctx.beginPath();
        ctx.rect(0, 0, S.W, S.H);
        ctx.rect(c.x, c.y, c.w, c.h);
        ctx.fillStyle = 'rgba(15, 23, 42, 0.55)';
        ctx.fill('evenodd');
        ctx.setLineDash([8 * S.k, 6 * S.k]);
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2 * S.k;
        ctx.strokeRect(c.x, c.y, c.w, c.h);
        ctx.restore();
    }

    function pinta() {
        if (!S || !S.lienzo.isConnected) return;
        if (S.modo === 'recorte') componeRecorte(S.lienzo);
        else compone(S.lienzo);
        ajustaVista();
    }

    function ajustaVista() {
        const caja = S.escenario.getBoundingClientRect();
        const maxW = Math.max(200, caja.width - 24);
        const maxH = Math.max(160, caja.height - 24);
        const e = Math.min(1 / S.k, maxW / S.lienzo.width, maxH / S.lienzo.height);
        S.lienzo.style.width = Math.round(S.lienzo.width * e) + 'px';
        S.lienzo.style.height = Math.round(S.lienzo.height * e) + 'px';
    }


    function aFoto(e) {
        const r = S.lienzo.getBoundingClientRect();
        const px = (e.clientX - r.left) * (S.lienzo.width / r.width);
        const py = (e.clientY - r.top) * (S.lienzo.height / r.height);
        if (S.modo === 'recorte') return { x: px, y: py };
        return { x: px + S.recorte.x, y: py - altoCabecera() + S.recorte.y };
    }

    function normal(a) {
        return { x: Math.min(a.x1, a.x2), y: Math.min(a.y1, a.y2), w: Math.abs(a.x2 - a.x1), h: Math.abs(a.y2 - a.y1) };
    }

    function distSeg(p, o) {
        const dx = o.x2 - o.x1;
        const dy = o.y2 - o.y1;
        const l = dx * dx + dy * dy || 1;
        const t = Math.max(0, Math.min(1, ((p.x - o.x1) * dx + (p.y - o.y1) * dy) / l));
        return Math.hypot(p.x - (o.x1 + t * dx), p.y - (o.y1 + t * dy));
    }

    function toca(p) {
        for (let i = S.objs.length - 1; i >= 0; i--) {
            const o = S.objs[i];
            if (o.tipo === 'marco') {
                const c = cajaMarco(o);
                const m = 8 * S.k;
                if (p.x >= c.x - m && p.x <= c.x + c.w + m && p.y >= c.y - m && p.y <= c.y + c.h + m) return o;
            } else if (distSeg(p, o) < 10 * S.k) return o;
        }
        return null;
    }

    function guarda() {
        S.hist.push(JSON.stringify({ objs: S.objs, recorte: S.recorte }));
        if (S.hist.length > 60) S.hist.shift();
        S.panel.querySelector('.nsft-cg-deshacer').disabled = false;
    }

    function deshace() {
        const prev = S.hist.pop();
        if (!prev) return;
        const d = JSON.parse(prev);
        S.objs = d.objs;
        S.recorte = d.recorte;
        S.sel = null;
        S.panel.querySelector('.nsft-cg-deshacer').disabled = !S.hist.length;
        pinta();
    }

    function ponModo(m) {
        S.modo = m;
        S.sel = null;
        S.panel.querySelectorAll('.nsft-cg-modo').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.modo === m)));
        S.lienzo.style.cursor = m === 'mover' ? 'default' : 'crosshair';
        S.panel.querySelector('.nsft-cg-pista').textContent = {
            mover: i18n('cg_hint_move', 'Drag a mark to move it · Delete removes the selected one'),
            marco: i18n('cg_hint_box', 'Drag to draw a box'),
            flecha: i18n('cg_hint_arrow', 'Drag from where the arrow starts to where it points'),
            recorte: i18n('cg_hint_crop', 'Drag to choose the area · double-click for the whole screen')
        }[m];
        pinta();
    }

    function onDown(e) {
        if (e.button !== 0) return;
        const p = aFoto(e);
        e.preventDefault();
        if (S.modo === 'mover') {
            const o = toca(p);
            S.sel = o;
            if (o) {
                guarda();
                S.arrastre = { modo: 'mover', o, x: p.x, y: p.y, movido: false };
            }
            pinta();
            return;
        }
        S.arrastre = { modo: S.modo, x1: p.x, y1: p.y, x2: p.x, y2: p.y };
    }

    function onMove(e) {
        if (!S || !S.arrastre) {
            if (S && S.modo === 'mover' && e.target === S.lienzo) S.lienzo.style.cursor = toca(aFoto(e)) ? 'move' : 'default';
            return;
        }
        const p = aFoto(e);
        const a = S.arrastre;
        if (a.modo === 'mover') {
            const dx = p.x - a.x;
            const dy = p.y - a.y;
            a.x = p.x;
            a.y = p.y;
            a.movido = true;
            if (a.o.tipo === 'marco') { a.o.x += dx; a.o.y += dy; } else { a.o.x1 += dx; a.o.y1 += dy; a.o.x2 += dx; a.o.y2 += dy; }
            pinta();
            return;
        }
        a.x2 = p.x;
        a.y2 = p.y;
        if (a.modo === 'recorte') { pinta(); return; }
        const tmp = a.modo === 'marco'
            ? Object.assign({ tipo: 'marco', color: S.color }, quitaMargen(normal(a)))
            : { tipo: 'flecha', color: S.color, x1: a.x1, y1: a.y1, x2: a.x2, y2: a.y2 };
        S.objs.push(tmp);
        pinta();
        S.objs.pop();
    }

    function quitaMargen(c) {
        const p = 4 * S.k;
        return { x: c.x + p, y: c.y + p, w: Math.max(2, c.w - 2 * p), h: Math.max(2, c.h - 2 * p) };
    }

    function onUp() {
        if (!S || !S.arrastre) return;
        const a = S.arrastre;
        S.arrastre = null;
        if (a.modo === 'mover') {
            if (!a.movido) S.hist.pop();
            S.panel.querySelector('.nsft-cg-deshacer').disabled = !S.hist.length;
            pinta();
            return;
        }
        const n = normal(a);
        const minimo = 6 * S.k;
        if (a.modo === 'recorte') {
            if (n.w > 40 * S.k && n.h > 30 * S.k) {
                guarda();
                S.recorte = limita(n);
                ponModo('mover');
            } else pinta();
            return;
        }
        if (a.modo === 'marco' && n.w > minimo && n.h > minimo) {
            guarda();
            S.objs.push(Object.assign({ tipo: 'marco', color: S.color }, quitaMargen(n)));
        } else if (a.modo === 'flecha' && Math.hypot(a.x2 - a.x1, a.y2 - a.y1) > 14 * S.k) {
            guarda();
            S.objs.push({ tipo: 'flecha', color: S.color, x1: a.x1, y1: a.y1, x2: a.x2, y2: a.y2 });
        }
        pinta();
    }

    function limita(c) {
        const x = Math.max(0, Math.min(c.x, S.W - 10));
        const y = Math.max(0, Math.min(c.y, S.H - 10));
        return { x, y, w: Math.min(c.w, S.W - x), h: Math.min(c.h, S.H - y) };
    }

    function recorteInicial() {
        const marcos = S.objs.filter((o) => o.tipo === 'marco');
        if (!marcos.length) return { x: 0, y: 0, w: S.W, h: S.H };
        const x1 = Math.min(...marcos.map((o) => o.x));
        const y1 = Math.min(...marcos.map((o) => o.y));
        const x2 = Math.max(...marcos.map((o) => o.x + o.w));
        const y2 = Math.max(...marcos.map((o) => o.y + o.h));
        const k = S.k;
        let w = (x2 - x1) + 2 * 180 * k;
        let h = (y2 - y1) + 2 * 110 * k;
        w = Math.max(w, 760 * k);
        h = Math.max(h, 320 * k);
        let x = (x1 + x2) / 2 - w / 2;
        let y = (y1 + y2) / 2 - h / 2;
        x = Math.max(0, Math.min(x, S.W - w));
        y = Math.max(0, Math.min(y, S.H - h));
        return limita({ x, y, w, h });
    }

    function onKey(e) {
        if (!S) return;
        const enCampo = e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName);
        if (e.key === 'Escape') {
            e.stopPropagation();
            e.preventDefault();
            if (S.modo !== 'mover') { ponModo('mover'); return; }
            cierra();
            return;
        }
        if (enCampo) return;
        if ((e.key === 'Delete' || e.key === 'Backspace') && S.sel) {
            e.preventDefault();
            guarda();
            S.objs = S.objs.filter((o) => o !== S.sel);
            S.sel = null;
            pinta();
        } else if ((e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'Z')) {
            e.preventDefault();
            deshace();
        }
    }


    function lienzoFinal() {
        const sel = S.sel;
        const modo = S.modo;
        S.sel = null;
        S.modo = 'mover';
        const c = document.createElement('canvas');
        compone(c);
        S.sel = sel;
        S.modo = modo;
        return c;
    }

    function nombreArchivo() {
        const pasos = pasosRuta();
        const ultimo = pasos[pasos.length - 1] || 'netsuite';
        const plegado = window.NSFT_TextSearch && window.NSFT_TextSearch.fold ? window.NSFT_TextSearch.fold(ultimo) : ultimo;
        const base = plegado
            .replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase().slice(0, 50) || 'netsuite';
        return 'captura-' + base + '.png';
    }

    function copia() {
        lienzoFinal().toBlob((blob) => {
            if (!blob) { toast(i18n('cg_copy_err', 'The image could not be copied. Use Download PNG.'), 'error'); return; }
            try {
                navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]).then(
                    () => toast(i18n('cg_copied', 'Image copied: paste it in the email or chat.'), 'success'),
                    () => toast(i18n('cg_copy_err', 'The image could not be copied. Use Download PNG.'), 'error')
                );
            } catch (e) {
                toast(i18n('cg_copy_err', 'The image could not be copied. Use Download PNG.'), 'error');
            }
        }, 'image/png');
    }

    function descarga() {
        lienzoFinal().toBlob((blob) => {
            if (!blob) return;
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = nombreArchivo();
            document.body.appendChild(a);
            a.click();
            a.remove();
            setTimeout(() => URL.revokeObjectURL(url), 4000);
        }, 'image/png');
    }


    function cierra() {
        const o = document.getElementById(OVERLAY_ID);
        if (o) o.remove();
        document.removeEventListener('keydown', onKey, true);
        window.removeEventListener('mousemove', onMove, true);
        window.removeEventListener('mouseup', onUp, true);
        window.removeEventListener('resize', onResize);
        S = null;
    }

    function onResize() { if (S) ajustaVista(); }

    function open(dataUrl, datos) {
        cierra();
        const img = new Image();
        img.onload = () => monta(img, datos);
        img.onerror = () => toast(i18n('cg_error', 'The screen could not be captured. Try again.'), 'error');
        img.src = dataUrl;
    }

    function monta(img, datos) {
        const W = img.naturalWidth;
        const H = img.naturalHeight;
        const k = W / Math.max(1, datos.vw || W);
        const color = colorNetSuite();
        const pasos = datos.pasos || [];

        S = {
            img, W, H, k, color,
            objs: pasos.map((p) => ({ tipo: 'marco', color, x: p.caja.x * k, y: p.caja.y * k, w: p.caja.w * k, h: p.caja.h * k })),
            ruta: pasos.map((p) => p.nombre).filter(Boolean).join(SEP),
            conRuta: pasos.length > 1 || datos.tipo !== 'elemento',
            numeros: pasos.length > 1,
            atenuar: true,
            modo: 'mover',
            sel: null,
            arrastre: null,
            hist: []
        };
        S.recorte = recorteInicial();

        const colores = [color].concat(COLORES_FIJOS);
        const overlay = document.createElement('div');
        overlay.id = OVERLAY_ID;
        overlay.className = 'nsft-cg-overlay nsft-modal-backdrop';
        overlay.setAttribute('data-theme', tema());
        overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) cierra(); });

        const panel = document.createElement('div');
        panel.className = 'nsft-cg-panel nsft-modal nsft-modal--dialog';
        panel.setAttribute('data-theme', tema());
        panel.setAttribute('role', 'dialog');
        panel.setAttribute('aria-modal', 'true');
        const modo = (m, ico, label) => '<button type="button" class="nsft-cg-btn nsft-cg-modo" data-modo="' + m + '" aria-pressed="false" title="' + esc(label) + '">' + ico + '<span>' + esc(label) + '</span></button>';
        const casilla = (cls, label, on) => '<label class="nsft-cg-check"><input type="checkbox" class="' + cls + '"' + (on ? ' checked' : '') + '><span>' + esc(label) + '</span></label>';
        panel.innerHTML = '<div class="nsft-modal-header">'
            + '<span class="nsft-modal-title">' + ICO.cam + esc(i18n('enableCapturaGuiadaLabel', 'Guided capture')) + '</span>'
            + '<div class="nsft-header-actions">'
            + '<button type="button" class="nsft-modal-btn-close nsft-cg-x" aria-label="' + esc(i18n('cg_close', 'Close')) + '" title="' + esc(i18n('cg_close', 'Close')) + '">✕</button>'
            + '</div></div>'
            + '<div class="nsft-cg-barra">'
            + '<div class="nsft-cg-grupo">'
            + modo('mover', ICO.mover, i18n('cg_move', 'Move'))
            + modo('marco', ICO.marco, i18n('cg_box', 'Box'))
            + modo('flecha', ICO.flecha, i18n('cg_arrow', 'Arrow'))
            + modo('recorte', ICO.recorte, i18n('cg_crop', 'Crop'))
            + '</div>'
            + '<button type="button" class="nsft-cg-btn nsft-cg-deshacer" disabled title="' + esc(i18n('cg_undo', 'Undo') + ' (Ctrl+Z)') + '">' + ICO.deshacer + '<span>' + esc(i18n('cg_undo', 'Undo')) + '</span></button>'
            + '<div class="nsft-cg-colores" role="radiogroup" aria-label="' + esc(i18n('cg_color', 'Colour')) + '">'
            + colores.map((c, i) => '<button type="button" class="nsft-cg-color" role="radio" aria-checked="' + (i === 0) + '" data-i="' + i + '" style="--nsft-cg-c:' + esc(c) + '" title="' + esc(i === 0 ? i18n('cg_color_ns', 'NetSuite colour') : i18n('cg_color', 'Colour')) + '"></button>').join('')
            + '</div>'
            + '<div class="nsft-cg-checks">'
            + casilla('nsft-cg-conruta', i18n('cg_path', 'Path'), S.conRuta)
            + casilla('nsft-cg-numeros', i18n('cg_numbers', 'Numbers'), S.numeros)
            + casilla('nsft-cg-atenuar', i18n('cg_dim', 'Dim the rest'), S.atenuar)
            + '</div>'
            + '</div>'
            + '<div class="nsft-cg-rutabox"><input type="text" class="nsft-cg-ruta" spellcheck="false" autocomplete="off" placeholder="' + esc(i18n('cg_path_ph', 'Menu › Submenu › Option')) + '"></div>'
            + '<div class="nsft-cg-escenario"><canvas class="nsft-cg-lienzo"></canvas></div>'
            + '<div class="nsft-cg-pie">'
            + '<span class="nsft-cg-pista"></span>'
            + '<button type="button" class="nsft-dlg-btn nsft-dlg-btn-cancel nsft-cg-bajar">' + ICO.bajar + '<span>' + esc(i18n('cg_download', 'Download PNG')) + '</span></button>'
            + '<button type="button" class="nsft-dlg-btn nsft-dlg-btn-ok nsft-cg-copiar">' + ICO.copiar + '<span>' + esc(i18n('cg_copy', 'Copy image')) + '</span></button>'
            + '</div>';
        overlay.appendChild(panel);
        (document.body || document.documentElement).appendChild(overlay);

        S.panel = panel;
        S.lienzo = panel.querySelector('.nsft-cg-lienzo');
        S.escenario = panel.querySelector('.nsft-cg-escenario');

        const ruta = panel.querySelector('.nsft-cg-ruta');
        const rutabox = panel.querySelector('.nsft-cg-rutabox');
        ruta.value = S.ruta;
        rutabox.hidden = !S.conRuta;
        ruta.addEventListener('input', () => { S.ruta = ruta.value; pinta(); });

        panel.querySelector('.nsft-cg-x').addEventListener('click', cierra);
        panel.querySelectorAll('.nsft-cg-modo').forEach((b) => b.addEventListener('click', () => ponModo(b.dataset.modo)));
        panel.querySelector('.nsft-cg-deshacer').addEventListener('click', deshace);
        panel.querySelectorAll('.nsft-cg-color').forEach((b) => b.addEventListener('click', () => {
            S.color = colores[+b.dataset.i];
            panel.querySelectorAll('.nsft-cg-color').forEach((x) => x.setAttribute('aria-checked', String(x === b)));
            guarda();
            (S.sel ? [S.sel] : S.objs).forEach((o) => { o.color = S.color; });
            pinta();
        }));
        panel.querySelector('.nsft-cg-conruta').addEventListener('change', (e) => { S.conRuta = e.target.checked; rutabox.hidden = !S.conRuta; pinta(); });
        panel.querySelector('.nsft-cg-numeros').addEventListener('change', (e) => { S.numeros = e.target.checked; pinta(); });
        panel.querySelector('.nsft-cg-atenuar').addEventListener('change', (e) => { S.atenuar = e.target.checked; pinta(); });
        panel.querySelector('.nsft-cg-copiar').addEventListener('click', copia);
        panel.querySelector('.nsft-cg-bajar').addEventListener('click', descarga);

        S.lienzo.addEventListener('mousedown', onDown);
        S.lienzo.addEventListener('dblclick', () => {
            if (S.modo !== 'recorte') return;
            guarda();
            S.recorte = { x: 0, y: 0, w: S.W, h: S.H };
            ponModo('mover');
        });
        window.addEventListener('mousemove', onMove, true);
        window.addEventListener('mouseup', onUp, true);
        window.addEventListener('resize', onResize);
        document.addEventListener('keydown', onKey, true);

        ponModo('mover');
        requestAnimationFrame(() => { pinta(); panel.querySelector('.nsft-cg-copiar').focus(); });
    }

    window.NSFT_CapturaEditor = { open, close: cierra };
})();
