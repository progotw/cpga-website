# 中華職業圍棋協會 官方網站

靜態網站，線上位置：<https://cpga.netlify.app>

公開內容（最新消息、賽事、棋士名錄、賽程）每日從**海峰棋院**抓取；
協會自有內容（章程、理監事、會費、文件）手動維護。

---

## 專案結構

```
site/                   ← Netlify 發布的網站本體
  index.html            首頁
  about/                關於協會（簡介／理監事／大事紀／章程／聯絡方式）
  news/                 最新消息
  players/              職業棋士名錄與介紹頁
  teachers/             找職業老師
  gallery/              賽事花絮
  membership/           加入會員
  downloads/            下載專區
  member/               棋士專區說明頁（尚未開放登入）
  assets/css/style.css  全站樣式
  assets/js/            共用程式（見下表）
  assets/data/          抓取產生的 JSON
  assets/img/players/   棋士照片（壓縮後約 4 MB）
  assets/files/         可下載的協會文件

prototype/member/       棋士專區示意版（已移出發布目錄，第二階段改接後端時作為參考）
scripts/                抓取程式（不會被公開存取）
.github/workflows/      每日自動更新資料
netlify.toml            指定發布目錄為 site/
```

| 檔案 | 用途 |
| --- | --- |
| `assets/js/site.js` | 頁首、頁尾、導覽列（改導覽列編輯最上方的 `NAV`） |
| `assets/js/data.js` | 手動維護的資料：下載清單、大事紀、棋士人數 |
| `assets/js/schedule.js` | 賽程行事曆載入與時間顯示 |
| `assets/js/players.js` | 棋士名錄載入 |
| `assets/js/content.js` | 最新消息與賽事清單載入 |
| `assets/js/teachers.js` | 找老師資料載入（含預覽模式） |
| `assets/js/games-page.js` | 賽事分類頁共用渲染 |

---

## 本機預覽

```bash
python -m http.server 5173 --directory site
```

開啟 <http://localhost:5173>。用 `file://` 直接開 HTML 無法運作，必須透過伺服器。

---

## 更新資料

四支爬蟲，都內建**資料異常就中止**的防呆，抓取失敗不會覆蓋既有的好資料。

```bash
python scripts/scrape_schedule.py site/assets/data/schedule.json --days 60
python scripts/scrape_news_games.py site
python scripts/scrape_players.py site/assets/data/players.json
python scripts/fetch_photos.py site
```

| 程式 | 產出 | 來源 |
| --- | --- | --- |
| `scrape_schedule.py` | `schedule.json` | 海峰公開行事曆 iCal（**不需 Google 授權**） |
| `scrape_news_games.py` | `news.json`、`games.json` | haifong.org 最新消息與賽事分類頁 |
| `scrape_players.py` | `players.json` | haifong.org 職業棋士頁 |
| `fetch_photos.py` | `assets/img/players/*.jpg` | 只下載本地缺少的，加 `--force` 重抓全部 |

`.github/workflows/update-data.yml` 每天台灣時間晚上 20:17 在雲端跑這四支，
資料有變動就自動提交。任一支中止會讓工作流程失敗並寄信通知。

### 資料的顯示規則（改程式前必讀）

- **賽程時間**：一律 11:00；日曆標題註明 `(上下午)` 者為當天兩局，10:00 與 14:00。
  推定的時間會標星號＊。日曆若填了真實時間，程式優先採用。
- **甄選共三關**，不要混為一談：`institute-entry.html` 是業餘棋手考進院生（每年 11 月）；
  `institute.html` 是院生組職業棋士甄選（7 月上旬）；`social.html` 是社會組職業棋士甄選（7 月中下旬）。
  「院生甄選」與「院生組甄選」名稱極近但完全不同，改內容前先確認是哪一個。
- **規範全文**：`events/rules.html` 收錄對局管理規定、紀律規範、作弊防制辦法、社群媒體指引四份全文，
  來源為海峰「職業賽 → 相關規範」（`ajax_game_class_news_data`，game_class_id 97FEB3D9…）。
  協會若修訂條文，須手動同步；改動時務必與原始公告逐條核對。
- **賽事名稱**：畫面一律顯示 `name`（日曆原文，例如「玄樂盃」）。
  `series` 是正規化過的分組鍵，異體字會被統一（變成「玄樂杯」），只用來決定顏色。
- **棋士冠軍數**：`history` 可能同時有「頭銜冠軍」與「歷史成績」兩列且**順序不固定**，
  取冠軍數要掃過整個陣列。139 位中只有 38 位有此欄位，其餘留白不顯示「0 冠」。
- **棋士名錄頁只顯示姓名**，依段位分組；照片只在個人頁出現（照片是正方形，顯示必須維持 1:1）。
- 名錄人數改了要同步更新 `data.js` 的 `PLAYER_COUNT`。

---

## 找職業老師

`site/assets/data/teachers.json` 只存教學欄位；姓名、段位、照片、經歷由 `players.json`
依 `id` 自動帶入，不需重複維護。欄位說明與登錄表單建議欄位見 `scripts/teachers.sample.json`。

**聯絡管道採自願公開**：沒有寫進 `contacts` 的管道不會出現在網站上。
`acceptForm` 控制是否顯示詢問表單。

預覽版面（範例資料，非實際）：
<https://cpga.netlify.app/teachers/index.html?preview=1>

詢問表單使用 Netlify Forms，目前收件通知寄到協會信箱，由秘書處轉交老師。

---

## 部署

目前用 Netlify CLI 手動部署：

```bash
npx --yes netlify-cli@latest deploy --prod --dir site
```

專案已完成 git 初始化。接上 GitHub 並在 Netlify 連結該儲存庫後，
推送即自動部署，`.github/workflows/` 的每日更新也才會生效。

---

## 已知限制

**棋士專區尚未開放（第一階段刻意如此）**

- `site/member/index.html` 只是說明頁，沒有登入功能
- 原本的示意版（假登入、虛構撥款金額與積分）已移到 `prototype/member/`，**不在發布目錄內**
- `netlify.toml` 有一條 `/member/*` 轉址，舊書籤會導回說明頁

分三階段上線：①先讓公開內容完全正確並對外發表　②開發棋士帳號與賽程、對局費串接　③交付棋士使用

**其他**

- 晉段條件（累計勝局／獎勵升段）已於 2026.04 公告，全文在 `events/rules.html#promotion`；
  但個人累計勝局數需後端才能顯示，目前頁面只列門檻，不顯示「還差幾局」
- 賽事花絮目前只有拍攝規範；相簿與 IG 貼文牆待協會提供照片與 IG 帳號
- 大事紀僅收錄可查證的項目（章程備查紀錄、114 年度工作報告），2009–2024 待協會提供，**不可自行編寫**
- 理監事名冊與會員大會會議紀錄含個資，**刻意未放入網站與版控**
- 年度工作報告與收支決算表依協會決定**不對外公開**，已自下載專區與 `site/assets/files/` 移除

---

## 個資注意事項

棋士信箱清單、理監事名冊等含個資的檔案**絕對不可提交進 git**。
一旦 commit 就會留在版本歷史裡，即使之後刪除也很難清乾淨。
這類資料直接匯入後端資料庫，本機副本也不要放在專案資料夾內。
