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

    const I18N = {
        live: chrome.i18n.getMessage('liveMode'),
        secs: chrome.i18n.getMessage('secondsAbbr')
    };

    const SPINNER_SVG = '<svg class="nsft-tb-spinner" width="14" height="14" viewBox="0 0 16 16"'
        + ' fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true">'
        + '<circle cx="8" cy="8" r="6" stroke-dasharray="28 12"></circle></svg>';
    const PAUSE_SVG = '<svg class="nsft-tb-pause" width="14" height="14" viewBox="0 0 16 16"'
        + ' fill="currentColor" aria-hidden="true">'
        + '<rect x="4.6" y="3.8" width="2.4" height="8.4" rx="1.1"></rect>'
        + '<rect x="9" y="3.8" width="2.4" height="8.4" rx="1.1"></rect></svg>';

    const divider = () => {
        const d = document.createElement('span');
        d.className = 'nsft-tb-divider';
        return d;
    };

    let refreshTimeout = null;
    let isRefreshing = false;
    let refreshLoop = null;
    let currentInterval = 3;
    let countdownRemaining = 0;
    let injectedTd = null;
    let chkEl = null;
    let intervalInputEl = null;
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
        container.className = 'nsft-tb-group ' + CONTAINER_CLASS;

        const toggleLabel = document.createElement('label');
        toggleLabel.className = 'nsft-tb-switch ' + TOGGLE_CLASS;
        const chk = document.createElement('input');
        chk.type = 'checkbox';
        chk.id = 'nsft-live-mode-chk';
        chk.checked = !!shouldAutoStart;
        const sliderSpan = document.createElement('span');
        sliderSpan.className = 'nsft-tb-slider ' + SLIDER_CLASS;
        toggleLabel.append(chk, sliderSpan);

        const labelSpan = document.createElement('span');
        labelSpan.className = 'nsft-tb-label ' + LABEL_CLASS;
        labelSpan.textContent = I18N.live;

        const intervalWrap = document.createElement('span');
        intervalWrap.style.display = 'inline-flex';
        intervalWrap.style.alignItems = 'center';
        intervalWrap.style.gap = '5px';
        const intervalInput = document.createElement('input');
        intervalInput.type = 'number';
        intervalInput.id = 'nsft-live-interval';
        intervalInput.className = 'nsft-tb-num ' + INPUT_CLASS;
        intervalInput.min = String(INTERVAL_MIN);
        intervalInput.max = String(INTERVAL_MAX);
        intervalInput.step = '1';
        intervalInput.value = String(initialInterval);
        const unit = document.createElement('span');
        unit.className = 'nsft-tb-unit ' + UNIT_CLASS;
        unit.textContent = I18N.secs;
        intervalWrap.append(intervalInput, unit);

        const stateIcon = document.createElement('span');
        stateIcon.id = 'nsft-live-state';
        stateIcon.className = 'nsft-tb-spinslot';
        stateIcon.innerHTML = SPINNER_SVG + PAUSE_SVG;

        container.append(toggleLabel, labelSpan, divider(), intervalWrap, stateIcon);
        td.appendChild(container);
        tr.appendChild(td);

        injectedTd = td;
        chkEl = chk;
        intervalInputEl = intervalInput;

        chk.addEventListener('change', onToggleChange);
        intervalInput.addEventListener('change', onIntervalChange);
        intervalInput.addEventListener('focus', () => {
            if (chkEl && chkEl.checked) intervalInput.value = String(currentInterval);
        });
        intervalInput.addEventListener('blur', updateIntervalField);
        updateStateIcon();
        updateIntervalField();
    }

    function onToggleChange() {
        if (chkEl.checked) {
            startLoop(currentInterval);
        } else {
            stopLoop();
        }
        updateStateIcon();
        updateIntervalField();
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
        updateIntervalField();
        if (!opts || opts.immediate !== false) {
            triggerRefresh();
        }
    }

    function loopTick() {
        if (isRefreshing) return;
        countdownRemaining -= 1;
        if (countdownRemaining <= 0) {
            countdownRemaining = 0;
            updateIntervalField();
            triggerRefresh();
            return;
        }
        updateIntervalField();
    }

    function stopLoop() {
        if (refreshLoop) {
            clearInterval(refreshLoop);
            refreshLoop = null;
        }
        if (refreshTimeout) {
            clearTimeout(refreshTimeout);
            refreshTimeout = null;
        }
        setRefreshing(false);
        countdownRemaining = currentInterval;
        updateIntervalField();
    }

    function updateStateIcon() {
        if (!injectedTd) return;
        const slot = injectedTd.querySelector('.nsft-tb-spinslot');
        if (slot) slot.classList.toggle('is-live', !!(chkEl && chkEl.checked));
    }

    function updateIntervalField() {
        if (!intervalInputEl) return;
        if (document.activeElement === intervalInputEl) return;
        const live = !!(chkEl && chkEl.checked);
        intervalInputEl.value = String(live ? Math.max(0, countdownRemaining) : currentInterval);
        intervalInputEl.classList.toggle('is-counting', live);
    }

    function setRefreshing(on) {
        isRefreshing = !!on;
        if (injectedTd) {
            const group = injectedTd.querySelector('.nsft-tb-group');
            if (group) group.classList.toggle('is-refreshing', isRefreshing);
        }
        if (!isRefreshing) {
            countdownRemaining = currentInterval;
            updateIntervalField();
        }
    }

    function triggerRefresh() {
        const btn = (window.NSFT_DOM && window.NSFT_DOM.q)
            ? window.NSFT_DOM.q(['#refreshscriptnote'], { module: 'log_live_mode', purpose: 'refresh-button' })
            : document.querySelector('#refreshscriptnote');
        if (!btn) return;

        setRefreshing(true);
        if (refreshTimeout) clearTimeout(refreshTimeout);
        refreshTimeout = setTimeout(() => {
            refreshTimeout = null;
            setRefreshing(false);
        }, 1200);

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
        countdownRemaining = 0;
    }
})();
