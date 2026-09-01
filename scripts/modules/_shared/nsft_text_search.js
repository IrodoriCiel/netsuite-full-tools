(function () {
    'use strict';

    if (window.NSFT_TextSearch) return;

    const RE_ASCII = /^[\x00-\x7F]*$/;
    const RE_COMB = /[\u0300-\u036f]/g;

    function fold(s) {
        const str = String(s == null ? '' : s);
        if (RE_ASCII.test(str)) return str.toLowerCase();
        return str.normalize('NFD').replace(RE_COMB, '').toLowerCase();
    }

    function foldMap(s) {
        let folded = '';
        const map = [];
        for (let i = 0; i < s.length; i++) {
            const f = fold(s.charAt(i));
            for (let k = 0; k < f.length; k++) map.push(i);
            folded += f;
        }
        map.push(s.length);
        return { folded: folded, map: map };
    }

    function foldAligned(s) {
        const str = String(s == null ? '' : s);
        if (RE_ASCII.test(str)) return str.toLowerCase();
        let out = '';
        for (let i = 0; i < str.length; i++) {
            const f = fold(str.charAt(i));
            out += (f.length === 1) ? f : (f.charAt(0) || str.charAt(i));
        }
        return out;
    }

    function match(hay, needle) {
        const n = fold(needle);
        if (!n) return true;
        return fold(hay).indexOf(n) !== -1;
    }

    function ranges(text, needle) {
        const s = String(text == null ? '' : text);
        const n = fold(needle);
        if (!s || !n) return [];

        const out = [];
        if (RE_ASCII.test(s)) {
            const low = s.toLowerCase();
            let i = low.indexOf(n);
            while (i !== -1) {
                out.push({ start: i, end: i + n.length });
                i = low.indexOf(n, i + n.length);
            }
            return out;
        }

        const fm = foldMap(s);
        let i = fm.folded.indexOf(n);
        while (i !== -1) {
            const start = fm.map[i];
            const end = fm.map[i + n.length];
            if (end > start) out.push({ start: start, end: end });
            i = fm.folded.indexOf(n, i + n.length);
        }
        return out;
    }

    function mark(el, texto, needle, className) {
        const s = String(texto == null ? '' : texto);
        el.textContent = '';
        const tramos = ranges(s, needle);
        if (!tramos.length) { el.textContent = s; return el; }
        const cls = className || 'nsft-hl';
        let from = 0;
        tramos.forEach(function (r) {
            if (r.start > from) el.appendChild(document.createTextNode(s.slice(from, r.start)));
            const m = document.createElement('mark');
            m.className = cls;
            m.textContent = s.slice(r.start, r.end);
            el.appendChild(m);
            from = r.end;
        });
        if (from < s.length) el.appendChild(document.createTextNode(s.slice(from)));
        return el;
    }

    function escapeHtml(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
    }

    function markHtml(texto, needle, className) {
        const s = String(texto == null ? '' : texto);
        const tramos = ranges(s, needle);
        if (!tramos.length) return escapeHtml(s);
        const cls = className || 'nsft-hl';
        let out = '', from = 0;
        tramos.forEach(function (r) {
            out += escapeHtml(s.slice(from, r.start))
                + '<mark class="' + cls + '">' + escapeHtml(s.slice(r.start, r.end)) + '</mark>';
            from = r.end;
        });
        return out + escapeHtml(s.slice(from));
    }


    const SQL_ACENTOS = '\u00C0\u00C1\u00C2\u00C3\u00C4\u00C5\u00C7\u00C8\u00C9\u00CA\u00CB\u00CC\u00CD\u00CE\u00CF\u00D1\u00D2\u00D3\u00D4\u00D5\u00D6\u00D9\u00DA\u00DB\u00DC\u00DD\u00E0\u00E1\u00E2\u00E3\u00E4\u00E5\u00E7\u00E8\u00E9\u00EA\u00EB\u00EC\u00ED\u00EE\u00EF\u00F1\u00F2\u00F3\u00F4\u00F5\u00F6\u00F9\u00FA\u00FB\u00FC\u00FD\u00FF';
    const SQL_LLANOS = '\u0041\u0041\u0041\u0041\u0041\u0041\u0043\u0045\u0045\u0045\u0045\u0049\u0049\u0049\u0049\u004E\u004F\u004F\u004F\u004F\u004F\u0055\u0055\u0055\u0055\u0059\u0061\u0061\u0061\u0061\u0061\u0061\u0063\u0065\u0065\u0065\u0065\u0069\u0069\u0069\u0069\u006E\u006F\u006F\u006F\u006F\u006F\u0075\u0075\u0075\u0075\u0079\u0079';

    function sqlFold(expr) {
        const e = String(expr == null ? '' : expr).trim();
        if (!/^[A-Za-z_][A-Za-z0-9_.]*$/.test(e)) {
            throw new Error('NSFT_TextSearch.sqlFold: expresión no válida como identificador: ' + e);
        }
        return "UPPER(TRANSLATE(" + e + ", '" + SQL_ACENTOS + "', '" + SQL_LLANOS + "'))";
    }

    function sqlTerm(s) {
        return fold(s).toUpperCase();
    }

    window.NSFT_TextSearch = {
        fold: fold,
        foldAligned: foldAligned,
        match: match,
        ranges: ranges,
        mark: mark,
        markHtml: markHtml,
        sqlFold: sqlFold,
        sqlTerm: sqlTerm
    };
})();
