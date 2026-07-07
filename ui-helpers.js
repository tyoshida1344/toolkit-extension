/**
 * ui-helpers.js — 共通 UI コンポーネントヘルパー
 *
 * utils.js (_TkUtils) より後、popup.js より先に読み込まれる。
 * モジュールからは Toolkit.checkLabel 等として利用する（再公開は popup.js が行う）。
 */
const _TkUI = (() => {
  const { iconButton, copyButton } = _TkUtils;

  function checkLabel(id, text, { checked, cls, title, labelId } = {}) {
    const labelCls = cls || 'tm-check-label';
    const attrs = [
      `class="${labelCls}"`,
      labelId ? `id="${labelId}"` : '',
      title ? `title="${title}"` : '',
    ].filter(Boolean).join(' ');
    return `<label ${attrs}><input type="checkbox" id="${id}"${checked ? ' checked' : ''}>${text}</label>`;
  }

  function outputRow(id, defaultText, { extra } = {}) {
    return `<div class="tm-inline">` +
      `<div class="tm-output" id="${id}" style="flex:1;min-height:auto">${defaultText || ''}</div>` +
      copyButton(id) +
      (extra || '') +
    `</div>`;
  }

  function toggle({ id, cls, checked, disabled, aria, data } = {}) {
    const parts = [
      cls ? `class="${cls}"` : '',
      id ? `id="${id}"` : '',
      checked ? 'checked' : '',
      disabled ? 'disabled' : '',
      aria ? `aria-label="${aria}"` : '',
    ].filter(Boolean).join(' ');
    const dataAttrs = data ? Object.entries(data).map(([k, v]) => ` data-${k}="${v}"`).join('') : '';
    return `<label class="tm-switch">` +
      `<input type="checkbox"${parts ? ' ' + parts : ''}${dataAttrs}>` +
      `<span class="tm-switch-slider"></span>` +
    `</label>`;
  }

  function settingsRow(icon, label, content, { cls, id, data, draggable, handle } = {}) {
    const wrapParts = [
      `class="tm-settings-row${cls ? ' ' + cls : ''}"`,
      id ? `id="${id}"` : '',
      draggable ? 'draggable="true"' : '',
    ].filter(Boolean).join(' ');
    const dataAttrs = data ? Object.entries(data).map(([k, v]) => ` data-${k}="${v}"`).join('') : '';
    const handleHtml = handle
      ? '<span class="tm-tabcfg-handle" title="ドラッグで並び替え" aria-hidden="true">⠿</span>'
      : '';
    return `<div ${wrapParts}${dataAttrs}>` +
      handleHtml +
      `<span class="tm-settings-icon">${icon}</span>` +
      `<span class="tm-settings-label">${label}</span>` +
      content +
    `</div>`;
  }

  function modalHtml(id, title, bodyHtml, { cls, modalCls, closeId, bodyId } = {}) {
    const close = closeId ? iconButton('✕', { id: closeId, title: '閉じる' }) : '';
    return `<div class="tm-modal-overlay${cls ? ' ' + cls : ''}" id="${id}" hidden>` +
      `<div class="tm-modal${modalCls ? ' ' + modalCls : ''}">` +
        `<div class="tm-modal-header"><span>${title}</span>${close}</div>` +
        `<div class="tm-modal-body"${bodyId ? ` id="${bodyId}"` : ''}>${bodyHtml}</div>` +
      `</div>` +
    `</div>`;
  }

  return { checkLabel, outputRow, toggle, settingsRow, modalHtml };
})();
