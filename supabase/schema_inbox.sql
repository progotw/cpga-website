-- ===========================================================================
-- 收件匣：學生詢問與棋士意見
--
-- 在 Supabase 的 SQL Editor 貼上執行。可重複執行。
-- 需先執行過 schema.sql。
--
-- 兩種來源放同一張表，後台用同一個介面處理：
--   teacher_enquiry  訪客在老師頁填的詢問（未登入，由協會轉交老師）
--   member_feedback  棋士在專區提出的意見或申訴（已登入）
--
-- 原本的老師詢問表單用 Netlify Forms，搬到 Cloudflare 後 POST 直接回 405，
-- 送出的內容完全消失。改為寫入本表。
-- ===========================================================================

create table if not exists public.messages (
  id         bigint generated always as identity primary key,
  kind       text not null check (kind in ('teacher_enquiry', 'member_feedback')),

  -- 詢問的對象（老師）；意見類留空
  teacher_player_id text,
  teacher_name      text,

  -- 來信者。訪客自行填寫；棋士意見則由程式填入其顯示名稱
  from_name    text not null default '',
  from_contact text not null default '',

  subject    text not null default '',
  body       text not null default '',

  -- 其他欄位（程度、希望上課方式等），避免為了幾個選填欄位一直改表結構
  meta       jsonb not null default '{}'::jsonb,

  created_by uuid references auth.users,        -- 棋士意見才有
  handled    boolean not null default false,
  handled_note text not null default '',

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- 長度上限：匿名寫入無法完全防濫發，至少限制單筆大小
  constraint messages_len check (
    length(from_name) <= 100 and length(from_contact) <= 200 and
    length(subject) <= 200 and length(body) <= 4000
  )
);

comment on table public.messages is
  '學生詢問與棋士意見。teacher_enquiry 允許匿名寫入（訪客不會登入），'
  '但只有管理員讀得到。';

create index if not exists messages_inbox
  on public.messages (handled, created_at desc);

drop trigger if exists messages_touch on public.messages;
create trigger messages_touch
  before update on public.messages
  for each row execute function public.touch_row();

-- ---------------------------------------------------------------------------
-- 權限
--
-- 讀取：只有管理員。來信內容含聯絡方式，棋士本人也不直接讀——
--       由秘書處轉交，與原本的做法一致。
-- 寫入：訪客只能新增 teacher_enquiry；棋士只能新增 member_feedback
--       且必須是自己的身分。兩者都不能讀回、不能修改。
-- ---------------------------------------------------------------------------
alter table public.messages enable row level security;

drop policy if exists messages_insert_anon on public.messages;
create policy messages_insert_anon on public.messages
  for insert to anon
  with check (kind = 'teacher_enquiry' and created_by is null);

drop policy if exists messages_insert_member on public.messages;
create policy messages_insert_member on public.messages
  for insert to authenticated
  with check (
    (kind = 'teacher_enquiry' and created_by is null)
    or (kind = 'member_feedback' and created_by = auth.uid())
  );

drop policy if exists messages_admin_read on public.messages;
create policy messages_admin_read on public.messages
  for select to authenticated using (public.is_admin());

drop policy if exists messages_admin_write on public.messages;
create policy messages_admin_write on public.messages
  for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists messages_admin_delete on public.messages;
create policy messages_admin_delete on public.messages
  for delete to authenticated using (public.is_admin());
