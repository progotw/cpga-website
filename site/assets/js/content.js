/* ==========================================================================
   最新消息與賽事清單載入器
   資料：assets/data/news.json、assets/data/games.json（抓自海峰棋院）
   新聞內文不複製到本站，連結導向原站文章頁。
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

    render: function (items, opts) {
      opts = opts || {};
      var self = this;
      return items.map(function (n) {
        return '<a class="news-item" href="' + esc(n.url) + '" target="_blank" rel="noopener">' +
          '<span class="news-item__date">' + n.date.replace(/-/g, '.') + '</span>' +
          '<span class="tag ' + self.catClass(n.cat) + '">' + esc(n.catLabel) + '</span>' +
          '<span class="news-item__title">' + esc(n.title) + '</span>' +
          '<span class="news-item__arrow">↗</span></a>';
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
