(function () {
    'use strict';
    try {
        var s = document.currentScript;
        var raw = s && s.dataset && s.dataset.bundles ? s.dataset.bundles : '{}';
        var bundles;
        try { bundles = JSON.parse(raw); } catch (e) { return; }
        if (!bundles || typeof bundles !== 'object') return;
        if (Object.keys(bundles).length === 0) return;

        var MAX = 40;
        var DELAY = 150;
        var attempts = 0;

        function apply() {
            attempts++;
            var input = document.querySelector('input[name="inpt_bundlefilter"]');
            if (!input) return;

            var ndd = document.querySelector('.ns-dropdown[data-name="bundlefilter"]');
            if (ndd) {
                try {
                    var optsRaw = ndd.getAttribute('data-options');
                    if (optsRaw) {
                        var opts = JSON.parse(optsRaw);
                        var changed = false;
                        opts.forEach(function (o) {
                            if (String(o.value || '').indexOf('BUNDLE_') !== 0) return;
                            var id = String(o.text || '').trim();
                            if (/\(\s*\d+\s*\)$/.test(id)) return;
                            if (bundles[id]) {
                                o.text = bundles[id] + ' (' + id + ')';
                                changed = true;
                            }
                        });
                        if (changed) ndd.setAttribute('data-options', JSON.stringify(opts));
                    }
                } catch (e) { }
            }

            document.querySelectorAll('.dropdownDiv > div[id^="nl"]').forEach(function (div) {
                var txt = (div.textContent || '').trim();
                if (!/^\d+$/.test(txt)) return;
                if (bundles[txt]) {
                    div.textContent = bundles[txt] + ' (' + txt + ')';
                }
            });

            var currentVal = String(input.value || '').trim();
            if (/^\d+$/.test(currentVal) && bundles[currentVal]) {
                var newVisible = bundles[currentVal] + ' (' + currentVal + ')';
                input.value = newVisible;
                input.setAttribute('title', newVisible);
            }

            var ddReady = false;
            if (typeof window.getDropdown === 'function') {
                try {
                    var dd = window.getDropdown(input);
                    if (dd && Array.isArray(dd.valueArray) && Array.isArray(dd.textArray)) {
                        ddReady = true;
                        for (var i = 0; i < dd.valueArray.length; i++) {
                            var val = String(dd.valueArray[i] || '');
                            if (val.indexOf('BUNDLE_') !== 0) continue;
                            var existing = String(dd.textArray[i] || '').trim();
                            var id = existing.replace(/\s*\(\s*\d+\s*\)\s*$/, '');
                            id = id.replace(/^.*?\((\d+)\)\s*$/, '$1');
                            var m = existing.match(/\((\d+)\)\s*$/);
                            if (m) id = m[1];
                            if (/^\d+$/.test(existing)) id = existing;
                            if (bundles[id]) {
                                var newText = bundles[id] + ' (' + id + ')';
                                if (dd.textArray[i] !== newText) {
                                    if (typeof dd.setOptionText === 'function') {
                                        try { dd.setOptionText(val, newText); } catch (e) { }
                                    }
                                    dd.textArray[i] = newText;
                                }
                            }
                        }
                    }
                } catch (e) { }
            }

            if (!ddReady && attempts < MAX) {
                setTimeout(apply, DELAY);
            }
        }

        apply();

        var tt = document.querySelector('.uir-tooltip-content');
        if (tt) {
            var mo = new MutationObserver(function () { apply(); });
            mo.observe(tt, { childList: true, subtree: true });
        }
    } catch (e) { }
})();
