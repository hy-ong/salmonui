'use client';

// `<Gauge>`: circular and linear gauges
// with one data model. Final markup on the server (fixed drawing size, a
// `viewBox` scales it), one `<figure>` with the accessible table, a
// `role="meter"` per read-only pointer and an APG Slider per draggable
// pointer. The drag preview and the hover target live in the per-instance
// store, never in React state.

import { lazy, Suspense, useEffect, useId, useImperativeHandle, useRef, type CSSProperties, type HTMLAttributes, type KeyboardEvent, type PointerEvent, type ReactNode, type Ref } from 'react';
import { layoutLegend, layoutTitles, numberFormatter, pct, tableModel, type LegendLayout } from '#viz';
import { useControllableState } from '@salmonui/core/internal/controllable';
import { useLocale, useLocaleText } from '@salmonui/core/internal/locale';
import { warnLowContrastDataColors } from '../internal/data-colors.js';
import { childProps } from '../internal/viz/children.js';
import { VizFigure } from '../internal/viz/figure.js';
import { FrameTitles } from '../internal/viz/frame.js';
import { LegendButtons, LegendSvg, type VizLegendItem } from '../internal/viz/legend.js';
import { useVizSelector, useVizStore } from '../internal/viz/store.js';
import { snap, stepOf, valueAtPoint } from './drag.js';
import {
  axisRange, GaugeAxis, GaugePointer, layoutGauge, rangeId,
  type GaugeContainer, type GaugeLayoutInput, type GaugeShape, type PointerMark,
} from './layout.js';

// Read inline (not internal/dev.ts `DEV`): bundlers replace it textually, so the branch folds away in production
// builds even when dev.ts lands in a chunk shared with lazy chunks (an imported binding does not fold).
declare const process: { readonly env: { readonly NODE_ENV?: string } };

const GaugeTip = lazy(() => import('./tooltip.js'));

export type GaugeChangeSource = 'pointer' | 'keyboard' | 'touch' | 'api';

/** Frozen change event. */
export interface GaugeChangeEvent {
  readonly source: GaugeChangeSource;
  readonly reason: 'drag' | 'keyboard' | 'release' | 'legend';
}

export interface GaugePointerValueChange {
  readonly pointerId: string;
  readonly value: number;
}

/** `onRangeChange` payload: the range with its moved end. */
export interface GaugeRangeChange {
  readonly rangeId: string;
  readonly from: number;
  readonly to: number;
}

export interface GaugeTooltipContext {
  readonly target: GaugeTooltipTarget;
  readonly id: string;
  readonly value?: number | undefined;
  readonly from?: number | undefined;
  readonly to?: number | undefined;
  readonly label: string;
}

export type GaugeTooltipTarget = 'pointer' | 'range' | 'annotation';

export interface GaugeLegendOptions {
  readonly position?: 'top' | 'bottom' | undefined;
  /** Clicking an item hides its range (default true). */
  readonly toggle?: boolean | undefined;
  readonly title?: string | undefined;
}

export interface GaugeExportOptions {
  readonly format?: 'png' | 'jpeg' | 'svg' | undefined;
  readonly fileName?: string | undefined;
  readonly scale?: number | undefined;
}

/** Instance reached through `ref`. */
export interface GaugeApi {
  readonly element: HTMLElement | null;
  export(options?: GaugeExportOptions): Promise<void>;
  toBlob(format?: 'png' | 'jpeg' | 'svg'): Promise<Blob>;
  toDataURL(format?: 'png' | 'jpeg' | 'svg'): Promise<string>;
  toSVGString(): string;
  print(): Promise<void>;
  /** Focuses the first slider thumb (draggable pointer or range end). */
  focus(): void;
}

/** DOM props passed to the `<figure>` root (pointer and mouse handlers, `data-*`, `aria-*`). */
type GaugeDomProps = Omit<HTMLAttributes<HTMLElement>, 'children' | 'className' | 'style' | 'title' | 'onChange' | 'defaultValue'>;

