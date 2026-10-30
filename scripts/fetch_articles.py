"""
新聞內文轉存：把海峰棋院的新聞全文搬進官網，讀者不必離開官網。

用法：
    python scripts/fetch_articles.py site            每日排程用，一次最多 MAX_PER_RUN 篇
    python scripts/fetch_articles.py site --max 5    指定這次最多幾篇

=== 分批 ===

我們曾經因為請求太密集被海峰擋過，所以：
- 每次最多讀 MAX_PER_RUN 篇，每篇之間停 PAUSE 秒；
- 新的先讀，舊文章每天補一些，大約兩週補完；
- 讀過的存成檔案，之後不再讀第二次；
- 海峰一回「拒絕」或「太多請求」就整批停下，隔天再說。

還沒轉存的文章，官網的文章頁會直接轉去海峰原文，讀者不會看到空白頁。

=== 存放 ===

site/assets/data/articles/<新聞id>.json，一篇一個檔案。純文字，一篇約 5～20 KB。
另外每篇產生一頁 site/news/p/<新聞id>.html：標題、摘要與分享用的 Open Graph
標籤都寫在 HTML 裡，貼到 LINE、Facebook 才有標題與縮圖（對方的機器人不會跑
JavaScript，光靠網頁上的程式去填是讀不到的）。內文仍由瀏覽器讀 JSON 畫出來，
過濾才會跑第二次。

已轉存的文章會在 news.json 的項目上標 "local": true，網站據此決定連結指向
本站文章頁還是海峰原文。這支程式若當天失敗，標記就不會出現，連結自動退回
海峰原文，不會連到不存在的頁面。
文章裡的照片不下載，直接顯示海峰的圖（一篇常有十幾張，全部存進來網站會太大）。

內文來自別人的網站，存檔前先過濾一次：只留段落、粗體、清單、表格、圖片、連結這些
排版標籤，所有樣式與屬性都拿掉，程式碼整段丟掉。網頁顯示時還會再過濾一次
（content.js 的 articleHtml）。

首頁照片（update_hero.py）會直接讀這裡存好的圖片清單，不必再去海峰讀同一篇報導。
"""
import os, sys, io, re, json, time, datetime, html, urllib.request, urllib.error, urllib.parse
from html.parser import HTMLParser

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

UA = {'User-Agent': 'CPGA-site-builder/1.1 (+https://cpga.org.tw; CPGA official site data sync)'}
HAIFONG = 'https://www.haifong.org'

SITE_URL = 'https://cpga.org.tw/'
SHARE_IMG = SITE_URL + 'assets/img/share.jpg'

MAX_PER_RUN = 10
MAX_TRIES = 3         # 同一篇讀了三次都失敗就不再試，免得每天卡住名額
PAUSE = 3.0           # 每篇之間停多久（秒）

ID_RE = re.compile(r'[A-Z0-9]{16,40}')


# ---------------- 內文過濾 ----------------
KEEP = {'p', 'br', 'strong', 'em', 'ul', 'ol', 'li', 'blockquote', 'hr', 'h3', 'h4',
        'table', 'thead', 'tbody', 'tr', 'td', 'th', 'a', 'img'}
RENAME = {'b': 'strong', 'i': 'em', 'h1': 'h3', 'h2': 'h3', 'h5': 'h4', 'h6': 'h4'}
VOID = {'br', 'hr', 'img'}
# 內容本身是程式或表單，不是給人讀的文字，連內容一起丟掉
DROP = {'script', 'style', 'noscript', 'template', 'object', 'embed', 'iframe',
        'form', 'button', 'select', 'textarea', 'svg', 'math', 'head', 'title'}
YOUTUBE = re.compile(r'(?:youtube(?:-nocookie)?\.com/embed/|youtu\.be/)([A-Za-z0-9_-]{11})')


def image_url(src):
    """海峰站上的圖片網址（絕對、路徑正規化）；不是海峰上傳區的圖一律不要。"""
    url = urllib.parse.urljoin(HAIFONG + '/', (src or '').strip())
    p = urllib.parse.urlsplit(url)
    if p.scheme not in ('http', 'https') or p.netloc not in ('www.haifong.org', 'haifong.org'):
        return ''
    if not p.path.startswith('/upload/'):
        return ''
    # 檔名常有中文與空白，正規化一次瀏覽器才載得到
    return urllib.parse.urlunsplit(
        ('https', 'www.haifong.org', urllib.parse.quote(urllib.parse.unquote(p.path)), p.query, ''))


