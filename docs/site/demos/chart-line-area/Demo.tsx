'use client';

import { useState } from 'react';
import { Checkbox } from '@salmonui/inputs/checkbox';
import { Select } from '@salmonui/dropdowns/select';
import { Chart } from '@salmonui/charts/chart';
import type { ChartCurve } from '@salmonui/charts/chart';

// Nested records: `yField: 'temp.avg'` reads a dotted path.
const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const weather = months.map((month, i) => {
  const avg = Math.round((12 + 10 * Math.sin(((i - 3) / 12) * 2 * Math.PI)) * 10) / 10;
  return { month, index: i + 1, temp: { avg, low: Math.round((avg - 4 - (i % 3)) * 10) / 10, high: Math.round((avg + 5 + (i % 2)) * 10) / 10 }, rain: 40 + ((i * 37) % 60) };
});

export default function ChartLineAreaDemo() {
  const [curve, setCurve] = useState<ChartCurve>('monotone');
  const [stepPosition, setStepPosition] = useState<'start' | 'center' | 'end'>('center');
  const [risers, setRisers] = useState(true);
  const [showRain, setShowRain] = useState(true);
  return (
    <div className="demo-stack">
      <div className="demo-toolbar">
        <label>
          Curve
          <Select aria-label="Curve" data={(['linear', 'natural', 'monotone', 'cardinal', 'clamped', 'step'] as const).map((c) => ({ value: c, label: c }))} value={curve} onValueChange={(value) => value != null && setCurve(value as ChartCurve)} />
        </label>
        <label>
          Step position
          <Select aria-label="Step position" data={[{ value: 'start', label: 'start' }, { value: 'center', label: 'center' }, { value: 'end', label: 'end' }]} value={stepPosition} onValueChange={(value) => value != null && setStepPosition(value as 'start' | 'center' | 'end')} disabled={curve !== 'step'} />
        </label>
        <Checkbox checked={risers} onCheckedChange={(checked) => setRisers(checked)} disabled={curve !== 'step'}>Risers</Checkbox>
        <Checkbox checked={showRain} onCheckedChange={(checked) => setShowRain(checked)}>Rain series</Checkbox>
      </div>
      <Chart
        title="Temperature and rain"
        subtitle="Range area, line and a segmented area"
        data={weather}
        height={320}
        yAxis={{ title: '°C' }}
        axes={[{ id: 'rain', direction: 'y', position: 'end', title: 'mm', gridLines: false }]}
        series={[
          { type: 'area', name: 'Low to high', xField: 'month', lowField: 'temp.low', highField: 'temp.high', curve, opacity: 0.35, order: 0 },
          {
            type: 'line',
            name: 'Average',
            xField: 'month',
            yField: 'temp.avg',
            curve,
            stepPosition,
            risers,
            markers: true,
            // A data color per segment along y: blue below 8 °C, orange above 18 °C.
            segments: [
              { until: 8, color: '#2563eb' },
              { until: 18, color: '#6b7280' },
              { color: '#c2410c', lineStyle: 'dashed' },
            ],
            segmentAxis: 'y',
          },
          { type: 'area', name: 'Rain', xField: 'month', yField: 'rain', yAxis: 'rain', curve, hidden: !showRain, opacity: 0.25, lineStyle: 'dotted' },
        ]}
      />
    </div>
  );
}
