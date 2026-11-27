// test:ssr for `@salmonui/dropdowns/listbox`: the entry evaluates and renders in Node
// with every DOM-like global removed; output is deterministic and, for a
// virtualized list, independent of the item count beyond the first window.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

const BROWSER_GLOBALS = ['window', 'document', 'navigator', 'location', 'localStorage', 'sessionStorage', 'HTMLElement', 'ResizeObserver', 'requestAnimationFrame', 'matchMedia'];
const g = globalThis as Record<string, unknown>;
for (const name of BROWSER_GLOBALS) {
  try {
    delete g[name];
  } catch {}
  if (name in g) Object.defineProperty(g, name, { value: undefined, configurable: true });
}

const { createElement, StrictMode } = await import('react');
const { renderToString } = await import('react-dom/server');
const { Listbox } = await import('@salmonui/dropdowns/listbox');

const count = (html: string, re: RegExp): number => [...html.matchAll(new RegExp(re.source, 'g'))].length;
const items = (n: number) => Array.from({ length: n }, (_, i) => ({ value: `v${i}`, label: `Item ${i}`, group: i < n / 2 ? 'First' : 'Second' }));

describe('Listbox SSR without DOM globals', () => {
  it('renders the list, value and hidden form element deterministically', () => {
    const el = createElement(StrictMode, null, createElement(Listbox, { data: items(20), multiple: true, defaultValue: ['v3', 'v4'], name: 'pick', searchable: true, 'aria-label': 'Items' } as never));
    const a = renderToString(el);
    const b = renderToString(el);
    assert.equal(a, b);
    assert.equal(count(a, /role="option"/), 20);
    assert.equal(count(a, /<option[^>]*selected=""/), 2);
    assert.match(a, /role="group" aria-label="First"/);
  });

  it('a virtualized list renders the first window only, whatever the item count', () => {
    const small = renderToString(createElement(Listbox, { data: items(1_000), 'aria-label': 'Items' } as never));
    const large = renderToString(createElement(Listbox, { data: items(200_000), 'aria-label': 'Items' } as never));
    assert.equal(count(small, /role="option"/), count(large, /role="option"/));
    assert.ok(count(large, /role="option"/) <= 20);
  });
});
