import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createElement as h, createRef, type ReactElement } from 'react';
import { renderToString } from 'react-dom/server';
import { CONTEXT_MENU_DEFAULT_LOCALE_TEXT, ContextMenu, Menu, MenuItem, MenuSeparator, Submenu } from '@salmonui/buttons/menu';

// ContextMenu server markup and public surface. Opening, placement, events and focus are covered by
// tests/browser/context-menu.spec.ts; hydration by its `?mode=hydrate` test.

const render = (el: ReactElement): string => renderToString(el);
const menu = h(
  Menu,
  { 'aria-label': 'Actions' },
  h(MenuItem, { id: 'cut', icon: h('i', null, 'x') }, h('b', null, 'Cut')),
  h(MenuSeparator),
  h(Submenu, { label: 'More' }, h(MenuItem, { id: 'deep' }, 'Deep')),
);

describe('ContextMenu markup', () => {
  it('wraps its target in a div with className, style and DOM props; the closed menu renders no markup', () => {
    const html = render(h(ContextMenu, { menu, className: 'canvas', style: { width: 100 }, id: 'c', tabIndex: 0, 'aria-label': 'Canvas' }, h('span', null, 'Target')));
    assert.match(html, /^<div style="width:100px" id="c" tabindex="0" aria-label="Canvas" class="salmon-context-menu canvas"><span>Target<\/span><\/div>$/);
    assert.doesNotMatch(html, /role="menu"|menuitem|Cut/);
  });

  it('open on the server still renders no popup (it mounts after hydration), only the data-open hook', () => {
    const html = render(h(ContextMenu, { menu, open: true, anchorPoint: { x: 10, y: 20 } }, 'T'));
    assert.match(html, /class="salmon-context-menu" data-open=""/);
    assert.doesNotMatch(html, /role="menu"/);
  });

  it('with targetRef and no children it renders nothing of its own', () => {
    assert.equal(render(h(ContextMenu, { targetRef: createRef<HTMLElement>(), items: [{ id: 'a', label: 'A' }] })), '');
  });

  it('markup is independent of the number of entries (popups are lazy)', () => {
    const items = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `i${i}`, label: `Item ${i}` }));
    assert.equal(render(h(ContextMenu, { items: items(1) }, 'T')), render(h(ContextMenu, { items: items(1000) }, 'T')));
  });
});

describe('ContextMenu public surface', () => {
  it('exports the component and the default locale text from /menu', () => {
    assert.equal(typeof ContextMenu, 'function');
    assert.deepEqual({ ...CONTEXT_MENU_DEFAULT_LOCALE_TEXT }, { label: 'Context menu' });
    assert.ok(Object.isFrozen(CONTEXT_MENU_DEFAULT_LOCALE_TEXT));
  });

  it('accepts the event, controlled, submenu and locale props (type-checked) without rendering differences', () => {
    const base = render(h(ContextMenu, { items: [] }, 'T'));
    const full = render(
      h(
        ContextMenu,
        {
          items: [],
          open: false,
          anchorPoint: { x: 1, y: 2 },
          onOpenChange: (open: boolean, event: { reason: string }) => void [open, event.reason],
          onBeforeOpen: (event: { target: Element; point: { x: number }; source: string; preventDefault(): void }) => void event.preventDefault(),
          onBeforeClose: (event: { reason: string; preventDefault(): void }) => void event.preventDefault(),
          onAction: (event: { id: string }) => void event.id,
          submenuOpen: 'click',
          hoverDelay: 400,
          disabled: false,
          localeText: { label: 'Menu contextuel' },
          classNames: { menu: 'm' },
          styles: { menu: { color: 'red' } },
        },
        'T',
      ),
    );
    assert.equal(full, base);
  });
});
