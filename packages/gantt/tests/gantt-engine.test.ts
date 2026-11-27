import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createWorkCalendar } from '../dist/internal/timeline/project/calendar.js';
import { computeCritical } from '../dist/internal/timeline/project/critical.js';
import { formatDependencies, parseDependencies } from '../dist/internal/timeline/project/dependencies.js';
import { createProjectEngine } from '../dist/internal/timeline/project/engine.js';
import { attachHistory, createHistory } from '../dist/internal/timeline/project/history.js';
import { overAllocations, resourceRows, stackLanes } from '../dist/internal/timeline/project/resources.js';
import { dateOf, wallOf } from '../dist/gantt/fields.js';

// The framework-agnostic Gantt project engine (project subsystem of `internal/timeline`).

const at = (iso: string): number => Date.parse(`${iso}Z`);
const iso = (ms: number | null): string => (ms === null ? 'null' : new Date(ms).toISOString().slice(0, 16));
const H = 3_600_000;
const DAYW = 9 * H; // one working day of the default calendar
const MON = '2026-11-23';
const dep = (id: string, type: 'fs' | 'ss' | 'ff' | 'sf' = 'fs', lag = 0, lagUnit: 'day' | 'hour' | 'minute' = 'day') => ({ id, type, lag, lagUnit });
const task = (id: string, extra: Record<string, unknown> = {}) => ({ id, parentId: null, ...extra });

describe('time conversion', () => {
  it('converts row dates to wall ms in a zone and back to instants', () => {
    assert.equal(wallOf('2026-11-23T08:00', undefined), at('2026-11-23T08:00'));
    assert.equal(wallOf('2026-11-23T08:00:00Z', 'Asia/Tokyo'), at('2026-11-23T17:00'));
    assert.equal(wallOf(new Date(at('2026-11-23T00:00')), 'UTC'), at('2026-11-23T00:00'));
    assert.equal(wallOf(at('2026-11-23T00:00'), 'UTC'), at('2026-11-23T00:00'), 'a number is an epoch instant');
    assert.equal(wallOf('', 'UTC'), null);
    assert.equal(wallOf('nope', 'UTC'), null);
    assert.equal(dateOf(at('2026-11-23T17:00'), 'Asia/Tokyo').toISOString(), '2026-11-23T08:00:00.000Z');
    assert.equal(dateOf(at('2026-11-23T08:30'), 'UTC').toISOString(), '2026-11-23T08:30:00.000Z');
    assert.equal(wallOf(dateOf(at('2026-11-23T08:30'), 'Europe/Berlin'), 'Europe/Berlin'), at('2026-11-23T08:30'));
  });
});

