(function () {
    'use strict';

    const DONE_KEY = 'nsftOnboardingDone';

    const CATEGORIES = [
        ['essentials', 'tabEssentials'],
        ['records', 'tabRecords'],
        ['dev', 'tabDev'],
        ['search', 'tabSearch'],
        ['layout', 'tabLayout'],
        ['productivity', 'tabProductivity'],
        ['fileCabinet', 'tabFileCabinet'],
        ['pdf', 'tabPdf'],
        ['workflow', 'tabWorkflow']
    ];

    const SUGGESTED_OFF = ['enableColorThemes', 'enableProductionBanner'];

    const PROFILES = ['none', 'suggested', 'all', 'custom'];

    let steps = [];
    let state = {};
    let profile = 'suggested';
    let index = -1;
    let conPerfiles = true;
    let doneMode = false;
    let actual = null;
    let allKeys = [];
    let subKeys = [];
    let rotulos = {};

    const $ = (id) => document.getElementById(id);
    const t = (key, subs) => chrome.i18n.getMessage(key, subs) || '';

    async function loadSteps() {
        const res = await fetch(chrome.runtime.getURL('popup/popup.html'));
        const doc = new DOMParser().parseFromString(await res.text(), 'text/html');

        return CATEGORIES.map(([code, labelKey]) => {
            const panel = doc.querySelector(`.nsft-panel[data-panel="${code}"]`);
            const items = [];
            if (panel) {
                panel.querySelectorAll('.option-row').forEach((row) => {
                    const input = row.querySelector('label.switch input[type="checkbox"][id^="enable"]')
                        || row.querySelector('input[type="checkbox"][id^="enable"]');
                    if (!input) return;
                    const labelEl = row.querySelector('[id^="label_"][data-i18n]');
                    const descEl = row.querySelector('.description[data-i18n]');
                    items.push({
                        key: input.id,
                        label: labelEl ? t(labelEl.getAttribute('data-i18n')) : input.id,
                        desc: descEl ? t(descEl.getAttribute('data-i18n')) : '',
                        subs: leerSubopciones(row, input)
                    });
                });
            }
            return { code, labelKey, items };
        }).filter((s) => s.items.length);
    }

    const TIPOS_SUB = ['select', 'checkbox', 'number', 'range', 'color', 'text'];

    function rotuloDe(row, el) {
        const porFor = row.querySelector('label[for="' + el.id + '"]');
        const cand = porFor || (el.closest ? el.closest('label') : null);
        if (!cand) return el.id;
        const propio = cand.getAttribute('data-i18n');
        if (propio) return t(propio);
        const dentro = cand.querySelector('[data-i18n]');
        if (dentro) return t(dentro.getAttribute('data-i18n'));
        return (cand.textContent || '').trim() || el.id;
    }

    function leerSubopciones(row, interruptor) {
        const defaults = globalThis.NSFT_DEFAULTS || {};
        const subs = [];
        row.querySelectorAll('select[id], input[id]').forEach((el) => {
            if (el === interruptor) return;
            const tipo = el.tagName === 'SELECT'
                ? 'select'
                : String(el.getAttribute('type') || 'text').toLowerCase();
            if (TIPOS_SUB.indexOf(tipo) < 0) return;
            if (!(el.id in defaults)) return;

            const sub = { key: el.id, tipo: tipo, label: rotuloDe(row, el) };
            if (tipo === 'select') {
                sub.opciones = Array.from(el.options).map((o) => {
                    const clave = o.getAttribute('data-i18n');
                    return { v: o.value, t: clave ? t(clave) : (o.textContent || o.value).trim() };
                });
            }
            if (tipo === 'number' || tipo === 'range') {
                sub.min = el.getAttribute('min');
                sub.max = el.getAttribute('max');
                sub.step = el.getAttribute('step');
            }
            subs.push(sub);
        });
        return subs;
    }

    function applyProfile(name) {
        profile = name;
        const defaults = globalThis.NSFT_DEFAULTS || {};
        allKeys.forEach((key) => {
            if (name === 'none' || name === 'custom') state[key] = false;
            else if (name === 'all') state[key] = true;
            else state[key] = SUGGESTED_OFF.includes(key) ? false : defaults[key] !== false;
        });
    }

    function totalPasos() { return steps.length + (conPerfiles ? 1 : 0); }
    function pasoActual() { return index + (conPerfiles ? 2 : 1); }

    function setCount(texto) { $('wizCount').textContent = texto || ''; }
    function showBar(visible) { $('wizGauge').hidden = !visible; }

    function setGauge(hechas, total) {
        $('wizBar').style.width = (total ? Math.round((hechas / total) * 100) : 0) + '%';
        $('wizBarCount').textContent = total ? hechas + '/' + total : '';
    }

    function previewMode(on) {
        document.documentElement.classList.toggle('wizard-step', !!on);
        const caja = $('wizPreview');
        if (caja) caja.hidden = !on;
    }

    let _pendiente = null;

    function showPreview(item) {
        const pv = window.NSFT_PV;
        if (!pv || !pv.pintar) { _pendiente = item; return; }
        _pendiente = null;
        pv.pintar($('wizPreview'), item, { rotulos: rotulos });
    }

    document.addEventListener('nsft-pv-listo', () => {
        if (_pendiente) showPreview(_pendiente);
    });

    function alPrincipio() {
        const b = $('wizBody');
        if (b) b.scrollTop = 0;
    }

    function renderProfiles() {
        $('wizTitle').textContent = t('welcomeWizProfileTitle');
        $('wizSub').textContent = t('welcomeWizProfileSub');
        setCount(profile === 'custom' ? '1 / ' + totalPasos() : '');
        showBar(false);
        previewMode(false);
        $('wizBack').hidden = true;
        $('wizSkip').hidden = true;

        const body = $('wizBody');
        body.replaceChildren();
        const list = document.createElement('div');
        list.className = 'wizard-profiles';

        PROFILES.forEach((name) => {
            const card = document.createElement('button');
            card.type = 'button';
            card.className = 'wizard-profile' + (name === profile ? ' is-active' : '');
            card.setAttribute('aria-pressed', String(name === profile));

            const cap = name.charAt(0).toUpperCase() + name.slice(1);

            const head = document.createElement('span');
            head.className = 'wizard-profile-head';
            const title = document.createElement('span');
            title.className = 'wizard-profile-title';
            title.textContent = t('welcomeWizProfile' + cap);
            head.appendChild(title);
            if (name === 'suggested') {
                const badge = document.createElement('span');
                badge.className = 'wizard-profile-badge';
                badge.textContent = t('welcomeWizRecommended');
                head.appendChild(badge);
            }

            const desc = document.createElement('span');
            desc.className = 'wizard-profile-desc';
            desc.textContent = t('welcomeWizProfile' + cap + 'Desc');

            card.append(head, desc);
            card.addEventListener('click', () => { applyProfile(name); renderProfiles(); });
            list.appendChild(card);
        });

        body.appendChild(list);
        alPrincipio();
        $('wizNext').textContent = t(profile === 'custom' ? 'welcomeWizContinue' : 'welcomeWizConfirm');
    }

    function renderStep() {
        const step = steps[index];
        const encendidas = step.items.filter((it) => state[it.key]).length;

        previewMode(true);
        setCount(pasoActual() + ' / ' + totalPasos());
        $('wizTitle').textContent = t(step.labelKey);
        $('wizSub').textContent = t('welcomeWizStepSub', [String(encendidas), String(step.items.length)]);
        showBar(true);
        setGauge(encendidas, step.items.length);
        $('wizBack').hidden = index === 0 && !conPerfiles;
        $('wizSkip').hidden = false;
        $('wizSkip').textContent = t('welcomeWizSkip');
        $('wizNext').textContent = index === steps.length - 1 ? t('welcomeWizFinish') : t('welcomeWizNext');

        const body = $('wizBody');
        body.replaceChildren();

        const cabeza = document.createElement('div');
        cabeza.className = 'wizard-listhead';
        const rotulo = document.createElement('span');
        rotulo.className = 'wizard-listhead-label';
        rotulo.textContent = t('welcomeWizToolsLabel');
        const masivo = document.createElement('button');
        masivo.type = 'button';
        masivo.className = 'wizard-bulk-btn';
        const todasYa = encendidas === step.items.length;
        masivo.textContent = t(todasYa ? 'welcomeWizNone' : 'welcomeWizAll');
        masivo.addEventListener('click', () => {
            const todas = step.items.every((it) => state[it.key]);
            step.items.forEach((it) => { state[it.key] = !todas; });
            renderStep();
        });
        cabeza.append(rotulo, masivo);
        body.appendChild(cabeza);

        const list = document.createElement('div');
        list.className = 'wizard-list';
        step.items.forEach((it) => {
            const row = document.createElement('label');
            row.className = 'wizard-item';

            const box = document.createElement('input');
            box.type = 'checkbox';
            box.checked = !!state[it.key];
            box.addEventListener('change', () => {
                state[it.key] = box.checked;
                row.classList.toggle('is-on', box.checked);
                const van = step.items.filter((x) => state[x.key]).length;
                $('wizSub').textContent = t('welcomeWizStepSub',
                    [String(van), String(step.items.length)]);
                setGauge(van, step.items.length);
                masivo.textContent = t(van === step.items.length ? 'welcomeWizNone' : 'welcomeWizAll');
            });

            const texts = document.createElement('span');
            texts.className = 'wizard-item-text';
            const name = document.createElement('strong');
            name.textContent = it.label;
            texts.appendChild(name);
            if (it.desc) {
                const d = document.createElement('span');
                d.textContent = it.desc;
                texts.appendChild(d);
            }

            const mirar = () => showPreview(it);
            row.addEventListener('mouseenter', mirar);
            box.addEventListener('focus', mirar);

            row.classList.toggle('is-on', !!state[it.key]);
            row.append(box, texts);

            list.appendChild(row);
        });
        body.appendChild(list);
        alPrincipio();

        if (step.items.length) showPreview(step.items[0]);
    }

    function renderDone(count) {
        doneMode = true;
        previewMode(false);
        setCount('');
        $('wizTitle').textContent = t('welcomeWizDoneTitle');
        $('wizSub').textContent = t('welcomeWizDoneSub', [String(count), String(allKeys.length)]);
        showBar(true);
        $('wizBar').style.width = '100%';
        $('wizBarCount').textContent = '';
        $('wizBack').hidden = false;
        $('wizSkip').hidden = true;
        $('wizNext').textContent = t('welcomeWizOpenSettings');

        const nota = document.createElement('p');
        nota.className = 'wizard-done-note';
        nota.textContent = t('welcomeWizDoneMore');
        $('wizBody').replaceChildren(nota);
        alPrincipio();
    }

    function save(done) {
        const payload = Object.assign({}, state);
        payload[DONE_KEY] = true;
        if (typeof payload.enableDarkMode === 'boolean') {
            payload.nsftTheme = payload.enableDarkMode ? 'dark' : 'light';
        }
        chrome.storage.local.set(payload, () => {
            if (typeof done === 'function') done();
        });
    }

    function cuentaActivas() { return allKeys.filter((k) => state[k]).length; }

    function next() {
        if (doneMode) {
            chrome.tabs.create({ url: chrome.runtime.getURL('popup/popup.html') + '?view=tab' });
            return;
        }
        if (index === -1) {
            if (profile === 'custom') { index = 0; renderStep(); return; }
            save(() => renderDone(cuentaActivas()));
            return;
        }
        if (index < steps.length - 1) { index++; renderStep(); return; }
        save(() => renderDone(cuentaActivas()));
    }

    function back() {
        if (doneMode) {
            doneMode = false;
            if (index < 0) renderProfiles();
            else renderStep();
            return;
        }
        if (index === 0 && conPerfiles) { index = -1; renderProfiles(); return; }
        if (index <= 0) return;
        index--;
        renderStep();
    }

    function skip() {
        save(() => renderDone(cuentaActivas()));
    }

    function closeWizard() {
        const section = $('setupWizard');
        previewMode(false);
        if (section) section.hidden = true;
        document.documentElement.classList.remove('wizard-on');
    }

    async function start(repaso) {
        const section = $('setupWizard');
        if (!section) { closeWizard(); return; }

        steps = await loadSteps();
        if (!steps.length) { closeWizard(); return; }

        allKeys = steps.flatMap((s) => s.items.map((i) => i.key));
        subKeys = steps.flatMap((s) => s.items.flatMap((i) => (i.subs || []).map((x) => x.key)));
        rotulos = {};
        steps.forEach((s) => s.items.forEach((i) => { rotulos[i.key] = i.label; }));

        const defaults = globalThis.NSFT_DEFAULTS || {};
        subKeys.forEach((k) => { state[k] = defaults[k]; });

        section.hidden = false;
        document.documentElement.classList.add('wizard-on');
        $('wizNext').addEventListener('click', next);
        $('wizBack').addEventListener('click', back);
        $('wizSkip').addEventListener('click', skip);

        conPerfiles = !repaso;
        if (repaso) {
            await new Promise((resolve) => {
                const pedido = {};
                allKeys.forEach((k) => { pedido[k] = defaultOf(k); });
                subKeys.forEach((k) => { pedido[k] = defaults[k]; });
                chrome.storage.local.get(pedido, (items) => {
                    actual = {};
                    allKeys.forEach((k) => { actual[k] = items[k] !== false; });
                    subKeys.forEach((k) => {
                        state[k] = items[k] === undefined ? defaults[k] : items[k];
                    });
                    resolve();
                });
            });
            allKeys.forEach((k) => { state[k] = !!actual[k]; });
            index = 0;
            renderStep();
        } else {
            applyProfile('suggested');
            renderProfiles();
        }
    }

    function defaultOf(key) {
        const defaults = globalThis.NSFT_DEFAULTS || {};
        return defaults[key] !== false;
    }

    function boot() {
        const repaso = window.location.hash === '#wizard';
        chrome.storage.local.get({ [DONE_KEY]: false }, (items) => {
            if (repaso) start(true);
            else if (!items[DONE_KEY]) start(false);
            else closeWizard();
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot);
    } else {
        boot();
    }
})();
