import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createElement as h, type ReactElement, type ReactNode } from 'react';
import { renderToString } from 'react-dom/server';
import { Tab, TabList, TabPanel, Tabs, TABS_DEFAULT_LOCALE_TEXT, type TabsProps } from '@salmonui/navigation/tabs';

// Server markup of Tabs.
// Interaction is covered by tests/browser/tabs.spec.ts, axe and ARIA
// snapshots by tests/browser/tabs-a11y.spec.ts.

const render = (el: ReactElement): string => renderToString(el);
const tags = (html: string, pattern: RegExp): string[] => html.match(new RegExp(pattern.source, 'g')) ?? [];
const tag = (html: string, pattern: RegExp): string => {
  const m = html.match(pattern);
  assert.ok(m, `no match for ${pattern}`);
  return m[0];
};
const attr = (el: string, name: string): string | undefined => el.match(new RegExp(`\\s${name}="([^"]*)"`))?.[1];

function basic(props: Partial<TabsProps> = {}, extra: ReactNode = null): ReactElement {
  return h(
    Tabs,
    { defaultValue: 'a', ...props },
    h(TabList, { 'aria-label': 'Sections' }, h(Tab, { value: 'a' }, 'Alpha'), h(Tab, { value: 'b' }, 'Bravo'), h(Tab, { value: 'c', disabled: true }, 'Charlie'), extra),
    h(TabPanel, { value: 'a' }, h('p', { id: 'content-a' }, 'Panel A')),
    h(TabPanel, { value: 'b' }, h('p', { id: 'content-b' }, 'Panel B')),
    h(TabPanel, { value: 'c' }, h('p', { id: 'content-c' }, 'Panel C')),
  );
}

describe('structure and ARIA', () => {
  it('renders an APG tablist with tab buttons and tabpanels wired by aria-controls / aria-labelledby', () => {
    const html = render(basic());
    const list = tag(html, /<div[^>]*role="tablist"[^>]*>/);
    assert.equal(attr(list, 'aria-label'), 'Sections');
    assert.equal(attr(list, 'aria-orientation'), 'horizontal');
    const tabs = tags(html, /<button[^>]*role="tab"[^>]*>/);
    assert.equal(tabs.length, 3);
    const panels = tags(html, /<div[^>]*role="tabpanel"[^>]*>/);
    assert.equal(panels.length, 3);
    for (let i = 0; i < 3; i++) {
      assert.equal(attr(tabs[i]!, 'type'), 'button');
      assert.equal(attr(tabs[i]!, 'aria-controls'), attr(panels[i]!, 'id'));
      assert.equal(attr(panels[i]!, 'aria-labelledby'), attr(tabs[i]!, 'id'));
    }
    assert.match(html, /Alpha/);
    assert.match(html, /class="salmon-tab-label">Bravo</);
  });

  it('the selected tab has aria-selected="true" and the only tabindex="0"; other panels are hidden', () => {
    const html = render(basic());
    const tabs = tags(html, /<button[^>]*role="tab"[^>]*>/);
    assert.deepEqual(
      tabs.map((t) => [attr(t, 'aria-selected'), attr(t, 'tabindex')]),
      [
        ['true', '0'],
        ['false', '-1'],
        ['false', '-1'],
      ],
    );
    const panels = tags(html, /<div[^>]*role="tabpanel"[^>]*>/);
    assert.deepEqual(
      panels.map((p) => / hidden=""/.test(p)),
      [false, true, true],
    );
    assert.equal(attr(panels[0]!, 'tabindex'), '0');
  });

  it('a disabled tab carries aria-disabled="true"; a hidden tab keeps its element with hidden', () => {
    const html = render(basic({}, h(Tab, { value: 'd', hidden: true }, 'Delta')));
    assert.equal(attr(tag(html, /<button[^>]*data-value="c"[^>]*>/), 'aria-disabled'), 'true');
    assert.match(tag(html, /<button[^>]*data-value="d"[^>]*>/), / hidden=""/);
  });

  it('tab values with spaces and symbols give valid, unique DOM ids', () => {
    const html = render(h(Tabs, { defaultValue: 'a b' }, h(TabList, null, h(Tab, { value: 'a b' }, 'One'), h(Tab, { value: 'a_b' }, 'Two')), h(TabPanel, { value: 'a b' }, 'x')));
    const ids = tags(html, /<button[^>]*role="tab"[^>]*>/).map((t) => attr(t, 'id')!);
    assert.equal(new Set(ids).size, 2);
    for (const id of ids) assert.doesNotMatch(id, /\s/);
    assert.equal(attr(tag(html, /<div[^>]*role="tabpanel"[^>]*>/), 'aria-labelledby'), ids[0]);
  });
});

