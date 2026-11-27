// Calculated field formulas: a
// small recursive-descent parser compiled to closures. Strict-CSP safe: the
// formula is never evaluated as code (no eval, no Function constructor).
//
// Grammar (lowest to highest precedence): `||` / `&&` / comparison
// (`=` `==` `!=` `<>` `<` `<=` `>` `>=`) / `+ -` / `* / %` / `^` (right
// associative) / unary `- + !` / primary. Primaries: numbers, `TRUE`,
// `FALSE`, `PI`, parentheses, function calls and measure references written
// `"Sum(Amount)"` (quoted) or `Sum(Amount)`.
import type { PivotAggregate } from './types.js';

export class PivotFormulaError extends Error {
  /** Zero-based character offset of the error in the formula. */
  readonly position: number;
  constructor(message: string, position: number) {
    super(`${message} at position ${position}`);
    this.name = 'PivotFormulaError';
    this.position = position;
  }
}

export interface PivotFormulaReference {
  readonly aggregate: PivotAggregate;
  readonly field: string;
}

export interface CompiledFormula {
  readonly formula: string;
  /** Measures the formula reads, deduplicated, in order of appearance. */
  readonly references: readonly PivotFormulaReference[];
  evaluate(get: (aggregate: PivotAggregate, field: string) => number | null): number | null;
}

type V = number | null;
type Get = (aggregate: PivotAggregate, field: string) => V;
type Fn = (get: Get) => V;

const AGGREGATES: Readonly<Record<string, PivotAggregate>> = {
  sum: 'sum',
  product: 'product',
  count: 'count',
  distinctcount: 'distinctCount',
  min: 'min',
  max: 'max',
  avg: 'average',
  average: 'average',
  median: 'median',
  populationstdev: 'populationStdev',
  samplestdev: 'sampleStdev',
  populationvar: 'populationVar',
  samplevar: 'sampleVar',
};

const num = (f: (...a: number[]) => number) => (args: V[]): V => {
  for (const a of args) if (a === null) return null;
  const r = f(...(args as number[]));
  return Number.isFinite(r) ? r : null;
};
const truthy = (v: V) => v !== null && v !== 0 && !Number.isNaN(v);
const FUNCTIONS: Readonly<Record<string, [min: number, max: number, fn: (args: V[]) => V]>> = {
  abs: [1, 1, num(Math.abs)],
  min: [1, 99, num(Math.min)],
  max: [1, 99, num(Math.max)],
  round: [1, 2, num((x, d = 0) => Math.round(x * 10 ** d) / 10 ** d)],
  ceiling: [1, 1, num(Math.ceil)],
  ceil: [1, 1, num(Math.ceil)],
  floor: [1, 1, num(Math.floor)],
  trunc: [1, 1, num(Math.trunc)],
  sqrt: [1, 1, num(Math.sqrt)],
  power: [2, 2, num(Math.pow)],
  pow: [2, 2, num(Math.pow)],
  exp: [1, 1, num(Math.exp)],
  log: [1, 2, num((x, b) => (b === undefined ? Math.log(x) : Math.log(x) / Math.log(b)))],
  log10: [1, 1, num(Math.log10)],
  sin: [1, 1, num(Math.sin)],
  cos: [1, 1, num(Math.cos)],
  tan: [1, 1, num(Math.tan)],
  asin: [1, 1, num(Math.asin)],
  acos: [1, 1, num(Math.acos)],
  atan: [1, 1, num(Math.atan)],
  sign: [1, 1, num(Math.sign)],
  and: [1, 99, (a) => (a.every(truthy) ? 1 : 0)],
  or: [1, 99, (a) => (a.some(truthy) ? 1 : 0)],
  not: [1, 1, (a) => (truthy(a[0]!) ? 0 : 1)],
};

