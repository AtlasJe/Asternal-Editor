import {encodeCells,decodeCells,splitTerrainRef} from './map-cells.js';
import {compactWangId,expandWangId} from './wang-meta.js';
import { offlineData, offlineManifest } from './offline.js';
import { validateWang } from './wang.js';
import {assemblePack,validAssetPath,validUUID,wangTilePlaceable} from './pack-meta.js';
// Pack headers index adjacent .meta files; runtime configuration is assembled in memory.

import { EMPTY, TileMap, objectDefs, terrainUsesCellPlacement, terrainHeights } from './grid.js';

const carriedProject = new URLSearchParams(location.search).get('project');
const CARRY_KEY = 'tilemap:carry' + (carriedProject ? ':' + carriedProject : '');

// ---- reading packs -----------------------------------------------------------------

// The development server discovers folders; static hosting uses packs/index.json.
export async function fetchProjectPacks(base = '../packs/') {
  if(offlineData())return offlineData().packs.map(pack=>{
    const files=new Map(Object.entries(pack.files).map(([path,data])=>{
      const bytes=Uint8Array.from(atob(data),c=>c.charCodeAt(0));return [path,new Blob([bytes],{type:'image/png'})];
    }));
    return makePack(offlineManifest(pack),files,pack.folder);
  });
  if (!base.endsWith('/')) base += '/';
  const response = await fetch(base + 'index.json', { cache: 'no-cache' });
  if (!response.ok) throw new Error(`读取素材目录失败: ${response.status}`);
  const { packs } = await response.json();
  if (!Array.isArray(packs) || packs.some(p => typeof p !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(p)))
    throw new Error('素材目录必须是 packs 下的包文件夹名称列表');
  const loaded = [];
  for (const folder of new Set(packs)) loaded.push(await fetchPack(base + folder));
  if (new Set(loaded.map(p => p.id)).size !== loaded.length) throw new Error('素材包 id 重复');
  return loaded;
}

export async function fetchPack(base) {
  if (!base.endsWith('/')) base += '/';
  let res = await fetch(base + 'pack.meta', { cache: 'no-cache' });
  let manifest;
  if(res.status===404){
    res=await fetch(base+'pack.json',{cache:'no-cache'});
    if(!res.ok)throw Error(`读取素材包失败：${res.status}`);
    manifest=await res.json();
  }else{
    if(!res.ok)throw Error(`读取 pack.meta 失败：${res.status}`);
    const header=await res.json(),documents={};
    if(!Array.isArray(header.assets)||header.assets.some(p=>!validAssetPath(p)))throw Error('素材索引格式不正确');
    for(let offset=0;offset<header.assets.length;offset+=8)await Promise.all(header.assets.slice(offset,offset+8).map(async path=>{
      const response=await fetch(base+path,{cache:'no-cache'});if(!response.ok)throw Error(`读取 ${path} 失败：${response.status}`);documents[path]=await response.json();
    }));
    manifest=assemblePack(header,documents);
  }
  const paths = [...new Set([...(manifest.terrains ?? []).map((t) => t.tiles), ...(manifest.objects ?? []).map((o) => o.sprite)])];
  const files = new Map();
  // Bound requests when reading every pack at startup.
  for (let offset = 0; offset < paths.length; offset += 8) await Promise.all(
    paths.slice(offset, offset + 8).map(async (p) => {
      const r = await fetch(base + p, { cache: 'no-cache' });
      if (!r.ok) throw new Error(`读取 ${base}${p} 失败: ${r.status}`);
      files.set(p, await r.blob());
    }),
  );
  return makePack(manifest, files, base.split('/').filter(Boolean).pop());
}

function makePack(manifest, files, folder) {
  if (manifest.format && manifest.format !== 'tilemap-pack') throw new Error(`素材包的 format 不是 tilemap-pack`);
  const id = slug(manifest.id ?? manifest.name ?? folder);
  const missing = [...(manifest.terrains ?? []).map((t) => t.tiles), ...(manifest.objects ?? []).map((o) => o.sprite)].filter(
    (p) => !files.has(p),
  );
  if (missing.length) throw new Error(`包里缺少图片：${missing.slice(0, 3).join('、')}${missing.length > 3 ? ' 等' : ''}`);
  return { id, name: manifest.name ?? folder, folder, manifest, files };
}

