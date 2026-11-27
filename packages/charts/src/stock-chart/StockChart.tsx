'use client';

// `StockChart`: a thin composition of `Chart`, `RangeSelector`,
// `PeriodSelector` and a toolbar of `MenuButton`s. Every `Chart` prop
// applies. The visible range is one triad (`range`) shared by the
// chart's x zoom range, the navigator and the period buttons. Imports go
// through the public subpaths, so `/stock-chart` carries only its own code.

import { lazy, Suspense, useMemo, useRef, type ReactNode } from 'react';
import { Chart, type ChartApi, type ChartProps, type ChartSeriesOptions, type ChartSeriesType, type ChartTrendline } from '@salmonui/charts/chart';
import { MenuButton, type MenuActionEvent } from '@salmonui/buttons/menu';
import { Toolbar, ToolbarItem } from '@salmonui/navigation/toolbar';
import { PeriodSelector, RangeSelector, periodRange, type Period, type RangeSelectorProps, type RangeValue } from '@salmonui/charts/range-selector';
import { atr, bollinger, ema, macd, momentum, rsi, sma, stochastic, accumulationDistribution, tma } from '#viz';
import { useControllableState } from '@salmonui/core/internal/controllable';
import { useLocaleText } from '@salmonui/core/internal/locale';
import { useHydrated } from '@salmonui/core/internal/hydrated';

// The custom range field loads with the date range picker entry after hydration, only when it is on.
const DateRangePicker = lazy(() => import('@salmonui/calendars/date-range-picker').then((m) => ({ default: m.DateRangePicker })));
const DAY_MS = 86_400_000;
const isoDay = (t: number) => new Date(t).toISOString().slice(0, 10);

export type StockSeriesType = Extract<ChartSeriesType, 'candle' | 'ohlc' | 'hilo' | 'line' | 'area' | 'column'>;
export type IndicatorKind = 'sma' | 'ema' | 'tma' | 'momentum' | 'rsi' | 'atr' | 'accumulationDistribution' | 'bollinger' | 'macd' | 'stochastic';
export type TrendlineKind = ChartTrendline['kind'];
/** `pdf` and `xlsx` need `exportWriters.pdf` / `exportWriters.xlsx`; without the loader the item is left out. */
export type StockExportFormat = 'png' | 'jpeg' | 'svg' | 'csv' | 'xlsx' | 'pdf' | 'print';

export interface StockEvent {
  readonly date: number | string | Date;
  readonly label: string;
  readonly description?: string | undefined;
  readonly shape?: 'circle' | 'square' | 'flag' | 'pin' | 'triangle' | 'invertedTriangle' | 'triangleRight' | 'triangleLeft' | 'arrowUp' | 'arrowDown' | 'arrowLeft' | 'arrowRight' | 'text' | undefined;
  /** Series the event marks (default `['price']`; `'volume'` places it on the volume bars). */
  readonly seriesIds?: readonly string[] | undefined;
}

export interface StockChangeEvent<R extends string> {
  readonly source: 'pointer' | 'keyboard' | 'touch' | 'api';
  readonly reason: R;
}

