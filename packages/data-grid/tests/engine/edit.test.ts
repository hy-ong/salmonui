import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  createFocusModule,
  createKeymap,
  createDataGridEngine,
  createGroupingModule,
  createAggregatesModule,
  createFilterModule,
  createSelectionModule,
  createSortModule,
  type ClipboardCopy,
  type ClipboardState,
  type ColumnDef,
  type EditMethods,
  type EditOptions,
  type EditState,
  type DataSource,
  type DataGridOptions,
  type WriteRequest,
  type WriteResult,
} from '@salmonui/data-grid/engine';
import { createLookupModule } from '@salmonui/data-grid/engine/lookup';
import { createEditApi, createEditModule, DEFAULT_EDIT_MESSAGES, EDIT_DELETED, EDIT_DIRTY, EDIT_EDITING, EDIT_INVALID, EDIT_NEW, EDIT_ROW_EDITING } from '@salmonui/data-grid/engine/edit';
import { compileValidationRules, DEFAULT_VALIDATION_MESSAGES } from '@salmonui/core/validation';
import { createClipboardModule, parseTsv } from '@salmonui/data-grid/engine/clipboard';
import { assertBudget } from '../../../../tooling/bench/budget.mjs';

interface Item {
  readonly id: string;
  readonly name: string;
  readonly qty: number;
  readonly city: string;
  readonly due: Date | null;
}

const columns: ColumnDef<Item>[] = [
  { field: 'id', primaryKey: true },
  { field: 'name', validation: { required: true, maxLength: 10 } },
  { field: 'qty', type: 'number', defaultValue: 1, validation: { min: 0, max: [100, 'At most 100'] } },
  { field: 'city', editable: false },
  { field: 'due', type: 'date' },
];

function items(count: number): Item[] {
  const out: Item[] = [];
  for (let i = 0; i < count; i++) out.push({ id: `r${i}`, name: `n${i}`, qty: i, city: i % 2 ? 'Tokyo' : 'Taipei', due: null });
  return out;
}

function make(edit: EditOptions<Item> = {}, opts: { count?: number; dataSource?: DataSource<Item>; sort?: boolean } = {}) {
  const modules = [
    createSortModule<Item>(),
    createFilterModule<Item>(),
    createSelectionModule<Item>(),
    createFocusModule<Item>(),
    createEditModule<Item>(),
    createClipboardModule<Item>(),
  ] as const;
  const engine = createDataGridEngine<Item, typeof modules>({
    getRowId: (r) => r.id,
    columns,
    dataSource: opts.dataSource ?? items(opts.count ?? 10),
    modules,
    edit,
    selection: { mode: 'both', type: 'multiple' },
    dev: true,
    instrument: true,
  });
  const api = createEditApi(engine);
  const m = (engine as unknown as { edit: { [K in keyof EditMethods<Item>]: EditMethods<Item>[K] extends (ctx: any, ...a: infer A) => infer R ? (...a: A) => R : never } }).edit;
  const state = () => engine.getModuleState<EditState>('edit') as EditState;
  return { engine, api, m, state };
}

describe('edit module: cell and batch modes', () => {
  it('stays out of the grid snapshot; a keystroke notifies one cell only', () => {
    const { engine, api, m } = make({ mode: 'cell' });
    const v0 = engine.getSnapshot().version;
    assert.equal(engine.getSnapshot().modules['edit'], undefined);
    assert.equal(api.startEdit('r1', 'name').status, 'applied');
    const cells: string[] = [];
    const rows: string[] = [];
    for (let r = 0; r < 3; r++) {
      engine.subscribeRow(`r${r}`, () => rows.push(`r${r}`));
      for (const c of ['name', 'qty']) engine.subscribeCell(`r${r}`, c, () => cells.push(`r${r}:${c}`));
    }
    assert.equal(api.setEditValue('r1', 'name', 'abc').status, 'applied');
    assert.deepEqual(cells, ['r1:name']);
    assert.deepEqual(rows, []);
    assert.equal(engine.getSnapshot().version, v0);
    assert.equal(m.getValue('r1', 'name'), 'abc');
    assert.ok(m.cellFlags('r1', 'name') & EDIT_EDITING);
    assert.ok(m.cellFlags('r1', 'name') & EDIT_DIRTY);
  });

  it('cell mode commit writes one cell through the incremental path (sorted grid)', () => {
    const { engine, api } = make({ mode: 'cell' }, { count: 200 });
    engine.dispatch({ type: 'sort.set', sorting: [{ columnId: 'qty', direction: 'desc' }] });
    const before = engine.getInstrumentation()!;
    api.startEdit('r5', 'qty');
    api.setEditValue('r5', 'qty', '500');
    assert.equal(api.saveCell().status, 'rejected', 'max rule blocks');
    api.setEditValue('r5', 'qty', '99');
    assert.equal(api.saveCell().status, 'applied');
    assert.equal(engine.getRow('r5')?.qty, 99);
    assert.equal(engine.getRowIdAt(0), 'r199');
    assert.equal(engine.getRowIdAt(engine.getRowIndex('r99') - 1), 'r5', 'r5 (99) sorts right before r99 (99, earlier source index)');
    const after = engine.getInstrumentation()!;
    assert.equal((after.stageUpdates['sort'] ?? 0) - (before.stageUpdates['sort'] ?? 0), 1, 'sort updated incrementally');
    assert.equal((after.stageRuns['sort'] ?? 0) - (before.stageRuns['sort'] ?? 0), 1, 'no extra full run');
  });

  it('keeps an unchanged cell snapshot when another cell of the row commits', () => {
    const { engine, api } = make({ mode: 'cell' });
    const name = engine.getCellSnapshot('r2', 'name');
    const qty = engine.getCellSnapshot('r2', 'qty');
    api.startEdit('r2', 'qty');
    api.setEditValue('r2', 'qty', 7);
    api.saveCell();
    assert.equal(engine.getCellSnapshot('r2', 'name'), name);
    assert.notEqual(engine.getCellSnapshot('r2', 'qty'), qty);
  });

  it('batch mode keeps drafts until saveBatch; preview, changes, cancel', () => {
    const { engine, api, m, state } = make({ mode: 'batch' });
    api.startEdit('r1', 'name');
    api.setEditValue('r1', 'name', 'x1');
    engine.dispatch({ type: 'edit.commitAndMove', direction: 'next' });
    assert.deepEqual(state().active, { rowId: 'r1', columnId: 'qty', isNew: false });
    api.setEditValue('r1', 'qty', 3);
    api.saveCell();
    assert.equal(engine.getRow('r1')?.name, 'n1', 'not written yet');
    assert.equal(state().dirtyCellCount, 2);
    const preview = api.getBatchPreview()!;
    assert.equal(preview.cells.length, 2);
    assert.deepEqual(preview.cells.map((c) => [c.columnId, c.previous, c.value]), [['name', 'n1', 'x1'], ['qty', 1, 3]]);
    assert.equal(api.getPendingChanges().changedRecords[0]?.name, 'x1');
    api.deleteRows('r4');
    assert.ok(m.rowFlags('r4') & EDIT_DELETED);
    api.addRow({ name: 'added' });
    assert.equal(state().addedRowIds.length, 1);
    const newId = state().addedRowIds[0]!;
    assert.ok(m.cellFlags(newId, 'name') & EDIT_NEW);
    assert.equal(m.getValue(newId, 'qty'), 1, 'defaultValue');
    api.saveCell();
    assert.equal(api.save().status, 'rejected', 'new row needs a primary key');
    api.setEditValue(newId, 'id', 'r100');
    assert.equal(api.save().status, 'applied');
    assert.equal(engine.getRow('r1')?.name, 'x1');
    assert.equal(engine.getRow('r1')?.qty, 3);
    assert.equal(engine.getRow('r4'), undefined);
    assert.equal(engine.getRow('r100')?.name, 'added');
    assert.equal(api.hasUnsavedChanges(), false);
    api.startEdit('r2', 'name');
    api.setEditValue('r2', 'name', 'zz');
    api.saveCell();
    assert.equal(api.hasUnsavedChanges(), true);
    api.cancelEdit();
    assert.equal(api.hasUnsavedChanges(), false);
    assert.equal(m.getValue('r2', 'name'), 'n2');
  });

  it('Escape in batch restores the draft from before the editor opened', () => {
    const { api, m } = make({ mode: 'batch' });
    api.startEdit('r1', 'name');
    api.setEditValue('r1', 'name', 'first');
    api.saveCell();
    api.startEdit('r1', 'name');
    api.setEditValue('r1', 'name', 'second');
    api.cancelEdit();
    assert.equal(m.getValue('r1', 'name'), 'first');
    assert.ok(m.cellFlags('r1', 'name') & EDIT_DIRTY);
  });
});

