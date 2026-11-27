'use client';

import { useRef, useState } from 'react';
import { Chart } from '@salmonui/charts/chart';
import type { ChartApi, ChartTooltipOptions } from '@salmonui/charts/chart';
import { Button } from '@salmonui/buttons/button';
import { Checkbox } from '@salmonui/inputs/checkbox';
import { Select } from '@salmonui/dropdowns/select';

const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const visits = months.map((month, i) => ({
  month,
  organic: 3200 + Math.round(900 * Math.sin(i / 2)),
  paid: 1800 + ((i * 410) % 1300),
  referral: 700 + ((i * 170) % 500),
}));

type Mode = 'point' | 'shared' | 'split';
type Position = 'nearest' | 'pointer' | 'fixed';
type Lines = 'off' | 'both' | 'x' | 'y';

export default function ChartTooltipCrosshairDemo() {
  const chart = useRef<ChartApi>(null);
  const [mode, setMode] = useState<Mode>('shared');
  const [position, setPosition] = useState<Position>('nearest');
  const [custom, setCustom] = useState(false);
  const [lines, setLines] = useState<Lines>('x');
  const [snap, setSnap] = useState(true);
  const [highlightCategory, setHighlightCategory] = useState(false);
  const [referralTooltip, setReferralTooltip] = useState(true);

  const tooltip: ChartTooltipOptions = {
    mode,
    position: position === 'fixed' ? { x: 80, y: 40 } : position,
    offset: 12,
    format: (p) => `${p.seriesName}: ${p.y.toLocaleString('en-US')} visits`,
    render: custom
      ? (ctx) => (
          <div>
            <strong>{ctx.header}</strong>
            <ul style={{ margin: 0, paddingInlineStart: 16 }}>
              {ctx.points.map((p) => (
                <li key={p.seriesId} style={{ color: p.color }}>
                  {p.seriesName}: {p.yText}
                </li>
              ))}
            </ul>
          </div>
        )
      : undefined,
  };

  return (
    <div className="demo-stack">
      <div className="demo-toolbar">
        <label>
          Tooltip mode
          <Select aria-label="Tooltip mode" data={['point', 'shared', 'split']} value={mode} onValueChange={(value) => value != null && setMode(value as Mode)} />
        </label>
        <label>
          Position
          <Select aria-label="Position" data={[{ value: 'nearest', label: 'nearest' }, { value: 'pointer', label: 'pointer' }, { value: 'fixed', label: 'fixed (80, 40)' }]} value={position} onValueChange={(value) => value != null && setPosition(value as Position)} />
        </label>
        <Checkbox checked={custom} onCheckedChange={(checked) => setCustom(checked)}>
          Custom render
        </Checkbox>
        <Checkbox checked={referralTooltip} onCheckedChange={(checked) => setReferralTooltip(checked)}>
          Referral in tooltip
        </Checkbox>
      </div>
      <div className="demo-toolbar">
        <label>
          Crosshair
          <Select aria-label="Crosshair" data={['off', 'both', 'x', 'y']} value={lines} onValueChange={(value) => value != null && setLines(value as Lines)} />
        </label>
        <Checkbox checked={snap} onCheckedChange={(checked) => setSnap(checked)}>
          Snap (trackball)
        </Checkbox>
        <Checkbox checked={highlightCategory} onCheckedChange={(checked) => setHighlightCategory(checked)}>
          Highlight category
        </Checkbox>
        <Button variant="outline" type="button" onClick={() => chart.current?.showTooltip({ seriesId: 'Paid', index: 5 })}>
          Show June paid tooltip
        </Button>
        <Button variant="outline" type="button" onClick={() => chart.current?.hideTooltip()}>
          Hide tooltip
        </Button>
        <Button variant="outline" type="button" onClick={() => chart.current?.showCrosshair({ x: 'Sep' })}>
          Crosshair at Sep
        </Button>
        <Button variant="outline" type="button" onClick={() => chart.current?.hideCrosshair()}>
          Hide crosshair
        </Button>
      </div>
      <Chart
        ref={chart}
        title="Website visits"
        data={visits}
        height={320}
        tooltip={tooltip}
        crosshair={lines === 'off' ? false : { lines, snap, highlightCategory, axisLabels: true }}
        series={[
          { type: 'line', name: 'Organic', xField: 'month', yField: 'organic', markers: true },
          { type: 'line', name: 'Paid', xField: 'month', yField: 'paid', markers: true },
          { type: 'line', name: 'Referral', xField: 'month', yField: 'referral', markers: true, tooltip: referralTooltip },
        ]}
      />
    </div>
  );
}
