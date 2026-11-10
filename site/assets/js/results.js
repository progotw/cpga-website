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
      BLACK = 5, WHITE = 6, WINNER = 7, MARGIN = 8,
      /* 第 10 欄：HiGO 的棋譜編號。成績系統到 2026-11-10 還是只有 9 欄，
         對方改用另一種做法（見下方的棋譜對照表）。這一欄還是接著，
         哪天對方真的加上去就會優先採用。 */
      KIFU = 9;

  /* 棋譜網址。編號只收數字，其餘一律視為沒有——
     這個值來自外部資料，直接串進連結會變成可被注入的網址。 */
  function kifuUrl(v) {
    return /^[0-9]{1,12}$/.test(String(v == null ? '' : v).trim())
      ? 'https://www.higohigo.org/#/kifu/' + String(v).trim()
      : '';
  }

  /* ---- 棋譜對照表 ----
     成績資料本身沒有棋譜編號。對方另外跑一支程式，用「年份｜日期｜黑方｜白方」
     把每一局配到 HiGO 圍棋的公開棋譜，成績查詢頁讀那一份來顯示「棋譜」欄。
     檔案在對方的 GitHub Pages，官網不即時讀它——每天在 CI 抓一份放進
     assets/data/kifu.json，網頁讀自己網域的檔案（scripts/fetch_kifu.py）。
     讀不到就只是不顯示棋譜連結，成績照常。

     路徑由這支程式自己的網址推出來：results.js 被 member/、players/、admin/
     底下的頁面載入，相對路徑各不相同。 */
  var SELF = (document.currentScript && document.currentScript.src) || '';
  var KIFU_JSON = SELF.replace(/js\/results\.js(\?.*)?$/, 'data/kifu.json');
  var kifuMap = null;
  var kifuBase = 'https://www.higohigo.org/#/kifu/';
  var kifuReady = (SELF && KIFU_JSON !== SELF)
    ? fetch(KIFU_JSON, { cache: 'no-cache' })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (j) {
          if (j && j.map) { kifuMap = j.map; kifuBase = j.url || kifuBase; }
        })
        .catch(function () { /* 沒有對照表就不顯示棋譜，不影響成績 */ })
    : Promise.resolve();

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

  /* 一局的棋譜網址（可能不只一份：同一天同一對下兩盤就會有兩個編號）。
     對方若哪天補上第 10 欄，那一欄優先。 */
  function kifuOf(year, r) {
    var direct = kifuUrl(r[KIFU]);
    if (direct) return [direct];
    if (!kifuMap) return [];
    var ids = kifuMap[[year, r[DATE], r[BLACK], r[WHITE]].map(norm).join('|')];
    return (ids || []).map(function (id) { return kifuBase + id; });
  }

  function toGame(r, year, name) {
    var ks = kifuOf(year, r);
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
      kifu: ks[0] || '',
      kifus: ks,
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

  /* ---- 升段進度（海峰 2026-11-02 的串接說明）----

     還差幾勝 ＝ 升段需要的勝場 －（結算日已達成的勝場 ＋ 結算日「之後」到今天的勝局）
     國內、國際、正式、限制都算，交流賽不算；「今天」用台灣時間。
     與成績系統「升段提醒」同一套算法。

     對方提供的是 player-widget.js 的新方法，但那支程式我們不載入
     （理由見本檔開頭），所以改讀同兩份公開資料自己算：
       results/danPlayers  [[姓名, 目前段位, 結算日, 已達成勝場]]
       results/danRules    [[段位, 需要勝場]]
     院方升段或調整結算日時會直接改這兩份，所以每次都重讀、不快取（都很小）。 */
  var DAN_ORDER = ['初段', '二段', '三段', '四段', '五段', '六段', '七段', '八段', '九段'];
  /* danRules 不存在時的預設值（2026-11-02 查詢時院方尚未建立這份文件，
     走的就是這一組，與對方程式內建的相同）。 */
  var DAN_NEED = {
    '初段': 20, '二段': 30, '三段': 50, '四段': 60, '五段': 70,
    '六段': 100, '七段': 110, '八段': 120, '九段': 150
  };

  function norm(s) { return String(s == null ? '' : s).replace(/\s+/g, ''); }

  function docOf(id) {
    return fetch(BASE + '/' + id, { cache: 'no-cache' })
      .then(function (r) {
        if (r.status === 404) return null;
        if (!r.ok) throw new Error('段位資料讀取失敗 HTTP ' + r.status);
        return r.json();
      });
  }

  function jsonField(doc, key) {
    try {
      return JSON.parse((doc && doc.fields && doc.fields[key] &&
                         doc.fields[key].stringValue) || 'null');
    } catch (e) { return null; }
  }

  /* 日期一律換成 20261102 這種數字再比大小 */
  function dayNum(s) {
    var m = String(s).match(/^(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})/);
    return m ? Number(m[1]) * 10000 + Number(m[2]) * 100 + Number(m[3]) : 0;
  }
  function gameNum(year, md) {
    var m = String(md).match(/^(\d{1,2})\.(\d{1,2})$/);
    return m ? Number(year) * 10000 + Number(m[1]) * 100 + Number(m[2])
             : Number(year) * 10000;
  }
  function numDate(n) {
    n = String(n);
    return n.slice(0, 4) + '-' + n.slice(4, 6) + '-' + n.slice(6, 8);
  }
  /* 台灣時間的今天。使用者的電腦時區不一定正確，也可能人在國外。 */
  function todayNum() {
    var t = new Date(Date.now() + 8 * 3600000);
    return t.getUTCFullYear() * 10000 + (t.getUTCMonth() + 1) * 100 + t.getUTCDate();
  }

  window.HaifongResults = {
    /* 單一棋士的成績。預設取今年與去年——頁面上只用得到這兩年。 */
    player: function (name, years) {
      var now = new Date().getFullYear();
      var want = years || [now, now - 1];
      return kifuReady.then(function () {
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
      });
    },

    /* 升段進度。段位資料裡沒有這位棋士時回傳 null。
       欄位與對方說明書第 4 節一致，另加 settleMissing（資料缺結算日）。 */
    dan: function (name) {
      var p = norm(name);
      var until = todayNum();
      var nowY = Math.floor(until / 10000);

      return Promise.all([docOf('danPlayers'), docOf('danRules'), kifuReady]).then(function (res) {
        var players = jsonField(res[0], 'players') || [];
        var rules = jsonField(res[1], 'rules');
        var row = players.filter(function (r) { return r && norm(r[0]) === p; })[0];
        if (!row) return null;

        var dan = row[1] || '';
        var base = dayNum(row[2]);
        var baseWins = Number(row[3]) || 0;
        var idx = DAN_ORDER.indexOf(dan);
        var need = null;
        if (rules) {
          var hit = rules.filter(function (x) { return x[0] === dan; })[0];
          need = hit ? Number(hit[1]) : null;
        } else if (DAN_NEED[dan] != null) {
          need = DAN_NEED[dan];
        }
        var info = {
          name: row[0], dan: dan,
          nextDan: idx >= 0 && idx < DAN_ORDER.length - 1 ? DAN_ORDER[idx + 1] : null,
          need: need, settleDate: base ? numDate(base) : '', baseWins: baseWins,
          asOf: numDate(until)
        };
        /* 沒有結算日就沒有起算點，算出來的數字會是錯的，寧可說資料不完整。
           2026-11-02 檢查時 139 位棋士都有結算日，這是防呆。 */
        if (!base) {
          info.settleMissing = true;
          info.winsSince = info.total = info.remaining = null;
          info.reached = false;
          info.wins = [];
          return info;
        }

        /* 只讀結算日那年到今年——更早的對局本來就不列入，不必抓 */
        var years = [];
        for (var y = Math.floor(base / 10000); y <= nowY; y++) years.push(y);

        return Promise.all(years.map(rowsOf)).then(function (per) {
          var wins = [];
          per.forEach(function (rows, i) {
            var y = years[i];
            rows.forEach(function (r) {
              if (norm(r[WINNER]) !== p) return;
              if (r[C2] === '交流') return;            /* 交流賽不列入升段 */
              var n = gameNum(y, r[DATE]);
              if (n <= base || n > until) return;
              wins.push({ at: n, year: y, row: r });
            });
          });
          wins.sort(function (a, b) { return a.at - b.at; });

          var list = wins.map(function (w, k) {
            var r = w.row, isB = norm(r[BLACK]) === p;
            return { no: baseWins + k + 1, year: String(w.year), date: r[DATE],
                     event: r[EVENT], stage: r[STAGE],
                     opponent: isB ? r[WHITE] : r[BLACK],
                     color: isB ? '黑' : '白', margin: r[MARGIN],
                     kifu: kifuOf(w.year, r)[0] || '' };
          });
          info.winsSince = list.length;
          info.total = baseWins + list.length;
          info.remaining = need == null ? null : need - info.total;
          info.reached = info.remaining != null && info.remaining <= 0;
          info.reachGame = (need != null && baseWins < need && info.total >= need)
            ? list[need - baseWins - 1] : null;
          info.wins = list;
          return info;
        });
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