describe('edit module: row and dialog modes', () => {
  it('row mode edits all editable cells and commits the row', () => {
    const { engine, api, m, state } = make({ mode: 'row' });
    api.startEdit('r3');
    assert.ok(m.cellFlags('r3', 'name') & EDIT_ROW_EDITING);
    assert.ok(m.cellFlags('r3', 'name') & EDIT_EDITING);
    assert.equal(m.cellFlags('r3', 'city') & EDIT_EDITING, 0, 'read-only column');
    assert.equal(m.cellFlags('r3', 'id') & EDIT_EDITING, 0, 'primary key of a stored row');
    assert.deepEqual(m.getEditableColumnIds('r3'), ['name', 'qty', 'due']);
    api.setEditValue('r3', 'name', 'Ren');
    api.setEditValue('r3', 'due', '2025-03-04');
    assert.ok(m.getValue('r3', 'due') instanceof Date);
    assert.equal(api.saveCell().status, 'applied');
    assert.equal(engine.getRow('r3')?.name, 'Ren');
    assert.equal((engine.getRow('r3')?.due as Date).toISOString().slice(0, 10), '2025-03-04');
    assert.equal(state().active, null);
    assert.equal(state().status, 'idle');
  });

  it('required on an untouched cell blocks the commit with an addressable error', () => {
    const { api, m } = make({ mode: 'row' });
    api.startEdit('r3');
    api.setEditValue('r3', 'name', '');
    const r = api.saveCell();
    assert.equal(r.status, 'rejected');
    assert.deepEqual(m.getErrors('r3', 'name'), ['This field is required.']);
    assert.ok(m.cellFlags('r3', 'name') & EDIT_INVALID);
    api.cancelEdit();
    assert.deepEqual(m.getErrors('r3', 'name'), []);
  });

  it('adds at the top or bottom, requires the key, and cancels cleanly', () => {
    const { engine, api, state, m } = make({ mode: 'row', newRowPosition: 'bottom' });
    api.addRow();
    const a = state().addedRowIds[0]!;
    assert.ok(a.startsWith('__new:'));
    assert.deepEqual(state().active, { rowId: a, columnId: 'id', isNew: true });
    assert.equal(api.saveCell().status, 'rejected');
    assert.deepEqual(m.getErrors(a, 'id'), ['This field is required.']);
    assert.deepEqual(m.getErrors(a, 'name'), ['This field is required.']);
    api.cancelEdit();
    assert.deepEqual(state().addedRowIds, []);
    api.addRow({ id: 'k1', name: 'Kay' });
    assert.equal(api.saveCell().status, 'applied');
    assert.equal(engine.getRow('k1')?.qty, 1);
    assert.equal(engine.getRowIdAt(engine.getSnapshot().rows.count - 1), 'k1');
  });

  it('an addRow index picks the edge the added row renders at; newRowPosition is the default', () => {
    const { api, state, m } = make({ mode: 'batch', newRowPosition: 'bottom' });
    api.addRow({ id: 'b1' });
    api.addRow({ id: 't1' }, 0);
    api.addRow({ id: 'b2' }, 100);
    const [t1, b1, b2] = state().addedRowIds;
    assert.equal(m.getValue(t1!, 'id'), 't1', 'index 0 adds in front');
    assert.deepEqual([t1, b1, b2].map((id) => m.getAddedRowPosition(id!)), ['top', 'bottom', 'bottom']);
    assert.equal(m.getValue(b2!, 'id'), 'b2');
    assert.equal(m.getAddedRowPosition('r1'), undefined, 'not an added row');
    assert.equal(api.addRow({ id: 'mid' }, 3).status, 'rejected', 'a position inside the rows stays unsupported');
  });

  it('isCellEditable policy and allowEdit gate starts', () => {
    const { api } = make({ mode: 'cell', isCellEditable: ({ row }) => row.qty % 2 === 0 });
    assert.equal(api.startEdit('r1', 'name').status, 'rejected');
    assert.equal(api.startEdit('r2', 'name').status, 'applied');
    const off = make({ mode: 'cell', edit: false });
    assert.equal(off.api.startEdit('r2', 'name').status, 'rejected');
  });

  it('Tab moves between editable cells and wraps rows when tabToNextRow', () => {
    const { m } = make({ mode: 'batch' });
    assert.deepEqual(m.nextEditableCell('r1', 'name', 'next'), { rowId: 'r1', columnId: 'qty' });
    assert.deepEqual(m.nextEditableCell('r1', 'due', 'next'), { rowId: 'r2', columnId: 'name' });
    assert.deepEqual(m.nextEditableCell('r1', 'name', 'previous'), { rowId: 'r0', columnId: 'due' });
    assert.deepEqual(m.nextEditableCell('r1', 'name', 'down'), { rowId: 'r2', columnId: 'name' });
  });

  it('deletes immediately outside batch mode', () => {
    const { engine, api } = make({ mode: 'row' });
    assert.equal(api.deleteRows(['r1', 'r2']).status, 'applied');
    assert.equal(engine.getRow('r1'), undefined);
    assert.equal(engine.getSnapshot().rows.count, 8);
  });

  it('updateRow and updateCell validate and write', () => {
    const { engine, api } = make({ mode: 'row' });
    assert.equal(api.updateRow('r1', { name: 'Up', qty: 5 }).status, 'applied');
    assert.equal(engine.getRow('r1')?.name, 'Up');
    api.updateCell('r1', 'qty', 7);
    assert.equal(engine.getRow('r1')?.qty, 7);
  });
});

