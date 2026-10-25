// Starting maps. `config.map.scene` picks one (overridable with ?scene=...):
//   island  noise island, one layer per dual-grid terrain (the original demo)
//   city    a walled town: grass, a paved plaza and dirt roads (tiles), a city
//           wall (edge tiles) joined to towers and gates, and houses, courtyard
//           houses, a hall, trees, stalls, crates and people (objects)
//   desert  Kenney's Desert Shooter Pack as a tile pack (packs/kenney-desert,
//           tools/convert_kenney.py): sand, grass patches, mesas, a fence
//           and a few of its objects

import { EMPTY, TileMap, layeredIsland, objectDefs, terrainUsesCellPlacement, terrainHeights } from './grid.js';

export const SCENES = {
  island: (config) => {
    const { width, height, seed } = config.map;
    const map = layeredIsland(width, height, config.terrains, seed);
    map.active = Math.min(2, map.layers.length - 1);
    return map;
  },
  city: cityScene,
  desert: desertScene,
};

// Tile packs (packs/<id>/, see packs.js) a scene is built from; the editor
// loads them for that scene if they aren't opened already.
export const SCENE_PACKS = {
  desert: ['packs/kenney-desert/'],
};

export function buildScene(name, config) {
  const make = SCENES[name] ?? SCENES.island;
  const map = make(config);
  map.objectDefs = objectDefs(config);
  map.tileSize = config.tileSize;
  for (const layer of map.layers) map.refreshPorts(layer);
  return map;
}

// Inclusive cell ranges.
function* rect(x0, y0, x1, y1) {
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) yield [x, y];
}
function* hline(x0, x1, y) {
  yield* rect(x0, y, x1, y);
}
function* vline(x, y0, y1) {
  yield* rect(x, y0, x, y1);
}

// Writes edge terrain t into `cells`, each linked to the given cells beside it
// (so separate calls stay unconnected, like separate strokes).
function paintEdge(grid, cells, t) {
  const set = new Set();
  for (const [x, y] of cells) if (grid.inBounds(x, y)) set.add(y * grid.width + x);
  for (const i of set) {
    const x = i % grid.width;
    const y = (i - x) / grid.width;
    let links = 0;
    if (y > 0 && set.has(i - grid.width)) links |= 1; // N
    if (x < grid.width - 1 && set.has(i + 1)) links |= 2; // E
    if (y < grid.height - 1 && set.has(i + grid.width)) links |= 4; // S
    if (x > 0 && set.has(i - 1)) links |= 8; // W
    grid.cells[i] = t;
    grid.links[i] = links;
  }
}

// Layout traced from the reference picture (1536x1024) at ~43 px per cell.
function cityScene(config) {
  const { terrains } = config;
  const id = (name) => {
    const t = terrains.findIndex((x) => x.name === name);
    if (t < 0) throw new Error(`city 场景需要地形 ${name}`);
    return t;
  };
  const W = 36;
  const H = 24;
  const map = new TileMap(W, H, terrainHeights(terrains), terrainUsesCellPlacement(terrains));
  const layer = (name) => {
    const l = map.createLayer(name);
    map.layers.push(l);
    return l.grid;
  };

  const ground = layer('草地');
  ground.cells.fill(id('grass'));

  const plaza = layer('广场');
  paintEdge(plaza, rect(14, 9, 21, 14), id('plaza'));

  // Roads: one network, every adjacent pair joined. Main axes run through the
  // two gates and stop at the plaza; side lanes lead to house fronts.
  const roads = layer('道路');
  paintEdge(
    roads,
    [
      ...vline(18, 0, 8),
      ...vline(18, 15, 23),
      ...hline(3, 13, 12),
      ...hline(22, 33, 12),
      ...vline(10, 9, 14),
      ...vline(25, 9, 14),
      ...vline(15, 7, 8),
      ...vline(20, 7, 8),
      ...vline(5, 11, 11),
      ...vline(8, 20, 20),
      ...vline(21, 19, 20),
      ...vline(27, 19, 20),
    ],
    id('road'),
  );

  // The wall and every object share a layer, so they sort north to south
  // among each other (a person behind the wall is hidden by it).
  const build = layer('建筑');
  const wall = id('wall');
  const obj = (name) => config.objects.findIndex((o) => o.name === name);
  const gate = 18;
  // The wall runs the full loop; gates and towers are connector objects on it,
  // so their cells are cleared and the wall on either side links into them.
  paintEdge(build, [...hline(2, 34, 3), ...hline(2, 34, 21), ...vline(2, 3, 21), ...vline(34, 3, 21)], wall);
  // [type, x, y]: top-left cell of the footprint (see config.objects).
  const objects = [
    // towers on the corners and gates on the main road, joined to the wall
    ['tower', 2, 3], ['tower', 34, 3], ['tower', 2, 21], ['tower', 34, 21],
    ['gate', gate - 1, 3], ['gate', gate - 1, 21],
    // houses, the hall on the plaza
    ['house_large', 7, 6], ['house_small', 15, 5], ['house_small', 20, 5], ['courtyard', 23, 5],
    ['house_small', 5, 9], ['house_wide', 29, 10], ['hall', 15, 9],
    ['courtyard_large', 5, 16], ['house_small', 14, 17], ['house_wide', 20, 17], ['house_long', 24, 16],
    // market stalls, banners before the hall, trees
    ['stall_cloth', 11, 11], ['stall_gold', 23, 11],
    ['banner', 14, 12], ['banner', 21, 12],
    ['tree', 4, 5], ['tree', 30, 6], ['tree', 3, 17], ['tree', 31, 16],
    // people
    ['person_blue', 18, 5], ['person_hat', 8, 12], ['person_blue', 16, 14],
    ['person_red', 20, 14], ['person_blue', 29, 12], ['person_red', 17, 17],
  ];
  for (const [name, x, y] of objects) {
    const type = obj(name);
    if (type < 0) continue;
    const [w, h] = config.objects[type].footprint;
    for (const [cx, cy] of rect(x, y, x + w - 1, y + h - 1)) {
      if (!build.inBounds(cx, cy)) continue;
      build.cells[cy * W + cx] = EMPTY; // object cells hold no tile
    }
    map.layers[3].objects.push({ type, x, y });
  }

  map.active = 2; // roads
  return map;
}

