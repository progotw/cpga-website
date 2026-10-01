-- ===========================================================================
-- 棋士專區 — 第一階段
--
-- 在 Supabase 的 SQL Editor 貼上執行。可重複執行。
-- 需先執行過 schema.sql（本檔依賴 profiles 與 is_admin()）。
--
-- 第一階段只做「全體棋士共通」的內容：內部公告與專屬表單。
-- 個人資料（對局費、積分）屬第二、三階段，另行設計。
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 內部公告
--
-- 只有登入的棋士與管理員看得到，不會出現在公開網站上。
-- ---------------------------------------------------------------------------
create table if not exists public.announcements (
  id           bigint generated always as identity primary key,
  title        text not null,
  body         text not null default '',          -- Markdown
  pinned       boolean not null default false,
  published    boolean not null default false,     -- 未發布者只有管理員看得到
  published_at timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  updated_by   uuid references auth.users
);

comment on table public.announcements is
  '棋士專區的內部公告。published 為 false 時只有管理員看得到，供先擬稿後發布。';

create index if not exists announcements_order
  on public.announcements (pinned desc, published_at desc nulls last, id desc);

-- ---------------------------------------------------------------------------
-- 棋士專屬表單
--
-- 檔案放在網站的 site/assets/files/member/ 之下，這裡只存索引。
-- 公開網站不會列出這些項目。
-- ---------------------------------------------------------------------------
create table if not exists public.member_files (
  id         bigint generated always as identity primary key,
  category   text not null default '表單',
  name       text not null,
  ext        text not null default 'DOCX',
  size       text not null default '',
  url        text not null default '',            -- 相對站台根目錄，例如 assets/files/member/請假單.docx
  sort       int  not null default 0,
  updated_at timestamptz not null default now()
);

comment on table public.member_files is
  '棋士專區的下載項目索引。檔案本身放在網站目錄，不存在資料庫裡。';

-- ---------------------------------------------------------------------------
-- 更新時間
-- ---------------------------------------------------------------------------
create or replace function public.touch_row()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  if to_jsonb(new) ? 'updated_by' then
    new.updated_by := auth.uid();
  end if;
  return new;
end;
$$;

drop trigger if exists announcements_touch on public.announcements;
create trigger announcements_touch
  before update on public.announcements
  for each row execute function public.touch_row();

drop trigger if exists member_files_touch on public.member_files;
create trigger member_files_touch
  before update on public.member_files
  for each row execute function public.touch_row();

-- ---------------------------------------------------------------------------
-- 權限
--
-- 讀取一律要求登入（to authenticated）：匿名訪客連資料列都拿不到。
-- 寫入限管理員。
-- ---------------------------------------------------------------------------
alter table public.announcements enable row level security;
alter table public.member_files  enable row level security;

drop policy if exists announcements_read on public.announcements;
create policy announcements_read on public.announcements
  for select to authenticated
  using (published or public.is_admin());

drop policy if exists announcements_write on public.announcements;
create policy announcements_write on public.announcements
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists member_files_read on public.member_files;
create policy member_files_read on public.member_files
  for select to authenticated using (true);

drop policy if exists member_files_write on public.member_files;
create policy member_files_write on public.member_files
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- 建立棋士帳號後，把它對應到棋士名錄
--
-- player_id 取自 site/assets/data/players.json 的棋士 id
-- （也就是棋士介紹頁網址 ?id= 後面那串）。
--
--   update public.profiles
--      set role = 'player', display_name = '王元均',
--          player_id = 'E9D94D4CE46F6025510F71D1EA39FCB3'
--    where id = (select id from auth.users where email = '該棋士的信箱');
-- ---------------------------------------------------------------------------
