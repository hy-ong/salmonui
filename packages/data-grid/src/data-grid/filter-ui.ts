// Filter UI logic shared by the filter row and the filter menu: operator lists per value type and their
// customization, typed value parsing for the built-in editors, filter row
// expressions (`>10`, `!=x`, `a*`), and the commands a condition editor
// dispatches. No React, no DOM.

import { getColumnFilters, normalizeFilterOperator, type ColumnId, type CompiledColumn, type FilterEntry, type FilterSource, type DataGridCommand, type Json } from '@salmonui/data-grid/engine';
import type { DataGridFilterOperator, DataGridFilterUi, DataGridFiltering, DataGridQueryColumn } from './query-types.js';

export type DataGridFilterValueType = 'string' | 'number' | 'date' | 'boolean';

// The operator lists are shared with the Query Builder (internal/query).
export { BOOLEAN_OPERATORS, NO_VALUE_OPERATORS, STRING_OPERATORS, VALUE_OPERATORS } from '@salmonui/core/internal/query/operators';
import { BOOLEAN_OPERATORS, NO_VALUE_OPERATORS, STRING_OPERATORS, VALUE_OPERATORS } from '@salmonui/core/internal/query/operators';

export function valueTypeOf(column: CompiledColumn<unknown>): DataGridFilterValueType {
  switch (column.type) {
    case 'boolean':
    case 'selection':
      return 'boolean';
    case 'number':
      return 'number';
    case 'date':
    case 'datetime':
      return 'date';
    default:
      return 'string';
  }
}

/** Canonical operator name; custom operators pass through. */
export function canonicalOperator(name: string): string {
  return normalizeFilterOperator(name) ?? name;
}

/** Engine `FilterSource` of a filter UI. */
export function filterSource(ui: DataGridFilterUi): FilterSource {
  return ui === 'row' ? 'bar' : ui === 'checklist' ? 'checkbox' : ui;
}

function customOperators(column: CompiledColumn<unknown>, settings: DataGridFiltering | undefined): readonly DataGridFilterOperator[] | undefined {
  const own = (column.def as DataGridQueryColumn<unknown>).filter?.operators;
  if (own?.length) return own;
  const o = settings?.operators;
  if (!o) return undefined;
  const type = valueTypeOf(column);
  const list =
    type === 'string' ? o.string
    : type === 'number' ? o.number
    : type === 'boolean' ? o.boolean
    : column.type === 'datetime' ? (o.datetime ?? o.date) : o.date;
  return list?.length ? list : undefined;
}

/** Operators offered for a column: column `filter.operators`, else `filtering.operators[type]`, else the defaults. */
export function operatorsFor(column: CompiledColumn<unknown>, settings: DataGridFiltering | undefined): readonly string[] {
  const custom = customOperators(column, settings);
  if (custom) return custom.map(canonicalOperator);
  const type = valueTypeOf(column);
  return type === 'string' ? STRING_OPERATORS : type === 'boolean' ? BOOLEAN_OPERATORS : VALUE_OPERATORS;
}

/** Label of an operator: the `localeText` key `operator<Name>` (`operatorContains`), else the operator name. */
export { operatorText as operatorLabel } from './locale-text.js';

/** Default filter row / menu operator of a column (`column.filter.operator`, else contains / equal). */
export function barOperatorFor(column: CompiledColumn<unknown>, settings: DataGridFiltering | undefined): string {
  const own = (column.def as DataGridQueryColumn<unknown>).filter?.operator;
  if (own) return canonicalOperator(own);
  const type = valueTypeOf(column);
  const ops = operatorsFor(column, settings);
  const preferred = type === 'string' ? 'contains' : 'equal';
  return ops.includes(preferred) ? preferred : (ops[0] ?? preferred);
}

/** Props the grid owns on a built-in filter editor: column `filter.editorProps` never override them. */
const OWNED_EDITOR_PROPS = new Set(['ref', 'key', 'value', 'defaultValue', 'checked', 'defaultChecked', 'onChange', 'onInput', 'onKeyDown', 'type', 'children', 'dangerouslySetInnerHTML']);
const NO_EDITOR_PROPS: Readonly<Record<string, unknown>> = Object.freeze({});
const editorPropsCache = new WeakMap<object, Readonly<Record<string, unknown>>>();

