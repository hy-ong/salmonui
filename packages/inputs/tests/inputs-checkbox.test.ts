// Checkbox and CheckboxGroup server markup: behaviors that unit or SSR tests can check are asserted on
// renderToString output; interaction tests live in tests/browser/inputs-checkbox.spec.ts.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createElement as h, type ReactElement } from 'react';
import { renderToString } from 'react-dom/server';
import { Checkbox, CheckboxGroup } from '@salmonui/inputs/checkbox';

const html = (element: ReactElement) => renderToString(element);
const attr = (markup: string, tag: string, name: string): string | null => new RegExp(`<${tag}[^>]*\\s${name}="([^"]*)"`).exec(markup)?.[1] ?? null;
const inputs = (markup: string): string[] => markup.match(/<input[^>]*>/g) ?? [];

describe('Checkbox markup', () => {
  it('a native checkbox labelled by its children through a real label', () => {
    const out = html(h(Checkbox, { defaultChecked: true }, 'Accept'));
    const id = attr(out, 'input', 'id');
    assert.ok(id);
    assert.equal(attr(out, 'input', 'type'), 'checkbox');
    assert.equal(attr(out, 'label', 'for'), id);
    assert.match(out, /<input[^>]*checked=""/);
    assert.match(out, /<span class="salmon-toggle-label">Accept<\/span>/);
    assert.doesNotMatch(html(h(Checkbox, { 'aria-label': 'x' })), /checked=""/);  });

  it('indeterminate renders aria-checked="mixed" and data-indeterminate on the server', () => {
    const out = html(h(Checkbox, { indeterminate: true, 'aria-label': 'All' }));
    assert.equal(attr(out, 'input', 'aria-checked'), 'mixed');
    assert.match(out, /<input[^>]*data-indeterminate=""/);
    assert.doesNotMatch(html(h(Checkbox, { 'aria-label': 'x' })), /aria-checked|data-indeterminate/);
  });

  it('labelPlacement start puts the text before the input in DOM order', () => {
    const end = html(h(Checkbox, null, 'Text'));
    const start = html(h(Checkbox, { labelPlacement: 'start' }, 'Text'));
    assert.ok(end.indexOf('<input') < end.indexOf('Text'));
    assert.ok(start.indexOf('Text') < start.indexOf('<input'));
    assert.equal(attr(start, 'label', 'data-label-placement'), 'start');
  });

  it('name, value, form and required pass to the native input', () => {
    const out = html(h(Checkbox, { name: 'terms', value: 'yes', form: 'f', required: true }, 'T'));
    assert.equal(attr(out, 'input', 'name'), 'terms');
    assert.equal(attr(out, 'input', 'value'), 'yes');
    assert.equal(attr(out, 'input', 'form'), 'f');
    assert.match(out, /<input[^>]*required=""/);
  });

  it('CheckboxGroup is a fieldset named by its legend; items share the name and check from the array', () => {
    const out = html(
      h(
        CheckboxGroup,
        { label: 'Fruit', name: 'fruit', defaultValue: ['pear'], orientation: 'horizontal', description: 'Pick some' },
        h(Checkbox, { value: 'apple' }, 'Apple'),
        h(Checkbox, { value: 'pear' }, 'Pear'),
      ),
    );
    assert.match(out, /^<fieldset/);
    const legend = /<legend[^>]*id="([^"]+)"[^>]*>Fruit<\/legend>/.exec(out);
    assert.ok(legend);
    assert.equal(attr(out, 'fieldset', 'aria-labelledby'), legend[1]);
    assert.equal(attr(out, 'fieldset', 'data-orientation'), 'horizontal');
    assert.ok(attr(out, 'fieldset', 'aria-describedby'));
    const items = inputs(out);
    assert.equal(items.length, 2);
    assert.ok(items.every((i) => i.includes('name="fruit"')));
    assert.doesNotMatch(items[0]!, /checked=""/);
    assert.match(items[1]!, /checked=""/);
  });

  it('a disabled group disables the fieldset; items keep the native checkbox role', () => {
    const out = html(h(CheckboxGroup, { label: 'G', disabled: true }, h(Checkbox, { value: 'a' }, 'A')));
    assert.match(out, /<fieldset[^>]*disabled=""/);
    assert.match(out, /<fieldset[^>]*data-disabled=""/);
    assert.doesNotMatch(out, /role="/);
    assert.match(html(h(Checkbox, { disabled: true }, 'D')), /<label[^>]*data-disabled=""/);
  });
});
