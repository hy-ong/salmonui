// Public types of the `infiniteScroll` prop, the
// `renderLoadingRow` slot and the `api.engine.infiniteScroll`
// façade. Type-only imports of the optional `./infinite` subpath.

import type { DataGridEngine } from '@salmonui/data-grid/engine';
import type { InfiniteScrollFacade, InfiniteScrollStats } from '@salmonui/data-grid/engine/infinite';

/** `infiniteScroll` settings. */
export interface DataGridInfiniteScroll<Row = unknown> {
  /** Keep at most `maxBlocks` blocks of rows in memory. Default false: every loaded block is kept. */
  cache?: boolean;
  /** Blocks of the first request. Default 3. */
  initialBlocks?: number;
  /** Blocks kept with `cache`; never fewer than the viewport needs. Default 3. */
  maxBlocks?: number;
  /** Rows per block and per request unit. Default 100. */
  blockSize?: number;
  /** Rows before the loaded end, and around the viewport, at which a block is requested. Default half a block. */
  threshold?: number;
  /** Quiet time (ms) before requesting a jump target (scrollbar drag) and between sequential requests. Default 50. */
  debounce?: number;
  /**
   * The first blocks, fetched by the app (for example in a server
   * component): rendered on the server and on the first client render, and
   * not requested again. Rows start at row 0.
   */
  initialResult?: { readonly rows: readonly Row[]; readonly totalRowCount?: number; readonly hasNextPage?: boolean };
}

/** Context of `renderLoadingRow`: a row of a block that is loading or failed to load. */
export interface DataGridLoadingRowContext {
  readonly rowIndex: number;
  readonly status: 'loading' | 'error';
  readonly error: unknown;
  /** Retries the failed block load. */
  readonly retry: () => void;
}

/**
 * `api.engine.infiniteScroll`: the `infiniteScroll` module façade.
 * `loadNext()` reads the block after the last loaded row, `retry()` re-reads
 * failed blocks, `reload()` re-reads from the start (`infiniteScroll.loadNext`
 * / `retry` / `reload` through `engine.dispatch`); `getStatus()` is the load
 * state. Until the lazy infinite chunk is installed (right after mount on the
 * client), commands are rejected with `moduleLoading`, `getStats()` and
 * `isRowLoaded()` return undefined and `getStatus()` is the at-rest state.
 */
export type DataGridInfiniteScrollFacade<Row = unknown> = Omit<InfiniteScrollFacade<Row>, 'getStats' | 'isRowLoaded'> & {
  getStats(): InfiniteScrollStats | undefined;
  isRowLoaded(index: number): boolean | undefined;
};

/** `api.engine`: the engine plus the façades of optional modules registered by props. */
export type DataGridApiEngine<Row = unknown> = DataGridEngine<Row> & {
  /** Present with the `infiniteScroll` prop. */
  readonly infiniteScroll?: DataGridInfiniteScrollFacade<Row>;
};
