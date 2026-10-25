// Geometry is expressed in the element's unrotated local coordinate system.
export const resizeHandles=[[-1,-1],[0,-1],[1,-1],[1,0],[1,1],[0,1],[-1,1],[-1,0]];
export function toLocal(e,p){
  const a=(e.rotation??0)*Math.PI/180,c=Math.cos(a),s=Math.sin(a),x=p[0]-e.x-e.width/2,y=p[1]-e.y-e.height/2;
  return [x*c+y*s+e.width/2,-x*s+y*c+e.height/2];
}
export function containsElement(e,p){const [x,y]=toLocal(e,p);return x>=0&&x<=e.width&&y>=0&&y<=e.height;}
export function resizeElement(e,handle,delta){
  const [hx,hy]=handle,a=(e.rotation??0)*Math.PI/180,c=Math.cos(a),s=Math.sin(a);
  const dx=delta[0]*c+delta[1]*s,dy=-delta[0]*s+delta[1]*c;
  let width=hx?Math.max(1,Math.min(8192,e.width+hx*dx)):e.width;
  let height=hy?Math.max(1,Math.min(8192,e.height+hy*dy)):e.height;
  if(e.keepAspectRatio){
    let scale=!hx?height/e.height:!hy?width/e.width:Math.abs(width/e.width-1)>Math.abs(height/e.height-1)?width/e.width:height/e.height;
    scale=Math.max(1/Math.min(e.width,e.height),Math.min(8192/Math.max(e.width,e.height),scale));
    width=e.width*scale;height=e.height*scale;
  }
  const cx=hx*(width-e.width)/2,cy=hy*(height-e.height)/2;
  return {width,height,x:e.x+e.width/2+cx*c-cy*s-width/2,y:e.y+e.height/2+cx*s+cy*c-height/2};
}
