(function () {
    'use strict';

    document.documentElement.classList.add('wizard-on');

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

    pideDibujos();
})();
