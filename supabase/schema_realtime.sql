-- ===========================================================================
-- 新訊息即時提醒
--
-- 在 Supabase 的 SQL Editor 貼上執行。可重複執行。
--
-- 有人送出學生詢問、意見申訴或帳號申請時，正在看後台的管理員要馬上看到，
-- 不必重新整理頁面。做法是讓 Supabase 把 messages 的新增事件推給前端
-- （Realtime），所以這張表要加進 Realtime 的發布清單。
--
-- 只推「有新的一筆」這件事，內容仍然受資料列權限（RLS）限制——
-- 不是管理員的人就算連上也收不到任何東西。
-- ===========================================================================

-- 已經在清單裡時 add 會報錯，所以先確認再加
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'messages'
  ) then
    alter publication supabase_realtime add table public.messages;
  end if;
end $$;

-- 刪除與更新事件要帶得出舊資料列，權限才判斷得準。
-- 目前只用到新增，這行是為了日後擴充（例如別人處理掉了就自動從畫面移除）。
alter table public.messages replica identity full;

-- 驗收：應該看到 messages
select tablename from pg_publication_tables
where pubname = 'supabase_realtime' and schemaname = 'public';
