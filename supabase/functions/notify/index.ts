// 收件匣有新訊息、或詢問被轉交給棋士時，寄出通知信。
//
// 由 Supabase 的 Database Webhook 在 messages 新增或更新時呼叫。
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
        '完整內容與對方的聯絡方式請登入棋士專區查看：',
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
