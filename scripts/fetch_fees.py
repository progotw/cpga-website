"""
把海峰發布的對局費抓進官網的 player_fees 表。

在 GitHub Action 裡執行，需要三個環境變數：
    HAIFONG_FEE_URL            海峰給的秘密網址（結尾 -y{年份} 可有可無）
    SUPABASE_URL               專案網址
    SUPABASE_SERVICE_ROLE_KEY  service_role 金鑰

=== 這個檔案跟其他爬蟲不一樣的地方 ===

對局費是私人資料，不是公開資料。

1. HAIFONG_FEE_URL 等於密碼：知道網址的人就讀得到「全部」棋士的金額。
   所以這支程式**不印網址、不印金額、不印棋士姓名**。CI 的 log 是
   這個 repo 的協作者都看得到的，印出來等於公開。
   想確認有沒有抓到時，只印筆數與合計筆數，不印內容。

2. 抓下來的東西**不落地**：不寫進 site/assets/data、不寫任何檔案。
   那個目錄會被提交進版控並公開在官網上。
   唯一的去處是 Supabase 的 player_fees，受資料列權限保護。

3. 404 代表院方那一年還沒發布過，或網址已經換新。
   這種情況**保留現有資料直接結束**，不要清空——
   清空的話棋士會看到金額突然歸零。
"""
import os, sys, io, json, re, urllib.request, urllib.error, urllib.parse, datetime as dt

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

FEE_URL = os.environ.get('HAIFONG_FEE_URL') or ''
SB_URL = (os.environ.get('SUPABASE_URL') or '').rstrip('/')
SB_KEY = os.environ.get('SUPABASE_SERVICE_ROLE_KEY') or ''
PLAYERS = sys.argv[1] if len(sys.argv) > 1 else 'site/assets/data/players.json'


def describe(name, v):
    """只說有沒有設、幾個字，不說是什麼。對局費網址連開頭都不能印。"""
    return '%s：%s' % (name, ('已設定（%d 字）' % len(v)) if v else '未設定 ✗')


print(describe('HAIFONG_FEE_URL', FEE_URL))
print(describe('SUPABASE_URL', SB_URL))
print(describe('SUPABASE_SERVICE_ROLE_KEY', SB_KEY))

if not FEE_URL:
    sys.exit('中止：缺少 HAIFONG_FEE_URL。網址由海峰棋院私下提供，'
             '請設在 Settings → Secrets and variables → Actions。')
if not SB_URL or not SB_KEY:
    sys.exit('中止：缺少 SUPABASE_URL 或 SUPABASE_SERVICE_ROLE_KEY。')
if SB_KEY.startswith('sb_publishable_') or SB_KEY.startswith('eyJ'):
    sys.exit('中止：SUPABASE_SERVICE_ROLE_KEY 看起來是公開金鑰。'
             '公開金鑰受資料列權限限制，寫不進 player_fees。')

# 說明文件寫的是 -y{年份}，大括號是佔位符號要整個換掉。
# 實際用的人（包含我們自己）填成 -y{2026} 過，所以兩種都剝掉。
# 貼進 Secret 時常常連反引號、引號、角括號一起複製進去。這些留著會讓網址
# 不是以 https 開頭，而 urllib 這時拋出的例外訊息會含整條網址。
WRAPPERS = '`\'"<>' + ' \t\r\n'
BASE = re.sub(r'-y(\{[^}]*\}|\d{4})$', '', FEE_URL.strip(WRAPPERS))

if not BASE.startswith('https://'):
    # 絕對不要把值印出來——那是鑰匙。只說開頭幾個字，夠判斷是不是多了字元。
    sys.exit('中止：HAIFONG_FEE_URL 不是以 https:// 開頭。\n'
             '貼進 Secret 時可能連前後的反引號、引號或說明文字一起複製了。\n'
             '值必須是乾淨的一整條網址，前後不能有任何其他字元。\n'
             '目前這個值的開頭是「%s」。' % BASE[:8])


def scrub(s):
    """把秘密網址從訊息裡抹掉再印。

    只攔 HTTPError 不夠：URLError、ValueError 之類的例外訊息會把網址整條
    帶進去，直接輸出等於把鑰匙貼在 CI 的 log 上。所有要輸出的例外訊息
    都要先過這裡。
    """
    s = str(s)
    if BASE:
        s = s.replace(BASE, '<秘密網址>')
    # 萬一是別種寫法（編碼過、或只剩亂碼那一段），
    # 把任何 24 字以上的連續亂碼都遮掉，寧可遮過頭。
    return re.sub(r'[A-Za-z0-9_\-]{24,}', '<遮蔽>', s)


