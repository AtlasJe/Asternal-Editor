// Compact HSV picker: changes remain local until confirmed.
// Alpha is opt-in so Wang labels and existing map colors remain six-digit RGB.
export function parseHexColor(value){
  if(!/^#[0-9a-f]{6}([0-9a-f]{2})?$/i.test(value))throw Error('Color inválido');
  return {rgb:value.slice(1,7).match(/../g).map(v=>parseInt(v,16)/255),alpha:value.length===9?parseInt(value.slice(7),16)/255:1};
}
export function withColorAlpha(rgb,alpha){return rgb+Math.round(Math.max(0,Math.min(1,alpha))*255).toString(16).padStart(2,'0');}
export function createColorPicker(initial,onConfirm,{alpha:allowAlpha=false}={}){
  const {rgb,alpha:initialAlpha}=parseHexColor(initial);let alpha=allowAlpha?initialAlpha:1;
  const max=Math.max(...rgb),min=Math.min(...rgb),delta=max-min;
  let h=delta===0?0:max===rgb[0]?60*((rgb[1]-rgb[2])/delta%6):max===rgb[1]?60*((rgb[2]-rgb[0])/delta+2):60*((rgb[0]-rgb[1])/delta+4);
  h=(h+360)%360;let s=max===0?0:delta/max,v=max;
  const root=document.createElement('div');root.className='wang-color-picker';
  const field=document.createElement('div');field.className='wang-color-field';field.tabIndex=0;field.setAttribute('aria-label','Arrastra para ajustar saturación y brillo');
  const cursor=document.createElement('span');cursor.className='wang-color-cursor';field.append(cursor);
  const hue=document.createElement('input');hue.type='range';hue.min=0;hue.max=360;hue.step=1;hue.value=h;hue.className='wang-color-hue';hue.setAttribute('aria-label','Tono');
  const footer=document.createElement('div');footer.className='wang-color-footer';
  const comparison=document.createElement('div');comparison.className='wang-color-comparison';
  const original=document.createElement('span');original.className='wang-color-preview';original.style.backgroundColor=initial;original.title='Color original';original.setAttribute('aria-label','Color original');
  const preview=document.createElement('span');preview.className='wang-color-preview';preview.title='Color nuevo';preview.setAttribute('aria-label','Color nuevo');
  comparison.append(original,preview);
  const confirm=document.createElement('button');confirm.type='button';confirm.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l4 4L19 6"/></svg>';confirm.title='Confirmar color';confirm.className='wang-float-icon wang-color-confirm';confirm.setAttribute('aria-label','Confirmar color');
  footer.append(comparison,confirm);root.append(field,hue);
  let opacity,opacityValue;
  if(allowAlpha){
    const label=document.createElement('label');label.className='wang-color-opacity';
    const caption=document.createElement('span');caption.textContent='Opacidad';
    opacityValue=document.createElement('output');
    opacity=document.createElement('input');opacity.type='range';opacity.min=0;opacity.max=100;opacity.step=1;opacity.value=Math.round(alpha*100);opacity.setAttribute('aria-label','Opacidad');
    opacity.oninput=()=>{alpha=Number(opacity.value)/100;render();};
    const transparent=document.createElement('button');transparent.type='button';transparent.textContent='Transparente';transparent.onclick=()=>{alpha=0;render();};
    label.append(caption,opacityValue,opacity);root.append(label);footer.insertBefore(transparent,confirm);
  }
  root.append(footer);
  function hex(){
    const f=n=>{const k=(n+h/60)%6;return Math.round(255*(v-v*s*Math.max(0,Math.min(k,4-k,1)))).toString(16).padStart(2,'0');};
    return `#${f(5)}${f(3)}${f(1)}`;
  }
  function value(){return allowAlpha?withColorAlpha(hex(),alpha):hex();}
  function render(){field.style.setProperty('--hue',h);cursor.style.left=`${s*100}%`;cursor.style.top=`${(1-v)*100}%`;cursor.style.background=hex();preview.style.backgroundColor=value();if(opacity){opacity.value=Math.round(alpha*100);opacityValue.textContent=`${Math.round(alpha*100)}%`;opacity.style.setProperty('--opacity-color',hex());}}
  function move(e){const r=field.getBoundingClientRect();s=Math.max(0,Math.min(1,(e.clientX-r.left)/r.width));v=1-Math.max(0,Math.min(1,(e.clientY-r.top)/r.height));render();}
  let pointer=null;
  field.onpointerdown=e=>{if(e.button!==0)return;e.preventDefault();field.focus();pointer=e.pointerId;field.setPointerCapture(pointer);move(e);};
  field.onpointermove=e=>{if(e.pointerId===pointer)move(e);};
  field.onpointerup=field.onpointercancel=field.onlostpointercapture=()=>{pointer=null;};
  field.onkeydown=e=>{if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key))return;e.preventDefault();s=Math.max(0,Math.min(1,s+(e.key==='ArrowRight'?.02:e.key==='ArrowLeft'?-.02:0)));v=Math.max(0,Math.min(1,v+(e.key==='ArrowUp'?.02:e.key==='ArrowDown'?-.02:0)));render();};
  hue.oninput=()=>{h=Number(hue.value);render();};
  confirm.onclick=()=>onConfirm(value());render();return root;
}