export interface StockChartProps extends Omit<ChartProps, 'series' | 'zoomRange' | 'defaultZoomRange' | 'onZoomRangeChange' | 'indicators'> {
  readonly data: NonNullable<ChartProps['data']>;
  readonly xField: string;
  readonly openField?: string | undefined;
  readonly highField?: string | undefined;
  readonly lowField?: string | undefined;
  readonly closeField: string;
  readonly volumeField?: string | undefined;
  readonly name?: string | undefined;
  readonly seriesType?: StockSeriesType | undefined;
  readonly defaultSeriesType?: StockSeriesType | undefined;
  readonly onSeriesTypeChange?: ((type: StockSeriesType, event: StockChangeEvent<'toolbar'>) => void) | undefined;
  readonly range?: RangeValue | undefined;
  readonly defaultRange?: RangeValue | undefined;
  readonly onRangeChange?: ((range: RangeValue, event: StockChangeEvent<string>) => void) | undefined;
  readonly periods?: readonly Period[] | undefined;
  /** Selected period id (`null`: none). A selected period holds the range at the data end; a controlled `range` wins. */
  readonly period?: string | null | undefined;
  readonly defaultPeriod?: string | null | undefined;
  readonly onPeriodChange?: ((period: string | null, event: StockChangeEvent<string>) => void) | undefined;
  readonly periodSelector?: boolean | { readonly position?: 'top' | 'bottom' } | undefined;
  readonly navigator?: boolean | Partial<RangeSelectorProps> | undefined;
  readonly indicators?: readonly IndicatorKind[] | undefined;
  readonly defaultIndicators?: readonly IndicatorKind[] | undefined;
  readonly onIndicatorsChange?: ((kinds: readonly IndicatorKind[], event: StockChangeEvent<'toolbar'>) => void) | undefined;
  readonly trendlines?: readonly TrendlineKind[] | undefined;
  readonly defaultTrendlines?: readonly TrendlineKind[] | undefined;
  readonly onTrendlinesChange?: ((kinds: readonly TrendlineKind[], event: StockChangeEvent<'toolbar'>) => void) | undefined;
  readonly toolbar?:
    | false
    | {
        readonly seriesTypes?: readonly StockSeriesType[] | undefined;
        readonly indicators?: readonly IndicatorKind[] | undefined;
        readonly trendlines?: readonly TrendlineKind[] | undefined;
        readonly export?: readonly StockExportFormat[] | undefined;
      }
    | undefined;
  readonly events?: readonly StockEvent[] | undefined;
  readonly renderEvent?: ((event: StockEvent) => ReactNode) | undefined;
  /** A date range field in the toolbar; its days are UTC calendar days. */
  readonly customRange?: boolean | undefined;
  readonly stockText?: Partial<{ readonly seriesType: string; readonly indicators: string; readonly trendlines: string; readonly export: string; readonly toolbar: string; readonly reset: string; readonly customRange: string; readonly period: string; readonly allPeriod: string; readonly events: string }> | undefined;
}

const DEFAULT_PERIODS: readonly Period[] = [
  { id: '1m', unit: 'month', count: 1, label: '1M' },
  { id: '3m', unit: 'month', count: 3, label: '3M' },
  { id: '6m', unit: 'month', count: 6, label: '6M' },
  { id: 'ytd', unit: 'ytd', label: 'YTD' },
  { id: '1y', unit: 'year', count: 1, label: '1Y' },
  { id: 'all', unit: 'all', label: 'All' },
];

const INDICATOR_LABEL: Readonly<Record<IndicatorKind, string>> = {
  sma: 'SMA',
  ema: 'EMA',
  tma: 'TMA',
  momentum: 'Momentum',
  rsi: 'RSI',
  atr: 'ATR',
  accumulationDistribution: 'Accumulation distribution',
  bollinger: 'Bollinger bands',
  macd: 'MACD',
  stochastic: 'Stochastic',
};

const toTime = (v: unknown): number => (v instanceof Date ? v.getTime() : typeof v === 'string' ? Date.parse(v.length === 10 ? `${v}T00:00:00Z` : v) : Number(v));
const EMPTY: readonly never[] = [];
const NO_ZOOM = {};

