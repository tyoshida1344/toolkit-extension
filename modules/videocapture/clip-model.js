/**
 * clip-model.js — 複数クリップ編集（中間カット・クリップ単位の速度変更）のデータモデル
 *
 * 動画を「残すクリップ」の配列として保持する。クリップ同士は重ならず、時間順に並ぶ。
 * クリップ間の隙間・先頭/末尾の余白は「カットされた区間」として書き出し・プレビューの両方でスキップされる。
 */
function createClipModel(duration) {
  const MIN_GAP = 0.2; // クリップの最小長（秒）。これ未満には縮められない・分割できない
  const EPS = 0.01;
  let clips = [{ start: 0, end: duration, speed: 1 }];

  function getClips() {
    return clips.map(c => ({ ...c }));
  }

  // time を含むクリップの index。隙間上にある場合は最も近いクリップへスナップした index を返す
  function indexAt(time) {
    for (let i = 0; i < clips.length; i++) {
      if (time >= clips[i].start - EPS && time < clips[i].end) return i;
    }
    if (time >= clips[clips.length - 1].end) return clips.length - 1;
    let nearest = 0;
    let best = Infinity;
    clips.forEach((c, i) => {
      const d = time < c.start ? c.start - time : time - c.end;
      if (d < best) { best = d; nearest = i; }
    });
    return nearest;
  }

  function splitAt(time) {
    const i = indexAt(time);
    const clip = clips[i];
    if (time - clip.start < MIN_GAP || clip.end - time < MIN_GAP) return -1;
    clips.splice(i, 1,
      { start: clip.start, end: time, speed: clip.speed },
      { start: time, end: clip.end, speed: clip.speed });
    return i + 1;
  }

  function canSplitAt(time) {
    const clip = clips[indexAt(time)];
    return time - clip.start >= MIN_GAP && clip.end - time >= MIN_GAP;
  }

  function removeAt(i) {
    if (clips.length <= 1) return false;
    clips.splice(i, 1);
    return true;
  }

  function setSpeed(i, speed) {
    if (clips[i]) clips[i].speed = speed;
  }

  function setRange(i, newStart, newEnd) {
    const prevEnd = i > 0 ? clips[i - 1].end : 0;
    const nextStart = i < clips.length - 1 ? clips[i + 1].start : duration;
    newStart = Math.min(Math.max(prevEnd, newStart), duration);
    newEnd = Math.min(Math.max(0, newEnd), nextStart);
    if (newEnd - newStart < MIN_GAP) {
      if (newStart !== clips[i].start) newStart = newEnd - MIN_GAP;
      else newEnd = newStart + MIN_GAP;
    }
    clips[i].start = Math.max(prevEnd, newStart);
    clips[i].end = Math.min(nextStart, newEnd);
  }

  // clips[i] と clips[i+1] が接している（間に隙間がない = 1つの分割点として扱える）か
  function isTouching(i) {
    return i >= 0 && i < clips.length - 1 && clips[i + 1].start - clips[i].end < EPS;
  }

  // 接している clips[i]/clips[i+1] の境界（分割点）を newTime へ移動する。双方の端を同時に動かす
  function moveBoundary(i, newTime) {
    if (!isTouching(i)) return;
    const left = clips[i], right = clips[i + 1];
    newTime = Math.min(Math.max(left.start + MIN_GAP, newTime), right.end - MIN_GAP);
    left.end = newTime;
    right.start = newTime;
  }

  function reset() {
    clips = [{ start: 0, end: duration, speed: 1 }];
  }

  function isEdited() {
    if (clips.length !== 1) return true;
    const c = clips[0];
    return c.speed !== 1 || c.start > EPS || c.end < duration - EPS;
  }

  return {
    getClips, indexAt, splitAt, canSplitAt, removeAt, setSpeed, setRange, reset, isEdited,
    isTouching, moveBoundary, MIN_GAP,
  };
}
