'use client';

import { createContext, use, useLayoutEffect, useSyncExternalStore, type CSSProperties, type ReactNode } from 'react';
import type { DataGridSnapshot } from '@salmonui/data-grid/engine';
import { DEV } from '@salmonui/core/internal/dev';
import type { DataGridInstance } from './instance.js';
import type { DataGridText } from './locale-text.js';
import type { SearchHighlighter } from './search-highlight.js';
import type { DataGridProps, DataGridApi, DataGridCellContext, DataGridElementProps, DataGridEmptyContext, DataGridGroupCaptionContext, DataGridOverflow, DataGridPart, DataGridRowContext, DataGridTextWrap } from './types.js';

/** Stable for the DataGrid lifetime: never changes on scroll, focus, or data changes. Row type erased; `useDataGridInstance<Row>()` restores it. */
export const DataGridInstanceContext = createContext<DataGridInstance<unknown> | null>(null);

/** Render-time props; its value changes only when one of these props changes identity. */
export interface DataGridRenderOptions<Row> {
  readonly renderRow: ((ctx: DataGridRowContext<Row>) => ReactNode) | undefined;
  readonly renderEmpty: ((ctx: DataGridEmptyContext) => ReactNode) | undefined;
  readonly getRowProps: DataGridProps<Row>["getRowProps"];
  readonly rowClassName: ((row: Row, rowIndex: number) => string | undefined) | undefined;
  readonly getCellProps: ((ctx: DataGridCellContext<Row>) => DataGridElementProps | undefined) | undefined;
  readonly classNames: Partial<Record<DataGridPart, string>> | undefined;
  readonly styles: Partial<Record<DataGridPart, CSSProperties>> | undefined;
  readonly textWrap: DataGridTextWrap | undefined;
  readonly resizable: boolean;
  readonly reorderable: boolean;
  /** DataGrid default text overflow. */
  readonly overflow: DataGridOverflow | undefined;
  /** Header rows above the data rows: stacked header depth plus the filter bar row (`aria-rowindex` base). */
  readonly headerRows: number;
  readonly mergeCells: DataGridProps<Row>['mergeCells'];
  /** Column chrome props read while rendering (`instance.props` is synced only after the render). */
  readonly columnMenu: DataGridProps<Row>['columnMenu'];
  readonly filtering: DataGridProps<Row>['filtering'];
  readonly toolbar: DataGridProps<Row>['toolbar'];
  /** The filter bar row is shown (`filtering.ui: 'row'` with a filter module). */
  readonly filterBar: boolean;
  /** Frozen top and bottom row counts (`stickyRows`, `stickyBottomRows`). */
  readonly frozenTop: number;
  readonly frozenBottom: number;
  /** Text in the current catalog and locale; a new value on a `localeText` or `locale` change. */
  readonly text: DataGridText;
  /** `selection.cellRange: 'boxWithBorder'`: selected cells carry their outline edges. */
  readonly cellRangeBorder: boolean;
  /** `sorting.indicators: 'always'`: sortable headers show the arrow pair while unsorted too. */
  readonly sortIndicators: boolean;
  /** `grouping.showHeaderToggle`: headers of groupable columns show the group toggle button. */
  readonly headerGroupToggle: boolean;
  /** `grouping.showRemoveButton` (default true) and `grouping.reorderable`: the group chips re-render when they change. */
  readonly groupChipRemove: boolean;
  readonly groupChipReorder: boolean;
  /** `grouping.renderCaption`: group captions re-render when it changes. */
  readonly renderGroupCaption: ((ctx: DataGridGroupCaptionContext<Row>) => ReactNode) | undefined;
  /** `search.highlight` with an applied search: wraps matches in rendered cells; null otherwise. */
  readonly searchHighlight: SearchHighlighter | null;
}

export const DataGridRenderContext = createContext<DataGridRenderOptions<unknown> | null>(null);

export function useDataGridInstance<Row>(): DataGridInstance<Row> {
  const instance = use(DataGridInstanceContext);
  if (!instance) throw new Error('DataGrid parts and useDataGridApi() must be rendered inside <DataGrid>.');
  return instance as DataGridInstance<Row>;
}

export function useDataGridRender<Row>(): DataGridRenderOptions<Row> {
  return use(DataGridRenderContext) as DataGridRenderOptions<Row>;
}

/** DataGrid text for rendering (re-renders on a catalog or locale change). */
export function useDataGridText(): DataGridText {
  return (use(DataGridRenderContext) as DataGridRenderOptions<unknown>).text;
}

/** The imperative API of the enclosing `DataGrid`, for slots and descendants. */
export function useDataGridApi<Row = unknown>(): DataGridApi<Row> {
  return useDataGridInstance<Row>().api;
}

/** Narrow engine selector; `selector` must return a stable value (primitive or snapshot part). */
export function useEngineSelector<Row, T>(instance: DataGridInstance<Row>, selector: (snapshot: DataGridSnapshot<Row>) => T): T {
  const engine = instance.engine;
  return useSyncExternalStore(
    engine.subscribe,
    () => selector(engine.getSnapshot()),
    () => selector(engine.getServerSnapshot()),
  );
}

function useRenderRecordDev<Row>(instance: DataGridInstance<Row>, kind: 'cell' | 'row' | 'header', id: string): void {
  // No deps: runs after every commit in which this component rendered.
  useLayoutEffect(() => {
    instance.dev?.record(kind, id);
  });
}

function useRenderRecordNoop(): void {}

/** Dev-only render counter feeding `__SALMON_UI_DEVTOOLS__` (stripped to a no-op in production). */
export const useRenderRecord: <Row>(instance: DataGridInstance<Row>, kind: 'cell' | 'row' | 'header', id: string) => void = DEV
  ? useRenderRecordDev
  : useRenderRecordNoop;
