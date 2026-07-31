(function () {
    'use strict';

    if (window.NSFT_Observer) return;

    const subscribers = new Set();
    let observer = null;
    let pendingMutations = [];
    let rafScheduled = false;

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
            for (let i = 0; i < mutations.length; i++) pendingMutations.push(mutations[i]);
            scheduleDispatch();
        });
        observer.observe(document.body, { childList: true, subtree: true });
    }

    function scheduleDispatch() {
        if (rafScheduled || subscribers.size === 0) return;
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
                entry.pending = entry.pending ? entry.pending.concat(batch) : batch.slice();
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
        };
    }

    function flush() {
        rafScheduled = false;
        dispatch();
    }

    function getSubscriberCount() {
        return subscribers.size;
    }

    window.NSFT_Observer = { subscribe, flush, getSubscriberCount };
})();
