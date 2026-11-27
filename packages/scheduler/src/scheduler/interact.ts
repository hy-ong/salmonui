// Scheduler interaction chunk: event selection, the
// root shortcuts and the export / import API. Lazy: the Scheduler loads it on the first focus or pointer down
// inside it (or the first export call), so none of it is initial JS.

import type { FocusEvent, KeyboardEvent } from 'react';
import type { CrudContext, EditScope, WriteSet } from '../internal/scheduler/crud.js';
import { writeRow, type EventChanges } from '../internal/scheduler/fields.js';
import type { SchedulerStore } from '../internal/scheduler/store.js';
import type { EventId, EventRecord, Occurrence, TimeRange } from '../internal/scheduler/types.js';
import { csvFile, download, excelFile, icsFile, importRows, type ExportHost } from './export.js';
import { buildRecords, type RecordContext } from './model.js';
import type { SchedulerActionResult, SchedulerCsvExportOptions, SchedulerDataSource, SchedulerEventSource, SchedulerExcelExportOptions, SchedulerExportFile, SchedulerExportFormat, SchedulerICalendarExportOptions, SchedulerICalendarImportOptions, SchedulerPasteTarget, SchedulerProps } from './types.js';

/** What the chunk needs from the Scheduler render (read at call time). */
export interface InteractHost<Row> {
  readonly store: SchedulerStore<Row>;
  readonly props: SchedulerProps<Row>;
  readonly root: HTMLElement | null;
  readonly occurrences: readonly Occurrence<Row>[];
  readonly records: readonly EventRecord<Row>[] | null;
  readonly rctx: RecordContext | null;
  readonly range: TimeRange | null;
  readonly locale: string;
  readonly views: readonly { readonly name: string }[];
  readonly anchor: number | null;
  navigateTo(view: string, day: number): void;
  navigate(dir: 'previous' | 'next', source?: SchedulerEventSource): void;
  requestDelete(o: Occurrence<Row>): void;
  addEvents(rows: readonly Row[]): SchedulerActionResult<Row>;
  save(o: Occurrence<Row>, changes: EventChanges, scope: EditScope, source: SchedulerEventSource): SchedulerActionResult<Row>;
  /** `api.saveEvent` (a row an `onBeforePaste` handler put in place of a cut event). */
  saveRow(row: Row): SchedulerActionResult<Row>;
  /** The per-instance clipboard. */
  readonly clip: { current: SchedulerClipboard<Row> | null };
}

export interface SchedulerClipboard<Row> {
  readonly items: readonly Occurrence<Row>[];
  readonly cut: boolean;
}

const EMPTY: readonly never[] = Object.freeze([]);

function event<T extends object>(type: string, source: SchedulerEventSource, fields: T) {
  const e = { type, source, defaultPrevented: false, preventDefault: () => void (e.defaultPrevented = true), ...fields };
  return e;
}

const same = (a: readonly string[], b: readonly string[]): boolean => a.length === b.length && a.every((x, i) => x === b[i]);

/** `onEventSelectionChange` with the event ids (a series once) of occurrence keys (`key|resource` in grouped views). */
function fire<Row>(h: InteractHost<Row>, keys: readonly string[], source: SchedulerEventSource): void {
  const cb = h.props.onEventSelectionChange;
  if (!cb) return;
  const byKey = new Map(h.occurrences.map((o) => [o.key, o]));
  const ids: EventId[] = [];
  const rows: Row[] = [];
  for (const k of keys) {
    const o = byKey.get(k.split('|')[0] as string);
    const id = o ? (o.generated && o.seriesId !== undefined ? o.seriesId : o.eventId) : undefined;
    if (o && id !== undefined && !ids.includes(id)) {
      ids.push(id);
      rows.push(o.event.row);
    }
  }
  cb(ids, event('eventSelectionChange', source, { keys, rows }));
}

/** Click (replace), Ctrl / Cmd + click (toggle) and Shift + click (every visible event between the last selected one and this one, in time order). */
export function selectEvent<Row>(h: InteractHost<Row>, occ: Occurrence<Row>, k: string, mode: boolean | 'range', source: SchedulerEventSource): void {
  const keys = h.store.getSnapshot().selectedEventKeys;
  let next: readonly string[];
  if (mode === 'range' && keys.length) {
    const order = [...h.occurrences].sort((a, b) => a.start - b.start || a.end - b.end).map((x) => x.key);
    const base = (keys[keys.length - 1] as string).split('|')[0] as string;
    const from = order.indexOf(base);
    const to = order.indexOf(occ.key);
    const span = from < 0 || to < 0 ? [occ.key] : order.slice(Math.min(from, to), Math.max(from, to) + 1);
    next = [...keys, ...span.filter((x) => !keys.includes(x) && x !== base)];
  } else next = mode ? (keys.includes(k) ? keys.filter((x) => x !== k) : [...keys, k]) : [k];
  h.store.set({ selectedEventKeys: next, selectedCells: null });
  if (!same(next, keys)) fire(h, next, source);
}