/** Indicator series computed from the OHLC columns on a secondary `indicator` axis. */
export function indicatorSeries(kind: IndicatorKind, data: readonly Record<string, unknown>[], f: { x: string; open?: string | undefined; high?: string | undefined; low?: string | undefined; close: string; volume?: string | undefined }): ChartSeriesOptions[] {
  const col = (name?: string | undefined) => Float64Array.from(data, (d) => Number(name ? d[name] : Number.NaN));
  const close = col(f.close);
  const high = f.high ? col(f.high) : close;
  const low = f.low ? col(f.low) : close;
  const rows = (values: Record<string, Float64Array>) => data.map((d, i) => {
    const r: Record<string, unknown> = { [f.x]: d[f.x] };
    for (const [k, v] of Object.entries(values)) r[k] = v[i];
    return r;
  });
  const line = (id: string, name: string, values: Float64Array, axis = 'indicator'): ChartSeriesOptions => ({ id: `indicator-${id}`, name, type: 'line', data: rows({ v: values }), xField: f.x, yField: 'v', yAxis: axis, tooltip: true });
  switch (kind) {
    case 'sma':
      return [line('sma', 'SMA 14', sma(close, 14), 'y')];
    case 'ema':
      return [line('ema', 'EMA 14', ema(close, 14), 'y')];
    case 'tma':
      return [line('tma', 'TMA 14', tma(close, 14), 'y')];
    case 'bollinger': {
      const b = bollinger(close, 14, 2);
      return [{ id: 'indicator-bollinger', name: 'Bollinger', type: 'area', data: rows({ lo: b.lower, hi: b.upper }), xField: f.x, lowField: 'lo', highField: 'hi', opacity: 0.15 }, line('bollinger-mid', 'Bollinger middle', b.middle, 'y')];
    }
    case 'momentum':
      return [line('momentum', 'Momentum 14', momentum(close, 14))];
    case 'rsi':
      return [line('rsi', 'RSI 14', rsi(close, 14))];
    case 'atr':
      return [line('atr', 'ATR 14', atr(high, low, close, 14))];
    case 'accumulationDistribution':
      return [line('ad', 'Accumulation distribution', accumulationDistribution(high, low, close, col(f.volume)))];
    case 'macd': {
      const m = macd(close, 12, 26, 9);
      return [{ id: 'indicator-macd-histogram', name: 'MACD histogram', type: 'column', data: rows({ v: m.histogram }), xField: f.x, yField: 'v', yAxis: 'indicator' }, line('macd', 'MACD', m.macd), line('macd-signal', 'Signal', m.signal)];
    }
    case 'stochastic': {
      const s = stochastic(high, low, close, 14, 3);
      return [line('stochastic-k', '%K', s.k), line('stochastic-d', '%D', s.d)];
    }
  }
}

