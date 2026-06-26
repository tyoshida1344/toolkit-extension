/**
 * appsettings.js — アプリの基本設定（設定画面のセクション）
 *   - 表示するツール（タブの表示/非表示・並び替え）… イシュー #7 の主目的
 *   - 入力状態の保持（各ツールの自動保存の有効/無効）
 *
 * タブではなく、ヘッダー⚙️の設定オーバーレイのセクションとして登録する。
 * タブ構成・保持設定の実体は popup.js コアが持ち、ここは編集UIのみを担う。
 */

// ── 表示するツール（タブの表示切替・並び替え） ──
Toolkit.registerSetting({
  id: 'tabvis',
  title: '🗂️ 表示するツール',
  html: `
    <p class="tm-set-desc">タブに表示するツールを選べます。ドラッグで並び替え、スイッチで表示/非表示を切り替えます。</p>
    <div class="tm-tabcfg-list" id="tabcfg-list"></div>
  `,
  init() {
    const listEl = Toolkit.$('tabcfg-list');
    let dragEl = null;

    /** 現在のタブ構成を一覧へ描画する */
    function render() {
      const cfg = Toolkit.getTabConfig();
      const byId = {};
      Toolkit.getTabs().forEach(t => { byId[t.id] = t; });
      listEl.innerHTML = cfg.order.map(id => {
        const t = byId[id];
        if (!t) return '';
        const checked = cfg.hidden.includes(id) ? '' : ' checked';
        return `<div class="tm-tabcfg-item" draggable="true" data-id="${id}">
          <span class="tm-tabcfg-handle" title="ドラッグで並び替え" aria-hidden="true">⠿</span>
          <span class="tm-tabcfg-icon">${t.icon}</span>
          <span class="tm-tabcfg-label">${t.label}</span>
          <label class="tm-switch">
            <input type="checkbox" class="tm-tabcfg-toggle"${checked} aria-label="${t.label}を表示">
            <span class="tm-switch-slider"></span>
          </label>
        </div>`;
      }).join('');
    }

    /** 一覧のDOM順・チェック状態から構成を組み立てる */
    function readConfig() {
      const items = Toolkit.qsa('.tm-tabcfg-item', listEl);
      return {
        order: items.map(i => i.dataset.id),
        hidden: items.filter(i => !i.querySelector('.tm-tabcfg-toggle').checked).map(i => i.dataset.id),
      };
    }

    /** 構成を保存・即時反映する */
    function commit() { Toolkit.setTabConfig(readConfig()); }

    // 表示/非表示スイッチ
    listEl.addEventListener('change', e => {
      if (e.target.classList.contains('tm-tabcfg-toggle')) commit();
    });

    // ドラッグ並び替え（既存ノードを移動するだけで再描画はしない）
    listEl.addEventListener('dragstart', e => {
      const item = e.target.closest('.tm-tabcfg-item');
      if (!item) return;
      dragEl = item;
      item.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
    });
    listEl.addEventListener('dragend', () => {
      if (!dragEl) return;
      dragEl.classList.remove('dragging');
      dragEl = null;
      commit(); // ドロップ確定時に保存・反映
    });
    listEl.addEventListener('dragover', e => {
      if (!dragEl) return;
      e.preventDefault();
      const after = getAfterEl(e.clientY);
      if (after == null) listEl.appendChild(dragEl);
      else listEl.insertBefore(dragEl, after);
    });

    /** ポインタのY座標から、ドラッグ要素を差し込む直後の要素を求める */
    function getAfterEl(y) {
      const els = Toolkit.qsa('.tm-tabcfg-item:not(.dragging)', listEl);
      let closest = { offset: -Infinity, el: null };
      for (const el of els) {
        const box = el.getBoundingClientRect();
        const offset = y - box.top - box.height / 2;
        if (offset < 0 && offset > closest.offset) closest = { offset, el };
      }
      return closest.el;
    }

    document.addEventListener('tm-settings-open', render);
    render();
  },
});

// ── 入力状態の保持（全体マスター＋ツールごと） ──
Toolkit.registerSetting({
  id: 'persist',
  title: '💾 入力状態の保持',
  html: `
    <p class="tm-set-desc">各ツールの入力・結果を保存し、次回開いたときに復元します。全体をオフにするとすべて停止します（既存の保存データは下の「ストレージ」から消去できます）。</p>
    <div class="tm-set-row tm-persist-global">
      <span class="tm-set-row-text"><strong>全体</strong></span>
      <label class="tm-switch">
        <input type="checkbox" id="persist-global" aria-label="入力状態の保持（全体）">
        <span class="tm-switch-slider"></span>
      </label>
    </div>
    <div class="tm-persist-list" id="persist-list"></div>
  `,
  init() {
    const globalToggle = Toolkit.$('persist-global');
    const listEl = Toolkit.$('persist-list');

    /** 全体トグルとツールごとの一覧を現在値で描画する（並びはタブの表示順に合わせる） */
    function render() {
      const cfg = Toolkit.getPersistConfig();
      globalToggle.checked = cfg.global;
      const byId = {};
      Toolkit.getTabs().forEach(t => { byId[t.id] = t; });
      // ツールごと（全体OFF中は個別を無効表示）
      listEl.innerHTML = Toolkit.getTabConfig().order.map(id => {
        const t = byId[id];
        if (!t) return '';
        const on = cfg.byTool[id] !== false;
        return `<div class="tm-persist-item${cfg.global ? '' : ' is-disabled'}">
          <span class="tm-persist-icon">${t.icon}</span>
          <span class="tm-persist-label">${t.label}</span>
          <label class="tm-switch">
            <input type="checkbox" class="tm-persist-toggle" data-id="${id}"${on ? ' checked' : ''}${cfg.global ? '' : ' disabled'} aria-label="${t.label}の保持">
            <span class="tm-switch-slider"></span>
          </label>
        </div>`;
      }).join('');
    }

    // 全体トグル（変更後は個別の有効/無効表示を更新するため再描画）
    globalToggle.addEventListener('change', () => {
      Toolkit.setPersistEnabled(globalToggle.checked);
      render();
    });

    // ツールごとトグル
    listEl.addEventListener('change', e => {
      const inp = e.target.closest('.tm-persist-toggle');
      if (!inp) return;
      Toolkit.setPersistEnabled(inp.checked, inp.dataset.id);
    });

    document.addEventListener('tm-settings-open', render);
    render();
  },
});
