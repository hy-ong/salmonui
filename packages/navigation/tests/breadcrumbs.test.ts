// Breadcrumbs server rendering: renders through react-dom/server with DOM globals
// removed. Interaction, measured overflow, the ellipsis menu and hydration
// are covered by tests/browser/breadcrumbs.spec.ts.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

const g = globalThis as Record<string, unknown>;
for (const name of ['window', 'document', 'navigator', 'HTMLElement', 'requestAnimationFrame', 'getComputedStyle', 'ResizeObserver', 'matchMedia']) {
  try {
    delete g[name];
  } catch {}
  if (name in g) Object.defineProperty(g, name, { value: undefined, configurable: true });
}

const { createElement: h, Fragment } = await import('react');
const { renderToString } = await import('react-dom/server');
const { Breadcrumbs, BreadcrumbItem, BREADCRUMBS_DEFAULT_LOCALE_TEXT } = await import('@salmonui/navigation/breadcrumbs');

type Props = Record<string, unknown>;
const trail = (props: Props = {}, count = 3, item: (i: number) => Props = () => ({})) =>
  renderToString(
    h(
      Breadcrumbs,
      props,
      Array.from({ length: count }, (_, i) => h(BreadcrumbItem, { key: i, href: i === count - 1 ? undefined : `/p${i}`, ...item(i) }, `Item ${i}`)),
    ),
  );
const tag = (html: string, pattern: RegExp): string => {
  const m = html.match(pattern);
  assert.ok(m, `no match for ${pattern}`);
  return m[0];
};
const items = (html: string): string[] => html.match(/<li[^>]*class="salmon-breadcrumbs-item[^"]*"[^>]*>/g) ?? [];
const hiddenIndexes = (html: string): number[] =>
  items(html)
    .filter((li) => / hidden=""/.test(li) && /data-index/.test(li))
    .map((li) => Number(li.match(/data-index="(\d+)"/)?.[1]));
const ellipsisLi = (html: string): string => tag(html, /<li[^>]*salmon-breadcrumbs-more[^>]*>/);

describe('structure and accessibility', () => {
  it('renders a <nav> landmark named by localeText.label with an <ol> of <li> items', () => {
    const html = trail();
    const nav = tag(html, /<nav[^>]*>/);
    assert.match(nav, /aria-label="Breadcrumb"/);
    assert.match(nav, /class="salmon-breadcrumbs"/);
    assert.match(nav, /data-overflow="menu"/);
    assert.match(html, /<ol class="salmon-breadcrumbs-list"[^>]*><li/);
    assert.equal(items(html).filter((li) => /data-index/.test(li)).length, 3);
    assert.equal(BREADCRUMBS_DEFAULT_LOCALE_TEXT.label, 'Breadcrumb');
  });

  it('items with href are links; items without href are text', () => {
    const html = trail({}, 3, (i) => (i === 1 ? { href: undefined } : {}));
    assert.match(html, /<a class="salmon-breadcrumbs-link" href="\/p0">Item 0<\/a>/);
    assert.match(html, /<span class="salmon-breadcrumbs-text">Item 1<\/span>/);
  });

  it('the default separator is CSS (no separator markup); a custom separator is aria-hidden', () => {
    const plain = trail();
    assert.doesNotMatch(plain, /salmon-breadcrumbs-separator/);
    assert.doesNotMatch(tag(plain, /<nav[^>]*>/), /data-separator/);
    const custom = trail({ separator: '/' });
    assert.match(tag(custom, /<nav[^>]*>/), /data-separator="custom"/);
    // One per item after the first, plus one in the (hidden) ellipsis item.
    assert.equal(custom.match(/<span class="salmon-breadcrumbs-separator" aria-hidden="true">\/<\/span>/g)?.length, 3);
    assert.doesNotMatch(tag(custom, /<li[^>]*data-index="0"[^>]*>.*?<\/li>/), /separator/);
  });

  it('localeText, aria-label and aria-labelledby name the landmark', () => {
    assert.match(tag(trail({ localeText: { label: 'Fil d’Ariane' } }), /<nav[^>]*>/), /aria-label="Fil d’Ariane"/);
    assert.match(tag(trail({ 'aria-label': 'Path' }), /<nav[^>]*>/), /aria-label="Path"/);
    const labelled = tag(trail({ 'aria-labelledby': 'h' }), /<nav[^>]*>/);
    assert.match(labelled, /aria-labelledby="h"/);
    assert.doesNotMatch(labelled, /aria-label=/);
    assert.match(trail({ maxItems: 2, localeText: { ellipsis: 'Mehr' } }), /aria-label="Mehr"/);
  });

  it('fragments and arrays of items are flattened', () => {
    const html = renderToString(h(Breadcrumbs, null, h(Fragment, null, h(BreadcrumbItem, { href: '/' }, 'A'), [h(BreadcrumbItem, { key: 'b', href: '/b' }, 'B')]), h(BreadcrumbItem, null, 'C')));
    assert.deepEqual(
      items(html)
        .filter((li) => /data-index/.test(li))
        .map((li) => li.match(/data-index="(\d+)"/)?.[1]),
      ['0', '1', '2'],
    );
    assert.match(tag(html, /<li[^>]*data-index="2"[^>]*>/), /data-current=""/);
  });

  it('BreadcrumbItem outside Breadcrumbs throws', () => {
    assert.throws(() => renderToString(h(BreadcrumbItem, null, 'x')), /must be inside <Breadcrumbs>/);
  });
});

