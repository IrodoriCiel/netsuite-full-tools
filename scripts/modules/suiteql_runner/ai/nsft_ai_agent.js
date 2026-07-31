(function () {
    'use strict';
    if (window.__nsftAiAgentInit) return;
    window.__nsftAiAgentInit = true;

    const CFG = {
        providerKey: 'nsft_ai_provider_key',
        apiKey: 'nsft_ai_apikey',
        baseUrl: 'nsft_ai_baseurl',
        model: 'nsft_ai_model',
        maxRows: 'nsft_ai_maxrows',
        showSteps: 'nsft_ai_show_steps',
        showTokens: 'nsft_ai_show_tokens',
        maxIters: 'nsft_ai_max_iters',
        askFirst: 'nsft_ai_ask_first',
        ctxLevel: 'nsft_ai_ctx_level',
        ctxPrompts: 'nsft_ai_ctx_prompts',
        maskPii: 'nsft_ai_mask_pii',
        allowWrites: 'nsft_ai_allow_writes',
        budget: 'nsft_ai_budget'
    };
    const SCHEMA_CACHE_KEY = 'nsft_sql_schema_cache';
    const DOCK_WIDTH_KEY = 'nsft_ai_dock_width';
    const DOCK_OPEN_KEY = 'nsft_ai_dock_open';

    let _dockOpenPref = true;
    try {
        chrome.storage.local.get({ [DOCK_OPEN_KEY]: true }, (it) => {
            _dockOpenPref = it[DOCK_OPEN_KEY] !== false;
        });
        chrome.storage.onChanged.addListener((ch, area) => {
            if (area === 'local' && ch[DOCK_OPEN_KEY]) _dockOpenPref = ch[DOCK_OPEN_KEY].newValue !== false;
        });
    } catch (e) { }
    const FETCHER_SCRIPT_ID = 'nsft-suiteql-fetcher-script';
    const AGENT_MAX_ITERS = 30;
    const AGENT_ITERS_MIN = 1;
    const AGENT_ITERS_MAX = 60;
    const TOOL_ROW_CAP = 100;
    const CELL_CAP = 240;

    const PROVIDERS = {
        claude:    { label: 'Claude',                        kind: 'claude',        baseUrl: 'https://api.anthropic.com/v1/messages', model: 'claude-opus-4-8', needsKey: true,
                     models: ['claude-opus-4-8', 'claude-sonnet-5', 'claude-haiku-4-5'],
                     help: { site: 'https://console.anthropic.com/', keys: 'https://console.anthropic.com/settings/keys', docs: 'https://docs.anthropic.com/en/api/messages', models: 'https://docs.anthropic.com/en/docs/about-claude/models/overview' } },
        gemini:    { label: 'Google Gemini',                 kind: 'gemini-interactions', baseUrl: 'https://generativelanguage.googleapis.com/v1beta/interactions', model: 'gemini-3.5-flash', needsKey: true,
                     models: ['gemini-3.5-flash', 'gemini-3.1-flash-lite'],
                     help: { site: 'https://aistudio.google.com/', keys: 'https://aistudio.google.com/apikey', docs: 'https://ai.google.dev/gemini-api/docs/interactions-overview', models: 'https://ai.google.dev/gemini-api/docs/models' } },
        groq:      { label: 'Groq',                          kind: 'openai-compat', baseUrl: 'https://api.groq.com/openai/v1/chat/completions', model: 'openai/gpt-oss-120b', needsKey: true,
                     models: ['openai/gpt-oss-120b', 'openai/gpt-oss-20b', 'llama-3.3-70b-versatile', 'llama-3.1-8b-instant'],
                     help: { site: 'https://console.groq.com/', keys: 'https://console.groq.com/keys', docs: 'https://console.groq.com/docs/openai', models: 'https://console.groq.com/docs/models' } },
        openai:    { label: 'OpenAI',                        kind: 'openai-compat', baseUrl: 'https://api.openai.com/v1/chat/completions', model: 'gpt-4o-mini', needsKey: true,
                     models: ['gpt-4o-mini', 'gpt-4o', 'gpt-4.1', 'gpt-4.1-mini'],
                     help: { site: 'https://platform.openai.com/', keys: 'https://platform.openai.com/api-keys', docs: 'https://platform.openai.com/docs/api-reference/chat', models: 'https://platform.openai.com/docs/models' } },
        openrouter:{ label: 'OpenRouter',                    kind: 'openai-compat', baseUrl: 'https://openrouter.ai/api/v1/chat/completions', model: 'openai/gpt-4o-mini', needsKey: true,
                     models: ['openai/gpt-4o-mini', 'anthropic/claude-sonnet-5', 'meta-llama/llama-3.3-70b-instruct'],
                     help: { site: 'https://openrouter.ai/', keys: 'https://openrouter.ai/workspaces/default/keys', docs: 'https://openrouter.ai/docs/api-reference/overview', models: 'https://openrouter.ai/models?supported_parameters=tools' } },
        deepseek:  { label: 'DeepSeek',                      kind: 'openai-compat', baseUrl: 'https://api.deepseek.com/v1/chat/completions', model: 'deepseek-v4-pro', needsKey: true,
                     models: ['deepseek-v4-pro', 'deepseek-v4-flash'],
                     help: { site: 'https://platform.deepseek.com/', keys: 'https://platform.deepseek.com/api_keys', docs: 'https://api-docs.deepseek.com/', models: 'https://api-docs.deepseek.com/quick_start/pricing' } },
        opencodezen:{ label: 'OpenCode Zen',                 kind: 'openai-compat', baseUrl: 'https://opencode.ai/zen/v1/chat/completions', model: 'claude-sonnet-5', needsKey: true,
                     models: ['claude-sonnet-5', 'claude-opus-4-8', 'gpt-5.5', 'gemini-3.5-flash', 'deepseek-v4-pro',
                              'deepseek-v4-flash-free', 'nemotron-3-ultra-free', 'big-pickle'],
                     help: { site: 'https://opencode.ai/zen/', keys: 'https://opencode.ai/auth', docs: 'https://opencode.ai/docs/zen/', models: 'https://opencode.ai/docs/zen/' } },
        ollama:    { label: 'Ollama',                        kind: 'openai-compat', baseUrl: 'http://localhost:11434/v1/chat/completions', model: 'qwen3.5', needsKey: false,
                     models: ['qwen3.5', 'qwen2.5-coder', 'llama3.1', 'mistral-nemo'],
                     help: { site: 'https://ollama.com/', keys: '', docs: 'https://github.com/ollama/ollama/blob/main/docs/openai.md', models: 'https://ollama.com/library' } },
        custom:    { label: chrome.i18n.getMessage('sqlai_prov_custom'), kind: 'openai-compat', baseUrl: '', model: '', needsKey: true,
                     models: [],
                     help: { site: '', keys: '', docs: '', models: '' } }
    };

    function getNsAccountId() {
        const m = location.hostname.match(/^([a-z0-9]+(?:[-_][a-z0-9]+)*)\./i);
        return m ? m[1].toLowerCase() : location.hostname.toLowerCase();
    }

    function nsftAiOriginPattern(url) {
        if (!url || typeof url !== 'string') return null;
        try {
            const u = new URL(url);
            return u.protocol + '//' + u.hostname + '/*';
        } catch (e) { return null; }
    }

    function nsftAiEnsureHostPermission(url) {
        return new Promise((resolve) => {
            const pattern = nsftAiOriginPattern(url);
            if (!pattern || !chrome.permissions || !chrome.permissions.request) { resolve(true); return; }
            try {
                chrome.permissions.request({ origins: [pattern] }, (granted) => {
                    if (chrome.runtime.lastError) { resolve(false); return; }
                    resolve(!!granted);
                });
            } catch (e) { resolve(true); }
        });
    }

    const ACTIVE_KEY = 'nsft_ai_active';
    const CONFIGS_KEY = 'nsft_ai_configs';

    function loadAll() {
        return new Promise((resolve) => {
            chrome.storage.local.get([ACTIVE_KEY, CONFIGS_KEY, CFG.maxRows, CFG.showSteps,
                CFG.showTokens, CFG.maxIters, CFG.ctxLevel, CFG.ctxPrompts,
                CFG.maskPii, CFG.allowWrites, CFG.budget, CFG.askFirst,
                CFG.providerKey, CFG.apiKey, CFG.baseUrl, CFG.model], (it) => {
                let configs = (it[CONFIGS_KEY] && typeof it[CONFIGS_KEY] === 'object') ? it[CONFIGS_KEY] : null;
                let active = it[ACTIVE_KEY];
                if (!configs) {
                    configs = {};
                    const oldPk = it[CFG.providerKey];
                    if (oldPk && PROVIDERS[oldPk]) {
                        configs[oldPk] = { apiKey: it[CFG.apiKey] || '', baseUrl: it[CFG.baseUrl] || '', model: it[CFG.model] || '' };
                        active = active || oldPk;
                    }
                    try { chrome.storage.local.set({ [CONFIGS_KEY]: configs }); } catch (e) { }
                }
                const DEAD_MODELS = {
                    'gemini-2.5-pro': 'gemini-3.5-flash',
                    'gemini-2.5-flash': 'gemini-3.5-flash',
                    'gemini-2.5-flash-lite': 'gemini-3.1-flash-lite',
                    'gemini-2.0-flash': 'gemini-3.5-flash',
                    'gemini-2.0-flash-lite': 'gemini-3.1-flash-lite',
                    'gemini-1.5-flash': 'gemini-3.5-flash',
                    'gemini-1.5-pro': 'gemini-3.5-flash',
                    'deepseek-chat': 'deepseek-v4-flash',
                    'deepseek-reasoner': 'deepseek-v4-flash'
                };
                const DEAD_BASEURLS = {
                    'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions':
                        'https://generativelanguage.googleapis.com/v1beta/interactions'
                };
                let fixed = false;
                Object.keys(configs).forEach((pk) => {
                    const c = configs[pk]; if (!c) return;
                    if (c.baseUrl && DEAD_BASEURLS[c.baseUrl]) { c.baseUrl = DEAD_BASEURLS[c.baseUrl]; fixed = true; }
                    if (c.model && DEAD_MODELS[c.model]) { c.model = DEAD_MODELS[c.model]; fixed = true; }
                    if (Array.isArray(c.models)) {
                        const next = dedupeModels(c.models.map((m) => DEAD_MODELS[m] || m));
                        if (next.join('\n') !== c.models.join('\n')) { c.models = next; fixed = true; }
                    }
                });
                if (fixed) { try { chrome.storage.local.set({ [CONFIGS_KEY]: configs }); } catch (e) { } }

                if (!active || !configs[active]) active = Object.keys(configs)[0] || 'gemini';
                resolve({
                    active, configs,
                    maxRows: Number(it[CFG.maxRows]) || TOOL_ROW_CAP,
                    showSteps: it[CFG.showSteps] === true,
                    showTokens: it[CFG.showTokens] === true,
                    maxIters: clampIters(it[CFG.maxIters]),
                    ctxLevel: clampCtxLevel(it[CFG.ctxLevel]),
                    ctxPrompts: (it[CFG.ctxPrompts] && typeof it[CFG.ctxPrompts] === 'object') ? it[CFG.ctxPrompts] : {},
                    maskPii: it[CFG.maskPii] !== false,
                    allowWrites: it[CFG.allowWrites] === true,
                    askFirst: it[CFG.askFirst] !== false,
                    budget: Math.max(0, Math.floor(Number(it[CFG.budget])) || 0)
                });
            });
        });
    }

    function clampIters(v) {
        const n = Math.floor(Number(v));
        if (!isFinite(n) || n <= 0) return AGENT_MAX_ITERS;
        return Math.min(AGENT_ITERS_MAX, Math.max(AGENT_ITERS_MIN, n));
    }

    function dedupeModels(list) {
        const out = [];
        (list || []).forEach((m) => {
            const v = String(m || '').trim();
            if (v && out.indexOf(v) === -1) out.push(v);
        });
        return out;
    }

    function cfgModels(pk, saved) {
        const preset = PROVIDERS[pk] || {};
        if (saved && Array.isArray(saved.models)) return dedupeModels(saved.models);
        if (saved && saved.model) return dedupeModels([saved.model]);
        return dedupeModels(preset.models && preset.models.length ? preset.models : [preset.model]);
    }

    function resolveCfg(pk, configs, maxRows) {
        const preset = PROVIDERS[pk] || PROVIDERS.gemini;
        const saved = (configs && configs[pk]) || {};
        const models = cfgModels(pk, saved);
        let model = '';
        if (models.length) {
            model = saved.model || preset.model || '';
            if (models.indexOf(model) === -1) model = models[0];
        }
        return {
            providerKey: pk,
            kind: preset.kind,
            apiKey: saved.apiKey || '',
            baseUrl: saved.baseUrl || preset.baseUrl,
            model: model,
            models: models,
            maxRows: maxRows
        };
    }

    function isConfigured(pk, configs) {
        const preset = PROVIDERS[pk]; if (!preset) return false;
        const saved = configs && configs[pk]; if (!saved) return false;
        if (preset.needsKey && !saved.apiKey) return false;
        return cfgModels(pk, saved).length > 0;
    }

    function loadConfig() {
        return loadAll().then((a) => {
            const cfg = Object.assign(resolveCfg(a.active, a.configs, a.maxRows), {
                maxIters: a.maxIters,
                ctxLevel: a.ctxLevel,
                ctxPrompts: a.ctxPrompts,
                maskPii: a.maskPii,
                allowWrites: a.allowWrites,
                budget: a.budget
            });
            const hidden = ((a.configs[a.active] || {}).hidden) || [];
            cfg.fallbackModels = cfg.models.filter((m) => m !== cfg.model && hidden.indexOf(m) === -1);
            return cfg;
        });
    }

    function setActiveProvider(pk) {
        return new Promise((resolve) => chrome.storage.local.set({ [ACTIVE_KEY]: pk }, resolve));
    }

    function setActiveModel(pk, model) {
        return loadAll().then((a) => new Promise((resolve) => {
            const configs = a.configs || {};
            if (!configs[pk]) { resolve(); return; }
            configs[pk] = Object.assign({}, configs[pk], { model: model });
            chrome.storage.local.set({ [CONFIGS_KEY]: configs }, resolve);
        }));
    }

    function saveProviderConfig(pk, cfg, prefs) {
        prefs = prefs || {};
        return loadAll().then((a) => new Promise((resolve) => {
            const configs = a.configs || {};
            configs[pk] = {
                apiKey: cfg.apiKey || '',
                baseUrl: cfg.baseUrl || '',
                model: cfg.model || '',
                models: dedupeModels(cfg.models),
                hidden: dedupeModels(cfg.hidden),
                disabled: !!cfg.disabled
            };
            const payload = {}; payload[CONFIGS_KEY] = configs; payload[ACTIVE_KEY] = pk;
            if (prefs.maxRows !== undefined) payload[CFG.maxRows] = prefs.maxRows;
            if (prefs.showSteps !== undefined) payload[CFG.showSteps] = prefs.showSteps;
            if (prefs.showTokens !== undefined) payload[CFG.showTokens] = prefs.showTokens;
            if (prefs.maxIters !== undefined) payload[CFG.maxIters] = prefs.maxIters;
            if (prefs.askFirst !== undefined) payload[CFG.askFirst] = prefs.askFirst;
            if (prefs.ctxLevel !== undefined) payload[CFG.ctxLevel] = prefs.ctxLevel;
            if (prefs.ctxPrompts !== undefined) payload[CFG.ctxPrompts] = prefs.ctxPrompts;
            if (prefs.maskPii !== undefined) payload[CFG.maskPii] = prefs.maskPii;
            if (prefs.allowWrites !== undefined) payload[CFG.allowWrites] = prefs.allowWrites;
            if (prefs.budget !== undefined) payload[CFG.budget] = prefs.budget;
            chrome.storage.local.set(payload, resolve);
        }));
    }

    const SCHEMA_CTX_MAX_TABLES = 3;
    const SCHEMA_CTX_MAX_FIELDS = 60;
    const SCHEMA_CTX_MAX_JOINS = 15;

    function normTxt(s) {
        return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    }

    const SQL_VARS_KEY = 'nsftSqlVariables';

    function loadSqlVariables() {
        return new Promise((resolve) => {
            try {
                chrome.storage.local.get([SQL_VARS_KEY], (items) => {
                    const raw = (items && items[SQL_VARS_KEY]) || [];
                    resolve(Array.isArray(raw)
                        ? raw.filter((v) => v && typeof v.name === 'string' && v.name.trim())
                            .map((v) => ({
                                name: v.name.trim(),
                                value: v.value != null ? String(v.value) : '',
                                type: v.type || 'fixed'
                            }))
                        : []);
                });
            } catch (e) { resolve([]); }
        });
    }

    function loadSchemaHint(prompt) {
        return new Promise((resolve) => {
            try {
                chrome.storage.local.get([SCHEMA_CACHE_KEY], (items) => {
                    const all = (items && items[SCHEMA_CACHE_KEY]) || {};
                    const acct = all[getNsAccountId()] || {};
                    const tables = Object.keys(acct);
                    if (!tables.length) { resolve(''); return; }

                    const lines = ['Tables already seen in this account (names only; verify anything else with tools): ' +
                        tables.slice(0, 80).join(', ') + '.'];

                    const words = normTxt(prompt).match(/[a-z0-9_]{4,}/g) || [];
                    const scored = [];
                    tables.forEach((t) => {
                        const raw = (acct[t] && acct[t].rawData) || {};
                        const name = normTxt(t);
                        const label = normTxt(raw.label);
                        let score = 0;
                        words.forEach((w) => {
                            const ws = w.replace(/(es|s)$/, '');
                            if (!ws) return;
                            if (name.includes(ws) || ws.includes(name)) score += 2;
                            else if (label && label.includes(ws)) score += 1;
                        });
                        if (score > 0 && Array.isArray(raw.fields) && raw.fields.length) {
                            scored.push({ t, raw, score });
                        }
                    });
                    scored.sort((x, y) => y.score - x.score);
                    const picked = scored.slice(0, SCHEMA_CTX_MAX_TABLES);
                    if (picked.length) {
                        lines.push('=== Known schema for tables relevant to this request (from local cache; field format id:type) ===');
                        picked.forEach(({ t, raw }) => {
                            const fields = raw.fields
                                .filter((f) => f && f.id && f.isColumn !== false && f.removed !== true)
                                .slice(0, SCHEMA_CTX_MAX_FIELDS)
                                .map((f) => f.id + (f.dataType ? ':' + f.dataType : ''));
                            let line = 'TABLE ' + t + (raw.label ? ' ("' + raw.label + '")' : '') +
                                ' — fields: ' + fields.join(', ');
                            if (Array.isArray(raw.joins) && raw.joins.length) {
                                const joins = raw.joins
                                    .filter((j) => j && j.sourceTargetType && j.sourceTargetType.id)
                                    .slice(0, SCHEMA_CTX_MAX_JOINS)
                                    .map((j) => (j.fieldId || j.id) + ' -> ' + j.sourceTargetType.id);
                                if (joins.length) line += ' | joins: ' + joins.join(', ');
                            }
                            lines.push(line);
                        });
                    }
                    resolve(lines.join('\n'));
                });
            } catch (e) { resolve(''); }
        });
    }

    function isReadOnlySql(q) {
        const s = String(q || '')
            .replace(/^﻿/, '')
            .replace(/\/\*[\s\S]*?\*\//g, ' ')
            .replace(/--[^\n]*/g, ' ')
            .trim();
        return /^(select|with)\b/i.test(s);
    }

    const MASK_COL_SECRET = /password|passwd|secret|token|apikey|api_key|clientsecret|privatekey/i;
    const MASK_COL_PHONE = /phone|mobile|fax|celular|telefono|tel[ée]fono|movil/i;
    const MASK_COL_TAXID = /taxid|taxnum|taxreg|vatreg|rfc|curp|ssn|socialsecurity|(^|_)nif($|_)/i;
    const MASK_COL_BANK = /iban|clabe|bankaccount|banknumber|routingnum|swift/i;
    const MASK_EMAIL_RE = /([A-Z0-9._%+-])[A-Z0-9._%+-]*@([A-Z0-9.-]+\.[A-Z]{2,})/gi;
    const MASK_SECRET_RE = /\b(sk-[A-Za-z0-9_-]{16,}|github_pat_[A-Za-z0-9_]{20,}|gh[pousr]_[A-Za-z0-9]{20,}|xox[baprs]-[A-Za-z0-9-]{10,}|AKIA[0-9A-Z]{16}|eyJ[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{5,})\b/g;
    const MASK_CARD_RE = /\b(?:\d[ -]?){13,19}\b/g;

    function luhnOk(digits) {
        let sum = 0, dbl = false;
        for (let i = digits.length - 1; i >= 0; i--) {
            let d = digits.charCodeAt(i) - 48;
            if (dbl) { d *= 2; if (d > 9) d -= 9; }
            sum += d; dbl = !dbl;
        }
        return sum % 10 === 0;
    }

    function maskTail(s, keep) {
        let seen = 0;
        return s.split('').reverse().map((ch) => {
            if (!/[A-Za-z0-9]/.test(ch)) return ch;
            seen++;
            return seen <= keep ? ch : '•';
        }).reverse().join('');
    }

    function maskValue(col, v, ctx) {
        if (typeof v !== 'string' || !v) return v;
        const before = v;
        if (MASK_COL_SECRET.test(col)) {
            v = '••••••';
        } else {
            if (MASK_COL_TAXID.test(col) || MASK_COL_BANK.test(col)) v = maskTail(v, 2);
            if (MASK_COL_PHONE.test(col) && /\d{4,}/.test(v)) v = maskTail(v, 2);
            v = v.replace(MASK_EMAIL_RE, '$1•••@$2');
            v = v.replace(MASK_SECRET_RE, '[SECRET]');
            v = v.replace(MASK_CARD_RE, (m) => {
                const digits = m.replace(/\D/g, '');
                return luhnOk(digits) ? maskTail(m, 4) : m;
            });
        }
        if (v !== before) ctx.hits++;
        return v;
    }

    function compactResult(rows, totalCount, maxRows, maskPii) {
        const mctx = { hits: 0 };
        const shown = rows.slice(0, maxRows).map((row) => {
            const out = {};
            for (const k in row) {
                if (!Object.prototype.hasOwnProperty.call(row, k)) continue;
                let v = row[k];
                if (maskPii) v = maskValue(k, v, mctx);
                if (typeof v === 'string' && v.length > CELL_CAP) v = v.slice(0, CELL_CAP) + '…';
                out[k] = v;
            }
            return out;
        });
        const res = {
            rowCount: shown.length,
            totalCount: (typeof totalCount === 'number' ? totalCount : rows.length),
            truncated: rows.length > shown.length || (totalCount && totalCount > shown.length),
            rows: shown
        };
        if (mctx.hits > 0) {
            res.masked = true;
            res.note = 'Some values were masked (•••/[SECRET]) by the user\'s privacy setting before being ' +
                'sent to you. If the user asks for a masked value, explain that PII/secret masking is ON and ' +
                'can be turned off in the AI assistant settings (⚙ > Preferences).';
        }
        return res;
    }

    function ensureFetcher() {
        return new Promise((resolve) => {
            if (document.getElementById(FETCHER_SCRIPT_ID)) { resolve(); return; }
            try {
                const s = document.createElement('script');
                s.id = FETCHER_SCRIPT_ID;
                s.src = chrome.runtime.getURL('scripts/modules/suiteql_runner/suiteql_fetcher.js');
                s.onload = () => setTimeout(resolve, 150);
                (document.head || document.documentElement).appendChild(s);
            } catch (e) { resolve(); }
        });
    }

    let _restSuiteQLBroken = false;

    function restKnownOff() {
        return window.NSFT_SuiteQLRest
            ? window.NSFT_SuiteQLRest.isKnownOff()
            : Promise.resolve(false);
    }

    function rememberRestOff() {
        if (window.NSFT_SuiteQLRest) window.NSFT_SuiteQLRest.markOff();
    }

    function withRowLimit(sql, n) {
        const s = String(sql || '').replace(/[\s;]+$/, '');
        if (!s) return s;
        if (/\bFETCH\s+(FIRST|NEXT)\b/i.test(s) || /\bROWNUM\b/i.test(s)) return s;
        return s + '\nFETCH FIRST ' + n + ' ROWS ONLY';
    }

    async function runSuiteQLRest(query, limit) {
        const cap = Math.min(1000, Math.max(1, limit || 1000));
        const url = new URL('/services/rest/query/v1/suiteql?limit=' + cap, location.origin);
        const res = await fetch(url.href, {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json', 'Prefer': 'transient' },
            body: JSON.stringify({ q: query })
        });
        if (!res.ok) {
            let detail = '';
            try {
                const j = await res.json();
                detail = (j['o:errorDetails'] && j['o:errorDetails'][0] && j['o:errorDetails'][0].detail) || j.title || '';
            } catch (e) { }
            const err = new Error(detail || ('HTTP ' + res.status));
            err.httpStatus = res.status;
            throw err;
        }
        const j = await res.json();
        const items = Array.isArray(j.items) ? j.items : [];
        const data = items.map((it) => {
            const row = {};
            Object.keys(it).forEach((k) => { if (k !== 'links') row[k] = it[k]; });
            return row;
        });
        return {
            data,
            count: (typeof j.totalResults === 'number' ? j.totalResults : data.length),
            hasMore: !!j.hasMore
        };
    }

    async function runSuiteQL(query, limit) {
        const cap = Math.max(1, (limit || TOOL_ROW_CAP)) + 1;
        if (!_restSuiteQLBroken && await restKnownOff()) _restSuiteQLBroken = true;
        if (!_restSuiteQLBroken) {
            try {
                return await runSuiteQLRest(query, cap);
            } catch (e) {
                const st = e && e.httpStatus;
                if (st == null || st === 401 || st === 403 || st === 404) {
                    _restSuiteQLBroken = true;
                    if (st != null) rememberRestOff();
                } else {
                    throw e;
                }
            }
        }
        return runSuiteQLFetcher(query, cap);
    }

    function runSuiteQLFetcher(query, limit) {
        return new Promise((resolve, reject) => {
            const reqId = 'nsftai_' + Date.now() + '_' + Math.floor(Math.random() * 1e6);
            let settled = false;
            const onMsg = (e) => {
                const d = e.data;
                if (!d || d.dest !== 'extension_sql_ai' || d.reqId !== reqId) return;
                settled = true;
                window.removeEventListener('message', onMsg);
                if (d.type === 'error') reject(new Error(d.text || 'Error de ejecución'));
                else if (d.type === 'results') resolve(d.payload || { data: [], count: 0 });
            };
            window.addEventListener('message', onMsg);
            ensureFetcher().then(() => {
                window.postMessage({
                    dest: 'fetcher_sql', type: 'execute_SQL', reqId,
                    payload: { query: withRowLimit(query, limit || TOOL_ROW_CAP), maxRecords: limit || TOOL_ROW_CAP }
                }, '*');
            });
            setTimeout(() => {
                if (settled) return;
                window.removeEventListener('message', onMsg);
                reject(new Error('Tiempo de espera agotado (30s)'));
            }, 30000);
        });
    }

    function runRecordUpdate(recordType, recordId, values) {
        return new Promise((resolve, reject) => {
            const reqId = 'nsftai_w_' + Date.now() + '_' + Math.floor(Math.random() * 1e6);
            let settled = false;
            const onMsg = (e) => {
                const d = e.data;
                if (!d || d.dest !== 'extension_sql_ai' || d.reqId !== reqId) return;
                settled = true;
                window.removeEventListener('message', onMsg);
                if (d.type === 'error') reject(new Error(d.text || 'Error de escritura'));
                else if (d.type === 'results') resolve(d.payload || {});
            };
            window.addEventListener('message', onMsg);
            ensureFetcher().then(() => {
                window.postMessage({ dest: 'fetcher_sql', type: 'update_record', reqId, payload: { recordType, recordId, values } }, '*');
            });
            setTimeout(() => {
                if (settled) return;
                window.removeEventListener('message', onMsg);
                reject(new Error('Tiempo de espera agotado (30s)'));
            }, 30000);
        });
    }

    const CATALOG_MAX_PARSE = 700000;

    function fetchRecordCatalog(action, scriptId) {
        let url;
        if (action === 'detail') {
            const data = encodeURIComponent(JSON.stringify({ scriptId: scriptId || '', path: '' }));
            url = location.origin + '/app/recordscatalog/rcendpoint.nl?action=getRecordTypeDetail&data=' + data;
        } else {
            url = location.origin + '/app/recordscatalog/rcendpoint.nl?action=getRecordTypes';
        }
        const ctrl = (typeof AbortController !== 'undefined') ? new AbortController() : null;
        const to = ctrl ? setTimeout(() => { try { ctrl.abort(); } catch (e) {} }, 15000) : null;
        return fetch(url, { credentials: 'include', headers: { 'Accept': 'application/json' }, signal: ctrl ? ctrl.signal : undefined })
            .then((r) => { if (to) clearTimeout(to); if (!r.ok) throw new Error('HTTP ' + r.status); return r.text(); })
            .then((t) => {
                if (t.length > CATALOG_MAX_PARSE) return { __tooLarge: true, __len: t.length };
                try { return JSON.parse(t); } catch (e) { return { __notJson: true, __sample: t.slice(0, 2000) }; }
            })
            .catch((e) => { if (to) clearTimeout(to); throw e; });
    }

    function compactCatalog(action, data) {
        if (data && data.__tooLarge) {
            return { note: 'La lista completa del catálogo es demasiado grande para cargarla (' + data.__len +
                ' chars) y congelaría la página. En su lugar: usa record_catalog action="detail" con un scriptId ' +
                'específico, o SuiteQL: SELECT scriptid, name FROM customrecordtype WHERE LOWER(name) LIKE \'%kw%\'.' };
        }
        if (data && data.__notJson) return { note: 'La respuesta del catálogo no es JSON (revisa el scriptId).', sample: data.__sample };
        try {
            const root = (data && data.data) ? data.data : data;
            if (action === 'types') {
                const arr = Array.isArray(root) ? root : (root && Array.isArray(root.data) ? root.data : null);
                if (arr) return { count: arr.length, recordTypes: arr.slice(0, 600).map((r) => ({ scriptId: r.scriptId || r.id, name: r.name || r.label })) };
            } else {
                const fields = root && (root.fields || (root.data && root.data.fields));
                const joins = root && (root.joins || (root.data && root.data.joins));
                const out = {};
                if (Array.isArray(fields)) out.fields = fields.slice(0, 400).map((f) => ({ id: f.id || f.scriptId, type: f.type || f.fieldType || f.dataType, label: f.label || f.name }));
                if (Array.isArray(joins)) out.joins = joins.slice(0, 400).map((j) => ({ id: j.id || j.joinId || j.fieldId, target: j.targetRecordType || j.recordType || j.joinRecordType || j.target, name: j.name || j.label }));
                if (out.fields || out.joins) return out;
            }
        } catch (e) { }
        let s = '';
        try { s = JSON.stringify(data); } catch (e) { s = String(data); }
        if (s.length > 16000) s = s.slice(0, 16000) + ' …[truncado]';
        return { raw: s };
    }

    function sendToBackground(message) {
        return new Promise((resolve) => {
            let done = false;
            try {
                chrome.runtime.sendMessage(message, (resp) => {
                    done = true;
                    if (chrome.runtime.lastError) { resolve({ __chanErr: true, error: chrome.runtime.lastError.message }); return; }
                    resolve(resp || { ok: false, error: chrome.i18n.getMessage('sqlai_err_noresp') });
                });
            } catch (e) {
                resolve({ __chanErr: true, error: (e && e.message) || 'sendMessage falló' });
            }
            setTimeout(() => { if (!done) resolve({ ok: false, error: chrome.i18n.getMessage('sqlai_err_timeout') }); }, 130000);
        });
    }

    async function askAI(payload) {
        const message = {
            action: 'nsftAiChat',
            provider: payload.kind,
            apiKey: payload.apiKey,
            baseUrl: payload.baseUrl,
            model: payload.model,
            system: payload.system,
            messages: payload.messages,
            tools: payload.tools,
            maxTokens: payload.maxTokens,
            previousInteractionId: payload.previousInteractionId || null
        };
        for (let attempt = 0; attempt < 3; attempt++) {
            const r = await sendToBackground(message);
            if (r && r.__chanErr) {
                if (attempt < 2) { await new Promise((res) => setTimeout(res, 500)); continue; }
                return { ok: false, error: chrome.i18n.getMessage('sqlai_err_channel') };
            }
            return r;
        }
    }

    const TOOL = {
        name: 'run_suiteql',
        description: 'Runs a SuiteQL query against the user\'s active NetSuite ' +
            'account and returns the rows as JSON. Use it to (1) DISCOVER schema — "SELECT * FROM <table> ' +
            'FETCH FIRST 1 ROW ONLY" for columns; "SELECT internalid, scriptid, name FROM customrecordtype ' +
            'WHERE LOWER(name) LIKE \'%kw%\'" to find custom records; "SELECT scriptid, name, fieldtype, ' +
            'fieldvaluetyperecord FROM customfield WHERE recordtype = <id>" for a record\'s fields/joins; and ' +
            '(2) FETCH the requested data. Returns at most maxRows rows. Call it repeatedly to walk the schema.',
        input_schema: {
            type: 'object',
            properties: {
                query: { type: 'string', description: 'The SuiteQL query to run.' },
                maxRows: { type: 'integer', description: 'Max rows to return (default 100, cap 500).' }
            },
            required: ['query']
        }
    };

    const CATALOG_TOOL = {
        name: 'record_catalog',
        description: 'NetSuite Records Catalog — the AUTHORITATIVE schema source. Prefer it over guessing. ' +
            'action="types" lists EVERY record type in this account (native + custom) with its scriptId (the ' +
            'table name to use in SuiteQL). action="detail" (needs scriptId) returns a record type\'s exact FIELDS ' +
            '(with types) and its JOINS to other records — use it to learn columns and how tables relate before ' +
            'writing SuiteQL. Example scriptIds: "transaction", "item", "customrecord_df_control_inv".',
        input_schema: {
            type: 'object',
            properties: {
                action: { type: 'string', enum: ['types', 'detail'], description: 'types = list all record types; detail = fields + joins of one record type.' },
                scriptId: { type: 'string', description: 'Record type scriptId (required for action="detail").' }
            },
            required: ['action']
        }
    };

    const WRITE_TOOL = {
        name: 'update_record',
        description: 'Updates one or more BODY FIELD values of an existing NetSuite record (record.submitFields, ' +
            'user session). EVERY call shows the user a confirmation dialog and only runs if they approve. ' +
            'Use it ONLY when the user explicitly asked to change data — never on your own initiative. ' +
            'Look up the record id and current values with run_suiteql FIRST. For list/select fields pass raw internal ids.',
        input_schema: {
            type: 'object',
            properties: {
                recordType: { type: 'string', description: 'Record type id, e.g. "customer", "salesorder", "customrecord_foo".' },
                recordId: { type: 'string', description: 'Internal id of the record to update.' },
                values: { type: 'object', description: 'Map of fieldId -> new value (body fields only).' },
                reason: { type: 'string', description: 'One short sentence, in the user\'s language, explaining the change. Shown in the confirmation dialog.' }
            },
            required: ['recordType', 'recordId', 'values']
        }
    };

    const WRITE_RULES = [
        '=== Record writes (update_record) ===',
        '- update_record MODIFIES real data. Use it ONLY when the user explicitly asked for a change, and only',
        '  after verifying the target record and its current values with run_suiteql.',
        '- Every call opens a confirmation dialog. If the user DECLINES, do NOT retry the same write — explain',
        '  and ask what they want instead.',
        '- Keep each change minimal (only the fields the user asked to change). Body fields only.'
    ].join('\n');

    const TOOL_LITE = {
        name: 'run_suiteql',
        description: 'Runs a NetSuite SuiteQL query against the user\'s account and returns the rows ' +
            'as JSON. Use it only if you need to verify a table or column.',
        input_schema: {
            type: 'object',
            properties: {
                query: { type: 'string', description: 'The SuiteQL query to run.' },
                maxRows: { type: 'integer', description: 'Max rows to return (default 100, cap 500).' }
            },
            required: ['query']
        }
    };

    const CTX_MIN = 1, CTX_MAX = 5;

    function clampCtxLevel(v) {
        if (v === 'light') return 2;
        if (v === 'full') return 5;
        const n = Math.round(Number(v));
        if (!isFinite(n)) return CTX_MIN;
        return Math.min(CTX_MAX, Math.max(CTX_MIN, n));
    }

    const CTX_FINAL_FORMAT = [
        '=== Final answer format (important) ===',
        '- Reply with ONE very short sentence, in the same language as the user\'s message, confirming what you did.',
        '- Do NOT restate the data or the SQL as text: the user already sees them in the editor and results table.',
        '- ALWAYS include the final SuiteQL query between <sql> and </sql>. That block is NOT shown as text; it',
        '  is only used to load and run the query in the runner. Without <sql>, nothing runs.'
    ].join('\n');

    const CTX_FINAL_FORMAT_CHAT = [
        '=== Final answer format (important) ===',
        '- You are chatting directly with the user (there is NO editor and NO results table on screen).',
        '- Run your tools silently, then answer like a helpful human, in the user\'s language, giving the',
        '  ACTUAL values you found — e.g. "El total de la transacción 10174 es $4,560.00 (2 líneas)."',
        '- Do NOT include SQL, code blocks or <sql> tags unless the user explicitly asks for the query.',
        '- Keep it short and direct. Small lists are fine as compact bullet points.'
    ].join('\n');

    let _chatMode = false;

    const CTX_BODY_1 = 'Create a NetSuite SuiteQL statement for the user\'s request. ' +
        'Only run a tool if strictly necessary.';

    const CTX_BODY_2 = [
        'Create a NetSuite SuiteQL statement for the user\'s request.',
        'For simple, well-known tables answer directly; if unsure about a table or column you MAY verify',
        'it with the run_suiteql tool.'
    ].join('\n');

    const CTX_BODY_3 = CTX_BODY_2 + '\n\n' + [
        '=== SuiteQL rules & gotchas ===',
        '- Never assume columns: probe with SELECT * FROM <table> FETCH FIRST 1 ROW ONLY when unsure.',
        '- ALWAYS bound queries: FETCH FIRST N ROWS ONLY plus selective WHERE filters.',
        '- "last / most recent / latest": ORDER BY <date> DESC + FETCH FIRST N ROWS ONLY.',
        '- Pagination: SuiteQL IGNORES OFFSET ... FETCH — use ROW_NUMBER() OVER (ORDER BY ...).',
        '- BUILTIN.DF(field) returns the DISPLAY TEXT of a list/select/record field (id -> name).',
        '- String matching: LOWER(x) LIKE \'%kw%\' and try several keywords (Spanish AND English).'
    ].join('\n');

    const CTX_BODY_4 = CTX_BODY_3 + '\n\n' + [
        '=== Schema discovery ===',
        '- The record_catalog tool is the AUTHORITATIVE schema source. {"action":"types"} lists every record',
        '  type in the account (its scriptId IS the SuiteQL table name); {"action":"detail","scriptId":"..."}',
        '  returns that record type\'s exact fields and its joins. Prefer it over guessing.',
        '- Many business objects are CUSTOM RECORDS, not native tables. Find them via:',
        '    SELECT internalid, scriptid, name FROM customrecordtype WHERE LOWER(name) LIKE \'%keyword%\'',
        '  and their fields via customfield (WHERE recordtype = <internalid>). The scriptid is the table name.'
    ].join('\n');

    function defaultLevelBody(level) {
        switch (clampCtxLevel(level)) {
            case 1: return CTX_BODY_1;
            case 2: return CTX_BODY_2;
            case 3: return CTX_BODY_3;
            case 4: return CTX_BODY_4;
            default: return CTX_BODY_5;
        }
    }

    function getOpenPageContext() {
        try {
            const params = new URLSearchParams(location.search);
            const id = params.get('id');
            const rectype = params.get('rectype');
            const m = location.pathname.match(/\/app\/.*\/([a-z0-9_]+)\.nl$/i);
            const bits = ['url=' + location.origin + location.pathname + (location.search || '')];
            if (m) bits.push('page=' + m[1]);
            if (id && /^\d+$/.test(id)) bits.push('record internalid=' + id);
            if (rectype && /^\d+$/.test(rectype)) bits.push('custom record rectype=' + rectype);
            const t = (document.title || '').trim();
            if (t) bits.push('title="' + t.slice(0, 120).replace(/"/g, "'") + '"');
            return bits.join(' | ');
        } catch (e) { return ''; }
    }

    const CTX_FOLLOWUP = [
        '=== Follow-ups: make the SMALLEST possible change ===',
        '- This is a multi-turn conversation. When the user REFINES or EXTENDS a previous answer ("add a',
        '  column", "now filter by X", "same but only this year", "sort by total"), your previous query is',
        '  the BASELINE. Return that same query with ONLY the requested change applied.',
        '- Everything else must survive VERBATIM: same tables, same aliases, same joins, same WHERE, same',
        '  ORDER BY, same column list and column ORDER, same formatting. Do not rename, reorder, reformat,',
        '  re-scope or "improve" anything the user did not ask about — even if you would write it differently',
        '  today. A follow-up is an edit, not a rewrite.',
        '- Example: previous query selects id and name from subsidiary; the user asks to add the phone.',
        '  Correct: the SAME query with the phone column appended to the SELECT list. Wrong: a new query',
        '  with different aliases, extra joins, added filters or reordered columns.',
        '- If the user reports something WRONG with the result, change only what is needed to fix it and say',
        '  what you changed. Keep the rest identical.',
        '- Do NOT re-run schema discovery (record_catalog, SELECT * probes) for tables/joins you already',
        '  resolved earlier in THIS conversation — you already know their columns and how they join. Reuse them.',
        '- Only run new discovery for something genuinely new. If the only unknown is the column being added,',
        '  probe just for that column, then emit the edited query.',
        '- Start a query from scratch ONLY when the user asks for something unrelated to what came before.'
    ].join('\n');

    function buildVariablesCtx(vars) {
        const lines = [
            '=== Runner variables ({{name}}) — ONLY when the user asks for them ===',
            '- The Runner replaces every {{name}} placeholder with a value right before running. Variables of',
            '  type runtime/both also POP UP A DIALOG asking the user for the value on each run, which is what',
            '  turns a query into a reusable template.',
            '- DEFAULT BEHAVIOUR: write literal values. Never introduce a placeholder on your own initiative,',
            '  not even when a value looks like it "should" be parameterised. Only use them if the user asks',
            '  for a variable, a parameter, a template or a query they can reuse with different values.',
            '- Substitution is plain TEXT, so put the quotes where SQL needs them:',
            '    WHERE c.companyname = \'{{cliente}}\'      -- text: placeholder inside the quotes',
            '    WHERE c.id = {{id_cliente}}              -- number: no quotes'
        ];
        if (vars && vars.length) {
            lines.push('- Variables this user has DEFINED (use ONLY these names, exactly as written):');
            vars.forEach((v) => {
                lines.push('    {{' + v.name + '}}  (' + v.type +
                    (v.type !== 'runtime' && v.value ? ', default: ' + String(v.value).slice(0, 40) : '') + ')');
            });
        } else {
            lines.push('- This user has NO variables defined yet. If they ask for one, still write the placeholder and');
            lines.push('  tell them they need to define it in the Runner\'s variables panel for it to be replaced.');
        }
        return lines.join('\n');
    }

    function followupBaseline(lastSql) {
        if (!lastSql) return '';
        return [
            '=== Your previous query (the baseline for any follow-up) ===',
            'This is the exact SQL you emitted last in this conversation. If the user is refining or',
            'extending it, return THIS query with only the requested change applied — not a new one.',
            '<previous_sql>',
            lastSql,
            '</previous_sql>'
        ].join('\n');
    }

    const CTX_PAGE_CHAT = [
        'When the user says "this record", "este registro", "here"/"aquí", or asks about the open page,',
        'resolve it YOURSELF from the Open page line above: use its internalid / page type with run_suiteql',
        'and record_catalog to look up the real data BEFORE answering. Never ask the user for an id or a',
        'record type that the Open page line (or a quick discovery read) can supply, and never ask',
        'permission to run a read — just run it.'
    ].join('\n');

    const CTX_SCOPE_RUNNER = [
        '=== Scope ===',
        '- Build the query from the user\'s request ALONE. Nothing about the page they are currently on is',
        '  part of the question — you are not told what it is, and you must not guess or ask.',
        '- The scope is the WHOLE ACCOUNT. Answer literally what was asked and nothing more: "subsidiaries"',
        '  means the subsidiary table on its own, with no extra joins, no filters and no extra columns that',
        '  the user did not ask for.',
        '- If the user wants a specific record, they will give you its id or enough detail to find it.'
    ].join('\n');

    function buildSystemFor(level, customBody, schemaHint, lastSql, vars) {
        const body = (customBody || '').trim() || defaultLevelBody(level);
        return [
            body,
            'Active account: ' + getNsAccountId() + '.',
            CTX_FOLLOWUP,
            followupBaseline(lastSql),
            (_chatMode ? '' : buildVariablesCtx(vars)),
            (_chatMode
                ? 'Open page (what the user is looking at RIGHT NOW): ' + getOpenPageContext()
                : CTX_SCOPE_RUNNER),
            (_chatMode ? CTX_PAGE_CHAT : ''),
            (schemaHint ? schemaHint : ''),
            (_chatMode ? CTX_FINAL_FORMAT_CHAT : CTX_FINAL_FORMAT)
        ].filter(Boolean).join('\n');
    }

    const CTX_BODY_5 = [
            'You are an expert NetSuite data analyst. You answer questions about the data in this NetSuite',
            'account by writing and running SuiteQL with the run_suiteql tool.',
            'You are relentless at schema discovery: you never claim data does not exist until you have',
            'actually searched the metadata tables (customrecordtype / customfield). Treat every question as',
            'solvable — chain multiple run_suiteql calls: discover the schema, then query the data.',
            '',
            '=== SuiteQL rules & gotchas (these bite) ===',
            '- ALWAYS bound queries (FETCH FIRST N ROWS ONLY + selective WHERE): queries run inside the user\'s',
            '  browser tab, and an unbounded scan of big tables (transaction, transactionline, item) freezes it.',
            '  Keep discovery probes tiny and prefer record_catalog action="detail" over action="types".',
            '- Never assume columns or relationships. To see a table\'s real columns, probe it:',
            '    SELECT * FROM <table> FETCH FIRST 1 ROW ONLY',
            '- "last" / "most recent" / "latest": ORDER BY <date> DESC (or id DESC if no date) + FETCH FIRST 1 ROW ONLY.',
            '- Pagination: SuiteQL IGNORES OFFSET ... FETCH. To paginate use ROW_NUMBER() OVER (ORDER BY ...).',
            '- BUILTIN.DF(field) returns the DISPLAY TEXT of a list/select/record field (id -> name). Use it for',
            '  employee/subsidiary/status/item names instead of showing raw internal ids.',
            '- OneWorld accounts: filter by subsidiary when relevant.',
            '- String matching: use LOWER(x) LIKE \'%kw%\' and try several keywords/synonyms (Spanish AND English).',
            '',
            '=== Records Catalog (BEST schema source — use the record_catalog tool) ===',
            '- The record_catalog tool is the authoritative NetSuite schema. Prefer it to discover tables, fields and',
            '  especially JOINS between records (do not guess joins).',
            '  - record_catalog {"action":"types"} -> the full list of every record type in this account (native +',
            '    custom), each with its scriptId. The scriptId IS the table name you use in SuiteQL FROM.',
            '  - record_catalog {"action":"detail","scriptId":"<scriptId>"} -> that record type\'s exact fields (ids +',
            '    types) and its joins to other record types (each join gives you the related record + the join field).',
            '- Typical flow: if unsure a table exists or what it is called, call action="types" (or search custom',
            '  records via customrecordtype). To learn a table\'s columns and how it relates to others, call',
            '  action="detail" for that scriptId, then write SuiteQL using those exact fields and joins.',
            '- The Records Catalog joins also reveal parent/child relationships — an alternative to the customfield',
            '  method below for finding related records.',
            '',
            '=== Where data lives (native tables vs custom records) ===',
            '- Native tables exist for standard objects: transaction, transactionline, item, customer, vendor,',
            '  employee, subsidiary, account, entity, location, etc.',
            '- MANY business objects are CUSTOM RECORDS, not native tables (inventory counts, approvals, teams,',
            '  logs, configs). A custom record\'s table name is its scriptid (e.g. customrecord_df_control_inv).',
            '- Metadata tables are your map:',
            '    customrecordtype -> which custom records exist:',
            '      SELECT internalid, scriptid, name FROM customrecordtype WHERE LOWER(name) LIKE \'%keyword%\'',
            '      (NOTE: "customrecord" is NOT a table — use the scriptid as the table name.)',
            '    customfield -> fields, types and joins of a record type:',
            '      SELECT scriptid, name, fieldtype, fieldvaluetyperecord FROM customfield WHERE recordtype = <internalid>',
            '      fieldvaluetyperecord = the record type a select/list field points to.',
            '- Native record type ids (values you\'ll see in fieldvaluetyperecord): -4 = employee, -2 = customer,',
            '  -112 = subsidiary, -10 = item, -3 = vendor, -117 = location. A negative value = a native record.',
            '',
            '=== Finding RELATED / CHILD records (lines, detail, team, employees, approvers of a parent) ===',
            'When the user asks for "the employees / lines / items / team / detail OF <some parent record>", that',
            'data almost always lives in a DIFFERENT custom record (the child) that has a field pointing back to the',
            'parent. Discover it like this — this is the exact method, follow it step by step:',
            '  1) Get the parent record type id:',
            '       SELECT internalid, scriptid FROM customrecordtype WHERE LOWER(name) LIKE \'%<parent keyword>%\'',
            '  2) Get the specific parent row id you need (e.g. the latest):',
            '       SELECT id FROM <parent_scriptid> ORDER BY created DESC FETCH FIRST 1 ROW ONLY',
            '  3) Find the CHILD records that reference the parent (fields whose value type IS the parent):',
            '       SELECT recordtype, scriptid, name FROM customfield WHERE fieldvaluetyperecord = <parent_internalid>',
            '     Each row = a field on a child record; "recordtype" is the child\'s internalid, "scriptid" is the',
            '     linking field (e.g. custrecord_relacion_control_inv). Pick the child whose name matches the ask',
            '     (team/employees/lines/items).',
            '  4) Resolve the child\'s table name and its employee/target field:',
            '       SELECT scriptid FROM customrecordtype WHERE internalid = <child recordtype>',
            '       SELECT scriptid, name, fieldvaluetyperecord FROM customfield WHERE recordtype = <child recordtype>',
            '     (employee fields have fieldvaluetyperecord = -4).',
            '  5) Final query — filter the child by the linking field = parent id, resolve names with BUILTIN.DF:',
            '       SELECT BUILTIN.DF(c.<employee_field>) AS empleado',
            '       FROM <child_scriptid> c WHERE c.<linking_field> = <parent id>',
            'Do NOT give up after one probe. Run as many discovery queries as needed to walk this chain.',
            '',
        ].filter(Boolean).join('\n');

    async function runAgent(prompt, cb, history, session, editorSql, opts) {
        const resuming = !!(opts && opts.resume);
        session = session || {};
        const cfg = await loadConfig();
        if (!cfg.model) { cb.error(chrome.i18n.getMessage('sqlai_err_model')); return; }
        if (PROVIDERS[cfg.providerKey] && PROVIDERS[cfg.providerKey].needsKey && !cfg.apiKey) {
            cb.error(chrome.i18n.getMessage('sqlai_err_key')); return;
        }

        const level = clampCtxLevel(cfg.ctxLevel);
        const customBody = String((cfg.ctxPrompts || {})[String(level)] || '');
        const schemaHint = level >= 3 ? await loadSchemaHint(prompt) : '';
        const sqlVars = _chatMode ? [] : await loadSqlVariables();
        let system = buildSystemFor(level, customBody, schemaHint, session.lastSql, sqlVars);
        const agentTools = level >= 4 ? [TOOL, CATALOG_TOOL] : [TOOL_LITE];
        if (cfg.allowWrites) { agentTools.push(WRITE_TOOL); system += '\n' + WRITE_RULES; }
        const maxRows = Math.min(500, Math.max(1, cfg.maxRows || TOOL_ROW_CAP));
        let messages = Array.isArray(history) ? history.slice() : [];
        if (!resuming) {
            const userText = editorSql
                ? 'The user is asking about the SuiteQL query currently open in their editor. ' +
                  'Treat it as the starting point — modify or build on it rather than starting over.\n' +
                  '<current_sql>\n' + editorSql + '\n</current_sql>\n\n' + prompt
                : prompt;
            messages.push({ role: 'user', content: [{ type: 'text', text: userText }] });
        }

        const totals = { in: 0, out: 0, total: 0 };
        if (!session.totals) session.totals = { in: 0, out: 0, total: 0 };
        const maxIters = clampIters(cfg.maxIters);
        let curModel = cfg.model;
        const triedModels = [cfg.model];

        for (let iter = 0; iter < maxIters; iter++) {
            if (cb.aborted()) return;
            if (cfg.budget > 0 && session.totals.total >= cfg.budget) {
                cb.error(chrome.i18n.getMessage('sqlai_budget_hit', [fmtNum(cfg.budget)]));
                return;
            }
            cb.status((iter === 0 && !resuming)
                ? chrome.i18n.getMessage('sqlai_step_analyzing')
                : chrome.i18n.getMessage('sqlai_step_reasoning', [String(iter + 1), String(maxIters)]),
                { defer: true });

            let resp = await askAI({
                ...cfg, model: curModel, system, messages, tools: agentTools, maxTokens: 1536,
                previousInteractionId: session.interactionId || null
            });
            while (resp && !resp.ok && resp.status === 429 && !cb.aborted()) {
                const next = (cfg.fallbackModels || []).find((m) => triedModels.indexOf(m) === -1);
                if (!next) break;
                triedModels.push(next);
                curModel = next;
                cb.status(chrome.i18n.getMessage('sqlai_fallback', [next]));
                resp = await askAI({
                    ...cfg, model: curModel, system, messages, tools: agentTools, maxTokens: 1536,
                    previousInteractionId: session.interactionId || null
                });
            }
            if (cb.aborted()) return;
            if (!resp.ok) { cb.error(resp.error || 'Error del proveedor de IA.'); return; }
            if (resp.interactionId) session.interactionId = resp.interactionId;
            if (resp.usage) {
                totals.in += resp.usage.in || 0;
                totals.out += resp.usage.out || 0;
                totals.total += resp.usage.total || 0;
                session.totals.in += resp.usage.in || 0;
                session.totals.out += resp.usage.out || 0;
                session.totals.total += resp.usage.total || 0;
            }

            const assistantContent = [];
            if (resp.text) assistantContent.push({ type: 'text', text: resp.text });
            (resp.toolCalls || []).forEach((tc) => {
                assistantContent.push({ type: 'tool_use', id: tc.id, name: tc.name, input: tc.input || {} });
            });
            messages.push({ role: 'assistant', content: assistantContent });

            if (resp.stopReason !== 'tool_use' || !(resp.toolCalls || []).length) {
                if (Array.isArray(history)) { history.length = 0; for (const m of messages) history.push(m); }
                const emitted = extractSql(resp.text || '');
                if (emitted) session.lastSql = emitted;
                cb.done(resp.text || '(Sin texto de respuesta.)', totals.total ? totals : null);
                return;
            }

            const toolResults = [];
            for (const tc of resp.toolCalls) {
                if (cb.aborted()) return;
                if (tc.name === 'record_catalog') {
                    const action = (tc.input && tc.input.action) || 'types';
                    const scriptId = tc.input && tc.input.scriptId;
                    cb.query('[catalog] ' + action + (scriptId ? ' ' + scriptId : ''));
                    try {
                        const data = await fetchRecordCatalog(action, scriptId);
                        cb.queryResult(true, chrome.i18n.getMessage('sqlai_step_catalog_ok'));
                        toolResults.push({ type: 'tool_result', tool_use_id: tc.id, content: JSON.stringify(compactCatalog(action, data)) });
                    } catch (e) {
                        cb.queryResult(false, chrome.i18n.getMessage('sqlai_step_discarded'));
                        toolResults.push({ type: 'tool_result', tool_use_id: tc.id, content: 'ERROR: ' + ((e && e.message) || 'catalog fetch failed'), is_error: true });
                    }
                    continue;
                }
                if (tc.name === 'update_record') {
                    const rt = String((tc.input && tc.input.recordType) || '');
                    const rid = String((tc.input && tc.input.recordId) || '');
                    const vals = (tc.input && tc.input.values && typeof tc.input.values === 'object') ? tc.input.values : {};
                    cb.query('[update] ' + rt + ' #' + rid);
                    if (!cfg.allowWrites || !rt || !rid) {
                        cb.queryResult(false, chrome.i18n.getMessage('sqlai_step_rejected'));
                        toolResults.push({ type: 'tool_result', tool_use_id: tc.id, content: 'ERROR: writes are disabled (read-only mode) or the target is incomplete.', is_error: true });
                        continue;
                    }
                    const decision = await cb.confirmWrite({ recordType: rt, recordId: rid, values: vals, reason: String((tc.input && tc.input.reason) || '') });
                    if (cb.aborted()) return;
                    if (!decision || !decision.approved) {
                        cb.queryResult(false, chrome.i18n.getMessage('sqlai_write_denied_note'));
                        toolResults.push({ type: 'tool_result', tool_use_id: tc.id, content: 'ERROR: the user DECLINED this write. Do not retry it; ask the user what they want instead.', is_error: true });
                        continue;
                    }
                    try {
                        const wout = await runRecordUpdate(rt, rid, vals);
                        decision.mark(true);
                        cb.queryResult(true, chrome.i18n.getMessage('sqlai_write_applied'));
                        toolResults.push({ type: 'tool_result', tool_use_id: tc.id, content: JSON.stringify({ updated: true, recordType: rt, id: (wout && wout.data && wout.data.id) || rid }) });
                    } catch (e) {
                        decision.mark(false, (e && e.message) || '');
                        cb.queryResult(false, chrome.i18n.getMessage('sqlai_step_discarded'));
                        toolResults.push({ type: 'tool_result', tool_use_id: tc.id, content: 'ERROR: ' + ((e && e.message) || 'update failed'), is_error: true });
                    }
                    continue;
                }
                if (tc.name !== 'run_suiteql') {
                    toolResults.push({ type: 'tool_result', tool_use_id: tc.id, content: 'ERROR: unknown tool.', is_error: true });
                    continue;
                }
                const q = String((tc.input && tc.input.query) || '');
                const rowCap = Math.min(500, Math.max(1, Number(tc.input && tc.input.maxRows) || maxRows));
                cb.query(q);
                if (!isReadOnlySql(q)) {
                    cb.queryResult(false, chrome.i18n.getMessage('sqlai_step_rejected'));
                    toolResults.push({ type: 'tool_result', tool_use_id: tc.id, content: 'ERROR: solo se permiten consultas SELECT/WITH.', is_error: true });
                    continue;
                }
                try {
                    const out = await runSuiteQL(q, rowCap);
                    const rows = (out && out.data) || [];
                    const total = (out && typeof out.count === 'number') ? out.count : rows.length;
                    cb.queryResult(true, rows.length < total
                        ? chrome.i18n.getMessage('sqlai_step_rows_capped', [String(total), String(rows.length)])
                        : chrome.i18n.getMessage('sqlai_step_rows', [String(total)]));
                    toolResults.push({ type: 'tool_result', tool_use_id: tc.id, content: JSON.stringify(compactResult(rows, total, rowCap, cfg.maskPii)) });
                } catch (e) {
                    cb.queryResult(false, chrome.i18n.getMessage('sqlai_step_discarded'));
                    toolResults.push({ type: 'tool_result', tool_use_id: tc.id, content: 'ERROR: ' + ((e && e.message) || 'execution failed'), is_error: true });
                }
            }
            messages.push({ role: 'user', content: toolResults });
        }
        if (Array.isArray(history)) { history.length = 0; for (const m of messages) history.push(m); }
        const resume = () => runAgent(prompt, cb, history, session, '', { resume: true })
            .catch((e) => cb.error((e && e.message) || String(e)));
        if (typeof cb.limitReached === 'function') cb.limitReached(maxIters, resume);
        else cb.error(chrome.i18n.getMessage('sqlai_err_maxsteps', [String(maxIters)]));
    }

    const NS = 'nsft-ai';
    let dock = null, dockResizer = null, refreshProviderBar = function () {}, aborted = false, running = false;

    function fmtNum(n) {
        try { return Number(n || 0).toLocaleString(); } catch (e) { return String(n || 0); }
    }

    const MODEL_PRICES = [
        [/claude-opus-4/i, 5, 25],
        [/claude-sonnet-5/i, 3, 15],
        [/claude-haiku-4-5/i, 1, 5],
        [/gpt-4o-mini/i, 0.15, 0.6],
        [/gpt-4o/i, 2.5, 10],
        [/gpt-4\.1-mini/i, 0.4, 1.6],
        [/gpt-4\.1/i, 2, 8],
        [/gpt-oss-120b/i, 0.15, 0.75],
        [/gpt-oss-20b/i, 0.1, 0.5],
        [/llama-3\.3-70b/i, 0.59, 0.79],
        [/llama-3\.1-8b/i, 0.05, 0.08]
    ];
    function estimateCost(model, totals) {
        if (!model || !totals) return null;
        for (const p of MODEL_PRICES) {
            if (p[0].test(model)) return (totals.in * p[1] + totals.out * p[2]) / 1e6;
        }
        return null;
    }

    function el(tag, cls, txt) {
        const e = document.createElement(tag);
        if (cls) e.className = cls;
        if (txt != null) e.textContent = txt;
        return e;
    }

    const mdEsc = (s) => String(s == null ? '' : s);
    function mdInline(target, text) {
        const re = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g;
        let last = 0, m;
        while ((m = re.exec(text)) !== null) {
            if (m.index > last) target.appendChild(document.createTextNode(mdEsc(text.slice(last, m.index))));
            const tok = m[0];
            if (tok.startsWith('**')) target.appendChild(el('strong', null, tok.slice(2, -2)));
            else if (tok.startsWith('`')) target.appendChild(el('code', NS + '-mdcode', tok.slice(1, -1)));
            else target.appendChild(el('em', null, tok.slice(1, -1)));
            last = re.lastIndex;
        }
        if (last < text.length) target.appendChild(document.createTextNode(mdEsc(text.slice(last))));
    }
    function renderMarkdown(text) {
        const root = el('div', NS + '-md');
        const lines = String(text || '').replace(/\r/g, '').split('\n');
        let i = 0;
        const isTableSep = (s) => /^\s*\|?[\s:|-]+\|?\s*$/.test(s) && s.indexOf('-') !== -1;
        const cells = (s) => s.replace(/^\s*\|/, '').replace(/\|\s*$/, '').split('|').map(c => c.trim());
        while (i < lines.length) {
            const line = lines[i];
            if (line.indexOf('|') !== -1 && i + 1 < lines.length && isTableSep(lines[i + 1])) {
                const header = cells(line);
                i += 2;
                const table = el('table', NS + '-mdtable');
                const thead = document.createElement('thead');
                const htr = document.createElement('tr');
                header.forEach(h => { const th = el('th'); mdInline(th, h); htr.appendChild(th); });
                thead.appendChild(htr); table.appendChild(thead);
                const tbody = document.createElement('tbody');
                while (i < lines.length && lines[i].indexOf('|') !== -1 && lines[i].trim()) {
                    const tr = document.createElement('tr');
                    cells(lines[i]).forEach(c => { const td = el('td'); mdInline(td, c); tr.appendChild(td); });
                    tbody.appendChild(tr); i++;
                }
                table.appendChild(tbody);
                const scroller = el('div', NS + '-mdtablewrap');
                scroller.appendChild(table);
                root.appendChild(scroller);
                continue;
            }
            if (/^\s*[-•*]\s+/.test(line)) {
                const ul = el('ul', NS + '-mdul');
                while (i < lines.length && /^\s*[-•*]\s+/.test(lines[i])) {
                    const li = el('li');
                    mdInline(li, lines[i].replace(/^\s*[-•*]\s+/, ''));
                    ul.appendChild(li); i++;
                }
                root.appendChild(ul);
                continue;
            }
            if (!line.trim()) { i++; continue; }
            const para = el('p', NS + '-mdp');
            let buf = [];
            while (i < lines.length && lines[i].trim() && lines[i].indexOf('|') === -1 && !/^\s*[-•*]\s+/.test(lines[i])) {
                buf.push(lines[i]); i++;
            }
            mdInline(para, buf.join(' '));
            root.appendChild(para);
        }
        return root;
    }

    function makeTypingDots() {
        const w = el('div', NS + '-typing');
        w.appendChild(el('span', NS + '-dot'));
        w.appendChild(el('span', NS + '-dot'));
        w.appendChild(el('span', NS + '-dot'));
        return w;
    }

    const PROVIDER_LOGOS = {
        claude:     { color: '#d97757', text: 'C' },
        gemini:     { color: '#4285f4', text: 'G' },
        groq:       { color: '#f55036', text: 'gq' },
        openai:     { color: '#10a37f', text: 'AI' },
        openrouter: { color: '#c8ff00', text: 'OR', fg: '#1a1d23' },
        deepseek:   { color: '#4d6bfe', text: 'DS' },
        opencodezen:{ color: '#111827', text: 'OZ' },
        ollama:     { color: '#4b5563', text: 'OL' },
        custom:     { color: '#6b7280', text: '•' }
    };
    function makeLogo(pk) {
        const l = PROVIDER_LOGOS[pk] || PROVIDER_LOGOS.custom;
        const s = el('span', NS + '-logo', l.text);
        s.style.background = l.color;
        if (l.fg) s.style.setProperty('color', l.fg, 'important');
        return s;
    }

    function extractSql(text) {
        const m = String(text || '').match(/<sql>([\s\S]*?)<\/sql>/i);
        return m ? m[1].trim() : '';
    }

    function escapeHtml(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    function formatSql(sql) {
        try {
            if (window.sqlFormatter && typeof window.sqlFormatter.format === 'function') {
                return window.sqlFormatter.format(sql, { language: 'sql', keywordCase: 'upper', indent: '  ' });
            }
        } catch (e) { }
        return sql;
    }

    function highlightSql(sql) {
        try {
            if (window.hljs && typeof window.hljs.highlight === 'function') {
                try { return window.hljs.highlight(sql, { language: 'sql' }).value; }
                catch (e) { try { return window.hljs.highlight('sql', sql).value; } catch (e2) { } }
            }
        } catch (e) { }
        return escapeHtml(sql);
    }

    function setEditorValue(sql) {
        try {
            const wrap = document.querySelector('.nsft-sql-editor-container .CodeMirror');
            if (wrap && wrap.CodeMirror && typeof wrap.CodeMirror.setValue === 'function') {
                wrap.CodeMirror.setValue(sql);
                wrap.CodeMirror.focus();
                return true;
            }
            const ta = document.getElementById('nsft-sql-query-input');
            if (ta) { ta.value = sql; return true; }
        } catch (e) { }
        return false;
    }

    function getEditorValue() {
        try {
            const wrap = document.querySelector('.nsft-sql-editor-container .CodeMirror');
            if (wrap && wrap.CodeMirror && typeof wrap.CodeMirror.getValue === 'function') {
                return String(wrap.CodeMirror.getValue() || '').trim();
            }
            const ta = document.getElementById('nsft-sql-query-input');
            if (ta) return String(ta.value || '').trim();
        } catch (e) { }
        return '';
    }

    function runInRunner(sql) {
        window.dispatchEvent(new CustomEvent('nsft-ai-run-sql', { detail: { sql: sql } }));
    }

    const ARROW_SVG = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"></line><polyline points="12 5 19 12 12 19"></polyline></svg>';
    const STOP_SVG = '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="none"><rect x="6" y="6" width="12" height="12" rx="2"></rect></svg>';
    const SPARK_SVG = '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
        'stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' +
        '<path d="M12 3l1.8 4.6L18.5 9.4l-4.7 1.8L12 16l-1.8-4.8L5.5 9.4l4.7-1.8z"></path>' +
        '<path d="M19 14l.7 1.8 1.8.7-1.8.7L19 19l-.7-1.8-1.8-.7 1.8-.7z"></path></svg>';
    const PLUG_SVG = '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
        'stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' +
        '<path d="M9 2v6"></path><path d="M15 2v6"></path>' +
        '<path d="M6 8h12v3a6 6 0 0 1-6 6 6 6 0 0 1-6-6z"></path>' +
        '<path d="M12 17v5"></path></svg>';

    function buildDock(mode) {
        const isPageChat = (mode === 'page');
        const d = el('div', NS + '-dock');
        d.id = isPageChat ? 'nsft-ai-dock-page' : 'nsft-ai-dock';

        const history = [];

        let hasProvider = null;

        let activeBaseUrl = '';

        const session = { interactionId: null, totals: null };

        let showSteps = false;
        let showTokens = false;
        let askFirst = true;

        function openFaq() {
            try { window.open(chrome.runtime.getURL('popup/ai_faq.html'), '_blank', 'noopener'); } catch (e) { }
        }

        const head = el('div', NS + '-dock-head');
        head.appendChild(el('div', NS + '-dock-title', '✦ ' + chrome.i18n.getMessage('sqlai_title')));
        const beta = el('span', NS + '-beta', chrome.i18n.getMessage('sqlai_beta'));
        beta.title = chrome.i18n.getMessage('sqlai_beta_title');
        head.appendChild(beta);
        head.appendChild(el('div', NS + '-spacer'));
        const newBtn = el('button', NS + '-iconbtn'); newBtn.title = chrome.i18n.getMessage('sqlai_new_chat');
        newBtn.innerHTML = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4z"></path></svg>';
        const gear = el('button', NS + '-iconbtn', '⚙'); gear.title = chrome.i18n.getMessage('sqlai_settings');
        gear.addEventListener('click', openSettings);
        const faqBtn = el('button', NS + '-iconbtn', '?'); faqBtn.title = chrome.i18n.getMessage('sqlai_faq_title');
        faqBtn.addEventListener('click', openFaq);
        head.appendChild(newBtn); head.appendChild(gear); head.appendChild(faqBtn);

        if (!isPageChat) {
            const closeBtn = el('button', NS + '-iconbtn');
            closeBtn.type = 'button';
            closeBtn.title = chrome.i18n.getMessage('sqlai_close');
            closeBtn.setAttribute('aria-label', chrome.i18n.getMessage('sqlai_close'));
            closeBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" '
                + 'stroke="currentColor" stroke-width="2.2" stroke-linecap="round">'
                + '<path d="M6 6l12 12M18 6L6 18"></path></svg>';
            closeBtn.addEventListener('click', () => toggleDock());
            head.appendChild(closeBtn);
        }

        d.appendChild(head);

        const conv = el('div', NS + '-conv');
        d.appendChild(conv);

        function makeHint() {
            const wrap = el('div', NS + '-hint');
            paintHint(wrap);
            return wrap;
        }

        function paintHint(wrap) {
            wrap.innerHTML = '';
            if (hasProvider === null) return;
            const badge = el('div', NS + '-hint-badge' + (hasProvider ? '' : ' ' + NS + '-hint-warn'));
            badge.innerHTML = hasProvider ? SPARK_SVG : PLUG_SVG;
            wrap.appendChild(badge);
            const titleKey = hasProvider
                ? (isPageChat ? 'sqlai_hint_title_chat' : 'sqlai_hint_title')
                : 'sqlai_noprov_title';
            const subKey = hasProvider
                ? (isPageChat ? 'sqlai_hint_sub_chat' : 'sqlai_hint_sub')
                : 'sqlai_noprov_sub';
            wrap.appendChild(el('div', NS + '-hint-title', chrome.i18n.getMessage(titleKey)));
            wrap.appendChild(el('div', NS + '-hint-sub', chrome.i18n.getMessage(subKey)));
            if (!hasProvider) {
                const cta = el('button', NS + '-hint-cta', chrome.i18n.getMessage('sqlai_noprov_cta'));
                cta.type = 'button';
                cta.addEventListener('click', openSettings);
                wrap.appendChild(cta);
                const faq = el('button', NS + '-hint-faq', chrome.i18n.getMessage('sqlai_faq_link'));
                faq.type = 'button';
                faq.addEventListener('click', openFaq);
                wrap.appendChild(faq);
            }
        }

        function applyProviderState() {
            const hint = conv.querySelector('.' + NS + '-hint');
            if (hint) paintHint(hint);
            ta.disabled = running || !hasProvider;
            ta.placeholder = hasProvider
                ? chrome.i18n.getMessage(isPageChat ? 'sqlai_ph_chat' : 'sqlai_ph')
                : chrome.i18n.getMessage('sqlai_ph_disabled');
            send.disabled = !hasProvider;
        }
        function resetConv() {
            if (running) return;
            history.length = 0;
            session.interactionId = null;
            session.totals = null;
            session.lastSql = '';
            paintTokChip();
            conv.innerHTML = '';
            conv.appendChild(makeHint());
        }
        conv.appendChild(makeHint());
        newBtn.addEventListener('click', resetConv);

        const composer = el('div', NS + '-composer');
        const ta = el('textarea', NS + '-composer-input');
        ta.placeholder = chrome.i18n.getMessage(isPageChat ? 'sqlai_ph_chat' : 'sqlai_ph');
        ta.rows = 1;
        const send = el('button', NS + '-send'); send.title = chrome.i18n.getMessage('sqlai_send'); send.innerHTML = ARROW_SVG;
        composer.appendChild(ta); composer.appendChild(send);
        d.appendChild(composer);

        const footbar = el('div', NS + '-footbar');
        const combo = el('button', NS + '-provpick'); combo.type = 'button'; combo.title = chrome.i18n.getMessage('sqlai_prov_change');
        const menu = el('div', NS + '-provmenu'); menu.style.display = 'none';

        const lvlName = (n) => chrome.i18n.getMessage('sqlai_lvl_' + n) || ('Nivel ' + n);
        const lvlDesc = (n) => chrome.i18n.getMessage('sqlai_lvl_' + n + '_desc') || '';
        const modeName = (ask) => chrome.i18n.getMessage(ask ? 'sqlai_mode_ask' : 'sqlai_mode_auto');
        const modeDesc = (ask) => chrome.i18n.getMessage(ask ? 'sqlai_mode_ask_desc' : 'sqlai_mode_auto_desc');

        const SLIDERS_SVG = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
            'stroke-width="2" stroke-linecap="round"><line x1="4" y1="8" x2="20" y2="8"/>' +
            '<line x1="4" y1="16" x2="20" y2="16"/><circle cx="15" cy="8" r="2.4" fill="currentColor" stroke="none"/>' +
            '<circle cx="9" cy="16" r="2.4" fill="currentColor" stroke="none"/></svg>';

        let curLevel = clampCtxLevel(CTX_MIN);
        const cfgPick = el('button', NS + '-lvlpick ' + NS + '-cfgpick'); cfgPick.type = 'button';
        const cfgMenu = el('div', NS + '-provmenu ' + NS + '-cfgmenu'); cfgMenu.style.display = 'none';

        cfgMenu.appendChild(el('div', NS + '-menuhead', chrome.i18n.getMessage('sqlai_mode_menu_head')));
        const modeItems = [];
        [true, false].forEach((ask) => {
            const item = el('div', NS + '-provitem ' + NS + '-modeitem');
            item.dataset.ask = ask ? '1' : '0';
            const txt = el('div', NS + '-modeitemtext');
            txt.appendChild(el('div', NS + '-provname', modeName(ask)));
            txt.appendChild(el('div', NS + '-modeitemdesc', modeDesc(ask)));
            item.appendChild(txt);
            item.appendChild(el('span', NS + '-menucheck', '✓'));
            item.addEventListener('click', () => {
                askFirst = ask;
                try { chrome.storage.local.set({ [CFG.askFirst]: ask }); } catch (e) { }
                paintCfg();
            });
            modeItems.push(item);
            cfgMenu.appendChild(item);
        });

        const lvlHead = el('div', NS + '-menuhead ' + NS + '-cfghead');
        lvlHead.appendChild(el('span', null, chrome.i18n.getMessage('sqlai_lvl_label') || 'Razonamiento'));
        const lvlHeadVal = el('span', NS + '-cfgheadval');
        lvlHead.appendChild(lvlHeadVal);
        cfgMenu.appendChild(lvlHead);

        const lvlWrap = el('div', NS + '-cfgslider');
        const lvlRange = el('input', NS + '-ctxrange');
        lvlRange.type = 'range';
        lvlRange.min = String(CTX_MIN); lvlRange.max = String(CTX_MAX); lvlRange.step = '1';
        lvlWrap.appendChild(lvlRange);
        const lvlScale = el('div', NS + '-cfgscale');
        const scaleStops = [CTX_MIN, Math.round((CTX_MIN + CTX_MAX) / 2), CTX_MAX];
        const scaleEls = scaleStops.map((n) => {
            const s = el('span', NS + '-cfgstop', lvlName(n));
            s.dataset.lvl = String(n);
            lvlScale.appendChild(s);
            return s;
        });
        lvlWrap.appendChild(lvlScale);
        cfgMenu.appendChild(lvlWrap);

        const lvlDescEl = el('div', NS + '-cfglvldesc');
        cfgMenu.appendChild(lvlDescEl);

        function paintCfg() {
            cfgPick.innerHTML = '';
            const ic = el('span', NS + '-lvlspark');
            ic.innerHTML = SLIDERS_SVG;
            cfgPick.appendChild(ic);
            cfgPick.appendChild(el('span', NS + '-lvlname',
                modeName(askFirst) + ' · ' + lvlName(curLevel)));
            cfgPick.appendChild(el('span', NS + '-caret', '▾'));
            cfgPick.title = (chrome.i18n.getMessage('sqlai_mode_label') || 'Modo') + ': ' +
                modeName(askFirst) + ' — ' + modeDesc(askFirst) + '\n' +
                (chrome.i18n.getMessage('sqlai_lvl_label') || 'Razonamiento') + ': ' +
                lvlName(curLevel) + ' — ' + lvlDesc(curLevel);
            cfgPick.classList.toggle(NS + '-modeauto', !askFirst);

            modeItems.forEach((it) => {
                it.classList.toggle(NS + '-active', (it.dataset.ask === '1') === askFirst);
            });
            lvlRange.value = String(curLevel);
            lvlHeadVal.textContent = lvlName(curLevel);
            lvlDescEl.textContent = lvlDesc(curLevel);
            scaleEls.forEach((s) => {
                s.classList.toggle(NS + '-active', Number(s.dataset.lvl) === curLevel);
            });
        }

        lvlRange.addEventListener('input', () => {
            curLevel = clampCtxLevel(lvlRange.value);
            paintCfg();
        });
        const persistLevel = () => {
            try { chrome.storage.local.set({ [CFG.ctxLevel]: curLevel }); } catch (e) { }
        };
        lvlRange.addEventListener('change', persistLevel);

        cfgMenu.addEventListener('click', (e) => e.stopPropagation());


        const tokChip = el('span', NS + '-tokchip');
        tokChip.style.display = 'none';
        let curPriceModel = '';
        function paintTokChip() {
            const t = session.totals;
            if (!showTokens || !t || !t.total) { tokChip.style.display = 'none'; return; }
            let text = 'Σ ' + chrome.i18n.getMessage('sqlai_tokens', [fmtNum(t.total)]);
            const cost = estimateCost(curPriceModel, t);
            if (cost != null) text += ' · ≈$' + (cost < 0.01 ? cost.toFixed(4) : cost.toFixed(2));
            tokChip.textContent = text;
            tokChip.title = chrome.i18n.getMessage('sqlai_tokens_title', [fmtNum(t.in), fmtNum(t.out)]) +
                (cost != null ? '\n' + chrome.i18n.getMessage('sqlai_cost_title') : '');
            tokChip.style.display = '';
        }

        footbar.appendChild(combo);
        footbar.appendChild(tokChip);
        footbar.appendChild(el('div', NS + '-spacer'));
        footbar.appendChild(cfgPick);
        footbar.appendChild(menu); footbar.appendChild(cfgMenu);
        d.appendChild(footbar);

        function refreshBar() {
            loadAll().then((a) => {
                showSteps = a.showSteps;
                showTokens = a.showTokens;
                askFirst = a.askFirst;
                curLevel = clampCtxLevel(a.ctxLevel);
                paintCfg();
                const configured = Object.keys(PROVIDERS).filter((pk) => isConfigured(pk, a.configs));
                const enabled = configured.filter((pk) => !((a.configs[pk] || {}).disabled));
                hasProvider = enabled.length > 0;
                combo.innerHTML = '';
                combo.className = NS + '-provpick' + (hasProvider ? '' : ' ' + NS + '-provpick-warn');
                if (!hasProvider) {
                    combo.appendChild(el('span', NS + '-provname', chrome.i18n.getMessage('sqlai_prov_none')));
                    combo.title = chrome.i18n.getMessage('sqlai_prov_none_title');
                    activeBaseUrl = '';
                    curPriceModel = '';
                    paintTokChip();
                    applyProviderState();
                    return;
                }
                if ((a.configs[a.active] || {}).disabled) {
                    setActiveProvider(enabled[0]).then(refreshBar);
                    return;
                }
                const cfg = resolveCfg(a.active, a.configs, a.maxRows);
                activeBaseUrl = cfg.baseUrl || '';
                curPriceModel = cfg.model || '';
                paintTokChip();
                combo.title = ((PROVIDERS[a.active] || {}).label || a.active) + ' · ' + (cfg.model || '');
                combo.appendChild(makeLogo(a.active));
                combo.appendChild(el('span', NS + '-modelname', cfg.model || '—'));
                combo.appendChild(el('span', NS + '-caret', '▾'));

                menu.innerHTML = '';
                enabled.forEach((pk) => {
                    const pcfg = resolveCfg(pk, a.configs, a.maxRows);
                    const hiddenSet = ((a.configs[pk] || {}).hidden) || [];
                    const visibleModels = pcfg.models.filter((m) => hiddenSet.indexOf(m) === -1);
                    if (!visibleModels.length) return;
                    const ghead = el('div', NS + '-menugroup');
                    ghead.appendChild(makeLogo(pk));
                    ghead.appendChild(el('span', NS + '-menugroup-name', ((PROVIDERS[pk] || {}).label || pk)));
                    menu.appendChild(ghead);
                    visibleModels.forEach((m) => {
                        const isActive = pk === a.active && m === cfg.model;
                        const item = el('div', NS + '-provitem ' + NS + '-modelitem' + (isActive ? ' ' + NS + '-active' : ''));
                        item.appendChild(el('span', NS + '-provname', m));
                        item.appendChild(el('span', NS + '-menucheck', '✓'));
                        item.addEventListener('click', () => {
                            menu.style.display = 'none';
                            setActiveProvider(pk)
                                .then(() => setActiveModel(pk, m))
                                .then(refreshBar);
                        });
                        menu.appendChild(item);
                    });
                });
                applyProviderState();
            });
        }
        function closeMenus() {
            menu.style.display = 'none';
            cfgMenu.style.display = 'none';
        }
        combo.addEventListener('click', (e) => {
            e.stopPropagation();
            if (!hasProvider) { openSettings(); return; }
            const open = menu.style.display === 'none';
            closeMenus();
            menu.style.display = open ? 'block' : 'none';
        });
        cfgPick.addEventListener('click', (e) => {
            e.stopPropagation();
            const open = cfgMenu.style.display === 'none';
            closeMenus();
            cfgMenu.style.display = open ? 'block' : 'none';
        });
        document.addEventListener('click', closeMenus);
        refreshBar();
        refreshProviderBar = refreshBar;

        function scrollDown() { conv.scrollTop = conv.scrollHeight; }
        function autoGrow() { ta.style.height = 'auto'; ta.style.height = Math.min(120, ta.scrollHeight) + 'px'; }

        function setRunning(on) {
            running = on;
            ta.disabled = on || !hasProvider;
            send.classList.toggle(NS + '-stop', on);
            send.innerHTML = on ? STOP_SVG : ARROW_SVG;
            send.title = on ? chrome.i18n.getMessage('sqlai_stop') : chrome.i18n.getMessage('sqlai_send');
        }

        function addUserBubble(text) {
            const m = el('div', NS + '-msg ' + NS + '-user');
            m.appendChild(el('div', NS + '-bubble', text));
            conv.appendChild(m); scrollDown();
        }

        function startBotTurn() {
            const h = conv.querySelector('.' + NS + '-hint');
            if (h && h.parentNode) h.parentNode.removeChild(h);
            const turn = el('div', NS + '-msg ' + NS + '-bot');
            const steps = el('div', NS + '-steps');
            const answer = el('div', NS + '-answer');
            const statusEl = el('div', NS + '-turnstatus ' + NS + '-working');
            statusEl.appendChild(makeTypingDots());
            turn.appendChild(steps); turn.appendChild(answer); turn.appendChild(statusEl);
            conv.appendChild(turn); scrollDown();
            return { statusEl, steps, answer };
        }

        function addQueryLine(host, q) {
            const row = el('div', NS + '-qline');
            row.appendChild(el('span', NS + '-qdot', '▹'));
            row.appendChild(el('code', NS + '-qsql', String(q || '').replace(/\s+/g, ' ').trim().slice(0, 300)));
            const st = el('span', NS + '-qstate', '…');
            row.appendChild(st);
            host.appendChild(row);
            return st;
        }

        function showError(refs, msg) {
            refs.statusEl.textContent = '✕ ' + chrome.i18n.getMessage('sqlai_error');
            refs.statusEl.className = NS + '-turnstatus ' + NS + '-err';
            refs.answer.innerHTML = '';
            refs.answer.appendChild(el('div', NS + '-bubble ' + NS + '-errbubble', String(msg == null ? '' : msg)));
            scrollDown();
        }

        function makeCb(refs) {
            let pending = null;

            const STATUS_MIN_MS = 450;
            let lastPaint = 0, statusTimer = 0;

            const applyStatus = (t) => {
                if (aborted) return;
                const prev = refs.statusEl.querySelector('.' + NS + '-statustext');
                if (prev && refs.statusEl.classList.contains(NS + '-working')) {
                    prev.textContent = t;
                } else {
                    refs.statusEl.className = NS + '-turnstatus ' + NS + '-working';
                    refs.statusEl.innerHTML = '';
                    refs.statusEl.appendChild(el('span', NS + '-statustext', t));
                    refs.statusEl.appendChild(makeTypingDots());
                }
                lastPaint = Date.now();
            };

            const paintStatus = (t, defer) => {
                if (statusTimer) { clearTimeout(statusTimer); statusTimer = 0; }
                const wait = STATUS_MIN_MS - (Date.now() - lastPaint);
                if (!defer || wait <= 0) { applyStatus(t); return; }
                statusTimer = setTimeout(() => { statusTimer = 0; applyStatus(t); }, wait);
            };

            const stopStatus = () => {
                if (statusTimer) { clearTimeout(statusTimer); statusTimer = 0; }
            };

            return {
                status: (t, opts) => {
                    if (t) paintStatus(t, !!(opts && opts.defer));
                    scrollDown();
                },
                query: (q) => {
                    if (!showSteps) return;
                    pending = addQueryLine(refs.steps, q);
                    scrollDown();
                },
                queryResult: (ok, msg) => {
                    if (!pending) return;
                    pending.textContent = (ok ? '✓ ' : '✕ ') + msg;
                    pending.className = NS + '-qstate ' + (ok ? NS + '-ok' : NS + '-err');
                    pending = null;
                    scrollDown();
                },
                preview: () => {},
                confirmWrite: (req) => new Promise((resolve) => {
                    const turn = el('div', NS + '-msg ' + NS + '-bot');
                    const card = el('div', NS + '-writecard');
                    card.appendChild(el('div', NS + '-writetitle', '⚠ ' + chrome.i18n.getMessage('sqlai_write_title')));
                    card.appendChild(el('div', NS + '-writemeta', chrome.i18n.getMessage('sqlai_write_target', [req.recordType, req.recordId])));
                    if (req.reason) card.appendChild(el('div', NS + '-writereason', req.reason));
                    const list = el('div', NS + '-writefields');
                    Object.keys(req.values || {}).forEach((k) => {
                        const row = el('div', NS + '-writefield');
                        row.appendChild(el('code', NS + '-writefid', k));
                        row.appendChild(el('span', NS + '-writearrow', '→'));
                        row.appendChild(el('span', NS + '-writeval', String(req.values[k])));
                        list.appendChild(row);
                    });
                    card.appendChild(list);
                    const note = el('div', NS + '-writenote');
                    const acts = el('div', NS + '-ctxacts');
                    const okBtn = el('button', NS + '-btn ' + NS + '-small ' + NS + '-writego', chrome.i18n.getMessage('sqlai_write_allow'));
                    const noBtn = el('button', NS + '-btn ' + NS + '-small', chrome.i18n.getMessage('sqlai_write_deny'));
                    okBtn.type = 'button'; noBtn.type = 'button';
                    acts.appendChild(okBtn); acts.appendChild(noBtn);
                    card.appendChild(acts); card.appendChild(note);
                    turn.appendChild(card);
                    conv.appendChild(turn); scrollDown();
                    let settled = false;
                    const mark = (ok, err) => {
                        note.textContent = ok
                            ? '✓ ' + chrome.i18n.getMessage('sqlai_write_applied')
                            : '✕ ' + chrome.i18n.getMessage('sqlai_write_failed', [err || '?']);
                        note.className = NS + '-writenote ' + (ok ? NS + '-ok' : NS + '-err');
                        scrollDown();
                    };
                    const pick = (approved) => {
                        if (settled) return;
                        settled = true;
                        acts.remove();
                        if (!approved) {
                            note.textContent = chrome.i18n.getMessage('sqlai_write_denied_note');
                        }
                        resolve({ approved: approved, mark: mark });
                    };
                    okBtn.addEventListener('click', () => pick(true));
                    noBtn.addEventListener('click', () => pick(false));
                }),
                aborted: () => aborted,
                done: (text, usage) => {
                    stopStatus();
                    setRunning(false);
                    refs.statusEl.textContent = '● ' + chrome.i18n.getMessage('sqlai_done');
                    refs.statusEl.className = NS + '-turnstatus ' + NS + '-done';
                    if (showTokens && usage && usage.total) {
                        const tag = el('span', NS + '-tokens', chrome.i18n.getMessage('sqlai_tokens', [fmtNum(usage.total)]));
                        tag.title = chrome.i18n.getMessage('sqlai_tokens_title', [fmtNum(usage.in), fmtNum(usage.out)]);
                        refs.statusEl.appendChild(tag);
                    }
                    paintTokChip();
                    renderAnswer(refs.answer, text, isPageChat, askFirst); scrollDown();
                },
                error: (msg) => { stopStatus(); setRunning(false); paintTokChip(); showError(refs, msg); },
                limitReached: (max, resume) => {
                    stopStatus();
                    setRunning(false);
                    paintTokChip();
                    refs.statusEl.innerHTML = '';
                    refs.statusEl.textContent = '⏸ ' + chrome.i18n.getMessage('sqlai_limit_status');
                    refs.statusEl.className = NS + '-turnstatus ' + NS + '-paused';

                    const card = el('div', NS + '-limitcard');
                    card.appendChild(el('div', NS + '-limittitle', chrome.i18n.getMessage('sqlai_limit_title')));
                    card.appendChild(el('div', NS + '-limitbody',
                        chrome.i18n.getMessage('sqlai_limit_body', [String(max)])));

                    const acts = el('div', NS + '-ctxacts');
                    const goBtn = el('button', NS + '-btn ' + NS + '-small ' + NS + '-primary',
                        chrome.i18n.getMessage('sqlai_limit_continue'));
                    goBtn.type = 'button';
                    acts.appendChild(goBtn);

                    const prefBtn = el('button', NS + '-btn ' + NS + '-small ' + NS + '-limitpref',
                        chrome.i18n.getMessage('sqlai_limit_prefs'));
                    prefBtn.type = 'button';
                    prefBtn.title = chrome.i18n.getMessage('sqlai_limit_prefs_title');
                    prefBtn.addEventListener('click', () => openSettings({ tab: 'prefs', focus: 'iters' }));
                    acts.appendChild(prefBtn);

                    card.appendChild(acts);
                    refs.answer.appendChild(card);
                    scrollDown();

                    let used = false;
                    goBtn.addEventListener('click', () => {
                        if (used) return;
                        used = true;
                        card.remove();
                        aborted = false;
                        setRunning(true);
                        paintStatus(chrome.i18n.getMessage('sqlai_limit_resuming'));
                        scrollDown();
                        resume();
                    });
                }
            };
        }

        function askContext(editorSql, onPick) {
            const turn = el('div', NS + '-msg ' + NS + '-bot');
            const bubble = el('div', NS + '-bubble', chrome.i18n.getMessage('sqlai_ctx_ask'));
            const acts = el('div', NS + '-ctxacts');
            const useBtn = el('button', NS + '-btn ' + NS + '-small ' + NS + '-primary', chrome.i18n.getMessage('sqlai_ctx_use'));
            const newBtn2 = el('button', NS + '-btn ' + NS + '-small', chrome.i18n.getMessage('sqlai_ctx_fresh'));
            useBtn.type = 'button'; newBtn2.type = 'button';
            acts.appendChild(useBtn); acts.appendChild(newBtn2);
            turn.appendChild(bubble); turn.appendChild(acts);
            conv.appendChild(turn); scrollDown();

            let done = false;
            const pick = (useIt) => {
                if (done) return;
                done = true;
                acts.remove();
                bubble.textContent = chrome.i18n.getMessage(useIt ? 'sqlai_ctx_using' : 'sqlai_ctx_ignoring');
                onPick(useIt ? editorSql : '');
            };
            useBtn.addEventListener('click', () => pick(true));
            newBtn2.addEventListener('click', () => pick(false));
        }

        function runTurn(prompt, editorSql) {
            _chatMode = isPageChat;
            setRunning(true);
            const refs = startBotTurn();
            runAgent(prompt, makeCb(refs), history, session, editorSql).catch((e) => {
                setRunning(false);
                showError(refs, (e && e.message) || e);
            });
        }

        async function start() {
            if (running) { aborted = true; setRunning(false); return; }
            if (!hasProvider) { openSettings(); return; }
            const prompt = ta.value.trim();
            if (!prompt) return;

            const okPerm = await nsftAiEnsureHostPermission(activeBaseUrl);
            if (!okPerm) {
                addUserBubble(prompt);
                showError(startBotTurn(), chrome.i18n.getMessage('sqlai_err_perm'));
                return;
            }

            aborted = false;
            addUserBubble(prompt);
            ta.value = ''; autoGrow();

            const editorSql = history.length ? '' : getEditorValue();
            if (editorSql) {
                askContext(editorSql, (sql) => runTurn(prompt, sql));
                return;
            }
            runTurn(prompt, '');
        }

        send.addEventListener('click', start);
        ta.addEventListener('input', autoGrow);
        ta.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); start(); }
        });

        return d;
    }

    function flash(btn, msg, backKey) {
        btn.textContent = msg;
        setTimeout(() => { btn.textContent = chrome.i18n.getMessage(backKey); }, 1500);
    }

    function renderAnswer(container, text, chatOnly, askFirst) {
        const raw = extractSql(text);
        if (chatOnly) {
            const prose2 = String(text || '').replace(/<sql>[\s\S]*?<\/sql>/i, '').trim();
            const bub = el('div', NS + '-bubble');
            bub.appendChild(renderMarkdown(prose2 || 'Listo.'));
            container.appendChild(bub);
            return;
        }
        if (raw) {
            const sql = formatSql(raw);

            const hasVars = /\{\{\s*[^}\s][^}]*\}\}/.test(sql);
            const auto = askFirst === false;
            if (auto) {
                setEditorValue(sql);
                if (!hasVars) runInRunner(sql);
            }

            const doneKey = auto
                ? (hasVars ? 'sqlai_answer_auto_vars' : 'sqlai_answer_auto')
                : (hasVars ? 'sqlai_answer_vars' : 'sqlai_answer_ask');
            container.appendChild(el('div', NS + '-bubble', chrome.i18n.getMessage(doneKey)));

            const box = el('div', NS + '-sqlbox');
            box.appendChild(el('div', NS + '-sqllabel', 'SuiteQL'));
            const pre = el('pre', NS + '-sqlcode');
            const code = document.createElement('code');
            code.className = 'hljs language-sql';
            code.innerHTML = highlightSql(sql);
            pre.appendChild(code);
            box.appendChild(pre);

            const row = el('div', NS + '-sqlactions');

            const runBtn = el('button', NS + '-btn ' + NS + '-small ' + NS + '-primary',
                chrome.i18n.getMessage('sqlai_run'));
            runBtn.title = chrome.i18n.getMessage('sqlai_run_title');
            runBtn.addEventListener('click', () => runInRunner(sql));

            const toEditorBtn = el('button', NS + '-btn ' + NS + '-small',
                chrome.i18n.getMessage('sqlai_to_editor'));
            toEditorBtn.title = chrome.i18n.getMessage('sqlai_to_editor_title');
            toEditorBtn.addEventListener('click', () => {
                if (setEditorValue(sql)) {
                    flash(toEditorBtn, chrome.i18n.getMessage('sqlai_to_editor_done'), 'sqlai_to_editor');
                }
            });

            const copyBtn = el('button', NS + '-btn ' + NS + '-small', chrome.i18n.getMessage('sqlai_copy'));
            copyBtn.title = chrome.i18n.getMessage('sqlai_copy_title');
            copyBtn.addEventListener('click', () => {
                try {
                    navigator.clipboard.writeText(sql);
                    flash(copyBtn, chrome.i18n.getMessage('sqlai_copied'), 'sqlai_copy');
                } catch (e) { }
            });

            row.appendChild(runBtn); row.appendChild(toEditorBtn); row.appendChild(copyBtn);
            box.appendChild(row);
            container.appendChild(box);
            return;
        }
        const prose = String(text || '').replace(/<sql>[\s\S]*?<\/sql>/i, '').trim();
        container.appendChild(el('div', NS + '-bubble', prose || 'Listo.'));
    }

    function noAutofill(input) {
        input.autocomplete = 'off';
        input.setAttribute('autocorrect', 'off');
        input.setAttribute('autocapitalize', 'off');
        input.setAttribute('spellcheck', 'false');
        input.setAttribute('data-1p-ignore', '');
        input.setAttribute('data-lpignore', 'true');
        input.setAttribute('data-form-type', 'other');
    }

    function openSettings(opts) {
        const wantTab = (opts && opts.tab) || null;
        const wantFocus = (opts && opts.focus) || null;
        loadAll().then((a) => {
            const overlay = el('div', NS + '-overlay');
            const card = el('div', NS + '-modal');
            const head = el('div', NS + '-mhead');
            const heads = el('div', NS + '-mheadtext');
            heads.appendChild(el('div', NS + '-title', chrome.i18n.getMessage('sqlai_settings_title')));
            heads.appendChild(el('div', NS + '-msub', chrome.i18n.getMessage('sqlai_settings_sub')));
            head.appendChild(heads);
            const xBtn = el('button', NS + '-mclose', '✕');
            xBtn.type = 'button'; xBtn.title = chrome.i18n.getMessage('sqlai_close');
            head.appendChild(xBtn);
            card.appendChild(head);

            const tabsBar = el('div', NS + '-tabs');
            const tabConn = el('button', NS + '-tab ' + NS + '-active', chrome.i18n.getMessage('sqlai_tab_conn'));
            const tabPrefs = el('button', NS + '-tab', chrome.i18n.getMessage('sqlai_tab_prefs'));
            const tabPrompts = el('button', NS + '-tab', chrome.i18n.getMessage('sqlai_tab_prompts'));
            tabConn.type = 'button'; tabPrefs.type = 'button'; tabPrompts.type = 'button';
            tabsBar.appendChild(tabConn); tabsBar.appendChild(tabPrefs); tabsBar.appendChild(tabPrompts);
            card.appendChild(tabsBar);

            const body = el('div', NS + '-mbody');
            card.appendChild(body);

            const paneConn = el('div', NS + '-pane ' + NS + '-cols');
            const colLeft = el('div', NS + '-col');
            const colDiv = el('div', NS + '-coldiv');
            const colRight = el('div', NS + '-col');
            paneConn.appendChild(colLeft); paneConn.appendChild(colDiv); paneConn.appendChild(colRight);
            body.appendChild(paneConn);

            const panePrefs = el('div', NS + '-pane ' + NS + '-hidden');
            body.appendChild(panePrefs);

            const panePrompts = el('div', NS + '-pane ' + NS + '-hidden');
            body.appendChild(panePrompts);

            function selectTab(which) {
                tabConn.classList.toggle(NS + '-active', which === 'conn');
                tabPrefs.classList.toggle(NS + '-active', which === 'prefs');
                tabPrompts.classList.toggle(NS + '-active', which === 'prompts');
                paneConn.classList.toggle(NS + '-hidden', which !== 'conn');
                panePrefs.classList.toggle(NS + '-hidden', which !== 'prefs');
                panePrompts.classList.toggle(NS + '-hidden', which !== 'prompts');
                restoreBtn.style.display = which === 'prefs' ? '' : 'none';
            }
            tabConn.addEventListener('click', () => selectTab('conn'));
            tabPrefs.addEventListener('click', () => selectTab('prefs'));
            tabPrompts.addEventListener('click', () => selectTab('prompts'));

            const form = colLeft;

            function makeLink(text, href) {
                const a2 = document.createElement('a');
                a2.className = NS + '-link';
                a2.textContent = text;
                a2.href = href; a2.target = '_blank'; a2.rel = 'noopener noreferrer';
                return a2;
            }
            function labelRow(text, host) {
                const row = el('div', NS + '-flabelrow');
                row.appendChild(el('span', NS + '-flabel', text));
                const slot = el('span', NS + '-linkslot');
                row.appendChild(slot);
                (host || form).appendChild(row);
                return slot;
            }

            const provSlot = labelRow(chrome.i18n.getMessage('sqlai_f_provider'));
            let currentPk = a.active;
            const selWrap = el('div', NS + '-selwrap');
            const selBtn = el('button', NS + '-provsel'); selBtn.type = 'button';
            const selMenu = el('div', NS + '-selmenu ' + NS + '-hidden');
            selWrap.appendChild(selBtn); selWrap.appendChild(selMenu);
            form.appendChild(selWrap);

            const provHideRow = el('label', NS + '-checkrow');
            const provHideChk = el('input', NS + '-check'); provHideChk.type = 'checkbox';
            provHideRow.appendChild(provHideChk);
            provHideRow.appendChild(el('span', NS + '-flabel', chrome.i18n.getMessage('sqlai_prov_hide')));
            form.appendChild(provHideRow);

            function provRow(pk, host) {
                host.appendChild(makeLogo(pk));
                host.appendChild(el('span', NS + '-provname', (PROVIDERS[pk] || {}).label || pk));
                if (isConfigured(pk, a.configs)) host.appendChild(el('span', NS + '-provok', '✓'));
            }
            function renderSelBtn() {
                selBtn.innerHTML = '';
                provRow(currentPk, selBtn);
                selBtn.appendChild(el('span', NS + '-caret', '▾'));
            }
            function renderSelMenu() {
                selMenu.innerHTML = '';
                Object.keys(PROVIDERS).forEach((pk) => {
                    const item = el('div', NS + '-provitem' + (pk === currentPk ? ' ' + NS + '-active' : ''));
                    provRow(pk, item);
                    item.addEventListener('click', () => {
                        selMenu.classList.add(NS + '-hidden');
                        currentPk = pk;
                        renderSelBtn();
                        loadFields(pk);
                    });
                    selMenu.appendChild(item);
                });
            }
            selBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                renderSelMenu();
                selMenu.classList.toggle(NS + '-hidden');
            });
            card.addEventListener('click', () => selMenu.classList.add(NS + '-hidden'));

            const keyRow = el('div', NS + '-flabelrow');
            const keyLeft = el('div', NS + '-flabelinfo');
            keyLeft.appendChild(el('span', NS + '-flabel', chrome.i18n.getMessage('sqlai_f_apikey')));
            const info = el('span', NS + '-infodot', 'i');
            info.appendChild(el('span', NS + '-infotip', chrome.i18n.getMessage('sqlai_key_info')));
            keyLeft.appendChild(info);
            keyRow.appendChild(keyLeft);
            const keySlot = el('span', NS + '-linkslot');
            keyRow.appendChild(keySlot);
            form.appendChild(keyRow);
            const keyWrap = el('div', NS + '-secretwrap');
            const keyInput = el('input', NS + '-input ' + NS + '-input-secret');
            keyInput.type = 'text'; keyInput.placeholder = chrome.i18n.getMessage('sqlai_key_ph');
            noAutofill(keyInput);
            const keyEye = el('button', NS + '-eye', '👁'); keyEye.type = 'button'; keyEye.title = chrome.i18n.getMessage('sqlai_key_reveal');
            keyEye.addEventListener('click', () => { keyInput.classList.toggle(NS + '-revealed'); });
            const keyClear = el('button', NS + '-eye ' + NS + '-keyclear'); keyClear.type = 'button';
            keyClear.title = chrome.i18n.getMessage('sqlai_key_clear') || 'Borrar clave';
            keyClear.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>';
            keyClear.addEventListener('click', () => { keyInput.value = ''; keyInput.focus(); });
            keyWrap.appendChild(keyInput); keyWrap.appendChild(keyEye); keyWrap.appendChild(keyClear);
            form.appendChild(keyWrap);

            const urlSlot = labelRow(chrome.i18n.getMessage('sqlai_f_baseurl'));
            const urlInput = el('input', NS + '-input'); urlInput.type = 'text';
            noAutofill(urlInput);
            form.appendChild(urlInput);

            const modelSlot = labelRow(chrome.i18n.getMessage('sqlai_f_models'), colRight);
            let models = [];
            let activeModel = '';

            const addRow = el('div', NS + '-addrow');
            const modelInput = el('input', NS + '-input'); modelInput.type = 'text';
            modelInput.placeholder = chrome.i18n.getMessage('sqlai_model_ph');
            noAutofill(modelInput);
            const addBtn = el('button', NS + '-btn ' + NS + '-addbtn', chrome.i18n.getMessage('sqlai_model_add')); addBtn.type = 'button';
            addRow.appendChild(modelInput); addRow.appendChild(addBtn);
            colRight.appendChild(addRow);

            const modelList = el('div', NS + '-modellist');
            colRight.appendChild(modelList);

            const resetRow = el('div', NS + '-modelresetrow');
            const resetBtn = el('button', NS + '-btn ' + NS + '-modelreset',
                chrome.i18n.getMessage('sqlai_model_reset') || 'Restablecer sugeridos');
            resetBtn.type = 'button';
            resetBtn.title = chrome.i18n.getMessage('sqlai_model_reset_title') ||
                'Restaura la lista de modelos sugeridos del proveedor (mantiene los que añadiste tú)';
            resetBtn.addEventListener('click', () => {
                const preset = PROVIDERS[currentPk] || {};
                const defaults = (preset.models || []).slice();
                models = defaults.concat(models.filter((m) => defaults.indexOf(m) === -1));
                hiddenModels = hiddenModels.filter((m) => models.indexOf(m) !== -1 && defaults.indexOf(m) === -1);
                if (!activeModel || models.indexOf(activeModel) === -1) {
                    activeModel = preset.model || models[0] || '';
                }
                renderModels();
            });
            resetRow.appendChild(resetBtn);
            colRight.appendChild(resetRow);

            let hiddenModels = [];
            const EYE_SVG = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>';
            const EYE_OFF_SVG = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"></path><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>';
            function renderModels() {
                modelList.innerHTML = '';
                if (!models.length) {
                    modelList.appendChild(el('div', NS + '-modelempty', chrome.i18n.getMessage('sqlai_model_empty')));
                    return;
                }
                models.forEach((m) => {
                    const isActive = (m === activeModel);
                    const isHidden = hiddenModels.indexOf(m) !== -1;
                    const row = el('div', NS + '-modelrow' + (isActive ? ' ' + NS + '-active' : '') + (isHidden ? ' ' + NS + '-modelhidden' : ''));
                    row.title = isActive
                        ? chrome.i18n.getMessage('sqlai_model_inuse_title')
                        : chrome.i18n.getMessage('sqlai_model_use');
                    const radio = el('span', NS + '-radio');
                    if (isActive) radio.appendChild(el('span', NS + '-radiodot'));
                    row.appendChild(radio);
                    row.appendChild(el('span', NS + '-modelid', m));
                    if (isActive) row.appendChild(el('span', NS + '-modeltag', chrome.i18n.getMessage('sqlai_model_inuse')));
                    const eye = el('button', NS + '-modeleye' + (isHidden ? ' ' + NS + '-off' : ''));
                    eye.type = 'button';
                    eye.title = chrome.i18n.getMessage(isHidden ? 'sqlai_model_show' : 'sqlai_model_hide');
                    eye.innerHTML = isHidden ? EYE_OFF_SVG : EYE_SVG;
                    eye.addEventListener('click', (e) => {
                        e.stopPropagation();
                        if (isHidden) hiddenModels = hiddenModels.filter((x) => x !== m);
                        else hiddenModels.push(m);
                        renderModels();
                    });
                    row.appendChild(eye);
                    const del = el('button', NS + '-modeldel', '×');
                    del.type = 'button'; del.title = chrome.i18n.getMessage('sqlai_model_remove');
                    del.addEventListener('click', (e) => {
                        e.stopPropagation();
                        models = models.filter((x) => x !== m);
                        hiddenModels = hiddenModels.filter((x) => x !== m);
                        if (activeModel === m) activeModel = models[0] || '';
                        renderModels();
                    });
                    row.appendChild(del);
                    row.addEventListener('click', () => { activeModel = m; renderModels(); });
                    modelList.appendChild(row);
                });
            }

            function addModel() {
                const v = modelInput.value.trim();
                if (!v) return;
                if (models.indexOf(v) === -1) models.push(v);
                if (!activeModel) activeModel = v;
                modelInput.value = '';
                renderModels();
                modelInput.focus();
            }
            addBtn.addEventListener('click', addModel);
            modelInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') { e.preventDefault(); addModel(); }
            });

            function renderHelp(pk) {
                const h = (PROVIDERS[pk] || {}).help || {};
                provSlot.innerHTML = ''; keySlot.innerHTML = ''; urlSlot.innerHTML = ''; modelSlot.innerHTML = '';
                if (h.site) provSlot.appendChild(makeLink(chrome.i18n.getMessage('sqlai_link_site'), h.site));
                if (h.keys) keySlot.appendChild(makeLink(chrome.i18n.getMessage('sqlai_link_keys'), h.keys));
                if (h.docs) urlSlot.appendChild(makeLink(chrome.i18n.getMessage('sqlai_link_docs'), h.docs));
                if (h.models) modelSlot.appendChild(makeLink(chrome.i18n.getMessage('sqlai_link_models'), h.models));
            }

            const SEC_ICON_LIMITS = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"></polyline><polyline points="17 6 23 6 23 12"></polyline></svg>';
            const SEC_ICON_EYE = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>';
            const SEC_ICON_SHIELD = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>';

            function prefSection(iconSvg, titleKey, subKey) {
                const sec = el('div', NS + '-prefsec');
                const head = el('div', NS + '-prefsec-head');
                const ic = el('span', NS + '-prefsec-icon'); ic.innerHTML = iconSvg;
                head.appendChild(ic);
                head.appendChild(el('span', NS + '-prefsec-title', chrome.i18n.getMessage(titleKey)));
                head.appendChild(el('span', NS + '-prefsec-sub', chrome.i18n.getMessage(subKey)));
                sec.appendChild(head);
                const body = el('div', NS + '-prefsec-body');
                sec.appendChild(body);
                panePrefs.appendChild(sec);
                return body;
            }
            function prefField(host, labelKey, control, hintKey) {
                const f = el('div', NS + '-preffield');
                f.appendChild(el('label', NS + '-flabel', chrome.i18n.getMessage(labelKey)));
                f.appendChild(control);
                const hint = el('div', NS + '-fhint', hintKey ? chrome.i18n.getMessage(hintKey) : '');
                f.appendChild(hint);
                host.appendChild(f);
                return hint;
            }
            function prefToggle(host, labelKey, hintKey, checked) {
                const row = el('label', NS + '-prefrow');
                const left = el('div', NS + '-prefrow-text');
                const lbl = el('div', NS + '-prefrow-label');
                lbl.appendChild(el('span', null, chrome.i18n.getMessage(labelKey)));
                left.appendChild(lbl);
                left.appendChild(el('div', NS + '-prefrow-hint', chrome.i18n.getMessage(hintKey)));
                const chk = el('input', NS + '-check'); chk.type = 'checkbox'; chk.checked = checked;
                row.appendChild(left); row.appendChild(chk);
                host.appendChild(row);
                return { chk: chk, label: lbl, row: row };
            }

            const secLimits = prefSection(SEC_ICON_LIMITS, 'sqlai_sec_limits', 'sqlai_sec_limits_sub');
            const gridLimits = el('div', NS + '-prefgrid');
            secLimits.appendChild(gridLimits);

            const rowsInput = el('input', NS + '-input');
            rowsInput.type = 'number'; rowsInput.min = '1'; rowsInput.max = '500'; rowsInput.value = String(a.maxRows);
            prefField(gridLimits, 'sqlai_f_maxrows', rowsInput, 'sqlai_maxrows_hint');

            const itersInput = el('input', NS + '-input');
            itersInput.type = 'number';
            itersInput.min = String(AGENT_ITERS_MIN); itersInput.max = String(AGENT_ITERS_MAX);
            itersInput.value = String(a.maxIters);
            prefField(gridLimits, 'sqlai_pref_iters', itersInput, 'sqlai_pref_iters_hint');

            const budgetWrap = el('div', NS + '-suffixwrap');
            const budgetInput = el('input', NS + '-input');
            budgetInput.type = 'number'; budgetInput.min = '0'; budgetInput.step = '1000';
            budgetInput.value = String(a.budget || 0);
            budgetWrap.appendChild(budgetInput);
            budgetWrap.appendChild(el('span', NS + '-suffix', chrome.i18n.getMessage('sqlai_budget_suffix')));
            prefField(gridLimits, 'sqlai_pref_budget', budgetWrap, 'sqlai_pref_budget_hint');

            const ctxRow = el('div', NS + '-ctxwrap ' + NS + '-ctxwrap-pref');
            const ctxRange2 = el('input', NS + '-ctxrange');
            ctxRange2.type = 'range';
            ctxRange2.min = String(CTX_MIN); ctxRange2.max = String(CTX_MAX); ctxRange2.step = '1';
            const ctxName = el('span', NS + '-ctxchip');
            ctxRow.appendChild(ctxRange2); ctxRow.appendChild(ctxName);
            const ctxDescEl = prefField(gridLimits, 'sqlai_pref_ctx', ctxRow, null);

            const lvlName2 = (n) => chrome.i18n.getMessage('sqlai_lvl_' + n) || ('Nivel ' + n);
            const lvlDesc2 = (n) => chrome.i18n.getMessage('sqlai_lvl_' + n + '_desc') || '';
            function paintCtxSel(n) {
                ctxName.textContent = n + ' · ' + lvlName2(n);
                ctxDescEl.textContent = lvlDesc2(n);
            }
            ctxRange2.addEventListener('input', () => paintCtxSel(clampCtxLevel(ctxRange2.value)));
            ctxRange2.value = String(clampCtxLevel(a.ctxLevel));
            paintCtxSel(clampCtxLevel(a.ctxLevel));

            const secView = prefSection(SEC_ICON_EYE, 'sqlai_sec_display', 'sqlai_sec_display_sub');
            const stepsChk = prefToggle(secView, 'sqlai_pref_steps', 'sqlai_pref_steps_hint', a.showSteps).chk;
            const tokChk = prefToggle(secView, 'sqlai_pref_tokens', 'sqlai_pref_tokens_hint', a.showTokens).chk;

            const secPriv = prefSection(SEC_ICON_SHIELD, 'sqlai_sec_privacy', 'sqlai_sec_privacy_sub');
            const askT = prefToggle(secPriv, 'sqlai_pref_askfirst', 'sqlai_pref_askfirst_hint', a.askFirst);
            const askChk = askT.chk;
            const autoBadge = el('span', NS + '-prefbadge', chrome.i18n.getMessage('sqlai_badge_auto'));
            askT.label.appendChild(autoBadge);
            const paintAutoBadge = () => { autoBadge.style.display = askChk.checked ? 'none' : ''; };
            askChk.addEventListener('change', paintAutoBadge);
            paintAutoBadge();

            const maskT = prefToggle(secPriv, 'sqlai_pref_mask', 'sqlai_pref_mask_hint', a.maskPii);
            maskT.row.classList.add(NS + '-prefrow-pink');
            const maskChk = maskT.chk;
            const writesT = prefToggle(secPriv, 'sqlai_pref_writes', 'sqlai_pref_writes_hint', a.allowWrites);
            const writesChk = writesT.chk;
            const roBadge = el('span', NS + '-prefbadge', chrome.i18n.getMessage('sqlai_badge_readonly'));
            writesT.label.appendChild(roBadge);
            const paintRoBadge = () => { roBadge.style.display = writesChk.checked ? 'none' : ''; };
            writesChk.addEventListener('change', paintRoBadge);
            paintRoBadge();

            panePrompts.appendChild(el('label', NS + '-flabel', chrome.i18n.getMessage('sqlai_pref_ctx_edit')));
            panePrompts.appendChild(el('div', NS + '-fhint', chrome.i18n.getMessage('sqlai_pref_ctx_edit_hint')));
            const subBar = el('div', NS + '-subtabs');
            panePrompts.appendChild(subBar);
            const subDesc = el('div', NS + '-fhint');
            panePrompts.appendChild(subDesc);
            const ctxTa = el('textarea', NS + '-input ' + NS + '-ctxta');
            ctxTa.rows = 9;
            ctxTa.spellcheck = false;
            panePrompts.appendChild(ctxTa);

            const ctxResetBtn = el('button', NS + '-btn ' + NS + '-small', chrome.i18n.getMessage('sqlai_ctx_reset'));
            ctxResetBtn.type = 'button';
            panePrompts.appendChild(ctxResetBtn);

            const ctxDrafts = Object.assign({}, a.ctxPrompts || {});
            let ctxEditCur = clampCtxLevel(a.ctxLevel);
            const subBtns = {};
            function stashCtxTa() {
                const v = ctxTa.value.trim();
                const def = defaultLevelBody(ctxEditCur).trim();
                if (v && v !== def) ctxDrafts[String(ctxEditCur)] = v;
                else delete ctxDrafts[String(ctxEditCur)];
            }
            function paintCtxSub(n) {
                for (let i = CTX_MIN; i <= CTX_MAX; i++) subBtns[i].classList.toggle(NS + '-active', i === n);
                subDesc.textContent = lvlDesc2(n);
                ctxTa.value = ctxDrafts[String(n)] || defaultLevelBody(n);
            }
            ctxResetBtn.addEventListener('click', () => {
                delete ctxDrafts[String(ctxEditCur)];
                ctxTa.value = defaultLevelBody(ctxEditCur);
            });
            function selectCtxSub(n) {
                stashCtxTa();
                ctxEditCur = n;
                paintCtxSub(n);
            }
            for (let n = CTX_MIN; n <= CTX_MAX; n++) {
                const b = el('button', NS + '-subtab', n + ' · ' + lvlName2(n));
                b.type = 'button';
                b.title = lvlDesc2(n);
                ((k) => b.addEventListener('click', () => selectCtxSub(k)))(n);
                subBar.appendChild(b);
                subBtns[n] = b;
            }
            paintCtxSub(ctxEditCur);

            function loadFields(pk) {
                const preset = PROVIDERS[pk] || {};
                const saved = (a.configs && a.configs[pk]) || {};
                keyInput.value = saved.apiKey || '';
                urlInput.value = saved.baseUrl || preset.baseUrl || '';
                const off = !preset.needsKey;
                keyInput.readOnly = off;
                keyInput.classList.toggle(NS + '-input-off', off);
                keyEye.disabled = off;
                keyInput.placeholder = preset.needsKey
                    ? chrome.i18n.getMessage('sqlai_key_ph')
                    : chrome.i18n.getMessage('sqlai_key_ph_none');
                const eff = resolveCfg(pk, a.configs, a.maxRows);
                models = eff.models.slice();
                activeModel = eff.model || '';
                hiddenModels = (((a.configs || {})[pk] || {}).hidden || []).slice();
                provHideChk.checked = !!(((a.configs || {})[pk] || {}).disabled);
                modelInput.value = '';
                renderModels();
                renderHelp(pk);
            }
            renderSelBtn();
            loadFields(currentPk);

            const acts = el('div', NS + '-actions');
            const restoreBtn = el('button', NS + '-restore', chrome.i18n.getMessage('sqlai_restore_defaults'));
            restoreBtn.type = 'button';
            restoreBtn.style.display = 'none';
            restoreBtn.addEventListener('click', () => {
                rowsInput.value = String(TOOL_ROW_CAP);
                itersInput.value = String(AGENT_MAX_ITERS);
                budgetInput.value = '0';
                stepsChk.checked = false;
                tokChk.checked = false;
                maskChk.checked = true;
                writesChk.checked = false;
                paintRoBadge();
                ctxRange2.value = String(CTX_MAX);
                paintCtxSel(CTX_MAX);
            });
            const saveBtn = el('button', NS + '-btn ' + NS + '-primary', chrome.i18n.getMessage('sqlai_save'));
            const cancelBtn = el('button', NS + '-btn', chrome.i18n.getMessage('sqlai_close'));
            acts.appendChild(restoreBtn);
            acts.appendChild(el('div', NS + '-spacer'));
            acts.appendChild(cancelBtn); acts.appendChild(saveBtn);
            card.appendChild(acts);

            overlay.appendChild(card);
            document.body.appendChild(overlay);

            function close() { if (overlay.parentNode) overlay.parentNode.removeChild(overlay); }
            let downOnOverlay = false;
            overlay.addEventListener('mousedown', (e) => { downOnOverlay = (e.target === overlay); });
            overlay.addEventListener('click', (e) => {
                const wasBackdropGesture = downOnOverlay;
                downOnOverlay = false;
                if (e.target === overlay && wasBackdropGesture) close();
            });
            cancelBtn.addEventListener('click', close);
            xBtn.addEventListener('click', close);
            saveBtn.addEventListener('click', () => {
                const pk = currentPk;
                addModel();
                const cfg = {
                    apiKey: keyInput.value.trim(),
                    baseUrl: urlInput.value.trim(),
                    model: activeModel,
                    models: models,
                    hidden: hiddenModels.filter((h) => models.indexOf(h) !== -1),
                    disabled: provHideChk.checked
                };
                if (cfg.model && cfg.hidden.indexOf(cfg.model) !== -1) {
                    const visible = models.filter((x) => cfg.hidden.indexOf(x) === -1);
                    cfg.model = visible[0] || cfg.model;
                }
                stashCtxTa();
                const prefs = {
                    maxRows: Math.min(500, Math.max(1, Number(rowsInput.value) || TOOL_ROW_CAP)),
                    showSteps: stepsChk.checked,
                    showTokens: tokChk.checked,
                    maxIters: clampIters(itersInput.value),
                    ctxLevel: clampCtxLevel(ctxRange2.value),
                    ctxPrompts: ctxDrafts,
                    budget: Math.max(0, Math.floor(Number(budgetInput.value)) || 0),
                    maskPii: maskChk.checked,
                    allowWrites: writesChk.checked,
                    askFirst: askChk.checked
                };
                saveProviderConfig(pk, cfg, prefs).then(() => {
                    a.configs[pk] = cfg; a.active = pk;
                    a.showSteps = prefs.showSteps;
                    a.showTokens = prefs.showTokens;
                    a.maxIters = prefs.maxIters;
                    a.ctxLevel = prefs.ctxLevel;
                    a.ctxPrompts = prefs.ctxPrompts;
                    a.budget = prefs.budget;
                    a.maskPii = prefs.maskPii;
                    a.allowWrites = prefs.allowWrites;
                    a.askFirst = prefs.askFirst;
                    refreshProviderBar();
                    close();
                });
            });

            if (wantTab) selectTab(wantTab);
            if (wantFocus === 'iters') {
                const field = itersInput.closest('.' + NS + '-preffield');
                requestAnimationFrame(() => {
                    try { (field || itersInput).scrollIntoView({ block: 'center' }); } catch (e) { }
                    itersInput.focus();
                    itersInput.select();
                    if (field) {
                        field.classList.add(NS + '-prefhl');
                        setTimeout(() => field.classList.remove(NS + '-prefhl'), 2600);
                    }
                });
            }
        });
    }

    function mountDock() {
        const content = document.querySelector('.suiteql-runner-content');
        const zone = content && content.querySelector('.nsft-sql-workzone');
        if (!content || !zone) return false;
        if (content.querySelector('#nsft-ai-dock')) { dock = content.querySelector('#nsft-ai-dock'); return true; }

        zone.classList.add('nsft-ai-workarea');

        const resizer = el('div', 'nsft-ai-resizer');
        dockResizer = resizer;
        zone.appendChild(resizer);

        dock = buildDock();
        zone.appendChild(dock);

        attachResizer(zone, resizer, dock);

        if (!_dockOpenPref) {
            dock.classList.add('nsft-ai-noanim');
            dock.classList.add(NS + '-collapsed');
            if (dockResizer) dockResizer.classList.add('nsft-ai-resizer-hidden');
            requestAnimationFrame(() => dock.classList.remove('nsft-ai-noanim'));
        }

        try {
            chrome.storage.local.get([DOCK_WIDTH_KEY], (it) => {
                const w = it && Number(it[DOCK_WIDTH_KEY]);
                if (w && w >= 280 && w <= 640) dock.style.setProperty('--ai-dock-w', w + 'px');
            });
        } catch (e) { }
        return true;
    }

    function attachResizer(workarea, resizer, dockEl) {
        resizer.addEventListener('mousedown', (e) => {
            e.preventDefault();
            const rect = workarea.getBoundingClientRect();
            dockEl.classList.add('nsft-ai-noanim');
            const onMove = (ev) => {
                let w = rect.right - ev.clientX;
                w = Math.max(280, Math.min(640, w));
                dockEl.style.setProperty('--ai-dock-w', w + 'px');
            };
            const onUp = () => {
                document.removeEventListener('mousemove', onMove);
                document.removeEventListener('mouseup', onUp);
                document.body.style.userSelect = '';
                dockEl.classList.remove('nsft-ai-noanim');
                const w = Math.round(dockEl.getBoundingClientRect().width);
                try { chrome.storage.local.set({ [DOCK_WIDTH_KEY]: w }); } catch (e2) { }
            };
            document.addEventListener('mousemove', onMove);
            document.addEventListener('mouseup', onUp);
            document.body.style.userSelect = 'none';
        });
    }

    function toggleDock() {
        if (!dock || !dock.isConnected) { if (!mountDock()) return; }
        const willShow = dock.classList.contains(NS + '-collapsed');
        dock.classList.toggle(NS + '-collapsed', !willShow);
        if (dockResizer) dockResizer.classList.toggle('nsft-ai-resizer-hidden', !willShow);
        _dockOpenPref = willShow;
        try { chrome.storage.local.set({ [DOCK_OPEN_KEY]: willShow }); } catch (e) { }
        if (willShow) {
            const ta = dock.querySelector('.' + NS + '-composer-input');
            if (ta) setTimeout(() => ta.focus(), 30);
        }
    }

    function makeToolbarButton() {
        const b = document.createElement('button');
        b.className = 'nsft-sql-toolbar-button';
        b.id = 'nsft-sql-tool-ai';
        b.type = 'button';
        b.title = chrome.i18n.getMessage('sqlai_toggle_title');
        b.innerHTML =
            '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
            'stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:6px;">' +
            '<path d="M12 3l1.8 4.6L18.5 9.4l-4.7 1.8L12 16l-1.8-4.8L5.5 9.4l4.7-1.8z"></path>' +
            '<path d="M19 14l.7 1.8 1.8.7-1.8.7L19 19l-.7-1.8-1.8-.7 1.8-.7z"></path></svg>IA';
        b.addEventListener('click', () => toggleDock());
        return b;
    }

    function mountToolbarButton() {
        const toolbar = document.querySelector('.nsft-sql-toolbar');
        if (!toolbar) return false;
        if (toolbar.querySelector('#nsft-sql-tool-ai')) return true;
        const btn = makeToolbarButton();
        const wrapOf = (id) => {
            const b = toolbar.querySelector(id);
            return b ? b.closest('.nsft-sql-favorites-wrap') : null;
        };
        const favWrap = wrapOf('#nsft-sql-tool-favorites');
        const snipWrap = wrapOf('#nsft-sql-tool-snippets');
        const joinWrap = wrapOf('#nsft-sql-tool-join');
        const anchor = (favWrap && toolbar.contains(favWrap)) ? favWrap
            : (snipWrap && toolbar.contains(snipWrap)) ? snipWrap
            : (joinWrap && toolbar.contains(joinWrap)) ? joinWrap
            : toolbar.querySelector('#nsft-sql-tool-format');
        if (anchor && toolbar.contains(anchor)) anchor.insertAdjacentElement('afterend', btn);
        else toolbar.appendChild(btn);
        announceAiAvailability();
        return true;
    }

    function tick() {
        if (!aiInSuiteql()) return;
        mountToolbarButton();
        mountDock();
    }

    let _tickTimer = null;
    let _lastTickTs = 0;
    function scheduleTick() {
        const now = Date.now();
        if (now - _lastTickTs > 300) {
            _lastTickTs = now;
            tick();
        }
        if (_tickTimer) return;
        _tickTimer = setTimeout(() => { _tickTimer = null; _lastTickTs = Date.now(); tick(); }, 250);
    }

    let floatWrap = null;

    function syncFloatWrapTheme(theme) {
        if (!floatWrap) return;
        floatWrap.setAttribute('data-nsft-sql-theme', theme === 'dark' ? 'dark' : 'light');
    }
    chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== 'local' || !changes.nsftTheme) return;
        syncFloatWrapTheme(changes.nsftTheme.newValue);
    });

    function mountFloating() {
        if (floatWrap && floatWrap.isConnected) {
            return floatWrap.querySelector('.' + NS + '-dock');
        }
        document.querySelectorAll('.' + NS + '-floatwrap').forEach((n) => n.remove());

        floatWrap = el('div', NS + '-floatwrap');
        const initialTheme = document.documentElement.getAttribute('data-nsft-theme')
            || document.body.getAttribute('data-nsft-sql-theme')
            || 'light';
        floatWrap.setAttribute('data-nsft-sql-theme', initialTheme === 'dark' ? 'dark' : 'light');
        const fhead = el('div', NS + '-floathead');
        const ftitle = document.createElement('span');
        ftitle.textContent = chrome.i18n.getMessage('sqlai_float_title') || 'Asistente de IA';

        const fclose = document.createElement('button');
        fclose.type = 'button';
        fclose.className = NS + '-floatbtn ' + NS + '-floatclose';
        fclose.textContent = '✕';
        fclose.addEventListener('click', () => closeFloating());

        fhead.appendChild(ftitle);
        fhead.appendChild(fclose);
        floatWrap.appendChild(fhead);
        const d = buildDock('page');
        d.classList.add(NS + '-dock-floating');
        floatWrap.appendChild(d);
        document.body.appendChild(floatWrap);
        dockFloating();
        return d;
    }

    const FLOAT_W = 420;

    let _floatDocked = false;
    let _floatBodyContain = null, _floatBodyWidth = null, _floatBodyMaxWidth = null, _floatBodyOverflow = null;

    function dockFloating() {
        if (!floatWrap) return;
        const body = document.body;
        if (_floatBodyContain === null) {
            _floatBodyContain = body.style.contain;
            _floatBodyWidth = body.style.width;
            _floatBodyMaxWidth = body.style.maxWidth;
            _floatBodyOverflow = body.style.overflow;
        }
        document.documentElement.appendChild(floatWrap);
        body.style.contain = 'paint';
        body.style.width = 'calc(100vw - ' + FLOAT_W + 'px)';
        body.style.maxWidth = 'calc(100vw - ' + FLOAT_W + 'px)';
        body.style.overflow = 'hidden auto';
        floatWrap.classList.add(NS + '-floatwrap-docked');
        _floatDocked = true;
    }

    function undockFloating() {
        const body = document.body;
        if (_floatBodyContain !== null) {
            body.style.contain = _floatBodyContain;
            body.style.width = _floatBodyWidth;
            body.style.maxWidth = _floatBodyMaxWidth;
            body.style.overflow = _floatBodyOverflow;
            _floatBodyContain = _floatBodyWidth = _floatBodyMaxWidth = _floatBodyOverflow = null;
        }
        if (floatWrap) {
            floatWrap.classList.remove(NS + '-floatwrap-docked');
            document.body.appendChild(floatWrap);
        }
        _floatDocked = false;
    }

    function closeFloating() {
        if (_floatDocked) undockFloating();
        if (floatWrap) { floatWrap.remove(); floatWrap = null; }
    }

    let _aiMaster = true;
    let _aiPage = true;
    let _aiSuiteql = true;


    function aiInSuiteql() { return _aiMaster && _aiSuiteql; }
    function aiOnPage() { return _aiMaster && _aiPage; }

    function unmountSuiteqlAi() {
        const btn = document.getElementById('nsft-sql-tool-ai');
        const btnWrap = btn && btn.closest('.nsft-sql-tool-wrap');
        (btnWrap || btn)?.remove();
        if (dock) { dock.remove(); dock = null; }
        if (dockResizer) { dockResizer.remove(); dockResizer = null; }
        const zone = document.querySelector('.nsft-sql-workzone');
        if (zone) zone.classList.remove('nsft-ai-workarea');
        announceAiAvailability();
    }

    function announceAiAvailability() {
        try {
            window.dispatchEvent(new CustomEvent('nsft-ai-availability', {
                detail: { available: aiInSuiteql() && !!document.getElementById('nsft-sql-tool-ai') }
            }));
        } catch (e) { }
    }

    try {
        chrome.storage.local.get(
            { enableAiAssistant: true, aiAssistantPage: true, aiAssistantSuiteql: true },
            (it) => {
                _aiMaster = it.enableAiAssistant !== false;
                _aiPage = it.aiAssistantPage !== false;
                _aiSuiteql = it.aiAssistantSuiteql !== false;
                if (aiInSuiteql()) tick(); else unmountSuiteqlAi();
            }
        );
        chrome.storage.onChanged.addListener((ch, area) => {
            if (area !== 'local') return;
            if (!ch.enableAiAssistant && !ch.aiAssistantPage && !ch.aiAssistantSuiteql) return;
            if (ch.enableAiAssistant) _aiMaster = ch.enableAiAssistant.newValue !== false;
            if (ch.aiAssistantPage) _aiPage = ch.aiAssistantPage.newValue !== false;
            if (ch.aiAssistantSuiteql) _aiSuiteql = ch.aiAssistantSuiteql.newValue !== false;
            if (aiInSuiteql()) tick();
            else unmountSuiteqlAi();
            if (!aiOnPage()) closeFloating();
        });
    } catch (e) { }

    function consumeAskRecord() {
        if (floatWrap && floatWrap.isConnected) {
            closeFloating();
            return;
        }
        const dockEl = mountFloating();
        if (!dockEl) return;
        const ta2 = dockEl.querySelector('.' + NS + '-composer-input');
        if (ta2) setTimeout(() => ta2.focus(), 80);
    }
    window.addEventListener('nsft-ai-fix-sql', (ev) => {
        const reply = (payload) => window.dispatchEvent(
            new CustomEvent('nsft-ai-fix-sql-result', { detail: payload }));

        if (!aiInSuiteql()) {
            reply({ ok: false, error: chrome.i18n.getMessage('sql_ai_fix_unavailable') || '' });
            return;
        }
        const prompt = ev && ev.detail && ev.detail.prompt;
        if (!prompt) return;

        const cb = {
            status: () => {},
            query: () => {},
            queryResult: () => {},
            aborted: () => false,
            done: (text) => reply({ ok: true, text: text || '', sql: extractSql(text) }),
            error: (msg) => reply({ ok: false, error: msg || '' })
        };
        runAgent(prompt, cb, [], {}, '').catch((e) => reply({
            ok: false, error: (e && e.message) || String(e)
        }));
    });

    window.addEventListener('nsft-ai-ask-record', () => {
        if (!aiOnPage()) return;
        consumeAskRecord();
        if (window.NSFT_ShortcutCoach) window.NSFT_ShortcutCoach.hint('ai_assistant_page');
    });

    if (window.NSFT_Shortcuts && window.NSFT_Shortcuts.bind) {
        window.NSFT_Shortcuts.bind('ai_assistant_page', {
            label: chrome.i18n.getMessage('enableAiAssistantLabel') || 'AI Assistant',
            defaultCombo: { ctrlKey: false, shiftKey: true, altKey: true, code: 'KeyA' },
            storageKey: 'aiAssistantShortcut',
            event: 'nsft-ai-ask-record',
            group: chrome.i18n.getMessage('cheatsheet_group_global') || 'Global',
            order: 48,
            isEnabled: aiOnPage
        });
    }

    function init() {
        tick();
        try {
            const obs = new MutationObserver(scheduleTick);
            obs.observe(document.body || document.documentElement, { childList: true, subtree: true });
        } catch (e) { }
    }
    init();
})();
