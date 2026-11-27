'use client';

import { useState } from 'react';
import { Button } from '@salmonui/buttons/button';
import { Checkbox } from '@salmonui/inputs/checkbox';
import { Select } from '@salmonui/dropdowns/select';
import { Chart } from '@salmonui/charts/chart';
import type { ChartPointRef } from '@salmonui/charts/chart';

const quarters = ['Q1', 'Q2', 'Q3', 'Q4', 'Q5', 'Q6'];
const regions = quarters.map((quarter, i) => ({ quarter, north: 40 + ((i * 13) % 25), south: 30 + ((i * 17) % 30), west: 22 + ((i * 7) % 20) }));
const samples = Array.from({ length: 60 }, (_, i) => ({ x: (i * 37) % 100, y: (i * 61) % 100 }));

type Mode = 'point' | 'series' | 'cluster' | 'range' | 'lasso';
type Highlight = 'off' | 'series' | 'point' | 'cluster';

// Selected, dimmed and highlighted marks carry data attributes for className overrides.
const css = `.demo-chart-selection [data-selected] { stroke: var(--salmon-text-primary); stroke-width: 2px; }
.demo-chart-selection [data-dimmed] { opacity: 0.25; }`;

export default function ChartSelectionDemo() {
  const [mode, setMode] = useState<Mode>('point');
  const [multiple, setMultiple] = useState(true);
  const [highlight, setHighlight] = useState<Highlight>('series');
  const [selected, setSelected] = useState<readonly ChartPointRef[]>([]);
  const [scatterSelected, setScatterSelected] = useState<readonly ChartPointRef[]>([]);
  const [units, setUnits] = useState([12, 18, 15, 22, 19, 25]);
  const [log, setLog] = useState<string[]>([]);
  const add = (line: string) => setLog((l) => [line, ...l].slice(0, 6));
  const boxMode = mode === 'range' || mode === 'lasso';

  return (
    <div className="demo-stack demo-chart-selection">
      <style>{css}</style>
      <div className="demo-toolbar">
        <label>
          Column selection mode
          <Select aria-label="Column selection mode" data={[{ value: 'point', label: 'point' }, { value: 'series', label: 'series' }, { value: 'cluster', label: 'cluster' }]} value={boxMode ? 'point' : mode} onValueChange={(value) => value != null && setMode(value as Mode)} />
        </label>
        <Checkbox checked={multiple} onCheckedChange={(checked) => setMultiple(checked)}>Multiple</Checkbox>
        <label>
          Hover highlight
          <Select aria-label="Hover highlight" data={[{ value: 'off', label: 'false' }, { value: 'series', label: 'series' }, { value: 'point', label: 'point' }, { value: 'cluster', label: 'cluster' }]} value={highlight} onValueChange={(value) => value != null && setHighlight(value as Highlight)} />
        </label>
        <Button variant="outline" type="button" onClick={() => setSelected([])}>
          Clear selection
        </Button>
      </div>
      <Chart
        title="Sales by region"
        data={regions}
        height={280}
        selection={{ mode: boxMode ? 'point' : mode, multiple }}
        selectedPoints={selected}
        onSelectedPointsChange={(points, event) => {
          setSelected(points);
          add(`onSelectedPointsChange: ${points.length} points (${event.reason})`);
        }}
        highlight={highlight === 'off' ? false : highlight}
        legend={{ highlight: true }}
        onPointClick={(p) => add(`onPointClick: ${p.seriesName} ${p.xText} = ${p.yText}`)}
        onPointDoubleClick={(p) => add(`onPointDoubleClick: ${p.seriesName} ${p.xText}`)}
        onPointHover={(p) => {
          if (p) add(`onPointHover: ${p.seriesName} ${p.xText}`);
        }}
        onPlotClick={(p) => add(`onPlotClick: x ${String(p.xValue)}, y ${typeof p.yValue === 'number' ? p.yValue.toFixed(1) : String(p.yValue)}`)}
        onContextMenu={(e) => {
          e.preventDefault();
          add('onContextMenu on the chart root');
        }}
        series={[
          { type: 'column', name: 'North', xField: 'quarter', yField: 'north' },
          { type: 'column', name: 'South', xField: 'quarter', yField: 'south' },
          { type: 'column', name: 'West', xField: 'quarter', yField: 'west' },
        ]}
      />
      <p className="demo-status" aria-live="polite">
        selectedPoints: <code>{selected.map((p) => `${p.seriesId}[${p.index}]`).join(', ') || 'none'}</code>
      </p>
      <div className="demo-toolbar">
        <label>
          Scatter selection
          <Select aria-label="Scatter selection" data={[{ value: 'range', label: 'range (drag a rectangle)' }, { value: 'lasso', label: 'lasso (draw a shape)' }]} value={boxMode ? mode : 'range'} onValueChange={(value) => value != null && setMode(value as Mode)} />
        </label>
      </div>
      <Chart
        title="Samples"
        data={samples}
        height={260}
        legend={false}
        selection={{ mode: mode === 'lasso' ? 'lasso' : 'range', axis: 'xy', multiple: true }}
        selectedPoints={scatterSelected}
        onSelectedPointsChange={setScatterSelected}
        onRangeSelect={({ ranges, points }, event) => add(`onRangeSelect (${event.reason}): ${points.length} points${ranges.x ? `, x ${ranges.x.map((v) => v.toFixed(0)).join('–')}` : ''}`)}
        series={[{ type: 'scatter', name: 'Samples', xField: 'x', yField: 'y' }]}
      />
      <Chart
        title="Planned units (drag a point, or focus the plot and press Up / Down)"
        data={units.map((value, i) => ({ quarter: quarters[i], value }))}
        height={240}
        legend={false}
        yAxis={{ min: 0, max: 40 }}
        series={[{ type: 'line', name: 'Units', xField: 'quarter', yField: 'value', markers: true, editable: { min: 0, max: 40, step: 1 } }]}
        onPointChange={({ index, value }, event) => {
          setUnits((u) => u.map((v, i) => (i === index ? Math.round(value) : v)));
          add(`onPointChange: ${quarters[index]} = ${Math.round(value)} (${event.reason})`);
        }}
      />
      <div className="demo-log" aria-label="Chart events">
        <ol>
          {log.map((line, i) => (
            <li key={`${i}-${line}`}>{line}</li>
          ))}
        </ol>
      </div>
    </div>
  );
}