describe('current item', () => {
  it('defaults to the last item: aria-current="page" on text', () => {
    const html = trail({}, 3, () => ({ href: '/x' }));
    assert.match(html, /<span class="salmon-breadcrumbs-text" aria-current="page">Item 2<\/span>/);
    assert.match(tag(html, /<li[^>]*data-index="2"[^>]*>/), /data-current=""/);
    assert.equal(html.match(/aria-current/g)?.length, 1);
  });

  it('BreadcrumbItem current marks another item; the last one then is a plain link', () => {
    const html = trail({}, 3, (i) => ({ href: `/p${i}`, current: i === 1 }));
    assert.match(html, /<span class="salmon-breadcrumbs-text" aria-current="page">Item 1<\/span>/);
    assert.match(html, /<a class="salmon-breadcrumbs-link" href="\/p2">Item 2<\/a>/);
  });

  it('current={false} on the last item leaves no current item', () => {
    assert.doesNotMatch(trail({}, 3, (i) => ({ href: `/p${i}`, current: i === 2 ? false : undefined })), /aria-current/);
  });

  it('currentNavigable renders the current item as a link with aria-current="page"', () => {
    const html = trail({ currentNavigable: true }, 3, (i) => ({ href: `/p${i}` }));
    assert.match(html, /<a class="salmon-breadcrumbs-link" aria-current="page" href="\/p2">Item 2<\/a>/);
  });
});

describe('maxItems structural collapse', () => {
  it('keeps the first item and the last maxItems - 1 items; the rest are hidden after the ellipsis', () => {
    const html = trail({ maxItems: 3 }, 6);
    assert.deepEqual(hiddenIndexes(html), [1, 2, 3]);
    const more = ellipsisLi(html);
    assert.doesNotMatch(more, /hidden/);
    // The ellipsis follows the first item.
    assert.match(html, /data-index="0"[^>]*>.*?<\/li><li class="salmon-breadcrumbs-item salmon-breadcrumbs-more"/);
    const button = tag(html, /<button[^>]*salmon-breadcrumbs-ellipsis[^>]*>/);
    assert.match(button, /aria-haspopup="menu"/);
    assert.match(button, /aria-expanded="false"/);
    assert.match(button, /aria-label="Show hidden breadcrumbs"/);
    assert.match(button, /type="button"/);
  });

  it('no collapse when the trail fits maxItems: the ellipsis item is hidden', () => {
    const html = trail({ maxItems: 3 }, 3);
    assert.deepEqual(hiddenIndexes(html), []);
    assert.match(ellipsisLi(html), /hidden=""/);
  });

  it('maxItems={1} keeps only the last item', () => {
    assert.deepEqual(hiddenIndexes(trail({ maxItems: 1 }, 4)), [0, 1, 2]);
  });

  it('the same markup renders twice (identical on server and client)', () => {
    assert.equal(trail({ maxItems: 2 }, 5), trail({ maxItems: 2 }, 5));
  });

  it('overflow="expand" renders a plain ellipsis button (no menu popup semantics)', () => {
    const html = trail({ maxItems: 2, overflow: 'expand' }, 5);
    assert.deepEqual(hiddenIndexes(html), [1, 2, 3]);
    const button = tag(html, /<button[^>]*salmon-breadcrumbs-ellipsis[^>]*>/);
    assert.doesNotMatch(button, /aria-haspopup/);
    assert.match(button, /aria-label="Show hidden breadcrumbs"/);
  });

  it('without maxItems, overflow="menu" server-renders every item and marks the measured list', () => {
    const html = trail({}, 6);
    assert.deepEqual(hiddenIndexes(html), []);
    assert.match(html, /<ol class="salmon-breadcrumbs-list" data-overflow-root="">/);
    assert.match(ellipsisLi(html), /hidden="" data-overflow-trigger=""/);
    assert.match(tag(html, /<li[^>]*data-index="0"[^>]*>/), /data-overflow-mode="never"/);
    assert.match(tag(html, /<li[^>]*data-index="5"[^>]*>/), /data-overflow-mode="never"/);
    assert.match(tag(html, /<li[^>]*data-index="2"[^>]*>/), /data-overflow-item="2" data-overflow-priority="2"/);
  });
});

