
try {
    importScripts('modules/_shared/nsft_defaults.js');
    importScripts('modules/_shared/nsft_grouped_tabs_colors.js');
    importScripts('modules/_shared/nsft_env.js');
} catch (e) {
}

chrome.runtime.onInstalled.addListener(({ reason }) => {
    if (reason !== 'install' && reason !== 'update') return;
    const defaults = globalThis.NSFT_DEFAULTS;

    if (reason === 'install') {
        try {
            chrome.tabs.create({ url: chrome.runtime.getURL('welcome/welcome.html') });
        } catch (e) { }
        try {
            chrome.storage.local.set({ nsftUpdateSeenVersion: chrome.runtime.getManifest().version });
        } catch (e) { }
    }

    chrome.storage.local.get({ nsftInstalledAt: 0 }, (it) => {
        if (chrome.runtime.lastError) return;
        if (!it.nsftInstalledAt) chrome.storage.local.set({ nsftInstalledAt: Date.now() });
    });

    try { consolidateDuplicateGroups(); } catch (e) { }


    if (!defaults) return;

    chrome.storage.local.get(null, (current) => {
        if (chrome.runtime.lastError) return;
        const missing = {};
        Object.keys(defaults).forEach(k => {
            if (current[k] === undefined) missing[k] = defaults[k];
        });
        const missingCount = Object.keys(missing).length;
        if (!missingCount) return;
        chrome.storage.local.set(missing, () => {
            if (!chrome.runtime.lastError) {
                console.log(`[NSFT] Seeded ${missingCount} missing setting(s) on ${reason}.`);
            }
        });
    });

    chrome.storage.local.get({ nsftTheme: 'light', enableDarkMode: false }, (t) => {
        if (chrome.runtime.lastError) return;
        const isDark = t.enableDarkMode === true || t.nsftTheme === 'dark';
        const want = { nsftTheme: isDark ? 'dark' : 'light', enableDarkMode: isDark };
        if (t.nsftTheme !== want.nsftTheme || t.enableDarkMode !== want.enableDarkMode) {
            chrome.storage.local.set(want);
        }
    });

    const syncKeys = [
        ...(globalThis.NSFT_SYNC_PRIMARY_KEYS || []),
        ...(globalThis.NSFT_SYNC_MIRRORED_KEYS || [])
    ];
    if (!syncKeys.length) return;
    chrome.storage.sync.get(syncKeys, (syncItems) => {
        if (chrome.runtime.lastError) return;
        const missingInSync = syncKeys.filter(k => syncItems[k] === undefined);
        if (!missingInSync.length) return;
        chrome.storage.local.get(missingInSync, (localItems) => {
            if (chrome.runtime.lastError) return;
            const toCopy = {};
            missingInSync.forEach(k => {
                if (localItems[k] !== undefined) toCopy[k] = localItems[k];
            });
            if (!Object.keys(toCopy).length) return;
            chrome.storage.sync.set(toCopy);
        });
    });

    chrome.storage.sync.get({ groupedTabsConfig: null }, (syncRes) => {
        if (chrome.runtime.lastError) return;
        const syncCfg = syncRes.groupedTabsConfig;
        if (Array.isArray(syncCfg) && syncCfg.length) return;
        chrome.storage.local.get({ groupedTabsConfig: null }, (localRes) => {
            if (chrome.runtime.lastError) return;
            const localCfg = localRes.groupedTabsConfig;
            if (Array.isArray(localCfg) && localCfg.length) {
                chrome.storage.sync.set({ groupedTabsConfig: localCfg });
            }
        });
    });
});

chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (changes.enableDarkMode) {
        const isDark = changes.enableDarkMode.newValue === true;
        chrome.storage.local.get({ nsftTheme: 'light' }, (it) => {
            if (chrome.runtime.lastError) return;
            const want = isDark ? 'dark' : 'light';
            if (it.nsftTheme !== want) chrome.storage.local.set({ nsftTheme: want });
        });
    } else if (changes.nsftTheme) {
        const isDark = changes.nsftTheme.newValue === 'dark';
        chrome.storage.local.get({ enableDarkMode: false }, (it) => {
            if (chrome.runtime.lastError) return;
            if (it.enableDarkMode !== isDark) chrome.storage.local.set({ enableDarkMode: isDark });
        });
    }
});

chrome.runtime.onStartup.addListener(() => {
    try { consolidateDuplicateGroups(); } catch (e) { }
});

const UNINSTALL_SURVEY_URL =
    'https://docs.google.com/forms/d/e/1FAIpQLSe0HBYwBy9fyGplAFjaeRenSwX_m-vCb3mu8Uwef4Wr3h5nNg/viewform?usp=sf_link';

try {
    chrome.runtime.setUninstallURL(UNINSTALL_SURVEY_URL, () => {
        if (chrome.runtime.lastError) { }
    });
} catch (e) { }

self.addEventListener('unhandledrejection', (event) => {
    const msg = event.reason && event.reason.message ? event.reason.message : '';
    if (/No (tab|group) with id:|Tabs cannot be edited right now/i.test(msg)) {
        event.preventDefault();
    }
});

const NSFT_LEGAL_SUFFIX_REGEX = /[ ,.]+(s\.?\s*a\.?\s*p\.?\s*i\.?\s*de\s*c\.?\s*v\.?|s\.?\s*a\.?\s*b\.?\s*de\s*c\.?\s*v\.?|s\.?\s*a\.?\s*de\s*c\.?\s*v\.?|s\.?\s*de\s*r\.?\s*l\.?\s*de\s*c\.?\s*v\.?|s\.?\s*de\s*r\.?\s*l\.?|s\.?\s*a\.?\s*p\.?\s*i\.?|s\.?\s*a\.?\s*b\.?|s\.?a\.?s|s\.?r\.?l\.?|s\.?\s*a\.?|a\.?\s*c\.?|s\.?\s*c\.?|ltda\.?|inc\.?|llc\.?|ltd\.?|gmbh\.?|ag\.?|n\.?v\.?|b\.?v\.?|p\.?l\.?c\.?|corporation|corp\.?|company|co\.?)(?=\s|,|\.|$)/i;

const NSFT_TAX_ID_NOISE_REGEX = /[ ,.()/-]+(?:rfc|cuit|cnpj|ein|nif|vat|nit|ruc|tax\s*id|tax)[ :.]/i;

