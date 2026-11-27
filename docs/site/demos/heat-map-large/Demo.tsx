'use client';

import { useMemo } from 'react';
import { HeatMap } from '@salmonui/charts/heat-map';

// A 40 x 40 block of null values shows the empty-cell color.
export default function HeatMapLargeDemo() {
  const data = useMemo(() => Array.from({ length: 400 }, (_, y) => Array.from({ length: 400 }, (_, x) => x >= 300 && x < 340 && y >= 120 && y < 160 ? null : Math.sin(x / 25) * Math.cos(y / 18) + y / 400)), []);
  return <HeatMap title="160,000 cells" data={data} height={420} xAxis={{ interval: 50 }} yAxis={{ interval: 50 }} colorScale={{ domain: 'row', stops: [{ value: 0, color: '#fef3c7' }, { value: 1, color: '#b45309' }] }} />;
}
