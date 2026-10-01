"""
把 Supabase content 表的內容匯出成 site/assets/data/*.json。

在 GitHub Action 裡執行，需要兩個環境變數：
    SUPABASE_URL               專案網址
    SUPABASE_SERVICE_ROLE_KEY  service_role 金鑰（只存在 GitHub Secrets）

這把金鑰能繞過資料列權限，所以只在 CI 裡用，絕不出現在前端或版控。

條文類的 markdown 會在這裡轉成 html 一併寫入，公開頁面因此不需要
載入任何 Markdown 函式庫。
"""
import os, sys, io, json, urllib.request, urllib.error

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from render_content import render, payload_for   # noqa: E402

URL = (os.environ.get('SUPABASE_URL') or '').rstrip('/')
KEY = os.environ.get('SUPABASE_SERVICE_ROLE_KEY') or ''
OUT = sys.argv[1] if len(sys.argv) > 1 else 'site/assets/data'

def describe(name, v):
    """只印長度與開頭幾字，足以辨認拿錯金鑰，又不洩漏內容。"""
    if not v:
        return '%s：未設定 ✗' % name
    return '%s：已設定（%d 字，開頭 %s…）' % (name, len(v), v[:12])


print(describe('SUPABASE_URL', URL))
print(describe('SUPABASE_SERVICE_ROLE_KEY', KEY))

if not URL or not KEY:
    sys.exit('中止：缺少 SUPABASE_URL 或 SUPABASE_SERVICE_ROLE_KEY，'
             '請確認 GitHub repo 的 Settings → Secrets and variables → Actions 裡有這兩項。')

if KEY.startswith('sb_publishable_') or KEY.startswith('eyJ'):
    print('提醒：這看起來是公開金鑰而非 secret key。公開金鑰受資料列權限限制，'
          '讀不到內容，匯出會得到空結果。')


def fetch():
    req = urllib.request.Request(
        URL + '/rest/v1/content?select=key,title,kind,data,body,updated_at',
        headers={'apikey': KEY, 'Authorization': 'Bearer ' + KEY})
    try:
        return json.loads(urllib.request.urlopen(req, timeout=40).read().decode('utf-8'))
    except urllib.error.HTTPError as e:
        body = e.read().decode('utf-8')[:200]
        hint = ''
        if e.code == 401:
            hint = ('\n提示：金鑰無效。最常見的原因是 Supabase 那把已撤銷、'
                    '但 GitHub Secrets 裡還存著舊的——到 Secrets 頁用鉛筆圖示更新。')
        sys.exit('中止：讀取資料庫失敗 HTTP %s — %s%s' % (e.code, body, hint))


rows = fetch()
print('讀到 %d 筆內容項目。' % len(rows))
if not rows:
    sys.exit('中止：讀不到任何內容項目。若金鑰正確，表示 content 表是空的；'
             '若用的是公開金鑰，則是被資料列權限擋下。既有檔案未被覆蓋。')

written, skipped = [], []

for r in rows:
    key, kind = r['key'], r['kind']
    path = os.path.join(OUT, key + '.json')

    if kind == 'markdown':
        md = r.get('body') or ''
        if not md.strip():
            skipped.append((key, '資料庫裡還沒有內容'))
            continue
        payload = payload_for(md)
    else:
        data = r.get('data')
        if data is None:
            skipped.append((key, '資料庫裡還沒有內容'))
            continue
        if not isinstance(data, dict):
            skipped.append((key, '格式不是物件，已略過'))
            continue
        payload = data

    os.makedirs(OUT, exist_ok=True)
    with io.open(path, 'w', encoding='utf-8') as f:
        json.dump(payload, f, ensure_ascii=False, indent=1)
        f.write('\n')
    written.append(key)

# ---------------------------------------------------------------------------
# 找老師：由棋士自行填寫，只匯出勾選「願意刊登」的那些
# ---------------------------------------------------------------------------
def export_teaching():
    req = urllib.request.Request(
        URL + '/rest/v1/teaching?select=player_id,modes,areas,students,languages,'
              'levels,fee,availability,intro,accept_form,contacts,links&listed=is.true',
        headers={'apikey': KEY, 'Authorization': 'Bearer ' + KEY})
    try:
        rows = json.loads(urllib.request.urlopen(req, timeout=40).read().decode('utf-8'))
    except urllib.error.HTTPError as e:
        if e.code == 404:
            print('  – teachers.json（teaching 資料表尚未建立）')
            return False
        raise

    teachers = []
    for r in rows:
        t = {'id': r['player_id']}
        for k in ('modes', 'areas', 'students', 'languages'):
            if r.get(k):
                t[k] = r[k]
        for k in ('levels', 'fee', 'availability', 'intro'):
            if (r.get(k) or '').strip():
                t[k] = r[k].strip()
        t['acceptForm'] = bool(r.get('accept_form'))
        # 只保留填了內容的聯絡管道與連結
        contacts = [c for c in (r.get('contacts') or []) if (c or {}).get('value')]
        links = [l for l in (r.get('links') or []) if (l or {}).get('url')]
        if contacts:
            t['contacts'] = contacts
        if links:
            t['links'] = links
        teachers.append(t)

    payload = {
        'schema_version': 1,
        'note': '職業老師登錄資料，由棋士在棋士專區自行填寫後發布。'
                'id 對應 players.json 的棋士 id，照片、段位、經歷會自動帶入。',

        'teachers': teachers,
    }
    with io.open(os.path.join(OUT, 'teachers.json'), 'w', encoding='utf-8') as f:
        json.dump(payload, f, ensure_ascii=False, indent=1)
        f.write('\n')
    print('  ✓ teachers.json（%d 位老師）' % len(teachers))
    return True


print('匯出完成：%d 筆' % len(written))
for k in written:
    print('  ✓ %s.json' % k)
for k, why in skipped:
    print('  – %s（%s）' % (k, why))

export_teaching()

# 一筆都沒寫出來代表設定有問題，讓工作流程失敗而不是悄悄通過
if not written:
    sys.exit('中止：沒有任何內容可匯出。')
