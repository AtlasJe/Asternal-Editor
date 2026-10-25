"""Draw a raised Edge-terrain city wall atlas and a preview composed with the
same rules as web/main.js (raisedCell, extrude "up")."""
import json, random, sys
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
cfg = json.loads((ROOT / 'shared/config.json').read_text())
EDGE_LAYOUT = cfg['edgeSheetLayout']
N, E, S, W = 1, 2, 4, 8
P = 16          # design grid (px); output is x2 nearest -> 32
H = 1           # wall height in tiles
A, B = 3, 13    # wall band [A, B) across the cell: 10px thick

C = dict(
    out=(28, 26, 38), top=(186, 188, 197), top_hi=(220, 222, 228), top_lo=(150, 152, 162),
    walk=(165, 160, 150), walk_lo=(140, 135, 126),
    face=(126, 128, 138), face_hi=(150, 152, 162), face_lo=(98, 100, 112), mortar=(84, 86, 98),
    foot=(70, 72, 84),
)

def footprint(mask):
    """Cells (x, y) of the wall's ground shape in one P x P cell."""
    pts = set()
    for y in range(A, B):
        for x in range(A, B): pts.add((x, y))
    if mask & N:
        for y in range(0, A):
            for x in range(A, B): pts.add((x, y))
    if mask & S:
        for y in range(B, P):
            for x in range(A, B): pts.add((x, y))
    if mask & W:
        for y in range(A, B):
            for x in range(0, A): pts.add((x, y))
    if mask & E:
        for y in range(A, B):
            for x in range(B, P): pts.add((x, y))
    return pts

def region(mask):
    """One P wide, P*(H+1) tall region: top surface in the first tile, the
    south face hanging below it down to the ground footprint."""
    im = Image.new('RGBA', (P, P * (H + 1)), (0, 0, 0, 0))
    px = im.load()
    F = footprint(mask)
    FH = P * H
    rnd = random.Random(mask)
    # South face: the footprint swept down by FH pixels, behind the top.
    face = set()
    for (x, y) in F:
        for d in range(1, FH + 1): face.add((x, y + d))
    face -= F
    for (x, y) in face:
        if y >= P * (H + 1): continue
        # depth below the top surface edge in this column
        top_edge = max(yy for (xx, yy) in F if xx == x)
        d = y - top_edge
        brick_row = (d - 1) // 4
        off = 0 if brick_row % 2 == 0 else 3
        c = C['face']
        if (d - 1) % 4 == 0: c = C['mortar']
        elif (x + off) % 6 == 0: c = C['mortar']
        elif d <= 2: c = C['face_hi']
        elif d >= FH - 2: c = C['foot']
        elif rnd.random() < 0.08: c = C['face_lo']
        px[x, y] = c + (255,)
    # Top surface: walkway with a parapet of merlons on exposed sides.
    for (x, y) in F:
        c = C['walk'] if (x + y) % 5 else C['walk_lo']
        px[x, y] = c + (255,)
    def exposed(x, y, dx, dy):
        return (x + dx, y + dy) not in F and 0 <= x + dx < P and 0 <= y + dy < P or \
               (not (0 <= x + dx < P and 0 <= y + dy < P) and False)
    for (x, y) in F:
        for dx, dy in ((0, -1), (1, 0), (0, 1), (-1, 0)):
            if exposed(x, y, dx, dy):
                # parapet: 2px rim, merlons every 4px (light top, darker gap)
                along = x if dy else y
                merlon = (along // 2) % 2 == 0
                for k in range(2):
                    qx, qy = x - dx * k, y - dy * k
                    if (qx, qy) in F:
                        px[qx, qy] = (C['top_hi'] if merlon else C['top_lo']) + (255,)
    # 1px dark outline around top+face silhouette for readability
    sil = {(x, y) for x in range(P) for y in range(P * (H + 1)) if px[x, y][3]}
    for (x, y) in list(sil):
        for dx, dy in ((0, -1), (1, 0), (0, 1), (-1, 0)):
            q = (x + dx, y + dy)
            inside_tile = 0 <= q[0] < P and 0 <= q[1] < P * (H + 1)
            if not inside_tile:
                continue
            if q not in sil:
                # don't outline the cut where the wall continues into a neighbour
                px[x, y] = C['out'] + (255,)
                break
    return im

def atlas():
    sheet = Image.new('RGBA', (4 * P, 4 * P * (H + 1)), (0, 0, 0, 0))
    for r, row in enumerate(EDGE_LAYOUT):
        for c, m in enumerate(row):
            sheet.paste(region(m), (c * P, r * P * (H + 1)))
    return sheet.resize((sheet.width * 2, sheet.height * 2), Image.NEAREST)

def preview(sheet):
    """Compose a small map the way web/main.js draws raised edge cells."""
    T = 32
    plan = [
        "..............",
        "..#######.....",
        "..#.....#.....",
        "..#.....#####.",
        "..#.........#.",
        "..####.######.",
        ".....#.#......",
        ".....###......",
        "..............",
    ]
    h, w = len(plan), len(plan[0])
    cells = [[ch == '#' for ch in row] for row in plan]
    def wall(x, y): return 0 <= x < w and 0 <= y < h and cells[y][x]
    img = Image.new('RGBA', (w * T, h * T), (96, 150, 70, 255))
    g = img.load(); rnd = random.Random(1)
    for y in range(img.height):
        for x in range(img.width):
            if rnd.random() < 0.05: g[x, y] = (84, 136, 62, 255)
    flat = [m for row in EDGE_LAYOUT for m in row]
    items = []
    for cy in range(h):
        for cx in range(w):
            if not cells[cy][cx]: continue
            # links: connect to every orthogonal wall neighbour (both sides link)
            m = (N if wall(cx, cy - 1) else 0) | (E if wall(cx + 1, cy) else 0) | \
                (S if wall(cx, cy + 1) else 0) | (W if wall(cx - 1, cy) else 0)
            i = flat.index(m)
            fx, fy = (i % 4) * T, (i // 4) * (H + 1) * T
            frame = sheet.crop((fx, fy, fx + T, fy + (H + 1) * T))
            y = (cy - H) * T                       # offset = -height for "up"
            items.append((y + (H + 1) * T, cx, frame, cx * T, y))
    for _, _, frame, x, y in sorted(items, key=lambda t: (t[0], t[1])):
        img.alpha_composite(frame, (x, max(y, 0)) if y >= 0 else (x, 0)) if y >= 0 else \
            img.alpha_composite(frame.crop((0, -y, T, frame.height)), (x, 0))
    return img

def generate(out, review):
    out = Path(out); review = Path(review)
    out.mkdir(parents=True, exist_ok=True)
    review.mkdir(parents=True, exist_ok=True)
    sheet = atlas()
    sheet.save(out / 'city_wall.png')
    pv = preview(sheet)
    pv.resize((pv.width * 2, pv.height * 2), Image.Resampling.NEAREST).save(review / 'city_wall_preview.png')
    sheet.resize((sheet.width * 3, sheet.height * 3), Image.Resampling.NEAREST).save(review / 'city_wall_atlas.png')

if __name__ == '__main__':
    import argparse
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--out', type=Path, default=Path(__file__).resolve().parent/'temp',
                        help='Output atlas directory')
    parser.add_argument('--review', type=Path, default=Path(__file__).resolve().parent/'temp',
                        help='Output review image directory')
    args = parser.parse_args()
    generate(args.out, args.review)
