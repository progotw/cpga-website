"""
從海峰棋院「公開行事曆」的 iCal 網址抓取賽程，輸出 schedule.json。

與 calendar-viewer/calendar_list.py 的差別：
  - 讀公開 .ics 網址，**不需要 Google OAuth 憑證**，因此可以在 GitHub Actions 等雲端環境執行。
  - 輸出格式與欄位刻意維持一致，網站端不需要任何改動。
時間推定規則與系列配色規則皆沿用原程式，確保兩者輸出相同。
"""
import argparse, base64, datetime as dt, io, json, os, re, sys, urllib.parse, urllib.request, zlib

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

CALENDAR_ID = '6f9383c72bcf4264f8e5ce4c2fdccd29749f288176d5f8dee1d412a2990d6666@group.calendar.google.com'
CALENDAR_NAME = '海峰棋院公開行事曆'
JSON_SCHEMA_VERSION = 1
TZ = dt.timezone(dt.timedelta(hours=8))  # Asia/Taipei

# 開賽時間規則（由協會確認）：
#   一律 11:00；標題註明「(上午)」「(下午)」者為當天兩場，分別 10:00 與 14:00。
DEFAULT_TIME = '11:00'

SERIES_RULES = [
    (r'棋王(?:循環圈)?', '棋王循環圈'),
    (r'玄樂[杯盃]', '玄樂杯'),
    (r'(?:中環)?碁聖賽?', '中環碁聖'),
    (r'(?:中環)?國手賽', '國手賽'),
]
SERIES_SLOTS = 8
ROUND_MARKER = re.compile(r'第|本賽|預賽|複賽|決賽|挑戰|循環|\d')

# 小編可在日曆標題加註場次，全形/半形括號、有無括號都認得。
#   (上下午) = 當天兩局，10:00 與 14:00
#   (上午) / (下午) = 當天只有該時段一局
# 「上下午」必須排在「下午」前面，否則會被後者先比對到。
AMPM = re.compile(r'[（(]?\s*(上下午|上午|早上|下午)\s*[）)]?')
AMPM_SESSIONS = {
    '上下午': ['10:00', '14:00'],
    '上午': ['10:00'],
    '早上': ['10:00'],
    '下午': ['14:00'],
}


def sessions_of(title):
    """標題若註明場次，回傳該場次的開賽時間清單，否則 None。"""
    m = AMPM.search(title)
    return AMPM_SESSIONS.get(m.group(1)) if m else None


def clean_title(title):
    """去掉「(上午)」這類場次註記，讓賽事名與輪次不會夾雜它。"""
    return re.sub(r'\s{2,}', ' ', AMPM.sub('', title)).strip()


def split_title(title):
    for pattern, _label in SERIES_RULES:
        m = re.search(pattern, title)
        if m:
            rest = (title[:m.start()] + ' ' + title[m.end():]).strip()
            return m.group(0), rest
    m = ROUND_MARKER.search(title)
    if m and m.start() > 0:
        return title[:m.start()].strip(), title[m.start():].strip()
    return title, ''


def series_of(title):
    for pattern, label in SERIES_RULES:
        if re.search(pattern, title):
            return label
    return split_title(title)[0] or title


def series_slot(label):
    fixed = [lbl for _pat, lbl in SERIES_RULES]
    if label in fixed:
        return fixed.index(label)
    return len(fixed) + zlib.crc32(label.encode('utf-8')) % (SERIES_SLOTS - len(fixed))


def group_by_day(events):
    days = {}
    for e in events:
        days.setdefault(e['start'].date(), []).append(e)
    return sorted(days.items())


def infer_times(events):
    """為整天行程補上開賽時間。

    標題註明「(上下午)」→ 當天兩局，10:00 與 14:00；
    「(上午)」→ 10:00、「(下午)」→ 14:00；其餘一律 11:00。
    跨多天的行程（例如為期一週的活動）不適用單日開賽時間，維持「整天」。
    日曆上本來就填了時間的行程不受影響，render_json 會優先採用真實時間。
    """
    for e in events:
        if not e['all_day']:
            continue
        if (e['end'].date() - e['start'].date()).days > 1:
            continue
        e['session_hint'] = sessions_of(e['summary']) or [DEFAULT_TIME]
    return events


# ---- iCal 解析 ----

def unfold(text):
    """iCal 的折行：續行以空白或 tab 開頭，要接回上一行。"""
    return re.sub(r'\r?\n[ \t]', '', text)


def unescape(v):
    return (v.replace('\\n', '\n').replace('\\N', '\n')
             .replace('\\,', ',').replace('\\;', ';').replace('\\\\', '\\'))


def parse_ics_dt(prop, value):
    """回傳 (datetime, is_all_day)。"""
    if 'VALUE=DATE' in prop:
        d = dt.datetime.strptime(value, '%Y%m%d')
        return d.replace(tzinfo=TZ), True
    if value.endswith('Z'):
        d = dt.datetime.strptime(value, '%Y%m%dT%H%M%SZ').replace(tzinfo=dt.timezone.utc)
        return d.astimezone(TZ), False
    d = dt.datetime.strptime(value, '%Y%m%dT%H%M%S')
    return d.replace(tzinfo=TZ), False