/**
 * Column `filter.editorProps` as attributes of
 * the built-in value editors (filter row input, menu and Excel value
 * inputs): `placeholder`, `min`, `max`, `step`, `inputMode`, `aria-*`,
 * `data-*`, `className`, `style`, ... Value, type, ref, and event handlers
 * stay the grid's. Cached per object.
 */
export function filterEditorProps(column: CompiledColumn<unknown>): Readonly<Record<string, unknown>> {
  const raw = (column.def as DataGridQueryColumn<unknown>).filter?.editorProps;
  if (!raw) return NO_EDITOR_PROPS;
  let out = editorPropsCache.get(raw);
  if (!out) {
    const next: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(raw)) if (!OWNED_EDITOR_PROPS.has(k)) next[k] = v;
    out = Object.freeze(next);
    editorPropsCache.set(raw, out);
  }
  return out;
}

/** Joins the grid's editor class with the `editorProps` class. */
export function editorClassName(base: string, props: Readonly<Record<string, unknown>>): string {
  const extra = props['className'];
  return typeof extra === 'string' && extra ? `${base} ${extra}` : base;
}

/** `<input type>` of the built-in value editor. */
export function inputTypeOf(column: CompiledColumn<unknown>): 'text' | 'number' | 'date' | 'datetime-local' {
  if (column.type === 'number') return 'number';
  if (column.type === 'date') return 'date';
  if (column.type === 'datetime') return 'datetime-local';
  return 'text';
}

/**
 * Parses an editor string into a filter value. Returns `undefined` when the
 * text is not a valid value for the column type (the editor keeps the draft
 * and does not apply).
 */
export function parseFilterValue(column: CompiledColumn<unknown>, raw: string): Json | undefined {
  const text = raw.trim();
  if (text === '') return undefined;
  switch (valueTypeOf(column)) {
    case 'number': {
      const n = Number(text);
      return Number.isFinite(n) ? n : undefined;
    }
    case 'boolean':
      if (/^(true|1|yes)$/i.test(text)) return true;
      if (/^(false|0|no)$/i.test(text)) return false;
      return undefined;
    case 'date': {
      // `<input type="date">` gives YYYY-MM-DD (a calendar day the core compares by day key);
      // datetime-local gives a local wall time, kept as typed.
      if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
      const t = Date.parse(text);
      return Number.isNaN(t) ? undefined : text;
    }
    default:
      return raw;
  }
}

/** Editor string of a filter value. */
export function formatFilterValue(column: CompiledColumn<unknown>, value: Json | undefined): string {
  if (value === null || value === undefined) return '';
  if (valueTypeOf(column) === 'date' && typeof value === 'string') {
    if (column.type === 'date') return value.slice(0, 10);
    return value.length > 16 ? value.slice(0, 16) : value;
  }
  if (valueTypeOf(column) === 'date' && typeof value === 'number') {
    const iso = new Date(value).toISOString();
    return column.type === 'date' ? iso.slice(0, 10) : iso.slice(0, 16);
  }
  return String(value);
}

const PREFIX_OPERATORS: readonly [string, string][] = [
  ['>=', 'greaterThanOrEqual'],
  ['<=', 'lessThanOrEqual'],
  ['!=', 'notEqual'],
  ['<>', 'notEqual'],
  ['>', 'greaterThan'],
  ['<', 'lessThan'],
  ['=', 'equal'],
];

/**
 * Filter row prefix that writes `operator` back as text (`>=` for
 * `greaterThanOrEqual`), '' when the plain value already parses to it (the
 * column default, `like` with a wildcard, a `between` range), or null when no
 * prefix expresses it (`startsWith`, ...; the cell shows the value only).
 */
