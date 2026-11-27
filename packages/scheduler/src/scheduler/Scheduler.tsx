'use client';

// Scheduler. It follows the Data Grid state model:
// options props are re-applied when they change, user actions fire
// before / after pairs that cancel with `preventDefault()`, `ref` receives
// the `SchedulerApi`, and the React layer reads the per-instance store
// through narrow `useSyncExternalStore` selectors. Events are instants laid
// out in the wall time of `timeZone`; the server renders a view only with
// `date`, `view` and an explicit `timeZone`, and today, the current time
// marker and the host zone are client-only.

import { Suspense, use, useEffect, useId, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { peekViews, preloadViews, readViews } from '#scheduler-views';
import { formatMessage, fromDays, intlSpaces as n, toPlainDate, type DateInput, type PlainDate } from '@salmonui/core/internal/dates/index';
import { holdInput, PRESS_EVENTS, replayInput } from '@salmonui/core/internal/held-input';
import { useHydrated } from '@salmonui/core/internal/hydrated';
import { useLocale, useLocaleText } from '@salmonui/core/internal/locale';
import { useTimeZone } from '@salmonui/calendars/internal/picker';
import { addEvents as addRows, deleteEvent as deleteRows, saveEvent as saveRows, type CrudContext, type EditScope, type WriteSet } from '../internal/scheduler/crud.js';
import { instantOf, type EventChanges } from '../internal/scheduler/fields.js';
import { deletedOccurrences, occurrenceAt, occurrencesIn, seriesStarts } from '../internal/scheduler/occurrences.js';
import { collisions, isSlotAvailable, validateOccurrenceMove, validateSeries } from '../internal/scheduler/rules.js';
import { createSchedulerStore, type CellSelection, type SchedulerPopupState } from '../internal/scheduler/store.js';
import { createZoneConverter, DAY_MS, MINUTE_MS, minutesOf, type ZoneConverter } from '../internal/scheduler/time.js';
import type { EventId, EventRecord, Occurrence } from '../internal/scheduler/types.js';
import { addMonthsDay, clampDay, navigateDay } from '../internal/scheduler/views.js';
import { SchedulerContext, useSchedulerSelector, type Formatters, type SchedulerActions, type SchedulerContextValue } from './context.js';
import { SCHEDULER_DEFAULT_LOCALE_TEXT, type SchedulerLocaleText } from './locale.js';
import { buildRecords, dayOf, layoutPage, pageModel, recordContext, resolveOptions, viewEntries, type ViewEntry } from './model.js';
import { familyOf, type ApiContext, type GateProps, type ResourcesModule, type ViewFamily, type ViewModules } from './families.js';
import type {
  SchedulerActionResult,
  SchedulerApi,
  SchedulerCellInfo,
  SchedulerDataSource,
  SchedulerEditing,
  SchedulerEventInfo,
  SchedulerEventSource,
  SchedulerExportFile,
  SchedulerProps,
  SchedulerQuickInfo,
  SchedulerToolbarItem,
} from './types.js';
import { cx, DayView, Icon, MonthView } from './views.js';
import type { EditorValues } from './editor.js';

type EditorModule = typeof import('./editor.js');
type DatePopupModule = typeof import('./date-popup.js');
type PopupsModule = typeof import('./popups.js');
const loadEditor = (): Promise<EditorModule> => import('./editor.js');
const loadDatePopup = (): Promise<DatePopupModule> => import('./date-popup.js');
const loadPopups = (): Promise<PopupsModule> => import('./popups.js');
type InteractModule = typeof import('./interact.js');
// One load per page (a load cache, not render state): the callbacks of every caller run in call order.
let interactLoad: Promise<InteractModule> | undefined;
const loadInteract = (): Promise<InteractModule> => (interactLoad ??= import('./interact.js'));
type DragModule = typeof import('./drag.js');
// The drag chunk is requested through the interaction chunk (no second import wrapper in the initial JS).
const loadDrag = (): Promise<DragModule> => loadInteract().then((m) => m.drag());
const loadMenu = (): Promise<typeof import('./context-menu.js')> => loadInteract().then((m) => m.menu());
const loadTooltip = (): Promise<typeof import('./tooltip.js')> => loadInteract().then((m) => m.tooltip());

/** Runs `cb` when the browser is idle (or after 300 ms); returns the cancel function. */
function onIdle(cb: () => void): () => void {
  const win = globalThis as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number; cancelIdleCallback?: (id: number) => void };
  if (win.requestIdleCallback) {
    const id = win.requestIdleCallback(cb, { timeout: 2000 });
    return () => win.cancelIdleCallback?.(id);
  }
  const id = setTimeout(cb, 300);
  return () => clearTimeout(id);
}

/** A lazy module: requested when idle after mount, at once when `needed`. */
function useLazy<T>(load: () => Promise<T>, needed: boolean, enabled: boolean): T | null {
  const [module, setModule] = useState<T | null>(null);
  useEffect(() => {
    if (module || !enabled) return;
    let live = true;
    const fetch = (): void => void load().then((m) => live && setModule(() => m));
    if (needed) fetch();
    const cancel = needed ? null : onIdle(fetch);
    return () => {
      live = false;
      cancel?.();
    };
  }, [load, needed, enabled, module]);
  return module;
}

/** Reads the view family modules (suspends while a chunk loads) and renders the family view, grouped when resources are set. */
function Gate(props: GateProps & { readonly needed: readonly ViewFamily[]; readonly family: 'timeline' | 'list' | null }) {
  const got = readViews(props.needed);
  const m = 'then' in got ? use(got as Promise<ViewModules>) : got;
  const View = props.family ? (m[props.family]?.View ?? null) : null;
  return m.resources ? <m.resources.Grouped {...props} View={View} /> : View ? <View {...props} /> : null;
}

const isSource = <Row,>(data: SchedulerProps<Row>['data']): data is SchedulerDataSource<Row> => !Array.isArray(data) && typeof (data as SchedulerDataSource<Row>)?.read === 'function';
const EMPTY: readonly never[] = Object.freeze([]);
const dayOfInput = (input: DateInput | undefined): number | null => {
  if (input === undefined) return null;
  const d = toPlainDate(input);
  return d ? dayOf(d) : null;
};

interface FireEvent {
  readonly type: string;
  readonly source: SchedulerEventSource;
  defaultPrevented: boolean;
  preventDefault(): void;
}

function makeEvent<T extends object>(type: string, source: SchedulerEventSource, fields: T): T & FireEvent {
  const e = {
    type,
    source,
    defaultPrevented: false,
    preventDefault() {
      e.defaultPrevented = true;
    },
    ...fields,
  };
  return e;
}

