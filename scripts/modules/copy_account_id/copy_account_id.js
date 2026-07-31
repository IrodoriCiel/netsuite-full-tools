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

    chrome.storage.local.get({
        [STORAGE_KEY]: true
    }, (items) => {
        if (!items[STORAGE_KEY] || !isApplicablePage()) return;

        init(items);
    });

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

    function addAccountColours() {
        const links = document.querySelectorAll('a[href*="company="]');
        const pdText = chrome.i18n.getMessage("cai_pd_badge_content");

        for (const anchor of links) {
            const isSB = anchor.href.includes('_SB');
            const isRP = anchor.href.includes('_RP');
            const isProd = !isSB && !isRP;

            const panel = anchor.querySelector('div[data-widget="StackPanel"]');

            if (panel) {
                const children = Array.from(panel.children).filter(c => !c.classList.contains('nsft-account-id-wrapper'));
                let badgeEl = children.length > 1 ? children[children.length - 1] : null;

                if (isSB && badgeEl) {
                    badgeEl.classList.add('sb-option');
                } else if (isRP && badgeEl) {
                    badgeEl.classList.add('rp-option');
                } else if (isProd) {
                    const cls = 'pd-option';

                    if (panel.querySelector(`.${cls}`)) continue;

                    if (badgeEl) {
                        badgeEl.classList.add(cls);
                        badgeEl.setAttribute('data-content', pdText);
                    } else {
                        const newBadge = createBadge(cls, pdText);
                        panel.appendChild(newBadge);
                    }
                }
            } else if (isProd) {
                const cls = 'pd-option';

                const menuItemContent = anchor.querySelector('div[data-widget="MenuItemContent"]');
                const target = menuItemContent || anchor;

                if (target.querySelector(`.${cls}`)) continue;

                const newBadge = createBadge(cls, pdText);
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

    function createBadge(cls, text) {
        const newBadge = document.createElement('div');
        newBadge.className = `uif39 ${cls}`;
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
