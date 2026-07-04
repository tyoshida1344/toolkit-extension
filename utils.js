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
    toastTimer = setTimeout(() => toast.classList.remove('show'), 1400);
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

  function iconButton(icon, { id = '', title = '', cls = '' } = {}) {
    return `<button type="button" class="tm-icon-btn${cls ? ' ' + cls : ''}"` +
      `${id ? ` id="${id}"` : ''}${title ? ` title="${title}" aria-label="${title}"` : ''}>${icon}</button>`;
  }

  function copyButton(targetId, { title = 'コピー' } = {}) {
    return `<button type="button" class="tm-icon-btn tm-copy-btn" data-copy-target="${targetId}" ` +
      `title="${title}" aria-label="${title}">${ICONS.copy}${ICONS.check}</button>`;
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
