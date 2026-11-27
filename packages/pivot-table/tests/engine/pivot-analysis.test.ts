// Pivot engine analysis features:
// aggregation types, show values as, cell override, label and value filters,
// member and value sort, totals, data compression, grouping, calculated fields.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { computePivot, createPivotEngine, measureId, type PivotAggregate, type PivotCustomAggregator, type PivotModelInput } from '@salmonui/pivot-table/engine';
import { assertNear, columnKeys, rowKeys, SALES, table } from './pivot-fixtures.ts';

const BY_REGION: PivotModelInput = { rows: [{ field: 'region' }], columns: [{ field: 'year' }], values: [{ field: 'amount', aggregate: 'sum' }] };
const close = (a: number | null, b: number, msg?: string) => assert.ok(a !== null && Math.abs(a - b) < 1e-9, `${msg ?? ''} ${a} vs ${b}`);

function naive(agg: PivotAggregate, values: unknown[]): number | null {
  const present = values.filter((v) => v !== null && v !== undefined && v !== '');
  const nums = present.filter((v): v is number => typeof v === 'number');
  const n = nums.length;
  const mean = nums.reduce((a, b) => a + b, 0) / n;
  const m2 = nums.reduce((a, b) => a + (b - mean) ** 2, 0);
  switch (agg) {
    case 'count':
      return present.length;
    case 'distinctCount':
      return new Set(present).size;
    case 'sum':
      return n ? nums.reduce((a, b) => a + b, 0) : null;
    case 'product':
      return n ? nums.reduce((a, b) => a * b, 1) : null;
    case 'min':
      return n ? Math.min(...nums) : null;
    case 'max':
      return n ? Math.max(...nums) : null;
    case 'average':
      return n ? mean : null;
    case 'median': {
      if (!n) return null;
      const s = [...nums].sort((a, b) => a - b);
      return n % 2 ? s[(n - 1) / 2]! : (s[n / 2 - 1]! + s[n / 2]!) / 2;
    }
    case 'populationVar':
      return n ? m2 / n : null;
    case 'sampleVar':
      return n > 1 ? m2 / (n - 1) : null;
    case 'populationStdev':
      return n ? Math.sqrt(m2 / n) : null;
    case 'sampleStdev':
      return n > 1 ? Math.sqrt(m2 / (n - 1)) : null;
    default:
      return null;
  }
}

const ALL: PivotAggregate[] = ['sum', 'product', 'count', 'distinctCount', 'min', 'max', 'average', 'median', 'populationStdev', 'sampleStdev', 'populationVar', 'sampleVar'];

describe('aggregation types', () => {
  it('computes every aggregate per member and in totals', () => {
    const r = computePivot({ data: SALES, model: { rows: [{ field: 'region' }], values: ALL.map((a) => ({ field: 'amount', aggregate: a, caption: a })), valuesPlacement: { axis: 'columns', index: -1 } } });
    assert.deepEqual(columnKeys(r), ALL.map((a) => `|amount#${a}`));
    assert.equal(new Set(columnKeys(r)).size, ALL.length);
    const groups = [['America'], ['Asia'], ['Europe'], ['America', 'Asia', 'Europe']];
    groups.forEach((g, i) => {
      const vals = SALES.filter((s) => g.includes(s.region)).map((s) => s.amount);
      ALL.forEach((a, c) => {
        const want = naive(a, vals);
        if (want === null) assert.equal(r.valueAt(i, c), null, `${g} ${a}`);
        else close(r.valueAt(i, c), want, `${g} ${a}`);
      });
    });
  });

  it('non-numeric fields aggregate with count and distinct count; numeric aggregates are empty', () => {
    const r = computePivot({
      data: SALES,
      model: { rows: [{ field: 'region' }], values: [{ field: 'country', aggregate: 'count' }, { field: 'country', aggregate: 'distinctCount' }, { field: 'country', aggregate: 'sum' }] },
    });
    assert.deepEqual(table(r), [
      ['America', 1, 1, null],
      ['Asia', 3, 2, null],
      ['Europe', 3, 2, null],
      ['Grand Total', 7, 5, null],
    ]);
  });

  it('custom mergeable aggregators', () => {
    const range: PivotCustomAggregator<[number, number]> = {
      init: () => [Infinity, -Infinity],
      add: (s, v) => [Math.min(s[0], v as number), Math.max(s[1], v as number)],
      merge: (a, b) => [Math.min(a[0], b[0]), Math.max(a[1], b[1])],
      result: (s) => (s[0] === Infinity ? null : s[1] - s[0]),
    };
    const r = computePivot({ data: SALES, customAggregates: { range: range as PivotCustomAggregator }, model: { rows: [{ field: 'region' }], columns: [{ field: 'year' }], values: [{ field: 'amount', aggregate: 'custom', customId: 'range' }] } });
    assert.deepEqual(table(r), [
      ['America', 0, null, 0],
      ['Asia', 100, 0, 150],
      ['Europe', 0, 250, 250],
      ['Grand Total', 200, 350, 350],
    ]);
  });
});

