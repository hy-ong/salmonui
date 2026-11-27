'use client';

import { useState } from 'react';
import { BulletChart } from '@salmonui/charts/chart/bullet';
import { Button } from '@salmonui/buttons/button';
import { Checkbox } from '@salmonui/inputs/checkbox';
import { Select } from '@salmonui/dropdowns/select';

const q3 = [
  { kpi: 'Revenue', actual: 78, target: 72, stretch: 88 },
  { kpi: 'Gross margin', actual: 61, target: 65, stretch: 75 },
  { kpi: 'Retention', actual: 84, target: 80, stretch: 90 },
  { kpi: 'NPS', actual: 46, target: 55, stretch: 70 },
];
const q4Change = [6, 5, -3, 12];
const q4 = q3.map((d, i) => ({ ...d, actual: d.actual + (q4Change[i] ?? 0) }));

const bands = [
  { to: 50, color: '#dc2626', label: 'Poor' },
  { to: 75, color: '#a16207', label: 'Satisfactory' },
  { to: 100, color: '#15803d', label: 'Good' },
];

const percent: Intl.NumberFormatOptions = { style: 'unit', unit: 'percent', maximumFractionDigits: 0 };

/** Quarterly KPIs: value, target and stretch target over three bands. */
export default function BulletChartKpisDemo() {
  const [orientation, setOrientation] = useState<'horizontal' | 'vertical'>('horizontal');
  const [valueShape, setValueShape] = useState<'bar' | 'dot'>('bar');
  const [axisEnd, setAxisEnd] = useState(false);
  const [animated, setAnimated] = useState(true);
  const [quarter, setQuarter] = useState<'Q3' | 'Q4'>('Q3');
  const [clicked, setClicked] = useState('none');
  return (
    <div className="demo-stack">
      <div className="demo-toolbar" role="group" aria-label="Bullet chart options">
        <label>
          Orientation
          <Select aria-label="Orientation" data={[{ value: 'horizontal', label: 'Horizontal' }, { value: 'vertical', label: 'Vertical' }]} value={orientation} onValueChange={(value) => value != null && setOrientation(value === 'vertical' ? 'vertical' : 'horizontal')} />
        </label>
        <label>
          Value glyph
          <Select aria-label="Value glyph" data={[{ value: 'bar', label: 'Bar' }, { value: 'dot', label: 'Dot' }]} value={valueShape} onValueChange={(value) => value != null && setValueShape(value === 'dot' ? 'dot' : 'bar')} />
        </label>
        <Checkbox checked={axisEnd} onCheckedChange={(checked) => setAxisEnd(checked)}>
          Axis on the opposite side
        </Checkbox>
        <Checkbox checked={animated} onCheckedChange={(checked) => setAnimated(checked)}>
          Animate
        </Checkbox>
        <Button variant="outline" type="button" onClick={() => setQuarter((q) => (q === 'Q3' ? 'Q4' : 'Q3'))}>
          Show {quarter === 'Q3' ? 'Q4' : 'Q3'}
        </Button>
      </div>
      <BulletChart
        title={`KPI scorecard, ${quarter}`}
        subtitle="Percent of plan"
        data={quarter === 'Q3' ? q3 : q4}
        categoryField="kpi"
        valueField="actual"
        name="Actual"
        targetField={['target', 'stretch']}
        targetShapes={['line', 'cross']}
        bands={bands}
        valueShape={valueShape}
        orientation={orientation}
        axisPosition={axisEnd ? 'end' : 'start'}
        min={0}
        max={100}
        interval={25}
        minorTicks={4}
        format={percent}
        labelPosition="outside"
        tickPosition="inside"
        labels={{ format: percent }}
        legend={{ position: 'bottom', title: 'Legend' }}
        animated={animated}
        tooltip={{
          render: ({ points }) => {
            const p = points[0];
            if (!p) return null;
            const onTarget = p.y >= Number(p.datum.target);
            return (
              <span>
                <strong>{String(p.x)}</strong>: {p.yText} ({onTarget ? 'on' : 'below'} target)
              </span>
            );
          },
        }}
        onItemClick={(ctx) => setClicked(`${String(ctx.x)} ${ctx.yText}`)}
        height={orientation === 'horizontal' ? 260 : 380}
      />
      <p className="demo-status" aria-live="polite">
        Last clicked: <code>{clicked}</code>
      </p>
    </div>
  );
}
