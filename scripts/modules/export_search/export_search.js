(function () {
    'use strict';
    if (window.NSFT_Herramientas) window.NSFT_Herramientas.vigila('#nsft-export-search-modal', 'exportsearch');

    const STORAGE_KEY = 'enableExportSearch';
    const NSFT_THEME_KEY = 'nsftTheme';

    if (!/\/app\/common\/search\/search\.nl/i.test(window.location.pathname)) return;

    let lastMaximizedLeft = '10px';
    let lastMaximizedTop = '10px';
    let fetcherState = 'none';
    let pendingInit = null;
    let _nsftTheme = 'light';
    const WITH_LABELS_KEY = 'nsftExportSearchWithLabels';
    let _withLabels = false;
    const WITH_LOOP_KEY = 'nsftExportSearchWithLoop';
    let _withLoop = false;

    let _aiSql = false;
    const AI_KEYS = { enableSuiteQLRunner: true, enableAiAssistant: true, aiAssistantSearchSql: true };
    const calcAiSql = (it) => it.enableSuiteQLRunner !== false && it.enableAiAssistant !== false
        && it.aiAssistantSearchSql !== false;
    chrome.storage.local.get(AI_KEYS, (it) => { _aiSql = calcAiSql(it); });
    chrome.storage.onChanged.addListener((ch, area) => {
        if (area !== 'local' || !Object.keys(AI_KEYS).some((k) => ch[k])) return;
        chrome.storage.local.get(AI_KEYS, (it) => { _aiSql = calcAiSql(it); _footerShell = null; });
    });

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
            if (_requestedTheme === 'auto') updateTheme('auto');
        }
    });

    chrome.storage.local.get({
        [STORAGE_KEY]: true,
        exportSearchTheme: "atom-one-dark",
        [WITH_LABELS_KEY]: false,
        [WITH_LOOP_KEY]: false
    }, (items) => {
        if (!items[STORAGE_KEY]) return;

        _withLabels = items[WITH_LABELS_KEY] === true;
        _withLoop = items[WITH_LOOP_KEY] === true;
        init(items);
    });

    function init(items) {
        updateTheme(items.exportSearchTheme || 'auto');

        chrome.storage.onChanged.addListener((changes, area) => {
            if (area !== 'local') return;
            if (changes.exportSearchTheme) {
                updateTheme(changes.exportSearchTheme.newValue || 'auto');
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
            } else if (event.data.type === 'nsft-export-search-executed') {
                showExecutionToast(event.data.payload || {});
            }
        });
    }

    function runExport() {
        const contentDiv = document.querySelector('.nsft-export-search-content');
        if (contentDiv) {
            contentDiv.innerHTML = getLoadingHtml(chrome.i18n.getMessage('es_loading') || 'Loading...');
        }
        setFooter('');

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
        (window.NSFT_AfterLoad ? window.NSFT_AfterLoad.append(script) : (document.head || document.documentElement).appendChild(script));
    }


    let _resultsShell = null;
    function getResultsShell() {
        if (_resultsShell) return _resultsShell;

        const labelVarName = chrome.i18n.getMessage('es_varname_title')
            || 'Name of the search variable — edit it and the code follows';
        const labelSS2 = chrome.i18n.getMessage('es_label_ss2') || 'SuiteScript 2.1';
        const labelSS1 = chrome.i18n.getMessage('es_label_ss1') || 'SuiteScript 1.0';
        const labelCopy = chrome.i18n.getMessage('es_btn_copy') || 'Copy';
        const labelRun = chrome.i18n.getMessage('es_btn_run') || 'Send to Console';
        const labelWithLabels = chrome.i18n.getMessage('es_with_labels') || 'With labels';
        const labelWithLabelsTitle = chrome.i18n.getMessage('es_with_labels_title')
            || 'Include the column labels in the generated code';
        const labelLoop = chrome.i18n.getMessage('es_with_loop') || 'With result loop';
        const labelLoopTitle = chrome.i18n.getMessage('es_with_loop_title')
            || 'Add the loop that walks the results, with one variable per column';
        const labelTabAi = chrome.i18n.getMessage('es_tab_ai_sql') || 'SuiteQL · AI';
        const labelStop = chrome.i18n.getMessage('es_ai_stop') || 'Stop';
        const labelRetry = chrome.i18n.getMessage('es_ai_retry') || 'Try again';
        const labelRev = chrome.i18n.getMessage('es_rev_tab') || 'Review';

        const help = (t) => `<span class="nsft-export-search-help" title="${t}" aria-hidden="true">?</span>`;
        const toggles = `
            <div class="nsft-export-search-toggles">
                <label class="nsft-export-search-toggle">
                    <input type="checkbox" data-toggle="labels"><span>${labelWithLabels}</span>${help(labelWithLabelsTitle)}
                </label>
                <label class="nsft-export-search-toggle">
                    <input type="checkbox" data-toggle="loop"><span>${labelLoop}</span>${help(labelLoopTitle)}
                </label>
            </div>`;

        const iconCopy = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>`;
        const iconRun = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 17 10 11 4 5"></polyline><line x1="12" y1="19" x2="20" y2="19"></line></svg>`;

        _resultsShell = `
            <div class="nsft-export-search-head">
                <div class="nsft-export-search-head-id">
                    <input class="nsft-export-search-info-name" type="text" spellcheck="false"
                           autocomplete="off" aria-label="${labelVarName}" title="${labelVarName}">
                    <div class="nsft-export-search-chips"></div>
                </div>
                <div class="nsft-export-search-seg" role="tablist">
                    <button class="nsft-export-search-tab active" role="tab" data-tab="ss2" aria-selected="true">${labelSS2}</button>
                    <button class="nsft-export-search-tab" role="tab" data-tab="ss1" aria-selected="false">${labelSS1}</button>
                    <button class="nsft-export-search-tab nsft-export-search-tab-ai" role="tab" data-tab="sql" aria-selected="false" hidden>${labelTabAi}</button>
                    <button class="nsft-export-search-tab nsft-es-rev-tab" role="tab" data-tab="rev" aria-selected="false">${labelRev}<span class="nsft-es-rev-n" hidden></span></button>
                </div>
            </div>

            <div class="nsft-export-search-card">
                <div class="nsft-export-search-cardbar">
                    ${toggles}
                    <div class="nsft-export-search-meta">
                        <span class="nsft-export-search-lines"></span>
                        <span class="nsft-export-search-enc">UTF-8</span>
                    </div>
                </div>

                <div class="nsft-export-search-code">
                    <div class="nsft-export-search-panel active" data-panel="ss2" role="tabpanel">
                        <div class="nsft-export-search-gutter" aria-hidden="true"></div>
                        <pre id="nsft-export-search-ss2" class="prettyprint"><code class="language-javascript"></code></pre>
                    </div>

                    <div class="nsft-export-search-panel" data-panel="ss1" role="tabpanel">
                        <div class="nsft-export-search-gutter" aria-hidden="true"></div>
                        <pre id="nsft-export-search-ss1" class="prettyprint"><code class="language-javascript"></code></pre>
                    </div>

                    
                    <div class="nsft-export-search-panel nsft-es-rev" data-panel="rev" role="tabpanel"></div>

                    
                    <div class="nsft-export-search-panel nsft-es-ai nsft-ia-trabajo" data-panel="sql" role="tabpanel">
                        <div class="nsft-es-ai-head">
                            <span class="nsft-es-ai-spark" aria-hidden="true"><svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M8 1.8l1.4 3.3 3.3 1.4-3.3 1.4L8 11.2 6.6 7.9 3.3 6.5l3.3-1.4z"></path><path d="M12.6 10.6l.6 1.4 1.4.6-1.4.6-.6 1.4-.6-1.4-1.4-.6 1.4-.6z"></path></svg></span>
                            <span class="nsft-es-ai-state nsft-ia-estado"></span>
                            <button class="nsft-es-ai-more" type="button" hidden></button>
                            <button class="nsft-es-ai-stop" type="button">${labelStop}</button>
                            <button class="nsft-es-ai-retry" type="button" hidden>${labelRetry}</button>
                        </div>
                        <ol class="nsft-es-ai-steps is-collapsed"></ol>
                        <div class="nsft-es-ai-result" hidden>
                            <div class="nsft-es-ai-notes"></div>
                            <div class="nsft-es-ai-sqlbox">
                                <div class="nsft-es-ai-sqlhead">
                                    <span class="nsft-es-ai-sqllabel">SuiteQL</span>
                                    <button class="nsft-es-ai-copy" type="button">${iconCopy} <span>${labelCopy}</span></button>
                                </div>
                                <pre class="prettyprint nsft-es-ai-sql"><code class="language-sql" data-highlighted="yes"></code></pre>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div id="nsft-export-search-ss2c" hidden></div>
        `;
        return _resultsShell;
    }

    function setFooter(html) {
        const modal = document.getElementById('nsft-export-search-modal');
        const foot = modal ? modal.querySelector('.nsft-rec-obj-footer') : null;
        if (foot) foot.innerHTML = html || '';
        return foot;
    }

    let _footerShell = null;
    function getFooterShell() {
        if (_footerShell) return _footerShell;

        const labelCopy = chrome.i18n.getMessage('es_btn_copy') || 'Copy';
        const labelRun = chrome.i18n.getMessage('es_btn_run') || 'Send to Console';
        const iconCopy = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>`;
        const iconRun = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 17 10 11 4 5"></polyline><line x1="12" y1="19" x2="20" y2="19"></line></svg>`;
        const iconAi = `<svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M8 1.8l1.4 3.3 3.3 1.4-3.3 1.4L8 11.2 6.6 7.9 3.3 6.5l3.3-1.4z"></path><path d="M12.6 10.6l.6 1.4 1.4.6-1.4.6-.6 1.4-.6-1.4-1.4-.6 1.4-.6z"></path></svg>`;
        const labelAi = chrome.i18n.getMessage('es_btn_ai_sql') || 'SuiteQL with AI';
        const titleAi = chrome.i18n.getMessage('es_btn_ai_sql_title') || '';
        const aiBtn = _aiSql
            ? `<button class="nsft-export-search-btn-ai nsft-boton-ia" type="button" title="${titleAi.replace(/"/g, '&quot;')}">${iconAi} <span>${labelAi}</span></button>`
            : '';

        const labelRunner = chrome.i18n.getMessage('es_btn_to_runner') || 'Send to SuiteQL Runner';
        const iconDb = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="12" cy="5" rx="9" ry="3"></ellipse><path d="M3 5v6c0 1.66 4.03 3 9 3s9-1.34 9-3V5"></path><path d="M3 11v6c0 1.66 4.03 3 9 3s9-1.34 9-3v-6"></path></svg>`;

        _footerShell = `
            <div class="nsft-export-search-foot-actions">
                ${aiBtn}
                <button class="nsft-export-search-btn-copy" type="button">${iconCopy} <span>${labelCopy}</span></button>
                <button class="nsft-export-search-btn-run nsft-export-search-primary" type="button">${iconRun} <span>${labelRun}</span></button>
                <button class="nsft-export-search-btn-run nsft-export-search-btn-runner nsft-export-search-primary" type="button" hidden disabled>${iconDb} <span>${labelRunner}</span></button>
            </div>`;
        return _footerShell;
    }

    const ES_TRX = new Set(['transaction', 'salesorder', 'invoice', 'purchaseorder', 'vendorbill',
        'itemfulfillment', 'itemreceipt', 'cashsale', 'creditmemo', 'customerpayment', 'vendorpayment',
        'journalentry', 'estimate', 'opportunity', 'returnauthorization', 'transferorder',
        'inventoryadjustment', 'inventorytransfer', 'check', 'deposit', 'expensereport', 'workorder',
        'vendorcredit', 'cashrefund', 'customerrefund', 'customerdeposit', 'vendorreturnauthorization',
        'purchaserequisition', 'intercompanyjournalentry', 'statisticaljournalentry', 'assemblybuild',
        'assemblyunbuild', 'binworksheet', 'bintransfer', 'paycheck']);
    const esOpFiltro = (x) => typeof x === 'string' && /^(and|or)$/i.test(x);
    const esCondicion = (x) => Array.isArray(x) && typeof x[0] === 'string' && !/^(and|or|not)$/i.test(x[0]);
    const nivelFiltro = (expr) => (esCondicion(expr) ? [expr] : (Array.isArray(expr) ? expr : []));

    function revisaBusqueda(def) {
        const out = [];
        if (!def) return out;
        const tipo = String(def.searchType || '').toLowerCase();
        const cols = Array.isArray(def.columns) ? def.columns : [];
        const sum = (c) => String(c.summary || '').toUpperCase();
        const t = (k, fb, subs) => chrome.i18n.getMessage(k, subs) || fb;

        const conds = [];
        let mezclaYO = false;
        (function recorre(expr) {
            const nivel = nivelFiltro(expr);
            const ops = new Set(nivel.filter(esOpFiltro).map((o) => o.toUpperCase()));
            if (ops.has('AND') && ops.has('OR')) mezclaYO = true;
            nivel.forEach((x) => {
                if (esCondicion(x)) conds.push(x);
                else if (Array.isArray(x)) recorre(String(x[0]).toUpperCase() === 'NOT' ? x[1] : x);
            });
        })(def.filterExpression);

        const esTrx = ES_TRX.has(tipo) || /^custom(transaction|sale|purchase)/.test(tipo);
        const sumas = cols.filter((c) => sum(c) === 'SUM'
            && (c.formula || /amount|total|cost|profit|quantity|qty/i.test(c.name || '')));
        if (esTrx && sumas.length) {
            const top = nivelFiltro(def.filterExpression);
            const conO = top.some((x) => esOpFiltro(x) && /^or$/i.test(x));
            const fija = !conO && top.some((x) => esCondicion(x)
                && /^(mainline|taxline|cogs|shipping)$/i.test(String(x[0]).trim()));
            const deLineas = top.some((x) => esCondicion(x) && /^posting$/i.test(String(x[0]).trim()))
                || cols.some((c) => sum(c) === 'GROUP'
                    && [c.name, c.join].some((n) => /^(account|item)$/i.test(String(n || ''))));
            if (!fija && !deLineas) {
                const nombre = sumas.map((c) => c.label || c.name).filter(Boolean)[0] || 'amount';
                out.push({ sev: 'alta', titulo: t('es_rev_double_t', 'May double-count'),
                    frase: t('es_rev_double_f', 'It sums $1 in a transaction search without filtering the main line: each transaction appears once per line. Add the criterion “Main Line = Yes” (or filter out tax, cost and shipping).', [nombre]) });
            }
        }

        const conResumen = cols.filter((c) => sum(c));
        if (conResumen.length && conResumen.length < cols.length) {
            out.push({ sev: 'media', titulo: t('es_rev_mixed_t', 'Columns with and without summary'),
                frase: t('es_rev_mixed_f', '$1 of $2 columns have no summary type: NetSuite fails with “Unexpected Error” when running it. Set them to Group, or remove the summary from the rest.', [String(cols.length - conResumen.length), String(cols.length)]) });
        }

        if (cols.length && conResumen.length === cols.length && !cols.some((c) => sum(c) === 'GROUP')) {
            out.push({ sev: 'media', titulo: t('es_rev_nogroup_t', 'Returns a single row'),
                frase: t('es_rev_nogroup_f', 'Every column is summarised and none groups: you get a single total. If you wanted one row per customer, item or date, group that column.') });
        }

        if (mezclaYO) {
            out.push({ sev: 'media', titulo: t('es_rev_andor_t', 'AND and OR without brackets'),
                frase: t('es_rev_andor_f', 'The criteria mix AND and OR at the same level without brackets, and NetSuite evaluates AND before OR: the result may not be what you expect. Group them with brackets.') });
        }

        const vistas = {};
        let repetida = '';
        cols.forEach((c) => {
            const l = String(c.label || '').trim();
            if (!l) return;
            const k = l.toLowerCase();
            if (vistas[k] && !repetida) repetida = l;
            vistas[k] = true;
        });
        if (repetida) {
            out.push({ sev: 'baja', titulo: t('es_rev_labels_t', 'Repeated labels'),
                frase: t('es_rev_labels_f', 'Several columns are called “$1”: they can’t be told apart when exporting or reading the results.', [repetida]) });
        }

        const formulas = conds.filter((c) => /^formula/i.test(String(c[0]).trim())).length;
        if (formulas) {
            out.push({ sev: 'baja', titulo: t('es_rev_formula_t', 'Formula criteria'),
                frase: formulas === 1
                    ? t('es_rev_formula_one', 'One criterion uses a formula: it can’t use indexes and may slow the search down in large accounts.')
                    : t('es_rev_formula_f', '$1 criteria use formulas: they can’t use indexes and may slow the search down in large accounts.', [String(formulas)]) });
        }

        const orden = { alta: 0, media: 1, baja: 2 };
        return out.sort((a, b) => orden[a.sev] - orden[b.sev]);
    }

    function pintaRevision(contentDiv, def) {
        const panel = contentDiv.querySelector('.nsft-es-rev');
        const tabN = contentDiv.querySelector('.nsft-es-rev-n');
        if (!panel) return;
        const tabBtn = contentDiv.querySelector('.nsft-es-rev-tab');
        if (tabBtn) tabBtn.hidden = !def;
        if (!def) return;
        const t = (k, fb) => chrome.i18n.getMessage(k) || fb;
        const avisos = revisaBusqueda(def);
        panel.innerHTML = '';

        if (tabN) {
            tabN.hidden = !avisos.length;
            tabN.textContent = String(avisos.length);
            const peor = avisos[0] ? avisos[0].sev : '';
            tabN.className = 'nsft-es-rev-n ' + (peor === 'alta' ? 'nsft-alerta' : peor === 'media' ? 'nsft-alerta is-aviso' : 'nsft-tipo');
        }

        if (!avisos.length) {
            const ok = document.createElement('div');
            ok.className = 'nsft-es-rev-ok';
            const est = document.createElement('span');
            est.className = 'nsft-estado is-ok';
            est.textContent = t('es_rev_ok_t', 'No known problems');
            const p = document.createElement('p');
            p.textContent = t('es_rev_ok_f', 'Checked the rules that usually give wrong numbers without an error.');
            ok.appendChild(est);
            ok.appendChild(p);
            panel.appendChild(ok);
        } else {
            const lista = document.createElement('ul');
            lista.className = 'nsft-es-rev-lista';
            avisos.forEach((a) => {
                const li = document.createElement('li');
                const chapa = document.createElement('span');
                chapa.className = a.sev === 'alta' ? 'nsft-alerta' : a.sev === 'media' ? 'nsft-alerta is-aviso' : 'nsft-tipo';
                chapa.textContent = t('es_rev_sev_' + a.sev, a.sev);
                const cuerpo = document.createElement('div');
                const b = document.createElement('b');
                b.textContent = a.titulo;
                const p = document.createElement('p');
                p.textContent = a.frase;
                cuerpo.appendChild(b);
                cuerpo.appendChild(p);
                li.appendChild(chapa);
                li.appendChild(cuerpo);
                lista.appendChild(li);
            });
            panel.appendChild(lista);
        }

        const nota = document.createElement('p');
        nota.className = 'nsft-es-rev-nota';
        nota.textContent = t('es_rev_saved_note', 'The saved version is reviewed: unsaved changes don’t count.');
        panel.appendChild(nota);
    }

    function renderResults(data) {
        const contentDiv = document.querySelector('.nsft-export-search-content');
        if (!contentDiv) return;

        const labelRunning = chrome.i18n.getMessage('es_running') || 'Running...';

        contentDiv.innerHTML = getResultsShell();
        const footEl = setFooter(getFooterShell());
        const scopes = footEl ? [contentDiv, footEl] : [contentDiv];
        const findAll = (sel) => scopes.reduce(
            (acc, root) => acc.concat(Array.from(root.querySelectorAll(sel))), []);

        const codeSS2 = contentDiv.querySelector('#nsft-export-search-ss2 code');
        const codeSS1 = contentDiv.querySelector('#nsft-export-search-ss1 code');
        const ss2cDiv = contentDiv.querySelector('#nsft-export-search-ss2c');

        const info = data.info || {};
        const nameEl = contentDiv.querySelector('.nsft-export-search-info-name');
        const chipsEl = contentDiv.querySelector('.nsft-export-search-chips');

        const VAR_TOKEN = '__NSFT_SEARCH_VAR__';
        const defaultVar = info.varName || 'mySearch';
        let varName = defaultVar;
        const applyVar = (s) => String(s == null ? '' : s).split(VAR_TOKEN).join(varName);

        function sanitiseVar(raw) {
            const cleaned = String(raw || '').replace(/[^A-Za-z0-9_$]/g, '');
            if (!cleaned) return defaultVar;
            return /^[0-9]/.test(cleaned) ? `_${cleaned}` : cleaned;
        }

        if (nameEl) nameEl.value = varName;
        if (chipsEl) {
            const n = (one, many, count) => (count === 1
                ? (chrome.i18n.getMessage(one) || `1`)
                : (chrome.i18n.getMessage(many, [String(count)]) || String(count)));

            const chips = [];
            if (info.searchType) {
                chips.push(chrome.i18n.getMessage('es_info_type', [info.searchType])
                    || `Type: ${info.searchType}`);
            }
            chips.push(n('es_info_columns_one', 'es_info_columns', info.columns || 0));
            chips.push(n('es_info_filters_one', 'es_info_filters', info.filters || 0));

            chipsEl.innerHTML = '';
            chips.forEach((text) => {
                const span = document.createElement('span');
                span.className = 'nsft-export-search-chip';
                span.textContent = text;
                chipsEl.appendChild(span);
            });
        }


        const variants = data.variants || {};

        function currentVariant() {
            const key = `${_withLabels ? 'labels' : 'nolabels'}_${_withLoop ? 'loop' : 'noloop'}`;
            return variants[key] || {};
        }

        const linesEl = contentDiv.querySelector('.nsft-export-search-lines');

        function activeCode() {
            const panel = contentDiv.querySelector('.nsft-export-search-panel.active');
            return panel ? panel.querySelector('code') : null;
        }

        function paintCode() {
            const v = currentVariant();
            if (codeSS2) setCode(codeSS2, applyVar(v.ss2));
            if (codeSS1) setCode(codeSS1, applyVar(v.ss1));
            if (ss2cDiv) ss2cDiv.textContent = applyVar(data.ss2console);
            updateMeta();
        }

        function setGutter(panel, count) {
            const gutter = panel ? panel.querySelector('.nsft-export-search-gutter') : null;
            if (!gutter) return;
            const nums = [];
            for (let i = 1; i <= count; i++) nums.push(i);
            gutter.textContent = nums.join('\n');
        }

        function highlight(el) {
            if (!el) return;
            if (!window.hljs) {
                if (window.NSFT_Libs) window.NSFT_Libs.listas().then(() => { if (window.hljs) highlight(el); });
                return;
            }
            el.removeAttribute('data-highlighted');
            el.className = 'language-javascript';
            window.hljs.highlightElement(el);
        }

        function setCode(el, text) {
            el.textContent = text;
            const panel = el.closest('.nsft-export-search-panel');
            setGutter(panel, text ? text.split('\n').length : 0);

            el.removeAttribute('data-highlighted');
            el.className = 'language-javascript';
            if (panel && panel.classList.contains('active')) highlight(el);
        }

        function updateMeta() {
            if (!linesEl) return;
            const el = activeCode();
            const count = (el && el.textContent) ? el.textContent.split('\n').length : 0;
            linesEl.textContent = count === 1
                ? (chrome.i18n.getMessage('es_meta_lines_one') || '1 line')
                : (chrome.i18n.getMessage('es_meta_lines', [String(count)]) || `${count} lines`);
        }

        paintCode();
        pintaRevision(contentDiv, data.definicion);

        if (nameEl) {
            nameEl.addEventListener('input', () => {
                const clean = String(nameEl.value || '').replace(/[^A-Za-z0-9_$]/g, '');
                if (clean !== nameEl.value) {
                    const at = nameEl.selectionStart;
                    nameEl.value = clean;
                    try { nameEl.setSelectionRange(at - 1, at - 1); } catch (e) { }
                }
                varName = clean || defaultVar;
                paintCode();
            });

            const settle = () => {
                varName = sanitiseVar(nameEl.value);
                nameEl.value = varName;
                paintCode();
            };
            nameEl.addEventListener('blur', settle);
            nameEl.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') { e.preventDefault(); nameEl.blur(); }
            });
        }

        contentDiv.querySelectorAll('.nsft-export-search-toggle input').forEach((box) => {
            const which = box.getAttribute('data-toggle');
            box.checked = which === 'loop' ? _withLoop : _withLabels;

            box.addEventListener('change', () => {
                if (which === 'loop') _withLoop = box.checked;
                else _withLabels = box.checked;

                paintCode();

                try {
                    chrome.storage.local.set({
                        [WITH_LABELS_KEY]: _withLabels,
                        [WITH_LOOP_KEY]: _withLoop
                    });
                } catch (e) { }
            });
        });

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

                const shown = activeCode();
                if (shown && !shown.dataset.highlighted) highlight(shown);

                updateMeta();
                syncFoot(target);
            });
        });

        function syncFoot(target) {
            const enSql = target === 'sql';
            const card = contentDiv.querySelector('.nsft-export-search-card');
            if (card) card.classList.toggle('is-sql', enSql);
            if (card) card.classList.toggle('is-rev', target === 'rev');
            findAll('.nsft-export-search-foot-actions').forEach((el) => { el.style.display = target === 'rev' ? 'none' : ''; });
            findAll('.nsft-export-search-btn-run:not(.nsft-export-search-btn-runner)').forEach((b) => { b.hidden = enSql; });
            findAll('.nsft-export-search-btn-runner').forEach((b) => { b.hidden = !enSql; });
        }

        function flash(btn, message, ms) {
            const span = btn.querySelector('span') || btn;
            const original = span.textContent;
            span.textContent = message;
            setTimeout(() => { span.textContent = original; }, ms || 1500);
        }

        function copyActive(btn) {
            const el = activeCode();
            if (!el || !el.textContent) return;
            const done = () => flash(btn, chrome.i18n.getMessage('es_copied') || 'Copied!');
            if (window.NSFT_Clipboard && window.NSFT_Clipboard.copy) {
                window.NSFT_Clipboard.copy(el.textContent, { toast: false, onSuccess: done });
                return;
            }
            navigator.clipboard.writeText(el.textContent).then(done);
        }

        findAll('.nsft-export-search-btn-copy')
            .forEach((btn) => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    copyActive(btn);
                });
            });

        const runBtn = findAll('.nsft-export-search-btn-run:not(.nsft-export-search-btn-runner)')[0];
        if (runBtn) {
            runBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                const onSS1 = !!contentDiv.querySelector('.nsft-export-search-panel.active[data-panel="ss1"]');
                const el = onSS1 ? activeCode() : ss2cDiv;
                if (!el || !el.textContent) return;
                try {
                    window.postMessage({
                        type: 'nsft-export-search-execute',
                        code: el.textContent
                    }, '*');
                    flash(runBtn, labelRunning, 1000);
                } catch (err) {
                    console.error("Execution Request Error:", err);
                }
            });
        }

        wireAiSql(data, contentDiv, findAll);
    }

    let _aiRun = null;

    function cargaAsistente() {
        if (window.__nsftAiAgentInit) return Promise.resolve();
        return new Promise((resolve, reject) => {
            try {
                chrome.runtime.sendMessage({ nsftSuite: 'load' }, (r) => {
                    const err = chrome.runtime.lastError;
                    if (err || !r || !r.ok) { reject(new Error((err && err.message) || (r && r.error) || 'load')); return; }
                    resolve();
                });
            } catch (e) { reject(e); }
        });
    }

    function wireAiSql(data, contentDiv, findAll) {
        const msg = (k, fb, subs) => chrome.i18n.getMessage(k, subs) || fb;
        const tab = contentDiv.querySelector('.nsft-export-search-tab-ai');
        const panel = contentDiv.querySelector('.nsft-es-ai');
        const aiBtn = findAll('.nsft-export-search-btn-ai')[0];
        const runnerBtn = findAll('.nsft-export-search-btn-runner')[0];
        if (!tab || !panel || !aiBtn) return;
        const state = panel.querySelector('.nsft-es-ai-state');
        const steps = panel.querySelector('.nsft-es-ai-steps');
        const stopBtn = panel.querySelector('.nsft-es-ai-stop');
        const retryBtn = panel.querySelector('.nsft-es-ai-retry');
        const result = panel.querySelector('.nsft-es-ai-result');
        const codeEl = panel.querySelector('.nsft-es-ai-sql code');
        const notes = panel.querySelector('.nsft-es-ai-notes');
        const sqlBox = panel.querySelector('.nsft-es-ai-sqlbox');
        const moreBtn = panel.querySelector('.nsft-es-ai-more');

        const abrePestana = () => { tab.hidden = false; tab.click(); };
        const fase = (f) => { panel.dataset.fase = f; };

        function paso(texto) {
            const li = document.createElement('li');
            li.className = 'is-run';
            const t = document.createElement('code');
            t.textContent = texto.replace(/\s+/g, ' ').slice(0, 220);
            const r = document.createElement('span');
            r.className = 'nsft-es-ai-stepres';
            li.appendChild(t);
            li.appendChild(r);
            steps.appendChild(li);
            steps.scrollTop = steps.scrollHeight;
            pintaMas();
        }
        function resPaso(ok, texto) {
            const li = steps.lastElementChild;
            if (!li) return;
            li.className = ok ? 'is-ok' : 'is-ko';
            li.querySelector('.nsft-es-ai-stepres').textContent = texto || '';
        }

        function termina(d) {
            stopBtn.hidden = true;
            retryBtn.hidden = false;
            if (d.ok && d.sql) {
                fase('lista');
                state.textContent = msg('es_ai_done', 'Query ready');
                if (d.html) codeEl.innerHTML = d.html; else codeEl.textContent = d.sql;
                codeEl.dataset.highlighted = 'yes';
                result.hidden = false;
                _aiRun.sql = d.sql;
                if (runnerBtn) runnerBtn.disabled = false;
            } else {
                fase('error');
                state.textContent = d.stopped ? msg('es_ai_stopped', 'Stopped')
                    : msg('es_ai_failed', 'Could not convert the search');
                codeEl.textContent = '';
                result.hidden = !(d.notes || d.error);
            }
            if (d.notesHtml) notes.innerHTML = d.notesHtml;
            else notes.textContent = String(d.notes || d.error || '');
            sqlBox.hidden = !(d.ok && d.sql);
        }

        function pintaMas() {
            const n = steps.children.length;
            moreBtn.hidden = n < 2;
            const plegado = steps.classList.contains('is-collapsed');
            moreBtn.textContent = plegado
                ? msg('es_ai_more', 'Show the $1 attempts', [String(n)])
                : msg('es_ai_less', 'Hide attempts');
            moreBtn.setAttribute('aria-expanded', plegado ? 'false' : 'true');
        }
        moreBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            steps.classList.toggle('is-collapsed');
            pintaMas();
            if (!steps.classList.contains('is-collapsed')) steps.scrollTop = steps.scrollHeight;
        });

        function arranca() {
            const def = data.definicion;
            if (!def) return;
            if (_aiRun) window.dispatchEvent(new CustomEvent('nsft-ai-search-sql-stop', { detail: { id: _aiRun.id } }));
            const id = 'es' + Date.now() + '_' + Math.floor(Math.random() * 1e6);
            _aiRun = { id, sql: '' };
            steps.innerHTML = '';
            steps.classList.add('is-collapsed');
            pintaMas();
            result.hidden = true;
            codeEl.textContent = '';
            notes.textContent = '';
            stopBtn.hidden = false;
            retryBtn.hidden = true;
            if (runnerBtn) runnerBtn.disabled = true;
            fase('trabajando');
            state.textContent = msg('es_ai_loading', 'Loading the assistant…');

            let json = JSON.stringify(def, null, 1);
            if (json.length > 12000) json = json.slice(0, 12000) + '\n…';
            const nombre = (def.title ? def.title + ' · ' : '') + 'id ' + def.id;
            const prompt = msg('es_ai_sql_prompt',
                'Translate this NetSuite saved search into an equivalent SuiteQL query.\n\nSearch: ' + nombre + '\n\n' + json,
                [nombre, json]);

            const deEste = (e) => e && e.detail && e.detail.id === id;
            const onProg = (e) => {
                if (!deEste(e) || !_aiRun || _aiRun.id !== id) return;
                const d = e.detail;
                if (d.kind === 'status') state.textContent = msg('es_ai_working', 'Working · $1', [d.text]);
                else if (d.kind === 'query') paso(d.text);
                else if (d.kind === 'result') resPaso(d.ok, d.text);
            };
            const onRes = (e) => {
                if (!deEste(e)) return;
                window.removeEventListener('nsft-ai-search-sql-progress', onProg);
                window.removeEventListener('nsft-ai-search-sql-result', onRes);
                if (_aiRun && _aiRun.id === id) termina(e.detail);
            };
            window.addEventListener('nsft-ai-search-sql-progress', onProg);
            window.addEventListener('nsft-ai-search-sql-result', onRes);

            cargaAsistente().then(() => {
                window.dispatchEvent(new CustomEvent('nsft-ai-search-sql', { detail: { id, prompt, def } }));
            }).catch(() => {
                window.removeEventListener('nsft-ai-search-sql-progress', onProg);
                window.removeEventListener('nsft-ai-search-sql-result', onRes);
                termina({ ok: false, error: msg('es_ai_noload', 'The AI Assistant could not be loaded on this page.') });
            });
        }

        aiBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            abrePestana();
            if (!panel.dataset.fase) arranca();
        });
        retryBtn.addEventListener('click', (e) => { e.stopPropagation(); arranca(); });
        stopBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (!_aiRun) return;
            window.dispatchEvent(new CustomEvent('nsft-ai-search-sql-stop', { detail: { id: _aiRun.id } }));
            state.textContent = msg('es_ai_stopping', 'Stopping…');
        });
        const copyBtn = panel.querySelector('.nsft-es-ai-copy');
        if (copyBtn) {
            copyBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (!_aiRun || !_aiRun.sql) return;
                const span = copyBtn.querySelector('span');
                const done = () => {
                    const antes = span.textContent;
                    span.textContent = msg('es_copied', 'Copied!');
                    copyBtn.classList.add('is-done');
                    setTimeout(() => { span.textContent = antes; copyBtn.classList.remove('is-done'); }, 1500);
                };
                if (window.NSFT_Clipboard && window.NSFT_Clipboard.copy) {
                    window.NSFT_Clipboard.copy(_aiRun.sql, { toast: false, onSuccess: done });
                } else {
                    navigator.clipboard.writeText(_aiRun.sql).then(done);
                }
            });
        }
        if (runnerBtn) {
            runnerBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (!_aiRun || !_aiRun.sql) return;
                window.dispatchEvent(new CustomEvent('nsft-show-suiteql-runner', { detail: { prefillSql: _aiRun.sql } }));
            });
        }
    }

    function showExecutionToast(payload) {
        const T = window.NSFT_Clipboard;
        if (!T || typeof T.showToast !== 'function') return;

        if (payload.ok) {
            const base = chrome.i18n.getMessage('es_console_success_log')
                || 'Search loaded in console successfully. Available variable: ';
            T.showToast(base + (payload.varName || ''), { type: 'success' });
            return;
        }

        const err = chrome.i18n.getMessage('es_console_exec_error') || 'NSFT Execution Error:';
        T.showToast(payload.details ? `${err} ${payload.details}` : err, { type: 'error' });
    }

    function renderError(payload) {
        const contentDiv = document.querySelector('.nsft-export-search-content');
        if (!contentDiv) return;

        setFooter('');

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

        const recordarSitio = () => {
            const r = modal.getBoundingClientRect();
            lastMaximizedLeft = r.left + 'px';
            lastMaximizedTop = r.top + 'px';
        };

        const clickHandler = (id, fn) => {
            const el = document.getElementById(id);
            if (el) el.addEventListener('click', fn);
        };

        clickHandler('nsft-export-search-minimise', () => {
            recordarSitio();
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

        clickHandler('nsft-export-search-settings', () => {
            const A = window.NSFT_Ajustes;
            if (!A) {
                try { chrome.runtime.sendMessage({ action: 'nsftOpenSettings', highlight: 'enableExportSearch' }); } catch (e) { }
                return;
            }
            const tx = (k, f) => { try { return chrome.i18n.getMessage(k) || f; } catch (e) { return f; } };
            const icono = '<circle cx="11" cy="11" r="7"></circle><path d="M20 20l-4-4"></path>';
            A.abre({ tono: 'verde',
                raiz: document.getElementById('nsft-export-search-modal'),
                modulo: tx('enableExportSearchLabel', 'Export Search'),
                icono,
                categorias: [{
                    id: 'general', titulo: tx('set_cat_general', 'General'), icono,
                    secciones: [{
                        titulo: tx('sql_set_sec_look', 'Appearance'),
                        filas: [{ tipo: 'select', clave: 'exportSearchTheme', titulo: tx('sql_set_theme', 'Theme'), defecto: 'auto',
                            opciones: [['auto', tx('jfThemeAuto', 'Automatic')]].concat(A.TEMAS_HLJS) }]
                    }]
                }]
            });
        });

        clickHandler('nsft-export-search-close', () => {
            modal.style.display = 'none';
            dispatchLayoutUpdate();
        });

        const header = modal.querySelector('.nsft-modal-header');
        if (header) {
            header.addEventListener('dblclick', () => {
                const state = modal.dataset.state;
                if (state === 'minimised') {
                    modal.dataset.state = 'maximised';
                    modal.style.top = lastMaximizedTop;
                    modal.style.left = lastMaximizedLeft;
                } else {
                    recordarSitio();
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
                if (event.target.closest('.nsft-header-actions, .nsft-modal-tools')) return;

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
        const titleEl = document.querySelector('#nsft-export-search-title > span');
        if (!el || !titleEl) return;

        const min = el.dataset.state === 'minimised';
        titleEl.textContent = min
            ? (chrome.i18n.getMessage('es_title_minimised') || 'Export Search')
            : (chrome.i18n.getMessage('es_title') || 'Export Search');
        if (min) setTimeout(() => snapToEdge(el), 10);
        else constrainModalToWindow(el);
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
        const rect = el.getBoundingClientRect();
        el.style.right = 'auto';
        el.style.bottom = 'auto';

        const isMin = el.dataset.state === 'minimised';
        const viewportWidth = window.innerWidth;
        const targetWidth = isMin ? 44 : rect.width;
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
        <div class="nsft-modal nsft-modal--panel nsft-rec-obj-modal" id="nsft-export-search-modal" data-state="maximised" tabindex="-1" role="dialog" aria-modal="true" aria-labelledby="nsft-export-search-title">
            <div class="nsft-modal-header">
                <span id="nsft-export-search-title" class="nsft-modal-title"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg><span>${chrome.i18n.getMessage('es_title') || 'Export Search'}</span></span>
                <div class="nsft-modal-tools nsft-modal-hide-min">
                </div>
                <span class="nsft-header-actions">
                    <span id="nsft-export-search-settings" class="nsft-modal-btn-ajustes nsft-modal-hide-min" title="${chrome.i18n.getMessage('nsft_open_settings') || 'Ajustes'}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="width:14px;height:14px;pointer-events:none;"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1.08-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg></span>
                    <span id="nsft-export-search-minimise" class="nsft-modal-btn-minimise"></span>
                    <span id="nsft-export-search-maximise" class="nsft-modal-btn-maximise"></span>
                    <span id="nsft-export-search-close" class="nsft-modal-btn-close">✕</span>
                </span>
                <div class="nsft-modal-header-line"></div>
            </div>
            <div class="nsft-rec-obj-content">
                 <div class="nsft-export-search-content">
                    ${getLoadingHtml()}
                 </div>
            </div>
            <div class="nsft-rec-obj-footer">
                
            </div>
        </div>`;

    let _requestedTheme = null;
    function resolveHlTheme(name) {
        if (name !== 'auto') return name;
        return _nsftTheme === 'dark' ? 'atom-one-dark' : 'atom-one-light';
    }
    async function updateTheme(requested) {
        _requestedTheme = requested;
        const themeName = resolveHlTheme(requested);
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
