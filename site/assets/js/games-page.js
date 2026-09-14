/* ==========================================================================
   賽事分類頁共用渲染：依 data-game-category 顯示該分類的真實賽事
   需先載入 content.js（提供 CPGA_GAMES / CPGA_NEWS.esc）
   ========================================================================== */
(function () {
  'use strict';

  function mount() {
    var host = document.getElementById('gameList');
    if (!host) return;

    var category = host.getAttribute('data-game-category');
    var esc = window.CPGA_NEWS.esc;

    window.CPGA_GAMES.load().then(function (data) {
      /* 只列現行賽事，已停辦者不顯示 */
      var rows = (data.games || []).filter(function (g) {
        return g.category === category && g.active;
      });

      function cards(list) {
        return '<div class="grid grid-3">' + list.map(function (g) {
          return '<div class="card">' +
            '<h3 style="font-size:1.1rem;margin-bottom:.4em">' + esc(g.name) + '</h3>' +
            (g.champion
              ? '<p class="mb-0" style="font-size:.92rem">' +
                '<span class="muted">' + esc(g.champLabel) + '</span> ' +
                '<strong style="color:var(--ink)">' + esc(g.champion) + '</strong>' +
                (g.note ? ' <span class="tag tag--event">' + esc(g.note) + '</span>' : '') +
                '</p>'
              : '<p class="muted mb-0" style="font-size:.92rem">尚無冠軍紀錄</p>') +
            (g.url
              ? '<a class="card__more" href="' + esc(g.url) + '" target="_blank" rel="noopener">賽事詳情 ↗</a>'
              : '') +
            '</div>';
        }).join('') + '</div>';
      }

      host.innerHTML = rows.length
        ? cards(rows)
        : '<p class="muted">此分類目前沒有賽事資料。</p>';

      var src = document.getElementById('gameSrc');
      if (src) {
        src.innerHTML = '賽事資料來源：<strong>' + esc(data.source) + '</strong>　·　' +
          '現行賽事 ' + rows.length + ' 項（不含已停辦）　·　' +
          '點擊「賽事詳情」可查看賽制、歷屆成績與對局紀錄。';
      }
    }).catch(function (err) {
      host.innerHTML = '<p class="muted">賽事資料載入失敗（' + err.message + '）。</p>';
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount);
  } else {
    mount();
  }
})();
