(function () {
    try {
        var uid = '';
        if (typeof nlapiGetContext === 'function') {
            var context = nlapiGetContext();
            if (context) uid = context.getUser();
        }

        if (!uid && typeof window.nlapiGetUser === 'function') {
            try { uid = window.nlapiGetUser(); } catch (e) { }
        }

        if (uid) {
            window.postMessage({ dest: 'extension_profile', userId: String(uid) }, window.location.origin);
        }
    } catch (e) {
    }
})();
