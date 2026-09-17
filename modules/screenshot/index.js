Toolkit.registerTab({
  html: `
    <div class="tm-row">
      <label class="tm-label">キャプチャ範囲</label>
      <select class="tm-select" id="scr-mode">
        <option value="viewport">表示領域全体</option>
        <option value="fullpage">ページ全体（スクロール含む）</option>
      </select>
    </div>
    <div class="tm-row tm-inline">
      <label class="tm-label" style="white-space:nowrap;margin:0">遅延（秒）</label>
      <input type="number" class="tm-input" id="scr-delay" value="0" min="0" max="10" step="1" style="width:80px">
    </div>
    <div class="tm-row">
      <button class="tm-btn tm-btn-primary" id="scr-capture">📸 撮影</button>
    </div>
    <div class="tm-label" id="scr-status"></div>
  `,
  init() {
    const modeEl = Toolkit.$('scr-mode'), delayEl = Toolkit.$('scr-delay'), btn = Toolkit.$('scr-capture'), statusEl = Toolkit.$('scr-status');

    Toolkit.bindState('screenshot', { 'scr-mode': ['value', 'mode'], 'scr-delay': ['value', 'delaySeconds'] });
    Toolkit.clampInput(delayEl);

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
      const delaySeconds = parseInt(delayEl.value, 10) || 0;
      btn.disabled = true;
      statusEl.textContent = '撮影中…';
      chrome.runtime.sendMessage({ type: 'captureScreenshot', tabId: tab.id, mode: modeEl.value, delaySeconds }, res => {
        btn.disabled = false;
        statusEl.textContent = '';
        if (chrome.runtime.lastError || !res || !res.ok) {
          Toolkit.showToast('⚠ 撮影に失敗しました' + (res && res.error ? '（' + res.error + '）' : ''));
          return;
        }
        Toolkit.showToast(res.delayed
          ? `⏱ ${res.delaySeconds}秒後に撮影します（拡張機能アイコンのバッジでカウントダウン表示）`
          : '🖼 新しいタブでプレビューを開きました');
      });
    });
  },
});
