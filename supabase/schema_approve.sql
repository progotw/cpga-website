-- ===========================================================================
-- 後台「開通」按鈕的輔助函式
--
-- 在 Supabase 的 SQL Editor 貼上執行。可重複執行。
--
-- approve 這支 Edge Function 在「信箱已有帳號」時會改寄重設密碼信，
-- 但那個 API 不回傳使用者 id，所以需要從信箱反查。
--
-- auth.users 不開放一般查詢，這裡用 security definer 開一個最小的出入口：
-- 只回傳 id，不回傳信箱以外的任何資料，而且只有 service_role 能執行。
-- ===========================================================================

create or replace function public.user_id_by_email(p_email text)
returns uuid
language sql
security definer
set search_path = public
stable
as $$
  select id from auth.users where lower(email) = lower(p_email) limit 1;
$$;

-- 這支函式繞過一般權限，所以把執行權限收到只剩 service_role。
-- 前端用的 anon／authenticated 都不該碰得到它。
revoke all on function public.user_id_by_email(text) from public;
revoke all on function public.user_id_by_email(text) from anon;
revoke all on function public.user_id_by_email(text) from authenticated;
grant execute on function public.user_id_by_email(text) to service_role;

comment on function public.user_id_by_email(text) is
  '以信箱反查 auth.users 的 id，供後台開通帳號時使用。僅 service_role 可執行。';