describe('edit module: async validation and remote writes', () => {
  function remote(respond: (req: WriteRequest<Item>) => WriteResult<Item> | Promise<WriteResult<Item>>): DataSource<Item> & { requests: WriteRequest<Item>[] } {
    let rows = items(10);
    const listeners = new Set<(e: any) => void>();
    const requests: WriteRequest<Item>[] = [];
    return {
      mode: 'local',
      requests,
      read: (req) => ({ version: req.version, rows }),
      subscribe(l) {
        listeners.add(l);
        return () => listeners.delete(l);
      },
      async write(req) {
        requests.push(req);
        await Promise.resolve();
        const result = await respond(req);
        if (result.status !== 'rejected') {
          const ok = new Set((result.changed ?? []).map((c) => c.rowId));
          const next = rows.map((r) => (ok.has(r.id) ? (req.changed.find((c) => c.rowId === r.id)!.row as Item) : r));
          rows = next;
          for (const l of listeners) l({ type: 'patch', rows, updated: [...ok], added: [], removed: [] });
        }
        return result;
      },
    };
  }

  it('failed cells stay dirty with the server errors; others are cleared', async () => {
    const source = remote((req) => ({
      version: req.version,
      status: 'partial',
      changed: req.changed.filter((c) => c.rowId !== 'r2').map((c) => ({ rowId: c.rowId, row: c.row })),
      cellErrors: { 'r2:name': ['Name taken'] },
    }));
    const { engine, api, m, state } = make({ mode: 'batch' }, { dataSource: source });
    for (const id of ['r1', 'r2']) {
      api.startEdit(id, 'name');
      api.setEditValue(id, 'name', `${id}!`);
      api.saveCell();
    }
    assert.equal(api.save().status, 'applied');
    assert.equal(state().status, 'submitting');
    assert.ok(m.getDraft('r1', 'name')?.pending);
    await api.whenEditSettled();
    assert.equal(engine.getRow('r1')?.name, 'r1!');
    assert.equal(m.getDraft('r1', 'name'), undefined);
    assert.deepEqual(m.getErrors('r2', 'name'), ['Name taken']);
    assert.equal(m.getValue('r2', 'name'), 'r2!');
    assert.ok(m.cellFlags('r2', 'name') & EDIT_DIRTY);
    assert.equal(state().status, 'error');
    assert.equal(source.requests[0]?.mode, 'batch');
    assert.deepEqual(source.requests[0]?.changed.map((c) => c.changedColumnIds), [['name'], ['name']]);
  });

  it('a rejected write keeps every draft', async () => {
    const source = remote(() => Promise.reject(new Error('Network down')));
    const { api, m, state } = make({ mode: 'cell' }, { dataSource: source });
    api.startEdit('r1', 'name');
    api.setEditValue('r1', 'name', 'off');
    api.saveCell();
    await api.whenEditSettled();
    assert.equal(m.getValue('r1', 'name'), 'off');
    assert.ok(m.cellFlags('r1', 'name') & EDIT_DIRTY);
    assert.equal(state().lastError, 'Network down');
    assert.deepEqual(m.getRowErrors('r1'), ['Network down']);
  });

  it('async custom validators and validateRow gate the commit', async () => {
    const taken = new Set(['dup']);
    const asyncColumns: ColumnDef<Item>[] = columns.map((c) =>
      c.field === 'name' ? { ...c, validation: { required: true, validate: async (v: unknown) => (taken.has(String(v)) ? 'Already used' : null) } } : c,
    );
    const modules = [createEditModule<Item>()] as const;
    const engine = createDataGridEngine<Item, typeof modules>({
      getRowId: (r) => r.id,
      columns: asyncColumns,
      dataSource: items(5),
      modules,
      edit: { mode: 'row', validateRow: (row: Item) => (row.qty > 50 ? 'Quantity too high for this row' : null) },
    });
    const api = createEditApi(engine);
    const m = (engine as any).edit;
    api.startEdit('r1');
    api.setEditValue('r1', 'name', 'dup');
    api.saveCell();
    assert.equal((engine.getModuleState('edit') as EditState).status, 'validating');
    await api.whenEditSettled();
    assert.deepEqual(m.getErrors('r1', 'name'), ['Already used']);
    assert.equal(engine.getRow('r1')?.name, 'n1');
    api.setEditValue('r1', 'name', 'fresh');
    api.setEditValue('r1', 'qty', 60);
    api.saveCell();
    await api.whenEditSettled();
    assert.deepEqual(m.getRowErrors('r1'), ['Quantity too high for this row']);
    api.setEditValue('r1', 'qty', 6);
    api.saveCell();
    await api.whenEditSettled();
    assert.equal(engine.getRow('r1')?.name, 'fresh');
  });
});

describe('edit through grouping and aggregates', () => {
  it('commits update group aggregates incrementally; captions are not editable', () => {
    const modules = [createSortModule<Item>(), createGroupingModule<Item>(), createAggregatesModule<Item>(), createEditModule<Item>()] as const;
    const engine = createDataGridEngine<Item, typeof modules>({
      getRowId: (r) => r.id,
      columns,
      dataSource: items(100),
      modules,
      edit: { mode: 'cell' },
      defaultQuery: { grouping: [{ columnId: 'city' }], aggregates: [{ columnId: 'qty', type: 'sum', placement: ['footer'] }] },
      instrument: true,
    });
    const api = createEditApi(engine);
    const total = (engine as any).aggregates.getFooter().qty.sum as number;
    const caption = engine.getRowIdAt(0)!;
    assert.ok(caption.startsWith('__g:'));
    assert.equal(api.startEdit(caption, 'name').status, 'rejected');
    const before = engine.getInstrumentation()!;
    api.startEdit('r10', 'qty');
    api.setEditValue('r10', 'qty', 50);
    api.saveCell();
    assert.equal((engine as any).aggregates.getFooter().qty.sum, total + 40);
    const after = engine.getInstrumentation()!;
    assert.equal((after.stageUpdates['group'] ?? 0) - (before.stageUpdates['group'] ?? 0), 1);
  });
});

describe('validation rules', () => {
  it('built-in rules and messages', () => {
    const v = compileValidationRules({ required: true, minLength: 2, pattern: ['^[a-z]+$', 'Lowercase only'] });
    assert.deepEqual(v.validate('', {}), ['This field is required.']);
    assert.deepEqual(v.validate('a', {}), ['Please enter at least 2 characters.']);
    assert.deepEqual(v.validate('AB', {}), ['Lowercase only']);
    assert.equal(v.validate('ab', {}).length, 0);
    const n = compileValidationRules({ range: [1, 5], number: true });
    assert.deepEqual(n.validate(9, {}), ['Please enter a value between 1 and 5.']);
    assert.deepEqual(compileValidationRules({ email: true }).validate('x@', {}), ['Please enter a valid email address.']);
    assert.equal(compileValidationRules({ creditcard: true }).validate('4111 1111 1111 1111', {}).length, 0);
    assert.deepEqual(compileValidationRules({ digits: true }, { ...DEFAULT_VALIDATION_MESSAGES, digits: 'Nur Ziffern' }).validate('1a', {}), ['Nur Ziffern']);
    const d = compileValidationRules({ min: '2025-01-01' });
    assert.equal(d.validate(new Date('2024-12-31'), {}).length, 1);
    assert.equal(d.validate(new Date('2025-01-02'), {}).length, 0);
    assert.equal(compileValidationRules({ rangeLength: [[2, 3], 'two or three'] }).validate('abcd', {})[0], 'two or three');
  });

  it('built-in rules cost well under 1 ms per keystroke @perf', () => {
    const v = compileValidationRules({ required: true, minLength: 2, maxLength: 40, pattern: '^[\\w-]+$', email: false });
    const t0 = performance.now();
    for (let i = 0; i < 10_000; i++) v.validate(`word-${i}`, null);
    const per = (performance.now() - t0) / 10_000;
    assertBudget(per, 0.05, 'built-in validation rules per keystroke', { strict: true });
  });
});


