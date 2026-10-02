-- ===========================================================================
-- 職業賽事線上報名
--
-- 在 Supabase 的 SQL Editor 貼上執行。可重複執行。
-- 需先執行過 schema.sql（依賴 profiles 與 is_admin()）與 schema_member.sql
-- （依賴 touch_row()）。
--
-- 只做職業賽事。院生甄選與業餘賽事維持原本的管道（海峰網站／電子郵件），
-- 不在這裡收，避免同一場比賽有兩份對不起來的名單。
--
-- 職業賽事免報名費，且全體職業棋士都是會員，所以這裡不處理金流，
-- 也不做資格比對——資格以文字說明，由秘書處人工檢視。
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 開放報名的賽事
-- ---------------------------------------------------------------------------
create table if not exists public.tournaments (
  id          bigint generated always as identity primary key,
  title       text not null,
  note        text not null default '',          -- 賽事說明
  eligibility text not null default '',          -- 參賽資格，純文字；系統不據此擋人
  opens_at    timestamptz,                       -- 留空表示即刻開放
  closes_at   timestamptz,                       -- 留空表示不設截止
  published   boolean not null default false,    -- 未發布者只有管理員看得到
  sort        int not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  updated_by  uuid references auth.users
);

comment on table public.tournaments is
  '開放線上報名的職業賽事。published 為 false 時只有管理員看得到，供先擬稿後發布。';

create index if not exists tournaments_order
  on public.tournaments (sort desc, closes_at nulls last, id desc);

-- ---------------------------------------------------------------------------
-- 報名紀錄
--
-- display_name 與 player_id 在報名當下寫入並保留。
-- 棋士日後改名或帳號被刪，名單仍然讀得出當時報名的是誰。
-- ---------------------------------------------------------------------------
create table if not exists public.entries (
  id            bigint generated always as identity primary key,
  tournament_id bigint not null references public.tournaments on delete cascade,
  user_id       uuid not null references auth.users on delete set null,

  player_id     text not null default '',
  display_name  text not null default '',

  -- 取消報名不刪除資料列，保留紀錄供秘書處查核
  withdrawn     boolean not null default false,

  note          text not null default '',        -- 棋士自填，例如不便出席的時段
  admin_note    text not null default '',        -- 秘書處註記，棋士看不到

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  constraint entries_once unique (tournament_id, user_id),
  constraint entries_len check (length(note) <= 500 and length(admin_note) <= 1000)
);

comment on table public.entries is
  '職業賽事報名紀錄。取消報名是把 withdrawn 設為 true，不刪除資料列。';

create index if not exists entries_by_tournament
  on public.entries (tournament_id, withdrawn, created_at);

drop trigger if exists tournaments_touch on public.tournaments;
create trigger tournaments_touch
  before update on public.tournaments
  for each row execute function public.touch_row();

drop trigger if exists entries_touch on public.entries;
create trigger entries_touch
  before update on public.entries
  for each row execute function public.touch_row();

-- ---------------------------------------------------------------------------
-- 報名期間是否開放
--
-- 截止時間必須在資料庫層把關。只靠畫面上把按鈕關掉，
-- 任何人開著舊分頁或直接打 API 就能在截止後補報名。
--
-- security definer：政策會呼叫它去查 tournaments，
-- 若以呼叫者身分執行會再觸發 tournaments 自己的政策。
-- ---------------------------------------------------------------------------
create or replace function public.entry_open(tid bigint)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select coalesce((
    select t.published
       and (t.opens_at  is null or now() >= t.opens_at)
       and (t.closes_at is null or now() <= t.closes_at)
      from public.tournaments t
     where t.id = tid
  ), false);
$$;

revoke all on function public.entry_open(bigint) from public;
grant execute on function public.entry_open(bigint) to authenticated;

-- ---------------------------------------------------------------------------
-- 權限
--
-- 賽事：登入者看得到已發布的；管理員看得到全部並可編輯。
-- 報名：棋士只看得到、也只改得了自己那一筆，且必須在報名期間內。
--       管理員看得到全部（名單就是靠這個出的）。
-- ---------------------------------------------------------------------------
alter table public.tournaments enable row level security;
alter table public.entries     enable row level security;

drop policy if exists tournaments_read on public.tournaments;
create policy tournaments_read on public.tournaments
  for select to authenticated
  using (published or public.is_admin());

drop policy if exists tournaments_write on public.tournaments;
create policy tournaments_write on public.tournaments
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists entries_read on public.entries;
create policy entries_read on public.entries
  for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

drop policy if exists entries_insert on public.entries;
create policy entries_insert on public.entries
  for insert to authenticated
  with check (user_id = auth.uid() and public.entry_open(tournament_id));

-- 棋士只能改自己的 note 與 withdrawn；admin_note 由下面的管理員政策負責。
-- 欄位層級的限制在政策裡做不到，改用觸發器擋。
drop policy if exists entries_update_own on public.entries;
create policy entries_update_own on public.entries
  for update to authenticated
  using (user_id = auth.uid() and public.entry_open(tournament_id))
  with check (user_id = auth.uid() and public.entry_open(tournament_id));

drop policy if exists entries_admin on public.entries;
create policy entries_admin on public.entries
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- 棋士不得竄改身分欄位與秘書處註記
--
-- 政策只能決定「這一列能不能改」，不能決定「哪些欄位能改」。
-- 沒有這道觸發器，棋士可以把自己那筆的 display_name 改成別人。
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
  before update on public.entries
  for each row execute function public.entries_guard();
