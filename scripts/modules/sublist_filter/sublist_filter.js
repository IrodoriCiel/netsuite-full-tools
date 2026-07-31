(function () {
    'use strict';

    const STORAGE_KEY = 'enableSublistFilter';
    const BAR_CLASS = 'nsft-sf-bar';
    const HIDDEN_CLASS = 'nsft-sf-hidden';
    const APPLIED_ATTR = 'data-nsft-sf';
    const MIN_ROWS = 5;

    let _unsub = null;
    let _slashHandler = null;

    function isApplicablePage() {
        try {
            if (window.NSFT_RecordButtons && NSFT_RecordButtons.isExcludedPage && NSFT_RecordButtons.isExcludedPage()) return false;
        } catch (e) { }
        return /\.nl$/.test(window.location.pathname);
    }

    if (!isApplicablePage()) return;

    chrome.storage.local.get({ [STORAGE_KEY]: true }, (items) => {
        if (items[STORAGE_KEY]) init();
    });

    chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== 'local' || !changes[STORAGE_KEY]) return;
        if (changes[STORAGE_KEY].newValue) init();
        else teardown();
    });

    function init() {
        scan();
        if (!_slashHandler) {
            _slashHandler = (e) => {
                if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey) return;
                const t = e.target;
                if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
                const input = Array.from(document.querySelectorAll('.nsft-sf-input')).find((el) => {
                    const r = el.getBoundingClientRect();
                    return r.width > 0 && r.height > 0;
                });
                if (!input) return;
                e.preventDefault();
                e.stopPropagation();
                input.focus();
                input.select();
            };
            document.addEventListener('keydown', _slashHandler, true);
        }
        if (window.NSFT_Observer && typeof window.NSFT_Observer.subscribe === 'function') {
            if (_unsub) return;
            _unsub = window.NSFT_Observer.subscribe(scan, { throttle: 400 });
        }
    }

    function teardown() {
        if (_unsub) { try { _unsub(); } catch (e) { } _unsub = null; }
        if (_slashHandler) { document.removeEventListener('keydown', _slashHandler, true); _slashHandler = null; }
        document.querySelectorAll('.' + BAR_CLASS).forEach(b => b.remove());
        document.querySelectorAll('.' + HIDDEN_CLASS).forEach(r => r.classList.remove(HIDDEN_CLASS));
        document.querySelectorAll('[' + APPLIED_ATTR + ']').forEach(c => c.removeAttribute(APPLIED_ATTR));
    }

    function dataRows(container) {
        const rows = container.querySelectorAll(':is(.uir-machine-table, .listtable) > tbody > tr');
        return Array.from(rows).filter(tr =>
            !tr.classList.contains('uir-machine-headerrow') &&
            !tr.classList.contains('uir-nodata-row') &&
            !tr.classList.contains('uir-loading-row')
        );
    }

    function scan() {
        const containers = document.querySelectorAll('.uir-machine-table-container');
        containers.forEach((container) => {
            if (!container.querySelector('.uir-machine-headerrow:not(.uir-loading-row)')) return;

            const rows = dataRows(container);
            const bar = container.previousElementSibling && container.previousElementSibling.classList.contains(BAR_CLASS)
                ? container.previousElementSibling
                : null;

            if (bar) {
                const input = bar.querySelector('.nsft-sf-input');
                if (input && input.value) applyFilter(container, input.value, bar);
                else updateCount(bar, rows.length, rows.length);
                return;
            }

            if (rows.length > MIN_ROWS) injectBar(container, rows.length);
        });
    }

    function injectBar(container, total) {
        if (container.getAttribute(APPLIED_ATTR)) return;
        container.setAttribute(APPLIED_ATTR, '1');

        const bar = document.createElement('div');
        bar.className = BAR_CLASS;

        const icon = document.createElement('span');
        icon.className = 'nsft-sf-icon';
        icon.innerHTML = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>';

        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'nsft-sf-input';
        input.placeholder = chrome.i18n.getMessage('sublistFilterPlaceholder') || 'Filter rows…';
        input.setAttribute('autocomplete', 'off');
        input.addEventListener('input', () => applyFilter(container, input.value, bar));
        input.addEventListener('keydown', (e) => {
            e.stopPropagation();
            if (e.key === 'Escape') { input.value = ''; applyFilter(container, '', bar); }
        });

        const count = document.createElement('span');
        count.className = 'nsft-sf-count';

        const clear = document.createElement('button');
        clear.type = 'button';
        clear.className = 'nsft-sf-clear';
        clear.title = chrome.i18n.getMessage('sublistFilterClearTitle') || 'Borrar filtro';
        clear.innerHTML = '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>';
        clear.addEventListener('click', () => {
            input.value = '';
            applyFilter(container, '', bar);
            input.focus();
        });

        const kbd = document.createElement('span');
        kbd.className = 'nsft-sf-kbd';
        kbd.textContent = '/';
        kbd.title = chrome.i18n.getMessage('sublistFilterSlashTitle') || 'Pulsa / para filtrar';

        bar.appendChild(icon);
        bar.appendChild(input);
        bar.appendChild(count);
        bar.appendChild(clear);
        bar.appendChild(kbd);

        container.parentNode.insertBefore(bar, container);
        updateCount(bar, total, total);
    }

    function rowText(tr) {
        let s = tr.textContent || '';
        tr.querySelectorAll('input, textarea, select').forEach((el) => {
            if (el.type === 'hidden') return;
            if (el.tagName === 'SELECT') {
                const opt = el.options && el.options[el.selectedIndex];
                if (opt) s += ' ' + (opt.text || '');
            } else {
                s += ' ' + (el.value || '');
            }
        });
        return s.toLowerCase();
    }

    function applyFilter(container, query, bar) {
        const q = (query || '').trim().toLowerCase();
        bar.classList.toggle('nsft-sf-has-text', (query || '').length > 0);
        const rows = dataRows(container);
        let visible = 0;
        rows.forEach((tr) => {
            const match = !q || rowText(tr).indexOf(q) !== -1;
            tr.classList.toggle(HIDDEN_CLASS, !match);
            if (match) visible++;
        });
        updateCount(bar, visible, rows.length);
    }

    function updateCount(bar, visible, total) {
        const count = bar.querySelector('.nsft-sf-count');
        if (!count) return;
        count.textContent = visible === total ? String(total) : (visible + ' / ' + total);
    }
})();
