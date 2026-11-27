// Edit-state enablement of the built-in toolbar edit items. The toolbar reads one small bit mask through an
// engine selector, so it re-renders only when one of these inputs flips
// (never per cell, scroll, or pointer move); the rules below map the mask to
// a disabled flag per item. Reads module state only: the editing UI chunk is
// not needed.

import type { RowId } from '@salmonui/data-grid/engine';

interface EditStateLike {
  readonly options: { readonly enabled: boolean; readonly add: boolean; readonly edit: boolean; readonly delete: boolean; readonly mode: string };
  readonly active: { readonly rowId: RowId } | null;
  readonly dirtyCellCount: number;
  readonly addedRowIds: readonly RowId[];
  readonly deletedRowIds: readonly RowId[];
}

interface SelectionStateLike {
  readonly options: { readonly enabled: boolean };
  readonly rows: { readonly scope: 'explicit' | 'allFiltered'; readonly ids: ReadonlySet<RowId> };
  readonly cells: { readonly ranges: readonly unknown[] };
}

interface FocusStateLike {
  readonly target: { readonly kind: string; readonly rowId?: RowId } | null;
}

interface EngineLike {
  getModuleState<T = unknown>(name: string): T | undefined;
  getSnapshot(): { readonly rows: { readonly count: number } };
  subscribe(listener: () => void): () => void;
  subscribeModule(name: string, listener: () => void): () => void;
}

/**
 * Change notifications of the bits' inputs: the snapshot (row count) and
 * the `edit`, `focus`, and `selection` module slices.
 */
export function subscribeToolbarEdit(engine: EngineLike, listener: () => void): () => void {
  const offs = [engine.subscribe(listener), engine.subscribeModule('edit', listener), engine.subscribeModule('focus', listener), engine.subscribeModule('selection', listener)];
  return () => {
    for (const off of offs) off();
  };
}

/** The edit module is registered and `editing` is on. */
export const TB_EDITING = 1;
const BATCH = 2;
const ACTIVE = 4;
const PENDING = 8;
const TARGET = 16;
const CAN_ADD = 32;
const CAN_EDIT = 64;
const CAN_DELETE = 128;

/** Inputs of the edit item enablement as a bit mask (0 without editing). */
export function toolbarEditBits(engine: EngineLike): number {
  const edit = engine.getModuleState<EditStateLike>('edit');
  if (!edit?.options.enabled) return 0;
  const o = edit.options;
  let bits = TB_EDITING;
  if (o.mode === 'batch') bits |= BATCH;
  if (edit.active) bits |= ACTIVE;
  if (edit.dirtyCellCount > 0 || edit.addedRowIds.length > 0 || edit.deletedRowIds.length > 0) bits |= PENDING;
  if (o.add) bits |= CAN_ADD;
  if (o.edit) bits |= CAN_EDIT;
  if (o.delete) bits |= CAN_DELETE;
  if (engine.getSnapshot().rows.count > 0) {
    const selection = engine.getModuleState<SelectionStateLike>('selection');
    // With selection on, the target is the selection;
    // without it, the focused body cell.
    if (selection?.options.enabled) {
      if (selection.rows.scope === 'allFiltered' || selection.rows.ids.size > 0 || selection.cells.ranges.length > 0) bits |= TARGET;
    } else {
      const focus = engine.getModuleState<FocusStateLike>('focus')?.target;
      if (focus?.kind === 'cell' && focus.rowId !== undefined && !focus.rowId.startsWith('__g')) bits |= TARGET;
    }
  }
  return bits;
}

/**
 * Whether the edit state disables built-in item `builtIn`, or null when the
 * edit state does not decide it (not an edit item, or editing is off).
 * Outside batch mode an open edit disables Add / Edit / Delete and is the
 * only state that enables Save / Cancel; in batch mode Save / Cancel need
 * pending changes or an open cell editor. Edit / Delete need a target row:
 * a selected row or cell range, or with selection off a focused body cell.
 */
export function editItemDisabled(builtIn: string, bits: number): boolean | null {
  if (!(bits & TB_EDITING)) return null;
  const batch = (bits & BATCH) !== 0;
  const active = (bits & ACTIVE) !== 0;
  const locked = !batch && active;
  switch (builtIn) {
    case 'add':
      return !(bits & CAN_ADD) || locked;
    case 'edit':
      return !(bits & CAN_EDIT) || !(bits & TARGET) || locked;
    case 'delete':
      return !(bits & CAN_DELETE) || !(bits & TARGET) || locked;
    case 'save':
    case 'cancel':
      return batch ? !(active || (bits & PENDING) !== 0) : !active;
    default:
      return null;
  }
}
