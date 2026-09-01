(function () {
    'use strict';

    const I18N = (() => {
        try { return JSON.parse(document.currentScript?.dataset?.nsftI18n || '{}'); }
        catch (e) { return {}; }
    })();
    const t = (clave, reserva) => I18N[clave] || reserva;

    const PANEL_ID = 'nsft-wf-progress-panel';
    const STAGE_LABELS = {
        workflow: t('wfs_stage_workflow', 'Estructura del workflow'),
        state: t('wfs_states', 'Estados'),
        actions: t('wfs_actions', 'Acciones')
    };

    const STYLES = `
        <style>
            #${PANEL_ID} {
                position: fixed;
                right: 20px;
                bottom: 20px;
                width: 320px;
                background: #ffffff;
                border: 1px solid rgba(0, 0, 0, 0.08);
                border-radius: 12px;
                box-shadow: 0 12px 32px rgba(0, 0, 0, 0.18), 0 4px 8px rgba(0, 0, 0, 0.06);
                overflow: hidden;
                font-family: 'Segoe UI', 'Helvetica Neue', Arial, sans-serif;
                z-index: 2147483600;
                transform: translateX(calc(100% + 32px));
                opacity: 0;
                transition: transform 280ms cubic-bezier(0.34, 1.56, 0.64, 1), opacity 200ms ease;
            }
            #${PANEL_ID}.is-visible {
                transform: translateX(0);
                opacity: 1;
            }
            #${PANEL_ID}.is-closing {
                transform: translateX(calc(100% + 32px));
                opacity: 0;
                transition: transform 220ms ease, opacity 200ms ease;
            }
            #${PANEL_ID} .wfp-head {
                display: flex;
                align-items: center;
                gap: 10px;
                padding: 12px 16px;
                background: linear-gradient(135deg, #4a6fa5, #3b5a85);
                color: #fff;
                font-size: 13px;
                font-weight: 600;
                letter-spacing: 0.2px;
            }
            #${PANEL_ID} .wfp-head-dot {
                width: 8px;
                height: 8px;
                border-radius: 50%;
                background: #fff;
                box-shadow: 0 0 0 3px rgba(255, 255, 255, 0.25);
                animation: nsft-wfp-pulse 1.4s ease-in-out infinite;
                flex-shrink: 0;
            }
            #${PANEL_ID} .wfp-head-title {
                flex: 1;
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
            }
            #${PANEL_ID} .wfp-body {
                padding: 12px 16px 14px;
                display: flex;
                flex-direction: column;
                gap: 10px;
            }
            #${PANEL_ID} .wfp-row {
                display: flex;
                flex-direction: column;
                gap: 5px;
                animation: nsft-wfp-row-in 220ms ease-out;
            }
            #${PANEL_ID} .wfp-row-meta {
                display: flex;
                align-items: center;
                gap: 8px;
                font-size: 12px;
                color: #4a5568;
            }
            #${PANEL_ID} .wfp-row-dot {
                width: 6px;
                height: 6px;
                border-radius: 50%;
                background: #4a6fa5;
                box-shadow: 0 0 0 2px rgba(74, 111, 165, 0.18);
                flex-shrink: 0;
            }
            #${PANEL_ID} .wfp-row[data-status="done"] .wfp-row-dot {
                background: #28a745;
                box-shadow: 0 0 0 2px rgba(40, 167, 69, 0.18);
            }
            #${PANEL_ID} .wfp-row[data-status="active"] .wfp-row-dot {
                animation: nsft-wfp-pulse 1.2s ease-in-out infinite;
            }
            #${PANEL_ID} .wfp-row-label {
                flex: 1;
                font-weight: 600;
                color: #2d3748;
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
            }
            #${PANEL_ID} .wfp-row-count {
                font-variant-numeric: tabular-nums;
                color: #6b7280;
                font-size: 11px;
            }
            #${PANEL_ID} .wfp-row-bar {
                position: relative;
                width: 100%;
                height: 5px;
                background: #edf0f4;
                border-radius: 999px;
                overflow: hidden;
            }
            #${PANEL_ID} .wfp-row-bar-fill {
                position: absolute;
                left: 0;
                top: 0;
                bottom: 0;
                width: 0%;
                background: linear-gradient(90deg, #4a6fa5, #6a8ec5);
                border-radius: 999px;
                transition: width 260ms ease;
            }
            #${PANEL_ID} .wfp-row[data-status="done"] .wfp-row-bar-fill {
                background: linear-gradient(90deg, #28a745, #48c862);
            }
            #${PANEL_ID} .wfp-row[data-indeterminate="true"] .wfp-row-bar-fill {
                width: 35% !important;
                background: linear-gradient(90deg, transparent, #4a6fa5, transparent);
                animation: nsft-wfp-indeterm 1.4s ease-in-out infinite;
            }
            @keyframes nsft-wfp-pulse {
                0%, 100% { opacity: 1; transform: scale(1); }
                50% { opacity: 0.4; transform: scale(0.85); }
            }
            @keyframes nsft-wfp-indeterm {
                0% { transform: translateX(-100%); }
                100% { transform: translateX(370%); }
            }
            @keyframes nsft-wfp-row-in {
                from { opacity: 0; transform: translateY(-4px); }
                to { opacity: 1; transform: translateY(0); }
            }

            #${PANEL_ID}[data-theme="dark"] {
                background: #1f2430;
                border-color: rgba(255, 255, 255, 0.08);
                box-shadow: 0 12px 32px rgba(0, 0, 0, 0.5), 0 4px 8px rgba(0, 0, 0, 0.3);
            }
            #${PANEL_ID}[data-theme="dark"] .wfp-row-meta { color: #a5adba; }
            #${PANEL_ID}[data-theme="dark"] .wfp-row-label { color: #e6e9ef; }
            #${PANEL_ID}[data-theme="dark"] .wfp-row-count { color: #8a93a3; }
            #${PANEL_ID}[data-theme="dark"] .wfp-row-bar { background: rgba(255, 255, 255, 0.06); }

            #nsft-wf-indexer-panel {
                position: fixed;
                right: 20px;
                bottom: 20px;
                width: 460px;
                max-width: calc(100vw - 40px);
                height: calc(100vh - 40px);
                max-height: 720px;
                background: #ffffff;
                border: 1px solid #e5e7eb;
                box-shadow: 0 10px 25px -5px rgba(0,0,0,0.1), 0 8px 10px -6px rgba(0,0,0,0.1);
                border-radius: 8px;
                overflow: hidden;
                font-family: 'Segoe UI', 'Helvetica Neue', Arial, sans-serif;
                color: #111827;
                z-index: 10001;
                display: flex;
                flex-direction: column;
                transition: width 320ms cubic-bezier(0.19, 1, 0.22, 1),
                            height 320ms cubic-bezier(0.19, 1, 0.22, 1),
                            border-radius 320ms ease,
                            opacity 200ms ease,
                            box-shadow 200ms ease;
                opacity: 0;
                transform: translateY(-4px);
            }
            #nsft-wf-indexer-panel.is-mounted {
                opacity: 1;
                transform: translateY(0);
            }
            #nsft-wf-indexer-panel[data-state="capsule"] {
                width: 190px;
                height: 40px;
                max-height: 40px;
                border-radius: 20px;
                opacity: 0.85;
                box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1), 0 2px 4px -1px rgba(0,0,0,0.06);
            }
            #nsft-wf-indexer-panel[data-state="capsule"]:hover {
                opacity: 1;
                box-shadow: 0 10px 15px -3px rgba(0,0,0,0.12), 0 4px 6px -2px rgba(0,0,0,0.06);
            }
            #nsft-wf-indexer-panel.nsft-dragging { transition: none !important; user-select: none; }
            #nsft-wf-indexer-panel[data-state="capsule"] .wfi-tabs,
            #nsft-wf-indexer-panel[data-state="capsule"] .wfi-filters,
            #nsft-wf-indexer-panel[data-state="capsule"] .wfi-count,
            #nsft-wf-indexer-panel[data-state="capsule"] .wfi-results,
            #nsft-wf-indexer-panel[data-state="capsule"] .wfi-min {
                display: none !important;
            }
            #nsft-wf-indexer-panel[data-state="capsule"] .wfi-head {
                height: 40px;
                padding: 0 12px;
                border-bottom: none;
            }
            #nsft-wf-indexer-panel[data-state="capsule"] .wfi-capsule-count,
            #nsft-wf-indexer-panel[data-state="capsule"] .wfi-max { display: inline-flex; }
            #nsft-wf-indexer-panel[data-state="expanded"] .wfi-capsule-count,
            #nsft-wf-indexer-panel[data-state="expanded"] .wfi-max { display: none; }
            #nsft-wf-indexer-panel .wfi-head {
                display: flex;
                align-items: center;
                gap: 10px;
                padding: 8px 14px;
                height: 40px;
                box-sizing: border-box;
                background: #ffffff;
                color: #374151;
                border-bottom: 1px solid #f3f4f6;
                cursor: move;
                user-select: none;
                flex-shrink: 0;
                transition: padding 280ms ease;
            }
            #nsft-wf-indexer-panel .wfi-head-icon { width: 14px; height: 14px; flex-shrink: 0; color: #4a6fa5; }
            #nsft-wf-indexer-panel .wfi-title { flex: 1; font-size: 13px; font-weight: 600; letter-spacing: -0.01em; color: #374151; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
            #nsft-wf-indexer-panel .wfi-capsule-count {
                display: none;
                align-items: center;
                background: #eef2ff;
                color: #3b5a85;
                padding: 1px 8px;
                border-radius: 999px;
                font-size: 10.5px;
                font-weight: 700;
                flex-shrink: 0;
            }
            #nsft-wf-indexer-panel .wfi-min,
            #nsft-wf-indexer-panel .wfi-max,
            #nsft-wf-indexer-panel .wfi-close {
                background: transparent;
                color: #9ca3af;
                border: none;
                width: 22px; height: 22px;
                border-radius: 4px;
                cursor: pointer;
                font-size: 11px;
                line-height: 1;
                padding: 0;
                display: inline-flex;
                align-items: center;
                justify-content: center;
                flex-shrink: 0;
                transition: all 0.2s ease;
            }
            #nsft-wf-indexer-panel .wfi-min:hover,
            #nsft-wf-indexer-panel .wfi-max:hover { background: #f3f4f6; color: #1f2937; }
            #nsft-wf-indexer-panel .wfi-close:hover { background: #fee2e2; color: #ef4444; }
            #nsft-wf-indexer-panel .wfi-tabs { display: flex; border-bottom: 1px solid #e5e7eb; flex-shrink: 0; }
            #nsft-wf-indexer-panel .wfi-tab {
                flex: 1;
                padding: 11px 6px;
                background: transparent;
                border: none;
                cursor: pointer;
                font-size: 12px;
                font-weight: 600;
                color: #6b7280;
                position: relative;
                font-family: inherit;
            }
            #nsft-wf-indexer-panel .wfi-tab:hover { color: #374151; }
            #nsft-wf-indexer-panel .wfi-tab.is-active { color: #4a6fa5; }
            #nsft-wf-indexer-panel .wfi-tab.is-active::after {
                content: '';
                position: absolute;
                bottom: -1px; left: 18%; right: 18%;
                height: 2px;
                background: #4a6fa5;
                border-radius: 2px;
            }
            #nsft-wf-indexer-panel .wfi-filters { padding: 12px 16px; border-bottom: 1px solid #e5e7eb; display: flex; flex-direction: column; gap: 8px; flex-shrink: 0; }
            /* El aspa se superpone DENTRO del cuadro: el envoltorio relativo la
               ancla y el padding-right del input le abre el hueco, así que la
               columna de filtros no cambia de alto ni de ancho. */
            #nsft-wf-indexer-panel .wfi-search-wrap { position: relative; display: block; }
            #nsft-wf-indexer-panel .wfi-search {
                width: 100%;
                padding: 8px 30px 8px 10px;
                border: 1px solid #d1d5db;
                border-radius: 6px;
                font-size: 12.5px;
                outline: none;
                font-family: inherit;
                box-sizing: border-box;
            }
            #nsft-wf-indexer-panel .wfi-search:focus { border-color: #4a6fa5; box-shadow: 0 0 0 3px rgba(74, 111, 165, 0.18); }
            /* El input es type="search" y Chrome le pone SU propia aspa; con la
               nuestra al lado salían dos. Se retira la del navegador, que ni se
               puede estilar ni respeta el tema. */
            #nsft-wf-indexer-panel .wfi-search::-webkit-search-cancel-button { -webkit-appearance: none; appearance: none; display: none; }
            #nsft-wf-indexer-panel .wfi-search-clear {
                position: absolute;
                right: 6px;
                top: 50%;
                transform: translateY(-50%);
                display: flex;
                align-items: center;
                justify-content: center;
                width: 20px;
                height: 20px;
                padding: 0;
                border: none;
                border-radius: 5px;
                background: transparent;
                color: #9ca3af;
                font-family: inherit;
                font-size: 11px;
                line-height: 1;
                cursor: pointer;
                transition: background-color 0.12s, color 0.12s;
            }
            #nsft-wf-indexer-panel .wfi-search-clear[hidden] { display: none; }
            #nsft-wf-indexer-panel .wfi-search-clear:hover { background: #f3f4f6; color: #374151; }
            #nsft-wf-indexer-panel .wfi-search-clear:focus-visible { outline: 2px solid #4a6fa5; outline-offset: 1px; }
            #nsft-wf-indexer-panel .wfi-filter-row { display: flex; gap: 8px; flex-wrap: wrap; }
            #nsft-wf-indexer-panel .wfi-filter {
                flex: 1;
                min-width: 0;
                padding: 6px 8px;
                border: 1px solid #d1d5db;
                border-radius: 6px;
                font-size: 11.5px;
                background: #fff;
                color: #374151;
                font-family: inherit;
                cursor: pointer;
            }
            #nsft-wf-indexer-panel .wfi-checkbox { display: flex; align-items: center; gap: 6px; font-size: 11.5px; color: #4b5563; cursor: pointer; user-select: none; }
            #nsft-wf-indexer-panel .wfi-count {
                padding: 7px 16px;
                font-size: 11px;
                color: #6b7280;
                background: #f9fafb;
                border-bottom: 1px solid #e5e7eb;
                flex-shrink: 0;
            }
            #nsft-wf-indexer-panel .wfi-results { flex: 1; overflow-y: auto; padding: 0; }
            #nsft-wf-indexer-panel .wfi-item {
                padding: 11px 16px;
                border-bottom: 1px solid #f3f4f6;
                cursor: pointer;
                transition: background 120ms ease;
            }
            #nsft-wf-indexer-panel .wfi-item:hover { background: #f9fafb; }
            #nsft-wf-indexer-panel .wfi-item-head {
                display: flex;
                align-items: center;
                gap: 6px;
                font-weight: 600;
                font-size: 12.5px;
                color: #1f2937;
                margin-bottom: 4px;
            }
            #nsft-wf-indexer-panel .wfi-item-head .wfi-title-text { flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
            #nsft-wf-indexer-panel .wfi-pill {
                display: inline-block;
                padding: 1px 7px;
                border-radius: 999px;
                font-size: 9.5px;
                font-weight: 700;
                background: #eef2ff;
                color: #4338ca;
                letter-spacing: 0.3px;
                text-transform: uppercase;
                flex-shrink: 0;
            }
            #nsft-wf-indexer-panel .wfi-pill.is-inactive { background: #fee2e2; color: #991b1b; }
            #nsft-wf-indexer-panel .wfi-pill.is-start { background: #dcfce7; color: #166534; }
            #nsft-wf-indexer-panel .wfi-item-meta { font-size: 11px; color: #6b7280; line-height: 1.55; }
            #nsft-wf-indexer-panel .wfi-item-meta b { color: #374151; font-weight: 600; }
            #nsft-wf-indexer-panel .wfi-item-meta code {
                background: #f3f4f6;
                color: #1f2937;
                padding: 1px 5px;
                border-radius: 4px;
                font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', monospace;
                font-size: 10.5px;
            }
            #nsft-wf-indexer-panel .wfi-empty {
                padding: 50px 24px;
                text-align: center;
                color: #9ca3af;
                font-size: 12.5px;
            }
            /* Resaltado del filtro: el amarillo comun, con respaldo por si el
               CSS de _shared no llegara. */
            #nsft-wf-indexer-panel mark.wfi-hl {
                background: var(--nsft-hl-bg, rgba(234, 179, 8, 0.42));
                color: inherit;
                border-radius: 3px;
                padding: 0 1px;
                font-weight: 700;
            }

            #nsft-wf-indexer-panel[data-theme="dark"] { background: #1f2430; color: #e6e9ef; border-color: rgba(255,255,255,0.08); }
            #nsft-wf-indexer-panel[data-theme="dark"] .wfi-head { background: #1f2430; color: #e6e9ef; border-color: rgba(255,255,255,0.08); }
            #nsft-wf-indexer-panel[data-theme="dark"] .wfi-title { color: #e6e9ef; }
            #nsft-wf-indexer-panel[data-theme="dark"] .wfi-head-icon { color: #88a8d4; }
            #nsft-wf-indexer-panel[data-theme="dark"] .wfi-capsule-count { background: rgba(136,168,212,0.18); color: #cbd5e1; }
            #nsft-wf-indexer-panel[data-theme="dark"] .wfi-min,
            #nsft-wf-indexer-panel[data-theme="dark"] .wfi-max,
            #nsft-wf-indexer-panel[data-theme="dark"] .wfi-close { color: #8a93a3; }
            #nsft-wf-indexer-panel[data-theme="dark"] .wfi-min:hover,
            #nsft-wf-indexer-panel[data-theme="dark"] .wfi-max:hover { background: rgba(255,255,255,0.08); color: #e6e9ef; }
            #nsft-wf-indexer-panel[data-theme="dark"] .wfi-close:hover { background: rgba(239,68,68,0.18); color: #ef4444; }
            #nsft-wf-indexer-panel[data-theme="dark"] .wfi-tabs { border-color: rgba(255,255,255,0.08); }
            #nsft-wf-indexer-panel[data-theme="dark"] .wfi-tab { color: #a5adba; }
            #nsft-wf-indexer-panel[data-theme="dark"] .wfi-tab:hover { color: #cbd5e1; }
            #nsft-wf-indexer-panel[data-theme="dark"] .wfi-tab.is-active { color: #88a8d4; }
            #nsft-wf-indexer-panel[data-theme="dark"] mark.wfi-hl {
                background: var(--nsft-hl-bg-dark, rgba(234, 179, 8, 0.55));
                color: var(--nsft-hl-fg-dark, #0D1410);
            }
            #nsft-wf-indexer-panel[data-theme="dark"] .wfi-tab.is-active::after { background: #88a8d4; }
            #nsft-wf-indexer-panel[data-theme="dark"] .wfi-filters,
            #nsft-wf-indexer-panel[data-theme="dark"] .wfi-count { border-color: rgba(255,255,255,0.08); }
            #nsft-wf-indexer-panel[data-theme="dark"] .wfi-count { background: rgba(255,255,255,0.04); color: #a5adba; }
            #nsft-wf-indexer-panel[data-theme="dark"] .wfi-search,
            #nsft-wf-indexer-panel[data-theme="dark"] .wfi-filter { background: #2a3142; border-color: rgba(255,255,255,0.1); color: #e6e9ef; }
            #nsft-wf-indexer-panel[data-theme="dark"] .wfi-search:focus { border-color: #88a8d4; box-shadow: 0 0 0 3px rgba(136, 168, 212, 0.2); }
            /* Oscuro por el gatillo del módulo (data-theme en el panel, alimentado
               desde nsftTheme por el content script), NUNCA por el tema del sistema.
               El hover tira del token compartido con respaldo: este CSS lo inyecta
               el fetcher en el mundo principal y las variables sólo llegan si el
               bloque _shared ha cargado. */
            #nsft-wf-indexer-panel[data-theme="dark"] .wfi-search-clear { color: #94a3b8; }
            #nsft-wf-indexer-panel[data-theme="dark"] .wfi-search-clear:hover { background: var(--nsft-dk-hover, rgba(255,255,255,0.08)); color: #e6e9ef; }
            #nsft-wf-indexer-panel[data-theme="dark"] .wfi-search-clear:focus-visible { outline-color: #88a8d4; }
            #nsft-wf-indexer-panel[data-theme="dark"] .wfi-checkbox { color: #a5adba; }
            #nsft-wf-indexer-panel[data-theme="dark"] .wfi-item { border-color: rgba(255,255,255,0.04); }
            #nsft-wf-indexer-panel[data-theme="dark"] .wfi-item:hover { background: rgba(255,255,255,0.03); }
            #nsft-wf-indexer-panel[data-theme="dark"] .wfi-item-head { color: #f1f5f9; }
            #nsft-wf-indexer-panel[data-theme="dark"] .wfi-item-meta { color: #94a3b8; }
            #nsft-wf-indexer-panel[data-theme="dark"] .wfi-item-meta b { color: #cbd5e1; }
            #nsft-wf-indexer-panel[data-theme="dark"] .wfi-item-meta code { background: rgba(255,255,255,0.06); color: #e6e9ef; }
        </style>`;
    document.body.insertAdjacentHTML('beforeend', STYLES);

    const scriptEl = document.currentScript;
    const workflowId = scriptEl?.dataset?.nsftWorkflowId;
    if (!workflowId) return;

    window.nsftWorkflowData = window.nsftWorkflowData || {};
    const workflowData = window.nsftWorkflowData;
    const modalCurrentProgress = {};

    function initWorkflowData(id) {
        const modalId = 'workflow';
        try {
            showModal(modalId, `Loading initial workload ID: ${id}`);
            fetch(`/app/common/workflow/setup/nextgen/data/workflowdesktopdata.nl?id=${id}&path=structure&e=T`)
                .then(data => data.json())
                .then(json => {
                    workflowData[id] = { states: {}, transitions: {} };
                    const states = {};
                    const transitions = {};

                    for (const state of json.states || []) states[state.key] = state;
                    for (const transition of json.transition || []) transitions[transition.key] = transition;

                    workflowData[id].states = states;
                    workflowData[id].transitions = transitions;
                    removeModal(modalId);
                    getStateData(id);
                })
                .catch(e => handleError('initWorkflowData - promise', e));
        } catch (e) {
            handleError('initWorkflowData', e);
        }
    }

    function getStateData(id) {
        const modalId = 'state';
        try {
            const states = workflowData[id].states;
            showModal(modalId, `Loading states data (Workflow ID: ${id})`, Object.keys(states).length);

            setTimeout(() => {
                try {
                    for (const key in states) {
                        const url = `/app/common/workflow/setup/workflowstate.nl?workflow=${id}&id=${key}`;
                        fetch(`${url}&xml=T`)
                            .then(data => data.text())
                            .then(xml => {
                                workflowData[id].states[key] = parseStateXml(xml, workflowData[id].states[key]);
                                workflowData[id].states[key].url = url;
                                incrementModalProgress(modalId);
                            })
                            .catch(e => handleError('getStateData - promise', e));
                    }
                } catch (e) { handleError('getStateData - timeout', e); }
            });
        } catch (e) {
            handleError('getStateData', e);
        }
    }

    function parseStateXml(xmlString, stateData) {
        const modalId = `actions-${stateData.key}`;
        try {
            const xml = new DOMParser().parseFromString(xmlString, 'application/xml');

            stateData.startState = getXmlValue(xml, 'startstate') === 'T';
            stateData.actionName = getXmlValue(xml, 'actionname');
            stateData.actions = stateData.actions || {};
            stateData.transitions = stateData.transitions || {};
            stateData.fields = stateData.fields || {};

            const actionLinesXml = getXmlValue(xml, 'machine[type="list"][name="actions"]', true)?.children || [];
            showModal(modalId, 'Getting Action data for State', actionLinesXml.length);

            setTimeout(() => {
                for (const line of actionLinesXml) {
                    const actionId = getXmlValue(line, 'actionid');
                    const actionUrl = `${getXmlValue(line, 'actionurl')}&id=${actionId}`;
                    if (stateData[actionId]) continue;

                    fetch(`${actionUrl}&xml=T`)
                        .then(data => data.text())
                        .then(xml => {
                            stateData.actions[actionId] = parseActionXml(xml, {});
                            stateData.actions[actionId].url = actionUrl;
                            incrementModalProgress(modalId);
                        })
                        .catch(e => handleError('getStateData - promise', e));
                }
            }, 500);
        } catch (e) {
            handleError('parseStateXml', e);
        }
        return stateData;
    }

    function parseActionXml(xmlString, actionData) {
        try {
            const xml = new DOMParser().parseFromString(xmlString, 'application/xml');

            actionData.actionType = getXmlValue(xml, 'actiontypename');
            actionData.actionId = getXmlValue(xml, 'id');
            actionData.stringId = getXmlValue(xml, 'scriptid');
            actionData.stateId = getXmlValue(xml, 'state');
            actionData.triggerType = getXmlValue(xml, 'triggertype');
            actionData.inactive = getXmlValue(xml, 'isinactive') === 'T';
            actionData.conditionText = getXmlValue(xml, 'conditiontext');
            actionData.conditionFormula = getXmlValue(xml, 'conditionformula');

            const executionTypeEls = xml.querySelectorAll('contexttypes');
            let executionTypes = '';
            for (const el of executionTypeEls) executionTypes += `${el.textContent}, `;
            actionData.executionContexts = executionTypes;

            if (getXmlValue(xml, 'actiontype') === 'SETFIELDVALUE') {
                actionData.field = getXmlValue(xml, 'field')?.replace('STDBODY', '');
                actionData.fieldType = getXmlValue(xml, 'fieldtype');
                actionData.fieldTypeExact = getXmlValue(xml, 'fieldtypeexact');
                actionData.valueType = getXmlValue(xml, 'valuetype');

                if (actionData.fieldType === 'CHECKBOX') {
                    actionData.value = getXmlValue(xml, 'valuechecked');
                } else {
                    actionData.isSublistField = getXmlValue(xml, 'clienttriggerfieldsissublistfield') === 'T';
                    const select = getXmlValue(xml, 'valueselect');
                    const text = getXmlValue(xml, 'valuetext');
                    const field = getXmlValue(xml, 'valuefield')?.replace('STDUSER', '');
                    actionData.value = select || text || field;
                }
            } else if (getXmlValue(xml, 'actiontype') === 'ADDBUTTON') {
                actionData.buttonLabel = getXmlValue(xml, 'label');
                actionData.saveRecordFirst = getXmlValue(xml, 'saverecordfirst');
            }
        } catch (e) {
            handleError('parseActionXml', e);
        }
        return actionData;
    }

    function getXmlValue(xml, property, returnNode) {
        try {
            const el = xml.querySelector(property);
            if (!el) return null;
            return returnNode ? el : el.textContent;
        } catch (e) {
            handleError('getXmlValue', e);
            return null;
        }
    }

    const PANEL = {
        el: null,
        body: null,
        stages: new Map(),
        actionsAggregate: null,
        actionsChildren: new Map(),
        closeTimer: null,
        tearDownTimer: null
    };

    function ensurePanel() {
        if (PANEL.el) {
            clearTimeout(PANEL.tearDownTimer);
            PANEL.el.classList.remove('is-closing');
            PANEL.el.classList.add('is-visible');
            return;
        }
        const wrap = document.createElement('div');
        wrap.id = PANEL_ID;
        const nsftDark = document.documentElement.getAttribute('data-nsft-theme') === 'dark';
        wrap.setAttribute('data-theme', nsftDark ? 'dark' : 'light');
        wrap.innerHTML = `
            <div class="wfp-head">
                <span class="wfp-head-dot"></span>
                <span class="wfp-head-title">${t('wfs_progress_title', 'Indexador de Workflow')}</span>
            </div>
            <div class="wfp-body"></div>
        `;
        document.body.appendChild(wrap);
        PANEL.el = wrap;
        PANEL.body = wrap.querySelector('.wfp-body');
        requestAnimationFrame(() => wrap.classList.add('is-visible'));
    }

    function tearDownPanel() {
        if (!PANEL.el) return;
        const el = PANEL.el;
        el.classList.add('is-closing');
        el.classList.remove('is-visible');
        clearTimeout(PANEL.tearDownTimer);
        PANEL.tearDownTimer = setTimeout(() => {
            el.remove();
            if (PANEL.el === el) {
                PANEL.el = null;
                PANEL.body = null;
                PANEL.stages.clear();
                PANEL.actionsAggregate = null;
                PANEL.actionsChildren.clear();
            }
        }, 260);
    }

    function renderPanel() {
        if (!PANEL.body) return;
        const rows = [];

        for (const [key, stage] of PANEL.stages) {
            rows.push(buildRow(key, stage));
        }
        if (PANEL.actionsAggregate) {
            rows.push(buildRow('actions', {
                label: STAGE_LABELS.actions,
                current: PANEL.actionsAggregate.current,
                max: PANEL.actionsAggregate.max
            }));
        }

        PANEL.body.innerHTML = rows.join('');
    }

    function buildRow(key, stage) {
        const indeterminate = !stage.max;
        const done = !indeterminate && stage.current >= stage.max;
        const status = done ? 'done' : 'active';
        const pct = indeterminate ? 0 : Math.min(100, Math.round((stage.current / stage.max) * 100));
        const counter = indeterminate
            ? ''
            : `<span class="wfp-row-count">${stage.current} / ${stage.max}</span>`;
        const safeLabel = String(stage.label || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
        return `
            <div class="wfp-row" data-row-id="${key}" data-status="${status}" data-indeterminate="${indeterminate}">
                <div class="wfp-row-meta">
                    <span class="wfp-row-dot"></span>
                    <span class="wfp-row-label">${safeLabel}</span>
                    ${counter}
                </div>
                <div class="wfp-row-bar"><div class="wfp-row-bar-fill" style="width:${pct}%"></div></div>
            </div>
        `;
    }

    function scheduleAutoClose() {
        clearTimeout(PANEL.closeTimer);
        PANEL.closeTimer = setTimeout(() => {
            const stillRunning = (PANEL.stages.size > 0) || (PANEL.actionsAggregate && PANEL.actionsAggregate.current < PANEL.actionsAggregate.max);
            if (!stillRunning) {
                tearDownPanel();
                spawnIndexerModal();
            }
        }, 600);
    }

    function showModal(id, title, total, current) {
        try {
            if (!id) throw 'Missing required parameter ID';
            clearTimeout(PANEL.closeTimer);
            ensurePanel();
            modalCurrentProgress[id] = current || 0;

            if (id.startsWith('actions-')) {
                if (!PANEL.actionsAggregate) PANEL.actionsAggregate = { current: 0, max: 0 };
                const childMax = Number(total) || 0;
                PANEL.actionsAggregate.max += childMax;
                PANEL.actionsChildren.set(id, childMax);
                if (childMax === 0) PANEL.actionsChildren.delete(id);
            } else {
                const label = STAGE_LABELS[id] || title || t('wfs_loading', 'Cargando…');
                PANEL.stages.set(id, { label, current: current || 0, max: Number(total) || 0 });
            }
            renderPanel();
        } catch (e) {
            handleError('showModal', e);
        }
    }

    function removeModal(id) {
        try {
            if (!id) throw 'Missing required parameter ID';
            delete modalCurrentProgress[id];

            if (id.startsWith('actions-')) {
                PANEL.actionsChildren.delete(id);
            } else {
                PANEL.stages.delete(id);
            }
            renderPanel();
            scheduleAutoClose();
        } catch (e) {
            handleError('removeModal', e);
        }
    }

    function incrementModalProgress(id) {
        try {
            if (!id) throw 'Missing required parameter ID';
            modalCurrentProgress[id] = (modalCurrentProgress[id] || 0) + 1;

            if (id.startsWith('actions-')) {
                if (PANEL.actionsAggregate) PANEL.actionsAggregate.current++;
                const childMax = PANEL.actionsChildren.get(id);
                if (childMax && modalCurrentProgress[id] >= childMax) {
                    PANEL.actionsChildren.delete(id);
                }
            } else {
                const stage = PANEL.stages.get(id);
                if (stage) stage.current = modalCurrentProgress[id];
            }
            renderPanel();

            if (!id.startsWith('actions-')) {
                const stage = PANEL.stages.get(id);
                if (stage && stage.max && stage.current >= stage.max) {
                    PANEL.stages.delete(id);
                    renderPanel();
                }
            }

            const actionsDone = !PANEL.actionsAggregate
                || (PANEL.actionsAggregate.current >= PANEL.actionsAggregate.max && PANEL.actionsChildren.size === 0);
            if (PANEL.stages.size === 0 && actionsDone) {
                PANEL.actionsAggregate = null;
                renderPanel();
                scheduleAutoClose();
            }
        } catch (e) {
            handleError('incrementModalProgress', e);
        }
    }

    function handleError(functionName, error) {
        try {
            console.error(`${functionName}: ${error.name || 'Error'}:\n\n ${error.message || error}`);

            if (window.NS?.UIF?.showGrowl) {
                NS.UIF.showGrowl({
                    title: `${functionName}: ${error.name || 'Error'}`,
                    content: error.message || error,
                    duration: 10000,
                    type: 'error'
                });
            }

            tearDownPanel();
        } catch (e) {
            console.error('handleError:', e);
            tearDownPanel();
        }
    }


    const INDEXER_UI = {
        panel: null,
        lastExpandedLeft: null,
        lastExpandedTop: null,
        filters: {
            tab: 'actions',
            search: '',
            actionType: 'all',
            triggerType: 'all',
            stateKey: 'all',
            onlyActive: true
        }
    };

    function wfsFold(s) {
        const TS = window.NSFT_TextSearch;
        return TS ? TS.fold(s) : String(s == null ? '' : s).toLowerCase();
    }

    function countActions() {
        const wf = workflowData[workflowId];
        if (!wf || !wf.states) return 0;
        let total = 0;
        for (const key in wf.states) total += Object.keys(wf.states[key].actions || {}).length;
        return total;
    }

    function spawnIndexerModal() {
        if (INDEXER_UI.panel) return;
        const wf = workflowData[workflowId];
        if (!wf || !wf.states || Object.keys(wf.states).length === 0) return;

        const actionsTotal = countActions();
        const panel = document.createElement('div');
        panel.id = 'nsft-wf-indexer-panel';
        panel.setAttribute('data-state', 'capsule');
        const nsftDark = document.documentElement.getAttribute('data-nsft-theme') === 'dark';
        panel.setAttribute('data-theme', nsftDark ? 'dark' : 'light');
        panel.innerHTML = `
            <div class="wfi-head">
                <svg class="wfi-head-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"></circle><path d="m20 20-3.5-3.5"></path></svg>
                <span class="wfi-title">${t('wfs_title', 'Indexador')}</span>
                <span class="wfi-capsule-count">${actionsTotal}</span>
                <button class="wfi-min" type="button" aria-label="${t('wfs_minimize', 'Minimizar')}" title="${t('wfs_minimize', 'Minimizar')}">&mdash;</button>
                <button class="wfi-max" type="button" aria-label="${t('wfs_maximize', 'Maximizar')}" title="${t('wfs_maximize', 'Maximizar')}">&#x25A2;</button>
                <button class="wfi-close" type="button" aria-label="${t('wfs_close', 'Cerrar')}" title="${t('wfs_close', 'Cerrar')}">&#x2715;</button>
            </div>
            <div class="wfi-tabs">
                <button class="wfi-tab is-active" data-tab="actions" type="button">${t('wfs_actions', 'Acciones')}</button>
                <button class="wfi-tab" data-tab="states" type="button">${t('wfs_states', 'Estados')}</button>
                <button class="wfi-tab" data-tab="transitions" type="button">${t('wfs_transitions', 'Transiciones')}</button>
            </div>
            <div class="wfi-filters">
                <div class="wfi-search-wrap">
                    <input class="wfi-search" type="search" placeholder="${t('wfs_search_ph', 'Buscar nombre, campo, valor, fórmula…')}" />
                    <button class="wfi-search-clear" type="button" hidden aria-label="${t('ro_clear_search', 'Limpiar búsqueda')}" title="${t('ro_clear_search', 'Limpiar búsqueda')}">&#x2715;</button>
                </div>
                <div class="wfi-filter-row" data-row="actions">
                    <select class="wfi-filter" data-filter="actionType"><option value="all">${t('wfs_all_types', 'Todos los tipos')}</option></select>
                    <select class="wfi-filter" data-filter="triggerType"><option value="all">${t('wfs_all_triggers', 'Todos los triggers')}</option></select>
                </div>
                <div class="wfi-filter-row" data-row="states-actions">
                    <select class="wfi-filter" data-filter="stateKey"><option value="all">${t('wfs_all_states', 'Todos los estados')}</option></select>
                </div>
                <label class="wfi-checkbox"><input type="checkbox" data-filter="onlyActive" checked /> ${t('wfs_only_active', 'Solo activas')}</label>
            </div>
            <div class="wfi-count"></div>
            <div class="wfi-results"></div>
        `;
        document.body.appendChild(panel);
        INDEXER_UI.panel = panel;

        populateFilterOptions();
        bindIndexerPanel();
        renderIndexerResults();
        requestAnimationFrame(() => panel.classList.add('is-mounted'));
    }

    function expandIndexerPanel() {
        const modal = INDEXER_UI.panel;
        if (!modal) return;
        modal.setAttribute('data-state', 'expanded');
        if (INDEXER_UI.lastExpandedTop !== null) { modal.style.top = INDEXER_UI.lastExpandedTop; modal.style.bottom = 'auto'; }
        else { modal.style.top = ''; modal.style.bottom = ''; }
        if (INDEXER_UI.lastExpandedLeft !== null) { modal.style.left = INDEXER_UI.lastExpandedLeft; modal.style.right = 'auto'; }
        else { modal.style.left = ''; modal.style.right = ''; }
        constrainModalToWindow(modal);
    }

    function minimizeIndexerPanel() {
        const modal = INDEXER_UI.panel;
        if (!modal) return;
        modal.setAttribute('data-state', 'capsule');
        setTimeout(() => snapToEdge(modal), 10);
    }

    function constrainModalToWindow(el) {
        if (!el || (!el.style.left && !el.style.top)) return;
        const TARGET_WIDTH = el.offsetWidth || 460;
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;
        const rect = el.getBoundingClientRect();

        let currentLeft = parseInt(el.style.left) || rect.left;
        let currentTop = parseInt(el.style.top) || rect.top;
        let newLeft = currentLeft;
        let newTop = currentTop;

        if (currentLeft + TARGET_WIDTH > viewportWidth) newLeft = viewportWidth - TARGET_WIDTH - 15;
        if (currentLeft < 0) newLeft = 15;
        if (currentTop + 50 > viewportHeight) newTop = viewportHeight - 100;
        if (currentTop < 0) newTop = 0;

        if (newLeft !== currentLeft) el.style.left = newLeft + 'px';
        if (newTop !== currentTop) el.style.top = newTop + 'px';
    }

    function snapToEdge(el) {
        if (!el) return;
        el.style.right = 'auto';
        el.style.bottom = 'auto';

        const isCapsule = el.getAttribute('data-state') === 'capsule';
        const rect = el.getBoundingClientRect();
        const viewportWidth = window.innerWidth;

        const targetWidth = isCapsule ? 190 : rect.width;
        const centerX = rect.left + (rect.width / 2);
        const p = 15;

        if (centerX < (viewportWidth / 2)) {
            el.style.left = p + 'px';
        } else {
            el.style.left = (viewportWidth - targetWidth - p) + 'px';
        }

        constrainModalToWindow(el);
    }

    function closeIndexerPanel() {
        if (!INDEXER_UI.panel) return;
        const el = INDEXER_UI.panel;
        el.classList.remove('is-mounted');
        setTimeout(() => {
            if (INDEXER_UI.panel === el) {
                el.remove();
                INDEXER_UI.panel = null;
            }
        }, 220);
    }

    function populateFilterOptions() {
        const wf = workflowData[workflowId];
        if (!wf || !INDEXER_UI.panel) return;

        const actionTypes = new Set();
        const triggerTypes = new Set();
        const states = [];

        for (const key in wf.states) {
            const state = wf.states[key];
            states.push({ key, name: state.name || state.actionName || key });
            for (const aid in state.actions || {}) {
                const a = state.actions[aid];
                if (a.actionType) actionTypes.add(a.actionType);
                if (a.triggerType) triggerTypes.add(a.triggerType);
            }
        }
        states.sort((a, b) => String(a.name).localeCompare(String(b.name)));

        fillSelect('actionType', [...actionTypes].sort(), t('wfs_all_types', 'Todos los tipos'));
        fillSelect('triggerType', [...triggerTypes].sort(), t('wfs_all_triggers', 'Todos los triggers'));
        fillSelect('stateKey', states.map(s => ({ value: s.key, label: s.name })), t('wfs_all_states', 'Todos los estados'));
    }

    function fillSelect(filterName, values, allLabel) {
        const sel = INDEXER_UI.panel.querySelector(`[data-filter="${filterName}"]`);
        if (!sel) return;
        sel.innerHTML = `<option value="all">${escapeHtml(allLabel)}</option>` + values.map(v => {
            if (typeof v === 'string') return `<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`;
            return `<option value="${escapeHtml(v.value)}">${escapeHtml(v.label)}</option>`;
        }).join('');
    }

    function bindIndexerPanel() {
        const panel = INDEXER_UI.panel;
        if (!panel) return;

        panel.querySelector('.wfi-close').addEventListener('click', (e) => {
            e.stopPropagation();
            closeIndexerPanel();
        });
        panel.querySelector('.wfi-min').addEventListener('click', (e) => {
            e.stopPropagation();
            minimizeIndexerPanel();
        });
        panel.querySelector('.wfi-max').addEventListener('click', (e) => {
            e.stopPropagation();
            expandIndexerPanel();
        });

        const head = panel.querySelector('.wfi-head');
        bindHeaderDrag(panel, head);
        head.addEventListener('dblclick', (e) => {
            if (e.target.closest('.wfi-min, .wfi-max, .wfi-close')) return;
            const state = panel.getAttribute('data-state');
            if (state === 'capsule') expandIndexerPanel();
            else minimizeIndexerPanel();
        });

        panel.querySelectorAll('.wfi-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                panel.querySelectorAll('.wfi-tab').forEach(t => t.classList.remove('is-active'));
                tab.classList.add('is-active');
                INDEXER_UI.filters.tab = tab.dataset.tab;
                updateFilterRowsVisibility();
                renderIndexerResults();
            });
        });

        const search = panel.querySelector('.wfi-search');
        const searchClear = panel.querySelector('.wfi-search-clear');

        const syncSearchClear = () => {
            if (searchClear) searchClear.hidden = !search.value;
        };

        search.addEventListener('input', () => {
            INDEXER_UI.filters.search = wfsFold(search.value.trim());
            syncSearchClear();
            renderIndexerResults();
        });

        if (searchClear) {
            searchClear.addEventListener('mousedown', (e) => e.preventDefault());
            searchClear.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                search.value = '';
                INDEXER_UI.filters.search = '';
                syncSearchClear();
                renderIndexerResults();
                search.focus();
            });
        }
        syncSearchClear();

        panel.querySelectorAll('.wfi-filter').forEach(sel => {
            sel.addEventListener('change', () => {
                INDEXER_UI.filters[sel.dataset.filter] = sel.value;
                renderIndexerResults();
            });
        });

        const onlyActive = panel.querySelector('[data-filter="onlyActive"]');
        onlyActive.addEventListener('change', () => {
            INDEXER_UI.filters.onlyActive = onlyActive.checked;
            renderIndexerResults();
        });

        updateFilterRowsVisibility();
    }

    function bindHeaderDrag(modal, head) {
        let mouseIsDown = false;
        let offsetX = 0;
        let offsetY = 0;

        const handleMouseMove = (event) => {
            if (!mouseIsDown) return;
            event.preventDefault();
            const newLeft = (event.clientX - offsetX) + 'px';
            const newTop = (event.clientY - offsetY) + 'px';
            modal.style.left = newLeft;
            modal.style.top = newTop;
            modal.style.right = 'auto';
            modal.style.bottom = 'auto';

            if (modal.getAttribute('data-state') === 'expanded') {
                INDEXER_UI.lastExpandedLeft = newLeft;
                INDEXER_UI.lastExpandedTop = newTop;
            }
        };

        head.addEventListener('mousedown', (event) => {
            if (event.button !== 0) return;
            if (event.target.closest('.wfi-min, .wfi-max, .wfi-close')) return;
            if (document.activeElement) document.activeElement.blur();

            mouseIsDown = true;
            modal.classList.add('nsft-dragging');
            offsetX = event.clientX - modal.offsetLeft;
            offsetY = event.clientY - modal.offsetTop;
            window.addEventListener('mousemove', handleMouseMove);
        });

        window.addEventListener('mouseup', () => {
            if (!mouseIsDown) return;
            mouseIsDown = false;
            modal.classList.remove('nsft-dragging');
            window.removeEventListener('mousemove', handleMouseMove);

            if (modal.getAttribute('data-state') === 'capsule') {
                requestAnimationFrame(() => snapToEdge(modal));
            } else {
                constrainModalToWindow(modal);
            }
        });
    }

    function updateFilterRowsVisibility() {
        const panel = INDEXER_UI.panel;
        if (!panel) return;
        const tab = INDEXER_UI.filters.tab;
        const actionsRow = panel.querySelector('[data-row="actions"]');
        const stateActionsRow = panel.querySelector('[data-row="states-actions"]');
        const onlyActiveLabel = panel.querySelector('.wfi-checkbox');

        actionsRow.style.display = tab === 'actions' ? '' : 'none';
        stateActionsRow.style.display = tab === 'actions' ? '' : 'none';
        onlyActiveLabel.style.display = tab === 'actions' ? '' : 'none';
    }

    function renderIndexerResults() {
        const panel = INDEXER_UI.panel;
        const wf = workflowData[workflowId];
        if (!panel || !wf) return;

        const list = panel.querySelector('.wfi-results');
        const counter = panel.querySelector('.wfi-count');
        const f = INDEXER_UI.filters;
        let items = [];

        if (f.tab === 'actions') items = collectActions(wf, f);
        else if (f.tab === 'states') items = collectStates(wf, f);
        else if (f.tab === 'transitions') items = collectTransitions(wf, f);

        counter.textContent = `${items.length} ${items.length === 1 ? t('wfs_result_one', 'resultado') : t('wfs_result_many', 'resultados')}`;

        if (items.length === 0) {
            list.innerHTML = `<div class="wfi-empty">${t('wfs_empty', 'Sin resultados con los filtros actuales.')}</div>`;
            return;
        }

        list.innerHTML = items.map(item => renderItem(item, f.tab)).join('');
        list.querySelectorAll('.wfi-item').forEach(el => {
            el.addEventListener('click', () => {
                const url = el.dataset.url;
                if (url) window.open(url, '_blank', 'noopener');
            });
        });
    }

    function collectActions(wf, f) {
        const out = [];
        const q = f.search;
        for (const stateKey in wf.states) {
            if (f.stateKey !== 'all' && f.stateKey !== stateKey) continue;
            const state = wf.states[stateKey];
            for (const aid in state.actions || {}) {
                const a = state.actions[aid];
                if (f.onlyActive && a.inactive) continue;
                if (f.actionType !== 'all' && a.actionType !== f.actionType) continue;
                if (f.triggerType !== 'all' && a.triggerType !== f.triggerType) continue;
                if (q) {
                    const hay = wfsFold([a.actionType, a.stringId, a.field, a.value, a.conditionText, a.conditionFormula, a.buttonLabel, state.name]
                        .filter(Boolean).join(' '));
                    if (!hay.includes(q)) continue;
                }
                out.push({ ...a, stateName: state.name || stateKey, _url: a.url });
            }
        }
        return out;
    }

    function collectStates(wf, f) {
        const out = [];
        const q = f.search;
        for (const key in wf.states) {
            const s = wf.states[key];
            if (q) {
                const hay = wfsFold([s.name, s.actionName, key].filter(Boolean).join(' '));
                if (!hay.includes(q)) continue;
            }
            const actionsCount = Object.keys(s.actions || {}).length;
            out.push({ key, name: s.name || s.actionName || key, startState: s.startState, actionsCount, _url: s.url });
        }
        out.sort((a, b) => Number(!!b.startState) - Number(!!a.startState) || String(a.name).localeCompare(String(b.name)));
        return out;
    }

    function collectTransitions(wf, f) {
        const out = [];
        const q = f.search;
        for (const key in wf.transitions || {}) {
            const t = wf.transitions[key];
            if (q) {
                const hay = wfsFold(JSON.stringify(t));
                if (!hay.includes(q)) continue;
            }
            out.push({ ...t, key });
        }
        return out;
    }

    function renderItem(item, tab) {
        const url = item._url ? escapeHtml(item._url) : '';
        const dataUrl = url ? `data-url="${url}"` : '';

        if (tab === 'actions') {
            const title = item.actionType || t('wfs_no_type', '(sin tipo)');
            const inactive = item.inactive ? `<span class="wfi-pill is-inactive">${t('wfs_inactive', 'Inactiva')}</span>` : '';
            const stringId = item.stringId ? `<code>${hl(item.stringId)}</code>` : '';
            const metaLines = [];
            metaLines.push(`<b>${t('wfs_lbl_state', 'Estado')}:</b> ${hl(item.stateName)}`);
            if (item.triggerType) metaLines.push(`<b>${t('wfs_lbl_trigger', 'Trigger')}:</b> <code>${hl(item.triggerType)}</code>`);
            if (item.field) metaLines.push(`<b>${t('wfs_lbl_field', 'Campo')}:</b> <code>${hl(item.field)}</code>`);
            if (item.value !== undefined && item.value !== null && item.value !== '') metaLines.push(`<b>${t('wfs_lbl_value', 'Valor')}:</b> ${hl(item.value)}`);
            if (item.buttonLabel) metaLines.push(`<b>${t('wfs_lbl_button', 'Botón')}:</b> ${hl(item.buttonLabel)}`);
            if (item.conditionFormula) metaLines.push(`<b>${t('wfs_lbl_formula', 'Fórmula')}:</b> <code>${hl(truncate(item.conditionFormula, 120))}</code>`);
            else if (item.conditionText) metaLines.push(`<b>${t('wfs_lbl_condition', 'Condición')}:</b> ${hl(truncate(item.conditionText, 120))}`);
            if (item.executionContexts) metaLines.push(`<b>${t('wfs_lbl_contexts', 'Contextos')}:</b> ${hl(item.executionContexts.replace(/,\s*$/, ''))}`);

            return `
                <div class="wfi-item" ${dataUrl}>
                    <div class="wfi-item-head">
                        <span class="wfi-title-text">${hl(title)}</span>
                        ${stringId}
                        ${inactive}
                    </div>
                    <div class="wfi-item-meta">${metaLines.join('<br>')}</div>
                </div>
            `;
        }

        if (tab === 'states') {
            const startPill = item.startState ? `<span class="wfi-pill is-start">Inicial</span>` : '';
            return `
                <div class="wfi-item" ${dataUrl}>
                    <div class="wfi-item-head">
                        <span class="wfi-title-text">${hl(item.name)}</span>
                        ${startPill}
                    </div>
                    <div class="wfi-item-meta"><b>${t('wfs_lbl_actions', 'Acciones')}:</b> ${item.actionsCount} &middot; <b>${t('wfs_lbl_key', 'Clave')}:</b> <code>${hl(item.key)}</code></div>
                </div>
            `;
        }

        const tName = item.name || item.label || item.key;
        const fromTo = [item.from, item.to].filter(Boolean).join(' → ');
        return `
            <div class="wfi-item" ${dataUrl}>
                <div class="wfi-item-head">
                    <span class="wfi-title-text">${hl(tName)}</span>
                </div>
                <div class="wfi-item-meta">${fromTo ? `<b>${t('wfs_lbl_flow', 'Flujo')}:</b> ${hl(fromTo)} &middot; ` : ''}<b>${t('wfs_lbl_key', 'Clave')}:</b> <code>${hl(item.key)}</code></div>
            </div>
        `;
    }

    function truncate(text, max) {
        const s = String(text || '');
        return s.length > max ? s.slice(0, max - 1) + '…' : s;
    }

    function escapeHtml(v) {
        return String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    }

    function hl(v) {
        const TS = window.NSFT_TextSearch;
        const q = INDEXER_UI && INDEXER_UI.filters ? INDEXER_UI.filters.search : '';
        if (!q || !TS || !TS.markHtml) return escapeHtml(v);
        return TS.markHtml(String(v ?? ''), q, 'wfi-hl');
    }

    initWorkflowData(workflowId);
})();
