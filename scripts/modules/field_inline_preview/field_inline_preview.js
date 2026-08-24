(function () {
    'use strict';

    function ensureSqlTransport() {
        if (window.NSFT_SuiteQLRest && window.NSFT_SuiteQLRest.ensureTransport) {
            window.NSFT_SuiteQLRest.ensureTransport();
        }
    }

    const STORAGE_KEY = 'enableFieldInlinePreview';
    const NSFT_THEME_KEY = 'nsftTheme';
    const NO_BUTTON_KEY = 'copyIdsNoButton';
    const DELAY_KEY = 'fieldInlinePreviewDelay';
    const TOOLTIP_ID = 'nsft-fip-tooltip';
    const ROOT_ID = 'nsft-fip-root';
    const DEFAULT_DELAY_MS = 200;
    const DELAY_MIN_MS = 0;
    const DELAY_MAX_MS = 2000;
    const HIDE_DELAY_MS = 120;
    const CACHE_TTL_MS = 5 * 60 * 1000;
    const TRANSIENT_TTL_MS = 5 * 1000;
    const FETCH_TIMEOUT_MS = 10 * 1000;
    const CUSTOM_FIELD_RE = /^cust[a-z]+(_|\d)/i;

    const RB = window.NSFT_RecordButtons;

    const _cache = new Map();
    const _typeCache = new Map();
    const _typeFetching = new Set();
    const _legacyFieldInfo = new WeakMap();
    let _theme = 'light';
    let _showDelayMs = DEFAULT_DELAY_MS;
    let _showTimer = null;
    let _hideTimer = null;
    let _currentScriptId = null;
    let _currentContext = null;
    let _currentSublistId = null;
    let _currentLabelEl = null;
    let _fetching = new Set();
    const _fetchTimers = new Map();
    let _recordContext = { recordType: null, recordId: null };
    let _recordContextRequested = false;
    let _noButton = false;
    let _enabled = false;
    let _observerUnsub = null;
    let _moRaf = 0;
    let _moTarget = null;
    let _repositionRaf = 0;
    let _mouseX = 0;
    let _mouseY = 0;

    const CURSOR_OFFSET_X = 16;
    const CURSOR_OFFSET_Y = 16;
    const VIEWPORT_MARGIN = 8;

    chrome.storage.local.get({
        [STORAGE_KEY]: true,
        [NSFT_THEME_KEY]: 'light',
        [NO_BUTTON_KEY]: true,
        [DELAY_KEY]: DEFAULT_DELAY_MS
    }, (items) => {
        _theme = items[NSFT_THEME_KEY] || 'light';
        _noButton = items[NO_BUTTON_KEY] !== false;
        _showDelayMs = normalizeDelay(items[DELAY_KEY]);
        if (!items[STORAGE_KEY]) return;
        if (RB && RB.isExcludedPage && RB.isExcludedPage()) return;
        enable();
    });

    function enable() {
        if (_enabled) return;
        _enabled = true;
        wireHoverListeners();
        wireClickCopy();
        proactiveBlankCopyTitles();
        if (window.NSFT_Observer && typeof window.NSFT_Observer.subscribe === 'function') {
            _observerUnsub = window.NSFT_Observer.subscribe(proactiveBlankCopyTitles, { throttle: 300 });
        }
    }

    function disable() {
        if (!_enabled) return;
        _enabled = false;
        unwireHoverListeners();
        unwireClickCopy();
        if (_observerUnsub) { try { _observerUnsub(); } catch (_) { } _observerUnsub = null; }
        if (_showTimer) { clearTimeout(_showTimer); _showTimer = null; }
        if (_hideTimer) { clearTimeout(_hideTimer); _hideTimer = null; }
        if (_moRaf) { cancelAnimationFrame(_moRaf); _moRaf = 0; }
        _moTarget = null;
        hideTooltip();
    }

    function proactiveBlankCopyTitles() {
        document.querySelectorAll('.nsft-copy-record-type[title]').forEach((el) => {
            if (!el.dataset.nsftRecordSid) {
                const title = el.getAttribute('title') || '';
                const first = title.split('\n')[0].trim();
                if (first && /^[a-z0-9_]+$/i.test(first)) {
                    el.dataset.nsftRecordSid = first;
                }
            }
            suppressNativeTitles(el);
        });
        document.querySelectorAll('.nsft-copy-fs-id-sublist[title]')
            .forEach((el) => suppressNativeTitles(el));
        document.querySelectorAll('.nsft-copy-fs-id-field[title]').forEach((el) => {
            if (!el.dataset.nsftFieldSid) {
                const title = el.getAttribute('title') || '';
                const first = title.split('\n')[0].trim();
                if (first && /^[a-z0-9_]+$/i.test(first)) {
                    el.dataset.nsftFieldSid = first;
                }
            }
            suppressNativeTitles(el);
        });
    }

    chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== 'local') return;
        if (changes[NSFT_THEME_KEY]) {
            _theme = changes[NSFT_THEME_KEY].newValue || 'light';
            const tip = document.getElementById(TOOLTIP_ID);
            if (tip) tip.setAttribute('data-theme', resolveTheme());
        }
        if (changes[NO_BUTTON_KEY]) {
            _noButton = changes[NO_BUTTON_KEY].newValue === true;
        }
        if (changes[DELAY_KEY]) {
            _showDelayMs = normalizeDelay(changes[DELAY_KEY].newValue);
        }
        if (changes[STORAGE_KEY]) {
            const on = changes[STORAGE_KEY].newValue !== false;
            if (on) {
                if (!(RB && RB.isExcludedPage && RB.isExcludedPage())) enable();
            } else {
                disable();
            }
        }
    });

    function resolveTheme() {
        return _theme === 'dark' ? 'dark' : 'light';
    }

    let _fetcherInjected = false;
    function ensureFetcher() {
        if (_fetcherInjected) return;
        _fetcherInjected = true;
        ensureSqlTransport();
        const s = document.createElement('script');
        s.async = false;
        s.src = chrome.runtime.getURL('scripts/modules/field_inline_preview/field_inline_preview_fetcher.js');
        s.onload = function () { this.remove(); };
        (document.head || document.documentElement).appendChild(s);
    }

    window.addEventListener('message', (event) => {
        if (event.source !== window) return;
        const data = event.data;
        if (!data || data.dest !== 'extension_fip') return;

        if (data.type === 'fieldInfoResult') {
            const payload = data.payload || {};
            const scriptid = (payload.scriptid || '').toLowerCase();
            if (!scriptid) return;

            _fetching.delete(scriptid);
            clearFetchTimer(scriptid);
            _cache.set(scriptid, {
                rows: payload.rows || [],
                error: payload.error || null,
                ts: Date.now()
            });

            if (
                _currentScriptId && _currentScriptId.toLowerCase() === scriptid &&
                (_currentContext === 'body' || _currentContext === 'sublistcol')
            ) {
                renderTooltip(scriptid, _currentContext);
                if (_currentLabelEl) positionTooltipAtCursor();
            }
        } else if (data.type === 'fieldTypeResult') {
            const p = data.payload || {};
            const sid = (p.scriptid || '').toLowerCase();
            if (!sid) return;
            const key = typeKey(sid, p.context || 'body', p.sublistId || '');
            _typeFetching.delete(key);
            _typeCache.set(key, p.type || null);
            if (
                _currentScriptId && _currentScriptId.toLowerCase() === sid &&
                (_currentContext === 'body' || _currentContext === 'sublistcol')
            ) {
                renderTooltip(_currentScriptId, _currentContext);
                if (_currentLabelEl) positionTooltipAtCursor();
            }
        } else if (data.type === 'recordContextResult') {
            const p = data.payload || {};
            _recordContext = {
                recordType: p.recordType || null,
                recordId: p.recordId || null
            };
        }
    });

    function requestRecordContext() {
        window.postMessage({ dest: 'fetcher_fip', type: 'getRecordContext' }, '*');
    }

    function wireHoverListeners() {
        document.addEventListener('mouseover', onMouseOver, true);
        document.addEventListener('mouseout', onMouseOut, true);
        document.addEventListener('mousemove', onMouseMove, true);
        document.addEventListener('keydown', onKeyDown, true);
    }

    function unwireHoverListeners() {
        document.removeEventListener('mouseover', onMouseOver, true);
        document.removeEventListener('mouseout', onMouseOut, true);
        document.removeEventListener('mousemove', onMouseMove, true);
        document.removeEventListener('keydown', onKeyDown, true);
    }

    function onMouseMove(e) {
        _mouseX = e.clientX;
        _mouseY = e.clientY;
        const tip = document.getElementById(TOOLTIP_ID);
        if (!tip) return;
        if (tip.contains(e.target)) return;
        if (_repositionRaf) return;
        _repositionRaf = requestAnimationFrame(() => {
            _repositionRaf = 0;
            if (document.getElementById(TOOLTIP_ID)) positionTooltipAtCursor();
        });
    }

    function onMouseOver(e) {
        _mouseX = e.clientX;
        _mouseY = e.clientY;
        _moTarget = e.target;
        if (_moRaf) return;
        _moRaf = requestAnimationFrame(() => {
            _moRaf = 0;
            const target = _moTarget;
            _moTarget = null;
            if (!target) return;
            const hit = findHoverTarget(target);
            if (!hit) return;
            ensureFetcher();
            if (_recordContext.recordType === null && !_recordContextRequested) {
                _recordContextRequested = true;
                setTimeout(requestRecordContext, 50);
            }
            scheduleShow(hit.el, hit.scriptid, hit.context, hit.sublistId || null, hit.domType || '');
        });
    }

    function onMouseOut(e) {
        const hit = findHoverTarget(e.target);
        if (!hit) return;
        scheduleHide();
    }

    function onKeyDown(e) {
        if (e.key === 'Escape' && document.getElementById(TOOLTIP_ID)) {
            hideTooltip();
        }
    }

    function findHoverTarget(target) {
        if (!target || target.nodeType !== 1) return null;

        const nsftFieldBtn = target.closest && target.closest('.nsft-copy-fs-id-field');
        if (nsftFieldBtn) {
            const fieldWrap = nsftFieldBtn.closest('.uir-field-wrapper[data-field-name]');
            const domType = fieldWrap ? (fieldWrap.getAttribute('data-field-type') || '') : '';
            let fid = (nsftFieldBtn.dataset.nsftFieldSid || '').toLowerCase();
            if (!fid && fieldWrap) {
                fid = (fieldWrap.getAttribute('data-field-name') || '').toLowerCase();
            }
            if (!fid) {
                const title = nsftFieldBtn.getAttribute('title') || '';
                const first = title.split('\n')[0].trim();
                if (first && /^[a-z0-9_]+$/i.test(first)) {
                    fid = first.toLowerCase();
                    nsftFieldBtn.dataset.nsftFieldSid = fid;
                }
            }
            if (fid) {
                suppressNativeTitles(nsftFieldBtn);
                let sublistId = '';
                const layer = nsftFieldBtn.closest('[data-nsps-layer^="recmach"]');
                if (layer) sublistId = (layer.getAttribute('data-nsps-layer') || '').toLowerCase();
                if (!sublistId) {
                    const splits = nsftFieldBtn.closest('table[id$="_splits"]');
                    if (splits) sublistId = splits.id.replace(/_splits$/, '').toLowerCase();
                }
                if (sublistId) {
                    return { el: nsftFieldBtn, context: 'sublistcol', scriptid: fid, sublistId, domType };
                }
                return { el: nsftFieldBtn, context: 'body', scriptid: fid, domType };
            }
        }

        let wrapper = target.closest && target.closest('.uir-field-wrapper[data-field-name]');
        if (wrapper) {
            const fieldName = wrapper.getAttribute('data-field-name') || '';
            const domType = wrapper.getAttribute('data-field-type') || '';
            if (fieldName) {
                const label = target.closest && target.closest('.uir-label-span, span[id$="_lbl"]');
                if (label && wrapper.contains(label)) {
                    suppressNativeTitles(label);
                    const sublistLayer = wrapper.closest('[data-nsps-layer^="recmach"]');
                    if (sublistLayer) {
                        const sublistId = (sublistLayer.getAttribute('data-nsps-layer') || '').toLowerCase();
                        if (sublistId) {
                            return {
                                el: label,
                                context: 'sublistcol',
                                scriptid: fieldName.toLowerCase(),
                                sublistId,
                                domType
                            };
                        }
                    }
                    return { el: label, context: 'body', scriptid: fieldName.toLowerCase(), domType };
                }
            }
        }

        const legacy = target.closest && target.closest('span[id$="_lbl"]');
        if (legacy) {
            let info = _legacyFieldInfo.get(legacy);
            if (!info) {
                info = { fieldId: null };
                const a = legacy.querySelector('a[onclick*="nlFieldHelp"]');
                if (a) {
                    const m = String(a.getAttribute('onclick') || '').match(/['"]([^'"]*?)['"]\s*,\s*['"]([^'"]*?)['"]/);
                    if (m && m[2]) info.fieldId = m[2].toLowerCase();
                }
                _legacyFieldInfo.set(legacy, info);
            }
            if (info.fieldId) {
                suppressNativeTitles(legacy);
                return { el: legacy, context: 'body', scriptid: info.fieldId };
            }
        }

        const nsftSublistBtn = target.closest && target.closest('.nsft-copy-fs-id-sublist');
        if (nsftSublistBtn) {
            const sid = (nsftSublistBtn.getAttribute('data-layer') || '').trim();
            if (sid) {
                suppressNativeTitles(nsftSublistBtn);
                return { el: nsftSublistBtn, context: 'sublist', scriptid: sid.toLowerCase() };
            }
        }

        const nsftRecordBtn = target.closest && target.closest('.nsft-copy-record-type');
        if (nsftRecordBtn) {
            let sid = _recordContext.recordType || nsftRecordBtn.dataset.nsftRecordSid || '';
            if (!sid) {
                const title = nsftRecordBtn.getAttribute('title') || '';
                const first = title.split('\n')[0].trim();
                if (first && /^[a-z0-9_]+$/i.test(first)) {
                    sid = first;
                    nsftRecordBtn.dataset.nsftRecordSid = first;
                }
            }
            if (sid) {
                suppressNativeTitles(nsftRecordBtn);
                return { el: nsftRecordBtn, context: 'record', scriptid: String(sid).toLowerCase() };
            }
        }

        return null;
    }

    function suppressNativeTitles(labelEl) {
        try {
            if (labelEl.hasAttribute('title')) labelEl.removeAttribute('title');
            if (labelEl.dataset && labelEl.dataset.nsftTitleStripped === '1') return;
            labelEl.querySelectorAll('[title]').forEach((el) => el.removeAttribute('title'));
            if (labelEl.dataset) labelEl.dataset.nsftTitleStripped = '1';
        } catch (_) { }
    }

    function scheduleShow(labelEl, scriptid, context, sublistId, domType) {
        if (_hideTimer) { clearTimeout(_hideTimer); _hideTimer = null; }
        if (_currentScriptId === scriptid && _currentContext === context && _currentSublistId === (sublistId || null)) return;
        if (_showTimer) clearTimeout(_showTimer);

        _showTimer = setTimeout(() => {
            _showTimer = null;
            _currentScriptId = scriptid;
            _currentContext = context;
            _currentSublistId = sublistId || null;
            _currentLabelEl = labelEl;
            const isCustom = CUSTOM_FIELD_RE.test(scriptid);
            if ((context === 'body' || context === 'sublistcol') && !isCustom && domType) {
                _typeCache.set(typeKey(scriptid, context, sublistId || ''), domType);
            }
            renderTooltip(scriptid, context);
            positionTooltipAtCursor();
            if (context === 'body' || context === 'sublistcol') {
                if (isCustom) ensureFetched(scriptid);
                else if (!domType) ensureFieldType(scriptid, context, sublistId);
            }
        }, _showDelayMs);
    }

    function scheduleHide() {
        if (_showTimer) { clearTimeout(_showTimer); _showTimer = null; }
        if (_hideTimer) clearTimeout(_hideTimer);
        _hideTimer = setTimeout(() => {
            _hideTimer = null;
            hideTooltip();
        }, HIDE_DELAY_MS);
    }

    function hideTooltip() {
        const tip = document.getElementById(TOOLTIP_ID);
        if (tip) tip.remove();
        detachRepositionListeners();
        _currentScriptId = null;
        _currentContext = null;
        _currentSublistId = null;
        _currentLabelEl = null;
    }

    function ensureFetched(scriptid) {
        const key = scriptid.toLowerCase();
        if (getFreshCache(key)) return;
        if (_fetching.has(key)) return;
        _fetching.add(key);

        _fetchTimers.set(key, setTimeout(() => {
            _fetchTimers.delete(key);
            if (!_fetching.has(key)) return;
            _fetching.delete(key);
            _cache.set(key, {
                rows: [],
                error: i18n('fip_timeout', 'NetSuite is taking too long. Hover again to retry.'),
                ts: Date.now(),
                transient: true
            });
            if (_currentScriptId && _currentScriptId.toLowerCase() === key &&
                (_currentContext === 'body' || _currentContext === 'sublistcol')) {
                renderTooltip(key, _currentContext);
                if (_currentLabelEl) positionTooltipAtCursor();
            }
        }, FETCH_TIMEOUT_MS));

        window.postMessage({
            dest: 'fetcher_fip',
            type: 'getFieldInfo',
            payload: { scriptid: key }
        }, '*');
    }

    function clearFetchTimer(key) {
        const t = _fetchTimers.get(key);
        if (t) { clearTimeout(t); _fetchTimers.delete(key); }
    }

    function getFreshCache(key) {
        const c = _cache.get(key);
        if (!c) return null;
        const ttl = c.transient ? TRANSIENT_TTL_MS : CACHE_TTL_MS;
        if (Date.now() - (c.ts || 0) >= ttl) { _cache.delete(key); return null; }
        return c;
    }

    function typeKey(scriptid, context, sublistId) {
        return (context || 'body') + '|' + (sublistId || '') + '|' + String(scriptid).toLowerCase();
    }

    function ensureFieldType(scriptid, context, sublistId) {
        const key = typeKey(scriptid, context, sublistId);
        if (_typeCache.has(key) || _typeFetching.has(key)) return;
        _typeFetching.add(key);
        window.postMessage({
            dest: 'fetcher_fip',
            type: 'getFieldType',
            payload: { scriptid: String(scriptid).toLowerCase(), context: context || 'body', sublistId: sublistId || '' }
        }, '*');
    }

    function ensureRoot() {
        let root = document.getElementById(ROOT_ID);
        if (!root) {
            root = document.createElement('div');
            root.id = ROOT_ID;
            document.body.appendChild(root);
        }
        return root;
    }

    function ensureTooltipEl() {
        let tip = document.getElementById(TOOLTIP_ID);
        if (tip) return tip;
        tip = document.createElement('div');
        tip.id = TOOLTIP_ID;
        tip.className = 'nsft-fip-tooltip';
        tip.setAttribute('data-theme', resolveTheme());
        const header = document.createElement('div');
        header.className = 'nsft-fip-scriptid';
        const body = document.createElement('div');
        body.className = 'nsft-fip-body';
        tip.appendChild(header);
        tip.appendChild(body);
        tip.addEventListener('mouseenter', () => {
            if (_hideTimer) { clearTimeout(_hideTimer); _hideTimer = null; }
        });
        tip.addEventListener('mouseleave', scheduleHide);
        ensureRoot().appendChild(tip);
        attachRepositionListeners();
        return tip;
    }

    function attachRepositionListeners() {
        window.addEventListener('scroll', onScrollOrResize, true);
        window.addEventListener('resize', onScrollOrResize);
    }

    function detachRepositionListeners() {
        window.removeEventListener('scroll', onScrollOrResize, true);
        window.removeEventListener('resize', onScrollOrResize);
        if (_repositionRaf) { cancelAnimationFrame(_repositionRaf); _repositionRaf = 0; }
    }

    function onScrollOrResize() {
        if (_repositionRaf) return;
        _repositionRaf = requestAnimationFrame(() => {
            _repositionRaf = 0;
            if (_currentLabelEl && document.getElementById(TOOLTIP_ID)) {
                positionTooltipAtCursor();
            }
        });
    }

    function positionTooltipAtCursor() {
        const tip = ensureTooltipEl();
        const tipRect = tip.getBoundingClientRect();
        const tipW = tipRect.width || 240;
        const tipH = tipRect.height || 140;
        const vw = document.documentElement.clientWidth;
        const vh = document.documentElement.clientHeight;

        let left = _mouseX + CURSOR_OFFSET_X;
        let top = _mouseY + CURSOR_OFFSET_Y;

        if (left + tipW + VIEWPORT_MARGIN > vw) {
            left = _mouseX - tipW - CURSOR_OFFSET_X;
        }
        if (left < VIEWPORT_MARGIN) left = VIEWPORT_MARGIN;

        if (top + tipH + VIEWPORT_MARGIN > vh) {
            tip.classList.add('nsft-fip-above');
            top = _mouseY - tipH - CURSOR_OFFSET_Y;
        } else {
            tip.classList.remove('nsft-fip-above');
        }
        if (top < VIEWPORT_MARGIN) top = VIEWPORT_MARGIN;

        tip.style.left = `${window.scrollX + left}px`;
        tip.style.top = `${window.scrollY + top}px`;
    }

    function renderTooltip(scriptid, context) {
        const tip = ensureTooltipEl();
        context = context || 'body';
        const header = tip.querySelector('.nsft-fip-scriptid');
        const body = tip.querySelector('.nsft-fip-body');
        if (header && header.textContent !== scriptid) header.textContent = scriptid;
        if (body) body.innerHTML = buildTooltipBody(scriptid, context);
    }

    function buildTooltipBody(scriptid, context) {
        if (context === 'sublist') {
            return `
                <div class="nsft-fip-row-block">
                    <div class="nsft-fip-pair">
                        <span class="nsft-fip-pair-label">${escapeHtml(i18n('fip_kind', 'Kind'))}</span>
                        <span class="nsft-fip-pair-value">${escapeHtml(i18n('fip_kind_sublist', 'Sublist'))}</span>
                    </div>
                </div>
                ${renderCopyHint()}
            `;
        }

        if (context === 'record') {
            return `
                <div class="nsft-fip-row-block">
                    <div class="nsft-fip-pair">
                        <span class="nsft-fip-pair-label">${escapeHtml(i18n('fip_kind', 'Kind'))}</span>
                        <span class="nsft-fip-pair-value">${escapeHtml(i18n('fip_kind_record', 'Record type'))}</span>
                    </div>
                </div>
                ${renderCopyHint()}
            `;
        }

        if (!CUSTOM_FIELD_RE.test(scriptid)) {
            return `
                ${renderTypeLine(scriptid, context)}
                ${renderSublistLine(context)}
                ${renderCopyHint()}
            `;
        }

        const cached = getFreshCache(scriptid.toLowerCase());

        if (!cached) {
            return `
                <div class="nsft-fip-loading">${escapeHtml(i18n('fip_loading', 'Loading…'))}</div>
                ${renderSublistLine(context)}
                ${renderCopyHint()}
            `;
        }

        if (cached.error) {
            return `
                <div class="nsft-fip-error">${escapeHtml(cached.error)}</div>
                ${renderSublistLine(context)}
                ${renderCopyHint()}
            `;
        }

        const rows = cached.rows || [];
        if (!rows.length) {
            return `
                <div class="nsft-fip-empty">${escapeHtml(i18n('fip_not_found', 'No metadata found'))}</div>
                ${renderSublistLine(context)}
                ${renderCopyHint()}
            `;
        }

        const blocks = rows.map(r => renderRowBlock(r)).join('');
        return `
            ${blocks}
            ${renderSublistLine(context)}
            ${renderCopyHint()}
        `;
    }

    function renderTypeLine(scriptid, context) {
        const type = _typeCache.get(typeKey(scriptid, context, _currentSublistId));
        if (!type) return '';
        return `
            <div class="nsft-fip-row-block">
                <div class="nsft-fip-pair">
                    <span class="nsft-fip-pair-label">${escapeHtml(i18n('fip_type', 'Type'))}</span>
                    <span class="nsft-fip-pair-value">${escapeHtml(friendlyFieldType(type))}</span>
                </div>
            </div>
        `;
    }

    function renderSublistLine(context) {
        if (context !== 'sublistcol' || !_currentSublistId) return '';
        return `
            <div class="nsft-fip-row-block">
                <div class="nsft-fip-pair">
                    <span class="nsft-fip-pair-label">${escapeHtml(i18n('fip_sublist', 'Sublist'))}</span>
                    <span class="nsft-fip-pair-value">${escapeHtml(_currentSublistId)}</span>
                </div>
            </div>
        `;
    }

    function renderCopyHint() {
        const K = window.NSFT_MacKeys || { mod: 'Ctrl', alt: 'Alt', shift: 'Shift' };
        const idLine = _noButton
            ? `<span><kbd>${escapeHtml(K.shift)}</kbd>+click: ${escapeHtml(i18n('fip_copy_hint_id', 'copiar ID'))}</span>`
            : '';
        return `
            <div class="nsft-fip-copyhint">
                ${idLine}
                <span><kbd>${escapeHtml(K.mod)}</kbd>+click: ${escapeHtml(i18n('fip_copy_hint_ss2', 'copy SS2 snippet'))}</span>
                <span><kbd>${escapeHtml(K.alt)}</kbd>+click: ${escapeHtml(i18n('fip_copy_hint_ss1', 'copy SS1 snippet'))}</span>
            </div>
        `;
    }

    function renderRowBlock(r) {
        const pairs = [];
        const type = r.fieldtype || r.fieldvaluetype;
        if (type) {
            pairs.push(pair(i18n('fip_type', 'Type'), friendlyFieldType(type)));
        }
        if (r.fieldvaluetyperecord) {
            pairs.push(pair(i18n('fip_sourcelist', 'Source list'), r.fieldvaluetyperecordname || r.fieldvaluetyperecord));
        }
        if (String(r.isinactive || '').toUpperCase() === 'T') {
            pairs.push(`<div class="nsft-fip-badge nsft-fip-badge-inactive">${escapeHtml(i18n('fip_inactive', 'Inactive'))}</div>`);
        }
        if (r.help) {
            pairs.push(`
                <div class="nsft-fip-help">
                    <span class="nsft-fip-pair-label">${escapeHtml(i18n('fip_help', 'Help'))}</span>
                    <span class="nsft-fip-help-text">${escapeHtml(r.help)}</span>
                </div>
            `);
        }
        return `<div class="nsft-fip-row-block">${pairs.join('')}</div>`;
    }

    function pair(label, value) {
        return `
            <div class="nsft-fip-pair">
                <span class="nsft-fip-pair-label">${escapeHtml(label)}</span>
                <span class="nsft-fip-pair-value">${escapeHtml(value)}</span>
            </div>
        `;
    }

    function wireClickCopy() {
        document.addEventListener('click', onClickCapture, true);
    }

    function unwireClickCopy() {
        document.removeEventListener('click', onClickCapture, true);
    }

    function onClickCapture(e) {
        if (e.button !== 0) return;

        if (_showTimer) { clearTimeout(_showTimer); _showTimer = null; }
        const _tip = document.getElementById(TOOLTIP_ID);
        if (_tip && !_tip.contains(e.target)) {
            if (_hideTimer) { clearTimeout(_hideTimer); _hideTimer = null; }
            hideTooltip();
        }

        const useCtrl = e.ctrlKey || e.metaKey;
        const useAlt = e.altKey;
        const useShift = _noButton && e.shiftKey && !useCtrl && !useAlt;
        if (!useCtrl && !useAlt && !useShift) return;

        const hit = findHoverTarget(e.target);
        if (!hit) return;

        if (useShift) {
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();
            copyToClipboard(hit.scriptid);
            return;
        }

        const snippets = getSnippets(hit);
        if (!snippets) return;

        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();

        const snippet = useAlt ? snippets.ss1 : snippets.ss2;
        copyToClipboard(snippet);
    }

    function getSnippets(hit) {
        const { context, scriptid, sublistId } = hit;
        if (context === 'body') {
            return {
                ss2: `record.getValue({ fieldId: '${scriptid}' });`,
                ss1: `record.getFieldValue('${scriptid}');`
            };
        }
        if (context === 'sublist') {
            return {
                ss2: `record.getLineCount({ sublistId: '${scriptid}' });`,
                ss1: `record.getLineItemCount('${scriptid}');`
            };
        }
        if (context === 'record') {
            return {
                ss2: `record.load({ type: '${scriptid}', id: recordId });`,
                ss1: `nlapiLoadRecord('${scriptid}', recordId);`
            };
        }
        if (context === 'sublistcol' && sublistId) {
            return {
                ss2: `record.getSublistValue({ sublistId: '${sublistId}', fieldId: '${scriptid}', line: i });`,
                ss1: `record.getLineItemValue('${sublistId}', '${scriptid}', i);`
            };
        }
        return null;
    }

    function copyToClipboard(text) {
        if (window.NSFT_Clipboard && typeof window.NSFT_Clipboard.copy === 'function') {
            window.NSFT_Clipboard.copy(text, { toast: true });
        } else if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text);
        }
    }

    function i18n(key, fallback) {
        const msg = chrome.i18n.getMessage(key);
        return msg || fallback || key;
    }

    function normalizeDelay(value) {
        const n = parseInt(value, 10);
        if (isNaN(n)) return DEFAULT_DELAY_MS;
        return Math.min(DELAY_MAX_MS, Math.max(DELAY_MIN_MS, n));
    }

    const FIELD_TYPE_I18N = {
        checkbox: 'fip_ftype_checkbox',
        date: 'fip_ftype_date',
        datetime: 'fip_ftype_datetime', datetimetz: 'fip_ftype_datetime',
        timeofday: 'fip_ftype_timeofday', time: 'fip_ftype_timeofday',
        select: 'fip_ftype_select', list: 'fip_ftype_select',
        multiselect: 'fip_ftype_multiselect',
        text: 'fip_ftype_text', freeformtext: 'fip_ftype_text',
        textarea: 'fip_ftype_textarea',
        longtext: 'fip_ftype_longtext', clobtext: 'fip_ftype_longtext',
        richtext: 'fip_ftype_richtext',
        inlinehtml: 'fip_ftype_html', html: 'fip_ftype_html',
        percent: 'fip_ftype_percent',
        currency: 'fip_ftype_currency',
        float: 'fip_ftype_float', decimalnumber: 'fip_ftype_float', decimal: 'fip_ftype_float',
        integer: 'fip_ftype_integer', integernumber: 'fip_ftype_integer',
        email: 'fip_ftype_email', emailaddress: 'fip_ftype_email',
        phone: 'fip_ftype_phone', phonenumber: 'fip_ftype_phone',
        url: 'fip_ftype_url', hyperlink: 'fip_ftype_url',
        image: 'fip_ftype_image',
        file: 'fip_ftype_file', document: 'fip_ftype_file',
        password: 'fip_ftype_password',
        radio: 'fip_ftype_radio'
    };

    function friendlyFieldType(raw) {
        const norm = String(raw || '').toLowerCase().replace(/[^a-z0-9]/g, '');
        const key = FIELD_TYPE_I18N[norm];
        return key ? i18n(key, String(raw)) : String(raw);
    }

    function escapeHtml(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }
})();
