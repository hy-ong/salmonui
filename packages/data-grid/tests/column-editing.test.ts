// Column editors and command columns without a DOM: the
// editor resolution (`editorTypeOf`), the open editor of a mounted grid
// rendered with react-dom/server (an `edit.start` puts the cell in edit; the
// editor element itself is client-only in <DataGrid>, so it is rendered here
// inside the grid's contexts), and the command column dispatch
// (`runCommandItem`, the handler of the command buttons) with
// `onCommandClick`.
import assert from 'node:assert/strict';
import { before, describe, it } from 'node:test';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import type { CompiledColumn } from '@salmonui/data-grid/engine';
import type { DataGridColumn, DataGridCommandClickEvent, DataGridCommandItem, DataGridProps } from '@salmonui/data-grid';
import { DataGridInstance } from '../dist/data-grid/instance.js';
import { loadEditChunk } from '../dist/data-grid/editing/edit-host.js';
import { DataGridInstanceContext, DataGridRenderContext } from '../dist/data-grid/context.js';
import { editorTypeOf, DataGridCellEditor } from '../dist/data-grid/editing/editors.js';
import { people, type Person, newInstance } from './fixtures.ts';

let seq = 0;
function make(columns: readonly DataGridColumn<Person>[], props: Partial<DataGridProps<Person>> = {}) {
  const instance = newInstance<Person>({ data: people(5), columns, 'aria-label': 'People', timeZone: 'UTC', editing: true, ...props } as never, `:ce${seq++}:`);
  const unmount = instance.mount();
  return { instance, unmount };
}

function compiled(instance: DataGridInstance<Person>, columnId: string): CompiledColumn<Person> {
  const column = instance.engine.getSnapshot().columns.byId.get(columnId);
  assert.ok(column, columnId);
  return column as CompiledColumn<Person>;
}

/** Markup of the open editor of one cell. */
function editorHtml(instance: DataGridInstance<Person>, rowId: string, columnId: string): string {
  const editor = createElement(DataGridCellEditor as never, { rowId, column: compiled(instance, columnId), placement: 'cell' });
  const render = createElement(DataGridRenderContext.Provider, { value: { text: instance.text } as never }, editor);
  return renderToString(createElement(DataGridInstanceContext.Provider, { value: instance as never }, render));
}

before(async () => {
  // The editing chunk is lazy; loaded first, the instances attach it at construction.
  await loadEditChunk();
});

describe('editor resolution', () => {
  const columns: readonly DataGridColumn<Person>[] = [
    { field: 'id', header: 'ID', primaryKey: true },
    { field: 'name', header: 'Name' },
    { field: 'age', header: 'Age', type: 'number' },
    { field: 'active', header: 'Active', type: 'boolean' },
    { field: 'joined', header: 'Joined', type: 'date' },
    { id: 'joinedAt', field: 'joined', header: 'Joined at', type: 'datetime' },
    { id: 'ageText', field: 'age', header: 'Age text', type: 'number', editor: 'text' },
    { id: 'nameSelect', field: 'name', header: 'Name select', editor: 'select', editorProps: { options: ['Person 1', 'Other'] } },
    { id: 'custom', field: 'name', header: 'Custom', editor: 'rating' },
  ];

  it('the editor follows the column type: number, boolean -> checkbox, date, datetime, else text', () => {
    const { instance, unmount } = make(columns);
    const typeOf = (id: string) => editorTypeOf(compiled(instance, id) as CompiledColumn<unknown>);
    assert.equal(typeOf('name'), 'text');
    assert.equal(typeOf('age'), 'number');
    assert.equal(typeOf('active'), 'checkbox');
    assert.equal(typeOf('joined'), 'date');
    assert.equal(typeOf('joinedAt'), 'datetime');
    unmount();
  });

  it('an explicit column.editor preset overrides the type default, custom names pass through', () => {
    const { instance, unmount } = make(columns);
    const typeOf = (id: string) => editorTypeOf(compiled(instance, id) as CompiledColumn<unknown>);
    assert.equal(typeOf('ageText'), 'text', 'number column with editor: text');
    assert.equal(typeOf('nameSelect'), 'select', 'string column with editor: select');
    assert.equal(typeOf('custom'), 'rating');
    unmount();
  });

  it("the 'datetime' editor renders the date picker with a time part; 'date' the date-only picker", () => {
    const { instance, unmount } = make(columns);
    assert.equal(instance.api.startEdit('p1').status, 'applied');
    const dt = editorHtml(instance, 'p1', 'joinedAt');
    assert.match(dt, /data-editor="datetime"/);
    assert.match(dt, /class="salmon-data-grid-date"/);
    assert.match(dt, /<input[^>]*placeholder="mm\/dd\/yyyy hh:mm"[^>]*value="01\/02\/2024 00:00"/);
    const d = editorHtml(instance, 'p1', 'joined');
    assert.match(d, /data-editor="date"/);
    assert.match(d, /<input[^>]*placeholder="mm\/dd\/yyyy"[^>]*value="01\/02\/2024"/);
    unmount();
  });

  it('the explicit preset renders its editor: editor text on a number column, editor select with editorProps.options', () => {
    const { instance, unmount } = make(columns);
    instance.api.startEdit('p1');
    const text = editorHtml(instance, 'p1', 'ageText');
    assert.match(text, /data-editor="text"/);
    assert.doesNotMatch(text, /inputmode="decimal"/, 'not the number editor');
    assert.match(text, /<input[^>]*type="text"[^>]*value="21"/);
    const select = editorHtml(instance, 'p1', 'nameSelect');
    assert.match(select, /data-editor="select"/);
    assert.match(select, /<select[^>]*>/);
    assert.match(select, /<option value="0" selected="">Person 1<\/option><option value="1">Other<\/option>/);
    const number = editorHtml(instance, 'p1', 'age');
    assert.match(number, /data-editor="number"[\s\S]*inputMode="decimal"/i, 'the number column keeps its type default');
    unmount();
  });

  it('editorProps pass through to the built-in editor (className, style, maxLength, multiline, placeholder)', () => {
    const cols: readonly DataGridColumn<Person>[] = [
      { field: 'id', header: 'ID', primaryKey: true },
      { field: 'name', header: 'Name', editorProps: { className: 'mine', style: { color: 'red' }, maxLength: 12, spellCheck: false, autoComplete: 'name' } },
      { id: 'notes', field: 'name', header: 'Notes', editorProps: { multiline: true, maxLength: 40 } },
      { id: 'pick', field: 'name', header: 'Pick', editor: 'select', editorProps: { placeholder: 'None', options: [{ value: 'x', label: 'X' }] } },
    ];
    const { instance, unmount } = make(cols);
    instance.api.startEdit('p1');
    const name = editorHtml(instance, 'p1', 'name');
    assert.match(name, /class="salmon-data-grid-input salmon-data-grid-editor__input mine"/);
    assert.match(name, /style="color:red"/);
    assert.match(name, /maxLength="12"/);
    assert.match(name, /autoComplete="name"/);
    assert.match(name, /spellCheck="false"/);
    const notes = editorHtml(instance, 'p1', 'notes');
    assert.match(notes, /<textarea[^>]*maxLength="40"[^>]*>Person 1<\/textarea>/);
    const pick = editorHtml(instance, 'p1', 'pick');
    assert.match(pick, /<option value="" selected="">None<\/option><option value="0">X<\/option>/, 'placeholder option (selected: no option matches), then the editorProps options');
    unmount();
  });
});

