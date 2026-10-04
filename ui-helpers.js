/**
 * ui-helpers.js — 共通 UI コンポーネントヘルパー
 *
 * utils.js (_TkUtils) より後、popup.js より先に読み込まれる。
 * モジュールからは Toolkit.iconButton / Toolkit.checkLabel 等として利用する
 * （再公開は popup.js が行う）。
 */
const _TkUI = (() => {
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
    select: svgIco('',
      '<path d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z"></path><path d="M13 13l6 6"></path>'),
    rect: svgIco('', '<rect x="4" y="4" width="16" height="16" rx="2"></rect>'),
    arrow: svgIco('',
      '<line x1="5" y1="19" x2="19" y2="5"></line><polyline points="9 5 19 5 19 15"></polyline>'),
    bubble: svgIco('',
      '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>'),
    text: svgIco('',
      '<polyline points="4 7 4 4 20 4 20 7"></polyline><line x1="9" y1="20" x2="15" y2="20"></line><line x1="12" y1="4" x2="12" y2="20"></line>'),
    trash: svgIco('',
      '<polyline points="3 6 5 6 21 6"></polyline>' +
      '<path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>' +
      '<line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line>'),
    speed: svgIco('',
      '<polygon points="13 19 22 12 13 5 13 19"></polygon><polygon points="2 19 11 12 2 5 2 19"></polygon>'),
  };

  function iconButton(icon, { id = '', title = '', cls = '', data = {} } = {}) {
    const dataAttrs = Object.entries(data).map(([k, v]) => ` data-${k}="${v}"`).join('');
    return `<button type="button" class="tm-icon-btn${cls ? ' ' + cls : ''}"` +
      `${id ? ` id="${id}"` : ''}${title ? ` title="${title}" aria-label="${title}"` : ''}${dataAttrs}>${icon}</button>`;
  }

  function copyButton(targetId, { title = 'コピー' } = {}) {
    return iconButton(ICONS.copy + ICONS.check, { cls: 'tm-copy-btn', title, data: { 'copy-target': targetId } });
  }

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

  return { svgIco, ICONS, iconButton, copyButton, checkLabel, outputRow, toggle, settingsRow, modalHtml };
})();