describe('icons', () => {
  it('icon is a decorative ReactNode; iconPlacement reaches data-icon-placement (default start)', () => {
    const html = render(h(Tabs, { defaultValue: 'a' }, h(TabList, null, h(Tab, { value: 'a', icon: h('svg', { id: 'i1' }) }, 'A'), h(Tab, { value: 'b', icon: h('svg', { id: 'i2' }), iconPlacement: 'top' }, 'B'), h(Tab, { value: 'c' }, 'C'))));
    assert.match(html, /<span class="salmon-tab-icon" aria-hidden="true"><svg id="i1">/);
    assert.equal(attr(tag(html, /<button[^>]*data-value="a"[^>]*>/), 'data-icon-placement'), 'start');
    assert.equal(attr(tag(html, /<button[^>]*data-value="b"[^>]*>/), 'data-icon-placement'), 'top');
    assert.equal(attr(tag(html, /<button[^>]*data-value="c"[^>]*>/), 'data-icon-placement'), undefined);
    for (const p of ['end', 'bottom'] as const) {
      assert.match(render(h(Tabs, { defaultValue: 'a' }, h(TabList, null, h(Tab, { value: 'a', icon: 'x', iconPlacement: p }, 'A')))), new RegExp(`data-icon-placement="${p}"`));
    }
  });
});

describe('value', () => {
  it('defaultValue and value select the tab; value wins over defaultValue', () => {
    const sel = (html: string): string | undefined => attr(tag(html, /<button[^>]*aria-selected="true"[^>]*>/), 'data-value');
    assert.equal(sel(render(basic({ defaultValue: 'b' }))), 'b');
    assert.equal(sel(render(basic({ value: 'b', defaultValue: 'a' }))), 'b');
  });

  it('without value or defaultValue the server selects nothing (the client picks the first enabled tab after mount)', () => {
    const html = render(basic({ defaultValue: undefined } as unknown as Partial<TabsProps>));
    assert.doesNotMatch(html, /aria-selected="true"/);
    assert.equal(tags(html, /role="tabpanel"[^>]* hidden=""/).length, 3);
  });
});

describe('placement', () => {
  it('placement reaches data-placement; start and end make the list vertical', () => {
    for (const placement of ['top', 'bottom', 'start', 'end'] as const) {
      const html = render(basic({ placement }));
      const root = tag(html, /<div[^>]*class="salmon-tabs"[^>]*>/);
      const vertical = placement === 'start' || placement === 'end';
      assert.equal(attr(root, 'data-placement'), placement);
      assert.equal(attr(root, 'data-orientation'), vertical ? 'vertical' : 'horizontal');
      assert.equal(attr(tag(html, /<div[^>]*role="tablist"[^>]*>/), 'aria-orientation'), vertical ? 'vertical' : 'horizontal');
    }
  });
});

