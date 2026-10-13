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


# ---- 1. 取得名單 ----
print('抓取名單頁…')
listing = get(LIST_URL)
ids = []
seen = set()
for m in re.finditer(r'href="(https://www\.haifong\.org/profession/venue/([A-Za-z0-9]+))"', listing):
    if m.group(2) not in seen:
        seen.add(m.group(2))
        ids.append((m.group(2), m.group(1)))
print(f'找到 {len(ids)} 位棋士頁面')

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

# ---- 3. 依段位排序 ----
# 安全門檻：抓到的人數明顯偏少通常代表原站改版、解析失效。
# 這時寧可中止、保留既有的好資料，也不要用殘缺清單覆蓋上去。
MIN_PLAYERS = 100
if len(players) < MIN_PLAYERS:
    sys.exit(f'\n中止：只解析到 {len(players)} 位棋士（門檻 {MIN_PLAYERS}，'
             f'名單頁共 {len(ids)} 個連結）。原站可能已改版，既有資料未被覆蓋。')

players.sort(key=lambda p: (RANK_ORDER.index(p['rank']) if p['rank'] in RANK_ORDER else 99))

out = {
    'schema_version': 1,
    'generated': datetime.datetime.now().astimezone().isoformat(timespec='seconds'),
    'source': '海峰棋院 職業棋士名錄',
    'source_url': LIST_URL,
    'count': len(players),
    'players': players,
}

dest = sys.argv[1] if len(sys.argv) > 1 else 'players.json'
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
