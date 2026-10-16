-- ===========================================================================
-- 棋士帳號開通申請
--
-- 在 Supabase 的 SQL Editor 貼上執行。可重複執行。
-- 需先執行過 schema_inbox.sql。
--
-- 協會沒有完整的棋士電子信箱，逐一去要很慢。改由棋士自己填：
-- 公開頁面 /member/apply.html 讓他從名錄裡「選」自己的名字（不是自己打），
-- 所以送進來的資料一定帶著正確的棋士 id，秘書處開通時不必再比對姓名。
--
-- 申請同樣走 enquiry 這支 Edge Function，先驗 Cloudflare Turnstile，
-- 所以 anon 不需要、也不應該有直接寫入的權限。
-- ===========================================================================

alter table public.messages drop constraint if exists messages_kind_check;
alter table public.messages
  add constraint messages_kind_check
  check (kind in ('teacher_enquiry', 'member_feedback', 'account_request'));

comment on column public.messages.kind is
  'teacher_enquiry＝訪客對老師的詢問；member_feedback＝棋士的意見或申訴；'
  'account_request＝棋士申請開通帳號。三者都只有管理員讀得到。';

-- 收件匣依「未處理、新到優先」排序，申請不會被舊訊息蓋過
create index if not exists messages_kind_inbox
  on public.messages (kind, handled, created_at desc);
