// Duration and work strings: `'3 days'`,
// `'1 hour'`, `'30 minutes'` with localized unit words, and the parser of
// typed durations (`'3 days'`, `'2h'`, `'30 min'`, `'1.5d'`, a bare number in
// the field's unit). Pure: no React, no DOM globals, zero dependencies.

import { formatNumber, lagUnitOf } from './dependencies.js';
import type { DurationUnit } from './types.js';

/** Localized unit words (singular and plural); English defaults. */
export interface DurationText {
  readonly minute?: string;
  readonly minutes?: string;
  readonly hour?: string;
  readonly hours?: string;
  readonly day?: string;
  readonly days?: string;
}

const EN: Required<DurationText> = { minute: 'minute', minutes: 'minutes', hour: 'hour', hours: 'hours', day: 'day', days: 'days' };

/** `'3 days'`: the value rounded to 4 decimals with the unit word. */
export function formatDurationValue(value: number, unit: DurationUnit, text?: DurationText): string {
  const t = { ...EN, ...text };
  const one = Math.abs(value) === 1;
  const word = unit === 'day' ? (one ? t.day : t.days) : unit === 'hour' ? (one ? t.hour : t.hours) : one ? t.minute : t.minutes;
  return `${formatNumber(value)} ${word}`;
}

/**
 * A typed duration: a number with an optional unit word (localized words from
 * `text` first, then the English words and abbreviations); without a word
 * the value is in `unit`. Null when the text is not a duration.
 */
export function parseDurationText(text: string, unit: DurationUnit, words?: DurationText): { value: number; unit: DurationUnit } | null {
  const m = /^\s*(-?\d+(?:[.,]\d+)?)\s*(.*?)\s*$/.exec(text);
  if (!m) return null;
  const value = Number((m[1] as string).replace(',', '.'));
  if (!Number.isFinite(value) || value < 0) return null;
  const word = (m[2] as string).toLowerCase();
  if (!word) return { value, unit };
  if (words) {
    const w = words;
    if (word === w.day?.toLowerCase() || word === w.days?.toLowerCase()) return { value, unit: 'day' };
    if (word === w.hour?.toLowerCase() || word === w.hours?.toLowerCase()) return { value, unit: 'hour' };
    if (word === w.minute?.toLowerCase() || word === w.minutes?.toLowerCase()) return { value, unit: 'minute' };
  }
  const u = lagUnitOf(word);
  return u ? { value, unit: u } : null;
}
