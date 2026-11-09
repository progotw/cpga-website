// 後台「棋士帳號」頁：列出帳號、由秘書處修改棋士的登入信箱。
//
// 為什麼需要秘書處能改：
//   棋士自己就能在職業棋士專區改信箱，但前提是他還登得進去。
//   舊信箱停用、又忘了密碼的棋士，重設密碼信寄不到，就永遠進不來——
//   這種情況只能由秘書處確認身分後直接改。
//
// 不能用「刪帳號重邀」替代：帳號一刪，他寫的個人簡介、教學資訊會跟著
// 刪掉，報過名的還會因為報名紀錄綁著帳號而刪不掉。
//
// 動作：
//   { action: 'list' }                              → 所有棋士帳號（含信箱、最後登入）
//   { action: 'change', user_id, email, reset }     → 改信箱；reset 為 true 時順便寄
//                                                     重設密碼信到新信箱
//   { action: 'delete', user_id, email }            → 刪掉一個從未登入的棋士帳號
//
// delete 只處理一種情況：開通時信箱打錯（2026-11-06 有人少打一個 m），
// 對方根本收不到信、也從來沒登入過，留著只是一個空帳號。
// 因此限制得很死——必須是棋士帳號、必須從未登入、畫面上的信箱要跟目前
// 的一致、底下不能有任何資料。只要登入過就一律擋下來，改用「修改信箱」。
//
// 只能改「棋士」帳號，不能改管理員帳號：管理員的信箱等於後台的鑰匙，
// 不應該被另一個管理員按一下就換掉。
//
// 部署時 Verify JWT 要「開著」：這支函式只給管理員用。
// 需要的 Secrets：無（SUPABASE_URL、SUPABASE_ANON_KEY、SUPABASE_SERVICE_ROLE_KEY
// 由 Supabase 自動提供）。

import { createClient } from 'jsr:@supabase/supabase-js@2';

