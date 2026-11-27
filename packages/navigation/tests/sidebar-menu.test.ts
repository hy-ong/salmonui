// SidebarMenu: the pure model (index, ancestors, expansion, keys) and the server
// markup through react-dom/server with DOM globals removed. Interaction, the
// rail flyouts and hydration are covered by tests/browser/sidebar-menu.spec.ts.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

const g = globalThis as Record<string, unknown>;
for (const name of ['window', 'document', 'navigator', 'HTMLElement', 'requestAnimationFrame', 'getComputedStyle', 'ResizeObserver', 'matchMedia']) {
  try {
    delete g[name];
  } catch {}
  if (name in g) Object.defineProperty(g, name, { value: undefined, configurable: true });
}

const { createElement: h } = await import('react');
const { renderToString } = await import('react-dom/server');
const { SidebarMenu, SIDEBAR_MENU_DEFAULT_LOCALE_TEXT } = await import('@salmonui/navigation/sidebar-menu');
const model = await import('../dist/sidebar-menu/model.js');
type Entry = import('@salmonui/navigation/sidebar-menu').SidebarMenuEntry;

const ITEMS: Entry[] = [
  {
    type: 'group',
    id: 'workspace',
    label: 'Workspace',
    children: [
      { id: 'overview', label: 'Overview', href: '/overview', icon: h('svg', { id: 'icon-overview' }) },
      { id: 'orders', label: 'Orders', href: '/orders', badge: '12' },
    ],
  },
  {
    type: 'group',
    id: 'ops',
    label: 'Operations',
    children: [
      {
        id: 'commerce',
        label: 'Commerce',
        children: [
          { id: 'products', label: 'Products', href: '/products' },
          { id: 'support', label: 'Support', children: [{ id: 'cases', label: 'Cases', href: '/cases' }] },
        ],
      },
      { id: 'locked', label: 'Locked', href: '/locked', disabled: true },
    ],
  },
  { id: 'help', label: 'Help' },
];

const render = (props: Record<string, unknown> = {}): string => renderToString(h(SidebarMenu, { items: ITEMS, ...props }));
const tag = (html: string, pattern: RegExp): string => {
  const m = html.match(pattern);
  assert.ok(m, `no match for ${pattern}`);
  return m[0];
};

describe('SidebarMenu model', () => {
  const index = model.indexSidebarMenu(ITEMS);

  it('indexes items with their submenu parent and level; groups are not levels', () => {
    assert.deepEqual(index.nodes.get('overview'), { item: ITEMS[0]!.children![0], parentId: null, level: 1 });
    assert.equal(index.nodes.get('products')?.parentId, 'commerce');
    assert.equal(index.nodes.get('cases')?.level, 3);
    assert.equal(index.nodes.get('help')?.level, 1);
    assert.deepEqual(index.branches, ['commerce', 'support']);
    assert.deepEqual(model.indexSidebarMenu([{ id: 'a', label: 'A' }, { id: 'a', label: 'B' }]).duplicates, ['a']);
  });

  it('ancestors, initial expansion and revealing a new selection', () => {
    assert.deepEqual(model.ancestorsOf(index, 'cases'), ['commerce', 'support']);
    assert.deepEqual(model.ancestorsOf(index, 'overview'), []);
    assert.deepEqual(model.ancestorsOf(index, null), []);
    assert.deepEqual(model.initialExpanded(index, 'all', null), ['commerce', 'support']);
    assert.deepEqual(model.initialExpanded(index, ['support'], 'cases'), ['support']);
    assert.deepEqual(model.initialExpanded(index, undefined, 'products'), ['commerce']);
    const ids = ['support'];
    assert.equal(model.revealSelected(index, ids, 'overview'), ids, 'nothing to add keeps the array');
    assert.deepEqual(model.revealSelected(index, ids, 'cases'), ['support', 'commerce']);
  });

  it('toggles expansion immutably and returns the same array for a no-op', () => {
    const ids = ['a'];
    assert.equal(model.toggleExpanded(ids, 'a', true), ids);
    assert.deepEqual(model.toggleExpanded(ids, 'b', true), ['a', 'b']);
    assert.deepEqual(model.toggleExpanded(ids, 'a', false), []);
  });

  it('text, rail initials and key moves', () => {
    assert.equal(model.textOf({ label: 'Orders' }), 'Orders');
    assert.equal(model.textOf({ label: h('b', null, 'x'), textValue: 'Bold' }), 'Bold');
    assert.equal(model.textOf({ label: h('b', null, 'x') }), '');
    assert.equal(model.initialOf(' orders'), 'O');
    assert.equal(model.initialOf('訂單管理'), '訂');
    assert.equal(model.initialOf('😀 smile'), '😀');
    assert.equal(model.moveIndex('ArrowDown', -1, 3), 0);
    assert.equal(model.moveIndex('ArrowDown', 2, 3), 2);
    assert.equal(model.moveIndex('ArrowUp', 0, 3), 0);
    assert.equal(model.moveIndex('End', 0, 3), 2);
    assert.equal(model.moveIndex('Home', 2, 3), 0);
    assert.equal(model.moveIndex('x', 1, 3), -1);
    assert.equal(model.moveIndex('ArrowDown', 0, 0), -1);
  });
});

