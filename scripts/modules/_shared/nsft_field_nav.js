(function () {
    'use strict';

    if (window.NSFT_FieldNav) return;

    function clickById(id) {
        const node = id && document.getElementById(id);
        if (node) { node.click(); return true; }
        return false;
    }

    function openContainingTabs(el) {
        if (!el || !el.closest) return;

        const subtabBlock = el.closest('.subtabblock');
        const layer = subtabBlock && subtabBlock.parentElement
            && subtabBlock.parentElement.dataset
            ? subtabBlock.parentElement.dataset.nspsLayer
            : null;
        if (layer) clickById(layer + 'txt');

        const tabContent = el.closest('.nltabcontent');
        const wrapper = tabContent && tabContent.parentElement;
        const wrapperId = wrapper && wrapper.id;
        if (wrapperId) {
            const tabId = wrapperId.replace(/_wrapper$|_div$|_form$/, '');
            if (!clickById(tabId + 'txt')) clickById(tabId + '_pane_hd');
        }
    }

    function scrollIntoCenter(el) {
        if (!el || !el.getBoundingClientRect) return;

        let node = el.parentElement;
        while (node && node !== document.documentElement) {
            const cs = window.getComputedStyle(node);
            const scrollable = /(auto|scroll|overlay)/.test(cs.overflowY)
                && node.scrollHeight > node.clientHeight + 1;
            if (scrollable) {
                const nRect = node.getBoundingClientRect();
                const eRect = el.getBoundingClientRect();
                node.scrollTop += (eRect.top - nRect.top) - (node.clientHeight / 2) + (eRect.height / 2);
            }
            node = node.parentElement;
        }

        const r = el.getBoundingClientRect();
        const scroller = document.scrollingElement || document.documentElement;
        scroller.scrollTo({
            top: scroller.scrollTop + r.top - (window.innerHeight / 2) + (r.height / 2),
            left: scroller.scrollLeft + r.left - (window.innerWidth / 2) + (r.width / 2),
            behavior: 'smooth'
        });
    }

    function goToField(el, opts) {
        if (!el) return false;
        const o = opts || {};

        openContainingTabs(el);

        const run = () => {
            if (o.native && el.scrollIntoView) {
                el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
            } else {
                scrollIntoCenter(el);
            }
        };

        if (window.requestAnimationFrame) window.requestAnimationFrame(run);
        else run();

        return true;
    }

    window.NSFT_FieldNav = Object.freeze({
        goToField,
        openContainingTabs,
        scrollIntoCenter
    });
})();
