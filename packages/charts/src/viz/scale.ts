// Scales: linear, log, time,
// category (band), time-category and point scales over a pixel range.
// A scale is a plain object of pure functions; `map` returns unrounded
// pixels (geometry rounds at serialization), `invert` maps pixels back.

import { logTicks, minorTicks, niceDomain, niceTicks, padDomain, type DomainPadding } from './ticks.js';
import { timeTicks, type TimeInterval } from './time-ticks.js';

export type ScaleKind = 'linear' | 'log' | 'time' | 'category' | 'timeCategory';

export interface ContinuousScale {
  readonly kind: 'linear' | 'log' | 'time';
  /** Data domain [start, end] (time: epoch ms). */
  readonly domain: readonly [number, number];
  /** Pixel range [start, end]; reversed axes swap it. */
  readonly range: readonly [number, number];
  map(value: number): number;
  invert(pixel: number): number;
  ticks(count?: number): number[];
  /** The calendar interval of the last `ticks()` call on a time scale. */
  readonly interval?: TimeInterval | undefined;
  /** Zero-width for continuous scales. */
  readonly bandwidth: number;
}

export interface BandScale {
  readonly kind: 'category' | 'timeCategory';
  readonly domain: readonly string[];
  readonly range: readonly [number, number];
  /** Pixel start of the band of `index`. */
  start(index: number): number;
  /** Pixel center of the band of `index`. */
  map(index: number): number;
  /** Nearest category index for a pixel (clamped). */
  invert(pixel: number): number;
  /** Width of one band (the step minus inner padding). */
  readonly bandwidth: number;
  /** Distance between two band starts. */
  readonly step: number;
  ticks(count?: number): number[];
  readonly interval?: undefined;
}

export type Scale = ContinuousScale | BandScale;

export interface LinearScaleOptions {
  readonly domain: readonly [number, number];
  readonly range: readonly [number, number];
  readonly reversed?: boolean | undefined;
  /** Clamp `map` to the range. */
  readonly clamp?: boolean | undefined;
}

function rangeOf(range: readonly [number, number], reversed: boolean | undefined): [number, number] {
  return reversed ? [range[1], range[0]] : [range[0], range[1]];
}

export function linearScale(options: LinearScaleOptions): ContinuousScale {
  const [d0, d1] = options.domain;
  const [r0, r1] = rangeOf(options.range, options.reversed);
  const span = d1 - d0 || 1;
  const k = (r1 - r0) / span;
  const lo = Math.min(r0, r1);
  const hi = Math.max(r0, r1);
  return {
    kind: 'linear',
    domain: [d0, d1],
    range: [r0, r1],
    bandwidth: 0,
    map: options.clamp ? (v) => Math.min(hi, Math.max(lo, r0 + (v - d0) * k)) : (v) => r0 + (v - d0) * k,
    invert: (p) => d0 + (p - r0) / k,
    ticks: (count = 5) => niceTicks(d0, d1, count),
  };
}

export function logScale(options: LinearScaleOptions & { readonly base?: number | undefined }): ContinuousScale {
  const base = options.base ?? 10;
  const ln = Math.log(base);
  const log = (v: number) => Math.log(Math.max(v, Number.MIN_VALUE)) / ln;
  const [d0, d1] = options.domain;
  const [r0, r1] = rangeOf(options.range, options.reversed);
  const l0 = log(d0);
  const k = (r1 - r0) / (log(d1) - l0 || 1);
  return {
    kind: 'log',
    domain: [d0, d1],
    range: [r0, r1],
    bandwidth: 0,
    map: (v) => r0 + (log(v) - l0) * k,
    invert: (p) => base ** (l0 + (p - r0) / k),
    ticks: (count = 5) => logTicks(d0, d1, base, count),
  };
}

export function timeScale(options: LinearScaleOptions & { readonly timeZone?: string | undefined; readonly interval?: TimeInterval | undefined }): ContinuousScale {
  const linear = linearScale(options);
  let interval: TimeInterval | undefined = options.interval;
  return {
    ...linear,
    kind: 'time',
    get interval() {
      return interval;
    },
    ticks: (count = 6) => {
      const t = timeTicks(options.domain[0], options.domain[1], {
        count,
        ...(options.interval ? { interval: options.interval } : {}),
        ...(options.timeZone ? { timeZone: options.timeZone } : {}),
      });
      interval = t.interval;
      return t.values;
    },
  };
}

export interface BandScaleOptions {
  readonly domain: readonly string[];
  readonly range: readonly [number, number];
  readonly reversed?: boolean | undefined;
  /** Inner padding as a fraction of the step (0..1). Default 0.2. */
  readonly paddingInner?: number | undefined;
  /** Outer padding as a fraction of the step. Default: half the inner padding. */
  readonly paddingOuter?: number | undefined;
  /** `'between'` (labels between ticks, bands) or `'on'` (points on ticks, no outer half band). */
  readonly placement?: 'between' | 'on' | undefined;
  readonly kind?: 'category' | 'timeCategory' | undefined;
}

