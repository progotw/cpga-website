-- ===========================================================================
-- 手動新增的對局
--
-- 在 Supabase 的 SQL Editor 貼上執行。可重複執行。
-- 需先執行過 schema.sql（依賴 is_admin() 與 touch_row()）。
--
-- 為什麼需要：個人賽程來自海峰的抽籤公告與賽程操作台，兩邊都沒有的場次
-- 就不會出現在棋士的「我的賽程」裡。番棋的挑戰賽（例如第19屆棋王挑戰賽
-- 許皓鋐對賴均輔）對戰組合一開始就確定，不經過抽籤，操作台也未必輸入，
-- 於是當事人反而看不到自己最重要的那一盤。
--
-- 這張表就是給秘書處補這種場次用的。抓取流程（scripts/scrape_pairings.py）
-- 會把這裡的資料併進 pairings.json。
--
-- 之後官方來源補上同一盤棋時，抓取流程會自動略過這裡的那一筆
-- （同一天、同兩位棋士視為同一盤），不會重複顯示；確定官方有了之後
-- 可以在後台把手動那筆刪掉。
-- ===========================================================================

create table if not exists public.manual_pairings (
  id          bigint generated always as identity primary key,

  date        date not null,
  "time"      text not null default '',          -- HH:MM，留空表示未定
  event       text not null,                     -- 賽事名稱，例如「第19屆棋王賽」
  round       text not null default '',          -- 輪次，例如「挑戰賽第1局」
  players     text[] not null,                   -- 兩位棋士，姓名要與棋士名錄相同

  note        text not null default '',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  updated_by  uuid references auth.users,

  constraint manual_pairings_players_len check (array_length(players, 1) = 2),
  constraint manual_pairings_event_len check (length(event) between 1 and 100),
  constraint manual_pairings_round_len check (length(round) <= 100),
  constraint manual_pairings_note_len check (length(note) <= 500),
  -- 時間要嘛留空，要嘛是 HH:MM。格式不對的話抓取流程會原樣寫進公開檔案
  constraint manual_pairings_time_fmt
    check ("time" = '' or "time" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$')
);

comment on table public.manual_pairings is
  '秘書處手動補登的對局，供個人賽程使用。官方來源出現同一盤棋時會自動被略過。';

create index if not exists manual_pairings_date on public.manual_pairings (date);

drop trigger if exists manual_pairings_touch on public.manual_pairings;
create trigger manual_pairings_touch
  before update on public.manual_pairings
  for each row execute function public.touch_row();

-- ---------------------------------------------------------------------------
-- 權限：與 reschedules 相同。
-- 讀取公開——賽程本來就是公開資訊，每日抓取流程要在 GitHub Actions 裡讀它，
-- 開放匿名讀取就不必把 service_role 金鑰帶進那個環境。
-- 寫入只有管理員。
-- ---------------------------------------------------------------------------
alter table public.manual_pairings enable row level security;

drop policy if exists manual_pairings_read on public.manual_pairings;
create policy manual_pairings_read on public.manual_pairings
  for select to anon, authenticated using (true);

drop policy if exists manual_pairings_write on public.manual_pairings;
create policy manual_pairings_write on public.manual_pairings
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- 驗收：應該看到 manual_pairings 與兩條政策
select tablename, policyname from pg_policies where tablename = 'manual_pairings';
