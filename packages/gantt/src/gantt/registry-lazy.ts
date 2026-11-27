// Lazy Gantt module registry (`#gantt-modules` under the `browser`
// condition; modules.ts, the Scheduler registry-lazy.ts model): one
// `import()` per module and a module-level load cache (one promise per
// module, one status-tagged thenable per sorted set of missing modules), so
// a render after the load settles reads synchronously and a render that
// suspended in `use` reads the same thenable on its retry. A load cache, not
// render state: renders read it only through `readGanttModules` /
// `peekGanttModules`.

import type { GanttModuleName, GanttModules, GanttModulesThenable, PeekGanttModules, ReadGanttModules } from './modules.js';

const LOADERS: Readonly<Record<GanttModuleName, () => Promise<unknown>>> = {
  resources: () => import('./resource-view.js'),
  toolbar: () => import('./toolbar.js'),
  critical: () => import('../internal/timeline/project/critical.js'),
  remote: () => import('./remote.js'),
  adaptive: () => import('./adaptive.js'),
  loading: () => import('./loading.js'),
};

const loaded: Partial<Record<GanttModuleName, unknown>> = {};
const loading = new Map<GanttModuleName, Promise<unknown>>();
const sets = new Map<string, GanttModulesThenable>();

const load = (name: GanttModuleName): Promise<unknown> => {
  let p = loading.get(name);
  if (!p) {
    p = LOADERS[name]().then((m) => (loaded[name] = m));
    loading.set(name, p);
  }
  return p;
};

export const peekGanttModules: PeekGanttModules = () => loaded as GanttModules;

export const readGanttModules: ReadGanttModules = (needed) => {
  const key = [...needed].sort().join();
  let t = sets.get(key);
  const missing = needed.filter((n) => !loaded[n]);
  if (!t && !missing.length) return loaded as GanttModules;
  if (!t) {
    const p = Promise.all(missing.map(load)).then(() => loaded as GanttModules) as GanttModulesThenable;
    p.status = 'pending';
    p.then(
      (v) => {
        p.status = 'fulfilled';
        p.value = v;
      },
      (e: unknown) => {
        p.status = 'rejected';
        p.reason = e;
        sets.delete(key);
        for (const n of missing) if (!loaded[n]) loading.delete(n);
      },
    );
    sets.set(key, p);
    t = p;
  }
  return t;
};
