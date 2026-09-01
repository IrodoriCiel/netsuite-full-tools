
const COLOR_MAP = globalThis.NSFT_GROUPED_TABS_COLORS || {
    'grey': '#BDC1C6',
    'blue': '#8AB4F8',
    'red': '#F28B82',
    'yellow': '#FDD663',
    'green': '#81C995',
    'pink': '#FF8BCB',
    'purple': '#C58AF9',
    'cyan': '#78D9EC',
    'orange': '#FCAD70'
};

const AVAILABLE_COLORS = Object.keys(COLOR_MAP);
const STORAGE_KEY = 'groupedTabsConfig';

(function nsftStampUnifiedTheme() {
    const stamp = (mode) => {
        document.documentElement.setAttribute('data-nsft-theme', mode === 'dark' ? 'dark' : 'light');
    };
    try {
        chrome.storage.local.get({ nsftTheme: 'light' }, (it) => stamp(it.nsftTheme));
        chrome.storage.onChanged.addListener((ch, area) => {
            if (area === 'local' && ch.nsftTheme) stamp(ch.nsftTheme.newValue);
        });
    } catch (e) { stamp('light'); }
})();

let currentConfig = [];
let editingIndex = -1;


document.addEventListener('DOMContentLoaded', () => {
    loadI18n();

    chrome.storage.sync.get({
        [STORAGE_KEY]: []
    }, (items) => {
        if (items[STORAGE_KEY] && items[STORAGE_KEY].length > 0) {
            currentConfig = items[STORAGE_KEY];
            init();
        } else {
            chrome.storage.local.get({ [STORAGE_KEY]: [] }, (localItems) => {
                if (localItems[STORAGE_KEY] && localItems[STORAGE_KEY].length > 0) {
                    currentConfig = localItems[STORAGE_KEY];
                    chrome.storage.sync.set({ [STORAGE_KEY]: currentConfig });
                } else {
                    currentConfig = [];
                }
                init();
            });
        }
    });
});

function init() {
    checkGroupingScope();
    renderColorOptions('colorOptions', 'selectedColor', 'grey', renderNewGroupPill);
    document.getElementById('addBtn').addEventListener('click', addGroup);

    const idInput = document.getElementById('accountId');
    const labelInput = document.getElementById('visibleLabel');
    if (idInput) {
        idInput.addEventListener('input', () => { renderEnvDetected(); renderNewGroupPill(); });
        idInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') addGroup(); });
    }
    if (labelInput) {
        labelInput.addEventListener('input', renderNewGroupPill);
        labelInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') addGroup(); });
    }
    renderEnvDetected();
    renderNewGroupPill();

    renderList();
    loadKnownAccounts(renderKnownAccounts);
    wireToolsSection();
}

function loadI18n() {
    const elements = document.querySelectorAll('[data-i18n]');
    elements.forEach(el => {
        const key = el.getAttribute('data-i18n');
        el.textContent = chrome.i18n.getMessage(key);
    });

    const placeholders = document.querySelectorAll('[data-i18n-placeholder]');
    placeholders.forEach(el => {
        const key = el.getAttribute('data-i18n-placeholder');
        el.setAttribute('placeholder', chrome.i18n.getMessage(key));
    });
}

function persistConfig() {
    chrome.storage.sync.set({ [STORAGE_KEY]: currentConfig }, () => {
        if (chrome.runtime.lastError) {
            showToast('gt_toast_save_error', 'error');
            return;
        }
        showToast('gt_saved_msg', 'success');
    });
}

function showToast(messageKey = 'gt_saved_msg', type = 'success') {
    const toast = document.getElementById('toast');
    if (!toast) return;
    toast.classList.remove('toast--success', 'toast--error');
    toast.classList.add(`toast--${type}`);
    const text = chrome.i18n.getMessage(messageKey);
    if (text) toast.textContent = text;
    toast.classList.add('visible');
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => toast.classList.remove('visible'), 2500);
}

