// Render feature contract. A render feature is the code a grid needs for its server render
// or its first client render when one of its props is set; it lives in one
// `features/feature-<name>` module that only the registries and the public
// `@salmonui/data-grid/features` entry import. This file holds types
// only, so importing it never pulls feature code.

import type { ColumnSnapshot, CompiledColumn, DataGridModule, DataGridQueryInit, GroupRowSnapshot, RowId, SearchDescriptor } from '@salmonui/data-grid/engine';
import type { ComponentType, ReactNode } from 'react';
import type { DeferredModule } from '../deferred-module.js';
import type { EditCellView } from '../editing/edit-view.js';
import type { DataGridCardRowProps } from '../Adaptive.js';
import type { DataGridLoadingRowProps } from '../infinite-ui.js';
import type { AdaptiveView } from '../adaptive-view.js';
import type { DataGridInstance } from '../instance.js';
import type { ColumnView } from '../layout.js';
import type { DataGridPagerProps } from '../Pager.js';
import type { SearchHighlighter } from '../search-highlight.js';
import type { DataGridToolbarProps } from '../Toolbar.js';
import type { DataGridCellContext, DataGridColumn, DataGridProps } from '../types.js';
import type { DataGridTreeContext } from '../tree-types.js';
import type { computeRowSpans, planZone } from '../span-plans.js';
import type { spanBlockOf } from '../span-resolver.js';

/** Names of the render features, in their canonical order. */
export type DataGridFeatureName =
  | 'grouping'
  | 'aggregates'
  | 'paging'
  | 'detail'
  | 'toolbar'
  | 'search'
  | 'rowPinning'
  | 'lookup'
  | 'adaptive'
  | 'infiniteScroll'
  | 'spans'
  | 'persistState'
  | 'editing'
  | 'rowDrag'
  | 'tree';

/** Props with `<DataGridColumn>` and `<DataGridAggregateRow>` children resolved (`normalizeProps`). */
export type NormalizedProps<Row = unknown> = DataGridProps<Row>;

/** Controller a feature builds once after the engine and the built-in controllers. */
export interface DataGridFeatureUi {
  /** Runs in the instance mount effect, after the data source connects; returns the teardown. */
  mount?(): () => void;
  /** Runs on every props change (layout effect), with the previous normalized props. */
  sync?(props: NormalizedProps, prev: NormalizedProps): void;
  /** Methods that join the instance API. */
  readonly api?: object;
}

/** Props of a group caption or group footer row part (`Body.tsx`). */
export interface DataGridGroupRowProps {
  readonly rowId: RowId;
  readonly rowIndex: number;
  readonly view: ColumnView<unknown>;
}

/**
 * Parts the grid view renders. Each slot has an inert value in
 * `features/inert.ts` (`null`: nothing renders) that the view uses when the
 * feature is absent.
 */