describe('show values as', () => {
  const run = (showAs: object, extra: PivotModelInput = {}) => computePivot({ data: SALES, model: { ...BY_REGION, ...extra, values: [{ field: 'amount', aggregate: 'sum', showAs: showAs as never }] } });
  it('percent of grand, column and row totals', () => {
    close(run({ kind: 'percentOfGrandTotal' }).valueAt(1, 0), 300 / 1450);
    const col = run({ kind: 'percentOfColumnTotal' });
    close(col.valueAt(1, 0), 300 / 850);
    close(col.valueAt(1, 2), 350 / 1450);
    close(run({ kind: 'percentOfRowTotal' }).valueAt(1, 0), 300 / 350);
    assert.equal(run({ kind: 'percentOfRowTotal' }).cellAt(1, 0).formattedValue, '85.71%');
  });

  it('percent of parent row, column and base-field totals', () => {
    const rows = run({ kind: 'percentOfParentRowTotal' }, { rows: [{ field: 'region' }, { field: 'country' }], expanded: 'all' });
    const t = table(rows);
    close(t.find((r) => r[0] === 'France')![2] as number, 400 / 550);
    close(t.find((r) => r[0] === 'Japan')![1] as number, 1);
    const cols = run({ kind: 'percentOfParentColumnTotal' }, { columns: [{ field: 'year' }, { field: 'quarter' }], expanded: 'all' });
    assert.equal(columnKeys(cols)[0], '[2024,"Q1"]|amount');
    close(cols.valueAt(1, 0), 100 / 300);
    const parent = run({ kind: 'percentOfParentTotal', baseField: 'region' }, { rows: [{ field: 'region' }, { field: 'country' }], expanded: 'all' });
    close(table(parent).find((r) => r[0] === 'France')![3] as number, 700 / 850);
    close(table(parent).find((r) => r[0] === 'Europe')![3] as number, 1);
  });

  it('running totals and percent of running total along a base field', () => {
    const r = table(run({ kind: 'runningTotal', baseField: 'region' }));
    assert.deepEqual(r, [
      ['America', 250, null, 250],
      ['Asia', 550, 50, 600],
      ['Europe', 850, 600, 1450],
      ['Grand Total', 850, 600, 1450],
    ]);
    close(run({ kind: 'percentOfRunningTotal', baseField: 'region' }).valueAt(1, 0), 550 / 850);
    // Running along the column field.
    assert.deepEqual(table(run({ kind: 'runningTotal', baseField: 'year' }))[1], ['Asia', 300, 350, 350]);
  });

  it('difference from and percent of difference from a base item', () => {
    const d = run({ kind: 'differenceFrom', baseField: 'year', baseItem: 2024 });
    assert.deepEqual(table(d)[1], ['Asia', null, -250, null]);
    close(run({ kind: 'percentOfDifferenceFrom', baseField: 'year', baseItem: 2024 }).valueAt(2, 1), (550 - 300) / 300);
    assert.equal(run({ kind: 'differenceFrom', baseField: 'year', baseItem: 1999 }).valueAt(1, 1), null);
  });

  it('index', () => {
    close(run({ kind: 'index' }).valueAt(1, 0), (300 * 1450) / (350 * 850));
    close(run({ kind: 'index' }).valueAt(3, 2), 1);
  });

  it('keeps the raw aggregate on the cell', () => {
    const c = run({ kind: 'percentOfGrandTotal' }).cellAt(3, 2);
    assert.equal(c.rawValue, 1450);
    assert.equal(c.value, 1);
    assert.equal(c.formattedValue, '100%');
  });
});

