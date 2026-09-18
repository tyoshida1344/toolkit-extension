/**
 * offscreen-recorder.js — 録画エンジン（矩形合成・mp4/webm 並行録画）
 *
 * offscreen.js から読み込まれる。録画後の mp4⇔webm 相互変換は demux/mux ライブラリが必要になり
 * このリポジトリの方針（ビルド・依存パッケージ無し）に反するため、代わりに対応している形式ぶんだけ
 * MediaRecorder を並行して走らせ、それぞれの Blob をそのまま保持する。
 */
const TkVideoRecorder = (() => {
  const MP4_CANDIDATES = ['video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/mp4'];
  const WEBM_CANDIDATES = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];

  function pickSupportedType(candidates) {
    return candidates.find(t => MediaRecorder.isTypeSupported(t)) || null;
  }

  let recorders = {}; // { mp4?: { recorder, mimeType }, webm?: { recorder, mimeType } }
  let chunks = {};
  let compositeStop = null; // 矩形合成用の描画ループの停止関数（表示領域全体モードでは null）

  const COMPOSITE_FPS = 30;
  // 小数の devicePixelRatio（1.5倍など）の環境では、tabCapture のフレームサイズと CSS px の換算比率に
  // 選択範囲の大きさに比例した誤差（実測で数%程度）が生じることがある。固定px単位のマージンでは矩形が
  // 大きいほど不足するため、矩形のサイズに対する割合でクロップ範囲を内側に絞る
  const CROP_INSET_RATIO = 0.06;

  // captureVisibleTab 系と同じく、物理px（video の実サイズ）と CSS px（rect の座標系）の比率で換算する。
  // 動画ストリームの縦横比とページの縦横比が完全一致するとは限らないため、幅・高さそれぞれ独立に比率を求める
  // （片方の比率だけを縦横共通で使うと、ずれの分だけクロップ位置が実際の矩形からずれてしまう）。
  // offscreen document は画面に描画されず requestAnimationFrame が正常に発火しないため、setInterval で明示的に駆動する
  function startCompositing(videoEl, rect, innerWidth, innerHeight) {
    const canvas = document.getElementById('vc-canvas');
    const ratioX = videoEl.videoWidth / innerWidth;
    const ratioY = videoEl.videoHeight / innerHeight;
    const insetX = rect.width * CROP_INSET_RATIO, insetY = rect.height * CROP_INSET_RATIO;
    const cropLeft = rect.left + insetX;
    const cropTop = rect.top + insetY;
    const cropWidth = Math.max(1, rect.width - insetX * 2);
    const cropHeight = Math.max(1, rect.height - insetY * 2);
    canvas.width = Math.round(cropWidth * ratioX);
    canvas.height = Math.round(cropHeight * ratioY);
    const sx = Math.round(cropLeft * ratioX), sy = Math.round(cropTop * ratioY);
    const ctx = canvas.getContext('2d');
    const intervalId = setInterval(() => {
      ctx.drawImage(videoEl, sx, sy, canvas.width, canvas.height, 0, 0, canvas.width, canvas.height);
    }, 1000 / COMPOSITE_FPS);
    compositeStop = () => clearInterval(intervalId);
    return canvas.captureStream(COMPOSITE_FPS);
  }

  function startRecorderFor(format, type, stream) {
    if (!type) return;
    chunks[format] = [];
    const recorder = new MediaRecorder(stream, { mimeType: type });
    recorder.ondataavailable = e => { if (e.data && e.data.size) chunks[format].push(e.data); };
    recorder.start();
    recorders[format] = { recorder, mimeType: type };
  }

  function start(mediaStream, videoEl, rect, innerWidth, innerHeight) {
    const recordStream = rect ? (() => {
      const canvasStream = startCompositing(videoEl, rect, innerWidth, innerHeight);
      mediaStream.getAudioTracks().forEach(t => canvasStream.addTrack(t));
      return canvasStream;
    })() : mediaStream;

    recorders = {}; chunks = {};
    startRecorderFor('mp4', pickSupportedType(MP4_CANDIDATES), recordStream);
    startRecorderFor('webm', pickSupportedType(WEBM_CANDIDATES), recordStream);
    if (!recorders.mp4 && !recorders.webm) throw new Error('この環境では録画に対応していません');
  }

  function stopOne(format) {
    const entry = recorders[format];
    if (!entry) return Promise.resolve(null);
    return new Promise(resolve => {
      entry.recorder.onstop = () => resolve({ blob: new Blob(chunks[format], { type: entry.mimeType }), mimeType: entry.mimeType });
      entry.recorder.stop();
    });
  }

  async function stop() {
    if (compositeStop) { compositeStop(); compositeStop = null; }
    const [mp4, webm] = await Promise.all([stopOne('mp4'), stopOne('webm')]);
    recorders = {}; chunks = {};
    return { mp4, webm };
  }

  return { start, stop };
})();
