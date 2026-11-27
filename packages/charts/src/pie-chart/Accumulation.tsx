// Shared accumulation figure: data reading, colors,
// the legend toolbar bound to `hiddenPoints`, selection, hover highlight,
// the store-driven tooltip, the one-tab-stop keyboard model with live
// announcements, annotations, the accessible table and the instance. The
// PieChart and FunnelChart wrappers supply the geometry.

import { useId, type KeyboardEvent, type MouseEvent, type PointerEvent, type ReactNode } from 'react';
import { fillEmpty, layoutFrame, n2, numberFormatter, readField, seriesColor, tableModel, toNumber, type FrameLayout, type Rect } from '#viz';
import { useControllableState } from '@salmonui/core/internal/controllable';
import { useLocale } from '@salmonui/core/internal/locale';
import { VizFigure } from '../internal/viz/figure.js';
import { changeEvent, FrameTitles, pointerSource, surfaceStyle, toDrawing, toggleIn, useFrame, useVizInstance, type Frame, type VizChangeSource } from '../internal/viz/frame.js';
import { LegendButtons, LegendSvg, type VizLegendItem } from '../internal/viz/legend.js';
import { useVizSelector } from '../internal/viz/store.js';
import { VizTooltip } from '../internal/viz/tooltip.js';
import type { AccumulationBaseProps, AccumulationPoint, AccumulationPointRef, AccumulationSeries } from './types.js';

export interface AccItem {
  readonly index: number;
  readonly label: string;
  readonly value: number;
  readonly datum: unknown;
  readonly color: string;
}

export interface AccRing {
  readonly name: string;
  readonly items: readonly AccItem[];
}

export interface AccMark {
  readonly point: AccumulationPoint;
  readonly d: string;
  /** Explode translation. */
  readonly dx: number;
  readonly dy: number;
  /** Tooltip anchor (drawing px). */
  readonly ax: number;
  readonly ay: number;
}

export interface AccLabel {
  readonly key: string;
  readonly x: number;
  readonly y: number;
  readonly anchor: 'start' | 'middle' | 'end';
  readonly text: string;
  readonly inside: boolean;
  readonly connector: string | null;
}

export interface AccGeometry {
  readonly marks: readonly AccMark[];
  readonly labels: readonly AccLabel[];
  /** Index into `marks` at a drawing point, or -1. */
  readonly hit: (x: number, y: number) => number;
  /** HTML overlay inside the surface (center label). */
  readonly overlay?: ReactNode;
  /** Decorative SVG under the marks (trapezoidal funnel connectors). */
  readonly decor?: ReactNode;
}

export interface GeometryInput {
  readonly rings: readonly AccRing[];
  readonly hidden: ReadonlySet<number>;
  readonly plot: Rect;
  readonly frame: FrameLayout;
  readonly format: (v: number) => string;
  readonly labelOf: (p: AccumulationPoint) => string;
  readonly active: number;
}

export interface AccumulationFigureProps {
  readonly base: AccumulationBaseProps;
  readonly series?: readonly AccumulationSeries[] | undefined;
  /** Root class (`salmon-pie-chart`). */
  readonly family: string;
  /** Localized kind and point noun for the summary and roledescription. */
  readonly kind: string;
  readonly noun: string;
  /** Legend name without `legend.title`. */
  readonly legend: string;
  readonly small?: boolean | undefined;
  /** Rewrites the read rings (small-slice grouping). */
  readonly prepare?: ((rings: AccRing[]) => AccRing[]) | undefined;
  readonly geometry: (input: GeometryInput, frame: Frame) => AccGeometry;
  /** Extra action on click / Enter (explode toggle). */
  readonly onActivate?: ((ref: AccumulationPointRef, source: VizChangeSource) => void) | undefined;
  /** Labels on by default. */
  readonly labels: boolean;
}