// ---------------------------------------------------------------------------
// Keyboard: remappable commands and the grid's roving focus.
// ---------------------------------------------------------------------------

const DEFAULT_KEYS: Readonly<Record<string, readonly string[]>> = {
  'navigation.previous': ['Mod+ArrowLeft'],
  'navigation.next': ['Mod+ArrowRight'],
  'event.delete': ['Delete'],
  'selection.clear': ['Escape'],
  'clipboard.copy': ['Mod+C'],
  'clipboard.cut': ['Mod+X'],
  'clipboard.paste': ['Mod+V'],
  ...Object.fromEntries([1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => [`view.${n}`, [`Alt+${n}`]])),
};

/** `Mod+Shift+K` style combos (the Data Grid `keyBindings` syntax; `Mod` is Ctrl or Cmd); digits and letters also match by `code`. */
function matches(combo: string, e: KeyboardEvent<HTMLElement>): boolean {
  const parts = combo.toLowerCase().split('+');
  const key = parts.pop() ?? '';
  const has = (...m: string[]): boolean => parts.some((x) => m.includes(x));
  const mod = has('mod');
  if ((mod ? !(e.ctrlKey || e.metaKey) : e.ctrlKey !== has('ctrl', 'control') || e.metaKey !== has('meta', 'cmd')) || e.altKey !== has('alt', 'option') || e.shiftKey !== has('shift')) return false;
  const code = (e.code ?? '').toLowerCase();
  return e.key.toLowerCase() === key || code === key || code === `digit${key}` || code === `key${key}`;
}

function commandOf<Row>(h: InteractHost<Row>, e: KeyboardEvent<HTMLElement>): string | null {
  const custom = h.props.keyBindings as Readonly<Record<string, readonly string[]>> | undefined;
  for (const command of Object.keys(DEFAULT_KEYS)) {
    if ((custom?.[command] ?? DEFAULT_KEYS[command] ?? []).some((c) => matches(c, e))) return command;
  }
  return null;
}

/** Roving items of a grid: the cells and the events, "+N more" buttons and date links inside them. */
const ITEMS = '[role="gridcell"][data-cell-start],[role="gridcell"] :is(.salmon-scheduler__event,.salmon-scheduler__more,.salmon-scheduler__date-link)';
const isMini = (grid: Element): boolean => grid.classList.contains('salmon-scheduler__mini');
/** A grid's focusable scroll area (a rowgroup, or the timeline scroller around the grid). */
const isArea = (el: Element): boolean => el.getAttribute('role') === 'rowgroup' || el.hasAttribute('data-scroll-area');
const gridOf = (el: Element): Element | null => el.closest('[role="grid"]') ?? (el.hasAttribute('data-scroll-area') ? el.querySelector('[role="grid"]') : null);

/** Makes `el` the one tab stop of its grid (DOM only, never React state) and focuses it. */
function rove(el: HTMLElement, focus = true): void {
  const grid = el.closest('[role="grid"]');
  grid?.querySelectorAll<HTMLElement>('[data-roving]').forEach((x) => {
    if (x === el) return;
    x.tabIndex = -1;
    x.removeAttribute('data-roving');
  });
  // The last focused cell anchors the column (and row) while focus is on the events inside it.
  if (el.matches('[role="gridcell"]')) {
    grid?.querySelector('[data-roving-anchor]')?.removeAttribute('data-roving-anchor');
    el.setAttribute('data-roving-anchor', '');
  }
  el.tabIndex = 0;
  el.setAttribute('data-roving', '');
  if (focus) el.focus();
}

