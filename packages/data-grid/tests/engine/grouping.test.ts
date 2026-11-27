// Grouping and aggregates:
// commands, the grouped visible row model, aggregates, paging with groups,
// lazy group loading over a fake remote source, and randomized oracles for
// expansion state and aggregates under data patches.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  createAggregatesModule,
  createFilterModule,
  createDataGridApi,
  createDataGridEngine,
  createGroupingModule,
  createLocalDataSource,
  createPagingModule,
  createSearchModule,
  createSortModule,
  GROUP_ID_PREFIX,
  type ColumnDef,
  type DataSourceRequest,
  type DataSourceResult,
  type DataGridCommand,
  type DataSource,
  type DataGridModule,
  type DataGridQueryInit,
  type GroupedRowEnvelope,
  type GroupRowSnapshot,
  type LocalDataSource,
} from '@salmonui/data-grid/engine';

interface Sale {
  readonly id: string;
  readonly region: string | null;
  readonly team: string;
  readonly qty: number | null;
  readonly price: number;
  readonly ok: boolean;
  readonly when: Date;
}

const REGIONS = ['North', 'South', 'East', 'West', null] as const;
const TEAMS = ['a', 'b', 'c'];

function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function sale(random: () => number, id: string): Sale {
  return {
    id,
    region: REGIONS[Math.floor(random() * REGIONS.length)] as string | null,
    team: TEAMS[Math.floor(random() * TEAMS.length)] as string,
    qty: random() < 0.1 ? null : Math.floor(random() * 50),
    price: Math.floor(random() * 10000) / 100,
    ok: random() < 0.5,
    when: new Date(Date.UTC(2025, Math.floor(random() * 12), 1 + Math.floor(random() * 28))),
  };
}

function sales(count: number, seed = 1): Sale[] {
  const random = rng(seed);
  return Array.from({ length: count }, (_, i) => sale(random, `s${i}`));
}

const columns: ColumnDef<Sale>[] = [
  { field: 'id', primaryKey: true },
  { field: 'region', type: 'string' },
  { field: 'team', type: 'string' },
  { field: 'qty', type: 'number' },
  { field: 'price', type: 'number', format: 'N2' },
  { field: 'ok', type: 'boolean' },
  { field: 'when', type: 'date', format: { skeleton: 'yMMM', timeZone: 'UTC' } },
  { field: 'locked', type: 'string', groupable: false },
];

type Modules = readonly DataGridModule<Sale, any, any, string>[];

function engineFor(data: readonly Sale[] | DataSource<Sale>, init: { defaultQuery?: DataGridQueryInit; paging?: { pageSize: number }; grouping?: object; aggregates?: object; columns?: readonly ColumnDef<Sale>[] } = {}) {
  const modules: Modules = [
    createSearchModule<Sale>(),
    createFilterModule<Sale>(),
    createSortModule<Sale>(),
    createGroupingModule<Sale>(),
    createAggregatesModule<Sale>(),
    createPagingModule<Sale>(),
  ];
  return createDataGridEngine<Sale, Modules>({
    getRowId: (r) => r.id,
    columns: init.columns ?? columns,
    dataSource: data,
    modules,
    timeZone: 'UTC',
    paging: init.paging ? { pageSize: init.paging.pageSize } : { enabled: false },
    ...(init.grouping ? { grouping: init.grouping } : {}),
    ...(init.aggregates ? { aggregates: init.aggregates } : {}),
    ...(init.defaultQuery ? { defaultQuery: init.defaultQuery } : {}),
  });
}

type Engine = ReturnType<typeof engineFor>;

function group(engine: Engine, id: string): GroupRowSnapshot | undefined {
  return (engine as unknown as { grouping: { getGroup(id: string): GroupRowSnapshot | undefined } }).grouping.getGroup(id);
}

interface Line {
  kind: string;
  id: string;
  depth: number;
  key?: unknown;
  count?: number;
}

function lines(engine: Engine): Line[] {
  const out: Line[] = [];
  const count = engine.getSnapshot().rows.count;
  for (let i = 0; i < count; i++) {
    const id = engine.getRowIdAt(i) as string;
    const g = group(engine, id);
    if (g) out.push({ kind: g.kind, id, depth: g.depth, key: g.key, count: g.count });
    else out.push({ kind: 'data', id, depth: engine.getRowSnapshot(id)?.depth ?? -1 });
  }
  return out;
}

