'use client';

import { useState } from 'react';
import { Select } from '@salmonui/dropdowns/select';
import { Chart } from '@salmonui/charts/chart';
import type { ChartErrorBars } from '@salmonui/charts/chart';

const cashFlow = [
  { step: 'Revenue', amount: 420 },
  { step: 'Cost of sales', amount: -180 },
  { step: 'Gross profit', amount: 0 },
  { step: 'Marketing', amount: -60 },
  { step: 'R&D', amount: -75 },
  { step: 'Other income', amount: 25 },
  { step: 'Net profit', amount: 0 },
];

// 200 response times (ms) from a deterministic, roughly normal mix.
const responses = Array.from({ length: 200 }, (_, i) => ({ ms: Math.round(220 + 40 * (Math.sin(i * 12.9898) + Math.sin(i * 78.233) + Math.sin(i * 37.719))) }));

const teams = ['Alpha', 'Beta', 'Gamma', 'Delta'].map((team, t) => ({
  team,
  hours: Array.from({ length: 15 }, (_, i) => 30 + t * 3 + ((i * (7 + t)) % 14) + (i === 3 ? 18 : 0)),
}));

const defects = [
  { cause: 'Misalignment', count: 12 },
  { cause: 'Scratches', count: 46 },
  { cause: 'Wrong part', count: 8 },
  { cause: 'Missing screw', count: 27 },
  { cause: 'Dent', count: 19 },
  { cause: 'Other', count: 5 },
];

const trials = [
  { dose: 'Placebo', effect: 12, plus: 4, minus: 3 },
  { dose: '10 mg', effect: 21, plus: 5, minus: 4 },
  { dose: '20 mg', effect: 34, plus: 6, minus: 6 },
  { dose: '40 mg', effect: 41, plus: 9, minus: 5 },
];

type ErrorKind = ChartErrorBars['kind'];

export default function ChartStatisticalDemo() {
  const [quartile, setQuartile] = useState<'exclusive' | 'inclusive' | 'normal'>('exclusive');
  const [binWidth, setBinWidth] = useState(20);
  const [errorKind, setErrorKind] = useState<ErrorKind>('custom');
  return (
    <div className="demo-stack">
      <Chart
        title="Profit bridge"
        data={cashFlow}
        height={280}
        yAxis={{ format: 'c0' }}
        legend={false}
        series={[{ type: 'waterfall', name: 'Amount', xField: 'step', yField: 'amount', subtotals: [2], totals: [6], connectors: true, labels: true }]}
      />
      <div className="demo-toolbar">
        <label>
          Bin width (ms)
          <Select aria-label="Bin width (ms)" data={[{ value: 10, label: '10' }, { value: 20, label: '20' }, { value: 40, label: '40' }]} value={binWidth} onValueChange={(value) => value != null && setBinWidth(Number(value))} />
        </label>
      </div>
      <Chart title="Response times" data={responses} height={260} legend={false} series={[{ type: 'histogram', name: 'Requests', yField: 'ms', binWidth, normalCurve: true }]} />
      <div className="demo-toolbar">
        <label>
          Quartile method
          <Select aria-label="Quartile method" data={[{ value: 'exclusive', label: 'exclusive' }, { value: 'inclusive', label: 'inclusive' }, { value: 'normal', label: 'normal' }]} value={quartile} onValueChange={(value) => value != null && setQuartile(value as 'exclusive' | 'inclusive' | 'normal')} />
        </label>
      </div>
      <Chart
        title="Weekly hours per team"
        data={teams}
        height={280}
        legend={false}
        series={[{ type: 'boxPlot', name: 'Hours', xField: 'team', yField: 'hours', quartileMethod: quartile, mean: true, outliers: true }]}
      />
      <Chart title="Defects by cause" data={defects} height={280} series={[{ type: 'pareto', name: 'Defects', xField: 'cause', yField: 'count', pareto: { line: true, markers: true } }]} />
      <div className="demo-toolbar">
        <label>
          Error bar kind
          <Select aria-label="Error bar kind" data={[{ value: 'custom', label: 'custom (plus / minus fields)' }, { value: 'fixed', label: 'fixed (3)' }, { value: 'percent', label: 'percent (15)' }, { value: 'standardDeviation', label: 'standardDeviation' }, { value: 'standardError', label: 'standardError' }]} value={errorKind} onValueChange={(value) => value != null && setErrorKind(value as ErrorKind)} />
        </label>
      </div>
      <Chart
        title="Effect by dose"
        data={trials}
        height={260}
        legend={false}
        series={[
          {
            type: 'column',
            name: 'Effect',
            xField: 'dose',
            yField: 'effect',
            errorBars: { kind: errorKind, amount: errorKind === 'percent' ? 15 : errorKind === 'fixed' ? 3 : 1, plusField: 'plus', minusField: 'minus', caps: true },
          },
        ]}
      />
    </div>
  );
}
