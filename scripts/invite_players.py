"""
批次開通棋士帳號。

在協會自己的電腦上執行。名單含個資、金鑰可繞過所有權限檢查，
兩者都不會進入版控，也不需要交給任何人。

--------------------------------------------------------------------------
準備
--------------------------------------------------------------------------
1. 建一份名單 CSV（UTF-8），放在 private/ 底下（該目錄已排除於版控）：

       姓名,電子信箱
       王元均,example1@gmail.com
       林君諺,example2@gmail.com

   「棋士id」欄位可省略：程式會用姓名去 players.json 比對。
   同名或查無此人時會列出來，由人工補上 id 欄位再跑一次。

2. 取得 Supabase 的 secret key（Project Settings → API Keys），
   設成環境變數後再執行。PowerShell：

       $env:SUPABASE_URL = "https://tagnpbazcpdjeobjigwx.supabase.co"
       $env:SUPABASE_SERVICE_ROLE_KEY = "貼上 secret key"

--------------------------------------------------------------------------
執行
--------------------------------------------------------------------------
    python scripts/invite_players.py private/棋士名單.csv            # 先試跑，不會動到資料庫
    python scripts/invite_players.py private/棋士名單.csv --commit   # 確認無誤後實際建立

試跑會印出每一列將被如何處理。實際執行後會產生
private/開通結果_<日期>.csv，裡面含初始密碼，請以安全方式交給棋士，
轉交完成後刪除該檔。
"""
import os, sys, io, csv, json, time, secrets, string, datetime
import urllib.request, urllib.error

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

URL = (os.environ.get('SUPABASE_URL') or '').rstrip('/')
KEY = os.environ.get('SUPABASE_SERVICE_ROLE_KEY') or ''
PLAYERS = 'site/assets/data/players.json'

# 避開容易看錯的字元（0/O、1/l/I），密碼要用唸的或手抄給棋士
ALPHABET = ''.join(c for c in (string.ascii_letters + string.digits) if c not in '0O1lI')


def new_password(n=12):
    return ''.join(secrets.choice(ALPHABET) for _ in range(n))


def api(path, method='GET', body=None):
    req = urllib.request.Request(
        URL + path, method=method,
        data=json.dumps(body).encode('utf-8') if body is not None else None,
        headers={'apikey': KEY, 'Authorization': 'Bearer ' + KEY,
                 'Content-Type': 'application/json'})
    try:
        with urllib.request.urlopen(req, timeout=40) as r:
            raw = r.read().decode('utf-8')
            return json.loads(raw) if raw.strip() else None
    except urllib.error.HTTPError as e:
        detail = e.read().decode('utf-8')[:300]
        raise RuntimeError('HTTP %s %s — %s' % (e.code, path, detail))


def load_players():
    with io.open(PLAYERS, encoding='utf-8') as f:
        data = json.load(f)
    by_name = {}
    for p in data.get('players', []):
        by_name.setdefault(p['name'], []).append(p['id'])
    return by_name


def read_rows(path):
    with io.open(path, encoding='utf-8-sig', newline='') as f:
        for i, row in enumerate(csv.DictReader(f), start=2):
            name = (row.get('姓名') or '').strip()
            email = (row.get('電子信箱') or row.get('信箱') or '').strip().lower()
            pid = (row.get('棋士id') or '').strip()
            if not name and not email:
                continue
            yield i, name, email, pid


def main():
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    src = sys.argv[1]
    commit = '--commit' in sys.argv

    if not URL or not KEY:
        sys.exit('中止：請先設定 SUPABASE_URL 與 SUPABASE_SERVICE_ROLE_KEY 環境變數。')
    if not os.path.exists(PLAYERS):
        sys.exit('中止：找不到 %s，請在專案根目錄執行。' % PLAYERS)

    by_name = load_players()
    rows = list(read_rows(src))
    if not rows:
        sys.exit('中止：名單是空的。')

    print('%s　共 %d 列　%s' % (src, len(rows), '【實際執行】' if commit else '【試跑，不會動到資料庫】'))
    print('-' * 72)

    planned, problems = [], []

    for lineno, name, email, pid in rows:
        if not email or '@' not in email:
            problems.append((lineno, name, '沒有有效的電子信箱'))
            continue
        if not pid:
            hits = by_name.get(name, [])
            if len(hits) == 1:
                pid = hits[0]
            elif not hits:
                problems.append((lineno, name, '棋士名錄中查無此姓名，請在 CSV 補上「棋士id」欄位'))
                continue
            else:
                problems.append((lineno, name, '名錄中有 %d 位同名，請補上「棋士id」欄位' % len(hits)))
                continue
        planned.append((lineno, name, email, pid))
        print('  第 %-3d 列  %-6s %-32s %s' % (lineno, name, email, pid[:8] + '…'))

    if problems:
        print('\n需要人工處理的 %d 列：' % len(problems))
        for lineno, name, why in problems:
            print('  第 %-3d 列  %-6s %s' % (lineno, name, why))

    if not commit:
        print('\n以上為試跑結果。確認無誤後加上 --commit 實際建立。')
        return

    if problems:
        print('\n注意：有列需要人工處理，這些列會被略過。')

    # ---- 實際建立 ----
    out_rows, failed = [], []
    for lineno, name, email, pid in planned:
        pw = new_password()
        try:
            try:
                user = api('/auth/v1/admin/users', 'POST', {
                    'email': email,
                    'password': pw,
                    'email_confirm': True,            # 協會自行發送，不走驗證信
                    'user_metadata': {'display_name': name},
                })
                uid, created = user['id'], True
            except RuntimeError as e:
                if 'already' not in str(e).lower():
                    raise
                # 已存在：沿用原帳號，只補 profile，不重設密碼
                found = api('/auth/v1/admin/users?page=1&per_page=1&email=' + email)
                users = (found or {}).get('users') or []
                if not users:
                    raise RuntimeError('帳號已存在但查不到，請手動處理')
                uid, created, pw = users[0]['id'], False, '（沿用原密碼）'

            api('/rest/v1/profiles?id=eq.' + uid, 'PATCH', {
                'role': 'player', 'display_name': name, 'player_id': pid})

            out_rows.append([name, email, pw, '新建' if created else '已存在，只更新資料'])
            print('  ✓ %-6s %s' % (name, '已建立' if created else '已存在，資料已更新'))
        except Exception as e:
            failed.append((name, email, str(e)))
            print('  ✗ %-6s %s' % (name, e))
        time.sleep(0.3)   # 避免觸發頻率限制

    stamp = datetime.datetime.now().strftime('%Y%m%d_%H%M')
    os.makedirs('private', exist_ok=True)
    out = os.path.join('private', '開通結果_%s.csv' % stamp)
    with io.open(out, 'w', encoding='utf-8-sig', newline='') as f:
        w = csv.writer(f)
        w.writerow(['姓名', '電子信箱', '初始密碼', '狀態'])
        w.writerows(out_rows)

    print('\n完成：成功 %d 位，失敗 %d 位。' % (len(out_rows), len(failed)))
    print('結果已寫入 %s' % out)
    print('該檔含初始密碼，請以安全方式轉交，轉交後刪除。')
    if failed:
        print('\n失敗的列：')
        for name, email, why in failed:
            print('  %-6s %-32s %s' % (name, email, why[:120]))


if __name__ == '__main__':
    main()
