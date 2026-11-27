// `infiniteScroll` render feature: the host of
// infinite scroll, the stand-in of the core `infiniteScroll` module (seeded
// `initialResult` rows or one loading row at rest, so the server render and
// hydration need no chunk), the viewport wiring installed in mount, and the
// loading row part. The core module stays the lazy `infinite-chunk`.
// Imported only by the registries and the public features entry.

import { createInfiniteUi, DataGridLoadingRow, type DataGridInfiniteUi } from '../infinite-ui.js';
import { DataGrid } from '../DataGrid.js';
import type { DataGridFeature } from './types.js';

// Hand-off from `modules` to `createUi` within one synchronous instance
// construction (both receive the same normalized props object); the entry is
// deleted when it is read, so this is never render state.
const hosts = new WeakMap<object, DataGridInfiniteUi<unknown>>();

export const infiniteScroll: DataGridFeature = Object.freeze({
  name: 'infiniteScroll',
  hub: () => DataGrid,
  modules: (props) => {
    // Tree mode reads root blocks itself (the remote tree adapter's `rootBlocks`, tree-ui.tsx).
    if (props.tree) return [];
    const host = createInfiniteUi<unknown>(props);
    if (!host.module) return [];
    hosts.set(props, host);
    return [host.module];
  },
  createUi: (instance) => {
    const host = hosts.get(instance.props);
    hosts.delete(instance.props);
    return host ? { mount: () => host.mount(instance) } : {};
  },
  parts: Object.freeze({ LoadingRow: DataGridLoadingRow }),
} satisfies DataGridFeature);
