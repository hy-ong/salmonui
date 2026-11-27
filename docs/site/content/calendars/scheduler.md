---
title: Scheduler
description: Day, week, month, year, agenda and timeline calendars of events with resources and grouping, recurring series, time zones, quick info popups, an editor dialog, overlap rules, remote data, virtual scrolling and the SchedulerApi.
category: Scheduler
order: 61
demos: [scheduler-basic, scheduler-timeline, scheduler-views-navigation, scheduler-globalization, scheduler-event-layout, scheduler-large, scheduler-remote, scheduler-editing, scheduler-recurrence, scheduler-templates, scheduler-drag-drop, scheduler-selection-keyboard, scheduler-resources, scheduler-export-print, scheduler-adaptive-theming]
---

```tsx
import { Scheduler } from '@salmonui/scheduler';
import '@salmonui/scheduler/styles.css';

<Scheduler data={events} view="week" date="2026-11-23" timeZone="Europe/Berlin" height={640} onSave={(e) => persist(e.data)} />;
```

<!-- demo: scheduler-basic -->

## State model

`Scheduler` follows the Data Grid model, not the small-component triads.
Options props (`view`, `date`, `data`, `views`, ...) are re-applied when they
change; user actions change the Scheduler's own state and fire after-events
(`onViewChange`, `onDateChange`, `onAdd`, `onSave`, `onDelete`). To own a
value, store it from the after-event and pass it back. Cancellable actions
have a before-event that you cancel with `event.preventDefault()`
(`onBeforeNavigate`, `onBeforeAdd`, `onBeforeSave`, `onBeforeDelete`,
`onBeforePopupOpen`). `ref` receives the `SchedulerApi`; `onReady(api)` fires
once after mount.

## Data and fields

`data` is an array of your rows. Each row needs a stable `id`.
`eventFields` maps the roles to your property names:
`id`, `title`, `start`, `end`, `allDay`, `location`, `description`, `block`,
`readOnly`, `startTimeZone`, `endTimeZone`, `recurrenceRule`,
`recurrenceId`, `recurrenceExceptions` and `followingId`. A role is a
property name or `{ field, label, defaultValue, validation }`.
Times are `Date`s, ISO strings (with `Z` or an offset they are
instants; without, wall times in the event or Scheduler zone) or plain
`{ year, month, day, hour, minute }` objects. Writes keep the style of the
row's own values.

Local writes update the Scheduler's copy of the rows; every after-event
carries the complete new array in `data`, so persisting is one line. A
`data` prop change replaces the copy.

## Views

`views` lists the views of the header (default day, week, work week and
month). An entry is a view type or `{ type, name, label, interval,
startHour, endHour, workDays, showWeekend, readOnly, timeScale, renderEvent,
eventLayout, monthCount, firstMonthOfYear, agendaDayCount,
hideEmptyAgendaDays, orientation, virtualScroll, headerRows,
renderMonthHeader, renderDayHeader }`; entry options override the top-level
props for that view. `interval` makes custom spans: `{ type: 'day', name:
'threeDays', label: '3 days', interval: 3 }`.

