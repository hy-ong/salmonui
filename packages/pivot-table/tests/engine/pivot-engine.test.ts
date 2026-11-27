// Pivot engine: report model,
// data binding, field definitions, values placement, empty members, the
// result accessors, incremental data updates, the resumable job.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  computePivot,
  createPivotEngine,
  createPivotJob,
  DEFAULT_PIVOT_MODEL,
  normalizePivotModel,
  parseCsv,
  stableStringifyModel,
  type PivotCell,
  type PivotModelInput,
  type PivotResult,
} from '@salmonui/pivot-table/engine';
import { assertNear, columnKeys, rowKeys, SALES, table, type SaleRow } from './pivot-fixtures.ts';

const BASE: PivotModelInput = {
  rows: [{ field: 'region' }, { field: 'country' }],
  columns: [{ field: 'year' }],
  values: [{ field: 'amount', aggregate: 'sum' }],
};

describe('report model', () => {
  it('normalizes every default and is stable', () => {
    const m = normalizePivotModel({ rows: [{ field: 'a' }] });
    assert.deepEqual(m.columns, []);
    assert.deepEqual(m.totals, { grand: 'both', grandPosition: 'end', sub: true, subPosition: 'auto' });
    assert.deepEqual(m.valuesPlacement, { axis: 'columns', index: -1 });
    assert.equal(m.valueSort, null);
    assert.equal(m.showEmptyMembers, false);
    assert.deepEqual(normalizePivotModel(m), m);
    assert.ok(Object.isFrozen(m) && Object.isFrozen(m.rows) && Object.isFrozen(m.totals));
    assert.deepEqual(normalizePivotModel(), DEFAULT_PIVOT_MODEL);
    assert.deepEqual(normalizePivotModel({ totals: { grand: 'none' } as never }).totals.subPosition, 'auto');
  });

  it('stableStringifyModel omits defaults and sorts keys', () => {
    assert.equal(stableStringifyModel({}), '{}');
    const a = stableStringifyModel({ values: [{ aggregate: 'sum', field: 'x' }], rows: [{ field: 'a' }] });
    const b = stableStringifyModel({ rows: [{ field: 'a' }], values: [{ field: 'x', aggregate: 'sum' }], filterBy: {} });
    assert.equal(a, b);
    assert.equal(a, '{"rows":[{"field":"a"}],"values":[{"aggregate":"sum","field":"x"}]}');
  });

  it('places fields on rows, columns, values and filters; filters apply only to placed fields', () => {
    const e = createPivotEngine({ data: SALES, model: { ...BASE, filters: [{ field: 'product' }], filterBy: { product: { include: ['Bike'] } } } });
    assert.deepEqual(table(e.getSnapshot()), [
      ['America', 250, null, 250],
      ['Asia', 100, 50, 150],
      ['Europe', 300, null, 300],
      ['Grand Total', 650, 50, 700],
    ]);
    // Removing the field from the filter axis drops its filter.
    const r = e.setModel((m) => ({ ...m, filters: [] }));
    assert.equal(r.valueAt(r.rowCount - 1, r.columnCount - 1), 1450);
    assert.deepEqual(e.getModel().filters, []);
  });

  it('getSnapshot keeps its identity until the result changes; subscribers are notified', () => {
    const e = createPivotEngine({ data: SALES, model: BASE });
    const first = e.getSnapshot();
    let calls = 0;
    const off = e.subscribe(() => calls++);
    assert.equal(e.setModel(BASE), first);
    assert.equal(calls, 0);
    const next = e.expand(['rows', 'Asia']);
    assert.notEqual(next, first);
    assert.equal(e.getSnapshot(), next);
    assert.equal(next.version, first.version + 1);
    assert.equal(calls, 1);
    off();
    e.collapse(['rows', 'Asia']);
    assert.equal(calls, 1);
  });
});

