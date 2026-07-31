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
        if (typeof require === 'undefined') { sendResult(scriptid, null, 'require undefined'); return; }
        require(['N/query'], function (query) {
            try {
                const variants = buildVariants(scriptid);
                if (variants.length === 0) { sendResult(scriptid, false); return; }
                const placeholders = variants.map(() => '?').join(',');
                const rs = query.runSuiteQL({
                    query: 'SELECT id, scriptid FROM script WHERE LOWER(scriptid) IN (' + placeholders + ')',
                    params: variants
                });
                const rows = rs && rs.asMappedResults ? rs.asMappedResults() : [];
                sendResult(scriptid, rows && rows.length > 0, null, rows);
            } catch (e) {
                sendResult(scriptid, null, String(e && e.message || e));
            }
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
