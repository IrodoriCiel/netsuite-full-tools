(function () {
    'use strict';

    if (window.NSFT_SQL) return;

    var REST_URL = '/services/rest/query/v1/suiteql';

    var _restOff = false;
    var _announcedOn = false;

    var _ready = false;
    var _pending = [];

    function markReady() {
        if (_ready) return;
        _ready = true;
        var espera = _pending;
        _pending = [];
        espera.forEach(function (fn) { fn(); });
    }

    function lit(v) {
        return "'" + String(v).replace(/'/g, "''") + "'";
    }

    function errMessage(e) {
        return (e && e.message) ? String(e.message) : String(e);
    }

    function announce(payload) {
        window.postMessage({ dest: 'nsft_sql_state', payload: payload }, '*');
    }

    function viaRest(spec, cb) {
        var limit = Math.max(1, Math.min(1000, spec.limit || 15));
        fetch(REST_URL + '?limit=' + limit + '&offset=' + (spec.offset || 0), {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json', 'Prefer': 'transient' },
            body: JSON.stringify({ q: spec.rest })
        }).then(function (r) {
            if (r.ok) {
                if (!_announcedOn) { _announcedOn = true; announce({ on: true }); }
                return r.json().then(function (j) {
                    var items = (j && j.items) || [];
                    cb(null, items.map(function (it) {
                        var row = {};
                        Object.keys(it).forEach(function (k) { if (k !== 'links') row[k] = it[k]; });
                        return row;
                    }), { hasMore: !!(j && j.hasMore), via: 'rest' });
                }, function (e) {
                    cb({ status: 0, message: errMessage(e) }, null);
                });
            }
            _announcedOn = false;
            announce({ on: false, status: r.status });
            if (r.status === 403 || r.status === 404) _restOff = true;
            return r.text().then(function (txt) {
                cb({ status: r.status, message: detailOf(txt) || ('HTTP ' + r.status) }, null);
            }, function () {
                cb({ status: r.status, message: 'HTTP ' + r.status }, null);
            });
        }, function (e) {
            cb({ status: 0, message: errMessage(e) }, null);
        });
    }

    function detailOf(txt) {
        try {
            var j = JSON.parse(txt);
            return (j['o:errorDetails'] && j['o:errorDetails'][0] && j['o:errorDetails'][0].detail) || j.title || '';
        } catch (e) { return ''; }
    }

    function viaQuery(spec, cb) {
        if (typeof require === 'undefined') { cb({ code: 'unavailable' }, null); return; }
        try {
            require(['N/query'], function (q) {
                var opts = { query: spec.sql };
                if (spec.params && spec.params.length) opts.params = spec.params;
                try {
                    if (q.runSuiteQL && typeof q.runSuiteQL.promise === 'function') {
                        q.runSuiteQL.promise(opts).then(function (rs) {
                            try { cb(null, rs.asMappedResults(), { via: 'query' }); }
                            catch (e) { cb({ sqlError: true, message: errMessage(e) }, null); }
                        }, function (e) {
                            cb({ sqlError: true, message: errMessage(e) }, null);
                        });
                        return;
                    }
                    cb(null, q.runSuiteQL(opts).asMappedResults(), { via: 'query' });
                } catch (e) {
                    cb({ sqlError: true, message: errMessage(e) }, null);
                }
            }, function () {
                cb({ code: 'unavailable' }, null);
            });
        } catch (e) {
            cb({ code: 'unavailable', message: errMessage(e) }, null);
        }
    }

    function runOnce(spec, cb) {
        if (_restOff || typeof fetch !== 'function' || !spec.rest) { viaQuery(spec, cb); return; }
        viaRest(spec, function (err, rows, meta) {
            if (!err) { cb(null, rows, meta); return; }
            if (err.status === 400) { cb({ sqlError: true, message: err.message }, null); return; }
            viaQuery(spec, cb);
        });
    }

    function run(spec, cb) {
        if (!spec || (!spec.rest && !spec.sql)) { cb({ code: 'query', message: 'Empty spec' }, null); return; }
        if (!_ready) { _pending.push(function () { run(spec, cb); }); return; }
        runOnce(spec, function (err, rows, meta) {
            if (err && err.sqlError && spec.fallback) { runOnce(spec.fallback, cb); return; }
            cb(err, rows, meta);
        });
    }

    window.addEventListener('message', function (event) {
        if (event.source !== window) return;
        const d = event.data;
        if (!d || d.dest !== 'nsft_sql_restoff') return;
        if (d.off) _restOff = true;
        markReady();
    });

    window.NSFT_SQL = {
        lit: lit,
        setRestOff: function (off) { if (off) _restOff = true; },
        run: run
    };

    window.postMessage({ dest: 'nsft_sql_ready' }, '*');

    setTimeout(markReady, 1000);
})();
