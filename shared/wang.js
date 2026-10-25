import {wangTilePlaceable} from './pack-meta.js';
// Manual construction atlases choose an exact tile; automatic terrains choose
// a material and let the neighbourhood rules resolve its shape.
export function wangBrushForTile(terrain, tile) {
  if (!tile || !wangTilePlaceable(tile)) return null;
  if (terrain.placement === 'tile') return {tile: tile.id};
  const center = tile.annotations?.[4];
  return center == null ? null : {center};
}
// Keep atlas positions (including empty slots) when building a repeating stamp.
export function wangPatternForRect(terrain, start, end) {
  const def=terrain.wang, left=Math.min(start%def.columns,end%def.columns), top=Math.min(Math.floor(start/def.columns),Math.floor(end/def.columns));
  const width=Math.abs(start%def.columns-end%def.columns)+1, height=Math.abs(Math.floor(start/def.columns)-Math.floor(end/def.columns))+1;
  const tiles=Array.from({length:width*height},(_,i)=>{
    const tile=def.tiles[(top+Math.floor(i/width))*def.columns+left+i%width];
    return tile&&wangTilePlaceable(tile)?tile.id:null;
  });
  return {terrain:terrain.name,width,height,tiles};
}
export function wangPatternTile(pattern,x,y,ax,ay) {
  const mod=(n,d)=>(n%d+d)%d;
  return pattern.tiles[mod(y-ay,pattern.height)*pattern.width+mod(x-ax,pattern.width)];
}
// Four-edge Wang labels are categorical strings, ordered north/east/south/west.
export const WANG_DIRS = [[0,-1],[1,0],[0,1],[-1,0]];
export function validateWang(t) {
  if (t.connect !== 'wang') return;
  const w = t.wang;
  const fail = () => { throw new Error(`${t.name}: Wang 定义无效`); };
  if (!w || !Array.isArray(w.labels) || !w.labels.length || w.labels.some(x => typeof x !== 'string' || !x) || new Set(w.labels).size !== w.labels.length ||
      !w.labels.includes(w.boundary) || !Number.isInteger(w.columns) || w.columns < 1 || !Array.isArray(w.tiles) || !w.tiles.length || (t.height ?? 0) !== 0) fail();
  if(w.labelColors !== undefined && (!w.labelColors || typeof w.labelColors !== 'object' ||
    Object.keys(w.labelColors).length!==w.labels.length || w.labels.some(name=>!/^#[0-9a-f]{6}$/i.test(w.labelColors[name]))))fail();
  const ids = new Set();
  for (const tile of w.tiles) {
    if (!tile || typeof tile.id !== 'string' || !tile.id || ids.has(tile.id) || !Array.isArray(tile.edges) || tile.edges.length !== 4 ||
        tile.edges.some(e => !w.labels.includes(e)) || !Number.isFinite(tile.weight ?? 1) || (tile.weight ?? 1) <= 0) fail();
    if(tile.annotations !== undefined && (!Array.isArray(tile.annotations) || tile.annotations.length!==9 ||
       tile.annotations.some(e=>e!==null&&!w.labels.includes(e)) || [1,5,7,3].some((p,d)=>(tile.annotations[p]??w.boundary)!==tile.edges[d]))) fail();
    ids.add(tile.id);
  }
}
export function wangMatch(def, edges, previous = null, seed = 0) {
  const candidates = def.tiles.filter(t => wangTilePlaceable(t) && t.edges.every((e,d) => e === edges[d]));
  if (candidates.some(t => t.id === previous)) return previous;
  // Stable weighted choice; stored by ID, independent of atlas ordering.
  let hash = 2166136261;
  for (const c of `${seed}:${edges.join('|')}`) hash = Math.imul(hash ^ c.charCodeAt(0), 16777619);
  let r = (hash >>> 0) / 4294967296 * candidates.reduce((s,t) => s + (t.weight ?? 1), 0);
  for (const t of candidates) { r -= t.weight ?? 1; if (r < 0) return t.id; }
  return null;
}
// Center-painted cells choose art from their eight neighboring material centers.
export function wangNeighborhood(grid,i,def){
  const x=i%grid.width,y=Math.floor(i/grid.width),center=grid.wang[i]?.center;
  return Array.from({length:9},(_,p)=>{
    if(p===4)return center;
    const nx=x+p%3-1,ny=y+Math.floor(p/3)-1;
    if(!grid.inBounds(nx,ny))return null; // outside the map is unconstrained
    const j=ny*grid.width+nx;
    if(center===def.boundary&&!def.boundaryTransitions)return center;
    const neighbor=grid.cells[j]===grid.cells[i]?(grid.wang[j]?.center??def.boundary):def.boundary;
    if(neighbor===center||neighbor===def.boundary)return neighbor;
    const supports=(material,position,label)=>def.tiles.some(t=>wangTilePlaceable(t)&&t.annotations?.[4]===material&&t.annotations[position]===label);
    // Different materials can meet through a shared ground border already in the art.
    // Prefer a declared direct transition; otherwise require both sides to supply ground.
    if(!supports(center,p,neighbor)&&supports(center,p,def.boundary)&&supports(neighbor,8-p,def.boundary))return def.boundary;
    return neighbor;
  });
}
export function wangCenterScore(tile,cells){
  const a=tile.annotations;
  if(!wangTilePlaceable(tile)||!a||a[4]!==cells[4])return Infinity;
  let score=0;
  for(const p of [1,5,7,3])if(cells[p]!==null&&a[p]!==null&&a[p]!==cells[p])score+=8;
  for(const [p,h,v] of [[0,3,1],[2,5,1],[6,3,7],[8,5,7]]){
    if(cells[p]===null||a[p]===null)continue;
    // Diagonal occupancy matters only when both adjacent sides continue the center.
    if(cells[h]===cells[4]&&cells[v]===cells[4]&&a[p]!==cells[p])score++;
  }
  return score;
}
export function resolveWangCenter(grid,i,def){
  const state=grid.wang[i];if(!state?.center||state.locked)return state;
  const cells=wangNeighborhood(grid,i,def);let best=null,score=Infinity;
  for(const tile of def.tiles){const next=wangCenterScore(tile,cells);
    if(next<score||(next===score&&next<Infinity&&tile.id===state.tile)){best=tile;score=next;}
  }
  if (best && best.id !== state.tile) {
    // Randomize art only within an identical nine-cell annotation pattern.
    // Keep an already valid tile so neighbor edits and reloads never flicker.
    const variants = def.tiles.filter(t => wangTilePlaceable(t) && t.annotations?.every((v,p) => v === best.annotations[p]));
    let hash = 2166136261;
    const x = i % grid.width, y = Math.floor(i / grid.width);
    for (const c of `${x},${y}:${best.annotations.join('|')}`) hash = Math.imul(hash ^ c.charCodeAt(0), 16777619);
    let random = (hash >>> 0) / 4294967296 * variants.reduce((sum,t) => sum + (t.weight ?? 1), 0);
    for (const tile of variants) {
      random -= tile.weight ?? 1;
      if (random < 0) { best = tile; break; }
    }
  }
  return {...state,tile:best?.id??null,edges:best?[...best.edges]:Array(4).fill(state.center)};
}
export function reconcileWangCenters(history,x,y,dirty){
  const grid=history.current.layer.grid;
  for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
    const nx=x+dx,ny=y+dy;if(!grid.inBounds(nx,ny))continue;
    const i=ny*grid.width+nx,def=history.map.terrains?.[grid.cells[i]]?.wang;
    if(def&&grid.wang[i]?.center)history.set(nx,ny,grid.cells[i],dirty,grid.links[i],resolveWangCenter(grid,i,def),true);
  }
}
export function wangFrame(terrain, grid, x, y) {
  return terrain.wang.tiles.findIndex(t => t.id === grid.wang[y * grid.width + x]?.tile);
}
export function wangConflict(grid, i, terrain) {
  const state = grid.wang[i];
  if (!state) return true;
  const tile = terrain.wang.tiles.find(t => t.id === state.tile);
  if (!tile || !wangTilePlaceable(tile) || !tile.edges.every((e,d) => e === state.edges[d])) return true;
  if (terrain.placement === 'tile') return false;
  if(state.center&&wangCenterScore(tile,wangNeighborhood(grid,i,terrain.wang))>0)return true;
  const x = i % grid.width, y = Math.floor(i / grid.width);
  return WANG_DIRS.some(([dx,dy], d) => {
    // Map boundaries have no neighbour to conflict with.
    if (!grid.inBounds(x+dx,y+dy)) return false;
    const j = (y+dy)*grid.width+x+dx;
    if(state.center)return false; // neighborhood annotations, including corners, determine compatibility
    return grid.cells[j] === grid.cells[i] ? grid.wang[j]?.edges[(d+2)%4] !== state.edges[d] : state.edges[d] !== terrain.wang.boundary;
  });
}
// Local reconciliation: only the painted cell and its four unlocked neighbours.
export function paintWang(history, x, y, value, dirty, brush = {}) {
  if (!history.writable(x,y)) return;
  const map = history.map, grid = history.current.layer.grid, i = y*grid.width+x;
  if (grid.wang[i]?.locked) return;
  const def = map.terrains?.[value]?.wang;
  if(def&&brush.center!==undefined){
    if(!def.labels.includes(brush.center))return;
    const previous=grid.cells[i]===value?grid.wang[i]:null;
    history.set(x,y,value,dirty,0,{center:brush.center,edges:Array(4).fill(brush.center),tile:previous?.center===brush.center?previous.tile:null,locked:false});
    return;
  }
  const specific = def?.tiles.find(t => wangTilePlaceable(t) && t.id === brush.tile);
  const edges = specific ? [...specific.edges] : Array(4).fill(def?.boundary);
  if (def && !specific) WANG_DIRS.forEach(([dx,dy],d) => {
    const j = (y+dy)*grid.width+x+dx;
    if (grid.inBounds(x+dx,y+dy) && grid.cells[j] === value)
      edges[d] = grid.wang[j]?.locked ? grid.wang[j].edges[(d+2)%4] : (brush.edges?.[d] ?? def.labels[1] ?? def.boundary);
  });
  history.set(x,y,value,dirty,0,def ? {edges, tile:specific?.id ?? wangMatch(def,edges,grid.cells[i] === value ? grid.wang[i]?.tile : null,i), locked:!!brush.locked} : null);
  if (brush.exact) return;
  if (map.terrains[value]?.placement === 'tile') return;
  WANG_DIRS.forEach(([dx,dy],d) => {
    const nx=x+dx, ny=y+dy, j=ny*grid.width+nx;
    if (!grid.inBounds(nx,ny) || !history.writable(nx,ny)) return;
    const other=grid.wang[j], nd=map.terrains?.[grid.cells[j]]?.wang;
    if (!other || !nd || other.locked || other.center || map.terrains[grid.cells[j]]?.placement === 'tile') return;
    const ne=[...other.edges];
    ne[(d+2)%4] = grid.cells[j] === value ? edges[d] : nd.boundary;
    history.set(nx,ny,grid.cells[j],dirty,0,{...other,edges:ne,tile:wangMatch(nd,ne,other.tile,j)});
  });
}
