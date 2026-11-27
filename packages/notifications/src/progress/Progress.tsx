// Progress and Meter. Server-safe:
// no hooks and no client code. Values are inline custom properties
// (`--salmon-progress-value`, `--salmon-progress-buffer`), so server and
// client markup match, a value change is one style write, and the CSS does
// the drawing: a scaled bar for `linear`, one inline SVG with
// `stroke-dasharray` circles for `circular` and `semicircle`.
import type { CSSProperties, HTMLAttributes, ReactNode, Ref } from 'react';
import { formatPercent } from '../internal/format.js';

/** Color role: the neutral scale plus the five theme seeds. */
export type ProgressTone = 'neutral' | 'primary' | 'info' | 'success' | 'warning' | 'danger';
export type ProgressShape = 'linear' | 'circular' | 'semicircle';
export type ProgressSize = 'sm' | 'md' | 'lg';

/** What `label` and `valueLabel` functions receive. */
export interface ProgressValueContext {
  /** The clamped value, `null` when indeterminate. */
  readonly value: number | null;
  /** The value as a percentage of `min`..`max` (0–100), `null` when indeterminate. */
  readonly percent: number | null;
  /** The default text: the locale percent (`"42%"`), empty when indeterminate. */
  readonly valueText: string;
}

/** An accessible name is required: `aria-label` or `aria-labelledby`. */
export type ProgressAccessibleName = { 'aria-label': string; 'aria-labelledby'?: string } | { 'aria-label'?: string; 'aria-labelledby': string };

interface ProgressBaseProps extends Omit<HTMLAttributes<HTMLDivElement>, 'aria-label' | 'aria-labelledby' | 'children'> {
  /** Lower bound (default 0). */
  min?: number;
  /** Upper bound (default 100). */
  max?: number;
  /** `'linear'` (default), `'circular'` or `'semicircle'`. */
  shape?: ProgressShape;
  /**
   * A tone, or a function of the value for range colors.
   * Default `'primary'`.
   */
  tone?: ProgressTone | ((value: number | null) => ProgressTone);
  /** Equal segments with a fixed gap. */
  segments?: number;
  /**
   * Diameter of `circular` / `semicircle` shapes, or the bar thickness of
   * `linear`: `'sm'`, `'md'` (default), `'lg'` or a number of pixels for the
   * diameter.
   */
  size?: ProgressSize | number;
  /** Stroke or bar thickness in pixels, shared by track, value and buffer. */
  thickness?: number;
  /**
   * Visible value label: `true` shows `valueText`, a node is
   * shown as is, a function receives the value context. Centered inside
   * `circular` and `semicircle` shapes.
   */
  label?: boolean | ReactNode | ((context: ProgressValueContext) => ReactNode);
  /** `aria-valuetext`: a string, or a function of the value context. Default the locale percent. */
  valueLabel?: string | ((context: ProgressValueContext) => string);
  /** BCP 47 locale of the default percent text. Default `'en-US'`. */
  locale?: string;
  /** The root element. */
  ref?: Ref<HTMLDivElement>;
}

export type ProgressProps = ProgressBaseProps &
  ProgressAccessibleName & {
    /** The current value; `null` is indeterminate. */
    value: number | null;
    /** Secondary (buffered) value, same scale as `value`. */
    buffer?: number;
    /** Stripes on a `linear` bar. */
    striped?: boolean;
  };

export type MeterProps = ProgressBaseProps &
  ProgressAccessibleName & {
    /** The measured value (`role="meter"`). */
    value: number;
  };

const SIZES: Record<ProgressSize, number> = { sm: 32, md: 48, lg: 64 };

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

function render(role: 'progressbar' | 'meter', props: ProgressProps) {
  const { value: raw, min = 0, max = 100, buffer, striped, shape = 'linear', tone = 'primary', segments, size = 'md', thickness, label, valueLabel, locale, className, style, ref, ...rest } = props;
  const value = raw == null ? null : clamp(raw, min, max);
  const fraction = value == null ? null : max > min ? (value - min) / (max - min) : 0;
  const text = fraction == null ? '' : formatPercent(fraction, locale);
  const ctx: ProgressValueContext = { value, percent: fraction == null ? null : fraction * 100, valueText: text };
  const valueText = typeof valueLabel === 'function' ? valueLabel(ctx) : (valueLabel ?? (text || undefined));
  const shown = label === true ? text : typeof label === 'function' ? label(ctx) : label === false ? null : label;
  const linear = shape === 'linear';
  const diameter = typeof size === 'number' ? size : SIZES[size];
  // SVG user units: the viewBox is 100 wide, so the stroke scales with the diameter.
  const stroke = ((thickness ?? (linear ? 0 : diameter / 8)) / diameter) * 100;
  const r = 50 - stroke / 2;
  const vars = {
    ...style,
    '--salmon-progress-value': fraction ?? undefined,
    '--salmon-progress-buffer': buffer == null ? undefined : (clamp(buffer, min, max) - min) / (max - min || 1),
    '--salmon-progress-segments': segments,
    '--salmon-progress-size': typeof size === 'number' ? `${size}px` : undefined,
    '--salmon-progress-thickness': thickness == null ? undefined : `${thickness}px`,
  } as CSSProperties;
  const circle = (part: string) => <circle className={`salmon-progress-${part}`} cx="50" cy="50" r={r} strokeWidth={stroke} pathLength={shape === 'semicircle' ? 200 : 100} />;
  return (
    <div
      {...rest}
      ref={ref}
      role={role}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={value ?? undefined}
      aria-valuetext={valueText}
      className={`salmon-${role === 'meter' ? 'meter salmon-progress' : 'progress'}${className ? ` ${className}` : ''}`}
      style={vars}
      data-shape={shape}
      data-tone={typeof tone === 'function' ? tone(value) : tone}
      data-size={typeof size === 'number' ? undefined : size}
      data-indeterminate={value == null ? '' : undefined}
      data-striped={striped && linear ? '' : undefined}
      data-segments={segments ? '' : undefined}
    >
      {linear ? (
        <div className="salmon-progress-track">
          {buffer == null ? null : <div className="salmon-progress-buffer" />}
          <div className="salmon-progress-bar" />
        </div>
      ) : (
        <svg className="salmon-progress-svg" viewBox={shape === 'semicircle' ? '0 0 100 50' : '0 0 100 100'} aria-hidden="true" focusable="false">
          {circle('track')}
          {buffer == null ? null : circle('buffer')}
          {circle('bar')}
        </svg>
      )}
      {shown == null || shown === '' ? null : <span className="salmon-progress-label">{shown}</span>}
    </div>
  );
}

/**
 * A progress indicator (`role="progressbar"`): linear, circular or
 * semicircle, determinate or indeterminate (`value={null}`), with an
 * optional buffer, segments and stripes. Renders in Server Components.
 */
export function Progress(props: ProgressProps) {
  return render('progressbar', props);
}

/**
 * A measured value within a known range (`role="meter"`): disk usage, a
 * score, a strength. Same shapes and CSS as `Progress`, never
 * indeterminate; `tone` as a function colors ranges.
 */
export function Meter(props: MeterProps) {
  return render('meter', props as ProgressProps);
}
