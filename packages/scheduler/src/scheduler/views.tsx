'use client';

// Day, week, work week and month views. Markup is
// plain elements with `.salmon-scheduler__*` parts and `data-*` state;
// events are absolutely placed by CSS custom properties computed from the
// engine layout, so a selection change re-renders only the parts whose
// `data-selected` flips (narrow selectors).

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { fromDays, localeWeekRule, weekNumber, type WeekRule } from '@salmonui/core/internal/dates/index';
import type { DayLayout, MonthLayout, SpanPart, TimedPart } from '../internal/scheduler/layout.js';
import { DAY_MS, MINUTE_MS } from '../internal/scheduler/time.js';
import type { Occurrence } from '../internal/scheduler/types.js';
import type { GroupColumn, GroupNode } from '../internal/scheduler/resources.js';
import { useHydrated } from '@salmonui/core/internal/hydrated';
import { useScheduler, useSchedulerSelector } from './context.js';
import type { SchedulerCellContext, SchedulerEventRenderContext, SchedulerCellPart } from './types.js';

export const cx = (...parts: (string | false | null | undefined)[]): string => parts.filter(Boolean).join(' ');

export function mergeProps(base: { className: string; style?: CSSProperties }, extra: { className?: string; style?: CSSProperties; [k: string]: unknown } | undefined): Record<string, unknown> {
  if (!extra) return base;
  const { className, style, ...rest } = extra;
  return { ...rest, className: cx(base.className, className), style: style ? { ...base.style, ...style } : base.style };
}

/** One rendered event part (a timed block, an all-day bar or a month bar). */
export function EventPart(props: { readonly occurrence: Occurrence<unknown>; readonly className: string; readonly style: CSSProperties; readonly continuesBefore: boolean; readonly continuesAfter: boolean; readonly g?: GroupNode | null | undefined; readonly tab?: boolean; readonly compact?: boolean }) {
  const { store, props: p, fmt, actions, view, t, opts, editable, group } = useScheduler();
  const o = props.occurrence;
  // Copies of an event in several resources select together only with `grouping.sharedEvents`.
  const selKey = group && !group.shared && props.g ? `${o.key}|${props.g.key}` : o.key;
  const color = group?.color(o.event, props.g);
  const selected = useSchedulerSelector(store, (s) => s.selectedEventKeys.includes(selKey));
  const pending = useSchedulerSelector(store, (s) => s.pending.includes(o.eventId));
  const inlineText = useSchedulerSelector(store, (s) => (s.inline?.key === o.key ? s.inline.text : null));
  const timeText = fmt.range(o);
  const ctx: SchedulerEventRenderContext<unknown> = {
    row: o.event.row,
    id: o.eventId,
    title: o.event.title,
    start: new Date(o.start),
    end: new Date(o.end),
    allDay: o.allDay,
    view,
    recurring: o.seriesId !== undefined,
    selected,
    timeText,
  };
  const extra = p.getEventProps?.(ctx);
  if (extra?.hidden) return null;
  const render = opts.entry.renderEvent ?? p.renderEvent;
  const title = o.event.title || t('noTitle');
  // The resource of a grouped copy is part of the accessible name.
  const where = props.g ? `, ${props.g.info.text}` : '';
  const base = {
    className: cx('salmon-scheduler__event', props.className, props.g?.info.className),
    style: color ? ({ ...props.style, '--salmon-scheduler-event-color': color } as CSSProperties) : props.style,
  };
  const { hidden: _hidden, ...rest } = extra ?? {};
  if (inlineText !== null)
    return (
      <div {...mergeProps(base, rest as Record<string, unknown>)} data-event-id={String(o.eventId)} data-key={o.key} data-inline="">
        <InlineInput initial={inlineText} label={t('fieldTitle')} />
      </div>
    );
  return (
    <button
      type="button"
      // Inside a grid the cells and events share one roving tab stop; list views keep every event tabbable.
      tabIndex={props.tab ? undefined : -1}
      {...mergeProps(base, rest as Record<string, unknown>)}
      aria-pressed={selected}
      data-event-id={String(o.eventId)}
      data-key={o.key}
      data-selected={selected ? '' : undefined}
      data-all-day={o.allDay ? '' : undefined}
      data-recurring={o.seriesId !== undefined ? '' : undefined}
      data-block={o.event.block ? '' : undefined}
      data-readonly={o.event.readOnly || !editable ? '' : undefined}
      data-pending={pending ? '' : undefined}
      data-color={color ? '' : undefined}
      data-resource={props.g?.key}
      data-continues-start={props.continuesBefore ? '' : undefined}
      data-continues-end={props.continuesAfter ? '' : undefined}
      data-compact={props.compact ? '' : undefined}
      onClick={(e) => actions.eventClick(o, e.currentTarget, e.detail === 0 ? 'keyboard' : 'pointer', false, e.shiftKey ? 'range' : e.ctrlKey || e.metaKey, selKey)}
      onDoubleClick={(e) => actions.eventClick(o, e.currentTarget, 'pointer', true, false)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && e.altKey) {
          e.preventDefault();
          actions.eventClick(o, e.currentTarget, 'keyboard', true, false);
        } else if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey && !e.shiftKey && actions.inlineStart({ key: o.key }, o.event.title)) e.preventDefault();
      }}
      onPointerEnter={(e) => actions.hover('event', o, o.start, e.currentTarget)}
    >
      {render ? (
        <>
          {render(ctx)}
          <span className="salmon-scheduler__sr">{`, ${timeText}${where}`}</span>
        </>
      ) : (
        <>
          <span className="salmon-scheduler__event-title">{title}</span>
          {o.allDay ? <span className="salmon-scheduler__sr">{`, ${timeText}`}</span> : <span className="salmon-scheduler__event-time">{timeText}</span>}
          {o.event.location ? <span className="salmon-scheduler__event-location">{o.event.location}</span> : null}
          {where ? <span className="salmon-scheduler__sr">{where}</span> : null}
        </>
      )}
    </button>
  );
}

