"""
比賽照片：從海峰的比賽報導裡挑現場照，供首頁首屏與「賽事花絮」相簿使用。

用法：
    python scripts/update_hero.py site               每日排程用，一次最多看 5 篇新報導
    python scripts/update_hero.py site --backfill 20 第一次填相簿用，往回補 20 篇

=== 怎麼挑 ===

1. 只看 news.json 裡「比賽訊息」類、而且**沒看過**的報導，最新的先看。
   看過的記在 hero.json 的 checked，之後不再碰——
   我們曾經因為請求太密集被海峰擋過，平常每天只會多打一兩個請求，
   每個請求之間也會停一秒。
   報導若已經由 fetch_articles.py 轉存進官網，就直接用存好的圖片清單，
   不再去海峰讀同一篇。

2. 標題含業餘、學生類字眼的跳過。這是職業棋士協會的網站。

3. 每篇報導裡的圖片逐張檢查，第一張「寬 ≥ MIN_WIDTH、寬高比 ≥ MIN_RATIO」
   的就採用。報導常常一張現場照配一張海報：現場照幾乎都是橫的（多為 3:2），
   海報多是直式或接近正方形。實例：玄樂盃決賽那篇，現場照 1200×800、
   海報 1050×1200。用最近 6 篇實測，挑中 5 張全是現場照，1 張直式成績表被擋下。

=== 存放 ===

照片存在本站 site/assets/img/gallery/<報導id>.jpg，不直接連海峰的圖——
否則每個訪客打開頁面都會去打海峰的伺服器。

gallery.json 是相簿，新的在前；首頁首屏用的是相簿裡最新的那一張
（寫在 hero.json），兩邊共用同一個檔案，不會重複存。
相簿最多留 MAX_GALLERY 張，超過的連檔案一起刪掉。
"""
import os, sys, io, json, re, time, urllib.request, urllib.parse

from PIL import Image

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

UA = {'User-Agent': 'CPGA-site-builder/1.1 (+https://cpga.org.tw; CPGA official site data sync)'}
HAIFONG = 'https://www.haifong.org'

MAX_ARTICLES = 5
MIN_WIDTH = 1000
MIN_RATIO = 1.3
SAVE_WIDTH = 1200
MAX_GALLERY = 120
KEEP_CHECKED = 500
PAUSE = 1.0           # 每個請求之間停多久（秒），不要連續打海峰

# 業餘、學生類賽事不放協會網站。要調整就改這裡。
SKIP_WORDS = ['大專', '學生', '業餘', '院生', '少年', '兒童', '長青', '親子', 'PairGo']

SITE = sys.argv[1] if len(sys.argv) > 1 and not sys.argv[1].startswith('--') else 'site'
BACKFILL = 0
if '--backfill' in sys.argv:
    BACKFILL = int(sys.argv[sys.argv.index('--backfill') + 1])

DATA = os.path.join(SITE, 'assets', 'data')
NEWS = os.path.join(DATA, 'news.json')
ARTICLES = os.path.join(DATA, 'articles')
HERO = os.path.join(DATA, 'hero.json')
GALLERY = os.path.join(DATA, 'gallery.json')
IMG_DIR = os.path.join(SITE, 'assets', 'img', 'gallery')
IMG_URL = 'assets/img/gallery/'


def load(path, default):
    if os.path.exists(path):
        with io.open(path, encoding='utf-8') as f:
            return json.load(f)
    return default


def save(path, obj):
    with io.open(path, 'w', encoding='utf-8') as f:
        json.dump(obj, f, ensure_ascii=False, indent=1)


def get(url, binary=False):
    time.sleep(PAUSE)
    req = urllib.request.Request(url, headers=UA)
    data = urllib.request.urlopen(req, timeout=30).read()
    return data if binary else data.decode('utf-8', errors='ignore')


def image_urls(html):
    """報導內文裡的圖片，依出現順序。標誌、圖示一律排除。"""
    out, seen = [], set()
    for src in re.findall(r'<img[^>]+src=["\']([^"\']+)', html, re.I):
        if '/upload/' not in src:
            continue
        if re.search(r'logo|icon|qrcode|\.svg|\.gif', src, re.I):
            continue
        url = urllib.parse.urljoin(HAIFONG + '/', src)
        # 檔名常有中文與空白，正規化一次才能下載
        p = urllib.parse.urlsplit(url)
        url = urllib.parse.urlunsplit(
            (p.scheme, p.netloc, urllib.parse.quote(urllib.parse.unquote(p.path)), p.query, ''))
        if url not in seen:
            seen.add(url)
            out.append(url)
    return out


