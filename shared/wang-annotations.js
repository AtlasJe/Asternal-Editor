export const DEFAULT_LABEL_COLORS = ['#efb84a','#5fbc78','#56a4ef','#e780ad','#ad8ce8','#f08a51'];
// Row-major 3×3 annotation cells: NW,N,NE,W,center,E,SW,S,SE.
export const EDGE_CELLS = [1,5,7,3];
export const CELL_NAMES = ['左上角','上边','右上角','左边','中心','右边','左下角','下边','右下角'];
export function annotationCells(tile) {
  if(tile.annotations) return [...tile.annotations];
  const cells=Array(9).fill(null);
  EDGE_CELLS.forEach((p,d)=>cells[p]=tile.edges[d]);
  return cells;
}
export function annotationState(def) {
  return {colors:Object.fromEntries(def.labels.map((name,i)=>[name,def.labelColors?.[name] ?? DEFAULT_LABEL_COLORS[i%DEFAULT_LABEL_COLORS.length]])),labels:[...def.labels],boundary:def.boundary,cells:def.tiles.map(annotationCells)};
}
export function validAnnotationState(state, def) {
  return state && Array.isArray(state.labels) && state.labels.length>0 && state.labels.length<=64 &&
    state.labels.every(s=>typeof s==='string'&&s.trim()===s&&s.length>0&&s.length<=40) &&
    new Set(state.labels).size===state.labels.length && state.labels.includes(state.boundary) &&
    (state.colors===undefined || (state.colors && state.labels.every(name=>/^#[0-9a-f]{6}$/i.test(state.colors[name])))) &&
    Array.isArray(state.cells)&&state.cells.length===def.tiles.length&&state.cells.every(c=>Array.isArray(c)&&c.length===9&&c.every(v=>v===null||state.labels.includes(v)));
}
export function removeAnnotationLabel(state, label) {
  if(state.labels.length<=1||!state.labels.includes(label))return false;
  state.labels=state.labels.filter(v=>v!==label);
  if(state.colors)delete state.colors[label];
  if(state.boundary===label)state.boundary=state.labels[0];
  state.cells=state.cells.map(c=>c.map(v=>v===label?null:v));
  return true;
}