describe('clipboard', () => {
  it('parses spreadsheet TSV', () => {
    assert.deepEqual(parseTsv('a\tb\nc\td\n'), [['a', 'b'], ['c', 'd']]);
    assert.deepEqual(parseTsv('"x\ty"\t"q""q"\r\nz\t'), [['x\ty', 'q"q'], ['z', '']]);
    assert.deepEqual(parseTsv('one'), [['one']]);
    assert.deepEqual(parseTsv('"multi\nline"'), [['multi\nline']]);
  });

  it('copies range > rows > focused cell, with headers', () => {
    const { engine } = make({ mode: 'batch' });
    const clip = (engine as unknown as { clipboard: { copy(o?: object): ClipboardCopy } }).clipboard;
    engine.dispatch({ type: 'focus.set', target: { kind: 'cell', rowId: 'r2', columnId: 'name' } });
    assert.equal(clip.copy().text, 'n2');
    engine.dispatch({ type: 'selection.selectRows', rowIds: ['r3', 'r1'] });
    assert.equal(clip.copy().source, 'rows');
    assert.equal(clip.copy().text.split('\n')[0], 'r1\tn1\t1\tTokyo\t');
    engine.dispatch({ type: 'selection.setCellRange', anchor: { rowId: 'r1', columnId: 'name' }, focus: { rowId: 'r2', columnId: 'qty' } });
    const c = clip.copy({ includeHeaders: true });
    assert.equal(c.source, 'range');
    assert.equal(c.text, 'name\tqty\nn1\t1\nn2\t2');
  });

  it('pastes into drafts: single value fills the range, blocks clip, read-only cells skip', () => {
    const { engine, m } = make({ mode: 'batch' });
    engine.dispatch({ type: 'selection.setCellRange', anchor: { rowId: 'r1', columnId: 'name' }, focus: { rowId: 'r3', columnId: 'city' } });
    engine.dispatch({ type: 'clipboard.paste', text: '7' });
    const last = () => (engine.getModuleState('clipboard') as ClipboardState).lastPaste!;
    assert.equal(m.getValue('r2', 'name'), '7');
    assert.equal(m.getValue('r3', 'qty'), 7);
    assert.equal(last().applied, 6);
    assert.equal(last().skipped, 3, 'city is read-only');
    engine.dispatch({ type: 'selection.setCellRange', anchor: { rowId: 'r5', columnId: 'name' }, focus: { rowId: 'r6', columnId: 'qty' } });
    engine.dispatch({ type: 'clipboard.paste', text: 'a\t1\tz\nb\t2\tz\nc\t3\tz' });
    assert.equal(m.getValue('r6', 'name'), 'b');
    assert.equal(m.getValue('r7', 'name'), 'n7');
    assert.equal(last().clipped, true);
    assert.equal(engine.getRow('r5')?.name, 'n5', 'batch keeps drafts');
  });

  it('a paste waiting on async validation counts its written cells as applied', async () => {
    const asyncColumns: ColumnDef<Item>[] = columns.map((c) => (c.field === 'name' ? { ...c, validation: { validate: async () => null } } : c));
    const modules = [createSelectionModule<Item>(), createFocusModule<Item>(), createEditModule<Item>(), createClipboardModule<Item>()] as const;
    const engine = createDataGridEngine<Item, typeof modules>({
      getRowId: (r) => r.id,
      columns: asyncColumns,
      dataSource: items(5),
      modules,
      edit: { mode: 'cell' },
      selection: { mode: 'both', type: 'multiple' },
    });
    const api = createEditApi(engine);
    engine.dispatch({ type: 'selection.setCellRange', anchor: { rowId: 'r1', columnId: 'name' }, focus: { rowId: 'r2', columnId: 'qty' } });
    engine.dispatch({ type: 'clipboard.paste', text: 'a\t5\nb\t6' });
    assert.equal((engine.getModuleState('edit') as EditState).status, 'validating');
    const last = (engine.getModuleState('clipboard') as ClipboardState).lastPaste!;
    assert.equal(last.applied, 4, 'validation pending: the drafts were written');
    assert.equal(last.skipped, 0);
    await api.whenEditSettled();
    assert.equal(engine.getRow('r2')?.name, 'b');
    assert.equal(engine.getRow('r2')?.qty, 6);
  });

  it('cell mode paste writes at once; fill tiles the source range', () => {
    const { engine } = make({ mode: 'cell' });
    engine.dispatch({ type: 'focus.set', target: { kind: 'cell', rowId: 'r1', columnId: 'qty' } });
    engine.dispatch({ type: 'clipboard.paste', text: '42\n43' });
    assert.equal(engine.getRow('r1')?.qty, 42);
    assert.equal(engine.getRow('r2')?.qty, 43);
    engine.dispatch({ type: 'selection.setCellRange', anchor: { rowId: 'r1', columnId: 'qty' }, focus: { rowId: 'r2', columnId: 'qty' } });
    engine.dispatch({ type: 'clipboard.fill', target: { rowId: 'r6', columnId: 'qty' } });
    assert.deepEqual([3, 4, 5, 6].map((i) => engine.getRow(`r${i}`)?.qty), [42, 43, 42, 43]);
  });
});

