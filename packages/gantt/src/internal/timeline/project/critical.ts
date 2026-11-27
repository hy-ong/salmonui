// Critical path: a backward pass over the scheduled
// tasks in reverse topological order of the engine graph (dependency links,
// parent gates and roll-ups), giving each task its late finish, total float
// (late finish minus early finish in working ms on the task's calendar) and
// free float (the working ms a task can slip before it moves a successor or
// the project finish). Leaves with total float <= 0 are critical; a parent is
// critical when a child is. One pass over typed arrays, no per-task closures.
// Pure: no React, no DOM globals, zero dependencies.

import type { WorkCalendar } from './calendar.js';

/** The engine graph as the critical path reads it; nodes 0..n-1 are tasks (roll-ups), n..2n-1 parent gates. */
export interface CriticalGraph {
  readonly n: number;
  /** Topological order of the 2n nodes. */
  readonly topo: Int32Array;
  readonly parentOf: Int32Array;
  readonly isParent: Uint8Array;
  readonly childStart: Int32Array;
  readonly childList: Int32Array;
  /** Incoming links per task (CSR): predecessor, type code (0 fs, 1 ss, 2 ff, 3 sf), lag in working ms, dropped (cycle). */
  readonly depStart: Int32Array;
  readonly depPred: Int32Array;
  readonly depType: Uint8Array;
  readonly depLag: Float64Array;
  readonly depDropped: Uint8Array;
  readonly start: Float64Array;
  readonly end: Float64Array;
  /** Working ms from start to end (segment gaps included). */
  readonly span: Float64Array;
  readonly unscheduled: Uint8Array;
  readonly calendars: readonly WorkCalendar[];
  /** Project finish override (else the latest scheduled finish). */
  readonly finish?: number | null;
}

export interface CriticalResult {
  readonly finish: number;
  readonly lateFinish: Float64Array;
  readonly totalFloat: Float64Array;
  readonly freeFloat: Float64Array;
  readonly critical: Uint8Array;
}

export function computeCritical(g: CriticalGraph): CriticalResult {
  const { n, topo, parentOf, isParent, childStart, childList, depStart, depPred, depType, depLag, depDropped, start, end, span, unscheduled, calendars } = g;
  let finish = -Infinity;
  for (let i = 0; i < n; i++) if (!unscheduled[i] && !isParent[i] && (end[i] as number) > finish) finish = end[i] as number;
  if (g.finish !== undefined && g.finish !== null && Number.isFinite(g.finish)) finish = Math.max(finish, g.finish);
  const lf = new Float64Array(n).fill(Infinity);
  const gateLs = new Float64Array(n).fill(Infinity);
  const tf = new Float64Array(n);
  const ff = new Float64Array(n).fill(Infinity);
  const critical = new Uint8Array(n);
  if (!Number.isFinite(finish)) return { finish: 0, lateFinish: lf, totalFloat: tf, freeFloat: ff.fill(0), critical };

  // Pushes the late dates of successor `s` (late start `ls`, late finish `lfs`) back to its predecessors.
  const relax = (s: number, ls: number, lfs: number): void => {
    const cs = calendars[s] as WorkCalendar;
    for (let d = depStart[s] as number, e = depStart[s + 1] as number; d < e; d++) {
      if (depDropped[d]) continue;
      const q = depPred[d] as number;
      if (unscheduled[q]) continue;
      const lag = depLag[d] as number;
      const t = depType[d] as number;
      let bound: number;
      if (t === 0) bound = lag ? cs.addWork(ls, -lag) : ls;
      else if (t === 2) bound = lag ? cs.addWork(lfs, -lag) : lfs;
      else {
        const lsq = t === 1 ? (lag ? cs.addWork(ls, -lag) : ls) : lag ? cs.addWork(lfs, -lag) : lfs;
        const sq = span[q] as number;
        bound = sq ? (calendars[q] as WorkCalendar).addWork(lsq, sq) : lsq;
      }
      if (bound < (lf[q] as number)) lf[q] = bound;
    }
  };

  for (let pos = topo.length - 1; pos >= 0; pos--) {
    const v = topo[pos] as number;
    if (v >= n) {
      const p = v - n;
      if (!isParent[p] || unscheduled[p]) continue;
      const ls = gateLs[p] as number;
      relax(p, Number.isFinite(ls) ? ls : (start[p] as number), lf[p] as number);
      const pp = parentOf[p] as number;
      if (pp >= 0 && ls < (gateLs[pp] as number)) gateLs[pp] = ls;
      continue;
    }
    if (unscheduled[v]) continue;
    let late = Math.min(lf[v] as number, finish);
    const p = parentOf[v] as number;
    if (p >= 0 && (lf[p] as number) < late) late = lf[p] as number;
    lf[v] = late;
    if (isParent[v]) continue; // a parent relaxes its predecessors from its gate
    const cal = calendars[v] as WorkCalendar;
    const sv = span[v] as number;
    const ls = sv ? cal.addWork(late, -sv) : late;
    if (p >= 0 && ls < (gateLs[p] as number)) gateLs[p] = ls;
    relax(v, ls, late);
  }

  // Total float of leaves; parents take the smallest float of their children (children follow parents in tree order).
  for (let i = n - 1; i >= 0; i--) {
    if (unscheduled[i]) continue;
    if (isParent[i]) {
      let min = Infinity;
      let crit = 0;
      for (let k = childStart[i] as number, e = childStart[i + 1] as number; k < e; k++) {
        const c = childList[k] as number;
        if (unscheduled[c]) continue;
        if ((tf[c] as number) < min) min = tf[c] as number;
        if (critical[c]) crit = 1;
      }
      tf[i] = Number.isFinite(min) ? min : 0;
      critical[i] = crit;
      continue;
    }
    const t = (calendars[i] as WorkCalendar).workBetween(end[i] as number, lf[i] as number);
    tf[i] = t;
    critical[i] = t <= 0 ? 1 : 0;
  }

  // Free float: the gap to the nearest successor bound, else to the project finish.
  for (let s = 0; s < n; s++) {
    if (unscheduled[s]) continue;
    const cs = calendars[s] as WorkCalendar;
    for (let d = depStart[s] as number, e = depStart[s + 1] as number; d < e; d++) {
      if (depDropped[d]) continue;
      const q = depPred[d] as number;
      if (unscheduled[q]) continue;
      const lag = depLag[d] as number;
      const t = depType[d] as number;
      const from = t === 0 || t === 2 ? (end[q] as number) : (start[q] as number);
      const base = lag ? cs.addWork(from, lag) : from;
      const gap = cs.workBetween(base, t < 2 ? (start[s] as number) : (end[s] as number));
      if (gap < (ff[q] as number)) ff[q] = gap;
    }
  }
  for (let i = 0; i < n; i++) {
    if (unscheduled[i]) {
      ff[i] = 0;
      continue;
    }
    const toFinish = (calendars[i] as WorkCalendar).workBetween(end[i] as number, finish);
    if (toFinish < (ff[i] as number)) ff[i] = toFinish;
    if ((ff[i] as number) < 0) ff[i] = 0;
  }
  return { finish, lateFinish: lf, totalFloat: tf, freeFloat: ff, critical };
}
