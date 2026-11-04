-- ===========================================================================
-- 對局費：獎金排名
--
-- 在 Supabase 的 SQL Editor 貼上執行。可重複執行。
-- 需先執行過 schema_fees.sql。
--
-- 海峰「對局費」系統的排行榜有四張表，四張都只是同一份明細的不同加總：
--   實際全額總計 = 全部
--   採計獎金     = group 為「採計」的
--   女棋總計     = 採計 ＋ 女子（只排有女子賽獎金的棋士）
--   限制賽總計   = group 為「限制」的
-- 資料本來就帶著 group，所以官網自己算得出來，不必再跟對方要一份排名。
--
-- 秘書處決定：**棋士只看得到自己的名次，看不到別人的姓名與金額。**
-- 所以這裡不開新的表，只在棋士自己那一列上多放一個 ranks 欄位——
-- 名次是算好才寫進來的，棋士讀自己那一列就看得到，
-- 既有的資料列權限（只讀得到自己）原封不動，不會因為多了排名而漏出別人的錢。
--
-- ranks 的內容（沒有的分類整個不放，前端就不顯示那一格）：
--   {"total":     {"amount":738000,"rank":6,"n":89},
--    "counted":   {"amount":450000,"rank":10,"n":89},
--    "women":     {"amount":570000,"rank":1,"n":15},
--    "restricted":{"amount":288000,"rank":1,"n":31}}
-- 名次與報名名單同一套規則（比照 Excel 的 RANK）：同額同名次，
-- 兩人並列第 3 時下一位是第 5。
-- ===========================================================================

alter table public.player_fees
  add column if not exists ranks jsonb not null default '{}'::jsonb;

comment on column public.player_fees.ranks is
  '四種獎金總計與名次，由 scripts/fetch_fees.py 算好寫入。'
  '只有本人（與管理員）讀得到，不含其他棋士的姓名或金額。';


-- ---------------------------------------------------------------------------
-- 驗收
-- ---------------------------------------------------------------------------
-- 1. 欄位在不在
select column_name, data_type
from information_schema.columns
where table_schema = 'public' and table_name = 'player_fees' and column_name = 'ranks';

-- 2. 有幾列算過名次（剛執行完會是 0；跑過 CI 的「更新對局費」之後才會有）
select year, count(*) filter (where ranks <> '{}'::jsonb) as 已有名次, count(*) as 總列數
from public.player_fees group by year order by year desc;
