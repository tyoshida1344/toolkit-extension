importScripts('modules/screenshot/worker.js', 'modules/videocapture/worker.js');

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'openPopup') {
    chrome.action.openPopup().catch(() => {});
  }
  if (msg.type === 'captureTab') {
    chrome.tabs.captureVisibleTab(null, { format: 'png' })
      .then(dataUrl => sendResponse({ dataUrl }))
      .catch(() => sendResponse({ dataUrl: null }));
    return true;
  }
  if (msg.type === 'captureScreenshot') {
    const delaySeconds = Math.min(10, Math.max(0, parseInt(msg.delaySeconds, 10) || 0));
    if (delaySeconds > 0) {
      runDelayedCapture(msg.tabId, msg.mode, delaySeconds);
      sendResponse({ ok: true, delayed: true, delaySeconds });
      return;
    }
    runModeAction(msg.tabId, msg.mode)
      .then(res => sendResponse({ ok: true, ...res }))
      .catch(e => sendResponse({ ok: false, error: String((e && e.message) || e) }));
    return true;
  }
  if (msg.type === 'pickerCaptureComplete') {
    openPreviewTab({
      dataUrl: msg.dataUrl,
      baseName: screenshotBaseName(msg.title),
      truncated: !!msg.truncated,
    });
  }
  if (msg.type === 'pickerCaptureFailed') {
    flashBadgeError();
  }
  if (msg.type === 'startVideoCapture') {
    startVideoCapture(msg.tabId, msg.mode)
      .then(res => sendResponse({ ok: true, ...res }))
      .catch(e => sendResponse({ ok: false, error: String((e && e.message) || e) }));
    return true;
  }
  if (msg.type === 'getVideoCaptureStatus') {
    sendResponse(getVideoCaptureStatus());
  }
  if (msg.type === 'vcRectSelected') {
    handleVcRectSelected(msg.rect, msg.innerWidth, msg.innerHeight);
  }
  if (msg.type === 'vcRectCancelled') {
    abortVideoCapture();
  }
  if (msg.type === 'vcStopClicked') {
    finishVideoCapture();
  }
});
