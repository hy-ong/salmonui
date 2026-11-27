// Viewport methods of `DataGridApi`: scrolling by
// offset and the page size
// that fits a height.
// Both read the layout store and, after mount, a few element heights; no
// state, no subscriptions.

import type { RowMetrics, VirtualRange } from '@salmonui/data-grid/engine';
import { isAdaptiveActive } from './adaptive-view.js';
import type { DataGridInstance } from './instance.js';

export interface DataGridScrollToOptions {
  /** Offset from the first body row in px (row offsets as `scrollToRow` uses them; scroll compression is handled). */
  top?: number;
  /** Offset from the inline start of the center (unpinned) columns in px; positive in RTL too. */
  left?: number;
}

/** `api.getViewport()`: body scroll offsets in virtual px, body extent and rendered rows. */
export interface DataGridViewport {
  readonly top: number;
  /** Positive in RTL too. */
  readonly left: number;
  readonly width: number;
  /** Body extent (viewport height without header and footer rows). */
  readonly height: number;
  readonly rows: VirtualRange;
}

export interface DataGridViewApi {
  /** Scroll sync extension point: the current body viewport. */
  getViewport(): DataGridViewport;
  /** Calls `listener` outside React on every body scroll and layout change; returns the unsubscribe function. */
  subscribeViewport(listener: () => void): () => void;
  /** Row height extension point: the row offsets of the visible row model (the body's own prefix sums). */
  getRowOffsets(): RowMetrics;
  /** Scrolls the body to an offset. An omitted axis keeps its position; offsets are clamped to the scroll range. */
  scrollTo(options: DataGridScrollToOptions): void;
  /**
   * Whole data rows that fit in `height` px after the toolbar, group drop
   * area, header rows, footer aggregate rows and pager; 0 when
   * none fit. Rows count `rowHeight` (the estimate with measured rows, the
   * card height in adaptive vertical mode). Before mount only the header
   * and footer rows are subtracted.
   */
  getPageSizeForHeight(height: number): number;
}

const heightOf = (el: Element | null | undefined): number => (el as HTMLElement | null | undefined)?.offsetHeight ?? 0;

export function createViewApi<Row>(instance: DataGridInstance<Row>): DataGridViewApi {
  const { layout } = instance;
  return {
    getViewport() {
      const { top, left } = layout.getScroll();
      const viewport = instance.getViewport();
      return Object.freeze({ top: layout.getScrollMapping().toVirtual(top), left: Math.abs(left), width: viewport?.clientWidth ?? 0, height: layout.bodyExtent(), rows: layout.getRanges().rows });
    },
    subscribeViewport(listener) {
      layout.scrolls.add(listener);
      const off = layout.subscribe(listener);
      return () => {
        layout.scrolls.delete(listener);
        off();
      };
    },
    getRowOffsets: () => layout.getRowMetrics(),
    scrollTo({ top, left }) {
      const viewport = instance.getViewport();
      if (!viewport) return;
      // The mapping clamps to the scroll range; the browser clamps scrollLeft.
      if (top !== undefined) viewport.scrollTop = layout.getScrollMapping().toPhysical(top);
      if (left !== undefined) viewport.scrollLeft = instance.rtl ? -left : left;
    },
    getPageSizeForHeight(height) {
      const root = instance.root;
      const viewport = instance.getViewport();
      let chrome = layout.chromeExtent();
      if (root && viewport) {
        // Inside the root: all but the viewport's row area (group drop area, borders, horizontal scrollbar, header and footer rows).
        chrome += root.offsetHeight - viewport.clientHeight;
        // Siblings: the adaptive bar and the toolbar before the root, the pager after it.
        let prev = root.previousElementSibling;
        if (isAdaptiveActive(instance)) {
          chrome += heightOf(prev);
          prev = prev?.previousElementSibling ?? null;
        }
        if (instance.props.toolbar?.length || instance.props.renderToolbar) chrome += heightOf(prev);
        if (instance.query.pagingState()) chrome += heightOf(root.nextElementSibling);
      }
      const row = layout.dataRowHeight();
      return height > chrome ? Math.floor((height - chrome) / row + 1e-6) : 0;
    },
  };
}
