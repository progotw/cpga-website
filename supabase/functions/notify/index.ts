// 收件匣有新訊息、或詢問被轉交給棋士時，寄出通知信；
// 另外負責寄出賽事報名的公告與截止提醒（見 processQueue）。
//
// 由 Supabase 的 Database Webhook 在 messages 新增或更新時呼叫；
// 報名通知則由每天早上的排程（pg_cron）以 {"type":"QUEUE"} 呼叫。
// 收件匣原本只能靠人主動去後台看，送出的詢問可能擱好幾天沒人發現；
// 轉交給棋士之後也一樣，棋士不登入就不會知道有人找他。
//
// 刻意不在信裡放來信者的聯絡方式與內容：
// 個資留在資料庫由權限控管，不要散落在 Gmail 的收件匣裡。
// 信件只說「有一筆新的什麼」，請當事人自己登入查看。
//
// 需要的 Secrets：
//   RESEND_API_KEY   Resend 的寄送金鑰（受限為 sending only 即可）
//   NOTIFY_TO        秘書處的收件地址，例如 progotw@gmail.com
//   NOTIFY_SECRET    與 Webhook 設定的自訂標頭相同的隨意字串
//   NOTIFY_DAILY_CAP （選填）報名通知每天最多寄幾封，預設 80。
//                    Resend 免費方案每天 100 封，且邀請信、收件匣通知
//                    共用同一個額度，所以留 20 封給它們。
//   NOTIFY_FROM      （選填）寄件地址。未設定時用 onboarding@resend.dev，
//                    那個地址只能寄給 Resend 帳號本人的信箱。
//                    cpga.org.tw 在 Resend 驗證完成後改成自己的地址。
//
// 部署時「Verify JWT」要關閉：Webhook 不會帶 JWT，這支函式改用
// NOTIFY_SECRET 驗證來源。

import { createClient } from 'jsr:@supabase/supabase-js@2';

const RESEND = 'https://api.resend.com/emails';
const ADMIN_INBOX = 'https://cpga.org.tw/admin/inbox';
const MEMBER_INBOX = 'https://cpga.org.tw/member/enquiries';
const MEMBER_ENTRIES = 'https://cpga.org.tw/member/entries';

const KIND_LABEL: Record<string, string> = {
  teacher_enquiry: '學生對老師的詢問',
  member_feedback: '棋士提出的意見或申訴',
  account_request: '棋士帳號開通申請',
};

function reply(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function esc(s: unknown) {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

async function send(key: string, from: string, to: string,
                    subject: string, lines: string[]) {
  const res = await fetch(RESEND, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: `中華職業圍棋協會官網 <${from}>`,
      to: [to],
      subject,
      text: lines.join('\n'),
      html: lines.map((l) =>
        l.startsWith('https://')
          ? `<p><a href="${esc(l)}">${esc(l)}</a></p>`
          : `<p>${esc(l)}</p>`
      ).join(''),
    }),
  });
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`Resend ${res.status} ${detail.slice(0, 200)}`);
  }
}

/* 棋士的登入信箱。
   messages 只存 teacher_player_id，要先對到 profiles 再對到帳號。
   這段需要繞過資料列權限，所以用 service_role——它由 Supabase
   自動注入，不是我們自己保管的金鑰。 */
async function playerEmail(playerId: string): Promise<string | null> {
  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );
  const { data: profile } = await admin
    .from('profiles').select('id').eq('player_id', playerId).maybeSingle();
  if (!profile) return null;
  const { data, error } = await admin.auth.admin.getUserById(profile.id);
  if (error || !data?.user?.email) return null;
  return data.user.email;
}

function adminClient() {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );
}

/* 台灣時間今天 00:00，換成 UTC 的 ISO 字串。每日額度以台灣的「一天」計算。 */
function taipeiDayStart(): string {
  const tp = new Date(Date.now() + 8 * 3600e3);
  const start = Date.UTC(tp.getUTCFullYear(), tp.getUTCMonth(), tp.getUTCDate()) - 8 * 3600e3;
  return new Date(start).toISOString();
}

