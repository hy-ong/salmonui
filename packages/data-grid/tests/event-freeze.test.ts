// event objects handed to `DataGrid` callbacks are frozen in development
// (`gridEvent()` in events.ts; the `onKeyDown` context in interaction.ts).
// The menu events' `items` array is the documented exception: the event
// field cannot be reassigned, but the array is a separate mutable copy the
// handler edits in place. Driven without a DOM (a minimal root stand-in).
// The test runner is a development environment (NODE_ENV unset).
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { DataGridContextMenuOpenEvent, DataGridKeyDownContext, DataGridProps, DataGridSortChangeEvent, DataGridColumnPinChangeEvent } from '@salmonui/data-grid';
import { DataGridInstance } from '../dist/data-grid/instance.js';
import { people, personColumns, type Person, newInstance } from './fixtures.ts';

let seq = 0;
function make(props: Partial<DataGridProps<Person>>) {
  const instance = newInstance<Person>({ data: people(10), columns: personColumns, 'aria-label': 'People', ...props } as never, `:f${seq++}:`);
  const unmount = instance.mount();
  return { instance, unmount };
}

const key = (k: string, mods: Partial<KeyboardEvent> = {}) =>
  ({ key: k, code: '', ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, isComposing: false, ...mods }) as unknown as KeyboardEvent;

/** Minimal grid root: no theme scope, a document body for overlays. */
function stubRoot(instance: DataGridInstance<Person>): HTMLDivElement {
  const root = {
    tagName: 'DIV',
    isContentEditable: false,
    closest: () => null,
    contains: () => true,
    ownerDocument: { body: {}, activeElement: null },
  } as unknown as HTMLDivElement;
  instance.root = root;
  return root;
}

const assertFrozen = (event: object, field: string) => {
  assert.ok(Object.isFrozen(event), 'frozen in development');
  assert.throws(() => {
    (event as Record<string, unknown>)[field] = 'changed';
  }, TypeError);
};

describe('onKeyDown context is frozen in development', () => {
  it('handleKey (editor keys): frozen context with command, context, rowId, field; preventDefault still cancels', () => {
    const seen: DataGridKeyDownContext[] = [];
    let cancel = false;
    const m = make({
      onKeyDown: (ctx) => {
        seen.push(ctx);
        if (cancel) ctx.preventDefault();
      },
    });
    m.instance.api.focusCell('p2', 'name');
    m.instance.interaction.handleKey(key('ArrowDown'), 'body');
    const ctx = seen[0] as DataGridKeyDownContext;
    assert.equal(ctx.command, 'focus.down');
    assert.equal(ctx.context, 'body');
    assert.equal(ctx.rowId, 'p2');
    assert.equal(ctx.field, 'name');
    assertFrozen(ctx, 'command');
    assert.equal(typeof ctx.preventDefault, 'function');
    cancel = true;
    assert.equal(m.instance.interaction.handleKey(key('ArrowDown'), 'body'), false, 'preventDefault suppresses the bound command');
    assert.ok(Object.isFrozen(seen[1]));
    m.unmount();
  });

  it('root keydown: frozen context; preventDefault keeps the event unconsumed', () => {
    const seen: DataGridKeyDownContext[] = [];
    const m = make({
      onKeyDown: (ctx) => {
        seen.push(ctx);
        ctx.preventDefault();
      },
    });
    const root = stubRoot(m.instance);
    let consumed = false;
    m.instance.interaction.onKeyDown({
      defaultPrevented: false,
      target: root,
      nativeEvent: key('ArrowDown'),
      preventDefault: () => {
        consumed = true;
      },
      stopPropagation: () => {},
    } as never);
    assert.equal(seen.length, 1);
    assert.equal(seen[0]?.command, 'focus.down');
    assertFrozen(seen[0] as DataGridKeyDownContext, 'rowId');
    assert.equal(consumed, false);
    m.unmount();
  });
});

describe('menu events: frozen event, mutable items', () => {
  it('onBeforeContextMenuOpen: reassigning items throws, editing the array in place changes the menu', () => {
    let event: DataGridContextMenuOpenEvent | null = null;
    let reassign: unknown = null;
    const m = make({
      contextMenu: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }],
      onBeforeContextMenuOpen: (e) => {
        event = e;
        try {
          (e as { items: unknown }).items = [];
        } catch (error) {
          reassign = error;
        }
        e.items.splice(0, 1);
        (e.items as unknown as { id: string; label: string }[]).push({ id: 'c', label: 'C' });
      },
    });
    stubRoot(m.instance);
    assert.equal(m.instance.chrome.openContextMenu({ kind: 'cell', rowId: 'p1', field: 'name' }, { left: 0, top: 0, width: 0, height: 0 } as never, 'api'), true);
    assert.ok(reassign instanceof TypeError, 'items cannot be reassigned');
    assert.ok(Object.isFrozen(event));
    assert.equal(Object.isFrozen((event as unknown as DataGridContextMenuOpenEvent).items), false);
    const overlay = m.instance.chrome.getOverlay() as { kind: string; items: { id: string }[] } | null;
    assert.deepEqual(overlay?.items.map((i) => i.id), ['b', 'c']);
    m.unmount();
  });
});

describe('other React events are frozen in development', () => {
  it('onBeforeSortChange / onSortChange', () => {
    const events: DataGridSortChangeEvent[] = [];
    const m = make({ sorting: true, onBeforeSortChange: (e) => events.push(e), onSortChange: (e) => events.push(e) });
    m.instance.headerCommand('sort', 'age');
    assert.deepEqual(
      events.map((e) => e.type),
      ['beforeSortChange', 'sortChange'],
    );
    for (const e of events) assertFrozen(e, 'sortBy');
    m.unmount();
  });

  it('onBeforeColumnPinChange / onColumnPinChange', () => {
    const events: DataGridColumnPinChangeEvent[] = [];
    const m = make({ onBeforeColumnPinChange: (e) => events.push(e), onColumnPinChange: (e) => events.push(e) });
    m.instance.api.pinColumn('age', 'start');
    assert.deepEqual(
      events.map((e) => e.type),
      ['beforeColumnPinChange', 'columnPinChange'],
    );
    for (const e of events) assertFrozen(e, 'pinned');
    m.unmount();
  });
});
