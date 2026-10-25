// Reusable PixiJS renderer for a decoded tilemap.
import { Container, Graphics, Rectangle, Sprite, Texture } from 'https://cdn.jsdelivr.net/npm/pixi.js@8.6.6/dist/pixi.min.mjs';
import { terrainMask } from '../shared/terrain-strategies.js';
import { displayTileOrigin, objectDepth, objectFrame, objectRect, sheetFrames, terrainUsesCellPlacement, terrainHeights } from '../shared/grid.js';

export async function createPixiRenderer({ config, map, sheets, greySheets, objectSprites, greyObjectSprites, mount, app }) {
  const T = config.tileSize;
  const terrainCount = config.terrains.length;
  const mapW = map.width * T;
  const mapH = map.height * T;
  const rendererApp = app ?? await createApplication(mount, map.backgroundColor);
  if (mount && !rendererApp.canvas.parentNode) mount.append(rendererApp.canvas);
  const rects = sheetFrames(config);
  const textures = [sheets, greySheets].map((imgs) => imgs.map((img) => {
    const base = Texture.from(img); base.source.scaleMode = 'nearest';
    return rects[imgs.indexOf(img)].map((f) => new Texture({ source: base.source, frame: new Rectangle(f.x, f.y, f.w, f.h) }));
  }));
  const objectTextures = [objectSprites, greyObjectSprites].map((imgs) => imgs.map((img, type) => {
    const base = Texture.from(img); base.source.scaleMode = 'nearest';
    const { frameCount, sw, sh } = map.objectDefs[type];
    return frameCount === 1 ? [base] : Array.from({ length: frameCount }, (_, k) => new Texture({ source: base.source, frame: new Rectangle(k * sw, 0, sw, sh) }));
  }));
  const world = new Container(); rendererApp.stage.addChild(world);
  const crop = new Graphics().rect(0, 0, mapW, mapH).fill(0xffffff); world.addChild(crop);
  const tiles = new Container(); tiles.mask = crop; world.addChild(tiles);
  const heights = terrainHeights(config.terrains), edges = terrainUsesCellPlacement(config.terrains);
  let DW = map.displayWidth, DH = map.displayHeight;
  const views = new Map();
  const viewOf = (layer) => { let v = views.get(layer); if (!v) { const flat = new Container(), flatCell = new Container(), raised = new Container({ sortableChildren: true }), container = new Container(); container.addChild(flat, flatCell, raised); v = { container, flat, flatCell, raised, slots: [], cellSlots: [], objects: new Map() }; views.set(layer, v); } return v; };
  function show(v, slot, t, tex, x, y, flatParent) { let s = slot[t]; if (!tex) { if (s) s.visible = false; return; } if (!s) { s = slot[t] = new Sprite(Texture.EMPTY); s.position.set(x, y); if (heights[t].height) { s.zIndex = y + (heights[t].height + 1) * T; v.raised.addChild(s); } else flatParent.addChild(s); } s.texture = tex; s.visible = true; }
  function drawTile(layer, dx, dy) { const v = viewOf(layer), grid = layer.grid, set = textures[layer === map.activeLayer || !map.dimInactive ? 0 : 1], slot = (v.slots[dy * DW + dx] ??= []); for (let t = 0; t < terrainCount; t++) { if (edges[t]) continue; const m = terrainMask(config.terrains[t], grid, dx, dy, t), p = displayTileOrigin(dx, dy + heights[t].offset, T); show(v, slot, t, m ? set[t][m] : null, p.x, p.y, v.flat); } for (let cy = Math.max(dy - 1, 0); cy <= Math.min(dy, grid.height - 1); cy++) for (let cx = Math.max(dx - 1, 0); cx <= Math.min(dx, grid.width - 1); cx++) { const i = cy * grid.width + cx, cell = (v.cellSlots[i] ??= []), value = grid.cells[i], m = terrainMask(config.terrains[value], grid, cx, cy, value); for (let t = 0; t < terrainCount; t++) if (edges[t]) show(v, cell, t, value === t ? set[t][m] : null, cx * T, (cy + heights[t].offset) * T, v.flatCell); } }
  const api = { rendererApp, world, drawAll() { rendererApp.renderer.background.color = map.backgroundColor; tiles.removeChildren(); for (const layer of map.layers) { const v = viewOf(layer); v.container.visible = layer.visible; v.container.y = -layer.offset; tiles.addChild(v.container); for (let dy = 0; dy < DH; dy++) for (let dx = 0; dx < DW; dx++) drawTile(layer, dx, dy); } this.syncObjects(); }, syncObjects() { for (const layer of map.layers) { const v = viewOf(layer), set = objectTextures[layer === map.activeLayer || !map.dimInactive ? 0 : 1], seen = new Set(layer.objects); for (const [o, s] of v.objects) if (!seen.has(o)) { s.destroy(); v.objects.delete(o); } for (const o of layer.objects) { const frame = set[o.type][objectFrame(map.objectDefs[o.type], performance.now(), o)], r = objectRect(map.objectDefs[o.type], o, T); let s = v.objects.get(o); if (!s) { s = new Sprite(frame); s.position.set(r.left, r.top); s.zIndex = objectDepth(map.objectDefs[o.type], o, T); v.raised.addChild(s); v.objects.set(o, s); } s.texture = frame; } } }, setCamera({ x, y, scale }) { world.position.set(x, y); world.scale.set(scale); }, resize(w, h) { rendererApp.renderer.resize(w, h); } };
  api.drawAll();
  return api;
}

async function createApplication(mount, background) {
  const { Application } = await import('https://cdn.jsdelivr.net/npm/pixi.js@8.6.6/dist/pixi.min.mjs');
  const app = new Application(); await app.init({ width: mount?.clientWidth || 1, height: mount?.clientHeight || 1, background, antialias: false, roundPixels: true, resolution: globalThis.devicePixelRatio || 1, autoDensity: true }); return app;
}
