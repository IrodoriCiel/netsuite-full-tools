(function () {
    'use strict';

    const FIELDS = ['department', 'class', 'location', 'subsidiary', 'adjlocation'];

    function setAttribute(f, val) {
        if (!val) return;
        document.querySelectorAll(`div.uir-field-wrapper[data-field-name="${f}"]`).forEach(wrapper => {
            wrapper.setAttribute('data-nsft-id', val);
        });
    }

    function readClientValue(f) {
        try {
            let val = typeof nlapiGetFieldValue === 'function' ? nlapiGetFieldValue(f) : null;
            if (!val) {
                const el = document.getElementById(f);
                if (el && el.value) val = el.value;
            }
            return val || null;
        } catch (e) {
            return null;
        }
    }

    function run() {
        try {
            const unresolved = [];
            FIELDS.forEach(f => {
                const val = readClientValue(f);
                if (val) {
                    setAttribute(f, val);
                } else if (document.querySelector(`div.uir-field-wrapper[data-field-name="${f}"]`)) {
                    unresolved.push(f);
                }
            });

            if (unresolved.length &&
                typeof nlapiGetRecordType === 'function' &&
                typeof nlapiGetRecordId === 'function') {
                const recType = nlapiGetRecordType();
                const recId = nlapiGetRecordId();
                if (recType && recId) {
                    lookupAsync(recType, recId, unresolved).then(avisar, avisar);
                    return;
                }
            }
        } catch (err) {
        }
        avisar();
    }

    function avisar() {
        window.postMessage({ dest: 'extension_rnl', type: 'fieldsReady' }, '*');
    }

    function lookupAsync(recType, recId, fields) {
        const aplica = (vals) => {
            if (!vals) return;
            fields.forEach((f) => {
                let v = vals[f];
                if (Array.isArray(v)) v = v[0] && v[0].value;
                if (v && typeof v === 'object' && 'value' in v) v = v.value;
                if (v) setAttribute(f, String(v));
            });
        };
        if (typeof require === 'function') {
            return new Promise((resolve) => {
                try {
                    require(['N/search'], (search) => {
                        search.lookupFields.promise({ type: recType, id: recId, columns: fields })
                            .then((vals) => { aplica(vals); resolve(); })
                            .catch(() => resolve());
                    }, () => resolve());
                } catch (e) { resolve(); }
            });
        }
        try {
            if (typeof nlapiLookupField === 'function') aplica(nlapiLookupField(recType, recId, fields));
        } catch (e) { }
        return Promise.resolve();
    }

    run();

})();
