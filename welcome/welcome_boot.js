(function () {
    'use strict';

    const root = document.documentElement;
    root.classList.add('nsft-wizard-pending');

    function pideDibujos() {
        if (document.getElementById('nsft-pv-js')) return;
        const hoja = document.createElement('link');
        hoja.rel = 'stylesheet';
        hoja.href = 'welcome_previews.css';
        document.head.appendChild(hoja);

        const guion = document.createElement('script');
        guion.id = 'nsft-pv-js';
        guion.src = 'welcome_previews.js';
        guion.async = false;
        guion.addEventListener('load', () => {
            document.dispatchEvent(new CustomEvent('nsft-pv-listo'));
        });
        document.head.appendChild(guion);
    }

    function resolver(conAsistente) {
        root.classList.toggle('wizard-on', !!conAsistente);
        root.classList.remove('nsft-wizard-pending');
        if (conAsistente) pideDibujos();
    }

    const red = setTimeout(() => root.classList.remove('nsft-wizard-pending'), 1500);

    try {
        chrome.storage.local.get({ nsftOnboardingDone: false }, (items) => {
            clearTimeout(red);
            if (chrome.runtime.lastError) { resolver(false); return; }
            resolver(window.location.hash === '#wizard' || !items.nsftOnboardingDone);
        });
    } catch (e) {
        clearTimeout(red);
        resolver(false);
    }
})();
