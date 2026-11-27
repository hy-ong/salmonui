---
title: Menu Button and Menu
description: MenuButton opens a Menu of items, checkable items, groups, separators and submenus, with the APG menu button keyboard model, typeahead, RTL and lazy popups.
category: Menus
order: 20
demos: [menu-button, menu-items-data, menu-checkable, menu-open-state, menu-standalone-rtl, menu-long]
---

```tsx
import { MenuButton, MenuItem, MenuSeparator, Submenu } from '@salmonui/buttons/menu';
import '@salmonui/buttons/button/styles.css';
import '@salmonui/buttons/menu/styles.css';

<MenuButton
  onAction={(event) => console.log(event.id)}
  menu={
    <>
      <MenuItem id="new">New file</MenuItem>
      <MenuItem id="open">Open…</MenuItem>
      <MenuSeparator />
      <Submenu label="Export">
        <MenuItem id="pdf">PDF</MenuItem>
        <MenuItem id="csv">CSV</MenuItem>
      </Submenu>
    </>
  }
>
  File
</MenuButton>
```

`MenuButton` is a `Button` (same `tone`, `variant`, `size`, `iconStart`,
`iconEnd`, `iconOnly` and `disabled`) whose `children` are the
trigger content. A trailing chevron shows the open state;
`indicator` replaces it and `indicator={false}` hides it. While the
menu is open the trigger has `aria-expanded="true"`, `aria-controls` and
`data-open`. `ref` is the trigger `<button>`.

The menu content is either JSX in the `menu` prop or data in `items`.
JSX wins when both are given, with a development warning. `Menu`
renders the same list in place, without a button, with JSX
`children` or `items`.

<!-- demo: menu-button -->

## Items

| Component | Role | Notes |
| --- | --- | --- |
| `MenuItem` | `menuitem` | `id` (required, stable, reported in `onAction`, rendered as `data-item-id`), `icon`, `disabled`, `href` / `target` render `<a role="menuitem">`, `render` for router links, `textValue` for typeahead |
| `MenuCheckboxItem` | `menuitemcheckbox` | `checked` / `defaultChecked` / `onCheckedChange(checked, event)`; optional `id` for `onAction`, whose item handler runs after the toggle |
| `MenuRadioGroup` + `MenuRadioItem` | `group` + `menuitemradio` | `value` / `defaultValue` / `onValueChange(value, event)` and an optional visible `label` on the group; `value` per item (also its `onAction` id unless `id` is set) |
| `MenuGroup` | `group` | `label` is visible and names the group through `aria-labelledby` |
| `MenuSeparator` | `separator` | never focusable |
| `Submenu` | `menuitem` with `aria-haspopup="menu"` | `label`, `icon`, `disabled`, `textValue`; `menuClassName` / `menuStyle` style the nested popup; its children are the nested entries |

Item content is any `ReactNode`. The `items` form takes
`MenuItemData` entries: `{ id, label, icon, disabled, href, target, title,
textValue }`, `{ type: 'separator' }`, `{ type: 'group', label, items }`, and
an entry with `items` is a submenu; `renderItem(item)` customizes the content
of each entry. Router links use `render`, which receives every computed prop
(role, `tabIndex`, ARIA, handlers, a callback `ref`) and must spread them:

```tsx
<MenuItem id="settings" render={(props) => <Link {...props} to="/settings" />}>Settings</MenuItem>
```

Styling hooks: `.salmon-menu` on the popup, `.salmon-menu-item` with
`data-highlighted`, `data-disabled` and `data-checked`, `.salmon-menu-separator`,
`.salmon-menu-group`, `.salmon-menu-group-label`. `className` and
`style` reach each item; `classNames.menu` / `styles.menu` reach the popup,
whose default minimum width is the trigger width.

<!-- demo: menu-items-data -->

<!-- demo: menu-checkable -->

## Opening, closing and actions

- `open` / `defaultOpen` / `onOpenChange(open, event)`: the event has
  `reason` (`'trigger' | 'escape' | 'outside' | 'action' | 'tab'`) and
  `source` (`'pointer' | 'keyboard' | 'touch' | 'api'`). A controlled menu
  vetoes a change by not updating `open`, which
  is how you cancel opening or closing.
  `defaultOpen` applies after hydration, so server and client markup match.
- `onAction(event)` on `MenuButton` / `Menu`, and per item, fires for a
  chosen item at any level with `{ id, item, source }`. The item handler runs
  first. `event.preventDefault()` keeps the menu open, and on a link item it
  also stops navigation.
