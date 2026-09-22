(async () => {
  const videoElA = document.getElementById('vp-video');
  const videoElB = document.getElementById('vp-video-b');
  const formatEl = document.getElementById('vp-format');
  const actionsEl = document.getElementById('vp-actions');
  const saveBtn = document.getElementById('vp-save');
  const statusEl = document.getElementById('vp-status');
  const trimEl = document.getElementById('vp-trim');
  let annotation = null;

  // 編集モード切替タブ。注釈編集など今後のモードをタブ + #vp-mode-<mode> パネルの組で
  // 追加できるよう汎用的に配線しておく
  document.querySelectorAll('.vp-mode-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.vp-mode-tab').forEach(t => t.classList.toggle('active', t === tab));
      document.querySelectorAll('.vp-mode-panel').forEach(p => { p.hidden = p.id !== `vp-mode-${tab.dataset.mode}`; });
      if (annotation) annotation.setMode(tab.dataset.mode === 'annotation');
    });
  });
  // アイコンは ui-helpers.js の _TkUI.ICONS（他機能とも共有する SVG 置き場）から流用する
  document.getElementById('vp-mode-tab-speed').insertAdjacentHTML('afterbegin', _TkUI.ICONS.speed);
  document.getElementById('vp-mode-tab-annotation').insertAdjacentHTML('afterbegin', _TkUI.ICONS.bubble);

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
      rulerEl: document.getElementById('vp-timeline-ruler'),
      playheadEl: document.getElementById('vp-timeline-playhead'),
      splitIconEl: document.getElementById('vp-timeline-split-icon'),
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
      extraWidthEls: [document.getElementById('vp-annotation-lanes')],
      extraEdits: {
        isEdited: () => !!annotation && annotation.getShapes().length > 0,
        reset: () => annotation && annotation.clear(),
      },
    });
    annotation = createVideoAnnotationOverlay({
      videoElA,
      videoElB,
      canvas: document.getElementById('vp-annotation-canvas'),
      canvasWrap: document.getElementById('vp-video-wrap'),
      duration: videoElA.duration,
      player: timeline.player,
      laneEl: document.getElementById('vp-annotation-lanes'),
      previewBtn: document.getElementById('vp-ann-preview'),
      startBtn: document.getElementById('vp-ann-start'),
      endBtn: document.getElementById('vp-ann-end'),
      onChange: timeline.refreshUi,
    });
  });

  // 書き出し中は裏でタイムラインの編集ができてしまうと、書き出し済みの内容と食い違って
  // 混乱するため、オーバーレイ付きモーダルでページ全体の操作を塞ぐ（閉じるボタン・Escでは
  // 閉じられない。完了/失敗時に自動で消える）
  const exportModalEl = document.getElementById('vp-export-modal');
  const exportModalTextEl = document.getElementById('vp-export-modal-text');

  saveBtn.addEventListener('click', async () => {
    const f = formats.find(x => x.key === formatEl.value);
    if (!f) return;
    const clips = timeline ? timeline.getClips() : [{ start: 0, end: videoElA.duration, speed: 1 }];
    const shapes = annotation ? annotation.getShapes() : [];
    const isEdited = timeline ? timeline.isEdited() : false;

    let outBlob = f.blob;
    const filename = `${record.baseName}.${f.key}`;

    if (isEdited) {
      saveBtn.disabled = true;
      exportModalEl.hidden = false;
      const setProgress = p => {
        const text = `書き出し中… ${Math.round(p * 100)}%`;
        exportModalTextEl.innerHTML = '<span class="vp-spinner"></span>' + text;
        statusEl.textContent = text;
      };
      setProgress(0);
      try {
        outBlob = await exportTrimmedVideo({
          blob: f.blob, mimeType: f.mimeType, clips,
          annotations: shapes,
          onProgress: setProgress,
        });
      } catch (e) {
        statusEl.textContent = '⚠ 書き出しに失敗しました（' + ((e && e.message) || e) + '）';
        exportModalEl.hidden = true;
        saveBtn.disabled = false;
        return;
      }
      exportModalEl.hidden = true;
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
