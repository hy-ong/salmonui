// test:ssr for @salmonui/react/slider and @salmonui/react/signature-pad:
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
const { Slider } = await import('@salmonui/inputs/slider');
const { SignaturePad } = await import('@salmonui/inputs/signature-pad');

const twice = (el: ReturnType<typeof h>): string => {
  const a = renderToString(h(StrictMode, null, el));
  assert.equal(renderToString(h(StrictMode, null, el)), a);
  return a;
};

describe('Slider and SignaturePad SSR without DOM globals', () => {
  it('Slider (single, range, values, vertical, ticks) renders final markup deterministically', () => {
    const out = twice(
      h(
        'div',
        null,
        h(Slider, { label: 'Volume', name: 'v', defaultValue: 25, fill: true, valueLabel: { show: 'always' }, ticks: { majorStep: 25, showMinor: true, minorStep: 5 } }),
        h(Slider, { label: 'Price', name: 'p', defaultValue: [10, 90] as const, formatOptions: { style: 'currency', currency: 'EUR' }, locale: 'de-DE' }),
        h(Slider, { label: 'Size', values: ['S', 'M', 'L'], defaultValue: 'L', orientation: 'vertical', ticks: { placement: 'both' } }),
      ),
    );
    assert.match(out, /--salmon-slider-end:25%/);
    assert.match(out, /--salmon-slider-start:10%;--salmon-slider-end:90%/);
    assert.match(out, /aria-valuetext="10,00.€"/);
    assert.match(out, /--salmon-slider-tick:20%/);
    assert.match(out, /data-orientation="vertical"/);
  });

  it('SignaturePad renders the sized container and an unsized canvas', () => {
    const out = twice(h(SignaturePad, { label: 'Sign', name: 's', height: 150 }));
    assert.match(out, /style="block-size:150px"/);
    assert.match(out, /<canvas[^>]*role="img"/);
    assert.doesNotMatch(out, /<canvas[^>]*\swidth=/);
  });
});
