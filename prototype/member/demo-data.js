/* ==========================================================================
   棋士專區示意版的範例資料（虛構，未上線）
   第一階段不對外開放棋士專區，本檔與 prototype/member/ 一同移出發布目錄。
   第二階段改接後端時，這裡的資料結構可作為欄位參考。
   ========================================================================== */

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
