(function () {
    'use strict';
    if (window.NSFT_RAXlsx) return;

    const MAX_DESCOMPRIMIDO = 40 * 1024 * 1024;
    const MAX_COLUMNAS = 100;


    function u16(dv, o) { return dv.getUint16(o, true); }
    function u32(dv, o) { return dv.getUint32(o, true); }

    function entradas(buf) {
        const dv = new DataView(buf);
        const n = buf.byteLength;
        let fin = -1;
        for (let i = n - 22; i >= Math.max(0, n - 65557); i--) {
            if (u32(dv, i) === 0x06054b50) { fin = i; break; }
        }
        if (fin < 0) throw new Error('zip');
        const total = u16(dv, fin + 10);
        let o = u32(dv, fin + 16);
        const dec = new TextDecoder('utf-8');
        const mapa = {};
        for (let k = 0; k < total; k++) {
            if (o + 46 > n || u32(dv, o) !== 0x02014b50) throw new Error('zip');
            const metodo = u16(dv, o + 10);
            const comp = u32(dv, o + 20);
            const real = u32(dv, o + 24);
            const lNombre = u16(dv, o + 28);
            const lExtra = u16(dv, o + 30);
            const lComent = u16(dv, o + 32);
            const local = u32(dv, o + 42);
            const nombre = dec.decode(new Uint8Array(buf, o + 46, lNombre));
            mapa[nombre] = { metodo, comp, real, local };
            o += 46 + lNombre + lExtra + lComent;
        }
        return mapa;
    }

    async function lee(buf, e) {
        const dv = new DataView(buf);
        if (u32(dv, e.local) !== 0x04034b50) throw new Error('zip');
        const ini = e.local + 30 + u16(dv, e.local + 26) + u16(dv, e.local + 28);
        if (ini + e.comp > buf.byteLength) throw new Error('zip');
        if (e.real > MAX_DESCOMPRIMIDO) throw new Error('grande');
        const datos = new Uint8Array(buf, ini, e.comp);
        if (e.metodo === 0) return new TextDecoder('utf-8').decode(datos);
        if (e.metodo !== 8 || typeof DecompressionStream === 'undefined') throw new Error('metodo');
        const flujo = new Blob([datos]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
        return await new Response(flujo).text();
    }


    function xml(texto) {
        const doc = new DOMParser().parseFromString(texto, 'application/xml');
        if (doc.getElementsByTagName('parsererror').length) throw new Error('xml');
        return doc;
    }
    function hijos(nodo, local) { return Array.from(nodo.getElementsByTagNameNS('*', local)); }
    function attr(el, local) {
        if (el.hasAttribute(local)) return el.getAttribute(local);
        for (const a of Array.from(el.attributes)) if (a.localName === local) return a.value;
        return null;
    }

    function ruta(destino) {
        let t = String(destino || '');
        if (t.charAt(0) === '/') return t.slice(1);
        const partes = ('xl/' + t).split('/');
        const out = [];
        partes.forEach((p) => { if (p === '..') out.pop(); else if (p && p !== '.') out.push(p); });
        return out.join('/');
    }

    function textos(doc) {
        return hijos(doc, 'si').map((si) => hijos(si, 't')
            .filter((t) => !(t.parentNode && t.parentNode.localName === 'rPh'))
            .map((t) => t.textContent).join(''));
    }

    function estilosFecha(doc) {
        const propios = {};
        hijos(doc, 'numFmt').forEach((f) => {
            const cod = String(attr(f, 'formatCode') || '').replace(/"[^"]*"/g, '').replace(/\[[^\]]*\]/g, '');
            propios[attr(f, 'numFmtId')] = /[dmyh]/i.test(cod);
        });
        const xfs = hijos(doc, 'cellXfs')[0];
        if (!xfs) return [];
        return hijos(xfs, 'xf').map((xf) => {
            const id = Number(attr(xf, 'numFmtId') || 0);
            return (id >= 14 && id <= 22) || (id >= 45 && id <= 47) || !!propios[String(id)];
        });
    }

    function dos(n) { return (n < 10 ? '0' : '') + n; }
    function fecha(num) {
        const ms = Math.round((num - 25569) * 86400000);
        const d = new Date(ms);
        if (isNaN(d.getTime())) return String(num);
        const dia = d.getUTCFullYear() + '-' + dos(d.getUTCMonth() + 1) + '-' + dos(d.getUTCDate());
        const resto = ms % 86400000;
        return resto ? dia + ' ' + dos(d.getUTCHours()) + ':' + dos(d.getUTCMinutes()) : dia;
    }

    function columna(ref) {
        const m = /^([A-Z]+)/i.exec(ref || '');
        if (!m) return -1;
        let n = 0;
        for (const c of m[1].toUpperCase()) n = n * 26 + (c.charCodeAt(0) - 64);
        return n - 1;
    }

    function valor(c, compartidos, fechas) {
        const t = attr(c, 't') || 'n';
        if (t === 'inlineStr') return hijos(c, 't').map((x) => x.textContent).join('');
        const vEl = hijos(c, 'v')[0];
        const v = vEl ? vEl.textContent : '';
        if (v === '') return '';
        if (t === 's') return compartidos[Number(v)] != null ? compartidos[Number(v)] : '';
        if (t === 'b') return v === '1' ? 'TRUE' : 'FALSE';
        if (t === 'str' || t === 'e') return v;
        const num = Number(v);
        if (!isNaN(num) && fechas[Number(attr(c, 's') || 0)]) return fecha(num);
        return v;
    }


    async function abre(buf) {
        const mapa = entradas(buf);
        const pide = (nombre) => (mapa[nombre] ? lee(buf, mapa[nombre]) : Promise.resolve(''));
        const libroTxt = await pide('xl/workbook.xml');
        if (!libroTxt) throw new Error('libro');
        const libro = xml(libroTxt);
        const relsTxt = await pide('xl/_rels/workbook.xml.rels');
        const rels = {};
        if (relsTxt) hijos(xml(relsTxt), 'Relationship').forEach((r) => { rels[attr(r, 'Id')] = ruta(attr(r, 'Target')); });
        const hojas = hijos(libro, 'sheet').map((s, i) => ({
            nombre: attr(s, 'name') || ('Sheet' + (i + 1)),
            ruta: rels[attr(s, 'id')] || ('xl/worksheets/sheet' + (i + 1) + '.xml')
        }));
        if (!hojas.length) throw new Error('libro');

        let compartidos = null;
        let fechas = null;
        async function prepara() {
            if (compartidos) return;
            const sst = await pide('xl/sharedStrings.xml');
            compartidos = sst ? textos(xml(sst)) : [];
            let est = '';
            try { est = await pide('xl/styles.xml'); } catch (e) { est = ''; }
            try { fechas = est ? estilosFecha(xml(est)) : []; } catch (e) { fechas = []; }
        }

        async function hoja(i, max) {
            await prepara();
            const h = hojas[i];
            if (!h || !mapa[h.ruta]) throw new Error('hoja');
            const doc = xml(await lee(buf, mapa[h.ruta]));
            const filas = [];
            let columnas = 0;
            let cortado = false;
            let anchoCortado = false;
            const rows = hijos(doc, 'row');
            for (let k = 0; k < rows.length; k++) {
                if (filas.length >= max) { cortado = true; break; }
                const fila = [];
                let siguiente = 0;
                hijos(rows[k], 'c').forEach((c) => {
                    let col = columna(attr(c, 'r'));
                    if (col < 0) col = siguiente;
                    siguiente = col + 1;
                    if (col >= MAX_COLUMNAS) { anchoCortado = true; return; }
                    fila[col] = valor(c, compartidos, fechas);
                });
                if (!fila.some((x) => x != null && x !== '')) continue;
                for (let j = 0; j < fila.length; j++) if (fila[j] == null) fila[j] = '';
                const n = Number(attr(rows[k], 'r')) || (filas.length ? filas[filas.length - 1].n + 1 : 1);
                filas.push({ n, celdas: fila });
                if (fila.length > columnas) columnas = fila.length;
            }
            return { filas, columnas, cortado, anchoCortado };
        }

        return { hojas: hojas.map((h) => h.nombre), hoja };
    }

    window.NSFT_RAXlsx = { abre, columna };
})();
