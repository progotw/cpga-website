# 中華職業圍棋協會 官方網站

純靜態網站（HTML / CSS / JavaScript），無需後端即可部署，可放在任何虛擬主機、
GitHub Pages、Netlify、Cloudflare Pages 等服務。

---

## 本機預覽

```bash
python -m http.server 5173
```

然後開啟 <http://localhost:5173>。

> 直接用瀏覽器開啟 `index.html`（file://）會因為瀏覽器安全限制而無法正常運作，
> 請務必透過上面的本機伺服器預覽。

---

## 目錄結構

```
index.html              首頁
about/                  關於協會（簡介／理監事會／大事紀／章程／聯絡方式）
news/                   最新消息（列表 + 內容頁）
players/                職業棋士（名錄 + 介紹頁）
events/                 賽事專區（職業賽事／世界賽／業餘／甄選／規則／段位／晉升／報名）
gallery/                賽事花絮（IG 貼文牆 + 賽事相簿）
membership/             加入會員
downloads/              下載專區
member/                 棋士專區（需登入）
assets/css/style.css    全站樣式
assets/js/site.js       共用頁首、頁尾、導覽列
assets/js/data.js       ★ 網站資料（最常需要修改的檔案）
assets/js/member.js     棋士專區登入守門與側邊選單
assets/files/           放置可下載的 PDF / DOC / XLS（目前為空）
assets/img/             放置圖片（目前為空）
```

---

## 日常維護

### 更新消息、棋士、賽事、下載項目

全部集中在 **`assets/js/data.js`**，直接編輯陣列即可，不需要動 HTML：

| 變數 | 內容 |
| --- | --- |
| `NEWS` | 最新消息 |
| `PLAYERS` | 職業棋士名錄 |
| `EVENTS` | 年度賽事列表 |
| `DOWNLOADS` | 下載專區檔案清單 |
| `MILESTONES` | 大事紀 |
| `GALLERY` | 賽事相簿 |
| `MEMBER_ANNOUNCEMENTS` / `PAYOUT_SCHEDULE` / `MY_PAYMENTS` / `MY_PROMOTION` | 棋士專區資料 |

### 更新賽程行事曆（真實資料）

賽程**不在 `data.js`**，而是讀取 `assets/data/schedule.json`，
由 `C:\Users\user\Desktop\calendar-viewer` 的工具從「海峰棋院公開行事曆」產生。

更新指令 —— 直接輸出到網站資料夾：

```bash
python C:\Users\user\Desktop\calendar-viewer\calendar_list.py --days 60 --json "C:\Users\user\Desktop\cpga-website\assets\data\schedule.json"
```

跑完重新上傳網站即可。若要納入每日自動更新，把上面這行加進
`calendar-viewer\update.bat`（該資料夾已設有 Windows 排程「海峰行事曆更新」，每天 09:00 執行）。

使用到的頁面：

- `member/calendar.html` — 月曆／列表雙檢視，依 `series_slot` 配色
- `member/index.html` — 「下一場對局」與「近期賽程」

### 更新職業棋士名錄（真實資料）

名錄**不在 `data.js`**，而是讀取 `assets/data/players.json`（139 位），
照片壓縮後放在 `assets/img/players/<id>.jpg`。資料抓自 haifong.org 的職業棋士頁。

重新抓取的程式放在 `scripts/`：

```bash
python scripts\scrape_players.py "C:\Users\user\Desktop\cpga-website\assets\data\players.json"
python scripts\fetch_photos.py
```

第一支抓名單與個人資料，第二支下載照片並壓縮（原始 163MB → 約 4MB）。
抓完記得同步更新 `assets/js/data.js` 裡的 `PLAYER_COUNT`（首頁與協會簡介的人數）。

顯示規則：

- **名錄頁只顯示姓名**，依段位分組；照片只在個人頁出現。
- `history` 陣列可能同時有「頭銜冠軍」與「歷史成績」兩列，**順序不固定**，
  取冠軍數時要掃過整個陣列，不能只讀 `history[0]`。
- 目前 139 位中只有 **38 位**在原站填了「冠軍數」，其餘 101 位沒有這個欄位，
  名錄上該行會留白（不顯示「0 冠」以免誤導）。要讓全部都有，需先在 haifong.org 補齊再重抓。

顯示規則：

