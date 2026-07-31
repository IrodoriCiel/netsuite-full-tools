(function () {
    'use strict';
    const STORAGE_KEY = 'enableSystemFolderSafetyBeta';
    const HTML_CLASS = 'nsft-sfs-on';
    const SYSTEM_CLASS = 'nsft-sfs-system';
    const BANNER_ID = 'nsft-sfs-banner';

    const SYSTEM_FOLDER_NAMES = {
        '-15': 'SuiteScripts',
        '-16': 'SuiteBundles',
        '-17': 'Web Site Hosting Files',
        '-10': 'Attachments Received',
        '-11': 'Attachments Sent',
        '-12': 'Attachments to Send',
        '-13': 'Images',
        '-14': 'Templates'
    };

    let enabled = false;
    let _unsub = null;

    function isApplicablePage() {
        return /\/app\/common\/media\/mediaitemfolder\.nl/.test(location.pathname);
    }
    if (!isApplicablePage()) return;

    chrome.storage.local.get({ [STORAGE_KEY]: false }, (items) => {
        enabled = !!items[STORAGE_KEY];
        if (enabled) init();
    });

    chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== 'local' || !changes[STORAGE_KEY]) return;
        enabled = !!changes[STORAGE_KEY].newValue;
        if (enabled) init();
        else teardown();
    });

    function init() {
        const id = getFolderIdFromUrl();
        if (id == null || !isSystemFolderId(id)) return;

        document.documentElement.classList.add(HTML_CLASS, SYSTEM_CLASS);

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', startApply, { once: true });
        } else {
            startApply();
        }
    }

    function startApply() {
        if (!enabled) return;
        apply();
        if (window.NSFT_Observer && typeof window.NSFT_Observer.subscribe === 'function') {
            _unsub = window.NSFT_Observer.subscribe(() => { if (enabled) disableDestructiveButtons(); }, { throttle: 400 });
        }
    }

    function teardown() {
        if (_unsub) { _unsub(); _unsub = null; }
        document.documentElement.classList.remove(HTML_CLASS, SYSTEM_CLASS);
        const b = document.getElementById(BANNER_ID);
        if (b) b.remove();
        document.querySelectorAll('.nsft-sfs-disabled').forEach(el => {
            el.removeAttribute('disabled');
            el.classList.remove('nsft-sfs-disabled');
            el.style.pointerEvents = '';
            el.style.opacity = '';
            el.removeEventListener('click', blockClick, true);
        });
    }

    function getFolderIdFromUrl() {
        try {
            const q = new URLSearchParams(location.search);
            const id = q.get('id');
            if (id && /^-?\d+$/.test(id)) return id;
        } catch (e) { }
        return null;
    }

    function isSystemFolderId(id) {
        return parseInt(id, 10) < 0;
    }

    function apply() {
        injectBanner();
        disableDestructiveButtons();
    }

    function injectBanner() {
        if (document.getElementById(BANNER_ID)) return;
        const id = getFolderIdFromUrl();
        const name = SYSTEM_FOLDER_NAMES[id] || ((chrome.i18n.getMessage('sfs_folder_generic') || 'system folder') + ' ' + id);

        const banner = document.createElement('div');
        banner.id = BANNER_ID;
        banner.setAttribute('role', 'alert');
        banner.innerHTML =
            '<span class="nsft-sfs-icon" aria-hidden="true">⚠</span>' +
            '<div class="nsft-sfs-text">' +
                '<strong>' + (chrome.i18n.getMessage('sfs_title') || 'System folder') + ':</strong> ' +
                escapeHtml(name) + '. ' +
                (chrome.i18n.getMessage('sfs_warning') || 'This is a system folder. Deleting it can break SuiteApps or automation. Actions that mutate this record are disabled for safety.') +
            '</div>';

        const host = document.querySelector('#main_form, #div__body, body');
        if (host) host.insertBefore(banner, host.firstChild);
    }

    function disableDestructiveButtons() {
        const selectors = [
            'input[type="submit"][name="delete"]',
            'input[type="button"][value="Eliminar" i]',
            'input[type="button"][value="Delete" i]',
            'a[onclick*="setWindowChanged(window,false);NS.form.submit(\'delete\')" i]',
            'a[id*="delete" i]',
            '.uir-secondary-buttons input[name*="delete" i]'
        ];
        document.querySelectorAll(selectors.join(', ')).forEach(el => {
            if (el.classList.contains('nsft-sfs-disabled')) return;
            el.setAttribute('disabled', 'disabled');
            el.classList.add('nsft-sfs-disabled');
            el.title = chrome.i18n.getMessage('sfs_delete_blocked') || 'Disabled by NSFT: this is a system folder.';
            el.addEventListener('click', blockClick, true);
            el.style.pointerEvents = 'none';
            el.style.opacity = '0.5';
        });
    }

    function blockClick(e) {
        e.preventDefault();
        e.stopImmediatePropagation();
        alert(chrome.i18n.getMessage('sfs_blocked_alert') || 'This is a system folder. Delete is disabled for safety.');
    }

    function escapeHtml(s) {
        return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }
})();
