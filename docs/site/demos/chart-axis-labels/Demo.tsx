'use client';

import { useState } from 'react';
import { Checkbox } from '@salmonui/inputs/checkbox';
import { Select } from '@salmonui/dropdowns/select';
import { Chart } from '@salmonui/charts/chart';
import type { ChartLabelOverlap } from '@salmonui/charts/chart';

const products = ['Espresso machine', 'Milk frother', 'Burr grinder', 'Kettle with thermometer', 'Pour-over dripper', 'Cold brew jar', 'Tamper', 'Scale with timer'];
const units = products.map((product, i) => ({ product, units: 120 + ((i * 53) % 140) }));

const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const revenue = months.map((month, i) => ({ month, revenue: 1_200_000 + Math.round(400_000 * Math.sin(i / 2)) + i * 50_000 }));

const quarter = (label: string, from: number) => ({ from: months[from]!, to: months[from + 2]!, label });

export default function ChartAxisLabelsDemo() {
  const [overlap, setOverlap] = useState<ChartLabelOverlap>('wrap');
  const [edge, setEdge] = useState<'none' | 'hide' | 'shift'>('shift');
  const [inside, setInside] = useState(false);
  const [locale, setLocale] = useState('en-US');
  const [clicked, setClicked] = useState('nothing yet');
  return (
    <div className="demo-stack">
      <div className="demo-toolbar">
        <label>
          Label overlap
          <Select aria-label="Label overlap" data={(['none', 'hide', 'trim', 'wrap', 'stagger', 'rotate45', 'rotate90'] as const).map((o) => ({ value: o, label: o }))} value={overlap} onValueChange={(value) => value != null && setOverlap(value as ChartLabelOverlap)} />
        </label>
        <label>
          Edge labels
          <Select aria-label="Edge labels" data={[{ value: 'none', label: 'none' }, { value: 'hide', label: 'hide' }, { value: 'shift', label: 'shift' }]} value={edge} onValueChange={(value) => value != null && setEdge(value as 'none' | 'hide' | 'shift')} />
        </label>
        <Checkbox checked={inside} onCheckedChange={(checked) => setInside(checked)}>Labels and ticks inside</Checkbox>
      </div>
      <Chart
        title="Units by product"
        data={units}
        height={300}
        legend={false}
        xAxis={{ labelOverlap: overlap, maxLabelWidth: 80, edgeLabels: edge }}
        yAxis={{ labelPosition: inside ? 'inside' : 'outside', tickPosition: inside ? 'inside' : 'outside', plotOffset: 8, formatLabel: (v) => `${String(v)} pcs` }}
        onAxisLabelClick={(ctx) => setClicked(`${ctx.axisId} axis: ${ctx.text}`)}
        series={[{ type: 'column', name: 'Units', xField: 'product', yField: 'units' }]}
      />
      <div className="demo-toolbar">
        <label>
          Locale
          <Select aria-label="Locale" data={[{ value: 'en-US', label: 'en-US' }, { value: 'de-DE', label: 'de-DE' }, { value: 'ja-JP', label: 'ja-JP' }]} value={locale} onValueChange={(value) => value != null && setLocale(String(value))} />
        </label>
      </div>
      <Chart
        title="Revenue"
        data={revenue}
        height={300}
        legend={false}
        locale={locale}
        xAxis={{
          labelGroups: [{ levels: [quarter('Q1', 0), quarter('Q2', 3), quarter('Q3', 6), quarter('Q4', 9)] }, { levels: [{ from: 'Jan', to: 'Jun', label: 'H1' }, { from: 'Jul', to: 'Dec', label: 'H2' }], border: 'brace' }],
          renderLabel: (ctx) => (ctx.index % 3 === 0 ? <tspan fontWeight="bold">{ctx.text}</tspan> : ctx.text),
        }}
        yAxis={{ format: { style: 'currency', currency: 'EUR', notation: 'compact' }, domain: ([, max]) => [0, Math.ceil(max / 500_000) * 500_000] }}
        onAxisLabelClick={(ctx) => setClicked(`${ctx.axisId} axis: ${ctx.text}`)}
        onAxisLabelGroupClick={(ctx) => setClicked(`label group ${ctx.group}, level ${ctx.level}: ${ctx.label}`)}
        series={[{ type: 'area', name: 'Revenue', xField: 'month', yField: 'revenue', curve: 'monotone' }]}
      />
      <p className="demo-status" aria-live="polite">
        Clicked: <code>{clicked}</code>
      </p>
    </div>
  );
}
