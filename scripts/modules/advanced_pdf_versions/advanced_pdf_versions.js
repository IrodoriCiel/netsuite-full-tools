(function () {
    'use strict';

    const STORAGE_KEY = 'enableAdvancedPdfVersions';
    const VERSION_EL_ID = 'pdftemplate-version-number';

    const IDS = {
        CONTAINER: 'nsft-pdf-versions-container',
        SELECT: 'nsft-pdf-versions-select'
    };

    let started = false;
    let discreet = false;
    let _diag = false;
    let _unsub = null;
    let renderedFor = null;
    const _versionlessCache = new Map();

    function isApplicablePage() {
        return /\/pdftemplate\.nl/i.test(location.pathname);
    }
    if (!isApplicablePage()) return;

    chrome.storage.local.get({ [STORAGE_KEY]: true, enableDiscreetMode: false, nsftSelectorDiagnostics: false }, (settings) => {
        discreet = !!settings.enableDiscreetMode;
        _diag = !!settings.nsftSelectorDiagnostics;
        if (settings[STORAGE_KEY] && !discreet) onReady(start);
    });

    chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== 'local') return;
        if (changes.nsftSelectorDiagnostics) _diag = !!changes.nsftSelectorDiagnostics.newValue;
        if (changes.enableDiscreetMode) discreet = !!changes.enableDiscreetMode.newValue;
        if (changes[STORAGE_KEY] || changes.enableDiscreetMode) {
            chrome.storage.local.get({ [STORAGE_KEY]: true, enableDiscreetMode: false }, (s) => {
                if (s[STORAGE_KEY] && !s.enableDiscreetMode) onReady(start);
                else teardown();
            });
        }
    });

    function onReady(cb) {
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', cb, { once: true });
        else cb();
    }

    function diag(msg) { if (_diag) console.warn('NSFT advanced pdf versions:', msg); }

    function getVersionEl() {
        return document.getElementById(VERSION_EL_ID) ||
               document.querySelector('[id*="version-number"]');
    }

    function teardown() {
        if (_unsub) { _unsub(); _unsub = null; }
        document.getElementById(IDS.CONTAINER)?.remove();
        renderedFor = null;
        started = false;
    }

    function start() {
        if (started) return;
        started = true;
        generateVersionSelector();
        if (window.NSFT_Observer && typeof window.NSFT_Observer.subscribe === 'function') {
            _unsub = window.NSFT_Observer.subscribe(checkVersionChange, { throttle: 500 });
        } else {
            const mo = new MutationObserver(checkVersionChange);
            mo.observe(document.body, { childList: true, subtree: true, characterData: true });
            _unsub = () => mo.disconnect();
        }
    }

    function checkVersionChange() {
        if (!started) return;
        const n = Number(getVersionEl()?.innerText);
        if (Number.isFinite(n) && renderedFor != null && n !== renderedFor) {
            document.getElementById(IDS.CONTAINER)?.remove();
            generateVersionSelector();
        }
    }

    async function fetchMaxVersion(url) {
        if (_versionlessCache.has(url)) return _versionlessCache.get(url);
        try {
            const res = await fetch(url, { credentials: 'include' });
            if (!res.ok) { diag('HTTP ' + res.status + ' al resolver la versión máxima'); return null; }
            const text = await res.text();
            const doc = new DOMParser().parseFromString(text, 'text/html');
            const el = doc.getElementById(VERSION_EL_ID) || doc.querySelector('[id*="version-number"]');
            const n = Number((el?.textContent || '').trim());
            if (Number.isFinite(n) && n > 0) { _versionlessCache.set(url, n); return n; }
        } catch (e) { diag(e); }
        return null;
    }

    async function generateVersionSelector() {
        const currentVersionNumber = Number(getVersionEl()?.innerText);
        let versionNumber;
        let versionlessUrl;

        if (window.location.href.includes('&version=')) {
            const params = new URLSearchParams(window.location.search);
            params.delete('version');
            versionlessUrl = `${window.location.href.split('?')[0]}?${params.toString()}`;
            versionNumber = await fetchMaxVersion(versionlessUrl);
        } else {
            versionlessUrl = window.location.href;
            versionNumber = currentVersionNumber;
        }

        if (!started) return;
        if (!versionNumber) return;

        renderedFor = currentVersionNumber;
        const currentLabel = chrome.i18n.getMessage('apdfVerCurrent') || ' (Current)';
        const templateLabel = chrome.i18n.getMessage('apdfVerTemplate') || 'Template Version:';

        let optionsHtml = '';
        for (let i = versionNumber; i > 0; i--) {
            optionsHtml += `
                <option value="${i}" ${i === currentVersionNumber ? 'selected="true"' : ''}>
                    ${i}${i === versionNumber ? currentLabel : ''}
                </option>`;
        }

        const html = `
            <div id="${IDS.CONTAINER}" data-nsft-ui>
                <label for="${IDS.SELECT}">${templateLabel}</label>
                <select id="${IDS.SELECT}" name="${IDS.SELECT}">${optionsHtml}</select>
            </div>`;

        const editorTop = document.getElementById('pdfeditor-top');
        if (editorTop) {
            editorTop.insertAdjacentHTML('beforeend', html);
        } else {
            document.getElementById('pdftemplate-editor')?.insertAdjacentHTML('beforebegin', html);
        }

        document.getElementById(IDS.SELECT)?.addEventListener('change', (evt) => {
            const selectedVersion = evt.target.value;
            window.location.href = selectedVersion === String(versionNumber)
                ? versionlessUrl
                : `${versionlessUrl}&version=${selectedVersion}`;
        });
    }
})();