def article_images(item):
    """報導裡的圖片：已轉存的用存好的清單，沒有才去海峰讀。"""
    saved = os.path.join(ARTICLES, item['id'] + '.json')
    if os.path.exists(saved):
        return [u for u in load(saved, {}).get('images') or []
                if not re.search(r'logo|icon|qrcode|\.svg|\.gif', u, re.I)]
    return image_urls(get(item['url']))


def caption_of(title):
    return re.sub(r'^[【\[]|[】\]]$', '', title.strip()).strip()


def find_photo(item):
    """回傳這篇報導第一張橫式現場照（PIL Image），沒有就回 None。"""
    try:
        urls = article_images(item)
    except Exception as e:
        print('  讀取報導失敗，略過：%s（%s）' % (item['title'][:30], e))
        return None
    for u in urls:
        try:
            im = Image.open(io.BytesIO(get(u, binary=True)))
            im.load()
        except Exception:
            continue
        w, h = im.size
        ok = w >= MIN_WIDTH and w / h >= MIN_RATIO
        print('  %s  %d×%d %s' % (item['title'][:24], w, h,
                                 '✓ 採用' if ok else '（不是橫式現場照）'))
        if ok:
            return im
    return None


def migrate(hero, gallery):
    """舊版只存一張首頁照片在 img/hero/，搬進相簿。只會發生一次。"""
    old = hero.get('image') or ''
    if not old.startswith('assets/img/hero/'):
        return
    src = os.path.join(SITE, old)
    pid = os.path.splitext(os.path.basename(old))[0]
    if os.path.exists(src):
        os.makedirs(IMG_DIR, exist_ok=True)
        os.replace(src, os.path.join(IMG_DIR, pid + '.jpg'))
        try:
            os.rmdir(os.path.dirname(src))
        except OSError:
            pass
    if not any(g['id'] == pid for g in gallery):
        gallery.append({
            'id': pid, 'image': IMG_URL + pid + '.jpg',
            'width': hero.get('width'), 'height': hero.get('height'),
            'caption': hero.get('caption', ''), 'date': hero.get('date', ''),
            'link': hero.get('link', ''), 'credit': hero.get('credit', '海峰棋院'),
        })
    print('已把舊的首頁照片搬進相簿。')


def main():
    with io.open(NEWS, encoding='utf-8') as f:
        items = json.load(f).get('items') or []

    hero = load(HERO, {})
    gallery = load(GALLERY, {}).get('photos') or []
    migrate(hero, gallery)

    checked = list(hero.get('checked') or [])
    seen = set(checked)

    todo = [i for i in items
            if i.get('cat') == 'match'
            and i.get('id') not in seen
            and not any(w in (i.get('title') or '') for w in SKIP_WORDS)]
    todo.sort(key=lambda i: i.get('date') or '', reverse=True)
    todo = todo[:BACKFILL or MAX_ARTICLES]

    print('相簿現有 %d 張；待檢查的新報導 %d 篇' % (len(gallery), len(todo)))

    added = 0
    for item in todo:
        checked.append(item['id'])
        im = find_photo(item)
        if im is None:
            continue
        im = im.convert('RGB')
        if im.width > SAVE_WIDTH:
            im = im.resize((SAVE_WIDTH, round(im.height * SAVE_WIDTH / im.width)), Image.LANCZOS)
        os.makedirs(IMG_DIR, exist_ok=True)
        name = item['id'] + '.jpg'
        im.save(os.path.join(IMG_DIR, name), 'JPEG', quality=82, optimize=True, progressive=True)
        gallery.append({
            'id': item['id'], 'image': IMG_URL + name,
            'width': im.width, 'height': im.height,
            'caption': caption_of(item['title']), 'date': item.get('date') or '',
            'link': item['url'], 'credit': '海峰棋院',
        })
        added += 1

    # 新的在前；同一篇報導只留一張
    uniq = {}
    for g in gallery:
        uniq[g['id']] = g
    gallery = sorted(uniq.values(), key=lambda g: g.get('date') or '', reverse=True)

    # 超過上限的連檔案一起刪（版控歷史裡還找得到）
    for g in gallery[MAX_GALLERY:]:
        p = os.path.join(SITE, g['image'])
        if os.path.exists(p):
            os.remove(p)
    gallery = gallery[:MAX_GALLERY]

    save(GALLERY, {'photos': gallery})

    # 首頁用相簿裡最新的一張
    hero = {'checked': checked[-KEEP_CHECKED:]}
    if gallery:
        hero.update({k: gallery[0][k] for k in
                     ('image', 'width', 'height', 'caption', 'date', 'link', 'credit')})
    save(HERO, hero)

    print('新增 %d 張，相簿共 %d 張。首頁照片：%s'
          % (added, len(gallery), hero.get('caption', '無')))


if __name__ == '__main__':
    main()
