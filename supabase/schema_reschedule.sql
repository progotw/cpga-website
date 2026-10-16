-- ===========================================================================
-- 對局改期
--
-- 在 Supabase 的 SQL Editor 貼上執行。可重複執行。
-- 需先執行過 schema.sql（依賴 is_admin() 與 touch_row()）。
--
-- 賽程操作台輸出的是「原訂日期」（賽程底圖上印的），它不提供改期。
-- 實務上改期常常只改某一盤——某位棋士出國比賽，那一盤提前或延後——
-- 而通知棋士的是協會，所以改期由協會在這裡處理。
--
-- 以操作台給的 id 指定是哪一盤：同一盤棋從對手未定、填上名字、到標出勝負，
-- id 都不會變，是唯一可靠的指定方式。姓名與日期都會變，不能當鍵。
-- ===========================================================================

create table if not exists public.reschedules (
  pairing_id  text primary key,

  -- 改期後的日期與時間。time 留空表示沿用原本的（或本來就沒有）
  new_date    date not null,
  new_time    text not null default '',

  -- 原訂日期與對戰者，抓取時用來把公告裡的舊日期那筆剔除，
  -- 否則同一盤棋會在新舊兩個日期各出現一次
  orig_date   date,
  players     text[] not null default '{}',

  note        text not null default '',
  updated_at  timestamptz not null default now(),
  updated_by  uuid references auth.users,

  constraint reschedules_note_len check (length(note) <= 500)
);

comment on table public.reschedules is
  '個別對局的改期紀錄，以賽程操作台的對局 id 為鍵。'
  '抓取流程會先套用這裡的日期，再與抽籤公告交叉比對。';

create index if not exists reschedules_date on public.reschedules (new_date);

drop trigger if exists reschedules_touch on public.reschedules;
create trigger reschedules_touch
  before update on public.reschedules
  for each row execute function public.touch_row();

-- ---------------------------------------------------------------------------
-- 權限
--
-- 讀取：公開。賽程本來就是公開資訊，而且每日抓取流程要在 GitHub Actions 裡讀它；
--       開放匿名讀取就不必把 service_role 金鑰帶進那個環境。
-- 寫入：只有管理員。
-- ---------------------------------------------------------------------------
alter table public.reschedules enable row level security;

drop policy if exists reschedules_read on public.reschedules;
create policy reschedules_read on public.reschedules
  for select to anon, authenticated using (true);

drop policy if exists reschedules_write on public.reschedules;
create policy reschedules_write on public.reschedules
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
