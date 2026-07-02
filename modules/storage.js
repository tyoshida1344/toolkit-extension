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
    // ツール一覧は登録済みタブから動的に作る。並び順はタブ構成に従う。
    function getTools() {
      const byId = {};
      Toolkit.getTabs().forEach(t => { byId[t.id] = t; });
      return Toolkit.getTabConfig().order
        .map(id => byId[id])
        .filter(Boolean)
        .map(t => ({ key: t.storageKey, icon: t.icon, label: t.label }));
    }

    const store = (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) || null;
    const QUOTA = (store && store.QUOTA_BYTES) || 10485760; // 既定 10MB

    const totalEl = Toolkit.$('storage-total');
    const percentEl = Toolkit.$('storage-percent');
    const barEl = Toolkit.$('storage-bar');
    const listEl = Toolkit.$('storage-list');
    const clearAllBtn = Toolkit.$('storage-clear-all');
    const confirmEl = Toolkit.$('storage-confirm');
    const confirmMsgEl = Toolkit.$('storage-confirm-msg');
    const confirmCancelBtn = Toolkit.$('storage-confirm-cancel');
    const confirmOkBtn = Toolkit.$('storage-confirm-ok');

    /** バイト数を読みやすい単位へ */
    function fmtBytes(n) {
      if (n < 1024) return n + ' B';
      if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
      return (n / 1024 / 1024).toFixed(2) + ' MB';
    }

    // ── 描画 ──
    function renderRows(tools) {
      listEl.innerHTML = tools.map(t =>
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
    function refresh(tools) {
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
      tools.forEach(t => {
        store.getBytesInUse(t.key, bytes => {
          const sizeEl = Toolkit.$('storage-size-' + t.key);
          const rowEl = Toolkit.$('storage-item-' + t.key);
          if (sizeEl) sizeEl.textContent = fmtBytes(bytes);
          if (rowEl) {
            rowEl.classList.toggle('is-empty', bytes === 0);
            const btn = rowEl.querySelector('.tm-storage-item-clear');
            if (btn) btn.disabled = (bytes === 0);
          }
        });
      });
    }

    /** 最新のタブ構成で行を組み直し、使用量を反映する（並び替えにも追従） */
    function rerender() {
      const tools = getTools();
      renderRows(tools);
      refresh(tools);
    }

    // ── 確認ダイアログ ──
    let pendingKeys = null;
    const confirmModal = Toolkit.modal(confirmEl, {
      onClose() { pendingKeys = null; },
    });
    function askConfirm(message, keys) {
      confirmMsgEl.textContent = message;
      pendingKeys = keys;
      confirmModal.open();
    }

    function clearKeys(keys) {
      if (!store || !keys || keys.length === 0) return;
      store.remove(keys);
    }

    // ── イベント結線 ──
    listEl.addEventListener('click', e => {
      const btn = e.target.closest('.tm-storage-item-clear');
      if (!btn || btn.disabled) return;
      askConfirm(`「${btn.dataset.label}」の保存データを消去します。よろしいですか？`, [btn.dataset.key]);
    });

    clearAllBtn.addEventListener('click', () => {
      askConfirm('すべてのツールの保存データを消去します。よろしいですか？', getTools().map(t => t.key));
    });

    confirmCancelBtn.addEventListener('click', () => confirmModal.close());
    confirmOkBtn.addEventListener('click', () => {
      const keys = pendingKeys;
      confirmModal.close();
      clearKeys(keys);
    });

    // ── 更新トリガ ──
    // 設定を開いたとき／（設定表示中に）ストレージが変化したときに再描画する。タブ並び替えも再描画する。
    // 設定が閉じている間は再描画しない（無駄な取得を避ける）。
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.onChanged) {
      chrome.storage.onChanged.addListener((changes, area) => {
        const overlay = Toolkit.$('tm-settings-overlay');
        if (area === 'local' && overlay && !overlay.hidden) rerender();
      });
    }
    document.addEventListener('tm-settings-open', rerender);
    document.addEventListener('tm-tabconfig-change', rerender); // 並び替え・表示切替を即時反映（保持セクションと同期）

    // ── 初期描画 ──
    rerender();
  },
});