export interface DataGridFeatureParts {
  /** The pager, a sibling after `role="grid"`; `pagerProps` are the render-time paging props. */
  readonly Pager: ComponentType<{ readonly pagerProps: DataGridPagerProps }> | null;
  /** `grouping`: the group drop area, a sibling before `role="grid"` (`width` and `dir` of the grid). */
  readonly GroupPanel: ComponentType<{ readonly width?: string | undefined; readonly dir?: 'ltr' | 'rtl' | undefined }> | null;
  /** `grouping`: a group caption row of the body. */
  readonly GroupCaptionRow: ComponentType<DataGridGroupRowProps> | null;
  /** `aggregates`: a group footer row of the body (the row model has them only with `groupFooter` aggregates). */
  readonly GroupFooterRow: ComponentType<DataGridGroupRowProps> | null;
  /** `aggregates`: the aggregates of a group caption, inside the `grouping` caption row. */
  readonly GroupCaptionAggregates: ComponentType<{ readonly group: GroupRowSnapshot }> | null;
  /** `aggregates`: the sticky footer rowgroup with the footer aggregate rows. */
  readonly FooterRows: ComponentType | null;
  /** A detail row (`__detail:<rowId>`) of the body (`detail`). */
  readonly DetailRow: ComponentType<{ readonly rowId: RowId; readonly rowIndex: number; readonly view: ColumnView<unknown> }> | null;
  /** The detail toggle utility column, placed by `withUtilityColumns` (`detail`). */
  readonly detailToggleColumn: ((header: string, pinned: boolean) => DataGridColumn<unknown>) | null;
  /** The toolbar, the previous sibling of `role="grid"` (`toolbar` feature, late enable). */
  readonly Toolbar: ComponentType<DataGridToolbarProps> | null;
  /** Span planning (`spans`): row span facts of the body, cell span plans of a row, the `cellSpans` resolver. Installed late too ("Late enable"). */
  readonly spans: DataGridSpanPlanner | null;
  /** `editing`: the added rows (`top` / `bottom`, the at-rest add row before the chunk loads) and the dialogs (`overlays`). */
  readonly EditSlot: ComponentType<{ readonly part: 'top' | 'bottom' | 'overlays' }> | null;
  /** `rowDrag`: the drop indicator and drag preview layer. */
  readonly RowDragLayer: ComponentType | null;
  /** `rowDrag`: the drag handle utility column (its cells render the handles, also on the server). */
  readonly rowDragColumn: ((header: string, pinned: boolean) => DataGridColumn<unknown>) | null;
  /** Vertical (card) row of the adaptive layout (`adaptive`), rendered by the body in place of a row. */
  readonly CardRow: ComponentType<DataGridCardRowProps<unknown>> | null;
  /** Adaptive action bar (`adaptive`), a sibling before `role="grid"`. */
  readonly AdaptiveBar: ComponentType<{ readonly view: AdaptiveView }> | null;
  /** Slot of the adaptive sort and filter sheets (`adaptive`; the sheets are the lazy adaptive chunk). */
  readonly AdaptiveOverlays: ComponentType | null;
  /** Row of a block that is not loaded yet (`infiniteScroll`), rendered by the body for `kind: 'loading'` rows. */
  readonly LoadingRow: ComponentType<DataGridLoadingRowProps> | null;
  /** `tree`: the tree column test and the tree cell content (toggle, checkbox, indentation) that wraps the cell content. */
  readonly treeCell: DataGridTreeCellPart | null;
}

/** Props of the `tree` feature's tree cell content (Cell.tsx). */
export interface DataGridTreeCellProps {
  readonly rowId: RowId;
  readonly column: CompiledColumn<unknown>;
  /** The cell's render context (`ctx.tree` is added). */
  readonly context: () => DataGridCellContext<unknown>;
  /** The cell content; undefined when the column has `renderCell` (the tree cell calls it with `ctx.tree`). */
  readonly content: ReactNode;
}

export interface DataGridTreeCellPart {
  /** The column holds the tree. */
  readonly is: (instance: DataGridInstance<unknown>, columnId: string) => boolean;
  readonly Cell: ComponentType<DataGridTreeCellProps>;
}

/** Row attributes and `getRowProps` context of a tree row (stable identity while the row's tree info is unchanged). */
export interface DataGridTreeRowView {
  readonly attrs: Readonly<Record<string, string | number | boolean>>;
  readonly ctx: { readonly tree: DataGridTreeContext };
}

/** The `spans` feature's planner (`span-plans.ts`, `span-resolver.ts`); the instance and the body call it behind the static `spanFlags` check. */
export interface DataGridSpanPlanner {
  readonly rowSpans: typeof computeRowSpans;
  readonly planZone: typeof planZone;
  readonly block: typeof spanBlockOf;
}

/**
 * Per-row, per-cell and per-header selectors read by always-called
 * hooks, so hook order never depends on the feature set. An inert value is
 * either `null` (the hook still runs, with a no-op subscription and a
 * constant `null` snapshot) or a function that returns a constant `null`.
 * The lookup header status needs none: it reads the core module's state
 * structurally (`lookup-status.ts`, static).
 */