describe('working time and calendars', () => {
  it('defaults to 08:00-17:00 Monday to Friday', () => {
    const c = createWorkCalendar();
    assert.equal(c.hoursPerDay, 9);
    assert.equal(c.isWorking(at(`${MON}T08:00`)), true);
    assert.equal(c.isWorking(at(`${MON}T17:00`)), false);
    assert.equal(c.isWorkingDay(Math.floor(at('2026-11-28T00:00') / 86_400_000)), false);
    assert.equal(iso(c.nextWorkingStart(at('2026-11-27T17:00'))), '2026-11-30T08:00');
    assert.equal(iso(c.prevWorkingEnd(at('2026-11-30T08:00'))), '2026-11-27T17:00');
    assert.equal(iso(c.addWork(at(`${MON}T08:00`), DAYW)), `${MON}T17:00`);
    assert.equal(iso(c.addWork(at(`${MON}T08:00`), 5 * DAYW)), '2026-11-27T17:00');
    assert.equal(iso(c.addWork(at('2026-11-27T17:00'), 1 * H)), '2026-11-30T09:00');
    assert.equal(iso(c.addWork(at('2026-11-30T08:00'), -DAYW)), '2026-11-27T08:00');
    assert.equal(c.workBetween(at(`${MON}T08:00`), at('2026-11-30T08:00')), 5 * DAYW);
    assert.equal(c.workBetween(at('2026-11-30T08:00'), at(`${MON}T08:00`)), -5 * DAYW);
    assert.equal(c.unitMs('week'), 5 * DAYW);
    assert.equal(c.toWorkMs(2, 'day'), 2 * DAYW);
    assert.equal(c.fromWorkMs(DAYW / 2, 'day'), 0.5);
  });
  it('honours day ranges, per-weekday hours, work days and includeWeekend', () => {
    const c = createWorkCalendar({ dayRanges: [{ from: 9, to: 12 }, { from: 13, to: 17.5 }], week: { 6: [{ from: 10, to: 12 }] }, hoursPerDay: 8 });
    assert.equal(c.hoursPerDay, 8);
    assert.equal(c.isWorking(at(`${MON}T12:30`)), false);
    assert.equal(c.isWorking(at('2026-11-28T11:00')), true); // Saturday hours
    assert.deepEqual(c.rangesOf(Math.floor(at(`${MON}T00:00`) / 86_400_000)).map(iso), [`${MON}T09:00`, `${MON}T12:00`, `${MON}T13:00`, `${MON}T17:30`]);
    const w = createWorkCalendar({ includeWeekend: true });
    assert.equal(w.isWorking(at('2026-11-29T10:00')), true);
    const four = createWorkCalendar({ workDays: [1, 2, 3, 4] });
    assert.equal(iso(four.nextWorkingStart(at('2026-11-27T10:00'))), '2026-11-30T08:00');
  });
  it('holidays and working exceptions', () => {
    const c = createWorkCalendar(undefined, [
      { start: at('2026-11-24T00:00'), end: at('2026-11-25T00:00') },
      { start: at('2026-11-28T00:00'), end: at('2026-11-29T00:00'), ranges: [{ from: 9, to: 13 }] },
    ]);
    assert.equal(c.isWorking(at('2026-11-24T10:00')), false);
    assert.equal(iso(c.addWork(at(`${MON}T08:00`), 2 * DAYW)), '2026-11-25T17:00');
    assert.equal(c.isWorking(at('2026-11-28T10:00')), true);
  });
  it('a calendar without working time never loops', () => {
    const c = createWorkCalendar({ workDays: [] });
    assert.equal(c.isWorking(at('2026-11-28T03:00')), true); // falls back to all-day working time
    const all = createWorkCalendar(undefined, [{ start: at('2000-01-01T00:00'), end: at('2100-01-01T00:00') }]);
    const t = at(`${MON}T08:00`);
    assert.equal(typeof all.nextWorkingStart(t), 'number');
    assert.equal(typeof all.addWork(t, DAYW), 'number');
  });
  it('per-task calendars and the project calendar', () => {
    const e = createProjectEngine({
      calendars: [{ id: 'night', workingTime: { dayRanges: [{ from: 20, to: 24 }] } }, { id: 'weekend', workingTime: { includeWeekend: true } }],
      projectCalendar: 'weekend',
    });
    e.load([task('a', { start: at('2026-11-28T00:00'), duration: 1 }), task('b', { start: at(`${MON}T00:00`), duration: 1, calendar: 'night' })]);
    assert.equal(iso(e.getSchedule('a')!.start), '2026-11-28T08:00');
    assert.equal(iso(e.getSchedule('b')!.start), `${MON}T20:00`);
    assert.equal(iso(e.getSchedule('b')!.end), '2026-11-24T00:00');
    assert.equal(e.calendarOf(null).isWorking(at('2026-11-29T10:00')), true);
  });
});

describe('dependency strings', () => {
  it('parses the string form and objects', () => {
    assert.deepEqual(parseDependencies('2'), [dep('2')]);
    assert.deepEqual(parseDependencies('2FS+3d, 3ss-2h,4FF+30m,5SF+1 days'), [dep('2', 'fs', 3), dep('3', 'ss', -2, 'hour'), dep('4', 'ff', 30, 'minute'), dep('5', 'sf', 1)]);
    assert.deepEqual(parseDependencies('T-1SS'), [dep('T-1', 'ss')]);
    assert.deepEqual(parseDependencies('7+2', { defaultLagUnit: 'hour' }), [dep('7', 'fs', 2, 'hour')]);
    assert.deepEqual(parseDependencies([{ id: 9, type: 'SF', lag: 2, lagUnit: 'h' }]), [dep('9', 'sf', 2, 'hour')]);
    assert.deepEqual(parseDependencies(null), []);
    assert.equal(formatDependencies([dep('2', 'fs', 3), dep('3', 'ss', -2, 'hour'), dep('4')]), '2FS+3d,3SS-2h,4FS');
  });
});

