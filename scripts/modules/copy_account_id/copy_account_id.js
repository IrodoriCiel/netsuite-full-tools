(function () {
    const STORAGE_KEY = 'enableCopyAccountId';

    const cssUrl = chrome.runtime.getURL("scripts/modules/copy_account_id/copy_account_id.css");
    const link = document.createElement("link");
    link.href = cssUrl;
    link.type = "text/css";
    link.rel = "stylesheet";
    document.head.appendChild(link);

    function isApplicablePage() {
        try {
            if (window.NSFT_RecordButtons && NSFT_RecordButtons.isHeaderlessPage && NSFT_RecordButtons.isHeaderlessPage()) return false;
        } catch (e) { }
        return true;
    }

    let envLetters = '3';

    const AJUSTES_DEFECTOS = { [STORAGE_KEY]: true, envBadgeLetters: '3' };
    let _arrancado = false;

    function arrancar(items) {
        if (_arrancado || !isApplicablePage()) return;
        _arrancado = true;
        envLetters = items.envBadgeLetters || '3';
        init(items);
    }

    chrome.storage.local.get(AJUSTES_DEFECTOS, (items) => {
        if (!items[STORAGE_KEY]) return;
        arrancar(items);
    });

    chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== 'local' || !changes[STORAGE_KEY]) return;
        if (changes[STORAGE_KEY].newValue === false) { desmontar(); return; }
        chrome.storage.local.get(AJUSTES_DEFECTOS, arrancar);
    });

    function desmontar() {
        if (!_arrancado) return;
        _arrancado = false;
        cleanup();
        const accountElement = document.querySelector(NAVBAR_ACCOUNT_SELECTOR);
        if (accountElement) {
            accountElement.removeEventListener('click', startActivePolling);
            accountElement.removeEventListener('mouseenter', startActivePolling);
        }
        document.querySelectorAll('[data-nsft-env-num]').forEach(removeEnvNumber);
        document.querySelectorAll('.nsft-account-id-wrapper').forEach((el) => el.remove());
    }

    chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== 'local' || !changes.envBadgeLetters) return;
        envLetters = changes.envBadgeLetters.newValue || '3';
        try { addAccountColours(); } catch (e) { }
    });

    function envText(env) {
        if (!env) return '';
        const fn = window.NSFT_ENV && window.NSFT_ENV.envLabel;
        return fn ? fn(env.code, envLetters) : env.code;
    }

    const NAVBAR_ACCOUNT_SELECTOR = 'button[data-header-section="quick-link-menu"][data-automation-id="RoleMenuItem"]';
    let pollInterval = null;
    let _unsub = null;

    function cleanup() {
        if (_unsub) { try { _unsub(); } catch (e) { } _unsub = null; }
        if (pollInterval) { clearInterval(pollInterval); pollInterval = null; }
    }

    function init(items) {
        const accountElement = document.querySelector(NAVBAR_ACCOUNT_SELECTOR);

        if (accountElement) {
            accountElement.addEventListener('click', startActivePolling);
            accountElement.addEventListener('mouseenter', startActivePolling);
        }

        if (window.NSFT_Observer && typeof window.NSFT_Observer.subscribe === 'function') {
            _unsub = window.NSFT_Observer.subscribe(() => { processAccountLinks(); }, { throttle: 300 });
        } else {
            const bodyObserver = new MutationObserver(() => { processAccountLinks(); });
            bodyObserver.observe(document.body, { childList: true, subtree: true });
            _unsub = () => bodyObserver.disconnect();
        }

        processAccountLinks();
    }

    function startActivePolling() {
        processAccountLinks();
        if (pollInterval) clearInterval(pollInterval);

        let duration = 0;
        let idleTicks = 0;
        const INTERVAL_MS = 100;
        const TIMEOUT_MS = 5000;

        const stop = () => { clearInterval(pollInterval); pollInterval = null; };

        pollInterval = setInterval(() => {
            const found = processAccountLinks();
            duration += INTERVAL_MS;
            const hasLinks = !!document.querySelector('a[href*="company="]');
            if (hasLinks && !found) {
                if (++idleTicks >= 3) return stop();
            } else {
                idleTicks = 0;
            }
            if (duration > TIMEOUT_MS) stop();
        }, INTERVAL_MS);
    }

    function processAccountLinks() {
        if (!chrome.runtime || !chrome.runtime.id) { cleanup(); return false; }
        try {
            const links = document.querySelectorAll('a[href*="company="]');

            let found = false;
            if (links.length) {
                for (const link of links) {
                    if (link.querySelector('.nsft-account-id-wrapper')) continue;
                    addAccountIdToLink(link);
                    found = true;
                }
            }

            addAccountColours();

            return found;
        } catch (e) {
            if (e.message && e.message.includes('Extension context invalidated')) {
                return false;
            }
            return false;
        }
    }

    function envOfAccountLink(anchor) {
        let company = '';
        try {
            company = new URL(anchor.href).searchParams.get('company') || '';
        } catch (e) {
            company = (anchor.getAttribute('href') || '').split('company=')[1] || '';
            company = company.split('&')[0];
        }
        if (!company) return null;

        const E = window.NSFT_ENV;
        if (!E || typeof E.detectEnv !== 'function') return null;
        return E.detectEnv(company.replace(/_/g, '-').toLowerCase());
    }

    const ENV_CLASS = { PRD: 'pd-option', SB: 'sb-option', RP: 'rp-option', TD: 'td-option' };

    function findNativeBadge(root) {
        if (!root) return null;
        const propio = (el) => el.closest('.nsft-account-id-wrapper, .nsft-env-badge');
        const lee = (el) => {
            const nuestro = el.dataset.nsftEnvNum !== undefined;
            const orig = el.dataset.nsftEnvOrig;
            const attr = nuestro ? (orig !== undefined ? orig : null) : el.getAttribute('data-content');
            return ((attr != null ? attr : el.textContent) || '')
                .replace(/[^a-z0-9]/gi, '').toUpperCase();
        };

        const leeConPseudo = (el) => lee(el)
            || pseudoTexto(el, '::after')
            || pseudoTexto(el, '::before');
        const porTexto = Array.from(root.querySelectorAll('*'))
            .filter(el => !propio(el) && !el.children.length && /^(SB|RP)\d*$/.test(leeConPseudo(el)));
        if (porTexto.length) return porTexto[porTexto.length - 1];

        const marcados = Array.from(root.querySelectorAll('[data-widget="Badge"], .uif39, [class*="badge" i]'))
            .filter(el => !propio(el));
        return marcados.length ? marcados[marcados.length - 1] : null;
    }

    function findBadgeInPanel(panel) {
        const children = Array.from(panel.children)
            .filter(c => !c.classList.contains('nsft-account-id-wrapper'));
        if (children.length < 2) return null;
        return children[children.length - 1];
    }

    function pseudoTexto(el, pseudo) {
        try {
            const c = window.getComputedStyle(el, pseudo).content;
            if (!c || c === 'none' || c === 'normal') return '';
            return c.replace(/^["']|["']$/g, '').replace(/[^a-z0-9]/gi, '').toUpperCase();
        } catch (e) { return ''; }
    }

    function removeEnvNumber(badgeEl) {
        if (badgeEl.dataset.nsftEnvNum === undefined) return;
        delete badgeEl.dataset.nsftEnvNum;
        badgeEl.classList.remove('nsft-env-suffix', 'nsft-env-code');
        if (badgeEl.dataset.nsftEnvOrig !== undefined) {
            badgeEl.setAttribute('data-content', badgeEl.dataset.nsftEnvOrig);
            delete badgeEl.dataset.nsftEnvOrig;
        } else {
            badgeEl.removeAttribute('data-content');
        }
    }

    function numeroYaVisible(badgeEl, num) {
        let nodo = badgeEl;
        for (let salto = 0; salto < 3 && nodo && nodo.parentElement; salto++) {
            const padre = nodo.parentElement;
            for (const hermano of padre.children) {
                if (hermano === nodo || hermano.closest('.nsft-account-id-wrapper')) continue;
                if ((hermano.textContent || '').trim() === num) return true;
            }
            if (padre.tagName === 'A') break;
            nodo = padre;
        }
        return false;
    }

    function addEnvNumber(badgeEl, env) {
        const code = String(env.code);
        const num = (code.match(/^(?:SB|RP)(\d+)$/) || [])[1];
        if (!num || badgeEl.dataset.nsftEnvNum === num) return;
        if (numeroYaVisible(badgeEl, num)) return;

        const attr = badgeEl.getAttribute('data-content');
        const crudo = (attr != null ? attr : (badgeEl.textContent || ''));
        const label = crudo.replace(/[^a-z0-9]/gi, '').toUpperCase();
        if (/\d/.test(label)) return;

        if (label === 'SB' || label === 'RP') {
            badgeEl.dataset.nsftEnvNum = num;
            if (attr != null) {
                if (badgeEl.dataset.nsftEnvOrig === undefined) badgeEl.dataset.nsftEnvOrig = attr;
                badgeEl.setAttribute('data-content', label + num);
            } else {
                badgeEl.setAttribute('data-content', num);
                badgeEl.classList.add('nsft-env-suffix');
            }
            return;
        }

        if (!crudo.trim()) {
            const enAfter = pseudoTexto(badgeEl, '::after');
            const enBefore = pseudoTexto(badgeEl, '::before');

            if (/\d/.test(enAfter) || /\d/.test(enBefore)) return;

            badgeEl.dataset.nsftEnvNum = num;
            if (!/^(SB|RP)$/.test(enAfter) && /^(SB|RP)$/.test(enBefore)) {
                badgeEl.setAttribute('data-content', num);
                badgeEl.classList.add('nsft-env-suffix');
            } else {
                if (!/^(SB|RP)$/.test(enAfter)) {
                    console.debug('[NSFT] copy_account_id: chapa sin texto reconocible', badgeEl.className);
                }
                badgeEl.setAttribute('data-content', code);
                badgeEl.classList.add('nsft-env-code');
            }
            return;
        }

        console.debug('[NSFT] copy_account_id: chapa no reconocida', JSON.stringify(crudo));
    }

    function addAccountColours() {
        const links = document.querySelectorAll('a[href*="company="]');

        for (const anchor of links) {
            const env = envOfAccountLink(anchor);
            const family = (window.NSFT_ENV && env) ? window.NSFT_ENV.envFamily(env.code) : null;
            const cls = (family && ENV_CLASS[family]) || null;
            const badgeText = envText(env);
            const isProd = family === 'PRD';

            if (!cls) continue;

            if (!isProd) {
                const nativa = findNativeBadge(anchor);
                if (nativa) {
                    const restos = '.nsft-env-suffix, .nsft-env-code, .sb-option, .rp-option, .pd-option, .td-option';
                    for (const otra of anchor.querySelectorAll(restos)) {
                        if (otra === nativa || otra.closest('.nsft-account-id-wrapper, .nsft-env-badge')) continue;
                        removeEnvNumber(otra);
                        otra.classList.remove('sb-option', 'rp-option', 'pd-option', 'td-option');
                    }
                    nativa.classList.add(cls);
                    if (envLetters === '2') removeEnvNumber(nativa);
                    else addEnvNumber(nativa, env);
                }
                continue;
            }

            const panel = anchor.querySelector('div[data-widget="StackPanel"]');

            if (panel) {
                if (panel.querySelector(`.${cls}`)) continue;

                const badgeEl = findBadgeInPanel(panel);
                if (badgeEl) {
                    badgeEl.classList.add(cls);
                    badgeEl.setAttribute('data-content', badgeText);
                } else {
                    panel.appendChild(createBadge(cls, badgeText));
                }
            } else {

                const menuItemContent = anchor.querySelector('div[data-widget="MenuItemContent"]');
                const target = menuItemContent || anchor;

                if (target.querySelector(`.${cls}`)) continue;

                const newBadge = createBadge(cls, badgeText);
                target.appendChild(newBadge);

                if (menuItemContent) {
                    if (menuItemContent.style.display !== 'flex') {
                        menuItemContent.style.display = 'flex';
                        menuItemContent.style.flexDirection = 'row';
                        menuItemContent.style.alignItems = 'center';
                        menuItemContent.style.width = '100%';

                        const textEl = menuItemContent.querySelector('span[data-widget="Text"]');
                        if (textEl) textEl.style.flexGrow = '1';
                    }
                } else {
                    if (anchor.style.display !== 'flex') {
                        anchor.style.display = 'flex';
                        anchor.style.flexDirection = 'row';
                        anchor.style.alignItems = 'center';
                    }
                }
            }
        }
    }

    const MARCAS_NUESTRAS = ['sb-option', 'rp-option', 'pd-option', 'td-option',
        'nsft-env-suffix', 'nsft-env-code', 'nsft-env-badge'];

    function plantillaChapaNativa() {
        for (const nativa of document.querySelectorAll('a[href*="company="] [data-widget="Badge"]')) {
            if (!nativa.classList.contains('nsft-env-badge')) return nativa;
        }
        for (const nativa of document.querySelectorAll('a[href*="company="] .sb-option, a[href*="company="] .rp-option')) {
            if (!nativa.classList.contains('nsft-env-badge')) return nativa;
        }
        return null;
    }

    function limpiarMarcas(el) {
        el.removeAttribute('id');
        el.removeAttribute('data-content');
        delete el.dataset.nsftEnvNum;
        delete el.dataset.nsftEnvOrig;
        el.classList.remove(...MARCAS_NUESTRAS);
    }

    function createBadge(cls, text) {
        const plantilla = plantillaChapaNativa();

        if (plantilla) {
            const badge = plantilla.cloneNode(true);
            limpiarMarcas(badge);
            badge.querySelectorAll('*').forEach(limpiarMarcas);
            const interior = badge.firstElementChild;
            if (interior) {
                interior.textContent = text;
            } else {
                badge.textContent = '';
                badge.setAttribute('data-content', text);
                badge.classList.add('nsft-env-code');
            }
            badge.classList.add('nsft-env-badge', cls);
            badge.style.flexShrink = '0';
            return badge;
        }

        const newBadge = document.createElement('div');
        newBadge.className = `uif39 nsft-env-badge nsft-env-badge--propia ${cls}`;
        newBadge.style.flexShrink = '0';
        newBadge.setAttribute('data-content', text);
        return newBadge;
    }

    function addAccountIdToLink(linkEl) {
        if (linkEl.dataset.nsftIdAdded === 'true' && linkEl.querySelector('.nsft-account-id-wrapper')) return;

        const urlParams = new URL(linkEl.href).searchParams;
        let companyId = urlParams.get('company');
        if (!companyId) return;

        if (companyId.includes('&')) companyId = companyId.split('&')[0];

        const wrapper = document.createElement('span');
        wrapper.className = 'nsft-account-id-wrapper';

        const copyBtn = document.createElement('span');
        copyBtn.className = 'nsft-copy-btn';

        const tooltipText = chrome.i18n.getMessage("cai_copy_account_id_tooltip");
        copyBtn.title = tooltipText;

        const iconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:11px;height:11px;"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>`;
        const successIcon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:11px;height:11px;color:#389e0d;"><polyline points="20 6 9 17 4 12"></polyline></svg>`;

        const escFn = (window.NSFT_DOM && window.NSFT_DOM.escapeHtml) || ((v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])));
        const btnText = `<span class="nsft-copy-btn-text">${escFn(companyId)}</span>`;
        const successTextSpan = `<span class="nsft-copy-btn-text">${chrome.i18n.getMessage("cai_copied_text")}</span>`;

        copyBtn.innerHTML = iconSvg + btnText;

        const stopProp = (e) => {
            e.stopPropagation();
            e.stopImmediatePropagation();
        };

        const disableLink = () => {
            if (linkEl.hasAttribute('href')) {
                linkEl.dataset.originalHref = linkEl.getAttribute('href');
                linkEl.removeAttribute('href');
                if (linkEl.getAttribute('onclick')) {
                    linkEl.dataset.originalOnclick = linkEl.getAttribute('onclick');
                    linkEl.removeAttribute('onclick');
                }
            }
        };

        const enableLink = () => {
            if (linkEl.dataset.originalHref) linkEl.setAttribute('href', linkEl.dataset.originalHref);
            if (linkEl.dataset.originalOnclick) linkEl.setAttribute('onclick', linkEl.dataset.originalOnclick);
        };

        const handleCopy = (e) => {
            e.stopPropagation();
            e.preventDefault();

            const onSuccess = () => {
                copyBtn.innerHTML = successIcon + successTextSpan;
                copyBtn.classList.add('success');
                setTimeout(() => {
                    copyBtn.innerHTML = iconSvg + btnText;
                    copyBtn.classList.remove('success');
                }, 1500);
            };

            if (window.NSFT_Clipboard) {
                window.NSFT_Clipboard.copy(companyId, { onSuccess });
            } else if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(companyId).then(onSuccess);
            }
        };

        copyBtn.addEventListener('mouseenter', disableLink);
        copyBtn.addEventListener('mouseleave', enableLink);
        copyBtn.addEventListener('mousedown', handleCopy, true);
        copyBtn.addEventListener('mouseup', stopProp, true);
        copyBtn.addEventListener('click', stopProp, true);

        wrapper.appendChild(copyBtn);
        wrapper.onclick = (e) => e.stopPropagation();

        const stackPanel = linkEl.querySelector('div[data-widget="StackPanel"]');
        let inserted = false;

        if (stackPanel) {
            const stackChildren = stackPanel.children;
            if (stackChildren.length > 0) {
                const firstNameEl = stackChildren[0];
                if (firstNameEl && !firstNameEl.classList.contains('nsft-account-id-wrapper')) {
                    wrapper.style.marginRight = '8px';
                    wrapper.style.marginLeft = '8px';

                    if (stackChildren.length > 1) {
                        stackPanel.insertBefore(wrapper, stackChildren[1]);
                    } else {
                        stackPanel.appendChild(wrapper);
                    }
                    inserted = true;
                }
            }
        }

        if (!inserted) {
            const menuItemContent = linkEl.querySelector('div[data-widget="MenuItemContent"]');
            if (menuItemContent) {
                wrapper.style.marginRight = '8px';
                wrapper.style.marginLeft = '8px';

                menuItemContent.style.display = 'flex';
                menuItemContent.style.flexDirection = 'row';
                menuItemContent.style.alignItems = 'center';
                menuItemContent.style.width = '100%';

                const textEl = menuItemContent.querySelector('span[data-widget="Text"]');
                if (textEl) {
                    textEl.style.flexGrow = '1';
                }

                menuItemContent.appendChild(wrapper);
                inserted = true;
            }
        }

        if (!inserted) {
            linkEl.style.display = 'flex';
            linkEl.style.flexDirection = 'row';
            linkEl.style.alignItems = 'center';
            linkEl.appendChild(wrapper);
        }

        linkEl.dataset.nsftIdAdded = 'true';
        fixLayoutConstraints(linkEl);
    }

    function fixLayoutConstraints(element) {
        try {
            element.style.setProperty('width', 'auto', 'important');
            element.style.setProperty('max-width', 'none', 'important');

            let current = element.parentElement;

            for (let i = 0; i < 15; i++) {
                if (!current || current.tagName === 'BODY' || current.tagName === 'HTML') break;

                const role = current.getAttribute('role');
                const widget = current.dataset.widget;

                current.style.setProperty('width', 'auto', 'important');
                current.style.setProperty('max-width', 'none', 'important');
                current.style.setProperty('min-width', 'fit-content', 'important');

                if (role === 'dialog' || widget === 'Popover' || current.classList.contains('uif9')) {
                    current.style.width = 'auto !important';
                    current.style.maxWidth = 'none !important';

                    (function (target) {
                        requestAnimationFrame(() => {
                            const rect = target.getBoundingClientRect();
                            const overflow = rect.right - window.innerWidth;

                            if (overflow > 0) {
                                const computed = window.getComputedStyle(target);
                                if (computed.position === 'absolute' || computed.position === 'fixed') {
                                    const currentLeft = parseFloat(computed.left) || 0;
                                    const newLeft = currentLeft - overflow - 20;
                                    target.style.setProperty('left', `${newLeft}px`, 'important');
                                }
                            }
                        });
                    })(current);
                }
                current = current.parentElement;
            }
        } catch (e) {
        }
    }
})();