describe('regressions: edit, paste, and number parsing', () => {
  interface Num {
    readonly id: string;
    readonly qty: number | null;
    readonly pct: number;
  }
  function numbers(locale?: string) {
    const modules = [createSelectionModule<Num>(), createFocusModule<Num>(), createEditModule<Num>(), createClipboardModule<Num>()] as const;
    const engine = createDataGridEngine<Num, typeof modules>({
      getRowId: (r) => r.id,
      columns: [{ field: 'id', primaryKey: true }, { field: 'qty', type: 'number' }, { field: 'pct', type: 'number', format: 'P0' }],
      dataSource: [{ id: 'a', qty: 1, pct: 0.5 }, { id: 'b', qty: 2, pct: 0.25 }],
      modules,
      edit: { mode: 'batch' },
      selection: { mode: 'both', type: 'multiple' },
      ...(locale ? { locale } : {}),
    });
    const m = (engine as any).edit;
    const clip = (engine as unknown as { clipboard: { copy(o?: object): ClipboardCopy } }).clipboard;
    return { engine, api: createEditApi(engine), m, clip };
  }

  it('number parser rejects junk and reads formatted numbers', () => {
    const { api, m } = numbers();
    const parse = (text: string): unknown => {
      api.setEditValue('a', 'qty', text);
      return m.getValue('a', 'qty');
    };
    for (const junk of ['abc', '$', 'N/A', '-', '+', '   ', '12abc', 'abc123', 'Infinity', '0x1F', '1.2.3']) assert.equal(parse(junk), null, junk);
    assert.equal(parse('1,234'), 1234);
    assert.equal(parse('$1.50'), 1.5);
    assert.equal(parse('-$5'), -5);
    assert.equal(parse('(1,234)'), -1234);
    assert.equal(parse('-5%'), -0.05);
    assert.equal(parse('1e3'), 1000);
  });

  it('a percent copy pastes back as the same fraction', () => {
    const { engine, m, clip } = numbers();
    engine.dispatch({ type: 'focus.set', target: { kind: 'cell', rowId: 'a', columnId: 'pct' } });
    assert.equal(clip.copy().text, '50%');
    engine.dispatch({ type: 'focus.set', target: { kind: 'cell', rowId: 'b', columnId: 'pct' } });
    engine.dispatch({ type: 'clipboard.paste', text: '50%' });
    assert.equal(m.getValue('b', 'pct'), 0.5);
  });

  it('number parser follows the locale separators', () => {
    const { api, m } = numbers('de-DE');
    api.setEditValue('a', 'qty', '1.234,5');
    assert.equal(m.getValue('a', 'qty'), 1234.5);
  });

  it('a second saveBatch never resubmits rows of a write in flight', () => {
    const rows: Item[] = items(2);
    const requests: WriteRequest<Item>[] = [];
    const source: DataSource<Item> = {
      mode: 'local',
      read: (req) => ({ version: req.version, rows }),
      write: (req) => {
        requests.push(req);
        return new Promise<WriteResult<Item>>(() => {});
      },
    };
    const { api } = make({ mode: 'batch' }, { dataSource: source });
    api.addRow({ id: 'x1', name: 'new' });
    api.saveCell();
    api.startEdit('r0', 'name');
    api.setEditValue('r0', 'name', 'b');
    api.saveCell();
    assert.equal(api.save().status, 'applied');
    assert.equal(api.save().status, 'applied');
    assert.equal(requests.length, 1);
    // A value typed while the write is in flight goes out with the next save.
    api.startEdit('r0', 'name');
    api.setEditValue('r0', 'name', 'c');
    api.saveCell();
    api.save();
    assert.equal(requests.length, 2);
    assert.equal(requests[1]?.added.length, 0);
    assert.deepEqual(requests[1]?.changed.map((c) => c.row.name), ['c']);
  });

  it('updateRow and updateCell respect edit gates and reject invalid values', () => {
    const off = make({ mode: 'row', edit: false });
    assert.equal(off.api.updateRow('r1', { name: 'zz' }).status, 'rejected');
    assert.equal(off.engine.getRow('r1')?.name, 'n1');
    const { engine, api, m } = make({ mode: 'row' });
    assert.equal(api.updateCell('r1', 'city', 'Osaka').status, 'rejected', 'read-only column');
    assert.equal(engine.getRow('r1')?.city, 'Tokyo');
    assert.equal(api.updateRow('r1', { name: '' }).status, 'rejected');
    assert.deepEqual(m.getErrors('r1', 'name'), ['This field is required.']);
    assert.equal(engine.getRow('r1')?.name, 'n1');
  });

  it('updateCell and cell-mode paste run custom validators and validateRow', () => {
    const custom: ColumnDef<Item>[] = columns.map((c) =>
      c.field === 'name' ? { ...c, validation: { required: true, validate: (v: unknown) => (v === 'bad' ? 'No' : null) } } : c,
    );
    const modules = [createSelectionModule<Item>(), createFocusModule<Item>(), createEditModule<Item>(), createClipboardModule<Item>()] as const;
    const engine = createDataGridEngine<Item, typeof modules>({
      getRowId: (r) => r.id,
      columns: custom,
      dataSource: items(3),
      modules,
      edit: { mode: 'cell', validateRow: (row: Item) => (row.qty > 50 ? 'Too many' : null) },
    });
    const api = createEditApi(engine);
    const m = (engine as any).edit;
    assert.equal(api.updateCell('r1', 'name', 'bad').status, 'rejected');
    assert.equal(engine.getRow('r1')?.name, 'n1');
    assert.equal(api.updateCell('r1', 'qty', 60).status, 'rejected');
    assert.equal(engine.getRow('r1')?.qty, 1);
    engine.dispatch({ type: 'focus.set', target: { kind: 'cell', rowId: 'r2', columnId: 'qty' } });
    engine.dispatch({ type: 'clipboard.paste', text: '99' });
    assert.equal(engine.getRow('r2')?.qty, 2);
    assert.deepEqual(m.getRowErrors('r2'), ['Too many']);
    engine.dispatch({ type: 'clipboard.paste', text: '9' });
    assert.equal(engine.getRow('r2')?.qty, 9);
  });

  it('row-mode paste keeps drafts instead of writing', () => {
    const { engine, m } = make({ mode: 'row' });
    engine.dispatch({ type: 'focus.set', target: { kind: 'cell', rowId: 'r1', columnId: 'name' } });
    engine.dispatch({ type: 'clipboard.paste', text: 'X' });
    assert.equal(m.getValue('r1', 'name'), 'X');
    assert.equal(engine.getRow('r1')?.name, 'n1');
  });

  it('cell mode writes an added row once it is valid', () => {
    const { engine, api, state } = make({ mode: 'cell' });
    api.addRow({ id: 'n1', name: 'x' });
    assert.equal(api.saveCell().status, 'applied');
    assert.equal(engine.getRow('n1')?.name, 'x');
    assert.deepEqual(state().addedRowIds, []);
    api.addRow({ id: 'n2' });
    api.saveCell();
    assert.equal(engine.getRow('n2'), undefined, 'name is still required');
    const added = state().addedRowIds[0]!;
    api.startEdit(added, 'name');
    api.setEditValue(added, 'name', 'y');
    api.saveCell();
    assert.equal(engine.getRow('n2')?.name, 'y');
  });

  it('autofill copies draft values of the source range', () => {
    const { engine, api, m } = make({ mode: 'batch' });
    api.startEdit('r0', 'qty');
    api.setEditValue('r0', 'qty', 42);
    api.saveCell();
    engine.dispatch({ type: 'selection.setCellRange', anchor: { rowId: 'r0', columnId: 'qty' }, focus: { rowId: 'r0', columnId: 'qty' } });
    engine.dispatch({ type: 'clipboard.fill', target: { rowId: 'r2', columnId: 'qty' } });
    assert.deepEqual([m.getValue('r1', 'qty'), m.getValue('r2', 'qty')], [42, 42]);
  });

  it('paste skips utility columns and group rows like copy does', () => {
    const withUtility: ColumnDef<Item>[] = [columns[0]!, columns[1]!, { id: 'tools', header: 'Tools' }, columns[2]!, columns[3]!];
    const modules = [createGroupingModule<Item>(), createSelectionModule<Item>(), createFocusModule<Item>(), createEditModule<Item>(), createClipboardModule<Item>()] as const;
    const engine = createDataGridEngine<Item, typeof modules>({
      getRowId: (r) => r.id,
      columns: withUtility,
      dataSource: items(6),
      modules,
      edit: { mode: 'batch' },
      selection: { mode: 'both', type: 'multiple' },
    });
    const m = (engine as any).edit;
    const clip = (engine as unknown as { clipboard: { copy(o?: object): ClipboardCopy } }).clipboard;
    engine.dispatch({ type: 'selection.setCellRange', anchor: { rowId: 'r1', columnId: 'name' }, focus: { rowId: 'r2', columnId: 'qty' } });
    const text = clip.copy().text;
    assert.equal(text, 'n1\t1\nn2\t2', 'copy skips the utility column');
    engine.dispatch({ type: 'selection.clear' });
    engine.dispatch({ type: 'grouping.set', grouping: [{ columnId: 'city' }] });
    // The last data row of the first group, then the first data row after the next caption.
    let caption = 1;
    while (!engine.getRowIdAt(caption)!.startsWith('__g:')) caption++;
    const last = engine.getRowIdAt(caption - 1)!;
    const after = engine.getRowIdAt(caption + 1)!;
    engine.dispatch({ type: 'focus.set', target: { kind: 'cell', rowId: last, columnId: 'name' } });
    engine.dispatch({ type: 'clipboard.paste', text });
    assert.equal(m.getValue(last, 'name'), 'n1');
    assert.equal(m.getValue(last, 'qty'), 1, 'the utility column takes no value');
    assert.equal(m.getValue(after, 'name'), 'n2', 'the group caption is skipped, not consumed');
  });

  it('a command waiting on async validation is not replayed on another row', async () => {
    const asyncColumns: ColumnDef<Item>[] = columns.map((c) =>
      c.field === 'name' ? { ...c, validation: { required: true, validate: async () => null } } : c,
    );
    const modules = [createEditModule<Item>()] as const;
    const engine = createDataGridEngine<Item, typeof modules>({ getRowId: (r) => r.id, columns: asyncColumns, dataSource: items(5), modules, edit: { mode: 'row' } });
    const api = createEditApi(engine);
    api.startEdit('r1');
    api.setEditValue('r1', 'name', 'one');
    api.saveCell();
    api.cancelEdit();
    api.startEdit('r2');
    api.setEditValue('r2', 'qty', 9);
    await api.whenEditSettled();
    assert.equal(engine.getRow('r2')?.qty, 2, 'the queued commit of r1 did not commit r2');
    assert.equal((engine.getModuleState('edit') as EditState).active?.rowId, 'r2');
  });

  it('an async validateRow settles once and then lets the commit through', async () => {
    const modules = [createEditModule<Item>()] as const;
    let calls = 0;
    const engine = createDataGridEngine<Item, typeof modules>({
      getRowId: (r) => r.id,
      columns,
      dataSource: items(5),
      modules,
      edit: {
        mode: 'row',
        validateRow: async (row: Item) => {
          calls++;
          return row.qty > 50 ? 'Too many' : null;
        },
      },
    });
    const api = createEditApi(engine);
    const m = (engine as any).edit;
    api.startEdit('r1');
    api.setEditValue('r1', 'qty', 60);
    api.saveCell();
    await api.whenEditSettled();
    assert.deepEqual(m.getRowErrors('r1'), ['Too many']);
    assert.equal(engine.getRow('r1')?.qty, 1);
    api.setEditValue('r1', 'qty', 5);
    api.saveCell();
    await api.whenEditSettled();
    assert.equal(engine.getRow('r1')?.qty, 5);
    assert.equal(calls, 2);
  });

  it('identity keys of several added rows are distinct', () => {
    interface Keyed {
      readonly id: number | null;
      readonly name: string;
    }
    const modules = [createEditModule<Keyed>()] as const;
    const engine = createDataGridEngine<Keyed, typeof modules>({
      getRowId: (r) => String(r.id),
      columns: [{ field: 'id', type: 'number', primaryKey: true, identity: true }, { field: 'name' }],
      dataSource: [{ id: 3, name: 'c' }],
      modules,
      edit: { mode: 'batch' },
    });
    const api = createEditApi(engine);
    for (const name of ['x', 'y', 'z']) {
      api.addRow({ name });
      api.saveCell();
    }
    assert.equal(api.save().status, 'applied');
    // Added rows sit at the top, so they are written z, y, x; each gets its own key.
    assert.deepEqual(['4', '5', '6'].map((id) => engine.getRow(id)?.name), ['z', 'y', 'x']);
  });

  it('empty clipboard text pastes nothing; group prefixes do not match user ids', () => {
    assert.deepEqual(parseTsv(''), []);
    const { engine, api } = make({ mode: 'batch' }, { dataSource: [{ id: '__guest', name: 'g', qty: 1, city: 'Tokyo', due: null }] as any });
    engine.dispatch({ type: 'focus.set', target: { kind: 'cell', rowId: '__guest', columnId: 'name' } });
    assert.deepEqual(engine.dispatch({ type: 'clipboard.paste', text: '' }), { status: 'rejected', reason: 'empty' });
    assert.equal(api.startEdit('__guest', 'name').status, 'applied');
  });
});