describe('auto scheduling and milestones', () => {
  it('derives the missing value on working time', () => {
    const e = createProjectEngine();
    e.load([
      task('a', { start: at(`${MON}T00:00`), duration: 2 }),
      task('b', { start: at(`${MON}T00:00`), end: at('2026-11-26T00:00') }),
      task('c', { end: at('2026-11-27T17:00'), duration: 1 }),
      task('d', { start: at('2026-11-28T10:00'), duration: 4, durationUnit: 'hour' }),
      task('m', { start: at('2026-11-27T17:00'), milestone: true }),
      task('z', { start: at(`${MON}T10:00`), duration: 0 }),
    ]);
    assert.equal(iso(e.getSchedule('a')!.start), `${MON}T08:00`);
    assert.equal(iso(e.getSchedule('a')!.end), '2026-11-24T17:00');
    assert.equal(e.getSchedule('b')!.duration, 3);
    assert.equal(iso(e.getSchedule('b')!.end), '2026-11-25T17:00');
    assert.equal(iso(e.getSchedule('c')!.start), '2026-11-27T08:00');
    assert.equal(iso(e.getSchedule('d')!.start), '2026-11-30T08:00');
    assert.equal(iso(e.getSchedule('d')!.end), '2026-11-30T12:00');
    const m = e.getSchedule('m')!;
    assert.equal(m.milestone, true);
    assert.equal(m.start, m.end);
    assert.equal(iso(m.start), '2026-11-27T17:00');
    assert.equal(e.getSchedule('z')!.milestone, true);
    e.convertToTask('z');
    assert.equal(e.getSchedule('z')!.milestone, false);
    assert.equal(e.getSchedule('z')!.duration, 1);
    e.convertToMilestone('a');
    assert.equal(e.getSchedule('a')!.milestone, true);
    assert.equal(e.getSchedule('a')!.duration, 0);
  });
  it('autoSchedule: false keeps data dates', () => {
    const e = createProjectEngine({ autoSchedule: false });
    e.load([task('a', { start: at('2026-11-28T00:00'), end: at('2026-11-29T00:00') }), task('b', { start: at(`${MON}T00:00`), duration: 1, predecessors: [dep('a')] })]);
    assert.equal(iso(e.getSchedule('a')!.start), '2026-11-28T00:00');
    assert.equal(iso(e.getSchedule('b')!.start), `${MON}T00:00`);
  });
});

describe('dependencies with lag', () => {
  const load = (b: Record<string, unknown>, options = {}) => {
    const e = createProjectEngine(options);
    e.load([task('a', { start: at(`${MON}T08:00`), duration: 2 }), task('b', { start: at(`${MON}T08:00`), duration: 1, ...b })]);
    return e;
  };
  it('FS, SS, FF, SF with working-time lag and lead', () => {
    assert.equal(iso(load({ predecessors: [dep('a')] }).getSchedule('b')!.start), '2026-11-25T08:00');
    assert.equal(iso(load({ predecessors: [dep('a', 'fs', 2)] }).getSchedule('b')!.start), '2026-11-27T08:00');
    assert.equal(iso(load({ predecessors: [dep('a', 'fs', 3, 'hour')] }).getSchedule('b')!.start), '2026-11-25T11:00');
    assert.equal(iso(load({ predecessors: [dep('a', 'fs', -1)] }).getSchedule('b')!.start), '2026-11-24T08:00');
    assert.equal(iso(load({ predecessors: [dep('a', 'ss', 1)] }).getSchedule('b')!.start), '2026-11-24T08:00');
    assert.equal(iso(load({ predecessors: [dep('a', 'ff')] }).getSchedule('b')!.end), '2026-11-24T17:00');
    assert.equal(iso(load({ predecessors: [dep('a', 'sf', 2)] }).getSchedule('b')!.end), '2026-11-24T17:00');
  });
  it('disallowed dependency types are ignored', () => {
    assert.equal(iso(load({ predecessors: [dep('a')] }, { dependencyTypes: ['ss'] }).getSchedule('b')!.start), `${MON}T08:00`);
  });
  it('propagates transitively and incrementally', () => {
    const e = createProjectEngine();
    e.load([task('a', { start: at(`${MON}T08:00`), duration: 1 }), task('b', { duration: 1, predecessors: [dep('a')] }), task('c', { duration: 1, predecessors: [dep('b')] }), task('x', { start: at(`${MON}T08:00`), duration: 1 })]);
    assert.equal(iso(e.getSchedule('c')!.start), '2026-11-25T08:00');
    const seen: (ReadonlySet<string> | null)[] = [];
    e.subscribe((c) => seen.push(c));
    const v = e.version;
    const r = e.update('a', { start: at('2026-11-24T08:00') });
    assert.deepEqual([...r.changed].sort(), ['a', 'b', 'c']);
    assert.equal(iso(e.getSchedule('c')!.start), '2026-11-26T08:00');
    assert.ok(e.version > v);
    assert.deepEqual([...seen[0]!].sort(), ['a', 'b', 'c']);
    assert.deepEqual(e.successorsOf('a'), ['b']);
  });
  it('parent dependencies apply to descendants; parentDependencies: false drops them', () => {
    const data = [
      task('a', { start: at(`${MON}T08:00`), duration: 2 }),
      task('p', { predecessors: [dep('a')] }),
      { id: 'c1', parentId: 'p', start: at(`${MON}T08:00`), duration: 1 },
      { id: 'c2', parentId: 'p', start: at(`${MON}T08:00`), duration: 1 },
      task('s', { start: at(`${MON}T08:00`), duration: 1, predecessors: [dep('p')] }),
    ];
    const e = createProjectEngine();
    e.load(data);
    assert.equal(iso(e.getSchedule('c1')!.start), '2026-11-25T08:00');
    assert.equal(iso(e.getSchedule('p')!.start), '2026-11-25T08:00');
    assert.equal(iso(e.getSchedule('s')!.start), '2026-11-26T08:00');
    const off = createProjectEngine({ parentDependencies: false });
    off.load(data);
    assert.equal(iso(off.getSchedule('c1')!.start), `${MON}T08:00`);
    assert.equal(iso(off.getSchedule('s')!.start), `${MON}T08:00`);
  });
  it('a cycle ignores the closing link and reports it', () => {
    const e = createProjectEngine();
    e.load([task('a', { start: at(`${MON}T08:00`), duration: 1, predecessors: [dep('c')] }), task('b', { duration: 1, predecessors: [dep('a')] }), task('c', { duration: 1, predecessors: [dep('b')] })]);
    assert.equal(iso(e.getSchedule('a')!.start), `${MON}T08:00`);
    assert.equal(iso(e.getSchedule('c')!.start), '2026-11-25T08:00');
    const cyc = [...e.getSchedules()].flatMap((s) => s.conflicts);
    assert.equal(cyc.length, 1);
    assert.equal(cyc[0]!.kind, 'dependency');
    // A new link that closes a cycle is rejected.
    const e2 = createProjectEngine();
    e2.load([task('a', { start: at(`${MON}T08:00`), duration: 1 }), task('b', { duration: 1, predecessors: [dep('a')] })]);
    const r = e2.addDependency('a', dep('b'));
    assert.equal(r.changed.size, 0);
    assert.equal(r.conflicts.length, 1);
    assert.equal(e2.getTask('a')!.predecessors, undefined);
  });
});

