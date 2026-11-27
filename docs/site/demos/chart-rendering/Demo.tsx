'use client';

import { useMemo, useState } from 'react';
import { Chart } from '@salmonui/charts/chart';
import { Checkbox } from '@salmonui/inputs/checkbox';
import { Select } from '@salmonui/dropdowns/select';

type Renderer = 'svg' | 'canvas' | 'auto';
type Decimation = 'auto' | 'lttb' | 'minMax' | 'off';

const brand = ['#1d4ed8', '#b45309', '#047857', '#7c3aed'];
// Nested records read through dotted field paths.
const regions = ['North', 'South', 'East', 'West', 'Central'].map((name, i) => ({ name, sales: { actual: 40 + ((i * 17) % 35), target: 55 } }));

export default function ChartRenderingDemo() {
  const [count, setCount] = useState(100_000);
  const [renderer, setRenderer] = useState<Renderer>('auto');
  const [decimation, setDecimation] = useState<Decimation>('auto');
  const [showTable, setShowTable] = useState(false);
  const [brandColors, setBrandColors] = useState(false);
  // Computed once per count, outside the chart render.
  const signal = useMemo(() => Array.from({ length: count }, (_, i) => ({ i, v: Math.sin(i / 500) * 50 + Math.sin(i / 7) * 8 + ((i * 7919) % 13) })), [count]);
  return (
    <div className="demo-stack">
      <div className="demo-toolbar">
        <label>
          Points
          <Select aria-label="Points" data={[{ value: 1000, label: '1,000' }, { value: 100000, label: '100,000' }, { value: 500000, label: '500,000' }]} value={count} onValueChange={(value) => value != null && setCount(Number(value))} />
        </label>
        <label>
          Renderer
          <Select aria-label="Renderer" data={['svg', 'canvas', 'auto']} value={renderer} onValueChange={(value) => value != null && setRenderer(value as Renderer)} />
        </label>
        <label>
          Decimation
          <Select aria-label="Decimation" data={[{ value: 'auto', label: 'auto' }, { value: 'lttb', label: 'lttb' }, { value: 'minMax', label: 'minMax' }, { value: 'off', label: 'false' }]} value={decimation} onValueChange={(value) => value != null && setDecimation(value as Decimation)} />
        </label>
      </div>
      <Chart
        title="Vibration signal"
        description={`${count.toLocaleString('en-US')} samples; decimation keeps the extremes of every pixel column.`}
        data={signal}
        height={260}
        legend={false}
        renderer={renderer}
        decimation={decimation === 'off' ? false : decimation}
        series={[{ type: 'line', name: 'Signal', xField: 'i', yField: 'v' }]}
      />
      <div className="demo-toolbar">
        <Checkbox checked={showTable} onCheckedChange={(checked) => setShowTable(checked)}>
          Show the data table
        </Checkbox>
        <Checkbox checked={brandColors} onCheckedChange={(checked) => setBrandColors(checked)}>
          Brand palette (data colors)
        </Checkbox>
      </div>
      <Chart
        title="Sales against target"
        data={regions}
        height={260}
        showDataTable={showTable}
        palette={brandColors ? brand : undefined}
        series={[
          {
            type: 'column',
            name: 'Actual',
            xField: 'name',
            yField: 'sales.actual',
            // Called once per drawn point: below-target columns get a data color.
            getPointStyle: (p) => (p.y < 50 ? { color: '#dc2626' } : undefined),
          },
          { type: 'line', name: 'Target', xField: 'name', yField: 'sales.target', lineStyle: 'dashed' },
        ]}
      />
    </div>
  );
}
