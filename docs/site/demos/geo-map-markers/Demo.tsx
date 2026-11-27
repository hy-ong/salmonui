'use client';

import { useState } from 'react';
import { GeoMap } from '@salmonui/charts/geo-map';
import { CITIES, POPULATION, REGIONS, SEATS } from '../../lib/geo-fixture';

// Markers with clustering, bubbles, a route, a polygon and a planar seat map.
export default function GeoMapMarkersDemo() {
  const [clicked, setClicked] = useState('');
  return (
    <div style={{ display: 'grid', gap: 12, maxInlineSize: 640 }}>
      <GeoMap
        title="Cities"
        projection="winkelTripel"
        zoom
        layers={[
          {
            shapes: REGIONS,
            data: POPULATION,
            dataKey: 'region',
            bubbles: { valueField: 'population', radius: [4, 22] },
            getShapeStyle: (ctx) => (ctx.name === 'Central' ? { fill: '#c2410c' } : undefined),
            markers: { data: CITIES, labelField: 'name', shape: 'balloon', size: 16, cluster: true },
            routes: [{ points: [[55, -4], [45, 6], [36, 14]], curvature: 0.25, arrows: 'end', lineStyle: 'dashed' }],
            polygons: [{ points: [[50, 10], [47, 16], [42, 12]], color: '#9c27b0', label: 'Zone' }],
          },
        ]}
        annotations={[{ x: '50%', y: 30, content: <em>Route: Alpha to Delta</em> }]}
        tooltip
        onMapClick={(p) => setClicked(`${p.latitude.toFixed(2)}, ${p.longitude.toFixed(2)}`)}
      />
      <output>Clicked: {clicked || 'nothing yet'}</output>
      <GeoMap title="Seats" width={420} height={210} selection={{ multiple: true }} layers={[{ shapes: SEATS, geometry: 'planar', labels: true }]} />
    </div>
  );
}
