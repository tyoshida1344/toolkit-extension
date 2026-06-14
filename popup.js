/**
 * popup.js — タブ管理・モジュール登録の共通フレームワーク
 *
 * 各モジュールは Toolkit.registerTab() を呼ぶだけで自動登録される。
 */
const Toolkit = (() => {
  const tabs = [];
  let initialized = false;

  /**
   * タブを登録する
   * @param {object} opts
   * @param {string} opts.id       - タブの一意ID (例: "strgen")
   * @param {string} opts.icon     - 絵文字アイコン (例: "✏️")
   * @param {string} opts.label    - 表示名 (例: "文字列生成")
   * @param {string} opts.html     - タブ内のHTML文字列
   * @param {function} opts.init   - DOM構築後に呼ばれる初期化関数
   */
  function registerTab({ id, icon, label, html, init }) {
    tabs.push({ id, icon, label, html, init });
    if (initialized) buildUI();
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

  /** 共通ヘルパー: クリップボードコピー (成功時 true を resolve) */
  function copyText(text) {
    text = (text || '').trim();
    if (!text) { showToast('⚠ コピーする内容がありません'); return Promise.resolve(false); }
    return navigator.clipboard.writeText(text)
      .then(() => { showToast(); return true; })
      .catch(() => { showToast('⚠ コピーに失敗しました'); return false; });
  }

  /** UI構築 */
  function buildUI() {
    const sidebar = document.getElementById('tm-sidebar');
    const content = document.getElementById('tm-content');
    sidebar.innerHTML = '';
    content.innerHTML = '';

    tabs.forEach((tab, i) => {
      // サイドバーボタン
      const btn = document.createElement('button');
      btn.className = 'tm-tab' + (i === 0 ? ' active' : '');
      btn.dataset.tab = tab.id;
      btn.dataset.tip = tab.label;
      btn.textContent = tab.icon;
      sidebar.appendChild(btn);

      // セクション
      const sec = document.createElement('div');
      sec.className = 'tm-section' + (i === 0 ? ' active' : '');
      sec.id = 'sec-' + tab.id;
      sec.innerHTML = tab.html;
      content.appendChild(sec);
    });

    // ヘッダー初期値
    if (tabs.length > 0) {
      document.getElementById('tm-header-title').textContent =
        tabs[0].icon + ' ' + tabs[0].label;
    }

    // タブ切り替え
    sidebar.querySelectorAll('.tm-tab').forEach(btn => {
      btn.addEventListener('click', () => {
        sidebar.querySelectorAll('.tm-tab').forEach(t => t.classList.remove('active'));
        content.querySelectorAll('.tm-section').forEach(s => s.classList.remove('active'));
        btn.classList.add('active');
        const tab = tabs.find(t => t.id === btn.dataset.tab);
        document.getElementById('sec-' + tab.id).classList.add('active');
        document.getElementById('tm-header-title').textContent =
          tab.icon + ' ' + tab.label;
      });
    });

    // 各モジュールの init を実行
    tabs.forEach(tab => { if (tab.init) tab.init(); });
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

  /** DOMContentLoaded で一括構築 */
  document.addEventListener('DOMContentLoaded', () => {
    initialized = true;
    buildUI();
  });

  return { registerTab, copyText, copyButton, iconButton, showToast, ICONS };
})();
