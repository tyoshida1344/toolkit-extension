/**
 * worker.js — 動画キャプチャの Service Worker 側実装（エントリポイント）
 *
 * background.js から importScripts() で読み込まれ、同じグローバルスコープで動作する。
 * ページ側のオーバーレイは recorder-overlay.js に分割し、ここでは
 * tabCapture のストリーム取得・offscreen document の起動・録画の開始/停止の中継・安全弁タイマーを担う。
 * 実際の録画（矩形合成・mp4/webm並行録画）は offscreen document 側（offscreen.js）が担う。
 */
importScripts('modules/videocapture/recorder-overlay.js');

const VC_AUTO_STOP_MS = 10 * 60 * 1000; // 意図しない長時間録画を防ぐ安全弁（10分）
const VC_AUTO_STOP_WARN_MS = 60 * 1000; // 自動停止の何ミリ秒前にページ内バナーで予告するか

let vcRecordingTabId = null;
let vcBaseName = null;
let vcAutoStopTimer = null;
let vcAutoStopWarnTimer = null;

function videoBaseName(title) {
  const safe = (title || 'video').replace(/[\\/:*?"<>| -]/g, '_').trim().slice(0, 80) || 'video';
  const d = new Date();
  const pad = n => String(n).padStart(2, '0');
  const stamp = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
  return `${safe}_${stamp}`;
}

function vcArmAutoStop() {
  clearTimeout(vcAutoStopTimer);
  clearTimeout(vcAutoStopWarnTimer);
  vcAutoStopTimer = setTimeout(() => { finishVideoCapture().catch(() => {}); }, VC_AUTO_STOP_MS);
  vcAutoStopWarnTimer = setTimeout(() => {
    if (vcRecordingTabId) chrome.tabs.sendMessage(vcRecordingTabId, { type: 'vcAutoStopWarning' }).catch(() => {});
  }, VC_AUTO_STOP_MS - VC_AUTO_STOP_WARN_MS);
}
function vcDisarmAutoStop() {
  clearTimeout(vcAutoStopTimer);
  clearTimeout(vcAutoStopWarnTimer);
  vcAutoStopTimer = null;
  vcAutoStopWarnTimer = null;
}

async function vcEnsureOffscreenDocument() {
  if (await chrome.offscreen.hasDocument()) return;
  await chrome.offscreen.createDocument({
    url: 'offscreen.html',
    reasons: ['USER_MEDIA'],
    justification: 'タブの動画・音声を録画するため',
  });
}
async function vcCloseOffscreenDocument() {
  if (await chrome.offscreen.hasDocument()) await chrome.offscreen.closeDocument();
}

async function startVideoCapture(tabId, mode) {
  if (vcRecordingTabId !== null) throw new Error('既に録画中です');
  const tab = await chrome.tabs.get(tabId);
  if (!/^https?:\/\//i.test(tab.url || '')) throw new Error('このページでは録画できません');

  const streamId = await chrome.tabCapture.getMediaStreamId({ targetTabId: tabId });
  await vcEnsureOffscreenDocument();
  const openRes = await chrome.runtime.sendMessage({ type: 'vcOpenStream', streamId });
  if (!openRes || !openRes.ok) throw new Error((openRes && openRes.error) || 'ストリームの取得に失敗しました');

  vcRecordingTabId = tabId;
  vcBaseName = videoBaseName(tab.title);

  if (mode === 'rect') {
    await runVideoOverlay(tabId, mode); // 矩形選択UIを表示（録画はまだ開始しない）
    return { picking: true };
  }

  const startRes = await chrome.runtime.sendMessage({ type: 'vcStartRecording', rect: null, baseName: vcBaseName });
  if (!startRes || !startRes.ok) {
    await abortVideoCapture();
    throw new Error((startRes && startRes.error) || '録画の開始に失敗しました');
  }
  vcArmAutoStop();
  await runVideoOverlay(tabId, mode); // 録画中バナーを表示
  return { recording: true };
}

// コンテンツスクリプト（矩形選択オーバーレイ）からの矩形確定を受けて、実際の録画を開始する
async function handleVcRectSelected(rect, innerWidth) {
  try {
    const startRes = await chrome.runtime.sendMessage({ type: 'vcStartRecording', rect, innerWidth, baseName: vcBaseName });
    if (!startRes || !startRes.ok) throw new Error((startRes && startRes.error) || '録画の開始に失敗しました');
    vcArmAutoStop();
    return { ok: true };
  } catch (e) {
    await abortVideoCapture();
    return { ok: false, error: String((e && e.message) || e) };
  }
}

async function abortVideoCapture() {
  vcDisarmAutoStop();
  try { await chrome.runtime.sendMessage({ type: 'vcAbort' }); } catch (_) {}
  await vcCloseOffscreenDocument();
  vcRecordingTabId = null;
  vcBaseName = null;
}

// 録画終了（手動停止・自動停止・タブ側でのストリーム終了検知いずれも共通の経路）
// vcRecordingTabId を最初に null にすることで、複数経路からの多重呼び出しを無視する（二重に空のプレビュータブが開くのを防ぐ）
async function finishVideoCapture() {
  if (vcRecordingTabId === null) return;
  const tabId = vcRecordingTabId;
  vcDisarmAutoStop();
  vcRecordingTabId = null;
  vcBaseName = null;
  try {
    const res = await chrome.runtime.sendMessage({ type: 'vcStopRecording' });
    await vcCloseOffscreenDocument();
    if (!res || !res.ok) throw new Error((res && res.error) || '録画の保存に失敗しました');
    if (tabId) chrome.tabs.sendMessage(tabId, { type: 'vcRecordingSaved' }).catch(() => {});
    await chrome.tabs.create({ url: chrome.runtime.getURL(`video-preview.html?id=${encodeURIComponent(res.id)}`) });
  } catch (e) {
    await vcCloseOffscreenDocument();
    if (tabId) chrome.tabs.sendMessage(tabId, { type: 'vcRecordingFailed' }).catch(() => {});
  }
}
