// JSX column children (`<DataGridColumn>`, nested for stacked headers) and
// aggregate children (`<DataGridAggregateRow>` / `<DataGridAggregate>`), plus the
// column resolver that turns either form into stable engine definitions.
//
// Stability rules (options props are reactive; columns compile only when
// they change):
// - A column whose non-reactive fields are shallowly equal to the previous
//   one keeps the previous engine definition object, so the engine never
//   recompiles it. Render-time function fields (`renderCell`, ...) are read
//   from the latest definition: they are copied onto the stable object, and
//   the ids of the columns whose render fields changed are returned so the
//   renderer re-renders that column's mounted cells only (`renderChanged`).
// - `hidden`, numeric `width`, and `pinned` are reactive runtime state: a
//   change against the previous prop value becomes a column command, never a
//   recompile. Column order changes likewise become `columns.setOrder`.

import { Children, isValidElement, type ReactElement, type ReactNode } from 'react';
import type { DataGridCommand } from '@salmonui/data-grid/engine';
import type { DataGridAggregate as DataGridAggregateProps, DataGridAggregateRow as DataGridAggregateRowProps, DataGridColumn as DataGridColumnProps } from './types.js';

/** JSX column. Renders nothing; nested `<DataGridColumn>` children form a stacked header. */
export function DataGridColumn<Row = unknown>(_props: DataGridColumnProps<Row> & { readonly children?: ReactNode }): null {
  return null;
}
/** A column definition: the props of `<DataGridColumn>` and the items of the `columns` prop. */
export interface DataGridColumn<Row = unknown> extends DataGridColumnProps<Row> {}

/** JSX aggregate row; its `<DataGridAggregate>` children are the aggregates. */
export function DataGridAggregateRow(_props: { readonly children?: ReactNode }): null {
  return null;
}
/** One aggregate row of the `aggregates` prop. */
export interface DataGridAggregateRow<Row = unknown> extends DataGridAggregateRowProps<Row> {}

/** JSX aggregate. */
export function DataGridAggregate<Row = unknown>(_props: DataGridAggregateProps<Row>): null {
  return null;
}
/** One aggregate of an aggregate row. */
export interface DataGridAggregate<Row = unknown> extends DataGridAggregateProps<Row> {}

/** Fields read only while rendering; a change never recompiles the column. */
const RENDER_FIELDS: ReadonlySet<string> = new Set([
  'renderCell',
  'renderHeader',
  'renderFilter',
  'renderFilterCell',
  'cellProps',
  'cellClassName',
  'headerProps',
  'colSpan',
  'rowSpan',
]);
/** Reactive runtime state: applied as column commands. */
const REACTIVE_FIELDS: ReadonlySet<string> = new Set(['hidden', 'pinned', 'width']);

type AnyColumn = DataGridColumnProps<unknown>;

function elementColumns(children: ReactNode): AnyColumn[] {
  const out: AnyColumn[] = [];
  Children.forEach(children, (child) => {
    if (!isValidElement(child) || child.type !== DataGridColumn) return;
    const { children: nested, ...rest } = (child as ReactElement<AnyColumn & { children?: ReactNode }>).props;
    const columns = elementColumns(nested);
    out.push(columns.length ? { ...rest, columns } : rest);
  });
  return out;
}

function elementAggregates(children: ReactNode): DataGridAggregateRowProps<unknown>[] {
  const out: DataGridAggregateRowProps<unknown>[] = [];
  Children.forEach(children, (child) => {
    if (!isValidElement(child) || child.type !== DataGridAggregateRow) return;
    const columns: DataGridAggregateProps<unknown>[] = [];
    Children.forEach((child as ReactElement<{ children?: ReactNode }>).props.children, (item) => {
      if (isValidElement(item) && item.type === DataGridAggregate) columns.push({ ...(item as ReactElement<DataGridAggregateProps<unknown>>).props });
    });
    out.push({ columns });
  });
  return out;
}

/** True when `children` holds at least one `<DataGridColumn>` / `<DataGridAggregateRow>`. */
export function childrenOf(children: ReactNode): { columns: AnyColumn[] | null; aggregates: DataGridAggregateRowProps<unknown>[] | null } {
  if (children === undefined || children === null) return { columns: null, aggregates: null };
  const columns = elementColumns(children);
  const aggregates = elementAggregates(children);
  return { columns: columns.length ? columns : null, aggregates: aggregates.length ? aggregates : null };
}

function keyOf(column: AnyColumn, path: string): string {
  return column.id ?? column.field ?? (column.header !== undefined ? `${path}h:${column.header}` : path);
}

/** Shallow equality of the fields that need a recompile. */
function sameStructure(a: AnyColumn, b: AnyColumn): boolean {
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  const seen = new Set<string>();
  for (const k of [...ka, ...kb]) {
    if (seen.has(k)) continue;
    seen.add(k);
    if (k === 'columns' || RENDER_FIELDS.has(k)) continue;
    const va = (a as Record<string, unknown>)[k];
    const vb = (b as Record<string, unknown>)[k];
    if (REACTIVE_FIELDS.has(k)) {
      // Numeric widths are runtime state; a change to or from '%' / 'auto' recompiles.
      if (k !== 'width' || (typeof va === 'number' || va === undefined) === (typeof vb === 'number' || vb === undefined)) continue;
    }
    if (va !== vb && !(typeof va === 'object' && typeof vb === 'object' && JSON.stringify(va) === JSON.stringify(vb))) return false;
  }
  return true;
}

