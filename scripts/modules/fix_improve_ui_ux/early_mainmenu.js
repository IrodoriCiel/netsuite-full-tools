(function () {
    'use strict';

    const CLASS = 'nsft-smaller-mainmenu';
    const STYLE_ID = 'nsft-smaller-mainmenu-style';
    const ZOOM_VAR = '--nsft-mainmenu-zoom';
    const BASE_FS = 14;

    chrome.storage.local.get({ enableSmallerMainMenu: true, mainMenuFontSize: 13 }, (items) => {
        if (!items.enableSmallerMainMenu) return;
        ensureStyle();
        const fs = items.mainMenuFontSize || BASE_FS;
        document.documentElement.style.setProperty(ZOOM_VAR, `${fs / BASE_FS}`);
        document.documentElement.classList.add(CLASS);
    });

    function ensureStyle() {
        if (document.getElementById(STYLE_ID)) return;
        const style = document.createElement('style');
        style.id = STYLE_ID;
        const nav = `html.${CLASS} div[data-header-section="navigation"]`;
        style.textContent = `
            ${nav} {
                zoom: var(${ZOOM_VAR}, 1);
            }
            ${nav} [data-widget="MenuItem"] [data-widget="Text"] {
                font-size: calc(7px / var(${ZOOM_VAR}, 1) + 7px) !important;
            }
        `;
        (document.head || document.documentElement).appendChild(style);
    }
})();
