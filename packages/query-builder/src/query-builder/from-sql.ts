// fromSql: reads back the SQL subset `toSql` writes
// (comparisons, `IN`, `BETWEEN`, `LIKE ... ESCAPE '!'`, `IS [NOT] NULL`,
// `AND` / `OR` / `NOT (...)` groups, quoted identifiers and the
// placeholders of every dialect). It only parses: nothing is evaluated, and
// anything outside the subset throws a SqlParseError naming the position.
// Server-safe: no React, no DOM.

import type { Json, QueryGroup, QueryNode, QueryRule } from '@salmonui/core/internal/query/types';

/** Thrown for SQL outside the subset `toSql` writes. */
export class SqlParseError extends SyntaxError {
  /** Offset of the offending token in the SQL text. */
  readonly position: number;
  constructor(message: string, position: number) {
    super(`fromSql: ${message} at ${position}`);
    this.name = 'SqlParseError';
    this.position = position;
  }
}

export interface FromSqlOptions {
  /** Values of the placeholders: an array for positional ones (`?`, `$1`, `@p1`), a record for named ones (`:p1`). */
  readonly params?: readonly Json[] | Readonly<Record<string, Json>>;
  /** Named placeholders (`:name`, `@name`) read from `params` by name. Default false. */
  readonly named?: boolean;
  /** Separator written between path segments (`"a"."b"` becomes `a.b`). Default `'.'`. */
  readonly pathSeparator?: string;
}

type Tok = { readonly t: 'id' | 'kw' | 'str' | 'num' | 'param' | 'op'; readonly v: string; readonly at: number };

const KEYWORDS = new Set(['AND', 'OR', 'NOT', 'IN', 'BETWEEN', 'LIKE', 'ESCAPE', 'IS', 'NULL', 'TRUE', 'FALSE']);
const TOKEN = /\s*(?:('(?:[^']|'')*')|("(?:[^"]|"")*"|`(?:[^`]|``)*`|\[(?:[^\]]|\]\])*\])|(-?\d+(?:\.\d+)?(?:e[+-]?\d+)?)|(\?|\$\d+|[:@][A-Za-z_]\w*)|(<>|!=|>=|<=|[=<>(),.])|([A-Za-z_]\w*))/iy;
const CMP: Readonly<Record<string, string>> = { '=': 'equal', '<>': 'notEqual', '!=': 'notEqual', '>': 'greaterThan', '>=': 'greaterThanOrEqual', '<': 'lessThan', '<=': 'lessThanOrEqual' };

function tokenize(sql: string): Tok[] {
  const out: Tok[] = [];
  TOKEN.lastIndex = 0;
  for (;;) {
    const at = TOKEN.lastIndex;
    if (/^\s*$/.test(sql.slice(at))) return out;
    const m = TOKEN.exec(sql);
    if (!m) throw new SqlParseError('unexpected character', at);
    const p = m.index + m[0].length - (m[1] ?? m[2] ?? m[3] ?? m[4] ?? m[5] ?? m[6] ?? '').length;
    if (m[1]) out.push({ t: 'str', v: m[1].slice(1, -1).replace(/''/g, "'"), at: p });
    else if (m[2]) out.push({ t: 'id', v: m[2].slice(1, -1).replace(/""|``|\]\]/g, (q) => q[0] as string), at: p });
    else if (m[3]) out.push({ t: 'num', v: m[3], at: p });
    else if (m[4]) out.push({ t: 'param', v: m[4], at: p });
    else if (m[5]) out.push({ t: 'op', v: m[5], at: p });
    else {
      const word = m[6] as string;
      out.push(KEYWORDS.has(word.toUpperCase()) ? { t: 'kw', v: word.toUpperCase(), at: p } : { t: 'id', v: word, at: p });
    }
  }
}

/** A LIKE pattern (escape `!`) as an operator and value. */
function likeRule(pattern: string, negate: boolean, at: number): { operator: string; value: string } {
  let text = '';
  const wild: number[] = [];
  let underscore = false;
  for (let i = 0; i < pattern.length; i++) {
    const ch = pattern[i] as string;
    if (ch === '!') text += pattern[++i] ?? '';
    else if (ch === '%' || ch === '_') {
      wild.push(text.length);
      if (ch === '_') underscore = true;
      text += ch === '%' ? '\0' : '\u0001';
    } else text += ch;
  }
  const inner = wild.filter((w) => w !== 0 && w !== text.length - 1);
  if (!underscore && inner.length === 0) {
    const start = text.startsWith('\0');
    const end = text.length > (start ? 1 : 0) && text.endsWith('\0');
    const body = text.slice(start ? 1 : 0, end ? -1 : undefined);
    if (!body.includes('\0')) {
      const op = start && end ? 'contains' : end ? 'startsWith' : start ? 'endsWith' : null;
      if (op) return { operator: negate ? ({ contains: 'doesNotContain', startsWith: 'doesNotStartWith', endsWith: 'doesNotEndWith' } as const)[op] : op, value: body };
    }
  }
  if (negate) throw new SqlParseError('NOT LIKE with an inner wildcard', at);
  // `_` only comes from `wildcard` (`?`); otherwise `%` is a `like` pattern.
  return underscore ? { operator: 'wildcard', value: text.replace(/\0/g, '*').replace(/\u0001/g, '?') } : { operator: 'like', value: text.replace(/\0/g, '%') };
}

