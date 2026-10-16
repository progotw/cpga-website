"""
從 haifong.org 抓取職業棋士名錄與個人資料，輸出成網站用的 players.json。
資料為協會／棋院自有內容，僅供官網呈現使用。
"""
import urllib.request, re, json, time, sys, html, io, datetime

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

LIST_URL = 'https://www.haifong.org/profession'
# 誠實標示身分並留下聯絡方式：對方的維運人員看到異常流量時，
# 才知道是誰、找得到人，不必先當成攻擊處理。
UA = {'User-Agent': 'CPGA-site-builder/1.1 (+https://cpga.org.tw; CPGA official site data sync)'}
RANK_ORDER = ['九段', '八段', '七段', '六段', '五段', '四段', '三段', '二段', '初段']


def get(url, tries=3):
    for i in range(tries):
        try:
            req = urllib.request.Request(url, headers=UA)
            return urllib.request.urlopen(req, timeout=40).read().decode('utf-8', 'replace')
        except Exception as e:
            if i == tries - 1:
                raise
            time.sleep(5 * (i + 1))   # 遞增退讓，不要在對方不穩時連續撞


def clean_html(s):
    """只保留安全的排版標籤，移除腳本與事件屬性。"""
    s = re.sub(r'(?is)<(script|style|iframe|object|embed)[^>]*>.*?</\1>', '', s)
    s = re.sub(r'(?i)\son\w+\s*=\s*"[^"]*"', '', s)
    s = re.sub(r'(?i)\son\w+\s*=\s*\'[^\']*\'', '', s)
    s = re.sub(r'(?is)</?(?!/?(?:p|br|strong|b|em|i|u|span|a|ul|ol|li|h4|h5)\b)[a-z][^>]*>', '', s)
    s = re.sub(r'(?is)<p>\s*<p>', '<p>', s)
    s = re.sub(r'(?is)</p>\s*</p>', '</p>', s)
    s = re.sub(r'(?:<br\s*/?>\s*){3,}', '<br><br>', s, flags=re.I)
    s = s.replace('\xa0', ' ')
    return s.strip()


def text_of(s):
    s = re.sub(r'(?is)<br\s*/?>', '\n', s)
    s = re.sub(r'(?is)<[^>]+>', '', s)
    return html.unescape(s).replace('\xa0', ' ').strip()


DEST = next((a for a in sys.argv[1:] if not a.startswith('-')), 'players.json')
FULL = '--full' in sys.argv
ONLY = ''
for i, a in enumerate(sys.argv):
    if a == '--only' and i + 1 < len(sys.argv):
        ONLY = sys.argv[i + 1]

# 個人頁的保底輪替週期（天）。平常靠秘書處通知即可，
# 這個輪替只是避免有人忘了通知而資料停滯。
ROTATE_DAYS = 28

# 海峰每月一號批次更新年度成績。28 天輪一圈比他們的更新週期還長，
# 總會有人的戰績落後一整輪——2026-10-16 查彭景華就是這樣，
# 線上已是 10/1 版，我們還停在 9/1。所以每月初全部重抓一次。
# 挑 2 號是留一天緩衝，避免在對方還沒更新完時抓到舊資料。
FULL_REFRESH_DAY = 2


# ---- 1. 取得名單 ----
# 列表頁一次就給出 id、姓名、段位、照片——那正是名錄頁要顯示的全部內容。
# 個人頁只多了戰績與簡介，而那些變動很慢。
# 每天抓 139 個個人頁是 30 倍的無謂流量，2026-10-13 觸發了海峰的資安機制。
print('抓取名單頁…')
listing = get(LIST_URL)

roster = []
seen = set()
for block in re.split(r'(?i)<li[\s>]', listing):
    m = re.search(r'href="(https://www\.haifong\.org/profession/venue/([A-Za-z0-9]+))"', block)
    if not m or m.group(2) in seen:
        continue
    seen.add(m.group(2))
    mp = re.search(r'background-image:url\(([^)]*)\)', block)
    mn = re.search(r'(?is)<b>\s*(.*?)\s*</b>', block)
    mr = re.search(r'(?is)</b>\s*</span>\s*<br\s*/?>\s*<span>\s*(.*?)\s*</span>', block)
    roster.append({
        'id': m.group(2),
        'url': m.group(1),
        'name': text_of(mn.group(1)) if mn else '',
        'rank': text_of(mr.group(1)) if mr else '',
        'photo': (mp.group(1).strip() if mp else ''),
    })
