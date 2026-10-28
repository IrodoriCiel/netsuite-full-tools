(function () {
    'use strict';

    const STORAGE_KEY = 'enableSublistFilter';
    const BAR_CLASS = 'nsft-sf-bar';
    const STRIP_CLASS = 'nsft-sf-strip';
    const HIDDEN_CLASS = 'nsft-sf-hidden';
    const PG_EXTRA = 'nsft-pg-extra';
    const PG_DUENO = 'sf';
    const HL_CLASS = 'nsft-sf-hl';
    const APPLIED_ATTR = 'data-nsft-sf';
    const TABLE_SEL = ':is(.uir-machine-table, .listtable)';

    const TS = window.NSFT_TextSearch || null;

    function fold(s) {
        if (TS) return TS.fold(s);
        let out = '';
        for (const ch of String(s)) {
            const f = ch.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
            out += f.length === ch.length ? f : ch;
        }
        return out.toLowerCase();
    }

    function foldRanges(text, needle) {
        if (TS) return TS.ranges(text, needle);
        const hay = fold(text);
        const out = [];
        let i = hay.indexOf(needle);
        while (i !== -1) {
            out.push({ start: i, end: i + needle.length });
            i = hay.indexOf(needle, i + needle.length);
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
            const cell = b.closest('td.nsft-sf-cell') || b.closest('.' + STRIP_CLASS);
            (cell || b).remove();
        });
        document.querySelectorAll('.' + HIDDEN_CLASS).forEach(r => r.classList.remove(HIDDEN_CLASS));
        if (window.NSFT_SublistPages) NSFT_SublistPages.limpia(document, PG_DUENO);
        clearHighlights(document);
        document.querySelectorAll('[' + APPLIED_ATTR + ']').forEach(c => c.removeAttribute(APPLIED_ATTR));
    }

    const NOT_DATA = ['uir-machine-headerrow', 'uir-list-headerrow', 'uir-nodata-row',
        'uir-loading-row', 'uir-machine-button-row', 'uir-machine-row-last',
        'nsft-pg-extra', 'nsft-pg-sep'];

    function dataRows(scope) {
        const rows = scope.querySelectorAll(TABLE_SEL + ' > tbody > tr');
        return Array.from(rows).filter((tr) => !NOT_DATA.some((c) => tr.classList.contains(c)));
    }

    function scan() {
        scanEdit();
        scanView();
    }

    function filaNativa(capa) {
        const barra = capa.querySelector('.uir-list-control-bar[data-above="true"]')
            || capa.querySelector('.uir-list-control-bar');
        return barra ? barra.querySelector(':scope > table > tbody > tr > td > table > tbody > tr') : null;
    }

    function copiaFondoNativo(el) {
        const nativa = document.querySelector('.uir-list-control-bar');
        if (!nativa) return;
        const bg = getComputedStyle(nativa).backgroundColor;
        if (bg && bg !== 'transparent' && bg !== 'rgba(0, 0, 0, 0)') el.style.setProperty('--nsft-tb-native-bg', bg);
    }

    function scanEdit() {
        document.querySelectorAll('.uir-machine-table-container').forEach((container) => {
            if (!container.querySelector('.uir-machine-headerrow:not(.uir-loading-row)')) return;

            const capa = container.closest('[data-nsps-layer]');
            const fila = capa && filaNativa(capa);
            if (fila) {
                const total = dataRows(capa).length;
                const bar = fila.querySelector('.' + BAR_CLASS);
                if (bar) { bar.dataset.nsftSfEdit = '1'; refresh(capa, bar, total); return; }
                injectBar(capa, total, fila, true);
                return;
            }

            const rows = dataRows(container);
            const prev = container.previousElementSibling;
            const bar = prev && prev.classList.contains(STRIP_CLASS) ? prev.querySelector('.' + BAR_CLASS) : null;

            if (bar) { refresh(container, bar, rows.length); return; }

            injectBar(container, rows.length, null, true);
        });
    }

    function scanView() {
        document.querySelectorAll('[data-nsps-layer]').forEach((layer) => {
            if (layer.querySelector('.uir-machine-headerrow:not(.uir-loading-row)')) {
                const pastilla = layer.querySelector('.' + BAR_CLASS + ':not([data-nsft-sf-edit])');
                if (pastilla) {
                    (pastilla.closest('td.nsft-sf-cell') || pastilla).remove();
                    layer.removeAttribute(APPLIED_ATTR);
                    const suyo = layer.querySelector('.' + BAR_CLASS + '[data-nsft-sf-edit] .nsft-sf-input');
                    if (!suyo || !suyo.value) {
                        layer.querySelectorAll('tr.' + HIDDEN_CLASS)
                            .forEach((tr) => tr.classList.remove(HIDDEN_CLASS));
                    }
                }
                return;
            }

            const lvBar = layer.querySelector('.nsft-lv-bar');
            const bar = layer.querySelector('.' + BAR_CLASS);
            if (lvBar) {
                if (bar) {
                    (bar.closest('td.nsft-sf-cell') || bar).remove();
                    layer.removeAttribute(APPLIED_ATTR);
                    layer.querySelectorAll('tr.nsft-sf-hidden').forEach((tr) => tr.classList.remove('nsft-sf-hidden'));
                    if (window.NSFT_SublistPages) NSFT_SublistPages.limpia(layer, PG_DUENO);
                }
                return;
            }

            const rows = dataRows(layer);
            if (bar) { refresh(layer, bar, rows.length); return; }

            if (!layer.querySelector(TABLE_SEL)) return;

            const innerRow = filaNativa(layer);
            if (!innerRow) return;
            injectBar(layer, rows.length, innerRow);
        });
    }

    function refresh(scope, bar, total) {
        const input = bar.querySelector('.nsft-sf-input');
        if (input && input.value) applyFilter(scope, input.value, bar);
        else updateCount(bar, total, total);
    }

    function injectBar(scope, total, innerRow, deEdicion) {
        if (scope.getAttribute(APPLIED_ATTR)) return;
        scope.setAttribute(APPLIED_ATTR, '1');

        const bar = document.createElement('div');
        bar.className = 'nsft-tb-group nsft-tb-search ' + BAR_CLASS + ' nsft-sf-pill';
        if (deEdicion) bar.dataset.nsftSfEdit = '1';

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
            const franja = document.createElement('div');
            franja.className = 'nsft-tb-bar ' + STRIP_CLASS;
            copiaFondoNativo(franja);
            franja.appendChild(bar);
            scope.parentNode.insertBefore(franja, scope);
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

        const marksOk = !needle || visible === 0
            || Array.from(scope.querySelectorAll('mark.' + HL_CLASS)).some((m) => !m.closest('.' + PG_EXTRA));
        const same = bar.dataset.nsftSfQ === needle &&
            Number(bar.dataset.nsftSfRows) === rows.length && marksOk;
        if (!same) {
            clearHighlights(scope, true);
            if (needle) rows.forEach((tr) => {
                if (!tr.classList.contains(HIDDEN_CLASS)) highlightRow(tr, needle);
            });
            bar.dataset.nsftSfQ = needle;
            bar.dataset.nsftSfRows = String(rows.length);
        }

        const fuera = otrasPaginas(scope, needle, bar);
        if (fuera) updateCount(bar, visible + fuera.coinciden, fuera.total);
        else updateCount(bar, visible, rows.length);
    }

    function otrasPaginas(scope, needle, bar) {
        const SP = window.NSFT_SublistPages;
        if (!SP) return null;
        const est = needle ? SP.pide(scope, avisoDe(scope, bar)) : null;
        if (!est) {
            SP.limpia(scope, PG_DUENO);
            delete bar.dataset.nsftSfPg;
            return null;
        }
        const grupos = (est.paginas || []).map((p) => ({
            numero: p.numero,
            etiqueta: p.etiqueta,
            filas: p.filas.filter((tr) => textoFuera(tr).indexOf(needle) !== -1)
        }));
        const clave = est.clave + '|' + needle;
        if (bar.dataset.nsftSfPg !== clave || !SP.pintadas(scope, PG_DUENO)) {
            SP.pinta(scope, est, grupos, PG_DUENO).forEach((tr) => highlightRow(tr, needle));
            bar.dataset.nsftSfPg = clave;
        }
        if (!est.paginas) return null;
        return { coinciden: grupos.reduce((n, g) => n + g.filas.length, 0), total: est.total };
    }

    const _avisos = new WeakMap();
    function avisoDe(scope, bar) {
        let f = _avisos.get(bar);
        if (!f) {
            f = () => {
                if (!bar.isConnected) return;
                const input = bar.querySelector('.nsft-sf-input');
                applyFilter(scope, input ? input.value : '', bar);
            };
            _avisos.set(bar, f);
        }
        return f;
    }

    const _textosFuera = new WeakMap();
    function textoFuera(tr) {
        let s = _textosFuera.get(tr);
        if (s == null) { s = rowText(tr); _textosFuera.set(tr, s); }
        return s;
    }

    function clearHighlights(root, soloPropias) {
        root.querySelectorAll('mark.' + HL_CLASS).forEach((m) => {
            if (soloPropias && m.closest('.' + PG_EXTRA)) return;
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
            const tramos = foldRanges(text, needle);
            if (!tramos.length) return;
            const frag = document.createDocumentFragment();
            let last = 0;
            tramos.forEach((r) => {
                if (r.start > last) frag.appendChild(document.createTextNode(text.slice(last, r.start)));
                const mark = document.createElement('mark');
                mark.className = HL_CLASS;
                mark.textContent = text.slice(r.start, r.end);
                frag.appendChild(mark);
                last = r.end;
            });
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
        const txtShown = String(visible);
        const txtTotal = '/ ' + total + ' ' + rows;
        if (shown.textContent !== txtShown) shown.textContent = txtShown;
        if (totalEl.textContent !== txtTotal) totalEl.textContent = txtTotal;
    }
})();
