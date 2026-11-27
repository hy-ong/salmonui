'use client';

// List views chunk: Year (month
// grids that mark the days with events; a day opens its event list, whose
// date heading goes to the day view), Agenda (days in a list, empty days
// skipped by default; `virtualScroll` appends days as the list scrolls) and
// Month Agenda (a month grid and the event list of the selected day).

import { useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { fromDays } from '@salmonui/core/internal/dates/index';
import { DAY_MS, weekdayOfDay } from '../internal/scheduler/time.js';
import type { Occurrence } from '../internal/scheduler/types.js';
import { useScheduler } from './context.js';
import type { GateProps } from './families.js';
import { EventPart } from './views.js';

export function View(props: GateProps) {
  return props.type === 'year' ? <YearView {...props} /> : props.type === 'monthAgenda' ? <MonthAgendaView {...props} /> : <AgendaView {...props} />;
}

/** Occurrences per day number (an event lands on every day it covers). */
function useByDay(occs: readonly Occurrence<unknown>[]): Map<number, Occurrence<unknown>[]> {
  const { zone } = useScheduler();
  return useMemo(() => {
    const map = new Map<number, Occurrence<unknown>[]>();
    for (const o of occs) for (let d = zone.day(o.start); d <= zone.day(Math.max(o.start, o.end - 1)); d++) (map.get(d) ?? map.set(d, []).get(d))?.push(o);
    return map;
  }, [occs, zone]);
}

/** Days grouped by month. */
const byMonth = (days: readonly number[]): number[][] => {
  const out: number[][] = [];
  for (const d of days) {
    const last = out[out.length - 1];
    if (last && fromDays(last[0] as number).month === fromDays(d).month) last.push(d);
    else out.push([d]);
  }
  return out;
};

/** One month grid (Year, Month Agenda): weekday headers and day cells marked with `data-has-events`. */
function MiniMonth(props: { readonly days: readonly number[]; readonly marked: ReadonlyMap<number, unknown>; readonly selected?: number; readonly onDay: (day: number, el: Element) => void }) {
  const { fmt, props: p, opts, today, view, locale } = useScheduler();
  const first = props.days[0] as number;
  const fd = opts.view.firstDayOfWeek;
  const lead = (weekdayOfDay(first) - fd + 7) % 7;
  const cells: (number | null)[] = [...Array<null>(lead).fill(null), ...props.days];
  while (cells.length % 7) cells.push(null);
  const weeks: (number | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  const title = new Intl.DateTimeFormat(locale, { month: 'long', ...(view === 'year' ? {} : { year: 'numeric' }), timeZone: 'UTC', ...(p.calendar ? { calendar: p.calendar } : {}) }).format(first * DAY_MS);
  return (
    <div role="grid" aria-label={title} className="salmon-scheduler__mini" data-month={fromDays(first).toString().slice(0, 7)}>
      <div className="salmon-scheduler__mini-title">{p.renderMonthHeader ? p.renderMonthHeader({ date: fromDays(first), text: title, view }) : title}</div>
      <div role="row">
        {Array.from({ length: 7 }, (_, i) => {
          const wd = (fd + i) % 7;
          // Day 3 (1970-01-04) is a Sunday.
          const text = fmt.weekday(3 + wd);
          return (
            <div role="columnheader" key={i} className="salmon-scheduler__weekday">
              {p.renderDayHeader ? p.renderDayHeader({ weekday: wd, day: null, text, view }) : text}
            </div>
          );
        })}
      </div>
      {weeks.map((w, r) => (
        <div role="row" key={r}>
          {w.map((d, c) =>
            d === null ? (
              <div role="gridcell" key={c} data-outside="" />
            ) : (
              <div role="gridcell" key={c} data-day={fromDays(d).toString()} data-has-events={props.marked.has(d) ? '' : undefined} data-today={today === d ? '' : undefined} data-selected={props.selected === d ? '' : undefined} aria-selected={props.selected === undefined ? undefined : props.selected === d}>
                <button type="button" className="salmon-scheduler__date-link" aria-label={fmt.fullDate(d)} aria-current={today === d ? 'date' : undefined} onClick={(e) => props.onDay(d, e.currentTarget)}>
                  {fmt.dayNumber(d)}
                </button>
              </div>
            ),
          )}
        </div>
      ))}
    </div>
  );
}

function YearView(props: GateProps) {
  const { actions, view } = useScheduler();
  const byDay = useByDay(props.occurrences);
  return (
    <div className="salmon-scheduler__year" data-view={view}>
      {byMonth(props.days).map((m) => (
        <MiniMonth key={m[0]} days={m} marked={byDay} onDay={(d, el) => actions.moreClick(d, el, 'pointer')} />
      ))}
    </div>
  );
}

/** The event list of some days (Agenda, Month Agenda). */
function DayList(props: { readonly days: readonly number[]; readonly byDay: ReadonlyMap<number, readonly Occurrence<unknown>[]> }) {
  const { fmt, actions, t, today } = useScheduler();
  return (
    <ol className="salmon-scheduler__more-list salmon-scheduler__agenda-list">
      {props.days.map((d) => {
        const list = props.byDay.get(d) ?? [];
        return (
          <li key={d} className="salmon-scheduler__agenda-day" data-day={fromDays(d).toString()} data-today={today === d ? '' : undefined}>
            <button type="button" className="salmon-scheduler__date-link" aria-current={today === d ? 'date' : undefined} onClick={(e) => actions.goToDay(d, e.detail === 0 ? 'keyboard' : 'pointer')}>
              <span className="salmon-scheduler__date-weekday">{fmt.weekday(d)}</span>
              <span className="salmon-scheduler__date-number">{fmt.monthDay(d)}</span>
            </button>
            <ul className="salmon-scheduler__more-list salmon-scheduler__agenda-events">
              {list.length ? (
                list.map((o) => (
                  <li key={o.key}>
                    <EventPart occurrence={o} className="salmon-scheduler__event--list" style={{}} continuesBefore={false} continuesAfter={false} tab />
                  </li>
                ))
              ) : (
                <li className="salmon-scheduler__agenda-empty">{t('noEvents')}</li>
              )}
            </ul>
          </li>
        );
      })}
    </ol>
  );
}

function AgendaView(props: GateProps) {
  const { zone, opts, props: p, view, id, t } = useScheduler();
  const vs = opts.entry.virtualScroll ?? p.virtualScroll;
  const count = opts.view.agendaDayCount * opts.view.interval;
  // Virtual scrolling: batches of `count` days appended as the end of the list nears; a new anchor starts over.
  const [loaded, setLoaded] = useState({ anchor: props.anchor, batches: 1 });
  const batches = loaded.anchor === props.anchor ? loaded.batches : 1;
  const span = count * batches;
  const occs = useMemo(() => (batches === 1 ? props.occurrences : props.occurrencesIn(zone.dayStart(props.anchor), zone.dayStart(props.anchor + span))), [batches, props.occurrences, props.anchor, span, zone]); // eslint-disable-line react-hooks/exhaustive-deps
  const byDay = useByDay(occs);
  const hide = opts.entry.hideEmptyAgendaDays ?? p.hideEmptyAgendaDays ?? true;
  const days = Array.from({ length: span }, (_, i) => props.anchor + i).filter((d) => !hide || byDay.has(d));
  const ref = useRef<HTMLDivElement | null>(null);
  const more = (): void => {
    const el = ref.current;
    if (vs && el && el.scrollTop + el.clientHeight >= el.scrollHeight - 48 && batches < 120) setLoaded({ anchor: props.anchor, batches: batches + 1 });
  };
  // Fill the viewport (a few batches at most) before the first scroll.
  useLayoutEffect(() => {
    if (batches < 6) more();
  });
  let body: ReactNode = <DayList days={days} byDay={byDay} />;
  if (!days.length) body = <p className="salmon-scheduler__agenda-empty">{t('noEvents')}</p>;
  return (
    <div ref={ref} role="group" aria-labelledby={id('range')} className="salmon-scheduler__agenda" data-view={view} data-days={span} tabIndex={0} onScroll={vs ? more : undefined}>
      {body}
    </div>
  );
}

function MonthAgendaView(props: GateProps) {
  const { view } = useScheduler();
  const byDay = useByDay(props.occurrences);
  const [picked, setPicked] = useState({ anchor: props.anchor, day: props.anchor });
  const day = picked.anchor === props.anchor ? picked.day : props.anchor;
  const month = fromDays(props.anchor).month;
  const days = (props.weeks ?? []).flat().filter((d) => fromDays(d).month === month);
  return (
    <div className="salmon-scheduler__agenda" data-view={view}>
      <MiniMonth days={days} marked={byDay} selected={day} onDay={(d) => setPicked({ anchor: props.anchor, day: d })} />
      <DayList days={[day]} byDay={byDay} />
    </div>
  );
}
