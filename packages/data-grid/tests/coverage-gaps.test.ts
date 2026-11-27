// Coverage gaps of the React layer without a DOM: edit gates through the key, toolbar and
// command paths, the edit lifecycle events and their cancellation, localized
// validation messages (Node and SSR), `onReady` and the unmount teardown,
// lazy group toggle events, and the DOM lookups of the API before a DOM
// exists. Instances are driven like `data-ui.test.ts`: `new DataGridInstance`,
// `mount()` without a viewport, and the loaded editing chunk.
import assert from 'node:assert/strict';
import { before, describe, it } from 'node:test';
import type { DataSourceRequest, DataSourceResult, DataSource, GroupedRowEnvelope } from '@salmonui/data-grid/engine';
import type {
  DataGridAddEvent,
  DataGridApi,
  DataGridCellValueChangeEvent,
  DataGridColumn,
  DataGridDeleteEvent,
  DataGridEditCancelEvent,
  DataGridGroupToggleEvent,
  DataGridProps,
  DataGridSaveEvent,
} from '@salmonui/data-grid';
import { messagesOf } from '../dist/data-grid/editing/edit-host.js';
import { DataGridInstance } from '../dist/data-grid/instance.js';
import { count, people, personColumns, render, type Person, newInstance } from './fixtures.ts';

let seq = 0;
function make<R = Person>(props: Partial<DataGridProps<R>> = {}): DataGridInstance<R> {
  return newInstance<R>({ data: people(5), columns: personColumns, 'aria-label': 'People', ...props } as never, `:pg${seq++}:`);
}

/** Mounts (no viewport) and waits for the editing chunk. */
async function mounted<R>(instance: DataGridInstance<R>): Promise<() => void> {
  const unmount = instance.mount();
  await instance.api.whenEditSettled();
  await Promise.resolve();
  return unmount;
}

const visibleIds = <R>(instance: DataGridInstance<R>): string[] => {
  const out: string[] = [];
  const engine = instance.engine as unknown as { getSnapshot(): { rows: { count: number } }; getRowIdAt(i: number): string | undefined };
  for (let i = 0; i < engine.getSnapshot().rows.count; i++) out.push(engine.getRowIdAt(i) as string);
  return out;
};

/**
 * A keyboard event stand-in for the first combo bound to `command` on the
 * platform the mounted keymap uses (Insert on Windows/Linux, Ctrl+Cmd+Enter
 * on macOS for `edit.add`).
 */
function keyFor(instance: DataGridInstance<Person>, command: string) {
  const combo = instance.interaction.keymap.combosOf(command)[0] as string;
  const parts = combo.split('+');
  const k = parts.at(-1) as string;
  const has = (mod: string) => parts.slice(0, -1).includes(mod);
  return { key: k, code: k, ctrlKey: has('Ctrl'), metaKey: has('Meta'), altKey: has('Alt'), shiftKey: has('Shift'), target: null, preventDefault() {}, stopPropagation() {} } as never;
}

before(async () => {
  const host = (await import(new URL('../dist/data-grid/editing/edit-host.js', import.meta.url).href)) as { loadEditChunk(): Promise<unknown> };
  await host.loadEditChunk();
});

