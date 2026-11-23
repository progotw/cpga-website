-- ===========================================================================
-- 棋士研究室（海峰棋院的個人 AI 分析）：每位棋士的專屬網址
--
-- 網址裡的 #k= 那串等於鑰匙，知道網址的人就看得到那一頁，所以：
--   * 這份清單只存在這張表，不進版本庫、不放進 site/（放了就等於公開）；
--   * 只開「本人讀自己那一列」，不開管理員讀全部——多一條政策就等於
--     多一個把全部鑰匙一次讀走的入口（海峰的說明文件也特別交代了這點）；
--   * 完全不開放從網頁新增／修改／刪除，只由秘書處在 SQL Editor 匯入。
--
-- 規格來自海峰棋院 2026-11-23 的「棋士研究室串接說明」。
-- 匯入的清單檔（棋士研究室連結表_日期.sql）由海峰提供，匯入後請刪除，
-- 不要留在桌面或任何共用資料夾。
-- ===========================================================================

create table if not exists public.qishi_links (
  player_id  text primary key,          -- 對應 profiles.player_id 與 players.json 的 id
  url        text not null,
  updated_at timestamptz not null default now()
);

alter table public.qishi_links enable row level security;

-- 只有登入的本人讀得到自己那一列。
-- 注意：這裡讀的是 profiles.player_id，而該欄位已於 2026-11-19 的權限補強
-- （schema_hardening.sql）釘死，棋士不能自行改成別人的 id——
-- 沒有那道補強的話，改一下就能讀走別人的鑰匙。
drop policy if exists qishi_links_select_own on public.qishi_links;
create policy qishi_links_select_own on public.qishi_links
  for select to authenticated
  using (player_id = (select p.player_id from public.profiles p where p.id = auth.uid()));

-- 管理員可讀全部。
--
-- 海峰原本的說明交代不要加這條（多一條政策就等於多一個把全部鑰匙一次讀走的
-- 入口），2026-11-23 秘書處詢問後海峰同意開放，所以補上。
-- 代價要記著：這些網址不會過期，管理員帳號一旦被盜，外流的是 89 把永久鑰匙。
-- 真的外流時的處理方式是請海峰重設，再整份重新匯入一次連結表。
drop policy if exists qishi_links_admin_read on public.qishi_links;
create policy qishi_links_admin_read on public.qishi_links
  for select to authenticated
  using (public.is_admin());

-- 自我檢查
select '政策檢查' as 檢查項目,
       count(*) filter (where 'anon' = any (roles) or 'public' = any (roles)) as 開放匿名_應為0,
       count(*) as 政策總數_應為2,
       count(*) filter (where cmd <> 'SELECT') as 可寫入的政策_應為0
from pg_policies
where schemaname = 'public' and tablename = 'qishi_links';
