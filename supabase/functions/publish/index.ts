// 後台「發布」「更新賽程」「更新對局費」三顆按鈕的中介。
//
// 前端不能持有 GitHub 權杖（任何寫進網頁的東西都是公開的），
// 因此由這支函式代為觸發 GitHub Action：
//   1. 用呼叫者自己的 JWT 確認身分
//   2. 查 profiles 確認角色是 admin
//   3. 以存在 Supabase Secrets 的權杖送出 repository_dispatch
//
// 需要的 Secrets：
//   GITHUB_TOKEN   權限只需 repo（細粒度權杖給 Contents: read/write）
//   GITHUB_REPO    例如 progotw/cpga-website

import { createClient } from 'jsr:@supabase/supabase-js@2';

// 能觸發哪些工作流程，寫死在這裡。
// 前端只能傳鍵名，不能自己指定 event_type——否則任何管理員帳號
// （或偷到管理員登入的人）都能觸發 repo 裡任意一個工作流程。
const EVENTS: Record<string, string> = {
  content:  'publish-content',   // 發布協會內容（publish-content.yml）
  schedule: 'update-data',       // 重抓賽程與對戰組合（update-data.yml）
  fees:     'update-fees',       // 更新對局費（fetch-fees.yml）
};

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

  // 用呼叫者的 JWT 建立連線：後續查詢都受資料列權限限制，
  // 這支函式本身不持有 service_role。
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: auth } } },
  );

  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userData?.user) return reply(401, { error: '登入狀態無效' });

  const { data: profile } = await supabase
    .from('profiles').select('role').eq('id', userData.user.id).single();

  if (!profile || profile.role !== 'admin') {
    return reply(403, { error: '此帳號沒有發布權限' });
  }

  // 沒帶 what 時視為「發布內容」，舊版前端照常可用
  let what = 'content';
  try {
    const body = await req.json();
    if (body && typeof body.what === 'string') what = body.what;
  } catch { /* 空 body 也是合法的 */ }
  const eventType = EVENTS[what];
  if (!eventType) return reply(400, { error: `不支援的動作：${what}` });

  const token = Deno.env.get('GITHUB_TOKEN');
  const repo = Deno.env.get('GITHUB_REPO');
  if (!token || !repo) return reply(500, { error: '伺服器尚未設定 GITHUB_TOKEN 或 GITHUB_REPO' });

  const res = await fetch(`https://api.github.com/repos/${repo}/dispatches`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
      'User-Agent': 'cpga-publish',
    },
    body: JSON.stringify({
      event_type: eventType,
      client_payload: { by: userData.user.email },
    }),
  });

  // GitHub 成功時回 204 No Content
  if (res.status !== 204) {
    const detail = await res.text();
    return reply(502, {
      error: `GitHub 回應 ${res.status}`,
      detail: detail.slice(0, 300),
    });
  }

  return reply(200, { ok: true });
});
