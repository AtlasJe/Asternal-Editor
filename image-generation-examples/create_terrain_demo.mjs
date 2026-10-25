// Generate either terrain inspection map, then reuse the standard offline builder.
// node --experimental-default-type=module image-generation-examples/create_terrain_demo.mjs [all|wall|dual]
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {readPack} from '../tools/tilemap.mjs';
import {TileMap,DIRS,terrainHeights,terrainUsesCellPlacement} from '../shared/grid.js';
import {serializeMap} from '../shared/packs.js';
const root=fileURLToPath(new URL('../',import.meta.url));
const choice=process.argv[2]??'all';
if(!['all','wall','dual'].includes(choice))throw Error('Expected all, wall or dual');
const config=readPack(new URL('../packs/kenney-tiny-town/',import.meta.url));
function wallCells(){
 const rows=['..###########.....','..#.....#...#.....','..#.....#...#####..',
 '..#...#####.....#..','..#.....#.......#..','..#####.#########..',
 '......#.#.........','......###....#....'];
 const cells=new Set();
 rows.forEach((row,y)=>[...row].forEach((c,x)=>{if(c==='#')cells.add(`${x},${y+2}`);}));
 cells.add('13,9');return cells;
}
function dualCells(){
 const cells=new Set();const add=(x,y)=>cells.add(`${x},${y}`);
 for(let y=4;y<=11;y++)for(let x=2;x<=11;x++){
  if(x>=5&&x<=7&&y>=7&&y<=8)continue;
  if(x>=10&&y<=5)continue;
  add(x,y);
 }
 for(let x=12;x<=16;x++)add(x,10);
 for(let y=11;y<=13;y++)add(16,y);
 for(const [x,y] of [[17,5],[18,6],[18,11],[3,14],[4,15]])add(x,y);
 return cells;
}
const examples={
 wall:{name:'城墙验收',terrain:'city_wall',width:18,height:13,background:'#609646',
       layer:'城墙 · 转角、丁字口、十字口',cells:wallCells,output:'city-wall-demo.html'},
 dual:{name:'Dual高台验收',terrain:'moss_plateau',width:22,height:18,background:'#455462',
       layer:'Dual 高台 · 孔洞、凹角、窄条、对角',cells:dualCells,output:'dual-plateau-demo.html'},
};
for(const [key,spec] of Object.entries(examples)){
 if(choice!=='all'&&choice!==key)continue;
 const value=config.terrains.findIndex(t=>t.name===spec.terrain);
 if(value<0)throw Error(`Missing terrain ${spec.terrain}; run the Tiny Town converter first`);
 const map=new TileMap(spec.width,spec.height,terrainHeights(config.terrains),terrainUsesCellPlacement(config.terrains));
 map.tileSize=32;map.terrains=config.terrains;map.backgroundColor=spec.background;
 const layer=map.createLayer(spec.layer);map.insertLayer(layer,0);
 const cells=spec.cells();
 for(const cell of cells){
  const [x,y]=cell.split(',').map(Number),i=y*spec.width+x;
  layer.grid.cells[i]=value;
  if(config.terrains[value].connect==='edge')layer.grid.links[i]=DIRS.reduce(
   (mask,d)=>mask|(cells.has(`${x+d.dx},${y+d.dy}`)?d.bit:0),0);
 }
 const path=`maps/${spec.name}.tilemap`;
 fs.writeFileSync(root+path,JSON.stringify(serializeMap(map,config),null,2)+'\n');
 const result=spawnSync('python3',[root+'tools/tilemap.py','build','--startup-map',root+path,
  '--out',root+'image-generation-examples/temp/'+spec.output],{cwd:root,stdio:'inherit'});
 if(result.error)throw result.error;
 if(result.status!==0)process.exit(result.status??1);
}
