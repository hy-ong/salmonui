// Form, Field and TextField server markup: behaviors that unit or SSR tests can check are asserted on
// renderToString output; interaction tests live in tests/browser/inputs-form.spec.ts.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createElement as h, type ReactElement } from 'react';
import { renderToString } from 'react-dom/server';
import { compileValidationRules, NO_ERRORS, type FieldValidation, type FieldValidatorContext } from '@salmonui/core/validation';
import { Field, FieldDescription, FieldError, Form, type FieldRenderProps } from '@salmonui/inputs/form';
import { TextArea, TextField } from '@salmonui/inputs/text-field';
import { assertBudget } from '../../../tooling/bench/budget.mjs';

const html = (element: ReactElement) => renderToString(element);
const attr = (markup: string, tag: string, name: string): string | null => new RegExp(`<${tag}[^>]*\\s${name}="([^"]*)"`).exec(markup)?.[1] ?? null;

describe('TextField markup', () => {
  it('a native input with a real label, value and placeholder', () => {
    const out = html(h(TextField, { label: 'Email', defaultValue: 'a@b.c', placeholder: 'you@example.com', name: 'email' }));
    const id = attr(out, 'input', 'id');
    assert.ok(id);
    assert.equal(attr(out, 'label', 'for'), id);
    assert.equal(attr(out, 'input', 'value'), 'a@b.c');
    assert.equal(attr(out, 'input', 'placeholder'), 'you@example.com');
    assert.equal(attr(out, 'input', 'name'), 'email');
    assert.equal(attr(out, 'input', 'type'), 'text');  });

  it('type, autoComplete, maxLength, name and form pass to the input', () => {
    for (const type of ['text', 'password', 'email', 'tel', 'url', 'search'] as const) {
      assert.equal(attr(html(h(TextField, { type, 'aria-label': 'x' })), 'input', 'type'), type);
    }
    const out = html(h(TextField, { 'aria-label': 'x', autoComplete: 'street-address', maxLength: 12, name: 'n', form: 'f', inputMode: 'email', enterKeyHint: 'send' }));
    assert.equal(attr(out, 'input', 'autoComplete'), 'street-address');
    assert.equal(attr(out, 'input', 'maxLength'), '12');
    assert.equal(attr(out, 'input', 'form'), 'f');
    assert.equal(attr(out, 'input', 'inputMode'), 'email');
    assert.equal(attr(out, 'input', 'enterKeyHint'), 'send');
  });

  it('disabled and readOnly are native attributes; the root carries data-disabled', () => {
    const out = html(h(TextField, { label: 'A', disabled: true, readOnly: true }));
    assert.match(out, /<input[^>]*disabled=""/);
    assert.match(out, /<input[^>]*readOnly=""/);
    assert.match(out, /class="salmon-field salmon-text-field"[^>]*data-disabled=""/);
  });

  it('className and style on the root, part classNames, size as data-size', () => {
    const out = html(h(TextField, { label: 'A', className: 'mine', style: { inlineSize: 240 }, size: 'lg', classNames: { input: 'in', group: 'gr', label: 'lb' } }));
    assert.match(out, /^<div class="salmon-field salmon-text-field mine" style="inline-size:240px" data-size="lg"/);
    assert.match(out, /class="salmon-input-group gr" data-size="lg"/);
    assert.match(out, /class="salmon-input in"/);
    assert.match(out, /class="salmon-field-label lb"/);
    assert.match(html(h(TextField, { 'aria-label': 'x' })), /data-size="md"/);
  });

  it('startAdornment and endAdornment render inside the input group', () => {
    const out = html(h(TextField, { 'aria-label': 'Price', startAdornment: h('span', null, '$'), endAdornment: h('span', null, 'USD') }));
    assert.match(out, /data-position="start"><span>\$<\/span>/);
    assert.match(out, /data-position="end"><span>USD<\/span>/);
  });

  it('clearable shows a clear button named by localeText.clear only while there is a value', () => {
    assert.doesNotMatch(html(h(TextField, { 'aria-label': 'x', clearable: true })), /salmon-input-group-clear/);
    const out = html(h(TextField, { 'aria-label': 'x', clearable: true, defaultValue: 'a', localeText: { clear: 'Leeren' } }));
    assert.match(out, /<button type="button" class="salmon-input-group-clear" tabindex="-1" aria-label="Leeren"/);
  });

  it('description and error are tied to the input; aria-invalid only while invalid', () => {
    const plain = html(h(TextField, { label: 'A', description: 'Help' }));
    const descId = attr(plain, 'div', 'id');
    assert.equal(attr(plain, 'input', 'aria-describedby'), descId);
    assert.equal(attr(plain, 'input', 'aria-invalid'), null);
    const bad = html(h(TextField, { label: 'A', description: 'Help', invalid: true, errorMessage: 'Wrong' }));
    assert.match(bad, /data-invalid=""/);
    assert.equal(attr(bad, 'input', 'aria-invalid'), 'true');
    const errId = attr(bad, 'input', 'aria-errormessage');
    assert.ok(errId);
    assert.match(bad, new RegExp(`class="salmon-field-error" id="${errId}">Wrong<`));
    assert.match(attr(bad, 'input', 'aria-describedby') ?? '', new RegExp(errId!));
  });

  it('server markup is deterministic and ids come from useId', () => {
    const el = h(Form, null, h(TextField, { label: 'A', description: 'd' }), h(TextArea, { label: 'B' }));
    assert.equal(html(el), html(el));
  });
});

