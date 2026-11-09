/* 管理員「以棋士身分檢視」
   ---------------------------------------------------------------------------
   秘書處要能確認某位棋士登入後看到的賽程、對局費、成績對不對。
   管理員帳號本身沒有綁 player_id，進專區時那幾塊是空的，看不到任何人的畫面，
   所以這裡讓管理員挑一位棋士，整個專區就照那位棋士的身分重畫一次。

   兩件事要講清楚：
   1. 這不是「登入成別人」。頁面還是用管理員自己的連線與權限讀資料，
      只是把要查的 player_id 換成選的那位。管理員本來就讀得到全部棋士的
      對局費（is_admin()），賽程與成績是公開檔，所以不必為了檢視而放寬權限。
   2. 棋士自己改 sessionStorage 也偷不到東西：資料列權限擋在資料庫，
      不是本人的對局費查出來就是空的。這裡的 role 判斷只是畫面上的事。

   選擇放在 sessionStorage，關掉分頁就沒了，不會下次登入還留著別人的身分。 */
(function () {
  var KEY = 'cpga_view_as';
  var V = window.CPGA_VIEWAS = {};

  function read() {
    try { return JSON.parse(sessionStorage.getItem(KEY) || 'null'); } catch (e) { return null; }
  }
  function write(v) {
    try {
      if (v && v.id) sessionStorage.setItem(KEY, JSON.stringify(v));
      else sessionStorage.removeItem(KEY);
    } catch (e) { /* 無痕模式之類：不能記就算了，這頁照樣能用 */ }
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  V.isAdmin = function (me) {
    var yes = !!(me && me.profile && me.profile.role === 'admin');
    if (yes) V._admin = true;        /* 各區塊自己載入，拿不到 me，記一個旗標給它們用 */
    return yes;
  };

  /* 沒有對象可顯示時要講的話：管理員是「還沒選人」，棋士才是「沒綁到名錄」 */
  V.noPlayerText = function (what) {
    return V._admin
      ? '請在上方「管理員檢視」選一位棋士，才會顯示' + what + '。'
      : '此帳號尚未對應到棋士名錄，無法顯示' + what + '，請洽秘書處。';
  };

  /* 這一頁要用哪個 player_id。
     一般棋士永遠是自己；管理員沒選人時維持原本的行為（通常是空的）。 */
  V.playerId = function (me) {
    if (!V.isAdmin(me)) { write(null); return (me.profile && me.profile.player_id) || ''; }
    var v = read();
    return (v && v.id) || (me.profile && me.profile.player_id) || '';
  };

  V.name = function (me) {
    if (!V.isAdmin(me)) return '';
    var v = read();
    return (v && v.name) || '';
  };

  /* 在最上面那條黑色橫幅底下插一列選單。只有管理員會看到。
     選了人就整頁重新載入——各區塊是各自獨立載入的，重畫比一塊塊通知可靠。 */
  V.mount = function (me) {
    if (!V.isAdmin(me)) return;

    var bar = document.createElement('div');
    bar.style.cssText = 'background:var(--accent-tint);border-bottom:1px solid var(--line)';
    bar.innerHTML =
      '<div class="admin-bar__inner" style="display:flex;gap:10px;align-items:center;' +
        'flex-wrap:wrap;padding:9px 0">' +
        '<strong style="font-size:.88rem;color:var(--accent)">管理員檢視</strong>' +
        '<input id="viewAsFind" type="search" placeholder="輸入姓名搜尋" ' +
          'autocomplete="off" style="font:inherit;font-size:.88rem;padding:5px 8px;' +
          'border:1px solid var(--line);border-radius:6px;background:#fff;width:9em">' +
        '<select id="viewAsSel" style="font:inherit;font-size:.88rem;padding:5px 8px;' +
          'border:1px solid var(--line);border-radius:6px;background:#fff;max-width:14em">' +
          '<option value="">（我自己的帳號）</option>' +
        '</select>' +
        '<span class="muted" style="font-size:.82rem" id="viewAsHint">' +
          '選一位棋士，底下的賽程、對局費、成績就照那位棋士看到的樣子顯示。' +
        '</span>' +
        /* 專區的上排只有「回官網」和「登出」，管理員從後台繞進來之後
           沒有路可以回去，只能自己打網址。這條就是那條回頭路。 */
        '<a class="btn btn-ghost btn-sm" href="../admin/index.html" ' +
          'style="margin-left:auto">回管理後台 →</a>' +
      '</div>';

    var top = document.querySelector('.admin-bar');
    if (top && top.parentNode) top.parentNode.insertBefore(bar, top.nextSibling);
    else document.body.insertBefore(bar, document.body.firstChild);

    var sel = bar.querySelector('#viewAsSel');
    var find = bar.querySelector('#viewAsFind');
    var hint = bar.querySelector('#viewAsHint');
    var cur = read();
    var all = [];

    /* 一百多個人用拉的太慢，所以搜尋框打字就把選單篩到剩下符合的。
       段位也一起比對，打「七段」可以列出全部七段。 */
    function fill(q) {
      q = String(q || '').trim();
      var list = q
        ? all.filter(function (p) {
            return (p.name + (p.rank || '')).indexOf(q) > -1;
          })
        : all;
      sel.innerHTML = '<option value="">（我自己的帳號）</option>' +
        list.map(function (p) {
          return '<option value="' + esc(p.id) + '"' +
            (cur && cur.id === p.id ? ' selected' : '') + '>' +
            esc(p.name) + (p.rank ? '　' + esc(p.rank) : '') + '</option>';
        }).join('');
      if (q) hint.textContent = list.length
        ? '符合 ' + list.length + ' 位，按 Enter 看第一位。'
        : '名錄裡沒有符合「' + q + '」的棋士。';
      else hint.textContent = '選一位棋士，底下的賽程、對局費、成績就照那位棋士看到的樣子顯示。';
      return list;
    }

    function go(id, name) {
      write(id ? { id: id, name: name } : null);
      location.reload();
    }

    /* 名錄是公開檔，跟棋士個人頁、報名頁用的是同一份 */
    fetch('../assets/data/players.json', { cache: 'no-cache' })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        all = (d.players || []).slice().sort(function (a, b) {
          return String(a.name).localeCompare(String(b.name), 'zh-Hant');
        });
        fill('');
      })
      .catch(function () {
        hint.textContent = '棋士名錄載入失敗，暫時無法切換檢視對象。';
      });

    find.addEventListener('input', function () { fill(find.value); });

    /* 打完名字按 Enter 就直接換過去，不用再移到旁邊的選單 */
    find.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      var list = fill(find.value);
      if (list.length) go(list[0].id, list[0].name);
    });

    sel.addEventListener('change', function () {
      var id = sel.value;
      go(id, id ? sel.options[sel.selectedIndex].text.split('　')[0] : '');
    });
  };

  /* 正在看別人時，在內容最上面放一條提醒，免得看完忘了身分還沒切回來 */
  V.notice = function (me) {
    var n = V.name(me);
    if (!V.isAdmin(me) || !n) return '';
    return '<p class="muted mb-0" style="font-size:.86rem">' +
      '目前顯示的是棋士 <strong style="color:var(--accent)">' + esc(n) +
      '</strong> 登入後看到的內容。' + '</p>';
  };
})();
