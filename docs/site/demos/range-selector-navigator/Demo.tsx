'use client';

import { useState } from 'react';
import { Select } from '@salmonui/dropdowns/select';
import { Chart } from '@salmonui/charts/chart';
import { RangeSelector } from '@salmonui/charts/range-selector';
import type { RangeValue } from '@salmonui/charts/range-selector';

const DAY = 86_400_000;
const START = Date.UTC(2025, 0, 1);
const traffic = Array.from({ length: 540 }, (_, i) => ({ date: new Date(START + i * DAY), visits: Math.round(5000 + 1800 * Math.sin(i / 30) + 600 * Math.sin(i / 3.5) + i * 4) }));
const fmt = (v: number) => new Date(v).toISOString().slice(0, 10);

export default function RangeSelectorNavigatorDemo() {
  const [value, setValue] = useState<RangeValue>([Date.UTC(2025, 9, 1), Date.UTC(2026, 0, 1)]);
  const [live, setLive] = useState<RangeValue>(value);
  const [type, setType] = useState<'area' | 'line' | 'stepLine'>('area');
  return (
    <div className="demo-stack">
      <div className="demo-toolbar">
        <label>
          Navigator series
          <Select aria-label="Navigator series" data={[{ value: 'area', label: 'area' }, { value: 'line', label: 'line' }, { value: 'stepLine', label: 'stepLine' }]} value={type} onValueChange={(value) => value != null && setType(value as 'area' | 'line' | 'stepLine')} />
        </label>
      </div>
      {/* The chart shows the committed range: zoomRange keyed by the x axis id. */}
      <Chart title="Daily visits" data={traffic} height={260} legend={false} timeZone="UTC" locale="en-US" zoomRange={{ x: value }} series={[{ type: 'line', name: 'Visits', xField: 'date', yField: 'visits' }]} />
      <RangeSelector
        aria-label="Visible dates"
        series={[{ type, data: traffic, xField: 'date', yField: 'visits' }]}
        height={90}
        timeZone="UTC"
        locale="en-US"
        value={value}
        onValueChange={(next) => setLive(next)}
        onValueCommit={(next) => {
          setValue(next);
          setLive(next);
        }}
        periods={[
          { id: '1m', unit: 'month', count: 1, label: '1M' },
          { id: '3m', unit: 'month', count: 3, label: '3M' },
          { id: '6m', unit: 'month', count: 6, label: '6M' },
          { id: 'ytd', unit: 'ytd', label: 'YTD' },
          { id: 'all', unit: 'all', label: 'All' },
        ]}
      />
      <p className="demo-status" aria-live="polite">
        onValueChange: <code>{`${fmt(live[0])} to ${fmt(live[1])}`}</code>, committed value: <code>{`${fmt(value[0])} to ${fmt(value[1])}`}</code>
      </p>
    </div>
  );
}
