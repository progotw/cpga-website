/* ==========================================================================
   長條文頁面的章節快捷列
   頁面只要有 <nav class="page-toc"> 與其中的錨點連結，載入本檔即自動啟用：
   隨捲動高亮目前章節、點擊平順捲動、右下角回頂端按鈕。
   ========================================================================== */
(function () {
  'use strict';

  var toc = document.querySelector('.page-toc');
  if (!toc) return;

  var bar     = toc.querySelector('.page-toc__inner') || toc;
  var links   = [].slice.call(toc.querySelectorAll('a[href^="#"]'));
  var targets = links.map(function (a) { return document.querySelector(a.getAttribute('href')); });
  if (!links.length) return;

  /* 頁首由 site.js 以 defer 注入，此時尚未存在，因此改讀 CSS 變數而非量 DOM */
  var headerH = parseInt(
    getComputedStyle(document.documentElement).getPropertyValue('--header-h'), 10) || 68;

  function offset() { return headerH + toc.offsetHeight + 12; }

  var topBtn = document.createElement('button');
  topBtn.className = 'to-top';
  topBtn.type = 'button';
  topBtn.setAttribute('aria-label', '回到頁首');
  topBtn.textContent = '↑';
  topBtn.addEventListener('click', function () {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
  document.body.appendChild(topBtn);

  /* 自行處理捲動而不交給瀏覽器的錨點行為：
     字型載入會讓長文版面位移，瀏覽器在載入初期算出的錨點位置會偏掉（實測偏 90px）。
     改在點擊當下量測，就不受先前的位移影響。 */
  links.forEach(function (a, i) {
    a.addEventListener('click', function (e) {
      var el = targets[i];
      if (!el) return;
      e.preventDefault();
      window.scrollTo({
        top: el.getBoundingClientRect().top + window.scrollY - offset(),
        behavior: 'smooth'
      });
      history.replaceState(null, '', a.getAttribute('href'));
    });
  });

  /* 以「頁首與快捷列下緣」為判定線，找出目前所在章節 */
  function sync() {
    var line = offset() + 12;
    var cur = 0;
    targets.forEach(function (el, i) {
      if (el && el.getBoundingClientRect().top <= line) cur = i;
    });
    links.forEach(function (a, i) {
      var on = i === cur;
      a.classList.toggle('is-active', on);
      /* 高亮項目若落在橫向捲動區外，把它帶進可視範圍 */
      if (on && bar.scrollWidth > bar.clientWidth) {
        var l = a.offsetLeft, r = l + a.offsetWidth;
        if (l < bar.scrollLeft || r > bar.scrollLeft + bar.clientWidth) {
          bar.scrollLeft = l - 60;
        }
      }
    });
    topBtn.classList.toggle('is-on', window.scrollY > 600);
  }

  var tick = false;
  window.addEventListener('scroll', function () {
    if (tick) return;
    tick = true;
    requestAnimationFrame(function () { sync(); tick = false; });
  }, { passive: true });

  sync();
  /* 字型載入完成後版面會位移，重算一次高亮 */
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(sync);
})();
