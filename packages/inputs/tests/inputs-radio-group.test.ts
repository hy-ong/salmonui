// RadioGroup and Radio server markup: behaviors that unit or SSR tests can check are asserted on
// renderToString output; interaction tests live in tests/browser/inputs-radio-group.spec.ts.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createElement as h, type ReactElement } from 'react';
import { renderToString } from 'react-dom/server';
import { Radio, RadioGroup } from '@salmonui/inputs/radio-group';

const html = (element: ReactElement) => renderToString(element);
const attr = (markup: string, tag: string, name: string): string | null => new RegExp(`<${tag}[^>]*\\s${name}="([^"]*)"`).exec(markup)?.[1] ?? null;
const inputs = (markup: string): string[] => markup.match(/<input[^>]*>/g) ?? [];
const count = (markup: string, re: RegExp): number => (markup.match(re) ?? []).length;

describe('RadioGroup markup', () => {
  const group = (props: object = {}) =>
    html(h(RadioGroup, { label: 'Plan', name: 'plan', defaultValue: 'pro', ...props }, h(Radio, { value: 'free' }, 'Free'), h(Radio, { value: 'pro' }, 'Pro'), h(Radio, { value: 'team', disabled: true }, 'Team')));

  it('native radios share the group name; the value checks one; children are labels', () => {
    const out = group();
    const items = inputs(out);
    assert.equal(items.length, 3);
    assert.ok(items.every((i) => i.includes('type="radio"') && i.includes('name="plan"')));
    assert.deepEqual(
      items.map((i) => i.includes('checked=""')),
      [false, true, false],
    );
    assert.match(out, /<span class="salmon-toggle-label">Pro<\/span>/);  });

  it('without a name the group gets a generated one shared by every radio', () => {
    const items = inputs(html(h(RadioGroup, { label: 'G' }, h(Radio, { value: 'a' }, 'A'), h(Radio, { value: 'b' }, 'B'))));
    const names = items.map((i) => /name="([^"]+)"/.exec(i)?.[1]);
    assert.ok(names[0]);
    assert.equal(names[0], names[1]);
  });

  it('labelPlacement on the group or the radio', () => {
    const out = group({ labelPlacement: 'start' });
    assert.equal(count(out, /data-label-placement="start"/g), 3);
    const one = html(h(RadioGroup, { label: 'G' }, h(Radio, { value: 'a', labelPlacement: 'start' }, 'A')));
    assert.ok(one.indexOf('>A<') < one.indexOf('<input'));
  });

  it('a Radio outside a group is a plain native radio with its own name and defaultChecked', () => {
    const out = html(h(Radio, { name: 'solo', value: 'a', defaultChecked: true }, 'A'));
    assert.equal(attr(out, 'input', 'name'), 'solo');
    assert.match(out, /<input[^>]*checked=""/);
  });

  it('orientation is a data attribute of the fieldset', () => {
    assert.equal(attr(group(), 'fieldset', 'data-orientation'), 'vertical');
    assert.equal(attr(group({ orientation: 'horizontal' }), 'fieldset', 'data-orientation'), 'horizontal');
  });

  it('fieldset role=radiogroup with legend, description and error tied to the group', () => {
    const out = group({ description: 'Billed monthly', invalid: true, errorMessage: 'Choose one', required: true });
    assert.equal(attr(out, 'fieldset', 'role'), 'radiogroup');
    assert.match(out, /<legend[^>]*>Plan<\/legend>/);
    const described = attr(out, 'fieldset', 'aria-describedby')!.split(' ');
    assert.equal(described.length, 2);
    assert.match(out, new RegExp(`id="${described[0]}"[^>]*>Billed monthly<`));
    assert.match(out, new RegExp(`id="${described[1]}"[^>]*>Choose one<`));
    assert.equal(attr(out, 'fieldset', 'aria-invalid'), 'true');
    assert.equal(attr(out, 'fieldset', 'aria-required'), 'true');
    assert.ok(inputs(out).every((i) => i.includes('required=""')));
  });

  it('per-item and group disabled', () => {
    assert.match(inputs(group())[2]!, /disabled=""/);
    const all = group({ disabled: true });
    assert.match(all, /<fieldset[^>]*disabled=""/);
    assert.ok(inputs(all).every((i) => i.includes('disabled=""')));
  });

  it('read-only groups keep radios focusable (no disabled) and mark aria-readonly', () => {
    const out = group({ readOnly: true });
    assert.equal(attr(out, 'fieldset', 'aria-readonly'), 'true');
    assert.ok(inputs(out).slice(0, 2).every((i) => !i.includes('disabled')));
  });
});
