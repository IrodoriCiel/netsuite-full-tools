(function () {
    'use strict';

    const STORAGE_KEY = 'enableGithubBackup';
    const TOKEN_KEY = 'nsftGithubToken';
    const REPO_KEY = 'githubBackupRepo';
    const BRANCH_KEY = 'githubBackupBranch';
    const PREFIX_KEY = 'githubBackupPrefix';
    const PREFIX_CUSTOM_KEY = 'githubBackupPrefixCustom';
    const MODAL_ID = 'nsft-ghb-modal';
    const NSFT_THEME_KEY = 'nsftTheme';
    const GH_API = 'https://api.github.com';
    const CONCURRENCY = 3;

    if (window.__nsftGithubBackupInit) return;
    window.__nsftGithubBackupInit = true;

    let enabled = false;
    let _theme = 'light';

    try {
        if (window.NSFT_RecordButtons && NSFT_RecordButtons.isHeaderlessPage && NSFT_RecordButtons.isHeaderlessPage()) return;
    } catch (e) { }

    chrome.storage.local.get({ [STORAGE_KEY]: true, [NSFT_THEME_KEY]: 'light' }, (items) => {
        enabled = !!items[STORAGE_KEY];
        _theme = items[NSFT_THEME_KEY] || 'light';
    });
    chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== 'local') return;
        if (changes[STORAGE_KEY]) {
            enabled = !!changes[STORAGE_KEY].newValue;
            if (!enabled) closeModal();
        }
        if (changes[NSFT_THEME_KEY]) {
            _theme = changes[NSFT_THEME_KEY].newValue || 'light';
            const m = document.getElementById(MODAL_ID);
            if (m) m.setAttribute('data-theme', resolveTheme());
        }
    });

    function resolveTheme() {
        return _theme === 'dark' ? 'dark' : 'light';
    }

    window.addEventListener('nsft-show-github-backup', () => {
        openModal();
        if (window.NSFT_ShortcutCoach) window.NSFT_ShortcutCoach.hint('github_backup');
    });

    if (window.NSFT_Shortcuts && window.NSFT_Shortcuts.bind) {
        window.NSFT_Shortcuts.bind('github_backup', {
            label: chrome.i18n.getMessage('enableGithubBackupLabel') || 'Backup to GitHub',
            defaultCombo: { ctrlKey: false, shiftKey: true, altKey: true, code: 'KeyB' },
            storageKey: 'githubBackupShortcut',
            event: 'nsft-show-github-backup',
            group: chrome.i18n.getMessage('cheatsheet_group_global') || 'Global',
            order: 44,
            isEnabled: () => enabled
        });
    }

    function noAutofill(input) {
        if (!input) return;
        input.autocomplete = 'off';
        input.setAttribute('autocorrect', 'off');
        input.setAttribute('autocapitalize', 'off');
        input.setAttribute('spellcheck', 'false');
        input.setAttribute('data-1p-ignore', '');
        input.setAttribute('data-lpignore', 'true');
        input.setAttribute('data-form-type', 'other');
    }

    function msg(key, subs, fallback) {
        try { const m = chrome.i18n.getMessage(key, subs); if (m) return m; } catch (e) { }
        return fallback;
    }

    function accountSubdomain() {
        const m = location.hostname.match(/^([a-z0-9]+(?:[-_][a-z0-9]+)*)\./i);
        return m ? m[1].toLowerCase() : location.hostname.toLowerCase();
    }

    function slugify(s) {
        return String(s || '')
            .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
            .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    }

    const GHB_LEGAL_RE = /[ ,.]+(s\.?\s*a\.?\s*p\.?\s*i\.?\s*de\s*c\.?\s*v\.?|s\.?\s*a\.?\s*b\.?\s*de\s*c\.?\s*v\.?|s\.?\s*a\.?\s*de\s*c\.?\s*v\.?|s\.?\s*de\s*r\.?\s*l\.?\s*de\s*c\.?\s*v\.?|s\.?\s*de\s*r\.?\s*l\.?|s\.?\s*a\.?\s*p\.?\s*i\.?|s\.?\s*a\.?\s*b\.?|s\.?a\.?s|s\.?r\.?l\.?|s\.?\s*a\.?|a\.?\s*c\.?|s\.?\s*c\.?|ltda\.?|inc\.?|llc\.?|ltd\.?|gmbh\.?|ag\.?|n\.?v\.?|b\.?v\.?|p\.?l\.?c\.?|corporation|corp\.?|company|co\.?)(?=\s|,|\.|$)/i;
    const GHB_TAX_RE = /[ ,.()/-]+(?:rfc|cuit|cnpj|ein|nif|vat|nit|ruc|tax\s*id|tax)[ :.]/i;
    const GHB_FILLER = new Set(['DE', 'DEL', 'LA', 'EL', 'LAS', 'LOS', 'A', 'AL', 'Y', 'E', 'O', 'U', 'POR', 'PARA', 'CON', 'SOBRE', 'EN', 'THE', 'OF', 'AND', 'BY', 'FOR', 'IN', 'ON', 'AT', 'TO', '&', '-', '|', '/']);
    const GHB_PREFIXES = ['DESARROLLOS', 'DESARROLLADORA', 'GRUPO', 'GRUPOS', 'EMPRESA', 'EMPRESAS', 'SOCIEDAD', 'INSTITUTO', 'CENTRO', 'COMPA\u00d1\u00cdA', 'COMPA\u00d1IA', 'HOLDING', 'HOLDINGS', 'INMOBILIARIA', 'CORPORACI\u00d3N', 'CORPORACION', 'CORPORATIVO', 'COMERCIAL', 'COMERCIALIZADORA', 'SERVICIOS', 'SERVICIO', 'INDUSTRIAS', 'INDUSTRIA', 'INDUSTRIAL', 'CONSTRUCTORA', 'DISTRIBUIDORA', 'OPERADORA', 'PROYECTOS', 'NEGOCIOS', 'PROMOTORA', 'INVERSIONES', 'TRANSPORTES', 'LOGISTICA', 'LOG\u00cdSTICA', 'TECNOLOG\u00cdA', 'TECNOLOGIA', 'SOLUCIONES', 'PRODUCTOS', 'GLOBAL', 'INTERNACIONAL', 'NACIONAL', 'GROUP', 'GROUPS', 'ENTERPRISE', 'ENTERPRISES', 'COMPANY', 'COMPANIES', 'CORPORATION', 'CORPORATE', 'COMMERCIAL', 'SERVICES', 'SERVICE', 'INDUSTRIES', 'INDUSTRY', 'INDUSTRIAL', 'CONSTRUCTION', 'DISTRIBUTION', 'OPERATIONS', 'MANUFACTURING', 'PROJECTS', 'CONSULTING', 'INVESTMENTS', 'TRANSPORT', 'LOGISTICS', 'TECHNOLOGY', 'TECHNOLOGIES', 'SOLUTIONS', 'PRODUCTS', 'INTERNATIONAL', 'GLOBAL', 'WORLDWIDE', 'PARTNERS', 'VENTURES'];

    function extractBrand(fullName) {
        let s = String(fullName || '').trim();
        if (!s) return '';
        const tax = s.match(GHB_TAX_RE);
        if (tax && tax.index > 0) { const h = s.substring(0, tax.index).trim(); if (h) s = h; }
        const legal = s.match(GHB_LEGAL_RE);
        if (legal && legal.index > 0) { const h = s.substring(0, legal.index).trim(); if (h) s = h; }
        let stripped = true;
        while (stripped) {
            stripped = false;
            const upper = s.toUpperCase();
            for (const p of GHB_PREFIXES) {
                if (upper.startsWith(p + ' ')) { const rest = s.substring(p.length + 1).trim(); if (rest) { s = rest; stripped = true; break; } }
            }
        }
        const all = s.split(/\s+/).filter(Boolean);
        const meaningful = all.filter(w => !GHB_FILLER.has(w.toUpperCase()));
        const pool = meaningful.length ? meaningful : all;
        const res = pool.slice(0, 2).join(' ');
        return (res || pool[0] || '').toUpperCase();
    }

    function suggestPrefix() {
        return new Promise((resolve) => {
            const env = (window.NSFT_ENV && NSFT_ENV.envFromUrl && NSFT_ENV.envFromUrl(location.href)) || null;
            const envCode = env && env.code ? env.code.toLowerCase() : '';
            chrome.storage.local.get({ nsftAccountInfoCache: {} }, (it) => {
                let name = '';
                const cache = it.nsftAccountInfoCache || {};
                Object.keys(cache).forEach((k) => { if (!name && cache[k] && cache[k].companyName) name = cache[k].companyName; });
                const brand = extractBrand(name) || accountSubdomain().toUpperCase();
                resolve(brand + (envCode ? ' ' + envCode.toUpperCase() : ''));
            });
        });
    }

    function loadCfg() {
        return new Promise((resolve) => {
            chrome.storage.local.get({
                [TOKEN_KEY]: '', [REPO_KEY]: '', [BRANCH_KEY]: 'main', [PREFIX_KEY]: 'suitescripts', [PREFIX_CUSTOM_KEY]: false
            }, (it) => resolve({
                token: it[TOKEN_KEY] || '',
                repo: it[REPO_KEY] || '',
                branch: it[BRANCH_KEY] || 'main',
                prefix: it[PREFIX_KEY] || 'suitescripts',
                prefixCustom: it[PREFIX_CUSTOM_KEY] === true
            }));
        });
    }
    function saveCfg(cfg) {
        return new Promise((resolve) => {
            chrome.storage.local.set({
                [TOKEN_KEY]: cfg.token, [REPO_KEY]: cfg.repo,
                [BRANCH_KEY]: cfg.branch, [PREFIX_KEY]: cfg.prefix
            }, resolve);
        });
    }

    async function suiteqlAll(query, cap) {
        cap = cap || 5000;
        let rows = [], offset = 0;
        for (;;) {
            const limit = Math.min(1000, cap - rows.length);
            if (limit <= 0) break;
            const url = new URL('/services/rest/query/v1/suiteql?limit=' + limit + '&offset=' + offset, location.origin);
            const res = await fetch(url.href, {
                method: 'POST', credentials: 'same-origin',
                headers: { 'Content-Type': 'application/json', 'Prefer': 'transient' },
                body: JSON.stringify({ q: query })
            });
            if (!res.ok) {
                let detail = '';
                try { const j = await res.json(); detail = (j['o:errorDetails'] && j['o:errorDetails'][0] && j['o:errorDetails'][0].detail) || j.title || ''; } catch (e) { }
                throw new Error(msg('ghb_err_suiteql', [detail || ('HTTP ' + res.status)], 'SuiteQL: ' + (detail || res.status)));
            }
            const j = await res.json();
            const items = Array.isArray(j.items) ? j.items : [];
            items.forEach((it) => { const r = {}; Object.keys(it).forEach((k) => { if (k !== 'links') r[k] = it[k]; }); rows.push(r); });
            if (!j.hasMore || items.length === 0) break;
            offset += items.length;
        }
        return rows;
    }

    async function listScriptFiles() {
        const q = "SELECT f.id AS fileid, f.name AS filename, f.url AS fileurl, f.folder AS folderid, " +
            "BUILTIN.DF(s.scripttype) AS scripttype " +
            "FROM file f LEFT JOIN script s ON s.scriptfile = f.id " +
            "WHERE f.url IS NOT NULL AND LOWER(f.name) LIKE '%.js' ORDER BY f.name";
        const raw = await suiteqlAll(q, 20000);
        const rows = []; const seenF = new Set();
        raw.forEach((r) => { const k = String(r.fileid); if (!seenF.has(k)) { seenF.add(k); rows.push(r); } });
        const folders = await suiteqlAll('SELECT id, name, parent FROM mediaitemfolder', 20000);
        const byId = {};
        folders.forEach((f) => { byId[String(f.id)] = { name: f.name || String(f.id), parent: f.parent != null ? String(f.parent) : null }; });
        const pathCache = {};
        const pathOf = (id) => {
            id = id != null ? String(id) : null;
            if (!id) return '';
            if (pathCache[id]) return pathCache[id];
            const parts = []; let cur = id, guard = 0;
            while (cur && byId[cur] && guard++ < 40) { parts.unshift(byId[cur].name); cur = byId[cur].parent; }
            const p = parts.join('/');
            pathCache[id] = p;
            return p;
        };
        rows.forEach((r) => { r.folderpath = pathOf(r.folderid) || '(raíz)'; });
        return rows;
    }

    async function fetchFileText(fileUrl) {
        const res = await fetch(new URL(fileUrl, location.origin).href, { credentials: 'same-origin' });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.text();
    }


    const GH_ORIGIN = GH_API + '/*';

    function ghbEnsureHostPermission() {
        return new Promise((resolve) => {
            if (!chrome.permissions || !chrome.permissions.request) { resolve(true); return; }
            try {
                chrome.permissions.request({ origins: [GH_ORIGIN] }, (granted) => {
                    if (chrome.runtime.lastError) { resolve(false); return; }
                    resolve(!!granted);
                });
            } catch (e) { resolve(true); }
        });
    }

    function ghHeaders(token) {
        return {
            'Authorization': 'Bearer ' + token,
            'Accept': 'application/vnd.github+json',
            'X-GitHub-Api-Version': '2022-11-28'
        };
    }

    function toB64(str) {
        const bytes = new TextEncoder().encode(str);
        let bin = '';
        for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
        return btoa(bin);
    }

    async function ghGetTree(cfg) {
        const url = GH_API + '/repos/' + cfg.repo + '/git/trees/' + encodeURIComponent(cfg.branch) + '?recursive=1';
        const res = await fetch(url, { headers: ghHeaders(cfg.token) });
        if (res.status === 404 || res.status === 409) return {};
        if (!res.ok) throw new Error('GitHub ' + res.status);
        const j = await res.json();
        const map = {};
        (j.tree || []).forEach((t) => { if (t.type === 'blob') map[t.path] = t.sha; });
        return map;
    }

    async function gitBlobSha(bytes) {
        const header = new TextEncoder().encode('blob ' + bytes.length + '\0');
        const buf = new Uint8Array(header.length + bytes.length);
        buf.set(header, 0); buf.set(bytes, header.length);
        const digest = await crypto.subtle.digest('SHA-1', buf);
        return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
    }

    async function ghPut(cfg, path, contentB64, sha) {
        const url = GH_API + '/repos/' + cfg.repo + '/contents/' + encodeURI(path);
        const body = {
            message: 'NSFT backup: ' + path,
            content: contentB64,
            branch: cfg.branch
        };
        if (sha) body.sha = sha;
        const res = await fetch(url, { method: 'PUT', headers: ghHeaders(cfg.token), body: JSON.stringify(body) });
        if (!res.ok) {
            let detail = '';
            try { const j = await res.json(); detail = j.message || ''; } catch (e) { }
            throw new Error('GitHub ' + res.status + (detail ? ': ' + detail : ''));
        }
        return true;
    }

    async function ghCheckRepo(cfg) {
        const res = await fetch(GH_API + '/repos/' + cfg.repo, { headers: ghHeaders(cfg.token) });
        if (res.status === 401) throw new Error(msg('ghb_err_auth', null, 'Token inválido o sin permiso.'));
        if (res.status === 404) throw new Error(msg('ghb_err_repo', null, 'Repositorio no encontrado (¿owner/repo correcto y el token tiene acceso?).'));
        if (!res.ok) throw new Error('GitHub ' + res.status);
        return true;
    }

    function sanitizeSeg(s) {
        return String(s || '').replace(/[\x00-\x1f<>:"/\\|?*]/g, '_').replace(/[. ]+$/, '').trim() || '_';
    }

    function buildJobs(scripts, prefix, groupBy, allow) {
        const seen = new Set();
        const jobs = [];
        const base = prefix.replace(/^\/+|\/+$/g, '');
        scripts.forEach((s) => {
            const key = groupBy === 'folder' ? (s.folderpath || '(raíz)') : (s.scripttype || 'Libreria');
            if (allow && !allow.has(key)) return;
            const sub = groupBy === 'folder'
                ? String(key).split('/').map(sanitizeSeg).join('/')
                : sanitizeSeg(key);
            const fname = sanitizeSeg(s.filename || (s.fileid + '.js'));
            const path = base + '/' + sub + '/' + fname;
            if (seen.has(path)) return;
            seen.add(path);
            jobs.push({ path, url: s.fileurl, name: s.scriptname });
        });
        return jobs;
    }

    async function runBackup(cfg, jobs, ui, signal) {
        ui.busy(msg('ghb_checking', null, 'Verificando repositorio…'));
        await ghCheckRepo(cfg);
        if (!jobs.length) { ui.status(msg('ghb_none', null, 'No hay scripts seleccionados.')); return; }

        const tree = await ghGetTree(cfg);

        const total = jobs.length;
        let done = 0, skipped = 0, failed = 0;
        ui.progress(0, total);
        const toPush = [];
        let next = 0;
        const dlWorker = async () => {
            for (;;) {
                const i = next++;
                if (i >= jobs.length || signal.aborted) return;
                const job = jobs[i];
                try {
                    const text = await fetchFileText(job.url);
                    const bytes = new TextEncoder().encode(text);
                    const sha = await gitBlobSha(bytes);
                    if (tree[job.path] === sha) {
                        skipped++;
                    } else {
                        let bin = '';
                        for (let k = 0; k < bytes.length; k++) bin += String.fromCharCode(bytes[k]);
                        toPush.push({ path: job.path, b64: btoa(bin), sha: tree[job.path] || null });
                    }
                } catch (e) {
                    failed++;
                    ui.log('⚠ ' + job.path + ' — ' + (e && e.message || e));
                }
                done++;
                ui.progress(done, total);
                ui.status(msg('ghb_reading', [String(done), String(total)], 'Comparando ' + done + ' de ' + total + '…'));
            }
        };
        await Promise.all(Array.from({ length: Math.min(CONCURRENCY, jobs.length) }, dlWorker));
        if (signal.aborted) { ui.status(msg('ghb_cancelled', null, 'Respaldo cancelado.')); return; }

        let pushed = 0, up = 0;
        for (const item of toPush) {
            if (signal.aborted) break;
            try {
                await ghPut(cfg, item.path, item.b64, item.sha);
                pushed++;
            } catch (e) {
                if (/\b409\b/.test(String(e && e.message))) {
                    try {
                        const fresh = await ghGetTree(cfg);
                        await ghPut(cfg, item.path, item.b64, fresh[item.path] || null);
                        pushed++;
                    } catch (e2) { failed++; ui.log('⚠ ' + item.path + ' — ' + (e2 && e2.message || e2)); }
                } else {
                    failed++;
                    ui.log('⚠ ' + item.path + ' — ' + (e && e.message || e));
                }
            }
            up++;
            ui.status(msg('ghb_progress', [String(up), String(toPush.length)], 'Subiendo ' + up + ' de ' + toPush.length + '…'));
        }

        if (signal.aborted) { ui.status(msg('ghb_cancelled', null, 'Respaldo cancelado.')); return; }
        ui.status(msg('ghb_done', [String(pushed), String(skipped), String(failed)],
            'Listo: ' + pushed + ' subidos, ' + skipped + ' sin cambios, ' + failed + ' con error.'));
        chrome.storage.local.set({ nsftGithubLastBackup: Date.now() });
    }

    let _abort = null;

    function closeModal() {
        if (_abort) { _abort.abort(); _abort = null; }
        const m = document.getElementById(MODAL_ID);
        if (m) m.remove();
    }

    async function openModal() {
        if (document.getElementById(MODAL_ID)) { closeModal(); return; }
        const cfg = await loadCfg();
        if (!cfg.prefixCustom) {
            cfg.prefix = await suggestPrefix();
        }

        const overlay = document.createElement('div');
        overlay.id = MODAL_ID;
        overlay.className = 'nsft-ghb-overlay';
        overlay.setAttribute('data-theme', resolveTheme());
        overlay.addEventListener('mousedown', (e) => { if (e.target === overlay && !_abort) closeModal(); });

        const lastTs = await new Promise((r) => chrome.storage.local.get({ nsftGithubLastBackup: 0 }, (it) => r(it.nsftGithubLastBackup || 0)));

        const card = document.createElement('div');
        card.className = 'nsft-ghb-card';
        card.innerHTML =
            '<div class="nsft-ghb-head">' +
                '<span class="nsft-ghb-headicon">' + GH_ICON + '</span>' +
                '<div class="nsft-ghb-headtext">' +
                    '<div class="nsft-ghb-title">' + esc(msg('ghb_title', null, 'Respaldar SuiteScripts a GitHub')) + '</div>' +
                    '<div class="nsft-ghb-sub">' + esc(msg('ghb_sub', null, 'Solo se subirán los scripts que hayan cambiado desde el último respaldo.')) + '</div>' +
                '</div>' +
                '<button type="button" class="nsft-ghb-x" title="' + esc(msg('ghb_close', null, 'Cerrar')) + '">✕</button>' +
            '</div>' +
            '<div class="nsft-ghb-body">' +
                '<div class="nsft-ghb-col nsft-ghb-col-left">' +
                    '<details class="nsft-ghb-guide" open>' +
                        '<summary class="nsft-ghb-guide-sum">' +
                            '<span class="nsft-ghb-guide-i">i</span>' +
                            '<span class="nsft-ghb-guide-title">' + esc(msg('ghb_guide_title', null, 'Cómo respaldar')) + '</span>' +
                            '<span class="nsft-ghb-guide-hint">' + esc(msg('ghb_guide_once', null, 'configúralo una sola vez')) + '</span>' +
                        '</summary>' +
                        '<ol class="nsft-ghb-guide-steps">' +
                            '<li>' + esc(msg('ghb_step1', null, 'Crea un token fine-grained en GitHub:')) +
                                ' <a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noopener noreferrer" class="nsft-ghb-link">github.com/settings/personal-access-tokens/new ↗</a></li>' +
                            '<li>' + esc(msg('ghb_step2', null, 'En Repository access, marca «Only select repositories» y elige tu repo.')) + '</li>' +
                            '<li>' + esc(msg('ghb_step3', null, 'En Permissions → Repository permissions, pon Contents en «Read and write».')) + '</li>' +
                            '<li>' + esc(msg('ghb_step4', null, 'Copia el token y pégalo abajo junto al repositorio.')) + '</li>' +
                        '</ol>' +
                    '</details>' +
                    '<label class="nsft-ghb-lbl">' + esc(msg('ghb_f_token', null, 'Token de acceso personal')) + '</label>' +
                    '<div class="nsft-ghb-secret">' +
                        '<input type="text" class="nsft-ghb-in nsft-ghb-secretin" id="nsft-ghb-token" placeholder="github_pat_…">' +
                        '<span class="nsft-ghb-inbtns">' +
                            '<button type="button" class="nsft-ghb-iconbtn" id="nsft-ghb-clear" title="' + esc(msg('ghb_clear', null, 'Borrar token')) + '">' + TRASH_ICON + '</button>' +
                            '<button type="button" class="nsft-ghb-iconbtn nsft-ghb-eye" id="nsft-ghb-reveal" title="' + esc(msg('ghb_show', null, 'Mostrar')) + '">' + EYE_ICON + '</button>' +
                        '</span>' +
                    '</div>' +
                    '<div class="nsft-ghb-help">' + esc(msg('ghb_token_help', null, 'Se guarda solo en este navegador. Permiso requerido: Contents · lectura y escritura.')) + '</div>' +
                    '<label class="nsft-ghb-lbl">' + esc(msg('ghb_f_repo', null, 'Repositorio')) + '</label>' +
                    '<input type="text" class="nsft-ghb-in" id="nsft-ghb-repo" placeholder="owner/repo" autocomplete="off">' +
                    '<div class="nsft-ghb-row2">' +
                        '<div><label class="nsft-ghb-lbl">' + esc(msg('ghb_f_branch', null, 'Rama')) + '</label>' +
                            '<input type="text" class="nsft-ghb-in" id="nsft-ghb-branch" placeholder="main" autocomplete="off"></div>' +
                        '<div><label class="nsft-ghb-lbl">' + esc(msg('ghb_f_prefix', null, 'Carpeta base')) + '</label>' +
                            '<input type="text" class="nsft-ghb-in" id="nsft-ghb-prefix" placeholder="suitescripts" autocomplete="off"></div>' +
                    '</div>' +
                    '<div class="nsft-ghb-dest" id="nsft-ghb-dest"></div>' +
                    '<div class="nsft-ghb-status" id="nsft-ghb-status"></div>' +
                    '<div class="nsft-ghb-bar" id="nsft-ghb-bar" hidden><div class="nsft-ghb-barfill" id="nsft-ghb-barfill"></div></div>' +
                    '<div class="nsft-ghb-logs" id="nsft-ghb-logs"></div>' +
                '</div>' +
                '<div class="nsft-ghb-col nsft-ghb-col-right nsft-ghb-types" id="nsft-ghb-types" hidden>' +
                    '<div class="nsft-ghb-types-head">' +
                        '<span class="nsft-ghb-scriptslbl">' + esc(msg('ghb_scripts', null, 'Scripts')) + '<span class="nsft-ghb-totalbadge" id="nsft-ghb-totalbadge"></span></span>' +
                        '<span class="nsft-ghb-groupby">' +
                            '<button type="button" class="nsft-ghb-tab nsft-ghb-tab-on" data-g="type">' + esc(msg('ghb_by_type', null, 'Tipo')) + '</button>' +
                            '<button type="button" class="nsft-ghb-tab" data-g="folder">' + esc(msg('ghb_by_folder', null, 'Carpeta')) + '</button>' +
                        '</span>' +
                        '<span class="nsft-ghb-types-actions">' +
                            '<a href="#" id="nsft-ghb-all">' + esc(msg('ghb_all', null, 'Todos')) + '</a> · ' +
                            '<a href="#" id="nsft-ghb-none">' + esc(msg('ghb_none_sel', null, 'Ninguno')) + '</a>' +
                        '</span>' +
                    '</div>' +
                    '<div class="nsft-ghb-types-list" id="nsft-ghb-types-list"></div>' +
                    '<div class="nsft-ghb-types-foot" id="nsft-ghb-types-foot"></div>' +
                '</div>' +
            '</div>' +
            '<div class="nsft-ghb-foot">' +
                '<span class="nsft-ghb-last" id="nsft-ghb-last"></span>' +
                '<span class="nsft-ghb-footbtns">' +
                    '<button type="button" class="nsft-ghb-btn" id="nsft-ghb-cancel">' + esc(msg('ghb_close', null, 'Cerrar')) + '</button>' +
                    '<button type="button" class="nsft-ghb-btn nsft-ghb-run" id="nsft-ghb-run" disabled>⬇ ' + esc(msg('ghb_run', null, 'Respaldar ahora')) + '</button>' +
                '</span>' +
            '</div>';

        overlay.appendChild(card);
        document.documentElement.appendChild(overlay);

        const $ = (id) => document.getElementById(id);
        ['nsft-ghb-token', 'nsft-ghb-repo', 'nsft-ghb-branch', 'nsft-ghb-prefix'].forEach((id) => noAutofill($(id)));
        $('nsft-ghb-token').value = cfg.token;
        $('nsft-ghb-repo').value = cfg.repo;
        $('nsft-ghb-branch').value = cfg.branch;
        $('nsft-ghb-prefix').value = cfg.prefix;
        if (lastTs) {
            const d = new Date(lastTs);
            const hh = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
            $('nsft-ghb-last').textContent = msg('ghb_last', [hh], 'Último respaldo: hoy, ' + hh);
        }

        card.querySelector('.nsft-ghb-x').addEventListener('click', closeModal);
        $('nsft-ghb-cancel').addEventListener('click', () => { if (_abort) _abort.abort(); else closeModal(); });
        $('nsft-ghb-reveal').addEventListener('click', () => {
            const t = $('nsft-ghb-token');
            const show = t.classList.contains('nsft-ghb-secretin');
            t.classList.toggle('nsft-ghb-secretin', !show);
            $('nsft-ghb-reveal').innerHTML = show ? EYE_OFF_ICON : EYE_ICON;
            $('nsft-ghb-reveal').title = show ? msg('ghb_hide', null, 'Ocultar') : msg('ghb_show', null, 'Mostrar');
        });
        $('nsft-ghb-clear').addEventListener('click', (e) => {
            e.preventDefault();
            $('nsft-ghb-token').value = '';
            $('nsft-ghb-token').classList.add('nsft-ghb-secretin');
            $('nsft-ghb-reveal').innerHTML = EYE_ICON;
            $('nsft-ghb-reveal').title = msg('ghb_show', null, 'Mostrar');
            chrome.storage.local.remove(TOKEN_KEY);
            $('nsft-ghb-token').focus();
            syncRunEnabled();
        });

        const ui = {
            status: (t) => { const el = $('nsft-ghb-status'); if (el) el.textContent = t; },
            busy: (t) => { const el = $('nsft-ghb-status'); if (el) { el.innerHTML = '<span class="nsft-ghb-spin"></span>'; el.appendChild(document.createTextNode(t)); } },
            progress: (d, t) => { const bar = $('nsft-ghb-bar'), fill = $('nsft-ghb-barfill'); if (bar) bar.hidden = false; if (fill) fill.style.width = t ? Math.round(d / t * 100) + '%' : '0%'; },
            log: (t) => { const l = $('nsft-ghb-logs'); if (l) { const d = document.createElement('div'); d.textContent = t; l.appendChild(d); l.scrollTop = l.scrollHeight; } }
        };

        let _scripts = null;
        let _groupBy = 'type';
        let _counts = null;
        let _listing = false;

        const readCfg = () => ({
            token: $('nsft-ghb-token').value.trim(),
            repo: $('nsft-ghb-repo').value.trim().replace(/^https?:\/\/github\.com\//i, '').replace(/\.git$/, ''),
            branch: $('nsft-ghb-branch').value.trim() || 'main',
            prefix: $('nsft-ghb-prefix').value.trim() || 'suitescripts'
        });

        const updateDest = () => {
            const c = readCfg();
            $('nsft-ghb-dest').textContent = (c.repo && /^[^/]+\/[^/]+$/.test(c.repo))
                ? msg('ghb_dest', [c.repo + '@' + c.branch + '/' + c.prefix], '● Destino: ' + c.repo + '@' + c.branch + '/' + c.prefix)
                : '';
        };
        ['nsft-ghb-repo', 'nsft-ghb-branch', 'nsft-ghb-prefix'].forEach((id) => $(id).addEventListener('input', updateDest));

        const cfgReady = () => {
            const c = readCfg();
            return !!c.token && /^[^/]+\/[^/]+$/.test(c.repo);
        };

        const syncRunEnabled = () => {
            const btn = $('nsft-ghb-run');
            if (!btn || _abort) return;
            const ready = !_listing && !!_scripts && cfgReady();
            btn.disabled = !ready;
            btn.title = ready ? ''
                : _listing ? msg('ghb_listing', null, 'Listando scripts…')
                    : !_scripts ? msg('ghb_none', null, 'No se encontraron scripts.')
                        : msg('ghb_need_cfg', null, 'Completa el token y el repositorio (owner/repo).');
        };
        ['nsft-ghb-token', 'nsft-ghb-repo'].forEach((id) => $(id).addEventListener('input', syncRunEnabled));
        $('nsft-ghb-prefix').addEventListener('input', () => chrome.storage.local.set({ [PREFIX_CUSTOM_KEY]: true }));
        updateDest();

        function computeCounts() {
            _counts = {};
            _scripts.forEach((s) => {
                const key = _groupBy === 'folder' ? (s.folderpath || '(raíz)') : (s.scripttype || 'Libreria');
                _counts[key] = (_counts[key] || 0) + 1;
            });
        }
        function renderList() {
            const list = $('nsft-ghb-types-list');
            list.innerHTML = '';
            if (_groupBy === 'folder') { renderTree(list); }
            else {
                Object.keys(_counts).sort().forEach((k) => {
                    const row = document.createElement('label');
                    row.className = 'nsft-ghb-typerow';
                    const cb = document.createElement('input');
                    cb.type = 'checkbox'; cb.checked = true; cb.setAttribute('data-key', k);
                    const name = document.createElement('span'); name.className = 'nsft-ghb-typename'; name.textContent = k;
                    const cnt = document.createElement('span'); cnt.className = 'nsft-ghb-typecount'; cnt.textContent = _counts[k];
                    row.appendChild(cb); row.appendChild(name); row.appendChild(cnt);
                    list.appendChild(row);
                });
            }
            $('nsft-ghb-types').hidden = false;
        }

        function buildTree() {
            const root = { name: '', full: '', children: {}, key: null, count: 0 };
            Object.keys(_counts).forEach((fp) => {
                const parts = fp.split('/');
                let node = root, acc = '';
                parts.forEach((seg) => {
                    acc = acc ? acc + '/' + seg : seg;
                    if (!node.children[seg]) node.children[seg] = { name: seg, full: acc, children: {}, key: null, count: 0 };
                    node = node.children[seg];
                });
                node.key = fp; node.count = _counts[fp];
            });
            const total = (n) => { let t = n.count || 0; Object.values(n.children).forEach((c) => t += total(c)); n.total = t; return t; };
            total(root);
            return root;
        }
        function renderTree(list) {
            const root = buildTree();
            const rows = [];
            const walk = (node, depth) => {
                Object.keys(node.children).sort().forEach((seg) => {
                    const c = node.children[seg];
                    const hasKids = Object.keys(c.children).length > 0;
                    const row = document.createElement('div');
                    row.className = 'nsft-ghb-treerow';
                    row.setAttribute('data-full', c.full);
                    row.setAttribute('data-depth', depth);
                    row.style.paddingLeft = '8px';
                    for (let g = 0; g < depth; g++) { const gd = document.createElement('span'); gd.className = 'nsft-ghb-tguide'; row.appendChild(gd); }
                    const caret = document.createElement('span');
                    caret.className = 'nsft-ghb-caret' + (hasKids ? '' : ' nsft-ghb-caret-empty');
                    caret.textContent = hasKids ? '▸' : '';
                    const cb = document.createElement('input');
                    cb.type = 'checkbox'; cb.checked = true; cb.setAttribute('data-full', c.full);
                    if (c.key) cb.setAttribute('data-key', c.key);
                    const ic = document.createElement('span'); ic.className = 'nsft-ghb-folder'; ic.innerHTML = FOLDER_CLOSED;
                    const name = document.createElement('span'); name.className = 'nsft-ghb-typename'; name.textContent = seg;
                    const cnt = document.createElement('span'); cnt.className = 'nsft-ghb-typecount'; cnt.textContent = c.total;
                    row.appendChild(caret); row.appendChild(cb); row.appendChild(ic); row.appendChild(name); row.appendChild(cnt);
                    if (depth > 0) row.style.display = 'none';
                    list.appendChild(row);
                    rows.push(row);
                    if (hasKids) {
                        caret.addEventListener('click', (e) => {
                            e.preventDefault(); e.stopPropagation();
                            const open = caret.textContent === '▸';
                            caret.textContent = open ? '▾' : '▸';
                            ic.innerHTML = open ? FOLDER_OPEN : FOLDER_CLOSED;
                            const prefix = c.full + '/';
                            rows.forEach((r) => {
                                const f = r.getAttribute('data-full');
                                if (f !== c.full && f.indexOf(prefix) === 0) {
                                    if (!open) { r.style.display = 'none'; const cr = r.querySelector('.nsft-ghb-caret'); if (cr && cr.textContent === '▾') cr.textContent = '▸'; }
                                    else if (r.getAttribute('data-full').slice(prefix.length).indexOf('/') === -1) r.style.display = '';
                                }
                            });
                        });
                    }
                    cb.addEventListener('change', () => {
                        const prefix = c.full + '/';
                        list.querySelectorAll('input[data-full]').forEach((b) => {
                            const f = b.getAttribute('data-full');
                            if (f !== c.full && f.indexOf(prefix) === 0) b.checked = cb.checked;
                        });
                    });
                    walk(c, depth + 1);
                });
            };
            walk(root, 0);
        }
        function selectedKeys() {
            const set = new Set();
            document.querySelectorAll('#nsft-ghb-types-list input[type="checkbox"]').forEach((cb) => {
                const k = cb.getAttribute('data-key');
                if (k && cb.checked) set.add(k);
            });
            return set;
        }
        function updateFoot() {
            const foot = $('nsft-ghb-types-foot');
            if (!foot || !_scripts) return;
            const allow = selectedKeys();
            const selCount = _scripts.filter((s) => {
                const key = _groupBy === 'folder' ? (s.folderpath || '(raíz)') : (s.scripttype || 'Libreria');
                return allow.has(key);
            }).length;
            foot.textContent = msg('ghb_foot', [String(selCount), String(_scripts.length)],
                selCount + ' de ' + _scripts.length + ' scripts seleccionados');
            const badge = $('nsft-ghb-totalbadge');
            if (badge) badge.textContent = selCount;
        }

        async function ensureLoaded() {
            if (_scripts) return true;
            _listing = true;
            syncRunEnabled();
            $('nsft-ghb-types').hidden = false;
            $('nsft-ghb-types-list').innerHTML =
                '<div class="nsft-ghb-loading"><span class="nsft-ghb-spin"></span>' +
                esc(msg('ghb_listing', null, 'Listando scripts…')) + '</div>';
            try {
                _scripts = await listScriptFiles();
                if (!_scripts.length) {
                    _scripts = null;
                    $('nsft-ghb-types-list').innerHTML = '<div class="nsft-ghb-loading">' + esc(msg('ghb_none', null, 'No se encontraron scripts.')) + '</div>';
                    return false;
                }
                computeCounts(); renderList();
                updateFoot();
                return true;
            } finally {
                _listing = false;
                syncRunEnabled();
            }
        }

        card.querySelectorAll('.nsft-ghb-tab').forEach((tab) => tab.addEventListener('click', () => {
            _groupBy = tab.getAttribute('data-g');
            card.querySelectorAll('.nsft-ghb-tab').forEach((t) => t.classList.toggle('nsft-ghb-tab-on', t === tab));
            if (_scripts) { computeCounts(); renderList(); updateFoot(); }
        }));
        $('nsft-ghb-all').addEventListener('click', (e) => { e.preventDefault(); document.querySelectorAll('#nsft-ghb-types-list input').forEach((cb) => cb.checked = true); updateFoot(); });
        $('nsft-ghb-none').addEventListener('click', (e) => { e.preventDefault(); document.querySelectorAll('#nsft-ghb-types-list input').forEach((cb) => cb.checked = false); updateFoot(); });
        $('nsft-ghb-types-list').addEventListener('change', () => updateFoot());

        syncRunEnabled();
        ensureLoaded()
            .then(() => { if (!cfgReady()) ui.status(msg('ghb_need_cfg', null, 'Completa el token y el repositorio (owner/repo).')); })
            .catch((e) => ui.status(msg('ghb_error', [String(e && e.message || e)], 'Error: ' + (e && e.message || e))));

        $('nsft-ghb-run').addEventListener('click', async () => {
            const c = readCfg();
            if (!c.token || !/^[^/]+\/[^/]+$/.test(c.repo)) { ui.status(msg('ghb_need_cfg', null, 'Completa el token y el repositorio (owner/repo).')); return; }
            const okPerm = await ghbEnsureHostPermission();
            if (!okPerm) { ui.status(msg('ghb_need_perm', null, 'Se necesita permiso para conectar con api.github.com.')); return; }
            await saveCfg(c);
            $('nsft-ghb-run').disabled = true;
            _abort = new AbortController();
            try {
                if (!_scripts) {
                    await ghCheckRepo(c);
                    if (!(await ensureLoaded())) return;
                }
                const allow = selectedKeys();
                if (!allow.size) { ui.status(msg('ghb_pick_one', null, 'Selecciona al menos un elemento.')); return; }
                const jobs = buildJobs(_scripts, c.prefix, _groupBy, allow);
                $('nsft-ghb-logs').textContent = '';
                await runBackup(c, jobs, ui, _abort.signal);
                const hh = new Date();
                $('nsft-ghb-last').textContent = msg('ghb_last', [String(hh.getHours()).padStart(2, '0') + ':' + String(hh.getMinutes()).padStart(2, '0')], 'Último respaldo: hoy');
            } catch (e) {
                ui.status(msg('ghb_error', [String(e && e.message || e)], 'Error: ' + (e && e.message || e)));
            } finally {
                _abort = null;
                syncRunEnabled();
                ui.progress(0, 0);
                const bar = $('nsft-ghb-bar'); if (bar) bar.hidden = true;
            }
        });
    }

    const GH_ICON = '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path fill="currentColor" d="M12 .5C5.73.5.5 5.73.5 12c0 5.08 3.29 9.39 7.86 10.91.58.11.79-.25.79-.56 0-.28-.01-1.02-.02-2-3.2.7-3.88-1.54-3.88-1.54-.52-1.33-1.28-1.68-1.28-1.68-1.05-.72.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.73-1.55-2.55-.29-5.24-1.28-5.24-5.68 0-1.25.45-2.28 1.19-3.08-.12-.29-.51-1.46.11-3.05 0 0 .97-.31 3.18 1.18a11.1 11.1 0 0 1 5.8 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.24 2.76.12 3.05.74.8 1.18 1.83 1.18 3.08 0 4.41-2.69 5.38-5.25 5.67.41.36.78 1.06.78 2.14 0 1.55-.01 2.8-.01 3.18 0 .31.21.68.8.56A11.51 11.51 0 0 0 23.5 12C23.5 5.73 18.27.5 12 .5z"/></svg>';
    const TRASH_ICON = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>';
    const EYE_ICON = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>';
    const EYE_OFF_ICON = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><path d="M14.12 14.12a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>';
    const FOLDER_CLOSED = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="#f59e0b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7a2 2 0 0 1 2-2h4l2 3h8a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>';
    const FOLDER_OPEN = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="#f59e0b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7a2 2 0 0 1 2-2h4l2 3h8a2 2 0 0 1 2 2H6a2 2 0 0 0-1.9 1.4L3 18z"/><path d="M3 18l1.9-6.6A2 2 0 0 1 6.8 10H21a2 2 0 0 1 1.9 2.6L21 18a2 2 0 0 1-2 1.4H5a2 2 0 0 1-2-1.4z"/></svg>';

    function esc(v) {
        return String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    }
})();
