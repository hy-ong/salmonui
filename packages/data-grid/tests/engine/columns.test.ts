import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  createDataGridApi,
  createDataGridEngine,
  createLocalDataSource,
  resolveColumnWidth,
  type ColumnDef,
} from '@salmonui/data-grid/engine';
import { collectWarnings, people, personColumns, type Person } from './fixtures.ts';

function make(columns: readonly ColumnDef<Person>[], rows: Person[] = people(), extra: Record<string, unknown> = {}) {
  const w = collectWarnings();
  const engine = createDataGridEngine<Person>({
    getRowId: (row) => row.id,
    columns,
    dataSource: rows,
    dev: true,
    instrument: true,
    onWarning: w.onWarning,
    timeZone: 'UTC',
    ...extra,
  });
  return { engine, w, api: createDataGridApi(engine) };
}

describe('column compilation', () => {
  it('compiles once per stable definition identity', () => {
    const source = createLocalDataSource(people(), { getRowId: (r: Person) => r.id });
    const { engine } = make(personColumns, undefined, { dataSource: source });
    const count = () => engine.getInstrumentation()?.columnCompiles;
    const defCount = () => engine.getInstrumentation()?.columnDefCompiles;
    assert.equal(count(), 1);
    assert.equal(defCount(), personColumns.length);
    const leaves = engine.getSnapshot().columns.leaves;

    engine.columns.hide({ keys: ['age'] });
    engine.columns.show({ keys: ['age'] });
    engine.setColumns(personColumns);
    source.setRows(people(8));
    source.patch({ upsert: [{ ...people(1)[0]!, name: 'Changed' }] });
    engine.setColumns([...personColumns]); // new array, same definition objects
    assert.equal(count(), 1);
    assert.equal(defCount(), personColumns.length);
    assert.equal(engine.getSnapshot().columns.leaves, leaves);

    const changed = [...personColumns.slice(0, 5), { field: 'address.city', header: 'Town' }];
    engine.setColumns(changed);
    assert.equal(count(), 2);
    assert.equal(defCount(), personColumns.length + 1, 'only the new definition compiles');
    assert.equal(engine.getSnapshot().columns.byId.get('id'), leaves[0]);
    assert.equal(engine.getSnapshot().columns.byId.get('address.city')?.headerText, 'Town');
  });
});

describe('columnId resolution', () => {
  it('uses id, then field, then a generated id with a warning; dedupes duplicates', () => {
    const { engine, w } = make([
      { id: 'custom', field: 'name' },
      { field: 'name' },
      { header: 'Computed', valueGetter: (r) => r.name.length },
      { field: 'name' },
    ]);
    assert.deepEqual(engine.getSnapshot().columns.leaves.map((c) => c.columnId), ['custom', 'name', '__col_2', 'name~2']);
    assert.deepEqual(w.codes().sort(), ['column-id-duplicate', 'column-id-generated']);
  });

  it('is deterministic across engines (SSR-safe)', () => {
    const defs: ColumnDef<Person>[] = [{ valueGetter: (r) => r.id }, { columns: [{ valueGetter: (r) => r.age }] }];
    const a = make(defs).engine.getSnapshot().columns.tree.map((c) => c.columnId);
    const b = make(defs).engine.getSnapshot().columns.tree.map((c) => c.columnId);
    assert.deepEqual(a, ['__col_0', '__col_1', '__col_1_0']);
    assert.deepEqual(a, b);
  });

  it('compiles stacked header groups into a tree with leaf columns', () => {
    const { engine } = make([{ field: 'id' }, { id: 'info', header: 'Info', columns: [{ field: 'name' }, { field: 'age' }] }]);
    const cols = engine.getSnapshot().columns;
    assert.equal(cols.headerRowCount, 2);
    assert.deepEqual(cols.leaves.map((c) => c.columnId), ['id', 'name', 'age']);
    assert.deepEqual(cols.byId.get('info')?.children, ['name', 'age']);
    assert.deepEqual(cols.byId.get('age')?.path, ['info', 'age']);
    assert.equal(cols.byId.get('info')?.leaf, false);
  });
});

