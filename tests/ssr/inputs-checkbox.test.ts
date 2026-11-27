// test:ssr for @salmonui/react/checkbox:
// the entry evaluates and renders in Node with the DOM-like globals removed,
// and the output is deterministic.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

const BROWSER_GLOBALS = ['window', 'document', 'navigator', 'location', 'localStorage', 'sessionStorage', 'HTMLElement', 'ResizeObserver', 'requestAnimationFrame', 'matchMedia', 'CSS'];
const g = globalThis as Record<string, unknown>;
for (const name of BROWSER_GLOBALS) {
  try {
    delete g[name];
  } catch {}
  if (name in g) Object.defineProperty(g, name, { value: undefined, configurable: true });
}

const { createElement: h, StrictMode } = await import('react');
const { renderToString } = await import('react-dom/server');
const { Checkbox, CheckboxGroup } = await import('@salmonui/inputs/checkbox');

const twice = (el: ReturnType<typeof h>): string => {
  const a = renderToString(h(StrictMode, null, el));
  assert.equal(renderToString(h(StrictMode, null, el)), a);
  return a;
};

describe('Checkbox SSR without DOM globals', () => {
  it('Checkbox (mixed) and CheckboxGroup render deterministically', () => {
    const out = twice(h('div', null, h(Checkbox, { indeterminate: true, description: 'd' }, 'All'), h(CheckboxGroup, { label: 'G', defaultValue: ['a'], required: true }, h(Checkbox, { value: 'a' }, 'A'))));
    assert.match(out, /aria-checked="mixed"/);
    assert.match(out, /<fieldset/);
  });
});
