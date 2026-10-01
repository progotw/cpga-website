# Supabase 設定

專案：`tagnpbazcpdjeobjigwx`（Region: Northeast Asia / Tokyo，Free 方案）

## 首次設定

1. **建立資料表與權限**
   Supabase Dashboard → SQL Editor → 貼上 `schema.sql` 全文 → Run。
   可重複執行，不會重複建立。

2. **關閉自行註冊**
   Authentication → Providers → Email → 關閉 **Enable email signups**。
   帳號一律由協會在 Authentication → Users 手動建立。

3. **建立管理員帳號**
   Authentication → Users → Add user，填信箱與密碼。
   建立後到 SQL Editor 執行：

   ```sql
   update public.profiles
      set role = 'admin', display_name = '姓名'
    where id = (select id from auth.users where email = '該帳號的信箱');
   ```

   `role` 刻意不開放前端修改，只能用 SQL 或 service_role 變更。

## 金鑰

| 金鑰 | 用途 | 可否公開 |
| --- | --- | --- |
| Project URL | 前端連線位址 | ✅ 寫進網頁 |
| `anon` public | 前端連線金鑰，受 RLS 保護 | ✅ 寫進網頁 |
| `service_role` | 繞過所有權限檢查 | ❌ **只放 GitHub Secrets，絕不進前端、絕不進版控** |

## 為什麼公開網站不直接讀資料庫

免費方案的專案**閒置七天會自動暫停**。協會可能兩個月才改一次內容，
若公開頁面在訪客開啟時才去抓章程，專案早已休眠，訪客會看到空白。

因此採「後台編輯 → 發布 → 匯出成 `site/assets/data/*.json` → Cloudflare 部署」。
公開網站維持零外部依賴，資料庫只在秘書處登入後台時才會被喚醒。

---

## 發布功能的設定

後台按「發布」→ Edge Function 驗證權限 → 觸發 GitHub Action →
匯出 JSON 並提交 → Cloudflare 自動部署。

### 1. GitHub Secrets

repo → Settings → Secrets and variables → Actions → New repository secret

| 名稱 | 值 |
| --- | --- |
| `SUPABASE_URL` | `https://tagnpbazcpdjeobjigwx.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase 的 secret key |

service_role 金鑰只存在這裡，不進版控、不進前端。

### 2. GitHub 權杖

GitHub → Settings（個人帳號）→ Developer settings →
Personal access tokens → Fine-grained tokens → Generate new token

- Repository access：只選 `cpga-website`
- Permissions → Repository permissions → **Contents: Read and write**

### 3. Supabase Edge Function

Dashboard → Edge Functions → Deploy a new function，名稱 `publish`，
貼上 `supabase/functions/publish/index.ts` 的內容。

接著 Edge Functions → Secrets 新增：

| 名稱 | 值 |
| --- | --- |
| `GITHUB_TOKEN` | 第 2 步產生的權杖 |
| `GITHUB_REPO` | `progotw/cpga-website` |

`SUPABASE_URL` 與 `SUPABASE_ANON_KEY` 由平台自動提供，不需設定。

### 為什麼要經過 Edge Function

GitHub 權杖不能放進網頁——前端程式碼對任何人都是可讀的。
Edge Function 在伺服器端持有權杖，並且只在確認呼叫者的角色是 admin
之後才代為觸發。它本身不持有 service_role，查詢同樣受資料列權限限制。
