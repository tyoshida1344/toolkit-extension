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

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('画像の読み込みに失敗しました'));
    image.src = src;
  });
}

(async () => {
  const canvas = document.getElementById('sp-canvas');
  const canvasWrap = document.getElementById('ann-canvas-wrap');
  const annToolbar = document.getElementById('ann-toolbar');
  const saveBtn = document.getElementById('sp-save');
  const copyBtn = document.getElementById('sp-copy');
  const formatEl = document.getElementById('sp-format');
  const warningEl = document.getElementById('sp-warning');
  const statusEl = document.getElementById('sp-status');

  const data = await chrome.storage.session.get('tm_screenshot_pending');
  chrome.storage.session.remove('tm_screenshot_pending');
  const pending = data.tm_screenshot_pending;

  if (!pending || !pending.dataUrl) {
    statusEl.textContent = '⚠ プレビューを読み込めませんでした。ポップアップから撮影しなおしてください。';
    saveBtn.disabled = true;
    copyBtn.disabled = true;
    return;
  }

  let baseImage;
  try {
    baseImage = await loadImage(pending.dataUrl);
  } catch (e) {
    statusEl.textContent = '⚠ プレビューを読み込めませんでした。ポップアップから撮影しなおしてください。';
    saveBtn.disabled = true;
    copyBtn.disabled = true;
    return;
  }

  canvas.width = baseImage.naturalWidth;
  canvas.height = baseImage.naturalHeight;
  canvas.hidden = false;
  annToolbar.hidden = false;
  if (pending.truncated) warningEl.hidden = false;

  const editor = createAnnotationEditor(canvas, canvasWrap, baseImage);

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
      const outUrl = await convertPngDataUrl(editor.getExportDataUrl(), format);
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

  copyBtn.addEventListener('click', async () => {
    copyBtn.disabled = true;
    try {
      // クリップボードへの画像書き込みは実質 PNG のみ安定して動作するため、選択中の保存形式に関わらず PNG（注釈込み）をコピーする
      const blob = await editor.getExportBlob();
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      _TkUtils.showToast('📋 クリップボードにコピーしました');
      statusEl.textContent = 'スプレッドシートのセルで貼り付け（Ctrl+V / Cmd+V）できます';
    } catch (e) {
      _TkUtils.showToast('⚠ コピーに失敗しました（' + ((e && e.message) || e) + '）');
    } finally {
      copyBtn.disabled = false;
    }
  });
})();
