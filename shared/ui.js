import { createWangAtlas } from './wang-atlas.js';
// Overlay UI (DOM), shared by both renderers:
//   tool panel   docked at the bottom, height set by dragging its grip: a
//                source (built-in or a tile pack), category tabs and a
//                scrolling grid of terrain / object cards
//   tool bar     above the panel: vertical at the right edge (landscape) or a
//                centred row (portrait, shared with the layer button)
//   size bar     brush-size slider, one row further out than the tool bar
//   layer list   left sidebar, opened from a button in the free area's bottom-left

import {
  TerrainGrid,
  EMPTY,
  MAX_LAYER_OFFSET,
  dirBit,
  displayTileOrigin,
  objectAnim,
  objectAnimations,
  objectFrame,
  sheetFrames,
} from './grid.js';
import { DualGrid } from './terrain-strategies.js';
import { MAX_BRUSH, SELECT_MODES, SHAPES } from './editor.js';

const svg = (body) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;

export const ICONS = {
  pencil: svg('<path d="M4 20l4-1L19 8l-3-3L5 16l-1 4z"/><path d="M14 7l3 3"/>'),
  eraser: svg(
    '<path d="M3.7 14.3l9.6-9.6a2 2 0 0 1 2.8 0l3.2 3.2a2 2 0 0 1 0 2.8L11 19H8.4z"/><path d="M8.5 9.5l6 6"/><path d="M11 19h9"/>',
  ),
  fill: svg(
    '<path d="M19 11l-8-8-8.5 8.5a2 2 0 0 0 0 2.8l5.2 5.2a2 2 0 0 0 2.8 0z"/><path d="M5 2l5 5"/><path d="M2 13h15"/><path d="M22 20a2 2 0 1 1-4 0c0-1.6 1.7-2.4 2-4 .3 1.6 2 2.4 2 4z"/>',
  ),
  line: svg('<path d="M5 19L19 5"/>'),
  circle: svg('<circle cx="12" cy="12" r="7.5" fill="currentColor"/>'),
  rect: svg('<rect x="4.5" y="4.5" width="15" height="15" rx="1.5" fill="currentColor"/>'),
  circleOutline: svg('<circle cx="12" cy="12" r="7.5"/>'),
  rectOutline: svg('<rect x="4.5" y="4.5" width="15" height="15" rx="1.5"/>'),
  undo: svg('<path d="M9 14L4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>'),
  redo: svg('<path d="M15 14l5-5-5-5"/><path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13"/>'),
  layers: svg(
    '<path d="M12 3l9 5-9 5-9-5 9-5z"/><path d="M3 13l9 5 9-5"/><path d="M3 17.5l9 5 9-5" opacity=".5"/>',
  ),
  close: svg('<path d="M6 6l12 12M18 6L6 18"/>'),
  eye: svg('<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>'),
  eyeOff: svg(
    '<path d="M3 3l18 18"/><path d="M10.6 5.1A10 10 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3.2 4.1M6.6 6.6A17 17 0 0 0 2 12s3.5 7 10 7a9.6 9.6 0 0 0 5.4-1.6"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/>',
  ),
  plus: svg('<path d="M12 5v14M5 12h14"/>'),
  folder: svg('<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M12 11v5M9.5 13.5h5"/>'),
  chevron: svg('<path d="M9 6l6 6-6 6"/>'),
  tiles: svg('<rect x="4" y="4" width="7" height="7" rx="1"/><rect x="13" y="4" width="7" height="7" rx="1"/><rect x="4" y="13" width="7" height="7" rx="1"/><rect x="13" y="13" width="7" height="7" rx="1"/>'),
  contrast: svg('<circle cx="12" cy="12" r="8"/><path d="M12 4a8 8 0 0 1 0 16z" fill="currentColor"/>'),
  check: svg('<path d="M4.5 12.5l5 5 10-11"/>'),
  trash: svg('<path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M6 6l1 14h10l1-14"/>'),
  copy: svg('<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M15 9V4H4v11h5"/>'),
  gear: svg('<path d="M9 3h6l.6 3 2 .9 2.8-.9 3 5.2-2.2 2 .1 2.2 2.1 2-3 5.2-2.8-.9-2 .9L15 25H9l-.6-3-2-.9-2.8.9-3-5.2 2.2-2-.1-2.2-2.1-2 3-5.2 2.8.9 2-.9z" transform="translate(2 0) scale(.83)"/><circle cx="12" cy="12" r="3"/>'),
  selectRect: svg('<rect x="4" y="4" width="16" height="16" rx="1" stroke-dasharray="3 3"/>'),
  selectCircle: svg('<circle cx="12" cy="12" r="8" stroke-dasharray="3 2.6"/>'),
  selectWand: svg(
    '<path d="M3 21l11-11"/><path d="M15 4V2M15 12v-2M18 7h2M10 7h2M17.1 4.9l1.4-1.4M17.1 9.1l1.4 1.4M12.9 4.9l-1.4-1.4"/>',
  ),
  selectLasso: svg(
    '<path d="M7.5 17.4C4.3 16.2 2 13.8 2 11c0-4.4 4.5-8 10-8s10 3.6 10 8-4.5 8-10 8c-.9 0-1.8-.1-2.6-.3"/><circle cx="6" cy="18" r="2"/><path d="M6 20c0 1.5-1 2-2 2"/>',
  ),
};

const TOOL_LABELS = {
  pencil: 'Lápiz (B)',
  eraser: 'Borrador (E)',
  shape: 'Formas (U)',
  fill: 'Relleno (F)',
  select: 'Selección (M)',
};
const SHAPE_LABELS = {
  line: 'Línea',
  circle: 'Círculo',
  rect: 'Rectángulo',
  circleOutline: 'Contorno circular',
  rectOutline: 'Contorno rectangular',
};
const SELECT_LABELS = {
  selectRect: 'Selección rectangular',
  selectCircle: 'Selección circular',
  selectWand: 'Varita mágica',
  selectLasso: 'Lazo',
};

// A small real-tile preview: a 2x2 block of terrain t on a transparent
// background, so the card shows that terrain's own edge art and nothing else
// (just the top surface; frames[m] is the mask's region in `sheet`).
export function terrainIcon(sheet, frames, tileSize, t, edge = false) {
  const T = tileSize;
  if (edge) return edgeIcon(sheet, frames, T);
  const g = new TerrainGrid(4, 4);
  for (const i of [5, 6, 9, 10]) g.cells[i] = t; // centre 2x2 of the 4x4 grid
  const c = document.createElement('canvas');
  c.width = c.height = 3 * T;
  const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  ctx.translate(-T / 2, -T / 2); // crop to the centre 3x3 cells
  for (let dy = 0; dy < g.displayHeight; dy++) {
    for (let dx = 0; dx < g.displayWidth; dx++) {
      const m = DualGrid.mask(g, dx, dy, t);
      if (!m) continue;
      const o = displayTileOrigin(dx, dy, T);
      const f = frames[m];
      ctx.drawImage(sheet, f.x, f.y, T, T, o.x, o.y, T, T);
    }
  }
  return c;
}

