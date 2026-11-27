'use client';

// XYZ tile layer of `GeoMap`, a lazy chunk mounted after hydration:
// the server renders the vector layers and the attribution only. Tiles are
// plain <img> elements positioned in percentages of the drawing, so the layer
// scales with the SVG through `viewBox`. GeoMap computes the tile grid (the
// projection code is in its entry already), so this chunk imports nothing
// from the entry and needs no preload helper or shared chunk.

import type { ReactNode } from 'react';
import type { tilesFor } from '#viz';
import type { GeoMapTiles } from './model.js';

export interface GeoMapTilesProps {
  readonly tiles: GeoMapTiles;
  readonly grid: ReturnType<typeof tilesFor>;
  readonly width: number;
  readonly height: number;
}

/** Fills an XYZ URL template. */
export function tileUrl(template: string, z: number, x: number, y: number, subdomains: readonly string[] = ['a', 'b', 'c']): string {
  const s = subdomains.length ? subdomains[(x + y) % subdomains.length]! : '';
  return template.replace('{z}', String(z)).replace('{x}', String(x)).replace('{y}', String(y)).replace('{s}', s);
}

export default function GeoMapTilesLayer(props: GeoMapTilesProps): ReactNode {
  const { grid, width, height, tiles } = props;
  const pct = (v: number, t: number) => `${(v / t) * 100}%`;
  return grid.tiles.map((t) => (
    <img
      key={`${grid.z}/${t.x}/${t.y}/${t.px}`}
      className="salmon-geo-map-tile"
      src={tileUrl(tiles.url, grid.z, t.x, t.y, tiles.subdomains)}
      alt=""
      draggable={false}
      decoding="async"
      style={{ left: pct(t.px, width), top: pct(t.py, height), width: pct(grid.size + 0.5, width), height: pct(grid.size + 0.5, height) }}
    />
  ));
}
