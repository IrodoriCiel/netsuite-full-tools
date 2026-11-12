// Firefox only (copied into the build by tools/firefox/build.mjs). In Firefox, fetch/XHR from a
// content script run with the extension's origin, so NetSuite treats them as
// cross-origin and drops the session cookies. Send NetSuite (same-origin)
// requests through the page's own fetch/XHR; leave external APIs (GitHub, AI
// providers) on the extension's fetch so host permissions keep working.
(function () {
    if (globalThis.__nsftFirefoxCompat) return;
    if (typeof content !== 'object' || !content || typeof content.fetch !== 'function') return;
    globalThis.__nsftFirefoxCompat = true;

    const extFetch = globalThis.fetch.bind(globalThis);
    const pageFetch = content.fetch.bind(content);

    function isSameOrigin(input) {
        try {
            const raw = (input && typeof input === 'object' && 'url' in input) ? input.url : String(input);
            return new URL(raw, location.href).origin === location.origin;
        } catch (e) {
            return false;
        }
    }

    globalThis.fetch = function (input, init) {
        return isSameOrigin(input) ? pageFetch(input, init) : extFetch(input, init);
    };

    // Only NetSuite uploads use XHR from content scripts, so always use the page's.
    if (typeof content.XMLHttpRequest === 'function') {
        globalThis.XMLHttpRequest = content.XMLHttpRequest;
    }
})();
