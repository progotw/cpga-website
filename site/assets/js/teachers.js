/* ==========================================================================
   職業老師資料載入器
   teachers.json 只存「教學相關」欄位；姓名、段位、照片、經歷一律由 players.json
   依 id 帶入，避免同一份資料維護兩次。
   需先載入 players.js。
   ========================================================================== */
(function () {
  'use strict';

  var ROOT = (function () {
    var s = document.currentScript && document.currentScript.src;
    return s ? s.replace(/assets\/js\/teachers\.js.*$/, '') : '';
  })();

  var promise = null;

  var CONTACT_ICON = {
    line: '💬', ig: '◎', fb: 'f', website: '↗', email: '✉', phone: '☎'
  };

  /* 網址加上 ?preview=1 會改讀範例資料，方便在正式網站上檢視版面。
     正式頁面仍讀 teachers.json，不受影響。 */
  var isPreview = new URLSearchParams(location.search).get('preview') === '1';

  window.CPGA_TEACHERS = {
    isPreview: isPreview,

    /* 在頁面頂端插入預覽模式提示 */
    previewBanner: function () {
      if (!isPreview) return;
      var el = document.createElement('div');
      el.className = 'wrap';
      el.style.paddingTop = '24px';
      el.innerHTML = '<div class="callout callout--accent"><p class="mb-0">' +
        '<strong>預覽模式</strong>：以下老師為版面示意。' +
        '教學資訊、費用與聯絡方式<strong>皆為範例，非實際資料</strong>。' +
        '正式頁面請移除網址後方的 <code>?preview=1</code>。</p></div>';
      var first = document.querySelector('.page-hero');
      if (first && first.nextSibling) first.parentNode.insertBefore(el, first.nextSibling);
    },

    /* 讓連結在預覽模式下保持預覽 */
    withPreview: function (href) {
      return isPreview ? href + (href.indexOf('?') > -1 ? '&' : '?') + 'preview=1' : href;
    },

    /* 回傳 { meta, teachers: [...] }，每位老師已合併棋士基本資料 */
    load: function () {
      if (!promise) {
        promise = Promise.all([
          fetch(ROOT + 'assets/data/' + (isPreview ? 'teachers.preview.json' : 'teachers.json'),
                { cache: 'no-cache' })
            .then(function (r) {
              if (!r.ok) throw new Error('teachers 資料 HTTP ' + r.status);
              return r.json();
            }),
          window.CPGA_PLAYERS.load()
        ]).then(function (res) {
          var data = res[0], players = res[1];
          var byId = {};
          (players.players || []).forEach(function (p) { byId[p.id] = p; });

          var merged = (data.teachers || []).map(function (t) {
            var p = byId[t.id] || {};
            return {
              id: t.id,
              name: t.name || p.name || '（未對應到棋士資料）',
              rank: t.rank || p.rank || '',
              photo: p.photo || '',
              history: p.history || [],
              playerSource: p.id ? 'players/profile.html?id=' + encodeURIComponent(p.id) : '',
              modes: t.modes || [],
              areas: t.areas || [],
              students: t.students || [],
              levels: t.levels || '',
              languages: t.languages || [],
              fee: t.fee || '',
              availability: t.availability || '',
              intro: t.intro || '',
              acceptForm: t.acceptForm !== false,
              contacts: t.contacts || []
            };
          });
          return { meta: data, teachers: merged };
        });
      }
      return promise;
    },

    photoUrl: function (t) { return t.photo ? ROOT + t.photo : ''; },

    contactIcon: function (type) { return CONTACT_ICON[type] || '→'; },

    /* LINE ID 轉可點連結；其餘型別自行判斷 */
    contactHref: function (c) {
      var v = String(c.value || '').trim();
      if (/^https?:\/\//.test(v)) return v;
      if (c.type === 'email') return 'mailto:' + v;
      if (c.type === 'phone') return 'tel:' + v.replace(/[^\d+]/g, '');
      if (c.type === 'line') return 'https://line.me/R/ti/p/' + encodeURIComponent(v);
      return '';
    },

    /* 把所有老師的某個陣列欄位攤平成不重複的選項清單 */
    options: function (teachers, field) {
      var seen = {}, out = [];
      teachers.forEach(function (t) {
        (t[field] || []).forEach(function (v) {
          if (!seen[v]) { seen[v] = 1; out.push(v); }
        });
      });
      return out;
    }
  };
})();
