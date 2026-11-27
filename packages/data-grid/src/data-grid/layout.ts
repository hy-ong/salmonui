// Renderer-local layout store (virtualization). Holds the
// transient viewport inputs (size, scroll offset, measured row heights,
// content-fitted widths) and derives the rendered row window and column view
// from them and the engine snapshot. Scroll never touches React state: the
// scroll handler writes here, and React is notified only when the rendered
// range changes. Everything is computed on demand and cached by input
// identity, so getters are cheap, pure, and usable as useSyncExternalStore
// snapshots.

import {
  clampColumnWidth,
  fitColumnWidths,
  computeRange,
  createColumnMetrics,
  createFixedRowMetrics,
  createScrollMapping,
  createVariableRowMetrics,
  resolveColumnWidth,
  type ColumnId,
  type ColumnMetrics,
  type ColumnSnapshot,
  type ColumnsState,
  type CompiledColumn,
  type DataGridEngine,
  type RowId,
  type RowMetrics,
  type RowModelSnapshot,
  type RowModelView,
  type ScrollMapping,
  type VariableRowMetrics,
  type VirtualRange,
} from '@salmonui/data-grid/engine';
import { baseView, createSparseRowMetrics, detailRowId, type DetailView } from '@salmonui/data-grid/engine/expansion';
import { getDataGridInitialRange } from './server-range.js';
import { fixedVars, fixedView, type FixedView } from './fixed-zone.js';

export interface LayoutConfig<Row> {
  readonly rowHeight: number;
  readonly headerHeight: number;
  readonly defaultColumnWidth: number;
  readonly getRowHeight: ((row: Row) => number) | null;
  /** Measured row heights (variable content); `estimatedRowHeight` is the fallback. */
  readonly measureRows: boolean;
  readonly estimatedRowHeight: number;
  readonly virtualRows: boolean;
  readonly virtualColumns: boolean;
  readonly rowOverscan: number;
  readonly columnOverscan: number;
  readonly maxScrollHeight: number;
  readonly initialRows: number;
  readonly initialColumns: number;
  /** Width of one group indent level (px). */
  readonly indentWidth: number;
}

/** Rendered rows: `[start, end)` of the visible row model, overscan included. */
export interface RowWindow {
  readonly start: number;
  readonly end: number;
  readonly count: number;
  /** Row model the window indexes into; a new model (sort, filter, data) is a new window. */
  readonly model: unknown;
}

/** Columns the header and every row render, by zone. */
export interface ColumnView<Row> {
  readonly left: readonly CompiledColumn<Row>[];
  /** Rendered slice of the center zone. */
  readonly center: readonly CompiledColumn<Row>[];
  readonly right: readonly CompiledColumn<Row>[];
  /** Index of `center[0]` in the full center zone. */
  readonly centerStart: number;
  readonly centerCount: number;
  /** Width of the unrendered center columns before `center[0]`. */
  readonly offsetLeft: number;
  /** Group indent levels rendered before the left zone (frozen, outside horizontal virtualization). */
  readonly indent: number;
  /** Fixed-zone columns (`pinned: 'center'`); unset when no column is fixed. */
  readonly fixed?: FixedView<Row>;
}

/** Resolved px widths and the CSS variables that carry them. */
export interface ColumnLayout {
  readonly widths: ReadonlyMap<ColumnId, number>;
  readonly leftWidth: number;
  readonly centerWidth: number;
  readonly rightWidth: number;
  readonly totalWidth: number;
  /** Group indent block width (levels x `indentWidth`), included in `totalWidth`. */
  readonly indentWidth: number;
  /** `--salmon-data-grid-cw-<leafIndex>` per visible leaf plus zone widths; set on the grid root. */
  readonly cssVars: Readonly<Record<string, string>>;
}

/** CSS custom property holding a leaf column width. */
export const widthVar = (leafIndex: number): string => `--salmon-data-grid-cw-${leafIndex}`;

/** True for a grouped row model (detail rows wrap the structural view). */
export function isGroupedView(view: RowModelView | null | undefined): boolean {
  const kind = baseView(view)?.kind;
  return kind !== undefined && kind !== 'plain' && kind !== 'infinite';
}