- `time_inferred` 為 `true` 的開賽時間會加註星號＊，頁尾說明那是推定值而非日曆資料。
- **畫面上一律顯示 `name`（日曆原文用字，例如「玄樂盃」）。**
  `series` 是產生端正規化過的分組鍵，異體字會被統一（「玄樂盃」會變成「玄樂杯」），
  所以只拿來當配色依據，不直接顯示。圖例標籤由 `schedule.js` 的 `seriesLabels()`
  取該系列中最常出現的 `name` 產生。

消息若要有完整內文，在該筆資料加上 `body` 欄位（可放 HTML）：

```js
{ id: 'n026', date: '2026-09-08', cat: 'notice',
  title: '…', summary: '…',
  body: '<p>第一段內文</p><p>第二段內文</p>' }
```

### 修改導覽列

編輯 `assets/js/site.js` 最上方的 `NAV` 陣列，頁首與行動版選單會一起更新。

### 放上可下載的檔案

1. 把檔案放進 `assets/files/`
2. 在 `data.js` 的 `DOWNLOADS` 對應項目加上 `url: '../assets/files/檔名.pdf'`
3. 各頁的下載連結目前綁定 `alert()` 提示，串上 `url` 後改為正常連結即可

---

## 上線前必須替換的內容

網站中凡是有 **米色提示框（※ …）** 的地方，都是需要換成實際資料的版位：

- 協會地址、電話、信箱（`about/contact.html`、`assets/js/site.js` 頁尾）
- 理監事與秘書處名單（`about/board.html`）
- 職業棋士姓名、照片、經歷（`data.js` 的 `PLAYERS`）
- 賽事獎金、期程、段位積分門檻（`data.js`、`events/*.html`）
- 會費金額與會員權益（`membership/index.html`）
- 章程全文 PDF、各項表單（`assets/files/`）
- Instagram 帳號連結與貼文嵌入碼（`gallery/index.html`）

---

## 賽事花絮的 IG 串接

`gallery/index.html` 中的 `#igWall` 目前是版位示意，兩種串法：

1. **簡易版**：在 IG 貼文按「分享 → 嵌入」取得 `<blockquote class="instagram-media">`
   程式碼貼進 `#igWall`，並在頁尾載入 `//www.instagram.com/embed.js`。
2. **自動版**：申請 Instagram Graph API（需商業帳號綁定 FB 粉專），
   或使用第三方 IG feed 外掛自動抓取最新貼文。

---

## ⚠️ 棋士專區：目前的限制

`member/` 底下的頁面是**前端示意版本**：

- 登入沒有任何驗證，點「登入」就會以 `data.js` 的範例棋士身分進入
- 登入狀態只存在瀏覽器的 `localStorage`
- 撥款金額、個人資料等都是假資料，且任何人改一下瀏覽器設定就能看到

**正式上線前必須改為後端驗證**：登入 API、Session 或 JWT，
並且在伺服器端檢查權限後才回傳個人財務與個資。

### 對應原規劃的分階段開發

| 階段 | 項目 | 目前狀態 |
| --- | --- | --- |
| 第一階段 | 帳號登入系統 | 前端版型完成，**待接後端** |
| 第一階段 | 賽程行事曆（月曆／列表） | ✅ 完成（資料改 `data.js`） |
| 第一階段 | 內部公告 | ✅ 完成 |
| 第一階段 | 表單／規則 PDF | ✅ 版型完成，待放檔案 |
| 第二階段 | 撥款時程公告 | ✅ 完成（手動更新版） |
| 第二階段 | 升段進度／排名 | ✅ 完成（手動更新版） |
| 第三階段 | 個人撥款明細查詢 | 版型完成，**需串財務資料來源** |
| 第三階段 | 個人資料維護 | 版型完成，**需接後端儲存** |
| 第四階段 | 棋譜／SGF 下載、甄選進度即時查詢、AI 對局分析 | 尚未實作 |

---

## 部署

整個資料夾就是網站本體，直接上傳即可。

- **GitHub Pages**：把資料夾推上 repo，Settings → Pages 選擇分支根目錄
- **Netlify / Cloudflare Pages**：拖曳整個資料夾即可部署
- **一般虛擬主機**：用 FTP 上傳到 `public_html/` 或 `www/`

部署前記得刪掉專案根目錄中不屬於網站的檔案（例如規劃用的截圖），
避免被公開存取。
