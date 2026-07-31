(function () {
    'use strict';

    if (window.NSFT_RecordButtons) return;

    const EXCLUDED_PATHS = [
        '/app/common/custom/custrecord.nl',
        '/app/site/hosting/scriptlet.nl',
        '/app/common/record/edittextmediaitem.nl',
        '/app/bundler/previewbundleupdate.nl',
        '/app/bundler/installbundle.nl',
        '/app/bundler/bundledetails.nl',
        '/app/setup/assistants/bundlebuilder.nl',
        '/app/common/bulk/bulksummary.nl',
        '/app/common/workflow/',
        '/app/login/'
    ];

    function isExcludedPage() {
        const href = window.location.href;
        return EXCLUDED_PATHS.some(p => href.includes(p));
    }

    const HEADERLESS_PATHS = [
        '/app/login/'
    ];
    function isHeaderlessPage() {
        const href = window.location.href;
        return HEADERLESS_PATHS.some(p => href.includes(p));
    }

    function hasRecordId() {
        return !!new URLSearchParams(window.location.search).get('id');
    }

    function isEditMode() {
        return /[?&]e=[Tt]/.test(window.location.search);
    }

    function attachButtonEffects(btn) {
        btn.setAttribute('onmousedown', "this.setAttribute('_mousedown','T'); try{setButtonDown(true, false, this);}catch(e){}");
        btn.setAttribute('onmouseup', "this.setAttribute('_mousedown','F'); try{setButtonDown(false, false, this);}catch(e){}");
        btn.setAttribute('onmouseout', "if(this.getAttribute('_mousedown')=='T') { try{setButtonDown(false, false, this);}catch(e){} }");
        btn.setAttribute('onmouseover', "if(this.getAttribute('_mousedown')=='T') { try{setButtonDown(true, false, this);}catch(e){} }");
    }

    function isRedwoodToolbar() {
        return !!document.querySelector('button.uir-button[data-button-type]');
    }

    function createRedwoodButton(opts) {
        const { tableId, btnId, label, onclick, isSecondary = false, variant = 'primary' } = opts;

        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'uir-button';
        if (variant === 'danger') {
            button.setAttribute('data-button-type', 'primary');
            button.style.backgroundColor = '#cc0000';
            button.style.borderColor = '#cc0000';
            button.style.color = '#fff';
        } else {
            button.setAttribute('data-button-type', variant);
        }
        button.setAttribute('data-with-icon', 'false');
        button.setAttribute('data-with-label', 'true');
        if (btnId) button.id = btnId;
        if (tableId) button.setAttribute('data-nsft-table-id', tableId);
        if (onclick) button.setAttribute('onclick', onclick);
        if (isSecondary) button.style.marginRight = '6px';

        const labelSpan = document.createElement('span');
        labelSpan.className = 'uir-button-label';
        labelSpan.textContent = label;
        button.appendChild(labelSpan);

        return { table: button, tr: button, tdLeft: button, tdBody: button, tdRight: button, btn: button };
    }

    function createButtonTable(opts) {
        if (isRedwoodToolbar()) return createRedwoodButton(opts);

        const { tableId, btnId, label, onclick, isSecondary = false } = opts;

        const table = document.createElement('table');
        if (tableId) table.id = tableId;
        table.cellPadding = '0';
        table.cellSpacing = '0';
        table.border = '0';
        table.className = 'uir-button';
        table.setAttribute('role', 'presentation');
        if (isSecondary) table.style.marginRight = '6px';

        const tbody = document.createElement('tbody');
        const tr = document.createElement('tr');
        tr.className = 'pgBntG pgBntB';

        const tdLeft = document.createElement('td');
        tdLeft.innerHTML = '<img src="/images/nav/ns_x.gif" class="bntLT" border="0" height="50%" width="3" alt=""><img src="/images/nav/ns_x.gif" class="bntLB" border="0" height="50%" width="3" alt="">';

        const tdBody = document.createElement('td');
        tdBody.height = '20';
        tdBody.vAlign = 'top';
        tdBody.noWrap = true;
        tdBody.className = 'bntBgB';

        const btn = document.createElement('input');
        btn.type = 'button';
        btn.className = 'rndbuttoninpt bntBgT';
        btn.value = label;
        if (btnId) btn.id = btnId;

        attachButtonEffects(btn);
        if (onclick) btn.setAttribute('onclick', onclick);

        tdBody.appendChild(btn);

        const tdRight = document.createElement('td');
        tdRight.innerHTML = '<img src="/images/nav/ns_x.gif" height="50%" class="bntRT" border="0" width="3" alt=""><img src="/images/nav/ns_x.gif" height="50%" class="bntRB" border="0" width="3" alt="">';

        tr.appendChild(tdLeft);
        tr.appendChild(tdBody);
        tr.appendChild(tdRight);
        tbody.appendChild(tr);
        table.appendChild(tbody);

        return { table, tr, tdLeft, tdBody, tdRight, btn };
    }

    function getWrapperTd(btnElement) {
        if (!btnElement) return null;

        if (btnElement.id === 'btn_multibutton_submitter') {
            const DOM = window.NSFT_DOM;
            const multiWrapper = DOM
                ? DOM.q(['td.uir-multi-button-wrapper', 'td[class*="multi-button-wrapper"]'], { module: 'record_buttons', purpose: 'multi button wrapper' })
                : document.querySelector('td.uir-multi-button-wrapper');
            if (multiWrapper) return multiWrapper;
        }

        const redwoodWrapper = btnElement.closest('td.uir-button-wrapper');
        if (redwoodWrapper) return redwoodWrapper;

        let container = btnElement.closest('.uir-button-menu') || btnElement.closest('table.uir-button') || btnElement.parentNode;
        if (container && container.tagName === 'TABLE') {
            container = container.parentNode;
        }
        return container;
    }

    function injectAfter(anchorBtn, newButtonTable) {
        const container = getWrapperTd(anchorBtn);
        if (!container || !container.parentNode) return false;

        const newTd = document.createElement('td');
        if (container.classList && container.classList.contains('uir-button-wrapper')) {
            newTd.className = 'uir-button-wrapper';
        }
        newTd.appendChild(newButtonTable);

        if (container.nextSibling) {
            container.parentNode.insertBefore(newTd, container.nextSibling);
        } else {
            container.parentNode.appendChild(newTd);
        }
        return true;
    }

    function findSaveBtn() {
        return document.getElementById('submitter') || document.getElementById('btn_multibutton_submitter');
    }
    function findSecondarySaveBtn() {
        return document.getElementById('secondarysubmitter') || document.getElementById('secondary_btn_multibutton_submitter');
    }
    function findEditBtn() {
        return document.getElementById('edit') || document.getElementById('tbl_edit');
    }
    function findSecondaryEditBtn() {
        return document.getElementById('secondaryedit') || document.querySelector('input#secondaryedit');
    }

    window.NSFT_RecordButtons = {
        isExcludedPage,
        isHeaderlessPage,
        hasRecordId,
        isEditMode,
        attachButtonEffects,
        createButtonTable,
        getWrapperTd,
        injectAfter,
        findSaveBtn,
        findSecondarySaveBtn,
        findEditBtn,
        findSecondaryEditBtn
    };
})();
