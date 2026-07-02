/**
 * popup.js — タブ管理・モジュール登録の共通フレームワーク
 *
 * 各モジュールは Toolkit.registerTab() を呼ぶだけで自動登録される。
 */
const Toolkit = (() => {
  /**
   * タブのメタ情報（表示順 = 配列順）。タブの追加・変更はここだけで行う。
   * id / icon / label / scripts / styles はこの定義が唯一の情報源。
   * 各モジュールの registerTab は html / init だけを提供する（id は scripts から自動解決）。
   */
  const TAB_MANIFEST = [
    { id: 'strgen', icon: '✏️', label: '文字列生成', scripts: ['modules/strgen.js'], styles: ['styles/strgen.css'] },
    { id: 'epoch', icon: '⏱️', label: 'エポック変換', scripts: ['modules/epoch.js'], styles: ['styles/epoch.css'] },
    { id: 'color', icon: '🎨', label: 'カラー変換', scripts: ['modules/color.js'], styles: ['styles/color.css'] },
    { id: 'translate', icon: '🌐', label: '翻訳', scripts: ['modules/translate.js'], styles: ['styles/translate.css'] },
    { id: 'regex', icon: '🔤', label: '正規表現', scripts: ['modules/regex.js'], styles: ['styles/regex.css'] },
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
  // スクリプトパス → タブ id の逆引き（registerTab で document.currentScript から id を自動解決する）
  const SCRIPT_TO_TAB_ID = new Map();
  TAB_MANIFEST.forEach(entry => entry.scripts.forEach(src => SCRIPT_TO_TAB_ID.set(src, entry.id)));

  /** 設定専用モジュール（タブを持たない。設定を初めて開くときにロード） */
  const SETTING_SCRIPTS = ['modules/appsettings.js', 'modules/storage.js'];
  const SETTING_STYLES = ['styles/modal.css', 'styles/appsettings.css', 'styles/storage.css'];

  const tabs = [];
  const settings = []; // 設定画面（ヘッダー⚙️のオーバーレイ）に並べるセクション。タブではない。
  let tabConfig = { order: [], hidden: [] }; // タブの表示順と非表示ID（設定で変更）
  let initialized = false;
  const loaded = {};  // id → true（ロード済みフラグ）
  let loading = 0; // スクリプトロード中は registerTab/registerSetting の自動構築を抑制（カウンタで並行ロード対応）

  /**
   * タブを登録する（モジュールから呼ばれる）。
   * id は document.currentScript から自動解決するため、モジュール側で指定する必要はない。
   * @param {object} opts
   * @param {string} opts.html          - タブ内のHTML文字列
   * @param {function} opts.init        - DOM構築後に呼ばれる初期化関数
   */
  function registerTab({ html, init }) {
    const src = document.currentScript && document.currentScript.getAttribute('src');
    const id = src && SCRIPT_TO_TAB_ID.get(src);
    if (!id) return;
    tabs.push({ id, html, init });
    if (initialized && loading === 0) buildUI();
  }

  /**
   * 設定画面のセクションを登録する（タブではなく、ヘッダーの⚙️から開くオーバーレイに表示）。
   * registerTab と対の自己登録 API。機能ロジックはモジュール側に置く。
   * @param {object} opts
   * @param {string} opts.id        - セクションの一意ID
   * @param {string} [opts.title]   - セクション見出し
   * @param {string} opts.html      - セクション内のHTML
   * @param {function} [opts.init]  - DOM構築後に呼ばれる初期化関数
   */
  function registerSetting({ id, title = '', html, init }) {
    settings.push({ id, title, html, init });
    if (initialized && loading === 0) buildSettings();
  }

  /** 共通ヘルパー: コピー完了トースト */
  let toastTimer = null;
  function showToast(message = '📋 コピーしました') {
    let toast = document.getElementById('tm-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'tm-toast';
      toast.className = 'tm-toast';
      document.body.appendChild(toast);
    }
    toast.textContent = message;
    // reflow を挟んでアニメーションを確実に再生
    toast.classList.remove('show');
    void toast.offsetWidth;
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), 1400);
  }

  /** 共通アイコン (Feather風 SVG, 16x16 を想定) */
  const svgIco = (extraClass, inner, sw = 2) =>
    `<svg class="tm-ico${extraClass ? ' ' + extraClass : ''}" viewBox="0 0 24 24" fill="none" stroke="currentColor"` +
    ` stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;

  const ICONS = {
    copy: svgIco('tm-copy-ico tm-copy-ico-default',
      '<rect x="9" y="9" width="13" height="13" rx="2"></rect>' +
      '<path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>'),
    check: svgIco('tm-copy-ico tm-copy-ico-done',
      '<polyline points="20 6 9 17 4 12"></polyline>', 2.5),
    refresh: svgIco('',
      '<polyline points="23 4 23 10 17 10"></polyline>' +
      '<polyline points="1 20 1 14 7 14"></polyline>' +
      '<path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>'),
  };

  /**
   * 汎用アイコンボタンのHTMLを返す（コピー以外のアイコン操作も統一）。
   * @param {string} icon - SVG文字列 / 絵文字
   * @param {object} [opts]
   * @param {string} [opts.id]    - ボタンのid（init側でハンドラを付ける用）
   * @param {string} [opts.title] - ツールチップ / アクセシビリティ文言
   * @param {string} [opts.cls]   - 追加クラス
   */
  function iconButton(icon, { id = '', title = '', cls = '' } = {}) {
    return `<button type="button" class="tm-icon-btn${cls ? ' ' + cls : ''}"` +
      `${id ? ` id="${id}"` : ''}${title ? ` title="${title}" aria-label="${title}"` : ''}>${icon}</button>`;
  }

  /**
   * 統一コピーボタンのHTMLを返す。クリック処理はイベント委譲で共通化。
   * @param {string} targetId - コピー対象要素のID (textContent / value を読む)
   * @param {object} [opts]
   * @param {string} [opts.title] - ツールチップ / アクセシビリティ文言
   */
  function copyButton(targetId, { title = 'コピー' } = {}) {
    return `<button type="button" class="tm-icon-btn tm-copy-btn" data-copy-target="${targetId}" ` +
      `title="${title}" aria-label="${title}">${ICONS.copy}${ICONS.check}</button>`;
  }

  /** 要素からコピー対象テキストを取得 */
  function readText(el) {
    if (!el) return '';
    return (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') ? el.value : el.textContent;
  }

  /** 共通ヘルパー: HTML エスケープ（& < > のみ。表示・ハイライトの危険文字を無害化） */
  function escapeHtml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  /** 共通ヘルパー: DOM 取得ショートハンド（id 取得 / セレクタ一括取得は配列で返す） */
  const $ = id => document.getElementById(id);
  const qsa = (sel, root = document) => Array.from((root || document).querySelectorAll(sel));

  /**
   * タブ別ショートカット共通ガード。指定タブのセクション(#sec-<tabId>)がアクティブで、
   * イベント対象が INPUT/TEXTAREA/contentEditable でなく、モーダル(.tm-modal-overlay)が
   * 開いていないときだけ、対応するハンドラ（keydown / paste）へイベントを渡す。
   * 修飾キーの扱いや preventDefault など機能固有の判断はハンドラ側で行う。
   * @param {string} tabId - 対象タブID
   * @param {object} handlers
   * @param {function} [handlers.keydown] - ガード通過時に呼ばれる keydown ハンドラ
   * @param {function} [handlers.paste]   - ガード通過時に呼ばれる paste ハンドラ
   */
  function onTabShortcut(tabId, { keydown, paste } = {}) {
    const passes = (e) => {
      const sec = document.getElementById('sec-' + tabId);
      if (!sec || !sec.classList.contains('active')) return false;
      if (document.querySelector('.tm-modal-overlay:not([hidden])')) return false; // モーダル表示中は無視
      const tag = (e.target.tagName || '').toUpperCase();
      if (tag === 'INPUT' || tag === 'TEXTAREA' || e.target.isContentEditable) return false;
      return true;
    };
    if (keydown) document.addEventListener('keydown', e => { if (passes(e)) keydown(e); });
    if (paste) document.addEventListener('paste', e => { if (passes(e)) paste(e); });
  }

  /** 共通ヘルパー: クリップボードコピー (成功時 true を resolve) */
  function copyText(text) {
    text = (text || '').trim();
    if (!text) { showToast('⚠ コピーする内容がありません'); return Promise.resolve(false); }
    return navigator.clipboard.writeText(text)
      .then(() => { showToast(); return true; })
      .catch(() => { showToast('⚠ コピーに失敗しました'); return false; });
  }

  /**
   * 共通ヘルパー: 状態の永続化 (chrome.storage.local)
   * 各モジュールがタブごとの入力値・変換結果を保存し、再表示時に復元するために使う。
   * キーには `tm_state_` プレフィックスを付けて他データと衝突しないようにする。
   */
  const _store = (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) || null;
  const STATE_PREFIX = 'tm_state_';
  const _saveTimers = {};

  // アプリ自身の設定キー。「入力状態の保持」をオフにしても、これらは保存・復元を続ける
  // （タブ構成・最後のタブ・保持設定自体はツールの入力状態ではなくアプリ設定のため）。
  const CORE_STATE_KEYS = new Set(['activeTab', 'tabConfig', 'persistEnabled', 'persistByTool']);
  let persistGlobal = true;  // 入力状態の保持（全体マスター）
  const persistByTool = {};  // ツールごとの保持（toolId → bool。未設定は有効扱い）

  /**
   * 指定キー（=ツールID）が現在の保持設定で保存・復元してよいか。
   * コア設定キーは常に許可。ツールは「全体ON かつ 個別が無効でない」とき許可。
   */
  function persistAllowed(key) {
    if (CORE_STATE_KEYS.has(key)) return true;
    return persistGlobal && persistByTool[key] !== false;
  }

  /** 状態を保存する（同一キーへの連続呼び出しはデバウンスされる） */
  function saveState(key, value, delay = 200) {
    if (!_store || !persistAllowed(key)) return;
    clearTimeout(_saveTimers[key]);
    _saveTimers[key] = setTimeout(() => {
      _store.set({ [STATE_PREFIX + key]: value });
    }, delay);
  }

  /** 保存済みの状態を読み込んで cb(value) を呼ぶ（未保存・保持オフなら undefined） */
  function loadState(key, cb) {
    if (!_store || !persistAllowed(key)) { cb(undefined); return; }
    _store.get(STATE_PREFIX + key, data => cb(data[STATE_PREFIX + key]));
  }

  /** 入力状態の保持が有効か。toolId 指定時はそのツールの実効値（全体×個別） */
  function isPersistEnabled(toolId) {
    if (!toolId) return persistGlobal;
    return persistGlobal && persistByTool[toolId] !== false;
  }

  /** 保持設定のスナップショット（設定UIが全体/個別を正確に描くため） */
  function getPersistConfig() {
    return { global: persistGlobal, byTool: Object.assign({}, persistByTool) };
  }

  /** 保持の有効/無効を切り替える。toolId 指定で個別、未指定で全体（設定は常に保存） */
  function setPersistEnabled(on, toolId) {
    if (toolId) {
      persistByTool[toolId] = !!on;
      if (_store) _store.set({ [STATE_PREFIX + 'persistByTool']: persistByTool });
    } else {
      persistGlobal = !!on;
      if (_store) _store.set({ [STATE_PREFIX + 'persistEnabled']: persistGlobal });
    }
  }

  /** タブをアクティブ化する共通処理（クリック・復元・設定変更から使う） */
  function activateTab(id, persist = true) {
    const entry = TAB_MANIFEST_MAP.get(id);
    const sidebar = document.getElementById('tm-sidebar');
    const content = document.getElementById('tm-content');
    const empty = document.getElementById('tm-tabs-empty');
    if (!sidebar || !content) return;
    if (!entry) {
      sidebar.querySelectorAll('.tm-tab').forEach(t => t.classList.remove('active'));
      content.querySelectorAll('.tm-section').forEach(s => s.classList.remove('active'));
      document.getElementById('tm-header-title').textContent = '便利ツール';
      if (empty) empty.hidden = false;
      return;
    }
    sidebar.querySelectorAll('.tm-tab').forEach(t =>
      t.classList.toggle('active', t.dataset.tab === id));
    content.querySelectorAll('.tm-section').forEach(s =>
      s.classList.toggle('active', s.id === 'sec-' + id));
    document.getElementById('tm-header-title').textContent = entry.icon + ' ' + entry.label;
    if (empty) empty.hidden = true;
    if (persist) saveState('activeTab', id);
  }

  /** 登録済みタブの一覧（設定UIが表示順・名称・ストレージキーを読む）。storageKey 省略時は既定の `tm_state_<id>`。 */
  function getTabs() {
    return TAB_MANIFEST.map(entry => ({
      id: entry.id, icon: entry.icon, label: entry.label,
      storageKey: entry.storageKey || (STATE_PREFIX + entry.id),
    }));
  }

  /** 正規化済みのタブ構成を返す（未登録IDを除き、登録済みで未掲載のIDは末尾に補う） */
  function getTabConfig() {
    const ids = TAB_MANIFEST.map(entry => entry.id);
    const order = (tabConfig.order || []).filter(id => ids.includes(id));
    ids.forEach(id => { if (!order.includes(id)) order.push(id); });
    const hidden = (tabConfig.hidden || []).filter(id => ids.includes(id));
    return { order, hidden };
  }

  /** タブ構成をDOMへ反映する（サイドバー/セクションの並び替えと表示/非表示） */
  function applyTabConfig() {
    const sidebar = document.getElementById('tm-sidebar');
    const content = document.getElementById('tm-content');
    if (!sidebar || !content) return;
    const cfg = getTabConfig();
    // 並び替え（既存ノードを移動するだけ。再生成しないので init は走らない）
    cfg.order.forEach(id => {
      const btn = sidebar.querySelector(`.tm-tab[data-tab="${id}"]`);
      const sec = document.getElementById('sec-' + id);
      if (btn) { sidebar.appendChild(btn); btn.hidden = cfg.hidden.includes(id); }
      if (sec) content.appendChild(sec);
    });
    // 空状態の要素は常にコンテンツ末尾へ
    const empty = document.getElementById('tm-tabs-empty');
    if (empty) content.appendChild(empty);
    // アクティブタブが非表示になったら、先頭の表示タブへ切り替える（無ければ空状態）
    const visible = cfg.order.filter(id => !cfg.hidden.includes(id));
    const activeBtn = sidebar.querySelector('.tm-tab.active');
    const activeId = activeBtn ? activeBtn.dataset.tab : null;
    if (!activeId || cfg.hidden.includes(activeId)) {
      const next = visible.length ? visible[0] : null;
      activateTab(next, false);
      if (next) lazyLoad(next);
    }
  }

  /** タブ構成を更新して反映・保存する（設定UIから呼ぶ） */
  function setTabConfig(cfg) {
    tabConfig = { order: (cfg && cfg.order) || [], hidden: (cfg && cfg.hidden) || [] };
    applyTabConfig();
    saveState('tabConfig', tabConfig);
    // タブ構成に依存する設定セクション（保持・ストレージ）へ即時再描画を促す。
    // ストレージの保存（saveState）は非同期＆デバウンスなので、表示同期はこのイベントで揃える。
    document.dispatchEvent(new CustomEvent('tm-tabconfig-change'));
  }

  /** UI構築 */
  function buildUI() {
    const sidebar = document.getElementById('tm-sidebar');
    const content = document.getElementById('tm-content');
    sidebar.innerHTML = '';
    content.innerHTML = '';

    // 初期描画のパフォーマンスを優先し、サイドバーのアイコンと空のセクションだけ構築する。
    // 各タブの中身（html / init）は lazyLoad() でタブ使用時に遅延ロードして埋める。
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

    // 表示タブが1つも無いときの空状態
    const empty = document.createElement('div');
    empty.className = 'tm-tabs-empty';
    empty.id = 'tm-tabs-empty';
    empty.hidden = true;
    empty.textContent = '表示するツールがありません。右上の ⚙️ 設定から表示するツールを選んでください。';
    content.appendChild(empty);

    // ヘッダー初期値
    if (TAB_MANIFEST.length > 0) {
      document.getElementById('tm-header-title').textContent =
        TAB_MANIFEST[0].icon + ' ' + TAB_MANIFEST[0].label;
    }

    // タブ切り替え（遅延ロードを兼ねる）
    sidebar.addEventListener('click', e => {
      const btn = e.target.closest('.tm-tab');
      if (!btn) return;
      const id = btn.dataset.tab;
      activateTab(id);
      lazyLoad(id);
    });

    // タブ構成（表示順・非表示）を反映
    applyTabConfig();

    // 前回開いていたタブを復元し遅延ロード（保存が無ければ先頭タブ）
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

    // 設定オーバーレイを構築（中身のモジュールは設定を開くときに遅延ロード）
    buildSettings();

    // FOUC 防止: <html> の display:none を解除して描画開始
    document.documentElement.style.display = 'block';
  }

  /** 設定オーバーレイ（ヘッダーの⚙️から開く全画面オーバーレイ）を構築する */
  function buildSettings() {
    let overlay = document.getElementById('tm-settings-overlay');
    if (overlay) overlay.remove(); // registerSetting 後の再構築に対応

    overlay = document.createElement('div');
    overlay.className = 'tm-modal-overlay';
    overlay.id = 'tm-settings-overlay';
    overlay.hidden = true;

    // 左ナビ（セクションが2つ以上のときだけ表示）＋ 右コンテンツ（アクティブのみ表示）
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

    // ナビでセクションを切り替える
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

    // 開閉（⚙️は popup.html の静的要素なので onclick で冪等に結線する）
    const openBtn = document.getElementById('tm-settings-open');
    if (openBtn) openBtn.onclick = openSettings;
    overlay.querySelector('#tm-settings-close').addEventListener('click', closeSettings);
    overlay.addEventListener('click', e => { if (e.target === overlay) closeSettings(); });

    // 各セクションの init を実行（DOM構築後）
    settings.forEach(s => { if (s.init) s.init(); });
  }

  /** 設定オーバーレイを開く（初回は設定モジュールを遅延ロード） */
  let settingsLoaded = false;
  function openSettings() {
    if (!settingsLoaded) {
      settingsLoaded = true;
      loadStyles(SETTING_STYLES);
      loading++;
      loadScripts(SETTING_SCRIPTS, () => {
        loading--;
        buildSettings();
        const o = document.getElementById('tm-settings-overlay');
        if (o) { o.hidden = false; }
        document.dispatchEvent(new CustomEvent('tm-settings-open'));
      });
    } else {
      const o = document.getElementById('tm-settings-overlay');
      if (!o) return;
      o.hidden = false;
      document.dispatchEvent(new CustomEvent('tm-settings-open'));
    }
  }

  /** 設定オーバーレイを閉じる */
  function closeSettings() {
    const o = document.getElementById('tm-settings-overlay');
    if (o) o.hidden = true;
  }

  /** コピーボタンの共通クリック処理（イベント委譲なのでDOM再構築後も有効） */
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

  /** Escape で設定オーバーレイを閉じる（一度だけ登録） */
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    const o = document.getElementById('tm-settings-overlay');
    if (!o || o.hidden) return;
    // 設定内で別のオーバーレイ（確認ダイアログ等）が開いている場合はそちらを優先
    if (o.querySelector('.tm-modal-overlay:not([hidden])')) return;
    closeSettings();
  });

  /** UI構築前にコア設定（保持ON/OFF・タブ構成）を読み込む（モジュール init より先に確定させる） */
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

  /** CSS を動的に挿入する（並列読み込み・順序不問） */
  function loadStyles(hrefs) {
    (hrefs || []).forEach(href => {
      const l = document.createElement('link');
      l.rel = 'stylesheet';
      l.href = href;
      document.head.appendChild(l);
    });
  }

  /** スクリプトを順次ロードする汎用関数 */
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

  /** タブのスクリプトを遅延ロードし、コンテンツを構築する */
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

  /** DOMContentLoaded でコア設定先読み → シェル構築 */
  document.addEventListener('DOMContentLoaded', () => {
    preloadCoreConfig(() => {
      initialized = true;
      buildUI();
    });
  });

  return {
    registerTab, registerSetting, copyText, copyButton, iconButton, showToast, ICONS,
    escapeHtml, $, qsa, onTabShortcut,
    saveState, loadState, isPersistEnabled, getPersistConfig, setPersistEnabled,
    getTabs, getTabConfig, setTabConfig,
  };
})();
