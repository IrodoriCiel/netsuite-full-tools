(function () {
    'use strict';
    const STORAGE_KEY = 'enableAutoRefresh';
    const KEY_INTERVAL = 'autoRefreshInterval';
    const KEY_AUTOSTART = 'autoRefreshAutoStart';

    const CONTAINER_CLASS = 'nsft-auto-refresh-container';
    const TOGGLE_CLASS = 'nsft-auto-refresh-toggle';
    const SLIDER_CLASS = 'nsft-auto-refresh-slider';
    const LABEL_CLASS = 'nsft-auto-refresh-label';
    const INPUT_CLASS = 'nsft-auto-refresh-input';
    const UNIT_CLASS = 'nsft-auto-refresh-unit';
    const INDICATOR_CLASS = 'nsft-auto-refresh-indicator';

    let refreshLoop = null;

    const MIN_INTERVAL = 1;
    const MAX_INTERVAL = 300;

    chrome.storage.local.get({
        [STORAGE_KEY]: true,
        [KEY_INTERVAL]: 5,
        [KEY_AUTOSTART]: false
    }, (items) => {
        if (items[STORAGE_KEY]) injectControl(items[KEY_INTERVAL], items[KEY_AUTOSTART]);
    });

    chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== 'local') return;
        if (changes[KEY_INTERVAL]) updateInterval(changes[KEY_INTERVAL].newValue);
        if (changes[STORAGE_KEY]) {
            if (changes[STORAGE_KEY].newValue === false) {
                stopLoop();
                removeControl();
            } else if (changes[STORAGE_KEY].newValue === true) {
                chrome.storage.local.get({ [KEY_INTERVAL]: 5, [KEY_AUTOSTART]: false }, (it) => {
                    injectControl(it[KEY_INTERVAL], it[KEY_AUTOSTART]);
                });
            }
        }
    });

    window.addEventListener('pagehide', stopLoop);

    function clampInterval(v) {
        return Math.min(MAX_INTERVAL, Math.max(MIN_INTERVAL, parseInt(v, 10) || 5));
    }

    function injectControl(initialInterval, shouldAutoStart) {
        try {
            if (window.NSFT_RecordButtons && NSFT_RecordButtons.isExcludedPage && NSFT_RecordButtons.isExcludedPage()) return;
        } catch (e) { }

        const btn = document.querySelector('input#refresh');
        if (!btn) return;
        if (document.querySelector(`.${CONTAINER_CLASS}`)) return;

        const btnParentTd = btn.closest('td');
        if (!btnParentTd) return;
        const innerTable = btnParentTd.closest('table');
        if (!innerTable) return;

        const outerTr = innerTable.closest('tr');
        const parentEl = innerTable.parentElement;
        if (!outerTr && !parentEl) return;

        const safeInterval = clampInterval(initialInterval);
        const control = buildControl(safeInterval, shouldAutoStart);

        let wrapper;
        if (outerTr) {
            wrapper = document.createElement('td');
            wrapper.style.paddingLeft = '15px';
            wrapper.style.verticalAlign = 'middle';
            wrapper.appendChild(control);
            outerTr.appendChild(wrapper);
        } else {
            wrapper = document.createElement('div');
            wrapper.style.display = 'inline-block';
            wrapper.style.marginLeft = '15px';
            wrapper.style.verticalAlign = 'middle';
            wrapper.appendChild(control);
            if (innerTable.nextSibling) parentEl.insertBefore(wrapper, innerTable.nextSibling);
            else parentEl.appendChild(wrapper);
        }

        bindEvents(control);
        if (shouldAutoStart) startLoop(safeInterval);
    }

    function buildControl(safeInterval, shouldAutoStart) {
        const container = document.createElement('div');
        container.className = CONTAINER_CLASS;
        container.style.cssText = 'display:flex;align-items:center;gap:8px;';

        const toggle = document.createElement('label');
        toggle.className = TOGGLE_CLASS;
        const chk = document.createElement('input');
        chk.type = 'checkbox';
        chk.id = 'nsft-auto-refresh-chk';
        chk.checked = !!shouldAutoStart;
        const slider = document.createElement('span');
        slider.className = SLIDER_CLASS;
        toggle.append(chk, slider);

        const label = document.createElement('span');
        label.className = LABEL_CLASS;
        label.textContent = chrome.i18n.getMessage('autoRefresh') || 'Auto refresh';

        const intervalWrap = document.createElement('div');
        intervalWrap.style.cssText = 'display:flex;align-items:baseline;';
        const intervalInput = document.createElement('input');
        intervalInput.type = 'number';
        intervalInput.id = 'nsft-auto-refresh-interval';
        intervalInput.className = INPUT_CLASS;
        intervalInput.value = String(safeInterval);
        intervalInput.min = String(MIN_INTERVAL);
        intervalInput.max = String(MAX_INTERVAL);
        const unit = document.createElement('span');
        unit.className = UNIT_CLASS;
        unit.textContent = chrome.i18n.getMessage('secondsAbbr') || 's';
        intervalWrap.append(intervalInput, unit);

        const dot = document.createElement('div');
        dot.id = 'nsft-auto-refresh-dot';
        dot.className = INDICATOR_CLASS + (shouldAutoStart ? ' active' : '');

        container.append(toggle, label, intervalWrap, dot);
        return container;
    }

    function removeControl() {
        const c = document.querySelector(`.${CONTAINER_CLASS}`);
        if (!c) return;
        const wrapper = c.parentElement;
        (wrapper || c).remove();
    }

    function bindEvents(containerRef) {
        const chk = containerRef.querySelector('#nsft-auto-refresh-chk');
        const intervalInput = containerRef.querySelector('#nsft-auto-refresh-interval');
        const dotIndicator = containerRef.querySelector('#nsft-auto-refresh-dot');

        chk.addEventListener('change', () => {
            chrome.storage.local.set({ [KEY_AUTOSTART]: chk.checked });

            if (chk.checked) {
                dotIndicator.classList.add('active');
                startLoop(intervalInput.value);
            } else {
                stopLoop();
                dotIndicator.classList.remove('active');
            }
        });

        intervalInput.addEventListener('change', () => {
            const clamped = clampInterval(intervalInput.value);
            intervalInput.value = String(clamped);
            chrome.storage.local.set({ [KEY_INTERVAL]: clamped });

            if (chk.checked) {
                startLoop(clamped);
            }
        });
    }

    function updateInterval(newVal) {
        const input = document.getElementById('nsft-auto-refresh-interval');
        if (input) {
            input.value = newVal;

            const chk = document.getElementById('nsft-auto-refresh-chk');
            if (chk && chk.checked) {
                startLoop(newVal);
            }
        }
    }

    function startLoop(seconds) {
        stopLoop();
        const ms = clampInterval(seconds) * 1000;
        refreshLoop = setTimeout(triggerReload, ms);
    }

    function stopLoop() {
        if (refreshLoop) {
            clearTimeout(refreshLoop);
            refreshLoop = null;
        }
    }

    function triggerReload() {
        const dotIndicator = document.getElementById('nsft-auto-refresh-dot');
        if (dotIndicator) {
            dotIndicator.classList.remove('active');
            requestAnimationFrame(() => dotIndicator.classList.add('active'));
        }

        window.location.reload();
    }

})();
