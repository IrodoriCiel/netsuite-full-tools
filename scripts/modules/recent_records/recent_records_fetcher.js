'use strict';

(function () {
    if (window.__nsftRrFetcher) return;
    window.__nsftRrFetcher = true;

    function reply(format) {
        window.postMessage({
            dest: 'extension_rr',
            type: 'dateformat',
            payload: { format: format || null }
        }, '*');
    }

    try {
        if (typeof nlapiGetContext !== 'function') { reply(null); return; }
        const ctx = nlapiGetContext();
        const fmt = ctx && typeof ctx.getPreference === 'function'
            ? ctx.getPreference('DATEFORMAT')
            : null;
        reply(fmt ? String(fmt) : null);
    } catch (e) {
        reply(null);
    }
})();
