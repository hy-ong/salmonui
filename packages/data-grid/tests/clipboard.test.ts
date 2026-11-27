import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createFocusModule, createDataGridEngine, createSelectionModule, type DataGridModule } from '@salmonui/data-grid/engine';
import { createClipboardModule } from '@salmonui/data-grid/engine/clipboard';
import { createEditModule } from '@salmonui/data-grid/engine/edit';
import type { DataGridBeforeCopyEvent, DataGridBeforeFillEvent, DataGridBeforePasteEvent, DataGridColumn, DataGridProps } from '@salmonui/data-grid';
import { count, render, type Person } from './fixtures.ts';

// Clipboard and fill handle in the React layer:
// the before-events of the lazy clipboard controller against a real engine,
// the axis constraint of the fill handle drag, and the server markup (no
// handle, `copy` toolbar item). The browser side (system clipboard, the
// fallbacks of, the drag) is tests/browser/clipboard.spec.ts.

type Row = { id: string; name: string; qty: number };
type Ui = typeof import('../src/data-grid/editing/clipboard-ui.ts');
type Fill = typeof import('../src/data-grid/editing/fill-handle.ts');

const ui = (await import(new URL('../dist/data-grid/editing/clipboard-ui.js', import.meta.url).href)) as Ui;
const fill = (await import(new URL('../dist/data-grid/editing/fill-handle.js', import.meta.url).href)) as Fill;

const rows: Row[] = Array.from({ length: 10_000 }, (_, i) => ({ id: `r${i}`, name: `n${i}`, qty: i }));

function setup(mode: 'cell' | 'batch', props: Partial<DataGridProps<Row>> = {}) {
  const engine = createDataGridEngine<Row, readonly DataGridModule<Row, any, any, string>[]>({
    getRowId: (r) => r.id,
    columns: [
      { field: 'id', primaryKey: true, editable: false },
      { field: 'name' },
      { field: 'qty', type: 'number' },
    ],
    dataSource: rows.map((r) => ({ ...r })),
    dev: false,
    modules: [createSelectionModule<Row>(), createFocusModule<Row>(), createEditModule<Row>(), createClipboardModule<Row>()],
    edit: { mode, enabled: true, edit: true },
    selection: { mode: 'cell', type: 'multiple' },
  });
  const sources: string[] = [];
  // The controller reads these members of the instance only.
  const instance = {
    engine,
    props,
    root: null,
    gridId: 'g',
    dispatchFrom: (source: string, command: Parameters<typeof engine.dispatch>[0]) => {
      sources.push(source);
      return engine.dispatch(command);
    },
  };
  const controller = new ui.DataGridClipboardController<Row>(instance as never);
  const value = (rowId: string, field: keyof Row) => (engine as unknown as { edit: { getValue(r: string, c: string): unknown } }).edit.getValue(rowId, field);
  return { engine, controller, sources, value };
}

describe('onBeforeCopy', () => {
  it('carries the TSV text and the copied cells; assigning data replaces the text', () => {
    const events: DataGridBeforeCopyEvent[] = [];
    const { engine, controller } = setup('batch', {
      onBeforeCopy: (e) => {
        events.push(e);
        e.data = e.data.toUpperCase();
      },
    });
    engine.dispatch({ type: 'selection.setCellRange', anchor: { rowId: 'r1', columnId: 'name' }, focus: { rowId: 'r2', columnId: 'qty' } });
    assert.equal(controller.copyText(false, 'keyboard'), 'N1\t1\nN2\t2');
    const e = events[0] as DataGridBeforeCopyEvent;
    assert.equal(e.type, 'beforeCopy');
    assert.equal(e.source, 'keyboard');
    assert.equal(e.copied, 'range');
    assert.equal(e.cells, 4);
    assert.deepEqual(e.rowIds, ['r1', 'r2']);
    assert.deepEqual(e.fields, ['name', 'qty']);
    assert.equal(e.includeHeaders, false);
  });

  it('includeHeaders prepends the header line; preventDefault() cancels', () => {
    let cancel = false;
    const { engine, controller } = setup('batch', {
      onBeforeCopy: (e) => {
        if (cancel) e.preventDefault();
      },
    });
    engine.dispatch({ type: 'selection.setCellRange', anchor: { rowId: 'r0', columnId: 'name' }, focus: { rowId: 'r0', columnId: 'qty' } });
    const text = controller.copyText(true, 'api') as string;
    assert.equal(text.split('\n').length, 2);
    cancel = true;
    assert.deepEqual(controller.copyText(false, 'api'), { status: 'rejected', reason: 'cancelled' });
  });

  it('copyFormatted: false copies raw values (api.copy({ copyFormatted }))', () => {
    const { engine, controller } = setup('batch');
    engine.setColumns([
      { field: 'id', primaryKey: true, editable: false },
      { field: 'name' },
      { field: 'qty', type: 'number', format: 'N0' },
    ]);
    engine.dispatch({ type: 'selection.setCellRange', anchor: { rowId: 'r1234', columnId: 'name' }, focus: { rowId: 'r1234', columnId: 'qty' } });
    assert.equal(controller.copyText(false, 'api'), 'n1234\t1,234');
    assert.equal(controller.copyText(false, 'api', false), 'n1234\t1234');
    assert.equal(controller.copyText(false, 'api', true), 'n1234\t1,234');
  });

  it('copies draft values and rejects an empty selection', () => {
    const { engine, controller } = setup('batch');
    assert.deepEqual(controller.copyText(false, 'api'), { status: 'rejected', reason: 'nothingToCopy' });
    engine.dispatch({ type: 'edit.setValues', cells: [{ rowId: 'r3', columnId: 'name', value: 'draft' }], commit: false });
    engine.dispatch({ type: 'selection.setCellRange', anchor: { rowId: 'r3', columnId: 'name' }, focus: { rowId: 'r3', columnId: 'name' } });
    assert.equal(controller.copyText(false, 'api'), 'draft');
  });
});

