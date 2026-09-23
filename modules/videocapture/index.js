Toolkit.registerTab({
  html: `
    <div id="vc-idle-view">
      <div class="tm-row">
        <label class="tm-label">キャプチャ範囲</label>
        <select class="tm-select" id="vc-mode">
          <option value="viewport">表示領域全体</option>
          <option value="rect">矩形選択</option>
        </select>
      </div>
      <div class="tm-row">
        ${Toolkit.checkLabel('vc-desktop', '画面/ウィンドウを対象にする', { title: 'チェックすると、選んだ画面全体またはウィンドウを録画します（ページ外の内容も映り込みます。キャプチャ範囲の指定は無効になり、対応環境ではシステム音声を含みます）' })}
      </div>
      <div class="tm-row">
        <button class="tm-btn tm-btn-primary" id="vc-record">🎥 録画開始</button>
      </div>
      <div class="tm-label">タブの音声を含めて録画します。最大10分で自動的に停止します</div>
    </div>
    <div id="vc-recording-view" hidden>
      <div class="tm-row">
        <span class="tm-label">⏺ 録画中（<span id="vc-elapsed">00:00</span>）</span>
      </div>
      <div class="tm-row">
        <button class="tm-btn tm-btn-primary" id="vc-stop">⏹ 録画終了</button>
      </div>
    </div>
    <div class="tm-label" id="vc-status"></div>
  `,
  init() {
    const idleView = Toolkit.$('vc-idle-view'), recordingView = Toolkit.$('vc-recording-view');
    const modeEl = Toolkit.$('vc-mode'), desktopEl = Toolkit.$('vc-desktop'), recordBtn = Toolkit.$('vc-record'), stopBtn = Toolkit.$('vc-stop');
    const elapsedEl = Toolkit.$('vc-elapsed'), statusEl = Toolkit.$('vc-status');
    function syncModeAvailability() { modeEl.disabled = desktopEl.checked; }
    Toolkit.bindState('videocapture', { 'vc-mode': ['value', 'mode'], 'vc-desktop': ['checked', 'desktopMode'] }, { onRestore: syncModeAvailability });
    desktopEl.addEventListener('change', syncModeAvailability);
    syncModeAvailability();

    let tickTimer = null;
    function showRecording(startedAt) {
      idleView.hidden = true;
      recordingView.hidden = false;
      clearInterval(tickTimer);
      const tick = () => { elapsedEl.textContent = formatMmSs((Date.now() - startedAt) / 1000); };
      tick();
      tickTimer = setInterval(tick, 1000);
    }

    const runtimeApi = typeof chrome !== 'undefined' && chrome.runtime;
    if (runtimeApi) {
      runtimeApi.sendMessage({ type: 'getVideoCaptureStatus' }, res => {
        if (res && res.recording) showRecording(res.startedAt);
      });
    }

    recordBtn.addEventListener('click', async () => {
      const tabsApi = typeof chrome !== 'undefined' && chrome.tabs;
      if (!tabsApi) { Toolkit.showToast('⚠ この環境では録画できません'); return; }
      let tab;
      try {
        const list = await tabsApi.query({ active: true, currentWindow: true });
        tab = list && list[0];
      } catch (_) {}
      const desktopMode = desktopEl.checked;
      if (!tab || (!desktopMode && !/^https?:\/\//.test(tab.url || ''))) {
        Toolkit.showToast('⚠ このページでは録画できません');
        return;
      }
      recordBtn.disabled = true;
      statusEl.textContent = desktopMode ? '録画対象を選択中…' : modeEl.value === 'rect' ? '矩形選択を起動中…' : '録画準備中…';
      const message = desktopMode
        ? { type: 'startDesktopVideoCapture', tabId: tab.id }
        : { type: 'startVideoCapture', tabId: tab.id, mode: modeEl.value };
      chrome.runtime.sendMessage(message, res => {
        recordBtn.disabled = false;
        statusEl.textContent = '';
        if (chrome.runtime.lastError || !res || !res.ok) {
          Toolkit.showToast('⚠ 録画の開始に失敗しました' + (res && res.error ? '（' + res.error + '）' : ''));
          return;
        }
        if (!res.cancelled) window.close();
      });
    });

    stopBtn.addEventListener('click', () => {
      stopBtn.disabled = true;
      chrome.runtime.sendMessage({ type: 'vcStopClicked' });
      window.close();
    });
  },
});
