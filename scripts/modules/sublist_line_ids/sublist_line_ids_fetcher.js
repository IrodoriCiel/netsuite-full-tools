(function () {
    'use strict';

    if (window.__nsftSliFetcher) return;
    window.__nsftSliFetcher = true;

    window.addEventListener('message', function (e) {
        const d = e.data;
        if (!d || d.dest !== 'fetcher_sli' || d.type !== 'get_line_ids' || !d.payload) return;

        const sublistId = d.payload.sublistId;
        const reqId = d.payload.reqId;
        let values = null;

        try {
            if (sublistId
                && typeof window.nlapiGetLineItemCount === 'function'
                && typeof window.nlapiGetLineItemValue === 'function') {
                const count = window.nlapiGetLineItemCount(sublistId) || 0;
                values = [];
                for (let i = 1; i <= count; i++) {
                    let v = null;
                    try { v = window.nlapiGetLineItemValue(sublistId, 'lineuniquekey', i); } catch (err) { v = null; }
                    values.push(v);
                }
            }
        } catch (err) {
            values = null;
        }

        window.postMessage({
            dest: 'extension_sli',
            type: 'line_ids',
            payload: { sublistId: sublistId, reqId: reqId, values: values }
        }, '*');
    });
})();
