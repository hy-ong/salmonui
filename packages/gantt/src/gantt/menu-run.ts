// Gantt context menu item actions, in the lazy popups
// chunk: a grid pane item click loads it on demand.

import type { DataGridEventSource } from '@salmonui/data-grid';
import type { GanttInstance } from './instance.js';
import { GANTT_ITEMS } from './menu-items.js';
import type { GanttContextMenuItemId } from './types.js';

/** Runs a Gantt context item for a task (the grid handles its own ids). */
export function runContextItem<Row>(g: GanttInstance<Row>, item: string, id: string | null, source: DataGridEventSource): void {
  const name = (item.startsWith('gantt:') ? item.slice(6) : item) as GanttContextMenuItemId;
  if (!GANTT_ITEMS.has(name)) return;
  const api = g.api;
  if (!api) return;
  switch (name) {
    case 'taskInformation':
      if (id) api.openEditDialog(id);
      break;
    case 'deleteTask':
      if (id) api.deleteTasks([id]);
      break;
    case 'addAbove':
    case 'addBelow':
    case 'addChild':
      api.addTask(undefined, { position: name === 'addAbove' ? 'above' : name === 'addBelow' ? 'below' : 'child', ...(id ? { targetId: id } : {}) });
      break;
    case 'addMilestone':
      api.addTask({ [g.fields.milestone]: true, [g.fields.duration]: 0 } as never, { position: 'below', ...(id ? { targetId: id } : {}) });
      break;
    case 'convertToTask':
      if (id) api.convertToTask(id);
      break;
    case 'convertToMilestone':
      if (id) api.convertToMilestone(id);
      break;
    case 'deleteDependency': {
      const task = id ? g.engine.getTask(id) : undefined;
      if (id && task?.predecessors?.length) api.updateDependencies(id, []);
      break;
    }
    case 'indent':
      if (id) api.indent([id]);
      break;
    case 'outdent':
      if (id) api.outdent([id]);
      break;
    case 'splitTask': {
      const s = id ? g.engine.getSchedule(id) : undefined;
      if (id && s?.start != null && s.end != null) api.splitTask(id, g.date(g.menuDate ?? s.start + (s.end - s.start) / 2));
      break;
    }
    case 'mergeTask': {
      const s = id ? g.engine.getSchedule(id) : undefined;
      if (id && s?.segments && s.segments.length > 1) api.mergeSegments(id, s.segments.map((_, i) => i));
      break;
    }
    case 'cancel':
      api.cancelEdit();
      break;
  }
  void source;
}
