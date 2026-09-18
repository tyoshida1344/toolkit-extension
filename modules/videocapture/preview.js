(async () => {
  const videoEl = document.getElementById('vp-video');
  const formatEl = document.getElementById('vp-format');
  const speedEl = document.getElementById('vp-speed');
  const actionsEl = document.getElementById('vp-actions');
  const saveBtn = document.getElementById('vp-save');
  const statusEl = document.getElementById('vp-status');
  const trimEl = document.getElementById('vp-trim');

  const id = new URLSearchParams(location.search).get('id');
  const record = id && await TkVideoBlobStore.takeAndDelete(id);

  if (!record || (!record.mp4 && !record.webm)) {
    statusEl.textContent = '⚠ 動画を読み込めませんでした。録画しなおしてください。';
    actionsEl.hidden = true;
    return;
  }

  const formats = [];
  if (record.mp4) formats.push({ key: 'mp4', label: 'MP4', blob: record.mp4, mimeType: record.mp4Type });
  if (record.webm) formats.push({ key: 'webm', label: 'WebM', blob: record.webm, mimeType: record.webmType });
  formats.forEach(f => {
    const opt = document.createElement('option');
    opt.value = f.key;
    opt.textContent = f.label;
    formatEl.appendChild(opt);
  });
  formatEl.hidden = formats.length < 2; // 対応形式が1つしか無い場合は切替UI自体を出さない

  let currentUrl = null;
  let timeline = null;

  function showFormat(key) {
    const f = formats.find(x => x.key === key);
    if (!f) return;
    if (currentUrl) URL.revokeObjectURL(currentUrl);
    currentUrl = URL.createObjectURL(f.blob);
    videoEl.src = currentUrl;
    videoEl.hidden = false;
    videoEl.playbackRate = parseFloat(speedEl.value);
    const name = `${record.baseName}.${f.key}`;
    document.title = name;
    statusEl.textContent = name;
  }

  formatEl.value = formats[0].key;
  showFormat(formats[0].key);
  formatEl.addEventListener('change', () => showFormat(formatEl.value));
  speedEl.addEventListener('change', () => { videoEl.playbackRate = parseFloat(speedEl.value); });

  // フォーマット切替のたびに loadedmetadata は発火するが、トリム範囲は保持したいので初回のみ構築する
  videoEl.addEventListener('loadedmetadata', () => {
    if (timeline) return;
    trimEl.hidden = false;
    timeline = createTrimTimeline({
      videoEl,
      timelineEl: document.getElementById('vp-timeline'),
      selectedEl: document.getElementById('vp-timeline-selected'),
      startHandleEl: document.getElementById('vp-timeline-handle-start'),
      endHandleEl: document.getElementById('vp-timeline-handle-end'),
      playheadEl: document.getElementById('vp-timeline-playhead'),
      startLabelEl: document.getElementById('vp-trim-start-label'),
      endLabelEl: document.getElementById('vp-trim-end-label'),
      durationLabelEl: document.getElementById('vp-trim-duration-label'),
      startBtn: document.getElementById('vp-trim-start-btn'),
      endBtn: document.getElementById('vp-trim-end-btn'),
      resetBtn: document.getElementById('vp-trim-reset'),
      duration: videoEl.duration,
    });
  });

  saveBtn.addEventListener('click', async () => {
    const f = formats.find(x => x.key === formatEl.value);
    if (!f) return;
    const speed = parseFloat(speedEl.value);
    const range = timeline ? timeline.getRange() : { start: 0, end: videoEl.duration };
    const isEdited = speed !== 1 || range.start > 0.01 || range.end < videoEl.duration - 0.01;

    let outBlob = f.blob;
    const filename = `${record.baseName}.${f.key}`;

    if (isEdited) {
      saveBtn.disabled = true;
      statusEl.textContent = '書き出し中… 0%';
      try {
        outBlob = await exportTrimmedVideo({
          blob: f.blob, mimeType: f.mimeType, start: range.start, end: range.end, speed,
          onProgress: p => { statusEl.textContent = `書き出し中… ${Math.round(p * 100)}%`; },
        });
      } catch (e) {
        statusEl.textContent = '⚠ 書き出しに失敗しました（' + ((e && e.message) || e) + '）';
        saveBtn.disabled = false;
        return;
      }
      saveBtn.disabled = false;
    }

    const url = URL.createObjectURL(outBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    statusEl.textContent = `${filename} を保存しました`;
  });
})();
