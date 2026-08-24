(function () {
    'use strict';

    const root = document.documentElement;
    root.classList.add('nsft-wizard-pending');

    function resolver(conAsistente) {
        root.classList.toggle('wizard-on', !!conAsistente);
        root.classList.remove('nsft-wizard-pending');
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
