import {wangTilePlaceable} from './pack-meta.js';
import {wangBrushForTile, wangPatternForRect} from './wang.js';
import { offlineData } from './offline.js';
import { saveAnnotationFile } from './annotation-file.js';
import { createColorPicker } from './color-picker.js';
import { drawAnnotationDual } from './annotation-dual.js';
import { annotationState, validAnnotationState, removeAnnotationLabel, DEFAULT_LABEL_COLORS } from './wang-annotations.js';
// Annotation drafts are committed to the pack only by the confirm action.
const svg=body=>`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
const ICONS={
  edit:svg('<path d="M4 20l4-1L20 7l-3-3L5 16zM14 7l3 3"/>'),
  check:svg('<path d="M5 12l4 4L19 6"/>'),
  close:svg('<path d="M6 6l12 12M18 6L6 18"/>'),
  undo:svg('<path d="M9 14L4 9l5-5M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>'),
  redo:svg('<path d="M15 14l5-5-5-5M20 9H9.5a5.5 5.5 0 0 0 0 11H13"/>'),
  plus:svg('<path d="M12 5v14M5 12h14"/>'),
  trash:svg('<path d="M4 6h16M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7M14 10v7"/>'),
  erase:svg('<circle cx="12" cy="12" r="8"/><path d="M6.35 6.35l11.3 11.3"/>'),
  color:svg('<circle cx="12" cy="12" r="9"/><circle cx="8" cy="8" r="1"/><circle cx="15" cy="7" r="1"/><circle cx="7" cy="14" r="1"/><path d="M18 14h-4l-2 4"/>'),
};
const element = (tag, attrs = {}) => Object.assign(document.createElement(tag), attrs);
const drafts = new Map();
export function createWangAtlas({config, sheets, tools, changed, annotationsSaved, modeChanged}) {
  const root=element('section',{className:'wang-atlas'});
  const toolbar=element('div',{className:'wang-atlas-toolbar wang-atlas-primary'});
  const cancelToolbar=element('div',{className:'wang-atlas-toolbar wang-atlas-cancel'});
  const annotate=element('button',{innerHTML:ICONS.edit,title:'Modo de anotación',ariaLabel:'Modo de anotación',className:'wang-float-icon','ariaPressed':'false'});
  const undo=element('button',{innerHTML:ICONS.undo,title:'Deshacer anotación',ariaLabel:'Deshacer anotación',className:'wang-float-icon'});
  const redo=element('button',{innerHTML:ICONS.redo,title:'Rehacer anotación',ariaLabel:'Rehacer anotación',className:'wang-float-icon'});
  const historyBar=element('div',{className:'wang-atlas-history'});historyBar.append(undo,redo);
  const cancel=element('button',{innerHTML:ICONS.close,title:'Cancelar anotación',ariaLabel:'Cancelar anotación',className:'wang-float-icon'});
  const palette=element('div',{className:'wang-atlas-labels',role:'group','ariaLabel':'Etiqueta de anotación'});
  const labelMenu=element('div',{className:'wang-label-menu',hidden:true,role:'group',ariaLabel:'Acciones de etiqueta'});
  const colorBackdrop=element('button',{className:'wang-color-backdrop',hidden:true,type:'button',ariaLabel:'Cancelar color'});
  colorBackdrop.onpointerdown=e=>e.stopPropagation();
  colorBackdrop.onclick=e=>{e.preventDefault();e.stopPropagation();closeLabelMenu();};
  let menuAnchor=null;
  const viewport=element('div',{className:'wang-atlas-viewport',tabIndex:0,'ariaLabel':'Atlas Wang'});
  viewport.title='Selecciona un tile; mantén pulsado para seleccionar un grupo; arrastra para desplazar y usa la rueda para zoom';
  const canvas=element('canvas'); const ctx=canvas.getContext('2d');
  const status=element('div',{className:'wang-atlas-status',role:'status'});
  viewport.append(canvas,status);toolbar.append(annotate);cancelToolbar.append(cancel);
  root.append(viewport,toolbar,cancelToolbar,historyBar,palette,colorBackdrop,labelMenu);
  let index=null, indices=[], mode=false, label=null, selected=null, hover=null;
  let selectedRect=null;
  let x=0,y=0,scale=1,width=1,height=1,space=false,gesture=null,pressTimer=null;
  let visible=false, needsFit=true, saving=false, message='';
  const terrain=()=>config.terrains[index];
  const draft=()=>drafts.get(terrain()?.name);
  const T=config.tileSize;
  function loadDraft(t) {
    if(drafts.has(t.name))return;
    const signature=JSON.stringify(t.wang),initial=annotationState(t.wang);
    let state=structuredClone(initial);
    try {
      const saved=JSON.parse(localStorage.getItem(`tilemap:wang-draft:${t.name}`));
      if(saved?.signature===signature&&validAnnotationState(saved.state,t.wang))state={...saved.state,colors:saved.state.colors??Object.fromEntries(saved.state.labels.map((name,i)=>[name,DEFAULT_LABEL_COLORS[i%DEFAULT_LABEL_COLORS.length]]))};
    }catch{}
    drafts.set(t.name,{signature,state,undo:[],redo:[],changed:JSON.stringify(state)!==JSON.stringify(initial)});
  }
  function persist() {
    const d=draft();d.changed=JSON.stringify(d.state)!==JSON.stringify(annotationState(terrain().wang));
    try {localStorage.setItem(`tilemap:wang-draft:${terrain().name}`,JSON.stringify({signature:d.signature,state:d.state}));}
    catch {message='El navegador no pudo guardar el borrador. Confirma para guardarlo.';}
  }
  function checkpoint(){draft().redo=[];draft().undo.push(structuredClone(draft().state));if(draft().undo.length>100)draft().undo.shift();}
  function setMode(on){
    mode=on;modeChanged?.(on);message='';if(on&&label!==null&&!draft().state.labels.includes(label))label=draft().state.labels[0];root.classList.toggle('annotating',mode);document.body.classList.toggle('wang-annotating',mode);refreshControls();resize();
  }
  function activate() {
    tools.terrain=index;tools.object=null;
    if(!['pencil','shape','fill'].includes(tools.tool))tools.tool='pencil';
  }
  function setTerrain(i) {
    index=i; loadDraft(terrain());
    label=draft().state.labels[1] ?? draft().state.boundary;message='';
    const first=terrain().wang.tiles.find(t=>wangBrushForTile(terrain(),t));
    selected=terrain().placement==='tile'?terrain().wang.tiles.indexOf(first):null;
    selectedRect=null;hover=null; tools.terrain=i; tools.object=null; tools.wangBrush=wangBrushForTile(terrain(),first)??{};
    if(!['pencil','shape','fill'].includes(tools.tool)) tools.tool='pencil';
    needsFit=true; refreshControls(); resize(); changed();
  }
  function closeLabelMenu(){
    menuAnchor?.setAttribute('aria-expanded','false');menuAnchor=null;labelMenu.hidden=true;colorBackdrop.hidden=true;
  }
  function positionLabelMenu(){
    if(!menuAnchor||labelMenu.hidden)return;
    const r=root.getBoundingClientRect(),a=menuAnchor.getBoundingClientRect();
    const left=Math.max(8,Math.min(r.width-labelMenu.offsetWidth-8,a.left-r.left+(a.width-labelMenu.offsetWidth)/2));
    labelMenu.style.left=`${left}px`;
    labelMenu.style.top=`${a.top-r.top-labelMenu.offsetHeight-8}px`;
  }
  function openLabelMenu(anchor){
    if(menuAnchor===anchor){closeLabelMenu();return;}
    closeLabelMenu();menuAnchor=anchor;anchor.setAttribute('aria-expanded','true');
    labelMenu.replaceChildren();
    const colorControl=element('button',{className:'wang-float-icon',title:'Cambiar color de etiqueta',ariaLabel:'Cambiar color de etiqueta',innerHTML:ICONS.color});
    colorControl.onclick=()=>{
      const target=label;
      colorBackdrop.hidden=false;
      labelMenu.replaceChildren(createColorPicker(draft().state.colors[target],value=>{
        if(value!==draft().state.colors[target]){checkpoint();draft().state.colors[target]=value;message='';persist();}
        refreshControls();draw();
      }));
      positionLabelMenu();
    };
    const del=element('button',{innerHTML:ICONS.trash,className:'wang-float-icon',title:'Eliminar etiqueta seleccionada',ariaLabel:'Eliminar etiqueta seleccionada',disabled:draft().state.labels.length===1});
    del.onclick=()=>{checkpoint();removeAnnotationLabel(draft().state,label);label=draft().state.labels[0];message='';persist();refreshControls();draw();};
    labelMenu.append(colorControl,del);labelMenu.hidden=false;positionLabelMenu();
  }
  document.addEventListener('pointerdown',e=>{
    if(!labelMenu.contains(e.target)&&!menuAnchor?.contains(e.target))closeLabelMenu();
  });
  function refreshControls() {
    closeLabelMenu();
    if(index===null)return;
    annotate.classList.toggle('active',mode);annotate.ariaPressed=String(mode);
    annotate.innerHTML=mode?ICONS.check:ICONS.edit+'<span>Anotar</span>';
    annotate.title=annotate.ariaLabel=saving?'Guardando…':mode?'Confirmar anotación':'Modo de anotación';
    historyBar.hidden=cancel.hidden=!mode;undo.disabled=!draft().undo.length;redo.disabled=!draft().redo.length;
    palette.hidden=!mode;palette.replaceChildren();
    if(mode){
      const labels=draft().state.labels;
      labels.forEach(name=>{
        const b=element('button',{className:'wang-label-swatch',title:name,ariaLabel:`Etiqueta de anotación ${name}`});
        b.style.setProperty('--label-color',draft().state.colors[name]);b.classList.toggle('active',name===label);
        b.setAttribute('aria-pressed',String(name===label));
        b.setAttribute('aria-expanded','false');
        b.onclick=()=>{if(label===name){openLabelMenu(b);return;}label=name;message='';refreshControls();draw();};palette.append(b);
      });
      const add=element('button',{innerHTML:ICONS.plus,title:'Añadir etiqueta',ariaLabel:'Añadir etiqueta',className:'wang-float-icon'});
      add.disabled=labels.length>=64;
      add.onclick=()=>{
        let number=1;while(labels.includes(`Etiqueta${number}`))number++;
        const value=`Etiqueta${number}`;checkpoint();
        draft().state.labels.push(value);draft().state.colors[value]=DEFAULT_LABEL_COLORS[(labels.length-1)%DEFAULT_LABEL_COLORS.length];
        label=value;message='';persist();refreshControls();draw();
      };
      const erase=element('button',{innerHTML:ICONS.erase,title:'Borrar anotaciones',ariaLabel:'Borrar anotaciones',className:'wang-float-icon wang-erase'});erase.classList.toggle('active',label===null);
      erase.onclick=()=>{label=null;refreshControls();draw();};palette.append(add);palette.prepend(erase);
    }
    updateStatus();
  }
  function updateStatus() {
    const pattern=tools.terrain===index?tools.wangBrush.pattern:null;
    const text=message||(!mode&&pattern?`Pincel combinado ${pattern.width} × ${pattern.height} · Dibujar / rellenar / formas`:'');
    status.hidden=!text;
    status.textContent=text;
  }
  function resize() {
    if(!visible) return;
    const r=viewport.getBoundingClientRect();
    if(r.width<2||r.height<2)return;
    if(!needsFit){x+=(r.width-width)/2;y+=(r.height-height)/2;}
    width=r.width;height=r.height;
    const dpr=devicePixelRatio||1;canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);
    if(needsFit) {
      const img=sheets[index];scale=Math.min(2,Math.max(.5,(width-24)/img.width));
      x=(width-img.width*scale)/2;y=12;needsFit=false;
    }
    positionLabelMenu();draw();
  }
  function draw() {
    if(index===null||!visible)return;
    const dpr=devicePixelRatio||1;ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,width,height);
    ctx.imageSmoothingEnabled=false;ctx.drawImage(sheets[index],x,y,sheets[index].width*scale,sheets[index].height*scale);
    if(mode){ctx.fillStyle='rgba(0,0,0,.45)';ctx.fillRect(x,y,sheets[index].width*scale,sheets[index].height*scale);}
    const def=terrain().wang, size=T*scale;
    // Nine translucent annotation cells leave the underlying art visible.
    for(let i=0;i<def.tiles.length;i++){
      if(!wangTilePlaceable(def.tiles[i]))continue;
      const px=x+i%def.columns*size,py=y+Math.floor(i/def.columns)*size;
      if(px+size<0||py+size<0||px>width||py>height)continue;
      if(mode){
        drawAnnotationDual(ctx,draft().state.cells[i],draft().state.colors,px,py,size,label);
        if(hover?.tile===i){
          const step=size/3,p=hover.cell;
          ctx.fillStyle='rgba(255,255,255,.12)';ctx.fillRect(px+(p%3)*step,py+Math.floor(p/3)*step,step,step);
        }
      }else{
        ctx.lineWidth=1;ctx.strokeStyle='rgba(255,255,255,.20)';ctx.strokeRect(px,py,size,size);
        const rect=gesture?.selecting?gesture.rect:selectedRect;
        const chosen=rect?i%def.columns>=rect.left&&i%def.columns<=rect.right&&Math.floor(i/def.columns)>=rect.top&&Math.floor(i/def.columns)<=rect.bottom:i===selected;
        if(chosen){ctx.fillStyle='rgba(242,196,85,.2)';ctx.fillRect(px,py,size,size);}
        if(chosen||i===hover?.tile){ctx.strokeStyle=chosen?'#f2c455':'#fff';ctx.lineWidth=2;ctx.strokeRect(px+1,py+1,size-2,size-2);}
      }
    }
    updateStatus();
  }
  function hit(px,py) {
    if(index===null)return null;
    const gx=(px-x)/scale/T,gy=(py-y)/scale/T,c=Math.floor(gx),r=Math.floor(gy),def=terrain().wang;
    const tile=r*def.columns+c;
    if(c<0||c>=def.columns||r<0||tile>=def.tiles.length||!wangTilePlaceable(def.tiles[tile]))return null;
    return {tile,cell:Math.min(2,Math.floor((gy-r)*3))*3+Math.min(2,Math.floor((gx-c)*3))};
  }
  const point=e=>{const r=viewport.getBoundingClientRect();return [e.clientX-r.left,e.clientY-r.top];};
  function atlasCell(px,py) {
    const def=terrain().wang;
    const c=Math.max(0,Math.min(def.columns-1,Math.floor((px-x)/scale/T)));
    const r=Math.max(0,Math.min(Math.ceil(def.tiles.length/def.columns)-1,Math.floor((py-y)/scale/T)));
    return r*def.columns+c;
  }
  function selectionRect(a,b) {
    const columns=terrain().wang.columns;
    return {left:Math.min(a%columns,b%columns),right:Math.max(a%columns,b%columns),top:Math.min(Math.floor(a/columns),Math.floor(b/columns)),bottom:Math.max(Math.floor(a/columns),Math.floor(b/columns))};
  }
  function mark(h){if(!h)return;const d=draft();if(d.state.cells[h.tile][h.cell]===label)return;d.state.cells[h.tile][h.cell]=label;message='';}
  viewport.onpointerdown=e=>{
    if(gesture||![0,1,2].includes(e.button))return;
    viewport.focus();e.preventDefault();viewport.setPointerCapture(e.pointerId);
    const [px,py]=point(e);
    gesture={px,py,x,y,pan:true,moved:false,before:null,last:[px,py]};
    if(!mode&&!space&&e.button===0&&hit(px,py)){
      const start=gesture;
      pressTimer=setTimeout(()=>{
        pressTimer=null;if(gesture!==start||gesture.moved||space||mode)return;
        gesture.pan=false;gesture.selecting=true;gesture.start=atlasCell(px,py);gesture.end=gesture.start;
        gesture.rect=selectionRect(gesture.start,gesture.end);viewport.classList.add('painting');draw();
      },250);
    }
    if(mode&&!space&&e.button===0){
      const start=gesture;
      pressTimer=setTimeout(()=>{
        pressTimer=null;if(gesture!==start||gesture.moved||space||!mode)return;
        gesture.pan=false;gesture.before=structuredClone(draft().state);
        viewport.classList.add('painting');mark(hit(px,py));draw();
      },200);
    }
  };
  viewport.onpointermove=e=>{
    const [px,py]=point(e);hover=hit(px,py);
    if(gesture){
      if(Math.hypot(px-gesture.px,py-gesture.py)>5){gesture.moved=true;clearTimeout(pressTimer);pressTimer=null;}
      if(gesture.pan){
        if(gesture.moved){x=gesture.x+px-gesture.px;y=gesture.y+py-gesture.py;}
      }else if(gesture.selecting){
        gesture.end=atlasCell(px,py);gesture.rect=selectionRect(gesture.start,gesture.end);
      }else{
        // Sample along the stroke so fast motion cannot skip annotation cells.
        const [lx,ly]=gesture.last,n=Math.max(1,Math.ceil(Math.hypot(px-lx,py-ly)/Math.max(1,T*scale/9)));
        for(let k=1;k<=n;k++)mark(hit(lx+(px-lx)*k/n,ly+(py-ly)*k/n));
      }
      gesture.last=[px,py];
    }
    draw();
  };
  function finish(e,cancel=false){
    clearTimeout(pressTimer);pressTimer=null;viewport.classList.remove('painting');
    if(!gesture)return;
    if(gesture.selecting){
      if(!cancel){
        gesture.end=atlasCell(...point(e));
        const pattern=wangPatternForRect(terrain(),gesture.start,gesture.end);
        if(pattern.tiles.some(Boolean)){
          activate();selected=null;selectedRect=selectionRect(gesture.start,gesture.end);tools.wangBrush={pattern};message='';changed();
        }
      }
    }else if(gesture.before){
      if(cancel)draft().state=gesture.before;
      else if(JSON.stringify(gesture.before)!==JSON.stringify(draft().state)){draft().redo=[];draft().undo.push(gesture.before);if(draft().undo.length>100)draft().undo.shift();persist();}
    } else if(!cancel&&!mode&&!space&&!gesture.moved&&e.button===0){
      const h=hit(...point(e));if(h){const tile=terrain().wang.tiles[h.tile],brush=wangBrushForTile(terrain(),tile);if(!brush){message='Anota primero el centro de este tile';}else{activate();selectedRect=null;selected=h.tile;tools.wangBrush=brush;message='';changed();}}
      else {
        selected=null;selectedRect=null;hover=null;message='';
        tools.wangBrush={};tools.terrain=null;changed();
      }
    }
    gesture=null;refreshControls();draw();
  }
  viewport.onpointerup=e=>finish(e);viewport.onpointercancel=e=>finish(e,true);
  viewport.oncontextmenu=e=>e.preventDefault();
  viewport.onpointerleave=()=>{hover=null;draw();};
  viewport.addEventListener('wheel',e=>{
    e.preventDefault();e.stopPropagation();const [px,py]=point(e),old=scale;
    scale=Math.max(.05,Math.min(20,scale*Math.exp(-e.deltaY*.002)));x=px-(px-x)*scale/old;y=py-(py-y)*scale/old;draw();
  },{passive:false});
  root.addEventListener('keydown',e=>{
    e.stopPropagation();if(e.key==='Escape'&&!labelMenu.hidden){e.preventDefault();closeLabelMenu();return;}if(e.target===viewport && e.code==='Space'){e.preventDefault();space=true;viewport.classList.add('panning');}
    if((e.ctrlKey||e.metaKey)&&mode&&['z','y'].includes(e.key.toLowerCase())){e.preventDefault();(e.shiftKey||e.key.toLowerCase()==='y'?redo:undo).click();}
  });
  root.addEventListener('keyup',e=>{e.stopPropagation();if(e.code==='Space'){space=false;viewport.classList.remove('panning');}});
  viewport.onblur=()=>{space=false;viewport.classList.remove('panning');if(gesture)finish({},true);};
  viewport.onlostpointercapture=e=>{if(gesture)finish(e,true);};
  annotate.onclick=()=>mode?commit():setMode(true);
  function replay(from,to){
    const previous=draft()[from].pop();if(!previous)return;
    draft()[to].push(structuredClone(draft().state));draft().state=previous;
    if(label!==null&&!previous.labels.includes(label))label=previous.labels[0];persist();refreshControls();draw();
  }
  undo.onclick=()=>replay('undo','redo');
  redo.onclick=()=>replay('redo','undo');
  cancel.onclick=()=>{
    draft().state=annotationState(terrain().wang);draft().undo=[];draft().redo=[];persist();setMode(false);
  };
  async function commit(){
    if(saving)return;
    const t=terrain(),d=draft();
    if(!d.changed){setMode(false);return;}
    saving=true;message='Guardando anotaciones…';refreshControls();root.inert=true;
    try{
      const result=await saveAnnotationFile(t,JSON.parse(d.signature),d.state);
      t.wang=result.wang;
      const entry=t.packManifest.terrains.find(e=>e.name===t.packTerrainName);entry.wang=structuredClone(result.wang);
      d.signature=JSON.stringify(t.wang);d.state=annotationState(t.wang);d.undo=[];d.redo=[];persist();
      const center=tools.wangBrush.center;
      selectedRect=null;
      tools.wangBrush=t.placement==='tile'
        ? wangBrushForTile(t,t.wang.tiles[selected]??t.wang.tiles.find(wangTilePlaceable))??{}
        : {center:t.wang.labels.includes(center)?center:t.wang.tiles.find(tile=>wangTilePlaceable(tile)&&tile.annotations?.[4]!=null)?.annotations[4]??t.wang.boundary};
      if(t.placement!=='tile')selected=null;
      annotationsSaved?.(index);
      setMode(false);message=result.message??'Anotaciones guardadas en el paquete';
    }catch(error){message=error.name==='AbortError'?'Guardado cancelado; se conserva el borrador.':`Error al guardar: ${error.message} Se conserva el borrador.`;}
    finally{saving=false;root.inert=false;refreshControls();draw();}
  }
  new ResizeObserver(resize).observe(viewport);
  return {el:root,canSwitch:()=>!saving,show(list){
    visible=list.length>0;document.body.classList.toggle('wang-atlas-open',visible);
    if(!visible){closeLabelMenu();if(mode)modeChanged?.(false);mode=false;root.classList.remove('annotating');document.body.classList.remove('wang-annotating');return;}
    indices=list;
    if(!indices.includes(index))setTerrain(indices.includes(tools.terrain)?tools.terrain:indices[0]);
    else if(tools.terrain!==index)setTerrain(index);
    else resize();
    requestAnimationFrame(resize);
  }};
}
