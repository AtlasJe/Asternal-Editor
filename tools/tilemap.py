#!/usr/bin/env python3
"""Shared asset metadata API and command line tools for Tilemap.

python3 tools/tilemap.py index
python3 tools/tilemap.py build [--out FILE] [--startup-map FILE]
"""
import argparse
import base64
import copy
import json
import os
import subprocess
import tempfile
import uuid
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

# Wang annotation encoding.
CODES='0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-_';
SOURCE_COLUMNS=18
def compact_source_id(id):
    if isinstance(id,str) and id.startswith('source-') and id[7:].isdigit():
        n=int(id[7:]);return f'{n%SOURCE_COLUMNS}_{n//SOURCE_COLUMNS}'
    return id
def expand_source_id(id):
    if isinstance(id,str) and id.count('_')==1 and all(part.isdigit() for part in id.split('_')):
        x,y=map(int,id.split('_'));return f'source-{y*SOURCE_COLUMNS+x:04d}'
    return id

def expand_wang(source):
    w=copy.deepcopy(source)
    if isinstance(w.get('labelColors'),list):
        if len(w['labelColors'])!=len(w['labels']):raise ValueError('Invalid Wang label colors')
        w['labelColors']=dict(zip(w['labels'],w['labelColors']))
    tiles=[]
    for i,row in enumerate(w['tiles']):
        if row is None:tile={'id':f'gap-{i}','annotations':[None]*9}
        elif isinstance(row,list):
            if len(row) not in (2,3) or not isinstance(row[0],(str,int)) or (isinstance(row[0],int) and row[0]<0) or not isinstance(row[1],str) or len(row[1])!=9:raise ValueError('Invalid Wang tile')
            def label(ch):
                if ch=='.':return None
                index=CODES.find(ch)
                if index<0 or index>=len(w['labels']):raise ValueError('Invalid Wang annotation')
                return w['labels'][index]
            tile={'id':f"source-{row[0]:04d}" if isinstance(row[0],int) else expand_source_id(row[0]),'annotations':[label(ch) for ch in row[1]]}
            if len(row)==3:tile['weight']=row[2]
        else:tile=row
        if not isinstance(tile,dict):raise ValueError('Invalid Wang tile')
        if 'edges' not in tile and 'annotations' in tile:tile['edges']=[tile['annotations'][p] if tile['annotations'][p] is not None else w['boundary'] for p in [1,5,7,3]]
        tiles.append(tile)
    w['tiles']=tiles
    return w

def compact_wang(source):
    w=copy.deepcopy(source)
    if len(w['labels'])>len(CODES):raise ValueError('Wang supports at most 64 labels')
    if w.get('labelColors') and all(label in w['labelColors'] for label in w['labels']):w['labelColors']=[w['labelColors'][label] for label in w['labels']]
    tiles=[]
    for i,tile in enumerate(w['tiles']):
        if tile.get('weight')==1:tile.pop('weight')
        if tile.get('placeable') is True:tile.pop('placeable')
        a=tile.get('annotations')
        if isinstance(a,list) and len(a)==9:
            if all(v is None for v in a):tile.pop('placeable',None)
            edges=[a[p] if a[p] is not None else w['boundary'] for p in [1,5,7,3]]
            if tile.get('edges')==edges:tile.pop('edges')
            if set(tile)<={'id','annotations','weight'}:
                if tile['id']==f'gap-{i}' and all(v is None for v in a) and 'weight' not in tile:
                    tiles.append(None);continue
                code=''.join('.' if label is None else CODES[w['labels'].index(label)] for label in a)
                compact_id=compact_source_id(tile['id'])
                tiles.append([compact_id,code]+([tile['weight']] if 'weight' in tile else []));continue
        tiles.append(tile)
    w['tiles']=tiles
    return w


# Asset metadata, validation and stable UUIDs.
KINDS = {'terrain': ('terrains', 'tiles'), 'object': ('objects', 'sprite'),
         'ui': ('ui', 'file'), 'font': ('fonts', 'file'), 'sound': ('sounds', 'file')}

def safe_path(root, name):
    if not isinstance(name, str) or not name or '\\' in name or Path(name).is_absolute():
        raise ValueError('Invalid asset path')
    path = (root / name).resolve()
    if not path.is_relative_to(root.resolve()):
        raise ValueError('Asset path escapes pack')
    return path

