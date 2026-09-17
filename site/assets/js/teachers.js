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

  window.CPGA_TEACHERS = {
    /* 回傳 { meta, teachers: [...] }，每位老師已合併棋士基本資料 */
    load: function () {
      if (!promise) {
        promise = Promise.all([
          fetch(ROOT + 'assets/data/teachers.json', { cache: 'no-cache' })
            .then(function (r) {
              if (!r.ok) throw new Error('teachers.json HTTP ' + r.status);
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