const SUMS = [
  { columnId: 'qty', type: 'sum' as const, placement: ['groupCaption' as const, 'groupFooter' as const, 'footer' as const] },
  { columnId: 'qty', type: 'average' as const, placement: ['groupCaption' as const] },
  { columnId: 'price', type: 'max' as const, placement: ['groupFooter' as const] },
  { columnId: 'price', type: 'min' as const, placement: ['footer' as const] },
  { columnId: 'ok', type: 'trueCount' as const, placement: ['footer' as const] },
  { columnId: 'ok', type: 'falseCount' as const, placement: ['footer' as const] },
  { columnId: 'qty', type: 'count' as const, placement: ['footer' as const] },
];

/**
 * Structural oracle: every data row of the query appears once, under the
 * caption chain of its own keys; sibling keys are distinct; counts and
 * aggregates match naive recomputation; collapsed groups hide their content.
 */
function checkModel(engine: Engine, rows: readonly Sale[], groupBy: (keyof Sale)[], expected: (r: Sale) => boolean = () => true): void {
  const list = lines(engine);
  const members = rows.filter(expected);
  const byId = new Map(members.map((r) => [r.id, r]));
  const stack: GroupRowSnapshot[] = [];
  const seenData = new Set<string>();
  const siblingKeys: Map<string, Set<string>> = new Map();
  const visibleCounts = new Map<string, number>();
  for (const line of list) {
    if (line.kind === 'group') {
      const g = group(engine, line.id) as GroupRowSnapshot;
      while (stack.length > g.depth) stack.pop();
      const parent = stack[stack.length - 1]?.id ?? '';
      assert.equal(g.parentId ?? '', parent, 'caption parent');
      const set = siblingKeys.get(parent) ?? new Set();
      assert.ok(!set.has(JSON.stringify(g.key)), `duplicate sibling key ${JSON.stringify(g.key)}`);
      set.add(JSON.stringify(g.key));
      siblingKeys.set(parent, set);
      assert.equal(g.columnId, groupBy[g.depth]);
      // Counts and aggregates over the group's rows.
      const inGroup = members.filter((r) => g.path.every((s) => JSON.stringify(r[s.columnId as keyof Sale] instanceof Date ? (r[s.columnId as keyof Sale] as Date).toISOString() : (r[s.columnId as keyof Sale] ?? null)) === JSON.stringify(s.key)));
      assert.equal(g.count, inGroup.length, `count of ${g.id}`);
      const sum = inGroup.reduce((n, r) => n + (r.qty ?? 0), 0);
      assert.equal(g.aggregates['qty']?.['sum'], sum, `sum of ${g.id}`);
      assert.ok(Math.abs((g.aggregates['qty']?.['average'] as number) - sum / inGroup.length) < 1e-9, `average of ${g.id}`);
      assert.equal(g.aggregates['price']?.['max'], Math.max(...inGroup.map((r) => r.price)));
      stack.push(g);
      if (!g.expanded) visibleCounts.set(g.id, 0);
    } else if (line.kind === 'groupFooter') {
      const g = group(engine, line.id) as GroupRowSnapshot;
      while (stack.length > g.depth + 1) stack.pop(); // collapsed subgroups have no footer
      assert.equal(stack[stack.length - 1]?.pathKey, g.pathKey, 'footer closes its group');
      assert.ok(g.expanded, 'collapsed groups have no footer');
      stack.pop();
    } else {
      const row = byId.get(line.id);
      assert.ok(row, `unexpected data row ${line.id}`);
      assert.ok(!seenData.has(line.id), 'data row once');
      seenData.add(line.id);
      assert.equal(stack.length, groupBy.length, 'data rows sit under a leaf group');
      for (let d = 0; d < stack.length; d++) {
        const g = stack[d] as GroupRowSnapshot;
        assert.ok(g.expanded, 'data rows only under expanded groups');
        const v: unknown = (row as Sale)[groupBy[d] as keyof Sale];
        assert.equal(JSON.stringify(v instanceof Date ? v.toISOString() : (v ?? null)), JSON.stringify(g.key), 'data row matches its group keys');
      }
      assert.equal(line.depth, groupBy.length);
      assert.equal(engine.getRowIndex(line.id), list.indexOf(line));
    }
  }
  // Every member row is visible unless an ancestor is collapsed.
  const hidden = members.filter((r) => !seenData.has(r.id));
  for (const r of hidden) assert.equal(engine.getRowIndex(r.id), -1);
  const footer = (engine as unknown as { aggregates: { getFooter(): Record<string, Record<string, unknown>> } }).aggregates.getFooter();
  if (footer['qty']) {
    assert.equal(footer['qty']['sum'], members.reduce((n, r) => n + (r.qty ?? 0), 0));
    assert.equal(footer['qty']['count'], members.length);
    assert.equal(footer['ok']?.['trueCount'], members.filter((r) => r.ok).length);
    assert.equal(footer['ok']?.['falseCount'], members.filter((r) => !r.ok).length);
    assert.equal(footer['price']?.['min'], members.length ? Math.min(...members.map((r) => r.price)) : null);
  }
}