describe('cell value override', () => {
  it('getCellValue rewrites values and their display, purely', () => {
    const e = createPivotEngine({ data: SALES, model: BY_REGION, getCellValue: (c) => (c.kind === 'grandTotal' ? null : c.value === null ? null : c.value * 2) });
    const r = e.getSnapshot();
    assert.equal(r.valueAt(1, 0), 600);
    assert.equal(r.cellAt(1, 0).formattedValue, '600');
    assert.equal(r.cellAt(1, 0).rawValue, 300);
    assert.equal(r.valueAt(3, 0), null);
    assert.equal(r.cellAt(3, 0).formattedValue, '');
  });
});

describe('label filters', () => {
  const total = (filterBy: object, extra: PivotModelInput = {}) => {
    const r = computePivot({ data: SALES, fields: [{ field: 'date', type: 'date' }, { field: 'country' }, { field: 'region' }, { field: 'year' }, { field: 'amount' }], model: { ...BY_REGION, ...extra, filterBy: filterBy as never } });
    return r.valueAt(r.rowCount - 1, r.columnCount - 1);
  };
  const country: PivotModelInput = { rows: [{ field: 'region' }, { field: 'country' }] };
  it('string operators, case sensitivity and clearing', () => {
    assert.equal(total({ country: { label: { operator: 'contains', value: 'AN' } } }, country), 1150);
    assert.equal(total({ country: { label: { operator: 'contains', value: 'AN', caseSensitive: true } } }, country), null);
    assert.equal(total({ country: { label: { operator: 'doesNotContain', value: 'an' } } }, country), 300);
    assert.equal(total({ country: { label: { operator: 'startsWith', value: 'g' } } }, country), 150);
    assert.equal(total({ country: { label: { operator: 'doesNotStartWith', value: 'g' } } }, country), 1300);
    assert.equal(total({ country: { label: { operator: 'endsWith', value: 'a' } } }, country), 300);
    assert.equal(total({ country: { label: { operator: 'doesNotEndWith', value: 'a' } } }, country), 1150);
    assert.equal(total({ country: { label: { operator: 'equal', value: 'japan' } } }, country), 300);
    assert.equal(total({ country: { label: { operator: 'notEqual', value: 'japan' } } }, country), 1150);
    assert.equal(total({ country: { label: { operator: 'between', value: 'F', value2: 'H' } } }, country), 850);
    assert.equal(total({ country: { label: { operator: 'notBetween', value: 'F', value2: 'H' } } }, country), 600);
    assert.equal(total({}, country), 1450);
  });

  it('number and date members compare by value', () => {
    assert.equal(total({ year: { label: { operator: 'greaterThan', value: 2024 } } }), 600);
    assert.equal(total({ year: { label: { operator: 'lessThanOrEqual', value: 2024 } } }), 850);
    const byDate: PivotModelInput = { rows: [{ field: 'date' }] };
    assert.equal(total({ date: { label: { operator: 'greaterThan', value: '2025-01-01' } } }, byDate), 600);
    assert.equal(total({ date: { label: { operator: 'between', value: '2024-03-01', value2: '2024-06-30' } } }, byDate), 750);
    assert.equal(total({ date: { label: { operator: 'lessThan', value: '2024-02-01' } } }, byDate), 100);
  });

  it('member include and exclude filters', () => {
    assert.equal(total({ region: { include: ['Asia', 'America'] } }), 600);
    assert.equal(total({ region: { exclude: ['Asia'] } }), 1100);
  });
});