describe('TextArea markup', () => {
  it('a native textarea with value, rows, cols and maxLength', () => {
    const out = html(h(TextArea, { label: 'Notes', defaultValue: 'hi', rows: 4, cols: 30, maxLength: 200 }));
    assert.match(out, /<textarea[^>]*rows="4"[^>]*cols="30"[^>]*maxLength="200"|<textarea[^>]*maxLength="200"/);
    assert.match(out, /<textarea[^>]*>hi<\/textarea>/);  });

  it('resize defaults to both; autoResize sets the field-sizing hook', () => {
    assert.equal(attr(html(h(TextArea, { 'aria-label': 'x' })), 'textarea', 'data-resize'), 'both');
    for (const resize of ['vertical', 'horizontal', 'none'] as const) assert.equal(attr(html(h(TextArea, { 'aria-label': 'x', resize })), 'textarea', 'data-resize'), resize);
    assert.match(html(h(TextArea, { 'aria-label': 'x', autoResize: true })), /data-auto-resize=""/);
  });
});

describe('Form and Field', () => {
  it('Form renders a native form; Salmon shows the messages (noValidate)', () => {
    const out = html(h(Form, { action: '/save', method: 'post' }, h(TextField, { name: 'a', label: 'A' })));
    assert.match(out, /^<form noValidate="" action="\/save" method="post">/);
  });

  it('server errors keyed by name show as field errors', () => {
    const out = html(h(Form, { validationErrors: { email: 'Taken', other: ['x'] } }, h(TextField, { name: 'email', label: 'Email' })));
    assert.match(out, /class="salmon-field-error"[^>]*>Taken</);
    assert.equal(attr(out, 'input', 'aria-invalid'), 'true');
  });

  it('Field renders custom controls with the wiring; FieldError / FieldDescription parts', () => {
    const out = html(
      h(Field, { label: 'Plan', description: 'Pick one', name: 'plan', invalid: true, errorMessage: 'Required', children: (f: FieldRenderProps) => h('select', { ...f.inputProps, ref: undefined }, h('option', null, 'A')) }),
    );
    const id = attr(out, 'select', 'id');
    assert.equal(attr(out, 'label', 'for'), id);
    assert.equal(attr(out, 'select', 'name'), 'plan');
    assert.equal(attr(out, 'select', 'aria-invalid'), 'true');
    assert.match(out, /salmon-field-error[^>]*>Required</);
    const parts = html(h(Field, { label: 'X', invalid: true, errorMessage: 'E', errorPlacement: 'manual', children: () => h(FieldError, { className: 'below' }) }));
    assert.match(parts, /class="salmon-field-error below"[^>]*>E</);
    assert.match(html(h(FieldDescription, null, 'D')), /class="salmon-field-description">D</);
  });

  it('errorMessage may be a function of the errors', () => {
    const out = html(h(Form, { validationErrors: { a: ['one', 'two'] } }, h(TextField, { name: 'a', 'aria-label': 'a', errorMessage: ({ errors }) => errors.join(' / ') })));
    assert.match(out, />one \/ two</);
  });
});

describe('Shared rule engine', () => {
  const ctx: FieldValidatorContext = { name: 'x', formData: null, isNew: false };

  it('built-in rules use the Data Grid vocabulary and messages', () => {
    const rules: FieldValidation = { required: true, email: true, minLength: 5 };
    const v = compileValidationRules(rules);
    assert.deepEqual(v.validate('', null), ['This field is required.']);
    assert.deepEqual(v.validate('nope', null), ['Please enter a valid email address.']);
    assert.deepEqual(compileValidationRules({ pattern: '^[A-Z]{3}$' }).validate('ab', null), ['Please enter a correct value.']);
    assert.deepEqual(compileValidationRules({ creditcard: true }).validate('4111111111111111', null), []);
    assert.deepEqual(compileValidationRules({ rangeLength: [2, 3] }).validate('abcd', null), ['Please enter a value between 2 and 3 characters long.']);
  });

  it('custom validate reads other fields through the field context (equalTo)', async () => {
    const formData = { get: (n: string) => (n === 'password' ? 'secret' : null), getAll: () => [], has: () => true };
    const v = compileValidationRules<FieldValidatorContext, FieldValidatorContext>({ validate: [(value, c) => value === c.formData?.get('password'), 'Passwords differ'] });
    const field: FieldValidatorContext = { name: 'confirm', formData, isNew: false };
    assert.equal(v.custom?.('secret', field, field), null);
    assert.equal(v.custom?.('other', field, field), 'Passwords differ');
    const asyncV = compileValidationRules<FieldValidatorContext, FieldValidatorContext>({ validate: async (value) => (value === 'taken' ? 'Taken' : null) });
    assert.equal(await asyncV.custom?.('taken', ctx, ctx), 'Taken');
  });

  it('per-rule [argument, message] and messages overrides', () => {
    assert.deepEqual(compileValidationRules({ minLength: [3, 'Too short'] }).validate('a', null), ['Too short']);
    assert.deepEqual(compileValidationRules({ required: true, messages: { required: 'Pflichtfeld' } }).validate('', null), ['Pflichtfeld']);
  });

  it('a passing value allocates nothing (shared NO_ERRORS) and costs well under 0.05 ms @perf', () => {
    const v = compileValidationRules({ required: true, maxLength: 100, pattern: '^[a-z ]*$' });
    assert.equal(v.validate('hello world', null), NO_ERRORS);
    const n = 20_000;
    const start = performance.now();
    for (let i = 0; i < n; i++) v.validate('hello world', null);
    const per = (performance.now() - start) / n;
    assertBudget(per, 0.05, 'passing validation per call', { strict: true });
  });
});