describe('edit gates through keys, toolbar and command column', () => {
  it('delete: false refuses the Delete key, the toolbar Delete, the command Delete and deleteRows', async () => {
    const events: string[] = [];
    const m = make({
      editing: { mode: 'row', delete: false },
      toolbar: ['add', 'delete'],
      onBeforeDelete: () => events.push('beforeDelete'),
      onDelete: () => events.push('delete'),
    });
    const unmount = await mounted(m);
    const all = visibleIds(m);
    m.engine.dispatch({ type: 'focus.set', target: { kind: 'cell', rowId: 'p1', columnId: 'name' } });
    assert.equal(m.interaction.handleKey(keyFor(m, 'edit.delete'), 'body'), false, 'Delete key not handled');
    assert.equal(m.api.runCommand('edit.delete', { rowIds: ['p1'] }), false, 'toolbar / menu Delete refused');
    m.editing.runCommandItem({ type: 'delete' } as never, 'p2', 'pointer');
    assert.deepEqual(events, [], 'the key, toolbar and command paths raise no delete events');
    const r = m.api.deleteRows('p3');
    assert.equal(r.status === 'rejected' && r.reason, 'deleteDisabled');
    assert.deepEqual(events, [], 'deleteRows: no before- or after-event for a disabled delete');
    assert.deepEqual(visibleIds(m), all, 'no row deleted');
    assert.equal(m.api.hasUnsavedChanges(), false);
    unmount();
  });

  it('delete and add on: the same Delete and Insert key paths act (control for)', async () => {
    const m = make({ editing: { mode: 'row' } });
    const unmount = await mounted(m);
    m.engine.dispatch({ type: 'focus.set', target: { kind: 'cell', rowId: 'p1', columnId: 'name' } });
    assert.equal(m.interaction.handleKey(keyFor(m, 'edit.delete'), 'body'), true);
    await m.api.whenEditSettled();
    assert.equal(visibleIds(m).includes('p1'), false);
    m.engine.dispatch({ type: 'focus.set', target: { kind: 'cell', rowId: 'p2', columnId: 'name' } });
    assert.equal(m.interaction.handleKey(keyFor(m, 'edit.add'), 'body'), true);
    assert.equal(m.api.getEditSnapshot()?.addedRows.length, 1);
    unmount();
  });

  it('add: false refuses the Insert key (Ctrl+Cmd+Enter on macOS), the toolbar Add and addRow', async () => {
    const events: string[] = [];
    const m = make({ editing: { mode: 'row', add: false }, toolbar: ['add'], onBeforeAdd: () => events.push('beforeAdd'), onAdd: () => events.push('add') });
    const unmount = await mounted(m);
    m.engine.dispatch({ type: 'focus.set', target: { kind: 'cell', rowId: 'p1', columnId: 'name' } });
    assert.equal(m.interaction.handleKey(keyFor(m, 'edit.add'), 'body'), false);
    assert.deepEqual(events, [], 'the add key raises no add events');
    assert.equal(m.api.runCommand('edit.add'), false, 'toolbar / menu Add refused');
    const r = m.api.addRow({ name: 'New' });
    assert.equal(r.status === 'rejected' && r.reason, 'addDisabled');
    assert.equal(m.engine.getSnapshot().rows.count, 5);
    assert.equal(m.api.getEditSnapshot()?.addedRows.length ?? 0, 0);
    assert.deepEqual(events, [], 'no before- or after-event for a disabled add');
    unmount();
  });

  it('edit: false refuses F2, the toolbar Edit and startEdit without onBeforeEditStart', async () => {
    const events: string[] = [];
    const m = make({ editing: { mode: 'row', edit: false }, onBeforeEditStart: (e) => events.push(`${e.type}:${e.isNew}`), onEditStart: () => events.push('editStart') });
    const unmount = await mounted(m);
    m.engine.dispatch({ type: 'focus.set', target: { kind: 'cell', rowId: 'p1', columnId: 'name' } });
    assert.equal(m.interaction.handleKey(keyFor(m, 'edit.begin'), 'body'), false);
    assert.equal(m.api.runCommand('edit.begin', { rowId: 'p1' }), false);
    const r = m.api.startEdit('p1');
    assert.equal(r.status === 'rejected' && r.reason, 'editDisabled');
    assert.deepEqual(events, []);
    assert.notEqual(m.api.addRow({ id: 'n1' }).status, 'rejected', 'adding still opens the new row');
    assert.equal(m.api.getEditSnapshot()?.addedRows.length, 1);
    unmount();
  });
});

