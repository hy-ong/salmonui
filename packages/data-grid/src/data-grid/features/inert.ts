// Inert null objects of every feature slot: what the view and the instance use when a feature is absent.
// Each renders nothing and returns the documented off value, so the
// imperative API and the hook order are the same on every grid. Static and
// tiny; imports feature code with `import type` only.

import type { CommandResult } from '@salmonui/data-grid/engine';
import type { DataGridEditUi } from '../editing/edit-host.js';
import type { DataGridEditApi } from '../editing/edit-types.js';
import type { DataGridRowDragUi } from '../row-drag.js';
import type { DataGridFeature, DataGridFeatureName, DataGridFeatureParts, DataGridFeatureSelectors } from './types.js';

export const INERT_PARTS: DataGridFeatureParts = Object.freeze({
  Pager: null,
  GroupPanel: null,
  GroupCaptionRow: null,
  GroupFooterRow: null,
  GroupCaptionAggregates: null,
  FooterRows: null,
  DetailRow: null,
  detailToggleColumn: null,
  Toolbar: null,
  spans: null,
  EditSlot: null,
  RowDragLayer: null,
  rowDragColumn: null,
  CardRow: null,
  AdaptiveBar: null,
  AdaptiveOverlays: null,
  LoadingRow: null,
  treeCell: null,
});

const none = (): null => null;

export const INERT_SELECTORS: DataGridFeatureSelectors = Object.freeze({
  detailExpanded: null,
  editCellView: none,
  editRowAttrs: none,
  searchHighlighter: none,
  treeRow: null,
});

export const NO_FEATURES: readonly DataGridFeature[] = Object.freeze([]);

/** The resolved features of one instance: names, parts and selectors with inert defaults. */
export interface DataGridFeatureSet {
  readonly list: readonly DataGridFeature[];
  readonly names: ReadonlySet<DataGridFeatureName>;
  readonly parts: DataGridFeatureParts;
  readonly selectors: DataGridFeatureSelectors;
}

/** Composes the parts and selectors of `features` over the inert defaults (later features win). */
export function featureSet(features: readonly DataGridFeature[]): DataGridFeatureSet {
  if (!features.length) return EMPTY_SET;
  let parts: DataGridFeatureParts = INERT_PARTS;
  let selectors: DataGridFeatureSelectors = INERT_SELECTORS;
  for (const f of features) {
    if (f.parts) parts = { ...parts, ...f.parts };
    if (f.selectors) selectors = { ...selectors, ...f.selectors };
  }
  return { list: features, names: new Set(features.map((f) => f.name)), parts, selectors };
}

const EMPTY_SET: DataGridFeatureSet = Object.freeze({ list: NO_FEATURES, names: new Set<DataGridFeatureName>(), parts: INERT_PARTS, selectors: INERT_SELECTORS });

/**
 * The effective feature list: `provided` (deduplicated by name, the provided
 * object wins) plus `loaded` for the needed names that were not provided.
 * Shared by both registries.
 */
export function mergeFeatures(
  needed: readonly DataGridFeatureName[],
  provided: readonly DataGridFeature[] | undefined,
  lookup: (name: DataGridFeatureName) => DataGridFeature | undefined,
): readonly DataGridFeature[] {
  const byName = new Map<DataGridFeatureName, DataGridFeature>();
  for (const f of provided ?? NO_FEATURES) byName.set(f.name, f);
  for (const name of needed) {
    if (byName.has(name)) continue;
    const f = lookup(name);
    if (f) byName.set(name, f);
  }
  return byName.size ? [...byName.values()] : NO_FEATURES;
}

/** Needed names that `provided` does not cover. */
export function missingFeatures(needed: readonly DataGridFeatureName[], provided: readonly DataGridFeature[] | undefined): DataGridFeatureName[] {
  if (!provided?.length) return [...needed];
  const have = new Set(provided.map((f) => f.name));
  return needed.filter((n) => !have.has(n));
}

// ---------------------------------------------------------------------------
// Hosts of the `editing` and `rowDrag` features when absent: the instance
// reads `active` / `enabled`, `whenReady`, the editing API and `moveRows`.
// ---------------------------------------------------------------------------

const off = (reason: string): (() => CommandResult) => {
  const result: CommandResult = Object.freeze({ status: 'rejected', reason });
  return () => result;
};
const editingOff = off('editingDisabled');
const clipboardOff = off('clipboardUnavailable');
const nothing = (): undefined => undefined;
const NO_CHANGES = Object.freeze({ addedRecords: Object.freeze([]), changedRecords: Object.freeze([]), deletedRecords: Object.freeze([]) });

/** The editing methods of `DataGridApi` without `editing`: every action is rejected, reads return the empty values. */
const EDIT_API_OFF: DataGridEditApi<unknown> = Object.freeze({
  startEdit: editingOff,
  save: editingOff,
  saveCell: editingOff,
  cancelEdit: editingOff,
  addRow: editingOff,
  deleteRows: editingOff,
  updateRow: editingOff,
  updateCell: editingOff,
  setCellValue: editingOff,
  setRowData: editingOff,
  applyChanges: editingOff,
  getPendingChanges: () => NO_CHANGES as never,
  getBatchPreview: nothing,
  getEditSnapshot: nothing,
  hasUnsavedChanges: () => false,
  whenEditSettled: () => Promise.resolve(),
  validateBatch: () => Promise.resolve(true),
  undo: editingOff,
  redo: editingOff,
  fillSelection: clipboardOff,
  copy: clipboardOff,
  paste: clipboardOff,
});

/** `instance.editing` without the `editing` feature (only these members are read when `active` is false). */
export const INERT_EDITING = Object.freeze({
  active: false,
  api: () => EDIT_API_OFF,
  whenReady(work: () => void): () => void {
    work();
    return none;
  },
}) as unknown as DataGridEditUi<unknown>;

const rowDragOff = off('row drag is off (set rowDrag)');

/** `instance.rowDragUi` without the `rowDrag` feature. */
export const INERT_ROW_DRAG = Object.freeze({ enabled: false, handoff: null, moveRows: rowDragOff }) as unknown as DataGridRowDragUi<unknown>;
