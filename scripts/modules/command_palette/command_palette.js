(function () {
    'use strict';

    const STORAGE_KEY = 'enableCommandPalette';
    const SHORTCUT_KEY = 'commandPaletteShortcut';
    const RECENT_KEY = 'commandPaletteRecent';
    const PINNED_KEY = 'commandPalettePinned';
    const CUSTOM_URLS_KEY = 'commandPaletteCustomUrls';
    const THEME_KEY = 'nsftTheme';
    const OVERLAY_ID = 'nsft-cmdp-overlay';
    const MAX_RECENT = 5;
    const MAX_PINNED = 8;

    const _i18nCache = new Map();
    function i18nMsg(key, fallback) {
        const cacheKey = fallback != null ? key + '\x00' + fallback : key;
        if (_i18nCache.has(cacheKey)) return _i18nCache.get(cacheKey);
        const val = chrome.i18n.getMessage(key) || fallback || '';
        _i18nCache.set(cacheKey, val);
        return val;
    }

    const T = {
        placeholder: i18nMsg('cmdp_placeholder', 'Search tools and navigation...'),
        empty: i18nMsg('cmdp_empty', 'No results'),
        clear: i18nMsg('ro_clear_search', 'Clear search'),
        recent: i18nMsg('cmdp_recent', 'Recent'),
        pinned: i18nMsg('cmdp_pinned', 'Pinned'),
        pinAction: i18nMsg('cmdp_pin_action', 'Pin to top'),
        unpinAction: i18nMsg('cmdp_unpin_action', 'Unpin'),
        hintNav: i18nMsg('cmdp_hint_nav', '↑↓ Navigate'),
        hintRun: i18nMsg('cmdp_hint_run', '↵ Run'),
        hintClose: i18nMsg('cmdp_hint_close', 'Esc Close'),
        catNav: i18nMsg('cmdp_cat_navigation', 'Navigation'),
        catCustom: i18nMsg('cmdp_cat_customization', 'Customization'),
        catPage: i18nMsg('cmdp_cat_page', 'Current Page'),
        catNsft: i18nMsg('cmdp_cat_nsft', 'NSFT Tools')
    };

    let shortcut = { ctrlKey: true, shiftKey: true, altKey: false, code: 'Space' };
    let actions = [];
    let recent = [];
    let pinned = [];
    let customUrls = [];
    let theme = 'light';
    let overlayEl = null;
    let inputEl = null;
    let clearEl = null;
    let listEl = null;
    let selectedIndex = 0;
    let filteredActions = [];

    if (window.NSFT_RecordButtons && window.NSFT_RecordButtons.isHeaderlessPage &&
        window.NSFT_RecordButtons.isHeaderlessPage()) {
        return;
    }

    let hasAiAssistant = true;
    let hasGithubBackup = false;
    let hasAdvEditor = false;

    chrome.storage.local.get({
        [STORAGE_KEY]: true,
        [SHORTCUT_KEY]: null,
        [RECENT_KEY]: [],
        [PINNED_KEY]: [],
        [CUSTOM_URLS_KEY]: [],
        [THEME_KEY]: 'light',
        enableAiAssistant: true,
        enableGithubBackup: false,
        enableAdvancedEditor: true
    }, (items) => {
        if (!items[STORAGE_KEY]) return;
        hasAiAssistant = items.enableAiAssistant !== false;
        hasGithubBackup = items.enableGithubBackup === true;
        hasAdvEditor = items.enableAdvancedEditor !== false && enPaginaDelEditor();

        if (items[SHORTCUT_KEY]) shortcut = items[SHORTCUT_KEY];
        if (Array.isArray(items[RECENT_KEY])) recent = items[RECENT_KEY];
        if (Array.isArray(items[PINNED_KEY])) pinned = items[PINNED_KEY];
        if (Array.isArray(items[CUSTOM_URLS_KEY])) customUrls = items[CUSTOM_URLS_KEY];
        theme = items[THEME_KEY] || 'light';

        actions = buildActions();
        registerShortcut();
        publishShortcutToRegistry();
    });

    function publishShortcutToRegistry() {
        if (!window.NSFT_Shortcuts) return;
        window.NSFT_Shortcuts.unregisterModule('command_palette');
        window.NSFT_Shortcuts.register(
            'command_palette',
            chrome.i18n.getMessage('cheatsheet_item_cmdpalette') || 'Open Command Palette',
            shortcut,
            {
                group: chrome.i18n.getMessage('cheatsheet_group_global') || 'Global',
                configurable: true,
                storageKey: SHORTCUT_KEY,
                action: 'nsft-show-command-palette',
                order: 10
            }
        );
    }

    chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== 'local') return;
        if (changes[SHORTCUT_KEY] && changes[SHORTCUT_KEY].newValue) {
            shortcut = changes[SHORTCUT_KEY].newValue;
            publishShortcutToRegistry();
        }
        if (changes[RECENT_KEY] && Array.isArray(changes[RECENT_KEY].newValue)) {
            recent = changes[RECENT_KEY].newValue;
        }
        if (changes[PINNED_KEY] && Array.isArray(changes[PINNED_KEY].newValue)) {
            pinned = changes[PINNED_KEY].newValue;
            if (overlayEl) renderList(inputEl ? inputEl.value : '');
        }
        if (changes[CUSTOM_URLS_KEY] && Array.isArray(changes[CUSTOM_URLS_KEY].newValue)) {
            customUrls = changes[CUSTOM_URLS_KEY].newValue;
            actions = buildActions();
            if (overlayEl) renderList(inputEl ? inputEl.value : '');
        }
        if (changes[THEME_KEY]) {
            theme = changes[THEME_KEY].newValue || 'light';
            if (overlayEl) overlayEl.setAttribute('data-theme', resolveTheme());
        }
    });

    function resolveTheme() {
        return theme === 'dark' ? 'dark' : 'light';
    }

    const ICONS = {
        nav: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="3 11 22 2 13 21 11 13 3 11"></polygon></svg>',
        custom: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>',
        page: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>',
        nsft: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>',
        recent: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>',
        pin: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="17" x2="12" y2="22"></line><path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24z"></path></svg>',
        pinned: '<svg viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="17" x2="12" y2="22"></line><path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24z"></path></svg>'
    };

    function enPaginaDelEditor() {
        try {
            if (!/\/app\/common\/record\/edittextmediaitem\.nl/i.test(location.pathname)) return false;
            return new URLSearchParams(location.search).get('nsft-advanced-editor') === 'T';
        } catch (e) { return false; }
    }

    function buildActions() {
        const i18n = i18nMsg;

        const nav = (msgKey, fallback, path, keywords) => ({
            id: 'nav:' + path,
            label: i18n(msgKey, fallback),
            category: T.catNav,
            iconKey: 'nav',
            keywords: keywords || '',
            run: () => { window.location.href = path; }
        });

        const custom = (msgKey, fallback, path, keywords) => ({
            id: 'cust:' + path,
            label: i18n(msgKey, fallback),
            category: T.catCustom,
            iconKey: 'custom',
            keywords: keywords || '',
            run: () => { window.location.href = path; }
        });

        return [
            nav('cmdp_act_script_list', 'Script List', '/app/common/scripting/scriptlist.nl?scripttype=', 'suitescript scripts'),
            nav('cmdp_act_script_deployments', 'Script Deployments', '/app/common/scripting/scriptrecordlist.nl', 'deployment'),
            nav('cmdp_act_scripted_records', 'Scripted Records', '/app/common/scripting/scriptedrecords.nl', 'scripted records'),
            nav('cmdp_act_saved_searches', 'Saved Searches', '/app/common/search/savedsearchlist.nl', 'search list'),
            nav('cmdp_act_new_saved_search', 'New Saved Search', '/app/common/search/search.nl?cu=T&e=F', 'new search create'),
            nav('cmdp_act_workflows', 'Workflows', '/app/common/workflow/setup/workflowlist.nl', 'workflow list'),
            nav('cmdp_act_bundles_installed', 'Installed Bundles', '/app/bundler/bundlelist.nl?type=I', 'bundles suitebundler installed'),
            nav('cmdp_act_bundles_search', 'Search & Install Bundles', '/app/bundler/bundlelist.nl?type=S', 'bundles suitebundler search'),
            nav('cmdp_act_sdf_integrations', 'SuiteCloud Development Integrations', '/app/common/integration/integrappslist.nl', 'sdf sdk integration'),
            nav('cmdp_act_script_queue', 'Script Queue Monitor', '/app/common/scripting/scriptstatus.nl', 'scheduled queue status'),
            nav('cmdp_act_mapreduce_status', 'Map/Reduce Script Status', '/app/common/scripting/mapreducescriptstatus.nl', 'map reduce mr status queue'),
            nav('cmdp_act_ws_log', 'Web Services Log', '/app/webservices/wslog.nl', 'ws soap rest'),

            custom('cmdp_act_custom_records', 'Custom Records', '/app/common/custom/custrecords.nl', 'custom records list'),
            custom('cmdp_act_custom_lists', 'Custom Lists', '/app/common/custom/custlists.nl', 'lists'),
            custom('cmdp_act_custom_segments', 'Custom Segments', '/app/common/custom/segments/segments.nl', 'segment'),
            custom('cmdp_act_body_fields', 'Body Fields', '/app/common/custom/bodycustfields.nl', 'transaction body field'),
            custom('cmdp_act_column_fields', 'Column Fields', '/app/common/custom/columncustfields.nl', 'transaction line column'),
            custom('cmdp_act_entity_fields', 'Entity Fields', '/app/common/custom/entitycustfields.nl', 'customer vendor entity'),
            custom('cmdp_act_item_fields', 'Item Fields', '/app/common/custom/itemcustfields.nl', 'item field'),
            custom('cmdp_act_item_option_fields', 'Item Option Fields', '/app/common/custom/itemoptions.nl', 'item option'),
            custom('cmdp_act_crm_fields', 'CRM Fields', '/app/common/custom/eventcustfields.nl', 'crm'),
            custom('cmdp_act_other_fields', 'Other Custom Fields', '/app/common/custom/othercustfields.nl', 'other'),
            custom('cmdp_act_transaction_forms', 'Transaction Forms', '/app/common/custom/custforms.nl', 'form transaction'),
            custom('cmdp_act_entry_forms', 'Entry Forms', '/app/common/custom/entryforms.nl', 'form entry'),
            custom('cmdp_act_subtab_list', 'Subtab List', '/app/common/custom/subtablist.nl', 'subtabs tab'),
            custom('cmdp_act_pdf_templates', 'Advanced PDF/HTML Templates', '/app/common/custom/pdftemplates.nl', 'pdf template html advanced'),
            custom('cmdp_act_roles', 'Roles', '/app/setup/rolelist.nl', 'permissions role'),
            custom('cmdp_act_mass_updates', 'Mass Updates', '/app/common/mrtask/massupdates.nl', 'mass update'),
            custom('cmdp_act_translation_collections', 'Translation Collections', '/app/translations/collections.nl', 'i18n translations'),

            nav('cmdp_act_tx_sales_orders', 'Sales Orders', '/app/accounting/transactions/transactionlist.nl?Transaction_TYPE=SalesOrd&quicksort=Transaction_DATECREATED_raw', 'sales order list so transactions'),
            nav('cmdp_act_tx_new_sales_order', 'New Sales Order', '/app/accounting/transactions/salesord.nl', 'sales order new so'),
            nav('cmdp_act_tx_purchase_orders', 'Purchase Orders', '/app/accounting/transactions/transactionlist.nl?Transaction_TYPE=PurchOrd&quicksort=Transaction_DATECREATED_raw', 'purchase order list po'),
            nav('cmdp_act_tx_new_purchase_order', 'New Purchase Order', '/app/accounting/transactions/purchord.nl', 'purchase order new po'),
            nav('cmdp_act_tx_invoices', 'Invoices', '/app/accounting/transactions/transactionlist.nl?Transaction_TYPE=CustInvc&quicksort=Transaction_DATECREATED_raw', 'invoice list customer'),
            nav('cmdp_act_tx_new_invoice', 'New Invoice', '/app/accounting/transactions/custinvc.nl', 'invoice new customer'),
            nav('cmdp_act_tx_vendor_bills', 'Vendor Bills', '/app/accounting/transactions/transactionlist.nl?Transaction_TYPE=VendBill&quicksort=Transaction_DATECREATED_raw', 'vendor bill list'),
            nav('cmdp_act_tx_new_vendor_bill', 'New Vendor Bill', '/app/accounting/transactions/vendbill.nl', 'vendor bill new'),
            nav('cmdp_act_tx_credit_memos', 'Credit Memos', '/app/accounting/transactions/transactionlist.nl?Transaction_TYPE=CustCred', 'credit memo list'),
            nav('cmdp_act_tx_new_credit_memo', 'New Credit Memo', '/app/accounting/transactions/custcred.nl', 'credit memo new'),
            nav('cmdp_act_tx_customer_deposits', 'Customer Deposits', '/app/accounting/transactions/transactionlist.nl?Transaction_TYPE=CustDep', 'customer deposit list'),
            nav('cmdp_act_tx_new_customer_deposit', 'New Customer Deposit', '/app/accounting/transactions/custdep.nl', 'customer deposit new'),
            nav('cmdp_act_tx_item_fulfillments', 'Item Fulfillments', '/app/accounting/transactions/transactionlist.nl?Transaction_TYPE=ItemShip', 'fulfillment ship'),
            nav('cmdp_act_tx_item_receipts', 'Item Receipts', '/app/accounting/transactions/transactionlist.nl?Transaction_TYPE=ItemRcpt', 'receipt item'),
            nav('cmdp_act_tx_work_orders', 'Work Orders', '/app/accounting/transactions/transactionlist.nl?Transaction_TYPE=WorkOrd', 'work order list'),
            nav('cmdp_act_tx_new_work_order', 'New Work Order', '/app/accounting/transactions/workord.nl', 'work order new'),
            nav('cmdp_act_tx_journals', 'Journal Entries', '/app/accounting/transactions/transactionlist.nl?Transaction_TYPE=Journal', 'journal list'),
            nav('cmdp_act_tx_new_journal', 'New Journal Entry', '/app/accounting/transactions/journal.nl', 'journal new'),
            nav('cmdp_act_tx_weekly_time', 'Weekly Time', '/app/accounting/transactions/time/weeklytimebill.nl', 'timesheet time tracking'),
            nav('cmdp_act_tx_billing_events', 'Billing Events', '/app/billing/billingevents.nl', 'billing events'),
            nav('cmdp_act_tx_bom', 'Bills of Materials', '/app/accounting/manufacturing/bomlist.nl', 'bom manufacturing'),

            nav('cmdp_act_file_cabinet', 'File Cabinet', '/app/common/media/mediaitemfolders.nl?sc=-63', 'files documents'),
            nav('cmdp_act_employees', 'Employees', '/app/common/entity/employeelist.nl', 'users people'),
            nav('cmdp_act_new_employee', 'New Employee', '/app/common/entity/employee.nl', 'employee new'),
            nav('cmdp_act_customers', 'Customers', '/app/common/entity/custjoblist.nl?searchtype=Customer&quicksort=Entity_DATECREATED_raw', 'customer list'),
            nav('cmdp_act_new_customer', 'New Customer', '/app/common/entity/custjob.nl', 'customer new'),
            nav('cmdp_act_vendors', 'Vendors', '/app/common/entity/vendorlist.nl?searchtype=Vendor&quicksort=Entity_DATECREATED_raw', 'vendor list'),
            nav('cmdp_act_new_vendor', 'New Vendor', '/app/common/entity/vendor.nl', 'vendor new'),
            nav('cmdp_act_items', 'Items', '/app/common/item/itemlist.nl', 'items products'),
            nav('cmdp_act_new_item', 'New Item', '/app/common/item/item.nl', 'item new'),
            nav('cmdp_act_list_users', 'Users List', '/app/setup/listusers.nl', 'users active'),
            nav('cmdp_act_subsidiaries', 'Subsidiaries', '/app/common/otherlists/subsidiarylist.nl', 'subsidiary'),
            nav('cmdp_act_departments', 'Departments', '/app/common/otherlists/departmentlist.nl', 'department'),
            nav('cmdp_act_locations', 'Locations', '/app/common/otherlists/locationlist.nl', 'location'),
            nav('cmdp_act_classes', 'Classes', '/app/common/otherlists/classlist.nl', 'class'),
            nav('cmdp_act_chart_of_accounts', 'Chart of Accounts', '/app/accounting/account/accounts.nl', 'accounts coa'),
            nav('cmdp_act_fiscal_periods', 'Fiscal Periods', '/app/setup/period/fiscalperiods.nl', 'fiscal periods'),
            nav('cmdp_act_tax_periods', 'Tax Periods', '/app/setup/period/taxperiods.nl', 'tax periods'),
            nav('cmdp_act_currencies', 'Currencies', '/app/common/multicurrency/currencylist.nl', 'currency'),
            nav('cmdp_act_currency_rates', 'Currency Exchange Rates', '/app/common/multicurrency/currencyratelist.nl', 'currency rate exchange'),
            nav('cmdp_act_import_assistant', 'Import Assistant (New)', '/app/setup/assistants/nsimport/importassistant.nl?new=T', 'import csv new'),
            nav('cmdp_act_saved_imports', 'Saved Imports', '/app/setup/assistants/nsimport/savedimports.nl', 'import csv saved'),
            nav('cmdp_act_sandbox_accounts', 'Sandbox Accounts', '/app/setup/sandboxaccounts.nl', 'sandbox'),
            nav('cmdp_act_enable_features', 'Enable Features', '/app/setup/features.nl', 'features enable'),
            nav('cmdp_act_account_setup', 'Account Setup', '/app/setup/acctsetup.nl', 'account setup'),
            nav('cmdp_act_email_prefs', 'Email Preferences', '/app/setup/emailpreferences.nl', 'email preferences'),
            nav('cmdp_act_audit_trail', 'Audit Trail (System Notes)', '/app/common/search/searchrecord.nl?type=systemnote', 'system notes audit'),
            nav('cmdp_act_company_info', 'Company Information', '/app/common/otherlists/company.nl', 'company info'),
            nav('cmdp_act_general_prefs', 'General Preferences', '/app/setup/general.nl', 'preferences settings'),
            nav('cmdp_act_set_prefs', 'Set Preferences', '/app/center/userprefs.nl?sc=-29', 'user preferences personal'),
            nav('cmdp_act_home_dashboard', 'Home Dashboard', '/app/center/card.nl?sc=-29&whence=', 'home dashboard'),

            {
                id: 'page:xml',
                label: i18n('cmdp_act_page_xml', 'Open current page as XML'),
                description: i18n('cmdp_act_page_xml_desc', 'Opens this record\'s raw XML in a new tab'),
                category: T.catPage,
                iconKey: 'page',
                keywords: 'xml view source',
                run: () => {
                    const sep = window.location.search ? '&' : '?';
                    window.open(window.location.href + sep + 'xml=t', '_blank', 'noopener');
                }
            },
            {
                id: 'page:copyurl',
                label: i18n('cmdp_act_page_copy_url', 'Copy current URL'),
                description: i18n('cmdp_act_page_copy_url_desc', 'Full URL with all query parameters'),
                category: T.catPage,
                iconKey: 'page',
                keywords: 'copy link clipboard',
                run: () => copyToClipboard(window.location.href)
            },
            {
                id: 'page:copyrecurl',
                label: i18n('cmdp_act_page_copy_rec_url', 'Copy record direct URL (id-based)'),
                description: i18n('cmdp_act_page_copy_rec_url_desc', 'Shareable link that opens this exact record'),
                category: T.catPage,
                iconKey: 'page',
                keywords: 'copy record link',
                run: () => {
                    const id = getParam('id');
                    if (!id) {
                        toast(i18n('cmdp_no_record', 'No record ID in URL'), 'error');
                        return;
                    }
                    const params = new URLSearchParams(window.location.search);
                    const url = window.location.origin + window.location.pathname + '?' + params.toString();
                    copyToClipboard(url);
                }
            },
            {
                id: 'page:reload',
                label: i18n('cmdp_act_page_reload', 'Reload page'),
                category: T.catPage,
                iconKey: 'page',
                keywords: 'refresh',
                run: () => window.location.reload()
            },
            {
                id: 'page:edit',
                label: i18n('cmdp_act_page_edit', 'Switch to Edit mode'),
                description: i18n('cmdp_act_page_edit_desc', 'Reopens this record in edit mode'),
                category: T.catPage,
                iconKey: 'page',
                keywords: 'edit modify',
                run: () => {
                    const url = new URL(window.location.href);
                    url.searchParams.set('e', 'T');
                    window.location.href = url.toString();
                }
            },
            {
                id: 'page:view',
                label: i18n('cmdp_act_page_view', 'Switch to View mode'),
                description: i18n('cmdp_act_page_view_desc', 'Reopens this record in view (read-only) mode'),
                category: T.catPage,
                iconKey: 'page',
                keywords: 'view readonly',
                run: () => {
                    const url = new URL(window.location.href);
                    url.searchParams.delete('e');
                    window.location.href = url.toString();
                }
            },

            {
                id: 'nsft:sfv-save-template',
                label: i18n('cmdp_act_sfv_save', 'Save current fields as template...'),
                description: i18n('cmdp_act_sfv_save_desc', 'Snapshot the current form values for later replay'),
                category: T.catNsft,
                iconKey: 'nsft',
                keywords: 'template save field values snapshot',
                run: () => handleSaveFieldsTemplate()
            },
            {
                id: 'nsft:sfv-apply-template',
                label: i18n('cmdp_act_sfv_apply', 'Apply saved template...'),
                description: i18n('cmdp_act_sfv_apply_desc', 'Restore field values from a saved template'),
                category: T.catNsft,
                iconKey: 'nsft',
                keywords: 'template apply load field values',
                run: () => handleApplyFieldsTemplate()
            },
            {
                id: 'nsft:settings',
                label: i18n('cmdp_act_nsft_changelog', 'Open NSFT changelog'),
                category: T.catNsft,
                iconKey: 'nsft',
                keywords: 'changelog version',
                run: () => window.open(chrome.runtime.getURL('popup/changelog.html'), '_blank', 'noopener')
            },
            {
                id: 'nsft:performance',
                label: i18n('cmdp_act_nsft_perf', 'Page performance'),
                description: i18n('cmdp_act_nsft_perf_desc', 'Show this page\'s load-time breakdown'),
                category: T.catNsft,
                iconKey: 'nsft',
                keywords: 'performance speed timing load ttfb',
                run: () => {
                    if (window.NSFT_PagePerf && typeof window.NSFT_PagePerf.open === 'function') {
                        window.NSFT_PagePerf.open();
                    } else {
                        toast(i18n('cmdp_perf_disabled', 'Enable "Page performance" in NSFT settings'), 'error');
                    }
                }
            },
            {
                id: 'nsft:splitsearch',
                label: i18n('cmdp_act_nsft_splitsearch', 'Split view: saved search'),
                description: i18n('cmdp_act_nsft_splitsearch_desc', 'Open a saved search in a side panel next to this page'),
                category: T.catNsft,
                iconKey: 'nsft',
                keywords: 'saved search split side panel results compare',
                run: () => {
                    if (window.NSFT_SavedSearchSplit && typeof window.NSFT_SavedSearchSplit.open === 'function') {
                        window.NSFT_SavedSearchSplit.open();
                    } else {
                        toast(i18n('cmdp_splitsearch_disabled', 'Enable "Saved search split view" in NSFT settings'), 'error');
                    }
                }
            },
            {
                id: 'nsft:turbo',
                label: i18n('cmdp_act_nsft_turbo', 'Turbo mode: on/off'),
                description: i18n('cmdp_act_nsft_turbo_desc', 'Disable NetSuite animations for snappier navigation'),
                category: T.catNsft,
                iconKey: 'nsft',
                keywords: 'turbo fast speed animations transitions effects performance',
                run: () => {
                    chrome.storage.local.get({ enableTurboMode: false }, (it) => {
                        const next = !it.enableTurboMode;
                        chrome.storage.local.set({ enableTurboMode: next }, () => {
                            toast(next
                                ? i18n('cmdp_turbo_on', 'Turbo mode ON')
                                : i18n('cmdp_turbo_off', 'Turbo mode OFF'));
                        });
                    });
                }
            },
            ...(hasAiAssistant ? [{
                id: 'nsft:askai',
                label: i18n('cmdp_act_nsft_askai', 'Preguntar a la IA sobre este registro'),
                description: i18n('cmdp_act_nsft_askai_desc', 'Abre un chat de IA sobre esta página con el contexto del registro actual'),
                category: T.catNsft,
                iconKey: 'nsft',
                keywords: 'ia ai asistente chat registro record preguntar contexto',
                run: () => {
                    window.dispatchEvent(new CustomEvent('nsft-ai-ask-record'));
                }
            }] : []),
            ...(hasAdvEditor ? [
                {
                    id: 'nsft:adv-save',
                    label: i18n('cmdp_act_adv_save', 'Save file to the File Cabinet'),
                    category: T.catNsft, iconKey: 'nsft',
                    keywords: 'guardar save archivo file editor',
                    shortcut: 'Ctrl+S',
                    run: () => window.dispatchEvent(new CustomEvent('nsft-adv-save'))
                },
                {
                    id: 'nsft:adv-find',
                    label: i18n('cmdp_act_adv_find', 'Find and replace in the file'),
                    category: T.catNsft, iconKey: 'nsft',
                    keywords: 'buscar find replace reemplazar editor',
                    shortcut: 'Ctrl+F',
                    run: () => window.dispatchEvent(new CustomEvent('nsft-adv-find'))
                },
                {
                    id: 'nsft:adv-goto',
                    label: i18n('cmdp_act_adv_goto', 'Go to line'),
                    category: T.catNsft, iconKey: 'nsft',
                    keywords: 'ir linea line goto editor',
                    shortcut: 'Ctrl+G',
                    run: () => window.dispatchEvent(new CustomEvent('nsft-adv-goto'))
                },
                {
                    id: 'nsft:adv-format',
                    label: i18n('cmdp_act_adv_format', 'Format document'),
                    category: T.catNsft, iconKey: 'nsft',
                    keywords: 'formatear format sangrar indent editor',
                    shortcut: 'Shift+Alt+F',
                    run: () => window.dispatchEvent(new CustomEvent('nsft-adv-format'))
                },
                {
                    id: 'nsft:adv-tree',
                    label: i18n('cmdp_act_adv_tree', 'Show the folder files'),
                    category: T.catNsft, iconKey: 'nsft',
                    keywords: 'arbol tree carpeta folder archivos editor',
                    run: () => window.dispatchEvent(new CustomEvent('nsft-adv-tree'))
                },
                {
                    id: 'nsft:adv-wrap',
                    label: i18n('cmdp_act_adv_wrap', 'Wrap long lines'),
                    category: T.catNsft, iconKey: 'nsft',
                    keywords: 'wrap envolver lineas largas editor',
                    run: () => window.dispatchEvent(new CustomEvent('nsft-adv-wrap'))
                }
            ] : []),
            ...(hasGithubBackup ? [{
                id: 'nsft:githubbackup',
                label: i18n('cmdp_act_nsft_ghbackup', 'Respaldar SuiteScripts a GitHub'),
                description: i18n('cmdp_act_nsft_ghbackup_desc', 'Sube los SuiteScripts de la cuenta a un repositorio de GitHub'),
                category: T.catNsft,
                iconKey: 'nsft',
                keywords: 'github backup respaldo scripts suitescript git repo',
                run: () => window.dispatchEvent(new CustomEvent('nsft-show-github-backup'))
            }] : []),
            {
                id: 'nsft:findfield',
                label: i18n('cmdp_act_nsft_findfield', 'Find Field by ID'),
                category: T.catNsft,
                iconKey: 'nsft',
                keywords: 'search field label',
                shortcut: 'Ctrl+Shift+F',
                run: () => dispatchShortcut({ ctrlKey: true, shiftKey: true, keyCode: 70, which: 70, key: 'F', code: 'KeyF' })
            },
            {
                id: 'nsft:global-search',
                label: i18n('cmdp_act_global_search', 'Search NetSuite (Global Search)...'),
                description: i18n('cmdp_act_global_search_desc', 'Run a Global Search across records and lists'),
                category: T.catNsft,
                iconKey: 'nsft',
                keywords: 'global search find records',
                prompt: {
                    placeholder: i18n('cmdp_global_search_placeholder', 'Search term...'),
                    hint: i18n('cmdp_global_search_hint', 'Opens NetSuite Global Search results in the current tab')
                },
                run: (term) => runGlobalSearch(term)
            },
            ...buildCustomUrlActions()
        ];
    }

    function buildCustomUrlActions() {
        if (!Array.isArray(customUrls) || customUrls.length === 0) return [];
        return customUrls
            .filter(u => u && typeof u.label === 'string' && typeof u.path === 'string' && u.path)
            .map(u => ({
                id: 'custom-url:' + u.path,
                label: u.label,
                category: i18nMsg('cmdp_cat_user', 'Custom'),
                iconKey: 'nav',
                keywords: (u.keywords || '') + ' custom user',
                run: () => { window.location.href = u.path; }
            }));
    }

    function runGlobalSearch(term) {
        const q = String(term || '').trim();
        if (!q) return;
        window.location.href = '/app/common/search/globalsearch.nl?Search.queryString=' + encodeURIComponent(q);
    }

    function registerShortcut() {
        document.addEventListener('keydown', (e) => {
            if (matchesShortcut(e, shortcut)) {
                e.preventDefault();
                e.stopPropagation();
                if (window.NSFT_ShortcutCoach) window.NSFT_ShortcutCoach.noteUsed('command_palette');
                togglePalette();
                return;
            }
            if (overlayEl && e.key === 'Escape') {
                e.preventDefault();
                e.stopPropagation();
                closePalette();
            }
        }, true);
        window.addEventListener('nsft-show-command-palette', () => {
            if (overlayEl) return;
            openPalette();
            if (window.NSFT_ShortcutCoach) window.NSFT_ShortcutCoach.hint('command_palette');
        });
    }

    function matchesShortcut(e, s) {
        return !!(e.ctrlKey || e.metaKey) === !!(s.ctrlKey || s.metaKey) &&
               !!e.shiftKey === !!s.shiftKey &&
               !!e.altKey === !!s.altKey &&
               e.code === s.code;
    }

    function togglePalette() {
        if (overlayEl) {
            closePalette();
        } else {
            openPalette();
        }
    }

    function openPalette() {
        refreshContextBoosts();
        overlayEl = document.createElement('div');
        overlayEl.id = OVERLAY_ID;
        overlayEl.className = 'nsft-cmdp-overlay';
        overlayEl.setAttribute('data-theme', resolveTheme());
        overlayEl.innerHTML = `
            <div class="nsft-cmdp-panel" role="dialog" aria-modal="true">
                <div class="nsft-cmdp-input-wrap">
                    <svg class="nsft-cmdp-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <circle cx="11" cy="11" r="8"></circle>
                        <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                    </svg>
                    <input type="text" class="nsft-cmdp-input" autocomplete="off" spellcheck="false" />
                    <button type="button" class="nsft-cmdp-clear" title="${escapeHtml(T.clear)}" aria-label="${escapeHtml(T.clear)}" hidden>✕</button>
                </div>
                <div class="nsft-cmdp-list" role="listbox"></div>
                <div class="nsft-cmdp-footer">
                    <span class="nsft-cmdp-hint"><kbd>↑</kbd><kbd>↓</kbd> ${escapeHtml(T.hintNav)}</span>
                    <span class="nsft-cmdp-hint"><kbd>↵</kbd> ${escapeHtml(T.hintRun)}</span>
                    <span class="nsft-cmdp-hint"><kbd>Esc</kbd> ${escapeHtml(T.hintClose)}</span>
                </div>
            </div>
        `;
        document.body.appendChild(overlayEl);

        inputEl = overlayEl.querySelector('.nsft-cmdp-input');
        clearEl = overlayEl.querySelector('.nsft-cmdp-clear');
        listEl = overlayEl.querySelector('.nsft-cmdp-list');
        inputEl.placeholder = T.placeholder;

        inputEl.addEventListener('input', () => renderList(inputEl.value));
        inputEl.addEventListener('keydown', onInputKeydown);

        if (clearEl) {
            clearEl.addEventListener('mousedown', (e) => e.preventDefault());
            clearEl.addEventListener('click', (e) => {
                e.stopPropagation();
                inputEl.value = '';
                renderList('');
                inputEl.focus();
            });
        }
        overlayEl.addEventListener('click', (e) => {
            if (e.target === overlayEl) closePalette();
        });

        renderList('');
        setTimeout(() => inputEl.focus(), 0);
    }

    function closePalette() {
        if (!overlayEl) return;
        overlayEl.remove();
        overlayEl = null;
        inputEl = null;
        clearEl = null;
        listEl = null;
        selectedIndex = 0;
        filteredActions = [];
        _listListenersBound = false;
    }

    function onInputKeydown(e) {
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            moveSelection(1);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            moveSelection(-1);
        } else if (e.key === 'Enter') {
            e.preventDefault();
            if (filteredActions[selectedIndex]) executeAction(filteredActions[selectedIndex]);
        }
    }

    function moveSelection(delta) {
        if (filteredActions.length === 0) return;
        selectedIndex = (selectedIndex + delta + filteredActions.length) % filteredActions.length;
        updateSelectionUI();
    }

    function updateSelectionUI() {
        const items = listEl.querySelectorAll('.nsft-cmdp-item');
        items.forEach((el, i) => {
            el.classList.toggle('nsft-cmdp-selected', i === selectedIndex);
            if (i === selectedIndex) el.scrollIntoView({ block: 'nearest' });
        });
    }

    function renderShortcutBadge(combo) {
        const macKeys = window.NSFT_MacKeys;
        const parts = String(combo).split('+').map(p => p.trim()).filter(Boolean);
        const kbds = parts.map(p => {
            const label = macKeys ? macKeys.humanize(p) : p;
            return `<kbd>${escapeHtml(label)}</kbd>`;
        }).join('');
        return `<span class="nsft-cmdp-item-kbd">${kbds}</span>`;
    }

    const TS = window.NSFT_TextSearch || null;

    function foldText(s) {
        if (TS) return TS.fold(s);
        return String(s == null ? '' : s)
            .normalize('NFD')
            .replace(/\p{M}/gu, '')
            .toLowerCase();
    }

    function highlightLabel(label, query) {
        if (!query) return escapeHtml(label);
        const ql = foldText(query);
        if (!ql) return escapeHtml(label);

        const matched = new Array(label.length).fill(false);
        let qi = 0;
        let prev = false;
        for (let i = 0; i < label.length; i++) {
            const f = foldText(label.charAt(i));
            if (!f.length) { matched[i] = prev; continue; }
            let hit = false;
            for (let k = 0; k < f.length && qi < ql.length; k++) {
                if (f.charAt(k) === ql.charAt(qi)) { hit = true; qi++; }
            }
            matched[i] = hit;
            prev = hit;
        }
        if (qi < ql.length) return escapeHtml(label);

        let out = '';
        let i = 0;
        while (i < label.length) {
            let j = i;
            while (j < label.length && matched[j] === matched[i]) j++;
            const chunk = escapeHtml(label.slice(i, j));
            out += matched[i] ? `<mark class="nsft-cmdp-match">${chunk}</mark>` : chunk;
            i = j;
        }
        return out;
    }

    const CONTEXT_BOOSTS = [
        { match: /\/transactions\/salesord/i, idIncludes: ['SalesOrd', 'salesord'] },
        { match: /\/transactions\/purchord/i, idIncludes: ['PurchOrd', 'purchord'] },
        { match: /\/transactions\/custinvc/i, idIncludes: ['CustInvc', 'custinvc'] },
        { match: /\/transactions\/vendbill/i, idIncludes: ['VendBill', 'vendbill'] },
        { match: /\/transactions\/journal/i, idIncludes: ['Journal', 'journal'] },
        { match: /\/transactions\/workord/i, idIncludes: ['WorkOrd', 'workord'] },
        { match: /\/transactions\/custcred/i, idIncludes: ['CustCred', 'custcred'] },
        { match: /\/transactions\/custdep/i, idIncludes: ['CustDep', 'custdep'] },
        { match: /\/entity\/custjob/i, idIncludes: ['custjob'] },
        { match: /\/entity\/vendor/i, idIncludes: ['vendor'] },
        { match: /\/entity\/employee/i, idIncludes: ['employee'] },
        { match: /\/item\//i, idIncludes: ['/item/'] },
        { match: /\/scripting\//i, idIncludes: ['/scripting/'] },
        { match: /\/workflow\//i, idIncludes: ['/workflow/'] },
        { match: /\/custom\/custrec/i, idIncludes: ['/custom/'] }
    ];
    let _contextSubstrings = [];
    function refreshContextBoosts() {
        const href = window.location.pathname + window.location.search;
        _contextSubstrings = [];
        CONTEXT_BOOSTS.forEach(row => {
            if (row.match.test(href)) _contextSubstrings.push(...row.idIncludes);
        });
    }
    function contextBoost(action) {
        if (_contextSubstrings.length === 0) return 0;
        const id = action.id;
        for (let i = 0; i < _contextSubstrings.length; i++) {
            if (id.includes(_contextSubstrings[i])) return 25;
        }
        return 0;
    }

    const SLASH_PREFIXES = {
        nav: { filter: (a) => a.iconKey === 'nav', label: 'Navigation' },
        custom: { filter: (a) => a.iconKey === 'custom', label: 'Customization' },
        page: { filter: (a) => a.iconKey === 'page', label: 'Current page' },
        nsft: { filter: (a) => a.iconKey === 'nsft', label: 'NSFT tools' },
        tx: { filter: (a) => /\/transactions\//i.test(a.id) || /Transaction_TYPE/i.test(a.id), label: 'Transactions' },
        user: { filter: (a) => String(a.id).startsWith('custom-url:'), label: 'My URLs' },
        pinned: { filter: (a) => pinned.includes(a.id), label: 'Pinned' },
        recent: { filter: (a) => recent.includes(a.id), label: 'Recent' }
    };

    function parseSlash(rawQuery) {
        const m = /^>\s*([a-z]*)\s*(.*)$/i.exec(rawQuery || '');
        if (!m) return null;
        return { prefix: m[1].toLowerCase(), term: m[2].trim() };
    }

    function renderList(query) {
        const raw = query || '';
        if (clearEl) clearEl.hidden = !raw.length;
        const slash = parseSlash(raw);
        const slashSpec = slash && SLASH_PREFIXES[slash.prefix];
        const q = foldText(slash ? slash.term : raw.trim());

        const slotById = new Map();

        if (slash && !slashSpec && !slash.term) {
            renderSlashHelp(slash.prefix);
            return;
        }

        const pool = slashSpec ? actions.filter(slashSpec.filter) : actions;

        if (!q && !slashSpec) {
            const pinnedActions = pinned
                .map(id => actions.find(a => a.id === id))
                .filter(Boolean);
            pinnedActions.forEach(a => slotById.set(a.id, 'pinned'));

            const recentActions = recent
                .map(id => actions.find(a => a.id === id))
                .filter(a => a && !slotById.has(a.id));
            recentActions.forEach(a => slotById.set(a.id, 'recent'));

            const rest = actions.filter(a => !slotById.has(a.id));
            rest.sort((a, b) => contextBoost(b) - contextBoost(a));
            filteredActions = [...pinnedActions, ...recentActions, ...rest];
        } else if (!q && slashSpec) {
            filteredActions = pool.slice().sort((a, b) => contextBoost(b) - contextBoost(a));
        } else {
            filteredActions = pool
                .map(a => ({ action: a, score: fuzzyScore(q, a) }))
                .filter(x => x.score > 0)
                .sort((a, b) => b.score - a.score)
                .map(x => x.action);
        }

        if (filteredActions.length === 0 && q && !slashSpec) {
            const term = (slash ? slash.term : raw).trim();
            filteredActions = [{
                id: 'virtual:global-search-' + term,
                label: i18nMsg('cmdp_fallback_global_search', 'Search "$1" in NetSuite').replace('$1', term),
                category: T.catNsft,
                iconKey: 'nsft',
                keywords: '',
                run: () => runGlobalSearch(term)
            }];
        }

        selectedIndex = 0;

        if (filteredActions.length === 0) {
            listEl.innerHTML = `<div class="nsft-cmdp-empty">${escapeHtml(T.empty)}</div>`;
            return;
        }

        renderItems(filteredActions, q, slotById);
    }

    function renderItems(items, q, slotById) {
        attachListListeners();

        const existing = Array.from(listEl.querySelectorAll('.nsft-cmdp-item'));
        Array.from(listEl.children).forEach(child => {
            if (!child.classList.contains('nsft-cmdp-item')) child.remove();
        });

        for (let i = 0; i < items.length; i++) {
            const node = existing[i] || createItemNode();
            if (!existing[i]) listEl.appendChild(node);
            updateItemNode(node, items[i], i, q, slotById);
        }
        for (let i = items.length; i < existing.length; i++) {
            existing[i].remove();
        }
    }

    function createItemNode() {
        const div = document.createElement('div');
        div.className = 'nsft-cmdp-item';
        div.setAttribute('role', 'option');
        div.innerHTML = `
            <span class="nsft-cmdp-item-icon" aria-hidden="true"></span>
            <span class="nsft-cmdp-item-body">
                <span class="nsft-cmdp-item-label"></span>
            </span>
            <span class="nsft-cmdp-item-cat"></span>
        `;
        return div;
    }

    function updateItemNode(node, action, idx, q, slotById) {
        const slot = slotById.get(action.id);
        const isVirtual = String(action.id).startsWith('virtual:');
        const isPinned = pinned.includes(action.id);
        let cat, iconKey;
        if (slot === 'pinned') { cat = T.pinned; iconKey = 'pinned'; }
        else if (slot === 'recent') { cat = T.recent; iconKey = 'recent'; }
        else { cat = action.category; iconKey = action.iconKey || 'nav'; }

        node.dataset.idx = String(idx);
        node.classList.toggle('nsft-cmdp-selected', idx === 0);

        const iconEl = node.querySelector('.nsft-cmdp-item-icon');
        iconEl.innerHTML = ICONS[iconKey] || '';

        const bodyEl = node.querySelector('.nsft-cmdp-item-body');
        const labelEl = bodyEl.querySelector('.nsft-cmdp-item-label');
        labelEl.innerHTML = q ? highlightLabel(action.label, q) : escapeHtml(action.label);

        let descEl = bodyEl.querySelector('.nsft-cmdp-item-desc');
        if (action.description) {
            if (!descEl) {
                descEl = document.createElement('span');
                descEl.className = 'nsft-cmdp-item-desc';
                bodyEl.appendChild(descEl);
            }
            descEl.textContent = action.description;
        } else if (descEl) {
            descEl.remove();
        }

        let kbdEl = node.querySelector('.nsft-cmdp-item-kbd');
        if (action.shortcut) {
            if (!kbdEl) {
                kbdEl = document.createElement('span');
                kbdEl.className = 'nsft-cmdp-item-kbd';
                node.insertBefore(kbdEl, node.querySelector('.nsft-cmdp-item-cat'));
            }
            kbdEl.innerHTML = renderShortcutBadgeInner(action.shortcut);
        } else if (kbdEl) {
            kbdEl.remove();
        }

        let pinBtn = node.querySelector('.nsft-cmdp-item-pin');
        if (isVirtual) {
            if (pinBtn) pinBtn.remove();
        } else {
            if (!pinBtn) {
                pinBtn = document.createElement('button');
                pinBtn.type = 'button';
                pinBtn.className = 'nsft-cmdp-item-pin';
                node.insertBefore(pinBtn, node.querySelector('.nsft-cmdp-item-cat'));
            }
            pinBtn.classList.toggle('is-pinned', isPinned);
            pinBtn.dataset.pinId = action.id;
            const pinTitle = isPinned ? T.unpinAction : T.pinAction;
            pinBtn.title = pinTitle;
            pinBtn.setAttribute('aria-label', pinTitle);
            pinBtn.setAttribute('aria-pressed', String(isPinned));
            pinBtn.innerHTML = isPinned ? ICONS.pinned : ICONS.pin;
        }

        const catEl = node.querySelector('.nsft-cmdp-item-cat');
        catEl.textContent = cat;
    }

    function renderShortcutBadgeInner(combo) {
        const macKeys = window.NSFT_MacKeys;
        const parts = String(combo).split('+').map(p => p.trim()).filter(Boolean);
        return parts.map(p => {
            const label = macKeys ? macKeys.humanize(p) : p;
            return `<kbd>${escapeHtml(label)}</kbd>`;
        }).join('');
    }

    let _listListenersBound = false;
    function attachListListeners() {
        if (_listListenersBound || !listEl) return;
        _listListenersBound = true;
        listEl.addEventListener('click', (e) => {
            const pinBtn = e.target.closest('.nsft-cmdp-item-pin');
            if (pinBtn) {
                e.stopPropagation();
                togglePin(pinBtn.getAttribute('data-pin-id'));
                return;
            }
            const item = e.target.closest('.nsft-cmdp-item');
            if (!item) return;
            const idx = parseInt(item.dataset.idx, 10);
            if (filteredActions[idx]) executeAction(filteredActions[idx]);
        });
        listEl.addEventListener('mouseover', (e) => {
            const item = e.target.closest('.nsft-cmdp-item');
            if (!item) return;
            const idx = parseInt(item.dataset.idx, 10);
            if (Number.isInteger(idx) && idx !== selectedIndex) {
                selectedIndex = idx;
                updateSelectionUI();
            }
        });
    }

    function renderSlashHelp(typedPrefix) {
        filteredActions = [];
        selectedIndex = 0;
        const items = Object.entries(SLASH_PREFIXES).map(([prefix, spec]) => {
            const count = actions.filter(spec.filter).length;
            return `
                <div class="nsft-cmdp-item nsft-cmdp-slash-help" data-slash-prefix="${escapeHtml(prefix)}" role="option">
                    <span class="nsft-cmdp-item-icon" aria-hidden="true">${ICONS.nav}</span>
                    <span class="nsft-cmdp-item-body">
                        <span class="nsft-cmdp-item-label">&gt;${escapeHtml(prefix)}</span>
                        <span class="nsft-cmdp-item-desc">${escapeHtml(spec.label)}</span>
                    </span>
                    <span class="nsft-cmdp-item-cat">${count}</span>
                </div>
            `;
        }).join('');
        const headerTxt = typedPrefix
            ? i18nMsg('cmdp_slash_unknown', `Unknown prefix ">${typedPrefix}". Pick one:`)
                .replace('$1', typedPrefix)
            : i18nMsg('cmdp_slash_pick', 'Pick a category to filter');
        listEl.innerHTML = `
            <div class="nsft-cmdp-slash-header">${escapeHtml(headerTxt)}</div>
            ${items}
        `;
        listEl.querySelectorAll('.nsft-cmdp-slash-help').forEach(el => {
            el.addEventListener('click', () => {
                const p = el.getAttribute('data-slash-prefix');
                if (inputEl) {
                    inputEl.value = '>' + p + ' ';
                    inputEl.focus();
                    renderList(inputEl.value);
                }
            });
        });
    }

    function togglePin(id) {
        if (!id) return;
        if (pinned.includes(id)) {
            pinned = pinned.filter(x => x !== id);
        } else {
            pinned = [id, ...pinned].slice(0, MAX_PINNED);
        }
        chrome.storage.local.set({ [PINNED_KEY]: pinned });
        if (inputEl) renderList(inputEl.value);
    }

    function fuzzyScore(query, action) {
        query = foldText(query);
        const haystack = foldText(action.label + ' ' + (action.keywords || '') + ' ' + action.category);
        let score = contextBoost(action);
        let qi = 0;
        let streak = 0;

        if (haystack.includes(query)) score += 50;
        if (foldText(action.label).startsWith(query)) score += 30;

        for (let i = 0; i < haystack.length && qi < query.length; i++) {
            if (haystack[i] === query[qi]) {
                qi++;
                streak++;
                score += 1 + streak;
            } else {
                streak = 0;
            }
        }
        return qi === query.length ? score : 0;
    }

    function executeAction(action, prefilledValue) {
        const isVirtual = String(action.id).startsWith('virtual:');

        if (action.prompt && prefilledValue == null) {
            closePalette();
            showInputDialog({
                placeholder: action.prompt.placeholder || '',
                hint: action.prompt.hint || ''
            }, (value) => {
                if (value == null) return;
                if (!isVirtual) pushRecent(action.id);
                try { action.run(value); } catch (_) { }
            });
            return;
        }
        if (!isVirtual) pushRecent(action.id);
        closePalette();
        try {
            action.run(prefilledValue);
        } catch (err) {
        }
    }

    function showInputDialog(opts, cb) {
        const overlay = document.createElement('div');
        overlay.className = 'nsft-cmdp-overlay';
        overlay.setAttribute('data-theme', resolveTheme());
        const placeholder = opts.placeholder || '';
        const hint = opts.hint || '';
        overlay.innerHTML = `
            <div class="nsft-cmdp-panel" style="width: 460px;">
                <div class="nsft-cmdp-input-wrap">
                    <svg class="nsft-cmdp-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <polyline points="9 11 12 14 22 4"></polyline>
                        <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"></path>
                    </svg>
                    <input type="text" class="nsft-cmdp-input" placeholder="${escapeHtml(placeholder)}" />
                </div>
                ${hint ? `<div class="nsft-cmdp-slash-header">${escapeHtml(hint)}</div>` : ''}
                <div class="nsft-cmdp-footer">
                    <span class="nsft-cmdp-hint"><kbd>↵</kbd> ${escapeHtml(i18nMsg('cmdp_hint_run', 'Run'))}</span>
                    <span class="nsft-cmdp-hint"><kbd>Esc</kbd> ${escapeHtml(i18nMsg('cmdp_hint_close', 'Cancel'))}</span>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);
        const input = overlay.querySelector('.nsft-cmdp-input');
        setTimeout(() => input.focus(), 0);
        const onEsc = (e) => { if (e.key === 'Escape') { e.preventDefault(); close(null); } };
        const close = (value) => {
            document.removeEventListener('keydown', onEsc);
            overlay.remove();
            cb(value);
        };
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                const v = input.value.trim();
                if (v) close(v);
            } else if (e.key === 'Escape') {
                e.preventDefault();
                close(null);
            }
        });
        overlay.addEventListener('click', (e) => { if (e.target === overlay) close(null); });
        document.addEventListener('keydown', onEsc);
    }

    let _recentFlushTimer = null;
    function pushRecent(id) {
        recent = [id, ...recent.filter(x => x !== id)].slice(0, MAX_RECENT);
        if (_recentFlushTimer) clearTimeout(_recentFlushTimer);
        _recentFlushTimer = setTimeout(() => {
            _recentFlushTimer = null;
            chrome.storage.local.set({ [RECENT_KEY]: recent });
        }, 200);
    }

    function getParam(name) {
        return new URLSearchParams(window.location.search).get(name);
    }

    function copyToClipboard(text) {
        const successMsg = i18nMsg('cmdp_copied', 'Copied');
        const errorMsg = i18nMsg('cmdp_copy_failed', 'Copy failed');
        if (window.NSFT_Clipboard && typeof window.NSFT_Clipboard.copy === 'function') {
            window.NSFT_Clipboard.copy(text, {
                toast: { message: successMsg, errorMessage: errorMsg, preview: false }
            });
            return;
        }
        try {
            navigator.clipboard.writeText(text).then(
                () => toast(successMsg),
                () => toast(errorMsg, 'error')
            );
        } catch (_) {
            toast(errorMsg, 'error');
        }
    }

    function dispatchShortcut(opts) {
        const evt = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...opts });
        document.dispatchEvent(evt);
        const evt2 = new KeyboardEvent('keypress', { bubbles: true, cancelable: true, ...opts });
        document.dispatchEvent(evt2);
    }

    function toast(message, type) {
        const el = document.createElement('div');
        el.className = 'nsft-cmdp-toast' + (type === 'error' ? ' nsft-cmdp-toast-error' : '');
        el.textContent = message;
        document.body.appendChild(el);
        setTimeout(() => el.classList.add('nsft-cmdp-toast-visible'), 10);
        setTimeout(() => {
            el.classList.remove('nsft-cmdp-toast-visible');
            setTimeout(() => el.remove(), 300);
        }, 2000);
    }

    function escapeHtml(str) {
        return String(str).replace(/[&<>"']/g, c => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        }[c]));
    }

    const TEMPLATES_STORAGE_KEY = 'nsftFieldTemplates';

    function loadFieldTemplates(cb) {
        chrome.storage.sync.get({ [TEMPLATES_STORAGE_KEY]: {} }, (items) => {
            const t = items[TEMPLATES_STORAGE_KEY];
            cb((t && typeof t === 'object') ? t : {});
        });
    }

    const SYNC_ITEM_QUOTA_BYTES = 8192;

    function saveFieldTemplates(templates, cb, onError) {
        const serialized = JSON.stringify(templates);
        const bytes = TEMPLATES_STORAGE_KEY.length + serialized.length;
        if (bytes > SYNC_ITEM_QUOTA_BYTES) {
            if (onError) onError({ tooLarge: true, bytes });
            return;
        }
        chrome.storage.sync.set({ [TEMPLATES_STORAGE_KEY]: templates }, () => {
            if (chrome.runtime.lastError) {
                if (onError) onError({ message: chrome.runtime.lastError.message });
                return;
            }
            if (cb) cb();
        });
    }

    function captureFieldsFromCurrentRecord() {
        const wrappers = document.querySelectorAll('.uir-field-wrapper[data-field-name]');
        const fields = [];
        wrappers.forEach(w => {
            const fieldId = w.getAttribute('data-field-name');
            if (!fieldId) return;
            let input = document.getElementById(fieldId);
            if (!input) input = document.getElementsByName(fieldId)[0];
            if (!input) input = document.getElementsByName('inpt_' + fieldId)[0];
            if (!input) return;
            if (input.disabled || input.readOnly) return;
            let value = '';
            if (input.type === 'checkbox') value = input.checked ? 'T' : 'F';
            else value = (input.value || '').trim();
            if (!value) return;
            fields.push({ id: fieldId, value });
        });
        return fields;
    }

    function applyFieldsToCurrentRecord(fields) {
        let applied = 0, missed = 0;
        fields.forEach(({ id, value }) => {
            let input = document.getElementById(id);
            if (!input) input = document.getElementsByName(id)[0];
            if (!input) input = document.getElementsByName('inpt_' + id)[0];
            if (!input || input.disabled || input.readOnly) { missed++; return; }
            try {
                if (input.type === 'checkbox') {
                    input.checked = (value === 'T' || value === 'true' || value === true);
                } else {
                    input.value = value;
                }
                input.dispatchEvent(new Event('change', { bubbles: true }));
                input.dispatchEvent(new Event('blur', { bubbles: true }));
                applied++;
            } catch (e) {
                missed++;
            }
        });
        return { applied, missed };
    }

    function getCurrentRecordType() {
        const h1 = document.querySelector('h1.uir-record-type');
        return h1 ? h1.textContent.trim() : '';
    }

    function handleSaveFieldsTemplate() {
        const fields = captureFieldsFromCurrentRecord();
        if (fields.length === 0) {
            toast(i18nMsg('cmdp_tpl_no_fields', 'No editable fields with values found'), 'error');
            return;
        }
        showTemplateNameDialog((name) => {
            if (!name) return;
            loadFieldTemplates((templates) => {
                templates[name] = {
                    recordType: getCurrentRecordType(),
                    fields,
                    createdAt: new Date().toISOString()
                };
                saveFieldTemplates(templates, () => {
                    toast(`${i18nMsg('cmdp_tpl_saved', 'Template saved')}: ${name} (${fields.length})`);
                }, (err) => {
                    if (err.tooLarge) {
                        const msg = i18nMsg('cmdp_tpl_too_large',
                            'Template too large to sync (limit 8 KB). Try fewer fields or rename existing templates.');
                        toast(msg, 'error');
                    } else {
                        toast(i18nMsg('cmdp_tpl_save_failed', 'Failed to save template'), 'error');
                    }
                });
            });
        });
    }

    function handleApplyFieldsTemplate() {
        loadFieldTemplates((templates) => {
            const names = Object.keys(templates).sort();
            if (names.length === 0) {
                toast(i18nMsg('cmdp_tpl_none', 'No templates saved yet'), 'error');
                return;
            }
            showTemplatePickerDialog(templates, (chosen) => {
                if (!chosen) return;
                const tpl = templates[chosen];
                if (!tpl || !Array.isArray(tpl.fields)) return;
                const res = applyFieldsToCurrentRecord(tpl.fields);
                toast(`${i18nMsg('cmdp_tpl_applied', 'Applied')}: ${res.applied}/${tpl.fields.length}` + (res.missed ? ` (${res.missed} missed)` : ''));
            });
        });
    }

    function showTemplateNameDialog(cb) {
        const overlay = document.createElement('div');
        overlay.className = 'nsft-cmdp-overlay';
        overlay.setAttribute('data-theme', resolveTheme());
        overlay.innerHTML = `
            <div class="nsft-cmdp-panel" style="width: 420px;">
                <div class="nsft-cmdp-input-wrap">
                    <svg class="nsft-cmdp-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path>
                    </svg>
                    <input type="text" class="nsft-cmdp-input" placeholder="${escapeHtml(i18nMsg('cmdp_tpl_name_placeholder', 'Template name...'))}" />
                </div>
                <div class="nsft-cmdp-footer">
                    <span class="nsft-cmdp-hint"><kbd>↵</kbd> ${escapeHtml(i18nMsg('cmdp_tpl_save_btn', 'Save'))}</span>
                    <span class="nsft-cmdp-hint"><kbd>Esc</kbd> ${escapeHtml(i18nMsg('cmdp_hint_close', 'Cancel'))}</span>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);
        const input = overlay.querySelector('.nsft-cmdp-input');
        setTimeout(() => input.focus(), 0);
        const close = () => overlay.remove();
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                const v = input.value.trim();
                if (v) { close(); cb(v); }
            } else if (e.key === 'Escape') {
                e.preventDefault();
                close();
            }
        });
        overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
    }

    function showTemplatePickerDialog(templates, cb) {
        const overlay = document.createElement('div');
        overlay.className = 'nsft-cmdp-overlay';
        overlay.setAttribute('data-theme', resolveTheme());
        const names = Object.keys(templates).sort();
        const titleTxt = escapeHtml(i18nMsg('cmdp_tpl_pick_title', 'Select a template to apply'));
        const deleteTxt = escapeHtml(i18nMsg('sql_fav_delete', 'Delete'));

        overlay.innerHTML = `
            <div class="nsft-cmdp-panel">
                <div class="nsft-cmdp-input-wrap" style="font-size: 13px; font-weight: 600; color: var(--cmdp-text-primary, #111827);">
                    ${titleTxt}
                </div>
                <div class="nsft-cmdp-list" role="listbox">
                    ${names.map(n => {
            const tpl = templates[n];
            const count = (tpl.fields || []).length;
            const safeName = escapeHtml(n);
            const safeType = escapeHtml(tpl.recordType || '');
            return `<div class="nsft-cmdp-item" data-tpl="${safeName}" role="option">
                                    <span class="nsft-cmdp-item-label">${safeName}</span>
                                    <span class="nsft-cmdp-item-cat">${count} ${safeType ? '· ' + safeType : ''}</span>
                                    <span class="nsft-cmdp-item-delete" data-tpl-delete="${safeName}" title="${deleteTxt}" style="margin-left: 8px; cursor: pointer; opacity: 0.6;">&times;</span>
                                </div>`;
        }).join('')}
                </div>
                <div class="nsft-cmdp-footer">
                    <span class="nsft-cmdp-hint"><kbd>↵</kbd> ${escapeHtml(i18nMsg('cmdp_hint_run', 'Apply'))}</span>
                    <span class="nsft-cmdp-hint"><kbd>Esc</kbd> ${escapeHtml(i18nMsg('cmdp_hint_close', 'Close'))}</span>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);
        const onEsc = (e) => {
            if (e.key === 'Escape') { e.preventDefault(); close(); }
        };
        const close = () => {
            document.removeEventListener('keydown', onEsc);
            overlay.remove();
        };
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) { close(); return; }
            if (e.target.hasAttribute('data-tpl-delete')) {
                e.stopPropagation();
                const name = e.target.getAttribute('data-tpl-delete');
                const pregunta = `${i18nMsg('cmdp_tpl_delete_confirm', 'Delete template')} "${name}"?`;
                const borrar = () => loadFieldTemplates((all) => {
                    delete all[name];
                    saveFieldTemplates(all, () => {
                        close();
                        toast(i18nMsg('cmdp_tpl_deleted', 'Template deleted'));
                    }, () => {
                        close();
                        toast(i18nMsg('cmdp_tpl_save_failed', 'Failed to save template'), 'error');
                    });
                });
                if (window.NSFT_Dialog) {
                    window.NSFT_Dialog.confirm({ body: pregunta, danger: true }).then((si) => { if (si) borrar(); });
                } else if (confirm(pregunta)) {
                    borrar();
                }
                return;
            }
            const item = e.target.closest('.nsft-cmdp-item');
            if (item) {
                const name = item.getAttribute('data-tpl');
                close();
                cb(name);
            }
        });
        document.addEventListener('keydown', onEsc);
    }
})();
