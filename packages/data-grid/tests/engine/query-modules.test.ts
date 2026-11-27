import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  BLANK_FACET_KEY,
  compilePattern,
  createFilterModule,
  createDataGridApi,
  createDataGridEngine,
  defineDataGridModule,
  createDataGridQuery,
  createLocalDataSource,
  createPagingModule,
  createSearchModule,
  createSortModule,
  deserializeDataGridQuery,
  normalizeFilterOperator,
  serializeDataGridQuery,
  type ColumnDef,
  type DataSource,
  type DataGridQueryInit,
} from '@salmonui/data-grid/engine';
import { collectWarnings } from './fixtures.ts';

interface Item {
  readonly id: string;
  readonly name: string | null | undefined;
  readonly qty: number | null;
  readonly when: Date | null;
  readonly ok: boolean;
  readonly city: string;
}

const items: Item[] = [
  { id: 'a', name: 'Apple', qty: 5, when: new Date(2025, 0, 1, 10), ok: true, city: 'Tokyo' },
  { id: 'b', name: 'banana', qty: 2, when: new Date(2025, 0, 2, 9), ok: false, city: 'Taipei' },
  { id: 'c', name: 'Cherry', qty: 5, when: new Date(2025, 0, 1, 23), ok: true, city: 'Kuala Lumpur' },
  { id: 'd', name: '', qty: null, when: null, ok: false, city: 'Tokyo' },
  { id: 'e', name: null, qty: 10, when: new Date(2025, 0, 3, 0), ok: true, city: 'Taipei' },
  { id: 'f', name: 'Crème brûlée', qty: 7, when: new Date(2025, 0, 5, 12), ok: false, city: 'Tokyo' },
  { id: 'g', name: undefined, qty: 2, when: new Date(2025, 0, 2, 18), ok: true, city: 'Taipei' },
  { id: 'h', name: 'apple pie', qty: 1, when: new Date(2025, 0, 4, 8), ok: false, city: 'Kuala Lumpur' },
];

const itemColumns: ColumnDef<Item>[] = [
  { field: 'id', primaryKey: true },
  { field: 'name', type: 'string' },
  { field: 'qty', type: 'number' },
  { field: 'when', type: 'date' },
  { id: 'at', field: 'when', type: 'datetime' },
  { field: 'ok', type: 'boolean' },
  { field: 'city', type: 'string', searchable: true },
];

function make(
  opts: {
    data?: readonly Item[] | DataSource<Item>;
    columns?: ColumnDef<Item>[];
    defaultQuery?: DataGridQueryInit;
    paging?: boolean | { pageSize?: number; page?: number };
    sort?: object;
    filter?: object;
    search?: object;
    operators?: Parameters<typeof createFilterModule<Item>>[0];
  } = {},
) {
  const w = collectWarnings();
  const engine = createDataGridEngine({
    getRowId: (r: Item) => r.id,
    columns: opts.columns ?? itemColumns,
    dataSource: opts.data ?? items,
    dev: true,
    instrument: true,
    onWarning: w.onWarning,
    modules: [createSearchModule<Item>(), createFilterModule<Item>(opts.operators), createSortModule<Item>(), createPagingModule<Item>()],
    paging: opts.paging === undefined || opts.paging === false ? { enabled: false } : opts.paging === true ? {} : opts.paging,
    ...(opts.defaultQuery ? { defaultQuery: opts.defaultQuery } : {}),
    ...(opts.sort ? { sort: opts.sort } : {}),
    ...(opts.filter ? { filter: opts.filter } : {}),
    ...(opts.search ? { search: opts.search } : {}),
  });
  const ids = (): string[] => {
    const out: string[] = [];
    const count = engine.getSnapshot().rows.count;
    for (let i = 0; i < count; i++) out.push(engine.getRowIdAt(i) as string);
    return out;
  };
  return { engine, ids, w };
}

