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

  // 文字を打ち込む要素か。Delete / Backspace / Ctrl+C などが入力欄自身の編集に使われるため、
  // 画面側のショートカットを発火させてはいけない（色・スライダー・チェックボックスは文字入力ではないので含めない）
  function isTextEntry(el) {
    if (!el || !el.closest) return false;
    if (el.closest('textarea, [contenteditable=""], [contenteditable="true"]')) return true;
    const input = el.closest('input');
    return !!input && !/^(checkbox|radio|range|color|button|submit|reset|file|image|hidden)$/i.test(input.type);
  }

  // スペースキーを自前の操作（native な開閉・切替・入力）に使う要素か
  function usesSpaceKey(el) {
    return isTextEntry(el) || !!(el && el.closest && el.closest('select, input[type="checkbox"], input[type="radio"], input[type="color"]'));
  }

  return { $, qsa, escapeHtml, showToast, readText, clampInput, isTextEntry, usesSpaceKey };
})();