describe('predecessor validation, lag recalculation, manual linking', () => {
  const data = () => [task('a', { start: at(`${MON}T08:00`), duration: 2 }), task('b', { start: at('2026-11-25T08:00'), duration: 1, predecessors: [dep('a')] })];
  it('a taskbar start before the predecessor allows is rejected with validation', () => {
    const e = createProjectEngine();
    e.load(data());
    const r = e.update('b', { start: at(`${MON}T08:00`) }, { source: 'taskbar' });
    assert.equal(r.changed.size, 0);
    assert.equal(r.conflicts.length, 1);
    assert.equal(r.conflicts[0]!.predecessorId, 'a');
    assert.equal(iso(r.conflicts[0]!.earliestStart), '2026-11-25T08:00');
    assert.equal(iso(e.getTask('b')!.start!), '2026-11-25T08:00');
    // validate: false commits and moves to the earliest allowed start.
    const ok = e.update('b', { start: at(`${MON}T08:00`) }, { source: 'taskbar', validate: false });
    assert.ok(ok.changed.size >= 0);
    assert.equal(iso(e.getSchedule('b')!.start), '2026-11-25T08:00');
    // Later is fine.
    e.update('b', { start: at('2026-11-26T08:00') }, { source: 'taskbar' });
    assert.equal(iso(e.getSchedule('b')!.start), '2026-11-26T08:00');
  });
  it('preview reports without committing', () => {
    const e = createProjectEngine();
    e.load(data());
    const before = e.getSchedule('b');
    const v = e.version;
    const p = e.preview('a', { start: at('2026-11-24T08:00') });
    assert.equal(iso(p.schedules.get('b')!.start), '2026-11-26T08:00');
    assert.equal(e.getSchedule('b'), before);
    assert.equal(e.version, v);
    assert.equal(iso(e.getTask('a')!.start!), `${MON}T08:00`);
  });
  it('updateOnTaskbarEdit rewrites the lag; normalizeOnLoad rewrites lags from data dates', () => {
    const e = createProjectEngine({ dependencyLag: { updateOnTaskbarEdit: true } });
    e.load(data());
    const r = e.update('b', { start: at('2026-11-24T08:00') }, { source: 'taskbar' });
    assert.equal(r.conflicts.length, 0);
    assert.equal(e.getTask('b')!.predecessors![0]!.lag, -1);
    assert.equal(iso(e.getSchedule('b')!.start), '2026-11-24T08:00');
    const n = createProjectEngine({ dependencyLag: { normalizeOnLoad: true } });
    n.load([task('a', { start: at(`${MON}T08:00`), duration: 2 }), task('b', { start: at('2026-11-27T08:00'), duration: 1, predecessors: [dep('a')] })]);
    assert.equal(n.getTask('b')!.predecessors![0]!.lag, 2);
  });
  it('manual successors are not moved unless validateManualTasks', () => {
    const rows = [task('a', { start: at(`${MON}T08:00`), duration: 2 }), task('b', { start: at(`${MON}T08:00`), duration: 1, manual: true, predecessors: [dep('a')] })];
    const e = createProjectEngine({ taskMode: 'custom' });
    e.load(rows);
    assert.equal(iso(e.getSchedule('b')!.start), `${MON}T08:00`);
    assert.equal(e.getSchedule('b')!.conflicts.length, 1);
    const v = createProjectEngine({ taskMode: 'custom', validateManualTasks: true });
    v.load(rows);
    assert.equal(iso(v.getSchedule('b')!.start), '2026-11-25T08:00');
  });
});