describe('panel mounting', () => {
  it("'lazy' (default) and 'active' render only the selected panel's content on the server", () => {
    for (const panelMount of [undefined, 'lazy', 'active'] as const) {
      const html = render(basic(panelMount ? { panelMount } : {}));
      assert.match(html, /id="content-a"/);
      assert.doesNotMatch(html, /id="content-b"|id="content-c"/);
      // Every panel element still exists, so aria-controls resolves.
      assert.equal(tags(html, /role="tabpanel"/).length, 3);
    }
  });

  it("'eager' renders every panel's content on the server, hidden", () => {
    const html = render(basic({ panelMount: 'eager' }));
    assert.match(html, /id="content-a"/);
    assert.match(html, /hidden=""[^>]*><p id="content-b"/);
    assert.match(html, /id="content-c"/);
  });
});

describe('overflow markup', () => {
  it("'scroll' (default) renders scroll buttons that are hidden from assistive technology and never focusable", () => {
    const html = render(basic());
    const buttons = tags(html, /<button[^>]*class="salmon-tab-scroll"[^>]*>/);
    assert.equal(buttons.length, 2);
    for (const b of buttons) {
      assert.equal(attr(b, 'aria-hidden'), 'true');
      assert.equal(attr(b, 'tabindex'), '-1');
    }
    assert.equal(attr(tag(html, /<div[^>]*class="salmon-tab-list"[^>]*>/), 'data-overflow'), 'scroll');
  });

  it("'menu' renders every tab as measurable and a hidden More tabs button on the server", () => {
    const html = render(basic({ overflow: 'menu' }, h(Tab, { value: 'd', hidden: true }, 'Delta')));
    assert.doesNotMatch(html, /salmon-tab-scroll/);
    const more = tag(html, /<button[^>]*class="salmon-tab-more"[^>]*>/);
    assert.equal(attr(more, 'aria-label'), 'More tabs');
    assert.equal(attr(more, 'aria-haspopup'), 'menu');
    assert.equal(attr(more, 'aria-expanded'), 'false');
    assert.match(more, / hidden=""/);
    assert.match(html, /data-overflow-root=""/);
    assert.equal(tags(html, /data-overflow-item="[abc]"/).length, 3);
    assert.doesNotMatch(html, /data-overflow-item="d"/, 'a hidden tab is not measured');
    assert.doesNotMatch(html, /data-overflow-hidden|role="menu"/);
  });
});

describe('close', () => {
  it('onClose shows a decorative close control and announces the Delete shortcut', () => {
    const html = render(h(Tabs, { defaultValue: 'a' }, h(TabList, null, h(Tab, { value: 'a', onClose: () => {} }, 'A'), h(Tab, { value: 'b' }, 'B'))));
    const a = tag(html, /<button[^>]*data-value="a"[^>]*>/);
    assert.equal(attr(a, 'aria-keyshortcuts'), 'Delete');
    assert.match(html, /<span class="salmon-tab-close" aria-hidden="true" title="Close"><\/span>/);
    assert.equal(attr(tag(html, /<button[^>]*data-value="b"[^>]*>/), 'aria-keyshortcuts'), undefined);
  });
});

describe('disabled', () => {
  it('Tabs disabled marks the root and every tab aria-disabled', () => {
    const html = render(basic({ disabled: true }));
    assert.equal(attr(tag(html, /<div[^>]*class="salmon-tabs"[^>]*>/), 'data-disabled'), '');
    for (const t of tags(html, /<button[^>]*role="tab"[^>]*>/)) assert.equal(attr(t, 'aria-disabled'), 'true');
  });
});

describe('locale', () => {
  it('TABS_DEFAULT_LOCALE_TEXT is frozen and localeText overrides part of it', () => {
    assert.ok(Object.isFrozen(TABS_DEFAULT_LOCALE_TEXT));
    assert.deepEqual(Object.keys(TABS_DEFAULT_LOCALE_TEXT).sort(), ['close', 'moreTabs', 'scrollBackward', 'scrollForward']);
    const html = render(basic({ localeText: { scrollForward: 'Weiter', moreTabs: 'Mehr' } }));
    assert.match(html, /title="Weiter"/);
    assert.match(html, /title="Scroll tabs backward"/);
    assert.match(render(basic({ overflow: 'menu', localeText: { moreTabs: 'Mehr' } })), /aria-label="Mehr"/);
  });
});

