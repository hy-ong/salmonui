// `@salmonui/query-builder/mongo`: a
// Query Builder value as a MongoDB filter document and back. Server-safe:
// no React, no DOM, no component code.
//
// toMongo: groups are `$and` / `$or`; a negated OR group is `$nor`, a
// negated AND group `$nor: [{ $and }]`. Text operators are anchored,
// escaped `$regex` with `$options: 'i'` unless `matchCase`; negated text
// operators use `$not`. Values pass through as given (dates stay ISO strings
// or epoch numbers).
//
// fromMongo reads the subset toMongo writes plus implicit equality: `$and`,
// `$or`, `$nor`, `$eq`, `$ne`, `$gt`, `$gte`, `$lt`, `$lte`, `$in`, `$nin`,
// `$regex` of escaped literals (contains, startsWith, endsWith, equal; with
// `$options`, also under `$not`) and `$exists`. Other patterns (the ones
// `like` / `wildcard` write) are not read back. Anything
// else throws a TypeError naming the operator and its path.

import { escapeRegExp, foldQuery, listOf, rangeOf } from '../internal/query/convert.js';
import type { Json, QueryGroup, QueryNode, QueryRule } from '@salmonui/core/internal/query/types';

export type { Json, QueryGroup, QueryNode, QueryRule } from '@salmonui/core/internal/query/types';

export type MongoFilter = { [key: string]: unknown };

export interface MongoOperatorContext {
  /** The dotted field path. */
  readonly field: string;
  readonly rule: QueryRule;
  readonly value: Json | undefined;
}

export interface ToMongoOptions {
  /** Filter documents of custom operators; they also override built-ins. */
  readonly operators?: Readonly<Record<string, (ctx: MongoOperatorContext) => MongoFilter>>;
  /** Separator of nested field paths in the value; written as Mongo dots. Default `'.'`. */
  readonly pathSeparator?: string;
}

const COMPARE: Readonly<Record<string, string>> = {
  equal: '$eq', notEqual: '$ne', greaterThan: '$gt', greaterThanOrEqual: '$gte', lessThan: '$lt', lessThanOrEqual: '$lte', in: '$in', notIn: '$nin',
};
type Pattern = (v: string) => string;
const lit = (v: string): string => escapeRegExp(v);
const like: Pattern = (v) => `^${v.split(/[%*]/).map(lit).join('.*')}$`;
const wildcard: Pattern = (v) => `^${v.split('*').map((p) => p.split('?').map(lit).join('.')).join('.*')}$`;
const TEXT: Readonly<Record<string, readonly [boolean, Pattern]>> = {
  contains: [false, lit],
  doesNotContain: [true, lit],
  startsWith: [false, (v) => `^${lit(v)}`],
  doesNotStartWith: [true, (v) => `^${lit(v)}`],
  endsWith: [false, (v) => `${lit(v)}$`],
  doesNotEndWith: [true, (v) => `${lit(v)}$`],
  like: [false, like],
  wildcard: [false, wildcard],
};

/** A Query Builder value as a MongoDB filter document (`{}` for an empty query). */
export function toMongo(value: QueryGroup, options: ToMongoOptions = {}): MongoFilter {
  const separator = options.pathSeparator ?? '.';
  const out = foldQuery<MongoFilter>(
    value,
    (rule, op) => {
      const field = separator === '.' ? rule.field : rule.field.split(separator).join('.');
      const custom = options.operators?.[op] ?? options.operators?.[rule.operator];
      if (custom) return custom({ field, rule, value: rule.value });
      const v = rule.value;
      switch (op) {
        case 'isNull':
          return { [field]: null };
        case 'isNotNull':
          return { [field]: { $ne: null } };
        case 'isEmpty':
          return { [field]: '' };
        case 'isNotEmpty':
          return { [field]: { $ne: '' } };
        case 'between': {
          const [a, b] = rangeOf(rule);
          return { [field]: { $gte: a, $lte: b } };
        }
        case 'in':
        case 'notIn':
          return { [field]: { [COMPARE[op] as string]: listOf(rule) } };
      }
      const cmp = COMPARE[op];
      if (cmp) return { [field]: { [cmp]: v ?? null } };
      const text = TEXT[op];
      if (text) {
        const regex = { $regex: text[1](String(v ?? '')), ...(rule.matchCase ? {} : { $options: 'i' }) };
        return { [field]: text[0] ? { $not: regex } : regex };
      }
      throw new TypeError(`toMongo: no filter for operator "${rule.operator}"`);
    },
    (group, members) => {
      if (group.not) return { $nor: group.logic === 'or' ? members : [{ $and: members }] };
      return { [group.logic === 'or' ? '$or' : '$and']: members };
    },
  );
  return out ?? {};
}

export interface FromMongoOptions {
  /** Separator written between path segments of nested fields. Default `'.'`. */
  readonly pathSeparator?: string;
}

const FROM_COMPARE: Readonly<Record<string, string>> = Object.fromEntries(Object.entries(COMPARE).map(([k, v]) => [v, k]));

const unsupported = (op: string, path: string): TypeError => new TypeError(`fromMongo: unsupported operator "${op}" at ${path || '/'}`);

const isPlain = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v) && !(v instanceof Date) && !(v instanceof RegExp);

