import {compactWang,expandWang} from './wang-meta.js';
// Resource names and categories follow their adjacent file and folder.
export function wangTilePlaceable(tile){return tile?.placeable!==false && !(Array.isArray(tile?.annotations)&&tile.annotations.every(v=>v===null));}
export const validUUID=value=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value);
export const assetKinds={terrain:['terrains','tiles'],object:['objects','sprite'],ui:['ui','file'],font:['fonts','file'],sound:['sounds','file']};
export function validAssetPath(path){return typeof path==='string'&&path.length>0&&!path.startsWith('/')&&!/[\\?#:]/.test(path)&&!path.split('/').some(p=>!p||p==='.'||p==='..');}
export function assetKind(path){return Object.keys(assetKinds).find(k=>assetKinds[k][0]===path.split('/')[0]);}
export function decodeAsset(header,path,document){
  if(!validAssetPath(path)||!path.endsWith('.meta')||!document||Array.isArray(document)||typeof document!=='object')throw Error(`素材元数据不正确：${path}`);
  const kind=assetKind(path),spec=assetKinds[kind];if(!spec)throw Error(`未知素材目录：${path}`);
  const file=path.slice(0,-5),name=file.split('/').pop().replace(/\.[^.]+$/,'');
  let entry;
  if(header.version===1){
    if(document.format!=='tilemap-asset'||document.version!==1||document.pack!==header.id||document.kind!==kind)throw Error(`素材元数据不正确：${path}`);
    entry=structuredClone(document.data);
    if(!entry||entry[spec[1]]!==file)throw Error(`素材路径不匹配：${path}`);
  }else{
    entry={...structuredClone(document),name:document.name??name,[spec[1]]:file};
    if(kind==='object'){entry.footprint??=[1,1];entry.group=Object.entries(header.groups??{}).find(([,files])=>files.includes(file))?.[0]??entry.group??'场景';}
    if(kind==='font')entry.atlas??=file.replace(/\.[^.]+$/,'.png');
    if(entry.wang){
      delete entry.id;
      entry.wang=expandWang(entry.wang);
    }
  }
  if(!validUUID(entry.uuid))throw Error(`素材 UUID 不正确：${path}`);
  if(typeof entry.name!=='string'||!entry.name||(kind==='font'&&!validAssetPath(entry.atlas)))throw Error(`素材定义不正确：${path}`);
  return {...entry,metaPath:path};
}
export function encodeAsset(header,path,entry){
  const kind=assetKind(path),key=assetKinds[kind][1],file=path.slice(0,-5),name=file.split('/').pop().replace(/\.[^.]+$/,'');
  const data=structuredClone(entry);delete data.metaPath;delete data[key];
  if(data.name===name)delete data.name;
  if(data.label===(entry.name??name))delete data.label;
  delete data.placeable;
  if(data.frameCount===1)delete data.frameCount;
  if(kind==='object'){
    if(JSON.stringify(data.footprint)==='[1,1]')delete data.footprint;
    delete data.group;
  }
  delete data.colors;
  if(kind==='ui')for(const k of ['sourceRect','size','variant','kind'])delete data[k];
  if(kind==='font'){
    for(const k of ['sourceRect','format','characters'])delete data[k];
    if(data.atlas===file.replace(/\.[^.]+$/,'.png'))delete data.atlas;
  }
  if(data.wang){
    delete data.id;
    data.wang=compactWang(data.wang);
  }
  return data;
}
export function assemblePack(header,documents){
  if(![1,2].includes(header?.version)||!Array.isArray(header.assets))throw Error('pack.meta 格式不正确');
  const {assets,...common}=header,m={...common,format:'tilemap-pack',version:1,metaVersion:header.version,terrains:[],objects:[],ui:{elements:[]},fonts:[],sounds:[]},seen=new Set(),uuids=new Set();
  for(const path of assets){
    const entry=decodeAsset(header,path,documents[path]),kind=assetKind(path),group=assetKinds[kind][0],id=kind+'/'+entry.name;
    if(seen.has(id))throw Error(`素材名称重复：${path}`);
    if(uuids.has(entry.uuid))throw Error(`素材 UUID 重复：${path}`);uuids.add(entry.uuid);
    seen.add(id);(kind==='ui'?m.ui.elements:m[group]).push(entry);
  }
  return m;
}
