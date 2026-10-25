import { offlineData } from './offline.js';
// Shared TileMap data structures and renderer-neutral geometry helpers.
//
// World grid  : width x height cells, each holds a terrain id or EMPTY.
// Display grid: (width+1) x (height+1) tiles, offset by half a tile. Display tile
//               (dx, dy) sits on the corner shared by world cells
//               (dx-1, dy-1) (dx, dy-1) (dx-1, dy) (dx, dy), and picks its sprite
//               from those 4 corners -> 2^4 = 16 variants per terrain.
// The placement algorithms themselves live in terrain-strategies.js; this file
// only owns the shared grid data and renderer-neutral geometry.
//
// Edge-connected terrains (`connect: "edge"` in config: roads, city walls) are
// drawn on the world grid instead, one tile per cell, picked by which of its
// 4 sides connect (N=1 E=2 S=4 W=8 -> 16 variants). Connections are stored per
// cell in `links` and count only when both cells hold the same terrain and
// both link to each other, so two roads side by side can stay separate.
//
// Objects (buildings, trees, people) are not tiles: each is a sprite standing on
// a w x h footprint of cells, listed per layer. Connector objects (towers,
// gates) declare which sides accept which edge terrain; their border cells
// then count as linked for that terrain (TerrainGrid.ports), so a wall runs right
// up to them.
//
// A TileMap is a stack of independent layers, each its own TerrainGrid. Within a
// layer every terrain present at a display tile is drawn with mask `cell == t`;
// nothing is filled in automatically underneath. Overlap (grass on sand on
// water) comes from painting on separate layers.
//
// Height: a terrain with `height` h > 0 in config is drawn as a raised block
// in a 3/4 view, h tiles tall. `extrude: "up"` (a wall) keeps the painted
// cells as the base and lifts the top h tiles up; "down" (default, a plateau
// or cliff) keeps the top on the painted cells and hangs the face below.
// The wall art lives in the tile sheet: each region is one tile wide and
// h + 1 tiles tall, the top in its first tile and the wall below it. Each
// layer draws its flat terrains, then the raised regions from north to south,
// so a southern top always covers the walls behind it — all the occlusion a
// straight extrusion needs.

export const TL = 1;
export const TR = 2;
export const BL = 4;
export const BR = 8;
export const MASK_COUNT = 16;
export const EMPTY = 255;
export const MAX_LAYER_OFFSET = 256; // px

// Edge-connection directions: bit, cell offset and the opposite bit.
export const N = 1;
export const E = 2;
export const S = 4;
export const W = 8;
export const DIRS = [
  { bit: N, dx: 0, dy: -1, back: S },
  { bit: E, dx: 1, dy: 0, back: W },
  { bit: S, dx: 0, dy: 1, back: N },
  { bit: W, dx: -1, dy: 0, back: E },
];

// Bit of the side of (x0, y0) facing the 4-neighbour (x1, y1); 0 if not adjacent.
export function dirBit(x0, y0, x1, y1) {
  for (const d of DIRS) if (x0 + d.dx === x1 && y0 + d.dy === y1) return d.bit;
  return 0;
}

// Per-terrain world-cell rendering flag (explicit edge links or Wang labels).
export function terrainUsesCellPlacement(terrains) {
  return terrains.map((t) => t.connect === 'edge' || t.connect === 'wang');
}

// Per-terrain extrusion from config: { height, offset }, where offset is how
// many display rows the top is drawn below its source tile (-height for "up").
export function terrainHeights(terrains) {
  return terrains.map((t) => {
    const height = Math.max(0, Math.round(t.height ?? 0));
    return { height, offset: t.extrude === 'up' ? -height : 0 };
  });
}

export async function loadConfig(url) {
  if(offlineData())return structuredClone(offlineData().config);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`failed to load ${url}: ${res.status}`);
  return res.json();
}

// Tile sheet layout, one PNG per terrain (written by tools/gen_tileset.py):
// 4 x 4 regions; `layout[row][col]` is the mask drawn there (config.sheetLayout).
// A region is 1 tile wide and `rows` = height + 1 tiles tall (top, then wall).
// Edge-connected terrains use config.edgeSheetLayout (masks are side bits).
// The default is the common community template (jess::codes), which is itself
// a valid dual-grid patch: a 5 x 5 corner grid whose 16
// 2x2 windows are the 16 masks, so neighbouring tiles join up and the sheet
// reads as one connected shape instead of 16 loose pieces.
export const SHEET_COLUMNS = 4;