describe('grouping commands', () => {
  it('groupBy, ungroup, move, clear and rejections', () => {
    const engine = engineFor(sales(50));
    assert.equal(engine.dispatch({ type: 'grouping.groupBy', columnId: 'region' }).status, 'applied');
    assert.equal(engine.dispatch({ type: 'grouping.groupBy', columnId: 'team', index: 0 }).status, 'applied');
    assert.deepEqual(engine.getSnapshot().query.grouping.map((g) => g.columnId), ['team', 'region']);
    engine.dispatch({ type: 'grouping.move', columnId: 'team', toIndex: 1 });
    assert.deepEqual(engine.getSnapshot().query.grouping.map((g) => g.columnId), ['region', 'team']);
    assert.deepEqual(engine.dispatch({ type: 'grouping.groupBy', columnId: 'locked' }), { status: 'rejected', reason: 'columnNotGroupable' });
    assert.deepEqual(engine.dispatch({ type: 'grouping.groupBy', columnId: 'nope' }), { status: 'rejected', reason: 'unknownColumn' });
    engine.dispatch({ type: 'grouping.ungroup', columnId: 'region' });
    assert.deepEqual(engine.getSnapshot().query.grouping.map((g) => g.columnId), ['team']);
    engine.dispatch({ type: 'grouping.clear' });
    assert.equal(engine.getSnapshot().query.grouping.length, 0);
    assert.equal(engine.getSnapshot().rows.view, undefined);
    engine.dispatch({ type: 'grouping.setEnabled', enabled: false });
    assert.deepEqual(engine.dispatch({ type: 'grouping.groupBy', columnId: 'team' }), { status: 'rejected', reason: 'groupingDisabled' });
  });

  it('cancelable through onBeforeCommand (onBeforeGroupChange)', () => {
    const engine = engineFor(sales(20));
    const off = engine.onBeforeCommand((e) => (e.command.type === 'grouping.groupBy' ? false : undefined));
    assert.equal(engine.dispatch({ type: 'grouping.groupBy', columnId: 'team' }).status, 'rejected');
    off();
    assert.equal(engine.dispatch({ type: 'grouping.groupBy', columnId: 'team' }).status, 'applied');
  });

  it('builds multi-level groups with captions, data rows and footers', () => {
    const rows = sales(300);
    const engine = engineFor(rows, { defaultQuery: { grouping: [{ columnId: 'region' }, { columnId: 'team' }], aggregates: SUMS } });
    checkModel(engine, rows, ['region', 'team']);
    const first = lines(engine)[0] as Line;
    assert.equal(first.kind, 'group');
    assert.equal(first.key, null, 'blank keys sort first (null group)');
    assert.ok(first.id.startsWith(GROUP_ID_PREFIX));
    const snap = engine.getRowSnapshot(first.id);
    assert.equal(snap?.kind, 'group');
    assert.equal(snap?.index, 0);
    const g = group(engine, first.id) as GroupRowSnapshot;
    assert.equal(g.posInSet, 1);
    assert.equal(g.setSize, 5);
    assert.equal(group(engine, first.id), g, 'group snapshots keep their identity');
  });
});