export function slug(s) {
  return String(s).trim().replace(/[\s/\\]+/g, '-') || 'pack';
}

// ---- merging into the config ---------------------------------------------------------

// Config with every pack's terrains and objects appended. Pack entries get
// a prefixed `name`, `src` (an object URL), `scale` (editor tile size / the
// pack's), `layout` (the pack's sheet layout, to rearrange into the editor's),
// `pack` ({ id, name }) and `group`.
export function mergePacks(config, packs) {
  const T = config.tileSize;
  const terrains = [];
  const objects = [];
  const assetUUIDs=new Set();
  for (const pack of packs) {
    for(const entry of [...pack.manifest.terrains,...pack.manifest.objects,...(pack.manifest.ui?.elements??[]),...(pack.manifest.fonts??[]),...(pack.manifest.sounds??[])]){
      if(!validUUID(entry.uuid)||assetUUIDs.has(entry.uuid))throw Error(`素材 UUID 无效或重复：${entry.name}`);assetUUIDs.add(entry.uuid);
    }
    const m = pack.manifest;
    const scale = T / (m.tileSize ?? T);
    const builtin = pack.id === 'builtin';
    const name = (n) => builtin ? n : `${pack.id}/${n}`;
    const ref = { id: builtin ? '' : pack.id, name: pack.name };
    const url = (p) => URL.createObjectURL(pack.files.get(p));
    for (const t of m.terrains ?? []) {
      validateWang(t);
      const edge = t.connect === 'edge';
      terrains.push({
        ...t,
        packManifest: m,
        packFolder: pack.folder ?? pack.id,
        packTerrainName: t.name,
        name: name(t.name),
        label: t.label ?? t.name,
        src: url(t.tiles),
        scale,
        layout: t.connect === 'wang' ? null : (edge ? m.edgeSheetLayout : m.sheetLayout) ?? null,
        pack: ref,
        group: '地形',
      });
    }
    for (const o of m.objects ?? []) {
      objects.push({
        ...o,
        name: name(o.name),
        placeable: true,
        label: o.label ?? o.name,
        src: url(o.sprite),
        scale,
        pack: ref,
        group: o.group ?? '物体',
        connects: o.connects ? { ...o.connects, terrain: name(o.connects.terrain) } : undefined,
      });
    }
  }
  if (terrains.length >= EMPTY) throw new Error(`地形太多（最多 ${EMPTY - 1} 种），请移除一些地块包`);
  return { ...config, terrains, objects };
}

// Draw `img` scaled by an integer-ish factor without smoothing (pixel art),
// and with its regions moved from `from` layout to `to` (4 x 4 masks).
export function fitSheet(img, { scale = 1, from = null, to = null, rows = 1 }) {
  const same = !from || !to || JSON.stringify(from) === JSON.stringify(to);
  if (scale === 1 && same) return img;
  const c = document.createElement('canvas');
  c.width = Math.round(img.width * scale);
  c.height = Math.round(img.height * scale);
  const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  if (same) {
    ctx.drawImage(img, 0, 0, c.width, c.height);
    return c;
  }
  const sw = img.width / 4;
  const sh = img.height / 4;
  const at = (layout) => new Map(layout.flatMap((row, r) => row.map((m, col) => [m, [col, r]])));
  const src = at(from);
  for (const [m, [col, r]] of at(to)) {
    const [sc, sr] = src.get(m);
    ctx.drawImage(img, sc * sw, sr * sh, sw, sh, col * sw * scale, r * sh * scale, sw * scale, sh * scale);
  }
  return c;
}

// ---- carrying the map over a reload ---------------------------------------------------

