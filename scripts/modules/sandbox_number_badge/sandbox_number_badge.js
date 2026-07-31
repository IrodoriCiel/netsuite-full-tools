(function () {
    'use strict';

    const STORAGE_KEY = 'enableSandboxNumberBadge';
    const PROCESSED_FLAG = 'nsftEnvNum';
    const SANDBOX_COLOR = '#AC630C';
    const RP_COLOR = '#1F5495';

    const RE_1165 = /116\.5/g;
    const RE_118709 = /118\.709/g;
    const RE_1205 = /120\.5/g;

    let _unsub = null;
    let _cachedSvg = null;

    chrome.storage.local.get({ [STORAGE_KEY]: true }, (items) => {
        if (!items[STORAGE_KEY]) return;
        init();
    });

    chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== 'local' || !changes[STORAGE_KEY]) return;
        if (changes[STORAGE_KEY].newValue) init();
        else removeAll();
    });

    function diag(msg) {
        try { console.warn('[NSFT] sandbox_number_badge: ' + msg); } catch (e) { }
    }

    function init() {
        const RB = window.NSFT_RecordButtons;
        if (RB && RB.isHeaderlessPage && RB.isHeaderlessPage()) return;

        const env = detectEnv();
        if (!env) return;

        const appliedNow = applyAll(env);
        if (window.NSFT_Observer && typeof window.NSFT_Observer.subscribe === 'function') {
            if (_unsub) return;
            _unsub = window.NSFT_Observer.subscribe(() => {
                if (applyAll(env) && _unsub) { _unsub(); _unsub = null; }
            }, { throttle: 400 });
            if (appliedNow && _unsub) { _unsub(); _unsub = null; }
        }
    }

    function detectEnv() {
        let type = null, num = null;
        const E = window.NSFT_ENV;
        if (E && typeof E.envFromUrl === 'function') {
            const info = E.envFromUrl(location.href);
            const m = info && info.code ? info.code.match(/^(SB|RP)(\d+)$/) : null;
            if (m) { type = m[1].toLowerCase(); num = m[2]; }
        }
        if (!type) {
            const m = location.hostname.match(/-(sb|rp)(\d+)\./i);
            if (m) { type = m[1].toLowerCase(); num = m[2]; }
        }
        if (!type) return null;
        return {
            type,
            num,
            iconMatch: type === 'sb' ? 'sandbox.svg' : 'releasepreview.svg',
            color: type === 'sb' ? SANDBOX_COLOR : RP_COLOR
        };
    }

    function applyAll(env) {
        if (_cachedSvg && document.contains(_cachedSvg)) {
            ensureDecorated(_cachedSvg, env);
            return true;
        }
        const svgs = document.querySelectorAll('svg[data-icon$="' + env.iconMatch + '"]');
        if (!svgs.length) return false;
        svgs.forEach((svg) => { _cachedSvg = svg; ensureDecorated(svg, env); });
        return true;
    }

    function ensureDecorated(svg, env) {
        if (svg.dataset[PROCESSED_FLAG] === env.num) return;
        svg.dataset[PROCESSED_FLAG] = env.num;
        decorate(svg, env);
    }

    function decorate(svg, env) {
        svg.querySelectorAll('.nsft-env-num').forEach((el) => el.remove());

        const iconPath = svg.getAttribute('data-icon') || '';
        const vb = (svg.getAttribute('viewBox') || '').split(/\s+/).map(Number);
        const isRedwood = iconPath.includes('/redwood/') || (vb.length === 4 && vb[2] <= 124 && vb[3] <= 34);
        if (isRedwood) decorateRedwood(svg, env);
        else decorateRefreshed(svg, env);

        if (svg.dataset.nsftEnvOrigLabel === undefined) {
            svg.dataset.nsftEnvOrigLabel = svg.getAttribute('aria-label') || '';
        }
        const semantic = (env.type === 'sb' ? 'Sandbox ' : 'Release Preview ') + env.num;
        svg.setAttribute('aria-label', semantic);

        if (!svg.dataset.nsftEnvClickBound) {
            svg.dataset.nsftEnvClickBound = '1';
            svg.style.cursor = 'pointer';
            svg.addEventListener('click', onLogoClick);
        }
    }

    function onLogoClick(e) {
        e.stopPropagation();
        window.dispatchEvent(new CustomEvent('nsft-show-env-picker', {
            detail: { x: e.clientX, y: e.clientY }
        }));
    }

    function widenSvg(svg, extra) {
        const originalViewBox = svg.getAttribute('viewBox') || '';
        if (!svg.dataset.nsftEnvOrigViewBox) svg.dataset.nsftEnvOrigViewBox = originalViewBox;
        const parts = (svg.dataset.nsftEnvOrigViewBox || '').split(/\s+/).map(Number);
        if (parts.length !== 4) return null;
        const [vx, vy, vw, vh] = parts;
        svg.setAttribute('viewBox', `${vx} ${vy} ${vw + extra} ${vh}`);
        const origWidth = parseFloat(svg.getAttribute('width')) || vw;
        if (!svg.dataset.nsftEnvOrigWidth) svg.dataset.nsftEnvOrigWidth = String(origWidth);
        svg.setAttribute('width', String(Math.round(origWidth * (vw + extra) / vw)));
        return { vx, vy, vw, vh };
    }

    function decorateRefreshed(svg, env) {
        widenSvg(svg, env.num.length === 1 ? 14 : 22);

        const ns = 'http://www.w3.org/2000/svg';
        const text = document.createElementNS(ns, 'text');
        text.setAttribute('class', 'nsft-env-num');
        text.setAttribute('x', '114');
        text.setAttribute('y', '27');
        text.setAttribute('font-family', 'Open Sans, Helvetica, Arial, sans-serif');
        text.setAttribute('font-weight', '700');
        text.setAttribute('font-size', '20');
        text.setAttribute('fill', env.color);
        text.setAttribute('letter-spacing', '0.5');
        text.setAttribute('style', 'user-select:none;-webkit-user-select:none;pointer-events:none;');
        text.textContent = env.num;
        svg.appendChild(text);
    }

    function decorateRedwood(svg, env) {
        const isMultiDigit = env.num.length > 1;
        const ns = 'http://www.w3.org/2000/svg';

        if (isMultiDigit && widenSvg(svg, 10 * (env.num.length - 1))) {
            const extra = 10 * (env.num.length - 1);
            const bgPath = svg.querySelector('g[clip-path] > path[fill="#967F47"]')
                || svg.querySelector('path[d^="M0.5 0H116.5"]')
                || svg.querySelector('g[clip-path] > path');
            if (bgPath) {
                if (!svg.dataset.nsftEnvOrigBgD) svg.dataset.nsftEnvOrigBgD = bgPath.getAttribute('d') || '';
                bgPath.setAttribute('d', shiftPathPoints(svg.dataset.nsftEnvOrigBgD, extra));
            } else {
                diag('no se encontró el path del fondo del logo (¿NetSuite cambió el SVG/color?).');
            }
        }

        const text = document.createElementNS(ns, 'text');
        text.setAttribute('class', 'nsft-env-num');
        text.setAttribute('x', '110');
        text.setAttribute('y', '22');
        text.setAttribute('font-family', 'Open Sans, Helvetica, Arial, sans-serif');
        text.setAttribute('font-weight', '700');
        text.setAttribute('font-size', '14');
        text.setAttribute('letter-spacing', '0.5');
        text.setAttribute('fill', 'white');
        text.setAttribute('style', 'user-select:none;-webkit-user-select:none;pointer-events:none;');
        text.textContent = env.num;
        svg.appendChild(text);
    }

    function shiftPathPoints(d, extra) {
        const hit = d.indexOf('116.5') !== -1 || d.indexOf('118.709') !== -1 || d.indexOf('120.5') !== -1;
        if (!hit) {
            diag('shiftPathPoints: ningún punto esperado del fondo coincidió — el dígito puede quedar fuera del color del logo.');
            return d;
        }
        return d
            .replace(RE_1165, String(116.5 + extra))
            .replace(RE_118709, String(118.709 + extra))
            .replace(RE_1205, String(120.5 + extra));
    }

    function removeAll() {
        if (_unsub) { try { _unsub(); } catch (e) { } _unsub = null; }
        Array.from(document.querySelectorAll('svg')).filter((s) => s.dataset[PROCESSED_FLAG] !== undefined).forEach((svg) => {
            svg.querySelectorAll('.nsft-env-num').forEach((el) => el.remove());
            if (svg.dataset.nsftEnvOrigViewBox) {
                svg.setAttribute('viewBox', svg.dataset.nsftEnvOrigViewBox);
                delete svg.dataset.nsftEnvOrigViewBox;
            }
            if (svg.dataset.nsftEnvOrigWidth) {
                svg.setAttribute('width', svg.dataset.nsftEnvOrigWidth);
                delete svg.dataset.nsftEnvOrigWidth;
            }
            if (svg.dataset.nsftEnvOrigBgD) {
                const bgPath = svg.querySelector('g[clip-path] > path[fill="#967F47"]')
                    || svg.querySelector('path[fill="#967F47"]')
                    || svg.querySelector('g[clip-path] > path');
                if (bgPath) bgPath.setAttribute('d', svg.dataset.nsftEnvOrigBgD);
                delete svg.dataset.nsftEnvOrigBgD;
            }
            if (svg.dataset.nsftEnvOrigLabel !== undefined) {
                svg.setAttribute('aria-label', svg.dataset.nsftEnvOrigLabel);
                delete svg.dataset.nsftEnvOrigLabel;
            }
            if (svg.dataset.nsftEnvClickBound) {
                svg.removeEventListener('click', onLogoClick);
                svg.style.cursor = '';
                delete svg.dataset.nsftEnvClickBound;
            }
            delete svg.dataset[PROCESSED_FLAG];
        });
        _cachedSvg = null;
    }
})();