describe('column types', () => {
  it('infers from the first non-null value', () => {
    const { engine } = make(personColumns);
    const types = Object.fromEntries(engine.getSnapshot().columns.leaves.map((c) => [c.columnId, [c.type, c.typeSource]]));
    assert.deepEqual(types, {
      id: ['string', 'inferred'],
      name: ['string', 'inferred'],
      age: ['number', 'inferred'], // first row is null
      active: ['boolean', 'inferred'],
      joined: ['date', 'inferred'],
      'address.city': ['string', 'inferred'],
    });
  });

  it('keeps an explicit type and supports every type name', () => {
    const types = ['string', 'number', 'boolean', 'date', 'datetime', 'selection'] as const;
    const { engine } = make(types.map((type) => ({ id: type, field: 'age', type })));
    assert.deepEqual(engine.getSnapshot().columns.leaves.map((c) => [c.type, c.typeSource]), types.map((t) => [t, 'definition']));
  });

  it('warns when inference is ambiguous', () => {
    const { engine, w } = make([{ id: 'obj', valueGetter: (r) => r.address }, { id: 'none', valueGetter: () => null }]);
    assert.deepEqual(engine.getSnapshot().columns.leaves.map((c) => [c.type, c.typeSource]), [
      ['string', 'fallback'],
      ['string', 'fallback'],
    ]);
    assert.deepEqual(w.codes(), ['column-type-ambiguous', 'column-type-ambiguous']);
  });

  it('resolves pending types when the first rows arrive without recompiling', () => {
    const source = createLocalDataSource<Person>([], { getRowId: (r) => r.id });
    const { engine } = make(personColumns, undefined, { dataSource: source });
    assert.equal(engine.getSnapshot().columns.byId.get('age')?.typeSource, 'pending');
    source.setRows(people());
    const age = engine.getSnapshot().columns.byId.get('age');
    assert.deepEqual([age?.type, age?.typeSource], ['number', 'inferred']);
    assert.equal(engine.getInstrumentation()?.columnCompiles, 1);
    assert.equal(engine.getInstrumentation()?.columnTypeResolves, 1);
  });
});

describe('formats', () => {
  const row = people(1)[0] as Person;
  const fmt = (format: ColumnDef<Person>['format'], value: unknown, type?: ColumnDef<Person>['type'], locale = 'en-US') => {
    const { engine } = make([{ id: 'x', valueGetter: () => value, ...(format === undefined ? {} : { format }), ...(type ? { type } : {}) }], [row], { locale, currency: 'EUR' });
    const col = engine.getSnapshot().columns.byId.get('x');
    assert.ok(col);
    return col.formatter(value, row);
  };

  it('number presets and custom patterns are locale-aware', () => {
    assert.equal(fmt('N2', 1234.5), '1,234.50');
    assert.equal(fmt('N2', 1234.5, undefined, 'de-DE'), '1.234,50');
    assert.equal(fmt('N0', 1234.5), '1,235');
    assert.equal(fmt('C2', 1234.5), '€1,234.50');
    assert.equal(fmt({ format: 'C0', currency: 'JPY' }, 1234), '¥1,234');
    assert.equal(fmt('P1', 0.256), '25.6%');
    assert.equal(fmt('#,##0.00', 1234.5), '1,234.50');
    assert.equal(fmt('0.0#', 3.14159), '3.14');
    assert.equal(fmt('000', 7), '007');
    assert.equal(fmt("'$'#,##0", 1234), '$1,234');
    assert.equal(fmt('N2', null), '');
  });

  it('date skeletons, styles and custom patterns', () => {
    const d = new Date(Date.UTC(2026, 10, 9, 14, 5, 7));
    assert.equal(fmt('yMd', d), '11/9/2026');
    assert.equal(fmt('yMd', d, undefined, 'de-DE'), '9.11.2026');
    assert.equal(fmt('yMMMd', d), 'Nov 9, 2026');
    assert.equal(fmt('short', d), '11/9/26');
    assert.equal(fmt('dd/MM/yyyy HH:mm:ss', d), '09/11/2026 14:05:07');
    assert.equal(fmt('EEE, d MMM yy h:mm a', d), 'Mon, 9 Nov 26 2:05 PM');
    assert.equal(fmt({ type: 'datetime', skeleton: 'yMdHm' }, d), '11/9/2026, 14:05');
    assert.equal(fmt('yyyy-MM-dd', d.getTime(), 'date'), '2026-11-09');
  });

  it('stores the normalized format descriptor', () => {
    const { engine } = make([{ field: 'age', format: 'N2' }, { field: 'joined', format: 'dd/MM/yyyy' }]);
    const [age, joined] = engine.getSnapshot().columns.leaves;
    assert.deepEqual(age?.format, { kind: 'number', style: 'decimal', pattern: null, options: { minimumFractionDigits: 2, maximumFractionDigits: 2 } });
    assert.deepEqual(joined?.format, { kind: 'date', skeleton: null, pattern: 'dd/MM/yyyy', options: {} });
  });

  it('formatValue overrides the formatter', () => {
    const { engine } = make([{ field: 'age', valueFormatter: (v, ctx) => `${String(v)} (${ctx.column.columnId}, ${ctx.locale})` }]);
    assert.equal(engine.getCellSnapshot('p1', 'age')?.formattedValue, '21 (age, en-US)');
  });
});

