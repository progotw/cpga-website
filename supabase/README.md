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
