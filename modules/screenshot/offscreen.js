/**
 * offscreen.js — 画面共有ピッカーで選択した映像からスクリーンショットを生成する。
 */
async function captureDesktopFrame() {
  let stream;
  try {
    stream = await navigator.mediaDevices.getDisplayMedia({
      audio: false,
      video: { displaySurface: 'monitor' },
      selfBrowserSurface: 'exclude',
      surfaceSwitching: 'exclude',
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
  captureDesktopFrame()
    .then(dataUrl => sendResponse({ ok: true, dataUrl }))
    .catch(e => {
      if (e && (e.name === 'NotAllowedError' || e.name === 'AbortError')) sendResponse({ ok: true, cancelled: true });
      else sendResponse({ ok: false, error: String((e && e.message) || e) });
    });
  return true;
});