describe('local JSON data by reference', () => {
  it('reads rows in place and returns the same objects', () => {
    const e = createPivotEngine({ data: SALES, model: { ...BASE, expanded: 'all' } });
    const r = e.getSnapshot();
    assert.equal(e.getRawRows([3])[0], SALES[3]);
    const keys = rowKeys(r);
    const france = keys.indexOf('["Europe","France"]');
    const rows = e.drillThrough(france, r.columnCount - 1);
    assert.equal(rows.length, 2);
    assert.ok(rows.every((x) => SALES.includes(x)));
    assert.deepEqual(r.rowsAt(france, 0), [3]);
  });

  it('computePivot is a one-shot compute with the same result', () => {
    assert.deepEqual(table(computePivot({ data: SALES, model: BASE })), table(createPivotEngine({ data: SALES, model: BASE }).getSnapshot()));
  });

  it('handles empty data and missing values', () => {
    const r = computePivot({ data: [], model: BASE });
    assert.equal(r.rowCount, 1);
    assert.deepEqual(table(r), [['Grand Total', null]]);
    const blanks = computePivot({ data: [{ a: null, v: 1 }, { a: 'x', v: 2 }, { v: 3 }], model: { rows: [{ field: 'a' }], values: [{ field: 'v', aggregate: 'sum' }] } });
    assert.deepEqual(table(blanks), [
      ['(Blank)', 4],
      ['x', 2],
      ['Grand Total', 6],
    ]);
  });
});

describe('CSV data', () => {
  it('parses quoted fields, escaped quotes, CRLF, a BOM and infers numbers', () => {
    const csv = '﻿region,city,amount\r\nAsia,"Tokyo, JP",10\r\n"Eu""rope",Paris,2.5\r\nAsia,Osaka,\r\n';
    const rows = parseCsv(csv);
    assert.deepEqual(rows, [
      { region: 'Asia', city: 'Tokyo, JP', amount: 10 },
      { region: 'Eu"rope', city: 'Paris', amount: 2.5 },
      { region: 'Asia', city: 'Osaka', amount: null },
    ]);
    const r = computePivot({ data: rows, model: { rows: [{ field: 'region' }], values: [{ field: 'amount', aggregate: 'sum' }] } });
    assert.deepEqual(table(r), [
      ['Asia', 10],
      ['Eu"rope', 2.5],
      ['Grand Total', 12.5],
    ]);
  });

  it('supports a delimiter, no header and explicit types', () => {
    assert.deepEqual(parseCsv('1;2024-01-02;true\n2;2024-02-03;false', { delimiter: ';', header: false, types: { '0': 'string', '1': 'date', '2': 'boolean' } }), [
      { '0': '1', '1': new Date('2024-01-02'), '2': true },
      { '0': '2', '1': new Date('2024-02-03'), '2': false },
    ]);
    assert.deepEqual(parseCsv(''), []);
  });
});

describe('field definitions', () => {
  it('exposes captions, types, folders, flags and member counts; infers fields when omitted', () => {
    const e = createPivotEngine({
      data: SALES,
      fields: [
        { field: 'region', caption: 'Region', folder: 'Geo' },
        { field: 'country', hidden: true, sortable: false },
        { field: 'amount', type: 'number', removable: false, draggable: false, filterable: false },
        { field: 'upper', caption: 'Upper region', valueGetter: (r: SaleRow) => r.region.toUpperCase() },
      ],
      model: { rows: [{ field: 'upper' }], values: [{ field: 'amount', aggregate: 'sum' }] },
    });
    const fields = e.getFields();
    assert.deepEqual(
      fields.map((f) => [f.field, f.caption, f.type, f.folder ?? null, f.hidden, f.sortable, f.filterable, f.removable, f.draggable, f.memberCount]),
      [
        ['region', 'Region', 'string', 'Geo', false, true, true, true, true, 3],
        ['country', 'country', 'string', null, true, false, true, true, true, 5],
        ['amount', 'amount', 'number', null, false, true, false, false, false, 7],
        ['upper', 'Upper region', 'string', null, false, true, true, true, true, 3],
      ],
    );
    assert.deepEqual(table(e.getSnapshot()).map((r) => r[0]), ['AMERICA', 'ASIA', 'EUROPE', 'Grand Total']);
    const inferred = createPivotEngine({ data: SALES }).getFields();
    assert.deepEqual(
      inferred.map((f) => `${f.field}:${f.type}`),
      ['region:string', 'country:string', 'product:string', 'year:number', 'quarter:string', 'amount:number', 'units:number', 'date:string'],
    );
  });

  it('lists members with counts, search and limit', () => {
    const e = createPivotEngine({ data: SALES, model: BASE });
    assert.deepEqual(e.getMembers('country'), [
      { key: 'France', label: 'France', count: 2 },
      { key: 'Germany', label: 'Germany', count: 1 },
      { key: 'India', label: 'India', count: 1 },
      { key: 'Japan', label: 'Japan', count: 2 },
      { key: 'USA', label: 'USA', count: 1 },
    ]);
    assert.deepEqual(e.getMembers('country', { search: 'an', limit: 2 }).map((m) => m.key), ['France', 'Germany']);
  });
});

