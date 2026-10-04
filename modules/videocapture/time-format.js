/**
 * time-format.js — mm:ss 形式の時刻表示ヘルパー
 *
 * ポップアップ（index.js、録画中の経過時間表示）とプレビュー画面（trim-timeline.js、トリム範囲表示）の
 * 両方から読み込まれる共通処理。
 */
function formatMmSs(totalSeconds) {
  const s = Math.max(0, Math.floor(totalSeconds));
  return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
}