/** System fill patterns, one per slot: two diagonals, horizontal, vertical, dots, cross-hatch. */
const PATTERNS = ['M0,0V6', 'M0,0V6', 'M0,3H6', 'M3,0V6', 'M2,2h2v2h-2Z', 'M0,3H6M3,0V6'];
const sameRef = (a: AccumulationPointRef, b: AccumulationPointRef) => a.series === b.series && a.index === b.index;
const EMPTY: readonly never[] = [];

function readRings(base: AccumulationBaseProps, series: readonly AccumulationSeries[] | undefined): AccRing[] {
  const list: readonly AccumulationSeries[] = series && series.length ? series : [{ data: base.data, valueField: base.valueField, labelField: base.labelField }];
  return list.map((s, r) => {
    const data = s.data ?? base.data ?? [];
    const vf = s.valueField ?? base.valueField ?? 'value';
    const lf = s.labelField ?? base.labelField;
    const values = fillEmpty(data.map((d) => (typeof d === 'number' ? d : toNumber(readField(d, vf)))), base.emptyPoints ?? 'drop');
    const items = data.map((d, i) => {
      const own = base.colorField ? readField(d, base.colorField) : undefined;
      return {
        index: i,
        label: lf ? String(readField(d, lf) ?? '') : String(i + 1),
        value: values[i] as number,
        datum: d,
        color: typeof own === 'string' ? own : seriesColor(i, base.palette),
      };
    });
    return { name: s.name ?? `Series ${r + 1}`, items };
  });
}