const NSFT_FILLER_WORDS = new Set([
    'DE', 'DEL', 'LA', 'EL', 'LAS', 'LOS', 'A', 'AL',
    'Y', 'E', 'O', 'U',
    'POR', 'PARA', 'CON', 'SOBRE', 'EN',
    'THE', 'OF', 'AND', 'BY', 'FOR', 'IN', 'ON', 'AT', 'TO',
    '&', '-', '|', '/'
]);
const NSFT_CORPORATE_PREFIXES = [
    'DESARROLLOS', 'DESARROLLADORA', 'DESARROLLADORES',
    'GRUPO', 'GRUPOS',
    'EMPRESA', 'EMPRESAS', 'EMPRESARIAL',
    'ASOCIACIÓN', 'ASOCIACION', 'ASOCIACIONES',
    'FUNDACIÓN', 'FUNDACION',
    'SOCIEDAD',
    'INSTITUTO', 'CENTRO', 'CONJUNTO',
    'COMPAÑÍA', 'COMPAÑIA',
    'COOPERATIVA', 'HOLDING', 'HOLDINGS',
    'INMOBILIARIA', 'INMOBILIARIAS',
    'CORPORACIÓN', 'CORPORACION', 'CORPORATIVO',
    'COMERCIAL', 'COMERCIALIZADORA', 'COMERCIALIZADORAS',
    'SERVICIOS', 'SERVICIO',
    'INDUSTRIAS', 'INDUSTRIA', 'INDUSTRIAL',
    'CONSTRUCTORA', 'CONSTRUCCIONES', 'CONSTRUCCIÓN', 'CONSTRUCCION',
    'DISTRIBUIDORA', 'DISTRIBUIDORES', 'DISTRIBUCIONES', 'DISTRIBUCIÓN', 'DISTRIBUCION',
    'OPERADORA', 'OPERACIONES',
    'AGRICOLA', 'AGRÍCOLA', 'AGROPECUARIA', 'AGROINDUSTRIAS', 'AGROINDUSTRIAL',
    'MANUFACTURAS', 'MANUFACTURERA',
    'PROYECTOS', 'NEGOCIOS',
    'CONSULTORES', 'CONSULTORIA', 'CONSULTORÍA',
    'PROMOTORA', 'PROMOTORES', 'PROMOCIONES',
    'ARRENDADORA', 'INVERSIONES', 'INVERSIONISTAS', 'INVERSORA',
    'TRANSPORTES', 'TRANSPORTADORA',
    'LOGISTICA', 'LOGÍSTICA',
    'TECNOLOGÍA', 'TECNOLOGIA', 'TECNOLOGÍAS', 'TECNOLOGIAS',
    'SOLUCIONES', 'PRODUCTOS', 'PRODUCTORA',
    'IMPORTADORA', 'EXPORTADORA',
    'GLOBAL', 'INTERNACIONAL', 'NACIONAL',
    'GROUP', 'GROUPS',
    'DEVELOPMENT', 'DEVELOPMENTS', 'DEVELOPERS',
    'ENTERPRISE', 'ENTERPRISES',
    'ASSOCIATION', 'ASSOCIATIONS',
    'FOUNDATION',
    'INSTITUTE',
    'COMPANY', 'COMPANIES',
    'COOPERATIVE',
    'CORPORATION', 'CORPORATE',
    'COMMERCIAL',
    'SERVICES', 'SERVICE',
    'INDUSTRIES', 'INDUSTRY', 'INDUSTRIAL',
    'BUILDERS', 'BUILDING', 'CONSTRUCTION', 'CONSTRUCTIONS',
    'DISTRIBUTION', 'DISTRIBUTORS',
    'OPERATIONS', 'OPERATING',
    'MANUFACTURING', 'MANUFACTURERS',
    'PROJECTS',
    'CONSULTING', 'CONSULTANTS',
    'INVESTMENTS', 'INVESTORS',
    'TRANSPORT', 'TRANSPORTS', 'TRANSPORTATION',
    'LOGISTICS',
    'TECHNOLOGY', 'TECHNOLOGIES',
    'SOLUTIONS', 'PRODUCTS',
    'INTERNATIONAL', 'GLOBAL', 'WORLDWIDE',
    'TRUST', 'PARTNERS', 'PARTNERSHIP', 'VENTURES',
    'IMPORTS', 'EXPORTS'
];
function nsftExtractBrandFromCompanyName(fullName, maxLen) {
    let s = String(fullName || '').trim();
    if (!s) return '';

    const taxMatch = s.match(NSFT_TAX_ID_NOISE_REGEX);
    if (taxMatch && taxMatch.index > 0) {
        const head = s.substring(0, taxMatch.index).trim();
        if (head) s = head;
    }

    const legalMatch = s.match(NSFT_LEGAL_SUFFIX_REGEX);
    if (legalMatch && legalMatch.index > 0) {
        const head = s.substring(0, legalMatch.index).trim();
        if (head) s = head;
    }

    let stripped = true;
    while (stripped) {
        stripped = false;
        const upper = s.toUpperCase();
        for (const prefix of NSFT_CORPORATE_PREFIXES) {
            if (upper.startsWith(prefix + ' ')) {
                const rest = s.substring(prefix.length + 1).trim();
                if (rest.length > 0) {
                    s = rest;
                    stripped = true;
                    break;
                }
            }
        }
    }

    const allWords = s.split(/\s+/).filter(Boolean);
    const meaningfulWords = allWords.filter(w => !NSFT_FILLER_WORDS.has(w.toUpperCase()));
    const pool = meaningfulWords.length ? meaningfulWords : allWords;

    let result = '';
    let wordCount = 0;
    for (const word of pool) {
        if (wordCount >= 2) break;
        if (!result) {
            if (!maxLen || word.length <= maxLen) {
                result = word;
                wordCount = 1;
            }
        } else {
            const candidate = result + ' ' + word;
            if (!maxLen || candidate.length <= maxLen) {
                result = candidate;
                wordCount = 2;
            }
        }
    }
    if (!result) result = pool[0] || '';
    return result.toUpperCase();
}

const groupingTimeouts = {};

const NS_URL_PATTERN =
    (globalThis.NSFT_ENV && globalThis.NSFT_ENV.NS_URL_PATTERN) ||
    /https:\/\/([a-zA-Z0-9\-_]+)\.?(?:app|extforms)\.netsuite\.com\//;

const isNetSuiteUrl =
    (globalThis.NSFT_ENV && globalThis.NSFT_ENV.isNetSuiteUrl) ||
    function (url) { return typeof url === 'string' && NS_URL_PATTERN.test(url); };

