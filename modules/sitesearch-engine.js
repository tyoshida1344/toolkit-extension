/**
 * sitesearch-engine.js — ページ内検索エンジン（注入用・共有）
 *
 * MAIN ワールドへ注入され、ページに window.__tmSearchEngine を用意する。検索・全件
 * ハイライト（CSS Custom Highlight API）・現在位置の枠・スクロール・前後移動を担い、
 * ポップアップ(sitesearch.js)とバー(sitesearch-bar.js)の両方から使う共通実装。
 * run() を window.SiteSearchEngine.run で公開。注入時に直列化されるため外側は参照しない。
 */
window.SiteSearchEngine = (() => {
  function run(action, pattern, flags, index, maxMatches) {
    if (!window.__tmSearchEngine) {
      window.__tmSearchEngine = (() => {
        const HL = 'tm-site-search', HL_CUR = 'tm-site-search-current';
        const STYLE_ID = '__tm_search_style', BOX_ID = '__tm_search_box';
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
        function boxEl() {
          let b = document.getElementById(BOX_ID);
          if (!b) {
            b = document.createElement('div');
            b.id = BOX_ID;
            b.style.cssText = 'position:absolute;z-index:2147483646;pointer-events:none;'
              + 'background:rgba(255,152,0,.30);outline:2px solid #ff9800;border-radius:2px;';
            (document.body || document.documentElement).appendChild(b);
          }
          return b;
        }
        function placeBox(r) {
          if (!r) return;
          const rc = r.getBoundingClientRect(), b = boxEl();
          b.style.top = (rc.top + (window.scrollY || 0)) + 'px';
          b.style.left = (rc.left + (window.scrollX || 0)) + 'px';
          b.style.width = rc.width + 'px';
          b.style.height = rc.height + 'px';
          b.style.display = (rc.width || rc.height) ? 'block' : 'none';
        }
        function scrollToRange(r) {
          if (!r) return;
          const rc = r.getBoundingClientRect();
          const top = rc.top + (window.scrollY || 0) - ((window.innerHeight || 600) / 2);
          try { window.scrollTo({ top: Math.max(0, top), behavior: 'smooth' }); }
          catch (e) { window.scrollTo(0, Math.max(0, top)); }
        }
        function bindReflow() { // リサイズ・スクロールに枠を追従（一度だけ・rAF で間引く）
          if (window.__tmSearchReflow) return;
          let ticking = false;
          window.__tmSearchReflow = () => {
            if (ticking) return;
            ticking = true;
            requestAnimationFrame(() => { ticking = false; if (ranges[current]) placeBox(ranges[current]); });
          };
          window.addEventListener('resize', window.__tmSearchReflow);
          window.addEventListener('scroll', window.__tmSearchReflow, true);
        }
        function setCurrent(i) {
          if (!ranges.length) { current = -1; return -1; }
          const n = ranges.length;
          current = ((i % n) + n) % n;
          const r = ranges[current];
          if (supported) CSS.highlights.set(HL_CUR, new Highlight(r));
          scrollToRange(r); placeBox(r); bindReflow();
          return current;
        }
        function clear() {
          if (window.CSS && CSS.highlights) { CSS.highlights.delete(HL); CSS.highlights.delete(HL_CUR); }
          const st = document.getElementById(STYLE_ID); if (st) st.remove();
          const b = document.getElementById(BOX_ID); if (b) b.remove();
          if (window.__tmSearchReflow) {
            window.removeEventListener('resize', window.__tmSearchReflow);
            window.removeEventListener('scroll', window.__tmSearchReflow, true);
            window.__tmSearchReflow = null;
          }
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
              const p = node.parentNode;
              if (!p) return NodeFilter.FILTER_REJECT;
              const t = p.nodeName;
              if (t === 'SCRIPT' || t === 'STYLE' || t === 'NOSCRIPT') return NodeFilter.FILTER_REJECT;
              return node.nodeValue ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
            },
          });
          const nodes = []; let full = '', node;
          while ((node = walker.nextNode())) { nodes.push({ node, start: full.length }); full += node.nodeValue; }
          function locate(pos) {
            let lo = 0, hi = nodes.length - 1, ans = 0;
            while (lo <= hi) { const mid = (lo + hi) >> 1; if (nodes[mid].start <= pos) { ans = mid; lo = mid + 1; } else hi = mid - 1; }
            const nn = nodes[ans]; return { node: nn.node, offset: pos - nn.start };
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
        return {
          supported,
          // 検索してハイライト＋先頭（または startIdx）へジャンプ
          search(pat, fl, max, startIdx) {
            clear();
            const r = find(pat, fl, max);
            if (r.error) return { ok: false, error: r.error, message: r.message };
            ranges = r.ranges;
            if (ranges.length) {
              if (supported) { ensureStyle(); CSS.highlights.set(HL, new Highlight(...ranges)); }
              setCurrent(startIdx > 0 ? startIdx : 0);
            }
            return { ok: true, count: ranges.length, snippets: r.snippets, truncated: r.truncated, current: ranges.length ? current : -1, unsupported: !supported };
          },
          // 件数・スニペットのみ（ハイライトしない＝全タブ集計用）
          count(pat, fl, max) {
            const r = find(pat, fl, max);
            if (r.error) return { ok: false, error: r.error, message: r.message };
            return { ok: true, count: r.ranges.length, snippets: r.snippets, truncated: r.truncated };
          },
          goto(i) { if (!ranges.length) return { ok: true, count: 0, current: -1 }; setCurrent(i); return { ok: true, count: ranges.length, current }; },
          next() { if (!ranges.length) return { ok: true, count: 0, current: -1 }; setCurrent(current + 1); return { ok: true, count: ranges.length, current }; },
          prev() { if (!ranges.length) return { ok: true, count: 0, current: -1 }; setCurrent(current - 1); return { ok: true, count: ranges.length, current }; },
          clear() { clear(); return { ok: true, count: 0, current: -1 }; },
        };
      })();
    }
    const eng = window.__tmSearchEngine;
    switch (action) {
      case 'ensure': return { ok: true };
      case 'search': return eng.search(pattern, flags, maxMatches, (typeof index === 'number' && index >= 0) ? index : 0);
      case 'count': return eng.count(pattern, flags, maxMatches);
      case 'goto': return eng.goto(index);
      case 'clear': return eng.clear();
      default: return { ok: false, error: 'unknown_action' };
    }
  }
  return { run };
})();
