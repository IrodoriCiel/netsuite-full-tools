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
                typeof nlapiGetRecordId === 'function' &&
                typeof nlapiLookupField === 'function') {
                try {
                    const recType = nlapiGetRecordType();
                    const recId = nlapiGetRecordId();
                    if (recType && recId) {
                        const vals = nlapiLookupField(recType, recId, unresolved);
                        if (vals) unresolved.forEach(f => { if (vals[f]) setAttribute(f, vals[f]); });
                    }
                } catch (e) { }
            }
        } catch (err) {
        }

        window.postMessage({ dest: 'extension_rnl', type: 'fieldsReady' }, '*');
    }

    run();

})();