describe('values placement', () => {
  const model: PivotModelInput = { rows: [{ field: 'region' }], columns: [{ field: 'year' }], values: [{ field: 'amount', aggregate: 'sum' }, { field: 'units', aggregate: 'sum' }] };
  it('places measures under the column members by default', () => {
    const r = computePivot({ data: SALES, model });
    assert.equal(r.columnDepth, 2);
    assert.deepEqual(columnKeys(r), ['[2024]|amount', '[2024]|units', '[2025]|amount', '[2025]|units', '|amount', '|units']);
    assert.deepEqual(r.columnTree.map((h) => [h.label, h.kind, h.position, h.span]), [
      ['2024', 'member', 0, 2],
      ['2025', 'member', 2, 2],
      ['Grand Total', 'grandTotal', 4, 2],
    ]);
    assert.deepEqual(r.columnTree[0]!.children!.map((h) => [h.label, h.kind, h.measure]), [
      ['amount', 'value', 'amount'],
      ['units', 'value', 'units'],
    ]);
  });

  it('puts the values level first with index 0', () => {
    const r = computePivot({ data: SALES, model: { ...model, valuesPlacement: { axis: 'columns', index: 0 } } });
    assert.deepEqual(r.columnTree.map((h) => [h.label, h.span]), [
      ['amount', 3],
      ['units', 3],
    ]);
    assert.deepEqual(columnKeys(r), ['[2024]|amount', '[2025]|amount', '|amount', '[2024]|units', '[2025]|units', '|units']);
    assert.equal(r.valueAt(0, 0), 250);
    assert.equal(r.valueAt(0, 3), 2);
  });

  it('places measures on the rows axis', () => {
    const r = computePivot({ data: SALES, model: { ...model, valuesPlacement: { axis: 'rows', index: -1 } } });
    assert.deepEqual(rowKeys(r), ['["America"]', '["America"]|amount', '["America"]|units', '["Asia"]', '["Asia"]|amount', '["Asia"]|units', '["Europe"]', '["Europe"]|amount', '["Europe"]|units', '', '|amount', '|units']);
    assert.equal(r.valueAt(0, 0), null);
    assert.equal(r.valueAt(1, 0), 250);
    assert.equal(r.valueAt(2, 0), 2);
    assert.equal(r.cellAt(0, 0).kind, 'subtotal');
    assert.deepEqual(columnKeys(r), ['[2024]', '[2025]', '']);
  });
});

describe('empty members and value header', () => {
  it('showEmptyMembers lists every member under each parent', () => {
    const plain = computePivot({ data: SALES, model: { ...BASE, expanded: 'all' } });
    const all = computePivot({ data: SALES, model: { ...BASE, expanded: 'all', showEmptyMembers: true } });
    assert.equal(plain.rowCount, 3 + 5 + 1);
    assert.equal(all.rowCount, 3 + 3 * 5 + 1);
    const t = table(all);
    const i = t.findIndex((r, k) => r[0] === 'Japan' && k < 6);
    assert.deepEqual(t[i], ['Japan', null, null, null]);
  });

  it('showValueHeader adds the value level for a single measure', () => {
    const r = computePivot({ data: SALES, model: { ...BASE, showValueHeader: true } });
    assert.equal(r.columnDepth, 2);
    assert.equal(r.columnTree[0]!.children![0]!.kind, 'value');
    assert.equal(computePivot({ data: SALES, model: BASE }).columnDepth, 1);
  });
});