export function bandScale(options: BandScaleOptions): BandScale {
  const n = options.domain.length;
  const [r0, r1] = rangeOf(options.range, options.reversed);
  const inner = Math.min(1, Math.max(0, options.paddingInner ?? 0.2));
  const on = options.placement === 'on';
  const outer = on ? 0 : (options.paddingOuter ?? inner / 2);
  const dir = r1 >= r0 ? 1 : -1;
  const length = Math.abs(r1 - r0);
  const slots = on ? Math.max(1, n - 1) : Math.max(1, n - inner + outer * 2);
  const step = length / slots;
  const bandwidth = on ? step * (1 - inner) : step * (1 - inner);
  const offset = on ? -bandwidth / 2 : step * outer;
  const start = (i: number) => r0 + dir * (offset + i * step) - (dir < 0 ? bandwidth : 0);
  return {
    kind: options.kind ?? 'category',
    domain: options.domain,
    range: [r0, r1],
    bandwidth,
    step,
    start,
    map: (i) => start(i) + bandwidth / 2,
    invert: (p) => {
      if (n === 0) return 0;
      const i = Math.round(((p - r0) * dir - offset - bandwidth / 2) / step);
      return Math.min(n - 1, Math.max(0, i));
    },
    ticks: (count?: number) => {
      const every = count && n > count ? Math.ceil(n / count) : 1;
      const out: number[] = [];
      for (let i = 0; i < n; i += every) out.push(i);
      return out;
    },
  };
}

export interface ScaleSpec {
  readonly kind: ScaleKind;
  /** Numeric domain for continuous scales. */
  readonly domain?: readonly [number, number] | undefined;
  /** Category labels for band scales. */
  readonly categories?: readonly string[] | undefined;
  readonly range: readonly [number, number];
  readonly reversed?: boolean | undefined;
  readonly base?: number | undefined;
  readonly timeZone?: string | undefined;
  readonly interval?: TimeInterval | undefined;
  readonly paddingInner?: number | undefined;
  readonly placement?: 'between' | 'on' | undefined;
}

/** Builds a scale from a spec. */
export function createScale(spec: ScaleSpec): Scale {
  switch (spec.kind) {
    case 'category':
    case 'timeCategory':
      return bandScale({ domain: spec.categories ?? [], range: spec.range, reversed: spec.reversed, paddingInner: spec.paddingInner, placement: spec.placement, kind: spec.kind });
    case 'log':
      return logScale({ domain: spec.domain ?? [1, 10], range: spec.range, reversed: spec.reversed, base: spec.base });
    case 'time':
      return timeScale({ domain: spec.domain ?? [0, 1], range: spec.range, reversed: spec.reversed, timeZone: spec.timeZone, interval: spec.interval });
    default:
      return linearScale({ domain: spec.domain ?? [0, 1], range: spec.range, reversed: spec.reversed });
  }
}

export interface ResolveDomainOptions {
  readonly min?: number | undefined;
  readonly max?: number | undefined;
  readonly includeZero?: boolean | undefined;
  readonly padding?: DomainPadding | undefined;
  readonly tickCount?: number | undefined;
  readonly kind?: 'linear' | 'log' | 'time' | undefined;
}

/**
 * The axis domain from the data extent: explicit `min` / `max` win, then
 * `includeZero`, then the padding mode. Time axes are not niced (ticks fall
 * on calendar boundaries inside the data range); log axes snap to powers.
 */
export function resolveDomain(extent: readonly [number, number] | null, options: ResolveDomainOptions = {}): [number, number] {
  let lo = extent ? extent[0] : 0;
  let hi = extent ? extent[1] : 1;
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) {
    lo = 0;
    hi = 1;
  }
  const kind = options.kind ?? 'linear';
  if (kind === 'linear' && options.includeZero !== false) {
    lo = Math.min(lo, 0);
    hi = Math.max(hi, 0);
  }
  if (kind === 'log') {
    const base = 10;
    lo = lo > 0 ? base ** Math.floor(Math.log10(lo)) : 1;
    hi = hi > 0 ? base ** Math.ceil(Math.log10(hi)) : 10;
    if (lo === hi) hi = lo * base;
  } else if (kind === 'time') {
    if (lo === hi) {
      lo -= 12 * 3600_000;
      hi += 12 * 3600_000;
    }
  } else {
    [lo, hi] = padDomain(lo, hi, options.padding ?? 'auto', options.tickCount ?? 5);
  }
  if (options.min !== undefined) lo = options.min;
  if (options.max !== undefined) hi = options.max;
  if (lo === hi) [lo, hi] = niceDomain(lo, hi);
  return [lo, hi];
}

export { minorTicks };
