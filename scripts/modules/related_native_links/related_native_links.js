(function () {
    'use strict';

    const STORAGE_KEY = 'enableRelatedNativeLinks';
    const FETCHER_PATH = 'scripts/modules/related_native_links/related_native_links_fetcher.js';
    const RELATED_LINK_CLASS = 'nsft-related-link';
    const NATIVE_LINK_CLASS = 'nsft-native-record-link';

    const ACCT_PARAMS = ['acctid', 'acct', 'account', 'accountid'];

    const RECORD_MAP = {
        department: '/app/common/otherlists/departmenttype.nl',
        class: '/app/common/otherlists/classtype.nl',
        location: '/app/common/otherlists/locationtype.nl',
        adjlocation: '/app/common/otherlists/locationtype.nl',
        subsidiary: '/app/common/otherlists/subsidiarytype.nl'
    };

    const RB = window.NSFT_RecordButtons;
    let _enabled = false;
    let _observerUnsub = null;
    let _fetcherInjected = false;

    chrome.storage.local.get({ [STORAGE_KEY]: true }, (setting) => {
        if (!setting[STORAGE_KEY]) return;
        if (isExcludedPage()) return;
        enable();
    });

    chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== 'local' || !changes[STORAGE_KEY]) return;
        const on = changes[STORAGE_KEY].newValue !== false;
        if (on && !_enabled) { if (!isExcludedPage()) enable(); }
        else if (!on && _enabled) disable();
    });

    function isExcludedPage() {
        if (RB && typeof RB.isExcludedPage === 'function' && RB.isExcludedPage()) return true;
        const own = [
            '/app/accounting/account/accounts.nl',
            '/app/accounting/account/account.nl',
            '/app/reporting/reportrunner.nl'
        ];
        return own.some(page => window.location.href.includes(page));
    }

    function enable() {
        if (_enabled) return;
        _enabled = true;
        window.addEventListener('message', onFetcherMessage);
        injectFetcher();
        processAll();
        if (window.NSFT_Observer && typeof window.NSFT_Observer.subscribe === 'function') {
            _observerUnsub = window.NSFT_Observer.subscribe(processAll, { throttle: 250 });
        }
    }

    function disable() {
        if (!_enabled) return;
        _enabled = false;
        window.removeEventListener('message', onFetcherMessage);
        if (_observerUnsub) { try { _observerUnsub(); } catch (_) { } _observerUnsub = null; }
        removeInjected();
    }

    function onFetcherMessage(event) {
        if (event.source !== window) return;
        const data = event.data;
        if (!data || data.dest !== 'extension_rnl') return;
        if (data.type === 'fieldsReady') processRecordLinks();
    }

    function injectFetcher() {
        if (_fetcherInjected) return;
        _fetcherInjected = true;
        const script = document.createElement('script');
        script.src = chrome.runtime.getURL(FETCHER_PATH);
        script.onload = function () { this.remove(); };
        (document.head || document.documentElement).appendChild(script);
    }

    function processAll() {
        processReportLinks();
        processRecordLinks();
    }

    function processReportLinks() {
        const accountNodes = document.querySelectorAll("a[href^='/app/reporting/reportrunner']");

        accountNodes.forEach(node => {
            if (node.dataset.nsftProcessed) return;
            if (node.classList.contains(RELATED_LINK_CLASS)) return;
            const originalReportUrl = node.getAttribute('href');
            if (!originalReportUrl) return;

            const urlParams = new URLSearchParams(originalReportUrl.split('?')[1]);
            let accountId = null;
            for (const p of ACCT_PARAMS) {
                const v = urlParams.get(p);
                if (v) { accountId = v; break; }
            }
            if (!accountId) return;

            node.dataset.nsftProcessed = 'true';
            node.dataset.nsftOrigHref = originalReportUrl;

            node.href = `/app/accounting/account/account.nl?id=${accountId}`;

            const reportLink = document.createElement('a');
            reportLink.href = originalReportUrl;
            reportLink.textContent = chrome.i18n.getMessage('rnl_account_record_link_text');
            reportLink.classList.add('dottedlink', RELATED_LINK_CLASS);
            node.after(reportLink);
        });
    }

    function isRecordViewMode() {
        if (RB && typeof RB.hasRecordId === 'function' && typeof RB.isEditMode === 'function') {
            return RB.hasRecordId() && !RB.isEditMode();
        }
        const params = new URLSearchParams(window.location.search);
        const hasId = !!params.get('id');
        const isEdit = /[?&]e=[Tt]/.test(window.location.search);
        return hasId && !isEdit;
    }

    function processRecordLinks() {
        if (!isRecordViewMode()) return;

        const DOM = window.NSFT_DOM;
        Object.keys(RECORD_MAP).forEach(fieldId => {
            const wrapper = DOM
                ? DOM.q([
                    `div.uir-field-wrapper[data-field-name="${fieldId}"]`,
                    `[data-field-name="${fieldId}"]`
                ], { module: 'related_native_links', purpose: `wrapper[${fieldId}]` })
                : document.querySelector(`div.uir-field-wrapper[data-field-name="${fieldId}"]`);
            if (!wrapper) return;

            const textSpan = DOM
                ? DOM.q([
                    'span.inputreadonly.uir-field-input',
                    'span.inputreadonly',
                    '.uir-field-input'
                ], { module: 'related_native_links', purpose: `text span[${fieldId}]`, root: wrapper })
                : wrapper.querySelector('span.inputreadonly.uir-field-input');
            if (!textSpan || textSpan.querySelector('a')) return;

            let recordId = wrapper.getAttribute('data-nsft-id');
            if (!recordId) {
                const input = DOM
                    ? DOM.q([`input[name="${fieldId}"]`, `[name="${fieldId}"]`], { module: 'related_native_links', purpose: `input[${fieldId}]` })
                    : document.querySelector(`input[name="${fieldId}"]`);
                if (input && input.value) recordId = input.value;
            }

            if (recordId && textSpan.innerText) {
                createNativeLink(textSpan, RECORD_MAP[fieldId], recordId);
            }
        });
    }

    function createNativeLink(container, baseUrl, idValue) {
        const ids = String(idValue).split(',').map(s => s.trim()).filter(Boolean);
        const labels = container.innerHTML.split(/<br\s*\/?>/i)
            .map(chunk => chunk.replace(/<[^>]*>/g, '').trim())
            .filter(Boolean);
        const singleLabel = (container.innerText || '').trim();

        container.innerHTML = '';

        if (ids.length <= 1) {
            appendNativeLink(container, baseUrl, ids[0] || idValue, labels[0] || singleLabel);
            return;
        }

        ids.forEach((id, i) => {
            appendNativeLink(container, baseUrl, id, labels[i] || id);
            if (i < ids.length - 1) container.appendChild(document.createElement('br'));
        });
    }

    function appendNativeLink(container, baseUrl, id, text) {
        const link = document.createElement('a');
        link.href = `${baseUrl}?id=${id}`;
        link.textContent = text;
        link.classList.add('dottedlink', NATIVE_LINK_CLASS);
        link.style.color = 'inherit';
        container.appendChild(link);
    }

    function removeInjected() {
        document.querySelectorAll('a[data-nsft-processed]').forEach(node => {
            if (node.dataset.nsftOrigHref) node.href = node.dataset.nsftOrigHref;
            delete node.dataset.nsftProcessed;
            delete node.dataset.nsftOrigHref;
        });
        document.querySelectorAll('.' + RELATED_LINK_CLASS).forEach(el => el.remove());
        document.querySelectorAll('.' + NATIVE_LINK_CLASS).forEach(el => {
            el.replaceWith(document.createTextNode(el.textContent || ''));
        });
    }

})();
