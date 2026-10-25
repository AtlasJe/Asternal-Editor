import { createUIEditor } from './ui-editor.js';
import { createWangProps } from './wang-ui.js';
// Demo shell shared by both renderers: config, map state, camera, gestures,
// tools and the tool panel.
//
// A renderer factory receives { config, map, sheets, greySheets, objectSprites,
// greyObjectSprites, mount } and resolves to:
//   resize(w, h)      viewport size in CSS px
//   setCamera(cam)    { x, y, scale }: screen position of world origin + zoom
//   drawAll()         re-sync with map.layers (order, visibility, add / remove,
//                     active layer) and redraw every display tile
// sheets[t] is terrain t's tile sheet (see sheetFrames). While map.dimInactive
// (the default) only the active layer is drawn from `sheets` and every other
// layer uses `greySheets`; otherwise every layer is drawn in colour.
//   drawTiles(tiles)  redraw the given [dx, dy] display tiles on every layer
//   moveLayers()      layer pixel offsets changed: reposition layers, no tile redraw
//   syncObjects()     layer.objects changed (optional; tile-buffer renderers just
//                     redraw the dirty tiles, which map.markObject covers)
// objectSprites[type] is an object type's sprite (see objectDefs / objectRect); an
// object type's sprite is a strip of def.frameCount frames; an object shows
// objectFrame(def, now, obj) of it (its animation, see objectAnimations).
// Raised terrains have tall regions (top + wall, see grid.js);
// map.markDirty already includes the tiles their walls cover.

import { TileMap, terrainUsesCellPlacement, EMPTY, MASK_COUNT, SHEET_COLUMNS, loadConfig, objectDefs, objectFrame, objectRect, terrainHeights, sheetFrames } from './grid.js';
import { terrainMask } from './terrain-strategies.js';
import { offlineData } from './offline.js';
import { SCENE_PACKS } from './scenes.js';
import { carryMap, fetchProjectPacks, fitSheet, mergePacks, takeCarriedMap } from './packs.js';
import { Camera, attachGestures } from './camera.js';
import { History, ToolController } from './editor.js';
import { createOverlay } from './overlay.js';
import { Selection } from './selection.js';
import { createResizePanel } from './resize.js';
import { createMapSettings } from './map-settings.js';
import { createLayerPanel, createObjectProps, createPanel, createSelectionBar } from './ui.js';

import { readMapFile, writeMapFile } from './map-file.js';
import { connectProject } from './project-bridge.js';

const LONG_PRESS_MS = 200;

export function runDemo(createRenderer) {
  return start(createRenderer).catch((err) => {
    console.error(err);
    const box = document.createElement('div');
    box.id = 'error';
    box.textContent = `初始化失败: ${err.message}`;
    document.body.append(box);
  });
}

