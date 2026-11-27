'use client';

// Resources and grouping chunk: loaded whenever `resources` is set. It builds the
// resource model, provides it to the view below (event colors, grouped
// columns and rows), renders grouped Day / Week / WorkWeek / Month views with
// resource header rows, and implements the resource methods of the API.

import { useId, useLayoutEffect, useMemo, useRef, type ReactNode } from 'react';
import { buildGroupModel, expandedIdsOf, groupColumns, layoutGroupedDays, layoutGroupedMonth, monthCells, resourceItems, visibleNodes, type GroupColumn, type GroupModel, type GroupNode, type ResourceInput, type ResourceItemInfo } from '../internal/scheduler/resources.js';
import { SchedulerContext, useScheduler, useSchedulerSelector, type SchedulerContextValue } from './context.js';
import type { ApiContext, GateProps, ViewModule } from './families.js';
import { dayLayoutOptions, eventOrderOf, monthLanes } from './model.js';
import type { SchedulerProps, SchedulerRenderedRange, SchedulerResourceHeaderContext } from './types.js';
import { cx, DateHeader, DayView, MonthView } from './views.js';

const same = (a: unknown, b: unknown): boolean => a === b || String(a) === String(b);

/** The resource model of the current props and expanded state. */
function modelOf(props: SchedulerProps<unknown>, expanded: readonly unknown[] | null, ctx?: SchedulerContextValue): GroupModel {
  const o = ctx?.opts;
  return buildGroupModel((props.resources ?? []) as readonly ResourceInput[], props.grouping, expanded, { days: o?.view.workDays ?? [1, 2, 3, 4, 5], start: o?.workStart ?? 540, end: o?.workEnd ?? 1080 });
}

/** A resource header's text (or `renderResourceHeader`) with its tooltip. */
export function ResourceLabel(props: { readonly node: GroupNode }) {
  const { props: p, view } = useScheduler();
  const tid = useId();
  const n = props.node;
  const ctx: SchedulerResourceHeaderContext = { resource: n.info, level: n.level, expanded: n.expanded, hasChildren: n.children.length > 0, view };
  const tip = p.renderResourceTooltip?.(ctx);
  return (
    <span className="salmon-scheduler__resource-text" tabIndex={tip ? 0 : undefined} aria-describedby={tip ? tid : undefined}>
      {p.renderResourceHeader ? p.renderResourceHeader(ctx) : n.info.text}
      {tip ? (
        <span role="tooltip" id={tid} className="salmon-scheduler__tooltip">
          {tip}
        </span>
      ) : null}
    </span>
  );
}

