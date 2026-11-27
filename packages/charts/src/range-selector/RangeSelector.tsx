'use client';

// `RangeSelector`: APG Slider (Multi-Thumb) over a mini series.
// Two `role="slider"` thumbs plus the selected band (a third slider that
// moves both). Drag transients live in the store and are reported through
// `onValueChange` once per animation frame; `onValueCommit` (and the
// uncontrolled value) update on release. Arrow keys follow the visual
// direction of the data axis, which does not mirror in RTL.

import { useEffect, useId, useImperativeHandle, useMemo, useRef, type CSSProperties, type KeyboardEvent, type PointerEvent, type ReactNode, type Ref } from 'react';
import { n2, pct } from '#viz';
import { useFormReset } from '@salmonui/core/internal/form';
import { useControllableState } from '@salmonui/core/internal/controllable';
import { useLocale, useLocaleText } from '@salmonui/core/internal/locale';
import { useAnimateAttribute } from '../internal/viz/animate.js';
import { initialSize, useMeasuredSize } from '../internal/viz/size.js';
import { useVizSelector, useVizStore } from '../internal/viz/store.js';
import type { ChartDatum, ChartFormat } from '../chart/types.js';
import { clampRange, keyStep, rangeModel, snapValue, type RangeModelInput, type RangeSeries } from './model.js';
import { matchPeriod, periodRange, type Period } from './period.js';
import { PeriodSelector } from './PeriodSelector.js';

export type RangeValue = readonly [number, number];

export interface RangeChangeEvent {
  readonly source: 'pointer' | 'keyboard' | 'touch' | 'api';
  readonly reason: 'thumb' | 'band' | 'track' | 'keyboard' | 'period' | 'reset';
}

export interface RangeSelectorApi {
  readonly element: HTMLDivElement | null;
  focus(): void;
}

export interface RangeSelectorProps extends Omit<RangeModelInput, 'min' | 'max'> {
  readonly data?: readonly ChartDatum[] | undefined;
  readonly series?: readonly RangeSeries[] | undefined;
  readonly min?: number | Date | undefined;
  readonly max?: number | Date | undefined;
  readonly value?: RangeValue | undefined;
  readonly defaultValue?: RangeValue | undefined;
  /** During a drag, once per frame; also after keyboard and period changes. */
  readonly onValueChange?: ((value: RangeValue, event: RangeChangeEvent) => void) | undefined;
  /** On release (and after every keyboard step). */
  readonly onValueCommit?: ((value: RangeValue, event: RangeChangeEvent) => void) | undefined;
  readonly snap?: boolean | 'interval' | undefined;
  readonly tooltip?: boolean | 'always' | { readonly format?: ChartFormat | ((value: number) => string) } | undefined;
  readonly periods?: readonly Period[] | undefined;
  readonly periodSelector?: boolean | { readonly position?: 'top' | 'bottom' } | undefined;
  readonly gridLines?: boolean | undefined;
  readonly ticks?: boolean | undefined;
  readonly name?: string | undefined;
  readonly disabled?: boolean | undefined;
  readonly 'aria-label'?: string | undefined;
  readonly text?: Partial<{ readonly start: string; readonly end: string; readonly band: string; readonly range: (from: string, to: string) => string }> | undefined;
  readonly width?: number | undefined;
  /**
   * Drawing height in px. Without it the height comes from CSS: the
   * surface fills a root whose height CSS fixes, else 80 px.
   */
  readonly height?: number | undefined;
  /** Called after a measured size change. */
  readonly onResize?: ((size: { readonly width: number; readonly height: number }) => void) | undefined;
  /** Entrance and update transitions (`@salmonui/charts/viz-animations.css`); default true. */
  readonly animated?: boolean | undefined;
  readonly className?: string | undefined;
  readonly style?: CSSProperties | undefined;
  readonly ref?: Ref<RangeSelectorApi> | undefined;
}

interface RangeState {
  readonly width: number;
  readonly height: number;
  readonly live: RangeValue | null;
  readonly active: 'start' | 'end' | 'band' | null;
}


