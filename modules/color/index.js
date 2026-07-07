Toolkit.registerTab({
  html: `
    <div class="tm-row">
      <label class="tm-label">カラーピッカー</label>
      <div class="tm-inline">
        <input type="color" id="cl-picker" value="#0ea5e9"
          style="width:48px;height:34px;padding:2px;background:none;border:1px solid var(--tm-border-strong);border-radius:4px;cursor:pointer">
        <input type="text" class="tm-input" id="cl-hex" value="#0ea5e9" style="flex:1" placeholder="#RRGGBB">
        <button class="tm-btn tm-btn-primary tm-btn-sm" id="cl-apply">適用</button>
        ${Toolkit.iconButton('💉', { id: 'cl-eyedrop', title: '画面上の色を取得（スポイト）' })}
      </div>
    </div>
    <div class="tm-color-preview" id="cl-preview" style="background:#0ea5e9"></div>
    <div class="tm-color-grid">
      <div class="tm-row">
        <label class="tm-label">HEX</label>
        <div class="tm-inline">
          <div class="tm-output" id="cl-hex-out" style="flex:1;min-height:auto">#0ea5e9</div>
          ${Toolkit.copyButton('cl-hex-out')}
        </div>
      </div>
      <div class="tm-row">
        <label class="tm-label">RGB</label>
        <div class="tm-inline">
          <div class="tm-output" id="cl-rgb-out" style="flex:1;min-height:auto">rgb(14, 165, 233)</div>
          ${Toolkit.copyButton('cl-rgb-out')}
        </div>
      </div>
      <div class="tm-row">
        <label class="tm-label">HSL</label>
        <div class="tm-inline">
          <div class="tm-output" id="cl-hsl-out" style="flex:1;min-height:auto">hsl(199, 89%, 48%)</div>
          ${Toolkit.copyButton('cl-hsl-out')}
        </div>
      </div>
      <div class="tm-row">
        <label class="tm-label">RGB 10進</label>
        <div class="tm-inline">
          <div class="tm-output" id="cl-dec-out" style="flex:1;min-height:auto">14, 165, 233</div>
          ${Toolkit.copyButton('cl-dec-out')}
        </div>
      </div>
    </div>
  `,
  init() {
    function hexToRgb(hex) {
      hex = hex.replace('#', '');
      if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
      const n = parseInt(hex, 16);
      return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
    }

    function rgbToHsl(r, g, b) {
      r /= 255; g /= 255; b /= 255;
      const max = Math.max(r, g, b), min = Math.min(r, g, b);
      let h, s, l = (max + min) / 2;
      if (max === min) { h = s = 0; }
      else {
        const d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        switch (max) {
          case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
          case g: h = ((b - r) / d + 2) / 6; break;
          case b: h = ((r - g) / d + 4) / 6; break;
        }
      }
      return { h: Math.round(h * 360), s: Math.round(s * 100), l: Math.round(l * 100) };
    }

    const save = Toolkit.bindState('color', {}, {
      extra: () => ({ hex: Toolkit.$('cl-hex').value }),
      onRestore(s) { if (s && s.hex) updateColor(s.hex); },
    });

    function updateColor(hex) {
      hex = hex.startsWith('#') ? hex : '#' + hex;
      if (!/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(hex)) return;
      const { r, g, b } = hexToRgb(hex);
      const { h, s, l } = rgbToHsl(r, g, b);
      const full = '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
      Toolkit.$('cl-picker').value = full;
      Toolkit.$('cl-hex').value = full;
      Toolkit.$('cl-preview').style.background = full;
      Toolkit.$('cl-hex-out').textContent = full;
      Toolkit.$('cl-rgb-out').textContent = `rgb(${r}, ${g}, ${b})`;
      Toolkit.$('cl-hsl-out').textContent = `hsl(${h}, ${s}%, ${l}%)`;
      Toolkit.$('cl-dec-out').textContent = `${r}, ${g}, ${b}`;
      save();
    }

    Toolkit.$('cl-picker').addEventListener('input', e => updateColor(e.target.value));
    Toolkit.$('cl-apply').addEventListener('click', () =>
      updateColor(Toolkit.$('cl-hex').value.trim()));
    Toolkit.$('cl-hex').addEventListener('keydown', e => {
      if (e.key === 'Enter') updateColor(e.target.value.trim());
    });

    Toolkit.$('cl-eyedrop').addEventListener('click', async () => {
      const tabs = typeof chrome !== 'undefined' && chrome.tabs;
      if (!tabs) {
        alert('このブラウザはスポイト機能に対応していません。');
        return;
      }
      let tab;
      try {
        const list = await tabs.query({ active: true, currentWindow: true });
        tab = list && list[0];
      } catch (_) {}
      if (!tab || !/^https?:\/\//.test(tab.url || '')) {
        alert('このページではスポイト機能を使用できません。\nhttp(s) ページで使用してください。');
        return;
      }
      let dataUrl;
      try {
        dataUrl = await chrome.tabs.captureVisibleTab(null, { format: 'png' });
      } catch (e) {
        alert('スクリーンショットの取得に失敗しました。\n' + (e.message || e));
        return;
      }
      const picker = window.ColorPicker && window.ColorPicker.run;
      if (!picker) { alert('スポイトの初期化に失敗しました。'); return; }
      try {
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: picker,
          args: [dataUrl],
        });
        window.close();
      } catch (_) {
        alert('スポイトの起動に失敗しました。');
      }
    });

    // スポイトで選んだ色は persistAllowed を経由しない一時キーで受け渡す
    if (typeof chrome !== 'undefined' && chrome.storage) {
      chrome.storage.local.get('tm_eyedrop_result', data => {
        const hex = data.tm_eyedrop_result;
        if (hex) {
          updateColor(hex);
          chrome.storage.local.remove('tm_eyedrop_result');
        }
      });
    }
  },
});