describe('column definition fields', () => {
  it('field (dot path), headerText, valueGetter', () => {
    const { engine } = make([{ field: 'address.city' }, { field: 'name', header: 'Full name' }, { id: 'len', valueGetter: (r) => r.name.length }]);
    const cols = engine.getSnapshot().columns.leaves;
    assert.deepEqual(cols.map((c) => c.headerText), ['address.city', 'Full name', 'len']);
    assert.equal(engine.getCellValue('p2', 'address.city'), 'Tokyo');
    assert.equal(engine.getCellValue('p2', 'len'), 'Person 2'.length);
    const city = cols[0];
    assert.ok(city?.setter);
    const updated = city.setter(people(1)[0] as Person, 'Osaka');
    assert.equal(updated.address.city, 'Osaka');
    assert.equal(cols[2]?.setter, null);
    assert.equal(cols[2]?.flags.allowEditing, false);
  });

  it('width, minWidth, maxWidth', () => {
    const { engine, w } = make([
      { field: 'id', width: 120, minWidth: 150 },
      { field: 'name', width: '25%', maxWidth: 200 },
      { field: 'age' },
      { field: 'active', minWidth: 300, maxWidth: 100 },
    ]);
    const [id, name, age, active] = engine.getSnapshot().columns.leaves;
    assert.deepEqual(id?.width, { initial: 120, min: 150, max: Infinity });
    assert.equal(resolveColumnWidth(id!.width), 150);
    assert.equal(resolveColumnWidth(name!.width, 1000), 200);
    assert.equal(resolveColumnWidth(name!.width, 400), 100);
    assert.equal(resolveColumnWidth(name!.width), null);
    assert.equal(resolveColumnWidth(age!.width), null);
    assert.deepEqual(active?.width, { initial: 'auto', min: 300, max: 300 });
    assert.deepEqual(w.codes(), ['column-width-invalid']);
  });

  it('capability flags, primaryKey, identity', () => {
    const { engine, api } = make([
      { field: 'id', primaryKey: true, identity: true },
      { field: 'name', sortable: false, filterable: false, groupable: false, searchable: false, resizable: false, reorderable: false, editable: false },
      { field: 'age', lockPosition: true },
    ]);
    const [id, name, age] = engine.getSnapshot().columns.leaves;
    assert.deepEqual(id?.flags, {
      allowSorting: true, allowFiltering: true, allowSearching: true, allowGrouping: true,
      allowEditing: false, allowResizing: true, allowReordering: true,
      isPrimaryKey: true, isIdentity: true, lockColumn: false, displayAsCheckBox: false, showInColumnChooser: true,
    });
    assert.equal(Object.values({ ...name?.flags, isPrimaryKey: false, isIdentity: false, lockColumn: false, displayAsCheckBox: false, showInColumnChooser: false }).some(Boolean), false);
    assert.equal(age?.flags.lockColumn, true);
    assert.equal(age?.flags.allowReordering, false);
    assert.deepEqual(api.getPrimaryKeyFields(), ['id']);
    assert.equal(api.getPrimaryKeyFields(), api.getPrimaryKeyFields());
  });
});