/** The item a grid entry focuses: the last roving item, the selected cell, else the first visible cell of `area`. */
function entryItem(grid: Element, area: Element): HTMLElement | null {
  const last = grid.querySelector<HTMLElement>('[data-roving]');
  if (last) return last;
  const sel = area.querySelector<HTMLElement>('[role="gridcell"][data-cell-start][data-selected]');
  if (sel) return sel;
  const top = area.getBoundingClientRect().top;
  const cells = area.querySelectorAll<HTMLElement>('[role="gridcell"][data-cell-start]');
  for (const c of cells) if (c.getBoundingClientRect().bottom > top + 1) return c;
  return cells[0] ?? null;
}

/**
 * The nearest item in an arrow direction, by screen position: the top-left
 * corner of each item, nudged half a pixel for the parts inside a cell so
 * they come right after it; items overlapping on the cross axis come first. Visual,
 * so RTL is mirrored by the layout itself.
 */
function nearest(grid: Element, from: HTMLElement, key: string): HTMLElement | null {
  const vertical = key === 'ArrowDown' || key === 'ArrowUp';
  const sign = key === 'ArrowDown' || key === 'ArrowRight' ? 1 : -1;
  const nudge = (el: Element): number => (el.getAttribute('role') === 'gridcell' ? 0 : 0.5);
  const fr = from.getBoundingClientRect();
  const fn = nudge(from);
  // Cross-axis band: the anchor cell's, while it overlaps the focused event (a wide bar keeps the column it was entered from).
  const ar = fn ? grid.querySelector('[data-roving-anchor]')?.getBoundingClientRect() : undefined;
  const lo = (r: DOMRect): number => (vertical ? r.left : r.top);
  const hi = (r: DOMRect): number => (vertical ? r.right : r.bottom);
  const band = ar && Math.min(hi(ar), hi(fr)) - Math.max(lo(ar), lo(fr)) > 1 ? ar : fr;
  let best: HTMLElement | null = null;
  let score = Infinity;
  for (const el of grid.querySelectorAll<HTMLElement>(ITEMS)) {
    const r = el.getBoundingClientRect();
    if (el === from || (!r.width && !r.height)) continue;
    const n = nudge(el) - fn;
    const primary = sign * (vertical ? r.top - fr.top : r.left - fr.left) + sign * n;
    if (primary < 0.25) continue;
    // Items that share the row (or column) band always win over the rest.
    const sc = Math.min(hi(r), hi(band)) - Math.max(lo(r), lo(band)) > 1 ? primary : 1e6 + primary + Math.abs(lo(r) + hi(r) - lo(band) - hi(band));
    if (sc < score) {
      score = sc;
      best = el;
    }
  }
  return best;
}

/** Arrow, Home and End keys inside a grid; true when handled. */
function gridKey(e: KeyboardEvent<HTMLElement>, target: HTMLElement): boolean {
  const k = e.key;
  if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey || !(k.startsWith('Arrow') || k === 'Home' || k === 'End')) return false;
  const grid = gridOf(target);
  if (!grid || isMini(grid)) return false;
  let next: HTMLElement | null = null;
  if (target.matches(ITEMS)) {
    if (k === 'Home' || k === 'End') {
      const cells = target.closest('[role="row"]')?.querySelectorAll<HTMLElement>('[role="gridcell"][data-cell-start]');
      next = (cells && (k === 'Home' ? cells[0] : cells[cells.length - 1])) ?? null;
    } else next = nearest(grid, target, k);
  } else if (isArea(target) && k.startsWith('Arrow')) next = entryItem(grid, target);
  else return false;
  e.preventDefault();
  if (next) rove(next);
  return true;
}

/** Focus inside the Scheduler: an item becomes the roving one; entering a grid's scroll area from outside focuses its entry item. */
export function rootFocus(e: FocusEvent<HTMLElement>): void {
  const target = e.target as HTMLElement;
  const grid = gridOf(target);
  if (!grid || isMini(grid)) return;
  if (target.matches(ITEMS)) rove(target, false);
  else if (isArea(target) && !grid.contains(e.relatedTarget as Node | null) && !target.contains(e.relatedTarget as Node | null)) {
    // After the focus event: a focus() inside it is overridden by the focus that is still in progress.
    requestAnimationFrame(() => {
      const item = target === target.ownerDocument.activeElement ? entryItem(grid, target) : null;
      if (item) rove(item);
    });
  }
}

/** A grid's focusable scroll area. */
const AREA = '[role="rowgroup"][tabindex], [data-scroll-area][tabindex]';

/**
 * Before a navigation re-renders the range: focus on an item of the old range
 * (a cell or event that unmounts with it) moves to its grid's scroll area, so
 * it stays inside the Scheduler instead of dropping to the page.
 */
