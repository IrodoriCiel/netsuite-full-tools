(function () {
    'use strict';

    const STORAGE_KEY = 'enableExportSearch';
    const NSFT_THEME_KEY = 'nsftTheme';

    if (!/\/app\/common\/search\/search\.nl/i.test(window.location.pathname)) return;

    let lastMaximizedLeft = '10px';
    let lastMaximizedTop = '10px';
    let fetcherState = 'none';
    let pendingInit = null;
    let _nsftTheme = 'light';
    let _discreet = false;

    function _nsftResolveTheme() {
        return _nsftTheme === 'dark' ? 'dark' : 'light';
    }
    function _nsftApplyThemeToModal() {
        const m = document.getElementById('nsft-export-search-modal');
        if (m) m.setAttribute('data-theme', _nsftResolveTheme());
    }
    chrome.storage.local.get({ [NSFT_THEME_KEY]: 'light' }, (items) => {
        _nsftTheme = items[NSFT_THEME_KEY] || 'light';
        _nsftApplyThemeToModal();
    });
    chrome.storage.onChanged.addListener((changes, area) => {
        if (area === 'local' && changes[NSFT_THEME_KEY]) {
            _nsftTheme = changes[NSFT_THEME_KEY].newValue || 'light';
            _nsftApplyThemeToModal();
        }
    });

    chrome.storage.local.get({
        [STORAGE_KEY]: true,
        exportSearchTheme: "atom-one-dark",
        enableDiscreetMode: false
    }, (items) => {
        if (!items[STORAGE_KEY]) return;

        _discreet = !!items.enableDiscreetMode;
        init(items);
    });

    function init(items) {
        updateTheme(items.exportSearchTheme || 'atom-one-dark');

        chrome.storage.onChanged.addListener((changes, area) => {
            if (area !== 'local') return;
            if (changes.exportSearchTheme) {
                updateTheme(changes.exportSearchTheme.newValue || 'atom-one-dark');
            }
            if (changes.enableDiscreetMode) {
                _discreet = !!changes.enableDiscreetMode.newValue;
                if (_discreet) {
                    const modal = document.getElementById('nsft-export-search-modal');
                    if (modal) modal.style.display = 'none';
                }
            }
        });

        setupListeners();
    }

    function setupListeners() {
        if (window.NSFT_Shortcuts && window.NSFT_Shortcuts.bind) {
            window.NSFT_Shortcuts.bind('export_search', {
                label: chrome.i18n.getMessage('enableExportSearchLabel') || 'Export Saved Search',
                defaultCombo: { ctrlKey: false, shiftKey: true, altKey: true, code: 'KeyE' },
                storageKey: 'exportSearchShortcut',
                event: 'nsft-show-export-search',
                group: chrome.i18n.getMessage('cheatsheet_group_global') || 'Global',
                order: 42
            });
        }

        window.addEventListener('nsft-show-export-search', () => {
            if (_discreet) return;
            if (window.NSFT_ShortcutCoach) window.NSFT_ShortcutCoach.hint('export_search');
            const modal = document.getElementById('nsft-export-search-modal');
            if (!modal) {
                initModal();
            } else {
                modal.style.display = 'flex';
                modal.dataset.state = 'maximised';
                modal.style.top = lastMaximizedTop;
                modal.style.left = lastMaximizedLeft;
                modal.style.right = 'auto';
                modal.style.bottom = 'auto';
                updateTitleState();
                bringToFront();
                modal.focus();
                runExport();
            }
        });

        window.addEventListener('nsft-layout-update', () => {
            const modal = document.getElementById('nsft-export-search-modal');
            if (modal && modal.dataset.state === 'minimised') {
            }
        });

        window.addEventListener('message', (event) => {
            if (event.source !== window || !event.data) return;
            if (event.data.type === 'nsft-export-search-success') {
                renderResults(event.data.payload);
            } else if (event.data.type === 'nsft-export-search-error') {
                renderError(event.data.payload);
            }
        });
    }

    function runExport() {
        const contentDiv = document.querySelector('.nsft-export-search-content');
        if (contentDiv) {
            contentDiv.innerHTML = getLoadingHtml(chrome.i18n.getMessage('es_loading') || 'Loading...');
        }

        const translations = {
            consoleSuccess: chrome.i18n.getMessage('es_console_success_log') || 'Search loaded in console successfully. Available variable: ',
            totalResults: chrome.i18n.getMessage('es_console_total_results') || 'Total Results:',
            execError: chrome.i18n.getMessage('es_console_exec_error') || 'NSFT Execution Error:'
        };

        const initMsg = { type: 'nsft-export-search-init', translations };

        if (fetcherState === 'ready') {
            window.postMessage(initMsg, '*');
        } else {
            pendingInit = initMsg;
            if (fetcherState === 'none') injectFetcher();
        }
    }

    function injectFetcher() {
        fetcherState = 'injecting';
        const script = document.createElement('script');
        script.src = chrome.runtime.getURL('scripts/modules/export_search/export_search_fetcher.js');
        script.onload = function () {
            this.remove();
            fetcherState = 'ready';
            if (pendingInit) {
                window.postMessage(pendingInit, '*');
                pendingInit = null;
            }
        };
        script.onerror = function () {
            this.remove();
            fetcherState = 'none';
            pendingInit = null;
        };
        (document.head || document.documentElement).appendChild(script);
    }


    let _resultsShell = null;
    function getResultsShell() {
        if (_resultsShell) return _resultsShell;

        const labelSS2 = chrome.i18n.getMessage('es_label_ss2') || 'SuiteScript 2.x';
        const labelSS1 = chrome.i18n.getMessage('es_label_ss1') || 'SuiteScript 1.0';
        const labelCopy = chrome.i18n.getMessage('es_btn_copy') || 'Copy';
        const labelRun = chrome.i18n.getMessage('es_btn_run') || 'Send to Console';

        const iconCopy = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>`;
        const iconRun = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 17 10 11 4 5"></polyline><line x1="12" y1="19" x2="20" y2="19"></line></svg>`;

        _resultsShell = `
            <div class="nsft-export-search-tabs-bar">
                <div class="nsft-export-search-tabs" role="tablist">
                    <button class="nsft-export-search-tab active" role="tab" data-tab="ss2" aria-selected="true">${labelSS2}</button>
                    <button class="nsft-export-search-tab" role="tab" data-tab="ss1" aria-selected="false">${labelSS1}</button>
                </div>
                <div class="nsft-export-search-actions active" data-actions="ss2">
                    <button class="nsft-export-search-btn-copy" data-target="nsft-export-search-ss2">${iconCopy} <span>${labelCopy}</span></button>
                    <button class="nsft-export-search-btn-run" data-target="nsft-export-search-ss2c">${iconRun} <span>${labelRun}</span></button>
                </div>
                <div class="nsft-export-search-actions" data-actions="ss1">
                    <button class="nsft-export-search-btn-copy" data-target="nsft-export-search-ss1">${iconCopy} <span>${labelCopy}</span></button>
                    <button class="nsft-export-search-btn-run" data-target="nsft-export-search-ss1">${iconRun} <span>${labelRun}</span></button>
                </div>
            </div>

            <div class="nsft-export-search-panel active" data-panel="ss2" role="tabpanel">
                <pre id="nsft-export-search-ss2" class="prettyprint"><code class="language-javascript"></code></pre>
            </div>

            <div id="nsft-export-search-ss2c" style="display:none;"></div>

            <div class="nsft-export-search-panel" data-panel="ss1" role="tabpanel">
                <pre id="nsft-export-search-ss1" class="prettyprint"><code class="language-javascript"></code></pre>
            </div>
        `;
        return _resultsShell;
    }

    function renderResults(data) {
        const contentDiv = document.querySelector('.nsft-export-search-content');
        if (!contentDiv) return;

        const labelRunning = chrome.i18n.getMessage('es_running') || 'Running...';

        contentDiv.innerHTML = getResultsShell();

        const codeSS2 = contentDiv.querySelector('#nsft-export-search-ss2 code');
        const codeSS1 = contentDiv.querySelector('#nsft-export-search-ss1 code');
        const ss2cDiv = contentDiv.querySelector('#nsft-export-search-ss2c');
        if (codeSS2) codeSS2.textContent = data.ss2 || '';
        if (codeSS1) codeSS1.textContent = data.ss1 || '';
        if (ss2cDiv) ss2cDiv.textContent = data.ss2console || '';

        let ss1Highlighted = false;
        if (window.hljs && codeSS2) window.hljs.highlightElement(codeSS2);

        contentDiv.querySelectorAll('.nsft-export-search-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                const target = tab.getAttribute('data-tab');

                contentDiv.querySelectorAll('.nsft-export-search-tab').forEach(t => {
                    const isActive = t === tab;
                    t.classList.toggle('active', isActive);
                    t.setAttribute('aria-selected', isActive ? 'true' : 'false');
                });

                contentDiv.querySelectorAll('.nsft-export-search-panel').forEach(panel => {
                    panel.classList.toggle('active', panel.getAttribute('data-panel') === target);
                });

                contentDiv.querySelectorAll('.nsft-export-search-actions').forEach(group => {
                    group.classList.toggle('active', group.getAttribute('data-actions') === target);
                });

                if (target === 'ss1' && !ss1Highlighted && window.hljs && codeSS1) {
                    window.hljs.highlightElement(codeSS1);
                    ss1Highlighted = true;
                }
            });
        });

        contentDiv.querySelectorAll('.nsft-export-search-btn-copy').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const targetId = btn.getAttribute('data-target');
                const pEl = document.getElementById(targetId);
                const span = btn.querySelector('span');
                if (pEl) {
                    navigator.clipboard.writeText(pEl.textContent).then(() => {
                        const originalText = span ? span.textContent : btn.textContent;
                        if (span) span.textContent = chrome.i18n.getMessage('es_copied') || 'Copied!';
                        setTimeout(() => {
                            if (span) span.textContent = originalText;
                        }, 1500);
                    });
                }
            });
        });

        contentDiv.querySelectorAll('.nsft-export-search-btn-run').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const targetId = btn.getAttribute('data-target');
                const contentEl = document.getElementById(targetId);
                const span = btn.querySelector('span');

                if (contentEl && contentEl.textContent) {
                    try {
                        window.postMessage({
                            type: 'nsft-export-search-execute',
                            code: contentEl.textContent
                        }, '*');

                        const originalText = span ? span.textContent : btn.textContent;
                        if (span) span.textContent = labelRunning;
                        setTimeout(() => {
                            if (span) span.textContent = originalText;
                        }, 1000);
                    } catch (err) {
                        console.error("Execution Request Error:", err);
                    }
                }
            });
        });
    }

    function renderError(payload) {
        const contentDiv = document.querySelector('.nsft-export-search-content');
        if (!contentDiv) return;

        let title = chrome.i18n.getMessage('es_error_title') || 'Error';
        let message = chrome.i18n.getMessage('es_error_unknown') || 'An unknown error occurred.';

        if (payload.error === 'no_id') {
            title = chrome.i18n.getMessage('es_save_required_title') || 'Search Export - Save Required';
            message = `
                <p>${chrome.i18n.getMessage('es_save_required_msg1') || 'This tool requires the search to be saved in order to export.'}</p>
                <p>${chrome.i18n.getMessage('es_save_required_msg2') || 'Please save the search before continuing.'}</p>
                <p class="nsft-export-search-note">${chrome.i18n.getMessage('es_save_required_note') || "You can always delete the search if you don't need it after exporting."}</p>
            `;
        } else if (payload.error === 'load_failed') {
            title = chrome.i18n.getMessage('es_not_supported_title') || 'Export as Script Not Supported';
            message = `
                <p>${chrome.i18n.getMessage('es_not_supported_msg1') || 'This search type is not supported by SuiteScript.'}</p>
                <p>${chrome.i18n.getMessage('es_not_supported_msg2') || 'Please refer to this page in SuiteAnswers for more information:'}</p>
                <a href="https://suiteanswers.custhelp.com/app/answers/detail/a_id/10242" target="_blank">SuiteScript Supported Records</a>
                <p class="nsft-export-search-error-details">Details: ${escapeHtml(payload.details || '')}</p>
            `;
        } else if (payload.error === 'require_undefined') {
            message = `<p>${chrome.i18n.getMessage('es_require_error') || "Could not access SuiteScript 'N/search' module. Are you logged in?"}</p>`;
        } else {
            message = `<p>${chrome.i18n.getMessage('es_gen_error') || 'Error generating code: '}${escapeHtml(payload.details || '')}</p>`;
        }

        contentDiv.innerHTML = `
            <div class="nsft-export-search-message">
                <h2>${title}</h2>
                <div class="nsft-export-search-body">${message}</div>
            </div>
        `;
    }

    function escapeHtml(text) {
        if (window.NSFT_DOM && typeof window.NSFT_DOM.escapeHtml === 'function') {
            return window.NSFT_DOM.escapeHtml(text);
        }
        if (!text) return '';
        return String(text)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }


    function initModal() {
        if (document.getElementById('nsft-export-search-modal')) return;

        document.body.insertAdjacentHTML('beforeend', getHtmlTemplate());
        _nsftApplyThemeToModal();
        addModalListeners();

        const modal = document.getElementById('nsft-export-search-modal');
        constrainModalToWindow(modal);
        bringToFront();

        modal.addEventListener('mousedown', bringToFront);
        modal.focus();

        runExport();
    }

    function addModalListeners() {
        const modal = document.getElementById('nsft-export-search-modal');

        modal.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                modal.style.display = 'none';
                dispatchLayoutUpdate();
                return;
            }
            if (e.key !== 'Tab') return;
            const focusables = Array.from(modal.querySelectorAll(
                'a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])'
            )).filter(el => el.offsetParent !== null);
            if (!focusables.length) return;
            const first = focusables[0];
            const last = focusables[focusables.length - 1];
            if (e.shiftKey && document.activeElement === first) {
                e.preventDefault();
                last.focus();
            } else if (!e.shiftKey && document.activeElement === last) {
                e.preventDefault();
                first.focus();
            }
        });

        const clickHandler = (id, fn) => {
            const el = document.getElementById(id);
            if (el) el.addEventListener('click', fn);
        };

        clickHandler('nsft-export-search-minimise', () => {
            modal.dataset.state = 'minimised';
            updateTitleState();
            dispatchLayoutUpdate();
        });

        clickHandler('nsft-export-search-maximise', () => {
            modal.dataset.state = 'maximised';
            modal.style.top = lastMaximizedTop;
            modal.style.left = lastMaximizedLeft;
            updateTitleState();
            dispatchLayoutUpdate();
        });

        clickHandler('nsft-export-search-close', () => {
            modal.style.display = 'none';
            dispatchLayoutUpdate();
        });

        const header = modal.querySelector('.nsft-rec-obj-header');
        if (header) {
            header.addEventListener('dblclick', () => {
                const state = modal.dataset.state;
                if (state === 'minimised') {
                    modal.dataset.state = 'maximised';
                    modal.style.top = lastMaximizedTop;
                    modal.style.left = lastMaximizedLeft;
                } else {
                    modal.dataset.state = 'minimised';
                }
                updateTitleState();
                dispatchLayoutUpdate();
            });

            let mouseIsDown = false;
            let offsetX = 0;
            let offsetY = 0;

            const handleMouseMove = (event) => {
                if (mouseIsDown) {
                    event.preventDefault();
                    const newLeft = `${event.clientX - offsetX}px`;
                    const newTop = `${event.clientY - offsetY}px`;
                    modal.style.left = newLeft;
                    modal.style.top = newTop;
                    modal.style.right = 'auto';
                    modal.style.bottom = 'auto';

                    if (modal.dataset.state === 'maximised') {
                        lastMaximizedLeft = newLeft;
                        lastMaximizedTop = newTop;
                    }
                }
            };

            header.addEventListener('mousedown', (event) => {
                if (document.activeElement) document.activeElement.blur();
                if (event.target.closest('.nsft-header-actions')) return;

                mouseIsDown = true;
                modal.classList.add('nsft-dragging');
                offsetX = event.clientX - modal.offsetLeft;
                offsetY = event.clientY - modal.offsetTop;
                window.addEventListener('mousemove', handleMouseMove);
            });

            window.addEventListener('mouseup', () => {
                if (mouseIsDown) {
                    modal.classList.remove('nsft-dragging');
                    if (modal.dataset.state === 'minimised') {
                        requestAnimationFrame(() => snapToEdge(modal));
                    }
                }
                mouseIsDown = false;
                window.removeEventListener('mousemove', handleMouseMove);
            });
        }
    }

    function updateTitleState() {
        const el = document.getElementById('nsft-export-search-modal');
        const titleEl = document.getElementById('nsft-export-search-title');
        if (!el || !titleEl) return;

        const titleText = chrome.i18n.getMessage('es_title') || 'Export Search';
        const titleTextMin = chrome.i18n.getMessage('es_title_minimised') || 'Export Search';

        if (el.dataset.state === 'minimised') {
            titleEl.innerHTML = `<span class="nsft-export-search-title-minimised">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#000000" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 4px; vertical-align: middle;"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
                ${titleTextMin}
            </span>`;
            setTimeout(() => snapToEdge(el), 10);
        } else {
            titleEl.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#000000" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 6px; vertical-align: middle;"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>${titleText}`;
            constrainModalToWindow(el);
        }
    }

    function dispatchLayoutUpdate() {
        window.dispatchEvent(new CustomEvent('nsft-layout-update'));
    }

    function bringToFront() {
        const modal = document.getElementById('nsft-export-search-modal');
        if (!modal) return;
        const others = document.querySelectorAll('.nsft-rec-obj-modal, .nsft-scripted-rec-modal');
        let maxZ = 10001;
        others.forEach(m => {
            const z = parseInt(window.getComputedStyle(m).zIndex) || 10001;
            if (z > maxZ) maxZ = z;
        });
        modal.style.zIndex = maxZ + 1;
    }

    function constrainModalToWindow(el) {
        if (!el || (!el.style.left && !el.style.top)) return;
        const TARGET_WIDTH = el.offsetWidth || 800;
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;
        const rect = el.getBoundingClientRect();

        let currentLeft = parseInt(el.style.left) || rect.left;
        let currentTop = parseInt(el.style.top) || rect.top;
        let newLeft = currentLeft;
        let newTop = currentTop;

        if (currentLeft + TARGET_WIDTH > viewportWidth) newLeft = viewportWidth - TARGET_WIDTH - 15;
        if (newLeft < 15) newLeft = 15;
        if (currentTop < 15) newTop = 15;
        if (currentTop > viewportHeight - 50) newTop = viewportHeight - 100;

        if (newLeft !== currentLeft || newTop !== currentTop) {
            el.style.left = `${newLeft}px`;
            el.style.top = `${newTop}px`;
        }
    }

    function snapToEdge(el) {
        if (!el) return;
        el.style.right = 'auto';
        el.style.bottom = 'auto';

        const isMin = el.dataset.state === 'minimised';
        const rect = el.getBoundingClientRect();
        const viewportWidth = window.innerWidth;
        const targetWidth = isMin ? 165 : rect.width;
        const centerX = rect.left + (rect.width / 2);

        const p = 15;

        if (centerX < (viewportWidth / 2)) {
            el.style.left = `${p}px`;
        } else {
            el.style.left = `${viewportWidth - targetWidth - p}px`;
        }
        constrainModalToWindow(el);
    }


    const getLoadingHtml = (text) => {
        if (!text) text = chrome.i18n.getMessage('es_placeholder') || 'Loading...';
        const spans = text.split('').map(char => `<span${char === ' ' ? ' class="nsft-space-char"' : ''}>${char}</span>`).join('');
        return `<div class="nsft-loading-text">${spans}</div>`;
    };

    const getHtmlTemplate = () => `
        <div class="nsft-rec-obj-modal" id="nsft-export-search-modal" data-state="maximised" tabindex="-1" role="dialog" aria-modal="true" aria-labelledby="nsft-export-search-title">
            <div class="nsft-rec-obj-header">
                <span id="nsft-export-search-title"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#000000" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 6px; vertical-align: middle;"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>${chrome.i18n.getMessage('es_title') || 'Export Search'}</span>
                <span class="nsft-header-actions">
                    <span id="nsft-export-search-minimise"></span>
                    <span id="nsft-export-search-maximise"></span>
                    <span id="nsft-export-search-close">✕</span>
                </span>
                <div class="nsft-rec-obj-header-line"></div>
            </div>
            <div class="nsft-rec-obj-content">
                 <div class="nsft-export-search-content">
                    ${getLoadingHtml()}
                 </div>
            </div>
            <div class="nsft-rec-obj-footer">
                <!-- Footer placeholder -->
            </div>
        </div>`;

    async function updateTheme(themeName) {
        const themeUrl = chrome.runtime.getURL(`scripts/libs/highlight/themes/${themeName}.css`);
        try {
            const response = await fetch(themeUrl);
            let cssText = await response.text();

            cssText = cssText.replace(/\/\*[\s\S]*?\*\//g, '');

            const scope = `.nsft-export-search-content`;
            const scopedCss = cssText.replace(/((?:^|[},])\s*)([.#a-z])/gi, `$1${scope} $2`);

            let style = document.getElementById('nsft-export-search-theme');
            if (!style) {
                style = document.createElement('style');
                style.id = 'nsft-export-search-theme';
                document.head.appendChild(style);
            }
            style.textContent = scopedCss;
        } catch (e) {
            console.error("Error loading theme:", e);
        }
    }

})();
