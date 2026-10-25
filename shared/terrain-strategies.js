import { wangFrame } from './wang.js';

// Peer terrain placement algorithms. They share TerrainGrid data, but each
// strategy owns how a terrain selects its atlas frame.
export class DualGrid {
  static mask(grid, x, y, terrain) {
    return grid.cornerMask(x, y, terrain);
  }
}

export class EdgeGrid {
  static mask(grid, x, y) {
    const i = y * grid.width + x;
    const value = grid.cells[i];
    const links = grid.links[i];
    let mask = 0;
    for (const direction of grid.directions) {
      if (!(links & direction.bit)) continue;
      const nx = x + direction.dx;
      const ny = y + direction.dy;
      if (!grid.inBounds(nx, ny)) continue;
      const j = ny * grid.width + nx;
      if (grid.cells[j] === value && grid.links[j] & direction.back) mask |= direction.bit;
      else if (grid.portTerrain[j] === value && grid.ports[j] & direction.back) mask |= direction.bit;
    }
    return mask;
  }
}

export class WangGrid {
  static mask(terrain, grid, x, y) {
    return wangFrame(terrain, grid, x, y);
  }
}

export function terrainStrategy(terrain) {
  if (terrain?.connect === 'wang') return WangGrid;
  if (terrain?.connect === 'edge') return EdgeGrid;
  return DualGrid;
}

export function terrainMask(terrain, grid, x, y, terrainIndex) {
  const strategy = terrainStrategy(terrain);
  return strategy === WangGrid
    ? strategy.mask(terrain, grid, x, y)
    : strategy.mask(grid, x, y, terrainIndex);
}
