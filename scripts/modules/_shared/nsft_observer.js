(function () {
    'use strict';

    if (window.NSFT_Observer) return;

    const subscribers = new Set();
    let observer = null;
    let pendingMutations = [];
    let rafScheduled = false;

    const mutedRoots = new Set();

    const MAX_PENDING = 2000;

    let statsDelivered = 0;
    let statsDropped = 0;

    function isMuted(node) {
        if (!node || mutedRoots.size === 0) return false;
        for (const root of mutedRoots) {
            if (root === node) return true;
            if (root.contains && root.contains(node)) return true;
        }
        return false;
    }

    function ensureObserver() {
        if (observer) return;
        if (!document.body) {
            const boot = () => { observer = null; ensureObserver(); };
            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', boot, { once: true });
            } else {
                setTimeout(boot, 0);
            }
            return;
        }

        observer = new MutationObserver((mutations) => {
            let vivas = 0;
            for (let i = 0; i < mutations.length; i++) {
                const m = mutations[i];
                if (isMuted(m.target)) { statsDropped++; continue; }
                pendingMutations.push(m);
                vivas++;
            }
            statsDelivered += vivas;
            if (vivas) scheduleDispatch();
        });
        observer.observe(document.body, { childList: true, subtree: true });
    }

    function scheduleDispatch() {
        if (subscribers.size === 0) { pendingMutations.length = 0; return; }
        if (rafScheduled) return;
        rafScheduled = true;
        const rAF = window.requestAnimationFrame || ((cb) => setTimeout(cb, 16));
        rAF(dispatch);
    }

    function dispatch() {
        rafScheduled = false;
        if (pendingMutations.length === 0) return;

        const batch = pendingMutations;
        pendingMutations = [];
        const now = Date.now();

        subscribers.forEach((entry) => {
            if (entry.throttle && now - entry.lastFired < entry.throttle) {
                if (!entry.pending) entry.pending = [];
                const acc = entry.pending;
                for (let i = 0; i < batch.length && acc.length < MAX_PENDING; i++) acc.push(batch[i]);
                if (!entry.trailingTimer) {
                    entry.trailingTimer = setTimeout(() => {
                        entry.trailingTimer = null;
                        const pending = entry.pending || [];
                        entry.pending = null;
                        if (!subscribers.has(entry)) return;
                        entry.lastFired = Date.now();
                        try {
                            entry.callback(pending);
                        } catch (e) {
                            console.warn('[NSFT_Observer] subscriber threw:', e);
                        }
                    }, entry.throttle - (now - entry.lastFired));
                }
                return;
            }
            entry.lastFired = now;
            try {
                entry.callback(batch);
            } catch (e) {
                console.warn('[NSFT_Observer] subscriber threw:', e);
            }
        });
    }

    function subscribe(callback, options) {
        if (typeof callback !== 'function') return () => {};
        const entry = {
            callback: callback,
            throttle: (options && options.throttle) || 0,
            lastFired: 0,
            pending: null,
            trailingTimer: null
        };
        subscribers.add(entry);
        ensureObserver();
        if (options && options.immediate) {
            try { callback([]); } catch (e) { console.warn('[NSFT_Observer] immediate callback threw:', e); }
        }
        return function unsubscribe() {
            subscribers.delete(entry);
            if (entry.trailingTimer) { clearTimeout(entry.trailingTimer); entry.trailingTimer = null; }
            entry.pending = null;
            if (subscribers.size === 0 && observer) {
                try { observer.disconnect(); } catch (e) { }
                observer = null;
                pendingMutations.length = 0;
            }
        };
    }

    function flush() {
        rafScheduled = false;
        dispatch();
    }

    function getSubscriberCount() {
        return subscribers.size;
    }

    function mute(node) {
        if (!node || !node.nodeType) return function () {};
        mutedRoots.add(node);
        return function unmuteThis() { mutedRoots.delete(node); };
    }

    function unmute(node) {
        if (node) mutedRoots.delete(node);
    }

    function getStats() {
        return {
            subscribers: subscribers.size,
            mutedRoots: mutedRoots.size,
            delivered: statsDelivered,
            dropped: statsDropped
        };
    }

    window.NSFT_Observer = { subscribe, flush, getSubscriberCount, mute, unmute, getStats };
})();
