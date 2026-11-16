(function () {
    'use strict';

    const STACK_ID = 'nsft-notice-stack';

    function pintaTema(el, tema) {
        if (!el) return;
        const t = tema || document.documentElement.getAttribute('data-nsft-theme');
        el.setAttribute('data-theme', t === 'dark' ? 'dark' : 'light');
    }
    try {
        chrome.storage.onChanged.addListener((changes, area) => {
            if (area !== 'local' || !changes.nsftTheme) return;
            pintaTema(document.getElementById(STACK_ID), changes.nsftTheme.newValue || 'light');
        });
    } catch (e) { }

    function stack() {
        let el = document.getElementById(STACK_ID);
        if (el) return el;
        if (!document.body) return null;
        el = document.createElement('div');
        el.id = STACK_ID;
        el.className = 'nsft-w';
        pintaTema(el);
        document.body.appendChild(el);
        return el;
    }

    window.NSFT_Notices = {
        mount: function (el) {
            const s = stack();
            if (!s || !el) return null;
            s.appendChild(el);
            return el;
        },

        unmount: function (el) {
            if (el && el.parentNode) el.parentNode.removeChild(el);
            const s = document.getElementById(STACK_ID);
            if (s && !s.children.length) s.remove();
        }
    };
})();