def read_pack(root):
    root = Path(root)
    if not (root / 'pack.meta').exists():
        data = json.loads((root / 'pack.json').read_text())
        if data.get('ui', {}).get('manifest'):
            name = data['ui']['manifest']
            data['ui'] = json.loads(safe_path(root,name).read_text())
            for e in data['ui']['elements']:
                e['file'] = str(Path(name).parent / e['file'])
        return data
    header = json.loads((root / 'pack.meta').read_text())
    if header.get('version') not in (1,2) or not isinstance(header.get('assets'),list):
        raise ValueError('Invalid pack.meta')
    result = {k:v for k,v in header.items() if k != 'assets'}
    result.update(format='tilemap-pack',version=1,metaVersion=header['version'],terrains=[], objects=[], ui={'elements':[]}, fonts=[], sounds=[])
    seen = set()
    seen_uuids = set()
    for name in header['assets']:
        meta = json.loads(safe_path(root,name).read_text())
        kind = next((k for k,v in KINDS.items() if v[0]==name.split('/')[0]),None)
        if kind is None or not name.endswith('.meta') or not isinstance(meta,dict):raise ValueError(f'Invalid metadata: {name}')
        group,key=KINDS[kind]
        file=name[:-5]
        if header['version']==1:
            if meta.get('format')!='tilemap-asset' or meta.get('version')!=1 or meta.get('pack')!=header['id'] or meta.get('kind')!=kind:raise ValueError(f'Invalid metadata: {name}')
            entry=dict(meta['data'])
            if entry[key]!=file:raise ValueError('Asset path mismatch')
        else:
            entry={**meta,'name':meta.get('name',Path(file).stem),key:file}
            if kind=='object':
                entry.setdefault('footprint',[1,1])
                entry['group']=next((g for g,files in header.get('groups',{}).items() if file in files),entry.get('group','场景'))
            if kind=='font':entry.setdefault('atlas',str(Path(file).with_suffix('.png')).replace('\\','/'))
            if entry.get('wang'):
                entry.pop('id',None)
                entry['wang']=expand_wang(entry['wang'])
        if not isinstance(entry.get('uuid'),str) or str(uuid.UUID(entry['uuid']))!=entry['uuid'] or entry['uuid'] in seen_uuids:raise ValueError(f'Invalid or duplicate UUID: {name}')
        seen_uuids.add(entry['uuid'])
        if (kind,entry['name']) in seen:raise ValueError(f'Duplicate asset: {name}')
        seen.add((kind,entry['name']))
        safe_path(root,entry[key])
        if kind=='font':safe_path(root,entry['atlas'])
        entry['metaPath']=name
        (result['ui']['elements'] if kind=='ui' else result[group]).append(entry)
    return result

def compact_entry(kind,entry,pack):
    data=copy.deepcopy(entry);key=KINDS[kind][1];file=data.pop(key)
    data.pop('metaPath',None)
    name=data.get('name',Path(file).stem)
    if name==Path(file).stem:data.pop('name',None)
    if data.get('label')==name:data.pop('label')
    data.pop('placeable',None)
    if data.get('frameCount')==1:data.pop('frameCount')
    if kind=='object':
        if data.get('footprint')==[1,1]:data.pop('footprint')
        data.pop('group',None)
    data.pop('colors',None)
    if kind=='ui':
        for k in ['sourceRect','size','variant','kind']:data.pop(k,None)
    if kind=='font':
        for k in ['sourceRect','format','characters']:data.pop(k,None)
        if data.get('atlas')==str(Path(file).with_suffix('.png')):data.pop('atlas')
    if data.get('wang'):
        data.pop('id',None)
        data['wang']=compact_wang(data['wang'])
    return data

def asset_uuids(root):
    return {str(p.relative_to(root)): json.loads(p.read_text()).get('uuid') for p in Path(root).rglob('*.meta') if p.name != 'pack.meta'}

def write_pack(root, manifest, existing_uuids=None):
    root = Path(root)
    root.mkdir(parents=True,exist_ok=True)
    existing_uuids = existing_uuids if existing_uuids is not None else asset_uuids(root)
    seen_uuids = set()
    header = {k:v for k,v in manifest.items() if k not in {'format','revision','credit','metaVersion','terrains','objects','ui','fonts','sounds','assets'}}
    header['version']=2
    header['groups'] = {}
    for entry in manifest.get('objects',[]):
        header['groups'].setdefault(entry.get('group','场景'),[]).append(entry['sprite'])
    header['assets'] = []
    for kind,(group,key) in KINDS.items():
        entries = manifest.get('ui',{}).get('elements',[]) if kind=='ui' else manifest.get(group,[])
        for entry in entries:
            entry = {k:v for k,v in entry.items() if k!='metaPath'}
            name = entry[key]+'.meta'
            if name in header['assets']:raise ValueError(f'Duplicate resource: {name}')
            entry['uuid'] = entry.get('uuid') or existing_uuids.get(name) or str(uuid.uuid5(uuid.NAMESPACE_URL, 'tilemap:'+manifest['id']+'/'+name))
            if str(uuid.UUID(entry['uuid'])) != entry['uuid'] or entry['uuid'] in seen_uuids:raise ValueError(f'Invalid or duplicate UUID: {name}')
            seen_uuids.add(entry['uuid'])
            path = safe_path(root,name)
            path.parent.mkdir(parents=True,exist_ok=True)
            meta = compact_entry(kind,entry,manifest['id'])
            path.write_text(json.dumps(meta,ensure_ascii=False,indent=2)+'\n')
            header['assets'].append(name)
    (root/'pack.meta').write_text(json.dumps(header,ensure_ascii=False,indent=2)+'\n')
    # Obsolete monolithic definitions are no longer runtime inputs.
    (root/'pack.json').unlink(missing_ok=True)
    (root/'ui/ui.json').unlink(missing_ok=True)


