// Resources and grouping: resource definitions resolved to items with text, color, parent
// and work hours; the group tree of `grouping.resources` (one level per
// resource, children filtered by their parent id unless `byParent: false`);
// the leaves an event belongs to (an event with several ids renders in each);
// the columns of grouped day, week and month views (resources then dates, or
// dates then resources with `byDate`); and the grouped layouts, which lay out
// each leaf's events with the ungrouped layout and map its columns into the
// combined column order. Pure: no React, no DOM globals.

import { layoutDays, layoutMonth, type DayLayout, type DayLayoutOptions, type EventOrder, type MonthLayout, type SpanPart, type TimedPart } from './layout.js';
import { minutesOf, weekdayOfDay, type ZoneConverter } from './time.js';
import type { EventRecord, Occurrence } from './types.js';

export interface ResourceInput {
  readonly field: string;
  readonly name: string;
  readonly label?: string | undefined;
  readonly data: readonly unknown[];
  readonly idField?: string | undefined;
  readonly textField?: string | undefined;
  readonly colorField?: string | undefined;
  readonly parentIdField?: string | undefined;
  readonly multiple?: boolean | undefined;
  readonly workDaysField?: string | undefined;
  readonly startHourField?: string | undefined;
  readonly endHourField?: string | undefined;
  readonly classNameField?: string | undefined;
  readonly expandedField?: string | undefined;
}

export interface GroupingInput {
  readonly resources: readonly string[];
  readonly byDate?: boolean | undefined;
  readonly byParent?: boolean | undefined;
  readonly sharedEvents?: boolean | undefined;
  readonly hideNonWorkingDays?: boolean | undefined;
}

/** One resource item (`api.getResources()`). */
export interface ResourceItemInfo {
  /** The resource definition's `name`. */
  readonly resource: string;
  readonly field: string;
  readonly id: unknown;
  readonly text: string;
  readonly color: string | undefined;
  readonly parentId: unknown;
  readonly className: string | undefined;
  readonly data: unknown;
}

export interface WorkTime {
  /** Weekdays, 0 Sunday. */
  readonly days: readonly number[];
  /** Minutes after midnight. */
  readonly start: number;
  readonly end: number;
}

export interface GroupNode {
  /** Path key: the ids from the root, joined by `/`. */
  readonly key: string;
  readonly level: number;
  readonly info: ResourceItemInfo;
  readonly parent: GroupNode | null;
  readonly children: GroupNode[];
  /** Resource ids per event field from the root to this node. */
  readonly path: Readonly<Record<string, readonly unknown[]>>;
  readonly expanded: boolean;
  readonly work: WorkTime;
}

export interface GroupModel {
  readonly items: readonly ResourceItemInfo[];
  /** Grouped levels (empty without `grouping`). */
  readonly roots: readonly GroupNode[];
  readonly leaves: readonly GroupNode[];
  readonly byKey: ReadonlyMap<string, GroupNode>;
  readonly grouped: boolean;
  readonly byDate: boolean;
  readonly shared: boolean;
  readonly hideNonWorkingDays: boolean;
  /** Color of an event: from the leaf it renders in (deepest colored level), else its first colored resource. */
  color(event: EventRecord<unknown>, leaf: GroupNode | null | undefined): string | undefined;
}

const get = (item: unknown, field: string): unknown => (item && typeof item === 'object' ? (item as Record<string, unknown>)[field] : undefined);
const same = (a: unknown, b: unknown): boolean => a === b || String(a) === String(b);

function infoOf(def: ResourceInput, item: unknown): ResourceItemInfo {
  const color = get(item, def.colorField ?? 'color');
  const cls = get(item, def.classNameField ?? 'className');
  return {
    resource: def.name,
    field: def.field,
    id: get(item, def.idField ?? 'id'),
    text: String(get(item, def.textField ?? 'text') ?? ''),
    color: typeof color === 'string' && color ? color : undefined,
    parentId: get(item, def.parentIdField ?? 'parentId'),
    className: typeof cls === 'string' && cls ? cls : undefined,
    data: item,
  };
}

/** Every item of every resource, in definition order (`api.getResources()`). */
export const resourceItems = (defs: readonly ResourceInput[]): ResourceItemInfo[] => defs.flatMap((d) => d.data.map((item) => infoOf(d, item)));

/** The id list of `ids` for an event field: arrays as they are, a single value as one id, none as empty. */
export const idsOf = (v: unknown): readonly unknown[] => (Array.isArray(v) ? v : v === undefined || v === null || v === '' ? [] : [v]);

