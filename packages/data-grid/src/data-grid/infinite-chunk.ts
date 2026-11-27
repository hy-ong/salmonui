// The lazy infinite scroll chunk: the
// core module (block store, request scheduling, eviction, write echoes),
// loaded when a grid with `infiniteScroll` mounts on the client, and the
// scroll-driven append of lazy group children (`watchLazyGroups`).
import { createInfiniteScrollModule, lazyGroupsToAppend, type InfiniteScrollModule } from '@salmonui/data-grid/engine/infinite';
import type { DataGridInfiniteScroll } from './infinite-types.js';
import type { DataGridInstance } from './instance.js';

/** The core module for the `infiniteScroll` prop settings. */
export function createModule<Row>(o: DataGridInfiniteScroll<Row>): InfiniteScrollModule<Row> {
  const seed = o.initialResult;
  return createInfiniteScrollModule<Row>({
    ...(o.blockSize !== undefined ? { blockSize: o.blockSize } : {}),
    ...(o.initialBlocks !== undefined ? { initialBlocks: o.initialBlocks } : {}),
    ...(o.cache !== undefined ? { cache: o.cache } : {}),
    ...(o.maxBlocks !== undefined ? { maxBlocks: o.maxBlocks } : {}),
    ...(o.threshold !== undefined ? { threshold: o.threshold } : {}),
    ...(o.debounce !== undefined ? { debounceMs: o.debounce } : {}),
    ...(seed
      ? {
          initialResult: {
            rows: seed.rows,
            ...(seed.totalRowCount !== undefined ? { totalRowCount: seed.totalRowCount } : {}),
            ...(seed.hasNextPage !== undefined ? { pageInfo: { hasNextPage: seed.hasNextPage } } : {}),
          },
        }
      : {}),
  });
}

/**
 * Scroll-driven lazy group loading: with lazy grouping the
 * core module yields the reads, and a group's next chunk is appended when
 * its loaded rows end within `threshold` rows (default half a block) below
 * the rendered window. The returned check runs on the viewport's layout
 * notifications (row window or row model changes, never per scroll frame)
 * and is a no-op while the identity of both is unchanged; the load starts
 * outside the notification (one microtask later).
 */
export function watchLazyGroups(instance: DataGridInstance<unknown>, o: DataGridInfiniteScroll<unknown>): () => void {
  const { engine, layout } = instance;
  const threshold = o.threshold ?? Math.floor((o.blockSize ?? 100) / 2);
  let view: unknown = null;
  let start = -1;
  let end = -1;
  let queued = false;
  const run = (): void => {
    queued = false;
    if (engine.disposed) return;
    for (const group of lazyGroupsToAppend(engine.getSnapshot().rows.view, start, end, threshold)) engine.dispatch({ type: 'grouping.loadMore', group });
  };
  return () => {
    const rows = layout.getRanges().rows;
    const current = engine.getSnapshot().rows.view;
    if (current === view && rows.overscanStart === start && rows.overscanEnd === end) return;
    view = current;
    start = rows.overscanStart;
    end = rows.overscanEnd;
    if (!queued && (current?.kind === 'lazyGrouped' || current?.inner)) {
      queued = true;
      void Promise.resolve().then(run);
    }
  };
}

/** Chunking hub: keeps the static graph in one chunk. Never called. */
export { DataGrid as hub } from './DataGrid.js';
