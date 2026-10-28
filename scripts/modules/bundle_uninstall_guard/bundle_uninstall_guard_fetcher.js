(function () {
    'use strict';

    if (window.__nsftBundleGuard) return;
    window.__nsftBundleGuard = true;

    const ASK_DEST = 'extension_bundleguard';
    const REPLY_DEST = 'fetcher_bundleguard';
    const ACUSE_MS = 1500;
    const AVISO_NATIVO = /^Bundle: /;

    let seq = 0;
    let activo = false;
    let saltado = null;
    const pendientes = new Map();
    const confirmNativo = window.confirm;

    window.addEventListener('message', function (ev) {
        if (ev.source !== window) return;
        const d = ev.data;
        if (!d || d.dest !== REPLY_DEST) return;
        if (d.type === 'state') { activo = !!d.activo; return; }
        if (typeof d.reqId !== 'string') return;
        const p = pendientes.get(d.reqId);
        if (!p) return;
        if (d.type === 'ack') { clearTimeout(p.plazo); return; }
        if (d.type === 'answer') {
            pendientes.delete(d.reqId);
            clearTimeout(p.plazo);
            p.resolver(!!d.ok);
        }
    });

    window.confirm = function (msg) {
        if (activo && typeof msg === 'string' && AVISO_NATIVO.test(msg)) {
            saltado = msg;
            return true;
        }
        return confirmNativo.apply(this, arguments);
    };

    function pregunta(id, nativo) {
        return new Promise(function (resolver) {
            const reqId = 'bug-' + (++seq);
            const p = { resolver: resolver };
            p.plazo = setTimeout(function () {
                pendientes.delete(reqId);
                resolver(nativo ? confirmNativo.call(window, nativo) : true);
            }, ACUSE_MS);
            pendientes.set(reqId, p);
            window.postMessage({ dest: ASK_DEST, type: 'ask', reqId: reqId, payload: { id: id, saltado: !!nativo } }, '*');
        });
    }

    function envuelve() {
        const original = window.uninstallBundle;
        if (typeof original !== 'function') return false;
        if (original.__nsftGuard) return true;
        const conFreno = function (url, params) {
            const self = this;
            const args = arguments;
            const nativo = saltado;
            saltado = null;
            const m = /id\s*:\s*(\d+)/.exec(String(params || ''));
            pregunta(m ? m[1] : '', nativo).then(function (ok) {
                if (ok) original.apply(self, args);
            });
        };
        conFreno.__nsftGuard = true;
        window.uninstallBundle = conFreno;
        return true;
    }

    if (!envuelve()) {
        let n = 0;
        const iv = setInterval(function () {
            if (envuelve() || ++n > 40) clearInterval(iv);
        }, 250);
    }
})();