describe('expansion', () => {
  it('toggle, collapse all, expand all; state survives sort, filter and patches', () => {
    const rows = sales(200);
    const source = createLocalDataSource(rows.slice(), { getRowId: (r) => r.id });
    const engine = engineFor(source, { defaultQuery: { grouping: [{ columnId: 'region' }, { columnId: 'team' }], aggregates: SUMS } });
    const north = `${GROUP_ID_PREFIX}[["region","North"]]`;
    assert.equal(group(engine, north)?.expanded, true);
    engine.dispatch({ type: 'grouping.toggle', group: north });
    assert.equal(group(engine, north)?.expanded, false);
    checkModel(engine, source.getRows(), ['region', 'team']);
    engine.dispatch({ type: 'sort.set', sorting: [{ columnId: 'region', direction: 'desc' }, { columnId: 'price', direction: 'asc' }] });
    assert.equal(group(engine, north)?.expanded, false, 'survives sorting');
    engine.dispatch({ type: 'filter.byColumn', columnId: 'qty', operator: 'greaterThan', value: 10 });
    assert.equal(group(engine, north)?.expanded, false, 'survives filtering');
    source.patch({ upsert: [{ ...(source.getRows()[3] as Sale), qty: 49 }] });
    assert.equal(group(engine, north)?.expanded, false, 'survives patches');
    checkModel(engine, source.getRows(), ['region', 'team'], (r) => r.qty !== null && r.qty > 10);
    engine.dispatch({ type: 'grouping.collapseAll' });
    assert.ok(lines(engine).every((l) => l.kind === 'group' && l.depth === 0));
    engine.dispatch({ type: 'grouping.toggle', group: [{ columnId: 'region', key: 'South' }] });
    assert.ok(lines(engine).some((l) => l.depth === 1));
    engine.dispatch({ type: 'grouping.expandAll' });
    assert.equal(group(engine, north)?.expanded, true);
    checkModel(engine, source.getRows(), ['region', 'team'], (r) => r.qty !== null && r.qty > 10);
  });

  it('initial collapsed state and controlled overrides', () => {
    const rows = sales(60);
    const engine = engineFor(rows, { defaultQuery: { grouping: [{ columnId: 'team' }] }, grouping: { defaultExpanded: false, expandedGroups: { [`${GROUP_ID_PREFIX}[["team","b"]]`]: true } } });
    const view = lines(engine);
    assert.ok(view.some((l) => l.kind === 'data'));
    assert.equal(view.filter((l) => l.kind === 'group').length, 3);
    assert.equal(group(engine, `${GROUP_ID_PREFIX}[["team","b"]]`)?.expanded, true);
    engine.dispatch({ type: 'grouping.setExpanded', expanded: {}, defaultExpanded: false });
    assert.equal(lines(engine).length, 3);
  });
});

