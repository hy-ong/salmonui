// Controlled binding writes: applied rows reach the grid as source events.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createControlledDataSource, type DataSourceEvent, type WriteRequest, type WriteResult } from '@salmonui/data';
import { query, request } from './helpers.ts';

interface Row {
  readonly id: string;
  readonly name: string;
}

const rows: readonly Row[] = Object.freeze([
  { id: 'a', name: 'A' },
  { id: 'b', name: 'B' },
  { id: 'c', name: 'C' },
]);

function make(onDataChange: (request: WriteRequest<Row>) => Promise<WriteResult<Row>>) {
  const source = createControlledDataSource<Row>({
    onQueryChange: (req) => ({ version: req.version, rows, totalRowCount: 30 }),
    onDataChange,
  });
  const events: DataSourceEvent<Row>[] = [];
  source.subscribe?.((event) => events.push(event));
  return { source, events };
}

const write = (init: Partial<WriteRequest<Row>>): WriteRequest<Row> => ({
  version: 1,
  added: [],
  changed: [],
  deleted: [],
  mode: 'row',
  signal: new AbortController().signal,
  ...init,
});

describe('controlled source writes', () => {
  it('an applied change is emitted as a patch with the echo row, before the result resolves', async () => {
    const { source, events } = make(async (req) => ({ version: req.version, status: 'applied', changed: [{ rowId: 'b', row: { id: 'b', name: 'B (server)' } }] }));
    await source.read(request(query()));
    const result = await source.write!(write({ changed: [{ rowId: 'b', row: { id: 'b', name: 'B2' }, previous: rows[1] as Row, changedColumnIds: ['name'] }] }));
    assert.equal(result.status, 'applied');
    assert.equal(events.length, 1);
    const event = events[0] as Extract<DataSourceEvent<Row>, { type: 'patch' }>;
    assert.equal(event.type, 'patch');
    assert.deepEqual(event.updated, ['b']);
    assert.deepEqual(event.rows.map((r) => r.name), ['A', 'B (server)', 'C']);
    // The remote total is kept (a page of 3 out of 30).
    assert.equal(event.totalRowCount, 30);
  });

  it('without an echo the request rows are applied; failed rows keep their values', async () => {
    const { source, events } = make(async (req) => ({ version: req.version, status: 'partial', rowErrors: { c: ['nope'] } }));
    await source.read(request(query()));
    await source.write!(
      write({
        changed: [
          { rowId: 'a', row: { id: 'a', name: 'A2' }, previous: rows[0] as Row, changedColumnIds: ['name'] },
          { rowId: 'c', row: { id: 'c', name: 'C2' }, previous: rows[2] as Row, changedColumnIds: ['name'] },
        ],
      }),
    );
    assert.deepEqual(events[0]?.rows.map((r) => r.name), ['A2', 'B', 'C']);
  });

  it('added and deleted rows reset the rows and adjust the total; a rejected write emits nothing', async () => {
    let status: 'applied' | 'rejected' = 'applied';
    const { source, events } = make(async (req) => ({ version: req.version, status, added: req.added.map((a) => ({ tempId: a.tempId, row: { ...a.row, id: 'd' } })) }));
    await source.read(request(query()));
    await source.write!(write({ added: [{ tempId: '__new:1', row: { id: '', name: 'D' } }], deleted: [{ rowId: 'a', row: rows[0] as Row }] }));
    assert.equal(events.length, 1);
    assert.equal(events[0]?.type, 'reset');
    assert.deepEqual(events[0]?.rows.map((r) => r.id), ['b', 'c', 'd']);
    assert.equal(events[0]?.totalRowCount, 30);
    status = 'rejected';
    await source.write!(write({ deleted: [{ rowId: 'b', row: events[0]?.rows[0] as Row }] }));
    assert.equal(events.length, 1);
  });
});
