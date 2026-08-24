(function () {
    'use strict';

    const STACK_ID = 'nsft-notice-stack';

    function stack() {
        let el = document.getElementById(STACK_ID);
        if (el) return el;
        if (!document.body) return null;
        el = document.createElement('div');
        el.id = STACK_ID;
        document.body.appendChild(el);
        return el;
    }

    window.NSFT_Notices = {
        mount: function (el) {
            const s = stack();
            if (!s || !el) return null;
            s.appendChild(el);
            return el;
        },

        unmount: function (el) {
            if (el && el.parentNode) el.parentNode.removeChild(el);
            const s = document.getElementById(STACK_ID);
            if (s && !s.children.length) s.remove();
        }
    };
})();