/** A SQL WHERE expression written by `toSql` as a Query Builder value. */
export function fromSql(sql: string, options: FromSqlOptions = {}): QueryGroup {
  const toks = tokenize(sql);
  const sep = options.pathSeparator ?? '.';
  const params = options.params;
  let i = 0;
  let positional = 0;
  const peek = (): Tok | undefined => toks[i];
  const fail = (what: string): never => {
    throw new SqlParseError(what, peek()?.at ?? sql.length);
  };
  const is = (t: Tok['t'], v?: string): boolean => peek()?.t === t && (v === undefined || peek()?.v === v);
  const eat = (t: Tok['t'], v?: string): Tok => (is(t, v) ? (toks[i++] as Tok) : fail(`expected ${v ?? t}`));
  const value = (): Json => {
    const tok = toks[i++];
    if (!tok) return fail('expected a value');
    if (tok.t === 'str') return tok.v;
    if (tok.t === 'num') return Number(tok.v);
    if (tok.t === 'kw' && (tok.v === 'TRUE' || tok.v === 'FALSE')) return tok.v === 'TRUE';
    if (tok.t === 'kw' && tok.v === 'NULL') return null;
    if (tok.t === 'param') {
      if (!params) throw new SqlParseError('a placeholder without params', tok.at);
      const named = tok.v !== '?' && !/^\$/.test(tok.v) && (options.named === true || !Array.isArray(params));
      let v: Json | undefined;
      if (named) v = (params as Record<string, Json>)[tok.v.slice(1)];
      else {
        const n = tok.v === '?' ? positional++ : Number(tok.v.replace(/^\D+/, '')) - 1;
        v = (params as readonly Json[])[n];
      }
      if (v === undefined) throw new SqlParseError(`no value for ${tok.v}`, tok.at);
      return v;
    }
    throw new SqlParseError('expected a value', tok.at);
  };
  const field = (): string => {
    const parts = [eat('id').v];
    while (is('op', '.')) {
      i++;
      parts.push(eat('id').v);
    }
    return parts.join(sep);
  };
  const predicate = (): QueryRule => {
    const at = peek()?.at ?? 0;
    const f = field();
    if (is('kw', 'IS')) {
      i++;
      const not = is('kw', 'NOT') ? (i++, true) : false;
      eat('kw', 'NULL');
      return { field: f, operator: not ? 'isNotNull' : 'isNull' };
    }
    const not = is('kw', 'NOT') ? (i++, true) : false;
    if (is('kw', 'IN')) {
      i++;
      eat('op', '(');
      const list = [value()];
      while (is('op', ',')) {
        i++;
        list.push(value());
      }
      eat('op', ')');
      return { field: f, operator: not ? 'notIn' : 'in', value: list };
    }
    if (is('kw', 'LIKE')) {
      i++;
      const pattern = value();
      if (is('kw', 'ESCAPE')) {
        i++;
        if (eat('str').v !== '!') fail("ESCAPE other than '!'");
      }
      if (typeof pattern !== 'string') return fail('a LIKE pattern that is not text');
      return { field: f, ...likeRule(pattern, not, at) };
    }
    if (not) return fail('expected IN or LIKE after NOT');
    if (is('kw', 'BETWEEN')) {
      i++;
      const a = value();
      eat('kw', 'AND');
      return { field: f, operator: 'between', value: [a, value()] };
    }
    const op = peek()?.t === 'op' ? CMP[peek()?.v as string] : undefined;
    if (!op) return fail('expected a comparison');
    i++;
    const literal = peek()?.t === 'str';
    const v = value();
    // toSql writes isEmpty / isNotEmpty as `= ''` / `<> ''`.
    if (literal && v === '' && (op === 'equal' || op === 'notEqual')) return { field: f, operator: op === 'equal' ? 'isEmpty' : 'isNotEmpty' };
    return { field: f, operator: op, value: v };
  };
  const chain = (logic: 'and' | 'or', item: () => QueryNode): QueryNode => {
    const first = item();
    if (!is('kw', logic.toUpperCase())) return first;
    const filters = [first];
    while (is('kw', logic.toUpperCase())) {
      i++;
      filters.push(item());
    }
    return { logic, filters };
  };
  const group = (inner: QueryNode): QueryGroup => ('filters' in inner && !inner.not ? inner : { logic: 'and', filters: [inner] });
  const unary = (): QueryNode => {
    if (is('kw', 'NOT')) {
      i++;
      eat('op', '(');
      const g = group(or());
      eat('op', ')');
      return { ...g, not: true };
    }
    if (is('op', '(')) {
      i++;
      const inner = or();
      eat('op', ')');
      return inner;
    }
    return predicate();
  };
  const and = (): QueryNode => chain('and', unary);
  const or = (): QueryNode => chain('or', and);
  if (toks.length === 0) return { logic: 'and', filters: [] };
  const root = or();
  if (i < toks.length) fail('unexpected token');
  return 'filters' in root ? root : { logic: 'and', filters: [root] };
}