/** The inline title input: Enter or blur saves, Escape cancels; focus goes back to the cell or event. */
function InlineInput(props: { readonly initial: string; readonly label: string }) {
  const { actions } = useScheduler();
  const [value, setValue] = useState(props.initial);
  const done = useRef(false);
  const ref = useRef<HTMLInputElement | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    el?.focus({ preventScroll: true });
    el?.setSelectionRange(el.value.length, el.value.length);
  }, []);
  const finish = (el: HTMLElement, save: boolean): void => {
    if (done.current) return;
    done.current = true;
    const host = el.closest<HTMLElement>('[data-cell-start]');
    if (save) actions.inlineCommit(value, host);
    else actions.inlineCancel(host);
  };
  return (
    <input
      className="salmon-scheduler__inline-input"
      aria-label={props.label}
      value={value}
      ref={ref}
      onChange={(e) => setValue(e.currentTarget.value)}
      onPointerDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Enter' || e.key === 'Escape') {
          e.preventDefault();
          finish(e.currentTarget, e.key === 'Enter');
        }
      }}
      onBlur={(e) => finish(e.currentTarget, true)}
    />
  );
}

export function cellContext(part: SchedulerCellPart, day: number, start: number, end: number, view: SchedulerCellContext['view'], work: boolean, res?: GroupNode | null): SchedulerCellContext {
  return { part, date: fromDays(day), start: new Date(start), end: new Date(end), view, work, resource: res?.info };
}

export function DateHeader(props: { readonly day: number; readonly span?: number }) {
  const { fmt, actions, today, view, zone, cellProps, props: p, opts } = useScheduler();
  const ctx = cellContext('dateHeader', props.day, zone.dayStart(props.day), zone.dayStart(props.day + 1), view, opts.view.workDays.includes((((props.day + 4) % 7) + 7) % 7));
  const extra = cellProps(ctx);
  const isToday = today === props.day;
  return (
    <div role="columnheader" {...mergeProps({ className: 'salmon-scheduler__date-header', ...(props.span ? { style: { gridColumn: `span ${props.span}` } } : {}) }, extra as Record<string, unknown>)} data-day={fromDays(props.day).toString()} data-today={isToday ? '' : undefined} aria-label={fmt.fullDate(props.day)}>
      {p.renderDateHeader ? (
        p.renderDateHeader(ctx)
      ) : (
        <button type="button" className="salmon-scheduler__date-link" onClick={(e) => actions.goToDay(props.day, e.detail === 0 ? 'keyboard' : 'pointer')} aria-current={isToday ? 'date' : undefined}>
          <span className="salmon-scheduler__date-weekday">{fmt.weekday(props.day)}</span>
          <span className="salmon-scheduler__date-number">{fmt.dayNumber(props.day)}</span>
        </button>
      )}
    </div>
  );
}