/** Header rows of grouped vertical views: one row per resource level and the date (or weekday) row; `byDate` puts dates first. */
function GroupHead(props: { readonly cols: readonly GroupColumn[]; readonly model: GroupModel; readonly month: boolean }) {
  const { fmt, props: p } = useScheduler();
  const { cols, model } = props;
  const depth = (model.leaves[0]?.level ?? 0) + 1;
  const at = (g: GroupNode | null, level: number): GroupNode | null => {
    let n = g;
    while (n && n.level > level) n = n.parent;
    return n;
  };
  /** Runs of consecutive columns with the same key. */
  const runs = (key: (c: GroupColumn) => string): { first: number; span: number }[] => {
    const out: { first: number; span: number; k: string }[] = [];
    cols.forEach((c, i) => {
      const k = key(c);
      const last = out[out.length - 1];
      if (last && last.k === k) last.span++;
      else out.push({ first: i, span: 1, k });
    });
    return out;
  };
  const rowClass = props.month ? 'salmon-scheduler__weekday-row' : 'salmon-scheduler__date-header-row';
  const lead = props.month ? (p.showWeekNumbers ? <div role="none" className="salmon-scheduler__week-number-header" /> : null) : <div role="none" className="salmon-scheduler__header-indent">{p.renderHeaderIndent ? p.renderHeaderIndent() : null}</div>;
  const levels = Array.from({ length: depth }, (_, level) => (
    <div role="row" key={`r${level}`} className={rowClass}>
      {lead}
      {runs((c) => `${model.byDate ? `${c.d}|` : ''}${at(c.g, level)?.key ?? ''}`).map((r) => {
        const node = at((cols[r.first] as GroupColumn).g, level) as GroupNode;
        return (
          <div role="columnheader" key={r.first} className={cx(props.month ? 'salmon-scheduler__weekday' : 'salmon-scheduler__date-header', 'salmon-scheduler__resource-header', node.info.className)} style={{ gridColumn: `span ${r.span}` }} data-resource={node.key}>
            <ResourceLabel node={node} />
          </div>
        );
      })}
    </div>
  ));
  const dateRuns = model.byDate ? runs((c) => String(c.d)) : cols.map((_, i) => ({ first: i, span: 1 }));
  const dates = (
    <div role="row" key="d" className={rowClass}>
      {lead}
      {dateRuns.map((r) => {
        const d = (cols[r.first] as GroupColumn).d;
        return props.month ? (
          <div role="columnheader" key={r.first} className="salmon-scheduler__weekday" style={{ gridColumn: `span ${r.span}` }}>
            {fmt.weekday(d)}
          </div>
        ) : (
          <DateHeader key={r.first} day={d} span={r.span} />
        );
      })}
    </div>
  );
  return <>{model.byDate ? [dates, ...levels] : [...levels, dates]}</>;
}

function GroupedVertical(props: GateProps & { readonly model: GroupModel }) {
  const ctx = useScheduler();
  const { model } = props;
  const ref = useRef<HTMLDivElement | null>(null);
  const month = props.type === 'month' && props.weeks;
  const cols = useMemo(() => (month ? monthCells(props.weeks?.[0] ?? [], model) : groupColumns(props.days, model)), [month, props.weeks, props.days, model]);
  const layout = useMemo(
    () => (month ? layoutGroupedMonth(props.occurrences, props.weeks ?? [], model, ctx.zone, monthLanes(ctx.opts, ctx.props), eventOrderOf(ctx.props)) : layoutGroupedDays(props.occurrences, cols, model, dayLayoutOptions(ctx.opts, ctx.zone, ctx.props, props.allDayExpanded))),
    [props.occurrences, props.weeks, cols, model, ctx.zone, props.allDayExpanded], // eslint-disable-line react-hooks/exhaustive-deps
  );
  useLayoutEffect(() => {
    ctx.handle.current = {
      scrollToResource: (key) => ref.current?.querySelector(`[data-resource="${CSS.escape(key)}"]`)?.scrollIntoView({ block: 'nearest', inline: 'start' }),
    };
  });
  const head = <GroupHead cols={cols} model={model} month={!!month} />;
  return (
    <div ref={ref} style={{ display: 'contents' }}>
      {month ? <MonthView weeks={props.weeks ?? []} layout={layout as never} anchor={props.anchor} cells={(w) => monthCells(w, model)} head={head} /> : <DayView days={props.days} layout={layout as never} cols={cols} head={head} />}
    </div>
  );
}

