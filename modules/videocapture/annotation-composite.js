/**
 * annotation-composite.js — 書き出し時の動画と注釈の canvas 合成
 *
 * rAF は非表示タブで止まるため、offscreen-recorder.js と同様に描画ループを setInterval で駆動する。
 * ただし非表示タブではタイマーも間引かれ得るため、書き出し中はコマ落ちし得る。そのためモーダルで
 * このタブを表示したまま待つよう案内している。呼び出し側は終了時に必ず stop して interval を解放する。
 */
function createVideoAnnotationComposite(video, shapes) {
  const canvas = document.createElement('canvas');
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const ctx = canvas.getContext('2d');
  let interval = null;

  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    shapes.filter(shape => isShapeVisibleAt(shape, video.currentTime)).forEach(shape => drawShape(ctx, shape));
  }

  function start() {
    draw(); // 録画開始前に先頭フレームを用意し、空フレームが入るのを防ぐ
    interval = setInterval(draw, 1000 / 30);
    const stream = canvas.captureStream(30);
    video.captureStream().getAudioTracks().forEach(track => stream.addTrack(track));
    return stream;
  }

  return { start, stop: () => { clearInterval(interval); interval = null; } };
}