describe('edit API names', () => {
  it('save, saveCell, cancelEdit, getPendingChanges follow the mode', () => {
    const { engine, api, state } = make({ mode: 'batch' });
    assert.equal(api.startEdit().status, 'rejected', 'no row id and no selection');
    api.startEdit('r1', 'name');
    api.setEditValue('r1', 'name', 'Batch');
    assert.equal(api.saveCell().status, 'applied');
    assert.equal(api.getPendingChanges().changedRecords.length, 1, 'saveCell keeps the change pending in batch mode');
    assert.equal(api.save().status, 'applied');
    assert.equal(engine.getRow('r1')?.name, 'Batch');
    api.updateCell('r2', 'name', 'Draft');
    assert.ok(api.hasUnsavedChanges());
    assert.equal(api.cancelEdit().status, 'applied');
    assert.equal(api.hasUnsavedChanges(), false, 'cancelEdit without an open editor discards the batch');
    assert.equal(state().active, null);
  });

  it('addRow index, setCellValue, setRowData, applyChanges', () => {
    const { engine, api, state } = make({ mode: 'row' });
    assert.equal(api.addRow({ id: 'x' }, 3).status, 'rejected');
    assert.equal(api.addRow({ id: 'x', name: 'X' }, 0).status, 'applied');
    assert.equal(state().addedRowIds.length, 1);
    api.cancelEdit();
    assert.equal(api.setCellValue('r1', 'name', 'Silent').status, 'applied');
    assert.equal(engine.getRow('r1')?.name, 'Silent');
    assert.equal(api.setCellValue('missing', 'name', 'x').status, 'rejected');
    const r2 = engine.getRow('r2')!;
    assert.equal(api.setRowData('r2', { ...r2, qty: 99 }).status, 'applied');
    assert.equal(engine.getRow('r2')?.qty, 99);
    assert.equal(api.applyChanges({ added: [{ ...r2, id: 'z1' }], deleted: ['r3'] }).status, 'applied');
    assert.ok(engine.getRow('z1'));
    assert.equal(engine.getRow('r3'), undefined);
  });
});