function debounceTabGrouping(tabId, tab) {
    if (groupingTimeouts[tabId]) {
        clearTimeout(groupingTimeouts[tabId]);
    }
    groupingTimeouts[tabId] = setTimeout(() => {
        delete groupingTimeouts[tabId];
        handleTabGrouping(tabId, tab);
    }, 200);
}

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (!changeInfo.url) return;
    if (isNetSuiteUrl(changeInfo.url)) {
        debounceTabGrouping(tabId, tab);
        updateEnvBadge(tabId, changeInfo.url);
    } else {
        clearBadge(tabId);
        if (tab.groupId && tab.groupId !== chrome.tabGroups.TAB_GROUP_ID_NONE) {
            debounceTabGrouping(tabId, tab);
        }
    }
});

chrome.tabs.onCreated.addListener((tab) => {
    if (!isNetSuiteUrl(tab.url)) return;
    debounceTabGrouping(tab.id, tab);
    updateEnvBadge(tab.id, tab.url);
});

chrome.tabs.onActivated.addListener((info) => {
    getGroupingSettings().then((items) => {
        if (!items.enableGroupedTabs) return;
        if (!items.groupedTabsAutoCollapse) return;

        chrome.tabs.get(info.tabId, (activeTab) => {
            if (chrome.runtime.lastError || !activeTab) return;
            const activeGroupId = activeTab.groupId && activeTab.groupId !== chrome.tabGroups.TAB_GROUP_ID_NONE
                ? activeTab.groupId
                : null;

            chrome.tabGroups.query({ windowId: activeTab.windowId }, (groups) => {
                if (chrome.runtime.lastError || !groups) return;
                groups.forEach(g => {
                    if (g.id === activeGroupId) return;
                    if (!_nsftCreatedGroups.has(g.id)) return;
                    if (g.collapsed) return;
                    safeTabGroupsUpdate(g.id, { collapsed: true });
                });
            });
        });
    });
});

const _tabToGroup = new Map();

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
    if (changeInfo.groupId === undefined) return;
    if (changeInfo.groupId === chrome.tabGroups.TAB_GROUP_ID_NONE) {
        _tabToGroup.delete(tabId);
    } else {
        _tabToGroup.set(tabId, changeInfo.groupId);
    }
});

chrome.tabs.onRemoved.addListener((tabId, removeInfo) => {
    if (groupingTimeouts[tabId]) {
        clearTimeout(groupingTimeouts[tabId]);
        delete groupingTimeouts[tabId];
    }

    const knownGroupId = _tabToGroup.get(tabId);
    _tabToGroup.delete(tabId);

    if (removeInfo.isWindowClosing) return;

    if (knownGroupId && knownGroupId !== chrome.tabGroups.TAB_GROUP_ID_NONE) {
        chrome.tabs.query({ groupId: knownGroupId }, (tabs) => {
            if (!chrome.runtime.lastError && tabs && tabs.length === 0) {
                safeTabGroupsUpdate(knownGroupId, { title: '', color: 'grey' });
            }
        });
        return;
    }

    chrome.tabGroups.query({ windowId: removeInfo.windowId }, (groups) => {
        if (chrome.runtime.lastError || !groups || !groups.length) return;
        chrome.tabs.query({ windowId: removeInfo.windowId }, (tabs) => {
            if (chrome.runtime.lastError || !tabs) return;
            const groupsWithTabs = new Set();
            tabs.forEach(t => {
                if (t.groupId && t.groupId !== chrome.tabGroups.TAB_GROUP_ID_NONE) {
                    groupsWithTabs.add(t.groupId);
                }
            });
            groups.forEach(g => {
                if (!groupsWithTabs.has(g.id)) {
                    safeTabGroupsUpdate(g.id, { title: '', color: 'grey' });
                }
            });
        });
    });
});


function safeTabGroupsUpdate(groupId, props) {
    try {
        return chrome.tabGroups.update(groupId, props).catch(() => null);
    } catch (e) {
        return Promise.resolve(null);
    }
}

function safeTabsGroup(props) {
    try {
        return chrome.tabs.group(props).catch(() => null);
    } catch (e) {
        return Promise.resolve(null);
    }
}

