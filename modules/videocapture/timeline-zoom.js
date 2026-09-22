/**
 * timeline-zoom.js — トリムタイムラインの拡大/縮小とパン（表示範囲の移動）
 *
 * 動画が長いほど、固定幅のタイムラインをドラッグして得られる位置決めの精度は落ちる
 * （1pxあたりの秒数が増えるため）。そこで内側の .vp-timeline 要素の幅を動画全体の長さに
 * 比例して伸縮させ、外側の .vp-timeline-viewport（overflow-x: auto）でスクロール表示する。
 * クリップ・ハンドルの位置は duration に対するパーセンテージで描画されている（timeline-render.js）
 * ため、幅を変えるだけで自動的にズームに追従する。パンはブラウザ標準の横スクロールバーに任せる。
 *
 * 最大ズームは「1px ≈ MIN_UNIT 秒」になる幅を上限として決める（実際の動画fpsは取得できないため、
 * 一般的なフレームレートである1/30秒を基準値として使う）。
 *
 * rulerEl（timeline-render.js が描く境界時刻の目盛り）は .vp-timeline の兄弟要素で、
 * ラベルの left% はこの要素自身の幅が基準になる。.vp-timeline と同じ幅を明示的に
 * 与えないと、ズームで .vp-timeline だけが伸びてラベルの位置がずれてしまう。
 */
function createTimelineZoom({ viewportEl, timelineEl, rulerEl, extraWidthEls = [], duration, zoomInBtn, zoomOutBtn, getAnchorTime, posToTime }) {
  const MIN_UNIT = 1 / 30; // 秒。最大ズーム時の目標精度（1px ≈ この値）
  const ZOOM_STEP = 1.5; // ボタン/ホイール1回あたりの拡大縮小倍率
  let visibleSeconds = duration;

  function minVisibleSeconds() {
    return (viewportEl.clientWidth || 1) * MIN_UNIT;
  }

  function applyWidth() {
    const containerWidth = viewportEl.clientWidth || 1;
    const widthPx = containerWidth * (duration / visibleSeconds);
    timelineEl.style.width = widthPx + 'px';
    rulerEl.style.width = widthPx + 'px';
    extraWidthEls.forEach(el => { el.style.width = widthPx + 'px'; });
    return widthPx;
  }

  function updateButtons() {
    zoomInBtn.disabled = visibleSeconds <= minVisibleSeconds() + 1e-6;
    zoomOutBtn.disabled = visibleSeconds >= duration - 1e-6;
  }

  // anchorTime の位置が画面上の anchorScreenOffsetPx（ビューポート左端からのpx）に留まるように
  // 幅変更後の scrollLeft を計算する（ズームの中心を固定する）
  function setVisibleSeconds(next, anchorTime, anchorScreenOffsetPx) {
    const clamped = Math.min(duration, Math.max(minVisibleSeconds(), next));
    if (Math.abs(clamped - visibleSeconds) < 1e-6) return;
    visibleSeconds = clamped;
    const fullWidthPx = applyWidth();
    viewportEl.scrollLeft = (anchorTime / duration) * fullWidthPx - anchorScreenOffsetPx;
    updateButtons();
  }

  function zoomBy(factor) {
    setVisibleSeconds(visibleSeconds / factor, getAnchorTime(), viewportEl.clientWidth / 2);
  }

  zoomInBtn.addEventListener('click', () => zoomBy(ZOOM_STEP));
  zoomOutBtn.addEventListener('click', () => zoomBy(1 / ZOOM_STEP));

  viewportEl.addEventListener('wheel', e => {
    if (extraWidthEls.some(el => el.contains(e.target))) return; // 独自スクロールを持つ行の上ではズームさせない
    e.preventDefault();
    const rect = viewportEl.getBoundingClientRect();
    const anchorScreenOffsetPx = e.clientX - rect.left;
    const anchorTime = posToTime(e.clientX);
    const factor = e.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP;
    setVisibleSeconds(visibleSeconds / factor, anchorTime, anchorScreenOffsetPx);
  }, { passive: false });

  // ウィンドウ幅が変わっても、現在のズーム倍率（秒/px）を保ったまま追従させる
  window.addEventListener('resize', applyWidth);

  applyWidth();
  updateButtons();
}
