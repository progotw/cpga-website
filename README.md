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
  events/               賽事專區
  teachers/             找職業老師
  gallery/              賽事花絮
  membership/           加入會員
  downloads/            下載專區
  member/               棋士專區（目前為前端示意，見下方限制）
  assets/css/style.css  全站樣式
  assets/js/            共用程式（見下表）
  assets/data/          抓取產生的 JSON
  assets/img/players/   棋士照片（壓縮後約 4 MB）
  assets/files/         可下載的協會文件

scripts/                抓取程式（不會被公開存取）
.github/workflows/      每日自動更新資料
netlify.toml            指定發布目錄為 site/
```

| 檔案 | 用途 |
| --- | --- |
| `assets/js/site.js` | 頁首、頁尾、導覽列（改導覽列編輯最上方的 `NAV`） |
| `assets/js/data.js` | 手動維護的資料：下載清單、大事紀、棋士人數、棋士專區示範資料 |
| `assets/js/schedule.js` | 賽程行事曆載入與時間顯示 |
| `assets/js/players.js` | 棋士名錄載入 |
| `assets/js/content.js` | 最新消息與賽事清單載入 |
| `assets/js/teachers.js` | 找老師資料載入（含預覽模式） |
| `assets/js/games-page.js` | 賽事分類頁共用渲染 |
| `assets/js/member.js` | 棋士專區登入守門與側邊選單 |

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

`.github/workflows/update-data.yml` 每天台灣時間早上 6:00 在雲端跑這四支，
資料有變動就自動提交。任一支中止會讓工作流程失敗並寄信通知。

### 資料的顯示規則（改程式前必讀）

- **賽程時間**：一律 11:00；日曆標題註明 `(上下午)` 者為當天兩局，10:00 與 14:00。
  推定的時間會標星號＊。日曆若填了真實時間，程式優先採用。
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

**棋士專區（`site/member/`）是前端示意版本**

- 登入不驗證帳密，點一下就進得去；登入狀態只存在瀏覽器本機
- 撥款金額、積分、對局紀錄都是範例資料
- 正式上線必須改為後端驗證，個人財務資料需在伺服器端做權限檢查

後端建置規劃（Supabase、139 位棋士帳號、資料表設計、分階段上線）：
<https://claude.ai/code/artifact/8e0c2760-bd1d-4dce-9ea1-8b2c6b1641f9>

**其他**

- 協會尚未公開晉段的積分門檻辦法，因此段位與晉升頁只呈現已發生的升段公告，不顯示「還差幾分」
- 賽事花絮的 IG 貼文牆仍是空版位，需協會 IG 帳號才能串接
- 理監事名冊與會員大會會議紀錄含個資，**刻意未放入網站與版控**

---

## 個資注意事項

棋士信箱清單、理監事名冊等含個資的檔案**絕對不可提交進 git**。
一旦 commit 就會留在版本歷史裡，即使之後刪除也很難清乾淨。
這類資料直接匯入後端資料庫，本機副本也不要放在專案資料夾內。
