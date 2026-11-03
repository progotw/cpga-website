"""
棋士年度成績彙總：給海峰棋院網站（以及協會自己）使用的現成數字。

用法：
    python scripts/build_player_stats.py site

輸出 site/assets/data/player-stats.json，每位棋士三組數字：
台灣職業賽（國內）、世界賽（國際）、去年度總成績。

=== 為什麼做這支 ===

海峰棋士頁上的「年度成績」是人工每月一號更新的（頁面上寫「(11/1更新)」）。
那三行其實可以從成績系統的公開對局紀錄直接算出來——2026-11-03 以周俊勛
驗證，三項與頁面完全相同。做成檔案後，網站端只要讀這個網址、照棋士編號
取值、印三行字，不必再有人每月手動輸入。

=== 算法 ===

每一局紀錄都帶著分類欄位：
  第 2 欄　國內／國際　→ 國內＝台灣職業賽、國際＝世界賽
  第 3 欄　正式／限制／交流
勝方欄位等於本人才算勝，其餘都算敗（與成績系統查詢頁一致）。
三項都計入正式與限制，交流賽目前的資料裡沒有出現；若日後出現，
請先與海峰確認要不要計入，不要自行決定。

棋士編號沿用海峰棋士頁網址上的那一串，兩邊天生對得起來，不必做對照表。
"""
import io, os, sys, json, datetime, urllib.request

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

BASE = ('https://firestore.googleapis.com/v1/projects/test-5cfc9'
        '/databases/(default)/documents/results')

# 一列的欄位順序由成績系統決定，不要自行調動
DATE, C1, C2, EVENT, STAGE, BLACK, WHITE, WINNER, MARGIN = range(9)

TZ = datetime.timezone(datetime.timedelta(hours=8))


def rows_of(year):
    """某一年的全部對局。那一年還沒有資料時回空清單。"""
    try:
        with urllib.request.urlopen(BASE + '/y%d' % year, timeout=40) as r:
            doc = json.loads(r.read().decode('utf-8'))
    except urllib.error.HTTPError as e:
        if e.code == 404:
            return []
        raise
    s = ((doc.get('fields') or {}).get('rows') or {}).get('stringValue')
    return json.loads(s) if s else []


def norm(s):
    return ''.join(str(s or '').split())


def tally(rows, name, only=None):
    """某位棋士的勝負。only 可指定 '國內' 或 '國際'。"""
    win = loss = 0
    for r in rows:
        if only and r[C1] != only:
            continue
        if norm(r[BLACK]) != name and norm(r[WHITE]) != name:
            continue
        if norm(r[WINNER]) == name:
            win += 1
        else:
            loss += 1
    return win, loss


def block(win, loss):
    n = win + loss
    rate = (win * 100.0 / n) if n else 0.0
    # 海峰頁面的寫法：整數不帶小數點（0%、50%），其餘一位小數（57.1%）
    txt = ('%.1f' % rate).rstrip('0').rstrip('.')
    return {
        'games': n, 'win': win, 'loss': loss, 'rate': round(rate, 1),
        'text': '%d勝%d負　勝率%s%%' % (win, loss, txt),
    }


def main():
    site = sys.argv[1] if len(sys.argv) > 1 else 'site'
    players_path = os.path.join(site, 'assets', 'data', 'players.json')
    with io.open(players_path, encoding='utf-8') as f:
        roster = json.load(f).get('players') or []

    now = datetime.datetime.now(TZ)
    year = now.year
    cur, prev = rows_of(year), rows_of(year - 1)
    print('%d 年 %d 局、%d 年 %d 局' % (year, len(cur), year - 1, len(prev)))

    # 一年一千多局、一百多位棋士，直接逐人掃就夠快，不必先建索引
    players = {}
    for p in roster:
        pid, name = p.get('id'), norm(p.get('name'))
        if not pid or not name:
            continue
        players[pid] = {
            'name': p['name'],
            'domestic': block(*tally(cur, name, '國內')),
            'international': block(*tally(cur, name, '國際')),
            'last_year': block(*tally(prev, name)),
        }

    out = {
        'schema_version': 1,
        'generated': now.isoformat(timespec='seconds'),
        # 海峰頁面原本印「(11/1更新)」，照同樣格式給一份現成的字串
        'generated_label': '(%d/%d更新)' % (now.month, now.day),
        'source': '海峰棋院 成績系統（公開對局紀錄）',
        'note': '國內＝台灣職業賽、國際＝世界賽；last_year 為前一年全部對局。'
                'players 的鍵是海峰棋士頁網址上的棋士編號。',
        'year': year,
        'last_year': year - 1,
        'count': len(players),
        'players': players,
    }
    dest = os.path.join(site, 'assets', 'data', 'player-stats.json')
    with io.open(dest, 'w', encoding='utf-8') as f:
        json.dump(out, f, ensure_ascii=False, indent=1)
        f.write('\n')
    print('完成：%d 位棋士 → %s' % (len(players), dest))


if __name__ == '__main__':
    main()
