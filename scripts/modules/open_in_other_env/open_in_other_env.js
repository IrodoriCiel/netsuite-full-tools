(function () {
    'use strict';

    const STORAGE_KEY = 'enableOpenInOtherEnv';
    const POP_ID = 'nsft-env-picker-pop';
    const NSFT_THEME_KEY = 'nsftTheme';

    let _theme = 'light';

    function resolveTheme() {
        return _theme === 'dark' ? 'dark' : 'light';
    }

    chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== 'local' || !changes[NSFT_THEME_KEY]) return;
        _theme = changes[NSFT_THEME_KEY].newValue || 'light';
        const pop = document.getElementById(POP_ID);
        if (pop) pop.setAttribute('data-theme', resolveTheme());
    });

    function detectCurrentEnv() {
        const host = location.hostname.toLowerCase();
        let m = host.match(/^(\d+)(?:-([a-z]+\d*))?\.app\.netsuite\.com$/);
        if (m) {
            return { accountId: m[1], current: m[2] ? m[2].toLowerCase() : 'prd', noSiblings: false };
        }
        m = host.match(/^(tstdrv\d+)\.app\.netsuite\.com$/);
        if (m) {
            return { accountId: m[1], current: 'prd', noSiblings: true };
        }
        return null;
    }

    function buildEnvUrl(accountId, target) {
        const host = (target === 'prd')
            ? `${accountId}.app.netsuite.com`
            : `${accountId}-${target}.app.netsuite.com`;
        return `${location.protocol}//${host}${location.pathname}${location.search}${location.hash}`;
    }

    function buildEnvTargets(env, sandboxList) {
        if (!env || env.noSiblings) return [];
        const targets = [{ key: 'prd', label: chrome.i18n.getMessage('openInEnv_prd_short') || 'Producción' }];
        String(sandboxList || '1,2')
            .split(',')
            .map((s) => s.trim())
            .filter((s) => /^\d+$/.test(s))
            .forEach((n) => targets.push({ key: 'sb' + n, label: 'Sandbox ' + n }));
        targets.push({ key: 'rp', label: chrome.i18n.getMessage('openInEnv_rp_short') || 'Release Preview' });
        return targets.filter((t) => t.key !== env.current);
    }

    function handleEnvPicker(e) {
        chrome.storage.local.get({ [STORAGE_KEY]: true, openInOtherEnvSandboxes: '1,2', [NSFT_THEME_KEY]: 'light' }, (cfg) => {
            if (!cfg[STORAGE_KEY]) return;
            _theme = cfg[NSFT_THEME_KEY] || 'light';
            const env = detectCurrentEnv();
            if (!env) return;
            const sandboxes = (e && e.detail && typeof e.detail.sandboxes === 'string')
                ? e.detail.sandboxes : cfg.openInOtherEnvSandboxes;
            const targets = buildEnvTargets(env, sandboxes);
            if (!targets.length) return;
            const x = (e && e.detail && typeof e.detail.x === 'number') ? e.detail.x : window.innerWidth / 2;
            const y = (e && e.detail && typeof e.detail.y === 'number') ? e.detail.y : 100;
            showEnvPicker(targets, env, { left: x, right: x + 1, top: y, bottom: y + 1 });
        });
    }

    function labelForKey(key) {
        if (key === 'prd') return chrome.i18n.getMessage('openInEnv_prd_short') || 'Producción';
        if (key === 'rp') return chrome.i18n.getMessage('openInEnv_rp_short') || 'Release Preview';
        const m = /^sb(\d+)$/.exec(key);
        if (m) return 'Sandbox ' + m[1];
        return String(key || '').toUpperCase();
    }

    function showEnvPicker(targets, env, anchorRect) {
        const prev = document.getElementById(POP_ID);
        if (prev) prev.remove();

        const pop = document.createElement('div');
        pop.id = POP_ID;
        pop.className = 'nsft-env-picker-pop';
        pop.setAttribute('data-theme', resolveTheme());
        pop.setAttribute('role', 'menu');
        pop.setAttribute('aria-label', chrome.i18n.getMessage('openInEnv_group') || 'Abrir en otro entorno');

        const currentLabel = labelForKey(env.current);
        const cur = document.createElement('div');
        cur.className = 'nsft-env-picker-current';
        cur.setAttribute('aria-disabled', 'true');
        cur.textContent = currentLabel + ' ' + (chrome.i18n.getMessage('openInEnv_current') || '(actual)');
        pop.appendChild(cur);

        targets.forEach((t) => {
            const a = document.createElement('a');
            a.className = 'nsft-env-picker-item';
            a.setAttribute('role', 'menuitem');
            a.href = buildEnvUrl(env.accountId, t.key);
            a.target = '_blank';
            a.rel = 'noopener';
            a.textContent = t.label;
            pop.appendChild(a);
        });

        document.body.appendChild(pop);

        const pw = pop.offsetWidth;
        let left = (anchorRect.right || 0) + 4;
        if (left + pw > window.innerWidth - 8) {
            left = Math.max(8, (anchorRect.left || 0) - pw - 4);
        }
        let top = anchorRect.top || 0;
        const ph = pop.offsetHeight;
        if (top + ph > window.innerHeight - 8) top = Math.max(8, window.innerHeight - ph - 8);
        pop.style.left = left + 'px';
        pop.style.top = top + 'px';

        const firstItem = pop.querySelector('a.nsft-env-picker-item');
        if (firstItem) { try { firstItem.focus(); } catch (e) { } }

        const close = () => {
            pop.remove();
            document.removeEventListener('mousedown', onOutside, true);
            document.removeEventListener('click', onOutside, true);
            document.removeEventListener('keydown', onKey, true);
        };
        const onOutside = (ev) => { if (!pop.contains(ev.target)) close(); };
        const onKey = (ev) => {
            if (ev.key === 'Escape') { close(); return; }
            const items = Array.from(pop.querySelectorAll('.nsft-env-picker-item'));
            if (!items.length) return;
            let idx = items.findIndex((el) => el === document.activeElement);
            if (ev.key === 'ArrowDown') { ev.preventDefault(); idx = (idx + 1) % items.length; items[idx].focus(); }
            else if (ev.key === 'ArrowUp') { ev.preventDefault(); idx = (idx - 1 + items.length) % items.length; items[idx].focus(); }
        };
        setTimeout(() => {
            document.addEventListener('mousedown', onOutside, true);
            document.addEventListener('click', onOutside, true);
            document.addEventListener('keydown', onKey, true);
        }, 0);
        pop.addEventListener('click', (ev) => {
            if (ev.target.closest('a')) setTimeout(close, 0);
        });
    }

    window.addEventListener('nsft-show-env-picker', handleEnvPicker);

    window.NSFT_OpenInEnv = { detectCurrentEnv, buildEnvTargets, buildEnvUrl };
})();
