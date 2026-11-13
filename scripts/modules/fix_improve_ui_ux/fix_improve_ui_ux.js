(function () {
    'use strict';

    function ponVarHtml(nombre, valor) {
        const st = document.documentElement.style;
        if (st.getPropertyValue(nombre) !== valor) st.setProperty(nombre, valor);
    }

    chrome.storage.local.get({
        enableBetterPageTitles: true,
        enableFixedSublistColumn: true,
        enableFixedSublistHeaders: true,
        enableFixedTabs: true,
        enableSmallerDropdownOptions: true,
        dropdownPixelHeight: 0,
        enableSmallerNavigationOptions: true,
        navigationPixelHeight: 30,
        enableSmallerMainMenu: true,
        mainMenuFontSize: 13,
        enableSmallerSublistHeaders: true,
        enableProfileButton: true
    }, (items) => {
        if (items.enableBetterPageTitles) startBetterPageTitles();
        if (items.enableFixedSublistColumn) runFixedSublistColumn();
        if (items.enableFixedSublistHeaders) runFixedSublistHeaders();
        if (items.enableFixedTabs) runFixedTabs();
        if (items.enableSmallerDropdownOptions) runSmallerDropdownOptions(items.dropdownPixelHeight);
        if (items.enableSmallerNavigationOptions) runSmallerNavigationOptions(items.navigationPixelHeight);
        if (items.enableSmallerMainMenu) runSmallerMainMenu(items.mainMenuFontSize);
        if (items.enableSmallerSublistHeaders) runSmallerSublistHeaders();
        if (items.enableProfileButton) startProfileButton();
    });

    chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== 'local') return;
        if (changes.enableBetterPageTitles) {
            if (changes.enableBetterPageTitles.newValue !== false) startBetterPageTitles();
            else stopBetterPageTitles();
        }
        if (changes.enableProfileButton) {
            if (changes.enableProfileButton.newValue !== false) startProfileButton();
            else stopProfileButton();
        }
        if (changes.enableFixedTabs) {
            if (changes.enableFixedTabs.newValue !== false) runFixedTabs();
            else stopFixedTabs();
        }
        if (changes.enableFixedSublistColumn) {
            if (changes.enableFixedSublistColumn.newValue !== false) runFixedSublistColumn();
            else stopFixedSublistColumn();
        }
        if (changes.enableFixedSublistHeaders) {
            if (changes.enableFixedSublistHeaders.newValue !== false) runFixedSublistHeaders();
            else stopFixedSublistHeaders();
        }
        if (changes.enableSmallerSublistHeaders) {
            if (changes.enableSmallerSublistHeaders.newValue !== false) runSmallerSublistHeaders();
            else stopSmallerSublistHeaders();
        }
        if (changes.enableSmallerDropdownOptions || changes.dropdownPixelHeight) {
            chrome.storage.local.get({ enableSmallerDropdownOptions: true, dropdownPixelHeight: 0 }, (it) => {
                if (it.enableSmallerDropdownOptions) runSmallerDropdownOptions(it.dropdownPixelHeight);
                else stopSmallerDropdownOptions();
            });
        }
        if (changes.enableSmallerNavigationOptions || changes.navigationPixelHeight) {
            chrome.storage.local.get({ enableSmallerNavigationOptions: true, navigationPixelHeight: 30 }, (it) => {
                if (it.enableSmallerNavigationOptions) runSmallerNavigationOptions(it.navigationPixelHeight);
                else stopSmallerNavigationOptions();
            });
        }
        if (changes.enableSmallerMainMenu || changes.mainMenuFontSize) {
            chrome.storage.local.get({ enableSmallerMainMenu: true, mainMenuFontSize: 13 }, (it) => {
                if (it.enableSmallerMainMenu) runSmallerMainMenu(it.mainMenuFontSize);
                else stopSmallerMainMenu();
            });
        }
    });

    const PAGE_TITLE_DEFINITIONS = [
        { selectors: ['.nshelp_title'], pattern: 'Help: {0}' },
        {
            selectors: ['#name_fs_lbl_uir_label + .uir-field', '#scripttype_lbl_uir_label + span.uir-field.inputreadonly'],
            pattern: '{0} ({1})'
        },
        {
            selectors: ['#name_fs_lbl_uir_label + .uir-field input', '#scripttype_lbl_uir_label + span.uir-field.inputreadonly'],
            pattern: '{0} ({1})'
        },
        {
            when: () => /\/app\/common\/workflow\//i.test(location.pathname),
            selectors: [
                ['.page-title span.name', 'span.name'],
                () => _betterTitlesOriginalLabel
            ],
            pattern: '{0} ({1})'
        },
        {
            selectors: ['.uir-record-id', ['.uir-record-type', '.uir-field-input']],
            pattern: '{0} ({1})'
        },
        {
            selectors: ['.uir-record-name', ['.uir-record-type', '.uir-field-input']],
            pattern: '{0} ({1})'
        }
    ];

    let _betterTitlesActive = false;
    let _betterTitlesUnsub = null;
    let _betterTitlesOriginalLabel = null;
    let _betterTitlesOriginalTitle = null;

    function resolveTitleSlot(slot) {
        const list = Array.isArray(slot) ? slot : [slot];
        const DOM = window.NSFT_DOM;
        if (DOM && DOM.q) {
            return DOM.q(list, { module: 'fix_improve_ui_ux', purpose: 'better page titles' });
        }
        for (const sel of list) {
            const el = document.querySelector(sel);
            if (el) return el;
        }
        return null;
    }

    function ownText(el) {
        const walker = document.createTreeWalker(el, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
            acceptNode(node) {
                if (node.nodeType === Node.ELEMENT_NODE) {
                    return /(^|\s)nsft-/.test(node.getAttribute('class') || '')
                        ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_SKIP;
                }
                return NodeFilter.FILTER_ACCEPT;
            }
        });
        let text = '';
        while (walker.nextNode()) text += walker.currentNode.nodeValue;
        return text.trim();
    }

    function runBetterPageTitles() {
        for (const titleDef of PAGE_TITLE_DEFINITIONS) {
            if (titleDef.when && !titleDef.when()) continue;
            const titleData = [];

            for (const slot of titleDef.selectors) {
                if (typeof slot === 'function') {
                    const v = slot();
                    if (v) titleData.push(String(v));
                    continue;
                }
                const el = resolveTitleSlot(slot);
                if (!el) continue;
                if (el.tagName === 'INPUT') {
                    if (el.value) titleData.push(el.value);
                } else {
                    const text = ownText(el);
                    if (text) titleData.push(text);
                }
            }

            if (titleData.length === titleDef.selectors.length) {
                const pattern = titleDef.pattern || '{0}';
                let newTitle = pattern;
                titleData.forEach((data, index) => {
                    newTitle = newTitle.replace(`{${index}}`, data);
                });

                const root = document.documentElement;
                root.setAttribute('data-nsft-page-name', titleData[0] || '');
                root.setAttribute('data-nsft-page-type', titleData.length > 1 ? (titleData[1] || '') : '');

                const titleEl = document.querySelector('head title');
                if (titleEl && titleEl.textContent !== newTitle) titleEl.textContent = newTitle;
                return;
            }
        }
        clearTitleStamps();
    }

    function clearTitleStamps() {
        const root = document.documentElement;
        root.removeAttribute('data-nsft-page-name');
        root.removeAttribute('data-nsft-page-type');
    }

    function startBetterPageTitles() {
        if (_betterTitlesActive) return;
        try {
            if (window.NSFT_RecordButtons && NSFT_RecordButtons.isHeaderlessPage && NSFT_RecordButtons.isHeaderlessPage()) return;
        } catch (e) { }

        _betterTitlesActive = true;
        if (_betterTitlesOriginalTitle == null) _betterTitlesOriginalTitle = String(document.title || '');
        if (_betterTitlesOriginalLabel == null) {
            _betterTitlesOriginalLabel = String(document.title || '')
                .replace(/\s*-\s*NetSuite\b.*$/i, '').replace(/[\s ]+/g, ' ').trim();
        }
        runBetterPageTitles();
        if (window.NSFT_Observer) {
            _betterTitlesUnsub = NSFT_Observer.subscribe(runBetterPageTitles, { throttle: 500 });
        }
    }

    function stopBetterPageTitles() {
        if (!_betterTitlesActive) return;
        _betterTitlesActive = false;
        if (_betterTitlesUnsub) { _betterTitlesUnsub(); _betterTitlesUnsub = null; }
        clearTitleStamps();
        const titleEl = document.querySelector('head title');
        if (titleEl && _betterTitlesOriginalTitle != null && titleEl.textContent !== _betterTitlesOriginalTitle) {
            titleEl.textContent = _betterTitlesOriginalTitle;
        }
    }

    const FSC_CLASS = 'nsft-fsc-on';
    const FSH_CLASS = 'nsft-fsh-on';
    const SUBLIST_CHROME_PX = 299;




    const FSC_BG_MARK = 'nsftFscBg';
    let _fscUnsub = null;

    const FSC_STICKY_CELLS =
        `html.${FSC_CLASS} .uir-machine-table-container > table:not(.openList) .listtable>tbody>tr:not(.uir-machine-row-last):not(.uir-machine-row-focused)>td:first-child:not(.uir-grippy):not(.uir-column-grippy):not([data-nsft-fsc-bg]),` +
        `html.${FSC_CLASS} .uir-machine-table-container > table:not(.openList) > tbody>tr>td:first-child:not(.uir-grippy):not(.uir-column-grippy):not([data-nsft-fsc-bg]),` +
        `html.${FSC_CLASS} .uir-machine-table-container > table:not(.openList) tr.uir-machine-row-focused>td:first-child:not(.uir-grippy):not(.uir-column-grippy):not([data-nsft-fsc-bg])`;

    function trasCargaFiu(fn) {
        if (document.readyState === 'complete') fn();
        else window.addEventListener('load', fn, { once: true });
    }

    function paintFixedColumnBackground() {
        const tds = Array.from(document.querySelectorAll(FSC_STICKY_CELLS));
        if (!tds.length) return;
        const plan = tds.map((td) => {
            if (!isTransparentColor(getComputedStyle(td).backgroundColor)) return null;
            const row = td.parentElement;
            if (row && !isTransparentColor(getComputedStyle(row).backgroundColor)) return 'inherit';
            return firstOpaqueBackground(row) || null;
        });
        tds.forEach((td, i) => {
            td.dataset[FSC_BG_MARK] = '1';
            if (plan[i]) td.style.backgroundColor = plan[i];
        });
    }

    function clearFixedColumnBackground() {
        document.querySelectorAll('[data-nsft-fsc-bg]').forEach((td) => {
            delete td.dataset[FSC_BG_MARK];
            td.style.removeProperty('background-color');
        });
    }

    const FSC_BTN_MARK = 'nsftFscBtn';
    const FSC_BUTTON_BARS =
        `html.${FSC_CLASS} .uir-machine-table-container > table:not(.openList) tr.uir-machine-button-row>td>div.machineButtonRow:not([data-nsft-fsc-btn]),` +
        `html.${FSC_CLASS} .uir-machine-table-container > table:not(.openList) tr.uir-machine-button-row>td.machineButtonRow>div:not([data-nsft-fsc-btn])`;

    function offsetAbsLeft(el) {
        let x = 0;
        for (let n = el; n; n = n.offsetParent) x += n.offsetLeft;
        return x;
    }

    function alignFixedColumnButtons() {
        const plan = [];
        document.querySelectorAll(FSC_BUTTON_BARS).forEach((bar) => {
            const cont = bar.closest('.uir-machine-table-container');
            if (!cont || cont.scrollLeft !== 0) return;
            plan.push([bar, Math.round(offsetAbsLeft(bar) - offsetAbsLeft(cont))]);
        });
        plan.forEach(([bar, inset]) => {
            bar.dataset[FSC_BTN_MARK] = '1';
            if (inset > 0) bar.style.left = inset + 'px';
        });
    }

    function clearFixedColumnButtons() {
        document.querySelectorAll('[data-nsft-fsc-btn]').forEach((bar) => {
            delete bar.dataset[FSC_BTN_MARK];
            bar.style.removeProperty('left');
        });
    }

    function runFixedSublistColumn() {
        try {
            if (window.NSFT_RecordButtons && NSFT_RecordButtons.isHeaderlessPage && NSFT_RecordButtons.isHeaderlessPage()) return;
        } catch (e) { }
        document.documentElement.classList.add(FSC_CLASS);
        trasCargaFiu(armFixedSublistColumn);
    }
    function armFixedSublistColumn() {
        if (!document.documentElement.classList.contains(FSC_CLASS)) return;
        paintFixedColumnBackground();
        alignFixedColumnButtons();
        if (window.NSFT_Observer && !_fscUnsub) {
            _fscUnsub = NSFT_Observer.subscribe(() => {
                paintFixedColumnBackground();
                alignFixedColumnButtons();
            }, { throttle: 400 });
        }
    }
    function stopFixedSublistColumn() {
        document.documentElement.classList.remove(FSC_CLASS);
        if (_fscUnsub) { _fscUnsub(); _fscUnsub = null; }
        clearFixedColumnBackground();
        clearFixedColumnButtons();
    }

    const FSH_BG_MARK = 'nsftFshBg';
    let _fshUnsub = null;

    function isTransparentColor(color) {
        if (window.NSFT_DOM && NSFT_DOM.isTransparentColor) return NSFT_DOM.isTransparentColor(color);
        if (!color) return true;
        const c = String(color).replace(/\s+/g, '');
        if (c === 'transparent') return true;
        return /^rgba\(\d+,\d+,\d+,(?:0|0?\.0+)\)$/.test(c);
    }

    function firstOpaqueBackground(el) {
        if (window.NSFT_DOM && NSFT_DOM.firstOpaqueBackground) return NSFT_DOM.firstOpaqueBackground(el);
        for (let node = el; node; node = node.parentElement) {
            const bg = getComputedStyle(node).backgroundColor;
            if (!isTransparentColor(bg)) return bg;
        }
        return '';
    }

    function paintFixedHeaderBackground() {
        const rows = document.querySelectorAll(
            `html.${FSH_CLASS} .uir-machine-table-container > table tr.uir-list-headerrow,` +
            `html.${FSH_CLASS} .uir-machine-table-container > table tr.uir-machine-headerrow`
        );
        const nuevas = Array.from(rows).filter((row) => !row.dataset[FSH_BG_MARK]);
        const plan = [];
        nuevas.forEach((row) => {
            const bg = firstOpaqueBackground(row);
            if (!bg) return;
            row.querySelectorAll(':scope > td').forEach((td) => {
                if (isTransparentColor(getComputedStyle(td).backgroundColor)) plan.push([td, bg]);
            });
        });
        nuevas.forEach((row) => { row.dataset[FSH_BG_MARK] = '1'; });
        plan.forEach(([td, bg]) => { td.style.backgroundColor = bg; });
    }

    function clearFixedHeaderBackground() {
        document.querySelectorAll('[data-nsft-fsh-bg]').forEach((row) => {
            delete row.dataset[FSH_BG_MARK];
            row.querySelectorAll(':scope > td').forEach((td) => {
                td.style.removeProperty('background-color');
            });
        });
    }

    function runFixedSublistHeaders() {
        try {
            if (window.NSFT_RecordButtons && NSFT_RecordButtons.isHeaderlessPage && NSFT_RecordButtons.isHeaderlessPage()) return;
        } catch (e) { }
        document.documentElement.classList.add(FSH_CLASS);
        trasCargaFiu(armFixedSublistHeaders);
    }
    function armFixedSublistHeaders() {
        if (!document.documentElement.classList.contains(FSH_CLASS)) return;
        paintFixedHeaderBackground();
        if (window.NSFT_Observer && !_fshUnsub) {
            _fshUnsub = NSFT_Observer.subscribe(paintFixedHeaderBackground, { throttle: 400 });
        }
    }
    function stopFixedSublistHeaders() {
        document.documentElement.classList.remove(FSH_CLASS);
        if (_fshUnsub) { _fshUnsub(); _fshUnsub = null; }
        clearFixedHeaderBackground();
    }

    const FT_CLASS = 'nsft-ft-on';
    const FIXED_TABS_ROWS =
        '#div__body > table.uir-table-block.uir_form_tab_container > tbody > tr:nth-child(1),' +
        '#results_tab_div > div > table > tbody > tr:nth-child(1),' +
        '.nltabcontent > .uir-table-block > tbody > tr:nth-child(1)';
    const FIXED_TABS_BG_MARK = 'nsftFtBg';
    let _ftUnsub = null;

    const REDWOOD_SUBTAB_BG = 'rgb(251, 249, 248)';

    function subtabBandBackground(row) {
        if (!document.body || document.body.dataset.pageTheme !== 'redwood') return '';
        return row.querySelector('.bgsubtabbar') ? REDWOOD_SUBTAB_BG : '';
    }

    function paintFixedTabsBackground() {
        const nuevas = Array.from(document.querySelectorAll(FIXED_TABS_ROWS))
            .filter((row) => !row.dataset[FIXED_TABS_BG_MARK]);
        const plan = [];
        nuevas.forEach((row) => {
            const bg = subtabBandBackground(row) || firstOpaqueBackground(row);
            if (!bg) return;
            row.querySelectorAll(':scope > td').forEach((td) => {
                if (isTransparentColor(getComputedStyle(td).backgroundColor)) plan.push([td, bg]);
            });
        });
        nuevas.forEach((row) => { row.dataset[FIXED_TABS_BG_MARK] = '1'; });
        plan.forEach(([td, bg]) => { td.style.backgroundColor = bg; });
    }

    function clearFixedTabsBackground() {
        document.querySelectorAll('[data-nsft-ft-bg]').forEach((row) => {
            delete row.dataset[FIXED_TABS_BG_MARK];
            row.querySelectorAll(':scope > td').forEach((td) => {
                td.style.removeProperty('background-color');
            });
        });
    }

    function runFixedTabs() {
        const params = new URLSearchParams(window.location.search);
        if (params.get('l') === 'T') return;
        if (!/\.nl$/.test(window.location.pathname)) return;
        try {
            if (window.NSFT_RecordButtons && NSFT_RecordButtons.isHeaderlessPage && NSFT_RecordButtons.isHeaderlessPage()) return;
        } catch (e) { }

        document.documentElement.classList.add(FT_CLASS);
        armFixedTabsBackground();
    }

    function armFixedTabsBackground() {
        trasCargaFiu(() => {
            if (!document.documentElement.classList.contains(FT_CLASS)) return;
            paintFixedTabsBackground();
            subscribeFixedTabsBackground();
        });
    }
    function subscribeFixedTabsBackground() {
        if (window.NSFT_Observer && !_ftUnsub) {
            _ftUnsub = NSFT_Observer.subscribe(paintFixedTabsBackground, { throttle: 400 });
        }
    }

    function stopFixedTabs() {
        document.documentElement.classList.remove(FT_CLASS);
        if (_ftUnsub) { _ftUnsub(); _ftUnsub = null; }
        clearFixedTabsBackground();
    }

    const SDO_CLASS = 'nsft-sdo-on';
    const SDO_PAD_VAR = '--nsft-sdo-pad';
    const SDO_LH_VAR = '--nsft-sdo-lh';


    function runSmallerDropdownOptions(height) {
        try {
            if (window.NSFT_RecordButtons && NSFT_RecordButtons.isHeaderlessPage && NSFT_RecordButtons.isHeaderlessPage()) return;
        } catch (e) { }

        const pad = Math.max(0, Number(height) || 0);
        const lineHeight = 16 + pad * 2;
        ponVarHtml(SDO_PAD_VAR, `${pad}px`);
        ponVarHtml(SDO_LH_VAR, `${lineHeight}px`);
        document.documentElement.classList.add(SDO_CLASS);
    }

    function stopSmallerDropdownOptions() {
        document.documentElement.classList.remove(SDO_CLASS);
    }

    const NAV_CLASS = 'nsft-compact-nav';
    const NAV_HEIGHT_VAR = '--nsft-nav-item-h';


    function runSmallerNavigationOptions(height) {
        try {
            if (window.NSFT_RecordButtons && NSFT_RecordButtons.isHeaderlessPage && NSFT_RecordButtons.isHeaderlessPage()) return;
        } catch (e) { }

        const pxHeight = height || 30;
        ponVarHtml(NAV_HEIGHT_VAR, `${pxHeight}px`);
        document.documentElement.classList.add(NAV_CLASS);
    }

    function stopSmallerNavigationOptions() {
        document.documentElement.classList.remove(NAV_CLASS);
    }

    const MAINMENU_CLASS = 'nsft-smaller-mainmenu';
    const MAINMENU_ZOOM_VAR = '--nsft-mainmenu-zoom';
    const MAINMENU_BASE_FS = 14;


    function runSmallerMainMenu(fontSize) {
        try {
            if (window.NSFT_RecordButtons && NSFT_RecordButtons.isHeaderlessPage && NSFT_RecordButtons.isHeaderlessPage()) return;
        } catch (e) { }

        const fs = fontSize || MAINMENU_BASE_FS;
        const zoom = fs / MAINMENU_BASE_FS;
        ponVarHtml(MAINMENU_ZOOM_VAR, `${zoom}`);
        document.documentElement.classList.add(MAINMENU_CLASS);
    }

    function stopSmallerMainMenu() {
        document.documentElement.classList.remove(MAINMENU_CLASS);
    }

    const SSH_CLASS = 'nsft-ssh-on';


    function runSmallerSublistHeaders() {
        try {
            if (window.NSFT_RecordButtons && NSFT_RecordButtons.isHeaderlessPage && NSFT_RecordButtons.isHeaderlessPage()) return;
        } catch (e) { }
        document.documentElement.classList.add(SSH_CLASS);
    }
    function stopSmallerSublistHeaders() {
        document.documentElement.classList.remove(SSH_CLASS);
    }

    const PROFILE_BTN_ID = 'nsft-profile-button';
    const PROFILE_EDIT_MENU_ID = 'nsft-profile-edit-menu';
    const PROFILE_ICON_PATH = 'M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z';
    const SVG_NS = 'http://www.w3.org/2000/svg';

    let _profileActive = false;
    let _profileUserId = null;
    let _profileUnsub = null;
    let _profileMsgHandler = null;
    let _profileHideTimer = null;
    const PERFIL_COPIA_VIEJA = ['nsftMenuNativo'];

    function startProfileButton() {
        if (_profileActive) return;
        try {
            if (window.NSFT_RecordButtons && NSFT_RecordButtons.isHeaderlessPage && NSFT_RecordButtons.isHeaderlessPage()) return;
        } catch (e) { }

        _profileActive = true;
        try { PERFIL_COPIA_VIEJA.forEach((k) => localStorage.removeItem(k)); } catch (e) { }

        if (_profileUserId) { ensureProfileButton(); return; }

        const cookie = /(?:^|;\s*)lastUser=([^;]*)/.exec(document.cookie || '');
        let partes = [];
        try { partes = cookie ? decodeURIComponent(cookie[1]).split('_') : []; } catch (e) { partes = []; }
        const uidCookie = partes.length >= 4 ? partes[partes.length - 2] : '';
        if (/^\d+$/.test(uidCookie)) {
            _profileUserId = uidCookie;
            ensureProfileButton();
            return;
        }

        _profileMsgHandler = (event) => {
            if (event.source !== window || event.origin !== window.location.origin) return;
            const data = event.data;
            if (!data || data.dest !== 'extension_profile' || !data.userId) return;
            window.removeEventListener('message', _profileMsgHandler);
            _profileMsgHandler = null;
            _profileUserId = String(data.userId);
            if (_profileActive) ensureProfileButton();
        };
        window.addEventListener('message', _profileMsgHandler);

        const inyecta = () => {
            try {
                const script = document.createElement('script');
                script.src = chrome.runtime.getURL('scripts/modules/fix_improve_ui_ux/get_user_id.js');
                script.onload = function () { this.remove(); };
                script.onerror = function () { this.remove(); };
                (window.NSFT_AfterLoad ? window.NSFT_AfterLoad.append(script) : (document.head || document.documentElement).appendChild(script));
            } catch (e) { }
        };
        if (document.readyState === 'complete') inyecta();
        else window.addEventListener('load', inyecta, { once: true });
    }

    function ensureProfileButton() {
        if (renderProfileButton()) return;
        if (window.NSFT_Observer && !_profileUnsub) {
            _profileUnsub = NSFT_Observer.subscribe(() => {
                if (renderProfileButton() && _profileUnsub) { _profileUnsub(); _profileUnsub = null; }
            }, { throttle: 300 });
        }
    }

    function stopProfileButton() {
        if (!_profileActive) return;
        _profileActive = false;
        if (_profileUnsub) { _profileUnsub(); _profileUnsub = null; }
        if (_profileMsgHandler) { window.removeEventListener('message', _profileMsgHandler); _profileMsgHandler = null; }
        clearTimeout(_profileHideTimer);
        document.getElementById(PROFILE_BTN_ID)?.remove();
        document.getElementById(PROFILE_EDIT_MENU_ID)?.remove();
    }

    function renderProfileButton() {
        if (document.getElementById(PROFILE_BTN_ID)) return true;
        if (!_profileUserId) return false;

        const DOM = window.NSFT_DOM;
        const feedbackButton = DOM
            ? DOM.q(['[data-automation-id="FeedbackMenuItem"]', '[aria-label*="Feedback"]'], { module: 'fix_improve_ui_ux', purpose: 'feedback menu item' })
            : document.querySelector('[data-automation-id="FeedbackMenuItem"]');
        const roleButton = DOM
            ? DOM.q(['[data-automation-id="RoleMenuItem"]', '[aria-label*="Role"]'], { module: 'fix_improve_ui_ux', purpose: 'role menu item' })
            : document.querySelector('[data-automation-id="RoleMenuItem"]');

        if (!feedbackButton && !roleButton) return false;

        const label = chrome.i18n.getMessage('profileButtonLabel') || 'Profile';
        const sourceButton = feedbackButton || roleButton;
        const profileButton = sourceButton.cloneNode(true);

        profileButton.id = PROFILE_BTN_ID;
        profileButton.setAttribute('data-automation-id', 'ProfileMenuItem');
        profileButton.setAttribute('aria-label', label);
        profileButton.title = label;
        profileButton.removeAttribute('data-header-section');
        profileButton.querySelectorAll('[id]').forEach((el) => el.removeAttribute('id'));

        profileButton.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (e.ctrlKey || e.metaKey || e.shiftKey) window.open(profileUrl(false), '_blank');
            else window.location.href = profileUrl(false);
        };
        profileButton.addEventListener('mousedown', (e) => {
            if (e.button === 1) e.preventDefault();
        });
        profileButton.addEventListener('auxclick', (e) => {
            if (e.button !== 1) return;
            e.preventDefault();
            e.stopPropagation();
            window.open(profileUrl(false), '_blank');
        });

        profileButton.addEventListener('mouseenter', () => {
            clearTimeout(_profileHideTimer);
            showEditMenu();
        });
        profileButton.addEventListener('mouseleave', scheduleHideEditMenu);

        const labelEl = profileButton.querySelector('label');
        if (labelEl) labelEl.textContent = label;

        const svg = profileButton.querySelector('svg');
        if (svg) {
            while (svg.firstChild) svg.removeChild(svg.firstChild);
            svg.setAttribute('viewBox', '0 0 24 24');
            const path = document.createElementNS(SVG_NS, 'path');
            path.setAttribute('d', PROFILE_ICON_PATH);
            svg.appendChild(path);
        }

        if (feedbackButton) feedbackButton.insertAdjacentElement('afterend', profileButton);
        else roleButton.insertAdjacentElement('beforebegin', profileButton);
        return true;
    }


    function buildEditMenu() {
        const ya = document.getElementById(PROFILE_EDIT_MENU_ID);
        if (ya) return ya;

        const etiqueta = chrome.i18n.getMessage('profileEditLabel') || 'Edit profile';
        const menu = document.createElement('div');
        menu.id = PROFILE_EDIT_MENU_ID;
        menu.setAttribute('role', 'menu');
        menu.setAttribute('aria-orientation', 'vertical');
        menu.setAttribute('data-nsft-ui', '');
        const group = document.createElement('div');
        group.setAttribute('role', 'group');
        const item = document.createElement('a');
        item.className = 'nsft-profile-edit-item';
        item.setAttribute('role', 'menuitem');
        item.href = profileUrl(true);
        item.tabIndex = 0;
        const label = document.createElement('span');
        label.className = 'nsft-profile-edit-label';
        label.textContent = etiqueta;
        item.appendChild(label);
        item.addEventListener('keydown', (e) => {
            if (e.key === ' ') { e.preventDefault(); goEditProfile(); }
        });
        group.appendChild(item);
        menu.appendChild(group);

        menu.addEventListener('mouseenter', () => clearTimeout(_profileHideTimer));
        menu.addEventListener('mouseleave', scheduleHideEditMenu);

        document.body.appendChild(menu);
        return menu;
    }

    function menuPerfil() {
        return document.getElementById(PROFILE_EDIT_MENU_ID);
    }

    function showEditMenu() {
        if (!_profileUserId) return;
        const btn = document.getElementById(PROFILE_BTN_ID);
        if (!btn) return;

        const menu = buildEditMenu();
        menu.classList.add('nsft-open');

        const rect = btn.getBoundingClientRect();
        const menuRect = menu.getBoundingClientRect();
        let left = rect.left;
        if (left + menuRect.width > window.innerWidth - 8) left = window.innerWidth - menuRect.width - 8;
        if (left < 8) left = 8;
        menu.style.left = `${left}px`;
        menu.style.top = `${Math.floor(rect.bottom) - 1}px`;
    }

    function scheduleHideEditMenu() {
        clearTimeout(_profileHideTimer);
        _profileHideTimer = setTimeout(() => {
            const btn = document.getElementById(PROFILE_BTN_ID);
            const menu = menuPerfil();
            if ((btn && btn.matches(':hover')) || (menu && menu.matches(':hover'))) return;
            hideEditMenu();
        }, 250);
    }

    function hideEditMenu() {
        document.getElementById(PROFILE_EDIT_MENU_ID)?.classList.remove('nsft-open');
    }

    function profileUrl(edit) {
        return `/app/common/entity/employee.nl?id=${encodeURIComponent(_profileUserId)}${edit ? '&e=T' : ''}`;
    }

    function goEditProfile() {
        if (!_profileUserId) return;
        window.location.href = profileUrl(true);
    }

})();