describe('edit lifecycle events', () => {
  it('onBeforeCellValueChange / onCellValueChange payloads; preventDefault keeps the old value', async () => {
    const log: DataGridCellValueChangeEvent[] = [];
    let cancel = false;
    const m = make({
      editing: { mode: 'cell' },
      onBeforeCellValueChange: (e) => {
        log.push(e);
        if (cancel) e.preventDefault();
      },
      onCellValueChange: (e) => log.push(e),
    });
    const unmount = await mounted(m);
    assert.equal(m.api.startEdit('p1', 'age').status, 'applied');
    m.editing.setValue('p1', 'age', '42');
    assert.deepEqual(log.map((e) => e.type), ['beforeCellValueChange', 'cellValueChange']);
    assert.deepEqual({ rowId: log[0]?.rowId, field: log[0]?.field, value: log[0]?.value, previousValue: log[0]?.previousValue }, { rowId: 'p1', field: 'age', value: '42', previousValue: 21 });
    assert.deepEqual({ rowId: log[1]?.rowId, field: log[1]?.field, value: log[1]?.value, previousValue: log[1]?.previousValue }, { rowId: 'p1', field: 'age', value: 42, previousValue: 21 }, 'parsed draft value after');
    assert.ok(Object.isFrozen(log[0]));
    cancel = true;
    m.editing.setValue('p1', 'age', '50');
    assert.equal(log.length, 3, 'no after-event for a cancelled change');
    assert.equal(log[2]?.type, 'beforeCellValueChange');
    assert.equal(m.editing.facade()?.getValue('p1', 'age'), 42, 'the draft keeps the previous value');
    unmount();
  });

  it('onBeforeAdd / onAdd payloads; preventDefault adds nothing', async () => {
    const log: DataGridAddEvent<Person>[] = [];
    let cancel = true;
    const m = make({
      editing: { mode: 'row', newRowPosition: 'bottom' },
      onBeforeAdd: (e) => {
        log.push(e);
        if (cancel) e.preventDefault();
      },
      onAdd: (e) => log.push(e),
    });
    const unmount = await mounted(m);
    const r = m.api.addRow({ name: 'New' });
    assert.equal(r.status, 'rejected');
    assert.equal(log.length, 1);
    assert.equal(m.api.getEditSnapshot()?.addedRows.length ?? 0, 0, 'cancelled: no added row');
    cancel = false;
    m.api.addRow({ id: 'n1', name: 'New' });
    assert.deepEqual(log.map((e) => e.type), ['beforeAdd', 'beforeAdd', 'add']);
    const [, beforeAdd, add] = log as [DataGridAddEvent<Person>, DataGridAddEvent<Person>, DataGridAddEvent<Person>];
    assert.deepEqual({ row: beforeAdd.row, position: beforeAdd.position, rowId: beforeAdd.rowId, isNew: beforeAdd.isNew }, { row: { id: 'n1', name: 'New' }, position: 'bottom', rowId: null, isNew: true });
    assert.equal(add.position, 'bottom');
    assert.equal(add.isNew, true);
    const added = m.api.getEditSnapshot()?.addedRows ?? [];
    assert.equal(added.length, 1);
    assert.equal(add.rowId, added[0], 'the after-event carries the temporary id');
    m.api.addRow(undefined, 0);
    assert.equal(log.at(-2)?.position, 'top', 'index 0 proposes the top');
    unmount();
  });

  it('onBeforeDelete / onDelete payloads; preventDefault keeps the rows', async () => {
    const log: DataGridDeleteEvent<Person>[] = [];
    let cancel = true;
    const m = make({
      editing: { mode: 'batch' },
      onBeforeDelete: (e) => {
        log.push(e);
        if (cancel) e.preventDefault();
      },
      onDelete: (e) => log.push(e),
    });
    const unmount = await mounted(m);
    assert.equal(m.api.deleteRows(['p1', 'p2']).status, 'rejected');
    assert.equal(m.api.getPendingChanges().deletedRecords.length, 0, 'cancelled: nothing marked');
    const first = log[0] as DataGridDeleteEvent<Person>;
    assert.equal(first.type, 'beforeDelete');
    assert.deepEqual(first.rowIds, ['p1', 'p2']);
    assert.equal(first.mode, 'batch');
    assert.deepEqual(first.rows().map((r) => r.name), ['Person 1', 'Person 2']);
    cancel = false;
    m.api.deleteRows('p3');
    assert.deepEqual(log.map((e) => e.type), ['beforeDelete', 'beforeDelete', 'delete']);
    const after = log[2] as DataGridDeleteEvent<Person>;
    assert.deepEqual(after.rowIds, ['p3']);
    assert.deepEqual(after.rows().map((r) => r.id), ['p3']);
    assert.equal(after.mode, 'batch');
    assert.equal(m.api.getPendingChanges().deletedRecords.length, 1);
    unmount();
  });

  it('onBeforeEditCancel / onEditCancel payloads (editor and batch scope); preventDefault keeps editing', async () => {
    const log: DataGridEditCancelEvent[] = [];
    let cancel = true;
    const m = make({
      editing: { mode: 'batch' },
      onBeforeEditCancel: (e) => {
        log.push(e);
        if (cancel) e.preventDefault();
      },
      onEditCancel: (e) => log.push(e),
    });
    const unmount = await mounted(m);
    m.api.startEdit('p1', 'name');
    m.editing.setValue('p1', 'name', 'Draft');
    assert.equal(m.api.cancelEdit().status, 'rejected');
    assert.deepEqual({ type: log[0]?.type, rowId: log[0]?.rowId, field: log[0]?.field, scope: log[0]?.scope }, { type: 'beforeEditCancel', rowId: 'p1', field: 'name', scope: 'editor' });
    assert.equal(m.api.getEditSnapshot()?.activeRowId, 'p1', 'cancelled: the editor stays open');
    cancel = false;
    m.api.cancelEdit();
    assert.deepEqual(log.slice(1).map((e) => [e.type, e.rowId, e.field, e.scope]), [
      ['beforeEditCancel', 'p1', 'name', 'editor'],
      ['editCancel', 'p1', 'name', 'editor'],
    ]);
    assert.equal(m.api.getEditSnapshot()?.activeRowId ?? null, null);
    // Batch scope: no editor open, every pending change.
    m.api.updateCell('p2', 'name', 'Pending');
    assert.equal(m.api.hasUnsavedChanges(), true);
    cancel = true;
    m.api.cancelEdit();
    assert.deepEqual([log.at(-1)?.type, log.at(-1)?.rowId, log.at(-1)?.scope], ['beforeEditCancel', null, 'batch']);
    assert.equal(m.api.hasUnsavedChanges(), true, 'cancelled: the batch is kept');
    cancel = false;
    m.api.cancelEdit();
    assert.deepEqual([log.at(-1)?.type, log.at(-1)?.scope], ['editCancel', 'batch']);
    assert.equal(m.api.hasUnsavedChanges(), false);
    unmount();
  });

  it('onBeforeSave preventDefault cancels the write', async () => {
    const log: string[] = [];
    const m = make({
      editing: { mode: 'row' },
      onBeforeSave: (e: DataGridSaveEvent<Person>) => {
        log.push(`${e.type}:${e.status}:${e.changed.map((c) => `${c.rowId}.${c.fields.join('+')}`).join()}`);
        e.preventDefault();
      },
      onSave: () => log.push('save'),
    });
    const unmount = await mounted(m);
    m.api.startEdit('p1');
    m.editing.setValue('p1', 'name', 'Renamed');
    assert.equal(m.api.save().status, 'rejected');
    await m.api.whenEditSettled();
    assert.deepEqual(log, ['beforeSave:pending:p1.name']);
    assert.equal(m.engine.getRow('p1')?.name, 'Person 1', 'nothing written');
    assert.equal(m.api.getEditSnapshot()?.activeRowId, 'p1', 'the row stays in edit');
    unmount();
  });
});

