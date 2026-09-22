/* ==========================================================================
   網站資料檔 — 日後更新內容請直接編輯本檔案
   ========================================================================== */

/* 最新消息與賽事清單不在這裡：改由 assets/data/news.json 與 assets/data/games.json 提供
   （抓自海峰棋院），透過 assets/js/content.js 載入。更新方式見專案 README。 */

/* 職業棋士名錄不在這裡：改由 assets/data/players.json 提供（真實資料，含照片與棋戰履歷），
   透過 assets/js/players.js 載入。 */
/* 名錄人數，供首頁與協會簡介顯示；更新名錄後請一併調整 */
/* 下載專區：url 為相對站台根目錄的路徑，沒有 url 者顯示為「尚未提供」 */
var DOWNLOADS = [
  { cat: '章程與法規', name: '中華職業圍棋協會章程（2025 年版）', ext: 'DOCX', size: '19 KB', date: '2025-05-23',
    url: 'assets/files/中華職業圍棋協會章程-2025.docx' },
  { cat: '甄選辦法', name: '2026 年社會組職業棋士甄選辦法', ext: 'DOCX', size: '16 KB', date: '2026-06-02',
    url: 'assets/files/2026年社會組職業棋士甄選辦法.docx' }
];

/* 大事紀。內容出自協會自製的「中華職業圍棋協會簡介（官網版）」，逐條可查證。
   新增條目請一併更新該文件，不要自行編寫。 */
var MILESTONES = [
  { year: '2026', text: '開辦「玄樂盃」；8 月起補助精銳隊隊員訓練費用。' },
  { year: '2025', text: '何信仁先生再度出任第九屆理事長；開辦「龍星賽」。' },
  { year: '2024', text: '3 月起承接台灣棋院職業及院生相關業務，並成為職業證書發證單位。' },
  { year: '2023', text: '杭州亞運，精銳隊隊員許皓鋐九段獲得男子個人金牌。' },
  { year: '2021', text: '加藤純子女士出任第七屆理事長。' },
  { year: '2020', text: '開辦「快棋爭霸戰」。' },
  { year: '2019', text: '環旭電子與本會合作組隊參加中國圍棋聯賽。' },
  { year: '2017', text: '何信仁先生出任第五屆理事長；與海峰棋院共同主辦「女子圍棋最強戰」，擴大賽事規模。' },
  { year: '2016', text: '開辦「新人王賽」。' },
  { year: '2015', text: '1 月成立臺灣首支職業圍棋隊伍「臺灣圍棋精銳隊」；開辦「女子圍棋最強戰」。' },
  { year: '2013', text: '9 月成立「圍棋道場」。' },
  { year: '2012', text: '林文伯先生出任第三屆理事長。' },
  { year: '2011', text: '開辦「友士盃十段賽」。' },
  { year: '2008', text: '協會成立，加藤惇一先生出任創會理事長。' }
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
