/**
 * worker.js — 動画キャプチャの Service Worker 側実装（エントリポイント）
 *
 * background.js から importScripts() で読み込まれ、同じグローバルスコープで動作する。
 * 「矩形選択」時のページ内UIは rect-picker.js に分割し、ここでは
 * tabCapture のストリーム取得・offscreen document の起動・録画の開始/停止の中継・安全弁タイマーを担う。
 * 録画中はページに何も注入しない（バナー等を出すと録画内容に映り込んでしまうため）。
 * 録画中の状態表示・停止操作は拡張機能アイコンのバッジとポップアップ（modules/videocapture/index.js）が担う。
 * 実際の録画（矩形合成・mp4/webm並行録画）は offscreen document 側（offscreen.js）が担う。
 */
importScripts('modules/videocapture/rect-picker.js');

const VC_AUTO_STOP_MS = 10 * 60 * 1000; // 意図しない長時間録画を防ぐ安全弁（10分）
const VC_BADGE_COLOR = '#ef4444';
const VC_BADGE_ERROR_COLOR = '#dc2626';

let vcRecordingTabId = null;
let vcBaseName = null;
let vcStartedAt = null;
let vcAutoStopTimer = null;
let vcBadgeTimer = null;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function videoBaseName(title) {
  const safe = (title || 'video').replace(/[\\/:*?"<>| -]/g, '_').trim().slice(0, 80) || 'video';
  const d = new Date();
  const pad = n => String(n).padStart(2, '0');
  const stamp = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
  return `${safe}_${stamp}`;
}

// 矩形選択の確定待ち（vcRecordingTabId はセット済みだが vcStartedAt はまだ null）は「録画中」に含めない
function getVideoCaptureStatus() {
  return { recording: vcStartedAt !== null, startedAt: vcStartedAt };
}

// 残り60秒を切ったらカウントダウン表示に切り替え、自動停止のタイミングをバッジだけで予告する
function vcStartBadge() {
  clearInterval(vcBadgeTimer);
  chrome.action.setBadgeBackgroundColor({ color: VC_BADGE_COLOR });
  const tick = () => {
    const remaining = Math.ceil((VC_AUTO_STOP_MS - (Date.now() - vcStartedAt)) / 1000);
    chrome.action.setBadgeText({ text: remaining <= 60 ? String(Math.max(remaining, 0)) : 'REC' });
  };
  tick();
  vcBadgeTimer = setInterval(tick, 1000);
}
function vcStopBadge() {
  clearInterval(vcBadgeTimer);
  vcBadgeTimer = null;
  chrome.action.setBadgeText({ text: '' });
}
// ポップアップは既に閉じている想定のため、エラー通知はバッジの一時表示に留める（screenshot/worker.js の flashBadgeError と同じ方式）
async function vcFlashBadgeError() {
  await chrome.action.setBadgeBackgroundColor({ color: VC_BADGE_ERROR_COLOR });
  await chrome.action.setBadgeText({ text: '!' });
  await sleep(3000);
  await chrome.action.setBadgeText({ text: '' });
}

function vcArmAutoStop() {
  clearTimeout(vcAutoStopTimer);
  vcAutoStopTimer = setTimeout(() => { finishVideoCapture().catch(() => {}); }, VC_AUTO_STOP_MS);
}
function vcDisarmAutoStop() {
  clearTimeout(vcAutoStopTimer);
  vcAutoStopTimer = null;
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

// タブの実ピクセルサイズを取得する（tabCapture ストリームの解像度をこれに固定し、矩形合成の px 換算を正確にするため）
async function readTabViewport(tabId) {
  const [{ result }] = await chrome.scripting.executeScript({
    target: { tabId },
    func: () => ({ innerWidth: window.innerWidth, innerHeight: window.innerHeight, devicePixelRatio: window.devicePixelRatio || 1 }),
  });
  return result;
}

async function startVideoCapture(tabId, mode) {
  if (vcRecordingTabId !== null) throw new Error('既に録画中です');
  const tab = await chrome.tabs.get(tabId);
  if (!/^https?:\/\//i.test(tab.url || '')) throw new Error('このページでは録画できません');

  const streamId = await chrome.tabCapture.getMediaStreamId({ targetTabId: tabId });
  const viewport = await readTabViewport(tabId);
  await vcEnsureOffscreenDocument();
  const openRes = await chrome.runtime.sendMessage({
    type: 'vcOpenStream',
    streamId,
    width: Math.round(viewport.innerWidth * viewport.devicePixelRatio),
    height: Math.round(viewport.innerHeight * viewport.devicePixelRatio),
  });
  if (!openRes || !openRes.ok) throw new Error((openRes && openRes.error) || 'ストリームの取得に失敗しました');

  vcRecordingTabId = tabId;
  vcBaseName = videoBaseName(tab.title);

  if (mode === 'rect') {
    await runVideoRectPicker(tabId); // 矩形選択UIを表示（録画はまだ開始しない）
    return { picking: true };
  }

  const startRes = await chrome.runtime.sendMessage({ type: 'vcStartRecording', rect: null, baseName: vcBaseName });
  if (!startRes || !startRes.ok) {
    await abortVideoCapture();
    throw new Error((startRes && startRes.error) || '録画の開始に失敗しました');
  }
  vcStartedAt = Date.now();
  vcArmAutoStop();
  vcStartBadge();
  return { recording: true, startedAt: vcStartedAt };
}

// ページ側の矩形選択オーバーレイからの矩形確定を受けて、実際の録画を開始する。
// この時点でポップアップは既に閉じているため、失敗時のフィードバックはバッジの一時表示で行う
async function handleVcRectSelected(rect, innerWidth, innerHeight) {
  try {
    const startRes = await chrome.runtime.sendMessage({ type: 'vcStartRecording', rect, innerWidth, innerHeight, baseName: vcBaseName });
    if (!startRes || !startRes.ok) throw new Error((startRes && startRes.error) || '録画の開始に失敗しました');
    vcStartedAt = Date.now();
    vcArmAutoStop();
    vcStartBadge();
    runShowVideoRectMarker(vcRecordingTabId, rect); // 録画対象の範囲が分かるよう、矩形の外側に枠線を表示し続ける
  } catch (e) {
    await abortVideoCapture();
    vcFlashBadgeError();
  }
}

async function abortVideoCapture() {
  const tabId = vcRecordingTabId;
  vcDisarmAutoStop();
  vcStopBadge();
  try { await chrome.runtime.sendMessage({ type: 'vcAbort' }); } catch (_) {}
  await vcCloseOffscreenDocument();
  if (tabId) runHideVideoRectMarker(tabId);
  vcRecordingTabId = null;
  vcBaseName = null;
  vcStartedAt = null;
}

// 録画終了（手動停止・自動停止・タブ側でのストリーム終了検知いずれも共通の経路）
// vcRecordingTabId を最初に null にすることで、複数経路からの多重呼び出しを無視する（二重に空のプレビュータブが開くのを防ぐ）
async function finishVideoCapture() {
  if (vcRecordingTabId === null) return;
  const tabId = vcRecordingTabId;
  vcDisarmAutoStop();
  vcStopBadge();
  vcRecordingTabId = null;
  vcBaseName = null;
  vcStartedAt = null;
  runHideVideoRectMarker(tabId);
  try {
    const res = await chrome.runtime.sendMessage({ type: 'vcStopRecording' });
    await vcCloseOffscreenDocument();
    if (!res || !res.ok) throw new Error((res && res.error) || '録画の保存に失敗しました');
    await chrome.tabs.create({ url: chrome.runtime.getURL(`video-preview.html?id=${encodeURIComponent(res.id)}`) });
  } catch (e) {
    await vcCloseOffscreenDocument();
    vcFlashBadgeError();
  }
}
