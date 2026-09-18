/**
 * trim-timeline.js — プレビュー画面のトリム範囲タイムラインUI
 *
 * 動画の下に「保持する範囲」をハイライト表示するタイムラインを描画し、
 * 両端ハンドルのドラッグでの微調整、「開始/終了点に」ボタンでの現在位置切断（Filmora等のNLEに近い操作感）、
 * タイムラインクリックでのシークを提供する。再生はトリム終了位置で自動的に一時停止する。
 */
function createTrimTimeline({
  videoEl, timelineEl, selectedEl, startHandleEl, endHandleEl, playheadEl,
  startLabelEl, endLabelEl, durationLabelEl, startBtn, endBtn, resetBtn, duration,
}) {
  const MIN_GAP = 0.2; // 最小トリム長（秒）。これ未満には縮められない
  let start = 0, end = duration;

  function render() {
    const leftPct = (start / duration) * 100;
    const widthPct = ((end - start) / duration) * 100;
    selectedEl.style.left = leftPct + '%';
    selectedEl.style.width = widthPct + '%';
    startHandleEl.style.left = leftPct + '%';
    endHandleEl.style.left = (leftPct + widthPct) + '%';
    startLabelEl.textContent = formatMmSs(start);
    endLabelEl.textContent = formatMmSs(end);
    durationLabelEl.textContent = '尺 ' + formatMmSs(end - start);
    startHandleEl.setAttribute('aria-valuemin', '0');
    startHandleEl.setAttribute('aria-valuemax', String(duration));
    startHandleEl.setAttribute('aria-valuenow', String(start));
    endHandleEl.setAttribute('aria-valuemin', '0');
    endHandleEl.setAttribute('aria-valuemax', String(duration));
    endHandleEl.setAttribute('aria-valuenow', String(end));
  }

  function renderPlayhead() {
    playheadEl.style.left = (videoEl.currentTime / duration) * 100 + '%';
  }

  function setRange(newStart, newEnd, edge) {
    newStart = Math.min(Math.max(0, newStart), duration);
    newEnd = Math.min(Math.max(0, newEnd), duration);
    if (newEnd - newStart < MIN_GAP) {
      if (edge === 'start') newStart = newEnd - MIN_GAP;
      else newEnd = newStart + MIN_GAP;
    }
    start = Math.max(0, newStart);
    end = Math.min(duration, newEnd);
    render();
  }

  function posToTime(clientX) {
    const rect = timelineEl.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    return ratio * duration;
  }

  let dragging = null; // 'start' | 'end' | null
  function onMove(e) {
    if (!dragging) return;
    const t = posToTime(e.clientX);
    if (dragging === 'start') setRange(t, end, 'start');
    else setRange(start, t, 'end');
  }
  function onUp() { dragging = null; }

  startHandleEl.addEventListener('mousedown', e => { e.preventDefault(); dragging = 'start'; });
  endHandleEl.addEventListener('mousedown', e => { e.preventDefault(); dragging = 'end'; });
  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup', onUp);

  const NUDGE_STEP = 0.5; // 矢印キーでの移動幅（秒）
  function onHandleKey(edge) {
    return e => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      e.preventDefault();
      const delta = e.key === 'ArrowRight' ? NUDGE_STEP : -NUDGE_STEP;
      if (edge === 'start') setRange(start + delta, end, 'start');
      else setRange(start, end + delta, 'end');
    };
  }
  startHandleEl.addEventListener('keydown', onHandleKey('start'));
  endHandleEl.addEventListener('keydown', onHandleKey('end'));

  timelineEl.addEventListener('click', e => {
    if (dragging) return;
    videoEl.currentTime = posToTime(e.clientX);
  });

  startBtn.addEventListener('click', () => setRange(videoEl.currentTime, end, 'start'));
  endBtn.addEventListener('click', () => setRange(start, videoEl.currentTime, 'end'));
  resetBtn.addEventListener('click', () => setRange(0, duration));

  videoEl.addEventListener('timeupdate', () => {
    renderPlayhead();
    if (!videoEl.paused && videoEl.currentTime >= end) videoEl.pause();
  });

  render();
  renderPlayhead();

  return {
    getRange: () => ({ start, end }),
  };
}