export function sheetFrame(mask, tileSize, layout, rows = 1) {
  const i = layout.flat().indexOf(mask);
  if (i < 0) throw new Error(`sheetLayout 缺少 mask ${mask}`);
  return {
    x: (i % SHEET_COLUMNS) * tileSize,
    y: Math.floor(i / SHEET_COLUMNS) * rows * tileSize,
    w: tileSize,
    h: rows * tileSize,
  };
}

// frames[terrain][mask]: each terrain's region rects in its own sheet.
export function sheetFrames(config) {
  const edges = terrainUsesCellPlacement(config.terrains);
  return terrainHeights(config.terrains).map(({ height }, t) => {
    const wang = config.terrains[t].wang;
    if (config.terrains[t].connect === 'wang') return wang.tiles.map((_, i) => ({
      x: i % wang.columns * config.tileSize, y: Math.floor(i / wang.columns) * config.tileSize,
      w: config.tileSize, h: config.tileSize,
    }));
    const layout = edges[t] ? config.edgeSheetLayout : config.sheetLayout;
    return Array.from({ length: MASK_COUNT }, (_, m) => sheetFrame(m, config.tileSize, layout, height + 1));
  });
}

// Top-left pixel of a display tile. World cell (x, y) covers [x*T, (x+1)*T),
// so display tiles are shifted up-left by half a tile.
export function displayTileOrigin(dx, dy, tileSize) {
  return { x: (dx - 0.5) * tileSize, y: (dy - 0.5) * tileSize };
}

export class TerrainGrid {
  constructor(width, height, fill = EMPTY) {
    this.width = width;
    this.height = height;
    this.cells = new Uint8Array(width * height).fill(fill);
    this.wang = {}; // sparse immutable per-cell edge labels, chosen tile ID and lock
    this.links = new Uint8Array(width * height); // edge-connection bits per cell
    // Sides of a cell covered by a connector object that accept a link from
    // the neighbour, and the terrain they accept (see TileMap.refreshPorts).
    this.ports = new Uint8Array(width * height);
    this.portTerrain = new Uint8Array(width * height).fill(EMPTY);
  }

  get displayWidth() {
    return this.width + 1;
  }

  get displayHeight() {
    return this.height + 1;
  }

  inBounds(x, y) {
    return x >= 0 && y >= 0 && x < this.width && y < this.height;
  }

  // Out-of-range reads clamp to the nearest edge cell so the map border
  // continues the terrain instead of fading to the base terrain.
  get(x, y) {
    x = Math.min(Math.max(x, 0), this.width - 1);
    y = Math.min(Math.max(y, 0), this.height - 1);
    return this.cells[y * this.width + x];
  }

  // 4-bit corner mask of display tile (dx, dy) for `terrain`.
  cornerMask(dx, dy, terrain) {
    let m = 0;
    if (this.get(dx - 1, dy - 1) === terrain) m |= TL;
    if (this.get(dx, dy - 1) === terrain) m |= TR;
    if (this.get(dx - 1, dy) === terrain) m |= BL;
    if (this.get(dx, dy) === terrain) m |= BR;
    return m;
  }

  get directions() { return DIRS; }

  // Distinct terrains at the 4 corners of display tile (dx, dy), lowest id first.
  terrainsAt(dx, dy) {
    const out = [];
    for (const v of [this.get(dx - 1, dy - 1), this.get(dx, dy - 1), this.get(dx - 1, dy), this.get(dx, dy)])
      if (v !== EMPTY && !out.includes(v)) out.push(v);
    return out.sort((a, b) => a - b);
  }
}

// A stack of layers (bottom first). Layer: { id, name, visible, offset, grid, objects }.
// objects: [{ type, x, y }] with (x, y) the top-left cell of the footprint.
// `offset` lifts the whole layer that many pixels (at 1:1 zoom) up the screen
// (negative: down). Renderers apply it when presenting the layer, so it never
// changes which tiles need redrawing; hit-testing and the overlay follow it.
// `heights` (from terrainHeights) says how far raised terrains reach on screen.
export class TileMap {
  constructor(width, height, heights = [], edges = []) {
    this.width = width;
    this.height = height;
    this.edges = edges; // edges[t]: terrain t is edge-connected
    // Display rows a changed source tile can paint above / below itself.
    this.reachUp = Math.max(0, ...heights.map((e) => -e.offset));
    this.reachDown = Math.max(0, ...heights.map((e) => e.height + e.offset));
    this.layers = [];
    this.active = 0; // index of the layer being edited
    this.dimInactive = true; // draw layers other than the active one in grey
    this.nextId = 1;
    this.objectDefs = []; // from objectDefs(); set by the scene
    this.backgroundColor = '#6b9fc4';
    this.tileSize = 32; // only used to size object sprites when marking them dirty
  }

