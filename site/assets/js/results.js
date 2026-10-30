/* ==========================================================================
   海峰成績（唯讀）

   原本是載入海峰那邊的 player-widget.js。那支程式放在對方的 GitHub Pages，
   內容隨時可改、我們不會收到通知——而它被載入在**協會後台**和職業棋士專區，
   那兩個頁面都有登入中的身分。對方帳號一旦被盜，惡意程式就能以管理員
   的身分操作。

   這裡改成只讀同一份公開資料，不執行任何外部程式。
   兩種壞法的差別：資料格式變了會立刻看得出來壞掉；程式被竄改是無聲的。

   資料是 Firestore 的公開唯讀文件，不需要登入也不需要金鑰，
   每年一份，每一列是位置固定的陣列。
   ========================================================================== */
(function () {
  'use strict';

  var BASE = 'https://firestore.googleapis.com/v1/projects/test-5cfc9' +
             '/databases/(default)/documents/results';

  /* 一列的欄位順序，由對方的資料決定，不要自行調動 */
  var DATE = 0, C1 = 1, C2 = 2, EVENT = 3, STAGE = 4,
      BLACK = 5, WHITE = 6, WINNER = 7, MARGIN = 8;

  var cache = {};   // year -> Promise<rows>

  function rowsOf(year) {
    if (cache[year]) return cache[year];
    cache[year] = fetch(BASE + '/y' + year)
      .then(function (r) {
        if (r.status === 404) return [];       // 那一年還沒有資料
        if (!r.ok) throw new Error('成績讀取失敗 HTTP ' + r.status);
        return r.json();
      })
      .then(function (doc) {
        if (!doc || !doc.fields) return [];
        var s = (doc.fields.rows || {}).stringValue;
        return s ? JSON.parse(s) : [];
      });
    /* 失敗不要留在快取裡，否則整頁生命週期內都不會再試 */
    cache[year].catch(function () { delete cache[year]; });
    return cache[year];
  }

  function toGame(r, year, name) {
    return {
      year: String(year),
      date: r[DATE],
      c1: r[C1],
      c2: r[C2],
      event: r[EVENT],
      stage: r[STAGE],
      black: r[BLACK],
      white: r[WHITE],
      winner: r[WINNER],
      margin: r[MARGIN],
      /* 勝方欄等於本人才算勝，其餘都算敗——與成績系統的算法一致 */
      won: r[WINNER] === name,
      color: r[BLACK] === name ? '黑' : '白',
      opponent: r[BLACK] === name ? r[WHITE] : r[BLACK]
    };
  }

  function summarise(games, year) {
    var n = games.length;
    var win = games.filter(function (g) { return g.won; }).length;
    return { year: String(year), n: n, win: win, loss: n - win,
             rate: n ? win / n : 0 };
  }

  window.HaifongResults = {
    /* 單一棋士的成績。預設取今年與去年——頁面上只用得到這兩年。 */
    player: function (name, years) {
      var now = new Date().getFullYear();
      var want = years || [now, now - 1];
      return Promise.all(want.map(function (y) {
        return rowsOf(y).then(function (rows) {
          var mine = rows.filter(function (r) {
            return r[BLACK] === name || r[WHITE] === name;
          }).map(function (r) { return toGame(r, y, name); });
          return { year: y, games: mine };
        });
      })).then(function (per) {
        var games = [];
        per.forEach(function (p) { games = games.concat(p.games); });
        /* 日期是 MM.DD，同年才可比；先依年份再依日期，新的在前 */
        games.sort(function (a, b) {
          return a.year !== b.year ? (a.year < b.year ? 1 : -1)
                                   : (a.date < b.date ? 1 : -1);
        });
        return {
          name: name,
          games: games,
          /* 沒有對局的年度整個不列入。留著會變成「0勝0負　勝率 0.0%」，
             看起來像全輸，實際上是那年沒下棋。 */
          years: per.filter(function (p) { return p.games.length; })
                    .map(function (p) { return summarise(p.games, p.year); })
        };
      });
    },

    /* 某一年每位棋士的局數。後台催報名單用來排序，不必逐人查。 */
    countsByYear: function (year) {
      return rowsOf(year).then(function (rows) {
        var c = {};
        rows.forEach(function (r) {
          if (r[BLACK]) c[r[BLACK]] = (c[r[BLACK]] || 0) + 1;
          if (r[WHITE]) c[r[WHITE]] = (c[r[WHITE]] || 0) + 1;
        });
        return c;
      });
    }
  };
})();
