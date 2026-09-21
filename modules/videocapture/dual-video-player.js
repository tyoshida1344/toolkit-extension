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

  function prepareNext(clips, idx) {
    const next = clips[idx + 1];
    if (next) prepareStandby(idx + 1, next);
  }

  // 次クリップの先読みだけを行う（カット判定・スワップは行わない）。再生中の毎tickに加えて、
  // 一時停止中でもクリップの編集（削除・分割・範囲変更等）直後に呼べるようにする。編集で次に
  // 再生すべきクリップの index がズレたまま古い先読み内容が残るのを防ぐのが目的
  // （例: 中間クリップを削除すると後続クリップの index がずれる。再生中でなければ tick が
  // 発生せず先読みが更新されないため、再生を再開した瞬間に間に合わずカクつく）
  function syncPrep() {
    if (active.seeking || pointerDown) return;
    prepareNext(model.getClips(), model.indexAt(active.currentTime));
  }

  function handleTick(el) {
    if (!isActive(el)) return;
    tickListeners.forEach(fn => fn());
    // ネイティブのシークバーをドラッグ中は el.seeking が true になり続ける。この間にスワップすると
    // ブラウザ側がドラッグを追跡している要素そのものが差し替わってしまいドラッグ操作が壊れるため、
    // シーク中・マウス操作中（＝ユーザーが能動的に位置を操作している間）は先読み・カット判定・
    // スワップを行わない
    if (el.seeking || pointerDown) return;
    const clips = model.getClips();
    const idx = model.indexAt(el.currentTime);
    prepareNext(clips, idx);
    if (el.paused) return;
    const clip = clips[idx];
    if (!clip || el.currentTime < clip.end - EPS) return;
    const next = clips[idx + 1];
    if (!next) { el.pause(); return; }
    if (standbyReady && preparedTarget && preparedTarget.index === idx + 1) {
      standby.play().catch(() => {});
      swap();
      seekedListeners.forEach(fn => fn());
    } else {
      // 先読みが間に合わなかった場合のフォールバック（通常のシーク）。ここで速度も明示的に
      // 合わせておかないと、シークが解決して resyncToCurrentTime が効くまでの間、前のクリップの
      // 速度のまま再生されてしまう（間に合わない＝シークが遅いケースほど、この間が長くなり目立つ）
      el.playbackRate = next.speed;
      el.currentTime = next.start;
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
    // クリップの削除・分割・範囲変更・速度変更など、再生位置は動かないがクリップ構成が変わる
    // 編集の直後に呼ぶ。再生中でなくても先読みを最新の内容に更新する
    refreshPrep: syncPrep,
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