describe('task modes and parent roll-ups', () => {
  const rows = () => [
    task('p', { start: at('2026-12-01T08:00'), end: at('2026-12-02T17:00'), manual: true }),
    { id: 'c1', parentId: 'p', start: at(`${MON}T08:00`), duration: 2, progress: 50 },
    { id: 'c2', parentId: 'p', start: at('2026-11-25T08:00'), duration: 2, progress: 100 },
    { id: 'm', parentId: 'p', start: at('2026-11-27T08:00'), milestone: true, progress: 0 },
  ];
  it('auto parents span their children with weighted progress', () => {
    const e = createProjectEngine();
    e.load(rows());
    const p = e.getSchedule('p')!;
    assert.equal(p.parent, true);
    assert.equal(iso(p.start), `${MON}T08:00`);
    assert.equal(iso(p.end), '2026-11-27T08:00'); // the milestone is part of the range
    assert.equal(p.duration, 4);
    assert.equal(p.progress, 75);
    e.update('c2', { progress: 0 });
    assert.equal(e.getSchedule('p')!.progress, 25);
  });
  it('manual parents keep their dates and expose the roll-up range', () => {
    const e = createProjectEngine({ taskMode: 'custom' });
    e.load(rows());
    const p = e.getSchedule('p')!;
    assert.equal(p.manual, true);
    assert.equal(iso(p.start), '2026-12-01T08:00');
    assert.equal(iso(p.rollupStart), `${MON}T08:00`);
    assert.equal(iso(p.rollupEnd), '2026-11-27T08:00');
    const all = createProjectEngine({ taskMode: 'manual' });
    all.load([task('a', { start: at('2026-11-28T00:00'), duration: 1 })]);
    assert.equal(iso(all.getSchedule('a')!.start), '2026-11-28T00:00');
    e.setTaskMode('c1', true);
    assert.equal(e.getSchedule('c1')!.manual, true);
  });
  it('moving an auto parent shifts its children', () => {
    const e = createProjectEngine();
    e.load(rows());
    e.update('p', { start: at('2026-11-24T08:00') });
    assert.equal(iso(e.getSchedule('c1')!.start), '2026-11-24T08:00');
    assert.equal(iso(e.getSchedule('c2')!.start), '2026-11-26T08:00');
  });
});

describe('task types and work', () => {
  const res = [{ id: 'r1', unit: 100 }, { id: 'r2', unit: 50 }];
  it('work = duration x units in the work unit', () => {
    const e = createProjectEngine();
    e.load([task('a', { start: at(`${MON}T08:00`), duration: 2, resources: res })]);
    assert.equal(e.getSchedule('a')!.work, 27);
    assert.equal(e.formatWork('a'), '27 hours');
    const d = createProjectEngine({ workUnit: 'day' });
    d.load([task('a', { start: at(`${MON}T08:00`), duration: 2, resources: res })]);
    assert.equal(d.getSchedule('a')!.work, 3);
    const w = createProjectEngine();
    w.load([task('a', { start: at(`${MON}T08:00`), work: 18, resources: [{ id: 'r', unit: 100 }] })]);
    assert.equal(w.getSchedule('a')!.duration, 2);
  });
  it('fixedUnit, fixedWork and fixedDuration', () => {
    const mk = (taskType: string) => {
      const e = createProjectEngine();
      e.load([task('a', { start: at(`${MON}T08:00`), duration: 2, resources: [{ id: 'r', unit: 100 }], taskType })]);
      return e;
    };
    const fu = mk('fixedUnit');
    fu.update('a', { duration: 4 });
    assert.equal(fu.getSchedule('a')!.work, 36);
    fu.update('a', { work: 9 });
    assert.equal(fu.getSchedule('a')!.duration, 1);
    fu.update('a', { resources: [{ id: 'r', unit: 50 }] });
    assert.equal(fu.getSchedule('a')!.duration, 2);
    const fw = mk('fixedWork');
    fw.update('a', { duration: 4 });
    assert.equal(fw.getSchedule('a')!.work, 18);
    assert.equal(fw.getTask('a')!.resources![0]!.unit, 50);
    const fd = mk('fixedDuration');
    fd.update('a', { work: 36 });
    assert.equal(fd.getSchedule('a')!.duration, 2);
    assert.equal(fd.getTask('a')!.resources![0]!.unit, 200);
    fd.update('a', { resources: [{ id: 'r', unit: 100 }] });
    assert.equal(fd.getSchedule('a')!.duration, 2);
    assert.equal(fd.getSchedule('a')!.work, 18);
  });
});

