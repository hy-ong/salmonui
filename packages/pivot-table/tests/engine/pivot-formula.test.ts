// Calculated field formula parser (engine half):
// `@salmonui/pivot-table/engine/formula`, CSP-safe.
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { compileFormula, PivotFormulaError } from '@salmonui/pivot-table/engine/formula';

const FIELDS = ['Amount', 'Units', 'Country', 'Sold Amount'];
const MEASURES: Record<string, number | null> = { 'sum:Amount': 1200, 'sum:Units': 30, 'count:Country': 4, 'average:Amount': 300, 'min:Amount': 10, 'max:Amount': 900, 'sum:Sold Amount': 5, 'sum:Empty': null };
const ev = (formula: string, fields = FIELDS) => compileFormula(formula, fields).evaluate((agg, field) => MEASURES[`${agg}:${field}`] ?? null);

describe('compileFormula', () => {
  it('evaluates arithmetic with precedence, unary operators and right-associative powers', () => {
    assert.equal(ev('1 + 2 * 3'), 7);
    assert.equal(ev('(1 + 2) * 3'), 9);
    assert.equal(ev('2 ^ 3 ^ 2'), 512);
    assert.equal(ev('-2 ^ 2'), 4);
    assert.equal(ev('10 % 4 - -1'), 3);
    assert.equal(ev('+.5 * 4e1'), 20);
    assert.equal(ev('!0 + !5'), 1);
  });

  it('reads measures written "Agg(Field)" or Agg(Field), case-insensitively', () => {
    assert.equal(ev('"Sum(Amount)" / "Sum(Units)"'), 40);
    assert.equal(ev('sum(Amount) / SUM(Units)'), 40);
    assert.equal(ev("'Avg(Amount)' + \"Count(Country)\""), 304);
    assert.equal(ev('"Sum(Sold Amount)" * 2'), 10);
    assert.equal(ev('Min(Amount) + Max(Amount)'), 910);
    assert.deepEqual(compileFormula('"Sum(Amount)" + Sum(Amount) * "Avg(Amount)"', FIELDS).references, [
      { aggregate: 'sum', field: 'Amount' },
      { aggregate: 'average', field: 'Amount' },
    ]);
  });

  it('comparisons, IF, AND, OR, NOT and the math functions', () => {
    assert.equal(ev('"Sum(Amount)" > 1000'), 1);
    assert.equal(ev('1 = 1 && 2 <> 3 && 2 != 2 || 4 >= 4'), 1);
    assert.equal(ev('IF("Sum(Units)" < 10, 1, 2)'), 2);
    assert.equal(ev('IF(0, 1)'), null);
    assert.equal(ev('AND(1, 2, 0)'), 0);
    assert.equal(ev('OR(0, 0, 3)'), 1);
    assert.equal(ev('NOT(0)'), 1);
    assert.equal(ev('ABS(-3) + MIN(4, 2, 8) + MAX(1, 9)'), 14);
    assert.equal(ev('ROUND(2.345, 2)'), 2.35);
    assert.equal(ev('ROUND(2.5)'), 3);
    assert.equal(ev('CEILING(1.2) + FLOOR(1.8) + TRUNC(-1.5) + SIGN(-4)'), 1);
    assert.equal(ev('SQRT(16) + POWER(2, 3) + POW(3, 2) + LOG10(100) + LOG(8, 2)'), 26);
    assert.ok(Math.abs(ev('EXP(1) + LOG(1) + SIN(0) + COS(0) + TAN(0) + ASIN(0) + ACOS(1) + ATAN(0) + PI - TRUE - FALSE')! - (Math.E + 1 + Math.PI - 1)) < 1e-12);
  });

  it('propagates empty measures and returns empty for non-finite results', () => {
    assert.equal(ev('"Sum(Empty)" + 1', []), null);
    assert.equal(ev('1 / 0'), null);
    assert.equal(ev('IF("Sum(Empty)", 1, 2)', []), 2);
    assert.equal(ev('SQRT(-1)'), null);
  });

  it('accepts any field when no field list is given', () => {
    assert.equal(ev('Sum(Units) + 1', []), 31);
  });

  it('throws PivotFormulaError with the offending position', () => {
    const at = (formula: string, position: number, message: RegExp) =>
      assert.throws(
        () => compileFormula(formula, FIELDS),
        (e: unknown) => e instanceof PivotFormulaError && e.position === position && message.test(e.message),
        formula,
      );
    at('', 0, /Empty formula/);
    at('1 +', 3, /Unexpected end/);
    at('(1 + 2', 6, /Expected "\)" before the end/);
    at('1 2', 2, /Unexpected "2"/);
    at('1 # 2', 2, /Unexpected character "#"/);
    at('"Sum(Amount)', 0, /Unterminated/);
    at('"Amount" + 1', 0, /Expected a reference/);
    at('2 * "Total(Amount)"', 4, /Unknown aggregate "Total"/);
    at('Sum(Price)', 0, /Unknown field "Price"/);
    at('FOO(1)', 0, /Unknown function "FOO"/);
    at('x + 1', 0, /Unknown name "x"/);
    at('1 + ABS(1, 2)', 4, /ABS expects 1 arguments/);
    at('IF(1)', 0, /IF expects 2 or 3 arguments/);
  });

  it('is strict-CSP safe: no eval or Function constructor anywhere in the pivot engine', () => {
    const dir = new URL('../../dist/engine/', import.meta.url);
    for (const file of readdirSync(dir).filter((f) => f.endsWith('.js'))) {
      const src = readFileSync(new URL(file, dir), 'utf8');
      assert.doesNotMatch(src, /\beval\s*\(|new\s+Function\b|\bFunction\s*\(/, file);
    }
  });
});