  get displayWidth() {
    return this.width + 1;
  }

  get displayHeight() {
    return this.height + 1;
  }

  isEdge(t) {
    return !!this.edges[t];
  }

  get activeLayer() {
    return this.layers[this.active];
  }

  createLayer(name) {
    const id = this.nextId++;
    return {
      id,
      name: name ?? `Capa ${id}`,
      visible: true,
      offset: 0,
      grid: new TerrainGrid(this.width, this.height),
      objects: [],
    };
  }

  insertLayer(layer, index) {
    this.layers.splice(index, 0, layer);
    this.active = index;
  }

  removeLayer(index) {
    const [layer] = this.layers.splice(index, 1);
    this.active = Math.min(this.active, this.layers.length - 1);
    return layer;
  }

  // Whether object type `type` fits at (x, y): its footprint inside the map.
  // Objects never block each other; overlapping ones just sort by depth.
  canPlace(layer, type, x, y) {
    const def = this.objectDefs[type];
    return x >= 0 && y >= 0 && x + def.w <= this.width && y + def.h <= this.height;
  }

  // Rebuild `layer.grid.ports` from its connector objects.
  refreshPorts(layer) {
    const { grid } = layer;
    grid.ports.fill(0);
    grid.portTerrain.fill(EMPTY);
    for (const o of layer.objects) {
      const def = this.objectDefs[o.type];
      if (!def?.connects) continue;
      const { terrain, sides } = def.connects;
      for (let y = o.y; y < o.y + def.h; y++) {
        for (let x = o.x; x < o.x + def.w; x++) {
          if (!grid.inBounds(x, y)) continue;
          let bits = 0;
          if (y === o.y) bits |= sides & N;
          if (y === o.y + def.h - 1) bits |= sides & S;
          if (x === o.x) bits |= sides & W;
          if (x === o.x + def.w - 1) bits |= sides & E;
          const i = y * grid.width + x;
          grid.ports[i] = bits;
          grid.portTerrain[i] = terrain;
        }
      }
    }
  }

  // Mark everything an object touches: the display tiles under its sprite, and
  // the cells around its footprint (walls there may link into its ports).
  markObject(dirty, obj) {
    const def = this.objectDefs[obj.type];
    const T = this.tileSize;
    const r = objectRect(def, obj, T);
    const DW = this.displayWidth;
    const x0 = Math.max(0, Math.floor(r.left / T + 0.5));
    const x1 = Math.min(DW - 1, Math.floor(r.right / T + 0.5));
    const y0 = Math.max(0, Math.floor(r.top / T + 0.5));
    const y1 = Math.min(this.displayHeight - 1, Math.floor(r.bottom / T + 0.5));
    for (let dy = y0; dy <= y1; dy++) for (let dx = x0; dx <= x1; dx++) dirty.set(dy * DW + dx, [dx, dy]);
    for (let y = obj.y - 1; y <= obj.y + def.h; y++)
      for (let x = obj.x - 1; x <= obj.x + def.w; x++)
        if (x >= 0 && y >= 0 && x < this.width && y < this.height) this.markDirty(dirty, x, y);
  }

  // Record the 4 display tiles that sample world cell (x, y) into `dirty`
  // (Map keyed by display index, value [dx, dy]), plus the tiles above / below
  // them that a raised terrain's top or face can reach.
  markDirty(dirty, x, y) {
    const DW = this.displayWidth;
    const first = Math.max(y - this.reachUp, 0);
    const last = Math.min(y + 1 + this.reachDown, this.displayHeight - 1);
    for (let dy = first; dy <= last; dy++) {
      dirty.set(dy * DW + x, [x, dy]);
      dirty.set(dy * DW + x + 1, [x + 1, dy]);
    }
  }
}

// ---- objects ------------------------------------------------------------------

