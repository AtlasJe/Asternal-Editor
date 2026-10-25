// Public loader for embedding a .tilemap in another PixiJS application.
import { loadConfig, objectDefs, terrainUsesCellPlacement, terrainHeights } from '../shared/grid.js';
import { fetchProjectPacks, fitSheet, mergePacks } from '../shared/packs.js';
import { readMapFile } from '../shared/map-file.js';
import { createPixiRenderer } from './renderer.js';

function imageFromBlob(blob) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob), image = new Image();
    image.onload = () => { URL.revokeObjectURL(url); resolve(image); };
    image.onerror = () => { URL.revokeObjectURL(url); reject(new Error('无法加载地图素材图片')); };
    image.src = url;
  });
}

function greyscale(img) {
  const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
  const x = c.getContext('2d'); x.drawImage(img, 0, 0); const d = x.getImageData(0, 0, c.width, c.height);
  for (let i = 0; i < d.data.length; i += 4) { const v = Math.round(d.data[i] * .299 + d.data[i + 1] * .587 + d.data[i + 2] * .114); d.data[i] = d.data[i + 1] = d.data[i + 2] = v; }
  x.putImageData(d, 0, 0); return c;
}

/** Load a tilemap and return a Pixi display object.
 * @param {string|URL} mapUrl URL of a .tilemap file
 * @param {{packsBase?: string, configUrl?: string, mount?: HTMLElement, app?: any}} options
 * @returns {Promise<{displayObject: import('pixi.js').Container, world: import('pixi.js').Container, map: any, config: any, app: any, renderer: any}>}
 */
export async function loadTilemap(mapUrl, options = {}) {
  const base = new URL(options.configUrl ?? '../shared/config.json', import.meta.url);
  const baseConfig = await (await fetch(base)).json();
  const packsBase = options.packsBase ?? new URL('../packs/', import.meta.url).href;
  const packs = await fetchProjectPacks(packsBase);
  const config = mergePacks(baseConfig, packs);
  const data = await (await fetch(mapUrl)).text();
  const map = readMapFile(data, config);
  map.terrains = config.terrains;
  const load = async (asset) => fitSheet(await imageFromBlob(packs.find(p => p.id === asset.pack?.id)?.files.get(asset.tiles ?? asset.sprite) ?? await (await fetch(asset.src)).blob()), { scale: asset.scale ?? 1, from: asset.layout, to: asset.connect === 'edge' ? config.edgeSheetLayout : config.sheetLayout });
  const sheets = await Promise.all(config.terrains.map(load));
  const objectSprites = await Promise.all(config.objects.map(load));
  map.objectDefs = objectDefs(config, objectSprites);
  const renderer = await createPixiRenderer({ config, map, sheets, greySheets: sheets.map(greyscale), objectSprites, greyObjectSprites: objectSprites.map(greyscale), mount: options.mount, app: options.app });
  return { displayObject: renderer.world, world: renderer.world, map, config, app: renderer.rendererApp, renderer };
}
