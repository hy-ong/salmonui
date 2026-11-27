---
title: Menubar
description: Menubar, MenubarMenu and MenubarItem build an APG menubar over the Menu family, with one tab stop, mirrored arrow keys, menus that follow the keyboard and the pointer, a cancellable open-menu value and a scrolling overflow mode.
category: Menus
order: 40
demos: [menubar-basics]
---

```tsx
import { Menu, MenuItem, MenuSeparator, Menubar, MenubarItem, MenubarMenu, Submenu } from '@salmonui/buttons/menu';
import '@salmonui/buttons/menu/styles.css';

<Menubar aria-label="Editor" onAction={(event) => run(event.id)}>
  <MenubarMenu value="file" label="File">
    <Menu>
      <MenuItem id="new">New</MenuItem>
      <Submenu label="Open recent">
        <MenuItem id="recent-1">report.md</MenuItem>
      </Submenu>
      <MenuSeparator />
      <MenuItem id="close">Close</MenuItem>
    </Menu>
  </MenubarMenu>
  <MenubarMenu value="edit" label="Edit">
    <MenuItem id="undo">Undo</MenuItem>
  </MenubarMenu>
  <MenubarItem id="save">Save</MenubarItem>
  <MenubarItem id="help" href="/help">Help</MenubarItem>
</Menubar>
```

`Menubar` is part of the Buttons Menu family (`@salmonui/buttons/menu`) and
reuses its menus, submenus, hover intent and typeahead; `menu/styles.css`
styles both.

## Structure

- `Menubar` renders `role="menubar"` with `aria-orientation="horizontal"`;
  give it `aria-label` or `aria-labelledby`. `className`, `style`, `ref`
  and DOM props reach that element.
- `MenubarMenu` is a top-level `menuitem` with `aria-haspopup="menu"`,
  `aria-expanded` and, while open, `aria-controls`. `label` and `icon` are
  `ReactNode` (`textValue` gives typeahead text for a non-text label). Its
  children are a `<Menu>` element (entries, `aria-label`, `onAction`,
  `className`, `style` apply to the popup) or the entries themselves; `items`
  and `renderItem` are the data form. The popup is labelled by the
  top-level item. `disabled` sets `aria-disabled` and skips the item.
- `MenubarItem` is a top-level command (`onAction`) or link (`href`,
  `target`) without a menu.

Every item is rendered by the application, so per-item customization and
templates are JSX. Data maps to children with an ordinary recursive `map`
(there is no runtime field-name mapping, because a `map` in your
code does the same once, with types checked):

```tsx
const toEntries = (nodes: Node[]) =>
  nodes.map((n) => (n.children ? <Submenu key={n.id} label={n.name}>{toEntries(n.children)}</Submenu> : <MenuItem key={n.id} id={n.id}>{n.name}</MenuItem>));

<Menubar aria-label="App">
  {data.map((top) => <MenubarMenu key={top.id} value={top.id} label={top.name}>{toEntries(top.children)}</MenubarMenu>)}
</Menubar>;
```

Imperative methods that enable, insert or replace items are not offered:
the items belong to the application, and
methods that mutate an internal copy would let the bar and the application
state disagree. Change the children or their props instead (`disabled`,
conditional rendering, an insertion into the array you render from).

## Keyboard

| Key | On the bar | In an open menu |
| --- | --- | --- |
| Tab | The bar is one tab stop; it remembers the last focused item | Closes the menu, focus moves on from the bar |
| ArrowRight / ArrowLeft | Next / previous top-level item (wraps, skips disabled); opens its menu if one was open | On an item without a submenu: closes and opens the neighbouring menu (ArrowLeft closes a submenu first) |
| ArrowDown, Enter, Space | Open the menu on its first item; Enter / Space run a `MenubarItem` | Menu family keys |
| ArrowUp | Open the menu on its last item | Menu family keys |
| Home / End | First / last top-level item | First / last item |
| Escape | Closes the open menu | Closes the menu (or submenu) and returns focus to its item |
| Letters | Typeahead over the top-level items | Typeahead over the menu |

