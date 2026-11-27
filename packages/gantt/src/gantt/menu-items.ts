// Context menu items of the Gantt: the Gantt items
// become Data Grid custom items (`gantt:<id>`) of the grid pane's context
// menu, the chart pane opens the same items in its own menu, and Data Grid
// item ids pass through unchanged. The actions are `menu-run.ts`, in the
// lazy popups chunk.

import type { DataGridContextMenuItemId, DataGridMenuItem } from '@salmonui/data-grid';
import type { GanttInstance } from './instance.js';
import type { GanttLocaleKey } from './locale.js';
import type { GanttContextMenuItem } from './types.js';

export const GANTT_ITEMS = new Set<string>(['taskInformation', 'deleteTask', 'addAbove', 'addBelow', 'addChild', 'addMilestone', 'convertToTask', 'convertToMilestone', 'deleteDependency', 'indent', 'outdent', 'splitTask', 'mergeTask', 'cancel']);

/** The default set (`contextMenu: true`). */
export const CONTEXT_ITEMS: readonly GanttContextMenuItem[] = ['autoSizeAll', 'autoSize', 'taskInformation', 'deleteTask', 'save', 'cancel', 'sortAscending', 'sortDescending', 'addAbove', 'addBelow', 'addChild', 'addMilestone', 'convertToTask', 'convertToMilestone', 'deleteDependency', 'indent', 'outdent', 'splitTask', 'mergeTask'];

export function contextItemsOf<Row>(g: GanttInstance<Row>, items: readonly GanttContextMenuItem[]): (DataGridContextMenuItemId | DataGridMenuItem)[] {
  return items.map((item) => {
    if (typeof item === 'string' && GANTT_ITEMS.has(item)) return { id: `gantt:${item}`, label: g.text(item as GanttLocaleKey), targets: ['row', 'cell'] } satisfies DataGridMenuItem;
    return item as DataGridContextMenuItemId | DataGridMenuItem;
  });
}
