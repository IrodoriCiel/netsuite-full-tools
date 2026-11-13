(function () {
    'use strict';
    if (window.NSFT_CodeLink) return;

    const KEY = 'enableAdvancedEditor';
    const PARAM = 'nsft-advanced-editor';
    let activo = true;

    function sella() {
        try {
            document.documentElement.setAttribute('data-nsft-adv-editor', activo ? 'on' : 'off');
        } catch (e) { }
    }

    try {
        chrome.storage.local.get({ [KEY]: true }, (items) => {
            activo = !!items[KEY];
            sella();
        });
        chrome.storage.onChanged.addListener((changes, area) => {
            if (area !== 'local' || !changes[KEY]) return;
            activo = !!changes[KEY].newValue;
            sella();
        });
    } catch (e) { }
    sella();

    function avanzado(url) {
        try {
            const u = new URL(url, location.origin);
            if (!/\/app\/common\/record\/edittextmediaitem\.nl/i.test(u.pathname)) return null;
            u.searchParams.delete('syntaxHighlighting');
            u.searchParams.delete('l');
            u.searchParams.delete('target');
            u.searchParams.set('e', 'T');
            u.searchParams.set(PARAM, 'T');
            return u.origin === location.origin ? u.pathname + u.search : u.href;
        } catch (e) { return null; }
    }

    function netsuite(fileId) {
        return '/app/common/record/edittextmediaitem.nl?id=' + encodeURIComponent(fileId)
            + '&e=T&l=T&target=filesize&syntaxHighlighting=T';
    }

    window.NSFT_CodeLink = {
        activo: () => activo,
        url(fileId) {
            const ns = netsuite(fileId);
            return (activo && avanzado(ns)) || ns;
        },
        convierte(url) {
            if (!url || !activo) return url;
            return avanzado(url) || url;
        },
        avanzado
    };
})();
