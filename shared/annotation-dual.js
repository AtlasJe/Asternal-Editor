// Dual Tile contour patches, bits TL=1/TR=2/BL=4/BR=8.
const A=[0,0],B=[1,0],C=[0,1],D=[1,1],N=[.5,0],E=[1,.5],S=[.5,1],W=[0,.5];
export const DUAL_PATCHES = [
  {fill:[],lines:[]},
  {fill:[[A,N,W]],lines:[[N,W]]},
  {fill:[[N,B,E]],lines:[[E,N]]},
  {fill:[[A,B,E,W]],lines:[[E,W]]},
  {fill:[[W,S,C]],lines:[[W,S]]},
  {fill:[[A,N,S,C]],lines:[[N,S]]},
  {fill:[[N,B,E],[W,S,C]],lines:[[E,N],[W,S]]},
  {fill:[[A,B,E,S,C]],lines:[[E,S]]},
  {fill:[[E,D,S]],lines:[[S,E]]},
  {fill:[[A,N,W],[E,D,S]],lines:[[N,W],[S,E]]},
  {fill:[[N,B,D,S]],lines:[[S,N]]},
  {fill:[[A,B,D,S,W]],lines:[[S,W]]},
  {fill:[[W,E,D,C]],lines:[[W,E]]},
  {fill:[[A,N,E,D,C]],lines:[[N,E]]},
  {fill:[[N,B,D,C,W]],lines:[[W,N]]},
  {fill:[[A,B,D,C]],lines:[]},
];
// Atlas frames are independent: do not connect unrelated tiles across their borders.
export function annotationGeometry(cells,label) {
  const at=(x,y)=>x>=0&&x<3&&y>=0&&y<3&&cells[y*3+x]===label;
  const fill=[],lines=[],fillPaths=[],contours=[];
  const segment=(a,b,move)=>{
    const result={a:move(a),b:move(b)};
    if(Math.abs(a[0]-b[0])===.5&&Math.abs(a[1]-b[1])===.5){
      // Follow the square corner, rounding only a small part near its turn.
      const r=.14,center=[.5,.5];
      result.turn={p:move(center.map((v,i)=>v+(a[i]-v)*r*2)),
        q:move(center.map((v,i)=>v+(b[i]-v)*r*2)),c:move(center)};
    }
    return result;
  };
  for(let dy=0;dy<=3;dy++)for(let dx=0;dx<=3;dx++){
    const mask=(at(dx-1,dy-1)?1:0)|(at(dx,dy-1)?2:0)|(at(dx-1,dy)?4:0)|(at(dx,dy)?8:0);
    const patch=DUAL_PATCHES[mask],move=([x,y])=>[x+dx-.5,y+dy-.5];
    fill.push(...patch.fill.map(poly=>poly.map(move)));
    lines.push(...patch.lines.map(line=>line.map(move)));
    fillPaths.push(...patch.fill.map(poly=>poly.map((a,i)=>segment(a,poly[(i+1)%poly.length],move))));
    contours.push(...patch.lines.map(([a,b])=>segment(a,b,move)));
  }
  return {fill,lines,fillPaths,contours};
}
export function drawAnnotationDual(ctx,cells,colors,x,y,size,selectedLabel=undefined) {
  const step=size/3;
  ctx.save();ctx.beginPath();ctx.rect(x,y,size,size);ctx.clip();
  for(const label of new Set(cells.filter(v=>v!==null))){
    const geometry=annotationGeometry(cells,label);
    ctx.fillStyle=ctx.strokeStyle=colors[label];ctx.beginPath();
    const trace=segment=>{
      if(segment.turn){const {p,c,q}=segment.turn;ctx.lineTo(x+p[0]*step,y+p[1]*step);ctx.quadraticCurveTo(x+c[0]*step,y+c[1]*step,x+q[0]*step,y+q[1]*step);}
      ctx.lineTo(x+segment.b[0]*step,y+segment.b[1]*step);
    };
    for(const path of geometry.fillPaths){
      ctx.moveTo(x+path[0].a[0]*step,y+path[0].a[1]*step);path.forEach(trace);ctx.closePath();
    }
    const focused=selectedLabel===undefined||label===selectedLabel;
    ctx.globalAlpha=focused?.3:.06;ctx.fill();ctx.globalAlpha=focused?1:.2;
    ctx.beginPath();
    for(const segment of geometry.contours){ctx.moveTo(x+segment.a[0]*step,y+segment.a[1]*step);trace(segment);}
    ctx.lineWidth=Math.max(2,Math.min(4,step*.16));ctx.lineJoin='round';ctx.lineCap='round';ctx.stroke();
  }
  ctx.restore();
}