describe('group order, format and visibility', () => {
  it('grouped columns sort first; the group direction comes from sorting or the descriptor', () => {
    const rows = sales(120);
    const engine = engineFor(rows, { defaultQuery: { grouping: [{ columnId: 'team' }], sorting: [{ columnId: 'price', direction: 'desc' }] } });
    const keys = lines(engine).filter((l) => l.kind === 'group').map((l) => l.key);
    assert.deepEqual(keys, ['a', 'b', 'c']);
    const prices = lines(engine)
      .filter((l) => l.kind === 'data')
      .map((l) => engine.getRow(l.id) as Sale);
    for (let i = 1; i < prices.length; i++) {
      const a = prices[i - 1] as Sale;
      const b = prices[i] as Sale;
      if (a.team === b.team) assert.ok(a.price >= b.price, 'user sort within groups');
    }
    engine.dispatch({ type: 'grouping.setDirection', columnId: 'team', direction: 'desc' });
    assert.deepEqual(lines(engine).filter((l) => l.kind === 'group').map((l) => l.key), ['c', 'b', 'a']);
    engine.dispatch({ type: 'sort.set', sorting: [{ columnId: 'team', direction: 'asc' }] });
    assert.deepEqual(lines(engine).filter((l) => l.kind === 'group').map((l) => l.key), ['a', 'b', 'c'], 'sorting wins');
  });

  it('groups by the formatted value (column groupByFormat / descriptor format)', () => {
    const rows = sales(200);
    const plain = engineFor(rows, { defaultQuery: { grouping: [{ columnId: 'when' }] } });
    assert.ok(lines(plain).filter((l) => l.kind === 'group').length > 12, 'raw dates without groupByFormat');
    const byFormat = columns.map((c) => (c.field === 'when' ? { ...c, groupByFormat: true } : c));
    const engine = engineFor(rows, { defaultQuery: { grouping: [{ columnId: 'when' }] }, columns: byFormat });
    const captions = lines(engine).filter((l) => l.kind === 'group');
    assert.equal(captions.length, 12, 'one group per month (yMMM)');
    assert.deepEqual(captions.map((c) => c.key), ['Jan 2025', 'Feb 2025', 'Mar 2025', 'Apr 2025', 'May 2025', 'Jun 2025', 'Jul 2025', 'Aug 2025', 'Sep 2025', 'Oct 2025', 'Nov 2025', 'Dec 2025'], 'chronological');
    assert.equal(captions.reduce((n, c) => n + (c.count ?? 0), 0), 200);
    const priceGroups = engineFor(rows, { defaultQuery: { grouping: [{ columnId: 'price', format: 'N0' }] } });
    const pk = lines(priceGroups).filter((l) => l.kind === 'group');
    assert.ok(pk.length <= 101 && pk.length > 50);
    for (const l of lines(priceGroups).filter((x) => x.kind === 'data')) {
      const row = priceGroups.getRow(l.id) as Sale;
      const caption = group(priceGroups, priceGroups.getRowSnapshot(l.id)?.parentId as string) as GroupRowSnapshot;
      assert.equal(caption.key, Math.round(row.price).toLocaleString('en-US'));
    }
  });

  it('groups by a custom per-row key (column groupKey)', () => {
    const rows = sales(300);
    const bucket = (r: Sale): number => Math.floor(r.price / 25) * 25;
    const keyed = columns.map((c) => (c.field === 'price' ? { ...c, groupKey: bucket, groupByFormat: true } : c));
    const engine = engineFor(rows, { defaultQuery: { grouping: [{ columnId: 'price' }] }, columns: keyed });
    const captions = lines(engine).filter((l) => l.kind === 'group');
    assert.deepEqual(captions.map((c) => c.key), [0, 25, 50, 75], 'one group per key, ascending; groupByFormat does not re-bucket');
    assert.equal(captions.reduce((n, c) => n + (c.count ?? 0), 0), 300);
    for (const l of lines(engine).filter((x) => x.kind === 'data')) {
      const parent = group(engine, engine.getRowSnapshot(l.id)?.parentId as string) as GroupRowSnapshot;
      assert.equal(parent.value, bucket(engine.getRow(l.id) as Sale));
    }
    const first = group(engine, captions[1]!.id) as GroupRowSnapshot;
    assert.equal(first.formattedKey, '25.00', 'groupByFormat formats the caption with the column format');
    engine.dispatch({ type: 'sort.set', sorting: [{ columnId: 'price', direction: 'desc' }] });
    assert.deepEqual(lines(engine).filter((l) => l.kind === 'group').map((c) => c.key), [75, 50, 25, 0], 'sort direction orders the groups');
    const data = lines(engine).filter((l) => l.kind === 'data').map((l) => (engine.getRow(l.id) as Sale).price);
    assert.ok(data.every((p, i) => i === 0 || data[i - 1]! >= p), 'rows stay sorted inside groups');
    // Keys may read other fields; without a format the caption is the key itself.
    const cross = columns.map((c) => (c.field === 'team' ? { ...c, groupKey: (r: Sale) => `${r.team}/${r.ok ? 'ok' : 'no'}` } : c));
    const e2 = engineFor(rows, { defaultQuery: { grouping: [{ columnId: 'team' }] }, columns: cross });
    const keys = lines(e2).filter((l) => l.kind === 'group');
    assert.deepEqual(keys.map((c) => c.key), ['a/no', 'a/ok', 'b/no', 'b/ok', 'c/no', 'c/ok']);
    assert.equal((group(e2, keys[0]!.id) as GroupRowSnapshot).formattedKey, 'a/no');
    assert.equal(keys[0]!.id, `${GROUP_ID_PREFIX}[["team","a/no"]]`, 'group ids and expansion keys use the custom key');
    e2.dispatch({ type: 'grouping.toggle', group: keys[0]!.id });
    assert.equal((group(e2, keys[0]!.id) as GroupRowSnapshot).expanded, false);
    // A descriptor format formats the key.
    const e3 = engineFor(rows, { defaultQuery: { grouping: [{ columnId: 'price', format: 'N0' }] }, columns: keyed });
    assert.deepEqual(lines(e3).filter((l) => l.kind === 'group').map((c) => (group(e3, c.id) as GroupRowSnapshot).formattedKey), ['0', '25', '50', '75']);
  });

  it('hides grouped columns when showGroupedColumns is false', () => {
    const engine = engineFor(sales(10), { grouping: { showGroupedColumns: false } });
    const before = engine.getSnapshot().columns;
    engine.dispatch({ type: 'grouping.groupBy', columnId: 'team' });
    assert.ok(!engine.getSnapshot().columns.visible.some((c) => c.columnId === 'team'));
    engine.dispatch({ type: 'grouping.toggle', group: `${GROUP_ID_PREFIX}[["team","a"]]` });
    const cols = engine.getSnapshot().columns;
    engine.dispatch({ type: 'grouping.toggle', group: `${GROUP_ID_PREFIX}[["team","a"]]` });
    assert.equal(engine.getSnapshot().columns, cols, 'expansion never rebuilds the column snapshot');
    engine.dispatch({ type: 'grouping.ungroup', columnId: 'team' });
    assert.deepEqual(engine.getSnapshot().columns.visible.map((c) => c.columnId), before.visible.map((c) => c.columnId));
  });
});

