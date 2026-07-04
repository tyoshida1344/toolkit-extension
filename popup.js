/**
 * popup.js — タブ管理・モジュール登録の共通フレームワーク
 *
 * タブの定義は TAB_MANIFEST に一元管理し、使用時に動的ロードする。
 * 各モジュールは Toolkit.registerTab() で html / init を提供する。
 */
const Toolkit = (() => {
  // ── UI ユーティリティ（utils.js から取得） ──
  const { $, qsa, escapeHtml, showToast, svgIco, ICONS, iconButton, copyButton, readText, clampInput } = _TkUtils;

  // ── タブマニフェスト・登録 ──

  /**
   * タブのメタ情報（表示順 = 配列順）。タブの追加・変更はここだけで行う。
   * id / icon / label / scripts / styles はこの定義が唯一の情報源。
   * 各モジュールの registerTab は html / init だけを提供する（id は scripts から自動解決）。
   */
  const TAB_MANIFEST = [
    { id: 'strgen', icon: '✏️', label: '文字列生成', scripts: ['modules/strgen.js'] },
    { id: 'epoch', icon: '⏱️', label: 'エポック変換', scripts: ['modules/epoch.js'], styles: ['styles/epoch.css'] },
    { id: 'color', icon: '🎨', label: 'カラー変換', scripts: ['modules/color.js'], styles: ['styles/color.css'] },
    { id: 'translate', icon: '🌐', label: '翻訳', scripts: ['modules/translate.js'], styles: ['styles/translate.css'] },
    { id: 'regex', icon: '🔤', label: '正規表現', scripts: ['modules/regex.js'], styles: ['styles/regex.css'] },
    { id: 'regexgen', icon: '*️⃣', label: '正規表現生成', scripts: ['modules/regexgen.js'], styles: ['styles/regexgen.css'] },
    { id: 'sitesearch', icon: '🔎', label: 'サイト内検索', scripts: [
      'modules/sitesearch/engine.js',
      'modules/sitesearch/bar.js',
      'modules/sitesearch/results.js',
      'modules/sitesearch/index.js',
    ], styles: ['styles/sitesearch.css'] },
    { id: 'calc', icon: '🔢', label: '電卓', scripts: ['modules/calc.js'], styles: ['styles/calc.css'] },
    { id: 'memo', icon: '📝', label: 'メモ帳', scripts: ['modules/memo.js'], styles: ['styles/memo.css'], storageKey: 'tm_toolkit_memo' },
  ];
  const TAB_MANIFEST_MAP = new Map(TAB_MANIFEST.map(entry => [entry.id, entry]));
  const SCRIPT_TO_TAB_ID = new Map(TAB_MANIFEST.flatMap(e => e.scripts.map(s => [s, e.id])));

  /** 設定専用モジュール（タブを持たない。設定を初めて開くときにロード） */
  const SETTING_SCRIPTS = ['modules/appsettings.js', 'modules/storage.js'];
  const SETTING_STYLES = ['styles/appsettings.css', 'styles/storage.css'];

  const tabs = [];
  const settings = []; // 設定画面（ヘッダー⚙️のオーバーレイ）に並べるセクション
  let tabConfig = { order: [], hidden: [] }; // タブの表示順と非表示ID（設定で変更）
  let initialized = false;
  const loaded = {};
  let loading = 0; // スクリプトロード中は registerTab/registerSetting の自動構築を抑制

  /**
   * タブを登録する（モジュールから呼ばれる）。
   * id は document.currentScript から自動解決するため、モジュール側で指定する必要はない。
   */
  function registerTab({ html, init }) {
    const src = document.currentScript && document.currentScript.getAttribute('src');
    const id = src && SCRIPT_TO_TAB_ID.get(src);
    if (!id) return;
    tabs.push({ id, html, init });
    if (initialized && loading === 0) buildUI();
  }

  // ── 設定セクション登録 ──

  function registerSetting({ id, title = '', html, init }) {
    settings.push({ id, title, html, init });
    if (initialized && loading === 0) buildSettings();
  }

  // ── キーボードショートカットガード ──

  /**
   * タブ別ショートカット共通ガード。指定タブのセクション(#sec-<tabId>)がアクティブで、
   * イベント対象が INPUT/TEXTAREA/contentEditable でなく、モーダル(.tm-modal-overlay)が
   * 開いていないときだけ、対応するハンドラ（keydown / paste）へイベントを渡す。
   */
  function onTabShortcut(tabId, { keydown, paste } = {}) {
    const passes = (e) => {
      const sec = document.getElementById('sec-' + tabId);
      if (!sec || !sec.classList.contains('active')) return false;
      if (document.querySelector('.tm-modal-overlay:not([hidden])')) return false;
      const tag = (e.target.tagName || '').toUpperCase();
      if (tag === 'INPUT' || tag === 'TEXTAREA' || e.target.isContentEditable) return false;
      return true;
    };
    if (keydown) document.addEventListener('keydown', e => { if (passes(e)) keydown(e); });
    if (paste) document.addEventListener('paste', e => { if (passes(e)) paste(e); });
  }

  // ── クリップボードコピー ──

  function copyText(text) {
    text = (text || '').trim();
    if (!text) { showToast('⚠ コピーする内容がありません'); return Promise.resolve(false); }
    return navigator.clipboard.writeText(text)
      .then(() => { showToast(); return true; })
      .catch(() => { showToast('⚠ コピーに失敗しました'); return false; });
  }

  // ── モーダル管理 ──

  const _modalStack = [];
  const _FOCUSABLE = 'a[href],button:not(:disabled),input:not(:disabled),' +
    'textarea:not(:disabled),select:not(:disabled),[tabindex]:not([tabindex="-1"])';

  function modal(overlayEl, { onOpen, onClose } = {}) {
    let returnFocus = null;

    function focusable() {
      return Array.from(overlayEl.querySelectorAll(_FOCUSABLE))
        .filter(el => !el.closest('[hidden]'));
    }

    function open() {
      if (!overlayEl.hidden) return;
      returnFocus = document.activeElement;
      overlayEl.hidden = false;
      _modalStack.push(inst);
      const f = focusable();
      if (f.length) f[0].focus();
      if (onOpen) onOpen();
    }

    function close() {
      if (overlayEl.hidden) return;
      overlayEl.hidden = true;
      const idx = _modalStack.indexOf(inst);
      if (idx !== -1) _modalStack.splice(idx, 1);
      if (onClose) onClose();
      if (returnFocus) { returnFocus.focus(); returnFocus = null; }
    }

    function isOpen() { return !overlayEl.hidden; }

    overlayEl.addEventListener('click', e => {
      if (e.target !== overlayEl) return;
      e.stopPropagation();
      close();
    });

    overlayEl.addEventListener('keydown', e => {
      if (e.key !== 'Tab' || _modalStack[_modalStack.length - 1] !== inst) return;
      const f = focusable();
      if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    });

    const inst = { open, close, isOpen };
    return inst;
  }

  // ── 状態永続化エンジン ──

  const _store = (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) || null;
  const STATE_PREFIX = 'tm_state_';
  const _saveTimers = {};

  // アプリ自身の設定キー。「入力状態の保持」をオフにしても、これらは保存・復元を続ける
  // （タブ構成・最後のタブ・保持設定自体はツールの入力状態ではなくアプリ設定のため）。
  const CORE_STATE_KEYS = new Set(['activeTab', 'tabConfig', 'persistEnabled', 'persistByTool']);
  let persistGlobal = true;  // 入力状態の保持（全体マスター）
  const persistByTool = {};  // ツールごとの保持（toolId → bool。未設定は有効扱い）

  function persistAllowed(key) {
    if (CORE_STATE_KEYS.has(key)) return true;
    return persistGlobal && persistByTool[key] !== false;
  }

  function saveState(key, value, delay = 200) {
    if (!_store || !persistAllowed(key)) return;
    clearTimeout(_saveTimers[key]);
    _saveTimers[key] = setTimeout(() => {
      _store.set({ [STATE_PREFIX + key]: value });
    }, delay);
  }

  function loadState(key, cb) {
    if (!_store || !persistAllowed(key)) { cb(undefined); return; }
    _store.get(STATE_PREFIX + key, data => cb(data[STATE_PREFIX + key]));
  }

  function bindState(tabId, fieldMap, opts = {}) {
    const entries = Object.entries(fieldMap).map(([elId, def]) => {
      const [prop, key] = Array.isArray(def) ? def : [def, elId];
      return { elId, prop, key };
    });

    function save() {
      const state = {};
      for (const { elId, prop, key } of entries) {
        const el = $(elId);
        if (el) state[key] = el[prop];
      }
      if (opts.extra) Object.assign(state, opts.extra());
      saveState(tabId, state);
    }

    for (const { elId, prop } of entries) {
      const el = $(elId);
      if (!el) continue;
      if (prop === 'checked') {
        el.addEventListener('change', save);
      } else if (prop === 'value') {
        el.addEventListener('input', save);
        el.addEventListener('change', save);
      }
    }

    loadState(tabId, s => {
      if (s) {
        for (const { elId, prop, key } of entries) {
          if (s[key] == null) continue;
          const el = $(elId);
          if (el) el[prop] = s[key];
        }
      }
      if (opts.onRestore) opts.onRestore(s);
    });

    return save;
  }

  function isPersistEnabled(toolId) {
    if (!toolId) return persistGlobal;
    return persistGlobal && persistByTool[toolId] !== false;
  }

  function getPersistConfig() {
    return { global: persistGlobal, byTool: Object.assign({}, persistByTool) };
  }

  function setPersistEnabled(on, toolId) {
    if (toolId) {
      persistByTool[toolId] = !!on;
      if (_store) _store.set({ [STATE_PREFIX + 'persistByTool']: persistByTool });
    } else {
      persistGlobal = !!on;
      if (_store) _store.set({ [STATE_PREFIX + 'persistEnabled']: persistGlobal });
    }
  }

  // ── タブ切替・タブ設定管理 ──

  function activateTab(id, persist = true) {
    const entry = TAB_MANIFEST_MAP.get(id);
    const sidebar = document.getElementById('tm-sidebar');
    const content = document.getElementById('tm-content');
    const empty = document.getElementById('tm-tabs-empty');
    if (!sidebar || !content) return;
    if (!entry) {
      sidebar.querySelector('.tm-tab.active')?.classList.remove('active');
      content.querySelector('.tm-section.active')?.classList.remove('active');
      document.getElementById('tm-header-title').textContent = '便利ツール';
      if (empty) empty.hidden = false;
      return;
    }
    sidebar.querySelector('.tm-tab.active')?.classList.remove('active');
    sidebar.querySelector(`[data-tab="${id}"]`)?.classList.add('active');
    content.querySelector('.tm-section.active')?.classList.remove('active');
    document.getElementById('sec-' + id)?.classList.add('active');
    document.getElementById('tm-header-title').textContent = entry.icon + ' ' + entry.label;
    if (empty) empty.hidden = true;
    if (persist) saveState('activeTab', id);
  }

  function getTabs() {
    return TAB_MANIFEST.map(entry => ({
      id: entry.id, icon: entry.icon, label: entry.label,
      storageKey: entry.storageKey || (STATE_PREFIX + entry.id),
    }));
  }

  function getTabConfig() {
    const ids = TAB_MANIFEST.map(entry => entry.id);
    const order = (tabConfig.order || []).filter(id => ids.includes(id));
    ids.forEach(id => { if (!order.includes(id)) order.push(id); });
    const hidden = (tabConfig.hidden || []).filter(id => ids.includes(id));
    return { order, hidden };
  }

  function applyTabConfig() {
    const sidebar = document.getElementById('tm-sidebar');
    const content = document.getElementById('tm-content');
    if (!sidebar || !content) return;
    const cfg = getTabConfig();
    cfg.order.forEach(id => {
      const btn = sidebar.querySelector(`.tm-tab[data-tab="${id}"]`);
      const sec = document.getElementById('sec-' + id);
      if (btn) { sidebar.appendChild(btn); btn.hidden = cfg.hidden.includes(id); }
      if (sec) content.appendChild(sec);
    });
    const empty = document.getElementById('tm-tabs-empty');
    if (empty) content.appendChild(empty);
    const visible = cfg.order.filter(id => !cfg.hidden.includes(id));
    const activeBtn = sidebar.querySelector('.tm-tab.active');
    const activeId = activeBtn ? activeBtn.dataset.tab : null;
    if (!activeId || cfg.hidden.includes(activeId)) {
      const next = visible.length ? visible[0] : null;
      activateTab(next, false);
      if (next) lazyLoad(next);
    }
  }

  function setTabConfig(cfg) {
    tabConfig = { order: (cfg && cfg.order) || [], hidden: (cfg && cfg.hidden) || [] };
    applyTabConfig();
    saveState('tabConfig', tabConfig);
    // タブ構成に依存する設定セクション（保持・ストレージ）へ即時再描画を促す。
    // ストレージの保存（saveState）は非同期＆デバウンスなので、表示同期はこのイベントで揃える。
    document.dispatchEvent(new CustomEvent('tm-tabconfig-change'));
  }

  // ── DOM 構築・遅延読み込み ──

  function buildUI() {
    const sidebar = document.getElementById('tm-sidebar');
    const content = document.getElementById('tm-content');
    sidebar.innerHTML = '';
    content.innerHTML = '';

    TAB_MANIFEST.forEach((entry, i) => {
      const btn = document.createElement('button');
      btn.className = 'tm-tab' + (i === 0 ? ' active' : '');
      btn.dataset.tab = entry.id;
      btn.dataset.tip = entry.label;
      btn.textContent = entry.icon;
      sidebar.appendChild(btn);

      const sec = document.createElement('div');
      sec.className = 'tm-section' + (i === 0 ? ' active' : '');
      sec.id = 'sec-' + entry.id;
      content.appendChild(sec);
    });

    const empty = document.createElement('div');
    empty.className = 'tm-tabs-empty';
    empty.id = 'tm-tabs-empty';
    empty.hidden = true;
    empty.textContent = '表示するツールがありません。右上の ⚙️ 設定から表示するツールを選んでください。';
    content.appendChild(empty);

    if (TAB_MANIFEST.length > 0) {
      document.getElementById('tm-header-title').textContent =
        TAB_MANIFEST[0].icon + ' ' + TAB_MANIFEST[0].label;
    }

    sidebar.addEventListener('click', e => {
      const btn = e.target.closest('.tm-tab');
      if (!btn) return;
      const id = btn.dataset.tab;
      activateTab(id);
      lazyLoad(id);
    });

    applyTabConfig();

    loadState('activeTab', id => {
      const cfg = getTabConfig();
      if (id && TAB_MANIFEST_MAP.has(id) && !cfg.hidden.includes(id)) {
        activateTab(id, false);
        lazyLoad(id);
      } else {
        const visible = cfg.order.filter(i => !cfg.hidden.includes(i));
        lazyLoad(visible[0] || TAB_MANIFEST[0].id);
      }
    });

    buildSettings();

    document.documentElement.style.display = 'block';
  }

  // ── 設定オーバーレイ ──

  let settingsModal = null;
  function buildSettings() {
    let overlay = document.getElementById('tm-settings-overlay');
    if (overlay) overlay.remove();

    overlay = document.createElement('div');
    overlay.className = 'tm-modal-overlay';
    overlay.id = 'tm-settings-overlay';
    overlay.hidden = true;

    const multi = settings.length > 1;
    const navHtml = multi
      ? '<div class="tm-settings-nav" id="tm-settings-nav">' +
          settings.map((s, i) =>
            `<button type="button" class="tm-settings-nav-item${i === 0 ? ' active' : ''}" data-target="${s.id}">${s.title || s.id}</button>`
          ).join('') +
        '</div>'
      : '';
    const sectionsHtml = settings.map((s, i) =>
      `<div class="tm-settings-section${i === 0 ? ' active' : ''}" id="set-${s.id}">` +
        (s.title ? `<h4 class="tm-settings-title">${s.title}</h4>` : '') + s.html +
      '</div>'
    ).join('');

    overlay.innerHTML =
      '<div class="tm-modal tm-settings-modal">' +
        '<div class="tm-modal-header"><span>⚙️ 設定</span>' +
        iconButton('✕', { id: 'tm-settings-close', title: '閉じる' }) +
        '</div>' +
        '<div class="tm-settings-layout">' +
          navHtml +
          '<div class="tm-modal-body tm-settings-body" id="tm-settings-body">' + sectionsHtml + '</div>' +
        '</div>' +
      '</div>';
    document.body.appendChild(overlay);

    const nav = overlay.querySelector('#tm-settings-nav');
    if (nav) {
      nav.addEventListener('click', e => {
        const btn = e.target.closest('.tm-settings-nav-item');
        if (!btn) return;
        const id = btn.dataset.target;
        nav.querySelectorAll('.tm-settings-nav-item').forEach(b => b.classList.toggle('active', b === btn));
        overlay.querySelectorAll('.tm-settings-section').forEach(sec =>
          sec.classList.toggle('active', sec.id === 'set-' + id));
      });
    }

    settingsModal = modal(overlay, {
      onOpen() { document.dispatchEvent(new CustomEvent('tm-settings-open')); },
    });

    const openBtn = document.getElementById('tm-settings-open');
    if (openBtn) openBtn.onclick = openSettings;
    overlay.querySelector('#tm-settings-close').addEventListener('click', () => settingsModal.close());

    settings.forEach(s => { if (s.init) s.init(); });
  }

  let settingsLoaded = false;
  function openSettings() {
    if (!settingsLoaded) {
      settingsLoaded = true;
      loadStyles(SETTING_STYLES);
      loading++;
      loadScripts(SETTING_SCRIPTS, () => {
        loading--;
        buildSettings();
        if (settingsModal) settingsModal.open();
      });
    } else {
      if (settingsModal) settingsModal.open();
    }
  }

  function closeSettings() {
    if (settingsModal) settingsModal.close();
  }

  // ── コピーボタンのイベント委譲 ──

  document.addEventListener('click', (e) => {
    const btn = e.target.closest('.tm-copy-btn');
    if (!btn) return;
    const el = btn.dataset.copyTarget ? document.getElementById(btn.dataset.copyTarget) : null;
    const text = el ? readText(el) : (btn.dataset.copyText || '');
    copyText(text).then(ok => {
      if (!ok) return;
      btn.classList.add('copied');
      setTimeout(() => btn.classList.remove('copied'), 1000);
    });
  });

  // ── コア設定プリロード ──

  function preloadCoreConfig(done) {
    if (!_store) { done(); return; }
    _store.get(
      [STATE_PREFIX + 'persistEnabled', STATE_PREFIX + 'persistByTool', STATE_PREFIX + 'tabConfig'],
      data => {
        const p = data[STATE_PREFIX + 'persistEnabled'];
        if (typeof p === 'boolean') persistGlobal = p;
        const bt = data[STATE_PREFIX + 'persistByTool'];
        if (bt && typeof bt === 'object') Object.assign(persistByTool, bt);
        const c = data[STATE_PREFIX + 'tabConfig'];
        if (c && Array.isArray(c.order)) tabConfig = { order: c.order, hidden: c.hidden || [] };
        done();
      });
  }

  // ── スクリプト・スタイルローダー ──

  function loadStyles(hrefs) {
    (hrefs || []).forEach(href => {
      const l = document.createElement('link');
      l.rel = 'stylesheet';
      l.href = href;
      document.head.appendChild(l);
    });
  }

  function loadScripts(srcs, done) {
    let i = 0;
    function next() {
      if (i >= srcs.length) { done(); return; }
      const s = document.createElement('script');
      s.src = srcs[i++];
      s.onload = next;
      s.onerror = next;
      document.head.appendChild(s);
    }
    next();
  }

  function lazyLoad(id) {
    if (loaded[id]) return;
    loaded[id] = true;
    const entry = TAB_MANIFEST_MAP.get(id);
    if (!entry) return;
    loadStyles(entry.styles);
    loading++;
    loadScripts(entry.scripts, () => {
      loading--;
      const tab = tabs.find(t => t.id === id);
      if (!tab) return;
      const sec = document.getElementById('sec-' + id);
      if (sec) {
        sec.innerHTML = tab.html;
        if (tab.init) tab.init();
      }
    });
  }

  // ── 初期化 ──

  document.addEventListener('DOMContentLoaded', () => {
    preloadCoreConfig(() => {
      initialized = true;
      buildUI();
    });
  });

  return {
    registerTab, registerSetting, copyText, copyButton, iconButton, showToast, ICONS,
    escapeHtml, $, qsa, clampInput, onTabShortcut, modal,
    saveState, loadState, bindState, isPersistEnabled, getPersistConfig, setPersistEnabled,
    getTabs, getTabConfig, setTabConfig,
  };
})();
