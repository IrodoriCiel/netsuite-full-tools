(function () {
    'use strict';

    window.addEventListener('message', function (event) {
        const d = event.data;
        if (!d || d.dest !== 'fetcher_rtrail' || d.type !== 'get_trail') return;
        getTrail(d.payload || {});
    });

    function getTrail(payload) {
        const reqId = payload.reqId;
        const id = String(payload.id || '');
        if (!/^\d+$/.test(id)) {
            send(reqId, null, 'Invalid transaction id');
            return;
        }
        try {
            if (typeof require === 'undefined') {
                send(reqId, null, "'require' is not defined. Ensure you are on a NetSuite page.");
                return;
            }
            require(['N/query'], function (query) {
                try {
                    const run = (sql) => query.runSuiteQL({ query: sql }).asMappedResults();

                    const currentRows = run(
                        'SELECT id, type, BUILTIN.DF(type) AS typename, tranid, trandate, BUILTIN.DF(status) AS status ' +
                        'FROM transaction WHERE id = ' + id
                    );
                    const current = currentRows[0] ? node(currentRows[0]) : null;

                    const sources = groupLinks(run(
                        'SELECT pl.previousdoc AS id, pl.linktype, t.type, BUILTIN.DF(t.type) AS typename, t.tranid, t.trandate, BUILTIN.DF(t.status) AS status ' +
                        'FROM PreviousTransactionLink pl JOIN transaction t ON t.id = pl.previousdoc ' +
                        'WHERE pl.nextdoc = ' + id
                    ));
                    const targets = groupLinks(run(
                        'SELECT nl.nextdoc AS id, nl.linktype, t.type, BUILTIN.DF(t.type) AS typename, t.tranid, t.trandate, BUILTIN.DF(t.status) AS status ' +
                        'FROM NextTransactionLink nl JOIN transaction t ON t.id = nl.nextdoc ' +
                        'WHERE nl.previousdoc = ' + id
                    ));

                    send(reqId, { current: current, sources: sources, targets: targets }, null);
                } catch (e) {
                    send(reqId, null, e.name + ': ' + e.message);
                }
            });
        } catch (e) {
            send(reqId, null, e.name + ': ' + e.message);
        }
    }

    function node(r) {
        return {
            id: r.id,
            type: r.type || '',
            typename: r.typename || '',
            tranid: r.tranid || '',
            trandate: r.trandate || '',
            status: r.status || ''
        };
    }

    function groupLinks(rows) {
        const byId = {};
        const order = [];
        rows.forEach(function (r) {
            const key = String(r.id);
            if (!byId[key]) {
                byId[key] = node(r);
                byId[key].linktypeSet = {};
                order.push(key);
            }
            if (r.linktype) byId[key].linktypeSet[r.linktype] = true;
        });
        return order.map(function (key) {
            const n = byId[key];
            n.linktypes = Object.keys(n.linktypeSet).join(', ');
            delete n.linktypeSet;
            return n;
        });
    }

    function send(reqId, payload, error) {
        window.postMessage({
            dest: 'extension_rtrail',
            type: 'trail',
            reqId: reqId,
            payload: payload,
            error: error || null
        }, '*');
    }
})();