function showConfirmModal(messageKey, onConfirm, opts) {
    const overlay = document.getElementById('confirmModal');
    if (!overlay) {
        if (confirm(chrome.i18n.getMessage(messageKey))) onConfirm();
        return;
    }
    opts = opts || {};
    const messageEl = document.getElementById('confirmModalMessage');
    if (messageEl) messageEl.textContent = chrome.i18n.getMessage(messageKey) || '';
    overlay.hidden = false;

    const okBtn = document.getElementById('confirmModalOk');
    const cancelBtn = document.getElementById('confirmModalCancel');

    const origOkText = okBtn.textContent;
    const origCancelText = cancelBtn.textContent;
    if (opts.okLabelKey) {
        const t = chrome.i18n.getMessage(opts.okLabelKey);
        if (t) okBtn.textContent = t;
    }
    if (opts.cancelLabelKey) {
        const t = chrome.i18n.getMessage(opts.cancelLabelKey);
        if (t) cancelBtn.textContent = t;
    }

    const close = () => {
        overlay.hidden = true;
        okBtn.onclick = null;
        cancelBtn.onclick = null;
        overlay.onclick = null;
        document.removeEventListener('keydown', onKey);
        okBtn.textContent = origOkText;
        cancelBtn.textContent = origCancelText;
    };
    const fireCancel = () => { close(); if (opts.onCancel) opts.onCancel(); };
    const onKey = (e) => {
        if (e.key === 'Escape') fireCancel();
        else if (e.key === 'Enter') { close(); onConfirm(); }
    };
    okBtn.onclick = () => { close(); onConfirm(); };
    cancelBtn.onclick = fireCancel;
    overlay.onclick = (e) => { if (e.target === overlay) fireCancel(); };
    document.addEventListener('keydown', onKey);
    okBtn.focus();
}

function normalizeAccountId(id) {
    return String(id == null ? '' : id).trim().toLowerCase().replace(/_/g, '-');
}

function isValidAccountId(id) {
    return /^[a-z0-9-]+$/.test(id);
}

function describeEnv(rawId) {
    const id = normalizeAccountId(rawId);
    if (!isValidAccountId(id)) return null;
    const parts = id.split('-');
    const suffix = parts.length > 1 ? parts[parts.length - 1].toUpperCase() : '';
    const m = /^(SB(\d*)|RP|TD)$/.exec(suffix);
    if (!m) {
        return { code: 'PRD', label: chrome.i18n.getMessage('envBadgeColorPrdLabel') || 'Production' };
    }
    if (m[1] === 'RP') {
        return { code: 'RP', label: chrome.i18n.getMessage('envBadgeColorRpLabel') || 'Release Preview' };
    }
    const base = chrome.i18n.getMessage('envBadgeColorSbLabel') || 'Sandbox';
    const label = m[2]
        ? (chrome.i18n.getMessage('gt_env_sb_n', [m[2]]) || base + ' ' + m[2])
        : base;
    return { code: 'SB', label: label };
}

function baseAccountId(id) {
    const norm = normalizeAccountId(id);
    const parts = norm.split('-');
    if (parts.length < 2) return norm;
    const suffix = parts[parts.length - 1].toUpperCase();
    return /^(SB\d*|RP|TD)$/.test(suffix) ? parts.slice(0, -1).join('-') : norm;
}

function renderColorOptions(containerId, inputId, preselectedColor = 'grey', onPick) {
    const container = document.getElementById(containerId);
    const hiddenInput = document.getElementById(inputId);

    if (!container) return;

    container.innerHTML = '';

    AVAILABLE_COLORS.forEach(color => {
        const dot = document.createElement('div');
        dot.className = `color-dot ${color === preselectedColor ? 'selected' : ''}`;
        dot.style.setProperty('--group-color', COLOR_MAP[color]);
        dot.title = chrome.i18n.getMessage('gt_color_' + color)
            || color.charAt(0).toUpperCase() + color.slice(1);

        dot.onclick = () => {
            container.querySelectorAll('.color-dot').forEach(d => d.classList.remove('selected'));
            dot.classList.add('selected');

            if (hiddenInput) {
                hiddenInput.value = color;
            }
            if (onPick) onPick(color);
        };

        dot.dataset.color = color;
        container.appendChild(dot);
    });
}

