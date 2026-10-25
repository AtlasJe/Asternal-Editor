import {validSlice} from './ui-nine-slice.js';
// UI documents store children inside layers. Each child has a UUID for editor
// identity and uses `id` for its referenced pack asset.
export const newUIDocument = () => ({format:'tilemap-ui',version:1,name:'未命名 UI',width:800,height:600,background:'#24263200',layers:[{id:'default',name:'图层 1',visible:true,children:[]}],activeLayer:0});
export function readUIFile(text, assets, fonts) {
  const d=JSON.parse(text), number=(n,min,max)=>Number.isFinite(n)&&n>=min&&n<=max;
  if(d?.format!=='tilemap-ui'||d.version!==1||typeof d.name!=='string'||!d.name.trim()||d.name.length>80||
     !Number.isInteger(d.width)||!number(d.width,16,4096)||!Number.isInteger(d.height)||!number(d.height,16,4096)||
     !/^#[\da-f]{6}([\da-f]{2})?$/i.test(d.background)||!Array.isArray(d.layers)||!d.layers.length) throw Error('UI 文件格式不正确');
  if(d.sizePreset!==undefined&&d.sizePreset!=='custom'&&(!['800x600','1280x720','1920x1080','720x1280','1080x1920','1024x1024'].includes(d.sizePreset)||d.sizePreset!==`${d.width}x${d.height}`))throw Error('UI 尺寸预设不正确');
  if(!Array.isArray(d.layers)||d.layers.length>100||!Number.isInteger(d.activeLayer)||d.activeLayer<0||d.activeLayer>=d.layers.length)throw Error('UI 图层数据不正确');
  const layerIds=new Set(), elements=[];
  for(const l of d.layers){if(!l||typeof l.id!=='string'||!l.id||layerIds.has(l.id)||typeof l.name!=='string'||!l.name.trim()||l.name.length>80||typeof l.visible!=='boolean'||!Array.isArray(l.children)||l.children.length>2000)throw Error('UI 图层数据不正确');layerIds.add(l.id);elements.push(...l.children);}
  if(elements.length>2000)throw Error('UI 元素过多');
  const ids=new Set();
  for(const e of elements){
    if(!e||typeof e.uuid!=='string'||ids.has(e.uuid)||!['text','image'].includes(e.type)||
       !number(e.x,-8192,8192)||!number(e.y,-8192,8192)||!number(e.width,1,8192)||!number(e.height,1,8192))throw Error('UI 元素数据不正确');
    if(e.name!==undefined&&(typeof e.name!=='string'||!e.name.trim()||e.name.length>80))throw Error('UI 元素名称不正确');
    if(e.rotation!==undefined&&!number(e.rotation,0,360))throw Error('UI 旋转角度不正确');
    for(const key of ['keepOriginalSize','keepAspectRatio','nineSliceEnabled','trimTransparent'])if(e[key]!==undefined&&(e.type!=='image'||typeof e[key]!=='boolean'))throw Error('UI 图片缩放设置不正确');
    for(const key of ['scale','scaleX','scaleY'])if(e[key]!==undefined&&(e.type!=='image'||!Number.isFinite(e[key])||e[key]<=0))throw Error('UI 缩放比例不正确');
    if(e.overflow!==undefined&&(e.type!=='text'||!['clip','visible','wrap','shrink'].includes(e.overflow)))throw Error('文字溢出模式不正确');
    e.x=Math.round(e.x);e.y=Math.round(e.y);if(e.rotation!==undefined)e.rotation=Math.round(e.rotation)%360;
    ids.add(e.uuid);
    if(e.type==='image'&&(!e.id||!assets.has(e.id)))throw Error(`缺少 UI 素材：${e.id}`);
    if(e.nineSlice!==undefined&&(e.type!=='image'||!validSlice(e.nineSlice,...assets.get(e.id).size)))throw Error('九宫边距不正确');
    if(e.type==='text'&&(
       !e.id||typeof e.id!=='string'||(e.id!=='system'&&!fonts.has(e.id))||
       typeof e.text!=='string'||e.text.length>10000||!number(e.fontSize,8,256)||
       !/^#[\da-f]{6}$/i.test(e.color)||!['left','center','right'].includes(e.align)||
       (e.letterSpacing!==undefined&&(!Number.isFinite(e.letterSpacing)||e.letterSpacing<-8||e.letterSpacing>8))
    ))throw Error('文字数据或字体不正确');
  }
  return d;
}
export const writeUIFile = d => JSON.stringify(d,null,2);
