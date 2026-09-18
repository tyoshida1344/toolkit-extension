/**
 * trim-timeline.js — プレビュー画面の複数クリップ編集タイムラインUI
 *
 * clip-model.js が持つ「残すクリップ」の配列を画面に描画し、両端ハンドルのドラッグ／
 * 「開始・終了点に」ボタンでのクリップ範囲調整、「ここで分割」での中間カット、クリップ削除、
 * クリップ単位の速度変更を提供する。再生・カット区間の自動スキップは dual-video-player.js が担う。
 *
 * 「編集対象クリップ」（editIndex）は、タイムライン上のクリップをクリックするか再生位置が
 * シークされたときに切り替わる。再生中の自動的なクリップ送りは対象にしない（再生に合わせて
 * 選択がちらつくのを防ぐため。カット地点を通過した際は seek 相当として追従する）。
 */
function createTrimTimeline({
  videoElA, videoElB, timelineEl, playheadEl, splitIconEl,
  startLabelEl, endLabelEl, durationLabelEl,
  startBtn, endBtn, splitBtn, deleteBtn, resetBtn, speedEl, duration,
}) {
  const model = createClipModel(duration);
  const player = createDualVideoPlayer(videoElA, videoElB, model);
  let editIndex = 0;
  let dragging = null; // { clipIndex, edge: 'start' | 'end' } | null

  function render() {
    timelineEl.querySelectorAll('.vp-timeline-selected, .vp-timeline-handle').forEach(el => el.remove());
    model.getClips().forEach((clip, i) => {
      const selected = document.createElement('div');
      selected.className = 'vp-timeline-selected';
      selected.dataset.clip = String(i);
      selected.style.left = (clip.start / duration * 100) + '%';
      selected.style.width = ((clip.end - clip.start) / duration * 100) + '%';
      timelineEl.appendChild(selected);

      [['start', clip.start], ['end', clip.end]].forEach(([edge, t]) => {
        const handle = document.createElement('div');
        handle.className = 'vp-timeline-handle';
        handle.dataset.clip = String(i);
        handle.dataset.edge = edge;
        handle.tabIndex = 0;
        handle.setAttribute('role', 'slider');
        handle.setAttribute('aria-label', `クリップ${i + 1} ${edge === 'start' ? '開始' : '終了'}位置`);
        handle.setAttribute('aria-valuemin', '0');
        handle.setAttribute('aria-valuemax', String(duration));
        handle.setAttribute('aria-valuenow', String(t));
        handle.style.left = (t / duration * 100) + '%';
        timelineEl.appendChild(handle);
      });
    });
  }

  // クリップ数が変わらない範囲調整（ドラッグ・矢印キー・開始/終了点にボタン）では、
  // DOM ノードを作り直さず既存要素の位置だけを更新する（render() はクリップ数が変わる操作でのみ使う）
  function updatePositions() {
    const clips = model.getClips();
    const selectedEls = timelineEl.querySelectorAll('.vp-timeline-selected');
    clips.forEach((clip, i) => {
      selectedEls[i].style.left = (clip.start / duration * 100) + '%';
      selectedEls[i].style.width = ((clip.end - clip.start) / duration * 100) + '%';
    });
    timelineEl.querySelectorAll('.vp-timeline-handle').forEach(handle => {
      const clip = clips[Number(handle.dataset.clip)];
      const t = handle.dataset.edge === 'start' ? clip.start : clip.end;
      handle.style.left = (t / duration * 100) + '%';
      handle.setAttribute('aria-valuenow', String(t));
    });
  }

  function renderPlayhead() {
    const pct = (player.getEl().currentTime / duration) * 100 + '%';
    playheadEl.style.left = pct;
    splitIconEl.style.left = pct;
  }

  function refreshUi() {
    const clips = model.getClips();
    const clip = clips[editIndex];
    startLabelEl.textContent = formatMmSs(clip.start);
    endLabelEl.textContent = formatMmSs(clip.end);
    const total = clips.reduce((sum, c) => sum + (c.end - c.start) / c.speed, 0);
    durationLabelEl.textContent = '合計 ' + formatMmSs(total);
    speedEl.value = String(clip.speed);
    deleteBtn.disabled = clips.length <= 1;
    splitBtn.disabled = !model.canSplitAt(player.getEl().currentTime);
    timelineEl.querySelectorAll('.vp-timeline-selected').forEach((el, i) => {
      el.classList.toggle('active', i === editIndex);
    });
  }

  function refresh() { updatePositions(); refreshUi(); }

  function resyncToCurrentTime() {
    const clips = model.getClips();
    editIndex = model.indexAt(player.getEl().currentTime);
    const clip = clips[editIndex];
    if (player.getEl().currentTime < clip.start) player.seekTo(clip.start);
    else if (player.getEl().currentTime > clip.end) player.seekTo(clip.end);
    player.getEl().playbackRate = clip.speed;
    refreshUi();
  }

  function posToTime(clientX) {
    const rect = timelineEl.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    return ratio * duration;
  }

  timelineEl.addEventListener('mousedown', e => {
    const handle = e.target.closest('.vp-timeline-handle');
    if (!handle) return;
    e.preventDefault();
    dragging = { clipIndex: Number(handle.dataset.clip), edge: handle.dataset.edge };
  });
  document.addEventListener('mousemove', e => {
    if (!dragging) return;
    const t = posToTime(e.clientX);
    const clip = model.getClips()[dragging.clipIndex];
    if (dragging.edge === 'start') model.setRange(dragging.clipIndex, t, clip.end);
    else model.setRange(dragging.clipIndex, clip.start, t);
    editIndex = dragging.clipIndex;
    refresh();
  });
  document.addEventListener('mouseup', () => { dragging = null; });

  const NUDGE_STEP = 0.5; // 矢印キーでの移動幅（秒）
  timelineEl.addEventListener('keydown', e => {
    const handle = e.target.closest('.vp-timeline-handle');
    if (!handle || (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight')) return;
    e.preventDefault();
    const i = Number(handle.dataset.clip), edge = handle.dataset.edge;
    const delta = e.key === 'ArrowRight' ? NUDGE_STEP : -NUDGE_STEP;
    const clip = model.getClips()[i];
    if (edge === 'start') model.setRange(i, clip.start + delta, clip.end);
    else model.setRange(i, clip.start, clip.end + delta);
    editIndex = i;
    refresh();
  });

  timelineEl.addEventListener('click', e => {
    if (dragging || e.target.closest('.vp-timeline-handle') || e.target.closest('.vp-timeline-split-icon')) return;
    const clipBlock = e.target.closest('.vp-timeline-selected');
    if (clipBlock) {
      editIndex = Number(clipBlock.dataset.clip);
      refreshUi();
      return;
    }
    player.seekTo(posToTime(e.clientX));
  });

  startBtn.addEventListener('click', () => {
    const clip = model.getClips()[editIndex];
    model.setRange(editIndex, player.getEl().currentTime, clip.end);
    refresh();
  });
  endBtn.addEventListener('click', () => {
    const clip = model.getClips()[editIndex];
    model.setRange(editIndex, clip.start, player.getEl().currentTime);
    refresh();
  });

  function splitAtPlayhead() {
    const idx = model.splitAt(player.getEl().currentTime);
    if (idx === -1) return;
    editIndex = idx;
    render();
    refreshUi();
  }
  splitBtn.addEventListener('click', splitAtPlayhead);
  splitIconEl.addEventListener('click', e => { e.stopPropagation(); splitAtPlayhead(); });
  splitIconEl.addEventListener('keydown', e => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault();
    splitAtPlayhead();
  });

  deleteBtn.addEventListener('click', () => {
    if (!model.removeAt(editIndex)) return;
    render();
    resyncToCurrentTime();
  });

  resetBtn.addEventListener('click', () => {
    model.reset();
    render();
    resyncToCurrentTime();
  });

  speedEl.addEventListener('change', () => {
    const speed = parseFloat(speedEl.value);
    model.setSpeed(editIndex, speed);
    if (model.indexAt(player.getEl().currentTime) === editIndex) player.getEl().playbackRate = speed;
    refreshUi();
  });

  player.onTick(renderPlayhead);
  player.onSeeked(resyncToCurrentTime);

  render();
  resyncToCurrentTime();
  renderPlayhead();

  return {
    getClips: model.getClips,
    isEdited: model.isEdited,
    setSource: url => player.setSource(url),
  };
}