// Kenney desert demo: purple / teal grass patches on sand, two mesas whose
// tops are raised over their cells (extrude "up"), a fenced yard, props and
// a few animated objects (walk cycles, a sliding door).
function desertScene(config) {
  const { terrains } = config;
  const P = 'kenney-desert/';
  const id = (name) => {
    const t = terrains.findIndex((x) => x.name === P + name);
    if (t < 0) throw new Error(`desert 场景需要地块包 kenney-desert 的地形 ${name}`);
    return t;
  };
  const W = 30;
  const H = 20;
  const map = new TileMap(W, H, terrainHeights(terrains), terrainUsesCellPlacement(terrains));
  const layer = (name, terrain, cells) => {
    const l = map.createLayer(name);
    const t = id(terrain);
    for (const [x, y] of cells) if (l.grid.inBounds(x, y)) l.grid.cells[y * W + x] = t;
    map.layers.push(l);
    return l;
  };
  const disc = function* (cx, cy, r) {
    for (let y = cy - r; y <= cy + r; y++)
      for (let x = cx - r; x <= cx + r; x++) if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r + r) yield [x, y];
  };
  layer('沙地', 'sand', rect(0, 0, W - 1, H - 1));
  layer('紫草', 'purple', [...disc(6, 13, 3), ...disc(9, 15, 2), ...rect(17, 14, 19, 17), [21, 15]]);
  layer('青草', 'teal', [...disc(23, 4, 2), ...disc(26, 6, 2), ...rect(12, 1, 15, 2)]);
  // an L-shaped mesa with a notch, and a smaller one with a ledge
  layer('紫色高台', 'mesa', [...rect(1, 1, 9, 4), ...rect(1, 5, 4, 8), ...rect(7, 5, 9, 6), [5, 1], [6, 2]]);
  layer('青色高台', 'mesa_teal', [...rect(19, 9, 26, 11), ...rect(23, 12, 26, 13), ...rect(20, 8, 21, 8)]);
  const yard = map.createLayer('围栏');
  map.layers.push(yard);
  paintEdge(yard.grid, [...hline(12, 16, 9), ...hline(12, 16, 13), ...vline(12, 9, 13), ...vline(16, 9, 13)], id('fence'));
  const obj = (name) => config.objects.findIndex((o) => o.name === P + name);
  for (const [name, x, y, anim] of [
    ['chest_gold', 14, 11], ['barrel', 13, 10], ['cactus', 11, 6], ['cactus_small', 17, 7],
    ['tree_teal', 24, 15], ['skeleton', 3, 16], ['rock_pile', 27, 17], ['lamp', 18, 11],
    // animated: walk cycles and a sliding door opening and closing
    ['players_1', 14, 15], ['players_3', 11, 11], ['enemies_1', 22, 17], ['enemies_4', 27, 3],
    ['door_grey', 14, 13, 'cycle'], ['enemies_3', 20, 6, 'jump'],
  ]) {
    const type = obj(name);
    if (type >= 0) yard.objects.push(anim ? { type, x, y, anim } : { type, x, y });
  }
  map.active = 1;
  return map;
}
