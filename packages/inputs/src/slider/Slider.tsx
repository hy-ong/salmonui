'use client';

// Slider.
//
// - One visually hidden native `<input type="range">` per thumb carries
//   keyboard focus, `aria-valuetext` and form submission (a range slider
//   submits `name` twice); the visual thumb follows it.
// - Pointer drags use `internal/pointer-drag.ts`: one rect at pointerdown,
//   rAF-coalesced moves. A drag writes `--salmon-slider-start` /
//   `--salmon-slider-end` on the root and the native inputs' values; an
//   uncontrolled slider does not re-render until the drag ends.
//   `onValueChange` fires at most once per frame, `onValueCommit` on
//   pointerup and key-up.
// - Ticks are markup with percentage positions (no measurement), so the
//   server markup is final.

import { useLayoutEffect, useMemo, useRef, type ChangeEvent, type CSSProperties, type KeyboardEvent, type PointerEvent as ReactPointerEvent, type ReactNode, type Ref } from 'react';
import { useControllableState } from '@salmonui/core/internal/controllable';
import { cx, FieldHelp, FieldStateContext, useField, type FieldCommonProps, type FieldValidationText } from '../internal/field/field.js';
import { assignRef, useFormReset } from '@salmonui/core/internal/form';
import { useLocale, useLocaleText } from '@salmonui/core/internal/locale';
import { clamp, fraction1D, keyMove, snapToStep, usePointerDrag } from '@salmonui/core/internal/pointer-drag';

/** One slider value: a number, or an entry of `values`. */
export type SliderScalar = number | string;
/** A single value or a `[start, end]` range. */
export type SliderValue = SliderScalar | readonly [SliderScalar, SliderScalar];

/** Second argument of `onValueChange` and `onValueCommit`. */
export interface SliderChangeDetails {
  readonly source: 'pointer' | 'touch' | 'keyboard' | 'api';
  /** `'drag'` (pointer), `'keyboard'` (arrow, Page, Home, End keys), `'input'` (a native input event, e.g. assistive technology) or `'reset'` (form reset). */
  readonly reason: 'drag' | 'keyboard' | 'input' | 'reset';
  /** The thumb that moved: 0 (single or start) or 1 (end). */
  readonly thumb: 0 | 1;
}

/** Tick marks. */
export interface SliderTicks {
  /** Side of the track. Default `'after'`. */
  readonly placement?: 'before' | 'after' | 'both' | 'none' | undefined;
  /** Distance between labelled major ticks. Default 10 (1 with `values`). */
  readonly majorStep?: number | undefined;
  /** Distance between minor ticks. Default 1. */
  readonly minorStep?: number | undefined;
  /** Draws minor ticks between the major ones. Default false. */
  readonly showMinor?: boolean | undefined;
  /** `Intl.NumberFormat` options of the tick labels. Default the slider's `formatOptions`. */
  readonly formatOptions?: Intl.NumberFormatOptions | undefined;
}

/** Argument of `renderTick`. */
export interface SliderTickContext {
  readonly value: SliderScalar;
  /** The formatted label. */
  readonly label: string;
  readonly major: boolean;
  /** Position along the track, 0..100. */
  readonly percent: number;
}

/** The value bubble over each thumb. */
export interface SliderValueLabel {
  /** When the bubble shows. Default `'focus'` (focus or hover). */
  readonly show?: 'focus' | 'hover' | 'always' | 'never' | undefined;
  /** Above (`'before'`) or below the thumb; start / end for vertical sliders. Default `'before'`. */
  readonly placement?: 'before' | 'after' | undefined;
  readonly formatOptions?: Intl.NumberFormatOptions | undefined;
  /** Bubble text. */
  readonly format?: ((value: SliderScalar) => string) | undefined;
}

/** Thumb bounds inside `min..max`; `startFixed` / `endFixed` lock a thumb. */
export interface SliderLimits {
  readonly minStart?: number | undefined;
  readonly maxStart?: number | undefined;
  readonly minEnd?: number | undefined;
  readonly maxEnd?: number | undefined;
  readonly startFixed?: boolean | undefined;
  readonly endFixed?: boolean | undefined;
}

/** User-visible strings: `start` / `end` name the thumbs of a range slider. */
export type SliderLocaleText = FieldValidationText & { readonly start?: string; readonly end?: string };

