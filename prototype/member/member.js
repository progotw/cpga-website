/* ==========================================================================
   棋士專區 — 登入守門與側邊選單
   ⚠ 注意：此為「前端示意」版本，帳號狀態僅存在瀏覽器 localStorage，
     不具任何實際安全性。正式上線必須改為後端驗證（登入 API + Session/JWT），
     且個人財務資料須經伺服器端權限檢查後才可回傳。
   ========================================================================== */
(function () {
  'use strict';

  var MEMBER_NAV = [
    { key: 'home',    href: 'index.html',         label: '專區首頁',     ico: '◎' },
    { key: 'cal',     href: 'calendar.html',      label: '賽程行事曆',   ico: '▦' },
    { key: 'ann',     href: 'announcements.html', label: '內部公告',     ico: '✉' },
    { key: 'pay',     href: 'payments.html',      label: '撥款時程與紀錄', ico: '＄' },
    { key: 'promo',   href: 'promotion.html',     label: '升段進度／排名', ico: '▲' },
    { key: 'profile', href: 'profile.html',       label: '個人資料維護', ico: '◍' },
    { key: 'forms',   href: 'forms.html',         label: '表單／規則下載', ico: '▤' }
  ];

  window.CPGA_MEMBER = {
    get: function () {
      try { return JSON.parse(localStorage.getItem('cpga_user') || 'null'); }
      catch (e) { return null; }
    },
    login: function (user) { localStorage.setItem('cpga_user', JSON.stringify(user)); },
    logout: function () { localStorage.removeItem('cpga_user'); }
  };

  /* 需登入的頁面：在 <body> 加上 data-member-page="<key>" */
  function guard() {
    var page = document.body.getAttribute('data-member-page');
    if (!page) return null;

    var user = window.CPGA_MEMBER.get();
    if (!user) {
      location.replace('login.html?next=' + encodeURIComponent(location.pathname.split('/').pop() + location.search));
      return null;
    }
    return { user: user, page: page };
  }

  function sidebar(user, page) {
    var items = MEMBER_NAV.map(function (n) {
      return '<li><a href="' + n.href + '"' + (n.key === page ? ' class="is-active"' : '') + '>' +
        '<span class="ico">' + n.ico + '</span>' + n.label + '</a></li>';
    }).join('');

    return '<aside class="member-side">' +
      '<div class="member-side__user">' +
        '<div class="member-side__avatar">' + user.name.charAt(0) + '</div>' +
        '<div><div class="member-side__name">' + user.name + '</div>' +
        '<div class="member-side__rank">' + user.rank + '　·　' + user.id + '</div></div>' +
      '</div>' +
      '<ul class="member-nav">' + items + '</ul>' +
      '<hr style="margin:14px 0">' +
      '<button class="btn btn-ghost btn-sm btn-block" id="logoutBtn">登出</button>' +
      '</aside>';
  }

  function mount() {
    var ctx = guard();
    if (!ctx) return;

    var slot = document.getElementById('member-side');
    if (slot) slot.outerHTML = sidebar(ctx.user, ctx.page);

    var btn = document.getElementById('logoutBtn');
    if (btn) {
      btn.addEventListener('click', function () {
        window.CPGA_MEMBER.logout();
        location.href = 'login.html';
      });
    }

    document.querySelectorAll('[data-user-name]').forEach(function (el) {
      el.textContent = ctx.user.name;
    });
    document.dispatchEvent(new CustomEvent('cpga:ready', { detail: ctx.user }));
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount);
  } else {
    mount();
  }
})();
