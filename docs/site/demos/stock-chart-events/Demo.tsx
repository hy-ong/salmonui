'use client';

import { useEffect, useState } from 'react';
import { StockChart } from '@salmonui/charts/stock-chart';
import type { StockEvent } from '@salmonui/charts/stock-chart';
import { Button } from '@salmonui/buttons/button';
import { Checkbox } from '@salmonui/inputs/checkbox';

const DAY = 86_400_000;
const START = Date.UTC(2026, 0, 1);
const candle = (i: number) => {
  const trend = 80 + 10 * Math.sin(i / 25) + i * 0.04;
  const open = trend + 1.5 * Math.sin(i * 1.3);
  const close = trend + 1.5 * Math.sin(i * 1.3 + 0.9);
  return {
    date: new Date(START + i * DAY),
    open: Math.round(open * 100) / 100,
    close: Math.round(close * 100) / 100,
    high: Math.round((Math.max(open, close) + 0.9) * 100) / 100,
    low: Math.round((Math.min(open, close) - 0.9) * 100) / 100,
    volume: 9_000 + ((i * 4241) % 6_000),
  };
};
const initial = Array.from({ length: 200 }, (_, i) => candle(i));

const events: StockEvent[] = [
  { date: '2026-02-10', label: 'E', description: 'Q4 earnings beat estimates', shape: 'flag' },
  { date: '2026-03-20', label: 'D', description: 'Dividend of 0.40 per share', shape: 'circle' },
  { date: '2026-04-15', label: 'S', description: '2-for-1 stock split announced', shape: 'pin' },
  { date: '2026-05-28', label: 'V', description: 'Record trading volume', shape: 'arrowUp', seriesIds: ['volume'] },
  { date: '2026-06-30', label: 'Q2', description: 'Half-year report', shape: 'text' },
];

export default function StockChartEventsDemo() {
  const [data, setData] = useState(initial);
  const [running, setRunning] = useState(false);
  const [custom, setCustom] = useState(false);

  useEffect(() => {
    if (!running) return undefined;
    const timer = window.setInterval(() => setData((d) => [...d, candle(d.length)]), 400);
    return () => window.clearInterval(timer);
  }, [running]);

  return (
    <div className="demo-stack">
      <div className="demo-toolbar">
        <Button variant="outline" type="button" aria-pressed={running} onClick={() => setRunning((r) => !r)}>
          {running ? 'Pause' : 'Start'} live prices
        </Button>
        <Button variant="outline" type="button" onClick={() => setData(initial)}>
          Reset data
        </Button>
        <Checkbox checked={custom} onCheckedChange={(checked) => setCustom(checked)}>
          Custom event markers
        </Checkbox>
        <span className="demo-status">{data.length} trading days</span>
      </div>
      <StockChart
        title="Contoso Ltd."
        data={data}
        xField="date"
        openField="open"
        highField="high"
        lowField="low"
        closeField="close"
        volumeField="volume"
        name="Contoso"
        height={400}
        timeZone="UTC"
        locale="en-US"
        defaultPeriod="3m"
        events={events}
        renderEvent={custom ? (event) => <span className="demo-badge" data-tone="info" title={event.description}>{event.label}</span> : undefined}
        tooltip
      />
    </div>
  );
}
