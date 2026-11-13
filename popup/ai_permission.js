document.addEventListener('DOMContentLoaded', () => {
    const t = (k, subs) => chrome.i18n.getMessage(k, subs) || '';
    document.querySelectorAll('[data-i18n]').forEach((el) => {
        const msg = t(el.getAttribute('data-i18n'));
        if (msg) el.textContent = msg;
    });
    document.title = t('aiperm_title') || document.title;

    const params = new URLSearchParams(location.search);
    const origin = params.get('origin') || '';
    const nombre = params.get('name') || origin.replace(/^https?:\/\//, '').replace(/\/\*$/, '');
    const valido = /^https?:\/\/[^/]+\/\*$/.test(origin);

    document.getElementById('texto').textContent = t('aiperm_text', [nombre]);
    document.getElementById('origen').textContent = origin.replace(/\/\*$/, '');

    const boton = document.getElementById('conceder');
    const estado = document.getElementById('estado');
    const pinta = (ok, key) => {
        estado.hidden = false;
        estado.className = 'estado ' + (ok ? 'ok' : 'no');
        estado.textContent = t(key);
    };
    if (!valido) { boton.hidden = true; pinta(false, 'aiperm_bad'); return; }

    boton.addEventListener('click', () => {
        chrome.permissions.request({ origins: [origin] }, (granted) => {
            if (chrome.runtime.lastError || !granted) { pinta(false, 'aiperm_denied'); return; }
            boton.hidden = true;
            pinta(true, 'aiperm_done');
            setTimeout(() => window.close(), 1800);
        });
    });
});
