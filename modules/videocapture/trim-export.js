/**
 * trim-export.js — カット・クリップ単位の速度変更を反映した動画の再エンコード
 *
 * 画角の変換は不要（残すクリップの再生範囲と速度の変更のみ）なため、#89 の矩形選択録画のような
 * canvas 合成は行わず、HTMLVideoElement.captureStream() で再生中の動画から直接 MediaStream
 * （映像+音声）を取得し、そのまま MediaRecorder に渡す。クリップを順に再生・録画し、カットされた
 * 区間（クリップ間の隙間）は再生位置を次クリップの開始点へシークして読み飛ばす。シーク中は
 * MediaRecorder を一時停止し、シークの待ち時間（コマ止まり）が書き出し結果に写り込まないようにする。
 * 音声ピッチはブラウザ既定（preservesPitch）のまま維持する。
 */
async function exportTrimmedVideo({ blob, mimeType, clips, onProgress }) {
  const video = document.getElementById('vp-export-video');
  const url = URL.createObjectURL(blob);
  video.src = url;
  try {
    await new Promise((resolve, reject) => {
      video.onloadedmetadata = resolve;
      video.onerror = () => reject(new Error('動画の読み込みに失敗しました'));
    });

    async function seekTo(time) {
      video.currentTime = time;
      // 読み込み直後の再生位置と一致する場合など、seeked が発火しないブラウザがあり得るため、
      // タイムアウトで必ず先に進めるようにする
      await Promise.race([
        new Promise(resolve => { video.onseeked = resolve; }),
        new Promise(resolve => setTimeout(resolve, 1000)),
      ]);
    }

    const totalOutputDuration = clips.reduce((sum, c) => sum + (c.end - c.start) / c.speed, 0);
    let elapsedOutput = 0;
    let clipIndex = 0;

    video.playbackRate = clips[0].speed;
    await seekTo(clips[0].start);

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

    let advancing = false;
    async function onTimeUpdate() {
      if (advancing) return;
      const clip = clips[clipIndex];
      if (video.currentTime >= clip.end) {
        advancing = true;
        elapsedOutput += (clip.end - clip.start) / clip.speed;
        clipIndex++;
        const next = clips[clipIndex];
        if (!next) { finish(); advancing = false; return; }
        // シーク中の待ち時間（コマ止まり）を書き出し結果に含めないよう、シーク前後で録画を一時停止する
        if (recorder.state === 'recording') recorder.pause();
        video.playbackRate = next.speed;
        await seekTo(next.start);
        if (recorder.state === 'paused') recorder.resume();
        if (onProgress) onProgress(Math.min(1, elapsedOutput / totalOutputDuration));
        advancing = false;
        return;
      }
      if (onProgress) {
        const clipProgress = (video.currentTime - clip.start) / clip.speed;
        onProgress(Math.min(1, (elapsedOutput + clipProgress) / totalOutputDuration));
      }
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
