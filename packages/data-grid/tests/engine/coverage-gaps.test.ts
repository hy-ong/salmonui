// Coverage gaps of the core engine: edit gates, the missing-primary-key warning, synthetic
// rows (group footers, detail rows) refused by every edit entry point, the
// remaining built-in validation rules, and `getViewRows()` over the sorted,
// paged and grouped row models.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  createAggregatesModule,
  createDataGridApi,
  createDataGridEngine,
  createGroupingModule,
  createPagingModule,
  createSelectionModule,
  createSortModule,
  type ColumnDef,
  type EditOptions,
  type EditState,
} from '@salmonui/data-grid/engine';
import { createEditApi, createEditModule } from '@salmonui/data-grid/engine/edit';
import { createDetailModule } from '@salmonui/data-grid/engine/expansion';
import { compileValidationRules, DEFAULT_VALIDATION_MESSAGES } from '@salmonui/core/validation';
import { collectWarnings } from './fixtures.ts';

interface Item {
  readonly id: string;
  readonly name: string;
  readonly qty: number;
  readonly city: string;
}

const columns: ColumnDef<Item>[] = [{ field: 'id', primaryKey: true }, { field: 'name' }, { field: 'qty', type: 'number' }, { field: 'city' }];

function items(count: number): Item[] {
  const out: Item[] = [];
  for (let i = 0; i < count; i++) out.push({ id: `r${i}`, name: `n${i}`, qty: (i * 7) % 10, city: i % 2 ? 'Tokyo' : 'Taipei' });
  return out;
}

function makeEdit(edit: EditOptions<Item>, cols: ColumnDef<Item>[] = columns) {
  const w = collectWarnings();
  const modules = [createSelectionModule<Item>(), createEditModule<Item>()] as const;
  const engine = createDataGridEngine<Item, typeof modules>({
    getRowId: (r) => r.id,
    columns: cols,
    dataSource: items(5),
    modules,
    edit,
    selection: { mode: 'row', type: 'multiple' },
    dev: true,
    onWarning: w.onWarning,
  });
  const state = () => engine.getModuleState<EditState>('edit') as EditState;
  return { engine, api: createEditApi(engine), state, w };
}

const ids = (engine: { getSnapshot(): { rows: { count: number } }; getRowIdAt(i: number): string | undefined }): string[] => {
  const out: string[] = [];
  for (let i = 0; i < engine.getSnapshot().rows.count; i++) out.push(engine.getRowIdAt(i) as string);
  return out;
};

describe('edit gates', () => {
  it('add: false refuses addRow and edit.addRecord; editing existing rows still works', () => {
    const { engine, api, state } = makeEdit({ mode: 'row', add: false });
    const r1 = api.addRow({ name: 'x' });
    assert.equal(r1.status, 'rejected');
    assert.equal(r1.status === 'rejected' && r1.reason, 'addDisabled');
    const r2 = engine.dispatch({ type: 'edit.addRecord', position: 'bottom' });
    assert.equal(r2.status === 'rejected' && r2.reason, 'addDisabled');
    assert.equal(api.addRow(undefined, 0).status, 'rejected');
    assert.deepEqual(state().addedRowIds, []);
    assert.equal(engine.getSnapshot().rows.count, 5);
    assert.equal(api.startEdit('r1').status, 'applied', 'add: false leaves editing on');
  });

  it('delete: false refuses deleteRows, edit.deleteRecords and deleting the selection', () => {
    const { engine, api, state } = makeEdit({ mode: 'row', delete: false });
    const r1 = api.deleteRows('r1');
    assert.equal(r1.status === 'rejected' && r1.reason, 'deleteDisabled');
    assert.equal(api.deleteRows(['r1', 'r2']).status, 'rejected');
    const r2 = engine.dispatch({ type: 'edit.deleteRecords', rowIds: ['r3'] });
    assert.equal(r2.status === 'rejected' && r2.reason, 'deleteDisabled');
    assert.equal(engine.dispatch({ type: 'selection.selectRows', rowIds: ['r0', 'r4'] }).status, 'applied');
    const r3 = api.deleteRows();
    assert.equal(r3.status === 'rejected' && r3.reason, 'deleteDisabled', 'without ids: the selection, still refused');
    assert.deepEqual(ids(engine), ['r0', 'r1', 'r2', 'r3', 'r4']);
    assert.equal(api.hasUnsavedChanges(), false);
    assert.deepEqual(state().deletedRowIds, []);
  });

  it('delete: false in batch mode marks nothing; delete: true marks the rows', () => {
    const off = makeEdit({ mode: 'batch', delete: false });
    assert.equal(off.api.deleteRows('r1').status, 'rejected');
    assert.equal(off.api.getPendingChanges().deletedRecords.length, 0);
    const on = makeEdit({ mode: 'batch' });
    assert.notEqual(on.api.deleteRows('r1').status, 'rejected');
    assert.equal(on.api.getPendingChanges().deletedRecords.length, 1);
  });

  it('edit: false refuses starting an edit and updateCell; add still allows the new row', () => {
    const { api } = makeEdit({ mode: 'row', edit: false });
    const r = api.startEdit('r1');
    assert.equal(r.status === 'rejected' && r.reason, 'editDisabled');
    assert.equal(api.updateCell('r1', 'name', 'x').status, 'rejected');
    assert.notEqual(api.addRow({ id: 'new', name: 'x' }).status, 'rejected');
  });
});

