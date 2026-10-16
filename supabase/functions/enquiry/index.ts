// 公開表單的收件端：老師詢問，以及棋士帳號開通申請。
//
// 原本表單是由瀏覽器直接寫入 messages 資料表：publishable 金鑰就印在網頁
// 原始碼裡，任何人都能寫迴圈往收件匣灌資料。2026-10-13 實測連送五筆全部成功，
// 完全沒有頻率限制。
//
// 改為：瀏覽器拿 Turnstile 通過的憑證過來，這裡先向 Cloudflare 驗證，
// 通過才用 service_role 寫入。同時把 anon 的寫入權限整個移除——
// 不是限制匿名寫入的次數，是讓匿名根本不能直接寫。
//
// 需要的 Secrets：
//   TURNSTILE_SECRET   Cloudflare Turnstile 的 Secret Key
//   （SUPABASE_URL 與 SUPABASE_SERVICE_ROLE_KEY 由 Supabase 自動提供）
//
// 部署時 Verify JWT 要關掉：訪客不會登入，驗證靠 Turnstile。

import { createClient } from 'jsr:@supabase/supabase-js@2';

const VERIFY = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function reply(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

/** 取字串並限長。伺服器端一定要自己驗一次，不能相信瀏覽器送來的長度。 */
function str(v: unknown, max: number) {
  return String(v ?? '').trim().slice(0, max);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return reply(405, { error: '只接受 POST' });

  const secret = Deno.env.get('TURNSTILE_SECRET');
  if (!secret) return reply(500, { error: '尚未設定 TURNSTILE_SECRET' });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return reply(400, { error: '無法解析請求內容' });
  }

  // ---- 1. 先驗 Turnstile ----
  const token = str(body.token, 2048);
  if (!token) return reply(400, { error: '缺少驗證憑證，請重新整理頁面再試一次。' });

  const form = new FormData();
  form.append('secret', secret);
  form.append('response', token);
  const ip = req.headers.get('CF-Connecting-IP');
  if (ip) form.append('remoteip', ip);

  let ok = false;
  let codes: unknown = null;
  try {
    const r = await fetch(VERIFY, { method: 'POST', body: form });
    const j = await r.json();
    ok = j.success === true;
    codes = j['error-codes'];
  } catch (e) {
    return reply(502, { error: '驗證服務暫時無法連線，請稍後再試。', detail: String(e) });
  }
  if (!ok) {
    // 憑證只能用一次，重送同一份會被判為已使用——訊息要讓使用者知道該重整
    return reply(403, { error: '驗證未通過，請重新整理頁面再送出一次。', codes });
  }

  // ---- 2. 驗證內容 ----
  // 同一個入口處理兩種表單。kind 由前端指定，但這裡只認白名單裡的值，
  // 而且 member_feedback 不在其中——那種訊息必須由登入的棋士自己送出，
  // 不能從這條匿名管道偽造。
  const kind = str(body.kind, 32) || 'teacher_enquiry';
  if (kind !== 'teacher_enquiry' && kind !== 'account_request') {
    return reply(400, { error: '不支援的表單類型。' });
  }

  const from_name = str(body.from_name, 100);
  const from_contact = str(body.from_contact, 200);
  const meta = (body.meta ?? {}) as Record<string, unknown>;

  let row: Record<string, unknown>;

  if (kind === 'account_request') {
    const player_id = str(meta['棋士id'], 64);
    if (!from_name || !from_contact || !player_id) {
      return reply(400, { error: '請選擇您的姓名並填寫電子信箱。' });
    }
    row = {
      kind,
      teacher_player_id: player_id,
      teacher_name: from_name,
      from_name,
      from_contact,
      subject: `帳號開通申請：${from_name}`,
      body: str(body.body, 1000),
      meta: {
        棋士id: player_id,
        段位: str(meta['段位'], 20),
        聯絡電話: str(meta['聯絡電話'], 50),
      },
    };
  } else {
    const text = str(body.body, 4000);
    if (!from_name || !from_contact || !text) {
      return reply(400, { error: '請填寫稱呼、聯絡方式與詢問內容。' });
    }
    const teacher_name = str(body.teacher_name, 100);
    row = {
      kind,
      teacher_player_id: str(body.teacher_player_id, 64),
      teacher_name,
      from_name,
      from_contact,
      subject: teacher_name ? `向 ${teacher_name} 老師提出詢問` : '老師詢問',
      body: text,
      meta: {
        目前程度: str(meta['目前程度'], 100),
        希望上課方式: str(meta['希望上課方式'], 100),
      },
    };
  }

  // ---- 3. 寫入 ----
  // anon 已無寫入權限，這裡用 service_role。金鑰只存在於 Edge Function 的環境，
  // 不會出現在任何前端檔案裡。
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );
  const { error } = await supabase.from('messages').insert(row);
  if (error) return reply(500, { error: '寫入失敗，請改用頁面上的聯絡管道。', detail: error.message });

  return reply(200, { ok: true });
});