describe('passthrough and render', () => {
  it('className, style and DOM props reach the documented elements', () => {
    const html = render(
      h(
        Tabs,
        { defaultValue: 'a', className: 'root-x', style: { width: 300 }, id: 'tabs-root', ...{ 'data-test': 'r' } },
        h(TabList, { className: 'list-x', style: { gap: 2 }, 'aria-label': 'L', ...{ 'data-test': 'l' } }, h(Tab, { value: 'a', className: 'tab-x', style: { color: 'red' }, title: 'T' }, 'A')),
        h(TabPanel, { value: 'a', className: 'panel-x', style: { padding: 0 }, ...{ 'data-test': 'p' } }, 'x'),
      ),
    );
    const root = tag(html, /<div[^>]*class="salmon-tabs root-x"[^>]*>/);
    assert.equal(attr(root, 'style'), 'width:300px');
    assert.equal(attr(root, 'id'), 'tabs-root');
    assert.equal(attr(root, 'data-test'), 'r');
    assert.equal(attr(tag(html, /<div[^>]*class="salmon-tab-list list-x"[^>]*>/), 'style'), 'gap:2px');
    assert.equal(attr(tag(html, /<div[^>]*role="tablist"[^>]*>/), 'data-test'), 'l');
    const t = tag(html, /<button[^>]*class="salmon-tab tab-x"[^>]*>/);
    assert.equal(attr(t, 'style'), 'color:red');
    assert.equal(attr(t, 'title'), 'T');
    const p = tag(html, /<div[^>]*class="salmon-tab-panel panel-x"[^>]*>/);
    assert.equal(attr(p, 'style'), 'padding:0');
    assert.equal(attr(p, 'data-test'), 'p');
  });

  it('Tab render receives the computed props (role, ids, ARIA, handlers) for a custom element such as a link', () => {
    const html = render(
      h(
        Tabs,
        { defaultValue: 'home' },
        h(
          TabList,
          null,
          h(Tab, { value: 'home', render: (props) => h('a', { ...props, href: '/home' }) }, 'Home'),
          h(Tab, { value: 'docs', render: (props) => h('a', { ...props, href: '/docs' }) }, 'Docs'),
        ),
      ),
    );
    const a = tag(html, /<a[^>]*href="\/home"[^>]*>/);
    assert.equal(attr(a, 'role'), 'tab');
    assert.equal(attr(a, 'aria-selected'), 'true');
    assert.equal(attr(a, 'tabindex'), '0');
    assert.ok(attr(a, 'aria-controls'));
    assert.equal(attr(tag(html, /<a[^>]*href="\/docs"[^>]*>/), 'tabindex'), '-1');
    assert.doesNotMatch(html, /<button[^>]*role="tab"/);
  });

  it('per-tab customization is render-time JSX: label children render as given', () => {
    const html = render(h(Tabs, { defaultValue: 'a' }, h(TabList, null, h(Tab, { value: 'a' }, h('strong', null, 'Bold'), ' tab'))));
    assert.match(html, /<span class="salmon-tab-label"><strong>Bold<\/strong> tab<\/span>/);
  });
});

describe('SSR determinism', () => {
  it('server markup is identical across renders (useId-based ids, no random or time values)', () => {
    assert.equal(render(basic({ overflow: 'menu', reorderable: true })), render(basic({ overflow: 'menu', reorderable: true })));
  });

  it('a Tab outside Tabs throws a clear error', () => {
    assert.throws(() => render(h(Tab, { value: 'a' }, 'A')), /must be rendered inside <Tabs>/);
  });
});