function safeTabsUngroup(tabIds) {
    try {
        return chrome.tabs.ungroup(tabIds).catch(() => null);
    } catch (e) {
        return Promise.resolve(null);
    }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!message) return;

    if (message.nsftRlv === 'openPanel') {
        const tabId = sender && sender.tab ? sender.tab.id : null;
        if (typeof tabId !== 'number' || !chrome.sidePanel) {
            sendResponse({ ok: false, reason: 'no_side_panel' });
            return;
        }
        try {
            chrome.sidePanel.setOptions({ tabId, path: 'sidepanel/record_logs_panel.html', enabled: true });
            chrome.sidePanel.open({ tabId })
                .then(() => sendResponse({ ok: true }))
                .catch((e) => sendResponse({ ok: false, reason: (e && e.message) || 'side_panel_failed' }));
        } catch (e) {
            sendResponse({ ok: false, reason: (e && e.message) || 'side_panel_failed' });
            return;
        }
        return true;
    }

    if (message.nsftPanel === 'open') {
        const PANEL_PATHS = {
            ro: 'sidepanel/record_object_panel.html',
            ai: 'sidepanel/ai_panel.html'
        };
        const path = PANEL_PATHS[message.panel];
        const tabId = sender && sender.tab ? sender.tab.id : null;
        if (!path || typeof tabId !== 'number' || !chrome.sidePanel) {
            sendResponse({ ok: false, reason: 'no_side_panel' });
            return;
        }
        try {
            chrome.sidePanel.setOptions({ tabId, path, enabled: true });
            chrome.sidePanel.open({ tabId })
                .then(() => sendResponse({ ok: true }))
                .catch((e) => sendResponse({ ok: false, reason: (e && e.message) || 'side_panel_failed' }));
        } catch (e) {
            sendResponse({ ok: false, reason: (e && e.message) || 'side_panel_failed' });
            return;
        }
        return true;
    }

    if (message.action === 'nsftCloseSenderTab') {
        const senderTabId = sender && sender.tab ? sender.tab.id : null;
        if (typeof senderTabId !== 'number') {
            sendResponse({ ok: false, reason: 'missing_sender_tab' });
            return;
        }

        chrome.tabs.remove(senderTabId, () => {
            if (chrome.runtime.lastError) {
                sendResponse({ ok: false, reason: chrome.runtime.lastError.message || 'tabs_remove_failed' });
                return;
            }
            sendResponse({ ok: true });
        });
        return true;
    }

    if (message.action === 'nsftOpenSettings') {
        const id = typeof message.highlight === 'string' ? message.highlight : '';
        const safe = /^[A-Za-z0-9_]{1,64}$/.test(id) ? id : '';

        const openInTab = () => {
            const url = chrome.runtime.getURL('popup/popup.html') + (safe ? '?highlight=' + safe : '');
            chrome.tabs.create({ url }, () => {
                sendResponse(chrome.runtime.lastError
                    ? { ok: false, reason: chrome.runtime.lastError.message }
                    : { ok: true, via: 'tab' });
            });
        };

        const proceed = () => {
            if (!chrome.action || typeof chrome.action.openPopup !== 'function') { openInTab(); return; }
            try {
                const p = chrome.action.openPopup();
                if (p && typeof p.then === 'function') {
                    p.then(() => sendResponse({ ok: true, via: 'popup' })).catch(() => openInTab());
                } else {
                    sendResponse({ ok: true, via: 'popup' });
                }
            } catch (e) { openInTab(); }
        };

        if (safe) {
            chrome.storage.local.set({ nsftSettingsHighlight: { id: safe, ts: Date.now() } }, proceed);
        } else {
            proceed();
        }
        return true;
    }

    if (message.action === 'nsftFetchScriptingHtml') {
        const url = message.url;
        if (typeof url !== 'string' ||
            !/^https:\/\/[a-z0-9\-_.]+\.app\.netsuite\.com\/app\/common\/scripting\/script\.nl\?/i.test(url)) {
            sendResponse({ ok: false, reason: 'bad_url' });
            return;
        }
        fetch(url, { credentials: 'include' })
            .then((r) => (r.ok ? r.text() : Promise.reject(new Error('http_' + r.status))))
            .then((text) => sendResponse({ ok: true, text }))
            .catch((err) => sendResponse({ ok: false, reason: (err && err.message) || 'fetch_failed' }));
        return true;
    }

    if (message.action === 'nsftAiChat') {
        nsftAiChat(message)
            .then((out) => sendResponse(out))
            .catch((err) => sendResponse({ ok: false, error: (err && err.message) || 'ai_fetch_failed' }));
        return true;
    }

    if (message.action === 'nsftRepairDuplicateGroups') {
        (async () => {
            try {
                const mergedGroups = await consolidateDuplicateGroups();
                let savedGroups = { available: false, deleted: 0, foldersScanned: 0, duplicateClusters: 0, saw_folderType: false };
                if (message.includeSaved) {
                    savedGroups = await consolidateSavedTabGroups();
                }
                sendResponse({
                    ok: true,
                    mergedGroups,
                    savedAvailable: savedGroups.available,
                    savedDeleted: savedGroups.deleted,
                    savedFoldersScanned: savedGroups.foldersScanned,
                    savedDuplicateClusters: savedGroups.duplicateClusters,
                    sawFolderType: savedGroups.saw_folderType
                });
            } catch (err) {
                sendResponse({ ok: false, reason: (err && err.message) || 'repair_failed' });
            }
        })();
        return true;
    }
});


let groupingSettingsCache = null;
let groupingSettingsPromise = null;
function getGroupingSettings() {
    if (groupingSettingsCache) return Promise.resolve(groupingSettingsCache);
    if (groupingSettingsPromise) return groupingSettingsPromise;
    groupingSettingsPromise = new Promise((resolve) => {
        const D = globalThis.NSFT_DEFAULTS || {};
        chrome.storage.sync.get({
            enableGroupedTabs: D.enableGroupedTabs !== undefined ? D.enableGroupedTabs : true,
            enableGroupedTabsAutomatic: D.enableGroupedTabsAutomatic !== undefined ? D.enableGroupedTabsAutomatic : true,
            groupedTabsAutoUseCompanyName: D.groupedTabsAutoUseCompanyName !== undefined ? D.groupedTabsAutoUseCompanyName : false,
            groupedTabsAutoCollapse: D.groupedTabsAutoCollapse !== undefined ? D.groupedTabsAutoCollapse : false,
            groupedTabsConfig: []
        }, (items) => {
            groupingSettingsCache = items;
            groupingSettingsPromise = null;
            resolve(items);
        });
    });
    return groupingSettingsPromise;
}

const ENV_BADGE_CACHE_UNSET = Symbol('nsft-env-badge-cache-unset');
let envBadgeEnabledCache = ENV_BADGE_CACHE_UNSET;
let envBadgePromise = null;
function getEnvBadgeEnabled() {
    if (envBadgeEnabledCache !== ENV_BADGE_CACHE_UNSET) {
        return Promise.resolve(envBadgeEnabledCache);
    }
    if (envBadgePromise) return envBadgePromise;
    envBadgePromise = new Promise((resolve) => {
        chrome.storage.local.get({ enableEnvBadge: true }, (items) => {
            envBadgeEnabledCache = items.enableEnvBadge;
            envBadgePromise = null;
            resolve(items.enableEnvBadge);
        });
    });
    return envBadgePromise;
}

