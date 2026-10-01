"""
把站上既有的條文 HTML 轉成 Markdown，作為後台編輯的來源。

一次性的搬家工具。只處理本站條文實際用到的標籤，不是通用轉換器。

用 HTMLParser 建樹而非正則：條文有巢狀清單（<ol> 裡包 <ul>），
正則比對結束標籤時會停在內層的 </ul>，整段內容會憑空消失。

用法：
    python scripts/html_to_md.py <html 檔> <起始標記> <結束標記> > content/xxx.md
"""
import sys, io, re, html as htmllib
from html.parser import HTMLParser

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

VOID = {'br', 'hr', 'img', 'input', 'meta', 'link'}


class Node:
    def __init__(self, tag, attrs=None):
        self.tag = tag
        self.attrs = dict(attrs or [])
        self.kids = []


class Tree(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.root = Node('#root')
        self.stack = [self.root]

    def handle_starttag(self, tag, attrs):
        n = Node(tag, attrs)
        self.stack[-1].kids.append(n)
        if tag not in VOID:
            self.stack.append(n)

    def handle_endtag(self, tag):
        for i in range(len(self.stack) - 1, 0, -1):
            if self.stack[i].tag == tag:
                del self.stack[i:]
                return

    def handle_data(self, data):
        self.stack[-1].kids.append(data)


def inline(node):
    """行內內容 → Markdown 片段。"""
    out = []
    for k in node.kids:
        if isinstance(k, str):
            out.append(k)
            continue
        t = k.tag
        if t == 'br':
            out.append('\n')
        elif t in ('strong', 'b'):
            out.append('**' + inline(k).strip() + '**')
        elif t in ('em', 'i'):
            out.append('*' + inline(k).strip() + '*')
        elif t == 'code':
            out.append('`' + inline(k).strip() + '`')
        elif t == 'a':
            out.append('[' + inline(k).strip() + '](' + k.attrs.get('href', '') + ')')
        else:
            out.append(inline(k))
    s = ''.join(out)
    # HTML 裡的縮排換行只是排版，壓成空白；<br> 轉出的真換行保留
    lines = [re.sub(r'[ \t]+', ' ', l).strip() for l in s.split('\n')]
    return '\n'.join(l for l in lines if l)


def list_md(node, depth=0):
    ordered = node.tag == 'ol'
    out, i = [], 0
    for li in [k for k in node.kids if not isinstance(k, str) and k.tag == 'li']:
        i += 1
        subs = [k for k in li.kids if not isinstance(k, str) and k.tag in ('ul', 'ol')]
        own = Node('li')
        own.kids = [k for k in li.kids
                    if isinstance(k, str) or k.tag not in ('ul', 'ol')]
        # 用 4 空格：有序清單的項目內容從第 3 欄起算，2 空格不足以構成巢狀，
        # Markdown 會把子清單併進上一項的文字裡
        pad = '    ' * depth
        bullet = ('%d. ' % i) if ordered else '- '
        text = inline(own)
        out.append(pad + bullet + text.replace('\n', '\n' + pad + '    '))
        for s in subs:
            out.append(list_md(s, depth + 1))
    return '\n'.join(out)


def table_md(node):
    rows = []
    def walk(n):
        for k in n.kids:
            if isinstance(k, str):
                continue
            if k.tag == 'tr':
                rows.append(k)
            else:
                walk(k)
    walk(node)

    out, header_done = [], False
    for r in rows:
        cells = []
        for c in [k for k in r.kids if not isinstance(k, str) and k.tag in ('td', 'th')]:
            cells.append(inline(c).replace('\n', ' ').replace('|', '\\|'))
        out.append('| ' + ' | '.join(cells) + ' |')
        if not header_done:
            out.append('| ' + ' | '.join(['---'] * len(cells)) + ' |')
            header_done = True
    return '\n'.join(out)


def convert(node, parts):
    for k in node.kids:
        if isinstance(k, str):
            continue
        t, cls = k.tag, k.attrs.get('class', '')
        if t in ('h2', 'h3', 'h4'):
            # 保留原有的 id：頁內目錄靠它跳轉，交給 Markdown 自動產生會變成
            # _1、_2 這種流水號（中文標題無法轉成有意義的 slug），錨點全部失效
            anchor = (' {#%s}' % k.attrs['id']) if k.attrs.get('id') else ''
            parts.append('#' * int(t[1]) + ' ' + inline(k) + anchor)
        elif t == 'p':
            s = inline(k)
            if s:
                parts.append(s)
        elif t in ('ul', 'ol'):
            parts.append(list_md(k))
        elif t == 'table':
            parts.append(table_md(k))
        elif t == 'div' and 'callout' in cls:
            s = inline(k)
            if s:
                parts.append('> ' + s.replace('\n', '\n> '))
        elif t == 'a':
            # 卡片裡的獨立連結（例如「規則全文 ↗」），不在段落內
            s = inline(k)
            if s:
                parts.append('[' + s + '](' + k.attrs.get('href', '') + ')')
        elif t in ('script', 'style'):
            continue
        else:
            convert(k, parts)
    return parts


if __name__ == '__main__':
    if len(sys.argv) < 4:
        sys.exit(__doc__)
    src, start, end = sys.argv[1], sys.argv[2], sys.argv[3]
    raw = io.open(src, encoding='utf-8').read()
    a = raw.index(start)
    b = raw.index(end, a)

    p = Tree()
    p.feed(raw[a:b])
    print('\n\n'.join(convert(p.root, [])) + '\n', end='')
