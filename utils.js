/**
 * utils.js — Toolkit 共通ユーティリティ
 *
 * popup.js (Toolkit IIFE) より先に読み込まれ、_TkUtils 名前空間で公開する。
 * モジュールからは Toolkit.$ / Toolkit.escapeHtml 等として利用する（再公開は popup.js が行う）。
 */
const _TkUtils = (() => {
  const $ = id => document.getElementById(id);
  const qsa = (sel, root = document) => Array.from(root.querySelectorAll(sel));

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
    toast.classList.remove('show', 'error');
    toast.classList.toggle('error', message.startsWith('⚠'));
    void toast.offsetWidth;
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), TOAST_DURATION);
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

  function normalizeHex(hex) {
    hex = String(hex).trim();
    if (!hex.startsWith('#')) hex = '#' + hex;
    if (!/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(hex)) return null;
    if (hex.length === 4) hex = '#' + hex[1] + hex[1] + hex[2] + hex[2] + hex[3] + hex[3];
    return hex;
  }

  return { $, qsa, escapeHtml, showToast, readText, clampInput, normalizeHex };
})();
