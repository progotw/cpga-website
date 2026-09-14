/* ==========================================================================
   賽程資料載入器 — 讀取 assets/data/schedule.json
   資料由 calendar-viewer 的 calendar_list.py --json 產生（海峰棋院公開行事曆）
   ========================================================================== */
(function () {
  'use strict';

  var ROOT = (function () {
    var s = document.currentScript && document.currentScript.src;
    return s ? s.replace(/assets\/js\/schedule\.js.*$/, '') : '';
  })();

  var promise = null;

  function pad(n) { return n < 10 ? '0' + n : '' + n; }

  window.CPGA_SCHEDULE = {
    /* 回傳 Promise<{schema_version, generated, source, range, count, events}> */
    load: function () {
      if (!promise) {
        promise = fetch(ROOT + 'assets/data/schedule.json', { cache: 'no-cache' })
          .then(function (r) {
            if (!r.ok) throw new Error('HTTP ' + r.status);
            return r.json();
          });
      }
      return promise;
    },

    /* 同系列固定同色，slot 由產生端給定（0–7） */
    slotClass: function (slot) { return 'ev-s' + ((slot || 0) % 8); },

    /* 每個配色編號的顯示名稱。
       不直接用 series —— 那是正規化過的分組鍵（異體字會被統一，例如「玄樂盃」變「玄樂杯」）。
       改以該系列中最常出現的 name 當標籤，確保畫面上永遠是日曆原文的用字。 */
    seriesLabels: function (events) {
      var bySlot = {};
      events.forEach(function (e) {
        var s = (e.series_slot || 0) % 8;
        (bySlot[s] = bySlot[s] || []).push(e.name);
      });
      var out = {};
      Object.keys(bySlot).forEach(function (s) {
        var counts = {}, best = null, bestN = 0;
        bySlot[s].forEach(function (n) {
          counts[n] = (counts[n] || 0) + 1;
          if (counts[n] > bestN) { bestN = counts[n]; best = n; }
        });
        out[s] = best;
      });
      return out;
    },

    /* 今天（本機時區）YYYY-MM-DD */
    today: function () {
      var d = new Date();
      return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
    },

    /* 「11:00 起」；當天兩局顯示「10:00、14:00」；推定時間加註星號 */
    timeLabel: function (e) {
      var list = (e.sessions && e.sessions.length) ? e.sessions : (e.time ? [e.time] : []);
      if (!list.length) return '整天';
      var star = e.time_inferred ? '＊' : '';
      return list.length > 1
        ? list.join('、') + star + '（兩局）'
        : list[0] + ' 起' + star;
    },

    /* 「玄樂盃 本賽32強」 */
    fullTitle: function (e) {
      return e.round ? e.name + ' ' + e.round : e.name;
    },

    /* 資料產生時間，如 2026.09.11 13:20 */
    generatedLabel: function (data) {
      if (!data.generated) return '';
      var d = new Date(data.generated);
      if (isNaN(d)) return data.generated;
      return d.getFullYear() + '.' + pad(d.getMonth() + 1) + '.' + pad(d.getDate()) +
        ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
    },

    pad: pad
  };
})();
