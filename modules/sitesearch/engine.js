/**
 * engine.js — ページ内検索エンジン（MAIN ワールドへ注入・共有）
 * 検索・ハイライト（CSS Custom Highlight API）・スクロール・前後移動を担う唯一の実装で、
 * ポップアップ(index.js)とバー(bar.js)が共有。注入時に直列化されるため外側は参照しない。
 */
window.SiteSearchEngine = (() => {
  // pattern/flags を組み立てる（正規表現 OFF は入力をエスケープ）
  function build(query, o) {
    return {
      pattern: o.regexMode === false ? query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') : query,
      flags: 'g' + (o.caseSensitive ? '' : 'i') + 'm',
    };
  }

  function create() {
    const HL = 'tm-site-search', HL_CUR = 'tm-site-search-current';
    const STYLE_ID = '__tm_search_style';
    const supported = !!(window.CSS && CSS.highlights && typeof Highlight !== 'undefined');
    let ranges = [], current = -1;

    function ensureStyle() {
      if (document.getElementById(STYLE_ID)) return;
      const st = document.createElement('style');
      st.id = STYLE_ID;
      st.textContent = '::highlight(' + HL + '){background:#ffe066;color:#000;}'
        + '::highlight(' + HL_CUR + '){background:#ff9800;color:#000;}';
      (document.head || document.documentElement).appendChild(st);
    }
    function scrollToRange(r) {
      const rc = r.getBoundingClientRect();
      const top = rc.top + (window.scrollY || 0) - ((window.innerHeight || 600) / 2);
      try { window.scrollTo({ top: Math.max(0, top), behavior: 'smooth' }); }
      catch (e) { window.scrollTo(0, Math.max(0, top)); }
    }
    function setCurrent(i) {
      if (!ranges.length) { current = -1; return; }
      const n = ranges.length;
      current = ((i % n) + n) % n;
      const r = ranges[current];
      // 現在の一致を HL_CUR で示し画面内へスクロール
      if (supported) CSS.highlights.set(HL_CUR, new Highlight(r));
      scrollToRange(r);
    }
    function clear() {
      if (window.CSS && CSS.highlights) { CSS.highlights.delete(HL); CSS.highlights.delete(HL_CUR); }
      const st = document.getElementById(STYLE_ID); if (st) st.remove();
      ranges = []; current = -1;
    }
    // テキストノードを連結して正規表現で走査し、一致 Range とスニペットを返す
    function find(pat, fl, max) {
      let re;
      try { re = new RegExp(pat, fl); }
      catch (e) { return { error: 'invalid_regex', message: String((e && e.message) || e) }; }
      const root = document.body || document.documentElement;
      if (!root) return { ranges: [], snippets: [], truncated: false };
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
        acceptNode(node) {
          const t = node.parentNode && node.parentNode.nodeName;
          if (t === 'SCRIPT' || t === 'STYLE' || t === 'NOSCRIPT' || !node.nodeValue) return NodeFilter.FILTER_REJECT;
          return NodeFilter.FILTER_ACCEPT;
        },
      });
      const nodes = []; let full = '', node;
      while ((node = walker.nextNode())) { nodes.push({ node, start: full.length }); full += node.nodeValue; }
      function locate(pos) { // 連結文字列上の位置 → {node, offset} を二分探索
        let lo = 0, hi = nodes.length - 1, ans = 0;
        while (lo <= hi) { const mid = (lo + hi) >> 1; if (nodes[mid].start <= pos) { ans = mid; lo = mid + 1; } else hi = mid - 1; }
        return { node: nodes[ans].node, offset: pos - nodes[ans].start };
      }
      const rs = [], snippets = [], CTX = 40;
      let m, truncated = false;
      re.lastIndex = 0;
      while ((m = re.exec(full)) !== null) {
        const s = m.index, e = m.index + m[0].length;
        if (m[0] !== '') {
          try {
            const a = locate(s), b = locate(e), rg = document.createRange();
            rg.setStart(a.node, a.offset); rg.setEnd(b.node, b.offset);
            rs.push(rg);
            snippets.push({
              before: full.slice(Math.max(0, s - CTX), s),
              match: m[0].length > 200 ? m[0].slice(0, 200) + '…' : m[0],
              after: full.slice(e, e + CTX),
            });
          } catch (err) { /* Range 構築失敗はスキップ */ }
        }
        if (m[0] === '') re.lastIndex++; // 幅ゼロマッチ対策
        if (rs.length >= max) { truncated = true; break; }
      }
      return { ranges: rs, snippets, truncated };
    }

    const step = i => { if (!ranges.length) return { ok: true, count: 0, current: -1 }; setCurrent(i); return { ok: true, count: ranges.length, current }; };
    return {
      // 検索してハイライト＋先頭（または startIdx）へジャンプ
      search(query, o) {
        clear();
        const { pattern, flags } = build(query, o);
        const r = find(pattern, flags, o.max || 2000);
        if (r.error) return { ok: false, error: r.error, message: r.message };
        ranges = r.ranges;
        if (ranges.length) {
          if (supported) { ensureStyle(); CSS.highlights.set(HL, new Highlight(...ranges)); }
          setCurrent(o.startIdx > 0 ? o.startIdx : 0);
        }
        return { ok: true, count: ranges.length, snippets: r.snippets, truncated: r.truncated, current, unsupported: !supported };
      },
      // 件数・スニペットのみ（ハイライトせず既存状態も触らない＝全タブ集計用）
      count(query, o) {
        const { pattern, flags } = build(query, o);
        const r = find(pattern, flags, o.max || 300);
        if (r.error) return { ok: false, error: r.error, message: r.message };
        return { ok: true, count: r.ranges.length, snippets: r.snippets, truncated: r.truncated };
      },
      goto: i => step(i),
      next: () => step(current + 1),
      prev: () => step(current - 1),
      clear: () => { clear(); return { ok: true, count: 0, current: -1 }; },
    };
  }

  // 注入の入口。初回に1度だけエンジンを生成し、以降は action でディスパッチする
  function run(action, query, o) {
    o = o || {};
    if (!window.__tmSearchEngine) window.__tmSearchEngine = create();
    const eng = window.__tmSearchEngine;
    if (action === 'search') return eng.search(query, o);
    if (action === 'count') return eng.count(query, o);
    if (action === 'goto') return eng.goto(o.index);
    if (action === 'clear') return eng.clear();
    return { ok: true }; // 'ensure'（生成だけ）
  }
  return { run };
})();
