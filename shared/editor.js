import { paintWang, reconcileWangCenters, resolveWangCenter, wangPatternTile } from './wang.js';
// Editing tools + undo history, independent of any renderer.
// Every mutation goes through History so each gesture is one undo step and
// reports the display tiles it touched.

import {
  DIRS,
  TerrainGrid,
  EMPTY,
  MAX_LAYER_OFFSET,
  objectAnim,
  objectCovers,
  objectRect,
  brushCells,
  circleCells,
  dirBit,
  floodFillCells,
  lineCells,
  rectCells,
} from './grid.js';
import { polygonCells } from './selection.js';

export const TOOLS = ['pencil', 'eraser', 'shape', 'select', 'fill'];
export const SHAPES = ['line', 'circle', 'rect', 'circleOutline', 'rectOutline'];
export const SELECT_MODES = ['selectRect', 'selectCircle', 'selectWand', 'selectLasso'];
const MAX_UNDO = 100;
export const MAX_BRUSH = 8;
const FILLED_SHAPES = ['circle', 'rect'];
const TILE = 'tile'; // tap target: the tile under the tap (see ToolController#tapTarget)

// Stable immutable snapshot, including Wang metadata; strings compare by value.
const pack = (value, links, wang = null) => JSON.stringify([value, links, wang]);

// Undo entries:
//   { kind: 'cells', layer, changes: [[cellIndex, old, now], ...], objects? }   packed states;
//     objects: [before, after] lists when the gesture added / removed objects
//   { kind: 'insert' | 'remove', layer, index }   layer added / deleted
//   { kind: 'rename', layer, old, name } / { kind: 'offset', layer, old, offset }
export class History {
  constructor(map) {
    this.map = map;
    this.undoStack = [];
    this.redoStack = [];
    this.current = null; // { layer, clip, old: Map<cellIndex, packed state>, objects } of the open operation
  }

  // `clip` (a Selection or null): when set, writes outside it are ignored.
  begin(layer, clip = null) {
    this.current = { layer, clip, old: new Map(), objects: layer.objects.slice() };
  }

  // Replace the open operation's layer objects (placing / erasing).
  setObjects(list, dirty) {
    const { layer } = this.current;
    this.#swapObjects(layer, list, dirty);
  }

