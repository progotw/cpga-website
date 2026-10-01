/* ==========================================================================
   後台的表單式編輯器

   每種內容用一份 schema 描述欄位，由共用的「可增刪列表」渲染，
   秘書處不需要碰 JSON。沒有 schema 的項目會退回純文字編輯。
   ========================================================================== */
(function () {
  'use strict';

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  /* 欄位型別：text（預設）、textarea、check、date */
  var SCHEMAS = {
    milestones: {
      list: 'items',
      itemName: '大事紀',
      hint: '由新到舊排列。內容須可查證，請勿自行編寫未發生的事項。',
      fields: [
        { k: 'year', label: '年份', w: '110px' },
        { k: 'text', label: '內容', type: 'textarea' }
      ]
    },

    downloads: {
      list: 'items',
      itemName: '下載項目',
      hint: '檔案路徑是相對網站根目錄的位置，例如 assets/files/章程.docx。留空則顯示為「尚未提供」。',
      fields: [
        { k: 'cat',  label: '分類', w: '160px' },
        { k: 'name', label: '檔案名稱' },
        { k: 'ext',  label: '格式', w: '90px' },
        { k: 'size', label: '大小', w: '100px' },
        { k: 'date', label: '更新日期', type: 'date', w: '160px' },
        { k: 'url',  label: '檔案路徑' }
      ]
    },

    membership: {
      list: 'types',
      itemName: '會員類別',
      top: [{ k: 'intro', label: '說明文字' }],
      fields: [
        { k: 'name',       label: '類別名稱', w: '180px' },
        { k: 'accent',     label: '標示為重點（加木色外框）', type: 'check' },
        { k: 'desc',       label: '資格說明', type: 'textarea' },
        { k: 'join_fee',   label: '入會費', w: '160px' },
        { k: 'annual_fee', label: '常年會費', w: '160px' },
        { k: 'rights',     label: '權利說明', type: 'textarea' }
      ]
    },

    board: {
      groups: 'groups',
      itemName: '成員',
      hint: '勾選「粗體」會讓姓名加粗，用於理事長、常務監事、秘書長等。',
      fields: [
        { k: 'role',      label: '職別', w: '170px' },
        { k: 'name',      label: '姓名', w: '200px' },
        { k: 'highlight', label: '粗體', type: 'check' }
      ],
      bottom: [{ k: 'note', label: '表格下方的附註', type: 'textarea' }]
    }
  };

  function fieldHtml(f, v) {
    var id = 'f_' + Math.random().toString(36).slice(2, 9);
    var style = f.w ? ' style="max-width:' + f.w + '"' : '';
    if (f.type === 'check') {
      return '<label class="row-check"><input type="checkbox" data-k="' + f.k + '"' +
        (v ? ' checked' : '') + '><span>' + esc(f.label) + '</span></label>';
    }
    var input = f.type === 'textarea'
      ? '<textarea id="' + id + '" data-k="' + f.k + '" rows="2">' + esc(v) + '</textarea>'
      : '<input id="' + id + '" data-k="' + f.k + '" type="' +
        (f.type === 'date' ? 'date' : 'text') + '" value="' + esc(v) + '"' + style + '>';
    return '<div class="field row-field"' + style + '>' +
      '<label for="' + id + '">' + esc(f.label) + '</label>' + input + '</div>';
  }

  /* schema 沒有對應欄位的資料（例如 membership 的 link 物件）原樣存在卡片上，
     收回時再合併回去。否則這些欄位會在編輯後被無聲丟棄。 */
  function stashOf(schema, item) {
    if (!item) return '';
    var known = {};
    schema.fields.forEach(function (f) { known[f.k] = 1; });
    var rest = {};
    Object.keys(item).forEach(function (k) { if (!known[k]) rest[k] = item[k]; });
    return Object.keys(rest).length ? esc(JSON.stringify(rest)) : '';
  }

  function rowHtml(schema, item) {
    return '<div class="row-card" data-rest="' + stashOf(schema, item) + '">' +
      '<div class="row-card__tools">' +
        '<button type="button" data-act="up" title="上移">↑</button>' +
        '<button type="button" data-act="down" title="下移">↓</button>' +
        '<button type="button" data-act="del" title="刪除" class="is-danger">✕</button>' +
      '</div>' +
      '<div class="row-card__fields">' +
        schema.fields.map(function (f) { return fieldHtml(f, item ? item[f.k] : ''); }).join('') +
      '</div></div>';
  }

  function collectRow(el, schema) {
    var out = {};
    schema.fields.forEach(function (f) {
      var input = el.querySelector('[data-k="' + f.k + '"]');
      if (!input) return;
      if (f.type === 'check') {
        if (input.checked) out[f.k] = true;
      } else {
        var v = input.value.trim();
        if (v) out[f.k] = v;
      }
    });
    /* 保留欄位排在已知欄位之後，維持與原檔相同的鍵順序 */
    var rest = el.getAttribute('data-rest');
    if (rest) {
      try {
        var extra = JSON.parse(rest);
        Object.keys(extra).forEach(function (k) { if (!(k in out)) out[k] = extra[k]; });
      } catch (e) { /* 壞掉就忽略，不要讓整個收集失敗 */ }
    }
    return out;
  }

  /* 列表容器的增刪與排序，所有列表共用 */
  function wireList(listEl, schema) {
    listEl.addEventListener('click', function (e) {
      var btn = e.target.closest('button[data-act]');
      if (!btn) return;
      e.preventDefault();
      var card = btn.closest('.row-card');
      var act = btn.dataset.act;
      if (act === 'del') {
        if (card.parentNode.children.length > 0) card.remove();
      } else if (act === 'up' && card.previousElementSibling) {
        card.parentNode.insertBefore(card, card.previousElementSibling);
      } else if (act === 'down' && card.nextElementSibling) {
        card.parentNode.insertBefore(card.nextElementSibling, card);
      }
    });
  }

  window.CPGA_FORMS = {
    has: function (key) { return !!SCHEMAS[key]; },

    render: function (host, key, data) {
      var s = SCHEMAS[key];
      data = data || {};
      var html = '';

      if (s.hint) html += '<div class="callout"><p class="mb-0" style="font-size:.9rem">' +
        esc(s.hint) + '</p></div>';

      (s.top || []).forEach(function (f) {
        html += '<div class="top-field">' + fieldHtml(f, data[f.k]) + '</div>';
      });

      if (s.groups) {
        html += (data[s.groups] || []).map(function (g, gi) {
          return '<section class="form-group" data-gi="' + gi + '">' +
            '<h2 class="form-group__title">' + esc(g.title) + '</h2>' +
            '<div class="row-list">' +
              (g.members || []).map(function (m) { return rowHtml(s, m); }).join('') +
            '</div>' +
            '<button type="button" class="btn btn-ghost btn-sm add-row">＋ 新增' +
              esc(s.itemName) + '</button></section>';
        }).join('');
      } else {
        html += '<section class="form-group"><div class="row-list">' +
          (data[s.list] || []).map(function (it) { return rowHtml(s, it); }).join('') +
          '</div>' +
          '<button type="button" class="btn btn-ghost btn-sm add-row">＋ 新增' +
            esc(s.itemName) + '</button></section>';
      }

      (s.bottom || []).forEach(function (f) {
        html += '<div class="top-field">' + fieldHtml(f, data[f.k]) + '</div>';
      });

      host.innerHTML = html;
      host.dataset.key = key;

      [].forEach.call(host.querySelectorAll('.row-list'), function (l) { wireList(l, s); });
      [].forEach.call(host.querySelectorAll('.add-row'), function (b) {
        b.addEventListener('click', function () {
          var list = b.parentNode.querySelector('.row-list');
          list.insertAdjacentHTML('beforeend', rowHtml(s, null));
          var last = list.lastElementChild.querySelector('input, textarea');
          if (last) last.focus();
        });
      });
    },

    /* 把表單內容收回成與原本 JSON 相同的結構。
       原始資料一併傳入，用來保留 schema 未涵蓋的欄位（例如 _說明、schema_version）。 */
    collect: function (host, key, original) {
      var s = SCHEMAS[key];
      var out = {};
      var listKey = s.groups || s.list;
      /* 依原本的鍵順序填回，列表欄位先放佔位，稍後覆寫 */
      Object.keys(original || {}).forEach(function (k) { out[k] = original[k]; });
      if (!(listKey in out)) out[listKey] = null;

      (s.top || []).concat(s.bottom || []).forEach(function (f) {
        var el = host.querySelector('.top-field [data-k="' + f.k + '"]');
        if (el) out[f.k] = f.type === 'check' ? el.checked : el.value.trim();
      });

      if (s.groups) {
        var orig = (original && original[s.groups]) || [];
        out[s.groups] = [].map.call(host.querySelectorAll('.form-group[data-gi]'), function (sec, i) {
          var g = {};
          Object.keys(orig[i] || {}).forEach(function (k) { if (k !== 'members') g[k] = orig[i][k]; });
          g.members = [].map.call(sec.querySelectorAll('.row-card'), function (c) {
            return collectRow(c, s);
          }).filter(function (m) { return m.name || m.role; });
          return g;
        });
      } else {
        out[s.list] = [].map.call(host.querySelectorAll('.row-card'), function (c) {
          return collectRow(c, s);
        }).filter(function (o) { return Object.keys(o).length; });
      }
      return out;
    }
  };
})();
