function sanitizeFolder(name) {
  return (name || '')
    .split('/')
    .map(part => part.replace(/[\\:*?"<>|]/g, '_').trim())
    .filter(part => part && part !== '.' && part !== '..')
    .join('/')
    .slice(0, 100);
}

(async () => {
  const img = document.getElementById('sp-img');
  const saveBtn = document.getElementById('sp-save');
  const warningEl = document.getElementById('sp-warning');
  const statusEl = document.getElementById('sp-status');

  const data = await chrome.storage.session.get('tm_screenshot_pending');
  chrome.storage.session.remove('tm_screenshot_pending');
  const pending = data.tm_screenshot_pending;

  if (!pending || !pending.dataUrl) {
    statusEl.textContent = '⚠ プレビューを読み込めませんでした。ポップアップから撮影しなおしてください。';
    saveBtn.disabled = true;
    return;
  }

  img.src = pending.dataUrl;
  img.hidden = false;
  document.title = pending.filename;
  statusEl.textContent = pending.filename;
  if (pending.truncated) warningEl.hidden = false;

  saveBtn.addEventListener('click', () => {
    saveBtn.disabled = true;
    chrome.storage.local.get('tm_state_screenshot', data => {
      const folder = sanitizeFolder(data.tm_state_screenshot && data.tm_state_screenshot.folder);
      const path = folder ? `${folder}/${pending.filename}` : pending.filename;
      chrome.downloads.download({ url: pending.dataUrl, filename: path, saveAs: false }, id => {
        saveBtn.disabled = false;
        if (chrome.runtime.lastError || id == null) {
          statusEl.textContent = '⚠ 保存に失敗しました（' + ((chrome.runtime.lastError && chrome.runtime.lastError.message) || 'unknown error') + '）';
          return;
        }
        statusEl.textContent = pending.filename + ' を保存しました';
      });
    });
  });
})();
