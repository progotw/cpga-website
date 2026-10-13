-- ===========================================================================
-- 移除匿名寫入權限
--
-- 在 Supabase 的 SQL Editor 貼上執行。可重複執行。
--
-- ⚠ 執行順序：這份一定要「最後」跑。
--    先部署 enquiry 這支 Edge Function 並確認表單送得出去，再執行本檔。
--    順序顛倒的話，老師詢問表單會在中間這段時間完全送不出去。
--
-- 原本的政策允許任何人以 publishable 金鑰直接新增 teacher_enquiry。
-- 那把金鑰就印在網頁原始碼裡，2026-10-13 實測連送五筆全部回 201，
-- 沒有任何頻率限制——等於收件匣對全世界開放寫入。
--
-- 改由 enquiry 函式先驗 Turnstile 再以 service_role 寫入，
-- 所以這裡把 anon 的寫入權限整個拿掉。這不是限制次數，是移除入口。
-- ===========================================================================

drop policy if exists messages_insert_anon on public.messages;

-- 登入的棋士仍可直接送出意見與申訴：
-- 他們有帳號、有身分，濫發可以追查到人，不需要再加一道驗證。
-- （這條政策原本就存在，這裡重新建立以確保內容正確。）
drop policy if exists messages_insert_member on public.messages;
create policy messages_insert_member on public.messages
  for insert to authenticated
  with check (kind = 'member_feedback' and created_by = auth.uid());

comment on table public.messages is
  '學生詢問與棋士意見。teacher_enquiry 僅能由 enquiry Edge Function 寫入'
  '（先驗 Cloudflare Turnstile）；member_feedback 由登入的棋士自行送出。'
  '兩者都只有管理員讀得到。';

-- ---------------------------------------------------------------------------
-- 清掉測試資料
-- ---------------------------------------------------------------------------
delete from public.messages where subject = 'ratelimit-probe';
