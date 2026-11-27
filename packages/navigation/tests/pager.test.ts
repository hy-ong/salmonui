import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { createElement as h, type ReactElement } from 'react';
import { renderToString } from 'react-dom/server';
import { Pager, PAGER_DEFAULT_LOCALE_TEXT, type PagerPageSizeContext, type PagerTemplateContext } from '@salmonui/navigation/pager';
import { pageSet as gridPageSet } from '../../data-grid/dist/data-grid/Pager.js';
import { pageSet } from '../dist/internal/page-set.js';
import { formatPagerText } from '../dist/pager/locale.js';
import { clampPage, DEFAULT_PAGE_SIZE_OPTIONS, pageCountOf, pagerKeyCommand, pageSizeOptionsOf, resizedPage } from '../dist/pager/model.js';

// Standalone Pager: the
// pure model (page count, clamp keys) and the server markup.
// Interaction (clicks, keys, events, focus, narrow layout) runs in
// tests/browser/pager.spec.ts; axe and ARIA in tests/browser/pager-a11y.spec.ts.

const render = (el: ReactElement): string => renderToString(el);
const pager = (props: Record<string, unknown>): string => render(h(Pager, { totalCount: 1000, ...props } as never));
const buttons = (html: string): string[] => [...html.matchAll(/<button[^>]*>/g)].map((m) => m[0]);
const numbers = (html: string): number[] => buttons(html).filter((b) => b.includes('data-part="number"')).map((b) => Number(/data-page="(\d+)"/.exec(b)![1]));
const part = (html: string, name: string): string | undefined => buttons(html).find((b) => b.includes(`data-part="${name}"`));
const text = (html: string): string => html.replace(/<[^>]+>/g, '').replace(/&#x27;/g, "'");
const NONE = { ctrlKey: false, altKey: false, metaKey: false, shiftKey: false };

describe('Pager model', () => {
  it('page count is ceil(totalCount / pageSize), at least 1', () => {
    assert.equal(pageCountOf(1000, 12), 84);
    assert.equal(pageCountOf(100, 10), 10);
    assert.equal(pageCountOf(0, 10), 1);
  });

  it('clampPage keeps the page in 1..max', () => {
    assert.equal(clampPage(0, 5), 1);
    assert.equal(clampPage(9, 5), 5);
    assert.equal(clampPage(2.7, 5), 2);
    assert.equal(clampPage(Number.NaN, 5), 1);
  });

  it('a page-size change keeps the first row and clamps to the new page count', () => {
    assert.equal(resizedPage(3, 10, 20, 100), 2, 'row 21 is on page 2 of size 20');
    assert.equal(resizedPage(10, 10, 50, 100), 2);
    assert.equal(resizedPage(5, 10, 1000, 100), 1);
    assert.equal(resizedPage(4, 10, 5, null), 7, 'unknown total: no upper clamp');
  });

  it('pageSizeOptions: true means All, 5, 10, 12, 20; All is dropped while the total is unknown', () => {
    assert.deepEqual(pageSizeOptionsOf(true, true), ['all', 5, 10, 12, 20]);
    assert.equal(pageSizeOptionsOf(true, true), DEFAULT_PAGE_SIZE_OPTIONS);
    assert.deepEqual(pageSizeOptionsOf(true, false), [5, 10, 12, 20]);
    assert.deepEqual(pageSizeOptionsOf(false, true), []);
    assert.deepEqual(pageSizeOptionsOf(undefined, true), []);
    assert.deepEqual(pageSizeOptionsOf([20, 50, 'all'], true), [20, 50, 'all']);
  });

  it('pager keys are the Data Grid table, ArrowLeft/Right mirrored in RTL', () => {
    assert.equal(pagerKeyCommand('PageUp', NONE, false), 'previous');
    assert.equal(pagerKeyCommand('ArrowLeft', NONE, false), 'previous');
    assert.equal(pagerKeyCommand('PageDown', NONE, false), 'next');
    assert.equal(pagerKeyCommand('ArrowRight', NONE, false), 'next');
    assert.equal(pagerKeyCommand('Home', NONE, false), 'first');
    assert.equal(pagerKeyCommand('End', NONE, false), 'last');
    assert.equal(pagerKeyCommand('PageUp', { ...NONE, ctrlKey: true, altKey: true }, false), 'first');
    assert.equal(pagerKeyCommand('PageDown', { ...NONE, ctrlKey: true, altKey: true }, false), 'last');
    assert.equal(pagerKeyCommand('ArrowLeft', NONE, true), 'next');
    assert.equal(pagerKeyCommand('ArrowRight', NONE, true), 'previous');
    assert.equal(pagerKeyCommand('PageUp', NONE, true), 'previous', 'PageUp keeps its meaning in RTL');
    assert.equal(pagerKeyCommand('Enter', NONE, false), null, 'Enter / Space activate the focused button natively');
    assert.equal(pagerKeyCommand('ArrowLeft', { ...NONE, shiftKey: true }, false), null);
    assert.equal(pagerKeyCommand('Home', { ...NONE, ctrlKey: true }, false), null);
  });

  it('the page-set math matches the Data Grid pageSet()', () => {
    for (const [page, count, visible] of [[1, 84, 8], [9, 84, 8], [84, 84, 8], [3, 10, 0], [7, 7, 3], [5, 100, 2.5]] as const) assert.deepEqual(pageSet(page, count, visible), gridPageSet(page, count, visible));
    assert.deepEqual(pageSet(1, 84, 8), { start: 1, end: 8 });
    assert.deepEqual(pageSet(9, 84, 8), { start: 9, end: 16 });
    assert.deepEqual(pageSet(84, 84, 8), { start: 81, end: 84 });
    assert.deepEqual(pageSet(3, 10, 0), { start: 3, end: 3 });
  });

  it('the pager module graph imports neither @salmonui/data-grid nor data-grid files', () => {
    // Walks every runtime import of the entry, through relative modules and the @salmonui/core internals.
    const seen = new Set<string>();
    const walk = (url: string): void => {
      if (seen.has(url)) return;
      seen.add(url);
      const source = readFileSync(new URL(url), 'utf8');
      for (const m of source.matchAll(/(?:from\s*|import\s*\(\s*|^import\s*)['"]([^'"]+)['"]/gm)) {
        const spec = m[1] as string;
        assert.doesNotMatch(spec, /data-grid/, `${url} imports ${spec}`);
        if (spec.startsWith('.')) walk(new URL(spec, url).href);
        else if (spec.startsWith('@salmonui/')) walk(import.meta.resolve(spec));
      }
    };
    walk(import.meta.resolve('@salmonui/navigation/pager'));
    assert.ok([...seen].some((u) => u.includes('/pager/')), 'the walk reached the pager modules');
    assert.ok([...seen].some((u) => u.includes('/core/dist/internal/')), 'the walk reached the core internals');
  });
});

describe('Pager locale', () => {
  it('exports frozen English defaults with the Data Grid pager strings', () => {
    assert.ok(Object.isFrozen(PAGER_DEFAULT_LOCALE_TEXT));
    assert.equal(PAGER_DEFAULT_LOCALE_TEXT.label, 'Pagination');
    assert.equal(PAGER_DEFAULT_LOCALE_TEXT.pagerInfo, '{page} of {pageCount} pages');
    assert.equal(PAGER_DEFAULT_LOCALE_TEXT.pageLabel, '');
    assert.deepEqual(PAGER_DEFAULT_LOCALE_TEXT.pagerItems, { one: '(1 item)', other: '({count} items)' });
  });

  it('formats templates and plural forms', () => {
    assert.equal(formatPagerText('{page} of {pageCount}', { page: 2, pageCount: 9 }), '2 of 9');
    assert.equal(formatPagerText(PAGER_DEFAULT_LOCALE_TEXT.pagerItems, { count: 1 }), '(1 item)');
    assert.equal(formatPagerText(PAGER_DEFAULT_LOCALE_TEXT.pagerItems, { count: 5 }), '(5 items)');
    assert.equal(formatPagerText({ zero: 'none', other: '{count}' }, { count: 0 }), 'none');
    assert.equal(formatPagerText('{missing}', {}), '{missing}');
    assert.equal(formatPagerText({ other: '{count}' }, { count: 3 }, 'not a locale!'), '3', 'a bad locale falls back to other');
    // Numbers use the locale's grouping (no "(22095 items)").
    assert.equal(formatPagerText(PAGER_DEFAULT_LOCALE_TEXT.pagerItems, { count: 22_095 }, 'en-US'), '(22,095 items)');
    assert.equal(formatPagerText(PAGER_DEFAULT_LOCALE_TEXT.pagerItems, { count: 22_095 }, 'de-DE'), '(22.095 items)');
    assert.equal(formatPagerText({ other: '{count}' }, { count: 1_234 }, 'not a locale!'), '1234', 'a bad locale keeps the plain number');
  });

  it('a localeText partial overrides only its keys, including the plural item count', () => {
    const html = pager({ localeText: { label: 'Seiten', nextPage: 'Weiter', pagerItems: { one: '(1 Eintrag)', other: '({count} Einträge)' } }, locale: 'de' });
    assert.match(html, /<nav aria-label="Seiten"/);
    assert.match(part(html, 'next')!, /aria-label="Weiter"/);
    assert.match(part(html, 'previous')!, /aria-label="Previous page"/);
    assert.match(text(html), /1 of 84 pages \(1\.000 Einträge\)/);
  });
});

describe('Pager server markup', () => {
  it('renders a navigation landmark with labelled first / previous / next / last buttons and aria-current', () => {
    const html = pager({});
    assert.match(html, /^<nav aria-label="Pagination" class="salmon-pager" data-page="1" data-page-count="84">/);
    assert.match(part(html, 'first')!, /aria-label="First page"/);
    assert.match(part(html, 'first')!, /aria-disabled="true"/);
    assert.match(part(html, 'previous')!, /aria-label="Previous page".*aria-disabled="true"/);
    assert.match(part(html, 'next')!, /data-page="2" aria-label="Next page"/);
    assert.doesNotMatch(part(html, 'next')!, /aria-disabled/);
    assert.match(part(html, 'last')!, /data-page="84" aria-label="Last page"/);
    const current = buttons(html).filter((b) => b.includes('aria-current'));
    assert.equal(current.length, 1);
    assert.match(current[0]!, /aria-current="page"/);
    assert.match(current[0]!, /aria-label="Page 1"/);
    for (const b of buttons(html)) assert.match(b, /type="button"/);
  });

  it('page / defaultPage choose the rendered page, 1-based, clamped to the page count', () => {
    assert.match(pager({ page: 20 }), /data-page="20"/);
    assert.match(pager({ defaultPage: 3 }), /aria-current="page"[^>]*>|data-page="3"/);
    assert.match(text(pager({ defaultPage: 3 })), /3 of 84 pages/);
    assert.match(pager({ page: 999 }), /^<nav[^>]*data-page="84"/);
    assert.match(pager({ page: 0 }), /^<nav[^>]*data-page="1"/);
  });

  it('pageSize / defaultPageSize (default 12) drive the page count', () => {
    assert.match(text(pager({})), /1 of 84 pages \(1,000 items\)/);
    assert.match(text(pager({ pageSize: 100 })), /1 of 10 pages/);
    assert.match(text(pager({ defaultPageSize: 50 })), /1 of 20 pages/);
  });

  it('buttonCount numeric buttons at a time (default 8) with … buttons for the page sets', () => {
    assert.deepEqual(numbers(pager({})), [1, 2, 3, 4, 5, 6, 7, 8]);
    const html = pager({ page: 20 });
    assert.deepEqual(numbers(html), [17, 18, 19, 20, 21, 22, 23, 24]);
    assert.match(part(html, 'previous-set')!, /data-page="16" aria-label="Previous pages"/);
    assert.match(part(html, 'next-set')!, /data-page="25" aria-label="Next pages"/);
    assert.deepEqual(numbers(pager({ page: 6, buttonCount: 4 })), [5, 6, 7, 8]);
    const last = pager({ page: 84 });
    assert.deepEqual(numbers(last), [81, 82, 83, 84]);
    assert.equal(part(last, 'next-set'), undefined);
    assert.match(part(last, 'last')!, /aria-disabled="true"/);
    assert.equal(part(pager({}), 'previous-set'), undefined);
  });

  it('totalCount gives the item count; totalCount={null} with hasNextPage pages an unknown total', () => {
    const unknown = pager({ totalCount: null, page: 3, hasNextPage: true });
    assert.equal(part(unknown, 'last'), undefined, 'no last page without a total');
    assert.deepEqual(numbers(unknown), [1, 2, 3, 4]);
    assert.doesNotMatch(part(unknown, 'next')!, /aria-disabled/);
    assert.match(text(unknown), /Page 3/);
    assert.doesNotMatch(unknown, /data-page-count/);
    const end = pager({ totalCount: null, page: 3 });
    assert.match(part(end, 'next')!, /aria-disabled="true"/);
    assert.deepEqual(numbers(end), [1, 2, 3]);
    assert.match(text(pager({ totalCount: 0 })), /1 of 1 pages \(0 items\)/);
  });

  it('showInfo (default true) renders the localized "1 of 10 pages (100 items)" info', () => {
    const html = pager({ totalCount: 100, pageSize: 10 });
    assert.match(html, /<div class="salmon-pager-info"><span class="salmon-pager-pages">1 of 10 pages<\/span> <span class="salmon-pager-items">\(100 items\)<\/span><\/div>/);
    assert.match(text(pager({ totalCount: 1, pageSize: 10 })), /\(1 item\)/);
    assert.doesNotMatch(pager({ showInfo: false }), /salmon-pager-info/);
  });

  it('renderInfo replaces the info; children render after it as an external message', () => {
    const html = pager({ renderInfo: (ctx: PagerTemplateContext) => `Showing ${(ctx.page - 1) * ctx.pageSize + 1}-${ctx.page * ctx.pageSize} of ${ctx.totalCount}`, page: 2 });
    assert.match(html, /<div class="salmon-pager-info">Showing 13-24 of 1000<\/div>/);
    const msg = render(h(Pager, { totalCount: 10 }, h('em', null, 'Updated just now')));
    assert.match(msg, /salmon-pager-info.*<div class="salmon-pager-message"><em>Updated just now<\/em><\/div><\/nav>$/);
    assert.doesNotMatch(pager({}), /salmon-pager-message/);
  });

  it('localeText.pageLabel shows text before each page number', () => {
    const html = pager({ localeText: { pageLabel: 'Page' } });
    assert.match(html, /<button[^>]*data-part="number" data-page="1"[^>]*><span class="salmon-pager-page-label">Page <\/span>1<\/button>/);
    assert.doesNotMatch(pager({}), /salmon-pager-page-label/);
  });

  it('renderPager replaces the content inside the landmark and receives the context', () => {
    let seen: PagerTemplateContext | undefined;
    const html = pager({
      page: 4,
      pageSize: 25,
      renderPager: (ctx: PagerTemplateContext) => {
        seen = ctx;
        return h('span', { className: 'custom' }, `${ctx.page}/${ctx.pageCount}`);
      },
    });
    assert.match(html, /^<nav aria-label="Pagination" class="salmon-pager" data-page="4" data-page-count="40" data-template=""><span class="custom">4\/40<\/span><\/nav>$/);
    assert.equal(seen!.pageSize, 25);
    assert.equal(seen!.totalCount, 1000);
    assert.equal(seen!.hasNextPage, true);
    assert.equal(typeof seen!.goToPage, 'function');
    assert.equal(typeof seen!.setPageSize, 'function');
    const wrapped = pager({ renderPager: (ctx: PagerTemplateContext) => h('div', { className: 'wrap' }, ctx.defaultPager) });
    assert.match(wrapped, /<div class="wrap"><div class="salmon-pager-buttons">/);
  });

  it('pageSizeOptions renders a native select labelled by localeText.pageSize', () => {
    const html = pager({ pageSizeOptions: true });
    assert.match(html, /<label class="salmon-pager-size"><select class="salmon-pager-size-select">/);
    assert.deepEqual([...html.matchAll(/<option value="([^"]+)"( selected="")?>([^<]*)<\/option>/g)].map((m) => `${m[1]}:${m[3]}${m[2] ? '*' : ''}`), ['all:All', '5:5', '10:10', '12:12*', '20:20']);
    assert.match(html, /<span class="salmon-pager-size-label">Items per page<\/span>/);
    const odd = pager({ pageSizeOptions: [20, 50], pageSize: 30 });
    assert.match(odd, /<option value="30" selected="">30<\/option>/, 'a page size outside the options is still shown');
    assert.match(pager({ pageSizeOptions: ['all', 10], pageSize: 1000 }), /<option value="all" selected="">All<\/option>/);
    assert.doesNotMatch(pager({}), /<select/);
    assert.doesNotMatch(pager({ pageSizeOptions: true, totalCount: null }), /value="all"/);
  });

  it('renderPageSize replaces the native select (seam for the Dropdowns Select)', () => {
    let seen: PagerPageSizeContext | undefined;
    const html = pager({
      pageSizeOptions: [10, 'all'],
      pageSize: 10,
      renderPageSize: (ctx: PagerPageSizeContext) => {
        seen = ctx;
        return h('output', null, String(ctx.value));
      },
    });
    assert.match(html, /<div class="salmon-pager-size"><output>10<\/output><\/div>/);
    assert.doesNotMatch(html, /<select/);
    assert.deepEqual(seen!.options, [{ value: 10, label: '10' }, { value: 'all', label: 'All' }]);
    assert.equal(seen!.label, 'Items per page');
  });

  it('className, style, id and DOM props reach the <nav>', () => {
    const html = pager({ className: 'mine', style: { maxWidth: 600 }, id: 'p', title: 'Pages', 'data-test': 'x', 'aria-label': 'Results pages' });
    const nav = /^<nav[^>]*>/.exec(html)![0];
    assert.match(nav, /aria-label="Results pages"/);
    assert.match(nav, /class="salmon-pager mine"/);
    assert.match(nav, /style="max-width:600px"/);
    assert.match(nav, /id="p"/);
    assert.match(nav, /title="Pages"/);
    assert.match(nav, /data-test="x"/);
  });

  it('icons replace the built-in first / previous / next / last icons', () => {
    const html = pager({ icons: { next: h('svg', { id: 'n' }) } });
    assert.match(html, /data-part="next"[^>]*><span class="salmon-pager-icon" aria-hidden="true"><svg id="n"><\/svg><\/span>/);
    assert.match(html, /data-part="last"[^>]*><span class="salmon-pager-icon" aria-hidden="true"><\/span>/);
  });

  it('is deterministic (no ids, no browser reads during render)', () => {
    const el = h(Pager, { totalCount: 500, pageSizeOptions: true, defaultPage: 7 });
    assert.equal(render(el), render(el));
  });
});
