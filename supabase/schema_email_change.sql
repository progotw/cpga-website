-- ===========================================================================
-- 棋士改信箱之後，還沒寄出的報名通知改寄新信箱
--
-- 在 Supabase 的 SQL Editor 貼上執行。可重複執行。
-- 需先執行過 schema_notify_queue.sql。
--
-- 報名通知排進佇列時就記下了收件信箱。棋士如果在排隊期間改了信箱
-- （自己改、或秘書處代改），沒有這段的話通知還是會寄到舊信箱——
-- 而會改信箱，往往就是因為舊的已經不用了。
--
-- 其他通知（學生詢問轉交）是寄出當下才查信箱，本來就會寄到新的。
-- ===========================================================================

create or replace function public.sync_queue_email()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if new.email is distinct from old.email and new.email is not null then
    update public.notify_queue
       set email = new.email
     where user_id = new.id and status = 'pending';
  end if;
  return new;
end;
$$;

drop trigger if exists on_auth_email_change on auth.users;
create trigger on_auth_email_change
  after update of email on auth.users
  for each row execute function public.sync_queue_email();

-- 驗收：應該看到 on_auth_email_change
select tgname from pg_trigger where tgname = 'on_auth_email_change';