/** The value type callbacks receive: literals widened (`50` -> `number`). */
export type SliderValueOf<V> = V extends readonly [infer A, infer B] ? readonly [SliderValueOf<A>, SliderValueOf<B>] : V extends number ? number : V extends string ? string : V;

export interface SliderProps<T extends SliderValue = number> extends FieldCommonProps {
  /** Controlled value: a number (or `values` entry), or `[start, end]` for two thumbs. */
  readonly value?: T | undefined;
  /** Default `min` (`[min, max]` for a range is chosen by passing a tuple). */
  readonly defaultValue?: T | undefined;
  /** While the value changes; at most once per animation frame during a drag. */
  readonly onValueChange?: ((value: SliderValueOf<T>, details: SliderChangeDetails) => void) | undefined;
  /** When a drag ends (pointerup) or a key is released. */
  readonly onValueCommit?: ((value: SliderValueOf<T>, details: SliderChangeDetails) => void) | undefined;
  /** Default 0. */
  readonly min?: number | undefined;
  /** Default 100. */
  readonly max?: number | undefined;
  /** Default 1. */
  readonly step?: number | undefined;
  /** PageUp / PageDown distance. Default a tenth of the range rounded to `step` (at least `step`). */
  readonly pageStep?: number | undefined;
  /** Discrete entries; the value is an entry and `min` / `max` / `step` are ignored. */
  readonly values?: readonly SliderScalar[] | undefined;
  /** Smallest distance between the thumbs of a range, in steps. Default 0. */
  readonly minStepsBetweenThumbs?: number | undefined;
  /** Fills the track from `min` to the thumb. A range always fills between its thumbs. */
  readonly fill?: boolean | undefined;
  readonly orientation?: 'horizontal' | 'vertical' | undefined;
  readonly ticks?: SliderTicks | undefined;
  /** Tick content; default the label of major ticks. */
  readonly renderTick?: ((ctx: SliderTickContext) => ReactNode) | undefined;
  readonly valueLabel?: SliderValueLabel | undefined;
  /** `Intl.NumberFormat` options of `aria-valuetext` and the default labels. */
  readonly formatOptions?: Intl.NumberFormatOptions | undefined;
  /** Formatting locale. Default `'en-US'`; the host locale is never read. */
  readonly locale?: string | undefined;
  readonly limits?: SliderLimits | undefined;
  readonly name?: string | undefined;
  readonly form?: string | undefined;
  readonly disabled?: boolean | undefined;
  /** Focusable, announced, but not changeable. */
  readonly readOnly?: boolean | undefined;
  readonly localeText?: SliderLocaleText | undefined;
  readonly id?: string | undefined;
  readonly dir?: 'ltr' | 'rtl' | 'auto' | undefined;
  readonly className?: string | undefined;
  readonly style?: CSSProperties | undefined;
  /** Part classes: `root` is `className`. */
  readonly classNames?:
    | {
        readonly label?: string;
        readonly control?: string;
        readonly track?: string;
        readonly range?: string;
        readonly thumb?: string;
        readonly valueLabel?: string;
        readonly ticks?: string;
        readonly tick?: string;
        readonly description?: string;
        readonly error?: string;
      }
    | undefined;
  /** The root element. */
  readonly ref?: Ref<HTMLDivElement> | undefined;
}

const NO_DETAILS: SliderChangeDetails = Object.freeze({ source: 'api', reason: 'input', thumb: 0 });
const MAX_TICKS = 1000;

const formats = new Map<string, Intl.NumberFormat>();
function numberFormat(locale: string, options: Intl.NumberFormatOptions | undefined): Intl.NumberFormat {
  const key = `${locale}|${options ? JSON.stringify(options) : ''}`;
  let nf = formats.get(key);
  if (!nf) {
    nf = new Intl.NumberFormat(locale, options);
    formats.set(key, nf);
  }
  return nf;
}

const percent = (p: number, lo: number, hi: number): number => (hi > lo ? ((p - lo) / (hi - lo)) * 100 : 0);
const pct = (n: number): string => `${Math.round(n * 1000) / 1000}%`;

/**
 * Slider: single or two-thumb range on native range inputs,
 * ticks, value labels, limits, vertical orientation and RTL mirroring.
 * `ref` is the root element.
 */
