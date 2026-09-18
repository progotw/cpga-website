/* ==========================================================================
   中華職業圍棋協會 — 共用頁首 / 頁尾 / 導覽
   透過 <div id="site-header"></div>、<div id="site-footer"></div> 注入
   ========================================================================== */
(function () {
  'use strict';

  // 依本檔案的 src 推算站台根目錄，讓子資料夾頁面也能正確連結
  var ROOT = (function () {
    var s = document.currentScript && document.currentScript.src;
    if (!s) return '';
    return s.replace(/assets\/js\/site\.js.*$/, '');
  })();
  window.SITE_ROOT = ROOT;

  var NAV = [
    {
      label: '關於協會', href: 'about/index.html', key: 'about',
      children: [
        { label: '協會簡介',        href: 'about/index.html' },
        { label: '理監事會／組織架構', href: 'about/board.html' },
        { label: '大事紀',          href: 'about/milestones.html' },
        { label: '章程／法規',      href: 'about/charter.html' },
        { label: '聯絡方式',        href: 'about/contact.html' }
      ]
    },
    {
      label: '最新消息', href: 'news/index.html', key: 'news',
      children: [
        { label: '全部消息', href: 'news/index.html' },
        { label: '比賽訊息', href: 'news/index.html?cat=match' },
        { label: '媒體報導', href: 'news/index.html?cat=media' },
        { label: '公告',     href: 'news/index.html?cat=notice' }
      ]
    },
    {
      label: '職業棋士', href: 'players/index.html', key: 'players',
      children: [
        { label: '棋士名錄', href: 'players/index.html' },
        { label: '段位分布', href: 'players/index.html#dan' }
      ]
    },
    {
      label: '賽事專區', href: 'events/index.html', key: 'events',
      children: [
        { label: '賽事總覽',      href: 'events/index.html' },
        { label: '世界賽',        href: 'events/world.html' },
        { label: '職業賽事列表',  href: 'events/pro.html' },
        { label: '業餘賽事',      href: 'events/amateur.html' },
        { label: '職業棋士甄選',  href: 'events/qualification.html' },
        { label: '甄選簡章與報名', href: 'events/apply.html' },
        { label: '賽制／積分規則', href: 'events/rules.html' },
        { label: '段位／資格制度', href: 'events/dan-system.html' },
        { label: '晉升辦法',      href: 'events/promotion.html' }
      ]
    },
    { label: '找老師',   href: 'teachers/index.html',   key: 'teachers' },
    { label: '賽事花絮', href: 'gallery/index.html',    key: 'gallery' },
    { label: '加入會員', href: 'membership/index.html', key: 'membership' },
    { label: '下載專區', href: 'downloads/index.html',  key: 'downloads' }
  ];

  var LOGO_SRC = ROOT + 'assets/img/cpga-logo.png';

  var CARET = '<svg class="caret" viewBox="0 0 12 12" aria-hidden="true">' +
    '<path d="M2 4.5 6 8.5 10 4.5" fill="none" stroke="currentColor" stroke-width="1.6" ' +
    'stroke-linecap="round" stroke-linejoin="round"/></svg>';

  function buildHeader() {
    var active = document.body.getAttribute('data-nav') || '';
    var items = NAV.map(function (item) {
      var isActive = item.key === active ? ' is-active' : '';
      if (!item.children) {
        return '<li class="nav__item' + isActive + '">' +
          '<a class="nav__link" href="' + ROOT + item.href + '">' + item.label + '</a></li>';
      }
      var sub = item.children.map(function (c) {
        return '<li><a href="' + ROOT + c.href + '">' + c.label + '</a></li>';
      }).join('');
      return '<li class="nav__item has-sub' + isActive + '">' +
        '<a class="nav__link" href="' + ROOT + item.href + '">' + item.label + CARET + '</a>' +
        '<ul class="dropdown">' + sub + '</ul></li>';
    }).join('');

    return '' +
      '<header class="site-header">' +
        '<div class="wrap site-header__bar">' +
          '<a class="brand" href="' + ROOT + 'index.html" aria-label="中華職業圍棋協會 首頁">' +
            '<img class="brand__logo" src="' + LOGO_SRC + '" alt="中華職業圍棋協會">' +
          '</a>' +
          '<nav class="nav" id="mainNav" aria-label="主導覽">' +
            '<ul style="display:contents;list-style:none;margin:0;padding:0">' + items + '</ul>' +
            '<a class="nav__link nav__link--member" href="' + ROOT + 'member/index.html">棋士專區</a>' +
          '</nav>' +
          '<button class="nav-toggle" id="navToggle" aria-label="開啟選單" aria-expanded="false">' +
            '<span></span></button>' +
        '</div>' +
      '</header>';
  }

  function buildFooter() {
    var year = new Date().getFullYear();
    return '' +
      '<footer class="site-footer">' +
        '<div class="wrap">' +
          '<div class="footer-grid">' +
            '<div class="footer-brand">' +
              '<img class="footer-logo" src="' + LOGO_SRC + '" alt="中華職業圍棋協會">' +
              '<p>推動職業圍棋發展，健全棋士制度與賽事環境，<br>培育新生代棋士並促進國際交流。</p>' +
            '</div>' +
            '<div class="footer-col"><h4>關於</h4><ul>' +
              '<li><a href="' + ROOT + 'about/index.html">協會簡介</a></li>' +
              '<li><a href="' + ROOT + 'about/board.html">理監事會</a></li>' +
              '<li><a href="' + ROOT + 'about/milestones.html">大事紀</a></li>' +
              '<li><a href="' + ROOT + 'about/charter.html">章程法規</a></li>' +
            '</ul></div>' +
            '<div class="footer-col"><h4>賽事</h4><ul>' +
              '<li><a href="' + ROOT + 'events/index.html">賽事總覽</a></li>' +
              '<li><a href="' + ROOT + 'events/qualification.html">職業棋士甄選</a></li>' +
              '<li><a href="' + ROOT + 'events/rules.html">賽制與積分</a></li>' +
              '<li><a href="' + ROOT + 'gallery/index.html">賽事花絮</a></li>' +
            '</ul></div>' +
            '<div class="footer-col"><h4>服務</h4><ul>' +
              '<li><a href="' + ROOT + 'teachers/index.html">找職業老師</a></li>' +
              '<li><a href="' + ROOT + 'membership/index.html">加入會員</a></li>' +
              '<li><a href="' + ROOT + 'downloads/index.html">下載專區</a></li>' +
              '<li><a href="' + ROOT + 'member/index.html">棋士專區</a></li>' +
              '<li><a href="' + ROOT + 'about/contact.html">聯絡我們</a></li>' +
            '</ul></div>' +
          '</div>' +
          '<div class="footer-bottom">' +
            '<span>© ' + year + ' 中華職業圍棋協會 版權所有</span>' +
            '<span>106 台北市大安區敦化南路二段 105 號 9 樓　·　(02) 2702-8898</span>' +
          '</div>' +
        '</div>' +
      '</footer>';
  }

  function mount() {
    var h = document.getElementById('site-header');
    var f = document.getElementById('site-footer');
    if (h) h.outerHTML = buildHeader();
    if (f) f.outerHTML = buildFooter();

    var toggle = document.getElementById('navToggle');
    if (toggle) {
      toggle.addEventListener('click', function () {
        var open = document.body.classList.toggle('nav-open');
        toggle.setAttribute('aria-expanded', String(open));
        toggle.setAttribute('aria-label', open ? '關閉選單' : '開啟選單');
      });
    }

    // 行動版：點父層展開子選單而非直接跳轉
    document.querySelectorAll('.nav__item.has-sub > .nav__link').forEach(function (link) {
      link.addEventListener('click', function (e) {
        if (window.innerWidth > 860) return;
        e.preventDefault();
        link.parentElement.classList.toggle('is-open');
      });
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && document.body.classList.contains('nav-open')) {
        document.body.classList.remove('nav-open');
        if (toggle) toggle.setAttribute('aria-expanded', 'false');
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount);
  } else {
    mount();
  }
})();
