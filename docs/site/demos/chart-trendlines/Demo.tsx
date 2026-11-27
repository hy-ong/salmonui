'use client';

import { useState } from 'react';
import { Checkbox } from '@salmonui/inputs/checkbox';
import { NumberField } from '@salmonui/inputs/number-field';
import { Select } from '@salmonui/dropdowns/select';
import { Chart } from '@salmonui/charts/chart';
import type { ChartTrendline } from '@salmonui/charts/chart';

const sales = Array.from({ length: 24 }, (_, i) => ({ month: i + 1, units: Math.round(40 + 3.2 * i + 0.08 * i * i + 9 * Math.sin(i * 1.9)) }));
// Missing readings (null) in a sensor log.
const readings = [12, 14, null, 17, 19, null, null, 18, 16, 15, null, 13].map((value, i) => ({ hour: `${8 + i}:00`, value }));

type Kind = ChartTrendline['kind'];
type Empty = 'gap' | 'zero' | 'drop' | 'average';

export default function ChartTrendlinesDemo() {
  const [kind, setKind] = useState<Kind>('polynomial');
  const [order, setOrder] = useState(2);
  const [forward, setForward] = useState(6);
  const [intercept, setIntercept] = useState(false);
  const [markers, setMarkers] = useState(false);
  const [empty, setEmpty] = useState<Empty>('gap');
  return (
    <div className="demo-stack">
      <div className="demo-toolbar">
        <label>
          Trendline
          <Select aria-label="Trendline" data={(['linear', 'exponential', 'logarithmic', 'polynomial', 'power', 'movingAverage'] as const).map((k) => ({ value: k, label: k }))} value={kind} onValueChange={(value) => value != null && setKind(value as Kind)} />
        </label>
        <label>
          Order
          <NumberField aria-label="Order" min={2} max={6} value={order} onValueChange={(next) => next != null && setOrder(next)} disabled={kind !== 'polynomial'} style={{ inlineSize: '6em' }} />
        </label>
        <label>
          Forecast forward
          <NumberField aria-label="Forecast forward" min={0} max={12} value={forward} onValueChange={(next) => next != null && setForward(next)} disabled={kind === 'movingAverage'} style={{ inlineSize: '6em' }} />
        </label>
        <Checkbox checked={intercept} onCheckedChange={(checked) => setIntercept(checked)} disabled={kind !== 'linear' && kind !== 'polynomial' && kind !== 'exponential'}>Intercept at 30</Checkbox>
        <Checkbox checked={markers} onCheckedChange={(checked) => setMarkers(checked)}>Trendline markers</Checkbox>
      </div>
      <Chart
        title="Monthly units with a trendline"
        data={sales}
        height={300}
        xAxis={{ title: 'Month' }}
        series={[
          {
            type: 'scatter',
            name: 'Units',
            xField: 'month',
            yField: 'units',
            trendlines: [
              {
                kind,
                order,
                period: 3,
                forecast: kind === 'movingAverage' ? undefined : { forward },
                intercept: intercept ? 30 : undefined,
                name: `Trend (${kind})`,
                markers,
              },
            ],
          },
        ]}
      />
      <div className="demo-toolbar">
        <label>
          Empty points
          <Select aria-label="Empty points" data={[{ value: 'gap', label: 'gap' }, { value: 'zero', label: 'zero' }, { value: 'drop', label: 'drop' }, { value: 'average', label: 'average' }]} value={empty} onValueChange={(value) => value != null && setEmpty(value as Empty)} />
        </label>
      </div>
      <Chart
        title="Sensor readings with missing values"
        data={readings}
        height={240}
        legend={false}
        series={[{ type: 'line', name: 'Reading', xField: 'hour', yField: 'value', markers: true, emptyPoints: empty }]}
      />
    </div>
  );
}
