Toolkit.registerTab({
  html: `
    <div class="tm-row">
      <label class="tm-label">キャプチャ範囲</label>
      <select class="tm-select" id="vc-mode">
        <option value="viewport">表示領域全体</option>
        <option value="rect">矩形選択</option>
      </select>
    </div>
    <div class="tm-row">
      <button class="tm-btn tm-btn-primary" id="vc-record">🎥 録画開始</button>
    </div>
    <div class="tm-label">タブの音声を含めて録画します。最大10分で自動的に停止します</div>
    <div class="tm-label" id="vc-status"></div>
  `,
  init() {
    const modeEl = Toolkit.$('vc-mode'), btn = Toolkit.$('vc-record'), statusEl = Toolkit.$('vc-status');
    Toolkit.bindState('videocapture', { 'vc-mode': ['value', 'mode'] });

    btn.addEventListener('click', async () => {
      const tabsApi = typeof chrome !== 'undefined' && chrome.tabs;
      if (!tabsApi) { Toolkit.showToast('⚠ この環境では録画できません'); return; }
      let tab;
      try {
        const list = await tabsApi.query({ active: true, currentWindow: true });
        tab = list && list[0];
      } catch (_) {}
      if (!tab || !/^https?:\/\//.test(tab.url || '')) {
        Toolkit.showToast('⚠ このページでは録画できません');
        return;
      }
      btn.disabled = true;
      statusEl.textContent = modeEl.value === 'rect' ? '矩形選択を起動中…' : '録画準備中…';
      chrome.runtime.sendMessage({ type: 'startVideoCapture', tabId: tab.id, mode: modeEl.value }, res => {
        btn.disabled = false;
        statusEl.textContent = '';
        if (chrome.runtime.lastError || !res || !res.ok) {
          Toolkit.showToast('⚠ 録画の開始に失敗しました' + (res && res.error ? '（' + res.error + '）' : ''));
          return;
        }
        window.close();
      });
    });
  },
});
