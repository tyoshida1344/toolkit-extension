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
    const a = document.createElement('a');
    a.href = pending.dataUrl;
    a.download = pending.filename;
    a.click();
  });
})();
