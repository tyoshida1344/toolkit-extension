/**
 * offscreen.js — desktopCapture の映像からスクリーンショットを生成する。
 */
async function captureDesktopFrame(streamId) {
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { mandatory: { chromeMediaSource: 'desktop', chromeMediaSourceId: streamId } },
    });
    const video = document.createElement('video');
    video.srcObject = stream;
    video.muted = true;
    await video.play();
    if (!video.videoWidth || !video.videoHeight) throw new Error('画像サイズを取得できませんでした');
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0);
    return canvas.toDataURL('image/png');
  } finally {
    if (stream) stream.getTracks().forEach(track => track.stop());
  }
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type !== 'captureDesktopFrame') return;
  captureDesktopFrame(msg.streamId)
    .then(dataUrl => sendResponse({ ok: true, dataUrl }))
    .catch(e => sendResponse({ ok: false, error: String((e && e.message) || e) }));
  return true;
});
