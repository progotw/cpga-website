-- ===========================================================================
-- 權限補強（2026-11-19 安全檢查後）
--
-- 這一份只補洞，不新增功能，也不動任何資料。可以重複執行。
-- 在 Supabase 後台的 SQL Editor 整份貼上執行即可。
--
-- 補的五件事：
--   1. player_recipients()／enqueue_reminders() 關掉對外呼叫
--   2. 棋士不能自行竄改 profiles.player_id
--   3. 報名時不能冒用別人的棋士 id 與姓名
--   4. 教學資訊不能掛別人的棋士 id
--   5. 被下架的個人簡介不能靠「刪掉再新增」復活
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- 1. 兩支函式不再對外開放呼叫
--
-- Postgres 建立函式時，預設把執行權給所有人（PUBLIC），匿名身分也在裡面；
-- public schema 的函式又會被自動開成 REST 介面。結果是：任何人拿網頁裡
-- 那把公開金鑰就能呼叫 player_recipients()，一次撈走全體棋士的電子信箱。
-- （schema_approve.sql 的 user_id_by_email() 當初有收，這兩支漏了。）
--
-- 這兩支只給排程與寄信流程用，收掉不影響任何功能：
-- enqueue_announce() 是觸發器、pg_cron 以資料庫管理者身分執行，都不受影響。
-- ---------------------------------------------------------------------------
revoke all on function public.player_recipients() from public;
revoke all on function public.player_recipients() from anon;
revoke all on function public.player_recipients() from authenticated;
grant execute on function public.player_recipients() to service_role;

revoke all on function public.enqueue_reminders() from public;
revoke all on function public.enqueue_reminders() from anon;
revoke all on function public.enqueue_reminders() from authenticated;
grant execute on function public.enqueue_reminders() to service_role;


-- ---------------------------------------------------------------------------
-- 2. profiles.player_id 釘死
--
-- 原本的政策只釘住 role（所以沒有人能自己升成管理員），但 player_id 沒釘。
-- 棋士自己把 player_id 改成另一位棋士的 id，my_player_id() 就會回傳那個值，
-- 於是對局費、轉交的學生來信都讀得到——這兩張表的政策都是靠它判斷的。
-- player_id 本來就只該由開通流程與後台（service_role）設定。
-- ---------------------------------------------------------------------------
drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self on public.profiles
  for update using (id = auth.uid())
  with check (
    id = auth.uid()
    and role      =                (select role      from public.profiles where id = auth.uid())
    and player_id is not distinct from (select player_id from public.profiles where id = auth.uid())
  );


-- ---------------------------------------------------------------------------
-- 3. 報名：新增時也要擋身分欄位
--
-- entries_guard 原本只掛在 update，所以「改」不了，但「新增」時可以直接填
-- 別人的棋士 id 與姓名，秘書處匯出的名單就會多一位根本沒報名的棋士。
-- 這裡把同一道守門擴到 insert：新增時一律以申請者自己的身分為準。
-- 姓名若資料庫裡是空的，才沿用送來的值，免得名單變成空白。
-- ---------------------------------------------------------------------------
create or replace function public.entries_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.is_admin() then
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.user_id      := auth.uid();
    new.player_id    := public.my_player_id();
    new.display_name := coalesce(
      nullif(trim((select display_name from public.profiles where id = auth.uid())), ''),
      new.display_name);
    new.admin_note   := null;
    return new;
  end if;

  new.tournament_id := old.tournament_id;
  new.user_id       := old.user_id;
  new.player_id     := old.player_id;
  new.display_name  := old.display_name;
  new.admin_note    := old.admin_note;
  new.created_at    := old.created_at;
  return new;
end;
$$;

drop trigger if exists entries_guard on public.entries;
create trigger entries_guard
  before insert or update on public.entries
  for each row execute function public.entries_guard();


-- ---------------------------------------------------------------------------
-- 4. 教學資訊：不能掛別人的棋士 id
--
-- 這張表原本沒有守門觸發器，player_id 可以隨便填。發布流程是用 player_id
-- 去對棋士名錄的姓名與照片的，等於可以把自己的聯絡方式掛到別人的名下。
-- ---------------------------------------------------------------------------
create or replace function public.teaching_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.is_admin() then
    return new;
  end if;
  new.user_id   := auth.uid();
  new.player_id := public.my_player_id();
  return new;
end;
$$;

drop trigger if exists teaching_guard on public.teaching;
create trigger teaching_guard
  before insert or update on public.teaching
  for each row execute function public.teaching_guard();


-- ---------------------------------------------------------------------------
-- 5. 個人簡介：下架之後不能自己刪掉重來
--
-- 守門觸發器擋得住「把 hidden 改回 false」，但擋不住「整列刪掉再新增一列」
-- ——新的一列 hidden 是預設值 false，下架就失效了。
-- 改成：被下架的那一列，本人不能刪（管理員可以）。
-- 同時把新增也納入守門，不然 player_id 一樣可以填別人的。
-- ---------------------------------------------------------------------------
drop policy if exists player_profiles_delete on public.player_profiles;
create policy player_profiles_delete on public.player_profiles
  for delete to authenticated
  using ((user_id = auth.uid() and not coalesce(hidden, false)) or public.is_admin());

create or replace function public.player_profiles_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.is_admin() then
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.user_id   := auth.uid();
    new.player_id := public.my_player_id();
    new.hidden    := false;
    return new;
  end if;

  new.hidden    := old.hidden;
  new.user_id   := old.user_id;
  new.player_id := old.player_id;
  return new;
end;
$$;

drop trigger if exists player_profiles_guard on public.player_profiles;
create trigger player_profiles_guard
  before insert or update on public.player_profiles
  for each row execute function public.player_profiles_guard();


-- ---------------------------------------------------------------------------
-- 執行後的自我檢查（跑完上面之後，這段會列出結果）
-- ---------------------------------------------------------------------------
select '1. 兩支函式的對外執行權（應為 false）' as 檢查項目,
       has_function_privilege('anon', 'public.player_recipients()', 'execute') as 匿名可呼叫信箱表,
       has_function_privilege('anon', 'public.enqueue_reminders()', 'execute') as 匿名可呼叫提醒;

select '2. 收件匣是否仍開放匿名寫入（應為 0 筆）' as 檢查項目, count(*) as 筆數
from pg_policies
where schemaname = 'public' and tablename = 'messages' and policyname = 'messages_insert_anon';

select '3. 守門觸發器（應有 entries／teaching／player_profiles 三組，含 INSERT）' as 檢查項目,
       event_object_table as 資料表, trigger_name as 觸發器, event_manipulation as 時機
from information_schema.triggers
where trigger_schema = 'public' and trigger_name like '%_guard'
order by 資料表, 時機;
