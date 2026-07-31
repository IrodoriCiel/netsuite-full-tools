(function () {
    'use strict';

    const PALETTES = {
        vivid: [
            '#E91E63', '#FF5722', '#FFC107', '#8BC34A', '#009688',
            '#00BCD4', '#03A9F4', '#3F51B5', '#673AB7', '#9C27B0',
            '#F44336', '#FF9800', '#CDDC39', '#4CAF50', '#2196F3',
            '#795548', '#607D8B'
        ],
        pastel: [
            '#FFB3BA', '#FFC9BA', '#FFDFBA', '#FFFFBA', '#E0F5A0',
            '#BAFFC9', '#BAE1FF', '#C7B8FF', '#E5B8FF', '#FFB8EC',
            '#F5C5C5', '#C5E0F5', '#D4F5C5', '#F5E8C5', '#E8C5F5'
        ],
        dark: [
            '#1B1F3B', '#2D1B3B', '#3B1B2D', '#3B241B', '#3B3A1B',
            '#1B3B26', '#1B3B3A', '#1B2A3B', '#231B3B', '#3B1B3A',
            '#121C2E', '#2E1212', '#122E18', '#2E2512', '#1A122E'
        ],
        neon: [
            '#FF006E', '#FB5607', '#FFBE0B', '#8338EC', '#3A86FF',
            '#00F5D4', '#F15BB5', '#9B5DE5', '#00BBF9', '#00F0FF',
            '#FAFF00', '#39FF14', '#FF073A', '#FF61F6', '#04E762'
        ]
    };

    const LINE_STYLES = { solid: 'none', dashed: '10, 6', dotted: '2, 4' };

    let palette = PALETTES.vivid;
    let dashArray = 'none';
    let strokeWidth = '2';
    let lineColors = {};
    let observer = null;
    let rafPending = false;
    let active = false;
    let hoverWired = false;

    const WRAPPER_SEL = '#diagrammer-wrapper';
    const PATH_SEL = '#diagrammer-wrapper g path';

    function transitionPaths() { return document.querySelectorAll(PATH_SEL); }

    function applyColors() {
        const els = transitionPaths();
        for (let i = 0; i < els.length; i++) {
            const el = els[i];
            const d = el.getAttribute('d');
            if (!el.__nsftOrig) {
                el.__nsftOrig = {
                    stroke: el.getAttribute('stroke'),
                    width: el.getAttribute('stroke-width'),
                    dash: el.getAttribute('stroke-dasharray')
                };
            }
            let color = lineColors[d];
            if (!color) color = lineColors[d] = palette[i % palette.length];
            if (el.getAttribute('stroke') !== color) el.setAttribute('stroke', color);
            if (el.getAttribute('stroke-width') !== strokeWidth) el.setAttribute('stroke-width', strokeWidth);
            if (dashArray === 'none') {
                if (el.getAttribute('stroke-dasharray')) el.removeAttribute('stroke-dasharray');
            } else if (el.getAttribute('stroke-dasharray') !== dashArray) {
                el.setAttribute('stroke-dasharray', dashArray);
            }
        }
        wireHover();
    }

    function scheduleApply() {
        if (rafPending || !active) return;
        rafPending = true;
        requestAnimationFrame(() => { rafPending = false; if (active) applyColors(); });
    }

    function start() {
        active = true;
        applyColors();
        if (observer) return;
        observer = new MutationObserver(scheduleApply);
        const root = document.querySelector(WRAPPER_SEL) || document.body;
        observer.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ['d'] });
    }

    function stop() {
        active = false;
        if (observer) { observer.disconnect(); observer = null; }
        clearHoverHighlight();
        transitionPaths().forEach(el => {
            const o = el.__nsftOrig;
            if (!o) return;
            if (o.stroke != null) el.setAttribute('stroke', o.stroke); else el.removeAttribute('stroke');
            if (o.width != null) el.setAttribute('stroke-width', o.width); else el.removeAttribute('stroke-width');
            if (o.dash != null) el.setAttribute('stroke-dasharray', o.dash); else el.removeAttribute('stroke-dasharray');
            delete el.__nsftOrig;
        });
        lineColors = {};
    }

    let highlightedNodes = [];

    function wireHover() {
        if (hoverWired) return;
        const wrapper = document.querySelector(WRAPPER_SEL);
        if (!wrapper) return;
        hoverWired = true;
        wrapper.addEventListener('mouseover', onHoverOver);
        wrapper.addEventListener('mouseout', onHoverOut);
    }

    function onHoverOver(e) {
        const path = e.target && e.target.closest ? e.target.closest('g path') : null;
        if (!path || !document.querySelector(WRAPPER_SEL)?.contains(path)) return;
        emphasize(path);
    }

    function onHoverOut(e) {
        const path = e.target && e.target.closest ? e.target.closest('g path') : null;
        if (!path) return;
        clearHoverHighlight();
    }

    function emphasize(path) {
        const all = transitionPaths();
        all.forEach(p => { p.style.opacity = (p === path) ? '1' : '0.15'; });
        path.style.filter = 'drop-shadow(0 0 3px rgba(0,0,0,.55))';
        highlightConnectedNodes(path);
    }

    function clearHoverHighlight() {
        transitionPaths().forEach(p => { p.style.opacity = ''; p.style.filter = ''; });
        highlightedNodes.forEach(({ el, stroke, width, filter }) => {
            if (stroke != null) el.setAttribute('stroke', stroke); else el.removeAttribute('stroke');
            if (width != null) el.setAttribute('stroke-width', width); else el.removeAttribute('stroke-width');
            el.style.filter = filter || '';
        });
        highlightedNodes = [];
    }

    function highlightConnectedNodes(path) {
        try {
            const len = path.getTotalLength();
            const pts = [endpointScreen(path, 0), endpointScreen(path, len)].filter(Boolean);
            if (!pts.length) return;
            const wrapper = document.querySelector(WRAPPER_SEL);
            const nodes = wrapper.querySelectorAll('g');
            nodes.forEach(n => {
                if (!n.querySelector(':scope > rect')) return;
                if (n.querySelector(':scope > path')) return;
                const r = n.getBoundingClientRect();
                if (!r.width || !r.height) return;
                const hit = pts.some(pt => pt.x >= r.left - 4 && pt.x <= r.right + 4 && pt.y >= r.top - 4 && pt.y <= r.bottom + 4);
                if (!hit) return;
                const rect = n.querySelector(':scope > rect');
                highlightedNodes.push({
                    el: rect,
                    stroke: rect.getAttribute('stroke'),
                    width: rect.getAttribute('stroke-width'),
                    filter: rect.style.filter
                });
                rect.setAttribute('stroke', '#1f6feb');
                rect.setAttribute('stroke-width', '3');
                rect.style.filter = 'drop-shadow(0 0 4px rgba(31,111,235,.6))';
            });
        } catch (e) { }
    }

    function endpointScreen(path, len) {
        const ctm = path.getScreenCTM();
        if (!ctm) return null;
        const pt = path.getPointAtLength(len);
        return { x: ctm.a * pt.x + ctm.c * pt.y + ctm.e, y: ctm.b * pt.x + ctm.d * pt.y + ctm.f };
    }

    window.addEventListener('message', (ev) => {
        const data = ev.data;
        if (!data || data.dest !== 'fetcher_wfct') return;
        if (data.type === 'config') {
            const p = data.payload || {};
            palette = PALETTES[p.palette] || PALETTES.vivid;
            dashArray = LINE_STYLES[p.lineStyle] || 'none';
            strokeWidth = String(Math.max(1, Math.min(10, Number(p.lineWidth) || 2)));
            lineColors = {};
            start();
        } else if (data.type === 'teardown') {
            stop();
        }
    });

    start();

    window.postMessage({ dest: 'extension_wfct', type: 'ready' }, '*');
})();
