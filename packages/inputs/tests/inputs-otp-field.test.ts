// OtpField server markup: behaviors that unit or SSR tests can check are asserted on
// renderToString output; interaction tests live in tests/browser/inputs-otp-field.spec.ts.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createElement as h, type ReactElement } from 'react';
import { renderToString } from 'react-dom/server';
import { Checkbox } from '@salmonui/inputs/checkbox';
import { Form } from '@salmonui/inputs/form';
import { normalizeOtp, OtpField } from '@salmonui/inputs/otp-field';
import { Radio, RadioGroup } from '@salmonui/inputs/radio-group';
import { Rating } from '@salmonui/inputs/rating';
import { Switch } from '@salmonui/inputs/switch';

const html = (element: ReactElement) => renderToString(element);
const attr = (markup: string, tag: string, name: string): string | null => new RegExp(`<${tag}[^>]*\\s${name}="([^"]*)"`).exec(markup)?.[1] ?? null;
const inputs = (markup: string): string[] => markup.match(/<input[^>]*>/g) ?? [];
const count = (markup: string, re: RegExp): number => (markup.match(re) ?? []).length;

describe('OtpField markup', () => {
  it('one native input with maxLength and one-time-code autocomplete, cells hidden from AT', () => {
    const out = html(h(OtpField, { label: 'Code', defaultValue: '12' }));
    assert.equal(inputs(out).length, 1);
    assert.equal(attr(out, 'input', 'maxLength'), '4');
    assert.equal(attr(out, 'input', 'autoComplete'), 'one-time-code');
    assert.equal(attr(out, 'label', 'for'), attr(out, 'input', 'id'));
    assert.equal(count(out, /class="salmon-otp-cell"/g), 4);
    assert.match(out, /<div class="salmon-otp-cells" aria-hidden="true">/);
    assert.equal(attr(out, 'input', 'value'), '12');
    assert.equal(attr(html(h(OtpField, { label: 'C', length: 6 })), 'input', 'maxLength'), '6');  });

  it('type maps to inputmode and pattern; mask hides characters behind a password input', () => {
    const numeric = html(h(OtpField, { label: 'C' }));
    assert.equal(attr(numeric, 'input', 'inputMode'), 'numeric');
    assert.equal(attr(numeric, 'input', 'pattern'), '[0-9]*');
    const alpha = html(h(OtpField, { label: 'C', type: 'alphanumeric' }));
    assert.equal(attr(alpha, 'input', 'inputMode'), 'text');
    assert.equal(attr(alpha, 'input', 'pattern'), '[\\p{L}\\p{N}]*');
    const masked = html(h(OtpField, { label: 'C', mask: true, defaultValue: '12' }));
    assert.equal(attr(masked, 'input', 'type'), 'password');
    assert.equal(count(masked, />•</g), 2);
    assert.doesNotMatch(masked, /salmon-otp-cell"[^>]*>1</);
    assert.equal(normalizeOtp('a1b2c3', 6, 'numeric'), '123');
    assert.equal(normalizeOtp('ab-12 x', 6, 'alphanumeric'), 'ab12x');
    assert.equal(normalizeOtp('a b!', 6, 'text'), 'ab!');
  });

  it('defaultValue is normalized to the type and length', () => {
    assert.equal(attr(html(h(OtpField, { label: 'C', defaultValue: '1a2345678' })), 'input', 'value'), '1234');
  });

  it('placeholder is one character per empty cell or repeated', () => {
    const one = html(h(OtpField, { label: 'C', placeholder: '_', defaultValue: '1' }));
    assert.equal(count(one, /data-placeholder="">_</g), 3);
    const many = html(h(OtpField, { label: 'C', placeholder: 'abcd' }));
    assert.match(many, />a<.*>b<.*>c<.*>d</);
  });

  it('separator between groups of groupSize cells', () => {
    const out = html(h(OtpField, { label: 'C', length: 6, separator: '-', groupSize: 3 }));
    assert.equal(count(out, /class="salmon-otp-separator">-</g), 1);
    assert.equal(count(html(h(OtpField, { label: 'C', separator: '·' })), /salmon-otp-separator/g), 3);
  });

  it('transform normalizes letters', () => {
    assert.equal(attr(html(h(OtpField, { label: 'C', type: 'alphanumeric', transform: 'uppercase', defaultValue: 'ab' })), 'input', 'value'), 'AB');
    assert.equal(normalizeOtp('AbC', 4, 'alphanumeric', 'lowercase'), 'abc');
  });

  it('numeric codes keep left-to-right order; description and errors are tied to the input', () => {
    const out = html(h(OtpField, { label: 'C', description: 'From the SMS', invalid: true, errorMessage: 'Wrong code' }));
    assert.match(out, /<div class="salmon-otp" dir="ltr">/);
    assert.equal(attr(out, 'input', 'aria-invalid'), 'true');
    assert.equal(attr(out, 'input', 'aria-describedby')!.split(' ').length, 2);
    assert.doesNotMatch(html(h(OtpField, { label: 'C', type: 'text' })), /dir="ltr"/);
  });
});

describe('Choice fields in a Form', () => {
  it('server markup is deterministic and ids come from useId', () => {
    const tree = h(
      Form,
      null,
      h(Checkbox, { name: 'a' }, 'A'),
      h(RadioGroup, { label: 'R' }, h(Radio, { value: 'x' }, 'X')),
      h(Switch, null, 'S'),
      h(Rating, { label: 'Stars' }),
      h(OtpField, { label: 'Code' }),
    );
    assert.equal(html(tree), html(tree));
  });
});