def link_url(href):
    href = (href or '').strip()
    if href.lower().startswith('mailto:'):
        return href
    url = urllib.parse.urljoin(HAIFONG + '/', href)
    return url if re.match(r'https?://[^/\s]', url) else ''


class Cleaner(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.out, self.stack, self.images = [], [], []
        self.skip_tag, self.skip_depth = None, 0

    def handle_starttag(self, tag, attrs):
        if self.skip_tag:
            if tag == self.skip_tag:
                self.skip_depth += 1
            return
        a = dict(attrs)
        if tag == 'iframe':
            m = YOUTUBE.search(a.get('src') or '')
            if m:
                self.out.append('<div data-yt="%s"></div>' % m.group(1))
        if tag in DROP:
            if tag not in VOID:
                self.skip_tag, self.skip_depth = tag, 1
            return
        tag = RENAME.get(tag, tag)
        if tag not in KEEP:
            return                      # span、div、font 這類只拿掉標籤，文字留著

        if tag == 'img':
            src = image_url(a.get('src'))
            if src:
                self.images.append(src)
                self.out.append('<img src="%s">' % html.escape(src))
            return
        attr = ''
        if tag == 'a':
            href = link_url(a.get('href'))
            if not href:
                return
            attr = ' href="%s"' % html.escape(href)
        elif tag in ('td', 'th'):
            for k in ('colspan', 'rowspan'):
                if (a.get(k) or '').isdigit():
                    attr += ' %s="%s"' % (k, a[k])
        self.out.append('<%s%s>' % (tag, attr))
        if tag not in VOID:
            self.stack.append(tag)

    def handle_startendtag(self, tag, attrs):
        self.handle_starttag(tag, attrs)
        if self.skip_tag == tag:        # <iframe ... /> 這種自己結束的，不能進入略過狀態
            self.skip_depth -= 1
            if not self.skip_depth:
                self.skip_tag = None

    def handle_endtag(self, tag):
        if self.skip_tag:
            if tag == self.skip_tag:
                self.skip_depth -= 1
                if not self.skip_depth:
                    self.skip_tag = None
            return
        tag = RENAME.get(tag, tag)
        if tag in self.stack:
            while self.stack:
                t = self.stack.pop()
                self.out.append('</%s>' % t)
                if t == tag:
                    break

    def handle_data(self, data):
        if not self.skip_tag:
            self.out.append(html.escape(data, quote=False))

    def result(self):
        while self.stack:
            self.out.append('</%s>' % self.stack.pop())
        h = ''.join(self.out)
        h = re.sub(r'(?:<br>\s*)+</p>', '</p>', h)
        # 整行只有「-----」的段落是分隔線
        h = re.sub(r'<p>[\s\xa0]*[-—－=＝_─━*＊.]{5,}[\s\xa0]*</p>', '<hr>', h)
        h = re.sub(r'<p>(?:[\s\xa0]|<br>)*</p>', '', h)
        h = re.sub(r'(<hr>\s*){2,}', '<hr>', h)
        # 影片框不能包在段落裡，否則瀏覽器會把段落拆成兩個空段落
        h = re.sub(r'<p>\s*(<div data-yt="[\w-]+"></div>)\s*</p>', r'\1', h)
        h = re.sub(r'\s*\n\s*', '\n', h)
        return h.strip()


def clean(fragment):
    c = Cleaner()
    c.feed(fragment)
    c.close()
    return c.result(), c.images


def plain(fragment, n=110):
    t = html.unescape(re.sub(r'(?s)<[^>]+>', ' ', fragment))
    t = re.sub(r'\s+', ' ', t.replace('\xa0', ' ')).strip()
    return t if len(t) <= n else t[:n].rstrip() + '…'


def parse(page):
    """海峰文章頁 → (標題, 內文 HTML, 圖片清單)。抓不到內文時回傳 None。"""
    page = re.sub(r'(?s)<!--.*?-->', '', page)      # 海峰把舊版分享按鈕、封面註解在裡面
    m = re.search(r'(?is)<article class="size">(.*?)</article>', page)
    if not m:
        return None
    art = m.group(1)
    mt = re.search(r'(?is)<h2[^>]*>(.*?)</h2>', art)
    title = plain(mt.group(1), 200) if mt else ''
    title = re.sub(r'^\d{4}/\d{1,2}/\d{1,2}\s*', '', title)
    # 內文從標題下方那條線之後開始（含封面圖）
    mh = re.search(r'(?is)<hr\s*/?>', art[mt.end():] if mt else art)
    body = (art[mt.end():] if mt else art)[mh.end():] if mh else art
    body_html, images = clean(body)
    if not plain(body_html) and not images:
        return None
    return title, body_html, images


# ---------------- 每篇一頁 ----------------
PAGE = """<!DOCTYPE html>
<html lang="zh-Hant">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{title}｜中華職業圍棋協會</title>
<meta name="description" content="{excerpt}">
<meta property="og:type" content="article">
<meta property="og:site_name" content="中華職業圍棋協會">
<meta property="og:title" content="{title}">
<meta property="og:description" content="{excerpt}">
<meta property="og:url" content="{page_url}">
<meta property="og:image" content="{image}">
<meta property="og:locale" content="zh_TW">
<meta property="article:published_time" content="{date}">
<meta name="twitter:card" content="summary_large_image">
<!-- 整篇轉載自海峰棋院，告訴搜尋引擎原文在哪裡，不要把本站當成重複內容 -->
<link rel="canonical" href="{source_url}">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+TC:wght@300;400;500;700&family=Noto+Serif+TC:wght@600;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="../../assets/css/style.css">
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><rect width='32' height='32' rx='6' fill='%23ffffff'/><circle cx='12.5' cy='16' r='8.2' fill='none' stroke='%23111111' stroke-width='2.6'/><circle cx='20.5' cy='16' r='7.8' fill='%233f3b39'/></svg>">
</head>
<body data-nav="news" data-article="{id}">
<div id="site-header"></div>

<section class="page-hero">
  <div class="wrap">
    <nav class="breadcrumb"><a href="../../index.html">首頁</a><span class="sep">/</span><a href="../index.html">最新消息</a><span class="sep">/</span><a href="../index.html?cat={cat}">{cat_label}</a></nav>
    <h1 class="article-title">{title}</h1>
    <p class="article-meta"><span>{shown_date}</span><span class="tag tag--dark">{cat_label}</span></p>
  </div>
</section>

<section class="section">
  <div class="wrap">
    <div class="article-wrap">
      <article class="article-body" id="artBody"><p class="muted">載入中…</p></article>
      <p class="src-note mt-3">本文轉載自<strong>海峰棋院</strong>　·　<a href="{source_url}">閱讀海峰棋院原文</a></p>
      <div class="article-foot">
        <a class="btn btn-ghost" href="../index.html">← 回最新消息</a>
      </div>
      <div class="article-more" id="artMoreBox" hidden>
        <h2 class="article-more__title">其他消息</h2>
        <div id="artMore"></div>
      </div>
    </div>
  </div>
</section>

<div id="site-footer"></div>
<script src="../../assets/js/content.js"></script>
<script src="../../assets/js/site.js" defer></script>
<script src="../../assets/js/article.js"></script>
</body>
</html>
"""


def write_page(site, a):
    """文章頁。每次執行都重寫，版面改了舊文章才會跟著更新。"""
    img = ''
    for u in a.get('images') or []:
        # 直式海報當縮圖會被裁得很奇怪，但第一張通常就是封面照，照順序取
        img = u
        break
    d = html.escape(a.get('date') or '', quote=True)
    out = PAGE.format(
        id=a['id'],
        title=html.escape(a.get('title') or '最新消息', quote=True),
        excerpt=html.escape(a.get('excerpt') or '', quote=True),
        cat=html.escape(a.get('cat') or '', quote=True),
        cat_label=html.escape(a.get('catLabel') or '消息', quote=True),
        date=d,
        shown_date=d.replace('-', '.'),
        image=html.escape(img or SHARE_IMG, quote=True),
        source_url=html.escape(a.get('source_url') or (HAIFONG + '/news/content/' + a['id']),
                               quote=True),
        page_url=SITE_URL + 'news/p/' + a['id'],
    )
    page_dir = os.path.join(site, 'news', 'p')
    os.makedirs(page_dir, exist_ok=True)
    path = os.path.join(page_dir, a['id'] + '.html')
    old = load_text(path)
    if old != out:                       # 沒變就不要動檔案，才不會每天都產生一筆提交
        with io.open(path, 'w', encoding='utf-8', newline='') as f:
            f.write(out)
        return True
    return False


def load_text(path):
    if os.path.exists(path):
        with io.open(path, encoding='utf-8', newline='') as f:
            return f.read()
    return None


# ---------------- 主程式 ----------------
class Refused(Exception):
    pass


def get(url):
    req = urllib.request.Request(url, headers=UA)
    try:
        return urllib.request.urlopen(req, timeout=40).read().decode('utf-8', 'replace')
    except urllib.error.HTTPError as e:
        if e.code in (403, 429, 503):
            raise Refused(e.code)
        raise


def load(path, default):
    if os.path.exists(path):
        with io.open(path, encoding='utf-8') as f:
            return json.load(f)
    return default


def save(path, obj):
    tmp = path + '.tmp'
    with io.open(tmp, 'w', encoding='utf-8') as f:
        json.dump(obj, f, ensure_ascii=False, indent=1)
    os.replace(tmp, path)


def main():
    site = sys.argv[1] if len(sys.argv) > 1 and not sys.argv[1].startswith('--') else 'site'
    limit = MAX_PER_RUN
    if '--max' in sys.argv:
        limit = max(0, min(30, int(sys.argv[sys.argv.index('--max') + 1])))

    data = os.path.join(site, 'assets', 'data')
    out_dir = os.path.join(data, 'articles')
    os.makedirs(out_dir, exist_ok=True)
    failed_path = os.path.join(out_dir, '_failed.json')
    failed = load(failed_path, {})

    news_path = os.path.join(data, 'news.json')
    news = load(news_path, {})
    items = news.get('items') or []

    def mark_local(saved_ids):
        changed = False
        for it in items:
            want = it.get('id') in saved_ids
            if bool(it.get('local')) != want:
                if want:
                    it['local'] = True
                else:
                    it.pop('local', None)
                changed = True
        if changed:
            save(news_path, news)
    todo = [i for i in items
            if ID_RE.fullmatch(i.get('id') or '')
            and not os.path.exists(os.path.join(out_dir, i['id'] + '.json'))
            and failed.get(i['id'], 0) < MAX_TRIES]
    todo.sort(key=lambda i: i.get('date') or '', reverse=True)
    print('已轉存 %d 篇；尚未轉存 %d 篇，這次讀 %d 篇'
          % (len(items) - len(todo), len(todo), min(limit, len(todo))))

    ok = bad = 0
    stopped = None
    today = datetime.date.today().isoformat()
    for n, item in enumerate(todo[:limit]):
        if n:
            time.sleep(PAUSE)
        # 網址自己組，不直接用清單裡的，確保只會讀海峰的新聞頁
        url = HAIFONG + '/news/content/' + item['id']
        try:
            got = parse(get(url))
        except Refused as e:
            stopped = e.args[0]
            break
        except Exception as e:
            got = None
            print('  讀取失敗：%s（%s）' % (item.get('title', '')[:30], type(e).__name__))
        if not got:
            failed[item['id']] = failed.get(item['id'], 0) + 1
            bad += 1
            continue
        title, body, images = got
        save(os.path.join(out_dir, item['id'] + '.json'), {
            'id': item['id'],
            'date': item.get('date') or '',
            'cat': item.get('cat') or 'notice',
            'catLabel': item.get('catLabel') or '',
            'title': item.get('title') or title,
            'source_url': url,
            'fetched': today,
            'excerpt': plain(body),
            'images': images,
            'html': body,
        })
        failed.pop(item['id'], None)
        ok += 1
        print('  ✓ %s　%s（%d 張圖）' % (item.get('date'), (item.get('title') or title)[:30], len(images)))

    save(failed_path, failed)

    # 每天重建所有文章頁，並把「已轉存」標記寫回 news.json，
    # 讓最新消息、首頁、花絮的連結知道哪幾篇可以留在官網看。
    pages = 0
    saved_ids = set()
    for item in items:
        path = os.path.join(out_dir, (item.get('id') or '') + '.json')
        if not os.path.exists(path):
            continue
        saved_ids.add(item['id'])
        if write_page(site, load(path, {})):
            pages += 1
    mark_local(saved_ids)

    print('完成：轉存 %d 篇，失敗 %d 篇；文章頁更新 %d 頁，已轉存共 %d 篇。'
          % (ok, bad, pages, len(saved_ids)))

    if stopped:
        sys.exit('海峰回應 %s（暫時拒絕連線），這批先停，明天再繼續。' % stopped)
    # 一篇都沒成功、又失敗好幾篇，多半是海峰改版、解析規則失效
    if bad >= 3 and not ok:
        sys.exit('連續 %d 篇都讀不到內文，海峰的文章頁可能改版了，請檢查 parse()。' % bad)


if __name__ == '__main__':
    main()