// Files reference asset UUIDs directly; numeric indices are only used in memory.
export function serializeMap(map, config) {
  const uuid=asset=>{if(!validUUID(asset?.uuid))throw Error('素材缺少有效 UUID');return asset.uuid;};
  return {
    v: 2,
    name: map.name ?? '未命名地图',
    width: map.width,
    height: map.height,
    tileSize: map.tileSize,
    backgroundColor: map.backgroundColor,
    active: map.active,
    dimInactive: map.dimInactive,
    layers: map.layers.map((l) => {
      const values=Array.from(l.grid.cells,(t,i)=>{if(t===EMPTY)return null;const base=uuid(config.terrains[t]),def=config.terrains[t]?.wang,id=l.grid.wang[i]?.tile;return def&&id?`${base}.${compactWangId(id)}`:base;});
      const encoded=encodeCells(values,l.objects.map(({type,...o})=>({...o,id:uuid(config.objects[type])})));
      return {
      assetMap: encoded.assetMap,
      name: l.name,
      visible: l.visible,
      offset: l.offset,
      cells: encoded.cells,
      links: Array.from(l.grid.links,v=>v.toString(16)).join(''),
      objects: encoded.objects,
    };}),
  };
}

// The map back, with terrains / object types missing from `config` dropped.
export function deserializeMap(data, config) {
  const { terrains } = config;
  const tIndex = new Map(terrains.map((t, i) => [t.uuid, i]));
  const oIndex = new Map((config.objects ?? []).map((o, i) => [o.uuid, i]));
  if(data.v!==2)throw Error("地图格式不正确，请使用 UUID 地图格式");
  const map = new TileMap(data.width, data.height, terrainHeights(terrains), terrainUsesCellPlacement(terrains));
  for (const l of data.layers) {
    const layer = map.createLayer(l.name);
    layer.visible = l.visible;
    layer.offset = l.offset;

    const refs = decodeCells(l,data.width*data.height);
    const cells=refs.map(ref=>splitTerrainRef(ref)?.uuid??ref);
    const links = Array.from(l.links,ch=>parseInt(ch,16));
    for (let i = 0; i < cells.length; i++) {
      const t = cells[i] === null ? EMPTY : tIndex.get(splitTerrainRef(cells[i])?.uuid ?? cells[i]) ?? EMPTY;
      layer.grid.cells[i] = t;
      layer.grid.links[i] = t === EMPTY ? 0 : links[i];
    }
    for(let i=0;i<refs.length;i++){
      const parsed=splitTerrainRef(refs[i]);if(!parsed?.variant)continue;
      const def=terrains[layer.grid.cells[i]]?.wang,tile=def?.tiles.find(t=>compactWangId(t.id)===parsed.variant);
      if(!tile||!wangTilePlaceable(tile))throw Error(`找不到 Wang 地块：${parsed.variant}`);
      layer.grid.wang[i]={tile:tile.id,edges:[...tile.edges],locked:false,...(tile.annotations?.[4]!=null?{center:tile.annotations[4]}:{})};
    }
    for (const o of l.objects) {
      const {id,...properties}=o;
      const type = oIndex.get(l.assetMap[id]);
      if (type !== undefined) layer.objects.push({ ...properties, type });
    }
    map.layers.push(layer);
  }
  map.active = Math.min(data.active, map.layers.length - 1);
  map.dimInactive = data.dimInactive;
  map.terrains = terrains;
  map.objectDefs = objectDefs(config);
  map.tileSize = data.tileSize ?? 32;
  map.name = data.name ?? '未命名地图';
  map.backgroundColor = data.backgroundColor ?? '#6b9fc4';
  for (const layer of map.layers) map.refreshPorts(layer);
  return map;
}

export function carryMap(map, config) {
  try {
    sessionStorage.setItem(CARRY_KEY, JSON.stringify(serializeMap(map, config)));
  } catch (err) {
    console.warn('地图太大，无法在重新载入时保留', err);
  }
}

// The map carried over the last reload (once), or null.
export function takeCarriedMap(config) {
  let raw = null;
  try {
    raw = sessionStorage.getItem(CARRY_KEY);
    sessionStorage.removeItem(CARRY_KEY);
  } catch {
    return null;
  }
  if (!raw) return null;
  try {
    return deserializeMap(JSON.parse(raw), config);
  } catch (err) {
    console.warn('无法恢复地图', err);
    return null;
  }
}