function handleTabGrouping(tabId, tab) {
    getGroupingSettings().then((items) => {
        if (!items.enableGroupedTabs) return;

        const url = tab.url;
        const nsPattern = /https:\/\/([a-zA-Z0-9\-_]+)\.?(?:app|extforms)\.netsuite\.com\//;
        const match = url.match(nsPattern);

        if (match && match[1]) {
            const subdomain = match[1].toLowerCase();
            let config = null;

            if (items.enableGroupedTabsAutomatic) {
                let companyId = subdomain.replace(/-/g, '_');
                const lastUnderscoreIndex = companyId.lastIndexOf('_');
                let envSuffix = 'PRD';

                if (lastUnderscoreIndex !== -1) {
                    const prefix = companyId.substring(0, lastUnderscoreIndex + 1);
                    const suffix = companyId.substring(lastUnderscoreIndex + 1).toUpperCase();
                    companyId = `${prefix}${suffix}`;
                    envSuffix = suffix;
                } else {
                    companyId = `${companyId}_PRD`;
                }

                const colors = (globalThis.NSFT_GROUPED_TABS_COLOR_NAMES) ||
                    ['grey', 'blue', 'red', 'yellow', 'green', 'pink', 'purple', 'cyan', 'orange'];
                let hash = 0;
                for (let i = 0; i < companyId.length; i++) {
                    hash = companyId.charCodeAt(i) + ((hash << 5) - hash);
                }
                const colorIndex = Math.abs(hash) % colors.length;
                const consistentColor = colors[colorIndex];

                config = {
                    label: companyId,
                    color: consistentColor
                };

                if (items.groupedTabsAutoUseCompanyName) {
                    chrome.storage.local.get({ nsftAccountInfoCache: {} }, (cacheItems) => {
                        const cache = cacheItems.nsftAccountInfoCache || {};
                        let info = cache[companyId];
                        if (!info && envSuffix === 'PRD') {
                            const bareId = companyId.replace(/_PRD$/, '');
                            info = cache[bareId];
                        }
                        if (info && info.companyName) {
                            const brand = nsftExtractBrandFromCompanyName(info.companyName, 14);
                            if (brand) config.label = `${brand} ${envSuffix}`;
                        }
                        groupTab(tabId, config);
                    });
                    return;
                }

            } else {
                const normalize = (str) => str ? str.replace(/_/g, '-').toLowerCase() : '';
                const normalizedSubdomain = normalize(subdomain);

                config = items.groupedTabsConfig.find(c => normalize(c.id) === normalizedSubdomain);
            }

            if (config) {
                groupTab(tabId, config);
            }
        } else {
            if (tab.groupId && tab.groupId !== chrome.tabGroups.TAB_GROUP_ID_NONE) {
                chrome.tabGroups.get(tab.groupId, (group) => {
                    if (chrome.runtime.lastError || !group) return;

                    const isNSGroup =
                        _nsftCreatedGroups.has(tab.groupId) ||
                        (group.title && items.groupedTabsConfig.some(c => c.label === group.title || c.id === group.title)) ||
                        (group.title && (group.title.includes('_PRD') || group.title.includes('_SB')));

                    if (isNSGroup) {
                        safeTabsUngroup(tabId);
                    }
                });
            }
        }
    });
}

const groupOpsByKey = new Map();

function runSerial(key, task) {
    const prev = groupOpsByKey.get(key) || Promise.resolve();
    const next = prev.then(task).catch(() => null);
    groupOpsByKey.set(key, next);
    next.finally(() => {
        if (groupOpsByKey.get(key) === next) groupOpsByKey.delete(key);
    });
    return next;
}

function pTabsGet(tabId) {
    return new Promise((r) => chrome.tabs.get(tabId, (t) =>
        r(chrome.runtime.lastError ? null : t)));
}
function pTabGroupsQueryByTitle(title) {
    return new Promise((r) => chrome.tabGroups.query({ title }, (g) =>
        r(chrome.runtime.lastError ? [] : (g || []))));
}
function pTabGroupsQueryAll() {
    return new Promise((r) => chrome.tabGroups.query({}, (g) =>
        r(chrome.runtime.lastError ? [] : (g || []))));
}
function pTabsQueryByGroupId(groupId) {
    return new Promise((r) => chrome.tabs.query({ groupId }, (t) =>
        r(chrome.runtime.lastError ? [] : (t || []))));
}

const _nsftCreatedGroups = new Set();

async function placeTabAndDedupe(tabId, groupTitle, color) {
    const fresh = await pTabsGet(tabId);
    if (!fresh) return;

    const allWithTitle = await pTabGroupsQueryByTitle(groupTitle);
    const sameWindow = allWithTitle.filter(g => g.windowId === fresh.windowId);

    if (sameWindow.length === 0) {
        const groupId = await safeTabsGroup({ tabIds: tabId });
        if (groupId == null) return;
        await safeTabGroupsUpdate(groupId, { title: groupTitle, color });
        _nsftCreatedGroups.add(groupId);
        return;
    }

    sameWindow.sort((a, b) => a.id - b.id);
    const canonical = sameWindow[0];
    const duplicates = sameWindow.slice(1);
    _nsftCreatedGroups.add(canonical.id);

    if (canonical.color !== color) {
        await safeTabGroupsUpdate(canonical.id, { color });
    }

    if (fresh.groupId !== canonical.id) {
        await safeTabsGroup({ groupId: canonical.id, tabIds: tabId });
    }

    for (const dup of duplicates) {
        const dupTabs = await pTabsQueryByGroupId(dup.id);
        if (dupTabs.length === 0) continue;
        await safeTabsGroup({ groupId: canonical.id, tabIds: dupTabs.map(t => t.id) });
    }
}

function groupTab(tabId, config) {
    const groupTitle = config.label || config.name || config.id;
    const color = config.color || 'grey';

    chrome.tabs.get(tabId, (tab) => {
        if (chrome.runtime.lastError || !tab) return;
        const key = `${tab.windowId}|${groupTitle}`;
        runSerial(key, () => placeTabAndDedupe(tabId, groupTitle, color));
    });
}

async function consolidateSavedTabGroups() {
    if (!chrome.bookmarks) {
        return { available: false, deleted: 0, foldersScanned: 0, duplicateClusters: 0, saw_folderType: false };
    }

    const tree = await new Promise((r) => {
        try { chrome.bookmarks.getTree((t) => r(t || [])); }
        catch (e) { r([]); }
    });
    if (!tree.length) {
        return { available: true, deleted: 0, foldersScanned: 0, duplicateClusters: 0, saw_folderType: false };
    }

    const byKey = new Map();
    let foldersScanned = 0;
    let saw_folderType = false;

    (function walk(nodes, parentId) {
        for (const n of nodes) {
            if (!n.url && n.title) {
                foldersScanned++;
                if (n.folderType) saw_folderType = true;
                const key = `${parentId || 'root'}|${n.title}`;
                if (!byKey.has(key)) byKey.set(key, []);
                byKey.get(key).push(n);
            }
            if (n.children) walk(n.children, n.id);
        }
    })(tree, null);

    let deleted = 0;
    let duplicateClusters = 0;

    for (const [, nodes] of byKey) {
        if (nodes.length < 2) continue;

        const hasSTG = nodes.some(n => n.folderType === 'saved_tab_group');
        if (!hasSTG && nodes.length < 3) continue;

        duplicateClusters++;
        nodes.sort((a, b) => (b.dateAdded || 0) - (a.dateAdded || 0));
        const toDelete = nodes.slice(1);

        for (const d of toDelete) {
            try {
                await new Promise((res) => {
                    chrome.bookmarks.removeTree(d.id, () => res());
                });
                deleted++;
            } catch (e) { }
        }
    }

    return { available: true, deleted, foldersScanned, duplicateClusters, saw_folderType };
}

