importScripts('modules/screenshot/worker.js');

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
    runCaptureAndOpenPreview(msg.tabId, msg.mode)
      .then(() => sendResponse({ ok: true }))
      .catch(e => sendResponse({ ok: false, error: String((e && e.message) || e) }));
    return true;
  }
});