describe('value filters', () => {
  const run = (filterBy: object, extra: PivotModelInput = {}) => computePivot({ data: SALES, model: { ...BY_REGION, ...extra, filterBy: filterBy as never } });
  it('compares member totals and totals reflect the kept members', () => {
    assert.deepEqual(table(run({ region: { value: { measure: 'amount', operator: 'greaterThan', value: 400 } } })), [
      ['Europe', 300, 550, 850],
      ['Grand Total', 300, 550, 850],
    ]);
    assert.deepEqual(table(run({ region: { value: { measure: 'amount', operator: 'between', value: 300, value2: 900 } } })).map((r) => r[0]), ['Asia', 'Europe', 'Grand Total']);
    assert.deepEqual(table(run({ region: { value: { measure: 'amount', operator: 'notBetween', value: 300, value2: 900 } } })).map((r) => r[0]), ['America', 'Grand Total']);
    assert.deepEqual(table(run({ region: { value: { measure: 'amount', operator: 'lessThan', value: 300 } } })).map((r) => r[0]), ['America', 'Grand Total']);
  });

  it('top and bottom N, per parent', () => {
    assert.deepEqual(table(run({ region: { value: { measure: 'amount', operator: 'top', value: 2 } } })).map((r) => [r[0], r[3]]), [
      ['Asia', 350],
      ['Europe', 850],
      ['Grand Total', 1200],
    ]);
    assert.deepEqual(table(run({ region: { value: { measure: 'amount', operator: 'bottom', value: 1 } } })).map((r) => r[0]), ['America', 'Grand Total']);
    const nested = run({ country: { value: { measure: 'amount', operator: 'top', value: 1 } } }, { rows: [{ field: 'region' }, { field: 'country' }], expanded: 'all' });
    assert.deepEqual(table(nested).map((r) => [r[0], r[3]]), [
      ['America', 250],
      ['USA', 250],
      ['Asia', 300],
      ['Japan', 300],
      ['Europe', 700],
      ['France', 700],
      ['Grand Total', 1250],
    ]);
  });

  it('filters column members too, and clears', () => {
    const r = run({ year: { value: { measure: 'amount', operator: 'greaterThan', value: 700 } } });
    assert.deepEqual(columnKeys(r), ['[2024]|amount', '|amount']);
    assert.equal(r.valueAt(r.rowCount - 1, 1), 850);
    assert.equal(run({}).columnCount, 3);
  });
});

describe('member sort', () => {
  const labels = (model: PivotModelInput, data: readonly object[] = SALES, locale?: string) =>
    table(computePivot({ data, model, ...(locale ? { locale } : {}) }))
      .map((r) => r[0])
      .slice(0, -1);
  it('ascending by default, descending, none (data order) and a custom order', () => {
    assert.deepEqual(labels(BY_REGION), ['America', 'Asia', 'Europe']);
    assert.deepEqual(labels({ ...BY_REGION, sort: { region: 'desc' } }), ['Europe', 'Asia', 'America']);
    assert.deepEqual(labels({ ...BY_REGION, sort: { region: 'none' } }), ['Asia', 'Europe', 'America']);
    assert.deepEqual(labels({ ...BY_REGION, sort: { region: { order: ['Europe'] } } }), ['Europe', 'America', 'Asia']);
    const cols = computePivot({ data: SALES, model: { ...BY_REGION, sort: { year: 'desc' } } });
    assert.deepEqual(columnKeys(cols), ['[2025]|amount', '[2024]|amount', '|amount']);
  });

  it('alphanumeric (numeric-aware) and locale-aware', () => {
    const data = ['Item 10', 'Item 2', 'Item 1', 'item 3'].map((k) => ({ k, v: 1 }));
    assert.deepEqual(labels({ rows: [{ field: 'k' }], values: [{ field: 'v', aggregate: 'sum' }] }, data), ['Item 1', 'Item 2', 'item 3', 'Item 10']);
    const words = ['z', 'ä', 'a'].map((k) => ({ k, v: 1 }));
    const m: PivotModelInput = { rows: [{ field: 'k' }], values: [{ field: 'v', aggregate: 'sum' }] };
    assert.deepEqual(labels(m, words, 'de'), ['a', 'ä', 'z']);
    assert.deepEqual(labels(m, words, 'sv'), ['a', 'z', 'ä']);
  });
});

