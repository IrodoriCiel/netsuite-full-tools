(function () {
    'use strict';

    const STORAGE_KEY = 'enableBundleUninstallGuard';
    const FETCHER_PATH = 'scripts/modules/bundle_uninstall_guard/bundle_uninstall_guard_fetcher.js';
    const ASK_DEST = 'extension_bundleguard';
    const REPLY_DEST = 'fetcher_bundleguard';

    if (location.pathname !== '/app/bundler/bundlelist.nl') return;

    const t = (k, f, sus) => {
        try { return chrome.i18n.getMessage(k, sus) || f; } catch (e) { return f; }
    };

    let activo = false;

    chrome.storage.local.get({ [STORAGE_KEY]: true }, (it) => {
        activo = !!it[STORAGE_KEY];
        if (activo) inyecta();
    });

    chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== 'local' || !changes[STORAGE_KEY]) return;
        activo = changes[STORAGE_KEY].newValue !== false;
        if (activo) inyecta();
        enviaEstado();
    });

    window.addEventListener('message', onPregunta);

    function inyecta() {
        if (document.getElementById('nsft-bundle-guard-fetcher')) return;
        const s = document.createElement('script');
        s.id = 'nsft-bundle-guard-fetcher';
        s.src = chrome.runtime.getURL(FETCHER_PATH);
        s.onload = enviaEstado;
        (document.head || document.documentElement).appendChild(s);
    }

    function enviaEstado() {
        window.postMessage({ dest: REPLY_DEST, type: 'state', activo: activo }, '*');
    }

    function responde(reqId, type, ok) {
        window.postMessage({ dest: REPLY_DEST, reqId: reqId, type: type, ok: !!ok }, '*');
    }

    async function onPregunta(ev) {
        if (ev.source !== window) return;
        const d = ev.data;
        if (!d || d.dest !== ASK_DEST || d.type !== 'ask' || typeof d.reqId !== 'string') return;
        responde(d.reqId, 'ack');
        const saltado = !!(d.payload && d.payload.saltado);
        if (!activo && !saltado) { responde(d.reqId, 'answer', true); return; }
        const id = String((d.payload && d.payload.id) || '').replace(/\D/g, '');
        let ok = false;
        try { ok = await pregunta(nombreDe(id)); } catch (e) { ok = false; }
        responde(d.reqId, 'answer', ok);
    }

    function nombreDe(id) {
        const icono = id && document.getElementById('spn_BUNDLEACTIONS_' + id);
        const fila = icono && icono.closest('tr');
        const enlace = fila && (fila.querySelector('a[href*="bundlebuilder.nl"]') || fila.querySelector('a.dottedlink'));
        return enlace ? enlace.textContent.replace(/\s+/g, ' ').trim() : '';
    }

    async function pregunta(nombre) {
        const palabra = t('del_type_confirm_word', 'DELETE');
        const cuerpo = (nombre ? t('bundleGuardName', 'Bundle: $1', [nombre]) + '\n\n' : '')
            + t('bundleGuardBody', 'Uninstalling it deletes the bundle and all its objects (custom records, forms, scripts…) from the account. It cannot be undone.')
            + '\n\n' + t('bundleGuardPrompt', 'Type $1 to uninstall it.', [palabra]);
        if (window.NSFT_Dialog) {
            return window.NSFT_Dialog.confirm({
                title: t('bundleGuardTitle', 'Uninstall bundle'),
                body: cuerpo,
                danger: true,
                word: palabra,
                ok: t('bundleGuardOk', 'Uninstall'),
                cancel: t('del_confirm_cancel', 'Cancel')
            });
        }
        const v = window.prompt(cuerpo);
        return v != null && v.trim().toUpperCase() === palabra.toUpperCase();
    }
})();
