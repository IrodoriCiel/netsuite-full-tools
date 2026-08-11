(function () {
    'use strict';

    if (window.NSFT_ScriptPage) return;

    const PAGE_RE = /\/scripting\/(?:script|scriptrecord|scriptdeploy)\.nl/i;

    function isScriptPage() {
        return PAGE_RE.test(location.pathname);
    }

    function pageId() {
        try {
            const raw = new URL(location.href).searchParams.get('id');
            const n = parseInt(raw, 10);
            return (n && n > 0) ? n : 0;
        } catch (e) { return 0; }
    }

    function isDeploymentPage() {
        if (!isScriptPage()) return false;
        if (/\/scripting\/script\.nl/i.test(location.pathname)) return false;
        if (/\/scripting\/scriptdeploy\.nl/i.test(location.pathname)) return true;
        return !document.querySelector('tr.uir-list-row-tr a[href*="scriptdeploy.nl"]');
    }

    function scriptId() {
        if (!isScriptPage()) return 0;
        const id = pageId();
        if (/\/scripting\/script\.nl/i.test(location.pathname)) return id;
        if (!isDeploymentPage()) return id;

        const links = document.querySelectorAll('a[href*="script.nl?id="]');
        for (let i = 0; i < links.length; i++) {
            try {
                const sid = parseInt(new URL(links[i].getAttribute('href'), location.origin)
                    .searchParams.get('id'), 10);
                if (sid && sid > 0 && sid !== id) return sid;
            } catch (e) { }
        }
        return 0;
    }

    function deploymentId() {
        return isDeploymentPage() ? pageId() : 0;
    }

    window.NSFT_ScriptPage = {
        isScriptPage,
        isDeploymentPage,
        pageId,
        scriptId,
        deploymentId
    };
})();
