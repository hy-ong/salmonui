// The client chunk of the `tree` render feature: what only a mounted grid
// uses, loaded with dynamic `import()` by the tree controller (tree-ui.tsx)
// when a tree grid mounts on the client. The key handlers:
// the keymap with the tree key commands is built synchronously by the
// controller, the handlers load here, since keys need a mounted, focused
// grid. The skeleton row under a loading parent (tree-skeleton.tsx):
// the server never loads children. The tree helpers the handlers call arrive
// as arguments, so the chunk shares no module with the feature chunk.

import type { RowId } from '@salmonui/data-grid/engine';
import type { DataGridEventSource } from '@salmonui/core/internal/events';
import type { DataGridInstance } from './instance.js';
import type { TreeFacade } from './tree-toggle.js';

/** The controller fields the handlers use (`DataGridTreeUi`). */
export { DataGridTreeSkeleton } from './tree-skeleton.js';

export interface TreeKeysHost {
  readonly instance: DataGridInstance<unknown>;
  readonly tree: TreeFacade;
  focusedRow(): RowId | null;
  move(indent: boolean, source: DataGridEventSource): boolean;
}

/** Registers the tree key handlers on the grid's interaction (once per controller). */
export function registerTreeKeys(
  host: TreeKeysHost,
  checkRow: (instance: DataGridInstance<unknown>, rowId: RowId, source: DataGridEventSource) => void,
  treeColumnId: (instance: DataGridInstance<unknown>) => string | null,
): void {
  const { instance, tree } = host;
  const interaction = instance.interaction;
  const register = (command: string, handler: (ctx: { readonly nativeEvent: KeyboardEvent }) => boolean, priority: number): void => {
    interaction.registerKeyHandler(command, handler as never, priority);
  };
  const toggleFocused = (expanded: boolean): boolean => {
    const rowId = host.focusedRow();
    if (rowId === null) return false;
    if (tree.getTreeRow(rowId)?.hasChildren) instance.dispatchFrom('keyboard', { type: expanded ? 'tree.expand' : 'tree.collapse', rowId });
    return true;
  };
  register('tree.expandFocused', () => toggleFocused(true), 10);
  register('tree.collapseFocused', () => toggleFocused(false), 10);
  // Ctrl+ArrowDown / ArrowUp: expand / collapse all (above the detail handlers).
  register('group.expandAll', () => (instance.dispatchFrom('keyboard', { type: 'tree.expandAll' }), true), 15);
  register('group.collapseAll', () => (instance.dispatchFrom('keyboard', { type: 'tree.collapseAll' }), true), 15);
  // Alt+Shift+ArrowRight / ArrowLeft (mirrored in RTL).
  register('tree.indent', () => host.move(!instance.rtl, 'keyboard'), 10);
  register('tree.outdent', () => host.move(instance.rtl, 'keyboard'), 10);
  // APG treegrid arrows on the tree cell, only when the tree column is the first visible column.
  const apg = (expandKey: boolean): boolean => {
    const t = interaction.focusTarget();
    if (t?.kind !== 'cell' || t.rowId.startsWith('__')) return false;
    const column = treeColumnId(instance);
    if (column === null || t.columnId !== column || instance.engine.getSnapshot().columns.visible[0]?.columnId !== column) return false;
    const info = tree.getTreeRow(t.rowId);
    if (!info) return false;
    if (expandKey) {
      if (!info.hasChildren || info.expanded) return false;
      instance.dispatchFrom('keyboard', { type: 'tree.expand', rowId: t.rowId });
      return true;
    }
    if (info.hasChildren && info.expanded) {
      instance.dispatchFrom('keyboard', { type: 'tree.collapse', rowId: t.rowId });
      return true;
    }
    if (info.parentId === null) return false;
    interaction.focusTargetFrom({ kind: 'cell', rowId: info.parentId, columnId: column }, 'keyboard');
    return true;
  };
  register('focus.right', () => apg(!instance.rtl), 10);
  register('focus.left', () => apg(instance.rtl), 10);
  // Enter or Space on the toggle; Space on the tree cell toggles the tree checkbox.
  const onToggle = (event: KeyboardEvent): RowId | null => {
    const el = (event.target as Element | null)?.closest?.('button.salmon-data-grid-tree-toggle');
    return el ? (el.closest<HTMLElement>('[data-row-id]')?.dataset['rowId'] ?? null) : null;
  };
  const activate = (ctx: { readonly nativeEvent: KeyboardEvent }, space: boolean): boolean => {
    const rowId = onToggle(ctx.nativeEvent);
    if (rowId !== null) {
      ctx.nativeEvent.preventDefault();
      const status = tree.getTreeRow(rowId)?.loadStatus;
      if (status !== 'loading') instance.dispatchFrom('keyboard', status === 'error' ? { type: 'tree.retry', rowId } : { type: 'tree.toggle', rowId });
      return true;
    }
    if (!space || !tree.getInfo().checkbox) return false;
    const t = interaction.focusTarget();
    if (t?.kind !== 'cell' || t.rowId.startsWith('__') || t.columnId !== treeColumnId(instance)) return false;
    checkRow(instance, t.rowId, 'keyboard');
    return true;
  };
  register('selection.enterDown', (ctx) => activate(ctx, false), 25);
  register('selection.toggle', (ctx) => activate(ctx, true), 25);
}

/** Chunking hub: keeps the static graph in one chunk. Never called. */
export { DataGrid as hub } from './DataGrid.js';
