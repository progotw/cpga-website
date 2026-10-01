/* ==========================================================================
   Supabase 連線設定與輕量寫入

   這兩個值是設計上就要放進前端的公開值：所有操作都受資料列權限限制。
   能繞過權限的 secret key 不在任何前端檔案中。

   公開頁面（例如老師頁的詢問表單）只需要「寫入一列」，
   用這支 7KB 的檔案就夠，不必載入 200KB 以上的 supabase-js。
   需要登入狀態的頁面才載入完整函式庫與 auth.js。
   ========================================================================== */
(function () {
  'use strict';

  var URL = 'https://tagnpbazcpdjeobjigwx.supabase.co';
  var KEY = 'sb_publishable_VQ4YNGNm1OlF2DvZgLqZDQ_4yOX2Ygi';

  window.CPGA_SB = {
    url: URL,
    key: KEY,

    /* 新增一列。成功時回傳 Promise<void>，失敗時 reject 帶可讀訊息。 */
    insert: function (table, row) {
      return fetch(URL + '/rest/v1/' + table, {
        method: 'POST',
        headers: {
          'apikey': KEY,
          'Authorization': 'Bearer ' + KEY,
          'Content-Type': 'application/json',
          /* 不要求回傳資料：權限規則不允許匿名讀回，要求回傳會得到錯誤 */
          'Prefer': 'return=minimal'
        },
        body: JSON.stringify(row)
      }).then(function (r) {
        if (r.ok) return;
        return r.text().then(function (t) {
          var msg = t;
          try { msg = JSON.parse(t).message || t; } catch (e) { /* 原文就好 */ }
          throw new Error('HTTP ' + r.status + '：' + String(msg).slice(0, 200));
        });
      });
    }
  };
})();
