#!/usr/bin/env python3
"""Convert every image of Kenney's Desert Shooter Pack into one tile pack.

The editor reads this pack directly from packs/kenney-desert.
Flat ground uses one Wang atlas of intact original tiles, sharing five center
materials. Elevated mesas retain Dual Tile extrusion; fences retain edge
connections. Legacy flat sheets remain hidden for existing map references.
Objects, animation strips and UI assets stay in the runtime pack.
Conversion reads original assets directly and produces runtime resources only.
Art is scaled by nearest-neighbor to the pack's 32 px tile size.

Needs Pillow.

    python3 asset-conversion-examples/kenney_desert-shooter-pack_1.0/convert/convert_kenney.py path/to/kenney_desert-shooter-pack_1.0
    python3 asset-conversion-examples/kenney_desert-shooter-pack_1.0/convert/convert_kenney.py PACK --out packs/kenney-desert
"""

import argparse
import json
import shutil
from pathlib import Path
import sys
sys.path.insert(0,str(Path(__file__).resolve().parents[3]/"tools"))
from tilemap import read_pack, write_pack, asset_uuids

from PIL import Image
from wang_terrain import build_wang, INTERIOR_VARIANTS
from convert_interface import convert_interface

OBJECT_LABELS = json.loads(Path(__file__).with_name("object-labels.json").read_text(encoding="utf-8"))

ROOT = Path(__file__).resolve().parents[3]
K = 16  # Kenney terrain tile size
H = K // 2
TL, TR, BL, BR = 1, 2, 4, 8
N, E, S, W = 1, 2, 4, 8
COLS = 18  # tiles per row in the Tiles sheet
SAND = (243, 205, 172)  # ground colour baked into the flat patches
SCALE = 2

# name, label, kind, spec (tile numbers count from 0, left to right, top to
# bottom in PNG/Tiles/Tilemap/tilemap_packed.png)
TERRAINS = [
    ("sand", "沙地", "fill", {}),
    ("purple", "紫草地", "flat", {"slice": 90, "inner": 93}),
    ("teal", "青草地", "flat", {"slice": 95, "inner": 98}),
    ("metal", "金属地板", "flat", {"slice": 100, "inner": 103}),
    ("dirt", "深色土地", "flat", {"slice": 154, "inner": 157}),
    ("mesa", "紫色高台", "mesa", {"top": 0, "inner": 3, "face": [36]}),
    ("mesa_tall", "紫色高崖", "mesa", {"top": 0, "inner": 3, "face": [36, 54, 72]}),
    ("mesa_teal", "青色高台", "mesa", {"top": 5, "inner": 8, "face": [41]}),
    ("mesa_grey", "灰岩高台", "mesa", {"top": 10, "inner": 13, "face": [46]}),
    ("platform_grey", "灰色高台", "mesa", {"top": 15, "inner": None, "face": [51, 69, 87]}),
    ("fence", "橙色栅栏", "pen", {"corner": 105}),
    ("chain", "铁丝网", "pen", {"corner": 177}),
]

# Multi-tile and named objects from the Tiles sheet: name, label, group,
# top-left tile, width, height (tiles; also the footprint in cells).
OBJECTS = [
    ("building", "灰色大楼", "建筑", 15, 3, 5),
    ("cave", "崖洞", "建筑", 59, 3, 2),
    ("arch", "石拱门", "建筑", 152, 2, 2),
    ("arch_gold", "金门拱门", "建筑", 188, 2, 2),
    ("fence_gate", "栅栏门", "建筑", 159, 3, 1),
    ("chain_run", "铁丝网段", "建筑", 231, 3, 1),
    ("door_frame", "门框", "门", 199, 2, 1),
    ("skeleton", "巨兽骸骨", "植物与岩石", 66, 2, 2),
    ("tree_purple", "紫树", "植物与岩石", 57, 1, 2),
    ("tree_teal", "青树", "植物与岩石", 62, 1, 2),
    ("bush_dead", "枯草", "植物与岩石", 39, 1, 1),
    ("bush_teal", "青草丛", "植物与岩石", 44, 1, 1),
    ("rocks", "碎石", "植物与岩石", 58, 1, 1),
    ("cactus", "仙人掌", "植物与岩石", 63, 1, 1),
    ("rock_pile", "石堆", "植物与岩石", 76, 1, 1),
    ("cactus_small", "小仙人掌", "植物与岩石", 81, 1, 1),
    ("stone", "石头", "植物与岩石", 82, 1, 1),
    ("stone_tall", "石笋", "植物与岩石", 83, 1, 1),
    ("lamp", "路灯", "物件", 68, 1, 2),
    ("table", "木桌", "物件", 211, 2, 2),
    ("sign_red", "红色路牌", "物件", 49, 1, 1),
    ("sign_teal", "青色路牌", "物件", 50, 1, 1),
    ("portal_grey", "传送阵（灰）", "物件", 196, 1, 1),
    ("key", "钥匙", "物件", 198, 1, 1),
    ("key_red", "红钥匙", "物件", 201, 1, 1),
    ("barrel", "木桶", "物件", 202, 1, 1),
    ("barrel_green", "绿桶", "物件", 203, 1, 1),
    ("door_open", "开着的门", "物件", 209, 1, 1),
    ("doorway", "门洞", "物件", 210, 1, 1),
    ("chest_red_open", "红宝箱（开）", "物件", 217, 1, 1),
    ("chest_gold_open", "金宝箱（开）", "物件", 219, 1, 1),
]

