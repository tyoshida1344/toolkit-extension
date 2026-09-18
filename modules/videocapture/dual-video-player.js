/**
 * dual-video-player.js — カット区間をまたぐプレビュー再生を滞りなく行うための2要素プレイヤー
 *
 * 単一の <video> で clip の境界ごとに currentTime をシークすると、ブラウザのデコード待ちで
 * 一瞬再生が止まって見える。そこで、あるクリップの再生を始めた直後から（カット地点の
 * 何秒か手前、ではなく）ただちに裏で待機している側の <video> を次クリップの開始位置へ
 * 先読みシークしておく。先読みに使える時間がクリップの尺いっぱいになるため、よほど短い
 * クリップでない限りブラウザのシーク処理が確実に間に合い、カット地点では単に表示先の
 * <video> 要素を瞬時に入れ替えるだけで済む（先読み・瞬時スワップ方式）。
 * 2要素は同じ動画ソースを指す。呼び出し側からは getEl() が返す「今表示中の要素」だけを見ればよい。
 */
function createDualVideoPlayer(elA, elB, model) {
  const EPS = 0.05;
  let active = elA, standby = elB;
  // 先読み中/済みのクリップの内容のスナップショット。index だけでなく start/speed も保持し、
  // 編集で同じ index のクリップの中身（範囲・速度）が変わったら自動的に先読みをやり直す
  let preparedTarget = null; // { index, start, speed } | null
  let standbyReady = false;
  const tickListeners = [];
  const seekedListeners = [];

  // ネイティブのシークバードラッグ中は el.seeking が途中で瞬間的に false へ戻る場合があるため、
  // マウスボタンが押されている間も併せて抑止することでより確実にドラッグ操作を保護する
  let pointerDown = false;
  document.addEventListener('mousedown', () => { pointerDown = true; });
  document.addEventListener('mouseup', () => { pointerDown = false; });

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
    preparedTarget = null;
    standbyReady = false;
  }

  function prepareStandby(nextIndex, nextClip) {
    const same = preparedTarget && preparedTarget.index === nextIndex
      && preparedTarget.start === nextClip.start && preparedTarget.speed === nextClip.speed;
    if (same) return;
    preparedTarget = { index: nextIndex, start: nextClip.start, speed: nextClip.speed };
    standbyReady = false;
    standby.playbackRate = nextClip.speed;
    standby.currentTime = nextClip.start;
  }

  function handleTick(el) {
    if (!isActive(el)) return;
    tickListeners.forEach(fn => fn());
    // ネイティブのシークバーをドラッグ中は el.seeking が true になり続ける。この間にスワップすると
    // ブラウザ側がドラッグを追跡している要素そのものが差し替わってしまいドラッグ操作が壊れるため、
    // シーク中・マウス操作中（＝ユーザーが能動的に位置を操作している間）はカット判定・先読み・スワップを行わない
    if (el.seeking || pointerDown) return;
    const clips = model.getClips();
    const idx = model.indexAt(el.currentTime);
    const clip = clips[idx];
    if (!clip || el.paused) return;
    const next = clips[idx + 1];
    // クリップの再生を始めた直後からただちに次クリップの先読みに着手する（詳細はファイル冒頭コメント参照）
    if (next) prepareStandby(idx + 1, next);
    if (el.currentTime < clip.end - EPS) return;
    if (!next) { el.pause(); return; }
    if (standbyReady && preparedTarget && preparedTarget.index === idx + 1) {
      standby.play().catch(() => {});
      swap();
      seekedListeners.forEach(fn => fn());
    } else {
      el.currentTime = next.start; // 先読みが間に合わなかった場合のフォールバック（通常のシーク）
    }
  }

  function handleSeeked(el) {
    if (isActive(el)) { seekedListeners.forEach(fn => fn()); return; }
    if (preparedTarget && Math.abs(el.currentTime - preparedTarget.start) < EPS) standbyReady = true;
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
      preparedTarget = null;
      standbyReady = false;
    },
    setSource(url) {
      elA.src = url;
      elB.src = url;
      preparedTarget = null;
      standbyReady = false;
    },
  };
}