export function RangeSelector(props: RangeSelectorProps): ReactNode {
  const id = useId();
  const store = useVizStore<RangeState>(() => ({ ...initialSize(props, 80), live: null, active: null }));
  const rootRef = useRef<HTMLDivElement>(null);
  const surfaceRef = useRef<HTMLDivElement>(null);
  const startRef = useRef<HTMLDivElement>(null);
  useMeasuredSize(surfaceRef, store, props, props.onResize);
  useAnimateAttribute(rootRef, props.animated);
  const width = useVizSelector(store, (s) => s.width);
  const height = useVizSelector(store, (s) => s.height);
  const live = useVizSelector(store, (s) => s.live);
  const active = useVizSelector(store, (s) => s.active);
  const locale = useLocale(props.locale);
  const model = useMemo(
    () => rangeModel(props, width, height, locale),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [props.data, props.series, props.xField, props.yField, props.scale, props.min, props.max, props.interval, props.base, props.format, props.formatLabel, props.labelPosition, props.labelOverlap, props.groupLabels, locale, props.timeZone, width, height],
  );
  const initial: RangeValue = props.defaultValue ?? [model.domain[0], model.domain[1]];
  const [committed, setCommitted] = useControllableState<RangeValue, [RangeChangeEvent]>(props.value, initial, props.onValueCommit, 'RangeSelector value');
  const value = clampRange(model, live ?? committed);
  const text = { start: 'Start', end: 'End', band: 'Selected range', range: (a: string, b: string) => `${a} to ${b}`, ...useLocaleText('rangeSelector', props.text) };
  const tipFormat = typeof props.tooltip === 'object' ? props.tooltip.format : undefined;
  const fmt = typeof tipFormat === 'function' ? tipFormat : model.format;

  const latest = useRef({ model, value, props, committed });
  useEffect(() => {
    latest.current = { model, value, props, committed };
  });
  const frame = useRef(0);
  const pending = useRef<{ value: RangeValue; event: RangeChangeEvent } | null>(null);
  const emitChange = (v: RangeValue, event: RangeChangeEvent, immediate = false) => {
    const cb = latest.current.props.onValueChange;
    if (!cb) return;
    if (immediate || typeof requestAnimationFrame === 'undefined') {
      cb(v, Object.freeze(event));
      return;
    }
    pending.current = { value: v, event };
    if (frame.current) return;
    frame.current = requestAnimationFrame(() => {
      frame.current = 0;
      const p = pending.current;
      pending.current = null;
      if (p) latest.current.props.onValueChange?.(p.value, Object.freeze(p.event));
    });
  };
  useEffect(() => () => cancelAnimationFrame(frame.current), []);
  const commit = (v: RangeValue, event: RangeChangeEvent) => {
    const r = clampRange(latest.current.model, v);
    store.set({ live: null });
    if (frame.current) {
      cancelAnimationFrame(frame.current);
      frame.current = 0;
      pending.current = null;
    }
    emitChange(r, event, true);
    setCommitted(r, Object.freeze(event));
  };

  useFormReset(startRef, () => {
    if (props.value === undefined) setCommitted(initial, Object.freeze({ source: 'api', reason: 'reset' }));
  });

  const drag = useRef<{ part: 'start' | 'end' | 'band'; x: number; start: RangeValue } | null>(null);
  const toValue = (clientX: number): number => {
    const el = surfaceRef.current;
    if (!el) return 0;
    const r = el.getBoundingClientRect();
    const k = latest.current.model.width / (r.width || 1);
    return latest.current.model.scale.invert((clientX - r.left) * k);
  };
  const onPointerDown = (part: 'start' | 'end' | 'band' | 'track') => (event: PointerEvent<HTMLDivElement>) => {
    if (props.disabled || event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const m = latest.current.model;
    let v = latest.current.value;
    let p: 'start' | 'end' | 'band' = part === 'track' ? 'band' : part;
    if (part === 'track') {
      // A press outside the band centers the band on the pointer.
      const at = toValue(event.clientX);
      const span = v[1] - v[0];
      v = clampRange(m, [at - span / 2, at + span / 2]);
      if (v[1] - v[0] < span) v = v[0] === m.domain[0] ? [m.domain[0], m.domain[0] + span] : [m.domain[1] - span, m.domain[1]];
      store.set({ live: v });
      emitChange(v, { source: event.pointerType === 'touch' ? 'touch' : 'pointer', reason: 'track' });
      p = 'band';
    }
    (event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId);
    drag.current = { part: p, x: toValue(event.clientX), start: v };
    store.set({ active: p });
  };
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d) return;
    const m = latest.current.model;
    const at = toValue(event.clientX);
    let next: [number, number];
    if (d.part === 'band') {
      const span = d.start[1] - d.start[0];
      let a = d.start[0] + (at - d.x);
      a = Math.min(m.domain[1] - span, Math.max(m.domain[0], a));
      next = [a, a + span];
    } else if (d.part === 'start') next = [Math.min(at, d.start[1]), d.start[1]];
    else next = [d.start[0], Math.max(at, d.start[0])];
    const r = clampRange(m, next);
    store.set({ live: r });
    emitChange(r, { source: event.pointerType === 'touch' ? 'touch' : 'pointer', reason: d.part === 'band' ? 'band' : 'thumb' });
  };
  const onPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    drag.current = null;
    store.set({ active: null });
    if (!d) return;
    const m = latest.current.model;
    const cur = store.get().live ?? latest.current.value;
    const snapped: RangeValue = [snapValue(m, cur[0], props.snap, 'start', props.timeZone), snapValue(m, cur[1], props.snap, 'end', props.timeZone)];
    commit(snapped, { source: event.pointerType === 'touch' ? 'touch' : 'pointer', reason: d.part === 'band' ? 'band' : 'thumb' });
  };

  const onKeyDown = (part: 'start' | 'end' | 'band') => (event: KeyboardEvent<HTMLDivElement>) => {
    if (props.disabled) return;
    const m = latest.current.model;
    const [a, b] = latest.current.value;
    const step = keyStep(m, event.key === 'PageUp' || event.key === 'PageDown' || event.shiftKey);
    let delta = 0;
    if (event.key === 'ArrowRight' || event.key === 'ArrowUp' || event.key === 'PageUp') delta = step;
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowDown' || event.key === 'PageDown') delta = -step;
    let next: [number, number] | null = null;
    if (delta) {
      if (part === 'start') next = [Math.min(b, a + delta), b];
      else if (part === 'end') next = [a, Math.max(a, b + delta)];
      else {
        const span = b - a;
        const s = Math.min(m.domain[1] - span, Math.max(m.domain[0], a + delta));
        next = [s, s + span];
      }
    } else if (event.key === 'Home') next = part === 'start' ? [m.domain[0], b] : part === 'end' ? [a, a] : [m.domain[0], m.domain[0] + (b - a)];
    else if (event.key === 'End') next = part === 'start' ? [b, b] : part === 'end' ? [a, m.domain[1]] : [m.domain[1] - (b - a), m.domain[1]];
    if (!next) return;
    event.preventDefault();
    if (props.snap) next = [snapValue(m, next[0], props.snap, 'start', props.timeZone), snapValue(m, next[1], props.snap, 'end', props.timeZone)];
    commit(next, { source: 'keyboard', reason: 'keyboard' });
  };

  useImperativeHandle(props.ref, () => ({
    get element() {
      return rootRef.current;
    },
    focus() {
      startRef.current?.focus();
    },
  }));

  const { track } = model;
  const x0 = model.scale.map(value[0]);
  const x1 = model.scale.map(value[1]);
  const showTips = props.tooltip === 'always' || (props.tooltip && active !== null);
  const valueText = (v: number) => fmt(v);
  const periods = props.periods ?? [];
  const periodPos = typeof props.periodSelector === 'object' ? (props.periodSelector.position ?? 'top') : 'top';
  const periodId = periods.length ? matchPeriod(periods, value, model.domain[1], model.domain[0], props.timeZone) : null;
  const periodBar =
    periods.length && props.periodSelector !== false ? (
      <PeriodSelector
        periods={periods}
        value={periodId}
        disabled={props.disabled}
        onValueChange={(pid, event) => {
          const p = periods.find((x) => x.id === pid);
          if (!p) return;
          const r = periodRange(p, model.domain[1], model.domain[0], props.timeZone);
          commit(r, { source: event.source, reason: 'period' });
        }}
      />
    ) : null;
  const sliderCommon = {
    'aria-valuemin': model.domain[0],
    'aria-valuemax': model.domain[1],
    'aria-disabled': props.disabled ? true : undefined,
    tabIndex: props.disabled ? -1 : 0,
  } as const;
  const lh = 15;
  return (
    <div
      ref={rootRef}
      className={`salmon-viz salmon-range-selector${props.className ? ` ${props.className}` : ''}`}
      style={props.style}
      role="group"
      aria-label={props['aria-label'] ?? text.band}
      data-disabled={props.disabled ? '' : undefined}
    >
      {periodPos === 'top' ? periodBar : null}
      <div ref={surfaceRef} className="salmon-viz-surface salmon-range-selector-surface" style={{ height: props.height, width: props.width }} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}>
        <svg viewBox={`0 0 ${model.width} ${model.height}`} width={model.width} height={model.height} aria-hidden="true" focusable="false">
          {props.gridLines !== false ? <path className="salmon-viz-grid" d={model.ticks.map((t) => `M${n2(t.pos)},${n2(track.y)}V${n2(track.y + track.height)}`).join('')} /> : null}
          <g className="salmon-range-selector-series">
            {model.paths.map((p) => (
              <path key={p.key} d={p.d} style={p.fill ? { fill: p.fill, opacity: 0.25 } : { fill: 'none', stroke: p.stroke, strokeWidth: 1.5 }} />
            ))}
          </g>
          <rect className="salmon-range-selector-unselected" x={n2(track.x)} y={n2(track.y)} width={n2(Math.max(0, x0 - track.x))} height={n2(track.height)} />
          <rect className="salmon-range-selector-unselected" x={n2(x1)} y={n2(track.y)} width={n2(Math.max(0, track.x + track.width - x1))} height={n2(track.height)} />
          <rect className="salmon-range-selector-band" x={n2(x0)} y={n2(track.y)} width={n2(Math.max(0, x1 - x0))} height={n2(track.height)} />
          <path className="salmon-viz-axis-line" d={`M${n2(track.x)},${n2(track.y + track.height)}H${n2(track.x + track.width)}`} />
          {props.ticks !== false ? <path className="salmon-viz-tick" d={model.ticks.map((t) => `M${n2(t.pos)},${n2(track.y + track.height)}v4`).join('')} /> : null}
          {model.ticks.map((t) =>
            t.hidden ? null : (
              <text key={t.value} x={n2(t.pos)} y={n2(props.labelPosition === 'inside' ? track.y + track.height - 4 : track.y + track.height + lh)} textAnchor={props.labelPosition === 'inside' ? 'start' : 'middle'}>
                {t.text}
              </text>
            ),
          )}
          {model.groups.map((g) => (
            <text key={g.pos} className="salmon-range-selector-group-label" x={n2(props.groupLabels?.align === 'center' ? (g.pos + g.end) / 2 : g.pos + 2)} y={n2(track.y + track.height + lh * 2 + 2)} textAnchor={props.groupLabels?.align === 'center' ? 'middle' : 'start'}>
              {g.text}
            </text>
          ))}
        </svg>
        <div className="salmon-range-selector-track" style={{ left: pct(track.x, model.width), top: pct(track.y, model.height), width: pct(track.width, model.width), height: pct(track.height, model.height) }} onPointerDown={onPointerDown('track')} />
        <div
          {...sliderCommon}
          role="slider"
          className="salmon-range-selector-band-control"
          aria-label={text.band}
          aria-valuenow={value[0]}
          aria-valuemax={model.domain[1] - (value[1] - value[0])}
          aria-valuetext={text.range(valueText(value[0]), valueText(value[1]))}
          data-active={active === 'band' ? '' : undefined}
          style={{ left: pct(x0, model.width), top: pct(track.y, model.height), width: pct(Math.max(0, x1 - x0), model.width), height: pct(track.height, model.height) }}
          onPointerDown={onPointerDown('band')}
          onKeyDown={onKeyDown('band')}
        />
        {(['start', 'end'] as const).map((part) => {
          const v = part === 'start' ? value[0] : value[1];
          const x = part === 'start' ? x0 : x1;
          return (
            <div
              key={part}
              {...sliderCommon}
              ref={part === 'start' ? startRef : undefined}
              role="slider"
              className="salmon-range-selector-thumb"
              data-thumb={part}
              data-active={active === part ? '' : undefined}
              aria-label={part === 'start' ? text.start : text.end}
              aria-valuenow={v}
              aria-valuemin={part === 'start' ? model.domain[0] : value[0]}
              aria-valuemax={part === 'start' ? value[1] : model.domain[1]}
              aria-valuetext={valueText(v)}
              aria-describedby={showTips ? `${id}-${part}-tip` : undefined}
              style={{ left: pct(x, model.width), top: pct(track.y, model.height), height: pct(track.height, model.height) }}
              onPointerDown={onPointerDown(part)}
              onKeyDown={onKeyDown(part)}
            >
              {showTips ? (
                <span id={`${id}-${part}-tip`} className="salmon-viz-tooltip salmon-range-selector-tooltip">
                  {valueText(v)}
                </span>
              ) : null}
            </div>
          );
        })}
      </div>
      {periodPos === 'bottom' ? periodBar : null}
      {props.name ? (
        <>
          <input type="hidden" name={props.name} value={formValue(model.kind, value[0])} />
          <input type="hidden" name={props.name} value={formValue(model.kind, value[1])} />
        </>
      ) : null}
    </div>
  );
}

function formValue(kind: 'linear' | 'time' | 'log', v: number): string {
  return kind === 'time' && Number.isFinite(v) ? new Date(v).toISOString() : String(v);
}
