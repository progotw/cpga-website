-- ===========================================================================
-- 棋士自述與社群連結
--
-- 在 Supabase 的 SQL Editor 貼上執行。可重複執行。
-- 需先執行過 schema.sql（依賴 is_admin() 與 touch_row()）。
--
-- 公開個人頁的簡介與連結目前全部來自海峰，棋士本人改不了，想加自己的
-- IG 或頻道只能請對方改。這張表讓棋士自己維護。
--
-- 與 teaching 分開：想放社群連結的人不一定想收學生，不該被迫勾「願意刊登」。
-- ===========================================================================

create table if not exists public.player_profiles (
  user_id    uuid primary key references auth.users on delete cascade,
  player_id  text not null,

  -- 自我介紹。顯示在海峰的簡介「之上」，不取代它——
  -- 那份簡介含主要棋戰履歷，蓋掉是損失。
  bio        text not null default '',

  -- [{label, url}]，與公開頁既有的連結合併後去重
  links      jsonb not null default '[]'::jsonb,

  -- 下架開關。只有管理員能改：個人頁是公開的，放了不適當的內容時
  -- 要有辦法立刻撤下，而不是等當事人自己處理。
  hidden     boolean not null default false,

  updated_at timestamptz not null default now(),

  constraint player_profiles_bio_len check (length(bio) <= 2000)
);

comment on table public.player_profiles is
  '棋士自行維護的自述與社群連結，顯示在公開個人頁。'
  'hidden 由管理員控制，供下架不適當內容使用。';

create index if not exists player_profiles_player on public.player_profiles (player_id);

drop trigger if exists player_profiles_touch on public.player_profiles;
create trigger player_profiles_touch
  before update on public.player_profiles
  for each row execute function public.touch_row();

-- ---------------------------------------------------------------------------
-- 權限
--
-- 棋士只能存取自己那一列；管理員可讀可改（下架用）。
-- 公開頁讀的是發布流程匯出的靜態 JSON，不直接讀這張表。
-- ---------------------------------------------------------------------------
alter table public.player_profiles enable row level security;

drop policy if exists player_profiles_select_own on public.player_profiles;
create policy player_profiles_select_own on public.player_profiles
  for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

drop policy if exists player_profiles_insert_own on public.player_profiles;
create policy player_profiles_insert_own on public.player_profiles
  for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists player_profiles_update_own on public.player_profiles;
create policy player_profiles_update_own on public.player_profiles
  for update to authenticated
  using (user_id = auth.uid() or public.is_admin())
  with check (user_id = auth.uid() or public.is_admin());

drop policy if exists player_profiles_delete on public.player_profiles;
create policy player_profiles_delete on public.player_profiles
  for delete to authenticated
  using (user_id = auth.uid() or public.is_admin());

-- ---------------------------------------------------------------------------
-- 棋士不得自行解除下架
--
-- 政策只能決定整列能不能改，決定不了哪些欄位能改。
-- 沒有這道觸發器，被下架的人可以自己把 hidden 改回 false。
-- ---------------------------------------------------------------------------
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
  new.hidden    := old.hidden;
  new.user_id   := old.user_id;
  new.player_id := old.player_id;
  return new;
end;
$$;

drop trigger if exists player_profiles_guard on public.player_profiles;
create trigger player_profiles_guard
  before update on public.player_profiles
  for each row execute function public.player_profiles_guard();
