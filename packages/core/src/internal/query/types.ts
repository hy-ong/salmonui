// The Query Builder value: structurally a Data Grid `DataGridFilterGroup` plus `id`, `not`
// and `locked`, so `<DataGrid filtering={{ filters: [query] }}>` and
// `@salmonui/data` queries take it as is. Types and pure guards only: the
// server-safe converters (`query-builder/sql`, `query-builder/mongo`) import
// this module, so it never imports React or DOM code.

import type { Json } from '@salmonui/core/data';

export type { Json };

/** One condition: `field operator value`. */
export interface QueryRule {
  /** Stable node id; assigned by QueryBuilder when missing. */
  readonly id?: string;
  /** Field path (`address.city` with the default `pathSeparator`). */
  readonly field: string;
  /** A Data Grid filter operator name (`equal`, `contains`, `between`, ...) or a custom operator. */
  readonly operator: string;
  /** `between`: `[from, to]`; `in` / `notIn`: an array; value-less operators omit it. */
  readonly value?: Json;
  readonly matchCase?: boolean;
  readonly ignoreAccents?: boolean;
  /** A locked rule cannot be edited, moved or deleted from the UI. */
  readonly locked?: boolean;
}

/** AND / OR group of rules and groups, optionally negated. */
export interface QueryGroup {
  readonly id?: string;
  readonly logic: 'and' | 'or';
  /** NOT (members). */
  readonly not?: boolean;
  /** A locked group and everything in it cannot be edited from the UI. */
  readonly locked?: boolean;
  readonly filters: readonly QueryNode[];
}

export type QueryNode = QueryRule | QueryGroup;

/** Whether a node is a group (it has `filters` and no `field`). */
export function isQueryGroup<N extends QueryNode>(node: N): node is Extract<N, { readonly filters: readonly unknown[] }> {
  return Array.isArray((node as { filters?: unknown }).filters) && (node as { field?: unknown }).field === undefined;
}
