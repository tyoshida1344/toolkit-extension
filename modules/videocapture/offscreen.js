/**
 * offscreen.js — 動画キャプチャの offscreen document 側エントリ
 *
 * background（worker.js）からのメッセージで getUserMedia の開始・録画開始/終了を行う。
 * 実際の録画（矩形合成・mp4/webm並行録画）は offscreen-recorder.js が担う。
 */
let vcMediaStream = null;
let vcAudioCtx = null;
let vcBaseName = 'video';
const vcVideoEl = document.getElementById('vc-source');

// 解像度を明示指定しないと Chrome 側の暗黙の解像度選択に委ねることになり、矩形合成時の px 換算比率が
// 不正確になりうる（録画にわずかに余分な範囲が写り込む原因になっていた）ため、タブの実ピクセルサイズに固定する。
// 環境によっては厳密指定が通らないことがあるため、失敗時は指定なしにフォールバックする
async function vcOpenStream(streamId, width, height, sourceType, includeAudio) {
  const mediaSource = sourceType === 'desktop' ? 'desktop' : 'tab';
  const videoMandatory = { chromeMediaSource: mediaSource, chromeMediaSourceId: streamId };
  if (mediaSource === 'tab' && width && height) {
    Object.assign(videoMandatory, { minWidth: width, maxWidth: width, minHeight: height, maxHeight: height });
  }
  const audioSource = mediaSource === 'desktop' ? 'system' : 'tab';
  const audioConstraint = { mandatory: { chromeMediaSource: audioSource, chromeMediaSourceId: streamId } };
  try {
    vcMediaStream = await navigator.mediaDevices.getUserMedia({
      audio: mediaSource === 'tab' || includeAudio ? audioConstraint : false,
      video: { mandatory: videoMandatory },
    });
  } catch (e) {
    const fallbackVideo = { chromeMediaSource: mediaSource, chromeMediaSourceId: streamId };
    vcMediaStream = await navigator.mediaDevices.getUserMedia({
      audio: mediaSource === 'tab' ? audioConstraint : false,
      video: { mandatory: fallbackVideo },
    });
  }

  // 録画中もタブの音声をユーザーに聞かせ続けるため、AudioContext 経由で出力に戻す（Chrome 公式サンプルと同じ方式）
  if (mediaSource === 'tab' && vcMediaStream.getAudioTracks().length) {
    vcAudioCtx = new AudioContext();
    vcAudioCtx.createMediaStreamSource(vcMediaStream).connect(vcAudioCtx.destination);
  }

  vcVideoEl.srcObject = vcMediaStream;
  vcVideoEl.muted = true; // 音声は AudioContext 側で再生するため、<video> 自体は無音にする（矩形合成用の映像ソースとしてのみ使う）
  await vcVideoEl.play();

  // タブの移動・終了等でキャプチャが強制終了した場合も、手動停止と同じ経路で保存・後片付けする
  vcMediaStream.getVideoTracks()[0].onended = () => { chrome.runtime.sendMessage({ type: 'vcStopClicked' }); };
}

async function vcOpenDisplayStream() {
  vcMediaStream = await navigator.mediaDevices.getDisplayMedia({
    audio: true,
    video: { displaySurface: 'monitor' },
    selfBrowserSurface: 'exclude',
    surfaceSwitching: 'exclude',
    systemAudio: 'include',
  });
  vcVideoEl.srcObject = vcMediaStream;
  vcVideoEl.muted = true;
  await vcVideoEl.play();
  vcMediaStream.getVideoTracks()[0].onended = () => { chrome.runtime.sendMessage({ type: 'vcStopClicked' }); };
}

function vcCloseStream() {
  if (vcMediaStream) vcMediaStream.getTracks().forEach(t => t.stop());
  if (vcAudioCtx) vcAudioCtx.close();
  vcMediaStream = null;
  vcAudioCtx = null;
  vcVideoEl.srcObject = null;
}

function vcGenId() {
  return 'vc_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
}

async function vcFinishRecording() {
  try {
    const { mp4, webm } = await TkVideoRecorder.stop();
    if (!mp4 && !webm) throw new Error('録画データがありません'); // 選択操作中にタブが閉じる/移動する等、録画が実際には始まっていなかった場合
    const id = vcGenId();
    await TkVideoBlobStore.put(id, {
      baseName: vcBaseName,
      mp4: mp4 && mp4.blob, mp4Type: mp4 && mp4.mimeType,
      webm: webm && webm.blob, webmType: webm && webm.mimeType,
    });
    return id;
  } finally {
    vcCloseStream();
  }
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'vcOpenStream') {
    vcOpenStream(msg.streamId, msg.width, msg.height, msg.sourceType, msg.includeAudio).then(() => sendResponse({ ok: true })).catch(e => sendResponse({ ok: false, error: String((e && e.message) || e) }));
    return true;
  }
  if (msg.type === 'vcOpenDisplayStream') {
    vcOpenDisplayStream()
      .then(() => sendResponse({ ok: true }))
      .catch(e => {
        if (e && (e.name === 'NotAllowedError' || e.name === 'AbortError')) sendResponse({ ok: true, cancelled: true });
        else sendResponse({ ok: false, error: String((e && e.message) || e) });
      });
    return true;
  }
  if (msg.type === 'vcStartRecording') {
    try {
      vcBaseName = msg.baseName || 'video';
      TkVideoRecorder.start(vcMediaStream, vcVideoEl, msg.rect, msg.innerWidth, msg.innerHeight);
      sendResponse({ ok: true });
    } catch (e) {
      sendResponse({ ok: false, error: String((e && e.message) || e) });
    }
    return;
  }
  if (msg.type === 'vcStopRecording') {
    vcFinishRecording().then(id => sendResponse({ ok: true, id })).catch(e => sendResponse({ ok: false, error: String((e && e.message) || e) }));
    return true;
  }
  if (msg.type === 'vcAbort') {
    vcCloseStream();
    sendResponse({ ok: true });
    return;
  }
});
