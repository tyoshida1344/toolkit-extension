/**
 * bar.js — ページ常駐の検索バー UI（MAIN ワールドへ注入）
 * 検索本体は持たず window.__tmSearchEngine（呼び出し側が先に ensure 済み）を呼ぶだけ。
 * window.SiteSearchBar.install で公開。注入時に直列化されるため外側は参照しない。
 */
window.SiteSearchBar = (() => {
  function install(initialQuery, regexOn, caseOn) {
    const HOST_ID = '__tm_search_bar_host';
    const existing = document.getElementById(HOST_ID);
    if (existing && existing.__tmFocus) { existing.__tmFocus(); return; } // 二度押しは再フォーカス

    const engine = window.__tmSearchEngine;
    if (!engine) return;

    let reOn = regexOn !== false, ciOn = !!caseOn, lastQuery = null;

    const updateCount = res => { countEl.textContent = (res && res.count) ? ((res.current + 1) + ' / ' + res.count) : (lastQuery ? '0 件' : ''); };
    function doSearch() {
      lastQuery = input.value;
      if (!input.value) { engine.clear(); updateCount(null); return; }
      const res = engine.search(input.value, { regexMode: reOn, caseSensitive: ciOn, max: 2000 });
      if (res && res.error) { countEl.textContent = '正規表現エラー'; return; }
      updateCount(res);
    }
    function step(dir) {
      if (input.value !== lastQuery) { doSearch(); return; } // 入力が変わっていれば検索し直す
      updateCount(dir > 0 ? engine.next() : engine.prev());
    }
    function close() { engine.clear(); const h = document.getElementById(HOST_ID); if (h) h.remove(); }

    // ── UI（Shadow DOM でページ CSS から隔離） ──
    const host = document.createElement('div');
    host.id = HOST_ID;
    host.style.cssText = 'all:initial;position:fixed;top:12px;right:12px;z-index:2147483647;';
    const sr = host.attachShadow({ mode: 'open' });
    sr.innerHTML =
      '<style>'
      + ':host{all:initial;}'
      + '.bar{display:flex;align-items:center;gap:4px;background:#fff;border:1px solid #d1d5db;border-radius:8px;box-shadow:0 4px 16px rgba(0,0,0,.18);padding:6px;font-family:Segoe UI,Hiragino Sans,Meiryo,sans-serif;}'
      + '.q{width:180px;height:28px;border:1px solid #d1d5db;border-radius:6px;padding:0 8px;font-size:13px;outline:none;color:#111;background:#fff;}'
      + '.q:focus{border-color:#0ea5e9;}'
      + 'button{height:28px;min-width:28px;border:1px solid #d1d5db;border-radius:6px;background:#fff;color:#374151;cursor:pointer;font-size:12px;font-weight:600;padding:0 6px;line-height:1;}'
      + 'button:hover{background:#f3f4f6;}'
      + 'button.on{background:#e0f2fe;color:#0284c7;border-color:#bae6fd;}'
      + '.cnt{min-width:52px;text-align:center;color:#6b7280;font-size:11px;white-space:nowrap;}'
      + '</style>'
      + '<div class="bar">'
      + '<input class="q" type="text" placeholder="ページ内を検索" spellcheck="false">'
      + '<button class="opt re" title="正規表現として検索">.*</button>'
      + '<button class="opt ci" title="大文字小文字を区別">Aa</button>'
      + '<span class="cnt"></span>'
      + '<button class="prev" title="前へ (Shift+Enter)">▲</button>'
      + '<button class="next" title="次へ (Enter)">▼</button>'
      + '<button class="close" title="閉じる (Esc)">✕</button>'
      + '</div>';
    document.documentElement.appendChild(host);

    const input = sr.querySelector('.q');
    const countEl = sr.querySelector('.cnt');
    const reBtn = sr.querySelector('.re');
    const ciBtn = sr.querySelector('.ci');
    reBtn.classList.toggle('on', reOn);
    ciBtn.classList.toggle('on', ciOn);
    input.value = initialQuery || '';
    host.__tmFocus = () => { input.focus(); input.select(); };

    input.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); step(e.shiftKey ? -1 : 1); }
      else if (e.key === 'Escape') { e.preventDefault(); close(); }
    });
    sr.querySelector('.next').addEventListener('click', () => step(1));
    sr.querySelector('.prev').addEventListener('click', () => step(-1));
    sr.querySelector('.close').addEventListener('click', close);
    reBtn.addEventListener('click', () => { reOn = !reOn; reBtn.classList.toggle('on', reOn); doSearch(); });
    ciBtn.addEventListener('click', () => { ciOn = !ciOn; ciBtn.classList.toggle('on', ciOn); doSearch(); });

    host.__tmFocus();
    if (input.value) doSearch();
  }
  return { install };
})();
