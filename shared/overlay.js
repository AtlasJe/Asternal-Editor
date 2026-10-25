import { wangConflict } from './wang.js';
// Screen-space overlay canvas above the map, shared by both renderers: draws
// the active layer's cell grid, the selection (tint + solid yellow outline),
// the selected object (tinted footprint + outline round its sprite) and an
// in-progress lasso, all shifted by the active layer's offset.

import { objectRect } from './grid.js';

const GRID_MIN_PX = 6; // hide the grid when cells get smaller than this on screen

// getObject(): the selected object (or null).
export function createOverlay({ mount, selection, map, tileSize, getObject = () => null }) {
  const canvas = document.createElement('canvas');
  canvas.id = 'overlay';
  mount.append(canvas);
  const ctx = canvas.getContext('2d');

  let cam = { x: 0, y: 0, scale: 1 };
  let size = { w: 1, h: 1, dpr: 1 };
  let frame = 0;

  const schedule = () => {
    if (!frame) frame = requestAnimationFrame(draw);
  };

  function draw() {
    frame = 0;
    const { w, h, dpr } = size;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const s = tileSize * cam.scale;
    const ox = cam.x;
    const oy = cam.y - map.activeLayer.offset * cam.scale; // screen y of the active layer's origin
    const sx = (x) => Math.round(ox + x * s);
    const sy = (y) => Math.round(oy + y * s);

    if (s >= GRID_MIN_PX) {
      // Only the part of the grid inside the viewport.
      const x0 = Math.max(0, Math.floor(-ox / s));
      const x1 = Math.min(map.width, Math.ceil((w - ox) / s));
      const y0 = Math.max(0, Math.floor(-oy / s));
      const y1 = Math.min(map.height, Math.ceil((h - oy) / s));
      ctx.beginPath();
      for (let x = x0; x <= x1; x++) {
        ctx.moveTo(sx(x) + 0.5, sy(y0));
        ctx.lineTo(sx(x) + 0.5, sy(y1));
      }
      for (let y = y0; y <= y1; y++) {
        ctx.moveTo(sx(x0), sy(y) + 0.5);
        ctx.lineTo(sx(x1), sy(y) + 0.5);
      }
      ctx.lineWidth = 1;
      ctx.setLineDash([]);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.16)';
      ctx.stroke();
    }

    const grid = map.activeLayer.grid;
    for (const [key, state] of Object.entries(grid.wang)) {
      const i = Number(key), x = i % grid.width, y = Math.floor(i / grid.width);
      if (ox+(x+1)*s < 0 || oy+(y+1)*s < 0 || ox+x*s > w || oy+y*s > h) continue;
      const terrain = map.terrains?.[grid.cells[i]];
      if (!terrain?.wang) continue;
      const conflict = wangConflict(grid, i, terrain);
      if (conflict) {
        ctx.fillStyle = 'rgba(255,45,80,.35)'; ctx.fillRect(sx(x), sy(y), s, s);
        ctx.strokeStyle = '#ff365e'; ctx.lineWidth = 2;
        ctx.strokeRect(sx(x)+1, sy(y)+1, s-2, s-2);
      }
      if (map.showWang && s >= 24) {
        const positions = [[.5,.16],[.84,.5],[.5,.84],[.16,.5]];
        ctx.font = `${Math.min(12,s/5)}px sans-serif`; ctx.textAlign = 'center';
        state.edges.forEach((label,d) => {
          ctx.fillStyle = '#fff'; ctx.fillText(label, ox+(x+positions[d][0])*s, oy+(y+positions[d][1])*s);
        });
        if (state.locked) { ctx.fillStyle='#ffd76b'; ctx.fillText('◆',ox+(x+.5)*s,oy+(y+.55)*s); }
      }
    }

    if (selection.active) {
      // Tint the selected cells.
      ctx.fillStyle = 'rgba(240, 194, 75, 0.14)';
      for (const [x, y] of selection.cells()) {
        ctx.fillRect(ox + x * s, oy + y * s, s, s);
      }
      // Solid yellow outline along the selection's border.
      ctx.beginPath();
      for (const [x0, y0, x1, y1] of selection.edges()) {
        ctx.moveTo(sx(x0), sy(y0));
        ctx.lineTo(sx(x1), sy(y1));
      }
      ctx.lineWidth = 2;
      ctx.lineCap = 'square';
      ctx.setLineDash([]);
      ctx.strokeStyle = '#f0c24b';
      ctx.stroke();
    }

    const obj = getObject();
    if (obj) {
      const def = map.objectDefs[obj.type];
      const r = objectRect(def, obj, tileSize);
      const k = cam.scale;
      ctx.fillStyle = 'rgba(240, 194, 75, 0.18)';
      ctx.fillRect(ox + obj.x * s, oy + obj.y * s, def.w * s, def.h * s);
      ctx.lineWidth = 2;
      ctx.setLineDash([]);
      ctx.strokeStyle = '#f0c24b';
      ctx.strokeRect(
        Math.round(ox + r.left * k),
        Math.round(oy + r.top * k),
        Math.round((r.right - r.left) * k),
        Math.round((r.bottom - r.top) * k),
      );
    }

    if (selection.lasso?.length > 1) {
      ctx.beginPath();
      selection.lasso.forEach(([x, y], i) => {
        const px = ox + x * s;
        const py = oy + y * s;
        if (i) ctx.lineTo(px, py);
        else ctx.moveTo(px, py);
      });
      ctx.lineWidth = 2;
      ctx.setLineDash([]);
      ctx.strokeStyle = '#f0c24b';
      ctx.stroke();
    }
  }

  selection.onChange(schedule);

  return {
    resize(w, h) {
      const dpr = window.devicePixelRatio || 1;
      size = { w, h, dpr };
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      schedule();
    },
    setCamera({ x, y, scale }) {
      cam = { x, y, scale };
      schedule();
    },
    // Active layer, its offset or the map size changed.
    refresh: schedule,
  };
}
