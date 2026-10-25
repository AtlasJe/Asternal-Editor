// Shared by system fonts and bitmap fonts; measure returns the rendered advance.
export function layoutUIText(text,width,height,lineHeight,measure,mode='clip'){
  let lines=text.split('\n');
  if(mode==='wrap'){
    lines=lines.flatMap(line=>{
      const rows=[];let row='';
      for(const char of line){if(row&&measure(row+char)>width){rows.push(row);row='';}row+=char;}
      rows.push(row);return rows;
    });
  }
  const scale=mode==='shrink'?Math.min(1,width/Math.max(1,...lines.map(measure)),height/Math.max(1,lines.length*lineHeight)):1;
  return {lines,scale,clip:mode!=='visible'};
}