describe('primary key warning', () => {
  const noKey: ColumnDef<Item>[] = [{ field: 'id' }, { field: 'name' }, { field: 'qty', type: 'number' }];

  it('edit-no-primary-key warns once, on the first edit without a primaryKey column', () => {
    const { api, w } = makeEdit({ mode: 'cell' }, noKey);
    assert.deepEqual(w.codes().filter((c) => c === 'edit-no-primary-key'), [], 'not at creation');
    assert.equal(api.startEdit('r1', 'name').status, 'applied');
    assert.deepEqual(w.codes().filter((c) => c === 'edit-no-primary-key'), ['edit-no-primary-key']);
    assert.match(w.warnings.find((x) => x.code === 'edit-no-primary-key')?.message ?? '', /primaryKey/);
    api.cancelEdit();
    api.startEdit('r2', 'name');
    api.startEdit('r3', 'qty');
    assert.equal(w.codes().filter((c) => c === 'edit-no-primary-key').length, 1, 'once per grid');
  });

  it('no edit-no-primary-key warning when getRowId is the app key (keyedRows)', () => {
    const { api, w } = makeEdit({ mode: 'cell', keyedRows: true }, noKey);
    assert.equal(api.startEdit('r1', 'name').status, 'applied');
    assert.equal(w.codes().includes('edit-no-primary-key'), false);
  });

  it('no edit-no-primary-key warning with a primaryKey column', () => {
    const { api, w } = makeEdit({ mode: 'cell' });
    assert.equal(api.startEdit('r1', 'name').status, 'applied');
    assert.equal(w.codes().includes('edit-no-primary-key'), false);
  });
});

describe('synthetic rows are read-only', () => {
  it('group footer rows (__gf:) are refused by start, edit and delete', () => {
    const modules = [createSortModule<Item>(), createGroupingModule<Item>(), createAggregatesModule<Item>(), createEditModule<Item>()] as const;
    const engine = createDataGridEngine<Item, typeof modules>({
      getRowId: (r) => r.id,
      columns,
      dataSource: items(6),
      modules,
      edit: { mode: 'cell' },
      defaultQuery: { grouping: [{ columnId: 'city' }], aggregates: [{ columnId: 'qty', type: 'sum', placement: ['groupFooter'] }] },
    });
    const api = createEditApi(engine);
    const footer = ids(engine).find((id) => id.startsWith('__gf:'));
    assert.ok(footer, 'a group footer row is visible');
    assert.equal(api.startEdit(footer, 'qty').status, 'rejected');
    assert.equal(api.startEdit(footer).status, 'rejected');
    assert.equal(api.updateCell(footer, 'qty', 5).status, 'rejected');
    assert.equal(api.updateRow(footer, { qty: 5 }).status, 'rejected');
    assert.equal(api.deleteRows(footer).status, 'rejected');
    assert.equal(engine.dispatch({ type: 'edit.deleteRecords', rowIds: [footer] }).status, 'rejected');
    assert.equal(api.hasUnsavedChanges(), false);
    assert.equal(ids(engine).includes(footer), true);
  });

  it('detail rows (__detail:) are refused by start, edit and delete', () => {
    for (const mode of ['cell', 'row', 'batch'] as const) {
      const modules = [createDetailModule<Item>(), createEditModule<Item>()] as const;
      const engine = createDataGridEngine<Item, typeof modules>({ getRowId: (r) => r.id, columns, dataSource: items(4), modules, edit: { mode } });
      const api = createEditApi(engine);
      engine.dispatch({ type: 'detail.expand', rowId: 'r1' });
      const detail = '__detail:r1';
      assert.ok(ids(engine).includes(detail), mode);
      assert.equal(api.startEdit(detail, 'name').status, 'rejected', mode);
      assert.equal(api.startEdit(detail).status, 'rejected', mode);
      assert.equal(api.updateCell(detail, 'name', 'x').status, 'rejected', mode);
      assert.equal(api.updateRow(detail, { name: 'x' }).status, 'rejected', mode);
      assert.equal(api.deleteRows(detail).status, 'rejected', mode);
      assert.equal(api.hasUnsavedChanges(), false, mode);
      assert.deepEqual(ids(engine), ['r0', 'r1', detail, 'r2', 'r3'], mode);
      assert.equal(api.startEdit('r1', 'name').status, 'applied', `${mode}: the parent row stays editable`);
    }
  });
});