describe('constraints', () => {
  const load = (b: Record<string, unknown>) => {
    const e = createProjectEngine();
    e.load([task('a', { start: at(`${MON}T08:00`), duration: 2 }), task('b', { start: at(`${MON}T08:00`), duration: 1, ...b }), task('z', { start: at(`${MON}T08:00`), duration: 10 })]);
    return e;
  };
  it('SNET, FNET, SNLT, FNLT, MSO, MFO', () => {
    assert.equal(iso(load({ constraintType: 'startNoEarlierThan', constraintDate: at('2026-11-26T08:00') }).getSchedule('b')!.start), '2026-11-26T08:00');
    assert.equal(iso(load({ constraintType: 'finishNoEarlierThan', constraintDate: at('2026-11-26T17:00') }).getSchedule('b')!.start), '2026-11-26T08:00');
    assert.equal(iso(load({ start: at('2026-11-27T08:00'), constraintType: 'startNoLaterThan', constraintDate: at('2026-11-25T08:00') }).getSchedule('b')!.start), '2026-11-25T08:00');
    assert.equal(iso(load({ start: at('2026-11-27T08:00'), constraintType: 'finishNoLaterThan', constraintDate: at('2026-11-25T17:00') }).getSchedule('b')!.start), '2026-11-25T08:00');
    assert.equal(iso(load({ constraintType: 'mustStartOn', constraintDate: at('2026-11-26T08:00') }).getSchedule('b')!.start), '2026-11-26T08:00');
    assert.equal(iso(load({ constraintType: 'mustFinishOn', constraintDate: at('2026-11-26T17:00') }).getSchedule('b')!.start), '2026-11-26T08:00');
  });
  it('conflicts: the dependency wins for SNLT, MSO wins over the dependency', () => {
    const snlt = load({ predecessors: [dep('a')], constraintType: 'startNoLaterThan', constraintDate: at('2026-11-24T08:00') }).getSchedule('b')!;
    assert.equal(iso(snlt.start), '2026-11-25T08:00');
    assert.equal(snlt.conflicts[0]!.kind, 'constraint');
    const mso = load({ predecessors: [dep('a')], constraintType: 'mustStartOn', constraintDate: at('2026-11-24T08:00') }).getSchedule('b')!;
    assert.equal(iso(mso.start), '2026-11-24T08:00');
    assert.equal(mso.conflicts[0]!.kind, 'constraint');
  });
  it('ALAP moves to the latest start the successors and the project finish allow', () => {
    const e = load({ constraintType: 'asLateAsPossible' });
    assert.equal(iso(e.getSchedule('b')!.start), '2026-12-04T08:00');
    const s = createProjectEngine();
    s.load([task('b', { start: at(`${MON}T08:00`), duration: 1, constraintType: 'asLateAsPossible' }), task('c', { start: at('2026-11-26T08:00'), duration: 1, predecessors: [dep('b')] }), task('z', { start: at(`${MON}T08:00`), duration: 10 })]);
    assert.equal(iso(s.getSchedule('b')!.start), '2026-11-25T08:00');
  });
});

describe('unscheduled tasks and project dates', () => {
  it('tasks without dates', () => {
    const e = createProjectEngine({ unscheduledTasks: true });
    e.load([task('a', { start: at(`${MON}T08:00`), duration: 1 }), task('u', { predecessors: [dep('a')] }), task('s', { duration: 1, predecessors: [dep('u')], start: at(`${MON}T08:00`) })]);
    const u = e.getSchedule('u')!;
    assert.equal(u.unscheduled, true);
    assert.equal(u.start, null);
    assert.equal(iso(e.getSchedule('s')!.start), `${MON}T08:00`);
    const d = createProjectEngine({ projectStart: at('2026-11-24T00:00') });
    d.load([task('u')]);
    assert.equal(iso(d.getSchedule('u')!.start), '2026-11-24T08:00');
    assert.equal(d.getSchedule('u')!.duration, 1);
  });
  it('projectRange and setProjectDates', () => {
    const e = createProjectEngine();
    e.load([task('a', { start: at(`${MON}T08:00`), duration: 2 })]);
    assert.deepEqual(e.projectRange(), { start: at(`${MON}T08:00`), end: at('2026-11-24T17:00') });
    e.setProjectDates(at('2026-11-01T00:00'), at('2026-12-31T00:00'));
    assert.deepEqual(e.projectRange(), { start: at('2026-11-01T00:00'), end: at('2026-12-31T00:00') });
  });
});

