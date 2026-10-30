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
    /* 五個系列循環。顏色只是輔助，系列名稱一直顯示在圓點旁邊。 */
    slotClass: function (slot) { return 'ev-s' + ((slot || 0) % 5); },

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

    /* 「11:00 開賽」；當天兩局顯示「10:00、14:00（兩局）」。
       原本推定的時間會加註星號，但星號沒有就近說明，看的人不知道是什麼意思，
       已改為在頁尾用一句話說明時間多為推定。 */
    timeLabel: function (e) {
      var list = (e.sessions && e.sessions.length) ? e.sessions : (e.time ? [e.time] : []);
      if (!list.length) return '整天';
      return list.length > 1
        ? list.join('、') + '（兩局）'
        : list[0] + ' 開賽';
    },


    /* 把賽程畫成月曆。職業棋士專區與賽事專區共用這一份。

       opts.size  'lg' = 大格、格子裡直接寫賽事名（賽事專區，版面寬）
                  省略 = 小格、只標色點（職業棋士專區那張卡片，版面窄）
       opts.list  是否在月曆下方列出當月賽事。小格版需要——只看得出哪天
                  有事，看不出是什麼賽；大格版格子裡已經有名稱，再列一次
                  是重複。 */
    calendar: function (box, events, opts) {
      opts = opts || {};
      var S = this;
      var lg = opts.size === 'lg';
      var WD = ['日', '一', '二', '三', '四', '五', '六'];

      function esc(s) {
        return String(s == null ? '' : s)
          .replace(/&/g, '&amp;').replace(/</g, '&lt;')
          .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
      }

      var all = (events || []).slice().sort(function (a, b) {
        return String(a.date).localeCompare(String(b.date));
      });
      if (!all.length) {
        box.innerHTML = '<p class="muted mb-0" style="font-size:.9rem">近期沒有排定的賽程。</p>';
        return;
      }

      var byDate = {};
      all.forEach(function (e) { (byDate[e.date] = byDate[e.date] || []).push(e); });

      var today = S.today();
      /* 從「還沒過的第一場」那個月開始，不是從今天的月份——
         月底時這個月可能已經沒有比賽了，開起來會是一片空白。 */
      var start = (all.filter(function (e) { return e.date >= today; })[0]
                   || all[all.length - 1]).date;
      var cur = { y: Number(start.slice(0, 4)), m: Number(start.slice(5, 7)) - 1 };

      var MIN = all[0].date.slice(0, 7);
      var MAX = all[all.length - 1].date.slice(0, 7);

      function ym(c) { return c.y + '-' + S.pad(c.m + 1); }

      function cell(y, m, d) {
        var k = y + '-' + S.pad(m + 1) + '-' + S.pad(d);
        var evs = byDate[k] || [];
        var cls = 'cal__d' + (evs.length && !lg ? ' cal__d--on' : '') +
          (k === today ? ' cal__d--today' : '');

        if (lg) {
          /* 大格：格子裡直接寫賽事名，不必靠圖例猜 */
          return '<span class="' + cls + '"><span class="cal__n">' + d + '</span>' +
            evs.map(function (e) {
              return '<span class="cal__ev ' + S.slotClass(e.series_slot) + '">' +
                esc(S.fullTitle(e)) + '</span>';
            }).join('') + '</span>';
        }

        return '<span class="' + cls + '"' +
          (evs.length ? ' title="' + esc(evs.map(function (e) {
            return S.fullTitle(e);
          }).join('、')) + '"' : '') + '>' + d +
          (evs.length
            ? '<span class="cal__dots">' + evs.slice(0, 3).map(function (e) {
                return '<i class="' + S.slotClass(e.series_slot) + '"></i>';
              }).join('') + '</span>'
            : '') + '</span>';
      }

      function draw() {
        var y = cur.y, m = cur.m;
        var lead = new Date(y, m, 1).getDay();
        var days = new Date(y, m + 1, 0).getDate();

        var cells = '';
        for (var i = 0; i < lead; i++) cells += '<span class="cal__d cal__d--pad"></span>';
        for (var d = 1; d <= days; d++) cells += cell(y, m, d);
        /* 大格版把最後一列補滿，否則月底那幾格會缺一塊、邊框斷掉 */
        if (lg) {
          var tail = (7 - ((lead + days) % 7)) % 7;
          for (var j = 0; j < tail; j++) cells += '<span class="cal__d cal__d--pad"></span>';
        }

        var list = '';
        if (opts.list) {
          list = all.filter(function (e) {
            return String(e.date).slice(0, 7) === ym(cur);
          }).map(function (e) {
            return '<li style="display:flex;gap:8px;padding:6px 0;' +
              'border-bottom:1px solid var(--line)">' +
              '<span class="legend__dot ' + S.slotClass(e.series_slot) +
                '" style="background:currentColor;flex:none;margin-top:6px"></span>' +
              '<span><strong style="color:var(--ink)">' +
                esc(String(e.date).slice(5).replace('-', '/')) + '</strong>　' +
                esc(S.fullTitle(e)) +
                '<br><span class="muted" style="font-size:.8rem">' +
                  esc(S.timeLabel(e)) + '</span></span></li>';
          }).join('');
        }

        box.className = 'cal' + (lg ? ' cal--lg' : '');
        box.innerHTML =
          '<div class="cal__bar">' +
            '<button type="button" class="cal__nav" data-step="-1"' +
              (ym(cur) <= MIN ? ' disabled' : '') + '>&lsaquo;</button>' +
            '<strong class="cal__title">' + y + ' 年 ' + (m + 1) + ' 月</strong>' +
            '<button type="button" class="cal__nav" data-step="1"' +
              (ym(cur) >= MAX ? ' disabled' : '') + '>&rsaquo;</button>' +
          '</div>' +
          '<div class="cal__grid cal__grid--head">' +
            WD.map(function (w) { return '<span>' + w + '</span>'; }).join('') +
          '</div>' +
          '<div class="cal__grid">' + cells + '</div>' +
          (opts.list
            ? (list
                ? '<ul style="list-style:none;padding:0;margin:10px 0 0;font-size:.86rem">' +
                  list + '</ul>'
                : '<p class="muted mb-0 mt-2" style="font-size:.86rem">這個月沒有排定的賽程。</p>')
            : '');
      }

      box.addEventListener('click', function (ev) {
        var b = ev.target.closest('.cal__nav');
        if (!b || b.disabled) return;
        var n = cur.y * 12 + cur.m + Number(b.getAttribute('data-step'));
        cur = { y: Math.floor(n / 12), m: ((n % 12) + 12) % 12 };
        draw();
      });

      draw();
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