function keepFocus(root: HTMLElement, target: HTMLElement): HTMLElement | null {
  const grid = gridOf(target);
  const area = grid && !isMini(grid) ? target.closest<HTMLElement>(AREA) : null;
  if (!area || !root.contains(area)) return null;
  if (target !== area) area.focus({ preventScroll: true });
  return area;
}

/** After the navigation rendered: focus still on the area (or lost with it) goes to the new range's entry item. */
function enterArea(root: HTMLElement, area: HTMLElement): void {
  const doc = root.ownerDocument;
  const active = doc.activeElement;
  if (active !== area && active && active !== doc.body && active.isConnected) return;
  const next = area.isConnected ? area : root.querySelector<HTMLElement>(AREA);
  const grid = next && gridOf(next);
  const item = grid && !isMini(grid) ? entryItem(grid, next) : null;
  if (item) rove(item);
  else next?.focus({ preventScroll: true });
}

/**
 * Root keys: the grid's arrows, Home and End, then the commands of
 * `keyBindings`: Alt+1..9 switch views, Ctrl / Cmd + Left / Right navigate
 * (mirrored in RTL), Delete removes the selected event, Escape clears the
 * event selection (and moves focus from an event to its cell), Ctrl / Cmd +
 * C, X and V with `clipboard`. Keys from popups, dialogs and text fields are
 * left alone.
 */
export function rootKey<Row>(h: InteractHost<Row>, e: KeyboardEvent<HTMLElement>): void {
  const target = e.target as HTMLElement;
  const root = h.root;
  if (e.defaultPrevented || !root?.contains(target) || target.closest('input, textarea, select, [contenteditable="true"], dialog, [role="dialog"], [role="alertdialog"], [role="menu"]')) return;
  if (gridKey(e, target)) return;
  const command = commandOf(h, e);
  if (!command) return;
  const s = h.store.getSnapshot();
  if (command.startsWith('view.')) {
    const v = h.views[Number(command.slice(5)) - 1];
    if (!v) return;
    e.preventDefault();
    h.navigateTo(v.name, h.anchor ?? 0);
  } else if (command.startsWith('navigation.')) {
    e.preventDefault();
    const swap = (e.key === 'ArrowLeft' || e.key === 'ArrowRight') && globalThis.getComputedStyle?.(root).direction === 'rtl';
    const area = keepFocus(root, target);
    h.navigate((command === 'navigation.next') !== swap ? 'next' : 'previous');
    if (area) requestAnimationFrame(() => enterArea(root, area));
  } else if (command === 'event.delete') {
    const key = s.selectedEventKeys[0]?.split('|')[0];
    const occ = key ? h.occurrences.find((o) => o.key === key) : undefined;
    if (!occ) return;
    e.preventDefault();
    h.requestDelete(occ);
  } else if (command === 'selection.clear') {
    if (s.popup) return;
    const cell = target.matches('.salmon-scheduler__event') ? target.closest<HTMLElement>('[role="gridcell"]') : null;
    if (cell) rove(cell);
    if (!s.selectedEventKeys.length) return;
    h.store.set({ selectedEventKeys: EMPTY });
    fire(h, EMPTY, 'keyboard');
  } else if (h.props.clipboard) {
    e.preventDefault();
    if (command === 'clipboard.paste') paste(h, undefined, 'keyboard');
    else copy(h, command === 'clipboard.cut');
  }
}

// ---------------------------------------------------------------------------
// Clipboard: the selected events into a per-instance buffer; paste
// adds copies (copy) or moves the events (cut) to a cell, keeping offsets.
// ---------------------------------------------------------------------------

/** Copies (or cuts) the selected events; the number copied. */
export function copy<Row>(h: InteractHost<Row>, cut: boolean): number {
  const byKey = new Map(h.occurrences.map((o) => [o.key, o]));
  const items: Occurrence<Row>[] = [];
  for (const k of h.store.getSnapshot().selectedEventKeys) {
    const o = byKey.get(k.split('|')[0] as string);
    if (o && !items.includes(o) && !o.event.block && !(cut && o.event.readOnly)) items.push(o);
  }
  if (items.length) h.clip.current = { items, cut };
  return items.length;
}

