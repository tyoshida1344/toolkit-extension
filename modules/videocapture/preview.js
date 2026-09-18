(async () => {
  const videoEl = document.getElementById('vp-video');
  const formatEl = document.getElementById('vp-format');
  const actionsEl = document.getElementById('vp-actions');
  const saveBtn = document.getElementById('vp-save');
  const statusEl = document.getElementById('vp-status');

  const id = new URLSearchParams(location.search).get('id');
  const record = id && await TkVideoBlobStore.takeAndDelete(id);

  if (!record || (!record.mp4 && !record.webm)) {
    statusEl.textContent = '⚠ 動画を読み込めませんでした。録画しなおしてください。';
    actionsEl.hidden = true;
    return;
  }

  const formats = [];
  if (record.mp4) formats.push({ key: 'mp4', label: 'MP4', blob: record.mp4 });
  if (record.webm) formats.push({ key: 'webm', label: 'WebM', blob: record.webm });
  formats.forEach(f => {
    const opt = document.createElement('option');
    opt.value = f.key;
    opt.textContent = f.label;
    formatEl.appendChild(opt);
  });
  formatEl.hidden = formats.length < 2; // 対応形式が1つしか無い場合は切替UI自体を出さない

  let currentUrl = null;
  function showFormat(key) {
    const f = formats.find(x => x.key === key);
    if (!f) return;
    if (currentUrl) URL.revokeObjectURL(currentUrl);
    currentUrl = URL.createObjectURL(f.blob);
    videoEl.src = currentUrl;
    videoEl.hidden = false;
    const name = `${record.baseName}.${f.key}`;
    document.title = name;
    statusEl.textContent = name;
  }

  formatEl.value = formats[0].key;
  showFormat(formats[0].key);
  formatEl.addEventListener('change', () => showFormat(formatEl.value));

  saveBtn.addEventListener('click', () => {
    const f = formats.find(x => x.key === formatEl.value);
    if (!f) return;
    const filename = `${record.baseName}.${f.key}`;
    const url = URL.createObjectURL(f.blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    statusEl.textContent = `${filename} を保存しました`;
  });
})();
