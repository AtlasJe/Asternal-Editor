#!/usr/bin/env python3
"""One annotated atlas of intact original Kenney 16x16 tiles; no synthesized art."""
from pathlib import Path
from PIL import Image
T=16;C=18;SAND='沙地'
FLATS=[('purple','紫草地',90,'#a58aca'),('teal','青草地',95,'#7bd8c5'),('metal','金属地板',100,'#9897c0'),('dirt','深色土地',154,'#dfaa88')]

# Full-cell textures and small islands are visual variants of their surrounding ground.
INTERIOR_VARIANTS=[(64,SAND,8),(129,'紫草地',1),(130,SAND,1),(134,'青草地',1),(135,SAND,1),(193,'深色土地',1),(194,SAND,1)]

def build_wang(source_dir, out, scale=2):
    """Build a shared flat-terrain atlas at the enclosing pack's pixel scale."""
    source_dir, out = Path(source_dir), Path(out)
    (out/'terrains').mkdir(parents=True,exist_ok=True)
    source=source_dir/'PNG/Tiles/Tilemap/tilemap_packed.png';sheet=Image.open(source).convert('RGBA');assert sheet.size==(288,208)
    def tile(n):return sheet.crop((n%C*T,n//C*T,n%C*T+T,n//C*T+T))
    columns,rows=10,7;atlas=Image.new('RGBA',(columns*T,rows*T));entries=[];used=set()
    for i in range(columns*rows):entries.append(dict(id=f'gap-{i}',edges=[SAND]*4,annotations=[None]*9))
    def place(n,x,y,cells,group):
        im=tile(n);atlas.paste(im,(x*T,y*T));i=y*columns+x
        entries[i]=dict(id=f'source-{n:04d}',edges=[cells[p] for p in [1,5,7,3]],annotations=cells)
        used.add(n)
        assert atlas.crop((x*T,y*T,(x+1)*T,(y+1)*T)).tobytes()==im.tobytes()
    for group,(_,label,start,_) in enumerate(FLATS):
        bx=group%2*5;by=group//2*3
        for r in range(3):
            for c in range(3):
                cells=[label if 0<=c+dx<3 and 0<=r+dy<3 else SAND for dy in [-1,0,1] for dx in [-1,0,1]]
                place(start+r*C+c,bx+c,by+r,cells,label)
        # Original inner corners: missing SE, SW, NE, NW respectively.
        for dx,dy,corner in [(0,0,8),(1,0,6),(0,1,2),(1,1,0)]:
            cells=[label]*9;cells[corner]=SAND
            place(start+3+dx+dy*C,bx+3+dx,by+dy,cells,label)
    place(65,9,5,[SAND]*9,SAND)
    for x,(n,label,weight) in enumerate(INTERIOR_VARIANTS):
        place(n,x,6,[label]*9,label)
        entries[6*columns+x]['weight']=weight
    # Plain interiors dominate; decorative clusters appear occasionally.
    for entry in entries:
        if entry['id'] in {'source-0065','source-0109','source-0114','source-0119','source-0173'}:
            entry['weight']=8
    labels=[SAND]+[r[1] for r in FLATS];colors={SAND:'#f3cdac',**{r[1]:r[3] for r in FLATS}}
    wang=dict(labels=labels,labelColors=colors,boundary=SAND,columns=columns,tiles=entries)
    terrain=dict(name='desert',label='沙漠地形',tiles='terrains/desert.png',connect='wang',wang=wang)
    atlas.resize((atlas.width*scale,atlas.height*scale),Image.Resampling.NEAREST).save(out/'terrains/desert.png')
    return terrain, used