/** Built-in text of a Gauge (`text` prop; the `gauge` entry of a `LocaleProvider` catalog). */
export interface GaugeText {
  /** Name of the gauge and its meter when there is no `title`. Default `"Gauge"`. */
  readonly gauge: string;
  /** Name of pointer `n` (from 1) of a gauge with several unlabelled pointers. */
  readonly pointer: (gauge: string, n: number) => string;
  /** Legend name without `legend.title`. */
  readonly ranges: string;
}

export interface GaugeProps extends GaugeDomProps {
  readonly shape?: GaugeShape | undefined;
  /** Linear gauges: default `'horizontal'`. */
  readonly orientation?: 'horizontal' | 'vertical' | undefined;
  /** Linear gauges: the track drawn behind pointers (default `'normal'`). */
  readonly container?: GaugeContainer | undefined;
  /** Axes (default one axis 0 to 100); or `GaugeAxis` children, read when `axes` is absent. */
  readonly axes?: readonly GaugeAxis[] | undefined;
  /** Pointers; or `GaugePointer` children, read when `pointers` is absent. */
  readonly pointers?: readonly GaugePointer[] | undefined;
  /** `GaugeAxis` and `GaugePointer` elements (the JSX form of `axes` and `pointers`). */
  readonly children?: ReactNode;
  /** Drawing size in px; the SVG scales to its container through `viewBox`. */
  readonly width?: number | undefined;
  readonly height?: number | undefined;
  /** Circular center as fractions of the drawing (default `[0.5, 0.5]`). */
  readonly center?: readonly [number, number] | undefined;
  /** Gap between the axis line and inside ranges, in px (default 0). */
  readonly rangeGap?: number | undefined;
  readonly title?: string | undefined;
  readonly subtitle?: string | undefined;
  /** Replaces the automatic summary. */
  readonly description?: string | undefined;
  readonly locale?: string | undefined;
  /** Built-in text (over the nearest `LocaleProvider`'s `gauge` entry). */
  readonly text?: Partial<GaugeText> | undefined;
  /** Data colors for ranges without a color. */
  readonly palette?: readonly string[] | undefined;
  /** Range legend. */
  readonly legend?: boolean | GaugeLegendOptions | undefined;
  readonly hiddenRanges?: readonly string[] | undefined;
  readonly defaultHiddenRanges?: readonly string[] | undefined;
  readonly onHiddenRangesChange?: ((ids: readonly string[], event: GaugeChangeEvent) => void) | undefined;
  readonly tooltip?: boolean | { readonly targets?: readonly GaugeTooltipTarget[] | undefined; readonly render?: ((ctx: GaugeTooltipContext) => ReactNode) | undefined } | undefined;
  /** Called during a drag and per keyboard step with the proposed value. */
  readonly onPointerValueChange?: ((change: GaugePointerValueChange, event: GaugeChangeEvent) => void) | undefined;
  /** Called on release (and per keyboard step). */
  readonly onPointerValueCommit?: ((change: GaugePointerValueChange, event: GaugeChangeEvent) => void) | undefined;
  /** A draggable range end moved (drag frames, release, keyboard steps); ranges are reactive props, so apply it. */
  readonly onRangeChange?: ((change: GaugeRangeChange, event: GaugeChangeEvent) => void) | undefined;
  /** Pointer entrance and update transition after hydration (default true); off under `prefers-reduced-motion`. */
  readonly animated?: boolean | undefined;
  /** Shows the accessible data table under the gauge. */
  readonly showDataTable?: boolean | undefined;
  readonly className?: string | undefined;
  readonly style?: CSSProperties | undefined;
  readonly ref?: Ref<GaugeApi> | undefined;
}

interface GaugeState {
  /** Drag preview of a thumb: `p<index>` (pointer) or `<0|1><rangeId>` (range end). */
  readonly drag: { readonly key: string; readonly value: number } | null;
  readonly values: Readonly<Record<number, number>>;
  readonly hover: { readonly kind: GaugeTooltipTarget; readonly id: string } | null;
}

