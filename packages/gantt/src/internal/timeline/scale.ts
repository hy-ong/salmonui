// Linear time scale of the Gantt chart (layer `timeline`): calendar units
// (year .. minute), tier presets and zoom levels, the px position of a wall
// time, and the header cells of one tier inside a px window (horizontal
// virtualization). Times are floating wall-clock ms like `axis.ts`; the
// scale is linear in calendar time (non-working days keep their width).
// Pure: no React, no DOM, zero dependencies.

import { DAY, HOUR, MINUTE } from '@salmonui/core/internal/timeline/axis';

export type ScaleUnit = 'year' | 'month' | 'week' | 'day' | 'hour' | 'minute';

/** One header tier: cells of `count` units. */
export interface TierSpec {
  readonly unit: ScaleUnit;
  readonly count: number;
}

/** A zoom level: two tiers and the width of one bottom-tier cell. */
export interface ZoomLevel {
  readonly level: number;
  readonly top: TierSpec | null;
  readonly bottom: TierSpec;
  readonly unitWidth: number;
}

const t = (unit: ScaleUnit, count = 1): TierSpec => ({ unit, count });
const z = (level: number, top: TierSpec, bottom: TierSpec, unitWidth: number): ZoomLevel => ({ level, top, bottom, unitWidth });

/** Built-in zoom levels, coarse to fine. Level 7 is `timeline.mode: 'week'` at 33 px. */
export const ZOOM_LEVELS: readonly ZoomLevel[] = [
  z(0, t('year'), t('month', 6), 66),
  z(1, t('year'), t('month', 3), 66),
  z(2, t('year'), t('month'), 33),
  z(3, t('year'), t('month'), 66),
  z(4, t('month'), t('week'), 33),
  z(5, t('month'), t('week'), 66),
  z(6, t('week'), t('day'), 20),
  z(7, t('week'), t('day'), 33),
  z(8, t('week'), t('day'), 66),
  z(9, t('day'), t('hour', 12), 66),
  z(10, t('day'), t('hour', 6), 66),
  z(11, t('day'), t('hour', 2), 66),
  z(12, t('day'), t('hour'), 66),
  z(13, t('hour'), t('minute', 30), 66),
  z(14, t('hour'), t('minute', 15), 66),
  z(15, t('hour'), t('minute', 5), 66),
];

/** `timeline.mode` presets. */
export const VIEW_MODES: Readonly<Record<'hour' | 'day' | 'week' | 'month' | 'year', ZoomLevel>> = {
  hour: z(-1, t('hour'), t('minute', 30), 66),
  day: z(-1, t('day'), t('hour'), 33),
  week: ZOOM_LEVELS[7] as ZoomLevel,
  month: z(-1, t('month'), t('week'), 66),
  year: z(-1, t('year'), t('month'), 66),
};

/** Mean length of one unit in ms (month and year are mean Gregorian lengths). */
export function unitLength(unit: ScaleUnit): number {
  switch (unit) {
    case 'minute':
      return MINUTE;
    case 'hour':
      return HOUR;
    case 'day':
      return DAY;
    case 'week':
      return 7 * DAY;
    case 'month':
      return 30.436875 * DAY;
    default:
      return 365.2425 * DAY;
  }
}

/** Start of the unit (of `count` units, aligned from the epoch, or from January / the hour for month and minute counts) that contains `wall`. */
export function startOfUnit(wall: number, unit: ScaleUnit, count = 1, weekStart = 0): number {
  const n = Math.max(1, count | 0);
  if (unit === 'minute') {
    const hour = Math.floor(wall / HOUR) * HOUR;
    return hour + Math.floor((wall - hour) / (n * MINUTE)) * n * MINUTE;
  }
  if (unit === 'hour') {
    const day = Math.floor(wall / DAY) * DAY;
    return day + Math.floor((wall - day) / (n * HOUR)) * n * HOUR;
  }
  const day = Math.floor(wall / DAY);
  if (unit === 'day') return day * DAY;
  // Day 0 (1970-01-01) is a Thursday (weekday 4).
  if (unit === 'week') return (day - ((((day + 4 - weekStart) % 7) + 7) % 7)) * DAY;
  const d = new Date(day * DAY);
  const year = d.getUTCFullYear();
  if (unit === 'year') return Date.UTC(year - (((year % n) + n) % n), 0, 1);
  const month = d.getUTCMonth();
  return Date.UTC(year, month - (month % n), 1);
}

/** `wall` plus `n` units (calendar arithmetic for month and year). */
export function addUnits(wall: number, unit: ScaleUnit, n: number): number {
  if (unit === 'month' || unit === 'year') {
    const d = new Date(wall);
    const months = unit === 'year' ? n * 12 : n;
    return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + months, d.getUTCDate(), d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds(), d.getUTCMilliseconds());
  }
  return wall + n * unitLength(unit);
}

