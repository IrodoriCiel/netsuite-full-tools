(function () {
    'use strict';

    if (window.NSFT_ChartCore) return;

    const t = (key, fallback) => {
        try { return chrome.i18n.getMessage(key) || fallback; } catch (e) { return fallback; }
    };

    function palette(n) {
        const base = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6',
            '#ec4899', '#14b8a6', '#f97316', '#6366f1', '#84cc16'];
        const out = [];
        for (let i = 0; i < n; i++) out.push(base[i % base.length]);
        return out;
    }

    function buildSeries(data, xField, yFields, agg) {
        const toNum = (v) => { const n = Number(v); return isFinite(n) ? n : 0; };

        if (agg === 'none') {
            const labels = data.map(r => String(r[xField]));
            const series = yFields.map(f => ({ label: f, values: data.map(r => toNum(r[f])) }));
            return { labels, series };
        }

        const order = [];
        const buckets = new Map();
        data.forEach(r => {
            const key = String(r[xField]);
            if (!buckets.has(key)) { buckets.set(key, { count: 0, sums: {} }); order.push(key); }
            const b = buckets.get(key);
            b.count++;
            yFields.forEach(f => { b.sums[f] = (b.sums[f] || 0) + toNum(r[f]); });
        });

        const labels = order;
        if (agg === 'count') {
            return {
                labels,
                series: [{ label: t('sql_chart_agg_count', 'Count'), values: labels.map(k => buckets.get(k).count) }]
            };
        }
        const series = yFields.map(f => ({
            label: f,
            values: labels.map(k => {
                const b = buckets.get(k);
                return agg === 'avg' ? (b.count ? b.sums[f] / b.count : 0) : b.sums[f];
            })
        }));
        return { labels, series };
    }

    function buildConfig(o) {
        const type = o.type || 'bar';
        const isPie = type === 'pie';
        const series = o.series || [];
        const labels = o.labels || [];
        const dark = o.theme === 'dark';
        const fg = dark ? '#cbd5e1' : '#374151';
        const grid = dark ? 'rgba(203,213,225,0.12)' : 'rgba(55,65,81,0.12)';
        const colors = palette(Math.max(series.length, labels.length));

        const datasets = isPie
            ? [{ data: series[0] ? series[0].values : [], backgroundColor: colors, borderWidth: 1 }]
            : series.map((s, i) => ({
                label: s.label,
                data: s.values,
                backgroundColor: colors[i % colors.length],
                borderColor: colors[i % colors.length],
                borderWidth: type === 'line' ? 2 : 1,
                fill: false,
                tension: 0.2
            }));

        return {
            type,
            data: { labels, datasets },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: isPie || series.length > 1, labels: { color: fg } },
                    title: { display: !!o.title, text: o.title || '', color: fg }
                },
                scales: isPie ? {} : {
                    x: { ticks: { color: fg }, grid: { color: grid } },
                    y: { ticks: { color: fg }, grid: { color: grid }, beginAtZero: true }
                }
            }
        };
    }

    function isNumericColumn(data, col) {
        const rowCap = Math.min(data.length, 500);
        let seen = 0;
        for (let i = 0; i < rowCap && seen < 50; i++) {
            const v = data[i][col];
            if (v === null || v === undefined || v === '') continue;
            seen++;
            if (typeof v !== 'number' && !(typeof v === 'string' && v.trim() !== '' && isFinite(Number(v)))) return false;
        }
        return seen > 0;
    }

    function canvasToPngBlob(canvas, bgColor, scale) {
        return new Promise((resolve) => {
            if (!canvas) { resolve(null); return; }
            const s = scale || 2;
            const out = document.createElement('canvas');
            out.width = canvas.width * s;
            out.height = canvas.height * s;
            const ctx = out.getContext('2d');
            ctx.fillStyle = bgColor || '#ffffff';
            ctx.fillRect(0, 0, out.width, out.height);
            ctx.drawImage(canvas, 0, 0, out.width, out.height);
            out.toBlob((b) => resolve(b), 'image/png');
        });
    }

    function downloadBlob(blob, filename) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    window.NSFT_ChartCore = {
        palette, buildSeries, buildConfig, isNumericColumn,
        canvasToPngBlob, downloadBlob,
        HANDOFF_KEY: 'nsftSqlChartHandoff'
    };
})();