# Objects with several animations from the Tiles sheet: name, label, group,
# strip frames (top-left tile of each), width, height, animations as
# (name, label, frame indices into the strip, fps). The sprite is the strip;
# Object metadata gets "frameCount" and "animations", the first one the default.
DOOR_ANIMS = [("closed", "关闭", [2, 1, 0], 3), ("open", "打开", [0, 1, 2], 3)]
DOUBLE_DOOR_ANIMS = [("closed", "关闭", [3, 2, 1, 0], 3), ("open", "打开", [0, 1, 2, 3], 3)]
PAIR_ANIMS = [("closed", "关闭", [1, 0], 3), ("open", "打开", [0, 1], 3)]
ANIMATED = [
    ("gate_orange", "橙色大门", "动画物体", [150, 168, 186], 2, 1, DOOR_ANIMS),
    ("chest_red", "红宝箱", "动画物体", [216, 217], 1, 1, PAIR_ANIMS),
    ("chest_gold", "金宝箱", "动画物体", [218, 219], 1, 1, PAIR_ANIMS),
    ("door_blue", "蓝门", "动画物体", [208, 209], 1, 1, PAIR_ANIMS),
    ("portal", "传送阵", "动画物体", [124, 196], 1, 1, [("active", "启动", [0], 0), ("inactive", "关闭", [1], 0), ("cycle", "闪烁", [0, 1], 3)]),
    ("door_grey", "灰色门", "动画物体", [144, 162, 180], 1, 1, DOOR_ANIMS),
    ("door_grey_double", "灰色双开门", "动画物体", [145, 163, 181, 199], 2, 1, DOUBLE_DOOR_ANIMS),
    ("door_orange", "橙色门", "动画物体", [147, 165, 183], 1, 1, DOOR_ANIMS),
    ("door_orange_double", "橙色双开门", "动画物体", [148, 166, 184, 199], 2, 1, DOUBLE_DOOR_ANIMS),
]

# Other sheets: folder, tile size, group, label prefix, and for character
# sheets the animations of each row (one character, one object): its four
# frames are a two-frame walk cycle, a jump and a fall.
CHARACTER_ANIMS = [("walk", "走动", [0, 1], 4), ("jump", "跳起", [2], 0), ("down", "倒地", [3], 0)]
SPRITE_SHEETS = [
    ("Players", 24, "角色", "角色", CHARACTER_ANIMS),
    ("Enemies", 24, "敌人", "敌人", CHARACTER_ANIMS),
    ("Weapons", 24, "武器", "武器", None),
]


class Sheet:
    def __init__(self, folder, name, size):
        path = Path(folder) / "PNG" / name / "Tilemap" / "tilemap_packed.png"
        self.img = Image.open(path).convert("RGBA")
        self.size = size
        self.cols = self.img.width // size
        self.rows = self.img.height // size

    def tile(self, n, key_sand=False):
        r, c = divmod(n, self.cols)
        s = self.size
        t = self.img.crop((c * s, r * s, c * s + s, r * s + s))
        if key_sand:
            px = t.load()
            for y in range(s):
                for x in range(s):
                    if px[x, y][:3] == SAND:
                        px[x, y] = (0, 0, 0, 0)
        return t

    def block(self, n, w, h):
        r, c = divmod(n, self.cols)
        s = self.size
        return self.img.crop((c * s, r * s, (c + w) * s, (r + h) * s))


