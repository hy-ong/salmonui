// Page layout and virtualization for PdfViewer. Pure: page boxes
// for each scroll and spread mode, laid out in rows along the scroll axis
// and virtualized with the Data Grid range math (createVariableRowMetrics,
// computeRange from @salmonui/data-grid/engine).
import { computeRange, createVariableRowMetrics, type VariableRowMetrics } from '@salmonui/core/virtual';
import type { PdfPageSize, PdfViewerScrollMode, PdfViewerSpreadMode } from './types.js';
import { PAGE_GAP, PDF_TO_CSS, VIEW_PADDING } from './zoom.js';

export interface PageBox {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface LayoutRow {
  readonly pages: readonly number[];
  /** Extent along the scroll axis, gap included. */
  readonly extent: number;
}

export interface ViewerLayout {
  readonly axis: 'x' | 'y';
  readonly mode: PdfViewerScrollMode;
  readonly boxes: readonly PageBox[];
  readonly rows: readonly LayoutRow[];
  /** Row index of every page. */
  readonly rowOf: Int32Array;
  readonly metrics: VariableRowMetrics;
  readonly width: number;
  readonly height: number;
}

export interface LayoutInput {
  readonly sizes: readonly PdfPageSize[];
  readonly scale: number;
  readonly scrollMode: PdfViewerScrollMode;
  readonly spreadMode: PdfViewerSpreadMode;
  /** Viewport width in CSS px (wrapping, centering). */
  readonly viewportWidth: number;
}

/** Groups page indexes into spreads. */
export function spreads(count: number, spreadMode: PdfViewerSpreadMode): number[][] {
  const out: number[][] = [];
  let i = 0;
  if (spreadMode === 'even' && count > 0) out.push([i++]);
  while (i < count) {
    if (spreadMode === 'none' || i + 1 >= count) out.push([i++]);
    else {
      out.push([i, i + 1]);
      i += 2;
    }
  }
  return out;
}

export function computeLayout(input: LayoutInput): ViewerLayout {
  const { sizes, scale, scrollMode } = input;
  const n = sizes.length;
  const k = scale * PDF_TO_CSS;
  const w = (i: number) => Math.round((sizes[i] as PdfPageSize).width * k);
  const h = (i: number) => Math.round((sizes[i] as PdfPageSize).height * k);
  let groups: number[][];
  if (scrollMode === 'horizontal') groups = Array.from({ length: n }, (_, i) => [i]);
  else if (scrollMode === 'wrapped') {
    groups = [];
    const avail = Math.max(1, input.viewportWidth - 2 * VIEW_PADDING);
    let row: number[] = [];
    let width = 0;
    for (let i = 0; i < n; i++) {
      const next = width + (row.length ? PAGE_GAP : 0) + w(i);
      if (row.length && next > avail) {
        groups.push(row);
        row = [];
        width = 0;
      }
      width += (row.length ? PAGE_GAP : 0) + w(i);
      row.push(i);
    }
    if (row.length) groups.push(row);
  } else groups = spreads(n, input.spreadMode);

  const axis = scrollMode === 'horizontal' ? 'x' : 'y';
  const rowOf = new Int32Array(n);
  const rows: LayoutRow[] = groups.map((pages, r) => {
    for (const p of pages) rowOf[p] = r;
    const along = axis === 'x' ? Math.max(...pages.map(w)) : Math.max(...pages.map(h));
    return { pages, extent: along + PAGE_GAP };
  });
  const metrics = createVariableRowMetrics(rows.length, (r) => (rows[r] as LayoutRow).extent);
  const cross = (row: LayoutRow) => (axis === 'x' ? Math.max(...row.pages.map(h)) : row.pages.reduce((s, p, j) => s + w(p) + (j ? PAGE_GAP : 0), 0));
  const maxCross = rows.reduce((m, row) => Math.max(m, cross(row)), 0);
  const boxes: PageBox[] = new Array(n);
  const single = scrollMode === 'page';
  if (axis === 'y') {
    const inner = Math.max(input.viewportWidth, maxCross + 2 * VIEW_PADDING);
    rows.forEach((row, r) => {
      let x = (inner - cross(row)) / 2;
      const y = VIEW_PADDING + (single ? 0 : metrics.offsetOf(r));
      for (const p of row.pages) {
        boxes[p] = { x: Math.round(x), y, width: w(p), height: h(p) };
        x += w(p) + PAGE_GAP;
      }
    });
    const along = single ? rows.reduce((m, row) => Math.max(m, row.extent), 0) : metrics.totalHeight;
    return { axis, mode: scrollMode, boxes, rows, rowOf, metrics, width: inner, height: along - PAGE_GAP + 2 * VIEW_PADDING };
  }
  rows.forEach((row, r) => {
    const p = row.pages[0] as number;
    boxes[p] = { x: VIEW_PADDING + metrics.offsetOf(r), y: VIEW_PADDING + (maxCross - h(p)) / 2, width: w(p), height: h(p) };
  });
  return { axis, mode: scrollMode, boxes, rows, rowOf, metrics, width: metrics.totalHeight - PAGE_GAP + 2 * VIEW_PADDING, height: maxCross + 2 * VIEW_PADDING };
}

export interface VisiblePages {
  /** Rendered pages (overscan included), ascending. */
  readonly pages: readonly number[];
  /** The page the reader is on (0-based). */
  readonly current: number;
}

/**
 * Pages to render for a scroll position. `offset` and `extent` are along the
 * layout axis; `pageRow` is the current row in `'page'` mode.
 */
export function visiblePages(layout: ViewerLayout, offset: number, extent: number, overscan = 1, pageRow = 0): VisiblePages {
  const n = layout.rows.length;
  if (n === 0) return { pages: [], current: 0 };
  if (layout.mode === 'page') {
    const r = Math.min(n - 1, Math.max(0, pageRow));
    const row = layout.rows[r] as LayoutRow;
    return { pages: row.pages, current: row.pages[0] as number };
  }
  const range = computeRange(layout.metrics, offset - VIEW_PADDING, Math.max(1, extent), overscan);
  const pages: number[] = [];
  for (let r = range.overscanStart; r < range.overscanEnd; r++) pages.push(...(layout.rows[r] as LayoutRow).pages);
  // The current page: the row under the first third of the viewport, or the last row at the end.
  const total = layout.axis === 'x' ? layout.width : layout.height;
  const atEnd = offset + extent >= total - 1 && offset > 0;
  const probe = layout.metrics.indexAt(Math.max(0, offset - VIEW_PADDING + extent / 3));
  const row = layout.rows[atEnd ? n - 1 : probe] as LayoutRow;
  return { pages, current: row.pages[0] as number };
}

/** Scroll offset (along the axis) that brings a page to the start of the viewport. */
export function pageOffset(layout: ViewerLayout, page: number): number {
  const box = layout.boxes[page];
  if (!box) return 0;
  return Math.max(0, (layout.axis === 'x' ? box.x : box.y) - VIEW_PADDING / 2);
}