describe('aggregates', () => {
  it('footer aggregates without grouping, custom aggregates, formats', () => {
    const rows = sales(500);
    const median = (list: readonly unknown[]): unknown => {
      const v = (list as Sale[]).map((r) => r.price).sort((a, b) => a - b);
      return v[v.length >> 1];
    };
    const engine = engineFor(rows, {
      aggregates: { custom: { median } },
      defaultQuery: { aggregates: SUMS },
    });
    engine.dispatch({ type: 'aggregates.set', aggregates: [...SUMS, { columnId: 'price', type: 'custom', customId: 'median', placement: ['footer'] }, { columnId: 'price', type: 'sum', format: 'C2', placement: ['footer'] }, { columnId: 'when', type: 'max', placement: ['footer'] }] });
    const aggregates = (engine as unknown as { aggregates: { getFooter(): Record<string, Record<string, unknown>>; format(c: string, t: string, v: unknown): string } }).aggregates;
    const footer = aggregates.getFooter();
    assert.equal(footer['qty']?.['sum'], rows.reduce((n, r) => n + (r.qty ?? 0), 0));
    assert.equal(footer['price']?.['custom'], median(rows));
    assert.ok(footer['when']?.['max'] instanceof Date);
    assert.equal((footer['when']?.['max'] as Date).getTime(), Math.max(...rows.map((r) => r.when.getTime())));
    assert.match(aggregates.format('price', 'sum', footer['price']?.['sum']), /^\$[\d,]+\.\d\d$/);
    assert.equal(aggregates.format('qty', 'count', 500), '500');
    // Aggregates follow filtering and cover all rows, not the viewport.
    engine.dispatch({ type: 'filter.byColumn', columnId: 'team', operator: 'equal', value: 'a' });
    const filtered = rows.filter((r) => r.team === 'a');
    assert.equal(aggregates.getFooter()['qty']?.['count'], filtered.length);
    assert.equal(aggregates.getFooter()['price']?.['custom'], median(filtered));
  });

  it('page-wise vs whole aggregates with paging and grouping', () => {
    const rows = sales(200);
    const engine = engineFor(rows, { paging: { pageSize: 30 }, defaultQuery: { grouping: [{ columnId: 'team' }], aggregates: SUMS } });
    const paging = (engine as unknown as { paging: { getInfo(): { totalRowCount: number; pageCount: number } } }).paging;
    assert.equal(paging.getInfo().totalRowCount, 200, 'pages count data rows');
    assert.equal(paging.getInfo().pageCount, 7);
    engine.dispatch({ type: 'paging.goToPage', page: 2 });
    const page = lines(engine);
    assert.equal(page.filter((l) => l.kind === 'data').length, 30);
    const captions = page.filter((l) => l.kind === 'group');
    assert.ok(captions.length >= 1);
    const firstCaption = group(engine, (captions[0] as Line).id) as GroupRowSnapshot;
    const visibleInFirst = page.filter((l) => l.kind === 'data' && engine.getRowSnapshot(l.id)?.parentId === firstCaption.id).map((l) => engine.getRow(l.id) as Sale);
    assert.equal(firstCaption.count, visibleInFirst.length, 'page-wise count');
    assert.equal(firstCaption.aggregates['qty']?.['sum'], visibleInFirst.reduce((n, r) => n + (r.qty ?? 0), 0), 'page-wise sum');
    engine.dispatch({ type: 'aggregates.setScope', scope: 'all' });
    const whole = group(engine, firstCaption.id) as GroupRowSnapshot;
    const all = rows.filter((r) => r.team === firstCaption.key);
    assert.equal(whole.aggregates['qty']?.['sum'], all.reduce((n, r) => n + (r.qty ?? 0), 0), 'whole-group sum');
    // Collapsing keeps the page window over data rows.
    engine.dispatch({ type: 'grouping.collapseAll' });
    assert.ok(lines(engine).every((l) => l.kind === 'group'));
    assert.equal(paging.getInfo().totalRowCount, 200);
  });
});

