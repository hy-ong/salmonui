'use client';

import { useState } from 'react';
import { Checkbox } from '@salmonui/inputs/checkbox';
import { Select } from '@salmonui/dropdowns/select';
import { Chart } from '@salmonui/charts/chart';

// 30 trading days of deterministic prices (UTC dates, so server and client agree).
const prices = Array.from({ length: 30 }, (_, i) => {
  const open = 100 + 8 * Math.sin(i / 4) + (i % 5);
  const close = open + 3 * Math.sin(i * 1.7);
  return {
    date: new Date(Date.UTC(2026, 0, 5 + i)),
    open: Math.round(open * 100) / 100,
    close: Math.round(close * 100) / 100,
    high: Math.round((Math.max(open, close) + 1.5 + (i % 3)) * 100) / 100,
    low: Math.round((Math.min(open, close) - 1.2 - (i % 4) * 0.5) * 100) / 100,
    volume: 1200 + ((i * 377) % 900),
  };
});

type Kind = 'candle' | 'ohlc' | 'hilo';

export default function ChartFinancialDemo() {
  const [type, setType] = useState<Kind>('candle');
  const [hollow, setHollow] = useState(false);
  const [volume, setVolume] = useState(true);
  return (
    <div className="demo-stack">
      <div className="demo-toolbar">
        <label>
          Series type
          <Select aria-label="Series type" data={[{ value: 'candle', label: 'candle' }, { value: 'ohlc', label: 'ohlc' }, { value: 'hilo', label: 'hilo' }]} value={type} onValueChange={(value) => value != null && setType(value as Kind)} />
        </label>
        <Checkbox checked={hollow} onCheckedChange={(checked) => setHollow(checked)} disabled={type !== 'candle'}>Hollow candles</Checkbox>
        <Checkbox checked={volume} onCheckedChange={(checked) => setVolume(checked)} disabled={type !== 'candle'}>Volume</Checkbox>
      </div>
      <Chart
        title="ACME daily prices"
        data={prices}
        height={340}
        timeZone="UTC"
        locale="en-US"
        xAxis={{ format: 'MMMd' }}
        yAxis={{ format: 'c0' }}
        tooltip
        series={[
          {
            type,
            name: 'ACME',
            xField: 'date',
            openField: 'open',
            highField: 'high',
            lowField: 'low',
            closeField: 'close',
            hollow,
            volumeField: type === 'candle' && volume ? 'volume' : undefined,
          },
        ]}
      />
    </div>
  );
}
