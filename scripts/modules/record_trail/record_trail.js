(function () {
    'use strict';

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
        overlay.className = OVERLAY_CLASS;
        overlay.addEventListener('mousedown', (e) => {
            if (e.target === overlay) closeModal();
        });

        const card = document.createElement('div');
        card.className = 'nsft-rtrail-card';

        const head = document.createElement('div');
        head.className = 'nsft-rtrail-head';

        const iconBadge = document.createElement('span');
        iconBadge.className = 'nsft-rtrail-head-icon';
        iconBadge.innerHTML = ICON_TRAIL;

        const titles = document.createElement('div');
        titles.className = 'nsft-rtrail-titles';

        const title = document.createElement('div');
        title.className = 'nsft-rtrail-title';
        title.textContent = msg('rt_title', null, 'Record Trail');

        const subtitle = document.createElement('div');
        subtitle.className = 'nsft-rtrail-subtitle';
        subtitle.textContent = msg('rt_subtitle', null, 'Registros relacionados con esta transacción');

        titles.appendChild(title);
        titles.appendChild(subtitle);

        const refresh = document.createElement('button');
        refresh.type = 'button';
        refresh.className = 'nsft-rtrail-iconbtn';
        refresh.textContent = '↻';
        refresh.title = msg('rt_refresh', null, 'Actualizar');
        refresh.addEventListener('click', () => load(true));

        const close = document.createElement('button');
        close.type = 'button';
        close.className = 'nsft-rtrail-iconbtn';
        close.textContent = '✕';
        close.title = msg('rt_close', null, 'Cerrar');
        close.addEventListener('click', closeModal);

        head.appendChild(iconBadge);
        head.appendChild(titles);
        head.appendChild(refresh);
        head.appendChild(close);

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
            msg('rt_empty_targets', null, 'Sin registros de destino')
        ));

        setBody(wrap);
    }

    function buildArrow() {
        const el = document.createElement('div');
        el.className = 'nsft-rtrail-arrow';
        return el;
    }

    function buildColumn(titleText, nodes, emptyText) {
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

        if (!nodes.length) {
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
        const card = document.createElement('div');
        card.className = 'nsft-rtrail-node' + (isCurrent ? ' nsft-rtrail-node-current' : '');

        const top = document.createElement('div');
        top.className = 'nsft-rtrail-node-top';

        const type = document.createElement('span');
        type.className = 'nsft-rtrail-type';
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

        if (n.linktypes) {
            const rel = document.createElement('div');
            rel.className = 'nsft-rtrail-rel';
            rel.textContent = n.linktypes;
            card.appendChild(rel);
        }

        if (n.status) {
            const status = document.createElement('div');
            status.className = 'nsft-rtrail-status';
            const dot = document.createElement('span');
            dot.className = 'nsft-rtrail-dot';
            status.appendChild(dot);
            status.appendChild(document.createTextNode(n.status));
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


    function injectFetcher() {
        return new Promise((resolve) => {
            if (_fetcherInjected) return resolve();
            _fetcherInjected = true;
            ensureSqlTransport();
            const s = document.createElement('script');
            s.async = false;
            s.src = chrome.runtime.getURL('scripts/modules/record_trail/record_trail_fetcher.js');
            s.onload = function () { this.remove(); resolve(); };
            (document.head || document.documentElement).appendChild(s);
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
