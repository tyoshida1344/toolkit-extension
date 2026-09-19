(async () => {
  const videoElA = document.getElementById('vp-video');
  const videoElB = document.getElementById('vp-video-b');
  const formatEl = document.getElementById('vp-format');
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
  formatEl.hidden = formats.length < 2;

  let currentUrl = null;
  let timeline = null;

  function showFormat(key) {
    const f = formats.find(x => x.key === key);
    if (!f) return;
    if (currentUrl) URL.revokeObjectURL(currentUrl);
    currentUrl = URL.createObjectURL(f.blob);
    if (timeline) timeline.setSource(currentUrl);
    else videoElA.src = currentUrl;
    videoElA.hidden = false;
    const name = `${record.baseName}.${f.key}`;
    document.title = name;
    statusEl.textContent = name;
  }

  formatEl.value = formats[0].key;
  showFormat(formats[0].key);
  formatEl.addEventListener('change', () => showFormat(formatEl.value));

  videoElA.addEventListener('loadedmetadata', () => {
    if (timeline) return;
    trimEl.hidden = false;
    timeline = createTrimTimeline({
      videoElA,
      videoElB,
      timelineEl: document.getElementById('vp-timeline'),
      timelineViewportEl: document.getElementById('vp-timeline-viewport'),
      playheadEl: document.getElementById('vp-timeline-playhead'),
      splitIconEl: document.getElementById('vp-timeline-split-icon'),
      startLabelEl: document.getElementById('vp-trim-start-label'),
      endLabelEl: document.getElementById('vp-trim-end-label'),
      durationLabelEl: document.getElementById('vp-trim-duration-label'),
      restartBtn: document.getElementById('vp-trim-restart'),
      startBtn: document.getElementById('vp-trim-start-btn'),
      endBtn: document.getElementById('vp-trim-end-btn'),
      splitBtn: document.getElementById('vp-trim-split'),
      deleteBtn: document.getElementById('vp-trim-delete'),
      resetBtn: document.getElementById('vp-trim-reset'),
      speedEl: document.getElementById('vp-speed'),
      zoomInBtn: document.getElementById('vp-timeline-zoom-in'),
      zoomOutBtn: document.getElementById('vp-timeline-zoom-out'),
      duration: videoElA.duration,
    });
  });

  saveBtn.addEventListener('click', async () => {
    const f = formats.find(x => x.key === formatEl.value);
    if (!f) return;
    const clips = timeline ? timeline.getClips() : [{ start: 0, end: videoElA.duration, speed: 1 }];
    const isEdited = timeline ? timeline.isEdited() : false;

    let outBlob = f.blob;
    const filename = `${record.baseName}.${f.key}`;

    if (isEdited) {
      saveBtn.disabled = true;
      statusEl.textContent = '書き出し中… 0%';
      try {
        outBlob = await exportTrimmedVideo({
          blob: f.blob, mimeType: f.mimeType, clips,
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
