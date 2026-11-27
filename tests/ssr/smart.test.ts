// test:ssr for TextArea `suggest` and `@salmonui/chat/smart-paste`:
// both evaluate and render
// in Node with the DOM-like globals removed. `suggest` changes nothing in the
// server HTML (the controller is a client-only lazy chunk; `'auto'` display is
// decided by a CSS media query), so server and client markup agree.
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

const { createElement: h, StrictMode, useRef } = await import('react');
const { renderToString } = await import('react-dom/server');
const { TextArea } = await import('@salmonui/inputs/text-field');
const { useTextSuggest } = await import('@salmonui/chat/text-suggest');
const { useSmartPaste } = await import('@salmonui/chat/smart-paste');
const { Button } = await import('@salmonui/buttons/button');

const render = (el: ReturnType<typeof h>): string => {
  const a = renderToString(h(StrictMode, null, el));
  assert.equal(renderToString(h(StrictMode, null, el)), a);
  return a;
};

describe('TextArea suggest and smart paste SSR without DOM globals', () => {
  it('a TextArea wired to useTextSuggest renders the same markup as without it', () => {
    const base = { id: 'msg', name: 'msg', label: 'Message', defaultValue: 'Hello' };
    const suggest = async (): Promise<string | null> => ' world';
    const plain = render(h(TextArea, base));
    for (const display of ['inline', 'popover', 'auto'] as const) {
      function Suggesting() {
        const s = useTextSuggest({ suggest, suggestionDisplay: display, suggestDelay: 100, onSuggestionAccept: () => {}, localeText: { acceptHint: 'Tab' } });
        return h(TextArea, { ...base, ref: s.ref });
      }
      assert.equal(render(h(Suggesting)), plain, display);
    }
    assert.doesNotMatch(plain, /suggest/);
  });

  it('useSmartPaste renders on the server with pending false and never touches the clipboard', () => {
    function Paste() {
      const ref = useRef<HTMLFormElement>(null);
      const { pending } = useSmartPaste(ref, async () => ({}));
      return h('form', { ref }, h('input', { name: 'name', 'aria-label': 'Name' }), h(Button, { loading: pending }, 'Smart paste'));
    }
    const out = render(h(Paste));
    assert.match(out, /<form><input aria-label="Name" name="name"\/><button class="salmon-button"/);
    assert.doesNotMatch(out, /aria-busy="true"/);
  });
});
