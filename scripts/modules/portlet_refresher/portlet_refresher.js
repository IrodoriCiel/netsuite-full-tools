(function () {
    'use strict';

    const STORAGE_KEY = 'enablePortletRefresher';
    const INTERVAL_KEY = 'portletRefresherInterval';
    const AUTOSTART_KEY = 'portletRefresherAutoStart';
    const DEFAULT_INTERVAL_SECONDS = 600;
    const MIN_INTERVAL_SECONDS = 15;
    const MAX_INTERVAL_SECONDS = 86400;
    const STAGGER_MS = 150;

    let _timer = null;
    let _control = null;
    let _paused = true;

    function isApplicablePage() {
        try {
            if (window.NSFT_RecordButtons && NSFT_RecordButtons.isExcludedPage && NSFT_RecordButtons.isExcludedPage()) return false;
        } catch (e) { }
        return true;
    }

    chrome.storage.local.get(
        {
            [STORAGE_KEY]: true, enableDiscreetMode: false,
            [INTERVAL_KEY]: DEFAULT_INTERVAL_SECONDS, [AUTOSTART_KEY]: false
        },
        (settings) => {
            if (!settings[STORAGE_KEY] || settings.enableDiscreetMode || !isApplicablePage()) return;
            const secs = clamp(settings[INTERVAL_KEY]);
            _paused = !settings[AUTOSTART_KEY];
            if (findRefreshEls().length) injectControl(secs);
            if (!_paused) start(secs, { now: true });
        }
    );

    chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== 'local') return;
        if (changes[STORAGE_KEY]) {
            if (changes[STORAGE_KEY].newValue && isApplicablePage()) {
                chrome.storage.local.get(
                    { [INTERVAL_KEY]: DEFAULT_INTERVAL_SECONDS, [AUTOSTART_KEY]: false }, (s) => {
                    const secs = clamp(s[INTERVAL_KEY]);
                    _paused = !s[AUTOSTART_KEY];
                    if (!_control && findRefreshEls().length) injectControl(secs);
                    paintControl(secs);
                    if (!_paused) start(secs, { now: true });
                });
            } else {
                stop();
                removeControl();
            }
        } else if (changes[INTERVAL_KEY]) {
            const secs = clamp(changes[INTERVAL_KEY].newValue);
            paintControl(secs);
            if (!_paused) start(secs, { now: false });
        }
    });

    window.addEventListener('pagehide', stop);

    function clamp(seconds) {
        const n = Math.round(Number(seconds));
        if (!isFinite(n) || n <= 0) return DEFAULT_INTERVAL_SECONDS;
        return Math.min(MAX_INTERVAL_SECONDS, Math.max(MIN_INTERVAL_SECONDS, n));
    }

    function start(seconds, opts) {
        stop();
        if (opts && opts.now) refreshPortlets();
        _timer = setInterval(refreshPortlets, clamp(seconds) * 1000);
    }

    function stop() {
        if (_timer) { clearInterval(_timer); _timer = null; }
    }


    function msg(key, fallback) {
        try { return chrome.i18n.getMessage(key) || fallback; } catch (e) { return fallback; }
    }

    function injectControl(seconds) {
        if (document.querySelector('.nsft-pr-container')) return;

        const box = document.createElement('div');
        box.className = 'nsft-pr-container';

        const toggle = document.createElement('label');
        toggle.className = 'nsft-pr-toggle';
        toggle.title = msg('portletRefresherPause', 'Pausar el auto-refresco');
        const chk = document.createElement('input');
        chk.type = 'checkbox';
        chk.checked = !_paused;
        const slider = document.createElement('span');
        slider.className = 'nsft-pr-slider';
        toggle.appendChild(chk);
        toggle.appendChild(slider);

        const label = document.createElement('span');
        label.className = 'nsft-pr-label';
        label.textContent = msg('portletRefresherCtrl', 'Auto-refresco');

        const input = document.createElement('input');
        input.type = 'number';
        input.className = 'nsft-pr-input';
        input.min = String(MIN_INTERVAL_SECONDS);
        input.max = String(MAX_INTERVAL_SECONDS);
        input.value = String(seconds);
        input.title = msg('portletRefresherIntervalTitle', 'Segundos entre refrescos');

        const unit = document.createElement('span');
        unit.className = 'nsft-pr-unit';
        unit.textContent = msg('portletRefresherUnit', 'segs');

        const now = document.createElement('button');
        now.type = 'button';
        now.className = 'nsft-pr-now';
        now.textContent = '⟳';
        now.title = msg('portletRefresherNow', 'Refrescar ahora');

        const dot = document.createElement('span');
        dot.className = 'nsft-pr-dot' + (_paused ? '' : ' is-on');

        [toggle, label, input, unit, now, dot].forEach((el) => box.appendChild(el));
        mount(box);
        _control = { box: box, chk: chk, input: input, now: now, dot: dot, toggle: toggle };

        chk.addEventListener('change', () => {
            _paused = !chk.checked;
            if (_paused) {
                stop();
            } else {
                start(clamp(input.value), { now: false });
            }
            paintControl(clamp(input.value));
        });

        input.addEventListener('change', () => {
            const secs = clamp(input.value);
            input.value = String(secs);
            chrome.storage.local.set({ [INTERVAL_KEY]: secs });
        });

        now.addEventListener('click', () => {
            refreshPortlets();
            if (!_paused) start(clamp(input.value), { now: false });
        });
    }

    function mount(box) {
        const h1 = window.NSFT_DOM && NSFT_DOM.q
            ? NSFT_DOM.q(['#ns-dashboard-heading-panel h1', '[id*="dashboard-heading"] h1',
                '#ns-dashboard-heading-panel', '[id*="dashboard-heading"]'],
            { module: 'portlet_refresher', purpose: 'título del dashboard' })
            : document.querySelector('#ns-dashboard-heading-panel h1');

        if (!h1) {
            box.classList.add('nsft-pr-floating');
            document.body.appendChild(box);
            return;
        }
        h1.appendChild(box);
    }

    function paintControl(seconds) {
        if (!_control) return;
        _control.chk.checked = !_paused;
        _control.dot.classList.toggle('is-on', !_paused);
        _control.toggle.title = _paused
            ? msg('portletRefresherResume', 'Reanudar el auto-refresco')
            : msg('portletRefresherPause', 'Pausar el auto-refresco');
        _control.now.disabled = false;
        if (seconds != null) _control.input.value = String(clamp(seconds));
    }

    function removeControl() {
        if (_control && _control.box && _control.box.parentNode) _control.box.remove();
        _control = null;
    }


    const REFRESH_SELECTORS = [
        '.ns-portlet-icon-refresh',
        '[class*="portlet-icon-refresh"]',
        'a[title="Refresh"]',
        '[title="Refresh"]'
    ];

    function findRefreshEls() {
        if (window.NSFT_DOM && NSFT_DOM.qAll) {
            return NSFT_DOM.qAll(REFRESH_SELECTORS, {
                module: 'portlet_refresher', purpose: 'botón Refresh de cada portlet'
            });
        }
        for (let i = 0; i < REFRESH_SELECTORS.length; i++) {
            const nodes = document.querySelectorAll(REFRESH_SELECTORS[i]);
            if (nodes.length) return nodes;
        }
        return document.querySelectorAll(':not(*)');
    }

    function refreshPortlets() {
        const refreshEls = findRefreshEls();
        if (_control && refreshEls.length) {
            _control.dot.classList.remove('is-beat');
            void _control.dot.offsetWidth;
            _control.dot.classList.add('is-beat');
        }
        refreshEls.forEach((el, i) => {
            setTimeout(() => { try { el.click(); } catch (e) { } }, i * STAGGER_MS);
        });
    }
})();