describe('randomized oracle: expansion and aggregates under patches', () => {
  for (const seed of [3, 11, 29]) {
    it(`seed ${seed}`, () => {
      const random = rng(seed);
      const rows = sales(400, seed);
      const source: LocalDataSource<Sale> = createLocalDataSource(rows.slice(), { getRowId: (r) => r.id });
      const groupBy: (keyof Sale)[] = seed === 3 ? ['region'] : seed === 11 ? ['region', 'team'] : ['team', 'ok', 'region'];
      const init = { defaultQuery: { grouping: groupBy.map((c) => ({ columnId: c as string })), aggregates: SUMS, sorting: [{ columnId: 'price', direction: 'asc' as const }] } };
      const engine = engineFor(source, init);
      const instrumented = createDataGridEngine<Sale, Modules>({
        getRowId: (r) => r.id,
        columns,
        dataSource: source,
        instrument: true,
        modules: [createSortModule<Sale>(), createGroupingModule<Sale>(), createAggregatesModule<Sale>()],
        defaultQuery: init.defaultQuery,
      });
      instrumented.getSnapshot();
      let next = 400;
      for (let step = 0; step < 60; step++) {
        const list = source.getRows();
        const pick = (): Sale => list[Math.floor(random() * list.length)] as Sale;
        const roll = random();
        if (roll < 0.5) source.patch({ upsert: [{ ...pick(), qty: Math.floor(random() * 50), price: Math.floor(random() * 10000) / 100, ...(random() < 0.3 ? { team: TEAMS[Math.floor(random() * 3)] as string } : {}) }] });
        else if (roll < 0.65) source.patch({ append: [sale(random, `n${next++}`)] });
        else if (roll < 0.8) source.patch({ remove: [pick().id] });
        else if (roll < 0.9) {
          const ids = lines(engine).filter((l) => l.kind === 'group').map((l) => l.id);
          if (ids.length) engine.dispatch({ type: 'grouping.toggle', group: ids[Math.floor(random() * ids.length)] as string });
        } else engine.dispatch({ type: random() < 0.5 ? 'grouping.collapseAll' : 'grouping.expandAll' } as DataGridCommand);
        if (step % 6 === 0 || step === 59) {
          checkModel(engine, source.getRows(), groupBy);
          // Same rows, fresh engine (no incremental history), same expansion: identical model.
          const oracle = engineFor(source.getRows().slice(), init);
          const state = engine.getModuleState<{ expanded: Record<string, boolean>; defaultExpanded: boolean }>('grouping');
          oracle.dispatch({ type: 'grouping.setExpanded', expanded: { ...state?.expanded }, defaultExpanded: state?.defaultExpanded ?? true });
          assert.deepEqual(lines(engine), lines(oracle));
          for (const l of lines(engine).filter((x) => x.kind !== 'data')) assert.deepEqual(group(engine, l.id)?.aggregates, group(oracle, l.id)?.aggregates);
          oracle.dispose();
        }
      }
      const updates = instrumented.getInstrumentation()?.stageUpdates ?? {};
      assert.ok((updates['group'] ?? 0) > 0 && (updates['aggregate'] ?? 0) > 0, `incremental group/aggregate updates ran: ${JSON.stringify(updates)}`);
    });
  }
});

