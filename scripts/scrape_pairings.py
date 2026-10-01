"""
從海峰的「抽籤結果公告」抓出每輪的對戰組合，輸出 site/assets/data/pairings.json。

棋士專區用這份資料顯示「我的賽程」：只列出該棋士接下來還要下的對局。
淘汰之後不會再有新的對戰組合，個人賽程自然就空了，不需要額外記錄輸贏。

資料來源是公告正文的純文字，格式大致如下（四種變體都見過，都能解析）：

    9/22(二)10:00資格賽對陣：
    徐銘均初段 vs 林聖弈三段
    9/29(二)10:00初賽(左半區)1回對陣：(上、下午各一局)
    林彥丞五段 vs (黃柏人初段 vs 柯沛辰初段)勝者

姓名後面黏著段位或頭銜（「盧奕銓新人王」），用棋士名錄做最長前綴比對切出來。

雙來源交叉比對：若設定了環境變數 PAIRINGS_FEED（指向賽程操作台輸出的
JSON，格式見 docs/賽程資料交換規格.md），會與公告解析的結果比對：

    兩邊一致            → 正常顯示
    只有一邊有          → 顯示，標示來源
    對手或日期不一致    → 不顯示，寫進 conflicts 供後台確認

最後一種是比對的主要理由：棋士會依這份資料安排當天行程，
顯示錯誤的對手或時間比顯示不足更嚴重。

用法：
    python scripts/scrape_pairings.py site
    PAIRINGS_FEED=https://… python scripts/scrape_pairings.py site
"""
import os, sys, io, re, json, time, html, datetime
import urllib.request, urllib.error

UA = {'User-Agent': 'Mozilla/5.0 (compatible; CPGA-site-builder/1.0)'}

# 解析不到任何對局就中止，不要用空資料覆蓋既有檔案
MIN_PAIRS = 10

DATE = re.compile(r'(\d{1,2})\s*/\s*(\d{1,2})')
TIME = re.compile(r'(\d{1,2}):(\d{2})')
VS = re.compile(r'^(.+?)\s*vs\.?\s*(.+)$', re.I)


def get(url, tries=3):
    for i in range(tries):
        try:
            req = urllib.request.Request(url, headers=UA)
            return urllib.request.urlopen(req, timeout=40).read().decode('utf-8', 'replace')
        except Exception:
            if i == tries - 1:
                raise
            time.sleep(2)


def body_lines(url):
    h = get(url)
    m = re.search(r'(?is)<div class="editor">(.*?)</div>\s*</div>', h)
    seg = m.group(1) if m else h
    seg = re.sub(r'(?is)<(script|style)[^>]*>.*?</\1>', ' ', seg)
    seg = re.sub(r'(?i)<br\s*/?>', '\n', seg)
    seg = re.sub(r'(?i)</(p|li|div|tr)>', '\n', seg)
    t = html.unescape(re.sub(r'(?s)<[^>]+>', '', seg))
    return [re.sub(r'\s+', ' ', l).strip() for l in t.split('\n') if l.strip()]


def make_matcher(players_path):
    names = sorted({p['name'] for p in json.load(
        io.open(players_path, encoding='utf-8'))['players']}, key=len, reverse=True)

    def match(raw):
        """切出棋士姓名。條件式對手「(A vs B)勝者」回傳 None，表示待定。"""
        s = raw.strip()
        if s.startswith('(') or s.startswith('（'):
            return None
        s = re.sub(r'^[（(]|[）)]\s*勝者$', '', s)
        for n in names:
            if s.startswith(n):
                return n
        return None

    return match


def resolve_year(month, day, announced):
    """公告只寫月/日。以公告日期的年份為基準，跨年時往後推一年。"""
    y = announced.year
    try:
        d = datetime.date(y, month, day)
    except ValueError:
        return None
    # 公告在 12 月、對局在 1 月 → 下一年
    if (announced.month - month) > 6:
        d = datetime.date(y + 1, month, day)
    # 公告在 1 月、對局在 12 月 → 上一年（補賽或延後公告）
    elif (month - announced.month) > 6:
        d = datetime.date(y - 1, month, day)
    return d


def merge(announced, feed):
    """合併兩個來源。以（日期, 棋士）為鍵比對對手；衝突者剔除並回報。

    只在兩邊都有同一位棋士同一天的對局時才算衝突——
    某一邊沒有資料是常態（公告沒貼、或操作台尚未輸入），不是錯誤。
    """
    def norm(p, source):
        return {
            'date': p.get('date', ''),
            'time': p.get('time', '') or '',
            'event': p.get('event', ''),
            'round': p.get('round', ''),
            'players': [x for x in (p.get('players') or []) if x],
            'pending_opponent': len([x for x in (p.get('players') or []) if x]) < 2,
            'winner': p.get('winner') or None,
            'source': source,
        }

    feed_rows = [norm(p, 'schedule-app') for p in feed if p.get('date')]
    ann_rows = [dict(p, source='announcement') for p in announced]

    # 索引：(日期, 棋士) → 對手
    def index(rows):
        ix = {}
        for r in rows:
            for i, n in enumerate(r['players']):
                opp = r['players'][1 - i] if len(r['players']) > 1 else None
                ix.setdefault((r['date'], n), []).append((opp, r))
        return ix

    ia, ifd = index(ann_rows), index(feed_rows)
    conflicts, bad_keys = [], set()

    for key in set(ia) & set(ifd):
        opps_a = {o for o, _ in ia[key] if o}
        opps_f = {o for o, _ in ifd[key] if o}
        if opps_a and opps_f and opps_a != opps_f:
            conflicts.append({
                'date': key[0], 'player': key[1],
                'announced': '、'.join(sorted(opps_a)),
                'feed': '、'.join(sorted(opps_f)),
            })
            bad_keys.add(key)

    def clean(rows):
        out = []
        for r in rows:
            if any((r['date'], n) in bad_keys for n in r['players']):
                continue
            out.append(r)
        return out

    # 操作台為上游，同一組對局以它為準；公告補足它沒有的
    merged, seen = [], set()
    for r in clean(feed_rows) + clean(ann_rows):
        k = (r['date'], r['time'], tuple(sorted(r['players'])))
        if k in seen:
            continue
        seen.add(k)
        merged.append(r)

    merged.sort(key=lambda p: (p['date'], p['time']))
    return merged, conflicts


