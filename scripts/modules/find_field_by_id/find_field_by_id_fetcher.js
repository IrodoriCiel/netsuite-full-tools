(function () {
    'use strict';

    let TRANSLATIONS = {};
    let NSFT_THEME = 'light';
    let HL_COLOR = 'green';
    let HL_PERSIST = false;
    let _pendingShow = false;

    window.addEventListener('message', function (event) {
        if (event.source !== window || !event.data) return;
        if (event.data.type === 'nsft-find-field-by-id-init') {
            TRANSLATIONS = event.data.translations;
            if (event.data.theme) NSFT_THEME = event.data.theme;
            if (event.data.highlightColor) HL_COLOR = event.data.highlightColor;
            if (typeof event.data.highlightPersist === 'boolean') HL_PERSIST = event.data.highlightPersist;
            fieldId_init();
            if (_pendingShow && typeof window.nsftFindFieldByIdShow === 'function') {
                _pendingShow = false;
                window.nsftFindFieldByIdShow();
            }
        } else if (event.data.type === 'nsft-find-field-by-id-config') {
            if (event.data.highlightColor) HL_COLOR = event.data.highlightColor;
            if (typeof event.data.highlightPersist === 'boolean') HL_PERSIST = event.data.highlightPersist;
        } else if (event.data.type === 'nsft-find-field-by-id-theme') {
            NSFT_THEME = event.data.theme || 'light';
            document.querySelectorAll('.nsft-ffi-modal-overlay').forEach(el => {
                el.setAttribute('data-theme', NSFT_THEME);
            });
        } else if (event.data.type === 'nsft-find-field-by-id-show') {
            if (typeof window.nsftFindFieldByIdShow === 'function') {
                window.nsftFindFieldByIdShow();
            } else {
                _pendingShow = true;
            }
        }
    });

    window.fieldId_init = function () {
        try {
            if (!window.nsftFieldIdsAdded) {
                (function () {
                    if (window.jQuery) {
                        function fieldIdFromAnchor(a) {
                            const oc = String(a.getAttribute ? (a.getAttribute('onclick') || '') : '');
                            if (oc.indexOf('nlFieldHelp') === -1) return '';
                            const m = oc.match(/nlFieldHelp\s*\(\s*(['"])(?:[^'"]*)\1\s*,\s*(['"])([^'"]*)\2/);
                            return m ? m[3] : '';
                        }

                        const HL_CLASSES = 'nsft-ffi-hl-green nsft-ffi-hl-yellow nsft-ffi-hl-cyan nsft-ffi-hl-pink';
                        function esc(s) {
                            return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
                        }

                        function buildFieldIndex() {
                            const seen = new Set();
                            const items = [];
                            jQuery("span[id$='_lbl'] a").each(function () {
                                const oc = String(this.getAttribute('onclick') || '');
                                if (oc.indexOf('nlFieldHelp') === -1) return;
                                const id = fieldIdFromAnchor(this);
                                const label = jQuery(this).text().trim();
                                if (!id && !label) return;
                                const key = id + '||' + label;
                                if (seen.has(key)) return;
                                seen.add(key);
                                items.push({ id: id, label: label, el: this });
                            });
                            return items;
                        }

                        function ffFold(s) {
                            const TS = window.NSFT_TextSearch;
                            return TS ? TS.fold(s) : String(s == null ? '' : s).toLowerCase();
                        }

                        function ffFoldChars(s) {
                            const t = String(s == null ? '' : s);
                            let out = '';
                            for (let i = 0; i < t.length; i++) {
                                const f = ffFold(t.charAt(i));
                                out += (f.length === 1) ? f : (f.charAt(0) || t.charAt(i));
                            }
                            return out;
                        }

                        function fuzzyScore(needle, hay) {
                            needle = ffFold(needle);
                            hay = ffFold(hay);
                            if (!needle) return 0;
                            let hi = 0, score = 0, consecutive = 0;
                            for (let i = 0; i < needle.length; i++) {
                                let found = -1;
                                for (let k = hi; k < hay.length; k++) { if (hay[k] === needle[i]) { found = k; break; } }
                                if (found === -1) return -1;
                                consecutive = (found === hi) ? consecutive + 1 : 0;
                                score += 1 + consecutive;
                                hi = found + 1;
                            }
                            if (hay.indexOf(needle) !== -1) score += 5;
                            return score;
                        }

                        function jumpToField(el) {
                            const $a = jQuery(el);

                            let $el = $a.closest('.uir-field-wrapper');
                            if (!$el.length) $el = $a.closest('td');
                            if (!$el.length) $el = $a;

                            const colorClass = 'nsft-ffi-hl-' + (HL_COLOR || 'green');
                            $el.addClass('nsft-ffi-highlight ' + colorClass);

                            const nav = window.NSFT_FieldNav;
                            if (nav && nav.goToField) {
                                nav.goToField($el[0] || el);
                            } else {
                                const pos = $el.offset();
                                if (pos) window.scrollTo((pos.left - 20 < 0 ? 0 : pos.left - 20), (pos.top - 150 < 0 ? 0 : pos.top - 150));
                            }

                            const clearHl = () => $el.removeClass('nsft-ffi-highlight ' + HL_CLASSES);
                            if (HL_PERSIST) {
                                const onClick = () => { clearHl(); document.removeEventListener('click', onClick, true); };
                                setTimeout(() => document.addEventListener('click', onClick, true), 0);
                            } else {
                                $el.one('mouseenter', clearHl);
                            }
                        }

                        function showFinderModal() {
                            const items = buildFieldIndex();
                            const prevFocus = document.activeElement;
                            const modalId = 'nsft-ffi-' + Date.now();
                            const html = `
                                <div id="${modalId}" class="nsft-ffi-modal-overlay nsft-modal-backdrop" data-theme="${NSFT_THEME}" role="dialog" aria-modal="true" aria-label="${esc(TRANSLATIONS.ffi_prompt_generic)}">
                                    <div class="nsft-ffi-modal-content nsft-modal nsft-modal--dialog" data-theme="${NSFT_THEME}">
                                        <div class="nsft-modal-header">
                                            <span class="nsft-modal-title"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>NetSuite Full Tools - ${esc(TRANSLATIONS.ffi_modal_title || 'Buscar Campo por ID')}</span>
                                            <div class="nsft-header-actions">
                                                <button id="${modalId}-close" class="nsft-modal-btn-close" aria-label="${esc(TRANSLATIONS.ffi_btn_cancel)}">✕</button>
                                            </div>
                                        </div>
                                        <div class="nsft-ffi-modal-body">
                                            <div class="nsft-ffi-input-wrap">
                                                <input type="text" id="${modalId}-input" class="nsft-ffi-modal-input" placeholder="${esc(TRANSLATIONS.ffi_placeholder)}" role="combobox" aria-controls="${modalId}-list" aria-expanded="true" autocomplete="off" />
                                                <button type="button" id="${modalId}-clear" class="nsft-ffi-input-clear" aria-label="${esc(TRANSLATIONS.ffi_clear || 'Clear')}" title="${esc(TRANSLATIONS.ffi_clear || '')}" hidden>✕</button>
                                            </div>
                                            <ul id="${modalId}-list" class="nsft-ffi-results" role="listbox"></ul>
                                        </div>
                                    </div>
                                </div>`;
                            jQuery('body').append(html);

                            const $modal = jQuery('#' + modalId);
                            const $input = jQuery('#' + modalId + '-input');
                            const $list = jQuery('#' + modalId + '-list');
                            let current = [];
                            let active = -1;

                            const close = () => {
                                $modal.remove();
                                document.removeEventListener('keydown', onKey, true);
                                if (prevFocus && typeof prevFocus.focus === 'function') { try { prevFocus.focus(); } catch (_) { } }
                            };

                            function markMatch(text, needle) {
                                const t = String(text || '');
                                const n = String(needle || '').trim();
                                if (!n) return esc(t);

                                const TS = window.NSFT_TextSearch;
                                if (TS) {
                                    const rs = TS.ranges(t, n);
                                    if (rs.length) {
                                        let out = '', from = 0;
                                        rs.forEach((r) => {
                                            out += esc(t.slice(from, r.start))
                                                + '<mark class="nsft-ffi-hl-txt">' + esc(t.slice(r.start, r.end)) + '</mark>';
                                            from = r.end;
                                        });
                                        return out + esc(t.slice(from));
                                    }
                                } else {
                                    const at = t.toLowerCase().indexOf(n.toLowerCase());
                                    if (at !== -1) {
                                        return esc(t.slice(0, at))
                                            + '<mark class="nsft-ffi-hl-txt">' + esc(t.slice(at, at + n.length)) + '</mark>'
                                            + esc(t.slice(at + n.length));
                                    }
                                }

                                const tf = ffFoldChars(t);
                                const ln = ffFoldChars(n);
                                let out = '';
                                let j = 0;
                                for (let i = 0; i < t.length; i++) {
                                    const c = t.charAt(i);
                                    if (j < ln.length && tf.charAt(i) === ln.charAt(j)) {
                                        out += '<mark class="nsft-ffi-hl-txt">' + esc(c) + '</mark>';
                                        j++;
                                    } else {
                                        out += esc(c);
                                    }
                                }
                                return j === ln.length ? out : esc(t);
                            }

                            function render(q) {
                                const needle = String(q || '').trim();
                                if (!needle) {
                                    current = items.slice(0, 50);
                                } else {
                                    current = items
                                        .map(it => ({ it, s: Math.max(fuzzyScore(needle, it.id), fuzzyScore(needle, it.label)) }))
                                        .filter(x => x.s >= 0)
                                        .sort((a, b) => b.s - a.s)
                                        .slice(0, 50)
                                        .map(x => x.it);
                                }
                                if (!current.length) {
                                    active = -1;
                                    $list.html(`<li class="nsft-ffi-empty">${esc((TRANSLATIONS.ffi_field_not_found || '$1').replace('$1', needle))}</li>`);
                                    return;
                                }
                                active = 0;
                                $list.html(current.map((it, i) => `
                                    <li class="nsft-ffi-result${i === 0 ? ' is-active' : ''}" role="option" data-i="${i}">
                                        <span class="nsft-ffi-result-label">${markMatch(it.label || it.id, needle)}</span>
                                        ${it.id ? `<span class="nsft-ffi-result-id">${markMatch(it.id, needle)}</span>` : ''}
                                    </li>`).join(''));
                            }

                            function setActive(i) {
                                const lis = $list.find('.nsft-ffi-result');
                                if (!lis.length) return;
                                active = (i + lis.length) % lis.length;
                                lis.removeClass('is-active');
                                const li = lis.eq(active).addClass('is-active');
                                if (li[0] && li[0].scrollIntoView) li[0].scrollIntoView({ block: 'nearest' });
                            }

                            function choose(i) {
                                const it = current[i];
                                if (!it) return;
                                close();
                                jumpToField(it.el);
                            }

                            function onKey(e) {
                                if (!document.getElementById(modalId)) return;
                                if (e.key === 'Escape') { e.preventDefault(); close(); }
                                else if (e.key === 'ArrowDown') { e.preventDefault(); setActive(active + 1); }
                                else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(active - 1); }
                                else if (e.key === 'Enter') { e.preventDefault(); choose(active >= 0 ? active : 0); }
                                else if (e.key === 'Tab') { e.preventDefault(); $input.focus(); }
                            }

                            document.addEventListener('keydown', onKey, true);
                            const $clear = jQuery('#' + modalId + '-clear');
                            const syncClear = () => { $clear.prop('hidden', !String($input.val() || '').length); };
                            $clear.on('click', function () {
                                $input.val('');
                                syncClear();
                                render('');
                                $input.focus();
                            });
                            $input.on('input', function () { syncClear(); render(this.value); });
                            $list.on('click', '.nsft-ffi-result', function () { choose(parseInt(jQuery(this).attr('data-i'), 10)); });
                            $list.on('mousemove', '.nsft-ffi-result', function () {
                                const i = parseInt(jQuery(this).attr('data-i'), 10);
                                if (i !== active) setActive(i);
                            });
                            jQuery('#' + modalId + '-close').on('click', close);
                            $modal.on('click', function (e) { if (e.target.id === modalId) close(); });

                            render('');
                            $input.focus();
                        }

                        window.nsftFindFieldByIdShow = showFinderModal;


                        jQuery("span[id$='_lbl'] a").each(function () {
                            const onClick = String(jQuery(this).attr("onclick"));

                            if (onClick && onClick.indexOf("nlFieldHelp") !== -1) {
                                let resultAry = onClick.match(/"([^"]*)"/g);
                                let single = false;

                                if (!resultAry) {
                                    resultAry = onClick.match(/'([^']*)'/g);
                                    single = true;
                                }

                                if (resultAry && resultAry.length > 1) {
                                    let fieldId = '';
                                    if (single) {
                                        fieldId = resultAry[1].replace(/'/g, "");
                                    } else {
                                        fieldId = resultAry[1].replace(/"/g, '');
                                    }

                                    jQuery(this).attr("title", fieldId).bind("click", function (e) {
                                        if (e.shiftKey) {
                                            jQuery('div[data-window-button="close"]').click();

                                            const onCopied = () => {
                                                jQuery('.x-tool-close').click();
                                                showNotification(TRANSLATIONS.ffi_id_copied, 'success');
                                            };

                                            if (navigator.clipboard && navigator.clipboard.writeText) {
                                                navigator.clipboard.writeText(fieldId).then(onCopied).catch(() => showNotification(TRANSLATIONS.ffi_copy_manual, 'error'));
                                            } else {
                                                try {
                                                    const ta = document.createElement('textarea');
                                                    ta.value = fieldId;
                                                    ta.style.position = 'fixed';
                                                    ta.style.opacity = '0';
                                                    document.body.appendChild(ta);
                                                    ta.select();
                                                    document.execCommand('copy');
                                                    ta.remove();
                                                    onCopied();
                                                } catch (err) {
                                                    showNotification(TRANSLATIONS.ffi_copy_manual, 'error');
                                                }
                                            }
                                        }
                                    });
                                }
                            }
                        });

                    }
                    window.nsftFieldIdsAdded = true;
                }());
            }
        } catch (e) {
        }
    };

    function showNotification(message, type = 'info') {
        const toastType = (type === 'error' || type === 'success') ? type : 'info';
        let container = document.querySelector('.nsft-clipboard-toast-container');
        if (!container) {
            container = document.createElement('div');
            container.className = 'nsft-clipboard-toast-container';
            document.body.appendChild(container);
        }
        container.setAttribute('data-theme', NSFT_THEME === 'dark' ? 'dark' : 'light');

        const icons = {
            error: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>',
            info: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line><circle cx="12" cy="12" r="10"></circle></svg>',
            success: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>'
        };

        const toast = document.createElement('div');
        toast.className = 'nsft-clipboard-toast nsft-clipboard-toast-' + toastType;
        toast.innerHTML = `<span class="nsft-clipboard-toast-icon">${icons[toastType] || icons.info}</span>` +
            `<div class="nsft-clipboard-toast-body"><div class="nsft-clipboard-toast-title"></div></div>`;
        toast.querySelector('.nsft-clipboard-toast-title').textContent = message;
        container.appendChild(toast);

        requestAnimationFrame(() => toast.classList.add('is-visible'));
        setTimeout(() => {
            toast.classList.remove('is-visible');
            toast.addEventListener('transitionend', () => toast.remove(), { once: true });
            setTimeout(() => { if (toast.parentNode) toast.remove(); }, 500);
        }, 3000);
    }

})();
