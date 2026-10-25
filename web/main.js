import { terrainMask } from '../shared/terrain-strategies.js';
// Canvas2D renderer for the dual-grid tilemap.
// Each layer's tiles are composed once into its own offscreen buffer at 1:1;
// each frame blits the visible buffers through the camera, shifted by each
// layer's pixel offset, so panning and zooming cost one drawImage per layer.
import { displayTileOrigin, objectDepth, objectFrame, objectRect, sheetFrames, terrainUsesCellPlacement, terrainHeights } from '../shared/grid.js';
import { runDemo } from '../shared/app.js';


runDemo(async ({ config, map, sheets, greySheets, objectSprites, greyObjectSprites, mount }) => {
  const T = config.tileSize;
  const frames = sheetFrames(config); // frames[terrain][mask]
  let mapW = map.width * T;
  let mapH = map.height * T;

  const buffers = new Map(); // layer -> { canvas, ctx }

  function bufferOf(layer) {
    let b = buffers.get(layer);
    if (!b) {
      const canvas = document.createElement('canvas');
      b = { canvas, ctx: canvas.getContext('2d') };
      buffers.set(layer, b);
    }
    if (b.canvas.width !== mapW || b.canvas.height !== mapH) {
      b.canvas.width = mapW;
      b.canvas.height = mapH;
      b.ctx.imageSmoothingEnabled = false;
    }
    return b;
  }

  const view = document.createElement('canvas');
  mount.append(view);
  const ctx = view.getContext('2d');

  let cam = { x: 0, y: 0, scale: 1 };
  let size = { w: 1, h: 1, dpr: 1 };
  let frame = 0;

  const heights = terrainHeights(config.terrains);
  const edges = terrainUsesCellPlacement(config.terrains);
  const ids = [...heights.keys()];
  const flatDisplay = ids.filter((t) => !edges[t] && !heights[t].height);
  const flatCell = ids.filter((t) => edges[t] && !heights[t].height);
  const raisedDisplay = ids.filter((t) => !edges[t] && heights[t].height);
  const raisedCell = ids.filter((t) => edges[t] && heights[t].height);

  // Composes screen tile (dx, dy) of one layer, clipped to its box: flat
  // dual-grid terrains, flat cell-grid terrains (roads), then every raised region
  // (top + wall) reaching this box, north to south so a southern top covers
  // the walls behind it. Display-grid regions sit on display tiles, edge-terrain
  // regions on world cells (half a tile further down-right).
  function drawTile(layer, dx, dy) {
    const { ctx: bctx } = bufferOf(layer);
    const box = displayTileOrigin(dx, dy, T);
    const { grid } = layer;
    const DH = map.displayHeight;
    const src = layer === map.activeLayer || !map.dimInactive ? sheets : greySheets;
    const draw = (t, m, x, y) => {
      const f = frames[t][m];
      if (!f) return;
      bctx.drawImage(src[t], f.x, f.y, f.w, f.h, x, y, f.w, f.h);
    };
    // World cells whose tile overlaps this box: columns dx-1 and dx.
    const cellsIn = (y0, y1, fn) => {
      for (let cy = Math.max(y0, 0); cy <= Math.min(y1, grid.height - 1); cy++)
        for (let cx = Math.max(dx - 1, 0); cx <= Math.min(dx, grid.width - 1); cx++) fn(cx, cy);
    };

    bctx.save();
    bctx.beginPath();
    bctx.rect(box.x, box.y, T, T);
    bctx.clip();
    bctx.clearRect(box.x, box.y, T, T);
    for (const t of flatDisplay) {
      const m = terrainMask(config.terrains[t], grid, dx, dy, t);
      if (m) draw(t, m, box.x, box.y);
    }
    for (const t of flatCell) {
      cellsIn(dy - 1, dy, (cx, cy) => {
        if (grid.cells[cy * grid.width + cx] === t) draw(t, terrainMask(config.terrains[t], grid, cx, cy, t), cx * T, cy * T);
      });
    }
    // Raised regions and objects, sorted by the y where they meet the ground
    // (painter's order); objects sort by objectDepth.
    const raised = []; // [ground y, draw()]
    for (const t of raisedDisplay) {
      const { height, offset } = heights[t];
      for (let sy = dy - offset - height; sy <= dy - offset; sy++) {
        if (sy < 0 || sy >= DH) continue;
        const m = terrainMask(config.terrains[t], grid, dx, sy, t);
        const y = (sy + offset - 0.5) * T;
        if (m) raised.push([y + (height + 1) * T, () => draw(t, m, box.x, y)]);
      }
    }
    for (const t of raisedCell) {
      const { height, offset } = heights[t];
      cellsIn(dy - offset - height - 1, dy - offset, (cx, cy) => {
        if (grid.cells[cy * grid.width + cx] !== t) return;
        const y = (cy + offset) * T;
        const m = terrainMask(config.terrains[t], grid, cx, cy, t);
        raised.push([y + (height + 1) * T, () => draw(t, m, cx * T, y)]);
      });
    }
    const sprites = layer === map.activeLayer || !map.dimInactive ? objectSprites : greyObjectSprites;
    const now = performance.now();
    for (const o of layer.objects) {
      const def = map.objectDefs[o.type];
      const r = objectRect(def, o, T);
      if (r.right <= box.x || r.left >= box.x + T || r.bottom <= box.y || r.top >= box.y + T) continue;
      const sx = objectFrame(def, now, o) * def.sw; // one frame of the strip (its animation)
      raised.push([
        objectDepth(def, o, T),
        () => bctx.drawImage(sprites[o.type], sx, 0, def.sw, def.sh, r.left, r.top, def.sw, def.sh),
      ]);
    }
    raised.sort((a, b) => a[0] - b[0]);
    for (const [, fn] of raised) fn();
    bctx.restore();
  }

  function present() {
    frame = 0;
    const { w, h, dpr } = size;
    const s = cam.scale;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = map.backgroundColor;
    ctx.fillRect(0, 0, w, h);
    ctx.imageSmoothingEnabled = s < 1; // smooth when zoomed out, crisp pixels when zoomed in
    // Offset layers stay cropped to the map rect, like the Pixi renderer.
    ctx.save();
    ctx.beginPath();
    ctx.rect(cam.x, cam.y, mapW * s, mapH * s);
    ctx.clip();
    for (const layer of map.layers) {
      if (!layer.visible) continue;
      ctx.drawImage(bufferOf(layer).canvas, cam.x, cam.y - layer.offset * s, mapW * s, mapH * s);
    }
    ctx.restore();
  }

  const schedule = () => {
    if (!frame) frame = requestAnimationFrame(present);
  };

  return {
    resize(w, h) {
      const dpr = window.devicePixelRatio || 1;
      size = { w, h, dpr };
      view.width = Math.round(w * dpr);
      view.height = Math.round(h * dpr);
      view.style.width = `${w}px`;
      view.style.height = `${h}px`;
      schedule();
    },
    setCamera({ x, y, scale }) {
      cam = { x, y, scale };
      schedule();
    },
    drawAll() {
      mapW = map.width * T;
      mapH = map.height * T;
      // Drop buffers of deleted layers (an undo that brings one back rebuilds it).
      for (const layer of buffers.keys()) if (!map.layers.includes(layer)) buffers.delete(layer);
      for (const layer of map.layers)
        for (let dy = 0; dy < map.displayHeight; dy++)
          for (let dx = 0; dx < map.displayWidth; dx++) drawTile(layer, dx, dy);
      schedule();
    },
    moveLayers: schedule, // offsets are applied in present()
    drawTiles(tiles) {
      for (const layer of map.layers) for (const [dx, dy] of tiles) drawTile(layer, dx, dy);
      schedule();
    },
  };
});
