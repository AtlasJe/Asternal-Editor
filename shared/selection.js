// Cell selection shared by the editor (clips painting to it) and the overlay
// (draws it). Renderer-independent; lives at map level, so it survives layer
// switches.

export class Selection {
  constructor(width, height) {
    this.width = width;
    this.height = height;
    this.mask = new Uint8Array(width * height);
    this.outside = new Map(); // Off-map cells retained while moving a selection.
    this.count = 0;
    this.lasso = null; // in-progress lasso path [[x, y], ...] in cell units, for the overlay
    this.listeners = new Set();
    this.edgeCache = null;
  }

  get active() {
    return this.count > 0;
  }

  has(x, y) {
    return x >= 0 && y >= 0 && x < this.width && y < this.height
      ? this.mask[y * this.width + x] === 1
      : this.outside.has(`${x},${y}`);
  }

  // Ordinary selections clip to the map; move previews retain off-map cells.
  set(cells, { allowOutside = false } = {}) {
    this.mask.fill(0);
    this.outside.clear();
    for (const [x, y] of cells) {
      if (x >= 0 && y >= 0 && x < this.width && y < this.height) this.mask[y * this.width + x] = 1;
      else if (allowOutside) this.outside.set(`${x},${y}`, [x, y]);
    }
    this.#changed();
  }

  clear() {
    this.lasso = null;
    if (!this.count) return this.#emit();
    this.mask.fill(0);
    this.outside.clear();
    this.#changed();
  }

  selectAll() {
    this.outside.clear();
    this.mask.fill(1);
    this.#changed();
  }

  *cells() {
    for (let i = 0; i < this.mask.length; i++)
      if (this.mask[i]) yield [i % this.width, Math.floor(i / this.width)];
    yield* this.outside.values();
  }

  // Bounding box of the selected cells in cell units ({ x0, y0, x1, y1 }, x1 / y1
  // exclusive), or null when nothing is selected.
  bounds() {
    if (!this.count) return null;
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    for (const [x, y] of this.cells()) {
      x0 = Math.min(x0, x);
      y0 = Math.min(y0, y);
      x1 = Math.max(x1, x + 1);
      y1 = Math.max(y1, y + 1);
    }
    return { x0, y0, x1, y1 };
  }

  // Boundary segments between selected and unselected cells, in cell units:
  // [x0, y0, x1, y1] each, cached until the selection changes.
  edges() {
    if (this.edgeCache) return this.edgeCache;
    const out = [];
    for (const [x, y] of this.cells()) {
        if (!this.has(x, y - 1)) out.push([x, y, x + 1, y]);
        if (!this.has(x, y + 1)) out.push([x, y + 1, x + 1, y + 1]);
        if (!this.has(x - 1, y)) out.push([x, y, x, y + 1]);
        if (!this.has(x + 1, y)) out.push([x + 1, y, x + 1, y + 1]);
    }
    return (this.edgeCache = out);
  }

  onChange(fn) {
    this.listeners.add(fn);
  }

  // Lasso path updates only need a redraw, not a new mask.
  setLasso(points) {
    this.lasso = points;
    this.#emit();
  }

  #changed() {
    let n = this.outside.size;
    for (let i = 0; i < this.mask.length; i++) n += this.mask[i];
    this.count = n;
    this.edgeCache = null;
    this.#emit();
  }

  #emit() {
    for (const fn of this.listeners) fn(this);
  }
}

// Cells whose centre lies inside the polygon `points` (cell units, even-odd rule).
export function* polygonCells(points, width, height) {
  if (points.length < 3) return;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [x, y] of points) {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  const x0 = Math.max(0, Math.floor(minX));
  const x1 = Math.min(width - 1, Math.ceil(maxX));
  const y0 = Math.max(0, Math.floor(minY));
  const y1 = Math.min(height - 1, Math.ceil(maxY));
  for (let cy = y0; cy <= y1; cy++) {
    const py = cy + 0.5;
    // Crossings of the scanline through the cell centres, then fill between pairs.
    const xs = [];
    for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
      const [ax, ay] = points[i];
      const [bx, by] = points[j];
      if (ay > py !== by > py) xs.push(ax + ((py - ay) / (by - ay)) * (bx - ax));
    }
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      for (let cx = Math.max(x0, Math.ceil(xs[k] - 0.5)); cx <= x1 && cx + 0.5 <= xs[k + 1]; cx++)
        yield [cx, cy];
    }
  }
}
