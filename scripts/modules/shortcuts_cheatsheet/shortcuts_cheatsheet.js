(function () {
    'use strict';

    const STORAGE_KEY = 'enableShortcutsCheatsheet';
    const THEME_KEY = 'nsftTheme';
    const MODAL_ID = 'nsft-cheatsheet-modal';

    let _theme = 'light';
    let _enabled = false;
    let _registryOff = null;
    let _lastFocus = null;
    let _renderCache = null;

    if (window.NSFT_RecordButtons && window.NSFT_RecordButtons.isHeaderlessPage &&
        window.NSFT_RecordButtons.isHeaderlessPage()) {
        return;
    }

    const IS_MAC = /Mac|iPhone|iPad/i.test(navigator.platform || navigator.userAgent || '');
    const MOD = IS_MAC ? 'Cmd' : 'Ctrl';

    const STATIC_GROUPS = [
        {
            groupKey: 'cheatsheet_group_global',
            groupFallback: 'Global (on any NetSuite page)',
            items: [
                { labelKey: 'cheatsheet_item_help', labelFallback: 'Show this cheat sheet', combo: 'Mod+Shift+?', context: 'global', action: null }
            ]
        },
        {
            groupKey: 'cheatsheet_group_sql',
            groupFallback: 'SuiteQL Runner',
            items: [
                { labelKey: 'cheatsheet_item_run',          labelFallback: 'Run query',              combo: 'Mod+Enter',   context: 'sql-runner', action: 'nsft-show-suiteql-runner' },
                { labelKey: 'cheatsheet_item_save',         labelFallback: 'Save query',             combo: 'Mod+S',       context: 'sql-runner', action: 'nsft-show-suiteql-runner' },
                { labelKey: 'cheatsheet_item_saveas',       labelFallback: 'Save as…',               combo: 'Mod+Shift+S', context: 'sql-runner', action: 'nsft-show-suiteql-runner' },
                { labelKey: 'cheatsheet_item_open',         labelFallback: 'Open saved query',       combo: 'Mod+O',       context: 'sql-runner', action: 'nsft-show-suiteql-runner' },
                { labelKey: 'cheatsheet_item_format',       labelFallback: 'Format query',           combo: 'Mod+Shift+F', context: 'sql-runner', action: 'nsft-show-suiteql-runner' },
                { labelKey: 'cheatsheet_item_find',         labelFallback: 'Find in editor',         combo: 'Mod+F',       context: 'sql-runner', action: 'nsft-show-suiteql-runner' },
                { labelKey: 'cheatsheet_item_autocomplete', labelFallback: 'Show suggestions',       combo: 'Mod+Space',   context: 'sql-runner', action: 'nsft-show-suiteql-runner' },
                { labelKey: 'cheatsheet_item_download',     labelFallback: 'Download as .sql',       combo: 'Mod+Shift+D', context: 'sql-runner', action: 'nsft-show-suiteql-runner' },
                { labelKey: 'cheatsheet_item_exportres',    labelFallback: 'Export results',         combo: 'Mod+Shift+E', context: 'sql-runner', action: 'nsft-show-suiteql-runner' },
                { labelKey: 'cheatsheet_item_copyres',      labelFallback: 'Copy results',           combo: 'Mod+Shift+C', context: 'sql-runner', action: 'nsft-show-suiteql-runner' },
                { labelKey: 'cheatsheet_item_schema',       labelFallback: 'Toggle Schema explorer', combo: 'Mod+B',       context: 'sql-runner', action: 'nsft-show-suiteql-runner' },
                { labelKey: 'cheatsheet_item_refresh',      labelFallback: 'Refresh schema',         combo: 'Mod+Shift+K', context: 'sql-runner', action: 'nsft-show-suiteql-runner' },
                { labelKey: 'cheatsheet_item_import',       labelFallback: 'Import queries',         combo: 'Mod+Shift+G', context: 'sql-runner', action: 'nsft-show-suiteql-runner' },
                { labelKey: 'cheatsheet_item_export',       labelFallback: 'Export queries',         combo: 'Mod+Shift+Y', context: 'sql-runner', action: 'nsft-show-suiteql-runner' },
                { labelKey: 'cheatsheet_item_exit',         labelFallback: 'Close runner',           combo: 'Mod+Shift+X', context: 'sql-runner', action: 'nsft-show-suiteql-runner' },
                { labelKey: 'cheatsheet_item_hide_editor',  labelFallback: 'Toggle editor panel',    combo: 'Mod+Shift+1', context: 'sql-runner', action: 'nsft-show-suiteql-runner' },
                { labelKey: 'cheatsheet_item_hide_results', labelFallback: 'Toggle results panel',   combo: 'Mod+Shift+2', context: 'sql-runner', action: 'nsft-show-suiteql-runner' }
            ]
        },
        {
            groupKey: 'cheatsheet_group_sublists',
            groupFallback: 'Sublist paging',
            items: [
                { labelKey: 'cheatsheet_item_sp_firstlast', labelFallback: 'First / last page (focus on paging bar)',     combo: 'Home / End', context: 'global', action: null },
                { labelKey: 'cheatsheet_item_sp_prevnext',  labelFallback: 'Previous / next page (focus on paging bar)',  combo: '← / →',      context: 'global', action: null },
                { labelKey: 'cheatsheet_item_sp_global',    labelFallback: 'Previous / next page of the visible sublist', combo: 'Mod+← / Mod+→', context: 'global', action: null }
            ]
        }
    ];

    chrome.storage.local.get({ [STORAGE_KEY]: true, [THEME_KEY]: 'light' }, (settings) => {
        _theme = settings[THEME_KEY] || 'light';
        if (settings[STORAGE_KEY]) enable();
    });

    chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== 'local') return;
        if (changes[THEME_KEY]) {
            _theme = changes[THEME_KEY].newValue || 'light';
            const open = document.getElementById(MODAL_ID);
            if (open) open.setAttribute('data-theme', resolveTheme());
        }
        if (changes[STORAGE_KEY]) {
            if (changes[STORAGE_KEY].newValue) enable();
            else disable();
        }
    });

    function resolveTheme() {
        return _theme === 'dark' ? 'dark' : 'light';
    }

    function onKeydown(e) {
        if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === '/' || e.key === '?')) {
            e.preventDefault();
            if (window.NSFT_ShortcutCoach) window.NSFT_ShortcutCoach.noteUsed('shortcuts_cheatsheet');
            toggleCheatsheet();
            return;
        }
        if (e.key === 'Escape' && document.getElementById(MODAL_ID)) {
            e.preventDefault();
            closeCheatsheet();
        }
    }

    function onToolsMenuEvent() {
        if (document.getElementById(MODAL_ID)) return;
        openCheatsheet();
        if (window.NSFT_ShortcutCoach) window.NSFT_ShortcutCoach.hint('shortcuts_cheatsheet');
    }

    function publishShortcutToRegistry() {
        if (!window.NSFT_Shortcuts) return;
        window.NSFT_Shortcuts.unregisterModule('shortcuts_cheatsheet');
        window.NSFT_Shortcuts.register(
            'shortcuts_cheatsheet',
            i18n('cheatsheet_item_help', 'Show this cheat sheet'),
            'Mod+Shift+?',
            {
                group: i18n('cheatsheet_group_global', 'Global (on any NetSuite page)'),
                configurable: false,
                order: 10
            }
        );
    }

    function onRegistryChange() {
        _renderCache = null;
        const open = document.getElementById(MODAL_ID);
        if (open) rerenderInPlace(open);
    }

    function enable() {
        if (_enabled) return;
        _enabled = true;
        document.addEventListener('keydown', onKeydown, true);
        window.addEventListener('nsft-show-cheatsheet', onToolsMenuEvent);
        if (window.NSFT_Shortcuts) {
            _registryOff = window.NSFT_Shortcuts.onChange(onRegistryChange);
            publishShortcutToRegistry();
        }
    }

    function disable() {
        if (!_enabled) return;
        _enabled = false;
        document.removeEventListener('keydown', onKeydown, true);
        window.removeEventListener('nsft-show-cheatsheet', onToolsMenuEvent);
        if (_registryOff) { _registryOff(); _registryOff = null; }
        if (window.NSFT_Shortcuts) window.NSFT_Shortcuts.unregisterModule('shortcuts_cheatsheet');
        closeCheatsheet();
    }

    function toggleCheatsheet() {
        if (document.getElementById(MODAL_ID)) closeCheatsheet();
        else openCheatsheet();
    }

    function closeCheatsheet() {
        const el = document.getElementById(MODAL_ID);
        if (!el) return;
        el.remove();
        if (_lastFocus && typeof _lastFocus.focus === 'function') {
            try { _lastFocus.focus(); } catch (_) {}
        }
        _lastFocus = null;
    }

    function openCheatsheet() {
        _lastFocus = document.activeElement;

        const overlay = document.createElement('div');
        overlay.id = MODAL_ID;
        overlay.className = 'nsft-cheatsheet-overlay';
        overlay.setAttribute('data-theme', resolveTheme());
        overlay.innerHTML = getRenderedHtml();
        overlay.addEventListener('click', (ev) => {
            if (ev.target === overlay) closeCheatsheet();
        });
        overlay.addEventListener('keydown', trapFocus, true);

        document.body.appendChild(overlay);
        wireOverlayInteractions(overlay);

        const search = overlay.querySelector('.nsft-cheatsheet-search-input');
        const closeBtn = overlay.querySelector('.nsft-cheatsheet-close');
        (search || closeBtn || overlay).focus();
    }

    function rerenderInPlace(overlay) {
        const wasFocusedSelector = document.activeElement && document.activeElement.classList
            && document.activeElement.classList.contains('nsft-cheatsheet-search-input');
        const previousFilter = overlay.querySelector('.nsft-cheatsheet-search-input');
        const filterText = previousFilter ? previousFilter.value : '';
        const caret = previousFilter ? previousFilter.selectionStart : null;

        overlay.innerHTML = getRenderedHtml();
        wireOverlayInteractions(overlay);

        if (filterText) {
            const next = overlay.querySelector('.nsft-cheatsheet-search-input');
            if (next) {
                next.value = filterText;
                applyFilter(overlay, filterText);
                if (wasFocusedSelector) {
                    next.focus();
                    if (caret != null) { try { next.setSelectionRange(caret, caret); } catch (_) {} }
                }
            }
        }
    }

    function wireOverlayInteractions(overlay) {
        const closeBtn = overlay.querySelector('.nsft-cheatsheet-close');
        if (closeBtn) closeBtn.addEventListener('click', closeCheatsheet);

        const printBtn = overlay.querySelector('.nsft-cheatsheet-print');
        if (printBtn) printBtn.addEventListener('click', printCheatsheet);

        const resetBtn = overlay.querySelector('.nsft-cheatsheet-reset');
        if (resetBtn) resetBtn.addEventListener('click', resetShortcutsToDefaults);

        const search = overlay.querySelector('.nsft-cheatsheet-search-input');
        if (search) {
            search.addEventListener('input', () => applyFilter(overlay, search.value));
            search.addEventListener('keydown', (e) => {
                if (e.key === 'Escape') { e.stopPropagation(); closeCheatsheet(); }
            });
        }

        overlay.addEventListener('click', (ev) => {
            const editBtn = ev.target.closest('.nsft-cheatsheet-edit[data-storage-key]');
            if (editBtn) {
                ev.stopPropagation();
                startInlineCapture(editBtn);
                return;
            }
            const row = ev.target.closest('.nsft-cheatsheet-row-actionable');
            if (!row) return;
            const action = row.getAttribute('data-action');
            if (!action) return;
            ev.stopPropagation();
            triggerAction(action);
        });
    }

    function triggerAction(eventName) {
        closeCheatsheet();
        setTimeout(() => {
            try { window.dispatchEvent(new CustomEvent(eventName)); }
            catch (_) {}
        }, 0);
    }

    function applyFilter(overlay, raw) {
        const term = String(raw || '').trim().toLowerCase();
        const rows = overlay.querySelectorAll('.nsft-cheatsheet-row');
        rows.forEach(row => {
            const hay = (row.dataset.search || '').toLowerCase();
            row.style.display = (!term || hay.indexOf(term) !== -1) ? '' : 'none';
        });
        overlay.querySelectorAll('.nsft-cheatsheet-group').forEach(g => {
            const anyVisible = g.querySelector('.nsft-cheatsheet-row:not([style*="display: none"])');
            g.style.display = anyVisible ? '' : 'none';
        });
        const body = overlay.querySelector('.nsft-cheatsheet-body');
        const empty = overlay.querySelector('.nsft-cheatsheet-empty');
        const anyVisibleGroup = overlay.querySelector('.nsft-cheatsheet-group:not([style*="display: none"])');
        if (empty) empty.style.display = (term && !anyVisibleGroup) ? '' : 'none';
        if (body) body.classList.toggle('nsft-cheatsheet-filtering', !!term);
    }

    function trapFocus(e) {
        if (e.key !== 'Tab') return;
        const overlay = e.currentTarget;
        const focusables = overlay.querySelectorAll(
            'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'
        );
        if (!focusables.length) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === first) {
            e.preventDefault();
            last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
            e.preventDefault();
            first.focus();
        }
    }

    function getRenderedHtml() {
        const lang = (chrome.i18n && chrome.i18n.getUILanguage) ? chrome.i18n.getUILanguage() : 'x';
        const sig = registrySignature();
        if (_renderCache && _renderCache.lang === lang && _renderCache.mod === MOD &&
            _renderCache.sig === sig) {
            return _renderCache.html;
        }
        const html = buildHtml();
        _renderCache = { lang, mod: MOD, sig, html };
        return html;
    }

    function registrySignature() {
        if (!window.NSFT_Shortcuts) return '0';
        try {
            const list = window.NSFT_Shortcuts.list({ isMac: IS_MAC });
            return list.map(g => g.group + ':' + g.items.map(i =>
                i.label + '=' + i.combo + ':' + (i.action || '') + ':' + (i.configurable ? 'C' : 'F')
            ).join('|')).join('§');
        } catch (_) { return String(Date.now()); }
    }

    function i18n(key, fallback) {
        return chrome.i18n.getMessage(key) || fallback;
    }

    function resolveGroups() {
        const formatCombo = (combo) => {
            if (window.NSFT_Shortcuts) return window.NSFT_Shortcuts.formatCombo(combo, { isMac: IS_MAC });
            return String(combo || '').replace(/\bMod\b/g, MOD);
        };

        const groups = STATIC_GROUPS.map(g => ({
            title: i18n(g.groupKey, g.groupFallback),
            items: g.items.map(it => ({
                label: i18n(it.labelKey, it.labelFallback),
                combo: formatCombo(it.combo),
                context: it.context || 'global',
                action: it.action || null,
                configurable: false,
                storageKey: null
            }))
        }));

        if (window.NSFT_Shortcuts) {
            const registry = window.NSFT_Shortcuts.list({ isMac: IS_MAC });
            registry.forEach(rg => {
                let target = groups.find(g => g.title === rg.group);
                if (!target) {
                    target = { title: rg.group, items: [] };
                    groups.push(target);
                }
                rg.items.forEach(item => {
                    const i = target.items.findIndex(x => x.label === item.label);
                    const entry = {
                        label: item.label,
                        combo: item.combo,
                        context: item.context || 'global',
                        action: item.action || null,
                        configurable: !!item.configurable,
                        storageKey: item.storageKey || null
                    };
                    if (i >= 0) target.items[i] = entry;
                    else target.items.unshift(entry);
                });
            });
        }

        return groups.filter(g => g.items && g.items.length);
    }

    function contextBadgeText(ctx) {
        switch (ctx) {
            case 'global':     return '';
            case 'sql-runner': return i18n('cheatsheet_ctx_sql', 'in SuiteQL Runner');
            default:           return ctx ? String(ctx) : '';
        }
    }

    function buildHtml() {
        const groups = resolveGroups();

        const tryLabel = i18n('cheatsheet_try_action', 'Try this shortcut');
        const editLabel = i18n('cheatsheet_edit_shortcut', 'Edit shortcut');
        const groupsHtml = groups.map(g => `
            <section class="nsft-cheatsheet-group">
                <h3>${escapeHtml(g.title)}</h3>
                <table>
                    <tbody>
                        ${g.items.map(({ label, combo, context, action, configurable, storageKey }) => {
                            const ctx = context || 'global';
                            const badge = contextBadgeText(ctx);
                            const badgeHtml = badge
                                ? ` <span class="nsft-cheatsheet-ctx-badge" data-ctx="${escapeHtml(ctx)}">${escapeHtml(badge)}</span>`
                                : '';
                            const rowClass = action ? 'nsft-cheatsheet-row nsft-cheatsheet-row-actionable' : 'nsft-cheatsheet-row';
                            const tryBtn = action
                                ? `<button type="button" class="nsft-cheatsheet-try" title="${escapeHtml(tryLabel)}" aria-label="${escapeHtml(tryLabel)}" tabindex="-1">▶</button>`
                                : '<span class="nsft-cheatsheet-try nsft-cheatsheet-try-void" aria-hidden="true"></span>';
                            const editBtn = (configurable && storageKey)
                                ? `<button type="button" class="nsft-cheatsheet-edit" title="${escapeHtml(editLabel)}" aria-label="${escapeHtml(editLabel)}" data-storage-key="${escapeHtml(storageKey)}">✎</button>`
                                : '<span class="nsft-cheatsheet-edit nsft-cheatsheet-edit-void" aria-hidden="true">✎</span>';
                            return `
                                <tr class="${rowClass}"
                                    data-ctx="${escapeHtml(ctx)}"
                                    data-action="${escapeHtml(action || '')}"
                                    data-storage-key="${escapeHtml(storageKey || '')}"
                                    data-search="${escapeHtml(label.toLowerCase() + ' ' + combo.toLowerCase() + ' ' + badge.toLowerCase())}">
                                    <td class="nsft-cheatsheet-label">
                                        ${tryBtn}<span class="nsft-cheatsheet-label-text">${escapeHtml(label)}</span>${badgeHtml}
                                    </td>
                                    <td class="nsft-cheatsheet-keys">
                                        <span class="nsft-cheatsheet-combo">${renderKbds(combo)}</span>
                                        ${editBtn}
                                    </td>
                                </tr>
                            `;
                        }).join('')}
                    </tbody>
                </table>
            </section>
        `).join('');

        return `
            <div class="nsft-cheatsheet-panel" role="dialog" aria-modal="true" aria-labelledby="nsft-cheatsheet-title" tabindex="-1">
                <header class="nsft-cheatsheet-header">
                    <h2 id="nsft-cheatsheet-title">${escapeHtml(i18n('cheatsheet_title', 'NSFT keyboard shortcuts'))}</h2>
                    <div class="nsft-cheatsheet-header-actions">
                        <button type="button" class="nsft-cheatsheet-reset"
                                title="${escapeHtml(i18n('cheatsheet_reset_title', 'Restore default shortcuts'))}"
                                aria-label="${escapeHtml(i18n('cheatsheet_reset_title', 'Restore default shortcuts'))}">⟲</button>
                        <button type="button" class="nsft-cheatsheet-print"
                                title="${escapeHtml(i18n('cheatsheet_print_title', 'Print / Save as PDF'))}"
                                aria-label="${escapeHtml(i18n('cheatsheet_print_title', 'Print / Save as PDF'))}">⎙</button>
                        <button type="button" class="nsft-cheatsheet-close" aria-label="${escapeHtml(i18n('cheatsheet_close', 'Close'))}">×</button>
                    </div>
                </header>
                <div class="nsft-cheatsheet-search">
                    <input type="text" class="nsft-cheatsheet-search-input"
                           placeholder="${escapeHtml(i18n('cheatsheet_search_placeholder', 'Filter shortcuts…'))}"
                           aria-label="${escapeHtml(i18n('cheatsheet_search_placeholder', 'Filter shortcuts…'))}">
                </div>
                <div class="nsft-cheatsheet-body">
                    ${groupsHtml}
                    <div class="nsft-cheatsheet-empty" style="display:none;">
                        ${escapeHtml(i18n('cheatsheet_no_results', 'No matches'))}
                    </div>
                </div>
                <footer class="nsft-cheatsheet-footer">
                    <kbd>Esc</kbd> ${escapeHtml(i18n('cheatsheet_close_hint', 'to close'))}
                </footer>
            </div>
        `;
    }

    function renderKbds(combo) {
        return combo.split('+')
            .map(part => `<kbd>${escapeHtml(part.trim())}</kbd>`)
            .join('<span class="nsft-cheatsheet-plus">+</span>');
    }

    function escapeHtml(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        }[c]));
    }


    function startInlineCapture(editBtn) {
        const row = editBtn.closest('tr');
        if (!row) return;
        const storageKey = editBtn.getAttribute('data-storage-key');
        if (!storageKey) return;
        const keysCell = row.querySelector('.nsft-cheatsheet-keys');
        if (!keysCell) return;
        if (keysCell.querySelector('.nsft-cheatsheet-capture-input')) return;

        const prevContent = keysCell.innerHTML;
        const placeholder = i18n('cheatsheet_capture_placeholder', 'Press a key combo… (Esc to cancel)');
        keysCell.innerHTML = `
            <input type="text" class="nsft-cheatsheet-capture-input"
                   placeholder="${escapeHtml(placeholder)}"
                   aria-label="${escapeHtml(placeholder)}"
                   readonly>
        `;
        const input = keysCell.querySelector('.nsft-cheatsheet-capture-input');
        input.focus();

        const restore = () => { keysCell.innerHTML = prevContent; };

        input.addEventListener('blur', () => {
            setTimeout(() => {
                if (keysCell.querySelector('.nsft-cheatsheet-capture-input')) restore();
            }, 100);
        });

        input.addEventListener('keydown', (e) => {
            if (e.key === 'Control' || e.key === 'Shift' || e.key === 'Alt' || e.key === 'Meta') return;
            e.preventDefault();
            e.stopPropagation();

            if (e.key === 'Escape') { restore(); return; }

            if (!e.ctrlKey && !e.metaKey && !e.altKey) {
                input.value = '';
                input.placeholder = i18n('cheatsheet_capture_needs_mod', 'Use Ctrl/Cmd/Alt + key');
                return;
            }

            const combo = {
                ctrlKey: !!(e.ctrlKey || e.metaKey),
                shiftKey: !!e.shiftKey,
                altKey: !!e.altKey,
                code: e.code
            };
            chrome.storage.local.set({ [storageKey]: combo }, () => {
                toast(i18n('cheatsheet_capture_saved', 'Shortcut saved'));
            });
        });
    }


    function printCheatsheet() {
        const root = document.documentElement;
        root.setAttribute('data-nsft-printing-cheatsheet', '1');
        const cleanup = () => {
            root.removeAttribute('data-nsft-printing-cheatsheet');
            window.removeEventListener('afterprint', cleanup);
        };
        window.addEventListener('afterprint', cleanup);
        try { window.print(); }
        catch (_) { cleanup(); }
    }

    function resetShortcutsToDefaults() {
        const keys = collectConfigurableStorageKeys();
        if (!keys.length) {
            toast(i18n('cheatsheet_reset_none', 'No customizable shortcuts to reset'));
            return;
        }
        chrome.storage.local.remove(keys, () => {
            toast(i18n('cheatsheet_reset_done', 'Default shortcuts restored'));
            _renderCache = null;
            const open = document.getElementById(MODAL_ID);
            if (open) rerenderInPlace(open);
        });
    }

    function collectConfigurableStorageKeys() {
        if (!window.NSFT_Shortcuts) return [];
        const seen = new Set();
        try {
            window.NSFT_Shortcuts.list({ isMac: IS_MAC }).forEach(g => {
                g.items.forEach(item => {
                    if (item.configurable && item.storageKey) seen.add(item.storageKey);
                });
            });
        } catch (_) {}
        return Array.from(seen);
    }

    function toast(message, opts) {
        if (window.NSFT_Clipboard && typeof window.NSFT_Clipboard.showToast === 'function') {
            try { window.NSFT_Clipboard.showToast(message, opts || {}); return; }
            catch (_) {}
        }
        try { console.info('[NSFT cheatsheet]', message); } catch (_) {}
    }
})();