interface Entry {
  /** The latest user definition (reactive fields compared against it). */
  readonly user: AnyColumn;
  /** The definition handed to the engine. */
  readonly stable: AnyColumn;
}

export interface ResolvedColumns {
  readonly columns: readonly AnyColumn[];
  /** Commands that apply reactive field changes (hidden, width, pinned, order). */
  readonly commands: readonly DataGridCommand[];
  /** Columns whose render-time fields (`RENDER_FIELDS`) changed without a recompile; their mounted cells re-render. */
  readonly renderChanged: readonly string[];
}

const NONE: readonly string[] = Object.freeze([]);

/**
 * Per-grid column resolver. `resolve` is idempotent for equal input (it may
 * run during render and again in the layout effect).
 */
export class ColumnResolver {
  private entries = new Map<string, Entry>();
  lastInput: readonly AnyColumn[] | null = null;
  private lastOutput: readonly AnyColumn[] = [];
  private lastLeafOrder: readonly string[] = [];

  private stale = false;
  /**
   * Render-time function fields (`columnId.field`) whose identity changed in
   * the last computed resolve; read by the development template identity
   * check. Kept for repeated resolves of the same input.
   */
  renderChanges: readonly string[] = [];

  /** Re-runs `prepare` on the next call even for the same input (renderer defaults changed, e.g. the locale text). */
  invalidate(): void {
    this.stale = true;
  }

  /** Stable engine definitions for `input`; `commands` is empty on the first call. */
  resolve(input: readonly AnyColumn[], prepare: (column: AnyColumn) => AnyColumn): ResolvedColumns {
    if (input === this.lastInput && !this.stale) return { columns: this.lastOutput, commands: [], renderChanged: NONE };
    this.stale = false;
    const first = this.lastInput === null;
    const next = new Map<string, Entry>();
    const commands: DataGridCommand[] = [];
    const renderChanged: string[] = [];
    const visibility: Record<string, boolean> = {};
    let changedVisibility = false;
    let structural = false;
    const leafOrder: string[] = [];
    const renderChanges: string[] = [];

    const walk = (columns: readonly AnyColumn[], path: string): AnyColumn[] =>
      columns.map((raw, index) => {
        const user = prepare(raw);
        const key = keyOf(user, `${path}${index}.`);
        const children = user.columns?.length ? walk(user.columns, `${key}/`) : null;
        const previous = this.entries.get(key);
        let stable: AnyColumn;
        const childrenSame =
          children === null
            ? !previous?.stable.columns?.length
            : previous?.stable.columns?.length === children.length && children.every((c, i) => c === previous.stable.columns?.[i]);
        if (previous && childrenSame && sameStructure(previous.user, user)) {
          stable = previous.stable;
          let rendered = false;
          for (const field of RENDER_FIELDS) {
            const value = (user as Record<string, unknown>)[field];
            if ((stable as Record<string, unknown>)[field] !== value) {
              if (typeof value === 'function' && typeof (stable as Record<string, unknown>)[field] === 'function') renderChanges.push(`${user.id ?? user.field ?? key}.${field}`);
              (stable as Record<string, unknown>)[field] = value;
              rendered = true;
            }
          }
          if (rendered && !first) renderChanged.push(user.id ?? user.field ?? key);
          if (!first && !user.columns?.length) {
            const id = user.id ?? user.field;
            if (id !== undefined) {
              if ((previous.user.hidden ?? false) !== (user.hidden ?? false)) {
                visibility[id] = !user.hidden;
                changedVisibility = true;
              }
              if (typeof user.width === 'number' && user.width !== previous.user.width) commands.push({ type: 'columns.setWidth', columnId: id, width: user.width });
              if (previous.user.pinned !== user.pinned) {
                commands.push({ type: 'columns.setFreeze', columnId: id, freeze: user.pinned === 'start' ? 'left' : user.pinned === 'end' ? 'right' : user.pinned === 'center' ? 'fixed' : null });
              }
            }
          }
        } else {
          stable = children ? { ...user, columns: children } : { ...user };
          structural = true;
        }
        if (!children) leafOrder.push(user.id ?? user.field ?? key);
        next.set(key, { user, stable });
        return stable;
      });

    const output = walk(input, '');
    this.entries = next;
    this.lastInput = input;
    this.renderChanges = renderChanges;
    if (changedVisibility) commands.unshift({ type: 'columns.setVisibility', visibility });
    const reordered = leafOrder.length !== this.lastLeafOrder.length || leafOrder.some((id, i) => id !== this.lastLeafOrder[i]);
    // Same definitions in a new order: reorder at runtime and keep the compiled columns.
    if (!first && reordered) commands.push({ type: 'columns.setOrder', order: leafOrder });
    this.lastLeafOrder = leafOrder;
    if (structural || first) this.lastOutput = Object.freeze(output);
    return { columns: this.lastOutput, commands, renderChanged: renderChanged.length ? renderChanged : NONE };
  }
}
