(function () {
    'use strict';

    if (window.NSFT_PanelBridge) return;
    window.NSFT_PanelBridge = true;

    if (!/\.app\.netsuite\.com$/.test(location.hostname)) return;
    if (window.top !== window) return;

    const RELAY_TTL_MS = 90000;
    const injected = new Set();
    const relays = new Map();

    function injectScript(path, onReady) {
        if (injected.has(path)) { onReady(); return; }
        const s = document.createElement('script');
        s.src = chrome.runtime.getURL(path);
        s.onload = function () {
            this.remove();
            injected.add(path);
            onReady();
        };
        s.onerror = function () { this.remove(); onReady(); };
        (document.head || document.documentElement).appendChild(s);
    }

    window.addEventListener('message', (e) => {
        if (e.source !== window) return;
        const d = e.data;
        if (!d || typeof d !== 'object' || !d.dest) return;
        const hasta = relays.get(d.dest);
        if (!hasta || Date.now() > hasta) return;
        try {
            chrome.runtime.sendMessage({ nsftBridge: 'envelope', data: d }, () => {
                void chrome.runtime.lastError;
            });
        } catch (err) { }
    });

    chrome.runtime.onMessage.addListener((m, sender, sendResponse) => {
        if (!m || !m.nsftBridge) return;

        if (m.nsftBridge === 'pageInfo') {
            sendResponse({ ok: true, href: location.href, origin: location.origin });
            return;
        }

        if (m.nsftBridge === 'dispatch') {
            const ev = String(m.event || '');
            if (!/^nsft-[a-z-]+$/.test(ev)) { sendResponse({ ok: false }); return; }
            window.dispatchEvent(new CustomEvent(ev, { detail: { fromPanel: true } }));
            sendResponse({ ok: true });
            return;
        }

        if (m.nsftBridge === 'post') {
            (m.relay || []).forEach((dest) => relays.set(String(dest), Date.now() + RELAY_TTL_MS));
            const reenviar = () => { if (m.msg) window.postMessage(m.msg, '*'); };
            if (m.inject) injectScript(String(m.inject), reenviar);
            else reenviar();
            sendResponse({ ok: true });
            return;
        }

        if (m.nsftBridge === 'fetch') {
            let url;
            try { url = new URL(String(m.url || ''), location.origin); }
            catch (e) { sendResponse({ ok: false, status: 0, text: '' }); return; }
            if (url.origin !== location.origin) {
                sendResponse({ ok: false, status: 0, text: '' });
                return;
            }
            const init = m.init || {};
            fetch(url.href, {
                method: init.method || 'GET',
                headers: init.headers || undefined,
                body: init.body != null ? init.body : undefined,
                credentials: 'same-origin'
            }).then((res) => res.text().then((text) => {
                sendResponse({ ok: res.ok, status: res.status, text });
            })).catch(() => {
                sendResponse({ ok: false, status: 0, text: '' });
            });
            return true;
        }
    });
})();