describe('localized validation messages', () => {
  const columns: readonly DataGridColumn<Person>[] = [
    { field: 'id', header: 'ID', primaryKey: true },
    { field: 'name', header: 'Name', validation: { required: true, maxLength: 4 } },
    { field: 'age', header: 'Age', type: 'number', validation: { max: 99, messages: { max: 'Age at most {0}' } } },
    { field: 'joined', header: 'Joined', type: 'date', validation: { minLength: [3, 'Per-rule wins'] } as never },
  ];
  const localeText = { validationRequired: 'Pflichtfeld', validationMaxLength: 'Höchstens {0} Zeichen', validationMax: 'Höchstens {0}' };

  it('localeText validation* keys and column validation.messages reach the editor messages', async () => {
    const m = make({ columns, localeText, editing: { mode: 'row' } });
    const unmount = await mounted(m);
    m.api.startEdit('p1');
    m.editing.setValue('p1', 'name', '');
    assert.deepEqual(m.editing.errors('p1', 'name'), ['Pflichtfeld']);
    m.editing.setValue('p1', 'name', 'Too long');
    assert.deepEqual(m.editing.errors('p1', 'name'), ['Höchstens 4 Zeichen'], '{0} is the rule argument');
    m.editing.setValue('p1', 'age', '120');
    assert.deepEqual(m.editing.errors('p1', 'age'), ['Age at most 99'], 'validation.messages beats localeText');
    assert.equal(m.api.save().status, 'rejected', 'invalid rows do not save');
    const snapshot = m.api.getEditSnapshot();
    assert.ok(JSON.stringify(snapshot?.cellErrors).includes('Höchstens 4 Zeichen'));
    // A new localeText swaps the messages at runtime.
    m.syncProps({ ...m.props, localeText: { validationMaxLength: 'Max {0}' } } as never);
    m.editing.setValue('p1', 'name', 'Still too long');
    assert.deepEqual(m.editing.errors('p1', 'name'), ['Max 4']);
    m.editing.setValue('p1', 'name', '');
    assert.deepEqual(m.editing.errors('p1', 'name'), ['This field is required.'], 'keys left out fall back to English');
    unmount();
  });

  it('SSR: the server builds the localized messages; the markup carries no validation state', () => {
    // The instance a server render builds (no mount): the edit module messages come from its text.
    const server = make({ columns, localeText, editing: { mode: 'row' } });
    const messages = messagesOf(server.editing.text);
    const plain = render({ rows: 5, columns, editing: { mode: 'row' } });
    const localized = render({ rows: 5, columns, editing: { mode: 'row' }, localeText });
    assert.equal(localized, plain, 'messages are not serialized: the localized markup matches the default one');
    assert.equal(count(localized, /aria-invalid|data-invalid|salmon-data-grid-row-errors|Pflichtfeld|Höchstens/), 0);
    assert.equal(render({ rows: 5, columns, editing: { mode: 'row' }, localeText }), localized, 'deterministic');
    assert.equal(messages['required'], 'Pflichtfeld', 'the server-side instance resolves the localized messages');
    assert.equal(messages['maxLength'], 'Höchstens {0} Zeichen');
    assert.equal(messages['max'], 'Höchstens {0}');
    assert.match(messages['min'] ?? 'Please enter a value greater than or equal to {0}.', /greater than or equal/, 'keys left out keep the English default');
  });
});

