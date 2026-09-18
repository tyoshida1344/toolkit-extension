/**
 * trim-export.js — トリム/速度変更を反映した動画の再エンコード
 *
 * 画角の変換は不要（範囲と速度の変更のみ）なため、#89 の矩形選択録画のような canvas 合成は行わず、
 * HTMLVideoElement.captureStream() で再生中の動画から直接 MediaStream（映像+音声）を取得し、
 * そのまま MediaRecorder に渡す。音声ピッチはブラウザ既定（preservesPitch）のまま維持する。
 */
async function exportTrimmedVideo({ blob, mimeType, start, end, speed, onProgress }) {
  const video = document.getElementById('vp-export-video');
  const url = URL.createObjectURL(blob);
  video.src = url;
  try {
    await new Promise((resolve, reject) => {
      video.onloadedmetadata = resolve;
      video.onerror = () => reject(new Error('動画の読み込みに失敗しました'));
    });

    video.playbackRate = speed;
    video.currentTime = start;
    // start が読み込み直後の再生位置（0）と同じ場合、seeked が発火しないブラウザがあり得るため、
    // タイムアウトで必ず先に進めるようにする
    await Promise.race([
      new Promise(resolve => { video.onseeked = resolve; }),
      new Promise(resolve => setTimeout(resolve, 1000)),
    ]);

    const stream = video.captureStream();
    const recorder = new MediaRecorder(stream, { mimeType });
    const chunks = [];
    recorder.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data); };

    const resultPromise = new Promise((resolve, reject) => {
      recorder.onstop = () => resolve(new Blob(chunks, { type: mimeType }));
      recorder.onerror = e => reject((e && e.error) || new Error('書き出しに失敗しました'));
    });

    function finish() {
      video.removeEventListener('timeupdate', onTimeUpdate);
      video.removeEventListener('ended', finish);
      video.pause();
      if (recorder.state !== 'inactive') recorder.stop();
    }
    function onTimeUpdate() {
      if (onProgress) onProgress(Math.min(1, (video.currentTime - start) / (end - start)));
      if (video.currentTime >= end) finish();
    }
    video.addEventListener('timeupdate', onTimeUpdate);
    video.addEventListener('ended', finish);

    recorder.start();
    await video.play();

    return await resultPromise;
  } finally {
    video.pause();
    video.removeAttribute('src');
    video.load();
    URL.revokeObjectURL(url);
  }
}
