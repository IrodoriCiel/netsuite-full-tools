(function () {
    'use strict';
    if (window.top !== window) return;
    if (!/^\/app\//.test(window.location.pathname)) return;

    const STORAGE_KEY = 'enableCsvImportTemplate';
    const NSFT_THEME_KEY = 'nsftTheme';
    const EVENTO = 'nsft-show-csv-import-template';
    const FETCHER_PATH = 'scripts/modules/csv_import_template/csv_import_template_fetcher.js';
    const ENRICH_TIMEOUT_MS = 8000;
    const BODY_PROPERTIES_TO_EXCLUDE = ['_csrf', '_eml_nkey_', '_multibtnstate_', 'nsbrowserenv'];

    const CSVT_FUERA = /^(customform|entryformquerystring|_eml_nkey_)$/i;
    const CSVT_CALC = /^(subtotal|total|taxtotal\d*|tax\d*amt|discounttotal|altshippingcost|althandlingcost|estgrossprofit(percent)?|totalcostestimate|balance|amountremaining|amountpaid|amountunbilled|unbilledorders|giftcertapplied|totalaftertaxes)$/i;
    const FV_TECH = /^(nl|wf|script|submitnext|entryform|customwhence|templatestored|baserecordtype|selectedtab|sys_id|recordid|rectype|nameorig|customform|whence|externalid|version)/i;

    let _theme = 'light';
    let _cargando = false;

    chrome.storage.local.get({ [STORAGE_KEY]: true, [NSFT_THEME_KEY]: 'light' }, (items) => {
        _theme = items[NSFT_THEME_KEY] || 'light';
        if (items[STORAGE_KEY]) activate();
    });

    chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== 'local') return;
        if (changes[STORAGE_KEY]) {
            if (changes[STORAGE_KEY].newValue) activate();
            else deactivate();
        }
        if (changes[NSFT_THEME_KEY]) {
            _theme = changes[NSFT_THEME_KEY].newValue || 'light';
            const caja = document.querySelector('.nsft-csvt');
            if (caja) caja.setAttribute('data-theme', resolveTheme());
        }
    });

    function resolveTheme() {
        return _theme === 'dark' ? 'dark' : 'light';
    }

    function onOpenEvent() { open(); }

    function activate() {
        window.NSFT_CsvTemplate = { open: open };
        window.removeEventListener(EVENTO, onOpenEvent);
        window.addEventListener(EVENTO, onOpenEvent);
    }

    function deactivate() {
        window.removeEventListener(EVENTO, onOpenEvent);
        try { delete window.NSFT_CsvTemplate; } catch (e) { window.NSFT_CsvTemplate = undefined; }
        const velo = document.querySelector('.nsft-csvt-velo');
        if (velo && velo._nsftCierra) velo._nsftCierra();
    }


    function escapeHtml(v) {
        return String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    }

    function csvtTx(k, fb, subs) {
        let s = '';
        try { s = chrome.i18n.getMessage(k, subs) || ''; } catch (e) { s = ''; }
        return s || String(fb).replace(/\$(\d)/g, (_m, n) => (subs || [])[n - 1] || '');
    }

    function aviso(msg, type) {
        const C = window.NSFT_Clipboard;
        if (C && C.showToast) return C.showToast(msg, { type: type || 'success' });
        return { update() { }, close() { } };
    }

    function fvHumanize(key) {
        const dict = csvtTx('ro_k_' + String(key).toLowerCase(), '');
        if (dict) return dict;
        const k = String(key)
            .replace(/^(custbody|custcol|custrecord|custentity|custitem|custevent|custpage)_/, '')
            .replace(/_display$/, '')
            .replace(/_/g, ' ')
            .trim();
        return k.charAt(0).toUpperCase() + k.slice(1);
    }

    function fvIsObj(v) { return v && typeof v === 'object' && !Array.isArray(v); }
    function fvClassify(v) {
        const vacio = v === '' || v === null || v === undefined
            || (Array.isArray(v) && v.length === 0) || (fvIsObj(v) && Object.keys(v).length === 0);
        if (vacio) return 'empty';
        if (Array.isArray(v)) return v.some(fvIsObj) ? 'objectArray' : 'scalarArray';
        if (fvIsObj(v)) return 'object';
        return 'scalar';
    }

    function esPaginaDeRegistro() {
        const RB = window.NSFT_RecordButtons;
        if (RB && RB.isExcludedPage && RB.isExcludedPage()) return false;
        const path = window.location.pathname;
        if (path.startsWith('/app/common/search/')) return false;
        return /\.nl$/i.test(path);
    }


    const shouldExcludeBodyField = (fieldId) => {
        const f = String(fieldId || '').toLowerCase();
        return BODY_PROPERTIES_TO_EXCLUDE.includes(f) || f.startsWith('nsapi') || f.startsWith('nlapi');
    };

    const getXmlValue = (xml, property, returnNode) => {
        try {
            const el = xml.querySelector(property);
            if (el && returnNode) return el;
            if (el) return el.textContent;
            return null;
        } catch (e) {
            return null;
        }
    };

    const fetchWithTimeout = async (url, init) => {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), ENRICH_TIMEOUT_MS);
        try {
            return await fetch(url, { ...init, signal: ctrl.signal });
        } finally {
            clearTimeout(t);
        }
    };

    function pageUrlSinHash() {
        let url = window.location.href;
        const hashIdx = url.indexOf('#');
        if (hashIdx !== -1) url = url.substring(0, hashIdx);
        return url;
    }

    async function cargaBase(noneEdit) {
        let url = pageUrlSinHash();
        url += (url.includes('?') ? '&' : '?') + 'xml=T';
        if (!url.includes('e=T') && !noneEdit) url += '&e=T';

        const response = await fetch(url, { method: 'GET', credentials: 'same-origin', headers: { 'Content-Type': 'application/xml' } });
        if (!response.ok) {
            if (!noneEdit) return cargaBase(true);
            throw new Error(csvtTx('ro_network_error', 'Network response was not ok'));
        }
        const xml = new DOMParser().parseFromString(await response.text(), 'application/xml');
        const el = getXmlValue(xml, 'nsResponse', true) || getXmlValue(xml, 'nlapiResponse', true);
        const record = el && getXmlValue(el, 'record', true);
        if (!record) {
            if (!noneEdit) return cargaBase(true);
            return null;
        }

        const rec = { recordType: null, id: null, bodyFields: {}, lineFields: {} };
        record.getAttributeNames().forEach((attr) => {
            if (attr !== 'fields') rec[attr] = record.getAttribute(attr);
        });
        (record.getAttribute('fields') || '').split(',').forEach((field) => {
            if (!rec.bodyFields[field] && !shouldExcludeBodyField(field)) rec.bodyFields[field] = '';
        });
        Array.from(record.children).forEach((child) => {
            const tagName = child.tagName;
            if (tagName !== 'machine') {
                if (!shouldExcludeBodyField(tagName)) rec.bodyFields[tagName] = getXmlValue(record, tagName);
                return;
            }
            const machineId = child.getAttribute('name');
            const lines = child.children;
            if (!lines || !lines.length) return;
            const template = {};
            (child.getAttribute('fields') || '').split(',').forEach((col) => { template[col] = ''; });
            rec.lineFields[machineId] = Array.from(lines).map((line) => {
                const obj = { ...template };
                Array.from(line.children).forEach((column) => {
                    obj[column.tagName] = column.textContent === 'null' ? '' : column.textContent;
                });
                if (obj.inventorydetail) obj.inventorydetail = '';
                return obj;
            });
        });
        return { rec, baseWasView: !!noneEdit };
    }

    async function cargaVariante(wantEdit) {
        const u = new URL(window.location.href);
        u.hash = '';
        u.searchParams.set('xml', 'T');
        if (wantEdit) u.searchParams.set('e', 'T');
        else u.searchParams.delete('e');
        const resp = await fetchWithTimeout(u.toString(), { headers: { 'Content-Type': 'application/xml' }, credentials: 'same-origin' });
        if (!resp.ok) return null;
        const text = await resp.text();
        const t = text.trim();
        if (t.startsWith('<!DOCTYPE') || t.startsWith('<html')) return null;
        const xml = new DOMParser().parseFromString(text, 'application/xml');
        const el = getXmlValue(xml, 'nsResponse', true) || getXmlValue(xml, 'nlapiResponse', true);
        const record = el && getXmlValue(el, 'record', true);
        if (!record) return null;
        const body = {};
        const sublists = {};
        record.getAttributeNames().forEach((attr) => {
            if (attr !== 'fields') body[attr] = record.getAttribute(attr);
        });
        (record.getAttribute('fields') || '').split(',').forEach((f) => {
            if (f && body[f] === undefined) body[f] = '';
        });
        Array.from(record.children).forEach((child) => {
            if (child.tagName === 'machine') {
                const name = child.getAttribute('name');
                if (!name) return;
                const template = {};
                (child.getAttribute('fields') || '').split(',').forEach((c) => { if (c) template[c] = ''; });
                sublists[name] = Array.from(child.children).map((line) => {
                    const obj = { ...template };
                    Array.from(line.children).forEach((col) => {
                        obj[col.tagName] = col.textContent === 'null' ? '' : col.textContent;
                    });
                    return obj;
                });
            } else {
                body[child.tagName] = child.textContent === 'null' ? '' : child.textContent;
            }
        });
        return { body, sublists };
    }

    async function cargaRest(type, id) {
        const url = '/services/rest/record/v1/' + encodeURIComponent(String(type).toLowerCase())
            + '/' + encodeURIComponent(String(id)) + '?expandSubResources=true';
        const resp = await fetchWithTimeout(url, { headers: { 'Accept': 'application/json' }, credentials: 'same-origin' });
        if (!resp.ok) return null;
        return resp.json();
    }

    const stripRestLinks = (value) => {
        if (Array.isArray(value)) return value.map(stripRestLinks);
        if (value && typeof value === 'object') {
            const out = {};
            Object.entries(value).forEach(([k, v]) => {
                if (k === 'links') return;
                out[k] = stripRestLinks(v);
            });
            return out;
        }
        return value;
    };

    const flattenRestRecord = (json, display) => {
        const body = {};
        const sublists = {};
        Object.entries(json || {}).forEach(([k, v]) => {
            if (k === 'links' || k === 'o:errorDetails') return;
            if (v === null || typeof v !== 'object') { body[k] = v; return; }
            if (Array.isArray(v)) { body[k] = stripRestLinks(v); return; }
            if (Array.isArray(v.items)) {
                sublists[k] = v.items.map((line) => stripRestLinks(line));
                return;
            }
            if ('id' in v && 'links' in v && Object.keys(v).length <= 3) {
                if (v.refName != null && v.refName !== '') display[String(k).toLowerCase()] = String(v.refName);
                body[k] = (v.refName != null && v.refName !== '') ? v.id + ' (' + v.refName + ')' : v.id;
                return;
            }
            body[k] = stripRestLinks(v);
        });
        return { body, sublists };
    };

    const mergeMissingBody = (rec, extraBody) => {
        const have = new Set(Object.keys(rec.bodyFields).map((k) => k.toLowerCase()));
        Object.keys(rec).forEach((k) => have.add(k.toLowerCase()));
        Object.entries(extraBody || {}).forEach(([k, v]) => {
            const lk = k.toLowerCase();
            if (have.has(lk) || shouldExcludeBodyField(lk)) return;
            rec.bodyFields[k] = v;
            have.add(lk);
        });
    };

    const mergeMissingSublists = (rec, sublists) => {
        const haveNames = {};
        Object.keys(rec.lineFields).forEach((k) => { haveNames[k.toLowerCase()] = k; });
        Object.entries(sublists || {}).forEach(([name, lines]) => {
            const existingName = haveNames[name.toLowerCase()];
            if (!existingName) { rec.lineFields[name] = lines; return; }
            const target = rec.lineFields[existingName];
            if (!Array.isArray(target) || target.length !== lines.length) return;
            target.forEach((line, i) => {
                const have = new Set(Object.keys(line).map((k) => k.toLowerCase()));
                Object.entries(lines[i] || {}).forEach(([k, v]) => {
                    if (have.has(k.toLowerCase())) return;
                    line[k] = v;
                });
            });
        });
    };

    const recogeTextosDeCampos = (rec, display) => {
        const body = rec.bodyFields || {};
        Object.keys(body).forEach((k) => {
            const m = String(k).match(/^(.+?)(_display|_text)$/i);
            if (!m) return;
            const texto = body[k];
            if (texto === '' || texto == null) return;
            if (!(m[1] in body)) return;
            const base = m[1].toLowerCase();
            if (!display[base]) display[base] = String(texto);
        });
    };

    function ordena(obj) {
        Object.keys(obj).sort().forEach((k) => { const v = obj[k]; delete obj[k]; obj[k] = v; });
        return obj;
    }

    async function cargaRegistro() {
        const base = await cargaBase(false);
        if (!base) return null;
        const rec = base.rec;
        const display = {};
        const type = rec.recordType;
        const id = rec.id;
        if (type && id) {
            let off = false;
            try {
                const R = window.NSFT_SuiteQLRest;
                off = await Promise.resolve(R && R.isKnownOff ? R.isKnownOff() : false);
            } catch (e) { off = false; }
            const [xmlAlt, restJson] = await Promise.all([
                cargaVariante(base.baseWasView).catch(() => null),
                off ? null : cargaRest(type, id).catch(() => null)
            ]);
            try {
                if (xmlAlt) {
                    mergeMissingBody(rec, xmlAlt.body);
                    mergeMissingSublists(rec, xmlAlt.sublists);
                }
                if (restJson) {
                    const flat = flattenRestRecord(restJson, display);
                    mergeMissingBody(rec, flat.body);
                    mergeMissingSublists(rec, flat.sublists);
                }
            } catch (e) { }
        }
        recogeTextosDeCampos(rec, display);
        ordena(rec.bodyFields);
        ordena(rec.lineFields);
        Object.keys(rec.lineFields).forEach((k) => {
            const ls = rec.lineFields[k];
            if (Array.isArray(ls)) ls.forEach((l) => { if (fvIsObj(l)) ordena(l); });
        });
        return { rec, display };
    }

    let _fetcher = 'none';
    const _cola = [];
    const _espera = {};
    let _seq = 0;

    window.addEventListener('message', (e) => {
        if (e.source !== window) return;
        const d = e.data;
        if (!d || d.dest !== 'extension_csvt' || !d.reqId) return;
        const cb = _espera[d.reqId];
        if (cb) { delete _espera[d.reqId]; cb(d.payload); }
    });

    function cargaFetcher() {
        if (_fetcher !== 'none') return;
        _fetcher = 'loading';
        const s = document.createElement('script');
        s.async = false;
        s.src = chrome.runtime.getURL(FETCHER_PATH);
        s.onload = function () {
            this.remove();
            _fetcher = 'ready';
            _cola.splice(0).forEach((fn) => fn());
        };
        s.onerror = function () {
            this.remove();
            _fetcher = 'error';
            _cola.splice(0).forEach((fn) => fn());
        };
        if (window.NSFT_AfterLoad && window.NSFT_AfterLoad.flush) window.NSFT_AfterLoad.flush();
        (window.NSFT_AfterLoad ? window.NSFT_AfterLoad.append(s) : (document.head || document.documentElement).appendChild(s));
    }

    function csvtColsViaFetcher(sub) {
        return new Promise((resolve) => {
            const enviar = () => {
                if (_fetcher !== 'ready') { resolve([]); return; }
                const reqId = 'csvt' + (++_seq) + '_' + Date.now();
                const t = setTimeout(() => { delete _espera[reqId]; resolve([]); }, 3000);
                _espera[reqId] = (p) => { clearTimeout(t); resolve(p && Array.isArray(p.cols) ? p.cols : []); };
                window.postMessage({ dest: 'fetcher_csvt', type: 'cols', reqId, payload: { sub } }, '*');
            };
            if (_fetcher === 'ready' || _fetcher === 'error') enviar();
            else {
                _cola.push(enviar);
                cargaFetcher();
                setTimeout(() => {
                    const i = _cola.indexOf(enviar);
                    if (i !== -1) { _cola.splice(i, 1); resolve([]); }
                }, 5000);
            }
        });
    }


    function csvtCabecera(body) {
        const cols = [];
        const vistos = new Set();
        document.querySelectorAll('.uir-field-wrapper[data-field-name]').forEach((w) => {
            const ctx = w.getAttribute('data-field-context');
            if (ctx && ctx !== 'body') return;
            const id = String(w.getAttribute('data-field-name') || '').toLowerCase();
            if (!id || vistos.has(id) || CSVT_FUERA.test(id) || CSVT_CALC.test(id) || FV_TECH.test(id) || !(id in body)) return;
            vistos.add(id);
            cols.push({ id, label: w.getAttribute('data-nsps-label') || fvHumanize(id), req: w.getAttribute('data-required') === 'true' });
        });
        if (!cols.length) {
            Object.keys(body).forEach((k) => {
                if (CSVT_FUERA.test(k) || CSVT_CALC.test(k) || FV_TECH.test(k) || /(_display|_text)$/i.test(k) || fvClassify(body[k]) !== 'scalar') return;
                cols.push({ id: k, label: fvHumanize(k), req: false });
            });
        }
        return cols;
    }

    function csvtLinea(sub, lineas, remotas) {
        const enAlguna = (id) => lineas.some((l) => l && Object.prototype.hasOwnProperty.call(l, id));
        if (remotas && remotas.length) return remotas.filter((c) => enAlguna(c.id));
        const cols = [];
        const pref = 'columnheader_' + sub + '_';
        document.querySelectorAll('[data-nsps-id^="' + pref + '"]').forEach((td) => {
            const id = String(td.getAttribute('data-nsps-id')).slice(pref.length).toLowerCase();
            if (!id || cols.some((c) => c.id === id) || !enAlguna(id)) return;
            cols.push({ id, label: td.getAttribute('data-label') || fvHumanize(id), req: !!td.querySelector('.uir-required-icon') });
        });
        if (!cols.length) {
            const ids = [];
            lineas.forEach((l) => Object.keys(l || {}).forEach((k) => {
                if (ids.indexOf(k) < 0 && !/(_display|_text)$/i.test(k) && fvClassify(l[k]) === 'scalar') ids.push(k);
            }));
            ids.forEach((k) => cols.push({ id: k, label: fvHumanize(k), req: false }));
        }
        return cols;
    }

    function csvtValor(fuente, id, conIds, esCabecera, display) {
        if (!fuente) return '';
        const crudo = fuente[id];
        if (crudo == null || typeof crudo === 'object') return '';
        if (conIds) return String(crudo);
        const texto = (esCabecera && display[id]) || fuente[id + '_display'] || fuente[id + '_text'];
        return String(texto != null && texto !== '' ? texto : crudo);
    }

    function csvtFilas(datos, opt, remotas) {
        const rec = datos.rec;
        const body = rec.bodyFields || {};
        const lineas = (opt.sub && Array.isArray((rec.lineFields || {})[opt.sub])) ? rec.lineFields[opt.sub] : [];
        const cab = csvtCabecera(body);
        const lin = opt.sub ? csvtLinea(opt.sub, lineas, remotas) : [];
        const filasDatos = (lineas.length ? lineas : [null]).map((l) =>
            cab.map((c) => csvtValor(body, c.id, opt.ids, true, datos.display))
                .concat(lin.map((c) => csvtValor(l, c.id, opt.ids, false, datos.display))));
        let cols = cab.concat(lin.map((c) => Object.assign({}, c, { sub: opt.sub })));
        if (opt.soloConValor) {
            const vivas = cols.map((_c, i) => filasDatos.some((f) => f[i] !== ''));
            cols = cols.filter((_c, i) => vivas[i]);
            for (let r = 0; r < filasDatos.length; r++) filasDatos[r] = filasDatos[r].filter((_v, i) => vivas[i]);
        }
        const cabecera = cols.map((c) => (opt.cabIds ? (c.sub ? c.sub + '.' + c.id : c.id) : c.label));
        return { cols, cabecera, filas: filasDatos };
    }

    function csvtCelda(v, sep) {
        const s = String(v == null ? '' : v);
        return (s.indexOf(sep) >= 0 || /["\r\n]/.test(s)) ? '"' + s.replace(/"/g, '""') + '"' : s;
    }


    async function open() {
        if (_cargando) return;
        if (document.querySelector('.nsft-csvt-velo')) return;
        if (!esPaginaDeRegistro()) {
            aviso(csvtTx('ro_csvt_not_record', 'This page is not a record: open one to build its import template.'), 'info');
            return;
        }
        _cargando = true;
        const t = aviso(csvtTx('ro_loading_record', 'Loading record...'), 'loading');
        let datos = null;
        try {
            datos = await cargaRegistro();
        } catch (e) {
            _cargando = false;
            t.update(csvtTx('ro_load_error', 'Could not load record XML.'), { type: 'error' });
            return;
        }
        _cargando = false;
        if (!datos) {
            t.update(csvtTx('ro_csvt_not_record', 'This page is not a record: open one to build its import template.'), { type: 'info' });
            return;
        }
        t.close();
        abrePlantillaCsv(datos);
    }

    function abrePlantillaCsv(datos) {
        const rec = datos.rec;
        const subs = Object.keys(rec.lineFields || {}).filter((k) => Array.isArray(rec.lineFields[k]) && rec.lineFields[k].length);
        const opt = { sub: subs.indexOf('item') >= 0 ? 'item' : (subs[0] || ''), ids: false, cabIds: false, soloConValor: true };
        const edicion = /[?&]e=T/i.test(window.location.search);

        const velo = document.createElement('div');
        velo.className = 'nsft-modal-backdrop nsft-csvt-velo';
        velo.setAttribute('data-nsft-ui', '');
        velo.innerHTML = `
      <div class="nsft-csvt nsft-w nsft-caja-barra" role="dialog" aria-modal="true" data-theme="${resolveTheme()}">
        <div class="nsft-barra-titulo">
          <span class="nsft-titulo"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2"></rect><path d="M3 10h18M9 4v16"></path></svg>${escapeHtml(csvtTx('ro_csvt_title', 'CSV import template'))}</span>
          <button type="button" class="nsft-cerrar" title="${escapeHtml(csvtTx('ro_close', 'Close'))}">✕</button>
        </div>
        <div class="nsft-csvt-opts">
          <label>${escapeHtml(csvtTx('ro_csvt_sublist', 'Sublist'))}
            <select class="nsft-csvt-sub">
              <option value="">${escapeHtml(csvtTx('ro_csvt_none', 'Header only'))}</option>
              ${subs.map((s) => `<option value="${escapeHtml(s)}">${escapeHtml(fvHumanize(s))} (${rec.lineFields[s].length})</option>`).join('')}
            </select>
          </label>
          <label class="nsft-csvt-chk"><input type="checkbox" data-o="soloConValor" checked> ${escapeHtml(csvtTx('ro_csvt_only_values', 'Only columns with a value'))}</label>
          <label class="nsft-csvt-chk"><input type="checkbox" data-o="ids"> ${escapeHtml(csvtTx('ro_csvt_ids', 'Internal IDs instead of names'))}</label>
          <label class="nsft-csvt-chk"><input type="checkbox" data-o="cabIds"> ${escapeHtml(csvtTx('ro_csvt_head_ids', 'Field IDs as headers'))}</label>
        </div>
        <div class="nsft-csvt-meta"></div>
        <div class="nsft-csvt-tabla"></div>
        <p class="nsft-csvt-nota">${escapeHtml(edicion
            ? csvtTx('ro_csvt_note_edit', 'The columns marked * are required. The headers are the form labels, so the import assistant maps them on its own.')
            : csvtTx('ro_csvt_note_view', 'The headers are the form labels, so the import assistant maps them on its own. Open the record in edit mode to see which ones are required (*).'))}</p>
        <div class="nsft-csvt-pie">
          <button type="button" class="nsft-dlg-btn nsft-dlg-btn-cancel" data-a="copiar">${escapeHtml(csvtTx('ro_csvt_copy', 'Copy'))}</button>
          <button type="button" class="nsft-dlg-btn nsft-dlg-btn-ok" data-a="bajar">${escapeHtml(csvtTx('ro_csvt_download', 'Download CSV'))}</button>
        </div>
      </div>`;
        document.body.appendChild(velo);
        const caja = velo.querySelector('.nsft-csvt');
        const sel = caja.querySelector('.nsft-csvt-sub');
        sel.value = opt.sub;

        let actual = null;
        const remotas = {};
        const pinta = () => {
            if (opt.sub && edicion && !(opt.sub in remotas)) {
                remotas[opt.sub] = null;
                const sub = opt.sub;
                csvtColsViaFetcher(sub).then((cols) => { remotas[sub] = cols; if (velo.isConnected && opt.sub === sub) pinta(); });
            }
            actual = csvtFilas(datos, opt, remotas[opt.sub]);
            const MAX = 8;
            const th = actual.cols.map((c, i) => `<th title="${escapeHtml(c.sub ? c.sub + '.' + c.id : c.id)}">${escapeHtml(actual.cabecera[i])}${c.req ? ' <span class="nsft-csvt-req">*</span>' : ''}</th>`).join('');
            const tr = actual.filas.slice(0, MAX).map((f) => '<tr>' + f.map((v) => `<td>${escapeHtml(v)}</td>`).join('') + '</tr>').join('');
            caja.querySelector('.nsft-csvt-tabla').innerHTML = actual.cols.length
                ? `<table><thead><tr>${th}</tr></thead><tbody>${tr}</tbody></table>`
                : '';
            caja.querySelector('.nsft-csvt-meta').textContent = csvtTx('ro_csvt_meta', '$1 columns · $2 rows', [String(actual.cols.length), String(actual.filas.length)])
                + (actual.filas.length > MAX ? ' · ' + csvtTx('ro_csvt_preview_cut', 'preview of the first $1', [String(MAX)]) : '');
        };

        const cierra = () => { document.removeEventListener('keydown', alTeclado, true); velo.remove(); };
        const alTeclado = (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); cierra(); } };
        velo._nsftCierra = cierra;
        document.addEventListener('keydown', alTeclado, true);
        velo.addEventListener('mousedown', (e) => { if (e.target === velo) cierra(); });
        caja.querySelector('.nsft-cerrar').addEventListener('click', cierra);
        sel.addEventListener('change', () => { opt.sub = sel.value; pinta(); });
        caja.querySelectorAll('input[data-o]').forEach((cb) => cb.addEventListener('change', () => { opt[cb.dataset.o] = cb.checked; pinta(); }));

        caja.querySelector('[data-a="copiar"]').addEventListener('click', () => {
            const tsv = [actual.cabecera].concat(actual.filas).map((f) => f.map((v) => csvtCelda(v, '\t')).join('\t')).join('\n');
            if (window.NSFT_Clipboard) window.NSFT_Clipboard.copy(tsv, { toast: { message: csvtTx('ro_csvt_copied', 'Template copied: paste it into Excel or Sheets'), preview: false } });
        });
        caja.querySelector('[data-a="bajar"]').addEventListener('click', () => {
            const csv = [actual.cabecera].concat(actual.filas).map((f) => f.map((v) => csvtCelda(v, ',')).join(',')).join('\r\n');
            const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${rec.recordType || 'record'}-${rec.id || 'nuevo'}-${csvtTx('ro_csvt_file', 'template')}.csv`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
            aviso(csvtTx('ro_export_done', 'Download started.'), 'success');
        });

        pinta();
        try { sel.focus(); } catch (e) { }
    }
})();
