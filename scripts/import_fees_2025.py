"""
把協會自己用 Excel 算的 2025 年對局費，轉成可貼進 Supabase 的 SQL。

用法（只在秘書處的電腦上跑，產出的檔案含所有棋士的金額）：
    python scripts/import_fees_2025.py "D:\\2025比賽資料\\2025對局費計算.xlsx"

產出 private/fees_2025.sql。private/ 已排除於版控——這個 repo 是公開的，
金額絕對不能進 git。貼到 Supabase 的 SQL Editor 執行即可，可重複執行。

=== 為什麼要這支 ===

2026 年起對局費由海峰系統發布、每天自動抓（fetch_fees.py）。
2025 年以前只有 Excel，系統裡沒有，報名名單就無法依「前一年對局費」排序。

=== 對應方式 ===

讀「總獎金」工作表。Excel 的欄位分組剛好與海峰系統一致：
    E–N  採計（名人、棋王、天元…世界賽）
    Q–T  女子
    X–AC 限制（新人王、龍星賽…業餘賽）
總額 C ＝ 採計小計 O ＋ 女子各欄 ＋ 限制小計 AD。

每一列都會驗算「各賽事加總 ＝ 總額」，對不上的整列不匯入並列出來。
只匯入名錄裡有的棋士（外籍、業餘參賽者略過）、且金額大於 0 的
——與海峰發布版的慣例一致：沒有對局費的棋士不會出現。
"""
import io, os, re, sys, json, zipfile

YEAR = 2025
# 檔案最後修改日。職業棋士專區會顯示「院方發布」日期，用這天表示這份是何時定案的。
PUBLISHED = '2026-01-05T00:00:00+08:00'

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ROSTER = os.path.join(ROOT, 'site', 'assets', 'data', 'players.json')
OUT = os.path.join(ROOT, 'private', 'fees_%d.sql' % YEAR)

GROUPS = [
    ('採計', ['E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N']),
    ('女子', ['Q', 'R', 'S', 'T']),
    ('限制', ['X', 'Y', 'Z', 'AA', 'AB', 'AC']),
]

CELL = re.compile(r'<c r="([A-Z]+)(\d+)"([^>]*?)(?:/>|>(.*?)</c>)', re.S)


def read(xlsx):
    z = zipfile.ZipFile(xlsx)
    shared = [re.sub(r'<[^>]+>', '', s) for s in re.findall(
        r'<si>(.*?)</si>', z.read('xl/sharedStrings.xml').decode('utf-8', 'ignore'), re.S)]
    rels = dict(re.findall(r'Id="([^"]+)"[^>]*Target="(worksheets/[^"]+)"',
                           z.read('xl/_rels/workbook.xml.rels').decode('utf-8', 'ignore')))
    sheets = re.findall(r'<sheet name="([^"]+)"[^>]*r:id="([^"]+)"',
                        z.read('xl/workbook.xml').decode('utf-8', 'ignore'))
    name, rid = sheets[0]
    if name != '總獎金':
        sys.exit('中止：第一個工作表應為「總獎金」，實際是「%s」' % name)
    xml = z.read('xl/' + rels[rid]).decode('utf-8', 'ignore')

    rows = {}
    for rnum, body in re.findall(r'<row[^>]*r="(\d+)"[^>]*>(.*?)</row>', xml, re.S):
        cells = {}
        for col, _r, attrs, inner in CELL.findall(body):
            inner = inner or ''
            # 公式格的計算結果存在 <v>；<f> 只是公式本身
            m = re.search(r'<v>(.*?)</v>', inner, re.S)
            v = m.group(1) if m else ''
            f = re.search(r'<f[^>]*>([^<]*)</f>', inner)
            if v and 't="s"' in attrs and v.isdigit():
                v = shared[int(v)]
            cells[col] = (v, f.group(1) if f else '')
        rows[int(rnum)] = cells
    return rows


def num(cell):
    try:
        return int(round(float(cell[0]))) if cell and cell[0] != '' else 0
    except ValueError:
        return 0


def main():
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    rows = read(sys.argv[1])
    head = rows[1]

    # 賽事名稱：優先用公式指向的工作表名（標題欄有縮寫，例如「快棋爭霸」）
    label = {}
    for _g, cols in GROUPS:
        for c in cols:
            title = head.get(c, ('', ''))[0]
            src = rows.get(2, {}).get(c, ('', ''))[1]
            m = re.match(r"'?([^'!]+)'?!", src)
            label[c] = (m.group(1) if m else title) or c

    roster = {p['name']: p['id'] for p in
              json.load(io.open(ROSTER, encoding='utf-8'))['players']}

    out, skipped, bad = [], [], []
    for r in sorted(rows):
        if r == 1:
            continue
        c = rows[r]
        name = (c.get('B', ('', ''))[0] or '').strip()
        total = num(c.get('C'))
        if not name or total <= 0:
            continue
        if name not in roster:
            skipped.append(name)
            continue

        events, s = [], 0
        for group, cols in GROUPS:
            for col in cols:
                amt = num(c.get(col))
                if amt:
                    events.append({'event': label[col], 'group': group,
                                   'subtotal': amt, 'items': []})
                    s += amt
        if s != total:
            bad.append('%s：各賽事合計 %s，總額 %s' % (name, format(s, ','), format(total, ',')))
            continue
        out.append((roster[name], name, total, events))

    if bad:
        print('以下棋士的各賽事加總與總額不符，未匯入：')
        for b in bad:
            print('  ' + b)

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    q = lambda s: "'" + s.replace("'", "''") + "'"
    lines = [
        '-- %d 年對局費（由協會 Excel 轉出，含所有棋士金額，請勿外流）' % YEAR,
        '-- 可重複執行：先清掉 %d 年再寫入。不影響其他年度。' % YEAR,
        'begin;',
        'delete from public.player_fees where year = %d;' % YEAR,
        'insert into public.player_fees (player_id, year, total, events, published_at) values',
    ]
    vals = ['  (%s, %d, %d, %s::jsonb, %s)  -- %s' % (
        q(pid), YEAR, total, q(json.dumps(ev, ensure_ascii=False)), q(PUBLISHED), name)
        for pid, name, total, ev in out]
    # 最後一列不能有逗號；註解要放在逗號後面
    vals = [v.replace('  -- ', ',  -- ', 1) if i < len(vals) - 1 else v
            for i, v in enumerate(vals)]
    lines += vals
    lines[-1] = lines[-1].replace('  -- ', ';  -- ', 1)
    lines += [
        'commit;',
        '',
        '-- 驗收：人數與總額要與 Excel 一致',
        'select count(*) as 人數, sum(total) as 合計 from public.player_fees where year = %d;' % YEAR,
    ]
    io.open(OUT, 'w', encoding='utf-8').write('\n'.join(lines) + '\n')

    print('匯入 %d 人，合計 %s 元' % (len(out), format(sum(t for _, _, t, _ in out), ',')))
    print('名錄沒有、略過：%s' % ('、'.join(skipped) or '無'))
    print('已寫出 %s' % OUT)


if __name__ == '__main__':
    main()
