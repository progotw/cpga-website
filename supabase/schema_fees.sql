-- ===========================================================================
-- 我的對局費
--
-- 在 Supabase 的 SQL Editor 貼上執行。可重複執行。
-- 需先執行過 schema.sql。
--
-- 對局費與成績、賽程不同：那兩者是公開資料，這個不是。
--   · 來源是海峰的「秘密網址」，只能在伺服器端讀，網址存在 GitHub Secrets
--   · 寫入只由 CI 用 service role 進行，前端完全沒有寫入權
--   · 棋士只讀得到自己那一列，靠資料列權限保證，不是靠前端過濾
--
-- 金額以院方「發布」的版本為準，不是即時同步；published_at 要顯示給
-- 棋士看，讓他知道自己看的是哪一天的版本。
-- ===========================================================================

create table if not exists public.player_fees (
  player_id    text not null,            -- 對應 profiles.player_id / players.json 的 id
  year         int  not null,
  total        int  not null default 0,  -- 該年度總額（新台幣，已含調整）
  events       jsonb not null default '[]'::jsonb,   -- 各賽事明細，格式見海峰說明第 4 節
  published_at timestamptz not null,     -- 院方按下發布的時間
  synced_at    timestamptz not null default now(),   -- 官網這邊抓取的時間
  primary key (player_id, year)
);

comment on table public.player_fees is
  '棋士對局費。來源是海峰的發布版，由 CI 以 service role 寫入；棋士只讀得到自己的。';

create index if not exists player_fees_year on public.player_fees (year desc);


-- ---------------------------------------------------------------------------
-- 取得目前登入者對應的棋士 id
--
-- 必須用 security definer：直接在政策裡查 profiles 會再觸發 profiles
-- 自己的政策，同 is_admin() 的理由。
-- （schema_forward.sql 也有這一段，重複執行沒有副作用。）
-- ---------------------------------------------------------------------------
create or replace function public.my_player_id()
returns text
language sql
stable
security definer set search_path = public
as $$
  select nullif(player_id, '') from public.profiles where id = auth.uid();
$$;


-- ---------------------------------------------------------------------------
-- 權限
--
-- 讀：棋士只能讀自己的；管理員可以讀全部（要能協助查詢與對帳）。
--     my_player_id() 回傳 null 時等號比較結果是 null，不會通過，
--     所以未對應名錄的帳號讀不到任何一列。
-- 寫：完全不開放。CI 用 service role 會繞過這裡，前端沒有任何路徑可寫。
-- ---------------------------------------------------------------------------
alter table public.player_fees enable row level security;

drop policy if exists player_fees_read_own on public.player_fees;
create policy player_fees_read_own on public.player_fees
  for select to authenticated
  using (player_id = public.my_player_id() or public.is_admin());


-- ---------------------------------------------------------------------------
-- 驗收
-- ---------------------------------------------------------------------------
-- 1. 表在不在
select column_name, data_type
from information_schema.columns
where table_schema = 'public' and table_name = 'player_fees'
order by ordinal_position;

-- 2. 政策：應該只有一條 select，沒有任何 insert/update/delete
select policyname, cmd from pg_policies
where schemaname = 'public' and tablename = 'player_fees'
order by policyname;