export function Grouped(props: GateProps & { readonly View: ViewModule['View'] | null }) {
  const ctx = useScheduler();
  const expanded = useSchedulerSelector(ctx.store, (s) => s.expandedResources);
  const p = ctx.props;
  const full = useMemo(() => modelOf(p, expanded, ctx), [p.resources, p.grouping, expanded, ctx.opts.workStart, ctx.opts.workEnd, ctx.opts.view.workDays.join()]); // eslint-disable-line react-hooks/exhaustive-deps
  // Adaptive layout: one leaf resource at a time, picked in a select (a native sheet on touch devices).
  const rid = useSchedulerSelector(ctx.store, (s) => s.resourceId);
  const pick = ctx.adaptive && full.grouped ? (full.leaves.find((l) => rid !== undefined && String(l.info.id) === String(rid)) ?? full.leaves[0]) : undefined;
  const model = useMemo(
    () =>
      pick
        ? modelOf(
            {
              ...p,
              resources: p.resources?.map((d) => {
                const ids = p.grouping?.resources.includes(d.name) ? pick.path[d.field] : undefined;
                return ids ? { ...d, data: d.data.filter((x) => ids.some((i) => String(i) === String((x as Record<string, unknown>)[d.idField ?? 'id']))) } : d;
              }),
            },
            expanded,
            ctx,
          )
        : full,
    [full, pick], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const value: SchedulerContextValue = { ...ctx, group: model };
  const picker = pick ? (
    <div className="salmon-scheduler__resource-picker">
      <select
        className="salmon-scheduler__select"
        aria-label={ctx.t('resource')}
        value={pick.key}
        onChange={(e) => {
          const leaf = full.byKey.get(e.currentTarget.value);
          if (!leaf) return;
          ctx.store.set({ resourceId: leaf.info.id });
          p.onSelectedResourceChange?.(leaf.info.id, { type: 'selectedResourceChange', source: 'pointer' });
        }}
      >
        {full.leaves.map((l) => {
          const names: string[] = [];
          for (let n: GroupNode | null = l; n; n = n.parent) names.unshift(n.info.text);
          return (
            <option key={l.key} value={l.key}>
              {names.join(' / ')}
            </option>
          );
        })}
      </select>
    </div>
  ) : null;
  const { View } = props;
  let body: ReactNode = null;
  if (View) body = <View {...props} />;
  else if (model.grouped) body = <GroupedVertical {...props} model={model} />;
  else if (props.layout?.month && props.weeks && props.type === 'month') body = <MonthView weeks={props.weeks} layout={props.layout.month} anchor={props.anchor} />;
  else if (props.layout?.day) body = <DayView days={props.days} layout={props.layout.day} />;
  return (
    <SchedulerContext.Provider value={value}>
      {picker}
      {body}
    </SchedulerContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// API
// ---------------------------------------------------------------------------

export const getResources = (c: ApiContext): ResourceItemInfo[] => resourceItems((c.props.resources ?? []) as readonly ResourceInput[]);

export const getResource = (c: ApiContext, id: unknown, resource?: string): ResourceItemInfo | null => getResources(c).find((i) => same(i.id, id) && (!resource || i.resource === resource)) ?? null;

/** Expands or collapses a parent resource; uncontrolled state changes, `onExpandedResourcesChange` reports. */
export function setExpanded(c: ApiContext, id: unknown, on: boolean): void {
  const cur = c.store.getSnapshot().expandedResources ?? expandedIdsOf(modelOf(c.props, null));
  const has = cur.some((x) => same(x, id));
  if (has === on) return;
  const next = on ? [...cur, id] : cur.filter((x) => !same(x, id));
  if (c.props.expandedResourceIds === undefined) c.store.set({ expandedResources: next });
  c.props.onExpandedResourcesChange?.(next);
}

export const expandResource = (c: ApiContext, id: unknown): void => setExpanded(c, id, true);
export const collapseResource = (c: ApiContext, id: unknown): void => setExpanded(c, id, false);

/** Expands the ancestors of the resource, then scrolls its row or column into view after the next render. */
export function scrollToResource(c: ApiContext, id: unknown): void {
  const m = modelOf(c.props, c.store.getSnapshot().expandedResources);
  const node = [...m.byKey.values()].find((n) => same(n.info.id, id));
  if (!node) return;
  for (let n = node.parent; n; n = n.parent) if (!n.expanded) setExpanded(c, n.info.id, true);
  requestAnimationFrame(() => c.handle.current.scrollToResource?.(node.key));
}

export function getRenderedRange(c: ApiContext): SchedulerRenderedRange | null {
  const r = c.store.getSnapshot().rendered;
  return r ? { start: r.start, end: r.end, resourceIds: r.ids } : null;
}

export { visibleNodes };