// Event parts render inside the cell where they start (valid grid ownership) and are placed
// relative to it: spans by lane and column count, timed parts by minutes within the start slot.
export function spanStyle(part: SpanPart<unknown>): CSSProperties {
  return { '--salmon-scheduler-lane': part.lane, '--salmon-scheduler-span': part.endColumn - part.startColumn } as CSSProperties;
}

function timedStyle(part: TimedPart<unknown>, slotTop: number, slotMinutes: number): CSSProperties {
  return {
    insetBlockStart: `${((part.top - slotTop) / slotMinutes) * 100}%`,
    blockSize: `${(Math.max(part.bottom - part.top, 0) / slotMinutes) * 100}%`,
    insetInlineStart: `${(part.lane / part.lanes) * 100}%`,
    inlineSize: `calc(${(1 / part.lanes) * 100}% - 6px / ${part.lanes})`,
  } as CSSProperties;
}

export function groupBy<T>(items: readonly T[], key: (item: T) => string): Map<string, T[]> {
  const out = new Map<string, T[]>();
  for (const it of items) {
    const k = key(it);
    const list = out.get(k);
    if (list) list.push(it);
    else out.set(k, [it]);
  }
  return out;
}

/** Pointer selection of cells: pointer down on a cell, drag over cells of the same kind, up ends. No React state during the drag: the range is written to `data-selecting` on cells. */
export function useCellPointer() {
  const { actions, props: p, view, group } = useScheduler();
  const multiple = p.cellSelection === 'multiple';
  // `cellSelectionRows: false` keeps a drag in the start cell's day column (day views) or row (other views).
  const lineOf = (c: HTMLElement): unknown => (view === 'day' || view === 'week' || view === 'workWeek' ? Array.prototype.indexOf.call(c.parentElement?.children ?? [], c) : c.parentElement);
  return {
    onPointerDown(e: ReactPointerEvent<HTMLElement>) {
      if (e.button !== 0) return;
      const cell = (e.target as Element).closest<HTMLElement>('[data-cell-start]');
      if (!cell) return;
      const allDay = cell.hasAttribute('data-all-day-cell');
      const s0 = Number(cell.dataset['cellStart']);
      const e0 = Number(cell.dataset['cellEnd']);
      // A drag stays in the start cell's resource.
      const rk = cell.dataset['resource'];
      const res = rk ? group?.byKey.get(rk) : null;
      const same = (c: HTMLElement): boolean => c.hasAttribute('data-all-day-cell') === allDay && c.dataset['resource'] === rk;
      if (e.shiftKey && multiple) {
        actions.cellSelect(s0, e0, allDay, true, res);
        return;
      }
      // A pointer down on a movable event drags the event (drag chunk), not a cell range.
      if (!multiple || (p.draggable !== false && (e.target as Element).closest('.salmon-scheduler__event:not([data-readonly])'))) return;
      const root = cell.closest('.salmon-scheduler') as HTMLElement | null;
      let last = { s: s0, e: e0 };
      const line = p.cellSelectionRows === false ? lineOf(cell) : null;
      const move = (ev: PointerEvent) => {
        const el = (ev.target as Element | null)?.closest?.<HTMLElement>('[data-cell-start]') ?? document.elementFromPoint(ev.clientX, ev.clientY)?.closest<HTMLElement>('[data-cell-start]');
        if (!el || !same(el) || (line !== null && lineOf(el) !== line)) return;
        const s = Number(el.dataset['cellStart']);
        const en = Number(el.dataset['cellEnd']);
        last = { s: Math.min(s0, s), e: Math.max(e0, en) };
        root?.querySelectorAll<HTMLElement>('[data-cell-start]').forEach((c) => {
          const cs = Number(c.dataset['cellStart']);
          c.toggleAttribute('data-selecting', same(c) && cs >= last.s && cs < last.e);
        });
      };
      const up = () => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        root?.querySelectorAll('[data-selecting]').forEach((c) => c.removeAttribute('data-selecting'));
        if (last.s !== s0 || last.e !== e0) actions.cellSelect(last.s, last.e, allDay, true, res);
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
    },
  };
}