export function AccumulationFigure(props: AccumulationFigureProps): ReactNode {
  const { base, small } = props;
  const locale = useLocale(base.locale);
  const idBase = useId();
  const frame = useFrame({ ...base, nominalHeight: small ? 120 : undefined });
  const { store, size } = frame;
  const [hiddenList, setHidden] = useControllableState(base.hiddenPoints, base.defaultHiddenPoints ?? EMPTY, base.onHiddenPointsChange, 'hiddenPoints');
  const [selected, setSelected] = useControllableState(base.selectedPoints, base.defaultSelectedPoints ?? EMPTY, base.onSelectedPointsChange, 'selectedPoints');
  const hover = useVizSelector(store, (s) => s.hover);
  const focus = useVizSelector(store, (s) => s.focus);
  const legendHover = useVizSelector(store, (s) => s.legendHover);
  const tip = useVizSelector(store, (s) => s.tip);

  const format = typeof base.format === 'function' ? base.format : numberFormatter(locale, 1, base.format ?? { maximumFractionDigits: 2 });
  const pct = numberFormatter(locale, 1, { style: 'percent', maximumFractionDigits: 1 });
  let rings = readRings(base, props.series);
  if (props.prepare) rings = props.prepare(rings);
  if (base.getPointStyle) {
    rings = rings.map((ring, r) => ({
      ...ring,
      items: ring.items.map((it) => {
        const c = base.getPointStyle?.({ series: r, index: it.index, label: it.label, value: it.value, fraction: 0, color: it.color, datum: it.datum })?.color;
        return c ? { ...it, color: c } : it;
      }),
    }));
  }
  const hidden = new Set(hiddenList);
  const legendOn = !small && base.legend !== false;
  const legendOptions = typeof base.legend === 'object' ? base.legend : {};
  const outer = rings[rings.length - 1] ?? { name: '', items: [] };
  const legendItems: VizLegendItem[] = outer.items.map((it) => ({ id: String(it.index), label: it.label, color: it.color, shape: 'rectangle', hidden: hidden.has(it.index) }));
  const layout = layoutFrame({
    width: size.width,
    height: size.height,
    title: small ? undefined : base.title,
    subtitle: small ? undefined : base.subtitle,
    legend: legendOn && legendItems.length ? { position: legendOptions.position ?? 'bottom', items: legendItems, title: legendOptions.title } : null,
  });
  const labelOf = (p: AccumulationPoint) => (base.formatLabel ? base.formatLabel(p) : `${p.label}: ${format(p.value)}`);
  const active = hover >= 0 ? hover : focus;
  const geo = props.geometry({ rings, hidden, plot: layout.plot, frame: layout, format, labelOf, active }, frame);
  const marks = geo.marks;
  const highlight = base.highlight !== false;
  const isSelected = (p: AccumulationPoint) => selected.some((s) => s.series === p.series && s.index === p.index);
  const legendIndex = legendHover;
  const dimmed = (m: AccMark, i: number) => {
    if (!highlight) return false;
    if (legendIndex >= 0) return m.point.index !== legendIndex;
    if (active >= 0) return i !== active;
    if (selected.length) return !isSelected(m.point);
    return false;
  };
  const selection = base.selection;
  const multiple = typeof selection === 'object' ? selection.multiple !== false : true;
  const interactive = Boolean(base.tooltip !== false || selection || base.onPointClick || base.onPointHover || props.onActivate || highlight);

  const activate = (i: number, source: VizChangeSource) => {
    const m = marks[i];
    if (!m) return;
    const ev = changeEvent(source, source === 'keyboard' ? 'keyboard' : 'click');
    if (selection) setSelected(toggleIn(selected, { series: m.point.series, index: m.point.index }, sameRef, multiple), ev);
    props.onActivate?.({ series: m.point.series, index: m.point.index }, source);
    base.onPointClick?.(m.point, ev);
  };
  const setHover = (i: number, x: number, y: number) => {
    const prev = store.get().hover;
    if (prev === i) return;
    store.set({ hover: i, tip: i >= 0 ? { x, y } : null });
    base.onPointHover?.(marks[i]?.point ?? null);
  };
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const p = toDrawing(event, event.currentTarget, size.width, size.height);
    setHover(geo.hit(p.x, p.y), p.x, p.y);
  };
  const onClick = (event: MouseEvent<HTMLDivElement>) => {
    const p = toDrawing(event, event.currentTarget, size.width, size.height);
    const i = geo.hit(p.x, p.y);
    if (i >= 0) activate(i, pointerSource((event.nativeEvent as globalThis.PointerEvent).pointerType));
  };
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const n = marks.length;
    if (!n) return;
    const cur = store.get().focus;
    let next = cur;
    switch (event.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        next = cur < 0 ? 0 : (cur + 1) % n;
        break;
      case 'ArrowLeft':
      case 'ArrowUp':
        next = cur < 0 ? n - 1 : (cur - 1 + n) % n;
        break;
      case 'Home':
        next = 0;
        break;
      case 'End':
        next = n - 1;
        break;
      case 'PageDown':
      case 'PageUp': {
        // Next / previous ring at the same category.
        const m = marks[Math.max(0, cur)] as AccMark;
        const ring = m.point.series + (event.key === 'PageDown' ? 1 : -1);
        const j = marks.findIndex((x) => x.point.series === ring && x.point.index >= m.point.index);
        const k = j >= 0 ? j : marks.findIndex((x) => x.point.series === ring);
        if (k < 0) return;
        next = k;
        break;
      }
      case 'Enter':
      case ' ':
        if (cur >= 0) activate(cur, 'keyboard');
        event.preventDefault();
        return;
      case 'Escape':
        if (store.get().tip) {
          store.set({ tip: null });
          event.preventDefault();
        }
        return;
      default:
        return;
    }
    event.preventDefault();
    const m = marks[next] as AccMark;
    store.set({ focus: next, tip: { x: m.ax, y: m.ay } });
  };

  const total = (ring: number) => (rings[ring]?.items ?? []).reduce((s, it) => s + (hidden.has(it.index) || !(it.value > 0) ? 0 : it.value), 0);
  const describe = (p: AccumulationPoint) => `${p.label}: ${format(p.value)}, ${pct(p.fraction)}`;
  const visibleCount = outer.items.filter((it) => it.value > 0 && !hidden.has(it.index)).length;
  const summary =
    base.description ??
    (visibleCount === 0
      ? `${props.kind}. No data.`
      : `${props.kind}, ${visibleCount} ${props.noun}${rings.length > 1 ? `, ${rings.length} series` : ''}. ` +
        marks
          .filter((m) => m.point.series === rings.length - 1)
          .slice(0, 10)
          .map((m) => describe(m.point))
          .join('; ') +
        '.');
  const multi = rings.length > 1;
  const allItems = rings.flatMap((ring, r) => ring.items.map((it) => ({ ring: r, it })));
  const table = tableModel(
    base.title ?? props.kind,
    multi ? ['Label', 'Series', 'Value', 'Percent'] : ['Label', 'Value', 'Percent'],
    allItems.length,
    (row, col) => {
      const { ring, it } = allItems[row] as { ring: number; it: AccItem };
      const t = total(ring);
      const cells = [it.label, ...(multi ? [rings[ring]?.name ?? ''] : []), Number.isFinite(it.value) ? format(it.value) : 'No value', hidden.has(it.index) || !(it.value > 0) || !t ? '' : pct(it.value / t)];
      return cells[col] ?? '';
    },
  );
  useVizInstance(base.ref, frame, {
    name: props.family.replace('salmon-', ''),
    csv: () => ({ columns: table.columns, rows: table.rows }),
  });
  const focused = focus >= 0 ? marks[focus] : undefined;
  const tipMark = tip && active >= 0 ? marks[active] : undefined;
  const tooltipOpts = typeof base.tooltip === 'object' ? base.tooltip : {};
  const showTip = !small || base.tooltip !== undefined ? base.tooltip !== false : true;

  return (
    <VizFigure
      family={props.family}
      className={base.className}
      style={base.style}
      rootRef={frame.rootRef}
      surfaceRef={frame.surfaceRef}
      surfaceStyle={surfaceStyle(base.width, base.height)}
      idBase={idBase}
      title={base.title}
      subtitle={base.subtitle}
      summary={summary}
      table={base.accessibleTable === false ? null : table}
      showTable={base.showDataTable}
      announcement={focused ? describe(focused.point) : null}
      extra={base.id ? { id: base.id, 'data-size': small ? 'small' : undefined } : small ? { 'data-size': 'small' } : undefined}
    >
      <svg viewBox={`0 0 ${size.width} ${size.height}`} width={size.width} height={size.height} aria-hidden="true" focusable="false">
        <FrameTitles frame={layout} />
        {base.patterns ? (
          <defs>
            {PATTERNS.map((d, k) => (
              <pattern key={k} id={`${idBase}-pat${k}`} patternUnits="userSpaceOnUse" width={6} height={6} patternTransform={k < 2 ? `rotate(${k ? -45 : 45})` : undefined}>
                <path d={d} className="salmon-accumulation-pattern-ink" />
              </pattern>
            ))}
          </defs>
        ) : null}
        <g className="salmon-viz-marks">
          {geo.decor}
          {marks.map((m, i) => (
            <path
              key={`${m.point.series}-${m.point.index}`}
              className="salmon-viz-mark salmon-accumulation-point"
              d={m.d}
              transform={m.dx || m.dy ? `translate(${n2(m.dx)},${n2(m.dy)})` : undefined}
              style={{ fill: m.point.color }}
              data-series={m.point.series}
              data-index={m.point.index}
              data-selected={isSelected(m.point) ? '' : undefined}
              data-dimmed={dimmed(m, i) ? '' : undefined}
            />
          ))}
          {base.patterns
            ? marks.map((m) => (
                <path key={`p${m.point.series}-${m.point.index}`} className="salmon-accumulation-pattern" d={m.d} transform={m.dx || m.dy ? `translate(${n2(m.dx)},${n2(m.dy)})` : undefined} fill={`url(#${idBase}-pat${m.point.index % PATTERNS.length})`} />
              ))
            : null}
          {focused ? <path className="salmon-viz-focus-mark" d={focused.d} transform={focused.dx || focused.dy ? `translate(${n2(focused.dx)},${n2(focused.dy)})` : undefined} /> : null}
        </g>
        {props.labels && !small ? (
          <g className="salmon-accumulation-labels">
            {geo.labels.map((l) => (
              <g key={l.key} data-inside={l.inside ? '' : undefined}>
                {l.connector ? <path className="salmon-accumulation-connector" d={l.connector} /> : null}
                <text x={n2(l.x)} y={n2(l.y)} textAnchor={l.anchor} dominantBaseline="middle" className={l.inside ? 'salmon-accumulation-label salmon-accumulation-label-inside' : 'salmon-accumulation-label'}>
                  {l.text}
                </text>
              </g>
            ))}
          </g>
        ) : null}
        {visibleCount === 0 ? (
          <text className="salmon-viz-empty" x={n2(layout.plot.x + layout.plot.width / 2)} y={n2(layout.plot.y + layout.plot.height / 2)} textAnchor="middle">
            No data
          </text>
        ) : null}
        {layout.legend ? <LegendSvg layout={layout.legend} items={legendItems} page={0} /> : null}
      </svg>
      {visibleCount === 0 && base.renderEmpty ? <div className="salmon-accumulation-empty">{base.renderEmpty()}</div> : null}
      {geo.overlay}
      {base.annotations?.map((a, i) => (
        <div key={i} className="salmon-viz-annotation" style={{ left: place(a.x, size.width), top: place(a.y, size.height) }}>
          {a.content}
        </div>
      ))}
      {interactive ? (
        <div
          className="salmon-viz-plot"
          style={{ inset: 0 }}
          tabIndex={0}
          role="group"
          aria-roledescription={props.kind.toLowerCase()}
          aria-label={base.title ?? props.kind}
          onPointerMove={onPointerMove}
          onPointerLeave={() => setHover(-1, 0, 0)}
          onClick={onClick}
          onKeyDown={onKeyDown}
          onBlur={() => store.set({ focus: -1, tip: null })}
        />
      ) : null}
      {layout.legend ? (
        <LegendButtons
          layout={layout.legend}
          items={legendItems}
          width={size.width}
          height={size.height}
          page={0}
          label={legendOptions.title ?? props.legend}
          toggle={legendOptions.toggle !== false}
          onToggle={legendOptions.toggle === false ? undefined : (id, event) => setHidden(toggleIn(hiddenList, Number(id)), changeEvent(event.type === 'click' && (event as MouseEvent).detail === 0 ? 'keyboard' : 'pointer', 'legend'))}
          onHighlight={(id) => store.set({ legendHover: id === null ? -1 : Number(id) })}
        />
      ) : null}
      {showTip && tipMark ? (
        <VizTooltip x={tip ? tip.x : tipMark.ax} y={tip ? tip.y : tipMark.ay} width={size.width} height={size.height} id={`${idBase}-tip`}>
          {tooltipOpts.render ? (
            tooltipOpts.render(tipMark.point)
          ) : tooltipOpts.format ? (
            tooltipOpts.format(tipMark.point)
          ) : (
            <div className="salmon-viz-tooltip-row">
              <span className="salmon-viz-tooltip-swatch" style={{ background: tipMark.point.color }} />
              <span>{tipMark.point.label}</span>
              <span className="salmon-viz-tooltip-value">
                {format(tipMark.point.value)} ({pct(tipMark.point.fraction)})
              </span>
            </div>
          )}
        </VizTooltip>
      ) : null}
    </VizFigure>
  );
}

/** Annotation / overlay position: px or a percent string, as a percent of the drawing (it scales with the SVG). */
export function place(v: number | string, total: number): string {
  if (typeof v === 'string' && v.trim().endsWith('%')) return v.trim();
  const n = typeof v === 'number' ? v : Number.parseFloat(v);
  return `${Math.round((n / (total || 1)) * 10000) / 100}%`;
}

/** Resolves a px or percent size against `of`. */
export function sizeOf(v: number | string | undefined, of: number, fallback: number): number {
  if (v === undefined) return fallback;
  if (typeof v === 'number') return v;
  const n = Number.parseFloat(v);
  return v.trim().endsWith('%') ? (n / 100) * of : n;
}
