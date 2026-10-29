"""
首頁首屏的比賽照片：從海峰最新的比賽報導裡，自動挑一張現場照。

用法：python scripts/update_hero.py site

=== 怎麼挑 ===

1. 只看 news.json 裡「比賽訊息」類、而且**沒看過**的報導，最新的先看，
   一次最多 MAX_ARTICLES 篇。看過的記在 hero.json 的 checked，之後不再碰——
   我們曾經因為請求太密集被海峰擋過，這支每天只會多打幾個請求。

2. 標題含業餘、學生類字眼的跳過。這是職業棋士協會的首頁。

3. 報導裡的圖片逐張檢查，第一張「寬 ≥ MIN_WIDTH、寬高比 ≥ MIN_RATIO」的
   就採用，然後停止。
   報導常常一張現場照配一張海報：現場照幾乎都是橫的（多為 3:2），
   海報多是直式或接近正方形。實例：玄樂盃決賽那篇，現場照 1200×800、
   海報 1050×1200。

4. 只會換成「比目前這張更新」的報導，不會倒退。找不到合適的就維持現狀，
   首頁永遠不會變成空的。

=== 存放 ===

照片存在本站 site/assets/img/hero/<報導id>.jpg，不直接連海峰的圖——
否則每個訪客打開首頁都會去打海峰的伺服器。
檔名用報導 id，換照片就是換網址，瀏覽器不會拿到快取的舊圖。
舊的那張會刪掉，只留目前使用中的一張。
"""
import os, sys, io, json, re, urllib.request, urllib.parse

from PIL import Image

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

UA = {'User-Agent': 'CPGA-site-builder/1.1 (+https://cpga.org.tw; CPGA official site data sync)'}
HAIFONG = 'https://www.haifong.org'

MAX_ARTICLES = 5
MIN_WIDTH = 1000
MIN_RATIO = 1.3
SAVE_WIDTH = 1200
KEEP_CHECKED = 300

# 業餘、學生類賽事不放協會首頁。要調整就改這裡。
SKIP_WORDS = ['大專', '學生', '業餘', '院生', '少年', '兒童', '長青', '親子', 'PairGo']

SITE = sys.argv[1] if len(sys.argv) > 1 else 'site'
NEWS = os.path.join(SITE, 'assets', 'data', 'news.json')
OUT = os.path.join(SITE, 'assets', 'data', 'hero.json')
IMG_DIR = os.path.join(SITE, 'assets', 'img', 'hero')


def get(url, binary=False):
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


def caption_of(title):
    t = re.sub(r'^[【\[]|[】\]]$', '', title.strip())
    return t.strip()


def main():
    with io.open(NEWS, encoding='utf-8') as f:
        items = json.load(f).get('items') or []

    state = {}
    if os.path.exists(OUT):
        with io.open(OUT, encoding='utf-8') as f:
            state = json.load(f)
    checked = list(state.get('checked') or [])
    seen = set(checked)
    current_date = state.get('date') or ''

    todo = [i for i in items
            if i.get('cat') == 'match'
            and i.get('id') not in seen
            and (i.get('date') or '') >= current_date
            and not any(w in (i.get('title') or '') for w in SKIP_WORDS)]
    todo.sort(key=lambda i: i.get('date') or '', reverse=True)
    todo = todo[:MAX_ARTICLES]

    print('目前首頁照片：%s（%s）' % (state.get('caption', '無'), current_date or '—'))
    print('待檢查的新報導：%d 篇' % len(todo))

    picked = None
    for item in todo:
        checked.append(item['id'])
        try:
            urls = image_urls(get(item['url']))
        except Exception as e:
            print('  讀取報導失敗，略過：%s（%s）' % (item['title'][:30], e))
            continue
        for u in urls:
            try:
                im = Image.open(io.BytesIO(get(u, binary=True)))
                im.load()
            except Exception:
                continue
            w, h = im.size
            ok = w >= MIN_WIDTH and w / h >= MIN_RATIO
            print('  %s  %d×%d %s' % (item['title'][:24], w, h, '✓ 採用' if ok else '（不是橫式現場照）'))
            if ok:
                picked = (item, im)
                break
        if picked:
            break

    state['checked'] = checked[-KEEP_CHECKED:]

    if picked:
        item, im = picked
        os.makedirs(IMG_DIR, exist_ok=True)
        im = im.convert('RGB')
        if im.width > SAVE_WIDTH:
            im = im.resize((SAVE_WIDTH, round(im.height * SAVE_WIDTH / im.width)), Image.LANCZOS)
        name = item['id'] + '.jpg'
        im.save(os.path.join(IMG_DIR, name), 'JPEG', quality=82, optimize=True, progressive=True)
        # 只留目前這張，其餘刪掉（版控歷史裡還找得到）
        for f in os.listdir(IMG_DIR):
            if f != name:
                os.remove(os.path.join(IMG_DIR, f))
        state.update({
            'image': 'assets/img/hero/' + name,
            'width': im.width,
            'height': im.height,
            'caption': caption_of(item['title']),
            'date': item.get('date') or '',
            'link': item['url'],
            'credit': '海峰棋院',
        })
        print('首頁照片已更新：%s' % state['caption'])
    else:
        print('沒有新的合適照片，維持現狀。')

    with io.open(OUT, 'w', encoding='utf-8') as f:
        json.dump(state, f, ensure_ascii=False, indent=1)


if __name__ == '__main__':
    main()