function defaultCreateId(ids: readonly EventId[]): EventId {
  let max = 0;
  let numeric = true;
  for (const id of ids) {
    if (typeof id === 'number') max = Math.max(max, id);
    else if (id !== undefined) numeric = false;
  }
  if (numeric) return max + 1;
  const c = globalThis.crypto as { randomUUID?: () => string } | undefined;
  return c?.randomUUID ? c.randomUUID() : `event-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function Scheduler<Row = Record<string, unknown>>(props: SchedulerProps<Row>) {
  const locale = useLocale(props.locale) ?? 'en-US';
  const text: SchedulerLocaleText = { ...SCHEDULER_DEFAULT_LOCALE_TEXT, ...useLocaleText('scheduler', props.localeText) };
  const t = (key: keyof SchedulerLocaleText, params?: Record<string, string | number>): string => formatMessage(text[key], params, locale);
  const hydrated = useHydrated();
  const zoneName = useTimeZone(props.timeZone);
  const zone = useMemo(() => (zoneName ? createZoneConverter(zoneName) : null), [zoneName]);
  const zones = useMemo(() => new Map<string, ZoneConverter>(), []);
  const baseId = useId();
  const id = (part: string): string => `${baseId}${part}`;
  const entries = viewEntries(props.views);
  const remote = isSource(props.data);
  const [store] = useState(() =>
    createSchedulerStore<Row>({
      view: props.view ?? entries[0]?.name ?? 'week',
      date: dayOfInput(props.date) ?? NaN,
      rows: Array.isArray(props.data) ? (props.data as readonly Row[]) : EMPTY,
      rowsVersion: 0,
      selectedCells: null,
      selectedEventKeys: EMPTY,
      popup: null,
      loading: false,
      pending: EMPTY,
      workHours: EMPTY,
      allDayExpanded: props.allDayRowExpanded ?? false,
      expandedResources: props.expandedResourceIds ?? null,
      inline: null,
      resourceId: props.selectedResourceId,
    }),
  );
  const anyStore = store as unknown as SchedulerContextValue['store'];
  // Options props are re-applied when they change.
  const prev = useRef({ view: props.view, date: dayOfInput(props.date), data: props.data, allDay: props.allDayRowExpanded, expanded: props.expandedResourceIds, res: props.selectedResourceId });
  useLayoutEffect(() => {
    const p = prev.current;
    const date = dayOfInput(props.date);
    const patch: Record<string, unknown> = {};
    if (props.view !== undefined && props.view !== p.view) patch['view'] = props.view;
    if (date !== null && date !== p.date) patch['date'] = date;
    if (props.data !== p.data && Array.isArray(props.data)) {
      patch['rows'] = props.data;
      patch['rowsVersion'] = store.getSnapshot().rowsVersion + 1;
    }
    if (props.allDayRowExpanded !== undefined && props.allDayRowExpanded !== p.allDay) patch['allDayExpanded'] = props.allDayRowExpanded;
    if (props.expandedResourceIds !== undefined && props.expandedResourceIds !== p.expanded) patch['expandedResources'] = props.expandedResourceIds;
    if (props.selectedResourceId !== p.res) patch['resourceId'] = props.selectedResourceId;
    prev.current = { view: props.view, date, data: props.data, allDay: props.allDayRowExpanded, expanded: props.expandedResourceIds, res: props.selectedResourceId };
    if (Object.keys(patch).length) store.set(patch);
  });
  const latest = useRef(props);
  useLayoutEffect(() => {
    latest.current = props;
    hostRef.current = interactHost;
  });

  const viewName = useSchedulerSelector(anyStore, (s) => s.view);
  const anchorState = useSchedulerSelector(anyStore, (s) => s.date);
  const rows = useSchedulerSelector(anyStore, (s) => s.rows) as readonly Row[];
  const popup = useSchedulerSelector(anyStore, (s) => s.popup);
  const loading = useSchedulerSelector(anyStore, (s) => s.loading);
  const allDayExpanded = useSchedulerSelector(anyStore, (s) => s.allDayExpanded);
  const workOverrides = useSchedulerSelector(anyStore, (s) => s.workHours);
  // Adaptive layout: `true` always; `{ breakpoint }` from the container width after mount.
  const compact = useSchedulerSelector(anyStore, (s) => s.compact);
  const adaptive = props.adaptive === true || (!!props.adaptive && compact === true);
  const breakpoint = typeof props.adaptive === 'object' ? (props.adaptive.breakpoint ?? 640) : null;
  useEffect(() => {
    const el = rootRef.current;
    if (breakpoint === null || !el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(([e]) => store.set({ compact: (e?.contentRect.width ?? 0) < breakpoint }));
    ro.observe(el);
    return () => ro.disconnect();
  }, [breakpoint]); // eslint-disable-line react-hooks/exhaustive-deps
  const [reloadToken, setReloadToken] = useState(0);
  const [, setRefresh] = useState(0);

  const entry: ViewEntry<Row> = entries.find((e) => e.name === viewName) ?? (entries[0] as ViewEntry<Row>);
  const opts = resolveOptions(props, entry, locale);
  const today = hydrated && zone ? zone.day(Date.now()) : null;
  const minDay = dayOfInput(props.min);
  const maxDay = dayOfInput(props.max);
  const anchor = Number.isFinite(anchorState) ? anchorState : today;
  const resDefs = props.resources ?? EMPTY;
  const resKey = resDefs.map((r) => `${r.field}${r.multiple ? '*' : ''}`).join();
  const resInfo = useMemo(() => resDefs.map((r) => ({ field: r.field, multiple: !!r.multiple })), [resKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const fieldsKey = JSON.stringify(props.eventFields ?? null);
  const rctx = useMemo(() => (zone ? recordContext(props.eventFields, zone, zones, resInfo) : null), [zone, fieldsKey, zones, resInfo]); // eslint-disable-line react-hooks/exhaustive-deps
  const records = useMemo(() => (rctx ? buildRecords(rows, rctx) : null), [rows, rctx]);
  const page = useMemo(() => (zone && anchor !== null ? pageModel(opts as never, anchor, zone) : null), [zone, anchor, entry, opts.view.firstDayOfWeek, opts.view.showWeekend, JSON.stringify(opts.view.workDays)]); // eslint-disable-line react-hooks/exhaustive-deps
  const occurrences = useMemo(() => (records && page && zone && rctx ? occurrencesIn(records.records, page.range, { zone, zoneFor: rctx.zoneFor }) : EMPTY), [records, page, zone, rctx]);
  const layout = useMemo(() => (page && zone ? layoutPage(occurrences as Occurrence<Row>[], opts, page, zone, props, allDayExpanded) : null), [occurrences, page, zone, allDayExpanded, opts.startMinute, opts.endMinute, JSON.stringify(props.eventLayout ?? null), props.autoRowHeight]); // eslint-disable-line react-hooks/exhaustive-deps

  const editingProp = props.editing;
  const editing: SchedulerEditing<Row> = typeof editingProp === 'object' ? editingProp : {};
  const editable = !opts.readOnly && editingProp !== false;
  const can = { add: editable && editing.add !== false, edit: editable && editing.edit !== false, delete: editable && editing.delete !== false };
  const quickInfo: SchedulerQuickInfo<Row> | null = props.quickInfo === false ? null : typeof props.quickInfo === 'object' ? props.quickInfo : {};
  const overlapAllowed = props.overlap !== false;

  // Formatters: wall-clock ms formatted with `timeZone: 'UTC'`, so no zone lookup per label.
  const fmt: Formatters = useMemo(() => {
    // Intl skips undefined options.
    const base = { timeZone: 'UTC', calendar: props.calendar, hourCycle: props.hourCycle } as Intl.DateTimeFormatOptions;
    const make = (o: Intl.DateTimeFormatOptions): Intl.DateTimeFormat => {
      try {
        return new Intl.DateTimeFormat(locale, { ...base, ...o });
      } catch {
        return new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', ...o });
      }
    };
    const time = make({ hour: 'numeric', minute: '2-digit' });
    const slot = make({ hour: 'numeric' });
    const weekday = make({ weekday: 'short' });
    const dayNum = make({ day: 'numeric' });
    const full = make({ dateStyle: 'full' });
    const md = make({ month: 'short', day: 'numeric' });
    const dateFmt = make(props.dateFormat ?? { dateStyle: 'medium' });
    // ICU versions (Node on the server, the browser on the client) differ in thin, narrow no-break and
    // no-break spaces; `n` (`intlSpaces`) normalizes them so server and client text match on hydration.
    return {
      time: (w) => n(time.format(w)),
      slot: (w) => n(slot.format(w)),
      weekday: (d) => n(weekday.format(d * DAY_MS)),
      dayNumber: (d) => n(dayNum.format(d * DAY_MS)),
      fullDate: (d) => n(full.format(d * DAY_MS)),
      monthDay: (d) => n(md.format(d * DAY_MS)),
      range: (o) => {
        if (!zone) return '';
        if (o.allDay) {
          const s = zone.day(o.start);
          const e = zone.day(o.end - 1);
          return n(s === e ? dateFmt.format(s * DAY_MS) : dateFmt.formatRange(s * DAY_MS, e * DAY_MS));
        }
        const ws = zone.wall(o.start);
        const we = zone.wall(o.end);
        if (Math.floor(ws / DAY_MS) === Math.floor(we / DAY_MS)) return n(`${time.format(ws)} – ${time.format(we)}`);
        return n(`${dateFmt.format(ws)} ${time.format(ws)} – ${dateFmt.format(we)} ${time.format(we)}`);
      },
    };
  }, [locale, props.calendar, props.hourCycle, JSON.stringify(props.dateFormat ?? null), zone]); // eslint-disable-line react-hooks/exhaustive-deps

  const rangeText = n((() => {
    if (!page || anchor === null) return '';
    const first = page.days[0] ?? anchor;
    const last = page.days[page.days.length - 1] ?? anchor;
    try {
      if (page.weeks) {
        const months = Math.max(1, opts.view.interval);
        const f = new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric', timeZone: 'UTC', ...(props.calendar ? { calendar: props.calendar } : {}) });
        return months === 1 ? f.format(anchor * DAY_MS) : f.formatRange(anchor * DAY_MS, addMonthsDay(anchor, months - 1) * DAY_MS);
      }
      const f = new Intl.DateTimeFormat(locale, { ...(props.dateFormat ?? { month: 'short', day: 'numeric', year: 'numeric' }), timeZone: 'UTC', ...(props.calendar ? { calendar: props.calendar } : {}) });
      return first === last ? new Intl.DateTimeFormat(locale, { dateStyle: 'full', timeZone: 'UTC' }).format(first * DAY_MS) : f.formatRange(first * DAY_MS, last * DAY_MS);
    } catch {
      return `${fromDays(first)} – ${fromDays(last)}`;
    }
    // ICU versions differ in the spaces around range separators (thin, narrow no-break or plain), so
    // the server (Node) and the browser could print different text: normalize them to plain spaces.
  })());

  // -------------------------------------------------------------------------
  // Remote data: one read per visible range, aborted when superseded or unmounted.
  // -------------------------------------------------------------------------
  const vs = opts.entry.virtualScroll ?? props.virtualScroll;
  const lazyKey = useSchedulerSelector(anyStore, (s) => (typeof vs === 'object' && vs.lazyLoad ? (s.rendered?.key ?? '') : null));
  const rangeKey = page ? `${page.range.start}:${page.range.end}` : '';
  useEffect(() => {
    if (!remote || !page) return;
    const source = props.data as SchedulerDataSource<Row>;
    const ctrl = new AbortController();
    const range = { start: new Date(page.range.start), end: new Date(page.range.end) };
    store.set({ loading: true });
    // The read runs in the interaction chunk (asynchronous either way).
    const req = { range, view: entry.type, signal: ctrl.signal, ...(lazyKey !== null ? { resourceIds: store.getSnapshot().rendered?.ids ?? [] } : {}) };
    void withInteract().then((m) => m.remoteRead(store, latest, source, req));
    return () => ctrl.abort();
  }, [remote, props.data, rangeKey, entry.type, reloadToken, lazyKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const writes = useRef(new Set<AbortController>());
  useEffect(() => {
    const set = writes.current;
    return () => {
      for (const c of set) c.abort();
    };
  }, []);

  // -------------------------------------------------------------------------
  // Actions
  // -------------------------------------------------------------------------
  const rootRef = useRef<HTMLDivElement | null>(null);
  const crudCtx = (): CrudContext<Row> | null => {
    if (!rctx || !zone) return null;
    const p = latest.current;
    const ed = typeof p.editing === 'object' ? p.editing : {};
    const idOf = (r: Row): EventId => (r as Record<string, unknown>)[rctx.fields.id] as EventId;
    // Ids made in one write count for the next row of the same batch (paste, import).
    const made: EventId[] = [];
    const createId = (r: Row): EventId => {
      const v = ed.createId ? ed.createId(r) : defaultCreateId([...store.getSnapshot().rows.map(idOf), ...made]);
      made.push(v);
      return v;
    };
    return { ...rctx, resourceInfo: resInfo, idOf, createId };
  };
  const currentRecords = () => (rctx ? buildRecords(store.getSnapshot().rows, rctx) : null);

  const navigateTo = (view: string, date: number, kind: 'date' | 'view', source: SchedulerEventSource): boolean => {
    const s = store.getSnapshot();
    const prevDate = Number.isFinite(s.date) ? s.date : (today ?? date);
    const clamped = clampDay(date, minDay, maxDay);
    if (view === s.view && clamped === prevDate) return false;
    const p = latest.current;
    if (p.onBeforeNavigate) {
      const e = makeEvent('beforeNavigate', source, { kind, view, date: fromDays(clamped), previousView: s.view, previousDate: fromDays(prevDate) });
      p.onBeforeNavigate(e);
      if (e.defaultPrevented) return false;
    }
    // Data Grid model: user actions change the Scheduler state; `view` / `date` props are re-applied only when they change.
    store.set({ view, date: clamped, selectedCells: null, popup: null, rendered: null });
    if (view !== s.view) p.onViewChange?.(view, { type: 'viewChange', source, view, previousView: s.view });
    if (clamped !== prevDate) p.onDateChange?.(fromDays(clamped), { type: 'dateChange', source, date: fromDays(clamped), previousDate: fromDays(prevDate) });
    return true;
  };

  const navigate = (dir: 'previous' | 'next' | 'today', source: SchedulerEventSource): void => {
    if (anchor === null) return;
    const target = dir === 'today' ? (zone ? zone.day(Date.now()) : anchor) : navigateDay(opts.view, anchor, dir === 'next' ? 1 : -1);
    navigateTo(viewName, target, 'date', source);
  };

  const openPopup = (next: SchedulerPopupState, row: Row | null, start: number | null, end: number | null, source: SchedulerEventSource): boolean => {
    const p = latest.current;
    if (p.onBeforePopupOpen) {
      const e = makeEvent('beforePopupOpen', source, { popup: next.kind, row, start: start === null ? null : new Date(start), end: end === null ? null : new Date(end) });
      p.onBeforePopupOpen(e);
      if (e.defaultPrevented) return false;
    }
    store.set({ popup: next });
    return true;
  };
  const closePopup = (source: SchedulerEventSource = 'api'): void => {
    const cur = store.getSnapshot().popup;
    if (!cur) return;
    store.set({ popup: null });
    const occ = cur.key ? findOccurrence(cur.key) : null;
    latest.current.onPopupClose?.({ type: 'popupClose', source, popup: cur.kind, row: (occ?.event.row as Row | undefined) ?? null });
    const rf = cur.returnFocus as HTMLElement | null | undefined;
    if (rf && rf.isConnected) requestAnimationFrame(() => rf.focus());
  };

  const findOccurrence = (key: string): Occurrence<Row> | null => {
    const recs = currentRecords();
    if (!recs || !zone || !rctx) return null;
    const at = key.lastIndexOf('@');
    const idText = at > 0 ? key.slice(0, at) : key;
    const rec = recs.records.find((r) => String(r.id) === idText);
    if (!rec) return null;
    if (at > 0 && rec.recurrenceRule) return occurrenceAt(rec, Number(key.slice(at + 1)), { zone, zoneFor: rctx.zoneFor });
    return { key: idText, eventId: rec.id, start: rec.start, end: rec.end, allDay: rec.allDay, generated: false, seriesId: rec.recurrenceId, event: rec };
  };

  /** Applies a write set: local copy, after-event, remote write with pending state and revert. */
  const commit = (action: 'add' | 'save' | 'delete', set: WriteSet<Row>, scope: EditScope, source: SchedulerEventSource): SchedulerActionResult<Row> => {
    const before = store.getSnapshot().rows;
    store.set((s) => ({ rows: set.rows, rowsVersion: s.rowsVersion + 1 }));
    const p = latest.current;
    if (action === 'add') p.onAdd?.({ type: 'add', source, rows: set.added, data: set.rows });
    else if (action === 'save') p.onSave?.({ type: 'save', source, added: set.added, changed: set.changed.map((c) => c.row), deleted: set.deleted, scope, data: set.rows });
    else p.onDelete?.({ type: 'delete', source, deleted: set.deleted, changed: set.changed.map((c) => c.row), scope, data: set.rows });
    const src = isSource(p.data) ? p.data : null;
    if (!src?.write) return { status: 'applied', rows: [...set.added, ...set.changed.map((c) => c.row)] };
    // The write itself runs in the interaction chunk (asynchronous either way); the controller exists now, so an unmount aborts it.
    const ctrl = new AbortController();
    writes.current.add(ctrl);
    void withInteract().then((m) => m.remoteWrite({ store, latest, writes: writes.current, ctx: crudCtx(), src, set, action, before, ctrl }));
    return { status: 'pending', rows: [...set.added, ...set.changed.map((c) => c.row)] };
  };

  const overlapCheck = (row: Row, start: number, end: number, excludeId: EventId | undefined, excludeOccurrenceStart: number | undefined, source: SchedulerEventSource, resources?: EventRecord<Row>['resources']): boolean => {
    const recs = currentRecords();
    if (!recs || !zone || !rctx) return true;
    const hits = collisions(recs.records, { start, end, excludeId, excludeOccurrenceStart, resources }, { zone, zoneFor: rctx.zoneFor }, latest.current.overlap === false);
    if (!hits.length) return true;
    const p = latest.current;
    const e = makeEvent('overlap', source, { row, conflicts: hits.map((h) => h.event.row) });
    p.onOverlap?.(e);
    if (!e.defaultPrevented) store.set({ popup: { kind: 'overlapAlert', message: hits.some((h) => h.event.block) ? t('blockedMessage') : t('overlapMessage'), returnFocus: globalThis.document?.activeElement ?? null } });
    return false;
  };

  const doAdd = (newRows: readonly Row[], source: SchedulerEventSource): SchedulerActionResult<Row> => {
    const ctx = crudCtx();
    if (!ctx) return { status: 'rejected', rows: [], reason: 'unresolved time zone' };
    const p = latest.current;
    for (const r of newRows) {
      const rec = buildRecords([r], ctx).records[0];
      if (rec && !overlapCheck(r, rec.start, rec.end, undefined, undefined, source, rec.resources)) return { status: 'rejected', rows: [], reason: 'overlap' };
    }
    if (p.onBeforeAdd) {
      const e = makeEvent('beforeAdd', source, { rows: newRows });
      p.onBeforeAdd(e);
      if (e.defaultPrevented) return { status: 'cancelled', rows: [] };
    }
    return commit('add', addRows(store.getSnapshot().rows, newRows, ctx), 'series', source);
  };

  const doSave = (target: Occurrence<Row>, changes: EventChanges, scopeIn: EditScope, source: SchedulerEventSource): SchedulerActionResult<Row> => {
    const ctx = crudCtx();
    const recs = currentRecords();
    if (!ctx || !recs || !zone) return { status: 'rejected', rows: [] };
    const rec = recs.byId.get(target.eventId) ?? target.event;
    const p = latest.current;
    const ed = typeof p.editing === 'object' ? p.editing : {};
    let scope = scopeIn;
    const series = rec.recurrenceRule && rec.recurrenceId === undefined;
    const start = changes.start ?? target.start;
    const end = changes.end ?? target.end;
    if (ed.validateRecurrence !== false) {
      const rule = changes.recurrenceRule === undefined ? rec.recurrenceRule : changes.recurrenceRule;
      const problem = (rule && scope !== 'occurrence' ? validateSeries(rule, start, end) : null) ?? (series && scope === 'occurrence' && target.generated ? validateOccurrenceMove(rec, target.start, start, end, { zone, zoneFor: ctx.zoneFor }) : null);
      if (problem) {
        store.set({ popup: { kind: 'validationAlert', message: t(problem), returnFocus: globalThis.document?.activeElement ?? null } });
        return { status: 'rejected', rows: [], reason: problem };
      }
    }
    const draft = { ...(rec.row as object) } as Row;
    if (!overlapCheck(draft, start, end, rec.id, target.generated ? target.start : undefined, source, changes.resources ?? rec.resources)) return { status: 'rejected', rows: [], reason: 'overlap' };
    if (p.onBeforeSave) {
      const e = makeEvent('beforeSave', source, {
        row: draft,
        previous: rec.row,
        scope,
        occurrenceStart: target.generated ? new Date(target.start) : null,
        setScope(s: EditScope) {
          scope = s;
          (e as { scope: EditScope }).scope = s;
        },
      });
      p.onBeforeSave(e);
      if (e.defaultPrevented) return { status: 'cancelled', rows: [] };
    }
    const children = recs.children.get(series ? rec.id : (rec.recurrenceId ?? rec.id)) ?? [];
    const set = saveRows(store.getSnapshot().rows, { event: rec, occurrenceStart: series && target.generated ? target.start : undefined }, changes, scope, children, ctx);
    return commit('save', set, scope, source);
  };

  const doDelete = (target: Occurrence<Row>, scopeIn: EditScope, source: SchedulerEventSource): SchedulerActionResult<Row> => {
    const ctx = crudCtx();
    const recs = currentRecords();
    if (!ctx || !recs) return { status: 'rejected', rows: [] };
    const rec = recs.byId.get(target.eventId) ?? target.event;
    let scope = scopeIn;
    const p = latest.current;
    if (p.onBeforeDelete) {
      const e = makeEvent('beforeDelete', source, {
        rows: [rec.row],
        scope,
        occurrenceStart: target.generated ? new Date(target.start) : null,
        setScope(s: EditScope) {
          scope = s;
          (e as { scope: EditScope }).scope = s;
        },
      });
      p.onBeforeDelete(e);
      if (e.defaultPrevented) return { status: 'cancelled', rows: [] };
    }
    const seriesId = rec.recurrenceId ?? rec.id;
    const series = recs.byId.get(seriesId);
    const children = recs.children.get(seriesId) ?? [];
    const set = deleteRows(store.getSnapshot().rows, { event: rec, occurrenceStart: target.generated ? target.start : undefined }, scope, children, rec.recurrenceId !== undefined ? series : undefined, ctx);
    return commit('delete', set, scope, source);
  };

  const isRecurring = (o: Occurrence<Row>): boolean => o.seriesId !== undefined;

  const openEditorFor = (o: Occurrence<Row> | null, cells: CellSelection | null, mode: 'add' | 'edit' | 'editOccurrence' | 'editSeries', source: SchedulerEventSource, scope: EditScope = 'series', title = '', rule?: string): void => {
    const p = latest.current;
    const ed = typeof p.editing === 'object' ? p.editing : {};
    if (ed.dialog === false) return;
    const start = o ? o.start : (cells?.start ?? 0);
    const end = o ? o.end : (cells?.end ?? 0);
    openPopup({ kind: 'editor', key: o?.key, cells: cells ?? undefined, mode, payload: { scope, title, rule }, returnFocus: globalThis.document?.activeElement ?? null }, (o?.event.row as Row | undefined) ?? null, start, end, source);
  };

  const requestEdit = (o: Occurrence<Row>, source: SchedulerEventSource): void => {
    if (!can.edit || o.event.readOnly || o.event.block) return;
    const ed = typeof latest.current.editing === 'object' ? latest.current.editing : {};
    if (isRecurring(o) && ed.recurrencePrompt !== false) {
      openPopup({ kind: 'recurrenceAlert', key: o.key, action: 'edit', returnFocus: globalThis.document?.activeElement ?? null }, o.event.row, o.start, o.end, source);
      return;
    }
    openEditorFor(o, null, isRecurring(o) ? 'editSeries' : 'edit', source, 'series');
  };

  const requestDelete = (o: Occurrence<Row>, source: SchedulerEventSource): void => {
    if (!can.delete || o.event.readOnly) return;
    const ed = typeof latest.current.editing === 'object' ? latest.current.editing : {};
    if (isRecurring(o) && ed.recurrencePrompt !== false) openPopup({ kind: 'recurrenceAlert', key: o.key, action: 'delete', returnFocus: globalThis.document?.activeElement ?? null }, o.event.row, o.start, o.end, source);
    else openPopup({ kind: 'deleteAlert', key: o.key, returnFocus: globalThis.document?.activeElement ?? null }, o.event.row, o.start, o.end, source);
  };

  const newRowFor = (cells: CellSelection, title: string): Row => {
    const f = rctx?.fields;
    const p = latest.current;
    const row: Record<string, unknown> = {};
    if (f) {
      for (const [role, cfg] of Object.entries(p.eventFields ?? {})) {
        if (typeof cfg === 'object' && cfg.defaultValue !== undefined) row[(f as unknown as Record<string, string>)[role] ?? role] = cfg.defaultValue;
      }
      row[f.title] = title || (row[f.title] as string | undefined) || '';
      row[f.start] = new Date(cells.start);
      row[f.end] = new Date(cells.end);
      row[f.allDay] = cells.allDay;
      putRes(row, cells.resources);
    }
    return row as Row;
  };
  /** Writes resource ids: an array for `multiple` resources, else the first id. */
  const putRes = (row: Record<string, unknown>, src: Readonly<Record<string, unknown>> | undefined): void => {
    for (const x of resInfo) {
      const ids = src?.[x.field] as readonly unknown[] | undefined;
      if (ids?.length) row[x.field] = x.multiple ? [...ids] : ids[0];
    }
  };

  const refocus = (key: string | undefined, host: Element | null): void => {
    requestAnimationFrame(() => {
      const el = (key ? rootRef.current?.querySelector<HTMLElement>(`.salmon-scheduler__event[data-key="${CSS.escape(key)}"]`) : null) ?? (host as HTMLElement | null);
      if (el?.isConnected) el.focus({ preventScroll: true });
    });
  };

  const actions: SchedulerActions = {
    cellClick(start, end, allDay, element, source, double, res) {
      const p = latest.current;
      const e = makeEvent(double ? 'cellDoubleClick' : 'cellClick', source, { start: new Date(start), end: new Date(end), allDay, element });
      (double ? p.onCellDoubleClick : p.onCellClick)?.(e);
      const sel = store.getSnapshot().selectedCells;
      const keep = sel && sel.allDay === allDay && sel.group === res?.key && start >= sel.start && start < sel.end && !double;
      const cells: CellSelection = keep && sel ? sel : { start, end, allDay, group: res?.key, resources: res?.path };
      if (!keep) {
        store.set({ selectedCells: cells, selectedEventKeys: EMPTY });
        p.onCellSelectionChange?.({ type: 'cellSelectionChange', source, start: new Date(cells.start), end: new Date(cells.end), allDay });
      }
      if (e.defaultPrevented || !can.add) return;
      if (double) openEditorFor(null, cells, 'add', source);
      else if (quickInfo && element && !(typeof p.editing === 'object' && p.editing.inline)) openPopup({ kind: 'quickInfo', cells, anchor: element, returnFocus: element }, null, cells.start, cells.end, source);
    },
    cellSelect(start, end, allDay, extend, res) {
      const p = latest.current;
      const cur = store.getSnapshot().selectedCells;
      const g = { group: res?.key, resources: res?.path };
      const cells: CellSelection = extend && cur && cur.allDay === allDay && cur.group === g.group ? { start: Math.min(cur.start, start), end: Math.max(cur.end, end), allDay, ...g } : { start, end, allDay, ...g };
      store.set({ selectedCells: cells, selectedEventKeys: EMPTY });
      p.onCellSelectionChange?.({ type: 'cellSelectionChange', source: 'pointer', start: new Date(cells.start), end: new Date(cells.end), allDay });
      const qi = typeof p.quickInfo === 'object' ? p.quickInfo : null;
      const el = rootRef.current?.querySelector(`[data-cell-start="${cells.start}"]${allDay ? '[data-all-day-cell]' : ':not([data-all-day-cell])'}${res ? `[data-resource="${CSS.escape(res.key)}"]` : ''}`) ?? null;
      if (qi?.onSelectionEnd && can.add && el) openPopup({ kind: 'quickInfo', cells, anchor: el, returnFocus: el }, null, cells.start, cells.end, 'pointer');
    },
    eventClick(o, element, source, double, additive, selKey) {
      const occ = o as Occurrence<Row>;
      const p = latest.current;
      const e = makeEvent(double ? 'eventDoubleClick' : 'eventClick', source, { row: occ.event.row, start: new Date(occ.start), end: new Date(occ.end), element });
      (double ? p.onEventDoubleClick : p.onEventClick)?.(e);
      const k = selKey ?? occ.key;
      const ix = interactRef.current;
      if (ix) ix.selectEvent(interactHost(), occ, k, additive, source);
      else void withInteract().then((m) => m.selectEvent(interactHost(), occ, k, additive, source));
      if (e.defaultPrevented) return;
      if (double) requestEdit(occ, source);
      else if (quickInfo && element) openPopup({ kind: 'quickInfo', key: occ.key, anchor: element, returnFocus: element }, occ.event.row, occ.start, occ.end, source);
    },
    moreClick(day, element, source) {
      const p = latest.current;
      const dayOcc = (occurrences as Occurrence<Row>[]).filter((o) => zone && zone.day(o.start) <= day && zone.day(Math.max(o.start, o.end - 1)) >= day);
      if (p.onMoreEventsClick) {
        let target: string | null = null;
        const e = makeEvent('moreEventsClick', source, { date: fromDays(day), rows: dayOcc.map((o) => o.event.row), navigate: (v: string) => void (target = v) });
        p.onMoreEventsClick(e);
        if (target) {
          navigateTo(target, day, 'view', source);
          return;
        }
        if (e.defaultPrevented) return;
      }
      if (element) openPopup({ kind: 'moreEvents', day, anchor: element, returnFocus: element }, null, null, null, source);
    },
    goToDay(day, source) {
      const dayEntry = entries.find((e) => e.type === 'day');
      navigateTo(dayEntry?.name ?? viewName, day, dayEntry ? 'view' : 'date', source);
    },
    toggleAllDay() {
      const next = !store.getSnapshot().allDayExpanded;
      const p = latest.current;
      if (p.allDayRowExpanded === undefined) store.set({ allDayExpanded: next });
      p.onAllDayRowExpandedChange?.(next);
    },
    inlineStart(target, text) {
      const ed = typeof latest.current.editing === 'object' ? latest.current.editing : {};
      if (!ed.inline) return false;
      if ('key' in target) {
        const occ = findOccurrence(target.key);
        if (!occ || !can.edit || occ.event.readOnly || occ.event.block) return false;
        store.set({ inline: { key: target.key, text }, popup: null });
        return true;
      }
      if (!can.add) return false;
      store.set({ inline: { cells: target.cells, text }, popup: null });
      return true;
    },
    inlineCommit(text, host) {
      const cur = store.getSnapshot().inline;
      if (!cur) return;
      store.set({ inline: null });
      if (cur.cells) {
        if (text.trim()) doAdd([newRowFor(cur.cells, text)], 'keyboard');
      } else if (cur.key) {
        const occ = findOccurrence(cur.key);
        // A title edit of a series occurrence changes the series.
        if (occ && text !== occ.event.title) doSave(occ.generated ? { ...occ, start: occ.event.start, end: occ.event.end, generated: false } : occ, { title: text }, 'series', 'keyboard');
      }
      refocus(cur.key, host);
    },
    inlineCancel(host) {
      const cur = store.getSnapshot().inline;
      if (!cur) return;
      store.set({ inline: null });
      refocus(cur.key, host);
    },
    hover(part, o, start, element) {
      const h = latest.current.onHover;
      if (!h) return;
      h({ type: 'hover', source: 'pointer', part, row: (o?.event.row as Row | undefined) ?? null, start: start === null ? null : new Date(start), element });
    },
  };

  // Work hours overrides feed the cell context.
  const workOverride = (day: number): { start: number; end: number } | null => {
    const o = workOverrides.find((w) => w.day === day);
    return o ? { start: o.start, end: o.end } : null;
  };

  const [handle] = useState((): SchedulerContextValue['handle'] => ({ current: {} }));
  const ctxValue: SchedulerContextValue = {
    store: anyStore,
    props: props as unknown as SchedulerProps<unknown>,
    opts: opts as never,
    zone: zone as ZoneConverter,
    locale,
    text,
    t,
    fmt,
    actions,
    view: entry.type,
    today,
    editable,
    cellProps: (c) => {
      if (c.part === 'workCell') {
        const w = workOverride(dayOf(c.date));
        if (w && zone) {
          const m = (zone.wall(c.start.getTime()) - dayOf(c.date) * DAY_MS) / MINUTE_MS;
          const work = m >= w.start && m < w.end;
          const base = latest.current.getCellProps?.({ ...c, work });
          return { ...base, 'data-work': work ? '' : undefined, 'data-work-override': '' };
        }
      }
      return latest.current.getCellProps?.(c);
    },
    id,
    handle,
    adaptive,
    root: rootRef,
    scrollStart: (el) => scrollToTime(props.scrollTime, el),
  };

  // -------------------------------------------------------------------------
  // Scroll to the work start: the time grid calls ctx.scrollStart
  // when it mounts and on view change (views.tsx DayView).
  // -------------------------------------------------------------------------
  const scrollToTime = (time: Parameters<typeof minutesOf>[0], el = rootRef.current?.querySelector<HTMLElement>('.salmon-scheduler__time-scroll')): void => {
    if (el) el.scrollTop = ((minutesOf(time, opts.workStart) - opts.startMinute) / (opts.endMinute - opts.startMinute)) * el.scrollHeight;
  };

  // -------------------------------------------------------------------------
  // SchedulerApi (-08, -22, -32, -34, -37, -43, -47, -49, -51, -78, -09)
  // -------------------------------------------------------------------------
  const info = (o: Occurrence<Row>): SchedulerEventInfo<Row> => ({ row: o.event.row, id: o.eventId, start: new Date(o.start), end: new Date(o.end), allDay: o.allDay, seriesId: o.seriesId ?? null, occurrenceStart: o.generated ? new Date(o.start) : null });
  const occurrenceFromTarget = (id: EventId, occurrenceStart?: Date): Occurrence<Row> | null => findOccurrence(occurrenceStart ? `${String(id)}@${occurrenceStart.getTime()}` : String(id));
  // Resource methods live in the resources chunk (loaded whenever `resources` is set).
  const res = (name: Exclude<keyof ResourcesModule, 'Grouped'>, ...args: unknown[]): never => {
    const m = peekViews().resources as unknown as Record<string, ((c: ApiContext, ...a: unknown[]) => unknown) | undefined> | undefined;
    return m?.[name]?.({ store: anyStore, props: latest.current as unknown as SchedulerProps<unknown>, handle }, ...args) as never;
  };
  // Interaction chunk: loaded on the first focus or pointer down.
  const interactRef = useRef<InteractModule | null>(null);
  // Set by the tooltip chunk.
  const closeTip = useRef<(() => void) | null>(null);
  const withInteract = (): Promise<InteractModule> =>
    loadInteract().then((m) => {
      interactRef.current = m;
      return m;
    });
  const preloadInteract = (): void => {
    if (!interactRef.current) void withInteract();
  };
  // Drag chunk: loaded on the first pointer down; a drag group loads it when idle.
  const dragRef = useRef<DragModule | null>(null);
  const withDrag = (): Promise<DragModule> => loadDrag().then((m) => (dragRef.current = m));
  const getHost = () => hostRef.current();
  const group = props.dragOptions?.group;
  const dragModule = useLazy(loadDrag, false, hydrated && !!group);
  useEffect(() => dragModule?.join(group, rootRef.current, getHost), [dragModule, group]); // eslint-disable-line react-hooks/exhaustive-deps
  const interactHost = (): import('./drag.js').DragHost<Row> => ({
    opts,
    can,
    fmt,
    find: findOccurrence,
    save: doSave,
    remove: doDelete,
    store,
    props: latest.current,
    root: rootRef.current,
    occurrences: occurrences as Occurrence<Row>[],
    records: currentRecords()?.records ?? null,
    rctx,
    range: page?.range ?? null,
    locale,
    views: entries,
    anchor,
    navigateTo: (v, d) => navigateTo(v, d, 'view', 'keyboard'),
    navigate: (d, s = 'keyboard') => navigate(d, s),
    requestDelete: (o) => requestDelete(o, 'keyboard'),
    addEvents: (r) => doAdd(r, 'api'),
    saveRow: (r) => api.saveEvent(r),
    clip,
  });
  const [clip] = useState((): { current: import('./interact.js').SchedulerClipboard<Row> | null } => ({ current: null }));
  const hostRef = useRef(interactHost);
  const selectedIdsKey = props.selectedEventIds === undefined ? null : JSON.stringify(props.selectedEventIds);
  useLayoutEffect(() => {
    if (selectedIdsKey === null) return;
    const ids = new Set((JSON.parse(selectedIdsKey) as EventId[]).map(String));
    const keys = (occurrences as Occurrence<Row>[]).filter((o) => ids.has(String(o.eventId)) || (o.seriesId !== undefined && ids.has(String(o.seriesId)))).map((o) => o.key);
    const cur = store.getSnapshot().selectedEventKeys;
    if (keys.length !== cur.length || keys.some((k, i) => k !== cur[i])) store.set({ selectedEventKeys: keys.length ? keys : EMPTY });
  }, [selectedIdsKey, occurrences]); // eslint-disable-line react-hooks/exhaustive-deps
  const api: SchedulerApi<Row> = {
    get element() {
      return rootRef.current;
    },
    navigate: (action) => navigate(action, 'api'),
    setView: (view, date) => navigateTo(view, dayOfInput(date) ?? anchor ?? 0, 'view', 'api'),
    setDate: (date) => {
      const d = dayOfInput(date);
      if (d !== null) navigateTo(viewName, d, 'date', 'api');
    },
    getDateRangeText: () => rangeText,
    getViewDates: () => (page?.days ?? []).map(fromDays),
    addEvents: (r) => doAdd(r, 'api'),
    saveEvent: (row, o) => {
      const ctx = crudCtx();
      if (!ctx || !zone) return { status: 'rejected', rows: [] };
      const idv = ctx.idOf(row);
      const target = occurrenceFromTarget(idv, o?.occurrenceStart);
      if (!target) return { status: 'rejected', rows: [], reason: 'not found' };
      const rec = buildRecords([row], ctx).records[0] as EventRecord<Row> | undefined;
      if (!rec) return { status: 'rejected', rows: [], reason: 'invalid row' };
      const changes: EventChanges = { title: rec.title, location: rec.location, description: rec.description, allDay: rec.allDay, start: target.generated ? target.start + (rec.start - target.event.start) : rec.start, end: target.generated ? target.end + (rec.end - target.event.end) : rec.end, recurrenceRule: rec.recurrenceRule ?? null };
      return doSave(target, changes, o?.scope ?? 'series', 'api');
    },
    deleteEvents: (ids, o) => {
      let last: SchedulerActionResult<Row> = { status: 'rejected', rows: [] };
      for (const i of ids) {
        const target = occurrenceFromTarget(i, o?.occurrenceStart);
        if (target) last = doDelete(target, o?.scope ?? 'series', 'api');
      }
      return last;
    },
    openEditor: (target, o) => {
      if (typeof target === 'object') {
        const s = target.start instanceof Date ? target.start.getTime() : zone ? (instantOf(target.start, zone) ?? 0) : 0;
        const e = target.end === undefined ? s + 30 * MINUTE_MS : target.end instanceof Date ? target.end.getTime() : zone ? (instantOf(target.end, zone) ?? s) : s;
        openEditorFor(null, { start: s, end: e, allDay: target.allDay ?? false }, 'add', 'api');
        return;
      }
      const occ = occurrenceFromTarget(target, o?.occurrenceStart);
      if (occ) openEditorFor(occ, null, o?.mode ?? 'edit', 'api', o?.mode === 'editOccurrence' ? 'occurrence' : 'series');
    },
    closeEditor: () => {
      if (store.getSnapshot().popup?.kind === 'editor') closePopup('api');
    },
    openQuickInfo: (target) => {
      if (typeof target === 'object') {
        const el = rootRef.current?.querySelector(`[data-cell-start="${target.start.getTime()}"]`) ?? rootRef.current;
        if (el) openPopup({ kind: 'quickInfo', cells: { start: target.start.getTime(), end: target.end.getTime(), allDay: target.allDay ?? false }, anchor: el, returnFocus: el }, null, target.start.getTime(), target.end.getTime(), 'api');
        return;
      }
      const occ = occurrenceFromTarget(target);
      const el = rootRef.current?.querySelector(`[data-event-id="${String(target)}"]`) ?? null;
      if (occ && el) openPopup({ kind: 'quickInfo', key: occ.key, anchor: el, returnFocus: el }, occ.event.row, occ.start, occ.end, 'api');
    },
    closeQuickInfo: () => {
      if (store.getSnapshot().popup?.kind === 'quickInfo') closePopup('api');
    },
    openOverlapAlert: () => store.set({ popup: { kind: 'overlapAlert', message: t('overlapMessage') } }),
    closeOverlapAlert: () => {
      if (store.getSnapshot().popup?.kind === 'overlapAlert') closePopup('api');
    },
    getEvents: (o) => {
      const recs = currentRecords();
      if (!recs || !zone || !rctx) return [];
      if (o?.includeOccurrences === false || (!o?.start && !o?.end && !o?.includeOccurrences))
        return recs.records.filter((r) => (!o?.start || r.end > o.start.getTime()) && (!o?.end || r.start < o.end.getTime())).map((r) => info({ key: String(r.id), eventId: r.id, start: r.start, end: r.end, allDay: r.allDay, generated: false, seriesId: r.recurrenceId, event: r }));
      return occurrencesIn(recs.records, { start: o?.start?.getTime() ?? -8.64e15, end: o?.end?.getTime() ?? 8.64e15 }, { zone, zoneFor: rctx.zoneFor }).map(info);
    },
    getViewEvents: () => (occurrences as Occurrence<Row>[]).map(info),
    getEventInfo: (target) => {
      if (typeof target === 'object' && target && 'closest' in target) {
        const key = (target as Element).closest('[data-key]')?.getAttribute('data-key');
        const occ = key ? findOccurrence(key) : null;
        return occ ? info(occ) : null;
      }
      const occ = occurrenceFromTarget(target as EventId);
      return occ ? info(occ) : null;
    },
    getCellInfo: (target) => {
      const cell = target.closest<HTMLElement>('[data-cell-start]');
      return cell ? { start: new Date(Number(cell.dataset['cellStart'])), end: new Date(Number(cell.dataset['cellEnd'])), allDay: cell.hasAttribute('data-all-day-cell') } : null;
    },
    getOccurrences: (eventId) => {
      const recs = currentRecords();
      const rec = recs?.byId.get(eventId);
      if (!rec || !zone || !rctx || !rec.recurrenceRule) return [];
      const c = { zone, zoneFor: rctx.zoneFor };
      return seriesStarts(rec, { start: rec.start, end: rec.start + 3650 * DAY_MS }, c).map((s) => info(occurrenceAt(rec, s, c)));
    },
    getOccurrencesInRange: (s, e) => {
      const recs = currentRecords();
      if (!recs || !zone || !rctx) return [];
      return occurrencesIn(recs.records, { start: s.getTime(), end: e.getTime() }, { zone, zoneFor: rctx.zoneFor }).filter((o) => o.seriesId !== undefined).map(info);
    },
    getDeletedOccurrences: (eventId) => {
      const recs = currentRecords();
      const rec = recs?.byId.get(eventId);
      if (!rec || !zone) return [];
      return deletedOccurrences(rec, recs?.children.get(eventId) ?? [], zone).map((x) => new Date(x));
    },
    getBlockEvents: () => (currentRecords()?.records ?? []).filter((r) => r.block).map((r) => r.row),
    isSlotAvailable: (s, e, o) => {
      const recs = currentRecords();
      if (!recs || !zone || !rctx) return true;
      return isSlotAvailable(recs.records, { start: s.getTime(), end: e.getTime(), resources: o?.resources, excludeId: o?.excludeId }, { zone, zoneFor: rctx.zoneFor }, latest.current.overlap !== false);
    },
    getSelectedCells: (): SchedulerCellInfo | null => {
      const c = store.getSnapshot().selectedCells;
      return c ? { start: new Date(c.start), end: new Date(c.end), allDay: c.allDay } : null;
    },
    setWorkHours: (dates, start, end) => {
      const s = minutesOf(start, 9 * 60);
      const e = minutesOf(end, 18 * 60);
      const days = dates.map(dayOfInput).filter((d): d is number => d !== null);
      store.set((st) => ({ workHours: [...st.workHours.filter((w) => !days.includes(w.day)), ...days.map((day) => ({ day, start: s, end: e }))] }));
    },
    resetWorkHours: (dates) => {
      if (!dates) return store.set({ workHours: EMPTY });
      const days = dates.map(dayOfInput);
      store.set((st) => ({ workHours: st.workHours.filter((w) => !days.includes(w.day)) }));
    },
    scrollToTime: (time, o) => {
      const d = dayOfInput(o?.date);
      if (d !== null && page && !page.days.includes(d)) navigateTo(viewName, d, 'date', 'api');
      requestAnimationFrame(() => scrollToTime(time));
    },
    refresh: () => setRefresh((n) => n + 1),
    reloadEvents: () => setReloadToken((n) => n + 1),
    setLoading: (l) => store.set({ loading: l }),
    getState: () => {
      const s = store.getSnapshot();
      return { view: s.view, date: String(fromDays(Number.isFinite(s.date) ? s.date : (anchor ?? 0))), allDayExpanded: s.allDayExpanded };
    },
    restoreState: (st) => {
      const d = st.date ? dayOfInput(st.date) : null;
      store.set({ ...(st.view ? { view: st.view } : {}), ...(d !== null ? { date: d } : {}), ...(st.allDayExpanded !== undefined ? { allDayExpanded: st.allDayExpanded } : {}) });
    },
    getResource: (id, r) => res('getResource', id, r) ?? null,
    getResources: () => res('getResources') ?? [],
    expandResource: (id) => res('expandResource', id),
    collapseResource: (id) => res('collapseResource', id),
    scrollToResource: (id) => res('scrollToResource', id),
    getRenderedRange: () => res('getRenderedRange') ?? null,
    exportToExcel: (o = {}) => withInteract().then((m) => m.runExport(interactHost(), 'excel', o)) as Promise<SchedulerExportFile<Uint8Array> | null>,
    exportToCsv: (o = {}) => withInteract().then((m) => m.runExport(interactHost(), 'csv', o)) as Promise<SchedulerExportFile<string> | null>,
    exportToICalendar: (o = {}) => withInteract().then((m) => m.runExport(interactHost(), 'icalendar', o)) as Promise<SchedulerExportFile<string> | null>,
    importICalendar: (source, o = {}) => withInteract().then((m) => m.importICalendar(interactHost(), source, o)),
    copy: () => withInteract().then((m) => m.copy(interactHost(), false)),
    cut: () => withInteract().then((m) => m.copy(interactHost(), true)),
    paste: (target) => withInteract().then((m) => m.paste(interactHost(), target, 'api')),
    closeTooltip: () => closeTip.current?.(),
    print: (o = {}) => loadInteract().then((m) => m.print()).then((m) => m.printScheduler(rootRef.current, latest.current as never, o)),
  };
  const apiRef = useRef(api);
  apiRef.current = api;
  const [stableApi] = useState(() => {
    const target = {} as SchedulerApi<Row>;
    for (const key of Object.keys(api) as (keyof SchedulerApi<Row>)[]) {
      if (key === 'element') Object.defineProperty(target, 'element', { get: () => apiRef.current.element, enumerable: true });
      else (target as unknown as Record<string, unknown>)[key] = (...args: unknown[]) => (apiRef.current[key] as unknown as (...a: unknown[]) => unknown)(...args);
    }
    return Object.freeze(target);
  });
  useImperativeHandle(props.ref, () => stableApi, [stableApi]);
  const readyFired = useRef(false);
  useEffect(() => {
    if (readyFired.current) return;
    readyFired.current = true;
    latest.current.onReady?.(stableApi);
  }, [stableApi]);

  // -------------------------------------------------------------------------
  // Popups
  // -------------------------------------------------------------------------
  const editorModule = useLazy(loadEditor, popup?.kind === 'editor', hydrated && editable && editing.dialog !== false);
  const popups = useLazy(loadPopups, popup !== null, hydrated);
  // View family chunks of the configured views are preloaded when the browser is idle after mount.
  const families = [...new Set([...entries.map((e) => familyOf(e.type)), resDefs.length ? 'resources' : null])].filter(Boolean).sort().join();
  useEffect(() => (families ? onIdle(() => preloadViews(families.split(',') as ViewFamily[])) : undefined), [families]);
  useEffect(() => onIdle(preloadInteract), []); // eslint-disable-line react-hooks/exhaustive-deps
  const [datePopupOpen, setDatePopupOpen] = useState(false);
  const datePopup = useLazy(loadDatePopup, datePopupOpen, hydrated);
  const dateButtonRef = useRef<HTMLButtonElement | null>(null);
  const [editorError, setEditorError] = useState<string | null>(null);
  // Context menu chunk: idle after mount; a request before it loaded is kept and opened on mount.
  const [menuAsk, setMenuAsk] = useState<import('./context-menu.js').MenuRequest | null>(null);
  const menu = useLazy(loadMenu, menuAsk !== null, hydrated && !!props.contextMenu);
  const tip = useLazy(loadTooltip, false, hydrated && !!props.tooltip);
  const askMenu = (e: { target: EventTarget; defaultPrevented: boolean; preventDefault(): void }, x: number, y: number): void => {
    const el = e.target as Element;
    if (!menu && props.contextMenu && !e.defaultPrevented && rootRef.current?.contains(el) && el.closest('[data-key],[data-cell-start]')) {
      e.preventDefault();
      setMenuAsk({ x, y, target: el });
    }
  };

  const popupNode = popup && hydrated && zone && rctx && popups ? popups.renderPopup({ popup, hydrated, zone, rctx, findOccurrence, popups, quickInfo, can, closePopup, doAdd, newRowFor, store, openEditorFor, requestEdit, requestDelete, occurrences, openPopup, latest, t, doDelete, editorModule, resDefs, editorError, setEditorError, isRecurring, putRes, editing, resInfo, doSave, validateSeries }) : null;

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------
  const toolbarItems: readonly SchedulerToolbarItem[] = props.toolbar === false ? EMPTY : (props.toolbar ?? ['previous', 'next', 'today', 'dateRange', 'views']);
  const viewLabel = (e: ViewEntry<Row>): string => e.label ?? t(`view${e.type[0]?.toUpperCase()}${e.type.slice(1)}` as keyof SchedulerLocaleText);
  const atMin = minDay !== null && page !== null && (page.days[0] ?? 0) <= minDay;
  const atMax = maxDay !== null && page !== null && (page.days[page.days.length - 1] ?? 0) >= maxDay;
  const renderItem = (item: SchedulerToolbarItem): ReactNode => {
    if (typeof item === 'object')
      return (
        <div key={item.id} className="salmon-scheduler__toolbar-item" data-align={item.align ?? 'start'}>
          {item.render ? (
            item.render()
          ) : (
            <button type="button" className="salmon-scheduler__button" onClick={item.onClick}>
              {item.label}
            </button>
          )}
        </div>
      );
    switch (item) {
      case 'previous':
      case 'next':
        return (
          <button key={item} type="button" className="salmon-scheduler__button salmon-scheduler__nav" data-nav={item} aria-label={t(item)} disabled={item === 'next' ? atMax : atMin} onClick={(e) => navigate(item, e.detail === 0 ? 'keyboard' : 'pointer')}>
            <Icon name={item} />
          </button>
        );
      case 'today':
        return (
          <button key={item} type="button" className="salmon-scheduler__button" data-nav="today" onClick={(e) => navigate('today', e.detail === 0 ? 'keyboard' : 'pointer')}>
            {t('today')}
          </button>
        );
      case 'dateRange':
        return (
          <button
            key={item}
            ref={dateButtonRef}
            type="button"
            id={id('range')}
            className="salmon-scheduler__date-range"
            aria-haspopup="dialog"
            aria-expanded={datePopupOpen}
            onClick={() => setDatePopupOpen((o) => !o)}
          >
            {props.renderDateRange && page && anchor !== null ? props.renderDateRange({ start: fromDays(page.days[0] ?? anchor), end: fromDays(page.days[page.days.length - 1] ?? anchor), text: rangeText, view: entry.type }) : rangeText}
          </button>
        );
      case 'newEvent':
        return can.add ? (
          <button
            key={item}
            type="button"
            className="salmon-scheduler__button"
            data-primary=""
            onClick={() => {
              if (!zone || anchor === null) return;
              const sel = store.getSnapshot().selectedCells;
              const s = sel?.start ?? zone.instant(anchor * DAY_MS + opts.workStart * MINUTE_MS);
              openEditorFor(null, sel ?? { start: s, end: s + 30 * MINUTE_MS, allDay: false }, 'add', 'pointer');
            }}
          >
            {t('newEvent')}
          </button>
        ) : null;
      case 'views':
        return entries.length > 1 && adaptive ? (
          <select key={item} className="salmon-scheduler__select" aria-label={t('views')} value={entry.name} onChange={(ev) => navigateTo(ev.currentTarget.value, anchor ?? 0, 'view', 'pointer')}>
            {entries.map((e) => (
              <option key={e.name} value={e.name}>
                {viewLabel(e)}
              </option>
            ))}
          </select>
        ) : entries.length > 1 ? (
          <div key={item} role="group" aria-label={t('views')} className="salmon-scheduler__views">
            {entries.map((e) => (
              <button key={e.name} type="button" className="salmon-scheduler__button" data-view={e.name} aria-pressed={e.name === entry.name} onClick={(ev) => navigateTo(e.name, anchor ?? 0, 'view', ev.detail === 0 ? 'keyboard' : 'pointer')}>
                {viewLabel(e)}
              </button>
            ))}
          </div>
        ) : null;
    }
  };
  const items = (
    <>
      <div className="salmon-scheduler__toolbar-start">{toolbarItems.filter((i) => typeof i === 'string' ? i !== 'views' && i !== 'newEvent' : i.align !== 'end').map(renderItem)}</div>
      <div className="salmon-scheduler__toolbar-end">{toolbarItems.filter((i) => (typeof i === 'string' ? i === 'views' || i === 'newEvent' : i.align === 'end')).map(renderItem)}</div>
    </>
  );
  const ready = zone !== null && anchor !== null && page !== null && layout !== null;
  const family = familyOf(entry.type);
  // React writes a number as px and skips undefined.
  const style: CSSProperties = { ...props.style, blockSize: props.height ?? props.style?.blockSize, inlineSize: props.width ?? props.style?.inlineSize };
  return (
    <SchedulerContext.Provider value={ctxValue}>
      <div
        ref={rootRef}
        id={props.id}
        className={cx('salmon-scheduler', props.className)}
        style={style}
        dir={props.dir}
        role="group"
        aria-label={props['aria-label'] ?? t('label')}
        aria-busy={!ready || loading || undefined}
        data-view={entry.type}
        data-readonly={opts.readOnly ? '' : undefined}
        data-adaptive={adaptive ? '' : undefined}
        data-salmon-deferred={!ready ? '' : undefined}
        onKeyDown={(e) => {
          if ((e.key === 'F10' && e.shiftKey) || e.key === 'ContextMenu') {
            const r = (e.target as Element).getBoundingClientRect();
            askMenu(e, r.left, r.bottom);
          }
          if (interactRef.current) interactRef.current.rootKey(interactHost(), e);
          else {
            // A key before the chunk replays once it loads, from where focus is then (an earlier key may have
            // moved it). A grid key does not scroll natively meanwhile: that would shift the grid under the replay.
            const root = e.currentTarget;
            const doc = root.ownerDocument;
            if (/^(Arrow|Home|End)/.test(e.key) && (e.target as Element).closest('[role="gridcell"]')) e.preventDefault();
            void withInteract().then(() => replayInput([e.nativeEvent], () => (root.contains(doc.activeElement) ? doc.activeElement : null)));
          }
        }}
        onContextMenu={(e) => askMenu(e, e.clientX, e.clientY)}
        data-resizable={editable && props.resizable !== false ? '' : undefined}
        onFocus={(e) => {
          if (interactRef.current) interactRef.current.rootFocus(e);
          else void withInteract().then((m) => e.target === e.target.ownerDocument.activeElement && m.rootFocus(e));
        }}
        onPointerDown={(e) => {
          const n = e.nativeEvent;
          preloadInteract();
          // The rest of the press may arrive before the drag chunk: held, then replayed to its window listeners.
          const win = e.currentTarget.ownerDocument.defaultView as Window;
          const held = holdInput(win, PRESS_EVENTS);
          void withDrag().then((m) => {
            m.down(getHost, n);
            replayInput(held(), () => win);
          }, held);
        }}
        onDragOver={(e) => props.onExternalDrop && (e.preventDefault(), void withDrag())}
        onDrop={(e) => dragRef.current?.external(interactHost(), e.nativeEvent)}
      >
        {toolbarItems.length ? (
          <div role="toolbar" aria-label={t('label')} className="salmon-scheduler__toolbar">
            {props.renderToolbar ? props.renderToolbar({ items, dateRangeText: rangeText }) : items}
          </div>
        ) : null}
        <div className="salmon-scheduler__body">
          {ready && (family || resDefs.length) ? (
            <Suspense fallback={<div className="salmon-scheduler__pending" data-salmon-pending="" aria-busy="true" />}>
              <Gate
                needed={[...(family ? [family] : []), ...(resDefs.length ? (['resources'] as const) : [])]}
                family={family}
                type={entry.type}
                days={page.days}
                weeks={page.weeks}
                anchor={anchor}
                occurrences={occurrences as Occurrence<unknown>[]}
                layout={layout as GateProps['layout']}
                allDayExpanded={allDayExpanded}
                occurrencesIn={(s, e) => (records && rctx ? occurrencesIn(records.records, { start: s, end: e }, { zone, zoneFor: rctx.zoneFor }) : EMPTY) as Occurrence<unknown>[]}
              />
            </Suspense>
          ) : ready && entry.type === 'month' && layout?.month && page.weeks ? (
            <MonthView weeks={page.weeks} layout={layout.month as never} anchor={anchor} />
          ) : ready && layout?.day ? (
            <DayView days={page.days} layout={layout.day as never} />
          ) : null}
          {loading ? (
            <div className="salmon-scheduler__loading" role="status">
              {props.renderLoading ? props.renderLoading() : <span>{t('loading')}</span>}
            </div>
          ) : null}
        </div>
        {popupNode}
        {menu && props.contextMenu ? (
          <menu.SchedulerContextMenu
            ctx={ctxValue}
            pending={menuAsk}
            host={{
              find: findOccurrence as never,
              info: info as never,
              can,
              openEditor: openEditorFor as never,
              edit: requestEdit as never,
              remove: requestDelete as never,
              today: (s) => navigate('today', s),
            }}
          />
        ) : null}
        {tip && props.tooltip ? <tip.SchedulerTooltip ctx={ctxValue} find={findOccurrence as never} info={info as never} closer={closeTip} /> : null}
        {datePopupOpen && datePopup && anchor !== null ? (
          <datePopup.DatePopup
            anchor={dateButtonRef}
            value={anchor}
            month={entry.type === 'month' || entry.type === 'monthAgenda'}
            min={minDay}
            max={maxDay}
            locale={locale}
            firstDayOfWeek={opts.view.firstDayOfWeek}
            label={t('chooseDate')}
            onClose={() => setDatePopupOpen(false)}
            onPick={(d) => {
              setDatePopupOpen(false);
              navigateTo(viewName, d, 'date', 'pointer');
              requestAnimationFrame(() => dateButtonRef.current?.focus());
            }}
          />
        ) : null}
      </div>
    </SchedulerContext.Provider>
  );
}

export type { PlainDate };
