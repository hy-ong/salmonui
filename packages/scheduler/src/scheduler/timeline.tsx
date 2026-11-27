'use client';

// Timeline views chunk: Timeline Day / Week / WorkWeek /
// Month / Year on the `internal/timeline` axis. One scroll container holds
// the sticky header tiers and the sticky resource column; each row is a CSS
// grid of fixed-width unit columns. Event parts render inside the cell where
// they start and are placed by their start fraction, length and lane (CSS
// custom properties). Resource rows are virtualized with `virtualScroll`:
// the rendered window lives in the store and changes only when it crosses a
// row, never per scroll pixel.

import { memo, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { fromDays, localeWeekRule, weekNumber } from '@salmonui/core/internal/dates/index';
import { bucketByNode, visibleNodes, type GroupNode } from '../internal/scheduler/resources.js';
import { DAY_MS, MINUTE_MS, weekdayOfDay } from '../internal/scheduler/time.js';
import { layoutTimelineRow, type TimelineRow } from '../internal/scheduler/timeline.js';
import type { Occurrence } from '../internal/scheduler/types.js';
import { dayColumns, slotColumns, tiersOf, type AxisColumn, type TimeUnit } from '@salmonui/core/internal/timeline/axis';
import { offsetWindow, prefixOffsets } from '../internal/timeline/virtual.js';
import { useScheduler, useSchedulerSelector } from './context.js';
import type { GateProps } from './families.js';
import { ResourceLabel, setExpanded } from './grouping.js';
import { eventOrderOf } from './model.js';
import type { SchedulerHeaderRow, SchedulerVirtualScroll } from './types.js';
import { Cell, cx, EventPart, groupBy, Icon } from './views.js';

const DEFAULT_RANGE = { start: 0, end: 20 };

/** Lane height in px from `--salmon-scheduler-lane-height` (rem or px), plus the 2 px lane gap. */
function laneHeightOf(el: Element): number {
  const v = getComputedStyle(el).getPropertyValue('--salmon-scheduler-lane-height').trim();
  const n = parseFloat(v);
  if (!Number.isFinite(n)) return 26;
  return (v.endsWith('rem') ? n * parseFloat(getComputedStyle(document.documentElement).fontSize || '16') : n) + 2;
}

export function View(props: GateProps) {
  const { opts, group } = useScheduler();
  if (props.type === 'timelineYear' && !group?.grouped) return opts.entry.orientation === 'vertical' ? <YearVertical {...props} /> : <Timeline {...props} months />;
  return <Timeline {...props} months={false} />;
}

/** Header cell text of a unit. */
function useUnitText() {
  const { props: p, fmt, t, opts, locale } = useScheduler();
  const fd = opts.view.firstDayOfWeek;
  return useMemo(() => {
    const make = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(locale, { timeZone: 'UTC', ...(p.calendar ? { calendar: p.calendar } : {}), ...o });
    const year = make({ year: 'numeric' });
    const month = make({ month: 'long', year: 'numeric' });
    return (unit: TimeUnit, wall: number, slots: boolean): string => {
      const day = Math.floor(wall / DAY_MS);
      if (unit === 'year') return year.format(wall);
      if (unit === 'month') return month.format(wall);
      if (unit === 'week') return t('weekNumber', { week: weekNumber(day, fd, p.weekRule ?? localeWeekRule(locale)) });
      if (unit === 'hour') return fmt.slot(wall);
      return slots ? `${fmt.weekday(day)} ${fmt.monthDay(day)}` : `${fmt.weekday(day)} ${fmt.dayNumber(day)}`;
    };
  }, [locale, p.calendar, p.weekRule, fd, fmt, t]);
}

/** Timeline Day / Week / WorkWeek / Month (and Timeline Year by resource): rows of resources over the time axis. */
function Timeline(props: GateProps & { readonly months: boolean }) {
  const ctx = useScheduler();
  const { opts, zone, store, props: p, group, id, view } = ctx;
  const unitText = useUnitText();
  const slots = props.type === 'timelineDay' || props.type === 'timelineWeek' || props.type === 'timelineWorkWeek';
  const minor = opts.slotMinutes / opts.slotCount;
  // Timeline Year by month: one row per month of the page, columns are the days 1-31.
  const monthRows = useMemo(() => {
    if (!props.months) return null;
    const out: number[][] = [];
    for (const d of props.days) {
      const last = out[out.length - 1];
      if (last && fromDays(last[0] as number).month === fromDays(d).month) last.push(d);
      else out.push([d]);
    }
    return out;
  }, [props.months, props.days]);
  const columns: AxisColumn[] = useMemo(
    () => (monthRows ? dayColumns(Array.from({ length: 31 }, (_, i) => i)) : slots ? slotColumns(props.days, opts.startMinute, opts.endMinute, minor) : dayColumns(props.days)),
    [monthRows, slots, props.days, opts.startMinute, opts.endMinute, minor],
  );
  const headerRows: readonly SchedulerHeaderRow[] = opts.entry.headerRows ?? p.headerRows ?? (monthRows ? [] : (slots ? ['date', 'hour'] : props.type === 'timelineYear' ? ['month', 'date'] : ['date']).map((unit) => ({ unit: unit as TimeUnit })));
  const tiers = useMemo(() => tiersOf(columns, headerRows.map((h) => h.unit), opts.view.firstDayOfWeek), [columns, headerRows.map((h) => h.unit).join(), opts.view.firstDayOfWeek]); // eslint-disable-line react-hooks/exhaustive-deps
  // Rows: the visible resource tree (grouped), the months (Timeline Year), or one row.
  const nodes: readonly (GroupNode | null)[] = useMemo(() => (group?.grouped ? visibleNodes(group) : monthRows ? monthRows.map(() => null) : [null]), [group, monthRows]);
  const depth = group?.grouped ? (group.leaves[0]?.level ?? 0) : -1;
  const isLeaf = (n: GroupNode | null): boolean => !n || n.level === depth;
  const autoHeight = !!p.autoRowHeight || (!group?.grouped && !monthRows);
  const maxLanes = autoHeight ? null : ((opts.entry.eventLayout ?? p.eventLayout)?.maxHeight ?? 2);
  const order = eventOrderOf(p);
  const layouts: (TimelineRow<unknown> | null)[] = useMemo(() => {
    if (monthRows) return monthRows.map((days) => layoutTimelineRow(props.occurrences, dayColumns(days), zone, maxLanes, order));
    const leaves = nodes.filter((n): n is GroupNode => !!n && isLeaf(n));
    const buckets = group?.grouped ? bucketByNode(props.occurrences, leaves) : [props.occurrences];
    let k = 0;
    return nodes.map((n) => (isLeaf(n) ? layoutTimelineRow(buckets[k++] ?? [], columns, zone, maxLanes, order) : null));
  }, [props.occurrences, nodes, columns, zone, maxLanes, monthRows]); // eslint-disable-line react-hooks/exhaustive-deps
  const [lane, setLane] = useState(26);
  const heights = useMemo(() => layouts.map((l) => (l ? 24 + Math.max(maxLanes ?? 1, l.lanes) * lane : lane + 8)), [layouts, lane, maxLanes]);
  const offsets = useMemo(() => prefixOffsets(heights), [heights]);
  const vs = opts.entry.virtualScroll ?? p.virtualScroll;
  const vso: SchedulerVirtualScroll = typeof vs === 'object' ? vs : {};
  const rendered = useSchedulerSelector(store, (s) => s.rendered);
  const n = nodes.length;
  const init = vso.initialRange ?? DEFAULT_RANGE;
  const win = vs ? (rendered && rendered.end <= n ? rendered : { start: Math.min(init.start, n), end: Math.min(init.end, n) }) : { start: 0, end: n };
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const headRef = useRef<HTMLDivElement | null>(null);
  const update = (): void => {
    const el = scrollRef.current;
    let start = 0;
    let end = n;
    if (vs && el) {
      const head = headRef.current?.offsetHeight ?? 0;
      ({ start, end } = offsetWindow(offsets, el.scrollTop - head, el.clientHeight - head, vso.overscan ?? 4));
    }
    const cur = store.getSnapshot().rendered;
    const ids = nodes
      .slice(start, end)
      .filter((x): x is GroupNode => !!x && isLeaf(x))
      .map((x) => x.info.id);
    const key = ids.map(String).join(',');
    if (!cur || cur.start !== start || cur.end !== end || cur.key !== key) store.set({ rendered: { start, end, ids, key } });
  };
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (el) setLane(laneHeightOf(el));
  }, []);
  useLayoutEffect(update);
  useLayoutEffect(() => {
    ctx.handle.current = {
      scrollToResource: (key) => {
        const i = nodes.findIndex((x) => x?.key === key);
        const el = scrollRef.current;
        if (i >= 0 && el) el.scrollTop = offsets[i] as number;
      },
    };
  });
  const style = { '--salmon-scheduler-columns': monthRows ? 31 : columns.length } as CSSProperties;
  const rows: ReactNode[] = [];
  for (let i = win.start; i < win.end; i++) {
    const node = nodes[i] ?? null;
    rows.push(
      <TimelineRowView
        key={node?.key ?? `m${i}`}
        index={i + tiers.length + 1}
        node={node}
        leaf={isLeaf(node)}
        layout={layouts[i] ?? null}
        height={heights[i] as number}
        columns={monthRows ? dayColumns(monthRows[i] as number[]) : columns}
        slots={slots}
        span={monthRows ? 31 : columns.length}
        month={monthRows ? (monthRows[i]?.[0] ?? null) : null}
      />,
    );
  }
  return (
    <div className="salmon-scheduler__tl" tabIndex={0} data-scroll-area="" style={style} data-view={view} data-orientation={monthRows ? 'horizontal' : undefined} ref={scrollRef} onScroll={vs ? update : undefined}>
      <div role="grid" aria-labelledby={id('range')} aria-rowcount={n + tiers.length} aria-readonly={opts.readOnly || undefined} className="salmon-scheduler__grid">
        <div role="rowgroup" className="salmon-scheduler__tl-head" ref={headRef}>
          {monthRows ? (
            <div role="row" className="salmon-scheduler__tl-row">
              <div role="none" className="salmon-scheduler__tl-corner" />
              {Array.from({ length: 31 }, (_, i) => (
                <div role="columnheader" key={i} className="salmon-scheduler__tl-label">
                  {p.renderDayHeader ? p.renderDayHeader({ weekday: null, day: i + 1, text: String(i + 1), view }) : i + 1}
                </div>
              ))}
            </div>
          ) : (
            tiers.map((tier, ti) => {
              const render = headerRows[ti]?.render;
              return (
                <div role="row" key={tier.unit} className="salmon-scheduler__tl-row" data-unit={tier.unit}>
                  <div role="none" className="salmon-scheduler__tl-corner">
                    {ti === tiers.length - 1 && p.renderHeaderIndent ? p.renderHeaderIndent() : null}
                  </div>
                  {tier.cells.map((c) => {
                    const text = unitText(tier.unit, c.start, slots);
                    return (
                      <div role="columnheader" key={c.first} className="salmon-scheduler__tl-label" data-unit={tier.unit} style={{ gridColumn: `span ${c.span}` }}>
                        {render ? render({ unit: tier.unit, start: new Date(zone.instant(c.start)), date: fromDays(Math.floor(c.start / DAY_MS)), text, view }) : text}
                      </div>
                    );
                  })}
                </div>
              );
            })
          )}
        </div>
        <div role="rowgroup" className="salmon-scheduler__tl-body">
          {win.start > 0 ? <div role="none" style={{ blockSize: offsets[win.start] }} /> : null}
          {rows}
          {win.end < n ? <div role="none" style={{ blockSize: (offsets[n] as number) - (offsets[win.end] as number) }} /> : null}
        </div>
      </div>
    </div>
  );
}

