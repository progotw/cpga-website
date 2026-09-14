/* ==========================================================================
   網站資料檔 — 日後更新內容請直接編輯本檔案
   （人名、日期、金額等目前皆為「範例資料」，上線前請替換為實際內容）
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
    url: 'assets/files/2026年社會組職業棋士甄選辦法.docx' },
  { cat: '會務公開', name: '114 年度工作報告', ext: 'DOCX', size: '17 KB', date: '2026-06-02',
    url: 'assets/files/114年度工作報告.docx' },
  { cat: '會務公開', name: '114 年度收支決算表', ext: 'DOCX', size: '17 KB', date: '2026-06-02',
    url: 'assets/files/114年度收支決算表.docx' }
];

/* 大事紀 */
var MILESTONES = [
  { year: '2026', text: '啟用線上「棋士專區」，整合賽程行事曆、撥款公告與升段進度查詢。' },
  { year: '2025', text: '職業棋士甄選制度修訂，增設青年組名額並調整入段標準。' },
  { year: '2024', text: '與國際棋院簽署交流合作備忘錄，年度互訪對局常態化。' },
  { year: '2022', text: '建立全會員電子化積分排名系統，賽事成績即時更新。' },
  { year: '2020', text: '新增女子系列賽事，完善女子棋士職業生涯發展路徑。' },
  { year: '2018', text: '協會棋院落成啟用，提供正式對局與研究訓練場地。' },
  { year: '2015', text: '確立四大職業頭銜戰架構，賽事年度化、制度化。' },
  { year: '2008', text: '第一屆第一次會員大會通過章程（97 年 12 月 21 日），翌年 2 月經內政部核准備查，中華職業圍棋協會正式成立。' }
];

/* ---- 棋士專區（登入後）範例資料 ---- */

var MEMBER_PROFILE = {
  name: '陳○○', rank: '八段', id: 'CPGA-0087', joined: '2011',
  email: 'player@example.org', phone: '0912-000-000',
  bank: '○○銀行 ○○分行 ****3456'
};

/* 賽程行事曆的資料不在這裡：改由 assets/data/schedule.json 提供（真實賽事資料），
   透過 assets/js/schedule.js 載入。更新方式見該檔說明。 */

/* 內部公告（僅棋士可見） */
var MEMBER_ANNOUNCEMENTS = [
  { date: '2026-09-09', title: '名人戰本賽報到時間調整通知', body: '自第 1 輪起報到時間提前至 12:30，逾時未到者依競賽規則辦理。' },
  { date: '2026-09-02', title: '9 月份棋院場地整修期間對局安排', body: '9 月 8 日至 12 日 2F 對局室暫停使用，該期間對局移至 3F。' },
  { date: '2026-08-26', title: '差旅費請領單據補件提醒', body: '請於每月 5 日前完成上月單據繳交，逾期併入次月撥款。' },
  { date: '2026-08-12', title: '棋士個人資料年度校對作業', body: '請於 9 月底前登入本專區確認聯絡方式與匯款帳戶是否正確。' }
];

/* 撥款時程公告（對外／全體棋士共通資訊） */
var PAYOUT_SCHEDULE = [
  { period: '2026 年 7 月', cutoff: '2026-08-05', payDate: '2026-08-14', status: 'done',    note: '已完成撥款' },
  { period: '2026 年 8 月', cutoff: '2026-09-05', payDate: '2026-09-14', status: 'pending', note: '作業中' },
  { period: '2026 年 9 月', cutoff: '2026-10-05', payDate: '2026-10-15', status: 'soon',    note: '預定' },
  { period: '2026 年 10 月', cutoff: '2026-11-05', payDate: '2026-11-13', status: 'soon',   note: '預定' }
];

/* 我的撥款紀錄（個人） */
var MY_PAYMENTS = [
  { date: '2026-08-14', period: '7 月份', items: '對局費 ×3、差旅費 ×1', amount: 68000, status: 'done' },
  { date: '2026-07-15', period: '6 月份', items: '對局費 ×2、獎金 ×1',   amount: 152000, status: 'done' },
  { date: '2026-06-13', period: '5 月份', items: '對局費 ×4',            amount: 84000, status: 'done' },
  { date: '2026-05-15', period: '4 月份', items: '對局費 ×2、差旅費 ×2', amount: 51000, status: 'done' },
  { date: '2026-04-14', period: '3 月份', items: '對局費 ×3',            amount: 63000, status: 'done' }
];

/* 升段進度／排名 */
var MY_PROMOTION = {
  currentRank: '八段',
  nextRank: '九段',
  points: 218,
  pointsNeeded: 300,
  winRate: '64%',
  rankOverall: 6,
  prizeRank: 8,
  recentResults: [
    { date: '2026-09-05', event: '名人戰 預選決勝',   opponent: '林○○ 九段', result: '勝', points: '+12' },
    { date: '2026-08-22', event: '女子本因坊戰 8 強', opponent: '黃○○ 七段', result: '勝', points: '+8' },
    { date: '2026-08-08', event: '棋王戰 本賽 2 輪',  opponent: '王○○ 九段', result: '負', points: '+2' },
    { date: '2026-07-25', event: '名人戰 預選',       opponent: '吳○○ 六段', result: '勝', points: '+8' }
  ]
};

/* 賽事花絮相簿 */
var GALLERY = [
  { album: '名人戰本賽 第 1 輪', event: '名人戰',      date: '2026-09-19', count: 12 },
  { album: '棋王戰挑戰者決定戰', event: '棋王戰',      date: '2026-07-10', count: 9  },
  { album: '暑期少年研習營',     event: '推廣活動',    date: '2026-07-30', count: 24 },
  { album: '協會盃業餘公開賽',   event: '業餘賽事',    date: '2026-07-05', count: 18 },
  { album: '本因坊戰 決賽',      event: '本因坊戰',    date: '2026-06-20', count: 14 },
  { album: '新人王戰 頒獎典禮',  event: '新人王戰',    date: '2026-08-02', count: 11 },
  { album: '國際交流訪問團',     event: '國際交流',    date: '2026-05-16', count: 20 },
  { album: '校園圍棋巡迴',       event: '推廣活動',    date: '2026-04-25', count: 16 }
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
