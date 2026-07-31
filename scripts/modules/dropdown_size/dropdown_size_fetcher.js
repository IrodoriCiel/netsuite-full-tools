(function () {
    'use strict';
    var DEFAULT_PX = 400;

    var hadOriginal = ('DROPDOWN_INPUT_MAX_SIZE_PIXELS' in window);
    var originalPx = hadOriginal ? window.DROPDOWN_INPUT_MAX_SIZE_PIXELS : undefined;

    function clampPx(px) {
        px = parseInt(px, 10);
        if (isNaN(px)) px = DEFAULT_PX;
        return Math.max(100, Math.min(1200, px));
    }

    window.addEventListener('message', function (e) {
        if (e.source !== window) return;
        var msg = e.data;
        if (!msg || msg.dest !== 'fetcher_ds') return;
        try {
            if (msg.type === 'set') {
                window.DROPDOWN_INPUT_MAX_SIZE_PIXELS = clampPx(msg.px);
            } else if (msg.type === 'reset') {
                if (hadOriginal) {
                    window.DROPDOWN_INPUT_MAX_SIZE_PIXELS = originalPx;
                } else {
                    try { delete window.DROPDOWN_INPUT_MAX_SIZE_PIXELS; }
                    catch (e2) { window.DROPDOWN_INPUT_MAX_SIZE_PIXELS = undefined; }
                }
            }
        } catch (err) { }
    });
})();
