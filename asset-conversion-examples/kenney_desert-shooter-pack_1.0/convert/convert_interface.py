#!/usr/bin/env python3
"""Extract semantic UI and AngelCode BMFont assets; preserve native RGBA pixels.
Run independently to update only Interface assets without resetting Wang annotations.
"""
import argparse
import json
from pathlib import Path
import sys
sys.path.insert(0,str(Path(__file__).resolve().parents[3]/"tools"))
from tilemap import read_pack, write_pack
from PIL import Image, ImageDraw

SOURCE = 'PNG/Interface/Tilemap/tilemap_packed.png'
CHARS = '%+-0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ'


def convert_interface(source, out, manifest):
    source, out = Path(source), Path(out)
    im = Image.open(source / SOURCE).convert('RGBA')
    assert im.size == (288, 176)
    for folder in ('ui', 'fonts'):
        (out / folder).mkdir(parents=True, exist_ok=True)
    entries, coverage = [], Image.new('1', im.size)
    cover = ImageDraw.Draw(coverage)

    def asset(name, label, rect, kind, **extra):
        x, y, w, h = rect
        crop = im.crop((x, y, x+w, y+h))
        crop.save(out / f'ui/{name}.png')
        cover.rectangle((x, y, x+w-1, y+h-1), fill=1)
        entries.append(dict(name=name, label=label, kind=kind, file=f'{name}.png',
                            sourceRect=rect, size=[w,h], **extra))

    panels = [('panel_round_gold','金色圆形面板'),('panel_gold','金色方形面板'),
              ('panel_red_inset','红色内凹面板'),('panel_purple','紫色面板'),
              ('panel_red','红色面板'),('panel_blue','蓝色面板')]
    for i, (name, label) in enumerate(panels):
        asset(name,label,[48*i,0,48,48],'panel', **({} if i == 0 else {'nineSlice':[8,8,8,8]}))
    icons = [
        ('skull_small','小骷髅'),('skull_large','大骷髅'),('chevron_small','小双斜线'),
        ('chevron_large','大双斜线'),('bullet','子弹'),('badge_purple','紫色徽章'),('badge_gold','金色徽章'),
        ('cross_small','小红叉'),('cross_large','大红叉'),('pointer_small','小箭头'),
        ('pointer_large','大箭头'),('meter_vertical','竖向双色条'),('projectile','横向弹丸'),('arrow_up','向上箭头')]
    for i,(name,label) in enumerate(icons):
        asset(name,label,[i%7*16,48+i//7*16,16,16],'icon')
    for row in range(2):
        for color,x in [('red',112),('purple',176)]:
            for shape,dx,w in [('wide',0,48),('square',48,16)]:
                asset(f'button_{color}_{shape}_{row+1}',f'{color} {shape} 边框样式 {row+1}',
                      [x+dx,48+row*16,w,16],'button',nineSlice=[4,4,4,4],variant=row+1)
    asset('outline_panel','白色轮廓面板',[240,48,48,48],'panel',nineSlice=[3,3,3,3])
    asset('outline_square','白色方框',[208,80,16,16],'frame',nineSlice=[3,3,3,3])
    asset('outline_round','白色圆角框',[224,80,16,16],'frame',nineSlice=[4,4,4,4])
    # Framed meters share one outer border: keep the complete 64px control.
    # Unframed fills are independent long/short/small parts.
    for style,y in [('empty',96),('red',112),('blue',128),('red_fill',144),('blue_fill',160)]:
        for size,x,w in ([('wide',208,64),('small',272,16)] if 'fill' not in style else [('long',208,40),('short',248,24),('small',272,16)]):
            asset(f'bar_{style}_{size}',f'{style} {size} 进度条', [x,y,w,16],
                  'progress-fill' if 'fill' in style else 'progress-track',horizontalSlice=[4,4])
    for stale in (out/'ui').glob('*.png'):
        if stale.name not in {e['file'] for e in entries}:
            stale.unlink()
    for entry in entries:entry['file']='ui/'+entry['file']

    fonts=[]
    for style,start_y in [('shadow',80),('plain',128)]:
        atlas=Image.new('RGBA',(13*16,3*16))
        records=[]
        for i,ch in enumerate(CHARS):
            x,y=i%13*16,start_y+i//13*16
            tile=im.crop((x,y,x+16,y+16));atlas.paste(tile,(i%13*16,i//13*16))
            cover.rectangle((x,y,x+15,y+15),fill=1)
            box=tile.getbbox();l,t,r,b=box
            records.append(dict(id=ord(ch),x=i%13*16+l,y=i//13*16+t,width=r-l,height=b-t,
                                xoffset=0,yoffset=t,xadvance=r-l+1,page=0,chnl=15))
        name=f'desert-{style}'
        atlas.save(out/f'fonts/{name}.png')
        lines=[f'info face="Kenney Desert {style}" size=16 bold=0 italic=0 charset="" unicode=1 stretchH=100 smooth=0 aa=1 padding=0,0,0,0 spacing=1,1',
               'common lineHeight=16 base=13 scaleW=208 scaleH=48 pages=1 packed=0',
               f'page id=0 file="{name}.png"',f'chars count={len(records)+1}',
               'char id=32 x=0 y=0 width=0 height=0 xoffset=0 yoffset=0 xadvance=5 page=0 chnl=15']
        lines += ['char '+' '.join(f'{k}={v}' for k,v in rec.items()) for rec in records]
        lines.append('kernings count=0')
        (out/f'fonts/{name}.fnt').write_text('\n'.join(lines)+'\n')
        fonts.append(dict(name=name,format='AngelCode BMFont text',file=f'fonts/{name}.fnt',
                          atlas=f'fonts/{name}.png',characters=' '+CHARS,sourceRect=[0,start_y,208,48]))
    # Every visible source pixel must be assigned, including white outlines.
    uncovered=sum(1 for a,c in zip(im.getchannel('A').get_flattened_data(),coverage.get_flattened_data()) if a and not c)
    assert uncovered == 0, f'{uncovered} visible source pixels unassigned'
    manifest['objects']=[o for o in manifest['objects'] if not o['name'].startswith('interface_')]
    manifest['ui']={'elements':entries}
    manifest['fonts']=fonts
    manifest['revision']=manifest.get('revision',0)+1
    return manifest


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source',type=Path,nargs='?',default=Path(__file__).resolve().parents[1])
    parser.add_argument('--out',type=Path,default=Path(__file__).resolve().parents[3]/'packs'/'kenney-desert')
    args=parser.parse_args()
    manifest=read_pack(args.out)
    # Refuse to remove tiles used by any local map instance.
    for path in args.out.parents[1].glob('maps/**/*.tilemap'):
        data=json.loads(path.read_text())
        used={data['objects'][o['type']] for layer in data['layers'] for o in layer['objects']}
        assert not any(n.startswith('kenney-desert/interface_') for n in used), f'UI tiles used by {path}'
    convert_interface(args.source,args.out,manifest)
    write_pack(args.out,manifest)
    for path in (args.out/'objects').glob('interface_*.png'):path.unlink()
    print('Converted Interface: 43 UI elements, two bitmap fonts; scene assets unchanged.')

if __name__=='__main__':main()