export function barPrefixOf(column: CompiledColumn<unknown>, operator: string, value: Json, defaultOperator: string): string | null {
  if (operator === defaultOperator || operator === 'between') return '';
  if (operator === 'like' && valueTypeOf(column) === 'string' && typeof value === 'string' && /[*%]/.test(value)) return '';
  for (const [prefix, name] of PREFIX_OPERATORS) if (name === operator) return prefix;
  return null;
}

export type BarExpression = { readonly operator: string; readonly value: Json } | null | 'invalid';

/**
 * Filter bar text to a condition: an optional operator prefix (`>=`, `<=`,
 * `!=`, `<>`, `>`, `<`, `=`), `*` / `%` wildcards on strings (`like`),
 * else `operator`. Empty text is `null` (clear); unparsable text `'invalid'`.
 */
export function parseBarExpression(column: CompiledColumn<unknown>, raw: string, operator: string, allowPrefix: boolean): BarExpression {
  let text = raw.trim();
  if (text === '') return NO_VALUE_OPERATORS.has(operator) ? { operator, value: null } : null;
  if (NO_VALUE_OPERATORS.has(operator)) return { operator, value: null };
  let op = operator;
  if (allowPrefix) {
    for (const [prefix, name] of PREFIX_OPERATORS) {
      if (text.startsWith(prefix)) {
        op = name;
        text = text.slice(prefix.length).trim();
        break;
      }
    }
    if (text === '') return 'invalid';
  }
  const type = valueTypeOf(column);
  if (type === 'string' && op === operator && /[*%]/.test(text) && op !== 'like' && op !== 'wildcard') op = 'like';
  // `a..b` on a number or date column is a range (the text a `between` condition is written back as).
  if (allowPrefix && op === operator && (type === 'number' || type === 'date') && text.includes('..')) op = 'between';
  if (op === 'between') {
    const parts = text.split(/\s*(?:\.\.|,|\bto\b)\s*/i);
    if (parts.length !== 2) return 'invalid';
    const a = parseFilterValue(column, parts[0] as string);
    const b = parseFilterValue(column, parts[1] as string);
    return a === undefined || b === undefined ? 'invalid' : { operator: op, value: [a, b] };
  }
  const value = parseFilterValue(column, text);
  return value === undefined ? 'invalid' : { operator: op, value };
}

export interface FilterCondition {
  readonly operator: string;
  readonly value: Json;
}

function plainEntries(entries: readonly FilterEntry[]): Json[] {
  return JSON.parse(JSON.stringify(entries)) as Json[];
}

/**
 * Command that replaces the column's top-level conditions with `conditions`
 * (combined by `predicate`); other columns' filters are kept in place.
 */
export function conditionsCommand(
  filters: readonly FilterEntry[],
  columnId: ColumnId,
  conditions: readonly FilterCondition[],
  predicate: 'and' | 'or',
  source: FilterSource,
): DataGridCommand {
  if (conditions.length === 0) return { type: 'filter.remove', columnId };
  if (conditions.length === 1) {
    const c = conditions[0] as FilterCondition;
    return { type: 'filter.byColumn', columnId, operator: c.operator, value: c.value, source };
  }
  const own = getColumnFilters(filters, columnId);
  const at = own.length ? filters.indexOf(own[0] as FilterEntry) : -1;
  const kept = filters.filter((e) => !own.includes(e as never));
  const next: Json[] = plainEntries(kept);
  const added: Json[] = conditions.map((c, i) => ({ columnId, operator: c.operator, value: c.value, predicate: i === 0 ? 'and' : predicate, source }));
  next.splice(at < 0 ? next.length : Math.min(at, next.length), 0, ...added);
  return { type: 'filter.set', filters: next };
}

/** Conditions of a column that a condition editor can show (not checklist `in` / `notIn`). */
export function editableConditions(filters: readonly FilterEntry[], columnId: ColumnId): { conditions: FilterCondition[]; predicate: 'and' | 'or' } {
  const own = getColumnFilters(filters, columnId).filter((f) => f.operator !== 'in' && f.operator !== 'notIn');
  return {
    conditions: own.slice(0, 2).map((f) => ({ operator: f.operator, value: f.value })),
    predicate: own[1]?.predicate ?? 'and',
  };
}
