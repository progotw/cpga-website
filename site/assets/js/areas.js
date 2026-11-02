/* ==========================================================================
   臺灣縣市清單

   老師填「可授課地區」與「找老師」的地區篩選共用這一份。
   以前是自由輸入，寫法各憑喜好——台北、臺北市、北部、大台北都有——
   篩選選單就跟著變成一堆意思相同的選項，使用者也選不準。

   normalize() 負責把舊資料與各種寫法對回清單裡的正式名稱。
   ========================================================================== */
(function () {
  'use strict';

  var GROUPS = [
    { label: '北部', items: ['基隆市', '臺北市', '新北市', '桃園市', '新竹市', '新竹縣', '宜蘭縣'] },
    { label: '中部', items: ['苗栗縣', '臺中市', '彰化縣', '南投縣', '雲林縣'] },
    { label: '南部', items: ['嘉義市', '嘉義縣', '臺南市', '高雄市', '屏東縣'] },
    { label: '東部', items: ['花蓮縣', '臺東縣'] },
    { label: '離島', items: ['澎湖縣', '金門縣', '連江縣'] }
  ];

  var LIST = [];
  GROUPS.forEach(function (g) { LIST = LIST.concat(g.items); });

  /* 比對用的簡寫：去掉空白、台→臺、去掉結尾的市／縣。
     「台北」「臺北市」「台北市」都會變成「臺北」。 */
  function key(s) {
    return String(s == null ? '' : s)
      .replace(/\s/g, '')
      .replace(/台/g, '臺')
      .replace(/[市縣]$/, '');
  }

  var BY_KEY = {};
  LIST.forEach(function (name) {
    /* 嘉義市與嘉義縣的簡寫相同，先登記的（市）優先，
       真的要選縣的人自己勾，不會因此選不到。 */
    var k = key(name);
    if (!BY_KEY[k]) BY_KEY[k] = name;
  });

  window.CPGA_AREAS = {
    groups: GROUPS,
    list: LIST,

    /* 任意寫法 → 清單裡的正式名稱；對不上回空字串 */
    normalize: function (s) { return BY_KEY[key(s)] || ''; },

    /* 由北到南、本島到離島的順序，用來排篩選選單。
       不在清單裡的排最後。 */
    order: function (name) {
      var i = LIST.indexOf(name);
      return i < 0 ? LIST.length : i;
    },

    sort: function (names) {
      var self = this;
      return (names || []).slice().sort(function (a, b) {
        return self.order(a) - self.order(b);
      });
    }
  };
})();
