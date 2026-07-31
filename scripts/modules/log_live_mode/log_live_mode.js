(function () {
    'use strict';

    if (!/\/scripting\/(?:script|scriptrecord|scriptdeploy)\.nl(\?|$)/.test(window.location.pathname + window.location.search)) return;

    const STORAGE_KEY = 'enableLiveMode';
    const INTERVAL_KEY = 'liveModeInterval';
    const AUTOSTART_KEY = 'liveModeAutoStart';
    const INTERVAL_MIN = 1;
    const INTERVAL_MAX = 300;

    const CONTAINER_CLASS = 'nsft-log-live-mode-container';
    const TOGGLE_CLASS = 'nsft-log-live-mode-toggle';
    const SLIDER_CLASS = 'nsft-log-live-mode-slider';
    const LABEL_CLASS = 'nsft-log-live-mode-label';
    const INPUT_CLASS = 'nsft-log-live-mode-input';
    const UNIT_CLASS = 'nsft-log-live-mode-unit';
    const INDICATOR_CLASS = 'nsft-log-live-mode-indicator';
    const COUNTDOWN_CLASS = 'nsft-log-live-mode-countdown';

    const I18N = {
        live: chrome.i18n.getMessage('liveMode'),
        secs: chrome.i18n.getMessage('secondsAbbr')
    };

    let refreshLoop = null;
    let currentInterval = 3;
    let countdownRemaining = 0;
    let injectedTd = null;
    let chkEl = null;
    let intervalInputEl = null;
    let dotEl = null;
    let countdownEl = null;
    let unsubscribeObserver = null;
    let storageListener = null;
    let visibilityListener = null;
    let pageHideListener = null;

    chrome.storage.local.get({
        [STORAGE_KEY]: true,
        [INTERVAL_KEY]: 3,
        [AUTOSTART_KEY]: false
    }, (items) => {
        if (!items[STORAGE_KEY]) {
            attachStorageListener();
            return;
        }
        currentInterval = sanitizeInterval(items[INTERVAL_KEY]);
        start(items[AUTOSTART_KEY]);
    });

    function start(autoStart) {
        attachStorageListener();

        if (window.NSFT_Observer && typeof window.NSFT_Observer.subscribe === 'function') {
            unsubscribeObserver = window.NSFT_Observer.subscribe(() => {
                tryInject(autoStart);
            }, { throttle: 200, immediate: true });
        } else {
            tryInject(autoStart);
        }

        pageHideListener = () => stopLoop();
        window.addEventListener('pagehide', pageHideListener, { once: true });

        visibilityListener = () => {
            if (!chkEl || !chkEl.checked) return;
            if (document.visibilityState === 'hidden') {
                stopLoop({ keepUi: true });
            } else if (refreshLoop === null) {
                startLoop(currentInterval, { immediate: false });
            }
        };
        document.addEventListener('visibilitychange', visibilityListener);
    }

    function tryInject(autoStart) {
        if (injectedTd && document.body.contains(injectedTd)) return;

        const table = (window.NSFT_DOM && window.NSFT_DOM.q)
            ? window.NSFT_DOM.q(['#tbl_refreshscriptnote', '#refreshscriptnote_table'], { module: 'log_live_mode', purpose: 'refresh-row' })
            : document.querySelector('#tbl_refreshscriptnote');
        if (!table) return;

        const tr = table.closest('tr');
        if (!tr) return;

        injectLiveModeControl(tr, currentInterval, autoStart);
        if (autoStart) startLoop(currentInterval);
    }

    function attachStorageListener() {
        if (storageListener) return;
        storageListener = (changes, area) => {
            if (area !== 'local') return;

            if (changes[STORAGE_KEY]) {
                const enabled = changes[STORAGE_KEY].newValue !== false;
                if (!enabled) {
                    teardown();
                } else if (!injectedTd) {
                    chrome.storage.local.get({
                        [INTERVAL_KEY]: 3,
                        [AUTOSTART_KEY]: false
                    }, (items) => {
                        currentInterval = sanitizeInterval(items[INTERVAL_KEY]);
                        if (!unsubscribeObserver && window.NSFT_Observer) {
                            unsubscribeObserver = window.NSFT_Observer.subscribe(() => {
                                tryInject(items[AUTOSTART_KEY]);
                            }, { throttle: 200, immediate: true });
                        } else {
                            tryInject(items[AUTOSTART_KEY]);
                        }
                    });
                }
                return;
            }

            if (changes[INTERVAL_KEY]) {
                const newVal = sanitizeInterval(changes[INTERVAL_KEY].newValue);
                if (newVal === currentInterval) return;
                currentInterval = newVal;
                if (intervalInputEl) intervalInputEl.value = String(newVal);
                if (chkEl && chkEl.checked) startLoop(newVal, { immediate: false });
            }
        };
        chrome.storage.onChanged.addListener(storageListener);
    }

    function injectLiveModeControl(tr, initialInterval, shouldAutoStart) {
        const td = document.createElement('td');
        td.style.paddingLeft = '15px';
        td.style.verticalAlign = 'middle';

        const container = document.createElement('div');
        container.className = CONTAINER_CLASS;

        const toggleLabel = document.createElement('label');
        toggleLabel.className = TOGGLE_CLASS;
        const chk = document.createElement('input');
        chk.type = 'checkbox';
        chk.id = 'nsft-live-mode-chk';
        chk.checked = !!shouldAutoStart;
        const sliderSpan = document.createElement('span');
        sliderSpan.className = SLIDER_CLASS;
        toggleLabel.append(chk, sliderSpan);

        const labelSpan = document.createElement('span');
        labelSpan.className = LABEL_CLASS;
        labelSpan.textContent = I18N.live;

        const intervalWrap = document.createElement('div');
        intervalWrap.style.display = 'flex';
        intervalWrap.style.alignItems = 'baseline';
        const intervalInput = document.createElement('input');
        intervalInput.type = 'number';
        intervalInput.id = 'nsft-live-interval';
        intervalInput.className = INPUT_CLASS;
        intervalInput.min = String(INTERVAL_MIN);
        intervalInput.max = String(INTERVAL_MAX);
        intervalInput.step = '1';
        intervalInput.value = String(initialInterval);
        const unit = document.createElement('span');
        unit.className = UNIT_CLASS;
        unit.textContent = I18N.secs;
        intervalWrap.append(intervalInput, unit);

        const dot = document.createElement('div');
        dot.id = 'nsft-live-dot';
        dot.className = INDICATOR_CLASS + (shouldAutoStart ? ' active' : '');

        const countdown = document.createElement('span');
        countdown.id = 'nsft-live-countdown';
        countdown.className = COUNTDOWN_CLASS;
        countdown.textContent = '';

        container.append(toggleLabel, labelSpan, intervalWrap, dot, countdown);
        td.appendChild(container);
        tr.appendChild(td);

        injectedTd = td;
        chkEl = chk;
        intervalInputEl = intervalInput;
        dotEl = dot;
        countdownEl = countdown;

        chk.addEventListener('change', onToggleChange);
        intervalInput.addEventListener('change', onIntervalChange);
    }

    function onToggleChange() {
        if (chkEl.checked) {
            if (dotEl) dotEl.classList.add('active');
            startLoop(currentInterval);
        } else {
            stopLoop();
        }
    }

    function onIntervalChange() {
        const sanitized = sanitizeInterval(intervalInputEl.value);
        if (String(sanitized) !== intervalInputEl.value) intervalInputEl.value = String(sanitized);
        currentInterval = sanitized;
        chrome.storage.local.set({ [INTERVAL_KEY]: sanitized });
        if (chkEl && chkEl.checked) startLoop(sanitized, { immediate: false });
    }

    function sanitizeInterval(raw) {
        const n = parseInt(raw, 10);
        if (!Number.isFinite(n)) return 3;
        return Math.max(INTERVAL_MIN, Math.min(INTERVAL_MAX, n));
    }

    function startLoop(seconds, opts) {
        stopLoop({ keepUi: true });
        const total = sanitizeInterval(seconds);
        currentInterval = total;
        countdownRemaining = total;
        refreshLoop = setInterval(loopTick, 1000);
        showCountdown(true);
        updateCountdownDisplay();
        if (!opts || opts.immediate !== false) {
            triggerRefresh();
        }
    }

    function loopTick() {
        countdownRemaining -= 1;
        if (countdownRemaining <= 0) {
            triggerRefresh();
            countdownRemaining = currentInterval;
        }
        updateCountdownDisplay();
    }

    function stopLoop(opts) {
        if (refreshLoop) {
            clearInterval(refreshLoop);
            refreshLoop = null;
        }
        if (!opts || !opts.keepUi) {
            if (dotEl) dotEl.classList.remove('active');
            showCountdown(false);
        }
    }

    function showCountdown(visible) {
        if (!countdownEl) return;
        countdownEl.classList.toggle('active', !!visible);
        if (!visible) countdownEl.textContent = '';
    }

    function updateCountdownDisplay() {
        if (!countdownEl) return;
        const remaining = Math.max(0, countdownRemaining);
        countdownEl.textContent = remaining + I18N.secs;
    }

    function triggerRefresh() {
        const btn = (window.NSFT_DOM && window.NSFT_DOM.q)
            ? window.NSFT_DOM.q(['#refreshscriptnote'], { module: 'log_live_mode', purpose: 'refresh-button' })
            : document.querySelector('#refreshscriptnote');
        if (!btn) return;

        if (dotEl) {
            dotEl.classList.add('active');
            dotEl.style.animation = 'none';
            if (window.requestAnimationFrame) {
                window.requestAnimationFrame(() => {
                    if (dotEl) dotEl.style.animation = '';
                });
            } else {
                dotEl.style.animation = '';
            }
        }

        btn.click();
    }

    function teardown() {
        stopLoop();
        if (unsubscribeObserver) {
            try { unsubscribeObserver(); } catch (e) { }
            unsubscribeObserver = null;
        }
        if (visibilityListener) {
            document.removeEventListener('visibilitychange', visibilityListener);
            visibilityListener = null;
        }
        if (pageHideListener) {
            window.removeEventListener('pagehide', pageHideListener);
            pageHideListener = null;
        }
        if (injectedTd && injectedTd.parentNode) {
            injectedTd.parentNode.removeChild(injectedTd);
        }
        injectedTd = null;
        chkEl = null;
        intervalInputEl = null;
        dotEl = null;
        countdownEl = null;
        countdownRemaining = 0;
    }
})();