function renderList() {
    const list = document.getElementById('groupsList');
    if (!list) return;

    list.innerHTML = '';

    const count = document.getElementById('groupsCount');
    if (count) count.textContent = String(currentConfig.length);
    renderChromePreview();
    renderKnownAccounts();

    if (currentConfig.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'empty-state';
        empty.textContent = chrome.i18n.getMessage('gt_no_groups') || "No groups configured yet.";
        list.appendChild(empty);
        return;
    }

    currentConfig.forEach((group, index) => {
        if (index === editingIndex) {
            list.appendChild(renderEditRow(group, index));
        } else {
            list.appendChild(renderViewRow(group, index));
        }
    });
}

function renderViewRow(group, index) {
    const item = document.createElement('div');
    item.className = 'group-item';
    item.draggable = true;
    item.dataset.index = String(index);
    item.addEventListener('dragstart', (e) => {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', String(index));
        item.classList.add('dragging');
    });
    item.addEventListener('dragend', () => {
        item.classList.remove('dragging');
        document.querySelectorAll('.group-item.drag-over').forEach(el => el.classList.remove('drag-over'));
    });
    item.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
    });
    item.addEventListener('dragenter', () => item.classList.add('drag-over'));
    item.addEventListener('dragleave', (e) => {
        if (!item.contains(e.relatedTarget)) item.classList.remove('drag-over');
    });
    item.addEventListener('drop', (e) => {
        e.preventDefault();
        item.classList.remove('drag-over');
        const fromIdx = parseInt(e.dataTransfer.getData('text/plain'), 10);
        const toIdx = index;
        if (Number.isNaN(fromIdx) || fromIdx === toIdx) return;
        const [moved] = currentConfig.splice(fromIdx, 1);
        currentConfig.splice(toIdx, 0, moved);
        renderList();
        persistConfig();
    });

    const indicator = document.createElement('div');
    indicator.className = 'group-color-indicator';
    indicator.style.backgroundColor = COLOR_MAP[group.color || 'grey'] || COLOR_MAP['grey'];

    const info = document.createElement('div');
    info.className = 'group-info';

    const title = document.createElement('span');
    title.className = 'group-title';
    title.textContent = group.label;

    const subtitle = document.createElement('span');
    subtitle.className = 'group-subtitle';
    subtitle.textContent = group.id;

    info.appendChild(title);
    info.appendChild(subtitle);

    const env = describeEnv(group.id);
    const badge = document.createElement('span');
    badge.className = 'env-badge' + (env && env.code === 'PRD' ? ' is-prd' : '');
    badge.textContent = env ? env.label : '';

    const colors = document.createElement('div');
    colors.className = 'row-colors';
    colors.title = chrome.i18n.getMessage('gt_row_color_title') || 'Change the group colour';
    AVAILABLE_COLORS.forEach(color => {
        const dot = document.createElement('button');
        dot.type = 'button';
        dot.className = 'color-dot row-dot' + (color === group.color ? ' selected' : '');
        dot.style.setProperty('--group-color', COLOR_MAP[color]);
        dot.title = chrome.i18n.getMessage('gt_color_' + color)
            || color.charAt(0).toUpperCase() + color.slice(1);
        dot.onclick = (e) => {
            e.stopPropagation();
            if (currentConfig[index].color === color) return;
            currentConfig[index].color = color;
            renderList();
            persistConfig();
        };
        colors.appendChild(dot);
    });

    const actions = document.createElement('div');
    actions.className = 'group-actions';

    const editBtn = document.createElement('button');
    editBtn.className = 'icon-btn edit';
    editBtn.innerHTML = `
        <svg width="16" height="16" enable-background="new 0 0 24 24" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><g><path d="M0,0h24v24H0V0z" fill="none"/></g><g><path d="M3,17.25V21h3.75L17.81,9.94l-3.75-3.75L3,17.25z M20.71,7.04c0.39-0.39,0.39-1.02,0-1.41l-2.34-2.34 c-0.39-0.39-1.02-0.39-1.41,0l-1.83,1.83l3.75,3.75L20.71,7.04z" fill="currentColor"/></g></svg>
    `;
    editBtn.title = chrome.i18n.getMessage('gt_edit_btn') || "Edit";
    editBtn.onclick = () => {
        editingIndex = index;
        renderList();
    };

    const delBtn = document.createElement('button');
    delBtn.className = 'icon-btn delete';
    delBtn.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
    `;
    delBtn.title = chrome.i18n.getMessage('gt_delete_btn') || "Delete";
    delBtn.onclick = () => removeGroup(index);

    actions.appendChild(editBtn);
    actions.appendChild(delBtn);

    item.appendChild(indicator);
    item.appendChild(info);
    item.appendChild(badge);
    item.appendChild(colors);
    item.appendChild(actions);

    return item;
}

function renderEditRow(group, index) {
    const template = document.getElementById('editRowTemplate');
    const clone = template.content.cloneNode(true);

    const inputs = {
        id: clone.querySelector('.edit-id'),
        label: clone.querySelector('.edit-label')
    };

    inputs.id.value = group.id;
    inputs.label.value = group.label;

    const colorContainer = clone.querySelector('.edit-colors');
    let selectedEditColor = group.color;

    AVAILABLE_COLORS.forEach(color => {
        const dot = document.createElement('div');
        dot.className = `color-dot ${color === selectedEditColor ? 'selected' : ''}`;
        dot.style.setProperty('--group-color', COLOR_MAP[color]);
        dot.onclick = () => {
            selectedEditColor = color;
            colorContainer.querySelectorAll('.color-dot').forEach(d => d.classList.remove('selected'));
            dot.classList.add('selected');
        };
        colorContainer.appendChild(dot);
    });

    const btnSave = clone.querySelector('.btn-save');
    btnSave.onclick = () => {
        const newId = normalizeAccountId(inputs.id.value);
        const newLabel = inputs.label.value.trim();

        if (!newId || !newLabel) {
            showToast('gt_error_required', 'error');
            return;
        }

        if (!isValidAccountId(newId)) {
            showToast('gt_invalid_account', 'error');
            return;
        }

        if (currentConfig.some((g, i) => i !== index && g.id === newId)) {
            showToast('gt_error_duplicate', 'error');
            return;
        }

        currentConfig[index] = {
            id: newId,
            label: newLabel,
            color: selectedEditColor
        };

        editingIndex = -1;
        renderList();
        persistConfig();
    };

    const btnCancel = clone.querySelector('.btn-cancel');
    btnCancel.onclick = () => {
        editingIndex = -1;
        renderList();
    };

    const wrapper = document.createElement('div');
    wrapper.className = 'group-item editing';
    wrapper.appendChild(clone);

    return wrapper;
}

function addGroup() {
    const idInput = document.getElementById('accountId');
    const labelInput = document.getElementById('visibleLabel');
    const colorInput = document.getElementById('selectedColor');

    const id = normalizeAccountId(idInput.value);
    const label = labelInput.value.trim();
    const color = colorInput.value;

    if (!id || !label) {
        showToast('gt_error_required', 'error');
        return;
    }

    if (!isValidAccountId(id)) {
        showToast('gt_invalid_account', 'error');
        return;
    }

    if (currentConfig.some(g => g.id === id)) {
        showToast('gt_error_duplicate', 'error');
        return;
    }

    currentConfig.push({ id, label, color });

    idInput.value = '';
    labelInput.value = '';
    colorInput.value = 'grey';
    renderColorOptions('colorOptions', 'selectedColor', 'grey', renderNewGroupPill);
    renderEnvDetected();
    renderNewGroupPill();

    renderList();
    persistConfig();
}

function removeGroup(index) {
    showConfirmModal('gt_confirm_delete', () => {
        currentConfig.splice(index, 1);
        renderList();
        persistConfig();
    });
}


function checkGroupingScope() {
    chrome.storage.local.get({
        enableGroupedTabs: false,
        enableGroupedTabsAutomatic: true
    }, (items) => {
        const box = document.getElementById('gtOffNotice');
        const text = document.getElementById('gtOffText');
        if (!box || !text) return;
        let msg = '';
        if (!items.enableGroupedTabs) {
            msg = chrome.i18n.getMessage('gt_off_module')
                || 'Grouped Tabs is off: this list is not used.';
        } else if (items.enableGroupedTabsAutomatic) {
            msg = chrome.i18n.getMessage('gt_off_automatic')
                || 'Automatic groups are on: tabs group by account on their own and this list is not used.';
        }
        text.textContent = msg;
        box.hidden = !msg;
    });
}

chrome.storage.onChanged.addListener((ch, area) => {
    if (area === 'local' && (ch.enableGroupedTabs || ch.enableGroupedTabsAutomatic)) {
        checkGroupingScope();
    }
});


function renderEnvDetected() {
    const out = document.getElementById('envDetected');
    const input = document.getElementById('accountId');
    if (!out || !input) return;
    const env = input.value.trim() ? describeEnv(input.value) : null;
    out.textContent = env
        ? (chrome.i18n.getMessage('gt_env_detected', [env.label]) || 'Detected environment: ' + env.label)
        : (chrome.i18n.getMessage('gt_account_help') || '');
    out.classList.toggle('is-detected', !!env);
}

function renderNewGroupPill() {
    const pill = document.getElementById('newGroupPill');
    if (!pill) return;
    const label = (document.getElementById('visibleLabel') || {}).value || '';
    const id = (document.getElementById('accountId') || {}).value || '';
    const color = (document.getElementById('selectedColor') || {}).value || 'grey';
    pill.textContent = label.trim() || id.trim()
        || chrome.i18n.getMessage('gt_preview_unnamed') || 'Unnamed';
    pill.style.backgroundColor = COLOR_MAP[color] || COLOR_MAP['grey'];
}

let knownAccounts = null;

function loadKnownAccounts(cb) {
    chrome.storage.local.get({ nsftAccountInfoCache: {}, colorThemeAccounts: {} }, (it) => {
        const vistas = it.nsftAccountInfoCache || {};
        const fichas = it.colorThemeAccounts || {};
        const mapa = new Map();
        const anota = (rawId, nombre) => {
            const base = baseAccountId(rawId);
            if (!isValidAccountId(base)) return;
            if (nombre) {
                const esc = base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/[-_]/g, '[-_]');
                nombre = nombre.replace(new RegExp(esc + '(?:[-_](?:sb\\d*|rp|td))?', 'gi'), ' ')
                    .replace(/\s+/g, ' ').trim();
            }
            if (!mapa.has(base)) mapa.set(base, nombre || '');
            else if (!mapa.get(base) && nombre) mapa.set(base, nombre);
        };

        Object.keys(vistas).forEach((companyId) => {
            anota(companyId, (vistas[companyId] && vistas[companyId].companyName) || '');
        });
        Object.keys(fichas).forEach((id) => {
            anota(id, (fichas[id] && fichas[id].nombre) || '');
        });

        knownAccounts = mapa;
        if (cb) cb();
    });
}

const KNOWN_ENVS = [
    { code: 'PRD', suffix: '', color: 'red', i18n: 'envBadgeColorPrdLabel', fallback: 'Production' },
    { code: 'SB1', suffix: '-sb1', color: 'green', i18n: null, fallback: 'Sandbox 1' },
    { code: 'RP', suffix: '-rp', color: 'blue', i18n: 'envBadgeColorRpLabel', fallback: 'Release Preview' }
];

function knownEnvLabel(env) {
    if (env.code === 'SB1') return chrome.i18n.getMessage('gt_env_sb_n', ['1']) || env.fallback;
    return chrome.i18n.getMessage(env.i18n) || env.fallback;
}

function renderKnownAccounts() {
    const box = document.getElementById('knownAccounts');
    const empty = document.getElementById('knownAccountsEmpty');
    if (!box) return;
    box.innerHTML = '';
    if (!knownAccounts) return;

    const configurados = new Set(currentConfig.map(g => g.id));
    let visibles = 0;

    [...knownAccounts.keys()].sort().forEach((base) => {
        const nombre = knownAccounts.get(base);
        const libres = KNOWN_ENVS.filter(e => !configurados.has(base + e.suffix));
        if (!libres.length) return;
        visibles++;

        const row = document.createElement('div');
        row.className = 'known-chip';

        const txt = document.createElement('span');
        txt.className = 'known-chip-txt';
        txt.textContent = nombre || base;
        txt.title = nombre || base;
        row.appendChild(txt);

        const sub = document.createElement('span');
        sub.className = 'known-chip-id';
        sub.textContent = base;
        row.appendChild(sub);

        const envs = document.createElement('span');
        envs.className = 'known-envs';
        libres.forEach((e) => {
            const b = document.createElement('button');
            b.type = 'button';
            b.className = 'known-env';
            b.textContent = e.code;
            b.title = knownEnvLabel(e);
            b.onclick = () => {
                const idInput = document.getElementById('accountId');
                const labelInput = document.getElementById('visibleLabel');
                if (idInput) idInput.value = base + e.suffix;
                if (labelInput) {
                    labelInput.value = nombre ? nombre + ' — ' + knownEnvLabel(e) : base + e.suffix;
                }
                const colorInput = document.getElementById('selectedColor');
                if (colorInput) colorInput.value = e.color;
                renderColorOptions('colorOptions', 'selectedColor', e.color, renderNewGroupPill);
                renderEnvDetected();
                renderNewGroupPill();
                if (labelInput) labelInput.focus();
            };
            envs.appendChild(b);
        });
        row.appendChild(envs);
        box.appendChild(row);
    });

    if (empty) empty.hidden = visibles > 0;
}

const PREVIEW_MAX_GROUPS = 3;

function renderChromePreview() {
    const box = document.getElementById('chromePreview');
    const win = document.getElementById('chromePreviewWin');
    const url = document.getElementById('chromePreviewUrl');
    const empty = document.getElementById('chromePreviewEmpty');
    if (!box) return;
    box.innerHTML = '';
    if (empty) empty.hidden = currentConfig.length > 0;
    if (win) win.hidden = currentConfig.length === 0;
    if (!currentConfig.length) return;

    currentConfig.slice(0, PREVIEW_MAX_GROUPS).forEach((group) => {
        const color = COLOR_MAP[group.color || 'grey'] || COLOR_MAP['grey'];

        const wrap = document.createElement('span');
        wrap.className = 'nsft-pv-group';
        wrap.style.backgroundColor = color + '2E';

        const label = document.createElement('span');
        label.className = 'nsft-pv-glabel';
        label.style.backgroundColor = color;
        label.textContent = group.label;
        wrap.appendChild(label);

        const tab = document.createElement('span');
        tab.className = 'nsft-pv-tab';
        tab.textContent = group.id;
        wrap.appendChild(tab);

        box.appendChild(wrap);
    });

    if (url) url.textContent = currentConfig[0].id + '.app.netsuite.com';
}


function openModal(modalId, focusElId, cancelHandler) {
    const overlay = document.getElementById(modalId);
    if (!overlay) return null;
    overlay.hidden = false;
    if (focusElId) {
        const el = document.getElementById(focusElId);
        if (el) setTimeout(() => el.focus(), 30);
    }
    const close = () => {
        overlay.hidden = true;
        document.removeEventListener('keydown', onKey);
        overlay.onclick = null;
    };
    const onKey = (e) => {
        if (e.key === 'Escape') {
            close();
            if (cancelHandler) cancelHandler();
        }
    };
    document.addEventListener('keydown', onKey);
    overlay.onclick = (e) => {
        if (e.target === overlay) {
            close();
            if (cancelHandler) cancelHandler();
        }
    };
    return close;
}

function applyBulkAdd(text) {
    const lines = String(text || '')
        .split(/\r?\n/)
        .map(l => l.trim())
        .filter(Boolean);
    if (!lines.length) {
        showToast('gt_bulk_empty', 'error');
        return 0;
    }
    const validColors = new Set(Object.keys(COLOR_MAP));
    let added = 0;
    let skippedInvalid = 0;
    let skippedDup = 0;
    for (const line of lines) {
        const parts = line.split('|').map(p => p.trim());
        const id = normalizeAccountId(parts[0]);
        if (!isValidAccountId(id)) { skippedInvalid++; continue; }
        if (currentConfig.some(g => g.id === id)) { skippedDup++; continue; }
        const label = parts[1] || id;
        let color = (parts[2] || 'grey').toLowerCase();
        if (!validColors.has(color)) color = 'grey';
        currentConfig.push({ id, label, color });
        added++;
    }
    if (added) {
        renderList();
        persistConfig();
    }
    const t = chrome.i18n.getMessage('gt_bulk_result', [String(added), String(skippedDup), String(skippedInvalid)])
        || `Added ${added}. Skipped ${skippedDup} duplicates, ${skippedInvalid} invalid.`;
    const toast = document.getElementById('toast');
    if (toast) {
        toast.classList.remove('toast--success', 'toast--error');
        toast.classList.add(added > 0 ? 'toast--success' : 'toast--error');
        toast.textContent = t;
        toast.classList.add('visible');
        clearTimeout(showToast._t);
        showToast._t = setTimeout(() => toast.classList.remove('visible'), 3500);
    }
    return added;
}

function exportConfigJSON() {
    const data = JSON.stringify(currentConfig, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const now = new Date();
    const stamp = now.toISOString().slice(0, 10).replace(/-/g, '');
    const a = document.createElement('a');
    a.href = url;
    a.download = `grouped_tabs_config_${stamp}.json`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }, 100);
    showToast('gt_export_done', 'success');
}

function importConfigFromFile(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
        let parsed;
        try {
            parsed = JSON.parse(String(e.target.result || ''));
        } catch (err) {
            showToast('gt_import_invalid_json', 'error');
            return;
        }
        if (!Array.isArray(parsed)) {
            showToast('gt_import_invalid_shape', 'error');
            return;
        }
        const validColors = new Set(Object.keys(COLOR_MAP));
        const cleaned = [];
        for (const entry of parsed) {
            if (!entry || typeof entry !== 'object') continue;
            const id = normalizeAccountId(entry.id);
            if (!isValidAccountId(id)) continue;
            const label = String(entry.label || id).trim();
            let color = String(entry.color || 'grey').toLowerCase();
            if (!validColors.has(color)) color = 'grey';
            cleaned.push({ id, label, color });
        }
        if (!cleaned.length) {
            showToast('gt_import_empty', 'error');
            return;
        }
        showConfirmModal('gt_import_confirm', () => {
            currentConfig = cleaned;
            renderList();
            persistConfig();
        }, {
            okLabelKey: 'gt_import_replace',
            cancelLabelKey: 'gt_import_merge',
            onCancel: () => {
                const existingIds = new Set(currentConfig.map(c => c.id));
                let added = 0;
                cleaned.forEach(c => {
                    if (!existingIds.has(c.id)) {
                        currentConfig.push(c);
                        added++;
                    }
                });
                renderList();
                persistConfig();
                const msg = chrome.i18n.getMessage('gt_import_merge_done', [String(added)])
                    || `Merged: ${added} new entries added.`;
                const toast = document.getElementById('toast');
                if (toast) {
                    toast.classList.remove('toast--success', 'toast--error');
                    toast.classList.add('toast--success');
                    toast.textContent = msg;
                    toast.classList.add('visible');
                    clearTimeout(showToast._t);
                    showToast._t = setTimeout(() => toast.classList.remove('visible'), 3500);
                }
            }
        });
    };
    reader.onerror = () => showToast('gt_import_read_error', 'error');
    reader.readAsText(file);
}

function applyPreset(baseAccountId, presetType) {
    const base = normalizeAccountId(baseAccountId);
    if (!isValidAccountId(base)) {
        showToast('gt_invalid_account', 'error');
        return;
    }
    const templates = {
        full: [
            { id: base,            label: 'Production', color: 'red' },
            { id: `${base}-sb1`,   label: 'Sandbox 1',  color: 'green' },
            { id: `${base}-sb2`,   label: 'Sandbox 2',  color: 'yellow' }
        ],
        prd_sb1: [
            { id: base,            label: 'Production', color: 'red' },
            { id: `${base}-sb1`,   label: 'Sandbox 1',  color: 'green' }
        ],
        sandboxes: [
            { id: `${base}-sb1`,   label: 'Sandbox 1',  color: 'green' },
            { id: `${base}-sb2`,   label: 'Sandbox 2',  color: 'yellow' }
        ],
        rp: [
            { id: base,            label: 'Production',     color: 'red' },
            { id: `${base}-rp`,    label: 'Release Preview', color: 'blue' }
        ]
    };
    const tpl = templates[presetType] || templates.full;
    let added = 0;
    let skipped = 0;
    for (const entry of tpl) {
        if (currentConfig.some(c => c.id === entry.id)) { skipped++; continue; }
        currentConfig.push(entry);
        added++;
    }
    if (added) {
        renderList();
        persistConfig();
    }
    const msg = chrome.i18n.getMessage('gt_preset_result', [String(added), String(skipped)])
        || `Added ${added}. Skipped ${skipped} duplicates.`;
    const toast = document.getElementById('toast');
    if (toast) {
        toast.classList.remove('toast--success', 'toast--error');
        toast.classList.add(added > 0 ? 'toast--success' : 'toast--error');
        toast.textContent = msg;
        toast.classList.add('visible');
        clearTimeout(showToast._t);
        showToast._t = setTimeout(() => toast.classList.remove('visible'), 3500);
    }
}

function wireToolsSection() {
    const bulkBtn = document.getElementById('bulkAddBtn');
    if (bulkBtn) {
        bulkBtn.addEventListener('click', () => {
            const close = openModal('bulkAddModal', 'bulkAddTextarea');
            const apply = document.getElementById('bulkAddApply');
            const cancel = document.getElementById('bulkAddCancel');
            const textarea = document.getElementById('bulkAddTextarea');
            apply.onclick = () => {
                const text = textarea.value;
                const added = applyBulkAdd(text);
                if (added > 0) {
                    textarea.value = '';
                    if (close) close();
                }
            };
            cancel.onclick = close;
        });
    }
    const exportBtn = document.getElementById('exportBtn');
    if (exportBtn) exportBtn.addEventListener('click', exportConfigJSON);
    const importBtn = document.getElementById('importBtn');
    const importInput = document.getElementById('importFileInput');
    if (importBtn && importInput) {
        importBtn.addEventListener('click', () => importInput.click());
        importInput.addEventListener('change', (e) => {
            const file = e.target.files && e.target.files[0];
            importConfigFromFile(file);
            e.target.value = '';
        });
    }
    const presetsBtn = document.getElementById('presetsBtn');
    if (presetsBtn) {
        presetsBtn.addEventListener('click', () => {
            const close = openModal('presetsModal', 'presetAccountId');
            const apply = document.getElementById('presetsApply');
            const cancel = document.getElementById('presetsCancel');
            const idInput = document.getElementById('presetAccountId');
            const typeSelect = document.getElementById('presetType');
            apply.onclick = () => {
                applyPreset(idInput.value, typeSelect.value);
                idInput.value = '';
                if (close) close();
            };
            cancel.onclick = close;
        });
    }
}
