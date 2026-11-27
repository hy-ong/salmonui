// PdfViewer server rendering: react-dom/server with DOM
// globals removed. The server renders the toolbar shell and sized page
// placeholders from `pageSizes`; it never loads pdf.js.
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { describe, it } from 'node:test';

const g = globalThis as Record<string, unknown>;
for (const name of ['window', 'document', 'navigator', 'HTMLElement', 'requestAnimationFrame', 'getComputedStyle', 'Worker', 'ResizeObserver']) {
  try {
    delete g[name];
  } catch {}
  if (name in g) Object.defineProperty(g, name, { value: undefined, configurable: true });
}

const resolved: string[] = [];
registerHooks({
  resolve(specifier, context, next) {
    resolved.push(specifier);
    return next(specifier, context);
  },
});

const { createElement } = await import('react');
const { renderToString } = await import('react-dom/server');
const { PdfViewer, PDF_VIEWER_DEFAULT_LOCALE_TEXT } = await import('@salmonui/pdf-viewer');

const render = (props: Record<string, unknown>) => renderToString(createElement(PdfViewer, props));

describe('PdfViewer SSR', () => {
  it('renders sized placeholders for the pages in the initial window, the toolbar and the loading status', () => {
    const html = render({ src: '/doc.pdf', pageSizes: { width: 612, height: 792 }, pageCount: 20, zoom: 1, 'aria-label': 'Report' });
    assert.match(html, /^<div role="region" aria-label="Report" class="salmon-pdf-viewer" data-status="loading" data-scroll-mode="vertical"/);
    assert.match(html, /class="salmon-pdf-viewer__pages" style="width:848px;height:\d+px"/);
    // Virtualized on the server too: only the page in the fixed initial viewport (816 x 1056 px).
    const regions = [...html.matchAll(/aria-label="Page (\d+) of 20"/g)].map((m) => Number(m[1]));
    assert.deepEqual(regions, [1]);
    assert.match(html, /data-page-number="1" style="left:16px;top:16px;width:816px;height:1056px;--scale-factor:1.3333333333333333;--total-scale-factor:1.3333333333333333/);
    assert.match(html, /aria-label="PDF tools" role="toolbar"/);
    assert.match(html, />of 20</);
    assert.match(html, /role="status">Loading document…</);
    assert.doesNotMatch(html, /<canvas/);
    assert.equal(resolved.filter((s) => s.includes('pdfjs')).length, 0, 'pdf.js is never resolved on the server');
  });

  it('is deterministic; fit zoom modes use the fixed initial viewport', () => {
    const element = createElement(PdfViewer, { src: new Uint8Array(4), pageSizes: [{ width: 612, height: 792 }, { width: 842, height: 595 }], zoom: 'page-width' });
    const html = renderToString(element);
    assert.equal(html, renderToString(element));
    assert.match(html, /aria-label="Page 2 of 2"/);
  });

  it('without a source shows the empty state; localeText, className, style and passthrough attributes apply', () => {
    const html = render({ className: 'mine', style: { height: 300 }, 'data-x': '1', id: 'v', localeText: { empty: 'Kein Dokument', toolbar: 'Werkzeuge' }, toolbar: ['previous', 'next', '|', { id: 'custom', label: 'Custom' }] });
    assert.match(html, /id="v"/);
    assert.match(html, /data-x="1"/);
    assert.match(html, /class="salmon-pdf-viewer mine" style="height:300px"/);
    assert.match(html, /data-status="empty"/);
    assert.match(html, />Kein Dokument</);
    assert.match(html, /aria-label="Werkzeuge"/);
    assert.match(html, /data-item-id="custom"/);
    assert.equal(PDF_VIEWER_DEFAULT_LOCALE_TEXT.pageLabel, 'Page {page} of {count}');
    assert.ok(Object.isFrozen(PDF_VIEWER_DEFAULT_LOCALE_TEXT));
  });

  it('toolbar={false} renders no toolbar', () => {
    assert.doesNotMatch(render({ toolbar: false }), /role="toolbar"/);
  });
});
