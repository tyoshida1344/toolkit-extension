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

  // message は文字列か、文字列とリンク { text, onClick } を並べた配列。el の中身を置き換え、リンクを含むかを返す
  function renderMessage(el, message) {
    const parts = [].concat(message);
    el.replaceChildren(...parts.map(p => {
      if (typeof p === 'string') return p;
      const a = document.createElement('a');
      a.href = '#';
      a.className = 'tm-link';
      a.textContent = p.text;
      a.addEventListener('click', e => { e.preventDefault(); p.onClick(); });
      return a;
    }));
    return parts.some(p => typeof p !== 'string');
  }

  const TOAST_DURATION = 1400;
  const LINK_TOAST_DURATION = 6000; // リンクを押せるよう長めに出し、ホバー中は消さない
  let toastTimer = null, toastDuration = TOAST_DURATION;
  function hideToastLater(toast) {
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), toastDuration);
  }
  function showToast(message = '📋 コピーしました') {
    let toast = document.getElementById('tm-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'tm-toast';
      toast.className = 'tm-toast';
      // リンク付きのときは、マウスを乗せている間・リンクにフォーカスしている間は消さない
      const pause = () => { if (toast.classList.contains('interactive')) clearTimeout(toastTimer); };
      const resume = () => { if (toast.classList.contains('interactive')) hideToastLater(toast); };
      toast.addEventListener('mouseenter', pause);
      toast.addEventListener('focusin', pause);
      toast.addEventListener('mouseleave', resume);
      toast.addEventListener('focusout', resume);
      document.body.appendChild(toast);
    }
    const hasLink = renderMessage(toast, message);
    toastDuration = hasLink ? LINK_TOAST_DURATION : TOAST_DURATION;
    toast.classList.remove('show', 'error');
    toast.classList.toggle('error', String([].concat(message)[0]).startsWith('⚠'));
    toast.classList.toggle('interactive', hasLink);
    void toast.offsetWidth;
    toast.classList.add('show');
    hideToastLater(toast);
  }

  // ツールがスクリプト注入・キャプチャできるページか。
  // 'ok' / 'file-denied'（file:// だが「ファイルの URL へのアクセスを許可する」がオフ） / 'denied'（chrome:// など）
  async function pageAccess(url) {
    if (/^https?:\/\//i.test(url || '')) return 'ok';
    if (!/^file:\/\//i.test(url || '')) return 'denied';
    const allowed = await chrome.extension.isAllowedFileSchemeAccess().catch(() => false);
    return allowed ? 'ok' : 'file-denied';
  }

  // message（例: 「⚠ このページでは撮影できません」）に、拡張機能の詳細画面へのリンク付きの案内を続ける
  function fileAccessHint(message) {
    const openDetails = () => chrome.tabs.create({ url: `chrome://extensions/?id=${chrome.runtime.id}` });
    return [`${message}。`, { text: 'こちら', onClick: openDetails }, 'からファイルの URL へのアクセスを許可してください。'];
  }

  // tab でツールを使えるなら true。使えなければ message をトーストで出す（file:// で設定がオフなら案内リンクを付ける）
  async function checkPageAccess(tab, message) {
    const access = tab ? await pageAccess(tab.url) : 'denied';
    if (access === 'ok') return true;
    showToast(access === 'file-denied' ? fileAccessHint(message) : message);
    return false;
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

  return {
    $, qsa, escapeHtml, showToast, renderMessage, readText, clampInput, isTextEntry, usesSpaceKey,
    pageAccess, fileAccessHint, checkPageAccess,
  };
})();