/** A local source whose write resolves after `ticks` timer ticks. */
function delayedSource(ticks: number, respond?: (req: WriteRequest<Item>) => WriteResult<Item>): DataSource<Item> & { requests: WriteRequest<Item>[] } {
  let rows = items(10);
  const listeners = new Set<(e: any) => void>();
  const requests: WriteRequest<Item>[] = [];
  return {
    mode: 'local',
    requests,
    read: (req) => ({ version: req.version, rows }),
    subscribe(l) {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    async write(req) {
      requests.push(req);
      for (let i = 0; i < ticks; i++) await new Promise((r) => setTimeout(r, 0));
      const result: WriteResult<Item> = respond
        ? respond(req)
        : {
            version: req.version,
            status: 'applied',
            changed: req.changed.map((c) => ({ rowId: c.rowId, row: c.row })),
            added: req.added.map((a) => ({ tempId: a.tempId, row: a.row })),
            deleted: req.deleted.map((d) => d.rowId),
          };
      if (result.status !== 'rejected') {
        const changed = new Map((result.changed ?? []).map((c) => [c.rowId, c.row] as const));
        const removed = new Set(result.deleted ?? []);
        rows = [...rows.filter((r) => !removed.has(r.id)).map((r) => changed.get(r.id) ?? r), ...(result.added ?? []).map((a) => a.row)];
        for (const l of listeners) l({ type: 'patch', rows, updated: [...changed.keys()], added: (result.added ?? []).map((a) => a.row.id), removed: [...removed] });
      }
      return result;
    },
  };
}

function asyncNameEngine(edit: EditOptions<Item>, validate: (v: unknown) => Promise<string | null>) {
  const asyncColumns: ColumnDef<Item>[] = columns.map((c) => (c.field === 'name' ? { ...c, validation: { required: true, validate } } : c));
  const modules = [createEditModule<Item>()] as const;
  const engine = createDataGridEngine<Item, typeof modules>({ getRowId: (r) => r.id, columns: asyncColumns, dataSource: items(5), modules, edit });
  const m = (engine as any).edit;
  return { engine, api: createEditApi(engine), m, state: () => engine.getModuleState('edit') as EditState };
}

describe('edit core: async results, validateBatch, settle, messages', () => {
  it('a command blocked by async validation rejects `validating`, the API reports async, and the replay commits', async () => {
    const { engine, api, state } = asyncNameEngine({ mode: 'row' }, async (v) => (v === 'dup' ? 'Already used' : null));
    api.startEdit('r1');
    api.setEditValue('r1', 'name', 'fresh');
    assert.deepEqual(engine.dispatch({ type: 'edit.commit' }), { status: 'rejected', reason: 'validating' });
    assert.equal(state().status, 'validating', 'the validating status is still published');
    await api.whenEditSettled();
    assert.equal(engine.getRow('r1')?.name, 'fresh', 'the queued commit was replayed');
    api.startEdit('r2');
    api.setEditValue('r2', 'name', 'other');
    const r = api.saveCell();
    assert.equal(r.status, 'async');
    await (r as { promise: Promise<void> }).promise;
    assert.equal(engine.getRow('r2')?.name, 'other', 'the promise resolves after the replay ran');
    assert.equal(state().active, null);
    const u = api.updateCell('r3', 'name', 'upd');
    assert.equal(u.status, 'async');
    await (u as { promise: Promise<void> }).promise;
    assert.equal(engine.getRow('r3')?.name, 'upd');
  });

  it('startEdit in cell mode waits for the previous cell and then opens the next', async () => {
    const { engine, api, state } = asyncNameEngine({ mode: 'cell' }, async () => null);
    api.startEdit('r1', 'name');
    api.setEditValue('r1', 'name', 'cellA');
    const r = api.startEdit('r2', 'name');
    assert.equal(r.status, 'async');
    await (r as { promise: Promise<void> }).promise;
    assert.equal(engine.getRow('r1')?.name, 'cellA');
    assert.deepEqual(state().active, { rowId: 'r2', columnId: 'name', isNew: false });
  });

  it('validateBatch checks every pending change and writes nothing', async () => {
    const { engine, api, m } = make({ mode: 'batch', validateRow: (row: Item) => (row.qty > 50 ? 'Too many' : null) });
    api.setEditValue('r1', 'name', 'okay');
    assert.equal(engine.dispatch({ type: 'edit.validateBatch' }).status, 'applied');
    assert.equal(await api.validateBatch(), true);
    api.setEditValue('r2', 'qty', 60);
    api.addRow({ id: 'x1' });
    api.saveCell();
    const added = (engine.getModuleState('edit') as EditState).addedRowIds[0]!;
    assert.deepEqual(m.getErrors(added, 'name'), [], 'an unvisited cell of an added row has no mark yet');
    assert.deepEqual(engine.dispatch({ type: 'edit.validateBatch' }), { status: 'rejected', reason: 'invalid' });
    assert.deepEqual(m.getErrors(added, 'name'), ['This field is required.'], 'built-in rules on added rows');
    assert.deepEqual(m.getRowErrors('r2'), ['Too many'], 'validateRow on dirty rows');
    assert.equal(await api.validateBatch(), false);
    assert.equal(engine.getRow('r1')?.name, 'n1', 'nothing written');
    assert.ok(api.hasUnsavedChanges());
  });

  it('validateBatch waits for async validators', async () => {
    const { engine, api, m } = asyncNameEngine({ mode: 'batch' }, async (v) => (v === 'dup' ? 'Already used' : null));
    api.setEditValue('r1', 'name', 'dup');
    assert.deepEqual(engine.dispatch({ type: 'edit.validateBatch' }), { status: 'rejected', reason: 'validating' });
    assert.equal(await api.validateBatch(), false);
    assert.deepEqual(m.getErrors('r1', 'name'), ['Already used']);
    api.setEditValue('r1', 'name', 'fine');
    assert.equal(await api.validateBatch(), true);
    assert.equal(engine.getRow('r1')?.name, 'n1');
  });

  it('whenSettled waits for a write that takes more than 100 timer ticks', async () => {
    const { engine, api, state } = make({ mode: 'cell' }, { dataSource: delayedSource(150) });
    api.startEdit('r1', 'name');
    api.setEditValue('r1', 'name', 'slow');
    assert.equal(api.saveCell().status, 'applied');
    assert.equal(state().pendingWrites, 1);
    await api.whenEditSettled();
    assert.equal(state().pendingWrites, 0);
    assert.equal(engine.getRow('r1')?.name, 'slow');
  });

  it('a server cell error survives re-typing the same value and clears on a new value', async () => {
    const source = delayedSource(1, (req) => ({ version: req.version, status: 'partial', cellErrors: { 'r2:name': ['Name taken'] } }));
    const { api, m } = make({ mode: 'batch' }, { dataSource: source });
    api.setEditValue('r2', 'name', 'taken');
    api.save();
    await api.whenEditSettled();
    assert.deepEqual(m.getErrors('r2', 'name'), ['Name taken']);
    api.startEdit('r2', 'name');
    api.setEditValue('r2', 'name', 'taken');
    assert.deepEqual(m.getErrors('r2', 'name'), ['Name taken'], 'same value: the server error stays');
    api.setEditValue('r2', 'name', 'free');
    assert.deepEqual(m.getErrors('r2', 'name'), []);
  });

  it('save and conflict messages come from overridable text; setOptions swaps messages at runtime', async () => {
    assert.equal(DEFAULT_EDIT_MESSAGES.conflict, 'Conflict: the row was changed on the server.');
    const conflictSource = delayedSource(1, (req) => ({
      version: req.version,
      status: 'partial',
      conflicts: [{ rowId: 'r1', local: req.changed[0]!.row, server: req.changed[0]!.previous, base: null, cells: [] }],
    }));
    const { engine, api, m, state } = make({ mode: 'cell', messages: { conflict: 'Konflikt', partialSave: 'Nicht alles gespeichert', required: 'Pflichtfeld' } }, { dataSource: conflictSource });
    api.startEdit('r1', 'qty');
    api.setEditValue('r1', 'qty', 5);
    api.saveCell();
    await api.whenEditSettled();
    assert.deepEqual(m.getRowErrors('r1'), ['Konflikt']);
    assert.equal(state().lastError, 'Nicht alles gespeichert');
    api.updateRow('r3', { name: '' });
    assert.deepEqual(m.getErrors('r3', 'name'), ['Pflichtfeld']);
    engine.dispatch({ type: 'edit.setOptions', options: { messages: { required: 'Obligatoire' } } });
    api.updateRow('r4', { name: '' });
    assert.deepEqual(m.getErrors('r4', 'name'), ['Obligatoire'], 'rules recompile with the new texts');
    const rejecting = make({ mode: 'cell', messages: { saveRejected: 'Abgelehnt' } }, { dataSource: delayedSource(1, (req) => ({ version: req.version, status: 'rejected' })) });
    rejecting.api.updateCell('r1', 'name', 'zz');
    await rejecting.api.whenEditSettled();
    assert.equal(rejecting.state().lastError, 'Abgelehnt');
  });
});

describe('edit on lookup (foreign-key) columns', () => {
  interface Order {
    readonly id: string;
    readonly customerId: number | null;
    readonly qty: number;
  }
  const customers = [
    { CustomerID: 1, ContactName: 'Maria' },
    { CustomerID: 2, ContactName: 'Ana' },
    { CustomerID: 3, ContactName: 'Thomas' },
  ];
  function lookupEngine(mode: 'cell' | 'batch') {
    const modules = [createLookupModule<Order>(), createEditModule<Order>()] as const;
    const engine = createDataGridEngine<Order, typeof modules>({
      getRowId: (r) => r.id,
      columns: [
        { field: 'id', primaryKey: true },
        { field: 'customerId', type: 'number', lookup: { data: customers, keyField: 'CustomerID', displayField: 'ContactName' }, validation: { required: true, min: 1 } },
        { field: 'qty', type: 'number' },
      ],
      dataSource: [{ id: 'o1', customerId: 3, qty: 1 }, { id: 'o2', customerId: 1, qty: 2 }],
      modules,
      edit: { mode },
    });
    return { engine, api: createEditApi(engine), m: (engine as any).edit };
  }

  it('drafts, validation, and the edited row work on the key; the display shows the lookup text', () => {
    const { engine, api, m } = lookupEngine('batch');
    assert.equal(engine.getCellSnapshot('o1', 'customerId')?.formattedValue, 'Thomas');
    api.startEdit('o1', 'customerId');
    assert.equal(m.getValue('o1', 'customerId'), 3, 'the initial draft is the key');
    assert.equal(m.getDraft('o1', 'customerId').initialValue, 3);
    api.setEditValue('o1', 'customerId', 2);
    assert.equal(m.getValue('o1', 'customerId'), 2);
    assert.equal(m.getDisplay('o1', 'customerId').formattedValue, 'Ana');
    assert.equal(m.getEditedRow('o1').customerId, 2);
    api.setEditValue('o1', 'customerId', 0);
    assert.equal(m.getErrors('o1', 'customerId').length, 1, 'rules see the key, not the display text');
    api.setEditValue('o1', 'customerId', 42);
    assert.equal(m.getDisplay('o1', 'customerId').formattedValue, '42', 'an unknown key shows its text');
    api.setEditValue('o1', 'customerId', 1);
    api.saveCell();
    assert.equal(api.save().status, 'applied');
    assert.equal(engine.getRow('o1')?.customerId, 1);
    assert.equal(engine.getCellSnapshot('o1', 'customerId')?.formattedValue, 'Maria');
  });

  it('re-typing the stored key leaves a clean draft', () => {
    const { api, m } = lookupEngine('cell');
    api.startEdit('o2', 'customerId');
    api.setEditValue('o2', 'customerId', 1);
    assert.equal(m.getDraft('o2', 'customerId').dirty, false);
  });
});

describe('undo and redo', () => {
  it('records nothing with undo off', () => {
    const { engine, api, state } = make({ mode: 'batch' });
    api.setEditValue('r1', 'name', 'x');
    assert.equal(state().canUndo, false);
    assert.deepEqual(engine.dispatch({ type: 'edit.undo' }), { status: 'rejected', reason: 'undoDisabled' });
  });

  it('batch: one entry per editor session, bulk set, add, and delete mark', () => {
    const { engine, api, m, state } = make({ mode: 'batch', undo: true });
    api.startEdit('r1', 'name');
    api.setEditValue('r1', 'name', 'a');
    api.setEditValue('r1', 'name', 'ab');
    assert.equal(state().canUndo, false, 'the session is still open');
    engine.dispatch({ type: 'edit.commitAndMove', direction: 'next' });
    assert.equal(state().canUndo, true);
    assert.deepEqual(api.undo(), { status: 'rejected', reason: 'editing' }, 'not while an editor is open');
    api.setEditValue('r1', 'qty', 9);
    api.saveCell();
    engine.dispatch({ type: 'edit.setValues', cells: [{ rowId: 'r2', columnId: 'name', value: 'p' }, { rowId: 'r3', columnId: 'name', value: 'q' }] });
    api.addRow({ id: 'k1', name: 'new' });
    api.saveCell();
    api.deleteRows('r4');
    assert.equal(api.undo().status, 'applied');
    assert.equal(m.rowFlags('r4') & EDIT_DELETED, 0, 'delete mark undone');
    assert.equal(api.undo().status, 'applied');
    assert.deepEqual(state().addedRowIds, [], 'added row undone');
    assert.equal(api.undo().status, 'applied');
    assert.deepEqual([m.getValue('r2', 'name'), m.getValue('r3', 'name')], ['n2', 'n3'], 'setValues is one entry');
    assert.equal(api.undo().status, 'applied');
    assert.equal(m.getValue('r1', 'qty'), 1);
    assert.equal(m.getValue('r1', 'name'), 'ab');
    assert.equal(api.undo().status, 'applied');
    assert.equal(m.getValue('r1', 'name'), 'n1', 'the whole typing session is one entry');
    assert.equal(state().dirtyCellCount, 0);
    assert.equal(api.canUndo(), false);
    assert.deepEqual(api.undo(), { status: 'rejected', reason: 'nothingToUndo' });
    assert.equal(api.redo().status, 'applied');
    assert.equal(m.getValue('r1', 'name'), 'ab');
    assert.equal(api.redo().status, 'applied');
    assert.equal(api.redo().status, 'applied');
    assert.equal(api.redo().status, 'applied');
    assert.equal(state().addedRowIds.length, 1);
    assert.equal(m.getValue(state().addedRowIds[0]!, 'name'), 'new', 'the added row comes back with its drafts');
    assert.equal(api.redo().status, 'applied');
    assert.ok(m.rowFlags('r4') & EDIT_DELETED);
    assert.equal(api.canRedo(), false);
    assert.equal(api.save().status, 'applied');
    assert.equal(engine.getRow('r1')?.name, 'ab');
    assert.equal(engine.getRow('k1')?.name, 'new');
    // The save is one write entry: undo reverts it through a write.
    assert.equal(api.undo().status, 'applied');
    assert.equal(engine.getRow('r1')?.name, 'n1');
    assert.equal(engine.getRow('k1'), undefined);
    assert.equal(engine.getRow('r4')?.name, 'n4');
    assert.equal(api.hasUnsavedChanges(), false);
  });

  it('batch: a new action clears redo; the stack is capped at undoLimit; Escape and cancelBatch record nothing', () => {
    const { api, m, state } = make({ mode: 'batch', undo: true, undoLimit: 2 });
    api.startEdit('r1', 'name');
    api.setEditValue('r1', 'name', 'esc');
    api.cancelEdit();
    assert.equal(state().canUndo, false, 'Escape restores the draft: no entry');
    for (const v of ['a', 'b', 'c']) api.setEditValue('r1', 'name', v);
    api.undo();
    api.undo();
    assert.deepEqual(api.undo(), { status: 'rejected', reason: 'nothingToUndo' }, 'capped at 2');
    assert.equal(m.getValue('r1', 'name'), 'a');
    assert.equal(state().canRedo, true);
    api.setEditValue('r2', 'name', 'z');
    assert.equal(state().canRedo, false, 'a new action clears redo');
    api.cancelEdit();
    assert.equal(state().canUndo, false, 'cancelBatch drops the draft history');
  });

  it('cell mode: undo issues the inverse write, redo re-applies it', () => {
    const { engine, api, state } = make({ mode: 'cell', undo: true }, { count: 50 });
    engine.dispatch({ type: 'sort.set', sorting: [{ columnId: 'qty', direction: 'desc' }] });
    const index = engine.getRowIndex('r5');
    api.startEdit('r5', 'qty');
    api.setEditValue('r5', 'qty', 99);
    api.saveCell();
    assert.equal(engine.getRow('r5')?.qty, 99);
    assert.equal(state().canUndo, true);
    assert.equal(api.undo().status, 'applied');
    assert.equal(engine.getRow('r5')?.qty, 5);
    assert.equal(engine.getRowIndex('r5'), index, 'sorted back in place');
    assert.equal(api.hasUnsavedChanges(), false);
    assert.equal(api.redo().status, 'applied');
    assert.equal(engine.getRow('r5')?.qty, 99);
    assert.equal(api.undo().status, 'applied');
    assert.equal(engine.getRow('r5')?.qty, 5);
    assert.equal(state().canRedo, true);
  });

  it('row mode: undo of an add deletes the row, undo of a delete re-adds it', () => {
    const { engine, api } = make({ mode: 'row', undo: true });
    api.addRow({ id: 'k9', name: 'Kay' });
    api.saveCell();
    assert.ok(engine.getRow('k9'));
    api.deleteRows('r2');
    assert.equal(engine.getRow('r2'), undefined);
    api.undo();
    assert.equal(engine.getRow('r2')?.name, 'n2');
    api.undo();
    assert.equal(engine.getRow('k9'), undefined);
    api.redo();
    assert.equal(engine.getRow('k9')?.name, 'Kay');
    api.redo();
    assert.equal(engine.getRow('r2'), undefined);
    api.updateRow('r1', { name: 'Up', qty: 5 });
    api.undo();
    assert.deepEqual([engine.getRow('r1')?.name, engine.getRow('r1')?.qty], ['n1', 1], 'one entry per row write');
  });

  it('records a write that settles later; undo with unsaved drafts on the row is refused', async () => {
    const { engine, api, state } = make({ mode: 'cell', undo: true }, { dataSource: delayedSource(3) });
    api.updateCell('r1', 'name', 'later');
    assert.equal(state().canUndo, false);
    await api.whenEditSettled();
    assert.equal(engine.getRow('r1')?.name, 'later');
    assert.equal(state().canUndo, true);
    api.setEditValue('r1', 'qty', 7);
    assert.deepEqual(api.undo(), { status: 'rejected', reason: 'unsavedChanges' });
    engine.dispatch({ type: 'edit.cancelBatch' });
    assert.equal(api.undo().status, 'applied');
    await api.whenEditSettled();
    assert.equal(engine.getRow('r1')?.name, 'n1');
  });

  it('setOptions turns undo on and off; Mod+Z and Mod+Y / Mod+Shift+Z are body bindings', () => {
    const { engine, api, state } = make({ mode: 'cell' });
    engine.dispatch({ type: 'edit.setOptions', options: { undo: true, undoLimit: 3 } });
    assert.equal(state().options.undo, true);
    assert.equal(state().options.undoLimit, 3);
    api.updateCell('r1', 'name', 'on');
    assert.equal(state().canUndo, true);
    engine.dispatch({ type: 'edit.setOptions', options: { undo: false } });
    assert.equal(state().canUndo, false);
    const key = (k: string, mods: Record<string, boolean> = {}) => ({ key: k, code: '', ctrlKey: false, metaKey: false, shiftKey: false, altKey: false, ...mods });
    const win = createKeymap({ platform: 'other' });
    const mac = createKeymap({ platform: 'mac' });
    assert.equal(win.resolve(key('z', { ctrlKey: true }), 'body'), 'edit.undo');
    assert.equal(mac.resolve(key('z', { metaKey: true }), 'body'), 'edit.undo');
    assert.equal(win.resolve(key('y', { ctrlKey: true }), 'body'), 'edit.redo');
    assert.equal(mac.resolve(key('z', { metaKey: true, shiftKey: true }), 'body'), 'edit.redo');
    assert.equal(win.resolve(key('z', { ctrlKey: true }), 'editor'), null, 'the editor keeps native text undo');
  });
});

describe('edit-state subpath (lazy editing stand-ins)', () => {
  it('the at-rest state and command types match the edit and clipboard modules', async () => {
    const { CLIPBOARD_COMMANDS, createInitialEditState, EDIT_COMMANDS, INITIAL_CLIPBOARD_STATE } = await import('@salmonui/data-grid/engine/edit-state');
    for (const edit of [undefined, { mode: 'batch' as const, undo: true, undoLimit: 3 }, { mode: 'cell' as const, add: false }]) {
      const options = { getRowId: (r: unknown) => (r as { id: string }).id, columns: [], dataSource: [], ...(edit ? { edit } : {}) } as DataGridOptions<unknown>;
      assert.deepEqual(createInitialEditState(options), createEditModule().initialState(options));
      assert.deepEqual(INITIAL_CLIPBOARD_STATE, createClipboardModule().initialState(options));
    }
    assert.deepEqual([...EDIT_COMMANDS].sort(), [...createEditModule().commands].sort());
    assert.deepEqual([...CLIPBOARD_COMMANDS].sort(), [...createClipboardModule().commands].sort());
  });
});
