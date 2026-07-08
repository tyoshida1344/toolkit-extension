window.FontInspector = { run: function tmFontInspector(action, btnCSS, copyIcon) {
  var HOST_ID = '__tm_font_host';
  var OV_ID = '__tm_font_ov';
  var HL_ID = '__tm_font_hl';

  if (action === 'stop') {
    [HOST_ID, OV_ID, HL_ID].forEach(function(id) {
      var e = document.getElementById(id);
      if (e) e.remove();
    });
    return;
  }

  if (document.getElementById(OV_ID)) return;

  var lastEl = null;
  var current = {};

  var _colorCtx = document.createElement('canvas').getContext('2d');
  function colorToHex(cssColor) {
    _colorCtx.fillStyle = cssColor;
    return _colorCtx.fillStyle;
  }

  function cpBtn(key) {
    return '<button class="cp" data-key="' + key + '" title="コピー" aria-label="コピー">' + copyIcon + '</button>';
  }

  var hl = document.createElement('div');
  hl.id = HL_ID;
  Object.assign(hl.style, {
    position: 'fixed', pointerEvents: 'none', zIndex: '2147483644',
    border: '2px solid #0ea5e9', background: 'rgba(14, 165, 233, 0.08)',
    borderRadius: '2px', display: 'none', transition: 'all 0.05s ease-out',
  });
  document.documentElement.appendChild(hl);

  var ov = document.createElement('div');
  ov.id = OV_ID;
  Object.assign(ov.style, {
    position: 'fixed', inset: '0', zIndex: '2147483645', cursor: 'crosshair',
  });
  document.documentElement.appendChild(ov);

  var host = document.createElement('div');
  host.id = HOST_ID;
  host.style.cssText = 'all:initial;position:fixed;top:12px;right:12px;z-index:2147483647;display:none;';
  var sr = host.attachShadow({ mode: 'open' });
  sr.innerHTML =
    '<style>'
    + btnCSS
    + '.panel{display:flex;flex-direction:column;gap:6px;background:#fff;border:1px solid #d1d5db;border-radius:8px;box-shadow:0 4px 16px rgba(0,0,0,.18);padding:10px;font-family:Segoe UI,Hiragino Sans,Meiryo,sans-serif;min-width:280px;max-width:360px;}'
    + '.hdr{display:flex;align-items:flex-start;justify-content:space-between;gap:8px;}'
    + '.el{font-size:11px;color:#6b7280;font-family:monospace;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;}'
    + '.rows{display:flex;flex-direction:column;gap:4px;}'
    + '.row{display:flex;align-items:center;gap:6px;}'
    + '.lbl{font-size:11px;color:#6b7280;min-width:72px;flex-shrink:0;}'
    + '.val{font-size:13px;color:#111;font-family:monospace;word-break:break-all;flex:1;}'
    + '.swatch{width:14px;height:14px;border-radius:3px;border:1px solid #d1d5db;flex-shrink:0;}'
    + '.cp{flex-shrink:0;}'
    + '.cp svg{width:14px;height:14px;vertical-align:middle;}'
    + '.cp .done{display:none;}'
    + '.cp.copied{color:#22c55e;border-color:#22c55e;}'
    + '.cp.copied .default{display:none;}'
    + '.cp.copied .done{display:inline;}'
    + '</style>'
    + '<div class="panel">'
    + '<div class="hdr"><span class="el" id="fp-el"></span><button class="popup" title="ポップアップを開く" aria-label="ポップアップを開く">↗</button><button class="close" title="閉じる (Esc)" aria-label="閉じる">✕</button></div>'
    + '<div class="rows">'
    + '<div class="row"><span class="lbl">font-family</span><span class="val" id="fp-ff"></span>' + cpBtn('ff') + '</div>'
    + '<div class="row"><span class="lbl">font-size</span><span class="val" id="fp-fs"></span>' + cpBtn('fs') + '</div>'
    + '<div class="row"><span class="lbl">font-weight</span><span class="val" id="fp-fw"></span>' + cpBtn('fw') + '</div>'
    + '<div class="row"><span class="lbl">font-style</span><span class="val" id="fp-fst"></span>' + cpBtn('fst') + '</div>'
    + '<div class="row"><span class="lbl">color</span><span class="swatch" id="fp-csw"></span><span class="val" id="fp-clr"></span>' + cpBtn('clr') + '</div>'
    + '</div>'
    + '</div>';
  document.documentElement.appendChild(host);

  var valueMap = { ff: 'fontFamily', fs: 'fontSize', fw: 'fontWeight', fst: 'fontStyle', clr: 'color' };
  var elEl = sr.getElementById('fp-el');
  var ffEl = sr.getElementById('fp-ff');
  var fsEl = sr.getElementById('fp-fs');
  var fwEl = sr.getElementById('fp-fw');
  var fstEl = sr.getElementById('fp-fst');
  var clrEl = sr.getElementById('fp-clr');
  var cswEl = sr.getElementById('fp-csw');

  function updatePanel(info) {
    current = info;
    host.style.display = '';
    elEl.textContent = info.selector;
    ffEl.textContent = info.fontFamily;
    fsEl.textContent = info.fontSize;
    fwEl.textContent = info.fontWeight;
    fstEl.textContent = info.fontStyle;
    clrEl.textContent = info.color;
    cswEl.style.background = info.color;
  }

  sr.addEventListener('click', function(e) {
    var cp = e.target.closest('.cp');
    if (cp) {
      navigator.clipboard.writeText(current[valueMap[cp.dataset.key]] || '').then(function() {
        cp.classList.add('copied');
        setTimeout(function() { cp.classList.remove('copied'); }, 1500);
      }).catch(function() {});
      return;
    }
    if (e.target.closest('.popup')) {
      chrome.storage.local.set({ tm_fontpick_result: current });
      cleanup();
      chrome.runtime.sendMessage({ type: 'openPopup' });
      return;
    }
    if (e.target.closest('.close')) {
      cleanup();
    }
  });

  ['keydown', 'keyup'].forEach(function(ev) {
    sr.querySelector('.panel').addEventListener(ev, function(e) { e.stopPropagation(); });
  });

  function elementSelector(el) {
    var tag = el.tagName.toLowerCase();
    if (el.id) return tag + '#' + el.id;
    if (el.className && typeof el.className === 'string') {
      var cls = el.className.trim().split(/\s+/).slice(0, 2).join('.');
      if (cls) return tag + '.' + cls;
    }
    return tag;
  }

  function updateHighlight(cx, cy) {
    ov.style.pointerEvents = 'none';
    var el = document.elementFromPoint(cx, cy);
    ov.style.pointerEvents = '';
    if (!el || el === hl || el === host || el === ov) {
      hl.style.display = 'none';
      lastEl = null;
      return;
    }
    if (el !== lastEl) {
      lastEl = el;
      var rect = el.getBoundingClientRect();
      Object.assign(hl.style, {
        left: rect.left + 'px', top: rect.top + 'px',
        width: rect.width + 'px', height: rect.height + 'px',
        display: 'block',
      });
    }
  }

  var rafId = 0;
  var lastX = 0, lastY = 0;
  ov.addEventListener('mousemove', function(e) {
    cancelAnimationFrame(rafId);
    lastX = e.clientX;
    lastY = e.clientY;
    rafId = requestAnimationFrame(function() {
      updateHighlight(lastX, lastY);
    });
  });

  ov.addEventListener('mouseout', function() {
    hl.style.display = 'none';
    lastEl = null;
  });

  ov.addEventListener('click', function(e) {
    e.preventDefault();
    e.stopPropagation();
    if (!lastEl) return;
    var cs = window.getComputedStyle(lastEl);
    updatePanel({
      selector: elementSelector(lastEl),
      fontFamily: cs.fontFamily,
      fontSize: cs.fontSize,
      fontWeight: cs.fontWeight,
      fontStyle: cs.fontStyle,
      color: colorToHex(cs.color),
    });
  });

  ov.addEventListener('wheel', function(e) {
    e.preventDefault();
    window.scrollBy(e.deltaX, e.deltaY);
    updateHighlight(lastX, lastY);
  }, { passive: false });

  function cleanup() {
    cancelAnimationFrame(rafId);
    hl.remove();
    ov.remove();
    host.remove();
    document.removeEventListener('keydown', onKey);
  }

  function onKey(e) {
    if (e.key === 'Escape') { e.preventDefault(); cleanup(); }
  }
  document.addEventListener('keydown', onKey);
} };
