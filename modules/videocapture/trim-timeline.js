/**
 * trim-timeline.js — プレビュー画面の複数クリップ編集タイムラインの操作ロジック
 *
 * clip-model.js が持つ「残すクリップ」の配列を、両端ハンドルのドラッグ／「開始・終了点に」
 * ボタンでのクリップ範囲調整、「ここで分割」での中間カット、クリップ削除、クリップ単位の
 * 速度変更で編集する。DOM描画は timeline-render.js、再生・カット区間の自動スキップは
 * dual-video-player.js が担う。
 *
 * 「編集対象クリップ」（editIndex）は、再生位置がシークされたときに切り替わる。タイムライン上の
 * クリックは常にシークを優先し（クリップ選択を別扱いにすると、クリップがタイムラインの
 * ほぼ全域を占めるためシーク＝タイムラインのクリックがほぼ機能しなくなってしまう）、
 * 結果としてクリックした位置のクリップが編集対象になる。再生中の自動的なクリップ送りは
 * 対象にしない（再生に合わせて選択がちらつくのを防ぐため。カット地点を通過した際は
 * seek 相当として追従する）。
 */
function createTrimTimeline({
  videoElA, videoElB, timelineEl, playheadEl, splitIconEl,
  startLabelEl, endLabelEl, durationLabelEl,
  startBtn, endBtn, splitBtn, deleteBtn, resetBtn, speedEl, duration,
}) {
  const model = createClipModel(duration);
  const player = createDualVideoPlayer(videoElA, videoElB, model);
  const { render, updatePositions } = createTimelineRenderer({ timelineEl, duration, model });
  let editIndex = 0;
  let dragging = null; // ドラッグ中の .vp-timeline-handle 要素 | null

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

  const GRAB_RADIUS_PX = 14; // ハンドル中心からこの距離（px）以内ならクリック/ドラッグ開始とみなす
  // クリップ矩形（.vp-timeline-selected）とハンドルが同じ座標に重なる場面があり、DOM の
  // e.target ベースの当たり判定だとブラウザ側のヒットテストで意図せず矩形側が優先されることが
  // あるため使わず、クリック位置とハンドル中心の距離で判定する（見た目より広い掴みやすさも兼ねる）
  function findHandleNear(clientX) {
    const rect = timelineEl.getBoundingClientRect();
    let closest = null, closestDist = Infinity;
    timelineEl.querySelectorAll('.vp-timeline-handle').forEach(handle => {
      const centerX = rect.left + (parseFloat(handle.style.left) / 100) * rect.width;
      const dist = Math.abs(clientX - centerX);
      if (dist <= GRAB_RADIUS_PX && dist < closestDist) { closest = handle; closestDist = dist; }
    });
    return closest;
  }

  function handleValue(handle) {
    if (handle.dataset.type === 'split') return model.getClips()[Number(handle.dataset.left)].end;
    const clip = model.getClips()[Number(handle.dataset.clip)];
    return handle.dataset.edge === 'start' ? clip.start : clip.end;
  }

  // このハンドルが担う境界の boundary index（clips[i] と clips[i+1] の間）。
  // 分割ハンドルはそのまま、端ハンドルは隣接クリップとの境界を指す（先頭/末尾側は隣接クリップがないため常に接触判定なし）
  function boundaryIndexOf(handle) {
    if (handle.dataset.type === 'split') return Number(handle.dataset.left);
    const clipIndex = Number(handle.dataset.clip);
    return handle.dataset.edge === 'end' ? clipIndex : clipIndex - 1;
  }

  function applyHandleMove(handle, t) {
    if (handle.dataset.type === 'split') {
      const leftIndex = Number(handle.dataset.left);
      model.moveBoundary(leftIndex, t);
      editIndex = leftIndex;
    } else {
      const i = Number(handle.dataset.clip), edge = handle.dataset.edge;
      const clip = model.getClips()[i];
      if (edge === 'start') model.setRange(i, t, clip.end);
      else model.setRange(i, clip.start, t);
      editIndex = i;
    }
  }

  timelineEl.addEventListener('mousedown', e => {
    const handle = findHandleNear(e.clientX);
    if (!handle) return;
    e.preventDefault();
    dragging = handle;
    document.body.style.cursor = 'grabbing';
  });
  document.addEventListener('mousemove', e => {
    if (!dragging) return;
    applyHandleMove(dragging, posToTime(e.clientX));
    refresh();
  });
  document.addEventListener('mouseup', () => {
    if (!dragging) return;
    dragging = null;
    document.body.style.cursor = '';
    render();
    refreshUi(); // 接触/分離の変化に応じてハンドル構成を作り直す
  });

  const NUDGE_STEP = 0.5; // 矢印キーでの移動幅（秒）
  timelineEl.addEventListener('keydown', e => {
    const handle = e.target.closest('.vp-timeline-handle');
    if (!handle || (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight')) return;
    e.preventDefault();
    const delta = e.key === 'ArrowRight' ? NUDGE_STEP : -NUDGE_STEP;
    applyHandleMove(handle, handleValue(handle) + delta);
    // 接触状態が変わった場合のみハンドル構成を作り直す。それ以外は位置だけ更新してフォーカスを保つ
    if (handle.dataset.type !== 'split' && model.isTouching(boundaryIndexOf(handle))) {
      render();
      refreshUi();
    } else {
      refresh();
    }
  });

  // クリップ矩形（.vp-timeline-selected）は選択用に別枠で扱わず、タイムライン上のクリックは
  // ハンドル・分割アイコン以外なら常にシークを優先する（シーク後の編集対象クリップの追従は
  // player.onSeeked(resyncToCurrentTime) が行う）
  timelineEl.addEventListener('click', e => {
    if (dragging || findHandleNear(e.clientX)) return;
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
