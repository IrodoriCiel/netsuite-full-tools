(function () {
    'use strict';

    const STORAGE_KEY = 'enableBetterExport';
    const FETCHER_PATH = 'scripts/modules/better_export/better_export_fetcher.js';
    const FETCHER_DEST = 'fetcher_bexp';
    const REPLY_DEST = 'extension_bexp';

    if (!/^\/app\//.test(location.pathname)) return;
    if (!document.querySelector('[data-button-code="exportXLS"]')) return;
    try {
        if (window.NSFT_RecordButtons && NSFT_RecordButtons.isExcludedPage && NSFT_RecordButtons.isExcludedPage()) return;
    } catch (e) { }

    const t = (k, f, sus) => {
        try { return chrome.i18n.getMessage(k, sus) || f; } catch (e) { return f; }
    };

    const HOJA = (borde, tinte) => '<path d="M3 1h10.5l3.5 3.5V17H3z" fill="' + tinte + '" stroke="' + borde + '" stroke-width="2"/>'
        + '<path d="M12.5 1v4.5H17" fill="none" stroke="' + borde + '" stroke-width="1"/>';
    const ICONOS = {
        excel: '<svg viewBox="0 0 20 18" shape-rendering="crispEdges" aria-hidden="true">' + HOJA('#51914C', '#F1F8E6')
            + '<rect x="5" y="7" width="9" height="2" fill="#34710F"/>'
            + '<path d="M5 10.5h9M5 12.5h9M5 14.5h9M7.5 9v6M10.5 9v6" stroke="#71B76C" stroke-width="1"/></svg>',
        json: '<svg viewBox="0 0 20 18" aria-hidden="true"><g shape-rendering="crispEdges">' + HOJA('#C98A1B', '#FDF5E4') + '</g>'
            + '<text x="9.6" y="14.6" text-anchor="middle" font-family="Consolas,Menlo,monospace" font-size="8"'
            + ' font-weight="700" fill="#8A5A00">{}</text></svg>',
        csv: '<svg viewBox="0 0 20 18" shape-rendering="crispEdges" aria-hidden="true">' + HOJA('#0F766E', '#E6F4F1')
            + '<path d="M5 8.5h3M9.5 8.5h4.5M5 11.5h3M9.5 11.5h4.5M5 14.5h3M9.5 14.5h4.5" stroke="#0F766E" stroke-width="1"/></svg>',
        copiar: '<svg viewBox="0 0 20 18" shape-rendering="crispEdges" aria-hidden="true">' + HOJA('#4A7FC1', '#EAF2FB')
            + '<rect x="5.5" y="7.5" width="5" height="6" fill="#EAF2FB" stroke="#1F5FA8"/>'
            + '<rect x="8.5" y="9.5" width="5" height="6" fill="#fff" stroke="#1F5FA8"/></svg>'
    };

    let listo = null;

    chrome.storage.local.get({ [STORAGE_KEY]: true }, (it) => {
        if (it[STORAGE_KEY]) monta();
    });

    chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== 'local' || !changes[STORAGE_KEY]) return;
        if (changes[STORAGE_KEY].newValue === false) quita();
        else monta();
    });

    function monta() {
        if (document.querySelector('.nsft-bexp-td')) return;
        const exps = document.querySelectorAll('[data-button-code^="export"]');
        const ultimo = exps.length ? exps[exps.length - 1].closest('td') : null;
        if (!ultimo) return;

        const td = document.createElement('td');
        td.className = 'nsft-bexp-td';
        const sep = document.createElement('span');
        sep.className = 'nsft-bexp-sep';
        const logo = document.createElement('img');
        logo.className = 'nsft-bexp-logo';
        logo.src = chrome.runtime.getURL('assets/img/logomini.png');
        logo.alt = '';
        logo.title = 'NetSuite Full Tools';
        td.append(sep, logo,
            boton('excel', t('bexp_excel', 'Excel'), t('bexp_excel_title', 'Download the Excel with the header row frozen, filters and columns sized to fit')),
            boton('csv', t('bexp_csv', 'CSV'), t('bexp_csv_title', 'Download the CSV ready for Excel: accents and ñ read correctly')),
            boton('json', t('bexp_json', 'JSON'), t('bexp_json_title', 'Download every row of the list as JSON')),
            boton('copiar', t('bexp_copy', 'Copy'), t('bexp_copy_title', 'Copy the list as a table, to paste into Excel or Google Sheets'))
        );
        ultimo.after(td);
    }

    function quita() {
        document.querySelectorAll('.nsft-bexp-td').forEach((el) => el.remove());
    }

    function boton(accion, nombre, titulo) {
        const b = document.createElement('div');
        b.className = 'nsft-bexp-ico';
        b.setAttribute('role', 'button');
        b.tabIndex = 0;
        b.title = 'NSFT · ' + titulo;
        b.setAttribute('aria-label', 'NSFT · ' + nombre + ' — ' + titulo);
        b.innerHTML = ICONOS[accion];
        b.addEventListener('click', () => lanza(b, accion));
        b.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); lanza(b, accion); }
        });
        return b;
    }

    async function lanza(btn, accion) {
        const td = btn.closest('.nsft-bexp-td');
        if (!td || td.classList.contains('is-busy')) return;
        td.classList.add('is-busy');
        btn.classList.add('is-working');
        try {
            if (accion === 'csv') { await guardaCsv(); return; }
            const libro = await bajaLibro();
            if (accion === 'excel') await guardaExcel(libro);
            else if (accion === 'json') guardaJson(libro.tabla);
            else await copia(libro.tabla);
        } catch (e) {
            avisa(t('bexp_error', 'The export could not finish: $1', [String((e && e.message) || e)]), 'error');
        } finally {
            td.classList.remove('is-busy');
            btn.classList.remove('is-working');
        }
    }

    function avisa(msg, tipo) {
        const C = window.NSFT_Clipboard;
        if (C && C.showToast) C.showToast(msg, { type: tipo || 'info', duration: 3500 });
    }


    function fetcherListo() {
        if (listo) return listo;
        listo = new Promise((resolver, rechazar) => {
            const s = document.createElement('script');
            s.id = 'nsft-better-export-fetcher';
            s.src = chrome.runtime.getURL(FETCHER_PATH);
            s.async = false;
            s.onload = () => resolver();
            s.onerror = () => { listo = null; rechazar(new Error('fetcher')); };
            (document.head || document.documentElement).appendChild(s);
        });
        return listo;
    }

    async function direccion() {
        await fetcherListo();
        const reqId = 'bexp' + Date.now() + Math.random().toString(36).slice(2);
        return new Promise((resolver, rechazar) => {
            const tope = setTimeout(() => { window.removeEventListener('message', oye); rechazar(new Error('fetcher')); }, 8000);
            function oye(ev) {
                if (ev.source !== window || !ev.data || ev.data.dest !== REPLY_DEST || ev.data.reqId !== reqId) return;
                clearTimeout(tope);
                window.removeEventListener('message', oye);
                resolver(String(ev.data.url || ''));
            }
            window.addEventListener('message', oye);
            window.postMessage({ dest: FETCHER_DEST, reqId: reqId }, '*');
        });
    }

    async function bajaLibro() {
        const url = await direccion();
        let u = null;
        try { u = new URL(url); } catch (e) { u = null; }
        if (!u || u.origin !== location.origin) throw new Error(t('bexp_no_url', 'this page has no export'));
        const res = await fetch(u.href, { credentials: 'same-origin' });
        if (!res.ok) throw new Error('http ' + res.status);
        if (/\/app\/login\//i.test(res.url || '')) throw new Error(t('bexp_session', 'the session expired'));
        const bytes = new Uint8Array(await res.arrayBuffer());
        if (bytes[0] === 0x50 && bytes[1] === 0x4b) {
            const archivos = await leeZip(bytes);
            return { archivos: archivos, tabla: tablaDeXlsx(archivos) };
        }
        const texto = new TextDecoder('utf-8').decode(bytes);
        if (!/urn:schemas-microsoft-com:office:spreadsheet/.test(texto)) {
            throw new Error(t('bexp_not_excel', 'NetSuite did not return a spreadsheet'));
        }
        return { archivos: null, tabla: tablaDeSpreadsheetMl(texto) };
    }

    async function leeZip(b) {
        const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
        let fin = -1;
        for (let i = b.length - 22; i >= Math.max(0, b.length - 65557); i--) {
            if (dv.getUint32(i, true) === 0x06054b50) { fin = i; break; }
        }
        if (fin < 0) throw new Error('zip');
        const n = dv.getUint16(fin + 10, true);
        let p = dv.getUint32(fin + 16, true);
        const out = {};
        for (let k = 0; k < n; k++) {
            if (dv.getUint32(p, true) !== 0x02014b50) throw new Error('zip');
            const metodo = dv.getUint16(p + 10, true);
            const tam = dv.getUint32(p + 20, true);
            const ln = dv.getUint16(p + 28, true);
            const lx = dv.getUint16(p + 30, true);
            const lc = dv.getUint16(p + 32, true);
            const off = dv.getUint32(p + 42, true);
            const nombre = new TextDecoder().decode(b.subarray(p + 46, p + 46 + ln));
            const ini = off + 30 + dv.getUint16(off + 26, true) + dv.getUint16(off + 28, true);
            const datos = b.slice(ini, ini + tam);
            if (metodo === 0) out[nombre] = datos;
            else if (metodo === 8) out[nombre] = await transforma(datos, new DecompressionStream('deflate-raw'));
            else throw new Error('zip ' + metodo);
            p += 46 + ln + lx + lc;
        }
        return out;
    }

    async function transforma(datos, flujo) {
        const buf = await new Response(new Blob([datos]).stream().pipeThrough(flujo)).arrayBuffer();
        return new Uint8Array(buf);
    }

    let _crc = null;
    function crc32(b) {
        if (!_crc) {
            _crc = new Uint32Array(256);
            for (let i = 0; i < 256; i++) {
                let c = i;
                for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
                _crc[i] = c >>> 0;
            }
        }
        let c = 0xFFFFFFFF;
        for (let i = 0; i < b.length; i++) c = _crc[(c ^ b[i]) & 0xFF] ^ (c >>> 8);
        return (c ^ 0xFFFFFFFF) >>> 0;
    }

    async function escribeZip(entradas) {
        const enc = new TextEncoder();
        const d = new Date();
        const hora = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
        const dia = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
        const partes = [];
        const central = [];
        let off = 0;
        for (const [nombre, datos] of entradas) {
            const nb = enc.encode(nombre);
            const comp = await transforma(datos, new CompressionStream('deflate-raw'));
            const crc = crc32(datos);
            const cab = new DataView(new ArrayBuffer(30));
            cab.setUint32(0, 0x04034b50, true);
            cab.setUint16(4, 20, true);
            cab.setUint16(6, 0x0800, true);
            cab.setUint16(8, 8, true);
            cab.setUint16(10, hora, true);
            cab.setUint16(12, dia, true);
            cab.setUint32(14, crc, true);
            cab.setUint32(18, comp.length, true);
            cab.setUint32(22, datos.length, true);
            cab.setUint16(26, nb.length, true);
            partes.push(new Uint8Array(cab.buffer), nb, comp);
            const cen = new DataView(new ArrayBuffer(46));
            cen.setUint32(0, 0x02014b50, true);
            cen.setUint16(4, 20, true);
            cen.setUint16(6, 20, true);
            cen.setUint16(8, 0x0800, true);
            cen.setUint16(10, 8, true);
            cen.setUint16(12, hora, true);
            cen.setUint16(14, dia, true);
            cen.setUint32(16, crc, true);
            cen.setUint32(20, comp.length, true);
            cen.setUint32(24, datos.length, true);
            cen.setUint16(28, nb.length, true);
            cen.setUint32(42, off, true);
            central.push(new Uint8Array(cen.buffer), nb);
            off += 30 + nb.length + comp.length;
        }
        const tamCentral = central.reduce((s, x) => s + x.length, 0);
        const fin = new DataView(new ArrayBuffer(22));
        fin.setUint32(0, 0x06054b50, true);
        fin.setUint16(8, entradas.length, true);
        fin.setUint16(10, entradas.length, true);
        fin.setUint32(12, tamCentral, true);
        fin.setUint32(16, off, true);
        return new Blob(partes.concat(central, [new Uint8Array(fin.buffer)]),
            { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    }

    const texto = (b) => new TextDecoder('utf-8').decode(b);
    const xml = (s) => new DOMParser().parseFromString(s, 'application/xml');

    function hojaDe(archivos) {
        if (archivos['xl/worksheets/sheet1.xml']) return 'xl/worksheets/sheet1.xml';
        return Object.keys(archivos).filter((n) => /^xl\/worksheets\/[^/]+\.xml$/.test(n)).sort()[0] || '';
    }

    function columna(ref) {
        const m = /^([A-Z]+)/.exec(String(ref || ''));
        if (!m) return -1;
        let n = 0;
        for (const ch of m[1]) n = n * 26 + (ch.charCodeAt(0) - 64);
        return n - 1;
    }

    function letra(n) {
        let s = '';
        for (n += 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
        return s;
    }

    function esFormatoFecha(id, propios) {
        if ((id >= 14 && id <= 22) || (id >= 27 && id <= 36) || (id >= 45 && id <= 47) || (id >= 50 && id <= 58)) return true;
        const code = propios[id];
        if (!code) return false;
        const limpio = code.replace(/"[^"]*"/g, '').replace(/\[[^\]]*\]/g, '');
        return /[dmyhs]/i.test(limpio) && !/^general$/i.test(limpio.trim());
    }

    function tablaDeXlsx(archivos) {
        const comunes = [];
        if (archivos['xl/sharedStrings.xml']) {
            const ds = xml(texto(archivos['xl/sharedStrings.xml']));
            Array.from(ds.getElementsByTagName('si')).forEach((si) => comunes.push(si.textContent));
        }
        const fechas = new Set();
        if (archivos['xl/styles.xml']) {
            const ds = xml(texto(archivos['xl/styles.xml']));
            const propios = {};
            Array.from(ds.getElementsByTagName('numFmt')).forEach((f) => {
                propios[Number(f.getAttribute('numFmtId'))] = f.getAttribute('formatCode') || '';
            });
            const xfs = ds.getElementsByTagName('cellXfs')[0];
            if (xfs) {
                Array.from(xfs.getElementsByTagName('xf')).forEach((xf, i) => {
                    if (esFormatoFecha(Number(xf.getAttribute('numFmtId') || 0), propios)) fechas.add(i);
                });
            }
        }
        const hoja = hojaDe(archivos);
        if (!hoja) throw new Error(t('bexp_not_excel', 'NetSuite did not return a spreadsheet'));
        const dh = xml(texto(archivos[hoja]));
        const filas = [];
        Array.from(dh.getElementsByTagName('row')).forEach((row) => {
            const fila = [];
            Array.from(row.getElementsByTagName('c')).forEach((c, i) => {
                const col = c.hasAttribute('r') ? columna(c.getAttribute('r')) : i;
                const tipo = c.getAttribute('t') || 'n';
                const vEl = c.getElementsByTagName('v')[0];
                const v = vEl ? vEl.textContent : '';
                let celda = null;
                if (tipo === 'inlineStr') {
                    const is = c.getElementsByTagName('is')[0];
                    const s = is ? is.textContent : '';
                    celda = s === '' ? null : { v: s, tipo: 't' };
                } else if (tipo === 's') {
                    const s = comunes[Number(v)] || '';
                    celda = s === '' ? null : { v: s, tipo: 't' };
                } else if (tipo === 'b') {
                    celda = v === '' ? null : { v: v === '1', tipo: 'b' };
                } else if (tipo === 'str' || tipo === 'e') {
                    celda = v === '' ? null : { v: v, tipo: 't' };
                } else if (v !== '') {
                    const num = Number(v);
                    const fecha = fechas.has(Number(c.getAttribute('s') || 0));
                    celda = isFinite(num) ? { v: num, tipo: fecha ? 'f' : 'n' } : { v: v, tipo: 't' };
                }
                fila[col] = celda;
            });
            filas.push(fila);
        });
        return aTabla(filas);
    }

    function tablaDeSpreadsheetMl(s) {
        const NS = 'urn:schemas-microsoft-com:office:spreadsheet';
        const d = xml(s);
        if (d.getElementsByTagName('parsererror').length) throw new Error(t('bexp_not_excel', 'NetSuite did not return a spreadsheet'));
        const hoja = d.getElementsByTagNameNS(NS, 'Worksheet')[0];
        const filas = [];
        Array.from(hoja ? hoja.getElementsByTagNameNS(NS, 'Row') : []).forEach((row) => {
            const fila = [];
            let col = 0;
            Array.from(row.getElementsByTagNameNS(NS, 'Cell')).forEach((c) => {
                const idx = c.getAttributeNS(NS, 'Index');
                if (idx) col = Number(idx) - 1;
                const data = c.getElementsByTagNameNS(NS, 'Data')[0];
                const tipo = data ? data.getAttributeNS(NS, 'Type') : '';
                const v = data ? data.textContent : '';
                let celda = null;
                if (v !== '') {
                    if (tipo === 'Number' && isFinite(Number(v))) celda = { v: Number(v), tipo: 'n' };
                    else if (tipo === 'DateTime') {
                        const ms = Date.parse(v.replace(/(\.\d+)?$/, '') + 'Z');
                        celda = isFinite(ms) ? { v: ms / 86400000 + 25569, tipo: 'f' } : { v: v, tipo: 't' };
                    } else if (tipo === 'Boolean') celda = { v: v === '1', tipo: 'b' };
                    else celda = { v: v, tipo: 't' };
                }
                fila[col] = celda;
                col += 1 + Number(c.getAttributeNS(NS, 'MergeAcross') || 0);
            });
            filas.push(fila);
        });
        return aTabla(filas);
    }

    function aTabla(filas) {
        const conAlgo = filas.filter((f) => f.some((c) => c));
        const cab = conAlgo.shift() || [];
        const ancho = conAlgo.reduce((m, f) => Math.max(m, f.length), cab.length);
        const titulos = [];
        for (let i = 0; i < ancho; i++) titulos.push(cab[i] ? String(cab[i].v) : letra(i));
        return { titulos: titulos, filas: conAlgo.map((f) => { const r = []; for (let i = 0; i < ancho; i++) r.push(f[i] || null); return r; }) };
    }

    function fechaIso(serie) {
        const d = new Date(Math.round((serie - 25569) * 86400000));
        const p = (n) => String(n).padStart(2, '0');
        const dia = d.getUTCFullYear() + '-' + p(d.getUTCMonth() + 1) + '-' + p(d.getUTCDate());
        return (serie % 1) ? dia + ' ' + p(d.getUTCHours()) + ':' + p(d.getUTCMinutes()) : dia;
    }

    function aTexto(c, decimal) {
        if (!c) return '';
        if (c.tipo === 'f') return fechaIso(c.v);
        if (c.tipo === 'n') return decimal && decimal !== '.' ? String(c.v).replace('.', decimal) : String(c.v);
        if (c.tipo === 'b') return c.v ? 'TRUE' : 'FALSE';
        return String(c.v);
    }

    function anchos(tabla) {
        return tabla.titulos.map((tit, i) => {
            let max = String(tit).length + 2;
            const hasta = Math.min(tabla.filas.length, 2000);
            for (let k = 0; k < hasta; k++) {
                const s = aTexto(tabla.filas[k][i]);
                const largo = s.indexOf('\n') >= 0 ? Math.max.apply(null, s.split('\n').map((x) => x.length)) : s.length;
                if (largo > max) max = largo;
            }
            return Math.max(6, Math.min(60, max + 2));
        });
    }

    const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

    async function guardaExcel(libro) {
        const blob = libro.archivos ? await pule(libro.archivos, libro.tabla) : await escribeXlsx(libro.tabla);
        descarga(blob, nombre('xlsx'));
    }

    async function pule(archivos, tabla) {
        const hoja = hojaDe(archivos);
        const enc = new TextEncoder();
        const nFilas = tabla.filas.length + 1;
        const rango = 'A1:' + letra(Math.max(0, tabla.titulos.length - 1)) + nFilas;
        let s = texto(archivos[hoja]);

        if (!/<pane\b/.test(s)) {
            const PANE = '<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>'
                + '<selection pane="bottomLeft" activeCell="A2" sqref="A2"/>';
            if (/<sheetView\b[^>]*\/>/.test(s)) {
                s = s.replace(/<sheetView\b([^>]*)\/>/, '<sheetView$1>' + PANE + '</sheetView>');
            } else if (!/<sheetViews\b/.test(s)) {
                const vista = '<sheetViews><sheetView workbookViewId="0">' + PANE + '</sheetView></sheetViews>';
                s = /<dimension\b[^>]*\/>/.test(s) ? s.replace(/(<dimension\b[^>]*\/>)/, '$1' + vista) : s.replace(/(<sheetFormatPr\b|<cols\b|<sheetData\b)/, vista + '$1');
            }
        }
        if (!/<cols\b/.test(s)) {
            const cols = '<cols>' + anchos(tabla).map((w, i) => '<col min="' + (i + 1) + '" max="' + (i + 1) + '" width="' + w + '" customWidth="1"/>').join('') + '</cols>';
            s = s.replace(/<sheetData\b/, cols + '<sheetData');
        }
        let conFiltro = false;
        if (!/<autoFilter\b/.test(s) && tabla.filas.length) {
            const tras = s.match(/<\/(?:scenarios|protectedRanges|sheetProtection|sheetCalcPr)>|<(?:scenarios|protectedRanges|sheetProtection|sheetCalcPr)\b[^>]*\/>/g);
            const ancla = tras ? tras[tras.length - 1] : '</sheetData>';
            const i = s.lastIndexOf(ancla) + ancla.length;
            s = s.slice(0, i) + '<autoFilter ref="' + rango + '"/>' + s.slice(i);
            conFiltro = true;
        }
        archivos[hoja] = enc.encode(s);

        if (conFiltro && archivos['xl/workbook.xml']) {
            let w = texto(archivos['xl/workbook.xml']);
            const m = /<sheet\b[^>]*\bname="([^"]*)"/.exec(w);
            if (m && !/_xlnm\._FilterDatabase/.test(w)) {
                const nombreHoja = m[1].replace(/&apos;/g, "'").replace(/'/g, "''");
                const ref = "'" + nombreHoja + "'!" + rango.replace(/([A-Z]+)(\d+)/g, '$$$1$$$2');
                const def = '<definedName name="_xlnm._FilterDatabase" localSheetId="0" hidden="1">' + ref + '</definedName>';
                if (/<definedNames>/.test(w)) w = w.replace('<definedNames>', '<definedNames>' + def);
                else w = w.replace('</sheets>', '</sheets><definedNames>' + def + '</definedNames>');
                archivos['xl/workbook.xml'] = enc.encode(w);
            }
        }
        const nombres = Object.keys(archivos).sort((a, b) => (a === '[Content_Types].xml' ? -1 : b === '[Content_Types].xml' ? 1 : 0));
        return escribeZip(nombres.map((n) => [n, archivos[n]]));
    }

    async function escribeXlsx(tabla) {
        const enc = new TextEncoder();
        const celda = (c, ref, s) => {
            if (!c) return '';
            if (c.tipo === 'n') return '<c r="' + ref + '"><v>' + c.v + '</v></c>';
            if (c.tipo === 'f') return '<c r="' + ref + '" s="2"><v>' + c.v + '</v></c>';
            if (c.tipo === 'b') return '<c r="' + ref + '" t="b"><v>' + (c.v ? 1 : 0) + '</v></c>';
            return '<c r="' + ref + '" t="inlineStr"' + (s ? ' s="' + s + '"' : '') + '><is><t xml:space="preserve">' + esc(c.v) + '</t></is></c>';
        };
        const filas = [tabla.titulos.map((x) => ({ v: x, tipo: 't' }))].concat(tabla.filas);
        const datos = filas.map((f, r) => '<row r="' + (r + 1) + '">' + f.map((c, i) => celda(c, letra(i) + (r + 1), r === 0 ? 1 : 0)).join('') + '</row>').join('');
        const rango = 'A1:' + letra(Math.max(0, tabla.titulos.length - 1)) + filas.length;
        const NSM = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
        const NSR = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
        const NSP = 'http://schemas.openxmlformats.org/package/2006/relationships';
        const hoja = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="' + NSM + '">'
            + '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>'
            + '<cols>' + anchos(tabla).map((w, i) => '<col min="' + (i + 1) + '" max="' + (i + 1) + '" width="' + w + '" customWidth="1"/>').join('') + '</cols>'
            + '<sheetData>' + datos + '</sheetData>'
            + (tabla.filas.length ? '<autoFilter ref="' + rango + '"/>' : '') + '</worksheet>';
        const estilos = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="' + NSM + '">'
            + '<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>'
            + '<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>'
            + '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>'
            + '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
            + '<cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'
            + '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>'
            + '<xf numFmtId="22" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs></styleSheet>';
        const libro = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="' + NSM + '" xmlns:r="' + NSR + '">'
            + '<sheets><sheet name="Sheet1" sheetId="1" r:id="rId1"/></sheets></workbook>';
        const tipos = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
            + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
            + '<Default Extension="xml" ContentType="application/xml"/>'
            + '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
            + '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
            + '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>';
        const rels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="' + NSP + '">'
            + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>';
        const relsLibro = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="' + NSP + '">'
            + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>'
            + '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>';
        return escribeZip([
            ['[Content_Types].xml', enc.encode(tipos)],
            ['_rels/.rels', enc.encode(rels)],
            ['xl/workbook.xml', enc.encode(libro)],
            ['xl/_rels/workbook.xml.rels', enc.encode(relsLibro)],
            ['xl/styles.xml', enc.encode(estilos)],
            ['xl/worksheets/sheet1.xml', enc.encode(hoja)]
        ]);
    }

    async function guardaCsv() {
        const url = await direccion();
        let u = null;
        try { u = new URL(url); } catch (e) { u = null; }
        if (!u || u.origin !== location.origin) throw new Error(t('bexp_no_url', 'this page has no export'));
        u.searchParams.set('OfficeXML', 'F');
        u.searchParams.set('csv', 'Export');
        const res = await fetch(u.href, { credentials: 'same-origin' });
        if (!res.ok) throw new Error('http ' + res.status);
        if (/\/app\/login\//i.test(res.url || '')) throw new Error(t('bexp_session', 'the session expired'));
        const bytes = new Uint8Array(await res.arrayBuffer());
        const charset = ((res.headers.get('content-type') || '').match(/charset=([\w-]+)/i) || [, 'utf-8'])[1].toLowerCase();
        let texto;
        try { texto = new TextDecoder(charset).decode(bytes); } catch (e) { texto = new TextDecoder('utf-8').decode(bytes); }
        texto = texto.replace(/^\uFEFF/, '');
        if (/^\s*<(!doctype|html)/i.test(texto)) throw new Error(t('bexp_not_csv', 'NetSuite did not return a CSV'));
        descarga(new Blob(['\uFEFF' + texto], { type: 'text/csv;charset=utf-8' }), nombre('csv'));
    }

    function claves(titulos) {
        const vistos = {};
        return titulos.map((x) => {
            const base = String(x).trim() || '?';
            vistos[base] = (vistos[base] || 0) + 1;
            return vistos[base] > 1 ? base + ' (' + vistos[base] + ')' : base;
        });
    }

    function guardaJson(tabla) {
        const ks = claves(tabla.titulos);
        const filas = tabla.filas.map((f) => {
            const o = {};
            ks.forEach((k, i) => {
                const c = f[i];
                o[k] = !c ? null : c.tipo === 'f' ? fechaIso(c.v) : c.v;
            });
            return o;
        });
        descarga(new Blob([JSON.stringify(filas, null, 2)], { type: 'application/json' }), nombre('json'));
    }

    async function copia(tabla) {
        let decimal = '.';
        try {
            const p = new Intl.NumberFormat().formatToParts(1.5).find((x) => x.type === 'decimal');
            if (p) decimal = p.value;
        } catch (e) { }
        const limpia = (s) => String(s).replace(/[\t\r\n]+/g, ' ');
        const lineas = [tabla.titulos.map(limpia).join('\t')]
            .concat(tabla.filas.map((f) => f.map((c) => limpia(aTexto(c, decimal))).join('\t')));
        const C = window.NSFT_Clipboard;
        const msg = t('bexp_copied', String(tabla.filas.length) + ' rows copied', [String(tabla.filas.length)]);
        if (C && C.copy) {
            await C.copy(lineas.join('\n'), { toast: { message: msg } });
            return;
        }
        await navigator.clipboard.writeText(lineas.join('\n'));
    }

    function nombre(ext) {
        const h1 = document.querySelector('.uir-page-title-firstline h1, h1.uir-record-type');
        const titulo = (h1 && h1.textContent.trim()) || document.title.split(/\s+-\s+/)[0] || 'netsuite';
        const LF = window.NSFT_LogFormat;
        if (LF && LF.buildFileName) return LF.buildFileName([titulo, LF.stampPart ? LF.stampPart() : ''], ext);
        return titulo.replace(/[\\/:*?"<>|]+/g, ' ').trim() + '.' + ext;
    }

    function descarga(blob, archivo) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = archivo;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 10000);
    }
})();