async function consolidateDuplicateGroups() {
    const groups = await pTabGroupsQueryAll();
    if (groups.length < 2) return 0;

    const byKey = new Map();
    for (const g of groups) {
        if (!g.title) continue;
        const k = `${g.windowId}|${g.title}`;
        if (!byKey.has(k)) byKey.set(k, []);
        byKey.get(k).push(g);
    }

    const pending = [];
    let mergedCount = 0;

    for (const [key, dupes] of byKey) {
        if (dupes.length < 2) continue;
        dupes.sort((a, b) => a.id - b.id);
        const canonical = dupes[0];
        const others = dupes.slice(1);
        mergedCount += others.length;

        pending.push(runSerial(key, async () => {
            for (const dup of others) {
                const tabs = await pTabsQueryByGroupId(dup.id);
                if (tabs.length === 0) continue;
                await safeTabsGroup({ groupId: canonical.id, tabIds: tabs.map(t => t.id) });
            }
        }));
    }

    await Promise.all(pending);

    return mergedCount;
}


function detectEnv(subdomain) {
    if (globalThis.NSFT_ENV && globalThis.NSFT_ENV.detectEnv) {
        return globalThis.NSFT_ENV.detectEnv(subdomain);
    }
    const s = (subdomain || '').toLowerCase();
    if (/^tstdrv\d+$/.test(s)) return { code: 'TD', color: '#8b5cf6', name: 'Testdrive' };
    const parts = s.split('-');
    if (parts.length === 1) return { code: 'PRD', color: '#dc2626', name: 'Production' };
    const suffix = parts[parts.length - 1].toUpperCase();
    if (/^SB\d*$/.test(suffix)) return { code: suffix, color: '#16a34a', name: 'Sandbox ' + suffix };
    if (suffix === 'RP') return { code: 'RP', color: '#2563eb', name: 'Release Preview' };
    return { code: suffix.slice(0, 4), color: '#6b7280', name: suffix };
}

const ENV_COLOR_KEYS = {
    PRD: 'envBadgeColorPrd',
    SB: 'envBadgeColorSb',
    RP: 'envBadgeColorRp'
};
const ENV_COLOR_CACHE_UNSET = Symbol('nsft-env-colors-cache-unset');
let envColorsCache = ENV_COLOR_CACHE_UNSET;
let envColorsPromise = null;

function getEnvColors() {
    if (envColorsCache !== ENV_COLOR_CACHE_UNSET) return Promise.resolve(envColorsCache);
    if (envColorsPromise) return envColorsPromise;
    envColorsPromise = new Promise((resolve) => {
        const defaults = globalThis.NSFT_DEFAULTS || {};
        const query = {};
        Object.values(ENV_COLOR_KEYS).forEach(k => { query[k] = defaults[k]; });
        chrome.storage.local.get(query, (items) => {
            envColorsCache = items;
            envColorsPromise = null;
            resolve(items);
        });
    });
    return envColorsPromise;
}

function pickEnvColor(env, colors) {
    const family = (globalThis.NSFT_ENV && globalThis.NSFT_ENV.envFamily(env.code)) || 'DEFAULT';
    const key = ENV_COLOR_KEYS[family] || ENV_COLOR_KEYS.DEFAULT;
    return colors[key] || env.color;
}

function computeTextColor(hex) {
    const h = (hex || '').replace('#', '');
    if (h.length !== 6) return '#ffffff';
    const r = parseInt(h.slice(0, 2), 16) / 255;
    const g = parseInt(h.slice(2, 4), 16) / 255;
    const b = parseInt(h.slice(4, 6), 16) / 255;
    const toLin = (c) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
    const lum = 0.2126 * toLin(r) + 0.7152 * toLin(g) + 0.0722 * toLin(b);
    return lum > 0.6 ? '#000000' : '#ffffff';
}

const envBadgeAppliedCode = new Map();

function updateEnvBadge(tabId, url) {
    getEnvBadgeEnabled().then((enabled) => {
        if (!enabled) {
            clearBadge(tabId);
            return;
        }

        const match = url && url.match(NS_URL_PATTERN);
        if (!match || !match[1]) {
            clearBadge(tabId);
            return;
        }

        const env = detectEnv(match[1]);
        getEnvColors().then((colors) => {
            const bg = pickEnvColor(env, colors);
            const fg = computeTextColor(bg);
            const stateKey = `${env.code}|${bg}`;
            if (envBadgeAppliedCode.get(tabId) === stateKey) return;

            try {
                chrome.action.setBadgeText({ tabId, text: env.code });
                chrome.action.setBadgeBackgroundColor({ tabId, color: bg });
                if (chrome.action.setBadgeTextColor) {
                    chrome.action.setBadgeTextColor({ tabId, color: fg });
                }
                chrome.action.setTitle({ tabId, title: `NetSuite Full Tools — ${env.name}` });
                envBadgeAppliedCode.set(tabId, stateKey);
            } catch (e) {
            }
        });
    });
}

function clearBadge(tabId) {
    const hadBadge = envBadgeAppliedCode.has(tabId);
    envBadgeAppliedCode.delete(tabId);
    try {
        chrome.action.setBadgeText({ tabId, text: '' });
        if (hadBadge) {
            chrome.action.setTitle({ tabId, title: 'NetSuite Full Tools' });
        }
    } catch (e) {
    }
}

function sweepEnvBadges() {
    try {
        chrome.tabs.query({}, (tabs) => {
            if (chrome.runtime.lastError || !tabs) return;
            tabs.forEach(t => {
                if (isNetSuiteUrl(t.url)) updateEnvBadge(t.id, t.url);
                else clearBadge(t.id);
            });
        });
    } catch (e) { }
}

chrome.tabs.onRemoved.addListener((tabId) => {
    envBadgeAppliedCode.delete(tabId);
});

let _consolidateTimer = null;
function nsftScheduleConsolidate() {
    if (_consolidateTimer) clearTimeout(_consolidateTimer);
    _consolidateTimer = setTimeout(() => {
        _consolidateTimer = null;
        try { consolidateDuplicateGroups(); } catch (e) { }
    }, 500);
}

