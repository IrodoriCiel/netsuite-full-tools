(function () {
    'use strict';

    if (window.top !== window) return;
    if (window.__nsftSuiteLoader) return;
    window.__nsftSuiteLoader = true;

    const cargado = () => !!window.__nsftAiAgentInit;

    let aiMaster = true;
    let aiPage = true;

    const READY_TIMEOUT_MS = 4000;
    const listos = { runner: false, console: false };
    const esperando = { runner: [], console: [] };

    window.addEventListener('nsft-suite-ready', (e) => {
        const m = e && e.detail && e.detail.module;
        if (!m || !(m in listos)) return;
        listos[m] = true;
        const cola = esperando[m].splice(0);
        cola.forEach((fn) => { try { fn(); } catch (err) { } });
    });

    let _carga = null;
    function cargar() {
        if (cargado()) return Promise.resolve();
        if (_carga) return _carga;
        _carga = new Promise((resolve, reject) => {
            try {
                chrome.runtime.sendMessage({ nsftSuite: 'load' }, (r) => {
                    const err = chrome.runtime.lastError;
                    if (err || !r || !r.ok) {
                        _carga = null;
                        reject(new Error((err && err.message) || (r && r.error) || 'sin respuesta'));
                        return;
                    }
                    resolve();
                });
            } catch (e) {
                _carga = null;
                reject(e);
            }
        });
        return _carga;
    }

    const EVENTOS = {
        'nsft-show-suiteql-runner': 'runner',
        'nsft-show-suitescript-console': 'console',
        'nsft-ssc-fragmento': null,
        'nsft-show-fragmentos': null
    };

    window.addEventListener('nsft-ai-ask-record', () => {
        if (cargado()) return;
        if (!(aiMaster && aiPage)) return;
        try {
            chrome.runtime.sendMessage({ nsftPanel: 'open', panel: 'ai' }, (resp) => {
                void chrome.runtime.lastError;
                if (!(resp && resp.ok)) {
                    console.warn('NSFT: no se pudo abrir el panel lateral —',
                        (resp && resp.reason) || 'sin respuesta del service worker');
                }
            });
        } catch (e) { }
        if (window.NSFT_ShortcutCoach) window.NSFT_ShortcutCoach.hint('ai_assistant_page');
    });

    function cuandoListo(modulo, fn) {
        if (!modulo || listos[modulo]) { fn(); return; }
        let hecho = false;
        const una = () => { if (hecho) return; hecho = true; fn(); };
        esperando[modulo].push(una);
        setTimeout(una, READY_TIMEOUT_MS);
    }

    Object.keys(EVENTOS).forEach((tipo) => {
        window.addEventListener(tipo, (e) => {
            if (cargado()) return;
            const detail = e ? e.detail : undefined;
            cargar().then(() => {
                cuandoListo(EVENTOS[tipo], () => {
                    window.dispatchEvent(new CustomEvent(tipo, { detail }));
                });
            }).catch((err) => {
                console.warn('[NSFT] No se pudo cargar el SuiteQL Runner / la Consola:', err && err.message);
            });
        });
    });


    const S = window.NSFT_Shortcuts;
    const RB = window.NSFT_RecordButtons;
    const msg = (k, def) => { try { return chrome.i18n.getMessage(k) || def; } catch (e) { return def; } };
    const GLOBAL = () => msg('cheatsheet_group_global', 'Global');

    function excluida() {
        const href = location.href;
        if (href.includes('/app/bundler/previewbundleupdate.nl')) return true;
        try { if (RB && typeof RB.isExcludedPage === 'function') return RB.isExcludedPage(); } catch (e) { }
        return ['/app/setup/assistants/bundlebuilder.nl', '/app/bundler/installbundle.nl',
            '/app/bundler/bundledetails.nl'].some((p) => href.includes(p));
    }

    chrome.storage.local.get({
        enableSuiteQLRunner: true,
        enableSuiteScriptConsole: true,
        enableAiAssistant: true,
        aiAssistantPage: true
    }, (it) => {
        aiMaster = it.enableAiAssistant !== false;
        aiPage = it.aiAssistantPage !== false;
        if (!S || !S.bind || cargado()) return;
        const fuera = excluida();
        if (it.enableSuiteQLRunner && !fuera) {
            S.bind('suiteql_runner', {
                label: msg('cheatsheet_item_open_runner', 'Open SuiteQL Runner'),
                defaultCombo: { ctrlKey: false, shiftKey: true, altKey: true, code: 'KeyQ' },
                storageKey: 'suiteqlRunnerShortcut',
                event: 'nsft-show-suiteql-runner',
                group: GLOBAL(),
                order: 30
            });
        }
        if (it.enableSuiteScriptConsole && !fuera) {
            S.bind('suitescript_console', {
                label: msg('cheatsheet_item_open_ssc', 'Open SuiteScript Console'),
                defaultCombo: { ctrlKey: false, shiftKey: true, altKey: true, code: 'KeyJ' },
                storageKey: 'suitescriptConsoleShortcut',
                event: 'nsft-show-suitescript-console',
                group: GLOBAL(),
                order: 30
            });
        }
        S.bind('ai_assistant_page', {
            label: msg('enableAiAssistantLabel', 'AI Assistant'),
            defaultCombo: { ctrlKey: false, shiftKey: true, altKey: true, code: 'KeyA' },
            storageKey: 'aiAssistantShortcut',
            event: 'nsft-ai-ask-record',
            group: GLOBAL(),
            order: 48,
            isEnabled: () => aiMaster && aiPage
        });
    });

    chrome.storage.onChanged.addListener((ch, area) => {
        if (area !== 'local') return;
        if (ch.enableAiAssistant) aiMaster = ch.enableAiAssistant.newValue !== false;
        if (ch.aiAssistantPage) aiPage = ch.aiAssistantPage.newValue !== false;
    });
})();