def event_link(uid):
    """由 UID 還原 Google 日曆事件連結（與 API 回傳的 htmlLink 相同）。"""
    src = uid.split('@')[0] + ' ' + CALENDAR_ID.split('@')[0] + '@g'
    eid = base64.urlsafe_b64encode(src.encode()).decode().rstrip('=')
    return 'https://www.google.com/calendar/event?eid=' + eid


def fetch_ics(calendar_id):
    enc = urllib.parse.quote(calendar_id, safe='')
    url = f'https://calendar.google.com/calendar/ical/{enc}/public/basic.ics'
    req = urllib.request.Request(url, headers={'User-Agent': 'CPGA-site-builder/1.0'})
    return urllib.request.urlopen(req, timeout=60).read().decode('utf-8', 'replace')


def parse_events(ics):
    events = []
    for block in unfold(ics).split('BEGIN:VEVENT')[1:]:
        block = block.split('END:VEVENT')[0]
        fields = {}
        for line in block.splitlines():
            if ':' not in line:
                continue
            prop, value = line.split(':', 1)
            fields.setdefault(prop.split(';')[0], []).append((prop, value.strip()))

        def one(key):
            return fields.get(key, [(None, None)])[0]

        if 'DTSTART' not in fields or 'SUMMARY' not in fields:
            continue
        sprop, sval = one('DTSTART')
        start, all_day = parse_ics_dt(sprop, sval)
        eprop, eval_ = one('DTEND')
        end = parse_ics_dt(eprop, eval_)[0] if eval_ else start

        uid = one('UID')[1] or ''
        events.append({
            'summary': unescape(one('SUMMARY')[1] or '').strip(),
            'start': start,
            'end': end,
            'all_day': all_day,
            'location': unescape(one('LOCATION')[1] or '').strip(),
            'link': event_link(uid) if uid else '',
            'sources': [CALENDAR_NAME],
        })
    return events


def render_json(events, time_min, time_max, out_path):
    items = []
    for e in events:
        # title 保留日曆原文；name/round/series 用去掉場次註記後的版本
        clean = clean_title(e['summary'])
        name, rest = split_title(clean)
        series = series_of(clean)
        day = e['start'].date()
        hint = e.get('session_hint')
        items.append({
            'date': day.isoformat(),
            'weekday': day.weekday(),
            'title': e['summary'],
            'name': name,
            'round': rest,
            'series': series,
            'series_slot': series_slot(series),
            # sessions：當天的開賽時間清單，「(上下午)」會有兩個
            'sessions': hint or ([] if e['all_day'] else [e['start'].strftime('%H:%M')]),
            'time': (hint[0] if hint else (None if e['all_day'] else e['start'].strftime('%H:%M'))),
            'time_inferred': bool(hint),
            'end_time': None if e['all_day'] else e['end'].strftime('%H:%M'),
            'all_day': e['all_day'],
            'end_date': e['end'].date().isoformat(),
            'location': e['location'],
            'link': e['link'],
            'calendars': e['sources'],
        })

    payload = {
        'schema_version': JSON_SCHEMA_VERSION,
        'generated': dt.datetime.now(TZ).isoformat(timespec='seconds'),
        'source': CALENDAR_NAME,
        'range': {'from': time_min.date().isoformat(),
                  'to': (time_max - dt.timedelta(seconds=1)).date().isoformat()},
        'count': len(items),
        'events': items,
    }
    os.makedirs(os.path.dirname(os.path.abspath(out_path)), exist_ok=True)
    with open(out_path, 'w', encoding='utf-8', newline='') as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)
        f.write('\n')
    return payload


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('out', help='輸出的 schedule.json 路徑')
    ap.add_argument('--days', type=int, default=60)
    ap.add_argument('--min-events', type=int, default=1,
                    help='抓到的筆數低於此值就中止，不覆蓋既有檔案')
    args = ap.parse_args()

    today = dt.datetime.now(TZ).replace(hour=0, minute=0, second=0, microsecond=0)
    time_min, time_max = today, today + dt.timedelta(days=args.days)

    ics = fetch_ics(CALENDAR_ID)
    total = ics.count('BEGIN:VEVENT')
    if total == 0:
        sys.exit('中止：iCal 內容沒有任何事件，可能是日曆權限或網址變更。未覆蓋既有檔案。')

    events = [e for e in parse_events(ics) if time_min <= e['start'] < time_max]
    # 只依開始時間排序：sort 是穩定的，同一天的多場會保留日曆原始順序，
    # 這關係到一天兩場時 10:00／14:00 的指派對象。
    events.sort(key=lambda e: e['start'])
    infer_times(events)

    if len(events) < args.min_events:
        sys.exit(f'中止：期間內只解析到 {len(events)} 筆（日曆共 {total} 筆），'
                 f'低於門檻 {args.min_events}。未覆蓋既有檔案。')

    payload = render_json(events, time_min, time_max, args.out)
    print(f'完成：{payload["count"]} 筆（{payload["range"]["from"]} ~ {payload["range"]["to"]}）→ {args.out}')
    from collections import Counter
    for s, n in Counter(i['series'] for i in payload['events']).most_common():
        print(f'  {s}: {n}')


if __name__ == '__main__':
    main()
