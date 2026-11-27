'use client';

import { useState } from 'react';
import { Checkbox } from '@salmonui/inputs/checkbox';
import { NumberField } from '@salmonui/inputs/number-field';
import { Select } from '@salmonui/dropdowns/select';
import { Chart } from '@salmonui/charts/chart';
import type { ChartIndicator } from '@salmonui/charts/chart';
import { technicalIndicators } from '@salmonui/charts/chart/indicators';

const prices = Array.from({ length: 90 }, (_, i) => {
  const open = 50 + 6 * Math.sin(i / 9) + i / 10 + 1.5 * Math.sin(i * 1.3);
  const close = open + 1.4 * Math.sin(i * 2.1);
  return {
    date: new Date(Date.UTC(2026, 3, 1 + i)),
    open: Math.round(open * 100) / 100,
    close: Math.round(close * 100) / 100,
    high: Math.round((Math.max(open, close) + 0.8 + (i % 3) * 0.3) * 100) / 100,
    low: Math.round((Math.min(open, close) - 0.7 - (i % 4) * 0.25) * 100) / 100,
    volume: 5000 + ((i * 1777) % 4000),
  };
});

type Overlay = 'none' | 'sma' | 'ema' | 'tma' | 'bollinger';
type Oscillator = 'rsi' | 'momentum' | 'atr' | 'accumulationDistribution' | 'macd' | 'stochastic';

export default function ChartIndicatorsDemo() {
  const [overlay, setOverlay] = useState<Overlay>('bollinger');
  const [period, setPeriod] = useState(20);
  const [oscillator, setOscillator] = useState<Oscillator>('macd');
  const [macdDisplay, setMacdDisplay] = useState<'line' | 'histogram' | 'both'>('both');
  const [zones, setZones] = useState(true);

  const indicators: ChartIndicator[] = [];
  if (overlay !== 'none') indicators.push({ kind: overlay, seriesId: 'price', period, deviations: 2, name: overlay === 'bollinger' ? 'Bollinger' : overlay.toUpperCase() });
  indicators.push({
    kind: oscillator,
    seriesId: 'price',
    yAxis: 'oscillator',
    period: 14,
    fastPeriod: 12,
    slowPeriod: 26,
    signalPeriod: 9,
    display: macdDisplay,
    kPeriod: 14,
    dPeriod: 3,
    zones,
  });

  return (
    <div className="demo-stack">
      <div className="demo-toolbar">
        <label>
          Price overlay
          <Select aria-label="Price overlay" data={[{ value: 'none', label: 'none' }, { value: 'sma', label: 'SMA' }, { value: 'ema', label: 'EMA' }, { value: 'tma', label: 'TMA' }, { value: 'bollinger', label: 'Bollinger bands' }]} value={overlay} onValueChange={(value) => value != null && setOverlay(value as Overlay)} />
        </label>
        <label>
          Period
          <NumberField aria-label="Period" min={2} max={50} value={period} onValueChange={(next) => next != null && setPeriod(next)} style={{ inlineSize: '6em' }} />
        </label>
        <label>
          Lower pane
          <Select aria-label="Lower pane" data={[{ value: 'rsi', label: 'RSI' }, { value: 'momentum', label: 'Momentum' }, { value: 'atr', label: 'ATR' }, { value: 'accumulationDistribution', label: 'Accumulation / distribution' }, { value: 'macd', label: 'MACD' }, { value: 'stochastic', label: 'Stochastic' }]} value={oscillator} onValueChange={(value) => value != null && setOscillator(value as Oscillator)} />
        </label>
        <label>
          MACD display
          <Select aria-label="MACD display" data={[{ value: 'line', label: 'line' }, { value: 'histogram', label: 'histogram' }, { value: 'both', label: 'both' }]} value={macdDisplay} onValueChange={(value) => value != null && setMacdDisplay(value as 'line' | 'histogram' | 'both')} disabled={oscillator !== 'macd'} />
        </label>
        <Checkbox checked={zones} onCheckedChange={(checked) => setZones(checked)} disabled={oscillator !== 'rsi' && oscillator !== 'stochastic' && oscillator !== 'momentum'}>Zones</Checkbox>
      </div>
      <Chart
        title="Technical indicators"
        data={prices}
        height={420}
        timeZone="UTC"
        locale="en-US"
        features={[technicalIndicators]}
        panes={{ rows: ['65%', '35%'] }}
        xAxis={{ format: 'MMMd' }}
        axes={[{ id: 'oscillator', direction: 'y', pane: { row: 1 }, title: oscillator === 'accumulationDistribution' ? 'A/D' : oscillator.toUpperCase() }]}
        series={[{ id: 'price', type: 'candle', name: 'Price', xField: 'date', openField: 'open', highField: 'high', lowField: 'low', closeField: 'close', volumeField: 'volume' }]}
        indicators={indicators}
      />
    </div>
  );
}