describe('value sort', () => {
  const two: PivotModelInput = { ...BY_REGION, rows: [{ field: 'region' }, { field: 'country' }], expanded: 'all' };
  it('sorts row members by one column tuple, empty values last', () => {
    const r = computePivot({ data: SALES, model: { ...BY_REGION, valueSort: { columnKey: '[2025]|amount', measure: 'amount', direction: 'desc' } } });
    assert.deepEqual(table(r).map((x) => x[0]), ['Europe', 'Asia', 'America', 'Grand Total']);
    const g = computePivot({ data: SALES, model: { ...BY_REGION, sort: { region: 'desc' }, valueSort: { columnKey: '', measure: 'amount', direction: 'asc' } } });
    assert.deepEqual(table(g).map((x) => x[0]), ['America', 'Asia', 'Europe', 'Grand Total']);
  });

  it('innermost level only, or every level with multipleAxis', () => {
    const inner = computePivot({ data: SALES, model: { ...two, valueSort: { columnKey: '', measure: 'amount', direction: 'asc' } } });
    assert.deepEqual(table(inner).map((x) => x[0]), ['America', 'USA', 'Asia', 'India', 'Japan', 'Europe', 'Germany', 'France', 'Grand Total']);
    const all = computePivot({ data: SALES, model: { ...two, valueSort: { columnKey: '', measure: 'amount', direction: 'desc', multipleAxis: true } } });
    assert.deepEqual(table(all).map((x) => x[0]), ['Europe', 'France', 'Germany', 'Asia', 'Japan', 'India', 'America', 'USA', 'Grand Total']);
  });
});

describe('grand totals and subtotals', () => {
  const two: PivotModelInput = { ...BY_REGION, rows: [{ field: 'region' }, { field: 'country' }], columns: [{ field: 'year' }, { field: 'quarter' }], expanded: 'all' };
  const run = (extra: PivotModelInput) => computePivot({ data: SALES, model: { ...BY_REGION, ...extra } });
  it('grand totals on both, rows, columns or none, at the end or the start', () => {
    assert.deepEqual([run({}).rowCount, run({}).columnCount], [4, 3]);
    const none = run({ totals: { grand: 'none', grandPosition: 'end', sub: true, subPosition: 'auto' } });
    assert.deepEqual([none.rowCount, none.columnCount], [3, 2]);
    const rowsOnly = run({ totals: { grand: 'rows', grandPosition: 'end', sub: true, subPosition: 'auto' } });
    assert.deepEqual([rowsOnly.rowCount, rowsOnly.columnCount], [4, 2]);
    const colsOnly = run({ totals: { grand: 'columns', grandPosition: 'end', sub: true, subPosition: 'auto' } });
    assert.deepEqual([colsOnly.rowCount, colsOnly.columnCount], [3, 3]);
    const start = run({ totals: { grand: 'both', grandPosition: 'start', sub: true, subPosition: 'auto' } });
    assert.equal(start.memberAt('rows', 0).kind, 'grandTotal');
    assert.equal(start.memberAt('columns', 0).key, '|amount');
    assert.equal(start.valueAt(0, 0), 1450);
  });

  it('subtotals: compact parent rows carry them; end position adds total rows and columns', () => {
    const auto = computePivot({ data: SALES, model: two });
    assert.equal(auto.memberAt('rows', 0).label, 'America');
    assert.equal(auto.cellAt(0, auto.columnCount - 1).kind, 'grandTotal');
    assert.equal(auto.cellAt(0, 0).kind, 'subtotal');
    assert.equal(auto.valueAt(2, 2), 300); // Asia, 2024 subtotal column
    assert.deepEqual(columnKeys(auto).slice(0, 3), ['[2024,"Q1"]|amount', '[2024,"Q2"]|amount', '[2024]|amount']);
    const end = computePivot({ data: SALES, model: { ...two, totals: { grand: 'both', grandPosition: 'end', sub: true, subPosition: 'end' } } });
    assert.deepEqual(rowKeys(end).slice(0, 3), ['["America"]', '["America","USA"]', '["America"]|total']);
    assert.equal(end.memberAt('rows', 2).label, 'America Total');
    assert.equal(end.valueAt(0, 2), null);
    assert.equal(end.valueAt(2, 2), 250);
    const startCols = computePivot({ data: SALES, model: { ...two, totals: { grand: 'both', grandPosition: 'end', sub: true, subPosition: 'start' } } });
    assert.deepEqual(columnKeys(startCols).slice(0, 3), ['[2024]|amount', '[2024,"Q1"]|amount', '[2024,"Q2"]|amount']);
  });

  it('hides subtotals globally, per field and per axis field', () => {
    const counts = (extra: PivotModelInput) => {
      const r = computePivot({ data: SALES, model: { ...two, ...extra } });
      return [r.rowCount, r.columnCount, r.valueAt(0, r.columnCount - 1)];
    };
    assert.deepEqual(counts({}), [9, 7, 250]);
    assert.deepEqual(counts({ totals: { grand: 'both', grandPosition: 'end', sub: false, subPosition: 'auto' } }), [9, 5, null]);
    assert.deepEqual(counts({ totals: { grand: 'both', grandPosition: 'end', sub: { year: false }, subPosition: 'auto' } }), [9, 5, 250]);
    assert.deepEqual(counts({ rows: [{ field: 'region', showSubTotals: false }, { field: 'country' }] }), [9, 7, null]);
  });
});