describe('duration strings', () => {
  it('formats and parses', () => {
    const e = createProjectEngine();
    e.load([task('a', { start: at(`${MON}T08:00`), duration: 3 }), task('b', { start: at(`${MON}T08:00`), duration: 1 }), task('c', { start: at(`${MON}T08:00`), duration: 90, durationUnit: 'minute' })]);
    assert.equal(e.formatDuration('a'), '3 days');
    assert.equal(e.formatDuration('b'), '1 day');
    assert.equal(e.formatDuration('c'), '90 minutes');
    assert.equal(e.formatDuration('a', { days: 'Tage' }), '3 Tage');
    assert.deepEqual(e.parseDuration('3 days', 'hour'), { value: 3, unit: 'day' });
    assert.deepEqual(e.parseDuration('2h', 'day'), { value: 2, unit: 'hour' });
    assert.deepEqual(e.parseDuration('30 min', 'day'), { value: 30, unit: 'minute' });
    assert.deepEqual(e.parseDuration('1.5d', 'hour'), { value: 1.5, unit: 'day' });
    assert.deepEqual(e.parseDuration('4', 'hour'), { value: 4, unit: 'hour' });
    assert.deepEqual(e.parseDuration('2 Tage', 'hour', { days: 'Tage' }), { value: 2, unit: 'day' });
    assert.equal(e.parseDuration('soon', 'day'), null);
  });
});

describe('WBS and tree edits', () => {
  const rows = () => [
    { id: 'c1', parentId: 'p', start: at(`${MON}T08:00`), duration: 1 },
    task('p'),
    { id: 'c2', parentId: 'p', start: at(`${MON}T08:00`), duration: 1 },
    task('q', { start: at(`${MON}T08:00`), duration: 1, predecessors: [dep('c2')] }),
  ];
  it('builds the tree from parentId and numbers it', () => {
    const e = createProjectEngine();
    e.load(rows());
    assert.deepEqual(e.getTasks().map((t) => t.id), ['p', 'c1', 'c2', 'q']);
    assert.deepEqual(e.getSchedules().map((s) => s.wbs), ['1', '1.1', '1.2', '2']);
    assert.equal(e.getSchedule('c2')!.level, 1);
    assert.equal(e.formatWbsPredecessors('q'), '1.2FS');
  });
  it('add, remove, changeId, move, indent, outdent', () => {
    const e = createProjectEngine();
    e.load(rows());
    e.add({ id: 'c3', parentId: 'p', start: at(`${MON}T08:00`), duration: 1 });
    assert.deepEqual(e.getTasks().map((t) => t.id), ['p', 'c1', 'c2', 'c3', 'q']);
    e.indent(['c2']);
    assert.equal(e.getTask('c2')!.parentId, 'c1');
    assert.equal(e.getSchedule('c2')!.wbs, '1.1.1');
    e.outdent(['c2']);
    assert.equal(e.getTask('c2')!.parentId, 'p');
    assert.deepEqual(e.getTasks().map((t) => t.id), ['p', 'c1', 'c2', 'c3', 'q']);
    e.move(['q'], 'c1', 'above');
    assert.deepEqual(e.getTasks().map((t) => t.id), ['p', 'q', 'c1', 'c2', 'c3']);
    assert.equal(e.getTask('q')!.parentId, 'p');
    e.move(['c1'], 'c3', 'child');
    assert.equal(e.getTask('c1')!.parentId, 'c3');
    e.changeId('c2', 'two');
    assert.equal(e.getTask('q')!.predecessors![0]!.id, 'two');
    e.remove(['two']);
    assert.equal(e.getTask('q')!.predecessors!.length, 0);
    e.remove(['p']);
    assert.equal(e.getTasks().length, 0);
  });
});

describe('split tasks', () => {
  it('splits and merges segments', () => {
    const e = createProjectEngine();
    e.load([task('a', { start: at(`${MON}T08:00`), duration: 4 }), task('b', { duration: 1, predecessors: [dep('a')] })]);
    e.splitTask('a', at('2026-11-25T08:00'), DAYW);
    const s = e.getSchedule('a')!;
    assert.deepEqual(s.segments!.map((g) => [iso(g.start), iso(g.end)]), [
      [`${MON}T08:00`, '2026-11-24T17:00'],
      ['2026-11-26T08:00', '2026-11-27T17:00'],
    ]);
    assert.equal(s.duration, 4);
    assert.equal(iso(s.end), '2026-11-27T17:00');
    assert.equal(iso(e.getSchedule('b')!.start), '2026-11-30T08:00');
    e.update('a', { start: at('2026-11-24T08:00') });
    assert.equal(iso(e.getSchedule('a')!.segments![1]!.start), '2026-11-27T08:00');
    e.mergeSegments('a', [0, 1]);
    assert.equal(e.getSchedule('a')!.segments, null);
    assert.equal(e.getSchedule('a')!.duration, 5);
  });
});