# Pack catalog and offline packaging.
def catalog(root=ROOT):
    return {'packs': sorted({p.parent.name for pattern in ('*/pack.meta','*/pack.json') for p in (root/'packs').glob(pattern)})}

def write_index():
    target = ROOT/'packs/index.json'
    target.write_text(json.dumps(catalog(), ensure_ascii=False, indent=2)+'\n')
    print(target)
    return target

def build_offline(out=None, startup_map=None):
    out = Path(out) if out is not None else ROOT/'地图编辑器.html'
    startup_map = Path(startup_map) if startup_map is not None else None
    packs=[]
    for folder in catalog()['packs']:
        path=ROOT/'packs'/folder/'pack.meta'
        manifest=read_pack(path.parent)
        names={t['tiles'] for t in manifest.get('terrains',[])}|{o['sprite'] for o in manifest.get('objects',[])}
        names.update(e['file'] for e in manifest.get('ui',{}).get('elements',[]))
        for font in manifest.get('fonts',[]):
            names.update([font['file'],font['atlas']])
        names.update(sound["file"] for sound in manifest.get("sounds",[]))
        files={}
        for name in sorted(names):
            asset=(path.parent/name).resolve()
            if not asset.is_relative_to(path.parent.resolve()):raise ValueError(f'Invalid asset path: {name}')
            files[name]=base64.b64encode(asset.read_bytes()).decode('ascii')
        packs.append(dict(folder=path.parent.name,manifest=manifest,files=files))
    payload=dict(config=json.loads((ROOT/'shared/config.json').read_text()),packs=packs)
    startup_file=payload['config'].get('map',{}).get('startupFile')
    if startup_map:
        startup_path=startup_map.resolve()
        payload['config']['map']['startupFile']=startup_path.name
        payload['startupMap']=startup_path.read_text(encoding='utf-8')
    elif startup_file:
        payload['startupMap']=(ROOT/startup_file).read_text(encoding='utf-8')
    with tempfile.TemporaryDirectory(prefix='tilemap-offline-') as temp:
        bundle=Path(temp)/'editor.js'
        npx = 'npx.cmd' if os.name == 'nt' else 'npx'
        subprocess.run([npx,'--yes','esbuild@0.25.12',str(ROOT/'web/main.js'),'--bundle','--format=iife','--target=es2022','--charset=utf8',f'--outfile={bundle}'],cwd=ROOT,check=True)
        js=bundle.read_text().replace('</script','<\\/script')
    data=json.dumps(payload,ensure_ascii=False,separators=(',',':')).replace('<','\\u003c')
    css=(ROOT/'shared/style.css').read_text()
    html=f'''<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover"><title>Editor de mapas Builda</title><style>{css}</style></head>
<body><div id="viewport"></div><div id="press-ring"></div>
<script>globalThis.__TILEMAP_OFFLINE__={data};</script>
<script>{js}</script></body></html>'''
    out.parent.mkdir(parents=True,exist_ok=True)
    out.write_text(html,encoding='utf-8')
    print(f'{out}: {len(packs)} packs, {out.stat().st_size/1024/1024:.1f} MiB; no server or network required')

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest='command', required=True)
    commands.add_parser('index', help='Update packs/index.json')
    build = commands.add_parser('build', help='Build the standalone offline editor')
    build.add_argument('--out', type=Path, default=ROOT/'地图编辑器.html')
    build.add_argument('--startup-map', type=Path, help='Override the embedded startup map')
    args = parser.parse_args()
    if args.command == 'index':
        write_index()
    else:
        build_offline(args.out, args.startup_map)

if __name__ == '__main__':
    main()
