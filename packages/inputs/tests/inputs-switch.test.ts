// Switch server markup: behaviors that unit or SSR tests can check are asserted on
// renderToString output; interaction tests live in tests/browser/inputs-switch.spec.ts.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createElement as h, type ReactElement } from 'react';
import { renderToString } from 'react-dom/server';
import { Switch } from '@salmonui/inputs/switch';

const html = (element: ReactElement) => renderToString(element);
const attr = (markup: string, tag: string, name: string): string | null => new RegExp(`<${tag}[^>]*\\s${name}="([^"]*)"`).exec(markup)?.[1] ?? null;

describe('Switch markup', () => {
  it('a native checkbox with role="switch" and the native checked state', () => {
    const out = html(h(Switch, { defaultChecked: true }, 'Wi-Fi'));
    assert.equal(attr(out, 'input', 'type'), 'checkbox');
    assert.equal(attr(out, 'input', 'role'), 'switch');
    assert.match(out, /<input[^>]*checked=""/);
    assert.equal(attr(out, 'label', 'for'), attr(out, 'input', 'id'));  });

  it('children label, labelPlacement, description and a decorative thumbIcon', () => {
    const out = html(h(Switch, { labelPlacement: 'start', description: 'Off saves battery', thumbIcon: 'i' }, 'Wi-Fi'));
    assert.ok(out.indexOf('Wi-Fi') < out.indexOf('<input'));
    assert.match(out, /<span class="salmon-toggle-extra" aria-hidden="true">/);
    assert.ok(attr(out, 'input', 'aria-describedby'));
  });

  it('name and value pass to the input', () => {
    const out = html(h(Switch, { name: 'wifi', value: 'enabled' }, 'W'));
    assert.equal(attr(out, 'input', 'name'), 'wifi');
    assert.equal(attr(out, 'input', 'value'), 'enabled');
  });
});
