(async () => {
'use strict';
const $ = selector => document.querySelector(selector);
let store;
const definitions = BuildaNodes.definitions;
const id = new URLSearchParams(location.search).get('project');
let project, selected = null, mode = 'map', running = false, preview = null;
let pending = null, frame = 0, lastTime = 0, dirty = false, toastTimer;
let mapReady = false, mapLoaded = false, mapLoadTimer = 0, mapFlushPending = null, viewRequest = 0;
const undo = [], redo = [], images = new Map();
const canvas = $('#sceneCanvas'), ctx = canvas.getContext('2d');

function blocked(message) {
  running = false; cancelAnimationFrame(frame);
  $('#missingReason').textContent = message;
  if (!$('#missingDialog').open) $('#missingDialog').showModal();
}
try { store = await BuildaStore.connect(); project = id && await store.get(id); } catch (error) { blocked(error.message); return; }
if (!project) { blocked('Selecciona o crea un proyecto desde la lista de Proyectos. Abrir esta dirección no crea ninguno.'); return; }
function notify(message) {
  $('#toast').textContent = message; $('#toast').classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => $('#toast').classList.remove('show'), 4500);
}
const copy = value => JSON.parse(JSON.stringify(value));
const def = node => definitions.find(d => d.id === node.type);
const isObject = node => ['sprite','camera'].includes(node.type);
let saveQueue = Promise.resolve(true), changeNumber = 0;
function save() {
  const generation = ++changeNumber;
  dirty = true; $('#saveState').textContent = 'Guardando…';
  saveQueue = saveQueue.then(async () => {
    try {
      const result = await store.save(copy(project)); project.revision = result.revision;
      if (generation === changeNumber) { dirty = false; $('#saveState').textContent = 'Guardado'; }
      return true;
    } catch (error) {
      dirty = true; $('#saveState').textContent = 'Sin guardar'; notify(error.message); return false;
    }
  });
  return saveQueue;
}
function edit(fn) {
  if (running) { notify('Detén la ejecución para editar.'); return; }
  undo.push(copy(project)); if (undo.length > 30) undo.shift(); redo.length = 0;
  fn(); dirty = true; save(); refresh();
}
function history(from, to) {
  if (running || !from.length) return;
  const revision = project.revision;
  to.push(copy(project)); project = from.pop(); project.revision = revision; selected = null;
  save(); refresh();
}
function field(host, label, value, callback, type = 'text', options) {
  const row = document.createElement('label'); row.className = 'property-row';
  const caption = document.createElement('span'); caption.textContent = label;
  const input = document.createElement(options ? 'select' : 'input');
  if (options) {
    options.forEach(([value, title]) => {
      const option = document.createElement('option'); option.value = value; option.textContent = title; input.append(option);
    });
  } else input.type = type;
  if (type === 'checkbox') input.checked = Boolean(value); else input.value = value ?? '';
  input.disabled = running;
  input.onchange = () => {
    if (type === 'number' && !Number.isFinite(input.valueAsNumber)) { refresh(); return; }
    callback(type === 'checkbox' ? input.checked : type === 'number' ? input.valueAsNumber : input.value);
  };
  row.append(caption, input); host.append(row); return input;
}
function section(title) {
  const element = document.createElement('section'); element.className = 'inspector-section';
  const heading = document.createElement('h3'); heading.textContent = title; element.append(heading); $('#inspector').append(element); return element;
}
function paragraph(host, text) { const p = document.createElement('p'); p.className = 'help'; p.textContent = text; host.append(p); }
function showPanel(panel) {
  document.querySelectorAll('[data-panel]').forEach(b => b.classList.toggle('active', b.dataset.panel === panel));
  $('#scenePanel').classList.toggle('hidden', panel !== 'scene'); $('#nodesPanel').classList.toggle('hidden', panel !== 'nodes');
}
function library() {
  const term = $('#nodeSearch').value.toLocaleLowerCase('es');
  $('#nodeLibrary').replaceChildren();
  for (const definition of definitions.filter(d =>
    (mode === 'scene' ? d.category === 'scene' : mode === 'logic' ? d.category !== 'scene' : true) &&
    (d.name + d.description).toLocaleLowerCase('es').includes(term))) {
    const button = document.createElement('button'); button.className = 'node-item'; button.disabled = running;
    const icon = document.createElement('span'); icon.className = 'node-glyph'; icon.innerHTML = BuildaNodes.icon(definition.icon);
    const text = document.createElement('span'), title = document.createElement('b'), detail = document.createElement('small');
    title.textContent = definition.name; detail.textContent = definition.description; text.append(title, detail);
    button.append(icon, text); button.onclick = () => add(definition); $('#nodeLibrary').append(button);
  }
}
function add(definition) {
  const n = {id:BuildaStore.id(),type:definition.id,name:definition.name,x:80,y:80,width:64,height:64,color:'#d2d9dc',
    gx:80+(project.nodes.filter(n=>!isObject(n)).length%4)*250,gy:70+Math.floor(project.nodes.filter(n=>!isObject(n)).length/4)*160,
    key:'Space',target:project.nodes.find(n=>n.type==='sprite')?.id || '',property:'x',value:100,dx:100,dy:0,condition:true};
  edit(() => { project.nodes.push(n); selected = n.id; });
  setMode(isObject(n) ? 'scene' : 'logic');
  if (window.innerWidth <= 700) $('.stage-area').scrollIntoView({behavior:'smooth',block:'start'});
}
function tree() {
  $('#entityList').replaceChildren();
  const visible = project.nodes.filter(node => mode === 'logic' ? !isObject(node) : isObject(node));
  if (!visible.length) paragraph($('#entityList'), mode === 'logic' ? 'Todavía no hay nodos de lógica. Usa Añadir.' : 'Escena vacía. Usa + para añadir un objeto.');
  for (const node of visible) {
    const row = document.createElement('button'); row.className = 'entity-row' + (node.id === selected ? ' selected' : '');
    const icon = document.createElement('span'); icon.className = 'entity-icon'; icon.innerHTML = BuildaNodes.icon(def(node)?.icon);
    const text = document.createElement('span'); text.textContent = node.name;
    row.append(icon, text); row.onclick = () => { selected = node.id; setMode(isObject(node) ? 'scene' : 'logic'); refresh(); };
    $('#entityList').append(row);
  }
  $('#selectScene').classList.toggle('selected', !selected && mode === 'scene');
}
function inspector() {
  $('#inspector').replaceChildren();
  const node = project.nodes.find(n=>n.id===selected);
  $('#inspectorTitle').textContent = node?.name || 'Escena principal';
  if (!node) {
    if (mode === 'logic') {
      $('#inspectorTitle').textContent = 'Lógica';
      paragraph(section('NODOS'), 'Selecciona un nodo del grafo para editarlo o añade uno desde el panel izquierdo.');
      return;
    }
    const host = section('ESCENA');
    field(host,'Ancho',project.scene.width,value=>edit(()=>project.scene.width=Math.max(64,Math.min(4096,value))),'number');
    field(host,'Alto',project.scene.height,value=>edit(()=>project.scene.height=Math.max(64,Math.min(4096,value))),'number');
    field(host,'Fondo',project.scene.background,value=>edit(()=>project.scene.background=value),'color');
    paragraph(host,'La cámara define el origen visible durante la ejecución. Las posiciones se guardan por proyecto.');
    return;
  }
  const host = section('GENERAL');
  field(host,'Nombre',node.name,value=>edit(()=>node.name=value.trim().slice(0,80)||node.name));
  paragraph(host,def(node)?.description || 'Nodo de una versión anterior. Sus datos se conservan.');
  if (isObject(node)) {
    const transform = section('TRANSFORMACIÓN');
    for (const [key,label] of [['x','Posición X'],['y','Posición Y'],['width','Ancho'],['height','Alto']]) {
      field(transform,label,node[key] ?? (key==='width'||key==='height'?64:0),value=>edit(()=>node[key]=['width','height'].includes(key)?Math.max(1,value):value),'number');
    }
    if (node.type==='sprite') {
      field(transform,'Color',node.color||'#d2d9dc',value=>edit(()=>node.color=value),'color');
      field(transform,'Imagen',node.assetId||'',value=>edit(()=>node.assetId=value),'text',[['','Sin imagen'],...project.assets.map(a=>[a.id,a.name])]);
    }
  } else {
    const props = section('COMPORTAMIENTO');
    if (node.type==='on-input') field(props,'Tecla',node.key||'Space',value=>edit(()=>node.key=value),'text',[['Space','Espacio'],['ArrowLeft','Flecha izquierda'],['ArrowRight','Flecha derecha'],['ArrowUp','Flecha arriba'],['ArrowDown','Flecha abajo'],['KeyA','A'],['KeyD','D'],['KeyW','W'],['KeyS','S']]);
    if (['move','set-property'].includes(node.type)) {
      field(props,'Destino',node.target||'',value=>edit(()=>node.target=value),'text',[['','Elige un Sprite'],...project.nodes.filter(n=>n.type==='sprite').map(n=>[n.id,n.name])]);
    }
    if (node.type==='move') {
      field(props,'Velocidad X',node.dx??100,value=>edit(()=>node.dx=value),'number');
      field(props,'Velocidad Y',node.dy??0,value=>edit(()=>node.dy=value),'number');
    }
    if (node.type==='set-property') {
      field(props,'Propiedad',node.property||'x',value=>edit(()=>{node.property=value;node.value=value==='color'?'#dddddd':100;}),'text',[['x','Posición X'],['y','Posición Y'],['width','Ancho'],['height','Alto'],['color','Color']]);
      field(props,'Valor',node.value??100,value=>edit(()=>node.value=value),node.property==='color'?'color':'number');
    }
    if (node.type==='branch') field(props,'Verdadero',node.condition,value=>edit(()=>node.condition=value),'checkbox');
  }
  const remove = document.createElement('button'); remove.className = 'delete-node'; remove.textContent = 'Eliminar nodo'; remove.disabled = running;
  remove.onclick = removeSelected; $('#inspector').append(remove);
}
function removeSelected() {
  if (!selected) return;
  edit(()=> {
    project.nodes = project.nodes.filter(n=>n.id!==selected);
    project.connections = project.connections.filter(c=>c.from!==selected&&c.to!==selected);
    project.nodes.forEach(n=>{if(n.target===selected)n.target='';}); selected=null;
  });
}
function getImage(asset) {
  if (!asset) return null;
  if (!images.has(asset.id)) {
    const image = new Image(); image.onload=draw; image.onerror=()=>notify('No se pudo leer la imagen: '+asset.name);
    images.set(asset.id,image);image.src=asset.data;
  }
  return images.get(asset.id);
}
function draw() {
  const data = preview || project; if(!data) return;
  if(canvas.width!==data.scene.width) canvas.width=data.scene.width;
  if(canvas.height!==data.scene.height) canvas.height=data.scene.height;
  ctx.clearRect(0,0,canvas.width,canvas.height); ctx.fillStyle=data.scene.background;ctx.fillRect(0,0,canvas.width,canvas.height);ctx.imageSmoothingEnabled=false;
  const camera=running?data.nodes.find(n=>n.type==='camera'):null;
  ctx.save();if(camera)ctx.translate(-(camera.x||0),-(camera.y||0));
  for(const node of data.nodes.filter(isObject)) {
    const x=node.x||0,y=node.y||0,w=Math.max(1,node.width||64),h=Math.max(1,node.height||64);
    if(node.type==='sprite') {
      const image=getImage(data.assets.find(a=>a.id===node.assetId));
      if(image?.complete&&image.naturalWidth)ctx.drawImage(image,x,y,w,h);
      else {ctx.fillStyle=node.color||'#d2d9dc';ctx.fillRect(x,y,w,h);}
    }
    if(!running&&(node.id===selected||node.type==='camera')) {
      ctx.strokeStyle=node.id===selected?'#ffffff':'#87969f';ctx.lineWidth=2;ctx.setLineDash(node.type==='camera'?[8,5]:[]);ctx.strokeRect(x-2,y-2,w+4,h+4);ctx.setLineDash([]);
    }
  }
  ctx.restore();
}
function fit() {
  if (mode === 'logic') { $('#logicView').scrollTo(0, 0); return; }
  if (mode !== 'scene') return;
  const available=$('#sceneView').getBoundingClientRect();
  const scale=Math.max(.01,Math.min((available.width-48)/project.scene.width,(available.height-48)/project.scene.height));
  canvas.style.width=project.scene.width*scale+'px';canvas.style.height=project.scene.height*scale+'px';
}
function ensureMapLoaded() {
  if (mapLoaded) return;
  mapLoaded = true;
  $('#mapLoading').hidden = false;
  $('#mapEditor').src = 'build/tilemap-editor.html?embed=1&project=' + encodeURIComponent(project.id);
  mapLoadTimer = setTimeout(() => {
    if (!mapReady) $('#mapLoading').replaceChildren('El mapa tardó demasiado en abrirse. Recarga el editor para intentarlo de nuevo.');
  }, 12000);
}
function flushMap() {
  if (!mapLoaded || !mapReady) return Promise.resolve(true);
  if (mapFlushPending) return mapFlushPending.promise;
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  const timer = setTimeout(() => entry.finish(false), 7000);
  const entry = {promise, finish(ok) {
    if (mapFlushPending !== entry) return;
    clearTimeout(timer); mapFlushPending = null; resolve(ok);
  }};
  mapFlushPending = entry;
  try { $('#mapEditor').contentWindow.postMessage({type:'builda-map-flush',project:project.id},'*'); }
  catch { entry.finish(false); }
  return promise;
}
async function switchMode(next) {
  if (next === mode) return;
  const request = ++viewRequest;
  if (mode === 'map' && !await flushMap()) { notify('No se pudo guardar el mapa. Sigue en Mapa e inténtalo otra vez.'); return; }
  if (request !== viewRequest) return;
  setMode(next);
}
function setMode(next) {
  if (running && next === 'map') { notify('Detén la prueba para volver al mapa.'); return; }
  mode=next;pending=null;
  const selectedNode=project.nodes.find(node=>node.id===selected);
  if ((mode==='scene'&&selectedNode&&!isObject(selectedNode))||(mode==='logic'&&selectedNode&&isObject(selectedNode))) selected=null;
  $('.editor-body').className='editor-body mode-'+mode;
  document.querySelectorAll('[data-mode]').forEach(b=>{const active=b.dataset.mode===mode;b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active));});
  // El canvas del mapa debe conservar su tamaño al cambiar de vista.
  $('#mapView').classList.toggle('inactive',mode!=='map');
  $('#mapView').inert=mode!=='map';
  $('#mapView').setAttribute('aria-hidden',String(mode!=='map'));
  for(const view of ['scene','logic','assets']) $('#'+view+'View').hidden=view!==mode;
  $('#stageLabel').textContent={map:'Mapa del proyecto',scene:running?'Vista de juego':'Escena principal',logic:'Lógica visual',assets:'Recursos'}[mode];
  $('#stageDescription').textContent={map:'Pinta y organiza las capas',scene:'Objetos y cámara de la escena',logic:'Eventos y acciones conectados',assets:'Imágenes del proyecto'}[mode];
  $('#viewHelp').textContent=running?'Esc para detener · La prueba no modifica el proyecto':{map:'El mapa se guarda aquí · La vista de juego todavía no lo dibuja',scene:'Arrastra objetos · Supr para eliminar',logic:'Conecta salida con entrada · Clic en una línea para quitarla',assets:'PNG, JPEG o WebP · Hasta 2 MB por imagen'}[mode];
  $('#fit').hidden=mode==='assets'||mode==='map';
  $('#stageAdd').textContent=mode==='logic'?'+ Añadir nodo':'+ Añadir objeto';
  $('#nodeSearch').placeholder=mode==='logic'?'Buscar nodos de lógica':'Buscar objetos';
  $('#nodeSearch').setAttribute('aria-label',$('#nodeSearch').placeholder);
  $('#treeTitle').textContent=mode==='logic'?'NODOS DEL GRAFO':'OBJETOS DE ESCENA';
  $('#selectScene').hidden=mode==='logic';
  if(mode==='scene')showPanel('scene');else if(mode==='logic')showPanel('nodes');
  if(mode==='map')ensureMapLoaded();
  refresh();
}
function graph() {
  const host=$('#graphNodes');host.replaceChildren();
  const nodes=project.nodes.filter(n=>!isObject(n));$('#graphHint').hidden=nodes.length>0;
  nodes.forEach((node,index)=>{
    const definition=def(node);const card=document.createElement('article');
    card.className='graph-node'+(node.id===selected?' selected':'');card.dataset.id=node.id;
    card.style.left=(node.gx??80+index*230)+'px';card.style.top=(node.gy??80)+'px';
    const header=document.createElement('div');header.className='graph-header';header.textContent=node.name;
    const ports=document.createElement('div');ports.className='graph-ports';
    function port(direction,label) {
      const wrapper=document.createElement('div');wrapper.className='port-label '+(direction==='out'?'out':'');
      const button=document.createElement('button');button.className='port';button.dataset.node=node.id;button.dataset.port=label;button.dataset.direction=direction;
      button.title=(direction==='out'?'Salida':'Entrada')+' · '+node.name+' · '+label;button.setAttribute('aria-label',button.title);
      if(pending?.node===node.id&&pending.port===label)button.classList.add('pending');
      const caption=document.createElement('span');caption.textContent=label==='in'?'Entrada':label==='out'?'Salida':label==='true'?'Sí':'No';
      if(direction==='out')wrapper.append(caption,button);else wrapper.append(button,caption);
      button.onpointerdown=event=>{event.stopPropagation();if(running)return;if(!pending)pending={node:node.id,port:label,direction};};
      button.onclick=()=>connect({node:node.id,port:label,direction});
      return wrapper;
    }
    if(definition?.inputs?.length) ports.append(port('in','in'));
    const outputs=document.createElement('div');outputs.className='outputs';
    (definition?.outputs||[]).forEach(name=>outputs.append(port('out',name)));ports.append(outputs);
    card.append(header,ports);
    card.onclick=event=>{if(!event.target.closest('.port')){selected=node.id;tree();inspector();host.querySelectorAll('.graph-node').forEach(c=>c.classList.toggle('selected',c===card));draw();}};
    header.onpointerdown=event=>{
      if(running||event.button!==0)return;
      const startX=event.clientX,startY=event.clientY,x=parseFloat(card.style.left),y=parseFloat(card.style.top);let moved=false;
      header.setPointerCapture(event.pointerId);
      header.onpointermove=e=>{
        if(Math.hypot(e.clientX-startX,e.clientY-startY)>3)moved=true;
        if(!moved)return;
        card.style.left=Math.max(10,x+e.clientX-startX)+'px';card.style.top=Math.max(10,y+e.clientY-startY)+'px';wires();
      };
      const end=()=>{
        header.onpointermove=null;header.onpointerup=null;header.onpointercancel=null;
        if(moved)edit(()=>{node.gx=parseFloat(card.style.left);node.gy=parseFloat(card.style.top);});
      };header.onpointerup=end;header.onpointercancel=end;
    };
    host.append(card);
  });
  requestAnimationFrame(wires);
}
function connect(port) {
  if(running)return;
  // El clic tras arrastrar un puerto se ignora si ya se completó la unión.
  if(suppressPortClick){suppressPortClick=false;return;}
  if(!pending){pending=port;graph();return;}
  if(pending.node===port.node&&pending.port===port.port){pending=port;graph();return;}
  if(pending.direction===port.direction){pending=port;graph();return;}
  const out=pending.direction==='out'?pending:port, input=pending.direction==='in'?pending:port;
  if(out.node===input.node){pending=null;notify('Conecta dos nodos diferentes.');return;}
  if(!project.connections.some(c=>c.from===out.node&&c.port===out.port&&c.to===input.node))edit(()=>project.connections.push({from:out.node,to:input.node,port:out.port}));
  pending=null;graph();
}
let suppressPortClick=false;
document.addEventListener('pointerup',event=>{
  const destination=document.elementFromPoint(event.clientX,event.clientY)?.closest('.port');
  if(!pending||!destination)return;
  const target={node:destination.dataset.node,port:destination.dataset.port,direction:destination.dataset.direction};
  if(target.node!==pending.node||target.port!==pending.port) {connect(target);suppressPortClick=true;setTimeout(()=>suppressPortClick=false,0);}
});
function wires() {
  const svg=$('#wires');svg.replaceChildren();
  const world=$('#graphWorld');if(mode!=='logic'||!world)return;
  let maxX=$('#logicView').clientWidth,maxY=$('#logicView').clientHeight;
  $('#graphNodes').querySelectorAll('.graph-node').forEach(n=>{maxX=Math.max(maxX,n.offsetLeft+260);maxY=Math.max(maxY,n.offsetTop+180);});
  world.style.width=maxX+'px';world.style.height=maxY+'px';
  const bounds=world.getBoundingClientRect();
  function point(node,direction,port) {
    const element=[...document.querySelectorAll('.port')].find(p=>p.dataset.node===node&&p.dataset.direction===direction&&p.dataset.port===port);
    if(!element)return null;const r=element.getBoundingClientRect();return{x:r.left+r.width/2-bounds.left,y:r.top+r.height/2-bounds.top};
  }
  for(const connection of project.connections) {
    const a=point(connection.from,'out',connection.port),b=point(connection.to,'in','in');if(!a||!b)continue;
    const path=document.createElementNS('http://www.w3.org/2000/svg','path'),bend=Math.max(65,Math.abs(b.x-a.x)/2);
    path.setAttribute('d','M'+a.x+' '+a.y+' C'+(a.x+bend)+' '+a.y+','+(b.x-bend)+' '+b.y+','+b.x+' '+b.y);
    path.onclick=()=>{if(!running)edit(()=>project.connections=project.connections.filter(c=>c!==connection));};
    const title=document.createElementNS('http://www.w3.org/2000/svg','title');title.textContent='Quitar conexión';path.append(title);svg.append(path);
  }
}
function assets() {
  const host=$('#assetList');host.replaceChildren();
  if(!project.assets.length)paragraph(host,'No hay imágenes importadas todavía.');
  for(const asset of project.assets) {
    const card=document.createElement('article');card.className='asset-card';
    const img=document.createElement('img');img.src=asset.data;img.alt=asset.name;
    const title=document.createElement('p');title.textContent=asset.name;
    const use=document.createElement('button');use.textContent='Crear Sprite';use.onclick=()=>{
      const definition=definitions.find(d=>d.id==='sprite');
      if(running)return;add(definition);
      edit(()=>{const node=project.nodes.find(n=>n.id===selected);node.assetId=asset.id;node.name=asset.name;});
    };
    const remove=document.createElement('button');remove.textContent='Quitar recurso';remove.onclick=()=>{
      if(project.nodes.some(n=>n.assetId===asset.id)){notify('El recurso está en uso. Quita la imagen de sus sprites primero.');return;}
      edit(()=>project.assets=project.assets.filter(a=>a.id!==asset.id));
    };card.append(img,title,use,remove);host.append(card);
  }
}
function refresh() {
  $('#projectName').textContent=project.name;document.title=project.name+' · Asternal Editor';
  const objects=project.nodes.filter(isObject).length,logicNodes=project.nodes.length-objects,connections=project.connections.length;
  $('#nodeStatus').textContent=mode==='map'?'Mapa del proyecto':mode==='assets'?project.assets.length+(project.assets.length===1?' imagen':' imágenes'):mode==='logic'?logicNodes+(logicNodes===1?' nodo de lógica':' nodos de lógica')+' · '+connections+(connections===1?' conexión':' conexiones'):objects+(objects===1?' objeto':' objetos');
  $('#undo').disabled=running||!undo.length;$('#redo').disabled=running||!redo.length;
  tree();library();inspector();graph();assets();fit();draw();
}
function runState(active) {
  $('#runLabel').textContent=active?'Detener':'Probar escena';
  $('#runIcon').innerHTML=active?'<rect x="6" y="6" width="12" height="12" rx="1"/>':'<path d="m8 5 11 7-11 7z"/>';
}
function stop() {
  running=false;preview=null;cancelAnimationFrame(frame);runState(false);
  $('.editor-shell').classList.remove('running');setMode('scene');
}
async function start() {
  if(running){stop();return;}
  if(mode==='map'&&!await flushMap()){notify('Guarda el mapa antes de probar la escena.');return;}
  const errors=BuildaPreview.validate(project);if(errors.length){notify(errors.join(' '));return;}
  if(dirty&&!await saveQueue)return;
  preview=copy(project);running=true;BuildaPreview.dispatch(preview,'on-start',1/60);
  runState(true);$('.editor-shell').classList.add('running');
  setMode('scene');lastTime=performance.now();
  const tick=time=>{if(!running)return;const dt=Math.min((time-lastTime)/1000,.05);lastTime=time;
    try{BuildaPreview.dispatch(preview,'on-update',dt);draw();frame=requestAnimationFrame(tick);}
    catch(error){stop();notify(error.message);}
  };frame=requestAnimationFrame(tick);canvas.focus();
}
canvas.onpointerdown=event=>{
  if(running||event.button!==0)return;
  const bounds=canvas.getBoundingClientRect(),p={x:(event.clientX-bounds.left)*canvas.width/bounds.width,y:(event.clientY-bounds.top)*canvas.height/bounds.height};
  const node=[...project.nodes].reverse().find(n=>isObject(n)&&p.x>=(n.x||0)&&p.y>=(n.y||0)&&p.x<=(n.x||0)+(n.width||64)&&p.y<=(n.y||0)+(n.height||64));
  selected=node?.id||null;tree();inspector();draw();canvas.focus();if(!node)return;
  const x=node.x||0,y=node.y||0,before=copy(project);let moved=false;
  canvas.setPointerCapture(event.pointerId);
  canvas.onpointermove=e=>{const nextX=x+(e.clientX-event.clientX)*canvas.width/bounds.width,nextY=y+(e.clientY-event.clientY)*canvas.height/bounds.height;
    if(Math.abs(nextX-x)+Math.abs(nextY-y)>1)moved=true;if(moved){node.x=Math.round(nextX);node.y=Math.round(nextY);draw();}
  };
  const finish=()=>{canvas.onpointermove=null;canvas.onpointerup=null;canvas.onpointercancel=null;if(moved){undo.push(before);redo.length=0;save();refresh();}};
  canvas.onpointerup=finish;canvas.onpointercancel=finish;
};
$('#nodeSearch').oninput=library;
document.querySelectorAll('[data-panel]').forEach(b=>b.onclick=()=>showPanel(b.dataset.panel));
document.querySelectorAll('[data-mode]').forEach(b=>b.onclick=()=>switchMode(b.dataset.mode));
$('#addEntity').onclick=()=>showPanel('nodes');
$('#stageAdd').onclick=()=>{
  showPanel('nodes');
  if(window.innerWidth<=700) $('.left-panel').scrollIntoView({behavior:'smooth',block:'start'});
};
$('#selectScene').onclick=()=>{selected=null;refresh();};
$('#undo').onclick=()=>history(undo,redo);$('#redo').onclick=()=>history(redo,undo);$('#fit').onclick=fit;
$('#runButton').onclick=start;
$('#importAsset').onclick=()=>{if(!running)$('#assetInput').click();};
$('#assetInput').onchange=async event=>{
  const file=event.target.files[0];event.target.value='';if(!file)return;
  if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>2*1024*1024){notify('Usa una imagen PNG, JPEG o WebP de hasta 2 MB.');return;}
  try{
    const data=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(file);});
    const img=new Image();await new Promise((resolve,reject)=>{img.onload=resolve;img.onerror=reject;img.src=data;});
    edit(()=>project.assets.push({id:BuildaStore.id(),name:file.name,data}));
  }catch{notify('El archivo no contiene una imagen válida.');}
};
$('#projectName').onclick=()=>{if(running)return;$('#renameInput').value=project.name;$('#nameError').textContent='';$('#nameDialog').showModal();$('#renameInput').focus();};
$('#cancelRename').onclick=()=>$('#nameDialog').close();
$('#nameForm').onsubmit=async event=>{event.preventDefault();const name=$('#renameInput').value.trim();if(!name)return;
  edit(()=>project.name=name);await saveQueue;if(!dirty)$('#nameDialog').close();else $('#nameError').textContent='No se pudo guardar el nombre.';
};
$('.editor-brand .back').addEventListener('click',async event=>{
  const destination=event.currentTarget.href;
  event.preventDefault();
  if(mode==='map'&&!await flushMap()){notify('El mapa no se pudo guardar. Sigue en Mapa e inténtalo otra vez.');return;}
  await saveQueue;
  if(dirty){notify('Hay cambios sin guardar. Revisa el almacenamiento antes de salir.');return;}
  location.assign(destination);
});
window.addEventListener('message',async event=>{
  if(event.source!==$('#mapEditor').contentWindow||event.data?.project!==project.id)return;
  if(event.data.type==='builda-map-ready'){
    mapReady=true;clearTimeout(mapLoadTimer);$('#mapLoading').hidden=true;
  }
  if(event.data.type==='builda-map-request') {
    event.source.postMessage({type:'builda-map-load',project:project.id,text:project.tilemap||null},'*');
  }
  if(event.data.type==='builda-map-save'&&(typeof event.data.text==='string'||event.data.text===null)) {
    if(event.data.text!==project.tilemap){project.tilemap=event.data.text;save();}
    await saveQueue;
    event.source.postMessage({type:'builda-map-saved',project:project.id,ok:!dirty},'*');
    if(event.data.close)mapFlushPending?.finish(!dirty);
  }
});
window.addEventListener('keydown',event=>{
  if(event.target.closest('input,textarea,select')||document.querySelector('dialog[open]'))return;
  if(running){if(event.key==='Escape')stop();else if(!event.repeat){BuildaPreview.dispatch(preview,'on-input',1/60,event.code);draw();}return;}
  if(mode==='map'){
    if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='s'){event.preventDefault();flushMap();}
    return;
  }
  if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='s'){event.preventDefault();save();}
  if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='z'){event.preventDefault();event.shiftKey?history(redo,undo):history(undo,redo);}
  if((mode==='scene'||mode==='logic')&&(event.key==='Delete'||event.key==='Backspace')){event.preventDefault();removeSelected();}
  if((mode==='scene'||mode==='logic')&&event.key.toLowerCase()==='f')fit();
});
window.addEventListener('beforeunload',event=>{if(dirty){event.preventDefault();event.returnValue='';}});
window.addEventListener('builda-storage-changed',async()=>{await saveQueue;try{const latest=await store.get(id);if(!latest||latest.revision!==project.revision)blocked('Este proyecto cambió o se eliminó en otra pestaña. Vuelve a Proyectos para abrir su versión actual.');}catch(error){blocked(error.message);}});
new ResizeObserver(()=>{fit();wires();}).observe($('#stage'));
setMode('map');
})();
