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

  /** 共通ヘルパー: クリップボードコピー */
  function copyText(text, msgEl) {
    navigator.clipboard.writeText(text).then(() => {
      if (msgEl) {
        msgEl.classList.add('show');
        setTimeout(() => msgEl.classList.remove('show'), 1200);
      }
    });
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

  /** DOMContentLoaded で一括構築 */
  document.addEventListener('DOMContentLoaded', () => {
    initialized = true;
    buildUI();
  });

  return { registerTab, copyText };
})();
