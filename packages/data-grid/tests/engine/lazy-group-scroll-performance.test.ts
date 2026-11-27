// Scroll-driven lazy group loading performance gate: the renderer runs `lazyGroupsToAppend`
// on every row window change of a grid with `infiniteScroll` and lazy
// grouping. Over 40,000 loaded rows in two expanded group levels, one check
// of a 60-row window with the default threshold (50 rows) stays in
// microseconds, and a window without due groups allocates nothing.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { assertBudget } from '../../../../tooling/bench/budget.mjs';
import { createDataGridEngine, createGroupingModule, type ColumnDef, type DataSourceRequest, type DataSourceResult, type DataSource, type DataGridModule, type GroupedRowEnvelope } from '@salmonui/data-grid/engine';
import { lazyGroupsToAppend } from '@salmonui/data-grid/engine/infinite';

interface Item {
  readonly id: string;
  readonly team: string;
  readonly region: string;
}

const TOTAL = 40_000;
const columns: ColumnDef<Item>[] = [{ field: 'id', primaryKey: true }, { field: 'team' }, { field: 'region' }];
const rows: Item[] = [];
for (let i = 0; i < TOTAL; i++) rows.push({ id: `r${i}`, team: `t${i % 4}`, region: `g${Math.floor(i / 4) % 2}` });

const source: DataSource<Item> = {
  mode: 'remote',
  capabilities: { lazyGroups: true },
  read(request: DataSourceRequest): Promise<DataSourceResult<Item>> {
    const path = request.groupPath ?? [];
    const match = rows.filter((r) => path.every((s) => r[s.columnId as keyof Item] === s.key));
    const grouping = request.query.grouping;
    if (path.length < grouping.length) {
      const columnId = (grouping[path.length] as { columnId: string }).columnId;
      const keys = [...new Set(match.map((r) => r[columnId as keyof Item]))].sort();
      const envelopes: GroupedRowEnvelope<Item>[] = keys.map((key) => ({ kind: 'group', key, columnId, groupPath: [...path, { columnId, key }], count: match.filter((r) => r[columnId as keyof Item] === key).length }));
      return Promise.resolve({ version: request.version, rows: envelopes as unknown as Item[], totalRowCount: envelopes.length, performed: ['group'] });
    }
    const range = request.range ?? { start: 0, end: match.length };
    // One more chunk exists for every leaf group: each one stays `hasMore`.
    return Promise.resolve({ version: request.version, rows: match.slice(range.start, range.end), totalRowCount: match.length + 1, pageInfo: { hasNextPage: true } });
  },
};

const settle = async (): Promise<void> => {
  for (let i = 0; i < 10; i++) await new Promise((r) => setTimeout(r, 0));
};

describe('scroll-driven lazy group loading performance', () => {
  it('one row window check over 40,000 loaded grouped rows is ≤ 20 µs p95', async () => {
    const engine = createDataGridEngine<Item, DataGridModule<Item, any, any>[]>({
      getRowId: (r) => r.id,
      columns,
      dataSource: source,
      modules: [createGroupingModule<Item>() as DataGridModule<Item, any, any>],
      grouping: { lazy: true, lazyChunk: TOTAL, defaultExpanded: true },
      defaultQuery: { grouping: [{ columnId: 'team' }, { columnId: 'region' }] },
    });
    await settle();
    const view = engine.getSnapshot().rows.view;
    assert.equal(view?.kind, 'lazyGrouped');
    const count = engine.getSnapshot().rows.count;
    assert.equal(count, TOTAL + 4 + 8, 'every row loaded, with 4 + 8 captions');
    const samples: number[] = [];
    let due = 0;
    // Slide a 60-row window over the whole view, one row window change per step.
    for (let round = 0; round < 3; round++) {
      for (let start = 0; start + 60 <= count; start += 37) {
        const t = performance.now();
        due += lazyGroupsToAppend(view, start, start + 60, 50).length;
        samples.push(performance.now() - t);
      }
    }
    samples.sort((a, b) => a - b);
    const p95 = (samples[Math.floor(samples.length * 0.95)] as number) * 1000;
    console.log(`lazyGroupsToAppend: ${samples.length} checks, p95 ${p95.toFixed(2)} µs`);
    assert.ok(due > 0, 'leaf group ends were found');
    assertBudget(p95, 20, 'lazyGroupsToAppend p95', { unit: 'us' });
  });
});
