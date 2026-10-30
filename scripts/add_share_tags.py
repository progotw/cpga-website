"""
幫公開頁面補上分享標籤（Open Graph）。

貼網址到 LINE、Facebook 時，對方的機器人會讀這些標籤來決定顯示的標題、
說明與縮圖。沒有這些標籤，貼出去就只有一行光禿禿的網址。

一次性工具，改好就寫回原檔；已經有標籤的頁面會跳過。
後台與職業棋士專區不處理：那些頁面不會、也不該被分享出去。

文章頁（news/p/<id>.html）的標籤由 scripts/fetch_articles.py 產生，
每篇都有自己的標題、摘要與照片，不經過這支程式。
"""
import io, os, re, sys

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

SITE_NAME = '中華職業圍棋協會'
BASE = 'https://cpga.org.tw/'
SHARE_IMG = BASE + 'assets/img/share.jpg'
SKIP_DIRS = ('admin', 'member')


def page_url(rel):
    """site/events/rules.html → https://cpga.org.tw/events/rules
       站台會把 .html 與 index 去掉，網址要跟著一樣，否則分享出去的連結
       與實際網址不同，機器人取回的內容也會對不上。"""
    rel = rel.replace(os.sep, '/')
    rel = re.sub(r'(^|/)index\.html$', r'\1', rel)
    rel = re.sub(r'\.html$', '', rel)
    return BASE + rel


def tags(title, desc, url):
    out = [
        ('og:type', 'website'),
        ('og:site_name', SITE_NAME),
        ('og:title', title),
        ('og:description', desc),
        ('og:url', url),
        ('og:image', SHARE_IMG),
        ('og:locale', 'zh_TW'),
    ]
    lines = ['<meta property="%s" content="%s">' % (k, v.replace('"', '&quot;')) for k, v in out]
    lines.append('<meta name="twitter:card" content="summary_large_image">')
    return '\n'.join(lines)


def main():
    site = sys.argv[1] if len(sys.argv) > 1 else 'site'
    done = skipped = 0
    for root, dirs, files in os.walk(site):
        dirs[:] = [d for d in dirs if d not in SKIP_DIRS]
        for name in sorted(files):
            if not name.endswith('.html'):
                continue
            path = os.path.join(root, name)
            t = io.open(path, encoding='utf-8', newline='').read()
            if 'og:title' in t:
                skipped += 1
                continue
            crlf = '\r\n' in t
            t = t.replace('\r\n', '\n')

            mt = re.search(r'(?is)<title>(.*?)</title>', t)
            md = re.search(r'(?is)<meta name="description" content="(.*?)">', t)
            if not mt or not md:
                print('  跳過（缺標題或說明）：' + path)
                continue
            url = page_url(os.path.relpath(path, site))
            block = tags(mt.group(1).strip(), md.group(1).strip(), url)
            t = t.replace(md.group(0), md.group(0) + '\n' + block, 1)

            io.open(path, 'w', encoding='utf-8', newline='').write(
                t.replace('\n', '\r\n') if crlf else t)
            done += 1
            print('  ✓ ' + url)
    print('完成：新增 %d 頁，略過 %d 頁（已有標籤）。' % (done, skipped))


if __name__ == '__main__':
    main()
