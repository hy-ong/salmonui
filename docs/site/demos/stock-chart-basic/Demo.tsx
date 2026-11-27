'use client';

import { useState } from 'react';
import { Button } from '@salmonui/buttons/button';
import { Checkbox } from '@salmonui/inputs/checkbox';
import { Select } from '@salmonui/dropdowns/select';
import { StockChart } from '@salmonui/charts/stock-chart';
import type { IndicatorKind, StockSeriesType, TrendlineKind } from '@salmonui/charts/stock-chart';
import { periodRange, type RangeValue } from '@salmonui/charts/range-selector';

// Three years of deterministic daily prices (UTC dates): about 1,100 candles,
// merged per pixel bucket when the whole range is visible.
const DAY = 86_400_000;
const START = Date.UTC(2023, 10, 24);
const prices = Array.from({ length: 1096 }, (_, i) => {
  const trend = 120 + i * 0.05 + 18 * Math.sin(i / 60) + 6 * Math.sin(i / 11);
  const open = trend + 2 * Math.sin(i * 1.7);
  const close = trend + 2 * Math.sin(i * 1.7 + 1.1);
  return {
    date: new Date(START + i * DAY),
    open: Math.round(open * 100) / 100,
    close: Math.round(close * 100) / 100,
    high: Math.round((Math.max(open, close) + 1 + (i % 4) * 0.4) * 100) / 100,
    low: Math.round((Math.min(open, close) - 1 - (i % 3) * 0.5) * 100) / 100,
    volume: 20_000 + ((i * 7919) % 15_000),
  };
});

const END = START + 1095 * DAY;
const initialRange: RangeValue = periodRange({ id: '6m', unit: 'month', count: 6, label: '6M' }, END, START, 'UTC');
const fmtDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);

export default function StockChartBasicDemo() {
  const [period, setPeriod] = useState<string | null>('6m');
  const [range, setRange] = useState<RangeValue>(initialRange);
  const [seriesType, setSeriesType] = useState<StockSeriesType>('candle');
  const [indicators, setIndicators] = useState<readonly IndicatorKind[]>(['ema']);
  const [trendlines, setTrendlines] = useState<readonly TrendlineKind[]>([]);
  const [navigator, setNavigator] = useState(true);
  const [periodPosition, setPeriodPosition] = useState<'top' | 'bottom'>('top');
  const [lastReason, setLastReason] = useState('');
  const oscillator = indicators.includes('rsi') || indicators.includes('macd');
  return (
    <div className="demo-stack">
      <div className="demo-toolbar">
        <Checkbox checked={navigator} onCheckedChange={(checked) => setNavigator(checked)}>Navigator</Checkbox>
        <label>
          Period buttons
          <Select aria-label="Period buttons" data={[{ value: 'top', label: 'top' }, { value: 'bottom', label: 'bottom' }]} value={periodPosition} onValueChange={(value) => value != null && setPeriodPosition(value as 'top' | 'bottom')} />
        </label>
        <Button variant="outline" type="button" onClick={() => {
            setRange([Date.UTC(2025, 0, 1), Date.UTC(2025, 2, 31)]);
            setPeriod(null);
          }}>
          Show Q1 2025
        </Button>
      </div>
      <StockChart
        title="ACME Corp."
        data={prices}
        xField="date"
        openField="open"
        highField="high"
        lowField="low"
        closeField="close"
        volumeField="volume"
        name="ACME"
        height={420}
        timeZone="UTC"
        locale="en-US"
        period={period}
        onPeriodChange={(p) => setPeriod(p)}
        periodSelector={{ position: periodPosition }}
        range={range}
        onRangeChange={(r, event) => {
          setRange(r);
          setLastReason(event.reason);
        }}
        seriesType={seriesType}
        onSeriesTypeChange={setSeriesType}
        indicators={indicators}
        onIndicatorsChange={setIndicators}
        trendlines={trendlines}
        onTrendlinesChange={setTrendlines}
        navigator={navigator ? { height: 70 } : false}
        customRange
        toolbar={{ seriesTypes: ['candle', 'ohlc', 'hilo', 'line', 'area', 'column'], indicators: ['sma', 'ema', 'bollinger', 'rsi', 'macd'], trendlines: ['linear', 'polynomial', 'movingAverage'], export: ['png', 'svg', 'csv', 'xlsx', 'pdf', 'print'] }}
        exportWriters={{ pdf: () => import('@salmonui/export/graphics'), xlsx: () => import('@salmonui/export/xlsx') }}
        tooltip={{ mode: 'shared' }}
        crosshair={{ snap: true, axisLabels: true }}
        // RSI and MACD get a pane of their own; without them the price pane takes the whole plot.
        panes={oscillator ? { rows: ['72%', '28%'] } : undefined}
        axes={oscillator ? [{ id: 'indicator', direction: 'y', pane: { row: 1 } }] : undefined}
      />
      <p className="demo-status" aria-live="polite">
        period <code>{period ?? 'null'}</code>, range <code>{`${fmtDay(range[0])} to ${fmtDay(range[1])}`}</code>
        {lastReason ? (
          <>
            {' '}
            (last change: <code>{lastReason}</code>)
          </>
        ) : null}
        , series <code>{seriesType}</code>, indicators <code>{indicators.join(', ') || 'none'}</code>, trendlines <code>{trendlines.join(', ') || 'none'}</code>
      </p>
    </div>
  );
}
