// Form Renderer: schema
// interpretation (widgets, layout, rules, typed data) and the server markup;
// submit interaction is tests/browser/inputs-form-renderer.spec.ts.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createElement as h } from 'react';
import { renderToString } from 'react-dom/server';
import { FormRenderer, type FormSchema, type FormUiSchema } from '@salmonui/inputs/form-renderer';
import { dataOf, rowsOf, rulesOf, widgetOf } from '../dist/form-renderer/schema.js';

const schema: FormSchema = {
  type: 'object',
  title: 'Sign up',
  required: ['first', 'email', 'age', 'plan'],
  properties: {
    first: { type: 'string', title: 'First name', minLength: 2, maxLength: 20, default: 'Ada' },
    last: { type: 'string', title: 'Last name' },
    email: { type: 'string', title: 'Email', format: 'email', description: 'We never share it' },
    password: { type: 'string', title: 'Password', pattern: '^\\S+$' },
    age: { type: 'integer', title: 'Age', minimum: 18, maximum: 120 },
    plan: { type: 'string', title: 'Plan', enum: ['free', 'pro'] },
    size: { type: 'number', title: 'Team size', enum: [1, 5, 10], default: 5 },
    news: { type: 'boolean', title: 'Newsletter', default: true },
    terms: { type: 'boolean', title: 'I accept the terms', const: true },
  },
};
const ui: FormUiSchema = {
  layout: [['first', 'last'], 'email', 'password'],
  fields: { password: { widget: 'password' }, size: { widget: 'radio', enumLabels: ['Solo', 'Small', 'Team'] }, news: { widget: 'switch' } },
};
const markup = (props: Partial<Parameters<typeof FormRenderer>[0]> = {}) => renderToString(h(FormRenderer, { schema, uiSchema: ui, ...props }));

describe('FormRenderer schema', () => {
  it('widgets per type, format and uiSchema widget', () => {
    assert.equal(widgetOf({ type: 'string' }, undefined), 'text');
    assert.equal(widgetOf({ type: 'string' }, { widget: 'password' }), 'password');
    assert.equal(widgetOf({ type: 'string' }, { widget: 'textarea' }), 'textarea');
    assert.equal(widgetOf({ type: 'number' }, undefined), 'number');
    assert.equal(widgetOf({ type: 'integer' }, undefined), 'number');
    assert.equal(widgetOf({ type: 'boolean' }, undefined), 'checkbox');
    assert.equal(widgetOf({ type: 'boolean' }, { widget: 'switch' }), 'switch');
    assert.equal(widgetOf({ type: 'string', enum: ['a'] }, undefined), 'select');
    assert.equal(widgetOf({ type: 'string', enum: ['a'] }, { widget: 'radio' }), 'radio');
    assert.equal(widgetOf({ type: 'array' as never }, undefined), null);
  });

  it('layout rows and columns, then unlisted properties in schema order; unknown names are dropped', () => {
    assert.deepEqual(rowsOf(schema, { layout: [['first', 'last'], 'nope', 'email', ['first']] }), [['first', 'last'], ['email'], ['password'], ['age'], ['plan'], ['size'], ['news'], ['terms']]);
    assert.deepEqual(rowsOf({ type: 'object', properties: { a: { type: 'string' } } }, undefined), [['a']]);
  });

  it('required, minLength, maxLength, minimum, maximum, pattern and formats map to the Form rule vocabulary', () => {
    assert.deepEqual(rulesOf(schema.properties['first']!, true), { required: true, minLength: 2, maxLength: 20 });
    assert.deepEqual(rulesOf(schema.properties['age']!, true), { required: true, min: 18, max: 120 });
    assert.deepEqual(rulesOf(schema.properties['email']!, false), { email: true });
    assert.deepEqual(rulesOf({ type: 'string', format: 'uri' }, false), { url: true });
    assert.deepEqual(rulesOf(schema.properties['password']!, false), { pattern: '^\\S+$' });
    // A boolean is always present: only `const: true` requires a checked box.
    assert.equal(rulesOf({ type: 'boolean' }, true), undefined);
    assert.deepEqual(rulesOf(schema.properties['terms']!, false), { required: true });
    assert.equal(rulesOf(schema.properties['last']!, false), undefined);
  });

  it('submitted data is typed by the schema', () => {
    const form = new FormData();
    form.set('first', 'Ada');
    form.set('last', '');
    form.set('email', 'ada@example.com');
    form.set('password', 'x');
    form.set('age', '36');
    form.set('plan', 'pro');
    form.set('size', '10');
    form.set('news', 'on');
    assert.deepEqual(dataOf(form, schema), { first: 'Ada', last: '', email: 'ada@example.com', password: 'x', age: 36, plan: 'pro', size: 10, news: true, terms: false });
    const empty = new FormData();
    empty.set('age', '');
    empty.set('plan', '');
    assert.deepEqual(dataOf(empty, schema), { first: '', last: '', email: '', password: '', age: null, plan: null, size: null, news: false, terms: false });
  });
});

