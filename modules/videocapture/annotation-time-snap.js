/**
 * annotation-time-snap.js — 注釈の区間端を他の時刻へ吸着させる
 *
 * 吸着先は「再生位置」「他の注釈の開始・終了」「クリップ境界（カット・分割点）」。
 * 判定距離は画面上の位置揃えと共通の ANN_SNAP_PX（annotation-snap.js）を、レーン幅に対する秒数へ換算して使い、ズーム倍率に依らず同じ感覚で効く。
 * 有効/無効は再生ボタンと同じ行の「時間補正」チェックボックス（isEnabled）に従う。
 */
function createAnnotationTimeSnap({ laneEl, duration, getTime, getClips, getShapes, isEnabled }) {
  function targets(excludeId) {
    const times = [getTime()];
    getClips().forEach(clip => times.push(clip.start, clip.end));
    getShapes().forEach(shape => { if (shape.id !== excludeId) times.push(shape.startTime, shape.endTime); });
    return times;
  }

  function tolerance() {
    const width = laneEl.getBoundingClientRect().width;
    return width ? ANN_SNAP_PX * duration / width : 0;
  }

  // values のどれかが吸着先に tol 以内で近ければ、最も近い組の補正量を返す（無ければ null）
  function nearestDelta(values, excludeId) {
    const times = targets(excludeId);
    const tol = tolerance();
    let best = null;
    values.forEach(v => times.forEach(t => {
      const delta = t - v;
      if (Math.abs(delta) <= tol && (best === null || Math.abs(delta) < Math.abs(best))) best = delta;
    }));
    return best;
  }

  return {
    // 区間の端 time を吸着させる。吸着したかどうかも返す（レーンの強調表示に使う）
    snapTime(time, excludeId) {
      const delta = isEnabled() ? nearestDelta([time], excludeId) : null;
      return { time: delta === null ? time : time + delta, snapped: delta !== null };
    },
    // 区間 [start, end] をまるごと動かすとき、どちらかの端が吸着先に寄れば補正量を返す
    snapShift(start, end, excludeId) {
      const delta = isEnabled() ? nearestDelta([start, end], excludeId) : null;
      return { delta: delta === null ? 0 : delta, snapped: delta !== null };
    },
    // 矢印キーで value から delta 動かすとき、途中にある吸着先で止まる（現在地そのものは除く）
    stepTime(value, delta, excludeId) {
      if (!isEnabled()) return value + delta;
      const next = value + delta;
      const between = targets(excludeId)
        .filter(t => Math.abs(t - value) > 1e-6 && (delta > 0 ? t > value && t <= next : t < value && t >= next))
        .sort((a, b) => Math.abs(a - value) - Math.abs(b - value));
      return between.length ? between[0] : next;
    },
  };
}
