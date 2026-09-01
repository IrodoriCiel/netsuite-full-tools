(function () {
    'use strict';

    const PAGES_KEY = 'nsftRatePages';
    const AT_KEY = 'nsftInstalledAt';
    const STATE_KEY = 'nsftSharePrompt';
    const RATE_STATE_KEY = 'nsftRatePrompt';
    const GATE_KEY = 'nsftPromptGate';
    const TOAST_ID = 'nsft-share-prompt';

    const MIN_DAYS = 21;
    const MIN_PAGES = 120;
    const SNOOZE_PAGES = 150;
    const SHOW_DELAY_MS = 6500;

    const GAP_DAYS = 7;
    const GAP_PAGES = 40;

    const STORE_URL = 'https://chromewebstore.google.com/detail/netsuite-full-tools/fgldkomofdfcmkccjgalihlollndjmcc';

    const RB = window.NSFT_RecordButtons;
    if (RB && RB.isHeaderlessPage && RB.isHeaderlessPage()) return;

    if (window.top !== window) return;

    try { document.documentElement.dataset.nsftSharePrompt = '1'; } catch (e) { }

    chrome.storage.local.get({
        [AT_KEY]: 0,
        [PAGES_KEY]: 0,
        [STATE_KEY]: null,
        [GATE_KEY]: null
    }, (items) => {
        if (chrome.runtime.lastError) return;

        const now = Date.now();
        const installedAt = items[AT_KEY] || now;
        const pages = items[PAGES_KEY] || 0;
        const state = items[STATE_KEY] || { off: false, snoozeUntil: 0 };
        const gate = items[GATE_KEY] || null;

        if (state.off) return;
        if (pages < MIN_PAGES) return;
        if (pages < (state.snoozeUntil || 0)) return;
        if ((now - installedAt) / 86400000 < MIN_DAYS) return;

        if (gate) {
            if (gate.at && (now - gate.at) / 86400000 < GAP_DAYS) return;
            if (gate.pages && (pages - gate.pages) < GAP_PAGES) return;
        }

        setTimeout(() => show(pages), SHOW_DELAY_MS);
    });

    chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== 'local') return;

        if (changes[STATE_KEY]) {
            const v = changes[STATE_KEY].newValue;
            if (v && (v.off || v.snoozeUntil)) { removeToast(); return; }
            if (v && !v.off && !v.snoozeUntil) fuerza();
            return;
        }

        if (changes[RATE_STATE_KEY]) {
            const o = changes[RATE_STATE_KEY].newValue;
            if (o && !o.off && !o.snoozeUntil) removeToast();
        }
    });

    function apunta(que) {
        try {
            chrome.storage.local.set({ nsftPromptDebug: { id: 'share', at: Date.now(), que } });
        } catch (e) { }
    }

    function fuerza() {
        chrome.storage.local.get({ [PAGES_KEY]: 0 }, (it) => {
            if (chrome.runtime.lastError) { apunta('storage: ' + chrome.runtime.lastError.message); return; }
            removeToast();
            setTimeout(() => {
                try { show(it[PAGES_KEY] || 0, true); } catch (e) {
                    apunta('error: ' + ((e && e.message) || e));
                }
            }, 320);
        });
    }

    function silence() {
        try { chrome.storage.local.set({ [STATE_KEY]: { off: true, snoozeUntil: 0 } }); } catch (e) { }
        removeToast();
    }

    function snooze(pages) {
        try {
            chrome.storage.local.set({
                [STATE_KEY]: { off: false, snoozeUntil: pages + SNOOZE_PAGES }
            });
        } catch (e) { }
        removeToast();
    }

    function marcaCompuerta(pages) {
        try { chrome.storage.local.set({ [GATE_KEY]: { at: Date.now(), pages } }); } catch (e) { }
    }

    function removeToast() {
        const t = document.getElementById(TOAST_ID);
        if (!t) return;
        t.classList.remove('nsft-shr-visible');
        setTimeout(() => {
            if (!t.isConnected) return;
            if (window.NSFT_Notices) window.NSFT_Notices.unmount(t);
            else t.remove();
        }, 250);
    }

    function t(key, fallback) {
        try {
            const msg = chrome.i18n.getMessage(key);
            if (msg) return msg;
        } catch (e) { }
        return fallback;
    }

    function openTab(url) {
        try { window.open(url, '_blank', 'noopener'); } catch (e) { }
    }

    const ICONS = {
        copy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>',
        facebook: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M15.5 3H13a3.5 3.5 0 0 0-3.5 3.5V9H7.5v3h2v9h3v-9h2.4l.6-3h-3V6.8c0-.5.3-.8.8-.8h2.2V3z"></path></svg>',
        x: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M3 3h4.9l4.3 5.9L17.4 3H21l-6.9 7.9L21.4 21h-4.9l-4.6-6.3L6.4 21H2.8l7.2-8.2L3 3zm3.1 1.7 9.9 14.6h1.7L7.8 4.7H6.1z"></path></svg>',
        whatsapp: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm0 2a8 8 0 1 1-4.1 14.9l-.4-.2-2.6.7.7-2.5-.2-.4A8 8 0 0 1 12 4zm-3.1 3.6c-.2 0-.4 0-.6.1-.2.1-.6.3-.9.9-.3.6-.4 1.4-.1 2.2.3.8 1.4 2.7 3.4 3.9 1.7 1 2.3 1 2.9.9.6-.1 1.4-.6 1.6-1.2.2-.6.2-1 .1-1.1l-.4-.2-1.5-.7c-.2-.1-.4-.1-.5.1l-.6.8c-.1.2-.3.2-.5.1a6 6 0 0 1-1.8-1.1 6.6 6.6 0 0 1-1.2-1.5c-.1-.2 0-.3.1-.4l.4-.5c.1-.1.1-.2.2-.4v-.4l-.6-1.4c-.1-.4-.3-.4-.5-.4z"></path></svg>',
        more: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"></circle><circle cx="6" cy="12" r="3"></circle><circle cx="18" cy="19" r="3"></circle><line x1="8.6" y1="13.5" x2="15.4" y2="17.5"></line><line x1="15.4" y1="6.5" x2="8.6" y2="10.5"></line></svg>'
    };

    function show(pages, forzado) {
        if (!document.body) { apunta('la página aún no tiene cuerpo'); return; }
        if (document.getElementById(TOAST_ID)) { apunta('ya estaba puesto'); return; }
        if (!forzado && document.querySelector('[data-nsft-prompt]')) {
            apunta('la esquina la tenía el otro aviso');
            return;
        }

        const toast = document.createElement('div');
        toast.id = TOAST_ID;
        toast.setAttribute('role', 'complementary');
        toast.setAttribute('data-nsft-prompt', 'share');

        const logo = document.createElement('img');
        logo.className = 'nsft-shr-logo';
        logo.src = chrome.runtime.getURL('assets/icons/icon48.png');
        logo.alt = '';

        const text = document.createElement('div');
        text.className = 'nsft-shr-text';

        const title = document.createElement('div');
        title.className = 'nsft-shr-title';
        title.textContent = t('shareTitle', '¿Le serviría a alguien de tu equipo?');

        const body = document.createElement('div');
        body.className = 'nsft-shr-body';
        body.textContent = t('shareBody', 'Pásale NetSuite Full Tools. Es gratis y se instala en un clic.');

        const actions = document.createElement('div');
        actions.className = 'nsft-shr-actions';

        const mensaje = t('shareMsg', 'NetSuite Full Tools: más de 100 herramientas para NetSuite, gratis.');

        const copiar = document.createElement('button');
        copiar.type = 'button';
        copiar.className = 'nsft-shr-btn nsft-shr-copy';
        copiar.innerHTML = ICONS.copy + '<span>' + t('shareCopy', 'Copiar enlace') + '</span>';
        copiar.title = t('shareCopyTitle', 'Copiar el enlace de la Chrome Web Store');
        copiar.addEventListener('click', () => {
            const hecho = () => { marcaCompuerta(pages); silence(); };
            const C = window.NSFT_Clipboard;
            if (C && C.copy) {
                C.copy(STORE_URL, { toast: { message: t('shareCopied', 'Enlace copiado') } });
                hecho();
                return;
            }
            try { navigator.clipboard.writeText(STORE_URL); } catch (e) { }
            hecho();
        });

        const red = (clase, icono, etiqueta, url) => {
            const b = document.createElement('button');
            b.type = 'button';
            b.className = 'nsft-shr-icon ' + clase;
            b.innerHTML = icono;
            b.title = etiqueta;
            b.setAttribute('aria-label', etiqueta);
            b.addEventListener('click', () => { openTab(url); marcaCompuerta(pages); silence(); });
            return b;
        };

        const u = encodeURIComponent(STORE_URL);
        const m = encodeURIComponent(mensaje);

        const iconos = document.createElement('div');
        iconos.className = 'nsft-shr-iconos';
        iconos.appendChild(red('is-fb', ICONS.facebook, t('shareFacebook', 'Compartir en Facebook'),
            'https://www.facebook.com/sharer/sharer.php?u=' + u));
        iconos.appendChild(red('is-x', ICONS.x, t('shareX', 'Compartir en X'),
            'https://x.com/intent/post?url=' + u + '&text=' + m));
        iconos.appendChild(red('is-wa', ICONS.whatsapp, t('shareWhatsapp', 'Compartir por WhatsApp'),
            'https://wa.me/?text=' + encodeURIComponent(mensaje + ' ' + STORE_URL)));

        if (navigator.share) {
            const mas = document.createElement('button');
            mas.type = 'button';
            mas.className = 'nsft-shr-icon is-mas';
            mas.innerHTML = ICONS.more;
            mas.title = t('shareMore', 'Más opciones para compartir');
            mas.setAttribute('aria-label', t('shareMore', 'Más opciones para compartir'));
            mas.addEventListener('click', () => {
                Promise.resolve()
                    .then(() => navigator.share({
                        title: 'NetSuite Full Tools',
                        text: mensaje,
                        url: STORE_URL
                    }))
                    .then(() => { marcaCompuerta(pages); silence(); })
                    .catch(() => { });
            });
            iconos.appendChild(mas);
        }

        actions.appendChild(copiar);
        actions.appendChild(iconos);

        const never = document.createElement('button');
        never.type = 'button';
        never.className = 'nsft-shr-never';
        never.textContent = t('shareNever', 'No volver a mostrar');
        never.addEventListener('click', silence);

        text.appendChild(title);
        text.appendChild(body);
        text.appendChild(actions);
        text.appendChild(never);

        const close = document.createElement('button');
        close.type = 'button';
        close.className = 'nsft-shr-close';
        close.title = t('shareCloseTitle', 'Ahora no');
        close.setAttribute('aria-label', t('shareCloseTitle', 'Ahora no'));
        close.textContent = '✕';
        close.addEventListener('click', () => { marcaCompuerta(pages); snooze(pages); });

        toast.appendChild(logo);
        toast.appendChild(text);
        toast.appendChild(close);
        if (!(window.NSFT_Notices && window.NSFT_Notices.mount(toast))) {
            document.body.appendChild(toast);
        }
        marcaCompuerta(pages);
        requestAnimationFrame(() => toast.classList.add('nsft-shr-visible'));

        requestAnimationFrame(() => {
            let nota = 'pintado';
            try {
                const r = toast.getBoundingClientRect();
                if (!r.width || !r.height) nota = 'puesto pero sin tamaño';
                else {
                    const arriba = document.elementFromPoint(
                        Math.round(r.left + r.width / 2), Math.round(r.top + 12));
                    if (arriba && arriba !== toast && !toast.contains(arriba)) {
                        nota = 'tapado por ' + (arriba.id ? '#' + arriba.id : arriba.tagName.toLowerCase());
                    }
                }
            } catch (e) { nota = 'pintado (no se pudo medir)'; }
            apunta(nota);
        });
    }
})();
