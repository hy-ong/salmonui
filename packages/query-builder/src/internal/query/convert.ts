// Helpers shared by the server-safe Query Builder converters (`toSql`,
// `toMongo`, `fromMongo`): operator name normalization and the walk over a
// value that drops empty groups. Pure; no React, no DOM.

import { isQueryGroup, type QueryGroup, type QueryNode, type QueryRule } from '@salmonui/core/internal/query/types';

const ALIASES: Readonly<Record<string, string>> = {
  eq: 'equal', neq: 'notEqual', ne: 'notEqual', gt: 'greaterThan', gte: 'greaterThanOrEqual', ge: 'greaterThanOrEqual',
  lt: 'lessThan', lte: 'lessThanOrEqual', le: 'lessThanOrEqual',
};

/** Canonical operator name: the short aliases (eq, neq, gt, gte, lt, lte) map to the Data Grid names; others pass as given. */
export const canonicalOperator = (name: string): string => ALIASES[name] ?? name;

/**
 * Folds a value bottom-up: `rule` maps a condition, `group` combines the
 * mapped members of a non-empty group. Empty groups are dropped; an empty
 * root returns null.
 */
export function foldQuery<T>(value: QueryGroup, rule: (rule: QueryRule, operator: string) => T, group: (group: QueryGroup, members: T[], root: boolean) => T): T | null {
  const walk = (node: QueryNode, root: boolean): T | null => {
    if (!isQueryGroup(node)) return rule(node, canonicalOperator(node.operator));
    const members: T[] = [];
    for (const child of node.filters) {
      const next = walk(child, false);
      if (next !== null) members.push(next);
    }
    return members.length ? group(node, members, root) : null;
  };
  return walk(value, true);
}

/** Escapes text for a RegExp source. */
export const escapeRegExp = (text: string): string => text.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');

/** The two-element value of `between`, else throws. */
export function rangeOf(rule: QueryRule): readonly [unknown, unknown] {
  const v = rule.value;
  if (!Array.isArray(v) || v.length !== 2) throw new TypeError(`between on "${rule.field}" needs a [from, to] value`);
  return v as unknown as readonly [unknown, unknown];
}

/** The list value of `in` / `notIn` (a scalar becomes a one-item list). */
export const listOf = (rule: QueryRule): readonly unknown[] => (Array.isArray(rule.value) ? rule.value : rule.value === undefined ? [] : [rule.value]);
