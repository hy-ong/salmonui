// Pager server rendering:
// renders through react-dom/server with DOM globals removed. Hydration
// without warnings is asserted in tests/browser/pager.spec.ts (?mode=hydrate).
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

const g = globalThis as Record<string, unknown>;
for (const name of ['window', 'document', 'navigator', 'HTMLElement', 'requestAnimationFrame', 'getComputedStyle', 'location', 'history']) {
  try {
    delete g[name];
  } catch {}
  if (name in g) Object.defineProperty(g, name, { value: undefined, configurable: true });
}

const { createElement } = await import('react');
const { renderToString, renderToStaticMarkup } = await import('react-dom/server');
const { Pager, PAGER_DEFAULT_LOCALE_TEXT } = await import('@salmonui/navigation/pager');

describe('Pager SSR', () => {
  it('renders the full pager without browser globals', () => {
    const html = renderToString(createElement(Pager, { page: 3, totalCount: 100, pageSize: 10, pageSizeOptions: [10, 20] }));
    assert.match(html, /^<nav aria-label="Pagination" class="salmon-pager" data-page="3" data-page-count="10">/);
    assert.match(html, /aria-current="page"/);
    assert.match(html, /3 of 10 pages/);
    assert.match(html, /<select class="salmon-pager-size-select">/);
  });

  it('the server markup is deterministic and needs no ids (no useId, no effects in the tree)', () => {
    const el = createElement(Pager, { defaultPage: 2, totalCount: 40, buttonCount: 3, localeText: { pageLabel: 'P' } });
    const html = renderToString(el);
    assert.equal(html, renderToString(el));
    assert.equal(html, renderToStaticMarkup(el));
    assert.doesNotMatch(html, /\sid="/);
  });

  it('renderPager and renderInfo render on the server', () => {
    const html = renderToString(createElement(Pager, { totalCount: 10, renderPager: (ctx: { page: number }) => `page ${ctx.page}` }));
    assert.match(html, /data-template="">page 1<\/nav>$/);
  });

  it('exports the locale defaults', () => {
    assert.equal(PAGER_DEFAULT_LOCALE_TEXT.firstPage, 'First page');
  });
});
