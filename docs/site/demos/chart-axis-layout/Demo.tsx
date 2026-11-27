'use client';

import { useState } from 'react';
import { Checkbox } from '@salmonui/inputs/checkbox';
import { Select } from '@salmonui/dropdowns/select';
import { Chart } from '@salmonui/charts/chart';

const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const plant = months.map((month, i) => ({
  month,
  index: i,
  output: 900 + Math.round(180 * Math.sin(i / 2)),
  temperature: Math.round(14 + 9 * Math.sin(((i - 3) / 12) * 2 * Math.PI)),
  defects: 3 + ((i * 7) % 6),
}));
const balance = Array.from({ length: 21 }, (_, i) => ({ x: i - 10, y: Math.round((i - 10) ** 3 / 40 - (i - 10) * 2) }));

type Grid = 'none' | 'major' | 'both';

export default function ChartAxisLayoutDemo() {
  const [panes, setPanes] = useState(true);
  const [opposed, setOpposed] = useState(true);
  const [grid, setGrid] = useState<Grid>('major');
  const [reversed, setReversed] = useState(false);
  const [labelsAtCross, setLabelsAtCross] = useState(true);
  const [titleAngle, setTitleAngle] = useState(-90);
  return (
    <div className="demo-stack">
      <div className="demo-toolbar">
        <Checkbox checked={panes} onCheckedChange={(checked) => setPanes(checked)}>Defects in their own pane</Checkbox>
        <Checkbox checked={opposed} onCheckedChange={(checked) => setOpposed(checked)}>Temperature axis at the end</Checkbox>
        <label>
          Grid lines
          <Select aria-label="Grid lines" data={[{ value: 'none', label: 'false' }, { value: 'major', label: 'major' }, { value: 'both', label: 'both (with minor ticks)' }]} value={grid} onValueChange={(value) => value != null && setGrid(value as Grid)} />
        </label>
        <label>
          Title angle
          <Select aria-label="Title angle" data={[{ value: -90, label: '-90' }, { value: 0, label: '0' }, { value: 90, label: '90' }]} value={titleAngle} onValueChange={(value) => value != null && setTitleAngle(Number(value))} />
        </label>
      </div>
      <Chart
        title="Plant output"
        data={plant}
        height={380}
        panes={panes ? { rows: ['70%', '30%'] } : undefined}
        yAxis={{ title: 'Units', titleAngle, gridLines: grid === 'none' ? false : grid, minorTicks: grid === 'both' ? 1 : undefined, bands: [{ from: 1000, to: 1100, label: 'Target zone', color: '#15803d' }], lines: [{ value: 800, label: 'Minimum', lineStyle: 'dashed', color: '#dc2626' }] }}
        xAxis={{ bands: [{ from: 5, to: 7, label: 'Summer shutdown', layer: 'behind' }] }}
        axes={[
          { id: 'temp', direction: 'y', position: opposed ? 'end' : 'start', title: '°C', titleAngle, gridLines: false },
          { id: 'defects', direction: 'y', title: 'Defects', titleAngle, pane: panes ? { row: 1 } : undefined, position: panes ? 'start' : 'end', gridLines: false, ticks: false, line: false },
        ]}
        series={[
          { type: 'column', name: 'Output', xField: 'month', yField: 'output' },
          { type: 'line', name: 'Temperature', xField: 'month', yField: 'temperature', yAxis: 'temp', markers: true },
          { type: 'column', name: 'Defects', xField: 'month', yField: 'defects', yAxis: 'defects' },
        ]}
      />
      <div className="demo-toolbar">
        <Checkbox checked={reversed} onCheckedChange={(checked) => setReversed(checked)}>Reverse the y axis</Checkbox>
        <Checkbox checked={labelsAtCross} onCheckedChange={(checked) => setLabelsAtCross(checked)}>Labels at the crossing</Checkbox>
      </div>
      <Chart
        title="Axes crossing at zero"
        data={balance}
        height={280}
        legend={false}
        xAxis={{ crossAt: { value: 0 }, labelsAtCross }}
        yAxis={{ crossAt: { value: 0 }, labelsAtCross, reversed }}
        series={[{ type: 'line', name: 'y', xField: 'x', yField: 'y', curve: 'natural' }]}
      />
    </div>
  );
}