/** Literal text of an escaped RegExp source, or null when it has unescaped metacharacters. */
function literalOf(source: string): string | null {
  let out = '';
  for (let i = 0; i < source.length; i++) {
    const ch = source[i] as string;
    if (ch === '\\') {
      const next = source[++i];
      if (next === undefined || /[A-Za-z0-9]/.test(next)) return null;
      out += next;
    } else if ('.*+?^$()[]{}|'.includes(ch)) return null;
    else out += ch;
  }
  return out;
}

/** `$regex` (+ `$options`) as a text rule. */
function regexRule(field: string, pattern: unknown, options: unknown, negate: boolean, path: string): QueryRule {
  let source: string;
  let flags = typeof options === 'string' ? options : '';
  if (pattern instanceof RegExp) {
    source = pattern.source;
    flags += pattern.flags;
  } else if (typeof pattern === 'string') source = pattern;
  else throw unsupported('$regex', path);
  if (/[^i]/.test(flags.replace(/[gsu]/g, ''))) throw unsupported(`$options: ${flags}`, path);
  const matchCase = !flags.includes('i');
  const start = source.startsWith('^');
  const end = source.endsWith('$') && !source.endsWith('\\$');
  const body = source.slice(start ? 1 : 0, end ? -1 : undefined);
  const base = { field, ...(matchCase ? { matchCase: true } : {}) };
  const text = literalOf(body);
  if (text !== null) {
    const op = start && end ? 'equal' : start ? 'startsWith' : end ? 'endsWith' : 'contains';
    if (negate) {
      if (op === 'equal') return { ...base, operator: 'notEqual', value: text };
      return { ...base, operator: { contains: 'doesNotContain', startsWith: 'doesNotStartWith', endsWith: 'doesNotEndWith' }[op] as string, value: text };
    }
    return { ...base, operator: op, value: text };
  }
  throw unsupported(`$regex: /${source}/`, path);
}

function fieldRules(field: string, raw: unknown, path: string): QueryNode[] {
  if (!isPlain(raw)) {
    if (raw === null) return [{ field, operator: 'isNull' }];
    if (raw instanceof RegExp) return [regexRule(field, raw, '', false, path)];
    if (Array.isArray(raw)) throw unsupported('array equality', path);
    return [{ field, operator: 'equal', value: (raw instanceof Date ? raw.toISOString() : raw) as Json }];
  }
  const keys = Object.keys(raw);
  if (keys.some((k) => !k.startsWith('$'))) throw unsupported('embedded document equality', path);
  if (keys.length === 2 && '$gte' in raw && '$lte' in raw) return [{ field, operator: 'between', value: [raw['$gte'], raw['$lte']] as Json }];
  const out: QueryNode[] = [];
  for (const key of keys) {
    const v = raw[key];
    if (key === '$options') {
      if (!('$regex' in raw)) throw unsupported(key, path);
      continue;
    }
    if (key === '$regex') out.push(regexRule(field, v, raw['$options'], false, path));
    else if (key === '$not') {
      if (!isPlain(v) || !('$regex' in v) && !(v instanceof RegExp)) throw unsupported('$not', path);
      out.push(regexRule(field, v['$regex'], v['$options'], true, path));
    } else if (key === '$exists') out.push({ field, operator: v ? 'isNotNull' : 'isNull' });
    else if (FROM_COMPARE[key]) {
      if ((key === '$eq' || key === '$ne') && v === null) out.push({ field, operator: key === '$eq' ? 'isNull' : 'isNotNull' });
      else if ((key === '$in' || key === '$nin') && !Array.isArray(v)) throw unsupported(key, path);
      else out.push({ field, operator: FROM_COMPARE[key] as string, value: v as Json });
    } else throw unsupported(key, path);
  }
  return out;
}

function nodesOf(query: unknown, path: string, separator: string): QueryNode[] {
  if (!isPlain(query)) throw unsupported('non-document', path);
  const out: QueryNode[] = [];
  for (const [key, raw] of Object.entries(query)) {
    const at = path ? `${path}.${key}` : key;
    if (key === '$and' || key === '$or' || key === '$nor') {
      if (!Array.isArray(raw)) throw unsupported(key, at);
      const members = raw.map((q, i) => {
        const nodes = nodesOf(q, `${at}[${i}]`, separator);
        return nodes.length === 1 ? (nodes[0] as QueryNode) : { logic: 'and' as const, filters: nodes };
      });
      out.push({ logic: key === '$and' ? 'and' : 'or', ...(key === '$nor' ? { not: true } : {}), filters: members });
    } else if (key.startsWith('$')) throw unsupported(key, at);
    else out.push(...fieldRules(separator === '.' ? key : key.split('.').join(separator), raw, at));
  }
  return out;
}

/** A MongoDB filter document (the subset above) as a Query Builder value. */
export function fromMongo(query: MongoFilter, options: FromMongoOptions = {}): QueryGroup {
  const nodes = nodesOf(query, '', options.pathSeparator ?? '.');
  // A single top-level group is the root.
  if (nodes.length === 1 && 'filters' in (nodes[0] as QueryNode)) return nodes[0] as QueryGroup;
  return { logic: 'and', filters: nodes };
}
