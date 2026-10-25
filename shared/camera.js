// Camera (pan / zoom) and pointer gestures, independent of any renderer.
//
// Gesture rules:
//   - one pointer, moved before the long-press delay   -> pan the map
//   - one pointer, held still for the long-press delay -> tool gesture
//   - one pointer, released before the delay, no move  -> tap (selects the tile)
//   - a second pointer at any time                     -> pinch zoom / pan
//     (cancels a tool gesture in progress)
//   - mouse wheel / trackpad pinch                     -> zoom at cursor
//   - middle mouse button                              -> pan immediately

export class Camera {
  constructor() {
    this.x = 0; // screen position of world origin (CSS px)
    this.y = 0;
    this.scale = 1;
    this.minScale = 0.02;
    this.maxScale = 32;
  }

  toWorld(sx, sy) {
    return [(sx - this.x) / this.scale, (sy - this.y) / this.scale];
  }

  zoomAt(sx, sy, scale) {
    scale = Math.min(this.maxScale, Math.max(this.minScale, scale));
    const [wx, wy] = this.toWorld(sx, sy);
    this.scale = scale;
    this.x = sx - wx * scale;
    this.y = sy - wy * scale;
  }

  // Fit a world rect (0, 0, w, h) inside screen rect `r` with some padding.
  fit(r, w, h, pad = 24) {
    const s = Math.min(Math.max(1, r.w - pad * 2) / w, Math.max(1, r.h - pad * 2) / h);
    this.minScale = Math.min(0.02, s / 4);
    this.scale = Math.min(this.maxScale, s);
    this.x = r.x + (r.w - w * this.scale) / 2;
    this.y = r.y + (r.h - h * this.scale) / 2;
  }

  // Keep at least `margin` px of the map on screen.
  clamp(viewW, viewH, w, h, margin = 80) {
    const sw = w * this.scale;
    const sh = h * this.scale;
    this.x = Math.min(viewW - margin, Math.max(margin - sw, this.x));
    this.y = Math.min(viewH - margin, Math.max(margin - sh, this.y));
  }
}

export function attachGestures(el, camera, cb, { longPressMs = 200, slop = 8 } = {}) {
  const pointers = new Map(); // pointerId -> [x, y]
  let mode = 'idle'; // idle | pending | pan | tool | pinch
  let timer = 0;
  let pan = null; // { x, y, camX, camY }
  let pinch = null; // { wx, wy, dist, scale }

  const local = (e) => {
    const r = el.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  };

  const beginPan = ([x, y]) => {
    mode = 'pan';
    pan = { x, y, camX: camera.x, camY: camera.y };
  };

  const clearPending = () => {
    clearTimeout(timer);
    if (mode === 'pending') cb.onPressEnd?.(false);
  };

  const pinchState = () => {
    const [a, b] = [...pointers.values()];
    const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    return { mid, dist: Math.max(1, Math.hypot(a[0] - b[0], a[1] - b[1])) };
  };

  el.addEventListener('contextmenu', (e) => e.preventDefault());

  el.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' && e.button === 2) return;
    el.setPointerCapture(e.pointerId);
    const p = local(e);
    pointers.set(e.pointerId, p);

    if (pointers.size === 1) {
      if (cb.isNavigationOnly?.() || (e.pointerType === 'mouse' && e.button === 1)) return beginPan(p);
      if (cb.shouldStartToolImmediately?.(p)) {
        mode = 'tool';
        cb.onToolStart(p);
        return;
      }
      mode = 'pending';
      pan = { x: p[0], y: p[1], camX: camera.x, camY: camera.y };
      cb.onPressStart?.(p);
      timer = setTimeout(() => {
        mode = 'tool';
        cb.onPressEnd?.(true);
        navigator.vibrate?.(12);
        cb.onToolStart(p);
      }, longPressMs);
    } else if (pointers.size === 2) {
      clearPending();
      if (mode === 'tool') cb.onToolCancel();
      mode = 'pinch';
      const { mid, dist } = pinchState();
      const [wx, wy] = camera.toWorld(mid[0], mid[1]);
      pinch = { wx, wy, dist, scale: camera.scale };
    }
  });

  el.addEventListener('pointermove', (e) => {
    const p = local(e);
    if (!pointers.has(e.pointerId)) return cb.onHover?.(p);
    pointers.set(e.pointerId, p);

    if (mode === 'pending' && Math.hypot(p[0] - pan.x, p[1] - pan.y) > slop) {
      clearPending();
      const origin = [pan.x, pan.y];
      if (cb.shouldMoveSelection?.(origin)) {
        mode = 'tool';
        cb.onSelectionMoveStart(origin);
      } else mode = 'pan';
    }
    if (mode === 'pan') {
      camera.x = pan.camX + p[0] - pan.x;
      camera.y = pan.camY + p[1] - pan.y;
      cb.onCamera();
    } else if (mode === 'tool') {
      cb.onToolMove(p);
    } else if (mode === 'pinch' && pointers.size === 2) {
      const { mid, dist } = pinchState();
      const s = Math.min(camera.maxScale, Math.max(camera.minScale, (pinch.scale * dist) / pinch.dist));
      camera.scale = s;
      camera.x = mid[0] - pinch.wx * s;
      camera.y = mid[1] - pinch.wy * s;
      cb.onCamera();
    }
  });

  const up = (e) => {
    if (!pointers.delete(e.pointerId)) return;
    if (mode === 'pending') {
      clearPending();
      if (e.type === 'pointerup') cb.onTap?.(pan ? [pan.x, pan.y] : local(e));
    }
    if (mode === 'tool') {
      if (e.type === 'pointercancel') cb.onToolCancel();
      else cb.onToolEnd();
    }
    if (pointers.size === 0) mode = 'idle';
    else if (mode === 'pinch' && pointers.size === 1) beginPan([...pointers.values()][0]);
    else if (mode !== 'pinch') mode = 'idle';
  };
  el.addEventListener('pointerup', up);
  el.addEventListener('pointercancel', up);
  el.addEventListener('pointerleave', () => cb.onHover?.(null));

  el.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      const unit = e.deltaMode === 1 ? 30 : 1;
      const speed = e.ctrlKey ? 0.01 : 0.0015; // trackpad pinch reports small deltas with ctrlKey
      const [x, y] = local(e);
      camera.zoomAt(x, y, camera.scale * Math.exp(-e.deltaY * unit * speed));
      cb.onCamera();
    },
    { passive: false },
  );
  return {
    cancel() {
      clearPending();
      if (mode === 'tool') cb.onToolCancel();
      for (const id of pointers.keys()) {
        if (el.hasPointerCapture(id)) el.releasePointerCapture(id);
      }
      pointers.clear();
      mode = 'idle';
    },
  };
}
