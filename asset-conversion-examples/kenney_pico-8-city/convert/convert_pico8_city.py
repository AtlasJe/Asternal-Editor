#!/usr/bin/env python3
"""Rebuild the classified Kenney Pico-8 City editor pack from preserved sources."""
from pathlib import Path
import argparse
import json
import shutil
import sys
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / 'tools'))
from tilemap import write_pack, read_pack

PACK_ID = 'kenney-pico-8-city'
SOURCE = ROOT / 'asset-conversion-examples/kenney_pico-8-city'


def convert(source, out):
    tiles = [Image.open(source / f'Tiles/tile_{n:04d}.png').convert('RGBA') for n in range(360)]
    assert all(t.size == (8, 8) for t in tiles)
    # Preserve the UUIDs of existing resources that retain their names.
    old = {}
    if (out / 'pack.meta').exists():
        previous = read_pack(out)
        old = {e['metaPath']: e['uuid'] for k in ['terrains', 'objects'] for e in previous[k]}
    out.mkdir(parents=True, exist_ok=True)
    for folder in ['objects', 'terrains']:
        (out / folder).mkdir(exist_ok=True)
    manifest = dict(id=PACK_ID, name='Kenney Pico-8 城市', tileSize=32, terrains=[], objects=[])
    coverage = {n: [] for n in range(360)}
    def save(im, path):
        im.resize((im.width*4, im.height*4), Image.Resampling.NEAREST).save(out/path)
    def record(ids, path):
        for n in ids:
            if n is not None: coverage[n].append(path)
    def composite(rows):
        im = Image.new('RGBA', (len(rows[0])*8, len(rows)*8))
        for y, row in enumerate(rows):
            for x, n in enumerate(row):
                if n is not None: im.paste(tiles[n], (x*8,y*8))
        return im
    def obj(name, label, group, rows, *, frames=None, animations=None, footprint=None):
        path = f'objects/{name}.png'
        images = [composite(r) for r in (frames or [rows])]
        im = Image.new('RGBA', (sum(f.width for f in images), images[0].height))
        x = 0
        for f in images: im.paste(f,(x,0)); x += f.width
        save(im,path)
        e = dict(name=name,label=label,group=group,sprite=path,footprint=footprint or [len(rows[0]),len(rows)])
        if frames:
            e['frameCount'] = len(frames)
            e['animations'] = animations or [dict(name='walk',label='行走',frames=[0,1,0,2],fps=6)]
        manifest['objects'].append(e)
        record([n for r in (frames or [rows]) for row in r for n in row],path)
    def atlas(name,label,ids,labels=None,annotations=None,layout=None):
        if layout is None:
            columns = min(12,len(ids))
            layout = [ids[i:i+columns]+[None]*(columns-len(ids[i:i+columns])) for i in range(0,len(ids),columns)]
        columns = len(layout[0]); slots = [n for row in layout for n in row]
        assert all(len(row)==columns for row in layout)
        assert sorted(n for n in slots if n is not None)==sorted(ids)
        im = Image.new('RGBA',(columns*8,len(layout)*8)); entries=[]
        labels = labels or [label]
        for i,n in enumerate(slots):
            if n is None:
                entries.append(dict(id=f'gap-{i}',edges=[labels[0]]*4,annotations=[None]*9))
                continue
            im.paste(tiles[n],(i%columns*8,i//columns*8))
            a = annotations.get(n) if annotations else None
            e = dict(id=f'source-{n:04d}',edges=[a[p] for p in [1,5,7,3]] if a else [labels[0]]*4)
            if a:
                e['annotations']=a
                if n in [0,1,2,3,29,34,39,289,44]: e['weight']=8
            entries.append(e)
        path=f'terrains/{name}.png';save(im,path)
        entry=dict(name=name,label=label,tiles=path,connect='wang',wang=dict(labels=labels,boundary=labels[0],columns=columns,tiles=entries))
        if name=='waterfront': entry['wang']['boundaryTransitions']=True
        if annotations is None: entry['placement']='tile'
        manifest['terrains'].append(entry)
        record(ids,path)
    def source_layout(ids, columns=12):
        # Keep the source's vertical relationships, with a blank column between
        # families instead of wrapping one roof or facade into the next.
        groups={}
        for n in ids:
            groups.setdefault(n%24//columns,[]).append(n)
        layout=[]
        for group, members in sorted(groups.items()):
            first=min(n//24 for n in members);last=max(n//24 for n in members)
            for row in range(first,last+1):
                layout.append([row*24+group*columns+x if row*24+group*columns+x in members else None for x in range(columns)])
            layout.append([None]*columns)
        return layout[:-1]
    # Intact source tiles, with 3x3 neighbourhood annotations for water/land
    # transitions. The boundary is water; land variants remain weighted interiors.
    water,grass,sand,quay='水面','草地','沙滩','滨水铺地'
    annotations={1:[water]*9,0:[grass]*9,2:[sand]*9,3:[quay]*9}
    ids=[1,0,2,3]
    for start,land in [(4,grass),(9,sand),(14,quay)]:
        for y in range(3):
            for x in range(3):
                n=start+y*24+x
                annotations[n]=[land if 0<=x+dx<3 and 0<=y+dy<3 else water for dy in [-1,0,1] for dx in [-1,0,1]]
                ids.append(n)
        for n,corner in [(start+3,8),(start+4,6),(start+27,2),(start+28,0)]:
            a=[land]*9;a[corner]=water;annotations[n]=a;ids.append(n)
    for n,land in [(24,grass),(48,grass),(25,water),(49,water),(26,sand),(50,sand),(27,quay),(51,quay)]:
        annotations[n]=[land]*9;ids.append(n)
    # Quays enclose water, whereas grass/sand islands enclose land.
    for n in [14,15,16,38,39,40,62,63,64,17,18,41,42]:
        annotations[n]=[quay if label==water else water for label in annotations[n]]
    # Keep every original five-column shoreline block intact. Variants occupy
    # their own column, so buoys and sand decorations stay with their material.
    for n,material in [(55,water),(56,water),(60,sand),(61,sand)]:
        annotations[n]=[material]*9;ids.append(n)
    for n in [65,66]:
        annotations[n]=[quay]*3+[water]*6;ids.append(n)
    # The whole original top strip (24x3) is ONE Wang family. Pavement
    # differs semantically from plain purple ground, despite sharing its color.
    sidewalk='人行道'
    sidewalk_ids=[row*24+x for row in range(3) for x in range(19,24)]
    for y in range(3):
        for x in range(3):
            n=19+y*24+x
            annotations[n]=[sidewalk if 0<=x+dx<3 and 0<=y+dy<3 else quay for dy in [-1,0,1] for dx in [-1,0,1]]
    for n,corner in [(22,8),(23,6),(46,2),(47,0)]:
        a=[sidewalk]*9;a[corner]=quay;annotations[n]=a
    annotations[70]=list(annotations[43])
    annotations[71]=list(annotations[45])
    ids+=sidewalk_ids
    assert sorted(ids)==list(range(72))
    shore_layout=[]
    for row in range(3):
        shore_layout.append([row*24+x for x in range(4)]+[None]*8)
    shore_layout.append([None]*12)
    for left,right in [(4,9),(14,19)]:
        for row in range(3):
            shore_layout.append([row*24+left+x for x in range(5)]+[None]+[row*24+right+x for x in range(5)]+[None])
        shore_layout.append([None]*12)
    atlas('waterfront','地表',ids,[water,grass,sand,quay,sidewalk],annotations,shore_layout[:-1])
    # Flat Dual asphalt: canonical 3x3 outer edges plus four concave corners.
    dual_layout = json.loads((ROOT/'shared/config.json').read_text())['sheetLayout']
    road_regions={}
    for mask in range(16):
        region=Image.new('RGBA',(8,8))
        b={(x,y):bool(mask & (1<<(y*2+x))) for y in range(2) for x in range(2)}
        for (px,py),on in b.items():
            if not on:continue
            h,v,d=b[1-px,py],b[px,1-py],b[1-px,1-py]
            qx,qy=1-2*px,1-2*py
            if h and v and not d:
                n={(1,1):267,(-1,1):268,(1,-1):291,(-1,-1):292}[qx,qy]
            else:
                sx,sy=(0 if h else qx),(0 if v else qy)
                n=264+(sy+1)*24+sx+1
            x0,y0=(4 if qx>0 else 0),(4 if qy>0 else 0)
            region.paste(tiles[n].crop((x0,y0,x0+4,y0+4)),(px*4,py*4))
        road_regions[mask]=region
    sheet=Image.new('RGBA',(32,32))
    for y,row in enumerate(dual_layout):
        for x,mask in enumerate(row):sheet.paste(road_regions[mask],(x*8,y*8))
    path='terrains/roads.png';save(sheet,path)
    manifest['terrains'].append(dict(name='roads',label='沥青',tiles=path))
    record([264+y*24+x for y in range(3) for x in range(3)]+[267,268,291,292],path)
    # Review convex/concave corners, a hole, a narrow strip and a single cell.
    cells={(x,y) for y in range(1,7) for x in range(1,9)}-{(x,y) for y in range(3,5) for x in range(3,5)}
    cells|={(x,6) for x in range(9,13)}|{(12,5),(12,4),(11,1)}
    preview=Image.new('RGBA',(120,72),'#292936')
    for y in range(9):
        for x in range(15):
            mask=sum(1<<(dy*2+dx) for dy in range(2) for dx in range(2) if (x-1+dx,y-1+dy) in cells)
            preview.alpha_composite(road_regions[mask],(x*8,y*8))
    preview.resize((960,576),Image.Resampling.NEAREST).save(out/'asphalt-preview.png')
    # Edge roads, ordered by N=1 E=2 S=4 W=8, not the source atlas order.
    edge_layout = json.loads((ROOT/'shared/config.json').read_text())['edgeSheetLayout']
    edge_source = {0:316,1:315,2:341,3:318,4:339,5:294,6:270,
                   7:273,8:340,9:320,10:271,11:297,12:272,13:274,14:273,15:295}
    edge_tiles={mask:tiles[n].copy() for mask,n in edge_source.items()}
    # Two T-junction orientations are absent in the original sheet.
    edge_tiles[7]=tiles[273].transpose(Image.Transpose.ROTATE_90)
    edge_tiles[13]=tiles[274].transpose(Image.Transpose.ROTATE_270)
    # Source end posts have lanes one pixel wider. Align only the open seam
    # to the two-pixel lane positions; keep the original posts and white caps.
    for mask,box in [(1,(0,0,8,2)),(4,(0,6,8,8)),(2,(6,0,8,8)),(8,(0,0,2,8))]:
        straight=tiles[294 if mask in (1,4) else 271]
        edge_tiles[mask].paste(straight.crop(box),box)
    edge_sheet=Image.new('RGBA',(32,32))
    for y,row in enumerate(edge_layout):
        for x,mask in enumerate(row):edge_sheet.paste(edge_tiles[mask],(x*8,y*8))
    path='terrains/lane_roads.png';save(edge_sheet,path)
    manifest['terrains'].append(dict(name='lane_roads',label='标线路',tiles=path,connect='edge'))
    edge_ids=set(edge_source.values())|{274,296,298,319}
    record(edge_ids,path)
    # Preview uses the same reciprocal edge masks as the editor's paths.
    cells={(x,1) for x in range(1,12)}|{(3,y) for y in range(1,6)}|{(8,y) for y in range(1,6)}|{(x,5) for x in range(3,9)}|{(1,4),(12,4),(12,5)}
    preview=Image.new('RGBA',(112,64),'#292936')
    for x,y in cells:
        mask=sum(bit for bit,dx,dy in [(1,0,-1),(2,1,0),(4,0,1),(8,-1,0)] if (x+dx,y+dy) in cells)
        preview.paste(edge_tiles[mask],(x*8,y*8))
    preview.resize((896,512),Image.Resampling.NEAREST).save(out/'road-preview.png')
    # Raised Dual buildings: roof quarters and two wall rows in each region.
    # Corner bits TL/TR/BL/BR correspond to the editor's native 16-mask format.
    building_regions = {}
    for name,label,roof,wall in [
        ('building_warm','暖灰楼',96,168),
        ('building_pink','粉墙楼',101,173),
        ('building_light','玻璃楼',106,178),
    ]:
        regions = {}
        for mask in range(16):
            region = Image.new('RGBA',(8,24))
            b = {(x,y):bool(mask & (1 << (y*2+x))) for y in range(2) for x in range(2)}
            # Exposed southern faces begin halfway down the display tile.
            for px in range(2):
                if not b[px,0] or b[px,1]: continue
                runs_on = b[1-px,0] or b[1-px,1]
                for row in range(2):
                    n = wall + row*24 + (1 if runs_on else (3 if px==0 else 0))
                    # Keep doors as selectable details, rather than repeating
                    # a door in every wall segment of the building.
                    if row==1 and runs_on: n += 1
                    x0 = 4 if px==0 else 0
                    region.paste(tiles[n].crop((x0,0,x0+4,8)),(px*4,4+row*8))
            for (px,py),on in b.items():
                if not on: continue
                h,v,d = b[1-px,py],b[px,1-py],b[1-px,1-py]
                sx = 1 if h else (3 if px==0 else 0)
                sy = 1 if v else (2 if py==0 else 0)
                x0,y0 = (4 if px==0 else 0),(4 if py==0 else 0)
                q = tiles[roof+sy*24+sx].crop((x0,y0,x0+4,y0+4))
                if h and v and not d:
                    # Source has convex rims only. Continue that same three
                    # pixel rim around the concave corner, using its palette.
                    q = tiles[roof+25].crop((x0,y0,x0+4,y0+4))
                    palette = [tiles[roof].getpixel((i,i)) for i in range(3)]
                    for yy in range(4):
                        for xx in range(4):
                            distance=max(3-xx if px==0 else xx,3-yy if py==0 else yy)
                            if distance<3:q.putpixel((xx,yy),palette[distance])
                region.paste(q,(px*4,py*4))
            regions[mask]=region
        sheet=Image.new('RGBA',(32,96))
        for y,row in enumerate(dual_layout):
            for x,mask in enumerate(row):sheet.paste(regions[mask],(x*8,y*24))
        path=f'terrains/{name}.png';save(sheet,path)
        manifest['terrains'].append(dict(name=name,label=label,tiles=path,height=2,extrude='up'))
        # Narrow/isolated source roofs are equivalents of the quarter-built
        # masks, not extra manual terrain entries.
        record([roof-24+y*24+x for y in range(4) for x in range(5) if not(y==0 and x==4)],path)
        record([wall+y*24+x for y in range(2) for x in range(5)],path)
        building_regions[name]=regions
    # Render irregular footprints, thin strips and detached cells for review.
    review=Image.new('RGBA',(208,72),'#292936')
    shapes=[{(x,y) for y in range(3) for x in range(4)},
            {(0,0),(1,0),(2,0),(0,1),(0,2),(1,2)},
            {(0,0),(1,0),(2,0),(2,1),(2,2),(4,2)}]
    for index,(name,regions) in enumerate(building_regions.items()):
        cells=shapes[index]
        for y in range(5):
            for x in range(6):
                mask=sum(1<<(dy*2+dx) for dy in range(2) for dx in range(2) if (x-1+dx,y-1+dy) in cells)
                review.alpha_composite(regions[mask],(8+index*64+x*8,8+y*8))
    review.resize((832,288),Image.Resampling.NEAREST).save(out/'building-preview.png')
    # These atlases are manual construction tiles: no invented adjacency rules.
    for name,label,items in [
        ('facades','墙面门窗',[193,198,203]+list(range(216,236))+list(range(240,260))),
    ]:
        layout=source_layout(items)
        if name=='facades':
            layout=source_layout(items,5)
        atlas(name,label,items,layout=layout)
    for n,label in [(321,'向上箭头'),(322,'向右箭头'),(345,'向左箭头'),(346,'向下箭头'),(344,'十字标记')]:
        obj(f'road_mark_{n}',label,'路标',[[n]])
    obj('crosswalk_horizontal','横向斑马线','路标',[[336,337,338]])
    obj('crosswalk_vertical','纵向斑马线','路标',[[269],[293],[317]])
    obj('road_wear_342','路面碎斑','路标',[[342]])
    obj('road_wear_343','路面裂痕','路标',[[343]])
    # Multi-tile objects are assembled; source directions do not become playback.
    for name,label,l,r in [('red_car','红色轿车',275,276),('green_car','绿色轿车',299,300),('pink_car','粉色轿车',323,324)]:
        obj(name+'_right',label+' · 向右','交通 · 轿车',[[l,r]])
        obj(name+'_left',label+' · 向左','交通 · 轿车',[[l+2,r+2]])
    for name,label,top in [('red_car','红色轿车',279),('green_car','绿色轿车',280),('pink_car','粉色轿车',281)]:
        obj(name+'_down',label+' · 向下','交通 · 轿车',[[top],[top+24]])
        obj(name+'_up',label+' · 向上','交通 · 轿车',[[top+48],[top+72]])
    obj('bus_right','巴士 · 向右','交通 · 巴士',[[347,348,349,350]])
    obj('bus_down','巴士 · 向下','交通 · 巴士',[[282],[306],[330],[354]])
    # All four rows show the same character alternating their arms/legs.
    for name,label,start in [('red_shirt','红衣短发居民',283),('pink_dress','粉裙居民',307),('red_jacket','红衣金发居民',331),('blue_shirt','蓝衣居民',355)]:
        obj(name,label,'人物 · 行走动画',[[start]],frames=[[[start]],[[start+1]],[[start+2]]],footprint=[1,1])
    obj('palm','棕榈树','植物',[[263],[287]],footprint=[1,1])
    obj('tree_green','绿叶乔木','植物',[[310],[334]],footprint=[1,1])
    obj('tree_autumn','秋叶乔木','植物',[[311],[335]],footprint=[1,1])
    obj('shrub_green','绿色灌木','植物',[[358]])
    obj('shrub_autumn','秋色灌木','植物',[[359]])
    obj('weeds','路边杂草','植物',[[286]])
    obj('corner_left','灰色转角 · 左','街道设施',[[236]])
    obj('corner_right','灰色转角 · 右','街道设施',[[237]])
    obj('sign','绿色指示牌','街道设施',[[239]])
    obj('guardrail_vertical','白色护栏 · 纵向','街道设施',[[238]])
    obj('guardrail','白色护栏','街道设施',[[212,213,213,215]])
    obj('guardrail_post','白色护栏 · 支柱','街道设施',[[214]])
    for n,label in [(76,'屋顶天窗 · 暖灰'),(81,'屋顶天窗 · 紫灰'),(86,'屋顶天窗 · 浅灰'),(188,'医疗十字')]:
        obj(f'roof_detail_{n}',label,'建筑 · 屋顶装饰',[[n]])
    for n,label in [(260,'橙白遮阳棚'),(261,'红色遮阳棚'),(262,'蓝白遮阳棚')]:
        obj(f'awning_{n}',label,'建筑 · 遮阳棚',[[n,n,n]])
    # A pitched house has a separate peak above its three wide roof rows.
    # The source's two chimney tiles replace the left/right sloping tile,
    # rather than being independent terrain or animation frames.
    houses=[]
    for name,label,start,base in [
        ('house_slate','灰顶住宅',87,[192,241,243]),
        ('house_red','红顶住宅',90,[197,246,248]),
        ('house_blue','蓝顶住宅',93,[207,256,258]),
    ]:
        for suffix,variant in [('',None),('_chimney_left',0),('_chimney_right',2)]:
            slope=[start+24+x for x in range(3)]
            if variant is not None:slope[variant]=start+variant
            rows=[[None,start+1,None],slope,
                  [start+48+x for x in range(3)],
                  [start+72+x for x in range(3)],base]
            variant_label='' if variant is None else ('左烟囱' if variant==0 else '右烟囱')
            obj(name+suffix,label+variant_label,'房屋',rows,footprint=[3,1])
            houses.append(name+suffix)
    # The grey facade set is a taller house variant; its narrow/plain
    # alternatives are represented by the assembled facade, not a tile atlas.
    obj('house_blue_tall','蓝顶双层住宅','房屋',
        [[None,94,None],[117,118,119],[141,142,143],[165,166,167],
         [183,184,186],[207,208,211]],footprint=[3,1])
    record(list(range(183,188))+list(range(207,212)),'objects/house_blue_tall.png')
    houses.append('house_blue_tall')
    for n,label in [(189,'灰墙斑驳'),(190,'粉墙斑驳'),(191,'浅墙斑驳')]:
        obj(f'facade_detail_{n}',label,'墙饰',[[n]])
    # Actual assembled house pixels, enlarged with nearest-neighbour sampling.
    preview=Image.new('RGBA',(5*32,2*56),'#292936')
    for i,name in enumerate(houses):
        house=Image.open(out/f'objects/{name}.png').convert('RGBA')
        house=house.resize((24,house.height//4),Image.Resampling.NEAREST)
        preview.alpha_composite(house,(i%5*32+4,i//5*56+4))
    preview.resize((800,560),Image.Resampling.NEAREST).save(out/'house-preview.png')
    # Exact arrangements used by the supplied Tiled sample, retained as presets.
    obj('office','灰色办公楼','建筑 · 完整建筑',[[96,97,98,99],[120,121,122,123],[144,145,146,147],[178,179,180,181],[202,203,204,205]],footprint=[4,2])
    obj('office_tall','灰色高层办公楼','建筑 · 完整建筑',[[96,97,98,99],[120,121,121,123],[144,145,146,147],[178,179,180,181],[178,179,180,181],[202,203,204,205]],footprint=[4,2])
    missing=[n for n,uses in coverage.items() if not uses]
    assert not missing, f'Unconverted source tiles: {missing}'
    # Category names stay short in the editor's narrow dock.
    short_labels = {
        'waterfront': '地表', 'roads': '沥青',
        'facades': '墙面门窗', 'road_details': '道路拼片',
    }
    for entry in manifest['terrains']:
        entry['label'] = short_labels.get(entry['name'], entry['label'])
    for entry in manifest['objects']:
        entry['group'] = entry['group'].split(' · ')[-1]
    write_pack(out,manifest,old)
    wanted={e['tiles'] for e in manifest['terrains']}|{e['sprite'] for e in manifest['objects']}
    for folder in ['objects','terrains']:
        for p in (out/folder).glob('*'):
            rel=str(p.relative_to(out));base=rel[:-5] if rel.endswith('.meta') else rel
            if base not in wanted: p.unlink()
    shutil.copy2(source/'License.txt',out/'License.txt')
    (out/'source-map.json').write_text(json.dumps(coverage,ensure_ascii=False,indent=2)+'\n')
    # Contact sheet of final assembled objects for visual review.
    cols=6;cw,ch=180,240
    preview=Image.new('RGB',(cols*cw,((len(manifest['objects'])+cols-1)//cols)*ch),'#303540')
    d=ImageDraw.Draw(preview)
    for i,e in enumerate(manifest['objects']):
        im=Image.open(out/e['sprite']); count=e.get('frameCount',1)
        im=im.crop((0,0,im.width//count,im.height));im.thumbnail((160,200),Image.Resampling.NEAREST)
        x=i%cols*cw;y=i//cols*ch;preview.paste(im,(x,y),im);d.text((x,y+206),e['name'],fill='white')
    preview.save(out/'object-preview.png')
    print(f'{len(manifest["terrains"])} terrains, {len(manifest["objects"])} objects; all 360 source tiles covered')


if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('source',type=Path,nargs='?',default=SOURCE)
    p.add_argument('--out',type=Path,default=ROOT/'packs'/PACK_ID)
    args=p.parse_args();convert(args.source.resolve(),args.out.resolve())
