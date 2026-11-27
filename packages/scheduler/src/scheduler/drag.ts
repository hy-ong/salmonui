// Scheduler drag chunk: drag and drop, resize, multi-drag, drag out, external
// HTML drops, drag between Schedulers of one `dragOptions.group` and touch
// swipe navigation. Lazy: the Scheduler loads it with the interaction chunk
// on the first focus or pointer down (and when idle with a drag group).
//
// Every transient lives here, never in React state or the store: the
// pointer moves a clone of the event ("ghost") in the top layer by inline
// styles only, the target is a hit test of the cells under the pointer
// (`[data-cell-start]`, `elementsFromPoint`, so no drop target is
// registered), and the drop commits once through the Scheduler's save path
// (`onBeforeSave` / `onSave`, overlap rules and blocks, the recurrence
// scope alert, remote pending and revert).

import type { EditScope } from '../internal/scheduler/crud.js';
import type { EventChanges } from '../internal/scheduler/fields.js';
// Constants inlined: a runtime import of internal/scheduler/time.js would split shared initial chunks.
const MINUTE_MS = 60_000;
const DAY_MS = 86_400_000;
import type { Occurrence } from '../internal/scheduler/types.js';
import type { Formatters } from './context.js';
import type { InteractHost } from './interact.js';
import type { SchedulerActionResult, SchedulerDragOptions, SchedulerEventSource, SchedulerProps } from './types.js';

/** What the drag chunk needs from the Scheduler render, on top of the interaction host. */
export interface DragHost<Row> extends InteractHost<Row> {
  /** Resolved options: the slot length (`slotMinutes / slotCount`) is the default snap. */
  readonly opts: { readonly slotMinutes: number; readonly slotCount: number };
  readonly can: { readonly edit: boolean };
  readonly fmt: Formatters;
  find(key: string): Occurrence<Row> | null;
  save(o: Occurrence<Row>, changes: EventChanges, scope: EditScope, source: SchedulerEventSource): SchedulerActionResult<Row>;
  remove(o: Occurrence<Row>, scope: EditScope, source: SchedulerEventSource): SchedulerActionResult<Row>;
}

type Host = DragHost<unknown>;
type GetHost = () => Host;
type Res = Readonly<Record<string, readonly unknown[]>>;

/** A cell under the pointer: its range, kind and resource key. */
interface Slot {
  readonly el: HTMLElement;
  readonly s: number;
  readonly e: number;
  /** Day cells (all-day row, month, day timelines): moves are whole days. */
  readonly all: boolean;
  /** Timeline cells: time runs along the inline axis. */
  readonly h: boolean;
  readonly res: string | undefined;
  readonly root: Element | null;
}

const slotOf = (el: HTMLElement | null): Slot | null =>
  el ? { el, s: Number(el.dataset['cellStart']), e: Number(el.dataset['cellEnd']), all: el.hasAttribute('data-all-day-cell'), h: el.classList.contains('salmon-scheduler__tl-cell'), res: el.dataset['resource'], root: el.closest('.salmon-scheduler') } : null;

/** The cell whose own box holds the point (events overflowing other cells and the ghost are skipped). */
function cellAt(doc: Document, x: number, y: number): Slot | null {
  for (const el of doc.elementsFromPoint(x, y)) if (el instanceof HTMLElement && el.hasAttribute('data-cell-start')) return slotOf(el);
  return null;
}

/** Time at a point of a cell: along the block axis in day views, the inline axis (mirrored in RTL) in timelines. */
function timeAt(c: Slot, r: DOMRect, x: number, y: number, rtl: boolean): number {
  if (c.all) return c.s;
  const f = c.h ? (rtl ? r.right - x : x - r.left) / r.width : (y - r.top) / r.height;
  return c.s + f * (c.e - c.s);
}