/** Group indent levels of a snapshot: the group depth when the row model is grouped. */
export function indentLevels(snapshot: { readonly rows: RowModelSnapshot<unknown>; readonly query: { readonly grouping: readonly unknown[] } }): number {
  const rows = snapshot.rows;
  if (!isGroupedView(rows.view)) return 0;
  return rows.groups?.depth ?? snapshot.query.grouping.length;
}

/** Estimated detail row height before measurement (`detailHeight`, default 150). */
function detailEstimate(engine: DataGridEngine<unknown>): number {
  return (engine as unknown as { detail?: { getInfo(): { height: number } } }).detail?.getInfo().height ?? 150;
}

type Listener = () => void;

export class DataGridLayout<Row> {
  readonly config: LayoutConfig<Row>;
  private readonly engine: DataGridEngine<Row>;
  private readonly listeners = new Set<Listener>();
  /** Scroll and viewport size listeners (`api.subscribeViewport`). */
  readonly scrolls = new Set<Listener>();

  // Inputs (transient, renderer-owned).
  private viewportWidth = 0;
  private viewportHeight = 0;
  private scrollTop = 0;
  private scrollLeft = 0;
  private readonly measuredHeights = new Map<RowId, number>();
  private readonly autoWidths = new Map<ColumnId, number>();
  private autoWidthsVersion = 0;
  /** `resizeMode: 'auto'`: stretch the columns to fill the viewport. */
  private fitColumns = false;

  // Derived caches.
  private layoutFor: { columns: ColumnSnapshot<Row>; state: unknown; width: number; auto: number; indent: number; fit: boolean } | null = null;
  private columnLayout: ColumnLayout | null = null;
  private centerMetrics: ColumnMetrics = createColumnMetrics([]);
  private metricsFor: RowModelSnapshot<Row> | null = null;
  private metrics: RowMetrics = createFixedRowMetrics(0, 1);
  /** The metrics are sparse (fixed rows plus measured detail rows): measured heights update them in place. */
  private sparse = false;
  private mapping: ScrollMapping = createScrollMapping(0, 0);
  private rowRange: VirtualRange = { start: 0, end: 0, overscanStart: 0, overscanEnd: 0 };
  private colRange: VirtualRange = { start: 0, end: 0, overscanStart: 0, overscanEnd: 0 };
  private rowWindow: RowWindow = Object.freeze({ start: 0, end: 0, count: 0, model: null });
  private viewFor: { columns: ColumnSnapshot<Row>; start: number; end: number; offset: number; indent: number } | null = null;
  private indent = 0;
  private footerRows = 0;
  private columnView: ColumnView<Row> | null = null;
  private serverRowWindow: RowWindow | null = null;
  private serverView: ColumnView<Row> | null = null;
  private serverLayout: ColumnLayout | null = null;

  // Rendered state (what React last committed) and DOM targets.
  private renderedRowStart = 0;
  private renderedOffsetLeft = 0;
  private viewport: HTMLElement | null = null;
  private body: HTMLElement | null = null;
  private rows: HTMLElement | null = null;
  private written = { height: '', transform: '', offset: '' };

  constructor(engine: DataGridEngine<Row>, config: LayoutConfig<Row>) {
    this.engine = engine;
    this.config = config;
  }

  // ------------------------------------------------------------------------
  // Subscriptions (React reads through useSyncExternalStore)
  // ------------------------------------------------------------------------