export function Slider<T extends SliderValue = number>(props: SliderProps<T>): ReactNode {
  const values = props.values;
  const discrete = values !== undefined && values.length > 0;
  const lo = discrete ? 0 : (props.min ?? 0);
  const hi = discrete ? values.length - 1 : Math.max(props.max ?? 100, lo);
  const step = discrete ? 1 : props.step && props.step > 0 ? props.step : 1;
  const orientation = props.orientation ?? 'horizontal';
  const locale = useLocale(props.locale) ?? 'en-US';
  const localeText = useLocaleText('slider', props.localeText);
  const toPos = (v: SliderScalar | undefined): number => (discrete ? Math.max(0, values.indexOf(v as SliderScalar)) : clamp(Number(v ?? lo), lo, hi));
  const fromPos = (p: number): SliderScalar => (discrete ? values[p]! : p);

  const isRange = Array.isArray(props.value ?? props.defaultValue);
  const initial = useRef<SliderValue>(props.defaultValue ?? (isRange ? Object.freeze([fromPos(lo), fromPos(hi)] as const) : fromPos(lo)));
  const [stored, setStored] = useControllableState<SliderValue>(props.value, initial.current, undefined, 'Slider value');
  const controlled = props.value !== undefined;
  const positions: number[] = isRange ? [toPos((stored as readonly SliderScalar[])[0]), toPos((stored as readonly SliderScalar[])[1])] : [toPos(stored as SliderScalar)];

  const rootRef = useRef<HTMLDivElement | null>(null);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const endRef = useRef<HTMLInputElement | null>(null);
  const drag = usePointerDrag();
  /** Positions during a drag or key press (proposal base); null when idle. */
  const live = useRef<number[] | null>(null);
  const keyChanged = useRef<{ thumb: 0 | 1 } | null>(null);
  /** Last keyboard value not yet committed (the render may lag the key-up). */
  const latestPending = useRef<number[] | null>(null);

  // `id` names the root; the native inputs get generated ids.
  const field = useField({ ...props, localeText, id: undefined, value: stored, inputRef, revealOnChange: true });

  const nf = numberFormat(locale, props.formatOptions);
  const valueText = (p: number): string => (discrete ? String(values[p]) : nf.format(p));
  const labelOptions = props.valueLabel?.formatOptions;
  const labelText = (p: number): string => {
    const format = props.valueLabel?.format;
    if (format) return format(fromPos(p));
    if (discrete) return String(values[p]);
    return labelOptions ? numberFormat(locale, labelOptions).format(p) : nf.format(p);
  };

  // Everything the event handlers read, refreshed after each commit.
  const latest = useRef({ props, positions, controlled, lo, hi, step, discrete, isRange, valueText, labelText, fromPos });
  useLayoutEffect(() => {
    latest.current = { props, positions, controlled, lo, hi, step, discrete, isRange, valueText, labelText, fromPos };
  });

  const out = (next: readonly number[]): SliderValue => {
    const l = latest.current;
    return l.isRange ? Object.freeze([l.fromPos(next[0]!), l.fromPos(next[1]!)] as const) : l.fromPos(next[0]!);
  };
  const detailsOf = (bound: unknown, source: SliderChangeDetails['source'], reason: SliderChangeDetails['reason'], thumb: 0 | 1): SliderChangeDetails =>
    bound ? Object.freeze({ source, reason, thumb }) : NO_DETAILS;

  /** The position `p` proposed for `thumb`, after step, bounds, limits, fixed thumbs and the thumb gap. */
  const constrain = (thumb: 0 | 1, p: number, current: readonly number[]): number => {
    const l = latest.current;
    const lim = l.props.limits;
    if (lim && (thumb === 0 ? lim.startFixed : lim.endFixed)) return current[thumb]!;
    let v = snapToStep(p, l.lo, l.hi, l.step);
    if (lim && !l.discrete) {
      v = thumb === 0 ? clamp(v, lim.minStart ?? l.lo, lim.maxStart ?? l.hi) : clamp(v, lim.minEnd ?? l.lo, lim.maxEnd ?? l.hi);
    }
    if (l.isRange) {
      const gap = Math.max(0, l.props.minStepsBetweenThumbs ?? 0) * l.step;
      v = thumb === 0 ? Math.min(v, current[1]! - gap) : Math.max(v, current[0]! + gap);
      v = clamp(v, l.lo, l.hi);
    }
    return v;
  };

  /** Writes positions to the DOM without React (CSS variables, native values, text). */
  const write = (next: readonly number[]): void => {
    const root = rootRef.current;
    if (!root) return;
    const l = latest.current;
    const inputs = [inputRef.current, endRef.current];
    if (l.isRange) root.style.setProperty('--salmon-slider-start', pct(percent(next[0]!, l.lo, l.hi)));
    root.style.setProperty('--salmon-slider-end', pct(percent(next[l.isRange ? 1 : 0]!, l.lo, l.hi)));
    const labels = root.querySelectorAll<HTMLElement>('.salmon-slider-value-label');
    const hidden = root.querySelectorAll<HTMLInputElement>('input[type="hidden"]');
    for (let i = 0; i < next.length; i++) {
      const input = inputs[i];
      const p = next[i]!;
      if (input) {
        input.value = String(p);
        input.setAttribute('aria-valuetext', l.valueText(p));
      }
      const label = labels[i];
      if (label) label.textContent = l.labelText(p);
      const h = hidden[i];
      if (h) h.value = String(l.fromPos(p));
    }
  };

  /** Proposes `next`; returns false when nothing moved. */
  const propose = (next: number[], source: SliderChangeDetails['source'], reason: SliderChangeDetails['reason'], thumb: 0 | 1): boolean => {
    const base = live.current ?? latest.current.positions;
    if (next[0] === base[0] && next[1] === base[1]) return false;
    live.current = next;
    const l = latest.current;
    if (!l.controlled) write(next);
    const cb = l.props.onValueChange;
    if (cb) cb(out(next) as SliderValueOf<T>, detailsOf(cb, source, reason, thumb));
    return true;
  };

  /** Ends an interaction: stores the value (uncontrolled) and fires `onValueCommit`. */
  const commit = (source: SliderChangeDetails['source'], reason: SliderChangeDetails['reason'], thumb: 0 | 1, force = false): void => {
    const final = live.current;
    live.current = null;
    const l = latest.current;
    const changed = final !== null && (final[0] !== l.positions[0] || final[1] !== l.positions[1]);
    if (!final || (!changed && !force)) return;
    const value = out(final);
    if (!l.controlled) setStored(value);
    else
      // A controlled owner may keep its value; show what it renders.
      requestAnimationFrame(() => {
        if (!live.current) write(latest.current.positions);
      });
    const cb = l.props.onValueCommit;
    if (cb) cb(value as SliderValueOf<T>, detailsOf(cb, source, reason, thumb));
  };

  const rtl = (): boolean => {
    const root = rootRef.current;
    return root ? getComputedStyle(root).direction === 'rtl' : false;
  };
  const interactive = !props.disabled && !props.readOnly;

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>): void => {
    if (!interactive || !trackRef.current) return;
    const mirrored = orientation === 'horizontal' && rtl();
    const source = event.pointerType === 'touch' ? 'touch' : 'pointer';
    let thumb: 0 | 1 = 0;
    // Two thumbs on one spot: the first move's direction picks the thumb.
    let undecided = false;
    const at = (x: number, y: number, rect: { left: number; top: number; width: number; height: number }): number => {
      const l = latest.current;
      return l.lo + fraction1D(x, y, rect, orientation, mirrored) * (l.hi - l.lo);
    };
    const move = (p: number): void => {
      const base = live.current ?? latest.current.positions;
      if (undecided) {
        const l = latest.current;
        const snapped = snapToStep(p, l.lo, l.hi, l.step);
        if (snapped === base[0]) return;
        undecided = false;
        thumb = snapped > base[0]! ? 1 : 0;
        (thumb === 1 ? endRef : inputRef).current?.focus({ preventScroll: true });
      }
      const next = base.slice();
      next[thumb] = constrain(thumb, p, base);
      propose(next, source, 'drag', thumb);
    };
    const session = drag.start(
      event,
      {
        onStart: (e, rect) => {
          const l = latest.current;
          const p = at(e.clientX, e.clientY, rect);
          if (l.isRange) {
            const [a, b] = l.positions as [number, number];
            const lim = l.props.limits;
            if (lim?.startFixed) thumb = 1;
            else if (lim?.endFixed) thumb = 0;
            else if (a === b && Math.abs(p - a) <= l.step / 2) undecided = true;
            else thumb = p > b || (p > a && p - a > b - p) ? 1 : 0;
          }
          (thumb === 1 ? endRef : inputRef).current?.focus({ preventScroll: true });
          move(p);
        },
        onMove: (e, rect) => move(at(e.clientX, e.clientY, rect)),
        onEnd: () => commit(source, 'drag', thumb, true),
      },
      { measure: () => trackRef.current!.getBoundingClientRect() },
    );
    // Keep focus on the native input (focused above) and avoid text selection.
    if (session) event.preventDefault();
  };

  const onKeyDown = (thumb: 0 | 1) => (event: KeyboardEvent<HTMLInputElement>): void => {
    const move = keyMove(event.key, orientation, orientation === 'horizontal' && rtl());
    if (!move) return;
    event.preventDefault();
    if (!interactive) return;
    const l = latest.current;
    const base = live.current ?? l.positions;
    const page = l.props.pageStep ?? Math.max(l.step, snapToStep((l.hi - l.lo) / 10, 0, l.hi - l.lo, l.step));
    const current = base[thumb]!;
    const target = move.type === 'min' ? l.lo : move.type === 'max' ? l.hi : current + ('direction' in move ? move.direction : 0) * (move.type === 'page' ? page : l.step);
    const next = base.slice();
    next[thumb] = constrain(thumb, target, base);
    if (propose(next, 'keyboard', 'keyboard', thumb)) {
      keyChanged.current = { thumb };
      // Keys re-render (unlike drags): store now so a held key repeats from the new value.
      if (!l.controlled) setStored(out(next));
      live.current = null;
      latestPending.current = next;
    }
  };
  const onKeyUp = (): void => {
    const pending = keyChanged.current;
    if (!pending) return;
    keyChanged.current = null;
    const next = latestPending.current;
    latestPending.current = null;
    const cb = latest.current.props.onValueCommit;
    if (cb && next) cb(out(next) as SliderValueOf<T>, detailsOf(cb, 'keyboard', 'keyboard', pending.thumb));
  };
  const onChange = (thumb: 0 | 1) => (event: ChangeEvent<HTMLInputElement>): void => {
    // Native increments (assistive technology); keys and drags never reach here.
    if (!interactive) return;
    const base = live.current ?? latest.current.positions;
    const next = base.slice();
    next[thumb] = constrain(thumb, Number(event.currentTarget.value), base);
    if (propose(next, 'api', 'input', thumb)) commit('api', 'input', thumb);
  };

  useFormReset(inputRef, () => {
    live.current = null;
    const reset = initial.current;
    if (!controlled) setStored(reset);
    const cb = latest.current.props.onValueChange;
    if (controlled && cb) cb(reset as SliderValueOf<T>, detailsOf(cb, 'api', 'reset', 0));
  });

  const setRoot = (el: HTMLDivElement | null): void => {
    rootRef.current = el;
    assignRef(props.ref, el);
  };

  const start = isRange ? percent(positions[0]!, lo, hi) : 0;
  const end = percent(positions[isRange ? 1 : 0]!, lo, hi);
  const rootStyle = { ...props.style, '--salmon-slider-start': pct(start), '--salmon-slider-end': pct(end) } as CSSProperties;
  const labelId = field.labelId;
  const show = props.valueLabel ? (props.valueLabel.show ?? 'focus') : 'never';
  const placement = props.ticks ? (props.ticks.placement ?? 'after') : 'none';
  const tickList = useMemo(() => (placement === 'none' ? null : buildTicks(lo, hi, discrete, props.ticks!)), [placement, lo, hi, discrete, props.ticks?.majorStep, props.ticks?.minorStep, props.ticks?.showMinor]);
  const tickNf = numberFormat(locale, props.ticks?.formatOptions ?? props.formatOptions);
  const renderTicks = (side: 'before' | 'after', decorative: boolean): ReactNode =>
    tickList ? (
      <div className={cx('salmon-slider-ticks', props.classNames?.ticks)} data-side={side} aria-hidden="true">
        {tickList.map(([p, major]) => {
          const percentAt = percent(p, lo, hi);
          const label = discrete ? String(values[p]) : tickNf.format(p);
          const content = props.renderTick ? props.renderTick({ value: fromPos(p), label, major, percent: percentAt }) : major ? label : null;
          return (
            <span key={p} className={cx('salmon-slider-tick', props.classNames?.tick)} data-major={major ? '' : undefined} style={{ '--salmon-slider-tick': pct(percentAt) } as CSSProperties}>
              {content != null && content !== false && !decorative ? <span className="salmon-slider-tick-label">{content}</span> : null}
            </span>
          );
        })}
      </div>
    ) : null;

  const thumbNames = isRange ? [localeText?.start ?? 'Minimum', localeText?.end ?? 'Maximum'] : null;
  const hasLabel = props.label != null && props.label !== false;
  const thumbs = positions.map((p, i) => {
    const index = i as 0 | 1;
    const id = index === 0 ? field.inputId : `${field.inputId}-end`;
    return (
      <div key={i} className={cx('salmon-slider-thumb', props.classNames?.thumb)} data-thumb={isRange && index === 0 ? 'start' : 'end'}>
        <input
          ref={index === 0 ? inputRef : endRef}
          type="range"
          className="salmon-slider-input salmon-visually-hidden"
          id={id}
          name={discrete ? undefined : props.name}
          form={props.form}
          min={lo}
          max={hi}
          step={step}
          value={p}
          disabled={props.disabled}
          aria-readonly={props.readOnly ? true : undefined}
          aria-orientation={orientation}
          aria-valuetext={valueText(p)}
          aria-label={thumbNames ? thumbNames[index] : undefined}
          aria-labelledby={thumbNames ? (hasLabel ? `${labelId} ${id}` : undefined) : hasLabel ? labelId : undefined}
          aria-describedby={field.inputProps['aria-describedby']}
          aria-invalid={field.inputProps['aria-invalid']}
          aria-errormessage={field.inputProps['aria-errormessage']}
          onChange={onChange(index)}
          onKeyDown={onKeyDown(index)}
          onKeyUp={onKeyUp}
          onBlur={field.onBlur}
        />
        {show !== 'never' ? (
          <span className={cx('salmon-slider-value-label', props.classNames?.valueLabel)} data-placement={props.valueLabel?.placement ?? 'before'} aria-hidden="true">
            {labelText(p)}
          </span>
        ) : null}
        {discrete && props.name ? <input type="hidden" name={props.name} form={props.form} value={String(fromPos(p))} disabled={props.disabled} /> : null}
      </div>
    );
  });

  return (
    <FieldStateContext value={field}>
      <div
        ref={setRoot}
        id={props.id}
        dir={props.dir}
        className={cx('salmon-field salmon-slider', props.className)}
        style={rootStyle}
        data-size={props.size ?? 'md'}
        data-orientation={orientation}
        data-range={isRange ? '' : undefined}
        data-fill={isRange || props.fill ? '' : undefined}
        data-value-label={show}
        data-readonly={props.readOnly ? '' : undefined}
        {...field.rootProps}
      >
        {hasLabel ? (
          // A `<span>`: each native input is named by aria-labelledby (two thumbs share it).
          <span className={cx('salmon-field-label', props.classNames?.label)} id={labelId}>
            {props.label}
          </span>
        ) : null}
        <div className={cx('salmon-slider-control', props.classNames?.control)} data-ticks={placement} onPointerDown={onPointerDown}>
          {placement === 'before' || placement === 'both' ? renderTicks('before', false) : null}
          <div ref={trackRef} className={cx('salmon-slider-track', props.classNames?.track)}>
            <div className={cx('salmon-slider-range', props.classNames?.range)} />
            {thumbs}
          </div>
          {placement === 'after' || placement === 'both' ? renderTicks('after', false) : null}
        </div>
        <FieldHelp field={field} description={props.description} classNames={props.classNames} />
      </div>
    </FieldStateContext>
  );
}

/** `[position, major]` pairs from `lo` to `hi`. */
function buildTicks(lo: number, hi: number, discrete: boolean, ticks: SliderTicks): [number, boolean][] {
  const major = ticks.majorStep && ticks.majorStep > 0 ? ticks.majorStep : discrete ? 1 : 10;
  const minor = ticks.minorStep && ticks.minorStep > 0 ? ticks.minorStep : 1;
  let unit = ticks.showMinor ? Math.min(minor, major) : major;
  if ((hi - lo) / unit > MAX_TICKS) unit = major;
  if ((hi - lo) / unit > MAX_TICKS) unit = (hi - lo) / MAX_TICKS;
  const out: [number, boolean][] = [];
  const count = Math.floor((hi - lo) / unit + 1e-9);
  for (let i = 0; i <= count; i++) {
    const p = Number((lo + i * unit).toPrecision(12));
    const k = (p - lo) / major;
    out.push([p, Math.abs(k - Math.round(k)) < 1e-9]);
  }
  if (out.length && out[out.length - 1]![0] < hi) {
    const k = (hi - lo) / major;
    out.push([hi, Math.abs(k - Math.round(k)) < 1e-9]);
  }
  return out;
}