describe('onReady and unmount teardown', () => {
  it('onReady fires once per mount with the DataGridApi; editing methods work inside it', async () => {
    const calls: DataGridApi<Person>[] = [];
    let started: string | null = null;
    const m = make({
      editing: { mode: 'row' },
      onReady: (api) => {
        calls.push(api as DataGridApi<Person>);
        started = api.startEdit('p1').status;
      },
    });
    const unmount = await mounted(m);
    assert.equal(calls.length, 1);
    assert.equal(calls[0], m.api);
    assert.equal(started, 'applied', 'after the editing chunk: startEdit applies synchronously');
    m.syncProps({ ...m.props, 'aria-label': 'Renamed' } as never);
    assert.equal(calls.length, 1, 'a prop update does not fire it again');
    unmount();
    const again = m.mount();
    assert.equal(calls.length, 2, 'a remount (StrictMode) fires it again');
    again();
    const plain = make({ onReady: (api) => calls.push(api as DataGridApi<Person>) });
    assert.equal(calls.length, 2, 'not before mount (not during render)');
    const off = plain.mount();
    assert.equal(calls.length, 3, 'without editing: synchronously in mount');
    off();
  });

  it('unmount unsubscribes the data source and aborts the in-flight read; remount re-issues it', async () => {
    const signals: AbortSignal[] = [];
    let subscribed = 0;
    const source: DataSource<Person> = {
      mode: 'remote',
      read: (request: DataSourceRequest) => {
        signals.push(request.signal as AbortSignal);
        return new Promise(() => {});
      },
      subscribe: () => {
        subscribed++;
        return () => {
          subscribed--;
        };
      },
    };
    const m = make({ data: source });
    assert.equal(signals.length, 0, 'no read before mount');
    assert.equal(subscribed, 0);
    const unmount = m.mount();
    await Promise.resolve();
    assert.equal(subscribed, 1);
    assert.equal(signals.length, 1);
    assert.equal(signals[0]?.aborted, false);
    unmount();
    assert.equal(subscribed, 0, 'source disconnected');
    assert.equal(signals[0]?.aborted, true, 'in-flight read aborted');
    const again = m.mount();
    await Promise.resolve();
    assert.equal(subscribed, 1);
    assert.equal(signals.length, 2, 'the aborted read is re-issued on remount');
    again();
    assert.equal(signals[1]?.aborted, true);
  });
});

