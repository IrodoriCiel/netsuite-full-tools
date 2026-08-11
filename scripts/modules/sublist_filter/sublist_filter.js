(function () {
    'use strict';

    const STORAGE_KEY = 'enableSublistFilter';
    const BAR_CLASS = 'nsft-sf-bar';
    const HIDDEN_CLASS = 'nsft-sf-hidden';
    const HL_CLASS = 'nsft-sf-hl';
    const APPLIED_ATTR = 'data-nsft-sf';
    const TABLE_SEL = ':is(.uir-machine-table, .listtable)';

    function fold(s) {
        let out = '';
        for (const ch of String(s)) {
            const f = ch.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
            out += f.length === ch.length ? f : ch;
        }
        return out;
    }

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
        document.querySelectorAll('.' + BAR_CLASS).forEach((b) => {
            const cell = b.closest('td.nsft-sf-cell');
            (cell || b).remove();
        });
        document.querySelectorAll('.' + HIDDEN_CLASS).forEach(r => r.classList.remove(HIDDEN_CLASS));
        clearHighlights(document);
        document.querySelectorAll('[' + APPLIED_ATTR + ']').forEach(c => c.removeAttribute(APPLIED_ATTR));
    }

    const NOT_DATA = ['uir-machine-headerrow', 'uir-list-headerrow', 'uir-nodata-row',
        'uir-loading-row', 'uir-machine-button-row', 'uir-machine-row-last'];

    function dataRows(scope) {
        const rows = scope.querySelectorAll(TABLE_SEL + ' > tbody > tr');
        return Array.from(rows).filter((tr) => !NOT_DATA.some((c) => tr.classList.contains(c)));
    }

    function scan() {
        scanEdit();
        scanView();
    }

    function scanEdit() {
        document.querySelectorAll('.uir-machine-table-container').forEach((container) => {
            if (!container.querySelector('.uir-machine-headerrow:not(.uir-loading-row)')) return;

            const rows = dataRows(container);
            const bar = container.previousElementSibling && container.previousElementSibling.classList.contains(BAR_CLASS)
                ? container.previousElementSibling
                : null;

            if (bar) { refresh(container, bar, rows.length); return; }

            injectBar(container, rows.length);
        });
    }

    function scanView() {
        document.querySelectorAll('[data-nsps-layer]').forEach((layer) => {
            if (layer.querySelector('.uir-machine-headerrow:not(.uir-loading-row)')) return;

            const lvBar = layer.querySelector('.nsft-lv-bar');
            const bar = layer.querySelector('.' + BAR_CLASS);
            if (lvBar) {
                if (bar) {
                    bar.remove();
                    layer.removeAttribute(APPLIED_ATTR);
                    layer.querySelectorAll('tr.nsft-sf-hidden').forEach((tr) => tr.classList.remove('nsft-sf-hidden'));
                }
                return;
            }

            const rows = dataRows(layer);
            if (bar) { refresh(layer, bar, rows.length); return; }

            if (!layer.querySelector(TABLE_SEL)) return;

            const controlBar = layer.querySelector('.uir-list-control-bar[data-above="true"]')
                || layer.querySelector('.uir-list-control-bar');
            if (!controlBar) return;
            const innerRow = controlBar.querySelector(':scope > table > tbody > tr > td > table > tbody > tr');
            if (!innerRow) return;
            injectBar(layer, rows.length, innerRow);
        });
    }

    function refresh(scope, bar, total) {
        const input = bar.querySelector('.nsft-sf-input');
        if (input && input.value) applyFilter(scope, input.value, bar);
        else updateCount(bar, total, total);
    }

    function injectBar(scope, total, innerRow) {
        if (scope.getAttribute(APPLIED_ATTR)) return;
        scope.setAttribute(APPLIED_ATTR, '1');

        const bar = document.createElement('div');
        bar.className = innerRow
            ? 'nsft-tb-group nsft-tb-search ' + BAR_CLASS + ' nsft-sf-pill'
            : BAR_CLASS + ' nsft-sf-strip';

        const search = document.createElement('div');
        search.className = 'nsft-sf-search';

        const icon = document.createElement('span');
        icon.className = 'nsft-sf-icon';
        icon.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" stroke-width="2.2" stroke-linecap="round"><circle cx="11" cy="11" r="7"></circle><path d="M20 20l-3.6-3.6"></path></svg>';

        const input = document.createElement('input');
        input.className = 'nsft-sf-input';
        input.placeholder = chrome.i18n.getMessage('sublistFilterPlaceholder') || 'Filter rows…';
        input.setAttribute('autocomplete', 'off');
        input.addEventListener('input', () => applyFilter(scope, input.value, bar));
        input.addEventListener('keydown', (e) => {
            e.stopPropagation();
            if (e.key === 'Escape') { input.value = ''; applyFilter(scope, '', bar); }
        });

        input.title = chrome.i18n.getMessage('sublistFilterSlashTitle') || 'Pulsa / para filtrar';

        const clear = document.createElement('button');
        clear.type = 'button';
        clear.className = 'nsft-sf-clear';
        clear.title = chrome.i18n.getMessage('sublistFilterClearTitle') || 'Borrar filtro';
        clear.textContent = '×';
        clear.addEventListener('click', () => {
            input.value = '';
            applyFilter(scope, '', bar);
            input.focus();
        });

        const count = document.createElement('span');
        count.className = 'nsft-sf-count';
        count.title = chrome.i18n.getMessage('sublistFilterCountTitle') || 'Filas visibles / total';
        const shown = document.createElement('span');
        shown.className = 'nsft-sf-shown';
        const totalEl = document.createElement('span');
        totalEl.className = 'nsft-sf-total';
        count.appendChild(shown);
        count.appendChild(totalEl);

        search.appendChild(icon);
        search.appendChild(input);
        search.appendChild(clear);

        bar.appendChild(search);
        bar.appendChild(count);

        if (innerRow) {
            const td = document.createElement('td');
            td.className = 'nsft-sf-cell';
            td.appendChild(bar);
            innerRow.appendChild(td);
        } else {
            const spacer = document.createElement('span');
            spacer.className = 'nsft-sf-spacer';
            bar.appendChild(spacer);
            scope.parentNode.insertBefore(bar, scope);
        }
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
        return fold(s.toLowerCase());
    }

    function applyFilter(scope, query, bar) {
        const needle = fold((query || '').trim().toLowerCase());
        bar.classList.toggle('nsft-sf-has-text', (query || '').length > 0);
        const rows = dataRows(scope);
        let visible = 0;
        rows.forEach((tr) => {
            const match = !needle || rowText(tr).indexOf(needle) !== -1;
            tr.classList.toggle(HIDDEN_CLASS, !match);
            if (match) visible++;
        });
        updateCount(bar, visible, rows.length);

        const marksOk = !needle || visible === 0 || !!scope.querySelector('mark.' + HL_CLASS);
        const same = bar.dataset.nsftSfQ === needle &&
            Number(bar.dataset.nsftSfRows) === rows.length && marksOk;
        if (!same) {
            clearHighlights(scope);
            if (needle) rows.forEach((tr) => {
                if (!tr.classList.contains(HIDDEN_CLASS)) highlightRow(tr, needle);
            });
            bar.dataset.nsftSfQ = needle;
            bar.dataset.nsftSfRows = String(rows.length);
        }
    }

    function clearHighlights(root) {
        root.querySelectorAll('mark.' + HL_CLASS).forEach((m) => {
            const parent = m.parentNode;
            if (!parent) return;
            parent.replaceChild(document.createTextNode(m.textContent), m);
            parent.normalize();
        });
    }

    function highlightRow(tr, needle) {
        const walker = document.createTreeWalker(tr, NodeFilter.SHOW_TEXT, {
            acceptNode(n) {
                if (!n.nodeValue || !n.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
                const p = n.parentElement;
                if (!p || p.closest('script, style, mark.' + HL_CLASS)) return NodeFilter.FILTER_REJECT;
                return NodeFilter.FILTER_ACCEPT;
            }
        });
        const nodes = [];
        while (walker.nextNode()) nodes.push(walker.currentNode);
        nodes.forEach((node) => {
            const text = node.nodeValue;
            const hay = fold(text.toLowerCase());
            let idx = hay.indexOf(needle);
            if (idx === -1) return;
            const frag = document.createDocumentFragment();
            let last = 0;
            while (idx !== -1) {
                if (idx > last) frag.appendChild(document.createTextNode(text.slice(last, idx)));
                const mark = document.createElement('mark');
                mark.className = HL_CLASS;
                mark.textContent = text.slice(idx, idx + needle.length);
                frag.appendChild(mark);
                last = idx + needle.length;
                idx = hay.indexOf(needle, last);
            }
            if (last < text.length) frag.appendChild(document.createTextNode(text.slice(last)));
            node.parentNode.replaceChild(frag, node);
        });
    }

    function updateCount(bar, visible, total) {
        const shown = bar.querySelector('.nsft-sf-shown');
        const totalEl = bar.querySelector('.nsft-sf-total');
        if (!shown || !totalEl) return;
        const rows = total === 1
            ? (chrome.i18n.getMessage('sublistFilterRowLabel') || 'fila')
            : (chrome.i18n.getMessage('sublistFilterRowsLabel') || 'filas');
        shown.textContent = String(visible);
        totalEl.textContent = '/ ' + total + ' ' + rows;
    }
})();