const BINARY: Readonly<Record<string, (a: number, b: number) => number | boolean>> = {
  '+': (a, b) => a + b,
  '-': (a, b) => a - b,
  '*': (a, b) => a * b,
  '/': (a, b) => a / b,
  '%': (a, b) => a % b,
  '^': (a, b) => a ** b,
  '=': (a, b) => a === b,
  '==': (a, b) => a === b,
  '!=': (a, b) => a !== b,
  '<>': (a, b) => a !== b,
  '<': (a, b) => a < b,
  '<=': (a, b) => a <= b,
  '>': (a, b) => a > b,
  '>=': (a, b) => a >= b,
};
const LEVELS = [['||'], ['&&'], ['=', '==', '!=', '<>', '<', '<=', '>', '>='], ['+', '-'], ['*', '/', '%']];
const OPERATORS = ['||', '&&', '==', '!=', '<>', '<=', '>=', '=', '<', '>', '+', '-', '*', '/', '%', '^', '!', '(', ')', ','];

interface Token {
  readonly t: 'num' | 'id' | 'str' | 'op' | 'end';
  readonly v: string;
  readonly at: number;
}

function tokenize(src: string): Token[] {
  const out: Token[] = [];
  let i = 0;
  while (i < src.length) {
    const ch = src[i]!;
    if (/\s/.test(ch)) {
      i++;
      continue;
    }
    const at = i;
    let m: RegExpExecArray | null;
    if ((m = /^(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?/.exec(src.slice(i)))) {
      out.push({ t: 'num', v: m[0], at });
      i += m[0].length;
    } else if ((m = /^[A-Za-z_][\w.]*/.exec(src.slice(i)))) {
      out.push({ t: 'id', v: m[0], at });
      i += m[0].length;
    } else if (ch === '"' || ch === "'") {
      const end = src.indexOf(ch, i + 1);
      if (end === -1) throw new PivotFormulaError('Unterminated quoted reference', at);
      out.push({ t: 'str', v: src.slice(i + 1, end), at });
      i = end + 1;
    } else {
      const op = OPERATORS.find((o) => src.startsWith(o, i));
      if (!op) throw new PivotFormulaError(`Unexpected character "${ch}"`, at);
      out.push({ t: 'op', v: op, at });
      i += op.length;
    }
  }
  out.push({ t: 'end', v: '', at: src.length });
  return out;
}

/**
 * Compiles a calculated field formula. `fields` are the source field names a
 * reference may name (an empty list accepts any field). Throws
 * `PivotFormulaError` with the offending position.
 */
export function compileFormula(formula: string, fields: readonly string[] = []): CompiledFormula {
  const tokens = tokenize(formula);
  const known = new Set(fields);
  const refs = new Map<string, PivotFormulaReference>();
  let p = 0;
  const peek = () => tokens[p]!;
  const isOp = (v: string) => peek().t === 'op' && peek().v === v;
  const expect = (v: string) => {
    if (!isOp(v)) throw new PivotFormulaError(peek().t === 'end' ? `Expected "${v}" before the end` : `Expected "${v}"`, peek().at);
    p++;
  };

  const reference = (aggName: string, field: string, at: number): Fn => {
    const aggregate = AGGREGATES[aggName.toLowerCase()];
    if (!aggregate) throw new PivotFormulaError(`Unknown aggregate "${aggName}"`, at);
    const f = field.trim();
    if (!f) throw new PivotFormulaError('Missing field name', at);
    if (known.size && !known.has(f)) throw new PivotFormulaError(`Unknown field "${f}"`, at);
    refs.set(`${aggregate}\u0000${f}`, { aggregate, field: f });
    return (get) => get(aggregate, f);
  };

  const binary = (level: number): Fn => {
    if (level === LEVELS.length) return power();
    let left = binary(level + 1);
    for (;;) {
      const tok = peek();
      if (tok.t !== 'op' || !LEVELS[level]!.includes(tok.v)) return left;
      p++;
      const right = binary(level + 1);
      const a = left;
      if (tok.v === '||') left = (g) => (truthy(a(g)) || truthy(right(g)) ? 1 : 0);
      else if (tok.v === '&&') left = (g) => (truthy(a(g)) && truthy(right(g)) ? 1 : 0);
      else {
        const fn = BINARY[tok.v]!;
        left = (g) => {
          const x = a(g);
          const y = right(g);
          if (x === null || y === null) return null;
          const r = fn(x, y);
          return typeof r === 'boolean' ? (r ? 1 : 0) : Number.isFinite(r) ? r : null;
        };
      }
    }
  };

  const power = (): Fn => {
    const base = unary();
    if (!isOp('^')) return base;
    p++;
    const exp = unaryPower();
    return (g) => {
      const x = base(g);
      const y = exp(g);
      if (x === null || y === null) return null;
      const r = x ** y;
      return Number.isFinite(r) ? r : null;
    };
  };
  const unaryPower = (): Fn => power();

  const unary = (): Fn => {
    if (isOp('-') || isOp('+') || isOp('!')) {
      const op = peek().v;
      p++;
      const inner = unary();
      if (op === '+') return inner;
      if (op === '!') return (g) => (truthy(inner(g)) ? 0 : 1);
      return (g) => {
        const v = inner(g);
        return v === null ? null : -v;
      };
    }
    return primary();
  };

  const primary = (): Fn => {
    const tok = peek();
    if (tok.t === 'num') {
      p++;
      const v = Number(tok.v);
      return () => v;
    }
    if (tok.t === 'str') {
      p++;
      const m = /^\s*([A-Za-z]+)\s*\(([\s\S]*)\)\s*$/.exec(tok.v);
      if (!m) throw new PivotFormulaError(`Expected a reference like "Sum(Field)", found "${tok.v}"`, tok.at);
      return reference(m[1]!, m[2]!, tok.at);
    }
    if (isOp('(')) {
      p++;
      const inner = binary(0);
      expect(')');
      return inner;
    }
    if (tok.t === 'id') {
      p++;
      const name = tok.v.toLowerCase();
      if (!isOp('(')) {
        if (name === 'true') return () => 1;
        if (name === 'false') return () => 0;
        if (name === 'pi') return () => Math.PI;
        throw new PivotFormulaError(`Unknown name "${tok.v}"`, tok.at);
      }
      // `Sum(Amount)`: an aggregate applied to a bare field name is a reference.
      const a = tokens[p + 1];
      const b = tokens[p + 2];
      if (AGGREGATES[name] && a?.t === 'id' && b?.t === 'op' && b.v === ')' && (!FUNCTIONS[name] || !known.size || known.has(a.v))) {
        p += 3;
        return reference(tok.v, a.v, tok.at);
      }
      p++;
      const args: Fn[] = [];
      if (!isOp(')')) {
        args.push(binary(0));
        while (isOp(',')) p++, args.push(binary(0));
      }
      expect(')');
      if (name === 'if') {
        if (args.length < 2 || args.length > 3) throw new PivotFormulaError('IF expects 2 or 3 arguments', tok.at);
        const [c, t, e] = args as [Fn, Fn, Fn | undefined];
        return (g) => (truthy(c(g)) ? t(g) : e ? e(g) : null);
      }
      const spec = FUNCTIONS[name];
      if (!spec) throw new PivotFormulaError(`Unknown function "${tok.v}"`, tok.at);
      if (args.length < spec[0] || args.length > spec[1]) throw new PivotFormulaError(`${tok.v.toUpperCase()} expects ${spec[0] === spec[1] ? spec[0] : `${spec[0]} to ${spec[1]}`} arguments`, tok.at);
      const fn = spec[2];
      return (g) => fn(args.map((x) => x(g)));
    }
    throw new PivotFormulaError(tok.t === 'end' ? 'Unexpected end of formula' : `Unexpected "${tok.v}"`, tok.at);
  };

  if (peek().t === 'end') throw new PivotFormulaError('Empty formula', 0);
  const root = binary(0);
  if (peek().t !== 'end') throw new PivotFormulaError(`Unexpected "${peek().v}"`, peek().at);
  return Object.freeze({
    formula,
    references: Object.freeze([...refs.values()]),
    evaluate: (get: Get) => {
      const v = root(get);
      return v === null || !Number.isFinite(v) ? null : v;
    },
  });
}