// An object's sprite, scaled to fit a card icon. Animated objects (a strip
// of `frames` frames) get c.showFrame(k) to redraw another frame.
function objectIcon(img, frames = 1, maxScale = 3) {
  const c = document.createElement('canvas');
  c.width = c.height = 96;
  if (!img) return c;
  const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  const fw = img.width / frames;
  const k = Math.min(96 / fw, 96 / img.height, maxScale);
  const w = fw * k;
  const h = img.height * k;
  c.showFrame = (f) => {
    ctx.clearRect(0, 0, 96, 96);
    ctx.drawImage(img, f * fw, 0, fw, img.height, (96 - w) / 2, (96 - h) / 2, w, h);
  };
  c.showFrame(0);
  return c;
}

// Edge-connected terrain (road, wall): an S-shaped path through a 3x3 cell
// canvas; each cell links to the cells before and after it on the path.
const S_PATH = [
  [2, 0],
  [1, 0],
  [0, 0],
  [0, 1],
  [1, 1],
  [2, 1],
  [2, 2],
  [1, 2],
  [0, 2],
];

function edgeIcon(sheet, frames, T) {
  const c = document.createElement('canvas');
  c.width = c.height = 3 * T;
  const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  S_PATH.forEach(([x, y], i) => {
    let m = 0;
    for (const n of [S_PATH[i - 1], S_PATH[i + 1]]) if (n) m |= dirBit(x, y, n[0], n[1]);
    const f = frames[m];
    ctx.drawImage(sheet, f.x, f.y, T, T, x * T, y * T, T, T);
  });
  return c;
}

const SOURCE_KEY = 'tilemap:panel-source';
const HEIGHT_KEY = 'tilemap:panel-height';
const WIDTH_KEY = 'tilemap:panel-width';

