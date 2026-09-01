'use strict';

(function () {
    if (window.__nsftDfhFetcher) return;
    window.__nsftDfhFetcher = true;

    function reply(date, time) {
        window.postMessage({
            dest: 'extension_dfh',
            type: 'formats',
            payload: { date: date || null, time: time || null }
        }, '*');
    }

    try {
        if (typeof nlapiGetContext !== 'function') { reply(null, null); return; }
        const ctx = nlapiGetContext();
        if (!ctx || typeof ctx.getPreference !== 'function') { reply(null, null); return; }
        const d = ctx.getPreference('DATEFORMAT');
        const t = ctx.getPreference('TIMEFORMAT');
        reply(d ? String(d) : null, t ? String(t) : null);
    } catch (e) {
        reply(null, null);
    }
})();
