// filterRows: evaluates a Query Builder value over plain rows with
// the Data Grid filter semantics: the
// `like` / `wildcard` patterns and operator names are the core's own
// (`compilePattern`, `normalizeFilterOperator`); case and accent folding,
// blanks, day-key dates and `in` lists follow the core pass tables (a unit
// test runs the same queries through the core filter module). Without the
// grid engine, so the entry stays small.

import { compilePattern, normalizeFilterOperator } from '@salmonui/core/data';
import { isQueryGroup, type Json, type QueryGroup, type QueryNode } from '@salmonui/core/internal/query/types';
import type { QueryField, QueryFieldType, QueryOperator } from './types.js';
import { flattenFields } from './fields.js';

export interface FilterRowsOptions {
  /** Separator of nested paths. Default `'.'`. */
  readonly pathSeparator?: string | undefined;
  /** Default `matchCase` of conditions that omit it. Default false. */
  readonly matchCase?: boolean | undefined;
  /** Default `ignoreAccents` of conditions that omit it. Default false. */
  readonly ignoreAccents?: boolean | undefined;
  /** Custom operators with `evaluate`. */
  readonly operators?: readonly QueryOperator[] | undefined;
}

const MARKS = /[̀-ͯ]/g;
const fold = (s: string, ignoreCase: boolean, ignoreAccent: boolean): string => {
  const out = ignoreAccent ? s.normalize('NFD').replace(MARKS, '') : s;
  return ignoreCase ? out.toLowerCase() : out;
};
const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

function toTime(v: unknown): number {
  if (v instanceof Date) return v.getTime();
  if (typeof v === 'number') return v;
  if (typeof v === 'string' && v !== '') {
    const m = DATE_ONLY.exec(v);
    return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).getTime() : Date.parse(v);
  }
  return Number.NaN;
}

/** Calendar day key (yyyymmdd) in the host zone; date-only strings as written. */
function dayKey(v: unknown): number {
  if (typeof v === 'string') {
    const m = DATE_ONLY.exec(v);
    if (m) return Number(m[1]) * 10000 + Number(m[2]) * 100 + Number(m[3]);
  }
  const t = toTime(v);
  if (Number.isNaN(t)) return Number.NaN;
  const d = new Date(t);
  return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
}

function boolKey(v: unknown): number {
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (v == null || v === '') return Number.NaN;
  if (typeof v === 'number') return v === 0 ? 0 : 1;
  const s = String(v).trim().toLowerCase();
  return s === 'true' || s === '1' || s === 'yes' ? 1 : s === 'false' || s === '0' || s === 'no' ? 0 : Number.NaN;
}

type Test = (row: unknown) => boolean;

