(function () {
    'use strict';
    if (window.__nsftSpBridge) return;
    window.__nsftSpBridge = true;

    function getDD(bar) {
        if (!bar || typeof getDropdown === 'undefined') return null;
        var input = bar.parentElement && bar.parentElement.querySelector('.dropdownInput');
        if (!input) return null;
        try { return getDropdown(input); } catch (e) { return null; }
    }

    function clampIdx(dd, idx) {
        var n = dd.getValues().length;
        if (idx < 0) idx = 0;
        if (idx > n - 1) idx = n - 1;
        return idx;
    }

    function report(bar) {
        var dd = getDD(bar);
        if (!dd) return;
        try {
            window.postMessage({
                dest: 'extension_sp',
                id: bar.dataset.spId,
                index: dd.getIndex(),
                count: dd.getValues().length
            }, '*');
        } catch (e) { }
    }

    document.addEventListener('click', function (e) {
        var btn = e.target && e.target.closest ? e.target.closest('.nsft-sp-btn') : null;
        if (!btn) return;
        var bar = btn.closest('.nsft-sp-bar');
        var dd = getDD(bar);
        if (!dd) return;
        try {
            var step = parseInt(bar.dataset.spStep, 10) || 1;
            var idx;
            switch (btn.dataset.spAction) {
                case 'first': idx = 0; break;
                case 'prev':  idx = dd.getIndex() - step; break;
                case 'next':  idx = dd.getIndex() + step; break;
                case 'last':  idx = dd.getValues().length - 1; break;
                default: return;
            }
            dd.setIndex(clampIdx(dd, idx));
            setTimeout(function () { try { btn.focus(); } catch (err) {} }, 0);
            report(bar);
        } catch (err) {
            console.warn('NSFT sublist paging:', err);
        }
    });

    window.addEventListener('message', function (e) {
        if (e.source !== window) return;
        var m = e.data;
        if (!m || m.dest !== 'fetcher_sp' || m.id == null) return;
        var bar = document.querySelector('.nsft-sp-bar[data-sp-id="' + String(m.id).replace(/[^\w-]/g, '') + '"]');
        var dd = getDD(bar);
        if (!dd) return;
        try {
            if (m.type === 'goto') {
                dd.setIndex(clampIdx(dd, parseInt(m.index, 10) || 0));
                report(bar);
            } else if (m.type === 'query') {
                report(bar);
            }
        } catch (err) {
            console.warn('NSFT sublist paging:', err);
        }
    });
})();