describe('built-in validation rules', () => {
  const m = DEFAULT_VALIDATION_MESSAGES;

  it('max: a failing value and its message; maxLength', () => {
    const max = compileValidationRules({ max: 10 });
    assert.deepEqual(max.validate(11, {}), ['Please enter a value less than or equal to 10.']);
    assert.deepEqual(max.validate('12', {}), [m.max.replace('{0}', '10')], 'numeric strings are compared as numbers');
    assert.equal(max.validate(10, {}).length, 0, 'inclusive');
    assert.equal(max.validate(-3, {}).length, 0);
    assert.deepEqual(compileValidationRules({ max: [5, 'At most five'] }).validate(6, {}), ['At most five']);
    const maxDate = compileValidationRules({ max: '2025-01-01' });
    assert.equal(maxDate.validate(new Date('2025-01-02'), {}).length, 1);
    assert.equal(maxDate.validate(new Date('2024-12-31'), {}).length, 0);
    const maxLength = compileValidationRules({ maxLength: 3 });
    assert.deepEqual(maxLength.validate('abcd', {}), ['Please enter no more than 3 characters.']);
    assert.equal(maxLength.validate('abc', {}).length, 0, 'inclusive');
    assert.deepEqual(compileValidationRules({ maxLength: [2, 'Two at most'] }).validate('abc', {}), ['Two at most']);
    assert.equal(maxLength.validate('', {}).length, 0, 'empty values pass non-required rules');
  });

  it('url, date, dateIso, tel and a failing number', () => {
    const url = compileValidationRules({ url: true });
    assert.deepEqual(url.validate('not a url', {}), [m.url]);
    assert.deepEqual(url.validate('example.com', {}), [m.url]);
    assert.equal(url.validate('https://example.com/a?b=1', {}).length, 0);
    assert.equal(url.validate('ftp://files.example.org', {}).length, 0);

    const date = compileValidationRules({ date: true });
    assert.deepEqual(date.validate('not a date', {}), [m.date]);
    assert.deepEqual(date.validate(new Date(Number.NaN), {}), [m.date]);
    assert.equal(date.validate('2025-03-04', {}).length, 0);
    assert.equal(date.validate(new Date(2025, 2, 4), {}).length, 0);

    const iso = compileValidationRules({ dateIso: true });
    assert.deepEqual(iso.validate('03/04/2025', {}), [m.dateIso]);
    assert.deepEqual(iso.validate('2025-3-4', {}), [m.dateIso]);
    assert.equal(iso.validate('2025-03-04', {}).length, 0);
    assert.equal(iso.validate('2025-03-04T10:20:30Z', {}).length, 0);
    assert.equal(iso.validate(new Date(2025, 2, 4), {}).length, 0);

    const tel = compileValidationRules({ tel: true });
    assert.deepEqual(tel.validate('call me', {}), [m.tel]);
    assert.deepEqual(tel.validate('123', {}), [m.tel], 'too short');
    assert.equal(tel.validate('+1 (555) 123-4567', {}).length, 0);

    const num = compileValidationRules({ number: true });
    assert.deepEqual(num.validate('12abc', {}), ['Please enter a valid number.']);
    assert.deepEqual(num.validate(Number.POSITIVE_INFINITY, {}), [m.number]);
    assert.equal(num.validate('12.5', {}).length, 0);
    assert.equal(num.validate(-4, {}).length, 0);
    assert.deepEqual(compileValidationRules({ number: [true, 'Numbers only'] }).validate('x', {}), ['Numbers only']);
  });
});

