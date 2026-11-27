// `@salmonui/charts/chart/indicators`: the technical indicator
// layout, an opt-in feature for the `features` prop: `<Chart features={[technicalIndicators]}
// indicators={[...]} />`. Generated series join the model after every
// series; oscillators go to `indicator.yAxis` (an axis with a pane)
// or a generated secondary axis, and RSI / Stochastic zones become lines and
// a band on that axis. A chart without the feature never loads this code.

import { accumulationDistribution, atr, bollinger, ema, macd, momentum, rsi, sma, stochastic, tma } from '#viz';
import { readField } from '../internal/viz/fields.js';
import type { ChartSpec, CompiledAxis, CompiledSeries } from './model.js';
import type { ChartIndicator, ChartProps } from './types.js';

export interface IndicatorResult {
  /** Generated series, drawn after every series. */
  readonly series: readonly CompiledSeries[];
  /** Generated or extended axes (zones), by id. */
  readonly axes: readonly CompiledAxis[];
}

const OVERLAY = new Set(['sma', 'ema', 'tma', 'bollinger']);
const LABEL: Readonly<Record<ChartIndicator['kind'], string>> = {
  sma: 'SMA',
  ema: 'EMA',
  tma: 'TMA',
  momentum: 'Momentum',
  rsi: 'RSI',
  atr: 'ATR',
  accumulationDistribution: 'A/D',
  bollinger: 'Bollinger',
  macd: 'MACD',
  stochastic: 'Stochastic',
};

export function indicatorSeries(props: ChartProps, spec: ChartSpec): IndicatorResult {
  const series: CompiledSeries[] = [];
  const add = (s: CompiledSeries) => series.push(s);
  const axes = new Map<string, CompiledAxis>();
  for (const [k, ind] of (props.indicators ?? []).entries()) {
    const src = spec.series.find((s) => s.id === ind.seriesId);
    if (!src) continue;
    const id = ind.id ?? `${ind.kind}-${k}`;
    const p = ind.period ?? 14;
    const close = (ind.field === 'open' ? src.open : ind.field === 'high' ? src.high : ind.field === 'low' ? src.low : src.close) ?? src.y;
    const high = src.high ?? close;
    const low = src.low ?? close;
    let yAxis = ind.yAxis ?? src.yAxis;
    if (!ind.yAxis && !OVERLAY.has(ind.kind)) {
      // Oscillators get their own secondary axis unless one is named.
      yAxis = `${id}-axis`;
      axes.set(yAxis, { id: yAxis, direction: 'y', options: { id: yAxis, gridLines: false, includeZero: false }, scale: 'linear', categories: [], position: 'end' });
    }
    const name = ind.name ?? LABEL[ind.kind];
    const line = (suffix: string, label: string, y: Float64Array, extra: Partial<CompiledSeries> = {}): CompiledSeries => ({
      ...src,
      id: suffix ? `${id}-${suffix}` : id,
      name: label,
      type: 'line',
      yAxis,
      y,
      low: undefined,
      high: undefined,
      open: undefined,
      close: undefined,
      color: ind.color ?? src.color,
      generated: true,
      options: { type: 'line', id, name: label, markers: false, labels: false, tooltip: true, xField: src.options.xField },
      ...extra,
    });
    switch (ind.kind) {
      case 'sma':
      case 'ema':
      case 'tma':
        add(line('', `${name} ${p}`, (ind.kind === 'sma' ? sma : ind.kind === 'ema' ? ema : tma)(close, p)));
        break;
      case 'momentum':
        add(line('', name, momentum(close, p)));
        break;
      case 'rsi':
        add(line('', name, rsi(close, p)));
        break;
      case 'atr':
        add(line('', name, atr(high, low, close, p)));
        break;
      case 'accumulationDistribution': {
        const vf = src.options.volumeField;
        const volume = Float64Array.from(src.data, (d) => Number(vf ? readField(d, vf) : 0) || 0);
        add(line('', name, accumulationDistribution(high, low, close, volume)));
        break;
      }
      case 'bollinger': {
        const b = bollinger(close, ind.period ?? 20, ind.deviations ?? 2);
        add(line('band', `${name} band`, b.upper, { type: 'area', low: b.lower, high: b.upper, options: { type: 'area', id, name, opacity: 0.15, markers: false, labels: false, tooltip: false } }));
        add(line('', `${name} ${ind.period ?? 20}`, b.middle));
        break;
      }
      case 'macd': {
        const m = macd(close, ind.fastPeriod ?? 12, ind.slowPeriod ?? 26, ind.signalPeriod ?? 9);
        const display = ind.display ?? 'both';
        if (display !== 'line') add(line('histogram', `${name} histogram`, m.histogram, { type: 'column', options: { type: 'column', id, name, labels: false, tooltip: true } }));
        if (display !== 'histogram') {
          add(line('', name, m.macd));
          add(line('signal', `${name} signal`, m.signal, { color: 'var(--salmon-chart-axis, currentColor)' }));
        }
        break;
      }
      case 'stochastic': {
        const st = stochastic(high, low, close, ind.kPeriod ?? 14, ind.dPeriod ?? 3);
        add(line('', `${name} %K`, st.k));
        add(line('d', `${name} %D`, st.d, { color: 'var(--salmon-chart-axis, currentColor)' }));
        break;
      }
    }
    // Overbought / oversold zones: two axis lines and the band between them.
    if (ind.zones && (ind.kind === 'rsi' || ind.kind === 'stochastic')) {
      const z = typeof ind.zones === 'object' ? ind.zones : {};
      const upper = z.upper ?? (ind.kind === 'rsi' ? 70 : 80);
      const lower = z.lower ?? (ind.kind === 'rsi' ? 30 : 20);
      const a = axes.get(yAxis) ?? spec.axes.get(yAxis);
      if (a) {
        const o = a.options;
        axes.set(yAxis, { ...a, options: { ...o, lines: [...(o.lines ?? []), { value: upper, label: String(upper) }, { value: lower, label: String(lower) }], bands: [...(o.bands ?? []), { from: lower, to: upper }] } });
      }
    }
  }
  return { series, axes: [...axes.values()] };
}

/** The indicator layout, keyed for `features`. */
export type IndicatorLayout = typeof indicatorSeries;

/** The feature value for `features`. */
export const technicalIndicators = { name: 'indicators' as const, layout: indicatorSeries };