// An object's frames and animations from its config entry. The sprite is a
// strip of `frameCount` equal frames side by side; each animation plays a
// list of them: { name, label, frames: [frame index...], fps }. The first
// animation is the default. Short forms: "frames": n, "fps" (one animation
// through all n frames), or neither (one still frame).
export function objectAnimations(o) {
  if (Array.isArray(o.animations) && o.animations.length) {
    const animations = o.animations.map((a, i) => ({
      name: a.name ?? `anim${i}`,
      label: a.label ?? a.name ?? `Animación ${i + 1}`,
      frames: a.frames?.length ? a.frames : [0],
      fps: a.fps ?? 6,
    }));
    const frameCount = o.frameCount ?? Math.max(...animations.flatMap((a) => a.frames)) + 1;
    return { frameCount, animations };
  }
  const n = Math.max(1, Math.round(o.frames ?? 1));
  return {
    frameCount: n,
    animations: [{ name: 'default', label: n > 1 ? 'Animación' : '静止', frames: [...Array(n).keys()], fps: o.fps ?? 6 }],
  };
}

// Object types from config.objects: { name, label, w, h (footprint in cells),
// sw, sh (one frame's size in px, from the loaded images), frameCount,
// animations (see objectAnimations), animated, connects: { terrain, sides } }.
// A placed object may name one of its type's animations in `anim`.
export function objectDefs(config, sprites = []) {
  const T = config.tileSize;
  return (config.objects ?? []).map((o, i) => {
    const [w, h] = o.footprint;
    const c = o.connects;
    const { frameCount, animations } = objectAnimations(o);
    return {
      name: o.name,
      label: o.label ?? o.name,
      w,
      h,
      frameCount,
      animations,
      animated: animations.some((a) => a.frames.length > 1),
      sw: sprites[i] ? sprites[i].width / frameCount : w * T,
      sh: sprites[i]?.height ?? h * T,
      connects: c
        ? { terrain: config.terrains.findIndex((t) => t.name === c.terrain), sides: sideBits(c.sides) }
        : null,
    };
  });
}

// The animation a placed object plays (its `anim`, else its type's first).
export function objectAnim(def, obj) {
  return def.animations.find((a) => a.name === obj?.anim) ?? def.animations[0];
}

// Frame of the strip to show for `obj` (null: the type's default animation) at
// time `ms`, on a shared clock so objects playing one animation move in step.
// An object with `paused: true` holds its animation's first frame.
export function objectFrame(def, ms, obj = null) {
  const a = objectAnim(def, obj);
  if (obj?.paused || a.frames.length < 2) return a.frames[0];
  return a.frames[Math.floor((ms * a.fps) / 1000) % a.frames.length];
}

// "NESW" -> side bits.
export function sideBits(sides) {
  let bits = 0;
  for (const ch of sides) bits |= { N, E, S, W }[ch] ?? 0;
  return bits;
}

export function objectCovers(def, obj, x, y) {
  return x >= obj.x && y >= obj.y && x < obj.x + def.w && y < obj.y + def.h;
}

// Sprite rect in map pixels: bottom on the footprint's bottom edge,
// horizontally centred on it.
export function objectRect(def, obj, T) {
  const bottom = (obj.y + def.h) * T;
  const left = (obj.x + def.w / 2) * T - def.sw / 2;
  return { left, top: bottom - def.sh, right: left + def.sw, bottom };
}

// Draw-order key of an object among raised tiles (which sort by the y where
// they meet the ground): its footprint's bottom, just after tiles on the same
// line. A wall further south therefore covers a tower it joins, as it should.
export function objectDepth(def, obj, T) {
  return (obj.y + def.h) * T + 0.5;
}

// Island-shaped fractal noise; thresholds[t] is the min noise for terrain t.
// Returns one terrain id per cell.
export function generateTerrain(w, h, seed, thresholds) {
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const nx = (x + 0.5) / w - 0.5;
      const ny = (y + 0.5) / h - 0.5;
      const falloff = 1 - Math.min(1, Math.hypot(nx, ny) * 1.6);
      const n = fbm(x / 7, y / 7, seed) * 0.65 + falloff * 0.45;
      let t = 0;
      for (let i = 1; i < thresholds.length; i++) if (n >= thresholds[i]) t = i;
      out[y * w + x] = t;
    }
  }
  return out;
}

// Starting map: one layer per terrain, each covering every cell at or above
// that terrain's elevation, so the island reads as grass on sand on water.
export function layeredIsland(width, height, terrains, seed) {
  const map = new TileMap(width, height, terrainHeights(terrains), terrainUsesCellPlacement(terrains));
  const elevation = generateTerrain(
    width,
    height,
    seed,
    terrains.map((t) => t.threshold),
  );
  terrains.forEach((terrain, t) => {
    if (terrain.connect === 'edge') return; // roads / walls start empty, drawn by hand
    if (terrain.threshold == null) return; // not part of the island (e.g. imported tile sets)
    const layer = map.createLayer(terrain.name);
    for (let i = 0; i < elevation.length; i++) if (elevation[i] >= t) layer.grid.cells[i] = t;
    map.layers.push(layer);
  });
  return map;
}

