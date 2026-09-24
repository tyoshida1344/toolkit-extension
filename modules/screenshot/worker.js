/**
 * worker.js — スクリーンショット撮影の Service Worker 側実装（エントリポイント）
 *
 * background.js から importScripts() で読み込まれ、同じグローバルスコープで動作する。
 * モード別のキャプチャ処理は fullpage.js（ページ全体）・element-picker.js（要素選択）・rect-picker.js（矩形選択）に分割し、
 * ここでは共通ヘルパーとモードの振り分け・遅延起動・プレビューへの受け渡しを担う。
 * 保存形式の選択・変換とダウンロードは screenshot-preview.html 側で行う。
 */
importScripts('modules/screenshot/fullpage.js', 'modules/screenshot/element-picker.js', 'modules/screenshot/rect-picker.js');

const SCREENSHOT_MAX_SHOTS = 40; // 非常に長いページでの無限ループを防ぐ安全上限
const SCREENSHOT_CAPTURE_INTERVAL_MS = 550; // captureVisibleTab のレート制限（2回/秒）を避けつつ再描画を待つ
let desktopCaptureOwner = null; // 'screenshot' | 'video' | null。offscreen document の画面/ウィンドウキャプチャ用途での排他制御

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function screenshotBaseName(title) {
  const safe = (title || 'screenshot').replace(/[\\/:*?"<>| -]/g, '_').trim().slice(0, 80) || 'screenshot';
  const d = new Date();
  const pad = n => String(n).padStart(2, '0');
  const stamp = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
  return `${safe}_${stamp}`;
}

async function captureVisibleTabRetry(windowId) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await chrome.tabs.captureVisibleTab(windowId, { format: 'png' });
    } catch (e) {
      if (attempt >= 2) throw e;
      await sleep(700);
    }
  }
}

async function captureScreenshot(tabId, mode) {
  const tab = await chrome.tabs.get(tabId);
  if (!/^https?:\/\//i.test(tab.url || '')) throw new Error('このページでは撮影できません');
  const baseName = screenshotBaseName(tab.title);
  let dataUrl, truncated = false;
  if (mode === 'fullpage') {
    ({ url: dataUrl, truncated } = await captureFullPage(tab));
  } else {
    dataUrl = await captureVisibleTabRetry(tab.windowId);
  }
  return { dataUrl, baseName, truncated };
}

async function openPreviewTab({ dataUrl, baseName, truncated }) {
  await chrome.storage.session.set({ tm_screenshot_pending: { dataUrl, baseName, truncated } });
  await chrome.tabs.create({ url: chrome.runtime.getURL('screenshot-preview.html') });
}

async function captureDesktopScreenshot(tabId) {
  if (desktopCaptureOwner !== null) throw new Error('別の画面/ウィンドウキャプチャ操作が進行中です');
  desktopCaptureOwner = 'screenshot';
  let createdOffscreenDocument = false;
  try {
    const tab = await chrome.tabs.get(tabId);
    if (!await chrome.offscreen.hasDocument()) {
      await chrome.offscreen.createDocument({
        url: 'offscreen.html',
        reasons: ['USER_MEDIA', 'DISPLAY_MEDIA'],
        justification: '画面またはウィンドウの静止画を撮影するため',
      });
      createdOffscreenDocument = true;
    }
    const res = await chrome.runtime.sendMessage({ type: 'captureDesktopFrame' });
    if (!res || !res.ok) throw new Error((res && res.error) || '画像の取得に失敗しました');
    if (res.cancelled) return { cancelled: true };
    await openPreviewTab({ dataUrl: res.dataUrl, baseName: screenshotBaseName(tab.title), truncated: false });
    return { cancelled: false };
  } finally {
    try {
      if (createdOffscreenDocument && vcRecordingTabId === null && await chrome.offscreen.hasDocument()) {
        await chrome.offscreen.closeDocument();
      }
    } finally {
      if (desktopCaptureOwner === 'screenshot') desktopCaptureOwner = null;
    }
  }
}

async function runCaptureAndOpenPreview(tabId, mode) {
  const { dataUrl, baseName, truncated } = await captureScreenshot(tabId, mode);
  await openPreviewTab({ dataUrl, baseName, truncated });
}

// 遅延起動・即時実行の両経路から呼ばれる、モードごとの処理の振り分け
async function runModeAction(tabId, mode) {
  if (mode === 'element') {
    await runElementPicker(tabId);
    return { picking: true };
  }
  if (mode === 'rect') {
    await runRectPicker(tabId);
    return { picking: true };
  }
  await runCaptureAndOpenPreview(tabId, mode);
  return {};
}

const SCREENSHOT_BADGE_COLOR = '#0ea5e9'; // styles/base.css の --tm-accent と統一
const SCREENSHOT_BADGE_ERROR_COLOR = '#dc2626'; // styles/base.css の --tm-error と統一

// ポップアップは既に閉じている想定のため、エラー通知はバッジの一時表示に留める
async function flashBadgeError() {
  await chrome.action.setBadgeBackgroundColor({ color: SCREENSHOT_BADGE_ERROR_COLOR });
  await chrome.action.setBadgeText({ text: '!' });
  await sleep(3000);
  await chrome.action.setBadgeText({ text: '' });
}

// ポップアップはフォーカスが外れると閉じるため、遅延中は拡張機能アイコンのバッジで残り秒数を知らせる
async function runDelayedCapture(tabId, mode, delaySeconds) {
  for (let remaining = delaySeconds; remaining > 0; remaining--) {
    await chrome.action.setBadgeBackgroundColor({ color: SCREENSHOT_BADGE_COLOR });
    await chrome.action.setBadgeText({ text: String(remaining) });
    await sleep(1000);
  }
  await chrome.action.setBadgeText({ text: '' });
  try {
    await runModeAction(tabId, mode);
  } catch (e) {
    await flashBadgeError();
  }
}
