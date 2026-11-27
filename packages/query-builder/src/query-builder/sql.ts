// `@salmonui/query-builder/sql`: a
// Query Builder value as a SQL WHERE expression and back (`fromSql`). Server-safe: no React, no
// DOM, no component code.
//
// Parameterized output is the default (`{ sql, params }`), so user values
// never reach the SQL text; `inline: true` writes escaped literals. Text comparisons follow the database
// collation: `matchCase` and `ignoreAccents` are not translated.

import { foldQuery, listOf, rangeOf } from '../internal/query/convert.js';
import type { Json, QueryGroup, QueryRule } from '@salmonui/core/internal/query/types';

export type { Json, QueryGroup, QueryNode, QueryRule } from '@salmonui/core/internal/query/types';
export { fromSql, SqlParseError } from './from-sql.js';
export type { FromSqlOptions } from './from-sql.js';

export type SqlDialect = 'ansi' | 'postgres' | 'mysql' | 'sqlite' | 'mssql';

export interface SqlOperatorContext {
  /** The column expression (quoted when `quoteIdentifier`). */
  readonly field: string;
  readonly rule: QueryRule;
  readonly value: Json | undefined;
  readonly dialect: SqlDialect;
  /** Adds `value` as a parameter (or an inlined literal) and returns its SQL text. */
  param(value: Json): string;
}

export interface ToSqlOptions {
  /** Named placeholders (`:p1`, `@p1` on mssql) with `params` as a record. Default false. */
  readonly named?: boolean;
  /** Escaped literals instead of placeholders (`params` is empty). Default false. */
  readonly inline?: boolean;
  /** Quotes identifiers for the dialect (each path segment), or quotes with a function. Default false. */
  readonly quoteIdentifier?: boolean | ((name: string) => string);
  /** Placeholder and quoting style. Default `'ansi'` (`?`, `"x"`); postgres `$1`, mssql `@p1` and `[x]`, mysql `` `x` ``. */
  readonly dialect?: SqlDialect;
  /** SQL of custom operators, keyed by operator name; they also override built-ins. */
  readonly operators?: Readonly<Record<string, (ctx: SqlOperatorContext) => string>>;
  /** Separator of nested field paths. Default `'.'`. */
  readonly pathSeparator?: string;
  /** Prefix of named parameters. Default `'p'`. */
  readonly paramPrefix?: string;
}

export interface SqlResult {
  /** The WHERE expression without `WHERE`; '' for an empty query. */
  readonly sql: string;
  /** Positional values in placeholder order, or a record for `named`. */
  readonly params: Json[] | Record<string, Json>;
}

const COMPARE: Readonly<Record<string, string>> = {
  equal: '=', notEqual: '<>', greaterThan: '>', greaterThanOrEqual: '>=', lessThan: '<', lessThanOrEqual: '<=',
};
// LIKE patterns: '!' escapes the user text's own wildcards (portable: no backslash).
const likeText = (text: string): string => text.replace(/[!%_]/g, '!$&');
const LIKE: Readonly<Record<string, readonly [boolean, (v: string) => string]>> = {
  contains: [false, (v) => `%${likeText(v)}%`],
  doesNotContain: [true, (v) => `%${likeText(v)}%`],
  startsWith: [false, (v) => `${likeText(v)}%`],
  doesNotStartWith: [true, (v) => `${likeText(v)}%`],
  endsWith: [false, (v) => `%${likeText(v)}`],
  doesNotEndWith: [true, (v) => `%${likeText(v)}`],
  // `%` and `*` match any sequence.
  like: [false, (v) => likeText(v).replace(/!%|\*/g, '%')],
  // `*` any sequence, `?` one character.
  wildcard: [false, (v) => likeText(v).replace(/\*/g, '%').replace(/\?/g, '_')],
};

function quoter(dialect: SqlDialect, option: ToSqlOptions['quoteIdentifier']): (name: string) => string {
  if (typeof option === 'function') return option;
  if (!option) return (name) => name;
  if (dialect === 'mysql') return (name) => `\`${name.replace(/`/g, '``')}\``;
  if (dialect === 'mssql') return (name) => `[${name.replace(/]/g, ']]')}]`;
  return (name) => `"${name.replace(/"/g, '""')}"`;
}

function literal(value: unknown, dialect: SqlDialect): string {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'NULL';
  if (typeof value === 'boolean') return dialect === 'mssql' || dialect === 'sqlite' ? (value ? '1' : '0') : value ? 'TRUE' : 'FALSE';
  const text = String(value).replace(/'/g, "''");
  // MySQL reads backslashes in string literals as escapes by default.
  return `'${dialect === 'mysql' ? text.replace(/\\/g, '\\\\') : text}'`;
}

/** A Query Builder value as a SQL WHERE expression. */
export function toSql(value: QueryGroup, options: ToSqlOptions = {}): SqlResult {
  const dialect = options.dialect ?? 'ansi';
  const named = options.named === true;
  const inline = options.inline === true;
  const quote = quoter(dialect, options.quoteIdentifier);
  const separator = options.pathSeparator ?? '.';
  const prefix = options.paramPrefix ?? 'p';
  const list: Json[] = [];
  const record: Record<string, Json> = {};
  const param = (v: Json): string => {
    if (inline) return literal(v, dialect);
    list.push(v);
    const n = list.length;
    if (named) {
      record[`${prefix}${n}`] = v;
      return `${dialect === 'mssql' ? '@' : ':'}${prefix}${n}`;
    }
    return dialect === 'postgres' ? `$${n}` : dialect === 'mssql' ? `@p${n}` : '?';
  };
  const sql = foldQuery<string>(
    value,
    (rule, op) => {
      const field = rule.field.split(separator).map(quote).join('.');
      const custom = options.operators?.[op] ?? options.operators?.[rule.operator];
      if (custom) return custom({ field, rule, value: rule.value, dialect, param });
      const v = rule.value;
      switch (op) {
        case 'isNull':
          return `${field} IS NULL`;
        case 'isNotNull':
          return `${field} IS NOT NULL`;
        case 'isEmpty':
          return `${field} = ''`;
        case 'isNotEmpty':
          return `${field} <> ''`;
        case 'between': {
          const [a, b] = rangeOf(rule);
          return `${field} BETWEEN ${param(a as Json)} AND ${param(b as Json)}`;
        }
        case 'in':
        case 'notIn': {
          const values = listOf(rule);
          if (values.length === 0) return op === 'in' ? '1 = 0' : '1 = 1';
          return `${field} ${op === 'in' ? 'IN' : 'NOT IN'} (${values.map((x) => param(x as Json)).join(', ')})`;
        }
      }
      if (COMPARE[op]) {
        if (v === null && (op === 'equal' || op === 'notEqual')) return `${field} IS ${op === 'equal' ? '' : 'NOT '}NULL`;
        return `${field} ${COMPARE[op]} ${param(v ?? null)}`;
      }
      const like = LIKE[op];
      if (like) return `${field} ${like[0] ? 'NOT LIKE' : 'LIKE'} ${param(like[1](String(v ?? '')))} ESCAPE '!'`;
      throw new TypeError(`toSql: no SQL for operator "${rule.operator}" (pass options.operators)`);
    },
    (group, members, root) => {
      const body = members.join(group.logic === 'or' ? ' OR ' : ' AND ');
      if (group.not) return `NOT (${body})`;
      return root || members.length === 1 ? body : `(${body})`;
    },
  );
  return { sql: sql ?? '', params: named && !inline ? record : list };
}