print('名單頁解析到 %d 位（姓名 %d、段位 %d）'
      % (len(roster), sum(1 for r in roster if r['name']), sum(1 for r in roster if r['rank'])))

# 名單頁本身就是門檻：這裡不足代表原站改版，不必再往下打擾對方
MIN_PLAYERS = 100
if len(roster) < MIN_PLAYERS:
    sys.exit('\n中止：名單頁只解析到 %d 位（門檻 %d）。原站可能已改版，既有資料未被覆蓋。'
             % (len(roster), MIN_PLAYERS))


# ---- 1b. 讀入既有資料，決定這次要抓誰 ----
cache = {}
try:
    with io.open(DEST, encoding='utf-8') as f:
        for rec in json.load(f).get('players', []):
            cache[rec['id']] = rec
    print('既有資料 %d 位' % len(cache))
except Exception:
    print('沒有既有資料，這次全部抓取')
    FULL = True

if not FULL and datetime.date.today().day == FULL_REFRESH_DAY:
    FULL = True
    print('每月例行全量更新（%d 號）' % FULL_REFRESH_DAY)

order = [r['id'] for r in roster]
by_name = {r['name']: r['id'] for r in roster if r['name']}

if FULL:
    todo = set(order)
    why = '--full 全部重抓' if '--full' in sys.argv else '每月例行全量更新'
elif ONLY:
    todo = set()
    missing = []
    for key in re.split(r'[,，、\s]+', ONLY.strip()):
        if not key:
            continue
        if key in by_name:
            todo.add(by_name[key])
        elif key in seen:
            todo.add(key)
        else:
            missing.append(key)
    if missing:
        sys.exit('\n中止：名單中找不到 %s。請確認姓名或棋士 id。' % '、'.join(missing))
    why = '指定 %d 位' % len(todo)