async function start(createRenderer) {
  const baseConfig = await loadConfig('../shared/config.json');
  const params = new URLSearchParams(location.search);
  // Use the configured scene only to preload its asset packs, never its map.
  const scene = params.get('scene') ?? baseConfig.map.scene;
  const packs = await fetchProjectPacks('../packs/');
  const config = mergePacks(baseConfig, packs);
  const projectBridge = await connectProject();
  if (projectBridge) document.body.classList.add('embedded-project');
  const carriedMap = takeCarriedMap(config);
  const startupFile = projectBridge ? null : baseConfig.map.startupFile;
  let initialMap = carriedMap || (projectBridge?.text ? readMapFile(projectBridge.text, config) : null);
  if (!initialMap && startupFile) {
    let text = offlineData()?.startupMap;
    if (text === undefined) {
      const response = await fetch('../' + startupFile, { cache: 'no-cache' });
      if (!response.ok) throw new Error(`读取初始地图失败：${response.status}`);
      text = await response.text();
    }
    initialMap = readMapFile(text, config);
  }
  const pixelScale = (initialMap?.tileSize ?? baseConfig.tileSize) / baseConfig.tileSize;
  config.tileSize *= pixelScale;
  for (const asset of [...config.terrains, ...(config.objects ?? [])]) {
    asset.scale = (asset.scale ?? 1) * pixelScale;
  }
  const sheets = await Promise.all(
    config.terrains.map(async (t) =>
      fitSheet(await loadImage(t.src ?? '../' + t.tiles), {
        scale: t.scale ?? 1,
        from: t.layout,
        to: t.connect === 'edge' ? config.edgeSheetLayout : config.sheetLayout,
      }),
    ),
  );
  checkSheets(sheets, config);
  const greySheets = sheets.map(greyscale);
  const objectSprites = await Promise.all(
    (config.objects ?? []).map(async (o) => fitSheet(await loadImage(o.src ?? '../' + o.sprite), { scale: o.scale ?? 1 })),
  );
  const greyObjectSprites = objectSprites.map(greyscale);
  const T = config.tileSize;
  const terrains = config.terrains;
  // Map-settings reloads restore the open map; fresh starts load startupFile.
  // Un proyecto nuevo comienza con un mapa vacío y editable; el proyecto ya existe.
  let fileOpen = !!initialMap || !!projectBridge;
  let fileName = sessionStorage.getItem('tilemap:carried-filename') ?? startupFile?.split('/').pop() ?? 'Mapa.tilemap';
  sessionStorage.removeItem('tilemap:carried-filename');
  function emptyMap() {
    const next = new TileMap(32, 32, terrainHeights(config.terrains), terrainUsesCellPlacement(config.terrains));
    next.terrains = config.terrains;
    next.tileSize = config.tileSize;
    next.name = 'Mapa sin título';
    next.insertLayer(next.createLayer('Capa 1'), 0);
    return next;
  }
  const map = initialMap ?? emptyMap();
  document.body.classList.toggle('no-map', !fileOpen);
  map.terrains = config.terrains;
  map.objectDefs = objectDefs(config, objectSprites); // with the real sprite sizes
  let mapW = map.width * T;
  let mapH = map.height * T;
  let resizePanel;
  let preview = false;
  let previewState;


  const mount = document.getElementById('viewport');
  const ring = document.getElementById('press-ring');
  ring.style.setProperty('--press-ms', `${LONG_PRESS_MS}ms`);

  const renderer = await createRenderer({ config, map, sheets, greySheets, objectSprites, greyObjectSprites, mount });
  const camera = new Camera();
  const history = new History(map);
  const selection = new Selection(map.width, map.height);
  const tools = new ToolController(map, history, selection);
  const overlay = createOverlay({ mount, selection, map, tileSize: T, getObject: () => tools.selectedObject });
  // Paint with what the active layer is made of (its first painted cell), so
  // each scene starts on its own tile set; else grass, as before.
  const layerTerrain = [...map.activeLayer.grid.cells].find((v) => v !== EMPTY && v < terrains.length);
  tools.terrain = layerTerrain ?? Math.min(2, terrains.length - 1);

  const redraw = (dirty) => {
    if (!dirty.size) return;
    renderer.drawTiles([...dirty.values()]);
    overlay.refresh();
    renderer.syncObjects?.();
    layerPanel.refreshThumbs();
  };
  // Animated objects (sprite strips, see objectDefs): when the frame an object
  // shows changes on the shared clock, redraw the tiles it covers.
  const shownFrame = new WeakMap(); // object -> frame last drawn
  const animate = (now) => {
    const dirty = new Map();
    for (const layer of map.layers) {
      if (!layer.visible) continue;
      for (const o of layer.objects) {
        const def = map.objectDefs[o.type];
        if (!def?.animated) continue;
        const f = objectFrame(def, now, o);
        if (shownFrame.get(o) === f) continue;
        shownFrame.set(o, f);
        map.markObject(dirty, o);
      }
    }
    if (dirty.size) {
      renderer.drawTiles([...dirty.values()]);
    overlay.refresh();
      renderer.syncObjects?.();
    }
    requestAnimationFrame(animate);
  };
  requestAnimationFrame(animate);

  const relayer = () => {
    mapW = map.width * T;
    mapH = map.height * T;
    if (selection.width !== map.width || selection.height !== map.height) {
      selection.width = map.width;
      selection.height = map.height;
      selection.mask = new Uint8Array(map.width * map.height);
      selection.clear();
    }
    renderer.drawAll();
    overlay.refresh();
    layerPanel.refresh();
    updateCamera();
  };
  const updateCamera = () => {
    camera.clamp(mount.clientWidth, mount.clientHeight, mapW, mapH);
    renderer.setCamera(camera);
    overlay.setCamera(camera);
    placeSelectionBar();
    resizePanel?.update();
  };
  // Screen point -> [cell, point in fractional cell units] for the tool controller.
  // Hits land on the active layer where it is drawn, i.e. shifted by its offset.
  const toCell = ([sx, sy]) => {
    const [wx, y] = camera.toWorld(sx, sy);
    const wy = y + map.activeLayer.offset;
    return [
      [Math.floor(wx / T), Math.floor(wy / T)],
      [wx / T, wy / T],
    ];
  };

  // Initial view: fit the map into the area the panel, tool bar and undo bar leave free.
  function fitView() {
    if (!fileOpen) return;
    // Restore dock geometry synchronously before measuring the toolbars.
    panel.syncDock();
    const vw = mount.clientWidth;
    const vh = mount.clientHeight;
    const p = panel.el.getBoundingClientRect();
    const bars = [panel.toolBar, panel.sizeBar]
      .filter((b) => !b.hidden)
      .map((b) => b.getBoundingClientRect())
      .filter((b) => b.width > 0 && b.height > 0);
    // The panel is docked at the bottom; the tool bars stand at the right edge
    // (landscape, taller than wide) or in rows above the panel (portrait).
    const top = Math.max(56, ...['history-bar', 'file-bar', 'preview-entry', 'resize-entry']
      .map(id => document.getElementById(id)?.getBoundingClientRect().bottom ?? 0));
    const side = bars.filter((b) => b.height > b.width);
    const rows = bars.filter((b) => b.height <= b.width);
    const landscape=matchMedia('(orientation: landscape)').matches;
    const r = {
      x: 0,
      y: top,
      w: Math.max(1, Math.min(vw, landscape&&p.width>0?vw-p.width:vw, ...side.map((b) => b.left))),
      h: Math.max(1, Math.min(!landscape&&p.height>0?p.top:vh, ...rows.map((b) => b.top)) - top),
    };
    camera.fit(r, mapW, mapH);
    updateCamera();
  }

  matchMedia('(orientation: landscape)').addEventListener('change',()=>requestAnimationFrame(()=>{
    if(!document.body.classList.contains('wang-annotating'))fitView();
  }));

  const replay = (step) => {
    const d = new Map();
    const result = step(d);
    if (result === 'layers') relayer();
    else redraw(d);
  };
  const actions = {
    undo: () => (tools.selectionMove || tools.active ? cancelEdit() : replay((d) => history.undo(d)), placeSelectionBar()),
    redo: () => (tools.selectionMove || tools.active ? cancelEdit() : replay((d) => history.redo(d)), placeSelectionBar()),
  };
  function cancelEdit() {
    redraw(tools.cancel());
    placeSelectionBar();
  }
  // A scene built from a tile pack shows that pack in the panel by default.
  const defaultSource = (SCENE_PACKS[scene] ?? []).map((p) => p.split('/').filter(Boolean).pop())[0] ?? '';
  // Selected object: its properties (animation) in a panel at the bottom.
  const objectProps = createObjectProps({
    onRename: (name) => {
      redraw(tools.setSelectedObjectName(name));
      placeSelectionBar();
    },
    onPick: (name) => {
      redraw(tools.setSelectedObjectAnim(name));
      placeSelectionBar();
    },
    onPlay: (playing) => {
      redraw(tools.setSelectedObjectPlaying(playing));
      placeSelectionBar();
    },
  });
  const wangProps = createWangProps({ config, map, tools, selection, history, sheets, changed: dirty => {
    redraw(dirty); overlay.refresh();
  }});
  actions.change = () => wangProps.refresh();
  actions.annotationsSaved = (terrainIndex) => {
    const def=config.terrains[terrainIndex].wang;
    history.updateWangDefinition(terrainIndex,def);
    renderer.drawAll();overlay.refresh();layerPanel.refreshThumbs();wangProps.refresh();
  };
  const panel = createPanel({ config, sheets, objectSprites, tools, actions, defaultSource });
  document.body.append(panel.el);
  // Independent sheets and grips use the same dock dimensions.
  panel.mountProperties(objectProps.el);

  // ---- selection ----
  const selectionActions = {
    layerTargets: () => (tools.selectedObject || selection.active)
      ? map.layers.map((layer, index) => ({ index, name: layer.name, visible: layer.visible })).filter(layer => layer.index !== map.active)
      : null,
    moveToLayer: (index) => {
      tools.end();
      tools.confirmMove();
      cancelEdit();
      const object = tools.selectedObject;
      if (object && history.moveObjectToLayer(object, index)) {
        tools.selectedObject = object;
        relayer();
      } else if (!object && history.moveTilesToLayer(selection, index)) {
        relayer();
      }
    },
    // Clear the selected cells on the active layer (one undo step), or delete
    // the selected object.
    clearContents: () => {
      cancelEdit();
      if (tools.selectedObject) {
        redraw(tools.deleteSelectedObject());
        return placeSelectionBar();
      }
      if (!selection.active) return;
      const d = new Map();
      history.begin(map.activeLayer, selection);
      for (const [x, y] of selection.cells()) history.set(x, y, EMPTY, d);
      history.commit();
      redraw(d);
      selection.clear();
    },
    copy: () => {
      if (tools.selectedObject) {
        redraw(tools.copySelectedObject());
        return placeSelectionBar();
      }
      redraw(tools.copySelection());
      placeSelectionBar();
    },
    confirm: () => {
      tools.end();
      tools.confirmMove();
      tools.selectedObject = null;
      selection.clear();
      placeSelectionBar();
    },
    deselect: () => {
      cancelEdit();
      tools.selectedObject = null;
      selection.clear();
      placeSelectionBar();
    },
    selectAll: () => {
      cancelEdit();
      selection.selectAll();
    },
  };
  const selectionBar = createSelectionBar({ actions: selectionActions });

  const hasSelection = () => !!tools.selectedObject || selection.active;
  // Whether a press at screen point p lands on what is selected (so a long
  // press there drags it).
  const onSelected = (p) => {
    const [cell, point] = toCell(p);
    return tools.selectedObject ? tools.hitsSelectedObject(point) : selection.has(...cell);
  };

  // Keep the bar under the selection box (or the selected object); hidden while
  // a selection is being dragged out or an object is being moved.
  function placeSelectionBar() {
    overlay.refresh();
    wangProps.refresh();
    const obj = tools.selectedObject;
    objectProps.show(document.body.classList.contains('layers-open') ? null : (obj ? map.objectDefs[obj.type] : null), document.body.classList.contains('layers-open') ? null : obj, objectSprites[obj?.type]);
    // Something selected: hide the tool bar and the terrain / object list (and
    // long presses don't run tools, see onToolStart).
    document.body.classList.toggle('has-selection', hasSelection());
    const b = obj ? null : selection.bounds();
    if ((!b && !obj) || (tools.active && (tools.mode === 'select' || tools.selectionMove || tools.objectMove)))
      return selectionBar.place(null);
    const s = T * camera.scale;
    const top = camera.y - map.activeLayer.offset * camera.scale; // active layer's origin on screen
    let box;
    if (obj) {
      const r = objectRect(map.objectDefs[obj.type], obj, T);
      const k = camera.scale;
      box = { left: camera.x + r.left * k, top: top + r.top * k, right: camera.x + r.right * k, bottom: top + r.bottom * k };
    } else {
      box = {
        left: camera.x + b.x0 * s,
        top: top + b.y0 * s,
        right: camera.x + b.x1 * s,
        bottom: top + b.y1 * s,
      };
    }
    const obstacles = [panel.el, panel.toolBar, panel.sizeBar, objectProps.el, wangProps.el, document.getElementById('history-bar')]
      .filter((el) => !el.hidden)
      .map((el) => el.getBoundingClientRect());
    selectionBar.place(box, obstacles);
  }
  selection.onChange(placeSelectionBar);

  const focusObject=(object)=>{
    const def=map.objectDefs[object.type];
    if(!def)return;
    const scale=camera.scale||1,rect=document.getElementById('layer-panel')?.getBoundingClientRect();
    const left=rect&&rect.left<mount.clientWidth/2?rect.right:0;
    const right=rect&&rect.left>=mount.clientWidth/2?rect.left:mount.clientWidth;
    const top=Math.max(56,document.getElementById('file-bar')?.getBoundingClientRect().bottom??0);
    const bottom=mount.clientHeight;
    const cx=(left+right)/2,cy=(top+bottom)/2;
    const ox=(object.x+def.w/2)*T*scale,oy=(object.y+def.h/2)*T*scale;
    camera.x=cx-ox;camera.y=cy-oy;camera.clamp(mount.clientWidth,mount.clientHeight,mapW,mapH);updateCamera();placeSelectionBar();
  };

  const layerPanel = createLayerPanel({
    config,
    map,
    drawThumbnail:(layer,thumb)=>{
      const c=thumb.getContext('2d'),frames=sheetFrames(config),sx=thumb.width/map.width,sy=thumb.height/map.height;
      c.clearRect(0,0,thumb.width,thumb.height);c.imageSmoothingEnabled=false;
      for(let y=0;y<map.height;y++)for(let x=0;x<map.width;x++){
        const i=y*map.width+x,t=layer.grid.cells[i];if(t===EMPTY)continue;
        let f;if(config.terrains[t]?.connect==='wang'){const id=layer.grid.wang[i]?.tile;f=frames[t][config.terrains[t].wang.tiles.findIndex(v=>v.id===id)];}
        else f=frames[t][terrainMask(config.terrains[t],layer.grid,x,y,t)];if(!f)continue;
        c.drawImage(sheets[t],f.x,f.y,f.w,f.h,x*sx,y*sy,sx,sy);
      }
    },
    actions: {
      objects:layer=>layer.objects.map(o=>({name:o.name??map.objectDefs[o.type]?.label??'Objeto',selected:o===tools.selectedObject,drawThumbnail:thumb=>{const def=map.objectDefs[o.type],image=objectSprites[o.type],c=thumb.getContext('2d'),k=Math.min(48/def.sw,48/def.sh);c.imageSmoothingEnabled=false;c.drawImage(image,objectFrame(def,performance.now(),o)*def.sw,0,def.sw,def.sh,(48-def.sw*k)/2,(48-def.sh*k)/2,def.sw*k,def.sh*k);}})),
      selectObject:(i,j)=>{cancelEdit();map.active=i;tools.selectedObject=map.layers[i].objects[j];selection.clear();relayer();requestAnimationFrame(()=>focusObject(tools.selectedObject));},
      reorderObject:(i,from,to)=>{cancelEdit();const layer=map.layers[i],items=layer.objects.slice(),dirty=new Map();const [item]=items.splice(from,1);items.splice(to,0,item);history.begin(layer);history.setObjects(items,dirty);history.commit();relayer();},
      isFileOpen: () => fileOpen,
      openFile: () => mapInput.click(),
      select: (i) => {
        cancelEdit();
        map.active = i;
        relayer();
      },
      reorder: (from, to) => {
        cancelEdit();
        history.moveLayer(from, to);
        relayer();
      },
      toggleVisible: (i) => {
        map.layers[i].visible = !map.layers[i].visible;
        relayer();
      },
      add: () => {
        cancelEdit();
        history.insertLayer(map.createLayer(), map.active + 1);
        relayer();
      },
      setOffset: (i, offset, merge) => {
        cancelEdit();
        history.setLayerOffset(i, offset, { merge });
        renderer.moveLayers();
        overlay.refresh();
        placeSelectionBar();
      },
      rename: (i, name) => {
        cancelEdit();
        history.renameLayer(i, name);
        relayer();
      },
      copy: (i) => {
        cancelEdit();
        history.duplicateLayer(i);
        relayer();
      },
      remove: (i) => {
        if (map.layers.length <= 1) return;
        cancelEdit();
        history.removeLayer(i);
        relayer();
      },
    },
  });

  resizePanel = createResizePanel({
    map, camera, tileSize: T,
    onCamera: updateCamera,
    onOpen: (panelRect) => {
      cancelEdit();
      selection.clear();
      const landscape = matchMedia('(orientation: landscape)').matches;
      camera.fit({ x: 0, y: 56, w: landscape ? mount.clientWidth - panelRect.width : mount.clientWidth, h: Math.max(100, (landscape ? mount.clientHeight : panelRect.top) - 72) }, mapW, mapH);
      updateCamera();
    },
    onApply: (w, h, left, top) => {
      history.resizeMap(w, h, left, top);
      camera.x += left * T * camera.scale;
      camera.y += top * T * camera.scale;
      relayer();
    },
  });

  // ---- viewport ----
  new ResizeObserver(() => {
    renderer.resize(mount.clientWidth, mount.clientHeight);
    overlay.resize(mount.clientWidth, mount.clientHeight);
    updateCamera();
  }).observe(mount);
  renderer.resize(mount.clientWidth, mount.clientHeight);
  overlay.resize(mount.clientWidth, mount.clientHeight);
  renderer.drawAll();
  fitView();

  let ringShown = false; // whether the current press shows the long-press ring
  const gestures = attachGestures(
    mount,
    camera,
    {
      onCamera: updateCamera,
      isNavigationOnly: () => preview || !fileOpen,
      shouldStartToolImmediately: (p) => tools.canMoveSelection(toCell(p)[0]),
      shouldMoveSelection: (p) => tools.hitsSelectedObject(toCell(p)[1]) || selection.has(...toCell(p)[0]),
      onSelectionMoveStart: (p) => {
        redraw(tools.start(...toCell(p), { moveSelection: true }));
        placeSelectionBar();
      },
      onPressStart: ([x, y]) => {
        ringShown = !hasSelection() || onSelected([x, y]);
        if (!ringShown) return;
        ring.style.left = `${x}px`;
        ring.style.top = `${y}px`;
        ring.className = 'pending';
      },
      onPressEnd: (fired) => {
        ring.className = fired && ringShown ? 'fired' : '';
      },
      onToolStart: (p) => {
        // With something selected a long press runs no tool: on the selection
        // it starts dragging it, anywhere else it does nothing.
        if (hasSelection()) {
          if (onSelected(p)) redraw(tools.start(...toCell(p), { moveSelection: true }));
        } else redraw(tools.start(...toCell(p)));
        placeSelectionBar();
      },
      onToolMove: (p) => {
        redraw(tools.move(...toCell(p)));
        if (tools.objectMove) overlay.refresh();
      },
      onTap: (p) => {
        redraw(tools.tap(...toCell(p)));
        placeSelectionBar();
      },
      onToolEnd: () => {
        tools.end();
        placeSelectionBar();
        ring.className = '';
      },
      onToolCancel: () => {
        redraw(tools.cancel());
        placeSelectionBar();
        ring.className = '';
      },
    },
    { longPressMs: LONG_PRESS_MS },
  );

  const mapInput = Object.assign(document.createElement('input'), {
    type: 'file', accept: '.tilemap', hidden: true,
  });
  const fileBar = Object.assign(document.createElement('div'), { id: 'file-bar' });
  const fileIcons = {
    Abrir: '<path d="M3 7V5a2 2 0 0 1 2-2h5l2 3h7a2 2 0 0 1 2 2v2M3 7v12a2 2 0 0 0 2 2h14l3-11H7L5 21"/>',
    Nuevo: '<path d="M14 2H5v20h14V7l-5-5v5h5M8 14h8m-4-4v8"/>',
    Guardar: '<path d="M4 3h13l4 4v14H3V3h1Zm3 0v6h9V3M7 21v-8h10v8"/>',
    Cerrar: '<path d="m6 6 12 12M18 6 6 18"/>',
  };
  const fileButton = (label, action) => {
    const button = Object.assign(document.createElement('button'), {
      type: 'button', className: 'icon', title: label,
      innerHTML: `<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${fileIcons[label]}</svg>`,
    });
    button.setAttribute('aria-label', label);
    button.dataset.fileAction = { Abrir: 'open', Nuevo: 'new', Guardar: 'save', Cerrar: 'close' }[label];
    button.dataset.fileState = ['Abrir', 'Nuevo'].includes(label) ? 'closed' : 'open';
    if (button.dataset.fileState === 'closed') {
      const text = label === 'Abrir' ? 'Abrir mapa' : 'Nuevo mapa';
      button.append(Object.assign(document.createElement('span'), { textContent: text }));
      button.title = text;
      button.setAttribute('aria-label', text);
    }
    button.addEventListener('click', action);
    fileBar.append(button);
    return button;
  };
  let savedMap = fileOpen && !sessionStorage.getItem('tilemap:size-changed') ? writeMapFile(map, config) : null;
  sessionStorage.removeItem('tilemap:size-changed');
  const hasUnsavedChanges = () => fileOpen && writeMapFile(map, config) !== savedMap;
  projectBridge?.watch(() => fileOpen ? writeMapFile(map, config) : null);
  const canReplace = () => !hasUnsavedChanges() || confirm('Abrir otro mapa descartará los cambios sin guardar. ¿Continuar?');
  function installMap(next, name) {
    if (next.tileSize !== T) {
      sessionStorage.setItem('tilemap:carried-filename', name);
      carryMap(next, config);
      location.reload();
      return;
    }
    gestures.cancel();
    cancelEdit();
    resizePanel.close();
    layerPanel.close();
    tools.selectedObject = null;
    selection.clear();
    Object.assign(map, next);
    map.terrains = config.terrains;
    map.objectDefs = objectDefs(config, objectSprites);
    history.undoStack.length = history.redoStack.length = 0;
    fileOpen = true;
    fileName = name;
    savedMap = writeMapFile(map, config);
    document.body.classList.remove('no-map');
    saveButton.disabled = false;
    relayer();
    fitView();
  }
  mapInput.addEventListener('change', async () => {
    const file = mapInput.files[0];
    if (!file) return;
    try {
      if (!/\.tilemap$/i.test(file.name)) throw new Error('Selecciona un archivo de mapa .tilemap');
      const next = readMapFile(await file.text(), config);
      if (canReplace()) installMap(next, file.name);
    } catch (err) { alert(`No se pudo abrir el mapa: ${err.message}`); }
    finally { mapInput.value = ''; }
  });
  fileButton('Abrir', () => mapInput.click());
  fileButton('Nuevo', () => { if (canReplace()) installMap(emptyMap(), 'mapa.tilemap'); });
  const saveButton = fileButton('Guardar', () => {
    if (!fileOpen) return;
    tools.end();
    tools.confirmMove();
    const url = URL.createObjectURL(new Blob([writeMapFile(map, config)], { type: 'application/json' }));
    const link = Object.assign(document.createElement('a'), { href: url, download: fileName });
    link.click();
    savedMap = writeMapFile(map, config);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  const closeFileButton = fileButton('Cerrar', () => {
    if (!fileOpen) return;
    if (hasUnsavedChanges() && !confirm('Cerrar el mapa descartará los cambios sin guardar. ¿Continuar?')) return;
    gestures.cancel();
    cancelEdit();
    resizePanel.close();
    layerPanel.close();
    tools.selectedObject = null;
    selection.clear();
    Object.assign(map, emptyMap());
    map.terrains = config.terrains;
    map.objectDefs = objectDefs(config, objectSprites);
    history.undoStack.length = history.redoStack.length = 0;
    fileOpen = false;
    savedMap = null;
    fileName = 'mapa.tilemap';
    saveButton.disabled = true;
    document.body.classList.add('no-map');
    relayer();
    fileBar.querySelector('button').focus();
  });
  fileBar.insertBefore(closeFileButton, saveButton);
  if (projectBridge) {
    saveButton.title = 'Descargar mapa .tilemap';
    saveButton.setAttribute('aria-label', saveButton.title);
  }
  saveButton.disabled = !fileOpen;
  document.body.append(fileBar, mapInput);
  const uiEditor = createUIEditor(packs);
  const uiInput = Object.assign(document.createElement('input'), {type:'file',accept:'.ui',hidden:true});
  uiInput.addEventListener('change', async () => {const file=uiInput.files[0];if(file)await uiEditor.openFile(file);uiInput.value='';});
  document.body.append(uiInput);
  for (const [label, action] of [['Nueva UI',()=>uiEditor.create()],['Abrir UI',()=>uiInput.click()]]) {
    const button=Object.assign(document.createElement('button'),{type:'button',textContent:label,title:label});
    button.dataset.fileState='closed';button.addEventListener('click',action);fileBar.append(button);
  }

  createMapSettings({
    map,
    onOpen: () => {
      gestures.cancel();
      cancelEdit();
      resizePanel.close();
      layerPanel.close();
    },
    onApply: ({ name, tileSize, backgroundColor }) => {
      map.backgroundColor = backgroundColor;
      renderer.drawAll();
      if (map.name !== name) {
        map.name = name;
        fileName = `${name.replace(/[\\/:*?"<>|]/g, '_')}.tilemap`;
      }
      if (tileSize !== T) {
        map.tileSize = tileSize;
        sessionStorage.setItem('tilemap:size-changed', '1');
        sessionStorage.setItem('tilemap:carried-filename', fileName);
        carryMap(map, config);
        location.reload();
      }
    },
  });

  const previewIcon = '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M7 5.6c0-1.1 1.2-1.8 2.2-1.2l10.2 6.4c.9.6.9 1.8 0 2.4L9.2 19.6C8.2 20.2 7 19.5 7 18.4Z"/></svg>';
  const closePreviewIcon = '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="m6 6 12 12M18 6 6 18"/></svg>';
  const previewButton = Object.assign(document.createElement('button'), {
    id: 'preview-entry', type: 'button', className: 'icon', innerHTML: previewIcon,
    title: 'Vista previa',
  });
  previewButton.setAttribute('aria-label', 'Vista previa');
  function setPreview(enabled) {
    if (preview === enabled) return;
    gestures.cancel();
    if (enabled) {
      cancelEdit();
      layerPanel.close();
      resizePanel.close();
      previewState = { dim: map.dimInactive, visibility: map.layers.map(layer => layer.visible) };
      map.dimInactive = false;
      map.layers.forEach(layer => { layer.visible = true; });
      document.activeElement?.blur();
    } else {
      map.dimInactive = previewState.dim;
      map.layers.forEach((layer, i) => { layer.visible = previewState.visibility[i]; });
    }
    preview = enabled;
    ring.className = '';
    document.body.classList.toggle('preview-mode', enabled);
    previewButton.innerHTML = enabled ? closePreviewIcon : previewIcon;
    previewButton.title = enabled ? 'Cerrar vista previa' : 'Vista previa';
    previewButton.setAttribute('aria-label', enabled ? 'Cerrar vista previa' : 'Vista previa');
    renderer.drawAll();
    updateCamera();
    if (!enabled) previewButton.focus();
  }
  previewButton.addEventListener('click', () => setPreview(!preview));
  document.body.append(previewButton);

  // ---- keyboard ----
  window.addEventListener('keydown', (e) => {
    if (preview) {
      if (e.key === 'Tab' || (e.target === previewButton && ['Enter', ' '].includes(e.key))) return;
      e.preventDefault();
      return;
    }
    if (!fileOpen) return;
    const mod = e.metaKey || e.ctrlKey;
    const key = e.key.toLowerCase();
    if (mod && key === 'z') {
      e.preventDefault();
      return e.shiftKey ? actions.redo() : actions.undo();
    }
    if (mod && key === 'a') {
      e.preventDefault();
      return selectionActions.selectAll();
    }
    if (mod && key === 'd') {
      e.preventDefault();
      return selectionActions.deselect();
    }
    if (mod) return;
    if (key === 'enter' && tools.selectionMove) return selectionActions.confirm();
    if (key === 'delete' || key === 'backspace') return selectionActions.clearContents();
    if (key === 'escape' && !document.body.classList.contains('layers-open'))
      return selectionActions.deselect();
    if (hasSelection()) return; // tool / terrain keys are off while something is selected
    const n = Number(e.key);
    if (n >= 1 && n <= terrains.length) panel.setTerrain(n - 1);
    else if (key === 'b') panel.setTool('pencil');
    else if (key === 'e') panel.setTool('eraser');
    else if (key === 'u') panel.setTool('shape');
    else if (key === 'f') panel.setTool('fill');
    else if (key === 'm') panel.setTool('select');
    else if (key === '[') panel.setSize(tools.size - 1);
    else if (key === ']') panel.setSize(tools.size + 1);
  });
}

// Every sheet must be 4 x 4 regions of 1 x (height + 1) tiles, and the layout
// must place each mask exactly once.
function checkSheets(sheets, config) {
  const T = config.tileSize;
  for (const key of ['sheetLayout', 'edgeSheetLayout']) {
    const masks = config[key].flat();
    if (masks.length !== MASK_COUNT || new Set(masks).size !== MASK_COUNT || masks.some((m) => !(m >= 0 && m < MASK_COUNT)))
      throw new Error(`config.json 的 ${key} 必须是 4x4、恰好包含 0–15 各一次`);
  }
  terrainHeights(config.terrains).forEach(({ height }, t) => {
    const wang = config.terrains[t].wang;
    const w = (wang ? wang.columns : SHEET_COLUMNS) * T;
    const h = (wang ? Math.ceil(wang.tiles.length / wang.columns) : SHEET_COLUMNS * (height + 1)) * T;
    const img = sheets[t];
    if (img.width !== w || img.height !== h)
      throw new Error(
        `${config.terrains[t].pack ? `地块包「${config.terrains[t].pack.name}」的 ` : ''}${config.terrains[t].tiles} 应为 ${w}x${h}（4x4 个区域，每个 1x${height + 1} 格、${T}px 一格），实际 ${img.width}x${img.height}`,
      );
  });
}

// Desaturated, slightly flattened copy of a sheet for inactive layers.
function greyscale(img) {
  const c = document.createElement('canvas');
  c.width = img.width;
  c.height = img.height;
  const ctx = c.getContext('2d');
  ctx.drawImage(img, 0, 0);
  const data = ctx.getImageData(0, 0, c.width, c.height);
  const p = data.data;
  for (let i = 0; i < p.length; i += 4) {
    const l = 0.299 * p[i] + 0.587 * p[i + 1] + 0.114 * p[i + 2];
    p[i] = p[i + 1] = p[i + 2] = l * 0.75 + 40;
  }
  ctx.putImageData(data, 0, 0);
  return c;
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () =>
      reject(new Error(`failed to load ${src.startsWith('blob:') ? '地块包里的图片' : src}，先运行 tools/gen_tileset.py 和 tools/gen_objects.py`));
    img.src = src;
  });
}