export function Cell(props: { readonly part: SchedulerCellPart; readonly day: number; readonly start: number; readonly end: number; readonly allDay: boolean; readonly work: boolean; readonly className: string; readonly children?: ReactNode; readonly label: string; readonly style?: CSSProperties; readonly res?: GroupNode | null | undefined }) {
  const { store, actions, view, cellProps, props: p, t } = useScheduler();
  const rk = props.res?.key;
  const selected = useSchedulerSelector(store, (s) => !!s.selectedCells && s.selectedCells.allDay === props.allDay && s.selectedCells.group === rk && props.start >= s.selectedCells.start && props.start < s.selectedCells.end);
  const inlineText = useSchedulerSelector(store, (s) => (s.inline?.cells && s.inline.cells.start === props.start && s.inline.cells.allDay === props.allDay && s.inline.cells.group === rk ? s.inline.text : null));
  const ctx = cellContext(props.part, props.day, props.start, props.end, view, props.work, props.res);
  const extra = cellProps(ctx) as Record<string, unknown> | undefined;
  // `api.setWorkHours` overrides reach the cell through the context's cell props.
  const work = extra && 'data-work-override' in extra ? extra['data-work'] !== undefined : props.work;
  const onKey = (e: KeyboardEvent<HTMLElement>) => {
    if (e.target !== e.currentTarget) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      actions.cellClick(props.start, props.end, props.allDay, e.currentTarget, 'keyboard', e.key === 'Enter' && e.altKey, props.res);
    } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      const sel = store.getSnapshot().selectedCells;
      const cells = sel && sel.allDay === props.allDay && sel.group === rk && props.start >= sel.start && props.start < sel.end ? sel : { start: props.start, end: props.end, allDay: props.allDay, group: rk, resources: props.res?.path };
      if (actions.inlineStart({ cells }, e.key)) e.preventDefault();
    }
  };
  return (
    <div
      role="gridcell"
      tabIndex={-1}
      {...mergeProps({ className: cx(props.className, props.res?.info.className), ...(props.style ? { style: props.style } : {}) }, extra as Record<string, unknown>)}
      aria-selected={selected}
      data-resource={rk}
      data-cell-start={props.start}
      data-cell-end={props.end}
      data-all-day-cell={props.allDay ? '' : undefined}
      data-work={work ? '' : undefined}
      data-selected={selected ? '' : undefined}
      onClick={(e) => {
        if ((e.target as Element).closest('.salmon-scheduler__event, button, a, input') && e.target !== e.currentTarget) return;
        actions.cellClick(props.start, props.end, props.allDay, e.currentTarget, 'pointer', false, props.res);
      }}
      onDoubleClick={(e) => {
        if ((e.target as Element).closest('.salmon-scheduler__event, button, a, input') && e.target !== e.currentTarget) return;
        actions.cellClick(props.start, props.end, props.allDay, e.currentTarget, 'pointer', true, props.res);
      }}
      onKeyDown={onKey}
      onPointerEnter={(e) => actions.hover('cell', null, props.start, e.currentTarget)}
    >
      <span className="salmon-scheduler__sr">{props.label}</span>
      {p.renderCell ? p.renderCell(ctx) : null}
      {props.children}
      {inlineText !== null ? (
        <div className="salmon-scheduler__event salmon-scheduler__event--inline" data-inline="">
          <InlineInput initial={inlineText} label={t('fieldTitle')} />
        </div>
      ) : null}
    </div>
  );
}

function NowIndicator(props: { readonly day: number; readonly startMinute: number; readonly endMinute: number }) {
  const { zone, t, props: p, opts } = useScheduler();
  const hydrated = useHydrated();
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    tick();
    const timer = setInterval(tick, 60_000);
    return () => clearInterval(timer);
  }, []);
  if (!hydrated || now === null || p.currentTimeIndicator === false) return null;
  const wall = zone.wall(now);
  if (Math.floor(wall / DAY_MS) !== props.day) return null;
  const minutes = (wall - props.day * DAY_MS) / MINUTE_MS;
  if (minutes < props.startMinute || minutes >= props.endMinute) return null;
  const minor = opts.slotMinutes / opts.slotCount;
  const label = typeof p.currentTimeIndicator === 'object' && p.currentTimeIndicator.label === false ? undefined : t('currentTime');
  // Placed from the first slot cell of the day: offsets in slot heights.
  return <div className="salmon-scheduler__now" aria-hidden="true" title={label} style={{ insetBlockStart: `${((minutes - props.startMinute) / minor) * 100}%` }} />;
}

