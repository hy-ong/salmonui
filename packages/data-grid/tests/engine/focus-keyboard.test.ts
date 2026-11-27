import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  createFocusModule,
  createDataGridEngine,
  createKeymap,
  createSortModule,
  DEFAULT_KEY_BINDINGS,
  keyComboFromEvent,
  normalizeKeyCombo,
  type ColumnDef,
  type FocusState,
  type FocusTarget,
  type KeyEventLike,
} from '@salmonui/data-grid/engine';

interface Item {
  readonly id: string;
  readonly a: number;
  readonly b: string;
  readonly c: string;
}

const columns: ColumnDef<Item>[] = [{ field: 'id', primaryKey: true }, { field: 'a', type: 'number' }, { field: 'b' }, { field: 'c', hidden: true }];
const rows: Item[] = Array.from({ length: 50 }, (_, i) => ({ id: `r${i}`, a: 50 - i, b: `b${i}`, c: 'c' }));

function make(direction: 'ltr' | 'rtl' = 'ltr') {
  const modules = [createSortModule<Item>(), createFocusModule<Item>()] as const;
  const engine = createDataGridEngine<Item, typeof modules>({ getRowId: (r) => r.id, columns, dataSource: rows, modules, direction, focus: { pageSize: 10 } });
  const target = () => (engine.getModuleState<FocusState>('focus') as FocusState).target;
  const move = (direction: string, pageSize?: number) => engine.dispatch(pageSize === undefined ? { type: 'focus.move', direction } : { type: 'focus.move', direction, pageSize });
  return { engine, target, move };
}

const cell = (rowId: string, columnId: string): FocusTarget => ({ kind: 'cell', rowId, columnId });

describe('focus module', () => {
  it('starts at the first body cell and moves in visible order', () => {
    const { engine, target, move } = make();
    assert.equal(target(), null);
    move('down');
    assert.deepEqual(target(), cell('r1', 'id'));
    move('right');
    move('right');
    move('right');
    assert.deepEqual(target(), cell('r1', 'b'), 'hidden column c is skipped; clamped at the last column');
    move('home');
    assert.deepEqual(target(), cell('r1', 'id'));
    move('end');
    move('pageDown');
    assert.deepEqual(target(), cell('r11', 'b'));
    move('pageDown', 100);
    assert.deepEqual(target(), cell('r49', 'b'));
    move('firstCell');
    assert.deepEqual(target(), cell('r0', 'id'));
    move('lastCell');
    assert.deepEqual(target(), cell('r49', 'b'));
    // Virtual order: after sorting by a ascending r49 is first.
    engine.dispatch({ type: 'sort.set', sorting: [{ columnId: 'a', direction: 'asc' }] });
    move('down');
    assert.deepEqual(target(), cell('r48', 'b'));
  });

  it('enters and leaves the header', () => {
    const { target, move, engine } = make();
    engine.dispatch({ type: 'focus.set', target: cell('r0', 'a') });
    move('up');
    assert.deepEqual(target(), { kind: 'header', columnId: 'a', level: 0 });
    move('left');
    assert.deepEqual(target(), { kind: 'header', columnId: 'id', level: 0 });
    move('down');
    assert.deepEqual(target(), cell('r0', 'id'));
    move('nextRegion');
    assert.equal(target()?.kind, 'header');
    move('nextRegion');
    assert.deepEqual(target(), cell('r0', 'id'), 'F6 returns to the last body cell');
  });

  it('flips left and right in RTL', () => {
    const { target, move, engine } = make('rtl');
    engine.dispatch({ type: 'focus.set', target: cell('r0', 'a') });
    move('left');
    assert.deepEqual(target(), cell('r0', 'b'), 'visual left is the next logical column in RTL');
    move('right');
    move('right');
    assert.deepEqual(target(), cell('r0', 'id'));
    engine.dispatch({ type: 'focus.setDirection', direction: 'ltr' });
    move('right');
    assert.deepEqual(target(), cell('r0', 'a'));
  });

  it('notifies only the old and the new cell', () => {
    const { engine, move } = make();
    engine.dispatch({ type: 'focus.set', target: cell('r0', 'id') });
    const hits: string[] = [];
    const offs: (() => void)[] = [];
    for (let r = 0; r < 5; r++) for (const c of ['id', 'a', 'b']) offs.push(engine.subscribeCell(`r${r}`, c, () => hits.push(`r${r}:${c}`)));
    let rowsHit = 0;
    for (let r = 0; r < 5; r++) offs.push(engine.subscribeRow(`r${r}`, () => rowsHit++));
    let grid = 0;
    offs.push(engine.subscribe(() => grid++));
    move('down');
    assert.deepEqual(hits.sort(), ['r0:id', 'r1:id']);
    assert.equal(rowsHit, 0);
    assert.equal(grid, 0);
    offs.forEach((f) => f());
  });

  it('rejects invalid targets and directions', () => {
    const { engine } = make();
    assert.equal(engine.dispatch({ type: 'focus.set', target: { kind: 'cell', rowId: 1 } as never }).status, 'rejected');
    assert.equal(engine.dispatch({ type: 'focus.move', direction: 'sideways' }).status, 'rejected');
  });
});

const key = (k: string, mods: Partial<KeyEventLike> = {}): KeyEventLike => ({ key: k, code: mods.code ?? '', ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, ...mods });

