(function () {
    'use strict';

    const STORAGE_KEY = 'enableWorkflowSearcher';
    const NSFT_THEME_KEY = 'nsftTheme';
    const PROGRESS_PANEL_ID = 'nsft-wf-progress-panel';
    const INDEXER_PANEL_ID = 'nsft-wf-indexer-panel';
    const PANEL_IDS = [PROGRESS_PANEL_ID, INDEXER_PANEL_ID];
    const FETCHER_PATH = 'scripts/modules/workflow_searcher/workflow_searcher_fetcher.js';

    let _nsftTheme = 'light';
    let _themeObserver = null;
    let started = false;

    function isApplicablePage() {
        return /\/app\/common\/workflow\//i.test(location.pathname);
    }
    if (!isApplicablePage()) return;

    function getWorkflowId() {
        try { return new URLSearchParams(window.location.search).get('id'); }
        catch (e) { return null; }
    }

    chrome.storage.local.get({ [STORAGE_KEY]: false, enableDiscreetMode: false, [NSFT_THEME_KEY]: 'light' }, (settings) => {
        _nsftTheme = settings[NSFT_THEME_KEY] || 'light';
        if (settings[STORAGE_KEY] && !settings.enableDiscreetMode) start();
    });

    chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== 'local') return;
        if (changes[NSFT_THEME_KEY]) {
            _nsftTheme = changes[NSFT_THEME_KEY].newValue || 'light';
            applyTheme();
        }
        if (changes[STORAGE_KEY] || changes.enableDiscreetMode) {
            chrome.storage.local.get({ [STORAGE_KEY]: false, enableDiscreetMode: false }, (s) => {
                if (s[STORAGE_KEY] && !s.enableDiscreetMode) start();
                else teardown();
            });
        }
    });

    function start() {
        if (started) return;
        const workflowId = getWorkflowId();
        if (!workflowId) return;
        started = true;
        setupThemeBridge();
        injectFetcher(workflowId);
    }

    function teardown() {
        if (!started) return;
        started = false;
        if (_themeObserver) { _themeObserver.disconnect(); _themeObserver = null; }
        PANEL_IDS.forEach(id => document.getElementById(id)?.remove());
    }

    function resolveTheme() {
        return _nsftTheme === 'dark' ? 'dark' : 'light';
    }

    function applyTheme() {
        const theme = resolveTheme();
        for (const id of PANEL_IDS) {
            const el = document.getElementById(id);
            if (el) el.setAttribute('data-theme', theme);
        }
    }

    function setupThemeBridge() {
        if (_themeObserver) return;
        _themeObserver = new MutationObserver(() => {
            if (PANEL_IDS.some(id => document.getElementById(id))) applyTheme();
        });
        _themeObserver.observe(document.documentElement, { childList: true, subtree: true });

    }

    function injectFetcher(workflowId) {
        const s = document.createElement('script');
        s.src = chrome.runtime.getURL(FETCHER_PATH);
        s.dataset.nsftWorkflowId = workflowId;
        s.onload = function () { this.remove(); };
        (document.head || document.documentElement).appendChild(s);
    }
})();