const TimelineRowView = memo(function TimelineRowView(props: {
  readonly index: number;
  readonly node: GroupNode | null;
  readonly leaf: boolean;
  readonly layout: TimelineRow<unknown> | null;
  readonly height: number;
  readonly columns: readonly AxisColumn[];
  readonly slots: boolean;
  readonly span: number;
  /** Timeline Year by month: the first day of the row's month. */
  readonly month: number | null;
}) {
  const c = useScheduler();
  const { zone, fmt, actions, props: p, opts, t } = c;
  const { node, layout } = props;
  const g = props.leaf ? node : null;
  const parts = groupBy(
    (layout?.parts ?? []).filter((x) => !x.hidden),
    (x) => String(x.column),
  );
  const work = g?.work;
  const workDays = work?.days ?? opts.view.workDays;
  const header = node ? (
    <>
      {node.children.length ? (
        <button type="button" className="salmon-scheduler__all-day-toggle" aria-expanded={node.expanded} aria-label={node.info.text} onClick={() => setExpanded({ store: c.store, props: p, handle: c.handle }, node.info.id, !node.expanded)}>
          <Icon name={node.expanded ? 'collapse' : 'expand'} />
        </button>
      ) : null}
      <ResourceLabel node={node} />
    </>
  ) : props.month !== null ? (
    <MonthName day={props.month} />
  ) : null;
  return (
    <div role="row" className={cx('salmon-scheduler__tl-row', node?.info.className)} aria-rowindex={props.index} style={{ blockSize: props.height }} data-resource={node?.key} data-level={node?.level} data-parent={node && !props.leaf ? '' : undefined}>
      <div role={header ? 'rowheader' : 'none'} className="salmon-scheduler__tl-resource" style={node ? { paddingInlineStart: `${0.5 + node.level}rem` } : undefined}>
        {header}
      </div>
      {!props.leaf ? (
        <div role="gridcell" className="salmon-scheduler__tl-cell" style={{ gridColumn: `span ${props.span}` }} />
      ) : (
        Array.from({ length: props.span }, (_, i) => {
          const col = props.columns[i];
          if (!col) return <div role="gridcell" key={i} className="salmon-scheduler__tl-cell" data-outside="" aria-disabled="true" />;
          const d = Math.floor(col.start / DAY_MS);
          const m = (col.start - d * DAY_MS) / MINUTE_MS;
          const wd = workDays.includes(weekdayOfDay(d));
          const isWork = props.slots ? wd && m >= (work?.start ?? opts.workStart) && m < (work?.end ?? opts.workEnd) && p.workHours?.highlight !== false : wd;
          const more = layout?.more?.[i] ?? 0;
          return (
            <Cell
              key={i}
              part={props.slots ? 'workCell' : 'monthCell'}
              day={d}
              start={props.slots ? zone.instant(col.start) : zone.dayStart(d)}
              end={props.slots ? zone.instant(col.end) : zone.dayStart(d + 1)}
              allDay={!props.slots}
              work={isWork}
              res={g}
              className="salmon-scheduler__tl-cell"
              label={`${fmt.fullDate(d)}${props.slots ? `, ${fmt.time(col.start)}` : ''}${g ? `, ${g.info.text}` : ''}`}
            >
              {(parts.get(String(i)) ?? []).map((part) => (
                <EventPart
                  key={part.occurrence.key}
                  occurrence={part.occurrence}
                  g={g}
                  className="salmon-scheduler__event--span"
                  style={{ '--salmon-scheduler-lane': part.lane, '--salmon-scheduler-span': part.span, '--salmon-scheduler-offset': part.offset } as CSSProperties}
                  continuesBefore={part.continuesBefore}
                  continuesAfter={part.continuesAfter}
                />
              ))}
              {more > 0 && p.eventLayout?.moreIndicator !== false ? (
                <button type="button" tabIndex={-1} className="salmon-scheduler__more" onClick={(e) => actions.moreClick(d, e.currentTarget, e.detail === 0 ? 'keyboard' : 'pointer')}>
                  {t('more', { count: more })}
                </button>
              ) : null}
            </Cell>
          );
        })
      )}
    </div>
  );
});

