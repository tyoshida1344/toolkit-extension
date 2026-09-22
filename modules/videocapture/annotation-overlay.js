/**
 * annotation-overlay.js — 動画上の注釈オーバーレイ制御
 *
 * 共有エディタと区間レーンを結び、再生中は rAF でフレームへ追従する。シークや動画要素の
 * 入れ替えでも即時反映するため、player の通知も併用する。
 */
function createVideoAnnotationOverlay({ videoElA, videoElB, canvas, canvasWrap, duration, player, laneEl, startBtn, endBtn, onChange }) {
  canvas.width = player.getEl().videoWidth;
  canvas.height = player.getEl().videoHeight;
  let lanes;
  let raf = null;
  let lastTime = -1;
  let annotationMode = false;

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
    isEditable: () => annotationMode,
  });

  function updateButtons() {
    const disabled = editor.getSelectedId() == null;
    startBtn.disabled = disabled;
    endBtn.disabled = disabled;
  }

  function refresh() {
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
    editor.setActive(active);
    canvas.style.pointerEvents = active ? 'auto' : 'none';
    laneEl.classList.toggle('vp-ann-lanes--editable', active);
    if (active) {
      video.pause();
      video.controls = false;
    } else {
      video.controls = true;
    }
    refresh();
  }

  [videoElA, videoElB].forEach(video => {
    video.addEventListener('play', () => {
      if (annotationMode) {
        video.pause();
        video.controls = false;
        return;
      }
      startTicking();
    });
    const stopTicking = () => { if (video === player.getEl()) cancelAnimationFrame(raf); };
    video.addEventListener('pause', stopTicking);
    video.addEventListener('ended', stopTicking);
  });
  player.onTick(refresh);
  player.onSeeked(refresh);
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
