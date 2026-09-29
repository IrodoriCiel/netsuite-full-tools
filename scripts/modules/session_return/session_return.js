(function () {
    'use strict';

    const STORAGE_KEY = 'enableSessionReturn';

    const ALIVE_KEY = 'nsftSessionAlive';
    const WAITING_KEY = 'nsftSessionWaiting';

    const WAIT_TTL_MS = 24 * 60 * 60 * 1000;
    const ALIVE_TTL_MS = 60 * 60 * 1000;
    const BEACON_MIN_MS = 10 * 1000;
    const CLEAR_AFTER_MS = 15 * 1000;
    const FRESH_MS = 2 * 60 * 1000;
    const BOX_MAX_MS = 8000;

    const TRIES_KEY = 'nsft_sret_tries';

    const CARD_ID = 'nsft-sret-card';
    const SVG_NS = 'http://www.w3.org/2000/svg';

    const HOST = location.host;
    const IS_LOGIN = /^\/app\/login\//.test(location.pathname);


    function t(key, fallback) {
        try {
            const m = chrome.i18n.getMessage(key);
            return m || fallback;
        } catch (e) {
            return fallback;
        }
    }

    function ss(op, key, value) {
        try {
            if (op === 'get') return sessionStorage.getItem(key);
            if (op === 'set') sessionStorage.setItem(key, value);
            if (op === 'del') sessionStorage.removeItem(key);
        } catch (e) { }
        return null;
    }

    function prune(map, ttl) {
        const now = Date.now();
        const out = {};
        Object.keys(map || {}).forEach((k) => {
            if (now - map[k] < ttl) out[k] = map[k];
        });
        return out;
    }

    function safeTarget(raw) {
        if (!raw) return null;
        let u;
        try { u = new URL(raw, location.origin); } catch (e) { return null; }
        if (u.origin !== location.origin) return null;
        if (u.protocol !== 'https:') return null;
        if (/^\/app\/login\//.test(u.pathname)) return null;
        return u.pathname + u.search + u.hash;
    }


    if (IS_LOGIN) startWaiter();
    else startBeacon();

    function startBeacon() {
        chrome.storage.local.get({
            [STORAGE_KEY]: true,
            [WAITING_KEY]: null,
            [ALIVE_KEY]: null
        }, (items) => {
            if (!items[STORAGE_KEY]) return;

            ss('del', TRIES_KEY);

            const waiting = items[WAITING_KEY] || {};
            const since = waiting[HOST];
            if (!since || (Date.now() - since) > WAIT_TTL_MS) return;

            const alive = items[ALIVE_KEY] || {};
            if (alive[HOST] && (Date.now() - alive[HOST]) < BEACON_MIN_MS) return;

            alive[HOST] = Date.now();
            chrome.storage.local.set({ [ALIVE_KEY]: prune(alive, ALIVE_TTL_MS) });

            setTimeout(() => {
                chrome.storage.local.get({ [WAITING_KEY]: null }, (cur) => {
                    const w = cur[WAITING_KEY] || {};
                    if (!w[HOST]) return;
                    delete w[HOST];
                    chrome.storage.local.set({ [WAITING_KEY]: prune(w, WAIT_TTL_MS) });
                });
            }, CLEAR_AFTER_MS);
        });
    }

    function startWaiter() {
        const target = safeTarget(new URLSearchParams(location.search).get('redirect'));
        if (!target) return;

        let quitar = null;

        chrome.storage.local.get({ [STORAGE_KEY]: true }, (items) => {
            if (items[STORAGE_KEY]) quitar = mount(target);
        });

        chrome.storage.onChanged.addListener((changes, area) => {
            if (area !== 'local' || !changes[STORAGE_KEY]) return;
            if (changes[STORAGE_KEY].newValue) {
                if (!quitar) quitar = mount(target);
            } else if (quitar) {
                quitar();
                quitar = null;
            }
        });
    }

    function mount(target) {
        let card = null;
        let cardBody = null;
        let cardBtn = null;
        let gone = false;
        let typing = false;
        let dead = false;
        let stopObserver = null;
        const tries = parseInt(ss('get', TRIES_KEY) || '0', 10) || 0;

        registerAndCatchUp();
        chrome.storage.onChanged.addListener(onChanged);
        document.addEventListener('input', onInput, true);
        whenBody(build);
        return teardown;

        function registerAndCatchUp() {
            chrome.storage.local.get({ [WAITING_KEY]: null, [ALIVE_KEY]: null }, (cur) => {
                const w = prune(cur[WAITING_KEY] || {}, WAIT_TTL_MS);
                w[HOST] = Date.now();
                chrome.storage.local.set({ [WAITING_KEY]: w });

                const ts = (cur[ALIVE_KEY] || {})[HOST];
                if (ts && (Date.now() - ts) <= FRESH_MS) sessionIsBack();
            });
        }

        function onChanged(changes, area) {
            if (area !== 'local') return;
            const ch = changes[ALIVE_KEY];
            if (!ch) return;
            const now = (ch.newValue || {})[HOST];
            const before = (ch.oldValue || {})[HOST];
            if (!now || now === before) return;
            if (Date.now() - now > FRESH_MS) return;
            sessionIsBack();
        }

        function onInput(e) {
            const el = e.target;
            if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) typing = true;
        }

        function sessionIsBack() {
            if (gone) return;
            if (tries > 0) { setState('blocked'); return; }
            if (typing) { setState('ready'); return; }
            setState('going');
            go();
        }

        function go() {
            if (gone) return;
            gone = true;
            ss('set', TRIES_KEY, String(tries + 1));
            location.replace(target);
        }


        function whenBody(fn) {
            if (document.body) fn();
            else document.addEventListener('DOMContentLoaded', fn, { once: true });
        }

        function build() {
            if (dead || document.getElementById(CARD_ID)) return;

            card = document.createElement('div');
            card.id = CARD_ID;
            card.setAttribute('data-nsft-ui', '');
            card.setAttribute('role', 'status');
            card.setAttribute('aria-live', 'polite');

            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'nsft-ui-button nsft-sret-go';
            btn.addEventListener('click', () => { setState('going'); go(); });

            const icon = document.createElementNS(SVG_NS, 'svg');
            icon.setAttribute('viewBox', '0 0 24 24');
            icon.setAttribute('fill', 'none');
            icon.setAttribute('stroke', 'currentColor');
            icon.setAttribute('stroke-width', '2');
            icon.setAttribute('stroke-linecap', 'round');
            icon.setAttribute('stroke-linejoin', 'round');
            icon.setAttribute('aria-hidden', 'true');
            const arrow = document.createElementNS(SVG_NS, 'path');
            arrow.setAttribute('d', 'M9 14 4 9l5-5');
            const turn = document.createElementNS(SVG_NS, 'path');
            turn.setAttribute('d', 'M4 9h11a5 5 0 0 1 0 10h-3');
            icon.appendChild(arrow);
            icon.appendChild(turn);

            const label = document.createElement('span');
            label.className = 'nsft-sret-lbl';

            const spin = document.createElement('span');
            spin.className = 'nsft-ui-spinner nsft-sret-spin';
            spin.setAttribute('aria-hidden', 'true');

            btn.appendChild(icon);
            btn.appendChild(label);
            btn.appendChild(spin);
            card.appendChild(btn);

            cardBody = label;
            cardBtn = btn;

            place();
            setState(tries > 0 ? 'blocked' : 'waiting');
        }

        function place() {
            const box = document.querySelector('.login-page-box');
            if (box) {
                box.insertBefore(card, anchorInBox(box));
                if (stopObserver) { stopObserver(); stopObserver = null; }
                return;
            }
            card.classList.add('nsft-sret-floating');
            const stack = window.NSFT_Notices && window.NSFT_Notices.mount(card);
            if (!stack) document.body.appendChild(card);
            watchForBox();
        }

        function watchForBox() {
            if (stopObserver || !window.NSFT_Observer) return;
            stopObserver = window.NSFT_Observer.subscribe(() => {
                const box = document.querySelector('.login-page-box');
                if (!box || !card) return;
                card.classList.remove('nsft-sret-floating');
                if (window.NSFT_Notices) window.NSFT_Notices.unmount(card);
                box.insertBefore(card, anchorInBox(box));
                if (stopObserver) { stopObserver(); stopObserver = null; }
            }, { throttle: 250 });
            setTimeout(() => { if (stopObserver) { stopObserver(); stopObserver = null; } }, BOX_MAX_MS);
        }

        function anchorInBox(box) {
            return box.querySelector('#nsft-lsi-badge')
                || box.querySelector('.login-page-box-title')
                || box.firstChild;
        }

        function setState(next) {
            if (!card) return;
            card.setAttribute('data-state', next);

            let explica;
            if (next === 'ready') {
                explica = t('sret_body_ready', 'You are signed in. Head back whenever you like.');
            } else if (next === 'blocked') {
                explica = t('sret_body_blocked', 'Could not go back: sign in here.');
            } else if (next === 'going') {
                explica = t('sret_body_going', 'Going back to your page…');
            } else {
                explica = t('sret_body_wait', 'If you already signed in on another tab, head back here.');
            }

            cardBody.textContent = next === 'going'
                ? t('sret_body_going', 'Going back to your page…')
                : t('sret_go', 'Back to my page');
            cardBtn.disabled = (next === 'going');
            cardBtn.title = explica + ' — ' + target;
        }

        function teardown() {
            dead = true;
            chrome.storage.onChanged.removeListener(onChanged);
            document.removeEventListener('input', onInput, true);
            if (stopObserver) { stopObserver(); stopObserver = null; }
            if (card) {
                if (window.NSFT_Notices) window.NSFT_Notices.unmount(card);
                else if (card.parentNode) card.parentNode.removeChild(card);
                card = null;
                cardBody = null;
                cardBtn = null;
            }
        }
    }
})();