/** The rows of `rows` that pass `value`. */
export function filterRows<Row>(rows: readonly Row[], value: QueryGroup, fields: readonly QueryField[] = [], options: FilterRowsOptions = {}): Row[] {
  const sep = options.pathSeparator ?? '.';
  const types = new Map<string, QueryFieldType>(flattenFields(fields, sep, null, undefined).map((f) => [f.path, f.type]));
  const custom = new Map((options.operators ?? []).map((o) => [o.name, o]));
  const compile = (node: QueryNode): Test | null => {
    if (isQueryGroup(node)) {
      const tests = node.filters.map(compile).filter((t): t is Test => t !== null);
      if (tests.length === 0) return null;
      const all: Test = node.logic === 'or' ? (r) => tests.some((t) => t(r)) : (r) => tests.every((t) => t(r));
      return node.not ? (r) => !all(r) : all;
    }
    const segments = node.field.split(sep);
    const get = (row: unknown): unknown => {
      let v: unknown = row;
      for (const s of segments) v = v == null ? undefined : (v as Record<string, unknown>)[s];
      return v;
    };
    const ignoreCase = !(node.matchCase ?? options.matchCase ?? false);
    const ignoreAccent = node.ignoreAccents ?? options.ignoreAccents ?? false;
    const op = normalizeFilterOperator(node.operator);
    const target = node.value ?? null;
    if (op === null) {
      const c = custom.get(node.operator);
      // Unknown operators never drop rows (as in the grid).
      if (!c?.evaluate) return null;
      const evaluate = c.evaluate;
      return (r) => evaluate(get(r), target as Json, { matchCase: !ignoreCase, ignoreAccents: ignoreAccent });
    }
    const type = types.get(node.field) ?? 'string';
    const isNull = (v: unknown): boolean => v === null || v === undefined;
    switch (op) {
      case 'isNull':
        return (r) => isNull(get(r));
      case 'isNotNull':
        return (r) => !isNull(get(r));
      case 'isEmpty':
        return (r) => {
          const v = get(r);
          return v === undefined || v === '';
        };
      case 'isNotEmpty':
        return (r) => {
          const v = get(r);
          return !(v === undefined || v === '');
        };
      case 'contains':
      case 'doesNotContain':
      case 'startsWith':
      case 'doesNotStartWith':
      case 'endsWith':
      case 'doesNotEndWith':
      case 'like':
      case 'wildcard': {
        const needle = fold(target == null ? '' : String(target), ignoreCase, ignoreAccent);
        const text = (r: unknown): string | null => {
          const v = get(r);
          return v == null ? null : fold(String(v), ignoreCase, ignoreAccent);
        };
        if (op === 'like' || op === 'wildcard') {
          const re = compilePattern(needle, op);
          return (r) => {
            const s = text(r);
            return s !== null && re.test(s);
          };
        }
        const negate = op.startsWith('doesNot');
        const hit = op === 'contains' || op === 'doesNotContain' ? (s: string) => s.includes(needle) : op === 'startsWith' || op === 'doesNotStartWith' ? (s: string) => s.startsWith(needle) : (s: string) => s.endsWith(needle);
        // Null cells match neither the operator nor its negation.
        return (r) => {
          const s = text(r);
          return s !== null && hit(s) !== negate;
        };
      }
    }
    const key = (v: unknown): string | number | null => {
      if (v == null) return null;
      switch (type) {
        case 'number':
          return typeof v === 'number' ? v : v === '' ? Number.NaN : Number(v);
        case 'date':
          return dayKey(v);
        case 'datetime':
          return toTime(v);
        case 'boolean':
          return boolKey(v);
        default:
          return fold(String(v), ignoreCase, ignoreAccent);
      }
    };
    const bad = (k: string | number | null): boolean => k === null || (typeof k === 'number' && Number.isNaN(k));
    switch (op) {
      case 'equal':
      case 'notEqual': {
        const t = key(target);
        const negate = op === 'notEqual';
        return (r) => {
          const v = get(r);
          return (t === null ? isNull(v) : key(v) === t) !== negate;
        };
      }
      case 'in':
      case 'notIn': {
        const list = Array.isArray(target) ? target : [target];
        const set = new Set<string | number>();
        let blanks = false;
        for (const v of list) {
          const k = key(v);
          if (k === null || k === '') blanks = true;
          if (k !== null) set.add(k);
        }
        const negate = op === 'notIn';
        return (r) => {
          const v = get(r);
          const blank = v === null || v === undefined || v === '';
          return (blank ? blanks : set.has(key(v) as string | number)) !== negate;
        };
      }
      case 'between': {
        const pair = Array.isArray(target) ? target : [];
        const lo = key(pair[0]);
        const hi = key(pair[1]);
        return (r) => {
          const k = key(get(r));
          return !bad(k) && (lo === null || (k as number) >= (lo as number)) && (hi === null || (k as number) <= (hi as number));
        };
      }
      default: {
        const t = key(target);
        if (bad(t)) return () => false;
        return (r) => {
          const k = key(get(r));
          if (bad(k)) return false;
          const a = k as number;
          const b = t as number;
          return op === 'greaterThan' ? a > b : op === 'greaterThanOrEqual' ? a >= b : op === 'lessThan' ? a < b : a <= b;
        };
      }
    }
  };
  const test = compile(value);
  return test ? rows.filter((r) => test(r)) : rows.slice();
}
