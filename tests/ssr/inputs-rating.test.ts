// test:ssr for @salmonui/react/rating:
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
const { Rating } = await import('@salmonui/inputs/rating');

const twice = (el: ReturnType<typeof h>): string => {
  const a = renderToString(h(StrictMode, null, el));
  assert.equal(renderToString(h(StrictMode, null, el)), a);
  return a;
};

describe('Rating SSR without DOM globals', () => {
  it('Rating (interactive and read-only display) renders deterministically', () => {
    const out = twice(h('div', null, h(Rating, { label: 'R', precision: 'half', defaultValue: 2.5, showTooltip: true, clearable: true }), h(Rating, { label: 'Avg', readOnly: true, precision: 'exact', defaultValue: 3.3 })));
    assert.match(out, /role="img"/);
    assert.match(out, /type="radio"/);
  });
});
