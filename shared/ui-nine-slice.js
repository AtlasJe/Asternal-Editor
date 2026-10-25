export const assetSlice=a=>a.nineSlice??(a.horizontalSlice?[a.horizontalSlice[0],0,a.horizontalSlice[1],0]:null);
export function validSlice(s,w,h){return Array.isArray(s)&&s.length===4&&s.every(n=>Number.isInteger(n)&&n>=0)&&s[0]+s[2]<w&&s[1]+s[3]<h;}
export function drawNineSlice(ctx,image,x,y,width,height,s){
  if(!s){ctx.drawImage(image,x,y,width,height);return;}
  const [l,t,r,b]=s,k=Math.min(1,width/(l+r||1),height/(t+b||1));
  const sx=[0,l,image.width-r,image.width],sy=[0,t,image.height-b,image.height];
  const dx=[x,x+l*k,x+width-r*k,x+width],dy=[y,y+t*k,y+height-b*k,y+height];
  for(let j=0;j<3;j++)for(let i=0;i<3;i++)if(sx[i+1]>sx[i]&&sy[j+1]>sy[j])ctx.drawImage(image,sx[i],sy[j],sx[i+1]-sx[i],sy[j+1]-sy[j],dx[i],dy[j],dx[i+1]-dx[i],dy[j+1]-dy[j]);
}
export function createNineSliceEditor(parent,asset,initial,onStart,onChange){
  const make=(tag,props={},host)=>{const n=Object.assign(document.createElement(tag),props);host?.append(n);return n;};
  let slice=[...(initial??assetSlice(asset)??[0,0,0,0])];
  const im=asset.image,w=im.width,h=im.height;
  const dialog=make('div',{className:'ui-nine-editor'},parent);
  make('p',{textContent:'拖动四条边界，或输入左、上、右、下边距（原图像素）。'},dialog);
  const stage=make('div',{className:'ui-nine-source'},dialog);
  const source=make('canvas',{width:w,height:h},stage);source.getContext('2d').drawImage(im,0,0);
  const k=Math.min(8,240/w,180/h);stage.style.width=`${w*k}px`;stage.style.height=`${h*k}px`;
  const fields=make('div',{className:'ui-nine-fields'},dialog),inputs=[],lines=[];
  const update=()=>{
    inputs.forEach((n,i)=>{n.value=slice[i];n.max=(i%2?h:w)-slice[(i+2)%4]-1;});
    lines.forEach((n,i)=>{n.style[i%2?'top':'left']=`${(i<2?slice[i]:(i===2?w:h)-slice[i])/(i%2?h:w)*100}%`;});
  };
  const set=(i,v)=>{if(Number.isFinite(v)){slice[i]=Math.max(0,Math.min((i%2?h:w)-slice[(i+2)%4]-1,Math.round(v)));update();onChange(slice.slice());}};
  for(const [i,label]of ['左','上','右','下'].entries()){
    const row=make('label',{},fields);make('span',{textContent:label},row);
    const host=make('span',{className:'props-unit-input'},row);
    const input=make('input',{type:'number',min:0,step:1,ariaLabel:label+'边距（px）'},host);
    make('span',{className:'props-unit',textContent:'px',ariaHidden:'true'},host);inputs.push(input);input.onchange=()=>{onStart();set(i,Number(input.value));};
    const line=make('div',{className:'ui-nine-line '+(i%2?'horizontal':'vertical'),title:label+'边距'},stage);lines.push(line);
    let start;
    line.onpointerdown=e=>{e.preventDefault();onStart();start=slice[i];line.setPointerCapture(e.pointerId);};
    line.onpointermove=e=>{if(start===undefined)return;const r=stage.getBoundingClientRect(),value=i%2?(e.clientY-r.top)/r.height*h:(e.clientX-r.left)/r.width*w;set(i,i<2?value:(i===2?w:h)-value);};
    line.onpointerup=()=>{start=undefined;};line.onpointercancel=()=>{if(start!==undefined)set(i,start);start=undefined;};
  }
  const actions=make('div',{className:'ui-nine-actions'},dialog);
  const button=(label,fn)=>{const b=make('button',{type:'button',textContent:label},actions);b.onclick=fn;};
  button('恢复素材默认',()=>{onStart();slice=[...(assetSlice(asset)??[0,0,0,0])];update();onChange(slice.slice());});
  dialog.addEventListener('keydown',e=>e.stopPropagation());
  update();
}
