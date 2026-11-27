'use client';

import { useState } from 'react';
import { Chart } from '@salmonui/charts/chart';
import { polar } from '@salmonui/charts/chart/features';
import { Checkbox } from '@salmonui/inputs/checkbox';
import { Slider } from '@salmonui/inputs/slider';
import { Select } from '@salmonui/dropdowns/select';

const wind = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'].map((direction, i) => ({
  direction,
  speed: 8 + ((i * 5) % 9),
  gust: 14 + ((i * 7) % 11),
  calm: 2 + (i % 3),
}));

type DrawType = 'line' | 'area' | 'column' | 'scatter';

export default function ChartPolarDemo() {
  const [coordinate, setCoordinate] = useState<'polar' | 'radar'>('polar');
  const [drawType, setDrawType] = useState<DrawType>('column');
  const [stacked, setStacked] = useState(false);
  const [startAngle, setStartAngle] = useState(0);
  return (
    <div className="demo-stack">
      <div className="demo-toolbar">
        <label>
          Coordinate
          <Select aria-label="Coordinate" data={['polar', 'radar']} value={coordinate} onValueChange={(value) => value != null && setCoordinate(value as 'polar' | 'radar')} />
        </label>
        <label>
          Series type
          <Select aria-label="Series type" data={['line', 'area', 'column', 'scatter']} value={drawType} onValueChange={(value) => value != null && setDrawType(value as DrawType)} />
        </label>
        <Checkbox checked={stacked} onCheckedChange={(checked) => setStacked(checked)}>
          Stacked
        </Checkbox>
        <Slider label="Start angle" min={0} max={315} step={45} value={startAngle} onValueChange={setStartAngle} style={{ inlineSize: 160 }} />
      </div>
      <Chart
        title="Wind by direction"
        coordinate={coordinate}
        features={[polar]}
        xAxis={{ startAngle }}
        radius={0.9}
        data={wind}
        height={380}
        series={[
          { type: drawType, name: 'Calm', xField: 'direction', yField: 'calm', stack: stacked || undefined },
          { type: drawType, name: 'Speed', xField: 'direction', yField: 'speed', stack: stacked || undefined },
          { type: drawType, name: 'Gust', xField: 'direction', yField: 'gust', stack: stacked || undefined },
        ]}
      />
    </div>
  );
}
