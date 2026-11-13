(function () {
    'use strict';
    if (window.NSFT_Libs) return;

    let _promesa = null;

    function hay() {
        return !!(window.hljs && window.sqlFormatter);
    }

    function listas() {
        if (hay()) return Promise.resolve(true);
        if (_promesa) return _promesa;
        _promesa = new Promise((resolver) => {
            try {
                chrome.runtime.sendMessage({ nsftLibs: 'load' }, (r) => {
                    void chrome.runtime.lastError;
                    const ok = !!(r && r.ok) && hay();
                    if (!ok) _promesa = null;
                    resolver(ok);
                });
            } catch (e) {
                _promesa = null;
                resolver(false);
            }
        });
        return _promesa;
    }

    window.NSFT_Libs = { listas };
})();