describe('FormRenderer markup', () => {
  it('a Form named by the schema title with a field per property, labels from title and descriptions', () => {
    const out = markup();
    assert.match(out, /^<form[^>]*class="salmon-form-renderer"/);
    assert.match(out, /<form[^>]*aria-label="Sign up"/);
    assert.match(out, /<form[^>]*noValidate=""/);
    for (const label of ['First name', 'Last name', 'Email', 'Password', 'Age', 'Plan', 'Team size', 'Newsletter', 'I accept the terms']) assert.ok(out.includes(label), label);
    assert.ok(out.includes('We never share it'));
    assert.match(out, /<input[^>]*name="first"[^>]*value="Ada"|<input[^>]*value="Ada"[^>]*name="first"/);    assert.match(markup({ 'aria-label': 'Custom' }), /aria-label="Custom"/);
  });

  it('TextField (email, password), NumberField, Select, RadioGroup, Switch, Checkbox and a submit Button', () => {
    const out = markup();
    assert.match(out, /<input[^>]*type="email"/);
    assert.match(out, /<input[^>]*type="password"/);
    assert.match(out, /class="salmon-field salmon-number-field/);
    assert.match(out, /role="spinbutton"/);
    assert.match(out, /role="combobox"/);
    assert.match(out, /<select[^>]*name="plan"/);
    assert.match(out, /role="radiogroup"/);
    assert.ok(out.includes('Small'));
    assert.match(out, /<input[^>]*type="radio"[^>]*value="5"[^>]*checked=""|<input[^>]*checked=""[^>]*value="5"/);
    assert.match(out, /role="switch"/);
    assert.match(out, /<input[^>]*type="checkbox"(?![^>]*role="switch")[^>]*name="terms"|<input[^>]*name="terms"/);
    assert.match(out, /<button[^>]*type="submit"[^>]*>|<button[^>]*class="salmon-button"[^>]*type="submit"/);
    assert.match(out, />Submit</);
    assert.match(markup({ localeText: { submit: 'Senden' } }), />Senden</);
    assert.doesNotMatch(markup({ uiSchema: { ...ui, submit: false } }), /type="submit"/);
    assert.match(markup({ uiSchema: { ...ui, submit: { label: 'Join' } } }), />Join</);
    assert.match(renderToString(h(FormRenderer, { schema: { type: 'object', properties: { bio: { type: 'string' } } }, uiSchema: { fields: { bio: { widget: 'textarea' } } } })), /<textarea[^>]*name="bio"/);
  });

  it('a row of several properties renders as columns', () => {
    const out = markup();
    assert.match(out, /<div class="salmon-form-renderer-row" data-columns="2" style="--salmon-form-renderer-columns:2">/);
    assert.equal((out.match(/class="salmon-form-renderer-row"/g) ?? []).length, 8);
  });

  it('required properties are marked required on the native control', () => {
    const out = markup();
    assert.match(out, /<input[^>]*name="first"[^>]*required=""|<input[^>]*required=""[^>]*name="first"/);
    assert.match(out, /aria-required="true"/);
    // The optional last name is not required.
    assert.doesNotMatch(out, /<input(?=[^>]*name="last")(?=[^>]*required="")[^>]*>/);
  });

  it('the native form is the submit surface', () => {
    const out = markup({ id: 'f', action: '/save' });
    assert.match(out, /<form[^>]*id="f"/);
    assert.match(out, /<form[^>]*action="\/save"/);
  });
});
