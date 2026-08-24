(function () {
    'use strict';

    if (window.__nsftScriptAutoNameFetcher) return;
    window.__nsftScriptAutoNameFetcher = true;

    window.addEventListener('message', function (event) {
        if (event.source !== window) return;
        const data = event.data;
        if (!data || data.dest !== 'fetcher_san') return;
        if (data.type === 'check_unique') checkUnique(data.payload);
    });

    function checkUnique(payload) {
        const scriptid = (payload && payload.scriptid) || '';
        if (!scriptid) { sendResult(scriptid, false); return; }
        const T = window.NSFT_SQL;
        if (!T) { sendResult(scriptid, null, 'SuiteQL transport unavailable'); return; }
        const variants = buildVariants(scriptid);
        if (variants.length === 0) { sendResult(scriptid, false); return; }
        const head = 'SELECT id, scriptid FROM script WHERE LOWER(scriptid) IN (';
        T.run({
            rest: head + variants.map((v) => T.lit(v)).join(',') + ')',
            sql: head + variants.map(() => '?').join(',') + ')',
            params: variants,
            limit: 20
        }, function (err, rows) {
            if (err) { sendResult(scriptid, null, err.message || err.code || 'query'); return; }
            sendResult(scriptid, !!(rows && rows.length), null, rows || []);
        });
    }

    function buildVariants(id) {
        const base = String(id || '').toLowerCase().trim();
        if (!base) return [];
        const stripped = base.startsWith('_') ? base.slice(1) : base;
        const variants = new Set();

        variants.add(base);
        variants.add(stripped);

        variants.add('customscript' + base);
        variants.add('customscript_' + stripped);
        variants.add('customrecord' + base);
        variants.add('customrecord_' + stripped);
        variants.add('customlist' + base);
        variants.add('customlist_' + stripped);

        return Array.from(variants);
    }

    function sendResult(scriptid, exists, error, rows) {
        window.postMessage({
            dest: 'extension_san',
            type: 'unique_result',
            payload: {
                scriptid: scriptid,
                exists: exists,
                error: error || null,
                matched: rows && rows.length ? rows.map((r) => r.scriptid || r.SCRIPTID).filter(Boolean) : []
            }
        }, '*');
    }
})();
