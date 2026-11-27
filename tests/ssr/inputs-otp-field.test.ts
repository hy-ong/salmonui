// test:ssr for @salmonui/react/otp-field:
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
const { OtpField } = await import('@salmonui/inputs/otp-field');

const twice = (el: ReturnType<typeof h>): string => {
  const a = renderToString(h(StrictMode, null, el));
  assert.equal(renderToString(h(StrictMode, null, el)), a);
  return a;
};

describe('OtpField SSR without DOM globals', () => {
  it('OtpField renders deterministically', () => {
    assert.match(twice(h(OtpField, { label: 'Code', length: 6, separator: '-', groupSize: 3, defaultValue: '12' })), /autoComplete="one-time-code"/);
  });
});
