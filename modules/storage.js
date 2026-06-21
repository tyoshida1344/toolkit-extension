/**
 * storage.js — ストレージ使用量の可視化とクリア（設定画面のセクション）
 *
 * タブではなく、ヘッダーの⚙️から開く設定オーバーレイの 1 セクションとして
 * Toolkit.registerSetting() で自己登録する。
 */
Toolkit.registerSetting({
  id: 'storage',
  title: '💾 ストレージ',
  html: `
    <div class="tm-storage">
      <div class="tm-storage-summary">
        <div class="tm-storage-summary-head">
          <span class="tm-storage-total" id="storage-total">—</span>
          <span class="tm-storage-percent" id="storage-percent"></span>
        </div>
        <div class="tm-storage-bar"><div class="tm-storage-bar-fill" id="storage-bar"></div></div>
      </div>

      <div class="tm-storage-list" id="storage-list"></div>

      <div class="tm-storage-actions">
        <button type="button" class="tm-btn tm-btn-danger" id="storage-clear-all">すべて消去</button>
      </div>

      <!-- 確認ダイアログ（クリア実行前に表示） -->
      <div class="tm-modal-overlay tm-storage-confirm" id="storage-confirm" hidden>
        <div class="tm-modal tm-storage-confirm-modal">
          <div class="tm-modal-header"><span>確認</span></div>
          <div class="tm-modal-body">
            <p class="tm-storage-confirm-msg" id="storage-confirm-msg"></p>
            <div class="tm-storage-confirm-actions">
              <button type="button" class="tm-btn tm-btn-secondary" id="storage-confirm-cancel">キャンセル</button>
              <button type="button" class="tm-btn tm-btn-danger" id="storage-confirm-ok">消去する</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  `,
  init() {
    // 各ツールが保存に使うストレージキー（メモ帳だけ歴史的経緯で独自キー）。
    // アプリ全体の「最後に開いたタブ」(tm_state_activeTab) はクリア対象外。
    const TOOLS = [
      { key: 'tm_state_strgen',    icon: '✏️', label: '文字列生成' },
      { key: 'tm_state_epoch',     icon: '⏱️', label: 'エポック変換' },
      { key: 'tm_state_color',     icon: '🎨', label: 'カラー変換' },
      { key: 'tm_state_translate', icon: '🌐', label: '翻訳' },
      { key: 'tm_state_regex',     icon: '🔤', label: '正規表現' },
      { key: 'tm_state_calc',      icon: '🔢', label: '電卓' },
      { key: 'tm_toolkit_memo',    icon: '📝', label: 'メモ帳' },
    ];

    const store = (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) || null;
    const QUOTA = (store && store.QUOTA_BYTES) || 10485760; // 既定 10MB

    const totalEl = document.getElementById('storage-total');
    const percentEl = document.getElementById('storage-percent');
    const barEl = document.getElementById('storage-bar');
    const listEl = document.getElementById('storage-list');
    const clearAllBtn = document.getElementById('storage-clear-all');
    const confirmEl = document.getElementById('storage-confirm');
    const confirmMsgEl = document.getElementById('storage-confirm-msg');
    const confirmCancelBtn = document.getElementById('storage-confirm-cancel');
    const confirmOkBtn = document.getElementById('storage-confirm-ok');

    /** バイト数を読みやすい単位へ */
    function fmtBytes(n) {
      if (n < 1024) return n + ' B';
      if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
      return (n / 1024 / 1024).toFixed(2) + ' MB';
    }

    // ── 描画 ──
    function renderRows() {
      listEl.innerHTML = TOOLS.map(t =>
        `<div class="tm-storage-item" id="storage-item-${t.key}">
          <span class="tm-storage-item-icon">${t.icon}</span>
          <span class="tm-storage-item-label">${t.label}</span>
          <span class="tm-storage-item-size" id="storage-size-${t.key}">—</span>
          <button type="button" class="tm-icon-btn tm-storage-item-clear"
            data-key="${t.key}" data-label="${t.label}"
            title="${t.label}のデータを消去" aria-label="${t.label}のデータを消去">🗑️</button>
        </div>`).join('');
    }

    /** 合計・ツール別の使用量を取得して反映する */
    function refresh() {
      if (!store) {
        totalEl.textContent = '利用不可';
        return;
      }
      // 合計（activeTab 等も含む実使用量）と上限に対する使用率
      store.getBytesInUse(null, total => {
        totalEl.textContent = fmtBytes(total) + ' / ' + fmtBytes(QUOTA);
        const pct = QUOTA > 0 ? (total / QUOTA) * 100 : 0;
        percentEl.textContent = (total > 0 && pct < 0.1) ? '0.1% 未満' : pct.toFixed(1) + '%';
        barEl.style.width = Math.min(100, pct) + '%';
      });
      // ツール別の内訳。データの無いツールは淡色＋クリア無効。
      TOOLS.forEach(t => {
        store.getBytesInUse(t.key, bytes => {
          const sizeEl = document.getElementById('storage-size-' + t.key);
          const rowEl = document.getElementById('storage-item-' + t.key);
          if (sizeEl) sizeEl.textContent = fmtBytes(bytes);
          if (rowEl) {
            rowEl.classList.toggle('is-empty', bytes === 0);
            const btn = rowEl.querySelector('.tm-storage-item-clear');
            if (btn) btn.disabled = (bytes === 0);
          }
        });
      });
    }

    // ── 確認ダイアログ ──
    let pendingKeys = null;
    function askConfirm(message, keys) {
      confirmMsgEl.textContent = message;
      pendingKeys = keys;
      confirmEl.hidden = false;
    }
    function closeConfirm() {
      confirmEl.hidden = true;
      pendingKeys = null;
    }

    /** 指定キーを削除し、ポップアップをリロードして画面を初期状態へ戻す */
    function clearKeys(keys) {
      if (!store || !keys || keys.length === 0) return;
      store.remove(keys, () => { location.reload(); });
    }

    // ── イベント結線 ──
    listEl.addEventListener('click', e => {
      const btn = e.target.closest('.tm-storage-item-clear');
      if (!btn || btn.disabled) return;
      askConfirm(`「${btn.dataset.label}」の保存データを消去します。よろしいですか？`, [btn.dataset.key]);
    });

    clearAllBtn.addEventListener('click', () => {
      askConfirm('すべてのツールの保存データを消去します。よろしいですか？', TOOLS.map(t => t.key));
    });

    confirmCancelBtn.addEventListener('click', closeConfirm);
    confirmEl.addEventListener('click', e => { if (e.target === confirmEl) closeConfirm(); });
    confirmOkBtn.addEventListener('click', () => {
      const keys = pendingKeys;
      closeConfirm();
      clearKeys(keys);
    });

    // 確認ダイアログ表示中は Escape で閉じる（設定オーバーレイより優先）
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && !confirmEl.hidden) closeConfirm();
    });

    // ── 更新トリガ ──
    // 設定を開いたとき／（設定表示中に）ストレージが変化したときに再描画する。
    // 設定が閉じている間の変化では再描画しない（無駄な getBytesInUse を避ける）。
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.onChanged) {
      chrome.storage.onChanged.addListener((changes, area) => {
        const overlay = document.getElementById('tm-settings-overlay');
        if (area === 'local' && overlay && !overlay.hidden) refresh();
      });
    }
    document.addEventListener('tm-settings-open', refresh);

    // ── 初期描画 ──
    renderRows();
    refresh();
  },
});