/** Resource ids of a grouped cell: its `data-resource` key is the item ids of the `grouping.resources` levels, joined by `/`. */
function resourcesOf<Row>(p: SchedulerProps<Row>, cell: Element): Record<string, unknown[]> | undefined {
  const key = cell.getAttribute('data-resource');
  if (!key) return undefined;
  const out: Record<string, unknown[]> = {};
  key.split('/').forEach((seg, i) => {
    const d = p.resources?.find((r) => r.name === p.grouping?.resources[i]);
    const idf = d?.idField ?? 'id';
    const item = d?.data.find((x) => String((x as Record<string, unknown>)[idf]) === seg) as Record<string, unknown> | undefined;
    if (d && item) out[d.field] = [item[idf]];
  });
  return out;
}

/** Pastes the clipboard at `target`, else the selected cells, else the focused cell. */
export function paste<Row>(h: InteractHost<Row>, target: SchedulerPasteTarget | undefined, source: SchedulerEventSource): SchedulerActionResult<Row> {
  const clip = h.clip.current;
  const rctx = h.rctx;
  if (!clip || !rctx) return { status: 'rejected', rows: [], reason: 'empty clipboard' };
  let at = target ? { start: target.start.getTime(), allDay: !!target.allDay, resources: target.resources } : null;
  const sel = h.store.getSnapshot().selectedCells;
  const cell = h.root?.ownerDocument.activeElement?.closest<HTMLElement>('[data-cell-start]');
  if (!at && sel) at = { start: sel.start, allDay: sel.allDay, resources: sel.resources };
  if (!at && cell && h.root?.contains(cell)) at = { start: Number(cell.dataset['cellStart']), allDay: cell.hasAttribute('data-all-day-cell'), resources: resourcesOf(h.props, cell) };
  if (!at) return { status: 'rejected', rows: [], reason: 'no target' };
  const zone = rctx.zone;
  const allDayTarget = at.allDay;
  const first = Math.min(...clip.items.map((o) => o.start));
  // All-day targets shift by whole days of the Scheduler zone, keeping each event's wall time of day.
  const days = zone.day(at.start) - zone.day(first);
  const delta = at.start - first;
  const shift = (t: number, allDay: boolean): number => (allDayTarget || allDay ? zone.instant(zone.wall(t) + days * 864e5) : t + delta);
  const f = rctx.fields;
  const moved = clip.items.map((o) => {
    const base = { ...(o.event.row as Record<string, unknown>) };
    if (!clip.cut) delete base[f.id];
    const changes: EventChanges = { start: shift(o.start, o.allDay), end: shift(o.end, o.allDay), ...(clip.cut ? {} : { recurrenceRule: null, recurrenceId: null, followingId: null, recurrenceExceptions: EMPTY }), ...(at.resources ? { resources: at.resources } : {}) };
    return { o, changes, row: writeRow(base as Row, changes, rctx, rctx.resources) };
  });
  const data = moved.map((m) => m.row);
  const before = event('beforePaste', source, { data: data as readonly Row[], cut: clip.cut, start: new Date(at.start) });
  h.props.onBeforePaste?.(before);
  if (before.defaultPrevented) return { status: 'cancelled', rows: [] };
  if (!clip.cut) return h.addEvents(before.data);
  // A cut moves the events once, each through the save path (before / after events, overlap rules, scopes).
  h.clip.current = null;
  let last: SchedulerActionResult<Row> = { status: 'rejected', rows: [] };
  for (const row of before.data) {
    const m = moved.find((x) => x.row === row);
    last = m ? h.save(m.o, m.changes, m.o.generated ? 'occurrence' : 'series', source) : h.saveRow(row);
  }
  return last;
}

function exportHost<Row>(h: InteractHost<Row>): ExportHost<Row> | null {
  const rctx = h.rctx;
  if (!h.records || !rctx) return null;
  return {
    records: h.records,
    recordsOf: (rows) => buildRecords(rows, rctx).records,
    ctx: rctx,
    range: h.range,
    locale: h.locale,
    direction: h.props.dir ?? (h.root && globalThis.getComputedStyle?.(h.root).direction === 'rtl' ? 'rtl' : 'ltr'),
    writers: h.props.exportWriters,
    doc: h.root?.ownerDocument ?? globalThis.document,
  };
}

type Options<Row> = SchedulerExcelExportOptions<Row> | SchedulerCsvExportOptions<Row> | SchedulerICalendarExportOptions<Row>;

