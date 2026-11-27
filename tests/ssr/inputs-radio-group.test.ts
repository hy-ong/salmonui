// test:ssr for @salmonui/react/radio-group:
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
const { Radio, RadioGroup } = await import('@salmonui/inputs/radio-group');

const twice = (el: ReturnType<typeof h>): string => {
  const a = renderToString(h(StrictMode, null, el));
  assert.equal(renderToString(h(StrictMode, null, el)), a);
  return a;
};

describe('RadioGroup SSR without DOM globals', () => {
  it('RadioGroup and Radio render deterministically', () => {
    const out = twice(h(RadioGroup, { label: 'Plan', defaultValue: 'b' }, h(Radio, { value: 'a' }, 'A'), h(Radio, { value: 'b' }, 'B')));
    assert.match(out, /role="radiogroup"/);
    assert.match(out, /checked=""/);
  });
});
