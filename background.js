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
});