/** A slider thumb: a draggable pointer or one end of a draggable range. */
interface Thumb {
  readonly key: string;
  readonly axis: number;
  readonly value: number;
  readonly lo: number;
  readonly hi: number;
  readonly step: number;
  readonly label: string;
  readonly text: string;
  readonly x: number;
  readonly y: number;
  readonly hover?: string | undefined;
  readonly set: (value: number, event: GaugeChangeEvent, commit: boolean) => void;
}

const DEFAULT_AXES: readonly GaugeAxis[] = [{}];
const EMPTY: readonly string[] = [];
const freeze = (source: GaugeChangeSource, reason: GaugeChangeEvent['reason']): GaugeChangeEvent => Object.freeze({ source, reason });
/** Thumb steps per key; Home and End go to the bounds. */
const KEY_STEPS: Record<string, number> = { ArrowUp: 1, ArrowRight: 1, ArrowDown: -1, ArrowLeft: -1, PageUp: 10, PageDown: -10, Home: -1e9, End: 1e9 };
const r6 = (v: number) => Math.round(v * 1e6) / 1e6;


export function Gauge(props: GaugeProps): ReactNode {
  const locale = useLocale(props.locale);
  const text = { gauge: 'Gauge', pointer: (gauge: string, n: number) => `${gauge} pointer ${n}`, ranges: 'Ranges', ...useLocaleText('gauge', props.text) };
  // DOM props for the root: handlers, data-* and aria-* (component callbacks are not DOM props).
  const dom: Record<string, unknown> = {};
  for (const key in props) if (/^(id$|data-|aria-|on(?!PointerValue|HiddenRanges|RangeChange)[A-Z])/.test(key)) dom[key] = props[key as keyof GaugeProps];
  const shape = props.shape ?? 'circular';
  const orientation = props.orientation ?? 'horizontal';
  const width = props.width ?? (shape === 'circular' ? 240 : orientation === 'vertical' ? 120 : 360);
  const height = props.height ?? (shape === 'circular' ? 240 : orientation === 'vertical' ? 320 : 100);
  const childAxes = childProps<GaugeAxis>(props.children, GaugeAxis);
  const sourceAxes = props.axes?.length ? props.axes : childAxes.length ? childAxes : DEFAULT_AXES;
  const pointers = props.pointers ?? childProps<GaugePointer>(props.children, GaugePointer);
  const idBase = useId().replace(/:/g, '');
  const rootRef = useRef<HTMLElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const surfaceRef = useRef<HTMLDivElement | null>(null);
  const store = useVizStore<GaugeState>(() => ({ drag: null, values: {}, hover: null }));
  const drag = useVizSelector(store, (s) => s.drag);
  // A range end drag previews through the axes (store state, never React state).
  const rangeDrag = drag && drag.key[0] !== 'p' ? drag : null;
  const axes = rangeDrag
    ? sourceAxes.map((a, ai) => ({ ...a, ranges: a.ranges?.map((r, ri) => (rangeId(r, ai, ri) === rangeDrag.key.slice(1) ? { ...r, [rangeDrag.key[0] === '0' ? 'from' : 'to']: rangeDrag.value } : r)) }))
    : sourceAxes;
  const uncontrolled = useVizSelector(store, (s) => s.values);
  const hover = useVizSelector(store, (s) => s.hover);
  const [hiddenList, setHidden] = useControllableState<readonly string[], [GaugeChangeEvent]>(props.hiddenRanges, props.defaultHiddenRanges ?? EMPTY, props.onHiddenRangesChange, 'Gauge hiddenRanges');
  const hidden = new Set(hiddenList);
  const values = pointers.map((p, i) => {
    if (drag && drag.key === `p${i}`) return drag.value;
    if (p.value !== undefined) return p.value;
    const own = uncontrolled[i];
    if (own !== undefined) return own;
    return p.defaultValue ?? axisRange(axes[p.axis ?? 0] ?? {}).min;
  });
  const legendOpts = props.legend ? (props.legend === true ? {} : props.legend) : null;
  const allRanges = axes.flatMap((a) => a.ranges ?? []);
  let legendLayout: LegendLayout | undefined;
  let inset = 0;
  const fmt = numberFormatter(locale, 1, { maximumFractionDigits: 2 });
  if (legendOpts && allRanges.length) {
    const spec = { position: 'bottom' as const, items: allRanges.map((r) => ({ label: r.label ?? `${fmt(r.from)}–${fmt(r.to)}` })), title: legendOpts.title };
    const l = layoutLegend(spec, 'bottom', { width: width - 16, height: height / 3 });
    const x = 8 + (width - 16 - l.width) / 2;
    const y = height - l.height - 6;
    inset = l.height + 10;
    legendLayout = { ...l, position: 'bottom', x, y, items: l.items.map((it) => ({ ...it, x: x + it.x, y: y + it.y })), title: undefined };
  }
  // The title and subtitle are drawn above the gauge (the figcaption names the figure).
  const head = layoutTitles(width, props.title, props.subtitle);
  const input: GaugeLayoutInput = {
    shape, width, height, orientation, container: props.container ?? 'normal', center: props.center ?? [0.5, 0.5], rangeGap: props.rangeGap ?? 0,
    axes, pointers, values, hiddenRanges: hidden, locale, bottomInset: inset, topInset: head.top - 8, palette: props.palette,
  };
  const model = layoutGauge(input);
  const nameOf = (p: GaugePointer, i: number) => p.label ?? (pointers.length > 1 ? text.pointer(props.title ?? text.gauge, i + 1) : (props.title ?? props['aria-label'] ?? text.gauge));
  const textOf = (p: GaugePointer, v: number) => (p.valueText ? p.valueText(v) : fmt(v));
  const rangeItems: VizLegendItem[] = model.axes.flatMap((a) => a.ranges.map((r) => ({ id: r.id, label: r.label, color: r.color, shape: 'rectangle' as const, hidden: r.hidden })));
  const tooltipOpts = props.tooltip ? (props.tooltip === true ? {} : props.tooltip) : null;
  const targets = tooltipOpts?.targets ?? ['pointer', 'range'];
  const animated = props.animated !== false;
  // Values last drawn by the transition (null before the entrance); user changes skip it.
  const shown = useRef<readonly number[] | null>(null);
  const userChange = useRef(false);

  const emit = (i: number, value: number, event: GaugeChangeEvent, commit: boolean) => {
    const p = pointers[i];
    if (!p) return;
    const change = Object.freeze({ pointerId: p.id ?? `pointer${i}`, value });
    userChange.current = true;
    // The release only commits: the drag already proposed the value.
    if (event.reason !== 'release') props.onPointerValueChange?.(change, event);
    if (commit) {
      if (p.value === undefined) store.set((s) => ({ values: { ...s.values, [i]: value } }));
      props.onPointerValueCommit?.(change, event);
    }
  };

  // Slider thumbs: draggable pointers, then both ends of each draggable range (APG multi-thumb slider:
  // each end is bounded by the other).
  const thumbs: Thumb[] = [];
  for (const pm of model.pointers) {
    const p = pointers[pm.index]!;
    if (!p.draggable) continue;
    const axis = axes[pm.axis] ?? {};
    const { min, max } = axisRange(axis);
    thumbs.push({ key: `p${pm.index}`, axis: pm.axis, value: pm.value, lo: min, hi: max, step: stepOf(p, axis), label: nameOf(p, pm.index), text: textOf(p, pm.value), x: pm.hx, y: pm.hy, hover: pm.id, set: (v, e, commit) => emit(pm.index, v, e, commit) });
  }
  model.axes.forEach((a) => {
    const axis = axes[a.index]!;
    a.ranges.forEach((r, ri) => {
      const source = axis.ranges![ri]!;
      if (!source.draggable || r.hidden) return;
      const step = stepOf(source, axis);
      for (const end of [0, 1]) {
        const value = end ? r.to : r.from;
        thumbs.push({
          key: `${end}${r.id}`, axis: a.index, value, lo: end ? r.from : a.min, hi: end ? a.max : r.to, step,
          label: `${r.label} ${end ? 'end' : 'start'}`, text: fmt(value), x: r.ends[end * 2]!, y: r.ends[end * 2 + 1]!,
          set: (v, e) => props.onRangeChange?.(Object.freeze({ rangeId: r.id, from: end ? r.from : v, to: end ? v : r.to }), e),
        });
      }
    });
  });

  const sourceOf = (event: PointerEvent): GaugeChangeSource => (event.pointerType === 'touch' ? 'touch' : 'pointer');
  const onThumbPointerDown = (t: Thumb) => (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.focus();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    store.set({ drag: { key: t.key, value: t.value } });
  };
  const onThumbPointerMove = (t: Thumb) => (event: PointerEvent<HTMLDivElement>) => {
    const d = store.get().drag;
    if (!d || d.key !== t.key) return;
    const rect = surfaceRef.current!.getBoundingClientRect();
    const v = valueAtPoint(input, t.axis, t.step, t.lo, t.hi, ((event.clientX - rect.left) / (rect.width || width)) * width, ((event.clientY - rect.top) / (rect.height || height)) * height);
    if (v === d.value) return;
    store.set({ drag: { key: t.key, value: v } });
    t.set(v, freeze(sourceOf(event), 'drag'), false);
  };
  const onThumbPointerUp = (t: Thumb) => (event: PointerEvent<HTMLDivElement>) => {
    const d = store.get().drag;
    if (!d || d.key !== t.key) return;
    t.set(d.value, freeze(sourceOf(event), 'release'), true);
    store.set({ drag: null });
  };
  const onThumbKeyDown = (t: Thumb) => (event: KeyboardEvent<HTMLDivElement>) => {
    // Arrow keys follow the data direction, which never mirrors.
    const steps = KEY_STEPS[event.key];
    if (steps === undefined) return;
    event.preventDefault();
    const next = snap(steps === 1e9 ? t.hi : steps === -1e9 ? t.lo : t.value + steps * t.step, t.step, axisRange(axes[t.axis]!).min, t.lo, t.hi);
    if (next !== t.value) t.set(next, freeze('keyboard', 'keyboard'), true);
  };

  // the server and the hydration render draw the final values; the transition runs after
  // commit from a lazy chunk that writes path data per frame (never React state).
  const drawn = model.pointers.map((pm) => pm.value);
  useEffect(() => {
    const svg = svgRef.current;
    // the development-only data-color contrast check (range and pointer colors; dropped from production builds).
    if (process.env.NODE_ENV !== 'production') warnLowContrastDataColors(rootRef.current);
    const from = shown.current ?? model.pointers.map((pm) => axisRange(axes[pm.axis]!).min);
    if (!animated || !svg || userChange.current || store.get().drag || globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      userChange.current = false;
      shown.current = drawn;
      return;
    }
    let cancel = () => {};
    let live = true;
    void import('./animate.js').then((m) => {
      if (live) cancel = m.animatePointers(svg, input, from, layoutGauge, (v) => (shown.current = v));
    });
    return () => {
      live = false;
      cancel();
    };
  }, [drawn.join(), animated]);

  useImperativeHandle(props.ref, () => {
    const svg = () => svgRef.current;
    const io = () => import('../internal/viz/export.js');
    const blob = async (format: 'png' | 'jpeg' | 'svg' = 'png', scale?: number) => (await io()).toBlob(svg()!, { format, scale });
    return {
      get element() {
        return rootRef.current;
      },
      toBlob: blob,
      toDataURL: async (format) => (await io()).blobToDataURL(await blob(format)),
      toSVGString: () => (svg() ? new XMLSerializer().serializeToString(svg()!) : ''),
      async export(options = {}) {
        const format = options.format ?? 'png';
        (await io()).download(await blob(format, options.scale), options.fileName ?? `gauge.${format === 'jpeg' ? 'jpg' : format}`);
      },
      async print() {
        const m = await io();
        await m.printSvg(m.serializeSvg(svg()!), props.title ?? text.gauge);
      },
      focus() {
        rootRef.current?.querySelector<HTMLElement>('[role="slider"]')?.focus();
      },
    };
  });

  const { min: amin, max: amax } = axisRange(axes[0]!);
  const summary =
    props.description ??
    `${props.title ?? `${shape === 'circular' ? 'Circular' : 'Linear'} gauge`}, ${fmt(amin)} to ${fmt(amax)}.${pointers.length ? ` ${pointers.map((p, i) => `${p.label ?? (pointers.length > 1 ? `Pointer ${i + 1}` : 'Value')}: ${textOf(p, values[i]!)}`).join('; ')}.` : ''}`;
  const rows: string[][] = [
    ...pointers.map((p, i) => [p.label ?? `Pointer ${i + 1}`, textOf(p, values[i]!)]),
    ...model.axes.flatMap((a) => a.ranges.filter((r) => !r.hidden).map((r) => [`Range ${r.label}`, `${fmt(r.from)}–${fmt(r.to)}`])),
  ];
  const table = tableModel(props.title ?? 'Gauge values', ['Item', 'Value'], rows.length, (r, c) => rows[r]![c]!);

  const hoverOn = (kind: GaugeTooltipTarget, id: string) => (tooltipOpts && targets.includes(kind) ? () => store.set({ hover: { kind, id } }) : undefined);
  const hoverOff = tooltipOpts ? () => store.set({ hover: null }) : undefined;
  const renderPointer = (pm: PointerMark): ReactNode => {
    const p = pointers[pm.index]!;
    const custom = p.render ? (p.render({ value: pm.value, x: pm.hx, y: pm.hy }) as ReactNode) : null;
    return (
      <g key={pm.id} className="salmon-gauge-pointer" data-type={pm.type} data-dragging={drag?.key === `p${pm.index}` ? '' : undefined} onPointerEnter={hoverOn('pointer', pm.id)} onPointerLeave={hoverOff}>
        {pm.d ? <path d={pm.d} fill={pm.color} /> : null}
        {pm.text ? (
          <text x={pm.text.x} y={pm.text.y} textAnchor="middle" className="salmon-gauge-marker-text" fill={pm.color}>
            {pm.text.text}
          </text>
        ) : null}
        {pm.cap ? <circle cx={pm.cap.cx} cy={pm.cap.cy} r={pm.cap.r} fill={pm.color} /> : null}
        {custom}
      </g>
    );
  };

  return (
    <VizFigure
      family="salmon-gauge"
      className={props.className}
      style={props.style}
      rootRef={rootRef}
      surfaceRef={surfaceRef}
      surfaceStyle={{ aspectRatio: `${width} / ${height}`, maxInlineSize: width }}
      idBase={idBase}
      title={props.title}
      subtitle={props.subtitle}
      summary={summary}
      table={table}
      showTable={props.showDataTable}
      extra={{ ...dom, 'data-shape': shape, 'data-orientation': shape === 'linear' ? orientation : undefined }}
    >
      <svg ref={svgRef} viewBox={`0 0 ${width} ${height}`} width={width} height={height} aria-hidden="true" focusable="false">
        <FrameTitles frame={head} />
        {model.axes.map((a) => (
          <g key={a.index} className="salmon-gauge-axis">
            {a.container ? <path className="salmon-gauge-container" d={a.container} /> : null}
            {a.ranges.map((r) =>
              r.hidden ? null : <path key={r.id} className="salmon-gauge-range" d={r.d} fill={r.color} data-range={r.id} onPointerEnter={hoverOn('range', r.id)} onPointerLeave={hoverOff} />,
            )}
            {a.line ? <path className="salmon-gauge-line" d={a.line} /> : null}
            {a.ticks.length ? <path className="salmon-viz-tick salmon-gauge-ticks" d={a.ticks.filter((t) => !t.color && !t.minor).map((t) => t.d).join('')} /> : null}
            {a.ticks.some((t) => t.minor && !t.color) ? <path className="salmon-viz-tick salmon-gauge-minor-ticks" d={a.ticks.filter((t) => t.minor && !t.color).map((t) => t.d).join('')} /> : null}
            {a.ticks.filter((t) => t.color).map((t, i) => <path key={i} className="salmon-gauge-ticks" d={t.d} stroke={t.color} />)}
            {a.labels.map((l, i) => (
              <text key={i} x={l.x} y={l.y} textAnchor={l.anchor} transform={l.rotate ? `rotate(${l.rotate} ${l.x} ${l.y - 4})` : undefined}>
                {l.text}
              </text>
            ))}
          </g>
        ))}
        {model.pointers.map(renderPointer)}
        {legendLayout ? <LegendSvg layout={legendLayout} items={rangeItems} page={0} /> : null}
      </svg>
      {model.axes.flatMap((a) =>
        a.annotations.map((an) => (
          <div key={an.id} className="salmon-gauge-annotation" data-tip={tooltipOpts && targets.includes('annotation') ? '' : undefined} onPointerEnter={hoverOn('annotation', an.id)} onPointerLeave={hoverOff} style={{ left: pct(an.x, width), top: pct(an.y, height), transform: `translate(-50%, -50%)${an.rotate ? ` rotate(${an.rotate}deg)` : ''}` }}>
            {an.content as ReactNode}
          </div>
        )),
      )}
      {model.pointers.map((pm) => {
        const p = pointers[pm.index]!;
        const { min, max } = axisRange(axes[pm.axis] ?? {});
        return p.draggable ? null : <div key={pm.id} role="meter" className="salmon-visually-hidden" aria-label={nameOf(p, pm.index)} aria-valuemin={min} aria-valuemax={max} aria-valuenow={r6(pm.value)} aria-valuetext={textOf(p, pm.value)} />;
      })}
      {thumbs.map((t) => (
        <div
          key={t.key}
          role="slider"
          tabIndex={0}
          className="salmon-gauge-thumb"
          aria-label={t.label}
          aria-valuemin={t.lo}
          aria-valuemax={t.hi}
          aria-valuenow={r6(t.value)}
          aria-valuetext={t.text}
          aria-orientation={shape === 'linear' ? orientation : undefined}
          style={{ left: pct(t.x, width), top: pct(t.y, height) }}
          data-dragging={drag?.key === t.key ? '' : undefined}
          onPointerDown={onThumbPointerDown(t)}
          onPointerMove={onThumbPointerMove(t)}
          onPointerUp={onThumbPointerUp(t)}
          onPointerCancel={() => store.set({ drag: null })}
          onKeyDown={onThumbKeyDown(t)}
          onPointerEnter={t.hover ? hoverOn('pointer', t.hover) : undefined}
          onPointerLeave={hoverOff}
          onFocus={t.hover ? hoverOn('pointer', t.hover) : undefined}
          onBlur={hoverOff}
        />
      ))}
      {legendLayout ? (
        <LegendButtons
          layout={legendLayout}
          items={rangeItems}
          width={width}
          height={height}
          page={0}
          label={legendOpts?.title ?? text.ranges}
          toggle={legendOpts?.toggle !== false}
          onToggle={
            legendOpts?.toggle === false
              ? undefined
              : (id, event) => {
                  const next = hidden.has(id) ? hiddenList.filter((h) => h !== id) : [...hiddenList, id];
                  setHidden(next, freeze(event.type === 'keydown' || ('detail' in event && event.detail === 0) ? 'keyboard' : 'pointer', 'legend'));
                }
          }
        />
      ) : null}
      {tooltipOpts && hover ? (
        <Suspense fallback={null}>
          <GaugeTip model={model} hover={hover} render={tooltipOpts.render} name={(i) => nameOf(pointers[i]!, i)} text={(i, v) => textOf(pointers[i]!, v)} fmt={fmt} width={width} height={height} />
        </Suspense>
      ) : null}
    </VizFigure>
  );
}


