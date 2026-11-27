// Data-state UI and click events: SSR markup of the loading indicator, the instance-level
// loading flag, refresh, silent data updates without editing, save events
// after the write settles, `onError` with `action: 'save'`, dev tooling
// switches, frozen event objects, and the delegated row and cell click
// listeners (driven through a minimal body stand-in, no DOM).
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createControlledDataSource } from '@salmonui/data';
import type { DataGridCellClickEvent, DataGridColumn, DataGridErrorEvent, DataGridProps, DataGridRowClickEvent, DataGridSaveEvent } from '@salmonui/data-grid';
import { DataGridInstance } from '../dist/data-grid/instance.js';
import { count, people, personColumns, render, type Person, newInstance } from './fixtures.ts';

let seq = 0;
function make(props: Partial<DataGridProps<Person>> = {}): DataGridInstance<Person> {
  return newInstance<Person>({ data: people(5), columns: personColumns as DataGridColumn<Person>[], 'aria-label': 'People', ...props } as never, `:d${seq++}:`);
}

const pending = () =>
  createControlledDataSource<Person>({
    onQueryChange: () => new Promise(() => {}),
  });

describe('SSR: loading indicator', () => {
  it('a loading remote source renders the presentational overlay, aria-busy, and no empty row', () => {
    const html = render({ data: pending() });
    assert.match(html, /aria-busy="true"/);
    assert.equal(count(html, /class="salmon-data-grid-loading"/), 1);
    assert.match(html, /class="salmon-data-grid-loading"[^>]*data-indicator="spinner"[^>]*data-phase="initial"[^>]*aria-hidden="true"/);
    assert.equal(count(html, /salmon-data-grid-empty/), 0);
  });

  it('local data renders no indicator; skeleton bars and renderLoading replace the content', () => {
    assert.equal(count(render({}), /salmon-data-grid-loading/), 0);
    const skeleton = render({ data: pending(), loadingIndicator: 'skeleton', initialRows: 6 });
    assert.equal(count(skeleton, /class="salmon-data-grid-loading__bar"/), 6);
    const custom = render({ data: pending(), renderLoading: ({ phase }) => `custom ${phase}`, classNames: { loading: 'mine' } });
    assert.match(custom, /class="salmon-data-grid-loading mine"[^>]*>custom initial</);
  });
});

describe('setLoading, refresh, silent updates', () => {
  it('setLoading toggles the manual flag and notifies once per change', () => {
    const m = make();
    let calls = 0;
    m.dataUi.subscribe(() => calls++);
    m.api.setLoading(true);
    m.api.setLoading(true);
    assert.equal(m.dataUi.isManual(), true);
    m.api.setLoading(false);
    assert.equal(m.dataUi.isManual(), false);
    assert.equal(calls, 2);
  });

  it('refresh re-reads rows mutated in place and counts for onViewChange', () => {
    const rows = people(5) as { -readonly [K in keyof Person]: Person[K] }[];
    const m = make({ data: rows });
    const unmount = m.mount();
    assert.equal(m.engine.getCellSnapshot('p1', 'name')?.value, 'Person 1');
    (rows[1] as { name: string }).name = 'Changed';
    const before = m.dataUi.refreshCount;
    m.api.refresh();
    assert.equal(m.dataUi.refreshCount, before + 1);
    assert.equal(m.engine.getCellSnapshot('p1', 'name')?.value, 'Changed');
    unmount();
  });

  it('setCellValue and setRowData work without editing and replace only that row', () => {
    const m = make();
    const unmount = m.mount();
    assert.equal(m.api.setCellValue('p2', 'name', 'Silent').status, 'applied');
    assert.equal(m.api.getRow('p2')?.name, 'Silent');
    assert.equal(m.api.setRowData('p3', { ...(m.api.getRow('p3') as Person), age: 99 }).status, 'applied');
    assert.equal(m.api.getRow('p3')?.age, 99);
    assert.equal(m.api.setCellValue('nope', 'name', 'x').status, 'rejected');
    const remote = make({ data: pending() });
    assert.equal(remote.api.setRowData('p1', people(2)[1] as Person).status, 'rejected');
    unmount();
  });

  it('recordCommands and instrument reach the engine; off by default', () => {
    const off = make();
    assert.equal(off.engine.getInstrumentation(), null);
    off.api.sortColumn('name', 'asc');
    assert.deepEqual(off.engine.getCommandLog(), []);
    const on = make({ recordCommands: true, instrument: true, sorting: true });
    on.api.sortColumn('name', 'asc');
    assert.ok(on.engine.getInstrumentation() !== null);
    assert.ok(on.engine.getCommandLog().some((c) => c.type === 'sort.column'));
  });
});

/** Body stand-in: records listeners and resolves `closest` against fake row and cell elements. */
function stubBody() {
  const listeners = new Map<string, (event: MouseEvent) => void>();
  const row = { dataset: { rowId: 'p1' }, contains: () => true } as unknown as HTMLElement;
  const cell = { dataset: { columnId: 'name' } } as unknown as HTMLElement;
  const body = {
    addEventListener: (type: string, fn: (event: MouseEvent) => void) => listeners.set(type, fn),
    removeEventListener: (type: string) => listeners.delete(type),
    contains: () => true,
  } as unknown as HTMLElement;
  const target = { closest: (selector: string) => (selector === '[data-row-id]' ? row : cell) };
  const fire = (type: 'click' | 'dblclick') => {
    let prevented = false;
    const event = { type, button: 0, target, preventDefault: () => (prevented = true) } as unknown as MouseEvent;
    listeners.get(type)?.(event);
    return prevented;
  };
  return { body, listeners, fire };
}