describe('sort module', () => {
  it('toggles none -> asc -> desc -> none and is stable', () => {
    const { engine, ids } = make();
    assert.deepEqual(engine.sort.toggle({ columnId: 'qty' }), { status: 'applied' });
    // nulls first; equal keys keep source order
    assert.deepEqual(ids(), ['d', 'h', 'b', 'g', 'a', 'c', 'f', 'e']);
    engine.sort.toggle({ columnId: 'qty' });
    assert.deepEqual(ids(), ['e', 'f', 'a', 'c', 'b', 'g', 'h', 'd']);
    engine.sort.toggle({ columnId: 'qty' });
    assert.deepEqual(engine.getSnapshot().query.sorting, []);
    assert.equal(engine.getSnapshot().rows.order, null);
  });

  it('multi-sorts with Ctrl+click and single mode replaces', () => {
    const { engine, ids } = make();
    engine.sort.toggle({ columnId: 'city' });
    engine.sort.toggle({ columnId: 'qty', multi: true });
    engine.sort.toggle({ columnId: 'qty', multi: true });
    assert.deepEqual(engine.getSnapshot().query.sorting, [
      { columnId: 'city', direction: 'asc' },
      { columnId: 'qty', direction: 'desc' },
    ]);
    assert.deepEqual(ids(), ['c', 'h', 'e', 'b', 'g', 'f', 'a', 'd']);
    engine.sort.toggle({ columnId: 'name' });
    assert.deepEqual(engine.getSnapshot().query.sorting, [{ columnId: 'name', direction: 'asc' }]);
    const single = make({ sort: { mode: 'single' } }).engine;
    single.sort.toggle({ columnId: 'city' });
    single.sort.toggle({ columnId: 'qty', multi: true });
    assert.deepEqual(single.getSnapshot().query.sorting, [{ columnId: 'qty', direction: 'asc' }]);
  });

  it('sorts strings with the locale collator and dates numerically', () => {
    const { engine, ids } = make();
    engine.sort.column({ columnId: 'name', direction: 'asc' });
    // null and undefined first (equal, source order), then '' and collator order
    assert.deepEqual(ids(), ['e', 'g', 'd', 'a', 'h', 'b', 'c', 'f']);
    engine.sort.set({ sorting: [{ columnId: 'at', direction: 'desc' }] });
    assert.deepEqual(ids(), ['f', 'h', 'e', 'g', 'b', 'c', 'a', 'd']);
  });

  it('initial sort, remove, clear, and no-op re-application', () => {
    const { engine, ids } = make({ defaultQuery: { sorting: [{ columnId: 'qty', direction: 'desc' }] } });
    assert.equal(ids()[0], 'e');
    const version = engine.getSnapshot().version;
    engine.sort.set({ sorting: [{ columnId: 'qty', direction: 'desc' }] });
    assert.equal(engine.getSnapshot().version, version, 'unchanged sort does not bump the snapshot');
    engine.sort.column({ columnId: 'city', direction: 'asc', multi: true });
    engine.sort.remove({ columnId: 'qty' });
    assert.deepEqual(engine.getSnapshot().query.sorting, [{ columnId: 'city', direction: 'asc' }]);
    engine.sort.clear();
    assert.deepEqual(engine.getSnapshot().query.sorting, []);
  });

  it('uses custom comparers with raw values and rows', () => {
    const columns: ColumnDef<Item>[] = [
      { field: 'id' },
      { field: 'city', sortComparator: (a, b) => String(a).length - String(b).length },
    ];
    const { engine, ids } = make({ columns });
    engine.sort.toggle({ columnId: 'city' });
    assert.deepEqual(ids(), ['a', 'd', 'f', 'b', 'e', 'g', 'c', 'h']);
    engine.sort.toggle({ columnId: 'city' });
    assert.deepEqual(ids(), ['c', 'h', 'b', 'e', 'g', 'a', 'd', 'f']);
  });

  it('rejects unsortable, unknown, and disabled sorting', () => {
    const columns: ColumnDef<Item>[] = [{ field: 'id' }, { field: 'qty', sortable: false }];
    const { engine, w } = make({ columns });
    assert.deepEqual(engine.sort.toggle({ columnId: 'qty' }), { status: 'rejected', reason: 'columnNotSortable' });
    assert.deepEqual(engine.sort.toggle({ columnId: 'nope' }), { status: 'rejected', reason: 'unknownColumn' });
    assert.ok(w.codes().includes('column-unknown'));
    const off = make({ sort: { enabled: false } }).engine;
    assert.deepEqual(off.sort.toggle({ columnId: 'qty' }), { status: 'rejected', reason: 'sortingDisabled' });
    const locked = make({ sort: { allowUnsort: false } }).engine;
    locked.sort.toggle({ columnId: 'qty' });
    locked.sort.toggle({ columnId: 'qty' });
    locked.sort.toggle({ columnId: 'qty' });
    assert.deepEqual(locked.getSnapshot().query.sorting, [{ columnId: 'qty', direction: 'asc' }]);
  });

  it('puts grouped columns first', () => {
    const { engine, ids } = make({ defaultQuery: { grouping: [{ columnId: 'ok' }], sorting: [{ columnId: 'qty', direction: 'asc' }] } });
    assert.deepEqual(ids(), ['d', 'h', 'b', 'f', 'g', 'a', 'c', 'e']);
    engine.sort.set({ sorting: [{ columnId: 'ok', direction: 'desc' }, { columnId: 'qty', direction: 'asc' }] });
    assert.deepEqual(ids(), ['g', 'a', 'c', 'e', 'd', 'h', 'b', 'f']);
  });
});