  #swapObjects(layer, list, dirty) {
    for (const o of layer.objects) this.map.markObject(dirty, o);
    layer.objects = list.slice();
    for (const o of layer.objects) this.map.markObject(dirty, o);
    this.map.refreshPorts(layer);
  }

  // Whether (x, y) can be written by the open operation.
  writable(x, y) {
    const { layer, clip } = this.current;
    return layer.grid.inBounds(x, y) && (!clip || clip.has(x, y));
  }

  // Sets a cell's terrain and edge links (links default to none).
  set(x, y, value, dirty, links = 0, wang = null, derived = false) {
    if (derived ? !this.current.layer.grid.inBounds(x,y) : !this.writable(x, y)) return;
    const { grid } = this.current.layer;
    const i = y * grid.width + x;
    const old = pack(grid.cells[i], grid.links[i], grid.wang[i]);
    const now = pack(value, links, wang);
    if (old === now) return;
    if (!this.current.old.has(i)) this.current.old.set(i, old);
    this.#write(this.current.layer, i, now, dirty);
    if(!derived)reconcileWangCenters(this,x,y,dirty);
  }

  // Undo the open operation's changes but keep it open (shape previews).
  revert(dirty) {
    const { layer, old, objects } = this.current;
    for (const [i, v] of old) this.#write(layer, i, v, dirty);
    old.clear();
    if (!sameList(layer.objects, objects)) this.#swapObjects(layer, objects, dirty);
  }

  commit(record = true) {
    const { layer, old } = this.current;
    const changes = [];
    for (const [i, v] of old) {
      const now = pack(layer.grid.cells[i], layer.grid.links[i], layer.grid.wang[i]);
      if (now !== v) changes.push([i, v, now]);
    }
    const entry = { kind: 'cells', layer, changes };
    if (!sameList(layer.objects, this.current.objects)) entry.objects = [this.current.objects, layer.objects.slice()];
    this.current = null;
    if (record && (changes.length || entry.objects)) this.#push(entry);
    return entry;
  }

  cancel(dirty) {
    if (!this.current) return;
    this.revert(dirty);
    this.current = null;
  }

  insertLayer(layer, index) {
    this.map.insertLayer(layer, index);
    this.#push({ kind: 'insert', layer, index });
  }

  removeLayer(index) {
    const layer = this.map.removeLayer(index);
    this.#push({ kind: 'remove', layer, index });
  }

  moveLayer(from, to) {
    if (from === to || !this.map.layers[from] || !this.map.layers[to]) return;
    this.#moveLayer(from, to);
    this.#push({ kind: 'reorder', from, to });
  }

  moveObjectToLayer(object, target) {
    const from = this.map.activeLayer;
    const to = this.map.layers[target];
    if (this.current || !to || to === from || !from.objects.includes(object)) return false;
    const entry = { kind: 'object-layer', from, to,
      before: [from.objects.slice(), to.objects.slice()],
      after: [from.objects.filter(o => o !== object), [...to.objects, object]] };
    this.#restoreObjectLayers(entry, true);
    this.#push(entry);
    return true;
  }

  moveTilesToLayer(selection, target) {
    const from = this.map.activeLayer;
    const to = this.map.layers[target];
    if (this.current || !to || to === from) return false;
    const cells = [...selection.cells()].filter(([x, y]) => from.grid.inBounds(x, y) && from.grid.get(x, y) !== EMPTY)
      .map(([x, y]) => {
        const i = y * from.grid.width + x;
        return [x, y, from.grid.cells[i], from.grid.links[i], structuredClone(from.grid.wang[i] ?? null)];
      });
    if (!cells.length) return false;
    const dirty = new Map();
    this.begin(from);
    for (const [x, y] of cells) this.set(x, y, EMPTY, dirty);
    const removed = this.commit(false);
    this.begin(to);
    for (const [x, y, value, links, wang] of cells) this.set(x, y, value, dirty, links, wang);
    const added = this.commit(false);
    this.#push({ kind: 'tile-layer', from, to, entries: [removed, added] });
    this.map.active = target;
    return true;
  }

  #restoreTileLayers(entry, forward, dirty) {
    for (const part of entry.entries)
      for (const change of part.changes) this.#write(part.layer, change[0], change[forward ? 2 : 1], dirty);
    this.map.active = this.map.layers.indexOf(forward ? entry.to : entry.from);
  }

  #restoreObjectLayers(entry, forward) {
    const lists = forward ? entry.after : entry.before;
    [entry.from, entry.to].forEach((layer, i) => {
      layer.objects = lists[i].slice();
      this.map.refreshPorts(layer);
    });
    this.map.active = this.map.layers.indexOf(forward ? entry.to : entry.from);
  }

  #moveLayer(from, to) {
    const active = this.map.activeLayer;
    const [layer] = this.map.layers.splice(from, 1);
    this.map.layers.splice(to, 0, layer);
    this.map.active = this.map.layers.indexOf(active);
  }

  renameLayer(index, name) {
    name = name.trim();
    const layer = this.map.layers[index];
    if (!name || name === layer.name) return;
    const old = layer.name;
    layer.name = name;
    this.#push({ kind: 'rename', layer, old, name });
  }

  // Pixel offset of a layer. With `merge`, a change right after another offset
  // change of the same layer extends that undo step (a slider drag is one step).
  setLayerOffset(index, offset, { merge = false } = {}) {
    const layer = this.map.layers[index];
    offset = Math.min(MAX_LAYER_OFFSET, Math.max(-MAX_LAYER_OFFSET, Math.round(offset)));
    if (!layer || !Number.isFinite(offset) || offset === layer.offset) return;
    const last = this.undoStack.at(-1);
    if (merge && last?.kind === 'offset' && last.layer === layer && !this.redoStack.length) last.offset = offset;
    else this.#push({ kind: 'offset', layer, old: layer.offset, offset });
    layer.offset = offset;
  }

  resizeMap(width, height, left = 0, top = 0) {
    if (![width, height, left, top].every(Number.isInteger) || width < 1 || height < 1 || width > 512 || height > 512)
      throw new RangeError('地图宽高必须为 1–512 格');
    if (width === this.map.width && height === this.map.height && !left && !top) return;
    const before = {
      width: this.map.width,
      height: this.map.height,
      grids: this.map.layers.map((layer) => [layer, layer.grid, layer.objects]),
    };
    const after = { width, height, grids: this.map.layers.map(layer => {
      const grid = new TerrainGrid(width, height);
      for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
        if (!layer.grid.inBounds(x + left, y + top)) continue;
        const j = (y + top) * layer.grid.width + x + left;
        grid.cells[y * width + x] = layer.grid.cells[j];
        grid.links[y * width + x] = layer.grid.links[j];
        if (layer.grid.wang[j]) grid.wang[y * width + x] = structuredClone(layer.grid.wang[j]);
      }
      for(const key of Object.keys(grid.wang)){
        const i=Number(key),def=this.map.terrains?.[grid.cells[i]]?.wang;
        if(def&&grid.wang[i].center)grid.wang[i]=resolveWangCenter(grid,i,def);
      }
      // Objects shift with the cells; any that no longer fit are dropped.
      const objects = layer.objects
        .map((o) => ({ ...o, x: o.x - left, y: o.y - top }))
        .filter((o) => {
          const d = this.map.objectDefs[o.type];
          return o.x >= 0 && o.y >= 0 && o.x + d.w <= width && o.y + d.h <= height;
        });
      return [layer, grid, objects];
    }) };
    this.#restoreSize(after);
    this.#push({ kind: 'resize', before, after });
  }

  #restoreSize(state) {
    this.map.width = state.width;
    this.map.height = state.height;
    for (const [layer, grid, objects] of state.grids) {
      layer.grid = grid;
      layer.objects = objects;
      this.map.refreshPorts(layer);
    }
  }

  duplicateLayer(index) {
    const source = this.map.layers[index];
    const copy = this.map.createLayer(`${source.name} 副本`);
    copy.grid.cells.set(source.grid.cells);
    copy.grid.links.set(source.grid.links);
    copy.grid.wang = structuredClone(source.grid.wang);
    copy.objects = source.objects.map((o) => ({ ...o }));
    this.map.refreshPorts(copy);
    copy.visible = source.visible;
    copy.offset = source.offset;
    this.insertLayer(copy, index + 1);
  }

  // Keep undo/resize snapshots usable after a pack's label definitions change.
  updateWangDefinition(terrain, def) {
    const tiles=new Map(def.tiles.map(t=>[t.id,t]));
    const update=(state)=>{
      const tile=tiles.get(state.tile);
      return {...state,...(state.center?{center:def.labels.includes(state.center)?state.center:tile?.annotations?.[4]??def.boundary}:{}),edges:tile?[...tile.edges]:state.edges.map(e=>def.labels.includes(e)?e:def.boundary)};
    };
    const grids=new Set(this.map.layers.map(l=>l.grid));
    for(const entry of [...this.undoStack,...this.redoStack].flatMap(e=>e.entries??[e])){
      if(entry.layer)grids.add(entry.layer.grid);
      if(entry.kind==='resize')for(const side of [entry.before,entry.after])for(const [,grid] of side.grids)grids.add(grid);
      if(entry.kind==='cells')for(const change of entry.changes)for(const slot of [1,2]){
        const [value,links,wang]=JSON.parse(change[slot]);
        if(value===terrain&&wang)change[slot]=pack(value,links,update(wang));
      }
    }
    for(const grid of grids)for(const [key,state] of Object.entries(grid.wang))
      if(grid.cells[Number(key)]===terrain)grid.wang[key]=update(state);
    for(const grid of grids)for(const key of Object.keys(grid.wang))
      if(grid.cells[Number(key)]===terrain&&grid.wang[key].center)grid.wang[key]=resolveWangCenter(grid,Number(key),def);
  }

  // Both return 'tiles' (only `dirty` changed), 'layers' (layer stack changed) or false.
  undo(dirty) {
    const e = this.undoStack.pop();
    if (!e) return false;
    this.redoStack.push(e);
    if (e.kind === 'cells') {
      for (const c of e.changes) this.#write(e.layer, c[0], c[1], dirty);
      if (e.objects) this.#swapObjects(e.layer, e.objects[0], dirty);
    } else if (e.kind === 'tile-layer') this.#restoreTileLayers(e, false, dirty);
    else if (e.kind === 'object-layer') this.#restoreObjectLayers(e, false);
    else if (e.kind === 'rename') e.layer.name = e.old;
    else if (e.kind === 'offset') e.layer.offset = e.old;
    else if (e.kind === 'resize') this.#restoreSize(e.before);
    else if (e.kind === 'reorder') this.#moveLayer(e.to, e.from);
    else if (e.kind === 'insert') this.map.removeLayer(e.index);
    else this.map.insertLayer(e.layer, e.index);
    return e.kind === 'cells' ? 'tiles' : 'layers';
  }

  redo(dirty) {
    const e = this.redoStack.pop();
    if (!e) return false;
    this.undoStack.push(e);
    if (e.kind === 'cells') {
      for (const c of e.changes) this.#write(e.layer, c[0], c[2], dirty);
      if (e.objects) this.#swapObjects(e.layer, e.objects[1], dirty);
    } else if (e.kind === 'tile-layer') this.#restoreTileLayers(e, true, dirty);
    else if (e.kind === 'object-layer') this.#restoreObjectLayers(e, true);
    else if (e.kind === 'rename') e.layer.name = e.name;
    else if (e.kind === 'offset') e.layer.offset = e.offset;
    else if (e.kind === 'resize') this.#restoreSize(e.after);
    else if (e.kind === 'reorder') this.#moveLayer(e.from, e.to);
    else if (e.kind === 'insert') this.map.insertLayer(e.layer, e.index);
    else this.map.removeLayer(e.index);
    return e.kind === 'cells' ? 'tiles' : 'layers';
  }

  #push(entry) {
    this.undoStack.push(entry);
    if (this.undoStack.length > MAX_UNDO) this.undoStack.shift();
    this.redoStack.length = 0;
  }

  #write(layer, i, state, dirty) {
    const { grid } = layer;
    const [value, links, wang] = JSON.parse(state);
    grid.cells[i] = value;
    grid.links[i] = links;
    if (wang) grid.wang[i] = wang; else delete grid.wang[i];
    this.map.markDirty(dirty, i % grid.width, Math.floor(i / grid.width));
  }
}

