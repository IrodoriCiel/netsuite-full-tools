(function () {
  'use strict';
  const PANEL_MODE = location.protocol === 'chrome-extension:';
  let _pageHref = PANEL_MODE ? null : window.location.href;

  function pageHref() { return _pageHref; }

  function nsFetch(url, init) {
    if (!PANEL_MODE) return fetch(url, init);
    const client = window.NSFT_PanelClient;
    if (!client) return Promise.reject(new Error('no_netsuite_tab'));
    let abs = String(url);
    if (abs.charAt(0) === '/' && _pageHref) abs = new URL(abs, _pageHref).href;
    return client.fetch(abs, init);
  }

  const STORAGE_KEY = 'enableViewRecordObject';
  const NSFT_THEME_KEY = 'nsftTheme';
  let lastMaximizedLeft = null;
  let lastMaximizedTop = null;
  let _nsftTheme = 'light';
  let _hideEmptyFields = false;
  let _firstSnapshot = null;
  let _lastLoadedAt = null;
  let _stalenessTimer = null;
  let _diffPaths = null;

  let _viewMode = 'json';
  let _fvShowTech = false;
  let _fvOpenTables = {};
  let _fvPins = null;
  let _fvSectionEls = {};
  const FV_PINS_KEY = 'nsftInspectorPins';
  let _fvDisplay = {};

  function _nsftResolveTheme() {
    return _nsftTheme === 'dark' ? 'dark' : 'light';
  }
  function _nsftApplyThemeToModal() {
    const m = document.getElementById('nsft-rec-obj-modal');
    if (m) m.setAttribute('data-theme', _nsftResolveTheme());
  }
  chrome.storage.local.get({ [NSFT_THEME_KEY]: 'light' }, (items) => {
    _nsftTheme = items[NSFT_THEME_KEY] || 'light';
    _nsftApplyThemeToModal();
    _syncCodeThemeFromNsftTheme();
  });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes[NSFT_THEME_KEY]) {
      _nsftTheme = changes[NSFT_THEME_KEY].newValue || 'light';
      _nsftApplyThemeToModal();
      _syncCodeThemeFromNsftTheme();
    }
  });

  function _syncCodeThemeFromNsftTheme() {
    chrome.storage.local.get({
      viewRecordObjectThemeOverridden: false,
      viewRecordObjectTheme: 'github-dark'
    }, (items) => {
      if (items.viewRecordObjectThemeOverridden) return;
      const isDark = _nsftResolveTheme() === 'dark';
      const target = isDark ? 'atom-one-dark' : 'atom-one-light';
      if (items.viewRecordObjectTheme === target) return;
      chrome.storage.local.set({ viewRecordObjectTheme: target });
    });
  }

  const STATE = {
    nsftRecordObject: null,
    nsftChangedObject: null,
    loaded: false,
    id: null,
    type: null,
    loadedRecord: null
  };

  const DEFAULT_CONFIG = {
    hoverPreviewEnabled: false,
    hoverPreviewArrayCount: 100,
    hoverPreviewFieldCount: 5,
    animateOpen: false,
    animateClose: false,
    theme: null,
    useToJSON: true,
    sortPropertiesBy: null,
    maxArrayItems: 100,
    exposePath: false
  };

  const REGEX = {
    DATE_STRING: /(^\d{1,4}[\.|\\/|-]\d{1,2}[\.|\\/|-]\d{1,4})(\s*(?:0?[1-9]:[0-5]|1(?=[012])\d:[0-5])\d\s*[ap]m)?$/,
    PARTIAL_DATE: /\d{2}:\d{2}:\d{2} GMT-\d{4}/,
    JSON_DATE: /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z/
  };

  const MAX_ANIMATED_TOGGLE_ITEMS = 500;
  const BODY_PROPERTIES_TO_EXCLUDE = ['_csrf', '_eml_nkey_', '_multibtnstate_', 'nsbrowserenv'];

  const _RB = window.NSFT_RecordButtons;
  if (_RB && _RB.isExcludedPage && _RB.isExcludedPage()) return;
  if (window.location.pathname.startsWith('/app/common/search/')) return;
  let _openMode = 'modal';

  chrome.storage.local.get({
    [STORAGE_KEY]: true,
    viewRecordObjectTheme: 'atom-one-dark',
    viewRecordObjectOpenMode: 'modal'
  }, (items) => {
    _openMode = items.viewRecordObjectOpenMode || 'modal';
    if (!items[STORAGE_KEY]) return;
    if (PANEL_MODE) {
      const client = window.NSFT_PanelClient;
      const arrancar = (info) => {
        _pageHref = info && info.href ? info.href : null;
        init(items);
        window.dispatchEvent(new CustomEvent('nsft-show-record-object'));
      };
      if (client) client.pageInfo().then(arrancar);
      else arrancar(null);
      seguirPestana(client);
      return;
    }
    init(items);
  });

  function seguirPestana(client) {
    if (!client || typeof chrome === 'undefined' || !chrome.tabs) return;
    let timer = null;
    let seq = 0;
    const esNs = (url) => !!url && /^https:\/\/[^/]*\.app\.netsuite\.com\//.test(url);

    const esperarPuente = (mySeq, intento) => {
      if (mySeq !== seq) return;
      client.pageInfo().then((info) => {
        if (mySeq !== seq) return;
        const href = info && info.href ? info.href : null;
        if (href) {
          if (href === _pageHref) return;
          _pageHref = href;
          STATE.nsftRecordObject = null;
          STATE.loaded = false;
          loadRecordXml();
          return;
        }
        if (intento < 10) { setTimeout(() => esperarPuente(mySeq, intento + 1), 400); return; }
        _pageHref = null;
        STATE.nsftRecordObject = null;
        updateStatus(chrome.i18n.getMessage('ro_panel_no_tab') || 'Abre una pestaña de NetSuite.', true);
      });
    };

    const revalidar = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        const mySeq = ++seq;
        chrome.tabs.query({ active: true, lastFocusedWindow: true }, (tabs) => {
          if (mySeq !== seq) return;
          const url = tabs && tabs[0] && tabs[0].url ? tabs[0].url : null;
          if (!esNs(url)) {
            if (_pageHref === null) return;
            _pageHref = null;
            STATE.nsftRecordObject = null;
            updateStatus(chrome.i18n.getMessage('ro_panel_no_tab') || 'Abre una pestaña de NetSuite.', true);
            return;
          }
          if (url === _pageHref) return;
          esperarPuente(mySeq, 0);
        });
      }, 250);
    };
    try {
      chrome.tabs.onActivated.addListener(revalidar);
      chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
        if (changeInfo.url || changeInfo.status === 'complete') revalidar();
      });
      if (chrome.windows && chrome.windows.onFocusChanged) {
        chrome.windows.onFocusChanged.addListener(revalidar);
      }
    } catch (e) { }
  }

  function init(items) {
    if (items.viewRecordObjectTheme) {
      sendThemeUpdate(items.viewRecordObjectTheme);
    }

    setupListeners();
    initModal(true);
  }

  const themeCssCache = new Map();

  function sendThemeUpdate(themeName) {
    const themeUrl = chrome.runtime.getURL(`scripts/libs/highlight/themes/${themeName}.css`);
    injectScopedTheme(themeUrl, '#nsft-rec-obj-container', 'ns-rec-obj-theme-link');
  }

  async function injectScopedTheme(url, scopeId, styleId) {
    try {
      let scopedCss = themeCssCache.get(url);
      if (!scopedCss) {
        const response = await fetch(url);
        const cssText = await response.text();
        scopedCss = cssText.replace(/((?:^|[},])\s*)([.#a-z])/gi, `$1${scopeId} $2`);
        themeCssCache.set(url, scopedCss);
      }

      let style = document.getElementById(styleId);
      if (!style) {
        style = document.createElement('style');
        style.id = styleId;
        document.head.appendChild(style);
      }
      style.textContent = scopedCss;
    } catch (e) {
      console.error("NSFT: Error loading theme", e);
    }
  }

  function setupListeners() {
    if (window.NSFT_Shortcuts && window.NSFT_Shortcuts.bind) {
        window.NSFT_Shortcuts.bind('view_record_object', {
            label: chrome.i18n.getMessage('enableRecordObjectLabel') || 'View Record Object',
            defaultCombo: { ctrlKey: false, shiftKey: true, altKey: true, code: 'KeyO' },
            storageKey: 'viewRecordObjectShortcut',
            event: 'nsft-show-record-object',
            group: chrome.i18n.getMessage('cheatsheet_group_global') || 'Global',
            order: 40
        });
    }

    function abrirEnPagina() {
      const modal = document.getElementById('nsft-rec-obj-modal');
      if (!modal) {
        initModal(false);
      } else {
        updateInterface();
        modal.style.display = 'block';
        modal.dataset.state = 'maximised';
        if (lastMaximizedTop !== null) modal.style.top = lastMaximizedTop;
        else { modal.style.top = ''; modal.style.bottom = ''; }
        if (lastMaximizedLeft !== null) modal.style.left = lastMaximizedLeft;
        else { modal.style.left = ''; modal.style.right = ''; }
        updateTitleState();
        bringToFront();

        const searchbox = document.getElementById('rec-obj-search');
        if (searchbox) searchbox.focus();

        if (!STATE.nsftRecordObject) {
          loadRecordXml();
        }
      }
    }

    window.addEventListener('nsft-show-record-object', function (evt) {
      if (window.NSFT_ShortcutCoach) window.NSFT_ShortcutCoach.hint('view_record_object');

      if (!PANEL_MODE && _openMode === 'panel' && !(evt && evt.detail && evt.detail.fromPanel)) {
        try {
          chrome.runtime.sendMessage({ nsftPanel: 'open', panel: 'ro' }, (resp) => {
            void chrome.runtime.lastError;
            if (!(resp && resp.ok)) abrirEnPagina();
          });
          return;
        } catch (e) { }
      }
      abrirEnPagina();
    });

    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'local') {
        if (changes.viewRecordObjectTheme) {
          sendThemeUpdate(changes.viewRecordObjectTheme.newValue || 'atom-one-dark');
        }
        if (changes.viewRecordObjectOpenMode) {
          _openMode = changes.viewRecordObjectOpenMode.newValue || 'modal';
        }
      }
    });
  }

  function initModal(isPreload = false) {
    if (document.getElementById('nsft-rec-obj-modal')) {
      if (!isPreload) {
        const modal = document.getElementById('nsft-rec-obj-modal');
        modal.style.display = 'block';
        bringToFront();
      }
      return;
    }

    document.body.insertAdjacentHTML('beforeend', getHtmlTemplate());
    _nsftApplyThemeToModal();
    addModalListeners();
    constrainModalToWindow(document.getElementById('nsft-rec-obj-modal'));

    const handleKeyChange = (e) => {
      if (e.key === 'Control') {
        const roModal = document.getElementById('nsft-rec-obj-modal') || document.body;
        const keys = document.querySelectorAll('.nsft-fmt-key');
        if (e.type === 'keydown') {
          roModal.classList.add('nsft-ctrl-pressed');
          const hint = chrome.i18n.getMessage('ro_inspect_field');
          keys.forEach(el => el.setAttribute('title', hint));
        } else if (e.type === 'keyup') {
          roModal.classList.remove('nsft-ctrl-pressed');
          keys.forEach(el => el.removeAttribute('title'));
        }
      }
    };
    document.addEventListener('keydown', handleKeyChange);
    document.addEventListener('keyup', handleKeyChange);

    const modal = document.getElementById('nsft-rec-obj-modal');
    if (modal) {
      modal.addEventListener('mousedown', bringToFront);
      if (!isPreload) modal.style.display = 'block';
    }
    if (!isPreload) bringToFront();

    const searchbox = document.getElementById('rec-obj-search');
    const clearBtn = document.getElementById('rec-obj-clear');
    document.getElementById('nsft-record-object-container').classList.add('hljs');

    if (searchbox) {
      if (!isPreload) searchbox.focus();
      let searchTimer = null;
      searchbox.addEventListener('keyup', () => {
        if (searchTimer) clearTimeout(searchTimer);
        searchTimer = setTimeout(() => { searchTimer = null; renderRecord(); }, 180);
      });
    }

    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        searchbox.value = '';
        renderRecord();
        searchbox.focus();
      });
    }

    const hideEmpty = document.getElementById('rec-obj-hide-empty');
    if (hideEmpty) {
      hideEmpty.checked = _hideEmptyFields;
      hideEmpty.addEventListener('change', (e) => {
        _hideEmptyFields = !!e.target.checked;
        renderRecord();
      });
    }

    const viewJsonBtn = document.getElementById('rec-obj-view-json');
    const viewFriendlyBtn = document.getElementById('rec-obj-view-friendly');
    if (viewJsonBtn && viewFriendlyBtn) {
      viewJsonBtn.addEventListener('click', () => setViewMode('json'));
      viewFriendlyBtn.addEventListener('click', () => setViewMode('friendly'));
    }
    const fvTechBtn = document.getElementById('rec-obj-fv-tech');
    if (fvTechBtn) {
      fvTechBtn.addEventListener('click', () => {
        _fvShowTech = !_fvShowTech;
        renderRecord();
      });
    }

    if (!isPreload) loadRecordXml();
  }

  function addModalListeners() {
    const modal = document.getElementById('nsft-rec-obj-modal');
    const clickHandler = (id, fn) => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('click', fn);
    };

    clickHandler('nsft-rec-obj-minimise', () => {
      modal.dataset.state = 'minimised';
      updateTitleState();
      dispatchLayoutUpdate();
    });

    clickHandler('nsft-rec-obj-maximise', () => {
      modal.dataset.state = 'maximised';
      if (lastMaximizedTop !== null) modal.style.top = lastMaximizedTop;
      else { modal.style.top = ''; modal.style.bottom = ''; }
      if (lastMaximizedLeft !== null) modal.style.left = lastMaximizedLeft;
      else { modal.style.left = ''; modal.style.right = ''; }
      updateTitleState();
      dispatchLayoutUpdate();
    });

    clickHandler('nsft-rec-obj-close', () => {
      if (PANEL_MODE) { window.close(); return; }
      modal.style.display = 'none';
      _firstSnapshot = null;
      _diffPaths = null;
      stopStalenessTicker();
      cleanupLegacySplit();
      dispatchLayoutUpdate();
    });

    clickHandler('nsft-rec-obj-reload', () => {
      if (PANEL_MODE && window.NSFT_PanelClient) {
        window.NSFT_PanelClient.pageInfo().then((info) => {
          _pageHref = info && info.href ? info.href : null;
          STATE.nsftRecordObject = null;
          if (!_pageHref) {
            updateStatus(chrome.i18n.getMessage('ro_panel_no_tab') || 'Abre una pestaña de NetSuite.', true);
            return;
          }
          loadRecordXml();
        });
        return;
      }
      loadRecordXml();
    });

    clickHandler('nsft-rec-obj-undock', () => {
      const client = window.NSFT_PanelClient;
      if (!client) return;
      client.dispatch('nsft-show-record-object').then((okd) => {
        if (okd) { window.close(); return; }
        console.warn('NSFT: no hay pestaña de NetSuite donde desacoplar el visor');
      });
    });

    clickHandler('nsft-rec-obj-dock', () => {
      try {
        chrome.runtime.sendMessage({ nsftPanel: 'open', panel: 'ro' }, (resp) => {
          void chrome.runtime.lastError;
          if (resp && resp.ok) {
            const cerrar = document.getElementById('nsft-rec-obj-close');
            if (cerrar) cerrar.click();
            return;
          }
          console.warn('NSFT: no se pudo abrir el panel lateral —',
            (resp && resp.reason) || 'sin respuesta del service worker');
        });
      } catch (e) { }
    });

    clickHandler('nsft-rec-obj-export', exportRecordAsJson);


    const header = document.querySelector('.nsft-rec-obj-header');
    if (header) {
      header.addEventListener('dblclick', () => {
        const state = modal.dataset.state;
        if (state === 'minimised') {
          modal.dataset.state = 'maximised';
          if (lastMaximizedTop !== null) modal.style.top = lastMaximizedTop;
          else { modal.style.top = ''; modal.style.bottom = ''; }
          if (lastMaximizedLeft !== null) modal.style.left = lastMaximizedLeft;
          else { modal.style.left = ''; modal.style.right = ''; }
        } else {
          modal.dataset.state = 'minimised';
        }
        updateTitleState();
        dispatchLayoutUpdate();
      });

      let mouseIsDown = false;
      let offsetX = 0;
      let offsetY = 0;

      const handleMouseMove = (event) => {
        if (mouseIsDown) {
          event.preventDefault();
          const newLeft = (event.clientX - offsetX) + 'px';
          const newTop = (event.clientY - offsetY) + 'px';
          modal.style.left = newLeft;
          modal.style.top = newTop;

          if (modal.dataset.state === 'maximised') {
            lastMaximizedLeft = newLeft;
            lastMaximizedTop = newTop;
          }
        }
      };

      header.addEventListener('mousedown', (event) => {
        if (PANEL_MODE) return;
        if (document.activeElement) document.activeElement.blur();
        if (event.target.closest('.nsft-header-actions')) return;

        mouseIsDown = true;
        modal.classList.add('nsft-dragging');
        offsetX = event.clientX - modal.offsetLeft;
        offsetY = event.clientY - modal.offsetTop;
        window.addEventListener('mousemove', handleMouseMove);
      });

      window.addEventListener('mouseup', () => {
        if (mouseIsDown) {
          modal.classList.remove('nsft-dragging');
          if (modal.dataset.state === 'minimised') {
            requestAnimationFrame(() => snapToEdge(modal));
          }
        }
        mouseIsDown = false;
        window.removeEventListener('mousemove', handleMouseMove);
      });
    }
  }

  function updateInterface() {
    const el = id => document.getElementById(id);
    const modal = el('nsft-rec-obj-modal');
    if (!modal) return;

    if (modal.dataset.state !== 'minimised') {
      const titleEl = el('nsft-ro-title');
      if (titleEl) titleEl.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#000000" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 6px; vertical-align: middle;"><path d="M8 3H7a2 2 0 0 0-2 2v5a2 2 0 0 1-2 2 2 2 0 0 1 2 2v5a2 2 0 0 0 2 2h1M16 21h1a2 2 0 0 0 2-2v-5a2 2 0 0 1 2-2 2 2 0 0 1-2-2V5a2 2 0 0 0-2-2h-1"></path></svg>${chrome.i18n.getMessage('ro_title')}`;
    }

    const setAttr = (id, attr, msgKey) => {
      const e = el(id);
      if (e) e.setAttribute(attr, chrome.i18n.getMessage(msgKey));
    };

    setAttr('nsft-rec-obj-reload', 'title', 'ro_reload');
    setAttr('nsft-rec-obj-minimise', 'title', 'ro_minimise');
    setAttr('nsft-rec-obj-maximise', 'title', 'ro_maximise');
    setAttr('nsft-rec-obj-close', 'title', 'ro_close');
    setAttr('rec-obj-search', 'placeholder', 'ro_search_placeholder');
    setAttr('rec-obj-clear', 'title', 'ro_clear_search');

    const legend = el('nsft-rec-obj-legend');
    if (legend) legend.innerHTML = chrome.i18n.getMessage('ro_legend');
  }

  function updateTitleState() {
    const el = document.getElementById('nsft-rec-obj-modal');
    const titleEl = document.getElementById('nsft-ro-title');
    if (!el || !titleEl) return;

    if (el.dataset.state === 'minimised') {
      titleEl.innerHTML = `<span class="nsft-ro-title-minimised">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#000000" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 4px; vertical-align: middle;">
          <path d="M8 3H7a2 2 0 0 0-2 2v5a2 2 0 0 1-2 2 2 2 0 0 1 2 2v5a2 2 0 0 0 2 2h1M16 21h1a2 2 0 0 0 2-2v-5a2 2 0 0 1 2-2 2 2 0 0 1-2-2V5a2 2 0 0 0-2-2h-1"></path>
        </svg>
        ${chrome.i18n.getMessage('ro_title_minimised')}
      </span>`;
      setTimeout(() => snapToEdge(el), 10);
    } else {
      titleEl.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#000000" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 6px; vertical-align: middle;"><path d="M8 3H7a2 2 0 0 0-2 2v5a2 2 0 0 1-2 2 2 2 0 0 1 2 2v5a2 2 0 0 0 2 2h1M16 21h1a2 2 0 0 0 2-2v-5a2 2 0 0 1 2-2 2 2 0 0 1-2-2V5a2 2 0 0 0-2-2h-1"></path></svg>${chrome.i18n.getMessage('ro_title')}`;
      constrainModalToWindow(el);
    }
    dispatchLayoutUpdate();
  }

  function dispatchLayoutUpdate() {
    window.dispatchEvent(new CustomEvent('nsft-layout-update'));
  }

  function exportRecordAsJson() {
    if (!STATE.nsftRecordObject) {
      showToast(chrome.i18n.getMessage('ro_export_no_data') || 'No hay record cargado todavía.');
      return;
    }
    try {
      const json = JSON.stringify(STATE.nsftRecordObject, null, 2);
      const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const rt = STATE.nsftRecordObject.recordType || 'record';
      const rid = STATE.nsftRecordObject.id || 'unknown';
      const a = document.createElement('a');
      a.href = url;
      a.download = `${rt}-${rid}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      showToast(chrome.i18n.getMessage('ro_export_done') || 'Descarga iniciada.');
    } catch (e) {
      showToast(chrome.i18n.getMessage('ro_export_error') || 'No se pudo exportar.');
    }
  }

  const STALENESS_TICK_MS = 30 * 1000;

  function startStalenessTicker() {
    stopStalenessTicker();
    renderStalenessLabel();
    _stalenessTimer = setInterval(renderStalenessLabel, STALENESS_TICK_MS);
  }

  function stopStalenessTicker() {
    if (_stalenessTimer) { clearInterval(_stalenessTimer); _stalenessTimer = null; }
  }

  function safeI18n(key, substitutions) {
    try {
      if (!chrome || !chrome.runtime || !chrome.runtime.id || !chrome.i18n) return null;
      return chrome.i18n.getMessage(key, substitutions);
    } catch (e) {
      return null;
    }
  }

  function renderStalenessLabel() {
    const el = document.getElementById('nsft-rec-obj-staleness');
    if (!el || !_lastLoadedAt) return;
    const elapsedMs = Date.now() - _lastLoadedAt;
    const minutes = Math.floor(elapsedMs / 60000);
    let text;
    if (minutes < 1) {
      text = safeI18n('ro_staleness_fresh') || 'Cargado hace un momento';
    } else if (minutes === 1) {
      text = safeI18n('ro_staleness_one_min') || 'Cargado hace 1 min';
    } else {
      const tpl = safeI18n('ro_staleness_minutes', [String(minutes)])
        || 'Cargado hace $1 min';
      text = tpl.replace('$1', String(minutes));
    }
    el.textContent = text;
    el.style.display = 'inline-block';
    el.classList.remove('nsft-rec-obj-staleness-warn');
    if (!chrome || !chrome.runtime || !chrome.runtime.id) {
      stopStalenessTicker();
    }
  }

  function cleanupLegacySplit() {
    const body = document.body;
    if (!body) return;
    if (!body.classList.contains('nsft-rec-obj-split-active')
      && !document.documentElement.classList.contains('nsft-rec-obj-split-active')) return;
    body.classList.remove('nsft-rec-obj-split-active');
    body.style.contain = '';
    body.style.width = '';
    body.style.maxWidth = '';
    body.style.overflow = '';
    body.style.zoom = '';
    body.style.marginRight = '';
    const html = document.documentElement;
    html.style.paddingRight = '';
    html.style.boxSizing = '';
    html.style.overflowX = '';
    html.classList.remove('nsft-rec-obj-split-active');
  }

  function bringToFront() {
    const roModal = document.getElementById('nsft-rec-obj-modal');
    if (!roModal) return;
    const stack = window.NSFT_ModalStack;
    if (stack && stack.bringToFront) {
      stack.bringToFront(roModal);
    } else {
      roModal.style.zIndex = '10002';
    }
  }

  function constrainModalToWindow(el) {
    if (!el || (!el.style.left && !el.style.top)) return;
    const TARGET_WIDTH = el.offsetWidth || 600;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const rect = el.getBoundingClientRect();

    let currentLeft = parseInt(el.style.left) || rect.left;
    let currentTop = parseInt(el.style.top) || rect.top;
    let newLeft = currentLeft;
    let newTop = currentTop;

    if (currentLeft + TARGET_WIDTH > viewportWidth) newLeft = viewportWidth - TARGET_WIDTH - 15;
    if (newLeft < 15) newLeft = 15;
    if (currentTop < 15) newTop = 15;
    if (currentTop > viewportHeight - 50) newTop = viewportHeight - 100;

    if (newLeft !== currentLeft || newTop !== currentTop) {
      el.style.left = newLeft + 'px';
      el.style.top = newTop + 'px';
    }
  }

  function snapToEdge(el) {
    if (!el) return;

    el.style.right = 'auto';
    el.style.bottom = 'auto';

    const isMin = el.dataset.state === 'minimised';
    const rect = el.getBoundingClientRect();
    const viewportWidth = window.innerWidth;

    const targetWidth = isMin ? 165 : rect.width;
    const centerX = rect.left + (rect.width / 2);

    const p = 15;

    if (centerX < (viewportWidth / 2)) {
      el.style.left = p + 'px';
    } else {
      el.style.left = (viewportWidth - targetWidth - p) + 'px';
    }

    constrainModalToWindow(el);
  }

  function showToast(message, duration = 3000) {
    const toast = document.getElementById('nsft-toast');
    if (!toast) return;
    toast.innerText = message;
    toast.classList.add('show');
    if (toast.timeoutId) clearTimeout(toast.timeoutId);
    toast.timeoutId = setTimeout(() => toast.classList.remove('show'), duration);
  }

  function updateStatus(status, isError) {
    const container = document.getElementById('nsft-record-object-container');
    if (isError) {
      container.innerHTML = status;
    } else {
      container.innerHTML = getLoadingHtml(status);
    }
  }

  const getLoadingHtml = (text) => {
    if (!text) text = chrome.i18n.getMessage('ro_loading_record');
    const spans = text.split('').map(char => `<span${char === ' ' ? ' class="nsft-space-char"' : ''}>${char}</span>`).join('');
    return `<div class="nsft-loading-text">${spans}</div>`;
  };

  const getHtmlTemplate = () => `
       <div class="nsft-rec-obj-modal" id="nsft-rec-obj-modal" data-state="maximised" style="display: none;">
         <div class="nsft-rec-obj-header">
             <span id="nsft-ro-title"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#000000" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 6px; vertical-align: middle;"><path d="M8 3H7a2 2 0 0 0-2 2v5a2 2 0 0 1-2 2 2 2 0 0 1 2 2v5a2 2 0 0 0 2 2h1M16 21h1a2 2 0 0 0 2-2v-5a2 2 0 0 1 2-2 2 2 0 0 1-2-2V5a2 2 0 0 0-2-2h-1"></path></svg>${chrome.i18n.getMessage('ro_title')}</span>
             <span class="nsft-header-actions">
               ${PANEL_MODE ? `<span id="nsft-rec-obj-undock" title="${chrome.i18n.getMessage('ro_undock_btn') || 'Desacoplar: volver a la página'}">
                 <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="nsft-no-events"><rect width="18" height="18" x="3" y="3" rx="2"></rect><path d="M15 3v18"></path><path d="M11 9l-3 3 3 3"></path></svg>
               </span>` : `<span id="nsft-rec-obj-dock" title="${chrome.i18n.getMessage('ro_dock_btn') || 'Acoplar al panel lateral del navegador'}">
                 <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="nsft-no-events"><rect width="18" height="18" x="3" y="3" rx="2"></rect><path d="M15 3v18"></path></svg>
               </span>`}
               <span id="nsft-rec-obj-export" title="${chrome.i18n.getMessage('ro_export_title') || 'Descargar como JSON'}">
                 <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="nsft-no-events"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
               </span>
               <span id="nsft-rec-obj-reload" title="${chrome.i18n.getMessage('ro_reload')}">
                 <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="nsft-no-events"><path d="M23 4v6h-6"></path><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path></svg>
               </span>
               <span id="nsft-rec-obj-minimise" title="${chrome.i18n.getMessage('ro_minimise')}"></span>
               <span id="nsft-rec-obj-maximise" title="${chrome.i18n.getMessage('ro_maximise')}"></span>
               <span id="nsft-rec-obj-close" title="${chrome.i18n.getMessage('ro_close')}">✕</span>
             </span>
             <div class="nsft-rec-obj-header-line"></div>
         </div>
         <div class="nsft-rec-obj-content">
             <div id="nsft-rec-obj-container">
                 <div id="nsft-rec-obj-search-container">
                     <div class="nsft-rec-obj-search-row">
                       
                       <div class="nsft-rec-obj-search-wrap">
                         <input id="rec-obj-search" name="rec-obj-search" placeholder="${chrome.i18n.getMessage('ro_search_placeholder')}" autocomplete="off">
                         <span id="rec-obj-clear" title="${chrome.i18n.getMessage('ro_clear_search')}" class="nsft-clear-search">✕</span>
                       </div>
                       
                       <div class="nsft-ro-viewseg" role="tablist">
                         <button type="button" id="rec-obj-view-json" class="nsft-ro-viewbtn is-on" role="tab">JSON</button>
                         <button type="button" id="rec-obj-view-friendly" class="nsft-ro-viewbtn" role="tab">${chrome.i18n.getMessage('ro_view_friendly') || 'Vista amigable'}</button>
                       </div>
                       <label class="nsft-rec-obj-hide-empty" title="${chrome.i18n.getMessage('ro_hide_empty_title') || 'Ocultar campos vacíos o null'}">
                         <input type="checkbox" id="rec-obj-hide-empty">
                         <span>${chrome.i18n.getMessage('ro_hide_empty_label') || 'Ocultar vacíos'}</span>
                       </label>
                       
                       <button type="button" id="rec-obj-fv-tech" class="nsft-ro-fv-toggle" style="display:none"></button>
                       
                       <span id="nsft-ro-rail-trigger"></span>
                     </div>
                 </div>
                 <div id="nsft-record-object-container" class="hljs">
                      ${getLoadingHtml()}
                 </div>
                 <div id="nsft-ro-friendly" class="nsft-ro-friendly" style="display:none"></div>
             </div>
         </div>
         <div class="nsft-rec-obj-footer">
             <span id="nsft-rec-obj-legend">${chrome.i18n.getMessage('ro_legend')}</span>
             <span id="nsft-rec-obj-staleness" class="nsft-rec-obj-staleness" style="display: none;"></span>
         </div>
         <div id="nsft-toast" class="nsft-toast-notification"></div>
       </div>`;

  const loadRecordXml = async (noneEdit) => {
    try {
      updateStatus(chrome.i18n.getMessage('ro_loading_record'));

      if (typeof nlapiGetRecordId != 'undefined') {
        STATE.id = nlapiGetRecordId();
        STATE.type = nlapiGetRecordType();
      }

      if (!pageHref()) {
        updateStatus(chrome.i18n.getMessage('ro_panel_no_tab') || 'Abre una pestaña de NetSuite.', true);
        STATE.loaded = true;
        return;
      }

      let url = pageHref();
      const hashIdx = url.indexOf('#');
      if (hashIdx !== -1) url = url.substring(0, hashIdx);
      url += (url.includes('?') ? '&' : '?') + 'xml=T';
      if (!url.includes('e=T') && !noneEdit) url += '&e=T';

      const response = await nsFetch(url, { method: 'GET', headers: { 'Content-Type': 'application/xml' } });
      if (!response.ok) {
        if (!noneEdit) return loadRecordXml(true);
        throw new Error(chrome.i18n.getMessage('ro_network_error'));
      }

      const xmlText = await response.text();
      await formatRecord(xmlText, noneEdit);

    } catch (e) {
      const escErr = (window.NSFT_DOM && window.NSFT_DOM.escapeHtml) ? window.NSFT_DOM.escapeHtml : ((v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])));
      updateStatus(chrome.i18n.getMessage('ro_load_error') + '<br>' + escErr(e.message || e), true);
      STATE.loaded = true;
    }
  };

  function panelSinRegistro() {
    updateStatus(chrome.i18n.getMessage('ro_panel_not_record')
      || 'Esta página no tiene un registro que mostrar.', true);
    STATE.loaded = true;
  }

  const formatRecord = async (xmlString, noneEdit) => {
    if (!xmlString) return;
    updateStatus(chrome.i18n.getMessage('ro_loading_record'));

    try {
      const parser = new DOMParser();
      const xml = parser.parseFromString(xmlString, "application/xml");

      let el = getXmlValue(xml, 'nsResponse', true);
      if (!el) el = getXmlValue(xml, 'nlapiResponse', true);

      if (!el) {
        if (noneEdit) {
          if (PANEL_MODE) { panelSinRegistro(); return; }
          throw chrome.i18n.getMessage('ro_root_node_error');
        }
        return loadRecordXml(true);
      }

      const record = getXmlValue(el, 'record', true);
      if (!record) {
        if (noneEdit) {
          if (PANEL_MODE) { panelSinRegistro(); return; }
          throw chrome.i18n.getMessage('ro_record_node_error');
        }
        return loadRecordXml(true);
      }

      _fvDisplay = {};

      const recordObject = { recordType: null, id: null, bodyFields: {}, lineFields: {} };
      if (!STATE.type && record.getAttribute('recordType')) STATE.type = record.getAttribute('recordType');
      if (!STATE.id && record.getAttribute('id')) STATE.id = record.getAttribute('id');

      const recordAttributes = record.getAttributeNames();
      recordAttributes.forEach(attr => {
        if (attr !== 'fields') recordObject[attr] = record.getAttribute(attr);
      });

      let fields = record.getAttribute('fields');
      if (fields) {
        fields.split(',').forEach(field => {
          if (!recordObject.bodyFields[field] && !shouldExcludeBodyField(field)) {
            recordObject.bodyFields[field] = '';
          }
        });
      }

      const sublistIds = [];
      const sublistData = {};
      const xmlInventoryDetailIds = [];

      Array.from(record.children).forEach(child => {
        const tagName = child.tagName;
        if (tagName != 'machine') {
          if (!shouldExcludeBodyField(tagName)) {
            recordObject.bodyFields[tagName] = getXmlValue(record, tagName);
          }
        } else {
          const machine = child;
          const machineId = machine.getAttribute('name');
          sublistIds.push(machineId);

          const lines = machine.children;
          if (!lines || !lines.length) return;

          const machineColumnsArray = (machine.getAttribute('fields') || '').split(',');
          const machineTemplate = {};
          machineColumnsArray.forEach(col => machineTemplate[col] = '');

          sublistData[machineId] = [];
          Array.from(lines).forEach(line => {
            const lineObj = { ...machineTemplate };
            Array.from(line.children).forEach(column => {
              lineObj[column.tagName] = column.textContent === "null" ? "" : column.textContent;
            });
            if (lineObj.inventorydetail) {
              xmlInventoryDetailIds.push(machineId + '-' + lineObj.inventorydetail);
            }
            sublistData[machineId].push(lineObj);
          });
        }
      });

      recordObject.lineFields = sublistData;
      updateStatus(chrome.i18n.getMessage('ro_loading_record'));

      await enrichRecordObject(recordObject, noneEdit);
      recogeTextosDeCampos(recordObject);

      const inventoryDetailIds = xmlInventoryDetailIds;

      if (inventoryDetailIds && inventoryDetailIds.length) {
        await processInventoryDetails(inventoryDetailIds, recordObject);
      } else {
        finishLoadingRecord(recordObject);
      }

    } catch (e) {
      const escErr = (window.NSFT_DOM && window.NSFT_DOM.escapeHtml) ? window.NSFT_DOM.escapeHtml : ((v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])));
      updateStatus(chrome.i18n.getMessage('ro_format_error') + ' <br>' + escErr(e.message || e), true);
      STATE.loaded = true;
    }
  };

  const finishLoadingRecord = (recordObject) => {
    sortObjectKeys(recordObject.bodyFields);
    sortObjectKeys(recordObject.lineFields);

    const cloned = JSON.parse(JSON.stringify(recordObject));

    if (_firstSnapshot) {
      _diffPaths = computeDiffPaths(_firstSnapshot, cloned);
    } else {
      _firstSnapshot = JSON.parse(JSON.stringify(cloned));
      _diffPaths = null;
    }

    STATE.nsftRecordObject = cloned;
    STATE.nsftChangedObject = null;
    _lastLoadedAt = Date.now();
    startStalenessTicker();
    renderRecord();
    STATE.loaded = true;
  };

  const computeDiffPaths = (snap, curr) => {
    const paths = new Set();
    const walk = (a, b, trail) => {
      if (a === b) return;
      const aIsObj = a && typeof a === 'object';
      const bIsObj = b && typeof b === 'object';
      if (!aIsObj && !bIsObj) {
        if (a !== b && trail.length) paths.add(JSON.stringify(trail));
        return;
      }
      if (!aIsObj || !bIsObj) {
        if (trail.length) paths.add(JSON.stringify(trail));
        return;
      }
      const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
      for (const k of keys) {
        const childTrail = trail.concat(k);
        if (!(k in a) || !(k in b)) {
          paths.add(JSON.stringify(childTrail));
          for (let i = 1; i < childTrail.length; i++) {
            paths.add(JSON.stringify(childTrail.slice(0, i + 1)));
          }
          continue;
        }
        walk(a[k], b[k], childTrail);
      }
    };
    walk(snap, curr, []);
    return paths;
  };

  const ensureChangedObject = () => {
    if (!STATE.nsftChangedObject && STATE.nsftRecordObject) {
      STATE.nsftChangedObject = JSON.parse(JSON.stringify(STATE.nsftRecordObject));
    }
    return STATE.nsftChangedObject;
  };

  const processInventoryDetails = async (inventoryDetailIds, recordObject) => {
    updateStatus(chrome.i18n.getMessage('ro_loading_record'));

    const CONCURRENCY = 5;
    const fetchOne = async (id) => {
      const [sublistId, internalId] = id.split('-');
      try {
        const response = await nsFetch('/app/accounting/transactions/inventory/numbered/inventorydetail.nl?e=T&xml=T&id=' + internalId, {
          method: 'GET',
          headers: { 'Content-Type': 'application/xml' }
        });
        if (!response.ok) throw new Error(chrome.i18n.getMessage('ro_network_error'));

        const text = await response.text();
        const parser = new DOMParser();
        const invDtlXml = parser.parseFromString(text, "application/xml");

        const machineEl = getXmlValue(invDtlXml, 'machine[name="inventoryassignment"]', true);
        if (!machineEl) return;

        const inventoryDetailsData = [];
        Array.from(machineEl.children).forEach(line => {
          const data = {};
          Array.from(line.children).forEach(field => {
            data[field.tagName] = field.textContent || '';
          });
          inventoryDetailsData.push(data);
        });

        const sublistData = recordObject.lineFields[sublistId];
        if (!sublistData) return;
        sublistData.forEach(line => {
          if (line.inventorydetail == internalId) {
            line.inventoryDetailId = internalId;
            line.inventorydetail = inventoryDetailsData;
          }
        });
      } catch (error) {
        console.error(chrome.i18n.getMessage('ro_load_error') + '<br>' + (error.message || error));
      }
    };

    const queue = inventoryDetailIds.slice();
    const workers = [];
    for (let i = 0; i < Math.min(CONCURRENCY, queue.length); i++) {
      workers.push((async () => {
        while (queue.length) {
          const next = queue.shift();
          if (next !== undefined) await fetchOne(next);
        }
      })());
    }
    await Promise.all(workers);

    finishLoadingRecord(recordObject);
  };


  const ENRICH_TIMEOUT_MS = 8000;

  const fetchWithTimeout = async (url, init) => {
    if (PANEL_MODE) return nsFetch(url, init);
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), ENRICH_TIMEOUT_MS);
    try {
      return await fetch(url, { ...init, signal: ctrl.signal });
    } finally {
      clearTimeout(t);
    }
  };

  const stripRestLinks = (value) => {
    if (Array.isArray(value)) return value.map(stripRestLinks);
    if (value && typeof value === 'object') {
      const out = {};
      Object.entries(value).forEach(([k, v]) => {
        if (k === 'links') return;
        out[k] = stripRestLinks(v);
      });
      return out;
    }
    return value;
  };

  const flattenRestRecord = (json) => {
    const body = {};
    const sublists = {};
    Object.entries(json || {}).forEach(([k, v]) => {
      if (k === 'links' || k === 'o:errorDetails') return;
      if (v === null || typeof v !== 'object') { body[k] = v; return; }
      if (Array.isArray(v)) { body[k] = stripRestLinks(v); return; }
      if (Array.isArray(v.items)) {
        sublists[k] = v.items.map((line) => stripRestLinks(line));
        return;
      }
      if ('id' in v && 'links' in v && Object.keys(v).length <= 3) {
        if (v.refName != null && v.refName !== '') _fvDisplay[String(k).toLowerCase()] = String(v.refName);
        body[k] = (v.refName != null && v.refName !== '')
          ? v.id + ' (' + v.refName + ')'
          : v.id;
        return;
      }
      body[k] = stripRestLinks(v);
    });
    return { body, sublists };
  };

  const mergeMissingBody = (recordObject, extraBody) => {
    const have = new Set(Object.keys(recordObject.bodyFields).map((k) => k.toLowerCase()));
    Object.keys(recordObject).forEach((k) => have.add(k.toLowerCase()));
    let added = 0;
    Object.entries(extraBody || {}).forEach(([k, v]) => {
      const lk = k.toLowerCase();
      if (have.has(lk) || shouldExcludeBodyField(lk)) return;
      recordObject.bodyFields[k] = v;
      have.add(lk);
      added += 1;
    });
    return added;
  };

  const mergeMissingSublists = (recordObject, sublists) => {
    let added = 0;
    const haveNames = {};
    Object.keys(recordObject.lineFields).forEach((k) => { haveNames[k.toLowerCase()] = k; });
    Object.entries(sublists || {}).forEach(([name, lines]) => {
      const existingName = haveNames[name.toLowerCase()];
      if (!existingName) {
        recordObject.lineFields[name] = lines;
        added += (lines.length && lines[0] && typeof lines[0] === 'object')
          ? Object.keys(lines[0]).length
          : 1;
        return;
      }
      const target = recordObject.lineFields[existingName];
      if (!Array.isArray(target) || target.length !== lines.length) return;
      const newCols = new Set();
      target.forEach((line, i) => {
        const have = new Set(Object.keys(line).map((k) => k.toLowerCase()));
        Object.entries(lines[i] || {}).forEach(([k, v]) => {
          if (have.has(k.toLowerCase())) return;
          line[k] = v;
          newCols.add(k.toLowerCase());
        });
      });
      added += newCols.size;
    });
    return added;
  };

  const suiteqlTableFor = (type) => {
    const t = String(type || '').toLowerCase();
    return /^[a-z][a-z0-9_]*$/.test(t) ? t : null;
  };

  const xmlVariantUrl = (wantEdit) => {
    const u = new URL(pageHref() || window.location.href);
    u.hash = '';
    u.searchParams.set('xml', 'T');
    if (wantEdit) u.searchParams.set('e', 'T');
    else u.searchParams.delete('e');
    return u.toString();
  };

  const xmlRecordParts = (xmlText) => {
    try {
      const xml = new DOMParser().parseFromString(xmlText, 'application/xml');
      const el = getXmlValue(xml, 'nsResponse', true) || getXmlValue(xml, 'nlapiResponse', true);
      const record = el && getXmlValue(el, 'record', true);
      if (!record) return null;

      const body = {};
      const sublists = {};
      record.getAttributeNames().forEach((attr) => {
        if (attr !== 'fields') body[attr] = record.getAttribute(attr);
      });
      (record.getAttribute('fields') || '').split(',').forEach((f) => {
        if (f && body[f] === undefined) body[f] = '';
      });
      Array.from(record.children).forEach((child) => {
        if (child.tagName === 'machine') {
          const name = child.getAttribute('name');
          if (!name) return;
          const template = {};
          (child.getAttribute('fields') || '').split(',').forEach((c) => { if (c) template[c] = ''; });
          sublists[name] = Array.from(child.children).map((line) => {
            const obj = { ...template };
            Array.from(line.children).forEach((col) => {
              obj[col.tagName] = col.textContent === 'null' ? '' : col.textContent;
            });
            return obj;
          });
        } else {
          body[child.tagName] = child.textContent === 'null' ? '' : child.textContent;
        }
      });
      return { body, sublists };
    } catch (e) {
      return null;
    }
  };

  const fetchXmlVariant = async (wantEdit) => {
    const resp = await fetchWithTimeout(xmlVariantUrl(wantEdit), {
      headers: { 'Content-Type': 'application/xml' },
      credentials: 'same-origin'
    });
    if (!resp.ok) return null;
    const text = await resp.text();
    const t = text.trim();
    if (t.startsWith('<!DOCTYPE') || t.startsWith('<html')) return null;
    return xmlRecordParts(text);
  };

  const fetchRestRecord = async (type, id) => {
    const url = '/services/rest/record/v1/' + encodeURIComponent(String(type).toLowerCase())
      + '/' + encodeURIComponent(String(id)) + '?expandSubResources=true';
    const resp = await fetchWithTimeout(url, {
      headers: { 'Accept': 'application/json' },
      credentials: 'same-origin'
    });
    if (!resp.ok) return null;
    return resp.json();
  };

  const fetchSuiteQLRowRest = async (table, idNum) => {
    const resp = await fetchWithTimeout('/services/rest/query/v1/suiteql?limit=1&offset=0', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', 'Prefer': 'transient' },
      body: JSON.stringify({ q: 'SELECT * FROM ' + table + ' WHERE id = ' + idNum })
    });
    const rest = window.NSFT_SuiteQLRest;
    if (!resp.ok) {
      if (rest && rest.markOff && (resp.status === 403 || resp.status === 404)) rest.markOff();
      return null;
    }
    if (rest && rest.markOn) rest.markOn();
    const json = await resp.json();
    const item = (json && json.items && json.items[0]) || null;
    if (!item) return null;
    const row = {};
    Object.keys(item).forEach((k) => { if (k !== 'links') row[k] = item[k]; });
    return row;
  };

  const SQL_FETCHER_TIMEOUT_MS = 6000;
  let _roFetcherInjected = false;
  let _sqlReqSeq = PANEL_MODE ? 1000000 : 0;

  const RO_FETCHER_PATH = 'scripts/modules/view_record_object/view_record_object_fetcher.js';

  const injectRoFetcher = () => {
    if (PANEL_MODE) return;
    if (_roFetcherInjected) return;
    _roFetcherInjected = true;
    const s = document.createElement('script');
    s.src = chrome.runtime.getURL(RO_FETCHER_PATH);
    s.onload = function () { this.remove(); };
    (document.head || document.documentElement).appendChild(s);
  };

  const roPost = (msg) => {
    if (!PANEL_MODE) { window.postMessage(msg, '*'); return; }
    const client = window.NSFT_PanelClient;
    if (client) client.post(msg, { inject: RO_FETCHER_PATH, relay: ['extension_ro'] });
  };

  const sqlRowViaFetcher = (table, idNum) => new Promise((resolve) => {
    try {
      injectRoFetcher();
      const reqId = ++_sqlReqSeq;
      let timer = null;
      const onMsg = (e) => {
        if (e.source !== window) return;
        const d = e.data;
        if (!d || d.dest !== 'extension_ro' || d.type !== 'sqlrow') return;
        if (!d.payload || d.payload.reqId !== reqId) return;
        cleanup();
        resolve(d.payload.row || null);
      };
      const cleanup = () => {
        window.removeEventListener('message', onMsg);
        if (timer) clearTimeout(timer);
      };
      window.addEventListener('message', onMsg);
      timer = setTimeout(() => { cleanup(); resolve(null); }, SQL_FETCHER_TIMEOUT_MS);
      const send = () => roPost({
        dest: 'fetcher_ro', type: 'sqlrow',
        payload: { reqId, table, id: idNum }
      });
      send();
      setTimeout(send, 350);
    } catch (e) { resolve(null); }
  });

  const fetchSuiteQLRow = async (type, id, restOff) => {
    const table = suiteqlTableFor(type);
    const idNum = parseInt(id, 10);
    if (!table || !idNum || idNum <= 0) return null;
    if (!restOff) {
      const row = await fetchSuiteQLRowRest(table, idNum).catch(() => null);
      if (row) return row;
    }
    return sqlRowViaFetcher(table, idNum);
  };

  const enrichRecordObject = async (recordObject, baseWasView) => {
    try {
      const type = recordObject.recordType || STATE.type;
      const id = recordObject.id || STATE.id;
      if (!type || !id) return;

      const restHelper = window.NSFT_SuiteQLRest;
      let off = false;
      try {
        off = await Promise.resolve(restHelper && restHelper.isKnownOff ? restHelper.isKnownOff() : false);
      } catch (e) { off = false; }

      const [xmlAlt, restJson, sqlRow] = await Promise.all([
        fetchXmlVariant(!!baseWasView).catch(() => null),
        off ? null : fetchRestRecord(type, id).catch(() => null),
        fetchSuiteQLRow(type, id, off).catch(() => null)
      ]);

      if (xmlAlt) {
        mergeMissingBody(recordObject, xmlAlt.body);
        mergeMissingSublists(recordObject, xmlAlt.sublists);
      }
      if (restJson) {
        const flat = flattenRestRecord(restJson);
        mergeMissingBody(recordObject, flat.body);
        mergeMissingSublists(recordObject, flat.sublists);
      }
      if (sqlRow) {
        mergeMissingBody(recordObject, sqlRow);
      }
    } catch (e) {
    }
  };

  const recogeTextosDeCampos = (recordObject) => {
    const body = recordObject.bodyFields || {};
    Object.keys(body).forEach((k) => {
      const m = String(k).match(/^(.+?)(_display|_text)$/i);
      if (!m) return;
      const base = m[1].toLowerCase();
      const texto = body[k];
      if (texto === '' || texto == null) return;
      if (!(m[1] in body)) return;
      if (!_fvDisplay[base]) _fvDisplay[base] = String(texto);
    });
  };

  const shouldExcludeBodyField = (fieldId) => {
    const f = String(fieldId || '').toLowerCase();
    return BODY_PROPERTIES_TO_EXCLUDE.includes(f) || f.startsWith('nsapi') || f.startsWith('nlapi');
  };

  const getXmlValue = (xml, property, returnNode) => {
    try {
      const el = xml.querySelector(property);
      if (el && returnNode) return el;
      if (el) return el.textContent;
      return null;
    } catch (e) {
      if (window.NSFT_DOM && window.NSFT_DOM.isDiagEnabled && window.NSFT_DOM.isDiagEnabled()) {
        try { console.warn('[NSFT:getXmlValue]', property, e); } catch (logErr) { }
      }
      return null;
    }
  };

  const sortObjectKeys = (obj) => {
    if (typeof obj !== 'object' || obj === null) return obj;
    if (Array.isArray(obj)) {
      for (let i = 0; i < obj.length; i++) sortObjectKeys(obj[i]);
      return obj;
    }
    const sortedKeys = Object.keys(obj).sort();
    for (const key of sortedKeys) {
      const value = obj[key];
      delete obj[key];
      obj[key] = value;
      sortObjectKeys(value);
    }
    return obj;
  };

  const escapeRegex = (str) => (str + '').replace(/([\\\.\+\*\?\[\^\]\$\(\)\{\}\=\!\<\>\|\:])/g, '\\$1');

  let _lastRenderedSource = null;


  const FV_TECH = /^(nl|wf|script|submitnext|entryform|customwhence|templatestored|baserecordtype|selectedtab|sys_id|recordid|rectype|nameorig|customform|whence|externalid|version)/i;
  const FV_MONEY = /(amount|total|rate|cost|price|subtotal|balance)/i;
  const FV_NAMEISH = /(name|title|tranid|descr|label|code)/i;
  const FV_COL_PREF = ['tranid', 'itemname', 'name', 'title', 'descr', 'type', 'status', 'trandate', 'date', 'total', 'amount', 'quantity', 'rate', 'id'];
  const FV_ROW_CAP = 12;

  function fvI18n(key, fallback, subs) {
    let out = '';
    try { out = chrome.i18n.getMessage(key, subs) || ''; } catch (e) { out = ''; }
    if (!out) {
      out = fallback;
      (subs || []).forEach((v, idx) => { out = out.split('$' + (idx + 1)).join(String(v)); });
    }
    return out;
  }

  function setViewMode(mode) {
    _viewMode = mode === 'friendly' ? 'friendly' : 'json';
    const modal = document.getElementById('nsft-rec-obj-modal');
    const jsonC = document.getElementById('nsft-record-object-container');
    const fvC = document.getElementById('nsft-ro-friendly');
    const jsonBtn = document.getElementById('rec-obj-view-json');
    const fvBtn = document.getElementById('rec-obj-view-friendly');
    const hideEmptyLbl = document.querySelector('.nsft-rec-obj-hide-empty');
    const fvTechBtn = document.getElementById('rec-obj-fv-tech');
    const friendly = _viewMode === 'friendly';
    if (jsonC) jsonC.style.display = friendly ? 'none' : '';
    if (fvC) fvC.style.display = friendly ? 'flex' : 'none';
    if (jsonBtn) jsonBtn.classList.toggle('is-on', !friendly);
    if (fvBtn) fvBtn.classList.toggle('is-on', friendly);
    if (hideEmptyLbl) hideEmptyLbl.style.display = friendly ? 'none' : '';
    if (fvTechBtn) fvTechBtn.style.display = friendly ? '' : 'none';

    if (modal && !PANEL_MODE) {
      modal.classList.toggle('nsft-ro-wide', friendly);
      clearTimeout(_fvResizeTimer);
      _fvResizeTimer = setTimeout(() => {
        constrainModalToWindow(modal);
        fvMideHuecos();
      }, 850);
    }

    renderRecord();
  }
  let _fvResizeTimer = null;

  function fvIsObj(v) { return v && typeof v === 'object' && !Array.isArray(v); }
  function fvIsArr(v) { return Array.isArray(v); }
  function fvIsEmpty(v) {
    return v === '' || v === null || v === undefined
      || (fvIsArr(v) && v.length === 0) || (fvIsObj(v) && Object.keys(v).length === 0);
  }

  function fvHumanize(key) {
    const dict = fvI18n('ro_k_' + String(key).toLowerCase(), '');
    if (dict) return dict;
    const k = String(key)
      .replace(/^(custbody|custcol|custrecord|custentity|custitem|custevent|custpage)_/, '')
      .replace(/_display$/, '')
      .replace(/_/g, ' ')
      .trim();
    return k.charAt(0).toUpperCase() + k.slice(1);
  }

  function fvClassify(v) {
    if (fvIsEmpty(v)) return 'empty';
    if (fvIsArr(v)) return v.some(fvIsObj) ? 'objectArray' : 'scalarArray';
    if (fvIsObj(v)) return 'object';
    return 'scalar';
  }

  function fvMoney(n) {
    try { return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
    catch (e) { return String(n); }
  }

  function fvFmt(key, v) {
    if (fvIsEmpty(v)) return { text: fvI18n('ro_fv_none', 'No value'), tone: 'neutral' };
    if (v === 'T' || v === true) return { text: fvI18n('ro_fv_yes', 'Yes'), tone: 'yes' };
    if (v === 'F' || v === false) return { text: fvI18n('ro_fv_no', 'No'), tone: 'no' };

    const pegado = (typeof v === 'string') && v.match(/^(\d+)\s+\((.+)\)$/);
    if (pegado) return { text: pegado[2], tone: '', raw: pegado[1] };

    const texto = _fvDisplay[String(key).toLowerCase()];
    if (texto && String(texto) !== String(v)) return { text: String(texto), tone: '', raw: String(v) };

    const n = typeof v === 'number' ? v : (/^-?\d+(\.\d+)?$/.test(v) ? parseFloat(v) : null);
    if (n !== null && FV_MONEY.test(key)) return { text: fvMoney(n), tone: '' };
    if (typeof v === 'string' && v.indexOf('/app/') === 0) return { text: v.split('?')[0], tone: '' };
    return { text: String(v), tone: '' };
  }

  function fvIdKey(o) {
    if (!fvIsObj(o)) return null;
    const preferred = ['tranid', 'itemname', 'name', 'title', 'descr', 'label'];
    for (let i = 0; i < preferred.length; i++) if (!fvIsEmpty(o[preferred[i]])) return preferred[i];
    const scalars = Object.keys(o).filter((k) => fvClassify(o[k]) === 'scalar');
    const nameish = scalars.filter((k) => FV_NAMEISH.test(k))[0];
    if (nameish) return nameish;
    const notLine = scalars.filter((k) => !/^(line|id)$/i.test(k))[0];
    return notLine || scalars[0] || null;
  }
  function fvRowTitle(o, iRow) {
    const k = fvIdKey(o);
    return k ? fvFmt(k, o[k]).text : fvI18n('ro_fv_row_n', 'Item $1', [String(iRow)]);
  }

  function fvPickCols(rows) {
    const score = {};
    rows.forEach((r) => {
      if (!fvIsObj(r)) return;
      Object.keys(r).forEach((k) => {
        if (!fvIsEmpty(r[k]) && fvClassify(r[k]) === 'scalar') score[k] = (score[k] || 0) + 1;
      });
    });
    let keys = Object.keys(score).sort((a, b) => {
      const pa = FV_COL_PREF.indexOf(a), pb = FV_COL_PREF.indexOf(b);
      const ra = pa < 0 ? (FV_NAMEISH.test(a) ? 50 : 99) : pa;
      const rb = pb < 0 ? (FV_NAMEISH.test(b) ? 50 : 99) : pb;
      if (ra !== rb) return ra - rb;
      return score[b] - score[a];
    });
    const forced = fvIdKey(rows.filter(fvIsObj)[0]);
    if (forced) keys = [forced].concat(keys.filter((k) => k !== forced));
    return keys.slice(0, 5);
  }

  function fvFlatten(node, trail, depth, out, stats) {
    const entries = fvIsArr(node) ? [] : Object.keys(node).map((k) => [k, node[k]]);
    const scalars = [], containers = [];

    entries.forEach(([k, v]) => {
      const cls = fvClassify(v);
      if (depth === 0 && /^(recordtype|id|perm)$/i.test(k)) return;

      const hermano = String(k).match(/^(.+?)(_display|_text)$/i);
      if (hermano && _fvDisplay[hermano[1].toLowerCase()]) {
        stats.hidden++;
        if (!_fvShowTech) return;
      }
      const noisy = (cls === 'empty' && !fvIsArr(v) && !fvIsObj(v)) || FV_TECH.test(k);
      if (noisy) { stats.hidden++; if (!_fvShowTech) return; }
      if (cls === 'object' || cls === 'objectArray' || cls === 'scalarArray' || ((fvIsObj(v) || fvIsArr(v)) && cls === 'empty')) {
        containers.push([k, v, cls]);
      } else {
        scalars.push([k, v]);
      }
    });

    scalars.forEach(([k, v]) => {
      const f = fvFmt(k, v);
      stats.shown++;
      out.push({
        type: 'field', depth, trail, key: k, label: fvHumanize(k),
        value: f.text, tone: f.tone, raw: f.raw || '',
        hay: fvFold(k + ' ' + fvHumanize(k) + ' ' + f.text + ' ' + (f.raw || ''))
      });
    });

    containers.forEach(([k, v, cls]) => {
      const label = k === 'bodyFields' ? fvI18n('ro_fv_g_body', 'Header fields')
        : k === 'lineFields' ? fvI18n('ro_fv_g_lines', 'Line sublists')
        : fvHumanize(k);
      const nextTrail = trail.concat(label);
      const id = nextTrail.join('/') + '#' + depth;
      const hay = fvFold(k + ' ' + label);

      if (cls === 'empty') {
        out.push({ type: 'section', depth, trail, label, id, badge: fvI18n('ro_fv_badge_empty', 'empty'), count: 0, hay });
        out.push({ type: 'emptyNote', depth: depth + 1, trail: nextTrail, label: fvI18n('ro_fv_empty_note', 'No items.'), hay });
        return;
      }

      if (cls === 'scalarArray') {
        out.push({ type: 'section', depth, trail, label, id,
          badge: fvI18n('ro_fv_badge_values', '$1 values', [String(v.length)]), count: v.length, list: true, hay });
        out.push({ type: 'chips', depth: depth + 1, trail: nextTrail, chips: v.map(String), hay: fvFold(v.join(' ')) });
        stats.shown += v.length;
        return;
      }

      if (cls === 'objectArray') {
        const cols = fvPickCols(v).map((c) => ({ key: c, label: fvHumanize(c) }));
        const moneyCol = cols.filter((c) => FV_MONEY.test(c.key))[0];
        const sum = moneyCol ? v.reduce((a, r) => a + (parseFloat(r && r[moneyCol.key]) || 0), 0) : null;

        out.push({ type: 'section', depth, trail, label, id,
          badge: fvI18n('ro_fv_badge_rows', '$1 rows', [String(v.length)]), count: v.length, list: true, hay });
        out.push({
          type: 'table', depth: depth + 1, trail: nextTrail, cols, count: v.length, tableId: id,
          rows: v.map((r, iRow) => ({
            idx: iRow + 1,
            cells: cols.map((c) => fvFmt(c.key, r ? r[c.key] : '').text)
          })),
          total: sum,
          totalLabel: moneyCol ? fvI18n('ro_fv_sum', 'Sum of $1', [fvHumanize(moneyCol.key)]) : null,
          hay: fvFold(v.map((r) => Object.keys(r || {})
            .filter((kk) => fvClassify(r[kk]) === 'scalar')
            .map((kk) => kk + ' ' + r[kk]).join(' ')).join(' '))
        });
        stats.shown += v.length * cols.length;

        v.forEach((row, iRow) => {
          const hasKids = fvIsObj(row) && Object.keys(row).some((kk) =>
            fvIsObj(row[kk]) || (fvIsArr(row[kk]) && row[kk].length));
          if (hasKids) fvFlatten(row, nextTrail.concat('#' + (iRow + 1) + ' ' + fvRowTitle(row, iRow + 1)), depth + 1, out, stats);
        });
        return;
      }

      const kids = Object.keys(v).map((kk) => v[kk]);
      const inner = kids.filter((x) => fvClassify(x) === 'scalar').length;
      const subs = kids.filter((x) => fvIsObj(x) || fvIsArr(x)).length;
      const badge = inner && subs
        ? fvI18n('ro_fv_badge_mix', '$1 fields · $2 subgroups', [String(inner), String(subs)])
        : inner ? fvI18n('ro_fv_badge_fields', '$1 fields', [String(inner)])
        : subs ? fvI18n('ro_fv_badge_subs', '$1 subgroups', [String(subs)])
        : fvI18n('ro_fv_badge_empty', 'empty');

      out.push({ type: 'section', depth, trail, label, id, badge, count: inner + subs, hay });
      fvFlatten(v, nextTrail, depth + 1, out, stats);
    });
  }

  function fvMideHuecos() {
    const bar = document.getElementById('nsft-rec-obj-search-container');
    const modalEl = document.getElementById('nsft-rec-obj-modal');
    const scrollerEl = document.querySelector('.nsft-rec-obj-content');
    if (!bar || !modalEl) return;
    const h = Math.round(bar.getBoundingClientRect().height) || 48;
    modalEl.style.setProperty('--nsft-ro-bar-h', h + 'px');
    const visible = scrollerEl ? Math.round(scrollerEl.clientHeight) : 0;
    if (visible > 120) modalEl.style.setProperty('--nsft-ro-rail-max', (visible - h - 24) + 'px');

    const mr = modalEl.getBoundingClientRect();
    const sr = scrollerEl ? scrollerEl.getBoundingClientRect() : null;
    if (sr && mr.height) {
      modalEl.style.setProperty('--nsft-ro-view-top', Math.max(0, Math.round(sr.top - mr.top + h)) + 'px');
      modalEl.style.setProperty('--nsft-ro-view-bottom', Math.max(0, Math.round(mr.bottom - sr.bottom)) + 'px');
    }
  }

  const FV_NARROW_AT = 560;
  const FV_TINY_AT = 400;
  let _fvNarrow = false;
  let _fvRailOpen = false;
  let _fvWidthObs = null;

  function fvVigilaAncho() {
    const modalEl = document.getElementById('nsft-rec-obj-modal');
    if (!modalEl || _fvWidthObs) return;
    const aplica = () => {
      const w = modalEl.clientWidth;
      if (!w) return;
      const narrow = w < FV_NARROW_AT;
      modalEl.classList.toggle('nsft-ro-narrow', narrow);
      modalEl.classList.toggle('nsft-ro-tiny', w < FV_TINY_AT);
      if (narrow !== _fvNarrow) {
        _fvNarrow = narrow;
        if (!narrow) fvAbreCajon(false);
        if (_viewMode === 'friendly') renderFriendly();
      }
      fvMideHuecos();
    };
    if (window.ResizeObserver) {
      _fvWidthObs = new window.ResizeObserver(aplica);
      _fvWidthObs.observe(modalEl);
    } else {
      window.addEventListener('resize', aplica);
    }
    aplica();
  }

  function fvAbreCajon(abrir) {
    _fvRailOpen = !!abrir;
    const modalEl = document.getElementById('nsft-rec-obj-modal');
    if (modalEl) modalEl.classList.toggle('nsft-ro-rail-open', _fvRailOpen);
  }

  function fvEl(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined && text !== null) n.textContent = text;
    return n;
  }

  let _fvQuery = '';

  const fvTS = () => window.NSFT_TextSearch;

  function fvFold(s) {
    const TS = fvTS();
    return TS ? TS.fold(s) : String(s == null ? '' : s).toLowerCase();
  }

  function fvMarca(el, texto) {
    const TS = fvTS();
    if (TS) return TS.mark(el, texto, _fvQuery, 'nsft-ro-fv-hl');
    el.textContent = String(texto == null ? '' : texto);
    return el;
  }

  function fvElQ(tag, cls, text) {
    return fvMarca(fvEl(tag, cls), text);
  }

  function fvSavePins() {
    try { chrome.storage.local.set({ [FV_PINS_KEY]: _fvPins || {} }); } catch (e) { }
  }

  function renderFriendly() {
    const host = document.getElementById('nsft-ro-friendly');
    const searchbox = document.getElementById('rec-obj-search');
    const clearBtn = document.getElementById('rec-obj-clear');
    const techBtn = document.getElementById('rec-obj-fv-tech');
    if (!host) return;

    if (clearBtn) clearBtn.style.display = searchbox && searchbox.value ? 'block' : 'none';
    if (techBtn) {
      techBtn.textContent = _fvShowTech
        ? fvI18n('ro_fv_tech_hide', 'Hide technical')
        : fvI18n('ro_fv_tech_show', 'Show technical');
      techBtn.classList.toggle('is-on', _fvShowTech);
    }

    if (_fvPins === null) {
      _fvPins = {};
      try {
        chrome.storage.local.get({ [FV_PINS_KEY]: {} }, (items) => {
          _fvPins = (items[FV_PINS_KEY] && typeof items[FV_PINS_KEY] === 'object') ? items[FV_PINS_KEY] : {};
          if (_viewMode === 'friendly') renderFriendly();
        });
      } catch (e) { }
    }

    host.innerHTML = '';
    _fvSectionEls = {};

    if (!STATE.nsftRecordObject) {
      host.appendChild(fvEl('div', 'nsft-ro-fv-state',
        STATE.loaded ? chrome.i18n.getMessage('ro_load_error') : chrome.i18n.getMessage('ro_still_loading')));
      return;
    }

    const record = STATE.nsftRecordObject;
    const recordType = record.recordType || 'record';
    const pins = (_fvPins && _fvPins[recordType]) || [];
    _fvQuery = String(searchbox ? searchbox.value : '').trim();
    const q = fvFold(_fvQuery);

    const stats = { shown: 0, hidden: 0 };
    const raw = [];
    fvFlatten(record, [], 0, raw, stats);

    let visible = raw;
    if (q) {
      const keep = {};
      const keepAncestors = (i, depth) => {
        let d = depth;
        for (let j = i - 1; j >= 0; j--) {
          if (raw[j].type === 'section' && raw[j].depth < d) { keep[j] = true; d = raw[j].depth; if (d === 0) break; }
        }
      };
      raw.forEach((b, i) => {
        if (!b.hay || b.hay.indexOf(q) === -1) return;
        keep[i] = true;
        keepAncestors(i, b.depth);
        if (b.type === 'section') {
          for (let j = i + 1; j < raw.length; j++) {
            if (raw[j].type === 'section' && raw[j].depth <= b.depth) break;
            keep[j] = true;
          }
        }
      });
      visible = raw.filter((_x, i) => keep[i]);
    }

    fvMideHuecos();
    fvVigilaAncho();

    const branches = raw.filter((b) => b.type === 'section' && b.depth <= 1);
    const irArriba = () => {
      const scroller = document.querySelector('.nsft-rec-obj-content');
      if (scroller) scroller.scrollTop = 0;
    };

    const trigHost = document.getElementById('nsft-ro-rail-trigger');
    if (trigHost) {
      trigHost.innerHTML = '';
      const trig = fvEl('button', 'nsft-ro-fv-rail-trigger');
      trig.type = 'button';
      trig.appendChild(fvEl('span', null, '☰ ' + fvI18n('ro_fv_structure', 'Structure')));
      trig.appendChild(fvEl('span', 'sub', String(branches.length)));
      trig.addEventListener('click', () => fvAbreCajon(!_fvRailOpen));
      trigHost.appendChild(trig);
    }

    const velo = fvEl('div', 'nsft-ro-fv-backdrop');
    velo.addEventListener('click', () => fvAbreCajon(false));
    host.appendChild(velo);

    const rail = fvEl('nav', 'nsft-ro-fv-rail');

    const rhead = fvEl('div', 'nsft-ro-fv-rail-head');
    rhead.appendChild(fvEl('span', 't', fvI18n('ro_fv_structure', 'Structure')));
    const rclose = fvEl('button', null, '✕');
    rclose.type = 'button';
    rclose.title = fvI18n('sql_panel_close', 'Close');
    rclose.addEventListener('click', () => fvAbreCajon(false));
    rhead.appendChild(rclose);
    rail.appendChild(rhead);

    rail.appendChild(fvEl('div', 'nsft-ro-fv-rail-title', fvI18n('ro_fv_structure', 'Structure')));

    const top0 = fvEl('button', 'nsft-ro-fv-rail-top');
    top0.type = 'button';
    top0.appendChild(fvEl('span', 'arrow', '▲'));
    top0.appendChild(fvEl('span', null, fvI18n('ro_fv_to_top', 'Back to the top')));
    top0.addEventListener('click', () => { irArriba(); fvAbreCajon(false); });
    rail.appendChild(top0);

    const rlist = fvEl('div', 'nsft-ro-fv-rail-list');
    branches.forEach((b) => {
      const btn = fvEl('button', 'nsft-ro-fv-rail-item depth-' + (b.depth === 0 ? '0' : 'n'));
      btn.type = 'button';
      btn.style.paddingLeft = (6 + b.depth * 12) + 'px';
      btn.appendChild(fvElQ('span', 'label', b.label));
      btn.appendChild(fvEl('span', 'count', b.count != null ? String(b.count) : '·'));
      btn.addEventListener('click', () => {
        const target = _fvSectionEls[b.id];
        const scroller = document.querySelector('.nsft-rec-obj-content');
        if (!target || !scroller) return;
        const tr = target.getBoundingClientRect();
        const sr = scroller.getBoundingClientRect();
        const barra = document.getElementById('nsft-rec-obj-search-container');
        const alto = barra ? Math.round(barra.getBoundingClientRect().height) : 48;
        scroller.scrollTop += tr.top - sr.top - alto - 6;
        fvAbreCajon(false);
      });
      rlist.appendChild(btn);
    });
    rail.appendChild(rlist);

    const racts = fvEl('div', 'nsft-ro-fv-rail-actions');
    const bTop = fvEl('button', 'nsft-ro-fv-btn', fvI18n('ro_fv_to_top', 'Back to the top'));
    bTop.type = 'button';
    bTop.addEventListener('click', () => { irArriba(); fvAbreCajon(false); });
    const bClose = fvEl('button', 'nsft-ro-fv-btn is-primary', fvI18n('sql_tab_close', 'Close'));
    bClose.type = 'button';
    bClose.addEventListener('click', () => fvAbreCajon(false));
    racts.appendChild(bTop);
    racts.appendChild(bClose);
    rail.appendChild(racts);

    host.appendChild(rail);

    const main = fvEl('div', 'nsft-ro-fv-main');
    host.appendChild(main);

    const hero = fvEl('div', 'nsft-ro-fv-hero');
    const top = fvEl('div', 'nsft-ro-fv-hero-top');
    top.appendChild(fvEl('span', 'nsft-ro-fv-type', recordType));
    top.appendChild(fvEl('span', 'nsft-ro-fv-hero-meta', 'id ' + (record.id != null ? record.id : '—')));
    hero.appendChild(top);
    const body = record.bodyFields || {};
    hero.appendChild(fvEl('h1', null, body.tranid || body.name || (recordType + ' ' + (record.id || ''))));
    const st = fvEl('div', 'nsft-ro-fv-hero-stats');
    st.appendChild(fvEl('span', null, fvI18n('ro_fv_values_listed', '$1 values listed', [String(stats.shown)])));
    st.appendChild(fvEl('span', null, fvI18n('ro_fv_sublists_n', '$1 sublists',
      [String(raw.filter((b) => b.type === 'table').length)])));
    st.appendChild(fvEl('span', null, fvI18n(_fvShowTech ? 'ro_fv_hidden_shown' : 'ro_fv_hidden_n',
      _fvShowTech ? '$1 empty/technical shown' : '$1 empty/technical hidden', [String(stats.hidden)])));
    hero.appendChild(st);
    main.appendChild(hero);

    if (pins.length) main.appendChild(fvRenderPins(recordType, pins, raw));

    let group = null;
    visible.forEach((b) => {
      if (b.type === 'field') {
        if (!group || group.depth !== b.depth) {
          group = { depth: b.depth, node: fvEl('div', 'nsft-ro-fv-fields') };
          main.appendChild(fvWrap(b.depth, group.node));
        }
        group.node.appendChild(fvRenderField(b, recordType, pins));
        return;
      }
      group = null;
      if (b.type === 'section') main.appendChild(fvWrap(b.depth, fvRenderSection(b)));
      else if (b.type === 'table') main.appendChild(fvWrap(b.depth, fvRenderTable(b)));
      else if (b.type === 'chips') main.appendChild(fvWrap(b.depth, fvRenderChips(b)));
      else if (b.type === 'emptyNote') main.appendChild(fvWrap(b.depth, fvEl('div', 'nsft-ro-fv-empty-note', b.label)));
    });

    if (q && !visible.length) {
      main.appendChild(fvEl('div', 'nsft-ro-fv-noresults',
        fvI18n('ro_fv_no_results', 'No matches for “$1”', [searchbox.value])));
    }

    const foot = fvEl('div', 'nsft-ro-fv-foothint');
    foot.innerHTML = fvI18n('ro_fv_foot_hint',
      '<strong>Ctrl + Click</strong> on a field to find it on the form · <strong>★</strong> to pin it');
    main.appendChild(foot);
  }

  function fvWrap(depth, child) {
    const w = fvEl('div', 'nsft-ro-fv-block');
    w.style.paddingLeft = (Math.min(depth, 3) * 14) + 'px';
    w.appendChild(child);
    return w;
  }

  function fvRenderSection(b) {
    const s = fvEl('div', 'nsft-ro-fv-section depth-' + (b.depth === 0 ? '0' : 'n'));
    s.appendChild(fvElQ('span', 'h', b.label));
    s.appendChild(fvEl('span', 'nsft-ro-fv-badge' + (b.list ? ' is-list' : ''), b.badge));
    s.appendChild(fvEl('span', 'rule'));
    s.appendChild(fvEl('span', 'trail', b.trail.length ? b.trail.join(' › ') : '$'));
    if (b.id) _fvSectionEls[b.id] = s;
    return s;
  }

  function fvRenderField(b, recordType, pins) {
    const pinned = pins.indexOf(b.key) !== -1;
    const f = fvEl('div', 'nsft-ro-fv-field');

    const keys = fvEl('div', 'keys');
    const lab = fvElQ('div', 'label', b.label);
    lab.title = b.label;
    const rk = fvElQ('div', 'rawkey', b.key);
    rk.title = b.key;
    keys.appendChild(lab);
    keys.appendChild(rk);
    f.appendChild(keys);

    const val = fvEl('div', 'val');
    if (b.tone === 'yes' || b.tone === 'no' || b.tone === 'neutral') {
      val.appendChild(fvElQ('span', 'nsft-ro-fv-pill' + (b.tone === 'neutral' ? '' : ' is-' + b.tone), b.value));
    } else {
      const numerico = /^[-$\s\d.,:/]+$/.test(b.value);
      const t = fvElQ('span', 'text' + (numerico ? ' is-num' : ''), b.value);
      t.title = b.value + '  ·  ' + fvI18n('ro_fv_click_copy', 'click to copy');
      t.addEventListener('click', (ev) => {
        if (ev.ctrlKey || ev.metaKey) return;
        const antes = Array.prototype.slice.call(t.childNodes);
        const ok = () => {
          t.textContent = fvI18n('ro_fv_copied', 'copied ✓');
          setTimeout(() => {
            t.textContent = '';
            antes.forEach((n) => t.appendChild(n));
          }, 700);
        };
        if (window.NSFT_Clipboard && window.NSFT_Clipboard.copy) window.NSFT_Clipboard.copy(b.value, { onSuccess: ok });
        else if (navigator.clipboard) navigator.clipboard.writeText(b.value).then(ok).catch(() => {});
      });
      val.appendChild(t);
      if (b.raw) val.appendChild(fvElQ('span', 'rawval', b.raw));
    }
    f.appendChild(val);

    const pin = fvEl('button', 'nsft-ro-fv-pinbtn' + (pinned ? ' is-pinned' : ''), pinned ? '★' : '☆');
    pin.type = 'button';
    pin.title = pinned
      ? fvI18n('ro_fv_pin_remove', 'Unpin')
      : fvI18n('ro_fv_pin_add', 'Pin at the top for this record type');
    pin.addEventListener('click', () => {
      if (!_fvPins) _fvPins = {};
      const list = (_fvPins[recordType] || []).slice();
      const at = list.indexOf(b.key);
      if (at === -1) list.push(b.key); else list.splice(at, 1);
      _fvPins[recordType] = list;
      fvSavePins();
      renderFriendly();
    });
    f.appendChild(pin);

    f.addEventListener('click', (ev) => {
      if (!ev.ctrlKey && !ev.metaKey) return;
      fvBuscarCampoEnPagina(b.key);
    });

    return f;
  }

  function fvRenderPins(recordType, pins, raw) {
    const box = fvEl('div', 'nsft-ro-fv-pins');
    const head = fvEl('div', 'nsft-ro-fv-pins-head');
    head.appendChild(fvEl('span', 't', '★ ' + fvI18n('ro_fv_pins_title', 'Pinned for $1', [recordType])));
    head.appendChild(fvEl('span', 'spacer'));
    const clear = fvEl('button', null, fvI18n('ro_fv_pins_clear', 'remove all'));
    clear.type = 'button';
    clear.addEventListener('click', () => {
      if (!_fvPins) _fvPins = {};
      _fvPins[recordType] = [];
      fvSavePins();
      renderFriendly();
    });
    head.appendChild(clear);
    box.appendChild(head);

    const grid = fvEl('div', 'nsft-ro-fv-pins-grid');
    pins.forEach((key) => {
      const hit = raw.filter((b) => b.type === 'field' && b.key === key)[0];
      const row = fvEl('div', 'nsft-ro-fv-pin');
      row.appendChild(fvElQ('span', 'k', fvHumanize(key)));
      row.appendChild(fvElQ('span', 'v', hit ? hit.value : fvI18n('ro_fv_pin_missing', 'not present on this record')));
      const x = fvEl('button', null, '✕');
      x.type = 'button';
      x.addEventListener('click', () => {
        if (!_fvPins) _fvPins = {};
        _fvPins[recordType] = (_fvPins[recordType] || []).filter((k) => k !== key);
        fvSavePins();
        renderFriendly();
      });
      row.appendChild(x);
      grid.appendChild(row);
    });
    box.appendChild(grid);
    return box;
  }

  function fvMoreBtn(b) {
    const more = fvEl('button', 'nsft-ro-fv-more',
      fvI18n('ro_fv_more', 'Show the $1 remaining rows', [String(b.count - FV_ROW_CAP)]));
    more.type = 'button';
    more.addEventListener('click', () => { _fvOpenTables[b.tableId] = true; renderFriendly(); });
    return more;
  }

  function fvTotalRow(b) {
    const tot = fvEl('div', 'nsft-ro-fv-total');
    tot.appendChild(fvEl('span', null, b.totalLabel));
    tot.appendChild(fvEl('strong', null, fvMoney(b.total)));
    return tot;
  }

  function fvRenderCards(b) {
    const capped = b.count > FV_ROW_CAP && !_fvOpenTables[b.tableId];
    const rows = capped ? b.rows.slice(0, FV_ROW_CAP) : b.rows;
    const box = fvEl('div', 'nsft-ro-fv-cards');

    rows.forEach((r) => {
      const card = fvEl('div', 'nsft-ro-fv-card');
      const head = fvEl('div', 'nsft-ro-fv-card-head');
      head.appendChild(fvEl('span', 'idx', String(r.idx)));
      head.appendChild(fvElQ('span', 'title', r.cells[0] || fvI18n('ro_fv_row_n', 'Item $1', [String(r.idx)])));
      card.appendChild(head);
      r.cells.slice(1).forEach((text, i) => {
        const row = fvEl('div', 'nsft-ro-fv-card-row');
        row.appendChild(fvElQ('span', 'k', b.cols[i + 1].label));
        row.appendChild(fvElQ('span', 'v', text));
        card.appendChild(row);
      });
      box.appendChild(card);
    });

    if (capped) box.appendChild(fvMoreBtn(b));
    if (b.total != null && b.total > 0) box.appendChild(fvTotalRow(b));
    return box;
  }

  function fvRenderTable(b) {
    if (_fvNarrow) return fvRenderCards(b);

    const capped = b.count > FV_ROW_CAP && !_fvOpenTables[b.tableId];
    const rows = capped ? b.rows.slice(0, FV_ROW_CAP) : b.rows;

    const t = fvEl('div', 'nsft-ro-fv-table');
    const head = fvEl('div', 'nsft-ro-fv-tr head');
    head.appendChild(fvEl('span', 'idx', '#'));
    b.cols.forEach((c) => head.appendChild(fvElQ('span', 'nsft-ro-fv-th', c.label)));
    t.appendChild(head);

    rows.forEach((r) => {
      const tr = fvEl('div', 'nsft-ro-fv-tr');
      tr.appendChild(fvEl('span', 'idx', String(r.idx)));
      r.cells.forEach((text) => tr.appendChild(fvElQ('span', 'nsft-ro-fv-td', text)));
      t.appendChild(tr);
    });

    if (capped) t.appendChild(fvMoreBtn(b));
    if (b.total != null && b.total > 0) t.appendChild(fvTotalRow(b));
    return t;
  }

  function fvRenderChips(b) {
    const box = fvEl('div', 'nsft-ro-fv-chips');
    b.chips.forEach((c) => box.appendChild(fvElQ('span', 'nsft-ro-fv-chip', c)));
    return box;
  }

  function fvBuscarCampoEnPagina(key) {
    const k = String(key || '');
    const candidatos = [
      '#' + CSS.escape(k + '_fs_lbl'),
      '#' + CSS.escape(k),
      '[name="' + CSS.escape(k) + '"]',
      '#' + CSS.escape('inpt_' + k)
    ];
    let target = null;
    for (let i = 0; i < candidatos.length && !target; i++) {
      try { target = document.querySelector(candidatos[i]); } catch (e) { }
    }
    if (!target) {
      showToast(fvI18n('ro_fv_field_notfound', 'The field is not visible on this form.'));
      return;
    }
    try { target.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (e) { target.scrollIntoView(); }
    const box = target.closest('td, div') || target;
    box.classList.add('nsft-ro-fv-flash');
    setTimeout(() => box.classList.remove('nsft-ro-fv-flash'), 1800);
  }

  const renderRecord = () => {
    if (_viewMode === 'friendly') { renderFriendly(); return; }

    const container = document.getElementById('nsft-record-object-container');
    const searchbox = document.getElementById('rec-obj-search');
    const clearBtn = document.getElementById('rec-obj-clear');

    if (clearBtn) clearBtn.style.display = searchbox.value ? 'block' : 'none';

    if (!STATE.nsftRecordObject && !STATE.loaded) {
      updateStatus(chrome.i18n.getMessage('ro_still_loading'));
      return;
    } else if (!STATE.nsftRecordObject && STATE.loaded) {
      updateStatus(chrome.i18n.getMessage('ro_load_error'), true);
      return;
    }

    const searchTerm = searchbox.value;

    const justRebuilt = rebuildIfDataChanged(container);

    applyVisibilityFilter(container, searchTerm, _hideEmptyFields);

    clearSearchHighlights(container);
    if (searchTerm) applySearchHighlight(container, searchTerm);

    applyDiffClasses(container, _diffPaths);

    if (justRebuilt && !searchTerm) {
      const topRows = container.querySelectorAll(':scope > .nsft-fmt-row > .nsft-fmt-children > .nsft-fmt-row');
      const expandKeys = ['bodyFields', 'lineFields'];
      topRows.forEach(row => {
        const keyEl = row.querySelector(':scope > .nsft-fmt-toggler-link > .nsft-fmt-key');
        if (!keyEl) return;
        const keyText = keyEl.textContent.replace(':', '').trim();
        if (expandKeys.includes(keyText) && !row.classList.contains('nsft-fmt-open')) {
          const tl = row.querySelector(':scope > .nsft-fmt-toggler-link');
          if (tl) tl.click();
        }
      });
    }
    if (searchTerm) autoExpandVisibleAncestors(container);
  };

  const rebuildIfDataChanged = (container) => {
    if (_lastRenderedSource === STATE.nsftRecordObject) return false;

    STATE.loadedRecord = null;
    const config = { ...DEFAULT_CONFIG, exposePath: true };
    const formatter = new NetSuiteFullToolsJSONFormatter(STATE.nsftRecordObject, 1, config);
    container.innerHTML = '';
    container.appendChild(formatter.render());
    _lastRenderedSource = STATE.nsftRecordObject;

    if (!container.dataset.nsftCtrlClickBound) {
      container.addEventListener('click', findNetSuiteField);
      container.dataset.nsftCtrlClickBound = '1';
    }
    return true;
  };

  const buildVisibleSet = (source, searchTerm, hideEmpty) => {
    const visible = new Set();
    const needle = searchTerm ? fvFold(searchTerm) : '';

    const walk = (obj, trail) => {
      if (obj === null || typeof obj !== 'object') return false;
      let anyChildVisible = false;
      for (const key in obj) {
        const value = obj[key];
        if (hideEmpty && isEmptyValue(value)) continue;

        const childTrail = trail.concat(key);
        const childPath = JSON.stringify(childTrail);
        const keyMatches = !needle || fvFold(key.toString()).includes(needle);

        if (value !== null && typeof value === 'object') {
          const descendantMatches = walk(value, childTrail);
          if (keyMatches || descendantMatches) {
            visible.add(childPath);
            anyChildVisible = true;
          }
        } else {
          const valueMatches = !needle || (value !== null && fvFold(String(value)).includes(needle));
          if (keyMatches || valueMatches) {
            visible.add(childPath);
            anyChildVisible = true;
          }
        }
      }
      return anyChildVisible;
    };

    walk(source, []);
    return visible;
  };

  const applyVisibilityFilter = (container, searchTerm, hideEmpty) => {
    if (!searchTerm && !hideEmpty) {
      container.querySelectorAll('.nsft-fmt-hidden').forEach(el => el.classList.remove('nsft-fmt-hidden'));
      return;
    }
    const visible = buildVisibleSet(STATE.nsftRecordObject, searchTerm, hideEmpty);
    container.querySelectorAll('.nsft-fmt-row[data-path]').forEach(row => {
      const path = row.getAttribute('data-path');
      row.classList.toggle('nsft-fmt-hidden', !visible.has(path));
    });
  };

  const autoExpandVisibleAncestors = (container) => {
    const visibleRows = container.querySelectorAll('.nsft-fmt-row[data-path]:not(.nsft-fmt-hidden)');
    visibleRows.forEach(row => {
      if (!row.querySelector(':scope > .nsft-fmt-children')) return;
      const hasVisibleChild = row.querySelector(':scope > .nsft-fmt-children > .nsft-fmt-row[data-path]:not(.nsft-fmt-hidden)');
      if (hasVisibleChild && !row.classList.contains('nsft-fmt-open')) {
        const tl = row.querySelector(':scope > .nsft-fmt-toggler-link');
        if (tl) tl.click();
      }
    });
  };

  const clearSearchHighlights = (container) => {
    container.querySelectorAll('.nsft-search-criteria').forEach(s => {
      const parent = s.parentNode;
      if (!parent) return;
      parent.replaceChild(document.createTextNode(s.textContent), s);
    });
    container.querySelectorAll('.nsft-fmt-key, .nsft-fmt-string').forEach(el => el.normalize());
  };

  const applySearchHighlight = (container, searchTerm) => {
    if (!searchTerm) return;
    const TS = fvTS();
    if (!TS) return;

    container.querySelectorAll('.nsft-fmt-row[data-path]:not(.nsft-fmt-hidden) .nsft-fmt-key, .nsft-fmt-row[data-path]:not(.nsft-fmt-hidden) .nsft-fmt-string').forEach(elem => {
      if (elem.firstElementChild) return;
      const text = elem.textContent;
      if (!TS.ranges(text, searchTerm).length) return;
      TS.mark(elem, text, searchTerm, 'nsft-search-criteria');
    });
  };

  const applyDiffClasses = (container, diffPaths) => {
    container.querySelectorAll('.nsft-fmt-diff-changed').forEach(el => el.classList.remove('nsft-fmt-diff-changed'));
    if (!diffPaths || diffPaths.size === 0) return;
    container.querySelectorAll('.nsft-fmt-row[data-path]').forEach(row => {
      const path = row.getAttribute('data-path');
      if (diffPaths.has(path)) row.classList.add('nsft-fmt-diff-changed');
    });
  };

  const isEmptyValue = (v) => {
    if (v === null || v === undefined) return true;
    if (typeof v === 'string') return v.trim() === '';
    if (Array.isArray(v)) return v.length === 0;
    if (typeof v === 'object') {
      for (const _k in v) return false;
      return true;
    }
    return false;
  };

  const filterEmpty = (obj) => {
    if (obj === null || typeof obj !== 'object') return obj;
    if (Array.isArray(obj)) {
      const out = [];
      for (let i = 0; i < obj.length; i++) {
        const v = obj[i];
        if (v !== null && typeof v === 'object') {
          const f = filterEmpty(v);
          if (!isEmptyValue(f)) out.push(f);
        } else if (!isEmptyValue(v)) {
          out.push(v);
        }
      }
      return out;
    }
    const out = {};
    for (const key in obj) {
      const v = obj[key];
      if (v !== null && typeof v === 'object') {
        const f = filterEmpty(v);
        if (!isEmptyValue(f)) out[key] = f;
      } else if (!isEmptyValue(v)) {
        out[key] = v;
      }
    }
    return out;
  };

  const filterRecord = (object, searchTerm) => {
    const stringifyCache = new WeakMap();
    return filterObject(object, fvFold(searchTerm), stringifyCache);
  };

  const filterObject = (object, searchTerm, stringifyCache) => {
    const filteredObject = {};
    for (const key in object) {
      const value = object[key];
      const keyMatches = fvFold(key.toString()).includes(searchTerm);

      if (value === null || typeof value !== 'object') {
        if (keyMatches || (value && fvFold(value.toString()).includes(searchTerm))) {
          filteredObject[key] = value;
        }
        continue;
      }

      if (keyMatches) {
        filteredObject[key] = value;
      } else {
        let serialized = stringifyCache.get(value);
        if (serialized === undefined) {
          serialized = fvFold(JSON.stringify(value));
          stringifyCache.set(value, serialized);
        }
        if (serialized.includes(searchTerm)) {
          const obj = filterObject(value, searchTerm, stringifyCache);
          if (Object.keys(obj).length) filteredObject[key] = obj;
        }
      }
    }
    return filteredObject;
  };

  const findNetSuiteField = (evt) => {
    if (!evt.ctrlKey && !evt.metaKey) return;
    const keyEl = evt.target.closest ? evt.target.closest('.nsft-fmt-key') : null;
    if (!keyEl) return;
    if (keyEl.parentElement && keyEl.parentElement.classList.contains('nsft-fmt-toggler-link')) return;

    const path = getObjectPath(keyEl);
    if (path[0] != 'bodyFields' && path[0] != 'lineFields') return;

    let key = keyEl.innerText.replace(':', '');
    if (path[0] == 'lineFields') key = path[1] + '_' + key;

    const DOM = window.NSFT_DOM;
    const fieldLabel = DOM
      ? DOM.q([
          `#${key}_fs_lbl`,
          `#${key}_lbl`,
          `td[data-nsps-id*='${key}']>div`,
          `[data-field-name='${key}']`
        ], { module: 'view_record_object', purpose: `field label [${key}]` })
      : document.querySelector(`#${key}_fs_lbl,#${key}_lbl,td[data-nsps-id*='${key}']>div`);

    if (!fieldLabel) {
      let msg = chrome.i18n.getMessage('ro_field_not_found');
      if (path[0] == 'lineFields') msg = chrome.i18n.getMessage('ro_sublist_field_not_found');
      showToast(msg);
      return;
    }

    const nav = window.NSFT_FieldNav;
    if (nav && nav.goToField) {
      nav.goToField(fieldLabel, { native: true });
    } else {
      fieldLabel.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });
    }
    const highlightTarget = fieldLabel.closest('.uir-field-wrapper') || fieldLabel.closest('td') || fieldLabel;
    highlightTarget.classList.add('nsft-ffi-highlight', 'nsft-ffi-hl-green');

    {
      setTimeout(() => {
        const modal = document.getElementById('nsft-rec-obj-modal');
        if (!modal || modal.style.display === 'none' || modal.dataset.state === 'minimised') return;

        const fieldRect = fieldLabel.getBoundingClientRect();
        const modalRect = modal.getBoundingClientRect();

        const intersect = !(fieldRect.right < modalRect.left ||
          fieldRect.left > modalRect.right ||
          fieldRect.bottom < modalRect.top ||
          fieldRect.top > modalRect.bottom);

        if (intersect) {
          const viewportWidth = window.innerWidth;
          const fieldCenterX = fieldRect.left + fieldRect.width / 2;
          const destino = fieldCenterX < viewportWidth / 2
            ? (viewportWidth - modalRect.width - 40)
            : 40;

          modal.style.left = modalRect.left + 'px';
          modal.style.right = 'auto';

          requestAnimationFrame(() => {
            modal.style.left = destino + 'px';
          });
        }
      }, 600);
    }

    setTimeout(() => highlightTarget.classList.remove('nsft-ffi-highlight', 'nsft-ffi-hl-green'), 4000);
  };

  const getObjectPath = (keyEl) => {
    const path = [];
    let searching = true;
    let parentEl = keyEl;

    while (searching) {
      if (!parentEl || parentEl.id == 'nsft-rec-obj-container') {
        searching = false;
        break;
      }
      const container = parentEl.closest('.nsft-fmt-children.nsft-fmt-object');
      if (!container) break;
      parentEl = container.parentElement;
      const keyElement = parentEl.querySelector('.nsft-fmt-toggler-link > .nsft-fmt-key');

      if (keyElement) {
        const key = keyElement.innerText.replace(':', '');
        path.push(key);
        if (key == 'lineFields' || key == 'bodyFields') searching = false;
      } else {
        searching = false;
      }
    }
    return path.reverse();
  };

  class NetSuiteFullToolsJSONFormatter {
    constructor(json, open = 1, config = DEFAULT_CONFIG, key, displayKey, path = [], arrayRange) {
      this.json = json;
      this.open = open;
      this.config = { ...DEFAULT_CONFIG, ...config };
      this.key = key || (key === '' ? '""' : undefined);
      this.displayKey = displayKey !== undefined ? displayKey : this.key;
      this.path = path;
      this.arrayRange = arrayRange;
      this._isOpen = null;
    }

    get isOpen() { return this._isOpen !== null ? this._isOpen : this.open > 0; }
    set isOpen(value) { this._isOpen = value; }

    get isDate() {
      return ((this.json instanceof Date) || ((this.type === 'string') &&
        (REGEX.DATE_STRING.test(this.json) || REGEX.JSON_DATE.test(this.json) || REGEX.PARTIAL_DATE.test(this.json))));
    }

    get isUrl() { return this.type === 'string' && (this.json.indexOf('http') === 0); }
    get isArray() { return Array.isArray(this.json); }
    get isLargeArray() { return (this.isArray && this.json.length > this.config.maxArrayItems); }
    get isArrayRange() { return this.isArray && this.arrayRange !== undefined && this.arrayRange.length == 2; }
    get isObject() { return !!this.json && typeof this.json == 'object'; }
    get isEmptyObject() { return !this.keys.length && !this.isArray; }
    get isEmpty() { return this.isEmptyObject || (this.keys && !this.keys.length && this.isArray); }
    get useToJSON() { return this.config.useToJSON && this.type === 'stringifiable'; }
    get hasKey() { return typeof this.key !== 'undefined'; }

    get constructorName() {
      if (this.json === undefined) return '';
      if (this.json === null || (typeof this.json === 'object' && !this.json.constructor)) return 'Object';
      const funcNameRegex = /function ([^(]*)/;
      const results = funcNameRegex.exec(this.json.constructor.toString());
      return (results && results.length > 1) ? results[1] : '';
    }

    get type() {
      if (this.config.useToJSON && this.json && this.json['toJSON']) return 'stringifiable';
      return this.json === null ? 'null' : typeof this.json;
    }

    get keys() {
      if (this.isObject) {
        let keys = Object.keys(this.json);
        if (this.isLargeArray) {
          const keysCount = Math.ceil(this.json.length / this.config.maxArrayItems);
          keys = [];
          for (let i = 0; i < keysCount; i++) {
            const min = i * this.config.maxArrayItems;
            const max = Math.min(this.json.length - 1, min + (this.config.maxArrayItems - 1));
            keys.push(`${min} … ${max}`);
          }
        }
        return (!this.isArray && this.config.sortPropertiesBy) ? keys.sort(this.config.sortPropertiesBy) : keys;
      }
      return [];
    }

    toggleOpen(e) {
      this.isOpen = !this.isOpen;
      const isUserAction = e && e.isTrusted;

      if (this.element) {
        if (this.isOpen) {
          this.showChildren(this.config.animateOpen);
          if (isUserAction) this.scrollIntoViewSmart();
        }
        this.element.classList.toggle('nsft-fmt-open');
      }
    }

    scrollIntoViewSmart() {
      setTimeout(() => {
        if (this.element && this.element.isConnected) {
          this.element.scrollIntoView({
            behavior: 'smooth',
            block: 'start'
          });
        }
      }, 100);
    }

    getInlinepreview() {
      if (this.isArray) {
        if (this.json.length > this.config.hoverPreviewArrayCount) return `Array[${this.json.length}]`;
        return `[${this.json.map(obj => this.getPreview(obj)).join(', ')}]`;
      }
      const keys = this.keys;
      const narrowKeys = keys.slice(0, this.config.hoverPreviewFieldCount);
      const kvs = narrowKeys.map(key => `${key}:${this.getPreview(this.json[key])}`);
      const ellipsis = keys.length >= this.config.hoverPreviewFieldCount ? '…' : '';
      return `{${kvs.join(', ')}${ellipsis}}`;
    }

    getPreview(object) {
      if (!!object && typeof object == 'object') {
        let name = '';
        if (object === undefined) name = '';
        else if (object === null || (typeof object === 'object' && !object.constructor)) name = 'Object';
        else {
          const match = /function ([^(]*)/.exec(object.constructor.toString());
          name = (match && match.length > 1) ? match[1] : '';
        }
        if (Array.isArray(object)) name += '[' + object.length + ']';
        return name;
      }
      return this.getValuePreview(object, object);
    }

    getValuePreview(object, value) {
      const type = object === null ? 'null' : typeof object;
      if (type === 'null' || type === 'undefined') return type;

      if (type === 'string') {
        const valStr = String(value);
        const trimmed = valStr.trim();
        if (trimmed.length > 0 && !isNaN(trimmed) && !isNaN(parseFloat(trimmed))) {
          return trimmed;
        }
        return '"' + valStr.replace(/"/g, '\\"') + '"';
      }

      if (type === 'function') return (object.toString().replace(/[\r\n]/g, '').replace(/\{.*\}/, '') + '{…}');
      return value;
    }

    createElement(type, className, content) {
      const el = document.createElement(type);
      if (className) {
        el.classList.add('nsft-fmt-' + className);
        const highlightMap = {
          'key': 'hljs-attr',
          'string': 'hljs-string',
          'number': 'hljs-number',
          'boolean': 'hljs-literal',
          'null': 'hljs-literal',
          'constructor-name': 'hljs-title'
        };
        if (highlightMap[className]) el.classList.add(highlightMap[className]);
      }
      if (content !== undefined) {
        if (content instanceof Node) el.appendChild(content);
        else el.appendChild(document.createTextNode(String(content)));
      }
      return el;
    }

    render() {
      this.element = this.createElement('div', 'row');
      const togglerLink = this.isObject ? this.createElement('a', 'toggler-link') : this.createElement('span');

      if (this.isObject && !this.useToJSON) togglerLink.appendChild(this.createElement('span', 'toggler'));

      if (this.isArrayRange) togglerLink.appendChild(this.createElement('span', 'range', `[${this.displayKey}]`));
      else if (this.hasKey) {
        togglerLink.appendChild(this.createElement('span', 'key', `${this.displayKey}:`));
        if (this.config.exposePath) this.element.dataset.path = JSON.stringify(this.path);
      }

      if (this.isObject && !this.useToJSON) {
        const value = this.createElement('span', 'value');
        const objectWrapperSpan = this.createElement('span');
        if (!this.isArrayRange) objectWrapperSpan.appendChild(this.createElement('span', 'constructor-name', this.constructorName));
        if (this.isArray && !this.isArrayRange) {
          const arrayWrapperSpan = this.createElement('span');
          arrayWrapperSpan.append(
            this.createElement('span', 'bracket', '['),
            this.createElement('span', 'number', this.json.length),
            this.createElement('span', 'bracket', ']')
          );
          objectWrapperSpan.appendChild(arrayWrapperSpan);
        }
        value.appendChild(objectWrapperSpan);
        togglerLink.appendChild(value);
      } else {
        const value = this.isUrl ? this.createElement('a') : this.createElement('span');

        let valueType = this.type;
        if (valueType === 'string') {
          const trimmed = String(this.json).trim();
          if (trimmed.length > 0 && !isNaN(trimmed) && !isNaN(parseFloat(trimmed))) {
            valueType = 'number';
          }
        }
        value.classList.add('nsft-fmt-' + valueType);
        if (this.isDate) value.classList.add('nsft-fmt-date');
        if (this.isUrl) {
          value.classList.add('nsft-fmt-url');
          value.setAttribute('href', this.json);
        }
        if (this.type === 'string' && this.json.length > 350) {
          const rawStr = this.json;
          const textPart = '"' + rawStr.substring(0, 350).replace(/"/g, '\\"');
          value.appendChild(document.createTextNode(textPart));

          const dots = document.createElement('span');
          dots.className = 'nsft-show-more-btn';
          const remaining = rawStr.length - 350;
          dots.innerText = '... (' + remaining + ' ' + (chrome.i18n.getMessage('ro_more_chars')) + ')';
          dots.title = chrome.i18n.getMessage('ro_show_full_text');

          dots.onclick = (e) => {
            e.stopPropagation();
            value.innerText = '"' + rawStr.replace(/"/g, '\\"') + '"';
          };

          value.appendChild(dots);
          value.appendChild(document.createTextNode('"'));
        } else {
          const valuePreview = this.getValuePreview(this.type, this.json, this.useToJSON ? this.json.toJSON() : this.json);
          value.appendChild(document.createTextNode(valuePreview));
        }
        togglerLink.appendChild(value);
      }

      if (this.isObject && this.config.hoverPreviewEnabled) {
        const preview = this.createElement('span', 'preview-text');
        preview.appendChild(document.createTextNode(this.getInlinepreview()));
        togglerLink.appendChild(preview);
      }

      const children = this.createElement('div', 'children');
      if (this.isObject) children.classList.add('nsft-fmt-object');
      if (this.isArray) children.classList.add('nsft-fmt-array');
      if (this.isEmpty) children.classList.add('nsft-fmt-empty');
      if (this.config && this.config.theme) this.element.classList.add('nsft-fmt-' + this.config.theme);
      if (this.isOpen) this.element.classList.add('nsft-fmt-open');

      this.element.appendChild(togglerLink);
      this.element.appendChild(children);

      if (this.isObject && this.isOpen) this.appendChildren();
      if (this.isObject && !this.useToJSON) togglerLink.addEventListener('click', this.toggleOpen.bind(this));

      return this.element;
    }

    appendChildren(animated = false) {
      const children = this.element.querySelector(`div.nsft-fmt-children`);
      if (!children || this.isEmpty) return;

      const append = (key, index) => {
        const range = (this.isLargeArray ?
          [index * this.config.maxArrayItems, Math.min(this.json.length - 1, (index * this.config.maxArrayItems) + (this.config.maxArrayItems - 1))] :
          undefined);
        const displayKey = (this.isArrayRange ? (this.arrayRange[0] + index).toString() : key);
        const json = (range ? this.json.slice(range[0], range[1] + 1) : this.json[key]);
        const formatter = new NetSuiteFullToolsJSONFormatter(
          json, this.open - 1, this.config, key, displayKey,
          (range ? this.path : this.path.concat(displayKey)), range
        );
        children.appendChild(formatter.render());
      };

      if (animated) {
        let index = 0;
        const addAChild = () => {
          append(this.keys[index], index);
          index += 1;
          if (index < this.keys.length) {
            if (index > MAX_ANIMATED_TOGGLE_ITEMS) addAChild();
            else requestAnimationFrame(addAChild);
          }
        };
        requestAnimationFrame(addAChild);
      } else {
        this.keys.forEach((key, index) => append(key, index));
      }
    }

    showChildren(animated = false) {
      const children = this.element.querySelector(`div.nsft-fmt-children`);
      if (!children || !children.children.length) {
        this.appendChildren(animated);
      }
    }
  }

})();
