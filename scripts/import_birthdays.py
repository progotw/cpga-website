"""
把協會 Excel 裡的棋士生日轉成 SQL，寫到 private/birthdays.sql。

用法（只在秘書處的電腦上跑）：
    python scripts/import_birthdays.py "C:\\Users\\user\\Desktop\\職業棋士專用報名表格.xlsx"

讀第一個工作表：B 欄姓名、F 欄生日（YYYYMMDD）。
月日寫 0000 的（只知道年份）存成 birth_year，birth_date 留空。

產出的 SQL 含建表語句（同 supabase/schema_birthdays.sql）與所有資料，
可重複執行。private/ 已排除於版控——這個 repo 是公開的，生日是個資。
"""
import io, os, re, sys, json, zipfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ROSTER = os.path.join(ROOT, 'site', 'assets', 'data', 'players.json')
SCHEMA = os.path.join(ROOT, 'supabase', 'schema_birthdays.sql')
OUT = os.path.join(ROOT, 'private', 'birthdays.sql')

CELL = re.compile(r'<c r="([A-Z]+)(\d+)"([^>]*?)(?:/>|>(.*?)</c>)', re.S)


def main():
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    z = zipfile.ZipFile(sys.argv[1])
    shared = [re.sub(r'<[^>]+>', '', s) for s in re.findall(
        r'<si>(.*?)</si>', z.read('xl/sharedStrings.xml').decode('utf-8', 'ignore'), re.S)]
    xml = z.read('xl/worksheets/sheet1.xml').decode('utf-8', 'ignore')

    roster = {p['name']: p['id'] for p in
              json.load(io.open(ROSTER, encoding='utf-8'))['players']}

    recs, unknown, bad = [], [], []
    for rnum, body in re.findall(r'<row[^>]*r="(\d+)"[^>]*>(.*?)</row>', xml, re.S):
        if rnum == '1':
            continue
        cells = {}
        for col, _r, attrs, inner in CELL.findall(body):
            m = re.search(r'<v>(.*?)</v>', inner or '', re.S)
            v = m.group(1) if m else ''
            if v and 't="s"' in attrs and v.isdigit():
                v = shared[int(v)]
            cells[col] = v
        name = (cells.get('B') or '').strip()
        raw = (cells.get('F') or '').strip()
        if not name:
            continue
        if name not in roster:
            unknown.append(name)
            continue
        m = re.fullmatch(r'(\d{4})(\d{2})(\d{2})', raw)
        if not m:
            bad.append('%s：%s' % (name, raw or '（空白）'))
            continue
        y, mo, d = m.groups()
        date = None if mo == '00' or d == '00' else '%s-%s-%s' % (y, mo, d)
        recs.append((roster[name], name, int(y), date))

    q = lambda s: "'" + s.replace("'", "''") + "'"
    schema = io.open(SCHEMA, encoding='utf-8').read()
    lines = [
        '-- 棋士生日（由協會 Excel 轉出，個資，請勿外流）。可重複執行。',
        schema,
        'begin;',
        'delete from public.player_birthdays;',
        'insert into public.player_birthdays (player_id, birth_year, birth_date) values',
    ]
    vals = ['  (%s, %d, %s)' % (q(pid), y, q(dt) if dt else 'null') for pid, _n, y, dt in recs]
    lines.append(',\n'.join(vals) + ';')
    lines += [
        'commit;',
        '',
        '-- 驗收',
        'select count(*) as 人數, count(birth_date) as 有完整日期 from public.player_birthdays;',
    ]
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    io.open(OUT, 'w', encoding='utf-8').write('\n'.join(lines) + '\n')

    roster_missing = sorted(set(roster) - {n for _p, n, _y, _d in recs})
    print('寫入 %d 人（完整日期 %d、只有年份 %d）'
          % (len(recs), sum(1 for r in recs if r[3]), sum(1 for r in recs if not r[3])))
    print('只有年份：%s' % ('、'.join(n for _p, n, _y, d in recs if not d) or '無'))
    print('Excel 有、名錄沒有：%s' % ('、'.join(unknown) or '無'))
    print('生日格式無法辨識：%s' % ('；'.join(bad) or '無'))
    print('名錄有、Excel 沒有：%s' % ('、'.join(roster_missing) or '無'))
    print('已寫出 %s' % OUT)


if __name__ == '__main__':
    main()
