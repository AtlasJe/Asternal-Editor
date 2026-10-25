import { attachGestures } from './camera.js';

// Map extent preview in cell coordinates; changes are applied only on confirmation.
export function createResizePanel({ map, camera, tileSize, onOpen, onApply, onCamera, parent = document.body, prefix = '', title = 'Tamaño del mapa', unit = 'tiles', minSize = 1, maxSize = 512 }) {
  const make = (tag, props = {}, children = []) => {
    if(prefix&&props.id){props={...props,className:prefix+props.id};delete props.id;}
    const node = Object.assign(document.createElement(tag), props);
    node.append(...children);
    return node;
  };
  const entry = make('button', { id: 'resize-entry', title: 'Ajustar '+title, innerHTML: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3H3v5M16 3h5v5M3 16v5h5M21 16v5h-5M3 3l6 6m12-6-6 6M3 21l6-6m12 6-6-6"/></svg>' });
  entry.setAttribute('aria-label', 'Ajustar '+title);
  const surface = make('div', { id: 'resize-surface', hidden: true });
  const guides = make('div', { id: 'map-boundaries' });
  guides.setAttribute('aria-hidden', 'true');
  const guideLines = {};
  const panel = make('form', { id: 'resize-panel', hidden: true });
  panel.setAttribute('aria-label', 'Propiedades de '+title);
  const width = make('input', { type: 'number', min: minSize, max: maxSize, required: true });
  const height = make('input', { type: 'number', min: minSize, max: maxSize, required: true });
  const fields = make('div', { className: 'resize-fields' }, [
    make('label', {}, ['Ancho', make('div', { className: 'number-with-unit' }, [width, make('small', { textContent: unit })])]),
    make('label', {}, ['Alto', make('div', { className: 'number-with-unit' }, [height, make('small', { textContent: unit })])]),
  ]);
  const anchorGrid = make('div', { className: 'resize-anchors' });
  anchorGrid.setAttribute('role', 'group');
  anchorGrid.setAttribute('aria-label', 'Fijar posición y expandir hacia las demás direcciones');
  const names = ['左上', '上', '右上', '左', '中心', '右', '左下', '下', '右下'];
  const symbols = ['↖', '↑', '↗', '←', '•', '→', '↙', '↓', '↘'];
  let anchor = 4;
  let rect;
  const anchors = names.map((name, i) => {
    const b = make('button', { type: 'button', title: `固定${name}`, textContent: symbols[i] });
    b.setAttribute('aria-label', `固定${name}`);
    b.addEventListener('click', () => { anchor = i; fromFields(); });
    anchorGrid.append(b);
    return b;
  });
  const cancel = make('button', { type: 'button', textContent: 'Cancelar' });
  const apply = make('button', { type: 'button', textContent: 'Aplicar', className: 'primary' });
  panel.append(make('header', {}, [make('strong', { textContent: title }), cancel, apply]), fields,
    make('div', { className: 'resize-direction' }, [make('div', {}, [make('strong', { textContent: 'Dirección de expansión' }), make('p', { textContent: 'Elige la posición fija y expande hacia las demás direcciones' })]), anchorGrid]));
  const lines = {};
  for (const edge of ['left', 'right', 'top', 'bottom']) {
    const line = make('div', { className: `resize-edge ${edge}` });
    line.setAttribute('aria-hidden', 'true');
    surface.append(line);
    lines[edge] = line;
    guideLines[edge] = make('div', { className: `resize-edge ${edge}` });
    guides.append(guideLines[edge]);
  }
  let gesture;
  const gestures=attachGestures(surface, camera, {
    shouldStartToolImmediately: () => true,
    onToolStart: ([x, y]) => {
      const s = tileSize * camera.scale;
      const distances = [
        ['left', Math.abs(x - camera.x - rect.left * s)],
        ['right', Math.abs(x - camera.x - rect.right * s)],
        ['top', Math.abs(y - camera.y - rect.top * s)],
        ['bottom', Math.abs(y - camera.y - rect.bottom * s)],
      ].sort((a, b) => a[1] - b[1]);
      gesture = { edge: distances[0][1] <= 11 ? distances[0][0] : null,
        x, y, camX: camera.x, camY: camera.y, world: camera.toWorld(x, y), rect: { ...rect } };
    },
    onToolMove: ([x, y]) => {
      if (!gesture) return;
      const { edge } = gesture;
      if (!edge) {
        camera.x = gesture.camX + x - gesture.x;
        camera.y = gesture.camY + y - gesture.y;
        onCamera();
        return;
      }
      const axis = edge === 'left' || edge === 'right' ? 0 : 1;
      const delta = Math.round((camera.toWorld(x, y)[axis] - gesture.world[axis]) / tileSize);
      const opposite = { left: 'right', right: 'left', top: 'bottom', bottom: 'top' }[edge];
      const low = edge === 'left' || edge === 'top';
      const fixed = gesture.rect[opposite];
      rect[edge] = Math.max(low ? fixed - maxSize : fixed + minSize,
        Math.min(low ? fixed - minSize : fixed + maxSize, gesture.rect[edge] + delta));
      sync();
    },
    onToolEnd: () => { gesture = null; },
    onToolCancel: () => {
      if (gesture?.edge) { rect = gesture.rect; sync(); }
      gesture = null;
    },
    onCamera,
  });
  function sync() {
    width.value = rect.right - rect.left;
    height.value = rect.bottom - rect.top;
    anchors.forEach((b, i) => { b.classList.toggle('active', i === anchor); b.setAttribute('aria-pressed', String(i === anchor)); });
    update();
  }
  function fromFields() {
    if (!width.checkValidity() || !height.checkValidity()) return;
    const w = Number(width.value), h = Number(height.value);
    const left = -Math.floor((w - map.width) * (anchor % 3) / 2);
    const top = -Math.floor((h - map.height) * Math.floor(anchor / 3) / 2);
    rect = { left, top, right: left + w, bottom: top + h };
    sync();
  }
  function update() {
    const s = tileSize * camera.scale;
    guideLines.left.style.left = `${camera.x}px`;
    guideLines.right.style.left = `${camera.x + map.width * s}px`;
    guideLines.top.style.top = `${camera.y}px`;
    guideLines.bottom.style.top = `${camera.y + map.height * s}px`;
    for (const edge of ['left', 'right']) {
      guideLines[edge].style.top = `${camera.y}px`;
      guideLines[edge].style.bottom = 'auto';
      guideLines[edge].style.height = `${map.height * s}px`;
    }
    for (const edge of ['top', 'bottom']) {
      guideLines[edge].style.left = `${camera.x}px`;
      guideLines[edge].style.right = 'auto';
      guideLines[edge].style.width = `${map.width * s}px`;
    }
    if (panel.hidden || !rect) return;
    for (const edge of ['left', 'right']) lines[edge].style.left = `${camera.x + rect[edge] * s}px`;
    for (const edge of ['top', 'bottom']) lines[edge].style.top = `${camera.y + rect[edge] * s}px`;
  }
  function close() {
    surface.hidden = panel.hidden = true;
    document.body.classList.remove('resizing-map');
    update();
    entry.focus();
  }
  width.addEventListener('input', fromFields);
  height.addEventListener('input', fromFields);
  cancel.addEventListener('click', close);
  const applyChanges = e => {
    e.preventDefault();
    if (!width.checkValidity() || !height.checkValidity()) return;
    onApply(rect.right - rect.left, rect.bottom - rect.top, rect.left, rect.top);
    close();
  };
  apply.addEventListener('click', applyChanges);
  panel.addEventListener('submit', applyChanges);
  panel.addEventListener('keydown', e => {
    if (e.key === 'Enter' && e.target.tagName === 'INPUT') applyChanges(e);
  });
  const onKeyDown=e => {
    if (panel.hidden) return;
    e.stopImmediatePropagation();
    if (e.key === 'Escape') { e.preventDefault(); close(); }
  };
  window.addEventListener('keydown',onKeyDown,true);
  function open() {
    if (!panel.hidden) return close();
    rect = { left: 0, top: 0, right: map.width, bottom: map.height };
    panel.hidden = surface.hidden = false;
    document.body.classList.add('resizing-map');
    onOpen(panel.getBoundingClientRect());
    sync();
  }
  entry.addEventListener('click',open);
  window.addEventListener('resize', update);
  parent.append(guides, entry, surface, panel);
  update();
  return { update, close, open, destroy(){gestures.cancel();window.removeEventListener('keydown',onKeyDown,true);window.removeEventListener('resize',update);document.body.classList.remove('resizing-map');for(const node of [guides,entry,surface,panel])node.remove();} };
}
