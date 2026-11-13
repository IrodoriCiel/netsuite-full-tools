(function () {
    'use strict';

    window.addEventListener('message', function (event) {
        const d = event.data;
        if (!d || d.dest !== 'fetcher_rtrail') return;
        if (d.type === 'get_trail') getTrail(d.payload || {});
        else if (d.type === 'get_checks') getChecks(d.payload || {});
    });

    function getChecks(payload) {
        const reqId = payload.reqId;
        const id = String(payload.id || '');
        const T = window.NSFT_SQL;
        const reply = (data, error) => window.postMessage({ dest: 'extension_rtrail', type: 'checks', reqId: reqId, payload: data, error: error || null }, '*');
        if (!/^\d+$/.test(id)) { reply(null, 'Invalid transaction id'); return; }
        if (!T) { reply(null, 'SuiteQL transport unavailable'); return; }
        const lit = T.lit || ((v) => "'" + String(v).replace(/'/g, "''") + "'");
        const run = (sql) => new Promise((resolve, reject) => {
            T.run({ rest: sql, sql: sql, limit: 50 }, (err, rows) => err ? reject(new Error(err.message || err.code || 'query')) : resolve(rows || []));
        });

        run('SELECT id, type, entity, tranid, TO_CHAR(trandate, \'YYYY-MM-DD\') AS d, foreigntotal AS total, '
            + 'foreignamountunpaid AS unpaid, foreignpaymentamountunused AS unused, paymenthold, '
            + 'TO_CHAR(duedate, \'YYYY-MM-DD\') AS due, TRUNC(SYSDATE) - TRUNC(duedate) AS dias '
            + 'FROM transaction WHERE id = ' + id).then((rows) => {
            const h = rows[0];
            if (!h) { reply({ checks: [] }); return; }
            const type = String(h.type || '');
            const entity = /^\d+$/.test(String(h.entity || '')) ? String(h.entity) : '';
            const total = Math.abs(num(h.total) || 0);
            const unpaid = num(h.unpaid) || 0;
            const tareas = [];
            const add = (p) => tareas.push(p.catch(() => null));

            if (entity && ['VendBill', 'CustInvc', 'SalesOrd'].indexOf(type) !== -1 && (total || h.tranid)) {
                const conRef = type === 'VendBill' && h.tranid;
                const conImp = total && /^\d{4}-\d{2}-\d{2}$/.test(String(h.d || ''));
                if (conRef || conImp) {
                    const lo = Math.round(total * 0.995 * 100) / 100;
                    const hi = Math.round(total * 1.005 * 100) / 100;
                    const cond = [];
                    if (conImp) cond.push('(ABS(foreigntotal) BETWEEN ' + lo + ' AND ' + hi + ' AND ABS(trandate - TO_DATE(' + lit(h.d) + ', \'YYYY-MM-DD\')) <= 30)');
                    if (conRef) cond.push('tranid = ' + lit(h.tranid));
                    add(run('SELECT * FROM (SELECT id, tranid, TO_CHAR(trandate, \'YYYY-MM-DD\') AS d, trandate, ABS(foreigntotal) AS amt, BUILTIN.DF(status) AS status '
                        + 'FROM transaction WHERE entity = ' + entity + ' AND type = ' + lit(type) + ' AND id <> ' + id
                        + ' AND (' + cond.join(' OR ') + ') ORDER BY trandate DESC, id DESC) WHERE ROWNUM <= 5').then((r) => (
                        r.length ? { id: 'dup', sev: type === 'SalesOrd' ? 'note' : 'attention', doc: r[0], more: r.length - 1, ref: !!(conRef && r[0].tranid === h.tranid) } : { id: 'dup', sev: 'pass' })));
                }
            }

            if (type === 'VendBill') {
                add(run('SELECT DISTINCT L.previousdoc AS po FROM PreviousTransactionLineLink L WHERE L.nextdoc = ' + id + ' AND L.previoustype = \'PurchOrd\'').then((pos) => {
                    const ids = pos.map((p) => Number(p.po)).filter(Boolean);
                    if (!ids.length) return null;
                    return run('SELECT id, tranid, foreigntotal AS total FROM transaction WHERE id IN (' + ids.join(', ') + ')').then((det) => {
                        if (det.length < ids.length) return null;
                        const poTotal = det.reduce((s, r) => s + Math.abs(num(r.total) || 0), 0);
                        if (!poTotal || !total) return null;
                        const diff = total - poTotal;
                        if (diff > Math.max(poTotal * 0.02, 100)) {
                            return { id: 'over_po', sev: 'attention', po: det.length === 1 ? det[0] : null, poTotal: poTotal, diff: diff, pct: Math.round(diff / poTotal * 1000) / 10 };
                        }
                        return { id: 'over_po', sev: 'pass' };
                    });
                }));
            }

            if ((type === 'VendBill' || type === 'CustInvc') && h.due && unpaid) {
                const dias = num(h.dias);
                tareas.push(Promise.resolve(dias > 0 ? { id: 'past_due', sev: 'attention', days: dias, due: h.due, unpaid: unpaid } : { id: 'past_due', sev: 'pass' }));
            }

            if (type === 'VendBill') {
                tareas.push(Promise.resolve(String(h.paymenthold).toUpperCase() === 'T' ? { id: 'pay_hold', sev: 'attention' } : { id: 'pay_hold', sev: 'pass' }));
            }

            if (entity && (type === 'CustInvc' || type === 'SalesOrd')) {
                add(run('SELECT creditlimit FROM customer WHERE id = ' + entity).then((c) => {
                    const limit = num(c[0] && c[0].creditlimit);
                    if (!limit) return null;
                    return run('SELECT SUM(foreignamountunpaid) AS bal FROM transaction WHERE entity = ' + entity + ' AND type = \'CustInvc\' AND foreignamountunpaid <> 0').then((b) => {
                        const bal = Math.max(0, num(b[0] && b[0].bal) || 0);
                        const usado = type === 'SalesOrd' ? bal + total : bal;
                        const pct = Math.round(usado / limit * 100);
                        if (usado > limit) return { id: 'credit_limit', sev: 'attention', limit: limit, used: usado, over: usado - limit, order: type === 'SalesOrd' };
                        if (type === 'CustInvc' && pct >= 80) return { id: 'credit_limit', sev: 'note', limit: limit, used: usado, pct: pct };
                        return { id: 'credit_limit', sev: 'pass' };
                    });
                }));
            }

            if (entity && type === 'CustInvc' && unpaid > 0) {
                add(run('SELECT * FROM (SELECT id, type, tranid, ABS(CASE WHEN type = \'CustCred\' THEN foreignamountunpaid ELSE foreignpaymentamountunused END) AS amt '
                    + 'FROM transaction WHERE entity = ' + entity + ' AND ((type = \'CustCred\' AND foreignamountunpaid <> 0) '
                    + 'OR (type IN (\'CustPymt\', \'CustDep\') AND foreignpaymentamountunused > 0)) ORDER BY trandate DESC, id DESC) WHERE ROWNUM <= 5').then((r) => (
                    r.length ? { id: 'credit_unapplied', sev: 'note', docs: r, sum: r.reduce((s, x) => s + (num(x.amt) || 0), 0) } : { id: 'credit_unapplied', sev: 'pass' })));
            }

            if ((type === 'CustPymt' || type === 'VendPymt') && h.unused !== null && h.unused !== undefined) {
                const libre = num(h.unused) || 0;
                tareas.push(Promise.resolve(libre > 0 ? { id: 'payment_unapplied', sev: 'attention', amount: libre } : { id: 'payment_unapplied', sev: 'pass' }));
            }

            return Promise.all(tareas).then((res) => reply({ checks: res.filter(Boolean) }));
        }).catch((e) => reply(null, (e && e.message) || String(e)));
    }

    const ROUNDS = 5;
    const MAX_DOCS = 40;

    const STAGE = {
        Estimate: 0, Opprtnty: 0, SalesOrd: 1, PurchOrd: 1, PurchReq: 0.5, RtnAuth: 1, VendAuth: 1, TrnfrOrd: 1, WorkOrd: 1,
        CustDep: 1.5, ItemShip: 2, ItemRcpt: 2, VendBill: 3, CustInvc: 3, CashSale: 3, CashRfnd: 6,
        VendCred: 4, CustCred: 4, VendPymt: 5, CustPymt: 5, Check: 5, DepAppl: 5, CustRfnd: 6
    };
    const stageOf = (t) => (Object.prototype.hasOwnProperty.call(STAGE, t) ? STAGE[t] : 3.5);

    function getTrail(payload) {
        const reqId = payload.reqId;
        const id = String(payload.id || '');
        if (!/^\d+$/.test(id)) {
            send(reqId, null, 'Invalid transaction id');
            return;
        }
        const idNum = Number(id);
        const T = window.NSFT_SQL;
        if (!T) { send(reqId, null, 'SuiteQL transport unavailable'); return; }

        const run = (sql, limit) => new Promise((resolve, reject) => {
            T.run({ rest: sql, sql: sql, limit: limit || 1000 }, (err, rows) => {
                if (err) reject(new Error(err.message || err.code || 'query'));
                else resolve(rows || []);
            });
        });

        const ids2sql = (ids) => ids.filter((n) => /^\d+$/.test(String(n))).join(', ');

        function linkSql(table, dir, ids) {
            const lista = ids2sql(ids);
            if (dir === 'up') {
                return 'SELECT L.nextdoc AS via, L.previousdoc AS id, L.previoustype AS type, L.linktype, BUILTIN.DF(L.linktype) AS linkname '
                    + 'FROM ' + table + ' L WHERE L.nextdoc IN (' + lista + ') '
                    + 'GROUP BY L.nextdoc, L.previousdoc, L.previoustype, L.linktype, BUILTIN.DF(L.linktype)';
            }
            return 'SELECT L.previousdoc AS via, L.nextdoc AS id, L.nexttype AS type, L.linktype, BUILTIN.DF(L.linktype) AS linkname '
                + 'FROM ' + table + ' L WHERE L.previousdoc IN (' + lista + ') '
                + 'GROUP BY L.previousdoc, L.nextdoc, L.nexttype, L.linktype, BUILTIN.DF(L.linktype)';
        }

        function links(dir, ids) {
            const usual = dir === 'up' ? 'PreviousTransactionLineLink' : 'NextTransactionLineLink';
            const other = dir === 'up' ? 'NextTransactionLineLink' : 'PreviousTransactionLineLink';
            return Promise.all([
                run(linkSql(usual, dir, ids)),
                run(linkSql(other, dir, ids)).catch(() => [])
            ]).then((two) => {
                const seen = {};
                return two[0].concat(two[1]).filter((r) => {
                    const k = r.via + ':' + r.id + ':' + r.linktype;
                    if (seen[k]) return false;
                    seen[k] = true;
                    return true;
                });
            });
        }

        const nodes = {};
        const order = [];
        let frontier = [];
        let truncated = false;

        function add(r, dir, depth) {
            const n = Number(r.id);
            const via = Number(r.via);
            if (!n || n === idNum) return;
            let nd = nodes[n];
            if (!nd) {
                if (order.length >= MAX_DOCS) { truncated = true; return; }
                nd = nodes[n] = { id: n, type: r.type || '', depth: depth, via: via, direct: via === idNum ? dir : null, rels: {} };
                order.push(n);
                frontier.push(n);
            }
            if (via === idNum && !nd.direct) nd.direct = dir;
            if (via === nd.via || via === idNum) {
                const rel = limpiaRel(r.linkname, r.type) || r.linktype;
                if (rel) nd.rels[rel] = true;
            }
        }

        function ronda(ids, depthOf, n) {
            return Promise.all([links('up', ids), links('down', ids)]).then((two) => {
                two[0].forEach((r) => add(r, 'prev', (depthOf[Number(r.via)] || 0) - 1));
                two[1].forEach((r) => add(r, 'next', (depthOf[Number(r.via)] || 0) + 1));
                if (!frontier.length || n + 1 >= ROUNDS || order.length >= MAX_DOCS) {
                    if (frontier.length && n + 1 >= ROUNDS) truncated = true;
                    return null;
                }
                const lote = frontier.splice(0, MAX_DOCS);
                const prof = {};
                lote.forEach((x) => { prof[x] = nodes[x].depth; });
                return ronda(lote, prof, n + 1);
            });
        }

        const DETALLE = 'SELECT id, type, BUILTIN.DF(type) AS typename, tranid, trandate, '
            + "TO_CHAR(trandate, 'YYYY-MM-DD') AS d, BUILTIN.DF(status) AS status, "
            + 'foreigntotal AS amount, foreignamountunpaid AS unpaid FROM transaction WHERE id IN ';

        ronda([idNum], { [idNum]: 0 }, 0).then(() => {
            const todos = [idNum].concat(order);
            return run(DETALLE + '(' + ids2sql(todos) + ')');
        }).then((rows) => {
            const det = {};
            rows.forEach((r) => { det[Number(r.id)] = r; });
            const cur = det[idNum];
            if (!cur) { send(reqId, null, 'Transaction not found'); return; }
            const current = node(cur);
            current.unpaid = num(cur.unpaid);
            const mine = stageOf(cur.type);

            const sources = [];
            const targets = [];
            order.forEach((k) => {
                const nd = nodes[k];
                const r = det[k];
                const n = r ? node(r) : { id: k, type: nd.type, typename: '', tranid: '', trandate: '', d: '', status: '', amount: null, hidden: true };
                if (!r) n.type = nd.type;
                n.linktypes = Object.keys(nd.rels).join(', ');
                n.indirect = !nd.direct;
                if (n.indirect) {
                    const v = det[nd.via];
                    n.via = nd.via;
                    n.viaTranid = v ? (v.tranid || '#' + v.id) : '#' + nd.via;
                }
                const st = stageOf(nd.type);
                const esOrigen = nd.direct === 'prev'
                    || (!nd.direct && (st < mine || (st === mine && nd.depth < 0)));
                (esOrigen ? sources : targets).push(n);
            });

            sources.sort((a, b) => (stageOf(a.type) - stageOf(b.type)) || String(a.d).localeCompare(String(b.d)));
            targets.sort((a, b) => (a.indirect - b.indirect) || (stageOf(a.type) - stageOf(b.type)) || String(b.d).localeCompare(String(a.d)));

            send(reqId, {
                current: current,
                sources: sources,
                targets: targets,
                gaps: huecos(cur, sources.concat(targets)),
                truncated: truncated,
                hidden: sources.concat(targets).filter((n) => n.hidden).length
            }, null);
        }).catch((e) => {
            send(reqId, null, (e && e.message) ? e.message : String(e));
        });
    }

    function huecos(cur, all) {
        const has = (types) => all.some((n) => types.indexOf(n.type) !== -1);
        const cerrado = /cerrad|closed|cancel|anulad/i.test(String(cur.status || ''));
        const out = [];
        if (cur.type === 'SalesOrd' && !cerrado && !has(['ItemShip'])) out.push({ kind: 'ship' });
        if (cur.type === 'PurchOrd' && !cerrado && !has(['ItemRcpt'])) out.push({ kind: 'receipt' });
        const saldo = num(cur.unpaid);
        if ((cur.type === 'CustInvc' || cur.type === 'VendBill') && saldo && !has(['CustPymt', 'VendPymt', 'CustCred', 'VendCred'])) {
            out.push({ kind: 'payment', amount: saldo });
        }
        return out;
    }

    function num(v) {
        if (v === null || v === undefined || v === '') return null;
        const n = Number(v);
        return isFinite(n) ? n : null;
    }

    function node(r) {
        return {
            id: r.id,
            type: r.type || '',
            typename: r.typename || '',
            tranid: r.tranid || '',
            trandate: r.trandate || '',
            d: r.d || '',
            status: r.status || '',
            amount: (r.amount === null || r.amount === undefined) ? null : r.amount
        };
    }

    const VENTAS = /^(Estimate|Opprtnty|SalesOrd|CustInvc|CashSale|CashRfnd|CustCred|CustPymt|CustDep|CustRfnd|RtnAuth|ItemShip|DepAppl)$/;
    function limpiaRel(s, tipo) {
        const venta = VENTAS.test(String(tipo || ''));
        const t = String(s || '')
            .replace(/([^/{]*)\/\{#[^?}]*\?([^#}]*)#\}/g, (m, compra, vent) => (venta ? vent : compra))
            .replace(/\{#[^?}]*\?([^#}]*)#\}/g, '$1').trim();
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
