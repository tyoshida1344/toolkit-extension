/**
 * annotation-overlay.js — 動画上の注釈オーバーレイ制御
 *
 * 共有エディタと区間レーンを結び、再生中は rAF でフレームへ追従する。シークや動画要素の
 * 入れ替えでも即時反映するため、player の通知も併用する。
 */
function createVideoAnnotationOverlay({ videoElA, videoElB, canvas, canvasWrap, duration, player, laneEl, playBtn, pauseBtn, startBtn, endBtn, onChange }) {
  canvas.width = player.getEl().videoWidth;
  canvas.height = player.getEl().videoHeight;
  let lanes;
  let raf = null;
  let lastTime = -1;
  let annotationMode = false;
  let previewing = false;
  const toolbarEl = document.getElementById('ann-toolbar');

  const editor = createAnnotationEditor(canvas, canvasWrap, null, {
    getTime: () => player.getEl().currentTime,
    newRange: time => {
      const endTime = Math.min(time + 3, duration);
      return {
        startTime: Math.max(0, Math.min(time, endTime - VIDEO_ANNOTATION_MIN_RANGE)),
        endTime,
      };
    },
    onChange: () => {
      const lanesRebuilt = lanes && lanes.sync();
      updateButtons();
      if (lanesRebuilt) onChange();
    },
  });

  lanes = createVideoAnnotationLanes({
    laneEl, duration, editor,
    getTime: () => player.getEl().currentTime,
    seekTo: player.seekTo,
    isEditable: () => annotationMode && !previewing,
  });

  function updateButtons() {
    const disabled = previewing || editor.getSelectedId() == null;
    playBtn.disabled = previewing;
    pauseBtn.disabled = !previewing;
    startBtn.disabled = disabled;
    endBtn.disabled = disabled;
  }

  function applyLockState() {
    const editable = annotationMode && !previewing;
    editor.setActive(editable);
    canvas.style.pointerEvents = editable ? 'auto' : 'none';
    toolbarEl.classList.toggle('vp-ann-locked', !editable);
    toolbarEl.querySelectorAll('button, input').forEach(el => { el.disabled = !editable; });
    laneEl.classList.toggle('vp-ann-lanes--editable', editable);
    lanes.updatePositions();
    updateButtons();
  }

  function refresh() {
    player.getEl().controls = false; // swap() が controls を有効に戻すため毎回打ち消す
    editor.refresh();
  }

  function tick() {
    const time = player.getEl().currentTime;
    if (time !== lastTime) { lastTime = time; refresh(); }
    if (!player.getEl().paused) raf = requestAnimationFrame(tick);
  }

  function startTicking() {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(tick);
  }

  function setMode(active) {
    const video = player.getEl();
    annotationMode = active;
    applyLockState();
    video.controls = false; // 独自のタイムラインと再生ボタンで操作するため常に隠す
    if (active) video.pause();
    refresh();
  }

  [videoElA, videoElB].forEach(video => {
    video.addEventListener('play', () => {
      if (annotationMode && !previewing) {
        video.pause();
        video.controls = false;
        return;
      }
      startTicking();
    });
    const stopTicking = () => {
      if (video !== player.getEl()) return;
      cancelAnimationFrame(raf);
      if (!previewing) return;
      previewing = false;
      if (annotationMode) applyLockState();
      else updateButtons();
    };
    video.addEventListener('pause', stopTicking);
    video.addEventListener('ended', stopTicking);
  });
  player.onTick(refresh);
  player.onSeeked(refresh);
  playBtn.addEventListener('click', () => {
    previewing = true;
    applyLockState();
    player.getEl().play();
  });
  pauseBtn.addEventListener('click', () => {
    player.getEl().pause();
  });
  startBtn.addEventListener('click', () => lanes.setStart(editor.getSelectedId()));
  endBtn.addEventListener('click', () => lanes.setEnd(editor.getSelectedId()));
  lanes.render();
  updateButtons();
  setMode(false);

  return {
    getShapes: editor.getShapes,
    clear: editor.clear,
    refresh,
    setMode,
  };
}
