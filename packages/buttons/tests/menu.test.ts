import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createElement as h, type ReactElement } from 'react';
import { renderToString } from 'react-dom/server';
import { Button, ButtonGroup } from '@salmonui/buttons/button';
import { ContextMenu, Menu, MenuButton, Menubar, MenubarMenu, MenuCheckboxItem, MenuGroup, MenuItem, MenuRadioGroup, MenuRadioItem, MenuSeparator, SplitButton, Submenu, type MenuItemData } from '@salmonui/buttons/menu';

// Server markup of the Menu family and the pure helpers behind its
// keyboard model. Interaction is covered by tests/browser/menu.spec.ts; the
// roving, typeahead and placement math by internal-primitives.test.ts.

const render = (el: ReactElement): string => renderToString(el);
const tag = (html: string, pattern: RegExp): string => {
  const m = html.match(pattern);
  assert.ok(m, `no match for ${pattern}`);
  return m[0];
};

const many = (n: number): MenuItemData[] => Array.from({ length: n }, (_, i) => ({ id: `i${i}`, label: `Item ${i}` }));

describe('MenuButton trigger', () => {
  it('renders a button with the trigger content and APG menu button ARIA, closed', () => {
    const html = render(h(MenuButton, { items: many(3) }, 'Actions'));
    const button = tag(html, /<button[^>]*>/);
    assert.match(button, /aria-haspopup="menu"/);
    assert.match(button, /aria-expanded="false"/);
    assert.doesNotMatch(button, /aria-controls/);
    assert.doesNotMatch(button, /data-open/);
    assert.match(button, /type="button"/);
    assert.match(html, /Actions/);
    assert.doesNotMatch(button, /aria-label=/, 'the name comes from the content');
  });

  it('tone, variant and size reach the trigger as data attributes; iconStart is decorative', () => {
    const html = render(h(MenuButton, { items: [], tone: 'primary', variant: 'outline', size: 'sm', iconStart: h('svg', { id: 'ico' }) }, 'Go'));
    const button = tag(html, /<button[^>]*>/);
    assert.match(button, /data-tone="primary"/);
    assert.match(button, /data-variant="outline"/);
    assert.match(button, /data-size="sm"/);
    assert.match(html, /<span class="salmon-button__icon" aria-hidden="true"><svg id="ico">/);
  });

  it('shows a chevron indicator by default; indicator={false} hides it; a custom node replaces it', () => {
    assert.match(render(h(MenuButton, { items: [] }, 'A')), /salmon-menu-button-indicator"><svg/);
    assert.doesNotMatch(render(h(MenuButton, { items: [], indicator: false }, 'A')), /salmon-menu-button-indicator/);
    assert.match(render(h(MenuButton, { items: [], indicator: h('b', null, 'v') }, 'A')), /salmon-menu-button-indicator"><b>v<\/b>/);
  });

  it('className, style and DOM props reach the trigger', () => {
    const html = render(h(MenuButton, { items: [], className: 'mine', style: { width: 120 }, title: 'More', ...{ 'data-test': 'x' } }, 'A'));
    const button = tag(html, /<button[^>]*>/);
    assert.match(button, /class="salmon-button salmon-menu-button mine"/);
    assert.match(button, /style="width:120px"/);
    assert.match(button, /title="More"/);
    assert.match(button, /data-test="x"/);
  });
});

describe('lazy popups', () => {
  it('a closed MenuButton renders no menu markup, independent of item count', () => {
    const small = render(h(MenuButton, { id: 't', items: many(1) }, 'A'));
    const large = render(h(MenuButton, { id: 't', items: many(1000) }, 'A'));
    assert.equal(small, large);
    assert.doesNotMatch(large, /role="menu"|menuitem/);
  });

  it('a closed popup never walks its items (no item read, no renderItem call), at any item count', () => {
    // A Proxy counts every read of the items array: identity checks (memo deps) do not read it.
    const watched = (n: number) => {
      const reads = { count: 0 };
      const items = new Proxy(many(n), {
        get(target, key, receiver) {
          reads.count++;
          return Reflect.get(target, key, receiver);
        },
      });
      return { items, reads };
    };
    let calls = 0;
    const renderItem = (item: MenuItemData) => {
      calls++;
      return item.label;
    };
    const cases: Record<string, (items: MenuItemData[]) => ReactElement> = {
      MenuButton: (items) => h(MenuButton, { id: 't', items, renderItem }, 'A'),
      'MenuButton open (server)': (items) => h(MenuButton, { id: 't', items, renderItem, open: true }, 'A'),
      'MenuButton defaultOpen': (items) => h(MenuButton, { id: 't', items, renderItem, defaultOpen: true }, 'A'),
      SplitButton: (items) => h(SplitButton, { items, renderItem }, 'Save'),
      ContextMenu: (items) => h(ContextMenu, { items, renderItem }, h('div', null, 'target')),
      'ContextMenu menu={<Menu items>}': (items) => h(ContextMenu, { menu: h(Menu, { items, renderItem }) }, h('div', null, 'target')),
      MenubarMenu: (items) => h(Menubar, { 'aria-label': 'Bar' }, h(MenubarMenu, { label: 'File', items, renderItem })),
      'closed Submenu of a standalone Menu': (items) => h(Menu, { 'aria-label': 'M', items: [{ id: 'more', label: 'More', items }] }),
    };
    for (const [name, make] of Object.entries(cases)) {
      const small = watched(1);
      const large = watched(10_000);
      calls = 0;
      assert.equal(render(make(large.items)), render(make(small.items)), `${name}: markup independent of item count`);
      assert.equal(large.reads.count, 0, `${name}: read the items array ${large.reads.count} times`);
      assert.equal(calls, 0, `${name}: called renderItem ${calls} times`);
    }
  });

  it('defaultOpen and open render the same server markup as closed (the popup mounts on the client)', () => {
    const closed = render(h(MenuButton, { id: 't', items: many(5) }, 'A'));
    assert.equal(render(h(MenuButton, { id: 't', items: many(5), defaultOpen: true }, 'A')), closed);
    assert.doesNotMatch(render(h(SplitButton, { items: many(5), defaultOpen: true }, 'Save')), /role="menu"/);
  });
});

describe('Menu entries', () => {
  it('a standalone Menu forwards id and DOM props to the role="menu" element', () => {
    const html = render(h(Menu, { id: 'm1', 'aria-label': 'M', title: 'T' }, h(MenuItem, { id: 'a' }, 'A')));
    const menu = tag(html, /<div[^>]*role="menu"[^>]*>/);
    assert.match(menu, /\sid="m1"/);
    assert.match(menu, /title="T"/);
  });

  it('a standalone Menu renders role="menu" with menuitem, separator and group roles', () => {
    const html = render(
      h(
        Menu,
        { 'aria-label': 'File' },
        h(MenuItem, { id: 'new' }, 'New'),
        h(MenuSeparator),
        h(MenuGroup, { label: 'Recent' }, h(MenuItem, { id: 'a' }, 'a.txt')),
      ),
    );
    assert.match(tag(html, /<div[^>]*role="menu"[^>]*>/), /aria-label="File"/);
    assert.match(html, /class="salmon-menu"/);
    assert.match(html, /role="menuitem" tabindex="-1" class="salmon-menu-item" data-item-id="new"/);
    assert.match(html, /<div role="separator" class="salmon-menu-separator"><\/div>/);
    const group = tag(html, /<div[^>]*role="group"[^>]*>/);
    const labelId = group.match(/aria-labelledby="([^"]+)"/)?.[1];
    assert.ok(labelId);
    assert.match(html, new RegExp(`class="salmon-menu-group-label" id="${labelId}" role="presentation">Recent`));
  });

  it('the items form renders the same roles, ids, icons, links, separators, groups and submenus', () => {
    const items: MenuItemData[] = [
      { id: 'cut', label: 'Cut', icon: h('i', null, 'x') },
      { type: 'separator' },
      { id: 'docs', label: 'Docs', href: '/docs', target: '_blank' },
      { id: 'off', label: 'Off', disabled: true },
      { type: 'group', label: 'More', items: [{ id: 'g1', label: 'G1' }] },
      { id: 'share', label: 'Share', items: [{ id: 'mail', label: 'Mail' }] },
    ];
    const html = render(h(Menu, { 'aria-label': 'Edit', items }));
    assert.match(html, /data-item-id="cut"[^>]*><span class="salmon-menu-item-icon" aria-hidden="true"><i>x<\/i><\/span><span class="salmon-menu-item-label">Cut<\/span>/);
    assert.match(html, /role="separator"/);
    assert.match(html, /<a role="menuitem"[^>]*data-item-id="docs"[^>]*href="\/docs" target="_blank"/);
    const off = tag(html, /<div[^>]*data-item-id="off"[^>]*>/);
    assert.match(off, /aria-disabled="true"/);
    assert.match(off, /data-disabled=""/);
    assert.match(html, /role="group"[^>]*>.*G1/);
    const share = tag(html, /<div[^>]*data-submenu=""[^>]*>/);
    assert.match(share, /aria-haspopup="menu"/);
    assert.match(share, /aria-expanded="false"/);
    assert.match(html, /salmon-menu-submenu-indicator/);
    assert.doesNotMatch(html, /Mail/, 'closed submenus render no markup');
  });

  it('renderItem customizes the items form; textValue is exposed for typeahead', () => {
    const html = render(h(Menu, { 'aria-label': 'M', items: [{ id: 'a', label: 'Alpha', textValue: 'alpha' }], renderItem: (item: MenuItemData) => h('strong', null, item.label) }));
    assert.match(html, /<strong>Alpha<\/strong>/);
    assert.match(html, /data-text-value="alpha"/);
  });

  it('children win over items', () => {
    const html = render(h(Menu, { 'aria-label': 'M', items: [{ id: 'fromItems', label: 'X' }] }, h(MenuItem, { id: 'fromChildren' }, 'Y')));
    assert.match(html, /fromChildren/);
    assert.doesNotMatch(html, /fromItems/);
  });

  it('a disabled link item has no href; the render prop receives the ARIA props and handlers', () => {
    const html = render(h(Menu, { 'aria-label': 'M' }, h(MenuItem, { id: 'l', href: '/x', disabled: true }, 'L')));
    assert.doesNotMatch(html, /href=/);
    let received: Record<string, unknown> = {};
    render(
      h(Menu, { 'aria-label': 'M' },
        h(MenuItem, {
          id: 'r',
          href: '/settings',
          render: (props) => {
            received = props as unknown as Record<string, unknown>;
            return h('a', { ...props, 'data-router': '' });
          },
        }, 'Settings'),
      ),
    );
    assert.equal(received['role'], 'menuitem');
    assert.equal(received['tabIndex'], -1);
    assert.equal(received['href'], '/settings');
    assert.equal(typeof received['onClick'], 'function');
  });

  it('checkbox and radio items carry their roles and aria-checked', () => {
    const html = render(
      h(Menu, { 'aria-label': 'View' },
        h(MenuCheckboxItem, { id: 'grid', defaultChecked: true }, 'Grid lines'),
        h(MenuCheckboxItem, { id: 'ruler', checked: false }, 'Ruler'),
        h(MenuRadioGroup, { label: 'Zoom', defaultValue: '100' }, h(MenuRadioItem, { value: '50' }, '50%'), h(MenuRadioItem, { value: '100' }, '100%')),
      ),
    );
    assert.match(tag(html, /<div[^>]*data-item-id="grid"[^>]*>/), /role="menuitemcheckbox"[^>]*aria-checked="true"[^>]*data-checked=""/);
    assert.match(tag(html, /<div[^>]*data-item-id="ruler"[^>]*>/), /aria-checked="false"/);
    assert.match(tag(html, /<div[^>]*data-item-id="100"[^>]*>/), /role="menuitemradio"[^>]*aria-checked="true"/);
    assert.match(tag(html, /<div[^>]*data-item-id="50"[^>]*>/), /aria-checked="false"/);
  });

  it('MenuItem outside a menu throws a descriptive error', () => {
    assert.throws(() => render(h(MenuItem, { id: 'x' }, 'X')), /must be rendered inside/);
  });

  it('a Submenu renders its trigger only', () => {
    const html = render(h(Menu, { 'aria-label': 'M' }, h(Submenu, { label: 'Share' }, h(MenuItem, { id: 'mail' }, 'Mail'))));
    assert.match(html, /aria-haspopup="menu"/);
    assert.doesNotMatch(html, /Mail/);
  });
});

describe('SplitButton', () => {
  const split = (props: Record<string, unknown> = {}): string => render(h(SplitButton, { items: many(2), id: 'save', ...props }, 'Save'));

  it('a group named by the primary button with two buttons; only the trigger has popup ARIA', () => {
    const html = split();
    const group = tag(html, /<div role="group"[^>]*>/);
    assert.match(group, /aria-labelledby="save"/);
    assert.match(group, /class="salmon-button-group salmon-split-button"/);
    assert.match(group, /data-attached=""/);
    const [primary, trigger] = [...html.matchAll(/<button[^>]*>/g)].map((m) => m[0]);
    assert.ok(primary && trigger);
    assert.match(primary, /id="save"/);
    assert.match(primary, /salmon-split-button-primary/);
    assert.doesNotMatch(primary, /aria-haspopup|aria-expanded/);
    assert.match(trigger, /aria-label="More options"/);
    assert.match(trigger, /aria-haspopup="menu"/);
    assert.match(trigger, /aria-expanded="false"/);
    assert.match(trigger, /salmon-split-button-trigger/);
    assert.doesNotMatch(trigger, /data-open/);
  });

  it('menuLabel names the trigger; tone, variant, size and disabled apply to both parts', () => {
    const html = split({ menuLabel: 'Save options', tone: 'success', variant: 'outline', size: 'lg', disabled: true });
    const buttons = [...html.matchAll(/<button[^>]*>/g)].map((m) => m[0]);
    assert.equal(buttons.length, 2);
    for (const b of buttons) {
      assert.match(b, /data-tone="success"/);
      assert.match(b, /data-variant="outline"/);
      assert.match(b, /data-size="lg"/);
      assert.match(b, /disabled=""/);
    }
    assert.match(buttons[1] ?? '', /aria-label="Save options"/);
  });

  it('children and iconStart render in the primary part; className, style and part maps reach their elements', () => {
    const html = split({ iconStart: h('svg', { id: 's' }), className: 'root', style: { margin: 4 }, classNames: { primary: 'p', trigger: 't' }, styles: { trigger: { color: 'red' } } });
    assert.match(tag(html, /<div role="group"[^>]*>/), /style="margin:4px" class="salmon-button-group salmon-split-button root"/);
    assert.match(html, /salmon-split-button-primary p/);
    assert.match(tag(html, /<button[^>]*salmon-split-button-trigger t[^>]*>/), /style="color:red"/);
    assert.match(html, /<svg id="s">/);
  });
});

describe('menu buttons inside a ButtonGroup', () => {
  it('MenuButton and SplitButton take the group style defaults; their own props win', () => {
    const html = render(
      h(ButtonGroup, { 'aria-label': 'Actions', variant: 'outline', tone: 'primary', size: 'sm' },
        h(Button, null, 'Edit'),
        h(MenuButton, { id: 'm', items: many(2) }, 'More'),
        h(SplitButton, { id: 's', items: many(2), tone: 'danger' }, 'Share'),
      ),
    );
    const buttons = [...html.matchAll(/<button[^>]*>/g)].map((m) => m[0]);
    assert.equal(buttons.length, 4);
    for (const b of buttons) {
      assert.match(b, /data-variant="outline"/);
      assert.match(b, /data-size="sm"/);
    }
    assert.match(buttons[1] ?? '', /data-tone="primary"/);
    assert.match(buttons[2] ?? '', /data-tone="danger"/);
    assert.match(buttons[3] ?? '', /data-tone="danger"/);
  });

  it('a disabled group disables the menu trigger and both split parts; a vertical group keeps the split button horizontal', () => {
    const html = render(
      h(ButtonGroup, { 'aria-label': 'Actions', orientation: 'vertical', disabled: true },
        h(MenuButton, { id: 'm', items: many(2) }, 'More'),
        h(SplitButton, { id: 's', items: many(2) }, 'Share'),
      ),
    );
    const buttons = [...html.matchAll(/<button[^>]*>/g)].map((m) => m[0]);
    assert.equal(buttons.length, 3);
    for (const b of buttons) assert.match(b, /disabled=""/);
    assert.match(html, /data-orientation="vertical"/);
    assert.match(tag(html, /<div[^>]*salmon-split-button[^>]*>/), /data-orientation="horizontal"/);
  });
});
