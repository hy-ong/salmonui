// Gantt resource view, multi-taskbar, split tasks and tooltips
// (tests/browser/gantt-resources.spec.ts; checklist). Scenarios in `[data-scenario]` blocks with a fixed locale, zone
// and dates; APIs on `window.__ganttApi[id]`, events in `window.__ganttEvents`.
import { type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import '@salmonui/core/styles.css';
import '@salmonui/data-grid/styles.css';
import '@salmonui/gantt/styles.css';
import '@salmonui/overlays/tooltip/styles.css';
import '@salmonui/data-grid/styles.css';
import './app.css';
import { Gantt, type GanttApi, type GanttProps } from '@salmonui/gantt';
import { editing, tree } from '@salmonui/data-grid/features';

type Task = Record<string, unknown>;

declare global {
  interface Window {
    __ganttApi: Record<string, GanttApi<Task>>;
    __ganttEvents: { id: string; type: string; value: unknown }[];
    __mountMs?: number;
  }
}

window.__ganttApi = {};
window.__ganttEvents = [];

const log = (id: string, type: string) => (value: unknown) => {
  const v = value as { taskIds?: unknown; action?: unknown; kind?: unknown };
  window.__ganttEvents.push({ id, type, value: { taskIds: v.taskIds, action: v.action, kind: v.kind } });
};

// Ana (r1) has two overlapping tasks in the week of 2 March (over-allocated); Ben (r2) one; task 5 is unassigned.
export const TASKS: Task[] = [
  { id: 1, title: 'Project', parentId: null },
  { id: 2, title: 'Design', start: '2026-03-02', duration: 3, progress: 50, parentId: 1, resources: [{ id: 'r1', unit: 100 }] },
  { id: 3, title: 'Research', start: '2026-03-03', duration: 3, progress: 20, parentId: 1, resources: [{ id: 'r1', unit: 100 }], baselineStart: '2026-03-02', baselineEnd: '2026-03-04' },
  { id: 4, title: 'Build', start: '2026-03-09', duration: 4, parentId: 1, predecessors: '2FS', resources: [{ id: 'r2', unit: 100 }, { id: 'r1', unit: 50 }] },
  { id: 5, title: 'Review', start: '2026-03-16', duration: 2, parentId: 1 },
];
export const RESOURCES = [
  { id: 'r1', name: 'Ana' },
  { id: 'r2', name: 'Ben' },
];
const SPLIT: Task[] = [
  { id: 1, title: 'Split', start: '2026-03-02', duration: 4, segments: [{ start: '2026-03-02', duration: 1 }, { start: '2026-03-05', duration: 2 }] },
  { id: 2, title: 'Plain', start: '2026-03-02', duration: 2, predecessors: '' },
];

function Scenario({ id, data = TASKS, ...props }: { id: string; data?: Task[] } & Partial<GanttProps<Task>>): ReactNode {
  return (
    <section data-scenario={id} data-salmon-a11y-root="" style={{ display: 'block', margin: 8 }}>
      <h2 style={{ fontSize: 12, margin: '0 0 4px' }}>{id}</h2>
      <Gantt<Task>
        id={id}
        data={data}
        taskFields={{ parentId: 'parentId' }}
        timeZone="UTC"
        locale="en-US"
        height={330}
        resources={RESOURCES}
        columns={['id', 'title', 'start', 'end']}
        features={[tree, editing]}
        ref={(api) => {
          if (api) window.__ganttApi[id] = api;
        }}
        onTaskChange={log(id, 'taskChange')}
        onTaskbarEditEnd={log(id, 'taskbarEditEnd')}
        onBeforeTooltipOpen={log(id, 'beforeTooltipOpen')}
        {...props}
      />
    </section>
  );
}

function Page() {
  return (
    <>
      <Scenario id="resources" resourceView overAllocation tooltip undo editing={{ taskbarDragBetweenRows: true }} baselines />
      <Scenario id="lanes" resourceView multiTaskbar taskbarOverlap={false} overAllocation readOnly />
      <Scenario id="multi" multiTaskbar defaultExpanded="none" readOnly />
      <Scenario id="split" data={SPLIT} editing />
      <Scenario id="rows" editing={{ taskbarDragBetweenRows: true }} />
    </>
  );
}

const t0 = performance.now();
createRoot(document.getElementById('root') as HTMLElement).render(<Page />);
requestAnimationFrame(() => (window.__mountMs = performance.now() - t0));