const SET_PASSWORD_URL = 'https://cpga.org.tw/member/password';

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

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return reply(405, { error: '只接受 POST' });

  const auth = req.headers.get('Authorization') ?? '';
  if (!auth) return reply(401, { error: '未提供身分憑證' });

  // ---- 確認呼叫者是管理員（用他自己的 JWT，受資料列權限限制）----
  const asCaller = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: auth } } },
  );
  const { data: me } = await asCaller.auth.getUser();
  if (!me?.user) return reply(401, { error: '身分憑證無效' });
  const { data: myProfile } = await asCaller
    .from('profiles').select('role').eq('id', me.user.id).single();
  if (!myProfile || myProfile.role !== 'admin') {
    return reply(403, { error: '只有管理員可以使用' });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return reply(400, { error: '無法解析請求內容' });
  }

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  // ---- 列出棋士帳號 ----
  if (body.action === 'list') {
    const { data: profs, error: pErr } = await admin
      .from('profiles').select('id, display_name, player_id').eq('role', 'player');
    if (pErr) return reply(500, { error: '讀取帳號失敗：' + pErr.message });

    // 棋士最多一百多位，一頁就拿完
    const { data: list, error: uErr } = await admin.auth.admin.listUsers({ perPage: 1000 });
    if (uErr) return reply(500, { error: '讀取帳號失敗：' + uErr.message });
    type U = { id: string; email?: string; new_email?: string;
               created_at?: string; last_sign_in_at?: string };
    const byId = new Map<string, U>(
      (list.users as U[]).map((u) => [u.id, u] as [string, U]));

    return reply(200, {
      accounts: (profs ?? []).map((p) => {
        const u = byId.get(p.id);
        return {
          user_id: p.id,
          display_name: p.display_name,
          player_id: p.player_id,
          email: u?.email ?? '',
          // 正在等對方確認的新信箱（棋士自己改、還沒點確認信）
          pending_email: u?.new_email ?? '',
          created_at: u?.created_at ?? null,
          last_sign_in_at: u?.last_sign_in_at ?? null,
        };
      }),
    });
  }

  // ---- 修改信箱 ----
  if (body.action === 'change') {
    const userId = String(body.user_id ?? '').trim();
    const email = String(body.email ?? '').trim().toLowerCase();
    if (!userId) return reply(400, { error: '缺少 user_id' });
    if (!EMAIL_RE.test(email)) return reply(400, { error: '信箱格式不正確' });

    const { data: target } = await admin
      .from('profiles').select('role, display_name').eq('id', userId).single();
    if (!target) return reply(404, { error: '找不到這個帳號' });
    if (target.role !== 'player') {
      return reply(403, { error: '只能修改棋士帳號的信箱，管理員帳號請本人自行處理' });
    }

    // 新信箱已經被別的帳號用了，就不能給這個人
    const { data: owner } = await admin.rpc('user_id_by_email', { p_email: email });
    if (owner && String(owner) !== userId) {
      return reply(409, { error: '這個信箱已經是另一個帳號在用' });
    }

    const { data: before } = await admin.auth.admin.getUserById(userId);
    const oldEmail = before?.user?.email ?? '';

    // email_confirm：秘書處已經確認過身分，直接生效，不必再點確認信——
    // 會走到這條路，多半就是舊信箱收不到信了。
    const { error: upErr } = await admin.auth.admin.updateUserById(userId, {
      email, email_confirm: true,
    });
    if (upErr) return reply(500, { error: '修改失敗：' + upErr.message });

    let resetSent = false;
    if (body.reset) {
      const { error: rErr } = await admin.auth.resetPasswordForEmail(
        email, { redirectTo: SET_PASSWORD_URL });
      resetSent = !rErr;
    }

    return reply(200, { ok: true, old_email: oldEmail, email, reset_sent: resetSent });
  }

  // ---- 刪除帳號（僅限從未登入）----
  if (body.action === 'delete') {
    const userId = String(body.user_id ?? '').trim();
    const email = String(body.email ?? '').trim().toLowerCase();
    if (!userId) return reply(400, { error: '缺少 user_id' });

    const { data: target } = await admin
      .from('profiles').select('role, display_name').eq('id', userId).single();
    if (!target) return reply(404, { error: '找不到這個帳號' });
    if (target.role !== 'player') {
      return reply(403, { error: '只能刪除棋士帳號，管理員帳號不能從這裡刪' });
    }

    const { data: before } = await admin.auth.admin.getUserById(userId);
    const u = before?.user;
    if (!u) return reply(404, { error: '找不到這個帳號' });

    // 畫面上的清單可能是幾分鐘前載入的，信箱對不起來就不要動
    if (email && (u.email ?? '').toLowerCase() !== email) {
      return reply(409, { error: '畫面上的信箱和目前的不一樣，請重新整理後再試一次' });
    }
    if (u.last_sign_in_at) {
      return reply(403, { error: '這個帳號登入過，不能刪除。要換信箱請用「修改信箱」。' });
    }

    // 從未登入的帳號照理說什麼都沒有。真的有就停下來，不要連帶刪掉。
    const OWNED: [string, string][] = [
      ['entries', 'user_id'],
      ['player_profiles', 'user_id'],
      ['teaching', 'user_id'],
      ['messages', 'created_by'],
    ];
    for (const [table, col] of OWNED) {
      const { count, error } = await admin
        .from(table).select('*', { count: 'exact', head: true }).eq(col, userId);
      if (error) return reply(500, { error: '檢查資料失敗：' + error.message });
      if (count) {
        return reply(409, { error: '這個帳號底下還有資料（' + table + '），沒有刪除' });
      }
    }

    const { error: dErr } = await admin.auth.admin.deleteUser(userId);
    if (dErr) return reply(500, { error: '刪除失敗：' + dErr.message });

    // profiles 的外鍵是 on delete cascade，帳號刪掉那一列會跟著不見
    return reply(200, { ok: true, email: u.email ?? '', display_name: target.display_name });
  }

  return reply(400, { error: '不支援的動作' });
});
