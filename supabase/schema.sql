-- ===========================================================================
-- 中華職業圍棋協會 — 資料庫結構
--
-- 在 Supabase 的 SQL Editor 貼上執行。可重複執行（皆為 if not exists / or replace）。
--
-- 設計重點：
--   1. 帳號一律由協會建立，不開放自行註冊（在 Authentication → Providers 關閉 signup）。
--   2. 角色分 admin（秘書處）與 player（棋士），寫在 profiles.role。
--   3. 內容表只存「編輯中的來源」；公開網站讀的是發布後產生的靜態 JSON，
--      不直接連本資料庫——免費方案閒置七天會暫停，公開頁面不能依賴它。
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 使用者資料
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id           uuid primary key references auth.users on delete cascade,
  role         text not null default 'player' check (role in ('admin', 'player')),
  display_name text not null default '',
  -- 棋士帳號對應 players.json 的棋士 id，admin 留空
  player_id    text,
  created_at   timestamptz not null default now()
);

comment on table public.profiles is '帳號的角色與顯示名稱。由協會建立，使用者不能自行變更 role。';

-- 新使用者建立時自動補一列 profile，避免登入後查無資料
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'display_name', ''))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- 權限判斷
--
-- 必須用 security definer：若直接在 profiles 的政策裡查 profiles，
-- 會觸發自己的政策而無限遞迴，Postgres 會直接報錯。
-- ---------------------------------------------------------------------------
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

-- ---------------------------------------------------------------------------
-- 內容表
--
-- key 對應 site/assets/data/<key>.json。
-- kind = 'structured' 用 data（表單編輯）；kind = 'markdown' 用 body（條文編輯）。
-- ---------------------------------------------------------------------------
create table if not exists public.content (
  key        text primary key,
  title      text not null,
  kind       text not null check (kind in ('structured', 'markdown')),
  data       jsonb,
  body       text,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users
);

comment on table public.content is '協會自有內容的編輯來源。發布時匯出成 site/assets/data/*.json。';

create or replace function public.touch_content()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end;
$$;

drop trigger if exists content_touch on public.content;
create trigger content_touch
  before update on public.content
  for each row execute function public.touch_content();

-- ---------------------------------------------------------------------------
-- 資料列權限
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.content  enable row level security;

-- profiles：本人可讀自己；admin 可讀全部。任何人都不能改 role（只能由後台以 service_role 改）
drop policy if exists profiles_select_self on public.profiles;
create policy profiles_select_self on public.profiles
  for select using (id = auth.uid() or public.is_admin());

drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self on public.profiles
  for update using (id = auth.uid())
  with check (id = auth.uid() and role = (select role from public.profiles where id = auth.uid()));

-- content：登入者可讀（後台預覽用）；只有 admin 能改
drop policy if exists content_select on public.content;
create policy content_select on public.content
  for select to authenticated using (true);

drop policy if exists content_write on public.content;
create policy content_write on public.content
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- 內容項目的初始列（data/body 先留空，由匯入程式填入現有 JSON）
-- ---------------------------------------------------------------------------
insert into public.content (key, title, kind) values
  ('board',        '理監事會／組織架構', 'structured'),
  ('membership',   '會員類別與會費',     'structured'),
  ('milestones',   '大事紀',             'structured'),
  ('downloads',    '下載項目',           'structured'),
  ('charter',      '章程要點',           'markdown'),
  ('regulations',  '對局與紀律規範',     'markdown'),
  ('qualification','職業棋士甄選辦法',   'markdown')
on conflict (key) do nothing;