describe('result accessors', () => {
  it('exposes header trees, leaf headers, cells and drill rows', () => {
    const r = computePivot({ data: SALES, model: { ...BASE, expanded: [['rows', 'Asia']] } });
    assert.equal(r.rowCount, 6);
    assert.equal(r.columnCount, 3);
    assert.equal(r.rowDepth, 2);
    const asia = r.rowTree[1]!;
    assert.deepEqual([asia.key, asia.kind, asia.path, asia.field, asia.depth, asia.position, asia.span, asia.expandable, asia.expanded], ['["Asia"]', 'member', ['Asia'], 'region', 0, 1, 3, true, true]);
    assert.deepEqual(asia.children!.map((h) => [h.key, h.position, h.expandable]), [
      ['["Asia","India"]', 2, false],
      ['["Asia","Japan"]', 3, false],
    ]);
    assert.equal(r.rowTree[3]!.kind, 'grandTotal');
    assert.equal(r.memberAt('rows', 2).label, 'India');
    const cell = r.cellAt(3, 0);
    assert.deepEqual(
      { ...cell },
      { rowIndex: 3, columnIndex: 0, rowKey: '["Asia","Japan"]', columnKey: '[2024]|amount', measure: 'amount', value: 300, rawValue: 300, formattedValue: '300', kind: 'value', rowCount: 2 },
    );
    assert.equal(r.cellAt(1, 2).kind, 'grandTotal');
    assert.equal(r.cellAt(1, 0).kind, 'subtotal');
    assert.equal(r.cellAt(5, 2).value, 1450);
    assert.deepEqual(r.rowsAt(3, 0), [0, 1]);
    assert.throws(() => r.valueAt(99, 0), RangeError);
    assert.throws(() => r.memberAt('columns', 3), RangeError);
  });

  it('formats values with Intl options per measure', () => {
    const r = computePivot({ data: SALES, locale: 'de-DE', model: { ...BASE, formats: { amount: { number: { style: 'currency', currency: 'EUR' } } } } });
    assert.match(r.cellAt(r.rowCount - 1, r.columnCount - 1).formattedValue, /^1\.450,00\s€$/u);
    assert.equal(r.cellAt(0, 1).formattedValue, '');
  });
});