// localStorage, best effort (private windows may refuse).
function recall(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function store(key, value) {
  try {
    localStorage.setItem(key, String(value));
  } catch {
    /* not kept */
  }
}

// tools: ToolController. actions: { change, undo, redo }
// defaultSource: pack id the panel shows until the user picks a source
export function createPanel({ config, sheets, objectSprites = [], tools, actions, defaultSource = '' }) {
  const shell = el('section', { id: 'panel-shell', className: 'panel-shell' });
  const panel = el('div', { id: 'panel', className: 'panel-view' });
  const assetSheet = el('section', { className: 'dock-sheet asset-sheet' });
  assetSheet.append(panel);
  shell.append(assetSheet);
  const iconBtn = (name, title, onClick) => {
    const b = el('button', { className: 'icon', title, innerHTML: ICONS[name] });
    b.addEventListener('click', onClick);
    return b;
  };

  // ---- tools ----
  // Shape and select carry a submenu: tapping the active one opens it.
  const SUBMENUS = {
    shape: { items: SHAPES, labels: SHAPE_LABELS, key: 'shape' },
    select: { items: SELECT_MODES, labels: SELECT_LABELS, key: 'selectMode' },
  };
  const toolButtons = {};
  for (const name of ['pencil', 'eraser', 'shape', 'select', 'fill']) {
    const sub = SUBMENUS[name];
    toolButtons[name] = iconBtn(sub ? tools[sub.key] : name, TOOL_LABELS[name], () => {
      if (sub && tools.tool === name) toggleMenu(name);
      else setTool(name);
    });
    if (sub) toolButtons[name].classList.add('has-menu');
  }
  const toolBar = el('div', { id: 'tool-bar' }, Object.values(toolButtons));

  // ---- submenus (live on body so nothing clips them) ----
  const menus = {};
  for (const [name, sub] of Object.entries(SUBMENUS)) {
    const menu = el('div', { className: 'tool-menu', hidden: true });
    const items = sub.items.map((value) => {
      const b = el('button', {
        className: 'menu-item',
        innerHTML: `${ICONS[value]}<span>${sub.labels[value]}</span>`,
      });
      b.addEventListener('click', () => {
        tools[sub.key] = value;
        setTool(name);
        closeMenus();
      });
      return b;
    });
    menu.append(...items);
    document.body.append(menu);
    menus[name] = { menu, items, sub };
  }

  function toggleMenu(name) {
    const { menu } = menus[name];
    const wasOpen = !menu.hidden;
    closeMenus();
    if (wasOpen) return;
    menu.hidden = false;
    const b = toolButtons[name].getBoundingClientRect();
    const m = menu.getBoundingClientRect();
    const vertical = toolBar.offsetHeight > toolBar.offsetWidth;
    // Vertical bar (landscape): open to the left of the button. Horizontal (portrait): open above it.
    const x = vertical ? b.left - m.width - 8 : Math.min(b.left, window.innerWidth - m.width - 8);
    const y = vertical ? Math.min(b.top, window.innerHeight - m.height - 8) : b.top - m.height - 8;
    menu.style.left = `${Math.max(8, x)}px`;
    menu.style.top = `${Math.max(8, y)}px`;
  }
  function closeMenus() {
    for (const { menu } of Object.values(menus)) menu.hidden = true;
  }
  document.addEventListener('pointerdown', (e) => {
    const inside = Object.entries(menus).some(
      ([name, { menu }]) => menu.contains(e.target) || toolButtons[name].contains(e.target),
    );
    if (!inside) closeMenus();
  });
  window.addEventListener('resize', closeMenus);

  // ---- brush size: a property of the current tool (pencil / eraser / shape) ----
  const sizeSlider = el('input', { type: 'range', min: 1, max: MAX_BRUSH, step: 1, title: 'Tamaño del pincel ([ ])' });
  sizeSlider.addEventListener('input', () => setSize(Number(sizeSlider.value)));
  const sizeValue = el('span', { className: 'value' });
  const sizeRow = el('div', { id: 'size-bar', title: 'Tamaño del pincel ([ ])' }, [sizeSlider, sizeValue]);

  // ---- terrains ----
  const frames = sheetFrames(config);
  const terrainButtons = config.terrains.map((t, i) => {
    const b = el('button', { className: 'terrain', title: `${t.label ?? t.name} (${i + 1})` }, [
      el('span', { className: 'asset-art' }, [t.wang ? wangIcon(sheets[i], frames[i][0]) : terrainIcon(sheets[i], frames[i], config.tileSize, i, t.connect === 'edge')]),
      el('span', { className: 'asset-name', textContent: t.label ?? t.name }),
    ]);
    b.addEventListener('click', () => setTerrain(i));
    return b;
  });
  // Objects share the card grid, after the terrains.
  const animatedIcons = []; // [button, canvas, animations, frame shown]: cards play the default animation
  const objectButtons = (config.objects ?? []).map((o, i) => {
    const anims = objectAnimations(o);
    const icon = objectIcon(objectSprites[i], anims.frameCount, Infinity);
    const names = anims.animations.length > 1 ? `, animaciones: ${anims.animations.map((a) => a.label).join(' / ')}` : '';
    const b = el('button', { className: 'terrain object', title: `${o.label} (tamaño ${o.footprint[0]}×${o.footprint[1]}${names})` }, [
      el('span', { className: 'asset-art' }, [icon]),
      el('span', { className: 'asset-name', textContent: o.label }),
    ]);
    icon.showFrame?.(anims.animations[0].frames[0]);
    if (anims.animations[0].frames.length > 1 && icon.showFrame) animatedIcons.push([b, icon, anims, -1]);
    b.addEventListener('click', () => setObject(i));
    return b;
  });
  // ---- asset browser: one project pack and category at a time ----
  const entries = [
    ...config.terrains.map((t, i) => ({ entry: t, button: terrainButtons[i], group: t.wang ? `wang:${i}` : 'Terreno' })),
    ...(config.objects ?? []).map((o, i) => ({ entry: o, button: objectButtons[i], group: o.group ?? 'Objetos' })),
  ];
  const sources = [];
  for (const { entry } of entries)
    if (entry.pack && !sources.some((s) => s.id === entry.pack.id)) sources.push(entry.pack);
  // Source switcher: a button outside the panel, top right (mirroring the
  // layer button on the left), opening a read-only menu of sources.
  const sourceName = el('span');
  const sourceEntry = el('button', { id: 'source-entry', title: 'Paquete de tiles' });
  sourceEntry.innerHTML = ICONS.tiles;
  sourceEntry.append(sourceName);
  const sourceMenu = el('div', { id: 'source-menu', hidden: true });
  let sourceAnimation = null;
  const animateSourceMenu = (open) => {
    const current = sourceMenu.getBoundingClientRect();
    sourceAnimation?.cancel();
    sourceAnimation = null;
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
      sourceMenu.hidden = !open;
      sourceMenu.style.overflow = '';
      return;
    }
    const button = sourceEntry.getBoundingClientRect();
    const full = open ? sourceMenu.getBoundingClientRect() : current;
    const compact = {width:Math.min(button.width,full.width),height:Math.min(button.height,full.height)};
    const size = rect => ({width:`${rect.width}px`,height:`${rect.height}px`});
    sourceMenu.style.overflow = 'hidden';
    sourceAnimation = sourceMenu.animate(open ? [size(compact),size(full)] : [size(full),size(compact)], {
      duration:240,easing:'cubic-bezier(.22,.8,.25,1)',fill:'both',
    });
    const animation = sourceAnimation;
    animation.onfinish = () => {
      sourceMenu.hidden = !open;
      animation.cancel();
      sourceMenu.style.overflow = '';
      if (sourceAnimation === animation) sourceAnimation = null;
    };
  };
  const closeSourceMenu = () => {
    if (!sourceMenu.hidden) animateSourceMenu(false);
  };
  sourceEntry.addEventListener('click', () => {
    if (!sourceMenu.hidden) return closeSourceMenu();
    buildSourceMenu();
    sourceMenu.hidden = false;
    const b = sourceEntry.getBoundingClientRect();
    sourceMenu.style.left = 'auto';
    sourceMenu.style.top = 'auto';
    sourceMenu.style.maxWidth = `${Math.max(180, b.right - 8)}px`;
    sourceMenu.style.maxHeight = `${Math.max(80, b.top - 16)}px`;
    sourceMenu.style.right = `${Math.max(8, window.innerWidth - b.right)}px`;
    sourceMenu.style.bottom = `${window.innerHeight - b.top + 8}px`;
    animateSourceMenu(true);
  });
  document.addEventListener('pointerdown', (e) => {
    if (!sourceMenu.contains(e.target) && !sourceEntry.contains(e.target)) closeSourceMenu();
  });
  window.addEventListener('resize', closeSourceMenu);
  function buildSourceMenu() {
    const rows = sources.map((s) => {
      const pick = el('button', { type: 'button', className: 'source-pick', textContent: s.name, title: s.name });
      pick.classList.toggle('active', s.id === source);
      pick.addEventListener('click', () => {
        closeSourceMenu();
        showSource(s.id);
      });
      const row = el('div', { className: 'source-row' }, [pick]);
      return row;
    });
    sourceMenu.replaceChildren(el('div', { className: 'source-title', textContent: 'Paquete de tiles' }), ...rows);
  }
  const tabs = el('div', { className: 'category-tabs' });
  const grid = el('div', { className: 'section terrains' });
  const wangAtlas = createWangAtlas({ config, sheets, tools, changed: () => refresh(), annotationsSaved: actions.annotationsSaved, modeChanged: expandAnnotations });
  const grip = el('div', { className: 'panel-grip', title: 'Arrastra para ajustar la altura' });
  const head = el('div', { className: 'panel-head' }, [tabs]);
  function measureAnnotationChrome(){
    const view=wangAtlas.el.querySelector('.wang-atlas-viewport').getBoundingClientRect();
    const box=shell.getBoundingClientRect(),style=getComputedStyle(shell);
    shell.style.setProperty('--annotation-chrome-height',`${box.height-view.height-parseFloat(style.borderTopWidth)-parseFloat(style.borderBottomWidth)}px`);
  }
  window.addEventListener('resize',()=>{if(shell.classList.contains('annotation-expanded'))measureAnnotationChrome();});
  let annotationAnimation = 0;
  function expandAnnotations(expanded) {
    clearTimeout(annotationAnimation);
    if (expanded && !shell.classList.contains('annotation-expanded')) measureAnnotationChrome();
    shell.classList.add('annotation-transition');
    // Capture the current height before changing the target; the original inline
    // dock height is untouched, so closing restores the user's dragged height.
    void shell.offsetHeight;
    shell.classList.toggle('annotation-expanded', expanded);
    annotationAnimation = setTimeout(() => shell.classList.remove('annotation-transition'), 360);
  }

  let source = '';
  let category = null; // the category tab showing
  function showSource(id) {
    if (!wangAtlas.canSwitch()) return;
    source = sources.some((s) => s.id === id) ? id : (sources[0]?.id ?? '');
    const name = sources.find((x) => x.id === source)?.name ?? 'Sin recursos';
    sourceName.textContent = name;
    sourceEntry.title = `Paquete de tiles: ${name} (clic para cambiar)`;
    store(SOURCE_KEY, source);
    category = null;
    render();
  }
  // Category tabs: plain text; a blue line under the current one slides over
  // to the next (style.css transitions its position and width).
  let groups = new Map(); // category -> card buttons, for the shown source
  const tabLine = el('div', { className: 'tab-line' });
  function render() {
    const mine = entries.filter((e) => (e.entry.pack?.id ?? '') === source);
    groups = new Map();
    for (const e of mine) {
      if (!groups.has(e.group)) groups.set(e.group, []);
      groups.get(e.group).push(e.button);
    }
    if (!groups.has(category)) category = groups.keys().next().value ?? null;
    tabs.replaceChildren(
      ...[...groups].map(([g, list]) => {
        const wang = g.startsWith('wang:') ? config.terrains[Number(g.slice(5))] : null;
        const label = wang ? wang.label ?? wang.name : g;
        const b = el('button', { type: 'button', textContent: label, title: wang ? label : `${label}（${list.length}）` });
        b.dataset.group = g;
        b.addEventListener('click', () => showCategory(g));
        return b;
      }),
      tabLine,
    );
    tabLine.classList.add('instant'); // a new source: no slide from the old tabs
    showCategory(category);
    requestAnimationFrame(() => tabLine.classList.remove('instant'));
  }
  function showCategory(g) {
    if (g !== category && !wangAtlas.canSwitch()) return;
    category = g;
    let active = null;
    for (const b of tabs.querySelectorAll('button')) {
      const on = b.dataset.group === g;
      b.classList.toggle('active', on);
      if (on) active = b;
    }
    if (active) {
      tabLine.style.transform = `translateX(${active.offsetLeft}px)`;
      tabLine.style.width = `${active.offsetWidth}px`;
      tabLine.hidden = false;
      active.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
    } else tabLine.hidden = true;
    const children = [...(groups.get(g) ?? [])];
    if (!children.length) children.push(el('div', { className: 'group-title', textContent: 'Esta fuente no tiene recursos' }));
    const wangIndices = typeof g === 'string' && g.startsWith('wang:') ? [Number(g.slice(5))] : [];
    shell.classList.toggle('wang-panel',wangIndices.length > 0);
    panel.classList.toggle('wang-panel',wangIndices.length > 0);
    grid.replaceChildren(...(wangIndices.length ? [wangAtlas.el] : children));
    wangAtlas.show(wangIndices);
    grid.scrollTop = 0;
  }
  // Tab widths are only known once laid out (fonts, panel width).
  new ResizeObserver(() => {
    tabLine.classList.add('instant');
    showCategory(category);
    requestAnimationFrame(() => tabLine.classList.remove('instant'));
  }).observe(tabs);

  // Animated cards play on the map's clock, while on the shown tab page.
  const playIcons = (now) => {
    for (const a of animatedIcons) {
      if (!a[0].isConnected) continue;
      const f = objectFrame(a[2], now);
      if (f !== a[3]) {
        a[3] = f;
        a[1].showFrame(f);
      }
    }
    requestAnimationFrame(playIcons);
  };
  if (animatedIcons.length) requestAnimationFrame(playIcons);

  // Independent portrait height and landscape width preferences.
  const MIN_H = 140;
  let preferredWidth = Number(recall(WIDTH_KEY)) || 320;
  const landscape = () => matchMedia('(orientation: landscape)').matches;
  const panelWidth = () => Math.round(Math.min(Math.max(200, innerWidth - 400), Math.max(220, preferredWidth)));
  const syncWidth = () => {
    document.documentElement.style.setProperty('--panel-width', `${panelWidth()}px`);
    grip.title = landscape() ? 'Arrastra para cambiar el ancho' : 'Arrastra para cambiar el alto';
  };
  const setHeight = (h) => {
    const max = Math.max(MIN_H, window.innerHeight * 0.8);
    shell.style.height = `${Math.round(Math.min(max, Math.max(MIN_H, h)))}px`;
  };
  syncWidth();
  setHeight(Number(recall(HEIGHT_KEY)) || 230);
  const bindGrip = (handle) => handle.addEventListener('pointerdown', (e) => {
    const grip = handle;
    e.preventDefault();
    grip.setPointerCapture(e.pointerId);
    const horizontal = landscape();
    const start = horizontal ? e.clientX : e.clientY;
    const initial = horizontal ? panelWidth() : shell.getBoundingClientRect().height;
    const move = (ev) => {
      const size = initial + start - (horizontal ? ev.clientX : ev.clientY);
      if (horizontal) {
        preferredWidth = Math.min(Math.max(200, innerWidth - 400), Math.max(220, size));
        syncDockEdges();
      } else setHeight(size);
    };
    const up = () => {
      grip.removeEventListener('pointermove', move);
      grip.removeEventListener('pointerup', up);
      grip.removeEventListener('pointercancel', up);
      store(horizontal ? WIDTH_KEY : HEIGHT_KEY, horizontal ? preferredWidth : Math.round(shell.getBoundingClientRect().height));
    };
    grip.addEventListener('pointermove', move);
    grip.addEventListener('pointerup', up);
    grip.addEventListener('pointercancel', up);
  });

  bindGrip(grip);
  showSource(recall(SOURCE_KEY) ?? defaultSource);

  // ---- undo / redo: floats at the top centre of the area the panel leaves free ----
  const historyBar = el('div', { id: 'history-bar' }, [
    iconBtn('undo', 'Deshacer (Ctrl+Z)', () => actions.undo()),
    iconBtn('redo', 'Rehacer (Ctrl+Shift+Z)', () => actions.redo()),
  ]);

  assetSheet.prepend(grip);
  panel.append(head, grid);
  document.body.append(toolBar, sizeRow, historyBar, sourceEntry, sourceMenu);

  // Expose how much of the bottom edge the panel covers (portrait), so other
  // overlays can sit above it.
  const syncDock = () => {
    const rect = shell.getBoundingClientRect();
    document.documentElement.style.setProperty(
      '--dock-bottom',
      `${!matchMedia('(orientation: landscape)').matches && rect.height > 0 ? Math.max(0, window.innerHeight - rect.top) : 0}px`,
    );
  };
  const syncDockEdges = () => {
    syncWidth();
    syncDock();
    document.documentElement.style.setProperty('--dock-right', `${landscape() ? panelWidth() : 0}px`);
  };
  new ResizeObserver(syncDockEdges).observe(shell);
  window.addEventListener('resize', syncDockEdges);

  // Tapping the picked terrain again un-picks it and leaves no tool active:
  // the map then makes rectangle selections (tap selects a tile). Picking a
  // terrain brings back the paint tool; picking a paint tool brings back the
  // terrain.
  const PAINT_TOOLS = ['pencil', 'shape', 'fill'];
  let lastTerrain = tools.terrain ?? 0;
  let lastTool = 'pencil'; // paint tool to restore after un-picking the terrain
  // Objects support pencil and shapes; fill goes back to terrain.
  function setTool(name) {
    if (tools.object !== null && name === 'fill') tools.object = null;
    if (PAINT_TOOLS.includes(name) && tools.terrain === null && tools.object === null) tools.terrain = lastTerrain;
    tools.tool = name;
    refresh();
  }
  // Picking an object (tapping it again un-picks it, like a terrain).
  function setObject(i) {
    if (tools.object === i) {
      tools.object = null;
      tools.tool = null;
    } else {
      if (tools.terrain !== null) lastTerrain = tools.terrain;
      tools.object = i;
      tools.terrain = null;
      if (tools.tool !== 'shape') tools.tool = 'pencil';
    }
    refresh();
  }
  function setTerrain(i) {
    if (i !== tools.terrain) tools.wangBrush = {};
    tools.object = null;
    if (i === tools.terrain) {
      lastTerrain = i;
      if (PAINT_TOOLS.includes(tools.tool)) lastTool = tools.tool;
      tools.terrain = null;
      tools.tool = null;
    } else {
      tools.terrain = i;
      if (tools.tool === null) tools.tool = lastTool;
      else if (tools.tool === 'eraser') tools.tool = 'pencil';
    }
    refresh();
  }
  function setSize(s) {
    tools.size = s;
    refresh();
  }
  function refresh() {
    for (const [name, b] of Object.entries(toolButtons)) b.classList.toggle('active', tools.tool === name);
    for (const [name, { items, sub }] of Object.entries(menus)) {
      toolButtons[name].innerHTML = ICONS[tools[sub.key]];
      items.forEach((b, i) => b.classList.toggle('active', sub.items[i] === tools[sub.key]));
    }
    sizeRow.hidden = !tools.usesSize;
    sizeSlider.value = tools.size;
    sizeValue.textContent = tools.size;
    sizeSlider.style.setProperty('--fill', `${((tools.size - 1) / (MAX_BRUSH - 1)) * 100}%`);
    terrainButtons.forEach((b, i) => b.classList.toggle('active', i === tools.terrain));
    objectButtons.forEach((b, i) => b.classList.toggle('active', i === tools.object));
    actions.change?.();
  }
  refresh();

  return {
    el: shell,
    content: panel,
    grip,
    mountProperties(view) {
      const handle = el('div', { className: 'panel-grip', title: grip.title });
      const sheet = el('section', { className: 'dock-sheet property-sheet', inert: true }, [handle, view]);
      shell.append(sheet);
      bindGrip(handle);
    },
    toolBar,
    sizeBar: sizeRow,
    syncDock:syncDockEdges,
    setTool,
    setTerrain,
    setSize,
  };
}

