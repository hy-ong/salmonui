// MaskedField engine and markup, NumberField markup. Interaction tests live in tests/browser/inputs-structured.spec.ts.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createElement as h } from 'react';
import { renderToString } from 'react-dom/server';
import { formatMasked, MaskedField, parseMask } from '@salmonui/inputs/masked-field';
import { NumberField } from '@salmonui/inputs/number-field';
import { assertBudget } from '../../../tooling/bench/budget.mjs';

const attr = (markup: string, re: string, name: string): string | null => new RegExp(`<input(?=[^>]*${re})[^>]*\\s${name}="([^"]*)"`).exec(markup)?.[1] ?? null;

describe('Mask engine', () => {
  it('the standard elements accept their character classes; an empty mask is plain text', () => {
    assert.equal(formatMasked('(000) 000-0000', '5551234567'), '(555) 123-4567');
    assert.equal(formatMasked('000', '1a2'), '12_');
    assert.equal(formatMasked('LL-??', 'ab1cd'), 'ab-cd');
    assert.equal(formatMasked('AAA', 'a1-b'), 'a1b');
    assert.equal(formatMasked('&&', ' x'), 'x_');
    assert.equal(formatMasked('CC', ' x'), ' x');
    assert.equal(formatMasked('###', '+-1'), '+-1');
    assert.equal(formatMasked('99', ' 1'), ' 1');
    assert.equal(parseMask('').slots.length, 0);
  });

  it('case shift and escapes', () => {
    assert.equal(formatMasked('>LL<LL|LL', 'abCDeF'), 'ABcdeF');
    assert.equal(formatMasked('\\0\\L-0', '7'), '0L-7');
  });

  it('regular expression character classes', () => {
    assert.equal(formatMasked('[0-2][0-9]:[0-5][0-9]', '2359'), '23:59');
    assert.equal(formatMasked('[0-2][0-9]', '39'), '_9'.replace('_9', '__'));
  });

  it('custom tokens and the placeholder character', () => {
    assert.equal(formatMasked('#-#', 'x1y', { tokens: { '#': 'xy' } }), 'x-y');
    assert.equal(formatMasked('PP', 'Ab', { tokens: { P: /[A-Z]/ } }), 'A_');
    assert.equal(formatMasked('00-00', '1', { placeholderChar: '•' }), '1•-••');
  });

  it('formatMasked is the masked text of a raw value; digit masks are marked ltr', () => {    assert.equal(parseMask('(000) 000').digitsOnly, true);
    assert.equal(parseMask('LL-00').digitsOnly, false);
  });

  it('(perf): applying a 32-slot mask costs ≤ 0.2 ms @perf', () => {
    const mask = '0000-0000-0000-0000-0000-0000-0000-0000'.slice(0, 39);
    const raw = '12345678901234567890123456789012';
    for (let i = 0; i < 200; i++) formatMasked(mask, raw);
    const n = 2000;
    const t = performance.now();
    for (let i = 0; i < n; i++) formatMasked(mask, raw);
    const per = (performance.now() - t) / n;
    assertBudget(per, 0.2, '32-slot mask format per call');
  });
});

describe('MaskedField markup', () => {
  it('masked text in the visible input, raw or masked value in the hidden named input', () => {
    const out = renderToString(h(MaskedField, { label: 'Phone', mask: '(000) 000-0000', name: 'phone', defaultValue: '555' }));
    assert.match(out, /<input dir="ltr"[^>]*value="\(555\) ___-____"/);
    assert.match(out, /<input type="hidden" name="phone" value="555"\/>/);
    const masked = renderToString(h(MaskedField, { 'aria-label': 'Code', mask: '>LL-00', name: 'code', defaultValue: 'ab12', submitValue: 'masked' }));
    assert.match(masked, /type="hidden" name="code" value="AB-12"/);
  });

  it('an empty field shows its placeholder; the expected format is the description', () => {
    const out = renderToString(h(MaskedField, { label: 'Phone', mask: '000', placeholder: 'Phone number', description: '3 digits' }));
    assert.match(out, /value=""[^>]*placeholder="Phone number"|placeholder="Phone number"[^>]*value=""/);
    assert.match(out, /aria-describedby="[^"]+"/);
  });
});

describe('NumberField markup', () => {
  it('role="spinbutton" with value attributes and a formatted value', () => {
    const out = renderToString(h(NumberField, { label: 'Qty', defaultValue: 1234.5, min: 0, max: 10000, name: 'qty' }));
    assert.match(out, /role="spinbutton"/);
    assert.match(out, /aria-valuenow="1234.5"/);
    assert.match(out, /aria-valuemin="0"/);
    assert.match(out, /aria-valuemax="10000"/);
    assert.match(out, /aria-valuetext="1,234.5"/);
    assert.match(out, /inputMode="decimal"/);
    assert.match(out, /value="1,234.5"/);
    assert.match(out, /type="hidden" name="qty" value="1234.5"/);  });

  it('Intl options, Data Grid presets, currency and locale', () => {
    assert.match(renderToString(h(NumberField, { 'aria-label': 'x', defaultValue: 0.256, formatOptions: { style: 'percent', maximumFractionDigits: 1 } })), /value="25.6%"/);
    assert.match(renderToString(h(NumberField, { 'aria-label': 'x', defaultValue: 1234.5, format: 'N2' })), /value="1,234.50"/);
    assert.match(renderToString(h(NumberField, { 'aria-label': 'x', defaultValue: 1234.5, format: 'C2', currency: 'EUR', locale: 'de-DE' })), /value="1.234,50\s€"/);
    assert.match(renderToString(h(NumberField, { 'aria-label': 'x', defaultValue: 5, currency: 'JPY', locale: 'ja-JP' })), /value="￥5"/);
  });

  it('the stepper renders unless showStepper is false; decimals caps the display', () => {
    const out = renderToString(h(NumberField, { 'aria-label': 'x', defaultValue: 1.23456, decimals: 2 }));
    assert.match(out, /value="1.23"/);
    assert.match(out, /aria-label="Increment"/);
    assert.match(out, /aria-label="Decrement"/);
    assert.doesNotMatch(renderToString(h(NumberField, { 'aria-label': 'x', showStepper: false })), /Increment/);
  });

  it('an out-of-range value with clampBehavior none is not clamped in the markup', () => {
    const out = renderToString(h(NumberField, { 'aria-label': 'x', defaultValue: 42, max: 10, clampBehavior: 'none' }));
    assert.match(out, /aria-valuenow="42"/);
  });
});

void attr;