describe('SidebarMenu server markup', () => {
  it('a named <nav> landmark with lists; group headings name their list', () => {
    const html = render();
    const nav = tag(html, /<nav[^>]*>/);
    assert.match(nav, /class="salmon-sidebar-menu"/);
    assert.match(nav, new RegExp(`aria-label="${SIDEBAR_MENU_DEFAULT_LOCALE_TEXT.label}"`));
    const label = tag(html, /<div class="salmon-sidebar-menu-group-label" id="([^"]+)">Workspace<\/div>/);
    const id = label.match(/id="([^"]+)"/)![1];
    assert.match(html, new RegExp(`<ul class="salmon-sidebar-menu-list" aria-labelledby="${id}">`));
    assert.doesNotMatch(html, /role="menu/, 'site navigation is not an ARIA menu');
  });

  it('aria-label replaces the default name; landmark={false} renders an unnamed <div>', () => {
    assert.match(tag(render({ 'aria-label': 'Admin' }), /<nav[^>]*>/), /aria-label="Admin"/);
    const html = render({ landmark: false });
    assert.doesNotMatch(html, /<nav/);
    assert.doesNotMatch(tag(html, /<div[^>]*class="salmon-sidebar-menu"[^>]*>/), /aria-label/);
    assert.match(tag(render({ localeText: { label: '主選單' } }), /<nav[^>]*>/), /aria-label="主選單"/);
  });

  it('links carry href, the item id and aria-current="page" on the selected one', () => {
    const html = render({ selected: 'orders' });
    assert.match(html, /<a href="\/overview" class="salmon-sidebar-menu-link" data-sidebar-menu-item="overview" data-sidebar-menu-leaf="">/);
    assert.match(tag(html, /<a [^>]*data-sidebar-menu-item="orders"[^>]*>/), /aria-current="page"/);
    assert.equal(html.match(/aria-current/g)?.length, 1);
    assert.match(html, /<span class="salmon-sidebar-menu-badge">12<\/span>/);
    assert.match(html, /<span class="salmon-sidebar-menu-icon" aria-hidden="true"><svg id="icon-overview">/);
    // An item without href is an action button.
    assert.match(tag(html, /<button[^>]*data-sidebar-menu-item="help"[^>]*>/), /type="button"/);
  });

  it('disabled links have no href and aria-disabled', () => {
    const link = tag(render(), /<a [^>]*data-sidebar-menu-item="locked"[^>]*>/);
    assert.doesNotMatch(link, /href=/);
    assert.match(link, /role="link"/);
    assert.match(link, /aria-disabled="true"/);
  });

  it('submenus are disclosure buttons; closed panels stay in the markup, hidden by data-state', () => {
    const html = render();
    const button = tag(html, /<button[^>]*data-sidebar-menu-item="commerce"[^>]*>/);
    assert.match(button, /aria-expanded="false"/);
    const controls = button.match(/aria-controls="([^"]+)"/)![1];
    const panel = tag(html, new RegExp(`<ul id="${controls}"[^>]*>`));
    assert.match(panel, /data-state="closed"/);
    assert.match(panel, /--salmon-sidebar-menu-level:2/);
    assert.match(html, /data-sidebar-menu-item="cases"/, 'nested links render on the server');
  });

  it('default expansion opens the submenus around the selected item and marks them active', () => {
    const html = render({ defaultSelected: 'cases' });
    for (const id of ['commerce', 'support']) {
      const button = tag(html, new RegExp(`<button[^>]*data-sidebar-menu-item="${id}"[^>]*>`));
      assert.match(button, /aria-expanded="true"/);
      assert.match(button, /data-active=""/);
    }
    assert.match(tag(render({ defaultExpanded: 'all' }), /<button[^>]*data-sidebar-menu-item="support"[^>]*>/), /aria-expanded="true"/);
    assert.match(tag(render({ expanded: [], defaultSelected: 'cases' }), /<button[^>]*data-sidebar-menu-item="commerce"[^>]*>/), /aria-expanded="false"/, 'controlled expansion wins');
  });

  it('renderLink receives the computed props and the item (router links)', () => {
    const seen: string[] = [];
    const html = render({
      selected: 'products',
      renderLink: (props: Record<string, unknown>, item: { id: string }) => {
        seen.push(item.id);
        return h('a', { ...props, 'data-router': '' });
      },
    });
    assert.deepEqual(seen.sort(), ['cases', 'orders', 'overview', 'products']);
    assert.match(tag(html, /<a [^>]*data-sidebar-menu-item="products"[^>]*>/), /data-router=""/);
    assert.match(tag(html, /<a [^>]*data-sidebar-menu-item="products"[^>]*>/), /aria-current="page"/);
  });

  it('collapsed: the rail marks the root, top-level submenus become flyout triggers, icon-less items get an initial', () => {
    const html = render({ collapsed: true, selected: 'products' });
    assert.match(tag(html, /<nav[^>]*>/), /data-collapsed=""/);
    const trigger = tag(html, /<button[^>]*data-sidebar-menu-item="commerce"[^>]*>/);
    assert.match(trigger, /data-sidebar-menu-flyout=""/);
    assert.match(trigger, /aria-expanded="false"/);
    assert.doesNotMatch(trigger, /aria-controls/, 'no flyout in the markup until it opens');
    assert.match(trigger, /data-active=""/);
    assert.doesNotMatch(html, /data-sidebar-menu-item="products"/, 'flyout content is client-only');
    assert.match(html, /<span class="salmon-sidebar-menu-icon" data-initial="" aria-hidden="true">O<\/span>/);
    assert.match(html, /<span class="salmon-sidebar-menu-label">Orders<\/span>/, 'labels stay in the accessible name');
  });

  it('className, style and DOM props reach the root', () => {
    const nav = tag(render({ className: 'app-nav', style: { inlineSize: 200 }, id: 'side', 'data-x': '1' }), /<nav[^>]*>/);
    assert.match(nav, /class="salmon-sidebar-menu app-nav"/);
    assert.match(nav, /style="inline-size:200px"/);
    assert.match(nav, /id="side"/);
    assert.match(nav, /data-x="1"/);
  });

  it('is deterministic: two renders produce the same markup', () => {
    assert.equal(render({ selected: 'cases' }), render({ selected: 'cases' }));
  });

  it('exports frozen default locale text', () => {
    assert.ok(Object.isFrozen(SIDEBAR_MENU_DEFAULT_LOCALE_TEXT));
    assert.equal(SIDEBAR_MENU_DEFAULT_LOCALE_TEXT.label, 'Main');
  });
});
