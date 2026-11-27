'use client';

import { useState } from 'react';
import { Chart } from '@salmonui/charts/chart';
import { Slider } from '@salmonui/inputs/slider';
import { Select } from '@salmonui/dropdowns/select';

const quarters = ['Q1', 'Q2', 'Q3', 'Q4'];
const sales = quarters.map((quarter, i) => ({
  quarter,
  north: 42 + i * 6,
  south: 30 + ((i * 7) % 12),
  west: 18 + i * 4,
  returns: -(4 + (i % 3) * 2),
  low: 20 + i * 3,
  high: 48 + i * 5,
  target: 36 + i * 4,
}));

type Stack = 'none' | 'stack' | 'percent';

export default function ChartColumnsStacksDemo() {
  const [stack, setStack] = useState<Stack>('stack');
  const [type, setType] = useState<'column' | 'bar'>('column');
  const [grouping, setGrouping] = useState<'sideBySide' | 'overlap'>('sideBySide');
  const [bandWidth, setBandWidth] = useState(0.7);
  const stacked = stack === 'none' ? undefined : stack === 'percent' ? ('percent' as const) : true;
  return (
    <div className="demo-stack">
      <div className="demo-toolbar">
        <label>
          Type
          <Select aria-label="Type" data={['column', 'bar']} value={type} onValueChange={(value) => value != null && setType(value as 'column' | 'bar')} />
        </label>
        <label>
          Stack
          <Select aria-label="Stack" data={[{ value: 'none', label: 'none' }, { value: 'stack', label: 'stack: true' }, { value: 'percent', label: 'stack: percent' }]} value={stack} onValueChange={(value) => value != null && setStack(value as Stack)} />
        </label>
        <label>
          Grouping
          <Select aria-label="Grouping" data={['sideBySide', 'overlap']} value={grouping} onValueChange={(value) => value != null && setGrouping(value as 'sideBySide' | 'overlap')} disabled={stack !== 'none'} />
        </label>
        <Slider label="Band width" min={0.2} max={1} step={0.1} value={bandWidth} onValueChange={setBandWidth} style={{ inlineSize: 160 }} />
      </div>
      <Chart
        title="Units by region"
        data={sales}
        height={300}
        grouping={grouping}
        stackLabels={stacked === true}
        series={[
          { type, name: 'North', xField: 'quarter', yField: 'north', stack: stacked, bandWidth, gap: 0.1 },
          { type, name: 'South', xField: 'quarter', yField: 'south', stack: stacked, bandWidth, gap: 0.1 },
          { type, name: 'West', xField: 'quarter', yField: 'west', stack: stacked, bandWidth, gap: 0.1 },
          { type, name: 'Returns', xField: 'quarter', yField: 'returns', stack: stacked, bandWidth, gap: 0.1 },
        ]}
      />
      <Chart
        title="Price range and target"
        subtitle="Horizontal orientation: range bars combined with a line"
        data={sales}
        height={260}
        orientation="horizontal"
        series={[
          { type: 'column', name: 'Price range', xField: 'quarter', lowField: 'low', highField: 'high' },
          { type: 'line', name: 'Target', xField: 'quarter', yField: 'target', markers: true },
        ]}
      />
    </div>
  );
}
