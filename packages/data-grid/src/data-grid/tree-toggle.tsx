'use client';

// `DataGridTreeToggle`: the expand / collapse
// button of a tree row, rendered by the tree column cell of the `tree`
// render feature (tree-ui.tsx) and exported for row templates. A static
// file of its own, so `@salmonui/data-grid`
// exports it without pulling the tree feature; it reads the core `tree`
// module structurally and dispatches its commands (the feature turns them
// into `onBeforeTreeToggle` / `onTreeToggle` and live messages). It also
// holds the two tiny helpers the feature shares: the tree column and the
// tree text with English fallbacks.

import { memo, useSyncExternalStore, type MouseEvent as ReactMouseEvent, type ReactNode } from 'react';
import type { CompiledColumn, ColumnId, DataGridSnapshot, RowId } from '@salmonui/data-grid/engine';
import { useDataGridInstance } from './context.js';
import { customIcon, useDataGridIcons } from './icons.js';
import type { DataGridInstance } from './instance.js';
import type { DataGridText } from './locale-text.js';
import type { DataGridTreeRowInfo } from './tree-types.js';

/** The core `tree` module methods the React layer reads (engine façade). */
export interface TreeFacade {
  getTreeRow(rowId: RowId): DataGridTreeRowInfo | null;
  getChildRows(rowId: RowId | null): readonly unknown[];
  getChildRowIds(rowId: RowId | null): readonly RowId[];
  checkState(rowId: RowId): 'checked' | 'mixed' | 'unchecked';
  getChildSummary(rowId: RowId): Record<string, Record<string, unknown>> | null;
  canIndent(rowIds: readonly RowId[]): boolean;
  canOutdent(rowIds: readonly RowId[]): boolean;
  getInfo(): { readonly column: string | null; readonly checkbox: boolean; readonly cascade: boolean | 'filtered'; readonly copyMode: 'ancestors' | 'descendants' | 'both' | 'none'; readonly hasChildrenField: string | null };
}

/** The engine's `tree` façade, or undefined without the module. */
export function treeOf(instance: DataGridInstance<unknown>): TreeFacade | undefined {
  return (instance.engine as unknown as { tree?: TreeFacade }).tree;
}

/** English text of the tree keys; `localeText` overrides them. */
const TREE_TEXT: Readonly<Record<string, string>> = {
  treeExpand: 'Expand {row}',
  treeCollapse: 'Collapse {row}',
  treeLoading: 'Loading children',
  treeLoadError: 'Could not load children',
  treeLevel: 'Level {level}',
  treeExpanded: '{row} expanded, {count} children',
  treeCollapsed: '{row} collapsed',
  treeRetry: 'Retry loading children of {row}',
  indent: 'Indent',
  outdent: 'Outdent',
};

/** A tree text: the catalog's message for `key`, else the English default. */
export function treeText(text: DataGridText, key: string, params?: Readonly<Record<string, string | number>>): string {
  if (text.has(key)) return text(key as never, params);
  return (TREE_TEXT[key] ?? key).replace(/\{(\w+)\}/g, (m, name: string) => (params && name in params ? String(params[name]) : m));
}

const columnCache = new WeakMap<object, ColumnId | null>();

function isDataColumn(c: CompiledColumn<unknown>): boolean {
  return c.leaf && c.type !== 'selection' && c.type !== 'rowNumber' && !(c.def.meta as { utility?: boolean } | undefined)?.utility;
}

/**
 * The tree column: `tree.column` (column id, else field) when it
 * is visible, else the first visible data column (utility, selection and
 * row number columns never hold the tree). Follows reorder, pinning and
 * hiding; cached per visible column list.
 */
