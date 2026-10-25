(function (root) {
  'use strict';
  const palette = ['#718b62', '#a48a65', '#657f8e', '#777d80', '#8a695e'];

  function migrateLegacyTilemap(project) {
    const scene = project?.scene;
    if (!scene || scene.legacyTilemapImported || Object.keys(scene.tiles || {}).length || typeof project.tilemap !== 'string') return false;
    try {
      const map = JSON.parse(project.tilemap);
      if (map?.v !== 2 || !Number.isInteger(map.width) || !Number.isInteger(map.height) || !Array.isArray(map.layers)) return false;
      const size = Math.max(8, Math.min(128, Number(map.tileSize) || 32));
      const tiles = {};
      for (const layer of map.layers) {
        if (layer.visible === false || typeof layer.cells !== 'string' || !layer.assetMap) continue;
        for (let index = 0; index < Math.min(layer.cells.length, map.width * map.height); index++) {
          const reference = layer.assetMap[layer.cells[index]];
          if (!reference) continue;
          let hash = 0;
          for (const char of String(reference)) hash = (hash * 31 + char.charCodeAt(0)) | 0;
          const x = index % map.width, y = Math.floor(index / map.width) + (Math.round(Number(layer.offset) || 0));
          if (y >= 0 && y < map.height) tiles[`${x},${y}`] = palette[(hash >>> 0) % palette.length];
        }
      }
      scene.width = map.width * size;
      scene.height = map.height * size;
      scene.tileSize = size;
      scene.background = /^#[0-9a-f]{6}$/i.test(map.backgroundColor || '') ? map.backgroundColor : scene.background;
      scene.tiles = tiles;
      scene.legacyTilemapImported = true;
      return true;
    } catch { return false; }
  }

  function setTile(scene, x, y, color) {
    if (!scene.tiles || typeof scene.tiles !== 'object') scene.tiles = {};
    const key = `${x},${y}`;
    if (!color) {
      if (!Object.hasOwn(scene.tiles, key)) return false;
      delete scene.tiles[key];
      return true;
    }
    if (scene.tiles[key] === color) return false;
    scene.tiles[key] = color;
    return true;
  }

  root.AsternalSceneModel = { migrateLegacyTilemap, setTile };
})(globalThis);
