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

    byId: function (data, id) {
      return (data.players || []).filter(function (p) { return p.id === id; })[0];
    }
  };
})();
