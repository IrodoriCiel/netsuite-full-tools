(function () {
    'use strict';

    if (window.NSFT_ModalStack) return;

    const Z_BASE = 10001;
    const CONVENTION_SELECTOR = '[id^="nsft-"][id$="-modal"]';

    const explicit = new Set();

    function getAllCandidates() {
        const byConvention = document.querySelectorAll(CONVENTION_SELECTOR);
        const all = new Set(byConvention);
        explicit.forEach((el) => {
            if (el && el.isConnected) all.add(el);
        });
        return all;
    }

    function readZ(el) {
        const raw = window.getComputedStyle(el).zIndex;
        const n = parseInt(raw, 10);
        return Number.isFinite(n) ? n : 0;
    }

    function bringToFront(modalEl) {
        if (!modalEl) return;
        let maxZ = Z_BASE;
        getAllCandidates().forEach((el) => {
            if (el === modalEl) return;
            if (el.style.display === 'none' || el.offsetParent === null) return;
            const z = readZ(el);
            if (z > maxZ) maxZ = z;
        });
        modalEl.style.zIndex = (maxZ + 1) + '';
    }

    function register(modalEl) { if (modalEl) explicit.add(modalEl); }
    function unregister(modalEl) { explicit.delete(modalEl); }

    function isVisible(el) {
        if (!el || !el.isConnected) return false;
        const cs = window.getComputedStyle(el);
        return cs.display !== 'none' && cs.visibility !== 'hidden';
    }

    function contains(node) {
        if (!node || !node.nodeType) return false;
        for (const el of getAllCandidates()) {
            if (isVisible(el) && el.contains(node)) return true;
        }
        return false;
    }

    function isActive(el) {
        if (!isVisible(el)) return false;
        const st = (el.dataset && el.dataset.state) || el.getAttribute('data-state') || '';
        return st !== 'minimised';
    }

    function anyActive() {
        for (const el of getAllCandidates()) {
            if (isActive(el)) return true;
        }
        return false;
    }

    window.NSFT_ModalStack = {
        bringToFront, register, unregister,
        contains, isVisible, isActive, anyActive, Z_BASE
    };
})();