/** A month row or column heading of Timeline Year (`renderMonthHeader`). */
function MonthName(props: { readonly day: number }) {
  const { props: p, view, locale } = useScheduler();
  const text = new Intl.DateTimeFormat(locale, { month: 'long', timeZone: 'UTC', ...(p.calendar ? { calendar: p.calendar } : {}) }).format(props.day * DAY_MS);
  return <>{p.renderMonthHeader ? p.renderMonthHeader({ date: fromDays(props.day), text, view }) : text}</>;
}

/** Timeline Year, vertical: months as columns, the days 1-31 as rows; each cell lists the events of its day. */
function YearVertical(props: GateProps) {
  const { zone, fmt, actions, props: p, opts, t, id, view } = useScheduler();
  const months = useMemo(() => {
    const out: number[][] = [];
    for (const d of props.days) {
      const last = out[out.length - 1];
      if (last && fromDays(last[0] as number).month === fromDays(d).month) last.push(d);
      else out.push([d]);
    }
    return out;
  }, [props.days]);
  const byDay = useMemo(() => {
    const map = new Map<number, Occurrence<unknown>[]>();
    for (const o of props.occurrences) for (let d = zone.day(o.start); d <= zone.day(Math.max(o.start, o.end - 1)); d++) (map.get(d) ?? map.set(d, []).get(d))?.push(o);
    return map;
  }, [props.occurrences, zone]);
  const maxLanes = p.autoRowHeight ? Infinity : ((opts.entry.eventLayout ?? p.eventLayout)?.maxHeight ?? 2);
  return (
    <div className="salmon-scheduler__tl" tabIndex={0} data-scroll-area="" data-view={view} data-orientation="vertical" style={{ '--salmon-scheduler-columns': months.length, '--salmon-scheduler-resource-width': '3rem', '--salmon-scheduler-unit-width': 'minmax(8rem, 1fr)' } as CSSProperties}>
      <div role="grid" aria-labelledby={id('range')} className="salmon-scheduler__grid">
        <div role="rowgroup" className="salmon-scheduler__tl-head">
          <div role="row" className="salmon-scheduler__tl-row">
            <div role="none" className="salmon-scheduler__tl-corner" />
            {months.map((m) => (
              <div role="columnheader" key={m[0]} className="salmon-scheduler__tl-label">
                <MonthName day={m[0] as number} />
              </div>
            ))}
          </div>
        </div>
        <div role="rowgroup" className="salmon-scheduler__tl-body">
          {Array.from({ length: 31 }, (_, r) => (
            <div role="row" key={r} className="salmon-scheduler__tl-row">
              <div role="rowheader" className="salmon-scheduler__tl-resource">
                {p.renderDayHeader ? p.renderDayHeader({ weekday: null, day: r + 1, text: String(r + 1), view }) : r + 1}
              </div>
              {months.map((m) => {
                const d = m[r];
                if (d === undefined) return <div role="gridcell" key={m[0]} className="salmon-scheduler__tl-cell" data-outside="" aria-disabled="true" />;
                const list = byDay.get(d) ?? [];
                const shown = list.slice(0, maxLanes);
                return (
                  <Cell key={d} part="monthCell" day={d} start={zone.dayStart(d)} end={zone.dayStart(d + 1)} allDay work={opts.view.workDays.includes(weekdayOfDay(d))} className="salmon-scheduler__tl-cell" label={fmt.fullDate(d)}>
                    {shown.map((o) => (
                      <EventPart key={o.key} occurrence={o} className="salmon-scheduler__event--list" style={{}} continuesBefore={zone.day(o.start) < d} continuesAfter={zone.day(Math.max(o.start, o.end - 1)) > d} />
                    ))}
                    {list.length > shown.length && p.eventLayout?.moreIndicator !== false ? (
                      <button type="button" tabIndex={-1} className="salmon-scheduler__more" onClick={(e) => actions.moreClick(d, e.currentTarget, e.detail === 0 ? 'keyboard' : 'pointer')}>
                        {t('more', { count: list.length - shown.length })}
                      </button>
                    ) : null}
                  </Cell>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