export function buildGroupModel(defs: readonly ResourceInput[], grouping: GroupingInput | undefined, expandedIds: readonly unknown[] | null, defaults: WorkTime): GroupModel {
  const items = resourceItems(defs);
  const colorByItem = new Map<string, string>();
  for (const it of items) if (it.color) colorByItem.set(`${it.resource}\u0000${String(it.id)}`, it.color);
  const levels = (grouping?.resources ?? []).map((n) => defs.find((d) => d.name === n)).filter((d): d is ResourceInput => !!d);
  const byKey = new Map<string, GroupNode>();
  const leaves: GroupNode[] = [];
  const build = (level: number, parent: GroupNode | null): GroupNode[] => {
    const def = levels[level];
    if (!def) return [];
    const out: GroupNode[] = [];
    for (const item of def.data) {
      const info = infoOf(def, item);
      // children are filtered by their parent id unless `byParent: false`.
      if (parent && grouping?.byParent !== false && info.parentId !== undefined && info.parentId !== null && !same(info.parentId, parent.info.id)) continue;
      const pw = parent?.work ?? defaults;
      const wd = get(item, def.workDaysField ?? 'workDays');
      const sh = get(item, def.startHourField ?? 'startHour');
      const eh = get(item, def.endHourField ?? 'endHour');
      const exp = get(item, def.expandedField ?? 'expanded');
      const node: GroupNode = {
        key: parent ? `${parent.key}/${String(info.id)}` : String(info.id),
        level,
        info,
        parent,
        children: [],
        path: { ...parent?.path, [def.field]: [info.id] },
        expanded: expandedIds ? expandedIds.some((x) => same(x, info.id)) : exp !== false,
        work: {
          days: Array.isArray(wd) ? (wd as number[]) : pw.days,
          start: typeof sh === 'string' ? minutesOf(sh, pw.start) : pw.start,
          end: typeof eh === 'string' ? minutesOf(eh, pw.end) : pw.end,
        },
      };
      byKey.set(node.key, node);
      node.children.push(...build(level + 1, node));
      if (level === levels.length - 1) leaves.push(node);
      out.push(node);
    }
    return out;
  };
  const roots = build(0, null);
  const colorDefs = defs.filter((d) => d.data.some((item) => typeof get(item, d.colorField ?? 'color') === 'string'));
  return {
    items,
    roots,
    leaves,
    byKey,
    grouped: levels.length > 0,
    byDate: grouping?.byDate === true,
    shared: grouping?.sharedEvents === true,
    hideNonWorkingDays: grouping?.hideNonWorkingDays === true,
    color(event, leaf) {
      for (let n = leaf ?? null; n; n = n.parent) if (n.info.color) return n.info.color;
      for (const d of colorDefs) {
        for (const id of event.resources[d.field] ?? []) {
          const c = colorByItem.get(`${d.name}\u0000${String(id)}`);
          if (c) return c;
        }
      }
      return undefined;
    },
  };
}

/** Rows of a timeline view: the tree in order, without the descendants of collapsed nodes. */
export function visibleNodes(model: GroupModel): GroupNode[] {
  const out: GroupNode[] = [];
  const walk = (nodes: readonly GroupNode[]): void => {
    for (const n of nodes) {
      out.push(n);
      if (n.expanded) walk(n.children);
    }
  };
  walk(model.roots);
  return out;
}

/** The ids of every node that has children and is expanded (the default `expandedResourceIds`). */
export const expandedIdsOf = (model: GroupModel): unknown[] => [...model.byKey.values()].filter((n) => n.children.length && n.expanded).map((n) => n.info.id);

/** Does an event belong to `node` (every level of its path matches)? */
export function belongsTo(event: EventRecord<unknown>, node: GroupNode): boolean {
  for (const [field, ids] of Object.entries(node.path)) {
    const mine = event.resources[field];
    if (!mine?.some((x) => same(x, ids[0]))) return false;
  }
  return true;
}

/** Occurrences per node of `nodes` (an event with several ids lands in each matching node). */
export function bucketByNode<Row>(occs: readonly Occurrence<Row>[], nodes: readonly GroupNode[]): Occurrence<Row>[][] {
  const out: Occurrence<Row>[][] = nodes.map(() => []);
  const index = new Map<string, number[]>();
  nodes.forEach((n, i) => {
    const k = `${n.info.field}\u0000${String(n.info.id)}`;
    const list = index.get(k);
    if (list) list.push(i);
    else index.set(k, [i]);
  });
  const fields = [...new Set(nodes.map((n) => n.info.field))];
  for (const o of occs) {
    const seen = new Set<number>();
    for (const field of fields) {
      for (const id of o.event.resources[field] ?? []) {
        for (const i of index.get(`${field}\u0000${String(id)}`) ?? []) {
          if (seen.has(i) || !belongsTo(o.event as EventRecord<unknown>, nodes[i] as GroupNode)) continue;
          seen.add(i);
          (out[i] as Occurrence<Row>[]).push(o);
        }
      }
    }
  }
  return out;
}

