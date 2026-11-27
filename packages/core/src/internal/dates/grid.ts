// Month, year and decade grids: the 42
// day cells of a month view (six weeks from the first day of week), the 12
// months of a year view and the 12 years of a decade view (the decade plus
// one edge year on each side). Cells are day numbers; outside cells are
// flagged by comparing calendar fields.

import type { CalendarSystem } from './calendars.js';
import { weekStart } from './week.js';

/** The 42 day numbers shown for the month containing day number `n`, starting on `firstDay`. */
export function monthGrid(sys: CalendarSystem, n: number, firstDay: number): number[] {
  const f = sys.fields(n);
  const start = weekStart(sys.start(f.year, f.month), firstDay);
  return Array.from({ length: 42 }, (_, i) => start + i);
}

/** First day numbers of the 12 months of the year containing `n`. */
export function yearGrid(sys: CalendarSystem, n: number): number[] {
  const y = sys.fields(n).year;
  return Array.from({ length: 12 }, (_, i) => sys.start(y, i + 1));
}

/** First day numbers of the 12 years shown for the decade containing `n` (one edge year on each side). */
export function decadeGrid(sys: CalendarSystem, n: number): number[] {
  const first = Math.floor(sys.fields(n).year / 10) * 10 - 1;
  return Array.from({ length: 12 }, (_, i) => sys.start(first + i, 1));
}
