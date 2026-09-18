/**
 * dual-video-player.js — カット区間をまたぐプレビュー再生を滞りなく行うための2要素プレイヤー
 *
 * 単一の <video> で clip の境界ごとに currentTime をシークすると、ブラウザのデコード待ちで
 * 一瞬再生が止まって見える。カット地点に近づいたら裏で待機している側の <video> を次クリップの
 * 開始位置へあらかじめシークしておき、実際にカット地点へ達した瞬間にその要素へ即座に表示を
 * 切り替える（先読み・瞬時スワップ方式）ことで体感の滞りを無くす。
 * 2要素は同じ動画ソースを指す。呼び出し側からは getEl() が返す「今表示中の要素」だけを見ればよい。
 */
function createDualVideoPlayer(elA, elB, model) {
  const PREP_LEAD = 0.35; // 秒。カット地点よりこれだけ手前から次クリップの先読みシークを始める
  const EPS = 0.05;
  let active = elA, standby = elB;
  let preparedIndex = -1;
  let standbyReady = false;
  const tickListeners = [];
  const seekedListeners = [];

  standby.muted = true;
  standby.controls = false;
  standby.style.display = 'none';
  standby.src = active.src;

  function isActive(el) { return el === active; }

  function swap() {
    const old = active;
    active = standby;
    standby = old;
    active.muted = false;
    active.controls = true;
    active.style.display = '';
    standby.pause();
    standby.muted = true;
    standby.controls = false;
    standby.style.display = 'none';
    preparedIndex = -1;
    standbyReady = false;
  }

  function prepareStandby(nextIndex, nextClip) {
    if (preparedIndex === nextIndex) return;
    preparedIndex = nextIndex;
    standbyReady = false;
    standby.playbackRate = nextClip.speed;
    standby.currentTime = nextClip.start;
  }

  function handleTick(el) {
    if (!isActive(el)) return;
    tickListeners.forEach(fn => fn());
    const clips = model.getClips();
    const idx = model.indexAt(el.currentTime);
    const clip = clips[idx];
    if (!clip || el.paused) return;
    const next = clips[idx + 1];
    if (next && el.currentTime >= clip.end - PREP_LEAD) prepareStandby(idx + 1, next);
    if (el.currentTime < clip.end - EPS) return;
    if (!next) { el.pause(); return; }
    if (standbyReady && preparedIndex === idx + 1) {
      standby.play().catch(() => {});
      swap();
      seekedListeners.forEach(fn => fn());
    } else {
      el.currentTime = next.start; // 先読みが間に合わなかった場合のフォールバック（通常のシーク）
    }
  }

  function handleSeeked(el) {
    if (isActive(el)) { seekedListeners.forEach(fn => fn()); return; }
    const target = model.getClips()[preparedIndex];
    if (target && Math.abs(el.currentTime - target.start) < EPS) standbyReady = true;
  }

  elA.addEventListener('timeupdate', () => handleTick(elA));
  elB.addEventListener('timeupdate', () => handleTick(elB));
  elA.addEventListener('seeked', () => handleSeeked(elA));
  elB.addEventListener('seeked', () => handleSeeked(elB));

  return {
    getEl: () => active,
    onTick: fn => tickListeners.push(fn),
    onSeeked: fn => seekedListeners.push(fn),
    seekTo(time) {
      active.currentTime = time;
      preparedIndex = -1;
      standbyReady = false;
    },
    setSource(url) {
      elA.src = url;
      elB.src = url;
      preparedIndex = -1;
      standbyReady = false;
    },
  };
}