// ---- cell rasterizers (yield [x, y]) ---------------------------------------

// Round brush footprint centred on (cx, cy).
export function* brushCells(cx, cy, size) {
  const r = size - 1;
  for (let oy = -r; oy <= r; oy++)
    for (let ox = -r; ox <= r; ox++) if (ox * ox + oy * oy <= r * r + r) yield [cx + ox, cy + oy];
}

// Bresenham line, inclusive and 4-connected: diagonal steps get an extra cell,
// because cells touching only at a corner render as separate blobs in a dual grid.
export function* lineCells(x0, y0, x1, y1) {
  const dx = Math.abs(x1 - x0);
  const dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  for (;;) {
    yield [x0, y0];
    if (x0 === x1 && y0 === y1) return;
    const e2 = 2 * err;
    const stepX = e2 >= dy;
    const stepY = e2 <= dx;
    if (stepX && stepY) yield [x0 + sx, y0];
    if (stepX) {
      err += dy;
      x0 += sx;
    }
    if (stepY) {
      err += dx;
      y0 += sy;
    }
  }
}

// Axis-aligned rectangle spanned by two corner cells.
export function* rectCells(x0, y0, x1, y1, filled) {
  const [ax, bx] = x0 < x1 ? [x0, x1] : [x1, x0];
  const [ay, by] = y0 < y1 ? [y0, y1] : [y1, y0];
  for (let y = ay; y <= by; y++)
    for (let x = ax; x <= bx; x++) if (filled || x === ax || x === bx || y === ay || y === by) yield [x, y];
}

// Circle centred on (cx, cy) with radius r (in cells). The outline keeps every
// disc cell with an 8-neighbour outside the disc, which makes it 4-connected.
export function* circleCells(cx, cy, r, filled) {
  const outer = (r + 0.5) ** 2;
  const inside = (ox, oy) => ox * ox + oy * oy <= outer;
  const R = Math.ceil(r);
  for (let oy = -R; oy <= R; oy++) {
    for (let ox = -R; ox <= R; ox++) {
      if (!inside(ox, oy)) continue;
      const edge =
        !inside(ox + 1, oy) ||
        !inside(ox - 1, oy) ||
        !inside(ox, oy + 1) ||
        !inside(ox, oy - 1) ||
        !inside(ox + 1, oy + 1) ||
        !inside(ox - 1, oy - 1) ||
        !inside(ox + 1, oy - 1) ||
        !inside(ox - 1, oy + 1);
      if (filled || edge) yield [cx + ox, cy + oy];
    }
  }
}

// 4-connected region of cells sharing the value at (x, y), optionally confined
// to cells where `within(x, y)` holds.
export function floodFillCells(grid, x, y, within = null) {
  if (!grid.inBounds(x, y) || (within && !within(x, y))) return [];
  const { width: w, height: h, cells } = grid;
  const target = cells[y * w + x];
  const center=grid.wang[y*w+x]?.center;
  const seen = new Uint8Array(w * h);
  const stack = [y * w + x];
  const out = [];
  seen[y * w + x] = 1;
  while (stack.length) {
    const i = stack.pop();
    const cx = i % w;
    const cy = (i - cx) / w;
    out.push([cx, cy]);
    const visit = (nx, ny) => {
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) return;
      const j = ny * w + nx;
      if (seen[j] || cells[j] !== target || grid.wang[j]?.center !== center || (within && !within(nx, ny))) return;
      seen[j] = 1;
      stack.push(j);
    };
    visit(cx + 1, cy);
    visit(cx - 1, cy);
    visit(cx, cy + 1);
    visit(cx, cy - 1);
  }
  return out;
}

// ---- noise -----------------------------------------------------------------

function hash2(x, y, seed) {
  let h = Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(seed, 982451653);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967295;
}

function valueNoise(x, y, seed) {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const a = hash2(x0, y0, seed);
  const b = hash2(x0 + 1, y0, seed);
  const c = hash2(x0, y0 + 1, seed);
  const d = hash2(x0 + 1, y0 + 1, seed);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

function fbm(x, y, seed) {
  let sum = 0;
  let amp = 0.5;
  let norm = 0;
  for (let o = 0; o < 4; o++) {
    sum += valueNoise(x, y, seed + o * 101) * amp;
    norm += amp;
    x *= 2;
    y *= 2;
    amp *= 0.5;
  }
  return sum / norm;
}
