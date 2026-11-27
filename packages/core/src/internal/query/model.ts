// QueryTree model: the editable tree of AND/OR groups and rules
// shared by the Query Builder and the Data Grid filter builder dialog. No
// React, no DOM. Nodes are the public QueryGroup / QueryRule shapes with a
// required `id`; edits are immutable with structural sharing, so an untouched
// node keeps its identity (memoized rule rows skip re-rendering).
//
// Fields are described by a small `QueryFieldInfo` adapter, built from
// compiled columns in the grid and from `fields` in QueryBuilder.

import type { Json } from '@salmonui/core/data';
import { LIST_OPERATORS, NO_VALUE_OPERATORS } from './operators.js';
import { isQueryGroup, isQueryGroup as isGroupNode, type QueryGroup, type QueryNode, type QueryRule } from './types.js';

export interface TreeRule extends QueryRule {
  readonly id: string;
  /** Editor text of a text-draft host (the grid dialog); `between` uses `text2` too. */
  readonly text?: string;
  readonly text2?: string;
}

export interface TreeGroup extends Omit<QueryGroup, 'id' | 'filters'> {
  readonly id: string;
  readonly filters: readonly TreeNode[];
}

export type TreeNode = TreeRule | TreeGroup;

export { isGroupNode };

/** What the tree needs to know about a field. */
export interface QueryFieldInfo {
  readonly label: string;
  readonly type: 'string' | 'number' | 'date' | 'boolean';
  readonly operators: readonly string[];
  readonly defaultOperator: string;
  /** Editor text of a value. */
  format(value: Json | undefined): string;
  /** Typed value of editor text, or undefined when invalid. */
  parse(text: string): Json | undefined;
}

export type FieldInfoOf = (field: string) => QueryFieldInfo | undefined;

/** Sequential node ids. */
export function idSource(prefix = 'n'): () => string {
  let n = 0;
  return () => `${prefix}${++n}`;
}

/** Replaces the node `id` (or removes it when `fn` returns null). */
export function updateNode(root: TreeGroup, id: string, fn: (node: TreeNode) => TreeNode | null): TreeGroup {
  const walk = (group: TreeGroup): TreeGroup => {
    let changed = false;
    const filters: TreeNode[] = [];
    for (const child of group.filters) {
      let next: TreeNode | null = child;
      if (child.id === id) next = fn(child);
      else if (isGroupNode(child)) next = walk(child);
      if (next !== child) changed = true;
      if (next) filters.push(next);
    }
    return changed ? { ...group, filters } : group;
  };
  if (root.id === id) {
    const next = fn(root);
    return next && isGroupNode(next) ? next : { ...root, filters: [] };
  }
  return walk(root);
}

/** Inserts `node` into the group `groupId` at `index` (default: the end). */
export function insertNode(root: TreeGroup, groupId: string, node: TreeNode, index?: number): TreeGroup {
  return updateNode(root, groupId, (g) => {
    if (!isGroupNode(g)) return g;
    const filters = g.filters.slice();
    filters.splice(index ?? filters.length, 0, node);
    return { ...g, filters };
  });
}

export interface NodePath {
  readonly node: TreeNode;
  readonly parent: TreeGroup | null;
  readonly index: number;
  /** Ancestors from the root (excluding the node). */
  readonly ancestors: readonly TreeGroup[];
}

/** The node `id` with its parent, index and ancestors, or null. */
export function findNode(root: TreeGroup, id: string): NodePath | null {
  if (root.id === id) return { node: root, parent: null, index: 0, ancestors: [] };
  const stack: TreeGroup[] = [];
  const walk = (group: TreeGroup): NodePath | null => {
    stack.push(group);
    for (let i = 0; i < group.filters.length; i++) {
      const child = group.filters[i] as TreeNode;
      if (child.id === id) return { node: child, parent: group, index: i, ancestors: stack.slice() };
      if (isGroupNode(child)) {
        const hit = walk(child);
        if (hit) return hit;
      }
    }
    stack.pop();
    return null;
  };
  return walk(root);
}

/** Moves the node `id` into `groupId` at `index` (an index in the group before the move). */
export function moveNode(root: TreeGroup, id: string, groupId: string, index: number): TreeGroup {
  const from = findNode(root, id);
  if (!from || !from.parent) return root;
  // A group never moves into itself or its descendants.
  if (isGroupNode(from.node) && findNode(from.node, groupId)) return root;
  const at = from.parent.id === groupId && from.index < index ? index - 1 : index;
  return insertNode(updateNode(root, id, () => null), groupId, from.node, at);
}

