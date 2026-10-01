-- ===========================================================================
-- 棋士專區 — 教學資訊（找老師專區的來源）
--
-- 在 Supabase 的 SQL Editor 貼上執行。可重複執行。
-- 需先執行過 schema.sql。
--
-- 棋士自行填寫，勾選「願意刊登」後才會出現在官網的「找老師」專區。
-- 姓名、段位、照片、經歷由 players.json 依 player_id 帶入，不在此重複存放。
-- ===========================================================================

create table if not exists public.teaching (
  user_id      uuid primary key references auth.users on delete cascade,
  player_id    text not null,

  -- 這個欄位就是開關：false 時不會匯出到官網
  listed       boolean not null default false,

  modes        text[] not null default '{}',   -- 實體／線上
  areas        text[] not null default '{}',
  students     text[] not null default '{}',   -- 兒童／青少年／成人
  languages    text[] not null default '{}',
  levels       text not null default '',
  fee          text not null default '',
  availability text not null default '',
  intro        text not null default '',

  -- 是否接收官網轉來的學生詢問表單
  accept_form  boolean not null default true,

  -- [{type,label,value}]；只放老師同意公開的管道
  contacts     jsonb not null default '[]'::jsonb,
  -- [{label,url}]
  links        jsonb not null default '[]'::jsonb,

  updated_at   timestamptz not null default now()
);

comment on table public.teaching is
  '棋士自行填寫的教學資訊。listed 為 true 者才會匯出到官網的找老師專區。';

create index if not exists teaching_listed on public.teaching (listed) where listed;

drop trigger if exists teaching_touch on public.teaching;
create trigger teaching_touch
  before update on public.teaching
  for each row execute function public.touch_row();

-- ---------------------------------------------------------------------------
-- 權限：棋士只能存取自己那一列
--
-- 刻意不開放「讀別人的」——老師的聯絡方式屬個人資料，
-- 公開的那部分由發布流程匯出成靜態 JSON，不從這裡直接讀。
-- ---------------------------------------------------------------------------
alter table public.teaching enable row level security;

drop policy if exists teaching_select_own on public.teaching;
create policy teaching_select_own on public.teaching
  for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

drop policy if exists teaching_insert_own on public.teaching;
create policy teaching_insert_own on public.teaching
  for insert to authenticated
  with check (user_id = auth.uid() or public.is_admin());

drop policy if exists teaching_update_own on public.teaching;
create policy teaching_update_own on public.teaching
  for update to authenticated
  using (user_id = auth.uid() or public.is_admin())
  with check (user_id = auth.uid() or public.is_admin());

drop policy if exists teaching_delete_own on public.teaching;
create policy teaching_delete_own on public.teaching
  for delete to authenticated
  using (user_id = auth.uid() or public.is_admin());