export interface DataGridFeatureSelectors {
  /** Expansion of a data row (`data-expanded`); null for rows without a detail (`detail`). */
  readonly detailExpanded: ((instance: DataGridInstance<unknown>, rowId: RowId) => boolean | null) | null;
  /** `editing`: edit marks and content of a body cell from its UI bits (`null`: none). */
  readonly editCellView: <Row>(instance: DataGridInstance<Row>, rowId: RowId, column: CompiledColumn<Row>, bits: number) => EditCellView | null;
  /** `editing`: edit marks of a body row from its UI bits (`null`: none). */
  readonly editRowAttrs: (bits: number) => Record<string, string> | null;
  /** `search.highlight`: the highlighter of the applied search; the inert value returns `null`. */
  readonly searchHighlighter: (descriptor: SearchDescriptor, columns: ColumnSnapshot<unknown>) => SearchHighlighter | null;
  /** `tree`: ARIA and data attributes plus `ctx.tree` of a tree row; also the `role="treegrid"` switch. */
  readonly treeRow: ((instance: DataGridInstance<unknown>, rowId: RowId) => DataGridTreeRowView | null) | null;
}

/** Per-creation context of the feature hooks: stand-ins of lazily loaded core modules, resolved by the feature's controller. */
export interface DataGridFeatureContext {
  readonly deferred: DeferredModule<unknown>[];
}

/** A render feature for the `features` prop; values come from `@salmonui/data-grid/features`. */
export interface DataGridFeature {
  /** The feature name. */
  readonly name: DataGridFeatureName;
  /** @internal Core modules for these props, appended after the app's `modules` (a module the app passes wins). */
  modules?(props: NormalizedProps, ctx: DataGridFeatureContext & { readonly modules: readonly DataGridModule<unknown>[] }): readonly DataGridModule<unknown>[];
  /** @internal Engine options of its modules; `latest` reads the current props (option callbacks run after creation). */
  engineOptions?(props: NormalizedProps, latest: () => NormalizedProps): Record<string, unknown>;
  /** @internal Initial query contribution (group fields, page and page size, search text). */
  defaultQuery?(props: NormalizedProps): DataGridQueryInit | undefined;
  /** @internal Controller built once after the engine. */
  createUi?(instance: DataGridInstance<unknown>, ctx: DataGridFeatureContext): DataGridFeatureUi;
  /** @internal Parts the view renders. */
  readonly parts?: Partial<DataGridFeatureParts>;
  /** @internal Selectors read by the always-called per-row, per-cell and per-header hooks. */
  readonly selectors?: Partial<DataGridFeatureSelectors>;
  /** @internal Interaction chunk loaders warmed in parallel with this feature (editing: `edit-chunk`; row drag: `row-drag-chunk`). */
  readonly warm?: readonly (() => Promise<unknown>)[];
  /**
   * @internal Chunking hub, `() => DataGrid`.
   * A value reference to `DataGrid.tsx` makes the feature chunk reach the
   * whole static graph, so every static module has the same entry set and
   * the consumer's bundler keeps them in the main chunk instead of
   * splitting the modules the feature imports into extra initial chunks.
   * A function, so the module cycle it closes (feature -> `DataGrid.tsx`
   * -> `registry-static.ts` -> feature) never reads the binding before it
   * is initialized. Never called; every feature sets it
   * (`feature:boundary:check`).
   */
  readonly hub?: () => unknown;
}

/** Status-tagged thenable (the convention React's `use` reads). */
export type DataGridFeatureThenable = Promise<readonly DataGridFeature[]> & {
  status?: 'pending' | 'fulfilled' | 'rejected';
  value?: readonly DataGridFeature[];
  reason?: unknown;
};

/** The signature both registries export (`#data-grid-features`). */
export type ReadFeatures = (needed: readonly DataGridFeatureName[], provided: readonly DataGridFeature[] | undefined) => readonly DataGridFeature[] | DataGridFeatureThenable;