describe('data compression', () => {
  const data = Array.from({ length: 20_000 }, (_, i) => ({ g: `g${i % 7}`, h: `h${(i * 7) % 5}`, v: (i * 13) % 97, w: i % 11 === 0 ? null : (i * 3) % 17, tag: `t${i % 23}` }));
  const values: PivotModelInput['values'] = [
    { field: 'v', aggregate: 'sum', caption: 'sum' },
    { field: 'v', aggregate: 'average', caption: 'avg' },
    { field: 'tag', aggregate: 'distinctCount', caption: 'dc' },
    { field: 'w', aggregate: 'sampleStdev', caption: 'sd' },
    { field: 'v', aggregate: 'median', caption: 'median' },
    { field: 'w', aggregate: 'count', caption: 'count' },
  ];
  const model: PivotModelInput = { rows: [{ field: 'g' }], columns: [{ field: 'h' }], values, valuesPlacement: { axis: 'rows', index: -1 } };
  it('pre-aggregates identical axis tuples automatically and never downgrades average or distinct count', () => {
    const e = createPivotEngine({ data, model });
    const d = e.getDiagnostics();
    assert.equal(d.compressed, true);
    assert.equal(d.units, 35);
    assert.equal(d.rows, 20_000);
    const r = e.getSnapshot();
    for (let i = 0; i < r.rowCount; i++) {
      const h = r.memberAt('rows', i);
      if (h.kind !== 'value') continue;
      for (let c = 0; c < r.columnCount; c++) {
        const ch = r.memberAt('columns', c);
        const spec = values!.find((v, k) => measureId(values!, k) === h.measure)!;
        const rows = data.filter((x) => (h.path.length === 0 || x.g === h.path[0]) && (ch.path.length === 0 || x.h === ch.path[0]));
        const want = naive(spec.aggregate, rows.map((x) => x[spec.field as 'v']));
        if (want === null) assert.equal(r.valueAt(i, c), null);
        else close(r.valueAt(i, c), want, `${h.key} ${ch.key} ${spec.aggregate}`);
      }
    }
  });

  it('is skipped when it cannot shrink the units', () => {
    const e = createPivotEngine({ data: SALES, model: BY_REGION });
    assert.equal(e.getDiagnostics().compressed, false);
    const unique = Array.from({ length: 4000 }, (_, i) => ({ a: `a${i}`, v: i }));
    assert.equal(createPivotEngine({ data: unique, model: { rows: [{ field: 'a' }], values: [{ field: 'v', aggregate: 'sum' }] } }).getDiagnostics().compressed, false);
  });

  it('compressed and raw units give the same drill results', () => {
    const big = Array.from({ length: 8000 }, (_, i) => ({ g: `g${i % 3}`, k: `k${i % 4}`, h: `h${i % 2}`, v: i % 9 }));
    const m: PivotModelInput = { rows: [{ field: 'g' }, { field: 'k' }], columns: [{ field: 'h' }], values: [{ field: 'v', aggregate: 'average' }], expanded: [['rows', 'g1']] };
    const e = createPivotEngine({ data: big, model: m });
    assert.equal(e.getDiagnostics().compressed, true);
    const small = createPivotEngine({ data: big.slice(0, 1000), model: m });
    assert.equal(small.getDiagnostics().compressed, false);
    assertNear(table(e.getSnapshot()).slice(0, 2), table(computePivot({ data: big, model: m })).slice(0, 2));
    assert.deepEqual(e.getSnapshot().rowsAt(1, 0).length, big.filter((x) => x.g === 'g1' && x.h === 'h0').length);
  });
});

