/* ==========================================================================
   新聞文章頁（news/p/<新聞id>.html）
   標題、日期、分享標籤都已經寫在 HTML 裡（LINE、Facebook 的預覽讀得到），
   這支程式只負責補上內文與頁尾的其他消息。
   內文存在 assets/data/articles/<新聞id>.json，由 scripts/fetch_articles.py 轉存。
   ========================================================================== */
(function () {
  'use strict';

  var ROOT = (function () {
    var s = document.currentScript && document.currentScript.src;
    return s ? s.replace(/assets\/js\/article\.js.*$/, '') : '../../';
  })();

  var N = window.CPGA_NEWS, esc = N.esc;
  var id = document.body.getAttribute('data-article') || '';
  var bodyEl = document.getElementById('artBody');
  if (!/^[A-Z0-9]{16,40}$/.test(id) || !bodyEl) return;
  var original = 'https://www.haifong.org/news/content/' + id;

  fetch(ROOT + 'assets/data/articles/' + id + '.json', { cache: 'no-cache' })
    .then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    })
    .then(function (a) {
      bodyEl.innerHTML = N.articleHtml(a.html) ||
        '<p class="muted">這篇消息沒有文字內容。</p>';
      /* 海峰的圖片偶爾會被移除，壞圖就不要留一個破框 */
      [].slice.call(bodyEl.querySelectorAll('img')).forEach(function (img) {
        img.addEventListener('error', function () { img.remove(); });
      });
    })
    .catch(function () {
      bodyEl.innerHTML = '<p class="muted">內文暫時無法載入。</p>' +
        '<p><a href="' + esc(original) + '">到海峰棋院閱讀原文 →</a></p>';
    });

  /* 文章下方列出其他消息，看完可以直接點下一篇，不必回列表 */
  N.load().then(function (data) {
    var rows = (data.items || []).filter(function (n) { return n.id !== id; }).slice(0, 6);
    if (!rows.length) return;
    document.getElementById('artMore').innerHTML = N.render(rows);
    document.getElementById('artMoreBox').hidden = false;
  }).catch(function () { /* 列不出來就不顯示 */ });
})();