/** Viewport coordinate of a time on a cell's time axis (extrapolated linearly past the cell). */
function pxOf(c: Slot, r: DOMRect, t: number, rtl: boolean): number {
  const f = (t - c.s) / (c.e - c.s);
  return c.h ? (rtl ? r.right - f * r.width : r.left + f * r.width) : r.top + f * r.height;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function fire<T extends object>(cb: ((e: any) => void) | undefined, type: string, source: SchedulerEventSource, fields: T): boolean {
  if (!cb) return true;
  const e = { type, source, defaultPrevented: false, preventDefault: () => void (e.defaultPrevented = true), ...fields };
  cb(e);
  return !e.defaultPrevented;
}

// ---------------------------------------------------------------------------
// Drag groups: one registry per document, keyed by group name.
// ---------------------------------------------------------------------------

const groups = new WeakMap<Document, Map<string, Map<Element, GetHost>>>();

/** Registers a Scheduler root in a drag group; returns the cleanup. */
export function join<Row>(group: string | undefined, root: Element | null, getRow: () => DragHost<Row>): (() => void) | undefined {
  const get = getRow as unknown as GetHost;
  if (!group || !root) return undefined;
  const doc = root.ownerDocument;
  const byName = groups.get(doc) ?? new Map<string, Map<Element, GetHost>>();
  groups.set(doc, byName);
  const members = byName.get(group) ?? new Map<Element, GetHost>();
  byName.set(group, members);
  members.set(root, get);
  return () => void members.delete(root);
}

const memberOf = (h: Host, root: Element | null): GetHost | undefined => {
  const g = h.props.dragOptions?.group;
  return g && root && h.root ? groups.get(h.root.ownerDocument)?.get(g)?.get(root) : undefined;
};

/**
 * Resource path of a grouped cell: its `data-resource` key is the item ids of the grouped levels joined
 * by `/` (internal/scheduler/resources.ts); each id maps back to its typed item id per resource field.
 */
function pathOf(p: SchedulerProps<unknown>, key: string | undefined): Res | null {
  if (key === undefined || !p.resources?.length) return null;
  const parts = key.split('/');
  const out: Record<string, readonly unknown[]> = {};
  (p.grouping?.resources ?? []).forEach((name, i) => {
    const def = p.resources?.find((r) => r.name === name);
    const idField = def?.idField ?? 'id';
    const item = def?.data.find((it) => String((it as Record<string, unknown>)[idField]) === parts[i]) as Record<string, unknown> | undefined;
    if (def && item) out[def.field] = [item[idField]];
  });
  return out;
}

/** Resource ids after moving from one resource path to another: the origin ids are replaced, others kept. */
function moveResources(ids: Res, from: Res | null, to: Res): Res {
  const out: Record<string, readonly unknown[]> = { ...ids };
  for (const [field, target] of Object.entries(to)) {
    const old = from?.[field] ?? [];
    const kept = (ids[field] ?? []).filter((x) => !old.some((o) => String(o) === String(x)) && !target.some((t) => String(t) === String(x)));
    out[field] = [...target, ...kept];
  }
  return out;
}

// ---------------------------------------------------------------------------
// Pointer sessions
// ---------------------------------------------------------------------------

interface Ghost {
  readonly g: HTMLElement;
  readonly R: DOMRect;
}

interface Proposal {
  readonly start: number;
  readonly end: number;
  readonly shift: (t: number) => number;
  readonly c: Slot | null;
  readonly res: Res | null;
  /** The Scheduler of the target cell when it is another member of the drag group. */
  readonly other: GetHost | null;
}

const opacity = (els: Iterable<HTMLElement>, v: string): void => {
  for (const el of els) el.style.opacity = v;
};

/** The live pointer session per Scheduler root: a new pointer down ends a stale one (chunk loaded after the release). */
const sessions = new WeakMap<Element, () => void>();

function suppressClick(doc: Document): void {
  const win = doc.defaultView;
  if (!win) return;
  const stop = (e: Event): void => {
    e.stopPropagation();
    e.preventDefault();
  };
  win.addEventListener('click', stop, true);
  setTimeout(() => win.removeEventListener('click', stop, true), 0);
}

/** Pointer down inside the Scheduler: an event drag or resize, or a touch swipe on the view. */
export function down<Row>(getRow: () => DragHost<Row>, ev: PointerEvent): void {
  const get = getRow as unknown as GetHost;
  const h = get();
  const t = ev.target as Element | null;
  if (!h.root || !t?.closest || ev.defaultPrevented) return;
  const root: HTMLElement = h.root;
  const doc = root.ownerDocument;
  const rtl = getComputedStyle(root).direction === 'rtl';
  const hit = t.closest<HTMLElement>('.salmon-scheduler__event');
  const touch = ev.pointerType === 'touch';
  if (!hit || !root.contains(hit)) {
    if (touch && t.closest('.salmon-scheduler__body')) swipe(get, ev, rtl);
    return;
  }
  const el = hit;
  const p = h.props;
  const o: SchedulerDragOptions = p.dragOptions ?? {};
  const key = el.dataset['key'];
  const start = key ? h.find(key) : null;
  const home = slotOf(el.closest<HTMLElement>('[data-cell-start]'));
  if (ev.button !== 0 || !h.can.edit || !start || !home || el.matches('[data-readonly], [data-block], [data-inline]') || (o.excludeSelector && t.closest(o.excludeSelector))) return;
  const occ = start;
  const R = el.getBoundingClientRect();
  // Resize handles are the 6 px start and end edges (block axis in day views, inline axis elsewhere).
  const timed = el.classList.contains('salmon-scheduler__event--timed');
  let edge: 'start' | 'end' | null = null;
  if (p.resizable !== false && !el.classList.contains('salmon-scheduler__event--list')) {
    const [a, b, at] = timed ? [R.top, R.bottom, ev.clientY] : rtl ? [R.right, R.left, ev.clientX] : [R.left, R.right, ev.clientX];
    if (Math.abs(at - b) <= 6 && !el.hasAttribute('data-continues-end')) edge = 'end';
    else if (Math.abs(at - a) <= 6 && !el.hasAttribute('data-continues-start')) edge = 'start';
  }
  if (!edge && p.draggable === false) return;
  const o0 = cellAt(doc, ev.clientX, ev.clientY) ?? home;
  // The origin cell must be of the event's kind (a timed event dragged from its own column, not from a header).
  const origin = o0.all === home.all && o0.h === home.h ? o0 : home;
  const r0 = origin.el.getBoundingClientRect();
  const x0 = ev.clientX;
  const y0 = ev.clientY;
  const p0 = timeAt(origin, r0, x0, y0, rtl);
  if (!h.rctx) return;
  const zone = h.rctx.zone;
  const snapMs = Math.max(1, o.snapMinutes ?? h.opts.slotMinutes / h.opts.slotCount) * MINUTE_MS;
  const snap = (v: number): number => zone.instant(Math.round(zone.wall(v) / snapMs) * snapMs);
  const wallShift = (d: number) => (v: number) => zone.instant(zone.wall(v) + d);
  const fromRes = pathOf(p as SchedulerProps<unknown>, origin.res);
  const scroller = origin.el.closest<HTMLElement>('[data-scroll-area], .salmon-scheduler__tl, .salmon-scheduler__month-body');
  const navDelay = typeof o.navigateOnEdge === 'object' ? (o.navigateOnEdge.delay ?? 1000) : 1000;
  const source: SchedulerEventSource = touch ? 'touch' : 'pointer';
  const resize = edge !== null;
  const cbStart = resize ? p.onEventResizeStart : p.onEventDragStart;
  const cbMove = resize ? p.onEventResize : p.onEventDrag;

  let x = x0;
  let y = y0;
  let active = false;
  let aborted = false;
  let held = !touch;
  let raf = 0;
  let last = '';
  let ghosts: Ghost[] = [];
  let faded: HTMLElement[] = [];
  let others: Occurrence<unknown>[] = [];
  let prop: Proposal | null = null;
  let edgeDir: 'previous' | 'next' | null = null;
  let edgeTimer: ReturnType<typeof setTimeout> | undefined;
  const hold = touch ? setTimeout(() => ((held = true), begin() && schedule()), 400) : undefined;

  const rowsOf = (): unknown[] => [occ.event.row, ...others.map((x) => x.event.row)];
  const fields = (pr: Proposal | null) => ({
    row: occ.event.row,
    rows: rowsOf(),
    start: new Date(pr?.start ?? occ.start),
    end: new Date(pr?.end ?? occ.end),
    allDay: occ.allDay,
    resourceIds: pr?.res ?? null,
    element: el,
    target: pr?.c?.el ?? null,
    ...(resize ? { edge: edge as 'start' | 'end' } : {}),
  });

  const ghost = (src: HTMLElement): Ghost => {
    const b = src.getBoundingClientRect();
    const g = src.cloneNode(true) as HTMLElement;
    g.removeAttribute('id');
    g.setAttribute('aria-hidden', 'true');
    g.setAttribute('data-drag-ghost', '');
    g.inert = true;
    g.style.cssText += `;position:fixed;margin:0;inset:auto;left:${b.left}px;top:${b.top}px;width:${b.width}px;height:${b.height}px;max-width:none;pointer-events:none;z-index:9;opacity:.9;box-shadow:0 4px 12px rgb(0 0 0/.25)`;
    // The top layer escapes the root's overflow and containment; the ghost keeps the root's custom properties.
    if (typeof g.showPopover === 'function') g.setAttribute('popover', 'manual');
    root.append(g);
    g.showPopover?.();
    return { g, R: b };
  };

  /** Starts the gesture after the move threshold (mouse, pen) or the hold (touch). */
  const begin = (): boolean => {
    if (active) return true;
    if (!fire(cbStart, resize ? 'eventResizeStart' : 'eventDragStart', source, fields(null))) {
      stop();
      return false;
    }
    active = true;
    if (!resize && o.multiple) {
      const keys = [...new Set(h.store.getSnapshot().selectedEventKeys.map((k) => k.split('|')[0] as string))];
      if (keys.includes(occ.key)) others = keys.filter((k) => k !== occ.key).map((k) => h.find(k)).filter((x): x is Occurrence<unknown> => !!x && !x.event.readOnly && !x.event.block);
    }
    const keys = new Set([occ.key, ...others.map((x) => x.key)]);
    const parts = [...root.querySelectorAll<HTMLElement>('.salmon-scheduler__event[data-key]')].filter((x) => keys.has(x.dataset['key'] as string));
    faded = parts;
    ghosts = [ghost(el), ...others.map((x) => parts.find((e) => e.dataset['key'] === x.key)).filter((x): x is HTMLElement => !!x).map(ghost)];
    opacity(parts, '0.4');
    return true;
  };

  const schedule = (): void => {
    if (!raf) raf = requestAnimationFrame(frame);
  };

  /** One frame: auto scroll, edge navigation, hit test, proposal, ghost styles and `onEventDrag`. */
  function frame(): void {
    raf = 0;
    if (!active) return;
    let again = false;
    if (scroller && o.autoScroll !== false && scroller.isConnected) {
      const r = scroller.getBoundingClientRect();
      const step = (lo: number, hi: number, v: number): number => (v < lo + 32 ? -Math.ceil((lo + 32 - v) / 4) : v > hi - 32 ? Math.ceil((v - hi + 32) / 4) : 0);
      const dy = step(r.top, r.bottom, y);
      const dx = step(r.left, r.right, x);
      const before = scroller.scrollTop + scroller.scrollLeft;
      if (dx || dy) scroller.scrollBy(dx, dy);
      again = scroller.scrollTop + scroller.scrollLeft !== before;
    }
    if (o.navigateOnEdge && !resize) {
      const rr = root.getBoundingClientRect();
      const dir = x < rr.left + 16 ? (rtl ? 'next' : 'previous') : x > rr.right - 16 ? (rtl ? 'previous' : 'next') : null;
      if (dir !== edgeDir) {
        clearTimeout(edgeTimer);
        edgeDir = dir;
        const tick = (): void => {
          if (!edgeDir) return;
          get().navigate(edgeDir, source);
          edgeTimer = setTimeout(tick, navDelay);
          schedule();
        };
        if (dir) edgeTimer = setTimeout(tick, navDelay);
      }
    }
    prop = propose();
    const [g0] = ghosts;
    if (prop?.c && g0) {
      const c = prop.c;
      const r = c.el.getBoundingClientRect();
      if (!resize) {
        // Moves keep the grabbed offset: the ghosts follow the proposed start (snapped), not the raw pointer.
        let dx: number;
        let dy: number;
        if (c.all) {
          dx = r.left - r0.left;
          dy = r.top - r0.top;
        } else {
          const d = pxOf(c, r, prop.start, rtl) - pxOf(origin, r0, occ.start, rtl);
          [dx, dy] = c.h ? [d, r.top - r0.top] : [r.left - r0.left, d];
        }
        for (const gh of ghosts) gh.g.style.translate = `${dx}px ${dy}px`;
      } else {
        const R0 = g0.R;
        if (c.all) {
          // Day cells: the moved edge follows the cell under the pointer.
          const a = edge === 'end' ? (rtl ? R0.right : R0.left) : rtl ? r.right : r.left;
          const b = edge === 'end' ? (rtl ? r.left : r.right) : rtl ? R0.left : R0.right;
          g0.g.style.left = `${Math.min(a, b)}px`;
          g0.g.style.width = `${Math.max(8, Math.abs(b - a))}px`;
        } else {
          const ro = origin.el.isConnected ? origin.el.getBoundingClientRect() : r0;
          const a = pxOf(origin, ro, prop.start, rtl);
          const b = pxOf(origin, ro, prop.end, rtl);
          const [pos, size] = c.h ? ['left', 'width'] : ['top', 'height'];
          g0.g.style.setProperty(pos, `${Math.min(a, b)}px`);
          g0.g.style.setProperty(size, `${Math.max(4, Math.abs(b - a))}px`);
        }
      }
    } else if (!resize) for (const gh of ghosts) gh.g.style.translate = `${x - x0}px ${y - y0}px`;
    const k = prop ? `${prop.start}:${prop.end}:${prop.c?.res ?? ''}:${prop.other ? 1 : 0}` : '';
    if (k !== last) {
      last = k;
      const time = g0?.g.querySelector('.salmon-scheduler__event-time');
      if (time && prop) time.textContent = h.fmt.range({ ...occ, start: prop.start, end: prop.end });
      if (prop) fire(cbMove, resize ? 'eventResize' : 'eventDrag', source, fields(prop));
    }
    if (again) schedule();
  }

  /** The proposed times, cell and resources under the pointer, or null outside a compatible cell. */
  function propose(): Proposal | null {
    const c = cellAt(doc, x, y);
    const other = c && c.root !== root ? (memberOf(h, c.root) ?? null) : null;
    if (resize) {
      if (c && c.root === root && c.all === origin.all && c.h === origin.h && origin.all) {
        const d = zone.wall(c.s) - zone.wall(origin.s);
        const sh = wallShift(d);
        const min = occ.allDay ? DAY_MS : snapMs;
        return edge === 'end' ? { start: occ.start, end: Math.max(sh(occ.end), occ.start + min), shift: sh, c, res: null, other: null } : { start: Math.min(sh(occ.start), occ.end - min), end: occ.end, shift: sh, c, res: null, other: null };
      }
      if (origin.all) return prop;
      // Timed resize stays on the origin column or row; the time comes from the pointer on that axis.
      const ro = origin.el.isConnected ? origin.el.getBoundingClientRect() : r0;
      const t = timeAt(origin, ro, x, y, rtl);
      const sh = (v: number): number => v;
      return edge === 'end' ? { start: occ.start, end: Math.max(snap(occ.end + t - p0), occ.start + snapMs), shift: sh, c: origin, res: null, other: null } : { start: Math.min(snap(occ.start + t - p0), occ.end - snapMs), end: occ.end, shift: sh, c: origin, res: null, other: null };
    }
    if (!c || c.all !== origin.all || c.h !== origin.h || (c.root !== root && !other)) return null;
    const r = c.el.getBoundingClientRect();
    let shift: (v: number) => number;
    if (c.all) shift = wallShift(zone.wall(c.s) - zone.wall(origin.s));
    else {
      const raw = timeAt(c, r, x, y, rtl) - p0;
      if (occ.allDay) shift = wallShift(Math.round(raw / DAY_MS) * DAY_MS);
      else {
        const d = snap(occ.start + raw) - occ.start;
        shift = (v) => v + d;
      }
    }
    const to = other ? pathOf(other().props as SchedulerProps<unknown>, c.res) : c.res !== origin.res ? pathOf(p as SchedulerProps<unknown>, c.res) : null;
    return { start: shift(occ.start), end: shift(occ.end), shift, c, res: to ? moveResources(other ? {} : occ.event.resources, other ? null : fromRes, to) : null, other };
  }

  const move = (e: PointerEvent): void => {
    if (e.pointerId !== ev.pointerId) return;
    // The chunk may load after the button was already released (first pointer down): no gesture then.
    if (!touch && !(e.buttons & 1)) {
      stop();
      return;
    }
    x = e.clientX;
    y = e.clientY;
    if (!active) {
      const dist = Math.hypot(x - x0, y - y0);
      if (!held) {
        if (dist > 8) stop();
        return;
      }
      if (dist < 4 || !begin()) return;
    }
    schedule();
  };
  const key2 = (e: KeyboardEvent): void => {
    if (e.key === 'Escape' && active) {
      e.preventDefault();
      e.stopPropagation();
      aborted = true;
      stop();
    }
  };
  // Touch: once the hold started the drag, the page must not scroll; no text selection or native drag meanwhile.
  const touchMove = (e: Event): void => {
    if (active && e.cancelable) e.preventDefault();
  };
  const win = doc.defaultView as Window;
  const up = (e: PointerEvent): void => {
    if (e.pointerId !== ev.pointerId) return;
    x = e.clientX;
    y = e.clientY;
    const was = active;
    if (was && e.type === 'pointerup') {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      // Released outside a compatible cell: a move snaps back; a resize keeps its last edge.
      prop = propose() ?? (resize ? prop : null);
    }
    stop();
    if (was || aborted) suppressClick(doc);
    if (was && e.type === 'pointerup') drop();
  };

  function stop(): void {
    if (sessions.get(root) === stop) sessions.delete(root);
    clearTimeout(hold);
    clearTimeout(edgeTimer);
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    active = false;
    for (const x of ghosts) x.g.remove();
    ghosts = [];
    opacity(faded, '');
    faded = [];
    win.removeEventListener('pointermove', move);
    win.removeEventListener('pointerup', up);
    win.removeEventListener('pointercancel', up);
    win.removeEventListener('keydown', key2, true);
    win.removeEventListener('touchmove', touchMove);
    win.removeEventListener('selectstart', touchMove);
    win.removeEventListener('dragstart', touchMove);
  }

  /** The drop: drag out, `onBeforeEventDrop` / `onBeforeEventResizeEnd`, then one save per moved event. */
  function drop(): void {
    const hh = get();
    const p2 = hh.props;
    const o2: SchedulerDragOptions = p2.dragOptions ?? {};
    if (!resize && o2.dragOutArea) {
      const area = typeof o2.dragOutArea === 'string' ? doc.querySelector(o2.dragOutArea) : o2.dragOutArea;
      const hit = doc.elementFromPoint(x, y);
      if (area && hit && area.contains(hit) && !root.contains(hit)) {
        fire(p2.onEventDragOut, 'eventDragOut', source, { row: occ.event.row, rows: rowsOf(), target: hit, clientX: x, clientY: y });
        return;
      }
    }
    const pr = prop;
    if (!pr?.c || (pr.start === occ.start && pr.end === occ.end && !pr.res && !pr.other)) return;
    if (!fire(resize ? p2.onBeforeEventResizeEnd : p2.onBeforeEventDrop, resize ? 'beforeEventResizeEnd' : 'beforeEventDrop', source, { ...fields(pr), previousStart: new Date(occ.start), previousEnd: new Date(occ.end) })) return;
    const done = (result: SchedulerActionResult<unknown>): void => {
      const cb = resize ? get().props.onEventResizeEnd : get().props.onEventDrop;
      cb?.({ type: resize ? 'eventResizeEnd' : 'eventDrop', source, ...fields(pr), result });
    };
    if (pr.other) {
      done(handOff(hh, pr.other(), occ, pr));
      return;
    }
    const save = (x: Occurrence<unknown>, scope: EditScope): SchedulerActionResult<unknown> => {
      const ns = x === occ ? pr.start : pr.shift(x.start);
      const ne = x === occ ? pr.end : pr.shift(x.end);
      // A series edit from an occurrence shifts the series by the occurrence delta (as the editor does).
      const series = scope === 'series' && x.generated;
      const res = pr.res && x !== occ ? moveResources(x.event.resources, fromRes, pathOf(p2 as SchedulerProps<unknown>, pr.c?.res) ?? {}) : pr.res;
      const changes: EventChanges = { start: series ? x.event.start + ns - x.start : ns, end: series ? x.event.end + ne - x.end : ne, ...(res ? { resources: res } : {}) };
      return hh.save(series ? { ...x, start: x.event.start, end: x.event.end, generated: false } : x, changes, scope, source);
    };
    const recurring = occ.seriesId !== undefined;
    const ed = typeof p2.editing === 'object' ? p2.editing : {};
    if (recurring && !others.length && ed.recurrencePrompt !== false) {
      hh.store.set({ popup: { kind: 'recurrenceAlert', key: occ.key, action: 'save', payload: (scope: EditScope) => done(save(occ, scope)), returnFocus: el.isConnected ? el : null } });
      return;
    }
    let result = save(occ, recurring ? 'occurrence' : 'series');
    if (result.status !== 'rejected' && result.status !== 'cancelled') for (const x of others) result = save(x, x.seriesId !== undefined ? 'occurrence' : 'series');
    done(result);
  }

  sessions.get(root)?.();
  sessions.set(root, stop);
  win.addEventListener('pointermove', move);
  win.addEventListener('pointerup', up);
  win.addEventListener('pointercancel', up);
  win.addEventListener('keydown', key2, true);
  win.addEventListener('selectstart', touchMove);
  win.addEventListener('dragstart', touchMove);
  if (touch) win.addEventListener('touchmove', touchMove, { passive: false });
}

/** Drop on another Scheduler of the group: the target adds a copy, then the source deletes the event. */
function handOff(src: Host, dst: Host, occ: Occurrence<unknown>, pr: Proposal): SchedulerActionResult<unknown> {
  const f = dst.rctx?.fields;
  if (!f || occ.seriesId !== undefined) return { status: 'rejected', rows: [], reason: 'recurring' };
  const row: Record<string, unknown> = { ...(occ.event.row as Record<string, unknown>) };
  row[f.start] = new Date(pr.start);
  row[f.end] = new Date(pr.end);
  for (const [field, ids] of Object.entries(pr.res ?? {})) row[field] = dst.props.resources?.find((r) => r.field === field)?.multiple ? [...ids] : ids[0];
  const res = dst.addEvents([row]);
  if (res.status !== 'rejected' && res.status !== 'cancelled') src.remove(occ, 'series', 'pointer');
  return res;
}

/** HTML drag data dropped on a slot: `onExternalDrop` returns the rows to add. */
export function external<Row>(host: DragHost<Row>, ev: DragEvent): void {
  const h = host as unknown as Host;
  const cb = h.props.onExternalDrop;
  const root = h.root;
  const zone = h.rctx?.zone;
  if (!cb || !root || !zone) return;
  ev.preventDefault();
  const c = cellAt(root.ownerDocument, ev.clientX, ev.clientY);
  if (!c || c.root !== root) return;
  const snapMs = Math.max(1, h.props.dragOptions?.snapMinutes ?? h.opts.slotMinutes / h.opts.slotCount) * MINUTE_MS;
  const t = timeAt(c, c.el.getBoundingClientRect(), ev.clientX, ev.clientY, getComputedStyle(root).direction === 'rtl');
  const start = c.all ? c.s : zone.instant(Math.floor(zone.wall(t) / snapMs) * snapMs);
  const rows = cb({ type: 'externalDrop', source: 'pointer', data: ev.dataTransfer, start: new Date(start), end: new Date(start + c.e - c.s), allDay: c.all, resourceIds: pathOf(h.props as SchedulerProps<unknown>, c.res) ?? {}, element: c.el });
  if (rows?.length) h.addEvents(rows);
}

/** Touch swipe navigation: a quick horizontal swipe on a day or month view, mirrored in RTL. */
function swipe(get: GetHost, ev: PointerEvent, rtl: boolean): void {
  const h = get();
  const view = h.root?.getAttribute('data-view') ?? '';
  const on = h.props.swipeNavigation ?? globalThis.matchMedia?.('(pointer: coarse)').matches;
  if (!on || view.startsWith('timeline') || !h.root) return;
  const win = h.root.ownerDocument.defaultView as Window;
  const end = (e: PointerEvent): void => {
    if (e.pointerId !== ev.pointerId) return;
    win.removeEventListener('pointerup', end);
    win.removeEventListener('pointercancel', end);
    const dx = e.clientX - ev.clientX;
    const dy = e.clientY - ev.clientY;
    if (e.type !== 'pointerup' || Math.abs(dx) < 50 || Math.abs(dx) < 2 * Math.abs(dy) || e.timeStamp - ev.timeStamp > 1000) return;
    suppressClick(h.root?.ownerDocument as Document);
    get().navigate(dx < 0 !== rtl ? 'next' : 'previous', 'touch');
  };
  win.addEventListener('pointerup', end);
  win.addEventListener('pointercancel', end);
}
