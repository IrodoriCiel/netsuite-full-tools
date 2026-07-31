(function () {
    'use strict';
    const STORAGE_KEY = 'enableSublistPagingBeta';
    const PAGE_SIZE_KEY = 'sublistPagingPageSize';
    const CONTAINER_CLASS = 'nsft-sp-bar';
    const APPLIED_ATTR = 'data-nsft-sp-applied';
    const SVG_FIRST = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="11 17 6 12 11 7"></polyline><polyline points="18 17 13 12 18 7"></polyline></svg>';
    const SVG_PREV  = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="15 18 9 12 15 6"></polyline></svg>';
    const SVG_NEXT  = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="9 18 15 12 9 6"></polyline></svg>';
    const SVG_LAST  = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="13 17 18 12 13 7"></polyline><polyline points="6 17 11 12 6 7"></polyline></svg>';

    const LEFT_BUTTONS = [
        { label: 'first', icon: SVG_FIRST, key: 'Home', action: 'first' },
        { label: 'prev', icon: SVG_PREV, key: 'ArrowLeft', action: 'prev' }
    ];
    const RIGHT_BUTTONS = [
        { label: 'next', icon: SVG_NEXT, key: 'ArrowRight', action: 'next' },
        { label: 'last', icon: SVG_LAST, key: 'End', action: 'last' }
    ];
    const KEY_TO_ACTION = { Home: 'first', ArrowLeft: 'prev', ArrowRight: 'next', End: 'last' };

    let enabled = false;
    let _inited = false;
    let _observerUnsub = null;
    let _bridgeInjected = false;
    let _barSeq = 0;
    let _pageStep = 1;

    chrome.storage.local.get({ [STORAGE_KEY]: true, [PAGE_SIZE_KEY]: 1 }, (items) => {
        enabled = !!items[STORAGE_KEY];
        _pageStep = normStep(items[PAGE_SIZE_KEY]);
        if (enabled) init();
    });

    chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== 'local') return;
        if (changes[PAGE_SIZE_KEY]) {
            _pageStep = normStep(changes[PAGE_SIZE_KEY].newValue);
            document.querySelectorAll('.' + CONTAINER_CLASS).forEach(b => { b.dataset.spStep = String(_pageStep); });
        }
        if (changes[STORAGE_KEY]) {
            enabled = !!changes[STORAGE_KEY].newValue;
            if (enabled) init();
            else teardown();
        }
    });

    function normStep(v) {
        const n = parseInt(v, 10);
        return (!n || n < 1) ? 1 : n;
    }

    window.addEventListener('message', (e) => {
        if (e.source !== window) return;
        const m = e.data;
        if (!m || m.dest !== 'extension_sp' || m.id == null) return;
        const bar = document.querySelector(`.${CONTAINER_CLASS}[data-sp-id="${String(m.id).replace(/[^\w-]/g, '')}"]`);
        if (!bar) return;
        const count = Number(m.count) || 0;
        const index = Number(m.index) || 0;

        bar.style.display = count <= 1 ? 'none' : '';

        const status = bar.querySelector('.nsft-sp-status');
        if (status) status.textContent = '/ ' + count;
        const goto = bar.querySelector('.nsft-sp-goto');
        if (goto) {
            goto.max = String(count);
            if (document.activeElement !== goto) goto.value = String(index + 1);
        }

        if (bar.dataset.spRestore != null && !bar.dataset.spRestored) {
            bar.dataset.spRestored = '1';
            const saved = parseInt(bar.dataset.spRestore, 10);
            if (!isNaN(saved) && saved >= 0 && saved <= count - 1 && saved !== index) {
                postToBridge({ type: 'goto', id: bar.dataset.spId, index: saved });
                return;
            }
        }
        persistPage(bar, index);
    });

    function init() {
        injectBridgeOnce();
        if (_inited) { scheduleRunOnce(); return; }
        _inited = true;
        runOnce();
        if (window.NSFT_Observer && typeof window.NSFT_Observer.subscribe === 'function') {
            _observerUnsub = window.NSFT_Observer.subscribe(scheduleRunOnce, { throttle: 300 });
        } else {
            const mo = new MutationObserver(scheduleRunOnce);
            mo.observe(document.body, { childList: true, subtree: true });
            _observerUnsub = () => mo.disconnect();
        }
    }

    function teardown() {
        if (_observerUnsub) { _observerUnsub(); _observerUnsub = null; }
        _inited = false;
        document.querySelectorAll('.' + CONTAINER_CLASS).forEach(el => el.remove());
        document.querySelectorAll(`[${APPLIED_ATTR}]`).forEach(el => el.removeAttribute(APPLIED_ATTR));
    }

    function injectBridgeOnce() {
        if (_bridgeInjected) return;
        _bridgeInjected = true;
        const s = document.createElement('script');
        s.src = chrome.runtime.getURL('scripts/modules/sublist_paging/sublist_paging_fetcher.js');
        s.onload = function () { this.remove(); };
        (document.head || document.documentElement).appendChild(s);
    }

    function postToBridge(msg) {
        window.postMessage(Object.assign({ dest: 'fetcher_sp' }, msg), '*');
    }

    function scheduleRunOnce() {
        if (typeof window.requestIdleCallback === 'function') window.requestIdleCallback(runOnce, { timeout: 500 });
        else runOnce();
    }

    function runOnce() {
        if (!enabled) return;
        document.querySelectorAll('.uir-list-control-bar .nldropdown[data-fieldtype="select"]').forEach(injectBar);
    }

    function injectBar(dropdown) {
        if (dropdown.getAttribute(APPLIED_ATTR) === 'true') return;
        const inputEl = dropdown.querySelector('.dropdownInput');
        if (!inputEl) return;

        const id = String(++_barSeq);
        const bar = document.createElement('div');
        bar.className = CONTAINER_CLASS;
        bar.dataset.spId = id;
        bar.dataset.spStep = String(_pageStep);

        const saved = sessionStorage.getItem(pageKey(inputEl));
        if (saved != null) bar.dataset.spRestore = saved;

        LEFT_BUTTONS.forEach(def => bar.appendChild(makeButton(def)));
        bar.appendChild(makeCenter());
        RIGHT_BUTTONS.forEach(def => bar.appendChild(makeButton(def)));

        dropdown.prepend(bar);
        dropdown.setAttribute(APPLIED_ATTR, 'true');

        postToBridge({ type: 'query', id });
    }

    function makeButton(def) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'nsft-sp-btn';
        btn.dataset.key = def.key;
        btn.dataset.spAction = def.action;
        btn.innerHTML = def.icon;
        const title = chrome.i18n.getMessage('sp_title_' + def.label) || labelFallback(def.label);
        btn.title = title;
        btn.setAttribute('aria-label', title);
        return btn;
    }

    function makeCenter() {
        const wrap = document.createElement('div');
        wrap.className = 'nsft-sp-center';

        const goto = document.createElement('input');
        goto.type = 'number';
        goto.min = '1';
        goto.value = '1';
        goto.className = 'nsft-sp-goto';
        const gotoTitle = chrome.i18n.getMessage('sp_goto_title') || 'Go to page';
        goto.title = gotoTitle;
        goto.setAttribute('aria-label', gotoTitle);
        goto.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); commitGoto(goto); } });
        goto.addEventListener('change', () => commitGoto(goto));

        const status = document.createElement('span');
        status.className = 'nsft-sp-status';
        status.textContent = '/ –';

        wrap.appendChild(goto);
        wrap.appendChild(status);
        return wrap;
    }

    function commitGoto(goto) {
        const bar = goto.closest('.' + CONTAINER_CLASS);
        if (!bar) return;
        const page = parseInt(goto.value, 10);
        if (isNaN(page)) return;
        postToBridge({ type: 'goto', id: bar.dataset.spId, index: page - 1 });
    }

    function pageKey(inputEl) {
        const rec = new URLSearchParams(window.location.search).get('id') || '';
        const sub = inputEl.name || inputEl.id || '';
        return `nsft-sp:${window.location.pathname}:${rec}:${sub}`;
    }
    function persistPage(bar, index) {
        const dropdown = bar.parentElement;
        const inputEl = dropdown && dropdown.querySelector('.dropdownInput');
        if (!inputEl) return;
        try { sessionStorage.setItem(pageKey(inputEl), String(index)); } catch (e) { }
    }

    document.addEventListener('keydown', (e) => {
        if (!enabled || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
        const active = document.activeElement;
        if (!active || !active.classList || !active.classList.contains('nsft-sp-btn')) return;
        const action = KEY_TO_ACTION[e.key];
        if (!action) return;
        const bar = active.closest('.' + CONTAINER_CLASS);
        const target = bar && bar.querySelector(`.nsft-sp-btn[data-sp-action="${action}"]`);
        if (!target) return;
        e.preventDefault();
        e.stopImmediatePropagation();
        target.click();
    });

    document.addEventListener('keydown', (e) => {
        if (!enabled || e.repeat || !(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey) return;
        if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
        if (isEditableTarget(document.activeElement)) return;
        const bar = mostVisibleBar();
        if (!bar) return;
        const action = e.key === 'ArrowLeft' ? 'prev' : 'next';
        const target = bar.querySelector(`.nsft-sp-btn[data-sp-action="${action}"]`);
        if (!target) return;
        e.preventDefault();
        target.click();
    }, true);

    function isEditableTarget(el) {
        if (!el) return false;
        const tag = el.tagName;
        return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
    }

    function mostVisibleBar() {
        const bars = Array.prototype.slice.call(document.querySelectorAll('.' + CONTAINER_CLASS))
            .filter(b => b.style.display !== 'none' && b.offsetParent !== null);
        if (!bars.length) return null;
        const vh = window.innerHeight || document.documentElement.clientHeight;
        let best = null, bestScore = Infinity;
        bars.forEach(b => {
            const r = b.getBoundingClientRect();
            const offscreen = (r.bottom < 0 || r.top > vh) ? 1e6 : 0;
            const score = offscreen + Math.abs(r.top);
            if (score < bestScore) { bestScore = score; best = b; }
        });
        return best;
    }

    function labelFallback(label) {
        return { first: 'First page', prev: 'Previous page', next: 'Next page', last: 'Last page' }[label] || label;
    }
})();
