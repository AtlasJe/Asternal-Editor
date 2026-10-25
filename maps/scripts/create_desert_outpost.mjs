import {readPack} from '../../tools/tilemap.mjs';
import fs from 'node:fs';
import {TileMap,terrainHeights,terrainUsesCellPlacement,objectDefs} from '../../shared/grid.js';
import {resolveWangCenter,wangConflict} from '../../shared/wang.js';
import {readMapFile,writeMapFile} from '../../shared/map-file.js';
const root=new URL('../../',import.meta.url);
const pack=readPack(new URL('packs/kenney-desert/',root));
const config={tileSize:32,terrains:pack.terrains.map(t=>({...t,name:`kenney-desert/${t.name}`})),objects:pack.objects.map(o=>({...o,name:`kenney-desert/${o.name}`}))};
const map=new TileMap(48,36,terrainHeights(config.terrains),terrainUsesCellPlacement(config.terrains));
map.name='紫峡驿站';map.tileSize=32;map.backgroundColor='#c39d83';map.dimInactive=true;map.terrains=config.terrains;map.objectDefs=objectDefs(config);
const tid=n=>config.terrains.findIndex(t=>t.name===`kenney-desert/${n}`);
const layer=(name,offset=0)=>{const l=map.createLayer(name);l.offset=offset;map.layers.push(l);return l;};
const ground=layer('沙海 · 驿道与绿洲');
const random=(x,y)=>{let n=Math.imul(x+719,374761393)^Math.imul(y+923,668265263);n=Math.imul(n^(n>>>13),1274126177);return ((n^(n>>>16))>>>0)/4294967296;};
const centers=Array(map.width*map.height).fill('沙地');
function rect(x0,y0,x1,y1,fn){for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++)fn(x,y);}
const paint=(x0,y0,x1,y1,c)=>rect(x0,y0,x1,y1,(x,y)=>centers[y*48+x]=c);
// Generous sand margins frame four connected destinations.
paint(4,20,43,23,'深色土地');paint(22,21,25,35,'深色土地');
paint(20,7,23,20,'深色土地');paint(13,9,23,12,'深色土地');
paint(33,15,36,25,'深色土地');paint(33,15,42,18,'深色土地');
// A stepped oasis and a violet ruin garden, with room for vegetation.
paint(5,6,14,14,'青草地');paint(7,4,12,16,'青草地');paint(4,8,15,12,'青草地');
paint(35,26,42,31,'紫草地');paint(33,27,44,30,'紫草地');paint(37,25,40,33,'紫草地');
paint(19,12,30,24,'金属地板');
paint(22,22,25,25,'深色土地');
const def=config.terrains[tid('desert')].wang;
for(let i=0;i<centers.length;i++){const x=i%48,y=Math.floor(i/48);ground.grid.cells[i]=tid('desert');ground.grid.wang[i]={center:centers[i],tile:centers[i]==='沙地'?(random(x,y)<.28?'source-0064':'source-0065'):null,edges:[],locked:false};}
for(let i=0;i<centers.length;i++)ground.grid.wang[i]=resolveWangCenter(ground.grid,i,def);
const cliffs=layer('石台与围栏');
const terrainRect=(n,x0,y0,x1,y1)=>rect(x0,y0,x1,y1,(x,y)=>cliffs.grid.cells[y*48+x]=tid(n));
terrainRect('mesa_tall',30,7,43,11);terrainRect('mesa_tall',34,5,41,13);terrainRect('mesa_tall',38,12,43,14);
terrainRect('mesa',3,28,13,31);terrainRect('mesa',5,26,10,32);
terrainRect('mesa_teal',5,7,8,10);
terrainRect('platform_grey',20,15,29,17);
terrainRect('mesa_grey',36,26,41,28);
const fence=cliffs;
const posts=[];for(let x=18;x<=31;x++){posts.push([x,12]);if(x<22||x>25)posts.push([x,25]);}for(let y=13;y<25;y++){if(y<20||y>22)posts.push([18,y]);if(y<19||y>21)posts.push([31,y]);}
const cells=new Set(posts.map(([x,y])=>y*48+x));for(const i of cells){fence.grid.cells[i]=tid('fence');fence.grid.links[i]=[[0,-1,1],[1,0,2],[0,1,4],[-1,0,8]].reduce((v,[dx,dy,b])=>v|(cells.has(i+dy*48+dx)?b:0),0);}
const flora=layer('绿洲 · 植被与风化岩');
const obj=(l,n,x,y,extra={})=>{const type=config.objects.findIndex(o=>o.name===`kenney-desert/${n}`);if(type<0)throw Error(n);l.objects.push({type,x,y,...extra});};
for(const [n,x,y] of [['tree_teal',6,7],['tree_teal',12,5],['tree_teal',14,11],['tree_teal',8,15],['bush_teal',10,6],['bush_teal',5,12],['bush_teal',12,14],['cactus',3,17],['cactus_small',5,18],['cactus',15,6],['cactus_small',17,8],['cactus',43,14],['cactus_small',45,16],['cactus',29,30],['cactus_small',31,32],['tree_purple',34,26],['tree_purple',43,27],['tree_purple',41,32],['bush_dead',35,29],['bush_dead',41,23],['bush_dead',43,31],['rocks',16,16],['rocks',2,24],['stone_tall',14,29],['stone',16,30],['rock_pile',11,34],['rocks',45,29],['skeleton',7,23],['stone_tall',28,4],['rocks',45,7],['cactus',3,3],['stone',18,3],['rocks',30,34]])obj(flora,n,x,y);
const props=layer('驿站 · 门庭与补给');
for(const [n,x,y] of [['gate_orange',24,18],['door_grey',21,18],['tile_224',28,18],['lamp',19,19],['lamp',30,19],['lamp',21,25],['lamp',26,25],['barrel',20,22],['barrel_green',20,23],['table',27,21],['chest_gold',29,23],['chest_red',28,23],['tile_222',19,16],['sign_red',17,21],['sign_teal',26,29],['arch',37,29],['portal',37,31],['chest_gold',40,30],['barrel_green',12,12],['tile_040',10,10],['chest_red',10,11],['sign_teal',14,16]])obj(props,n,x,y,{paused:true});
for(const [n,x,y] of [['arch_gold',21,7],['barrel',20,10],['sign_red',24,9],['cave',39,15],['barrel',37,17],['chest_red',41,18],['rocks',43,18]])obj(props,n,x,y,{paused:true});
const ledges=layer('遗迹 · 台顶陈设',32);
for(const [n,x,y] of [['chest_red',7,29],['enemies_4',10,29],['stone',5,30],['tile_224',38,27],['tile_223',40,27]])obj(ledges,n,x,y,{paused:true});
const roofs=layer('台顶 · 天线与守望',96);
for(const [n,x,y] of [['tile_223',21,16],['tile_223',22,16],['tile_220',28,16],['lamp',25,15],['players_3',26,16],['tree_purple',35,8],['tree_purple',41,9],['bush_dead',32,9],['stone',38,6],['chest_gold',40,12]])obj(roofs,n,x,y,{paused:true});
const actors=layer('旅人 · 巡逻与拾取');
for(const [n,x,y] of [['players_1',24,28],['players_2',11,13],['players_4',29,20],['enemies_1',6,14],['enemies_2',42,25],['enemies_3',40,31],['key',39,30],['weapons_013',28,22]])obj(actors,n,x,y,{paused:true});
map.active=actors.id-1;
let conflicts=0;for(let i=0;i<centers.length;i++)if(wangConflict(ground.grid,i,config.terrains[tid('desert')]))conflicts++;
if(conflicts)throw Error(`${conflicts} terrain conflicts`);
const out=new URL('maps/紫峡驿站.tilemap',root);const text=writeMapFile(map,config);readMapFile(text,config);fs.writeFileSync(out,text);console.log(`${out.pathname}: ${map.width}×${map.height}, ${map.layers.length} layers, ${map.layers.reduce((n,l)=>n+l.objects.length,0)} objects, zero Wang conflicts`);
