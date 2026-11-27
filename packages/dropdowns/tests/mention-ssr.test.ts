// Mention server rendering: renders through
// react-dom/server with DOM globals removed; the server output is exactly
// the root and the user's field, never the popup.
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
const { Mention, MENTION_DEFAULT_LOCALE_TEXT } = await import('@salmonui/dropdowns/mention');

const people = [{ value: 1, label: 'Alice' }, { value: 2, label: 'Bob' }];

describe('Mention SSR', () => {
  it('renders the wrapped textarea with the root class and passthrough, and no popup', () => {
    const html = renderToString(
      createElement(Mention, { data: people, className: 'extra', style: { maxWidth: 400 } }, createElement('textarea', { 'aria-label': 'Comment', defaultValue: 'Hi @Al' })),
    );
    assert.match(html, /^<div class="salmon-mention extra" style="max-width:400px"><textarea aria-label="Comment">Hi @Al<\/textarea><\/div>$/);
    assert.doesNotMatch(html, /listbox|salmon-mention-popup|aria-expanded/);
  });

  it('wraps an <input> child the same way and is deterministic', () => {
    const el = createElement(Mention, { triggers: [{ char: '#', data: ['bug', 'docs'] }] }, createElement('input', { 'aria-label': 'Title' }));
    const a = renderToString(el);
    assert.equal(a, renderToString(el));
    assert.equal(a, '<div class="salmon-mention"><input aria-label="Title"/></div>');
  });

  it('with `target` and no children it renders nothing on the server', () => {
    assert.equal(renderToString(createElement(Mention, { target: { current: null }, data: people })), '');
  });

  it('exports the locale defaults', () => {
    assert.equal(MENTION_DEFAULT_LOCALE_TEXT.noResults, 'No results');
    assert.ok(Object.isFrozen(MENTION_DEFAULT_LOCALE_TEXT));
  });
});