def fetch_release(year):
    """回傳該年度的發布內容；院方還沒發布過則回 None。"""
    req = urllib.request.Request(
        '%s-y%d' % (BASE, year),
        headers={'User-Agent': 'CPGA-site-builder/1.1 (+https://cpga.org.tw)'})
    try:
        raw = json.loads(urllib.request.urlopen(req, timeout=30).read().decode('utf-8'))
    except urllib.error.HTTPError as e:
        if e.code == 404:
            return None
        hint = ''
        if e.code == 403:
            hint = ('\n提示：網址不正確，或海峰已經換過一組新的。'
                    '請向海峰棋院索取新網址並更新 GitHub Secret。')
        # 不要把回應內容印出來，裡面可能含網址
        sys.exit('中止：讀取對局費失敗 HTTP %s%s' % (e.code, hint))
    except urllib.error.URLError as e:
        sys.exit('中止：連不上對局費來源（%s）。' % scrub(e.reason))
    try:
        return json.loads(raw['fields']['json']['stringValue'])
    except (KeyError, TypeError, ValueError):
        sys.exit('中止：對局費資料的格式與說明文件不符，'
                 '預期有 fields.json.stringValue。請聯繫海峰棋院。')


def sb(method, path, body=None, prefer=None):
    headers = {'apikey': SB_KEY, 'Authorization': 'Bearer ' + SB_KEY,
               'Content-Type': 'application/json'}
    if prefer:
        headers['Prefer'] = prefer
    req = urllib.request.Request(
        SB_URL + '/rest/v1/' + path, method=method,
        data=json.dumps(body, ensure_ascii=False).encode('utf-8') if body is not None else None,
        headers=headers)
    try:
        return urllib.request.urlopen(req, timeout=40).read().decode('utf-8')
    except urllib.error.HTTPError as e:
        sys.exit('中止：寫入 player_fees 失敗 HTTP %s — %s'
                 % (e.code, e.read().decode('utf-8')[:200]))


def main():
    year = dt.datetime.now().year
    data = fetch_release(year)
    if data is None:
        print('%d 年度：院方尚未發布，保留現有資料，不做任何變更。' % year)
        return

    with io.open(PLAYERS, encoding='utf-8') as f:
        roster = json.load(f).get('players') or []
    by_name = {p['name']: p['id'] for p in roster if p.get('name') and p.get('id')}

    published = data.get('published_at') or dt.datetime.now().isoformat()
    # 這一次執行的時間戳。所有列都蓋同一個值，等一下用它分辨誰沒被更新到。
    run_ts = dt.datetime.now(dt.timezone.utc).isoformat()
    rows, skipped = [], 0
    for p in data.get('players') or []:
        pid = by_name.get(p.get('name'))
        if not pid:
            # 業餘、外籍棋手不在名錄裡，照既有做法略過。
            # 不印是誰——那也是對局費名單的一部分。
            skipped += 1
            continue
        rows.append({
            'player_id': pid,
            'year': year,
            'total': int(p.get('total') or 0),
            'events': p.get('events') or [],
            'published_at': published,
            'synced_at': run_ts,
        })

    print('%d 年度：發布版 %d 人，對應到名錄 %d 人，略過 %d 人。'
          % (year, len(data.get('players') or []), len(rows), skipped))

    if not rows:
        print('沒有任何一位對應到名錄，保留現有資料不動——'
              '這通常表示姓名對不上，而不是真的沒有對局費。')
        return

    sb('POST', 'player_fees', rows,
       prefer='resolution=merge-duplicates,return=minimal')

    # 院方修正後不再出現的棋士要刪掉，否則棋士會一直看到舊金額。
    #
    # 用 synced_at 判斷，不要把 id 列進網址：139 位棋士串起來是五千多字的
    # 網址，而且 PostgREST 的 in.(...) 要加引號，引號在網址裡是非法字元。
    # 剛才 upsert 過的列都帶著這次的 run_ts，比它舊的就是這次沒出現的。
    sb('DELETE', 'player_fees?year=eq.%d&synced_at=lt.%s'
       % (year, urllib.parse.quote(run_ts, safe='')),
       prefer='return=minimal')

    print('已寫入 %d 位棋士的對局費，並清掉本年度不在發布版中的舊資料。' % len(rows))
    print('院方發布時間：%s' % published)   # 時間不是機密，而且出問題時要靠它判斷版本


if __name__ == '__main__':
    try:
        main()
    except SystemExit:
        raise
    except Exception as e:
        # 未預期的例外一律先 scrub。沒有這一層的話，一個 traceback
        # 就可能把秘密網址印在 CI 的 log 上——這次就差一行。
        sys.exit('中止：未預期的錯誤 %s — %s' % (type(e).__name__, scrub(e)))
