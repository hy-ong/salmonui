'use client';

import { useState } from 'react';
import { Checkbox } from '@salmonui/inputs/checkbox';
import { Select } from '@salmonui/dropdowns/select';
import { Chart } from '@salmonui/charts/chart';

// Trading days only (weekends missing): a 'time' axis shows the gaps, 'timeCategory' closes them.
const days = Array.from({ length: 30 }, (_, i) => new Date(Date.UTC(2026, 2, 2 + i))).filter((d) => d.getUTCDay() % 6 !== 0);
const closes = days.map((date, i) => ({ date, close: 180 + 12 * Math.sin(i / 3) + i }));

const growth = Array.from({ length: 10 }, (_, i) => ({ year: 2016 + i, users: Math.round(30 * 2.4 ** i) }));

// Two "Mon" categories: only indexed: true keeps them apart.
const shifts = [
  { day: 'Mon', output: 42 },
  { day: 'Tue', output: 47 },
  { day: 'Wed', output: 51 },
  { day: 'Mon', output: 39 },
  { day: 'Tue', output: 44 },
];

type Unit = 'day' | 'week';
type Padding = 'auto' | 'none' | 'normal' | 'additional' | 'round';

export default function ChartAxisScalesDemo() {
  const [timeScale, setTimeScale] = useState<'time' | 'timeCategory'>('time');
  const [unit, setUnit] = useState<Unit>('week');
  const [valueScale, setValueScale] = useState<'linear' | 'log'>('log');
  const [base, setBase] = useState(10);
  const [includeZero, setIncludeZero] = useState(false);
  const [padding, setPadding] = useState<Padding>('auto');
  const [indexed, setIndexed] = useState(true);
  const [placement, setPlacement] = useState<'between' | 'on'>('between');
  return (
    <div className="demo-stack">
      <div className="demo-toolbar">
        <label>
          Date scale
          <Select aria-label="Date scale" data={[{ value: 'time', label: 'time' }, { value: 'timeCategory', label: 'timeCategory' }]} value={timeScale} onValueChange={(value) => value != null && setTimeScale(value as 'time' | 'timeCategory')} />
        </label>
        <label>
          Interval
          <Select aria-label="Interval" data={[{ value: 'day', label: '2 days' }, { value: 'week', label: '1 week' }]} value={unit} onValueChange={(value) => value != null && setUnit(value as Unit)} disabled={timeScale !== 'time'} />
        </label>
        <Checkbox checked={includeZero} onCheckedChange={(checked) => setIncludeZero(checked)}>includeZero</Checkbox>
        <label>
          Padding
          <Select aria-label="Padding" data={(['auto', 'none', 'normal', 'additional', 'round'] as const).map((p) => ({ value: p, label: p }))} value={padding} onValueChange={(value) => value != null && setPadding(value as Padding)} />
        </label>
      </div>
      <Chart
        title="Closing price"
        data={closes}
        height={240}
        timeZone="UTC"
        locale="en-US"
        legend={false}
        xAxis={{ scale: timeScale, interval: timeScale === 'time' ? (unit === 'day' ? { unit: 'day', step: 2 } : { unit: 'week', step: 1 }) : undefined, format: 'MMMd', labelOverlap: 'hide' }}
        yAxis={{ includeZero, padding, format: 'c0' }}
        series={[{ type: 'line', name: 'Close', xField: 'date', yField: 'close', markers: timeScale === 'timeCategory' }]}
      />
      <div className="demo-toolbar">
        <label>
          Value scale
          <Select aria-label="Value scale" data={[{ value: 'linear', label: 'linear' }, { value: 'log', label: 'log' }]} value={valueScale} onValueChange={(value) => value != null && setValueScale(value as 'linear' | 'log')} />
        </label>
        <label>
          Log base
          <Select aria-label="Log base" data={[{ value: 2, label: '2' }, { value: 10, label: '10' }]} value={base} onValueChange={(value) => value != null && setBase(Number(value))} disabled={valueScale !== 'log'} />
        </label>
      </div>
      <Chart
        title="Users per year"
        data={growth}
        height={240}
        legend={false}
        xAxis={{ scale: 'linear', min: 2016, max: 2025, interval: 1, formatLabel: (v) => String(v) }}
        yAxis={{ scale: valueScale, base, format: 'n0' }}
        series={[{ type: 'line', name: 'Users', xField: 'year', yField: 'users', markers: true }]}
      />
      <div className="demo-toolbar">
        <Checkbox checked={indexed} onCheckedChange={(checked) => setIndexed(checked)}>indexed</Checkbox>
        <label>
          Label placement
          <Select aria-label="Label placement" data={[{ value: 'between', label: 'between' }, { value: 'on', label: 'on' }]} value={placement} onValueChange={(value) => value != null && setPlacement(value as 'between' | 'on')} />
        </label>
      </div>
      <Chart
        title="Output per shift"
        data={shifts}
        height={220}
        legend={false}
        xAxis={{ scale: 'category', indexed, labelPlacement: placement }}
        yAxis={{ min: 0, max: 60, tickCount: 4 }}
        series={[{ type: 'column', name: 'Output', xField: 'day', yField: 'output' }]}
      />
    </div>
  );
}
