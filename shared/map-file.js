import {decodeCells,splitTerrainRef} from './map-cells.js';
import {validUUID,wangTilePlaceable} from './pack-meta.js';
import {expandWangId,compactWangId} from './wang-meta.js';
import { serializeMap, deserializeMap } from './packs.js';

export function writeMapFile(map, config) {
  return JSON.stringify({ format: 'tilemap', ...serializeMap(map, config) }, null, 2);
}

export function readMapFile(text, config) {
  const data = JSON.parse(text);
  const invalid = () => { throw new Error('地图文件格式不正确或已损坏'); };
  if (!data || data.v !== 2 || (data.format && data.format !== 'tilemap') ||
      (data.name !== undefined && (typeof data.name !== 'string' || !data.name.trim() || data.name.length > 80)) ||
      (data.tileSize !== undefined && (!Number.isInteger(data.tileSize) || data.tileSize < 8 || data.tileSize > 128)) ||
      (data.backgroundColor !== undefined && (typeof data.backgroundColor !== 'string' || !/^#[0-9a-f]{6}$/i.test(data.backgroundColor))) ||
      !Number.isInteger(data.width) || data.width < 1 || data.width > 512 ||
      !Number.isInteger(data.height) || data.height < 1 || data.height > 512 ||
      !Array.isArray(data.layers) || !data.layers.length || data.layers.length > 256 ||
      !Number.isInteger(data.active) || data.active < 0 || data.active >= data.layers.length ||
      typeof data.dimInactive !== 'boolean') invalid();
  const terrainByUUID = new Map(config.terrains.map(t => [t.uuid, t]));
  const terrains = new Set(terrainByUUID.keys());
  const objects = new Set((config.objects ?? []).map(o => o.uuid));
  const missing = new Set();
  for (const layer of data.layers) {
    if (!layer || typeof layer.name !== 'string' || typeof layer.visible !== 'boolean' ||
        !Number.isFinite(layer.offset) || !Array.isArray(layer.objects) ||
        typeof layer.links !== 'string') invalid();
    const cells = decodeCells(layer,data.width*data.height);
    const links=layer.links;
    if(!/^[0-9a-f]*$/.test(links))invalid();
    if (cells.length !== data.width * data.height || links.length !== cells.length) invalid();
    for (let i = 0; i < cells.length; i++) {
      const t = cells[i];
      if (t === null) continue;
      const parsed=splitTerrainRef(t),uuid=parsed?.uuid??t;if (!validUUID(uuid)) invalid();
      if (!terrains.has(uuid)) missing.add(uuid);
      if(parsed?.variant){const def=terrainByUUID.get(uuid)?.wang;if(!def||!def.tiles.some(v=>compactWangId(v.id)===parsed.variant))invalid();}
    }
    for (const o of layer.objects) {
      if (!o || typeof o.id!=='string' || o.id.length!==1 || !Object.hasOwn(layer.assetMap,o.id) || !validUUID(layer.assetMap[o.id]) ||
          !Number.isInteger(o.x) || !Number.isInteger(o.y) ||
          (o.name !== undefined && typeof o.name !== 'string')) invalid();
      if (!objects.has(layer.assetMap[o.id])) missing.add(layer.assetMap[o.id]);
    }
  }
  if (missing.size) throw new Error(`请先打开地图使用的图块集：${[...missing].slice(0, 5).join('、')}`);
  return deserializeMap(data, config);
}
