'use client';

import { useState } from 'react';
import { Chart } from '@salmonui/charts/chart';
import type { ChartZoomRange } from '@salmonui/charts/chart';
import { Button } from '@salmonui/buttons/button';
import { Checkbox } from '@salmonui/inputs/checkbox';
import { Select } from '@salmonui/dropdowns/select';

// 2,000 hourly sensor readings; x is the hour number.
const readings = Array.from({ length: 2000 }, (_, h) => ({ hour: h, value: Math.round((20 + 6 * Math.sin(h / 24) + 2 * Math.sin(h / 3.7) + (h % 7) / 3) * 10) / 10 }));

type Mode = 'x' | 'y' | 'xy';

export default function ChartZoomDemo() {
  const [mode, setMode] = useState<Mode>('x');
  const [wheel, setWheel] = useState(true);
  const [selection, setSelection] = useState(true);
  const [pan, setPan] = useState(true);
  const [deferred, setDeferred] = useState(false);
  const [range, setRange] = useState<ChartZoomRange>({ x: [400, 900] });
  const [log, setLog] = useState<string[]>([]);
  const add = (line: string) => setLog((l) => [line, ...l].slice(0, 6));
  const fmt = (r: readonly [number, number] | undefined) => (r ? `${Math.round(r[0])}–${Math.round(r[1])}` : 'full');

  return (
    <div className="demo-stack">
      <div className="demo-toolbar">
        <label>
          Mode
          <Select aria-label="Mode" data={['x', 'y', 'xy']} value={mode} onValueChange={(value) => value != null && setMode(value as Mode)} />
        </label>
        <Checkbox checked={wheel} onCheckedChange={(checked) => setWheel(checked)}>
          Wheel and pinch
        </Checkbox>
        <Checkbox checked={selection} onCheckedChange={(checked) => setSelection(checked)}>
          Rectangle zoom
        </Checkbox>
        <Checkbox checked={pan} onCheckedChange={(checked) => setPan(checked)}>
          Pan
        </Checkbox>
        <Checkbox checked={deferred} onCheckedChange={(checked) => setDeferred(checked)}>
          Deferred pan
        </Checkbox>
        <Button variant="outline" type="button" onClick={() => setRange({ x: [0, 168] })}>
          First week
        </Button>
        <Button variant="outline" type="button" onClick={() => setRange({})}>
          Reset
        </Button>
      </div>
      <Chart
        title="Sensor temperature"
        data={readings}
        height={320}
        legend={false}
        xAxis={{ title: 'Hour' }}
        yAxis={{ format: '{value} °C' }}
        zoom={{ wheel, pinch: wheel, selection, pan, mode, deferred, toolbar: ['zoom', 'pan', 'zoomIn', 'zoomOut', 'reset'], toolbarPosition: 'topEnd' }}
        zoomRange={range}
        onZoomRangeChange={(next, event) => {
          setRange(next);
          add(`onZoomRangeChange: ${event.reason} (${event.source}), x ${fmt(next.x)}`);
        }}
        onVisibleRangeChange={({ axisId, range: r }) => add(`onVisibleRangeChange: ${axisId} ${fmt(r)}`)}
        series={[{ type: 'line', name: 'Temperature', xField: 'hour', yField: 'value' }]}
      />
      <p className="demo-status" aria-live="polite">
        zoomRange.x: <code>{fmt(range.x)}</code>
      </p>
      <div className="demo-log" aria-label="Zoom events">
        <ol>
          {log.map((line, i) => (
            <li key={`${i}-${line}`}>{line}</li>
          ))}
        </ol>
      </div>
    </div>
  );
}