- `placement`: `'bottom-start'` (default), `'bottom-end'`, `'top-start'`,
  `'top-end'`; logical, so `start` is the right edge under `dir="rtl"`. The
  popup flips to the other side and shifts to stay in the viewport, and
  follows the trigger while the page scrolls.
- `submenuOpen`: `'hover'` (default; a submenu opens after the pointer rests
  on its item for `hoverDelay` ms, default 200) or `'click'`. The keyboard
  always opens submenus.
- The popup is portaled to the trigger's `document.body` (or `container`)
  and uses the browser top layer where supported. A closed menu renders no
  markup on the server or the client, whatever the item count.
- The menu closes on an item action, Escape, Tab, and a pointer press
  outside it (submenus count as inside). Other DOM events do not
  close it: drive the controlled `open` for that.

<!-- demo: menu-open-state -->

## Keyboard

| Key | On the trigger | In the menu |
| --- | --- | --- |
| Enter, Space, ArrowDown, Alt+ArrowDown | Open, focus the first item | Enter / Space activate the item and close; Space on a checkbox or radio item toggles and keeps the menu open |
| ArrowUp | Open, focus the last item | Previous item, wrapping |
| ArrowDown | | Next item, wrapping; separators and disabled items are skipped |
| Home / End | | First / last enabled item |
| Printable characters | | Typeahead: the next enabled item whose text starts with the typed characters (500 ms buffer, case and accent insensitive; a repeated letter cycles) |
| ArrowRight (ArrowLeft in RTL) | | Open the submenu and focus its first item |
| ArrowLeft (ArrowRight in RTL) | | Close the submenu, focus its item |
| Escape, Alt+ArrowUp | | Close the current level; focus returns to the trigger or the submenu item |
| Tab / Shift+Tab | | Close and move focus to the element after / before the trigger |

The pointer highlights the item under it. A submenu opens after the pointer
rests on its item for 200 ms (`hoverDelay`) and closes 200 ms after the
pointer rests on a sibling, so a diagonal move into the submenu keeps it open.
A click on a submenu item opens it at once.

## Standalone menus and RTL

`Menu` renders the same `role="menu"` list in place, with one tab stop and
the same keys, for menus that are always visible. It takes JSX
`children` or `items`, `renderItem`, `onAction`, `submenuOpen`,
`hoverDelay`, `className`, `style` and `aria-label` / `aria-labelledby`.
Under `dir="rtl"` the popup placement, the submenu side and the
ArrowLeft / ArrowRight submenu keys mirror.

<!-- demo: menu-standalone-rtl -->

## Accessibility

The trigger follows the APG Menu Button pattern (`aria-haspopup="menu"`,
`aria-expanded`, `aria-controls` while open). Its name comes from its
content; an `iconOnly` trigger needs `aria-label`. The popup itself
has `role="menu"` and is labelled by the trigger. Items are `menuitem`,
`menuitemcheckbox` or `menuitemradio` with `aria-checked`, inside `group`s.
Disabled items keep `aria-disabled="true"` and are
skipped by arrow keys and typeahead. When every item is disabled, the menu
itself takes focus so Escape and Tab still work.

## Performance

Menus are not virtualized. Focus, highlight, typeahead and hover
intent work on the DOM and in refs, so arrow keys and pointer moves never
re-render the items. Item labels are folded once per open, not per
keystroke. With 1,000 items, opening stays within 100 ms and each arrow or
typeahead keystroke within 8 ms. Long pickable
lists belong to the Listbox component.

<!-- demo: menu-long -->

## SSR

`MenuButton` and `SplitButton` render only their trigger on the server and
while closed, whatever the item count, and `defaultOpen` applies after
hydration; a standalone `Menu` renders its list on the server. Both
hydrate without warnings.

## Design notes

- The trigger has no icon-above-label layout; compose the content.
- For arbitrary popup content instead of menu items, use a
  [Popover](/docs/layout/popover): a `Popover.Trigger` rendering a `Button`
  and the content in `Popover.Content`, with dialog semantics instead of
  menu semantics.
- Opening and closing use one fixed CSS transition with no animation
  options. Customize item rendering with JSX or `renderItem`.
There are no imperative add, remove or toggle methods: change
  `items` or `open`.

## API reference

[`@salmonui/buttons/menu`](/docs/reference/buttons/menu): `MenuButton`, `Menu`,
`MenuItem`, `MenuCheckboxItem`, `MenuRadioGroup`, `MenuRadioItem`,
`MenuGroup`, `MenuSeparator`, `Submenu` and their types. The menu button
needs both `@salmonui/buttons/button/styles.css` and
`@salmonui/buttons/menu/styles.css`.
