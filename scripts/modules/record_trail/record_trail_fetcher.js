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
        const T = window.NSFT_SQL;
        if (!T) { send(reqId, null, 'SuiteQL transport unavailable'); return; }

        const run = (sql, limit) => new Promise((resolve, reject) => {
            T.run({ rest: sql, sql: sql, limit: limit || 1000 }, (err, rows) => {
                if (err) reject(new Error(err.message || err.code || 'query'));
                else resolve(rows || []);
            });
        });

        Promise.all([
            run(
                'SELECT id, type, BUILTIN.DF(type) AS typename, tranid, trandate, BUILTIN.DF(status) AS status ' +
                'FROM transaction WHERE id = ' + id, 1
            ),
            run(
                'SELECT pl.previousdoc AS id, pl.linktype, BUILTIN.DF(pl.linktype) AS linkname, ' +
                't.type, BUILTIN.DF(t.type) AS typename, t.tranid, t.trandate, ' +
                'BUILTIN.DF(t.status) AS status, t.foreigntotal AS amount ' +
                'FROM PreviousTransactionLink pl JOIN transaction t ON t.id = pl.previousdoc ' +
                'WHERE pl.nextdoc = ' + id + ' ORDER BY t.trandate, t.type'
            ),
            run(
                'SELECT nl.nextdoc AS id, nl.linktype, BUILTIN.DF(nl.linktype) AS linkname, ' +
                't.type, BUILTIN.DF(t.type) AS typename, t.tranid, t.trandate, ' +
                'BUILTIN.DF(t.status) AS status, t.foreigntotal AS amount ' +
                'FROM NextTransactionLink nl JOIN transaction t ON t.id = nl.nextdoc ' +
                'WHERE nl.previousdoc = ' + id + ' ORDER BY t.type, t.trandate DESC'
            )
        ]).then((res) => {
            send(reqId, {
                current: res[0][0] ? node(res[0][0]) : null,
                sources: groupLinks(res[1]),
                targets: groupLinks(res[2])
            }, null);
        }).catch((e) => {
            send(reqId, null, (e && e.message) ? e.message : String(e));
        });
    }

    function node(r) {
        return {
            id: r.id,
            type: r.type || '',
            typename: r.typename || '',
            tranid: r.tranid || '',
            trandate: r.trandate || '',
            status: r.status || '',
            amount: (r.amount === null || r.amount === undefined) ? null : r.amount
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
            const rel = limpiaRel(r.linkname) || r.linktype;
            if (rel) byId[key].linktypeSet[rel] = true;
            if (byId[key].amount === null && r.amount !== null && r.amount !== undefined) {
                byId[key].amount = r.amount;
            }
        });
        return order.map(function (key) {
            const n = byId[key];
            n.linktypes = Object.keys(n.linktypeSet).join(', ');
            delete n.linktypeSet;
            return n;
        });
    }

    function limpiaRel(s) {
        const t = String(s || '').replace(/\{#[^?}]*\?([^#}]*)#\}/g, '$1').trim();
        return t.indexOf('{#') >= 0 ? '' : t;
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
