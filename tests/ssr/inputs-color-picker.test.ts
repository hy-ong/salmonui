// test:ssr for @salmonui/react/color-picker:
// the entry evaluates and renders in Node with the DOM-like globals removed,
// the output is deterministic, and the area and sliders are sized markup
// (CSS gradients, no canvas) on the server.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

const BROWSER_GLOBALS = ['window', 'document', 'navigator', 'location', 'localStorage', 'sessionStorage', 'HTMLElement', 'ResizeObserver', 'requestAnimationFrame', 'matchMedia', 'CSS', 'getComputedStyle'];
const g = globalThis as Record<string, unknown>;
for (const name of BROWSER_GLOBALS) {
  try {
    delete g[name];
  } catch {}
  if (name in g) Object.defineProperty(g, name, { value: undefined, configurable: true });
}

const { createElement: h, StrictMode } = await import('react');
const { renderToString } = await import('react-dom/server');
const { ColorArea, ColorField, ColorPicker, ColorSlider, ColorSwatch, ColorSwatchPicker, parseColor } = await import('@salmonui/inputs/color-picker');

const twice = (el: ReturnType<typeof h>): string => {
  const a = renderToString(h(StrictMode, null, el));
  assert.equal(renderToString(h(StrictMode, null, el)), a);
  return a;
};

describe('ColorPicker SSR without DOM globals', () => {
  it('the picker (trigger, open by default, inline) and every part render deterministically', () => {
    const out = twice(
      h(
        'div',
        null,
        h(ColorPicker, { label: 'Popover', defaultOpen: true, name: 'p' }),
        h(ColorPicker, { label: 'Inline', inline: true, defaultRecentColors: ['#f00'], clearable: true }),
        h(ColorPicker, { label: 'Palette', inline: true, defaultMode: 'swatches', columns: 6 }),
        h(ColorArea, { defaultValue: '#123456' }),
        h(ColorSlider, { channel: 'hue', defaultValue: '#123456' }),
        h(ColorSlider, { channel: 'alpha', defaultValue: '#12345680', orientation: 'vertical' }),
        h(ColorField, { label: 'F', defaultValue: 'hsl(10, 50%, 50%)' }),
        h(ColorSwatch, { color: parseColor('#abcdef') }),
        h(ColorSwatchPicker, { colors: ['#f00', '#0f0'] }),
      ),
    );
    // The popover never renders on the server (it mounts after hydration).
    assert.doesNotMatch(out, /role="dialog"/);
    assert.match(out, /--salmon-color-area-hue:hsl\(210 100% 50%\)/);
    assert.doesNotMatch(out, /<canvas/);
    assert.match(out, /role="listbox"/);
  });
});
