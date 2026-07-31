(function () {
    'use strict';

    if (globalThis.NSFT_ENV) return;

    const NS_URL_PATTERN = /https:\/\/([a-zA-Z0-9\-_]+)\.?(?:app|extforms)\.netsuite\.com\//;

    function isNetSuiteUrl(url) {
        return typeof url === 'string' && NS_URL_PATTERN.test(url);
    }

    const envCache = new Map();

    function detectEnv(subdomain) {
        if (!subdomain) return null;
        const key = subdomain.toLowerCase();
        const cached = envCache.get(key);
        if (cached) return cached;

        const env = computeEnv(key);
        envCache.set(key, env);
        return env;
    }

    function computeEnv(subdomain) {
        if (/^tstdrv\d+$/.test(subdomain)) {
            return { code: 'TD', color: '#8b5cf6', name: 'Testdrive' };
        }

        const parts = subdomain.split('-');
        if (parts.length === 1) {
            return { code: 'PRD', color: '#dc2626', name: 'Production' };
        }
        const suffix = parts[parts.length - 1].toUpperCase();
        if (/^SB\d*$/.test(suffix)) {
            return { code: suffix, color: '#16a34a', name: 'Sandbox ' + suffix };
        }
        if (suffix === 'RP') {
            return { code: 'RP', color: '#2563eb', name: 'Release Preview' };
        }
        return { code: suffix.slice(0, 4), color: '#6b7280', name: suffix };
    }

    function envFromUrl(url) {
        if (typeof url !== 'string') return null;
        const match = url.match(NS_URL_PATTERN);
        if (!match || !match[1]) return null;
        return detectEnv(match[1]);
    }

    function envFamily(code) {
        if (!code) return 'DEFAULT';
        if (code === 'PRD' || code === 'RP' || code === 'TD') return code;
        if (/^SB\d*$/.test(code)) return 'SB';
        return 'DEFAULT';
    }

    globalThis.NSFT_ENV = {
        NS_URL_PATTERN,
        isNetSuiteUrl,
        detectEnv,
        envFromUrl,
        envFamily
    };
})();