def quarter(tile, qx, qy):
    """The quarter of a tile on the side (qx, qy), each -1 or 1."""
    x, y = (0 if qx < 0 else H), (0 if qy < 0 else H)
    return tile.crop((x, y, x + H, y + H))


def bits(mask):
    return {(0, 0): bool(mask & TL), (1, 0): bool(mask & TR), (0, 1): bool(mask & BL), (1, 1): bool(mask & BR)}


def corners(mask):
    """Yield, per display quarter (px, py): the cell's side facing the vertex
    (qx, qy) and whether its h / v / d neighbours are the same terrain."""
    b = bits(mask)
    for (px, py), on in b.items():
        if on:
            yield px, py, 1 - 2 * px, 1 - 2 * py, b[1 - px, py], b[px, 1 - py], b[1 - px, 1 - py]


def flat_tile(sheet, spec, mask):
    s, inner = spec["slice"], spec["inner"]
    notch = {(1, 1): inner, (-1, 1): inner + 1, (1, -1): inner + COLS, (-1, -1): inner + COLS + 1}
    out = Image.new("RGBA", (K, K))
    for px, py, qx, qy, h, v, d in corners(mask):
        if h and v and not d:
            n = notch[qx, qy]
        else:
            sx, sy = (0 if h else qx), (0 if v else qy)
            n = s + (sy + 1) * COLS + (sx + 1)
        out.paste(quarter(sheet.tile(n, key_sand=True), qx, qy), (px * H, py * H))
    return out


def fill_tile(sheet, spec, mask):
    out = Image.new("RGBA", (K, K))
    t = Image.new("RGBA", (K, K), SAND + (255,))
    for px, py, qx, qy, *_ in corners(mask):
        out.paste(quarter(t, qx, qy), (px * H, py * H))
    return out


def mesa_region(sheet, spec, mask):
    """Top tile plus the cliff face rows below it."""
    top, inner, faces = spec["top"], spec["inner"], spec["face"]
    # The building's 3x5 sheet has no dedicated concave-corner tiles.
    # Use the plain top centre there rather than sampling neighbouring art.
    inner_tile = lambda row, col: top + COLS + 1 if inner is None else inner + row * COLS + col
    out = Image.new("RGBA", (K, (1 + len(faces)) * K))
    b = bits(mask)
    for px in (0, 1):  # cliff face under every top quarter with no plateau south of it
        if b[px, 0] and not b[px, 1]:
            qx = 1 - 2 * px
            other = 1 - px
            # No end cap (with its dark side) where the plateau goes on sideways:
            # the face carries on, or a plateau below that side (the inside of a
            # notch) already draws its own edge there.
            runs_on = b[other, 0] or b[other, 1]
            for k, face in enumerate(faces):
                n = face + 1 if runs_on else face + (2 if qx > 0 else 0)
                x0 = 0 if qx < 0 else H
                out.alpha_composite(sheet.tile(n).crop((x0, 0, x0 + H, K)), (px * H, H + k * K))
    for px, py, qx, qy, h, v, d in corners(mask):
        if qy < 0:  # top quarter of its cell: rims on top
            if h and v:
                n = top + COLS + 1 if d else inner_tile(1, 0 if qx > 0 else 1)
            elif v:
                n = inner_tile(0, 0 if qx > 0 else 1) if d else top + COLS + (1 + qx)
            elif h:
                n = top + 1
            else:
                n = top + (1 + qx)
        else:  # bottom quarter: no rim to the south (the face is there)
            n = top + COLS + (1 if h else 1 + qx)
        out.alpha_composite(quarter(sheet.tile(n), qx, qy), (px * H, py * H))
    return out


