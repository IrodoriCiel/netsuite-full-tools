'use strict';

(function () {
    if (window.nsft_runScript) return;
    window.nsft_runScript = function () {
        try {
            window.dispatchEvent(new CustomEvent('nsft-script-execute-run'));
        } catch (e) { }
    };
})();