/** A linear scale over [start, end) of wall ms at `pxPerMs`. */
export interface TimeScale {
  readonly start: number;
  readonly end: number;
  readonly pxPerMs: number;
  /** Total width in px. */
  readonly width: number;
  readonly level: ZoomLevel;
  readonly weekStart: number;
}

/**
 * The scale of a zoom level over a date range: the range is widened to whole
 * top-tier units (whole bottom units without a top tier), plus `padUnits`
 * bottom-tier cells on each side.
 */
export function createScale(rangeStart: number, rangeEnd: number, level: ZoomLevel, weekStart = 0, padUnits = 2): TimeScale {
  const outer = level.top ?? level.bottom;
  const b = level.bottom;
  const s = startOfUnit(addUnits(rangeStart, b.unit, -padUnits * b.count), outer.unit, outer.count, weekStart);
  const lastStart = startOfUnit(addUnits(Math.max(rangeEnd, rangeStart + 1), b.unit, padUnits * b.count), outer.unit, outer.count, weekStart);
  const e = addUnits(lastStart, outer.unit, outer.count);
  const pxPerMs = level.unitWidth / (unitLength(b.unit) * b.count);
  return { start: s, end: e, pxPerMs, width: Math.round((e - s) * pxPerMs), level, weekStart };
}

/** px position of a wall time. */
export const xOf = (scale: TimeScale, wall: number): number => (wall - scale.start) * scale.pxPerMs;

/** Wall time at a px position. */
export const timeAt = (scale: TimeScale, x: number): number => scale.start + x / scale.pxPerMs;

/** A header cell: [start, end) wall ms at [x, x + width) px. */
export interface ScaleCell {
  readonly start: number;
  readonly end: number;
  readonly x: number;
  readonly width: number;
}

/** Cells of one tier that intersect the px window [from, to) (horizontal virtualization). */
export function tierCells(scale: TimeScale, tier: TierSpec, from: number, to: number): ScaleCell[] {
  const out: ScaleCell[] = [];
  const lo = Math.max(scale.start, timeAt(scale, Math.max(0, from)));
  const hi = Math.min(scale.end, timeAt(scale, Math.min(scale.width, to)));
  let s = Math.max(scale.start, startOfUnit(lo, tier.unit, tier.count, scale.weekStart));
  // Cells are capped so a pathological window can never loop forever.
  for (let i = 0; s < hi && i < 10_000; i++) {
    const next = Math.min(scale.end, addUnits(startOfUnit(s, tier.unit, tier.count, scale.weekStart), tier.unit, tier.count));
    if (next <= s) break;
    const x = xOf(scale, s);
    out.push({ start: s, end: next, x, width: xOf(scale, next) - x });
    s = next;
  }
  return out;
}

/** The zoom level index nearest to a level (for `zoomIn` / `zoomOut` from a custom or preset level). */
export function nearestLevel(level: ZoomLevel, levels: readonly ZoomLevel[] = ZOOM_LEVELS): number {
  if (level.level >= 0 && level.level < levels.length && levels[level.level] === level) return level.level;
  const target = (unitLength(level.bottom.unit) * level.bottom.count) / level.unitWidth;
  let best = 0;
  let bestDiff = Number.POSITIVE_INFINITY;
  levels.forEach((l, i) => {
    const diff = Math.abs(Math.log((unitLength(l.bottom.unit) * l.bottom.count) / l.unitWidth / target));
    if (diff < bestDiff) {
      bestDiff = diff;
      best = i;
    }
  });
  return best;
}

/**
 * Zoom to fit: the finest level whose scale shows [start, end) in
 * `width` px, with its unit width stretched so the range fills the width.
 */
export function fitLevel(start: number, end: number, width: number, levels: readonly ZoomLevel[] = ZOOM_LEVELS): ZoomLevel {
  const span = Math.max(HOUR, end - start);
  const usable = Math.max(100, width);
  for (let i = levels.length - 1; i >= 0; i--) {
    const l = levels[i] as ZoomLevel;
    const unitMs = unitLength(l.bottom.unit) * l.bottom.count;
    // Room for the 2 padding cells on each side.
    if ((span / unitMs + 4) * l.unitWidth <= usable) {
      const unitWidth = Math.max(l.unitWidth, Math.floor(usable / (span / unitMs + 4)));
      return { level: l.level, top: l.top, bottom: l.bottom, unitWidth };
    }
  }
  return levels[0] as ZoomLevel;
}