def pen_tile(sheet, spec, mask):
    """Edge-connected cell (N E S W bits) from the quarters of a 3 x 3 pen."""
    c = spec["corner"]

    def pen(dx, dy):
        return c + (dy + 1) * COLS + (dx + 1)

    out = Image.new("RGBA", (K, K))
    for qx in (-1, 1):
        for qy in (-1, 1):
            h = mask & (E if qx > 0 else W)
            v = mask & (N if qy < 0 else S)
            if h and v:
                n = pen(-qx, -qy)  # the pen corner joining these two sides
            elif h:
                n = pen(0, qy)  # top / bottom run
            elif v:
                n = pen(qx, 0)  # left / right run
            else:
                n = pen(qx, qy)  # outer corner: the post's own corner
            out.paste(quarter(sheet.tile(n), qx, qy), ((qx + 1) // 2 * H, (qy + 1) // 2 * H))
    return out


def terrain_sheet(sheet, kind, spec, layout):
    rows = 1 + len(spec["face"]) if kind == "mesa" else 1
    img = Image.new("RGBA", (4 * K, 4 * rows * K))
    for r, row in enumerate(layout):
        for c, mask in enumerate(row):
            if kind == "mesa":
                region = mesa_region(sheet, spec, mask)
            elif kind == "flat":
                region = flat_tile(sheet, spec, mask)
            elif kind == "pen":
                region = pen_tile(sheet, spec, mask)
            else:
                region = fill_tile(sheet, spec, mask)
            img.alpha_composite(region, (c * K, r * rows * K))
    return img


def used_tiles(kind, spec):
    """Tiles of the Tiles sheet a terrain is built from."""
    if kind == "flat":
        return {spec["slice"] + r * COLS + c for r in range(3) for c in range(3)} | {
            spec["inner"] + r * COLS + c for r in range(2) for c in range(2)
        }
    if kind == "mesa":
        return (
            {spec["top"] + r * COLS + c for r in range(2) for c in range(3)}
            | ({spec["inner"] + r * COLS + c for r in range(2) for c in range(2)} if spec["inner"] is not None else set())
            | {f + c for f in spec["face"] for c in range(3)}
        )
    if kind == "pen":
        # the pen's centre isn't part of the fence (it may hold something else)
        return {spec["corner"] + r * COLS + c for r in range(3) for c in range(3)} - {spec["corner"] + COLS + 1}
    return set()


def up(img):
    return img.resize((img.width * SCALE, img.height * SCALE), Image.NEAREST)


def empty(img):
    return img.getbbox() is None


def colours(img):
    """Base / light / dark / edge colours for the editor's layer chips."""
    q = img.convert("RGBA")
    px = q.load()
    counts = {}
    for p in (px[x, y] for y in range(q.height) for x in range(q.width)):
        if p[3] == 255:
            counts[p[:3]] = counts.get(p[:3], 0) + 1
    ranked = sorted(counts, key=counts.get, reverse=True) or [(128, 128, 128)]
    lum = lambda c: 0.3 * c[0] + 0.59 * c[1] + 0.11 * c[2]  # noqa: E731
    base = ranked[0]
    top = ranked[:6]
    hexs = lambda c: "#%02x%02x%02x" % c  # noqa: E731
    return {
        "base": hexs(base),
        "light": hexs(max(top, key=lum)),
        "dark": hexs(min(top, key=lum)),
        "edge": hexs(min(ranked[:12], key=lum)),
    }


def object_group(name, group):
    """Group by placement purpose rather than animation or source sheet."""
    if group == "界面":
        return group
    if group in {"角色", "敌人"}:
        return "角色"
    if name.startswith("chest_"):
        return "场景"
    if group in {"武器", "物品"} or name.startswith("key"):
        return "物品"
    return "场景"


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("pack", nargs="?", default=str(Path(__file__).resolve().parents[1]), help="the kenney_desert-shooter-pack_1.0 folder")
    p.add_argument("--out", default=str(ROOT / "packs" / "kenney-desert"), help="pack folder to write")
    args = p.parse_args()

    config = json.loads((ROOT / "shared" / "config.json").read_text(encoding="utf-8"))
    out = Path(args.out)
    existing_uuids = asset_uuids(out)
    # Only reset generated image directories in the output pack.
    for folder in ("terrains", "objects"):
        target = out / folder
        if target.exists():
            shutil.rmtree(target)
        target.mkdir(parents=True)
    tiles = Sheet(args.pack, "Tiles", K)
    manifest = {
        "format": "tilemap-pack",
        "version": 1,
        "revision": 11,
        "id": "kenney-desert",
        "name": "Kenney 沙漠射击",
        "credit": "Desert Shooter Pack by Kenney (www.kenney.nl), CC0",
        "tileSize": K * SCALE,
        "sheetLayout": config["sheetLayout"],
        "edgeSheetLayout": config["edgeSheetLayout"],
        "terrains": [],
        "objects": [],
    }
    hud_ui = []

    wang_terrain, used = build_wang(args.pack, out, SCALE)
    manifest["terrains"].append(wang_terrain)
    for name, label, kind, spec in TERRAINS:
        layout = config["edgeSheetLayout"] if kind == "pen" else config["sheetLayout"]
        img = up(terrain_sheet(tiles, kind, spec, layout))
        path = f"terrains/{name}.png"
        img.save(out / path)
        entry = {"name": name, "label": label, "tiles": path}
        if kind == "mesa":
            entry.update({"height": len(spec["face"]), "extrude": "up"})
        if kind == "pen":
            entry["connect"] = "edge"
        manifest["terrains"].append(entry)
        used |= used_tiles(kind, spec)

    def add_object(name, label, group, img, w=1, h=1, frame_count=1, anims=None):
        # Keep the published animation filenames: these replace older static
        # sprites and must not reuse their cached URLs when the pack is rebuilt.
        suffix = "_4frames" if name in {"door_grey_double", "door_orange_double"} else "_animated" if name in {"gate_orange", "chest_red", "chest_gold", "door_blue", "portal"} else ""
        path = f"objects/{name}{suffix}.png"
        up(img).save(out / path)
        entry = {"name": name, "label": OBJECT_LABELS.get(name, label), "group": object_group(name, group), "sprite": path, "footprint": [w, h]}
        if anims:
            entry["frameCount"] = frame_count
            entry["animations"] = [
                {"name": n, "label": lb, "frames": fr, **({"fps": fps} if len(fr) > 1 else {})} for n, lb, fr, fps in anims
            ]
        manifest["objects"].append(entry)

    def strip(images):
        out_img = Image.new("RGBA", (sum(i.width for i in images), max(i.height for i in images)))
        x = 0
        for i in images:
            out_img.paste(i, (x, 0))
            x += i.width
        return out_img

    for name, label, group, n, w, h in OBJECTS:
        add_object(name, label, group, tiles.block(n, w, h), w, h)
        used |= {n + r * COLS + c for r in range(h) for c in range(w)}
    for name, label, group, frames, w, h, anims in ANIMATED:
        add_object(name, label, group, strip([tiles.block(n, w, h) for n in frames]), w, h, len(frames), anims)
        used |= {n + r * COLS + c for n in frames for r in range(h) for c in range(w)}
    for n in range(tiles.cols * tiles.rows):  # every tile not used above
        if n in used or empty(tiles.tile(n)):
            continue
        add_object(f"tile_{n:03d}", f"图块 {n}", "其它图块", tiles.tile(n))
    for folder, size, group, prefix, chars in SPRITE_SHEETS:
        sheet = Sheet(args.pack, folder, size)
        if chars:  # one object per row (character), its frames as animations
            for r in range(sheet.rows):
                row = [sheet.tile(r * sheet.cols + c) for c in range(sheet.cols)]
                if all(empty(t) for t in row):
                    continue
                key = f"{folder.lower()}_{r + 1}"
                add_object(key, f"{prefix} {r + 1}", group, strip(row), frame_count=len(row), anims=chars)
            continue
        k = 0
        for n in range(sheet.cols * sheet.rows):
            t = sheet.tile(n)
            if empty(t):
                continue
            k += 1
            if folder == "Weapons" and 20 <= n <= 39:
                name = f"crosshair_{n - 19:02d}"
                path = f"ui/{name}.png"
                hud_ui.append({"name": name, "label": f"枪口准星 {n - 19}", "file": path, "kind": "icon"})
                continue
            add_object(f"{folder.lower()}_{n:03d}", f"{prefix} {k}", group, t)
    # Preserve source audio bytes and expose stable runtime references.
    sound_dir = out / 'sounds'
    sound_dir.mkdir(parents=True, exist_ok=True)
    manifest['sounds'] = []
    for source in sorted((Path(args.pack) / 'Sounds').glob('*.ogg')):
        shutil.copy2(source, sound_dir / source.name)
        manifest['sounds'].append({'name': source.stem, 'file': f'sounds/{source.name}'})
    for stale in (out / "objects").glob("weapons_0[23][0-9].png"):
        stale.unlink()
        Path(str(stale) + ".meta").unlink(missing_ok=True)
    convert_interface(args.pack, out, manifest)
    weapon_sheet = Sheet(args.pack, "Weapons", 24)
    for n in range(20, 40):
        up(weapon_sheet.tile(n)).save(out / f"ui/crosshair_{n - 19:02d}.png")
    manifest["ui"]["elements"].extend(hud_ui)
    write_pack(out,manifest,existing_uuids)
    print(f"wrote {out}: {len(manifest['terrains'])} terrains, {len(manifest['objects'])} objects")


if __name__ == "__main__":
    main()