/** Day, week and work week; grouped views pass `cols` (a day and a resource per column) and `head` (the header rows). */
export function DayView(props: { readonly days: readonly number[]; readonly layout: DayLayout<unknown>; readonly cols?: readonly GroupColumn[]; readonly head?: ReactNode }) {
  const { opts, zone, fmt, t, actions, store, props: p, id, view, scrollStart } = useScheduler();
  const allDayExpanded = useSchedulerSelector(store, (s) => s.allDayExpanded);
  const pointer = useCellPointer();
  // Mount (also from the lazy resources chunk or an adaptive switch) and view change start at scrollTime.
  const scroller = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => scrollStart(scroller.current), [opts.entry.name]); // eslint-disable-line react-hooks/exhaustive-deps
  const { days, layout } = props;
  const columns = props.cols ?? days.map((d) => ({ d, g: null }));
  const minor = opts.slotMinutes / opts.slotCount;
  const slots: number[] = [];
  for (let m = opts.startMinute; m < opts.endMinute; m += minor) slots.push(m);
  const style = { '--salmon-scheduler-columns': columns.length, '--salmon-scheduler-slots': slots.length, '--salmon-scheduler-all-day-lanes': Math.max(1, layout.allDayLanes) } as CSSProperties;
  const workDay = (d: number, g?: GroupNode | null) => (g?.work.days ?? opts.view.workDays).includes((((d + 4) % 7) + 7) % 7);
  const moreAny = layout.allDayMore.some((n) => n > 0);
  const spans = groupBy(
    layout.allDay.filter((x) => !x.hidden),
    (x) => String(x.startColumn),
  );
  const timed = groupBy(
    layout.timed.flat(),
    (x) => `${x.column}:${Math.min(slots.length - 1, Math.floor(x.top / minor))}`,
  );
  return (
    <div className="salmon-scheduler__day-view" style={style} data-view={view} onPointerDown={pointer.onPointerDown}>
      <div role="grid" aria-labelledby={id('range')} aria-readonly={opts.readOnly || undefined} className="salmon-scheduler__grid">
        <div role="rowgroup" className="salmon-scheduler__header">
          {props.head ?? (
            <div role="row" className="salmon-scheduler__date-header-row">
              <div role="none" className="salmon-scheduler__header-indent">
                {p.renderHeaderIndent ? p.renderHeaderIndent() : null}
              </div>
              {days.map((d) => (
                <DateHeader key={d} day={d} />
              ))}
            </div>
          )}
          <div role="row" className="salmon-scheduler__all-day-row" data-expanded={allDayExpanded ? '' : undefined} data-scroll={p.allDayRowScroll ? '' : undefined}>
            <div role="rowheader" className="salmon-scheduler__all-day-label">
              <span>{t('allDay')}</span>
              {moreAny || allDayExpanded ? (
                <button type="button" className="salmon-scheduler__all-day-toggle" aria-expanded={allDayExpanded} aria-label={t(allDayExpanded ? 'collapseAllDay' : 'expandAllDay')} onClick={() => actions.toggleAllDay()}>
                  <Icon name={allDayExpanded ? 'collapse' : 'expand'} />
                </button>
              ) : null}
            </div>
            {columns.map(({ d, g }, c) => (
              <Cell key={c} part="allDayCell" day={d} start={zone.dayStart(d)} end={zone.dayStart(d + 1)} allDay work={workDay(d, g)} res={g} className="salmon-scheduler__all-day-cell" label={`${t('allDay')}, ${fmt.fullDate(d)}${g ? `, ${g.info.text}` : ''}`}>
                {(spans.get(String(c)) ?? []).map((part) => (
                  <EventPart key={`${part.occurrence.key}:${part.startColumn}`} occurrence={part.occurrence} g={g} className="salmon-scheduler__event--span" style={spanStyle(part)} continuesBefore={part.continuesBefore} continuesAfter={part.continuesAfter} />
                ))}
                {(layout.allDayMore[c] ?? 0) > 0 && p.eventLayout?.moreIndicator !== false ? (
                  <button type="button" tabIndex={-1} className="salmon-scheduler__more" onClick={(e) => actions.moreClick(d, e.currentTarget, e.detail === 0 ? 'keyboard' : 'pointer')}>
                    {t('more', { count: layout.allDayMore[c] ?? 0 })}
                  </button>
                ) : null}
              </Cell>
            ))}
          </div>
        </div>
        <div ref={scroller} role="rowgroup" className="salmon-scheduler__time-scroll" data-scroll-area="" tabIndex={0}>
          {slots.map((m, r) => {
            const major = (m - opts.startMinute) % opts.slotMinutes === 0;
            const slotWall = (days[0] ?? 0) * DAY_MS + m * MINUTE_MS;
            const slotText = major ? fmt.slot(slotWall) : fmt.time(slotWall);
            const render = major ? p.renderMajorSlot : p.renderMinorSlot;
            return (
              <div role="row" key={m} className="salmon-scheduler__time-row" data-major={major ? '' : undefined}>
                <div role="rowheader" className="salmon-scheduler__time-label">
                  {render ? render({ date: fromDays(days[0] ?? 0), minutes: m, major, text: slotText }) : major ? <span>{slotText}</span> : <span className="salmon-scheduler__sr">{slotText}</span>}
                </div>
                {columns.map(({ d, g }, c) => {
                  const s = zone.instant(d * DAY_MS + m * MINUTE_MS);
                  const e = zone.instant(d * DAY_MS + (m + minor) * MINUTE_MS);
                  const work = workDay(d, g) && m >= (g?.work.start ?? opts.workStart) && m < (g?.work.end ?? opts.workEnd) && p.workHours?.highlight !== false;
                  const parts = timed.get(`${c}:${r}`);
                  return (
                    <Cell key={c} part="workCell" day={d} start={s} end={e} allDay={false} work={work} res={g} className="salmon-scheduler__work-cell" label={`${fmt.fullDate(d)}, ${fmt.time(d * DAY_MS + m * MINUTE_MS)}${g ? `, ${g.info.text}` : ''}`}>
                      {parts?.map((part) => (
                        <EventPart key={`${part.occurrence.key}:${c}`} occurrence={part.occurrence} g={g} className="salmon-scheduler__event--timed" style={timedStyle(part, m - opts.startMinute, minor)} compact={part.bottom - part.top < minor} continuesBefore={part.continuesBefore} continuesAfter={part.continuesAfter} />
                      ))}
                      {r === 0 ? <NowIndicator day={d} startMinute={opts.startMinute} endMinute={opts.endMinute} /> : null}
                    </Cell>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/** Month; grouped views pass `cells` (a week's cells with their resources) and `head` (the header rows). */
export function MonthView(props: { readonly weeks: readonly (readonly number[])[]; readonly layout: MonthLayout<unknown>; readonly anchor: number; readonly cells?: (week: readonly number[]) => readonly GroupColumn[]; readonly head?: ReactNode }) {
  const { fmt, actions, today, zone, view, props: p, opts, t, id, locale } = useScheduler();
  const pointer = useCellPointer();
  const anchorMonth = fromDays(props.anchor).month;
  const cellsOf = props.cells ?? ((w: readonly number[]) => w.map((d) => ({ d, g: null })));
  const cols = cellsOf(props.weeks[0] ?? []).length;
  const maxLanes = p.autoRowHeight ? null : (opts.entry.eventLayout?.maxHeight ?? p.eventLayout?.maxHeight ?? 3);
  const workDay = (d: number) => opts.view.workDays.includes((((d + 4) % 7) + 7) % 7);
  return (
    <div className="salmon-scheduler__month-view" style={{ '--salmon-scheduler-columns': cols, '--salmon-scheduler-max-lanes': maxLanes ?? 0 } as CSSProperties} data-view={view} data-auto-height={p.autoRowHeight ? '' : undefined} onPointerDown={pointer.onPointerDown}>
      <div role="grid" aria-labelledby={id('range')} className="salmon-scheduler__grid">
        <div role="rowgroup" className="salmon-scheduler__header">
          {props.head ?? (
            <div role="row" className="salmon-scheduler__weekday-row">
              {p.showWeekNumbers ? <div role="none" className="salmon-scheduler__week-number-header" /> : null}
              {(props.weeks[0] ?? []).map((d) => (
                <div role="columnheader" key={d} className="salmon-scheduler__weekday">
                  {fmt.weekday(d)}
                </div>
              ))}
            </div>
          )}
        </div>
        <div role="rowgroup" className="salmon-scheduler__month-body" tabIndex={0}>
          {props.weeks.map((week, r) => {
            const row = props.layout.rows[r];
            const lanes = row?.lanes ?? 0;
            const spans = groupBy(
              (row?.parts ?? []).filter((x) => !x.hidden),
              (x) => String(x.startColumn),
            );
            const wk = weekNumberOf(week[0] ?? 0, opts.view.firstDayOfWeek, p.weekRule, locale);
            return (
              <div role="row" key={week[0] ?? r} className="salmon-scheduler__week-row" style={{ '--salmon-scheduler-lanes': lanes } as CSSProperties}>
                {p.showWeekNumbers ? (
                  <div role="rowheader" className="salmon-scheduler__week-number">
                    <span aria-hidden="true">{wk}</span>
                    <span className="salmon-scheduler__sr">{t('weekNumber', { week: wk })}</span>
                  </div>
                ) : null}
                {cellsOf(week).map(({ d, g }, c) => {
                  const date = fromDays(d);
                  const more = row?.more[c] ?? 0;
                  return (
                    <Cell key={c} part="monthCell" day={d} start={zone.dayStart(d)} end={zone.dayStart(d + 1)} allDay work={workDay(d)} res={g} className="salmon-scheduler__month-cell" label={g ? `${fmt.fullDate(d)}, ${g.info.text}` : fmt.fullDate(d)}>
                      <span className="salmon-scheduler__month-cell-header" data-outside={date.month !== anchorMonth ? '' : undefined} data-today={today === d ? '' : undefined}>
                        {p.renderCellHeader ? (
                          p.renderCellHeader(cellContext('monthCell', d, zone.dayStart(d), zone.dayStart(d + 1), view, workDay(d)))
                        ) : (
                          <button type="button" tabIndex={-1} className="salmon-scheduler__date-link" aria-current={today === d ? 'date' : undefined} onClick={(e) => actions.goToDay(d, e.detail === 0 ? 'keyboard' : 'pointer')}>
                            <span aria-hidden="true">{date.day === 1 ? fmt.monthDay(d) : fmt.dayNumber(d)}</span>
                            <span className="salmon-scheduler__sr">{fmt.fullDate(d)}</span>
                          </button>
                        )}
                      </span>
                      {(spans.get(String(c)) ?? []).map((part) => (
                        <EventPart key={`${part.occurrence.key}:${r}`} occurrence={part.occurrence} g={g} className="salmon-scheduler__event--span" style={spanStyle(part)} continuesBefore={part.continuesBefore} continuesAfter={part.continuesAfter} />
                      ))}
                      {more > 0 && p.eventLayout?.moreIndicator !== false ? (
                        <button type="button" tabIndex={-1} className="salmon-scheduler__more" onClick={(e) => actions.moreClick(d, e.currentTarget, e.detail === 0 ? 'keyboard' : 'pointer')}>
                          {t('more', { count: more })}
                        </button>
                      ) : null}
                    </Cell>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function weekNumberOf(day: number, firstDay: number, rule: WeekRule | undefined, locale: string): number {
  return weekNumber(day, firstDay, rule ?? localeWeekRule(locale));
}

/** Inline SVG icons (no text glyphs, so accessible names come only from labels). */
export function Icon(props: { readonly name: 'previous' | 'next' | 'close' | 'expand' | 'collapse' }) {
  const d = { previous: 'M10 3 5 8l5 5', next: 'M6 3l5 5-5 5', close: 'M4 4l8 8M12 4l-8 8', expand: 'M4 6l4 4 4-4', collapse: 'M4 10l4-4 4 4' }[props.name];
  return (
    <svg className="salmon-scheduler__icon" data-icon={props.name} aria-hidden="true" focusable="false" viewBox="0 0 16 16" width="16" height="16">
      <path d={d} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
