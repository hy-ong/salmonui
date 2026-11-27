// Lazy render feature registry (`#data-grid-features` under the `browser`
// condition). Holds one `import()` loader
// per feature and a module-level load cache: one promise per feature module
// and one status-tagged thenable per sorted set of missing names, so a render
// after the load settles reads synchronously. Like `loadEditChunk()` the
// cache is a load cache, not render state: renders read it only through
// `readFeatures`. Each feature has its loader here and its import in
// registry-static.ts.

import { DEV, warnOnce } from '@salmonui/core/internal/dev';
import { mergeFeatures, missingFeatures } from './inert.js';
import type { DataGridFeature, DataGridFeatureName, DataGridFeatureThenable, ReadFeatures } from './types.js';

const LOADERS: Partial<Record<DataGridFeatureName, () => Promise<DataGridFeature>>> = {
  paging: () => import('./feature-paging.js').then((m) => m.paging),
  detail: () => import('./feature-detail.js').then((m) => m.detail),
  search: () => import('./feature-search.js').then((m) => m.search),
  toolbar: () => import('./feature-toolbar.js').then((m) => m.toolbar),
  rowPinning: () => import('./feature-row-pinning.js').then((m) => m.rowPinning),
  lookup: () => import('./feature-lookup.js').then((m) => m.lookup),
  persistState: () => import('./feature-persist-state.js').then((m) => m.persistState),
  adaptive: () => import('./feature-adaptive.js').then((m) => m.adaptive),
  infiniteScroll: () => import('./feature-infinite-scroll.js').then((m) => m.infiniteScroll),
  spans: () => import('./feature-spans.js').then((m) => m.spans),
  grouping: () => import('./feature-grouping.js').then((m) => m.grouping),
  aggregates: () => import('./feature-aggregates.js').then((m) => m.aggregates),
  editing: () => import('./feature-editing.js').then((m) => m.editing),
  rowDrag: () => import('./feature-row-drag.js').then((m) => m.rowDrag),
  tree: () => import('./feature-tree.js').then((m) => m.tree),
};

/**
 * Interaction chunks a feature warms in parallel with its own load (the
 * feature's `warm` list, known before the feature module arrives): the
 * same modules the hosts' `loadEditChunk()` / `loadRowDragChunk()` import,
 * so the browser fetches each once.
 */
const WARM: Readonly<Partial<Record<DataGridFeatureName, readonly (() => Promise<unknown>)[]>>> = Object.freeze({
  editing: [() => import('../editing/edit-chunk.js')],
  rowDrag: [() => import('../row-drag-chunk.js')],
});

const loaded = new Map<DataGridFeatureName, DataGridFeature>();
const loading = new Map<DataGridFeatureName, Promise<DataGridFeature>>();
const sets = new Map<string, DataGridFeatureThenable>();

function loadOne(name: DataGridFeatureName): Promise<DataGridFeature> {
  let promise = loading.get(name);
  if (promise) return promise;
  const loader = LOADERS[name];
  promise = loader
    ? loader().then((feature) => {
        loaded.set(name, feature);
        return feature;
      })
    : Promise.reject(new Error(`DataGrid: no loader for render feature "${name}".`));
  loading.set(name, promise);
  return promise;
}

function loadSet(key: string, missing: readonly DataGridFeatureName[], needed: readonly DataGridFeatureName[]): DataGridFeatureThenable {
  for (const name of needed) for (const warm of WARM[name] ?? []) void warm().catch(() => undefined);
  const thenable = Promise.all(missing.map(loadOne)) as DataGridFeatureThenable;
  thenable.status = 'pending';
  thenable.then(
    (value) => {
      thenable.status = 'fulfilled';
      thenable.value = value;
    },
    (reason: unknown) => {
      thenable.status = 'rejected';
      thenable.reason = reason;
      // Evict, so the next creation (a remount) retries.
      if (sets.get(key) === thenable) sets.delete(key);
      for (const name of missing) if (!loaded.has(name)) loading.delete(name);
      if (DEV) globalThis.console?.error?.(`[salmonui] DataGrid: the render feature chunk failed to load (${missing.join(', ')}).`, reason);
    },
  );
  sets.set(key, thenable);
  return thenable;
}

/**
 * The features for `needed`, with `provided` merged in (the provided object
 * wins): an array when every needed name is provided or was loaded for
 * another set, else the thenable of the missing set (every missing load
 * started in parallel; its value is the missing features, the caller merges
 * `provided`). The thenable of a set stays cached once fulfilled, so a
 * render after it settles reads it synchronously through `use`.
 */
export const readFeatures: ReadFeatures = (needed, provided) => {
  if (DEV && typeof document === 'undefined') {
    warnOnce(
      'lazy-feature-registry-on-server',
      'DataGrid: the lazy render feature registry was reached during a server render; the bundler resolved `#data-grid-features` with the `browser` condition for a server build, so the server renders a placeholder. Resolve it without `browser` on the server.',
    );
  }
  for (const f of provided ?? []) if (!loaded.has(f.name)) for (const warm of f.warm ?? []) void warm().catch(() => undefined);
  const missing = missingFeatures(needed, provided);
  if (!missing.length) return mergeFeatures(needed, provided, NOT_LOADED);
  // A set that was ever requested keeps its thenable (fulfilled ones read synchronously through `use`), so a gate
  // that suspended on it calls `use` again when it retries, as React requires.
  const key = missing.join(',');
  const known = sets.get(key);
  if (known) return known;
  if (missing.every((name) => loaded.has(name))) return mergeFeatures(needed, provided, (name) => loaded.get(name));
  return loadSet(key, missing, needed);
};

const NOT_LOADED = (): undefined => undefined;

/**
 * Test seam (lazy registry unit tests, not a public entry): replaces one loader and
 * clears the cache; returns the restore function.
 */
export function overrideFeatureLoader(name: DataGridFeatureName, loader: () => Promise<DataGridFeature>): () => void {
  const previous = LOADERS[name];
  LOADERS[name] = loader;
  loaded.clear();
  loading.clear();
  sets.clear();
  return () => {
    if (previous) LOADERS[name] = previous;
    else delete LOADERS[name];
    loaded.clear();
    loading.clear();
    sets.clear();
  };
}
