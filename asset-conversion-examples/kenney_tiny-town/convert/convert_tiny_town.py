#!/usr/bin/env python3
"""Reproducible Tiny Town 1.1 conversion; original files remain read-only."""
from pathlib import Path
import argparse
import json
import sys
from PIL import Image, ImageDraw
ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT/'tools'))
sys.path.insert(0, str(ROOT/'image-generation-examples'))
from tilemap import write_pack, asset_uuids, read_pack
from make_wall import generate as generate_wall
from make_dual_plateau import generate as generate_plateau
PACK_ID = 'kenney-tiny-town'

def convert(source, out):
    tiles = [Image.open(source/f'Tiles/tile_{n:04d}.png').convert('RGBA') for n in range(132)]
    assert all(t.size == (16,16) for t in tiles)
    old = asset_uuids(out) if out.exists() else {}
    review = Path(__file__).parent/'review'; review.mkdir(exist_ok=True)
    out.mkdir(parents=True,exist_ok=True)
    m = dict(id=PACK_ID,name='Kenney 微型小镇',tileSize=32,terrains=[],objects=[])
    uses = {n:[] for n in range(132)}
    def record(ids, path):
        for n in set(ids):
            if n is not None: uses[n].append(path)
    def save(im, path):
        p=out/path;p.parent.mkdir(parents=True,exist_ok=True)
        im.resize((im.width*2,im.height*2),Image.Resampling.NEAREST).save(p)
    def composite(rows):
        im=Image.new('RGBA',(len(rows[0])*16,len(rows)*16))
        for y,row in enumerate(rows):
            for x,n in enumerate(row):
                if n is not None:
                    if 84 <= n <= 91:
                        base = 72 if n < 88 else 76
                        im.paste(tiles[base + (0 if x == 0 else 3 if x == len(row)-1 else 1)],(x*16,y*16))
                        im.alpha_composite(tiles[n],(x*16,y*16))
                    else: im.paste(tiles[n],(x*16,y*16))
        return im
    def obj(name,label,group,rows,footprint=None,im=None):
        path=f'objects/{name}.png'; save(im if im is not None else composite(rows),path)
        m['objects'].append(dict(name=name,label=label,group=group,sprite=path,footprint=footprint or [len(rows[0]),1]))
        record([n for row in rows for n in row],path)
    config=json.loads((ROOT/'shared/config.json').read_text())
    def terrain(name,label,regions,edge=False,ids=()):
        layout=config['edgeSheetLayout' if edge else 'sheetLayout']
        sheet=Image.new('RGBA',(64,64))
        for y,row in enumerate(layout):
            for x,mask in enumerate(row): sheet.paste(regions[mask],(x*16,y*16))
        path=f'terrains/{name}.png';save(sheet,path)
        e=dict(name=name,label=label,tiles=path)
        if edge:e['connect']='edge'
        m['terrains'].append(e);record(ids,path)
    # Cell-centered grass/dirt Wang: preserve all 16 original ground tiles.
    # The 47 canonical dirt patterns cover every binary eight-neighbor context.
    grass,dirt='草地','泥土'
    ground_annotations={n:[grass]*9 for n in [0,1,2]}
    for y in range(3):
        for x in range(3):
            n=12+y*12+x
            ground_annotations[n]=[dirt if 0<=x+dx<3 and 0<=y+dy<3 else grass
                                   for dy in [-1,0,1] for dx in [-1,0,1]]
    for n,corner in [(39,0),(40,2),(41,8),(42,6)]:
        a=[dirt]*9;a[corner]=grass;ground_annotations[n]=a
    art={f'source-{n:04d}':tiles[n] for n in ground_annotations}
    annotations={f'source-{n:04d}':a for n,a in ground_annotations.items()}
    native={tuple(a):key for key,a in annotations.items() if a[4]==dirt}
    patterns={};supplement_sources={}
    for bits in range(256):
        a=[dirt]*9
        for bit,pos in enumerate([0,1,2,3,5,6,7,8]):a[pos]=dirt if bits&1<<bit else grass
        # A diagonal matters only when both adjacent cardinal neighbors are dirt.
        for corner,h,v in [(0,3,1),(2,5,1),(6,3,7),(8,5,7)]:
            if a[h]!=dirt or a[v]!=dirt:a[corner]=grass
        key=native.get(tuple(a))
        if key is None:
            key=f"source-{1000+int(''.join('1' if label==dirt else '0' for label in a),2):04d}"
            im=Image.new('RGBA',(16,16));quarters=[]
            for px,py,h,v,diag in [(0,0,3,1,0),(1,0,5,1,2),(0,1,3,7,6),(1,1,5,7,8)]:
                hx,vy=a[h]==dirt,a[v]==dirt
                if hx and vy:
                    n=25 if a[diag]==dirt else {(0,0):39,(1,0):40,(0,1):42,(1,1):41}[px,py]
                elif hx:n=13 if py==0 else 37
                elif vy:n=24 if px==0 else 26
                else:n={(0,0):12,(1,0):14,(0,1):36,(1,1):38}[px,py]
                box=(px*8,py*8,px*8+8,py*8+8)
                im.paste(tiles[n].crop(box),(px*8,py*8));quarters.append(n)
            art[key]=im;annotations[key]=a
            supplement_sources[key]=dict(annotations=a,quadrants=quarters)
        patterns[tuple(a)]=key
    assert len(patterns)==47
    (Path(__file__).parent/'ground-supplements.json').write_text(json.dumps(supplement_sources,ensure_ascii=False,indent=2)+'\n')
    # Keep original 3x3 relationships and the concave corners together, then supplements.
    layout=[['source-0000','source-0001','source-0002',None,None,None,None,None],
            ['source-0012','source-0013','source-0014',None,'source-0039','source-0040',None,None],
            ['source-0024','source-0025','source-0026',None,'source-0042','source-0041',None,None],
            ['source-0036','source-0037','source-0038',None,None,None,None,None],
            [None]*8]
    supplements=sorted(k for k in art if int(k[7:])>=1000)
    for start in range(0,len(supplements),8):
        row=supplements[start:start+8];layout.append(row+[None]*(8-len(row)))
    sheet=Image.new('RGBA',(128,len(layout)*16));entries=[]
    for y,row in enumerate(layout):
        for x,key in enumerate(row):
            i=y*8+x
            if key is None:entries.append(dict(id=f'gap-{i}',edges=[grass]*4,annotations=[None]*9));continue
            sheet.paste(art[key],(x*16,y*16));a=annotations[key]
            entry=dict(id=key,annotations=a,edges=[a[pos] for pos in [1,5,7,3]])
            if key in ['source-0000','source-0025']:entry['weight']=8
            entries.append(entry)
    path='terrains/ground.png';save(sheet,path)
    sheet.resize((768,sheet.height*6),Image.Resampling.NEAREST).save(review/'ground-wang.png')
    m['terrains'].append(dict(name='ground',label='草地泥土',tiles=path,connect='wang',wang=dict(
        labels=[grass,dirt],boundary=grass,columns=8,tiles=entries)))
    record(ground_annotations,path)
    # Preserve the asymmetrical source lighting: no rotated fence sprites.
    originals={1:71,2:80,3:68,4:47,5:59,6:44,8:82,9:70,10:45,12:46}
    fences={mask:tiles[n].copy() for mask,n in originals.items()}
    for mask in [0,7,11,13,14,15]:
        im=Image.new('RGBA',(16,16))
        for bit,box,n in [(1,(0,0,16,8),59),(2,(8,0,16,16),81),(4,(0,8,16,16),59),(8,(0,0,8,16),81)]:
            if mask&bit:im.alpha_composite(tiles[n].crop(box),(box[0],box[1]))
        im.alpha_composite(tiles[45].crop((4,2,12,14)),(4,2))
        fences[mask]=im
    # Source corner rails are a pixel wider than the straight rail.
    # Normalize only the two-pixel interface to the native straight tile.
    for mask,box in [(3,(0,0,16,2)),(9,(0,0,16,2)),(6,(0,14,16,16)),(12,(0,14,16,16))]:
        fences[mask].paste(tiles[59].crop(box),(box[0],box[1]))
    terrain('wood_fence','木栅栏',fences,edge=True,ids=list(originals.values())+[56,58,69,81])
    # Ground details are overlays, not opaque rectangular grass patches.
    for n,name,label in [(1,'grass_tufts','碎草'),(2,'flowers','黄花')]:
        im=tiles[n].copy();base=tiles[0].getpixel((0,0));im.putdata([(0,0,0,0) if p==base else p for p in im.getdata()])
        obj(name,label,'植物',[[n]],im=im)
    obj('stone_path','碎石铺路','地面装饰',[[43]])
    for n,name,label in [(5,'tree_round','圆冠树'),(17,'saplings','幼苗'),(27,'tree_gold_small','金叶小树'),(28,'tree_green_small','绿叶小树'),(29,'mushrooms','红蘑菇')]:
        obj(name,label,'植物',[[n]])
    obj('tree_gold_tall','金叶高树','植物',[[3],[15]])
    obj('tree_green_tall','绿叶高树','植物',[[4],[16]])
    # Forest boundary tiles are construction terrain, not a nine-tile tree.
    for name,label,left in [('forest_green','绿叶林缘',6),('forest_gold','金叶林缘',9)]:
        rows=[[left+x+y*12 for x in range(3)] for y in range(3)]
        path=f'terrains/{name}.png';save(composite(rows),path)
        ids=[n for row in rows for n in row]
        m['terrains'].append(dict(name=name,label=label,tiles=path,connect='wang',placement='tile',wang=dict(labels=[label],boundary=label,columns=3,tiles=[dict(id=f'source-{n:04d}',edges=[label]*4,annotations=[label]*9) for n in ids])))
        record(ids,path)
    # Roof tiles form complete houses. Door/window colors remain static variants.
    for roof,rl,start in [('slate','灰顶',48),('red','红顶',52)]:
        for wall,wl,base in [('wood','木墙',72),('stone','灰墙',76)]:
            for variant,vl,door in [('arched','拱门',1),('square','方门',2),('wide','宽门',3),('open','敞门',2)]:
                rows=[[start,start+1,start+2],[start+12,start+13,start+14],
                      [base+12,base+12+door,base+3]]
                if variant=='open':rows[-1][1]=base+2
                obj(f'house_{roof}_{wall}_{variant}',rl+wl+vl+'住宅','房屋',rows,[3,1])
            rows=[[start,start+1,start+2],[start+12,start+15,start+14],[base+12,base+13,base+3]]
            obj(f'house_{roof}_{wall}_gable',rl+wl+'山墙住宅','房屋',rows,[3,1])
        obj(f'house_{roof}_dormer',rl+'天窗住宅','房屋',[[start,start+3,start+2],[start+12,start+13,start+14],[84,85,75]],[3,1])
    # Facade pieces 73/77 are used in wide presets, rather than loose objects.
    for base,name,label in [(72,'wood','木墙'),(76,'stone','灰墙')]:
        obj(f'house_wide_{name}',label+'宽住宅','房屋',[[48,49,49,50],[60,61,63,62],[base,base+1,base+13,base+3]],[4,1])
    obj('castle_gate','城堡拱门','城堡',[[99,101],[111,112],[123,124]],[2,1])
    obj('castle_gate_open','城堡通道','城堡',[[99,101],[113,114],[123,124]],[2,1])
    obj('castle_courtyard','城堡平台','城堡',[[96,97,98],[108,109,110],[108,125,110],[120,121,122]],[3,4])
    obj('castle_wall','城堡墙段','城堡',[[99,100,101],[126,126,126]],[3,1])
    watch=composite([[102],[126],[126]])
    watch.alpha_composite(tiles[103],(0,16))
    obj('castle_watchtower','城堡哨塔','城堡',[[102],[103],[126]],[1,1],im=watch)
    # Additional manual castle construction retains original spatial relationships.
    # These pieces have a distinct function from the assembled presets: custom walls.
    layout=[[96,97,98,None,99,100,101,None,102,103],
            [108,109,110,None,111,112,113,114,None,None],
            [120,121,122,None,123,None,124,125,126,None]]
    sheet=composite(layout);entries=[]
    for i,n in enumerate(n for row in layout for n in row):
        entries.append(dict(id=f'source-{n:04d}' if n is not None else f'gap-{i}',edges=['城堡']*4,annotations=['城堡']*9 if n is not None else [None]*9))
    path='terrains/castle_construction.png';save(sheet,path)
    m['terrains'].append(dict(name='castle_construction',label='城堡拼建',tiles=path,connect='wang',placement='tile',wang=dict(labels=['城堡'],boundary='城堡',columns=10,tiles=entries)))
    record([n for row in layout for n in row],path)
    singles=[(57,'cart','手推车','设施'),(83,'sign','告示牌','设施'),(92,'soil_pile','土堆','地面装饰'),(93,'coin','金币','物品'),(94,'beehive','蜂箱','设施'),(95,'target','箭靶','设施'),(104,'well','水井','设施'),(105,'bomb','炸弹','物品'),(106,'log','木料','物品'),(107,'chest','宝箱','物品'),(115,'pickaxe','镐','工具'),(116,'pitchfork','草叉','工具'),(117,'key','钥匙','物品'),(118,'bow','弓','工具'),(119,'arrow','箭','工具'),(127,'axe','斧','工具'),(128,'pan','平底锅','工具'),(129,'sickle','镰刀','工具'),(130,'bucket_empty','空木桶','物品'),(131,'bucket_water','盛水木桶','物品')]
    for n,name,label,group in singles:obj(name,label,group,[[n]])
    assert all(uses.values()),[n for n,u in uses.items() if not u]
    # Procedural Edge-height example; not derived from Kenney source tiles.
    generate_wall(out/'terrains', ROOT/'image-generation-examples/temp')
    m['terrains'].append(dict(name='city_wall',label='抬高城墙',tiles='terrains/city_wall.png',
                             connect='edge',height=1,extrude='up'))
    generate_plateau(out/'terrains', ROOT/'image-generation-examples/temp')
    m['terrains'].append(dict(name='moss_plateau',label='苔石高台',tiles='terrains/moss_plateau.png',
                             height=2,extrude='up'))
    write_pack(out,m,old)
    wanted={'pack.meta'}|{e[k] for kind,k in [('terrains','tiles'),('objects','sprite')] for e in m[kind]}
    wanted|={p+'.meta' for p in list(wanted) if p!='pack.meta'}
    for p in out.rglob('*'):
        if p.is_file() and str(p.relative_to(out)) not in wanted:p.unlink()
    assert len(read_pack(out)['objects'])==len(m['objects'])
    (Path(__file__).parent/'source-map.json').write_text(json.dumps(uses,ensure_ascii=False,indent=2)+'\n')
    # Review artifacts live with conversion, never in runtime pack.
    cw,ch=160,150;preview=Image.new('RGB',(cw*7,((len(m['objects'])+6)//7)*ch),'#85bd67');draw=ImageDraw.Draw(preview)
    for i,e in enumerate(m['objects']):
        im=Image.open(out/e['sprite']);im.thumbnail((144,116),Image.Resampling.NEAREST)
        x=i%7*cw;y=i//7*ch;preview.paste(im,(x+(cw-im.width)//2,y+116-im.height),im);draw.text((x+3,y+120),e['name'],fill='#202020')
    preview.save(review/'objects.png')
    cells={(x,y) for y in range(1,7) for x in range(1,9)}-{(3,3),(4,3),(3,4),(4,4)}
    cells|={(x,6) for x in range(9,13)}|{(12,5),(12,4),(11,1),(14,1),(15,2)}
    preview=Image.new('RGBA',(272,160))
    for y in range(10):
        for x in range(17):
            a=[dirt if (x+dx,y+dy) in cells else grass for dy in [-1,0,1] for dx in [-1,0,1]]
            if a[4]==dirt:
                for corner,h,v in [(0,3,1),(2,5,1),(6,3,7),(8,5,7)]:
                    if a[h]!=dirt or a[v]!=dirt:a[corner]=grass
                im=art[patterns[tuple(a)]]
            else:im=tiles[0]
            preview.paste(im,(x*16,y*16))
    preview.resize((1088,640),Image.Resampling.NEAREST).save(review/'dirt-shapes.png')
    sheet=Image.new('RGBA',(16*16,32),'#84c669')
    for mask in range(16):sheet.alpha_composite(fences[mask],(mask*16,0))
    sheet.resize((1024,128),Image.Resampling.NEAREST).save(review/'fence-states.png')
    print(f'{len(m["terrains"])} terrains; {len(m["objects"])} static objects; 132/132 source tiles accounted for')

if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('source',type=Path,nargs='?',default=ROOT/'asset-conversion-examples/kenney_tiny-town')
    p.add_argument('--out',type=Path,default=ROOT/'packs'/PACK_ID)
    a=p.parse_args();convert(a.source.resolve(),a.out.resolve())