describe('row and cell click events', () => {
  it('no listener without a handler; cell then row event with context, frozen in development', () => {
    const idle = make();
    const s0 = stubBody();
    const offIdle = idle.dataUi.mount(s0.body);
    assert.equal(s0.listeners.size, 0, 'nothing is attached while no click handler is bound');
    offIdle();

    const order: string[] = [];
    let cellEvent: DataGridCellClickEvent<Person> | null = null;
    let rowEvent: DataGridRowClickEvent<Person> | null = null;
    const m = make({
      onCellClick: (e) => {
        order.push(e.type);
        cellEvent = e;
      },
      onRowClick: (e) => {
        order.push(e.type);
        rowEvent = e;
      },
      onRowDoubleClick: (e) => {
        order.push(e.type);
        e.preventDefault();
      },
    });
    const s = stubBody();
    const off = m.dataUi.mount(s.body);
    assert.deepEqual([...s.listeners.keys()].sort(), ['click', 'dblclick']);
    assert.equal(s.fire('click'), false);
    assert.deepEqual(order, ['cellClick', 'rowClick']);
    const c = cellEvent as unknown as DataGridCellClickEvent<Person>;
    assert.equal(c.rowId, 'p1');
    assert.equal(c.field, 'name');
    assert.equal(c.value, 'Person 1');
    assert.equal(c.column?.id, 'name');
    assert.equal(c.source, 'pointer');
    assert.equal((rowEvent as unknown as DataGridRowClickEvent<Person>).rowIndex, 1);
    assert.ok(Object.isFrozen(c), 'event objects are frozen in development');
    assert.throws(() => {
      (c as { rowId: string }).rowId = 'x';
    }, TypeError);
    // preventDefault on the row event cancels the built-in double-click action.
    assert.equal(s.fire('dblclick'), true);
    // Unbinding every handler detaches the listeners.
    m.syncProps({ data: m.props.data, columns: personColumns, 'aria-label': 'People' } as never);
    assert.equal(s.listeners.size, 0);
    off();
  });
});

describe('save events after the write settles', () => {
  it('onBeforeSave fires before the write, onSave after it with the result; failures raise onError (save)', async () => {
    const host = (await import(new URL('../dist/data-grid/editing/edit-host.js', import.meta.url).href)) as { loadEditChunk(): Promise<unknown> };
    await host.loadEditChunk();
    const log: string[] = [];
    let fail = false;
    let saved: DataGridSaveEvent<Person> | null = null;
    const errors: DataGridErrorEvent[] = [];
    let rows = people(5);
    const source = createControlledDataSource<Person>({
      onQueryChange: (req) => ({ version: req.version, rows, totalRowCount: rows.length }),
      onDataChange: async (req) => {
        log.push('write');
        if (fail) throw new Error('offline');
        rows = rows.map((r) => req.changed.find((c) => c.rowId === r.id)?.row ?? r);
        return { version: req.version, status: 'applied' };
      },
    });
    const m = make({
      data: source,
      editing: { mode: 'row' },
      onBeforeSave: () => log.push('beforeSave'),
      onSave: (e) => {
        log.push(`save:${e.status}`);
        saved = e;
      },
      onError: (e) => errors.push(e),
    });
    const unmount = m.mount();
    await m.api.whenEditSettled();
    await Promise.resolve();
    assert.equal(m.engine.getSnapshot().data.status, 'ready');
    m.api.startEdit('p1');
    m.engine.dispatch({ type: 'edit.setValue', rowId: 'p1', columnId: 'name', value: 'Renamed' });
    m.api.save();
    assert.deepEqual(log, ['beforeSave', 'write'], 'onSave waits for the write to settle');
    await m.api.whenEditSettled();
    assert.deepEqual(log, ['beforeSave', 'write', 'save:applied']);
    const e = saved as unknown as DataGridSaveEvent<Person>;
    assert.equal(e.result?.status, 'applied');
    assert.equal(e.rows().changedRecords[0]?.name, 'Renamed');
    // Controlled source: the applied row is shown without a reload.
    assert.equal(m.engine.getCellSnapshot('p1', 'name')?.value, 'Renamed');
    assert.equal(errors.length, 0);

    fail = true;
    m.api.startEdit('p2');
    m.engine.dispatch({ type: 'edit.setValue', rowId: 'p2', columnId: 'name', value: 'Lost' });
    m.api.save();
    await m.api.whenEditSettled();
    assert.equal(log.at(-1), 'save:error');
    assert.equal(errors.length, 1);
    assert.equal(errors[0]?.action, 'save');
    assert.equal(errors[0]?.error.message, 'offline');
    assert.equal(m.engine.getCellSnapshot('p2', 'name')?.value, 'Person 2', 'the failed row keeps its old value');
    unmount();
  });
});
