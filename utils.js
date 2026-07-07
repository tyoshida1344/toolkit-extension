/**
 * utils.js — Toolkit 共通 UI ユーティリティ
 *
 * popup.js (Toolkit IIFE) より先に読み込まれ、_TkUtils 名前空間で公開する。
 * モジュールからは Toolkit.$ / Toolkit.escapeHtml 等として利用する（再公開は popup.js が行う）。
 */
const _TkUtils = (() => {
  const $ = id => document.getElementById(id);
  const qsa = (sel, root = document) => Array.from((root || document).querySelectorAll(sel));

  function escapeHtml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  const TOAST_DURATION = 1400;
  let toastTimer = null;
  function showToast(message = '📋 コピーしました') {
    let toast = document.getElementById('tm-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'tm-toast';
      toast.className = 'tm-toast';
      document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.classList.remove('show');
    void toast.offsetWidth;
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), TOAST_DURATION);
  }

  const svgIco = (extraClass, inner, sw = 2) =>
    `<svg class="tm-ico${extraClass ? ' ' + extraClass : ''}" viewBox="0 0 24 24" fill="none" stroke="currentColor"` +
    ` stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;

  const ICONS = {
    copy: svgIco('tm-copy-ico tm-copy-ico-default',
      '<rect x="9" y="9" width="13" height="13" rx="2"></rect>' +
      '<path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>'),
    check: svgIco('tm-copy-ico tm-copy-ico-done',
      '<polyline points="20 6 9 17 4 12"></polyline>', 2.5),
    refresh: svgIco('',
      '<polyline points="23 4 23 10 17 10"></polyline>' +
      '<polyline points="1 20 1 14 7 14"></polyline>' +
      '<path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>'),
  };

  /**
   * 汎用アイコンボタンのHTMLを返す（コピー以外のアイコン操作も統一）。
   * @param {string} icon - SVG文字列 / 絵文字
   * @param {object} [opts]
   * @param {string} [opts.id] - ボタンのid（init側でハンドラを付ける用）
   * @param {string} [opts.title] - ツールチップ / アクセシビリティ文言
   * @param {string} [opts.cls] - 追加クラス
   * @param {object} [opts.data] - data-* 属性のキーと値
   */
  function iconButton(icon, { id = '', title = '', cls = '', data = {} } = {}) {
    const dataAttrs = Object.entries(data).map(([k, v]) => ` data-${k}="${v}"`).join('');
    return `<button type="button" class="tm-icon-btn${cls ? ' ' + cls : ''}"` +
      `${id ? ` id="${id}"` : ''}${title ? ` title="${title}" aria-label="${title}"` : ''}${dataAttrs}>${icon}</button>`;
  }

  /**
   * 統一コピーボタンのHTMLを返す。クリック処理はイベント委譲で共通化。
   * @param {string} targetId - コピー対象要素のID (textContent / value を読む)
   * @param {object} [opts]
   * @param {string} [opts.title] - ツールチップ / アクセシビリティ文言
   */
  function copyButton(targetId, { title = 'コピー' } = {}) {
    return iconButton(ICONS.copy + ICONS.check, { cls: 'tm-copy-btn', title, data: { 'copy-target': targetId } });
  }

  function readText(el) {
    if (!el) return '';
    return (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') ? el.value : el.textContent;
  }

  function clampInput(id) {
    const el = typeof id === 'string' ? document.getElementById(id) : id;
    if (!el) return;
    el.addEventListener('input', () => {
      if (el.value === '') return;
      const n = parseInt(el.value);
      if (isNaN(n)) return;
      const max = el.hasAttribute('max') ? parseInt(el.max) : null;
      const min = el.hasAttribute('min') ? parseInt(el.min) : null;
      if (max != null && n > max) el.value = max;
      else if (min != null && n < min) el.value = min;
    });
  }

  return { $, qsa, escapeHtml, showToast, svgIco, ICONS, iconButton, copyButton, readText, clampInput };
})();
