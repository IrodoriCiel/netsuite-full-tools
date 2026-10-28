(function () {
    'use strict';

    if (window.__nsftClearSort) return;
    window.__nsftClearSort = true;

    window.addEventListener('message', function (ev) {
        if (ev.source !== window) return;
        const d = ev.data;
        if (!d || d.dest !== 'fetcher_clearsort') return;
        const machine = String(d.machine || '').replace(/[^A-Za-z0-9_]/g, '');
        if (machine) quitaSublista(machine);
        else quitaLista();
    });

    function vacia(form) {
        const els = form && form.elements;
        if (!els || !els.sortcol) return false;
        els.sortcol.value = '';
        if (els.sortdir) els.sortdir.value = '';
        return true;
    }

    function quitaLista() {
        if (!vacia(document.forms['footer_actions_form'])) return;
        if (typeof refreshMe === 'function') { refreshMe(); return; }
        const u = new URL(location.href);
        u.searchParams.set('sortcol', '');
        u.searchParams.set('sortdir', '');
        location.replace(u.href);
    }

    function quitaSublista(machine) {
        const sync = window['Sync' + machine + 'range'];
        if (typeof sync !== 'function') return;
        if (!vacia(document.forms[machine + '_main_form'])) return;
        sync();
    }
})();
