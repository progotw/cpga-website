// 後台「開通」按鈕：依收件匣裡的帳號申請建立棋士帳號。
//
// 流程：
//   1. 用呼叫者的 JWT 確認他是管理員
//   2. 讀出那筆申請（信箱、姓名、棋士 id）
//   3. 寄出邀請信——帳號在這一步建立，棋士點連結後自己設定密碼
//   4. 把 profiles 設成 player 並寫入姓名與棋士 id
//   5. 把那筆申請標記為已處理
//
// 刻意不產生密碼也不寄密碼：明文密碼會永遠留在兩個人的信箱裡，
// 不加密、搜尋得到、轉寄得出去。邀請連結讓全程沒有人經手過密碼。
//
// 部署時 Verify JWT 要「開著」：這支函式只給管理員用。
//
// 需要的 Secrets：
//   （SUPABASE_URL、SUPABASE_ANON_KEY、SUPABASE_SERVICE_ROLE_KEY 由 Supabase 自動提供）
//
// 前提：Supabase 的 Authentication → SMTP 必須設好（例如 Resend）。
// 內建寄件者每小時只能寄幾封，是給開發測試用的，139 位棋士一定會撞到上限。

import { createClient } from 'jsr:@supabase/supabase-js@2';

const SITE = 'https://cpga.org.tw';

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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return reply(405, { error: '只接受 POST' });

  const auth = req.headers.get('Authorization') ?? '';
  if (!auth) return reply(401, { error: '未提供身分憑證' });

  // ---- 1. 確認呼叫者是管理員 ----
  // 用呼叫者自己的 JWT 查詢，受資料列權限限制；這一段拿不到 service_role。
  const asCaller = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: auth } } },
  );
  const { data: me } = await asCaller.auth.getUser();
  if (!me?.user) return reply(401, { error: '身分憑證無效' });

  const { data: profile } = await asCaller
    .from('profiles').select('role').eq('id', me.user.id).single();
  if (!profile || profile.role !== 'admin') {
    return reply(403, { error: '只有管理員可以開通帳號' });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return reply(400, { error: '無法解析請求內容' });
  }
  const messageId = Number(body.message_id);
  if (!messageId) return reply(400, { error: '缺少 message_id' });

  // ---- 2. 讀出申請內容 ----
  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );
  const { data: msg, error: readErr } = await admin
    .from('messages')
    .select('id, kind, from_name, from_contact, meta, handled')
    .eq('id', messageId).single();

  if (readErr || !msg) return reply(404, { error: '找不到這筆申請' });
  if (msg.kind !== 'account_request') {
    return reply(400, { error: '這筆不是帳號申請' });
  }

  const email = String(msg.from_contact ?? '').trim().toLowerCase();
  const name = String(msg.from_name ?? '').trim();
  const playerId = String((msg.meta as Record<string, unknown>)?.['棋士id'] ?? '').trim();
  if (!email || !name || !playerId) {
    return reply(400, { error: '申請資料不完整，無法開通' });
  }

  // ---- 3. 寄出邀請（帳號在這一步建立）----
  const { data: invited, error: inviteErr } = await admin.auth.admin.inviteUserByEmail(
    email,
    { redirectTo: `${SITE}/member/password.html` },
  );

  let userId = invited?.user?.id ?? '';

  if (inviteErr) {
    // 已經存在的帳號不算錯誤：可能是重送邀請，或先前手動建過。
    // 這種情況改寄重設密碼信，效果一樣是「讓他自己設定密碼」。
    const already = /already|registered|exists/i.test(inviteErr.message || '');
    if (!already) {
      return reply(500, { error: '寄送邀請失敗：' + inviteErr.message });
    }
    const { error: resetErr } = await admin.auth.resetPasswordForEmail(
      email, { redirectTo: `${SITE}/member/password.html` },
    );
    if (resetErr) {
      return reply(500, { error: '這個信箱已有帳號，改寄重設信也失敗：' + resetErr.message });
    }
    const { data: found } = await admin.rpc('user_id_by_email', { p_email: email });
    userId = String(found ?? '');
  }

  if (!userId) {
    return reply(500, { error: '帳號已建立或邀請已寄出，但取不到使用者 id，請手動設定角色。' });
  }

  // ---- 4. 設定角色與棋士對應 ----
  const { error: profErr } = await admin.from('profiles').update({
    role: 'player',
    display_name: name,
    player_id: playerId,
  }).eq('id', userId);
  if (profErr) {
    return reply(500, { error: '邀請已寄出，但設定角色失敗：' + profErr.message });
  }

  // ---- 5. 標記為已處理 ----
  await admin.from('messages').update({
    handled: true,
    handled_note: `已於 ${new Date().toISOString().slice(0, 10)} 寄出開通邀請`,
  }).eq('id', messageId);

  return reply(200, { ok: true, email, name, player_id: playerId });
});
