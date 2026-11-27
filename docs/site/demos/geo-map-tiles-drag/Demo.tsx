'use client';

import { useState } from 'react';
import { Button } from '@salmonui/buttons/button';
import { GeoMap } from '@salmonui/charts/geo-map';
import { REGIONS } from '../../lib/geo-fixture';

// A self-contained "debug" tile server: every tile is an SVG data URL that
// prints its own {z}/{x}/{y}, so the demo needs no network or API key. A real
// application points `url` at its provider, e.g.
// 'https://tile.example.com/{z}/{x}/{y}.png', and shows that provider's attribution.
const TILE_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256">' +
  '<rect width="256" height="256" fill="#eef4f8" stroke="#b6c8d6" stroke-width="2"/>' +
  '<path d="M0 128H256M128 0V256" stroke="#d3e0ea" stroke-dasharray="6 6"/>' +
  '<text x="12" y="28" font-family="monospace" font-size="18" fill="#56708a">z{z} x{x} y{y}</text></svg>';
const TILE_URL = `data:image/svg+xml,${encodeURIComponent(TILE_SVG).replace(/%7B/g, '{').replace(/%7D/g, '}')}`;

const INITIAL_STOPS = [
  { name: 'Depot', latitude: 55, longitude: -4 },
  { name: 'Warehouse', latitude: 45, longitude: 6 },
  { name: 'Store', latitude: 36, longitude: 14 },
];

/** An XYZ tile layer under vector regions, with delivery stops you can drag or move with the arrow keys. */
export default function GeoMapTilesDragDemo() {
  const [stops, setStops] = useState(INITIAL_STOPS);
  const [last, setLast] = useState('none');
  return (
    <div className="demo-stack" style={{ maxInlineSize: 640 }}>
      <GeoMap
        title="Delivery stops"
        subtitle="Drag a stop, or Tab to it and use the arrow keys"
        zoom
        layers={[
          {
            shapes: REGIONS,
            getShapeStyle: () => ({ fill: 'transparent', stroke: '#2563eb' }),
            tiles: { url: TILE_URL, attribution: <span>Demo tiles drawn in the page</span>, minZoom: 1, maxZoom: 8 },
            markers: { id: 'stops', data: stops, labelField: 'name', shape: 'balloon', size: 18, draggable: true },
          },
        ]}
        onMarkerMove={(move) => {
          setStops((all) => all.map((s, i) => (i === move.index ? { ...s, latitude: move.latitude, longitude: move.longitude } : s)));
          setLast(`${stops[move.index]?.name ?? move.markerId} → ${move.latitude.toFixed(2)}, ${move.longitude.toFixed(2)}`);
        }}
      />
      <p className="demo-status" aria-live="polite">
        Moved: <code>{last}</code>
      </p>
      <Button variant="outline" type="button" onClick={() => setStops(INITIAL_STOPS)}>
        Reset stops
      </Button>
    </div>
  );
}
