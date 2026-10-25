"""Procedural raised Dual terrain. No source artwork or image service required.

TL/TR/BL/BR are occupancy samples, not four direction connections. Rounded quadrant
contours share exact boundary samples; diagonal masks 6/9 remain separated.
Only south-facing contour segments are extruded, leaving full interiors clear.
"""
from pathlib import Path
import json
from PIL import Image, ImageDraw
ROOT = Path(__file__).resolve().parents[1]
P = 16
HEIGHT = 2
LAYOUT = json.loads((ROOT/'shared/config.json').read_text())['sheetLayout']

def region(mask):
    corners = [bool(mask & (1 << b)) for b in range(4)]
    def inside(x, y):
        # Keep straight half-cell edges and round only their corners. Four
        # single-corner crops assemble into a rounded rectangle, not a diamond.
        x = min(P-1, max(0, x)); y = min(P-1, max(0, y))
        qx, qy = int(x >= P//2), int(y >= P//2)
        index = qy*2+qx
        occupied = corners[index]
        horizontal = corners[qy*2+(1-qx)]
        vertical = corners[(1-qy)*2+qx]
        diagonal = corners[(1-qy)*2+(1-qx)]
        u = (x if qx == 0 else P-1-x)+.5
        v = (y if qy == 0 else P-1-y)+.5
        radius = 4
        center = P//2-radius
        rounded = not (u > center and v > center and
                       (u-center)**2+(v-center)**2 > radius**2)
        if occupied and not horizontal and not vertical:
            return rounded
        if not occupied and horizontal and vertical and diagonal:
            return not rounded  # soften a re-entrant corner
        return occupied
    im = Image.new('RGBA', (P, P*(HEIGHT+1)))
    px = im.load()
    # Extrude the exact rounded south silhouette, including its curved foot.
    south = {x: next((y for y in range(P) if inside(x,y) and not inside(x,y+1)), None)
             for x in range(P)}
    # Faces first. A column has at most one south-facing contour crossing.
    for x in range(P):
        for y in range(P):
            if not inside(x,y) or inside(x,y+1):
                continue
            for depth in range(1, HEIGHT*P+1):
                yy = y+depth
                if yy >= im.height:
                    break
                course = yy//4
                joint = (x+(4 if course%2 else 0))%8 == 0
                color = (149,111,75)
                if yy%4 == 0 or joint:
                    color = (92,73,57)
                elif depth < 3:
                    color = (111,91,63)  # shadow under the turf lip
                elif depth > HEIGHT*P-3:
                    color = (108,82,61)
                elif (x*17+yy*29)%23 == 0:
                    color = (171,131,88)
                # The changing surface normal wraps light around rounded ends.
                left = south.get(x-1)
                right = south.get(x+1)
                slope = ((right if right is not None else y) -
                         (left if left is not None else y))
                shade = max(-26, min(20, slope*7))
                color = tuple(max(0,min(255,c+shade)) for c in color)
                px[x,yy] = (*color,255)
    for y in range(P):
        for x in range(P):
            if not inside(x,y):
                continue
            color = (95,135,81)
            if (x*7+y*11)%29 == 0:
                color = (115,153,91)
            if not inside(x,y-1) or not inside(x-1,y):
                color = (150,176,107)
            if not inside(x,y+1):
                color = (51,82,57)
            elif not inside(x+1,y):
                color = (69,107,65)
            px[x,y] = (*color,255)
    return im

def generate(out, review):
    out=Path(out);review=Path(review)
    out.mkdir(parents=True,exist_ok=True);review.mkdir(parents=True,exist_ok=True)
    sheet=Image.new('RGBA',(P*4,P*(HEIGHT+1)*4))
    for row,masks in enumerate(LAYOUT):
        for col,mask in enumerate(masks):
            sheet.paste(region(mask),(col*P,row*P*(HEIGHT+1)))
    sheet.resize((sheet.width*2,sheet.height*2),Image.Resampling.NEAREST).save(out/'moss_plateau.png')
    # Label each actual crop, so the empty state and diagonal states are legible.
    labeled=Image.new('RGB',(4*112,4*176),(36,41,49))
    draw=ImageDraw.Draw(labeled)
    for row,masks in enumerate(LAYOUT):
        for col,mask in enumerate(masks):
            x,y=col*112+8,row*176+22
            for yy in range(0,144,12):
                for xx in range(0,96,12):
                    draw.rectangle((x+xx,y+yy,x+xx+11,y+yy+11),fill=(65,70,78) if (xx//12+yy//12)%2 else (52,57,65))
            art=region(mask).resize((96,144),Image.Resampling.NEAREST)
            labeled.paste(art,(x,y),art)
            draw.text((x,y-16),f'mask {mask:02d}',fill=(232,235,239))
    labeled.save(review/'moss_plateau_atlas.png')
    # One occupied world cell, assembled from its four real display crops.
    single=Image.new('RGBA',(P*2,P*(HEIGHT+2)),(69,84,98,255))
    for x,y,mask in [(0,0,8),(P,0,4),(0,P,2),(P,P,1)]:
        single.alpha_composite(region(mask),(x,y))
    single.resize((single.width*10,single.height*10),Image.Resampling.NEAREST).save(review/'moss_plateau_single.png')

if __name__ == '__main__':
    import argparse
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--out', type=Path, default=Path(__file__).resolve().parent/'temp',
                        help='Output atlas directory')
    parser.add_argument('--review', type=Path, default=Path(__file__).resolve().parent/'temp',
                        help='Output review image directory')
    args = parser.parse_args()
    generate(args.out, args.review)