export function StockChart(props: StockChartProps): ReactNode {
  const chartRef = useRef<ChartApi | null>(null);
  const text = { seriesType: 'Series type', indicators: 'Indicators', trendlines: 'Trendlines', export: 'Export', toolbar: 'Stock chart tools', reset: 'Reset', customRange: 'Date range', period: 'Period', allPeriod: 'All', events: 'Events', ...useLocaleText('stockChart', props.stockText) };
  const hydrated = useHydrated();
  const [seriesType, setSeriesType] = useControllableState<StockSeriesType, [StockChangeEvent<'toolbar'>]>(props.seriesType, props.defaultSeriesType ?? 'candle', props.onSeriesTypeChange, 'StockChart seriesType');
  const [indicators, setIndicators] = useControllableState<readonly IndicatorKind[], [StockChangeEvent<'toolbar'>]>(props.indicators, props.defaultIndicators ?? EMPTY, props.onIndicatorsChange, 'StockChart indicators');
  const [trendlines, setTrendlines] = useControllableState<readonly TrendlineKind[], [StockChangeEvent<'toolbar'>]>(props.trendlines, props.defaultTrendlines ?? EMPTY, props.onTrendlinesChange, 'StockChart trendlines');
  const extent = useMemo(() => {
    let lo = Number.POSITIVE_INFINITY;
    let hi = Number.NEGATIVE_INFINITY;
    for (const d of props.data) {
      const t = toTime(d[props.xField]);
      if (!Number.isFinite(t)) continue;
      lo = Math.min(lo, t);
      hi = Math.max(hi, t);
    }
    return Number.isFinite(lo) ? ([lo, hi] as const) : ([0, 1] as const);
  }, [props.data, props.xField]);
  // `null` follows the full data, so a new `data` array or `api.appendPoints` stays in view
  // until the user narrows the range; a range equal to the data extent returns to following it.
  const [picked, setPicked] = useControllableState<RangeValue | null, [StockChangeEvent<string>]>(props.range, props.defaultRange ?? null, undefined, 'StockChart range');
  const periods = props.periods ?? DEFAULT_PERIODS.map((p) => (p.id === 'all' ? { ...p, label: text.allPeriod } : p));
  const [periodId, setPeriodId] = useControllableState<string | null, [StockChangeEvent<string>]>(props.period, props.defaultPeriod ?? null, props.onPeriodChange, 'StockChart period');
  const held = periods.find((p) => p.id === periodId);
  const heldRange = useMemo(() => (held && props.range === undefined ? periodRange(held, extent[1], extent[0], props.timeZone) : null), [held, props.range, extent, props.timeZone]);
  const sameRange = (a: RangeValue, b: RangeValue) => Math.abs(a[0] - b[0]) <= 1 && Math.abs(a[1] - b[1]) <= 1;
  const atExtent = (v: RangeValue) => v[0] === extent[0] && v[1] === extent[1];
  const view = heldRange ? (atExtent(heldRange) ? null : heldRange) : picked;
  const range = view ?? extent;
  // The full range is the `all` period even when a long period (1Y) clamps to the same window.
  const periodAt = (v: RangeValue) => ((atExtent(v) && periods.find((p) => p.unit === 'all')) || periods.find((p) => sameRange(periodRange(p, extent[1], extent[0], props.timeZone), v)))?.id ?? null;
  const setRange = (v: RangeValue, e: StockChangeEvent<string>, id: string | null = periodAt(v)) => {
    const moved = v[0] !== range[0] || v[1] !== range[1];
    setPeriodId(id, e);
    // A controlled period moves the view when the application accepts it.
    if (e.reason !== 'period' || props.period === undefined) setPicked(atExtent(v) ? null : v, e);
    if (moved) props.onRangeChange?.(v, e);
  };
  const fields = { x: props.xField, open: props.openField, high: props.highField, low: props.lowField, close: props.closeField, volume: props.volumeField };
  const ohlc = seriesType === 'candle' || seriesType === 'ohlc' || seriesType === 'hilo';
  const main: ChartSeriesOptions = {
    id: 'price',
    name: props.name ?? 'Price',
    type: seriesType,
    xField: props.xField,
    ...(ohlc ? { openField: props.openField, highField: props.highField, lowField: props.lowField, closeField: props.closeField } : { yField: props.closeField }),
    trendlines: trendlines.map((kind) => ({ kind, period: 14, order: 2 })),
  };
  const series: ChartSeriesOptions[] = [main];
  if (props.volumeField) series.push({ id: 'volume', name: 'Volume', type: 'column', xField: props.xField, yField: props.volumeField, yAxis: 'volume', opacity: 0.35, color: 'var(--salmon-text-disabled)' });
  for (const kind of indicators) series.push(...indicatorSeries(kind, props.data as readonly Record<string, unknown>[], fields));
  type StockAxis = NonNullable<ChartProps['axes']>[number];
  const axes: StockAxis[] = [...(props.axes ?? [])];
  // An application axis with a generated id refines it (`pane`, `title`); the last definition of an id wins.
  const addAxis = (a: StockAxis) => axes.push({ ...a, ...props.axes?.find((u) => u.id === a.id) });
  if (props.volumeField) addAxis({ id: 'volume', direction: 'y', position: 'end', hidden: true, gridLines: false, domain: ([, hi]: readonly [number, number]) => [0, hi * 4] });
  if (indicators.some((k) => k !== 'sma' && k !== 'ema' && k !== 'tma' && k !== 'bollinger')) addAxis({ id: 'indicator', direction: 'y', position: 'end', gridLines: false, includeZero: false });
  const annotations = [
    // Date strings like the data's x values resolve on the time axis.
    ...(props.annotations ?? []).map((a) => (typeof a.x === 'string' && a.units !== 'pixel' && (a.xAxis ?? 'x') === 'x' && (props.xAxis?.scale ?? 'time') === 'time' ? { ...a, x: toTime(a.x) } : a)),
    ...(props.events ?? []).flatMap((e) => {
      const t = toTime(e.date);
      const datum = props.data.find((d) => toTime(d[props.xField]) === t);
      // One marker per series the event names, at that series' value.
      return (e.seriesIds ?? ['price']).map((id) => {
        const volume = id === 'volume' && props.volumeField;
        const y = Number(datum?.[volume ? (props.volumeField as string) : (props.highField ?? props.closeField)] ?? 0);
        return { x: t, y, yAxis: volume ? 'volume' : 'y', content: props.renderEvent ? props.renderEvent(e) : <span className="salmon-stock-chart-event" data-shape={e.shape ?? 'flag'} title={e.description}>{e.label}</span> };
      });
    }),
  ];
  const tb = props.toolbar === false ? null : (props.toolbar ?? {});
  const seriesTypes = tb?.seriesTypes ?? ['candle', 'ohlc', 'line', 'area'];
  const indicatorKinds = tb?.indicators ?? ['sma', 'ema', 'bollinger', 'rsi', 'macd'];
  const trendKinds = tb?.trendlines ?? ['linear', 'movingAverage'];
  const writers = props.exportWriters;
  const exportFormats = (tb?.export ?? ['png', 'svg', 'csv', 'xlsx', 'pdf', 'print']).filter((f) => (f !== 'pdf' || writers?.pdf) && (f !== 'xlsx' || writers?.xlsx));
  const toggle = <T,>(list: readonly T[], v: T): T[] => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  const src = (e: MenuActionEvent): StockChangeEvent<'toolbar'> => ({ source: e.source === 'keyboard' ? 'keyboard' : 'pointer', reason: 'toolbar' });
  const navigatorProps = typeof props.navigator === 'object' ? props.navigator : {};
  const { xField, openField, highField, lowField, closeField, volumeField, name, toolbar, events, renderEvent, periods: _p, period: _pv, defaultPeriod, onPeriodChange, periodSelector, navigator, range: _r, defaultRange, onRangeChange, seriesType: _s, defaultSeriesType, onSeriesTypeChange, indicators: _i, defaultIndicators, onIndicatorsChange, trendlines: _t, defaultTrendlines, onTrendlinesChange, stockText, customRange, className, style, onClick, onDoubleClick, onContextMenu, onPointerDown, onPointerUp, onPointerMove, onPointerLeave, ...chartRest } = props;
  void [xField, openField, highField, lowField, closeField, volumeField, name, toolbar, events, renderEvent, _p, _pv, defaultPeriod, onPeriodChange, periodSelector, navigator, _r, defaultRange, onRangeChange, _s, defaultSeriesType, onSeriesTypeChange, _i, defaultIndicators, onIndicatorsChange, _t, defaultTrendlines, onTrendlinesChange, stockText, customRange];
  const periodBar = props.periodSelector !== false && periods.length ? <PeriodSelector aria-label={text.period} periods={periods} value={props.period !== undefined ? props.period : heldRange && sameRange(heldRange, range) ? periodId : periodAt(range)} onValueChange={(id, e) => { const p = periods.find((x) => x.id === id); if (p) setRange(periodRange(p, extent[1], extent[0], props.timeZone), { source: e.source, reason: 'period' }, p.id); }} /> : null;
  const periodBottom = typeof props.periodSelector === 'object' && props.periodSelector.position === 'bottom';
  return (
    <div className={`salmon-stock-chart${className ? ` ${className}` : ''}`} style={style} onClick={onClick} onDoubleClick={onDoubleClick} onContextMenu={onContextMenu} onPointerDown={onPointerDown} onPointerUp={onPointerUp} onPointerMove={onPointerMove} onPointerLeave={onPointerLeave}>
      {tb || props.customRange || (periodBar && !periodBottom) ? (
        <Toolbar className="salmon-stock-chart-toolbar" aria-label={text.toolbar} overflow="wrap">
          {periodBottom ? null : periodBar}
          {props.customRange && hydrated ? (
            <ToolbarItem overflow="never">
              <Suspense fallback={null}>
                <DateRangePicker
                  aria-label={text.customRange}
                  className="salmon-stock-chart-range"
                  min={isoDay(extent[0])}
                  max={isoDay(extent[1])}
                  value={{ start: isoDay(range[0]), end: isoDay(range[1]) }}
                  onValueChange={(v, d) => {
                    if (v) setRange([Date.UTC(v.start.year, v.start.month - 1, v.start.day), Math.min(extent[1], Date.UTC(v.end.year, v.end.month - 1, v.end.day) + DAY_MS - 1)], { source: d.source, reason: 'customRange' });
                  }}
                />
              </Suspense>
            </ToolbarItem>
          ) : null}
          {tb && seriesTypes.length ? <MenuButton size="sm" variant="ghost" items={seriesTypes.map((t) => ({ id: t, label: t === seriesType ? `✓ ${t}` : t }))} onAction={(e) => setSeriesType(e.id as StockSeriesType, src(e))}>{text.seriesType}</MenuButton> : null}
          {tb && indicatorKinds.length ? <MenuButton size="sm" variant="ghost" items={indicatorKinds.map((k) => ({ id: k, label: `${indicators.includes(k) ? '✓ ' : ''}${INDICATOR_LABEL[k]}` }))} onAction={(e) => setIndicators(toggle(indicators, e.id as IndicatorKind), src(e))}>{text.indicators}</MenuButton> : null}
          {tb && trendKinds.length ? <MenuButton size="sm" variant="ghost" items={trendKinds.map((k) => ({ id: k, label: `${trendlines.includes(k) ? '✓ ' : ''}${k}` }))} onAction={(e) => setTrendlines(toggle(trendlines, e.id as TrendlineKind), src(e))}>{text.trendlines}</MenuButton> : null}
          {tb && exportFormats.length ? <MenuButton size="sm" variant="ghost" items={exportFormats.map((f) => ({ id: f, label: f.toUpperCase() }))} onAction={(e) => { const f = e.id as StockExportFormat; void (f === 'print' ? chartRef.current?.print() : chartRef.current?.export({ format: f })); }}>{text.export}</MenuButton> : null}
        </Toolbar>
      ) : null}
      <Chart
        legend={false}
        crosshair={{ snap: true }}
        tooltip={{ mode: 'shared' }}
        {...chartRest}
        ref={(api: ChartApi | null) => {
          chartRef.current = api;
          const r = props.ref;
          if (typeof r === 'function') r(api);
          else if (r) (r as { current: ChartApi | null }).current = api;
        }}
        series={series}
        axes={axes}
        annotations={annotations}
        xAxis={{ scale: 'time', ...props.xAxis }}
        yAxis={{ includeZero: false, position: 'end', ...props.yAxis }}
        zoomRange={view ? { x: view } : NO_ZOOM}
        onZoomRangeChange={(z, e) => {
          const x = z.x;
          setRange(x ? [x[0], x[1]] : [extent[0], extent[1]], e);
        }}
      />
      {props.navigator !== false ? (
        <RangeSelector
          data={props.data}
          xField={props.xField}
          yField={props.closeField}
          scale="time"
          timeZone={props.timeZone}
          locale={props.locale}
          {...navigatorProps}
          value={range}
          onValueCommit={(v, e) => setRange(v, e)}
        />
      ) : null}
      {periodBottom ? periodBar : null}
      {props.events?.length ? (
        <ul className="salmon-visually-hidden" aria-label={text.events}>
          {props.events.map((e, i) => (
            <li key={i}>{`${new Date(toTime(e.date)).toISOString().slice(0, 10)}: ${e.label}${e.description ? `. ${e.description}` : ''}`}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
