---
title: Gantt
description: Project schedules with a Data Grid task pane and a timeline chart, auto scheduling on working calendars, dependencies with lag, critical path, baselines, milestones, split tasks, resources, taskbar editing, undo, export and the GanttApi.
category: Scheduler
order: 63
demos: [gantt-editing, gantt-scheduling, gantt-calendars, gantt-timeline, gantt-appearance, gantt-resources, gantt-grid-pane, gantt-remote, gantt-large, gantt-export-accessibility]
---

```tsx
import { Gantt } from '@salmonui/gantt';
import '@salmonui/gantt/styles.css';

<Gantt
  data={tasks}
  taskFields={{ parentId: 'parentId' }}
  timeZone="Europe/Berlin"
  height={520}
  toolbar={['add', 'edit', 'delete', 'zoomIn', 'zoomOut', 'zoomToFit', 'criticalPath', 'undo', 'redo']}
  undo
  onDataChange={(rows) => setTasks(rows)}
/>;
```

`@salmonui/gantt/styles.css` carries the rules of everything the Gantt
renders (the Data Grid pane, the Splitter, the task editor's Dialog and
DatePicker, and the menus), so it is the only stylesheet besides
`@salmonui/core/styles.css`; only the lazy taskbar tooltip needs
`@salmonui/overlays/tooltip/styles.css` ([Tooltips](#tooltips)).

## Composition and state model

The left pane is `DataGrid` in tree mode, composed only through the public
Data Grid extension points (`api.getVisibleRows()`, `api.getViewport()`,
`api.subscribeViewport()`, `api.scrollTo()` and `api.getRowOffsets()`), so
sorting, filtering, search, selection, column menu, reorder, resize, pinning,
hiding, templates, grid lines, tree expansion, row drag and the empty view keep
their Data Grid names, events and budgets. Pass those props to `Gantt`
unchanged. The chart pane draws exactly the rows of the grid's visible row
model in the grid's rendered window: a grid scroll moves the chart rows with one
transform write, and the vertical wheel over the chart scrolls the grid. The
chart timeline follows the grid header's height (a filter bar makes it taller)
and chart rows follow the grid's horizontal `gridLines`. `treeFilterMode`
(`'ancestors'`, `'descendants'`, `'both'`, `'none'`, the Data Grid
`tree.filterMode`) picks the rows a filter or search keeps around the matches.
A row drag drop (`rowDrag`) and `api.moveRows(ids, { targetRowId, position })`
move the tasks through the engine, which reschedules them. `data` can also be a
Data Grid source (`createControlledDataSource`) or use lazy children
(`hasChildrenField`, `loadChildren`): the rows the grid loads join the
schedule and the chart. A new array is applied in place, but an array and a
source are different data modes: give the `Gantt` a new `key` to switch
between them.

### Remote data and writes

A source with `write` (`createControlledDataSource({ onQueryChange,
onDataChange })` or any `@salmonui/data` source) receives every committed
change, from the taskbar, the dialog, a grid edit or the API, as one Data Grid
`WriteRequest` through the grid's data source: `changed` rows carry the
computed dates (`start`, `end`, `duration`, `progress` as `Date` instants and
numbers) and the row's own parent field, `added` and `deleted` the inserted
and removed tasks, `mode: 'batch'`, and a `signal`. The rows the change
touched, the task and the dependents it rescheduled, are pending
(`data-pending` on their chart rows) until the write settles; on success the
grid pane shows the written rows. A newer change of the same task aborts the
older request (its tasks join the newer one) and unmounting aborts every
write in flight. A rejected Promise or a `status: 'rejected'` result reverts
the change in both panes and calls `onError({ error, action, taskIds })`.
Until a task is written the grid pane shows the source's own fields (a task
scheduled from its predecessors has no `end` there yet); the chart shows the
computed schedule.

```tsx
const source = createControlledDataSource({
  onQueryChange: (request) => api.readTasks(request),
  onDataChange: (request) => api.saveTasks(request, { signal: request.signal }),
});

<Gantt data={source} taskFields={{ parentId: 'parentId' }} timeZone="UTC" onError={(e) => toast(String(e.error))} />;
```

### Loading placeholders

`loadingIndicator: 'skeleton'` (the Data Grid prop) shows
the grid's skeleton rows while the source loads, after `api.refresh()` and
under `api.setLoading(true)`; the chart pane shows the same skeleton rows at
the same height. Under a lazy parent whose children load, the grid opens a
skeleton row (`virtualization.skeletonRows`, default on) and the chart opens the same gap with a shimmer bar
under the parent's bar, so both panes stay aligned; `virtualization:
{ skeletonRows: false }` turns both off. The default `'spinner'` covers the
grid pane only. The placeholders are client-only and add no CSS.

`Gantt` follows the Data Grid model: options props (`data`, `workingTime`,
`criticalPath`, `zoom`, `timeline`, ...) are re-applied when they change; user
actions fire before and after events that cancel with `preventDefault()`
(`onBeforeTaskChange` / `onTaskChange`, `onBeforeDependencyChange` /
`onDependencyChange`, `onBeforeTaskbarEditEnd` / `onTaskbarEditEnd`,
`onBeforeDialogOpen`, `onBeforeExport` / `onExport`); `ref` receives the
`GanttApi`, which extends the grid pane's `DataGridApi`. `onDataChange(rows)`
gives the changed data in the shape you passed (nested or flat); passing that
array back as `data` is not a reload.

<!-- demo: gantt-remote -->

## Tasks and fields

`data` holds nested rows (`children`) or flat rows with a parent id.
`taskFields` maps the roles to your property names: `id`, `title`, `start`,
`end`, `duration`, `durationUnit`, `progress`, `parentId`, `children`,
`predecessors`, `milestone`, `notes`, `baselineStart`, `baselineEnd`,
`baselineDuration`, `resources`, `work`, `taskType`, `manual`, `segments`,
`indicators`, `expanded`, `constraintType`, `constraintDate`, `calendar` and
`className`. Dates are `Date`s, ISO strings, epoch ms or plain
`{ year, month, day, hour, minute }` objects, read as wall times in
`timeZone`. Set `timeZone` for server rendering.

## Scheduling

The project engine derives the missing value of start, end and duration on
working time (`autoSchedule`, default `true`). `workingTime` sets the day
ranges, per-weekday ranges, work days, `includeWeekend`, `hoursPerDay`,
`daysPerWeek` and `daysPerMonth`; `holidays` are non-working and shaded;
`calendars` with `projectCalendar` and the task `calendar` role give named
calendars with exceptions. `taskMode` is `'auto'`, `'manual'` or `'custom'`
(per task `manual`); manual parents keep their dates and show the rolled-up
range. Parents roll up dates and duration-weighted progress. `taskType`
(`'fixedUnit'`, `'fixedWork'`, `'fixedDuration'`) and `workUnit` drive the
work math; `api.formatWork(id)` and `api.formatDuration(id)` format them.
Constraints are the eight Project types with `constraintDate`;
`unscheduledTasks` renders tasks without dates as placeholders.

Dependencies use the string form (`'2FS+3d,3SS-2h'`) or
`{ id, type: 'fs' | 'ss' | 'ff' | 'sf', lag, lagUnit }[]`.
`dependencyTypes` limits the types, `parentDependencies` allows links on
parents, `validateManualTasks` validates manual successors and
`dependencyLag` normalizes lags on load or on taskbar edits. With
`validateDependencies` (default) a user edit that breaks a link opens the
conflict dialog (keep the link and move the task, remove the link, or cancel),
or calls `onScheduleConflict(event)` with `event.resolve(choice)`.

`criticalPath` marks critical bars and connectors (`data-critical`);
`api.getCriticalTasks()` and the total float in `api.getTaskInfo(id)` come from
a forward and backward pass. `wbs` adds the `'wbs'` and `'wbsPredecessors'`
column presets. `projectStart` / `projectEnd` and `api.setProjectDates()` set
the project range.

<!-- demo: gantt-scheduling -->

<!-- demo: gantt-calendars -->

## Columns

`columns` takes Data Grid columns and the task presets `'title'`, `'start'`,
`'end'`, `'duration'`, `'progress'`, `'predecessors'`, `'resources'`,
`'work'`, `'taskType'`, `'notes'`, `'baselineStart'`, `'baselineEnd'`,
`'wbs'`, `'wbsPredecessors'`, `'serialNumber'` and `'id'`. Durations are
edited as text (`'3 days'`, `'2h'`, localized through `localeText`),
predecessors in the string form. `dateFormat` sets the date format: `Intl`
options or a skeleton (`'yMMMd'`) or style (`'short'`) format the columns,
labels and tooltips; a pattern (`'dd.MM.yyyy'`) formats the columns.
`treeColumn` picks the expander column.

<!-- demo: gantt-grid-pane -->

## Timeline

`timeline.mode` (`'hour'`, `'day'`, `'week'`, `'month'`, `'year'`) picks a
tier preset; `topTier` / `bottomTier` (`unit`, `count`, `format`, `render`),
`unitWidth`, `weekStart` and `renderCell` refine it. `zoom` / `onZoomChange`
index `zoomLevels` (built-in levels from half-years to five minutes);
`api.zoomIn()`, `api.zoomOut()`, `api.zoomToFit()`, Ctrl+wheel and the
toolbar items change it. Tier cells, shading, markers and connectors are
virtualized horizontally (taskbars are bounded by the row window); `timeline.infinite` and `api.extendTimeline()` extend the range.
`highlightWeekends`, `holidays` and `markers` shade and mark dates.

<!-- demo: gantt-timeline -->

## Chart

Taskbars show progress, summary bars, milestones (diamonds), baselines
(`baselines`), split segments, indicators (the `indicators` role), labels
(`labels.start`, `labels.end`, `labels.inside`) and connectors with arrows.
`rowHeight`, `getRowHeight` and `taskbarHeight` size them; the grid and the
chart share one row metric. `renderTaskbar`, `renderParentTaskbar`,
`renderMilestone` and `renderBaseline` replace parts; `getTaskbarProps(ctx)`
adds classes, styles and `data-*` attributes per task. Parts are
`.salmon-gantt__taskbar`, `__progress`, `__summary`, `__milestone`,
`__baseline`, `__segment`, `__connector`, `__marker` and `__holiday`, with
`data-critical`, `data-manual`, `data-selected` and `data-parent`.
`onTaskbarClick` reports clicks on bars (a click also selects the row),
`onRowDoubleClick` double clicks on grid rows, and `onChartPointerMove` the
date and task under the pointer, at most once per animation frame.

<!-- demo: gantt-appearance -->

## Editing

`editing` (default on unless `readOnly`): `mode` `'auto'` edits cells in the
grid and opens the dialog from the chart, `'dialog'` always uses the dialog.
Taskbars move, resize from either end and change progress by dragging, snapped
to the bottom tier unit (days on week and month scales); dragging from a
connector point to another taskbar adds a dependency. Every pointer move only
writes the bar's style; the engine runs once at the end. `onTaskbarEditStart`,
`onTaskbarEdit` (once per frame), `onBeforeTaskbarEditEnd` and
`onTaskbarEditEnd` report the edit. `taskbarDragBetweenRows` moves a task to
another row.

The dialog has General, Dependency, Resources, Notes and Segments tabs, or the
tabs of `editing.dialogTabs` (custom tabs render your content). Methods:
`addTask(task, { position, targetId })`, `updateTask`, `deleteTasks`,
`changeTaskId`, `indent`, `outdent`, `moveTasks`, `addDependency`,
`removeDependency`, `updateDependencies`, `splitTask`, `mergeSegments`,
`convertToMilestone`, `convertToTask`, `setTaskMode`, `openAddDialog`,
`openEditDialog`. `undo` (`true` or `{ actions, limit }`) records every
change: `api.undo()`, `api.redo()`, `getUndoActions()`, `getRedoActions()`,
`clearUndo()`, `clearRedo()`, Ctrl+Z and Ctrl+Y.

`toolbar` lists `'add'`, `'edit'`, `'update'`, `'delete'`, `'cancel'`,
`'expandAll'`, `'collapseAll'`, `'search'`, `'previousTimeSpan'`,
`'nextTimeSpan'`, `'zoomIn'`, `'zoomOut'`, `'zoomToFit'`, `'indent'`,
`'outdent'`, `'criticalPath'`, `'excelExport'`, `'csvExport'`, `'pdfExport'`,
`'undo'`, `'redo'` and custom items (`onToolbarItemClick`). `contextMenu`
adds `'taskInformation'`, `'deleteTask'`, `'addAbove'`, `'addBelow'`,
`'addChild'`, `'addMilestone'`, `'convertToTask'`, `'convertToMilestone'`,
`'deleteDependency'`, `'indent'`, `'outdent'`, `'splitTask'` and
`'mergeTask'` to the Data Grid items, in both panes.

<!-- demo: gantt-editing -->

## Resources

`resources` with `resourceFields` (`id`, `name`, `unit`, `group`) and the task
`resources` role (`{ id, unit }[]`) assign people; the resources column and
dialog tab show them.

`resourceView` groups the rows by resource: one parent row per resource (in
`resources` order) with its tasks, then an "Unassigned" row. A task with two
resources is listed under each; the second listing has the grid row key
`taskId@resourceId`, resource rows `__res:<resourceId>`, and every method still
takes task ids. `overAllocation` marks where a resource's summed units exceed
its `unit` (default 100 %): `data-part="overAllocation"` ranges in the
resource row and `data-over-allocated` on the bars inside them.
`multiTaskbar` draws a collapsed parent's children in its row and a
resource's tasks in the resource row; with `taskbarOverlap={false}`
overlapping bars stack in lanes and the row grows in both panes. With
`editing={{ taskbarDragBetweenRows: true }}` dropping a bar on another
resource's row moves the assignment there (on the Unassigned row it removes
it); in the project view the task moves below the target row, or into it when
the target is a parent.

```tsx
<Gantt data={tasks} resources={people} resourceView overAllocation multiTaskbar taskbarOverlap={false} editing={{ taskbarDragBetweenRows: true }} />
```

<!-- demo: gantt-resources -->

## Tooltips

`tooltip` (or `{ renderTaskbar, renderBaseline, renderConnector }`) opens one
`Tooltip` on hovered or focused taskbars, milestones, baselines and
connectors with the title, dates, duration and progress;
`onBeforeTooltipOpen` can cancel it. It is a lazy chunk; import
`@salmonui/overlays/tooltip/styles.css` with it. Drags show their own editing
tip with the new dates.

## Export, print and state

`api.exportToExcel()` and `api.exportToCsv()` are the grid pane's exports
(tree rows as outline levels, with the Data Grid `cell` and `headerCell`
hooks); `api.exportToPdf(options)` draws both panes as
PDF vectors through `exportWriters.pdf`, a dynamic import of
`@salmonui/export/gantt` (`pageSize`, `orientation`, `fitToWidth`,
`header`, `footer`, `font`, and the `cell`, `headerCell`, `taskbar`,
`timelineCell` hooks). `api.print()` prints the rendered panes.
`api.getState()` / `api.restoreState()` hold the grid state, splitter, zoom and
scroll date; there is no built-in persistence.

## Keyboard and accessibility

The grid pane is the Data Grid treegrid with its keyboard model. Gantt keys:
Alt+Shift+Right / Left indent and outdent, Ctrl+Z / Ctrl+Y undo and redo, F6
moves focus between the panes. In the chart pane, Up / Down select the
previous / next task, Left / Right scroll the timeline (Ctrl: a page), Enter
opens the dialog and Ctrl+Plus / Ctrl+Minus zoom. Each taskbar is labelled
with its name, dates, progress, dependencies and critical state, and the grid
row is described by it. `dir="rtl"` runs the timeline right to left.

<!-- demo: gantt-export-accessibility -->

## Splitter and panes

`splitter` (`position`, `columnIndex`, `minSize`) and `panes`
(`'both'`, `'grid'`, `'chart'`) place the panes on the public `Splitter`;
`api.setSplitterPosition()`, `onSplitterResizeStart`, `onSplitterResize`
(once per frame) and `onSplitterResizeEnd` report resizing.

### Adaptive layout

`adaptive` shows one pane at a time with a
"Tasks | Timeline" switch (`localeText.gridPane`, `localeText.chart`, group
label `localeText.paneSwitch`) and opens the task dialog full screen.
`adaptive` (`true`) is always adaptive, server markup included;
`adaptive={{ breakpoint: 640 }}` follows the Gantt's own width (a
`ResizeObserver`, so the server and hydration render both panes and the switch
appears after mount below the breakpoint). The task list stays mounted while
the timeline shows, so selection, scroll and expansion survive the switch.

```tsx
<Gantt data={tasks} adaptive={{ breakpoint: 720 }} timeZone="UTC" />
```

## Server rendering

With `timeZone` set, both panes render the grid's initial rows and the first
timeline window on the server with no today marker, and hydrate without
warnings.

<!-- demo: gantt-large -->

## State, lifecycle and events

- **State.** Components never write to browser storage.
  `api.getState()` returns `{ grid, splitter, zoom, scrollDate }`, covering
  the Data Grid state, splitter position, zoom level and scroll date, and
  `api.restoreState(state)` applies it; store the snapshot yourself.
- **Data updates.** Tasks have stable ids and the engine updates
  rows incrementally by id on every data change, so there is no immutable
  mode. A new `data` array with the same task ids keeps row DOM, expansion,
  selection and scroll, and only changed tasks re-render.
- **Templates.** Customize with `renderTaskbar`,
  `renderBaseline` and the other render props. There are no HTML string
  templates; text from data is always escaped.
- **Agent tools.** Register your own tools over `GanttApi`
  methods such as `addTask`, `updateTask`, `addDependency` and
  `getCriticalTasks`, with your own confirmation step; components do not
  register WebMCP tools.
- **Lifecycle.** `onReady(api)` fires after the first commit;
  props are declarative, and unmounting tears everything down.
- **Action events.** `onBeforeTaskChange`,
  `onBeforeTaskbarEditEnd`, `onBeforeDependencyChange`, the Data Grid
  pairs in the grid pane, and `onError({ error, action, taskIds })` for
  failures; `event.preventDefault()` cancels.

## API reference

The API reference for [`@salmonui/gantt`](/docs/reference/gantt)
lists every prop, method and type.