const NSFT_GROUPING_KEYS = ['enableGroupedTabs', 'enableGroupedTabsAutomatic', 'groupedTabsAutoUseCompanyName', 'groupedTabsAutoCollapse', 'groupedTabsConfig'];
chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'sync') {
        const syncKeys = [
            ...(globalThis.NSFT_SYNC_PRIMARY_KEYS || []),
            ...(globalThis.NSFT_SYNC_MIRRORED_KEYS || [])
        ];
        if (syncKeys.length) {
            const mirror = {};
            syncKeys.forEach(k => {
                if (changes[k] && changes[k].newValue !== undefined) {
                    mirror[k] = changes[k].newValue;
                }
            });
            if (Object.keys(mirror).length) {
                chrome.storage.local.set(mirror);
            }
        }

        const touchedGrouping = NSFT_GROUPING_KEYS.some(k => changes[k]);
        if (touchedGrouping) {
            if (groupingSettingsCache) {
                NSFT_GROUPING_KEYS.forEach(k => {
                    if (changes[k]) groupingSettingsCache[k] = changes[k].newValue;
                });
            }
            nsftScheduleConsolidate();
        }
    }

    if (area === 'local' && changes.enableEnvBadge) {
        envBadgeEnabledCache = ENV_BADGE_CACHE_UNSET;
        sweepEnvBadges();
    }

    if (area === 'local') {
        const colorChanged = Object.values(ENV_COLOR_KEYS).some(k => changes[k]);
        if (colorChanged) {
            envColorsCache = ENV_COLOR_CACHE_UNSET;
            envBadgeAppliedCode.clear();
            sweepEnvBadges();
        }
    }
});

chrome.tabGroups.onUpdated.addListener((group) => {
    if (!group || !group.id) return;
    chrome.tabs.query({ groupId: group.id }, (tabs) => {
        if (chrome.runtime.lastError || !tabs || !tabs.length) return;
        const nsTab = tabs.find(t => isNetSuiteUrl(t.url));
        if (!nsTab) return;
        const m = nsTab.url.match(NS_URL_PATTERN);
        if (!m || !m[1]) return;
        const subdomain = m[1].toLowerCase();

        chrome.storage.sync.get({
            groupedTabsConfig: [],
            enableGroupedTabsAutomatic: true,
            enableGroupedTabs: true
        }, (items) => {
            if (chrome.runtime.lastError) return;
            if (!items.enableGroupedTabs) return;
            if (items.enableGroupedTabsAutomatic) return;

            const config = Array.isArray(items.groupedTabsConfig) ? items.groupedTabsConfig.slice() : [];
            const normalize = (s) => s ? s.replace(/_/g, '-').toLowerCase() : '';
            const normSub = normalize(subdomain);
            const idx = config.findIndex(c => normalize(c.id) === normSub);
            if (idx === -1) return;

            const entry = { ...config[idx] };
            let dirty = false;
            if (group.title && entry.label !== group.title) {
                entry.label = group.title;
                dirty = true;
            }
            if (group.color && entry.color !== group.color) {
                entry.color = group.color;
                dirty = true;
            }
            if (!dirty) return;
            config[idx] = entry;
            chrome.storage.sync.set({ groupedTabsConfig: config });
        });
    });
});

async function nsftAiChat(req) {
    const provider = req.provider || 'claude';
    const model = req.model;
    if (!model) return { ok: false, error: 'Falta el modelo en la configuración de IA.' };

    if (provider === 'claude') return nsftAiClaude(req);
    if (provider === 'gemini-interactions') return nsftAiGeminiInteractions(req);
    return nsftAiOpenAICompat(req);
}

function nsftAiUsage(u) {
    if (!u || typeof u !== 'object') return null;
    const num = (v) => (typeof v === 'number' && isFinite(v) ? v : 0);
    const tin = num(u.input_tokens) + num(u.prompt_tokens) + num(u.total_input_tokens);
    const tout = num(u.output_tokens) + num(u.completion_tokens) + num(u.total_output_tokens);
    const total = num(u.total_tokens) || (tin + tout);
    if (!tin && !tout && !total) return null;
    return { in: tin, out: tout, total: total };
}

function nsftAiSleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

function nsftAiRetrySeconds(header, raw) {
    if (header) { const n = parseFloat(header); if (!isNaN(n)) return n; }
    const m = String(raw || '').match(/(?:try again in|retry in|retryDelay"?\s*:\s*")\s*([0-9.]+)\s*s/i);
    if (m) return parseFloat(m[1]);
    return 0;
}

async function nsftAiFetchJson(url, headers, body, attempt) {
    attempt = attempt || 0;
    let res;
    try {
        res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
    } catch (e) {
        return { ok: false, error: 'No se pudo conectar con el proveedor: ' + ((e && e.message) || e) };
    }
    const raw = await res.text();
    let data = null;
    try { data = raw ? JSON.parse(raw) : null; } catch (e) { data = null; }

    if (res.status === 429 && attempt < 2) {
        const wait = nsftAiRetrySeconds(res.headers.get('retry-after'), raw);
        if (wait > 0 && wait <= 12) {
            await nsftAiSleep((wait + 1) * 1000);
            return nsftAiFetchJson(url, headers, body, attempt + 1);
        }
    }

    if (!res.ok) {
        const errObj = Array.isArray(data) ? (data[0] && data[0].error) : (data && data.error);
        let msg = (errObj && (errObj.message || errObj.type)) || (data && data.message) || raw || ('HTTP ' + res.status);

        if (res.status === 429) {
            const retry = nsftAiRetrySeconds(res.headers.get('retry-after'), raw);
            const zeroFree = /limit:\s*0|free_tier/i.test(raw);
            let short = zeroFree
                ? 'Tu cuenta con este proveedor no tiene cuota gratuita disponible (free tier = 0). Cambia de proveedor o habilita billing.'
                : 'Límite de uso del proveedor alcanzado (429).';
            if (retry) short += ' Reintenta en ~' + Math.ceil(retry) + 's.';
            return { ok: false, error: short, status: 429 };
        }

        if (typeof msg === 'string' && msg.length > 500) msg = msg.slice(0, 500) + '…';
        return { ok: false, error: 'HTTP ' + res.status + ': ' + msg, status: res.status };
    }
    return { ok: true, data };
}

async function nsftAiClaude(req) {
    const url = req.baseUrl || 'https://api.anthropic.com/v1/messages';
    const headers = {
        'content-type': 'application/json',
        'x-api-key': req.apiKey || '',
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true'
    };
    const body = {
        model: req.model,
        max_tokens: req.maxTokens || 4096,
        messages: req.messages,
        tools: (req.tools || []).map(t => ({
            name: t.name, description: t.description, input_schema: t.input_schema
        }))
    };
    if (req.system) body.system = req.system;

    const r = await nsftAiFetchJson(url, headers, body);
    if (!r.ok) return r;

    const content = (r.data && r.data.content) || [];
    let text = '';
    const toolCalls = [];
    for (const b of content) {
        if (b.type === 'text') text += b.text || '';
        else if (b.type === 'tool_use') toolCalls.push({ id: b.id, name: b.name, input: b.input || {} });
    }
    return {
        ok: true, text, toolCalls,
        stopReason: toolCalls.length ? 'tool_use' : 'end',
        usage: nsftAiUsage(r.data && r.data.usage)
    };
}

