import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildColumns } from '../dist/gantt/columns.js';
import { GanttInstance } from '../dist/gantt/instance.js';

// GanttInstance behaviour behind the chart interactions (packages/react/src/
// gantt/instance.ts, columns.tsx): a taskbar dropped on another row keeps its
// duration, a re-created `timeline` object with the same tiers keeps the zoom,
// and remote rows show the computed start and finish in the grid.

type Row = Record<string, unknown>;

const ROWS: Row[] = [
  { id: 1, title: 'Plan', parentId: null },
  { id: 2, title: 'Scope', start: '2027-03-01', duration: 3, parentId: 1 },
  { id: 3, title: 'Estimate', duration: 2, predecessors: '2FS', parentId: 1 },
  { id: 4, title: 'Other', parentId: null },
  { id: 5, title: 'Review', start: '2027-03-01', duration: 1, parentId: 4 },
];

const make = (props: Row = {}) => new GanttInstance<Row>({ data: ROWS.map((r) => ({ ...r })), taskFields: { parentId: 'parentId' }, timeZone: 'UTC', ...props } as never);

describe('GanttInstance', () => {
  it('a task dropped on another row keeps its duration', () => {
    const g = make({ editing: { taskbarDragBetweenRows: true } });
    const before = g.formatDuration('2');
    assert.equal(before, '3 days');
    const s = g.engine.getSchedule('2')!;
    const day = 24 * 3_600_000;
    const r = g.dropOnRow('2', { key: '5', group: undefined }, undefined, { start: (s.start as number) + 2 * day, end: (s.end as number) + 2 * day }, 'pointer');
    assert.equal(r.status, 'applied');
    assert.equal(g.formatDuration('2'), before);
    assert.equal(g.engine.getTask('2')!.parentId, '4');
  });

  it('a new timeline object with the same tiers keeps the zoom; other tiers reset it', () => {
    const g = make({ timeline: { mode: 'week', unitWidth: 33 } });
    const initial = g.zoomIndex;
    g.applyZoom(initial + 1, 'api');
    const zoomed = g.zoomIndex;
    assert.notEqual(zoomed, initial);
    g.syncProps({ ...g.props, timeline: { mode: 'week', unitWidth: 33 } } as never);
    assert.equal(g.zoomIndex, zoomed);
    g.syncProps({ ...g.props, timeline: { mode: 'week', unitWidth: 50 } } as never);
    assert.equal(g.level.unitWidth, 50);
  });

  it('remote rows: the start and finish columns read the computed dates', () => {
    const source = { mode: 'remote', read: () => ({ rows: ROWS, totalRowCount: ROWS.length }) };
    const g = new GanttInstance<Row>({ data: source as never, taskFields: { parentId: 'parentId' }, timeZone: 'UTC' } as never);
    const raw = ROWS.map((r) => ({ ...r }));
    const before = g.adopted;
    g.adoptRemoteRows(raw, (r: Row) => (r['parentId'] === null ? null : String(r['parentId'])));
    assert.equal(g.adopted, before + 1);
    const columns = buildColumns(g, { ...g.props, columns: ['title', 'start', 'end'] } as never);
    const start = columns.find((c) => c.field === 'start')!;
    const end = columns.find((c) => c.field === 'end')!;
    // `Estimate` has no start in the source row: the cell shows the scheduled one.
    const estimate = raw[2]!;
    assert.equal(estimate['start'], undefined);
    const value = start.valueGetter!(estimate as never) as Date;
    assert.ok(value instanceof Date);
    assert.equal(value.getTime(), (g.getRow('3') as Row)['start'] instanceof Date ? ((g.getRow('3') as Row)['start'] as Date).getTime() : NaN);
    assert.ok(end.valueGetter!(raw[0] as never) instanceof Date);
    // The setter keeps grid editing on the field.
    assert.deepEqual(start.valueSetter!(estimate as never, 'x' as never), { ...estimate, start: 'x' });
  });

  it('local arrays keep the plain field columns', () => {
    const g = make();
    const start = buildColumns(g, { ...g.props, columns: ['start'] } as never)[0]!;
    assert.equal(start.valueGetter, undefined);
  });
});
