// RichTextContent server rendering: renders with DOM
// globals removed, the markup is the sanitized value, deterministic, with
// className / style passthrough; the blocks variant renders blocksToHtml.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

const g = globalThis as Record<string, unknown>;
for (const name of ['window', 'document', 'navigator', 'HTMLElement', 'Node', 'DOMParser', 'requestAnimationFrame', 'getComputedStyle']) {
  try {
    delete g[name];
  } catch {}
  if (name in g) Object.defineProperty(g, name, { value: undefined, configurable: true });
}

const { createElement } = await import('react');
const { renderToString } = await import('react-dom/server');
const rt = await import('@salmonui/rich-text');
const { RichTextContent, sanitizeHtml, blocksToHtml, htmlToBlocks } = rt;

describe('RichTextContent SSR', () => {
  it('renders the sanitized value inside the root, with className, style and other props passed through', () => {
    const value = '<h2>Hi</h2><p onclick="x">a <b>b</b><script>alert(1)</script><img src=x onerror=alert(1)></p>';
    const html = renderToString(createElement(RichTextContent, { value, className: 'extra', style: { maxWidth: 600 }, id: 'c', 'aria-label': 'Preview' }));
    assert.equal(html, `<div style="max-width:600px" id="c" aria-label="Preview" class="salmon-rich-text-content extra">${sanitizeHtml(value)}</div>`);
    assert.equal(sanitizeHtml(value), '<h2>Hi</h2><p>a <strong>b</strong><img src="x"></p>');
  });

  it('is deterministic and identical to what the client renders (the same pure function)', () => {
    const el = createElement(RichTextContent, { value: '<p>x &amp; y</p><ul><li>z</li></ul>' });
    const a = renderToString(el);
    assert.equal(a, renderToString(el));
    assert.equal(a, '<div class="salmon-rich-text-content"><p>x &amp; y</p><ul><li>z</li></ul></div>');
  });

  it('keeps iframes only for embedHosts and applies the sanitize hook', () => {
    const value = '<iframe src="https://www.youtube-nocookie.com/embed/1"></iframe><p><u>u</u></p>';
    assert.equal(renderToString(createElement(RichTextContent, { value })), '<div class="salmon-rich-text-content"><p><u>u</u></p></div>');
    assert.equal(
      renderToString(createElement(RichTextContent, { value, embedHosts: ['www.youtube-nocookie.com'], sanitize: (e) => (e.tag === 'u' ? 'unwrap' : undefined) })),
      '<div class="salmon-rich-text-content"><iframe src="https://www.youtube-nocookie.com/embed/1"></iframe><p>u</p></div>',
    );
  });

  it('renders BlockEditor blocks read-only through blocksToHtml', () => {
    const blocks = htmlToBlocks('<h1>T</h1><ul data-type="checklist"><li data-checked="true">done</li></ul>');
    const html = renderToString(createElement(RichTextContent, { blocks }));
    assert.equal(html, `<div class="salmon-rich-text-content">${blocksToHtml(blocks)}</div>`);
    assert.match(html, /<h1 data-block-id="b0">T<\/h1><ul data-type="checklist"><li data-checked="true" data-block-id="b1"><p>done<\/p><\/li><\/ul>/);
  });

  it('renders an empty root without value or blocks', () => {
    assert.equal(renderToString(createElement(RichTextContent, {})), '<div class="salmon-rich-text-content"></div>');
  });

  it('the root entry loads without DOM globals and without ProseMirror', () => {
    assert.equal(typeof rt.sanitizeHtml, 'function');
    assert.equal(typeof rt.cleanPastedHtml, 'function');
    assert.equal(typeof rt.htmlToText, 'function');
  });
});
