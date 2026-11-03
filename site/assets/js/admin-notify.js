/* ==========================================================================
   後台的新訊息提醒

   有人送出學生詢問、意見申訴或帳號申請時，正在看後台的管理員會馬上看到
   右下角跳出提示，不必重新整理頁面。

   需先載入 auth.js。資料表要先加進 Realtime 的發布清單
   （supabase/schema_realtime.sql）。

   收得到什麼仍然由資料列權限決定：不是管理員的人連上也收不到東西。
   ========================================================================== */
(function () {
  'use strict';

  var A = window.CPGA_AUTH;
  if (!A || !A.client) return;

  var ROOT = (function () {
    var s = document.currentScript && document.currentScript.src;
    return s ? s.replace(/assets\/js\/admin-notify\.js.*$/, '') : '../';
  })();

  var KIND = {
    teacher_enquiry: '學生詢問',
    member_feedback: '意見與申訴',
    account_request: '帳號開通申請'
  };

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  /* ---- 右下角的提示 ---- */
  function toast(row) {
    var kind = KIND[row.kind] || '新訊息';
    var who = row.from_name || '';
    var onInbox = /\/admin\/inbox(\.html)?$/.test(location.pathname);

    var box = document.getElementById('cpgaToasts');
    if (!box) {
      box = document.createElement('div');
      box.id = 'cpgaToasts';
      box.className = 'toast-stack';
      document.body.appendChild(box);
    }

    var el = document.createElement('div');
    el.className = 'toast';
    el.innerHTML =
      '<strong>' + esc(kind) + '</strong>' +
      (who ? '　' + esc(who) : '') +
      '<br><span class="toast__sub">' +
        (onInbox ? '已加到最上面' : '剛剛收到一則新訊息') + '</span>' +
      (onInbox ? '' : '<a class="toast__go" href="' + ROOT + 'admin/inbox.html">前往收件匣 →</a>') +
      '<button class="toast__x" type="button" aria-label="關閉">×</button>';

    el.querySelector('.toast__x').addEventListener('click', function () { el.remove(); });
    box.appendChild(el);
    /* 不自動消失會越疊越多，但也不能太快——秘書處可能正在打字沒看到 */
    setTimeout(function () { el.classList.add('is-out'); }, 12000);
    setTimeout(function () { el.remove(); }, 12600);
  }

  /* ---- 桌面通知（要使用者同意過才會送） ---- */
  function desktop(row) {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    try {
      var n = new Notification('中華職業圍棋協會　後台', {
        body: (KIND[row.kind] || '新訊息') + (row.from_name ? '　' + row.from_name : ''),
        tag: 'cpga-message-' + row.id          /* 同一則只會跳一次 */
      });
      n.onclick = function () {
        window.focus();
        location.href = ROOT + 'admin/inbox.html';
      };
    } catch (e) { /* 瀏覽器不支援就算了 */ }
  }

  /* ---- 首頁磚上的未處理數 ---- */
  function bumpBadge() {
    var badge = document.querySelector('.tile-badge');
    if (badge) {
      badge.textContent = (Number(badge.textContent) || 0) + 1;
      return;
    }
    var slot = document.getElementById('inboxBadge');
    if (slot) slot.outerHTML = '<span class="tile-badge">1</span>';
  }

  function onInsert(row) {
    if (!row) return;
    toast(row);
    desktop(row);
    bumpBadge();
    /* 收件匣頁自己接手，把新的那筆插到清單最上面 */
    if (typeof window.CPGA_INBOX_NEW === 'function') {
      try { window.CPGA_INBOX_NEW(row); } catch (e) {}
    }
  }

  window.CPGA_NOTIFY = {
    /* 由頁面上的按鈕呼叫：瀏覽器規定要由使用者動作觸發才能問 */
    askPermission: function () {
      if (!('Notification' in window)) return Promise.resolve('unsupported');
      return Notification.requestPermission();
    },
    supported: ('Notification' in window)
  };

  /* ---- 連線 ----
     只有管理員才訂閱。非管理員就算訂閱也收不到（資料列權限擋著），
     但沒必要多開一條連線。 */
  A.current().then(function (me) {
    if (!me || me.profile.role !== 'admin') return;

    /* Realtime 的連線要帶登入憑證才看得到受權限保護的資料。
       新版的 supabase-js 會自己處理，這行是舊版的保險。 */
    try {
      if (A.client.realtime && A.client.realtime.setAuth) A.client.realtime.setAuth();
    } catch (e) {}

    A.client.channel('admin-messages')
      .on('postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'messages' },
          function (payload) { onInsert(payload && payload.new); })
      .subscribe(function (status) {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          /* 連不上不影響後台其他功能，留一行訊息方便查 */
          console.warn('新訊息提醒連線失敗（' + status + '）。' +
                       '請確認 supabase/schema_realtime.sql 已經執行。');
        }
      });
  }).catch(function () { /* 沒登入就不做事 */ });
})();
