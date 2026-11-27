'use client';

import { useState } from 'react';
import { GeoMap, type GeoMapProjection, type GeoMapView } from '@salmonui/charts/geo-map';
import { Select } from '@salmonui/dropdowns/select';
import { POPULATION, REGIONS } from '../../lib/geo-fixture';

const PROJECTIONS: GeoMapProjection[] = ['mercator', 'equirectangular', 'miller', 'eckert3', 'eckert5', 'eckert6', 'winkelTripel', 'aitoff'];

// A choropleth with every interaction on and a projection picker.
export default function GeoMapChoroplethDemo() {
  const [projection, setProjection] = useState<GeoMapProjection>('mercator');
  const [selected, setSelected] = useState<readonly string[]>([]);
  const [view, setView] = useState<GeoMapView | undefined>(undefined);
  return (
    <div style={{ display: 'grid', gap: 12, maxInlineSize: 640 }}>
      <label>
        Projection{' '}
        <Select aria-label="Projection" data={PROJECTIONS} value={projection} onValueChange={(value) => value != null && setProjection(value as GeoMapProjection)} />
      </label>
      <GeoMap
        title="Population"
        subtitle="Invented regions"
        projection={projection}
        layers={[
          {
            shapes: REGIONS,
            data: POPULATION,
            dataKey: 'region',
            colorScale: { kind: 'range', field: 'population', stops: [{ from: 0, to: 20, color: '#4d92c5', label: 'Under 20' }, { from: 20, to: 40, color: '#357bb6', label: '20 to 40' }, { from: 40, to: 100, color: '#2168aa', label: '40 and more' }] },
            labels: { overflow: 'hide' },
          },
        ]}
        legend
        tooltip
        zoom
        view={view}
        onViewChange={setView}
        selection={{ multiple: true }}
        selectedShapes={selected}
        onSelectedShapesChange={setSelected}
      />
      <output>Selected: {selected.length ? selected.join(', ') : 'none'}</output>
    </div>
  );
}