describe('filter module', () => {
  const run = (filters: DataGridQueryInit['filters'], filter?: object) => make({ defaultQuery: { filters: filters ?? [] }, ...(filter ? { filter } : {}) }).ids();
  const c = (columnId: string, operator: string, value: unknown, extra: object = {}) => ({
    columnId,
    operator,
    value: value as never,
    predicate: 'and' as const,
    source: 'api' as const,
    ...extra,
  });

  it('string operators, case-insensitive by default', () => {
    assert.deepEqual(run([c('name', 'contains', 'APPLE')]), ['a', 'h']);
    assert.deepEqual(run([c('name', 'startsWith', 'c')]), ['c', 'f']);
    assert.deepEqual(run([c('name', 'endsWith', 'IE')]), ['h']);
    // negations exclude null/undefined cells
    assert.deepEqual(run([c('name', 'doesNotContain', 'apple')]), ['b', 'c', 'd', 'f']);
    assert.deepEqual(run([c('name', 'doesNotStartWith', 'c')]), ['a', 'b', 'd', 'h']);
    assert.deepEqual(run([c('name', 'doesNotEndWith', 'e')]), ['b', 'c', 'd']);
    assert.deepEqual(run([c('name', 'contains', 'Apple', { matchCase: true })]), ['a']);
    assert.deepEqual(run([c('name', 'contains', 'Apple')], { caseSensitive: true }), ['a']);
    assert.deepEqual(run([c('name', 'contains', 'Apple', { matchCase: false })], { caseSensitive: true }), ['a', 'h']);
  });

  it('empty and null operators: undefined and "" are empty, null is not', () => {
    assert.deepEqual(run([c('name', 'isEmpty', null)]), ['d', 'g']);
    assert.deepEqual(run([c('name', 'isNotEmpty', null)]), ['a', 'b', 'c', 'e', 'f', 'h']);
    assert.deepEqual(run([c('name', 'isNull', null)]), ['e', 'g']);
    assert.deepEqual(run([c('name', 'isNotNull', null)]), ['a', 'b', 'c', 'd', 'f', 'h']);
    assert.deepEqual(run([c('qty', 'equal', null)]), ['d']);
  });

  it('accent-insensitive matching', () => {
    assert.deepEqual(run([c('name', 'contains', 'creme')]), []);
    assert.deepEqual(run([c('name', 'contains', 'creme', { ignoreAccent: true })]), ['f']);
    assert.deepEqual(run([c('name', 'contains', 'brulee')], { ignoreAccent: true }), ['f']);
  });

  it('equality and ranges per type', () => {
    assert.deepEqual(run([c('qty', 'equal', 5)]), ['a', 'c']);
    assert.deepEqual(run([c('qty', 'equal', '5')]), ['a', 'c']);
    assert.deepEqual(run([c('qty', 'notEqual', 5)]), ['b', 'd', 'e', 'f', 'g', 'h']);
    assert.deepEqual(run([c('qty', 'greaterThan', 5)]), ['e', 'f']);
    assert.deepEqual(run([c('qty', 'greaterThanOrEqual', 5)]), ['a', 'c', 'e', 'f']);
    assert.deepEqual(run([c('qty', 'lessThan', 2)]), ['h']);
    assert.deepEqual(run([c('qty', 'lessThanOrEqual', 2)]), ['b', 'g', 'h']);
    assert.deepEqual(run([c('qty', 'between', [2, 5])]), ['a', 'b', 'c', 'g']);
    assert.deepEqual(run([c('ok', 'equal', true)]), ['a', 'c', 'e', 'g']);
    assert.deepEqual(run([c('ok', 'equal', 'false')]), ['b', 'd', 'f', 'h']);
    assert.deepEqual(run([c('name', 'equal', 'apple')]), ['a']);
    assert.deepEqual(run([c('name', 'greaterThan', 'c')]), ['c', 'f']);
  });

  it('date columns compare by calendar day, datetime by instant', () => {
    assert.deepEqual(run([c('when', 'equal', '2025-01-01')]), ['a', 'c']);
    assert.deepEqual(run([c('when', 'greaterThan', '2025-01-02')]), ['e', 'f', 'h']);
    assert.deepEqual(run([c('when', 'lessThanOrEqual', '2025-01-02')]), ['a', 'b', 'c', 'g']);
    assert.deepEqual(run([c('when', 'between', ['2025-01-02', '2025-01-03'])]), ['b', 'e', 'g']);
    assert.deepEqual(run([c('at', 'equal', new Date(2025, 0, 1, 10).toISOString())]), ['a']);
    assert.deepEqual(run([c('at', 'greaterThan', new Date(2025, 0, 4, 8).getTime())]), ['f']);
  });

  it('in / notIn with blanks', () => {
    assert.deepEqual(run([c('city', 'in', ['Tokyo', 'taipei'])]), ['a', 'b', 'd', 'e', 'f', 'g']);
    assert.deepEqual(run([c('city', 'notIn', ['Tokyo'])]), ['b', 'c', 'e', 'g', 'h']);
    assert.deepEqual(run([c('name', 'in', [null, 'banana'])]), ['b', 'd', 'e', 'g']);
    assert.deepEqual(run([c('qty', 'in', [2, 10])]), ['b', 'e', 'g']);
    assert.deepEqual(run([c('when', 'in', ['2025-01-01'])]), ['a', 'c']);
  });

  it('like and wildcard patterns', () => {
    assert.deepEqual(run([c('name', 'like', '%pie')]), ['h']);
    assert.deepEqual(run([c('name', 'like', 'a%')]), ['a', 'h']);
    assert.deepEqual(run([c('name', 'like', 'apple')]), ['a']);
    assert.deepEqual(run([c('name', 'wildcard', 'c*y')]), ['c']);
    assert.deepEqual(run([c('name', 'wildcard', 'b?nana')]), ['b']);
    assert.deepEqual(run([c('city', 'like', '*o*')]), ['a', 'd', 'f']);
    assert.ok(compilePattern('a.b%', 'like').test('a.bzz'));
    assert.ok(!compilePattern('a.b%', 'like').test('axbzz'));
  });

  it('folds conditions per column by predicate, ANDs columns, and nests groups', () => {
    assert.deepEqual(run([c('qty', 'equal', 2), c('qty', 'equal', 10, { predicate: 'or' })]), ['b', 'e', 'g']);
    assert.deepEqual(run([c('qty', 'equal', 2), c('city', 'equal', 'Taipei'), c('qty', 'equal', 10, { predicate: 'or' })]), ['b', 'e', 'g']);
    assert.deepEqual(run([c('qty', 'greaterThan', 1), c('qty', 'lessThan', 7)]), ['a', 'b', 'c', 'g']);
    const inner = { kind: 'group' as const, predicate: 'or' as const, filters: [c('ok', 'equal', true), c('qty', 'equal', 1)] };
    const group = { kind: 'group' as const, predicate: 'or' as const, filters: [c('city', 'equal', 'Tokyo'), inner] };
    // A group's predicate combines its members: city = Tokyo OR (ok OR qty = 1)
    assert.deepEqual(run([group]), ['a', 'c', 'd', 'e', 'f', 'g', 'h']);
    const andGroup = { ...group, predicate: 'and' as const };
    // city = Tokyo AND (ok OR qty = 1)
    assert.deepEqual(run([andGroup]), ['a']);
    // Member predicates are ignored inside a group.
    const memberOr = { kind: 'group' as const, predicate: 'and' as const, filters: [c('city', 'equal', 'Tokyo'), { ...inner, filters: [c('ok', 'equal', true, { predicate: 'or' }), c('qty', 'equal', 1, { predicate: 'or' })] }] };
    assert.deepEqual(run([memberOr]), ['a']);
    // Same-column groups fold pass tables with the group predicate.
    assert.deepEqual(run([{ kind: 'group' as const, predicate: 'or' as const, filters: [c('qty', 'equal', 2), c('qty', 'equal', 10)] }]), ['b', 'e', 'g']);
    assert.deepEqual(run([{ kind: 'group' as const, predicate: 'and' as const, filters: [c('qty', 'greaterThan', 1), c('qty', 'equal', 10, { predicate: 'or' })] }]), run([c('qty', 'equal', 10)]));
    assert.deepEqual(run([andGroup, c('qty', 'equal', 5)]), ['a']);
  });

  it('negates groups with not: folded single-column pass tables and row tests', () => {
    const all = run([]);
    const same = { kind: 'group' as const, predicate: 'or' as const, filters: [c('qty', 'equal', 2), c('qty', 'equal', 10)] };
    const kept = run([same]);
    assert.deepEqual(run([{ ...same, not: true }]), all.filter((id) => !kept.includes(id)));
    const cross = { kind: 'group' as const, predicate: 'and' as const, filters: [c('city', 'equal', 'Tokyo'), c('ok', 'equal', true)] };
    const crossKept = run([cross]);
    assert.deepEqual(run([{ ...cross, not: true }]), all.filter((id) => !crossKept.includes(id)));
    // A negated single-member group and a nested negation.
    const single = { kind: 'group' as const, predicate: 'and' as const, not: true, filters: [c('city', 'equal', 'Tokyo')] };
    assert.deepEqual(run([single]), run([c('city', 'notEqual', 'Tokyo')]));
    assert.deepEqual(run([{ kind: 'group' as const, predicate: 'and' as const, not: true, filters: [single] }]), run([c('city', 'equal', 'Tokyo')]));
    // An empty negated group drops nothing.
    assert.deepEqual(run([{ kind: 'group' as const, predicate: 'and' as const, not: true, filters: [] }]), all);
  });

  it('commands: byColumn, add, remove, clear, aliases, validation', () => {
    const { engine, ids, w } = make();
    engine.filter.byColumn({ columnId: 'city', operator: 'equal', value: ['Tokyo', 'Taipei'] });
    assert.deepEqual(ids(), ['a', 'b', 'd', 'e', 'f', 'g']);
    engine.filter.byColumn({ columnId: 'qty', operator: 'greaterthanorequal', value: 5 });
    assert.deepEqual(ids(), ['a', 'e', 'f']);
    assert.equal(engine.getSnapshot().query.filters[2]?.['operator' as never], 'greaterThanOrEqual');
    engine.filter.byColumn({ columnId: 'qty', operator: 'gt', value: 6 });
    assert.deepEqual(ids(), ['e', 'f']);
    engine.filter.add({ filters: [{ columnId: 'ok', operator: 'equal', value: true }] });
    assert.deepEqual(ids(), ['e']);
    engine.filter.remove({ columnId: 'qty' });
    assert.deepEqual(ids(), ['a', 'e', 'g']);
    engine.filter.clear({ columnIds: ['ok'] });
    assert.deepEqual(ids(), ['a', 'b', 'd', 'e', 'f', 'g']);
    engine.filter.clear();
    assert.equal(engine.getSnapshot().rows.count, items.length);
    assert.deepEqual(engine.filter.byColumn({ columnId: 'qty', operator: 'nope', value: 1 }), { status: 'rejected', reason: 'unknownOperator' });
    assert.deepEqual(engine.filter.byColumn({ columnId: 'zzz', operator: 'equal', value: 1 }), { status: 'rejected', reason: 'unknownColumn' });
    assert.ok(w.codes().includes('filter-operator-unknown'));
    const locked = make({ columns: [{ field: 'id' }, { field: 'qty', filterable: false }] }).engine;
    assert.deepEqual(locked.filter.byColumn({ columnId: 'qty', operator: 'equal', value: 1 }), { status: 'rejected', reason: 'columnNotFilterable' });
    const off = make({ filter: { enabled: false } }).engine;
    assert.deepEqual(off.filter.byColumn({ columnId: 'qty', operator: 'equal', value: 1 }), { status: 'rejected', reason: 'filteringDisabled' });
    assert.equal(normalizeFilterOperator('DoesNotStartWith'), 'doesNotStartWith');
  });

  it('custom operators run once per distinct value', () => {
    let calls = 0;
    const { engine, ids } = make({
      operators: {
        operators: {
          even: (value) => {
            calls++;
            return typeof value === 'number' && value % 2 === 0;
          },
        },
      },
    });
    engine.filter.byColumn({ columnId: 'qty', operator: 'even', value: null });
    assert.deepEqual(ids(), ['b', 'e', 'g']);
    assert.equal(calls, 6, 'distinct qty values: 5, 2, null, 10, 7, 1');
  });

  it('column filterComparator decides every built-in operator per distinct value', () => {
    const seen: string[] = [];
    // Cities match by a two-letter upper-case code; `contains` means "at most N characters".
    const columns: ColumnDef<Item>[] = itemColumns.map((col) =>
      col.field === 'city'
        ? {
            ...col,
            filterComparator: (value, filterValue, operator) => {
              seen.push(operator);
              const code = String(value).slice(0, 2).toUpperCase();
              if (operator === 'notEqual') return code !== filterValue;
              if (operator === 'in') return (filterValue as string[]).includes(code);
              if (operator === 'contains') return String(value).length <= Number(filterValue);
              return code === filterValue;
            },
          }
        : col,
    );
    const { engine, ids } = make({ columns });
    engine.filter.byColumn({ columnId: 'city', operator: 'equal', value: 'TA' });
    assert.deepEqual(ids(), ['b', 'e', 'g']);
    assert.deepEqual(seen, ['equal', 'equal', 'equal'], 'once per distinct value (Tokyo, Taipei, Kuala Lumpur)');
    engine.filter.byColumn({ columnId: 'city', operator: 'notequal', value: 'TA' });
    assert.deepEqual(ids(), ['a', 'c', 'd', 'f', 'h'], 'operators arrive normalized to camelCase');
    engine.filter.byColumn({ columnId: 'city', operator: 'in', value: ['TO', 'KU'] });
    assert.deepEqual(ids(), ['a', 'c', 'd', 'f', 'h']);
    // The comparator is opaque, so a longer needle never narrows the previous result.
    engine.filter.byColumn({ columnId: 'city', operator: 'contains', value: '1' });
    assert.deepEqual(ids(), []);
    engine.filter.byColumn({ columnId: 'city', operator: 'contains', value: '12' });
    assert.deepEqual(ids(), ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']);
    // Columns without a comparator keep the built-in operators.
    engine.filter.set({ filters: [{ columnId: 'name', operator: 'contains', value: 'apple' }] });
    assert.deepEqual(ids(), ['a', 'h']);
  });

  it('narrowing reuses the previous result and matches a fresh evaluation', () => {
    const { engine, ids } = make();
    const seen: string[][] = [];
    for (const text of ['a', 'ap', 'app', 'appl', 'apple', 'apple ']) {
      engine.filter.byColumn({ columnId: 'name', operator: 'contains', value: text });
      seen.push(ids());
      const fresh = make({ defaultQuery: { filters: [{ columnId: 'name', operator: 'contains', value: text, predicate: 'and', source: 'api' }] } }).ids();
      assert.deepEqual(ids(), fresh, text);
    }
    assert.deepEqual(seen.at(-1), ['h']);
    // Widening again (deleting characters) re-evaluates from the input.
    engine.filter.byColumn({ columnId: 'name', operator: 'contains', value: 'a' });
    assert.deepEqual(ids(), ['a', 'b', 'h']);
  });

  it('facets: counts exclude the own column filter, blanks share a key', () => {
    const { engine } = make();
    engine.filter.byColumn({ columnId: 'ok', operator: 'equal', value: true });
    engine.filter.byColumn({ columnId: 'city', operator: 'in', value: ['Tokyo'] });
    const facet = engine.filter.getFacet('city');
    assert.ok(facet);
    assert.equal(facet.status, 'ready');
    assert.equal(facet.rowCount, 4);
    assert.deepEqual(
      facet.values.map((v) => [v.key, v.count, v.selected]),
      [
        ['s:Kuala Lumpur', 1, false],
        ['s:Taipei', 2, false],
        ['s:Tokyo', 1, true],
      ],
    );
    assert.equal(engine.filter.getFacet('city'), facet, 'cached');
    // name facet over ok = true AND city in (Tokyo): only row a
    const names = engine.filter.getFacet('name');
    assert.deepEqual(names?.values.map((v) => [v.key, v.count]), [['s:Apple', 1]]);
    const all = make().engine;
    const blanks = all.filter.getFacet('name');
    assert.equal(blanks?.values[0]?.key, BLANK_FACET_KEY);
    assert.equal(blanks?.values[0]?.count, 3);
    assert.deepEqual(all.filter.getFacet('name', { search: 'APP' })?.values.map((v) => v.value), ['Apple', 'apple pie']);
    const limited = all.filter.getFacet('qty', { limit: 2 });
    assert.equal(limited?.values.length, 2);
    assert.equal(limited?.truncated, true);
    assert.deepEqual(all.filter.getFacet('when')?.values.slice(1, 2).map((v) => v.count), [2]);
    // Selecting facet values as an `in` filter round-trips through value.
    const tokyo = all.filter.getFacet('when')?.values.filter((v) => !v.blank).slice(0, 1).map((v) => v.value) ?? [];
    all.filter.byColumn({ columnId: 'when', operator: 'in', value: tokyo });
    assert.equal(all.getSnapshot().rows.count, 2);
  });
});

describe('search module', () => {
  it('searches all searchable non-date columns, case-insensitive by default', () => {
    const { engine, ids } = make();
    engine.search.set({ text: 'TAIPEI' });
    assert.deepEqual(ids(), ['b', 'e', 'g']);
    engine.search.set({ text: '10' });
    assert.deepEqual(ids(), ['e'], 'number columns match their string form');
    engine.search.set({ text: 'true' });
    assert.deepEqual(ids(), ['a', 'c', 'e', 'g']);
    engine.search.set({ text: 'Tokyo', ignoreCase: false, operator: 'equal' });
    assert.deepEqual(ids(), ['a', 'd', 'f']);
    engine.search.set({ text: 'creme', ignoreCase: true, ignoreAccent: true, operator: 'contains' });
    assert.deepEqual(ids(), ['f']);
    engine.search.set({ text: 'a', operator: 'startsWith', ignoreAccent: false, columnIds: ['name'] });
    assert.deepEqual(ids(), ['a', 'h']);
    engine.search.set({ text: 'ie', operator: 'endsWith' });
    assert.deepEqual(ids(), ['h']);
    engine.search.clear();
    assert.equal(engine.getSnapshot().query.search, null);
    assert.equal(engine.getSnapshot().rows.count, items.length);
  });

  it('respects allowSearching and searches explicit date columns by label', () => {
    const columns: ColumnDef<Item>[] = [{ field: 'id', searchable: false }, { field: 'city', searchable: false }, { field: 'when', type: 'date', format: 'yMd' }];
    const { engine, ids } = make({ columns });
    engine.search.set({ text: 'Tokyo' });
    assert.deepEqual(ids(), []);
    engine.search.set({ text: '1/5/2025', columnIds: ['when'] });
    assert.deepEqual(ids(), ['f']);
  });

  it('the keyless scan and the keyed path agree, including narrowing', () => {
    const data = Array.from({ length: 500 }, (_, i) => ({ ...(items[i % items.length] as Item), id: `r${i}`, city: `City ${i % 37}` }));
    const { engine, ids } = make({ data });
    const results: string[][] = [];
    for (const text of ['c', 'ci', 'city 1', 'city 12', 'city 1']) {
      engine.search.set({ text });
      results.push(ids());
      const expected = data.filter((r) => [r.id, r.name, r.qty, r.ok, r.city].some((v) => v != null && String(v).toLowerCase().includes(text)));
      assert.deepEqual(ids(), expected.map((r) => r.id), text);
    }
  });

  it('wildcard and like operators match the whole value with case and accent folding', () => {
    const { engine, ids } = make();
    engine.search.set({ text: 'T*o', operator: 'wildcard' });
    assert.deepEqual(ids(), ['a', 'd', 'f']);
    engine.search.set({ text: 'T*o', operator: 'wildcard' });
    assert.deepEqual(ids(), ['a', 'd', 'f'], 'keyed path agrees with the first keyless scan');
    engine.search.set({ text: 'ta?pei', operator: 'wildcard' });
    assert.deepEqual(ids(), ['b', 'e', 'g'], '? is one character');
    engine.search.set({ text: 'app', operator: 'wildcard', columnIds: ['name'] });
    assert.deepEqual(ids(), [], 'no implicit contains: the pattern spans the whole value');
    engine.search.set({ text: 'apple*', operator: 'wildcard' });
    assert.deepEqual(ids(), ['a', 'h']);
    engine.search.set({ text: '%pie', operator: 'like' });
    assert.deepEqual(ids(), ['h']);
    engine.search.set({ text: 'app%', operator: 'like' });
    assert.deepEqual(ids(), ['a', 'h']);
    engine.search.set({ text: '%an%', operator: 'like' });
    assert.deepEqual(ids(), ['b']);
    engine.search.set({ text: 'a?ple', operator: 'like' });
    assert.deepEqual(ids(), [], '? is literal in like');
    engine.search.set({ text: 'Ta%', operator: 'like', columnIds: ['city'], ignoreCase: false });
    assert.deepEqual(ids(), ['b', 'e', 'g']);
    engine.search.set({ text: 'ta%', operator: 'like', columnIds: ['city'], ignoreCase: false });
    assert.deepEqual(ids(), [], 'matchCase');
    engine.search.set({ text: 'creme*', operator: 'wildcard', columnIds: ['name'], ignoreCase: true, ignoreAccent: true });
    assert.deepEqual(ids(), ['f']);
    engine.search.set({ text: 'creme*', operator: 'wildcard', ignoreAccent: false });
    assert.deepEqual(ids(), [], 'ignoreAccents off');
    engine.search.set({ text: '1%', operator: 'like', columnIds: ['qty'] });
    assert.deepEqual(ids(), ['e', 'h'], 'number columns match their string form; pattern characters are not text');
    engine.search.set({ text: '?', operator: 'wildcard' });
    assert.deepEqual(ids(), ['a', 'b', 'c', 'f', 'g', 'h']);
    assert.deepEqual(engine.search.set({ text: 'x', operator: 'regex' as never }), { status: 'rejected', reason: 'invalidOperator' });
  });

  it('initial search from options', () => {
    const { ids } = make({ search: { key: 'kuala' } });
    assert.deepEqual(ids(), ['c', 'h']);
  });
});

describe('paging module', () => {
  it('pages the processed order without copying rows', () => {
    const { engine, ids } = make({ paging: { pageSize: 3 }, defaultQuery: { sorting: [{ columnId: 'id', direction: 'desc' }] } });
    assert.deepEqual(ids(), ['h', 'g', 'f']);
    assert.deepEqual(engine.paging.getInfo(), { enabled: true, page: 1, pageSize: 3, pageCount: 3, totalRowCount: 8, start: 0, end: 3 });
    engine.paging.goToPage({ page: 3 });
    assert.deepEqual(ids(), ['b', 'a']);
    assert.deepEqual(engine.paging.goToPage({ page: 4 }), { status: 'rejected', reason: 'pageOutOfRange' });
    assert.deepEqual(engine.paging.next(), { status: 'rejected', reason: 'pageOutOfRange' });
    engine.paging.previous();
    assert.equal(engine.paging.getInfo().page, 2);
    engine.paging.first();
    engine.paging.last();
    assert.equal(engine.paging.getInfo().page, 3);
    assert.equal(engine.paging.getInfo(), engine.paging.getInfo(), 'stable identity');
    assert.equal(engine.getRowIndex('h'), -1);
    assert.deepEqual(engine.getSnapshot().query.paging, { page: 3, pageSize: 3 });
  });

  it('page-size change keeps the first row and clamps', () => {
    const { engine } = make({ paging: { pageSize: 2, page: 3 } });
    engine.paging.setPageSize({ pageSize: 3 });
    assert.equal(engine.paging.getInfo().page, 2);
    engine.paging.setPageSize({ pageSize: 100 });
    assert.equal(engine.paging.getInfo().page, 1);
  });

  it('filter and search return to page 1; sort keeps the page', () => {
    const { engine } = make({ paging: { pageSize: 2, page: 2 } });
    engine.sort.toggle({ columnId: 'qty' });
    assert.equal(engine.getModuleState<{ page: number }>('paging')?.page, 2);
    engine.filter.byColumn({ columnId: 'ok', operator: 'equal', value: true });
    assert.equal(engine.getModuleState<{ page: number }>('paging')?.page, 1);
    engine.paging.goToPage({ page: 2 });
    engine.search.set({ text: 'a' });
    assert.equal(engine.getModuleState<{ page: number }>('paging')?.page, 1);
  });

  it('a shrinking data set clamps the effective page', () => {
    const source = createLocalDataSource(items, { getRowId: (r: Item) => r.id });
    const { engine, ids } = make({ data: source, paging: { pageSize: 2, page: 4 } });
    assert.deepEqual(ids(), ['g', 'h']);
    source.setRows(items.slice(0, 3));
    assert.equal(engine.paging.getInfo().page, 2);
    assert.deepEqual(ids(), ['c']);
  });

  it('remote sources: performed stages are skipped, totals come from totalRowCount', () => {
    const requests: string[] = [];
    const source: DataSource<Item> = {
      mode: 'remote',
      read(request) {
        requests.push(serializeDataGridQuery(request.query));
        return { version: request.version, rows: items.slice(0, 3), totalRowCount: 300, performed: ['search', 'filter', 'sort', 'page'] };
      },
    };
    const { engine, ids } = make({ data: source, paging: { pageSize: 3 } });
    assert.deepEqual(ids(), ['a', 'b', 'c']);
    assert.equal(engine.paging.getInfo().pageCount, 100);
    engine.paging.goToPage({ page: 7 });
    assert.equal(JSON.parse(requests.at(-1) as string).paging.page, 7);
    engine.sort.toggle({ columnId: 'qty' });
    assert.deepEqual(ids(), ['a', 'b', 'c'], 'server sorted; the core does not re-sort');
    assert.equal(engine.filter.getFacet('city')?.status, 'unavailable');
    const partial: DataSource<Item> = {
      mode: 'remote',
      read: (request) => ({ version: request.version, rows: items, totalRowCount: items.length, performed: ['search', 'filter'] }),
    };
    const p = make({ data: partial, paging: { pageSize: 3 } });
    p.engine.sort.toggle({ columnId: 'qty' });
    assert.deepEqual(p.ids(), ['d', 'h', 'b'], 'sort and page run locally when not performed');
  });
});

describe('pipeline memoization and serialization', () => {
  it('page changes and unrelated commands re-run no upstream stage', () => {
    const { engine } = make({ paging: { pageSize: 2 } });
    engine.filter.byColumn({ columnId: 'qty', operator: 'greaterThan', value: 1 });
    engine.sort.toggle({ columnId: 'qty' });
    engine.search.set({ text: 'a' });
    engine.getSnapshot();
    const before = engine.getInstrumentation()?.stageRuns ?? {};
    engine.paging.next();
    engine.columns.hide({ keys: ['city'] });
    engine.getSnapshot();
    const after = engine.getInstrumentation()?.stageRuns ?? {};
    assert.equal(after['search'], before['search']);
    assert.equal(after['filter'], before['filter']);
    assert.equal(after['sort'], before['sort']);
    assert.equal(after['page'], (before['page'] ?? 0) + 1);
  });

  it('round-trips search, nested filters, sorting, and paging', () => {
    const query = createDataGridQuery({
      search: { text: 'x', columnIds: ['name'], operator: 'endsWith', ignoreCase: true, ignoreAccent: true },
      filters: [
        { columnId: 'qty', operator: 'between', value: [1, 5], predicate: 'and', source: 'menu', matchCase: false },
        {
          kind: 'group',
          predicate: 'or',
          filters: [
            { columnId: 'name', operator: 'like', value: '%a%', predicate: 'and', source: 'excel', ignoreAccent: true },
            { columnId: 'city', operator: 'in', value: ['Tokyo', null], predicate: 'or', source: 'checkbox' },
          ],
        },
      ],
      sorting: [{ columnId: 'qty', direction: 'desc' }],
      paging: { page: 2, pageSize: 25 },
    });
    const text = serializeDataGridQuery(query);
    const back = deserializeDataGridQuery(text);
    assert.deepEqual(back, query);
    assert.equal(serializeDataGridQuery(back), text);
    const { ids } = make({ defaultQuery: back, paging: { pageSize: 25 } });
    assert.ok(Array.isArray(ids()));
  });
});

describe('DataGridApi query methods and module methods', () => {
  it('dispatches the query commands', () => {
    const { engine, ids } = make({ paging: { pageSize: 2 } });
    const api = createDataGridApi(engine);
    assert.equal(api.sortColumn('qty', 'desc').status, 'applied');
    api.sortColumn('city', 'asc', { multiple: true });
    assert.deepEqual(engine.getSnapshot().query.sorting.map((s) => s.columnId), ['qty', 'city']);
    api.removeSort('qty');
    api.clearSorting();
    assert.deepEqual(engine.getSnapshot().query.sorting, []);
    api.filterColumn('city', 'startswith', 'T', { matchCase: true });
    assert.equal(api.getPageInfo()?.totalRowCount, 6);
    assert.equal(api.goToPage(2).status, 'applied');
    assert.equal(api.getColumnFacet('city')?.values.length, 3);
    api.removeFilter('city');
    api.search('tokyo');
    assert.deepEqual(ids(), ['a', 'd']);
    api.search('');
    assert.equal(engine.getSnapshot().query.search, null);
    api.search('tokyo');
    api.clearSearch();
    assert.equal(engine.getSnapshot().query.search, null);
    api.filterColumn('qty', 'equal', 5, { logic: 'or', ignoreAccents: true });
    assert.deepEqual(engine.getSnapshot().query.filters.map((f) => f.kind === 'group' ? null : [f.predicate, f.ignoreAccent]), [['or', true]]);
    api.clearFiltering('qty');
    assert.equal(api.getPageInfo()?.totalRowCount, 8);
    assert.equal(api.setPageSize(3).status, 'applied');
    assert.equal(api.getPageInfo()?.pageSize, 3);
  });

  it('getFilteredRows: searched and filtered rows in sort order across every page', () => {
    const { engine } = make({ paging: { pageSize: 2 } });
    const api = createDataGridApi(engine);
    assert.equal(api.getFilteredRows().length, 8, 'unfiltered: every row');
    api.filterColumn('city', 'in', ['Tokyo', 'Taipei']);
    api.sortColumn('qty', 'desc');
    const rows = api.getFilteredRows();
    assert.equal(rows.length, api.getPageInfo()?.totalRowCount);
    assert.ok(rows.length > api.getViewRows().length, 'not just the page');
    assert.ok(rows.every((r) => r.city === 'Tokyo' || r.city === 'Taipei'));
    const qty = rows.flatMap((r) => (r.qty === null ? [] : [r.qty]));
    assert.deepEqual(qty, [...qty].sort((a, b) => b - a));
    assert.equal(api.getFilteredRows(), rows, 'cached while the model is unchanged');
    api.goToPage(2);
    assert.equal(api.getFilteredRows(), rows, 'a page change keeps the filtered rows');
    api.search('tokyo');
    assert.ok(api.getFilteredRows().every((r) => r.city === 'Tokyo'));
  });

  it('rejects a method that collides with a command action', () => {
    const bad = defineDataGridModule<Item, null, { type: 'x.go' }, 'x', { go: () => number }>({
      name: 'x',
      commands: ['x.go'],
      initialState: () => null,
      methods: { go: () => 1 },
    });
    assert.throws(() => createDataGridEngine({ getRowId: (r: Item) => r.id, columns: itemColumns, dataSource: items, modules: [bad] }), /collides with the command/);
  });
});

describe('search notEqual', () => {
  it('matches rows where any searched value differs from the text; never narrows', () => {
    const { engine } = make({ columns: [{ field: 'id', primaryKey: true, searchable: false }, { field: 'city', type: 'string' }, { field: 'qty', type: 'number', searchable: false }] });
    engine.dispatch({ type: 'search.set', text: 'Tokyo', operator: 'notEqual' });
    const count = engine.getSnapshot().rows.count;
    const cities = Array.from({ length: count }, (_, i) => engine.getRowAt(i)?.city);
    assert.equal(count, 5);
    assert.ok(cities.every((c) => c !== 'Tokyo'));
    engine.dispatch({ type: 'search.set', text: 'Tokyo2', operator: 'notEqual' });
    assert.equal(engine.getSnapshot().rows.count, 8);
  });
});
