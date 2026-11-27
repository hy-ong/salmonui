'use client';

import { useState } from 'react';
import { Chart } from '@salmonui/charts/chart';
import type { ChartMarkerShape } from '@salmonui/charts/chart';
import { Select } from '@salmonui/dropdowns/select';

// Deterministic sample: height (cm) and weight (kg) of two groups.
const people = Array.from({ length: 40 }, (_, i) => {
  const h = 150 + ((i * 53) % 45);
  return { group: i % 2 ? 'B' : 'A', height: h, weight: Math.round(h * 0.45 - 20 + ((i * 29) % 17)) };
});
const groupA = people.filter((p) => p.group === 'A');
const groupB = people.filter((p) => p.group === 'B');

// Countries: GDP per capita (k$), life expectancy and population (sizeField).
const countries = [
  { name: 'Aland', gdp: 12, life: 68, pop: 40, color: '#2563eb' },
  { name: 'Borea', gdp: 24, life: 74, pop: 120, color: '#7c3aed' },
  { name: 'Corin', gdp: 35, life: 79, pop: 65, color: '#0f766e' },
  { name: 'Dalvi', gdp: 48, life: 81, pop: 18, color: '#b45309' },
  { name: 'Estra', gdp: 8, life: 63, pop: 210, color: '#be123c' },
  { name: 'Fenn', gdp: 56, life: 83, pop: 9, color: '#4d7c0f' },
];

const yields = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day, i) => ({ day, yield: 20 + ((i * 41) % 70) }));

type LegendMode = 'series' | 'point' | 'range' | 'gradient';

export default function ChartScatterBubbleDemo() {
  const [shape, setShape] = useState<ChartMarkerShape>('circle');
  const [mode, setMode] = useState<LegendMode>('range');
  return (
    <div className="demo-stack">
      <div className="demo-toolbar">
        <label>
          Group B marker
          <Select aria-label="Group B marker" data={['circle', 'rectangle', 'triangle', 'diamond', 'cross', 'plus', 'star', 'pentagon']} value={shape} onValueChange={(value) => value != null && setShape(value as ChartMarkerShape)} />
        </label>
        <label>
          Yield legend mode
          <Select aria-label="Yield legend mode" data={['series', 'point', 'range', 'gradient']} value={mode} onValueChange={(value) => value != null && setMode(value as LegendMode)} />
        </label>
      </div>
      <Chart
        title="Height and weight"
        height={280}
        xAxis={{ title: 'Height (cm)', min: 145, max: 200 }}
        yAxis={{ title: 'Weight (kg)', min: 40, max: 90 }}
        series={[
          { type: 'scatter', name: 'Group A', data: groupA, xField: 'height', yField: 'weight' },
          { type: 'scatter', name: 'Group B', data: groupB, xField: 'height', yField: 'weight', markers: { shape, size: 9 } },
        ]}
      />
      <Chart
        title="Wealth and health"
        data={countries}
        height={300}
        xAxis={{ title: 'GDP per capita (k$)', min: 0, max: 65 }}
        yAxis={{ title: 'Life expectancy', min: 55, max: 90 }}
        legend={{ mode: 'point' }}
        series={[{ type: 'bubble', name: 'Countries', xField: 'gdp', yField: 'life', sizeField: 'pop', radius: [6, 30], colorField: 'color', tooltipField: 'name' }]}
      />
      <Chart
        title="Yield by day"
        data={yields}
        height={260}
        legend={{ mode }}
        colorRanges={[
          { from: 0, to: 40, colors: ['#dc2626'], label: 'Low' },
          { from: 40, to: 70, colors: ['#b45309'], label: 'Medium' },
          { from: 70, to: 100, colors: ['#15803d'], label: 'High' },
        ]}
        series={[{ type: 'column', name: 'Yield', xField: 'day', yField: 'yield' }]}
      />
    </div>
  );
}
