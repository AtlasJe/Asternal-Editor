import {assetSlice,drawNineSlice,createNineSliceEditor} from './ui-nine-slice.js';
import {createResizePanel} from './resize.js';
import {layoutUIText} from './ui-text.js';
import {resizeHandles,toLocal,containsElement,resizeElement} from './ui-transform.js';
import {createColorPicker} from './color-picker.js';
import {ICONS,createSelectionBar,createLayerPanel} from './ui.js';
import {Camera,attachGestures} from './camera.js';
import {offlineData} from './offline.js';
import {newUIDocument,readUIFile,writeUIFile} from './ui-file.js';

async function loadLibrary(packs){
  const assets=new Map(),fonts=new Map();
  for(const pack of packs){
    const embedded=offlineData()?.packs.find(p=>p.folder===pack.folder);
    const read=async path=>{
      if(embedded){if(!embedded.files[path])throw Error(`离线包缺少 ${path}`);return Uint8Array.from(atob(embedded.files[path]),c=>c.charCodeAt(0));}
      const r=await fetch(`../packs/${pack.folder}/${path}`);if(!r.ok)throw Error(`无法读取 ${path}`);return new Uint8Array(await r.arrayBuffer());
    };
    const text=async path=>new TextDecoder().decode(await read(path));
    const image=async path=>{const url=URL.createObjectURL(new Blob([await read(path)],{type:'image/png'}));try{const img=new Image();img.src=url;await img.decode();return img;}finally{URL.revokeObjectURL(url);}};
    if(pack.manifest.ui){
      let entries=pack.manifest.ui.elements,base='';
      if(!entries){const path=pack.manifest.ui.manifest;base=path.slice(0,path.lastIndexOf('/')+1);entries=JSON.parse(await text(path)).elements;}
      for(const a of entries){const id=`${pack.id}/${a.name}`;const img=await image(base+a.file);assets.set(id,{...a,id,label:a.label??a.name,size:[img.width,img.height],image:img});}
    }
    for(const f of pack.manifest.fonts??[]){
      const chars=new Map();for(const line of (await text(f.file)).split('\n'))if(line.startsWith('char ')){
        const c=Object.fromEntries([...line.matchAll(/(\w+)=(-?\d+)/g)].map(m=>[m[1],Number(m[2])]));chars.set(c.id,c);
      }
      const id=`${pack.id}/${f.name}`;fonts.set(id,{id,name:f.name,chars,image:await image(f.atlas)});
    }
  }
  return {assets,fonts};
}

