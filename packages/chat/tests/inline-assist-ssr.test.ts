// InlineAssist server rendering: with DOM
// globals removed the module imports and renders, and the assist is closed
// on the server (opening is a client action), even with `open` or
// `defaultOpen`, so the hydration render matches.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

const g = globalThis as Record<string, unknown>;
for (const name of ['window', 'document', 'navigator', 'HTMLElement', 'requestAnimationFrame', 'getComputedStyle']) {
  try {
    delete g[name];
  } catch {}
  if (name in g) Object.defineProperty(g, name, { value: undefined, configurable: true });
}

const { createElement: h } = await import('react');
const { renderToString } = await import('react-dom/server');
const { InlineAssist } = await import('@salmonui/chat/inline-assist');

describe('InlineAssist SSR', () => {
  it('renders nothing on the server, open or not', () => {
    const props = {
      adapter: async () => 'x',
      toolbar: h('button', null, 'Tone'),
      toolbarPlacement: 'bottom',
      renderComposer: () => h('input', { id: 'custom' }),
      renderContent: (text: string) => h('em', null, text),
      commands: [{ id: 'a', label: 'A' }],
    };
    assert.equal(renderToString(h(InlineAssist as never, props)), '');
    assert.equal(renderToString(h(InlineAssist as never, { ...props, open: true })), '');
    assert.equal(renderToString(h(InlineAssist as never, { ...props, defaultOpen: true, mode: 'inline' })), '');
  });

  it('a Dictation part outside InlineAssist is a usage error', () => {
    assert.throws(() => renderToString(h(InlineAssist.Dictation as never, {})), /must be rendered inside <InlineAssist>/);
  });
});
