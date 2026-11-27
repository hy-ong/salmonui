'use client';
import { expectStylesheet } from '@salmonui/core/internal/dev';

// `@salmonui/gantt`:
// `Gantt`, its locale catalog and types. The grid pane is `DataGrid` in tree
// mode through its public extension points; dialogs, menus and export are
// lazy chunks. CSS: `@salmonui/gantt/styles.css` (with the Data Grid
// stylesheet).

export { Gantt } from './gantt/Gantt.js';
export { GANTT_DEFAULT_LOCALE_TEXT } from './gantt/locale.js';
export type { GanttLocaleKey, GanttLocaleText } from './gantt/locale.js';
export type * from './gantt/types.js';
export { parseDependencies } from './internal/timeline/project/dependencies.js';

// Development: warns once when this family renders without its stylesheet. A textual
// NODE_ENV test, so production bundles drop the call even across chunks.
declare const process: { readonly env: { readonly NODE_ENV?: string } };
if (process.env.NODE_ENV !== 'production') expectStylesheet('@salmonui/gantt', 'salmon-gantt');
