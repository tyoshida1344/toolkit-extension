/**
 * timeline-render.js — トリムタイムラインのクリップ矩形・ハンドルのDOM描画
 *
 * クリップ間に隙間がなく接している場合、両端ハンドルを別々に出さず、双方を同時に動かす
 * 1本の「分割位置」ハンドル（.vp-timeline-split-handle）にまとめる。
 * 別々のハンドルのままだと同じ座標に重なって掴みにくく、動かしても隣のクリップの端が
 * 追従しないため隙間や重なりが生まれてしまう（trim-timeline.js 側の操作ロジックが対処する）。
 */
function createTimelineRenderer({ timelineEl, duration, model }) {
  function createEdgeHandle(clipIndex, edge, t) {
    const handle = document.createElement('div');
    handle.className = 'vp-timeline-handle';
    handle.dataset.type = 'edge';
    handle.dataset.clip = String(clipIndex);
    handle.dataset.edge = edge;
    handle.tabIndex = 0;
    handle.setAttribute('role', 'slider');
    handle.setAttribute('aria-label', `クリップ${clipIndex + 1} ${edge === 'start' ? '開始' : '終了'}位置`);
    handle.setAttribute('aria-valuemin', '0');
    handle.setAttribute('aria-valuemax', String(duration));
    handle.setAttribute('aria-valuenow', String(t));
    handle.style.left = (t / duration * 100) + '%';
    return handle;
  }

  function createSplitHandle(leftIndex, t) {
    const handle = document.createElement('div');
    handle.className = 'vp-timeline-handle vp-timeline-split-handle';
    handle.dataset.type = 'split';
    handle.dataset.left = String(leftIndex);
    handle.tabIndex = 0;
    handle.setAttribute('role', 'slider');
    handle.setAttribute('aria-label', `クリップ${leftIndex + 1}と${leftIndex + 2}の分割位置`);
    handle.setAttribute('aria-valuemin', '0');
    handle.setAttribute('aria-valuemax', String(duration));
    handle.setAttribute('aria-valuenow', String(t));
    handle.style.left = (t / duration * 100) + '%';
    return handle;
  }

  function render() {
    timelineEl.querySelectorAll('.vp-timeline-selected, .vp-timeline-handle').forEach(el => el.remove());
    const clips = model.getClips();
    clips.forEach((clip, i) => {
      const selected = document.createElement('div');
      selected.className = 'vp-timeline-selected';
      selected.dataset.clip = String(i);
      selected.style.left = (clip.start / duration * 100) + '%';
      selected.style.width = ((clip.end - clip.start) / duration * 100) + '%';
      timelineEl.appendChild(selected);
    });

    timelineEl.appendChild(createEdgeHandle(0, 'start', clips[0].start));
    for (let i = 0; i < clips.length - 1; i++) {
      if (model.isTouching(i)) {
        timelineEl.appendChild(createSplitHandle(i, clips[i].end));
      } else {
        timelineEl.appendChild(createEdgeHandle(i, 'end', clips[i].end));
        timelineEl.appendChild(createEdgeHandle(i + 1, 'start', clips[i + 1].start));
      }
    }
    const last = clips.length - 1;
    timelineEl.appendChild(createEdgeHandle(last, 'end', clips[last].end));
  }

  // クリップ数・ハンドル構成が変わらない範囲調整（ドラッグ・矢印キー・開始/終了点にボタン）では、
  // DOM ノードを作り直さず既存要素の位置だけを更新する（render() はそれらが変わる操作でのみ使う）
  function updatePositions() {
    const clips = model.getClips();
    const selectedEls = timelineEl.querySelectorAll('.vp-timeline-selected');
    clips.forEach((clip, i) => {
      selectedEls[i].style.left = (clip.start / duration * 100) + '%';
      selectedEls[i].style.width = ((clip.end - clip.start) / duration * 100) + '%';
    });
    timelineEl.querySelectorAll('.vp-timeline-handle').forEach(handle => {
      let t;
      if (handle.dataset.type === 'split') t = clips[Number(handle.dataset.left)].end;
      else {
        const clip = clips[Number(handle.dataset.clip)];
        t = handle.dataset.edge === 'start' ? clip.start : clip.end;
      }
      handle.style.left = (t / duration * 100) + '%';
      handle.setAttribute('aria-valuenow', String(t));
    });
  }

  return { render, updatePositions };
}