else:
    # 新加入的、或既有資料不完整的，一定要抓
    todo = {r['id'] for r in roster
            if r['id'] not in cache or not cache[r['id']].get('season')}
    # 其餘依日期輪替，當作沒人通知時的保底
    per_day = max(1, -(-len(order) // ROTATE_DAYS))
    start = (datetime.date.today().toordinal() * per_day) % max(1, len(order))
    todo |= {order[(start + k) % len(order)] for k in range(per_day)}
    why = '新增/不完整 + %d 天輪替' % ROTATE_DAYS

ids = [(r['id'], r['url']) for r in roster if r['id'] in todo]
print('本次需抓個人頁 %d 頁（%s）' % (len(ids), why))

# ---- 2. 逐頁抓取 ----
# 連續失敗代表對方異常或我們被擋，繼續重試只會讓情況更糟。
# 2026-10-03 起這支程式每天硬撞 139 頁、重試三次、跑滿 104 分鐘，
# 觸發了海峰的資安機制——那是把自己變成攻擊流量。
MAX_CONSECUTIVE_FAILS = 8

players = []
consecutive_fails = 0
for n, (pid, url) in enumerate(ids, 1):
    try:
        h = get(url)
        consecutive_fails = 0
    except Exception as e:
        consecutive_fails += 1
        print(f'  [{n}/{len(ids)}] {pid} 失敗: {e}')
        if consecutive_fails >= MAX_CONSECUTIVE_FAILS:
            sys.exit(f'\n中止：連續 {consecutive_fails} 頁失敗，判定來源異常或請求被拒。'
                     f'\n已停止抓取，既有資料未被覆蓋。請先確認原站狀況再重跑。')
        continue

    m = re.search(r'(?is)<section class="Chessplayer".*?<h3>\s*(.*?)\s*<span>\s*(.*?)\s*</span>\s*</h3>', h)
    if not m:
        print(f'  [{n}/{len(ids)}] {pid} 找不到姓名，略過')
        continue
    name, rank = text_of(m.group(1)), text_of(m.group(2))

    photo = ''
    mp = re.search(r'imgCover"\s+style="background-image:url\(([^)]+)\)"', h)
    if mp:
        photo = mp.group(1).strip()

    # 歷史成績（冠軍數等）
    history = []
    for mh in re.finditer(
        r'(?is)<div class="venus_title">.*?<h5><span>(.*?)</span></h5>.*?'
        r'<div class="venus_text">\s*<h5>(.*?)</h5>', h):
        history.append({'label': text_of(mh.group(1)), 'value': text_of(mh.group(2))})

    # 年度成績
    season_label, season = '', []
    ms = re.search(r'(?is)<section class="race race2">.*?<div style="text-align: center[^"]*">\s*(.*?)\s*</div>', h)
    if ms:
        season_label = text_of(ms.group(1))
    race = re.search(r'(?is)<section class="race race2">(.*?)</section>', h)
    if race:
        for mr in re.finditer(r'(?is)<h3 class="subTitle2[^"]*">(.*?)</h3>\s*<p>(.*?)</p>', race.group(1)):
            season.append({'label': text_of(mr.group(1)), 'value': text_of(mr.group(2))})

    # 簡介＋主要棋戰履歷（原站富文字內容）
    body = ''
    mb = re.search(r'(?is)<article class="img_all_fixed">(.*?)</article>', h)
    if mb:
        body = clean_html(mb.group(1))

    # 外部連結
    links = []
    for ml in re.finditer(r'(?is)<a class="linkbtn" href="([^"]*)"[^>]*>\s*(.*?)\s*</a>', h):
        href, label = ml.group(1).strip(), text_of(ml.group(2))
        if href and label:
            links.append({'label': label, 'url': href})

    players.append({
        'id': pid,
        'name': name,
        'rank': rank,
        'photo': photo,
        'history': history,
        'seasonLabel': season_label,
        'season': season,
        'body': body,
        'links': links,
        'source': url,
    })
    if n % 20 == 0 or n == len(ids):
        print(f'  進度 {n}/{len(ids)}')
    # 1 秒一頁。139 頁約 2.5 分鐘，對方不會看成突波；
    # 這是每天跑一次的排程，快沒有意義。
    time.sleep(1.0)

# ---- 3. 合併並排序 ----
# 這次抓到的覆蓋舊的，沒抓的沿用既有資料；
# 姓名、段位、照片一律以名單頁為準，所以升段隔天就會反映。
fresh = {p['id']: p for p in players}
players = []
for r in roster:
    rec = dict(fresh.get(r['id']) or cache.get(r['id']) or {})
    if not rec:
        print('  略過 %s：沒有既有資料也沒抓到' % r['id'])
        continue
    rec['id'] = r['id']
    rec['source'] = r['url']
    if r['name']:
        rec['name'] = r['name']
    if r['rank']:
        rec['rank'] = r['rank']
    # photo 存的是 fetch_photos.py 改寫過的本機路徑。只要已經有本機檔就一律保留——
    # 若覆寫回遠端網址而那支程式剛好失敗，網站會讓每位訪客直接去海峰要 139 張圖。
    cached_photo = (cache.get(r['id']) or {}).get('photo') or ''
    if cached_photo.startswith('assets/'):
        rec['photo'] = cached_photo
    elif r['photo']:
        rec['photo'] = r['photo']
    rec.setdefault('history', [])
    rec.setdefault('seasonLabel', '')
    rec.setdefault('season', [])
    rec.setdefault('body', '')
    rec.setdefault('links', [])
    players.append(rec)

if len(players) < MIN_PLAYERS:
    sys.exit('\n中止：合併後只有 %d 位（門檻 %d）。既有資料未被覆蓋。'
             % (len(players), MIN_PLAYERS))

players.sort(key=lambda p: (RANK_ORDER.index(p['rank']) if p['rank'] in RANK_ORDER else 99))

# 內容沒變就沿用舊的時間戳，否則每天都會產生一筆沒有意義的提交
prev_generated = ''
try:
    with io.open(DEST, encoding='utf-8') as f:
        old_doc = json.load(f)
    prev_generated = old_doc.get('generated', '')
    unchanged = old_doc.get('players') == players
except Exception:
    unchanged = False

out = {
    'schema_version': 1,
    'generated': prev_generated if (unchanged and prev_generated)
                 else datetime.datetime.now().astimezone().isoformat(timespec='seconds'),
    'source': '海峰棋院 職業棋士名錄',
    'source_url': LIST_URL,
    'count': len(players),
    'players': players,
}

dest = DEST
with open(dest, 'w', encoding='utf-8') as f:
    json.dump(out, f, ensure_ascii=False, indent=1)

print(f'\n完成：{len(players)} 位 → {dest}')
from collections import Counter
for r in RANK_ORDER:
    c = sum(1 for p in players if p['rank'] == r)
    if c:
        print(f'  {r}: {c}')
missing_body = [p['name'] for p in players if not p['body']]
print(f'無簡介內容者 {len(missing_body)} 位' + (f'：{missing_body[:10]}' if missing_body else ''))
