window.ColorPicker = { run: function tmScreenPicker(imgSrc) {
  var OV_ID = '__tm_picker__';
  var BAR_ID = '__tm_picker_bar__';

  function startPicker(src) {
    if (document.getElementById(OV_ID)) return;
    var oldBar = document.getElementById(BAR_ID);
    if (oldBar) oldBar.remove();

    var ov = document.createElement('div');
    ov.id = OV_ID;
    Object.assign(ov.style, {
      position: 'fixed', inset: '0', zIndex: '2147483647', cursor: 'crosshair',
    });

    var cvs = document.createElement('canvas');
    cvs.width = window.innerWidth;
    cvs.height = window.innerHeight;
    Object.assign(cvs.style, { position: 'absolute', top: '-9999px', left: '-9999px' });
    ov.appendChild(cvs);

    var info = document.createElement('div');
    Object.assign(info.style, {
      position: 'fixed', zIndex: '2147483648', pointerEvents: 'none',
      display: 'none', alignItems: 'center', gap: '6px',
      background: '#222', color: '#fff', padding: '6px 10px', borderRadius: '6px',
      fontFamily: 'monospace', fontSize: '13px',
      boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
    });
    var swatch = document.createElement('span');
    Object.assign(swatch.style, {
      display: 'inline-block', width: '16px', height: '16px',
      borderRadius: '3px', border: '1px solid rgba(255,255,255,0.4)',
    });
    var hexText = document.createTextNode('');
    info.append(swatch, hexText);
    ov.appendChild(info);

    document.body.appendChild(ov);

    var ctx = cvs.getContext('2d');
    var ready = false;
    var capturing = false;
    var lastHex = '';

    function drawImage(s) {
      ready = false;
      var img = new Image();
      img.onload = function () {
        cvs.width = window.innerWidth;
        cvs.height = window.innerHeight;
        ctx.drawImage(img, 0, 0, img.width, img.height, 0, 0, cvs.width, cvs.height);
        ready = true;
        capturing = false;
      };
      img.onerror = function () { ready = true; capturing = false; };
      img.src = s;
    }
    drawImage(src);

    function recapture() {
      capturing = true;
      info.style.display = 'none';
      chrome.runtime.sendMessage({ type: 'captureTab' }, function (res) {
        if (res && res.dataUrl) drawImage(res.dataUrl);
        else capturing = false;
      });
    }
    var recaptureTimer;
    function scheduleRecapture() {
      clearTimeout(recaptureTimer);
      recaptureTimer = setTimeout(recapture, 200);
    }
    ov.addEventListener('wheel', function (e) {
      e.preventDefault();
      window.scrollBy(e.deltaX, e.deltaY);
      scheduleRecapture();
    }, { passive: false });
    window.addEventListener('resize', scheduleRecapture);

    function pixelHex(x, y) {
      var d = ctx.getImageData(x, y, 1, 1).data;
      return '#' + [d[0], d[1], d[2]].map(function (v) { return v.toString(16).padStart(2, '0'); }).join('');
    }

    var rafId = 0;
    ov.addEventListener('mousemove', function (e) {
      if (!ready || capturing) return;
      cancelAnimationFrame(rafId);
      var cx = e.clientX, cy = e.clientY;
      rafId = requestAnimationFrame(function () {
        lastHex = pixelHex(cx, cy);
        swatch.style.background = lastHex;
        hexText.textContent = lastHex;
        info.style.display = 'flex';
        var ix = cx + 16, iy = cy + 16;
        if (ix + 120 > window.innerWidth) ix = cx - 130;
        if (iy + 30 > window.innerHeight) iy = cy - 40;
        info.style.left = ix + 'px';
        info.style.top = iy + 'px';
      });
    });

    ov.addEventListener('click', function () {
      if (!ready || !lastHex) return;
      chrome.storage.local.set({ tm_eyedrop_result: lastHex });
      cleanup();
      showResultBar(lastHex);
    });

    function cleanup() {
      clearTimeout(recaptureTimer);
      cancelAnimationFrame(rafId);
      ov.remove();
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', scheduleRecapture);
    }
    function onKey(e) { if (e.key === 'Escape') cleanup(); }
    document.addEventListener('keydown', onKey);
  }

  function showResultBar(hex) {
    var old = document.getElementById(BAR_ID);
    if (old) old.remove();

    var host = document.createElement('div');
    host.id = BAR_ID;
    host.style.cssText = 'all:initial;position:fixed;top:12px;right:12px;z-index:2147483647;';
    var sr = host.attachShadow({ mode: 'open' });
    sr.innerHTML =
      '<style>'
      + ':host{all:initial;}'
      + '.bar{display:flex;align-items:center;gap:6px;background:#fff;border:1px solid #d1d5db;border-radius:8px;box-shadow:0 4px 16px rgba(0,0,0,.18);padding:6px;font-family:Segoe UI,Hiragino Sans,Meiryo,sans-serif;}'
      + '.swatch{width:24px;height:24px;border-radius:6px;border:1px solid #d1d5db;flex-shrink:0;}'
      + '.hex{font-family:monospace;font-size:14px;color:#111;}'
      + 'button{height:28px;min-width:28px;border:1px solid #d1d5db;border-radius:6px;background:#fff;color:#374151;cursor:pointer;font-size:12px;font-weight:600;padding:0 6px;line-height:1;}'
      + 'button:hover{background:#f3f4f6;}'
      + '.copy svg{width:16px;height:16px;vertical-align:middle;}'
      + '.copy .done{display:none;}'
      + '.copy.copied{color:#22c55e;border-color:#22c55e;}'
      + '.copy.copied .default{display:none;}'
      + '.copy.copied .done{display:inline;}'
      + '</style>'
      + '<div class="bar">'
      + '<span class="swatch" style="background:' + hex + '"></span>'
      + '<span class="hex">' + hex + '</span>'
      + '<button class="copy" title="HEX をコピー" aria-label="HEX をコピー">'
      + '<svg class="default" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>'
      + '<svg class="done" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>'
      + '</button>'
      + '<button class="pick" title="もう一度スポイト" aria-label="もう一度スポイト">💉</button>'
      + '<button class="popup" title="ポップアップを開く" aria-label="ポップアップを開く">↗</button>'
      + '<button class="close" title="閉じる" aria-label="閉じる">✕</button>'
      + '</div>';
    document.documentElement.appendChild(host);

    var copyBtn = sr.querySelector('.copy');
    copyBtn.addEventListener('click', function () {
      navigator.clipboard.writeText(hex).then(function () {
        copyBtn.classList.add('copied');
        setTimeout(function () { copyBtn.classList.remove('copied'); }, 1500);
      });
    });
    sr.querySelector('.pick').addEventListener('click', function () {
      host.style.display = 'none';
      chrome.runtime.sendMessage({ type: 'captureTab' }, function (res) {
        if (res && res.dataUrl) { host.remove(); startPicker(res.dataUrl); }
        else host.style.display = '';
      });
    });
    sr.querySelector('.popup').addEventListener('click', function () {
      chrome.runtime.sendMessage({ type: 'openPopup' });
    });
    sr.querySelector('.close').addEventListener('click', function () { host.remove(); });
    document.addEventListener('keydown', function onBarKey(e) {
      if (e.key === 'Escape') { host.remove(); document.removeEventListener('keydown', onBarKey); }
    });
  }

  startPicker(imgSrc);
} };