// Property panel for the selected object, docked at the bottom where the
// asset panel is (that one hides while something is selected): its name and
// footprint, and its animations as buttons with a moving preview each; picking
// one calls onPick(name). A "play" checkbox (when the animation has several
// frames) calls onPlay(bool). show(def, obj, sprite) / show(null).
export function createObjectProps({ onPick, onPlay, onRename }) {
  const box = el('div', { id: 'object-props', className: 'panel-view property-view', hidden: true });
  let shownObject = null;
  let previews = []; // [canvas, animation, frame shown]
  let playing = false;
  const play = (now) => {
    if (box.hidden || !previews.length) return (playing = false);
    for (const p of previews) {
      const f = objectFrame({ animations: [p[1]] }, now);
      if (f !== p[2]) {
        p[2] = f;
        p[0].showFrame(f);
      }
    }
    requestAnimationFrame(play);
  };
  function show(def, obj, sprite) {
    if (!def) {
      box.hidden = true;
      const host = box.closest('.panel-shell');
      host?.classList.remove('property-active');
      if (host) { host.querySelector('.asset-sheet').inert = false; host.querySelector('.property-sheet').inert = true; }
      return;
    }
    if (shownObject === obj && box.contains(document.activeElement)) return;
    shownObject = obj;
    const current = objectAnim(def, obj).name;
    previews = [];
    const buttons = def.animations.map((a) => {
      const icon = objectIcon(sprite, def.frameCount);
      icon.showFrame?.(a.frames[0]);
      if (a.frames.length > 1 && icon.showFrame) previews.push([icon, a, -1]);
      const b = el('button', { type: 'button', className: 'terrain', title: a.frames.length > 1 ? `${a.label}（${a.frames.length} 帧）` : a.label }, [
        icon,
        el('span', { textContent: a.label }),
      ]);
      b.classList.toggle('active', a.name === current);
      b.addEventListener('click', () => onPick(a.name));
      return b;
    });
    const property = (name, value) => el('div', { className: 'props-row' }, [
      el('span', { className: 'props-label', textContent: name }),
      value,
    ]);
    const name = el('input', { type: 'text', className: 'props-name', value: obj.name ?? def.label, maxLength: 80 });
    name.setAttribute('aria-label', 'Nombre del objeto');
    name.addEventListener('change', () => {
      const value = name.value.trim();
      if (value) onRename(value);
      else name.value = obj.name ?? def.label;
    });
    name.addEventListener('keydown', e => {
      e.stopPropagation();
      if (e.key === 'Enter') { e.preventDefault(); name.blur(); }
      if (e.key === 'Escape') { name.value = obj.name ?? def.label; name.blur(); }
    });
    const rows = [
      property('Nombre', name),
      property('Animación', def.animations.length > 1
        ? el('div', { className: 'props-anims' }, buttons)
        : el('span', { className: 'props-value', textContent: objectAnim(def, obj).label })),
    ];
    if (objectAnim(def, obj).frames.length > 1) {
      const check = el('input', { type: 'checkbox', checked: !obj?.paused });
      check.setAttribute('aria-label', 'Reproducir animación');
      check.title = 'Desmarcar: detener en el primer fotograma';
      check.addEventListener('change', () => onPlay(check.checked));
      rows.push(el('label', { className: 'props-row props-play' }, [
        el('span', { className: 'props-label', textContent: 'Reproducir animación' }),
        check,
      ]));
    }
    const avatar = objectIcon(sprite, def.frameCount);
    avatar.className = 'props-avatar';
    avatar.setAttribute('role', 'img');
    avatar.setAttribute('aria-label', obj.name ?? def.label);
    avatar.showFrame?.(objectAnim(def, obj).frames[0]);
    box.replaceChildren(avatar, ...rows);
    box.hidden = false;
    const host = box.closest('.panel-shell');
    host?.classList.add('property-active');
    if (host) { host.querySelector('.asset-sheet').inert = true; host.querySelector('.property-sheet').inert = false; }
    if (previews.length && !playing) {
      playing = true;
      requestAnimationFrame(play);
    }
  }
  document.body.append(box);
  return { el: box, show };
}