  /** Layout changes plus engine snapshot changes (both feed the derived values). */
  readonly subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    const off = this.engine.subscribe(listener);
    return () => {
      this.listeners.delete(listener);
      off();
    };
  };

  private emit(): void {
    for (const listener of this.listeners) listener();
  }

  readonly getRowWindow = (): RowWindow => {
    this.sync();
    return this.rowWindow;
  };

  readonly getColumnView = (): ColumnView<Row> => {
    this.sync();
    return this.columnView as ColumnView<Row>;
  };

  readonly getColumnLayout = (): ColumnLayout => {
    this.sync();
    return this.columnLayout as ColumnLayout;
  };

  /** Deterministic window for SSR and hydration: no measurement, estimated sizes. */
  readonly getServerRowWindow = (): RowWindow => {
    if (!this.serverRowWindow) {
      const snap = this.engine.getServerSnapshot();
      const count = snap.rows.count;
      const end = this.config.virtualRows ? getDataGridInitialRange({ rowCount: count, centerColumnCount: 0, initialRows: this.config.initialRows }).rows.end : count;
      this.serverRowWindow = Object.freeze({ start: 0, end, count, model: snap.rows });
    }
    return this.serverRowWindow;
  };

  readonly getServerColumnView = (): ColumnView<Row> => {
    if (!this.serverView) {
      const columns = this.engine.getServerSnapshot().columns;
      const end = this.initialColumnEnd(columns);
      this.serverView = this.buildView(columns, 0, end, 0, indentLevels(this.engine.getServerSnapshot() as never));
    }
    return this.serverView;
  };

  readonly getServerColumnLayout = (): ColumnLayout => {
    if (!this.serverLayout) {
      const snap = this.engine.getServerSnapshot();
      this.serverLayout = this.buildColumnLayout(snap.columns, snap.modules['columns'] as ColumnsState, 0, true, indentLevels(snap as never));
    }
    return this.serverLayout;
  };

  /** Body height for SSR and the first client render (estimated sizes, capped by compression). */
  getServerScrollHeight(): number {
    // O(1): estimated sizes only, so server work never scales with the row count.
    const count = this.engine.getServerSnapshot().rows.count;
    const estimate = this.config.measureRows ? this.config.estimatedRowHeight : this.config.rowHeight;
    return Math.min(count * estimate, this.config.maxScrollHeight);
  }

  // ------------------------------------------------------------------------
  // Inputs
  // ------------------------------------------------------------------------

  get measured(): boolean {
    return this.viewportHeight > 0;
  }

  /** `resizeMode`: `'auto'` stretches the columns to fill the viewport width. */
  setResizeMode(mode: 'normal' | 'auto' | undefined): void {
    const fit = mode === 'auto';
    if (fit === this.fitColumns) return;
    this.fitColumns = fit;
    this.sync();
    this.emit();
    this.applyDom();
  }

  /** True when the rendered widths are fitted to the viewport (`resizeMode: 'auto'`, measured viewport). */
  isFitting(): boolean {
    return this.fitColumns && this.viewportWidth > 0;
  }

  /**
   * The layout a pointer resize would produce with `columnId` at `width`
   * (`resizeMode: 'auto'`): the resized column keeps `width`, the other
   * columns are re-fitted from their resolved widths. DOM-only drag preview;
   * no state is touched. `null` outside the auto mode.
   */
  previewResize(columnId: ColumnId, width: number): ColumnLayout | null {
    if (!this.isFitting()) return null;
    const snap = this.engine.getSnapshot();
    return this.buildColumnLayout(snap.columns, snap.modules['columns'] as ColumnsState, this.viewportWidth, false, this.indent, { columnId, width });
  }

  /** Viewport client size. The first call switches from the initial range to the measured one. */
  setViewportSize(width: number, height: number): void {
    if (width === this.viewportWidth && height === this.viewportHeight) return;
    this.viewportWidth = width;
    this.viewportHeight = height;
    if (this.sync()) this.emit();
    this.applyDom();
    for (const l of this.scrolls) l();
  }

  /**
   * Scroll handler path: O(log n) range math, no allocation beyond the
   * range object, no DOM reads. Notifies React only when the rendered window
   * changes; with compressed scroll height it also repositions the rows
   * container (a transform write, no React).
   */
  setScroll(top: number, left: number): void {
    if (top === this.scrollTop && left === this.scrollLeft) return;
    if (this.virtualOverride !== null && Math.abs(this.mapping.toVirtual(top) - this.virtualOverride) > this.mapping.ratio * 2 + 1) {
      this.virtualOverride = null; // a scrollbar drag or keyboard scroll, not our own wheel write
    }
    this.scrollTop = top;
    this.scrollLeft = left;
    const changed = this.sync();
    if (this.mapping.compressed) this.applyRowsTransform();
    this.applyEdges();
    if (changed) this.emit();
    for (const l of this.scrolls) l();
  }

  /** Exact virtual offset set by wheel input under compression (1:1 content motion). */
  private virtualOverride: number | null = null;

  private currentVirtual(): number {
    return this.virtualOverride ?? this.mapping.toVirtual(this.scrollTop);
  }

  /** Compressed scroll only: moves the virtual offset by `delta` px; returns the physical scrollTop to set. */
  wheelBy(delta: number): number {
    this.sync();
    const max = Math.max(0, this.metrics.totalHeight - this.bodyExtent());
    const v = Math.min(max, Math.max(0, this.currentVirtual() + delta));
    this.virtualOverride = v;
    const physical = this.mapping.toPhysical(v);
    this.scrollTop = physical;
    const changed = this.computeRanges();
    this.applyRowsTransform();
    if (changed) this.emit();
    for (const l of this.scrolls) l();
    return physical;
  }

  /** Measured row heights from the shared ResizeObserver. Returns the height change above the viewport. */
  reportRowHeights(entries: readonly (readonly [RowId, number])[]): number {
    this.sync();
    let anchorDelta = 0;
    let changed = false;
    const metrics = this.metrics as VariableRowMetrics;
    const variable = (this.config.measureRows || this.sparse) && typeof metrics.setHeight === 'function';
    for (const [rowId, height] of entries) {
      if (this.measuredHeights.get(rowId) === height) continue;
      this.measuredHeights.set(rowId, height);
      changed = true;
      if (!variable) continue;
      const index = this.engine.getRowIndex(rowId);
      if (index < 0) continue;
      const delta = metrics.setHeight(index, height);
      if (delta !== 0 && index < this.rowRange.start) anchorDelta += delta;
    }
    if (!changed) return 0;
    this.updateMapping();
    const windowChanged = this.computeRanges();
    this.applyDom();
    if (windowChanged) this.emit();
    return anchorDelta;
  }

  /** Content-fitted widths of `width: 'auto'` columns (renderer-local, not user state). */
  setAutoWidths(widths: ReadonlyMap<ColumnId, number>): void {
    let changed = false;
    for (const [id, w] of widths) {
      if (this.autoWidths.get(id) !== w) {
        this.autoWidths.set(id, w);
        changed = true;
      }
    }
    if (!changed) return;
    this.autoWidthsVersion++;
    this.sync();
    this.emit();
  }

  hasAutoWidth(columnId: ColumnId): boolean {
    return this.autoWidths.has(columnId);
  }

  // ------------------------------------------------------------------------
  // DOM targets and commit hooks
  // ------------------------------------------------------------------------

  attach(viewport: HTMLElement | null, body: HTMLElement | null, rows: HTMLElement | null): void {
    this.viewport = viewport;
    this.body = body;
    this.rows = rows;
    this.written = { height: '', transform: '', offset: '' };
    this.edges = { start: false, end: false };
    this.applyDom();
  }

  /** Called from a layout effect after React committed a row window. */
  commitRows(window: RowWindow): void {
    this.renderedRowStart = window.start;
    // The window's row count may have changed without a viewport change (a remote result, an infinite block): write the height too.
    this.applyDom();
  }

  /** Called from a layout effect after React committed a column view. */
  commitColumns(view: ColumnView<Row>): void {
    this.renderedOffsetLeft = view.offsetLeft;
    this.applyColumnOffset();
    this.applyEdges();
  }

  private applyDom(): void {
    if (this.body) {
      const height = `${this.mapping.scrollHeight}px`;
      if (height !== this.written.height) {
        this.body.style.height = height;
        this.written.height = height;
      }
    }
    this.applyRowsTransform();
    this.applyColumnOffset();
    this.applyEdges();
  }

  private applyRowsTransform(): void {
    if (!this.rows) return;
    const top = this.metrics.offsetOf(this.renderedRowStart);
    let y = top;
    if (this.mapping.compressed) {
      const physical = Math.min(this.scrollTop, this.mapping.scrollHeight);
      y = physical + (top - this.currentVirtual());
    }
    const transform = `translateY(${y}px)`;
    if (transform !== this.written.transform) {
      this.rows.style.transform = transform;
      this.written.transform = transform;
    }
  }

  private applyColumnOffset(): void {
    if (!this.viewport) return;
    const offset = `${this.renderedOffsetLeft}px`;
    if (offset !== this.written.offset) {
      this.viewport.style.setProperty('--salmon-data-grid-col-offset', offset);
      this.written.offset = offset;
    }
  }

  // ------------------------------------------------------------------------
  // Queries used by the API
  // ------------------------------------------------------------------------

  getRowMetrics(): RowMetrics {
    this.sync();
    return this.metrics;
  }

  getScrollMapping(): ScrollMapping {
    this.sync();
    return this.mapping;
  }

  getRanges(): { rows: VirtualRange; columns: VirtualRange } {
    this.sync();
    return { rows: this.rowRange, columns: this.colRange };
  }

  getCenterMetrics(): ColumnMetrics {
    this.sync();
    return this.centerMetrics;
  }

  getScroll(): { top: number; left: number } {
    return { top: this.scrollTop, left: this.scrollLeft };
  }

  bodyExtent(): number {
    return Math.max(0, this.viewportHeight - this.chromeExtent());
  }

  /** Header rows (stacked levels, filter bar) plus sticky footer rows, in px: the viewport height the body rows cannot use. */
  chromeExtent(): number {
    return this.config.headerHeight * this.headerRows + this.footerRows * this.config.rowHeight;
  }

  /** Height of a data row for row-count math: the adaptive card height, the estimate when rows are measured, else `rowHeight`. */
  dataRowHeight(): number {
    return this.rowHeightOverride ?? (this.config.measureRows ? this.config.estimatedRowHeight : this.config.rowHeight);
  }

  /** Adaptive vertical rows: data rows use this height instead of `rowHeight`. */
  private rowHeightOverride: number | null = null;

  /** Sets (or clears with null) the adaptive card height; rebuilds row metrics once. */
  setRowHeightOverride(height: number | null): void {
    if (height === this.rowHeightOverride) return;
    this.rowHeightOverride = height;
    this.metricsFor = null;
    if (this.sync()) this.emit();
    this.applyDom();
  }

  /** Header rows (stacked header depth plus the filter bar); they shrink the body extent. */
  private headerRows = 1;

  setHeaderRows(count: number): void {
    if (count === this.headerRows) return;
    this.headerRows = count;
    this.updateMapping();
    if (this.computeRanges()) this.emit();
  }

  /** Frozen-edge shadows: `data-scrolled-start` / `data-scrolled-end` on the viewport, written only when they flip. */
  private edges = { start: false, end: false };

  private applyEdges(): void {
    const vp = this.viewport;
    const layout = this.columnLayout;
    if (!vp || !layout) return;
    const start = this.scrollLeft > 0;
    const end = this.scrollLeft < layout.totalWidth - this.viewportWidth - 1;
    if (start !== this.edges.start) {
      this.edges.start = start;
      vp.toggleAttribute('data-scrolled-start', start);
    }
    if (end !== this.edges.end) {
      this.edges.end = end;
      vp.toggleAttribute('data-scrolled-end', end);
    }
  }

  centerExtent(): number {
    const layout = this.columnLayout;
    return Math.max(0, this.viewportWidth - (layout ? layout.leftWidth + layout.rightWidth + layout.indentWidth : 0));
  }

  /** Sticky footer aggregate rows below the body; they cover the last body rows. */
  setFooterRows(count: number): void {
    if (count === this.footerRows) return;
    this.footerRows = count;
    this.updateMapping();
    if (this.computeRanges()) this.emit();
  }

  // ------------------------------------------------------------------------
  // Derivation
  // ------------------------------------------------------------------------

  /** Brings every derived value up to date. Returns true when the rendered window or view changed. */
  private sync(): boolean {
    const snap = this.engine.getSnapshot();
    const columnsState = snap.modules['columns'] as ColumnsState;
    const lf = this.layoutFor;
    const indent = indentLevels(snap as never);
    this.indent = indent;
    let layoutChanged = false;
    if (
      !lf ||
      lf.columns !== snap.columns ||
      lf.state !== columnsState ||
      lf.auto !== this.autoWidthsVersion ||
      lf.indent !== indent ||
      lf.fit !== this.fitColumns ||
      (lf.width !== this.viewportWidth && (this.fitColumns || this.hasPercentColumns(snap.columns)))
    ) {
      const next = this.buildColumnLayout(snap.columns, columnsState, this.viewportWidth, false, indent);
      const previous = this.columnLayout ?? this.getServerColumnLayout();
      const kept = sameLayout(previous, next);
      layoutChanged = !kept && this.columnLayout !== null;
      this.columnLayout = kept ? previous : next;
      this.layoutFor = { columns: snap.columns, state: columnsState, width: this.viewportWidth, auto: this.autoWidthsVersion, indent, fit: this.fitColumns };
      const widths = snap.columns.center.map((c) => (this.columnLayout as ColumnLayout).widths.get(c.columnId) ?? this.config.defaultColumnWidth);
      this.centerMetrics = createColumnMetrics(widths);
    }
    if (this.metricsFor !== snap.rows) {
      this.metrics = this.buildRowMetrics(snap.rows);
      this.metricsFor = snap.rows;
    }
    this.updateMapping();
    // A width-only change (viewport-driven fit or percent widths) must also notify.
    return this.computeRanges() || layoutChanged;
  }

  private mappingKey = { total: -1, extent: -1 };

  private updateMapping(): void {
    const total = this.metrics.totalHeight;
    const extent = this.bodyExtent();
    if (total === this.mappingKey.total && extent === this.mappingKey.extent) return;
    this.mappingKey = { total, extent };
    this.mapping = createScrollMapping(total, extent, this.config.maxScrollHeight);
  }

  private computeRanges(): boolean {
    const snap = this.engine.getSnapshot();
    const count = snap.rows.count;
    const columns = snap.columns;
    let rowRange: VirtualRange;
    let colRange: VirtualRange;
    if (!this.measured) {
      // Deterministic initial range until the viewport is measured (matches the server).
      const initial = getDataGridInitialRange({
        rowCount: count,
        centerColumnCount: columns.center.length,
        initialRows: this.config.initialRows,
        initialColumns: this.config.initialColumns,
      });
      rowRange = this.config.virtualRows ? initial.rows : fullRange(count);
      colRange = this.config.virtualColumns ? { ...initial.columns, end: this.initialColumnEnd(columns), overscanEnd: this.initialColumnEnd(columns) } : fullRange(columns.center.length);
    } else {
      rowRange = this.config.virtualRows
        ? computeRange(this.metrics, this.currentVirtual(), this.bodyExtent(), this.config.rowOverscan)
        : fullRange(count);
      colRange = this.config.virtualColumns
        ? computeRange(this.centerMetrics, this.scrollLeft, this.centerExtent(), this.config.columnOverscan)
        : fullRange(columns.center.length);
    }
    this.rowRange = rowRange;
    this.colRange = colRange;
    let changed = false;
    const rw = this.rowWindow;
    if (rw.start !== rowRange.overscanStart || rw.end !== rowRange.overscanEnd || rw.count !== count || rw.model !== snap.rows) {
      // Reuse the server object when equal so hydration is followed by no extra commit.
      const server = this.getServerRowWindow();
      this.rowWindow =
        server.start === rowRange.overscanStart && server.end === rowRange.overscanEnd && server.count === count && server.model === snap.rows
          ? server
          : Object.freeze({ start: rowRange.overscanStart, end: rowRange.overscanEnd, count, model: snap.rows });
      changed = true;
    }
    const offset = this.centerMetrics.offsetOf(colRange.overscanStart);
    const vf = this.viewFor;
    const indent = this.indent;
    if (!vf || vf.columns !== columns || vf.start !== colRange.overscanStart || vf.end !== colRange.overscanEnd || vf.offset !== offset || vf.indent !== indent) {
      const server = this.getServerColumnView();
      const serverColumns = this.engine.getServerSnapshot().columns;
      this.columnView =
        serverColumns === columns &&
        server.centerStart === colRange.overscanStart &&
        server.centerStart + server.center.length === colRange.overscanEnd &&
        server.offsetLeft === offset &&
        server.indent === indent
          ? server
          : this.buildView(columns, colRange.overscanStart, colRange.overscanEnd, offset, indent);
      this.viewFor = { columns, start: colRange.overscanStart, end: colRange.overscanEnd, offset, indent };
      changed = true;
    }
    return changed;
  }

  private initialColumnEnd(columns: ColumnSnapshot<Row>): number {
    if (!this.config.virtualColumns) return columns.center.length;
    return getDataGridInitialRange({ rowCount: 0, centerColumnCount: columns.center.length, initialColumns: this.config.initialColumns }).columns.end;
  }

  private buildView(columns: ColumnSnapshot<Row>, start: number, end: number, offsetLeft: number, indent: number): ColumnView<Row> {
    return Object.freeze({
      left: columns.left,
      center: start === 0 && end === columns.center.length ? columns.center : Object.freeze(columns.center.slice(start, end)),
      right: columns.right,
      centerStart: start,
      centerCount: columns.center.length,
      offsetLeft,
      indent,
      ...(columns.fixed.length ? { fixed: fixedView(columns, start, end) } : {}),
    });
  }

  private buildRowMetrics(model: RowModelSnapshot<Row>): RowMetrics {
    const { getRowHeight, measureRows, rowHeight } = this.config;
    const view = model.view;
    this.sparse = false;
    const card = this.rowHeightOverride;
    const estimatedRowHeight = card ?? this.config.estimatedRowHeight;
    if (card !== null && !measureRows) {
      // Adaptive cards: fixed card height for data rows; captions and footers keep the row height.
      if (view) return createVariableRowMetrics(model.count, (i) => (view.kindAt(i) === 'data' ? card : rowHeight));
      return createFixedRowMetrics(model.count, card);
    }
    if (view) {
      const heights = this.measuredHeights;
      if (!measureRows && !getRowHeight) {
        // Detail rows: fixed rows plus a Fenwick tree over the k detail heights, O(k) to build.
        // Pinned rows in front of a detail view shift its detail positions.
        const shift = view.kind === 'pinned' && view.inner?.kind === 'detail' ? view.count - view.inner.count : 0;
        const detailView = view.kind === 'detail' ? view : shift > 0 ? view.inner : null;
        if (detailView) {
          const detail = detailView as DetailView;
          const estimate = detailEstimate(this.engine as DataGridEngine<unknown>);
          this.sparse = true;
          const rows = shift > 0 ? { detailCount: detail.detailCount, detailIndex: (j: number) => detail.detailIndex(j) + shift } : detail;
          return createSparseRowMetrics(model.count, rowHeight, rows, (j) => heights.get(detailRowId(detail.detailParentAt(j))) ?? estimate);
        }
        // Grouped model: captions and footers use the row height.
        return createFixedRowMetrics(model.count, rowHeight);
      }
      const estimate = view.kind === 'detail' || view.inner?.kind === 'detail' ? detailEstimate(this.engine as DataGridEngine<unknown>) : 0;
      return createVariableRowMetrics(model.count, (i) => {
        const id = view.idAt(i);
        const measured = id === undefined ? undefined : heights.get(id);
        if (measured !== undefined) return measured;
        const kind = view.kindAt(i);
        if (kind === 'detail') return estimate;
        if (getRowHeight && kind === 'data') {
          const row = this.engine.getRowAt(i);
          const h = row === undefined ? rowHeight : getRowHeight(row);
          return h > 0 ? h : rowHeight;
        }
        return measureRows ? estimatedRowHeight : rowHeight;
      });
    }
    if (measureRows) {
      const heights = this.measuredHeights;
      const ids = model.sourceIds;
      const order = model.order;
      return createVariableRowMetrics(model.count, (i) => {
        const id = ids[order === null ? i : (order[i] as number)] as RowId;
        return heights.get(id) ?? estimatedRowHeight;
      });
    }
    if (getRowHeight) {
      const rows = model.source;
      const order = model.order;
      return createVariableRowMetrics(model.count, (i) => {
        const h = getRowHeight(rows[order === null ? i : (order[i] as number)] as Row);
        return h > 0 ? h : rowHeight;
      });
    }
    return createFixedRowMetrics(model.count, rowHeight);
  }

  private hasPercentColumns(columns: ColumnSnapshot<Row>): boolean {
    return columns.visible.some((c) => typeof c.width.initial === 'string' && c.width.initial.endsWith('%'));
  }

  /** Resolves every visible leaf to px: user width, then definition, then content fit, then default. */
  resolveWidth(column: CompiledColumn<Row>, state: ColumnsState | undefined, viewportWidth: number, server: boolean): number {
    const user = state?.widths[column.columnId];
    if (user !== undefined) return clampColumnWidth(column, user);
    const def = column.def.width;
    let px: number;
    if (def === undefined) px = this.config.defaultColumnWidth;
    else if (def === 'auto') px = (!server && this.autoWidths.get(column.columnId)) || this.config.defaultColumnWidth;
    else if (typeof def === 'number') px = def;
    else px = (!server && viewportWidth > 0 ? resolveColumnWidth(column.width, viewportWidth) : null) ?? this.config.defaultColumnWidth;
    return clampColumnWidth(column, px);
  }

  private buildColumnLayout(
    columns: ColumnSnapshot<Row>,
    state: ColumnsState | undefined,
    viewportWidth: number,
    server: boolean,
    indent: number,
    resizing?: { readonly columnId: ColumnId; readonly width: number },
  ): ColumnLayout {
    const widths = new Map<ColumnId, number>();
    const cssVars: Record<string, string> = {};
    const indentWidth = indent * this.config.indentWidth;
    const visible = [...columns.left, ...columns.center, ...columns.right];
    let resolved = visible.map((col) => (resizing?.columnId === col.columnId ? resizing.width : this.resolveWidth(col, state, viewportWidth, server)));
    if (this.fitColumns && !server && viewportWidth > 0) {
      const fitted = fitColumnWidths(
        visible.map((col, i) => ({ width: resolved[i]!, max: col.width.max, flexible: col.flags.allowResizing && col.columnId !== resizing?.columnId })),
        viewportWidth - indentWidth,
      );
      if (fitted) resolved = fitted;
    }
    let i = 0;
    const zone = (list: readonly CompiledColumn<Row>[]): number => {
      let total = 0;
      for (const col of list) {
        const w = resolved[i++]!;
        widths.set(col.columnId, w);
        cssVars[widthVar(col.leafIndex)] = `${w}px`;
        total += w;
      }
      return total;
    };
    const leftWidth = zone(columns.left);
    const centerWidth = zone(columns.center);
    const rightWidth = zone(columns.right);
    const totalWidth = leftWidth + centerWidth + rightWidth + indentWidth;
    cssVars['--salmon-data-grid-left-width'] = `${leftWidth}px`;
    cssVars['--salmon-data-grid-center-width'] = `${centerWidth}px`;
    cssVars['--salmon-data-grid-right-width'] = `${rightWidth}px`;
    cssVars['--salmon-data-grid-total-width'] = `${totalWidth}px`;
    if (columns.fixed.length) fixedVars(columns, widths, indentWidth + leftWidth, rightWidth, cssVars);
    if (indent > 0) {
      cssVars['--salmon-data-grid-indent-width'] = `${indentWidth}px`;
      cssVars['--salmon-data-grid-indent-step'] = `${this.config.indentWidth}px`;
    }
    return Object.freeze({ widths, leftWidth, centerWidth, rightWidth, totalWidth, indentWidth, cssVars: Object.freeze(cssVars) });
  }
}