describe('grouping (engine half)', () => {
  it('number ranges with an interval', () => {
    const r = computePivot({ data: SALES, model: { rows: [{ field: 'amount' }], values: [{ field: 'units', aggregate: 'sum' }], groups: { amount: { kind: 'number', start: 0, interval: 200 } } } });
    assert.deepEqual(table(r), [
      ['0-199', 7],
      ['200-399', 7],
      ['400-599', 4],
      ['Grand Total', 18],
    ]);
    const clipped = computePivot({ data: SALES, model: { rows: [{ field: 'amount' }], values: [{ field: 'units', aggregate: 'sum' }], groups: { amount: { kind: 'number', start: 100, end: 300, interval: 100 } } } });
    assert.deepEqual(table(clipped).map((x) => x[0]), ['< 100', '100-199', '200-299', '300-399', '> 300', 'Grand Total']);
  });

  it('date parts become nested levels', () => {
    const r = computePivot({
      data: SALES,
      fields: [{ field: 'date', type: 'date' }, { field: 'amount' }],
      model: { rows: [{ field: 'date' }], values: [{ field: 'amount', aggregate: 'sum' }], groups: { date: { kind: 'date', parts: ['years', 'quarters', 'months'] } }, expanded: 'all' },
    });
    assert.equal(r.rowDepth, 3);
    assert.deepEqual(
      table(r).slice(0, 6).map((x) => [x[0], x[1]]),
      [
        ['2024', 850],
        ['Q1', 400],
        ['Jan', 100],
        ['Mar', 300],
        ['Q2', 450],
        ['Apr', 200],
      ],
    );
    assert.equal(r.memberAt('rows', 1).field, 'date_quarters');
    const one = computePivot({ data: SALES, fields: [{ field: 'date', type: 'date' }, { field: 'amount' }], model: { rows: [{ field: 'date' }], values: [{ field: 'amount', aggregate: 'sum' }], groups: { date: { kind: 'date', parts: ['quarterYear'] } } } });
    assert.deepEqual(table(one).map((x) => x[0]), ['Q1 2024', 'Q2 2024', 'Q1 2025', 'Q2 2025', 'Grand Total']);
  });

  it('custom groups', () => {
    const r = computePivot({ data: SALES, model: { rows: [{ field: 'country' }], values: [{ field: 'amount', aggregate: 'sum' }], groups: { country: { kind: 'custom', groups: [{ caption: 'Asia-Pacific', members: ['Japan', 'India'] }] } } } });
    assert.deepEqual(table(r), [
      ['Asia-Pacific', 350],
      ['France', 700],
      ['Germany', 150],
      ['USA', 250],
      ['Grand Total', 1450],
    ]);
  });
});

describe('calculated fields (engine half)', () => {
  it('evaluates formulas over aggregated measures in every cell', () => {
    const r = computePivot({
      data: SALES,
      model: {
        ...BY_REGION,
        calculatedFields: [
          { name: 'price', formula: '"Sum(amount)" / "Sum(units)"', format: { number: { maximumFractionDigits: 1 } } },
          { name: 'big', formula: 'IF(Sum(amount) > 300, 1, 0)' },
        ],
        values: [{ field: 'price', aggregate: 'sum' }, { field: 'big', aggregate: 'sum' }],
      },
    });
    assert.deepEqual(columnKeys(r).slice(0, 2), ['[2024]|price', '[2024]|big']);
    close(r.valueAt(1, 4), 350 / 8);
    assert.equal(r.cellAt(1, 4).formattedValue, '43.8');
    assert.equal(r.valueAt(1, 5), 1);
    assert.equal(r.valueAt(0, 5), 0);
    assert.equal(r.valueAt(0, 2), null);
  });

  it('reports formula errors with their position and leaves the cells empty', () => {
    const r = computePivot({ data: SALES, model: { ...BY_REGION, calculatedFields: [{ name: 'x', formula: 'Sum(nope) * 2' }], values: [{ field: 'x', aggregate: 'sum' }] } }) as ReturnType<typeof computePivot> & { errors: { name: string; position: number }[] };
    assert.equal(r.errors[0]!.name, 'x');
    assert.equal(r.errors[0]!.position, 0);
    assert.equal(r.valueAt(0, 0), null);
  });
});
