(function () {
    'use strict';

    if (window.__nsftNvbFetcherLoaded) return;
    window.__nsftNvbFetcherLoaded = true;

    var lastSent = '';

    function readVersion() {
        var ns = window.NS;
        if (!ns) return '';
        try {
            return (ns.session && ns.session.comments && ns.session.comments.AppVersion)
                || ns.NS_VER
                || ns.version
                || '';
        } catch (e) { return ''; }
    }

    function readFromSessionScript() {
        try {
            var sc = document.querySelector('script[src*="session_status_init.jsp"]');
            if (!sc) return '';
            var u = new URL(sc.src, location.origin);
            return u.searchParams.get('AppVersion')
                || u.searchParams.get('appVersion')
                || u.searchParams.get('NS_VER')
                || u.searchParams.get('nsVersion')
                || '';
        } catch (e) { return ''; }
    }

    function deliver(v) {
        if (!v) return false;
        v = String(v).trim();
        if (!v || v === lastSent) return true;
        lastSent = v;
        try {
            window.postMessage({ dest: 'extension_nvb', type: 'version', payload: v }, '*');
        } catch (e) { }
        return true;
    }

    function check() {
        if (lastSent) return true;
        return deliver(readVersion() || readFromSessionScript());
    }

    if (check()) return;

    try {
        var nsHolder = window.NS;
        Object.defineProperty(window, 'NS', {
            configurable: true,
            get: function () { return nsHolder; },
            set: function (v) {
                nsHolder = v;
                queueMicrotask(check);
            }
        });
    } catch (e) { }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', check, { once: true });
    }
    window.addEventListener('load', check, { once: true });

    [100, 500, 1500].forEach(function (delay) {
        setTimeout(check, delay);
    });
})();
