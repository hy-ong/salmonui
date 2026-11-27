// Static Gantt module registry (`#gantt-modules` on the server, in workers
// and by default; modules.ts): every module is imported, so a server render
// never suspends. The browser resolves registry-lazy.ts instead.

import * as critical from '../internal/timeline/project/critical.js';
import * as adaptive from './adaptive.js';
import * as loading from './loading.js';
import type { GanttModules, PeekGanttModules, ReadGanttModules } from './modules.js';
import * as resources from './resource-view.js';
import * as remote from './remote.js';
import * as toolbar from './toolbar.js';

const ALL: GanttModules = Object.freeze({ resources, toolbar, critical, remote, adaptive, loading });

export const readGanttModules: ReadGanttModules = () => ALL;
export const peekGanttModules: PeekGanttModules = () => ALL;