describe('data updates', () => {
  const model: PivotModelInput = {
    rows: [{ field: 'region' }, { field: 'country' }],
    columns: [{ field: 'year' }],
    values: [
      { field: 'amount', aggregate: 'sum' },
      { field: 'units', aggregate: 'average' },
      { field: 'amount', aggregate: 'sampleVar', caption: 'var' },
      { field: 'country', aggregate: 'count' },
    ],
    expanded: 'all',
  };
  const many = Array.from({ length: 3000 }, (_, i) => ({ ...SALES[i % SALES.length]!, amount: (i * 37) % 101, units: i % 7 }));

  it('replacing a few rows updates incrementally and equals a fresh compute', () => {
    const e = createPivotEngine({ data: many, model: { ...model, values: model.values!.filter((v) => v.aggregate !== 'sampleVar') } });
    const next = many.slice();
    next[5] = { ...next[5]!, amount: 1000, units: 3 };
    next[17] = { ...next[17]!, region: 'Oceania', country: 'Fiji' };
    next[2000] = { ...next[2000]!, year: 2030 };
    const before = e.getDiagnostics();
    const r = e.setData(next);
    assert.equal(e.getDiagnostics().incrementalUpdates, before.incrementalUpdates + 1);
    assert.equal(e.getDiagnostics().fullComputes, before.fullComputes);
    const fresh = computePivot({ data: next, model: e.getModel() });
    assert.deepEqual(table(r), table(fresh));
    assert.deepEqual(columnKeys(r), columnKeys(fresh));
  });

  it('appending rows and changing values of non-subtractable aggregates stays exact', () => {
    const e = createPivotEngine({ data: many, model: { ...model, values: [{ field: 'amount', aggregate: 'max' }, { field: 'amount', aggregate: 'median' }] } });
    const next = [...many, { ...SALES[0]!, amount: 5000 }, { ...SALES[3]!, country: 'Spain', amount: 1 }];
    assert.deepEqual(table(e.setData(next)), table(computePivot({ data: next, model: e.getModel() })));
    assert.equal(e.getDiagnostics().incrementalUpdates, 1);
    const changed = next.slice();
    changed[0] = { ...changed[0]!, amount: -1 };
    assert.deepEqual(table(e.setData(changed)), table(computePivot({ data: changed, model: e.getModel() })));
  });

  it('keeps member filters exact through an incremental update', () => {
    const e = createPivotEngine({ data: many, model: { ...model, filterBy: { region: { exclude: ['Asia'] } } } });
    const next = many.slice();
    next[0] = { ...next[0]!, region: 'Europe' };
    next[3] = { ...next[3]!, region: 'Asia' };
    assertNear(table(e.setData(next)), table(computePivot({ data: next, model: e.getModel() })));
    assert.equal(e.getDiagnostics().incrementalUpdates, 1);
  });

  it('variance subtracts exactly enough to match a fresh compute', () => {
    const e = createPivotEngine({ data: many, model });
    const next = many.slice();
    next[1] = { ...next[1]!, amount: 77 };
    assertNear(table(e.setData(next)), table(computePivot({ data: next, model })));
    assert.equal(e.getDiagnostics().incrementalUpdates, 1);
  });

  it('a full replacement and refresh() recompute', () => {
    const e = createPivotEngine({ data: SALES, model: BASE });
    const r = e.setData(SALES.slice(0, 1));
    assert.deepEqual(table(r), [
      ['Asia', 100, 100],
      ['Grand Total', 100, 100],
    ]);
    const before = e.getSnapshot();
    const after = e.refresh();
    assert.notEqual(after, before);
    assert.deepEqual(table(after), table(before));
  });
});

describe('expand and collapse', () => {
  it('expands, collapses and expands every member per axis', () => {
    const e = createPivotEngine({ data: SALES, model: { ...BASE, columns: [{ field: 'year' }, { field: 'quarter' }] } });
    assert.equal(e.getSnapshot().columnCount, 3);
    const r = e.expand(['columns', 2024]);
    assert.deepEqual(columnKeys(r), ['[2024,"Q1"]|amount', '[2024,"Q2"]|amount', '[2024]|amount', '[2025]|amount', '|amount']);
    assert.equal(r.columnTree[0]!.children![2]!.kind, 'subtotal');
    assert.equal(r.valueAt(3, 0), 400); // Grand total row, 2024 Q1
    e.expandAll('rows');
    assert.equal(e.getSnapshot().rowCount, 9);
    assert.equal(e.getSnapshot().columnCount, 5);
    e.collapseAll('rows');
    assert.equal(e.getSnapshot().rowCount, 4);
    assert.equal(e.getSnapshot().columnCount, 5);
    e.expandAll();
    assert.equal(e.getModel().expanded, 'all');
    e.collapse(['rows', 'Asia']);
    assert.equal(e.getSnapshot().rowCount, 7);
    assert.equal(e.getSnapshot().columnCount, 7);
    e.collapseAll();
    assert.deepEqual(e.getModel().expanded, []);
  });
});

