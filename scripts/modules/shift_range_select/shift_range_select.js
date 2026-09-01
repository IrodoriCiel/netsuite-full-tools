(function () {
    'use strict';

    const STORAGE_KEY = 'enableShiftRangeSelect';

    function isApplicablePage() {
        try {
            if (window.NSFT_RecordButtons && NSFT_RecordButtons.isHeaderlessPage
                && NSFT_RecordButtons.isHeaderlessPage()) return false;
        } catch (e) { }
        return true;
    }

    if (!isApplicablePage()) return;

    let _on = false;

    let _anchor = null;

    let _busy = false;

    chrome.storage.local.get({ [STORAGE_KEY]: true }, (items) => {
        _on = !!items[STORAGE_KEY];
    });

    chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== 'local' || !changes[STORAGE_KEY]) return;
        _on = !!changes[STORAGE_KEY].newValue;
    });

    document.addEventListener('click', onClick, true);

    function onClick(ev) {
        if (!_on || _busy) return;

        const box = boxFrom(ev.target);
        if (!box) return;

        if (ev.shiftKey && _anchor && _anchor !== box) {
            const col = columnOf(box);
            if (col && col.indexOf(_anchor) >= 0) fillRange(col, box);
        }

        _anchor = box;
    }

    function boxFrom(target) {
        if (!target || !target.tagName || !target.closest) return null;
        if (target.tagName === 'INPUT' && target.type === 'checkbox') return target;
        const img = target.closest('.checkboximage');
        if (!img) return null;
        const prev = img.previousElementSibling;
        return (prev && prev.tagName === 'INPUT' && prev.type === 'checkbox') ? prev : null;
    }

    function columnOf(box) {
        const cell = box.closest('td, th');
        const table = cell && cell.closest('table');
        if (!table) return null;

        const idx = cell.cellIndex;
        if (idx >= 0) {
            const col = [];
            for (const row of table.rows) {
                const c = row.cells[idx];
                if (!c) continue;
                const b = c.querySelector('input[type="checkbox"]');
                if (b) col.push(b);
            }
            if (col.length >= 2 && col.indexOf(box) >= 0) return col;
        }

        const all = Array.prototype.slice.call(
            table.querySelectorAll('input[type="checkbox"]'));
        return (all.length >= 2 && all.indexOf(box) >= 0) ? all : null;
    }

    function fillRange(col, box) {
        const i = col.indexOf(box);
        const a = col.indexOf(_anchor);
        const want = _anchor.checked;
        const desde = Math.min(i, a) + 1;
        const hasta = Math.max(i, a);

        _busy = true;
        try {
            for (let k = desde; k < hasta; k++) {
                const b = col[k];
                if (b.disabled || b.readOnly) continue;
                if (b.checked !== want) b.click();
            }
        } finally {
            _busy = false;
        }
    }
})();
