// Row predicates of `query.where` shared by the reference handlers
// (`createJsonQueryHandler`, `createPivotQueryHandler`). Internal module.

import type { WireCondition, WirePredicate, WireType } from './protocol.js';
import type { Json } from './types.js';

type Obj = Record<string, unknown>;

export const fold = (s: string, matchCase: boolean, ignoreAccent: boolean): string => {
  let out = matchCase ? s : s.toLowerCase();
  if (ignoreAccent) out = out.normalize('NFD').replace(/[̀-ͯ]/g, '');
  return out;
};

export function likeToRegExp(pattern: string, wildcard: boolean): RegExp {
  let source = '';
  for (const ch of pattern) {
    if (ch === '*' || (!wildcard && ch === '%')) source += '[\\s\\S]*';
    else if (wildcard && ch === '?') source += '[\\s\\S]';
    else source += ch.replace(/[.+^${}()|[\]\\?*]/g, '\\$&');
  }
  return new RegExp(`^${source}$`, 's');
}

export const isBlank = (v: unknown): boolean => v === null || v === undefined || v === '';

/** Row predicates of `query.where` (shared by the reference handlers). */
export function predicates(typeOf: (field: string) => WireType): { comparable: (field: string, v: unknown) => unknown; compile: (p: WirePredicate) => (row: Obj) => boolean } {
  const comparable = (field: string, v: unknown): unknown => {
    if (v instanceof Date) return v.getTime();
    if (typeof v === 'string' && typeOf(field) === 'date') {
      const t = Date.parse(v);
      return Number.isNaN(t) ? v : t;
    }
    return v;
  };

  const compile = (p: WirePredicate): ((row: Obj) => boolean) => {
    if ('and' in p) {
      const parts = p.and.map(compile);
      return (row) => parts.every((f) => f(row));
    }
    if ('or' in p) {
      const parts = p.or.map(compile);
      return (row) => parts.some((f) => f(row));
    }
    if ('not' in p) {
      const inner = compile(p.not);
      return (row) => !inner(row);
    }
    return condition(p);
  };

  const condition = (c: WireCondition): ((row: Obj) => boolean) => {
    const { field } = c;
    const matchCase = c.matchCase ?? false;
    const accent = c.ignoreAccent ?? false;
    const text = (v: unknown): string => fold(v === null || v === undefined ? '' : String(v), matchCase, accent);
    const value = c.value;
    const cmp = (row: Obj): number => {
      const a = comparable(field, row[field]);
      const b = comparable(field, value);
      if (typeof a === 'string' && typeof b === 'string') return text(a) < text(b) ? -1 : text(a) > text(b) ? 1 : 0;
      return (a as number) < (b as number) ? -1 : (a as number) > (b as number) ? 1 : 0;
    };
    const eq = (row: Obj, v: unknown): boolean => {
      const a = comparable(field, row[field]);
      const b = comparable(field, v);
      if (typeof a === 'string' && typeof b === 'string') return text(a) === text(b);
      return a === b;
    };
    switch (c.op) {
      case 'equal':
        return (row) => eq(row, value);
      case 'notEqual':
        return (row) => !eq(row, value);
      case 'contains':
        return (row) => text(row[field]).includes(text(value));
      case 'doesNotContain':
        return (row) => !text(row[field]).includes(text(value));
      case 'startsWith':
        return (row) => text(row[field]).startsWith(text(value));
      case 'doesNotStartWith':
        return (row) => !text(row[field]).startsWith(text(value));
      case 'endsWith':
        return (row) => text(row[field]).endsWith(text(value));
      case 'doesNotEndWith':
        return (row) => !text(row[field]).endsWith(text(value));
      case 'isEmpty':
        return (row) => isBlank(row[field]);
      case 'isNotEmpty':
        return (row) => !isBlank(row[field]);
      case 'isNull':
        return (row) => row[field] === null || row[field] === undefined;
      case 'isNotNull':
        return (row) => row[field] !== null && row[field] !== undefined;
      case 'greaterThan':
        return (row) => row[field] != null && cmp(row) > 0;
      case 'greaterThanOrEqual':
        return (row) => row[field] != null && cmp(row) >= 0;
      case 'lessThan':
        return (row) => row[field] != null && cmp(row) < 0;
      case 'lessThanOrEqual':
        return (row) => row[field] != null && cmp(row) <= 0;
      case 'between': {
        const [lo, hi] = value as [unknown, unknown];
        const ge = condition({ field, op: 'greaterThanOrEqual', value: lo as Json, matchCase, ignoreAccent: accent });
        const le = condition({ field, op: 'lessThanOrEqual', value: hi as Json, matchCase, ignoreAccent: accent });
        return (row) => ge(row) && le(row);
      }
      case 'in':
      case 'notIn': {
        const list = (Array.isArray(value) ? value : [value]) as unknown[];
        const want = c.op === 'in';
        return (row) => list.some((v) => eq(row, v)) === want;
      }
      case 'like':
      case 'wildcard': {
        const re = likeToRegExp(text(value), c.op === 'wildcard');
        return (row) => re.test(text(row[field]));
      }
      default:
        throw new Error(`unsupported operator "${c.op}"`);
    }
  };

  return { comparable, compile };
}