function sameList(a, b) {
  return a.length === b.length && a.every((x, i) => x === b[i]);
}

// Turns a gesture (start / move / end) into edits on the active layer, or into
// a new selection. Gesture points come as (cell [x, y], point [x, y] in
// fractional cell units); only the lasso needs the sub-cell point.
// While a selection exists, every paint tool is clipped to it.
export class ToolController {
  constructor(map, history, selection) {
    this.map = map;
    this.history = history;
    this.selection = selection;
    this.tool = 'pencil'; // null: no tool, gestures make rectangle selections
    this.shape = 'line';
    this.selectMode = 'selectRect';
    this.wangBrush = {};
    this.terrain = 1; // null: no terrain picked, paint tools act as select
    this.object = null; // object type to place with the pencil (terrain is then null)
    this.picked = null; // selected object on the active layer, see selectedObject
    this.objectMove = null; // { from, ax, ay } while dragging the selected object
    this.sizes = { pencil: 1, eraser: 1, shape: 1 }; // brush size is per tool
    this.anchor = null;
    this.last = null;
  }

  // Painting an edge-connected terrain (road, wall): always one cell wide,
  // and placed cells get linked to each other.
  get #edge() {
    return this.terrain !== null && this.map.isEdge(this.terrain) && !this.map.terrains?.[this.terrain]?.wang && this.mode !== 'eraser';
  }

  // Whether the current tool / shape uses a brush size (fill, filled shapes
  // and edge-connected terrains don't).
  get usesSize() {
    if (this.wangPattern && this.mode !== 'eraser') return false;
    if (this.object !== null && this.mode === 'shape') return false;
    if (this.#edge && (this.mode === 'pencil' || this.mode === 'shape')) return false;
    if (this.mode === 'shape') return !FILLED_SHAPES.includes(this.shape);
    return this.mode in this.sizes;
  }

  get size() {
    return this.sizes[this.tool] ?? 1;
  }

  get wangPattern() {
    const pattern=this.wangBrush.pattern;
    return this.map.terrains?.[this.terrain]?.name===pattern?.terrain ? pattern : null;
  }

  set size(v) {
    if (this.tool in this.sizes) this.sizes[this.tool] = Math.min(MAX_BRUSH, Math.max(1, Math.round(v)));
  }

  // The tool gestures actually run: no tool selects; with an object picked the
  // pencil places it ('place'); painting needs a terrain, so without one
  // pencil / shape / fill select too. The eraser always erases.
  get mode() {
    if (this.tool === null) return 'select';
    if (this.tool === 'eraser') return 'eraser';
    if (this.object !== null) return this.tool === 'pencil' ? 'place' : this.tool === 'shape' ? 'shape' : 'select';
    return this.terrain === null ? 'select' : this.tool;
  }

  // Without a tool, selecting is always the rectangle kind.
  get #selectMode() {
    return this.tool === 'select' ? this.selectMode : 'selectRect';
  }

  // The selected object, if it is still on the active layer (undo, layer
  // switches and the like can take it away). Undoing a change to it (its
  // animation) brings back an older record of the same object: the one of the
  // same type on the same spot stays selected.
  get selectedObject() {
    const p = this.picked;
    const objects = this.map.activeLayer.objects;
    if (p && !objects.includes(p))
      this.picked = objects.find((o) => o.type === p.type && o.x === p.x && o.y === p.y) ?? null;
    return this.picked;
  }

  set selectedObject(o) {
    this.picked = o;
  }

  // Objects on the active layer whose sprite covers `point` (in cell units),
  // front first: the one standing furthest south is drawn in front.
  objectsAt([px, py]) {
    const T = this.map.tileSize;
    const hits = [];
    for (const o of this.map.activeLayer.objects) {
      const r = objectRect(this.map.objectDefs[o.type], o, T);
      if (px * T < r.left || px * T >= r.right || py * T < r.top || py * T >= r.bottom) continue;
      hits.push([r.bottom, o]);
    }
    // Later in the list is drawn later on ties, so it is in front too.
    return hits.map((h, i) => [...h, i]).sort((a, b) => b[0] - a[0] || b[2] - a[2]).map((h) => h[1]);
  }

  // What a tap selects. Taps on one spot cycle through everything there: the
  // objects front to back, then the tile under it (TILE, if not empty), then
  // round again. Returns an object, TILE, or null (nothing there).
  #tapTarget([x, y], point) {
    const { grid } = this.map.activeLayer;
    const candidates = this.objectsAt(point);
    const hasTile = grid.inBounds(x, y) && grid.get(x, y) !== EMPTY;
    if (hasTile) candidates.push(TILE);
    const sel = this.selectedObject;
    let i = sel ? candidates.indexOf(sel) : -1;
    if (i < 0 && !sel && hasTile && this.selection.has(x, y)) i = candidates.length - 1; // the tile is current
    if (!candidates.length) return null;
    return i < 0 ? candidates[0] : candidates[(i + 1) % candidates.length];
  }

  // Whether a drag starting at `point` should move the selected object (also
  // when it is behind another one there).
  hitsSelectedObject(point) {
    const o = this.selectedObject;
    return !!o && this.objectsAt(point).includes(o);
  }

  // Selected object actions (selection bar / keys); each is one undo step.
  deleteSelectedObject() {
    const dirty = new Map();
    const o = this.selectedObject;
    if (!o || this.active) return dirty;
    const layer = this.map.activeLayer;
    this.history.begin(layer);
    this.history.setObjects(layer.objects.filter((x) => x !== o), dirty);
    this.history.commit();
    this.picked = null;
    return dirty;
  }

  // Names belong to placed instances, not the shared object definition.
  setSelectedObjectName(name) {
    const o = this.selectedObject;
    name = String(name).trim().slice(0, 80);
    if (!o || !name || name === (o.name ?? this.map.objectDefs[o.type].label)) return new Map();
    return this.#patchSelected({ name });
  }

  // Play another of the selected object's animations (by name); one undo step.
  setSelectedObjectAnim(name) {
    const o = this.selectedObject;
    if (!o) return new Map();
    const def = this.map.objectDefs[o.type];
    if (!def.animations.some((a) => a.name === name) || objectAnim(def, o).name === name) return new Map();
    return this.#patchSelected({ anim: name });
  }

  // Play or hold (first frame) the selected object's animation; one undo step.
  setSelectedObjectPlaying(playing) {
    const o = this.selectedObject;
    if (!o || !o.paused === playing) return new Map();
    const { paused, ...rest } = o;
    return this.#patchSelected(playing ? null : { paused: true }, rest);
  }

  // Replace the selected object by a copy with `patch` applied (onto `base`,
  // default the object itself), as one undo step; it stays selected.
  #patchSelected(patch, base = this.selectedObject) {
    const dirty = new Map();
    const o = this.selectedObject;
    if (!o || this.active) return dirty;
    const layer = this.map.activeLayer;
    const next = { ...base, ...patch };
    this.history.begin(layer);
    this.history.setObjects(layer.objects.map((x) => (x === o ? next : x)), dirty);
    this.history.commit();
    this.picked = next;
    return dirty;
  }

  // Copy beside the original (first spot nearby inside the map) and select it.
  copySelectedObject() {
    const dirty = new Map();
    const o = this.selectedObject;
    if (!o || this.active) return dirty;
    const layer = this.map.activeLayer;
    const def = this.map.objectDefs[o.type];
    for (let r = 1; r <= 8; r++) {
      for (const [dx, dy] of [[def.w * r, 0], [0, def.h * r], [-def.w * r, 0], [0, -def.h * r], [r, 0], [0, r], [-r, 0], [0, -r]]) {
        if (!this.map.canPlace(layer, o.type, o.x + dx, o.y + dy)) continue;
        const copy = { ...o, x: o.x + dx, y: o.y + dy };
        this.history.begin(layer);
        this.history.setObjects([...layer.objects, copy], dirty);
        this.history.commit();
        this.picked = copy;
        return dirty;
      }
    }
    return dirty;
  }

  get active() {
    return this.anchor !== null;
  }

  canMoveSelection([x, y]) {
    return (this.mode === 'select' || !!this.selectionMove) && this.selection.has(x, y);
  }

  // Selection being edited never clips itself; paint tools are clipped to it.
  get #clip() {
    return this.selection.active ? this.selection : null;
  }

  start([x, y], point = [x + 0.5, y + 0.5], { moveSelection = false } = {}) {
    const dirty = new Map();
    this.anchor = [x, y];
    this.last = [x, y];
    this.moved = false;
    if (moveSelection && this.hitsSelectedObject(point)) {
      this.history.begin(this.map.activeLayer);
      this.objectMove = { from: this.selectedObject, ax: x, ay: y };
      return dirty;
    }
    if (this.canMoveSelection([x, y]) || (moveSelection && this.selection.has(x, y))) {
      if (this.selectionMove) {
        this.selectionMove.baseDx = this.selectionMove.dx;
        this.selectionMove.baseDy = this.selectionMove.dy;
        return dirty;
      }
      const layer = this.map.activeLayer;
      this.selectionMove = {
        // [x, y, terrain, links]; links are relative, so they move with the cells.
        cells: [...this.selection.cells()].map(([cx, cy]) => {
          const i = cy * layer.grid.width + cx;
          return [cx, cy, layer.grid.cells[i], layer.grid.links[i], layer.grid.wang[i]];
        }),
        dx: 0,
        dy: 0,
        baseDx: 0,
        baseDy: 0,
      };
      this.history.begin(layer);
      return dirty;
    }
    if (this.selectionMove) this.#cancelMove(dirty);
    if (this.mode === 'select') {
      this.#startSelect([x, y], point);
      return dirty;
    }
    const layer = this.map.activeLayer;
    const clip = this.#clip;
    this.history.begin(layer, clip);
    this.path = []; // edge pencil stroke, see #stepPath
    this.placedCells = new Set(); // avoid duplicates within one continuous stroke
    if (this.mode === 'place') {
      this.#place([x, y], dirty);
    } else if (this.mode === 'fill') {
      const within = clip ? (cx, cy) => clip.has(cx, cy) : null;
      const cells = floodFillCells(layer.grid, x, y, within);
      if (this.#edge) this.#placeConnected(cells, dirty);
      else for (const [cx, cy] of cells) this.#paint(cx, cy, this.terrain, dirty);
    } else {
      this.#apply([x, y], dirty);
    }
    return dirty;
  }

  move([x, y], point = [x + 0.5, y + 0.5]) {
    const dirty = new Map();
    if (!this.active) return dirty;
    if (this.objectMove) {
      this.#moveObject([x, y], dirty);
      return dirty;
    }
    if (this.selectionMove) {
      this.#moveSelection([x, y], dirty);
      return dirty;
    }
    if (this.mode === 'fill') return dirty;
    if (this.mode === 'select') {
      this.#moveSelect([x, y], point);
      return dirty;
    }
    if (x === this.last[0] && y === this.last[1]) return dirty;
    this.moved = true;
    if (this.mode === 'place') {
      for (const cell of lineCells(this.last[0], this.last[1], x, y)) this.#place(cell, dirty);
    }
    else this.#apply([x, y], dirty);
    this.last = [x, y];
    return dirty;
  }

  // Taps select what is under them without applying paint / erase tools,
  // cycling through stacked objects and the tile on repeated taps (see
  // #tapTarget), or clears the selection on an empty spot. When it comes to
  // the tile, a selection already holding it is kept (so it can still be
  // dragged); the magic wand selects its region instead of one tile.
  tap([x, y], point = [x + 0.5, y + 0.5]) {
    let dirty = new Map();
    if (this.active) return dirty;
    if (this.selectionMove && !this.selection.has(x, y)) this.confirmMove();
    const target = this.#tapTarget([x, y], point);
    if (target && target !== TILE) {
      if (this.selectionMove) this.#cancelMove(dirty);
      this.selection.clear(); // an object selection replaces a tile selection
      this.picked = target;
      return dirty;
    }
    this.picked = null;
    if (this.mode === 'select' && this.#selectMode === 'selectWand') {
      dirty = this.start([x, y], point);
      this.end();
      return dirty;
    }
    if (target === TILE && this.selection.has(x, y)) return dirty;
    if (this.selectionMove) this.#cancelMove(dirty);
    this.selection.set(target === TILE ? [[x, y]] : []);
    return dirty;
  }

  end() {
    if (!this.active) return;
    if (this.objectMove) {
      this.history.commit();
      this.objectMove = null;
    } else if (this.selectionMove) {
      // Keep the preview reversible until the user explicitly confirms it.
      if (!this.selectionMove.copy && !this.selectionMove.dx && !this.selectionMove.dy) this.confirmMove();
    } else if (this.mode === 'select') this.#endSelect();
    else this.history.commit();
    this.anchor = this.last = null;
  }

  cancel() {
    const dirty = new Map();
    if (!this.active && !this.selectionMove) return dirty;
    if (this.objectMove) {
      this.history.cancel(dirty);
      this.picked = this.objectMove.from;
      this.objectMove = null;
    } else if (this.selectionMove) {
      this.#cancelMove(dirty);
    } else if (this.mode === 'select') this.selection.set(this.selectionBefore);
    else this.history.cancel(dirty);
    this.selection.setLasso(null);
    this.anchor = this.last = null;
    return dirty;
  }

  confirmMove() {
    if (!this.selectionMove) return;
    this.history.commit();
    this.selectionMove = null;
    this.selection.set([...this.selection.cells()]);
  }

  copySelection() {
    const dirty = new Map();
    if (!this.selection.active || this.active) return dirty;
    if (!this.selectionMove) {
      const first = this.selection.cells().next().value;
      this.start(first, undefined, { moveSelection: true });
    }
    const move = this.selectionMove;
    move.copy = true;
    // Keep the complete copy even when the offset takes it outside the map.
    move.dx += 1;
    this.history.revert(dirty);
    for (const [x, y, value, links, wang] of move.cells)
      this.history.set(x + move.dx, y + move.dy, value, dirty, links, wang);
    this.selection.set(move.cells.map(([x, y]) => [x + move.dx, y + move.dy]), { allowOutside: true });
    this.anchor = this.last = null;
    return dirty;
  }

  #cancelMove(dirty) {
    this.history.cancel(dirty);
    this.selection.set(this.selectionMove.cells);
    this.selectionMove = null;
  }

  // ---- selection tools ----

  #moveSelection([x, y], dirty) {
    const move = this.selectionMove;
    const { cells } = move;
    const dx = move.baseDx + x - this.anchor[0];
    const dy = move.baseDy + y - this.anchor[1];
    if (dx === move.dx && dy === move.dy) return;
    this.history.revert(dirty);
    // Read from the original snapshot so overlapping moves preserve every cell.
    if (!move.copy) for (const [cx, cy] of cells) this.history.set(cx, cy, EMPTY, dirty);
    for (const [cx, cy, value, links, wang] of cells) this.history.set(cx + dx, cy + dy, value, dirty, links, wang);
    move.dx = dx;
    move.dy = dy;
    this.selection.set(cells.map(([cx, cy]) => [cx + dx, cy + dy]), { allowOutside: true });
  }

  #startSelect([x, y], point) {
    const sel = this.selection;
    this.picked = null; // a tile selection replaces an object selection
    this.selectionBefore = [...sel.cells()]; // restored if the gesture is cancelled
    switch (this.#selectMode) {
      case 'selectWand':
        sel.set(floodFillCells(this.map.activeLayer.grid, x, y));
        break;
      case 'selectLasso':
        this.lasso = [point];
        sel.setLasso(this.lasso);
        break;
      default:
        this.#moveSelect([x, y], point);
    }
  }

  #moveSelect([x, y], point) {
    const sel = this.selection;
    const [ax, ay] = this.anchor;
    if (x !== ax || y !== ay) this.moved = true;
    switch (this.#selectMode) {
      case 'selectRect':
        if (this.moved) sel.set(rectCells(ax, ay, x, y, true));
        break;
      case 'selectCircle':
        if (this.moved) sel.set(circleCells(ax, ay, Math.hypot(x - ax, y - ay), true));
        break;
      case 'selectLasso': {
        const last = this.lasso.at(-1);
        if (Math.hypot(point[0] - last[0], point[1] - last[1]) < 0.25) break;
        this.lasso.push(point);
        this.moved = true;
        sel.set(polygonCells(this.lasso, sel.width, sel.height));
        sel.setLasso(this.lasso);
        break;
      }
    }
  }

  #endSelect() {
    const { grid } = this.map.activeLayer;
    if (!this.moved && this.#selectMode !== 'selectWand') {
      // A tap with rect / circle / lasso selects the tapped tile (or clears
      // the selection on an empty cell).
      const [x, y] = this.anchor;
      this.selection.set(grid.inBounds(x, y) && grid.get(x, y) !== EMPTY ? [[x, y]] : []);
    } else if (this.#selectMode === 'selectRect' || this.#selectMode === 'selectCircle') {
      // Materialize before set() clears the mask; retain only occupied cells.
      const occupied = [...this.selection.cells()].filter(([x, y]) => grid.get(x, y) !== EMPTY);
      this.selection.set(occupied);
    }
    this.selection.setLasso(null);
    this.lasso = null;
  }

  // Places edge-terrain cells, each linked to the placed cells beside it.
  #placeConnected(cells, dirty) {
    const placed = new Set();
    for (const [x, y] of cells) if (this.history.writable(x, y) && !this.map.activeLayer.grid.wang[y * this.map.width + x]?.locked) placed.add(`${x},${y}`);
    for (const key of placed) {
      const [x, y] = key.split(',').map(Number);
      let links = 0;
      for (const d of DIRS) if (placed.has(`${x + d.dx},${y + d.dy}`)) links |= d.bit;
      this.history.set(x, y, this.terrain, dirty, links);
    }
  }

  // Drag the selected object by whole cells; it stays inside the map (other
  // objects don't block it).
  #moveObject([x, y], dirty) {
    const { from, ax, ay } = this.objectMove;
    const nx = from.x + x - ax;
    const ny = from.y + y - ay;
    const cur = this.picked;
    if (cur.x === nx && cur.y === ny) return;
    if (!this.map.canPlace(this.map.activeLayer, from.type, nx, ny)) return;
    const moved = { ...from, x: nx, y: ny };
    this.history.setObjects(this.history.current.objects.map((o) => (o === from ? moved : o)), dirty);
    this.picked = moved;
  }

  // Places the picked object with the pressed cell as its footprint's
  // bottom-centre cell; dragging stamps every crossed cell once per stroke.
  // Positions off the map are skipped. The whole stroke commits on release.
  #place([x, y], dirty) {
    const type = this.object;
    const def = this.map.objectDefs[type];
    const ox = x - Math.floor((def.w - 1) / 2);
    const oy = y - (def.h - 1);
    const layer = this.map.activeLayer;
    if (!this.map.canPlace(layer, type, ox, oy)) return;
    const key = `${ox},${oy}`;
    if (this.placedCells.has(key)) return;
    this.placedCells.add(key);
    this.history.setObjects([...layer.objects, { type, x: ox, y: oy }], dirty);
  }

  // Eraser: drop the objects whose footprint touches any of `cells`.
  #eraseObjects(cells, dirty) {
    const layer = this.map.activeLayer;
    const hit = new Set();
    for (const [x, y] of cells) {
      if (!this.history.writable(x, y)) continue;
      for (const o of layer.objects) if (objectCovers(this.map.objectDefs[o.type], o, x, y)) hit.add(o);
    }
    if (hit.size) this.history.setObjects(layer.objects.filter((o) => !hit.has(o)), dirty);
  }

  // Edge pencil: the stroke is a stack of cells, each linked to the one before.
  // Stepping onto the previous cell pops the last one, restoring it and the
  // link that led to it, so dragging back along the path takes it back.
  #stepPath(x, y, dirty) {
    const { grid } = this.map.activeLayer;
    if (grid.inBounds(x, y) && grid.wang[y * grid.width + x]?.locked) return;
    const path = this.path;
    const top = path.at(-1);
    if (top && top.x === x && top.y === y) return;
    const prev = path.at(-2);
    if (prev && prev.x === x && prev.y === y) {
      path.pop();
      if (!top.port) this.#restore(top.x, top.y, top.before, dirty);
      if (!prev.port && top.topBefore) this.#restore(prev.x, prev.y, top.topBefore, dirty);
      return;
    }
    const state = (cx, cy) => {
      const i = cy * grid.width + cx;
      return [grid.cells[i], grid.links[i], grid.wang[i]];
    };
    // A connector object (gate, tower) for this terrain: the stroke passes
    // through it without writing, linking the wall on either side into it.
    if (grid.inBounds(x, y) && grid.portTerrain[y * grid.width + x] === this.terrain) {
      const entry = { x, y, port: true };
      const back = top && !top.port ? dirBit(top.x, top.y, x, y) : 0;
      if (back) {
        entry.topBefore = state(top.x, top.y);
        this.history.set(top.x, top.y, this.terrain, dirty, entry.topBefore[1] | back);
      }
      path.push(entry);
      return;
    }
    if (!this.history.writable(x, y)) return;
    const [value, links, wang] = state(x, y);
    const entry = { x, y, before: [value, links, wang] };
    // Keep the cell's existing links when it already holds this terrain (a
    // stroke can join or cross an earlier road).
    let own = value === this.terrain ? links : 0;
    const bit = top ? dirBit(x, y, top.x, top.y) : 0;
    if (bit && top.port) {
      own |= bit; // into the gate / tower; the object itself needs no write
    } else if (bit) {
      entry.topBefore = state(top.x, top.y);
      const back = dirBit(top.x, top.y, x, y);
      this.history.set(top.x, top.y, this.terrain, dirty, entry.topBefore[1] | back);
      own |= bit;
    } else if (top && !top.port) entry.topBefore = state(top.x, top.y);
    this.history.set(x, y, this.terrain, dirty, own);
    path.push(entry);
  }

  #restore(x, y, [value, links, wang], dirty) {
    this.history.set(x, y, value, dirty, links, wang);
  }

  #paint(x, y, value, dirty) {
    const pattern=this.wangPattern;
    if (pattern && value===this.terrain) {
      const tile=wangPatternTile(pattern,x,y,...this.anchor);
      if (tile!==null) paintWang(this.history,x,y,value,dirty,{tile,exact:true});
      return;
    }
    paintWang(this.history, x, y, value, dirty, this.wangBrush);
  }

  #apply([x, y], dirty) {
    const h = this.history;
    const stamp = (cx, cy, value) => {
      const pattern=this.wangPattern;
      if (pattern && value===this.terrain) {
        // The stroke origin fixes the repeat phase even when stamps overlap.
        for(let dy=0;dy<pattern.height;dy++)for(let dx=0;dx<pattern.width;dx++)this.#paint(cx+dx,cy+dy,value,dirty);
        return;
      }
      for (const [bx, by] of brushCells(cx, cy, this.size)) this.#paint(bx, by, value, dirty);
    };

    if (this.mode === 'pencil' && this.#edge) {
      const cells = [...lineCells(this.last[0], this.last[1], x, y)];
      for (const [cx, cy] of this.path.length ? cells.slice(1) : cells) this.#stepPath(cx, cy, dirty);
      return;
    }

    if (this.mode === 'pencil' || this.mode === 'eraser') {
      const value = this.mode === 'eraser' ? EMPTY : this.terrain;
      const touched = [];
      for (const [cx, cy] of lineCells(this.last[0], this.last[1], x, y)) {
        stamp(cx, cy, value);
        if (value === EMPTY) touched.push(...brushCells(cx, cy, this.size));
      }
      if (touched.length) this.#eraseObjects(touched, dirty);
      return;
    }

    // Shapes: roll back the previous preview, then draw the new one.
    h.revert(dirty);
    const [ax, ay] = this.anchor;
    const v = this.terrain;
    const r = Math.hypot(x - ax, y - ay);
    if (this.object !== null) {
      const cells = {
        line: () => lineCells(ax, ay, x, y),
        rectOutline: () => rectCells(ax, ay, x, y, false),
        circleOutline: () => circleCells(ax, ay, r, false),
        rect: () => rectCells(ax, ay, x, y, true),
        circle: () => circleCells(ax, ay, r, true),
      }[this.shape]();
      this.placedCells.clear();
      for (const cell of cells) this.#place(cell, dirty);
      return;
    }
    if (this.#edge) {
      // One cell wide, every placed cell linked to its placed neighbours.
      const cells = {
        line: () => lineCells(ax, ay, x, y),
        rectOutline: () => rectCells(ax, ay, x, y, false),
        circleOutline: () => circleCells(ax, ay, r, false),
        rect: () => rectCells(ax, ay, x, y, true),
        circle: () => circleCells(ax, ay, r, true),
      }[this.shape]();
      this.#placeConnected([...cells], dirty);
      return;
    }
    switch (this.shape) {
      case 'line':
        for (const [cx, cy] of lineCells(ax, ay, x, y)) stamp(cx, cy, v);
        break;
      case 'rectOutline':
        for (const [cx, cy] of rectCells(ax, ay, x, y, false)) stamp(cx, cy, v);
        break;
      case 'circleOutline':
        for (const [cx, cy] of circleCells(ax, ay, r, false)) stamp(cx, cy, v);
        break;
      case 'rect':
        for (const [cx, cy] of rectCells(ax, ay, x, y, true)) this.#paint(cx, cy, v, dirty);
        break;
      case 'circle':
        for (const [cx, cy] of circleCells(ax, ay, r, true)) this.#paint(cx, cy, v, dirty);
        break;
    }
  }
}
