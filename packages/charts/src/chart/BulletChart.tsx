'use client';

// `BulletChart`, the `@salmonui/charts/chart/bullet` subpath: a
// preset over `Chart` with one `bullet` series, imported through the public
// `@salmonui/charts/chart` entry so the bullet code never weighs on `/chart`.
// Each item is a feature bar (or dot) against qualitative bands and one or
// more targets; the value axis carries the bands, the category axis the
// item labels. Everything else (tooltip, keyboard, table, export) is the
// `Chart` machinery; the point text (live region, tooltip, table) names the
// value, the targets and the band, and the optional legend lists
// the value, the targets and the bands.

import type { ReactNode } from 'react';
import { useLocale, useLocaleText } from '@salmonui/core/internal/locale';
import { Chart, type ChartApi, type ChartDatum, type ChartFormat, type ChartProps, type ChartText } from '@salmonui/charts/chart';
import { readField } from '../internal/viz/fields.js';
import { makeNumberFormat } from '../internal/viz/format.js';

export interface BulletBand {
  readonly to: number;
  /** Data color; default: neutral tones from the theme. */
  readonly color?: string | undefined;
  readonly label?: string | undefined;
}

export interface BulletLegendOptions {
  /** Before or after the figure (default `'bottom'`). */
  readonly position?: 'top' | 'bottom' | undefined;
  /** Accessible name of the legend list (default `text.legend`). */
  readonly title?: string | undefined;
}

/** BulletChart words on top of `ChartText` (the point text and the legend). */
export interface BulletChartText extends ChartText {
  readonly target: string;
  readonly band: string;
}

export interface BulletChartProps extends Pick<ChartProps, 'title' | 'subtitle' | 'description' | 'locale' | 'timeZone' | 'width' | 'height' | 'className' | 'style' | 'accessibleTable' | 'showDataTable' | 'animated' | 'onPointClick' | 'exportWriters'> {
  readonly data: readonly ChartDatum[];
  readonly valueField: string;
  readonly targetField?: string | readonly string[] | undefined;
  readonly categoryField?: string | undefined;
  readonly bands?: readonly BulletBand[] | undefined;
  readonly targetShapes?: readonly ('line' | 'circle' | 'cross')[] | undefined;
  /** Feature glyph: a bar from zero, or a dot at the value. */
  readonly valueShape?: 'bar' | 'dot' | undefined;
  readonly orientation?: 'horizontal' | 'vertical' | undefined;
  readonly axisPosition?: 'start' | 'end' | undefined;
  readonly min?: number | undefined;
  readonly max?: number | undefined;
  readonly interval?: number | undefined;
  readonly minorTicks?: number | undefined;
  readonly format?: ChartFormat | undefined;
  readonly labelPosition?: 'inside' | 'outside' | undefined;
  /** Tick marks inside or outside the plot; default follows `labelPosition`. */
  readonly tickPosition?: 'inside' | 'outside' | undefined;
  readonly labels?: boolean | { readonly format?: ChartFormat | undefined } | undefined;
  readonly tooltip?: ChartProps['tooltip'];
  /** Legend of the value, the targets and the bands. Default off. */
  readonly legend?: boolean | BulletLegendOptions | undefined;
  readonly valueColor?: string | undefined;
  readonly targetColor?: string | undefined;
  readonly name?: string | undefined;
  readonly onItemClick?: ChartProps['onPointClick'];
  readonly text?: Partial<BulletChartText> | undefined;
  readonly ref?: ChartProps['ref'];
}

const NEUTRAL_BANDS = ['var(--salmon-border-default)', 'var(--salmon-border-subtle)', 'var(--salmon-surface-sunken)'];
const TEXT_FIELD = '__salmonBulletText';

const glyph = (shape: 'bar' | 'dot' | 'band' | 'line' | 'circle' | 'cross', color: string): ReactNode => (
  <svg className="salmon-chart-bullet-legend-glyph" width="16" height="12" viewBox="0 0 16 12" aria-hidden="true">
    {shape === 'band' || shape === 'bar' ? (
      <rect x={shape === 'bar' ? 0 : 1} y={shape === 'bar' ? 3 : 1} width={shape === 'bar' ? 16 : 14} height={shape === 'bar' ? 6 : 10} fill={color} />
    ) : shape === 'dot' || shape === 'circle' ? (
      <circle cx="8" cy="6" r="4" fill={color} />
    ) : shape === 'cross' ? (
      <path d="M4,2L12,10M12,2L4,10" stroke={color} strokeWidth="2.5" />
    ) : (
      <path d="M8,0V12" stroke={color} strokeWidth="3" />
    )}
  </svg>
);

