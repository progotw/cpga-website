/* ==========================================================================
   協會自有內容的載入器
   這些資料由秘書處在後台編輯後發布成 assets/data/*.json，
   與爬蟲產生的 players/news/games/schedule 分屬不同來源，故另立一支。
   ========================================================================== */
(function () {
  'use strict';

  var ROOT = (function () {
    var s = document.currentScript && document.currentScript.src;
    return s ? s.replace(/assets\/js\/cms\.js.*$/, '') : '';
  })();

  var cache = {};

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  window.CPGA_CMS = {
    esc: esc,

    /* 2026-09-18 → 2026.09.18 */
    fmtDate: function (s) { return String(s || '').split('-').join('.'); },

    /* 讀取 assets/data/<name>.json，同一份只抓一次 */
    load: function (name) {
      if (!cache[name]) {
        cache[name] = fetch(ROOT + 'assets/data/' + name + '.json', { cache: 'no-cache' })
          .then(function (r) {
            if (!r.ok) throw new Error(name + ' 資料 HTTP ' + r.status);
            return r.json();
          });
      }
      return cache[name];
    },

    /* 把載入失敗統一呈現，避免頁面只留一個「載入中…」 */
    fail: function (el, err) {
      if (el) el.innerHTML = '<p class="muted mb-0">內容載入失敗（' + esc(err.message) + '）。</p>';
    },

    /* 下載項目清單。root 為「到站台根目錄」的前綴，子目錄頁面請傳 '../' */
    dlListHtml: function (items, root) {
      root = root || '';
      return (items || []).map(function (d) {
        var cls = /^DOCX?$/.test(d.ext) ? ' dl-item__ext--doc'
                : /^XLSX?$/.test(d.ext) ? ' dl-item__ext--xls' : '';
        var attrs = d.url
          ? 'href="' + esc(root + d.url) + '" download'
          : 'href="#" onclick="alert(\'此文件尚未提供下載。\');return false;"';
        var date = String(d.date || '').split('-').join('.');
        return '<a class="dl-item" ' + attrs + '>' +
          '<span class="dl-item__ext' + cls + '">' + esc(d.ext) + '</span>' +
          '<span class="dl-item__body"><span class="dl-item__name">' + esc(d.name) + '</span>' +
          '<span class="dl-item__meta">' + esc(d.ext) + '　·　' + esc(d.size) +
          '　·　更新於 ' + esc(date) + '</span></span>' +
          '<span class="muted" style="font-size:1.1rem">' + (d.url ? '↓' : '—') + '</span></a>';
      }).join('') || '<p class="muted mb-0">目前沒有可下載的項目。</p>';
    },

    /* 職別／姓名兩欄的名冊表格 */
    rosterTable: function (members) {
      return '<div class="table-wrap"><table class="table">' +
        '<thead><tr><th style="width:140px">職別</th><th>姓名</th></tr></thead><tbody>' +
        (members || []).map(function (m) {
          var name = m.highlight
            ? '<strong style="color:var(--ink)">' + esc(m.name) + '</strong>'
            : esc(m.name);
          return '<tr><td>' + esc(m.role) + '</td><td>' + name + '</td></tr>';
        }).join('') +
        '</tbody></table></div>';
    }
  };
})();
