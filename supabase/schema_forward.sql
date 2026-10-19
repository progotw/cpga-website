-- ===========================================================================
-- 把學生詢問轉交給棋士
--
-- 在 Supabase 的 SQL Editor 貼上執行。可重複執行。
-- 需先執行過 schema.sql 與 schema_inbox.sql。
--
-- 原本的設計是「只有管理員讀得到，由秘書處轉交」，但「轉交」只存在於
-- 口頭約定，系統裡沒有這個動作——秘書處看到詢問之後，只能自己打電話或
-- 另外寄信給老師。這份把轉交做成一個明確的操作。
--
-- 仍然是人工轉交，不是自動放行：
--   來信可能是廣告或騷擾，先經秘書處看過再決定要不要給老師，
--   這是原本設計的用意，保留。
-- ===========================================================================

alter table public.messages
  add column if not exists released_at timestamptz,
  add column if not exists released_by uuid references auth.users;

comment on column public.messages.released_at is
  '秘書處轉交給棋士的時間。null 表示尚未轉交，棋士讀不到。';

-- 棋士的收件匣要照時間排，而且只看自己的
create index if not exists messages_released
  on public.messages (teacher_player_id, released_at desc)
  where released_at is not null;


-- ---------------------------------------------------------------------------
-- 取得目前登入者對應的棋士 id
--
-- 必須用 security definer：直接在 messages 的政策裡查 profiles，
-- 會再觸發 profiles 自己的政策，同 is_admin() 的理由。
-- ---------------------------------------------------------------------------
create or replace function public.my_player_id()
returns text
language sql
stable
security definer set search_path = public
as $$
  select nullif(player_id, '') from public.profiles where id = auth.uid();
$$;

comment on function public.my_player_id() is
  '目前登入者的棋士 id；管理員或未對應名錄者回傳 null。';


-- ---------------------------------------------------------------------------
-- 棋士可以讀「已轉交給自己的學生詢問」
--
-- 三個條件缺一不可：
--   kind 必須是 teacher_enquiry  —— 棋士意見（member_feedback）是棋士對協會
--                                   的申訴，絕對不能因為這條政策被別人讀到
--   released_at 不是 null        —— 沒轉交就讀不到
--   teacher_player_id 等於本人    —— 只能讀指名給自己的
--
-- my_player_id() 回傳 null 時，等號比較結果是 null，不會通過，所以
-- 管理員或未對應名錄的帳號不會因為這條政策多拿到任何東西。
-- ---------------------------------------------------------------------------
drop policy if exists messages_read_forwarded on public.messages;
create policy messages_read_forwarded on public.messages
  for select to authenticated
  using (
    kind = 'teacher_enquiry'
    and released_at is not null
    and teacher_player_id is not null
    and teacher_player_id = public.my_player_id()
  );


-- ---------------------------------------------------------------------------
-- 驗收
-- ---------------------------------------------------------------------------
-- 1. 欄位在不在
select column_name, data_type
from information_schema.columns
where table_schema = 'public' and table_name = 'messages'
  and column_name in ('released_at', 'released_by')
order by column_name;

-- 2. 政策在不在（應該看到 messages_read_forwarded 與原本那幾條）
select policyname, cmd
from pg_policies
where schemaname = 'public' and tablename = 'messages'
order by policyname;
