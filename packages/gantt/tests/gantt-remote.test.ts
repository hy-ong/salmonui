import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { GanttInstance } from '../dist/gantt/instance.js';

// Remote writes of the Gantt (packages/react/src/gantt/
// remote.ts): a writable source receives each committed change with the
// computed rows and a signal, the tasks are pending until it settles, a newer
// write of the same task aborts the older one, and a rejection reverts the
// change through the engine and calls `onError`. The browser side (grid
// patch, unmount) is in tests/browser/gantt-remote.spec.ts.

type Row = Record<string, unknown>;

const ROWS: Row[] = [
  { id: 1, title: 'Plan', parentId: null },
  { id: 2, title: 'Scope', start: '2026-03-02', duration: 2, parentId: 1 },
  { id: 3, title: 'Estimate', duration: 3, predecessors: '2FS', parentId: 1 },
  { id: 4, title: 'Other', start: '2026-03-02', duration: 1, parentId: null },
];

function setup() {
  const writes: { request: any; resolve: (v: unknown) => void; reject: (e: unknown) => void }[] = [];
  const errors: any[] = [];
  const source = {
    mode: 'remote',
    read: () => ({ rows: ROWS, totalRowCount: ROWS.length }),
    write: (request: any) => new Promise((resolve, reject) => writes.push({ request, resolve, reject })),
  };
  const g = new GanttInstance<Row>({ data: source as never, taskFields: { parentId: 'parentId' }, timeZone: 'UTC', onError: (e: unknown) => errors.push(e) } as never);
  const rows = ROWS.map((r) => ({ ...r }));
  g.adoptRemoteRows(rows, (r: Row) => (r['parentId'] === null ? null : String(r['parentId'])));
  g.remote!.confirm(rows);
  const end = (id: string) => g.engine.getSchedule(id)!.end;
  return { g, writes, errors, end };
}
const tick = () => new Promise((r) => setTimeout(r, 0));
const ids = (request: any) => [...request.added.map((a: any) => a.tempId), ...request.changed.map((c: any) => c.rowId), ...request.deleted.map((d: any) => d.rowId)].map(String).sort();

describe('Gantt remote writes', () => {
  it('adopted rows are not written; a change writes the changed rows with their computed dates and a signal', async () => {
    const { g, writes, errors } = setup();
    assert.equal(writes.length, 0);
    assert.equal(g.updateFields('2', { duration: 4 }, 'api').status, 'applied');
    await tick();
    assert.equal(writes.length, 1);
    const { request } = writes[0]!;
    assert.ok(request.signal instanceof AbortSignal);
    assert.equal(request.mode, 'batch');
    // The edited task, its dependent and the parent they roll up into.
    assert.deepEqual(ids(request), ['1', '2', '3']);
    const row2 = request.changed.find((c: any) => c.rowId === '2');
    assert.equal(row2.row.duration, 4);
    assert.ok(row2.row.end instanceof Date);
    assert.equal(row2.row.parentId, 1);
    assert.equal(row2.row.__salmonParentId, undefined);
    assert.ok(row2.changedColumnIds.includes('duration'));
    assert.deepEqual([...g.pending].sort(), ['1', '2', '3']);
    writes[0]!.resolve({ status: 'applied' });
    await tick();
    assert.equal(g.pending.size, 0);
    assert.deepEqual(errors, []);
  });

  it('a rejection reverts the change and calls onError; a rejected result does too', async () => {
    const { g, writes, errors, end } = setup();
    const before = { 2: end('2'), 3: end('3') };
    g.updateFields('2', { duration: 5 }, 'api');
    assert.notEqual(end('3'), before[3]);
    await tick();
    writes[0]!.reject(new Error('offline'));
    await tick();
    assert.equal(end('2'), before[2]);
    assert.equal(end('3'), before[3]);
    assert.equal(errors.length, 1);
    assert.equal(errors[0].action, 'update');
    assert.equal(errors[0].error.message, 'offline');
    assert.deepEqual([...errors[0].taskIds].sort(), ['1', '2', '3']);
    assert.equal(g.pending.size, 0);
    // A `rejected` WriteResult reverts as well.
    g.updateFields('2', { duration: 6 }, 'api');
    await tick();
    writes[1]!.resolve({ status: 'rejected' });
    await tick();
    assert.equal(end('3'), before[3]);
    assert.equal(errors.length, 2);
  });

  it('a newer write of the same task aborts the older one and carries its tasks; other tasks write on their own; abort() aborts all', async () => {
    const { g, writes, errors, end } = setup();
    const before = end('3');
    g.updateFields('2', { duration: 3 }, 'api');
    g.updateFields('4', { duration: 2 }, 'api');
    g.updateFields('2', { duration: 6 }, 'api');
    await tick();
    assert.equal(writes.length, 3);
    assert.equal(writes[0]!.request.signal.aborted, true);
    assert.equal(writes[1]!.request.signal.aborted, false);
    assert.deepEqual(ids(writes[1]!.request), ['4']);
    assert.deepEqual(ids(writes[2]!.request), ['1', '2', '3']);
    // The superseded write settling later changes nothing.
    writes[0]!.reject(new Error('late'));
    await tick();
    assert.equal(errors.length, 0);
    // Rejecting the newer write reverts both changes of task 2.
    writes[2]!.reject(new Error('no'));
    await tick();
    assert.equal(end('3'), before);
    assert.deepEqual([...g.pending], ['4']);
    g.remote!.abort();
    assert.equal(writes[1]!.request.signal.aborted, true);
    assert.equal(g.pending.size, 0);
  });

  it('a local array never writes', () => {
    const g = new GanttInstance<Row>({ data: ROWS, taskFields: { parentId: 'parentId' }, timeZone: 'UTC' } as never);
    assert.equal(g.remote, null);
  });
});