/** One column of a grouped vertical view: a day and the leaf it belongs to. */
export interface GroupColumn {
  readonly d: number;
  readonly g: GroupNode | null;
}

const isWorkDay = (g: GroupNode, d: number): boolean => g.work.days.includes(weekdayOfDay(d));

/** Columns of a grouped day, week or work week view (`hideNonWorkingDays`). */
export function groupColumns(days: readonly number[], model: GroupModel): GroupColumn[] {
  const L = model.leaves;
  const keep = (g: GroupNode, d: number): boolean => !model.hideNonWorkingDays || isWorkDay(g, d);
  return model.byDate ? days.flatMap((d) => L.filter((g) => keep(g, d)).map((g) => ({ d, g }))) : L.flatMap((g) => days.filter((d) => keep(g, d)).map((d) => ({ d, g })));
}

/** Cells of one week row of a grouped month view. */
export const monthCells = (week: readonly number[], model: GroupModel): GroupColumn[] => (model.byDate ? week.flatMap((d) => model.leaves.map((g) => ({ d, g }))) : model.leaves.flatMap((g) => week.map((d) => ({ d, g }))));

/** Splits a span over leaf-local columns into parts over runs of consecutive global columns. */
function mapSpan<Row>(p: SpanPart<Row>, idx: readonly number[], out: SpanPart<Row>[]): void {
  let k = p.startColumn;
  while (k < p.endColumn) {
    let j = k + 1;
    while (j < p.endColumn && idx[j] === (idx[j - 1] as number) + 1) j++;
    out.push({ ...p, startColumn: idx[k] as number, endColumn: (idx[j - 1] as number) + 1, continuesBefore: p.continuesBefore || k > p.startColumn, continuesAfter: p.continuesAfter || j < p.endColumn });
    k = j;
  }
}

/** Grouped day, week and work week layout over `cols`. */
export function layoutGroupedDays<Row>(occs: readonly Occurrence<Row>[], cols: readonly GroupColumn[], model: GroupModel, options: Omit<DayLayoutOptions<Row>, 'days'>): DayLayout<Row> {
  const buckets = bucketByNode(occs, model.leaves);
  const timed: TimedPart<Row>[][] = cols.map(() => []);
  const allDay: SpanPart<Row>[] = [];
  const allDayMore = cols.map(() => 0);
  let lanes = 0;
  model.leaves.forEach((g, li) => {
    const idx: number[] = [];
    cols.forEach((c, i) => c.g === g && idx.push(i));
    if (!idx.length) return;
    const lay = layoutDays(buckets[li] as Occurrence<Row>[], { ...options, days: idx.map((i) => (cols[i] as GroupColumn).d) });
    lay.timed.forEach((parts, k) => (timed[idx[k] as number] = parts.map((p) => ({ ...p, column: idx[k] as number }))));
    lay.allDayMore.forEach((n, k) => (allDayMore[idx[k] as number] = n));
    lanes = Math.max(lanes, lay.allDayLanes);
    for (const p of lay.allDay) mapSpan(p, idx, allDay);
  });
  return { timed, allDay, allDayLanes: lanes, allDayMore };
}

/** Grouped month layout: each week row's parts over `monthCells(week)`. */
export function layoutGroupedMonth<Row>(occs: readonly Occurrence<Row>[], weeks: readonly (readonly number[])[], model: GroupModel, zone: ZoneConverter, maxLanes: number | null, order?: EventOrder<Row>): MonthLayout<Row> {
  const L = model.leaves;
  const buckets = bucketByNode(occs, L);
  const rows = weeks.map((week) => ({ parts: [] as SpanPart<Row>[], lanes: 0, more: new Array<number>(week.length * L.length).fill(0) }));
  L.forEach((_, li) => {
    const lay = layoutMonth(buckets[li] as Occurrence<Row>[], weeks, zone, maxLanes, order);
    lay.rows.forEach((r, ri) => {
      const n = (weeks[ri] as readonly number[]).length;
      const idx = Array.from({ length: n }, (_, k) => (model.byDate ? k * L.length + li : li * n + k));
      const row = rows[ri] as (typeof rows)[number];
      row.lanes = Math.max(row.lanes, r.lanes);
      r.more.forEach((m, k) => (row.more[idx[k] as number] = m));
      for (const p of r.parts) mapSpan(p, idx, row.parts);
    });
  });
  return { rows };
}
