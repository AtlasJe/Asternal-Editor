// Disk-only compression; editor and matching code use named labels and tile objects.
const codes='0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-_';
const SOURCE_COLUMNS=18;
export const compactWangId=id=>{const m=/^source-(\d+)$/.exec(id);if(!m)return id;const n=Number(m[1]);return `${n%SOURCE_COLUMNS}_${Math.floor(n/SOURCE_COLUMNS)}`;};
export const expandWangId=id=>{if(typeof id!=='string')return id;const m=/^(\d+)_(\d+)$/.exec(id);return m?`source-${String(Number(m[2])*SOURCE_COLUMNS+Number(m[1])).padStart(4,'0')}`:id;};
export function expandWang(source){
  const w=structuredClone(source);
  if(Array.isArray(w.labelColors)){
    if(w.labelColors.length!==w.labels.length)throw Error('Wang 标签颜色数量不正确');
    w.labelColors=Object.fromEntries(w.labels.map((label,i)=>[label,w.labelColors[i]]));
  }
  w.tiles=w.tiles.map((row,i)=>{
    let tile;
    if(row===null)tile={id:`gap-${i}`,annotations:Array(9).fill(null)};
    else if(Array.isArray(row)){
      if(row.length<2||row.length>3||!['string','number'].includes(typeof row[0])||typeof row[1]!=='string'||row[1].length!==9)throw Error('Wang 地块数据不正确');
      const annotations=Array.from(row[1],ch=>{
        if(ch==='.')return null;
        const index=codes.indexOf(ch);if(index<0||index>=w.labels.length)throw Error('Wang 标注字符不正确');
        return w.labels[index];
      });
      tile={id:typeof row[0]==='number'?`source-${String(row[0]).padStart(4,'0')}`:expandWangId(row[0]),annotations,...(row.length===3?{weight:row[2]}:{})};
    }else tile=row;
    if(!tile||typeof tile!=='object')throw Error('Wang 地块数据不正确');
    if(!tile.edges&&Array.isArray(tile.annotations))tile.edges=[1,5,7,3].map(p=>tile.annotations[p]??w.boundary);
    return tile;
  });
  return w;
}
export function compactWang(source){
  const w=structuredClone(source);
  if(w.labels.length>codes.length)throw Error('Wang 标签最多 64 个');
  if(w.labelColors&&w.labels.every(label=>Object.hasOwn(w.labelColors,label)))w.labelColors=w.labels.map(label=>w.labelColors[label]);
  w.tiles=w.tiles.map((tile,i)=>{
    if(tile.weight===1)delete tile.weight;
    if(tile.placeable===true)delete tile.placeable;
    const a=tile.annotations;
    if(Array.isArray(a)&&a.length===9){
      if(a.every(v=>v===null))delete tile.placeable;
      const edges=[1,5,7,3].map(p=>a[p]??w.boundary);
      if(JSON.stringify(tile.edges)===JSON.stringify(edges))delete tile.edges;
      if(Object.keys(tile).every(k=>['id','annotations','weight'].includes(k))){
        if(tile.id===`gap-${i}`&&a.every(v=>v===null)&&tile.weight===undefined)return null;
        const code=a.map(label=>{
          if(label===null)return '.';
          const index=w.labels.indexOf(label);if(index<0)throw Error('Wang 标注标签不存在');
          return codes[index];
        }).join('');
        const compactId=compactWangId(tile.id);
        return tile.weight===undefined?[compactId,code]:[compactId,code,tile.weight];
      }
    }
    return tile;
  });
  return w;
}
