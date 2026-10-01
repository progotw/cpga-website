"""
把條文類內容的 Markdown 轉成網站用的 HTML，輸出 site/assets/data/<key>.json。

公開頁面直接注入轉好的 HTML，瀏覽器端不載入任何 Markdown 函式庫——
少一個外部相依，也省掉解析成本與版面跳動。

用法：
    python scripts/render_content.py <key> <markdown 檔> [輸出目錄]

發布流程（GitHub Action）會改以資料庫內容為輸入呼叫同一支 render()。
"""
import sys, io, json, os, re
import markdown

# 條文會用到的：表格、換行、標題 id（供頁內目錄跳轉）
EXTENSIONS = ['tables', 'sane_lists', 'attr_list', 'toc']

# 只允許排版用的標籤。條文不需要 script/style/iframe，一律剝除。
ALLOWED = re.compile(
    r'</?(?:h[1-6]|p|br|hr|strong|b|em|i|u|s|sub|sup|span|a|ul|ol|li|dl|dt|dd|'
    r'table|thead|tbody|tr|th|td|blockquote|code|pre)\b[^>]*>',
    re.I)


def sanitize(html):
    """移除不在白名單內的標籤與所有事件屬性。"""
    html = re.sub(r'(?is)<(script|style|iframe|object|embed)[^>]*>.*?</\1>', '', html)
    html = re.sub(r'(?i)\son\w+\s*=\s*"[^"]*"', '', html)
    html = re.sub(r"(?i)\son\w+\s*=\s*'[^']*'", '', html)
    html = re.sub(r'(?i)(href|src)\s*=\s*"\s*javascript:[^"]*"', 'href="#"', html)

    def keep(m):
        return m.group(0) if ALLOWED.match(m.group(0)) else ''
    return re.sub(r'</?[a-zA-Z][^>]*>', keep, html)


def render(md_text):
    """Markdown → 可直接注入的 HTML。表格額外包一層橫向捲動容器。"""
    html = markdown.markdown(md_text, extensions=EXTENSIONS, output_format='html')
    html = sanitize(html)
    # 窄螢幕上表格要能橫向捲動，與站上其他表格一致
    html = re.sub(r'<table>', '<div class="table-wrap"><table class="table">', html)
    html = html.replace('</table>', '</table></div>')
    return html


def payload_for(md_text):
    """條文 JSON 的內容。發布流程（export_content.py）也用這支，
    兩邊必須產生完全相同的結果，否則交替執行會不斷產生差異。"""
    return {
        '_說明': '條文內容。markdown 為編輯來源，html 為轉換後供頁面注入的結果，'
                 '請勿手動改 html。',
        'schema_version': 1,
        'markdown': md_text,
        'html': render(md_text),
    }


def write(key, md_text, out_dir='site/assets/data'):
    payload = payload_for(md_text)

    os.makedirs(out_dir, exist_ok=True)
    path = os.path.join(out_dir, key + '.json')
    with io.open(path, 'w', encoding='utf-8') as f:
        json.dump(payload, f, ensure_ascii=False, indent=1)
    return path, payload


if __name__ == '__main__':
    # 只在直接執行時換 stdout。被匯入時若也換，會把呼叫端的包裝器關掉，
    # 之後呼叫端的 print 全部拋 ValueError: I/O operation on closed file。
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

    if len(sys.argv) < 3:
        sys.exit(__doc__)
    key, src = sys.argv[1], sys.argv[2]
    out_dir = sys.argv[3] if len(sys.argv) > 3 else 'site/assets/data'
    md_text = io.open(src, encoding='utf-8').read()
    path, payload = write(key, md_text, out_dir)
    print('%s → %s（Markdown %d 字，HTML %d 字）'
          % (src, path, len(md_text), len(payload['html'])))