describe('onBeforePaste', () => {
  it('carries the text and the top-left target; assigning data changes what is pasted', () => {
    const events: DataGridBeforePasteEvent[] = [];
    const { engine, controller, sources, value } = setup('cell', {
      onBeforePaste: (e) => {
        events.push(e);
        e.data = e.data.replaceAll('x', 'y');
      },
    });
    // The range is selected bottom-up: the target is still its top-left cell.
    engine.dispatch({ type: 'selection.setCellRange', anchor: { rowId: 'r6', columnId: 'name' }, focus: { rowId: 'r5', columnId: 'name' } });
    assert.equal(controller.paste('x1\nx2', 'keyboard').status, 'applied');
    assert.deepEqual(events[0]?.target, { rowId: 'r5', field: 'name' });
    assert.equal(events[0]?.type, 'beforePaste');
    assert.equal(value('r5', 'name'), 'y1');
    assert.equal(value('r6', 'name'), 'y2');
    assert.deepEqual(sources, ['keyboard']);
  });

  it('preventDefault() cancels; without a target the event reports null', () => {
    let target: unknown;
    const { engine, controller, value } = setup('cell', {
      onBeforePaste: (e) => {
        target = e.target;
        e.preventDefault();
      },
    });
    assert.equal(controller.pasteTarget(), null);
    engine.dispatch({ type: 'focus.set', target: { kind: 'cell', rowId: 'r1', columnId: 'name' } });
    assert.deepEqual(controller.paste('changed', 'api'), { status: 'rejected', reason: 'cancelled' });
    assert.deepEqual(target, { rowId: 'r1', field: 'name' });
    assert.equal(value('r1', 'name'), 'n1');
  });
});

describe('fill', () => {
  it('onBeforeFill reports the range and target; preventDefault() cancels', () => {
    const events: DataGridBeforeFillEvent[] = [];
    let cancel = true;
    const { engine, controller, value } = setup('cell', {
      onBeforeFill: (e) => {
        events.push(e);
        if (cancel) e.preventDefault();
      },
    });
    engine.dispatch({ type: 'selection.setCellRange', anchor: { rowId: 'r0', columnId: 'name' }, focus: { rowId: 'r1', columnId: 'qty' } });
    assert.deepEqual(controller.fill({ rowId: 'r5', field: 'qty' }, 'pointer'), { status: 'rejected', reason: 'cancelled' });
    assert.deepEqual(events[0]?.range, { anchor: { rowId: 'r0', field: 'name' }, focus: { rowId: 'r1', field: 'qty' } });
    assert.deepEqual(events[0]?.target, { rowId: 'r5', field: 'qty' });
    assert.equal(value('r5', 'name'), 'n5');
    cancel = false;
    // Rows far outside any rendered window fill by id.
    assert.equal(controller.fill({ rowId: 'r9001', field: 'qty' }, 'pointer').status, 'applied');
    assert.equal(value('r9000', 'name'), 'n0');
    assert.equal(value('r9001', 'qty'), 1);
    assert.equal(value('r5', 'qty'), 1);
  });

  it('constrainFill keeps one axis like a spreadsheet autofill', () => {
    const rect = { r0: 10, r1: 12, c0: 2, c1: 3 };
    assert.equal(fill.constrainFill(rect, 11, 3), null);
    assert.deepEqual(fill.constrainFill(rect, 20, 5), { r: 20, c: 3, direction: 'down' });
    assert.deepEqual(fill.constrainFill(rect, 4, 3), { r: 4, c: 3, direction: 'up' });
    assert.deepEqual(fill.constrainFill(rect, 13, 9), { r: 12, c: 9, direction: 'right' });
    assert.deepEqual(fill.constrainFill(rect, 11, 0), { r: 12, c: 0, direction: 'left' });
    // Ties go to rows.
    assert.deepEqual(fill.constrainFill(rect, 14, 5), { r: 14, c: 3, direction: 'down' });
    assert.deepEqual(fill.fillUnion(rect, { r: 20, c: 3 }), { r0: 10, r1: 20, c0: 2, c1: 3 });
    assert.deepEqual(fill.fillUnion(rect, { r: 12, c: 0 }), { r0: 10, r1: 12, c0: 0, c1: 3 });
  });
});

describe('server markup', () => {
  const columns: DataGridColumn<Person>[] = [
    { field: 'id', header: 'ID', width: 80 },
    { field: 'name', header: 'Name', width: 160 },
  ];

  it('the fill handle never renders on the server (it needs the editing chunk)', () => {
    const html = render({ rows: 5, columns, editing: { mode: 'batch', fillHandle: true }, selection: { mode: 'cell', multiple: true, cellRange: 'box' } });
    assert.equal(count(html, /salmon-data-grid-fill-handle|data-fill-corner/), 0);
  });

  it('the copy toolbar item is enabled with editing and disabled without', () => {
    const on = render({ rows: 5, columns, editing: true, toolbar: ['copy'] });
    const off = render({ rows: 5, columns, toolbar: ['copy'] });
    const button = (html: string) => html.match(/<button[^>]*data-toolbar-item="copy"[^>]*>/)?.[0] ?? '';
    assert.match(button(on), /data-builtin="copy"/);
    assert.doesNotMatch(button(on), /aria-disabled/);
    assert.match(button(off), /aria-disabled="true"/);
    assert.match(on, />Copy</);
  });
});