/** One export: `onBeforeExport` (cancellable), the writer, `onExport`, the download unless `download: false`. */
export async function runExport<Row>(h: InteractHost<Row>, format: SchedulerExportFormat, options: Options<Row>): Promise<SchedulerExportFile | null> {
  const host = exportHost(h);
  if (!host) return null;
  const before = event('beforeExport', 'api', { format, options });
  h.props.onBeforeExport?.(before);
  if (before.defaultPrevented) return null;
  const file: SchedulerExportFile = format === 'excel' ? await excelFile(host, options) : format === 'csv' ? csvFile(host, options) : await icsFile(host, options);
  h.props.onExport?.(event('export', 'api', { format, options, file }));
  if (options.download !== false) download(file, host.doc);
  return file;
}

/** `importICalendar`: the parsed rows go through `addEvents` (before / after events, overlap rules). */
export async function importICalendar<Row>(h: InteractHost<Row>, source: string | Blob, options: SchedulerICalendarImportOptions<Row>): Promise<SchedulerActionResult<Row>> {
  const host = exportHost(h);
  if (!host) return { status: 'rejected', rows: [], reason: 'unresolved time zone' };
  return h.addEvents(await importRows(host, source, options));
}

/** The drag chunk: a chunk of its own, requested through this one. */
export const drag = (): Promise<typeof import('./drag.js')> => import('./drag.js');
// The context menu, tooltip and print chunks are requested through this chunk too (one import wrapper less each in the initial JS).
export const menu = (): Promise<typeof import('./context-menu.js')> => import('./context-menu.js');
export const tooltip = (): Promise<typeof import('./tooltip.js')> => import('./tooltip.js');
export const print = (): Promise<typeof import('./print.js')> => import('./print.js');

/** The remote write of a local change: pending ids, then the source's answer or a revert with `onError`. */
export function remoteWrite<Row>(w: {
  readonly store: SchedulerStore<Row>;
  readonly latest: { readonly current: SchedulerProps<Row> };
  readonly writes: Set<AbortController>;
  readonly ctx: CrudContext<Row> | null;
  readonly src: SchedulerDataSource<Row>;
  readonly set: WriteSet<Row>;
  readonly action: 'add' | 'save' | 'delete';
  readonly before: readonly Row[];
  readonly ctrl: AbortController;
}): void {
  const { store, ctx, set, ctrl } = w;
  if (ctrl.signal.aborted) return;
  const ids = [...set.added, ...set.changed.map((c) => c.row), ...set.deleted].map((r) => (ctx ? ctx.idOf(r) : undefined)).filter((x): x is EventId => x !== undefined);
  store.set((s) => ({ pending: [...s.pending, ...ids] }));
  const done = (): void => {
    w.writes.delete(ctrl);
    store.set((s) => ({ pending: s.pending.filter((x) => !ids.includes(x)) }));
  };
  const revert = (error: unknown): void => {
    done();
    if (ctrl.signal.aborted) return;
    store.set((s) => ({ rows: w.before, rowsVersion: s.rowsVersion + 1 }));
    w.latest.current.onError?.({ type: 'error', source: 'api', error, action: w.action });
  };
  Promise.resolve()
    .then(() => w.src.write?.({ action: w.action, added: set.added, changed: set.changed.map((c) => c.row), deleted: set.deleted, signal: ctrl.signal }))
    .then((res) => {
      if (res && res.status === 'rejected') return revert(new Error('The data source rejected the change.'));
      if (res?.rows?.length && ctx) {
        const byId = new Map(res.rows.map((r) => [ctx.idOf(r), r] as const));
        store.set((s) => ({ rows: s.rows.map((r) => byId.get(ctx.idOf(r)) ?? r), rowsVersion: s.rowsVersion + 1 }));
      }
      done();
    }, revert);
}

/** One read of a remote source for the visible range: rows and `onDataLoad`, or `onError`; ignored once aborted. */
export function remoteRead<Row>(store: SchedulerStore<Row>, latest: { readonly current: SchedulerProps<Row> }, source: SchedulerDataSource<Row>, req: Parameters<SchedulerDataSource<Row>['read']>[0]): void {
  const signal = req.signal;
  Promise.resolve()
    .then(() => source.read(req))
    .then(
      (res) => {
        if (signal.aborted) return;
        store.set((s) => ({ rows: res.rows, rowsVersion: s.rowsVersion + 1, loading: false }));
        latest.current.onDataLoad?.({ type: 'dataLoad', source: 'api', range: req.range, rows: res.rows });
      },
      (error: unknown) => {
        if (signal.aborted) return;
        store.set({ loading: false });
        latest.current.onError?.({ type: 'error', source: 'api', error, action: 'read' });
      },
    );
}