describe('critical path', () => {
  it('total and free float', () => {
    const e = createProjectEngine();
    e.load([
      task('a', { start: at(`${MON}T08:00`), duration: 2 }),
      task('b', { duration: 3, predecessors: [dep('a')] }),
      task('c', { duration: 1, predecessors: [dep('a')] }),
      task('d', { duration: 1, predecessors: [dep('b'), dep('c')] }),
      task('p'),
      { id: 'x', parentId: 'p', start: at(`${MON}T08:00`), duration: 1 },
    ]);
    const r = e.computeCriticalPath(computeCritical);
    assert.deepEqual([...r.critical].sort(), ['a', 'b', 'd']);
    assert.equal(iso(r.finish), '2026-11-30T17:00');
    assert.equal(e.getSchedule('c')!.totalFloat, 2 * DAYW);
    assert.equal(e.getSchedule('c')!.freeFloat, 2 * DAYW);
    assert.equal(e.getSchedule('x')!.totalFloat, 5 * DAYW);
    assert.equal(e.getSchedule('p')!.critical, false);
    assert.equal(typeof computeCritical, 'function');
  });
});

describe('resources', () => {
  const e = createProjectEngine();
  e.load([
    task('a', { start: at(`${MON}T08:00`), duration: 2, resources: [{ id: 'r1', unit: 100 }] }),
    task('b', { start: at('2026-11-24T08:00'), duration: 2, resources: [{ id: 'r1', unit: 50 }, { id: 'r2', unit: 100 }] }),
    task('c', { start: at(`${MON}T08:00`), duration: 1 }),
    task('p'),
    { id: 'x', parentId: 'p', start: at(`${MON}T08:00`), duration: 1 },
  ]);
  it('resource rows with an unassigned group', () => {
    assert.deepEqual(resourceRows(e.getTasks(), e.getSchedule, ['r1', 'r2']), [
      { resourceId: 'r1', taskIds: ['a', 'b'] },
      { resourceId: 'r2', taskIds: ['b'] },
      { resourceId: null, taskIds: ['c', 'x'] },
    ]);
  });
  it('over-allocation ranges', () => {
    const r = overAllocations('r1', e.getTasks(), e.getSchedule, e.calendarOf);
    assert.deepEqual(r.map((x) => [iso(x.start), iso(x.end)]), [['2026-11-24T08:00', '2026-11-24T17:00']]);
    assert.deepEqual(overAllocations('r2', e.getTasks(), e.getSchedule, e.calendarOf), []);
  });
  it('lane stacking', () => {
    const { lanes, count } = stackLanes([{ start: 0, end: 10 }, { start: 5, end: 15 }, { start: 10, end: 20 }, { start: 12, end: 12 }]);
    assert.deepEqual([...lanes], [0, 1, 0, 2]);
    assert.equal(count, 3);
  });
});

describe('undo and redo', () => {
  it('records engine changes and reapplies them', () => {
    const e = createProjectEngine();
    e.load([task('a', { start: at(`${MON}T08:00`), duration: 1 }), task('b', { duration: 1, predecessors: [dep('a')] })]);
    const h = createHistory(2);
    const detach = attachHistory(e, h);
    e.update('a', { start: at('2026-11-24T08:00') }, { source: 'taskbar' });
    e.add(task('c', { start: at(`${MON}T08:00`), duration: 1 }));
    assert.deepEqual(h.getUndoActions(), ['add', 'taskbarEdit']);
    let r = h.undo();
    assert.ok(r && r.changed);
    assert.equal(e.getTask('c'), undefined);
    r = h.undo();
    assert.equal(iso(e.getSchedule('b')!.start), '2026-11-24T08:00');
    assert.deepEqual(h.getRedoActions(), ['taskbarEdit', 'add']);
    h.redo();
    assert.equal(iso(e.getSchedule('b')!.start), '2026-11-25T08:00');
    e.remove(['b']);
    assert.deepEqual(h.getRedoActions(), []);
    h.undo();
    assert.deepEqual(e.getTasks().map((t) => t.id), ['a', 'b']);
    // A batch is one entry; limit keeps the newest entries.
    e.batch('dialogSave', () => {
      e.update('a', { duration: 2 });
      e.update('b', { progress: 50 });
    });
    assert.equal(h.getUndoActions()[0], 'dialogSave');
    assert.equal(h.getUndoActions().length, 2);
    h.undo();
    assert.equal(e.getSchedule('a')!.duration, 1);
    assert.equal(e.getSchedule('b')!.progress, 0);
    h.clear();
    assert.equal(h.undo(), null);
    detach();
    e.update('a', { duration: 3 });
    assert.deepEqual(h.getUndoActions(), []);
    assert.equal(e.batch('x', () => 42), 42);
  });
  it('filters actions', () => {
    const e = createProjectEngine();
    e.load([task('a', { start: at(`${MON}T08:00`), duration: 1 })]);
    const h = createHistory();
    attachHistory(e, h, { actions: ['add'] });
    e.update('a', { duration: 2 });
    e.add(task('b'));
    assert.deepEqual(h.getUndoActions(), ['add']);
  });
});
