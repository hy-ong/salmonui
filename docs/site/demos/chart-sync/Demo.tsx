'use client';

import { useState } from 'react';
import { Checkbox } from '@salmonui/inputs/checkbox';
import { Chart, ChartSyncGroup } from '@salmonui/charts/chart';
import type { ChartPointRef } from '@salmonui/charts/chart';

const days = Array.from({ length: 60 }, (_, d) => ({
  day: d + 1,
  visitors: 800 + Math.round(250 * Math.sin(d / 5)) + d * 4,
  orders: 40 + Math.round(15 * Math.sin(d / 5 + 0.6)) + Math.round(d / 4),
}));

export default function ChartSyncDemo() {
  const [tooltip, setTooltip] = useState(true);
  const [crosshair, setCrosshair] = useState(true);
  const [zoom, setZoom] = useState(true);
  const [selection, setSelection] = useState(true);
  const [visitorSel, setVisitorSel] = useState<readonly ChartPointRef[]>([]);
  const [orderSel, setOrderSel] = useState<readonly ChartPointRef[]>([]);
  return (
    <div className="demo-stack">
      <div className="demo-toolbar">
        <Checkbox checked={tooltip} onCheckedChange={(checked) => setTooltip(checked)}>Sync tooltip</Checkbox>
        <Checkbox checked={crosshair} onCheckedChange={(checked) => setCrosshair(checked)}>Sync crosshair</Checkbox>
        <Checkbox checked={zoom} onCheckedChange={(checked) => setZoom(checked)}>Sync zoom</Checkbox>
        <Checkbox checked={selection} onCheckedChange={(checked) => setSelection(checked)}>Sync selection</Checkbox>
      </div>
      <ChartSyncGroup tooltip={tooltip} crosshair={crosshair} zoom={zoom} selection={selection}>
        <Chart
          title="Visitors"
          data={days}
          height={200}
          legend={false}
          tooltip
          crosshair={{ lines: 'x' }}
          zoom={{ mode: 'x' }}
          selection
          selectedPoints={visitorSel}
          onSelectedPointsChange={setVisitorSel}
          series={[{ type: 'area', name: 'Visitors', xField: 'day', yField: 'visitors' }]}
        />
        <Chart
          title="Orders"
          data={days}
          height={200}
          legend={false}
          tooltip
          crosshair={{ lines: 'x' }}
          zoom={{ mode: 'x' }}
          selection
          selectedPoints={orderSel}
          onSelectedPointsChange={setOrderSel}
          series={[{ type: 'column', name: 'Orders', xField: 'day', yField: 'orders' }]}
        />
      </ChartSyncGroup>
      <p className="demo-status" aria-live="polite">
        Selected days: visitors <code>{visitorSel.map((p) => p.index + 1).join(', ') || 'none'}</code>, orders{' '}
        <code>{orderSel.map((p) => p.index + 1).join(', ') || 'none'}</code>
      </p>
    </div>
  );
}
