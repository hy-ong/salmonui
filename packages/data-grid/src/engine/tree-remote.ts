// Entry `./tree-remote.js`: the remote tree adapter, over `./tree`. Local
// trees never load it; the React tree feature loads `bindRemoteTree` lazily,
// for remote data only. The adapter itself is tree-remote-binder.ts.

import { serializeDataGridQuery } from './query.js';
import { createTreeModule } from './tree.js';
import { bindRemoteTree, type RemoteTree, type RemoteTreeOptions } from './tree-remote-binder.js';
import type { DataSource } from './types.js';

export { bindRemoteTree } from './tree-remote-binder.js';
export type { RemoteTree, RemoteTreeDeps, RemoteTreeEnvelope, RemoteTreeError, RemoteTreeOptions, RemoteTreeRootBlocks } from './tree-remote-binder.js';

/**
 * Adapts a remote source with tree reads (`read({ parentRowId })`) to tree
 * mode. Register `module(treeOptions)` and read through `dataSource`.
 */
export function createRemoteTree<Row>(source: DataSource<Row>, options: RemoteTreeOptions<Row>): RemoteTree<Row> {
  return bindRemoteTree(source, options, { createTreeModule, serializeDataGridQuery });
}
