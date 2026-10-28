document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        const msg = chrome.i18n.getMessage(key);
        if (msg) {
            el.textContent = msg;
        }
    });

    document.querySelectorAll('[data-i18n-alt]').forEach(el => {
        const key = el.getAttribute('data-i18n-alt');
        const msg = chrome.i18n.getMessage(key);
        if (msg) {
            el.setAttribute('alt', msg);
        }
    });

    const titleMsg = chrome.i18n.getMessage('changelog_title');
    if (titleMsg) {
        document.title = titleMsg;
    }

    renderChangelog();
});

function renderChangelog() {
    const listEl = document.getElementById('cl-list');
    const filtersEl = document.getElementById('cl-filters');
    if (!listEl || !filtersEl) return;

    const msg = (key, subs) => chrome.i18n.getMessage(key, subs) || '';
    const TIPOS = ['new', 'improvement', 'fix'];
    const BADGE = {
        new: msg('cl_tipo_new'),
        improvement: msg('cl_tipo_improvement'),
        fix: msg('cl_tipo_fix')
    };
    const SUMMARY = {
        new: ['cl_sum_new_one', 'cl_sum_new_other'],
        improvement: ['cl_sum_improvement_one', 'cl_sum_improvement_other'],
        fix: ['cl_sum_fix_one', 'cl_sum_fix_other']
    };
    const FILTERS = [
        ['all', msg('cl_ui_all')],
        ['new', msg('cl_ui_new')],
        ['improvement', msg('cl_ui_improvement')],
        ['fix', msg('cl_ui_fix')]
    ];

    const cleanHeading = (text) => text.replace(/^[^\p{L}\p{N}¿¡«(]+/u, '').trim();

    const versions = [];
    document.querySelectorAll('.container > .version').forEach(block => {
        const h2 = block.querySelector('h2');
        const verSpan = h2 && h2.querySelector('span:not(.date)');
        const dateSpan = h2 && h2.querySelector('.date');
        const thanks = block.querySelector('.thanks');
        const sections = [];
        let current = null;
        Array.from(block.children).forEach(child => {
            if (child.tagName === 'H3') {
                current = { title: cleanHeading(child.textContent), items: [] };
                sections.push(current);
            } else if (child.tagName === 'UL') {
                if (!current) {
                    current = { title: '', items: [] };
                    sections.push(current);
                }
                child.querySelectorAll(':scope > li').forEach(li => {
                    const strong = li.querySelector('strong');
                    const spans = li.querySelectorAll(':scope > span');
                    current.items.push({
                        tipo: TIPOS.includes(li.dataset.tipo) ? li.dataset.tipo : 'improvement',
                        title: strong ? strong.textContent.replace(/:\s*$/, '').trim() : '',
                        desc: spans.length ? spans[spans.length - 1].textContent.trim() : ''
                    });
                });
            }
        });
        versions.push({
            ver: verSpan ? verSpan.textContent.trim() : '',
            date: dateSpan ? dateSpan.textContent.trim() : '',
            thanks: thanks ? thanks.textContent.trim() : '',
            sections: sections.filter(s => s.items.length)
        });
        block.remove();
    });
    if (!versions.length) return;

    const state = { filter: 'all', open: new Set([0]) };
    const hashIdx = versions.findIndex(v => v.ver && ('#' + v.ver) === location.hash);
    if (hashIdx > 0) state.open.add(hashIdx);

    function el(tag, cls, text) {
        const e = document.createElement(tag);
        if (cls) e.className = cls;
        if (text != null) e.textContent = text;
        return e;
    }

    function summary(ver) {
        const count = { new: 0, improvement: 0, fix: 0 };
        ver.sections.forEach(s => s.items.forEach(it => { count[it.tipo]++; }));
        return TIPOS.filter(t => count[t])
            .map(t => msg(SUMMARY[t][count[t] === 1 ? 0 : 1], [String(count[t])]))
            .join(' · ');
    }

    function renderFilters() {
        filtersEl.textContent = '';
        filtersEl.setAttribute('aria-label', msg('cl_ui_filter'));
        FILTERS.forEach(([id, label]) => {
            const b = el('button', 'cl-chip' + (state.filter === id ? ' is-on' : ''), label);
            b.type = 'button';
            b.setAttribute('aria-pressed', String(state.filter === id));
            b.addEventListener('click', () => { state.filter = id; render(); });
            filtersEl.appendChild(b);
        });
    }

    function render() {
        renderFilters();
        listEl.textContent = '';
        let shown = 0;
        versions.forEach((ver, i) => {
            const sections = ver.sections
                .map(s => ({ title: s.title, items: s.items.filter(it => state.filter === 'all' || it.tipo === state.filter) }))
                .filter(s => s.items.length);
            if (!sections.length) return;
            shown++;

            const isOpen = state.filter !== 'all' || state.open.has(i);
            const wrap = el('section', 'cl-ver' + (isOpen ? ' is-open' : ''));
            if (ver.ver) wrap.id = ver.ver;

            const head = el('button', 'cl-ver-head');
            head.type = 'button';
            head.setAttribute('aria-expanded', String(isOpen));
            head.appendChild(el('span', 'cl-ver-num', ver.ver));
            if (ver.date) head.appendChild(el('span', 'cl-ver-date', ver.date));
            if (i === 0) head.appendChild(el('span', 'cl-ver-latest', msg('cl_ui_latest')));
            head.appendChild(el('span', 'cl-ver-spacer'));
            head.appendChild(el('span', 'cl-ver-summary', summary(ver)));
            head.appendChild(el('span', 'cl-ver-chev', '›'));
            head.addEventListener('click', () => {
                if (state.filter !== 'all') return;
                if (isOpen) state.open.delete(i); else state.open.add(i);
                render();
            });
            wrap.appendChild(head);

            const body = el('div', 'cl-ver-body');
            if (ver.thanks && state.filter === 'all') body.appendChild(el('p', 'thanks', ver.thanks));
            sections.forEach(s => {
                const sec = el('div');
                if (s.title) sec.appendChild(el('h3', null, s.title));
                s.items.forEach(it => {
                    const row = el('div', 'cl-item');
                    const badgeCol = el('div');
                    badgeCol.appendChild(el('span', 'cl-badge is-' + it.tipo, BADGE[it.tipo]));
                    const txt = el('div', 'cl-txt');
                    txt.appendChild(el('span', 'cl-title', it.title));
                    txt.appendChild(el('span', 'cl-desc', it.desc));
                    row.appendChild(badgeCol);
                    row.appendChild(txt);
                    sec.appendChild(row);
                });
                body.appendChild(sec);
            });
            wrap.appendChild(body);
            listEl.appendChild(wrap);
        });
        if (!shown) listEl.appendChild(el('p', 'cl-empty', msg('cl_ui_empty')));
    }

    render();

    if (hashIdx > 0) {
        const target = document.getElementById(versions[hashIdx].ver);
        if (target) target.scrollIntoView();
    }
}
