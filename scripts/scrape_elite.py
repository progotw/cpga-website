"""
從 haifong.org/elite 抓取精銳隊名單，輸出成網站用的 elite.json。

只存分組、姓名與職稱；段位、照片與介紹頁由 players.json 依姓名帶入，
與網站其餘資料的處理方式一致，避免同一份資料維護兩次。
"""
import urllib.request, re, json, time, sys, html, io, datetime

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

URL = 'https://www.haifong.org/elite'
UA = {'User-Agent': 'Mozilla/5.0 (compatible; CPGA-site-builder/1.0)'}

# 資料異常就中止，不要用壞資料覆蓋好資料。
# 2026 年為 2 位教練 + 8 位精英 + 7 位新銳 = 17 人，門檻抓寬一點以容納名單增減。
MIN_MEMBERS = 8

RANK = r'(?:初段|[二三四五六七八九]段)'


def get(url, tries=3):
    for i in range(tries):
        try:
            req = urllib.request.Request(url, headers=UA)
            return urllib.request.urlopen(req, timeout=40).read().decode('utf-8', 'replace')
        except Exception:
            if i == tries - 1:
                raise
            time.sleep(2)


def text_of(s):
    """去標籤、解實體、收斂空白。"""
    s = re.sub(r'(?s)<[^>]+>', ' ', s)
    return re.sub(r'\s+', ' ', html.unescape(s)).strip()


page = get(URL)

# 頁面把成員資訊放在標籤之間，直接取純文字後以「姓名＋職稱＋段位」的順序解析，
# 比硬套 class 名稱耐改版。
body = re.sub(r'(?is)<(script|style)[^>]*>.*?</\1>', ' ', page)
flat = re.sub(r'(?i)<br\s*/?>', '\n', body)
flat = re.sub(r'(?i)</(p|li|div|h\d|td|tr|span)>', '\n', flat)
lines = [text_of(l) for l in flat.split('\n')]
lines = [l for l in lines if l]

# 只看「教練團」到頁尾合作廠商之間的區段，避開導覽列與頁尾
try:
    start = next(i for i, l in enumerate(lines) if l == '教練團')
except StopIteration:
    sys.exit('中止：找不到「教練團」段落，原站可能已改版，既有資料未被覆蓋。')
end = next((i for i, l in enumerate(lines[start:], start) if '合作廠商' in l), len(lines))
seg = lines[start:end]

GROUPS = {'教練團': '教練團', '精英隊': '精英隊', '新銳隊': '新銳隊'}

# 成員以兩行呈現：姓名一行，接著是段位行。教練的職稱與段位在同一行
# （原站以定位字元分隔，例如「總教練		七段」），所以職稱要從段位行的前綴取。
RANK_LINE = re.compile(r'^(.*?)\s*(' + RANK + r')$')

groups, cur = [], None
for i, line in enumerate(seg):
    if line in GROUPS:
        cur = {'title': GROUPS[line], 'members': []}
        groups.append(cur)
        continue
    if cur is None:
        continue
    m = RANK_LINE.fullmatch(line)
    if not m:
        continue
    role = m.group(1).strip() or None
    name = seg[i - 1] if i else ''
    if not (2 <= len(name) <= 4) or name in GROUPS or RANK_LINE.fullmatch(name):
        continue
    cur['members'].append({'name': name, 'role': role} if role else {'name': name})

groups = [g for g in groups if g['members']]
total = sum(len(g['members']) for g in groups)

if total < MIN_MEMBERS:
    sys.exit(f'中止：只解析到 {total} 位成員（門檻 {MIN_MEMBERS}）。'
             f'原站可能已改版，既有資料未被覆蓋。')

# 年度標題，例如「2026 精銳隊」
m = re.search(r'(20\d{2})\s*精銳隊', text_of(page))
year = m.group(1) if m else ''

out = {
    'schema_version': 1,
    'generated': datetime.datetime.now().astimezone().isoformat(timespec='seconds'),
    'source': '海峰棋院 精銳隊',
    'source_url': URL,
    'year': year,
    'count': total,
    'groups': groups,
}

dest = sys.argv[1] if len(sys.argv) > 1 else 'elite.json'
with open(dest, 'w', encoding='utf-8') as f:
    json.dump(out, f, ensure_ascii=False, indent=1)

print(f'完成：{year} 精銳隊 {total} 位 → {dest}')
for g in groups:
    names = '、'.join((m['name'] + (f"（{m['role']}）" if m.get('role') else '')) for m in g['members'])
    print(f'  {g["title"]}（{len(g["members"])}）：{names}')