Under `dir="rtl"` ArrowLeft and ArrowRight swap on the bar and in the menus,
menus align to the item's right edge and submenus open to the left.

## Pointer

A click opens a menu and focuses its first item; a click on the open item
closes it. While a menu is open, moving the pointer onto another top-level
item opens that one (APG). `submenuOpen="click"` turns off both this and
the hover opening of nested submenus; `hoverDelay` sets the nested
hover intent (default 200 ms). Top-level menus never open on hover
alone.

## Value and events

```tsx
const [open, setOpen] = useState<string | null>(null);

<Menubar
  aria-label="Editor"
  value={open}
  onValueChange={(value, { reason, source }) => setOpen(value)}
  onBeforeValueChange={(event) => {
    if (event.value === 'admin' && !isAdmin) event.preventDefault();
  }}
  onAction={(event) => run(event.id)}
>
  …
</Menubar>
```

- `value` / `defaultValue` / `onValueChange` are the open top-level menu
  (`MenubarMenu value`, generated when omitted) or `null`; setting `value`
  opens or closes a menu.
- `onBeforeValueChange({ value, previousValue, reason, source })` is
  cancellable; reasons are `trigger`, `navigate` (arrow keys or the
  pointer moving across the bar), `escape`, `outside`, `action` and `tab`.
- `onAction(event)` reports chosen items of every menu and every
  `MenubarItem` (`event.id`, `event.source`); `event.preventDefault()`
  keeps the menu open. Together these cover opening, closing and choosing.

## Overflow

`overflow="scroll"` lets the bar scroll horizontally when its items do not
fit. Scroll indicators appear at the end that has more items
(`data-scroll-start` / `data-scroll-end` on the bar); they are
pointer-only and hidden from assistive technology, since the keyboard
scrolls the focused item into view. Their titles come from `localeText`
(`MENUBAR_DEFAULT_LOCALE_TEXT`: "Scroll backward", "Scroll forward").

## Vertical and hamburger layouts

The menubar is horizontal only: a vertical menubar is used for site
or app navigation, where the APG recommends a navigation landmark with links
or disclosures rather than `role="menubar"`. For vertical navigation use
links in a `SidebarPanel` or a `TreeView` with `getItemHref`; for a vertical
command list use an inline `Menu`, and for command menus a `MenuButton`.

Hamburger mode is a layout recipe:
building it into `Menubar` would add a second rendering of the items and a
breakpoint to every menubar. Render the same item data twice, as a
`Menubar` and as a `MenuButton` (with its own `aria-label`), and
let a container query decide which one is visible.

```tsx
const file = [{ id: 'new', label: 'New' }, { id: 'open', label: 'Open…' }];
const edit = [{ id: 'undo', label: 'Undo' }];

<div className="app-menu">
  <Menubar aria-label="App" className="app-menu-bar">
    <MenubarMenu label="File" items={file} />
    <MenubarMenu label="Edit" items={edit} />
  </Menubar>
  <MenuButton
    className="app-menu-hamburger"
    iconOnly
    aria-label="Menu"
    iconStart={<HamburgerIcon />}
    items={[
      { id: 'file', label: 'File', items: file },
      { id: 'edit', label: 'Edit', items: edit },
    ]}
  />
</div>
```

```css
.app-menu { container-type: inline-size; }
.app-menu-hamburger { display: none; }
@container (max-width: 480px) {
  .app-menu-bar { display: none; }
  .app-menu-hamburger { display: inline-flex; }
}
```

Both renderings are in the server markup, so hydration does not depend on
the width; `menu/styles.css` carries the Button rules of `MenuButton` too.

## Server rendering

The bar renders on the server and hydrates without warnings; it gets its
roving tab stop after hydration, and the menus mount on the client when
they open. `container` sets the element the menus portal into.

## API reference

`Menubar`, `MenubarMenu`, `MenubarItem`, `MENUBAR_DEFAULT_LOCALE_TEXT` and
the Menu family entries are in
[`@salmonui/buttons/menu`](/docs/reference/buttons/menu).