export function BulletChart(props: BulletChartProps): ReactNode {
  const text = useLocaleText('bulletChart', props.text);
  const locale = useLocale(props.locale);
  const horizontal = (props.orientation ?? 'horizontal') === 'horizontal';
  const bands = props.bands ?? [];
  const targets = props.targetField === undefined ? [] : typeof props.targetField === 'string' ? [props.targetField] : props.targetField;
  const words = { target: text?.target ?? 'Target', band: text?.band ?? 'Band', legend: text?.legend ?? 'Legend' };
  const bandName = (i: number): string => bands[i]?.label ?? `${words.band} ${i + 1}`;
  const targetName = (k: number): string => (targets.length > 1 ? `${words.target} ${k + 1}` : words.target);
  let from = props.min ?? 0;
  const axisBands = bands.map((b, i) => {
    const band = { from, to: b.to, color: b.color ?? (NEUTRAL_BANDS[Math.min(i, NEUTRAL_BANDS.length - 1)] as string), label: b.label, layer: 'behind' as const };
    from = b.to;
    return band;
  });
  // Point text: value, targets and the band the value falls in, read by
  // the live region, the tooltip and the accessible table through `tooltipField`.
  // Computed per render (pure; bullet data is a handful of items).
  const fmt = makeNumberFormat(props.format, { locale, timeZone: props.timeZone }, 0);
  const rows = props.data.map((d) => {
    const v = Number(readField(d, props.valueField));
    if (!Number.isFinite(v)) return d;
    const parts = [fmt(v)];
    targets.forEach((t, k) => {
      const tv = Number(readField(d, t));
      if (Number.isFinite(tv)) parts.push(`${targetName(k)} ${fmt(tv)}`);
    });
    const b = bands.findIndex((x) => v <= x.to);
    if (b >= 0) parts.push(bandName(b));
    return { ...d, [TEXT_FIELD]: parts.join(', ') };
  });
  const valueColor = props.valueColor ?? 'var(--salmon-text-primary)';
  const targetColor = props.targetColor ?? 'var(--salmon-text-secondary)';
  const chartProps: ChartProps = {
    title: props.title,
    subtitle: props.subtitle,
    description: props.description,
    locale,
    timeZone: props.timeZone,
    width: props.width,
    height: props.height ?? Math.max(120, 56 + props.data.length * (horizontal ? 36 : 0) + (horizontal ? 0 : 200)),
    className: props.className ? `salmon-bullet-chart ${props.className}` : 'salmon-bullet-chart',
    style: props.style,
    accessibleTable: props.accessibleTable,
    showDataTable: props.showDataTable,
    animated: props.animated,
    exportWriters: props.exportWriters,
    text,
    data: rows,
    orientation: horizontal ? 'horizontal' : 'vertical',
    legend: false,
    tooltip: props.tooltip ?? true,
    onPointClick: props.onItemClick ?? props.onPointClick,
    ref: props.ref as ((api: ChartApi | null) => void) | undefined,
    xAxis: { scale: 'category', gridLines: false },
    yAxis: {
      min: props.min ?? 0,
      max: props.max ?? (bands.length ? (bands[bands.length - 1] as BulletBand).to : undefined),
      interval: props.interval,
      minorTicks: props.minorTicks,
      format: props.format,
      labelPosition: props.labelPosition,
      tickPosition: props.tickPosition,
      position: props.axisPosition,
      gridLines: false,
      padding: 'none',
      includeZero: true,
      bands: axisBands,
    },
    series: [
      {
        id: 'value',
        type: 'bullet',
        name: props.name ?? props.valueField,
        xField: props.categoryField,
        yField: props.valueField,
        tooltipField: TEXT_FIELD,
        targetField: props.targetField,
        targetShapes: props.targetShapes,
        targetColor: props.targetColor,
        color: valueColor,
        valueShape: props.valueShape,
        bandWidth: props.valueShape === 'dot' ? 0.3 : 0.4,
        labels: props.labels ? { position: 'outside', format: typeof props.labels === 'object' ? props.labels.format : undefined } : false,
      },
    ],
  };
  const chart = <Chart {...chartProps} />;
  if (!props.legend) return chart;
  const opt = typeof props.legend === 'object' ? props.legend : {};
  const legend = (
    <ul className="salmon-chart-bullet-legend" aria-label={opt.title ?? words.legend}>
      <li>
        {glyph(props.valueShape === 'dot' ? 'dot' : 'bar', valueColor)}
        {props.name ?? props.valueField}
      </li>
      {targets.map((t, k) => (
        <li key={`t-${t}`}>
          {glyph(props.targetShapes?.[k] ?? 'line', targetColor)}
          {targetName(k)}
        </li>
      ))}
      {axisBands.map((b, i) => (
        <li key={`b-${i}`}>
          {glyph('band', b.color)}
          {bandName(i)}
        </li>
      ))}
    </ul>
  );
  return opt.position === 'top' ? (
    <>
      {legend}
      {chart}
    </>
  ) : (
    <>
      {chart}
      {legend}
    </>
  );
}
