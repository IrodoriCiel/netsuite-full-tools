(function () {
    'use strict';

    if (window.__nsftSuiteletTools) {
        window.__nsftSuiteletTools._ready = true;
    } else {
        window.__nsftSuiteletTools = { _ready: true };
    }

    const STATE_CACHE_KEY = 'nsftSuiteletToolsCache2:';
    const STATE_CACHE_TTL_MS = 60 * 60 * 1000;

    const IS_EXTFORMS = /\.extforms\.netsuite\.com$/i.test(location.hostname);
    const APP_BASE = IS_EXTFORMS
        ? location.protocol + '//' + location.hostname.replace(/\.extforms\.netsuite\.com$/i, '.app.netsuite.com')
        : location.origin;

    let initialized = false;
    let teardownFns = [];
    let messageListener = null;

    function attachMessageListener() {
        if (messageListener) return;
        messageListener = (event) => {
            if (event.source !== window) return;
            const data = event.data;
            if (!data || typeof data.type !== 'string') return;
            if (data.type === 'nsft-suitelet-tools-init') {
                if (initialized) return;
                initialized = true;
                init(data.translations || {}, data.iconUrl || '');
            } else if (data.type === 'nsft-suitelet-tools-teardown') {
                teardown();
            }
        };
        window.addEventListener('message', messageListener);
    }
    attachMessageListener();

    function init(translations, iconUrl) {
        const inlineAnchor =
            document.querySelector('.uir-header-buttons > table > tbody > tr') ||
            document.querySelector('[data-header-section="actions"]') ||
            document.querySelector('.uir-page-title-secondline .uir-header-buttons');

        if (inlineAnchor && inlineAnchor.appendChild) {
            buildInlineMenu(inlineAnchor, translations, iconUrl);
        } else {
            buildFloatingMenu(translations, iconUrl);
        }
        setupListeners();
    }

    function el(tag, attrs, children) {
        const node = document.createElement(tag);
        if (attrs) {
            Object.keys(attrs).forEach((k) => {
                if (k === 'class') node.className = attrs[k];
                else if (k === 'text') node.textContent = attrs[k];
                else if (k === 'html') node.innerHTML = attrs[k];
                else if (k === 'style') node.setAttribute('style', attrs[k]);
                else node.setAttribute(k, attrs[k]);
            });
        }
        if (children) {
            children.forEach((c) => {
                if (c) node.appendChild(c);
            });
        }
        return node;
    }

    const SVG_ATTRS = 'xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"';
    const SVG_SCRIPT = `<svg ${SVG_ATTRS}><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>`;
    const SVG_DEPLOY = `<svg ${SVG_ATTRS}><path d="M5 12.55a11 11 0 0 1 14.08 0"/><path d="M1.42 9a16 16 0 0 1 21.16 0"/><path d="M8.53 16.11a6 6 0 0 1 6.95 0"/><line x1="12" y1="20" x2="12.01" y2="20"/></svg>`;
    const SVG_EDIT = `<svg ${SVG_ATTRS}><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`;
    const SVG_LOGS = `<svg ${SVG_ATTRS}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>`;

    function buildInlineMenu(anchor, t, iconUrl) {
        const titleSpan = el('span', { class: 'nsft-suitelet-tools-text' }, [
            el('img', {
                src: iconUrl,
                style: 'width:16px; height:16px; object-fit:contain; margin-right:5px; vertical-align:text-top;'
            })
        ]);
        titleSpan.appendChild(document.createTextNode(t.st_suitelet_actions || ''));

        const optionsContainer = el('div', { class: 'nsft-suitelet-tools-options-container' }, [
            buildOption('nsft-suitelet-tools-open-script-record', SVG_SCRIPT, t.st_open_script_record),
            el('div', { class: 'nsft-suitelet-tools-option-divider' }, [el('hr')]),
            buildOption('nsft-suitelet-tools-open-deploy-record', SVG_DEPLOY, t.st_open_deploy_record),
            el('div', { class: 'nsft-suitelet-tools-option-divider' }, [el('hr')]),
            buildOption('nsft-suitelet-tools-edit-script-file', SVG_EDIT, t.st_edit_script_file),
            el('div', { class: 'nsft-suitelet-tools-option-divider' }, [el('hr')]),
            buildOption('nsft-suitelet-tools-view-logs', SVG_LOGS, t.st_view_suitelet_logs)
        ]);

        const td = el('td', { class: 'nsft-suitelet-tools-td' }, [titleSpan, optionsContainer]);
        anchor.appendChild(td);

        teardownFns.push(() => td.remove());
    }

    function buildOption(id, svgHtml, labelText) {
        const iconSpan = el('span', { class: 'nsft-suitelet-tools-icon', html: svgHtml });
        const labelSpan = el('span', { text: labelText || '' });
        return el('div', { class: 'nsft-suitelet-tools-option', id }, [iconSpan, labelSpan]);
    }

    function buildFloatingMenu(t, iconUrl) {
        const POSITION_KEY = 'nsftSuiteletToolsFabPos';

        const trigger = el('button', {
            type: 'button',
            class: 'nsft-st-fab-trigger',
            'aria-label': t.st_suitelet_actions || '',
            'aria-expanded': 'false'
        }, [
            el('span', { class: 'nsft-st-fab-label', text: t.st_suitelet_actions || '' }),
            el('img', { src: iconUrl, alt: '', class: 'nsft-st-fab-icon', draggable: 'false' })
        ]);

        const menuTitle = el('div', { class: 'nsft-st-fab-menu-title', text: t.st_suitelet_actions || '' });
        const optScript = el('button', {
            type: 'button',
            class: 'nsft-st-fab-option',
            id: 'nsft-suitelet-tools-open-script-record',
            text: t.st_open_script_record || ''
        });
        const optEdit = el('button', {
            type: 'button',
            class: 'nsft-st-fab-option',
            id: 'nsft-suitelet-tools-edit-script-file',
            text: t.st_edit_script_file || ''
        });
        const optLogs = el('button', {
            type: 'button',
            class: 'nsft-st-fab-option',
            id: 'nsft-suitelet-tools-view-logs',
            text: t.st_view_suitelet_logs || ''
        });
        const menu = el('div', { class: 'nsft-st-fab-menu', hidden: '' }, [menuTitle, optScript, optEdit, optLogs]);

        const fab = el('div', {
            id: 'nsft-suitelet-tools-fab',
            class: 'nsft-st-fab',
            role: 'navigation',
            'aria-label': t.st_suitelet_actions || ''
        }, [trigger, menu]);

        document.body.appendChild(fab);
        teardownFns.push(() => fab.remove());

        restorePosition(fab, POSITION_KEY);

        let outsideListener = null;
        const attachOutside = () => {
            if (outsideListener) return;
            outsideListener = (e) => {
                if (!menu.hidden && !fab.contains(e.target)) close();
            };
            document.addEventListener('click', outsideListener);
        };
        const detachOutside = () => {
            if (!outsideListener) return;
            document.removeEventListener('click', outsideListener);
            outsideListener = null;
        };
        teardownFns.push(detachOutside);

        const open = () => {
            menu.hidden = false;
            trigger.setAttribute('aria-expanded', 'true');
            fab.classList.add('is-open');
            applyMenuOrientation(fab, menu);
            attachOutside();
        };
        const close = () => {
            menu.hidden = true;
            trigger.setAttribute('aria-expanded', 'false');
            fab.classList.remove('is-open');
            detachOutside();
        };
        const toggle = () => (menu.hidden ? open() : close());

        const DRAG_THRESHOLD_PX = 5;
        let mouseIsDown = false;
        let didDrag = false;
        let startX = 0, startY = 0, offsetX = 0, offsetY = 0;
        let dragRAF = null;
        let pendingClientX = 0, pendingClientY = 0;
        let cachedFabWidth = 0, cachedFabHeight = 0;

        const applyDragPosition = () => {
            dragRAF = null;
            const newLeft = clamp(pendingClientX - offsetX, 0, window.innerWidth - cachedFabWidth);
            const newTop = clamp(pendingClientY - offsetY, 0, window.innerHeight - cachedFabHeight);
            fab.style.left = `${newLeft}px`;
            fab.style.top = `${newTop}px`;
        };

        const onMouseMove = (event) => {
            if (!mouseIsDown) return;
            const dx = event.clientX - startX;
            const dy = event.clientY - startY;
            if (!didDrag && Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;
            event.preventDefault();
            if (!didDrag) {
                didDrag = true;
                close();
                const rect = fab.getBoundingClientRect();
                cachedFabWidth = rect.width;
                cachedFabHeight = rect.height;
                fab.style.right = 'auto';
                fab.style.bottom = 'auto';
                fab.classList.add('is-dragging');
            }
            pendingClientX = event.clientX;
            pendingClientY = event.clientY;
            if (dragRAF === null) {
                dragRAF = window.requestAnimationFrame(applyDragPosition);
            }
        };

        const onMouseUp = () => {
            window.removeEventListener('mousemove', onMouseMove);
            window.removeEventListener('mouseup', onMouseUp);
            if (dragRAF !== null) {
                cancelAnimationFrame(dragRAF);
                dragRAF = null;
            }
            if (!mouseIsDown) return;
            mouseIsDown = false;
            fab.classList.remove('is-dragging');
            if (didDrag) {
                snapToNearestEdge(fab);
                savePosition(fab, POSITION_KEY);
            } else {
                toggle();
            }
        };

        const onMouseDown = (event) => {
            if (event.button !== 0) return;
            mouseIsDown = true;
            didDrag = false;
            startX = event.clientX;
            startY = event.clientY;
            const rect = fab.getBoundingClientRect();
            offsetX = event.clientX - rect.left;
            offsetY = event.clientY - rect.top;
            window.addEventListener('mousemove', onMouseMove);
            window.addEventListener('mouseup', onMouseUp);
        };
        trigger.addEventListener('mousedown', onMouseDown);
        trigger.addEventListener('click', (e) => e.stopPropagation());

        menu.querySelectorAll('.nsft-st-fab-option').forEach((btn) => {
            btn.addEventListener('click', () => setTimeout(close, 0));
        });

        let resizeRAF = null;
        const onResize = () => {
            if (resizeRAF !== null) return;
            resizeRAF = window.requestAnimationFrame(() => {
                resizeRAF = null;
                snapToNearestEdge(fab);
                savePosition(fab, POSITION_KEY);
            });
        };
        window.addEventListener('resize', onResize);
        teardownFns.push(() => {
            window.removeEventListener('resize', onResize);
            if (resizeRAF !== null) cancelAnimationFrame(resizeRAF);
            if (dragRAF !== null) cancelAnimationFrame(dragRAF);
        });
    }

    function applyMenuOrientation(fab) {
        const rect = fab.getBoundingClientRect();
        const isLeftHalf = (rect.left + rect.width / 2) < (window.innerWidth / 2);
        fab.classList.toggle('is-left', isLeftHalf);
        fab.classList.toggle('is-right', !isLeftHalf);
    }

    function snapToNearestEdge(elem) {
        const rect = elem.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        if (centerX < window.innerWidth / 2) {
            elem.style.left = '0px';
            elem.style.right = 'auto';
            elem.classList.add('is-left');
            elem.classList.remove('is-right');
        } else {
            elem.style.left = 'auto';
            elem.style.right = '0px';
            elem.classList.add('is-right');
            elem.classList.remove('is-left');
        }
        const top = clamp(rect.top, 8, window.innerHeight - rect.height - 8);
        elem.style.top = `${top}px`;
        elem.style.bottom = 'auto';
    }

    function savePosition(elem, key) {
        try {
            const rect = elem.getBoundingClientRect();
            const side = elem.classList.contains('is-left') ? 'left' : 'right';
            localStorage.setItem(key, JSON.stringify({ side, top: rect.top }));
        } catch (e) { }
    }

    function restorePosition(elem, key) {
        const applyDefault = () => {
            elem.classList.add('is-left');
            elem.style.left = '0px';
            elem.style.right = 'auto';
        };
        try {
            const raw = localStorage.getItem(key);
            if (!raw) return applyDefault();
            const parsed = JSON.parse(raw);
            if (
                !parsed || typeof parsed !== 'object' ||
                (parsed.side !== 'left' && parsed.side !== 'right') ||
                (typeof parsed.top !== 'number' && typeof parsed.top !== 'string')
            ) {
                return applyDefault();
            }
            const topNum = Number(parsed.top);
            if (!Number.isFinite(topNum)) return applyDefault();
            const safeTop = clamp(topNum, 8, window.innerHeight - 80);
            elem.style.top = `${safeTop}px`;
            elem.style.bottom = 'auto';
            if (parsed.side === 'left') {
                elem.classList.add('is-left');
                elem.style.left = '0px';
                elem.style.right = 'auto';
            } else {
                elem.classList.add('is-right');
                elem.style.right = '0px';
                elem.style.left = 'auto';
            }
        } catch (e) {
            applyDefault();
        }
    }

    function clamp(v, min, max) {
        return Math.min(Math.max(v, min), max);
    }

    function readCache(scriptId) {
        try {
            const raw = sessionStorage.getItem(STATE_CACHE_KEY + scriptId);
            if (!raw) return null;
            const parsed = JSON.parse(raw);
            if (!parsed || typeof parsed !== 'object') return null;
            if (Date.now() - (parsed.ts || 0) > STATE_CACHE_TTL_MS) return null;
            return parsed.data || null;
        } catch (e) { return null; }
    }

    function writeCache(scriptId, data) {
        try {
            sessionStorage.setItem(STATE_CACHE_KEY + scriptId, JSON.stringify({
                ts: Date.now(),
                data
            }));
        } catch (e) { }
    }

    function setupListeners() {
        const params = new URLSearchParams(window.location.search);
        let scriptId = params.get('script');
        let deployParam = params.get('deploy');

        if (!scriptId && document.referrer) {
            try {
                const url = new URL(document.referrer);
                if (url.searchParams.has('script')) scriptId = url.searchParams.get('script');
                if (url.searchParams.has('deploy')) deployParam = url.searchParams.get('deploy');
            } catch (e) { }
        }

        if (!scriptId) return;

        const cached = readCache(scriptId);
        const state = cached
            ? { ...cached, resolved: !!(cached.scriptFileId && cached.deployInternalId) }
            : { scriptFileId: null, deployInternalId: null, deployHref: null, scriptInternalId: null, resolved: false };

        if (!state.scriptInternalId && /^\d+$/.test(scriptId)) state.scriptInternalId = scriptId;

        try {
            if (typeof nlapiSearchRecord !== 'undefined' && scriptId
                && !state.scriptInternalId && !/^\d+$/.test(scriptId)) {
                const found = nlapiSearchRecord('script', null, [['scriptid', 'is', scriptId]]);
                if (found && found[0]) state.scriptInternalId = found[0].getId();
            }

            const sid = state.scriptInternalId;

            if (typeof nlapiSearchRecord !== 'undefined' && sid && !state.deployInternalId) {
                const filters = [['script', 'is', sid]];
                if (deployParam && !/^\d+$/.test(deployParam)) {
                    filters.push('AND', ['scriptid', 'is', deployParam]);
                }
                const result = nlapiSearchRecord('scriptdeployment', null, filters)[0];
                if (result) state.deployInternalId = result.getId();
            }
            if (typeof nlapiLookupField !== 'undefined' && sid && !state.scriptFileId) {
                state.scriptFileId = nlapiLookupField('script', sid, 'scriptfile');
            }
        } catch (e) { }

        if (!state.deployInternalId && deployParam && /^\d+$/.test(deployParam)) {
            state.deployInternalId = deployParam;
        }

        const idle = window.requestIdleCallback || ((cb) => setTimeout(cb, 300));
        idle(() => { ensureScriptRecordResolved(scriptId, deployParam, state); });

        const addClick = (id, handler) => {
            const elem = document.getElementById(id);
            if (elem) elem.addEventListener('click', handler);
        };

        const scriptRecordUrl = () => `${APP_BASE}/app/common/scripting/script.nl?id=`
            + encodeURIComponent(state.scriptInternalId || scriptId);

        addClick('nsft-suitelet-tools-open-script-record', async () => {
            await ensureScriptRecordResolved(scriptId, deployParam, state);
            window.open(scriptRecordUrl());
        });

        addClick('nsft-suitelet-tools-open-deploy-record', async () => {
            await ensureScriptRecordResolved(scriptId, deployParam, state);
            if (state.deployHref) {
                window.open(state.deployHref);
            } else if (state.deployInternalId) {
                window.open(`${APP_BASE}/app/common/scripting/scriptrecord.nl?id=${state.deployInternalId}`);
            } else if (deployParam) {
                window.open(`${APP_BASE}/app/common/scripting/scriptrecord.nl?id=${encodeURIComponent(deployParam)}`);
            } else {
                window.open(scriptRecordUrl());
            }
        });

        addClick('nsft-suitelet-tools-edit-script-file', async () => {
            await ensureScriptRecordResolved(scriptId, deployParam, state);
            if (state.scriptFileId) {
                window.open(`${APP_BASE}/app/common/record/edittextmediaitem.nl?id=${state.scriptFileId}&e=T&l=T&target=filesize&syntaxHighlighting=T`);
            } else {
                window.open(scriptRecordUrl());
            }
        });

        addClick('nsft-suitelet-tools-view-logs', async () => {
            await ensureScriptRecordResolved(scriptId, deployParam, state);
            const target = new URL('/app/common/scripting/scriptnotearchive.nl', APP_BASE);
            target.searchParams.set('daterange', 'ALL');
            target.searchParams.set('date', 'ALL');
            target.searchParams.set('sortcol', 'timestamp');
            target.searchParams.set('sortdir', 'DESC');
            target.searchParams.set('loglevel', '');
            target.searchParams.set('scriptId', state.scriptInternalId || scriptId);
            if (state.deployInternalId) target.searchParams.set('scriptRecordId', state.deployInternalId);
            window.open(target.toString());
        });
    }

    async function ensureScriptRecordResolved(scriptId, deployParam, state) {
        if (state.resolved) return;
        if (state.scriptFileId && state.deployInternalId && state.scriptInternalId) {
            state.resolved = true;
            persistState(scriptId, state);
            return;
        }
        try {
            const html = await fetchScriptHtml(scriptId, state);
            if (!html) { state.resolved = true; return; }
            const doc = new DOMParser().parseFromString(html, 'text/html');

            if (!state.scriptFileId) {
                const fileLink = doc.querySelector('a[href*="edittextmediaitem.nl"]')
                    || doc.querySelector('a[href*="media.nl?id="]');
                if (fileLink) {
                    const m = (fileLink.getAttribute('href') || '').match(/[?&]id=(\d+)/);
                    if (m) state.scriptFileId = m[1];
                }
                if (!state.scriptFileId) {
                    const inlinePreview = html.match(/previewMedia\((\d+)/i);
                    if (inlinePreview) state.scriptFileId = inlinePreview[1];
                }
            }

            if (!state.deployHref) {
                const candidates = [];
                doc.querySelectorAll('a[href*="scriptrecord.nl"]').forEach((a) => {
                    const href = a.getAttribute('href') || '';
                    const idMatch = href.match(/[?&]id=(\d+)/);
                    if (!idMatch) return;
                    candidates.push({
                        id: idMatch[1],
                        text: (a.textContent || '').trim(),
                        href
                    });
                });

                let matched = null;
                if (deployParam && /^\d+$/.test(deployParam)) {
                    matched = candidates.find((c) => c.id === deployParam);
                }
                if (!matched && deployParam && !/^\d+$/.test(deployParam)) {
                    matched = candidates.find((c) =>
                        c.text === deployParam
                        || c.text.toLowerCase() === deployParam.toLowerCase()
                        || c.href.toLowerCase().includes(deployParam.toLowerCase())
                    );
                }
                if (!matched && candidates.length) matched = candidates[0];

                if (matched) {
                    state.deployInternalId = matched.id;
                    state.deployHref = IS_EXTFORMS ? null : matched.href;
                }
            }
            if (!state.scriptInternalId && state.deployInternalId) {
                const depHtml = await fetchHtml(
                    `/app/common/scripting/scriptrecord.nl?id=${encodeURIComponent(state.deployInternalId)}`);
                const m = depHtml && depHtml.match(/script\.nl\?id=(\d+)/i);
                if (m) state.scriptInternalId = m[1];
            }
        } catch (e) {
        } finally {
            state.resolved = true;
            persistState(scriptId, state);
        }
    }

    function fetchScriptHtml(scriptId, state) {
        const internal = (state && state.scriptInternalId) || scriptId;
        return fetchHtml(`/app/common/scripting/script.nl?id=${encodeURIComponent(internal)}`);
    }

    function fetchHtml(path) {
        if (!IS_EXTFORMS) {
            return fetch(path, { credentials: 'same-origin' })
                .then((r) => (r.ok ? r.text() : null))
                .catch(() => null);
        }
        return requestHtmlViaExtension(`${APP_BASE}${path}`);
    }

    function requestHtmlViaExtension(url) {
        return new Promise((resolve) => {
            const reqId = 'st_' + Date.now() + '_' + Math.random().toString(36).slice(2);
            let settled = false;
            const finish = (val) => {
                if (settled) return;
                settled = true;
                window.removeEventListener('message', onMsg);
                resolve(val);
            };
            const onMsg = (ev) => {
                if (ev.source !== window) return;
                const d = ev.data;
                if (!d || d.type !== 'nsft-suitelet-tools-fetch-result' || d.reqId !== reqId) return;
                finish(d.ok && d.text ? d.text : null);
            };
            window.addEventListener('message', onMsg);
            window.postMessage({ type: 'nsft-suitelet-tools-fetch', reqId, url }, '*');
            setTimeout(() => finish(null), 8000);
        });
    }

    function persistState(scriptId, state) {
        if (!state.scriptFileId && !state.deployInternalId) return;
        writeCache(scriptId, {
            scriptFileId: state.scriptFileId,
            deployInternalId: state.deployInternalId,
            deployHref: state.deployHref
        });
    }

    function teardown() {
        while (teardownFns.length) {
            const fn = teardownFns.pop();
            try { fn(); } catch (e) { }
        }
        initialized = false;
    }

})();