describe('other overflow modes', () => {
  for (const overflow of ['wrap', 'scroll', 'none']) {
    it(`overflow="${overflow}" renders every item, no ellipsis and ignores maxItems`, () => {
      const html = trail({ overflow, maxItems: 2 }, 5);
      assert.match(tag(html, /<nav[^>]*>/), new RegExp(`data-overflow="${overflow}"`));
      assert.deepEqual(hiddenIndexes(html), []);
      assert.doesNotMatch(html, /salmon-breadcrumbs-more|<button/);
      assert.doesNotMatch(html, /data-overflow-root/);
    });
  }
});

describe('customization', () => {
  it('render replaces the link element with the computed props (router link)', () => {
    const Link = (p: Props) => h('a', { ...p, 'data-router': '' });
    const html = trail({}, 2, (i) => (i === 0 ? { render: (p: Props) => h(Link, { ...p }) } : {}));
    assert.match(html, /<a class="salmon-breadcrumbs-link" href="\/p0" data-router="">Item 0<\/a>/);
  });

  it('children are rendered by the application (itemTemplate, beforeItemRender)', () => {
    const html = renderToString(h(Breadcrumbs, null, h(BreadcrumbItem, { href: '/' }, h('strong', { className: 'mine' }, 'Home')), h(BreadcrumbItem, null, 'Page')));
    assert.match(html, /<a class="salmon-breadcrumbs-link" href="\/"><strong class="mine">Home<\/strong><\/a>/);
  });

  it('icon is a decorative ReactNode before the label', () => {
    const html = trail({}, 2, (i) => (i === 0 ? { icon: h('svg', { id: 'home' }) } : {}));
    assert.match(html, /<a class="salmon-breadcrumbs-link" href="\/p0"><span class="salmon-breadcrumbs-icon" aria-hidden="true"><svg id="home"><\/svg><\/span>Item 0<\/a>/);
  });

  it('className and style pass through on the root and on each item', () => {
    const html = trail({ className: 'mine', style: { color: 'red' }, id: 'bc' }, 2, (i) => ({ className: `it${i}`, style: { margin: 1 } }));
    const nav = tag(html, /<nav[^>]*>/);
    assert.match(nav, /class="salmon-breadcrumbs mine"/);
    assert.match(nav, /style="color:red"/);
    assert.match(nav, /id="bc"/);
    assert.match(tag(html, /<li[^>]*data-index="0"[^>]*>/), /class="salmon-breadcrumbs-item it0" style="margin:1px"/);
  });
});

describe('disabled', () => {
  it('a disabled item renders as text with aria-disabled', () => {
    const html = trail({}, 3, (i) => ({ disabled: i === 0 }));
    assert.match(html, /<span class="salmon-breadcrumbs-text" aria-disabled="true">Item 0<\/span>/);
    assert.match(tag(html, /<li[^>]*data-index="0"[^>]*>/), /data-disabled=""/);
  });

  it('disabled on Breadcrumbs disables every item and the ellipsis', () => {
    const html = trail({ disabled: true, maxItems: 2 }, 4, () => ({ href: '/x' }));
    assert.match(tag(html, /<nav[^>]*>/), /data-disabled=""/);
    assert.doesNotMatch(html, /<a /);
    assert.equal(html.match(/aria-disabled="true"/g)?.length, 4);
    assert.match(tag(html, /<button[^>]*salmon-breadcrumbs-ellipsis[^>]*>/), /disabled=""/);
  });

  it('a disabled item with render keeps the element without href', () => {
    const html = trail({}, 2, (i) => (i === 0 ? { disabled: true, render: (p: Props) => h('a', p) } : {}));
    assert.match(html, /<a class="salmon-breadcrumbs-text" aria-disabled="true">Item 0<\/a>/);
  });
});
