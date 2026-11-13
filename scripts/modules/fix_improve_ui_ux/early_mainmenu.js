(function () {
    'use strict';

    try {
        if (window.NSFT_RecordButtons && NSFT_RecordButtons.isHeaderlessPage && NSFT_RecordButtons.isHeaderlessPage()) return;
    } catch (e) { }

    const MAINMENU_BASE_FS = 14;

    function aplicaFijarPestanas() {
        if (!/\.nl$/.test(location.pathname)) return false;
        try { return new URLSearchParams(location.search).get('l') !== 'T'; } catch (e) { return false; }
    }

    chrome.storage.local.get({
        enableFixedSublistColumn: true,
        enableFixedSublistHeaders: true,
        enableFixedTabs: true,
        enableSmallerDropdownOptions: true,
        dropdownPixelHeight: 0,
        enableSmallerNavigationOptions: true,
        navigationPixelHeight: 30,
        enableSmallerMainMenu: true,
        mainMenuFontSize: 13,
        enableSmallerSublistHeaders: true
    }, (it) => {
        const html = document.documentElement;
        const clases = [];
        const vars = {};
        if (it.enableFixedSublistColumn) clases.push('nsft-fsc-on');
        if (it.enableFixedSublistHeaders) clases.push('nsft-fsh-on');
        if (it.enableFixedTabs && aplicaFijarPestanas()) clases.push('nsft-ft-on');
        if (it.enableSmallerDropdownOptions) {
            const pad = Math.max(0, Number(it.dropdownPixelHeight) || 0);
            vars['--nsft-sdo-pad'] = pad + 'px';
            vars['--nsft-sdo-lh'] = (16 + pad * 2) + 'px';
            clases.push('nsft-sdo-on');
        }
        if (it.enableSmallerNavigationOptions) {
            vars['--nsft-nav-item-h'] = (it.navigationPixelHeight || 30) + 'px';
            clases.push('nsft-compact-nav');
        }
        if (it.enableSmallerMainMenu) {
            vars['--nsft-mainmenu-zoom'] = String((it.mainMenuFontSize || MAINMENU_BASE_FS) / MAINMENU_BASE_FS);
            clases.push('nsft-smaller-mainmenu');
        }
        if (it.enableSmallerSublistHeaders) clases.push('nsft-ssh-on');
        Object.keys(vars).forEach((k) => html.style.setProperty(k, vars[k]));
        if (clases.length) html.classList.add.apply(html.classList, clases);
    });
})();
