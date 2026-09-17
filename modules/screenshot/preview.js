async function convertPngDataUrl(dataUrl, format) {
  if (format === 'png') return dataUrl;
  const blob = await (await fetch(dataUrl)).blob();
  const bitmap = await createImageBitmap(blob);
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  canvas.getContext('2d').drawImage(bitmap, 0, 0);
  return canvas.toDataURL(`image/${format}`, 0.92);
}

function extFor(format) { return format === 'jpeg' ? 'jpg' : format; }

(async () => {
  const img = document.getElementById('sp-img');
  const saveBtn = document.getElementById('sp-save');
  const formatEl = document.getElementById('sp-format');
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
  if (pending.truncated) warningEl.hidden = false;

  function updateFilenamePreview() {
    const name = `${pending.baseName}.${extFor(formatEl.value)}`;
    document.title = name;
    statusEl.textContent = name;
  }
  updateFilenamePreview();
  formatEl.addEventListener('change', updateFilenamePreview);

  saveBtn.addEventListener('click', async () => {
    saveBtn.disabled = true;
    try {
      const format = formatEl.value;
      const outUrl = await convertPngDataUrl(pending.dataUrl, format);
      const filename = `${pending.baseName}.${extFor(format)}`;
      const a = document.createElement('a');
      a.href = outUrl;
      a.download = filename;
      a.click();
      statusEl.textContent = `${filename} を保存しました`;
    } catch (e) {
      statusEl.textContent = '⚠ 保存に失敗しました（' + ((e && e.message) || e) + '）';
    } finally {
      saveBtn.disabled = false;
    }
  });
})();