function fmtDeadline(iso: string | null): string {
  if (!iso) return '';
  return new Date(iso).toLocaleString('zh-TW', {
    timeZone: 'Asia/Taipei', month: 'numeric', day: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: false,
  });
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/* ---- 報名通知佇列 ----
   佇列由資料庫寫入（賽事發布時的觸發器、截止前 3 天的排程），這裡只負責寄。
   每天最多寄 NOTIFY_DAILY_CAP 封，寄不完的留在佇列，明天的排程接著寄。
   寄之前再檢查一次：賽事下架或已截止就不寄；提醒的對象若已經報名也不寄。 */
async function processQueue(key: string, from: string) {
  const admin = adminClient();
  const cap = Number(Deno.env.get('NOTIFY_DAILY_CAP') || '80');

  const { count: sentToday } = await admin.from('notify_queue')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'sent').gte('sent_at', taipeiDayStart());
  let left = cap - (sentToday ?? 0);
  if (left <= 0) return { sent: 0, note: '今日額度已用完，明天繼續' };

  const { data: rows, error } = await admin.from('notify_queue')
    .select('id,kind,tournament_id,user_id,email')
    .eq('status', 'pending')
    .order('created_at').order('id')
    .limit(500);
  if (error) throw error;
  if (!rows?.length) return { sent: 0, note: '佇列是空的' };

  const ids = [...new Set(rows.map((r) => r.tournament_id))];
  const { data: ts } = await admin.from('tournaments')
    .select('id,title,closes_at,published').in('id', ids);
  type Tour = { id: number; title: string; closes_at: string | null; published: boolean };
  const byId = new Map<number, Tour>(
    ((ts ?? []) as Tour[]).map((t) => [t.id, t] as [number, Tour]));

  const mark = (id: number, status: string, note = '') =>
    admin.from('notify_queue')
      .update({ status, note, sent_at: new Date().toISOString() })
      .eq('id', id);

  let sent = 0, skipped = 0;
  for (const q of rows) {
    if (left <= 0) break;
    const t = byId.get(q.tournament_id);
    if (!t || !t.published || (t.closes_at && new Date(t.closes_at) <= new Date())) {
      await mark(q.id, 'skipped', '賽事已下架或已截止');
      skipped++;
      continue;
    }
    if (q.kind === 'remind') {
      const { count } = await admin.from('entries')
        .select('id', { count: 'exact', head: true })
        .eq('tournament_id', q.tournament_id).eq('user_id', q.user_id);
      if (count) {
        await mark(q.id, 'skipped', '排隊期間已經報名');
        skipped++;
        continue;
      }
    }

    const due = fmtDeadline(t.closes_at);
    const [subject, lines] = q.kind === 'announce'
      ? [`［中華職業圍棋協會］開放報名：${t.title}`, [
          '您好，',
          '',
          `「${t.title}」已開放線上報名。`,
          ...(due ? [`報名截止：${due}`] : []),
          '',
          '請登入職業棋士專區報名（職業賽事免報名費）：',
          MEMBER_ENTRIES,
        ]]
      : [`［中華職業圍棋協會］報名即將截止：${t.title}`, [
          '您好，',
          '',
          `「${t.title}」將於 ${due} 截止報名，系統顯示您尚未報名。`,
          '如果已經決定不參加，請忽略這封信。',
          '',
          '報名請登入職業棋士專區：',
          MEMBER_ENTRIES,
        ]];

    try {
      await send(key, from, q.email, subject as string, lines as string[]);
      await mark(q.id, 'sent');
      sent++;
      left--;
    } catch (e) {
      const msg = String(e).slice(0, 200);
      // 額度用完或被限流：這一封留在佇列，停下來，明天再寄
      if (/\b429\b|quota|rate.?limit/i.test(msg)) {
        return { sent, skipped, stopped: msg };
      }
      await mark(q.id, 'error', msg);
    }
    // Resend 免費方案每秒最多 2 個請求
    await sleep(600);
  }
  return { sent, skipped, left };
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return reply(405, { error: '只接受 POST' });

  // Edge Function 的網址是公開的，任何人都打得到。
  // 沒有這道檢查，外人可以持續呼叫把通知信灌爆。
  const secret = Deno.env.get('NOTIFY_SECRET');
  if (!secret || req.headers.get('x-notify-secret') !== secret) {
    return reply(401, { error: '來源未通過驗證' });
  }

  const key = Deno.env.get('RESEND_API_KEY');
  const to = Deno.env.get('NOTIFY_TO');
  if (!key || !to) return reply(500, { error: '尚未設定 RESEND_API_KEY 或 NOTIFY_TO' });
  const from = Deno.env.get('NOTIFY_FROM') || 'onboarding@resend.dev';

  let payload: {
    type?: string;
    record?: Record<string, unknown>;
    old_record?: Record<string, unknown>;
  };
  try {
    payload = await req.json();
  } catch {
    return reply(400, { error: '無法解析請求內容' });
  }

  // ---- 每日排程：寄出報名通知佇列 ----
  if (payload.type === 'QUEUE') {
    try {
      return reply(200, await processQueue(key, from));
    } catch (e) {
      return reply(500, { error: '佇列處理失敗', detail: String(e).slice(0, 300) });
    }
  }

  const r = payload.record;
  if (!r) return reply(200, { skipped: '沒有資料列' });

  const kind = String(r.kind ?? '');
  const label = KIND_LABEL[kind] ?? '新訊息';
  const subject = String(r.subject ?? '').slice(0, 120);

  try {
    // ---- 新訊息：通知秘書處 ----
    if (payload.type === 'INSERT') {
      const teacher = String(r.teacher_name ?? '');
      const lines = [
        `類別：${label}`,
        // 帳號申請借用 teacher_name 存申請人姓名，標籤要分開講，
        // 不然秘書處會以為是某位老師被詢問
        teacher ? (kind === 'account_request' ? `申請人：${teacher}`
                                              : `詢問的老師：${teacher}`) : '',
        subject ? `主旨：${subject}` : '',
        '',
        '內容與聯絡方式請至後台查看：',
        ADMIN_INBOX,
      ].filter(Boolean);

      await send(key, from, to,
        `［官網］${label}${subject ? '：' + subject : ''}`, lines);
      return reply(200, { sent: 'admin' });
    }

    // ---- 轉交給棋士：通知棋士本人 ----
    // 只在 released_at 從空變成有值的那一次寄，否則每次改備註都會再寄一遍。
    if (payload.type === 'UPDATE') {
      const before = payload.old_record ?? {};
      const justReleased = !before.released_at && !!r.released_at;
      if (!justReleased || kind !== 'teacher_enquiry') {
        return reply(200, { skipped: '不是轉交事件' });
      }

      const pid = String(r.teacher_player_id ?? '');
      if (!pid) return reply(200, { skipped: '沒有對應的棋士' });

      const email = await playerEmail(pid);
      // 棋士還沒開通帳號是常態，不是錯誤——秘書處仍可自行通知
      if (!email) return reply(200, { skipped: '該棋士尚無帳號' });

      await send(key, from, email, '［中華職業圍棋協會］有一封學生詢問轉交給您', [
        '您好，',
        '',
        '有民眾透過官網的「找職業老師」向您提出詢問，秘書處已確認並轉交。',
        '完整內容與對方的聯絡方式請登入職業棋士專區查看：',
        MEMBER_INBOX,
        '',
        '這封信不會附上對方的個人資料，請登入後再取得。',
      ]);
      return reply(200, { sent: 'player' });
    }

    return reply(200, { skipped: `未處理的事件 ${payload.type}` });
  } catch (e) {
    // 回 500 讓 Webhook 的紀錄留下失敗，才查得出來為什麼沒收到信
    return reply(500, { error: '寄送失敗', detail: String(e).slice(0, 300) });
  }
});
