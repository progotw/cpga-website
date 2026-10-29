/* ==========================================================================
   最新消息與賽事清單載入器
   資料：assets/data/news.json、assets/data/games.json（抓自海峰棋院）
   新聞內文由 scripts/fetch_articles.py 每天分批轉存到 assets/data/articles/，
   在本站的 news/article.html 閱讀；還沒轉存的，文章頁會轉去海峰原文。
   ========================================================================== */
(function () {
  'use strict';

  var ROOT = (function () {
    var s = document.currentScript && document.currentScript.src;
    return s ? s.replace(/assets\/js\/content\.js.*$/, '') : '';
  })();

  function loader(file) {
    var promise = null;
    return function () {
      if (!promise) {
        promise = fetch(ROOT + 'assets/data/' + file, { cache: 'no-cache' })
          .then(function (r) {
            if (!r.ok) throw new Error('HTTP ' + r.status);
            return r.json();
          });
      }
      return promise;
    };
  }

  var HAIFONG_NEWS = /^https?:\/\/(?:www\.)?haifong\.org\/news\/content\/([A-Za-z0-9]+)/;
  var HAIFONG_IMG = /^https:\/\/www\.haifong\.org\/upload\//;

  var CAT_CLS = {
    match: 'tag--match',
    event: 'tag--event',
    media: 'tag--media',
    notice: 'tag--notice'
  };

  window.CPGA_NEWS = {
    load: loader('news.json'),
    catClass: function (cat) { return CAT_CLS[cat] || 'tag--notice'; },

    /* 依實際資料產生分類清單，避免出現沒有任何文章的分類 */
    categories: function (items) {
      var seen = {}, out = [];
      items.forEach(function (n) {
        if (!seen[n.cat]) {
          seen[n.cat] = 1;
          out.push({ cat: n.cat, label: n.catLabel });
        }
      });
      return out;
    },

    /* 本站文章頁的網址。可以給新聞 id，也可以給海峰的新聞網址。 */
    href: function (idOrUrl) {
      var m = HAIFONG_NEWS.exec(idOrUrl || '');
      return ROOT + 'news/article.html?id=' + encodeURIComponent(m ? m[1] : (idOrUrl || ''));
    },

    /* 文章內文。轉存時已經過濾過一次（scripts/fetch_articles.py），這裡再過濾一次：
       內文來自別人的網站，不能只靠一道防線。
       只留排版標籤；圖片只接受海峰上傳區的，連結只接受 http(s) 與 mailto，
       影片只接受 YouTube 影片編號，其餘屬性全部拿掉。 */
    articleHtml: function (html) {
      var OK = { P: 1, BR: 1, STRONG: 1, EM: 1, UL: 1, OL: 1, LI: 1, BLOCKQUOTE: 1,
                 HR: 1, H3: 1, H4: 1, TABLE: 1, THEAD: 1, TBODY: 1, TR: 1, TD: 1, TH: 1,
                 A: 1, IMG: 1, DIV: 1 };
      var self = this, imgs = 0;
      var doc = new DOMParser().parseFromString(
        '<div id="r">' + String(html == null ? '' : html) + '</div>', 'text/html');
      var root = doc.getElementById('r');
      if (!root) return '';

      (function walk(node) {
        [].slice.call(node.childNodes).forEach(function (c) {
          if (c.nodeType === 3) return;
          if (c.nodeType !== 1 || !OK[c.tagName]) { c.parentNode.removeChild(c); return; }
          var get = function (k) { return c.getAttribute(k) || ''; };
          var src = get('src'), href = get('href'), yt = get('data-yt'),
              colspan = get('colspan'), rowspan = get('rowspan');
          [].slice.call(c.attributes).forEach(function (a) { c.removeAttribute(a.name); });

          if (c.tagName === 'IMG') {
            if (!HAIFONG_IMG.test(src)) { c.parentNode.removeChild(c); return; }
            c.setAttribute('src', src);
            c.setAttribute('alt', '');
            /* 第一張通常是封面，在第一屏，不要延後載入 */
            if (imgs++) c.setAttribute('loading', 'lazy');
            c.setAttribute('decoding', 'async');
            return;
          }
          if (c.tagName === 'DIV') {
            if (!/^[\w-]{11}$/.test(yt)) { c.parentNode.removeChild(c); return; }
            c.className = 'article-video';
            c.textContent = '';
            var f = doc.createElement('iframe');
            f.setAttribute('src', 'https://www.youtube-nocookie.com/embed/' + yt);
            f.setAttribute('title', 'YouTube 影片');
            f.setAttribute('loading', 'lazy');
            f.setAttribute('allow', 'encrypted-media; picture-in-picture; fullscreen');
            f.setAttribute('allowfullscreen', '');
            /* YouTube 要知道是哪個網站嵌入的，不給來源會顯示錯誤畫面 */
            f.setAttribute('referrerpolicy', 'strict-origin-when-cross-origin');
            c.appendChild(f);
            return;
          }
          if (c.tagName === 'A') {
            var m = HAIFONG_NEWS.exec(href);
            /* 文章裡連到其他海峰新聞的，也改成本站文章頁 */
            href = m ? self.href(m[1]) : (/^(https?:|mailto:)/i.test(href) ? href : '');
            if (href) c.setAttribute('href', href);
          }
          if (c.tagName === 'TD' || c.tagName === 'TH') {
            if (/^\d{1,2}$/.test(colspan)) c.setAttribute('colspan', colspan);
            if (/^\d{1,2}$/.test(rowspan)) c.setAttribute('rowspan', rowspan);
          }
          walk(c);
        });
      })(root);

      /* 寬表格包一層，手機上可以左右捲動，不會撐破版面 */
      [].slice.call(root.querySelectorAll('table')).forEach(function (tb) {
        var w = doc.createElement('div');
        w.className = 'article-table';
        tb.parentNode.insertBefore(w, tb);
        w.appendChild(tb);
      });
      return root.innerHTML;
    },

    render: function (items, opts) {
      opts = opts || {};
      var self = this;
      return items.map(function (n) {
        return '<a class="news-item" href="' + esc(self.href(n.id || n.url)) + '">' +
          '<span class="news-item__date">' + n.date.replace(/-/g, '.') + '</span>' +
          '<span class="tag ' + self.catClass(n.cat) + '">' + esc(n.catLabel) + '</span>' +
          '<span class="news-item__title">' + esc(n.title) + '</span>' +
          '<span class="news-item__arrow">→</span></a>';
      }).join('') || (opts.empty || '<p class="muted" style="padding:20px 0">目前沒有消息。</p>');
    }
  };

  window.CPGA_GAMES = { load: loader('games.json') };

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  window.CPGA_NEWS.esc = esc;
})();
