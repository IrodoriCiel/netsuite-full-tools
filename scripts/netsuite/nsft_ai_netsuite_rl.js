/**
 * NSFT - NetSuite AI: RESTlet bridge between the NetSuite Full Tools browser
 * extension and N/llm, NetSuite's generative AI module.
 *
 * WHY IT EXISTS
 *   The extension's AI Assistant can answer with the AI of your own NetSuite
 *   account instead of a third-party provider. N/llm only runs server-side, so
 *   the browser cannot call it directly: this RESTlet receives the
 *   conversation, calls `llm.generateText` and returns the answer. The
 *   extension installs it only when the user confirms, and calls it with the
 *   user's own browser session (no tokens, no integration records).
 *
 * WHAT IT DOES: one POST entry point, two closed operations:
 *   POST { op: 'info' }
 *     -> { version, models, freeUsage }
 *       The model families the account offers (`llm.ModelFamily`) and the free
 *       AI quota left (`llm.getRemainingFreeUsage`).
 *   POST { op: 'chat', options: { prompt, preamble, modelFamily,
 *                                 modelParameters, chatHistory, tools,
 *                                 toolResults, timeout } }
 *     -> { text, model, toolCalls, usage }
 *       One call to `llm.generateText` with those options, and its answer.
 *   Every response also carries { ok, ms, units, version }, and on failure
 *   { ok: false, error: { name, message } } instead of throwing.
 *
 * WHAT IT DOES NOT DO
 *   - It runs no code it receives: every option is copied field by field,
 *     converted to the expected type and capped in length.
 *   - It does not read, create, change or delete records, and it runs no
 *     searches or queries. When the model asks for a tool (for example, run a
 *     SuiteQL query), the request goes back to the browser, which runs it with
 *     the user's own permissions and sends the result in the next call.
 *   - It stores nothing: no logs of the conversation, no files, no records.
 *
 * FUNCTIONS
 *   post(body)    Entry point. Dispatches `op`, measures time and governance
 *                 units, and wraps any error as { ok: false, error }.
 *   info()        Available model families and remaining free quota.
 *   chat(o)       Builds the `llm.generateText` options from the request and
 *                 returns text, model, tool calls and token usage.
 *   history(h)    Rebuilds the chat history as plain { role, text, toolCalls,
 *                 toolResults } objects.
 *   toolCall(c)   Normalises one tool call; every parameter becomes text.
 *   toolResult(r) Normalises the result of one tool call.
 *   role(r)       Maps 'user' / 'chatbot' / 'tool' to `llm.ChatRole`.
 *   paramType(t)  Maps a tool parameter type to `llm.ToolParameterType`.
 *
 * LIMITS: text fields up to 400,000 characters, lists up to 300 items, tool
 * calls up to 50 parameters, timeout up to 240 s (120 s by default).
 *
 * MAINTAINERS: if this file's behaviour changes, increase `VERSION` (and only
 * that). The extension reads the number from this very line; any account whose
 * bridge has a lower one is offered "Update the bridge", which replaces this
 * file in SuiteScripts. Keep the line exactly as `const VERSION = N;`.
 *
 * Source: https://github.com/IrodoriCiel/netsuite-full-tools
 *         (scripts/netsuite/nsft_ai_netsuite_rl.js)
 *
 * @NApiVersion 2.1
 * @NScriptType Restlet
 * @NModuleScope SameAccount
 */
