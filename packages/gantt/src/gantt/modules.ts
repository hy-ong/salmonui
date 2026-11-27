// Gantt render modules read through `#gantt-modules` (the Scheduler `#scheduler-views` pattern):
// the resource view and multi-taskbar rows, the toolbar and the critical
// path pass, the remote writer, the adaptive pane switch and the loading placeholders. The server resolves registry-static.ts (every module, so a
// server render never suspends and renders the full markup); the browser
// resolves registry-lazy.ts (one chunk per module, loaded when a prop needs
// it; hydration waits for it).

export type GanttModuleName = 'resources' | 'toolbar' | 'critical' | 'remote' | 'adaptive' | 'loading';

export interface GanttModules {
  readonly resources?: typeof import('./resource-view.js');
  readonly toolbar?: typeof import('./toolbar.js');
  readonly critical?: typeof import('../internal/timeline/project/critical.js');
  readonly remote?: typeof import('./remote.js');
  readonly adaptive?: typeof import('./adaptive.js');
  readonly loading?: typeof import('./loading.js');
}

export type GanttModulesThenable = Promise<GanttModules> & { status?: 'pending' | 'fulfilled' | 'rejected'; value?: GanttModules; reason?: unknown };

/** The modules, or a thenable while some are loading (read with `use`). */
export type ReadGanttModules = (needed: readonly GanttModuleName[]) => GanttModules | GanttModulesThenable;
/** The modules loaded so far (synchronous). */
export type PeekGanttModules = () => GanttModules;
