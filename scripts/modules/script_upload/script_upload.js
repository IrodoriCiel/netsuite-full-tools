(function () {
    'use strict';

    const STORAGE_KEY = 'enableScriptUpload';
    const DISCREET_KEY = 'enableDiscreetMode';
    const NSFT_THEME_KEY = 'nsftTheme';
    const FETCHER_PATH = 'scripts/modules/script_upload/script_upload_fetcher.js';

    if (!/\/scripting\/script\.nl(?:\?|$)/.test(location.pathname + location.search)) return;

    let fetcherInjected = false;
    let storageListener = null;
    let unsubscribeObserver = null;
    let active = false;
    let _theme = 'auto';

    chrome.storage.local.get({
        [STORAGE_KEY]: true,
        [DISCREET_KEY]: false,
        [NSFT_THEME_KEY]: 'auto'
    }, (settings) => {
        _theme = settings[NSFT_THEME_KEY] || 'auto';
        attachStorageListener();
        if (!settings[STORAGE_KEY] || settings[DISCREET_KEY]) return;
        start();
    });

    function start() {
        if (active) return;
        active = true;
        injectFetcher();
        if (window.NSFT_Observer && typeof window.NSFT_Observer.subscribe === 'function') {
            unsubscribeObserver = window.NSFT_Observer.subscribe(() => {
                if (!document.getElementById('nsft-script-drop-zone')) {
                    postReinitMessage();
                }
            }, { throttle: 300 });
        }
    }

    function stop() {
        if (!active) return;
        active = false;
        if (unsubscribeObserver) {
            try { unsubscribeObserver(); } catch (e) { }
            unsubscribeObserver = null;
        }
        window.postMessage({ type: 'nsft-script-upload-teardown' }, '*');
    }

    function attachStorageListener() {
        if (storageListener) return;
        storageListener = (changes, area) => {
            if (area !== 'local') return;
            if (changes[STORAGE_KEY]) {
                const enabled = changes[STORAGE_KEY].newValue !== false;
                if (!enabled) {
                    stop();
                } else {
                    chrome.storage.local.get({ [DISCREET_KEY]: false }, (s) => {
                        if (!s[DISCREET_KEY]) start();
                    });
                }
            }
            if (changes[NSFT_THEME_KEY]) {
                _theme = changes[NSFT_THEME_KEY].newValue || 'auto';
                window.postMessage({
                    type: 'nsft-script-upload-theme',
                    theme: _theme
                }, '*');
            }
            if (changes[DISCREET_KEY]) {
                const discreet = !!changes[DISCREET_KEY].newValue;
                if (discreet) {
                    stop();
                } else {
                    chrome.storage.local.get({ [STORAGE_KEY]: true }, (s) => {
                        if (s[STORAGE_KEY] !== false) start();
                    });
                }
            }
        };
        chrome.storage.onChanged.addListener(storageListener);
    }

    function injectFetcher() {
        if (fetcherInjected) {
            postReinitMessage();
            return;
        }
        const s = document.createElement('script');
        s.src = chrome.runtime.getURL(FETCHER_PATH);
        s.dataset.nsftI18n = JSON.stringify(buildI18nPayload());
        s.dataset.nsftTheme = _theme;
        s.onload = function () {
            this.remove();
            fetcherInjected = true;
        };
        (document.head || document.documentElement).appendChild(s);
    }

    function postReinitMessage() {
        window.postMessage({
            type: 'nsft-script-upload-reinit',
            i18n: buildI18nPayload(),
            theme: _theme
        }, '*');
    }

    function buildI18nPayload() {
        const get = (k, fallback) => chrome.i18n.getMessage(k) || fallback;
        return {
            dropText: get('suDropText', 'Soltar script aquí'),
            errFileMismatchName: get('suErrFileMismatchName', 'El nombre no coincide'),
            errFileMismatchMsg: get('suErrFileMismatchMsg', 'El archivo soltado no coincide con el nombre del archivo en el registro de Script.'),
            errNoFolderName: get('suErrNoFolderName', 'Carpeta no encontrada'),
            errNoFolderMsg: get('suErrNoFolderMsg', 'No se pudo determinar la carpeta destino para subir el archivo.'),
            errUploadName: get('suErrUploadName', 'Error al subir el archivo'),
            errUploadMsg: get('suErrUploadMsg', 'Revisa la consola para ver detalles.'),
            successTitle: get('suSuccessTitle', 'Archivo subido'),
            successUploadedAt: get('suSuccessUploadedAt', 'Subido el:'),
            diffTitle: get('suDiffTitle', 'Confirmar reemplazo'),
            diffSubtitle: get('suDiffSubtitle', 'Comparando el archivo actual con el nuevo. Revisa los cambios antes de subir.'),
            diffLeft: get('suDiffLeft', 'Actual'),
            diffRight: get('suDiffRight', 'Nuevo'),
            diffCancel: get('suDiffCancel', 'Cancelar'),
            diffConfirm: get('suDiffConfirm', 'Subir y reemplazar'),
            diffNoChanges: get('suDiffNoChanges', 'Sin cambios. El archivo es idéntico al actual.'),
            diffTooLarge: get('suDiffTooLarge', 'Archivo demasiado grande para mostrar el diff completo. Se mostrarán solo las primeras 5000 líneas.'),
            diffLoadFailed: get('suDiffLoadFailed', 'No se pudo obtener el archivo actual. Se mostrará solo el nuevo contenido.')
        };
    }
})();
