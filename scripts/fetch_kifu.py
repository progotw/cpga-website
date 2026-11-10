"""
抓取「哪一局對應哪一份 HiGO 棋譜」的對照表，輸出成網站用的 kifu.json。

成績資料（Firestore results/y{年}）每一局只有固定 9 格，沒有棋譜編號——
我們 2026-11-04 請對方加第 10 格，對方改用另一種做法：另外跑一支程式，
以「年份｜日期｜黑方｜白方」把每一局配到 HiGO 圍棋的公開棋譜，
結果放在他的 GitHub Pages（results/higo.json），成績查詢頁讀那一份來顯示「棋譜」欄。

官網照樣不去對方的網站即時讀：
  1. 每天在 CI 抓一份下來放進 site/assets/data/kifu.json，網頁讀自己網域的檔案。
     對方的站台掛掉、改路徑或被動手腳，官網都不受影響（最多就是停在前一天的對照表）。
  2. 只留最近幾年。完整檔案近萬筆、400KB 以上，但官網只在「我的成績」
     列今年與去年的對局，沒必要讓每位棋士每次都下載十年份。

輸出格式與來源相同，網頁端直接查：
  { "url": "https://www.higohigo.org/#/kifu/",
    "map": { "2026|11.09|王元均|鄭予皓": [43278], ... } }
"""
import urllib.request, json, sys, io, datetime

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

URL = 'https://milu891212-milu.github.io/qisai-schedule-web/results/higo.json'
UA = {'User-Agent': 'CPGA-site-builder/1.1 (+https://cpga.org.tw; CPGA official site data sync)'}

# 預設留今年與前兩年：「我的成績」只列今年與去年，升段進度最多再往前翻一兩年。
YEARS = 3

# 資料異常就中止，不要用壞資料覆蓋好資料。
# 2026-11-10 時最近三年約有 3000 筆，門檻抓寬一點。
MIN_ENTRIES = 300


def main():
    dest = sys.argv[1] if len(sys.argv) > 1 else 'kifu.json'
    years = int(sys.argv[2]) if len(sys.argv) > 2 else YEARS

    req = urllib.request.Request(URL, headers=UA)
    raw = urllib.request.urlopen(req, timeout=60).read().decode('utf-8', 'replace')
    src = json.loads(raw)

    full = src.get('map')
    if not isinstance(full, dict) or not full:
        sys.exit('中止：來源沒有 map 欄位，格式可能改了，既有資料未被覆蓋。')

    now = datetime.datetime.now().astimezone().year
    keep = {str(y) for y in range(now - years + 1, now + 1)}

    # 鍵是「年份|日期|黑|白」，年份在第一段
    out_map = {k: v for k, v in full.items() if k.split('|', 1)[0] in keep}

    if len(out_map) < MIN_ENTRIES:
        sys.exit(f'中止：{"、".join(sorted(keep))} 只配到 {len(out_map)} 局'
                 f'（門檻 {MIN_ENTRIES}）。來源可能有問題，既有資料未被覆蓋。')

    out = {
        'schema_version': 1,
        'generated': datetime.datetime.now().astimezone().isoformat(timespec='seconds'),
        'source': '棋賽賽程操作台 results/higo.json（以日期與雙方姓名配對 HiGO 公開棋譜）',
        'source_url': URL,
        'source_generated': src.get('generated', ''),
        'years': sorted(keep),
        'count': len(out_map),
        'url': src.get('url') or 'https://www.higohigo.org/#/kifu/',
        # 排序過才不會每天因為鍵的順序變動而產生假的差異
        'map': {k: out_map[k] for k in sorted(out_map)},
    }

    with open(dest, 'w', encoding='utf-8') as f:
        json.dump(out, f, ensure_ascii=False, separators=(',', ':'))

    print(f'完成：{len(out_map)} 局有棋譜（{"、".join(sorted(keep))}）→ {dest}')
    print(f'  來源產生時間 {src.get("generated", "?")}，'
          f'全部年度共 {len(full)} 局、HiGO 棋譜 {src.get("higoCount", "?")} 份')


main()
