import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createElement as h, type ReactElement } from 'react';
import { renderToString } from 'react-dom/server';
import { MENUBAR_DEFAULT_LOCALE_TEXT, Menu, MenuItem, Menubar, MenubarItem, MenubarMenu } from '@salmonui/buttons/menu';

// Menubar server markup and public surface. Keyboard, pointer, value changes and overflow scrolling are
// covered by tests/browser/menubar.spec.ts; hydration by its `?mode=hydrate`
// test; axe by tests/browser/menubar-a11y.spec.ts.

const render = (el: ReactElement): string => renderToString(el);
const tag = (html: string, pattern: RegExp): string => {
  const m = html.match(pattern);
  assert.ok(m, `no match for ${pattern}`);
  return m[0];
};

const bar = (props: Record<string, unknown> = {}) =>
  h(
    Menubar,
    { 'aria-label': 'Editor', ...props },
    h(MenubarMenu, { value: 'file', label: 'File', id: 'file' }, h(Menu, null, h(MenuItem, { id: 'new' }, 'New'))),
    h(MenubarMenu, { value: 'edit', label: h('em', null, 'Edit'), icon: h('i', null, '*'), id: 'edit', disabled: true }, h(MenuItem, { id: 'undo' }, 'Undo')),
    h(MenubarItem, { id: 'save' }, 'Save'),
    h(MenubarItem, { id: 'help', href: '/help', target: '_blank' }, 'Help'),
  );

describe('Menubar markup', () => {
  it('role="menubar", horizontal, with the accessible name, className, style and DOM props', () => {
    const html = render(bar({ className: 'top', style: { width: 300 }, id: 'b', title: 'Main' }));
    const root = tag(html, /^<div[^>]*>/);
    assert.match(root, /role="menubar"/);
    assert.match(root, /aria-orientation="horizontal"/);
    assert.match(root, /aria-label="Editor"/);
    assert.match(root, /class="salmon-menubar top"/);
    assert.match(root, /style="width:300px"/);
    assert.match(root, /id="b"/);
    assert.match(root, /title="Main"/);
  });

  it('MenubarMenu is a menuitem with aria-haspopup and aria-expanded; its menu renders no markup while closed', () => {
    const html = render(bar());
    const file = tag(html, /<div id="file"[^>]*>/);
    assert.match(file, /role="menuitem"/);
    assert.match(file, /tabindex="-1"/);
    assert.match(file, /aria-haspopup="menu"/);
    assert.match(file, /aria-expanded="false"/);
    assert.doesNotMatch(file, /aria-controls/);
    assert.doesNotMatch(html, /role="menu"|New|Undo/);
  });

  it('labels and icons are ReactNode; disabled is aria-disabled with a data hook', () => {
    const html = render(bar());
    const edit = tag(html, /<div id="edit"[^>]*>/);
    assert.match(edit, /aria-disabled="true"/);
    assert.match(edit, /data-disabled=""/);
    assert.match(html, /<span class="salmon-menubar-item-icon" aria-hidden="true"><i>\*<\/i><\/span><span class="salmon-menubar-item-label"><em>Edit<\/em><\/span>/);
  });

  it('MenubarItem is a top-level command (div) or link (a) without a popup', () => {
    const html = render(bar());
    const save = tag(html, /<div[^>]*data-item-id="save"[^>]*>/);
    assert.match(save, /role="menuitem"/);
    assert.doesNotMatch(save, /aria-haspopup/);
    assert.match(tag(html, /<a[^>]*data-item-id="help"[^>]*>/), /href="\/help" target="_blank"/);
  });

  it('value / defaultValue mark the open menu on the server (aria-expanded), the popup still mounts on the client', () => {
    for (const props of [{ value: 'file' }, { defaultValue: 'file' }]) {
      const html = render(bar(props));
      const file = tag(html, /<div id="file"[^>]*>/);
      assert.match(file, /aria-expanded="true"/);
      assert.match(file, /data-open=""/);
      assert.doesNotMatch(html, /role="menu"/);
    }
  });

  it("overflow: 'scroll' adds the data hook and hidden scroll indicators with locale titles", () => {
    const html = render(bar({ overflow: 'scroll', localeText: { scrollForward: 'Weiter' } }));
    assert.match(tag(html, /^<div[^>]*>/), /data-overflow="scroll"/);
    assert.match(html, /<span class="salmon-menubar-scroll" data-direction="backward" aria-hidden="true" title="Scroll backward">/);
    assert.match(html, /<span class="salmon-menubar-scroll" data-direction="forward" aria-hidden="true" title="Weiter">/);
    assert.doesNotMatch(render(bar()), /salmon-menubar-scroll|data-overflow/);
  });

  it('MenubarItem render receives every computed prop (router links)', () => {
    const html = render(h(Menubar, { 'aria-label': 'B' }, h(MenubarItem, { id: 'docs', href: '/docs', render: (p: object) => h('a', { ...p, 'data-router': '' }) }, 'Docs')));
    const a = tag(html, /<a[^>]*>/);
    assert.match(a, /role="menuitem"/);
    assert.match(a, /tabindex="-1"/);
    assert.match(a, /class="salmon-menubar-item"/);
    assert.match(a, /data-item-id="docs"/);
    assert.match(a, /href="\/docs"/);
    assert.match(a, /data-router=""/);
    assert.match(html, /salmon-menubar-item-label">Docs</);
  });

  it('MenubarMenu and MenubarItem outside a Menubar throw a descriptive error', () => {
    assert.throws(() => render(h(MenubarItem, { id: 'x' }, 'X')), /<MenubarItem> must be rendered inside a <Menubar>/);
    assert.throws(() => render(h(MenubarMenu, { label: 'X' })), /<MenubarMenu> must be rendered inside a <Menubar>/);
  });
});

describe('Menubar public surface', () => {
  it('exports the frozen default locale text from /menu', () => {
    assert.deepEqual({ ...MENUBAR_DEFAULT_LOCALE_TEXT }, { scrollBackward: 'Scroll backward', scrollForward: 'Scroll forward' });
    assert.ok(Object.isFrozen(MENUBAR_DEFAULT_LOCALE_TEXT));
  });

  it('event and option props render the same server markup', () => {
    const base = render(bar());
    const full = render(
      bar({
        value: null,
        onValueChange: () => undefined,
        onBeforeValueChange: (event: { preventDefault(): void }) => event.preventDefault(),
        onAction: () => undefined,
        submenuOpen: 'click',
        hoverDelay: 300,
      }),
    );
    assert.equal(full, base);
  });
});