describe('keymap registry', () => {
  it('covers every core keyboard row and routes future features by command name', () => {
    const core = DEFAULT_KEY_BINDINGS.filter((b) => b.core);
    // 40 core rows; some rows map to more than one command (pager first/last, arrow keys).
    assert.ok(core.length >= 40, `${core.length} core bindings`);
    for (const command of ['edit.begin', 'edit.add', 'edit.delete', 'group.collapseAll', 'group.expandAll', 'header.group', 'header.openFilterMenu', 'clipboard.copy', 'grid.print', 'pager.next']) {
      assert.ok(DEFAULT_KEY_BINDINGS.some((b) => b.command === command), command);
    }
  });

  it('normalizes combos and events, Mod per platform', () => {
    assert.equal(normalizeKeyCombo('shift+ctrl+a'), 'Ctrl+Shift+A');
    assert.equal(normalizeKeyCombo('Mod+A', 'mac'), 'Meta+A');
    assert.equal(normalizeKeyCombo('Mod+A', 'other'), 'Ctrl+A');
    assert.equal(keyComboFromEvent(key(' ', { shiftKey: true })), 'Shift+Space');
    assert.equal(keyComboFromEvent(key('∆', { altKey: true, code: 'KeyJ' })), 'Alt+J', 'macOS Option letters resolve by code');
  });

  it('resolves per context and platform (Windows and macOS variants)', () => {
    const win = createKeymap({ platform: 'other' });
    const mac = createKeymap({ platform: 'mac' });
    assert.equal(win.resolve(key('ArrowDown'), 'body'), 'focus.down');
    assert.equal(win.resolve(key('ArrowDown', { shiftKey: true }), 'body'), 'selection.extendDown');
    assert.equal(win.resolve(key('Enter'), 'header'), 'header.sort');
    assert.equal(win.resolve(key('Enter'), 'body'), 'selection.enterDown');
    assert.equal(win.resolve(key('Home', { ctrlKey: true }), 'body'), 'focus.firstCell');
    assert.equal(mac.resolve(key('Home', { metaKey: true }), 'body'), 'focus.firstCell');
    assert.equal(mac.resolve(key('Home', { ctrlKey: true }), 'body'), null);
    assert.equal(win.resolve(key('a', { ctrlKey: true }), 'body'), 'selection.selectAll');
    assert.equal(mac.resolve(key('a', { metaKey: true }), 'body'), 'selection.selectAll');
    assert.equal(win.resolve(key('Insert'), 'body'), 'edit.add');
    // F6 / Shift+F6 resolve in every grid context that holds focus (region cycle).
    for (const context of ['body', 'header', 'groupCaption', 'groupChip', 'pager'] as const) {
      assert.equal(win.resolve(key('F6'), context), 'focus.nextRegion', context);
      assert.equal(mac.resolve(key('F6', { shiftKey: true }), context), 'focus.previousRegion', context);
    }
    assert.equal(mac.resolve(key('Enter', { ctrlKey: true, metaKey: true }), 'body'), 'edit.add');
    assert.equal(win.resolve(key('PageDown'), 'pager'), 'pager.next');
    assert.equal(mac.resolve(key('PageDown'), 'pager'), null);
    assert.equal(win.resolve(key(' ', { ctrlKey: true }), 'header'), 'header.group');
    assert.equal(win.resolve(key(' ', { ctrlKey: true }), 'body'), 'selection.selectColumn');
    assert.equal(win.resolve(key('j', { altKey: true, code: 'KeyJ' }), 'global'), 'grid.focusRoot');
    // Shift+F10 and the ContextMenu key in the body, header and pager contexts.
    for (const context of ['body', 'header', 'pager'] as const) {
      assert.equal(win.resolve(key('F10', { shiftKey: true }), context), 'grid.contextMenu');
      assert.equal(mac.resolve(key('ContextMenu'), context), 'grid.contextMenu');
    }
    assert.deepEqual(win.combosOf('header.moveLeft'), ['Ctrl+ArrowLeft', 'Alt+ArrowLeft']);
    assert.deepEqual(mac.combosOf('header.moveLeft'), ['Meta+ArrowLeft', 'Alt+ArrowLeft']);
  });

  it('custom bindings replace a command and win conflicts with a warning', () => {
    const warnings: string[] = [];
    const map = createKeymap({ bindings: { 'selection.selectAll': ['Mod+Shift+L'], 'focus.down': ['J'] }, warn: (code) => warnings.push(code) });
    assert.equal(map.resolve(key('a', { ctrlKey: true }), 'body'), null);
    assert.equal(map.resolve(key('L', { ctrlKey: true, shiftKey: true }), 'body'), 'selection.selectAll');
    assert.equal(map.resolve(key('j'), 'body'), 'focus.down');
    assert.equal(map.resolve(key('ArrowDown'), 'body'), null);
    const conflict = createKeymap({ bindings: { 'grid.print': ['Enter'] }, warn: (code) => warnings.push(code) });
    assert.equal(conflict.resolve(key('Enter'), 'body'), 'grid.print');
    assert.equal(conflict.resolve(key('Enter'), 'header'), 'grid.print');
    assert.ok(warnings.includes('key-binding-conflict'));
    assert.ok(!conflict.combosOf('header.sort').includes('Enter'));
  });
});
