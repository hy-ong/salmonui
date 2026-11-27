// The remote tree adapter chunk of the `tree` render feature,
// loaded by tree-ui.tsx on the first read of a remote tree. It imports the
// injected-dependency body (`bindRemoteTree`) so the chunk shares no module
// with the static graph (tree-remote-binder.ts), and holds the root block
// watcher of `infiniteScroll` in tree mode, which only a remote
// tree uses.

import type { RemoteTree } from '@salmonui/data-grid/engine/tree-remote';
import { gridEvent } from '@salmonui/core/internal/events';
import type { DataGridInstance } from './instance.js';
import type { DataGridErrorEvent } from './query-types.js';

export { bindRemoteTree } from '@salmonui/data-grid/engine/tree-remote';

/**
 * `infiniteScroll` in tree mode: the next block of root rows is
 * read when the rendered rows end within `threshold` rows (default half a
 * block) of the last tree row. Runs on the layout's row window changes
 * (never per scroll frame) and after a block lands. Returns the unsubscribe.
 */
export function watchRootBlocks(instance: DataGridInstance<unknown>, remote: RemoteTree<unknown>, inf: { readonly blockSize?: number; readonly threshold?: number }): () => void {
  const { engine, layout } = instance;
  const threshold = inf.threshold ?? Math.ceil((inf.blockSize ?? 100) / 2);
  let live = true;
  const check = (): void => {
    const state = remote.getRootBlocks();
    if (!live || engine.disposed || !layout.measured || !state.hasMore || state.loading) return;
    if (layout.getRanges().rows.overscanEnd + threshold < engine.getSnapshot().rows.count) return;
    remote.loadMoreRoots().then(
      (appended) => {
        if (appended) check();
      },
      (error: unknown) => {
        const onError = instance.props.onError;
        if (live && onError) onError(gridEvent<DataGridErrorEvent>('error', 'api', { error: error instanceof Error ? error : new Error(String(error)), action: 'data' } as never));
      },
    );
  };
  const offLayout = layout.subscribe(check);
  // The first blocks may not fill the viewport.
  const offRows = engine.subscribe(check);
  return () => {
    live = false;
    offLayout();
    offRows();
  };
}

/** Chunking hub: keeps the static graph in one chunk. Never called. */
export { DataGrid as hub } from './DataGrid.js';
