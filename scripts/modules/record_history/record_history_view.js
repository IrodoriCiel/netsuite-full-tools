(function () {
    'use strict';
    if (window.NSFT_RecordHistory) return;

    const RECTYPES_KEY = 'nsftSfvRecTypes';
    const VENTANA_MS = 60000;
    const MAX_FILAS = 1000;
    const CREACION_MAX = 8;

    let _aprendidos = {};
    try {
        chrome.storage.local.get({ [RECTYPES_KEY]: {} }, (it) => { _aprendidos = it[RECTYPES_KEY] || {}; });
        chrome.storage.onChanged.addListener((ch, area) => {
            if (area === 'local' && ch[RECTYPES_KEY]) _aprendidos = ch[RECTYPES_KEY].newValue || {};
        });
    } catch (e) { }

    const _cache = {};
    const _abiertos = {};

    function i18n(key, fallback, subs) {
        let out = '';
        try { out = chrome.i18n.getMessage(key, subs) || ''; } catch (e) { out = ''; }
        if (!out) {
            out = fallback;
            (subs || []).forEach((v, i) => { out = out.split('$' + (i + 1)).join(String(v)); });
        }
        return out;
    }

    function cuenta(n, k1, kn, uno, plural) {
        return Number(n) === 1 ? i18n(k1, uno) : i18n(kn, plural, [String(n)]);
    }

    function esc(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    }


    function tipoDe(href, recordType) {
        let u = null;
        try { u = new URL(href); } catch (e) { u = null; }
        const path = u ? u.pathname : '';
        const rt = u ? u.searchParams.get('rectype') : null;
        if (rt && /^\d+$/.test(rt)) return { id: Number(rt), seguro: true };
        if (/\/accounting\/transactions\//i.test(path)) return { id: -30, seguro: true };
        if (/\/common\/entity\//i.test(path)) return { id: -9, seguro: true };
        if (/\/common\/item\//i.test(path)) return { id: -10, seguro: true };
        const k = String(recordType || '').toLowerCase();
        if (k && _aprendidos[k] != null && !isNaN(Number(_aprendidos[k]))) return { id: Number(_aprendidos[k]), seguro: false };
        return null;
    }

    function aprende(recordType, filas) {
        const k = String(recordType || '').toLowerCase();
        if (!k || !filas.length) return;
        const tipos = [];
        filas.forEach((f) => {
            const t = Number(f.recordtypeid);
            if (!isNaN(t) && tipos.indexOf(t) === -1) tipos.push(t);
        });
        if (tipos.length !== 1) return;
        try {
            chrome.storage.local.get({ [RECTYPES_KEY]: {} }, (it) => {
                const m = it[RECTYPES_KEY] || {};
                if (m[k] === tipos[0]) return;
                m[k] = tipos[0];
                chrome.storage.local.set({ [RECTYPES_KEY]: m });
            });
        } catch (e) { }
    }


    function carga(ctx, clave, tipoId, lento) {
        _cache[clave] = { estado: 'cargando', lento: !!lento };
        Promise.resolve(ctx.run(ctx.recordId, tipoId)).then((r) => {
            if (!r || r.error) {
                _cache[clave] = { estado: 'error', msg: (r && r.error) || '' };
            } else {
                const filas = r.rows || [];
                const tipos = {};
                filas.forEach((f) => { if (f.recordtypeid != null) tipos[f.recordtypeid] = 1; });
                if (tipoId == null) aprende(ctx.recordType, filas);
                _cache[clave] = {
                    estado: 'listo', filas, tipo: tipoId,
                    varios: Object.keys(tipos).length > 1,
                    limite: filas.length >= MAX_FILAS
                };
            }
            ctx.onUpdate();
        }, () => {
            _cache[clave] = { estado: 'error', msg: '' };
            ctx.onUpdate();
        });
    }


    function vacio(v) { return v == null || String(v).trim() === ''; }

    function esRuido(f) {
        return Number(f.type) === 2 && vacio(f.oldvalue) && String(f.newvalue) === 'F';
    }

    function ms(cuando) {
        const m = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})(?::(\d{2}))?/.exec(String(cuando || ''));
        if (!m) return 0;
        return new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0)).getTime();
    }

    const RX_ESTADO = /(^|\.)(K|S)?(STATUS|APPROVALSTATUS|APPROVAL)$|STATUS$/i;
    const RX_APRUEBA = /aprob|approv/i;
    const RX_RECHAZA = /rechaz|reject|deneg|denied/i;

    function agrupa(filas) {
        const asc = filas.slice().reverse();
        const eventos = [];
        let ev = null;
        asc.forEach((f) => {
            const t = ms(f.cuando);
            const quien = [f.usuario, f.rol, f.context].join('|');
            if (!ev || ev.quien !== quien || t - ev.hasta > VENTANA_MS) {
                ev = { quien, desde: t, hasta: t, cuando: f.cuando, usuario: f.usuario, rol: f.rol, context: f.context, filas: [], ruido: 0, crea: false };
                eventos.push(ev);
            }
            ev.hasta = t;
            if (Number(f.type) === 1) { ev.crea = true; return; }
            if (esRuido(f)) { ev.ruido++; return; }
            ev.filas.push(f);
        });
        eventos.forEach((e, i) => {
            e.clave = e.cuando + '|' + e.quien + '|' + i;
            e.tipo = e.crea ? 'crea' : 'edita';
            if (!e.crea) {
                const est = e.filas.find((f) => RX_ESTADO.test(String(f.field || '')) && !vacio(f.newvalue));
                if (est && RX_RECHAZA.test(est.newvalue)) e.tipo = 'rechaza';
                else if (est && RX_APRUEBA.test(est.newvalue)) e.tipo = 'aprueba';
            }
        });
        return eventos.reverse();
    }


    const CONTEXTOS = {
        UIF: ['rh_ctx_uif', 'User interface'],
        CSV: ['rh_ctx_csv', 'CSV import'],
        WSS: ['rh_ctx_wss', 'SOAP web services'],
        WSV: ['rh_ctx_wss', 'SOAP web services'],
        RST: ['rh_ctx_rest', 'REST web services'],
        RLT: ['rh_ctx_restlet', 'RESTlet'],
        SLT: ['rh_ctx_suitelet', 'Suitelet'],
        UES: ['rh_ctx_ues', 'User Event'],
        SCH: ['rh_ctx_sch', 'Scheduled script'],
        MPR: ['rh_ctx_mpr', 'Map/Reduce'],
        WFA: ['rh_ctx_wfa', 'Workflow'],
        CLI: ['rh_ctx_cli', 'Client script'],
        MSS: ['rh_ctx_mss', 'Mass update']
    };

    function textoContexto(c) {
        const k = String(c || '').toUpperCase();
        return CONTEXTOS[k] ? i18n(CONTEXTOS[k][0], CONTEXTOS[k][1]) : (c || '');
    }

    function fecha(cuando) {
        const t = ms(cuando);
        if (!t) return String(cuando || '');
        try {
            return new Date(t).toLocaleString(chrome.i18n.getUILanguage(), { dateStyle: 'medium', timeStyle: 'short' });
        } catch (e) { return String(cuando); }
    }

    function nombreCampo(f) {
        const n = f.campo || f.field || '';
        return f.lineid != null && f.lineid !== '' ? i18n('rh_line', 'Line $1', [String(f.lineid)]) + ' · ' + n : n;
    }

    function marca(texto, q) {
        const TS = window.NSFT_TextSearch;
        if (q && TS && TS.markHtml) return TS.markHtml(String(texto == null ? '' : texto), q, 'nsft-rh-hl');
        return esc(texto);
    }

    function casa(texto, q) {
        if (!q) return true;
        const TS = window.NSFT_TextSearch;
        if (TS && TS.match) return TS.match(String(texto == null ? '' : texto), q);
        return String(texto == null ? '' : texto).toLowerCase().indexOf(q.toLowerCase()) !== -1;
    }

    function badgeDe(e) {
        if (e.tipo === 'crea') return '<span class="nsft-estado is-ok">' + esc(i18n('rh_kind_create', 'Created')) + '</span>';
        if (e.tipo === 'aprueba') return '<span class="nsft-estado is-ok">' + esc(i18n('rh_kind_approve', 'Approval')) + '</span>';
        if (e.tipo === 'rechaza') return '<span class="nsft-estado is-mal">' + esc(i18n('rh_kind_reject', 'Rejection')) + '</span>';
        return '<span class="nsft-tipo">' + esc(i18n('rh_kind_edit', 'Edit')) + '</span>';
    }

    function valorHtml(v, q, cls) {
        if (vacio(v)) return '<span class="nsft-rh-vacio">' + esc(i18n('rh_empty_value', '(empty)')) + '</span>';
        return '<span class="' + cls + '">' + marca(v, q) + '</span>';
    }

    function filaHtml(f, q) {
        const valores = vacio(f.oldvalue)
            ? valorHtml(f.newvalue, q, 'nsft-rh-despues')
            : valorHtml(f.oldvalue, q, 'nsft-rh-antes')
                + '<span class="nsft-rh-flecha" aria-hidden="true">→</span>'
                + valorHtml(f.newvalue, q, 'nsft-rh-despues');
        return '<div class="nsft-rh-ch">'
            + '<span class="nsft-rh-campo" title="' + esc(f.field || '') + '">' + marca(nombreCampo(f), q) + '</span>'
            + '<span class="nsft-rh-vals">' + valores + '</span>'
            + '</div>';
    }

    function eventoHtml(e, q) {
        const cabecera = [e.usuario, e.rol, textoContexto(e.context)].join(' ');
        const casaCab = q && casa(cabecera, q);
        let filas = e.filas;
        if (q && !casaCab) filas = filas.filter((f) => casa(nombreCampo(f), q) || casa(f.oldvalue, q) || casa(f.newvalue, q));
        if (q && !casaCab && !filas.length) return '';

        let cuerpo = '';
        let mas = '';
        const abierto = !!_abiertos[e.clave] || !!q;
        if (e.tipo === 'crea' && !abierto && filas.length > CREACION_MAX) {
            cuerpo = filas.slice(0, CREACION_MAX).map((f) => filaHtml(f, q)).join('');
            mas = '<button type="button" class="nsft-rh-mas" data-ev="' + esc(e.clave) + '">'
                + esc(i18n('rh_show_more', 'Show $1 more fields', [String(filas.length - CREACION_MAX)])) + '</button>';
        } else {
            cuerpo = filas.map((f) => filaHtml(f, q)).join('');
        }
        if (!filas.length && e.tipo === 'crea') cuerpo = '<div class="nsft-rh-nota">' + esc(i18n('rh_created_only', 'Record created.')) + '</div>';

        const n = e.filas.length;
        const resumen = e.tipo === 'crea'
            ? cuenta(n, 'rh_set_1', 'rh_set_n', '1 field set', '$1 fields set')
            : cuenta(n, 'rh_ch_1', 'rh_ch_n', '1 change', '$1 changes');
        const ruido = e.ruido ? ' · ' + cuenta(e.ruido, 'rh_noise_1', 'rh_noise_n', '1 empty checkbox hidden', '$1 empty checkboxes hidden') : '';

        return '<div class="nsft-rh-ev is-' + e.tipo + '">'
            + '<span class="nsft-rh-punto" aria-hidden="true"></span>'
            + '<div class="nsft-rh-cab">'
            + badgeDe(e)
            + '<span class="nsft-rh-quien">' + marca(e.usuario || '—', q) + '</span>'
            + (e.rol ? '<span class="nsft-rh-rol">' + marca(e.rol, q) + '</span>' : '')
            + (e.context ? '<span class="nsft-rh-ctx" title="' + esc(e.context) + '">' + marca(textoContexto(e.context), q) + '</span>' : '')
            + '<span class="nsft-rh-cuando">' + esc(fecha(e.cuando)) + '</span>'
            + '</div>'
            + '<div class="nsft-rh-sub">' + esc(resumen + ruido) + '</div>'
            + '<div class="nsft-rh-chs">' + cuerpo + '</div>'
            + mas
            + '</div>';
    }

    function vacioHtml(icono, txt, accion) {
        const H = window.NSFT_Herramientas;
        if (H && H.vacio) return H.vacio(icono, txt, '', accion || '');
        return '<div class="nsft-rh-estado">' + esc(txt) + (accion || '') + '</div>';
    }

    function botonLento(txt) {
        return '<button type="button" class="nsft-vacio-accion nsft-rh-lento">' + esc(txt) + '</button>';
    }


    function csv(filas, nombre) {
        const c = (v) => {
            const s = v == null ? '' : String(v);
            return /[",\n\r;]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
        };
        const tipos = { 1: i18n('rh_t_1', 'Created'), 2: i18n('rh_t_2', 'Set'), 3: i18n('rh_t_3', 'Cleared'), 4: i18n('rh_t_4', 'Changed') };
        const cab = [
            i18n('rh_csv_date', 'Date'), i18n('rh_csv_user', 'User'), i18n('rh_csv_role', 'Role'),
            i18n('rh_csv_context', 'Context'), i18n('rh_csv_type', 'Type'), i18n('rh_csv_field', 'Field'),
            i18n('rh_csv_fieldid', 'Field ID'), i18n('rh_csv_line', 'Line'),
            i18n('rh_csv_old', 'Before'), i18n('rh_csv_new', 'After')
        ];
        const lineas = [cab.map(c).join(',')];
        filas.forEach((f) => {
            lineas.push([f.cuando, f.usuario, f.rol, textoContexto(f.context), tipos[Number(f.type)] || f.type,
                f.campo, f.field, f.lineid, f.oldvalue, f.newvalue].map(c).join(','));
        });
        const blob = new Blob(['﻿' + lineas.join('\r\n')], { type: 'text/csv;charset=utf-8' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = nombre + '.csv';
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    }


    function render(cont, ctx) {
        if (!cont) return;
        const recId = parseInt(ctx.recordId, 10);
        if (!recId || recId <= 0) {
            cont.innerHTML = vacioHtml('info', i18n('rh_no_record', 'No history yet. Save the record first: new records have no system notes.'));
            return;
        }
        const tipo = tipoDe(ctx.pageHref, ctx.recordType);
        const base = String(ctx.recordType || '') + ':' + recId;
        const clave = base + ':' + (tipo ? tipo.id : 'x');
        const claveLenta = base + ':lento';
        let est = _cache[claveLenta] || _cache[clave];

        if (!est) {
            if (!tipo) {
                cont.innerHTML = vacioHtml('reloj',
                    i18n('rh_no_type', 'Unknown record type. NetSuite needs it to find the notes fast; searching without it can take over a minute, and afterwards this type will be fast.'),
                    botonLento(i18n('rh_search_anyway', 'Search anyway')));
                cont.querySelector('.nsft-rh-lento').addEventListener('click', () => carga(ctx, claveLenta, null, true));
                return;
            }
            carga(ctx, clave, tipo.id, false);
            est = _cache[clave];
        }

        if (est.estado === 'cargando') {
            cont.innerHTML = '<div class="nsft-rh-cargando"><span class="nsft-rh-spin" aria-hidden="true"></span>'
                + esc(est.lento ? i18n('rh_loading_slow', 'Searching every record type… this can take over a minute.') : i18n('rh_loading', 'Loading system notes…'))
                + '</div>';
            return;
        }
        if (est.estado === 'error') {
            const perm = /permission|insufficient|permiso/i.test(est.msg || '');
            cont.innerHTML = vacioHtml('aviso', perm
                ? i18n('rh_err_perm', 'Your role cannot read system notes. Ask for the SuiteAnalytics Workbook permission.')
                : i18n('rh_err', 'The system notes could not be loaded. Try again in a moment.'));
            return;
        }

        const filas = est.filas || [];
        if (!filas.length) {
            const accion = (_cache[claveLenta] || (tipo && tipo.seguro === false) || !tipo) ? '' : botonLento(i18n('rh_search_all_types', 'Search every record type'));
            cont.innerHTML = vacioHtml('reloj', i18n('rh_none', 'No system notes. NetSuite has no recorded changes for this record.'), accion);
            const b = cont.querySelector('.nsft-rh-lento');
            if (b) b.addEventListener('click', () => carga(ctx, claveLenta, null, true));
            return;
        }

        const q = String(ctx.term || '').trim();
        const eventos = agrupa(filas);
        const html = eventos.map((e) => eventoHtml(e, q)).join('');
        const nCambios = eventos.reduce((s, e) => s + e.filas.length, 0);

        const avisos = []
            .concat(est.varios ? ['<div class="nsft-alerta is-aviso nsft-rh-aviso">' + esc(i18n('rh_mixed', 'Notes from more than one record type share this ID: some may belong to another record.')) + '</div>'] : [])
            .concat(est.limite ? ['<div class="nsft-rh-nota">' + esc(i18n('rh_limited', 'Showing the $1 most recent notes.', [String(MAX_FILAS)])) + '</div>'] : [])
            .join('');

        cont.innerHTML = '<div class="nsft-rh-barra">'
            + '<span class="nsft-rh-total">' + esc(cuenta(eventos.length, 'rh_ev_1', 'rh_ev_n', '1 event', '$1 events') + ' · ' + cuenta(nCambios, 'rh_ch_1', 'rh_ch_n', '1 change', '$1 changes')) + '</span>'
            + '</div>'
            + avisos
            + '<div class="nsft-rh-linea">'
            + (html || vacioHtml('buscar', i18n('rh_no_match', 'No matches. No change matches the search.'), '', ''))
            + '</div>';

        cont.querySelectorAll('.nsft-rh-mas').forEach((b) => b.addEventListener('click', () => {
            _abiertos[b.getAttribute('data-ev')] = true;
            render(cont, ctx);
        }));
    }

    function filasDe(ctx) {
        const recId = parseInt(ctx.recordId, 10);
        const tipo = tipoDe(ctx.pageHref, ctx.recordType);
        const base = String(ctx.recordType || '') + ':' + recId;
        const est = _cache[base + ':lento'] || _cache[base + ':' + (tipo ? tipo.id : 'x')];
        return est && est.estado === 'listo' && est.filas && est.filas.length ? est.filas : null;
    }

    function exporta(ctx) {
        const filas = filasDe(ctx);
        if (!filas) return false;
        csv(filas, (ctx.recordType || 'record') + '-' + parseInt(ctx.recordId, 10) + '-' + i18n('rh_csv_file', 'history'));
        return true;
    }

    function olvida(recordType, recordId) {
        const base = String(recordType || '') + ':' + parseInt(recordId, 10) + ':';
        Object.keys(_cache).forEach((k) => { if (k.indexOf(base) === 0) delete _cache[k]; });
    }

    window.NSFT_RecordHistory = Object.freeze({ render, olvida, exporta });
})();
