// 收件匣有新訊息時寄出通知信。
//
// 由 Supabase 的 Database Webhook 在 messages 新增資料列時呼叫。
// 收件匣原本只能靠人主動去後台看，送出的詢問可能擱好幾天沒人發現。
//
// 刻意不在信裡放來信者的聯絡方式與內容：
// 個資留在資料庫由後台控管，不要散落在 Gmail 的收件匣裡。
// 信件只說「有一筆新的什麼」，請承辦人到後台處理。
//
// 需要的 Secrets：
//   RESEND_API_KEY   Resend 的寄送金鑰（受限為 sending only 即可）
//   NOTIFY_TO        收件地址，例如 progotw@gmail.com
//   NOTIFY_SECRET    與 Webhook 設定的自訂標頭相同的隨意字串
//   NOTIFY_FROM      （選填）寄件地址。未設定時用 onboarding@resend.dev，
//                    那個地址只能寄給 Resend 帳號本人的信箱。
//                    協會的網域（cpga.org.tw）驗證完成後改成自己的地址。

const RESEND = 'https://api.resend.com/emails';
const ADMIN_INBOX = 'https://cpga-website.progotw.workers.dev/admin/inbox.html';

const KIND_LABEL: Record<string, string> = {
  teacher_enquiry: '學生對老師的詢問',
  member_feedback: '棋士提出的意見或申訴',
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

  let payload: { type?: string; record?: Record<string, unknown> };
  try {
    payload = await req.json();
  } catch {
    return reply(400, { error: '無法解析請求內容' });
  }
  if (payload.type !== 'INSERT' || !payload.record) {
    return reply(200, { skipped: '不是新增事件' });
  }

  const r = payload.record;
  const kind = String(r.kind ?? '');
  const label = KIND_LABEL[kind] ?? '新訊息';
  const subject = String(r.subject ?? '').slice(0, 120);
  const teacher = String(r.teacher_name ?? '');

  const lines = [
    `類別：${label}`,
    teacher ? `詢問的老師：${teacher}` : '',
    subject ? `主旨：${subject}` : '',
    '',
    '內容與聯絡方式請至後台查看：',
    ADMIN_INBOX,
  ].filter(Boolean);

  const res = await fetch(RESEND, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: `中華職業圍棋協會官網 <${from}>`,
      to: [to],
      subject: `［官網］${label}${subject ? '：' + subject : ''}`,
      text: lines.join('\n'),
      html: lines.map((l) =>
        l.startsWith('https://')
          ? `<p><a href="${esc(l)}">前往後台收件匣</a></p>`
          : `<p>${esc(l)}</p>`
      ).join(''),
    }),
  });

  if (!res.ok) {
    const detail = await res.text();
    // 回 500 讓 Webhook 的紀錄留下失敗，才查得出來為什麼沒收到信
    return reply(500, { error: '寄送失敗', status: res.status, detail: detail.slice(0, 300) });
  }
  return reply(200, { sent: true });
});