describe('deterministic results', () => {
  it('equal model and data give bit-identical values whatever the drill and filter history', () => {
    const data = Array.from({ length: 5000 }, (_, i) => ({ a: `a${i % 7}`, b: `b${i % 11}`, c: `c${i % 3}`, v: Math.sin(i) * 1000 + 0.1, w: (i * 0.37) % 13 }));
    const model: PivotModelInput = {
      rows: [{ field: 'a' }, { field: 'b' }],
      columns: [{ field: 'c' }],
      values: [{ field: 'v', aggregate: 'average' }, { field: 'v', aggregate: 'sampleStdev' }, { field: 'w', aggregate: 'sum' }],
    };
    const e = createPivotEngine({ data, model });
    e.expand(['rows', 'a1']);
    e.expand(['rows', 'a2']);
    e.collapse(['rows', 'a1']);
    e.setModel((m) => ({ ...m, filterBy: { a: { exclude: ['a3'] } } }));
    e.setModel((m) => ({ ...m, filterBy: {} }));
    e.expandAll();
    e.collapseAll();
    const r = e.expand(['rows', 'a2']);
    const fresh = computePivot({ data, model: { ...model, expanded: [['rows', 'a2']] } });
    assert.deepEqual(table(r), table(fresh));
    assert.equal(new Set(columnKeys(r)).size, r.columnCount);
    assert.deepEqual(columnKeys(r).slice(0, 3), ['["c0"]|v#average', '["c0"]|v#sampleStdev', '["c0"]|w']);
  });
});

describe('createPivotJob', () => {
  it('runs in slices and produces the computePivot result', () => {
    const data = Array.from({ length: 600_000 }, (_, i) => ({ g: `g${i % 97}`, h: `h${i % 13}`, v: i % 10 }));
    const model: PivotModelInput = { rows: [{ field: 'g' }], columns: [{ field: 'h' }], values: [{ field: 'v', aggregate: 'sum' }] };
    const job = createPivotJob({ data, model });
    assert.throws(() => job.result());
    let steps = 0;
    let last = 0;
    for (;;) {
      const s = job.run(1);
      steps++;
      assert.ok(s.progress >= last);
      last = s.progress;
      if (s.done) break;
    }
    assert.ok(steps > 1, `expected several slices, got ${steps}`);
    assert.deepEqual(table(job.result()), table(computePivot({ data, model })));
  });
});

describe('result snapshots', () => {
  const TWO: PivotModelInput = { ...BASE, values: [{ field: 'amount', aggregate: 'sum' }, { field: 'units', aggregate: 'sum' }] };
  const everyCell = (r: PivotResult) => {
    const out: PivotCell[] = [];
    for (let i = 0; i < r.rowCount; i++) for (let c = 0; c < r.columnCount; c++) out.push(r.cellAt(i, c));
    return out;
  };

  it('an older result stays readable and unchanged after the value fields and columns change', () => {
    const e = createPivotEngine({ data: SALES, model: TWO });
    const old = e.getSnapshot();
    const before = table(old);
    const cells = everyCell(old);
    // Two value fields to one while the columns change (the reported TypeError).
    const next = e.setModel((m) => ({ ...m, columns: [{ field: 'product' }], values: [{ field: 'amount', aggregate: 'sum' }] }));
    assert.notEqual(next, old);
    assert.deepEqual(table(old), before);
    assert.deepEqual(everyCell(old), cells);
    assert.equal(old.memberAt('columns', 1).measure, 'units');
    // Reading the older result leaves the newer one intact.
    assert.deepEqual(table(next), table(computePivot({ data: SALES, model: e.getModel() })));
    assert.deepEqual(table(e.getSnapshot()), table(next));
  });

  it('an older result computes cells it never read (lazy aggregates, show-as) after drills, filters and data changes', () => {
    const model: PivotModelInput = {
      ...BASE,
      expanded: [],
      values: [
        { field: 'amount', aggregate: 'median' },
        { field: 'units', aggregate: 'sum', showAs: { kind: 'percentOfParentRowTotal' } },
      ],
    };
    const e = createPivotEngine({ data: SALES, model });
    const old = e.getSnapshot();
    const fresh = computePivot({ data: SALES, model });
    e.expand(['rows', 'Europe']);
    e.setModel((m) => ({ ...m, filterBy: { region: { exclude: ['Asia'] } } }));
    e.setModel((m) => ({ ...m, rows: [{ field: 'product' }], values: [{ field: 'units', aggregate: 'average' }] }));
    e.setData(SALES.slice(0, 3));
    assert.deepEqual(table(old), table(fresh));
    assert.deepEqual(everyCell(old), everyCell(fresh));
    assert.equal(old.rowsAt(old.rowCount - 1, old.columnCount - 1).length, SALES.length);
  });
});