export function treeColumnId(instance: DataGridInstance<unknown>, snapshot: DataGridSnapshot<unknown> = instance.engine.getSnapshot()): ColumnId | null {
  const visible = snapshot.columns.visible as readonly CompiledColumn<unknown>[];
  const cached = columnCache.get(visible);
  if (cached !== undefined) return cached;
  const wanted = (snapshot.modules['tree'] as { column?: string | null } | undefined)?.column ?? null;
  let id: ColumnId | null = null;
  if (wanted !== null) id = (visible.find((c) => c.columnId === wanted) ?? visible.find((c) => c.def.field === wanted))?.columnId ?? null;
  id ??= visible.find(isDataColumn)?.columnId ?? null;
  columnCache.set(visible, id);
  return id;
}

/** The row's label in announcements and toggle labels: the tree column's text, else the row id. */
export function treeRowLabel(instance: DataGridInstance<unknown>, rowId: RowId): string {
  const column = treeColumnId(instance);
  return (column !== null ? instance.engine.getCellSnapshot(rowId, column)?.formattedValue : undefined) || rowId;
}

const noopSubscribe = (): (() => void) => () => {};
const readNull = (): null => null;

/** The tree row info of `rowId` (stable identity while unchanged); null without the `tree` module. */
export function useTreeRow(instance: DataGridInstance<unknown>, rowId: RowId): DataGridTreeRowInfo | null {
  const tree = treeOf(instance);
  const read = tree ? (): DataGridTreeRowInfo | null => tree.getTreeRow(rowId) : readNull;
  return useSyncExternalStore(tree ? (onChange) => instance.engine.subscribe(onChange) : noopSubscribe, read, tree ? () => instance.serverRead(`tr\u0000${rowId}`, read) : readNull);
}

export interface DataGridTreeToggleProps {
  readonly rowId: RowId;
  /** The row's name in the button label (`Expand {row}`). Default: the tree column's text. */
  readonly label?: string;
}

/**
 * Expand / collapse button of a tree row (`.salmon-data-grid-tree-toggle`).
 * A leaf renders an empty placeholder of the same size (keeps the cell
 * content aligned); a lazy parent shows a spinner while its children load
 * and a retry button after a failed load. The row carries `aria-expanded`
 * (treegrid row), so the button has none of its own.
 */
function DataGridTreeToggleImpl({ rowId, label }: DataGridTreeToggleProps): ReactNode {
  const instance = useDataGridInstance<unknown>();
  const icons = useDataGridIcons();
  const info = useTreeRow(instance, rowId);
  if (!info || !info.hasChildren) return <span className="salmon-data-grid-tree-toggle" aria-hidden="true" />;
  const text = instance.interaction.text;
  const row = label ?? treeRowLabel(instance, rowId);
  const status = info.loadStatus;
  // A lazy parent whose children were never loaded reports collapsed (core `getTreeRow`, SSR `aria-expanded="false"`).
  const shown = info.expanded;
  const expanded = shown && status !== 'loading' && status !== 'error';
  const aria =
    status === 'loading' ? treeText(text, 'treeLoading')
    : status === 'error' ? treeText(text, 'treeRetry', { row })
    : treeText(text, shown ? 'treeCollapse' : 'treeExpand', { row });
  const onClick = (event: ReactMouseEvent<HTMLButtonElement>): void => {
    // The toggle does not select the row.
    event.preventDefault();
    event.stopPropagation();
    if (status === 'loading') return;
    instance.dispatchFrom('pointer', status === 'error' ? { type: 'tree.retry', rowId } : { type: 'tree.toggle', rowId, expanded: !shown });
  };
  return (
    <button
      type="button"
      className="salmon-data-grid-detail-toggle salmon-data-grid-tree-toggle"
      aria-label={aria}
      tabIndex={-1}
      data-expanded={expanded ? '' : undefined}
      data-loading={status === 'loading' ? '' : undefined}
      data-error={status === 'error' ? '' : undefined}
      data-custom-icon={customIcon(icons, expanded ? 'expanded' : 'collapsed')}
      onClick={onClick}
    >
      {icons?.[expanded ? 'expanded' : 'collapsed']}
    </button>
  );
}

/** Tree toggle part (also for `renderRow` templates). */
export const DataGridTreeToggle = memo(DataGridTreeToggleImpl);
