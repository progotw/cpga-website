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

    /* 這場比賽實際佔了哪幾天（YYYY-MM-DD 陣列）。

       整天行程的 end_date 是 Google 行事曆的結束日，而它「不含當天」：
       11/07 開始、end_date 11/09 就是 11/07、11/08 兩天；單日行程的
       end_date 則是隔天。不展開的話，為期兩天的比賽在月曆上只看得到第一天
       （2026-11-02 使用者回報大學生圍棋十傑賽只顯示一天）。

       有填時間的行程不展開：那是當天的對局，end_date 只是結束時刻那一天。
       上限 14 天是防呆，資料有誤時不要把整個月曆鋪滿。 */
    days: function (e) {
      var out = [e.date];
      if (!e || !e.all_day || !e.end_date || e.end_date <= e.date) return out;
      var d = new Date(e.date + 'T00:00:00');
      for (var i = 0; i < 14; i++) {
        d.setDate(d.getDate() + 1);
        var k = d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
        if (k >= e.end_date) break;
        out.push(k);
      }
      return out;
    },

    /* 最後一天。用來判斷「還沒結束」——為期兩天的比賽，第二天仍在進行中，
       不能因為開始日是昨天就從近期賽程裡消失。 */
    lastDay: function (e) {
      var ds = this.days(e);
      return ds[ds.length - 1];
    },

    /* 日期標示。單日「2026.11.07」；跨日「2026.11.07–08」，跨月「2026.11.30–12.01」。
       short＝省略年份（版面窄的清單用）。 */
    dateLabel: function (e, short) {
      var ds = this.days(e);
      var a = ds[0], b = ds[ds.length - 1];
      var head = short ? a.slice(5).replace('-', '/') : a.split('-').join('.');
      if (b === a) return head;
      var tail = a.slice(0, 7) === b.slice(0, 7)
        ? b.slice(8)
        : (short ? b.slice(5).replace('-', '/') : b.slice(5).split('-').join('.'));
      return head + '–' + tail;
    },

    /* 同一天的排序依據：當天最早的開賽時間。
       沒有時間的（整天行程）排在最前面——那一整天都算在內。

       資料來源的順序是日曆給的，同一天不保證由早到晚：2026-11-05 使用者
       回報 11/11 的龍星賽 16 強（14:00）排在 32 強（10:00）上面。 */
    startKey: function (e) {
      var list = (e && e.sessions && e.sessions.length) ? e.sessions
                 : (e && e.time ? [e.time] : []);
      return list.slice().sort()[0] || '';
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
        return String(a.date).localeCompare(String(b.date)) ||
               String(S.startKey(a)).localeCompare(String(S.startKey(b)));
      });
      if (!all.length) {
        box.innerHTML = '<p class="muted mb-0" style="font-size:.9rem">近期沒有排定的賽程。</p>';
        return;
      }

      var byDate = {};
      all.forEach(function (e) {
        S.days(e).forEach(function (k) { (byDate[k] = byDate[k] || []).push(e); });
      });

      var today = S.today();
      /* 從「還沒過的第一場」那個月開始，不是從今天的月份——
         月底時這個月可能已經沒有比賽了，開起來會是一片空白。 */
      var start = (all.filter(function (e) { return S.lastDay(e) >= today; })[0]
                   || all[all.length - 1]).date;
      var cur = { y: Number(start.slice(0, 4)), m: Number(start.slice(5, 7)) - 1 };

      var MIN = all[0].date.slice(0, 7);
      /* 跨月的比賽（例如 11/30–12/01）要能翻到最後一天所在的月份 */
      var MAX = all.reduce(function (m, e) {
        var k = S.lastDay(e).slice(0, 7);
        return k > m ? k : m;
      }, all[all.length - 1].date.slice(0, 7));

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
            /* 跨月的比賽在兩個月的清單裡都要出現 */
            return S.days(e).some(function (k) { return k.slice(0, 7) === ym(cur); });
          }).map(function (e) {
            return '<li data-date="' + esc(S.lastDay(e)) + '"' +
              ' style="display:flex;gap:8px;padding:6px 0;' +
              'border-bottom:1px solid var(--line)">' +
              '<span class="legend__dot ' + S.slotClass(e.series_slot) +
                '" style="background:currentColor;flex:none;margin-top:6px"></span>' +
              '<span><strong style="color:var(--ink)">' +
                esc(S.dateLabel(e, true)) + '</strong>　' +
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
                /* 一個月二十幾場，整排列出來卡片會變得很高，旁邊那一欄就空一大塊。
                   留大約五筆的高度，其餘在卡片裡捲動。 */
                ? '<ul class="cal__list" style="list-style:none;padding:0;margin:10px 0 0;' +
                  'font-size:.86rem;max-height:306px;overflow-y:auto">' + list + '</ul>'
                : '<p class="muted mb-0 mt-2" style="font-size:.86rem">這個月沒有排定的賽程。</p>')
            : '');

        /* 清單從今天開始看，不要從月初——月底時前面十幾場都已經過去了 */
        var ul = box.querySelector('.cal__list');
        if (ul) {
          var next = [].slice.call(ul.querySelectorAll('li')).filter(function (li) {
            return li.getAttribute('data-date') >= today;
          })[0];
          if (next) ul.scrollTop = next.offsetTop - ul.querySelector('li').offsetTop;
        }
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