def main():
    site = sys.argv[1] if len(sys.argv) > 1 else 'site'
    news_path = os.path.join(site, 'assets', 'data', 'news.json')
    players_path = os.path.join(site, 'assets', 'data', 'players.json')
    for p in (news_path, players_path):
        if not os.path.exists(p):
            sys.exit('中止：找不到 %s，請先執行其他抓取程式。' % p)

    match = make_matcher(players_path)
    news = json.load(io.open(news_path, encoding='utf-8'))
    items = news.get('items') or news.get('news') or []

    # 抽籤公告就在已抓取的最新消息裡，不必另外搜尋原站
    sources = [n for n in items if '抽籤' in (n.get('title') or '') and n.get('url')]
    print('最新消息中的抽籤公告：%d 則' % len(sources))
    if not sources:
        sys.exit('中止：news.json 裡找不到抽籤公告，無法產生對戰資料。')

    seen, pairs = set(), []

    for n in sources:
        announced = None
        try:
            announced = datetime.date.fromisoformat((n.get('date') or '')[:10])
        except Exception:
            announced = datetime.date.today()

        cur_date, cur_time, cur_round = None, '', ''
        found = 0
        for line in body_lines(n['url']):
            if '對陣' in line and DATE.search(line):
                d = DATE.search(line)
                cur_date = resolve_year(int(d.group(1)), int(d.group(2)), announced)
                tm = TIME.search(line)
                cur_time = ('%02d:%s' % (int(tm.group(1)), tm.group(2))) if tm else ''
                # 輪次：去掉日期、時間與標點後剩下的描述
                r = re.sub(r'\d{1,2}\s*/\s*\d{1,2}', '', line)
                r = re.sub(r'\(?\d{1,2}:\d{2}\)?', '', r)
                r = re.sub(r'[（(][^）)]*[）)]', '', r)
                cur_round = re.sub(r'[：:對陣\s]+$', '', r).strip('：: 　')
                continue

            if not cur_date:
                continue
            vm = VS.match(line)
            if not vm:
                continue

            a, b = match(vm.group(1)), match(vm.group(2))
            if not a and not b:
                continue
            key = (cur_date.isoformat(), cur_time, a or '', b or '')
            if key in seen:
                continue
            seen.add(key)
            pairs.append({
                'date': cur_date.isoformat(),
                'time': cur_time,
                'event': n.get('title', ''),
                'round': cur_round,
                'players': [x for x in (a, b) if x],
                'pending_opponent': not (a and b),
                'source': n['url'],
            })
            found += 1
        print('  %-52s %d 組' % ((n.get('title') or '')[:52], found))

    # ---- 第二來源（選配）----
    feed_url = os.environ.get('PAIRINGS_FEED', '').strip()
    conflicts = []
    if feed_url:
        try:
            feed = json.loads(get(feed_url))
            pairs, conflicts = merge(pairs, feed.get('pairings') or [])
            print('\n已與賽程操作台比對：合併後 %d 組，不一致 %d 組'
                  % (len(pairs), len(conflicts)))
            for c in conflicts[:10]:
                print('  ⚠ %s %s：公告「%s」／操作台「%s」'
                      % (c['date'], c['player'], c['announced'], c['feed']))
        except Exception as e:
            # 第二來源壞掉不該讓整份資料消失，退回只用公告
            print('\n第二來源讀取失敗，僅使用公告資料：%s' % e)

    if len(pairs) < MIN_PAIRS:
        sys.exit('中止：只解析到 %d 組對局（門檻 %d）。原站格式可能已改，既有資料未被覆蓋。'
                 % (len(pairs), MIN_PAIRS))

    pairs.sort(key=lambda p: (p['date'], p['time']))
    out = {
        '_說明': '各輪對戰組合，抓自海峰的抽籤結果公告，供棋士專區顯示個人賽程。'
                 'players 只列得以辨識的棋士；pending_opponent 為 true 表示對手尚未產生。',
        'schema_version': 1,
        'source': '海峰棋院 抽籤結果公告',
        'count': len(pairs),
        'pairings': pairs,
        'conflicts': conflicts,
    }
    dest = os.path.join(site, 'assets', 'data', 'pairings.json')
    with io.open(dest, 'w', encoding='utf-8') as f:
        json.dump(out, f, ensure_ascii=False, indent=1)
        f.write('\n')

    today = datetime.date.today().isoformat()
    future = [p for p in pairs if p['date'] >= today]
    print('\n完成：%d 組對局 → %s（其中 %d 組在今天之後）' % (len(pairs), dest, len(future)))


if __name__ == '__main__':
    # 只在直接執行時換 stdout。被匯入時若也換，會關掉呼叫端的輸出
    # （與 render_content.py 同一個坑）。
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
    main()