describe('getViewRows', () => {
  function makeView(extra: Record<string, unknown>) {
    const modules = [createSortModule<Item>(), createGroupingModule<Item>(), createAggregatesModule<Item>(), createPagingModule<Item>()] as const;
    const engine = createDataGridEngine<Item, typeof modules>({ getRowId: (r: Item) => r.id, columns, dataSource: items(10), modules, paging: { enabled: false }, ...extra } as never);
    return { engine, api: createDataGridApi(engine) };
  }
  const idsOf = (rows: readonly Item[]) => rows.map((r) => r.id);

  it('sorted: the visible rows in sort order, as raw row references', () => {
    const { engine, api } = makeView({});
    const source = engine.getSnapshot().rows.source;
    engine.dispatch({ type: 'sort.set', sorting: [{ columnId: 'qty', direction: 'desc' }, { columnId: 'id', direction: 'asc' }] });
    const rows = api.getViewRows();
    const expected = [...items(10)].sort((a, b) => b.qty - a.qty || a.id.localeCompare(b.id)).map((r) => r.id);
    assert.deepEqual(idsOf(rows), expected);
    assert.equal(rows[0], source.find((r) => r.id === expected[0]), 'raw references, not copies');
    assert.equal(api.getViewRows(), rows, 'cached until the row model changes');
    engine.dispatch({ type: 'sort.set', sorting: [{ columnId: 'id', direction: 'desc' }] });
    assert.deepEqual(idsOf(api.getViewRows()), ['r9', 'r8', 'r7', 'r6', 'r5', 'r4', 'r3', 'r2', 'r1', 'r0']);
  });

  it('paged: only the current page, in sort order', () => {
    const { engine, api } = makeView({ paging: { enabled: true, pageSize: 4 } });
    assert.deepEqual(idsOf(api.getViewRows()), ['r0', 'r1', 'r2', 'r3']);
    engine.dispatch({ type: 'paging.goToPage', page: 3 });
    assert.deepEqual(idsOf(api.getViewRows()), ['r8', 'r9']);
    engine.dispatch({ type: 'sort.set', sorting: [{ columnId: 'id', direction: 'desc' }] });
    engine.dispatch({ type: 'paging.goToPage', page: 2 });
    assert.deepEqual(idsOf(api.getViewRows()), ['r5', 'r4', 'r3', 'r2']);
  });

  it('grouped: data rows only, captions and footers excluded, collapsed groups hide theirs', () => {
    const { engine, api } = makeView({
      defaultQuery: { grouping: [{ columnId: 'city' }], aggregates: [{ columnId: 'qty', type: 'sum', placement: ['groupCaption', 'groupFooter'] }] },
    });
    const visible = ids(engine);
    assert.ok(visible.some((id) => id.startsWith('__g:')), 'captions are visible');
    assert.ok(visible.some((id) => id.startsWith('__gf:')), 'footers are visible');
    const rows = api.getViewRows();
    assert.equal(rows.length, 10);
    assert.deepEqual(idsOf(rows), visible.filter((id) => !id.startsWith('__')), 'visible order, data rows only');
    assert.deepEqual(new Set(rows.map((r) => r.city)).size, 2);
    const taipei = visible.find((id) => id.startsWith('__g:') && engine.getSnapshot().rows.view?.kindAt(visible.indexOf(id)) === 'group');
    assert.ok(taipei);
    engine.dispatch({ type: 'grouping.toggle', group: taipei, expanded: false });
    const after = api.getViewRows();
    assert.equal(after.length, 5, 'the collapsed group contributes no rows');
    assert.equal(new Set(after.map((r) => r.city)).size, 1);
  });
});