async function nsftAiOpenAICompat(req) {
    const url = req.baseUrl || 'https://api.openai.com/v1/chat/completions';
    const headers = { 'content-type': 'application/json' };
    if (req.apiKey) headers['authorization'] = 'Bearer ' + req.apiKey;
    if (/openrouter\.ai/i.test(url)) {
        headers['HTTP-Referer'] = 'https://github.com/nsft/netsuite-full-tools';
        headers['X-Title'] = 'NetSuite Full Tools SuiteQL AI';
    }

    const oaiMessages = [];
    if (req.system) oaiMessages.push({ role: 'system', content: req.system });
    for (const m of req.messages) {
        const blocks = Array.isArray(m.content) ? m.content : [{ type: 'text', text: String(m.content || '') }];
        if (m.role === 'assistant') {
            let txt = '';
            const toolCalls = [];
            for (const b of blocks) {
                if (b.type === 'text') txt += b.text || '';
                else if (b.type === 'tool_use') {
                    toolCalls.push({
                        id: b.id, type: 'function',
                        function: { name: b.name, arguments: JSON.stringify(b.input || {}) }
                    });
                }
            }
            const am = { role: 'assistant', content: txt || null };
            if (toolCalls.length) am.tool_calls = toolCalls;
            oaiMessages.push(am);
        } else {
            const toolResults = blocks.filter(b => b.type === 'tool_result');
            if (toolResults.length) {
                for (const b of toolResults) {
                    oaiMessages.push({
                        role: 'tool', tool_call_id: b.tool_use_id,
                        content: typeof b.content === 'string' ? b.content : JSON.stringify(b.content)
                    });
                }
            } else {
                const txt = blocks.filter(b => b.type === 'text').map(b => b.text).join('');
                oaiMessages.push({ role: 'user', content: txt });
            }
        }
    }

    const body = {
        model: req.model,
        max_tokens: req.maxTokens || 4096,
        messages: oaiMessages
    };
    if (req.tools && req.tools.length) {
        body.tools = req.tools.map(t => ({
            type: 'function',
            function: { name: t.name, description: t.description, parameters: t.input_schema }
        }));
        body.tool_choice = 'auto';
        body.parallel_tool_calls = false;
    }

    const r = await nsftAiFetchJson(url, headers, body);
    if (!r.ok) {
        let host = '';
        try { host = new URL(url).hostname; } catch (e) { host = ''; }
        if (r.status === 403 && (host === 'localhost' || host === '127.0.0.1')) {
            return { ok: false, error: chrome.i18n.getMessage('sqlai_err_ollama_cors'), status: 403 };
        }
        return r;
    }

    const choice = r.data && r.data.choices && r.data.choices[0];
    const msg = (choice && choice.message) || {};
    const toolCalls = (msg.tool_calls || []).map(tc => {
        let input = {};
        try { input = tc.function && tc.function.arguments ? JSON.parse(tc.function.arguments) : {}; }
        catch (e) { input = { _raw: tc.function && tc.function.arguments }; }
        return { id: tc.id, name: tc.function && tc.function.name, input };
    });
    return {
        ok: true,
        text: typeof msg.content === 'string' ? msg.content : '',
        toolCalls,
        stopReason: toolCalls.length ? 'tool_use' : 'end',
        usage: nsftAiUsage(r.data && r.data.usage)
    };
}


function nsftAiToolNameFor(messages, toolUseId) {
    for (let i = messages.length - 1; i >= 0; i--) {
        const blocks = messages[i] && messages[i].content;
        if (!Array.isArray(blocks)) continue;
        for (const b of blocks) {
            if (b.type === 'tool_use' && b.id === toolUseId) return b.name;
        }
    }
    return undefined;
}

async function nsftAiGeminiInteractions(req) {
    const url = req.baseUrl || 'https://generativelanguage.googleapis.com/v1beta/interactions';
    const headers = { 'content-type': 'application/json' };
    if (req.apiKey) headers['x-goog-api-key'] = req.apiKey;

    const last = (req.messages || [])[req.messages.length - 1] || {};
    const blocks = Array.isArray(last.content)
        ? last.content
        : [{ type: 'text', text: String(last.content || '') }];
    const input = [];
    for (const b of blocks) {
        if (b.type === 'text') {
            input.push({ type: 'text', text: b.text || '' });
        } else if (b.type === 'tool_result') {
            input.push({
                type: 'function_result',
                name: nsftAiToolNameFor(req.messages, b.tool_use_id),
                call_id: b.tool_use_id,
                result: [{ type: 'text', text: typeof b.content === 'string' ? b.content : JSON.stringify(b.content) }]
            });
        }
    }

    const body = { model: req.model, input, store: true };
    if (req.system) body.system_instruction = req.system;
    if (req.maxTokens) body.generation_config = { max_output_tokens: req.maxTokens };
    if (req.previousInteractionId) body.previous_interaction_id = req.previousInteractionId;
    if (req.tools && req.tools.length) {
        body.tools = req.tools.map(t => ({
            type: 'function',
            name: t.name,
            description: t.description,
            parameters: t.input_schema
        }));
    }

    const r = await nsftAiFetchJson(url, headers, body);
    if (!r.ok) return r;
    const data = r.data || {};

    let text = '';
    const toolCalls = [];
    for (const step of (data.steps || [])) {
        if (step.type === 'model_output') {
            for (const c of (step.content || [])) if (c.type === 'text') text += c.text || '';
        } else if (step.type === 'function_call') {
            let input2 = step.arguments;
            if (typeof input2 === 'string') {
                try { input2 = JSON.parse(input2); } catch (e) { input2 = { _raw: step.arguments }; }
            }
            toolCalls.push({ id: step.id, name: step.name, input: input2 || {} });
        }
    }
    return {
        ok: true,
        text,
        toolCalls,
        stopReason: toolCalls.length ? 'tool_use' : 'end',
        interactionId: data.id || null,
        usage: nsftAiUsage(data.usage)
    };
}

sweepEnvBadges();