describe('column visibility and lookup', () => {
  it('honours initial hidden and show/hide by columnId or field', () => {
    const { engine, api } = make([...personColumns.slice(0, 3), { field: 'active', hidden: true }, { field: 'joined', pinned: 'start' }]);
    const ids = () => api.getVisibleColumns().map((c) => c.columnId);
    assert.deepEqual(ids(), ['joined', 'id', 'name', 'age'], 'visible is in display order: left zone, center, right zone');
    assert.deepEqual(engine.getSnapshot().columns.left.map((c) => c.columnId), ['joined']);
    assert.deepEqual(engine.getSnapshot().columns.center.map((c) => c.columnId), ['id', 'name', 'age']);
    api.showColumns('active');
    api.hideColumns(['name', 'age']);
    assert.deepEqual(ids(), ['joined', 'id', 'active']);
    api.showColumns(['name', 'age']);
    assert.deepEqual(ids(), ['joined', 'id', 'name', 'age', 'active']);
    engine.columns.setVisibility({ visibility: { id: false, joined: false } });
    assert.deepEqual(ids(), ['name', 'age', 'active']);
  });

  it('getColumn, getColumns, getVisibleColumns, getHiddenColumns, getColumnAt, getColumnIndex', () => {
    const { api } = make([{ id: 'key', field: 'id' }, ...personColumns.slice(1)]);
    assert.equal(api.getColumn('key')?.field, 'id');
    assert.equal(api.getColumn('id')?.columnId, 'key', 'falls back to field');
    assert.equal(api.getColumn('missing'), undefined);
    assert.equal(api.getColumns().length, personColumns.length);
    api.hideColumns('name');
    assert.equal(api.getVisibleColumns().length, personColumns.length - 1);
    assert.deepEqual(api.getHiddenColumns().map((c) => c.columnId), ['name']);
    assert.equal(api.getHiddenColumns(), api.getHiddenColumns());
    assert.equal(api.getColumnAt(1)?.columnId, 'age', 'index into visible leaves');
    assert.equal(api.getColumnAt(99), undefined);
    assert.equal(api.getColumnIndex('id'), 0, 'resolves a field');
    assert.equal(api.getColumnIndex('key'), 0);
    assert.equal(api.getColumnIndex('name'), -1, 'hidden');
    assert.equal(api.getColumnIndex('missing'), -1);
  });
});

describe('headerValueGetter', () => {
  it('resolves header text from the compiled column, once per compile', async () => {
    let calls = 0;
    const columns: ColumnDef<Person>[] = [
      { field: 'name', header: 'Name', headerValueGetter: (c) => (calls++, `${c.headerText} (${c.field}, ${c.type})`) },
      { field: 'age', headerValueGetter: (c) => c.columnId.toUpperCase() },
    ];
    const { createExportModel, createExportModule, writeCsv } = await import('@salmonui/data-grid/engine/export');
    const { engine, api } = make(columns, undefined, { modules: [createExportModule<Person>()] });
    const byId = engine.getSnapshot().columns.byId;
    assert.equal(byId.get('name')?.headerText, 'Name (name, string)');
    assert.equal(byId.get('age')?.headerText, 'AGE');
    assert.equal(calls, 1);
    engine.setColumns([...columns]);
    assert.equal(calls, 1, 'reused definitions do not call the getter again');
    assert.equal(api.getColumn('age')?.headerText, 'AGE');
    assert.equal(writeCsv(createExportModel(engine)).split('\r\n')[0], '"Name (name, string)",AGE');
  });

  it('keeps the default text and warns when the getter throws or returns a non-string', () => {
    const { engine, w } = make([
      {
        field: 'name',
        header: 'Name',
        headerValueGetter: () => {
          throw new Error('boom');
        },
      },
      { field: 'age', headerValueGetter: () => undefined as unknown as string },
    ]);
    const byId = engine.getSnapshot().columns.byId;
    assert.equal(byId.get('name')?.headerText, 'Name');
    assert.equal(byId.get('age')?.headerText, 'age');
    assert.equal(w.codes().filter((c) => c === 'header-value-getter').length, 2);
  });
});