export function createUIEditor(packs){
  let libraryPromise,root,doc,saved,selected=null,undo=[],redo=[],zoom=1,drag;
  let assets,fonts,canvas,ctx,props,work,palette,selectionBar,layerPanel,colorDialog,checkerPattern;
  const trimCache=new WeakMap();
  let transaction,resizePanel;
  let camera,gestures,observer,settings=false,preview=false,category='UI',cards=[],undoButton,redoButton,cancelAssetDrag=null;
  const landscape=()=>matchMedia('(orientation: landscape)').matches;
  let dock, assetSheet, propertySheet;
  const dockSize=()=>landscape()?{right:parseFloat(root.style.getPropertyValue('--panel-width'))||320,bottom:0}:{right:0,bottom:parseFloat(dock?.style.height)||230};
  const icon=(parent,name,label,fn)=>{const b=button(parent,'',fn);b.className='icon';b.title=label;b.setAttribute('aria-label',label);b.innerHTML=ICONS[name];return b;};
  const el=(tag,attrs={},parent)=>{const n=Object.assign(document.createElement(tag),attrs);parent?.append(n);return n;};
  const button=(parent,label,fn)=>{const b=el('button',{type:'button',textContent:label},parent);b.onclick=fn;return b;};
  const snapshot=()=>writeUIFile(doc),dirty=()=>doc&&snapshot()!==saved;
  const checkpoint=()=>{undo.push(snapshot());if(undo.length>100)undo.shift();redo=[];};
  const change=fn=>{checkpoint();fn();refresh();};
  const allElements=()=>doc.layers.flatMap(l=>l.children);
  const current=()=>allElements().find(e=>e.uuid===selected);
  const layerOf=e=>doc.layers.find(l=>l.children.includes(e));
  const close=()=>{if(dirty()&&!confirm('关闭 UI 会丢弃未保存的修改，继续吗？'))return;cancelAssetDrag?.();gestures.cancel();resizePanel?.destroy();resizePanel=null;selectionBar?.destroy();selectionBar=null;layerPanel?.destroy();layerPanel=null;observer.disconnect();colorDialog.close();root.remove();root=null;doc=null;document.body.classList.remove('editing-ui');};
  function field(parent,label,value,fn,type='text',options){
    const wrap=el('label',{className:'props-row'},parent);
    const unit=type==='number'?(label.includes('缩放')?'%':label==='旋转角度'?'°':'px'):null;
    el('span',{className:'props-label',textContent:label},wrap);
    const host=unit?el('span',{className:'props-unit-input'},wrap):wrap;
    const input=el(options?'select':'input',{className:'props-name'},host);
    if(unit)el('span',{className:'props-unit',textContent:unit,ariaHidden:'true'},host);
    if(options)for(const [v,l]of options)el('option',{value:v,textContent:l},input);else input.type=type;
    input.value=value;input.onchange=()=>fn(type==='number'?Number(input.value):input.value);return input;
  }
  function add(id,center,selectAfterPlacement=true){
    if(allElements().length>=2000){alert('单个 UI 最多放置 2000 个元素');return;}
    const isText=id.startsWith('text:'),a=assets.get(id),keepOriginalSize=!!a&&!assetSlice(a),factor=keepOriginalSize?1:3,width=a?a.size[0]*factor:240,height=a?a.size[1]*factor:48;
    change(()=>{
      const e={uuid:crypto.randomUUID(),type:isText?'text':'image',x:Math.round(Math.max(0,Math.min(doc.width-width,center[0]-width/2))),y:Math.round(Math.max(0,Math.min(doc.height-height,center[1]-height/2))),width,height};
      const layer=doc.layers[doc.activeLayer];layer.visible=true;
      if(a)Object.assign(e,{id:id,name:a.label??a.name,keepOriginalSize});
      else Object.assign(e,{id:id==='text:system'?'system':id.slice(5),name:'文字',text:id==='text:system'?'文字 Text':'TEXT',fontSize:32,color:'#ffffff',align:'left',letterSpacing:-1});
      layer.children.push(e);selected=selectAfterPlacement?e.uuid:null;settings=false;
    });
  }
  function addAtCenter(id){const d=dockSize();add(id,camera.toWorld((innerWidth-d.right)/2,(innerHeight-d.bottom)/2));}
  function renderLayers(){layerPanel?.refresh();}
  const visibleElements=()=>doc.layers.filter(l=>l.visible).flatMap(l=>l.children);
  function editColor(initial,apply,alpha=false){
    colorDialog.replaceChildren(createColorPicker(initial,color=>{colorDialog.close();apply(color);},{alpha}));colorDialog.showModal();
  }
  function sprite(e,a){
    const enabled=e.nineSliceEnabled??(!!assetSlice(a)&&!e.keepOriginalSize);
    let image=a.image,trimmed=null;
    if(e.trimTransparent){
      trimmed=trimCache.get(a.image);
      if(!trimmed){
        const c=document.createElement('canvas'),cc=c.getContext('2d');c.width=a.image.width;c.height=a.image.height;cc.drawImage(a.image,0,0);
        const pixels=cc.getImageData(0,0,c.width,c.height).data;let x0=c.width,y0=c.height,x1=-1,y1=-1;
        for(let y=0;y<c.height;y++)for(let x=0;x<c.width;x++)if(pixels[(y*c.width+x)*4+3]){x0=Math.min(x0,x);y0=Math.min(y0,y);x1=Math.max(x1,x);y1=Math.max(y1,y);}
        if(x1>=x0){const t=document.createElement('canvas');t.width=x1-x0+1;t.height=y1-y0+1;t.getContext('2d').drawImage(c,x0,y0,t.width,t.height,0,0,t.width,t.height);trimmed={image:t,crop:[x0,y0,c.width-x1-1,c.height-y1-1]};}
        trimCache.set(a.image,trimmed);
      }
    }
    if(trimmed)image=trimmed.image;
    let slice=enabled?(e.nineSlice??assetSlice(a)):null;
    if(slice&&trimmed)slice=[Math.max(0,slice[0]-trimmed.crop[0]),Math.max(0,slice[1]-trimmed.crop[1]),Math.max(0,slice[2]-trimmed.crop[2]),Math.max(0,slice[3]-trimmed.crop[3])];
    drawNineSlice(ctx,image,e.x,e.y,e.width,e.height,slice);
  }

  function text(e){
    ctx.save();
    const font=fonts.get(e.id);ctx.font=`${e.fontSize}px sans-serif`;
    const letterSpacing=font?(e.letterSpacing??-1):0;
    const advance=(g,scale= e.fontSize/16)=>(g?.width ? g.width*scale : (g?.xadvance??16)*scale);
    const measure=line=>font?[...line].reduce((sum,c,i)=>sum+advance(font.chars.get(c.codePointAt(0)))+(i?letterSpacing*e.fontSize/16:0),0):ctx.measureText(line).width;
    const layout=layoutUIText(e.text,e.width,e.height,e.fontSize*(font?1:1.25),measure,e.overflow??'clip');
    const {lines}=layout,fontSize=e.fontSize*layout.scale,scale=fontSize/16;
    if(layout.clip){ctx.beginPath();ctx.rect(e.x,e.y,e.width,e.height);ctx.clip();}
    lines.forEach((line,row)=>{
      if(!font){ctx.font=`${fontSize}px sans-serif`;ctx.fillStyle=e.color;ctx.textAlign=e.align;ctx.textBaseline='top';ctx.fillText(line,e.x+(e.align==='center'?e.width/2:e.align==='right'?e.width:0),e.y+row*fontSize*1.25);return;}
      const glyphs=[...line].map(c=>font.chars.get(c.codePointAt(0))),width=glyphs.reduce((s,g,i)=>s+advance(g,scale)+(i?letterSpacing*scale:0),0);
      let x=e.x+(e.align==='center'?(e.width-width)/2:e.align==='right'?e.width-width:0);
      for(const [i,g] of glyphs.entries()){if(g?.width)ctx.drawImage(font.image,g.x,g.y,g.width,g.height,x+g.xoffset*scale,e.y+row*fontSize+g.yoffset*scale,g.width*scale,g.height*scale);else if(!g){const y=e.y+row*fontSize+2*scale,w=12*scale,h=12*scale;ctx.strokeStyle=e.color;ctx.lineWidth=Math.max(scale,1/zoom);ctx.strokeRect(x+scale,y,w,h);ctx.beginPath();ctx.moveTo(x+3*scale,y+2*scale);ctx.lineTo(x+11*scale,y+10*scale);ctx.moveTo(x+11*scale,y+2*scale);ctx.lineTo(x+3*scale,y+10*scale);ctx.stroke();}x+=advance(g,scale)+(i?letterSpacing*scale:0);}
    });ctx.restore();
  }
  function rotateContext(e){const cx=e.x+e.width/2,cy=e.y+e.height/2;ctx.translate(cx,cy);ctx.rotate((e.rotation??0)*Math.PI/180);ctx.translate(-cx,-cy);}
  function draw(){
    if(!root)return;
    zoom=camera.scale;resizePanel?.update();
    const dpr=devicePixelRatio||1;canvas.width=Math.round(innerWidth*dpr);canvas.height=Math.round(innerHeight*dpr);
    canvas.style.width=`${innerWidth}px`;canvas.style.height=`${innerHeight}px`;
    ctx.setTransform(dpr,0,0,dpr,0,0);ctx.imageSmoothingEnabled=false;
    ctx.fillStyle=getComputedStyle(root).getPropertyValue('--bg');ctx.fillRect(0,0,innerWidth,innerHeight);
    ctx.translate(camera.x,camera.y);ctx.scale(zoom,zoom);ctx.fillStyle=checkerPattern;ctx.fillRect(0,0,doc.width,doc.height);ctx.fillStyle=doc.background;ctx.fillRect(0,0,doc.width,doc.height);
    ctx.save();ctx.beginPath();ctx.rect(0,0,doc.width,doc.height);ctx.clip();
    for(const e of visibleElements()){ctx.save();rotateContext(e);if(e.type==='image')sprite(e,assets.get(e.id));else text(e);ctx.restore();}ctx.restore();
    const e=current();if(e&&!preview){
      ctx.save();rotateContext(e);ctx.strokeStyle=getComputedStyle(root).getPropertyValue('--accent');ctx.lineWidth=1/zoom;ctx.strokeRect(e.x,e.y,e.width,e.height);ctx.fillStyle=ctx.strokeStyle;
      for(const [hx,hy]of resizeHandles)ctx.fillRect(e.x+(hx+1)*e.width/2-4/zoom,e.y+(hy+1)*e.height/2-4/zoom,8/zoom,8/zoom);
      ctx.beginPath();ctx.moveTo(e.x+e.width/2,e.y);ctx.lineTo(e.x+e.width/2,e.y-28/zoom);ctx.stroke();
      ctx.beginPath();ctx.arc(e.x+e.width/2,e.y-28/zoom,5/zoom,0,Math.PI*2);ctx.fill();ctx.restore();
    }
    if(selectionBar){
      if(!e||preview||drag)selectionBar.place(null);
      else{
        const a=(e.rotation??0)*Math.PI/180,w=Math.abs(e.width*Math.cos(a))+Math.abs(e.height*Math.sin(a)),h=Math.abs(e.width*Math.sin(a))+Math.abs(e.height*Math.cos(a));
        const cx=camera.x+(e.x+e.width/2)*zoom,cy=camera.y+(e.y+e.height/2)*zoom;
        const obstacles=[props,palette,root.querySelector('.ui-map-history-bar')].filter(n=>n&&!n.hidden&&n.getClientRects().length).map(n=>n.getBoundingClientRect());
        selectionBar.place({left:cx-w*zoom/2,right:cx+w*zoom/2,top:cy-h*zoom/2,bottom:cy+h*zoom/2},obstacles);
      }
    }
    undoButton.disabled=!undo.length;redoButton.disabled=!redo.length;
  }
  function fit(){const d=dockSize();camera.fit({x:0,y:56,w:innerWidth-d.right,h:innerHeight-d.bottom-120},doc.width,doc.height);draw();}
  function remove(){const e=current(),layer=layerOf(e);if(e&&layer)change(()=>{layer.children=layer.children.filter(n=>n!==e);selected=null;});}
  function copy(){const e=current(),layer=layerOf(e);if(!e||!layer||allElements().length>=2000)return;change(()=>{const c=structuredClone(e);c.uuid=crypto.randomUUID();c.x+=16;c.y+=16;layer.children.push(c);selected=c.uuid;});}
  function refresh(){
    const selectedElement=current();
    root.classList.toggle('ui-selected',!!selectedElement||settings);
    root.classList.toggle('ui-preview',preview);
    const previewControl=root.querySelector('.ui-map-preview-entry');previewControl.innerHTML=ICONS[preview?'close':'eye'];previewControl.title=preview?'退出预览':'预览';previewControl.setAttribute('aria-label',previewControl.title);
    const propertyActive=!!selectedElement||settings;
    dock.classList.toggle('property-active', propertyActive);
    assetSheet.inert=propertyActive;
    propertySheet.inert=!propertyActive;
    for(const {button,group}of cards)button.hidden=group!==category;
    draw();renderLayers();
    if(!propertyActive)return; // Preserve the outgoing property content during its slide out.
    props.replaceChildren();
    const e=current();const head=el('div',{className:'ui-props-head'},props);el('strong',{textContent:e?'元素属性':'画布设置'},head);icon(head,'close','取消选择',()=>{selected=null;settings=false;refresh();});
    if(!e){
      field(props,'名称',doc.name,v=>{if(v.trim()&&v.length<=80)change(()=>doc.name=v);else refresh();});
      const presets=[['800x600','800 × 600 · 4:3'],['1280x720','1280 × 720 · 横屏'],['1920x1080','1920 × 1080 · 横屏'],['720x1280','720 × 1280 · 竖屏'],['1080x1920','1080 × 1920 · 竖屏'],['1024x1024','1024 × 1024 · 正方形']];
      const size=doc.sizePreset??`${doc.width}x${doc.height}`;
      field(props,'尺寸预设',presets.some(([v])=>v===size)?size:'custom',v=>{change(()=>{doc.sizePreset=v;if(v!=='custom'){const [width,height]=v.split('x').map(Number);Object.assign(doc,{width,height});}});fit();},'text',[...presets,['custom','自定义']]);
      if(size==='custom'||!presets.some(([v])=>v===size))for(const key of ['width','height']){const input=field(props,key==='width'?'宽度':'高度',doc[key],v=>{if(Number.isInteger(v)&&v>=16&&v<=4096){change(()=>{doc[key]=v;doc.sizePreset='custom';});fit();}else refresh();},'number');input.min=16;input.max=4096;input.step=1;}
      button(props,'可视化调整尺寸',()=>resizePanel.open());
      const row=el('div',{className:'props-row'},props);el('span',{className:'props-label',textContent:'背景色'},row);
      const swatch=button(row,'',()=>editColor(doc.background,v=>change(()=>doc.background=v),true));swatch.className='ui-background-swatch';swatch.title='背景色和透明度';swatch.setAttribute('aria-label','背景色和透明度');
      el('span',{className:'ui-background-swatch-color'},swatch).style.background=doc.background;
      return;
    }
    field(props,'名称',e.name??(e.type==='text'?'文字':assets.get(e.id)?.label??'UI 物体'),v=>{
      const name=v.trim();if(name&&name.length<=80)change(()=>e.name=name);else refresh();
    });
    for(const [key,label]of [['x','X'],['y','Y'],['width','宽度'],['height','高度']]){
      const size=key==='width'||key==='height';
      const factor=e.type==='image'?(e.scale??1)*(e[key==='width'?'scaleX':'scaleY']??1):1;
      const value=size?(e.keepOriginalSize?assets.get(e.id).size[key==='width'?0:1]:e[key]/factor):e[key];
      const input=field(props,label,value,v=>{
        if(!size)v=Math.round(v);
        if(!Number.isFinite(v)||v<(size?1:-8192)||v>8192){refresh();return;}
        if(size)v*=factor;
        const other=key==='width'?'height':'width',paired=e[other]*v/e[key];
        if(size&&e.keepAspectRatio&&(paired<1||paired>8192)){refresh();return;}
        change(()=>{if(size&&e.keepAspectRatio)e[other]=paired;e[key]=v;});
      },'number');input.disabled=size&&!!e.keepOriginalSize;
    }
    field(props,'旋转角度',e.rotation??0,v=>{if(Number.isFinite(v))change(()=>e.rotation=((Math.round(v)%360)+360)%360);else refresh();},'number');
    if(e.type==='image'){
      for(const [key,label]of [['keepOriginalSize','保持原图尺寸'],['keepAspectRatio','保持等比缩放']]){
        const row=el('label',{className:'props-row'},props);el('span',{className:'props-label',textContent:label},row);
        const input=el('input',{type:'checkbox',checked:!!e[key]},row);
        input.onchange=()=>change(()=>{e[key]=input.checked;if(key==='keepOriginalSize'&&e[key]){const a=assets.get(e.id);e.width=a.size[0]*(e.scale??1)*(e.scaleX??1);e.height=a.size[1]*(e.scale??1)*(e.scaleY??1);}});
      }
      const trimRow=el('label',{className:'props-row'},props);el('span',{className:'props-label',textContent:'剔除空白像素'},trimRow);
      const trimInput=el('input',{type:'checkbox',checked:!!e.trimTransparent},trimRow);
      trimInput.onchange=()=>change(()=>{e.trimTransparent=trimInput.checked;});
    }
    if(e.type==='image'){
      const a=assets.get(e.id),row=el('label',{className:'props-row'},props);el('span',{className:'props-label',textContent:'启用九宫'},row);
      const enabled=e.nineSliceEnabled??(!!assetSlice(a)&&!e.keepOriginalSize);
      const input=el('input',{type:'checkbox',checked:enabled},row);
      input.onchange=()=>change(()=>{e.nineSliceEnabled=input.checked;if(input.checked&&!e.nineSlice)e.nineSlice=[...(assetSlice(a)??[0,0,0,0])];});
      if(enabled)createNineSliceEditor(props,a,e.nineSlice,checkpoint,slice=>{e.nineSlice=slice;draw();renderLayers();});
    }
    if(e.type==='image'){
      for(const [key,label]of [['scale','整体缩放'],['scaleX','横向缩放'],['scaleY','纵向缩放']]){
        const input=field(props,label,Math.round((e[key]??1)*10000)/100,v=>{
          const value=v/100,ratio=value/(e[key]??1),both=key==='scale';
          const width=e.width*(both||key==='scaleX'?ratio:1),height=e.height*(both||key==='scaleY'?ratio:1);
          if(!Number.isFinite(value)||value<=0||width<1||height<1||width>8192||height>8192){refresh();return;}
          change(()=>{e[key]=value;e.width=width;e.height=height;});
        },'number');input.step='any';
      }
    }
    if(e.type==='text'){
      field(props,'溢出模式',e.overflow??'clip',v=>change(()=>e.overflow=v),'text',[['clip','裁剪'],['visible','允许溢出'],['wrap','自动换行'],['shrink','缩小适应']]);
      const input=el('textarea',{value:e.text,maxLength:10000,ariaLabel:'文字内容'},props);
      let textCheckpoint=false;input.oninput=()=>{if(!textCheckpoint){checkpoint();textCheckpoint=true;}e.text=input.value;draw();renderLayers();updateFontHint();};input.onblur=()=>{textCheckpoint=false;};
      field(props,'字体',e.id,v=>change(()=>e.id=v),'text',[['system','系统字体（支持中文）'],...[...fonts].map(([id,f])=>[id,f.name])]);
      field(props,'字号',e.fontSize,v=>{if(v>=8&&v<=256)change(()=>e.fontSize=v);else refresh();},'number');
      field(props,'对齐',e.align,v=>change(()=>e.align=v),'text',[['left','左对齐'],['center','居中'],['right','右对齐']]);
      if(e.id==='system')field(props,'颜色',e.color,v=>change(()=>e.color=v),'color');
      const hint=el('p',{},props);
      function updateFontHint(){const f=fonts.get(e.id);hint.hidden=!f;if(f){const missing=[...new Set([...e.text].filter(c=>c!=='\n'&&!f.chars.has(c.codePointAt(0))))];hint.textContent=missing.length?`缺少字符：${missing.join('')}，已用方框 × 占位。`:'位图字体保留原色；建议字号为 16 的整数倍。';}}
      updateFontHint();
    }
  }
  function history(back){const from=back?undo:redo,to=back?redo:undo;if(!from.length)return;to.push(snapshot());doc=JSON.parse(from.pop());selected=null;refresh();}
  function save(){const url=URL.createObjectURL(new Blob([snapshot()],{type:'application/json'}));el('a',{href:url,download:doc.name.replace(/[\\/:*?"<>|]/g,'_')+'.ui'}).click();setTimeout(()=>URL.revokeObjectURL(url),1000);saved=snapshot();draw();}
  async function open(existing){
    try{({assets,fonts}=await(libraryPromise??=loadLibrary(packs)));}catch(e){libraryPromise=null;alert(`读取 UI 素材失败：${e.message}`);return;}
    if(root)return;
    let next=newUIDocument();if(existing)try{next=readUIFile(await existing.text(),assets,fonts);}catch(e){alert(`打开 UI 失败：${e.message}`);return;}
    doc=next;doc.activeLayer??=0;saved=existing?snapshot():null;undo=[];redo=[];selected=null;zoom=1;
    root=el('section',{id:'ui-editor',tabIndex:-1},document.body);document.body.classList.add('editing-ui');
    settings=false;preview=false;category='UI';cards=[];drag=null;transaction=null;cancelAssetDrag=null;
    camera=new Camera();root.style.setProperty('--panel-width','320px');
    work=el('main',{className:'ui-work'},root);canvas=el('canvas',{tabIndex:0,ariaLabel:'UI 设计画布'},work);ctx=canvas.getContext('2d');
    const checker=el('canvas',{width:16,height:16}),checkerCtx=checker.getContext('2d');checkerCtx.fillStyle='#333640';checkerCtx.fillRect(0,0,16,16);checkerCtx.fillStyle='#292c35';checkerCtx.fillRect(0,0,8,8);checkerCtx.fillRect(8,8,8,8);checkerPattern=ctx.createPattern(checker,'repeat');
    colorDialog=el('dialog',{className:'ui-color-dialog',ariaLabel:'背景色和透明度'},root);
    colorDialog.addEventListener('keydown',e=>e.stopPropagation());
    colorDialog.addEventListener('click',e=>{const r=colorDialog.getBoundingClientRect();if(e.target===colorDialog&&(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom))colorDialog.close();});
    const files=el('div',{className:'ui-map-file-bar'},root);
    const exit=icon(files,'close','关闭 UI',close);exit.dataset.fileAction='close';exit.dataset.fileState='open';
    const saveButton=icon(files,'check','保存 UI (Ctrl+S)',save);saveButton.dataset.fileState='open';saveButton.dataset.fileAction='save';
    saveButton.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 3h13l4 4v14H3V3h1Zm3 0v6h9V3M7 21v-8h10v8"/></svg>';
    const historyBar=el('div',{className:'ui-map-history-bar'},root);
    undoButton=icon(historyBar,'undo','撤销 (Ctrl+Z)',()=>history(true));redoButton=icon(historyBar,'redo','重做 (Ctrl+Shift+Z)',()=>history(false));
    const previewButton=icon(root,'eye','预览',()=>{preview=!preview;previewButton.innerHTML=ICONS[preview?'close':'eye'];previewButton.title=preview?'退出预览':'预览';refresh();});previewButton.classList.add('ui-map-preview-entry');
    const configButton=icon(root,'gear','画布设置',()=>{selected=null;settings=!settings;refresh();});configButton.classList.add('ui-map-map-settings-entry');
    dock=el('div',{className:'ui-panel-shell'},root);
    assetSheet=el('section',{className:'dock-sheet asset-sheet'},dock);
    propertySheet=el('section',{className:'dock-sheet property-sheet',inert:true},dock);
    palette=el('div',{className:'ui-map-panel ui-panel-view'},assetSheet);
    const grip=el('div',{className:'panel-grip',title:'拖动调整素材面板大小'},assetSheet);
    const propertyGrip=el('div',{className:'panel-grip',title:'拖动调整属性面板大小'},propertySheet);
    const head=el('div',{className:'panel-head'},palette),tabs=el('div',{className:'category-tabs'},head);
    const tabLine=el('div',{className:'tab-line'},tabs);
    const tabButtons=[];
    for(const label of ['UI','文字']){const b=button(tabs,label,()=>{category=label;syncTabs();refresh();});tabButtons.push(b);}
    function syncTabs(){for(const b of tabButtons)b.classList.toggle('active',b.textContent===category);const b=tabButtons.find(b=>b.textContent===category);tabLine.style.width=`${b.offsetWidth}px`;tabLine.style.transform=`translateX(${b.offsetLeft}px)`;}
    const grid=el('div',{className:'section terrains'},palette);
    function card(id,label,group,image){
      let suppressClick=false;const b=button(grid,'',()=>{if(suppressClick){suppressClick=false;return;}addAtCenter(id);});b.className='terrain';b.title=label;b.setAttribute('aria-label',label);
      const art=el('span',{className:'asset-art'},b),thumb=el('canvas',{width:96,height:96},art),c=thumb.getContext('2d');c.imageSmoothingEnabled=false;
      if(image){const k=Math.min(96/image.width,96/image.height,3);c.drawImage(image,(96-image.width*k)/2,(96-image.height*k)/2,image.width*k,image.height*k);}
      else{c.font='38px sans-serif';c.fillStyle='#e6e6e6';c.textAlign='center';c.fillText('Aa',48,62);}
      el('span',{className:'asset-name',textContent:label},b);cards.push({button:b,id,group});
      // Pointer capture supports dragging out of the dock on mouse and touch.
      let pending=null,ghost=null;
      const cleanup=()=>{pending=null;ghost?.remove();ghost=null;cancelAssetDrag=null;window.removeEventListener('pointerup',finishDrop,true);window.removeEventListener('mouseup',finishDrop,true);window.removeEventListener('pointercancel',cancelDrop,true);};
      const cancelDrop=()=>{suppressClick=true;cleanup();};
      b.onpointerdown=e=>{if(e.button!==0)return;suppressClick=false;pending={pointer:e.pointerId,x:e.clientX,y:e.clientY,scroll:grid.scrollTop,touch:e.pointerType==='touch',mode:'pending'};b.setPointerCapture(e.pointerId);window.addEventListener('pointerup',finishDrop,true);window.addEventListener('mouseup',finishDrop,true);window.addEventListener('pointercancel',cancelDrop,true);cancelAssetDrag=cancelDrop;};
      b.onpointermove=e=>{
        if(!pending||e.pointerId!==pending.pointer)return;
        const dx=e.clientX-pending.x,dy=e.clientY-pending.y;
        if(pending.mode==='pending'&&Math.hypot(dx,dy)>8){
          pending.mode=pending.touch&&(landscape()?Math.abs(dy)>Math.abs(dx):dy>0)?'scroll':'drag';suppressClick=true;
          if(pending.mode==='drag'){ghost=el('canvas',{className:'ui-asset-drag-ghost',width:96,height:96},root);ghost.getContext('2d').drawImage(thumb,0,0);}
        }
        if(pending.mode==='scroll')grid.scrollTop=pending.scroll-dy;
        if(ghost){ghost.style.left=`${e.clientX-48}px`;ghost.style.top=`${e.clientY-48}px`;}
      };
      function finishDrop(e){
        if(!pending)return;
        const dropping=pending.mode==='drag',target=document.elementFromPoint(e.clientX,e.clientY),point=camera.toWorld(e.clientX,e.clientY);
        if(pending.mode!=='pending')suppressClick=true;cleanup();
        if(dropping&&work.contains(target)&&point[0]>=0&&point[1]>=0&&point[0]<=doc.width&&point[1]<=doc.height)add(id,point,false);
      }
      b.onpointercancel=cancelDrop;
      b.ondragstart=e=>e.preventDefault();

    }
    for(const a of assets.values())card(a.id,a.label,'UI',a.image);
    card('text:system','系统文字','文字');for(const [id,f]of fonts)card('text:'+id,f.name,'文字',f.image);
    const source=icon(root,'tiles','UI 素材',()=>{selected=null;settings=false;refresh();});source.classList.add('ui-map-source-entry');el('span',{textContent:'UI 素材'},source);
    props=el('div',{className:'ui-map-object-props ui-panel-view'},propertySheet);
    selectionBar=createSelectionBar({parent:root,prefix:'ui-map-',actions:{
      clearContents:remove,copy,confirm:()=>{selected=null;refresh();},
      layerTargets:()=>{const e=current(),from=layerOf(e);return e?doc.layers.map((l,index)=>({...l,index})).filter(l=>l.id!==from?.id):null;},
      moveToLayer:index=>{const e=current(),from=layerOf(e);if(e&&from)change(()=>{from.children=from.children.filter(n=>n!==e);doc.layers[index].children.push(e);doc.activeLayer=index;if(!doc.layers[index].visible)selected=null;});},
    }});
    const layerMap={get layers(){return doc.layers;},get active(){return doc.activeLayer;},get activeLayer(){return doc.layers[doc.activeLayer];},get width(){return Math.max(1,Math.round(doc.width*Math.min(1,256/Math.max(doc.width,doc.height))));},get height(){return Math.max(1,Math.round(doc.height*Math.min(1,256/Math.max(doc.width,doc.height))));}};
    layerPanel=createLayerPanel({config:{terrains:[]},map:layerMap,parent:root,prefix:'ui-map-',
      drawThumbnail:(layer,thumb)=>{
        const previous=ctx;ctx=thumb.getContext('2d');ctx.clearRect(0,0,thumb.width,thumb.height);ctx.save();ctx.scale(thumb.width/doc.width,thumb.height/doc.height);ctx.imageSmoothingEnabled=false;
        for(const e of layer.children){ctx.save();rotateContext(e);if(e.type==='image')sprite(e,assets.get(e.id));else text(e);ctx.restore();}
        ctx.restore();ctx=previous;
      },
      actions:{
        objects:layer=>layer.children.map(e=>({name:e.name??(e.type==='text'?(e.text.slice(0,40)||'空文字'):assets.get(e.id).label),selected:e.uuid===selected,drawThumbnail:thumb=>{const previous=ctx;ctx=thumb.getContext('2d');ctx.clearRect(0,0,thumb.width,thumb.height);ctx.save();const k=Math.min(thumb.width/e.width,thumb.height/e.height);ctx.translate((thumb.width-e.width*k)/2,(thumb.height-e.height*k)/2);ctx.scale(k,k);ctx.translate(-e.x,-e.y);ctx.imageSmoothingEnabled=false;if(e.type==='image')sprite(e,assets.get(e.id));else text(e);ctx.restore();ctx=previous;}})),
        selectObject:(i,j)=>{doc.activeLayer=i;selected=doc.layers[i].children[j]?.uuid??null;settings=false;refresh();},
        reorderObject:(i,from,to)=>change(()=>{const items=doc.layers[i].children;const [item]=items.splice(from,1);items.splice(to,0,item);}),
        select:i=>{doc.activeLayer=i;selected=null;settings=false;refresh();},
        toggleVisible:i=>change(()=>{const l=doc.layers[i];l.visible=!l.visible;if(layerOf(current())===l&&!l.visible)selected=null;}),
        add:()=>{if(doc.layers.length>=100)return;change(()=>{doc.layers.push({id:crypto.randomUUID(),name:`图层 ${doc.layers.length+1}`,visible:true,children:[]});doc.activeLayer=doc.layers.length-1;selected=null;});},
        rename:(i,name)=>change(()=>doc.layers[i].name=name),
        reorder:(from,to)=>change(()=>{const active=doc.layers[doc.activeLayer];const [l]=doc.layers.splice(from,1);doc.layers.splice(to,0,l);doc.activeLayer=doc.layers.indexOf(active);}),
        copy:i=>{const original=doc.layers[i],elements=original.children;if(doc.layers.length>=100||allElements().length+elements.length>2000)return;change(()=>{const layer={...original,id:crypto.randomUUID(),name:(original.name+' 副本').slice(0,80),children:elements.map(e=>({...structuredClone(e),uuid:crypto.randomUUID()}))};doc.layers.splice(i+1,0,layer);doc.activeLayer=i+1;selected=null;});},
        remove:i=>{if(doc.layers.length<=1)return;change(()=>{const active=doc.layers[doc.activeLayer];doc.layers.splice(i,1);doc.activeLayer=Math.max(0,doc.layers.indexOf(active));selected=null;});},
      },
    });
    const syncDock=()=>{if(!root)return;const d=dockSize();root.style.setProperty('--dock-right',`${d.right}px`);root.style.setProperty('--dock-bottom',`${d.bottom}px`);syncTabs();draw();};
    for(const grip of [assetSheet.querySelector('.panel-grip'),propertyGrip])grip.onpointerdown=e=>{e.preventDefault();grip.setPointerCapture(e.pointerId);const horizontal=landscape(),start=horizontal?e.clientX:e.clientY,initial=horizontal?dockSize().right:dockSize().bottom;
      grip.onpointermove=ev=>{const size=initial+start-(horizontal?ev.clientX:ev.clientY);if(horizontal)root.style.setProperty('--panel-width',`${Math.max(220,Math.min(innerWidth-200,size))}px`);else dock.style.height=`${Math.max(140,Math.min(innerHeight*.8,size))}px`;syncDock();};grip.onpointerup=grip.onpointercancel=()=>grip.onpointermove=null;};
    const world=p=>camera.toWorld(...p),hit=p=>visibleElements().reverse().find(e=>containsElement(e,p));
    const handleHit=p=>{
      const e=current();if(!e)return null;const [x,y]=toLocal(e,p),r=10/camera.scale;
      if(Math.hypot(x-e.width/2,y+28/camera.scale)<r)return 'rotate';
      return resizeHandles.find(([hx,hy])=>Math.abs(x-(hx+1)*e.width/2)<r&&Math.abs(y-(hy+1)*e.height/2)<r)??null;
    };
    const selectedHit=p=>{const e=current();return e&&(handleHit(p)||containsElement(e,p));};
    function beginMove(p){transaction={doc:snapshot(),undo:undo.slice(),redo:redo.slice()};const n=current();if(!n)return;const [x,y]=world(p);drag={x,y,original:structuredClone(n),handle:handleHit([x,y]),started:false};draw();}
    function finish(cancel){if(cancel&&transaction){doc=JSON.parse(transaction.doc);undo=transaction.undo;redo=transaction.redo;}transaction=null;drag=null;refresh();}
    gestures=attachGestures(work,camera,{
      isNavigationOnly:()=>preview||settings,
      onCamera:draw,
      shouldStartToolImmediately:p=>!!handleHit(world(p)),
      shouldMoveSelection:p=>selectedHit(world(p)),
      onSelectionMoveStart:beginMove,
      onTap:p=>{const e=hit(world(p));selected=e?.uuid??null;if(e)doc.activeLayer=doc.layers.findIndex(l=>l.children.includes(e));settings=false;refresh();},
      onToolStart:p=>{if(selectedHit(world(p)))beginMove(p);},
      onToolMove:p=>{if(!drag)return;const [x,y]=world(p),dx=x-drag.x,dy=y-drag.y;if(!dx&&!dy&&!drag.started)return;
        if(!drag.started){drag.redo=redo.slice();checkpoint();drag.started=true;}const n=current(),o=drag.original;
        if(drag.handle==='rotate'){
          const cx=o.x+o.width/2,cy=o.y+o.height/2;
          n.rotation=((Math.round((o.rotation??0)+(Math.atan2(y-cy,x-cx)-Math.atan2(drag.y-cy,drag.x-cx))*180/Math.PI)%360)+360)%360;
        }else if(drag.handle){const next=resizeElement(o,drag.handle,[dx,dy]);next.x=Math.round(next.x);next.y=Math.round(next.y);if(Math.abs(next.x)<=8192&&Math.abs(next.y)<=8192){if(n.type==='image'){const rx=next.width/o.width,ry=next.height/o.height;if(Math.abs(rx-ry)<1e-9)n.scale=(o.scale??1)*rx;else{n.scaleX=(o.scaleX??1)*rx;n.scaleY=(o.scaleY??1)*ry;}}Object.assign(n,next);}}else{n.x=Math.max(-8192,Math.min(8192,Math.round(o.x+dx)));n.y=Math.max(-8192,Math.min(8192,Math.round(o.y+dy)));}draw();},
      onToolEnd:()=>finish(false),onToolCancel:()=>finish(true),
    },{longPressMs:200});
    resizePanel=createResizePanel({
      map:{get width(){return doc.width;},get height(){return doc.height;}},camera,tileSize:1,parent:root,prefix:'ui-',title:'UI 尺寸',unit:'px',minSize:16,maxSize:4096,
      onCamera:draw,
      onOpen:panelRect=>{selected=null;settings=true;preview=false;refresh();camera.fit({x:0,y:56,w:landscape()?innerWidth-panelRect.width:innerWidth,h:Math.max(100,(landscape()?innerHeight:panelRect.top)-128)},doc.width,doc.height);draw();},
      onApply:(width,height,left,top)=>{
        change(()=>{Object.assign(doc,{width,height,sizePreset:'custom'});for(const e of allElements()){e.x=Math.round(e.x-left);e.y=Math.round(e.y-top);}});
        camera.x+=left*camera.scale;camera.y+=top*camera.scale;draw();
      },
    });
    observer=new ResizeObserver(syncDock);observer.observe(root);observer.observe(dock);syncDock();fit();
    root.addEventListener('keydown',e=>{e.stopPropagation();if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='s'){e.preventDefault();document.activeElement?.blur();save();return;}if(['INPUT','TEXTAREA','SELECT'].includes(e.target.tagName))return;
      if(e.key==='Escape'){cancelAssetDrag?.();selected=null;settings=false;preview=false;layerPanel.close();refresh();}else if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){e.preventDefault();history(!e.shiftKey);}else if(e.key==='Delete'||e.key==='Backspace'){e.preventDefault();remove();}});
    root.addEventListener('pointerdown',e=>e.stopPropagation());root.addEventListener('wheel',e=>e.stopPropagation());refresh();root.focus();
  }
  window.addEventListener('beforeunload',e=>{if(root&&dirty()){e.preventDefault();e.returnValue='';}});
  return {create:()=>open(),openFile:file=>open(file)};
}
