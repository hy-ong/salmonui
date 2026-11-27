---
title: Context Menu
description: ContextMenu opens a Menu family popup at the pointer on right-click, touch long-press, Shift+F10 or the ContextMenu key, with per-target entries, cancellable open and close, collision-aware placement, RTL and focus return.
category: Menus
order: 30
demos: [context-menu-basics, context-menu-events, context-menu-controlled]
---

```tsx
import { ContextMenu, Menu, MenuItem, MenuSeparator, Submenu } from '@salmonui/buttons/menu';
import '@salmonui/buttons/menu/styles.css';

<ContextMenu
  menu={
    <Menu aria-label="Canvas actions">
      <MenuItem id="cut">Cut</MenuItem>
      <MenuItem id="copy">Copy</MenuItem>
      <MenuSeparator />
      <Submenu label="Arrange">
        <MenuItem id="front">Bring to front</MenuItem>
      </Submenu>
    </Menu>
  }
  onAction={(event) => run(event.id)}
>
  <div className="canvas" tabIndex={0}>…</div>
</ContextMenu>
```

`ContextMenu` lives in the Buttons Menu family (`@salmonui/buttons/menu`) and
reuses its list, submenus, hover intent, typeahead and styles; importing
`menu/styles.css` is enough.

## Target

The children are the target: `ContextMenu` wraps them in a
`div.salmon-context-menu` that takes `className`, `style` and DOM props
(`data-open` is set while the menu is open). To attach to an element it
does not wrap, pass `targetRef` and no children; it then renders only the
popup.

## Entries

`menu` takes a `<Menu>` element; its entries, `aria-label`,
`aria-labelledby`, `onAction`, `className` and `style` apply to the popup.
`menu` may also be the entries themselves, or use `items` (with
`renderItem`) for the data form. Entries are the Menu family's: `MenuItem`
(`id`, `icon`, `href`, `disabled`, any `ReactNode` children),
`MenuCheckboxItem`, `MenuRadioGroup`, `MenuGroup`, `MenuSeparator` and
`Submenu`. The application renders every entry, so
per-item customization is ordinary JSX. Without a name from the `Menu`, the popup is named by
`localeText.label` (`CONTEXT_MENU_DEFAULT_LOCALE_TEXT.label`, "Context
menu").

## Opening

- Right-click (`contextmenu`) anywhere in the target.
- Touch long-press: 500 ms, cancelled by moving more than 8 px or lifting
  the finger earlier. The browser's own long-press menu is suppressed.
- Shift+F10 and the ContextMenu key on a focused element inside the target;
  the menu opens at that element's start-bottom corner. Give a target that
  has no focusable content `tabIndex={0}`.
- `disabled` turns all of them off.

The menu opens at a virtual point anchor: the top-start corner of the menu
sits at the pointer, flips above it when there is no room below and shifts
to stay inside the viewport; under `dir="rtl"` the menu extends to the left
of the point and submenus open to the left. Focus moves to the
first item; Escape, Tab, an outside press or a chosen item close the menu,
and focus returns to the element that had it when the menu opened (the
target itself otherwise). A right-click inside an open menu never
shows the browser menu.

## Events

```tsx
const [selection, setSelection] = useState<string | null>(null);

<ContextMenu
  onBeforeOpen={(event) => {
    const row = event.target.closest('[data-row]');
    if (!row) return event.preventDefault(); // keep the browser menu
    setSelection(row.getAttribute('data-row'));
  }}
  onBeforeClose={(event) => {
    if (event.reason === 'outside' && unsaved) event.preventDefault();
  }}
  onOpenChange={(open, { reason, source }) => log(open, reason, source)}
  onAction={(event) => run(event.id, selection)}
  menu={<Menu>{selection ? <MenuItem id="delete">Delete {selection}</MenuItem> : null}</Menu>}
>
  …
</ContextMenu>
```

- `onBeforeOpen({ target, point, source })`: `target` is the element the
  event happened on, `point` the viewport point, `source` `'pointer'`,
  `'touch'` or `'keyboard'`. `preventDefault()` keeps the menu closed and
  lets the browser menu show; checking `event.target.closest(...)` there
  limits the menu to matching elements. Entries that depend on the target come from state the handler
  sets.
- `onBeforeClose({ reason, source })` is cancellable; `onOpenChange(open,
  { reason, source })` follows every change (reasons `trigger`, `escape`,
  `outside`, `action`, `tab`).
- `onAction(event)` reports the chosen item (`event.id`, `event.item` for
  the `items` form, `event.source`); `event.preventDefault()` keeps the
  menu open.

Event objects are only created when a handler is bound and are frozen in
development.

## Controlled

```tsx
<ContextMenu open={open} anchorPoint={{ x: 320, y: 200 }} onOpenChange={setOpen} items={items}>
  …
</ContextMenu>
```

`open` with `anchorPoint` (viewport px) opens and closes the menu from
application state. Without `anchorPoint` a controlled menu opens at the
pointer, or at the target's start-bottom corner when it was opened through
`open`.

## Submenus and long menus

`submenuOpen="click"` opens submenus on click (and keyboard) only;
`hoverDelay` sets the hover intent
(default 200 ms). Both props are also available on `Menu`,
`MenuButton` and `SplitButton`. A long menu caps its block size to the
viewport and scrolls; the keyboard keeps the focused item in view. Menus
are not virtualized: the Menu family's budgets cover 1,000 items; a long pickable list belongs in a Listbox.

## Changing entries

Imperative methods that enable, hide, insert, replace or remove entries are
not offered: the entries belong to the application, and methods
that mutate an internal copy would let the menu and the application state
disagree. Keep the entries in state that the `onBeforeOpen` handler sets and
the children render from (`disabled` on a `MenuItem`, conditional
rendering), as in the [Events](#events) example.

## Keyboard and ARIA

The popup is the Menu family's APG menu (`role="menu"`, `menuitem`,
`menuitemcheckbox`, `menuitemradio`): ArrowDown / ArrowUp move between
entries, Home / End (or PageUp / PageDown) jump to the ends, typing a letter
moves to the next entry that starts with it, ArrowRight opens a submenu and
ArrowLeft closes it (mirrored under `dir="rtl"`), and Enter or Space
chooses the entry or opens its submenu. Escape closes the current submenu,
or the menu at the top level; Tab closes the whole menu. Focus then returns
to the element that opened it.

## Server rendering

The closed menu renders no markup: the server outputs only the target
`div.salmon-context-menu` and its children, and the popup mounts on the
client when the menu opens, so hydration reports no warnings.
`container` sets the element the popup portals into, and
`classNames.menu` / `styles.menu` reach the popup.

## API reference

`ContextMenu`, `CONTEXT_MENU_DEFAULT_LOCALE_TEXT` and the Menu family parts
are in [`@salmonui/buttons/menu`](/docs/reference/buttons/menu).