describe('command column dispatch', () => {
  const del: DataGridCommandItem<Person> = { type: 'delete' };
  const edit: DataGridCommandItem<Person> = { type: 'edit' };
  const columns: readonly DataGridColumn<Person>[] = [
    { id: 'commands', header: 'Commands', commands: [edit, del] },
    { field: 'id', header: 'ID', primaryKey: true },
    { field: 'name', header: 'Name' },
  ];

  it('the command column resolves its command items; data columns have none', () => {
    const { instance, unmount } = make(columns);
    assert.deepEqual(instance.editing.commandsOf(compiled(instance, 'commands')), [edit, del]);
    assert.equal(instance.editing.commandsOf(compiled(instance, 'name')), null);
    unmount();
  });

  it('the built-in Delete command deletes its row', async () => {
    const events: DataGridCommandClickEvent<Person>[] = [];
    const { instance, unmount } = make(columns, { onCommandClick: (e) => events.push(e) });
    assert.equal(instance.api.getRow('p2')?.name, 'Person 2');
    instance.editing.runCommandItem(del, 'p2', 'pointer');
    await instance.api.whenEditSettled();
    assert.equal(instance.api.getRow('p2'), undefined, 'row p2 is deleted');
    assert.equal(instance.engine.getSnapshot().rows.count, 4);
    assert.equal(events.length, 1);
    assert.equal(events[0]!.type, 'commandClick');
    assert.equal(events[0]!.source, 'pointer');
    assert.equal(events[0]!.command, del);
    assert.equal(events[0]!.rowId, 'p2');
    assert.equal(events[0]!.row?.name, 'Person 2');
    unmount();
  });

  it('with confirmDelete the Delete command deletes only after the prompt is accepted', async () => {
    const { instance, unmount } = make(columns, { editing: { confirmDelete: true } });
    instance.editing.runCommandItem(del, 'p1', 'pointer');
    const prompt = instance.editing.getPrompt();
    assert.equal(prompt?.kind, 'delete');
    assert.ok(instance.api.getRow('p1'), 'not deleted while the prompt is open');
    prompt!.resolve(true);
    await instance.api.whenEditSettled();
    assert.equal(instance.api.getRow('p1'), undefined);
    unmount();
  });

  it('onCommandClick preventDefault() cancels the built-in Delete and Edit commands', async () => {
    const { instance, unmount } = make(columns, { onCommandClick: (e) => e.preventDefault() });
    instance.editing.runCommandItem(del, 'p2', 'pointer');
    await instance.api.whenEditSettled();
    assert.equal(instance.api.getRow('p2')?.name, 'Person 2', 'the row is kept');
    assert.equal(instance.engine.getSnapshot().rows.count, 5);
    instance.editing.runCommandItem(edit, 'p2', 'pointer');
    assert.equal(instance.editing.state()?.active ?? null, null, 'no edit started');
    unmount();
  });

  it('the Edit command starts editing its row; a custom command calls onClick after onCommandClick', () => {
    const order: string[] = [];
    const custom: DataGridCommandItem<Person> = { type: 'custom', label: 'Open', onClick: ({ rowId, row }) => order.push(`click:${rowId}:${row.name}`) };
    const { instance, unmount } = make([{ id: 'commands', header: 'Commands', commands: [edit, custom] }, ...columns.slice(1)], {
      onCommandClick: (e) => order.push(`event:${e.command.type}`),
    });
    instance.editing.runCommandItem(edit, 'p3', 'keyboard');
    assert.equal(instance.editing.state()?.active?.rowId, 'p3');
    instance.editing.runCommandItem(custom, 'p4', 'pointer');
    assert.deepEqual(order, ['event:edit', 'event:custom', 'click:p4:Person 4']);
    unmount();
  });
});
