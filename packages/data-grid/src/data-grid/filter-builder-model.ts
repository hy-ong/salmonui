// Draft model of the filter builder dialog: the applied
// `DataGridFilter[]` as one editable QueryTree of AND/OR groups and
// conditions (internal/query, shared with QueryBuilder) and the way
// back to `DataGridFilter[]`. Columns reach the tree through a
// `QueryFieldInfo` adapter. No React, no DOM. Part of the lazy filter
// builder chunk.
//
// Top-level filters are ANDed; a top-level condition's `logic` joins it to
// the previous condition on the same column (query-types.ts). The tree folds
// those per-column chains into groups, so every node's meaning is its
// group's `logic` alone. A single top-level group becomes the root.

import type { CompiledColumn, DataGridCommand } from '@salmonui/data-grid/engine';
import { draftRule, draftValue, isGroupNode, type FieldInfoOf, type QueryFieldInfo, type TreeGroup, type TreeNode } from '@salmonui/core/internal/query/model';
// Shared helpers come through the overlay chunk (see overlays.tsx).
import { barOperatorFor, filterEntries, formatFilterValue, operatorsFor, parseFilterValue, valueTypeOf } from './overlays.js';
import type { DataGridFilter, DataGridFilterCondition, DataGridFilterGroup, DataGridFiltering } from './query-types.js';

/** The tree's view of a column. */
export function columnInfo(column: CompiledColumn<unknown>, settings: DataGridFiltering | undefined): QueryFieldInfo {
  return {
    label: column.headerText,
    type: valueTypeOf(column),
    operators: operatorsFor(column, settings),
    defaultOperator: barOperatorFor(column, settings),
    format: (v) => formatFilterValue(column, v ?? null),
    parse: (t) => parseFilterValue(column, t),
  };
}

const isGroup = isGroupNode as unknown as (f: DataGridFilter) => f is DataGridFilterGroup;

function nodeOf(f: DataGridFilter, infoOf: FieldInfoOf, nextId: () => string): TreeNode {
  if (!isGroup(f)) {
    const { logic: _logic, ...rule } = f;
    return draftRule(rule, infoOf(f.field), nextId());
  }
  return { id: nextId(), logic: f.logic === 'or' ? 'or' : 'and', ...(f.not ? { not: true } : {}), filters: f.filters.map((x) => nodeOf(x, infoOf, nextId)) };
}

/** The applied filters as the dialog's root group. */
export function builderTree(filters: readonly DataGridFilter[], infoOf: FieldInfoOf, nextId: () => string): TreeGroup {
  if (filters.length === 1 && isGroup(filters[0] as DataGridFilter)) return nodeOf(filters[0] as DataGridFilter, infoOf, nextId) as TreeGroup;
  // Fold each column's top-level chain (left to right, by each condition's `logic`).
  const chains = new Map<string, TreeNode>();
  const order: (string | TreeNode)[] = [];
  for (const f of filters) {
    if (isGroup(f)) {
      order.push(nodeOf(f, infoOf, nextId));
      continue;
    }
    const rule = nodeOf(f, infoOf, nextId);
    const acc = chains.get(f.field);
    if (!acc) {
      chains.set(f.field, rule);
      order.push(f.field);
      continue;
    }
    const logic = f.logic === 'or' ? 'or' : 'and';
    chains.set(f.field, isGroupNode(acc) && acc.logic === logic ? { ...acc, filters: [...acc.filters, rule] } : { id: nextId(), logic, filters: [acc, rule] });
  }
  const children: TreeNode[] = [];
  for (const entry of order) {
    const node = typeof entry === 'string' ? (chains.get(entry) as TreeNode) : entry;
    // A chain that only ANDs is flat in the AND root.
    if (typeof entry === 'string' && isGroupNode(node) && node.logic === 'and') children.push(...node.filters);
    else children.push(node);
  }
  return { id: nextId(), logic: 'and', filters: children };
}

export interface BuilderResult {
  readonly filters: DataGridFilter[];
  /** Ids of the conditions whose value is incomplete or invalid. */
  readonly invalid: readonly string[];
}

/**
 * The draft as `filtering.filters`: an AND root is the top-level list, an OR
 * or negated root one top-level group. Empty groups are dropped.
 */
export function builderFilters(root: TreeGroup, infoOf: FieldInfoOf): BuilderResult {
  const invalid: string[] = [];
  const convert = (node: TreeNode, top: boolean): DataGridFilter | null => {
    if (isGroupNode(node)) {
      const filters = node.filters.map((c) => convert(c, false)).filter((f): f is DataGridFilter => f !== null);
      return filters.length ? { logic: node.logic, ...(node.not ? { not: true } : {}), filters } : null;
    }
    const value = draftValue(node, infoOf(node.field));
    if (value === undefined) {
      invalid.push(node.id);
      return null;
    }
    const out: DataGridFilterCondition = { field: node.field, operator: node.operator, value };
    if (top) out.logic = 'and';
    if (node.matchCase !== undefined) out.matchCase = node.matchCase;
    if (node.ignoreAccents !== undefined) out.ignoreAccents = node.ignoreAccents;
    return out;
  };
  const flat = root.logic === 'and' && !root.not;
  const members = root.filters.map((c) => convert(c, flat)).filter((f): f is DataGridFilter => f !== null);
  const filters = flat || members.length === 0 ? members : [{ logic: root.logic, ...(root.not ? { not: true } : {}), filters: members }];
  return { filters, invalid };
}

/** The `filter.set` command of an apply: `ui: 'builder'` reaches the filter events (query-config.ts). */
export function builderCommand(filters: readonly DataGridFilter[]): DataGridCommand {
  return { type: 'filter.set', filters: filterEntries(filters), ui: 'builder' } as unknown as DataGridCommand;
}
