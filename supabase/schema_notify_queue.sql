-- ===========================================================================
-- 賽事報名通知：排隊寄送
--
-- 在 Supabase 的 SQL Editor 貼上執行。可重複執行。
-- 需先執行過 schema.sql、schema_entries.sql，並已安裝 Database Webhooks（pg_net）。
--
-- 兩種通知：
--   announce  賽事開放報名時，通知所有有帳號的棋士
--   remind    截止前 3 天起，提醒還沒報名的棋士
--
-- 為什麼要排隊、不直接寄：
--   Resend 免費方案每天 100 封，而且 Supabase 的邀請信、重設密碼信、
--   收件匣通知都共用同一個帳號。139 位棋士一次寄完會超過上限，
--   超過的信會直接被退，連帶棋士收不到邀請信。
--   所以先排進佇列，每天早上由排程寄出最多 NOTIFY_DAILY_CAP 封（預設 80，
--   留 20 封給其他信），寄不完的隔天接著寄。
--   提醒從截止前 3 天開始排，最多兩天寄完（80＋59），截止前 2 天前收到。
-- ===========================================================================

create table if not exists public.notify_queue (
  id            bigint generated always as identity primary key,
  kind          text not null check (kind in ('announce', 'remind')),
  tournament_id bigint not null references public.tournaments on delete cascade,
  user_id       uuid not null references auth.users on delete cascade,
  email         text not null,
  status        text not null default 'pending'
                check (status in ('pending', 'sent', 'skipped', 'error')),
  note          text not null default '',      -- 略過或失敗的原因
  created_at    timestamptz not null default now(),
  sent_at       timestamptz,
  -- 同一場賽事、同一種通知，一個人只會排一次。
  -- 重新發布、排程重跑都不會重複寄。
  constraint notify_queue_once unique (kind, tournament_id, user_id)
);

comment on table public.notify_queue is
  '賽事報名通知的寄送佇列。由觸發器與排程寫入、notify 函式寄出；前端無權讀寫。';

create index if not exists notify_queue_pending
  on public.notify_queue (created_at, id) where status = 'pending';

-- 只有 service_role（notify 函式）與資料庫本身會碰這張表，不開放任何前端存取
alter table public.notify_queue enable row level security;


-- ---------------------------------------------------------------------------
-- 有帳號的棋士。管理員帳號不算——周平強、曾品傑這類一人兩個帳號的，
-- 只寄到棋士帳號那邊。
-- ---------------------------------------------------------------------------
create or replace function public.player_recipients()
returns table (user_id uuid, email text)
language sql stable security definer set search_path = public
as $$
  select u.id, u.email
  from public.profiles p
  join auth.users u on u.id = p.id
  where p.role = 'player'
    and coalesce(p.player_id, '') <> ''
    and u.email is not null;
$$;


-- ---------------------------------------------------------------------------
-- 賽事一開放報名，就把全體棋士排進公告佇列
-- ---------------------------------------------------------------------------
create or replace function public.enqueue_announce()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if new.published and (tg_op = 'INSERT' or not coalesce(old.published, false)) then
    insert into public.notify_queue (kind, tournament_id, user_id, email)
    select 'announce', new.id, r.user_id, r.email
    from public.player_recipients() r
    on conflict on constraint notify_queue_once do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists tournaments_announce on public.tournaments;
create trigger tournaments_announce
  after insert or update of published on public.tournaments
  for each row execute function public.enqueue_announce();


-- ---------------------------------------------------------------------------
-- 截止前 3 天：把還沒報名的棋士排進提醒佇列。每天排程會呼叫一次。
--
-- 取消過報名的也不提醒——那是本人決定不參加。
-- 公告還沒寄、或寄出不到一天的也先不提醒，免得同一天收到兩封；
-- 隔天排程再跑時會補上。
-- ---------------------------------------------------------------------------
create or replace function public.enqueue_reminders()
returns int
language plpgsql security definer set search_path = public
as $$
declare n int;
begin
  insert into public.notify_queue (kind, tournament_id, user_id, email)
  select 'remind', t.id, r.user_id, r.email
  from public.tournaments t
  cross join public.player_recipients() r
  where t.published
    and t.closes_at is not null
    and t.closes_at > now()
    and t.closes_at <= now() + interval '3 days'
    and (t.opens_at is null or t.opens_at <= now())
    and not exists (
      select 1 from public.entries e
      where e.tournament_id = t.id and e.user_id = r.user_id)
    and not exists (
      select 1 from public.notify_queue q
      where q.kind = 'announce' and q.tournament_id = t.id and q.user_id = r.user_id
        and (q.status = 'pending' or q.sent_at > now() - interval '1 day'))
  on conflict on constraint notify_queue_once do nothing;
  get diagnostics n = row_count;
  return n;
end;
$$;


-- ---------------------------------------------------------------------------
-- 每天台灣時間 10:00（UTC 02:00）：先排提醒，再請 notify 函式寄出佇列
--
-- ⚠ 下面 '你的亂碼' 要換成 NOTIFY_SECRET 那一串（引號留著）。
--    跑完請清空 SQL Editor，不要讓那串留在查詢紀錄裡。
-- ---------------------------------------------------------------------------
create extension if not exists pg_cron;

select cron.unschedule('cpga-notify-queue')
where exists (select 1 from cron.job where jobname = 'cpga-notify-queue');

select cron.schedule('cpga-notify-queue', '0 2 * * *', $job$
  select public.enqueue_reminders();
  select net.http_post(
    url     := 'https://tagnpbazcpdjeobjigwx.supabase.co/functions/v1/notify',
    headers := jsonb_build_object('Content-Type', 'application/json',
                                  'x-notify-secret', '你的亂碼'),
    body    := '{"type":"QUEUE"}'::jsonb,
    -- 一次最多寄 80 封、每封間隔 0.6 秒，約需一分多鐘；預設 5 秒會中途斷線
    timeout_milliseconds := 150000
  );
$job$);


-- ---------------------------------------------------------------------------
-- 驗收
-- ---------------------------------------------------------------------------
select jobname, schedule from cron.job where jobname = 'cpga-notify-queue';
select count(*) as 目前有帳號的棋士 from public.player_recipients();