/** A deep copy with new ids. */
export function cloneNode<N extends TreeNode>(node: N, nextId: () => string): N {
  if (!isGroupNode(node)) return { ...node, id: nextId() };
  return { ...node, id: nextId(), filters: node.filters.map((c) => cloneNode(c, nextId)) };
}

/** Nesting depth below `group` (a group without subgroups is 1). */
export function groupDepth(group: TreeGroup): number {
  let d = 0;
  for (const c of group.filters) if (isGroupNode(c)) d = Math.max(d, groupDepth(c));
  return d + 1;
}

/** Number of groups in the tree, the root included. */
export function groupCount(group: TreeGroup): number {
  let n = 1;
  for (const c of group.filters) if (isGroupNode(c)) n += groupCount(c);
  return n;
}

/** A public value as a tree: nodes without an id get one from `nextId` (identity kept when every id is present). */
export function withIds(group: QueryGroup, nextId: () => string): TreeGroup {
  const walk = (node: QueryNode): TreeNode => {
    if (!isQueryGroup(node)) return node.id === undefined ? { ...node, id: nextId() } : (node as TreeRule);
    let changed = node.id === undefined;
    const filters = node.filters.map((c) => {
      const next = walk(c);
      if (next !== c) changed = true;
      return next;
    });
    return changed ? { ...node, id: node.id ?? nextId(), filters } : (node as TreeGroup);
  };
  return walk(group) as TreeGroup;
}

// ---------------------------------------------------------------------------
// Text drafts (hosts whose editors edit text, the Data Grid dialog)
// ---------------------------------------------------------------------------

/** A rule with its editor text from the value. */
export function draftRule(rule: QueryRule, info: QueryFieldInfo | undefined, id: string): TreeRule {
  const v = rule.value ?? null;
  const fmt = (x: Json | undefined): string => (info ? info.format(x ?? null) : x == null ? '' : String(x));
  let text = '';
  let text2 = '';
  if (rule.operator === 'between' && Array.isArray(v)) {
    text = fmt(v[0]);
    text2 = fmt(v[1]);
  } else if (Array.isArray(v)) {
    text = v.map(fmt).join(', ');
  } else if (!NO_VALUE_OPERATORS.has(rule.operator)) {
    text = fmt(v);
  }
  return { ...rule, id, value: v, text, text2 };
}

/** A new draft rule on `field` with its default operator. */
export function newDraftRule(field: string, info: QueryFieldInfo | undefined, id: string): TreeRule {
  return { id, field, operator: info ? info.defaultOperator : 'equal', text: '', text2: '' };
}

/** Operators offered for a rule: the field's list, plus the rule's own (an `in` list from a checklist). */
export function ruleOperators(rule: QueryRule, info: QueryFieldInfo | undefined): readonly string[] {
  const ops = info ? info.operators : [];
  return ops.includes(rule.operator) ? ops : [rule.operator, ...ops];
}

export type DraftPatch = Partial<Pick<TreeRule, 'field' | 'operator' | 'text' | 'text2'>>;

/** Edits a draft rule; a new field resets an operator it does not offer and clears the text. */
export function editDraft(rule: TreeRule, patch: DraftPatch, infoOf: FieldInfoOf): TreeRule {
  const { value: _value, ...rest } = rule;
  let next: TreeRule = { ...rest, ...patch };
  if (patch.field !== undefined && patch.field !== rule.field) {
    const info = infoOf(patch.field);
    const ops = info ? info.operators : [];
    const { matchCase: _m, ignoreAccents: _i, ...plain } = next;
    next = { ...plain, operator: ops.includes(next.operator) ? next.operator : info ? info.defaultOperator : next.operator, text: '', text2: '' };
  }
  return next;
}

/** Parsed value of a draft rule, or undefined when its text is incomplete or invalid. */
export function draftValue(rule: TreeRule, info: QueryFieldInfo | undefined): Json | undefined {
  if (NO_VALUE_OPERATORS.has(rule.operator)) return null;
  // Untouched rules keep their value exactly.
  if (rule.value !== undefined || !info) return rule.value;
  if (rule.operator === 'between') {
    const a = info.parse(rule.text ?? '');
    const b = info.parse(rule.text2 ?? '');
    return a === undefined || b === undefined ? undefined : [a, b];
  }
  if (LIST_OPERATORS.has(rule.operator)) {
    const values = (rule.text ?? '').split(',').map((t) => t.trim()).filter((t) => t !== '').map((t) => info.parse(t));
    return values.length === 0 || values.includes(undefined) ? undefined : (values as Json[]);
  }
  if (info.type === 'boolean' && !rule.text) return true;
  return info.parse(rule.text ?? '');
}
