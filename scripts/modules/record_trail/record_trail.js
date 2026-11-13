(function () {
    'use strict';
    if (window.NSFT_Herramientas) window.NSFT_Herramientas.vigila('.nsft-rtrail-card', 'trail');

    function ensureSqlTransport() {
        if (window.NSFT_SuiteQLRest && window.NSFT_SuiteQLRest.ensureTransport) {
            window.NSFT_SuiteQLRest.ensureTransport();
        }
    }

    const STORAGE_KEY = 'enableRecordTrail';
    const OVERLAY_CLASS = 'nsft-rtrail-overlay';
    const FETCHER_DEST = 'fetcher_rtrail';
    const EXTENSION_DEST = 'extension_rtrail';

    const ICON_TRAIL = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="5" cy="19" r="2"></circle><circle cx="19" cy="5" r="2"></circle><path d="M5 17v-2a4 4 0 0 1 4-4h6a4 4 0 0 0 4-4V7"></path></svg>';
    const ICON_EMPTY = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="8" stroke-dasharray="3 3"></circle><line x1="12" y1="9" x2="12" y2="15"></line><line x1="9" y1="12" x2="15" y2="12"></line></svg>';

    let enabled = true;
    let _overlay = null;
    let _fetcherInjected = false;
    let _reqSeq = 0;
    let _pendingReq = null;

    chrome.storage.local.get({ [STORAGE_KEY]: true }, (items) => {
        enabled = !!items[STORAGE_KEY];
    });

    chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== 'local' || !changes[STORAGE_KEY]) return;
        enabled = !!changes[STORAGE_KEY].newValue;
        if (!enabled) closeModal();
    });

    window.addEventListener('nsft-show-record-trail', () => {
        if (!enabled || !currentTranId()) return;
        openModal();
    });

    function msg(key, subs, fallback) {
        try {
            const m = chrome.i18n.getMessage(key, subs);
            if (m) return m;
        } catch (e) { }
        return fallback;
    }


    function currentTranId() {
        const id = new URLSearchParams(location.search).get('id');
        return id && /^\d+$/.test(id) ? id : null;
    }

    function openModal() {
        if (_overlay) { closeModal(); }
        const overlay = document.createElement('div');
        overlay.className = OVERLAY_CLASS + ' nsft-modal-backdrop';
        const tema = document.documentElement.getAttribute('data-nsft-theme') === 'dark' ? 'dark' : 'light';
        overlay.setAttribute('data-theme', tema);
        overlay.addEventListener('mousedown', (e) => {
            if (e.target === overlay) closeModal();
        });

        const card = document.createElement('div');
        card.className = 'nsft-rtrail-card nsft-modal nsft-modal--dialog';
        card.setAttribute('data-theme', tema);

        const head = document.createElement('div');
        head.className = 'nsft-modal-header nsft-rtrail-head';

        const title = document.createElement('span');
        title.className = 'nsft-modal-title nsft-rtrail-title';
        title.innerHTML = ICON_TRAIL;
        const titleText = document.createElement('span');
        titleText.textContent = msg('rt_title', null, 'Record Trail');
        title.appendChild(titleText);

        const tools = document.createElement('div');
        tools.className = 'nsft-modal-tools nsft-modal-hide-min';

        const refresh = document.createElement('span');
        refresh.className = 'nsft-modal-tool nsft-rtrail-refresh';
        refresh.setAttribute('role', 'button');
        refresh.setAttribute('tabindex', '0');
        refresh.title = msg('rt_refresh', null, 'Actualizar');
        refresh.innerHTML = '<span class="nsft-modal-tc nsft-c2"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a9 9 0 1 1-2.6-6.4L21 8"></path><path d="M21 3v5h-5"></path></svg></span>';
        const refreshText = document.createElement('span');
        refreshText.textContent = msg('rt_refresh', null, 'Actualizar');
        refresh.appendChild(refreshText);
        refresh.addEventListener('click', () => load(true));

        tools.appendChild(refresh);

        const actions = document.createElement('div');
        actions.className = 'nsft-header-actions';
        const close = document.createElement('button');
        close.type = 'button';
        close.className = 'nsft-modal-btn-close';
        close.textContent = '✕';
        close.title = msg('rt_close', null, 'Cerrar');
        close.addEventListener('click', closeModal);
        actions.appendChild(close);

        head.appendChild(title);
        head.appendChild(tools);
        head.appendChild(actions);

        const body = document.createElement('div');
        body.className = 'nsft-rtrail-body';

        card.appendChild(head);
        card.appendChild(body);
        overlay.appendChild(card);
        document.body.appendChild(overlay);
        _overlay = overlay;

        document.addEventListener('keydown', onKeyDown, true);
        load(false);
    }

    function onKeyDown(e) {
        if (e.key === 'Escape') { e.stopPropagation(); closeModal(); }
    }

    function closeModal() {
        document.removeEventListener('keydown', onKeyDown, true);
        if (_overlay) { _overlay.remove(); _overlay = null; }
    }

    function setBody(node) {
        if (!_overlay) return;
        const body = _overlay.querySelector('.nsft-rtrail-body');
        body.textContent = '';
        body.appendChild(node);
    }

    async function load() {
        const id = currentTranId();
        if (!id || !_overlay) return;

        const loading = document.createElement('div');
        loading.className = 'nsft-rtrail-state';
        loading.textContent = msg('rt_loading', null, 'Cargando relaciones…');
        setBody(loading);

        try {
            const trail = await requestTrail(id);
            if (!_overlay) return;
            render(trail);
            loadChecks(id);
        } catch (e) {
            if (!_overlay) return;
            const err = document.createElement('div');
            err.className = 'nsft-rtrail-state nsft-rtrail-error';
            err.textContent = msg('rt_error', [String(e && e.message || e)], 'Error: ' + (e && e.message || e));
            setBody(err);
        }
    }

    function render(trail) {
        const wrap = document.createElement('div');
        wrap.className = 'nsft-rtrail-columns';

        wrap.appendChild(buildColumn(
            msg('rt_sources', null, 'Orígenes'),
            trail.sources,
            msg('rt_empty_sources', null, 'Sin registros de origen')
        ));
        wrap.appendChild(buildArrow());
        wrap.appendChild(buildCurrentColumn(trail.current));
        wrap.appendChild(buildArrow());
        wrap.appendChild(buildColumn(
            msg('rt_targets', null, 'Destinos'),
            trail.targets,
            msg('rt_empty_targets', null, 'Sin registros de destino'),
            trail.gaps || []
        ));

        if (!trail.truncated) { setBody(wrap); return; }
        const box = document.createElement('div');
        box.appendChild(wrap);
        const nota = document.createElement('div');
        nota.className = 'nsft-rtrail-nota';
        nota.textContent = msg('rt_truncated', null, 'The chain is longer: only the first 40 related documents are shown.');
        box.appendChild(nota);
        setBody(box);
    }

    function buildGap(g) {
        const card = document.createElement('div');
        card.className = 'nsft-rtrail-node nsft-rtrail-node-gap';
        const top = document.createElement('div');
        top.className = 'nsft-rtrail-node-top';
        const type = document.createElement('span');
        type.className = 'nsft-rtrail-type nsft-tipo';
        type.textContent = g.kind === 'ship' ? msg('rt_gap_ship', null, 'Fulfillment')
            : g.kind === 'receipt' ? msg('rt_gap_receipt', null, 'Item receipt')
                : msg('rt_gap_payment', null, 'Payment');
        const txt = document.createElement('span');
        txt.className = 'nsft-rtrail-tranid';
        txt.textContent = msg('rt_gap_none', null, 'None yet');
        top.appendChild(type);
        top.appendChild(txt);
        card.appendChild(top);
        if (g.kind === 'payment' && g.amount != null) {
            const meta = document.createElement('div');
            meta.className = 'nsft-rtrail-meta';
            meta.textContent = msg('rt_gap_open', [fmtAmount(g.amount)], 'Open balance: ' + fmtAmount(g.amount));
            card.appendChild(meta);
        }
        return card;
    }

    function buildArrow() {
        const el = document.createElement('div');
        el.className = 'nsft-rtrail-arrow';
        return el;
    }

    function buildColumn(titleText, nodes, emptyText, gaps) {
        gaps = gaps || [];
        const col = document.createElement('div');
        col.className = 'nsft-rtrail-col';

        const title = document.createElement('div');
        title.className = 'nsft-rtrail-col-title';
        const label = document.createElement('span');
        label.textContent = titleText;
        const count = document.createElement('span');
        count.className = 'nsft-rtrail-count';
        count.textContent = String(nodes.length);
        title.appendChild(label);
        title.appendChild(count);
        col.appendChild(title);

        if (!nodes.length && gaps.length) {
            gaps.forEach(g => col.appendChild(buildGap(g)));
            return col;
        }
        if (!nodes.length) {
            if (window.NSFT_Herramientas) {
                col.insertAdjacentHTML('beforeend', window.NSFT_Herramientas.vacio('bandeja', emptyText));
                return col;
            }
            const empty = document.createElement('div');
            empty.className = 'nsft-rtrail-empty';
            const icon = document.createElement('span');
            icon.className = 'nsft-rtrail-empty-icon';
            icon.innerHTML = ICON_EMPTY;
            const text = document.createElement('div');
            text.className = 'nsft-rtrail-empty-text';
            text.textContent = emptyText;
            empty.appendChild(icon);
            empty.appendChild(text);
            col.appendChild(empty);
            return col;
        }

        nodes.forEach(n => col.appendChild(buildNode(n, false)));
        gaps.forEach(g => col.appendChild(buildGap(g)));
        return col;
    }

    function buildCurrentColumn(current) {
        const col = document.createElement('div');
        col.className = 'nsft-rtrail-col nsft-rtrail-col-current';

        const here = document.createElement('div');
        here.className = 'nsft-rtrail-here';
        here.textContent = msg('rt_here', null, 'ESTÁS AQUÍ');
        col.appendChild(here);

        if (current) col.appendChild(buildNode(current, true));
        return col;
    }

    function fmtAmount(v) {
        const n = Number(v);
        if (!isFinite(n)) return String(v || '');
        try {
            return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        } catch (e) { return String(v); }
    }

    function buildNode(n, isCurrent) {
        if (n.hidden) return buildHidden(n);
        const card = document.createElement('div');
        card.className = 'nsft-rtrail-node' + (isCurrent ? ' nsft-rtrail-node-current' : '');

        const top = document.createElement('div');
        top.className = 'nsft-rtrail-node-top';

        const type = document.createElement('span');
        type.className = 'nsft-rtrail-type nsft-tipo';
        type.textContent = n.type || '';

        const tranid = document.createElement('span');
        tranid.className = 'nsft-rtrail-tranid';
        tranid.textContent = n.tranid || ('#' + n.id);

        top.appendChild(type);
        top.appendChild(tranid);
        card.appendChild(top);

        const meta = document.createElement('div');
        meta.className = 'nsft-rtrail-meta';
        meta.textContent = [
            n.typename || n.type,
            n.trandate,
            (n.amount === null || n.amount === undefined) ? '' : fmtAmount(n.amount)
        ].filter(Boolean).join(' · ');
        card.appendChild(meta);

        if (n.linktypes || n.indirect) {
            const rel = document.createElement('div');
            rel.className = 'nsft-rtrail-rel nsft-tipo';
            rel.textContent = [n.linktypes, n.indirect ? msg('rt_via', [n.viaTranid || ''], 'via ' + (n.viaTranid || '')) : '']
                .filter(Boolean).join(' · ');
            card.appendChild(rel);
        }

        if (n.status) {
            const status = document.createElement('div');
            const H = window.NSFT_Herramientas;
            const est = H && typeof H.estadoNS === 'function' ? H.estadoNS(n.status) : null;
            if (est) {
                status.className = 'nsft-rtrail-status ' + est.clase;
                status.textContent = est.texto;
            } else {
                status.className = 'nsft-rtrail-status';
                const dot = document.createElement('span');
                dot.className = 'nsft-rtrail-dot';
                status.appendChild(dot);
                status.appendChild(document.createTextNode(n.status));
            }
            card.appendChild(status);
        }

        const foot = document.createElement('div');
        foot.className = 'nsft-rtrail-foot';

        const idBtn = document.createElement('a');
        idBtn.href = '#';
        idBtn.className = 'nsft-rtrail-id';
        idBtn.textContent = '#' + n.id;
        idBtn.title = msg('rt_copy_id', null, 'Copiar ID interno');
        idBtn.addEventListener('click', (e) => {
            e.preventDefault();
            if (window.NSFT_Clipboard) window.NSFT_Clipboard.copy(String(n.id), { toast: true });
            else if (navigator.clipboard) navigator.clipboard.writeText(String(n.id));
        });
        foot.appendChild(idBtn);

        if (!isCurrent) {
            const open = document.createElement('a');
            open.className = 'nsft-rtrail-open';
            open.href = location.origin + '/app/accounting/transactions/transaction.nl?id=' + encodeURIComponent(n.id);
            open.target = '_blank';
            open.rel = 'noopener noreferrer';
            open.textContent = msg('rt_open_lbl', null, 'Abrir') + ' ↗';
            open.title = msg('rt_open', null, 'Abrir transacción');
            foot.appendChild(open);
        }

        card.appendChild(foot);
        return card;
    }

    function buildHidden(n) {
        const card = document.createElement('div');
        card.className = 'nsft-rtrail-node nsft-rtrail-node-hidden';
        const top = document.createElement('div');
        top.className = 'nsft-rtrail-node-top';
        const type = document.createElement('span');
        type.className = 'nsft-rtrail-type nsft-tipo';
        type.textContent = n.type || '';
        const txt = document.createElement('span');
        txt.className = 'nsft-rtrail-tranid';
        txt.textContent = msg('rt_hidden', null, 'Hidden');
        top.appendChild(type);
        top.appendChild(txt);
        card.appendChild(top);
        const meta = document.createElement('div');
        meta.className = 'nsft-rtrail-meta';
        meta.textContent = msg('rt_hidden_desc', null, 'Your role cannot open this document.');
        card.appendChild(meta);
        const foot = document.createElement('div');
        foot.className = 'nsft-rtrail-foot';
        const idBtn = document.createElement('a');
        idBtn.href = '#';
        idBtn.className = 'nsft-rtrail-id';
        idBtn.textContent = '#' + n.id;
        idBtn.title = msg('rt_copy_id', null, 'Copiar ID interno');
        idBtn.addEventListener('click', (e) => {
            e.preventDefault();
            if (window.NSFT_Clipboard) window.NSFT_Clipboard.copy(String(n.id), { toast: true });
        });
        foot.appendChild(idBtn);
        card.appendChild(foot);
        return card;
    }


    function injectFetcher() {
        return new Promise((resolve) => {
            if (_fetcherInjected) return resolve();
            _fetcherInjected = true;
            ensureSqlTransport();
            const s = document.createElement('script');
            s.async = false;
            s.src = chrome.runtime.getURL('scripts/modules/record_trail/record_trail_fetcher.js');
            s.onload = function () { this.remove(); resolve(); };
            (window.NSFT_AfterLoad ? window.NSFT_AfterLoad.append(s) : (document.head || document.documentElement).appendChild(s));
        });
    }

    window.addEventListener('message', (event) => {
        const d = event.data;
        if (!d || d.dest !== EXTENSION_DEST || d.type !== 'trail') return;
        if (!_pendingReq || d.reqId !== _pendingReq.reqId) return;
        const req = _pendingReq;
        _pendingReq = null;
        if (d.error) req.reject(new Error(d.error));
        else req.resolve(d.payload);
    });


    let _checksReq = null;

    window.addEventListener('message', (event) => {
        const d = event.data;
        if (!d || d.dest !== EXTENSION_DEST || d.type !== 'checks') return;
        if (!_checksReq || d.reqId !== _checksReq.reqId) return;
        const req = _checksReq;
        _checksReq = null;
        req.resolve(d.error ? null : d.payload);
    });

    function requestChecks(id) {
        return new Promise((resolve) => {
            const reqId = 'rtc_' + (++_reqSeq);
            _checksReq = { reqId, resolve };
            window.postMessage({ dest: FETCHER_DEST, type: 'get_checks', payload: { id, reqId } }, '*');
            setTimeout(() => {
                if (_checksReq && _checksReq.reqId === reqId) { _checksReq = null; resolve(null); }
            }, 30000);
        });
    }

    async function loadChecks(id) {
        if (!_overlay) return;
        const body = _overlay.querySelector('.nsft-rtrail-body');
        const sec = document.createElement('div');
        sec.className = 'nsft-rtrail-checks';
        sec.innerHTML = '<div class="nsft-rtrail-checks-title">' + escapeHtml(msg('rt_checks', null, 'Checks')) + '</div>'
            + '<div class="nsft-rtrail-checks-state">' + escapeHtml(msg('rt_checks_loading', null, 'Reviewing the transaction…')) + '</div>';
        body.insertBefore(sec, body.firstChild);
        const res = await requestChecks(id);
        if (!_overlay || !sec.isConnected) return;
        const estado = sec.querySelector('.nsft-rtrail-checks-state');
        if (!res) {
            estado.textContent = msg('rt_checks_error', null, 'The checks could not be run.');
            return;
        }
        const checks = res.checks || [];
        const avisos = checks.filter((c) => c.sev !== 'pass');
        if (!checks.length) { sec.remove(); return; }
        if (!avisos.length) {
            estado.className = 'nsft-rtrail-checks-ok nsft-estado is-ok';
            estado.textContent = checks.length === 1
                ? msg('rt_checks_ok_1', null, 'No warnings · 1 check passed')
                : msg('rt_checks_ok', [String(checks.length)], 'No warnings · ' + checks.length + ' checks passed');
            return;
        }
        estado.remove();
        const count = document.createElement('span');
        count.className = 'nsft-rtrail-count';
        count.textContent = String(avisos.length);
        sec.querySelector('.nsft-rtrail-checks-title').appendChild(count);
        avisos.forEach((c) => {
            const t = textoAviso(c);
            if (!t) return;
            const row = document.createElement('div');
            row.className = 'nsft-rtrail-check';
            row.innerHTML = '<span class="' + (c.sev === 'attention' ? 'nsft-alerta' : 'nsft-alerta is-aviso') + '">' + escapeHtml(t.title) + '</span>'
                + '<span class="nsft-rtrail-check-detail">' + escapeHtml(t.detail) + '</span>';
            if (t.open) {
                const a = document.createElement('a');
                a.className = 'nsft-rtrail-open';
                a.href = location.origin + '/app/accounting/transactions/transaction.nl?id=' + encodeURIComponent(t.open.id);
                a.target = '_blank';
                a.rel = 'noopener noreferrer';
                a.textContent = msg('rt_open_lbl', null, 'Abrir') + ' ' + (t.open.tranid || '#' + t.open.id) + ' ↗';
                row.appendChild(a);
            }
            sec.appendChild(row);
        });
    }

    function escapeHtml(v) {
        return String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    }

    function fmtFecha(iso) {
        const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
        if (!m) return String(iso || '');
        try { return new Date(+m[1], +m[2] - 1, +m[3]).toLocaleDateString(chrome.i18n.getUILanguage()); } catch (e) { return String(iso); }
    }

    function textoAviso(c) {
        const $ = fmtAmount;
        switch (c.id) {
            case 'dup': {
                const d = c.doc || {};
                let det = [d.tranid || '#' + d.id, $(d.amt), fmtFecha(d.d)].filter(Boolean).join(' · ');
                if (c.ref) det += ' · ' + msg('rt_ck_dup_ref', null, 'same vendor reference');
                if (c.more > 0) det += ' · ' + msg('rt_ck_more', [String(c.more)], '+' + c.more + ' more');
                return { title: msg('rt_ck_dup', null, 'Possible duplicate'), detail: det, open: d };
            }
            case 'over_po':
                return {
                    title: msg('rt_ck_over_po', null, 'Over the purchase order'),
                    detail: msg('rt_ck_over_po_d', [$(c.poTotal), $(c.diff), String(c.pct)], 'The PO totals ' + $(c.poTotal) + '; this bill is ' + $(c.diff) + ' over (+' + c.pct + '%).'),
                    open: c.po
                };
            case 'past_due':
                return {
                    title: msg('rt_ck_past_due', [String(c.days)], c.days + ' days overdue'),
                    detail: msg('rt_ck_past_due_d', [fmtFecha(c.due), $(c.unpaid)], 'Due ' + fmtFecha(c.due) + ' · ' + $(c.unpaid) + ' unpaid')
                };
            case 'pay_hold':
                return { title: msg('rt_ck_pay_hold', null, 'Payment hold'), detail: msg('rt_ck_pay_hold_d', null, 'This bill is on hold: it will not be picked up in a payment run.') };
            case 'credit_limit':
                if (c.order) {
                    return {
                        title: msg('rt_ck_credit_order', null, 'Would exceed the credit limit'),
                        detail: msg('rt_ck_credit_order_d', [$(c.limit), $(c.used), $(c.over)], 'Limit ' + $(c.limit) + ' · with this order ' + $(c.used) + ' · ' + $(c.over) + ' over')
                    };
                }
                return {
                    title: c.sev === 'attention' ? msg('rt_ck_credit_over', null, 'Over the credit limit') : msg('rt_ck_credit_pct', [String(c.pct)], c.pct + '% of the credit limit used'),
                    detail: msg('rt_ck_credit_d', [$(c.used), $(c.limit)], $(c.used) + ' used of ' + $(c.limit))
                };
            case 'credit_unapplied': {
                const docs = c.docs || [];
                const det = docs.slice(0, 2).map((x) => (x.tranid || '#' + x.id) + ' ' + $(x.amt)).join(' · ')
                    + (docs.length > 2 ? ' · ' + msg('rt_ck_more', [String(docs.length - 2)], '+' + (docs.length - 2) + ' more') : '');
                return { title: msg('rt_ck_credit_unapplied', [$(c.sum)], 'Unapplied credit: ' + $(c.sum)), detail: det, open: docs[0] };
            }
            case 'payment_unapplied':
                return { title: msg('rt_ck_pay_unapplied', null, 'Unapplied amount'), detail: msg('rt_ck_pay_unapplied_d', [$(c.amount)], $(c.amount) + ' of this payment is not applied to anything yet.') };
            default:
                return null;
        }
    }

    async function requestTrail(id) {
        await injectFetcher();
        return new Promise((resolve, reject) => {
            const reqId = 'rt_' + (++_reqSeq);
            _pendingReq = { reqId, resolve, reject };
            window.postMessage({ dest: FETCHER_DEST, type: 'get_trail', payload: { id, reqId } }, '*');
            setTimeout(() => {
                if (_pendingReq && _pendingReq.reqId === reqId) {
                    _pendingReq = null;
                    reject(new Error('timeout'));
                }
            }, 30000);
        });
    }
})();
