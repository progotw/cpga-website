-- ===========================================================================
-- 棋士生日（僅管理員可讀）
--
-- 用途：報名名單同段位時依年紀排序。
--
-- 生日是個資，不能放進 site/assets/data（那個資料夾公開在官網上，
-- 也會進這個公開的 repo）。所以放在資料庫，只有管理員讀得到。
--
-- 資料本身不在這個檔案裡：由 scripts/import_birthdays.py 從協會的
-- Excel 轉出 private/birthdays.sql（已排除於版控），那份會連同本檔的
-- 建表語句一起執行。這個檔案只是留存結構，方便日後查閱。
-- ===========================================================================

create table if not exists public.player_birthdays (
  player_id   text primary key,            -- 對應 players.json 的 id
  birth_year  int  not null,
  birth_date  date,                        -- 只知道年份時留空
  updated_at  timestamptz not null default now()
);

comment on table public.player_birthdays is
  '棋士生日，報名名單排序用。只有管理員讀得到；birth_date 為空表示只知道年份。';

alter table public.player_birthdays enable row level security;

-- 只開放管理員讀取。寫入只透過 SQL Editor（以資料庫擁有者身分，不受此限）。
drop policy if exists player_birthdays_admin_read on public.player_birthdays;
create policy player_birthdays_admin_read on public.player_birthdays
  for select to authenticated using (public.is_admin());