describe('lazy load grouping', () => {
  function fakeRemote(rows: readonly Sale[]) {
    const requests: DataSourceRequest[] = [];
    let fail = false;
    const deferred: (() => void)[] = [];
    const source: DataSource<Sale> = {
      mode: 'remote',
      capabilities: { lazyGroups: true },
      read(request: DataSourceRequest): Promise<DataSourceResult<Sale>> {
        requests.push(request);
        return new Promise((resolve, reject) => {
          deferred.push(() => {
            if (fail) {
              reject(new Error('boom'));
              return;
            }
            const q = request.query;
            const path = request.groupPath;
            if (!path) {
              resolve({ version: request.version, rows: rows.slice(0, 5), totalRowCount: rows.length });
              return;
            }
            const match = rows.filter((r) => path.every((s) => (r[s.columnId as keyof Sale] ?? null) === s.key));
            const depth = path.length;
            if (depth < q.grouping.length) {
              const columnId = (q.grouping[depth] as { columnId: string }).columnId;
              const keys = [...new Set(match.map((r) => (r[columnId as keyof Sale] ?? null) as string | null))].sort((a, b) => String(a).localeCompare(String(b)));
              const envelopes: GroupedRowEnvelope<Sale>[] = keys.map((key) => {
                const items = match.filter((r) => (r[columnId as keyof Sale] ?? null) === key);
                return { kind: 'group', key, columnId, groupPath: [...path, { columnId, key }], count: items.length, aggregates: { qty: { sum: items.reduce((n, r) => n + (r.qty ?? 0), 0) } } };
              });
              resolve({ version: request.version, rows: envelopes as unknown as Sale[], totalRowCount: envelopes.length, performed: ['search', 'filter', 'sort', 'group', 'aggregate'] });
              return;
            }
            const range = request.range ?? { start: 0, end: match.length };
            resolve({ version: request.version, rows: match.slice(range.start, range.end), totalRowCount: match.length, pageInfo: { hasNextPage: range.end < match.length } });
          });
        });
      },
    };
    const flush = async (): Promise<void> => {
      for (let i = 0; i < 10; i++) {
        while (deferred.length) (deferred.shift() as () => void)();
        await new Promise((r) => setTimeout(r, 0));
      }
    };
    return { source, requests, flush, setFail: (v: boolean) => (fail = v) };
  }

  it('loads captions first, children on expand, more on demand, with errors and retry', async () => {
    const rows = sales(120);
    const remote = fakeRemote(rows);
    const engine = engineFor(remote.source, { grouping: { lazy: true, lazyChunk: 10 }, defaultQuery: { grouping: [{ columnId: 'team' }, { columnId: 'region' }] } });
    await remote.flush();
    assert.ok(remote.requests.every((r) => r.groupPath !== undefined), 'no plain main read in lazy mode');
    let view = lines(engine);
    assert.deepEqual(view.map((l) => l.key), ['a', 'b', 'c'], 'captions first, collapsed');
    const a = group(engine, view[0]?.id as string) as GroupRowSnapshot;
    assert.equal(a.count, rows.filter((r) => r.team === 'a').length);
    assert.equal(a.aggregates['qty']?.['sum'], rows.filter((r) => r.team === 'a').reduce((n, r) => n + (r.qty ?? 0), 0), 'server caption aggregates');
    assert.equal(a.status, 'idle');
    engine.dispatch({ type: 'grouping.toggle', group: a.id });
    assert.equal(group(engine, a.id)?.status, 'loading');
    await remote.flush();
    view = lines(engine);
    const sub = view.filter((l) => l.depth === 1 && l.kind === 'group');
    assert.ok(sub.length >= 1);
    const north = sub.find((l) => l.key === 'North') as Line;
    engine.dispatch({ type: 'grouping.toggle', group: north.id });
    await remote.flush();
    const northRows = rows.filter((r) => r.team === 'a' && r.region === 'North');
    let loaded = lines(engine).filter((l) => l.kind === 'data');
    assert.equal(loaded.length, Math.min(10, northRows.length));
    assert.equal(engine.getRow(loaded[0]?.id as string)?.team, 'a');
    assert.equal(engine.getRowSnapshot(loaded[0]?.id as string)?.parentId, north.id);
    assert.equal(engine.getCellSnapshot(loaded[0]?.id as string, 'team')?.value, 'a');
    if (northRows.length > 10) {
      assert.equal(group(engine, north.id)?.hasMore, true);
      engine.dispatch({ type: 'grouping.loadMore', group: north.id });
      await remote.flush();
      loaded = lines(engine).filter((l) => l.kind === 'data');
      assert.equal(loaded.length, Math.min(20, northRows.length), 'per-group append');
    }
    // Error and retry.
    remote.setFail(true);
    const b = view.find((l) => l.key === 'b') as Line;
    engine.dispatch({ type: 'grouping.toggle', group: b.id });
    await remote.flush();
    assert.equal(group(engine, b.id)?.status, 'error');
    remote.setFail(false);
    engine.dispatch({ type: 'grouping.retry', group: b.id });
    await remote.flush();
    assert.equal(group(engine, b.id)?.status, 'ready');
    // A query change invalidates loaded children; expansion state survives.
    const before = remote.requests.length;
    engine.dispatch({ type: 'filter.byColumn', columnId: 'qty', operator: 'greaterThan', value: 5 });
    await remote.flush();
    assert.ok(remote.requests.slice(before).some((r) => r.groupPath?.length === 0), 'root reloaded');
    assert.equal(group(engine, a.id)?.expanded, true);
    // Expanding never triggers a plain re-read.
    assert.ok(remote.requests.every((r) => r.groupPath !== undefined));
  });
});

describe('DataGridApi grouping and aggregates', () => {
  it('groupColumn / ungroupColumn take fields; getAggregates reads the footer or one group', () => {
    const engine = engineFor(sales(50), { defaultQuery: { aggregates: SUMS } });
    const api = createDataGridApi(engine);
    assert.equal(api.groupColumn('team').status, 'applied');
    assert.deepEqual(engine.getSnapshot().query.grouping.map((g) => g.columnId), ['team']);
    const footer = api.getAggregates();
    assert.equal(typeof footer?.['qty']?.['sum'], 'number');
    const caption = lines(engine).find((l) => l.kind === 'group')!;
    assert.deepEqual(api.getAggregates(caption.id), api.getGroup(caption.id)?.aggregates);
    assert.equal(api.getAggregates('missing'), undefined);
    assert.equal(api.ungroupColumn('team').status, 'applied');
    assert.equal(engine.getSnapshot().query.grouping.length, 0);
  });
});
