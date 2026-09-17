Toolkit.registerTab({
  html: `
    <div class="tm-row">
      <label class="tm-label">キャプチャ範囲</label>
      <select class="tm-select" id="scr-mode">
        <option value="viewport">表示領域全体</option>
        <option value="fullpage">ページ全体（スクロール含む）</option>
      </select>
    </div>
    <div class="tm-row">
      <label class="tm-label">保存形式</label>
      <select class="tm-select" id="scr-format">
        <option value="png">PNG</option>
        <option value="jpeg">JPEG</option>
        <option value="webp">WebP</option>
      </select>
    </div>
    <div class="tm-row">
      <button class="tm-btn tm-btn-primary" id="scr-capture">📸 撮影</button>
    </div>
    <div class="tm-label" id="scr-status"></div>
  `,
  init() {
    const modeEl = Toolkit.$('scr-mode'), formatEl = Toolkit.$('scr-format'), btn = Toolkit.$('scr-capture'), statusEl = Toolkit.$('scr-status');

    Toolkit.bindState('screenshot', {
      'scr-mode': ['value', 'mode'],
      'scr-format': ['value', 'format'],
    });

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
      btn.disabled = true;
      statusEl.textContent = '撮影中…';
      chrome.runtime.sendMessage({ type: 'captureScreenshot', tabId: tab.id, mode: modeEl.value, format: formatEl.value }, res => {
        btn.disabled = false;
        statusEl.textContent = '';
        if (chrome.runtime.lastError || !res || !res.ok) {
          Toolkit.showToast('⚠ 撮影に失敗しました' + (res && res.error ? '（' + res.error + '）' : ''));
          return;
        }
        Toolkit.showToast('🖼 新しいタブでプレビューを開きました');
      });
    });
  },
});
