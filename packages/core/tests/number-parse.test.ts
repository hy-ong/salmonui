// parseNumber: locale fixtures round-trip
// through Intl.NumberFormat.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseNumber } from '@salmonui/core/format';

describe('parseNumber', () => {
  it('reads group and decimal symbols per locale', () => {
    assert.equal(parseNumber('1,234.5'), 1234.5);
    assert.equal(parseNumber('1.234,5', { locale: 'de-DE' }), 1234.5);
    assert.equal(parseNumber('12,5', { locale: 'de-DE' }), 12.5);
    assert.equal(parseNumber('1 234,5', { locale: 'fr-FR' }), 1234.5);
    assert.equal(parseNumber('12,34,567.8', { locale: 'en-IN' }), 1234567.8);
    assert.equal(parseNumber("1'234.5", { locale: 'de-CH' }), 1234.5);
  });

  it('round-trips formatted text, including currency, percent and negatives', () => {
    const cases: [string, Intl.NumberFormatOptions | undefined, number][] = [
      ['en-US', { style: 'currency', currency: 'USD' }, -1234.56],
      ['de-DE', { style: 'currency', currency: 'EUR' }, 9876.5],
      ['ja-JP', { style: 'currency', currency: 'JPY' }, 1200],
      ['en-US', { style: 'percent', maximumFractionDigits: 2 }, 0.1234],
      ['fr-FR', { style: 'percent' }, 0.5],
      ['sv-SE', undefined, -42.25],
      ['ar-EG', undefined, 1234.5],
      ['hi-IN-u-nu-deva', undefined, 4321],
    ];
    for (const [locale, formatOptions, value] of cases) {
      const text = new Intl.NumberFormat(locale, formatOptions).format(value);
      const parsed = parseNumber(text, formatOptions ? { locale, formatOptions } : { locale });
      assert.ok(parsed !== null && Math.abs(parsed - value) < 1e-9, `${locale} ${text} -> ${parsed}`);
    }
  });

  it('accepts ASCII forms, accounting parentheses; empty is null and junk is NaN', () => {
    assert.equal(parseNumber('-3,5', { locale: 'de-DE' }), -3.5);
    assert.equal(parseNumber('3.5', { locale: 'fr-FR' }), 3.5);
    assert.equal(parseNumber('(12)'), -12);
    assert.equal(parseNumber('  '), null);
    assert.ok(Number.isNaN(parseNumber('12abc') as number));
    assert.ok(Number.isNaN(parseNumber('1.2.3') as number));
  });
});
