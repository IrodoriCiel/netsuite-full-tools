'use strict';

(function () {
    if (window.__nsftRoFetcher) return;
    window.__nsftRoFetcher = true;

    var handled = {};

    function reply(payload) {
        window.postMessage({ dest: 'extension_ro', type: 'sqlrow', payload: payload }, '*');
    }

    window.addEventListener('message', function (event) {
        if (event.source !== window) return;
        var d = event.data;
        if (!d || d.dest !== 'fetcher_ro' || d.type !== 'sqlrow') return;
        var p = d.payload || {};
        if (!p.reqId || handled[p.reqId]) return;
        handled[p.reqId] = true;

        var table = String(p.table || '').toLowerCase();
        var id = parseInt(p.id, 10);
        if (!/^[a-z][a-z0-9_]*$/.test(table) || !id || id <= 0) {
            reply({ reqId: p.reqId, row: null });
            return;
        }
        if (typeof require !== 'function') {
            reply({ reqId: p.reqId, row: null });
            return;
        }

        var done = function (rows) {
            reply({ reqId: p.reqId, row: (rows && rows.length) ? rows[0] : null });
        };
        var fail = function () { reply({ reqId: p.reqId, row: null }); };

        require(['N/query'], function (query) {
            var cfg = { query: 'SELECT * FROM ' + table + ' WHERE id = ?', params: [id] };
            try {
                if (query.runSuiteQL && typeof query.runSuiteQL.promise === 'function') {
                    query.runSuiteQL.promise(cfg).then(function (rs) {
                        if (rs.asMappedResults && typeof rs.asMappedResults.promise === 'function') {
                            return rs.asMappedResults.promise();
                        }
                        return rs.asMappedResults();
                    }).then(done).catch(fail);
                } else {
                    done(query.runSuiteQL(cfg).asMappedResults());
                }
            } catch (e) { fail(); }
        }, fail);
    });

    var savesHandled = {};
    var PARSED_TYPES = ['date', 'datetime', 'datetimetz', 'timeofday', 'currency', 'currency2', 'float',
        'integer', 'percent', 'poscurrency', 'posfloat', 'posinteger', 'nonnegcurrency', 'nonnegfloat',
        'rate', 'ratehighprecision'];
    var DATE_TYPES = ['date', 'datetime', 'datetimetz', 'timeofday'];

    function replySave(payload) {
        window.postMessage({ dest: 'extension_ro', type: 'saved', payload: payload }, '*');
    }

    function errText(e) {
        return String((e && (e.message || e.name)) || e);
    }

    function toFieldValue(format, field, raw) {
        var type = String((field && field.type) || '').toLowerCase();
        var s = raw == null ? '' : String(raw).trim();
        if (type === 'checkbox') return /^(t|true|y|yes|1)$/i.test(s);
        if (type === 'multiselect') {
            return s ? s.split(/[\u0005,]/).map(function (v) { return v.trim(); }).filter(Boolean) : [];
        }
        if (PARSED_TYPES.indexOf(type) === -1) return raw == null ? '' : String(raw);
        if (s === '') return null;

        var parsed = format.parse({ value: s, type: type });
        if (DATE_TYPES.indexOf(type) !== -1) {
            if (!(parsed instanceof Date) || isNaN(parsed.getTime())) {
                throw new Error('"' + s + '" is not a valid ' + type + ' in your NetSuite date format');
            }
            return parsed;
        }
        if (typeof parsed !== 'number' || isNaN(parsed)) throw new Error('"' + s + '" is not a valid number');
        return parsed;
    }

    window.addEventListener('message', function (event) {
        if (event.source !== window) return;
        var d = event.data;
        if (!d || d.dest !== 'fetcher_ro' || d.type !== 'save') return;
        var p = d.payload || {};
        if (!p.reqId || savesHandled[p.reqId]) return;
        savesHandled[p.reqId] = true;

        if (typeof require !== 'function') {
            replySave({ reqId: p.reqId, ok: false, errors: ['SuiteScript is not available on this page.'] });
            return;
        }

        require(['N/record', 'N/format'], function (record, format) {
            var rec;
            try {
                rec = record.load({ type: p.type, id: p.id });
            } catch (e) {
                replySave({ reqId: p.reqId, ok: false, errors: ['Could not load the record: ' + errText(e)] });
                return;
            }

            var errors = [];
            (p.changes || []).forEach(function (c) {
                var label = c.sublistId ? c.sublistId + ' line ' + (c.line + 1) + ' · ' + c.fieldId : c.fieldId;
                try {
                    if (c.sublistId) {
                        var sf = rec.getSublistField({ sublistId: c.sublistId, fieldId: c.fieldId, line: c.line });
                        if (!sf) throw new Error('not a field on this sublist');
                        rec.setSublistValue({
                            sublistId: c.sublistId, fieldId: c.fieldId, line: c.line,
                            value: toFieldValue(format, sf, c.value)
                        });
                    } else {
                        var f = rec.getField({ fieldId: c.fieldId });
                        if (!f) throw new Error('not a field on this record');
                        rec.setValue({ fieldId: c.fieldId, value: toFieldValue(format, f, c.value) });
                    }
                } catch (e) {
                    errors.push(label + ': ' + errText(e));
                }
            });
            if (errors.length) {
                replySave({ reqId: p.reqId, ok: false, errors: errors });
                return;
            }

            try {
                rec.save();
            } catch (e) {
                replySave({ reqId: p.reqId, ok: false, errors: ['Save failed: ' + errText(e)] });
                return;
            }
            replySave({ reqId: p.reqId, ok: true });
            setTimeout(function () { window.location.reload(); }, 800);
        }, function (e) {
            replySave({ reqId: p.reqId, ok: false, errors: ['Could not load N/record: ' + errText(e)] });
        });
    });
})();
