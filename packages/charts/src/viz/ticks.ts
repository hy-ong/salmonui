// Nice numeric ticks: Heckbert /
// Wilkinson style 1-2-5 steps, nice domains, logarithmic ticks and minor
// ticks. Pure and deterministic; every value is snapped to the step's decimal
// precision so 0.1 + 0.2 never leaks into a label.

const E10 = Math.sqrt(50);
const E5 = Math.sqrt(10);
const E2 = Math.sqrt(2);

/** Rounds to 0.01 (the serialization precision of every coordinate). */
export function r2(value: number): number {
  const v = Math.round(value * 100) / 100;
  return v === 0 ? 0 : v; // no -0 in markup
}

/** Decimal places of a step such as 0.25 (2) or 1e-7 (7). */
export function stepPrecision(step: number): number {
  if (!Number.isFinite(step) || step === 0) return 0;
  const abs = Math.abs(step);
  if (abs >= 1) return 0;
  const exp = Math.ceil(-Math.log10(abs) - 1e-9);
  let p = Math.max(0, exp);
  // 0.25 has more digits than its magnitude suggests.
  while (p < 15 && Math.abs(Math.round(abs * 10 ** p) - abs * 10 ** p) > 1e-6) p++;
  return p;
}

function snap(value: number, precision: number): number {
  const v = Number(value.toFixed(precision));
  return v === 0 ? 0 : v;
}

/** The 1-2-5 step that yields about `count` intervals over [min, max]. */
export function tickStep(min: number, max: number, count: number): number {
  const span = Math.abs(max - min);
  if (!Number.isFinite(span) || span === 0 || count <= 0) return 0;
  const raw = span / count;
  const power = 10 ** Math.floor(Math.log10(raw));
  const error = raw / power;
  const factor = error >= E10 ? 10 : error >= E5 ? 5 : error >= E2 ? 2 : 1;
  return factor * power;
}

/** Extends [min, max] outward to multiples of the tick step. */
export function niceDomain(min: number, max: number, count = 5): [number, number] {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [0, 1];
  if (min === max) {
    if (min === 0) return [0, 1];
    const pad = Math.abs(min) * 0.1 || 1;
    return niceDomain(min - pad, max + pad, count);
  }
  const reversed = min > max;
  let lo = reversed ? max : min;
  let hi = reversed ? min : max;
  let step = tickStep(lo, hi, count);
  // Two passes settle the step after the domain grows.
  for (let i = 0; i < 2 && step > 0; i++) {
    lo = Math.floor(lo / step) * step;
    hi = Math.ceil(hi / step) * step;
    step = tickStep(lo, hi, count);
  }
  const p = stepPrecision(step);
  lo = snap(lo, p);
  hi = snap(hi, p);
  return reversed ? [hi, lo] : [lo, hi];
}

/** Tick values inside [min, max] at `step` (or the nice step for `count`). */
export function niceTicks(min: number, max: number, count = 5, step?: number): number[] {
  const lo = Math.min(min, max);
  const hi = Math.max(min, max);
  const s = step && step > 0 ? step : tickStep(lo, hi, count);
  if (!(s > 0) || !Number.isFinite(lo) || !Number.isFinite(hi)) return Number.isFinite(lo) ? [lo] : [];
  const p = stepPrecision(s);
  const first = Math.ceil(lo / s - 1e-9);
  const last = Math.floor(hi / s + 1e-9);
  const out: number[] = [];
  // Guard pathological spans (a tiny step over a huge domain).
  if (last - first > 10_000) return [lo, hi];
  for (let i = first; i <= last; i++) out.push(snap(i * s, p));
  return out;
}

/** Ticks of a logarithmic axis: powers of `base`, with 2..9 multiples when the span is short. */
export function logTicks(min: number, max: number, base = 10, count = 5): number[] {
  const lo = Math.min(min, max);
  const hi = Math.max(min, max);
  if (!(lo > 0) || !(hi > 0)) return [];
  const log = (v: number) => Math.log(v) / Math.log(base);
  const e0 = Math.floor(log(lo) + 1e-9);
  const e1 = Math.ceil(log(hi) - 1e-9);
  const out: number[] = [];
  const decades = e1 - e0;
  const every = decades > count * 2 ? Math.ceil(decades / count) : 1;
  for (let e = e0; e <= e1; e += every) {
    const v = base ** e;
    if (decades < 3 && base === 10) {
      for (let k = 1; k < 10; k++) {
        const m = Number((k * v).toPrecision(12));
        if (m >= lo * (1 - 1e-9) && m <= hi * (1 + 1e-9) && (k === 1 || k === 2 || k === 5)) out.push(m);
      }
    } else {
      const m = Number(v.toPrecision(12));
      if (m >= lo * (1 - 1e-9) && m <= hi * (1 + 1e-9)) out.push(m);
    }
  }
  return out;
}

/** `perInterval` evenly spaced minor ticks between consecutive major ticks. */
export function minorTicks(major: readonly number[], perInterval: number): number[] {
  if (perInterval <= 0 || major.length < 2) return [];
  const out: number[] = [];
  for (let i = 0; i < major.length - 1; i++) {
    const a = major[i] as number;
    const b = major[i + 1] as number;
    const step = (b - a) / (perInterval + 1);
    for (let k = 1; k <= perInterval; k++) out.push(a + step * k);
  }
  return out;
}

export type DomainPadding = 'auto' | 'none' | 'normal' | 'additional' | 'round';

/**
 * `rangePadding` modes on a numeric [min, max]: `none` keeps the
 * data range, `round` rounds to the tick step, `normal` adds one step on the
 * side that is not anchored at zero, `additional` adds one step on both
 * sides; `auto` is `normal` for value axes (`round` here, which reads best).
 */
export function padDomain(min: number, max: number, mode: DomainPadding = 'auto', count = 5): [number, number] {
  if (mode === 'none') return min === max ? niceDomain(min, max, count) : [min, max];
  if (mode === 'round' || mode === 'auto') return niceDomain(min, max, count);
  const [lo, hi] = niceDomain(min, max, count);
  const step = tickStep(lo, hi, count);
  if (mode === 'additional') return [lo - step, hi + step];
  // normal: one more step where the data touches the nice edge (never across zero).
  return [lo === min && lo !== 0 ? lo - step : lo, hi === max && hi !== 0 ? hi + step : hi];
}
