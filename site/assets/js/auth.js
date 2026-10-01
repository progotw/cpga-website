/* ==========================================================================
   Supabase 連線與登入狀態
   需先載入 supabase-js（UMD 版）。

   這裡的兩個值是設計上就要放進前端的公開值：
   所有操作都受資料庫的 Row Level Security 規則限制，拿到也不能越權。
   能繞過權限的 secret key 絕不出現在本檔或任何前端檔案。
   ========================================================================== */
(function () {
  'use strict';

  var URL = 'https://tagnpbazcpdjeobjigwx.supabase.co';
  var KEY = 'sb_publishable_VQ4YNGNm1OlF2DvZgLqZDQ_4yOX2Ygi';

  var ROOT = (function () {
    var s = document.currentScript && document.currentScript.src;
    return s ? s.replace(/assets\/js\/auth\.js.*$/, '') : '';
  })();

  if (!window.supabase || !window.supabase.createClient) {
    console.error('supabase-js 未載入，請確認 <script> 順序');
    return;
  }

  var client = window.supabase.createClient(URL, KEY);

  window.CPGA_AUTH = {
    client: client,
    root: ROOT,

    signIn: function (email, password) {
      return client.auth.signInWithPassword({ email: email, password: password });
    },

    /* 兩種角色各有自己的登入頁，導向時不要把棋士送到管理後台 */
    loginPath: function (role) {
      return ROOT + (role === 'admin' ? 'admin/login.html' : 'member/login.html');
    },

    signOut: function (role) {
      var self = this;
      return client.auth.signOut().then(function () {
        location.href = self.loginPath(role) + '?signedout=1';
      });
    },

    /* 回傳 { user, profile } 或 null。profile 含 role 與 display_name。 */
    current: function () {
      return client.auth.getSession().then(function (res) {
        var session = res.data && res.data.session;
        if (!session) return null;
        return client.from('profiles')
          .select('role, display_name, player_id')
          .eq('id', session.user.id)
          .single()
          .then(function (p) {
            return { user: session.user, profile: p.data || null, error: p.error || null };
          });
      });
    },

    /* 頁面守門：未登入或角色不符就導回登入頁。
       解析成功才回傳 { user, profile }，呼叫端可直接接著渲染。 */
    require: function (role) {
      var login = this.loginPath(role);
      return this.current().then(function (me) {
        if (!me) {
          location.replace(login + '?next=' +
            encodeURIComponent(location.pathname + location.search));
          return new Promise(function () {});   // 停住，不要繼續渲染
        }
        if (role && (!me.profile || me.profile.role !== role)) {
          /* 管理員進棋士專區是合理的（要檢視畫面），反之則不行 */
          if (!(role === 'player' && me.profile && me.profile.role === 'admin')) {
            location.replace(login + '?denied=1');
            return new Promise(function () {});
          }
        }
        return me;
      });
    },

    /* 觸發發布：呼叫 Edge Function，由它驗證權限後通知 GitHub Action。
       前端不持有 GitHub 權杖——寫進網頁的任何東西都是公開的。 */
    publish: function () {
      return client.functions.invoke('publish', { body: {} }).then(function (res) {
        if (res.error) {
          /* Edge Function 回非 2xx 時，錯誤內容在 context 裡 */
          return (res.error.context && typeof res.error.context.json === 'function'
            ? res.error.context.json().catch(function () { return null; })
            : Promise.resolve(null)
          ).then(function (body) {
            throw new Error((body && (body.error || body.detail)) || res.error.message);
          });
        }
        return res.data;
      });
    },

    /* 把 Supabase 的英文錯誤轉成看得懂的訊息 */
    message: function (err) {
      var m = (err && err.message) || '';
      if (/Invalid login credentials/i.test(m)) return '帳號或密碼不正確。';
      if (/Email not confirmed/i.test(m))       return '此帳號尚未完成驗證，請洽秘書處。';
      if (/rate limit|too many/i.test(m))       return '嘗試次數過多，請稍後再試。';
      if (/Failed to fetch|NetworkError/i.test(m)) return '無法連線，請檢查網路後再試。';
      if (/Function not found|404/i.test(m)) return '發布功能尚未在 Supabase 建立（Edge Function「publish」）。';
      return m || '發生未預期的錯誤。';
    }
  };
})();
