import {wangTilePlaceable} from './pack-meta.js';
import { sheetFrames } from './grid.js';
import { wangNeighborhood, wangCenterScore } from './wang.js';
import { terrainMask } from './terrain-strategies.js';

export function createWangProps({config, map, tools, selection, history, sheets, changed}) {
  const box = document.createElement('section');
  box.id = 'wang-props';
  box.hidden = true;
  const frames = sheetFrames(config);
  document.body.append(box);
  const row = (label, control) => {
    const el = document.createElement('label'); el.className = 'wang-row';
    const text = document.createElement('span'); text.textContent = label;
    el.append(text, control); box.append(el);
  };
  function refresh() {
    if (tools.active || tools.selectionMove) { box.hidden=true; return; }
    const cells = [...selection.cells()];
    const grid=map.activeLayer.grid;
    const cell=cells.length === 1 && !tools.selectedObject ? cells[0] : null;
    const i=cell ? cell[1]*grid.width+cell[0] : null;
    const terrain=map.terrains?.[cell ? grid.cells[i] : tools.terrain];
    const def=terrain?.wang;
    box.hidden = !cell || !terrain || !!tools.selectedObject;
    if (box.hidden) return;
    box.classList.toggle('selected',!!cell);
    box.replaceChildren();
    box.scrollTop=0;
    const terrainIndex=map.terrains.indexOf(terrain);
    const name=document.createElement('span');name.textContent=terrain.label ?? terrain.name;
    if (!def) {
      const canvas=document.createElement('canvas');canvas.width=canvas.height=64;canvas.className='wang-preview';
      const ctx=canvas.getContext('2d');ctx.imageSmoothingEnabled=false;
      const f=frames[terrainIndex][terrainMask(terrain,grid,...cell,terrainIndex)];
      if(f){const scale=Math.min(64/f.w,64/f.h);ctx.drawImage(sheets[terrainIndex],f.x,f.y,f.w,f.h,(64-f.w*scale)/2,(64-f.h*scale)/2,f.w*scale,f.h*scale);}
      box.prepend(canvas);row('Terreno',name);
      return;
    }
    const state=grid.wang[i];
    row('Terreno',name);
    const patch = (next) => {
      if (!cell) { tools.wangBrush={...state,...next}; refresh(); return; }
      const dirty=new Map();
      history.begin(map.activeLayer);
      history.set(...cell,grid.cells[i],dirty,0,{...state,...next});
      history.commit(); changed(dirty); refresh();
    };
    const tileIndex=def.tiles.findIndex(t=>t.id===state?.tile);
    if (tileIndex >= 0) {
      const canvas=document.createElement('canvas'); canvas.width=canvas.height=64; canvas.className='wang-preview';
      const ctx=canvas.getContext('2d'); ctx.imageSmoothingEnabled=false;
      const T=map.tileSize, terrainIndex=map.terrains.indexOf(terrain);
      ctx.drawImage(sheets[terrainIndex],tileIndex%def.columns*T,Math.floor(tileIndex/def.columns)*T,T,T,0,0,64,64);
      box.prepend(canvas);
    }
    if (!state) return;
    if (state.center !== undefined) {
      const center = document.createElement('span');
      center.textContent = state.center;
      row('Terreno central', center);
    }
    const neighborhood = state.center !== undefined ? wangNeighborhood(grid,i,def) : null;
    const candidates = def.tiles.map((tile,index)=>({tile,index})).filter(({tile}) =>
      wangTilePlaceable(tile) && (neighborhood
        ? wangCenterScore(tile,neighborhood) === 0
        : tile.edges.every((edge,d)=>edge === state.edges[d])));
    const label = document.createElement('span');label.textContent='Tiles disponibles';box.append(label);
    const variants = document.createElement('div');variants.className='wang-variants';
    variants.setAttribute('role','group');variants.setAttribute('aria-label','Tiles compatibles');
    for (const {tile,index} of candidates) {
      const button = document.createElement('button');button.type='button';
      button.className='wang-variant';button.title=tile.label ?? tile.id;
      button.setAttribute('aria-label',tile.label ?? tile.id);
      button.setAttribute('aria-pressed',String(tile.id === state.tile));
      button.classList.toggle('active',tile.id === state.tile);
      button.disabled=!!state.locked;
      const canvas=document.createElement('canvas');canvas.width=canvas.height=96;
      const ctx=canvas.getContext('2d');ctx.imageSmoothingEnabled=false;
      const T=map.tileSize;
      ctx.drawImage(sheets[terrainIndex],index%def.columns*T,Math.floor(index/def.columns)*T,T,T,0,0,96,96);
      button.append(canvas);
      button.addEventListener('click',()=>{
        if(tile.id !== state.tile)patch({tile:tile.id,edges:[...tile.edges]});
      });
      variants.append(button);
    }
    box.append(variants);
    if (!candidates.length) {
      const hint=document.createElement('small');hint.textContent='No hay tiles compatibles con las esquinas de esta posición';box.append(hint);
    }

  }
  return {el:box,refresh};
}
