// The time listbox of TimePicker and of the DatePicker time part.
// DOM focus stays in the field; the field carries
// `aria-activedescendant`, so the active option is always mounted. Lists over
// 200 options are windowed: the item height is measured once per open, the
// scroll position never enters React state and the list commits only when
// the mounted range changes.

import type { ReactNode } from 'react';
import { plainTime, type PlainTime, type PlainTimeLike } from '@salmonui/core/internal/dates/index';

/** Milliseconds since midnight. */
export const timeOfDayMs = (t: PlainTimeLike): number => ((t.hour * 60 + t.minute) * 60 + (t.second ?? 0)) * 1000 + (t.millisecond ?? 0);
export const compareTimes = (a: PlainTimeLike, b: PlainTimeLike): number => timeOfDayMs(a) - timeOfDayMs(b);

/** Context of `renderOption`. */
export interface TimeOptionContext {
  readonly time: PlainTime;
  /** The formatted option text. */
  readonly text: string;
  readonly selected: boolean;
  readonly disabled: boolean;
  readonly index: number;
}

const DAY_MINUTES = 24 * 60;
/** Lists longer than this are windowed. */
export const VIRTUAL_THRESHOLD = 200;

/** Options every `step` minutes from `min` (or 00:00) to `max` (or the end of the day), inclusive. */
export function timeOptions(step: number, min?: PlainTimeLike | null, max?: PlainTimeLike | null): PlainTime[] {
  const s = Number.isFinite(step) && step > 0 ? step : 30;
  const lo = min ? timeOfDayMs(min) : 0;
  const hi = max ? timeOfDayMs(max) : DAY_MINUTES * 60_000 - 1;
  const out: PlainTime[] = [];
  for (let ms = lo; ms <= hi && out.length < DAY_MINUTES * 60; ms += s * 60_000) {
    const total = Math.floor(ms / 1000);
    out.push(plainTime(Math.floor(total / 3600), Math.floor(total / 60) % 60, total % 60));
  }
  return out;
}

/** Index of the option equal to `t`, else the first option after it, else -1. */
export function nearestOption(options: readonly PlainTime[], t: PlainTimeLike | null | undefined): number {
  if (!t || options.length === 0) return -1;
  const i = options.findIndex((o) => compareTimes(o, t) >= 0);
  return i === -1 ? options.length - 1 : i;
}

/** The next enabled index from `from` by `delta` (clamped, skipping disabled options). */
export function stepOption(count: number, from: number, delta: number, disabled: (i: number) => boolean): number {
  if (count === 0) return -1;
  let i = from < 0 ? (delta > 0 ? -1 : count) : from;
  const dir = delta > 0 ? 1 : -1;
  let remaining = Math.abs(delta);
  let last = from;
  while (remaining > 0) {
    i += dir;
    if (i < 0 || i >= count) break;
    if (!disabled(i)) {
      last = i;
      remaining--;
    }
  }
  if (last < 0 || last >= count) {
    // Nothing enabled in that direction: stay.
    return from;
  }
  return last;
}

/**
 * The list keys while a time list is open: the next active index,
 * `'select'` for Enter, or `null` when the key is not a list key.
 */
export function timeListKey(key: string, count: number, active: number, disabled: (i: number) => boolean): number | 'select' | null {
  switch (key) {
    case 'ArrowUp':
      return stepOption(count, active, -1, disabled);
    case 'ArrowDown':
      return stepOption(count, active, 1, disabled);
    case 'PageUp':
      return stepOption(count, active, -8, disabled);
    case 'PageDown':
      return stepOption(count, active, 8, disabled);
    case 'Home':
      return stepOption(count, -1, 1, disabled);
    case 'End':
      return stepOption(count, count, -1, disabled);
    case 'Enter':
      return 'select';
    default:
      return null;
  }
}

