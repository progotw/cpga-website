"""
下載棋士照片、壓縮為網頁尺寸，並把 players.json 的 photo 改為本地路徑。

預設只下載「本地還沒有的」照片，因此每天自動執行時幾乎不耗流量。
加上 --force 可重新下載全部（例如原站換了照片）。

用法：
    python scripts/fetch_photos.py site
    python scripts/fetch_photos.py site --force
"""
import argparse, io, json, os, sys, time, urllib.request
from PIL import Image

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

MAX = (600, 750)
UA = {'User-Agent': 'CPGA-site-builder/1.0'}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('site', nargs='?', default='site', help='網站根目錄')
    ap.add_argument('--force', action='store_true', help='重新下載已存在的照片')
    args = ap.parse_args()

    json_path = os.path.join(args.site, 'assets', 'data', 'players.json')
    out_dir = os.path.join(args.site, 'assets', 'img', 'players')
    os.makedirs(out_dir, exist_ok=True)

    data = json.load(open(json_path, encoding='utf-8'))
    players = data['players']

    before = after = 0
    got = skipped = 0
    fail = []

    for n, p in enumerate(players, 1):
        name = f"{p['id']}.jpg"
        dest = os.path.join(out_dir, name)
        rel = 'assets/img/players/' + name

        # 已經有檔案就直接沿用，不重複下載
        if os.path.exists(dest) and not args.force:
            p['photo'] = rel
            skipped += 1
            continue

        src = p.get('photo') or ''
        if not src.startswith('http'):
            continue

        try:
            raw = urllib.request.urlopen(
                urllib.request.Request(src, headers=UA), timeout=60).read()
            before += len(raw)

            im = Image.open(io.BytesIO(raw))
            if im.mode in ('RGBA', 'LA', 'P'):
                im = im.convert('RGBA')
                bg = Image.new('RGB', im.size, (255, 255, 255))
                bg.paste(im, mask=im.split()[-1])
                im = bg
            else:
                im = im.convert('RGB')

            im.thumbnail(MAX, Image.LANCZOS)
            im.save(dest, 'JPEG', quality=82, optimize=True, progressive=True)
            after += os.path.getsize(dest)

            p['photo'] = rel
            got += 1
        except Exception as e:
            fail.append((p['name'], str(e)))
            p['photo'] = ''
        time.sleep(0.15)

    json.dump(data, open(json_path, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)

    print(f'新下載 {got} 張、沿用既有 {skipped} 張、失敗 {len(fail)} 張')
    if got:
        print(f'  原始 {before / 1024 / 1024:.1f} MB → 壓縮後 {after / 1024 / 1024:.1f} MB')
    if fail:
        print('  失敗:', fail[:10])
        # 少數幾張抓不到不算致命，但全部失敗就該中止
        if len(fail) > len(players) // 2:
            sys.exit('中止：超過半數照片下載失敗，原站可能已改版。')


if __name__ == '__main__':
    main()
