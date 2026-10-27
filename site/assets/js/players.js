/* ==========================================================================
   職業棋士名錄載入器 — 讀取 assets/data/players.json
   資料來源：海峰棋院職業棋士名錄（含照片、簡介與棋戰履歷）
   ========================================================================== */
(function () {
  'use strict';

  var ROOT = (function () {
    var s = document.currentScript && document.currentScript.src;
    return s ? s.replace(/assets\/js\/players\.js.*$/, '') : '';
  })();

  var promise = null;

  window.CPGA_PLAYERS = {
    RANK_ORDER: ['九段', '八段', '七段', '六段', '五段', '四段', '三段', '二段', '初段'],

    load: function () {
      if (!promise) {
        promise = fetch(ROOT + 'assets/data/players.json', { cache: 'no-cache' })
          .then(function (r) {
            if (!r.ok) throw new Error('HTTP ' + r.status);
            return r.json();
          });
      }
      return promise;
    },

    /* players.json 內的 photo 是相對站台根目錄的路徑 */
    photoUrl: function (p) { return p.photo ? ROOT + p.photo : ''; },

    /* 使用者自己填的網址，只放行真的能安全點的協定。

       esc() 只處理 < > & "，擋不住 javascript:。棋士與老師的社群連結
       是他們自己在後台填的，填完就出現在公開頁面上——沒擋的話等於
       開放任何一個帳號在官網上執行程式。 */
    safeUrl: function (u) {
      var s = String(u == null ? '' : u).trim();
      /* 夾雜空白、換行或控制字元可以騙過單純的字首比對，先正規化再判斷，
         但回傳的仍是原字串（只是去頭尾空白）。 */
      var probe = s.replace(/[\s\u0000-\u001f\u00a0\u3000]/g, '').toLowerCase();
      if (/^(https?:\/\/|mailto:|tel:)/.test(probe)) return s;
      /* 沒寫協定但看得出是網域的補上 https://——很多人只填 example.com。
         其餘（javascript:、data:、vbscript: 等）一律不給連結。 */
      if (/^[\w-]+(\.[\w-]+)+(\/|$)/.test(s)) return 'https://' + s;
      return '';
    },

    /* 把外部來源的 HTML 清成只剩排版用的標籤。

       棋士簡介是從海峰的頁面抓來的 HTML，原本直接塞進 innerHTML，
       等於完全信任對方網站。實際用到的標籤只有 p / br / strong / span，
       白名單不會弄壞內容。

       屬性一律刪光——onerror、href、style 這些才是問題所在。 */
    safeHtml: function (html) {
      var OK = { P: 1, BR: 1, STRONG: 1, B: 1, EM: 1, I: 1, SPAN: 1,
                 UL: 1, OL: 1, LI: 1, H3: 1, H4: 1 };
      var DROP = { SCRIPT: 1, STYLE: 1, NOSCRIPT: 1, TEMPLATE: 1,
                   IFRAME: 1, OBJECT: 1, EMBED: 1 };
      var doc = new DOMParser().parseFromString(
        '<div id="r">' + String(html == null ? '' : html) + '</div>', 'text/html');
      var root = doc.getElementById('r');
      if (!root) return '';

      (function walk(node) {
        [].slice.call(node.childNodes).forEach(function (c) {
          if (c.nodeType === 3) return;                       // 文字留著
          if (c.nodeType !== 1) { c.parentNode.removeChild(c); return; }
          if (DROP[c.tagName]) {
            /* 這幾種標籤的「內容」本身就是程式或樣式，不是給人看的文字，
               連同內容整個丟掉——否則 <script> 會變成一行可見的程式碼。 */
            c.parentNode.removeChild(c);
            return;
          }
          if (!OK[c.tagName]) {
            /* 其餘不在白名單的換成它的純文字，不保留標籤也不保留結構。
               這樣不必再往下走，也不會有殘留的屬性。 */
            c.parentNode.replaceChild(doc.createTextNode(c.textContent || ''), c);
            return;
          }
          [].slice.call(c.attributes).forEach(function (a) {
            c.removeAttribute(a.name);
          });
          walk(c);
        });
      })(root);

      return root.innerHTML;
    },


    byId: function (data, id) {
      return (data.players || []).filter(function (p) { return p.id === id; })[0];
    }
  };
})();
