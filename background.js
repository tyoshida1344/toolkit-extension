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
    captureScreenshot(msg.tabId, msg.mode)
      .then(async ({ dataUrl, baseName, truncated }) => {
        await chrome.storage.session.set({ tm_screenshot_pending: { dataUrl, baseName, truncated } });
        await chrome.tabs.create({ url: chrome.runtime.getURL('screenshot-preview.html') });
        sendResponse({ ok: true });
      })
      .catch(e => sendResponse({ ok: false, error: String((e && e.message) || e) }));
    return true;
  }
});
