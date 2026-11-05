(function () {
    'use strict';

    const STORAGE_KEY = 'enableConsoleUtils';
    const MAIN_PATH = 'scripts/modules/console_utils/console_utils_main.js';
    const FETCHER_DEST = 'fetcher_nsftutils';
    const REPLY_DEST = 'extension_nsftutils';

    if (!/^\/app\//.test(location.pathname)) return;

    const t = (k, f, sus) => {
        try { return chrome.i18n.getMessage(k, sus) || f; } catch (e) { return f; }
    };

    let listo = null;
    let encendido = false;

    function inyecta() {
        if (listo) return listo;
        listo = new Promise((resolver, rechazar) => {
            const s = document.createElement('script');
            s.src = chrome.runtime.getURL(MAIN_PATH);
            s.async = false;
            try { s.dataset.version = chrome.runtime.getManifest().version; } catch (e) { }
            try { s.dataset.lang = String(chrome.i18n.getUILanguage() || 'en').slice(0, 2); } catch (e) { }
            s.onload = () => { s.remove(); resolver(); };
            s.onerror = () => { listo = null; rechazar(new Error('console_utils')); };
            (document.head || document.documentElement).appendChild(s);
        });
        return listo;
    }

    chrome.storage.local.get({ [STORAGE_KEY]: true }, (it) => {
        if (!it[STORAGE_KEY]) return;
        encendido = true;
        inyecta().catch(() => { });
    });

    chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== 'local' || !changes[STORAGE_KEY]) return;
        encendido = changes[STORAGE_KEY].newValue !== false;
        if (encendido) inyecta().then(() => window.postMessage({ dest: FETCHER_DEST, type: 'on' }, '*'), () => { });
        else if (listo) window.postMessage({ dest: FETCHER_DEST, type: 'off' }, '*');
    });

    window.addEventListener('nsft-ss-versiones', async () => {
        const C = window.NSFT_Clipboard;
        const avisa = (msg, tipo) => { if (C && C.showToast) C.showToast(msg, { type: tipo || 'info', duration: 5000 }); };
        try { await inyecta(); } catch (e) { avisa(t('cu_ss_unknown', 'Could not check this page.'), 'error'); return; }
        const reqId = 'ss' + Date.now() + Math.random().toString(36).slice(2);
        const r = await new Promise((resolver) => {
            const tope = setTimeout(() => { window.removeEventListener('message', oye); resolver(null); }, 3000);
            function oye(ev) {
                const d = ev.data;
                if (ev.source !== window || !d || d.dest !== REPLY_DEST || d.reqId !== reqId) return;
                clearTimeout(tope);
                window.removeEventListener('message', oye);
                resolver(d);
            }
            window.addEventListener('message', oye);
            window.postMessage({ dest: FETCHER_DEST, type: 'ss', reqId }, '*');
        });
        if (!r) { avisa(t('cu_ss_unknown', 'Could not check this page.'), 'error'); return; }
        const si = t('cu_yes', 'yes');
        const no = t('cu_no', 'no');
        let msg = t('cu_ss_result', 'SuiteScript 2.x: $1 · SuiteScript 1.0: $2', [r.ss2 ? si : no, r.ss1 ? si : no]);
        if (!r.ss2 && !r.ss1) msg += ' — ' + t('cu_ss_none', 'this page does not load SuiteScript: scripts and the console will not find require or nlapi here.');
        if (encendido) msg += '\n' + t('cu_ss_hint', 'In the browser console, NSFT.help() lists the shortcuts.');
        avisa(msg, (r.ss2 || r.ss1) ? 'success' : 'info');
    });
})();
