Toolkit.registerTab({
  html: `
    <div class="tm-row">
      <label class="tm-label">キャプチャ範囲</label>
      <select class="tm-select" id="scr-mode">
        <option value="viewport">表示領域全体</option>
        <option value="fullpage">ページ全体（スクロール含む）</option>
        <option value="element">要素選択</option>
        <option value="rect">矩形選択</option>
      </select>
    </div>
    <div class="tm-row tm-inline" id="scr-delay-row">
      <label class="tm-label" style="white-space:nowrap;margin:0">遅延（秒）</label>
      <input type="number" class="tm-input" id="scr-delay" value="0" min="0" max="10" step="1" style="width:80px">
    </div>
    <div class="tm-row">
      <button class="tm-btn tm-btn-primary" id="scr-capture">📸 撮影</button>
    </div>
    <div class="tm-label" id="scr-status"></div>
  `,
  init() {
    const modeEl = Toolkit.$('scr-mode'), delayEl = Toolkit.$('scr-delay'), delayRow = Toolkit.$('scr-delay-row'), btn = Toolkit.$('scr-capture'), statusEl = Toolkit.$('scr-status');

    // 要素選択・矩形選択はクリック/ドラッグでの選択操作自体が前提のため、ページ状態を整えて自動撮影する「遅延」とは相性が悪く無効化する
    function syncDelayAvailability() {
      const disabled = modeEl.value === 'element' || modeEl.value === 'rect';
      delayEl.disabled = disabled;
      delayRow.style.opacity = disabled ? '0.5' : '';
    }

    Toolkit.bindState('screenshot', { 'scr-mode': ['value', 'mode'], 'scr-delay': ['value', 'delaySeconds'] }, { onRestore: syncDelayAvailability });
    Toolkit.clampInput(delayEl);
    modeEl.addEventListener('change', syncDelayAvailability);
    syncDelayAvailability();

    btn.addEventListener('click', async () => {
      const tabsApi = typeof chrome !== 'undefined' && chrome.tabs;
      if (!tabsApi) { Toolkit.showToast('⚠ この環境では撮影できません'); return; }
      let tab;
      try {
        const list = await tabsApi.query({ active: true, currentWindow: true });
        tab = list && list[0];
      } catch (_) {}
      if (!tab || !/^https?:\/\//.test(tab.url || '')) {
        Toolkit.showToast('⚠ このページでは撮影できません');
        return;
      }
      const isPickingMode = modeEl.value === 'element' || modeEl.value === 'rect';
      const delaySeconds = isPickingMode ? 0 : (parseInt(delayEl.value, 10) || 0);
      btn.disabled = true;
      statusEl.textContent = modeEl.value === 'element' ? '要素選択を起動中…' : modeEl.value === 'rect' ? '矩形選択を起動中…' : '撮影中…';
      chrome.runtime.sendMessage({ type: 'captureScreenshot', tabId: tab.id, mode: modeEl.value, delaySeconds }, res => {
        btn.disabled = false;
        statusEl.textContent = '';
        if (chrome.runtime.lastError || !res || !res.ok) {
          Toolkit.showToast('⚠ 撮影に失敗しました' + (res && res.error ? '（' + res.error + '）' : ''));
          return;
        }
        if (res.delayed) {
          Toolkit.showToast(`⏱ ${res.delaySeconds}秒後に撮影します（拡張機能アイコンのバッジでカウントダウン表示）`);
          return;
        }
        if (res.picking) { window.close(); return; }
        Toolkit.showToast('🖼 新しいタブでプレビューを開きました');
      });
    });
  },
});
