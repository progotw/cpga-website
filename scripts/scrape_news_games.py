"""
從 haifong.org 抓取「最新消息」與「賽事」清單，輸出 news.json / games.json。
新聞只抓清單（標題、日期、分類、連結），內文連回原站。
"""
import urllib.request, re, json, time, sys, io, html, datetime, os

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

UA = {'User-Agent': 'Mozilla/5.0 (compatible; CPGA-site-builder/1.0)'}
BASE = 'https://www.haifong.org'

# 分類對應到網站既有的四個分類
CAT_MAP = {
    '比賽訊息': 'match',
    '活動訊息': 'event',
    '媒體報導': 'media',
    '公告': 'notice',
    '公告事項': 'notice',
}

GAME_CATS = [
    ('世界賽',   'DA1E059C5A4A54076EFE08FBBDC25498'),
    ('職業賽',   'FA0F9F48C13E158AF3F780DC2417BC51'),
    ('職棋甄選', '2F8829F0DADA3B877361CD3A5EF7F8DC'),
    ('業餘賽',   '0807B328145EE0905C5ACA7314E42EA7'),
    ('相關活動', '030E25FFE6411C47169D382615F7466B'),
]


def get(url, tries=3):
    for i in range(tries):
        try:
            req = urllib.request.Request(url, headers=UA)
            return urllib.request.urlopen(req, timeout=40).read().decode('utf-8', 'replace')
        except Exception:
            if i == tries - 1:
                raise
            time.sleep(2)


def txt(s):
    s = re.sub(r'(?is)<br\s*/?>', ' ', s)
    s = re.sub(r'(?is)<[^>]+>', '', s)
    return html.unescape(s).replace('\xa0', ' ').strip()


# ---------------- 最新消息 ----------------
def scrape_news(pages=6):
    items, seen = [], set()
    for pg in range(pages):
        url = BASE + '/news' if pg == 0 else f'{BASE}/news/{pg * 20}?'
        print(f'  news 第 {pg + 1} 頁…')
        h = get(url)
        found = 0
        # 直接掃整頁：輪播項目的 <a> 帶有 class，與這裡的精確樣式不符，不會誤抓
        for m in re.finditer(
            r'(?is)<a href="(' + re.escape(BASE) + r'/news/content/([A-Z0-9]+))">\s*'
            r'<h6>\s*(\d{4}\.\d{2}\.\d{2})\s*<b>\|</b>\s*(.*?)\s*</h6>\s*'
            r'<h4[^>]*>(.*?)</h4>', h):
            nid = m.group(2)
            if nid in seen:
                continue
            seen.add(nid)
            cat_label = txt(m.group(4))
            title = txt(m.group(5))
            # 標題常以「2026/09/10」開頭，與日期欄重複，去掉
            title = re.sub(r'^\d{4}/\d{2}/\d{2}\s*', '', title)
            items.append({
                'id': nid,
                'date': m.group(3).replace('.', '-'),
                'catLabel': cat_label,
                'cat': CAT_MAP.get(cat_label, 'notice'),
                'title': title,
                'url': m.group(1),
            })
            found += 1
        print(f'    取得 {found} 筆')
        if not found:
            break
        time.sleep(0.3)
    items.sort(key=lambda x: x['date'], reverse=True)
    return items


# ---------------- 賽事 ----------------
def scrape_games():
    out = []
    for label, cid in GAME_CATS:
        print(f'  賽事分類：{label}')
        h = get(f'{BASE}/game/{cid}')
        n = 0
        for m in re.finditer(r'(?is)<li class="mandataitem">(.*?)</li>', h):
            blk = m.group(1)
            mt = re.search(r'(?is)<h3>\s*(.*?)\s*</h3>', blk)
            if not mt:
                continue
            name = txt(mt.group(1))
            if not name or name == '圍棋規則':
                continue

            period = ''
            mp = re.search(r'(?is)<h6>\s*(.*?)\s*</h6>', blk)
            if mp:
                period = txt(mp.group(1))

            champ_label = champ = ''
            mc = re.search(r'(?is)<h5>.*?<b>\s*(.*?)\s*</b>.*?<strong>\s*(.*?)\s*</strong>', blk)
            if mc:
                champ_label, champ = txt(mc.group(1)), txt(mc.group(2))

            note = ''
            mn = re.search(r'(?is)<p class="txtOver">\s*(.*?)\s*</p>', blk)
            if mn:
                note = txt(mn.group(1))

            link = ''
            ml = re.search(r'(?is)href="(' + re.escape(BASE) + r'/game/classes/[A-Z0-9]+)"', blk)
            if ml:
                link = ml.group(1)

            out.append({
                'category': label,
                'name': name,
                'period': period,
                'champLabel': champ_label,
                'champion': champ,
                'note': note,
                'url': link,
                'active': '停辦' not in name,
            })
            n += 1
        print(f'    取得 {n} 項')
        time.sleep(0.3)
    return out


if __name__ == '__main__':
    site = sys.argv[1] if len(sys.argv) > 1 else r'C:\Users\user\Desktop\cpga-website'
    # 安全門檻：抓到的筆數明顯偏少通常代表原站改版、解析失效。
    # 這時寧可整支中止、保留既有的好資料，也不要用空清單覆蓋上去。
    MIN_NEWS, MIN_GAMES = 40, 30

    data_dir = os.path.join(site, 'assets', 'data')
    os.makedirs(data_dir, exist_ok=True)
    now = datetime.datetime.now().astimezone().isoformat(timespec='seconds')

    print('抓取最新消息…')
    news = scrape_news()
    print('\n抓取賽事…')
    games = scrape_games()

    problems = []
    if len(news) < MIN_NEWS:
        problems.append(f'新聞只有 {len(news)} 筆（門檻 {MIN_NEWS}）')
    if len(games) < MIN_GAMES:
        problems.append(f'賽事只有 {len(games)} 項（門檻 {MIN_GAMES}）')
    if problems:
        sys.exit('\n中止：' + '；'.join(problems) +
                 '。原站可能已改版，請檢查解析規則。既有資料未被覆蓋。')

    json.dump({'schema_version': 1, 'generated': now, 'source': '海峰棋院 最新消息',
               'source_url': BASE + '/news', 'count': len(news), 'items': news},
              open(os.path.join(data_dir, 'news.json'), 'w', encoding='utf-8'),
              ensure_ascii=False, indent=1)
    json.dump({'schema_version': 1, 'generated': now, 'source': '海峰棋院 賽事',
               'source_url': BASE, 'count': len(games), 'games': games},
              open(os.path.join(data_dir, 'games.json'), 'w', encoding='utf-8'),
              ensure_ascii=False, indent=1)

    print(f'\n完成：新聞 {len(news)} 筆、賽事 {len(games)} 項 → {data_dir}')
    from collections import Counter
    print('新聞分類：', dict(Counter(i['catLabel'] for i in news)))
    print('賽事分類：', dict(Counter(g['category'] for g in games)))
