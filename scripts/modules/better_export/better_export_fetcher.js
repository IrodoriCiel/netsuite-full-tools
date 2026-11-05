(function () {
    'use strict';

    if (window.__nsftBetterExport) return;
    window.__nsftBetterExport = true;

    window.addEventListener('message', function (ev) {
        if (ev.source !== window) return;
        const d = ev.data;
        if (!d || d.dest !== 'fetcher_bexp' || typeof d.reqId !== 'string') return;
        window.postMessage({ dest: 'extension_bexp', reqId: d.reqId, url: direccion() }, '*');
    });

    function direccion() {
        try {
            const form = document.getElementById('footer_actions_form');
            if (!form || typeof appendFormDataToURL !== 'function') return '';
            const u = new URL(appendFormDataToURL(form.getAttribute('action')), location.origin);
            u.searchParams.set('OfficeXML', 'T');
            u.searchParams.set('csv', 'Export');
            return u.href;
        } catch (e) {
            return '';
        }
    }
})();
