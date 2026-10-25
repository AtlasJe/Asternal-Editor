import {validUUID} from './pack-meta.js';
const symbols='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
export function splitTerrainRef(value){
  if(typeof value!=='string')return null;
  const m=/^([0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})(?:\.([0-9]+_[0-9]+))?$/i.exec(value);
  return m?{uuid:m[1],variant:m[2]??null}:null;
}
export function encodeCells(values,objects=[]){
  const assetMap={'.':null},characters=new Map([[null,'.']]);let next=0;
  const encode=value=>{if(!characters.has(value)){if(!splitTerrainRef(value)&&!validUUID(value))throw Error('素材引用不正确');const ch=symbols[next]??String.fromCharCode(0x100+next-symbols.length);next++;if(ch.charCodeAt(0)>=0xd800)throw Error('素材种类过多');characters.set(value,ch);assetMap[ch]=value;}return characters.get(value);};
  return {assetMap,cells:values.map(encode).join(''),objects:objects.map(o=>({...o,id:encode(o.id)}))};
}
export function decodeCells(layer,count){
  const {cells,assetMap}=layer,fail=()=>{throw Error('地图格子字符或映射表不正确');};
  if(typeof cells!=='string'||cells.length!==count||!assetMap||typeof assetMap!=='object'||Array.isArray(assetMap)||assetMap['.']!==null)fail();
  const seen=new Set();for(const [ch,value] of Object.entries(assetMap)){if(ch.length!==1||/[\ud800-\udfff]/.test(ch)||(ch!=='.'&&!((splitTerrainRef(value)||validUUID(value))&&!seen.has(value))))fail();if(ch!=='.')seen.add(value);}
  return Array.from(cells,ch=>{if(!Object.hasOwn(assetMap,ch))fail();return assetMap[ch];});
}
