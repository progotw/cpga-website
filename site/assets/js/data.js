/* ==========================================================================
   網站資料檔 — 日後更新內容請直接編輯本檔案
   ========================================================================== */

/* 最新消息與賽事清單不在這裡：改由 assets/data/news.json 與 assets/data/games.json 提供
   （抓自海峰棋院），透過 assets/js/content.js 載入。更新方式見專案 README。 */

/* 職業棋士名錄不在這裡：改由 assets/data/players.json 提供（真實資料，含照片與棋戰履歷），
   透過 assets/js/players.js 載入。 */
/* 名錄人數，供首頁與協會簡介顯示；更新名錄後請一併調整 */
var PLAYER_COUNT = 139;

/* 下載專區：url 為相對站台根目錄的路徑，沒有 url 者顯示為「尚未提供」 */
var DOWNLOADS = [
  { cat: '章程與法規', name: '中華職業圍棋協會章程（2025 年版）', ext: 'DOCX', size: '19 KB', date: '2025-05-23',
    url: 'assets/files/中華職業圍棋協會章程-2025.docx' },
  { cat: '甄選辦法', name: '2026 年社會組職業棋士甄選辦法', ext: 'DOCX', size: '16 KB', date: '2026-06-02',
    url: 'assets/files/2026年社會組職業棋士甄選辦法.docx' }
];

/* 大事紀。內容須可查證：目前各筆分別出自協會章程備查文號與 114 年度工作報告。
   2009–2024 年的年度紀錄尚待協會提供，請勿自行填補。 */
var MILESTONES = [
  { year: '2025', text: '主辦友士盃十段賽、新人王賽、健喬盃女子最強戰、快棋爭霸戰與中環天元、國手、碁聖等職業賽事，並新辦第一屆龍星賽。' },
  { year: '2025', text: '選派棋士參加 LG 盃世界棋王賽、三星火災盃、倡棋杯、爛柯盃、吳清源杯等世界賽事。' },
  { year: '2025', text: '與日本、韓國及中國大陸棋院進行實體與網路交流賽，並辦理台北．上海雙城盃。' },
  { year: '2025', text: '第九屆第一次會員大會及理監事會於 3 月 28 日召開。' },
  { year: '2008', text: '第一屆第一次會員大會通過章程（97 年 12 月 21 日），翌年 2 月經內政部核准備查，中華職業圍棋協會正式成立。' }
];

/* 下載項目的共用渲染。root 為「到站台根目錄」的前綴，子目錄頁面請傳 '../' */
function dlListHtml(items, root) {
  root = root || '';
  return items.map(function (d) {
    var cls = /^DOCX?$/.test(d.ext) ? ' dl-item__ext--doc'
            : /^XLSX?$/.test(d.ext) ? ' dl-item__ext--xls' : '';
    var attrs = d.url
      ? 'href="' + root + d.url + '" download'
      : 'href="#" onclick="alert(\'此文件尚未提供下載。\');return false;"';
    return '<a class="dl-item" ' + attrs + '>' +
      '<span class="dl-item__ext' + cls + '">' + d.ext + '</span>' +
      '<span class="dl-item__body"><span class="dl-item__name">' + d.name + '</span>' +
      '<span class="dl-item__meta">' + d.ext + '　·　' + d.size + '　·　更新於 ' + fmtDate(d.date) + '</span></span>' +
      '<span class="muted" style="font-size:1.1rem">' + (d.url ? '↓' : '—') + '</span></a>';
  }).join('') || '<p class="muted mb-0">目前沒有可下載的項目。</p>';
}

/* 工具：日期格式 */
function fmtDate(s) {
  var d = s.split('-');
  return d[0] + '.' + d[1] + '.' + d[2];
}
function fmtMoney(n) {
  return 'NT$ ' + n.toLocaleString('en-US');
}
