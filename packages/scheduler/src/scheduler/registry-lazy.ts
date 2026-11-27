// Lazy view family registry (`#scheduler-views` under the `browser`
// condition, the Data Grid
// `#data-grid-features` pattern): one
// `import()` per family and a module-level load cache (one promise per
// family, one status-tagged thenable per sorted set of missing families), so
// a render after the load settles reads synchronously and a view that
// suspended in `use` reads the same thenable on its retry. A load cache, not
// render state: renders read it only through `readViews`.

import type { PeekViews, ReadViews, ViewFamily, ViewModules, ViewModulesThenable } from './families.js';

const LOADERS: Readonly<Record<ViewFamily, () => Promise<unknown>>> = {
  timeline: () => import('./timeline.js'),
  list: () => import('./list.js'),
  resources: () => import('./grouping.js'),
};

const loaded: Partial<Record<ViewFamily, unknown>> = {};
const loading = new Map<ViewFamily, Promise<unknown>>();
const sets = new Map<string, ViewModulesThenable>();

const load = (name: ViewFamily): Promise<unknown> => {
  let p = loading.get(name);
  if (!p) {
    p = LOADERS[name]().then((m) => (loaded[name] = m));
    loading.set(name, p);
  }
  return p;
};

export const peekViews: PeekViews = () => loaded as ViewModules;

export const readViews: ReadViews = (needed) => {
  // A set that was ever requested keeps its thenable (read synchronously once fulfilled), so a view that
  // suspended on it calls `use` again on its retry, as React requires.
  const key = [...needed].sort().join();
  let t = sets.get(key);
  const missing = needed.filter((n) => !loaded[n]);
  if (!t && !missing.length) return loaded as ViewModules;
  if (!t) {
    const p = Promise.all(missing.map(load)).then(() => loaded as ViewModules) as ViewModulesThenable;
    p.status = 'pending';
    p.then(
      (v) => {
        p.status = 'fulfilled';
        p.value = v;
      },
      (e: unknown) => {
        p.status = 'rejected';
        p.reason = e;
        // Evict, so a remount retries.
        sets.delete(key);
        for (const n of missing) if (!loaded[n]) loading.delete(n);
      },
    );
    sets.set(key, p);
    t = p;
  }
  return t;
};

/** Starts loading families (idle preload after mount); never throws. */
export const preloadViews = (names: readonly ViewFamily[]): void => {
  for (const n of names) void load(n).catch(() => undefined);
};
