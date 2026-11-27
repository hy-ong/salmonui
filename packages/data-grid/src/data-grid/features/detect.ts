// Render feature detection. Pure: reads the
// normalized props only (never the environment), imports no feature code and
// no optional core module, and returns the required names sorted, so the
// server and the client compute the same set and build the same tree.

import type { DataGridFeatureName, NormalizedProps } from './types.js';

/** "Set": neither `undefined`, `null` nor `false` (`true`, `{}` and other objects are set). */
export function isSet(value: unknown): boolean {
  return value !== undefined && value !== null && value !== false;
}

/**
 * Trigger of each render feature. Registration calls the same predicate
 * (`feature-<name>` modules), so detection and registration cannot diverge.
 */
export const FEATURE_TRIGGERS: Readonly<Partial<Record<DataGridFeatureName, (props: NormalizedProps) => boolean>>> = Object.freeze({
  paging: (props: NormalizedProps) => isSet(props.paging),
  detail: (props: NormalizedProps) => hasDetailContent(props),
  search: (props: NormalizedProps) => isSet(props.search),
  toolbar: (props: NormalizedProps) => (props.toolbar?.length ?? 0) > 0 || props.renderToolbar !== undefined,
  rowPinning: (props: NormalizedProps) => props.isRowPinned !== undefined || props.defaultPinnedRows !== undefined,
  lookup: (props: NormalizedProps) => hasLookupColumn(props.columns),
  persistState: (props: NormalizedProps) => isSet(props.persistState),
  adaptive: (props: NormalizedProps) => isSet(props.adaptive),
  infiniteScroll: (props: NormalizedProps) => isSet(props.infiniteScroll),
  spans: (props: NormalizedProps) => props.mergeCells === true || props.mergeCells === 'columns' || props.mergeCells === 'rows' || hasSpanColumn(props.columns),
  grouping: (props: NormalizedProps) => isSet(props.grouping),
  // `[]` counts, so aggregate rows can be added later; `<DataGridAggregateRow>` children are resolved by `normalizeProps`.
  aggregates: (props: NormalizedProps) => props.aggregates !== undefined,
  editing: (props: NormalizedProps) => isSet(props.editing),
  rowDrag: (props: NormalizedProps) => isSet(props.rowDrag),
  tree: (props: NormalizedProps) => isSet(props.tree),
});

/** A declared column, nested and hidden ones included, has `lookup`. */
function hasLookupColumn(columns: NormalizedProps['columns']): boolean {
  for (const c of columns ?? []) if (c.lookup || hasLookupColumn(c.columns)) return true;
  return false;
}

interface SpanColumnDef {
  readonly colSpan?: unknown;
  readonly rowSpan?: unknown;
  readonly columns?: readonly SpanColumnDef[];
}

/** A declared column (nested and hidden ones included) has a truthy `colSpan` or `rowSpan` (the `spans` trigger). */
function hasSpanColumn(columns: readonly SpanColumnDef[] | undefined): boolean {
  for (const c of columns ?? []) if (c.colSpan || c.rowSpan || (c.columns?.length && hasSpanColumn(c.columns))) return true;
  return false;
}

/** Detail rows are on when the grid has detail content (a template or a child grid); `detail` trigger and module registration. */
export function hasDetailContent(props: { readonly renderDetail?: unknown; readonly childGrid?: unknown }): boolean {
  return props.renderDetail !== undefined || props.childGrid !== undefined;
}

/** Names of the render features the props require, sorted. The `modules` prop is not inspected. */
export function requiredFeatures(props: NormalizedProps): readonly DataGridFeatureName[] {
  const out: DataGridFeatureName[] = [];
  for (const name of Object.keys(FEATURE_TRIGGERS) as DataGridFeatureName[]) if (FEATURE_TRIGGERS[name]?.(props)) out.push(name);
  return out.sort();
}
