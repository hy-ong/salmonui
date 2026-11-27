// Mention on a contenteditable target on the server: with `editor`
// (or a pending `editor={null}`) it renders nothing and reads nothing.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

const g = globalThis as Record<string, unknown>;
for (const name of ['window', 'document', 'navigator', 'HTMLElement', 'requestAnimationFrame', 'getComputedStyle']) {
  try {
    delete g[name];
  } catch {}
  if (name in g) Object.defineProperty(g, name, { value: undefined, configurable: true });
}

const { createElement } = await import('react');
const { renderToString } = await import('react-dom/server');
const { Mention } = await import('@salmonui/dropdowns/mention');

describe('Mention with an editor target on the server', () => {
  it('renders nothing for an editor target and for a pending one', () => {
    const editor = {
      element: {} as HTMLElement,
      getTextBeforeCaret: () => {
        throw new Error('read during render');
      },
      getCaretRect: () => null,
      insertMention: () => {},
      subscribe: () => {
        throw new Error('subscribed during render');
      },
    };
    assert.equal(renderToString(createElement(Mention, { editor, data: ['a'] })), '');
    assert.equal(renderToString(createElement(Mention, { editor: null, data: ['a'] })), '');
  });

});