describe('lazy group toggle events', () => {
  interface Sale {
    readonly id: string;
    readonly team: string;
    readonly qty: number;
  }
  const sales: Sale[] = Array.from({ length: 12 }, (_, i) => ({ id: `s${i}`, team: ['a', 'b', 'c'][i % 3] as string, qty: i }));

  function lazySource() {
    const requests: DataSourceRequest[] = [];
    const source: DataSource<Sale> = {
      mode: 'remote',
      capabilities: { lazyGroups: true },
      read(request: DataSourceRequest): Promise<DataSourceResult<Sale>> {
        requests.push(request);
        const path = request.groupPath ?? [];
        if (path.length === 0) {
          const envelopes: GroupedRowEnvelope<Sale>[] = ['a', 'b', 'c'].map((key) => ({ kind: 'group', key, columnId: 'team', groupPath: [{ columnId: 'team', key }], count: sales.filter((s) => s.team === key).length, aggregates: {} }));
          return Promise.resolve({ version: request.version, rows: envelopes as unknown as Sale[], totalRowCount: 3, performed: ['search', 'filter', 'sort', 'group', 'aggregate'] });
        }
        const match = sales.filter((s) => s.team === path[0]?.key);
        return Promise.resolve({ version: request.version, rows: match, totalRowCount: match.length });
      },
    };
    return { source, requests };
  }
  const flush = async () => {
    for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0));
  };

  it('payload lazy: true, path, key, rows(); preventDefault cancels the expand and its load', async () => {
    const { source, requests } = lazySource();
    const log: DataGridGroupToggleEvent<Sale>[] = [];
    let cancel = true;
    const m = make<Sale>({
      data: source,
      columns: [{ field: 'id', primaryKey: true }, { field: 'team' }, { field: 'qty', type: 'number' }],
      grouping: { groupBy: ['team'], lazy: true },
      onBeforeGroupToggle: (e: DataGridGroupToggleEvent<Sale>) => {
        log.push(e);
        if (cancel) e.preventDefault();
      },
      onGroupToggle: (e: DataGridGroupToggleEvent<Sale>) => log.push(e),
    } as never);
    m.layout.setViewportSize(800, 600);
    const unmount = m.mount();
    await flush();
    const captions = visibleIds(m);
    assert.equal(captions.length, 3, 'captions first, collapsed');
    const a = captions[0] as string;
    const reads = requests.length;
    const r = m.engine.dispatch({ type: 'grouping.toggle', group: a });
    assert.equal(r.status, 'rejected', 'cancelled by onBeforeGroupToggle');
    await flush();
    assert.equal(requests.length, reads, 'a cancelled expand loads nothing');
    assert.deepEqual(visibleIds(m), captions);
    const first = log[0] as DataGridGroupToggleEvent<Sale>;
    assert.deepEqual(
      { type: first.type, groupId: first.groupId, lazy: first.lazy, expanded: first.expanded, key: first.key, path: first.path },
      { type: 'beforeGroupToggle', groupId: a, lazy: true, expanded: true, key: 'a', path: [{ columnId: 'team', key: 'a' }] },
    );
    assert.deepEqual(first.rows(), [], 'children not loaded yet');
    cancel = false;
    m.engine.dispatch({ type: 'grouping.toggle', group: a });
    await flush();
    assert.ok(requests.length > reads, 'the expand loads the children');
    assert.ok(requests.slice(reads).every((q) => q.groupPath?.[0]?.key === 'a'));
    assert.equal(visibleIds(m).length, 3 + 4);
    assert.deepEqual(log.slice(1).map((e) => [e.type, e.expanded, e.lazy, e.key]), [
      ['beforeGroupToggle', true, true, 'a'],
      ['groupToggle', true, true, 'a'],
    ]);
    const after = log[2] as DataGridGroupToggleEvent<Sale>;
    assert.deepEqual(after.path, [{ columnId: 'team', key: 'a' }]);
    assert.deepEqual(after.rows().map((s) => s.id), ['s0', 's3', 's6', 's9'], 'rows() reads the loaded children');
    // Collapse: the before-event proposes expanded: false.
    m.engine.dispatch({ type: 'grouping.toggle', group: a });
    assert.deepEqual(log.slice(3).map((e) => [e.type, e.expanded, e.lazy]), [
      ['beforeGroupToggle', false, true],
      ['groupToggle', false, true],
    ]);
    unmount();
  });
});

describe('DOM lookups before a DOM exists', () => {
  it('getRowElement and getCellElement are null without rendered rows; getRowInfo(rowId) still resolves', () => {
    const m = make();
    assert.equal(m.api.getRowElement('p1'), null);
    assert.equal(m.api.getCellElement('p1', 'name'), null);
    const info = m.api.getRowInfo('p1');
    assert.equal(info?.rowId, 'p1');
    assert.equal(info?.row?.name, 'Person 1');
    assert.equal(info?.rowIndex, 1);
    assert.equal(info?.element, null);
    assert.equal(info?.cellElement, null);
    assert.equal(m.api.getRowInfo('missing'), undefined);
    assert.equal(m.api.getRowInfo(null), undefined);
  });
});
