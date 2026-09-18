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
  let compositeStop = null; // 矩形合成用の rAF ループの停止関数（表示領域全体モードでは null）

  // captureVisibleTab 系と同じく、物理px（video の実サイズ）と CSS px（rect の座標系）の比率で換算する
  function startCompositing(videoEl, rect, innerWidth) {
    const canvas = document.getElementById('vc-canvas');
    const ratio = videoEl.videoWidth / innerWidth;
    canvas.width = Math.round(rect.width * ratio);
    canvas.height = Math.round(rect.height * ratio);
    const sx = Math.round(rect.left * ratio), sy = Math.round(rect.top * ratio);
    const ctx = canvas.getContext('2d');
    let rafId = 0;
    function draw() {
      ctx.drawImage(videoEl, sx, sy, canvas.width, canvas.height, 0, 0, canvas.width, canvas.height);
      rafId = requestAnimationFrame(draw);
    }
    draw();
    compositeStop = () => cancelAnimationFrame(rafId);
    return canvas.captureStream(30);
  }

  function startRecorderFor(format, type, stream) {
    if (!type) return;
    chunks[format] = [];
    const recorder = new MediaRecorder(stream, { mimeType: type });
    recorder.ondataavailable = e => { if (e.data && e.data.size) chunks[format].push(e.data); };
    recorder.start();
    recorders[format] = { recorder, mimeType: type };
  }

  function start(mediaStream, videoEl, rect, innerWidth) {
    const recordStream = rect ? (() => {
      const canvasStream = startCompositing(videoEl, rect, innerWidth);
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
