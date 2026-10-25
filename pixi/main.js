import { terrainMask } from '../shared/terrain-strategies.js';
// PixiJS v8 renderer for the dual-grid tilemap: one container per map layer
// inside a `world` container, sprites per display tile; the camera is just the
// world container's position / scale, and tile updates only swap textures.
import {
  Application,
  Container,
  Graphics,
  Rectangle,
  Sprite,
  Texture,
} from 'https://cdn.jsdelivr.net/npm/pixi.js@8.6.6/dist/pixi.min.mjs';
import { displayTileOrigin, objectDepth, objectFrame, objectRect, sheetFrames, terrainUsesCellPlacement, terrainHeights } from '../shared/grid.js';
import { runDemo } from '../shared/app.js';

runDemo(async ({ config, map, sheets, greySheets, objectSprites, greyObjectSprites, mount }) => {
  const T = config.tileSize;
  const terrainCount = config.terrains.length;
  const mapW = map.width * T;
  const mapH = map.height * T;

  const app = new Application();
  await app.init({
    width: mount.clientWidth || 1,
    height: mount.clientHeight || 1,
    background: map.backgroundColor,
    antialias: false,
    roundPixels: true, // snap sprite edges so neighbouring tiles never leave hairline gaps
    resolution: window.devicePixelRatio || 1,
    autoDensity: true,
  });
  mount.append(app.canvas);

  // textures[i][terrain][mask]: [0] full colour (active layer), [1] grey (other
  // layers). A raised terrain's texture is its whole region, top + wall.
  const rects = sheetFrames(config);
  const textures = [sheets, greySheets].map((imgs) =>
    imgs.map((img, t) => {
      const base = Texture.from(img);
      base.source.scaleMode = 'nearest';
      return rects[t].map((f) => new Texture({ source: base.source, frame: new Rectangle(f.x, f.y, f.w, f.h) }));
    }),
  );

  // objectTextures[i][type][frame], i as above (one per frame of the object's strip).
  const objectTextures = [objectSprites, greyObjectSprites].map((imgs) =>
    imgs.map((img, type) => {
      const base = Texture.from(img);
      base.source.scaleMode = 'nearest';
      const { frameCount, sw, sh } = map.objectDefs[type];
      if (frameCount === 1) return [base];
      return Array.from(
        { length: frameCount },
        (_, k) => new Texture({ source: base.source, frame: new Rectangle(k * sw, 0, sw, sh) }),
      );
    }),
  );

  const world = new Container();
  app.stage.addChild(world);

  // Border display tiles stick out half a tile; crop to the map rect.
  const crop = new Graphics().rect(0, 0, mapW, mapH).fill(0xffffff);
  world.addChild(crop);
  const tiles = new Container();
  tiles.mask = crop;
  world.addChild(tiles);

  // One container per map layer: flat display-grid terrains, flat cell-grid terrains
  // (roads), then raised cell-grid regions (top + wall, see grid.js) sorted by the
  // y of their top, so a southern top always covers the walls north of it.
  // Dual-grid sprites belong to display tiles, edge-terrain sprites to world
  // cells; each owns one sprite per terrain, created on first use where its
  // extrusion puts it.
  const heights = terrainHeights(config.terrains);
  const edges = terrainUsesCellPlacement(config.terrains);
  let DW = map.displayWidth;
  let DH = map.displayHeight;
  const views = new Map(); // layer -> { container, flat, flatCell, raised, slots: Sprite[][], cellSlots: Sprite[][] }

  function viewOf(layer) {
    let v = views.get(layer);
    if (!v) {
      const flat = new Container();
      const flatCell = new Container();
      const raised = new Container({ sortableChildren: true });
      const container = new Container();
      container.addChild(flat, flatCell, raised);
      v = { container, flat, flatCell, raised, slots: [], cellSlots: [], objects: new Map() };
      views.set(layer, v);
    }
    return v;
  }

  // Shows sprite slot[t] with texture `tex` (or hides it when tex is null),
  // creating it at (x, y) in the right container on first use.
  function show(v, slot, t, tex, x, y, flatParent) {
    let s = slot[t];
    if (!tex) {
      if (s) s.visible = false;
      return;
    }
    if (!s) {
      s = slot[t] = new Sprite(Texture.EMPTY);
      s.position.set(x, y);
      if (heights[t].height) {
        s.zIndex = y + (heights[t].height + 1) * T; // where it meets the ground: north to south
        v.raised.addChild(s);
      } else flatParent.addChild(s);
    }
    s.texture = tex;
    s.visible = true;
  }

  function drawTile(layer, dx, dy) {
    const v = viewOf(layer);
    const { grid } = layer;
    const set = textures[layer === map.activeLayer || !map.dimInactive ? 0 : 1];
    const slot = (v.slots[dy * DW + dx] ??= []);
    for (let t = 0; t < terrainCount; t++) {
      if (edges[t]) continue;
      const m = terrainMask(config.terrains[t], grid, dx, dy, t);
      const { x, y } = displayTileOrigin(dx, dy + heights[t].offset, T);
      show(v, slot, t, m ? set[t][m] : null, x, y, v.flat);
    }
    // Edge-terrain cells overlapping this display tile (a cell's look also
    // depends on its neighbours, which this keeps current).
    for (let cy = Math.max(dy - 1, 0); cy <= Math.min(dy, grid.height - 1); cy++) {
      for (let cx = Math.max(dx - 1, 0); cx <= Math.min(dx, grid.width - 1); cx++) {
        const i = cy * grid.width + cx;
        const cell = (v.cellSlots[i] ??= []);
        const value = grid.cells[i];
        const m = terrainMask(config.terrains[value], grid, cx, cy, value);
        for (let t = 0; t < terrainCount; t++) {
          if (!edges[t]) continue;
          show(v, cell, t, value === t ? set[t][m] : null, cx * T, (cy + heights[t].offset) * T, v.flatCell);
        }
      }
    }
  }

  return {
    resize(w, h) {
      app.renderer.resize(w, h);
    },
    setCamera({ x, y, scale }) {
      world.position.set(x, y);
      world.scale.set(scale);
    },
    drawAll() {
      app.renderer.background.color = map.backgroundColor;
      if (DW !== map.displayWidth || DH !== map.displayHeight) {
        for (const v of views.values()) v.container.destroy({ children: true });
        views.clear();
        DW = map.displayWidth;
        DH = map.displayHeight;
        crop.clear().rect(0, 0, map.width * T, map.height * T).fill(0xffffff);
      }
      // Re-stack containers in map order; drop views of deleted layers (an undo
      // that brings a layer back simply rebuilds its view).
      tiles.removeChildren();
      for (const [layer, v] of views) {
        if (!map.layers.includes(layer)) {
          v.container.destroy({ children: true });
          views.delete(layer);
        }
      }
      for (const layer of map.layers) {
        const v = viewOf(layer);
        v.container.visible = layer.visible;
        v.container.y = -layer.offset;
        tiles.addChild(v.container);
        for (let dy = 0; dy < DH; dy++) for (let dx = 0; dx < DW; dx++) drawTile(layer, dx, dy);
      }
      this.syncObjects();
    },
    // One sprite per object, in the layer's sorted `raised` container with the
    // tiles; sorted by objectDepth among them.
    syncObjects() {
      for (const layer of map.layers) {
        const v = viewOf(layer);
        const set = objectTextures[layer === map.activeLayer || !map.dimInactive ? 0 : 1];
        const seen = new Set(layer.objects);
        for (const [o, s] of v.objects) {
          if (!seen.has(o)) {
            s.destroy();
            v.objects.delete(o);
          }
        }
        const now = performance.now();
        for (const o of layer.objects) {
          const frame = set[o.type][objectFrame(map.objectDefs[o.type], now, o)];
          let s = v.objects.get(o);
          if (!s) {
            s = new Sprite(frame);
            const r = objectRect(map.objectDefs[o.type], o, T);
            s.position.set(r.left, r.top);
            s.zIndex = objectDepth(map.objectDefs[o.type], o, T);
            v.raised.addChild(s);
            v.objects.set(o, s);
          }
          s.texture = frame;
        }
        // Stable depth ties follow the order edited in the layer's object list.
        if(!v.objectOrder||v.objectOrder.length!==layer.objects.length||v.objectOrder.some((o,i)=>o!==layer.objects[i])){
          for(const o of layer.objects){const sprite=v.objects.get(o);v.raised.removeChild(sprite);v.raised.addChild(sprite);}
          v.objectOrder=layer.objects.slice();
        }
      }
    },
    moveLayers() {
      for (const layer of map.layers) {
        const v = views.get(layer);
        if (v) v.container.y = -layer.offset;
      }
    },
    drawTiles(list) {
      // Pixi sprites belong to their source tile, so the extra face rows in
      // `list` only redo work; that keeps both renderers on one dirty set.
      for (const layer of map.layers) for (const [dx, dy] of list) drawTile(layer, dx, dy);
    },
  };
});