define(['N/llm', 'N/runtime'], (llm, runtime) => {
    'use strict';

    /** Bridge version. The extension compares it with its own copy. */
    const VERSION = 1;
    /** Caps on what a request can carry: characters per text, items per list. */
    const MAX_TEXT = 400000;
    const MAX_ITEMS = 300;
    const PARAMS = ['maxTokens', 'temperature', 'topK', 'topP', 'frequencyPenalty', 'presencePenalty'];
    const ROLES = { USER: 'USER', CHATBOT: 'CHATBOT', TOOL: 'TOOL' };

    /** Any value as text, cut to `max` characters (MAX_TEXT by default). */
    const str = (v, max) => String(v == null ? '' : v).slice(0, max || MAX_TEXT);
    /** An array cut to MAX_ITEMS; anything else becomes an empty array. */
    const list = (v) => (Array.isArray(v) ? v.slice(0, MAX_ITEMS) : []);

    /**
     * What this account can use: model families and remaining free AI quota.
     * @returns {{version: number, models: Object, freeUsage: (number|null)}}
     */
    function info() {
        const out = { version: VERSION, models: {} };
        try { if (llm.ModelFamily) out.models = llm.ModelFamily; } catch (e) { /* not enumerable in this account */ }
        try { out.freeUsage = llm.getRemainingFreeUsage(); } catch (e) { out.freeUsage = null; }
        return out;
    }

    /**
     * Maps a role name from the extension to `llm.ChatRole`; unknown -> USER.
     * @param {string} r 'user' | 'chatbot' | 'tool'
     */
    function role(r) {
        const k = String(r || '').toUpperCase();
        const nativos = llm.ChatRole || {};
        return nativos[k] || ROLES[k] || ROLES.USER;
    }

    /**
     * Maps a tool parameter type name to `llm.ToolParameterType`.
     * @param {string} t For example 'STRING'.
     */
    function paramType(t) {
        const k = String(t || 'STRING').toUpperCase();
        const nativos = llm.ToolParameterType || {};
        return nativos[k] || k;
    }

    /**
     * One tool call as the model returned it: id, tool name and parameters,
     * all as text.
     * @param {Object} c
     * @returns {{id: string, name: string, parameters: Object<string,string>}}
     */
    function toolCall(c) {
        const p = (c && typeof c.parameters === 'object' && c.parameters) ? c.parameters : {};
        const parameters = {};
        /* Every parameter is declared as text (Gemini fails with OBJECT and
           ARRAY); if a model still returns an object, it travels as JSON. */
        Object.keys(p).slice(0, 50).forEach((k) => {
            const v = p[k];
            parameters[str(k, 100)] = (v != null && typeof v === 'object') ? str(JSON.stringify(v)) : str(v);
        });
        return { id: str(c && c.id, 200), name: str(c && c.name, 100), parameters: parameters };
    }

    /**
     * The result of one tool call, run by the extension in the browser.
     * @param {Object} r { call, outputs: [{ result }] }
     */
    function toolResult(r) {
        return {
            call: toolCall(r && r.call),
            outputs: list(r && r.outputs).map((o) => ({ result: str(o && o.result) }))
        };
    }

    /* History travels as plain objects { role, text, toolCalls, toolResults }.
       Measured in a sandbox: rebuilding it with `createChatMessage` breaks the
       tool turn, which comes with empty text. */
    /**
     * The conversation so far, as plain message objects for `chatHistory`.
     * @param {Array} h [{ role, text, toolCalls?, toolResults? }]
     */
    function history(h) {
        return list(h).map((m) => {
            const out = { role: role(m && m.role), text: str(m && m.text) };
            const tc = list(m && m.toolCalls);
            const tr = list(m && m.toolResults);
            if (tc.length) out.toolCalls = tc.map(toolCall);
            if (tr.length) out.toolResults = tr.map(toolResult);
            return out;
        });
    }

    /**
     * One answer from N/llm: builds the `llm.generateText` options from the
     * request (prompt, preamble, model, parameters, history, tools, tool
     * results, timeout) and returns the model's text, the tools it asks to run
     * and the tokens used.
     * @param {Object} o Request options.
     * @returns {{text: string, model: string, toolCalls: Array, usage: Object}}
     */
    function chat(o) {
        o = o || {};
        const opts = { prompt: str(o.prompt) };
        if (o.preamble) opts.preamble = str(o.preamble);
        if (o.modelFamily) opts.modelFamily = str(o.modelFamily, 100);
        if (o.modelParameters && typeof o.modelParameters === 'object') {
            const mp = {};
            PARAMS.forEach((k) => {
                const n = Number(o.modelParameters[k]);
                if (o.modelParameters[k] != null && isFinite(n)) mp[k] = n;
            });
            opts.modelParameters = mp;
        }
        const hist = history(o.chatHistory);
        if (hist.length) opts.chatHistory = hist;
        const tools = list(o.tools);
        if (tools.length) {
            opts.tools = tools.map((t) => llm.createTool({
                name: str(t && t.name, 100),
                description: str(t && t.description, 8000),
                parameters: list(t && t.parameters).map((p) => llm.createToolParameter({
                    name: str(p && p.name, 100),
                    description: str(p && p.description, 4000),
                    type: paramType(p && p.type)
                }))
            }));
        }
        const results = list(o.toolResults);
        if (results.length) {
            opts.toolResults = results.map((r) => {
                const tr = toolResult(r);
                return llm.createToolResult({ call: tr.call, outputs: tr.outputs });
            });
        }
        const n = Number(o.timeout);
        opts.timeout = (isFinite(n) && n > 0) ? Math.min(n, 240000) : 120000;

        const r = llm.generateText(opts);
        const u = r.usage || {};
        return {
            text: str(r.text),
            model: str(r.model, 100),
            toolCalls: list(r.toolCalls).map(toolCall),
            usage: {
                promptTokens: Number(u.promptTokens) || 0,
                completionTokens: Number(u.completionTokens || u.complationTokens) || 0,
                totalTokens: Number(u.totalTokens) || 0
            }
        };
    }

    /**
     * RESTlet entry point (POST). Runs `info` or `chat` and adds the time
     * and governance units used. Never throws: errors come back as
     * { ok: false, error: { name, message } }.
     * @param {{op: string, options?: Object}} body
     */
    function post(body) {
        const script = runtime.getCurrentScript();
        const u0 = script.getRemainingUsage();
        const t0 = Date.now();
        let out;
        try {
            if (!body || typeof body !== 'object') throw { name: 'NSFT_BAD_BODY', message: 'Body must be JSON.' };
            if (body.op === 'info') out = { ok: true, data: info() };
            else if (body.op === 'chat') out = { ok: true, data: chat(body.options) };
            else throw { name: 'NSFT_BAD_OP', message: 'Unknown op.' };
        } catch (e) {
            out = { ok: false, error: { name: str(e && e.name, 200) || 'ERROR', message: str(e && e.message, 4000) } };
        }
        out.ms = Date.now() - t0;
        out.units = u0 - script.getRemainingUsage();
        out.version = VERSION;
        return out;
    }

    return { post };
});
