'use client';

import { useState } from 'react';
import { Chart } from '@salmonui/charts/chart';
import type { ChartLegendShape, ChartSeriesOptions } from '@salmonui/charts/chart';
import { Button } from '@salmonui/buttons/button';
import { Checkbox } from '@salmonui/inputs/checkbox';
import { Select } from '@salmonui/dropdowns/select';

const cities = ['Amsterdam', 'Barcelona', 'Copenhagen', 'Dublin', 'Edinburgh', 'Florence', 'Geneva', 'Helsinki', 'Istanbul (European side)', 'Jerusalem'];
const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'];
const visitors = months.map((month, m) => Object.fromEntries([['month', month], ...cities.map((c, i) => [c, 20 + ((m * 7 + i * 11) % 30)])]));
const shapes: readonly ChartLegendShape[] = ['seriesType', 'circle', 'rectangle', 'triangle', 'diamond', 'star', 'pentagon', 'cross', 'horizontalLine', 'invertedTriangle'];

type Position = 'auto' | 'top' | 'bottom' | 'start' | 'end';
type Align = 'start' | 'center' | 'end';

export default function ChartLegendDemo() {
  const [position, setPosition] = useState<Position>('bottom');
  const [align, setAlign] = useState<Align>('center');
  const [overflow, setOverflow] = useState<'wrap' | 'page'>('page');
  const [vertical, setVertical] = useState(false);
  const [reverse, setReverse] = useState(false);
  const [custom, setCustom] = useState(false);
  const [toggle, setToggle] = useState(true);
  const [hidden, setHidden] = useState<readonly string[]>(['Geneva', 'Helsinki']);

  const series: ChartSeriesOptions[] = cities.map((c, i) => {
    const shape = shapes[i] ?? 'seriesType';
    return { type: 'line', name: c, xField: 'month', yField: c, legendShape: shape, markers: { shape: shape === 'seriesType' ? 'circle' : shape } };
  });

  return (
    <div className="demo-stack">
      <div className="demo-toolbar">
        <label>
          Position
          <Select aria-label="Position" data={['auto', 'top', 'bottom', 'start', 'end']} value={position} onValueChange={(value) => value != null && setPosition(value as Position)} />
        </label>
        <label>
          Align
          <Select aria-label="Align" data={['start', 'center', 'end']} value={align} onValueChange={(value) => value != null && setAlign(value as Align)} />
        </label>
        <label>
          Overflow
          <Select aria-label="Overflow" data={['wrap', 'page']} value={overflow} onValueChange={(value) => value != null && setOverflow(value as 'wrap' | 'page')} />
        </label>
        <Checkbox checked={vertical} onCheckedChange={(checked) => setVertical(checked)}>
          Vertical
        </Checkbox>
        <Checkbox checked={reverse} onCheckedChange={(checked) => setReverse(checked)}>
          Reverse
        </Checkbox>
        <Checkbox checked={custom} onCheckedChange={(checked) => setCustom(checked)}>
          Custom items
        </Checkbox>
        <Checkbox checked={toggle} onCheckedChange={(checked) => setToggle(checked)}>
          Toggle on click
        </Checkbox>
      </div>
      <Chart
        title="Visitors per city (thousands)"
        data={visitors}
        height={360}
        legend={{
          position,
          align,
          overflow,
          orientation: vertical ? 'vertical' : 'horizontal',
          reverse,
          toggle,
          title: 'Cities',
          maxLabelWidth: 90,
          renderItem: custom
            ? (item) => (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, opacity: item.hidden ? 0.5 : 1 }}>
                  <span aria-hidden="true" style={{ inlineSize: 10, blockSize: 10, borderRadius: 'var(--salmon-radius-sm)', background: item.color }} />
                  {item.label.slice(0, 3).toUpperCase()}
                </span>
              )
            : undefined,
        }}
        hiddenSeries={hidden}
        onHiddenSeriesChange={(ids) => setHidden(ids)}
        series={series}
      />
      <p className="demo-status" aria-live="polite">
        hiddenSeries: <code>{hidden.join(', ') || 'none'}</code>{' '}
        <Button variant="outline" type="button" onClick={() => setHidden([])}>
          Show all
        </Button>
      </p>
    </div>
  );
}
