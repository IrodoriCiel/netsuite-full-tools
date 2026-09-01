(function () {
    'use strict';

    if (window.NSFT_Diff) return;

    const PREVIEW_OVERLAY_ID = 'nsft-diff-overlay';
    const MAX_PREVIEW_LINES = 5000;
    const MAX_LCS_CELLS = 4000000;

    function el(tag, className) {
        const n = document.createElement(tag);
        if (className) n.className = className;
        return n;
    }

    function showDiffModal(current, newContent, fileName, T, theme, soloCerrar) {
        return new Promise((resolve) => {
            const existing = document.getElementById(PREVIEW_OVERLAY_ID);
            if (existing) existing.remove();

            const isDiff = current && current.state === 'ok';
            const loadFailed = current && current.state === 'failed';

            const overlay = el('div', 'nsft-diff-overlay');
            overlay.id = PREVIEW_OVERLAY_ID;
            overlay.setAttribute('data-theme', theme);
            const modal = el('div', 'nsft-diff-modal');

            const header = el('div', 'nsft-diff-header');
            const titleWrap = el('div', 'nsft-diff-title-wrap');
            const title = el('h3', 'nsft-diff-title');
            title.textContent = T.Title + ': ' + fileName;
            const subtitle = el('p', 'nsft-diff-subtitle');
            subtitle.textContent = T.Subtitle;
            titleWrap.appendChild(title);
            titleWrap.appendChild(subtitle);
            header.appendChild(titleWrap);
            const stats = el('div', 'nsft-diff-stats');
            header.appendChild(stats);
            modal.appendChild(header);

            let diffRows = null;
            let approx = false;
            let identical = false;

            if (isDiff) {
                const curLines = String(current.content || '').split(/\r?\n/);
                const newLines = String(newContent || '').split(/\r?\n/);
                const result = computeLineDiff(curLines, newLines);
                diffRows = result.rows;
                approx = result.approx;
                let adds = 0, removes = 0;
                for (const r of diffRows) {
                    if (r.type === 'add') adds++;
                    else if (r.type === 'remove') removes++;
                }
                identical = adds === 0 && removes === 0;
                const addBadge = el('span', 'nsft-diff-stat-add');
                addBadge.textContent = '+' + adds;
                const remBadge = el('span', 'nsft-diff-stat-remove');
                remBadge.textContent = '−' + removes;
                stats.appendChild(addBadge);
                stats.appendChild(remBadge);
            } else {
                const allLines = String(newContent || '').split(/\r?\n/);
                const lineBadge = el('span', 'nsft-diff-stat-add');
                lineBadge.textContent = allLines.length + ' ' + T.lines;
                const charBadge = el('span', 'nsft-diff-stat-add');
                charBadge.textContent = String(newContent || '').length + ' ' + T.chars;
                stats.appendChild(lineBadge);
                stats.appendChild(charBadge);
            }

            if (loadFailed) {
                const info = el('div', 'nsft-diff-info');
                info.textContent = T.LoadFailed;
                modal.appendChild(info);
            }
            if (identical) {
                const info = el('div', 'nsft-diff-info');
                info.textContent = T.NoChanges;
                modal.appendChild(info);
            }

            const body = el('div', 'nsft-diff-body');

            if (isDiff) {
                const colheader = el('div', 'nsft-diff-colheader');
                const cLeft = el('div', 'nsft-diff-colheader-cell');
                cLeft.textContent = T.Left;
                const cRight = el('div', 'nsft-diff-colheader-cell');
                cRight.textContent = T.Right;
                colheader.appendChild(cLeft);
                colheader.appendChild(cRight);
                body.appendChild(colheader);

                const truncated = diffRows.length > MAX_PREVIEW_LINES;
                const rows = truncated ? diffRows.slice(0, MAX_PREVIEW_LINES) : diffRows;
                if (approx || truncated) {
                    const warn = el('div', 'nsft-diff-warn');
                    warn.textContent = T.TooLarge;
                    modal.insertBefore(warn, body);
                }

                const panes = el('div', 'nsft-diff-panes');
                const leftPane = el('div', 'nsft-diff-pane');
                const rightPane = el('div', 'nsft-diff-pane');
                const lf = document.createDocumentFragment();
                const rf = document.createDocumentFragment();
                for (const r of rows) {
                    const leftKind = r.type === 'remove' ? 'remove' : (r.type === 'add' ? 'blank' : 'equal');
                    const rightKind = r.type === 'add' ? 'add' : (r.type === 'remove' ? 'blank' : 'equal');
                    lf.appendChild(buildPaneRow(r.l, r.lt, leftKind));
                    rf.appendChild(buildPaneRow(r.r, r.rt, rightKind));
                }
                leftPane.appendChild(lf);
                rightPane.appendChild(rf);
                panes.appendChild(leftPane);
                panes.appendChild(rightPane);
                body.appendChild(panes);

                syncScroll(leftPane, rightPane);
            } else {
                const allLines = String(newContent || '').split(/\r?\n/);
                const truncated = allLines.length > MAX_PREVIEW_LINES;
                const lines = truncated ? allLines.slice(0, MAX_PREVIEW_LINES) : allLines;
                if (truncated) {
                    const warn = el('div', 'nsft-diff-warn');
                    warn.textContent = T.TooLarge;
                    modal.insertBefore(warn, body);
                }
                const table = el('div', 'nsft-diff-table nsft-diff-prev-table');
                const frag = document.createDocumentFragment();
                for (let i = 0; i < lines.length; i++) frag.appendChild(buildPreviewRow(i + 1, lines[i]));
                table.appendChild(frag);
                body.appendChild(table);
            }
            modal.appendChild(body);

            const footer = el('div', 'nsft-diff-footer');
            const cancelBtn = el('button', 'nsft-diff-btn nsft-diff-btn-cancel');
            cancelBtn.type = 'button';
            cancelBtn.textContent = T.Cancel;
            const confirmBtn = el('button', 'nsft-diff-btn nsft-diff-btn-confirm');
            confirmBtn.type = 'button';
            confirmBtn.textContent = T.Confirm;
            if (!soloCerrar) footer.appendChild(cancelBtn);
            footer.appendChild(confirmBtn);
            modal.appendChild(footer);

            overlay.appendChild(modal);
            document.body.appendChild(overlay);

            setTimeout(() => { confirmBtn.focus(); }, 50);

            const cleanup = () => {
                overlay.remove();
                document.removeEventListener('keydown', onKey);
            };
            const onCancel = () => { cleanup(); resolve(false); };
            const onConfirm = () => { cleanup(); resolve(true); };
            const onKey = (e) => {
                if (e.key === 'Escape') { e.preventDefault(); onCancel(); }
            };
            cancelBtn.addEventListener('click', onCancel);
            confirmBtn.addEventListener('click', onConfirm);
            overlay.addEventListener('click', (e) => {
                if (e.target === overlay) onCancel();
            });
            document.addEventListener('keydown', onKey);
        });
    }

    function buildPreviewRow(num, text) {
        const row = el('div', 'nsft-diff-prev-row');
        const numCell = el('div', 'nsft-diff-linenum');
        numCell.textContent = num;
        const textCell = el('div', 'nsft-diff-text');
        textCell.textContent = text;
        row.appendChild(numCell);
        row.appendChild(textCell);
        return row;
    }

    function buildPaneRow(num, text, kind) {
        const row = el('div', 'nsft-diff-pane-row nsft-diff-pane-row-' + kind);
        const ln = el('div', 'nsft-diff-pane-linenum');
        ln.textContent = num == null ? '' : num;
        const code = el('div', 'nsft-diff-pane-code');
        code.textContent = text || '';
        row.appendChild(ln);
        row.appendChild(code);
        return row;
    }

    function syncScroll(a, b) {
        let lock = false;
        const mirror = (src, dst) => () => {
            if (lock) return;
            lock = true;
            dst.scrollTop = src.scrollTop;
            dst.scrollLeft = src.scrollLeft;
            lock = false;
        };
        a.addEventListener('scroll', mirror(a, b));
        b.addEventListener('scroll', mirror(b, a));
    }

    function computeLineDiff(aLines, bLines) {
        const aN = aLines.length, bN = bLines.length;
        const rows = [];

        let start = 0;
        const minLen = Math.min(aN, bN);
        while (start < minLen && aLines[start] === bLines[start]) start++;

        let aEnd = aN, bEnd = bN;
        while (aEnd > start && bEnd > start && aLines[aEnd - 1] === bLines[bEnd - 1]) { aEnd--; bEnd--; }

        for (let i = 0; i < start; i++) {
            rows.push({ type: 'equal', l: i + 1, lt: aLines[i], r: i + 1, rt: bLines[i] });
        }

        const aMid = aLines.slice(start, aEnd);
        const bMid = bLines.slice(start, bEnd);
        let approx = false;

        if (aMid.length * bMid.length > MAX_LCS_CELLS) {
            approx = true;
            for (let i = 0; i < aMid.length; i++) {
                rows.push({ type: 'remove', l: start + i + 1, lt: aMid[i], r: null, rt: '' });
            }
            for (let j = 0; j < bMid.length; j++) {
                rows.push({ type: 'add', l: null, lt: '', r: start + j + 1, rt: bMid[j] });
            }
        } else {
            const midRows = lcsDiff(aMid, bMid, start);
            for (const mr of midRows) rows.push(mr);
        }

        for (let k = 0; k < aN - aEnd; k++) {
            rows.push({ type: 'equal', l: aEnd + k + 1, lt: aLines[aEnd + k], r: bEnd + k + 1, rt: bLines[bEnd + k] });
        }

        return { rows, approx };
    }

    function lcsDiff(a, b, offset) {
        const n = a.length, m = b.length;
        const rows = [];
        if (n === 0 && m === 0) return rows;
        const dp = [];
        for (let i = 0; i <= n; i++) dp.push(new Uint32Array(m + 1));
        for (let i = n - 1; i >= 0; i--) {
            for (let j = m - 1; j >= 0; j--) {
                if (a[i] === b[j]) dp[i][j] = dp[i + 1][j + 1] + 1;
                else dp[i][j] = dp[i + 1][j] >= dp[i][j + 1] ? dp[i + 1][j] : dp[i][j + 1];
            }
        }
        let i = 0, j = 0;
        while (i < n && j < m) {
            if (a[i] === b[j]) {
                rows.push({ type: 'equal', l: offset + i + 1, lt: a[i], r: offset + j + 1, rt: b[j] });
                i++; j++;
            } else if (dp[i + 1][j] >= dp[i][j + 1]) {
                rows.push({ type: 'remove', l: offset + i + 1, lt: a[i], r: null, rt: '' });
                i++;
            } else {
                rows.push({ type: 'add', l: null, lt: '', r: offset + j + 1, rt: b[j] });
                j++;
            }
        }
        while (i < n) { rows.push({ type: 'remove', l: offset + i + 1, lt: a[i], r: null, rt: '' }); i++; }
        while (j < m) { rows.push({ type: 'add', l: null, lt: '', r: offset + j + 1, rt: b[j] }); j++; }
        return rows;
    }

    function show(o) {
        const op = o || {};
        const T = Object.assign({}, TEXTOS_POR_DEFECTO, op.labels || {});
        const theme = op.theme || temaDeLaPagina();
        return showDiffModal(
            op.current || { state: 'none', content: '' },
            op.newContent || '',
            op.fileName || '',
            T,
            theme === 'dark' ? 'dark' : 'light',
            !!op.viewOnly
        );
    }

    function temaDeLaPagina() {
        try {
            return document.documentElement.getAttribute('data-nsft-theme') === 'dark' ? 'dark' : 'light';
        } catch (e) { return 'light'; }
    }

    const TEXTOS_POR_DEFECTO = {
        Title: 'Confirm replacement',
        Subtitle: 'Comparing the current file with the new one. Review the changes before uploading.',
        Left: 'Current',
        Right: 'New',
        Cancel: 'Cancel',
        Confirm: 'Upload and replace',
        NoChanges: 'No changes. The file is identical to the current one.',
        TooLarge: 'File too large to show the full diff. Only the first 5000 lines are shown.',
        LoadFailed: 'Could not fetch the current file. Only the new content is shown.',
        lines: 'lines',
        chars: 'chars'
    };

    window.NSFT_Diff = { show: show, computeLineDiff: computeLineDiff };
})();