// Floating actions for the current selection, placed just below the selection
// box (above it when there is no room). actions: { clearContents(), copy(), confirm() }
export function createSelectionBar({ actions, parent=document.body, prefix='' }) {
  const make=el;
  const scoped=(tag,props={},children=[])=>{if(prefix&&props.id)props={...props,id:prefix+props.id,className:prefix+props.id};return make(tag,props,children);};
  const btn = (icon, label, onClick) => {
    const b = scoped('button', { className: 'icon', title: label, innerHTML: ICONS[icon] });
    b.addEventListener('click', onClick);
    return b;
  };
  const menu = scoped('div', { id: 'object-layer-menu', hidden: true });
  const closeMenu = () => { menu.hidden = true; move.setAttribute('aria-expanded', 'false'); };
  const move = btn('layers', 'Mover a capa', () => {
    if (!menu.hidden) return closeMenu();
    const targets = actions.layerTargets();
    if (!targets) return;
    menu.replaceChildren(...targets.map(layer => {
      const pick = scoped('button', { type: 'button', textContent: layer.name + (layer.visible ? '' : ' (oculta)') });
      pick.addEventListener('click', () => { closeMenu(); actions.moveToLayer(layer.index); });
      return pick;
    }));
    if (!targets.length) menu.append(el('span', { className: 'empty-layers', textContent: 'No hay otras capas' }));
    menu.hidden = false;
    move.setAttribute('aria-expanded', 'true');
    const rect = move.getBoundingClientRect();
    menu.style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - menu.offsetWidth - 8))}px`;
    menu.style.top = `${Math.max(8, rect.bottom + 8 + menu.offsetHeight <= window.innerHeight - 8 ? rect.bottom + 8 : rect.top - menu.offsetHeight - 8)}px`;
    menu.animate([{ opacity: 0, transform: 'translateY(-6px)' }, { opacity: 1, transform: 'translateY(0)' }], { duration: 160 });
  });
  move.setAttribute('aria-label', 'Mover capa');
  move.setAttribute('aria-expanded', 'false');
  move.setAttribute('aria-controls', prefix+'object-layer-menu');
  const onOutside=e => {
    if (!menu.contains(e.target) && !move.contains(e.target)) closeMenu();
  };
  const onKey=e => {
    if (e.key === 'Escape' && !menu.hidden) { e.stopImmediatePropagation(); closeMenu(); move.focus(); }
  };
  parent.addEventListener('pointerdown',onOutside,true);
  document.addEventListener('keydown',onKey,true);
  const bar = scoped('div', { id: 'selection-bar', hidden: true }, [
    btn('trash', 'Eliminar', () => actions.clearContents()),
    move,
    btn('copy', 'Duplicar (arrastra la copia y confirma)', () => actions.copy()),
    btn('check', 'Confirmar (aplicar movimiento y terminar selección)', () => actions.confirm()),
  ]);
  parent.append(bar, menu);

  const GAP = 10;
  const MARGIN = 8;
  const overlaps = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;

  return {
    destroy(){parent.removeEventListener('pointerdown',onOutside,true);document.removeEventListener('keydown',onKey,true);bar.remove();menu.remove();},
    // box: the selection's screen rect { left, top, right, bottom }, or null to hide.
    // obstacles: screen rects of other overlays the bar must not cover.
    place(box, obstacles = []) {
      closeMenu();
      move.hidden = actions.layerTargets() === null;
      bar.hidden = !box;
      if (!box) return;
      const w = bar.offsetWidth;
      const h = bar.offsetHeight;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const left = Math.min(Math.max(MARGIN, (box.left + box.right) / 2 - w / 2), vw - w - MARGIN);
      const at = (top) => ({ left, top, right: left + w, bottom: top + h });
      const fits = (r) =>
        r.top >= MARGIN && r.bottom <= vh - MARGIN && !obstacles.some((o) => overlaps(r, o));
      const below = at(box.bottom + GAP);
      const above = at(box.top - GAP - h);
      let r = fits(below) ? below : fits(above) ? above : null;
      // Neither side is clear (e.g. a huge selection): pin inside the viewport.
      if (!r) r = at(Math.min(Math.max(MARGIN, box.bottom + GAP), vh - h - MARGIN));
      bar.style.left = `${r.left}px`;
      bar.style.top = `${r.top}px`;
    },
  };
}

// actions: layer selection, visibility, creation and settings.
export function createLayerPanel({ config, map, actions, parent=document.body, prefix='', drawThumbnail }) {
  const baseEl=el;
  const make=(tag,props={},children=[])=>{if(prefix&&props.id)props={...props,id:prefix+props.id,className:prefix+props.id};return baseEl(tag,props,children);};

  const entry = make('button', { id: 'layer-entry', title: 'Capas' });
  const entryName = make('span');
  entry.innerHTML = ICONS.layers;
  entry.append(entryName);

  const list = make('div', { className: 'layer-list' });
  const expandedLayers=new Set();
  let layerDrag = null;
  let suppressClickUntil = 0;
  list.addEventListener('click', e => {
    if (performance.now() < suppressClickUntil) { e.preventDefault(); e.stopImmediatePropagation(); }
  }, true);
  list.addEventListener('contextmenu', e => e.preventDefault());
  list.addEventListener('pointerdown', e => {
    if (e.button !== 0 || layerDrag || e.target.closest('button')) return;
    const row = e.target.closest('.layer-row, .layer-object-row');
    if (!row) return;
    const objectRow=row.classList.contains('layer-object-row'),layerIndex=Number(row.dataset.layerIndex);
    const siblings=()=>[...list.children].filter(n=>objectRow?n.classList.contains('layer-object-row')&&Number(n.dataset.layerIndex)===layerIndex:n.classList.contains('layer-row'));
    const count=siblings().length,from=objectRow?Number(row.dataset.objectIndex):layerIndex;
    const startY = e.clientY, startX = e.clientX, scroll = list.scrollTop;
    let active = false, moved = false, lastY = startY, lastX = startX, frame;
    let ghost, insertion, destination = count - 1 - from;
    const origin = row.getBoundingClientRect();
    const preview = () => {
      const bounds = list.getBoundingClientRect();
      if (lastY < bounds.top + 32) list.scrollTop -= 7;
      if (lastY > bounds.bottom - 32) list.scrollTop += 7;
      const others = siblings().filter(n => n !== row);
      const next = others.find(n => { const r = n.getBoundingClientRect(); return lastY < r.top + r.height / 2; });
      destination = next ? others.indexOf(next) : others.length;
      const y = next ? next.getBoundingClientRect().top - 2 : (others.at(-1)?.getBoundingClientRect().bottom ?? bounds.top) + 2;
      insertion.style.left = `${bounds.left}px`;
      insertion.style.width = `${bounds.width}px`;
      insertion.style.top = `${Math.max(bounds.top, Math.min(bounds.bottom - 3, y))}px`;
      ghost.style.left = `${origin.left + lastX - startX + 8}px`;
      ghost.style.top = `${origin.top + lastY - startY + 8}px`;
      frame = requestAnimationFrame(preview);
    };
    const timer = setTimeout(() => {
      active = true;
      list.setPointerCapture(e.pointerId);
      ghost = row.cloneNode(true);
      ghost.classList.add('layer-drag-ghost');
      ghost.setAttribute('aria-hidden', 'true');
      ghost.inert = true;
      ghost.style.width = `${origin.width}px`;
      ghost.querySelectorAll('canvas').forEach((canvas,i) => canvas.getContext('2d').drawImage(row.querySelectorAll('canvas')[i],0,0));
      insertion = make('div', { className: 'layer-drop-line' });
      insertion.setAttribute('aria-hidden', 'true');
      parent.append(ghost,insertion);
      row.classList.add('sorting');
      list.classList.add('sorting');
      frame = requestAnimationFrame(preview);
    }, 380);
    const move = ev => {
      if (ev.pointerId !== e.pointerId) return;
      lastY = ev.clientY; lastX = ev.clientX;
      if (!active && Math.hypot(ev.clientX - startX, lastY - startY) > 8) {
        moved = true; clearTimeout(timer);
      }
      if (moved && !active) list.scrollTop = scroll + startY - lastY;
    };
    const finish = ev => {
      if (ev && ev.pointerId !== e.pointerId) return;
      clearTimeout(timer); cancelAnimationFrame(frame);
      list.removeEventListener('pointermove', move);
      list.removeEventListener('pointerup', finish);
      list.removeEventListener('pointercancel', cancel);
      layerDrag = null;
      row.classList.remove('sorting'); list.classList.remove('sorting');
      ghost?.remove(); insertion?.remove();
      if (active || moved) suppressClickUntil = performance.now() + 400;
      if (active && ev?.type === 'pointerup') {
        const bounds = list.getBoundingClientRect();
        const to = count - 1 - destination;
        if (from !== to && lastX >= bounds.left && lastX <= bounds.right && lastY >= bounds.top - 20 && lastY <= bounds.bottom + 20) (objectRow?actions.reorderObject(layerIndex,from,to):actions.reorder(from,to));
      }
    };
    const cancel = ev => finish(ev);
    layerDrag = () => finish();
    row.setPointerCapture(e.pointerId);
    list.addEventListener('pointermove', move);
    list.addEventListener('pointerup', finish);
    list.addEventListener('pointercancel', cancel);
  });
  const addBtn = make('button', { className: 'icon', title: 'Nueva capa', innerHTML: ICONS.plus });
  const sidebar = make('div', { id: 'layer-panel' }, [
    make('div', { className: 'layer-header' }, [make('b', { textContent: 'Capas' }), addBtn]),
    list,
  ]);
  // Modal: the backdrop covers the map and every other overlay; tapping it closes.
  const backdrop = make('div', { id: 'layer-backdrop' });
  backdrop.addEventListener('click', () => setOpen(false));
  const onKey=(e) => {
    if (e.key === 'Escape' && isOpen) setOpen(false);
  };
  window.addEventListener('keydown',onKey);
  parent.append(entry, backdrop, sidebar);

  // Gear menu: a bottom action sheet with Ajustes / Duplicar / Eliminar.
  const sheet = make('dialog', { id: 'layer-actions' });
  sheet.setAttribute('aria-label', 'Acciones de capa');
  sheet.addEventListener('keydown', (e) => e.stopPropagation());
  sheet.addEventListener('click', (e) => {
    const r = sheet.getBoundingClientRect();
    if (e.target === sheet && (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom)) sheet.close();
  });
  parent.append(sheet);

  function openActions(layer) {
    const action = (label, run, className = '') => {
      const b = make('button', { type: 'button', className: `sheet-action ${className}`, textContent: label });
      b.addEventListener('click', run);
      return b;
    };
    const run = (fn) => {
      const i = map.layers.indexOf(layer);
      sheet.close();
      if (i >= 0) fn(i);
    };
    const settingsBtn = action('Ajustes', () => {
      sheet.close();
      openSettings(layer);
    });
    const copy = action('Duplicar', () => run(actions.copy));
    const remove = action('Eliminar', () => run(actions.remove), 'danger');
    remove.disabled = map.layers.length <= 1;
    const cancel = make('button', { type: 'button', className: 'sheet-cancel', textContent: 'Cancelar' });
    cancel.addEventListener('click', () => sheet.close());
    sheet.replaceChildren(make('div', { className: 'sheet-group' }, [settingsBtn, copy, remove]), cancel);
    sheet.showModal();
  }

  // Layer settings panel (from Ajustes), a centred modal with a close button:
  // the name and the height offset (px).
  // The offset applies live so the map previews it, and all
  // changes while the sheet is open are one undo step; the name is committed
  // when the sheet closes.
  const settings = make('dialog', { id: 'layer-settings' });
  settings.setAttribute('aria-labelledby', prefix+'layer-settings-title');
  settings.addEventListener('keydown', (e) => e.stopPropagation());
  settings.addEventListener('click', (e) => {
    const r = settings.getBoundingClientRect();
    if (e.target === settings && (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom)) settings.close();
  });
  parent.append(settings);

  function openSettings(layer) {
    const indexOf = () => map.layers.indexOf(layer);
    const name = make('input', { id: 'layer-settings-name', value: layer.name, required: true, maxLength: 80 });
    const commitName = () => {
      const i = indexOf();
      if (i >= 0 && name.value.trim() && name.value.trim() !== layer.name) actions.rename(i, name.value.trim());
    };

    // Slider and number box edit the same value; positive lifts the layer.
    const range = { min: -MAX_LAYER_OFFSET, max: MAX_LAYER_OFFSET, step: 1, value: layer.offset };
    const slider = make('input', { type: 'range', className: 'offset-slider', ...range });
    slider.setAttribute('aria-label', 'Desplazamiento vertical');
    const number = make('input', { type: 'number', className: 'offset-number', ...range });
    number.setAttribute('aria-label', 'Desplazamiento vertical (px, positivo hacia arriba)');
    let merge = false;
    const setOffset = (v) => {
      v = Math.round(Number(v));
      if (!Number.isFinite(v)) return;
      const i = indexOf();
      if (i >= 0) actions.setOffset(i, v, merge);
      merge = true;
      slider.value = number.value = layer.offset;
    };
    slider.addEventListener('input', () => setOffset(slider.value));
    number.addEventListener('change', () => setOffset(number.value));
    number.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault(); // apply, don't close the sheet
        setOffset(number.value);
      }
    });

    const done = make('button', { type: 'submit', className: 'settings-done', textContent: 'Listo' });
    const close = make('button', { type: 'button', className: 'icon settings-close', title: 'Cerrar', innerHTML: ICONS.close });
    close.addEventListener('click', () => settings.close());

    const form = make('form', { method: 'dialog' }, [
      make('div', { className: 'settings-header' }, [make('h3', { id: 'layer-settings-title', textContent: 'Ajustes de capa' }), close]),
      make('label', { className: 'settings-field', htmlFor: prefix+'layer-settings-name' }, [make('span', { textContent: 'Nombre' }), name]),
      make('div', { className: 'settings-field' }, [
        make('span', { textContent: 'Desplazamiento vertical' }),
        slider,
        make('label', { className: 'offset-box' }, [number, make('small', { textContent: 'px' })]),
      ]),
      make('p', { className: 'settings-hint', textContent: 'Los valores positivos suben y los negativos bajan' }),
      done,
    ]);
    if(!actions.setOffset){form.querySelector('.offset-slider').closest('.settings-field').remove();form.querySelector('.settings-hint').remove();}
    name.addEventListener('input', () => {
      done.disabled = !name.value.trim();
    });
    // Enter, 完成, Esc and tapping outside all close; a valid new name sticks.
    settings.addEventListener('close', commitName, { once: true });
    settings.replaceChildren(form);
    settings.showModal();
    name.blur();
  }

  entry.addEventListener('click', () => actions.isFileOpen?.() === false ? actions.openFile() : setOpen(!isOpen));
  addBtn.addEventListener('click', () => actions.add());

  let rows = []; // [{ layer, row, eye, thumb, del }]
  let thumbFrame = 0;

  // Open / closed is a body class so CSS can animate the slide and fade.
  let isOpen = false;
  function setOpen(open) {
    if (!open) layerDrag?.();
    isOpen = open;
    sidebar.inert = !open; // closed sidebar stays in the DOM for the slide-out; keep it out of focus / a11y
    parent.classList.toggle(prefix?'ui-layers-open':'layers-open', open);
    // Rows are kept current while closed; only thumbnails may be stale (edits
    // made while closed), and repainting those doesn't touch layout.
    if (open) refresh();
  }

  // Rebuild the rows (top layer first, like most editors). Called on layer
  // changes even while closed, so opening never has to build DOM.
  function refresh() {
    layerDrag?.();
    entryName.textContent = actions.isFileOpen?.() === false ? 'Abrir archivo' : map.activeLayer.name;
    entry.title = actions.isFileOpen?.() === false ? 'Abrir archivo' : '图层';
    list.replaceChildren();
    rows = [];
    for (let i = map.layers.length - 1; i >= 0; i--) {
      const layer = map.layers[i];
      const objects=actions.objects?.(layer,i)??[];
      const expand=make('button',{type:'button',className:'icon layer-expand',title:expandedLayers.has(layer.id)?'Contraer objetos':'Expandir objetos',textContent:expandedLayers.has(layer.id)?'▾':'▸'});
      expand.setAttribute('aria-label',`${layer.name}：Expandir o contraer objetos（${objects.length}）`);expand.setAttribute('aria-expanded',String(expandedLayers.has(layer.id)));
      expand.addEventListener('click',e=>{e.stopPropagation();if(expandedLayers.has(layer.id))expandedLayers.delete(layer.id);else expandedLayers.add(layer.id);refresh();});
      const eye = make('button', { className: 'icon eye', title: 'Mostrar / ocultar' });
      const thumb = make('canvas', { className: 'thumb', width: map.width, height: map.height });
      const settings = make('button', { className: 'icon', title: `${layer.name}：Ajustes de capa`, innerHTML: ICONS.gear });
      const row = make('div', { className: 'layer-row' }, [
        expand,eye,
        thumb,
        make('span', { textContent: layer.name }),
        settings,
      ]);
      row.dataset.layerIndex=i;
      row.classList.toggle('active', i === map.active);
      row.classList.toggle('hidden-layer', !layer.visible);
      eye.innerHTML = layer.visible ? ICONS.eye : ICONS.eyeOff;
      row.addEventListener('click', () => actions.select(i));
      eye.addEventListener('click', (e) => {
        e.stopPropagation();
        actions.toggleVisible(i);
      });
      settings.addEventListener('click', (e) => {
        e.stopPropagation();
        openActions(layer);
      });
      list.append(row);
      if(expandedLayers.has(layer.id)){
        if(!objects.length)list.append(make('div',{className:'layer-object-empty',textContent:'No hay objetos'}));
        for(let j=objects.length-1;j>=0;j--){
          const item=objects[j],child=make('div',{className:'layer-object-row',tabIndex:0,title:'Selecciona un objeto; mantén pulsado y arrastra para ordenar'});
          const thumbnail=make('canvas',{className:'layer-object-thumb',width:48,height:48});item.drawThumbnail?.(thumbnail);child.append(thumbnail,make('span',{textContent:item.name}));
          child.dataset.layerIndex=i;child.dataset.objectIndex=j;child.setAttribute('role','button');
          child.classList.toggle('active',!!item.selected);
          const select=()=>{actions.selectObject?.(i,j);};
          child.addEventListener('click',select);child.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();select();}});
          list.append(child);
        }
      }
      rows.push({ layer, thumb });
    }
    drawThumbs();
  }

  // Layer thumbnails should be supplied by the renderer as actual map imagery.
  function drawThumbs() {
    thumbFrame = 0;
    for (const { layer, thumb } of rows) if (drawThumbnail) drawThumbnail(layer, thumb);
  }

  sidebar.inert = true;
  refresh();
  return {
    refresh,
    destroy(){layerDrag?.();cancelAnimationFrame(thumbFrame);window.removeEventListener('keydown',onKey);sheet.close();settings.close();for(const n of [entry,backdrop,sidebar,sheet,settings])n.remove();parent.classList.remove('ui-layers-open');},
    close: () => setOpen(false),
    // Cheap enough to call after every edit; coalesced to one redraw per frame.
    refreshThumbs() {
      if (isOpen && !thumbFrame) thumbFrame = requestAnimationFrame(()=>{thumbFrame=0;refresh();});
    },
  };
}


function el(tag, props = {}, children = []) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'style') e.style.cssText = v;
    else e[k] = v;
  }
  e.append(...children);
  return e;
}

function wangIcon(sheet, f) {
  const canvas=document.createElement('canvas'); canvas.width=canvas.height=96;
  const ctx=canvas.getContext('2d'); ctx.imageSmoothingEnabled=false;
  ctx.drawImage(sheet,f.x,f.y,f.w,f.h,8,8,80,80); return canvas;
}