- `day`: one column with an all-day row and time slots.
- `week`: seven columns from `firstDayOfWeek` (default from the locale).
- `workWeek`: the `workDays` columns (default Monday to Friday).
- `month`: week rows with stacked events; a date number opens the day view.
`showWeekNumbers` and `weekRule` add week numbers.
- `showWeekend={false}` hides the non-work days in week and month views.
- `timelineDay`, `timelineWeek`, `timelineWorkWeek`, `timelineMonth` and
  `timelineYear`: time runs horizontally, resources are rows ("Timeline
  views" below).
- `year`, `agenda` and `monthAgenda` ("Year and agenda views" below).

Day, week, work week and month are in the initial JavaScript. The timeline
views, the year and agenda views, and resources are separate chunks: the
server renders them in full, the browser loads them when idle after mount
(at once when such a view is shown first; until then the body shows a sized
placeholder with `data-salmon-pending`).

## Timeline views

The timeline views lay the time axis out horizontally: Timeline Day, Week
and Work Week in time slots of the visible hours (`startHour`, `endHour`,
`timeScale`), Timeline Month in one column
per day. With `grouping` every resource is a row; without, the
view is one row. An event starts in the cell of its start and spans its
length; a row shows `eventLayout.maxHeight` lanes (default 2) and "+N more",
or every lane with `autoRowHeight`.

`headerRows` picks the header rows from `'year'`, `'month'`, `'week'`,
`'date'` and `'hour'`, top to bottom, each with an optional
`render({ unit, start, date, text, view })` (default: date and hour in slot
views, date in Timeline Month):

```tsx
<Scheduler
  data={events}
  resources={[rooms]}
  grouping={{ resources: ['rooms'] }}
  view="timelineWeek"
  views={['timelineDay', 'timelineWeek', 'timelineMonth']}
  headerRows={[{ unit: 'week' }, { unit: 'date' }, { unit: 'hour' }]}
  date="2026-11-24"
  timeZone="UTC"
/>
```

Timeline Year puts the months in rows over the days 1 to 31
(`orientation: 'horizontal'`, the default) or in columns over 31 day rows
(`{ type: 'timelineYear', orientation: 'vertical' }`, each cell lists its
day's events). With grouping, Timeline Year has a row per resource over
every day of the year. `firstMonthOfYear` (1 to 12) and `monthCount` set the
months; `renderMonthHeader({ date, text, view })` and
`renderDayHeader({ day, weekday, text, view })` render the month and day
headings.

Cells carry `data-cell-start` / `data-cell-end` (instants in ms) and
`data-resource` (the resource path key, ids joined by `/`); rows carry
`data-resource`, `data-level` and `data-parent` on parent rows.

<!-- demo: scheduler-timeline -->

### Virtual scrolling

`virtualScroll` (top level or per view) renders only the resource rows in
view: `true` or `{ overscan, lazyLoad, initialRange }`. Scrolling
raises no events; `api.getRenderedRange()` returns `{ start, end,
resourceIds }` of the rendered rows. The server and the first client render
show `initialRange` (default rows 0 to 20), so server HTML matches
hydration. With a remote `data` source, `lazyLoad: true` reads the events of
the rendered resources only: `read` receives `resourceIds` and runs again
when the rendered rows change.

<!-- demo: scheduler-large -->

## Year and agenda views

- `year`: a month grid per month (`monthCount`, default 12, from
  `firstMonthOfYear`); days with events are marked (`data-has-events`).
  A day opens its list of events; the date heading of that list goes to the
  day view, as it does in the "+N more" list.
- `agenda`: the events of `agendaDayCount` days (default 7) from the date,
  listed by day; `hideEmptyAgendaDays` (default `true`) skips days without
  events. `{ type: 'agenda', virtualScroll: true }` appends the
  next days as the list scrolls.
- `monthAgenda`: a month grid with marked days and the event list of the
  selected day.

## Resources and grouping

`resources` defines what events refer to. Each definition names
the event `field` that holds the item id (an array with `multiple`), a
`name` for grouping, an editor `label` and its `data` items; the item
properties are `id`, `text`, `color`, `parentId`, `workDays`, `startHour`,
`endHour`, `className` and `expanded` unless `idField`, `textField`,
`colorField`, `parentIdField`, `workDaysField`, `startHourField`,
`endHourField`, `classNameField` and `expandedField` rename them. An event
takes its resource's color, mixed against the surface for its background;
the editor shows a select per resource (several values with `multiple`),
and a new event from a resource cell or row gets that resource.

```tsx
const rooms = { field: 'roomId', name: 'rooms', label: 'Room', data: [{ id: 1, text: 'Room A', color: '#d9480f' }, { id: 2, text: 'Room B' }] };
const owners = { field: 'ownerIds', name: 'owners', multiple: true, data: [{ id: 10, text: 'Ann', parentId: 1 }, { id: 11, text: 'Bob', parentId: 2 }] };

<Scheduler data={events} resources={[rooms, owners]} grouping={{ resources: ['rooms', 'owners'] }} view="week" date="2026-11-24" timeZone="UTC" />;
```

`grouping` groups the views: day, week, work week and month get
one header row per resource level above the dates (`byDate: true` puts the
dates first), the timeline views get a row per resource, nested
under its parent. Children are listed under the parent their `parentId`
names; `byParent: false` lists every child under every parent. An
event with several ids shows in each of its resources; with
`sharedEvents: true` the copies select together. Edits always
change the one row.

- `renderResourceHeader(ctx)` renders a resource heading and
  `renderResourceTooltip(ctx)` adds a tooltip to it (`ctx: { resource,
  level, expanded, hasChildren, view }`).
- Parent rows of timeline views expand and collapse
  (`expandedResourceIds` / `onExpandedResourcesChange`, default from the
  `expanded` item property, `api.expandResource(id)`,
  `api.collapseResource(id)`).
- `resources` is reactive: add, remove or replace items by changing the
  prop; `api.getResources()` and `api.getResource(id, name?)` read the
  items.
- `api.scrollToResource(id)` expands the resource's parents and scrolls its
  row or column into view, also under virtual scrolling.
- Each resource's `workDays`, `startHour` and `endHour` mark its own work
  cells (inherited down the tree); `grouping.hideNonWorkingDays` shows each
  resource only on its work days in day, week and work week views.

<!-- demo: scheduler-resources -->

## Navigation

`date` / `onDateChange` and `view` / `onViewChange` are the reactive pair.
The header previous, next and today buttons and
`api.navigate('previous' | 'next' | 'today')` move by one page;
`api.setView(view, date?)` and `api.setDate(date)` jump. `onBeforeNavigate`
(`kind: 'date' | 'view'`) cancels. `min` and `max` stop navigation and the
header calendar. The date range button shows
`Intl.DateTimeFormat.formatRange` text (`renderDateRange` replaces it,
`api.getDateRangeText()` reads it) and opens a `Calendar` popover
to pick a date.

<!-- demo: scheduler-views-navigation -->

## Time

- `timeZone` (IANA) is the zone the events are shown in. Without it the
  client uses the host zone after hydration and the server renders an empty
  frame; pass it for server rendering.
- Per-event `startTimeZone` / `endTimeZone` read wall times in that zone;
  the editor offers a searchable zone list (`timeZones`, default
  `Intl.supportedValuesOf('timeZone')`).
- `startHour` / `endHour` (`'HH:mm'`) limit the visible hours;
  `workHours: { highlight, start, end }` marks work hours, and
  `api.setWorkHours(dates, start, end)` / `api.resetWorkHours(dates?)`
  override single days.
- `timeScale: { enabled, interval, slotCount }` sets the major slot length
  in minutes and its minor slots; `renderMajorSlot` / `renderMinorSlot`
  render the labels.
- The current time marker (`currentTimeIndicator`) and today are added
  after hydration only.
- The day views scroll to the work start; `scrollTime` and
  `api.scrollToTime(time, { date })` move it.
- `calendar` relabels dates with an `Intl` calendar (including Islamic); `dateFormat` and `hourCycle` set the formats.

<!-- demo: scheduler-globalization -->

## Layout

Overlapping timed events share their time column side by side; events that
cross midnight and all-day events sit in the all-day row as bars split per
week with `data-continues-start` / `data-continues-end` parts. `eventOrder(a, b)` orders events that start together.
`eventLayout: { spannedPlacement, maxHeight, moreIndicator, minimumDuration }`
controls where spanning events go, how many lanes show before "+N more", and
the shortest drawn height. "+N more" opens a popover of the day's
events (`onMoreEventsClick`, `event.navigate(view)` to go to a view
instead). The all-day row expands with its toggle
(`allDayRowExpanded` / `onAllDayRowExpandedChange`, `allDayRowScroll`). `autoRowHeight` grows month and timeline rows to fit every event
instead of "+N more".

<!-- demo: scheduler-event-layout -->

## Recurring events

A row with `recurrenceRule` (an RRULE string) is a series. Its occurrences
are expanded per visible range by the RRULE engine (see
[RecurrenceEditor](/docs/calendars/recurrence-editor)) and keep their wall
time across DST; `recurrenceExceptions` (comma separated
`20261125T140000Z` stamps, or an array of times) are skipped, and a row with
`recurrenceId` is an edited occurrence. Editing or deleting an
occurrence asks for the scope: "This event" adds an exception to
the series and an edited child; "All events" changes the series (moving it
by the occurrence's time change and dropping edited occurrences); with
`editing.following`, "This and following events" ends the series before the
occurrence (`UNTIL`) and starts a new series linked by `followingId`.
With `editing.recurrencePrompt: false` there is no prompt;
`event.setScope(scope)` in `onBeforeSave` / `onBeforeDelete` decides.
`editing.validateRecurrence` (default true) rejects a duration longer than
the repeat interval and an occurrence moved onto the day of another one.
`api.getOccurrences(id)`, `api.getOccurrencesInRange(start,
end)` and `api.getDeletedOccurrences(id)` query series.

<!-- demo: scheduler-recurrence -->

## Editing

`editing` is `true`, `false` or `{ add, edit, delete, dialog, following,
recurrencePrompt, validateRecurrence, createId, renderDialog,
renderDialogHeader, renderDialogFooter }`; `readOnly` on the
Scheduler, on a view, or the `readOnly` role on a row allows details only.

- A cell click selects the cell and opens the cell quick info popup (title
  and Save, More details); an event click opens the event popup (details,
  Edit, Delete). `quickInfo: false` turns them off, `{ onSelectionEnd,
  renderHeader, renderContent, renderFooter }` customizes them.
- A double click (or Alt+Enter) opens the editor dialog: title, location,
  start and end `DatePicker`s, all day, start and end time zones, the
  embedded `RecurrenceEditor` and the description. Field
  validation follows `eventFields.<role>.validation` with the Data Grid
  rule names (`required`, `minLength`, `maxLength`, `pattern`, `validate`).
  A new event starts with the `defaultValue` of its title, location and
  description roles. `editing.renderDialog` replaces the body with your own
  fields (`{ isNew, values, setValue, errors, row, save, cancel, delete }`): `values` holds the roles, the resource fields and the row's
  other properties by their own names, and `setValue(name, value)` on a
  property outside the roles writes that property on save.
- `editing.inline` edits in place: typing in a focused cell opens
  a title input there (Enter or leaving it creates the event, Escape
  cancels), and Enter on an event edits its title (a series occurrence
  changes the series). A cell click then only selects; the cell quick info
  stays closed so typing reaches the cell.
- `onBeforePopupOpen` / `onPopupClose` report `popup: 'editor' | 'quickInfo'
  | 'moreEvents' | 'recurrenceAlert' | 'deleteAlert' | 'validationAlert' |
  'overlapAlert'`; `api.openQuickInfo(target)`, `api.closeQuickInfo()`,
  `api.openEditor(target, { mode })` and `api.closeEditor()` open and close
  them from code.
- `api.addEvents(rows)`, `api.saveEvent(row, { scope, occurrenceStart })` and
  `api.deleteEvents(ids, { scope })` write from code and return
  `{ status, rows }`.

## Availability

A row with the `block` role is a blocked time: creates, saves and moves
into it are rejected and it renders hatched (`api.getBlockEvents()`). `overlap={false}` rejects writes that collide with another event;
`onOverlap(event)` reports the conflicting rows
(`preventDefault()` suppresses the alert), and `api.openOverlapAlert()` /
`api.closeOverlapAlert()` show it. `api.isSlotAvailable(start, end)` checks a
slot.

<!-- demo: scheduler-editing -->

## Remote data

`data` may be a source with `read({ range, view, signal })` and an optional
`write({ action, added, changed, deleted, signal })`. The visible
range is the query: every navigation reads again (aborting a superseded
read). Writes apply at once and show a pending state on the event; a
rejection (or `{ status: 'rejected' }`) reverts and calls `onError({ error,
action })`. `onDataLoad({ range, rows })` follows each read;
`api.reloadEvents()` reads again and `api.setLoading(loading)` drives the
loading part, replaced by `renderLoading`.

```ts
const source: SchedulerDataSource<Row> = {
  read: ({ range, signal }) => fetch(`/events?from=${range.start.toISOString()}&to=${range.end.toISOString()}`, { signal }).then((r) => r.json()).then((rows) => ({ rows })),
  write: ({ added, changed, deleted, signal }) => fetch('/events', { method: 'POST', body: JSON.stringify({ added, changed, deleted }), signal }).then(() => ({ status: 'applied' })),
};
```

## Queries

`api.getEvents({ start, end, includeOccurrences })`, `api.getViewEvents()`,
`api.getEventInfo(id | element)`, `api.getViewDates()`,
`api.getCellInfo(element)` and `api.getSelectedCells()` return application
rows and dates; ids are your ids (new ids come from `editing.createId`,
default the next number or a random id). `api.refresh()`
re-measures and `api.reloadEvents()` re-reads.
`api.getState()` / `api.restoreState(state)` save and restore view, date and
the all-day row.

<!-- demo: scheduler-remote -->

## Event selection and shortcuts

A click selects an event, Ctrl / Cmd + click toggles one, Shift + click adds
every visible event between the last selected one and the clicked one in time
order. `onEventSelectionChange(ids, event)` reports event ids (a series once)
with the occurrence `keys` and `rows`; `selectedEventIds` is reactive and
selects every visible occurrence of those events.

Inside the Scheduler, Alt+1..9 switch to the nth view, Ctrl / Cmd + Left /
Right go to the previous / next range (mirrored in RTL), Delete asks to delete
the selected event and Escape clears the event selection.

## Keyboard and accessibility

Each view grid (day, week and month cells, timeline rows) is one tab stop
with a roving tabindex (WAI-ARIA grid pattern): Tab enters on the last
focused item, the selected cell or the first visible cell, and Tab leaves
the grid. The arrow keys move between the cells and the parts inside them
(events, "+N more", the month date links) by screen position, so they follow
the layout in RTL too: an event comes right after the cell it starts in,
moving down or toward the inline end, and a wide bar keeps the column it was
entered from. Home / End go to the first / last cell of the row; Escape on an
event returns to its cell. Enter or Space on a cell opens its quick info
(Alt+Enter the editor), on an event the quick info; the list views keep every
event as a tab stop.

Events are buttons named by their title, time (and location) and, in grouped
views, their resource; cells are `gridcell`s labelled with their date, time
and resource, with `aria-selected` for the cell selection.

`keyBindings` remaps the commands (`Mod` is Ctrl or Cmd; an empty list turns
a command off): `navigation.previous` / `navigation.next` (Mod+Left /
Right), `view.1` .. `view.9` (Alt+1..9), `event.delete` (Delete),
`selection.clear` (Escape) and `clipboard.copy` / `cut` / `paste` (Mod+C /
X / V). The grid's arrow, Home and End keys are fixed.

```tsx
<Scheduler data={events} keyBindings={{ 'navigation.next': ['Alt+PageDown'], 'event.delete': [] }} />;
```

<!-- demo: scheduler-selection-keyboard -->

## Adaptive layout

`adaptive` switches to a compact layout for narrow screens: the view buttons
become a view menu (a `select`), the time axis narrows and grouped views
show one resource at a time with a resource picker (a `select`, which opens
as the platform's sheet on touch devices). `adaptive` is always compact,
also in server markup; `adaptive={{ breakpoint: 640 }}` is compact while the
Scheduler's own width is below the breakpoint, measured after hydration (the
server renders the full layout, so hydration matches). The shown resource is
the first leaf unless `selectedResourceId` names one; picking another fires
`onSelectedResourceChange(id, event)`, and the prop is re-applied when it
changes.

```tsx
<Scheduler data={events} resources={[rooms]} grouping={{ resources: ['rooms'] }} adaptive={{ breakpoint: 640 }} />;
```

<!-- demo: scheduler-adaptive-theming -->

## Clipboard

With `clipboard`, Ctrl / Cmd + C copies the selected events, Ctrl / Cmd + X
cuts them and Ctrl / Cmd + V pastes at the selected cells (else the focused
cell); `api.copy()`, `api.cut()` and `api.paste(target?)` work without the
prop. Pasted events keep their offsets from the earliest copied one, which
lands at the target start; on a month cell or the all-day row they move by
whole days and keep their time of day. A grouped target cell sets the
resource. Copies are new events without recurrence (through `addEvents`, so
`onBeforeAdd` / `onAdd` and overlap rules apply); a cut pastes once and moves
the events through the save path (`onBeforeSave` / `onSave`, one occurrence
of a series as an exception). `onBeforePaste` sees the rows with their new
times and cancels with `preventDefault()` or replaces `event.data`. The
clipboard belongs to one Scheduler instance; it does not use the system
clipboard.

```tsx
<Scheduler data={events} clipboard onBeforePaste={(e) => (e.data = e.data.map((r) => ({ ...r, title: `${r.title} (copy)` })))} />;
```

## Drag, resize and swipe

Editable events move by pointer (`draggable`, default `true`) and resize from
their start and end edges (`resizable`, default `true`): the block edges of
timed events in day views, the inline edges of bars in the all-day row, Month
and the timelines. A drag starts after a 4 px move (a 400 ms hold on touch);
Escape cancels it. While the pointer moves, a copy of the event follows in the
top layer and nothing re-renders: the drop commits once through the regular
save path (`onBeforeSave` / `onSave`, overlap rules and blocks, the recurrence
scope alert for occurrences, a remote source's pending state and revert).

```tsx
<Scheduler
  data={events}
  dragOptions={{ snapMinutes: 15, navigateOnEdge: true, multiple: true, excludeSelector: '.no-drag' }}
  onEventDragStart={(e) => e.row.locked && e.preventDefault()}
  onBeforeEventDrop={(e) => isWorkingTime(e.start, e.end) || e.preventDefault()}
  onEventDrop={(e) => log(e.result.status)}
  onBeforeEventResizeEnd={(e) => e.end.getTime() - e.start.getTime() <= 4 * 3_600_000 || e.preventDefault()}
/>;
```

- Timed starts and ends snap to `dragOptions.snapMinutes` (default the slot
  length); the all-day row, Month and the day timelines move by whole days and
  keep the time of day. A timed event stays timed and an all-day event stays
  in day cells.
- `onEventDragStart` / `onEventResizeStart` cancel the gesture,
  `onEventDrag` / `onEventResize` fire at most once per frame when the
  proposed time or resource changes, `onBeforeEventDrop` /
  `onBeforeEventResizeEnd` cancel the drop and `onEventDrop` /
  `onEventResizeEnd` report the save `result`.
- `autoScroll` (default `true`) scrolls the view near its edges;
  `navigateOnEdge` (`true` or `{ delay }`, default 1000 ms) goes to the
  previous / next range while the pointer rests at the Scheduler's inline
  edge.
- `dragOptions.multiple` moves every selected event (see
  [Event selection](#event-selection-and-shortcuts)) by the same offset.
- Dropping on another resource row or column changes the event's resource
  ids (the origin resource is replaced, other ids of a `multiple` resource are
  kept).
- `onExternalDrop({ data, start, end, allDay, resourceIds })` receives HTML
  drag data dropped on a slot; the rows it returns are added (`onBeforeAdd` /
  `onAdd`). A drop over `dragOptions.dragOutArea` (an element or a selector)
  fires `onEventDragOut` instead of moving the event.
- Schedulers with the same `dragOptions.group` accept each other's events:
  the target adds a copy (`onAdd`) and the source deletes the event
  (`onDelete`). Recurring events do not leave their Scheduler. A Data Grid
  row drag reaches a Scheduler through `rowDrag.targetId` (the Scheduler
  `id`): the drop's `target` is the Scheduler, so `onRowDrop` hit-tests the
  last pointer position (`document.elementFromPoint`) and
  `api.getCellInfo(element)` gives the slot for `api.addEvents`.
- `swipeNavigation` (default `true` on coarse pointers) navigates on a quick
  horizontal touch swipe over a day or month view, mirrored in RTL; a gesture
  that starts on an event is a drag.
- In RTL the pointer's x maps mirrored on timelines and the inline end edge
  is on the left.

<!-- demo: scheduler-drag-drop -->

## Export and import

`exportToCsv` writes RFC 4180 CSV without a writer package and escapes
spreadsheet formulas in text cells by default (`escapeFormulas: false`
restores raw output). `exportToExcel`,
`exportToICalendar` and `importICalendar` load their writer from
`exportWriters`, dynamic imports of `@salmonui/export` subpaths, so
the writers stay out of your bundle until the first call:

```tsx
<Scheduler
  ref={apiRef}
  data={events}
  exportWriters={{ excel: () => import('@salmonui/export/xlsx'), ics: () => import('@salmonui/export/ics') }}
  onBeforeExport={(e) => e.format === 'excel' && !canExport && e.preventDefault()}
/>;

await apiRef.current.exportToExcel({ fields: ['title', 'start', 'end'], headerTexts: { title: 'Subject' }, fileName: 'week' });
await apiRef.current.exportToCsv({ includeOccurrences: true, separator: ';' });
await apiRef.current.exportToICalendar({ calendarName: 'Team' });
await apiRef.current.importICalendar(file); // a File, Blob or text; fires onBeforeAdd / onAdd
```

Each export resolves to `{ fileName, mimeType, data }` (null when
`onBeforeExport` prevents it), fires `onExport` with the file, and downloads
it unless `download: false`. `fields` pick roles (`title`), mapped properties
or other row properties; `includeOccurrences` writes one row per occurrence of
the visible range (or `range`); `rows` exports other rows. Dates are written in the Scheduler zone: zoned ISO 8601 in CSV,
date-time cells in XLSX. iCalendar timed events use TZID wall times (UTC with
`utc: true`), series carry their RRULE and deleted occurrences as EXDATE, and
edited occurrences are VEVENTs with a RECURRENCE-ID; on import, EXDATE and
RECURRENCE-ID values become `recurrenceExceptions`.

<!-- demo: scheduler-export-print -->

## Context menu

`contextMenu` opens the Menu family's `ContextMenu` on cells and events:
right-click, a touch long-press, Shift+F10 or the ContextMenu
key on a focused cell or event. `true` shows the default items, built from
`localeText`: **New event**, **New recurring event** (the editor opens with a
daily rule) and **Today** on cells, **Edit** and **Delete** on events (with
the recurrence scope and delete prompts). An array shows the same items
everywhere; a function returns the items for each target, and an empty array
or `null` leaves the browser's own menu:

```tsx
import '@salmonui/buttons/menu/styles.css';

<Scheduler
  data={events}
  contextMenu={(ctx) =>
    ctx.kind === 'event'
      ? [{ id: 'duplicate', label: 'Duplicate' }, { type: 'separator' }, { id: 'delete', label: 'Delete' }]
      : [{ id: 'newEvent', label: 'New event' }]
  }
  onContextMenuItemClick={(e) => {
    if (e.id === 'duplicate' && e.context.kind === 'event') duplicate(e.context.row);
  }}
/>;
```

The context is `{ kind: 'cell', start, end, allDay, resources, element }`
(the whole selected range when the cell is in it; `resources` holds the
resource ids of the cell's group) or `{ kind: 'event', occurrence, row,
element }`.
`onContextMenuItemClick` receives `{ id, item, context, source }`; the default
ids (`newEvent`, `newRecurringEvent`, `today`, `edit`, `delete`) run their
action unless you call `preventDefault()`. The menu is a lazy chunk loaded
when the browser is idle after mount (a request before that opens once it
loads), and its styles are the Menu family's: import
`@salmonui/buttons/menu/styles.css` next to the Scheduler stylesheet. Focus
returns to the cell or event when the menu closes.

## Tooltips

`tooltip` shows Layout's `Tooltip` on events: after a short hover delay, and at once when an event gets
keyboard focus. It shows the title, the time range and the location;
`tooltip={{ render }}` replaces the content. `onBeforeTooltipOpen` receives
`{ occurrence, row, element, source }` and `preventDefault()` keeps the
tooltip closed; `api.closeTooltip()` closes it. Escape, leaving the event,
blur and a press close it, and the event is described by the tooltip while
it is open. One tooltip serves every event (a lazy chunk with delegated
listeners, so the events render no extra markup); import
`@salmonui/overlays/tooltip/styles.css` next to the Scheduler stylesheet.

```tsx
import '@salmonui/overlays/tooltip/styles.css';

<Scheduler data={events} tooltip={{ render: ({ row }) => `${row.title} · ${row.owner}` }} onBeforeTooltipOpen={(e) => e.row.private && e.preventDefault()} />;
```

## Print

`api.print({ height, width })` prints the rendered view: a copy
of the Scheduler goes into a print-only container (inside a copy of its
theme scope, so the colors match), the rest of the page is hidden while the
browser's print dialog is open, and `window.print()` runs. Without `height`
the scroll areas grow to their content, so a day or week view prints every
hour; numbers are pixels, strings any CSS length (`'20cm'`). `onBeforePrint`
receives the options and `preventDefault()` cancels (the promise resolves
`false`); `onAfterPrint` fires with the window's `afterprint`, after the
copy is removed. The print code is a lazy chunk loaded by the first call.

```tsx
<Scheduler ref={apiRef} data={events} onBeforePrint={(e) => !canPrint && e.preventDefault()} onAfterPrint={() => track('print')} />;

await apiRef.current.print({ width: '27cm' });
```

## Customizing

- `renderEvent(ctx)` renders the event content (`{ row, id, title, start,
  end, allDay, view, recurring, selected, timeText }`), per view through
  `views`.
- `getEventProps(ctx)` adds `className`, `style`, `data-*` or `hidden`;
`getCellProps(ctx)` does the same for cells, with
  `ctx.part: 'workCell' | 'monthCell' | 'allDayCell' | 'dateHeader' | ...`.
- `renderCell`, `renderCellHeader`, `renderDateHeader` and
  `renderHeaderIndent` render cell parts.
- `toolbar` lists the header items: `'previous'`, `'next'`, `'today'`,
  `'dateRange'`, `'newEvent'`, `'views'` and `{ id, label, align, onClick,
  render }` items; `toolbar={false}` hides the header and `renderToolbar`
  wraps it.
- `onCellClick`, `onCellDoubleClick`, `onEventClick` and `onEventDoubleClick`
  fire before the built-in popup or editor (`preventDefault()` skips it);
  `onHover` reports the part under the pointer.
- `cellSelection="multiple"` selects a time range by dragging or Shift+click
  (`onCellSelectionChange`, `api.getSelectedCells()`); `cellSelectionRows:
  false` keeps a drag in one day column (day views) or one row.
- `locale` and `localeText` (`SCHEDULER_DEFAULT_LOCALE_TEXT`, Data Grid
  message format) translate every string.
- `height`, `width`, `className` and `style` size the root.

<!-- demo: scheduler-templates -->

## Server rendering and theming

With `date`, `view` and an explicit `timeZone`, the server renders every
view with its events, including the timeline, year and agenda views and the
resource groups; today and the current time marker appear after hydration
only, and a virtualized timeline renders its `initialRange` rows.

Parts are `.salmon-scheduler__*` classes with state in `data-*` attributes
(`data-selected`, `data-work`, `data-has-events`, `data-today`,
`data-continues-start`, ...). Resource colors reach CSS as
`--salmon-scheduler-event-color` and are mixed against the theme seeds; in
forced colors mode events keep a system-color border. `dir="rtl"`
mirrors the layout and the navigation arrows.

## Built on

The editor dialog, alerts and popovers render on the client only. The
editor and alerts are Layout's `Dialog` (a modal `<dialog>`: contained Tab
order, Escape, focus back to the event); its `Select`, `DatePicker` and
`RecurrenceEditor` popups open inside the dialog, and Escape closes an open
popup before the dialog. The quick info and "+N more" popups are Layout's
`Popover`. `@salmonui/scheduler/styles.css` carries the rules of everything
the Scheduler renders (the dialog, popover, Select and DatePicker rules and
the plain button rules), so it is the only stylesheet besides
`@salmonui/core/styles.css`; only the lazy context menu and tooltip need
their own stylesheets (above).

## Performance

Occurrences are expanded and laid out for the visible range only; Month
keeps the visible lanes per cell in the DOM ("+N more" for the rest) and the
timeline renders a window of resource rows. Drag and resize move a copy of
the event outside React and commit once on drop. Gated on the production
build: a Week with 1,000 events
renders to painted within 39 ms, a Month with 5,000 events within 19 ms, a
Timeline Month with 1,000 resources and 10,000 events within 28 ms, and a
drag frame costs at most 2.7 ms of script (p95) with no React render per
pointer move.

## State and persistence

Components never write to browser storage, because server output must not
depend on it and the storage policy belongs to the application.
`api.getState()` returns `{ view, date, allDayExpanded }`, and
`api.restoreState(state)` accepts all or part of it. Scroll time and
expanded resources are not in the snapshot: keep them in your own state
and reapply them with `api.scrollToTime(time)` and
`api.expandResource(id)`.

```tsx
const ref = useRef<SchedulerApi<Meeting>>(null);

<Scheduler
  ref={ref}
  data={meetings}
  onReady={(api) => {
    const saved = localStorage.getItem('calendar');
    if (saved) api.restoreState(JSON.parse(saved));
  }}
/>;

// Later, for example when the user leaves the page:
localStorage.setItem('calendar', JSON.stringify(ref.current?.getState()));
```

## Lifecycle, events and templates

- **Templates.** Customize events with render props such as
  `renderEvent`. Salmon UI never renders HTML strings, so there are no
  string templates (they would need a runtime compiler that breaks a strict
  CSP) and no HTML sanitizer option. Text from data is always escaped; if
  you must render HTML, sanitize it in your application before it reaches a
  render prop.
- **Dialogs.** The editor and popups mount when they open, so a
  Scheduler that never opens them pays nothing at first render. Their code
  is a lazy chunk loaded on demand, with no prop that preloads it. Code that
  works with the editor DOM goes in `editing.renderDialog` or
  `onBeforePopupOpen`.
- **Agent tools.** WebMCP is a proposed browser API with no
  stable specification, and a component should not register agent tools
  on its own. Register your own tools over `SchedulerApi` methods such as
  `addEvents`, `saveEvent`, `deleteEvents`, `getEvents` and `setView`, with
  your own confirmation step.
- **Lifecycle.** React owns mounting and unmounting.
  `onReady(api)` fires once after the first commit; teardown code goes in
  an effect cleanup.
- **Action events.** Each action has a typed before / after
  pair: `onBeforeAdd` / `onAdd`, `onBeforeSave` / `onSave`,
  `onBeforeDelete` / `onDelete`, `onBeforeNavigate`, `onBeforeEventDrop`,
  and `onError({ error, action })` for failures. Payloads stay specific,
  event objects are only allocated for bound handlers, and
  `event.preventDefault()` cancels.

## API reference

The API reference for
[`@salmonui/scheduler`](/docs/reference/scheduler) lists every
prop, method and type.