/** Writes a layout's width variables on the grid root (DOM-only drag preview and post-commit sync). */
export function writeLayoutVars(root: HTMLElement, layout: ColumnLayout): void {
  for (const [name, value] of Object.entries(layout.cssVars)) root.style.setProperty(name, value);
}

/** The widths a `resizeMode: 'auto'` pointer resize commits: every visible resizable leaf, as fitted. */
export function fitWidthsOf<Row>(visible: readonly CompiledColumn<Row>[], layout: ColumnLayout): Record<ColumnId, number> {
  const out: Record<ColumnId, number> = {};
  for (const col of visible) {
    const w = layout.widths.get(col.columnId);
    if (w !== undefined && col.flags.allowResizing) out[col.columnId] = w;
  }
  return out;
}

function fullRange(count: number): VirtualRange {
  return { start: 0, end: count, overscanStart: 0, overscanEnd: count };
}

function sameLayout(a: ColumnLayout, b: ColumnLayout): boolean {
  if (a.totalWidth !== b.totalWidth || a.widths.size !== b.widths.size) return false;
  const ka = Object.keys(a.cssVars);
  if (ka.length !== Object.keys(b.cssVars).length) return false;
  for (const k of ka) if (a.cssVars[k] !== b.cssVars[k]) return false;
  return true;
}
