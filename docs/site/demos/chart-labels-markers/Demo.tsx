'use client';

import { useState } from 'react';
import { Chart } from '@salmonui/charts/chart';
import type { ChartDataLabels } from '@salmonui/charts/chart';
import { Checkbox } from '@salmonui/inputs/checkbox';
import { Select } from '@salmonui/dropdowns/select';

const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug'];
const prices = months.map((month, i) => ({ month, coffee: 4.1 + ((i * 3) % 5) / 10, tea: 4.0 + ((i * 2) % 5) / 10, cocoa: 3.2 + i * 0.12 }));
const signups = months.map((month, i) => ({ month, signups: i === 3 ? 0 : 120 + ((i * 47) % 90) }));

type Position = NonNullable<ChartDataLabels['position']>;
type Overlap = NonNullable<ChartDataLabels['overlap']>;

export default function ChartLabelsMarkersDemo() {
  const [position, setPosition] = useState<Position>('top');
  const [angle, setAngle] = useState(0);
  const [showZero, setShowZero] = useState(true);
  const [overlap, setOverlap] = useState<Overlap>('shiftY');
  const [dedupe, setDedupe] = useState(false);
  const [badges, setBadges] = useState(true);
  return (
    <div className="demo-stack">
      <div className="demo-toolbar">
        <label>
          Label position
          <Select aria-label="Label position" data={['outside', 'top', 'middle', 'bottom', 'auto']} value={position} onValueChange={(value) => value != null && setPosition(value as Position)} />
        </label>
        <label>
          Angle
          <Select aria-label="Angle" data={[{ value: 0, label: '0' }, { value: -45, label: '-45' }, { value: -90, label: '-90' }]} value={angle} onValueChange={(value) => value != null && setAngle(Number(value))} />
        </label>
        <Checkbox checked={showZero} onCheckedChange={(checked) => setShowZero(checked)}>
          showZero
        </Checkbox>
      </div>
      <Chart
        title="Sign-ups"
        subtitle="April had a site outage"
        data={signups}
        height={260}
        legend={false}
        annotations={[{ x: 'Apr', y: 60, content: <span className="demo-badge">Outage</span> }, { x: 128, y: 18, units: 'pixel', content: <span className="demo-badge" data-tone="info">Preliminary</span> }]}
        series={[
          {
            type: 'column',
            name: 'Sign-ups',
            xField: 'month',
            yField: 'signups',
            labels: { position, angle, showZero, format: '{value} users' },
          },
        ]}
      />
      <div className="demo-toolbar">
        <label>
          Label overlap
          <Select aria-label="Label overlap" data={['none', 'hide', 'shiftY', 'shiftX', 'rotate90']} value={overlap} onValueChange={(value) => value != null && setOverlap(value as Overlap)} />
        </label>
        <Checkbox checked={dedupe} onCheckedChange={(checked) => setDedupe(checked)}>
          dedupe
        </Checkbox>
        <Checkbox checked={badges} onCheckedChange={(checked) => setBadges(checked)}>
          Last value and inline labels
        </Checkbox>
      </div>
      <Chart
        title="Price per kilo"
        data={prices}
        height={300}
        legend={false}
        yAxis={{ format: 'c2' }}
        locale="en-US"
        series={[
          { type: 'line', name: 'Coffee', xField: 'month', yField: 'coffee', markers: { shape: 'diamond', size: 8 }, labels: { format: 'c1', overlap, dedupe }, lastValue: badges, inlineLabel: badges },
          { type: 'line', name: 'Tea', xField: 'month', yField: 'tea', markers: { shape: 'triangle', size: 8, filled: false }, labels: { format: 'c1', overlap, dedupe }, lastValue: badges ? { format: 'c2' } : false, inlineLabel: badges },
          {
            type: 'line',
            name: 'Cocoa',
            xField: 'month',
            yField: 'cocoa',
            // Custom SVG markers and labels rendered from functions.
            renderMarker: (p) => <rect x={-5} y={-5} width={10} height={10} rx={2} fill={p.color} />,
            labels: { position: 'bottom', render: (p) => <tspan fontStyle="italic">{p.index % 2 === 0 ? p.yText : ''}</tspan> },
            inlineLabel: badges,
          },
        ]}
      />
    </div>
  );
}
