(function () {
    'use strict';

    const STORAGE_KEY = 'enableFullLogsButton';
    const NEWTAB_KEY = 'fullLogsOpenInNewTab';
    const LIVE_MODE_KEY = 'enableLiveMode';
    const CONTAINER_CLASS = 'nsft-full-logs-container';
    const BTN_CLASS = 'nsft-full-logs-btn';
    const LIVE_MODE_CLASS = 'nsft-log-live-mode-container';

    if (!/\/scripting\/(?:script|scriptrecord|scriptdeploy)\.nl(\?|$)/.test(location.pathname + location.search)) return;

    let injectedTd = null;
    let cachedScriptRecordId = null;
    let unsubscribeObserver = null;
    let storageListener = null;
    let openInNewTab = true;
    let liveModeEnabled = true;

    chrome.storage.local.get({
        [STORAGE_KEY]: true,
        [NEWTAB_KEY]: true,
        [LIVE_MODE_KEY]: true
    }, (items) => {
        openInNewTab = items[NEWTAB_KEY] !== false;
        liveModeEnabled = items[LIVE_MODE_KEY] !== false;
        attachStorageListener();
        if (!items[STORAGE_KEY]) return;
        start();
    });

    function start() {
        if (window.NSFT_Observer && typeof window.NSFT_Observer.subscribe === 'function') {
            unsubscribeObserver = window.NSFT_Observer.subscribe(tryInject, { throttle: 150, immediate: true });
        } else {
            tryInject();
        }
    }

    function attachStorageListener() {
        if (storageListener) return;
        storageListener = (changes, area) => {
            if (area !== 'local') return;

            if (changes[NEWTAB_KEY]) {
                openInNewTab = changes[NEWTAB_KEY].newValue !== false;
                if (injectedTd) {
                    const link = injectedTd.querySelector('.' + BTN_CLASS);
                    if (link) applyTargetAttrs(link);
                }
            }

            if (changes[LIVE_MODE_KEY]) {
                liveModeEnabled = changes[LIVE_MODE_KEY].newValue !== false;
                if (injectedTd) {
                    injectedTd.remove();
                    injectedTd = null;
                    tryInject();
                }
            }

            if (changes[STORAGE_KEY]) {
                const enabled = changes[STORAGE_KEY].newValue !== false;
                if (!enabled) teardown();
                else if (!injectedTd) start();
            }
        };
        chrome.storage.onChanged.addListener(storageListener);
    }

    function tryInject() {
        if (injectedTd && document.body.contains(injectedTd)) return;

        const refreshTable = (window.NSFT_DOM && window.NSFT_DOM.q)
            ? window.NSFT_DOM.q(['#tbl_refreshscriptnote'], { module: 'full_logs_button', purpose: 'refresh-row' })
            : document.getElementById('tbl_refreshscriptnote');
        const tr = refreshTable && refreshTable.closest('tr');
        if (!tr) return;

        let liveModeTd = null;
        if (liveModeEnabled) {
            const liveModeContainer = document.querySelector('.' + LIVE_MODE_CLASS);
            liveModeTd = liveModeContainer && liveModeContainer.closest('td');
            if (!liveModeTd) return;
        }

        inject(tr, liveModeTd);
    }

    function inject(tr, liveModeTd) {
        const label = chrome.i18n.getMessage('logFullArchive') || 'Full Logs';
        const title = chrome.i18n.getMessage('logFullArchiveTitle') || 'Abrir archivo completo de logs';

        const td = document.createElement('td');
        td.className = CONTAINER_CLASS;
        td.style.paddingLeft = '15px';
        td.style.verticalAlign = 'middle';

        const link = document.createElement('a');
        link.className = BTN_CLASS;
        link.href = '#';
        link.textContent = label;
        link.title = title;
        applyTargetAttrs(link);

        link.addEventListener('click', onLinkClick);
        td.appendChild(link);

        if (liveModeTd) {
            liveModeTd.insertAdjacentElement('afterend', td);
        } else {
            tr.appendChild(td);
        }

        injectedTd = td;
    }

    function applyTargetAttrs(link) {
        if (openInNewTab) {
            link.target = '_blank';
            link.rel = 'noopener noreferrer';
        } else {
            link.removeAttribute('target');
            link.removeAttribute('rel');
        }
    }

    function onLinkClick(e) {
        const url = buildFullLogsUrl();
        if (!url) {
            e.preventDefault();
            return;
        }
        e.currentTarget.href = url;
    }

    function buildFullLogsUrl() {
        const current = new URL(location.href);
        const id = current.searchParams.get('id');
        if (!id) return null;

        const scriptId = resolveScriptId(current, id);
        if (!scriptId) return null;

        const scriptRecordId = resolveScriptRecordId();

        const target = new URL('/app/common/scripting/scriptnotearchive.nl', location.origin);
        target.searchParams.set('daterange', 'ALL');
        target.searchParams.set('date', 'ALL');
        target.searchParams.set('sortcol', 'timestamp');
        target.searchParams.set('sortdir', 'DESC');
        target.searchParams.set('loglevel', '');
        target.searchParams.set('scriptId', scriptId);
        if (scriptRecordId) target.searchParams.set('scriptRecordId', scriptRecordId);
        return target.toString();
    }

    function resolveScriptId(current, pageId) {
        if (/\/scripting\/script\.nl/i.test(current.pathname)) return pageId;

        const hasDeploySublist = document.querySelector('tr.uir-list-row-tr a[href*="scriptdeploy.nl"]');
        if (hasDeploySublist) return pageId;

        const links = document.querySelectorAll('a[href*="script.nl?id="]');
        for (const a of links) {
            try {
                const sid = new URL(a.getAttribute('href'), location.origin).searchParams.get('id');
                if (sid && sid !== pageId) return sid;
            } catch (e) { }
        }
        return pageId;
    }

    function resolveScriptRecordId() {
        if (cachedScriptRecordId !== null) return cachedScriptRecordId;

        const existing = document.querySelector('a[href*="scriptnotearchive.nl"]:not(.' + BTN_CLASS + ')');
        if (existing && existing.href) {
            try {
                const existingUrl = new URL(existing.href, location.origin);
                const sr = existingUrl.searchParams.get('scriptRecordId');
                if (sr) {
                    cachedScriptRecordId = sr;
                    return sr;
                }
            } catch (e) { }
        }

        const deployLink = document.querySelector('tr.uir-list-row-tr a[href*="scriptdeploy.nl"]');
        if (deployLink && deployLink.href) {
            try {
                const deployUrl = new URL(deployLink.href, location.origin);
                const deployId = deployUrl.searchParams.get('id');
                if (deployId) {
                    cachedScriptRecordId = deployId;
                    return deployId;
                }
            } catch (e) { }
        }

        return null;
    }

    function teardown() {
        if (unsubscribeObserver) {
            try { unsubscribeObserver(); } catch (e) { }
            unsubscribeObserver = null;
        }
        if (injectedTd && injectedTd.parentNode) {
            injectedTd.parentNode.removeChild(injectedTd);
        }
        injectedTd = null;
        cachedScriptRecordId = null;
    }
})();
